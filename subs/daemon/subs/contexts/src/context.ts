import type { RetainedSession } from '../../../../analysis/src/interfaces/session.js';
import type { ProjectRequest, ProjectScope } from '../../../../analysis/subs/project/src/interfaces/project.js';
import type { ContextEvent, ContextRevision, ContextSelection, ContextState, ContextToken, SynchronizationState, WatchBatch, WatcherHandle } from './interfaces/contexts.js';
import type { RevisionHistory } from './history.js';
import type { Invocation, PendingCheck, RunningCapture } from './queue.js';

/** Live state stays owner-private; status and revision exports are detached data. */
export interface LiveContext {
  readonly token: ContextToken;
  readonly selection: ContextSelection;
  readonly project: ProjectRequest;
  readonly openedAt: number;
  readonly invocations: Map<string, Invocation>;
  readonly subscriptions: Map<string, { lease: string; listener: (event: ContextEvent) => void }>;
  history: RevisionHistory<ContextRevision>;
  readonly queue: PendingCheck[];
  readonly deliveries: Set<PendingCheck>;
  readonly paths: Map<string, 'changed' | 'created' | 'deleted' | 'unknown'>;
  /** Watcher batches behind `paths`: the earliest receipt and latest flush, until a capture consumes them. */
  watched: WatchBatch | null;
  lastActivityAt: number;
  hadLease: boolean;
  scope: ProjectScope | null;
  state: ContextState;
  synchronization: SynchronizationState;
  lastValid: ContextRevision | null;
  session: RetainedSession | null;
  publishedSession: RetainedSession | null;
  readonly versions: Set<number>;
  observedSequence: number;
  invocation: Invocation;
  sweepRequired: boolean;
  /** An elapsed `sweepIntervalMs` is due; it never blocks coverage or marks reconciling. */
  periodicSweepDue: boolean;
  /** Start of the most recent sweep of either kind. */
  lastSweepAt: number;
  auditedSequence: number;
  auditRequired: boolean;
  demoting: Promise<void> | null;
  cooling: boolean;
  sequence: number;
  watcher: WatcherHandle | null;
  watcherState: 'active' | 'unavailable' | 'disposed';
  attaching: boolean;
  conservative: boolean;
  /** Pending non-periodic work; a due periodic sweep is `periodicSweepDue`. */
  background: 'open' | 'request' | 'watch' | 'verify' | 'conservative' | null;
  running: RunningCapture | null;
  debounce: (() => void) | null;
  sweepTimer: (() => void) | null;
  auditTimer: (() => void) | null;
  idle: (() => void) | null;
}
