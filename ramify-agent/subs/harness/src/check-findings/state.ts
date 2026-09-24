import { emptyCheckFindingState, replayCheckFindingEvents } from '../../subs/check-findings/src/replay.js';
import type { CheckFindingState } from '../../subs/check-findings/src/interfaces/check-findings.js';
import type { LedgerEntry } from '../../subs/ledger/src/ledger.js';
import { carriedCheckFindings, type RunEvent } from '../run/log.js';

/*
 * The CheckFinding state of a run, replayed from the carriers of its log
 * alone: its CheckFindings, their standing and the ingestion and issue key
 * indexes. It is a projection, never an authority. A process that starts
 * holds none of it and replays it from the ledger the first time it is
 * asked; after that it applies only the lines appended since.
 */

/** What any replayable source of committed lines offers: the ledger or a projection's read of it. */
export interface CommittedLines {
  replay(): ReadonlyArray<LedgerEntry<RunEvent>>;
}

interface Cached {
  readonly sequence: number;
  readonly state: CheckFindingState;
}

const cache = new WeakMap<CommittedLines, Cached>();

/** Replays the CheckFinding state of these lines from the empty state. A log that does not replay is corrupt. */
export function replayCheckFindingState(entries: ReadonlyArray<LedgerEntry<RunEvent>>): CheckFindingState {
  return advance({ sequence: 0, state: emptyCheckFindingState() }, entries).state;
}

/**
 * The CheckFinding state of a ledger as it stands: replayed on first use,
 * then advanced by the lines appended since. Equal, line for line, to
 * `replayCheckFindingState` over the same log.
 */
export function checkFindingStateOf(ledger: CommittedLines): CheckFindingState {
  const entries = ledger.replay();
  const cached = cache.get(ledger) ?? { sequence: 0, state: emptyCheckFindingState() };
  const last = entries.at(-1)?.sequence ?? 0;
  if (cached.sequence === last) return cached.state;
  const advanced = advance(cached, entries);
  cache.set(ledger, advanced);
  return advanced.state;
}

function advance(from: Cached, entries: ReadonlyArray<LedgerEntry<RunEvent>>): Cached {
  const carried = entries
    .filter(entry => entry.sequence > from.sequence)
    .flatMap(entry => carriedCheckFindings(entry.transaction.event));
  const replayed = replayCheckFindingEvents(carried, from.state);
  if (!replayed.ok) {
    throw new Error(`The run log's CheckFinding events do not replay: ${replayed.rejection.message}`);
  }
  return { sequence: entries.at(-1)?.sequence ?? from.sequence, state: replayed.state };
}
