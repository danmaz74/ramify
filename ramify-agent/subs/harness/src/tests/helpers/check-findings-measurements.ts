import type { CheckFindingEvent } from '../../../subs/check-findings/src/interfaces/check-findings.js';
import { replayCheckFindingEvents } from '../../../subs/check-findings/src/replay.js';
import { carriedCheckFindings, type RunEvent } from '../../run/log.js';
import type { RunPolicy } from '../../run/records.js';

/*
 * The measurements Plan 12 asks of a CheckFinding run, computed from its
 * log alone: the policy it captured, how long each review waited and ran,
 * how long a work item took from its first completion request to its
 * completion, what the CheckFindings were and how they were settled, the
 * reconciliation rounds and corrections, what a person was asked, and what
 * coverage is missing. Every count names its denominator.
 *
 * Times are the log's own timestamps, so a scripted run measures the
 * harness's overhead and the fake's, never a model's. The log holds no
 * token usage; a scripted fake reports none.
 */

export interface Spread {
  readonly n: number;
  readonly min: number | null;
  readonly median: number | null;
  readonly max: number | null;
}

function spread(values: readonly number[]): Spread {
  if (values.length === 0) return { n: 0, min: null, median: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { n: sorted.length, min: sorted[0]!, median: sorted[Math.floor((sorted.length - 1) / 2)]!, max: sorted.at(-1)! };
}

const time = (event: RunEvent) => Date.parse(event.at);
const increment = (counts: Record<string, number>, key: string) => { counts[key] = (counts[key] ?? 0) + 1; };

export function compositionMeasurements(events: readonly RunEvent[], context: { readonly policy?: RunPolicy | undefined } = {}) {
  const of = <T extends RunEvent['type']>(type: T) => events.filter((event): event is Extract<RunEvent, { type: T }> => event.type === type);

  // Reviews: each attempt's queue delay from its request, and its duration.
  const recorded = new Map(of('review-request-recorded').map(event => [event.data.request, event]));
  const started = new Map(of('review-attempt-started').map(event => [event.data.attempt, event]));
  const finished = of('review-attempt-finished');
  const queueDelay: number[] = [];
  const duration: number[] = [];
  for (const [attempt, start] of started) {
    const request = recorded.get(start.data.request);
    if (request !== undefined && attempt.endsWith('.a01')) queueDelay.push(time(start) - time(request));
    const end = finished.find(event => event.data.attempt === attempt);
    if (end !== undefined) duration.push(time(end) - time(start));
  }
  const settling = finished.filter(event => event.data.settles);
  const notVerified: Record<string, number> = {};
  for (const event of settling) if (event.data.result === 'not-verified') increment(notVerified, event.data.reason ?? 'unknown');
  const opened = new Map(of('session-opened').map(event => [event.data.session, event]));
  const degraded = new Set(of('invocation-ended').flatMap(event => (event.data.degraded === undefined ? [] : [event.data.invocation])));
  const starts: Record<string, number> = {};
  for (const start of started.values()) {
    const actual = start.data.requestedStart === 'fork' && !degraded.has(start.data.invocation) && opened.get(start.data.session)?.data.fork !== undefined ? 'fork' : 'fresh';
    increment(starts, `${start.data.requestedStart}->${actual}`);
  }
  const orientations = of('review-orientation-recorded');

  // Work items: from the first completion request to the completion.
  const workItems: Record<string, { readonly completionTailMs: number | null; readonly settleMs: number | null }> = {};
  for (const completed of of('work-item-completed')) {
    const item = completed.data.workItem;
    const request = of('outline-revised').find(event => event.data.workItem === item && event.data.architectRef !== undefined);
    const next = events.find(event => request !== undefined && event.sequence > request.sequence
      && ((event.type === 'reconciliation-started' && event.data.workItem === item) || (event.type === 'gate-attempted' && event.data.checkpoint === 'work-item')));
    workItems[item] = {
      completionTailMs: request === undefined ? null : time(completed) - time(request),
      settleMs: request === undefined || next === undefined ? null : time(next) - time(request),
    };
  }

  // CheckFindings, replayed from every carrier in log order.
  const carried: CheckFindingEvent[] = events.flatMap(event => [...carriedCheckFindings(event)]);
  const replayed = replayCheckFindingEvents(carried);
  if (!replayed.ok) throw new Error(`the log's CheckFinding events do not replay: ${replayed.rejection.message}`);
  const entries = [...replayed.state.findings.values()];
  const byRisk: Record<string, number> = {};
  const byCredibility: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  for (const entry of entries) {
    increment(byRisk, entry.risk);
    increment(byCredibility, entry.credibility);
    increment(byReason, `${entry.standing}:${entry.reason}`);
  }
  const waivers: Record<string, number> = {};
  const human = { requested: 0, answered: 0, userWaivers: 0, userRevocations: 0 };
  for (const event of carried) {
    if (event.type !== 'check-finding-decided') continue;
    const { actor, decision } = event.data.decision;
    if (decision.action === 'waive') increment(waivers, actor.kind === 'agent' ? `agent:${actor.role}` : actor.kind);
    if (decision.action === 'request-user-decision') human.requested += 1;
    if (decision.action === 'answer-user-decision') human.answered += 1;
    if (decision.action === 'waive' && actor.kind === 'user') human.userWaivers += 1;
    if (decision.action === 'revoke-waiver' && actor.kind === 'user') human.userRevocations += 1;
  }
  const unresolved = of('work-item-completed').flatMap(event => (event.data.unresolved ?? []).map(entry => ({
    workItem: event.data.workItem, checkFinding: entry.checkFinding, reason: entry.reason,
    risk: replayed.state.findings.get(entry.checkFinding)?.risk ?? null,
  })));

  // Rounds and corrections per work item.
  const rounds: Record<string, { rounds: number; corrections: number }> = {};
  for (const event of of('work-item-started')) rounds[event.data.workItem] ??= { rounds: 0, corrections: 0 };
  for (const event of of('reconciliation-started')) (rounds[event.data.workItem] ??= { rounds: 0, corrections: 0 }).rounds += 1;
  for (const event of of('reconciliation-assessed')) if (event.data.next === 'correct') (rounds[event.data.workItem] ??= { rounds: 0, corrections: 0 }).corrections += 1;

  return {
    policy: context.policy === undefined ? null : { reviews: context.policy.reviews ?? null, limits: context.policy.limits },
    reviews: {
      requests: recorded.size,
      attempts: finished.length,
      retries: finished.filter(event => !event.data.attempt.endsWith('.a01')).length,
      complete: settling.filter(event => event.data.result === 'complete').length,
      partial: settling.filter(event => event.data.result === 'partial').length,
      notVerified: settling.filter(event => event.data.result === 'not-verified').length,
      notVerifiedByReason: notVerified,
      queueDelayMs: spread(queueDelay),
      durationMs: spread(duration),
      starts,
      orientations: { recorded: orientations.length, oriented: orientations.filter(event => event.data.outcome === 'oriented').length },
      tokens: 'not in the log; the scripted fake reports no usage',
    },
    workItems,
    signals: {
      total: entries.length,
      reports: entries.reduce((sum, entry) => sum + entry.reports.length, 0),
      decisions: entries.reduce((sum, entry) => sum + entry.decisions.length, 0),
      byRisk,
      byCredibility,
      byStanding: byReason,
    },
    waivers,
    unresolved,
    rounds,
    humanDecisions: human,
    reconciliationRefusals: of('reconciliation-refused').length,
  };
}
