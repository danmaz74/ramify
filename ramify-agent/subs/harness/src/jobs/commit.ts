import type { z } from 'zod';
import type { EffectSpec } from '../../subs/ledger/src/effects.js';
import type { Ledger, RecordRead } from '../../subs/ledger/src/ledger.js';

/*
 * The commit rule for a job's durable records, over `harness/ledger`. The
 * ledger knows how an append becomes durable, what a torn line is, how a
 * record file is rebuilt from the log and how an intent reaches its
 * completion; none of that is repeated here. What is here is what a job's
 * records require of it:
 *
 *   - a transition is one append that carries every record body it commits,
 *     and the append is the commit;
 *   - a transition already in the log is not appended again, and a record
 *     file that differs from its body in the log is rewritten from the log;
 *   - reading a record answers valid, unsupported version or invalid, never
 *     an absent record;
 *   - recovery is one loop over the log for every record kind, and calls no
 *     agent.
 *
 * A record is immutable: a change is a new revision in a new file, so a
 * transition is identified by its event type and the path, ID and revision
 * of every record it commits, and never by a body.
 */

/** Every event a transition commits under names its type. */
export interface CommittedEvent {
  readonly type: string;
}

/** One record a transition commits, and where the ledger materializes it. */
export interface RecordRef {
  /** Relative to the ledger's records root; a path that escapes it is refused. */
  readonly path: string;
  readonly id: string;
  readonly revision: number;
  readonly body: unknown;
}

/** One transition to commit: the event to append and every record it carries. */
export interface Commit<E extends CommittedEvent> {
  /** The event exactly as the log's schema defines it; its type names the transition. */
  readonly event: E;
  /** At least one record. A transition that commits none is an ordinary append. */
  readonly records: readonly RecordRef[];
}

/** Whether this call made the transition or found it already in the log. */
export type CommitOutcome = 'committed' | 'already-committed';

/** What a record file must declare for a reader to accept it. */
export interface CommittedSchema<T> {
  /** The one schema literal this reader supports, such as `ramify-agent.job/1`. */
  readonly schema: string;
  readonly body: z.ZodType<T>;
}

/** What recovery rewrote. */
export interface CommitRecovery {
  /** The record paths whose file was missing or differed from the log. */
  readonly rewritten: readonly string[];
}

/**
 * Commits one transition: one appended line holds the event and every record
 * body, and the ledger writes each record file as a materialized copy of it.
 * The append is the commit.
 *
 * A transition already in the log is not appended again; its record files are
 * rewritten from the log instead, so a repeat after a crash between the line
 * and its files leaves one line and correct files.
 */
export async function commitRecord<E extends CommittedEvent>(log: Ledger<E>, commit: Commit<E>): Promise<CommitOutcome> {
  if (commit.records.length === 0) {
    throw new TypeError(`The ${commit.event.type} transition commits no record; a transition without records is an ordinary append`);
  }
  if (committed(log, commit)) {
    await recoverCommits(log);
    return 'already-committed';
  }
  await log.append({ event: commit.event, records: commit.records });
  return 'committed';
}

/**
 * Reads one materialized record file: `valid`, `unsupported-version` with the
 * schema the file declares, or `invalid` with one message per error. The last
 * two are failures with evidence; a missing file is one of them and never an
 * absent record.
 */
export async function readCommitted<E, T>(log: Ledger<E>, path: string, schema: CommittedSchema<T>): Promise<RecordRead<T>> {
  return await log.readRecord(path, schema);
}

/**
 * Replays the log and rewrites every record file that is missing or differs
 * from its body in the log. It is one loop for every record kind and calls no
 * agent. Run twice, the second run rewrites nothing.
 */
export async function recoverCommits<E>(log: Ledger<E>): Promise<CommitRecovery> {
  return await log.materialize();
}

/**
 * Records an intent, performs one effect outside the harness with `key` as
 * its idempotency key, and records the completion with its result. A key
 * whose intent is already in the log gets no second intent, and a key whose
 * completion is in the log returns the recorded result and performs nothing:
 * calling this again on load is how an intent without a completion is
 * performed again.
 */
export async function effect<E, R>(log: Ledger<E>, spec: EffectSpec<E, R>): Promise<R> {
  return await log.effect(spec);
}

/** Whether the log already holds this transition. */
function committed<E extends CommittedEvent>(log: Ledger<E>, commit: Commit<E>): boolean {
  const wanted = identity(commit.event.type, commit.records);
  return log.replay().some(entry => identity(entry.transaction.event.type, entry.transaction.records) === wanted);
}

/** A transition's identity: its event type and the path, ID and revision of each record. */
function identity(type: string, records: readonly RecordRef[]): string {
  const committed = records.map(record => `${record.path}\u0000${record.id}\u0000${record.revision}`).sort();
  return JSON.stringify([type, committed]);
}
