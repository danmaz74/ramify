import { z } from 'zod';
import { sha256Schema } from './evidence.js';
import { roleSchema } from './runs.js';

/*
 * The transcript of one session, as the harness writes it: one JSON line per
 * entry, `transcripts/<session>.jsonl` in a run's directory and
 * `transcript.jsonl` in a standalone session's.
 *
 * Every entry has `n`, its number in the transcript, `at` and `type`, and
 * names the invocation it belongs to, or null for what the harness did
 * between invocations. Numbers start at 1, rise by one with each entry and
 * are never reused, so a reader's cursor is the last number it read. A
 * trailing line without its newline is an interrupted append, and a reader
 * discards it.
 *
 * Each block has a header, small and always shown, and a body, shown on
 * expansion. A body is inline, in the content store by its hash, or a file
 * of the same directory the harness already keeps, such as a shell call's
 * complete output. A transcript is raw output: no record, event or
 * observation quotes a body.
 *
 * Like every file beside it, it imports nothing but `zod` and its siblings,
 * so every export promises browser safety.
 */

const text = z.string().min(1);
const count = z.int().nonnegative();

/**
 * Where a body is. `bytes` is its UTF-8 size. A body in the content store
 * is `blobs/<hash>` beside the transcript's directory, and its `preview` is
 * its first line, shortened, so a header can be shown without it. A `file`
 * is a path relative to the transcript's directory, such as
 * `invocations/inv-0003/shell/001.log`; its size is null where it was not
 * known when the entry was written.
 */
export const transcriptBodySchema = z.discriminatedUnion('stored', [
  z.object({ stored: z.literal('inline'), text: z.string(), bytes: count }).strict(),
  z.object({ stored: z.literal('blob'), hash: sha256Schema, bytes: count, preview: z.string() }).strict(),
  z.object({ stored: z.literal('file'), path: text, bytes: count.nullable() }).strict(),
]);
export type TranscriptBody = z.infer<typeof transcriptBodySchema>;

/** The lines a read asks for: `start` is the first, counted from 1; null leaves either open. */
export const transcriptLineRangeSchema = z.object({ start: z.number().nullable(), count: z.number().nullable() }).strict();

/** What a tool call does, in the port's terms, as its call and `tool-started` carry it. */
export const transcriptToolActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('read'), path: z.string(), range: transcriptLineRangeSchema.nullable() }).strict(),
  z.object({ kind: z.literal('search'), pattern: z.string().nullable(), path: z.string().nullable(), glob: z.string().nullable() }).strict(),
  z.object({ kind: z.literal('write'), paths: z.array(z.string()) }).strict(),
  z.object({ kind: z.literal('command'), command: z.string().nullable() }).strict(),
  z.object({ kind: z.literal('harness') }).strict(),
  z.object({ kind: z.literal('other') }).strict(),
]);
export type TranscriptToolAction = z.infer<typeof transcriptToolActionSchema>;

/** How much of a model's thinking a block holds; `redacted` has an empty body. */
export const thinkingVisibilitySchema = z.enum(['full', 'summary', 'unmarked', 'redacted']);

const textBlock = z.object({ type: z.literal('text'), body: transcriptBodySchema }).strict();
const thinkingBlock = z.object({ type: z.literal('thinking'), visibility: thinkingVisibilitySchema, body: transcriptBodySchema }).strict();
/** A call's header is its tool and action; its body is the input, as JSON. */
const toolCallBlock = z.object({
  type: z.literal('tool-call'),
  callId: z.string(),
  tool: z.string(),
  action: transcriptToolActionSchema,
  input: transcriptBodySchema,
}).strict();
/** Content the port does not map, such as an image: described, never carried. */
const otherBlock = z.object({ type: z.literal('other'), kind: z.string(), description: z.string() }).strict();

/** What a user message or a tool result holds. */
export const transcriptContentBlockSchema = z.discriminatedUnion('type', [textBlock, otherBlock]);
export type TranscriptContentBlock = z.infer<typeof transcriptContentBlockSchema>;
/** What an assistant message holds. */
export const transcriptAssistantBlockSchema = z.discriminatedUnion('type', [textBlock, thinkingBlock, toolCallBlock, otherBlock]);
export type TranscriptAssistantBlock = z.infer<typeof transcriptAssistantBlockSchema>;

const tokens = z.object({ input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite: z.number(), total: z.number() }).strict();

/** An assistant message's optional detail. A field the executor did not report is null: absent, never zero. */
export const transcriptMessageDetailSchema = z.object({
  model: z.string().nullable(),
  thinkingLevel: z.string().nullable(),
  stopReason: z.enum(['end', 'tool-use', 'length', 'error', 'aborted', 'other']).nullable(),
  error: z.string().nullable(),
  reasoningTokens: z.number().nullable(),
  cost: tokens.nullable(),
  cacheWrites: z.object({ short: z.number(), long: z.number() }).strict().nullable(),
}).strict();
export type TranscriptMessageDetail = z.infer<typeof transcriptMessageDetailSchema>;

// Lineage, as the run log records it. A point names a session and the end of
// one of its invocations, or the sequence of one append to it.

export const transcriptPointSchema = z.union([
  z.object({ session: text, invocation: text }).strict(),
  z.object({ session: text, append: z.int().positive() }).strict(),
]);
export type TranscriptPoint = z.infer<typeof transcriptPointSchema>;

/** A continued start: the point it continues from, why, and the briefs appended since the previous invocation. */
export const transcriptContinuesSchema = z.object({
  from: transcriptPointSchema,
  reason: z.enum(['placement-answered', 'iteration-closed', 'completion-refused', 'repair', 'reconciliation', 'deviation-recorded', 'environment-resumed', 'context-selected', 'capability-qualification', 'capability-returned', 'capability-coordination']),
  briefs: z.array(text),
}).strict();
/** A forked start: the source point, why, the context generation where it forked the architect context, and the briefs held at the point. */
export const transcriptForkSchema = z.object({
  from: transcriptPointSchema,
  reason: z.enum(['placement-request', 'scope-review', 'design-orientation', 'reconciliation', 'unresolved-request', 'context-selection']),
  generation: z.int().positive().optional(),
  briefs: z.array(text),
}).strict();
/** The session a new one took the place of, and why. */
export const transcriptReplacesSchema = z.object({ session: text, reason: z.enum(['reconstructed', 'context-rebuilt']) }).strict();
/** The invocation whose result asked for a session, and why. */
export const transcriptRequestedBySchema = z.object({ invocation: text, reason: z.enum(['contract-needed', 'capability-needed']) }).strict();

/** The work an invocation belongs to, as the run log records it. */
export const transcriptWorkSchema = z.object({ workItem: text.optional(), iteration: text.optional(), request: text.optional(),
  capabilityTask: text.optional() }).strict();

/** A session start, in the port's terms: what was requested, and what an invocation's end says was actual. */
export const transcriptStartModeSchema = z.enum(['fresh', 'continue', 'fork']);

/** How an invocation ended, as its outcome records it. */
export const transcriptEndedSchema = z.enum(['submitted', 'ended', 'failed', 'stopped', 'context-budget-reached', 'invalid-submission']);
/** What interrupted it, where something did. */
export const transcriptInterruptionSchema = z.enum([
  'idle-timeout', 'absolute-timeout', 'provider-error', 'session-lost', 'adapter-fault', 'stopped-by-caller',
]);

/**
 * What the harness said or decided in a session, beside what the executor
 * reported. Each body is what the agent was told, or the log the harness
 * kept.
 */
const guardDenied = z.object({
  kind: z.literal('guard-denied'),
  callId: z.string(),
  tool: z.string(),
  verdict: z.enum(['blocked-scope', 'blocked-unresolved']),
  /** The target as the call named it, and why it was refused. */
  requested: z.string(),
  reason: z.string(),
  text: transcriptBodySchema,
}).strict();
/** One submission call judged: accepted, rejected with its errors, or refused with no further attempt. */
const submissionVerdict = z.object({
  kind: z.literal('submission-verdict'),
  callId: z.string(),
  tool: z.string(),
  verdict: z.enum(['accepted', 'rejected', 'refused']),
  /** The answer; null where an accepted call took the executor's own acknowledgement. */
  text: transcriptBodySchema.nullable(),
}).strict();
/**
 * The Ramify check after the mutating call named, or the fresh one a
 * claimed completion is judged against (`atCompletion`, with no call: the
 * submission verdict that follows is its call's). Each check's `log` is the
 * file the harness kept.
 */
const postWriteCheck = z.object({
  kind: z.literal('post-write-check'),
  callId: z.string().nullable(),
  atCompletion: z.boolean(),
  checks: z.array(z.object({
    paths: z.array(z.string()),
    mode: z.enum(['changed', 'complete']),
    outcome: z.enum(['passed', 'findings', 'not-checked']),
    reason: z.string().nullable(),
    newFindings: count,
    log: transcriptBodySchema.nullable(),
    /** The decoded provider document's schema and revision; null where none was decoded. */
    provider: z.object({ schema: z.string(), revision: z.string().nullable() }).strict().nullable(),
    /** Each named path's own analysis status, apart from the check's project verdict in `outcome`. */
    dispositions: z.array(z.object({
      path: z.string(),
      disposition: z.enum(['checked', 'not-analyzed', 'not-checked']),
      reason: z.string(),
      module: z.string().nullable(),
      exclusion: z.object({ kind: z.string(), directory: z.string(), owner: z.string().nullable() }).strict().nullable(),
      sha256: z.string().nullable(),
    }).strict()),
  }).strict()),
  /** What the call's result was told; null where it was told nothing. */
  text: transcriptBodySchema.nullable(),
}).strict();
/** A reminder that a read left the scope, carried by the result of the call named. */
const readReminder = z.object({ kind: z.literal('read-reminder'), callId: z.string().nullable(), text: transcriptBodySchema }).strict();
/** A placement brief appended to the architect context, without a model call. */
const briefAppended = z.object({
  kind: z.literal('brief-appended'),
  decision: text,
  generation: z.int().positive(),
  outcome: z.enum(['appended', 'already-present']),
  text: transcriptBodySchema,
}).strict();
/** Text appended to a kept session before it is continued, such as an engineer's next iteration. It is not a point. */
const noteAppended = z.object({ kind: z.literal('note-appended'), text: transcriptBodySchema }).strict();
/** The context budget was reached: the tools were withdrawn and one final response allowed. */
const budgetReached = z.object({
  kind: z.literal('budget-reached'),
  tokens: z.number().nullable(),
  threshold: z.number().nullable(),
  reportDelivered: z.boolean(),
}).strict();

export const transcriptHarnessDecisionSchema = z.discriminatedUnion('kind', [
  guardDenied, submissionVerdict, postWriteCheck, readReminder, briefAppended, noteAppended, budgetReached,
]);

const entry = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ n: z.int().positive(), at: z.iso.datetime(), type: z.literal(type), ...shape });
const ofInvocation = { invocation: text };

/**
 * An invocation's start, written before its session is started and so
 * before the model is called. A fork's first entry is its first
 * invocation's start, whose `fork` names the point it was forked from.
 */
const startedEntry = entry('started', {
  ...ofInvocation,
  role: roleSchema,
  work: transcriptWorkSchema,
  /** `opened` for the first invocation of the session, `continued` for one that joins it. */
  start: z.enum(['opened', 'continued']),
  requested: transcriptStartModeSchema,
  continues: transcriptContinuesSchema.nullable(),
  fork: transcriptForkSchema.nullable(),
  replaces: transcriptReplacesSchema.nullable(),
  requestedBy: transcriptRequestedBySchema.nullable(),
  executor: text,
  model: text.nullable(),
  systemPrompt: transcriptBodySchema,
  prompt: transcriptBodySchema,
}).strict();

/** Every message of the conversation, once it is complete, as the executor reported it. */
const messageEntry = z.discriminatedUnion('role', [
  entry('message', { ...ofInvocation, role: z.literal('user'), blocks: z.array(transcriptContentBlockSchema) }).strict(),
  entry('message', {
    ...ofInvocation,
    role: z.literal('assistant'),
    blocks: z.array(transcriptAssistantBlockSchema),
    usage: tokens.nullable(),
    detail: transcriptMessageDetailSchema,
  }).strict(),
  /**
   * A tool's result as the agent saw it. `output` is the complete output
   * where the harness keeps one, such as a shell call's log, of which the
   * agent saw only the tail.
   */
  entry('message', {
    ...ofInvocation,
    role: z.literal('tool-result'),
    callId: z.string(),
    tool: z.string(),
    isError: z.boolean(),
    blocks: z.array(transcriptContentBlockSchema),
    output: transcriptBodySchema.nullable(),
  }).strict(),
]);

const harnessEntry = entry('harness', { invocation: text.nullable(), decision: transcriptHarnessDecisionSchema }).strict();

const compactionReason = z.enum(['manual', 'threshold', 'overflow']);
const compactionEntry = z.discriminatedUnion('phase', [
  entry('compaction', { ...ofInvocation, phase: z.literal('started'), reason: compactionReason }).strict(),
  entry('compaction', {
    ...ofInvocation,
    phase: z.literal('ended'),
    reason: compactionReason,
    tokensBefore: z.number().nullable(),
    tokensAfter: z.number().nullable(),
    aborted: z.boolean(),
    errorText: z.string().nullable(),
  }).strict(),
]);

const retryEntry = z.discriminatedUnion('phase', [
  entry('retry', {
    ...ofInvocation,
    phase: z.literal('started'),
    attempt: z.number(),
    maxAttempts: z.number().nullable(),
    delayMs: z.number().nullable(),
    errorText: z.string().nullable(),
  }).strict(),
  entry('retry', { ...ofInvocation, phase: z.literal('ended'), attempt: z.number(), succeeded: z.boolean(), errorText: z.string().nullable() }).strict(),
]);

/**
 * A point other sessions may name: after an invocation's `ended`, and after
 * each append. The invocation is null for an append's.
 */
const pointEntry = entry('point', { invocation: text.nullable(), point: transcriptPointSchema }).strict();

/**
 * An invocation's end: how it ended, what interrupted it, its error, and
 * the start that was actual, null where its session never ran or its end
 * was recorded by recovery.
 */
const endedEntry = entry('ended', {
  ...ofInvocation,
  ended: transcriptEndedSchema,
  interruption: transcriptInterruptionSchema.nullable(),
  error: z.string().nullable(),
  actual: z.object({ mode: transcriptStartModeSchema, degradedReason: z.string().nullable() }).strict().nullable(),
}).strict();

/** One line of a transcript. */
export const transcriptEntrySchema = z.discriminatedUnion('type', [
  startedEntry, messageEntry, harnessEntry, compactionEntry, retryEntry, pointEntry, endedEntry,
]);
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>;
export type TranscriptEntryType = TranscriptEntry['type'];
export type TranscriptEntryOf<T extends TranscriptEntryType> = Extract<TranscriptEntry, { type: T }>;
export type TranscriptHarnessDecision = z.infer<typeof transcriptHarnessDecisionSchema>;
