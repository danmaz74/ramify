import type { RetainedAnalysis } from '../../../../analysis/src/interfaces/analysis.js';
import type { ProjectRequest, ProjectScope } from '../../../../analysis/subs/project/src/interfaces/project.js';
import type { ContextEvent, ContextRevision, ContextSelection, ContextState, ContextToken, SynchronizationState, WatcherHandle } from './interfaces/contexts.js';
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
  readonly history: RevisionHistory<ContextRevision>;
  readonly queue: PendingCheck[];
  readonly paths: Map<string, 'changed' | 'created' | 'deleted' | 'unknown'>;
  lastActivityAt: number;
  hadLease: boolean;
  scope: ProjectScope | null;
  state: ContextState;
  synchronization: SynchronizationState;
  lastValid: ContextRevision | null;
  retained: RetainedAnalysis | null;
  sequence: number;
  watcher: WatcherHandle | null;
  watcherState: 'active' | 'unavailable' | 'disposed';
  attaching: boolean;
  conservative: boolean;
  background: 'open' | 'watch' | 'verify' | 'conservative' | null;
  running: RunningCapture | null;
  debounce: (() => void) | null;
  verification: (() => void) | null;
  idle: (() => void) | null;
}
