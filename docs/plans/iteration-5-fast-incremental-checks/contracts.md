# Plan 5 contract review package

**Prepared:** 2026-09-11. **Reviewed and revised:** 2026-09-11. **State:**
revised contract package; RP-4 and RP-6 await the user's acceptance before
implementation of [Plan 5](main-plan.md). The [owner manifest](owners.md),
[scope and lifecycle decisions](scope.md) and
[instance inventory](subcases.md) form one review package with this
document. Changing a signature, a wire schema or an activation stage revises
this package before its consumers change.

These contract definitions govern where the frozen main plan differs,
including covering-request freshness and historical reports.
The corresponding main-plan text is revised by the exact patch preserved in
[iteration results](iterations/iteration1-results.md#publication-policy-and-preserved-main-plan-revision).
Applying it remains pending a plan revision; iteration drafts cannot edit
main-plan.md.

Every name implemented by Plans 1 and 2 is reused exactly as recorded in
their contracts unless a section below names it as revised or removed.
Removed names are listed in [Removed names](#removed-names); nothing else is
renamed.

## Conventions and dependency direction

- Facts, revisions and wire messages are frozen, acyclic plain data. Live
  ports (`ProjectObserver`, `AccessInterpreter`, `RetainedSession`) may cross
  in-process owner boundaries but are never serialized. Compiler objects,
  native snapshots and source-file objects stay private to `typescript`.
  Structured cloning does not preserve freezing; receivers freeze messages.
- Paths inside a project are root-relative with forward slashes, as in
  `CapturedInput.path`; external inputs keep the `external:` labels of Plan 1.
- Identities are SHA-256 hex strings as in `CapturedInput.sha256`; diagnostic
  identities are the `source-diagnostic/1:` values Plan 1 computes.
- `typescript` and `project` are consumed by `analysis`; `analysis` by root;
  `contexts` names only relayed `analysis` and `project` types; `daemon` and
  `cli` name root's service vocabulary. No owner imports a sibling's
  unexposed source: `typescript` names project's relayed vocabulary, which
  analysis exposes to its descendants, as `resolution.ts` names
  `ProjectInventory` and `InventoryFile` today and, from iteration 5,
  `retained-source-analysis.ts` names project's `ObservationSink`.

## TypeScript: descriptions, the interpreter and the retained adapter

`subs/analysis/subs/typescript/src/interfaces/source.ts` (iterations 2, 3 and 5)
adds the following to Plan 1's vocabulary.

```ts
export interface DescriptionDependencies {
  readonly files: readonly string[];      // owned files this description read: named, star and namespace forwarding targets
  readonly resources: readonly string[];  // owned resources described or forwarded
  readonly shims: readonly string[];      // declaration files that described those resources, root-relative or external:
  readonly absent: readonly string[];     // paths probed by resolution and found absent
}
export interface FileDescription {
  readonly file: string;
  readonly exports: FileExports;
  readonly originals: readonly CatalogOriginal[];   // originals whose defining file is this one
  readonly coverage: readonly SourceLimit[];         // notes located in this file
  readonly dependencies: DescriptionDependencies;
}
export interface CatalogDelta {
  readonly recomputed: readonly string[];            // files described afresh, in byte order
  readonly changed: readonly string[];               // files whose description changed by value ignoring positions
  readonly moved: readonly string[];                 // files whose description changed by positions only
  readonly changedOriginals: readonly OriginalId[];  // identity, kind or declarations changed
  readonly removedOriginals: readonly OriginalId[];
}
export interface AccessInterpreter {
  interpret(files: readonly string[], signal?: AbortSignal): Promise<{ readonly accesses: readonly SourceAccess[];
    readonly coverage: readonly SourceLimit[]; readonly candidates: readonly { readonly file: string; readonly paths: readonly string[] }[] }>;
  replaceDescriptions(descriptions: readonly FileDescription[], removed: readonly string[]): void;
  dispose(): Promise<void>;
}
export interface SourceChangeSet {
  readonly changed: readonly string[];
  readonly created: readonly string[];
  readonly deleted: readonly string[];
  readonly inventory: ProjectInventory | null;      // non-null when the owned file list or areas changed
  readonly invalidateAll: boolean;
}
export interface RetainedSourceInputs {
  readonly root: string;
  readonly configuration: string;
  readonly inventory: ProjectInventory;
  readonly areas: readonly SourceArea[];
  readonly limits: SourceWorkLimits;
  readonly sink: ObservationSink;
  readonly signal?: AbortSignal;
}
export interface RetainedSourceAnalysis {
  readonly hot: boolean;
  update(changes: SourceChangeSet, signal?: AbortSignal): Promise<{ readonly snapshot: number; readonly elapsedMs: number }>;
  describe(files: readonly string[], signal?: AbortSignal): Promise<{ readonly descriptions: readonly FileDescription[];
    readonly delta: CatalogDelta }>;
  catalog(): SourceCatalog;
  interpreter(): AccessInterpreter;
  releaseCompiler(): Promise<void>;
  dispose(): Promise<void>;
}
```

The public factories take owned ports and plain inputs, never a compiler
`Project`, `CatalogHost` or runtime map:

```ts
// descriptions.ts, iteration 3
export declare function describeFiles(inputs: SourceAnalysisInputs, files: readonly string[]): Promise<readonly FileDescription[]>;
export declare function assembleCatalog(descriptions: readonly FileDescription[]): SourceCatalog;
// access-interpreter.ts, iteration 2
export declare function createAccessInterpreter(inputs: SourceAnalysisInputs): Promise<AccessInterpreter>;
```

These standalone operations own a finite compiler lifetime. `describeFiles`
disposes it before returning; the interpreter releases it through `dispose`.
They do not dispose the caller's input view. The compiler-bearing constructors
and description functions are private to `typescript`, shared by the finite
helper and retained adapter. `buildCatalog` keeps its current private signature
and uses that same per-file implementation. Analysis's retained audit calls
`adapter.describe(allOwnedFiles)` and `adapter.interpreter().interpret(...)`,
then `assembleCatalog`; it never receives a native project.

`describe` on the retained adapter starts from the named files, adds every file
whose description depends on a recomputed file whose description changed by
value, runs the existing star, selection and incompleteness fixed point and
returns the delta. Files outside the set retain their descriptions by identity.
The adapter owns interpreter setup and refreshes its private snapshot reference
on every update; inventory and original maps are updated for created/deleted
files and description deltas. `replaceDescriptions` updates descriptions and
originals without rebuilding unaffected maps. `interpret(files)` returns the
same accesses and notes as a whole pass restricted to those files, plus each
file's resolution candidates as plain records. `collectAccesses` remains a
private helper wrapper. `namespace-uses.ts` builds its spelling index lazily
and batches `getSymbolAtLocation`; shorthand and export-specifier readings
remain unchanged. P5-3 measures a fixed-snapshot prototype, not this complete
maintenance contract.

`subs/analysis/subs/typescript/src/retained-source-analysis.ts` (iteration 5)
exports `createRetainedSourceAnalysis(inputs)`. It runs in the caller's
thread, which is the session worker, and creates the API client with
filesystem callbacks that read the disk directly and report every read,
existence probe, directory listing, realpath and absence to `inputs.sink`.
The synthetic configuration and resource witness are virtual files
regenerated from `changes.inventory` when it is non-null. Exactly one
snapshot remains live between calls; replacement may briefly hold the old and
new snapshots, and `update` disposes the previous one before returning.
`releaseCompiler` closes the server and disposes the snapshot; the next
`update` reopens with `invalidateAll` semantics and the same observations.
Loss of the server between calls rejects the next call with a
`SourceFailure` whose code is `read-failure`; no stale fact is returned. The
finite `compiler-helper.ts` and `bridge.ts` remain for batch.
`RetainedSourceInputs.sink` names project's `ObservationSink`, received
through analysis's A7 relay, the way `resolution.ts` names `ProjectInventory`
and `InventoryFile` today; `typescript` defines no observation type of its
own.

## Project: the observer

`subs/analysis/subs/project/src/interfaces/project.ts` (iteration 4) adds,
with the observer that implements the sink the retained adapter of iteration 5
reports to:

```ts
export interface ObservationSink {
  file(path: string, sha256: string | null, bytes: number, role: 'source' | 'resource' | 'configuration' | 'dependency'): void;
  directory(path: string, entries: readonly string[]): void;
  absent(path: string): void;
  probe(path: string, operation: 'fileExists' | 'directoryExists' | 'realPath'): void;
}
export type InputChangeKind = 'changed' | 'created' | 'deleted' | 'unknown';
export interface ObservedChange { readonly path: string; readonly kind: InputChangeKind }
export type InventoryUpdate =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'local'; readonly inventory: ProjectInventory;
      readonly descriptions: readonly string[]; readonly readmes: readonly string[];
      readonly created: readonly string[]; readonly deleted: readonly string[]; readonly changed: readonly string[] }
  | { readonly kind: 'structural'; readonly inventory: ProjectInventory }
  | { readonly kind: 'invalid'; readonly inventory: ProjectInventory | null; readonly issues: readonly ProjectIssue[] }
  | { readonly kind: 'incomplete'; readonly issues: readonly ProjectIssue[] };
export interface ProjectObserver {
  readonly inventory: ProjectInventory;
  readonly resolution: Extract<ProjectResolution, { readonly status: 'resolved' }>;
  readonly inputs: readonly CapturedInput[];
  readonly inputId: string;
  readonly sink: ObservationSink;
  apply(changes: readonly ObservedChange[], signal?: AbortSignal): Promise<InventoryUpdate>;
  reobserve(signal?: AbortSignal): Promise<readonly ObservedChange[]>;
  readDescription(path: string): Promise<string | undefined>;
  readReadme(path: string): Promise<string | undefined>;
  dispose(): Promise<void>;
}
export type ProjectObserve =
  | { readonly status: 'observing'; readonly observer: ProjectObserver }
  | Exclude<ProjectRead, { readonly status: 'acquired' }>;
```

`ObservationSink` is a synchronous port within the worker. `file` records
actual read bytes; a null hash means no bytes were read, not an absent path.
`probe` records existence/kind or canonical-path observation separately from a
read. `directory` records enumerated membership, while a directory existence
probe does not. The observer preserves the capture recipe for stat signatures,
symlink targets, exact-name checks, external labels and role precedence. Virtual
compiler files are excluded; their real-name occupancy checks are included.
Compiler callbacks are merged with acquisition observations, never substituted
for them. Coherence is validated before publication; a concurrent change yields
an explicit incomplete outcome or bounded retry.

`subs/analysis/subs/project/src/observer.ts` exports
`observeProject(options: ProjectReadOptions): Promise<ProjectObserve>`. It performs Plan 1's
acquisition once, keeps the observations instead of sealing and disposing,
and thereafter updates them: a change inside an existing area re-observes
that path, re-parses a description or re-reads a README, and returns a
`local` update; a new or removed `module.ramify`, a new directory under
`subs/`, a case or symlink violation or a layout error returns `structural`
after a whole re-inventory or `invalid` with Plan 1's issues; a read failure
returns `incomplete`. `reobserve` stats every observed path, hashes the ones
whose signature changed and returns their changes. `inputId` is computed by
the same recipe as `run-analysis.ts` over the current observations, so a
session revision and a batch report over the same inputs carry the same
identity. After an invalid update, `inventory` remains the last valid inventory;
that stale inventory is never used to publish valid facts. `readProject` is unchanged.
`resolution` is the resolution the acquisition behind `inventory` made; a structural
rebuild replaces it. `resolveProjectRoot(request, signal?, known?)` gains the optional
`known` resolutions, most recent first: the first recorded for an equal request is
returned unchanged, with no configuration helper, while every discovery query it made
answers the same on disk, and it resolves again otherwise. `resolveProject(request,
control?, known?)` passes `known` through. These additive members follow resolved
decision 5 of the [hook optimization plan](../iteration-5-hook-optimization/main-plan.md#resolved-decisions).

## Analysis: the retained session

`subs/analysis/src/interfaces/session.ts` (iterations 6 to 8):

```ts
export interface SessionLimits {
  readonly updateDeadlineMs: number;
  readonly sweepIntervalMs: number;
  readonly workerHeapMiB: number;
  readonly maxRetainedFactBytes: number;
}
export interface SessionInputs extends AnalysisInputs { readonly session: SessionLimits }
export type SessionChange = ObservedChange;
export type RevisionPath = 'cold' | 'unchanged-surface' | 'source' | 'description' | 'metadata' | 'broad';
export interface CheckedSet {
  readonly path: RevisionPath;
  readonly files: readonly string[];      // files re-interpreted or described afresh
  readonly accesses: number;              // accesses decided afresh
  readonly modelRebuilt: boolean;
}
export interface FindingDelta {
  readonly added: readonly AnalysisDiagnostic[];
  readonly removed: readonly string[];    // diagnostic identities
  readonly positionOnly: readonly string[];
}
export interface RevisionTimings {
  readonly classify: number; readonly inventory: number; readonly compiler: number; readonly descriptions: number;
  readonly accesses: number; readonly link: number; readonly decide: number; readonly publish: number; readonly total: number;
}
export interface SessionRevision {
  readonly sequence: number;
  readonly inputId: string;
  readonly inputs: readonly CapturedInput[];
  readonly changed: readonly string[];
  readonly checked: CheckedSet;
  readonly outcome: AnalysisReport['outcome'];
  readonly summary: AnalysisSummary;
  readonly diagnostics: readonly AnalysisDiagnostic[];   // the complete current list
  readonly warnings: readonly OutsideSourceWarning[];
  readonly coverage: readonly SourceLimit[];
  readonly delta: FindingDelta;
  readonly timings: RevisionTimings;
}
export type SessionUpdate =
  | { readonly status: 'revised'; readonly revision: SessionRevision; readonly identical: boolean }
  | { readonly status: 'reported'; readonly report: AnalysisReport }      // incomplete or unavailable engine outcome, unpublished
  | { readonly status: 'cancelled' };
export type VerifyOutcome =
  | { readonly status: 'equal'; readonly sequence: number; readonly elapsedMs: number }
  | { readonly status: 'mismatch'; readonly sequence: number; readonly fields: readonly string[]; readonly revision: SessionRevision }
  | { readonly status: 'cancelled' };
export interface SessionStatus {
  readonly level: 'hot' | 'warm';
  readonly sequence: number;
  readonly observedInputs: number;
  readonly factBytes: number;
  readonly worker: { readonly heapUsed: number; readonly rss: number }; // rss is process-wide, not additive per worker
  readonly compiler: { readonly pid: number | null; readonly rss: number | null };
  readonly lastSweepAt: number | null;
}
export interface RetainedSession {
  readonly current: SessionRevision | null;
  update(changes: readonly SessionChange[], control?: RunControl,
    invocation?: Pick<AnalysisInputs, 'project' | 'capabilities'>): Promise<SessionUpdate>;
  sweep(control?: RunControl): Promise<SessionUpdate | { readonly status: 'unchanged' }>;
  verify(control?: RunControl): Promise<VerifyOutcome>;
  report(control?: RunControl, sequence?: number): Promise<AnalysisReport | null>;
  releaseRevision(sequence: number): Promise<void>;
  status(): SessionStatus;
  releaseCompiler(): Promise<void>;
  dispose(): Promise<void>;
}
export type SessionOpen =
  | { readonly status: 'opened'; readonly session: RetainedSession; readonly revision: SessionRevision }
  | { readonly status: 'reported'; readonly report: AnalysisReport }
  | { readonly status: 'cancelled' };
export declare function openRetainedSession(inputs: SessionInputs, control?: RunControl): Promise<SessionOpen>;
```

Rules:

- `openRetainedSession` is implemented in `subs/analysis/src/retained-session.ts`
  while `interfaces/session.ts` stays type-only, as every other owned
  interface file is. It starts the worker from `subs/analysis/src/session-worker.ts`
  with `resourceLimits` from `session.workerHeapMiB`; the worker observes the
  project, creates the retained adapter with the observer's sink, runs the
  cold path and posts revision 1. A cold
  incomplete or unavailable result returns `reported` with the batch-shaped
  report and no session. A coherent invalid capture opens a session and
  publishes an invalid revision, preserving Plan 2 invalid-current behavior.
  If acquisition returns sealed invalid inputs before an observer exists, the
  session retains those inputs without a compiler and retries `observeProject`
  on the next update or sweep. Incomplete inputs never take this path.
- `update` runs the revision step of [scope.md](scope.md#paths-of-an-update).
  `identical: true` means every named change had an unchanged identity and
  the revision object is the current one, not a new sequence. `changed` lists
  the observed paths whose identity differed. Deadlines are the caller's:
  the session completes an update unless cancelled or failed; contexts answer requests.
  The optional invocation preserves the requesting lease's original project
  request and capability order. It must resolve to this session's canonical
  root/configuration and the same capability set; otherwise the update reports
  `invalid-invocation`. An invocation change reacquires its input envelope and
  publishes a new sequence even with no file changes. It replaces acquisition
  observations, rather than unioning observations from different callers, and
  reuses compiler facts only where their dependencies are unchanged.
- `report` materializes the `ramify.analysis/1` report of the current
  revision from retained facts, or the named sequence; null means that
  sequence's facts have been released. It equals `analyzeProject` over the
  same inputs except `runId`. Immutable historical fact versions remain
  inside the worker, share unchanged data and count against retention limits.
  `releaseRevision` releases an unpinned historical version; releasing the
  current version is rejected. Historical and published reports preserve the
  invocation facts of their own sequence. A report is never sent unrequested; revisions
  also contain complete input and diagnostic lists and have measured byte
  bounds, so they are not assumed constant-size.
- `verify` recomputes descriptions, accesses, model and decisions for every
  file from the warm compiler and compares them field by field with the
  retained facts; on mismatch it publishes the recomputed facts as a new
  revision and returns the differing fields.
- Positions: when a file's description and access facts are equal by value
  ignoring positions but positions differ, the revision is `unchanged-surface`,
  declaration evidence in the retained model is replaced before the accesses
  selecting that file's moved originals are decided again so their evidence and diagnostic identities match a
  fresh pass, and `delta.positionOnly` lists the identities that changed for
  that reason.
- Facts and indexes are frozen plain data inside the worker; `factBytes` is
  their serialization length measured at publication, bounded by
  `maxRetainedFactBytes`; exceeding it fails the update with the engine's
  `resource-limit` diagnostic in a `reported` outcome.
- `releaseCompiler` demotes to warm; `status().level` reports it.

A coherent invalid revision uses Plan 2's sealed-invalid resident identity
when the unchanged batch report has null `inputId`; its report projection keeps
that null and the batch input envelope. Session identity is metadata, not a
rewrite of the batch schema. `RunControl` cancellation still cancels; request
deadlines only bound the contexts wait and do not cancel an active update.

`increment.ts`, `retained-products.ts`, the retained input of
`run-analysis.ts` and `session.ts` and the increment types are removed in
iteration 9; `analyzeProject`, `createAnalysisSession`, `validateProject`,
`acquireInventory` are unchanged; `resolveProject` gains only the optional `known`
argument described with the observer.

## Contexts: the session driver, revisions and requests

`subs/daemon/subs/contexts/src/interfaces/contexts.ts` (iteration 9) revises:

```ts
export interface AnalysisDriver {
  resolve(request: ProjectRequest, control?: RunControl, known?: readonly ProjectResolution[]): Promise<ProjectResolution>;
  open(project: ProjectRequest, setup: ContextSetup, control?: RunControl): Promise<SessionOpen>;
  dispose(): Promise<void>;
}
export interface ContextRevision {
  readonly token: ContextToken;
  readonly revision: RevisionId;
  readonly sequence: number;
  readonly publishedAt: number;
  readonly cause: RevisionCause;            // 'open' | 'watch' | 'request' | 'sweep' | 'verify' | 'conservative'
  readonly fingerprints: InputFingerprints;
  readonly changed: readonly string[];
  readonly checked: CheckedSet;
  readonly delta: { readonly added: number; readonly removed: number; readonly positionOnly: number };
  readonly timings: RevisionTimings;
  readonly outcome: AnalysisReport['outcome'];
  readonly summary: AnalysisSummary;
}
export interface CheckRequest {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Freshness;
  readonly scope: 'report' | 'delta';
  readonly since?: RevisionId;
  readonly deadlineMs?: number;
}
export interface CheckDelta {
  readonly since: RevisionId | null;
  readonly findings: readonly (AnalysisDiagnostic & { readonly new: boolean })[];
  readonly removed: readonly string[];
  readonly warnings: readonly OutsideSourceWarning[];
  readonly coverage: readonly SourceLimit[];
}
export type CheckOutcome =
  | { readonly status: 'reported'; readonly requestId: string; readonly published: true;
      readonly revision: ContextRevision; readonly freshness: FreshnessRecord;
      readonly delta: CheckDelta; readonly report: AnalysisReport | null }     // report non-null only for scope 'report'
  | { readonly status: 'reported'; readonly requestId: string; readonly published: false;
      readonly revision: null; readonly freshness: FreshnessRecord; readonly delta: null; readonly report: AnalysisReport }
  | { readonly status: 'pending'; readonly requestId: string; readonly current: ContextStatus }
  | { readonly status: 'superseded'; readonly requestId: string; readonly revision: ContextRevision | null;
      readonly mismatches: readonly { readonly path: string; readonly expected: string | null; readonly observed: string | null }[] }
  | { readonly status: 'cold'; readonly requestId: string; readonly elapsedMs: number; readonly current: ContextStatus }
  | { readonly status: 'deadline-exceeded'; readonly requestId: string; readonly elapsedMs: number;
      readonly revision: ContextRevision | null }
  | { readonly status: 'cancelled'; readonly requestId: string }
  | (Unavailable & { readonly requestId: string });
export interface ContextBudgets {
  /* Plan 2 members unchanged, except verificationIntervalMs removed */
  readonly maxHotContexts: number;
  readonly sweepIntervalMs: number;
  readonly updateDeadlineMs: number;
}
export interface ContextStatus { /* Plan 2 members unchanged */ readonly level: 'hot' | 'warm' | 'cold'; readonly session: SessionStatus | null }
```

`RevisionCause` gains `sweep`; `reused` is removed from `ContextRevision`;
`UnavailableReason` is unchanged and `unobserved-input` keeps its meaning.
`ContextEvent` is unchanged in shape; a `revision-published` event now
carries the extended header. `AnalysisDriver.resolve` accepts optional `known`
resolutions of an equal request, most recent first, and returns one unchanged, as
the same object, only while every discovery query it made answers the same. The
manager passes the resolutions held by contexts with a live session and records
the result per context (hook optimization resolved decision 5).

Manager rules (iteration 9):

- `open` calls `driver.open` once per context and holds the session handle;
  reopening after eviction opens a new session and generation. Each lease
  retains its opening project request and capability order. A synchronized
  request freezes them at acknowledgment and passes them as the update's
  invocation; different invocation facts cannot share a covering revision.
  Published reads keep the selected revision's original invocation facts,
  preserving Plan 2's request/report rules.
- Watcher batches and sweep results become `session.update` calls; the
  manager keeps Plan 2's queue, debounce, cancellation and supersession
  rules. A synchronized request whose `expect` identities are all covered by
  the published revision is answered from it without an update only when no
  known influencing change or required sweep is pending, with
  `reusedRevision: true`; otherwise its paths join the next update. An empty
  `expect` on a synchronized plain check requires a sweep begun after
  acknowledgment; it cannot pass by vacuous coverage.
- History stores headers, diagnostics, warnings, coverage and deltas. The
  corresponding immutable fact versions stay in the session worker until
  contexts evicts that revision and calls `releaseRevision`. Count and byte
  limits include both locations, current/candidate overlap and request pins;
  shared facts are counted once. Reports are materialized with the exact
  sequence through `session.report(control, sequence)` only on demand. Null
  maps to `evicted-revision`, never to the current report. Before cold disposal,
  contexts explicitly requests the published report and retains that detached
  report under the existing history budget; older revisions are evicted.

- `CheckDelta.findings` is the covering revision's complete diagnostic list;
  `new` is true for an identity absent from the `since` revision's list, or
  from the previous retained revision when `since` is omitted; `removed`
  lists identities present there and absent now. A `since` revision no longer
  retained is `evicted-revision`.
- A request whose deadline passes before the covering revision is answered
  `cold` when the context has no published revision, otherwise
  `deadline-exceeded`; the update continues and publishes.
- `FreshnessRecord` keeps its wire shape. A covered delta request records
  `captureStarted: null`, `verified: true`, `reusedRevision: true`: coverage
  is established from coherent observations, not an invented new capture
  timestamp. An update or required sweep records its real start lower bound;
  published reads remain `verified: false`. The covering rule amends Plan 2's
  capture-after-acknowledgment rule only for nonempty delta expectations.
- `maxHotContexts` is enforced on open and on activity: the least recently
  used hot context beyond the bound receives `session.releaseCompiler()`.
  `warmIdleMs` demotes hot to warm; `coldRetainMs` disposes the session.
- Sweeps are scheduled per [scope.md](scope.md#the-sweep); `verify` is
  scheduled on idle after `sweepIntervalMs` without activity and at most once
  per revision; a mismatch increments `auditMismatches`.

## Root: the service vocabulary and the driver

`src/interfaces/service.ts` (iteration 10):

```ts
export interface CheckParams {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Freshness;
  readonly scope?: 'report' | 'delta';    // default 'report' for compatibility with Plan 2 clients
  readonly since?: RevisionId;
  readonly deadlineMs?: number;
}
export interface DaemonCounters { /* Plan 2 members */ readonly sweeps: number; readonly audits: number; readonly auditMismatches: number;
  readonly coveredRequests: number; readonly coldOutcomes: number; readonly deadlineOutcomes: number }
```

`RamifyService.check` returns the extended `CheckOutcome`. The daemon's
validator (iteration 10) accepts `scope` as one of the two strings, `since`
as a `rev/1:` identifier and `deadlineMs` as a positive safe integer at most
600,000, and returns `invalid-request` otherwise. `src/resident-assembly.ts`
(iteration 9) exports `createSessionDriver()` implementing the revised port
over `openRetainedSession` with Plan 2's limits plus the session limits from
`resident-budgets.ts`; `createAnalysisDriverFromSessions` is removed.

## CLI: arguments, documents and exits

`subs/cli/src/arguments.ts` (iteration 10) accepts
`check [--root <dir>] [--format json] [--batch] [--changed <path>...] [--since <revision>] [--deadline <ms>]`;
`--changed` takes one or more paths until the next flag; `--since` and
`--deadline` require `--changed`; `--batch` with `--changed` is an invalid
invocation. `subs/cli/src/interfaces/cli.ts` adds:

```ts
export interface CheckDocument {
  readonly schemaVersion: 'ramify.check/1';
  readonly root: string;
  readonly revision: { readonly id: RevisionId; readonly sequence: number; readonly path: RevisionPath } | null;
  readonly since: RevisionId | null;
  readonly changed: readonly { readonly path: string; readonly sha256: string | null; readonly covered: boolean }[];
  readonly outcome: 'checked' | 'not-checked';
  readonly reason: 'cold' | 'deadline-exceeded' | 'unobserved-input' | 'superseded' | 'incomplete' | 'unavailable' | 'stopped' | 'incompatible' | 'evicted-revision' | 'resource-unavailable' | 'analysis-failed' | 'unknown-context' | 'expired-generation' | 'unsupported-setup' | 'disposed' | null;
  readonly execution: AnalysisReport['outcome']['execution'] | null;
  readonly findings: readonly (AnalysisDiagnostic & { readonly new: boolean })[];
  readonly removed: readonly string[];
  readonly warnings: readonly OutsideSourceWarning[];
  readonly coverage: readonly SourceLimit[];
  readonly checked: CheckedSet | null;
  readonly timings: { readonly daemon: RevisionTimings | null; readonly waitedMs: number; readonly totalMs: number };
  readonly exitCode: 0 | 1 | 2;
}
```

Human output prints one line per finding with `new` marked, a summary line
naming the path, the checked set and the wait, and the `Mode:` line. JSON
output writes exactly one `CheckDocument`. Exits follow the
[main plan](main-plan.md#exits). The `--changed` command never calls
`environment.batch`; an unavailable daemon after exhausted recovery is
`not-checked` with reason `unavailable` and exit 2.

`examples/hooks/claude-code-post-write.mjs` (iteration 10) reads the host's
hook JSON from standard input, takes `tool_input.file_path`, runs
`ramify check --changed <path> --format json` with the project root
discovered from the file's directory, prints the new findings to standard
error and exits 2 when there are any, 0 otherwise, and 0 with a one-line
notice when the check was not checked, so a cold daemon never blocks the
agent; the notice names the reason. It imports no toolkit source.

## Removed names

| Name | Owner | Removed in |
| --- | --- | --- |
| `analyzeIncrement`, `IncrementInputs`, `IncrementRun`, `InputChange`, `RetainedStageId`, `RetainedStage`, `RetainedAnalysis` | analysis | 9 |
| `createAnalysisDriverFromSessions` | root | 9 |
| `ContextRevision.reused`, `ContextBudgets.verificationIntervalMs`, `AnalysisDriver.check` | contexts | 9 |
| `collectAccesses` as a public shape (kept as a private wrapper over the interpreter) | typescript | 2 |

`buildCatalog` keeps its name and signature over `assembleCatalog`.

## Package entries and activation

No package entry is added or removed; the eight entries and `bin` stand.
[owners.md](owners.md) lists the activation stage of every declaration line:
iteration 2 activates the interpreter and namespace lines, 3 the
description lines, 4 the observer lines together with `ObservationSink` and
its A7 relay, 5 the retained adapter lines, 6 to 8 the session lines, 9 the revised contexts port and the removals, 10 the
service and CLI lines, and 13 verifies the final texts through
`scripts/validate-final-contracts.ts`.

## Iteration 1 review outcome

Revised from draft on 2026-09-11; RP-4 and RP-6 remain proposed and await the
user's acceptance. The eight rows of the main plan's contract table were
reviewed against these definitions. Corrections separate live ports from
serialized data, keep compiler-bearing factories private, give the observation
sink an explicit probe operation, preserve exact historical report reads and
nonempty covering-request freshness and per-lease invocation facts,
refresh model declaration evidence, preserve coherent invalid publication and
complete the CLI reason union. Activation remains 2/3/4/5/6–8/9/10/13.
The [probe record](probes.md) records measured feasibility and remaining gaps;
this review does not establish an I5 acceptance instance.
