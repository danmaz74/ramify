import { z } from 'zod';
import { jobIdSchema, planIdSchema } from './ids.js';

/*
 * What every job of the harness shares: its version, the shape of a command
 * that acts on one, the receipt that proves a command was accepted, the
 * states a job can be in and the activity and usage an invocation observes.
 *
 * A job's event log is its canonical record: its version is the sequence
 * number of its last event. The run's own events, its commands beyond the
 * stop and its projections are the run's, not this file's.
 */

/** A job's version: the sequence number of its last event, 0 before any. */
export const jobVersionSchema = z.int().nonnegative();

/** A client-chosen ID that makes a command safe to retry. */
export const commandIdSchema = z.string().min(1).max(200);

const commandBase = {
  commandId: commandIdSchema,
  /** The version of the job the command acts on. A command that creates a job expects 0. */
  expectedVersion: jobVersionSchema,
};

/** Stops a running job; it expects the job's current version. */
export const stopJobCommandSchema = z.object({
  ...commandBase,
  type: z.literal('stop-job'),
  payload: z.object({ planId: planIdSchema, jobId: jobIdSchema }).strict(),
}).strict();

/** Proof that a command was accepted, never a claim that its effect completed. */
export const receiptSchema = z.object({
  commandId: commandIdSchema,
  jobId: jobIdSchema,
  /** The sequence number of the event that records the acceptance. */
  sequence: z.int().positive(),
  acceptedAt: z.iso.datetime(),
}).strict();
export type Receipt = z.infer<typeof receiptSchema>;

/** The answer to a command: its receipt, the original one when the command is a retry. */
export const commandResponseSchema = z.object({ receipt: receiptSchema }).strict();
export type CommandResponse = z.infer<typeof commandResponseSchema>;

export const jobStateSchema = z.enum(['running', 'completed', 'failed', 'stopped', 'interrupted']);
export type JobState = z.infer<typeof jobStateSchema>;

/** An accepted command, as its event records it. */
export const acceptedCommandSchema = z.object({
  commandId: commandIdSchema,
  /** The SHA-256 of the command without its ID. */
  contentHash: z.string().min(1),
  receipt: receiptSchema,
}).strict();
export type AcceptedCommand = z.infer<typeof acceptedCommandSchema>;

/** Token usage reported for one model message. */
export const usageSchema = z.object({
  input: z.int().nonnegative(),
  output: z.int().nonnegative(),
  cacheRead: z.int().nonnegative(),
  cacheWrite: z.int().nonnegative(),
  total: z.int().nonnegative(),
}).strict();
export type Usage = z.infer<typeof usageSchema>;

/** Observed agent activity. Nothing here is estimated. */
export const activitySchema = z.discriminatedUnion('kind', [
  /** A file read; the path is resolved against the session's working directory. */
  z.object({ kind: z.literal('read'), callId: z.string(), path: z.string() }).strict(),
  /** A search or listing; `query` is the pattern or directory as requested. */
  z.object({ kind: z.literal('search'), callId: z.string(), tool: z.string(), query: z.string() }).strict(),
  /** Any other tool call; `command` is the command text where the tool ran one. */
  z.object({ kind: z.literal('tool'), callId: z.string(), tool: z.string(), command: z.string().optional() }).strict(),
  /** A tool call that returned an error to the agent. */
  z.object({ kind: z.literal('tool-error'), callId: z.string(), tool: z.string(), error: z.string() }).strict(),
  /** A model message, shortened, with its token usage when reported. */
  z.object({ kind: z.literal('message'), text: z.string(), usage: usageSchema.nullable() }).strict(),
]);
export type Activity = z.infer<typeof activitySchema>;

/** A requester's API views, as one materialization during the job produced them: evidence for availability. */
export const apiViewEvidenceSchema = z.object({
  /** The requesting module, by its declared-name path. */
  module: z.string().min(1),
  /** One entry per source area that has a view; empty when the module has no source area. */
  views: z.array(z.object({
    area: z.enum(['src', 'src/tests']),
    /** The view's directory, relative to the project root. */
    path: z.string().min(1),
    revision: z.string().min(1),
    /** Source-analysis limits the view reports; `null` when complete. */
    coverage: z.int().positive().nullable(),
  }).strict()),
}).strict();
export type ApiViewEvidence = z.infer<typeof apiViewEvidenceSchema>;
