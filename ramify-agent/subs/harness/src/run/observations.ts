import { z } from 'zod';
import { appendJsonLine, readJsonLines } from '../../subs/ledger/src/jsonl.js';
import { usageSchema } from './records.js';

/*
 * The observation log of one invocation, `invocations/<id>/observations.jsonl`.
 * It is canonical for what was observed and nothing else: no state of the run
 * derives from it, so it does not go through the ledger. The harness appends
 * to it with the ledger's line primitive and its torn-line handling, without
 * a transaction or a flush per line. A crash can lose the last observations
 * of an invocation it interrupted anyway, which the KPIs report as a
 * coverage gap.
 *
 * Only the harness writes it. A replayed `(invocation, callId, type)` is
 * dropped, so replay counts once and a new tool call counts again.
 */

const text = z.string().min(1);

/** The activity of Plan 1, as a run observes it. */
const activitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('read'), callId: z.string(), path: z.string() }).strict(),
  z.object({ kind: z.literal('search'), callId: z.string(), tool: z.string(), query: z.string() }).strict(),
  z.object({ kind: z.literal('tool'), callId: z.string(), tool: z.string(), command: z.string().optional() }).strict(),
  z.object({ kind: z.literal('tool-error'), callId: z.string(), tool: z.string(), error: z.string() }).strict(),
  z.object({ kind: z.literal('message'), text: z.string(), usage: usageSchema.nullable() }).strict(),
]);

const observation = <T extends string, D extends z.ZodType>(type: T, data: D) =>
  z.object({ n: z.int().positive(), at: z.iso.datetime(), type: z.literal(type), data }).strict();

/** One line of an observation log. */
export const observationSchema = z.discriminatedUnion('type', [
  observation('activity', z.object({ activity: activitySchema }).strict()),
  /** The input itself is never stored: it may hold file contents. */
  observation('rejection', z.object({
    callId: z.string(),
    target: text,
    attempt: z.int().positive(),
    errors: z.array(z.object({ path: z.string(), message: z.string() }).strict()),
  }).strict()),
  /** Never file contents: what was asked for, what it resolved to, and the verdict. */
  observation('guard', z.object({
    callId: z.string(),
    tool: text,
    requested: z.string(),
    resolved: z.string().nullable(),
    owner: z.string().nullable(),
    scopeRevision: z.int().nonnegative().nullable(),
    verdict: z.enum(['allowed', 'blocked-scope', 'blocked-unresolved']),
    reason: z.string(),
  }).strict()),
  observation('mutation', z.object({
    callId: z.string().nullable(),
    paths: z.array(z.string()),
    added: z.int().nonnegative().nullable(),
    deleted: z.int().nonnegative().nullable(),
    observedBy: z.enum(['tool', 'snapshot']),
    toolFailed: z.boolean(),
    attributable: z.boolean(),
  }).strict()),
  observation('hook-check', z.object({
    paths: z.array(z.string()),
    mode: z.enum(['changed', 'complete']),
    outcome: z.enum(['passed', 'findings', 'not-checked']),
    reason: z.string().nullable(),
    newFindings: z.int().nonnegative(),
    log: z.string().nullable(),
    /**
     * Set on the fresh check a claimed completion is judged against, which
     * covers the write scope rather than one mutation's paths. Absent on the
     * check that follows a settled mutation.
     */
    atCompletion: z.boolean().optional(),
  }).strict()),
  observation('excursion', z.object({ callId: z.string(), module: z.string(), firstEntry: z.boolean() }).strict()),
  /**
   * One diagnostic run of the assignment's own tests, asked for by the
   * engineer. The selection is resolved anew from the tree on every call, so
   * this is where the files of that call are recorded; a gate attempt records
   * its own.
   */
  observation('scope-tests', z.object({
    callId: z.string(),
    resolved: z.array(z.string()),
    outcome: z.enum(['passed', 'failed', 'not-verified']),
    notVerified: z.string().nullable(),
    exitCode: z.int().nullable(),
    elapsedMs: z.int().nonnegative(),
    /**
     * The scenario check the call ran beside the tests, where the run tracks
     * scenarios: the ones it selected, the ones that passed, and how many
     * reasons it did not pass.
     */
    scenarios: z.object({
      selected: z.array(z.string()),
      passed: z.array(z.string()),
      failures: z.int().nonnegative(),
    }).strict().optional(),
  }).strict()),
  /** Always an estimate; `tokens: null` is unknown and never room. */
  observation('context', z.object({
    tokens: z.number().nullable(),
    window: z.number().nullable(),
    threshold: z.number().nullable(),
  }).strict()),
  observation('compaction', z.object({
    trigger: z.enum(['threshold', 'overflow', 'explicit']),
    succeeded: z.boolean(),
    before: z.number().nullable(),
    after: z.number().nullable(),
  }).strict()),
  observation('coverage-gap', z.object({
    kind: z.enum([
      'unguarded-shell', 'changed-paths-unknown', 'usage-unavailable', 'context-unavailable',
      'observation-truncated',
      /** A suite of the project that the MVP's one supported runner does not select. */
      'unsupported-runner',
    ]),
    detail: z.string(),
  }).strict()),
]);
export type Observation = z.infer<typeof observationSchema>;
export type ObservationType = Observation['type'];
export type ObservationOf<T extends ObservationType> = Extract<Observation, { type: T }>;

/** An observation to record: its type, its data, and the call it belongs to where it has one. */
export type ObservationInput = { [T in ObservationType]: { readonly type: T; readonly data: ObservationOf<T>['data'] } }[ObservationType];

/** The identity a replay is recognized by: one call, one type, once. */
function keyOf(input: ObservationInput): string | undefined {
  const data = input.data as { callId?: unknown };
  return typeof data.callId === 'string' && data.callId !== '' ? `${data.callId}\u0000${input.type}` : undefined;
}

/**
 * One invocation's observation log. `open` reads what is already there, so a
 * restart that observes the same tool call again drops it rather than
 * counting it twice.
 */
export class ObservationLog {
  private constructor(
    readonly path: string,
    private readonly seen: Set<string>,
    private readonly list: Observation[],
    private dropped: number,
  ) {}

  static async open(path: string): Promise<ObservationLog> {
    const loaded = await readJsonLines(path);
    const list: Observation[] = [];
    const seen = new Set<string>();
    for (const line of loaded.records) {
      const parsed = observationSchema.safeParse(line);
      if (!parsed.success) continue;
      list.push(parsed.data);
      const key = keyOf(parsed.data as ObservationInput);
      if (key !== undefined) seen.add(key);
    }
    return new ObservationLog(path, seen, list, 0);
  }

  get observations(): readonly Observation[] {
    return this.list;
  }

  /** How many replayed observations were dropped, which the coverage figures state. */
  get replays(): number {
    return this.dropped;
  }

  count(type: ObservationType): number {
    return this.list.reduce((total, current) => (current.type === type ? total + 1 : total), 0);
  }

  /**
   * Appends one observation, unless its `(callId, type)` is already in the
   * log. Answers whether it was written.
   */
  async record(input: ObservationInput, at: Date = new Date()): Promise<boolean> {
    const key = keyOf(input);
    if (key !== undefined && this.seen.has(key)) {
      this.dropped += 1;
      return false;
    }
    const line = observationSchema.parse({ n: this.list.length + 1, at: at.toISOString(), type: input.type, data: input.data });
    await appendJsonLine(this.path, line);
    this.list.push(line);
    if (key !== undefined) this.seen.add(key);
    return true;
  }
}
