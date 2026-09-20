import { z } from 'zod';
import { mapApprovalSchema } from '../map.js';
import { jobIdSchema, planIdSchema } from './ids.js';

/*
 * Commands, receipts, job snapshots and events. A job's event log is its
 * canonical record: its version is the sequence number of its last event,
 * and its state, receipts and snapshot all derive from the log.
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

/** Starts a mapping job for a plan. It creates the job, so it expects version 0. */
export const startMappingCommandSchema = z.object({
  ...commandBase,
  type: z.literal('start-mapping'),
  payload: z.object({ planId: planIdSchema }).strict(),
}).strict();

/** Stops a running job; it expects the job's current version. */
export const stopJobCommandSchema = z.object({
  ...commandBase,
  type: z.literal('stop-job'),
  payload: z.object({ planId: planIdSchema, jobId: jobIdSchema }).strict(),
}).strict();

/**
 * Approves one saved map revision, named with the job that saved it; it
 * expects that job's version. Refused as `inputs-changed` when the plan or
 * the source differs from the map's manifest.
 */
export const approveMapCommandSchema = z.object({
  ...commandBase,
  type: z.literal('approve-map'),
  payload: z.object({ planId: planIdSchema, jobId: jobIdSchema, revision: z.int().positive() }).strict(),
}).strict();

/** `POST /api/v1/commands`: every command the harness understands. */
export const commandSchema = z.discriminatedUnion('type', [startMappingCommandSchema, stopJobCommandSchema, approveMapCommandSchema]);
export type Command = z.infer<typeof commandSchema>;
export type CommandType = Command['type'];

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

/** Why a job failed. */
export const failureReasonSchema = z.enum([
  /** The agent session crashed or could not start. */
  'agent-failed',
  /** The session ended without an accepted submission. */
  'no-submission',
  /** Every allowed submission was invalid. */
  'invalid-submission',
  /** The plan or the source changed during the job. */
  'inputs-changed',
  /** The reserved map revision holds a different map. */
  'revision-conflict',
  /** Ramify's views could not be materialized, so the evidence could not be established or checked. */
  'evidence-unavailable',
  /** A fault in the harness itself. */
  'internal',
]);
export type FailureReason = z.infer<typeof failureReasonSchema>;

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
  /** Any other tool call. */
  z.object({ kind: z.literal('tool'), callId: z.string(), tool: z.string() }).strict(),
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

const eventBase = {
  sequence: z.int().positive(),
  jobId: jobIdSchema,
  at: z.iso.datetime(),
};
const event = <T extends string, D extends z.ZodType>(type: T, data: D) => z.object({ ...eventBase, type: z.literal(type), data }).strict();

/** One line of a job's event log. */
export const jobEventSchema = z.discriminatedUnion('type', [
  /** The job's first event, holding the start command. */
  event('job-started', z.object({ command: acceptedCommandSchema }).strict()),
  event('activity', z.object({ activity: activitySchema }).strict()),
  /** The agent asked for a requester's API views and the harness materialized them. */
  event('api-view-materialized', apiViewEvidenceSchema),
  /** A submission that failed validation; its errors went back to the session. */
  event('submission-rejected', z.object({ attempt: z.int().positive(), errors: z.array(z.string()) }).strict()),
  event('submission-accepted', z.object({ attempt: z.int().positive() }).strict()),
  event('stop-requested', z.object({ command: acceptedCommandSchema }).strict()),
  /** Publication write 2: the validated map's hash and its reserved revision. */
  event('map-validated', z.object({ mapHash: z.string().min(1), revision: z.int().positive() }).strict()),
  event('job-completed', z.object({ revision: z.int().positive(), mapHash: z.string().min(1) }).strict()),
  event('job-failed', z.object({ reason: failureReasonSchema, message: z.string(), diagnostics: z.array(z.string()) }).strict()),
  /** `settled` says whether the session became idle within the harness's bound. */
  event('job-stopped', z.object({ settled: z.boolean() }).strict()),
  event('job-interrupted', z.object({ message: z.string() }).strict()),
  /**
   * The approval of the revision the job saved, holding the approve command
   * and the record written as `map/<revision>.approval.json`. The only event
   * that follows a terminal event, and only `job-completed`, at most once.
   */
  event('map-approved', z.object({ command: acceptedCommandSchema, approval: mapApprovalSchema }).strict()),
]);
export type JobEvent = z.infer<typeof jobEventSchema>;
export type JobEventType = JobEvent['type'];
export type JobEventOf<T extends JobEventType> = Extract<JobEvent, { type: T }>;

/** The event types that end a job. Only `map-approved` may follow one. */
export const terminalEventTypes = ['job-completed', 'job-failed', 'job-stopped', 'job-interrupted'] as const satisfies readonly JobEventType[];

/** A job as derived from its event log and its input manifest. */
export const jobSnapshotSchema = z.object({
  jobId: jobIdSchema,
  planId: planIdSchema,
  /** The agent implementation that ran it. */
  agent: z.string().min(1),
  version: jobVersionSchema,
  state: jobStateSchema,
  /** A stop was accepted and the job has not ended yet. */
  stopRequested: z.boolean(),
  startedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** When the terminal event was written; `null` while running. */
  endedAt: z.iso.datetime().nullable(),
  inputs: z.object({
    planHash: z.string().min(1),
    /** The project's checkout; `null` outside git. A dirty checkout's uncommitted changes are visible to the agent. */
    source: z.object({ commit: z.string().min(1), dirty: z.boolean() }).strict().nullable(),
    /** Whether the architect view's identity was materialized or is still a placeholder. */
    architectView: z.enum(['placeholder', 'materialized']),
  }).strict(),
  /** The reserved or published map revision. */
  revision: z.int().positive().nullable(),
  failure: z.object({ reason: failureReasonSchema, message: z.string() }).strict().nullable(),
  totals: z.object({
    filesRead: z.int().nonnegative(),
    searches: z.int().nonnegative(),
    rejectedSubmissions: z.int().nonnegative(),
    usage: usageSchema,
  }).strict(),
}).strict();
export type JobSnapshot = z.infer<typeof jobSnapshotSchema>;

/** `GET /api/v1/plans/:planId/jobs/:jobId`. */
export const jobResponseSchema = z.object({ job: jobSnapshotSchema }).strict();
export type JobResponse = z.infer<typeof jobResponseSchema>;

/** `GET /api/v1/plans/:planId/jobs`: the plan's mapping jobs, newest first. */
export const jobListResponseSchema = z.object({ jobs: z.array(jobSnapshotSchema) }).strict();
export type JobListResponse = z.infer<typeof jobListResponseSchema>;

/** `GET /api/v1/plans/:planId/jobs/:jobId/events?after=<cursor>`: the snapshot and the events after the cursor, in order. */
export const eventPageSchema = z.object({
  job: jobSnapshotSchema,
  events: z.array(jobEventSchema),
  /** The cursor for the next fetch: the last returned sequence, or the request's. */
  cursor: jobVersionSchema,
  /** More events follow the returned ones. */
  more: z.boolean(),
}).strict();
export type EventPage = z.infer<typeof eventPageSchema>;
