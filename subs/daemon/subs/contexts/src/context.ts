import type { RetainedSession } from '../../../../analysis/src/interfaces/session.js';
import type { DependencyDiagramFacts } from '../../../../analysis/src/interfaces/dependency-diagram.js';
import type { ProjectRequest, ProjectResolution, ProjectScope } from '../../../../analysis/subs/project/src/interfaces/project.js';
import type { ContextEvent, ContextExplorerDetailsOutcome, ContextRevision, ContextSelection, ContextState, ContextToken, ExplorerDetailsRequest, RevisionId, SynchronizationState, WatchBatch, WatcherHandle } from './interfaces/contexts.js';
import type { RevisionHistory } from './history.js';
import type { Invocation, PendingEntry, RunningCapture } from './queue.js';

export interface ExplorerDetailDelivery {
  readonly request: ExplorerDetailsRequest;
  readonly lease: string;
  readonly controller: AbortController;
  readonly resolve: (outcome: ContextExplorerDetailsOutcome) => void;
  cleanup: () => void;
  settled: boolean;
}

/** The context's single retained dependency diagram, for its published revision only. */
export interface RetainedDiagram {
  readonly revision: RevisionId;
  readonly diagram: DependencyDiagramFacts;
  /** UTF-8 bytes of the diagram's JSON, counted in the context's retained bytes. */
  readonly bytes: number;
}

/** Live state stays owner-private; status and revision exports are detached data. */
export interface LiveContext {
  readonly token: ContextToken;
  readonly selection: ContextSelection;
  readonly project: ProjectRequest;
  readonly openedAt: number;
  readonly invocations: Map<string, Invocation>;
  /** Resolved project requests by `projectKey`, oldest first; reused on open only while a session is live. */
  readonly resolutions: Map<string, ProjectResolution>;
  readonly subscriptions: Map<string, { lease: string; listener: (event: ContextEvent) => void }>;
  history: RevisionHistory<ContextRevision>;
  readonly queue: PendingEntry[];
  readonly deliveries: Set<PendingEntry>;
  readonly explorerDeliveries: Set<ExplorerDetailDelivery>;
  /** Released on newer publication, eviction and close; demotion and cooling keep it. */
  diagram: RetainedDiagram | null;
  readonly paths: Map<string, 'changed' | 'created' | 'deleted' | 'unknown'>;
  /** Queued paths only synchronized requests named, with those requests. A watcher event,
   * a restored capture or a bound reset makes a path a known change and removes it. */
  readonly requested: Map<string, Set<PendingEntry>>;
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
  /** A sweep must run in the next capture. `'configuration'` while every requirement since the last
   * capture came from a configuration or manifest path event: an update in that capture that
   * reacquired the project satisfies it. Any other requirement writes `true`. */
  sweepRequired: boolean | 'configuration';
  /** An elapsed `sweepIntervalMs` is due; it never blocks coverage or marks reconciling. */
  periodicSweepDue: boolean;
  /** Start of the most recent sweep of either kind. */
  lastSweepAt: number;
  /** The revision sequence whose audit has been attempted, comparison or reported
   * unavailability alike: the daemon audits a revision at most once. */
  auditedSequence: number;
  auditRequired: boolean;
  /** The demotion in flight, bounded by `demoteDeadlineMs`. */
  demoting: Promise<void> | null;
  /** When a demotion passed its deadline without the session answering. */
  unresponsiveSince: number | null;
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
