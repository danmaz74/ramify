import type { SessionChange } from '../../../../analysis/src/interfaces/session.js';
import type { ProjectRequest } from '../../../../analysis/subs/project/src/interfaces/project.js';
import type { ApiViewRequest, CheckOutcome, CheckRequest, ContextApiViewOutcome, ContextRevision, ContextSetup, Unavailable, WatchBatch } from './interfaces/contexts.js';

export interface Invocation { readonly project: ProjectRequest; readonly setup: ContextSetup }
export interface PendingCheck {
  readonly kind: 'check';
  readonly request: CheckRequest;
  readonly lease: string;
  readonly acknowledged: number;
  readonly invocation: Invocation;
  readonly resolve: (outcome: CheckOutcome) => void;
  readonly revisionAtAcknowledgment: ContextRevision | null;
  readonly needsSweep: boolean;
  cleanup: () => void;
  settled: boolean;
  deadlineExpired: boolean;
}
/** A queued, serialized API-view request: the same rendezvous shape as
 * `PendingCheck`, batched and delivered alongside it in the same capture. */
export interface PendingApiView {
  readonly kind: 'apiView';
  readonly request: ApiViewRequest;
  readonly lease: string;
  readonly acknowledged: number;
  readonly invocation: Invocation;
  readonly resolve: (outcome: ContextApiViewOutcome) => void;
  readonly revisionAtAcknowledgment: ContextRevision | null;
  readonly needsSweep: boolean;
  cleanup: () => void;
  settled: boolean;
  deadlineExpired: boolean;
}
export type PendingEntry = PendingCheck | PendingApiView;
export interface RunningCapture {
  readonly controller: AbortController;
  readonly requests: readonly PendingEntry[];
  readonly changes: readonly SessionChange[];
  readonly background: boolean;
  /** A required sweep makes requests wait; a periodic sweep is maintenance. */
  readonly sweep: 'required' | 'periodic' | null;
  readonly started: number;
  /** Watcher batches the capture consumed; restored with its changes when cancelled. */
  readonly watch: WatchBatch | null;
}
/** The earliest receipt and latest flush of two batch spans. */
export function spanBatches(first: WatchBatch | null, second: WatchBatch | null): WatchBatch | null {
  if (!first || !second) return first ?? second;
  return { receivedAt: Math.min(first.receivedAt, second.receivedAt), flushedAt: Math.max(first.flushedAt, second.flushedAt) };
}

/** Project requests that resolve alike: their raw fields, as the resolver compares them. */
export function projectKey(project: ProjectRequest): string {
  return JSON.stringify([project.cwd, project.root ?? null, project.scope, project.configuration]);
}
export function invocationKey(value: Invocation): string {
  const { cwd, root, scope, configuration } = value.project;
  return JSON.stringify([cwd, root ?? null, scope, configuration, value.setup.registry, value.setup.capabilities]);
}
export function complete(entry: PendingCheck, outcome: CheckOutcome): void {
  if (entry.settled) return;
  entry.settled = true;
  entry.cleanup();
  entry.resolve(outcome);
}
export function completeApiView(entry: PendingApiView, outcome: ContextApiViewOutcome): void {
  if (entry.settled) return;
  entry.settled = true;
  entry.cleanup();
  entry.resolve(outcome);
}
/** Complete a mixed-kind entry with an outcome shape valid for both kinds:
 * cancellation or an `Unavailable` reason, the only two members every
 * `CheckOutcome` and `ContextApiViewOutcome` union shares. */
export function completeEntry(entry: PendingEntry,
  outcome: (Unavailable & { readonly requestId: string }) | { readonly status: 'cancelled'; readonly requestId: string }): void {
  if (entry.kind === 'check') complete(entry, outcome); else completeApiView(entry, outcome);
}
