# Ramify implementation roadmap

**Date:** 2026-09-07. **Status:** Six planned deliverables. Plan 1 has a detailed
draft; Plans 2–6 have the authoring briefs below and no detailed plan yet.
Implementation completion must be established by each plan's evidence.

The intended system is defined in the [architecture documents](../../architecture/README.md).
They own the decided process/client, resource and testing architecture, plus
the proposed module tree, exposure routes, retained state and synchronization.
This roadmap owns the review process and sequence of working deliverables. Each
delivery iteration has one plan; architecture review, migration and verification
are tasks within that plan. The first detailed plan is
[Iteration 1: Verify a real Ramify project](../iteration-1-project-verifier/main-plan.md).
Batch delivery is followed by the resident daemon as a committed architectural
capability, rather than treating retained analysis as an optional optimization.

Use this document to choose the next deliverable and write its plan without
reconstructing decisions from conversation history. Each brief records its
prerequisites, ownership, required behavior, decisions to resolve, acceptance
evidence and outputs needed by later work. The architecture documents remain
authoritative for runtime behavior; this roadmap owns scheduling and handoffs.

## Scope and relation to the reference project

Deliver a reusable analysis engine and local daemon, with a CLI that can use the
retained analysis or run the same checks in batch mode. Batch checking is the
first deliverable; the next adds project contexts, file watching, exact-content
synchronization and retained checks. Richer inspection and explanations, MCP,
overlays and the explorer follow through the same analysis contracts. Keep the
existing diagram/site behavior working throughout migration.

The decided process model is a lightweight CLI, resident analysis daemon and
separate on-demand web process. Ordinary CLI commands use local IPC directly;
batch mode loads a fresh engine into the CLI process. The later web process uses
tRPC and built frontend assets. Its dependencies remain outside daemon startup.
The later root-level `mcp [dispatch]` module serves stdio through the lazily loaded
`ramify mcp` mode and calls the same daemon directly. It can be implemented before
visualization; optional MCP HTTP hosting can later use the separate web process.

The [project-explorer reuse analysis](../../analysis/project-explorer-reuse.md)
identifies source to lift during that later visualization phase. Review its
required facts, query boundaries and revision guarantees in the initial contract
review so the initial backend can support that client. UI extraction and browser transport
remain later deliverables; no empty visualization modules are needed now.

The [Collection Review plan](../reference-project/README.md), its
[implementation plan](../reference-project/implementation.md), and the
[reference harness](../reference-project/harness.md) remain independent work.
The reference application now has fifteen owners, including a standalone
`integration-tests [testing, dispatch]` owner whose ordinary `src/` contains
the Cucumber scenario. Re-inventory the actual project before each plan;
the example's owner count is distinct from the toolkit's owner count. Its unavailable
checker capabilities remain visibly pending. Tooling work activates individual
reviewed case instances as capabilities become available; passing one instance
does not complete every variant in its family.
Do not implement a second checker inside the example or harness.

The current evaluator under `src/model/` accepts constructed trees and predates
the registry, source areas and canonical source-binding identities. `src/viz/`
contains reusable diagrams. The filesystem loader, description parser, source
checker and daemon still require implementation. Reuse conforming algorithms and
meaningful tests; existing APIs cannot override the definitive principles.

## Architecture review

Review the [eleven-owner tree](../../architecture/daemon.md#ramifys-ownership-tree)
and the relevant contracts before coding. Nine owners are implemented in the
batch iteration; daemon and contexts complete that tree in iteration 2. In
particular, confirm:

- The analysis engine owns resolution, invalidation and rule evaluation; it is
  usable independently of process or protocol handling.
- The daemon owns local process/transport adapters, while its untagged contexts
  child owns worktree isolation, update ordering and revision publication.
- Required source semantics stay on the checking path; optional symbol details
  may be obtained lazily.
- Watching, retained sessions, explicit freshness and batch equivalence are
  baseline architectural commitments.
- UI/transport clients share the engine's results; tags and exposure routes keep
  their source dependencies compatible with the model.
- Entry points preserve the decided process split and lightweight startup paths.
  Retention, queue and client-lifecycle limits follow the memory architecture.
- Quick tests exercise real services through direct adapters, with separate
  evidence for actual IPC, HTTP, processes and browser behavior.

Runtime decisions still requiring detail are listed in the architecture's
[open decisions](../../architecture/daemon.md#decisions-still-requiring-review).
Approval of this review does not resolve the unspecified registry configuration
format or add any new importability rule.

## Contract and migration review

Before implementing an iteration, prepare its concrete review package. Review
later compatibility where it affects current boundaries; complete later runtime
contracts with their own delivery plan.

1. Exact public TypeScript contracts and package entry points. Include analysis
   sessions, context driver, immutable results, source/export catalogs, freshness
   requests, cancellation/conflict outcomes and capability reporting. Separate
   lightweight client, daemon, batch and later MCP/web entry files; review their
   transitive runtime dependencies, not just their exported types.
2. Complete `module.ramify` and purpose README drafts for every owner implemented
   in that iteration, plus a contract map listing originals, tags, exposure routes
   and intended consumers.
   Include every foreign signature type consumers must import; do not assume
   automatic type exposure or claim a foreign original through an owned wildcard.
3. The file-by-file source/test move map into the declared `src/` and `subs/`
   layout. Locate reusable visualization logic and explicitly account for build
   scripts and independent example/site scopes.
4. Build, test and package configuration for the nested tree, preserving portable
   and browser boundaries separately from Node analysis and executable code.
5. For the daemon iteration: wire protocol, context identity, context-to-daemon
   grouping/discovery, synchronization, overlay isolation and compatibility choices for the first
   daemon milestone. Specify retention budgets, backpressure, client leases,
   idle disposal and recovery behavior. The separate web process is decided;
   its detailed HTTP/event wiring remains a later capability.
6. A case map linking model/source requirements to the existing reference cases
   and runtime requirements to DA01–DA18, PC01–PC10, ML01–ML08 and QT01–QT08
   in the architecture documents. Design the daemon-owned direct-service binding
   and its root-owned interface exposure now;
   add the UI harness when visualization is implemented.

Root and analysis tests can exercise their own assembly and upward child contracts.
Context tests use controlled drivers/events/clocks. Owned tests move to each
owner's `src/tests/`; tests requiring additional classifications use a separate
properly exposed testing module with test code in ordinary `src/`.

Iteration 1 keeps diagram emission in an explicitly independent build-tool scope,
using supported presentation surfaces. Root's dispatch classification alone
cannot import UI contracts. Do not weaken tags to preserve the old combined barrel.

## Delivery sequence

Each iteration delivers a usable capability and has an explicit completion gate.
A requested missing or unrun checker stage cannot count as passed. Completed
bounded analysis with documented coverage limits is a different outcome, as
specified by the source principles. Iterations 2–6 below are the proposed sequence;
their detailed plans are written before their implementation.

| Plan | Working deliverable | Required predecessors | Plan artifact |
| --- | --- | --- | --- |
| [1. Verify a project](#plan-1-batch-project-verification) | A batch engine/CLI checks the real reference and Ramify itself. | None; begin from the current evaluator, diagrams and reference. | [Detailed Plan 1](../iteration-1-project-verifier/main-plan.md), draft for review. |
| [2. Keep verification current](#plan-2-resident-verification) | A resident daemon watches, reconciles and checks projects through local CLI commands. | Plan 1. | Brief below; detailed plan not yet written. |
| [3. Understand a project](#plan-3-project-inspection) | CLI/service inspection of ownership, purpose, contracts, availability and observed dependencies. | Plans 1–2. | Brief below; detailed plan not yet written. |
| [4. Use Ramify through MCP](#plan-4-mcp-access) | A host-launched stdio adapter exposes the daemon's checks and inspection. | Plan 2's service and Plan 3's queries for this deliverable's full scope. | Brief below; detailed plan not yet written. |
| [5. Check proposed changes](#plan-5-change-previews) | CLI/MCP clients check isolated unsaved edits and compare their effects. | Plans 2–3; Plan 4 for the MCP surface. | Brief below; detailed plan not yet written. |
| [6. Explore visually](#plan-6-project-explorer) | A standalone live explorer through a separate tRPC web process. | Plans 2–3; optional integrations may consume Plans 4–5. | Brief below; detailed plan not yet written. |

The numbering is the proposed implementation order. Dependency requirements
are narrower: the explorer can be delivered without MCP or overlays, and a
check-only MCP adapter could be delivered after Plan 2. The planned Plan 4
also exposes inspection, so its full gate includes Plan 3. Keep any rescheduling
explicit rather than silently deleting capabilities from a plan.

Suggested future directories are `iteration-2-resident-verifier`,
`iteration-3-project-inspection`, `iteration-4-mcp-access`,
`iteration-5-change-previews` and `iteration-6-project-explorer`, each under
`docs/plans/` with one `main-plan.md`. These are reserved names, not existing
artifacts. Replace the brief's status with a real link when its plan is written;
do not create empty plans or broken links in advance.

Future identity, freshness, query and overlay requirements inform the first
engine contract review. Their complete protocols are reviewed with the relevant
iteration. Presentation migration accompanies its changed model dependencies;
existing diagrams do not wait for the explorer.

MCP delivery does not depend on overlays or visualization. Streamable HTTP is
optional and requires its own session/lifecycle plan; it is not required by
iteration 4 or iteration 6.

Apply the additional architecture cases as follows. A case spanning several
capabilities is completed only when all its scheduled parts have evidence:

| Case family | Iterations 1–2 | Later iterations |
| --- | --- | --- |
| [PC01–PC10](../../architecture/processes-and-clients.md#acceptance-evidence) | 1: batch/help startup and applicable PC01 checks. 2: PC01–PC04/PC09, daemon parts of PC06, local-service PC07 and CLI/direct-client PC10. | 3: query-client equivalence; 4: PC08 and MCP portions of PC06–PC07/PC10; 6: PC05 and web portions including PC10. Optional HTTP MCP cases apply only when implemented. |
| [ML01–ML08](../../architecture/memory-lifecycle.md#measurement-and-acceptance) | 1: batch peak memory, result retention and disposal. 2: resident entry footprint, context/history/work bounds, repeated edits and local slow consumers. | 3: bounded inspection/enrichment; 4: ML08 stdio portions; 5: overlay limits; 6: web/browser footprint, serialization and ML05 open-close cycles. |
| [QT01–QT08](../../architecture/quick-testing.md#complementary-verification) | 1: batch QT01/QT03 and actual CLI process cases. 2: IPC QT04, daemon QT05 and relevant resource QT07. | 3: real query flows; 4: QT08; 5: real overlay flows; 6: QT02/QT06, HTTP QT04, web QT05 and remaining resource QT07. |

Browser-promise verification is a separate capability. Plan and implement its
algorithm explicitly before claiming it ran; the availability checker continues
to match declared promises according to the definitive rules.

## Plan 1: Batch project verification

**Detailed artifact:** [Iteration 1: Verify a real Ramify project](../iteration-1-project-verifier/main-plan.md).
Its implementation steps and I1-01–I1-30 instance matrix are the completion
authority for this deliverable. Do not duplicate or replace that matrix here.

**Working outcome.** `ramify check --batch <root>` checks real descriptions,
exports, source accesses, tags and testing origins, with human/JSON reporting.
The same command checks the reference and the migrated toolkit. The reference
application's own tRPC/MCP/Cucumber tests remain regression evidence.

**Implementation boundary.** Nine toolkit owners: root, analysis and its four
children, presentation and layout, and CLI. Use the definitive model and the
project's actual compiler configuration. Include the reference's fifteen owners
and both forms of testing source: owned `src/tests/` and a testing module's
ordinary `src/`. Daemon, web and MCP runtime are later.

**Completion and handoff.** Record the reviewed session/report contracts,
package entries, source/export identities, exact source scope, disposal
behavior, independent negative cases, compiler API findings and measured batch
costs. Plan 2 starts from these implemented contracts and evidence, not from
names proposed in an older architecture draft. Preserve access and declaration
provenance in results so Plan 3 can query it.

## Plan 2: Resident verification

**Detailed plan:** not yet written. **Prerequisite:** Plan 1's completed batch
engine, source scope, self-check and strict reference gate.

**Working outcome.** A user runs `ramify check` against an explicitly selected
project, edits source or a description, and obtains a result for verified
current inputs. `ramify watch` streams bounded updates. Daemon status and stop
commands work; explicit batch checking continues to run independently.

### Ownership and required implementation

Add root child `daemon [dispatch]` and its `contexts []` child, completing
the eleven-owner batch/resident tree. Daemon owns process startup/discovery,
local transport, the shared validated service implementation/in-process binding
and watcher adapters. Root exposes its dispatch-facing service interface downward
to daemon; the IPC host calls the same implementation as quick tests. Root
assembly supplies dependencies without duplicating validation or routing.
Contexts owns isolation, update ordering,
publication and leases; its neutral `AnalysisDriver` port is implemented by
root assembly using analysis sessions. Computational invalidation remains in
analysis, with compiler state private to its TypeScript child.

Implement retained sessions, watcher-driven updates, synchronized disk requests,
atomic revisions and bounded history together. Conservative reconciliation is
valid when narrower invalidation is uncertain; retaining a process that simply
returns stale snapshots is not the deliverable.

The lightweight local client must be importable separately from daemon startup,
compiler assembly and optional web/MCP dependencies. Root assembles distinct
CLI, daemon and batch entries. IPC operations use the same plain-data results
and semantics as the direct service binding used in quick tests.
External Node integrations use the same lightweight `connectDaemon` client,
with host-owned process lifetimes and the shared lease/cleanup rules; they add
no owner or independent analyzer.

### Resolve while writing the detailed plan

1. Supported platforms and local transport, endpoint discovery, daemon grouping,
   ownership of endpoints, concurrent startup coordination and stale cleanup.
   Select a concrete initial deployment arrangement; do not leave several
   incompatible lifecycle designs for the implementer to choose.
2. Context selection from real worktree/root, source scope, configuration,
   registry and adapter setup; compatibility handshake and behavior when clients
   request incompatible setups. Branch names alone cannot identify contexts.
3. Context/generation/revision tokens, input fingerprints, published versus
   synchronized reads, request IDs, cancellation and supersession. A delayed
   watcher must not satisfy a saved-content request from an older revision.
4. The invalidation dependency model: source, unexposed exports, wildcard
   expansion, original kind/merging, testing-area moves, descriptions, registry,
   configuration, resource shims/existence, package resolution and README inputs.
   Include missing-file/directory membership dependencies.
5. IPC schemas/framing, notification ordering, size bounds, backpressure,
   reconnect/resynchronization and schema/build compatibility. Define what may
   be coalesced and how a client learns that replay is unavailable.
6. Per-context and global memory/work budgets, lease/idle durations, history
   retention, optional eviction and explicit resource-unavailable outcomes.
   Determine numeric budgets from Plan 1 measurements and resident workloads.
7. Encode the decided idle-exit, crash and explicit-stop outcomes in discovery
   and shutdown records, including missed notifications and explicit resumption.
   Idle exit allows startup on the next real request; active watch leases prevent
   idle exit; an explicit stop suppresses restart by existing clients. Specify
   finite retry/startup limits. Only terminating CLI commands may use visible
   in-process batch fallback; watch and other long-lived clients report unavailable
   after exhausted recovery. Never substitute disk/current state for an operation
   that requires an unavailable overlay or historical input.
8. User-facing command arguments, output and exits, preserving Plan 1's
   distinction between denial, incomplete execution and bounded coverage.

Overlay execution, new inspection commands, MCP and HTTP are excluded.
Keep future overlay/query fields extensible and advertise the exact current
capabilities; no unimplemented mode can pass a request.

### Required evidence and next-plan inputs

Use DA01–DA10, resident portions of DA13–DA15 and DA17, PC01–PC04/PC06/PC09,
local-service PC07, CLI/direct-client PC10 and the applicable ML/QT cases. Include:

- Removing an exposure invalidates unchanged importers; repairing it removes
  the denial. Wildcard growth, type-to-runtime merging and resource/configuration
  changes trigger the corresponding rechecks.
- Delayed/lost watcher events and concurrent saves yield verified results or
  explicit supersession/conflict, never falsely fresh success.
- Two worktrees and incompatible analysis setups remain isolated. Invalid
  current descriptions are not answered from a last-valid model.
- Batch and incremental results agree for identical captured inputs, including
  coverage and expanded contracts. Independent expected failures still run.
- Real IPC/process tests cover simultaneous startup, abrupt loss, explicit stop
  with a missed notification, idle exit followed by a real request, active watch
  leases, eviction, reconnect and disposal. Direct Node clients get the same
  validation/lease tests. Exhausted watch/direct-client recovery does not load or
  spawn an engine; eligible terminating CLI fallback is visible and disposes.
  Quick tests use the shared daemon service with real contexts/engine and
  controlled event/input/clock adapters, including rejected context/scope input.
- Fixed-size repeated workloads reach agreed retention limits. Measure cold,
  warm and broad rebuilds plus 100/500/1,000-owner fixtures; include queued bytes,
  history, contexts, heap, buffers, RSS and peak publication allocations.
  Check in measurement fixtures and preserve versioned raw results using the
  [measurement recipe](../../architecture/memory-lifecycle.md#repeatable-setup-measurements)
  and separately instrumented resident workloads.

Hand off a documented client API, lifecycle/error tables, codecs, revision and
freshness guarantees, supported platforms, resource budgets, event/direct-test
adapters and runnable concurrency/recovery fixtures. Plans 3–6 reuse them.

## Plan 3: Project inspection

**Detailed plan:** not yet written. **Prerequisites:** Plans 1–2, including
revisioned snapshots, source/contract evidence and the lightweight daemon client.

**Working outcome.** Through `ramify inspect ...` and `ramify explain ...`,
a user can identify a file's owner/source area, read a module's purpose and
contracts, ask whether a particular consumer may import an original, and inspect
its actual incoming/outgoing usage. Human and JSON clients receive the same
revision-qualified answers.

### Ownership and required implementation

Extend analysis queries, project metadata and optional TypeScript enrichment.
Root owns dispatch-facing service vocabulary; daemon delivers the operations;
CLI formats them. No new shared-contract owner or second permission catalog is
needed. Keep ordinary-source and testing consumers explicit in every
availability query.

Provide bounded hierarchy/module lookup, contract names and original identities,
aliases/tags, exposure evidence, source locations, module README summaries,
consumer-specific value/type availability and observed access drill-down.
Include basic name/purpose lookup and selected signature detail useful to humans
and agents; advanced ranking and whole-project complexity are later extensions.

Define observed file-target edges separately from original-binding use and
exposure routes. Each aggregate declares its unit, source-area filter and owned
versus subtree scope. Count owned files once; retain denied accesses in observed
usage and unused available exports in contract inspection.

### Resolve while writing the detailed plan

1. Exact query families, command syntax and bounded detail levels. Specify
   pagination/cursors, filters, limits and stable ordering, using Plan 2's
   revision contract. A page/cursor cannot drift to a newer snapshot silently.
2. How consumers are identified: file or owner/source area plus value/type form.
   Distinguish hypothetical original availability from the legality of a
   concrete import spelling, which must pass source-origin checks too.
3. Whether candidate import spellings are returned initially. If they are,
   resolve and check them at the requested revision. Proposed exposure edits
   must be labeled proposals, never existing permissions.
4. Signature/documentation extraction and explicit missing/enrichment states.
   Late or failed enrichment cannot invalidate completed enforcement or return
   current compiler data labeled as a historical revision.
5. Minimal observed-usage summaries needed by the later graph, their counting
   rules and drill-down IDs. No graph-library objects enter service contracts.
6. Bounded source/name search scope and exclusions. Own-source search excludes
   child implementations; inspection/search does not confer write authority.
7. Query cache limits and keys, enrichment scheduling/cancellation and reporting
   completion to clients. Unknown/missing information must not become zero.

The [reuse analysis](../../analysis/project-explorer-reuse.md#what-to-lift-from-cucumber-viz)
identifies declaration extraction, surface rendering and bounded search helpers
to evaluate here. Lift useful algorithms with their tests and adapt them to
Ramify originals and revision inputs. Do not copy barrel discovery, automatic
foreign vocabulary inlining or the old global cache.

### Required evidence and next-plan inputs

Use DA12, query/enrichment portions of DA13–DA15, H01–H03, PC07 and ML06;
retain the applicable quick-service and actual IPC/serialization tests.

Demonstrate a browser consumer and its tests receiving different availability
answers for the same visible original; a testing barrel invalidating an
otherwise available suggested import; README edits changing descriptions only;
wildcard growth updating contracts without changed declaration text; correct
own/subtree usage counts; and explicit invalid/evicted/pending results.
A selected signature requested while analysis advances must come from the
requested revision or be unavailable.

Hand off the versioned query schemas, example responses for every result state,
stable lookup/drill-down identifiers, counting definitions, detail limits and
consumer-aware fixtures. These are the backend contracts for MCP and the
explorer. Full H04 host lifecycle/write policy is not completed by this plan.


## Plan 4: MCP access

**Detailed plan:** not yet written. **Prerequisites:** Plan 2's local service;
Plan 3's inspection contracts for this plan's full tool/resource set.

**Working outcome.** An editor or agent host launches `ramify mcp` once,
initializes a stdio session and performs checks, module inspection and
explanations through the existing daemon. Calls from multiple hosts reuse
compatible analysis while keeping each host's context selections separate.

### Ownership and required implementation

Add root child `mcp [dispatch]`. It owns MCP registration, input schemas,
tools/resources, protocol sessions and result/error mapping. Root injects the
lightweight daemon client. CLI dispatch loads the adapter only for the serving
mode and remains in that process for the stdio connection.

MCP calls use the service directly. They do not shell out to the CLI per request,
route through tRPC, create a compiler session per host or start the web server.
Logs go to stderr; stdout remains protocol-only. Adapter exit releases its
resources and does not stop the resident daemon.

### Resolve while writing the detailed plan

1. Supported MCP SDK/protocol versions and a concrete minimal tool/resource
   inventory mapped to Plan 2–3 operations. Name each operation, its schema,
   selected project/context and freshness behavior.
2. Session configuration/project selection and resource identity. MCP session
   IDs and any resource URIs cannot substitute for daemon generation/revision
   tokens or silently select another worktree.
3. Capability advertising before/after context selection, input validation,
   transport errors versus domain denials, invalid/unavailable results and
   bounded output/paging. Preserve coverage and compiler distinctions.
4. Cancellation, subscriptions, connection termination and abnormal process
   loss. Specify lease release/expiry and how idle connections avoid pinning
   historical revisions or warm contexts indefinitely.
5. Compatibility negotiation, daemon reconnect and eviction handling, implementing
   the shared idle-exit/crash/explicit-stop contract with finite recovery. Idle
   exit permits startup on the next request; explicit stop pauses existing sessions
   until explicitly resumed. Reopened contexts have new generations. Exhausted
   recovery returns unavailable without in-process or subprocess batch fallback.
6. A real in-memory protocol client/server binding over the injected real service,
   and focused tests that launch the actual stdio executable.
7. Aggregate memory bounds with several simultaneous hosts, not just one adapter.

Follow the [MCP placement and lifetime](../../architecture/processes-and-clients.md#mcp-server)
already selected. Streamable HTTP, prompts for new agent workflows, agent
launching and write automation are not required by this plan.

### Required evidence and next-plan inputs

Execute MCP portions of PC01/PC06–PC08/PC10, ML08 and QT08. Verify initialization,
schema validation, framing, protocol-only stdout, cancellation, structured
findings, loss/recovery and equivalence with the direct service/CLI at the same
input revision. A denial plus an analysis limit must remain a denial.

Run two clients, terminate one, and show that the other still checks the correct
context. Repeated connect/call/disconnect cycles must release leases and remain
within measured adapter/daemon memory limits. No web startup or duplicate
compiler context is needed for a compatible project.
Exercise idle daemon exit, next-request startup, missed explicit-stop notification
and failed recovery with the actual stdio process. Verify that its compiler
dependency footprint stays empty throughout. Preserve executable measurement
fixtures, dependency/runtime versions and raw multi-host memory results.

Hand off tool/resource schemas, host launch configuration, protocol compatibility
rules, real-client test helpers, error examples and lifecycle measurements.
Plan 5 adds overlay operations through this same adapter.

## Plan 5: Change previews

**Detailed plan:** not yet written. **Prerequisites:** Plan 2's contexts,
history/freshness contracts and budgets; Plan 3's inspection queries; Plan 4 for MCP
delivery. A CLI-only implementation can precede MCP if scheduling is revised.

**Working outcome.** A user or agent supplies proposed edits, checks their
architectural effects and inspects changed contracts/findings without writing
the project. Two simultaneous proposals remain isolated from disk and each other.

### Ownership and required implementation

Extend contexts with overlay lifecycle/versioning, project input views with
virtual file content/membership, and analysis with overlay checking using the
same parser, resolver and model. Root service contracts, CLI and MCP expose the
operations. No parallel overlay evaluator or application write service is added.

The minimum useful preview supports source and description edits, additions,
deletions and renames, with resource existence and resolution using that same
view. This permits previews of exposure edits and source-area/module moves.
Freeze any additional configuration/registry-edit capabilities explicitly;
an unsupported input class must be rejected as unavailable rather than ignored.

### Resolve while writing the detailed plan

1. Overlay identifiers, owning client/session, base context/generation/revision,
   per-file client versions, change representation and overlay revision tokens.
2. Create/update/check/query/compare/close operations and concrete CLI/MCP
   input formats. Select whole-file bytes or a precise patch contract, including
   addition/deletion/rename semantics and validation.
3. Base retention and staleness: when disk/base changes cause a conflict, whether
   explicit rebasing is offered, and how an evicted base or restarted daemon is
   reported. No automatic merge or disk substitution is implied.
4. Virtual discovery, configuration/resource reads and compiler input coherence.
   A proposed new `module.ramify` must affect ownership in the overlay; files
   removed in the overlay must not reappear through a disk fallback read.
5. Comparison semantics for findings, coverage, expanded contracts and affected
   consumers. Binding identity is not guaranteed through arbitrary renames:
   label additions/removals unless an explicit mapping establishes continuity.
6. Limits on overlay count, source bytes, base/history leases, concurrent checks,
   idle lifetime and output size. Define cleanup on cancellation/client loss.
7. Exact saved-disk versus unsaved-overlay mode behavior. A successful preview
   does not claim the same inputs have been saved or authorize writes.

### Required evidence and next-plan inputs

Execute DA11, overlay portions of DA02–DA04/DA10/DA12/DA15/DA17,
ML03–ML04/ML06–ML08 and the applicable CLI/MCP lifecycle tests.

Demonstrate independent overlays with opposite exposure changes; edits to an
unchanged consumer's provider; adding an interface export; production/testing
source moves; removed resources; and invalid proposed declarations. Assert
that disk bytes and other clients' results are unchanged.

Compare overlay results with a fresh batch check of an isolated materialization
of exactly those effective inputs. Deliberately stale bases, conflicting client
versions, context restart, cancellation, abandoned clients and memory pressure
must produce their named outcomes and release eligible state.

Hand off the overlay change format, lifecycle/error table, comparison result
schema, capability restrictions, temporary-materialization oracle and resource
measurements. Any later preview UI can consume these contracts; this plan
does not require adding that UI.

## Plan 6: Project explorer

**Detailed plan:** not yet written. **Prerequisites:** Plan 2's revisioned
service/notifications and Plan 3's inspection/evidence queries. MCP and overlays
are optional integrations, not prerequisites for the core explorer.

**Working outcome.** `ramify explore <root>` starts or reuses the separate
web process and opens a live module explorer. A user navigates the ownership
tree, selects modules/edges, reads purpose/contracts/source evidence, understands
a violation and sees consistent updates after an edit.

### Ownership and required implementation

Add root children `service-api [dispatch]` and
`explorer [ui, browser, dispatch]`, plus
`presentation/subs/project-view [ui, browser]`. Add
`integration-tests [testing, ui, dispatch]` for combined service/view tests
when needed, with test source in its ordinary `src/`.

Service-api owns Express/tRPC delivery, notifications and built assets, consuming
the daemon through its lightweight client. Explorer owns browser context
selection, requests and coordinated view state. Project-view owns reusable
rendering and interactions supplied with neutral data and UI callbacks.
Geometry uses layout through legal exposure; root may declaration-relay UI
contracts without importing UI values.

Use the [source reuse analysis](../../analysis/project-explorer-reuse.md)
as the extraction inventory. Reinspect the actual source and tests when
authoring this plan; the analysis records a point-in-time investigation.

| Source candidates named in the reuse analysis | Lift/adapt for this plan |
| --- | --- |
| `ModuleArchitecturePageView`, module/edge detail views | Selection, navigation, resizable details and loading/error behavior through Ramify query results. |
| `ModuleGraphRadial`, `moduleGraphShared`, legend and required styles | Radial navigation, pan/zoom, minimap, external-to-view nodes and filtering, with declared ownership and explicit relations/counts. |
| `ExportList` and signature/source detail rendering | Original identity, aliases, expanded contracts, consumer availability and revision-qualified source evidence from Plan 3. |
| Connected page/container | Replace source analysis hooks and caches with the Ramify service client and revision subscription contract. |
| Direct-caller tRPC link and event-channel test patterns | Real client/router/validation/service flows in-process, with disposal and separate wire tests. |
| Module/edge discussion context helpers | Preserve an injected integration point for host discussion; a standalone conversation service is optional. |

Lift cohesive components, required CSS/assets and useful workflow tests.
Replace dependency-cruiser discovery, mandatory barrels, old ownership-prefix
counting and global semantic caches. The web process owns no second analyzer.

### Resolve while writing the detailed plan

1. Concrete first-release screens and interactions, including hierarchy,
   breadcrumbs, filtering, module/edge selection, details, exposure versus
   usage presentation and diagnostic/coverage states. Record a reviewable UI
   flow and acceptance screenshots/examples before implementation.
2. Exact service queries, graph aggregation and count units. Attribute each file
   to its actual owner; show subtree totals as explicit rollups. Missing counts
   cannot render as measured zero, and imported names cannot be labeled calls.
3. Browser request and notification contracts, subscription cleanup, reconnect,
   invalid current models and revision changes during detail/enrichment requests.
   Old results cannot overwrite newer selections or mix revisions invisibly.
4. Express/tRPC/static entry points, local binding/origin/access policy, web
   discovery/reuse, client leases and the shared idle-exit/crash/explicit-stop
   recovery contract. Failed recovery never loads or spawns a batch analyzer.
   Serve built assets normally; development tooling has its own entry/lifetime.
5. Pure view props and portable package exports for consumption outside Ramify.
   Ensure UI and dispatch types stay with compatible owners; no foreign
   originals are claimed by an interface wildcard.
6. Bounded query/cache/serialization behavior and backpressure for hidden,
   disconnected or slow clients. Closing the last browser eventually releases
   web memory without throwing away warm daemon analysis.
7. Quick test assembly: real React route/hooks, tRPC client/direct caller link,
   router validation, injected real service, contexts/engine and temporary files,
   plus a direct event channel. Define the separate actual HTTP/process/browser
   suite for behavior that this harness cannot establish.

Streamable HTTP MCP hosting and an overlay preview screen require explicit
additional scope if desired. If HTTP MCP hosting is included, active MCP leases
participate in web lifetime; browser closure alone cannot stop their server.

### Required evidence and next-plan inputs

Execute PC05 and web portions of PC01/PC06–PC07/PC10, ML01/ML04–ML07,
QT02/QT04–QT07 and relevant DA12–DA15 query/revision cases. Select concrete
workflows from the reuse analysis and name each required instance.

Use real Collection Review analysis. Show navigation across nested owners,
consumer/test-area filters, wildcard contract changes, denied imports with
source evidence, invalid inputs and pending/unavailable enrichment. Assert that
rendered summaries and edge details agree with the CLI/service for the same
revision and counting scope.

Run a browser against the actual web process for layout/navigation/interaction,
and lifecycle tests for reconnect, slow clients and repeated open/close cycles.
Measure web and daemon memory separately and together, retaining runnable
fixtures, runtime/dependency versions and raw results. A successful quick test
or static bundle alone does not prove these runtime behaviors.

Hand off reusable view/package documentation, the selected extraction/provenance
record, interaction and browser tests, query-to-view mappings, web lifecycle
configuration and measured limits. A consuming application must be able to use
the extracted view without importing the standalone server or an agent platform.


## Information to preserve between plans

Every completion report must leave enough concrete information to author its
successors. Store these records beside the detailed plan or link to the owning
source/architecture document; do not depend on conversation history.

| Producer | Required handoff | Consumers |
| --- | --- | --- |
| Plan 1 | Implemented package/session/report contracts; canonical source/export facts and exposure evidence; reference instance map; scope/configuration/compiler decisions; self-check and batch resource results. | All later plans. |
| Plan 2 | Context/generation/revision and freshness contracts; local codecs/client; event ordering and distinct idle-exit/crash/explicit-stop rules; restricted fallback policy; daemon-owned direct-service harness; measured limits and platform support. | Plans 3–6. |
| Plan 3 | Inspection/availability/query schemas; source and original drill-down IDs; usage/counting definitions; detail/cursor/error states; bounded enrichment and consumer fixtures. | Plans 4–6. |
| Plan 4 | MCP tool/resource schemas and host launch setup; protocol/session lifecycle; actual and in-memory protocol clients; capability and error mapping. | Plan 5 and optional later MCP hosting. |
| Plan 5 | Overlay input/lifecycle/version contract; comparison result schema; supported edit classes; conflict/eviction examples and materialized-input batch oracle. | Optional explorer preview UI and future editor integrations. |
| Plan 6 | Reusable view exports/props, web lifecycle and query-to-view contracts; extraction provenance; quick/HTTP/browser evidence and measured memory behavior. | Consuming applications and later visualization features. |

Across every handoff, preserve the distinctions between original and accessed
file, visibility and availability, ordinary/testing source, declared exposure
and observed usage, completed checking and optional enrichment, and input
revision versus live disk state. Changing their meaning requires a reviewed
contract/model change, not an adapter-specific interpretation.

Keep a capability ledger at instance level. It records authority, required
capability, implemented availability, execution outcome and coverage separately.
When a plan completes, record which portions of DA/PC/ML/QT and reference case
families it established and which are still pending. Cases spanning several
plans stay partial until all scheduled portions have evidence.

## How to author each later plan

Use the corresponding brief above together with the actual predecessor
deliverables. The brief is input to a detailed plan; it does not authorize
implementation of contracts that have not been reviewed.

1. Re-read the authoritative model/source specifications, architecture, this
   roadmap, the reference catalogue and predecessor completion reports.
   Re-inventory current source and tests; replace stale paths/counts in the
   new plan with verified evidence.
2. State one runnable user workflow and a finite completion boundary. Record
   prerequisites by implemented capability, rather than only by plan number.
   Preserve supported behavior from all completed plans.
3. Resolve the brief's listed decisions into a concrete proposal: public
   TypeScript/wire schemas, CLI/API behavior, ownership/exposure manifests,
   package entries, source/test placement and lifecycle/error tables. Include
   every consumer-needed foreign type and explicit browser promise.
4. Break the work into ordered steps within this one plan. Each step names
   source owners, implementation tasks, validation and a reviewable exit
   condition. Write exact migrations and fixtures where required; do not defer
   the hard semantic decisions to an unspecified implementation task.
5. Expand relevant DA/PC/ML/QT and reference families into independently expected
   instances with stable plan-local IDs, required capabilities and named fixtures.
   Include positive controls, intentional denials, invalid/unavailable states,
   cancellation and boundary tests. Distinguish quick evidence from actual
   transport/process/browser evidence.
6. Specify measurable resource budgets, representative workloads and numeric
   acceptance criteria based on predecessor measurements and new probes.
   Exact values may be finalized during contract review, before acceptance;
   "lightweight" or "no leaks" alone is not a testable budget.
7. Record explicit deferrals and the information needed by successor plans.
   Any newly discovered prerequisite belongs to a named current-plan task or
   an explicit roadmap revision, not hidden scope growth.
8. Author one detailed `main-plan.md` and register it as a single iteration.
   If planning metadata is used, set `singleIteration: true` with one
   iteration pointer to that main plan; work steps are not nested delivery plans.
9. Link the created artifact from this roadmap and mark it as a draft. Review
   its concrete architecture/contracts before implementation. Advance status
   to implemented only when its strict gate and completion report establish it.

A plan's detailed matrix may refine the scheduling map, but must explain any
changed scope and retain unresolved portions. Plan creation, passing metadata
validation or a clean build is not implementation completion.

## Work outside the six baseline deliverables

The roadmap does not imply that every reference family, runtime construct or
separate policy is complete after Plan 6. Keep the following visible when
writing future plans; they do not block the current Plan 1 gate.

| Work | Existing decision / remaining question | When to plan it |
| --- | --- | --- |
| Registry configuration serialization | Generic resolved registries and custom tag kinds are required in Plan 1. User-facing serialization, default replacement and configuration loading remain unspecified. | When projects need to supply registry definitions through ordinary CLI/service configuration. Review its source input, identity and invalidation effects before adoption. |
| Additional source adapters | The bounded source profile stays explicit. Vite macros, Jiti, compiled-source mapping and other tool-specific interpretation require real target/selection evidence; unsupported access is not automatically external. | Select concrete remaining S/K instances when expanding checking coverage for an actual project. Do not add a second resolver/checker in a client. |
| Reference browser/tool compatibility | The reference application's K cases exercise its own runtime. They are distinct from tests of Ramify's explorer; existing Cucumber execution does not establish every browser/tool case. | Extend the independent reference harness when those fixtures are implemented; attach source assertions only when the corresponding adapter exists. |
| Browser-promise verification | Matching the declared browser tag is part of ordinary checking. Proving the promise is a separate verifier with its own capability, coverage and owner findings. | A separately scoped plan if verification is requested. Until then, requesting it returns unavailable. |
| MCP Streamable HTTP | Optional hosting of the same MCP module in the web process; no MCP-to-tRPC forwarding layer. | Only when HTTP hosting is needed; specify MCP sessions, cancellation/reconnect, local access policy and shared web lifetime. |
| Preview UI, discussion and host/editor integrations | Overlay service operations and injected UI integration points can be reused. Agent launching, write authority and host workflow lifecycle remain separate responsibilities. | Concrete consumer needs justify their own adapters and cases, including remaining H04 portions. |
| Advanced search, metrics and placement suggestions | Query facts are reusable; ranking, complexity formulas and proposed architecture edits are additional features. Availability alone does not approve a new exposure or a write. | After defining the user workflow, counting/scoring semantics, scope and output limits. |
| Persistent caches, worker pools and process recycling | No requirement to add them speculatively. They must preserve context generations, input identity and explicit unavailable/recovery results. | Only after measurements identify a problem and demonstrate a useful improvement. |
| Design probes P01–P06 and independent policies X01–X02 | Probes are not adopted rules. Naming/API quality, cycles and build/bundling policies are not importability checks. | Separate explicit design or policy work; do not turn them into baseline acceptance failures. |

The interface-file wildcard is already definitive and belongs to Plan 1; it
is not deferred alongside registry serialization or bundling.


## Verification and completion

Run focused tests appropriate to each implemented capability, normal toolkit
build/type checks and existing diagram/site checks when their inputs change.
As the loader and source checker mature, make their supported self-checks part of
the toolkit's own required commands. The implementation and fixtures remain
independent of any enclosing repository's build or enforcement setup.

For each runtime milestone, compare daemon/incremental results with fresh batch
results over identical roots, source bytes, descriptions, configuration, registry
and requested capabilities. Normalize only runtime metadata such as generation
identifiers and timings. Independently stated expected outcomes remain necessary
because both modes share the same engine.

Measure cold analysis, warm edits, provider/description/configuration changes,
query latency and memory with representative projects and synthetic owner counts.
Use the [memory measurement requirements](../../architecture/memory-lifecycle.md#measurement-and-acceptance)
for repeated-use plateaus, peak allocation, global budgets and reclamation.
Start setup comparisons with the [checked-in probe](../../../scripts/memory-probe.mjs),
then add real-entry fixtures and runtime workloads as each plan is implemented.
Retain exact recipes, input fixtures, environment/dependency versions and raw
results; the historical setup figures alone are not acceptance evidence.
Agree budgets from those measurements. Conservative recomputation may precede finer
invalidation; correct retained sessions and watching are required, while persistent
disk caches and worker pools require a demonstrated need.

Completion reports list implemented and executed capabilities, known failures,
source coverage, synchronization evidence and outstanding architectural acceptance
cases separately. Passing a subset of reference cases, or Ramify accepting its own
tree, does not establish completion of the daemon architecture.
