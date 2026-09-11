import type { AnalysisReport, AnalysisSummary, Capability, RunControl, IncrementRun, InputChange, RetainedAnalysis, RetainedStageId } from '../../../../../analysis/src/interfaces/analysis.js';
import type { ProjectRequest, ProjectScope, ProjectResolution } from '../../../../../analysis/subs/project/src/interfaces/project.js';

export type ContextId = string;
export type GenerationId = string;
export type RevisionId = string;
export type LeaseId = string;
export interface ContextToken {
  readonly context: ContextId;
  readonly generation: GenerationId;
}
export interface ContextSetup {
  readonly registry: 'default';
  readonly capabilities: readonly Capability[];
}
export interface ContextSelection {
  readonly root: string;
  readonly scope: ProjectRequest['scope'];
  readonly configuration: ProjectRequest['configuration'];
  readonly setup: ContextSetup;
}
export interface InputFingerprints {
  readonly inputId: string;
  readonly declarations: string;
  readonly source: string;
  readonly configuration: string;
  readonly registry: string;
  readonly engine: string;
}
export type RevisionCause = 'open' | 'watch' | 'request' | 'verify' | 'conservative';
export interface ContextRevision {
  readonly token: ContextToken;
  readonly revision: RevisionId;
  readonly sequence: number;
  readonly publishedAt: number;
  readonly cause: RevisionCause;
  readonly fingerprints: InputFingerprints;
  readonly changed: readonly string[] | null;
  readonly reused: readonly RetainedStageId[];
  readonly outcome: AnalysisReport['outcome'];
  readonly summary: AnalysisSummary;
}
export type ContextState = 'opening' | 'warm' | 'cold' | 'evicted';
export type SynchronizationState = 'initializing' | 'synchronized' | 'reconciling'
  | 'conservative' | 'watcher-unavailable';
export interface ContextStatus {
  readonly token: ContextToken;
  readonly selection: ContextSelection;
  readonly scope: ProjectScope | null;
  readonly state: ContextState;
  readonly synchronization: SynchronizationState;
  readonly published: ContextRevision | null;
  readonly lastValid: ContextRevision | null;
  readonly pending: { readonly requests: number; readonly changedPaths: number;
    readonly analysisRunning: boolean };
  readonly history: { readonly retained: number; readonly bytes: number;
    readonly oldest: RevisionId | null };
  readonly retainedBytes: number;
  readonly leases: { readonly subscriptions: number; readonly requests: number };
  readonly watcher: 'active' | 'unavailable' | 'disposed';
  readonly openedAt: number;
  readonly lastActivityAt: number;
}
export interface ExpectedContent {
  readonly path: string;
  readonly sha256: string | null; // null: the client expects the path to be absent
}
export type Freshness =
  | { readonly mode: 'published'; readonly wait: boolean; readonly revision?: RevisionId }
  | { readonly mode: 'synchronized'; readonly expect: readonly ExpectedContent[] };
export interface FreshnessRecord {
  readonly mode: 'published' | 'synchronized';
  readonly acknowledged: number;
  readonly captureStarted: number | null;
  readonly verified: boolean;
  readonly reusedRevision: boolean;
}
export interface CheckRequest {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Freshness;
}
export type UnavailableReason = 'unknown-context' | 'expired-generation' | 'evicted-revision' | 'unobserved-input'
  | 'resource-unavailable' | 'analysis-failed' | 'unsupported-setup' | 'disposed';
export interface Unavailable {
  readonly status: 'unavailable';
  readonly reason: UnavailableReason;
  readonly message: string;
}
export type CheckOutcome =
  | { readonly status: 'reported'; readonly requestId: string; readonly published: true;
      readonly revision: ContextRevision; readonly freshness: FreshnessRecord; readonly report: AnalysisReport }
  | { readonly status: 'reported'; readonly requestId: string; readonly published: false;
      readonly revision: null; readonly freshness: FreshnessRecord; readonly report: AnalysisReport }
  | { readonly status: 'pending'; readonly requestId: string; readonly current: ContextStatus }
  | { readonly status: 'superseded'; readonly requestId: string;
      readonly revision: ContextRevision | null;
      readonly mismatches: readonly { readonly path: string; readonly expected: string | null;
        readonly observed: string | null }[] }
  | { readonly status: 'cancelled'; readonly requestId: string }
  | (Unavailable & { readonly requestId: string });
export type OpenOutcome =
  | { readonly status: 'opened'; readonly token: ContextToken; readonly created: boolean;
      readonly current: ContextStatus }
  | { readonly status: 'unresolved';
      readonly resolution: Extract<ProjectResolution, { readonly status: 'invalid' | 'unavailable' }>;
      readonly report: AnalysisReport }
  | Unavailable;
export type ContextEvent =
  | { readonly type: 'revision-published'; readonly token: ContextToken;
      readonly revision: ContextRevision; readonly coalesced: number }
  | { readonly type: 'status-changed'; readonly token: ContextToken; readonly current: ContextStatus;
      readonly coalesced: number }
  | { readonly type: 'context-evicted'; readonly token: ContextToken;
      readonly reason: 'idle' | 'pressure' | 'disposed' };
export interface SubscriptionHandle {
  readonly id: string;
  readonly current: ContextStatus;
  close(): void;
}
export interface WatchEvent {
  readonly path: string;
  readonly kind: 'changed' | 'created' | 'deleted' | 'renamed' | 'overflow' | 'error';
}
export interface WatcherHandle { close(): Promise<void> }
export interface WatcherPort {
  watch(root: string, listener: (events: readonly WatchEvent[]) => void): Promise<WatcherHandle>;
}
export interface ClockPort {
  now(): number;
  schedule(delayMs: number, run: () => void): () => void;
}
export interface ContextBudgets {
  readonly maxContexts: number;
  readonly maxHistoryRevisions: number;
  readonly maxHistoryBytes: number;
  readonly maxRetainedBytesPerContext: number;
  readonly maxRetainedBytesGlobal: number;
  readonly maxQueuedPaths: number;
  readonly maxConcurrentAnalyses: number;
  readonly warmIdleMs: number;
  readonly coldRetainMs: number;
  readonly debounceMs: number;
  readonly verificationIntervalMs: number;
}
export interface AnalysisDriver {
  resolve(request: ProjectRequest, control?: RunControl): Promise<ProjectResolution>;
  check(inputs: { readonly project: ProjectRequest; readonly setup: ContextSetup;
    readonly previous: RetainedAnalysis | null; readonly changes: readonly InputChange[] | null },
    control?: RunControl): Promise<IncrementRun>;
  dispose(): Promise<void>;
}
export interface ContextManagerOptions {
  readonly driver: AnalysisDriver;
  readonly watcher: WatcherPort;
  readonly clock: ClockPort;
  readonly budgets: ContextBudgets;
  readonly engine: string;
  readonly generationId: () => GenerationId;
}
export interface ContextManager {
  open(request: ProjectRequest, setup: ContextSetup, lease: LeaseId, control?: RunControl): Promise<OpenOutcome>;
  status(token: ContextToken): ContextStatus | Unavailable;
  list(): readonly ContextStatus[];
  check(request: CheckRequest, lease: LeaseId, control?: RunControl): Promise<CheckOutcome>;
  subscribe(token: ContextToken, lease: LeaseId,
    listener: (event: ContextEvent) => void): SubscriptionHandle | Unavailable;
  release(lease: LeaseId): void;
  dispose(): Promise<void>;
}
