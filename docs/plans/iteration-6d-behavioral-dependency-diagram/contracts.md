# Plan 6D contracts

**Date:** 2026-09-17. **Status:** accepted on 2026-09-17. Companion to the
[main plan](main-plan.md). TypeScript excerpts fix semantics and ownership; the
implementation may split declarations across owner-local files without changing
their serialized shapes.

**Revision, 2026-09-17, iteration 8:** C8-C10 specify the scope-aware roll-up
accepted in the [main plan's revision](main-plan.md#review-decisions), and C7's
default settings change with them. C1-C6 are unchanged: the analyzer, the daemon
operation, the projection, the DTO and the wire result stay exactly as
implemented, and nothing in C8-C10 starts an analysis run.

## C1. Compiler evidence

The existing aggregate fact remains the headline input. `accesses` preserves
which import path supplied the evidence:

```ts
export interface DependencyBehaviorAccessFact {
  readonly accessId: string;
  readonly classification:
    | 'behavioral' | 'non-behavioral' | 'unused' | 'unknown';
  readonly evidence: readonly BehaviorEvidence[];
  readonly limitIds: readonly string[];
}

export interface DependencyBehaviorFact {
  readonly consumer: SourceOrigin;
  readonly original: OriginalId;
  readonly accessIds: readonly string[];
  readonly accesses: readonly DependencyBehaviorAccessFact[];
  readonly classification: BehaviorClassification;
  readonly evidence: readonly BehaviorEvidence[];
  readonly limitIds: readonly string[];
}
```

One access fact combines every selection of the same original in one
`SourceAccess`. It is ordered by `accessId`; `accessIds` contains exactly the
same IDs. The aggregate fact applies the fixed precedence across its access
facts. No compiler node, symbol or type leaves the classifier call.

Adding `accesses` is a capability-local additive change to
`ramify.analysis/1`. Ordinary reports do not request the capability and remain
byte-for-byte unchanged after volatile run identity is removed.

The `behavior` operation may classify supplied imports instead of the lifetime's
own:

```ts
export interface SourceAnalysis {
  // existing members unchanged
  dependencyBehavior(signal?: AbortSignal,
    supplied?: SuppliedAccesses): Promise<DependencyBehaviorFacts>;
}

export interface SuppliedAccesses {
  readonly accesses: readonly SourceAccess[];
  readonly limits: { readonly maxFactBytes: number };
}
```

With `supplied`, the helper's `behavior` command receives the imports through a
parent-served input request, in the same way `interpret` receives its inputs,
and classifies them without building the export catalog or interpreting
imports. Its result equals the batch path's facts when the supplied imports are
the ones that path collected over the same inputs. The helper observes
cancellation between consumer files and returns no partial facts.

Every classifier run increments one `behaviorRuns` counter owned by the
classifier. The analyzer reports it to the daemon counters; hook-isolation
evidence uses it, together with the helper's recorded commands.

## C2. Dependency diagram facts

`analysis` owns one pure projection:

```ts
export function projectDependencyDiagram(input: {
  readonly revision: string;
  readonly report: AnalysisReport; // requested dependency-behavior
  readonly ownership?: CandidateOwnership;
  readonly limits: { readonly maxResultBytes: number };
}): DependencyDiagramOutcome;

export interface DependencyBoundaryFact {
  readonly consumer: ModuleId;
  readonly importedModule: ModuleId;
  readonly originalOwner: ModuleId;
  readonly original: OriginalId;
  readonly classification:
    | 'behavioral' | 'non-behavioral' | 'unknown';
  readonly consumerFiles: readonly string[];
  readonly importedFiles: readonly string[];
  readonly originalFiles: readonly string[];
  readonly accessIds: readonly string[];
  readonly status: 'allowed' | 'limited' | 'denied';
  readonly reasons: readonly ImportReason[];
  readonly limitIds: readonly string[];
}

export interface DependencyDiagramFacts {
  readonly inputId: string;
  readonly modules: readonly ModuleId[];
  readonly headline: BehavioralDependencyMetrics;
  readonly boundaries: readonly DependencyBoundaryFact[];
  readonly coverage: {
    readonly state: 'complete' | 'partial';
    readonly unknownDependencies: number;
    readonly limitIds: readonly string[];
  };
}

export type DependencyDiagramOutcome =
  | { readonly status: 'projected'; readonly diagram: DependencyDiagramFacts }
  | { readonly status: 'refused';
      readonly reason: 'analysis-incomplete' | 'not-requested'
        | 'capability-failed' | 'resource-limit';
      readonly observedBytes?: number; readonly maximumBytes?: number };

export interface ModularityView {
  // existing fields unchanged
  readonly dependencyDiagram: Metric<DependencyDiagramFacts>;
}
```

`projectModularity` calls the same function for each view, so the batch probe
and the daemon cannot produce different answers. Adding the required field
changes the modularity schema to `ramify.modularity/2`; iteration 2 regenerates
the recorded baselines.

`modules` lists every module of the production view, including modules with no
dependency. There is at most one boundary fact per
`(consumer, importedModule, original)`. All arrays and facts are in UTF-8 byte
order. Unused facts are absent. Unknown facts are present only to prevent an
original-owner projection from treating a partially classified original as
known and to attach coverage; they never contribute a displayed count.

Facts whose consumer owns the original are absent. Facts whose consumer equals
the imported module create no imported edge downstream, but may still support a
headline/original-owner dependency when the original is foreign. Neither
projection serializes a self-loop.

For original-owner aggregation, regroup boundary facts by
`(consumer, original)` and apply the same precedence. Therefore a known
non-behavioral use through `B` and an unknown use through `C` may show the known
`A -> B` boundary as a partial lower bound, but the original-owner dependency
is omitted as unknown. A behavioral use through either boundary settles the
headline dependency as behavioral.

`status` and `reasons` come from the `ImportDecision` entries whose `original`
is this fact's original, in the contributing accesses' `AccessResult`s, with
precedence `denied > limited > allowed`. `limited` means a contributing access
result for this original carries coverage, or its outcome is `unverifiable` or
`mixed`. Decisions for other originals selected by the same access never affect
the fact.

`headline` equals the existing `behavior` metric for the same view. The
implementation asserts equality rather than calculating two independent public
answers. Candidate ownership resolves all three module roles from files under the
candidate mapping; the declared original owner stored in `OriginalId` is not
used as candidate ownership.

## C3. Lean dependency analyzer

`analysis` owns the analyzer function; root owns its process entry and runner:

```ts
export function analyzeDependencyDiagram(input: {
  readonly project: ProjectRequest;       // the context's resolved request
  readonly report: AnalysisReport;        // the published revision's report
  readonly limits: DependencyAnalyzerLimits;
}, control?: RunControl): Promise<DependencyAnalyzerOutcome>;

export interface DependencyAnalyzerLimits {
  readonly source: SourceWorkLimits;      // existing batch values
  readonly maxResultBytes: number;        // 16 MiB
  readonly deadlineMs: number;            // 120 000
}

export type DependencyAnalyzerOutcome =
  | { readonly status: 'ready'; readonly diagram: DependencyDiagramFacts;
      readonly behaviorRuns: number;
      readonly timings: { readonly acquireMs: number; readonly projectMs: number;
        readonly classifyMs: number; readonly totalMs: number } }
  | { readonly status: 'inputs-changed'; readonly paths: readonly string[] }
  | { readonly status: 'cancelled' }
  | { readonly status: 'unavailable';
      readonly reason: 'invalid-report' | 'analysis-failed' | 'resource-limit';
      readonly message: string };

export interface DependencyDiagramRunner {
  run(input: { readonly project: ProjectRequest; readonly report: AnalysisReport },
    control?: RunControl): Promise<DependencyAnalyzerOutcome>;
}
```

The function:

1. Refuses a report whose execution is not completed as `invalid-report`.
2. Acquires the project with the existing acquisition code and compares its
   inventory and areas with the report. Any difference is `inputs-changed`.
3. Starts the compiler helper over the acquired input view with the report's
   areas and runs `behavior` with the report's `snapshot.accesses` supplied.
4. Seals the input view after the helper run and compares each input it
   captured (path, role, SHA-256 and bytes) with the same path in
   `report.snapshot.inputs`. A different identity, or a read the report did not
   record, is `inputs-changed` with the differing paths, and no diagram is
   returned. Report inputs the lean run never read cannot affect its result and
   are not compared.
5. Forms a report copy with the facts and a request that includes
   `dependency-behavior`, calls `projectDependencyDiagram` and returns the
   frozen diagram. The report copy and aggregate facts are discarded.

It performs no discovery beyond acquisition, no description linking, export
cataloging, import interpretation or evaluation, and never opens a retained
session.

Root's runner starts one Node child per run with an analyzer entry, sends the
request on standard input, reads one JSON outcome from standard output within
the report's existing response capacity, and terminates the child on
cancellation, the deadline or an oversized response. The child exits after
writing its outcome; both it and the compiler helper settle within the existing
5-second disposal limit.

## C4. Daemon operation

Root service vocabulary gains:

```ts
export type ServiceOperation = /* existing */ | 'dependencyDiagram';
export type ServiceCapability = /* existing */ | 'dependencyDiagram';

export interface DependencyDiagramRequest {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly revision: RevisionId;
}

export type ContextDependencyDiagramOutcome =
  | { readonly status: 'ready'; readonly requestId: string;
      readonly revision: ContextRevision;
      readonly diagram: DependencyDiagramFacts }
  | { readonly status: 'busy'; readonly requestId: string;
      readonly revision: ContextRevision;
      readonly reason: 'analysis-running' | 'inputs-changed' }
  | { readonly status: 'superseded'; readonly requestId: string;
      readonly revision: ContextRevision | null }
  | { readonly status: 'cancelled'; readonly requestId: string }
  | { readonly status: 'unavailable'; readonly requestId: string;
      readonly reason: 'resource-unavailable' | 'invalid-current'
        | 'analysis-failed' | 'resource-limit';
      readonly message: string };

export interface RamifyService {
  // existing members unchanged
  dependencyDiagram(params: DependencyDiagramRequest, control?: RunControl):
    Promise<ServiceResult<ContextDependencyDiagramOutcome>>;
}

export interface DaemonCounters {
  // existing fields unchanged
  readonly behaviorRuns: number;
  readonly dependencyDiagrams: number;
  readonly dependencyDiagramInputChanges: number;
}
```

Root assembly injects a `DependencyDiagramRunner` into the daemon service, as it
injects the analysis driver today. The daemon never imports the analyzer.

The context manager answers in this order: unknown context or earlier
generation as today; `superseded` unless `revision` is the published revision;
`invalid-current` unless that revision's report completed; `ready` from the
retained result; join a running job for the same context and revision;
`busy/analysis-running` while any other job runs; otherwise start a job.

A job pins the revision and calls the runner with the context's resolved
project request, the published report and a job-owned abort controller.
Publication of a newer revision aborts the controller and answers waiting
callers `superseded`. A caller's cancellation detaches only that caller, and the
job aborts when no caller remains. An `inputs-changed` outcome answers
`busy/inputs-changed` and increments `dependencyDiagramInputChanges`. A job
never restarts without a request.

A `ready` outcome is retained as the context's single diagram result when
`retainedBytes` stays within `maxRetainedBytesPerContext` and the global budget;
otherwise the callers receive `unavailable/resource-limit` and nothing is
retained. The result is released when a newer revision publishes, on eviction
and on close. Demotion does not release it, because it holds no compiler state.

The job does not enter the context queue or the retained session. The ordinary
`check`, `materialize`, `explorerDetails` and `subscribe` operations never call
the runner, never request `dependency-behavior` and do not change their outputs.

## C5. Explorer dependency DTO

`service-api` maps one daemon-ready result, without analysis runtime code:

```ts
export function createExplorerDependencyModel(input: {
  readonly revision: ContextRevision;
  readonly diagram: DependencyDiagramFacts;
  readonly maxBytes: number;          // 16 MiB
}): ExplorerDependencyModelOutcome;

export interface ExplorerDependencyCount {
  readonly behavioral: number;
  readonly nonBehavioral: number;
}

export interface ExplorerImportedCount {
  readonly behavioralUsedOriginals: number;
  readonly nonBehavioralUsedOriginals: number;
}

export interface ExplorerDependencyModule {
  readonly id: ModuleId;
  readonly uses: ExplorerDependencyCount;
  readonly usedThrough: ExplorerImportedCount;
  readonly ownedUsedByOthers: ExplorerDependencyCount;
}

export interface ExplorerDependencyEvidence {
  readonly original: OriginalId;
  readonly originalOwner: ModuleId;
  readonly importedModule: ModuleId;
  readonly classification: 'behavioral' | 'non-behavioral';
  readonly consumerFiles: readonly string[];
  readonly importedFiles: readonly string[];
  readonly originalFiles: readonly string[];
  readonly accessIds: readonly string[];
  readonly status: 'allowed' | 'limited' | 'denied';
  readonly reasons: readonly ImportReason[];
  readonly coverageIds: readonly string[];
}

export interface ExplorerImportedDependencyEdge {
  readonly id: string;
  readonly projection: 'imported-module';
  readonly consumer: ModuleId;
  readonly provider: ModuleId;
  readonly counts: ExplorerImportedCount;
  readonly originalOwners: readonly {
    readonly owner: ModuleId;
    readonly counts: ExplorerImportedCount;
  }[];
  readonly evidence: readonly ExplorerDependencyEvidence[];
}

export interface ExplorerOriginalDependencyEdge {
  readonly id: string;
  readonly projection: 'original-owner';
  readonly consumer: ModuleId;
  readonly provider: ModuleId;
  readonly counts: ExplorerDependencyCount;
  readonly importedThrough: readonly {
    readonly module: ModuleId;
    readonly counts: ExplorerImportedCount;
  }[];
  readonly evidence: readonly ExplorerDependencyEvidence[];
}

export interface ExplorerDependencyModel {
  readonly schemaVersion: 'ramify.explorer-dependencies/1';
  readonly inputId: string;
  readonly state: 'complete' | 'partial';
  readonly project: ExplorerDependencyCount;
  readonly modules: readonly ExplorerDependencyModule[];
  readonly importedModuleEdges: readonly ExplorerImportedDependencyEdge[];
  readonly originalOwnerEdges: readonly ExplorerOriginalDependencyEdge[];
  readonly coverage: {
    readonly unknownDependencies: number;
    readonly limitIds: readonly string[];
  };
}

export type ExplorerDependencyModelOutcome =
  | { readonly status: 'mapped'; readonly model: ExplorerDependencyModel;
      readonly encodedBytes: number }
  | { readonly status: 'refused';
      readonly reason: 'identity-mismatch' | 'inconsistent-counts'
        | 'resource-limit';
      readonly message: string };
```

`uses` and original-owner edges use distinct `(consumer, original)` units.
`usedThrough` and imported-module edges use distinct
`(consumer, importedModule, original)` units. The mapping refuses when
`revision.fingerprints.inputId != diagram.inputId`, and when its aggregation
differs from `diagram.headline`, rather than publishing inconsistent counts.

`modules` contains one row for each of `diagram.modules`, including a zero row
when that module has no production dependency. Thus module selection never
turns absence from this array into an unavailable metric.

Evidence status, reasons, files and limit IDs are copied from C2 boundary facts.
The mapping never recomputes them. Imported-edge details use `importedFiles`;
original-owner edge details use `originalFiles`. Neither may relabel the other
as its provider file.

Edge IDs are:

```text
dependency-edge/1:<projection>:<sha256(JSON([consumer, provider]))>
```

The full digest is serialized. Ordering is modules by ID, edges by consumer
then provider, breakdowns by module ID, and evidence by original identity then
imported module, all in UTF-8 byte order.

## C6. Wire result, router and client

```ts
export type DependencyViewResult =
  | { readonly status: 'ready';
      readonly revision: ContextRevision;
      readonly view: ExplorerDependencyModel }
  | { readonly status: 'pending';
      readonly revision: ContextRevision;
      readonly phase: 'waiting' | 'analyzing' }
  | { readonly status: 'superseded';
      readonly current: RevisionId | null;
      readonly reason: string }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface ExplorerClient {
  // existing methods unchanged
  dependencyView(input: {
    readonly revision: RevisionId;
  }): Promise<DependencyViewResult>;
}
```

The router accepts exactly `{ revision }` and follows the main plan's router
table. Per binding it keeps at most one in-flight daemon request and one settled
DTO, both for the newest requested revision; a request for another revision
aborts the in-flight request, and a newer published revision releases the DTO.
A daemon `busy` answer is remembered for one second as `waiting`, so
polling cannot start more than one daemon request per second. A daemon
`superseded` answer is returned as `superseded`; the router never retries it
with another revision.

The response is ready only when:

```text
resident published revision == response revision
response revision.fingerprints.inputId == view.inputId
```

No response combines a dependency model with module structure. The browser
performs the final equality check against its displayed project view before
supplying both to the view.

## C7. Browser state

The connected page holds these independent values:

```ts
interface PublishedDependencyView {
  readonly data: ExplorerDependencyModel | null;
  readonly phase: 'idle' | 'waiting' | 'analyzing'
    | 'ready' | 'superseded' | 'unavailable';
  readonly reason: string | null;
  readonly isStale: boolean;
  refresh(): void;
}
```

After `projectView` becomes ready, the hook requests its exact revision.
Pending polling is visible-page-only and at least one second apart, and stops
on ready, superseded or unavailable. A newer published revision marks both views
stale. Refresh first obtains the newest project view, then requests its
dependency result. A late dependency response whose input ID differs from the
currently displayed project view is discarded.

UI settings are local and default on every page load to:

```ts
{ showNonBehavioral: false, depthMode: 'level', showOutsideScope: true }
```

They persist across refresh of the same mounted page and across scope changes,
but are not stored in a cookie, URL or server cache in Plan 6D. The earlier
`linkTarget: 'imported-module'` default is replaced by `depthMode`, as C9
records.

## C8. Scope, roll-up and drawn links

`presentation/project-view` owns these pure functions. They read the C5 model
the view already receives and add no request, no DTO field and no analysis.

```ts
export type DependencyDepthMode = 'level' | 'exact';

/** The region the graph shows. */
export interface DependencyScope {
  /** The module whose own source the frame represents; null when there is none. */
  readonly frameModule: ModuleId | null;
  /** The scope's children before the class filter: its candidate nodes. */
  readonly nodes: readonly ModuleId[];
  /** The depth of `nodes`; an outside end maps to depth `depth - 1`. */
  readonly depth: number;
}

export type ScopeEnd =
  | { readonly kind: 'node'; readonly module: ModuleId;
      readonly inScope: boolean }
  | { readonly kind: 'frame' };

export function dependencyScope(
  model: ProjectExplorerModel, scopeModuleId: ModuleId | null): DependencyScope;

export function scopeEnd(module: ModuleId, scope: DependencyScope,
  depthMode: DependencyDepthMode, tree: ModuleTreeIndex): ScopeEnd;
```

`dependencyScope` reproduces the view's existing scope selection: the children
of `scopeModuleId`; otherwise the root module's children when exactly one
top-level module has children; otherwise the top-level modules. `frameModule` is
`scopeModuleId`, the root module in the second case and null in the third.
`depth` is the module-tree depth of `nodes`.

In `level` mode `scopeEnd` applies these clauses in order:

1. `module` is one of `scope.nodes` or a descendant of one: that node, in scope.
2. `module` is `scope.frameModule`: the frame.
3. Otherwise `module` is outside the scope: its ancestor at depth
   `scope.depth - 1`, or `module` itself when its depth is at most
   `scope.depth - 1`, not in scope.

In `exact` mode every end is its own module, in scope when it is the frame
module or a descendant of it, and there is no frame folding: a module that is
not a displayed node is drawn out of view exactly as iteration 6 drew it.

An end never depends on the class filter or on the settings. `ModuleTreeIndex`
is the parent and children index the view already builds from
`ProjectExplorerModel.modules`; no new served field is needed.

```ts
export interface ActiveDependencyEdge {
  readonly id: string;
  readonly depthMode: DependencyDepthMode;
  /** The consuming node at this scope. */
  readonly consumer: ModuleId;
  /** The providing node at this scope. */
  readonly provider: ModuleId;
  readonly behavioral: number;
  readonly nonBehavioral: number;
  readonly displayed: number;
  readonly emphasis: 'behavioral' | 'non-behavioral';
  readonly status: 'allowed' | 'limited' | 'denied';
  /** One end is outside the scope's subtree; false when the scope covers
   * the project. */
  readonly leavesScope: boolean;
  readonly coverageIds: readonly string[];
  /** The exact edges rolled into this link; exactly one in `exact` mode. */
  readonly sources: readonly DependencyGraphOriginalEdge[];
}

export function scopeDependencyLinks(input: {
  readonly model: DependencyGraphModel;
  readonly scope: DependencyScope;
  /** The class-filtered nodes actually drawn at this scope. */
  readonly displayed: ReadonlySet<ModuleId>;
  readonly tree: ModuleTreeIndex;
  readonly settings: DependencySettings;
}): readonly ActiveDependencyEdge[];

/** True when every module maps to a node or the frame: nothing can leave. */
export function scopeCoversProject(scope: DependencyScope,
  modules: readonly ModuleId[], tree: ModuleTreeIndex): boolean;
```

`scopeDependencyLinks` reads `model.originalOwnerEdges` only, and never
`importedModuleEdges`:

1. Map both ends of each edge with `scopeEnd`.
2. Drop an edge with a frame end. It is drawn at no scope and appears only in
   the panel numbers of C10.
3. Drop an edge whose two ends map to one node: it is internal to that node.
4. Drop an edge with no end in `displayed`, as iteration 6 dropped an edge
   between two out-of-view modules.
5. Group the remaining edges by the ordered pair of mapped node IDs. Each group
   is one link, and `sources` holds its edges ordered by consumer then provider.
6. Count the group's pairs. A pair is `(exact consumer module, original
   identity)`, taken from every contributing edge's evidence rows; the original
   identity is the view's existing `OriginalId` key. A pair is behavioral when
   any of its rows is behavioral, and non-behavioral otherwise. `behavioral` and
   `nonBehavioral` are the numbers of pairs of each class, never a sum of the
   contributing edges' counts. The two agree, because a pair has exactly one
   consumer module and exactly one original owner; tests verify the equality
   rather than substituting the sum.
7. `status` is denied, then limited, then allowed over all contributing
   evidence. `coverageIds` is their sorted union.
8. `displayed` is `behavioral + (showNonBehavioral ? nonBehavioral : 0)`, a link
   with `displayed === 0` is not drawn, and `emphasis` is behavioral when
   `behavioral > 0`, as iteration 6 fixed it.
9. `leavesScope` is true when either mapped end is not in scope. When
   `settings.showOutsideScope` is false such a link is not drawn.
10. Links are ordered by consumer then provider in UTF-8 byte order.

In `exact` mode clause 2 never applies and clause 3 never applies, because
every end is its own module and C2 serializes no self-loop. Clause 4 keeps
iteration 6's drawn set exactly: a link between a displayed node and one of its
own descendants stays drawn, with the descendant out of view.
`scopeCoversProject` is true when the scope's subtree contains every module,
which holds at the project scope of a single-root project. When it is true no
link can leave the scope, the toggle is not rendered and `showOutsideScope` is
ignored.

Link IDs are:

```text
level: scoped-link/1:level:<scope module ID or ->:<JSON([consumer, provider])>
exact: the model's own dependency-edge/1:original-owner:<digest>
```

A rolled-up ID contains its scope, so it cannot survive a scope change. An
exact ID is the C5 edge ID, so it survives while that link is still drawn. The
view hashes nothing.

Out-of-view nodes are the mapped ends that are not in `displayed`, as today,
and keep the existing level helper. `linkWidth`, `edgeStatus` and the colour
encoding keep their iteration 6 meaning over the rolled-up `displayed` count.
`activeDependencyEdges` is replaced by `scopeDependencyLinks`;
`ActiveDependencyEdge.projection` becomes `depthMode` and its single `source`
becomes `sources`.

## C9. Settings, controls and selection

```ts
export interface DependencySettings {
  readonly showNonBehavioral: boolean;
  readonly depthMode: DependencyDepthMode;
  readonly showOutsideScope: boolean;
}

export const defaultDependencySettings: DependencySettings = Object.freeze({
  showNonBehavioral: false, depthMode: 'level', showOutsideScope: true,
});
```

`DependencyLinkTarget` and `linkTarget` are removed from the reusable
interfaces, the view, the explorer page and the browser acceptance helpers.

The controls are:

| Control | Accessible name | Behavior |
| --- | --- | --- |
| Checkbox | `Show non-behavioral dependencies` | Unchanged from iteration 6. |
| Radio group `Link depth` | `Modules at this level`, `Exact module` | Keeps iteration 6's roving tab stop and arrow/Home/End keys. |
| Checkbox | `Show dependencies that leave this module` | Default on. Absent when `scopeCoversProject` is true. |

All three are disabled while no dependency model is loaded. None invokes a data
callback: `onDependencySettingsChange` reports the new value, and the explorer
page keeps the settings across scope changes and refreshes.

Selection reconciliation keeps iteration 6's effect shape, with the page's
selection state authoritative:

- A module selection survives while that module is a displayed node; otherwise
  the view reports `onSelectModule(null)`. Out-of-view nodes stay unselectable.
- A link selection survives only while its exact ID is among the drawn links.
  Hiding non-behavioral links clears a non-behavioral-only selection; hiding
  leaving links clears a selected leaving link; changing the depth mode clears a
  rolled-up selection; changing the scope clears a rolled-up selection and keeps
  an exact selection while its link is still drawn; a new model clears a
  selection whose ID it no longer contains.
- Reconciliation never requests data and never changes the scope.

Drilling into a node and breadcrumb navigation change only `scopeModuleId`, as
today. The new scope's frame is that module, its children become the nodes, and
the links that were internal to it become visible. C6 and C7 are unchanged, so
`dependencyView` is still requested only by the page's revision-bound hook: no
control and no scope change issues a request.

## C10. Panel numbers per scope

```ts
export interface SubtreeDependencyCounts {
  readonly uses: DependencyGraphCount;
  readonly ownedUsedByOthers: DependencyGraphCount;
  readonly usedThrough: DependencyGraphImportedCount;
}

/** The measured totals of a module and all of its descendants. */
export function subtreeDependencyCounts(model: DependencyGraphModel,
  module: ModuleId, tree: ModuleTreeIndex): SubtreeDependencyCounts;

/** The distinct pairs the given links carry. */
export function scopeLinkCounts(
  links: readonly ActiveDependencyEdge[]): DependencyGraphCount;
```

`subtreeDependencyCounts` adds the C5 rows of the module and its descendants
component by component. The sums are distinct counts, because a `(consumer
module, original)` pair appears in exactly one consumer's row and an imported
triple in exactly one imported module's row.

`scopeLinkCounts` adds the links' counts, which are distinct pairs because a
pair maps to exactly one ordered node pair. The panels use the scope's links
after the internal, frame, touching and leaving rules and before the
non-behavioral display filter, so a panel number does not move when the
non-behavioral setting changes; the non-behavioral card keeps its `not drawn`
and `shown` note.

| Panel | Filtered | Measured |
| --- | --- | --- |
| No selection | `This view`: `scopeLinkCounts` of the scope's links | `Whole project`: `model.project` |
| Module node | `At this level`: the scope's links with this node as consumer, and as provider | `Including internals`: `subtreeDependencyCounts` |
| Rolled-up link | `At this level`: the link's own counts | the contributing exact modules and their counts |
| Exact link | the link's counts, as iteration 6 | the same |

The panels show, in each scope:

- No selection: the two headline card pairs above; `Not drawn at this level` as
  their component-wise difference, described as internal to a displayed node,
  folded into the scope's own source, or outside the scope while leaving links
  are hidden; `Displayed links`, coverage, revision and input as today; and, in
  a drilled-in scope, a `Scope's own source` section with the frame module's own
  `Uses` and `Owned originals used by others` rows and the statement that its
  links are not drawn at this scope.
- A displayed module node: `Uses` and `Owned originals used by others`, each
  `At this level` against `Including internals`; `Used through this module` with
  its imported unit, `Including internals` only, in a disclosure, because no
  drawn link uses the imported unit; `Links displayed`, owned and subtree files
  and coverage as today.
- A rolled-up link: its `At this level` cards; a `Rolled-up modules` section
  listing each contributing edge as exact consumer and exact original owner with
  its counts; an `Imported through` disclosure summing the contributing edges'
  `importedThrough` entries per module; supporting consumer and original
  declaration files, status and reason badges and coverage IDs; and the
  referenced originals grouped by original with their exact consumer and owner.
- An exact link: iteration 6's original-owner panel, unchanged.

`This view` and `At this level` follow the drawn scope, including the class
filter. `Whole project` and `Including internals` are the measured numbers and
change with no scope, control or filter. Every number comes from the C5 model;
the view recomputes nothing the projection already measured.
