import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { jobIdSchema, planIdSchema } from '../interfaces/protocol/ids.js';

/*
 * Where a job of a plan lives:
 *
 *   plans/<plan-id>/.harness/jobs/<job-id>/job.json    the job record; never rewritten
 *   .../input/plan.md                                  the captured plan
 *   .../events.jsonl                                   the canonical record
 *
 * An implementation run is the one kind of job, and `run/records.ts` holds
 * its record. What stays here is what a directory of jobs is, whatever a job
 * turns out to be: where it lives, how its ID is made and how a directory
 * whose record this harness does not support is reported rather than served.
 */

/**
 * The one `job.json` schema a job declares. Version 3 is the run log with
 * sessions: a run recorded before it is not served.
 */
export const jobSchemaVersion = 'ramify-agent.job/3';

/** The kinds of job a directory under `jobs/` can hold. */
export const jobKindSchema = z.enum(['implementation']);
export type JobKind = z.infer<typeof jobKindSchema>;

/** What every `job.json` declares, whatever its kind, before its kind's reader parses it. */
export const jobEnvelopeSchema = z.object({
  schema: z.literal(jobSchemaVersion),
  kind: jobKindSchema,
}).loose();

/** A plan's state directory, `plans/<plan-id>/.harness/`. */
export function planStateDirectory(projectRoot: string, planId: string): string {
  return join(projectRoot, 'plans', planId, '.harness');
}

export function jobsDirectory(projectRoot: string, planId: string): string {
  return join(planStateDirectory(projectRoot, planId), 'jobs');
}

/** A new job ID, ordered by creation time: `20260919T143211Z-3f9a1c`. */
export function newJobId(now: Date): string {
  return `${now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${randomBytes(3).toString('hex')}`;
}

/** What a `job.json` the current reader does not support declares as its schema. */
export function declaredSchemaOf(document: unknown): string {
  const declared = (document as { schema?: unknown } | null)?.schema;
  return typeof declared === 'string' && declared !== '' ? declared : 'no schema';
}

/** The JSON of one file, or null when it is absent or not JSON. */
export async function readJobDocument(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
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
