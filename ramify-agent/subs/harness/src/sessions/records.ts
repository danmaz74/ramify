import { join } from 'node:path';
import { z } from 'zod';
import { modulePathSchema, sha256Schema } from '../interfaces/protocol/evidence.js';
import { invocationOutcomeSchema } from '../run/records.js';
import { capabilityEngineerSubmissionKinds, engineerSubmissionKinds, engineerSubmissionSchema } from '../work/engineer.js';
import { testSelectionPolicySchema } from '../work/iterations.js';

/*
 * The records of one single engineer session, under
 * `plans/.harness/sessions/<session-id>/`.
 *
 * A session is not a job: it has no ledger, no run log and no events, and
 * nothing replays these files. They are plain files written once each. The
 * observation log and the transcript have the run's schemas, so the same
 * readers work on them. The session is its own one invocation, so its
 * identifier names both.
 */

const text = z.string().min(1);
const timestamp = z.iso.datetime();

/** The directory every session's records go under, relative to the project root. */
export const sessionsDirectory = join('plans', '.harness', 'sessions');

/** Where each record of one session lives, relative to its own directory. */
export const sessionLayout = {
  session: 'session.json',
  observations: 'observations.jsonl',
  submission: 'submission.json',
  outcome: 'outcome.json',
  /** The executor's own session record, such as pi's, which only it reads. */
  executorSession: 'session',
  /** The harness's transcript of the session: raw output, never a record. */
  transcript: 'transcript.jsonl',
  /** The content store the transcript names bodies in, `blobs/<sha256>`. */
  blobs: 'blobs',
  shellOutput: (call: number): string => join('shell', `${String(call).padStart(3, '0')}.log`),
  hookOutput: (check: number): string => join('hooks', `${String(check).padStart(3, '0')}.json`),
  gate: join('gate', 'attempt.json'),
  gateOutput: 'gate',
} as const;

/** What a session was started with, written before the agent starts. */
export const sessionRecordSchema = z.object({
  schema: z.literal('ramify-agent.session/2'),
  id: text,
  role: z.literal('engineer'),
  module: modulePathSchema,
  /** The module's project-relative directory; `''` for the root module. */
  directory: z.string(),
  /** The person's prompt, which is the iteration's goal. */
  prompt: text,
  /** The executor that runs it, by the agent port's name. */
  agent: text,
  /** The model the executor was asked to run; null where it chose its own. */
  model: text.nullable(),
  startedAt: timestamp,
  /** The commit the session started from; `''` outside git. */
  base: z.string(),
  /** What the session may write, project-relative: the module's own contents and each extra path. */
  scope: z.object({ roots: z.array(z.string()), files: z.array(z.string()), extra: z.array(text) }).strict(),
  /** The tests the scoped test tool and the gate resolve. */
  tests: testSelectionPolicySchema,
  gate: z.boolean(),
  /** The guarded files as they stood at the start, which a gate compares the tree with. */
  guarded: z.array(z.object({ path: text, hash: text }).strict()),
  views: z.array(z.object({
    module: text,
    views: z.array(z.object({ area: text, path: text, coverage: z.number().nullable() }).strict()),
    unavailable: z.string().nullable(),
  }).strict()),
  prompts: z.object({ package: text, hash: sha256Schema, inputsHash: sha256Schema }).strict(),
}).strict();
export type SessionRecord = z.infer<typeof sessionRecordSchema>;

/** An accepted submission, as `submission.json` holds it: the run's record of the same submission. */
export const sessionSubmissionSchema = z.intersection(
  z.object({ schema: z.literal('ramify-agent.engineer-submission/1') }),
  engineerSubmissionSchema,
);

/** A Ramify finding still standing when the session ended. */
const standingViolationSchema = z.object({
  code: text,
  message: z.string(),
  file: z.string().nullable(),
  line: z.int().nullable(),
}).strict();

/** How a session ended, and what was verified after it; written last, before the lock is released. */
export const sessionOutcomeSchema = z.object({
  schema: z.literal('ramify-agent.session-outcome/1'),
  session: text,
  ended: invocationOutcomeSchema.shape.ended,
  interruption: z.enum(['idle-timeout', 'absolute-timeout', 'stopped-by-caller', 'adapter-fault']).optional(),
  error: z.string().optional(),
  /** The accepted submission's kind and the hash of `submission.json`; null when none was accepted. */
  submission: z.object({ kind: z.enum([...new Set([...engineerSubmissionKinds, ...capabilityEngineerSubmissionKinds])]), hash: sha256Schema }).strict().nullable(),
  rejectedSubmissions: z.int().nonnegative(),
  standingViolations: z.array(standingViolationSchema),
  settled: invocationOutcomeSchema.shape.settled,
  /** Every uncommitted path when the session settled. */
  changed: z.array(z.string()),
  /** Those of them that were already uncommitted when it started. */
  alreadyChanged: z.array(z.string()),
  /** Changed paths outside the write scope: the shell's writes pass no guard. */
  outsideScope: z.array(z.string()),
  usage: invocationOutcomeSchema.shape.usage,
  elapsedMs: z.int().nonnegative(),
  /** The iteration checkpoint's verdict with the gate option, why it did not run, or null without it. */
  gate: z.union([
    z.object({
      attempt: text,
      verdict: z.enum(['passed', 'failed', 'not-verified']),
      cause: z.string().nullable(),
    }).strict(),
    z.object({ skipped: text }).strict(),
  ]).nullable(),
  finishedAt: timestamp,
}).strict();
export type SessionOutcomeRecord = z.infer<typeof sessionOutcomeSchema>;

/**
 * A standalone session's state, as a reader derives it from its records. It
 * holds the project lock for its whole life, so a reader that can read it
 * never sees it running: with its outcome it is finished, and without one it
 * was interrupted.
 */
export type StandaloneSessionState = 'finished' | 'interrupted';

export function standaloneSessionState(outcome: SessionOutcomeRecord | null): StandaloneSessionState {
  return outcome === null ? 'interrupted' : 'finished';
}
