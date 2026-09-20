import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import {
  mapSubmissionSchema,
  type InputManifest,
  type MapSubmission,
  type ShapeValidation,
} from '../interfaces/map.js';
import type { ApiViewEvidence } from '../interfaces/protocol/jobs.js';
import type { BuiltinTool, JsonSchema, ToolDefinition } from '../../subs/agent/src/interfaces/port.js';
import { planPath } from '../plans/discover.js';

const run = promisify(execFile);

/** What a mapping job needs to know about its session, apart from what the job itself supplies. */
export interface MappingSessionPlan {
  readonly role: string;
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly builtinTools: readonly BuiltinTool[];
  readonly tools: readonly ToolDefinition[];
  readonly submission: { readonly name: string; readonly description: string; readonly inputSchema: JsonSchema };
}

export interface MappingContext {
  readonly projectRoot: string;
  readonly planId: string;
  /** The captured plan text. */
  readonly plan: string;
  readonly manifest: InputManifest;
}

/** How a job's procedure reports back to the job while its session runs. */
export interface MappingJobHooks {
  /** Records a requester's API views, which the procedure materialized for the agent, as evidence. */
  recordApiView(evidence: ApiViewEvidence): Promise<void>;
  /** The inputs changed during the job: the job fails as inputs changed and saves nothing. */
  inputsChanged(changes: readonly string[]): void;
}

/** One job's evidence side: its session, the validation of its submissions and the final check of its inputs. */
export interface MappingJob {
  readonly session: MappingSessionPlan;
  /** Judges a submission against its schema and the evidence this job gathered. */
  validate(submission: unknown): Promise<ShapeValidation<MapSubmission>>;
  /**
   * How the inputs now differ from the manifest; empty when unchanged. Throws
   * `EvidenceUnavailableError` when that cannot be established.
   */
  changes(): Promise<string[]>;
}

/**
 * The evidence side of mapping jobs: each job's input manifest, and a
 * per-job factory for the session, the validation and the final check of
 * the inputs. The job's lifecycle does not depend on how these are done.
 */
export interface MappingProcedure {
  /**
   * The input manifest of a job, given its captured plan, complete before
   * `job.json` is written. Throws `EvidenceUnavailableError` when the
   * evidence it names cannot be materialized.
   */
  capture(projectRoot: string, capturedPlan: Uint8Array): Promise<InputManifest>;
  /**
   * The job's own procedure, which keeps what the job gathered, such as the
   * API views it materialized. Throws `InputsChangedError` or
   * `EvidenceUnavailableError` when the job cannot start on its manifest.
   */
  forJob(context: MappingContext, hooks: MappingJobHooks): Promise<MappingJob>;
  /**
   * How the plan and the source now differ from a saved map's manifest;
   * empty when neither changed, so that the map may be approved. Throws
   * `EvidenceUnavailableError` when that cannot be established.
   */
  approvalChanges(projectRoot: string, planId: string, manifest: InputManifest): Promise<string[]>;
}

/** Ramify's views could not be materialized or read. */
export class EvidenceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceUnavailableError';
  }
}

/** The inputs changed before the job's session could start. */
export class InputsChangedError extends Error {
  constructor(readonly changes: readonly string[]) {
    super('The inputs changed during the job; nothing was saved');
    this.name = 'InputsChangedError';
  }
}

export const submissionToolName = 'submit_implementation_map';

/** The submission's JSON Schema, for agents and for the architect prompt. */
export const mapSubmissionJsonSchema = z.toJSONSchema(mapSubmissionSchema) as JsonSchema;

export function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Whether the plan still has the manifest's hash: an empty list, or why not. `since` ends the sentence that says so. */
export async function planChanges(projectRoot: string, planId: string, planHash: string, since = 'during the job'): Promise<string[]> {
  let current: string;
  try {
    current = sha256(await readFile(join(projectRoot, planPath(planId))));
  } catch (error) {
    return [`${planPath(planId)} cannot be read: ${error instanceof Error ? error.message : String(error)}`];
  }
  return current === planHash ? [] : [`${planPath(planId)} changed ${since}`];
}

/**
 * The checkout's commit and whether the project's files differ from it;
 * `null` outside git. Left out: `plans/`, which holds the plan with its own
 * hash and the harness's own records and saved maps, and Ramify's generated
 * views, which are not source.
 */
export async function sourceState(projectRoot: string): Promise<InputManifest['source']> {
  try {
    const { stdout: commit } = await run('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], { timeout: 10_000 });
    const { stdout: status } = await run('git', [
      '-C', projectRoot, 'status', '--porcelain', '--', '.',
      ':(exclude)plans', ':(exclude).ramify-architect', ':(exclude,glob)**/.ramify/**',
    ], { timeout: 30_000 });
    return { commit: commit.trim(), dirty: status.trim() !== '' };
  } catch {
    return null;
  }
}
