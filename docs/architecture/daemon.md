# Daemon and analysis architecture

**Date:** 2026-09-11; revised 2026-09-14. **Status:** Implemented across eleven
owners: the batch engine, the resident daemon with its context manager, service
and lightweight client, and the retained analysis session that answers the
bounded hook check. [Implemented retained session](#implemented-retained-session)
states what Plan 5 delivered. The process/client split and memory/testing
requirements are decided in the [architecture overview](README.md). The
[Plan 1 handoff](../plans/done/iteration-1-project-verifier/iterations/iteration15-results.md)
records batch evidence, the [Plan 2 remediation](../plans/done/iteration-2-resident-verification/remediation-2026-09-11.md)
records resident evidence, and the [Plan 5 completion report](../plans/iteration-5-fast-incremental-checks/iterations/iteration13-results.md)
records the retained session's evidence and limits. The MCP adapter, unsaved-content overlays and the explorer are not implemented.

The resident design calls for a long-lived local backend that maintains the
analyzed state of each active project, updates that state as files change, and
serves architectural checks and queries from identified revisions. A reusable analysis engine supplies
the same behavior in the daemon and in batch execution. CLI, editor, agent and
visualization clients consume that shared analysis.

Keeping analysis resident exists to make checks fast when one or a few files
change. The main use case is agent post-write hooks: a hook runs a check after
each file an agent writes and returns violations before the agent continues.
[Fast incremental checks](#fast-incremental-checks) states the requirement.

## Scope and authority

This document owns the module boundaries, exposure paths, engine
pipeline, context/revision semantics and semantic service operations.
[Processes and clients](processes-and-clients.md) defines executable placement,
CLI behavior and the separate tRPC web process;
[memory lifecycle](memory-lifecycle.md) defines retention and resource policy;
[quick testing](quick-testing.spec.md) defines test execution boundaries.
The [tooling plan](../roadmap.md) owns review steps,
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

In the resident design, CLI and external Node programs using the lightweight
`connectDaemon` client connect to the daemon's local service. Editors and agents
using MCP reach it through the separate stdio adapter. The future
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

Batch execution creates a fresh session, analyzes the selected inputs and
disposes it. `createAnalysisSession` admits one `analyze()` call and provides
idempotent `dispose()`; `analyzeProject` creates and disposes that session for a
single invocation. The daemon instead opens one retained analysis session per
context with `openRetainedSession`, which reuses the same discovery, linking,
interpretation, evaluation and reporting code over retained per-file facts. The
[implemented retained session](#implemented-retained-session) describes its
structure.

## Ramify's ownership tree

These eleven owners are declared within one toolkit package. The nine batch
owners are joined by `daemon` and its `contexts` child. Every declared owner
has `module.ramify`, a purpose `README.md` and its own `src/`, with optional
`src/interfaces/` and `src/tests/`. Each edge below corresponds to placement under
the parent's `subs/`. Brackets show module-header tags, not additional syntax.
The root's declared name is `ramify`, a reserved word, so its header must quote
the name as `module "ramify" tagged [dispatch]`.

```text
ramify [dispatch]                       CLI, daemon and batch entries; service vocabulary; assembly
├── analysis []                         batch sessions, the retained session, reports and its worker host
│   ├── model [browser]                 identities, registry, exposure and decisions
│   ├── descriptions [browser]          parsing and description linking
│   ├── project []                      inventory, source reads, metadata and the project observer
│   └── typescript []                   compiler integration, per-file descriptions and the retained adapter
├── daemon [dispatch]                   service, IPC host, client, watcher, clock and discovery
│   └── contexts []                     contexts, revisions, history, covering and hot and warm levels
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

Batch, resident and retained-session signatures are implemented in the owners'
source interfaces and `module.ramify` files. Semantic queries and enrichment
remain later work.

| Owner | Responsibility | Principal to-parent contract |
| --- | --- | --- |
| `ramify` | Assemble the CLI, daemon and lazily loaded batch entries; own `BatchInvocation`, `BatchResult` and the dispatch-facing `RamifyService` vocabulary; supply the session driver to contexts. MCP/web entries are later work. | No effective parent exposure; package entry points target the appropriate owners. |
| `analysis` | Execute the batch pipeline; host one retained session per context in a worker, with its revision paths, finding deltas and audit. Semantic queries remain later work. | `createAnalysisSession`, `analyzeProject`, `validateProject`, `acquireInventory`, `resolveProject`, `openRetainedSession`, and owned analysis and session vocabulary; later `inspectModule` and `explainAccess`. |
| `model` | Canonical model identities, registry and profile rules, mandatory symbol tags, exposure reach, availability and testing-origin decisions. | `buildModel`, `explainImport`, `explainVisibility`, model vocabulary and validation operations. |
| `descriptions` | Parse version 1 with source locations and comments; resolve exact selections, exposed names and wildcard contracts; produce grounded declarations and diagnostics. | `parseDescription`, `linkDescriptions`, and their input/result vocabulary. |
| `project` | Select the root and compiler configuration, inventory ownership, validate containment/symlinks and scope, read coherent inputs and extract README purposes; observe one project's inputs for the retained session, including the compiler's reads, and re-observe them in the sweep. | `readProject`, `resolveProjectRoot`, `observeProject`, project input/inventory, observation and metadata contracts. |
| `typescript` | Own the finite source compiler helper for batch and the retained compiler adapter with one live snapshot; describe exports per file with their dependencies, resolve originals and resources and interpret source accesses. Optional symbol details remain later work. | `createSourceAnalysis`, `createAccessInterpreter`, `describeFiles`, `assembleCatalog`, `createRetainedSourceAnalysis`, plus plain-data source contracts; enrichment remains later. |
| `daemon` | Implement the shared service and its in-process binding, the IPC host and process entry, the lightweight client, filesystem watcher and clock ports, discovery, records, framing and launch. IPC delegates to the service and context work to its child. | `createDaemonService`, `dispatchServiceRequest`, `startDaemon`, `connectDaemon`, `createFilesystemWatcher`, `createSystemClock`, `selectEndpoint`, `readDaemonRecord`, codec operations, lifecycle vocabulary and relayed context types/test ports. |
| `contexts` | Select and isolate contexts; order watcher changes and requests per context; publish revisions atomically; keep compact history; apply the covering rule, the sweep schedule, deadlines, leases, the hot and warm levels and eviction. | `createContextManager`, revision/status/outcome vocabulary, the `AnalysisDriver` port and controlled test ports. |
| `presentation` | Render model data, interactions and teaching examples; report views remain later work. | Selected components explicitly tagged `[ui, browser]` and owned props. |
| `layout` | Calculate diagram geometry from supplied neutral data. | Selected functions explicitly tagged `[browser]` and owned layout vocabulary. |
| `cli` | Parse arguments, send resident checks, hook checks, watch and daemon requests through the injected connector, invoke an injected batch operation, render results and map execution status to exits. MCP serving and explorer launch remain later work. | `runCli` and its dispatch-classified vocabulary, including the `ramify.check/1` document. |

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

### Exposure paths

Analysis composes its four children through their to-parent contracts. It exposes
selected model operations and vocabulary to descendants where needed. Parser,
filesystem and TypeScript implementation functions otherwise remain visible only
to analysis. Analysis passes data between those children through their public
input contracts.

Root receives the analysis contracts and relays selected analysis types and
portable model operations to descendants. It also relays the implemented daemon
and context vocabulary and controlled test ports through daemon's to-parent
contract. The `AnalysisDriver` port travels from contexts to daemon and then to
root; assembly does not import a private grandchild binding. Transport
contracts owned by root carry `dispatch`, so untagged analysis and contexts source cannot import
them even when they are visible from above.
Root exposes the `RamifyService` interface and its operation, capability, error
and result types to descendants; `daemon [dispatch]` imports and implements that
interface for both IPC delivery and the in-process binding.
Root assembly supplies dependencies; the shared validation and routing stay
inside daemon, as specified by the [service boundary](processes-and-clients.md#shared-service-boundary).

Presentation receives its layout child's to-parent API. A future explorer receives
presentation components through root's declaration-only relay; root's source need
not import a UI symbol. An exposure to descendants reaches all of them, including
other compatible UI owners. Named relays make the chosen audience explicit;
there is no selected-branch permission.

For example, these fragments illustrate the analysis-driver path. Paths are
relative to the toolkit root; the implemented declarations carry more names.

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

At root, assuming analysis's to-parent contract includes these owned types:

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
foreign consumer needs to import explicitly require their own exposure paths;
there is no automatic signature-type exposure.

Browser module headers do not assign browser promises to exports. Portable model,
description and layout values consumed by browser source need explicit `[browser]`
assignments. UI values need `[ui, browser]`. Type-only vocabulary does not need a
browser promise, but still retains its defining area's required-importer tags.

Package exports are separate runtime entry points for the portable model, layout,
Node analysis, presentation and CLI. They confer no internal Ramify visibility.
The combined `src/index.ts` entry has been removed. Both `ramify.ts` and
`ramify.ts/analysis` select the analysis entry; `ramify.ts/analysis/inventory`,
`ramify.ts/model`, `ramify.ts/presentation`, `ramify.ts/layout` and `ramify.ts/cli`
select their respective owner entries. The installed executable is the
`dist/src/ramify` launcher, which runs the compiled client or the Node entry
`dist/src/cli-entry.js`.
The [entry-point dependency requirements](processes-and-clients.md#modules-and-executable-entry-points)
also keep `connectDaemon` usable without importing daemon startup or compiler
assembly. A legal exposure path alone does not establish low startup memory.

## Engine inputs and analysis pipeline

A batch session receives `AnalysisInputs`: a project request, one immutable
resolved tag registry, requested capabilities and finite work limits. The project
request supplies the working directory and an optional explicit root; scope is
`whole-project` and compiler configuration is discovered. Selection follows
[CLI invocation](cli-invocation.spec.md), with no per-invocation exclusions or
configuration override. Independent examples and other applications use separate
selected roots. Compiler-loaded dependencies do not automatically enter the
application ownership tree.

The initial pass, and any conservative full recomputation, follows this order:

1. **Inventory and parse.** Read project inputs and description text. Detect
   misplaced or invalid boundaries rather than attributing their files to a
   parent. Validate the registry, physical layout and module names; establish
   ownership and the fixed source-area profiles.
2. **Resolve source facts.** Obtain effective export descriptions and original
   identities, including unexposed exports and resource bindings. This does not
   require the corresponding imports to be allowed.
3. **Link declarations.** Resolve exact owned references, complete interface-file
   wildcards and child-exposed names from the leaves toward the root. Gather tag assignments
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

The implemented adapter pins TypeScript 7.0.2 and uses `typescript/unstable/sync`
inside a supervised helper. Project configuration and source resolution use
separate finite helpers whose filesystem callbacks read the same captured input
view. Analysis releases the source helper after extracting access facts, then
seals the view before publishing a report. Changed inputs trigger a fresh
acquisition within the configured retry limit or an explicit incomplete result.
Compiler state is not retained across batch runs.

Reports use schema `ramify.analysis/1`, a fresh `runId` and a captured `inputId`
when established. They retain stage and capability execution, inventory, linked
contracts, accesses, decisions, diagnostics, warnings and coverage as frozen
plain data. These batch identities are not context generations or revisions.

The retained session keeps a warm TypeScript 7.0.2 compiler server between
revisions behind `createRetainedSourceAnalysis`; the
[implemented retained session](#implemented-retained-session) describes it.
Optional signature rendering may use that session or another adapter; a separate
`tsserver` process is not a requirement.
Loss of optional descriptions can degrade enrichment alone. Loss of required
resolution capability cannot masquerade as a completed check.

## Context identity and retained state

A context identifies a selected application root in a particular worktree and
analysis setup. Canonical roots and explicit scope/configuration selections
distinguish contexts. Branch names and shared Git directories
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
declarations, source/configuration, registry and tool/adapter versions. A
restart or eviction creates a new generation so an old token
cannot accidentally identify a new result.

There is one ordered update stream per context. Analysis constructs a candidate
off the published view, computes the required results and atomically publishes
the outcome. Readers observe a complete published revision; no result combines
new ownership with old tags or stale access findings. Immutable logical snapshots
may share unchanged data structures.

A published revision keeps the outcome, summary, diagnostics, warnings and
coverage notes; publication builds only those and applies the report-size limit
(`maxReportBytes`) to them. The full report, with its analysis snapshot, is
built from the revision's retained facts only when it is requested: a
report-scope check, `--format json`, batch and later `inspect`. Its size limit
applies where it is built. A hook's check can therefore pass while a full report
for the same revision would exceed `maxReportBytes`; the limit protects the
receiver of the full report, which still gets the resource-limit failure.

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

## Freshness and saves

Watching is a change feed, not a synchronization guarantee. Filesystem events may
be delayed, coalesced or lost; requests needing particular content establish their
own freshness point.

Two read modes make that distinction explicit:

- **Published revision:** read an identified analyzed snapshot, with pending/dirty
  status attached when newer inputs are known. This does not claim disk freshness.
- **Synchronized disk check:** reconcile the requested input scope and check a
  captured filesystem view, reporting its verified content identities.

Ramify checks saved files only; it does not accept unsaved content in place of
disk. A changed-file request supplies context, requested stages/scope, the
changed file paths and their expected content hashes; it can name deletions and
renames. Verify that the expected content corresponds to the disk view being
checked. If it no longer does, report a conflict/superseded request or require
resynchronization.

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
Conservative recomputation remains correct when precise invalidation is not
trustworthy, but it does not meet the fast-check requirement below for ordinary
small edits. Avoid a cheaper parallel checker that approximates the rules.
Persistent disk caches and worker pools are optional later optimizations; retained
sessions, watching, correct invalidation and fast incremental checks are part of
this architecture.

Full TypeScript compilation, exhaustive runtime analysis and browser-promise
verification are distinct capabilities. Do not treat a change-local Ramify check
as evidence that they ran. Browser-promise findings belong to the declaring owner
and carry their own coverage/execution status; ordinary matching still uses the
declared promise. No general transitive path-tag or runtime-load prohibition is
introduced by the daemon.

### Fast incremental checks

The resident daemon exists to answer a synchronized check quickly when one or a
few files change. The main use case is agent post-write hooks. After a coding
agent writes a file, its host runs a hook that checks the change and returns any
violations to the agent before it continues. The hook runs on every write and
the agent waits for it, so the check must take a small fraction of the time of
a fresh batch check.

- For an edit to one or a few source files in a warm context, a synchronized
  check does work proportional to the changed files and the results they
  affect, not to the project. Rebuilding whole-project analysis or compiler
  state for such an edit does not meet this requirement.
- Fast results are exact: they equal a fresh pass over the same captured
  inputs, including findings, coverage and the checked set. An edit whose
  effects cannot be bounded takes the broader path, and its report identifies
  the wider checked set.
- A synchronized check whose expected file identities the published revision
  covers, with no other known change or required sweep pending, is answered
  from that revision without an update. The covering rule
  is evaluated when a request arrives and again when each revision publishes.
  A queued request whose expectations the new revision covers, with no other
  known change or required sweep pending, is answered from that revision
  without another update.
- A configuration or manifest path event requires a sweep in the next capture.
  An update in that capture that acquired the project again on a fresh
  capture satisfies that sweep; every other required sweep still runs.
- A hook verifies a module's exports and their use. A synchronized check that
  names a configuration path names no such change, and its verdict is not
  needed at once: the context answers it immediately as not checked, naming the
  configuration change, and queues the named paths as it would any other. The
  configuration paths are the ones the path pattern matches and the ones the
  acquisition observed with the configuration role, such as an `extends` target
  the configuration helper read. The update behind the reply still runs, so a
  later request waits for that revision and is answered under the new
  configuration. A whole-project report request still waits for its capture.
- A hook-facing check has a bounded response time. When it cannot be met, for
  example in a cold context or during daemon recovery, the outcome is explicit
  and never a pass.
- Hook latency budgets are agreed from measurements, like the other resident
  budgets.

A hook check verifies saved files. It does not check unsaved content, block a
write before it happens or revert the agent's edit.

### Implemented retained session

Plan 5 and its successor plans implement the requirement above. The
[Plan 5 completion report](../plans/iteration-5-fast-incremental-checks/iterations/iteration13-results.md)
records the evidence, the measured hook latency and the remaining limits.

**Structure.** Each context owns one retained analysis session, which runs in a worker thread with an enforced V8 heap limit.
`analysis` starts that thread inside a disposable supervisor process with its
own process group, so a failed worker cannot leave its children running. The
worker keeps one warm TypeScript 7.0.2 compiler server as a child process with
exactly one live snapshot; compiler objects never leave the `typescript`
adapter, and the daemon's event loop never waits on the compiler. Messages
between the context and the worker are frozen plain data: changes in, revisions
and outcomes out. A full report crosses only when a caller requests one. Batch
checks keep their finite compiler helpers and share the pipeline code.

**Retained facts.** The session retains the observed inputs, per-file export descriptions with the files, resources, shims and absences each one depended on, per-file access facts, the linked model, per-access decisions and reverse indexes.
The whole-project catalog is the assembly of the per-file descriptions, so batch
and session produce it with the same code. The project observer records every
input the analysis used, including the compiler's reads, existence probes and
directory listings, so a revision's `inputId` equals a batch capture's over the
same disk state. A report the context delivers states the root selection of the
invocation it answers: `scope.selection` and `scope.invokedFrom` come from that
request's own resolution, while `scope.root`, `scope.configuration` and `inputId`
stay the context's. Because `inputId` identifies the project's captured inputs and
excludes the invocation's discovery climb, it can differ from a batch run that
found the root by climbing from a subdirectory.

**Revision paths.** An update classifies the named changes and takes one of the
paths `unchanged-surface`, `source`, `description`, `metadata`, `membership` and `broad`:

| Path | Cause | Work |
| --- | --- | --- |
| `unchanged-surface` | A source edit that leaves the file's export description and access facts equal by value | Re-extracts that file and refreshes the decisions citing declarations that moved; decides nothing else. |
| `source` | A source edit that changes exports or accesses | Recomputes descriptions over their dependency closure, re-interprets the changed files and the importers of every description that changed by value, relinks when the link input changed and decides the accesses the change reaches. |
| `description` | A `module.ramify` edit | Relinks and decides the accesses whose importer or original owner lies in the affected subtree, with no compiler work. |
| `metadata` | A README edit | Updates purposes, with no compiler, link or decision work. |
| `membership` | Created or deleted owned sources whose reach the retained facts and the compiler can bound | One incremental compiler update; describes and interprets only the files whose resolution those paths can change. |
| `broad` | Configuration, dependency or structural changes, a membership change that cannot be bounded, and a rebuilt compiler | Invalidates the program on the warm compiler and re-extracts every owned file; the checked set names every file. |

Every revision carries its checked set, its finding delta against the previous
revision and its stage timings. Link and model remain whole-project work on every
path that relinks.

**Audit.** `verify` recomputes every fact from the warm compiler and compares it
with the retained facts. The daemon runs it on idle, at most once per revision,
and publishes the recomputed facts with cause `verify` on a mismatch. Only a hot
session is audited: a demotion cancels an armed audit, and a session whose
compiler is released reports that outcome rather than failing (2026-09-14). An
attempt counts for its revision whether it compared the facts or reported that it
could not, so an audit that fails waits for the next revision and requires no
sweep (2026-09-14). Because it
recomputes through the same compiler, the audit cannot detect a compiler holding
stale options; only a comparison with a batch run over the same inputs verifies
input identity.

**Covering rule.** A synchronized request names expected content identities. The
context answers it from the published revision, with no analysis, when that
revision observed every named path with the expected identity, the list is
nonempty, the revision carries the requesting lease's invocation, and no known
influencing change or required sweep is pending. The rule is evaluated when the
request arrives and again at each publication. Otherwise the request flushes the
debounce window, adds its paths to the change set and is answered by the revision
that covers it. A named path the covering revision did not observe is
`unobserved-input`; a different identity after the update is `superseded`. A
request naming a configuration path is answered at once, as the requirement above
states.

**Sweep.** `reobserve` stats every observed path, hashes those whose signature
changed and reports them as ordinary input changes; it replaces Plan 2's periodic
verification capture. A periodic sweep starts once `sweepIntervalMs` (30 s) has
passed since the start of the previous sweep while the context has activity. It
never makes a covered request wait and never marks the context reconciling. A
required sweep follows a configuration, manifest or lockfile change, a watcher
overflow or error, an opening or conservative context, more queued paths than
`maxQueuedPaths`, and an empty-expectation plain check; a request waits for it.
An update that acquired the project again satisfies a sweep that only
configuration or manifest events required.

**Deadlines and levels.** A hook request's deadline defaults to
`updateDeadlineMs`, 2 s. A cold context that cannot publish in time answers
`cold`, and a warm context whose update outlasts the deadline answers
`deadline-exceeded`; in both cases the update continues and publishes. Sessions
move between hot, warm and cold levels as the
[memory lifecycle](memory-lifecycle.md#retained-sessions-and-their-levels) states.
A demotion is bounded by `demoteDeadlineMs`, 5 s: a session that has not released
its compiler by then is unresponsive, and the context is evicted under pressure
so the hot budget and the analysis slot are free again (2026-09-14). `ContextStatus`
reports the demotion in flight and the moment a demotion passed its deadline
(2026-09-14). A context with a waiting synchronized request is scheduled before
any context's background maintenance, which cannot take the analysis slot from a
waiting client (2026-09-14).

**Hook request and reply.** `ramify check --changed <path>...` hashes each named
file in the CLI, a missing file as absent, and sends one synchronized request with
`scope: 'delta'`, the expected identities, an optional `since` revision and
`deadlineMs`. The compact reply names the covering revision's identifier, sequence
and path, its checked set, every project finding with a `new` mark against `since`
or the previous revision, removed finding identities, warnings, coverage and
timings. With `--format json` the CLI writes it as one `ramify.check/1` document.
The command exits 0 with no finding, 1 with findings or an invalid revision and 2
when the files were not checked, and it never falls back to batch. The whole
report is built only for `scope: 'report'`, which the plain `ramify check` requests
for its unchanged `ramify.analysis/1` document. The
[CLI invocation contract](cli-invocation.spec.md#hook-and-complete-checks) pairs the
two forms.

## Service operations and client behavior

The initial client contract covers these operation families. Exact method names,
schemas and transport framing are review items, not new `module.ramify` syntax.

| Family | Operations and guarantees |
| --- | --- |
| Context lifecycle | Open an explicit project/setup, inspect status, synchronize, close; all requests route to an identified context/generation. |
| Checks | Check changed files or the workspace with requested capabilities and freshness; return covered inputs, stages, findings and coverage. Changed-file checks meet the [fast incremental check](#fast-incremental-checks) requirement. |
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
a historical request cannot be reproduced, return unavailable instead of
substituting current state. Report when fallback was used. An unavailable
checker never produces successful enforcement. The bounded hook check,
`ramify check --changed`, never uses batch fallback: after exhausted recovery it
answers not checked, as the [CLI invocation contract](cli-invocation.spec.md#hook-and-complete-checks)
states.

CI and an explicit batch option use a fresh engine session without starting a
daemon. Batch and daemon results over identical inputs must agree after normalizing
runtime revision identifiers, timing and other host-only metadata. Compiler
checking and requested optional verifiers retain their separate status in both.

## Declaring and verifying the toolkit

Each iteration reviews the declarations and purpose READMEs of the owners it
implements before their code is moved or written. `npm run check:self` checks
the descriptions and owned source of all eleven toolkit owners through the
resident CLI. Self-checking supplements independent fixtures and the reference
project's reviewed mutation expectations; the explicit Plan 1 gate remains
`npm run reference:verify -- --plan 1`.

Owned tests live in each module's `src/tests/`: model/description/layout tests
derive `[testing]`, daemon/CLI tests `[testing, dispatch]`, and presentation tests
`[testing, ui]`. Context tests use controlled driver, input, event and clock fakes
under their own owner. Real local transport tests belong with daemon; complete
headless assembly tests belong with root. Tests requiring additional tags use a
separate testing module with test code in ordinary `src/`, and ordinary exposure
for every foreign binding.

The [quick-testing architecture](quick-testing.spec.md) defines real service flows
through direct adapters, alongside separate HTTP/IPC, process and browser tests.
Its UI harness is introduced with later visualization; CLI/context integration
and resource-lifecycle evidence accompany their initial implementations.

The migrated model lives in `subs/analysis/subs/model/src/`; presentation lives in
`subs/presentation/src/`, with neutral geometry in its `subs/layout/src/` child.
Type-checking and test discovery collect root and nested owner source/tests;
`tsconfig.portable.json` checks model, descriptions and layout without Node
ambient types. The example, site and scripts have separate compiler scopes.
`npm run production:files -- --root <dir>` selects source from resolved profiles,
excluding every testing-classified area. `scripts/build-production.ts` consumes
that selection and bootstraps from source without requiring existing `dist/`.
Whole-project checking still includes owned tests. Runtime toolkit code cannot
remain outside declared owners merely to avoid checking. Detailed file migration,
package entries and diagram-emission placement belong to the
[contract and migration step](../roadmap.md#contract-and-migration-review).

## Acceptance evidence

These are architectural acceptance requirements for implementation, not claims
about currently passing tests. The plan assigns them to delivery stages. Use
independently stated outcomes alongside batch/incremental comparisons so a shared
engine bug cannot make both sides appear correct.

These semantic/runtime cases are complemented by PC01–PC10 in
[processes and clients](processes-and-clients.md#acceptance-evidence), ML01–ML08
in [memory lifecycle](memory-lifecycle.md#measurement-and-acceptance), and
QT01–QT08 in [quick testing](quick-testing.spec.md#complementary-verification).
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
| DA11 | In a warm context, a synchronized check after a one-file source edit, as run by an agent post-write hook, meets the agreed hook latency budget and does work bounded by the change. Its results equal a fresh batch check of the same inputs. Edits with unbounded effects report their wider checked set; an unmet deadline is explicit, never a pass. |
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

1. TypeScript contracts, `module.ramify` manifests and package entries for the
   later owners. The eleven resident owners, their final declarations and the
   eight package entries are implemented and validated.
2. Narrower invalidation where Plan 5 kept whole-project work: a proportional
   relink of the model, and a syntactic pre-filter before re-extraction. The
   retained adapter contract and per-file dependencies are implemented.
3. Context-to-daemon grouping, endpoint discovery, wire schemas, compatibility
   handling, notification delivery and reconnect behavior. The separate web
   process and its tRPC API, and the separate stdio MCP adapter, are already
   selected. MCP tool/resource schemas and negotiated protocol details remain
   to be specified; optional HTTP hosting is a later extension.
4. The remaining [fast incremental check](#fast-incremental-checks) evidence:
   hook latency on 500- and 1,000-owner projects and on macOS. The hook
   invocation, output, deadline, cold and recovery behavior are implemented, and
   the reference and 100-owner rows are measured within the 2 s acceptable-time
   budget.
5. Measured memory plateaus for the retained session, hot and warm contexts and
   entry footprints, and any persistent checkpoint of retained facts. Resident
   retention limits and idle durations are implemented with their defaults.
6. Registry configuration serialization and ordinary-default replacement. Until
   specified, use defaults or the resolved registry API; invent no accepted syntax.
7. Scope and algorithm of separate browser-promise verification and richer
   intelligence clients. Their missing implementation remains explicit.

None of these decisions adds automatic type bundling, a special testing profile,
mandatory generated facades, branch-selective exposure or new runtime-load rules.
