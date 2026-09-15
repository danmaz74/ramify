# Ramify implementation roadmap

**Date:** 2026-09-11. **Status:** Plan 1 is complete. Its batch engine, CLI and
self-check are merged on `main`, where the unfiltered 308-instance gate passed
on 2026-09-10; the [completion report](plans/done/iteration-1-project-verifier/iterations/iteration15-results.md)
records the evidence and the inputs carried forward. Plan 2 is complete and
merged. Every remaining deliverable has the authoring brief below; Plans 3,
5 and 7 also have detailed plan artifacts.
Implementation completion must be established by each plan's evidence.

**Revision, 2026-09-11:** overlays are removed and the change-previews
deliverable is withdrawn. Its number is reused by
[Plan 5: fast incremental checks](#plan-5-fast-incremental-checks), whose main
use case is agent post-write hooks. The same revision rewrote the
[Plan 3 brief](#plan-3-project-inspection) around the agent's use case:
listing the foreign symbols available in the module a coding agent is working
in, with the specifier to write. Its explorer-facing usage aggregates moved to
Plan 6. Plans 3 and 5 both have draft detailed plans awaiting their contract
reviews and are written to be implemented in parallel; only Plan 3's join
iteration depends on Plan 5.

**Addition, 2026-09-12:** [Plan 7: affected modules](#plan-7-affected-modules)
is a draft for selecting modules to test from Plan 5's live dependency facts,
through the API, CLI and MCP. It follows the retained-session provider;
its MCP integration also requires Plan 4's stdio adapter.

The intended system is defined in the [architecture documents](architecture/README.md).
They own the decided process/client, resource and testing architecture, plus
the proposed module tree, exposure paths, retained state and synchronization.
This roadmap owns the review process and sequence of working deliverables. Each
deliverable has one plan, run as a sequence of iterations each sized for a
single 250k-token implementation context; architecture review, migration and
verification are tasks within those iterations. The first detailed plan is
[Plan 1: Verify a real Ramify project](plans/done/iteration-1-project-verifier/main-plan.md).
Batch delivery is followed by the resident daemon as a committed architectural
capability, rather than treating retained analysis as an optional optimization.

Terminology: a **plan** is one of the deliverables below; an **iteration**
is a unit of work inside a plan, sized for one implementation context. The
architecture documents' "batch iteration" and "resident iteration" refer to
Plans 1 and 2. Plan directories keep the historical `iteration-N-` prefix.

Use this document to choose the next deliverable and write its plan without
reconstructing decisions from conversation history. Each brief records its
prerequisites, ownership, required behavior, decisions to resolve, acceptance
evidence and outputs needed by later work. The architecture documents remain
authoritative for runtime behavior; this roadmap owns scheduling and handoffs.

## Scope and relation to the reference project

Deliver a reusable analysis engine and local daemon, with a CLI that can use the
retained analysis or run the same checks in batch mode. Batch checking is the
first deliverable; the next adds project contexts, file watching, exact-content
synchronization and retained checks. Fast incremental checks for agent
post-write hooks, richer inspection and explanations, MCP and the explorer
follow through the same analysis contracts. Keep the existing diagram/site
behavior working throughout migration.

The decided process model is a lightweight CLI, resident analysis daemon and
separate on-demand web process. Ordinary CLI commands use local IPC directly;
batch mode loads a fresh engine into the CLI process. The later web process uses
tRPC and built frontend assets. Its dependencies remain outside daemon startup.
The later root-level `mcp [dispatch]` module serves stdio through the lazily loaded
`ramify mcp` mode and calls the same daemon directly. It can be implemented before
visualization; optional MCP HTTP hosting can later use the separate web process.

The [project-explorer reuse analysis](analysis/project-explorer-reuse.md)
identifies source to lift during that later visualization phase. Review its
required facts, query boundaries and revision guarantees in the initial contract
review so the initial backend can support that client. UI extraction and browser transport
remain later deliverables; no empty visualization modules are needed now.

The [Collection Review plan](plans/reference-project/README.md), its
[implementation plan](plans/reference-project/implementation.md), and the
[reference harness](plans/reference-project/harness.md) remain independent work.
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

Review the [eleven-owner tree](architecture/daemon.md#ramifys-ownership-tree)
and the relevant contracts before coding. Nine owners are implemented in the
batch plan; daemon and contexts complete that tree in Plan 2. In
particular, confirm:

- The analysis engine owns resolution, invalidation and rule evaluation; it is
  usable independently of process or protocol handling.
- The daemon owns local process/transport adapters, while its untagged contexts
  child owns worktree isolation, update ordering and revision publication.
- Required source semantics stay on the checking path; optional symbol details
  may be obtained lazily.
- Watching, retained sessions, explicit freshness and batch equivalence are
  baseline architectural commitments.
- UI/transport clients share the engine's results; tags and exposure paths keep
  their source dependencies compatible with the model.
- Entry points preserve the decided process split and lightweight startup paths.
  Retention, queue and client-lifecycle limits follow the memory architecture.
- Quick tests exercise real services through direct adapters, with separate
  evidence for actual IPC, HTTP, processes and browser behavior.

Runtime decisions still requiring detail are listed in the architecture's
[open decisions](architecture/daemon.md#decisions-still-requiring-review).
Approval of this review does not resolve the unspecified registry configuration
format or add any new importability rule.

## Contract and migration review

Before implementing a plan, prepare its concrete review package. Review
later compatibility where it affects current boundaries; complete later runtime
contracts with their own delivery plan.

1. Exact public TypeScript contracts and package entry points. Include analysis
   sessions, context driver, immutable results, source/export catalogs, freshness
   requests, cancellation/conflict outcomes and capability reporting. Separate
   lightweight client, daemon, batch and later MCP/web entry files; review their
   transitive runtime dependencies, not just their exported types.
2. Complete `module.ramify` and purpose README drafts for every owner implemented
   in that plan, plus a contract map listing originals, tags, exposure paths
   and intended consumers.
   Include every foreign signature type consumers must import; do not assume
   automatic type exposure or claim a foreign original through an owned wildcard.
3. The file-by-file source/test move map into the declared `src/` and `subs/`
   layout. Locate reusable visualization logic and explicitly account for build
   scripts and independent example/site scopes.
4. Build, test and package configuration for the nested tree, preserving portable
   and browser boundaries separately from Node analysis and executable code.
5. For the daemon plan: wire protocol, context identity, context-to-daemon
   grouping/discovery, synchronization and compatibility choices for the first
   daemon milestone. Specify retention budgets, backpressure, client leases,
   idle disposal and recovery behavior. The separate web process is decided;
   its detailed HTTP/event wiring remains a later capability.
6. A case map linking model/source requirements to the existing reference cases
   and runtime requirements to DA01–DA18, PC01–PC10, ML01–ML08 and QT01–QT08
   in the architecture documents. Design the daemon-owned direct-service binding
   and its root-owned interface exposure now;
   add the UI harness when visualization is implemented.

Root and analysis tests can exercise their own assembly and their children's to-parent contracts.
Context tests use controlled drivers/events/clocks. Owned tests move to each
owner's `src/tests/`; tests requiring additional classifications use a separate
properly exposed testing module with test code in ordinary `src/`.

Plan 1 keeps diagram emission in an explicitly independent build-tool scope,
using supported presentation surfaces. Root's dispatch classification alone
cannot import UI contracts. Do not weaken tags to preserve the old combined barrel.

## Delivery sequence

Each plan delivers a usable capability and has an explicit completion gate.
A requested missing or unrun checker stage cannot count as passed. Completed
bounded analysis with documented coverage limits is a different outcome, as
specified by the source principles. Plans 2–7 below are the proposed
sequence; their detailed plans are written before their implementation. Plans
3 and 5 both follow Plan 2 and may be implemented at the same time: Plan 3's
first seven iterations need nothing Plan 5 delivers, and its eighth joins
Plan 5's retained session.

| Plan | Working deliverable | Required predecessors | Plan artifact |
| --- | --- | --- | --- |
| [1. Verify a project](#plan-1-batch-project-verification) | Complete: the batch engine/CLI checks the real reference and Ramify itself, and the 308-instance gate passed on `main`. | None. | [Detailed Plan 1](plans/done/iteration-1-project-verifier/main-plan.md); [completion evidence and limits](plans/done/iteration-1-project-verifier/iterations/iteration15-results.md). |
| [2. Keep verification current](#plan-2-resident-verification) | A resident daemon watches, reconciles and checks projects through local CLI commands. | Plan 1. | Complete: merged on 2026-09-11. [Detailed Plan 2](plans/done/iteration-2-resident-verification/main-plan.md); [completion report](plans/done/iteration-2-resident-verification/iterations/iteration14-results.md). |
| [5. Check fast after a write](#plan-5-fast-incremental-checks) | A retained analysis session inside the daemon answers an agent's post-write hook for the written file in tens of milliseconds, exactly as a batch check would. | Plan 2. | Brief below; [Detailed Plan 5](plans/iteration-5-fast-incremental-checks/main-plan.md), complete on 2026-09-14 on branch `close/plan5-completion`, not merged to `main`; its [completion report](plans/iteration-5-fast-incremental-checks/iterations/iteration13-results.md) records the delivered scope, the gates and the remaining gaps. |
| [3. Understand a project](#plan-3-project-inspection) | An agent working in a module lists the foreign symbols available there with the specifier to write, searches them, and explains why one is or is not available. | Plan 2; Plan 5 for the join iteration only. | Brief below; [Detailed Plan 3](plans/iteration-3-project-inspection/main-plan.md), a draft awaiting its iteration 1 contract review. |
| [4. Use Ramify through MCP](#plan-4-mcp-access) | A host-launched stdio adapter exposes the daemon's checks and inspection. | Plan 2's service and Plan 3's queries for this deliverable's full scope. | Brief below; detailed plan not yet written. |
| [7. Find modules affected by changes](#plan-7-affected-modules) | An on-demand reverse dependency query uses retained facts to select modules for testing through API, CLI and MCP. | Plan 5's retained session and contexts; Plan 4's stdio provider for MCP. | [Detailed Plan 7](plans/iteration-7-affected-modules/main-plan.md), draft awaiting contract review. |
| [6. Explore visually](#plan-6-project-explorer) | A standalone live explorer through a separate tRPC web process. | Plans 2–3; optional integrations may consume Plan 4. | Brief below; detailed plan not yet written. |

The table order is the proposed implementation order; Plan 5 keeps the
number the withdrawn change-previews deliverable released. Dependency requirements
are narrower: Plans 3 and 5 are concurrent, the explorer can be delivered
without MCP, and a
check-only MCP adapter could be delivered after Plan 2. The planned Plan 4
also exposes inspection, so its full gate includes Plan 3. Keep any rescheduling
explicit rather than silently deleting capabilities from a plan.

`docs/plans/iteration-3-project-inspection/` and
`docs/plans/iteration-5-fast-incremental-checks/` hold the two draft plans,
each with one `main-plan.md`, its review package and an iterations manifest;
the completed plans are under `docs/plans/done/`. The remaining reserved names
are `iteration-4-mcp-access` and `iteration-6-project-explorer`; they are not
existing artifacts. Replace a brief's status with a real link when its plan is
written; do not create empty plans or broken links in advance.

Future identity, freshness and query requirements inform the first
engine contract review. Their complete protocols are reviewed with the relevant
plan. Presentation migration accompanies its changed model dependencies;
existing diagrams do not wait for the explorer.

MCP delivery does not depend on visualization. Streamable HTTP is
optional and requires its own session/lifecycle plan; it is not required by
Plan 4 or Plan 6.

Apply the additional architecture cases as follows. A case spanning several
capabilities is completed only when all its scheduled parts have evidence:

| Case family | Plans 1–2 | Later plans |
| --- | --- | --- |
| [PC01–PC10](architecture/processes-and-clients.md#acceptance-evidence) | 1: batch/help startup and applicable PC01 checks. 2: PC01–PC04/PC09, daemon parts of PC06, local-service PC07 and CLI/direct-client PC10. | 3: query-client equivalence; 4: PC08 and MCP portions of PC06–PC07/PC10; 6: PC05 and web portions including PC10. Optional HTTP MCP cases apply only when implemented. |
| [ML01–ML08](architecture/memory-lifecycle.md#measurement-and-acceptance) | 1: batch peak memory, result retention and disposal. 2: resident entry footprint, context/history/work bounds, repeated edits and local slow consumers. | 3: bounded inspection/enrichment; 4: ML08 stdio portions; 6: web/browser footprint, serialization and ML05 open-close cycles. |
| [QT01–QT08](architecture/quick-testing.spec.md#complementary-verification) | 1: batch QT01/QT03 and actual CLI process cases. 2: IPC QT04, daemon QT05 and relevant resource QT07. | 3: real query flows; 4: QT08; 6: QT02/QT06, HTTP QT04, web QT05 and remaining resource QT07. |

Browser-promise verification is a separate capability. Plan and implement its
algorithm explicitly before claiming it ran; the availability checker continues
to match declared promises according to the definitive rules.

## Plan 1: Batch project verification

**Detailed artifact:** [Plan 1: Verify a real Ramify project](plans/done/iteration-1-project-verifier/main-plan.md).
Its iteration sequence and I1-01–I1-30 instance matrix are the completion
authority for this deliverable. Do not duplicate or replace that matrix here.

**Delivered scope.** The package exposes the disposable analysis session,
inventory, model, CLI, presentation and layout entries. All 308 matrix instances
passed the unfiltered gate on `main` on 2026-09-10, including toolkit and
relocation evidence, and the measured batch costs meet the reviewed budgets;
the completion report linked above records the artifacts.
Daemon, watching, incremental invalidation, Ramify MCP and browser verification
remain unavailable. See the [batch usage guide](development/batch-verification.md).

**Working outcome.** `ramify check`, run inside the project or given
`--root`, checks real descriptions,
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

**Detailed plan:** [Plan 2: Keep verification current](plans/done/iteration-2-resident-verification/main-plan.md),
complete and merged on 2026-09-11; its [completion report](plans/done/iteration-2-resident-verification/iterations/iteration14-results.md) records the evidence. **Prerequisite:** met on 2026-09-10; Plan 1's
batch engine, source scope, self-check and strict reference gate are complete
on `main`.

**Inputs inherited from Plan 1.** Two analysis limits stay open in the batch
engine that Plan 2 reuses, recorded on 2026-09-10 after the end-of-workflow
fixes. A `require` target that is a module file is recorded with coverage
notes but is not resolved, so no testing-origin denial fires for it; bare
`require` shares that limit, and resolving it is a resolution design decision.
`declare global` blocks inside module files pass silently, although the model
treats them as unverifiable, so they should receive the same shared-global
coverage note that script source receives. Decide both in the detailed plan or
carry them as explicit coverage limits.

**Working outcome.** A user runs `ramify check` against an explicitly selected
project, edits source or a description, and obtains a result for verified
current inputs. `ramify watch` streams bounded updates. Daemon status and stop
commands work; explicit batch checking continues to run independently.

### Ownership and required implementation

Add root child `daemon [dispatch]` and its `contexts []` child, completing
the eleven-owner batch/resident tree. Daemon owns process startup/discovery,
local transport, the shared validated service implementation/in-process binding
and watcher adapters. Root exposes its dispatch-facing service interface to its
descendants, and daemon implements it; the IPC host calls the same
implementation as quick tests. Root
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

1. Local transport on the supported platforms, Linux and macOS: endpoint
   discovery, daemon grouping, ownership of endpoints, concurrent startup
   coordination and stale cleanup.
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
   after exhausted recovery. Never substitute current state for an operation
   that requires an unavailable historical input.
8. User-facing command arguments, output and exits, preserving Plan 1's
   distinction between denial, incomplete execution and bounded coverage.

New inspection commands, MCP and HTTP are excluded. Plan 2's stage reuse is
the starting point for the pending fast-check deliverable, which Plan 2 does
not complete. Keep future query fields extensible and advertise the exact
current capabilities; no unimplemented mode can pass a request.

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
  [measurement recipe](architecture/memory-lifecycle.md#repeatable-setup-measurements)
  and separately instrumented resident workloads.

Hand off a documented client API, lifecycle/error tables, codecs, revision and
freshness guarantees, per-platform transport details, resource budgets,
event/direct-test adapters and runnable concurrency/recovery fixtures.
Plans 3–6 reuse them.

## Plan 3: Project inspection

**Detailed plan:** [Plan 3: Project inspection](plans/iteration-3-project-inspection/main-plan.md),
a draft awaiting its iteration 1 contract review. **Prerequisites:** met on
2026-09-11; Plan 2's daemon, contexts, revisions, client and CLI commands are
merged. Plan 5 is not a prerequisite of this plan's first eight iterations:
they are written to be implemented in parallel with it. Only the ninth, the
join, requires Plan 5's retained session and compact history, and it extends
Plan 5's session contract with one detail operation.

**Revision, 2026-09-11:** this brief was rewritten around the agent's use
case. The earlier version described the backend of the explorer, whose
central query was whether a named consumer may import a named original. That
is the wrong first question. The observed-usage aggregates, counting units,
drill-down identifiers, cursors and ranking it listed have moved to Plan 6.

**Working outcome.** An agent implementing a feature works inside one
module's `src/`. It reads that module's internals with ordinary tools and
treats every other module as a library. Its most frequent question is which
foreign symbols it may already import from where it stands. From that
directory, `ramify available` lists every original available in that source
area, grouped by the module that owns it with that module's purpose, each row
carrying the export name, value or type-only availability, tags and the
import specifier to write. `ramify available --search` finds a capability by
name, signature or documentation among those symbols. `ramify inspect`
answers where the agent is and what its own module exposes, and with
`--usage` who imports its exports. `ramify explain <name>` answers why a
named symbol is or is not available, proposing the exposure declarations that
would make an invisible one visible. Human and JSON clients receive the same
revision-qualified answers, and every listed specifier passes `ramify check`
when written into the area it was listed for.

### Ownership and required implementation

No owner is added. `model` gains the enumeration of the originals available
to a source area, alongside today's per-original `explainVisibility` and
per-access `explainImport`, with the same rules and one shared tag-rule
helper. `typescript` gains body-free signature, declaration and documentation
extraction for named originals from the live compiler. `analysis` gains the
consumer-area rule, the inspection queries over an analysis snapshot, and the
requested `symbol-details` capability whose stage runs while the compiler is
alive. Root owns the `inspect` service operation, the batch inspection
operation and the vocabulary relays; `daemon` validates and binds the
operation over a revision's report; `cli` adds `available`, `inspect` and
`explain` with the `ramify.inspect/1` document.

The consumer of a query is a place, not a module: the working directory or a
named path, resolved to one owner and one source area, ordinary by default
and testing beneath `src/tests/`. A module name alone is never a consumer,
because a module's ordinary and testing areas receive different answers.

Every listed symbol carries the specifier to write: the relative path from
the consumer's directory to the original's defining file, with the source
extension replaced by `.js`. That path passes the source-origin check
whenever the original is available, because the defining file is the
original's own area. Proposed exposure edits are labeled proposals, never
existing permissions.

### Decisions resolved in the detailed plan

The plan's [resolved decisions](plans/iteration-3-project-inspection/main-plan.md#resolved-decisions)
fix the consumer rule, the spelling rule, the export name shown per row, the
two detail tiers and where each comes from, queries answered over the
revision's report inside the daemon, proposals limited to exposure hops,
owned rather than subtree usage, the three commands and one document, and the
parallel schedule with Plan 5. Its review points RP-2 to RP-6 name the
alternatives for iteration 1.

### Required evidence and next-plan inputs

Use DA12, the query portions of DA13–DA15, H01–H04, PC03, ML06 and QT01,
QT03, QT04; retain the applicable quick-service and actual IPC and process
tests.

Demonstrate that the listing agrees with enforcement for every decided access
of the reference project and the toolkit; that a browser consumer and its
tests receive different answers for the same visible original; that a
testing-classified original is blocked for ordinary source; that wildcard
growth changes the listing without a declaration edit; that every listed
specifier written into its consumer area passes a check and a type-only
symbol imported as a value is denied; that a missing README is an explicit
state and never borrows another owner's prose; that details are unavailable
rather than empty when they were not extracted; and that resident and batch
answers agree while each names its revision.

Hand off the versioned query schemas, the `ramify.inspect/1` document, the
consumer and spelling rules, the availability and detail contracts, example
responses for every result state, the detail limits and the consumer-aware
fixtures. These are the backend contracts for MCP and the explorer. Plan 6
adds the observed-usage aggregates, counting units, drill-down identifiers
and pagination its graph needs; full H04 host lifecycle and write policy is
not completed by this plan.

## Plan 4: MCP access

**Detailed plan:** not yet written. **Prerequisites:** Plan 2's local service;
Plan 3's inspection contracts for this plan's full tool/resource set.

**Working outcome.** An editor or agent host launches `ramify mcp` once,
initializes a stdio session and performs checks, module inspection and
explanations through the existing daemon. Calls from multiple hosts reuse
compatible analysis while keeping each host's context selections separate.
The availability listing of [Plan 3](#plan-3-project-inspection) is the
primary tool: an agent host that cannot run a shell command asks it the same
question `ramify available` answers, and its consumer parameter is a path,
never a module name alone.

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

Follow the [MCP placement and lifetime](architecture/processes-and-clients.md#mcp-server)
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

## Plan 5: Fast incremental checks

**Detailed plan:** [Plan 5: Fast incremental checks](plans/iteration-5-fast-incremental-checks/main-plan.md),
complete on 2026-09-14 on branch `close/plan5-completion`, not merged to `main`;
the [completion report](plans/iteration-5-fast-incremental-checks/iterations/iteration13-results.md)
records the delivered scope, the gates and the remaining gaps.
**Prerequisite:** met on
2026-09-11; Plan 2's daemon, contexts, watcher, synchronized checks, client,
CLI commands, harness and measurement recipe are merged. The change-previews
deliverable that carried this number was withdrawn on 2026-09-11, and
overlays are removed from the architecture: Ramify checks saved files only.

**Closure, 2026-09-14.** Dan's decisions of that date close the plan: it is
complete on `close/plan5-completion` and merging to `main` is not part of the
closure; S500 hook latency and the S500 resident workload are waived and S1000
is smoke-tested only; the remaining I5-13 workloads are recorded as not
executed; an `unknown` input label no longer decides a revision path; and a
resident report carries its own invocation's root selection while `inputId`
stays the context's identity. Three successor plans changed the delivered
scope: [contract remediation](plans/iteration-5-contract-remediation/main-plan.md),
[hook optimization](plans/iteration-5-hook-optimization/main-plan.md) and
[structural edits](plans/iteration-5-structural-edits/main-plan.md); the
[repeated deletions](plans/iteration-5-repeated-deletions/main-plan.md) plan was
withdrawn without starting. Follow-ups the closure hands on: a CI gate comparing
a live session's `inputId` with a batch run, so a retained compiler holding stale
options is detected; re-measuring the configuration hook reply, whose recorded
figures predate the not-checked answer of 2026-09-14; narrowing the full
resolution replay a configuration with `references` still keeps; the
refinement `I5-12:burst-coalesced` records, where a hook racing a write burst
cancels the watcher's debounce and the burst publishes two revisions; and one
open defect, `I2-29:entry-footprints`, whose help entry is faster than its
sampler.

**After closure, 2026-09-14.** `I2-29:many-contexts`, which the completion report
recorded as an open defect, is diagnosed and fixed on `close/plan5-completion`:
an idle audit stayed armed after a demotion, failed against the released
compiler and re-armed itself, which spun the demoted context and starved the
next context's check. The workload now passes, and the
[addendum](plans/iteration-5-fast-incremental-checks/iterations/iteration13-results.md#addendum-2026-09-14-the-many-contexts-stall)
records the diagnosis, the fix, its tests and the measured run.

**Inputs inherited from Plan 2.** Its own measurement archive records the
compiler-state deferral trigger as fired: source-edit medians of 6.7 s on
the reference and 10.8 s on S100 through the daemon. The
[retained-session proposal](analysis/fast-incremental-checks-retained-session.md),
the [hook analysis](analysis/fast-incremental-checks.md) and the
[spike results](../scripts/spikes/fast-check/RESULTS.md) on branch
`spike/fast-check-retained-session` record the design and its measurements:
a retained session equalled a fresh batch analysis in 56 of 56 audits and
answered a body edit in 59 ms on the reference project, of which 52 ms was
the whole-project catalog.

**Working outcome.** An agent host runs `ramify check --changed <file>`
after every file the agent writes. The daemon keeps one retained analysis
session per context, updates it live from the watcher, and answers the hook
from the revision that covers the written file's content identity, marking
the findings that are new since the previous revision. The answer equals a
fresh batch check of the same inputs; a check that could not run says so
with exit 2 and never runs a batch analysis. A named configuration file is
answered at once as not checked while the daemon verifies it behind the reply;
the complete check, `ramify check`, gives such an edit its verdict, as the
[CLI invocation contract](architecture/cli-invocation.spec.md#hook-and-complete-checks)
states.

### Ownership and required implementation

No owner is added. `typescript` gains per-file export descriptions with
recorded dependencies, a hoisted access interpreter, a lazy spelling-filtered
namespace index and a retained compiler adapter with one live snapshot whose
reads are observed. `project` gains the observer with local inventory
updates and the sweep. `analysis` gains the retained session in a worker
thread, its four update paths, position refresh, finding deltas and the
audit, and loses Plan 2's stage-product reuse. `contexts` drives sessions
through a revised driver port, keeps compact history and answers covered
requests without analysis. Root and `cli` add the compact reply, the
`ramify.check/1` document and `check --changed`; an example host adapter
lives under `examples/hooks/`.

### Decisions resolved in the detailed plan

The plan's [resolved decisions](plans/iteration-5-fast-incremental-checks/main-plan.md#resolved-decisions)
fix the position in the sequence, the worker-thread host, per-file
descriptions from the first session iteration, observed compiler reads, live
updates with the covering rendezvous, the hook command and document, the
Plan 2 supersession and the budgets. Its review points RP-2 to RP-7 name the
alternatives for iteration 1.

### Required evidence and next-plan inputs

Use DA11, the hook-latency portions of DA17, the invalidation portions of
DA06–DA09, DA10 for session-batch equality, DA14 and DA15 for explicit
outcomes, PC03 and PC10 for the CLI path, and ML01–ML04 for the session and
compiler memory. Include:

- Session revisions equal batch reports at every step of the reference and
  synthetic edit sequences, including input identity, and the session's own
  audit passes after every step.
- The unchanged-surface path decides nothing; the source path checks the
  changed files and their importers only; description edits stay inside the
  subtree; the broad path says so.
- Hooks are answered from published revisions when the watcher delivered,
  join exactly one update otherwise, and receive explicit cold, deadline,
  unobserved, superseded and configuration-changed outcomes.
- Hook latency budgets on the reference and S100 with raw results; S500 and
  S1000 recorded; memory plateaus for the worker and the compiler server.
- Plan 1's and the amended Plan 2 gate pass on the same build.

Hand off the compact check reply and revision delta, the hook command and
host adapter contract, the session and revision vocabulary, the observed
input identity, the budgets and the supersession record. Plans 3, 4 and 6
reuse them.

The [structural edit latency plan](plans/iteration-5-structural-edits/main-plan.md)
follows the [hook optimization](plans/iteration-5-hook-optimization/main-plan.md)
and is complete; its decisions were taken on 2026-09-14. Its
[measurement results](plans/iteration-5-structural-edits/iterations/measurement-results.md)
put the S100 created and deleted file hooks at about 0.5 s against the 2 s
budget; a configuration hook answers not checked at once instead. Its
[closure](plans/iteration-5-structural-edits/iterations/closure.md) keeps two
follow-ups open: a CI gate comparing a session's input identity and report with
batch, and a real-process measurement of the configuration reply and its
background revision. Its companion
[repeated deletion plan](plans/iteration-5-repeated-deletions/main-plan.md) is
withdrawn without starting.

## Plan 6: Project explorer

**Detailed plan:** not yet written. **Prerequisites:** Plan 2's revisioned
service/notifications and Plan 3's inspection/evidence queries. MCP is an
optional integration, not a prerequisite for the core explorer.

**Revision, 2026-09-11:** this plan now owns the observed-usage aggregates
the earlier Plan 3 brief listed. Define observed file-target edges separately
from original-binding use and exposure paths, and give each aggregate its
unit, source-area filter and owned versus subtree scope. Count owned files
once; retain denied accesses in observed usage and unused available exports
in contract inspection. Exposure paths explain permission; they are not
additional observed imports. Pagination, cursors, stable drill-down
identifiers and ranking belong here too: a page or cursor cannot drift to a
newer snapshot silently. Plan 3 hands over the query vocabulary, the consumer
and spelling rules and the detail contract these build on.

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

Use the [source reuse analysis](analysis/project-explorer-reuse.md)
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
   Specify the stable drill-down identifiers, pagination and cursors, and the
   revision a page is bound to. No graph-library object enters a service
   contract.
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

Streamable HTTP MCP hosting requires explicit additional scope if desired. If
it is included, active MCP leases participate in web lifetime; browser closure
alone cannot stop their server.

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


## Plan 7: Affected modules

**Detailed artifact:** [Plan 7](plans/iteration-7-affected-modules/main-plan.md),
a draft with its [live-data assessment](plans/iteration-7-affected-modules/data-assessment.md),
[contracts](plans/iteration-7-affected-modules/contracts.md) and
[acceptance matrix](plans/iteration-7-affected-modules/acceptance.md).

**Working outcome.** Given changed module IDs, traverse the reverse module
dependency graph and return every transitive dependent, together with the
changed modules for test selection. Use Plan 5's live in-memory facts and
revision/freshness guarantees. Expose one query through the retained-session
API, daemon client, CLI and MCP.

**Prerequisites and ownership.** Plan 5 supplies inventory, per-file accesses,
original/forwarding/resource ownership, description dependencies, coverage,
worker hosting and atomic revisions. Analysis builds a temporary module graph
on demand from those facts and performs the traversal; contexts orders
revision-bound requests; daemon/root, CLI and MCP expose it through their existing boundaries.
MCP requires Plan 4's stdio lifecycle provider. The core does not require
Plan 3's availability queries or Plan 6's explorer.

**Contract review.** Review exact module IDs, source/type/test edge inclusion,
owned declaration-shim dependencies, on-demand graph construction and disposal,
current-only queries, expected-content synchronization, coverage fallback and
numeric resource bounds. No module graph or contribution bookkeeping is retained
between queries, and ordinary checks/hooks perform no added graph work. Plan 5's
analysis invalidation edges and checked set are not themselves a test-impact
graph: stable exports can still accompany
behavior changes that break callers. No importability rule changes.

**Completion and handoff.** Execute all A7 cases, including live updates,
worker/IPC/CLI/MCP behavior, partial and unavailable outcomes, query/update
budgets and Plan 5 regression evidence. Hand off the graph semantics,
API/wire/tool schemas, source scope, coverage limits and measured costs.
Git diff discovery, historical/deleted-module impact, test execution and
visualization remain outside this deliverable.

## Information to preserve between plans

Every completion report must leave enough concrete information to author its
successors. Store these records beside the detailed plan or link to the owning
source/architecture document; do not depend on conversation history.

| Producer | Required handoff | Consumers |
| --- | --- | --- |
| Plan 1 | Implemented package/session/report contracts; canonical source/export facts and exposure evidence; reference instance map; scope/configuration/compiler decisions; self-check and batch resource results. | All later plans. |
| Plan 2 | Context/generation/revision and freshness contracts; local codecs/client; event ordering and distinct idle-exit/crash/explicit-stop rules; restricted fallback policy; daemon-owned direct-service harness; measured limits and per-platform transport details. | Plans 3–6. |
| Plan 3 | Inspection query schemas and the `ramify.inspect/1` document; the consumer-area and import-spelling rules; the availability enumeration and its agreement with enforcement; symbol-detail contracts, limits and explicit unavailable states; owned-usage definitions; consumer-aware fixtures. | Plans 4–6. |
| Plan 4 | MCP tool/resource schemas and host launch setup; protocol/session lifecycle; actual and in-memory protocol clients; capability and error mapping. | Plan 7; optional later MCP hosting. |
| Plan 5 | The compact check reply and revision delta; the hook command and host adapter contract; the session and revision vocabulary; retained per-file targets, originals, forwarding paths, owned shim dependencies, inventory and coverage; the observed-input identity; hook latency budgets and hot/warm memory bounds; the Plan 2 supersession record. | Plans 3, 4, 6 and 7; agent hook hosts. |
| Plan 6 | Reusable view exports/props, web lifecycle and query-to-view contracts; extraction provenance; quick/HTTP/browser evidence and measured memory behavior. | Consuming applications and later visualization features. |
| Plan 7 | Live module graph semantics; affected query and test-selection contracts; revision/coverage outcomes; CLI/MCP schemas; on-demand construction, temporary memory and query resource evidence. | Test-runner integrations and later explorer features. |

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
8. Author one detailed `main-plan.md` and split its work into iterations,
   each comfortably implementable within a single 250k-token context: one
   owner or one capability, a bounded matrix slice, its own verification and
   exit criteria, and a self-contained iteration file naming what to read.
   Register them in the iterations manifest in dependency order; the plan's
   gate is its last iteration's exit. Work steps inside an iteration are not
   delivery plans.
9. Link the created artifact from this roadmap and mark it as a draft. Review
   its concrete architecture/contracts before implementation. Advance status
   to implemented only when its strict gate and completion report establish it.

A plan's detailed matrix may refine the scheduling map, but must explain any
changed scope and retain unresolved portions. Plan creation, passing metadata
validation or a clean build is not implementation completion.

## Work outside the baseline deliverables

The roadmap does not imply that every reference family, runtime construct or
separate policy is complete after Plan 6. Keep the following visible when
writing future plans; they do not block the current Plan 1 gate.

| Work | Existing decision / remaining question | When to plan it |
| --- | --- | --- |
| Registry configuration serialization | Generic resolved registries and custom tag kinds are required in Plan 1. User-facing serialization, default replacement and configuration loading remain unspecified. | When projects need to supply registry definitions through ordinary CLI/service configuration. Review its source input, identity and invalidation effects before adoption. |
| Project configuration and possible strict checking | Selected project files outside module source areas produce warnings by default. A future strict configuration might make those warnings fail a check; its syntax and exact scope are undecided and outside Plan 1. | When defining scope customization and warning control, review this option explicitly. It is separate from the reference harness's required conformance gate. |
| Additional source adapters | The bounded source profile stays explicit. Vite macros, Jiti, compiled-source mapping and other tool-specific interpretation require real target/selection evidence; unsupported access is not automatically external. | Select concrete remaining S/K instances when expanding checking coverage for an actual project. Do not add a second resolver/checker in a client. |
| Reference browser/tool compatibility | The reference application's K cases exercise its own runtime. They are distinct from tests of Ramify's explorer; existing Cucumber execution does not establish every browser/tool case. | Extend the independent reference harness when those fixtures are implemented; attach source assertions only when the corresponding adapter exists. |
| Browser-promise verification | Matching the declared browser tag is part of ordinary checking. Proving the promise is a separate verifier with its own capability, coverage and owner findings. | A separately scoped plan if verification is requested. Until then, requesting it returns unavailable. |
| MCP Streamable HTTP | Optional hosting of the same MCP module in the web process; no MCP-to-tRPC forwarding layer. | Only when HTTP hosting is needed; specify MCP sessions, cancellation/reconnect, local access policy and shared web lifetime. |
| Discussion and host/editor integrations | Injected UI integration points can be reused. Agent launching, write authority and host workflow lifecycle remain separate responsibilities. | Concrete consumer needs justify their own adapters and cases, including remaining H04 portions. |
| Advanced search, metrics and placement suggestions | Plan 3 delivers the availability listing and search over names, signatures and documentation. Ranking, complexity formulas, source-text search across modules and barrel spellings remain additional features, and a proposed exposure is never an existing permission. | After defining the user workflow, counting/scoring semantics, scope and output limits. |
| Persistent caches, worker pools and process recycling | No requirement to add them speculatively. They must preserve context generations, input identity and explicit unavailable/recovery results. | Only after measurements identify a problem and demonstrate a useful improvement. |
| Live module audits and selective verification | [Analysis proposal](analysis/live-module-audits.md): retain applicable test evidence per task, derive live module status, invalidate from source and shared inputs, and run required audits on request with Git provenance. | Possible follow-up to Plans 5 and 7; resolve task mapping, execution input consistency, persistence and reuse policy before assigning a delivery plan. |
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
Use the [memory measurement requirements](architecture/memory-lifecycle.md#measurement-and-acceptance)
for repeated-use plateaus, peak allocation, global budgets and reclamation.
Start setup comparisons with the [checked-in probe](../scripts/memory-probe.mjs),
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
