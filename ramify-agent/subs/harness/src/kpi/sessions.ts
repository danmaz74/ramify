import type { InvocationOutcome, LineEventSummary } from '../run/records.js';

/*
 * The session metrics of a run: which invocations were sessions, and what
 * each one changed.
 *
 * Every session counts, whatever ended it. A session that failed, one that
 * was stopped, one that repaired an earlier attempt, one that reached its
 * context budget and one that changed nothing are all sessions of the work
 * they belong to; only the change weight tells them apart. Dropping any of
 * them would flatter the cost of the work.
 *
 * It is a projection: it reads records and appends nothing.
 */

/** One session, as the run's records describe it. */
export interface SessionEntry {
  readonly invocation: string;
  readonly role: string;
  readonly ended: InvocationOutcome['ended'];
  readonly usage: InvocationOutcome['usage'];
  /** The line events of that invocation, where it was a writer. */
  readonly lines?: LineEventSummary | undefined;
}

export interface SessionMetrics {
  /** Every invocation that started a session, whatever ended it. */
  readonly sessions: number;
  /** Sessions that changed at least one path. */
  readonly withChange: number;
  /** Sessions that changed nothing. They still count as sessions. */
  readonly withoutChange: number;
  readonly added: number;
  readonly deleted: number;
  /** Tokens, where every session reported them; null as soon as one did not. */
  readonly tokens: number | null;
  /** Sessions whose usage the implementation could not report. */
  readonly usageUnavailable: number;
  readonly byEnd: Record<string, number>;
}

/** The session metrics of a set of invocations. It is a pure function of them. */
export function sessionMetrics(entries: readonly SessionEntry[]): SessionMetrics {
  const byEnd: Record<string, number> = {};
  let withChange = 0;
  let added = 0;
  let deleted = 0;
  let tokens: number | null = 0;
  let usageUnavailable = 0;

  for (const entry of entries) {
    byEnd[entry.ended] = (byEnd[entry.ended] ?? 0) + 1;
    const paths = entry.lines?.paths ?? [];
    if (paths.length > 0) withChange += 1;
    for (const path of paths) {
      added += path.added;
      deleted += path.deleted;
    }
    if ('unavailable' in entry.usage) {
      usageUnavailable += 1;
      tokens = null;
    } else if (tokens !== null) {
      tokens += entry.usage.total;
    }
  }

  return {
    sessions: entries.length,
    withChange,
    withoutChange: entries.length - withChange,
    added,
    deleted,
    tokens,
    usageUnavailable,
    byEnd,
  };
}
