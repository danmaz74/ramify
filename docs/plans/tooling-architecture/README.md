# Tooling implementation and architecture review plan

**Date:** 2026-09-07. **Status:** Proposed for review; implementation has not
started under this plan.

The intended system is defined in the [architecture documents](../../architecture/README.md).
They own the decided process/client, resource and testing architecture, plus
the proposed module tree, exposure routes, retained state and synchronization.
This plan owns the review process, migration work and implementation sequence.
It replaces the earlier batch-first architecture draft that deferred the daemon
and watching as optional optimizations. Batch implementation remains an early
milestone of the planned long-running system.

## Scope and relation to the reference project

Deliver a reusable analysis engine and local daemon, with a CLI that can use the
retained analysis or run the same checks in batch mode. The first interactive
scope includes project contexts, file watching, exact-content synchronization,
checks, module inspection and explanations. Keep the existing diagram/site
behavior working throughout migration. Rich search, editor/MCP adapters and a
live explorer are later surfaces over the same analysis contracts.

The decided process model is a lightweight CLI, resident analysis daemon and
separate on-demand web process. Ordinary CLI commands use local IPC directly;
batch mode loads a fresh engine into the CLI process. The later web process uses
tRPC and built frontend assets. Its dependencies remain outside daemon startup.

The [project-explorer reuse analysis](../../analysis/project-explorer-reuse.md)
identifies source to lift during that later visualization phase. Review its
required facts, query boundaries and revision guarantees in stages A and B so
the initial backend can support that client. UI extraction and browser transport
remain later deliverables; no empty visualization modules are needed now.

The [Collection Review plan](../reference-project/README.md), its
[implementation plan](../reference-project/implementation.md), and the
[reference harness](../reference-project/harness.md) remain independent work.
The example can be implemented before the checker; its descriptions target the
definitive language and its unsupported checks remain visibly pending. Tooling
work activates the corresponding reviewed cases as capabilities become available.
Do not implement a second checker inside the example or harness.

The current evaluator under `src/model/` accepts constructed trees and predates
the registry, source areas and canonical source-binding identities. `src/viz/`
contains reusable diagrams. The filesystem loader, description parser, source
checker and daemon still require implementation. Reuse conforming algorithms and
meaningful tests; existing APIs cannot override the definitive principles.

## Architecture review

Review the [eleven-owner tree](../../architecture/daemon.md#ramifys-ownership-tree)
and its contracts before coding. In particular, confirm:

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

Before moving or writing implementation code, prepare a concrete review package:

1. Exact public TypeScript contracts and package entry points. Include analysis
   sessions, context driver, immutable results, source/export catalogs, freshness
   requests, cancellation/conflict outcomes and capability reporting. Separate
   lightweight client, daemon, batch and later web entry files; review their
   transitive runtime dependencies, not just their exported types.
2. Every initial owner's complete `module.ramify` and purpose README draft, plus
   a contract map listing originals, tags, exposure routes and intended consumers.
   Include every foreign signature type consumers must import; do not assume
   automatic type exposure or claim a foreign original through an owned wildcard.
3. The file-by-file source/test move map into the declared `src/` and `subs/`
   layout. Locate reusable visualization logic and explicitly account for build
   scripts and independent example/site scopes.
4. Build, test and package configuration for the nested tree, preserving portable
   and browser boundaries separately from Node analysis and executable code.
5. Wire protocol, context identity, context-to-daemon grouping/discovery,
   synchronization, overlay isolation and compatibility choices for the first
   daemon milestone. Specify retention budgets, backpressure, client leases,
   idle disposal and recovery behavior. The separate web process is decided;
   its detailed HTTP/event wiring remains a later capability.
6. A case map linking model/source requirements to the existing reference cases
   and runtime requirements to DA01–DA18, PC01–PC07, ML01–ML07 and QT01–QT07
   in the architecture documents. Design the direct-service test binding now;
   add the UI harness when visualization is implemented.

Root and analysis tests can exercise their own assembly and upward child contracts.
Context tests use controlled drivers/events/clocks. Owned tests move to each
owner's `src/tests/`; tests requiring additional classifications use a separate
properly exposed testing module with test code in ordinary `src/`.

Diagram emission needs a concrete migration choice: either a declared Node owner
with `ui` classification and a legal route to the rendering exports, or an
explicitly independent build-tool scope. Root's dispatch classification alone
cannot import UI contracts. Do not weaken tags to preserve the old combined barrel.

## Delivery sequence

Each stage has an explicit capability gate. A requested missing or unrun stage
cannot count as passed. Completed bounded analysis with documented coverage limits
is a different outcome, as specified by the source principles.

| Stage | Deliverable | Required evidence |
| --- | --- | --- |
| A. Architecture approval | Preserve the decided process/client, memory and testing architecture; review the remaining owner tree and detailed contracts. | Agreed target architecture before implementation starts. |
| B. Contracts and migration | The complete review package above, with all initial descriptions, README drafts and legal import routes. | Contracts and code movement are concrete and reviewable before execution. |
| C. Layout and model | Declared toolkit layout; canonical original identities, registry, profiles, tag rules and testing-origin decisions; migrated model tests. | Focused rule tests and applicable reference-model cases. Automated loader/source stages remain explicitly absent. |
| D. Discovery, exports and linking | Project acquisition, parser, source export catalog, exact selections, interface wildcards, grounded exposure evaluation and README metadata. | Real filesystem/reference cases, including E07–E09 and H03. Ramify validates its own descriptions without claiming source checking. |
| E. Source checking and batch CLI | Supported source interpretation, reports, inspection and explanations through a reusable fresh analysis session. | Required source cases, independently expected negative mutations and DA01/DA14/DA16/DA18 within their implemented scope. Compiler diagnostics and coverage remain distinct. |
| F. Retained sessions and updates | Versioned input views, reusable compiler state, dependency-aware invalidation and atomic candidate results. | DA06–DA10 and DA13; compare edit sequences with fresh analysis, including unchanged affected consumers and removals. |
| G. Local daemon and contexts | Local endpoint, isolated contexts, watchers, exact-content checks, revision publication, bounded retention, lifecycle, lightweight CLI connection and batch fallback. | DA02–DA05, DA10, DA14–DA15 and DA17; real local client/server plus the applicable PC, ML and QT cases below. |
| H. Overlays and additional clients | Isolated overlays and their conflicts; subsequently editor/MCP clients, richer intelligence and the explorer through its separate on-demand tRPC web process. | DA11–DA12 plus applicable lifecycle/equivalence, quick-mode, actual HTTP/browser and web-memory cases below. |

Overlay identity and freshness semantics are reviewed in B even if overlay
execution ships in H. Stage G advertises disk-context capabilities explicitly.
Presentation migration accompanies the stages that change its dependencies; it
is not postponed until the live explorer is built.

Apply the additional architecture cases as follows. A case spanning several
capabilities is completed only when all its scheduled parts have evidence:

| Case family | Initial engine/CLI/daemon work | Later visualization/overlay work |
| --- | --- | --- |
| [PC01–PC07](../../architecture/processes-and-clients.md#acceptance-evidence) | E–G: PC01–PC04, daemon parts of PC06, local-service parts of PC07. | H: PC05, web parts of PC06–PC07. |
| [ML01–ML07](../../architecture/memory-lifecycle.md#measurement-and-acceptance) | E–G: entry footprints, context/history/enrichment bounds, repeated edits, local slow consumers and disposal. | H: overlay bounds, web footprint/open-close cycles, HTTP serialization and browser slow consumers, including ML05. |
| [QT01–QT07](../../architecture/quick-testing.md#complementary-verification) | E–G: QT01/QT03, IPC parts of QT04, daemon parts of QT05 and relevant resource cases in QT07. | H: QT02/QT06, HTTP parts of QT04, web parts of QT05 and remaining resource cases in QT07. |

Browser-promise verification is a separate capability. Plan and implement its
algorithm explicitly before claiming it ran; the availability checker continues
to match declared promises according to the definitive rules.

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
Agree budgets from those measurements. Conservative recomputation may precede finer
invalidation; correct retained sessions and watching are required, while persistent
disk caches and worker pools require a demonstrated need.

Completion reports list implemented and executed capabilities, known failures,
source coverage, synchronization evidence and outstanding architectural acceptance
cases separately. Passing a subset of reference cases, or Ramify accepting its own
tree, does not establish completion of the daemon architecture.
