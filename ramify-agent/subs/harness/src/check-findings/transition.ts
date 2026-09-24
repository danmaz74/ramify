import { decideCheckFindingChange } from '../../subs/check-findings/src/decide.js';
import { applyCheckFindingEvent } from '../../subs/check-findings/src/replay.js';
import type {
  CheckFindingCommand, CheckFindingEvent, CheckFindingId, CheckFindingRejection, CheckFindingState,
} from '../../subs/check-findings/src/interfaces/check-findings.js';
import type { Transaction } from '../../subs/ledger/src/ledger.js';
import type { RecordRef as CommitRecord } from '../jobs/commit.js';
import type { Mutex } from '../jobs/mutex.js';
import type { CheckFindingCarrierType, RunEvent, RunEventInput, RunLog } from '../run/log.js';
import { checkFindingRecords, maximumCarriedEvents } from './records.js';
import { checkFindingStateOf } from './state.js';

/*
 * The one way a CheckFinding change reaches the run log (appendix §2.3).
 * Under the run mutex it refuses a terminal log, replays the current
 * CheckFinding state, lets the caller validate the basis its slow work
 * captured against the log as it now stands, asks the child to decide every
 * command in order, and appends the carrier event, its other records and
 * the CheckFinding record copies as one ledger line. An exact redelivery
 * appends nothing.
 *
 * Slow work (an agent's review, a check run, reading sources) happens before
 * this is called and never inside the mutex; what it captured is checked in
 * `build`, which must not wait on anything but the log.
 */

/** What the transition serializes on: a run's mutex and its log. The run service's `Run` is one. */
export interface CheckFindingTarget {
  readonly mutex: Mutex;
  readonly log: RunLog;
}

/** What `build` sees under the mutex: the log as it stands and the CheckFinding state replayed from it. */
export interface CheckFindingBasis {
  readonly log: RunLog;
  readonly state: CheckFindingState;
}

/** The input of a run event that carries CheckFinding events. */
export type CheckFindingCarrierInput = Extract<RunEventInput, { readonly type: CheckFindingCarrierType }>;

/** What one command of the transition led to. */
export interface CheckFindingOutcome {
  /** Every CheckFinding the command opened, attached a report to or changed; for a replay, the one it led to. */
  readonly touched: readonly CheckFindingId[];
  readonly replayed: boolean;
}

/** What the child decided for every command, in order. */
export interface CheckFindingDecided {
  readonly events: readonly CheckFindingEvent[];
  readonly outcomes: readonly CheckFindingOutcome[];
}

/** The carrier run event and every other record it commits, composed from what was decided. */
export interface CheckFindingComposition {
  readonly event: CheckFindingCarrierInput;
  readonly records?: readonly CommitRecord[] | undefined;
}

/** A transition to decide: its commands, and how the carrier is composed once they are decided. */
export interface CheckFindingPlan {
  readonly commands: readonly CheckFindingCommand[];
  /** Pure: it receives the decided events and outcomes and returns the carrier with its own records. */
  readonly compose: (decided: CheckFindingDecided) => CheckFindingComposition;
}

/**
 * Validates the captured basis against the log as it stands and returns the
 * plan, or why the basis no longer holds. Called under the mutex; it reads
 * and decides, and never performs slow work. A build that throws appends
 * nothing, and its error reaches the caller, as a refused command's does.
 */
export type CheckFindingBuild = (basis: CheckFindingBasis) => CheckFindingPlan | { readonly stale: string };

/** Why nothing was appended. */
export type CheckFindingRefusal =
  /** The log has its terminal event; nothing more is accepted. */
  | { readonly reason: 'run-ended'; readonly message: string }
  /** `build` found that its captured basis no longer holds. */
  | { readonly reason: 'stale-basis'; readonly message: string }
  /** The child refused command `command` (0-based). */
  | { readonly reason: 'check-finding'; readonly message: string; readonly command: number; readonly rejection: CheckFindingRejection }
  /** Some commands were exact replays and others new: one transition never commits half of an earlier one. */
  | { readonly reason: 'partial-replay'; readonly message: string }
  /** More events than one carrier holds. */
  | { readonly reason: 'too-many-events'; readonly message: string }
  /** The transaction would not fit one ledger line. */
  | { readonly reason: 'too-large'; readonly message: string };

/** What deciding a transition under a held mutex returned. */
export type CheckFindingTransaction =
  | { readonly kind: 'transaction'; readonly transaction: Transaction<RunEvent>; readonly decided: CheckFindingDecided }
  | { readonly kind: 'replayed'; readonly decided: CheckFindingDecided }
  | { readonly kind: 'refused'; readonly refusal: CheckFindingRefusal };

/** What committing a transition did. */
export type CheckFindingCommit =
  | { readonly kind: 'committed'; readonly event: RunEvent; readonly decided: CheckFindingDecided }
  | { readonly kind: 'replayed'; readonly decided: CheckFindingDecided }
  | { readonly kind: 'refused'; readonly refusal: CheckFindingRefusal };

/**
 * Decides one transition against the log as it stands, without appending.
 * The caller holds the run mutex and appends the returned transaction in
 * that same hold, as `commitCheckFindingChange` does; a ledger effect whose
 * completion carries CheckFinding events calls this from its `complete`.
 */
export function decideCheckFindingTransaction(log: RunLog, build: CheckFindingBuild, at?: Date): CheckFindingTransaction {
  const ended = log.terminal;
  if (ended !== undefined) return refused({ reason: 'run-ended', message: `Run ${log.runId} has ended with ${ended.type}; it accepts no CheckFinding change` });

  let state = checkFindingStateOf(log.ledger);
  const plan = build({ log, state });
  if ('stale' in plan) return refused({ reason: 'stale-basis', message: plan.stale });

  const events: CheckFindingEvent[] = [];
  const outcomes: CheckFindingOutcome[] = [];
  for (const [index, command] of plan.commands.entries()) {
    const change = decideCheckFindingChange(state, command);
    if (!change.ok) {
      return refused({ reason: 'check-finding', command: index, rejection: change.rejection, message: `Command ${index + 1} was refused (${change.rejection.code}): ${change.rejection.message}` });
    }
    for (const event of change.events) {
      const applied = applyCheckFindingEvent(state, event);
      // The child applies its own events while deciding; a refusal here is a defect, never a user error.
      if (!applied.ok) throw new Error(`The CheckFinding child returned an event it cannot apply: ${applied.rejection.message}`);
      state = applied.state;
    }
    events.push(...change.events);
    outcomes.push({ touched: change.touched, replayed: change.replayed });
  }
  const decided: CheckFindingDecided = { events, outcomes };

  const replays = outcomes.filter(outcome => outcome.replayed).length;
  if (replays > 0 && replays === outcomes.length) return { kind: 'replayed', decided };
  if (replays > 0) {
    return refused({ reason: 'partial-replay', message: `${replays} of ${outcomes.length} reports were already accepted; a transition commits all of its reports or none` });
  }
  if (events.length > maximumCarriedEvents) {
    return refused({ reason: 'too-many-events', message: `The transition decided ${events.length} CheckFinding events; one run event carries at most ${maximumCarriedEvents}` });
  }

  const composition = plan.compose(decided);
  const carried = (composition.event.data as { readonly checkFindings?: readonly CheckFindingEvent[] }).checkFindings ?? [];
  if (!sameEvents(carried, events)) throw new Error(`The ${composition.event.type} event does not carry exactly the decided CheckFinding events`);
  const event = log.carrier(composition.event, at);
  return {
    kind: 'transaction',
    transaction: { event, records: [...(composition.records ?? []), ...checkFindingRecords(events)] },
    decided,
  };
}

/**
 * Decides and commits one CheckFinding transition under the run mutex, as
 * one ledger line: the carrier event, its records and the CheckFinding
 * record copies, or nothing.
 */
export function commitCheckFindingChange(target: CheckFindingTarget, build: CheckFindingBuild, at?: Date): Promise<CheckFindingCommit> {
  return target.mutex.run(async () => {
    const decided = decideCheckFindingTransaction(target.log, build, at);
    if (decided.kind !== 'transaction') return decided;
    try {
      await target.log.ledger.append(decided.transaction);
    } catch (error) {
      // The ledger measures the line before writing any of it, so nothing was appended.
      if (error instanceof RangeError) return refused({ reason: 'too-large', message: error.message });
      throw error;
    }
    return { kind: 'committed', event: decided.transaction.event, decided: decided.decided };
  });
}

function refused(refusal: CheckFindingRefusal): { readonly kind: 'refused'; readonly refusal: CheckFindingRefusal } {
  return { kind: 'refused', refusal };
}

function sameEvents(a: readonly CheckFindingEvent[], b: readonly CheckFindingEvent[]): boolean {
  return a.length === b.length && a.every((event, index) => event === b[index] || JSON.stringify(event) === JSON.stringify(b[index]));
}
