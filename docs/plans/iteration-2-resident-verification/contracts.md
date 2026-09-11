# Plan 2 contract review package

**Prepared:** 2026-09-10. **Reviewed and revised:** 2026-09-11 in iteration 1.
**State:** revised contract package, awaiting architecture acceptance before iteration 3 of
[Plan 2](main-plan.md). These are definitions to implement, not implemented
capabilities. The [owner manifest](owners.md), [scope and lifecycle decisions](scope.md)
and [instance inventory](subcases.md) form one review package with this
document. Changing a signature, a wire schema or an activation stage revises
this package before its consumers change.

Every name implemented by Plan 1 is reused exactly as recorded in its
[contracts](../done/iteration-1-project-verifier/contracts.md); nothing there
is renamed. The `AnalysisDriver` draft reviewed there as
[type only](../done/iteration-1-project-verifier/contracts.md#future-contexts-boundary-type-review-only)
is extended here, as that review anticipated.

The [iteration 1 review record](probes.md#contract-review) identifies the
corrections made before consumers exist. Probe success and draft publication
do not constitute architecture acceptance.

## Conventions and dependency direction

All paths are package-relative; public ESM imports end in `.js`. Each block is
an exact declaration fragment, with the owning interface file named above it.
Foreign types a consumer imports are named in [owners.md](owners.md#foreign-signature-types);
a type mentioned in a signature is never implicitly exposed. Interface files
export only their owner's originals.

Retained data is deeply readonly and JSON-compatible: no `Map`, `Set`, `Date`,
`Error`, socket, timer, compiler object or closure occurs in a status, revision,
event, record or report. Live objects (connections, handles, ports, managers)
are distinct types and are never serialized. Times are milliseconds since the
Unix epoch as integers; durations are integer milliseconds. Identifiers with a
`kind/1:` prefix are opaque strings to every consumer but their owner.

The dependency direction is fixed: `contexts` imports analysis and project
types through root's existing relays and nothing else foreign; `daemon` imports
contexts (its child), root's service interface and analysis types; root imports
daemon, analysis and CLI contracts; `cli` imports root and relayed vocabulary
and no engine value. Batch delivery (`runBatch`, `BatchInvocation`,
`BatchResult`, `BatchOperation`, `runCli`) is unchanged.

## Analysis: incremental products and project resolution

Plan 1's `createAnalysisSession`, `analyzeProject`, `validateProject` and
`acquireInventory` are unchanged. Two operations and their vocabulary are
added; the report schema stays `ramify.analysis/1`.

`subs/analysis/subs/project/src/interfaces/project.ts` (iteration 3) adds:

```ts
export type ProjectResolution =
  | { readonly status: 'resolved'; readonly root: string; readonly selection: 'given' | 'found';
      readonly invokedFrom: string; readonly configuration: string }
  | { readonly status: 'invalid' | 'unavailable'; readonly issues: readonly ProjectIssue[] };
export interface RetainedConfiguration {
  readonly key: string;
  readonly dependencies: readonly CapturedInput[];
  readonly bytes: number;
  readonly product: Readonly<Record<string, unknown>>;
}
export interface ProjectReadOptions {
  readonly request: ProjectRequest;
  readonly parse: DescriptionParser;
  readonly limits: AcquisitionLimits;
  readonly signal?: AbortSignal;
  readonly retained?: RetainedConfiguration | null;
}
export type ProjectRead =
  | { readonly status: 'acquired'; readonly view: ProjectInputView;
      readonly configuration: RetainedConfiguration; readonly reusedConfiguration: boolean }
  | { readonly status: 'invalid' | 'unavailable' | 'incomplete';
      readonly inventory: ProjectInventory | null; readonly issues: readonly ProjectIssue[];
      readonly sealedInputs: readonly CapturedInput[] | null }
  | { readonly status: 'cancelled' };
```

Migration for the extended `ProjectRead`: the `acquired` variant's new
`configuration` and `reusedConfiguration` members are required, and
`read-project.ts` is the only constructor of that variant, so it populates
them; `run-analysis.ts`, `validation.ts`, `inventory.ts` and the harness read
`view` and ignore the new members unchanged. Failed acquisition constructors
also set `sealedInputs`: final coherent observations for an invalid inventory,
or null when coherence was not established. This detached field survives
view disposal and lets increments retain invalid inputs without changing the
batch report. `ProjectReadOptions.retained` is optional.

`subs/analysis/subs/project/src/resolve-root.ts` (iteration 3):

```ts
export declare function resolveProjectRoot(request: ProjectRequest): Promise<ProjectResolution>;
```

`resolveProjectRoot` performs exactly the root climb and configuration
discovery of the [CLI invocation contract](../../architecture/cli-invocation.spec.md#selecting-the-project)
and returns canonical real absolute paths. It reads no description contents
and builds no source catalog. Root/path discovery alone cannot identify a
references-only configuration: resolution uses a short-lived configuration
capture and the existing finite configuration helper for that classification,
then disposes both. The subsequent analysis captures inputs afresh. `readProject` continues to perform the
same selection internally; the two must agree, which iteration 3 asserts.
`ProjectResolution` classifies exactly as Plan 1's `readProject` does:
`root-not-found`, `configuration-not-found` and `references-only-configuration`
are `unavailable`; `invalid` is reserved for the layout and description issues
Plan 1 classifies as invalid (`missing-root-description`, `symlink-root`,
`symlink-description`) and is never used for a missing root or configuration.

The `retained` option lets acquisition skip the configuration helper: if every
`dependencies` entry of the supplied `RetainedConfiguration` has the same role
and `sha256` in the fresh capture, including `absent` and `directory`
observations, the helper is not started and `reusedConfiguration` is `true`.
Otherwise the helper runs and a new `RetainedConfiguration` is returned. The
`product` is project-private plain data; `key` is the content identity of the
dependency set.

`subs/analysis/src/interfaces/analysis.ts` (iteration 3) adds:

```ts
export interface InputChange {
  readonly path: string;
  readonly kind: 'changed' | 'created' | 'deleted' | 'unknown';
}
export type RetainedStageId = 'configuration' | 'parse' | 'metadata' | 'catalog'
  | 'access' | 'link' | 'decide';
export interface RetainedStage {
  readonly stage: RetainedStageId;
  readonly key: string;
  readonly bytes: number;
}
export interface RetainedAnalysis {
  readonly schemaVersion: 'ramify.retained/1';
  readonly inputId: string;
  readonly engine: string;
  readonly inputs: readonly CapturedInput[];
  readonly bytes: number;
  readonly stages: readonly RetainedStage[];
  readonly products: Readonly<Partial<Record<RetainedStageId, unknown>>>;
}
export interface IncrementInputs {
  readonly inputs: AnalysisInputs;
  readonly previous: RetainedAnalysis | null;
  readonly changes: readonly InputChange[] | null;
}
export type IncrementRun =
  | { readonly status: 'reported'; readonly report: AnalysisReport;
      readonly retained: RetainedAnalysis | null; readonly reused: readonly RetainedStageId[];
      readonly changed: readonly string[] | null }
  | { readonly status: 'cancelled' };
```

`subs/analysis/src/increment.ts` and `subs/analysis/src/resolve-project.ts`
(iteration 3):

```ts
export declare function analyzeIncrement(inputs: IncrementInputs, control?: RunControl): Promise<IncrementRun>;
export declare function resolveProject(request: ProjectRequest): Promise<ProjectResolution>;
```

`analyzeIncrement` creates one fresh single-use session internally, runs the
Plan 1 pipeline over a fresh whole-project acquisition and returns the same
`AnalysisReport` that `analyzeProject` returns for those bytes, differing only
in `runId`. `previous` and `changes` never change findings; they only permit
reusing retained stage products whose recorded input identities are unchanged,
as the [invalidation model](scope.md#invalidation-dependency-model) fixes.
`changes: null` means the caller cannot bound the change and permits no reuse
except per-file parse and metadata products; `changes: []` names no known
change and lets the fresh capture decide every reuse by recomputed key, which
is how the daemon's periodic `verify` reconciliation works. `reused` lists the
stages that were not recomputed; `report.stages` still records every stage as
`completed` because a reused product is a completed stage's product.
`changed` lists the captured input paths whose identity differs from the
dependencies `previous` recorded, and is `null` when `previous` is null or was
discarded. `retained` is non-null exactly when the capture sealed a coherent
view and `report.outcome.execution` is `completed` or `invalid`; for an
`invalid` report the products cover the stages that completed. A report whose
execution is `incomplete` or `unavailable` (no coherent view within three
attempts, an acquisition read failure, a stage or helper failure, an engine
resource limit, an unresolved selection) returns `retained: null` and is the
same report `analyzeProject` returns for that request; the daemon delivers it
but never publishes it. `RetainedAnalysis` is frozen plain data; its `bytes`
is the UTF-8 length of its JSON serialization and is the unit the daemon
accounts against budgets. Retained products contain no compiler objects,
handles or the input view; compiler helpers are still started and released
within each call that recomputes `catalog` or `access`.

`inputs` contains the complete sealed observations, including invalid
acquisitions whose unchanged Plan 1 report has null `inputId` or empty
`snapshot.inputs`. For those invalid captures, `RetainedAnalysis.inputId` is
`input/1:` plus SHA-256 of canonical JSON `[canonicalRoot, scope,
configuration, registryIdentity, engine, sortedCapturedInputs]`; otherwise
it is the report's existing input id. This identity is resident metadata and
does not modify `ramify.analysis/1`. A self-accounted `bytes` member is filled
by iterating serialization length until the integer reaches a fixed point;
the field itself is included, exactly once.

## Contexts: isolation, ordering, publication and the analysis port

`subs/daemon/subs/contexts/src/interfaces/contexts.ts` (iteration 4) imports
as types, through root's existing relays: analysis `AnalysisReport`,
`AnalysisSummary`, `Capability`, `RunControl`, `IncrementRun`, `InputChange`,
`RetainedAnalysis`, `RetainedStageId`; project `ProjectRequest`,
`ProjectScope`, `ProjectIssue`, `ProjectResolution`. It imports no root or
daemon type, and it never names `AnalysisInputs` or `IncrementInputs`: the
driver port below takes the context's own selection, and root's driver builds
the engine's inputs from it.

```ts
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
```

`subs/daemon/subs/contexts/src/context-manager.ts` (iteration 4):

```ts
export declare function createContextManager(options: ContextManagerOptions): ContextManager;
```

Driver port. `check` takes the context's own selection: the requesting lease's opening
`ProjectRequest`, its `ContextSetup`, the retained products of the last
publication or `null`, and the bounded change list or `null`. Contexts cannot
construct an `AnalysisInputs` (its `registry` is a resolved registry value
and its `limits` are the engine's), so the driver, not the manager, builds
the `IncrementInputs` it passes to `analyzeIncrement`. The type-only draft
Plan 1 reviewed took `IncrementInputs` directly; this revision replaces that
parameter before any implementation exists, so nothing migrates.

Token rules. `ContextId` is `ctx/1:` followed by the SHA-256 of canonical JSON
`[root, project.scope, project.configuration, setup.registry, sortedCapabilities]`,
where `root` is the canonical real absolute path returned by `resolve` and
`project` is the opening `ProjectRequest`; `ContextSetup` repeats nothing from
the request, so no disagreement is possible. Branch names, `cwd` and the
requesting client never enter it. `GenerationId` is
`gen/1:` plus a fresh UUID each time the manager opens a context it does not
currently hold, including reopening after eviction. `RevisionId` is `rev/1:`
plus the generation UUID, `:` and the decimal `sequence`, which starts at 1 in
every generation and increases by one per publication. A token whose
generation is not the live generation of its context is `expired-generation`;
an unknown `ContextId` is `unknown-context`; a `published` read naming a
revision no longer retained is `evicted-revision`.

`Unavailable` is reserved for these context-level reasons and carries no
analysis diagnostics:

| Reason | Arises when |
| --- | --- |
| `unknown-context` | The token's `ContextId` names no context the manager holds. |
| `expired-generation` | The token's generation is not the context's live generation. |
| `evicted-revision` | A `published` read names a revision that history no longer retains. |
| `resource-unavailable` | A budget cannot be met after eligible eviction. |
| `analysis-failed` | The driver threw or rejected instead of returning an `IncrementRun`. |
| `unsupported-setup` | The registry or a capability is outside Plan 2's implemented set. |
| `disposed` | The manager was disposed while the request was pending. |
| `unobserved-input` | A synchronized expectation names no file/absence observation in the sealed capture. Unknown is never treated as absent. |

Every engine-produced result, including an incomplete or unavailable report
and an unresolved selection, is delivered with its `AnalysisReport` and never
as `Unavailable`. `fingerprints.inputId` is Plan 1's
`input/1:` identity from `retained.inputId` (including sealed invalid inputs);
the other five are SHA-256 over the sorted captured
inputs in `retained.inputs` of the named class (`declarations`: role `description`; `source`:
roles `source`, `resource`, `dependency`, `directory`, `absent`;
`configuration`: role `configuration`), the registry identity and the engine
string `ramify.ts@<version>+typescript@7.0.2`.

Ordering rules. Each context has one queue. Entries are explicit `check`
requests in acknowledgment order and at most one pending background
reconciliation. A synchronized request is satisfied only by a capture whose
`captureStarted` is at or after the request's `acknowledged` time, and the
report is computed from that capture; two acknowledged requests may share one
capture when both precede its start. If the capture's fingerprints and the complete report except `runId` equal
the published revision's, no new revision is published and the outcome carries the
published revision with `reusedRevision: true` and `verified: true`. A run
whose driver returns `retained: null` is delivered to every request it
satisfies as `reported` with `published: false` and `revision: null`; it
publishes nothing, leaves `published` and `lastValid` unchanged, and marks the
context `reconciling` until a later run publishes. `open` on a request the
driver cannot resolve calls `driver.check` once over that request with no
`previous` and returns `unresolved` with the resulting report, creating no
context. When
`expect` is nonempty, every listed path is compared with the capture: a
mismatch returns `superseded` with the observed identities and publishes the
captured revision only if it is otherwise valid, so the client learns what the
daemon checked. Background work superseded by newer events is cancelled and
publishes nothing; an acknowledged request is never coalesced away and always
receives `reported`, `superseded`, `cancelled` or `unavailable`. A candidate
built from generation G cannot publish if the context's live generation is not
G. A `published` request without `revision` and with `wait: true` resolves on
the first publication of that generation or with `cancelled`/`unavailable`;
with `wait: false` and nothing published it returns `pending`. A `published`
request naming a `revision` ignores `wait`: if that revision is retained in the
context's history, the outcome is `reported` with exactly that revision and its
report (`published: true`, `verified: false`, `captureStarted: null`,
`reusedRevision: false`); if it is not retained, the outcome is
`evicted-revision`. A named revision is never answered by the current revision,
so a consumer that pairs a `revision-published` event with a later read can
never receive a mislabelled report.

Watcher rules. Events are root-relative paths batched by the port. The manager
debounces for `debounceMs`, then runs one background reconciliation with cause
`watch` and `changes` set to the distinct paths. An `overflow` or `error`
event, more than `maxQueuedPaths` distinct pending paths, or a lost watcher
marks the context `conservative` and passes `changes: null`. Errors additionally mark the watcher unavailable. The manager never
reads or stats a project file itself; the driver's acquisition is the only
reader. While a context is warm, including when its watcher is unavailable, every
`verificationIntervalMs` after the last completed reconciliation the manager queues one
background reconciliation with cause `verify` and `changes: []`: the driver's
fresh capture recomputes every input identity and reuses every stage whose key
is equal, so an unchanged project publishes nothing, while a changed input
beneath the watcher's excluded subtrees (a dependency declaration, a
configuration the `extends` chain reaches) publishes a revision whose
`changed` names the paths the driver reports. `ContextRevision.changed` is
the driver's `changed` for every cause, `null` on the first revision of a
generation or when previous products were discarded. A conservative run with
previous products may still report the observed changed paths.

Retention rules. History keeps the newest `maxHistoryRevisions` revisions and
at most `maxHistoryBytes` of accounted report bytes per context, always
including the published revision. `lastValid` is a historical header; its
report may be evicted, and an exact read then returns `evicted-revision`.
If the candidate report alone exceeds the count/byte budget, publication
fails with `resource-unavailable`; no limit is exceeded to pin a report. A context
without leases or subscriptions for `warmIdleMs` becomes `cold`: its watcher,
retained analysis products and history other than `published` are released.
A request to a cold context re-warms it: the manager reattaches the watcher,
the context is `reconciling` until the next publication, and the next analysis
runs `conservative` with `changes: null` because no retained products exist;
a `published` read without `revision` still answers from the retained
`published` revision meanwhile. After `coldRetainMs` more without a request
the context is evicted. Opening a ninth context when
`maxContexts` are warm evicts the least recently active unleased cold or warm
context; if every context holds a lease, `open` returns `resource-unavailable`.
Exceeding `maxRetainedBytesGlobal` evicts history oldest-first across contexts,
then cold contexts, then reports `resource-unavailable` for the requesting
context. Eviction of a context creates a new generation on reopen.

### Review corrections to request and capture semantics

Each lease remembers its own opening `ProjectRequest` and capability order.
A queued synchronized check freezes those invocation facts at acknowledgment
and sends them to the driver. Sharing a canonical context never changes a
caller's `cwd`, root spelling, `selection`, `invokedFrom` or requested
capability order in the unchanged batch report. Reuse requires equality of
the whole report except `runId`, as well as fingerprints. Requests with
different invocation facts do not share a capture. Published reads retain
the original revision's invocation facts. The service owns a separate manager
lease per client/context pair; `closeContext` releases only that pair, while
connection release releases every pair.

The manager records `captureStarted` with its clock immediately before
calling the driver, after the request was acknowledged. The real driver
starts its fresh acquisition during that call; the timestamp is a lower bound
on acquisition start in the same clock domain. No prestarted acquisition may
satisfy it. `verified` is true only with a coherent sealed capture; an
unpublished incomplete/unavailable engine report has `verified: false` and
is delivered before attempting any expectation comparison.

Expectation paths use captured root-relative labels with `/` separators;
absolute, escaping and duplicate paths are invalid. Directory-only
observations cannot establish file content or absence. A
captured `absent` observation compares as null; a captured content observation
compares by its sha256. A path lacking either observation yields
`unavailable` / `unobserved-input`, not a guessed absence or fresh success.
This is an explicit Plan 2 limit on expectations; it accepts no extra bytes
and adds no independent reader. For sealed invalid inputs the manager uses
`retained.inputs`, never an old report's inputs.

The real watcher recursively enumerates eligible directories and attaches
non-recursive `fs.watch` handles, pruning `node_modules`, `.git`, `dist` and
`.reference-work` before attaching. It rescans directory membership on
rename/create notifications, closes removed handles and observes new eligible
directories. A missing filename, bounded queue overflow or watcher error
produces an explicit conservative event. Callback filtering of a single
native recursive watcher does not avoid watching excluded trees. Native
kernel event loss is not guaranteed to be signalled: periodic verification
also runs while the watcher is unavailable, and synchronized requests remain
independent of delivery. A watcher error sets `watcher-unavailable`, queues
conservative work and attempts reattachment after the next successful sealed
reconciliation, including revision reuse. Each completed verification schedules the next interval even
when it reuses a revision.

## Root: the dispatch-facing service interface

Root `src/interfaces/service.ts` (iteration 5) imports as types: analysis
`RunControl`; contexts `ContextToken`, `ContextSetup`, `ContextStatus`,
`ContextBudgets`, `CheckOutcome`, `Freshness`, `OpenOutcome`, `ContextEvent`;
project `ProjectRequest`. The file is type-only.

```ts
export type ServiceOperation = 'openContext' | 'contextStatus' | 'check' | 'subscribe'
  | 'unsubscribe' | 'closeContext' | 'daemonStatus' | 'stopDaemon';
export type ServiceCapability = 'contexts' | 'check' | 'subscribe' | 'daemon-control';
export type ServiceErrorCode = 'invalid-request' | 'unsupported-operation'
  | 'unknown-context' | 'expired-generation' | 'resource-unavailable'
  | 'unknown-subscription' | 'wrong-instance' | 'stopping' | 'cancelled' | 'internal-error' | 'incompatible';
export interface ServiceError {
  readonly code: ServiceErrorCode;
  readonly message: string;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}
export type ServiceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ServiceError };
export interface OpenContextParams { readonly project: ProjectRequest; readonly setup: ContextSetup }
export interface ContextParams { readonly token: ContextToken }
export interface CheckParams {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Freshness;
}
export interface SubscriptionOpened {
  readonly subscription: string;
  readonly current: ContextStatus;
  readonly replay: 'not-available';
}
export interface UnsubscribeParams { readonly subscription: string }
export interface DaemonCounters {
  readonly revisions: number;
  readonly analyses: number;
  readonly cancelledAnalyses: number;
  readonly reusedRevisions: number;
  readonly coalescedEvents: number;
  readonly evictions: number;
  readonly rejectedRequests: number;
  readonly disconnectedSlowConsumers: number;
}
export interface DaemonStatus {
  readonly instanceId: string;
  readonly pid: number;
  readonly version: string;
  readonly engine: string;
  readonly buildKey: string;
  readonly protocol: 'ramify.ipc/1';
  readonly startedAt: number;
  readonly state: 'running' | 'stopping';
  readonly connections: number;
  readonly subscriptions: number;
  readonly contexts: readonly ContextStatus[];
  readonly budgets: ContextBudgets;
  readonly counters: DaemonCounters;
  readonly memory: { readonly rss: number; readonly heapUsed: number; readonly external: number };
}
export interface StopParams { readonly instanceId: string }
export interface StopAcknowledged { readonly instanceId: string; readonly stopping: true }
export interface RamifyService {
  openContext(params: OpenContextParams, control?: RunControl): Promise<ServiceResult<OpenOutcome>>;
  contextStatus(params: ContextParams): Promise<ServiceResult<ContextStatus>>;
  check(params: CheckParams, control?: RunControl): Promise<ServiceResult<CheckOutcome>>;
  subscribe(params: ContextParams, listener: (event: ContextEvent) => void): Promise<ServiceResult<SubscriptionOpened>>;
  unsubscribe(params: UnsubscribeParams): Promise<ServiceResult<null>>;
  closeContext(params: ContextParams): Promise<ServiceResult<null>>;
  daemonStatus(): Promise<ServiceResult<DaemonStatus>>;
  stopDaemon(params: StopParams): Promise<ServiceResult<StopAcknowledged>>;
}
```

A `ServiceError` is a transport or validation failure. Domain outcomes such as
`superseded`, `pending`, an `unresolved` selection or an `unavailable`
context reason are values inside `OpenOutcome` and `CheckOutcome`, and they
cross the wire unchanged; adapters must never fold them into errors. The
in-process binding and the IPC client return the same `ServiceResult` shapes,
which is the equivalence quick tests assert. Three codes name conditions that
are values for `openContext` and `check` and errors only for operations
without a domain outcome type:

| Code | Value in | Error from |
| --- | --- | --- |
| `unknown-context`, `expired-generation` | `openContext`, `check` (`Unavailable`) | `contextStatus`, `subscribe`, `closeContext` on a token the manager does not hold |
| `resource-unavailable` | `openContext`, `check` (`Unavailable`) | The host: connection limit at `hello`, `maxRequestsInFlight`, a response over `maxResponseBytes` |
| `evicted-revision`, `unsupported-setup`, `unobserved-input` | `check`, `openContext` (`Unavailable`) | Never an error; no other operation can produce them |
| `invalid-request`, `unsupported-operation`, `unknown-subscription`, `wrong-instance`, `stopping`, `cancelled`, `internal-error`, `incompatible` | Never a value | Validation, dispatch, `unsubscribe`, `stopDaemon`, shutdown, abort and host defects |

Root `src/resident-assembly.ts` (iteration 5) builds the analysis-backed
driver and the in-process service; `src/daemon-entry.ts` (iteration 8) and
root's testing-only quick environment call it:

```ts
export interface ResidentAssemblyOptions {
  readonly watcher: WatcherPort;
  readonly clock: ClockPort;
  readonly budgets: ContextBudgets;
  readonly instance: DaemonInstance;
  readonly log: (entry: LogEntry) => void;
}
export declare function createAnalysisDriverFromSessions(): AnalysisDriver;
export declare function assembleResidentService(options: ResidentAssemblyOptions): DaemonService;
```

`createAnalysisDriverFromSessions().check` builds the `AnalysisInputs` of an
`IncrementInputs` from the port's `project` and `setup.capabilities`, the
reviewed Plan 1 limits and the default registry, passes `previous` and
`changes` through and calls `analyzeIncrement`; `resolve` calls
`resolveProject`. Root `src/client.ts` (iteration 9) builds the CLI's
connector from `connectDaemon` with the endpoint directory, the daemon entry
path `dist/src/daemon-entry.js` resolved from the package (or, when the
`RAMIFY_DAEMON_ENTRY` environment variable is set, that path instead: a test
override for the harness's failed-start fixtures, read here and never by
`connectDaemon`), the package version and the engine string. Root's
`src/tests/quick-environment.ts` (iteration 5) is a testing-owned setup
exposed to descendants:

```ts
export interface QuickEnvironment {
  readonly service: DaemonService;
  readonly watcher: ControlledWatcher;
  readonly clock: ControlledClock;
  readonly connect: ServiceConnector;
  readonly batch: BatchOperation;
  dispose(): Promise<void>;
}
export declare function createQuickEnvironment(options?: Partial<ContextBudgets>): Promise<QuickEnvironment>;
```

Its `connect` yields an in-process `ServiceConnection` whose every request and
event passes through `encodeMessage`/`decodeMessage`, so direct tests cannot
rely on object identity that IPC loses. The codec therefore lands in
iteration 5 in daemon's `src/codec.ts` with message encoding only, exposed
through N2's codec line from that iteration so that root's quick environment
may import it; iteration 7 adds the length-prefixed framing under the same
two names. For the same reason the connect vocabulary this environment names
(`Welcome`, `ConnectionState`, `DisconnectReason`, `RecoveryOutcome`,
`ServiceConnection`, `ConnectOutcome`, `ServiceConnector`), together with the
`DaemonRecord`, `StopDisposition`, `Handshake` and `WireMessage` types that
they and the codec name, is declared in `interfaces/daemon.ts` in iteration
5; `connectDaemon`, the discovery values and the remaining client types
(`EndpointSelection`, `ConnectTimeouts`, `ConnectOptions`) follow in
iteration 7.

## Daemon: service binding, client, host and records

`subs/daemon/src/interfaces/daemon.ts` (iterations 5, 7 and 8) imports as types:
root `RamifyService`, `ServiceOperation`, `ServiceCapability`, `ServiceResult`,
`ServiceError`, `ServiceErrorCode`;
contexts `AnalysisDriver`, `WatcherPort`, `ClockPort`, `ContextBudgets`,
`ContextEvent`, `ContextToken`; analysis `RunControl`.

```ts
export interface DaemonInstance {
  readonly instanceId: string;
  readonly pid: number;
  readonly version: string;
  readonly engine: string;
  readonly buildKey: string;
}
export interface LogEntry {
  readonly at: number;
  readonly level: 'info' | 'warn' | 'error';
  readonly event: string;
  readonly context?: string;
  readonly generation?: string;
  readonly request?: string;
  readonly revision?: string;
  readonly message: string;
}
export interface DaemonServiceOptions {
  readonly driver: AnalysisDriver;
  readonly watcher: WatcherPort;
  readonly clock: ClockPort;
  readonly budgets: ContextBudgets;
  readonly instance: DaemonInstance;
  readonly log: (entry: LogEntry) => void;
}
export interface ServiceLease {
  readonly id: string;
  readonly service: RamifyService;
  release(): void;
}
export interface DaemonService extends RamifyService {
  readonly instance: DaemonInstance;
  lease(client: string): ServiceLease;
  onStop(listener: (disposition: StopDisposition) => void): () => void;
  dispose(): Promise<void>;
}
export interface DaemonBudgets {
  readonly maxConnections: number;
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
  readonly maxOutboundBytes: number;
  readonly maxOutboundFrames: number;
  readonly maxRequestsInFlight: number;
  readonly leaseMs: number;
  readonly pingMs: number;
  readonly idleExitMs: number;
  readonly shutdownGraceMs: number;
}
export interface EndpointSelection {
  readonly directory: string;
  readonly buildKey: string;
  readonly socket: string;
  readonly record: string;
  readonly lock: string;
  readonly log: string;
}
export interface DaemonRecord {
  readonly schemaVersion: 'ramify.daemon-record/1';
  readonly instanceId: string;
  readonly pid: number;
  readonly buildKey: string;
  readonly version: string;
  readonly engine: string;
  readonly protocol: 'ramify.ipc/1';
  readonly socket: string;
  readonly startedAt: number;
  readonly state: 'starting' | 'running' | 'stopped';
  readonly stopped: StopDisposition | null;
}
export interface StopDisposition {
  readonly at: number;
  readonly reason: 'idle' | 'explicit' | 'retired' | 'failed'; // 'retired' reserved: no Plan 2 operation produces it
  readonly requestId: string | null;
}
export interface Handshake {
  readonly protocol: 'ramify.ipc/1';
  readonly client: { readonly name: string; readonly version: string };
  readonly buildKey: string;
  readonly engine: string;
}
export interface Welcome {
  readonly protocol: 'ramify.ipc/1';
  readonly instance: DaemonInstance;
  readonly capabilities: readonly ServiceCapability[];
  readonly limits: { readonly maxRequestBytes: number; readonly maxResponseBytes: number;
    readonly leaseMs: number; readonly pingMs: number };
}
export interface ConnectTimeouts {
  readonly handshakeMs: number;
  readonly startupMs: number;
  readonly startAttempts: number;
  readonly reconnectAttempts: number;
  readonly reconnectBackoffMs: readonly number[];
  readonly restartAttempts: number;
  readonly totalRecoveryMs: number;
}
export interface ConnectOptions {
  readonly signal?: AbortSignal;
  readonly client: { readonly name: string; readonly version: string };
  readonly engine: string;
  readonly start: 'if-needed' | 'never';
  readonly daemonEntry: string | null;
  readonly endpointDirectory?: string;
  readonly timeouts?: Partial<ConnectTimeouts>;
  readonly onState?: (state: ConnectionState, reason: DisconnectReason | null) => void;
}
export type ConnectionState = 'connected' | 'reconnecting' | 'restarting' | 'stopped'
  | 'unavailable' | 'closed';
export type DisconnectReason =
  | { readonly kind: 'idle-exit' }
  | { readonly kind: 'explicit-stop'; readonly requestId: string | null }
  | { readonly kind: 'failure'; readonly message: string }
  | { readonly kind: 'slow-consumer' }
  | { readonly kind: 'incompatible'; readonly daemon: string; readonly client: string }
  | { readonly kind: 'rejected'; readonly code: ServiceErrorCode; readonly message: string }
  | { readonly kind: 'closed' };
export type RecoveryOutcome =
  | { readonly status: 'recovered'; readonly instance: DaemonInstance; readonly restarted: boolean }
  | { readonly status: 'stopped'; readonly record: DaemonRecord }
  | { readonly status: 'unavailable'; readonly attempts: number; readonly reason: DisconnectReason };
export interface ServiceConnection extends RamifyService {
  readonly state: ConnectionState;
  readonly daemon: Welcome;
  readonly reason: DisconnectReason | null;
  recover(authorization: 'automatic' | 'explicit'): Promise<RecoveryOutcome>;
  close(): Promise<void>;
}
export type ConnectOutcome =
  | { readonly status: 'connected'; readonly connection: ServiceConnection; readonly started: boolean }
  | { readonly status: 'stopped'; readonly record: DaemonRecord }
  | { readonly status: 'not-running' }
  | { readonly status: 'unavailable'; readonly reason: DisconnectReason; readonly attempts: number;
      readonly message: string };
export type ServiceConnector = (options: { readonly start: 'if-needed' | 'never';
  readonly signal?: AbortSignal }) => Promise<ConnectOutcome>;
export interface StartDaemonOptions {
  readonly service: DaemonService;
  readonly endpoint: EndpointSelection;
  readonly budgets: DaemonBudgets;
  readonly clock: ClockPort;
  readonly log: (entry: LogEntry) => void;
}
export interface DaemonHost {
  readonly record: DaemonRecord;
  stop(reason: 'explicit', requestId: string | null): Promise<StopDisposition>;
  readonly stopped: Promise<StopDisposition>;
}
export type StartDaemonOutcome =
  | { readonly status: 'started'; readonly host: DaemonHost }
  | { readonly status: 'already-running'; readonly record: DaemonRecord }
  | { readonly status: 'failed'; readonly message: string };
```

Operations and defining files:

```ts
// service.ts — iteration 5: validation, dispatch to a context manager it creates, leases.
export declare function createDaemonService(options: DaemonServiceOptions): DaemonService;
// filesystem-watcher.ts and system-clock.ts — iteration 5: real ports.
export declare function createFilesystemWatcher(): WatcherPort;
export declare function createSystemClock(): ClockPort;
// codec.ts — iteration 5: message encoding, exposed through N2 for the quick connector;
// iteration 7 adds framing under the same names; shared by client, host and quick tests.
export declare function encodeMessage(message: WireMessage): Uint8Array;
export declare function decodeMessage(frame: Uint8Array): WireMessage;
// discovery.ts — iteration 7: endpoint selection and records; no engine load.
export declare function selectEndpoint(options: { readonly packageRoot: string; readonly version: string;
  readonly endpointDirectory?: string }): Promise<EndpointSelection>;
export declare function readDaemonRecord(endpoint: EndpointSelection): Promise<DaemonRecord | null>;
// connect-daemon.ts — iteration 7: the lightweight client.
export declare function connectDaemon(options: ConnectOptions): Promise<ConnectOutcome>;
// start-daemon.ts — iteration 8: the IPC host over the in-process service, with private host.ts.
export declare function startDaemon(options: StartDaemonOptions): Promise<StartDaemonOutcome>;
```

`createDaemonService` validates every parameter object structurally before
dispatch. Unknown properties, wrong discriminants, a `project.scope` other
than `whole-project`, a `project.configuration` other than `discover`, a
`requestId` that is not 1–128 printable ASCII characters, an `expect` list
over 10,000 entries, or a `revision` that is not a `rev/1:` identifier are
`invalid-request`. The wire shape admits any string for `registry`
and any string list for `capabilities`, so that a later plan can advertise
them; in Plan 2 a `registry` other than `default`, or a capability outside the
thirteen implemented ones, including `browser-verification`, is
`unsupported-setup`. The IPC host and the quick environment call this one
implementation; neither re-validates nor dispatches on its own. Each `lease` identifies one client; releasing it
releases every subscription and request reference it holds. `onStop`
listeners receive the disposition the host will record.

`StopDisposition.reason` has one writer per value. `idle` and `explicit` are
written by the host when it exits after `idleExitMs` without a lease or
answers `DaemonHost.stop`. `failed` is written by the host's fatal path only:
when the listener cannot be bound after the `starting` record was written,
or when `daemon-entry.ts` receives an uncaught exception or unhandled
rejection while `running`; the host writes the record, sends `goodbye`
`{ kind: 'failure', message: <diagnostic> }` on every socket still writable and exits with code 1.
A daemon killed by a signal writes nothing, so its record stays `running`
with a dead pid. `retired` has no writer in Plan 2.

## IPC framing, messages and notification rules

`subs/daemon/src/codec.ts` (message encoding exposed through N2 in iteration
5, framing in iteration 7) owns the wire schema; `WireMessage`
is declared in `interfaces/daemon.ts` from iteration 5:

```ts
export type WireMessage =
  | { readonly type: 'hello'; readonly handshake: Handshake }
  | { readonly type: 'welcome'; readonly welcome: Welcome }
  | { readonly type: 'reject'; readonly error: ServiceError; readonly daemon: DaemonInstance }
  | { readonly type: 'request'; readonly id: string; readonly op: ServiceOperation;
      readonly params: unknown }
  | { readonly type: 'cancel'; readonly id: string }
  | { readonly type: 'response'; readonly id: string; readonly result: ServiceResult<unknown> }
  | { readonly type: 'event'; readonly seq: number; readonly subscription: string;
      readonly event: ContextEvent }
  | { readonly type: 'ping' }
  | { readonly type: 'pong' }
  | { readonly type: 'goodbye'; readonly reason: DisconnectReason };
```

Framing: a 4-byte big-endian unsigned length followed by that many bytes of
UTF-8 JSON encoding exactly one `WireMessage`. A frame longer than
`maxRequestBytes` (client to daemon) or `maxResponseBytes` (daemon to client),
a length of zero, invalid UTF-8 or JSON, or a message failing the structural
schema is a protocol violation: the receiver sends `goodbye` with
`{ kind: 'failure', message: <diagnostic> }` when possible and closes. The first client frame must be
`hello`; the daemon answers `welcome` or `reject` and then closes on reject.
A `hello` arriving while `maxConnections` connections are open is answered
with `reject` carrying `resource-unavailable` before any `welcome`; the client
reports `unavailable` with `DisconnectReason` `rejected` and starts no
recovery. Requests carry client-chosen `id` values unique per connection; a
duplicate is `invalid-request`; a request arriving while `maxRequestsInFlight`
requests are open on the connection is answered with a `resource-unavailable`
error. `cancel` aborts the request's `RunControl` signal; the
daemon still sends the final `response`, whose value is a `cancelled` outcome
when the operation observed the abort. A `ping` must arrive within `leaseMs`
of the previous client frame on a connection holding subscriptions; otherwise
the daemon releases that connection's lease and sends `goodbye`
`{ kind: 'closed' }`. Clients send `ping` every `pingMs`.

Notification ordering: events are delivered per connection in a single
sequence numbered from 1; within one context, `revision-published` events
carry strictly increasing `sequence` values and never reorder with that
context's `status-changed` events. Coalescing: while a connection's outbound
queue holds an undelivered `revision-published` or `status-changed` event for
the same context and subscription, a newer event of the same type replaces it
and increments `coalesced` by the replaced event's `coalesced + 1`; the
replacing event takes the newest queue position and the replaced one leaves
the queue, so "never reorder" applies to the events that are delivered.
`context-evicted` and `goodbye` are never replaced or dropped. A
`revision-published` event carries only the `ContextRevision` header; a
subscriber fetches the report with a `published` read naming that revision
and receives exactly that report or `evicted-revision`. Replay does not
exist in Plan 2: a `subscribe` response states `replay: 'not-available'` and
supplies `current`, so a client that reconnects resynchronizes from status
plus the next events. When a connection's outbound queue exceeds
`maxOutboundBytes` or `maxOutboundFrames`, the daemon drops the connection's
queue, sends `goodbye` `{ kind: 'slow-consumer' }` if the socket accepts it
within 1,000 ms, destroys the socket and releases the lease.

## Client and transport lifecycle

`connectDaemon` selects the endpoint, reads the record, and proceeds by state:

| Discovery state | `start: 'if-needed'` | `start: 'never'` |
| --- | --- | --- |
| No record | Acquire the start lock, spawn the daemon entry, wait for `running`, connect and handshake. | Return `not-running`. |
| Record `stopped` with reason `idle`, `retired` or `failed` | Start as above. | Return `stopped` with the record. |
| Record `stopped` with reason `explicit` | A fresh call is a newly invoked explicit command: start as above. An existing connection's `recover('automatic')` returns `stopped`; only `recover('explicit')` starts. | Return `stopped` with the record. |
| Record `running`, socket accepts, handshake ok | `connected`, `started: false`. | Same. |
| Record `running`, socket accepts, `reject` | `unavailable` with `incompatible` (protocol, `buildKey` or engine mismatch) or `rejected` (`resource-unavailable` at the connection limit); nothing is started, stopped or retried. | Same. |
| Record `running`, connection refused or pid absent | Treat as failed daemon: remove the stale socket and record after verifying the pid is not alive, then start. | Return `not-running`. |
| Record `starting` or lock held by a live pid | Wait up to `startupMs` for `running`, then connect. | Wait the same, then connect or `not-running`. |

Per-platform details: both platforms use a Unix domain stream socket. The
endpoint directory is `$RAMIFY_ENDPOINT_DIR` when set, else
`$XDG_RUNTIME_DIR/ramify` when set (Linux), else `<os.tmpdir()>/ramify-<uid>`
(macOS and Linux fallback). It is created with mode `0700`; a directory not
owned by the current uid or with group/other permission bits is
`unavailable`, never used. `buildKey` is the first 16 hex characters of the
SHA-256 of `[packageRoot real path, version, buildIdentity]`, where
`buildIdentity` is the SHA-256 of canonical JSON containing the package.json hash and sorted
`[package-relative path, sha256(bytes)]` pairs for every production `.js` and
`.mjs` file under `dist/src/` and `dist/subs/`, computed by `selectEndpoint`
from `packageRoot`. This is file hashing, never importing the engine. Changes
in imported analysis code must create a new group even when the entry bytes
and package version are unchanged. Missing/incomplete build files are
`unavailable`; a live daemon validates the same identity at startup. It is distinct from the `engine` string
`ramify.ts@<version>+typescript@7.0.2` that `Handshake.engine`,
`DaemonInstance.engine` and `--engine` carry. File names are `daemon-<buildKey>.sock`,
`.json`, `.lock` and `.log`. A socket path longer than 100 bytes is
`unavailable` with a message naming the override, because macOS limits
`sun_path` to 104 bytes. The lock is created with `O_CREAT|O_EXCL`; it
contains the holder pid and time and is reclaimable only after verifying
the pid dead. Age over 30 s triggers a liveness check, never removal of a
live holder. A malformed record or ambiguous liveness is `unavailable`. Records are written to a temporary file and renamed
into place. Liveness uses `process.kill(pid, 0)`. The daemon is spawned
detached with `stdio` `ignore`/log/log and `unref()`, with argv
`--endpoint-dir`, `--build-key`, `--version`, `--engine` and, for tests only,
`--budgets <json>`. A second daemon that finds a live peer on its socket exits
with code 3 and writes nothing.

A first connection makes at most `startAttempts` (2) starts within `startupMs` each.
Recovery after an unexpected loss follows `ConnectTimeouts`: reconnect
attempts with the backoff list, then at most `restartAttempts` starts, all
within `totalRecoveryMs`; the outcome is `recovered` (with `restarted` and the
new instance, so callers know generations changed), `stopped`, or
`unavailable`. `recover('automatic')` acts on `DisconnectReason` `failure`
and `slow-consumer` and returns `stopped` without starting anything for
`explicit-stop` and `idle-exit`; `incompatible`, `rejected` and `closed` are
final and start no recovery. `recover` never loads or spawns an engine in the
calling process. `close` sends `goodbye` `{ kind: 'closed' }`, releases local
listeners and resolves after the host releases the lease and closes its side
of the socket. On loss it closes locally and lease expiry is the upper bound.
`ConnectOptions.signal` aborts discovery, startup waiting and handshake; a
shared compatible daemon is never killed by one cancelled connector.

## CLI: commands, environment and output documents

`subs/cli/src/interfaces/cli.ts` (iteration 9) keeps `CliExitCode` and extends
`CliEnvironment`; it imports as types root `BatchOperation` and `DaemonStatus`;
daemon `ServiceConnector`, `DaemonRecord` and `DisconnectReason` (N4, relayed
by root R7); contexts `ContextToken`, `ContextRevision`, `ContextStatus`,
`ContextEvent`; analysis `RunControl`, `AnalysisReport`:

```ts
export type CliExitCode = 0 | 1 | 2 | 130;
export interface CliEnvironment {
  readonly cwd: string;
  readonly version: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly batch: BatchOperation;
  readonly connect: ServiceConnector;
}
export type WatchLine =
  | { readonly schemaVersion: 'ramify.watch/1'; readonly event: 'status'; readonly current: ContextStatus }
  | { readonly schemaVersion: 'ramify.watch/1'; readonly event: 'revision'; readonly revision: ContextRevision;
      readonly coalesced: number; readonly report: AnalysisReport }
  | { readonly schemaVersion: 'ramify.watch/1'; readonly event: 'revision-evicted';
      readonly revision: ContextRevision; readonly coalesced: number }
  | { readonly schemaVersion: 'ramify.watch/1'; readonly event: 'evicted' | 'stopped' | 'unavailable';
      readonly reason: string };
export type DaemonStatusDocument =
  | { readonly schemaVersion: 'ramify.daemon-status/1'; readonly running: true; readonly status: DaemonStatus }
  | { readonly schemaVersion: 'ramify.daemon-status/1'; readonly running: false;
      readonly record: DaemonRecord | null };
```

`runCli` keeps its signature. Arguments, output and exits are fixed in the
main plan's [behavior tables](main-plan.md#required-behavior-and-diagnostics).
`check` writes Plan 1's `ramify.analysis/1` document unchanged in every mode,
with no additional member, and puts the resident facts in the human `Mode:`
line only; there is no wrapping document for `check`. A `watch` revision line
embeds the report fetched by the event's revision id, so JSON consumers need
no second request; a `revision-evicted` line records a revision whose report
was evicted before the fetch; the human renderer prints the report's findings
with the revision header. Migration for `CliEnvironment.connect`: it is
required; `src/cli-entry.ts` injects root's connector, and Plan 1's
constructed environments (`src/tests/fixture.ts`, the inline environment of
`src/tests/batch-cli.test.ts`, the harness's `cli-cases.ts` and
`cli-direct-worker.ts`, `subs/cli/src/tests/arguments.test.ts`) gain a
`connect` that fails the test if called while their `check` invocations add
`--batch`, as the main plan's harness item 1 fixes; their expectations are
unchanged, the two Plan 1 tree-shape expectations that item revises for the
eleven-owner tree and the eighth package entry being the only exceptions.

## Package entries and activation

The final package map adds one entry and changes no existing target:

```json
{
  "bin": { "ramify": "dist/src/cli-entry.js" },
  "exports": {
    "./client": { "types": "./dist/subs/daemon/src/client-entry.d.ts", "import": "./dist/subs/daemon/src/client-entry.js" }
  }
}
```

| Entry | Activation | Permitted transitive runtime dependencies |
| --- | --- | --- |
| `./client` | I7 | `connect-daemon.ts`, `connection.ts`, `launcher.ts`, `discovery.ts`, `codec.ts`, `records.ts` and Node `net`, `fs`, `path`, `crypto`, `child_process`, `os`. No analysis, contexts, compiler, React, d3, MCP or web module. Type re-exports of root service, contexts and analysis vocabulary only. |
| `dist/src/daemon-entry.js` | I8; spawned by path, not a package export | Root resident assembly, daemon host and service, contexts, analysis and its children. The TypeScript package is loaded only inside the finite helpers, as in Plan 1. No CLI, React, d3, MCP or web module. |
| `bin.ramify` | I9 | CLI, root client assembly and `./client`'s closure until a check dispatches; `--batch` and eligible fallback dynamically import `src/batch.js`. `watch`, `daemon status` and `daemon stop` never import `src/batch.js`. |
| `.`, `./analysis` | I3 adds `analyzeIncrement`, `resolveProject` and the new types | Unchanged closure. |

`subs/daemon/src/client-entry.ts` exports `connectDaemon`, `selectEndpoint`,
`readDaemonRecord`, `encodeMessage`, `decodeMessage` and type re-exports. The
root `src/cli-entry.ts` keeps its Plan 1 structure: SIGINT handling, chunked
publication and the interruption/output-failure exits, adding the connector
and passing `control.signal` to every service call so a cancel frame follows
an interrupt.

## Activation summary

| Iteration | Activated originals and exposures |
| --- | --- |
| 3 | Project `ProjectResolution`, `RetainedConfiguration`, extended `ProjectReadOptions`/`ProjectRead`, `resolveProjectRoot`; analysis `InputChange`, `RetainedStageId`, `RetainedStage`, `RetainedAnalysis`, `IncrementInputs`, `IncrementRun`, `analyzeIncrement`, `resolveProject`; root R4/R3 relays of the new names; the `typescript` owner's `shared-global` fix adds no public name. |
| 4 | Contexts X1 and X2 in full; contexts testing fakes X3; daemon relay of contexts vocabulary to root (N5) as a header-plus-relay declaration so root's service interface can name them. |
| 5 | Root R6 service interface; daemon `createDaemonService`, `createFilesystemWatcher`, `createSystemClock` (N1); `encodeMessage`, `decodeMessage` with message encoding only (N2's codec line); the service, instance, budget, log, record, handshake, wire and connect types of N4 (`DaemonInstance`, `LogEntry`, `DaemonServiceOptions`, `ServiceLease`, `DaemonService`, `DaemonBudgets`, `DaemonRecord`, `StopDisposition`, `Handshake`, `Welcome`, `WireMessage`, `ConnectionState`, `DisconnectReason`, `RecoveryOutcome`, `ServiceConnection`, `ConnectOutcome`, `ServiceConnector`); root `resident-assembly.ts` and `src/tests/quick-environment.ts` with R8 and the available R7 contexts/fakes and connect/service slices. |
| 6 | No new public originals; harness handlers over the quick environment. |
| 7 | Daemon framing added to the codec under its iteration 5 names; `selectEndpoint`, `readDaemonRecord` and `connectDaemon` (the rest of N2); `EndpointSelection`, `ConnectTimeouts` and `ConnectOptions` (the discovery and client-option portion of N4); `./client` entry; root R7 relay of the remaining daemon vocabulary (its contexts/fakes and connect/service slices are active in iteration 5). |
| 8 | Daemon `startDaemon` (N3), host types and private `host.ts`; root `daemon-entry.ts`. |
| 9 | CLI C1/C2 extended with the `watch` and `daemon status` documents and `connect`; root `client.ts`; `cli-entry.ts` wiring. |
| 10 | No new public originals; all eleven declarations and eight package entries completed and validated. |
| 11–14 | No new public originals. A contract correction first revises this package. |
