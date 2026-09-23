import { z } from 'zod';
import { sha256Schema } from './evidence.js';
import { jobIdSchema, planIdSchema } from './ids.js';
import { jobVersionSchema } from './jobs.js';
import { invocationEvaluationSchema, roleSchema, runIdSchema } from './runs.js';
import {
  transcriptContinuesSchema, transcriptEndedSchema, transcriptEntrySchema, transcriptForkSchema, transcriptInterruptionSchema,
  transcriptPointSchema, transcriptReplacesSchema, transcriptRequestedBySchema, transcriptStartModeSchema, transcriptWorkSchema,
} from './transcripts.js';

/*
 * The session queries: every session of the project, a run's sessions with
 * their invocations, lineage and the diagram elements each reaches, a page
 * of one transcript, an update poll that follows several sessions of a run
 * at once, and a body on demand.
 *
 * Every answer is a projection of the run log, the standalone sessions'
 * records and the transcripts, which the harness writes and a query only
 * reads. A transcript's entries are the harness's own format, unchanged.
 *
 * Like every file beside it, it imports nothing but `zod` and its siblings,
 * so every export promises browser safety.
 */

const text = z.string().min(1);
const timestamp = z.iso.datetime();
const count = z.int().nonnegative();

/** The most each session query answers with. */
export const sessionQueryLimits = {
  /** Sessions of one page of the project's list. */
  sessions: 200,
  /** Sessions of one run's answer and of one poll's changed sessions. */
  runSessions: 500,
  /** Entries of one transcript page. */
  entries: 200,
  /**
   * Bytes of the entry lines of one transcript page, and of every page of
   * one poll together. A page holds at least one entry, so a larger entry
   * still arrives, alone.
   */
  pageBytes: 512 * 1024,
  /** Sessions one poll follows. */
  pollSessions: 50,
  /** Bytes of a body a client receives; the whole body stays a file of the run. */
  bodyBytes: 1024 * 1024,
} as const;

/** A run's session: `ses-0001`, `ses-0002`, and so on, in the order the run opened them. */
export const runSessionIdSchema = z.string().regex(/^ses-\d{4,}$/, 'A run session is ses- and at least four digits');
/** A standalone session keeps the identifier it was started with, such as `20260921T101500Z-a1b2c3`. */
export const standaloneSessionIdSchema = jobIdSchema;

/** Where a session is: one run's, or a standalone session of the project. */
export const sessionRefSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('run'), planId: planIdSchema, runId: runIdSchema, session: runSessionIdSchema }).strict(),
  z.object({ source: z.literal('standalone'), session: standaloneSessionIdSchema }).strict(),
]);
export type SessionRef = z.infer<typeof sessionRefSchema>;

/**
 * The state a reader shows. `live`, `suspended` and `finished` are the
 * run log's. `interrupted` is a session the log leaves live whose harness is
 * gone: one in a run that has ended, since the server drives every run it
 * serves that has not, or a standalone session without its outcome.
 */
export const sessionStateSchema = z.enum(['live', 'suspended', 'finished', 'interrupted']);
export type ShownSessionState = z.infer<typeof sessionStateSchema>;

/** Why the harness finished a session, as the run log records it. */
export const sessionFinishReasonSchema = z.enum(['work-closed', 'run-ended', 'lost', 'replaced', 'interrupted', 'not-kept']);
export type SessionFinishReasonView = z.infer<typeof sessionFinishReasonSchema>;

/**
 * The diagram elements a session reaches. The initial architect reaches the
 * run itself, which shows it at run level. A work item's session reaches its
 * capability and module; a global fork, its request's capability and work
 * item; a standalone session, its module. A value the records do not name
 * is null.
 */
export const sessionReachSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('run') }).strict(),
  z.object({ kind: z.literal('work-item'), workItem: text, capability: text.nullable(), module: text.nullable() }).strict(),
  z.object({ kind: z.literal('request'), request: text, workItem: text.nullable(), capability: text.nullable() }).strict(),
  z.object({ kind: z.literal('module'), module: text }).strict(),
]);
export type SessionReach = z.infer<typeof sessionReachSchema>;

/** One session of the project's list. */
export const sessionListEntrySchema = z.object({
  ref: sessionRefSchema,
  state: sessionStateSchema,
  /** The run log's reason once it finished; null otherwise, and for a standalone session, which records none. */
  finished: sessionFinishReasonSchema.nullable(),
  role: roleSchema,
  work: transcriptWorkSchema,
  /** The executor, by the agent port's name: the run log's `executor`, a standalone record's `agent`. */
  executor: text,
  /** The model the executor was asked for; null where it chose its own. */
  model: text.nullable(),
  invocations: count,
  reaches: sessionReachSchema,
  startedAt: timestamp,
  /** Its last change of state or history. */
  changedAt: timestamp,
}).strict();
export type SessionListEntry = z.infer<typeof sessionListEntrySchema>;

/** A run or standalone session the list cannot derive, and why: it is reported, never left absent. */
export const unservedSessionSourceSchema = z.object({
  source: z.enum(['run', 'standalone']),
  /** The run's directory or the standalone session's, relative to the project root. */
  path: text,
  message: text,
}).strict();
export type UnservedSessionSource = z.infer<typeof unservedSessionSourceSchema>;

/**
 * `GET /api/v1/sessions?offset=<n>`: every session of every run the harness
 * serves and every standalone session, live and suspended first by start,
 * newest first, then finished and interrupted by last change, newest first.
 * At most 200 from `offset`; the order is taken afresh by each request.
 */
export const sessionListResponseSchema = z.object({
  sessions: z.array(sessionListEntrySchema).max(sessionQueryLimits.sessions),
  total: count,
  offset: count,
  /** The offset of the next page; null on the last. */
  next: count.nullable(),
  unserved: z.array(unservedSessionSourceSchema),
}).strict();
export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;

/** Where a session's history changed: the event's sequence and time. */
export const sessionMomentSchema = z.object({ sequence: z.int().positive(), at: timestamp }).strict();
export type SessionMoment = z.infer<typeof sessionMomentSchema>;

/** A start the executor could not honor, recorded at the invocation's end. */
export const sessionDegradeSchema = z.object({
  requested: z.enum(['continue', 'fork']),
  actual: transcriptStartModeSchema,
  /** The executor's reason, where it gave one. */
  reason: z.string().nullable(),
}).strict();
export type SessionDegrade = z.infer<typeof sessionDegradeSchema>;

/** One invocation of a session: one segment of its conversation. */
export const sessionInvocationSchema = z.object({
  invocation: text,
  /** `opened` for the session's first invocation, `continued` for one that joins it. */
  start: z.enum(['opened', 'continued']),
  /** Its `invocation-started`. */
  started: sessionMomentSchema,
  /** Its `invocation-ended`; null while it is awaited, and where its harness was gone before it ended. */
  ended: sessionMomentSchema.nullable(),
  /** How it ended; null until it did. */
  outcome: transcriptEndedSchema.nullable(),
  /** Whether its end kept the session to use it again; null until it ended. */
  kept: z.boolean().nullable(),
  /** The point a continued start continues from, with its reason and the briefs appended since. */
  continues: transcriptContinuesSchema.nullable(),
  /** A start the executor made otherwise than requested. */
  degraded: sessionDegradeSchema.nullable(),
  /** The point its end is, which a later start may name; null until it ended. */
  point: transcriptPointSchema.nullable(),
  /**
   * What the Run page's evaluation shows for it: guarding, hook checks,
   * reads outside the scope, lines and tokens. Null where its invocation
   * record cannot be read.
   */
  evaluation: invocationEvaluationSchema.nullable(),
}).strict();
export type SessionInvocation = z.infer<typeof sessionInvocationSchema>;

/** A brief appended to a suspended session, between invocations, and the point it made. */
export const sessionAppendSchema = z.object({
  appended: sessionMomentSchema,
  decision: text,
  generation: z.int().positive(),
  outcome: z.enum(['appended', 'already-present']),
  point: transcriptPointSchema,
}).strict();
export type SessionAppend = z.infer<typeof sessionAppendSchema>;

/** A time the session was suspended: from an invocation's end that kept it to the next start or its finish; `until` is null while it lasts. */
export const sessionSuspensionSchema = z.object({ from: sessionMomentSchema, until: sessionMomentSchema.nullable() }).strict();
export type SessionSuspension = z.infer<typeof sessionSuspensionSchema>;

/** A session's relations to others, in both directions. */
export const sessionLineageSchema = z.object({
  /** The point it was forked from, where it was. */
  fork: transcriptForkSchema.nullable(),
  /** The session it took the place of, where it did. */
  replaces: transcriptReplacesSchema.nullable(),
  /** The session that took its place, where one did. */
  replacedBy: runSessionIdSchema.nullable(),
  /** The invocation whose result asked for it, with that invocation's session. */
  requestedBy: transcriptRequestedBySchema.extend({ session: runSessionIdSchema.nullable() }).strict().nullable(),
  /** The sessions its invocations asked for. */
  requested: z.array(runSessionIdSchema),
  /** The sessions forked from one of its points. */
  forks: z.array(runSessionIdSchema),
}).strict();
export type SessionLineage = z.infer<typeof sessionLineageSchema>;

/** One session of a run, as its log derives it. */
export const runSessionViewSchema = z.object({
  session: runSessionIdSchema,
  state: sessionStateSchema,
  finished: sessionFinishReasonSchema.nullable(),
  role: roleSchema,
  work: transcriptWorkSchema,
  executor: text,
  model: text.nullable(),
  reaches: sessionReachSchema,
  opened: sessionMomentSchema,
  changed: sessionMomentSchema,
  /** The invocation the harness awaits while it is live. */
  awaiting: text.nullable(),
  /** Its latest point: the end of its last invocation, or its last append since. */
  point: transcriptPointSchema.nullable(),
  invocations: z.array(sessionInvocationSchema),
  appends: z.array(sessionAppendSchema),
  suspended: z.array(sessionSuspensionSchema),
  lineage: sessionLineageSchema,
}).strict();
export type RunSessionView = z.infer<typeof runSessionViewSchema>;

/**
 * `GET /api/v1/plans/:planId/runs/:runId/sessions`: the run's sessions in
 * the order it opened them, at most 500, derived at one run version.
 */
export const runSessionsResponseSchema = z.object({
  /** The run version they were derived at: the sequence of its last event. A poll starts from it. */
  version: jobVersionSchema,
  sessions: z.array(runSessionViewSchema).max(sessionQueryLimits.runSessions),
  total: count,
}).strict();
export type RunSessionsResponse = z.infer<typeof runSessionsResponseSchema>;

/**
 * The entries of one transcript after a cursor. An entry's number is its
 * cursor: the next page asks for the entries after the last one it
 * received, and the answered cursor is never lower than the one asked for.
 */
export const transcriptPageSchema = z.object({
  /** `missing` where the session is known and its transcript file is not there; it has no entries. */
  file: z.enum(['present', 'missing']),
  entries: z.array(transcriptEntrySchema).max(sessionQueryLimits.entries),
  /** The last returned entry's number, or the request's cursor when none was returned. */
  cursor: count,
  /** More entries follow the returned ones. */
  more: z.boolean(),
  /** A trailing line without its newline was left unread: an append in progress, or one a crash interrupted. */
  partial: z.boolean(),
  /** Complete lines after the cursor that are not entries, by line number: skipped, never a reason to fail. */
  unreadable: z.array(z.int().positive()),
}).strict().refine(page => page.file === 'present' || (page.entries.length === 0 && !page.more), {
  message: 'A missing transcript has no entries',
  path: ['entries'],
});
export type TranscriptPage = z.infer<typeof transcriptPageSchema>;

/**
 * `GET /api/v1/plans/:planId/runs/:runId/sessions/:session/transcript?after=<n>`
 * and `GET /api/v1/sessions/standalone/:session/transcript?after=<n>`: at
 * most 200 entries after entry `n`, with their headers and inline bodies.
 */
export const sessionTranscriptResponseSchema = z.object({
  session: sessionRefSchema,
  page: transcriptPageSchema,
}).strict();
export type SessionTranscriptResponse = z.infer<typeof sessionTranscriptResponseSchema>;

/** One session a poll follows, and the entry it last received. */
export const sessionCursorSchema = z.object({ session: runSessionIdSchema, after: count }).strict();
export type SessionCursor = z.infer<typeof sessionCursorSchema>;

/**
 * `GET /api/v1/plans/:planId/runs/:runId/sessions/updates?version=<v>&cursors=<session>:<n>,…`:
 * for one run, every session whose state or history changed after run
 * version `v`, those opened since among them, and the newer entries of each
 * session the request follows, at most 50. A state committed before the
 * poll is in its answer.
 */
export const sessionUpdatesResponseSchema = z.object({
  /** The run version the sessions were derived at: the next poll's `version`. */
  version: jobVersionSchema,
  sessions: z.array(runSessionViewSchema).max(sessionQueryLimits.runSessions),
  /** One page per followed session, in the request's order. */
  transcripts: z.array(z.object({ session: runSessionIdSchema, page: transcriptPageSchema }).strict()).max(sessionQueryLimits.pollSessions),
}).strict();
export type SessionUpdatesResponse = z.infer<typeof sessionUpdatesResponseSchema>;

const utf8Bytes = (content: string): number => new TextEncoder().encode(content).byteLength;

/**
 * `GET …/bodies/:hash` and `GET …/sessions/:session/files?path=<path>`: one
 * body from the content store by its hash, or a file a session's
 * transcript names, such as a shell call's complete output. At most 1 MiB
 * of it; `bytes` is the whole body's size.
 */
export const sessionBodyResponseSchema = z.object({
  content: z.string().refine(content => utf8Bytes(content) <= sessionQueryLimits.bodyBytes, 'A body is at most 1 MiB'),
  bytes: count,
  /** Only the first 1 MiB was returned. */
  truncated: z.boolean(),
}).strict();
export type SessionBodyResponse = z.infer<typeof sessionBodyResponseSchema>;

/** A hash a body query names: the content store's key. */
export const sessionBodyHashSchema = sha256Schema;

/**
 * `GET /api/v1/sessions/standalone/:session`: one standalone session, its
 * prompt, how it ended, and its evaluation, which its transcript's one
 * chapter shows.
 */
export const standaloneSessionResponseSchema = z.object({
  session: sessionListEntrySchema,
  /** The person's prompt, which was the iteration's goal. */
  prompt: z.string(),
  /** How it ended; null for an interrupted session, which recorded no outcome. */
  outcome: z.object({
    ended: transcriptEndedSchema,
    interruption: transcriptInterruptionSchema.nullable(),
    error: z.string().nullable(),
    finishedAt: timestamp,
  }).strict().nullable(),
  evaluation: invocationEvaluationSchema,
}).strict();
export type StandaloneSessionResponse = z.infer<typeof standaloneSessionResponseSchema>;
