# Daemon and analysis architecture

**Date:** 2026-09-07. **Status:** The process/client split and memory/testing
requirements are decided in the [architecture overview](README.md). Detailed
engine contracts and the ownership tree below remain proposed for review.
This document does not establish implementation support or authorize coding.

Ramify runs a long-lived local backend that maintains the analyzed state of each
active project, updates that state as files change, and serves architectural
checks and queries from identified revisions. A reusable analysis engine supplies
the same behavior in the daemon and in batch execution. CLI, editor, agent and
visualization clients consume that shared analysis.

## Scope and authority

This document owns the proposed module boundaries, exposure routes, engine
pipeline, context/revision semantics and semantic service operations.
[Processes and clients](processes-and-clients.md) defines executable placement,
CLI behavior and the separate tRPC web process;
[memory lifecycle](memory-lifecycle.md) defines retention and resource policy;
[quick testing](quick-testing.md) defines test execution boundaries.
The [tooling plan](../plans/tooling-architecture/README.md) owns review steps,
migration and delivery order. The
[reference project](../plans/reference-project/README.md) is an independent
application used to exercise the implementation.

[Preparing Ramify for the project explorer](../analysis/project-explorer-reuse.md)
examines reuse for a later visualization phase. Its early review concerns are
retained usage/contract evidence, neutral query results and revision-consistent
details. Browser transport and project-view extraction remain later work; the
analysis does not add owners to the initial tree below.

The following specifications govern every mode of execution:

- [Importability principles](../model/cross-module-importability.principles.md)
  and [glossary](../model/glossary.md): ownership, exposure, tags and source areas.
- [Module descriptions](../model/module-description.principles.md): filesystem
  layout, version 1 declarations, exact selections and wildcard expansion.
- [TypeScript interpretation](../model/typescript-source-interpretation.principles.md):
  original bindings, resources, supported accesses and coverage reporting.

The daemon adds no import permission, consumer dependency declaration, task
authorization or write-access rule. Given the same inputs, registry and supported
analysis scope, every client receives the same architectural decisions.

### Reasoning inherited from earlier analyses

The historical analyses *Module Intelligence Daemon for Nested TypeScript
Modules* and *DSL-Driven Nested Module Daemon*, both dated 2026-08-28, remain at
their original locations. This document carries their useful runtime decisions
forward and is self-contained; those documents are not normative dependencies.
They belong to the enclosing cucumber-viz repository and are not included in a
standalone Ramify checkout; all requirements carried forward are restated here.

| Earlier decision | Treatment here |
| --- | --- |
| Reusable engine with a long-lived interactive host | Retained, including batch execution through the same rules. |
| Isolated worktrees, immutable revisions, exact-save synchronization and shared queries | Retained as architectural requirements of the proposed host. |
| Detailed TypeScript descriptions obtained lazily | Retained for enrichment such as rendered signatures and expanded documentation. |
| An original proposal for a warm TypeScript program, followed by a proposal placing all semantic work outside enforcement | Reconciled: retain source-resolution state needed by the current rules inside the analysis engine. Expensive descriptive enrichment remains optional and lazy. |
| Generated surfaces, special canonical imports, declared dependency permissions and private-ancestor exceptions | Replaced by the current ownership tree, explicit symbol exposure and ordinary TypeScript resolution. No facade generation is required. |
| Treating unsupported access as a violation, or making browser-closure certification part of every import decision | Replaced by the definitive coverage policy and separate browser-promise verification. |

The current rules require more than syntactic import extraction. Unmarked
interfaces, original bindings through aliases, resource exports and interface-file
wildcards need semantic resolution. A source resolver or export catalog required
for a check cannot be deferred to optional enrichment. Ramify uses TypeScript's
existing facilities behind an adapter; it does not implement a new type system.

## Runtime structure

CLI and external Node programs using the lightweight `connectDaemon` client
connect to the daemon's local service. Editors and agents using MCP reach it
through the separate stdio adapter. The future
browser connects through an on-demand web process that uses that same service.
See the [process topology](processes-and-clients.md#process-topology).
Inside the daemon, the analysis flow is:

```text
                         local service endpoint
                                  |
                    isolated project/worktree contexts
                     watches -> ordered change batches
                                  |
                      reusable analysis sessions
                                  |
                    immutable published result revisions

Batch CLI / CI -> the same analysis engine -> equivalent structured results
```

An interactive context performs initial analysis and then retains the inputs,
indexes and compiler state needed to update it. File watching starts background
updates before clients ask questions. Frequent queries should usually read an
already analyzed revision. Required freshness is explicit; being long-lived does
not make every answer automatically current.

Batch execution creates a fresh session, analyzes the selected inputs and disposes
it. It shares the discovery, linking, interpretation, evaluation and reporting
implementation with incremental execution. Starting with batch implementation is
a delivery step toward this architecture, not a decision to postpone the daemon
indefinitely.

## Ramify's ownership tree

These are eleven proposed owners for the batch and resident iterations within
one toolkit package. The batch iteration implements nine; `daemon` and its
`contexts` child arrive in the resident iteration. Every implemented owner
has `module.ramify`, a purpose `README.md` and its own `src/`, with optional
`src/interfaces/` and `src/tests/`. Each edge below corresponds to placement under
the parent's `subs/`. Brackets show module-header tags, not additional syntax.
The root's declared name is `ramify`, a reserved word, so its header must quote
the name as `module "ramify" tagged [dispatch]`.

```text
ramify [dispatch]                       executable assembly and client service contract
├── analysis []                         reusable sessions, analysis and queries
│   ├── model [browser]                 identities, registry, exposure and decisions
│   ├── descriptions [browser]          parsing and description linking
│   ├── project []                      filesystem inventory, source reads and metadata
│   └── typescript []                   compiler integration and source-derived facts
├── daemon [dispatch]                   local protocol, process and watcher adapters
│   └── contexts []                     context isolation, ordering and publication
├── presentation [ui, browser]          reusable diagrams and interaction
│   └── layout [browser]                framework-independent geometry
└── cli [dispatch]                      commands, output and client behavior
```

Later root children include `mcp [dispatch]`, containing MCP definitions and the
stdio adapter over the daemon client; `service-api [dispatch]`, containing the
separate Express/tRPC web host and event adapter; `explorer [ui, browser, dispatch]`,
containing the connected browser application; and
`integration-tests [testing, ui, dispatch]`, containing tests that combine UI
and transport contracts. Reusable project views belong to a later
`presentation/subs/project-view [ui, browser]` child. Additional integration
adapters can follow the same service boundary. These owners need not exist as
empty modules before their capabilities are implemented. The daemon's local
protocol remains part of the initial architecture. MCP delivery can precede
visualization; optional MCP HTTP hosting mounts the same adapter module in the
web process. Its SDK and protocol state stay outside the resident daemon.

### Responsibilities and public contracts

API names below are proposed. Complete signatures and exposure manifests belong
to the contract review before code moves.

| Owner | Responsibility | Principal upward contract |
| --- | --- | --- |
| `ramify` | Assemble CLI, daemon and later MCP/web serving entries; supply the CLI with a lightweight service client and lazily selected batch delivery. Own the shared client-facing service vocabulary. | No effective parent exposure; package entry points target the appropriate owners. |
| `analysis` | Execute the analysis pipeline, maintain a reusable analysis session, select affected work and produce snapshots, reports and semantic queries. | `createAnalysisSession`, `analyzeProject`, `inspectModule`, `explainAccess`, and owned analysis vocabulary. |
| `model` | Canonical model identities, registry and profile rules, mandatory symbol tags, exposure reach, availability and testing-origin decisions. | `buildModel`, `explainImport`, `explainVisibility`, model vocabulary and validation operations. |
| `descriptions` | Parse version 1 with source locations and comments; resolve exact selections, exposed names and wildcard contracts; produce grounded declarations and diagnostics. | `parseDescription`, `linkDescriptions`, and their input/result vocabulary. |
| `project` | Explicit-root inventory, containment/symlink and scope validation, coherent input reads and README purpose extraction. | `readProject`, project input/inventory and metadata contracts. |
| `typescript` | Retain compiler integration state; resolve exports, originals and resources; interpret source accesses; obtain optional symbol details. | `createSourceAnalysis` and plain-data catalog, access and enrichment contracts. |
| `daemon` | Own the shared validated service implementation and its in-process binding, open/close the local endpoint, adapt filesystem events, handle startup/shutdown and connect clients. IPC delegates to that service; context work delegates to its child. | `startDaemon`, `connectDaemon`, the in-process service factory and dispatch-classified options/results; selected neutral context vocabulary is relayed unchanged. |
| `contexts` | Select isolated contexts, serialize their updates, synchronize requested inputs, publish revisions, retain historical results and manage idle eviction. | `createContextManager`, context/revision/status vocabulary and its owned `AnalysisDriver` port. |
| `presentation` | Render model/report data, interactions and teaching examples. | Selected components explicitly tagged `[ui, browser]` and owned props. |
| `layout` | Calculate diagram geometry from supplied neutral data. | Selected functions explicitly tagged `[browser]` and owned layout vocabulary. |
| `cli` | Parse commands, connect directly to the daemon, request freshness/check scope, render results and map execution status to exit behavior. Dispatch batch, MCP serving and explorer launch through supplied entry points. | `runCli` and its dispatch-classified vocabulary. |

`analysis` owns computational invalidation; `contexts` owns scheduling and
publication; `daemon` owns process and transport mechanics. There is one authority
for each. The watcher sends facts about possible changes through an injected
input adapter. Reconciliation obtains source bytes through the same project input
view used by the compiler; the watcher does not maintain a competing source cache.

`contexts` defines the `AnalysisDriver` operations it needs. Root assembly supplies
an implementation backed by `analysis` sessions, through the daemon's construction
options. Tests supply a fake driver. The contexts module does not import the root's
dispatch contract or the engine's implementation functions. Calling a supplied
port does not add a source-level exposure rule.

The model owns `ImportDecision`; analysis owns `AnalysisSnapshot` and
`AnalysisReport`; contexts owns `ContextRevision`; project owns module metadata;
layout owns diagram geometry. Keep types with the owner that defines their meaning.
Do not introduce a general shared-contracts owner.

### Exposure routes

Analysis composes its four children through their upward contracts. It exposes
selected model operations and vocabulary to descendants where needed. Parser,
filesystem and TypeScript implementation functions otherwise remain visible only
to analysis. Analysis passes data between those children through their public
input contracts.

Root receives the analysis and daemon contracts. It relays selected analysis
types downward for clients and contexts, and portable model queries for diagrams.
The `AnalysisDriver` port travels from contexts to daemon and then to root;
assembly does not import a private grandchild binding. Transport contracts owned
by root carry `dispatch`, so untagged analysis and contexts source cannot import
them even when they are visible from above.
Root exposes the service interface downward to `daemon [dispatch]`, which
imports and implements it for both IPC delivery and the in-process binding.
Root assembly supplies dependencies; the shared validation and routing stay
inside daemon, as specified by the [service boundary](processes-and-clients.md#shared-service-boundary).

Presentation receives its layout child's upward API. A future explorer receives
presentation components through root's declaration-only relay; root's source need
not import a UI symbol. A downward exposure reaches all descendants, including
other compatible UI owners. Named relays make the chosen audience explicit;
there is no selected-branch permission.

For example, these fragments describe the planned analysis-driver route. Paths
are relative to the toolkit root; source files and full manifests are not yet
implemented.

At `subs/daemon/subs/contexts/module.ramify`:

```ramify
ramify 1
module contexts

expose-src createContextManager from "context-manager.ts" to parent
expose-src * from "interfaces/contexts.ts" to parent
```

At `subs/daemon/module.ramify`:

```ramify
ramify 1
module daemon tagged [dispatch]

expose-src startDaemon from "start-daemon.ts" to parent
expose-src connectDaemon from "connect-daemon.ts" to parent
expose-src * from "interfaces/daemon.ts" to parent
expose-sub AnalysisDriver, ContextRevision, ContextStatus from contexts to parent
```

At root, assuming analysis's upward contract includes these owned types:

```ramify
ramify 1
module "ramify" tagged [dispatch]

expose-src * from "interfaces/service.ts" to descendants
expose-sub AnalysisInputs, SourceChange, AnalysisSnapshot, AnalysisReport from analysis to descendants
```

The context port remains untagged when forwarded by daemon. Root's service
vocabulary acquires `dispatch`. Foreign originals cannot be placed in an owned
interface wildcard: every selected original must belong to that owner, otherwise
the whole declaration is invalid. Importing foreign types to describe an owned
interface is allowed when those types are themselves importable. Types that a
foreign consumer needs to import explicitly require their own exposure routes;
there is no automatic signature-type exposure.

Browser module headers do not assign browser promises to exports. Portable model,
description and layout values consumed by browser source need explicit `[browser]`
assignments. UI values need `[ui, browser]`. Type-only vocabulary does not need a
browser promise, but still retains its defining area's required-importer tags.

Package exports are separate runtime entry points for the portable model, Node
analysis, presentation and CLI. They confer no internal Ramify visibility. A single
source barrel combining Node, UI and dispatch exports is unsuitable for the proposed
classifications; the existing combined entry point needs migration.
The [entry-point dependency requirements](processes-and-clients.md#modules-and-executable-entry-points)
also keep `connectDaemon` usable without importing daemon startup or compiler
assembly. A legal exposure route alone does not establish low startup memory.

## Engine inputs and analysis pipeline

An analysis session receives one explicit application root, application source
set, discovery exclusions, TypeScript project configuration, supported source
adapters and one immutable resolved tag registry. Independent examples and other
applications use separate selected roots. Compiler-loaded dependencies do not
automatically enter the application ownership tree.

The initial pass, and any conservative full recomputation, follows this order:

1. **Inventory and parse.** Read project inputs and description text. Detect
   misplaced or invalid boundaries rather than attributing their files to a
   parent. Validate the registry, physical layout and module names; establish
   ownership and the fixed source-area profiles.
2. **Resolve source facts.** Obtain effective export descriptions and original
   identities, including unexposed exports and resource bindings. This does not
   require the corresponding imports to be allowed.
3. **Link declarations.** Resolve exact owned references, complete interface-file
   wildcards and child-exposed names from leaves upward. Gather tag assignments
   before defaults, validate them through the model, and preserve ineffective
   named exposure chains. Produce a valid model only when its prerequisites pass.
4. **Interpret accesses.** Produce source occurrences, selected originals,
   value/type requests, target resources, forwarding-origin evidence and runtime
   loads. Preserve written syntax separately from availability classification.
5. **Evaluate and report.** Apply model decisions, retain coverage and scope facts,
   and assemble the candidate analysis snapshot. Query and reporting functions
   consume that same result.

This ordering matters: interface-file wildcards depend on actual exports, and
actual export discovery must not depend on a completed exposure model. An
incomplete wildcard catalog cannot yield a valid partial expansion. Source access
with insufficient resolution instead follows the source specification's
unverifiable outcome, unless an established error such as a missing export applies.

TypeScript objects remain private to `typescript`. The model, contexts, clients
and public snapshots use plain data and opaque identifiers, not `ts.Symbol`,
compiler sessions, filesystem handles or live protocol objects.

The proposed source adapter retains the TypeScript program/resolution state needed
for repeated checks. The exact compiler API and cache representation require a
focused contract/performance review. Optional signature rendering may use that
session or another adapter; a separate `tsserver` process is not a requirement.
Loss of optional descriptions can degrade enrichment alone. Loss of required
resolution capability cannot masquerade as a completed check.

## Context identity and retained state

A context identifies a selected application root in a particular worktree and
analysis setup. Canonical roots, explicit scope/configuration selections and any
overlay identity distinguish contexts. Branch names and shared Git directories
are insufficient. A request always names its context; there is no fallback to
another root's analysis.

Identical relative paths in two worktrees may have different bytes, owners,
registries or import decisions. Their mutable inputs, compiler sessions and
indexes remain isolated. A new caller requesting a different analysis setup
must not silently reconfigure an existing caller's context. An explicit input
configuration change within a context publishes a new revision with the new
fingerprints; the context API must detect conflicting client updates.

Each active context retains:

- The captured file versions/content identities, descriptions, configuration,
  source scope and exclusions used for analysis.
- Ownership, source areas, the resolved registry, original bindings and their
  tags, effective export catalogs, expanded exposure contracts and provenance.
- Supported access occurrences, their target/original evidence, reverse indexes
  needed for invalidation, and findings with coverage and execution status.
- Current publication, pending updates, last valid historical model when useful,
  and bounded revision-specific query/enrichment caches.

Retention follows the [memory lifecycle](memory-lifecycle.md#state-ownership-and-bounds):
per-context and global limits, bounded revision leases, optional-cache eviction
and inactive-session disposal. Historical inspection must not pin one full
compiler program per revision.

An original identifier is specific to its binding, not just `(owner, name)`.
Two files in one owner can define distinct same-named bindings. Aliases preserve
identity. Two resources described by the same shim remain distinct originals.
Identifiers are stable within a snapshot; arbitrary moves and renames do not
carry an implicit cross-revision identity guarantee.

### Revisions and atomic publication

Every result identifies its context, context generation and monotonically
increasing revision, plus the input fingerprints used by that revision:
declarations, source/configuration, registry, tool/adapter versions and overlays
where applicable. A restart or eviction creates a new generation so an old token
cannot accidentally identify a new result.

There is one ordered update stream per context. Analysis constructs a candidate
off the published view, computes the required results and atomically publishes
the outcome. Readers observe a complete published revision; no result combines
new ownership with old tags or stale access findings. Immutable logical snapshots
may share unchanged data structures.

Lazy enrichment also names its input revision. If a compiler session has advanced,
it must use retained evidence for the requested revision or report that enrichment
as unavailable/superseded. It cannot query the current program and label the answer
with an older revision. Cache publication checks the context generation and input
fingerprints, so a late computation cannot contaminate a later view.

Publication can report invalid inputs or unavailable capabilities without
publishing a valid model. Keep these dimensions separate:

| Dimension | Meaning |
| --- | --- |
| Synchronization | Initializing/reconciling, synchronized with the declared input view, or unable to establish requested freshness. |
| Model validity | Valid, invalid with diagnostics, or not established. |
| Check execution | Required stages completed, failed to execute, absent, cancelled or superseded. |
| Architectural findings | Known violations/errors or no known violations in the executed scope. |
| Coverage | Complete for the stated bounded scope or partial with explicit notes and outside-scope targets. |
| Enrichment | Available for the named revision, pending, or unavailable. |

A valid model may have denied imports. A completed bounded check may have partial
coverage and still pass. An unrun stage or unresolved freshness requirement is
not the same as a completed check with accepted analysis limits.

The last valid model may be inspected through an explicitly historical request.
After invalid declarations, registry changes or broken owned selections, current
access queries cannot answer from that model as if it described the new source.
They return the current invalid/unavailable result. Source facts that remain
useful may be displayed as evidence without a current permission claim.

## Freshness, saves and overlays

Watching is a change feed, not a synchronization guarantee. Filesystem events may
be delayed, coalesced or lost; requests needing particular content establish their
own freshness point.

Three read modes make that distinction explicit:

- **Published revision:** read an identified analyzed snapshot, with pending/dirty
  status attached when newer inputs are known. This does not claim disk freshness.
- **Synchronized disk check:** reconcile the requested input scope and check a
  captured filesystem view, reporting its verified content identities.
- **Overlay check:** analyze explicitly supplied unsaved content in an isolated
  overlay view, with its base revision and client versions attached.

A changed-file request supplies context, requested stages/scope, file paths,
client versions and content hashes; it can include content, deletions and renames.
For saved-disk mode, verify that the requested content corresponds to the disk
view being checked. If it no longer does, report a conflict/superseded request or
require resynchronization. Supplied bytes do not silently turn a disk check into
an overlay check. For overlay mode, retain and label those bytes without writing
them to the project or mixing them into another client's disk view.

Synchronize pending influencing changes too. Checking a consumer's new bytes
against an old exposure declaration or a changed provider would still be stale.
The input view and compiler host share the same captured data. Reconciliation
accounts for directory membership and resolution inputs as well as file content;
an added previously missing target can change a decision.

The returned revision describes an immutable captured view. It is not a promise
that the live filesystem will remain unchanged after the response. If acquisition
cannot establish the requested view during concurrent edits, retry or report that
freshness was not established; do not label an arbitrary recent snapshot current.

Updates and exact-content requests are ordered. Coalescing background changes is
allowed, but an acknowledged request must receive its own revision result or an
explicit cancellation/supersession outcome. Expensive obsolete work may be
cancelled. It must never publish over a newer generation or return another
revision's findings under the old request token.

Multiple overlays are isolated by client/session and base revision. Updating or
closing an overlay invalidates only that view's derived state. Unsupported overlay
operations return an explicit capability result; they never fall back silently
to disk analysis.

## Incremental updates and analysis depth

Background analysis maintains the information needed for the stated check scope:
ownership, profiles, required source resolution, exports, exposures, supported
accesses and their decisions. It need not eagerly render every signature, expand
every referenced type or compute every placement suggestion.

Changing an import statement is only one cause of invalidation. An unchanged
consumer may become invalid when its provider changes. Analysis retains both
observed-use indexes and resolution/linking dependencies; observed imports alone
cannot describe all invalidation causes.

| Input change | Required reconsideration |
| --- | --- |
| Ordinary source edit | Changed access facts and any affected export identities/kinds; unchanged import text is not proof that availability is unchanged. |
| Export addition/removal, alias, merged declaration or resource description | Effective catalogs, original identities, named/wildcard selections, forwarders and affected consumers. Include unexposed originals. |
| `module.ramify`, module move/add/remove or source-area move | Layout and source classification, tag defaults/assignments, exposure chains and affected imports throughout their actual reach. |
| Registry input | Registry validity, derived profiles, mandatory symbol tags and all affected availability decisions; no cache entry may retain a previous registry's meaning. |
| TypeScript configuration, package resolution metadata, declaration shim, source adapter or installed dependency change | Resolution and source facts that used those inputs, including previously missing targets. Rebuild more broadly when dependencies cannot be bounded. |
| README change | Purpose/path/missing-documentation results and dependent descriptive queries; it does not change exposure or importability. |
| Discovery exclusions, application scope, uncertain watcher state or broad filesystem operation | Reconcile inventory and affected configuration; use a full context rebuild when a smaller invalidation set cannot be justified. |

Excluded dependencies and generated files can still influence resolution. Watching
or fingerprinting those inputs does not make them application-owned source.
Resource existence is checked independently of the declaration shim describing
it. Cache keys include absence/directory dependencies when a lookup used them.

The engine replaces affected facts and findings, removing obsolete denials and
coverage notes as well as adding new ones. Contract diffs show an interface
wildcard's expanded additions/removals even when no description text changed.
When a change affects a wider set than the initially edited files, the report
identifies that checked set. A workspace-completion claim requires all requested
stages for the workspace, not only the edited files.

The incremental path uses the same linking and rule functions as a fresh pass.
Conservative recomputation is valid when precise invalidation is not implemented
or not trustworthy. Avoid a cheaper parallel checker that approximates the rules.
Persistent disk caches and worker pools are optional later optimizations; retained
sessions, watching and correct invalidation are part of this architecture.

Full TypeScript compilation, exhaustive runtime analysis and browser-promise
verification are distinct capabilities. Do not treat a change-local Ramify check
as evidence that they ran. Browser-promise findings belong to the declaring owner
and carry their own coverage/execution status; ordinary matching still uses the
declared promise. No general transitive path-tag or runtime-load prohibition is
introduced by the daemon.

## Service operations and client behavior

The initial client contract covers these operation families. Exact method names,
schemas and transport framing are review items, not new `module.ramify` syntax.

| Family | Operations and guarantees |
| --- | --- |
| Context lifecycle | Open an explicit project/setup, inspect status, synchronize, close; all requests route to an identified context/generation. |
| Checks | Check changed content or the workspace with requested capabilities and freshness; return covered inputs, stages, findings and coverage. |
| Module inspection | List modules, identify a file's owner/source area, read purpose metadata and expanded contracts, and inspect visibility versus value/type availability. |
| Explanations | Explain an original binding's exposure and tag/origin decisions for a specified consumer area, or drill into a recorded source occurrence. |
| Change notifications | Announce published revisions, status changes and updated findings; a reconnect can fetch a complete snapshot without replaying an unbounded event history. |
| Symbol intelligence | Search usable exports and request optional details at a specified revision, with access evidence and explicit missing enrichment. |

The minimal interactive surface includes context management, checking and module
inspection/explanations. Rich capability search, import suggestions and placement
guidance build on those same query contracts; their ranking and rendering are
separate later features. A future client must not maintain a second permissions
catalog or implement its own interpretation of tags.

Normal availability queries name an importing file or an explicit owner/source
area and binding form. A module alone is ambiguous when ordinary source and
tests differ. Hypothetical availability does not establish that a particular
barrel path is safe: an actual import suggestion must also resolve and pass the
source-origin checks for that spelling at the same revision. Suggesting a new
exposure is a proposed architecture edit, never an existing permission.

Return stable diagnostic categories, location, importer/area, original owner and
binding/resource, source-origin evidence, relevant exposure declarations and the
failed rule. Preserve written form versus checked form, especially for unmarked
interfaces. Keep compiler errors distinguishable. Allowed, denied, unverifiable
and outside-scope outcomes can coexist within one source construct.

Observation of dependencies, architectural importability, module documentation,
agent working scope and write authorization remain distinct outputs. The daemon
may supply context to another system; it does not launch agents, authorize
structural edits or revert a user's source after a failed check.

### Transport, process lifecycle and recovery

The versioned local service and process lifecycle are defined in
[processes and clients](processes-and-clients.md). The daemon hosts local IPC;
the optional web process hosts HTTP/tRPC and browser notifications. The endpoint
belongs to the local user. One daemon may serve several isolated worktree
contexts within the global resource budget; the exact context-to-process grouping
and endpoint discovery remain review items.

The handshake checks protocol/schema, engine build and source-adapter compatibility.
A request for an evicted revision returns that fact rather than substituting the
current one. Logs identify context, generation, request and revision without
dumping project source by default. Idle disposal and resource pressure follow the
[memory policy](memory-lifecycle.md#pressure-eviction-and-recovery).

Clients follow the [shutdown and recovery contract](processes-and-clients.md#launch-compatibility-and-shutdown):
idle exit permits demand-driven startup, unexpected failure permits bounded
recovery, and explicit stop suppresses automatic restart by existing clients.
After recovery fails, only a terminating CLI command over reproducible disk
inputs may use in-process batch fallback, disposing its session before exit.
Watch, MCP, web and external service clients report unavailable execution instead
of loading or spawning another analyzer. Preserve root, input setup, registry,
requested capabilities and exact content when falling back. If
an overlay or historical request cannot be reproduced, return unavailable instead
of substituting disk/current state. Report when fallback was used. An unavailable
checker never produces successful enforcement.

CI and an explicit batch option use a fresh engine session without starting a
daemon. Batch and daemon results over identical inputs must agree after normalizing
runtime revision identifiers, timing and other host-only metadata. Compiler
checking and requested optional verifiers retain their separate status in both.

## Declaring and verifying the toolkit

Each iteration reviews the declarations and purpose READMEs of the owners it
implements before their code is moved or written. Until the loader exists,
declarations receive manual checks and automated modularity status remains pending.
Once linking works,
Ramify validates its own descriptions; as source support lands it checks its own
imports. Self-checking supplements independent fixtures and the reference project's
reviewed mutation expectations.

Owned tests live in each module's `src/tests/`: model/description/layout tests
derive `[testing]`, daemon/CLI tests `[testing, dispatch]`, and presentation tests
`[testing, ui]`. Context tests use controlled driver, input, event and clock fakes
under their own owner. Real local transport tests belong with daemon; complete
headless assembly tests belong with root. Tests requiring additional tags use a
separate testing module with test code in ordinary `src/`, and ordinary exposure
for every foreign binding.

The [quick-testing architecture](quick-testing.md) defines real service flows
through direct adapters, alongside separate HTTP/IPC, process and browser tests.
Its UI harness is introduced with later visualization; CLI/context integration
and resource-lifecycle evidence accompany their initial implementations.

Build and runner configuration must collect nested `subs/**/src/` and preserve
portable/browser compilation boundaries separately from Node source. Runtime
toolkit code cannot remain outside declared owners merely to avoid checking.
Repository build scripts and independent projects have explicit scopes. Detailed
file migration, package entries and diagram-emission placement belong to the
[contract and migration step](../plans/tooling-architecture/README.md#contract-and-migration-review).

## Acceptance evidence

These are architectural acceptance requirements for implementation, not claims
about currently passing tests. The plan assigns them to delivery stages. Use
independently stated outcomes alongside batch/incremental comparisons so a shared
engine bug cannot make both sides appear correct.

These semantic/runtime cases are complemented by PC01–PC10 in
[processes and clients](processes-and-clients.md#acceptance-evidence), ML01–ML08
in [memory lifecycle](memory-lifecycle.md#measurement-and-acceptance), and
QT01–QT08 in [quick testing](quick-testing.md#complementary-verification).
Their web/UI cases remain assigned to the later visualization phase; MCP cases
accompany the separately deliverable adapter.

| ID | Required witness |
| --- | --- |
| DA01 | A cold context checks the real reference project's files and descriptions; unsupported or absent capabilities appear explicitly. |
| DA02 | A save request with a deliberately delayed watcher is checked against its submitted/verified content identity and influencing declaration/provider state. |
| DA03 | Two worktrees with identical relative paths but different declarations, bytes or registries yield isolated results. An unknown context never routes to another. |
| DA04 | Concurrent readers see complete revisions; superseded work cannot overwrite newer publication or mislabel an exact-content response. |
| DA05 | An invalid description/registry or missing owned export produces current invalid results. Last-valid access is available only as explicitly historical inspection. Recovery publishes fresh results. |
| DA06 | Removing an exposure, changing required tags or moving source into testing classification rechecks unchanged affected consumers and removes obsolete findings after repair. |
| DA07 | Adding/removing an interface-file export updates expanded contracts and affected consumers without editing the wildcard statement. An incomplete/foreign expansion invalidates the declaration. |
| DA08 | An original changes from pure type to a runtime-bearing merged binding; its unchanged unmarked importer receives the new value check. Original and resource identities survive legal aliases. |
| DA09 | Configuration, resource shim, package resolution or previously missing file changes invalidate affected results. Ambiguous invalidation and watcher overflow trigger conservative reconciliation. |
| DA10 | The same edit sequence and final inputs produce equivalent batch and incremental findings, coverage, expanded contracts and query answers, including removals. |
| DA11 | Independent overlays do not change disk or each other; stale base versions, conflicts, closure and unsupported overlay fallback have explicit outcomes. |
| DA12 | CLI and service queries agree with enforcement for the same consumer area and revision. Import suggestions also pass resolved-path testing-origin checks. |
| DA13 | A README edit updates purpose/missing metadata without changing importability. Missing purpose never borrows another owner's prose. |
| DA14 | Enrichment failure leaves completed checks available; required resolver/stage failure cannot report completion. A known denial still fails alongside nonblocking coverage notes. |
| DA15 | Restart, version mismatch and eligible terminating-CLI batch fallback preserve semantics and input scope. Idle exit, crash and explicit stop follow the distinct recovery contract. Unavailable checking, expired generations and evicted revisions never become success/current substitutes. |
| DA16 | Browser tag matching and separately requested browser-promise verification have distinct findings, coverage and execution status. |
| DA17 | Idle disposal releases watchers/sessions; cancellation and bounded caches work under several active contexts. Measure cold analysis, warm saves, broad invalidation, query latency and memory on representative and 100/500/1,000-owner fixtures. Agree numeric budgets from measurements. |
| DA18 | Ramify validates its own declared tree and implemented source forms with explicit coverage; independent negative reference cases still detect intentionally forbidden imports. |

## Decisions still requiring review

The process split, client roles and resource/testing requirements are recorded
in the [architecture overview](README.md). Detailed implementation review still
needs the following without reopening those decisions or the model rules:

1. Complete TypeScript contracts and `module.ramify` manifests for the proposed
   owners, package entry points and the source/test migration map.
2. Exact TypeScript adapter API and invalidation dependencies, demonstrated on
   original resolution, resources, wildcard growth and unmarked interfaces.
3. Context-to-daemon grouping, endpoint discovery, wire schemas, compatibility
   handling, notification delivery and reconnect behavior. The separate web
   process and its tRPC API, and the separate stdio MCP adapter, are already
   selected. MCP tool/resource schemas and negotiated protocol details remain
   to be specified; optional HTTP hosting is a later extension.
4. Overlay/base-revision protocol, synchronization boundaries and conflict results;
   which operations are included in each first delivery milestone.
5. Numeric resource/retention limits, lease/idle durations and measured latency
   budgets implementing the memory policy; optional persistent caches and
   workers require evidence before adding their complexity.
6. Registry configuration serialization and ordinary-default replacement. Until
   specified, use defaults or the resolved registry API; invent no accepted syntax.
7. Scope and algorithm of separate browser-promise verification and richer
   intelligence clients. Their missing implementation remains explicit.

None of these decisions adds automatic type bundling, a special testing profile,
mandatory generated facades, branch-selective exposure or new runtime-load rules.
