import type { RunEvent } from '../run/log.js';
import type { ReviewKind, RunPolicy } from '../run/records.js';
import type { NotVerifiedReason } from './records.js';

/*
 * The reviews of one run as its log derives them: each request, its
 * attempts in order, and whether one settled it. A queued attempt is a
 * request with no settling attempt and none running; a running one has its
 * start and no finish. Nothing here reads a record file or a process's
 * memory, so a run just recovered and one that never stopped answer alike.
 */

export interface ReviewAttemptState {
  readonly id: string;
  /** The invocation and session of its reader, where one started. */
  readonly started: { readonly invocation: string; readonly session: string; readonly at: string } | null;
  readonly finished: {
    readonly result: 'complete' | 'partial' | 'not-verified';
    readonly reason: NotVerifiedReason | null;
    readonly settles: boolean;
    readonly at: string;
  } | null;
}

export interface ReviewRequestState {
  readonly id: string;
  readonly workItem: string;
  readonly iteration: string;
  readonly kind: ReviewKind;
  readonly gate: string;
  readonly candidate: string;
  readonly recordedAt: string;
  readonly attempts: readonly ReviewAttemptState[];
  /** The attempt that settled it; null while it is queued or running. */
  readonly settledBy: string | null;
}

/** Every review request of a run by ID, in the order they were recorded. */
export function reviewStateOf(events: readonly RunEvent[]): ReadonlyMap<string, ReviewRequestState> {
  const requests = new Map<string, ReviewRequestState>();
  const update = (id: string, change: (request: ReviewRequestState) => ReviewRequestState): void => {
    const request = requests.get(id);
    if (request !== undefined) requests.set(id, change(request));
  };
  const attempt = (request: ReviewRequestState, id: string): ReviewAttemptState =>
    request.attempts.find(entry => entry.id === id) ?? { id, started: null, finished: null };
  const withAttempt = (request: ReviewRequestState, next: ReviewAttemptState): ReviewRequestState => ({
    ...request,
    attempts: request.attempts.some(entry => entry.id === next.id)
      ? request.attempts.map(entry => (entry.id === next.id ? next : entry))
      : [...request.attempts, next],
  });
  for (const event of events) {
    switch (event.type) {
      case 'review-request-recorded':
        requests.set(event.data.request, {
          id: event.data.request, workItem: event.data.workItem, iteration: event.data.iteration, kind: event.data.kind,
          gate: event.data.gate, candidate: event.data.candidate, recordedAt: event.at, attempts: [], settledBy: null,
        });
        break;
      case 'review-attempt-started':
        update(event.data.request, request => withAttempt(request, {
          ...attempt(request, event.data.attempt),
          started: { invocation: event.data.invocation, session: event.data.session, at: event.at },
        }));
        break;
      case 'review-attempt-finished':
        update(event.data.request, request => ({
          ...withAttempt(request, {
            ...attempt(request, event.data.attempt),
            finished: { result: event.data.result, reason: event.data.reason, settles: event.data.settles, at: event.at },
          }),
          settledBy: event.data.settles ? event.data.attempt : request.settledBy,
        }));
        break;
      default:
        break;
    }
  }
  return requests;
}

/** The requests that still need an attempt, in the order they were recorded. */
export function unsettledRequests(events: readonly RunEvent[]): ReviewRequestState[] {
  return [...reviewStateOf(events).values()].filter(request => request.settledBy === null);
}

/**
 * A run's review coverage: how many requests each settled result covers and
 * how many are still pending. A run whose policy requests no reviews has
 * none to count, which is unavailable coverage, never a clean one.
 */
export type ReviewCoverage =
  | {
    readonly state: 'available';
    readonly requested: number;
    readonly complete: number;
    readonly partial: number;
    readonly notVerified: number;
    readonly pending: number;
  }
  | { readonly state: 'unavailable'; readonly reason: 'no-review-policy' };

export function reviewCoverage(policy: RunPolicy, events: readonly RunEvent[], workItem?: string): ReviewCoverage {
  if (policy.reviews === undefined) return { state: 'unavailable', reason: 'no-review-policy' };
  const requests = [...reviewStateOf(events).values()].filter(request => workItem === undefined || request.workItem === workItem);
  const settled = requests.map(request => request.attempts.find(entry => entry.id === request.settledBy)?.finished?.result ?? null);
  return {
    state: 'available',
    requested: requests.length,
    complete: settled.filter(result => result === 'complete').length,
    partial: settled.filter(result => result === 'partial').length,
    notVerified: settled.filter(result => result === 'not-verified').length,
    pending: settled.filter(result => result === null).length,
  };
}
