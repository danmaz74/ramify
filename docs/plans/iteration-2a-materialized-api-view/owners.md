# Plan 2A ownership and file map

**Status:** proposed placement for [Plan 2A](main-plan.md). The existing
eleven-owner tree remains. This plan adds no module and no package entry.

## Responsibility map

| Owner | Responsibility added | Must not own |
| --- | --- | --- |
| `analysis/model [browser]` | Pure available-original enumeration and the shared tag/test requirement helper. | Filesystem paths, Markdown or compiler details. |
| `analysis/typescript` | Resolve a defining-file export in the live compiler and return bounded body-free signature/docs. | Visibility rules or output publication. |
| `analysis/project` | Canonical classification of `.ramify` final/transient generated paths for inventory and observation. | Rendering or daemon lifecycle. |
| `analysis` | Join retained inventory/model/catalog/details into complete area projections; host the retained query. | Output filesystem writes or IPC. |
| `daemon/contexts` | Serialize synchronized projection requests against one current revision and lease. | Rendering or filesystem writes. |
| `daemon [dispatch]` | Render documents, publish/rollback files, validate/dispatch service requests and keep the large projection in-process. | Model decisions or agent search behavior. |
| root `ramify [dispatch]` | Public service relays and resident assembly injection. | Feature algorithms. |
| `cli [dispatch]` | Parse and execute `materialize`, print the compact outcome and clean up connections. | Projection, rendering or publication algorithms. |

## Planned source changes

### `analysis/model`

- Add `subs/analysis/subs/model/src/availability.ts` and focused tests under
  its `src/tests/`.
- Refactor only the common requirement logic in `decisions.ts`; keep existing
  `explainImport` output byte-equivalent.
- Add `AvailableForm` and `AvailableOriginal` to
  `interfaces/model.ts`.
- Add to `subs/analysis/subs/model/module.ramify`:

  ```text
  expose-src listAvailableOriginals from "availability.ts" tagged [browser] to parent
  ```

  The existing interface wildcard carries the two types.

### `analysis/typescript`

- Add `symbol-details.ts` and focused details tests.
- Extend `interfaces/source.ts`, `compiler-helper.ts`, `bridge.ts`, `wire.ts`
  and `retained-source-analysis.ts` with the bounded details operation.
- Reuse the existing compiler snapshot and transfer bounds; do not add a
  second helper process or a source-text cache.
- The existing interface wildcard carries `SymbolDetail*`; add to
  `subs/analysis/subs/typescript/module.ramify`:

  ```text
  expose-src describeSymbolDetails from "symbol-details.ts" to parent
  ```

**Revision (iteration 4, 2026-09-15).** `compiler-helper.ts`, `bridge.ts` and
`wire.ts` needed no functional change. `contracts.md`'s "TypeScript detail
provider" extends only `RetainedSourceAnalysis`, and that adapter
(`RetainedSourceState` in `retained-source-analysis.ts`) already runs its
`typescript/unstable/sync` `API`/`Project` directly in-process — it has no
child `compiler-helper.ts` process and no `bridge.ts` framing of its own; only
the separate disposable batch path (`createSourceAnalysis`/`CompilerBridge`,
which this iteration's contract does not extend) uses that child-process
protocol. `describeSymbolDetails` is therefore a plain, synchronous function
over an already-open `Project`, called directly by
`RetainedSourceState.details()`. It reuses `wire.ts`'s existing `SourceFailure`,
`encode` and `freezeData` (the "existing bounded `SourceFailure`" contracts.md
names for the total-result-byte bound and frozen output), which satisfies "no
new process or cache" without adding an IPC command neither adapter needs.

  The exported value is the testable compiler-project operation used by the
  retained adapter; it accepts no filesystem.

### `analysis/project`

- Add `generated-path.ts` with `isRamifyGeneratedPath` and tests.
- Apply it in `inventory.ts`, captured input admission/reference checks,
  `observer.ts` and sweep/input-list handling before a generated path can
  become an input.
- Add to `subs/analysis/subs/project/module.ramify`:

  ```text
  expose-src isRamifyGeneratedPath from "generated-path.ts" to parent
  ```

### `analysis`

- Add `api-view.ts` and projection tests.
- Extend `interfaces/session.ts`, `session-messages.ts`, `session-engine.ts`,
  `session-host.ts` and `session-worker.ts` with `apiView`.
- Use `SessionFacts` directly. Do not call `report()` or retain projections.
- Extend `module.ramify` relays from `model`, `project` and `typescript` for the
  new values/types, and add:

  ```text
  expose-src projectApiView from "api-view.ts" to parent
  ```

  `interfaces/session.ts` remains covered by its current wildcard.

### `daemon/contexts`

- Extend `interfaces/contexts.ts` and `context-manager.ts`; add focused
  scheduling/freshness/cancellation tests.
- The current interface wildcard carries the new context types and method.
  Parent/root relay lists gain the exact foreign types consumers compile
  against.

### `daemon`

- Add `api-view-documents.ts` for pure Markdown/meta rendering.
- Add `api-view-publisher.ts` for staging, byte comparison, lstat validation,
  rename/rollback/recovery and controlled failure points.
- Extend `filesystem-watcher.ts` to use `isRamifyGeneratedPath` before event
  admission.
- Extend `interfaces/daemon.ts`, `service.ts`, `validation.ts`, `codec.ts`,
  `connection.ts`, `host.ts` and their quick/IPC/process tests.
- Add to `subs/daemon/module.ramify`:

  ```text
  expose-src createFilesystemApiViewPublisher from "api-view-publisher.ts" to parent
  ```

  Publisher and materialization types are carried by the existing interface
  wildcard.

### Root

- Extend `src/interfaces/service.ts`, `resident-assembly.ts`,
  `quick-environment.ts` and service/client type relays.
- Relay `AvailableForm`, `AvailableOriginal`, `ApiView*`, `SymbolDetail*`,
  `isRamifyGeneratedPath`, `ApiViewPublisher`, `MaterializedTarget` and the new
  context request/outcome types only to consumers that need them.
- Keep all eight `package.json` entries and the installed launcher unchanged.

### `cli`

- Extend `arguments.ts`, `run-cli.ts` and `interfaces/cli.ts`; add
  `materialize-command.ts` and focused argument/output/lifecycle tests.
- Use only the lightweight service/client surface. Importing `ramify.ts/cli` or
  `ramify.ts/client` must not load analysis, the worker or TypeScript.

### Harness, repository and documentation

- Add `scripts/reference-harness/plan2a-instances.ts`, Plan 2A gate/runtime
  files and focused harness tests; extend the runner's plan discriminator to
  accept the literal `2a` without changing Plan 1/2/5 records.
- Add measurement workloads under `scripts/measurements/` using the existing
  R/T/S100/S500/S1000 generators and archive versioned raw results.
- Update root and reference `.gitignore` for `.ramify`, transient stage and
  rollback names.
- Update root `AGENTS.md` with the exact ordinary/test `rg` instructions only
  after the command works.
- At completion update the architecture status, roadmap, README/development
  command guides and write `iterations/iteration10-results.md` as the
  completion report.

## Test ownership

Each production owner keeps its focused tests in its own `src/tests/` area.
Root tests cover assembly and the injected daemon publisher. Daemon tests cover
rendering/publication/service/IPC. CLI tests cover arguments and output through
controlled service connections. The reference harness owns cross-owner,
compiled-process and independent expected-result cases. macOS evidence runs the
same checked-in process fixture in CI; it is not inferred from Linux.

## Declaration review

**Revision (iteration 1, 2026-09-15).** Every `module.ramify` file this plan
touches was re-read at commit `71643d5` (the [verified starting
point](main-plan.md#verified-starting-point)). All five previously proposed
owned-exposure lines above are confirmed byte-for-byte correct against the
current files and current grammar
([format specification](../../model/module-description.spec.md)); none
needed correction:

| Owner | Line | Verdict |
| --- | --- | --- |
| `analysis/model` | `expose-src listAvailableOriginals from "availability.ts" tagged [browser] to parent` | Correct. `model`'s header tag `[browser]` is a required-*symbol* tag, so it is never auto-inherited (only required-*importer* tags default); every existing owned line in this file repeats `tagged [browser]` explicitly, and this line follows the same pattern. `listAvailableOriginals` is not already declared (no double exposure); `availability.ts` does not yet exist (net-new, as expected). `AvailableForm`/`AvailableOriginal` need no separate line: `expose-src * from "interfaces/model.ts" to parent` already exists and is a valid interface-file wildcard (the file exists), so adding the two types there is automatically carried. |
| `analysis/typescript` | `expose-src describeSymbolDetails from "symbol-details.ts" to parent` | Correct. Header `module typescript` declares no tags, so no `tagged [...]` clause is required or present on any existing line; this line matches. Not already declared; `symbol-details.ts` is net-new. `SymbolDetailLimits`/`SymbolDetailRequest`/`SymbolDetail` and the `RetainedSourceAnalysis.details` method addition need no separate line: `expose-src * from "interfaces/source.ts" to parent` already exists and covers them once added to that exact file. |
| `analysis/project` | `expose-src isRamifyGeneratedPath from "generated-path.ts" to parent` | Correct. Header `module project` declares no tags; matches convention. Not already declared; `generated-path.ts` is net-new. |
| `analysis` | `expose-src projectApiView from "api-view.ts" to parent` | Correct. Header `module analysis` declares no tags; every existing owned line here is untagged and `to parent` only, matching. Not already declared; `api-view.ts` is net-new. `ApiViewCategory`/`ApiViewEntry`/`ApiViewFile`/`ApiViewAreaProjection`/`ApiViewModuleProjection`/`ApiViewProjection`/`ApiViewSelection`/`ApiViewQuery`/`ApiViewQueryOutcome` and the `RetainedSession.apiView` method addition need no separate line: `expose-src * from "interfaces/session.ts" to parent` already exists and covers them once added there. |
| `daemon` | `expose-src createFilesystemApiViewPublisher from "api-view-publisher.ts" to parent` | Correct. Header `module daemon tagged [dispatch]`; `dispatch` is a required-*importer* tag, so it is the automatic default tag set for every new untagged binding — every existing owned line here correctly omits `tagged [...]`, and this line matches that convention (it must **not** add an explicit `tagged [dispatch]`, which would be redundant but not itself wrong; omitting it is what the existing sibling lines do). Not already declared; `api-view-publisher.ts` is net-new. `ApiViewPublishLimits`/`MaterializedTarget`/`PublishApiViewOutcome`/`ApiViewPublisher` need no separate line: `expose-src * from "interfaces/daemon.ts" to parent` already exists and covers them once added there. |

**Revision (iteration 5, 2026-09-15).** The reviewed `analysis` line above named
only `projectApiView`. Implementation split the join into two pure functions
(`api-view.ts`'s doc comment records the exact reasoning): `planApiViewRequests`
names the unique `SymbolDetailRequest`s one query needs, and `projectApiView`
remains the exposed main entry, folding their `SymbolDetail` results into the
frozen projection. `subs/analysis/module.ramify` therefore declares both names
on one line: `expose-src planApiViewRequests, projectApiView from "api-view.ts"
to parent` — same file, same untagged/`to parent` convention as reviewed;
`RetainedSession.apiView` itself and its `ApiViewQuery`/`ApiViewQueryOutcome`
types remain undeclared, left for iteration 7. `AvailableForm`,
`AvailableOriginal`, `ApiViewCategory`, `ApiViewEntry`, `ApiViewFile`,
`ApiViewAreaProjection`, `ApiViewModuleProjection`, `ApiViewProjection`,
`ApiViewSelection`, `ApiViewQuery` and `ApiViewQueryOutcome` all landed in
`interfaces/session.ts` and `interfaces/model.ts` exactly as this document
already anticipated, carried by their existing wildcards with no further line.
Cross-subtree relay item 4 below (the root's own `ApiView*` projection-type
relay) is now complete: `/ramify/module.ramify`'s existing "R3" `expose-sub ...
from analysis to descendants` line gained `ApiViewCategory, ApiViewEntry,
ApiViewFile, ApiViewAreaProjection, ApiViewModuleProjection, ApiViewProjection,
ApiViewSelection, ApiViewQuery, ApiViewQueryOutcome`, exactly the names item 4
lists. Items 1–3 were already complete before this iteration started (verified
in the current `subs/analysis/module.ramify` and root `module.ramify`); item 5
remains for iteration 8, as item 5's own text already states.

No new `module.ramify` line is needed for `cli`: `MaterializeParams`/`MaterializeOutcome`/`RamifyService.materialize` are root's own additions to `interfaces/service.ts`, already covered by root's existing `expose-src * from "interfaces/service.ts" to descendants` wildcard, which reaches `cli` automatically as a descendant.

### Cross-subtree relay additions (named lists only)

The five interface-file wildcards above make each new type visible in the
*direct parent* of its owning module without further declaration (ownership
principles: "A direct child exposes the symbol to its parent" gives immediate
visibility with no relay statement). But three consumers named in this plan
sit *outside* that immediate parent/child relationship, reachable only through
`analysis`'s and the root's own relays, which are named lists rather than
wildcards. Selecting a new name into a named `expose-sub` list is a required,
non-automatic edit. Verified against the current text of each file (captured
2026-09-15):

1. **`daemon/filesystem-watcher.ts` needs `isRamifyGeneratedPath`** (owned by
   `analysis/project`, three levels away through `analysis` and the root).
   `project` already exposes it `to parent` (visible directly in `analysis`),
   but reaching `daemon` (root's other child) requires two more hops:
   - `subs/analysis/module.ramify`: append `isRamifyGeneratedPath` to the
     existing `expose-sub ProjectRequest, ProjectScope, ..., ProjectObserver,
     ProjectObserve from project to parent, descendants` line (destinations
     unchanged; only the selection list gains one name).
   - `/ramify/module.ramify` (root): append `isRamifyGeneratedPath` to the
     existing `expose-sub ProjectRequest, ProjectScope, ..., ProjectObserver,
     ProjectObserve from analysis to descendants` line, which then reaches
     `daemon` automatically as a root descendant (no further per-level
     `daemon` or `contexts` edit is needed: "One exposure to descendants
     reaches every depth and branch... It requires no further decisions
     inside that subtree").

2. **The daemon renderer/publisher and the root's `MaterializeOutcome` need
   `typescript`'s `SymbolDetailLimits`, `SymbolDetailRequest`, `SymbolDetail`**
   (owned by `analysis/typescript`, visible directly only in `analysis`).
   - `subs/analysis/module.ramify`: append `SymbolDetailLimits,
     SymbolDetailRequest, SymbolDetail` to the existing `expose-sub
     CatalogOriginal, CatalogExport, FileExports, SourceCatalog, SourceTarget,
     WrittenForm, AccessSelection, SourceAccess, SourceLimit,
     SourceWorkLimits, SourceAnalysisInputs, SourceAnalysis from typescript to
     parent, descendants` line.
   - `/ramify/module.ramify` (root): append the same three names to the
     existing `expose-sub CatalogOriginal, CatalogExport, ..., SourceAnalysis
     from analysis to descendants` line, reaching `daemon` automatically.

3. **The daemon renderer and the root's relay need `model`'s `AvailableForm`,
   `AvailableOriginal`, and `listAvailableOriginals`.** `analysis` already
   receives these automatically via the existing *wildcard* `expose-sub *
   from model to parent, descendants` (no edit needed at the `analysis`
   level: a wildcard selection is recomputed from the child's current
   to-parent contract). Only the root needs an edit:
   - `/ramify/module.ramify` (root): append `AvailableForm, AvailableOriginal,
     listAvailableOriginals` to the existing `expose-sub ModuleId, TagName,
     TagKind, TagDefinition, ResolvedTagRegistry, SourceLocation, ModelIssue,
     ModelResult, SourceArea, ModuleRecord, OriginalId, SourceOrigin,
     Original, Destination, Exposure, ModelInput, Model, ExposureHop,
     VisibilityDecision, BindingRequest, ImportQuestion, TagRequirement,
     ImportReason, ImportDecision, resolveTagRegistry, createDefaultTagRegistry,
     deriveSourceAreas, assignOriginalTags, originalKey, buildModel,
     explainVisibility, explainImport from analysis to descendants` line.

4. **The root's relay needs `analysis`'s own `ApiView*` projection types**,
   since the daemon's renderer/publisher (`api-view-documents.ts`,
   `api-view-publisher.ts`) and `daemon/contexts` (constructing an
   `ApiViewQuery` for `RetainedSession.apiView`) both need them, and both are
   reachable only as root descendants:
   - `/ramify/module.ramify` (root): append `ApiViewCategory, ApiViewEntry,
     ApiViewFile, ApiViewAreaProjection, ApiViewModuleProjection,
     ApiViewProjection, ApiViewSelection, ApiViewQuery, ApiViewQueryOutcome`
     to the existing `expose-sub Capability, StageId, RunControl,
     AnalysisLimits, AnalysisInputs, InventoryInputs, InventorySnapshot,
     InventoryRun, ValidationRun, CapabilityExecution, StageExecution,
     AnalysisCode, AnalysisDiagnostic, AccessResult, AnalysisSnapshot,
     AnalysisSummary, AnalysisReport, AnalysisRun, AnalysisSession,
     SessionLimits, SessionInputs, SessionChange, RevisionPath, CheckedSet,
     FindingDelta, RevisionTimings, OperationTimings, SessionRevision,
     SessionUpdate, VerifyOutcome, SessionStatus, RetainedSession, SessionOpen
     from analysis to descendants` line. This is legal because these types
     land in `interfaces/session.ts`, whose existing `expose-src * ... to
     parent` wildcard already puts them in `analysis`'s to-parent contract
     `U(analysis)`, which is exactly what this root `expose-sub` selects from.

5. **`daemon/contexts`'s own `ApiViewRequest`/`ContextApiViewOutcome` and
   `daemon`'s own `ApiViewPublishLimits`/`MaterializedTarget`/
   `PublishApiViewOutcome`/`ApiViewPublisher` need no relay beyond their
   existing interface wildcards**, because their only production consumer
   (`daemon`'s own `service.ts`, and root's `resident-assembly.ts` for the
   publisher factory) is the *direct parent* of the owning module and already
   has automatic visibility. `MaterializeParams`/`MaterializeOutcome` (IPC
   wire types) are root's own new exports in its own `interfaces/service.ts`
   and never repeat `MaterializedTarget`'s definition; they only reference
   its *type*, which root's source can already see (root is `daemon`'s direct
   parent). One further relay is needed for the CLI's own formatting code to
   name the type explicitly, rather than relying on structural typing alone:
   - `/ramify/module.ramify` (root): append `MaterializedTarget` to the
     existing `expose-sub ContextId, GenerationId, RevisionId, LeaseId,
     ContextToken, ContextSetup, ContextSelection, InputFingerprints,
     RevisionCause, ContextRevision, ContextState, SynchronizationState,
     ContextStatus, ExpectedContent, Freshness, FreshnessRecord, CheckRequest,
     CheckDelta, UnavailableReason, Unavailable, CheckOutcome, ReplyTimings,
     OpenOutcome, ContextEvent, SubscriptionHandle, WatchEvent, WatcherHandle,
     WatcherPort, ClockPort, ContextBudgets, DaemonInstance, LogEntry,
     DaemonBudgets, EndpointSelection, DaemonRecord, StopDisposition,
     Handshake, Welcome, ConnectTimeouts, ConnectOptions, ConnectionState,
     DisconnectReason, RecoveryOutcome, ServiceConnection, ConnectOutcome,
     ServiceConnector, WireMessage, createControlledWatcher,
     createControlledClock, ControlledWatcher, ControlledClock from daemon to
     descendants` line. This is legal because `MaterializedTarget` is defined
     in `interfaces/daemon.ts`, whose existing wildcard already puts it in
     `daemon`'s to-parent contract, and this root line already selects other
     names from that same contract.
   `ApiViewRequest`, `ContextApiViewOutcome`, `ApiViewPublishLimits`,
   `PublishApiViewOutcome` and `ApiViewPublisher` itself are deliberately
   **not** relayed past `daemon`: no consumer outside `daemon` (and, for the
   first two, `daemon/contexts`) is named by this plan. Iteration 8 must not
   add unused relays for them.

Every consumer-needed foreign type in this section therefore has a legal,
concrete relay path through existing exposure channels plus the eight named-
list additions above; no proposed line violates the format specification's
tag-default, wildcard-eligibility, or `expose-sub`-from-`U(child)` rules.

Iteration 10 validates every line (the five owned-exposure lines, the five
untouched interface wildcards, and the eight named-list additions above)
against real exports. No wildcard may claim a foreign original, no source tag
is weakened, and no testing-only helper becomes production-visible.

**Final declaration texts (iteration 10).** These six owners are the only ones
Plan 2A's owned or relayed exposure lines touch (verified above). Each block
is the complete final `module.ramify` text, independently reconstructed from
this file's "Declaration review" (owned lines) and "Cross-subtree relay
additions" (named-list edits) sections, layered onto the archived Plan 5 text
in [its owners.md](../iteration-5-fast-incremental-checks/owners.md). Unchanged
multi-item named lists are abbreviated with `…` and expand from that Plan 5
text; every line this plan adds or extends is written in full. README first
paragraphs are unchanged by this plan (Model's README gains a new paragraph
after its first, so the purpose paragraph itself is unaffected).

## Root: ramify

**Directory:** `./`. **README first paragraph** (unchanged):

> Ramify assembles the command line, the resident daemon and lazy batch analysis from its owners, defines the dispatch-facing service vocabulary that the daemon implements, and keeps executable dispatch separate from portable model and presentation entries.

```ramify
ramify 1
module "ramify" tagged [dispatch]

// R1: invocation vocabulary for the injected CLI operation.
expose-src * from "interfaces/batch.ts" to descendants
// R6: dispatch-facing service vocabulary, implemented by daemon.
expose-src * from "interfaces/service.ts" to descendants
// R8: testing-only quick environment for CLI, daemon and root tests.
expose-test createQuickEnvironment, QuickEnvironment from "quick-environment.ts" to descendants

expose-sub ModuleId, TagName, TagKind, TagDefinition, ResolvedTagRegistry, SourceLocation, ModelIssue, ModelResult, SourceArea, ModuleRecord, OriginalId, SourceOrigin, Original, Destination, Exposure, ModelInput, Model, ExposureHop, VisibilityDecision, BindingRequest, ImportQuestion, TagRequirement, ImportReason, ImportDecision, resolveTagRegistry, createDefaultTagRegistry, deriveSourceAreas, assignOriginalTags, originalKey, buildModel, explainVisibility, explainImport, AvailableForm, AvailableOriginal, listAvailableOriginals from analysis to descendants

// R4: syntax vocabulary relayed unchanged from analysis.
expose-sub TextSpan, … , LinkedDescriptions from analysis to descendants

// R4: project vocabulary relayed unchanged from analysis.
expose-sub ProjectRequest, ProjectScope, CapturedInput, InventoryArea, ModulePurpose, InventoryModule, InventoryFile, ExactReference, OutsideSourceWarning, ProjectInventory, ProjectIssue, AcquisitionLimits, ProjectInputView, ProjectReadOptions, ProjectRead, ProjectResolution, RetainedConfiguration, InputChangeKind, ObservedChange, InventoryUpdate, ProjectObserver, ProjectObserve, isRamifyGeneratedPath from analysis to descendants

// R4: source catalog vocabulary relayed unchanged from analysis.
expose-sub CatalogOriginal, CatalogExport, FileExports, SourceCatalog, SourceTarget, WrittenForm, AccessSelection, SourceAccess, SourceLimit, SourceWorkLimits, SourceAnalysisInputs, SourceAnalysis, SymbolDetailLimits, SymbolDetailRequest, SymbolDetail from analysis to descendants

// R3: complete analysis report, session and operation vocabulary.
expose-sub Capability, StageId, RunControl, AnalysisLimits, AnalysisInputs, InventoryInputs, InventorySnapshot, InventoryRun, ValidationRun, CapabilityExecution, StageExecution, AnalysisCode, AnalysisDiagnostic, AccessResult, AnalysisSnapshot, AnalysisSummary, AnalysisReport, AnalysisRun, AnalysisSession, SessionLimits, SessionInputs, SessionChange, RevisionPath, CheckedSet, FindingDelta, RevisionTimings, OperationTimings, SessionRevision, SessionUpdate, VerifyOutcome, SessionStatus, RetainedSession, SessionOpen, ApiViewCategory, ApiViewEntry, ApiViewFile, ApiViewAreaProjection, ApiViewModuleProjection, ApiViewProjection, ApiViewSelection, ApiViewQuery, ApiViewQueryOutcome from analysis to descendants

// R5: declaration-only UI relay; root source imports none of these.
expose-sub DiagramDefinition, … , shopFocusDiagram from presentation to descendants

// R7: resident vocabulary and controlled test ports relayed unchanged from daemon.
expose-sub ContextId, GenerationId, RevisionId, LeaseId, ContextToken, ContextSetup, ContextSelection, InputFingerprints, RevisionCause, ContextRevision, ContextState, SynchronizationState, ContextStatus, ExpectedContent, Freshness, FreshnessRecord, CheckRequest, CheckDelta, UnavailableReason, Unavailable, CheckOutcome, ReplyTimings, OpenOutcome, ContextEvent, SubscriptionHandle, WatchEvent, WatcherHandle, WatcherPort, ClockPort, ContextBudgets, DaemonInstance, LogEntry, DaemonBudgets, EndpointSelection, DaemonRecord, StopDisposition, Handshake, Welcome, ConnectTimeouts, ConnectOptions, ConnectionState, DisconnectReason, RecoveryOutcome, ServiceConnection, ConnectOutcome, ServiceConnector, WireMessage, createControlledWatcher, createControlledClock, ControlledWatcher, ControlledClock, MaterializedTarget from daemon to descendants
```

## Analysis

**Directory:** `subs/analysis/`. **README first paragraph** (unchanged):

> Analysis composes one captured project view, source facts, descriptions and model decisions into disposable batch work, immutable reports and a retained session whose revisions recompute only the facts a change reaches. It owns stage outcomes, input identity and computational invalidation so every client consumes the same completed analysis.

```ramify
ramify 1
module analysis

expose-sub * from model to parent, descendants

// A6: syntax vocabulary available to assembly and acquisition.
expose-sub TextSpan, … , LinkedDescriptions from descriptions to parent, descendants

// A7: project vocabulary supplied to assembly and children.
expose-sub ProjectRequest, ProjectScope, CapturedInput, InventoryArea, ModulePurpose, InventoryModule, InventoryFile, ExactReference, OutsideSourceWarning, ProjectInventory, ProjectIssue, AcquisitionLimits, ProjectInputView, ProjectReadOptions, ProjectRead, ProjectResolution, RetainedConfiguration, ObservationSink, InputChangeKind, ObservedChange, InventoryUpdate, ProjectObserver, ProjectObserve, isRamifyGeneratedPath from project to parent, descendants

// A8: current source catalog vocabulary.
expose-sub CatalogOriginal, CatalogExport, FileExports, SourceCatalog, SourceTarget, WrittenForm, AccessSelection, SourceAccess, SourceLimit, SourceWorkLimits, SourceAnalysisInputs, SourceAnalysis, SymbolDetailLimits, SymbolDetailRequest, SymbolDetail from typescript to parent, descendants

// A1/A4: validation operations and implemented analysis vocabulary.
expose-src validateProject from "validation.ts" to parent
expose-src * from "interfaces/analysis.ts" to parent

// A2: inventory and source-profile assembly for production selection.
expose-src acquireInventory from "inventory.ts" to parent

// A3: disposable batch sessions and the direct service binding.
expose-src createAnalysisSession from "session.ts" to parent
expose-src analyzeProject from "analyze-project.ts" to parent

expose-src resolveProject from "resolve-project.ts" to parent

// A11/A12: the retained session and its plain-data vocabulary.
expose-src * from "interfaces/session.ts" to parent
expose-src openRetainedSession from "retained-session.ts" to parent

// A13: pure API-view projection, joining availability, catalog and detail
// results into complete, bounded area projections; no filesystem or
// retention access. planApiViewRequests names the detail requests a query
// needs; projectApiView folds their results into the frozen projection.
expose-src planApiViewRequests, projectApiView from "api-view.ts" to parent
```

## Model

**Directory:** `subs/analysis/subs/model/`. **README first paragraph** (unchanged):

> The model defines canonical module and original identities, validates the shared tag registry, derives source profiles, and explains visibility and importability from grounded exposure evidence without filesystem, compiler or UI dependencies.

```ramify
ramify 1
module model tagged [browser]

// M1: portable owned vocabulary.
expose-src * from "interfaces/model.ts" to parent
// M2-M6: values explicitly promise browser-safe transitive closures.
expose-src resolveTagRegistry, createDefaultTagRegistry from "registry.ts" tagged [browser] to parent
expose-src deriveSourceAreas, assignOriginalTags from "profiles.ts" tagged [browser] to parent
expose-src originalKey from "identity.ts" tagged [browser] to parent
expose-src buildModel from "model.ts" tagged [browser] to parent
expose-src explainVisibility, explainImport from "decisions.ts" tagged [browser] to parent
// M7: pure available-original enumeration, sharing decisions.ts's requirement helper.
expose-src listAvailableOriginals from "availability.ts" tagged [browser] to parent
```

## Project

**Directory:** `subs/analysis/subs/project/`. **README first paragraph** (unchanged):

> Project selects and acquires one real project, validates its physical ownership layout and exact paths, and supplies coherent captured input reads. It resolves the root and compiler configuration on request, records raw source areas, configuration selection, outside-module warnings and README purpose metadata, can reuse its configuration product when its captured dependencies are unchanged, and can keep its observations live for a retained session, updating the inventory locally, rebuilding it for structural changes and re-observing its whole observed set, without deciding import permissions.

```ramify
ramify 1
module project

// P1-P2: acquisition service and owned vocabulary.
expose-src readProject from "read-project.ts" to parent
expose-src * from "interfaces/project.ts" to parent

// P3: root and configuration resolution without source acquisition.
expose-src resolveProjectRoot from "resolve-root.ts" to parent

// P4: live observation of one project for the retained session.
expose-src observeProject from "observer.ts" to parent
// P5: the canonical reserved generated-output path predicate.
expose-src isRamifyGeneratedPath from "generated-path.ts" to parent
```

## TypeScript

**Directory:** `subs/analysis/subs/typescript/`. **README first paragraph** (unchanged):

> The TypeScript adapter owns compiler sessions and resolution state, describes the exports and originals of each file with the inputs that description depended on, assembles them into complete catalogs, and records bounded source-access facts through an interpreter it sets up once. It keeps one live snapshot in a retained adapter, reports every filesystem observation it makes, separates real resource identity from declaration shims, and returns plain data and explicit analysis limits.

```ramify
ramify 1
module typescript

// T1-T2: compiler service and detached catalog vocabulary.
expose-src createSourceAnalysis from "source-analysis.ts" to parent
expose-src * from "interfaces/source.ts" to parent
// T3: the hoisted access interpreter.
expose-src createAccessInterpreter from "access-interpreter.ts" to parent
// T4: per-file export descriptions and their assembly.
expose-src describeFiles, assembleCatalog from "descriptions.ts" to parent
// T5: the retained compiler adapter with one live snapshot.
expose-src createRetainedSourceAnalysis from "retained-source-analysis.ts" to parent
// Plan 2A iteration 4: bounded, body-free symbol-detail extraction.
expose-src describeSymbolDetails from "symbol-details.ts" to parent
```

## Daemon

**Directory:** `subs/daemon/`. **README first paragraph** (unchanged):

> Daemon owns the resident process: the validated in-process service that implements the root's service interface over its contexts child, the local socket host and its discovery records, the lightweight client that other processes use to reach it, the wire codec, and the real filesystem watcher and clock ports.

```ramify
ramify 1
module daemon tagged [dispatch]

// N1: in-process service binding and real ports.
expose-src createDaemonService, dispatchServiceRequest from "service.ts" to parent
expose-src createFilesystemWatcher from "filesystem-watcher.ts" to parent
expose-src createFilesystemApiViewPublisher from "api-view-publisher.ts" to parent
expose-src createSystemClock from "system-clock.ts" to parent
// N2: lightweight client, codec and discovery.
expose-src connectDaemon from "connect-daemon.ts" to parent
expose-src encodeMessage, decodeMessage from "codec.ts" to parent
expose-src selectEndpoint, readDaemonRecord from "discovery.ts" to parent
// N3: the process host.
expose-src startDaemon from "start-daemon.ts" to parent
// N4: owned transport, lifecycle and service-binding vocabulary.
expose-src * from "interfaces/daemon.ts" to parent
// N5: neutral context vocabulary, ports and controlled test ports relayed unchanged.
expose-sub AnalysisDriver, … , ControlledClock from contexts to parent
```
