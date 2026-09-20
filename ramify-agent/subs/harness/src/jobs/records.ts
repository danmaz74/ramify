import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { inputManifestSchema } from '../interfaces/map.js';
import { jobIdSchema, planIdSchema } from '../interfaces/protocol/ids.js';
import { writeFileExclusive } from '../store/atomic.js';
import { ensureStateDirectory } from '../store/state-directory.js';

/*
 * The files of a job and of a plan's saved maps:
 *
 *   plans/<plan-id>/map/<revision>.json               immutable map content
 *   plans/<plan-id>/map/<revision>.approval.json      written on approval, never changed
 *   plans/<plan-id>/.harness/jobs/<job-id>/job.json    the input manifest; never rewritten
 *   .../input/plan.md                                  the captured plan
 *   .../events.jsonl                                   the canonical record
 *   .../output/map.json                                the validated submission, before publication
 *   .../session/                                       the agent's own session record
 */

/** `job.json`: what a job was started with. Written once, before the first event. */
export const jobRecordSchema = z.object({
  schema: z.literal('ramify-agent.job/1'),
  jobId: jobIdSchema,
  planId: planIdSchema,
  kind: z.literal('mapping'),
  /** The agent implementation, such as `scripted` or `pi`. */
  agent: z.string().min(1),
  createdAt: z.iso.datetime(),
  manifest: inputManifestSchema,
}).strict();
export type JobRecord = z.infer<typeof jobRecordSchema>;

export interface JobPaths {
  readonly directory: string;
  readonly record: string;
  readonly capturedPlan: string;
  readonly events: string;
  readonly output: string;
  readonly session: string;
}

/** A plan's state directory, `plans/<plan-id>/.harness/`. */
export function planStateDirectory(projectRoot: string, planId: string): string {
  return join(projectRoot, 'plans', planId, '.harness');
}

export function jobsDirectory(projectRoot: string, planId: string): string {
  return join(planStateDirectory(projectRoot, planId), 'jobs');
}

/**
 * Creates the plan's state directory and its map directory, each with the
 * marker that keeps it out of Ramify's inputs, where they are missing. Once
 * both exist, nothing the harness writes for the plan, its saved maps
 * included, changes the input identity a job or an approval is compared by.
 */
export async function ensurePlanDirectories(projectRoot: string, planId: string): Promise<void> {
  await ensureStateDirectory(planStateDirectory(projectRoot, planId));
  await ensureStateDirectory(mapDirectory(projectRoot, planId));
}

export function jobPaths(projectRoot: string, planId: string, jobId: string): JobPaths {
  const directory = join(jobsDirectory(projectRoot, planId), jobId);
  return {
    directory,
    record: join(directory, 'job.json'),
    capturedPlan: join(directory, 'input', 'plan.md'),
    events: join(directory, 'events.jsonl'),
    output: join(directory, 'output', 'map.json'),
    session: join(directory, 'session'),
  };
}

export function mapDirectory(projectRoot: string, planId: string): string {
  return join(projectRoot, 'plans', planId, 'map');
}

/** A revision's file name: `001.json`. */
export function revisionFileName(revision: number): string {
  return `${String(revision).padStart(3, '0')}.json`;
}

/** A revision's approval record's file name: `001.approval.json`. */
export function approvalFileName(revision: number): string {
  return `${String(revision).padStart(3, '0')}.approval.json`;
}

/** The highest saved revision of a plan's map, or `null` when none is saved. */
export async function highestRevision(projectRoot: string, planId: string): Promise<number | null> {
  let names: string[];
  try {
    names = await readdir(mapDirectory(projectRoot, planId));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw error;
  }
  let highest: number | null = null;
  for (const name of names) {
    const match = /^(\d+)\.json$/.exec(name);
    if (!match) continue;
    const revision = Number(match[1]);
    if (revision > 0 && (highest === null || revision > highest)) highest = revision;
  }
  return highest;
}

/** A new job ID, ordered by creation time: `20260919T143211Z-3f9a1c`. */
export function newJobId(now: Date): string {
  return `${now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${randomBytes(3).toString('hex')}`;
}

/**
 * Creates a job's directory with its captured plan and then its `job.json`,
 * each written once and never overwritten. The first event follows.
 */
export async function createJobFiles(paths: JobPaths, capturedPlan: Uint8Array, record: JobRecord): Promise<void> {
  await mkdir(join(paths.directory, 'input'), { recursive: true });
  await mkdir(join(paths.directory, 'output'), { recursive: true });
  await mkdir(paths.session, { recursive: true });
  if (await writeFileExclusive(paths.capturedPlan, capturedPlan) === 'exists') throw new Error(`${paths.capturedPlan} already exists`);
  if (await writeFileExclusive(paths.record, `${JSON.stringify(jobRecordSchema.parse(record), null, 2)}\n`) === 'exists') {
    throw new Error(`${paths.record} already exists`);
  }
}

/** A job's `job.json`, or `undefined` when it is missing: the job was never created. */
export async function readJobRecord(path: string): Promise<JobRecord | undefined> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  return jobRecordSchema.parse(JSON.parse(text));
}

/** Every job directory in the project, by plan. */
export async function listJobDirectories(projectRoot: string): Promise<Array<{ planId: string; jobId: string }>> {
  const found: Array<{ planId: string; jobId: string }> = [];
  let plans;
  try {
    plans = await readdir(join(projectRoot, 'plans'), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return found;
    throw error;
  }
  for (const plan of plans) {
    if (!plan.isDirectory() || !planIdSchema.safeParse(plan.name).success) continue;
    let jobs;
    try {
      jobs = await readdir(jobsDirectory(projectRoot, plan.name), { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') continue;
      throw error;
    }
    for (const job of jobs) {
      if (job.isDirectory() && jobIdSchema.safeParse(job.name).success) found.push({ planId: plan.name, jobId: job.name });
    }
  }
  return found;
}
