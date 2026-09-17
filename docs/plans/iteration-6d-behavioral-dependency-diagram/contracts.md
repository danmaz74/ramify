# Plan 6D contracts

**Date:** 2026-09-17. **Status:** accepted on 2026-09-17. Companion to the
[main plan](main-plan.md). TypeScript excerpts fix semantics and ownership; the
implementation may split declarations across owner-local files without changing
their serialized shapes.

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
{ showNonBehavioral: false, linkTarget: 'imported-module' }
```

They persist across refresh of the same mounted page but are not stored in a
cookie, URL or server cache in Plan 6D.
