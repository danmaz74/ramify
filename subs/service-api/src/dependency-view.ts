import { randomUUID } from 'node:crypto';
import type { ServiceResult } from '../../../src/interfaces/service.js';
import type {
  ContextDependencyDiagramOutcome,
  ContextRevision,
  RevisionId,
} from '../../daemon/subs/contexts/src/interfaces/contexts.js';
import { createExplorerDependencyModel, maximumDependencyViewBytes } from './dependency-model.js';
import type { DependencyViewInput, DependencyViewResult, ExplorerDependencyModel } from './interfaces/explorer-dependencies.js';
import { unavailableReason, type ProjectBinding } from './project-binding.js';

/** A daemon `busy` answer is remembered this long as `waiting`, so polling starts at most one request per interval. */
export const dependencyBusyMemoryMs = 1000;

export interface DependencyViewsOptions {
  readonly binding: ProjectBinding;
  readonly requestId?: () => string;
  readonly now?: () => number;
  /** Encoded model limit; defaults to 16 MiB. */
  readonly maxBytes?: number;
}

export interface DependencyViewCounters {
  /** Daemon `dependencyDiagram` requests started. */
  readonly daemonRequests: number;
  /** In-flight daemon requests aborted: another revision, newer publication, eviction or close. */
  readonly aborted: number;
  /** Settled DTOs released: newer publication, eviction or close. */
  readonly released: number;
  readonly busyAnswers: number;
  readonly readyAnswers: number;
  readonly supersededAnswers: number;
  /** Daemon unavailable answers, service errors and mapping refusals. */
  readonly unavailableAnswers: number;
}

export interface DependencyViewsStatus {
  readonly closed: boolean;
  /** The revision of the one in-flight daemon request. */
  readonly inFlight: RevisionId | null;
  /** The one settled DTO, with its encoded size. */
  readonly settled: { readonly revision: RevisionId; readonly encodedBytes: number } | null;
  /** The revision whose `busy` answer is remembered, and when it was received. */
  readonly busy: { readonly revision: RevisionId; readonly at: number } | null;
  readonly counters: DependencyViewCounters;
}

/** One project binding's dependency-view state: at most one in-flight daemon request and one settled answer. */
export interface DependencyViews {
  view(input: DependencyViewInput): Promise<DependencyViewResult>;
  status(): DependencyViewsStatus;
  /** Abort the in-flight request, release the settled DTO and refuse later requests. */
  close(): void;
}

type Settled =
  | { readonly kind: 'ready'; readonly revision: ContextRevision; readonly view: ExplorerDependencyModel;
      readonly encodedBytes: number }
  | { readonly kind: 'superseded'; readonly revision: RevisionId; readonly current: RevisionId | null }
  | { readonly kind: 'unavailable'; readonly revision: RevisionId; readonly reason: string };

interface Flight {
  readonly revision: RevisionId;
  readonly controller: AbortController;
}

const revisionOf = (settled: Settled): RevisionId => settled.kind === 'ready' ? settled.revision.revision : settled.revision;
const reasonOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/**
 * Relay the browser's dependency requests to the daemon for one binding, following
 * the router table of Plan 6D: unavailable, superseded, ready, analyzing, waiting
 * and start. Holds no timer; the busy memory is compared on each request.
 */
export function createDependencyViews(options: DependencyViewsOptions): DependencyViews {
  const { binding } = options;
  const requestId = options.requestId ?? randomUUID;
  const now = options.now ?? Date.now;
  const maxBytes = options.maxBytes ?? maximumDependencyViewBytes;
  const counters = { daemonRequests: 0, aborted: 0, released: 0, busyAnswers: 0, readyAnswers: 0,
    supersededAnswers: 0, unavailableAnswers: 0 };
  let closed = false;
  let inFlight: Flight | null = null;
  let settled: Settled | null = null;
  let busy: { revision: RevisionId; at: number } | null = null;

  function abort(): void {
    if (!inFlight) return;
    const flight = inFlight;
    inFlight = null;
    counters.aborted++;
    flight.controller.abort();
  }
  function release(): void {
    if (settled?.kind === 'ready') counters.released++;
    settled = null;
  }
  /** Keep only state for `current`, the newest published revision; null keeps nothing. */
  function retainOnly(current: RevisionId | null): void {
    if (inFlight && inFlight.revision !== current) abort();
    if (settled && revisionOf(settled) !== current) release();
    if (busy && busy.revision !== current) busy = null;
  }

  const unobserve = binding.observe(event => {
    if (closed) return;
    if (event.type === 'revision-published') retainOnly(event.revision.revision);
    else if (event.type === 'context-evicted') retainOnly(null);
  });

  function settle(flight: Flight, result: ServiceResult<ContextDependencyDiagramOutcome> | { readonly thrown: unknown }): void {
    if (closed || inFlight !== flight) return;
    inFlight = null;
    const unavailable = (reason: string) => {
      counters.unavailableAnswers++;
      settled = { kind: 'unavailable', revision: flight.revision, reason };
    };
    if ('thrown' in result) { unavailable(reasonOf(result.thrown)); return; }
    if (!result.ok) { unavailable(result.error.message); return; }
    const outcome = result.value;
    switch (outcome.status) {
      case 'ready': {
        if (outcome.revision.revision !== flight.revision) {
          unavailable(`Dependency diagram answered revision ${outcome.revision.revision} for ${flight.revision}`);
          return;
        }
        const mapped = createExplorerDependencyModel({ revision: outcome.revision, diagram: outcome.diagram, maxBytes });
        if (mapped.status === 'refused') { unavailable(`${mapped.reason}: ${mapped.message}`); return; }
        counters.readyAnswers++;
        settled = { kind: 'ready', revision: outcome.revision, view: mapped.model, encodedBytes: mapped.encodedBytes };
        return;
      }
      case 'busy':
        counters.busyAnswers++;
        busy = { revision: flight.revision, at: now() };
        return;
      case 'superseded':
        counters.supersededAnswers++;
        settled = { kind: 'superseded', revision: flight.revision, current: outcome.revision?.revision ?? null };
        return;
      case 'unavailable':
        unavailable(`${outcome.reason}: ${outcome.message}`);
        return;
      case 'cancelled':
        // Not aborted here (an aborted flight is no longer current): the next request starts again.
        return;
    }
  }

  return {
    async view({ revision }) {
      if (closed) return { status: 'unavailable', reason: 'Explorer server closed' };
      const service = binding.service(), state = binding.state();
      if (!service || state.kind !== 'ready') return { status: 'unavailable', reason: unavailableReason(binding) };
      let status;
      try { status = await service.contextStatus({ token: state.token }); }
      catch (error) { return { status: 'unavailable', reason: reasonOf(error) }; }
      if (closed) return { status: 'unavailable', reason: 'Explorer server closed' };
      if (!status.ok) return { status: 'unavailable', reason: status.error.message };
      const published = status.value.published;
      retainOnly(published?.revision ?? null);
      if (!published || published.revision !== revision) {
        return { status: 'superseded', current: published?.revision ?? null,
          reason: 'The requested revision is no longer the published revision' };
      }
      if (settled && revisionOf(settled) === revision) {
        const answer = settled;
        if (answer.kind === 'ready' && answer.revision.fingerprints.inputId === answer.view.inputId
          && published.fingerprints.inputId === answer.view.inputId) {
          return { status: 'ready', revision: answer.revision, view: answer.view };
        }
        if (answer.kind === 'superseded') {
          return { status: 'superseded', current: answer.current, reason: 'The daemon answered that the revision is superseded' };
        }
        // A delivered failure is not retained, so a later explicit request retries.
        settled = null;
        if (answer.kind === 'unavailable') return { status: 'unavailable', reason: answer.reason };
        return { status: 'unavailable', reason: 'Dependency view input identity differs from the published revision' };
      }
      if (inFlight && inFlight.revision === revision) return { status: 'pending', revision: published, phase: 'analyzing' };
      if (busy && busy.revision === revision && now() - busy.at < dependencyBusyMemoryMs) {
        return { status: 'pending', revision: published, phase: 'waiting' };
      }
      busy = null;
      const flight: Flight = { revision, controller: new AbortController() };
      inFlight = flight;
      counters.daemonRequests++;
      service.dependencyDiagram({ token: state.token, requestId: requestId(), revision }, { signal: flight.controller.signal })
        .then(result => settle(flight, result), (error: unknown) => settle(flight, { thrown: error }));
      return { status: 'pending', revision: published, phase: 'analyzing' };
    },
    status() {
      return {
        closed,
        inFlight: inFlight?.revision ?? null,
        settled: settled?.kind === 'ready' ? { revision: settled.revision.revision, encodedBytes: settled.encodedBytes } : null,
        busy: busy ? { ...busy } : null,
        counters: { ...counters },
      };
    },
    close() {
      if (closed) return;
      closed = true;
      unobserve();
      abort();
      release();
      busy = null;
    },
  };
}
