import type { RetainedSession, SessionRevision } from '../../../../analysis/src/interfaces/session.js';
import type { DependencyDiagramFacts, TestReferenceFacts } from '../../../../analysis/src/interfaces/dependency-diagram.js';
import type { ProjectRequest, ProjectResolution, ProjectScope } from '../../../../analysis/subs/project/src/interfaces/project.js';
import type { ContextEvent, ContextExplorerDetailsOutcome, ContextRevision, ContextSelection, ContextState, ContextToken, ExplorerDetailsRequest, RevisionId, SynchronizationState, WatchBatch, WatcherHandle, WatchScope } from './interfaces/contexts.js';
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

/** The context's single retained dependency diagram, for its published revision only,
 * with the test references of the same analyzer run. */
export interface RetainedDiagram {
  readonly revision: RevisionId;
  readonly diagram: DependencyDiagramFacts;
  /** Null when the analyzer refused them, or when retaining them would exceed a budget the diagram alone meets. */
  readonly testReferences: TestReferenceFacts | null;
  /** UTF-8 bytes of the diagram's and the references' JSON, counted in the context's retained bytes. */
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
  /** The ownership scope of the latest published revision whose analysis completed; it
   * classifies a changed check's paths at that revision and at any later invalid one. */
  scope: ProjectScope | null;
  /** The session revision behind the published revision while the session lives; the
   * next publication compares its analysis inputs with it to record removals. */
  publishedData: SessionRevision | null;
  /** Analysis inputs a later published revision no longer holds, by path, with the
   * sequence that removed them: a named absent path among them is checked by its
   * deletion. Bounded by `maxQueuedPaths`, oldest first. */
  readonly removed: Map<string, number>;
  state: ContextState;
  synchronization: SynchronizationState;
  lastValid: ContextRevision | null;
  session: RetainedSession | null;
  publishedSession: RetainedSession | null;
  /** The project request the live session was opened with. A session captures every input with
   * it; a later invocation changes only the request its reports echo. */
  sessionProject: ProjectRequest | null;
  /** The request the published revision's inputs were captured with: its session's
   * `sessionProject` when it was published. The dependency analyzer acquires with it. */
  publishedProject: ProjectRequest | null;
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
  /** The selection's scope with an empty ownership table: before a completed revision the
   * classifier applies only the canonical reserved-path rules over it. */
  readonly reserved: ProjectScope;
  /** The sequence of the published revision that last supplied `scope`. */
  scopeSequence: number | null;
  /** The watch scope last given to the watcher, null without one. */
  registered: WatchScope | null;
  /** Reconfigurations in flight that register directories an exclusion held back: until
   * each ends and a conservative sweep follows, nothing is covered or synchronized. */
  registering: number;
  conservative: boolean;
  /** Pending non-periodic work; a due periodic sweep is `periodicSweepDue`. */
  background: 'open' | 'request' | 'watch' | 'verify' | 'conservative' | null;
  running: RunningCapture | null;
  debounce: (() => void) | null;
  sweepTimer: (() => void) | null;
  auditTimer: (() => void) | null;
  idle: (() => void) | null;
}
