# Plan 6D: Behavioral dependency diagram

**Date:** 2026-09-17. **Status:** implemented on branch
`feat/plan6d-behavioral-dependency-diagram`; every BD row passes, as the
[completion report](iterations/iteration7-results.md) records. This is
a focused successor to the implemented
[Plan 6B](../iteration-6b-resident-explorer-server/main-plan.md) and
[Plan 6C](../iteration-6c-module-tree-view/main-plan.md). It uses the behavioral
classification and modularity projection already implemented at `70d7f46`.

The product and counting decisions come from the
[project modularity analysis](../../analysis/2026-09-17-project-modularity-analysis.md#proposed-dependency-diagram).
The exact daemon, service and wire contracts are in
[contracts.md](contracts.md), and the strict gate is
[acceptance.md](acceptance.md).

**Revision, 2026-09-17:** the explorer's behavior analysis is started by the
daemon, only when the diagram is requested, and never in the web process. It is
a separate, lean analyzer: it reuses the published revision's imports and
verified inputs and runs only the behavior classifier in its own compiler
process. It leaves the retained session untouched. This replaces the earlier
draft's disposable batch in the explorer server, which conflicted with the
[runtime dependency boundaries](../../architecture/memory-lifecycle.md#runtime-dependency-boundaries),
and supersedes the analysis document's disposable-batch placement for the
explorer. The batch probe remains a terminating tool for recorded baselines.

## Product decision

The module explorer at `/analysis/latest` becomes a behavioral dependency
diagram. Its default links show referenced behavioral symbols from each
consumer module to the module named by the consumer's import. A forwarded
symbol therefore links to the forwarding/imported module by default, without
changing the symbol's original owner.

Two independent controls change the displayed links without rerunning analysis:

```text
[ ] Show non-behavioral dependencies
Link targets: [ Imported modules ] [ Original owners ]
```

The first control adds referenced type/data dependencies. The second chooses
between the consumer-facing imported boundary and the module that defines the
original. Imported but unreferenced symbols, symbol-free imports and unknown
classifications make no link. Unknown classifications make coverage partial.

The existing occurrence-based edges remain in the ordinary project report and
in bounded supporting evidence. They no longer drive the default analysis
graph, its weights or its headline dependency counts. The module tree at
`/modules/latest` keeps its existing published-view behavior and import summary.

## Runnable outcome

```sh
npm run build
node dist/src/explorer-entry.js --root . --port 4302
# browse http://127.0.0.1:4302/analysis/latest
# wait for the on-demand dependency analysis in the daemon
# default: behavioral links to imported modules
# enable non-behavioral links or switch to original owners without another analysis
```

Opening the analysis page is an explicit request for dependency behavior at the
published revision. The daemon starts one lean analyzer process for that
revision. The analyzer verifies that the project's inputs still match the
revision, classifies the revision's recorded imports and returns the diagram.
Checks, hooks, watches, materialization, the retained session and the ordinary
published project view never run the classifier.

## Completion boundary

Plan 6D is complete when:

1. behavior evidence distinguishes use through separate `SourceAccess` paths;
2. one pure projection produces the headline counts and frozen boundary facts
   for both endpoint projections, used by the batch probe and the daemon alike;
3. a lean analyzer classifies a published revision's recorded imports over
   verified inputs, without repeating discovery, description linking, export
   cataloging, import interpretation or evaluation;
4. the daemon serves an on-demand `dependencyDiagram` operation at an exact
   published revision by running that analyzer in a separate process, bounded
   to one job and one retained result per context;
5. the explorer server maps that result to a browser DTO without loading or
   running analysis code;
6. the browser renders the agreed default, controls and right-hand project,
   module and edge summaries from one revision-bound result;
7. reference, forwarding, unknown, unused, stale, changed-input and lifecycle
   fixtures pass through the real daemon, HTTP and Chromium; and
8. ordinary and changed-file checks and the retained session still never run
   the classifier.

Candidate A/B ownership changes, an interactive modularity score, confidence
percentages, runtime profiling, automatic module moves and changes to the
module-tree page are outside this plan.

## Prerequisites and current state

Verified on 2026-09-17 at source commit `70d7f46` with only the modularity
analysis document modified in the worktree.

| Capability | State at plan creation | Plan 6D use |
| --- | --- | --- |
| Opt-in dependency behavior | Implemented by `cef7944`; batch-only facts classify behavioral, non-behavioral, unused and unknown. The classifier runs as a `behavior` command in the compiler helper, which first rebuilds the export catalog and all imports unless an earlier `accesses` command collected them. | Extend its frozen facts; let the `behavior` command classify supplied imports without the catalog or interpretation. |
| Hook isolation | Tests reject the capability in retained sessions and daemon contexts and observe zero classifier calls for ordinary/changed-file work. | Keep the capability out of every existing request; the new operation is the only entry. |
| Modularity projection | Implemented by `2af41df`; project and consumer headline counts, coverage and exact input provenance exist. | Add bounded boundary facts while retaining the headline unit. |
| Baselines | Ramify's recorded production baseline is 69 behavioral and 347 non-behavioral dependencies. A plan-creation probe of Collection Review at `70d7f46` completed with 17 and 48 and complete coverage. | Iteration 2 reruns both from a clean implementation revision and records both artifacts. |
| On-demand daemon precedent | `explorerDetails` is a daemon operation at an exact published revision. It pins the revision and refuses a non-current revision as superseded. | The model for `dependencyDiagram`'s revision and superseded handling. |
| Separate process runners | `createProcessBatch` runs one Node child per batch with cancellation and response-size bounds; the compiler helper reads every input through its parent's `ProjectInputView`, whose `seal()` reports coherent captured inputs or changed paths. Root assembly injects analysis drivers into the daemon. | The model for the analyzer process, its input verification and its injection. |
| Explorer transport | `projectView`, `explorerDetails` and `serverStatus` use the resident binding; the project model rejects an input-ID mismatch. | Add a `dependencyView` procedure that relays to the daemon. |
| Explorer UI | Radial module graph, out-of-view modules, selection, filters, stale handling and right panel are implemented. | Replace the graph's evidence/metrics while reusing interaction and layout. |

### Blocking provider gap

The current classifier has one fact per `(consumer file, original)` and places
all matching access IDs on that fact. If a consumer imports one original through
both `B` and `C` but references only the binding from `B`, joining the aggregate
fact to both access IDs would incorrectly draw both boundaries. Iteration 1
must preserve access-path classification before any diagram projection is
implemented. A UI implementation over the current aggregate facts fails the
plan even when its common fixtures look correct.

## Fixed units and filters

The [dependency glossary](../../architecture/dependency-glossary.md) and
[modularity report specification](../../architecture/modularity-report.spec.md)
remain authoritative.

- A headline dependency is one distinct `(consumer module, original)` pair.
  One original used by two consumer modules counts once for each consumer.
- An imported-boundary dependency is one distinct
  `(consumer module, imported module, original)` triple. The same original used
  through two imported modules can create two default links but one headline
  dependency.
- A classifier access fact is one distinct `(consumer file, original,
  SourceAccess.id)` triple. Several aliases of the same original in that one
  access are combined because they have the same imported boundary.
- Aggregation precedence is behavioral, then unknown, then non-behavioral,
  then unused. Behavioral evidence settles the unit. Otherwise any unknown
  constituent makes the unit unknown; a referenced type/data/forwarding
  constituent makes it non-behavioral; all-unused constituents are unused.
- The first-release diagram uses the production source filter. Testing facts
  remain in the modularity report but are not a browser toggle in this plan.
- A fact whose consumer owns the original enters no count and no link in
  either projection. An imported-module link additionally requires
  `consumer != importedModule`, so neither projection creates a self-loop. A
  consumer that reaches a foreign original through its own module barrel
  remains in `Uses` and the original-owner projection but has no imported-module
  link. External, outside-module and unresolved facts stay in `AnalysisReport`
  and coverage and do not become dependency-diagram entities.
- An evidence row's allowed/limited/denied status comes from the import
  decisions for that original in its contributing accesses, never from other
  originals selected by the same access.

## Architecture

```text
browser /analysis/latest
        |
        | projectView (unchanged) + dependencyView (explicit, polled)
        v
explorer server: service-api router
        |  one in-flight daemon request, one settled DTO for the current revision
        |  createExplorerDependencyModel (pure mapping, no analysis code)
        | local IPC: dependencyDiagram({ token, requestId, revision })
        v
daemon: context manager
        |  superseded check, retained result, join, one job daemon-wide
        |  published report (imports, areas, inventory, captured input hashes)
        v
dependency analyzer process (one per job, exits afterwards)
        |  acquire inputs, compare with the report's captured inputs
        |  compiler helper: behavior(supplied imports)  -> per-access facts
        |  projectDependencyDiagram                      -> diagram facts
        v
DependencyDiagramFacts (frozen, bounded, revision-bound)
```

There is one behavior classifier and one semantic dependency projection. The
analyzer reuses the published revision's recorded imports rather than
interpreting source again; it loads the TypeScript project only to classify
references and callability. The retained session and its queue are not involved.
The explorer server does not load compiler or analysis runtime code. The batch
probe reaches the same projection through `projectModularity` in a terminating
process.

### Ownership

| Owner | Responsibility |
| --- | --- |
| `analysis/typescript` | Per-access reference discovery and behavior classification; a `behavior` command that classifies supplied imports without building the catalog or interpreting imports. |
| `analysis` | Pure `projectDependencyDiagram` (units, precedence, per-original status, coverage, byte limit), its use in `projectModularity`, and `analyzeDependencyDiagram`: input acquisition and comparison, the helper run and the projection. |
| root `ramify [dispatch]` | Analyzer process entry and runner, injection into the daemon, service vocabulary (`ServiceOperation`, `ServiceCapability`, counters) and declaration relays. |
| `daemon/contexts` | Superseded check, joining, one job daemon-wide, abort on newer publication, result retention and release, counters. |
| `daemon` | `dependencyDiagram` service operation, validation, IPC framing, client method and the injected runner port. |
| `service-api [dispatch]` | `dependencyView` procedure, per-binding in-flight/settled state, pure DTO mapping and serialized size refusal. |
| `presentation/project-view [ui, browser]` | Controls, active edge collection, visual encoding, selection reconciliation and right-hand information panel. |
| `explorer [ui, browser, dispatch]` | Request/poll/refresh state, stale handling and coordination of the published module model with its matching dependency result. |
| `integration-tests [testing, ui, dispatch]` | Actual daemon, analyzer process, HTTP and Chromium evidence. |

### Exposure changes

- `analysis/typescript` exposes the extended behavior fact types and the
  supplied-import `behavior` operation to its parent.
- `analysis` exposes the dependency-diagram result types and
  `analyzeDependencyDiagram` to its parent. Root re-exposes the result types as
  declarations to `daemon` and `service-api`; only root's analyzer entry calls
  the function.
- `daemon` exposes the runner port and the operation's request/outcome types
  through the existing service vocabulary relays.
- No compiler, analysis runtime or filesystem implementation is exposed to
  `daemon`, `service-api`, presentation or explorer.
- The existing package entry `ramify.ts/analysis` remains the probe surface;
  no new package subpath is required.
## Lifecycle and consistency

`dependencyDiagram({ token, requestId, revision })` is answered by the context
manager:

1. A revision that is not the context's current published revision, including
   one from an earlier generation, returns `superseded` with the current
   revision.
2. A retained result for that revision returns `ready` immediately.
3. A job already running for that context and revision is joined; the request
   waits for it.
4. While a job for any other context or revision is running, the answer is
   `busy/analysis-running` and no work starts.
5. Otherwise a job starts.

The job pins the revision and passes its published report and project request
to the injected runner, which starts one analyzer process. The analyzer
acquires the project inputs and compares them with the report's captured inputs.
Any difference ends the job as `inputs-changed`: the daemon answers
`busy/inputs-changed`, because a newer revision is about to publish. Otherwise
the analyzer runs the compiler helper's `behavior` command over the report's
imports, projects the diagram and exits.

Publication of a newer revision aborts the running job; waiting callers receive
`superseded`. A caller's cancellation detaches only that caller, and the job
aborts when no caller remains. No job restarts without a request.

A context retains at most one result, for its current published revision. It
counts toward `retainedBytes`, and publication of a newer revision, eviction and
close release it. A result larger than its byte limit, or one that would exceed
the context's retained budget, is `unavailable/resource-limit` and is not
retained.

The explorer server holds at most one in-flight daemon request and one settled
DTO, both for the newest requested current revision. A request for another
revision aborts the in-flight request. Closing the server aborts it, releases
the DTO and closes the binding as today.

`dependencyView({ revision })` in the router:

| Server state | Result |
| --- | --- |
| Binding not ready | `unavailable` |
| Revision from an earlier generation or not the published revision | `superseded` |
| Settled DTO for the revision | `ready` |
| In-flight request for the revision | `pending/analyzing` |
| Last daemon answer for the revision was `busy` within the last second | `pending/waiting` |
| Otherwise | Start the daemon request; return `pending/analyzing` |

The response is ready only when the resident revision, its input ID and the
result's input ID are equal. The browser performs the same check against its
displayed project view. A new published revision marks a ready diagram stale;
the browser keeps it with its revision until the user refreshes, and stops
polling a superseded request.

The visible browser polls a pending request no more than once per second. It
stops polling while hidden and after ready, superseded or unavailable. No event
stream is introduced.
## Diagram and information panel

The default active collection is `importedModuleEdges` with only behavioral
counts. Enabling non-behavioral dependencies adds their counts and reveals
non-behavioral-only edges. Choosing original owners switches to
`originalOwnerEdges`. Both collections arrive in one ready response, so either
control is local UI state.

- Colour carries both behavior and status: each status has a full-strength
  colour for an edge with behavioral evidence and a lighter one for a
  non-behavioral-only edge, which is also muted.
- Allowed/denied/limited remains a badge/colour dimension, with precedence
  denied, limited, allowed over the per-original status of the edge's evidence.
- The dash pattern is reserved for the existing direction animation, whose
  dashes travel from consumer to provider on every edge. It never encodes
  behavior or status.
- Width uses a bounded logarithmic scale over the displayed classified count.
- Node size uses owned source-file count and stays fixed while controls change.
- Edge IDs contain the projection and ordered endpoint pair. Switching the
  projection clears an edge selection unless the exact active ID remains.
- Existing hierarchy scope, breadcrumbs, out-of-view related modules,
  class filters, pan/zoom and minimap operate over the active edge collection.

The right panel follows the analysis document exactly:

- no selection: project behavioral/non-behavioral headline counts, displayed
  links, coverage and revision;
- module: `Uses`, active incoming role, alternate incoming role in a disclosure,
  owned/subtree files and coverage;
- imported edge: behavioral/non-behavioral used originals via this boundary,
  original-owner breakdown and supporting files/status/coverage;
- original-owner edge: behavioral/non-behavioral dependencies,
  imported-through breakdown and supporting files/status/coverage.

The non-behavioral headline card remains visible and says `not drawn` while the
setting is off and `shown` while it is on. There is no ratio, pie chart or
confidence percentage.

## Failure and coverage states

| Condition | Browser behavior |
| --- | --- |
| Published model loading | Existing project-view loading state. |
| Waiting for another job, inputs changed or analyzing | Render module nodes and `Computing behavioral dependencies`; render no occurrence-edge fallback. |
| Daemon unavailable, analyzer or compiler failure | Keep module nodes; dependency diagram unavailable with the returned reason. |
| Partial behavior evidence | Render known classified links and a coverage warning with omitted unknown count/limits. |
| Requested revision no longer published | `superseded`; stop polling, keep any displayed diagram as stale and request the newest revision only after refresh. |
| New resident revision after ready | Keep the coherent old diagram, show stale state and exact revision; refresh requests the new input. |
| Result above its byte limit or the retained budget | `unavailable/resource-limit`, including observed and maximum bytes; never truncate. |
| Completed zero dependencies | Render modules and a measured zero, distinct from unavailable or partial. |

## Resource budgets

| Measure | Limit |
| --- | --- |
| Diagram jobs | 1 daemon-wide; equal requests join, others answer `busy` |
| Analyzer processes | 1 analyzer process and its compiler helper per job, both exited when the job settles |
| Job deadline | 120 seconds including process exit |
| Retained results per context | 1, current published revision only, counted in `retainedBytes` |
| `DependencyDiagramResult` encoded size | ≤ 16 MiB; refuse rather than truncate |
| Explorer server state | 1 in-flight request and 1 settled DTO ≤ 16 MiB |
| Pending browser poll | ≥ 1 second, visible page only |
| Ten same-revision refreshes after ready | no additional analyzer run; stable retained bytes, listeners and timers |
| Explorer close | in-flight request aborted immediately; server exits within the existing disposal limit |
| Cancellation | analyzer and helper processes exit within the existing 5-second disposal limit |

No latency target is imposed on the diagram job, and CPU contention with
concurrent checks is accepted. Iteration 3 records the analyzer's wall time and
peak memory against a full batch on Ramify and Collection Review. Iteration 7
records daemon settled memory with and without a retained result and the
analyzer's peak memory in the real workflow.
## Iterations

| # | Title | Primary owner/capability | Exit dependency |
| ---: | --- | --- | --- |
| 1 | Preserve imported-path behavior | `analysis/typescript` | Access facts distinguish used and unused import paths; ordinary checks unchanged. |
| 2 | Project diagram facts and baselines | `analysis` and modularity probe | Frozen production diagram facts with per-original status; both clean baselines agree with headline metrics. |
| 3 | Build the lean dependency analyzer | `analysis/typescript`, `analysis`, root analyzer entry | Supplied-import classification over verified inputs equals the batch path; changed inputs are detected; time and memory recorded. |
| 4 | Serve the daemon operation | `daemon/contexts`, `daemon`, root vocabulary and assembly | Superseded, joining, one job, abort, retention and IPC work; the retained session is untouched. |
| 5 | Relay dependency views in the explorer server | `service-api` | `dependencyView` states, DTO mapping and lifecycle over a real daemon; no analysis code in the server. |
| 6 | Render dependency controls and panels | `presentation/project-view` | Pure component implements both projections, settings and all panel scopes. |
| 7 | Connect the page and run the gate | `explorer` and `integration-tests` | Real daemon/server/browser workflow, lifecycle budgets, hook isolation and documentation pass. |

Iterations run in order. Iteration 6 may not substitute fixture-only edge data
for iteration 5's real transport, and no iteration may derive imported links
from the old aggregate behavior facts.

## Review decisions

All decisions below were accepted on 2026-09-17:

- Codebase analysis for the explorer is started by the daemon, only when the
  diagram is requested.
- It runs as a separate, lean analyzer over the published revision's recorded
  imports and verified inputs, not in the retained session. CPU contention with
  concurrent checks is accepted; there is no idle gate or preemption.

1. Keep the existing aggregate `DependencyBehaviorFact` and add ordered
   per-access facts, rather than changing the headline dependency unit.
2. Verify inputs by acquiring the project again and comparing captured input
   identities with the published report, rather than retaining file contents in
   the daemon for the analyzer.
3. Allow one diagram job daemon-wide and answer `busy` to other requests, rather
   than one job per context.
4. Retain one result per context for its published revision only, with no
   history of older diagram results.
5. Replace the analysis page's default occurrence links while retaining raw
   occurrences as supporting evidence and leaving `/modules/latest` unchanged.

**Revision, 2026-09-17, after implementation:** iteration 6 encoded
non-behavioral-only edges as a dotted pattern, which took over the dash pattern
the graph already used for its direction animation. Behavior now joins status in
the colour dimension and the animation keeps the dashes. BD33 covers the
colours.

Changing one of these decisions requires revising this plan and its affected
acceptance rows first; do not resolve it ad hoc in a later iteration.

## Deferrals and handoff

Plan completion hands off the exact classification/projection contract, clean
Ramify and Collection Review baselines, result sizes, analyzer time and memory
against a full batch, daemon memory evidence, browser fixtures and the current
known coverage limits. Later work may add test source filters, runtime/type-load
filtering, historical trends, confidence estimates, alternative layouts, an MCP
or CLI client of the same operation, or module-move suggestions. None may
reinterpret the two headline counts delivered here.
