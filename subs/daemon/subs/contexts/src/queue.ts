import type { SessionChange } from '../../../../analysis/src/interfaces/session.js';
import type { ProjectRequest } from '../../../../analysis/subs/project/src/interfaces/project.js';
import type { CheckOutcome, CheckRequest, ContextSetup, WatchBatch } from './interfaces/contexts.js';

export interface Invocation { readonly project: ProjectRequest; readonly setup: ContextSetup }
export interface PendingCheck {
  readonly request: CheckRequest;
  readonly lease: string;
  readonly acknowledged: number;
  readonly invocation: Invocation;
  readonly resolve: (outcome: CheckOutcome) => void;
  readonly revisionAtAcknowledgment: import('./interfaces/contexts.js').ContextRevision | null;
  readonly needsSweep: boolean;
  cleanup: () => void;
  settled: boolean;
  deadlineExpired: boolean;
}
export interface RunningCapture {
  readonly controller: AbortController;
  readonly requests: readonly PendingCheck[];
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
