# Preparing Ramify for the project explorer

**Date:** 2026-09-07. **Status:** Source-reuse analysis. Process, client,
memory and testing decisions are defined in the [architecture documents](../architecture/README.md).

Ramify will reuse the project analysis and visualization experience currently
implemented in cucumber-viz, using declared Ramify modules and Ramify's analysis
results. Visualization will be implemented later. The immediate architectural
work is to preserve the data, query boundaries and module separation that let
that later client consume the engine without introducing another analyzer.

This analysis identifies source worth lifting, the assumptions that need to
change, and the provisions to review before implementing the backend. The
[architecture documents](../architecture/README.md) own runtime decisions and
the proposed module tree; the [tooling plan](../plans/tooling-architecture/README.md)
owns delivery order. This document supplies reuse evidence and adaptations.
It does not add initial UI modules, require browser transport in the first daemon
release, or establish implemented capabilities.

The [importability principles](../model/cross-module-importability.principles.md),
[glossary](../model/glossary.md),
[module-description format](../model/module-description.principles.md) and
[TypeScript interpretation](../model/typescript-source-interpretation.principles.md)
govern the data's meaning. Visualization introduces no additional import rules.

## Evidence and current implementation

The source investigation was performed on 2026-09-07; the enclosing repository
is at `fdb7b806c`. The findings combine a delegated inventory with independent
inspection of the request flow, aggregation, source interpretation, component
dependencies and daemon proposal. No application tests were executed for this
analysis. Source and test links below are migration references into the enclosing
cucumber-viz checkout. They are not dependencies of the future standalone Ramify
package; retain the relevant provenance when code is extracted.

There are three related data paths in cucumber-viz:

1. **The browser explorer** uses
   [ModuleArchitecturePage](../../../src/domain-sub-apps/module-architecture/ui/pages/ModuleArchitecturePage.tsx)
   to call `moduleArchitecture.analyze`. The
   [router](../../../src/domain-sub-apps/module-architecture/server/router/index.ts)
   invokes dependency-cruiser, then the
   [analyzer](../../../src/domain-sub-apps/module-architecture/core/analyzer.ts)
   and [module detector](../../../src/domain-sub-apps/module-architecture/core/module-detector.ts)
   infer modules from barrel enforcement rules. Results are enriched and cached.
2. **The shared structural graph** exposes a
   [ModuleGraphProvider](../../../src/core/shared/services/module-graph/vocabulary.ts).
   Its [path provider](../../../src/domain-sub-apps/module-architecture/core/path-based-module-graph-provider.ts)
   obtains structure through module discovery and the older public-contract
   catalog. It primarily serves planning and workflow consumers. It is not the
   explorer's data source, and its
   [finalizer](../../../src/core/shared/services/module-graph/finalize-module-graph.ts)
   requires an `index` surface.
3. **Live symbol rendering and module search** use
   [surface-renderer](../../../src/domain-sub-apps/module-architecture/core/surface-renderer.ts)
   and [module-search-service](../../../src/domain-sub-apps/module-architecture/core/module-search-service.ts).
   These combine existing discovery with additional source reads. Some extraction
   and output mechanisms are useful independently of the old module model.

Consequently, adding a Ramify implementation of the existing `ModuleGraphProvider`
would not migrate the explorer. Its
[analysis DTOs](../../../src/domain-sub-apps/module-architecture/core/types.ts)
also contain barrel categories, inferred classifications and aggregated usage
that need an explicit mapping to Ramify concepts.

The currently wired experience includes radial navigation, breadcrumbs,
filtering, out-of-view dependency nodes, module and edge selection, details,
export/signature inspection and contextual agent discussion. The
[graph wrapper](../../../src/domain-sub-apps/module-architecture/ui/components/ModuleGraph.tsx)
currently selects the radial implementation. Unused cards, violation summaries
and older mockups are not evidence of additional working views.

Some backend capabilities are only partly connected to this experience. Full
complexity is precomputed, but the page does not request its result and normally
shows an approximate score. Inline dependency usage in the module sidebar
receives an empty map; selected-edge inspection is the connected usage view.
Cached edge counts are requested before enrichment necessarily finishes, with
missing counts rendered as zero. These are limitations to address during reuse,
not behavior to preserve.

## What to lift from cucumber-viz

Lift cohesive behavior and its relevant tests into Ramify when that capability
is scheduled. Adapt its inputs to Ramify contracts and remove host imports.
The reusable UI should subsequently be consumable by cucumber-viz as well as
Ramify's standalone explorer.

| Source to inspect and lift | Reuse and required adaptation | Intended owner |
| --- | --- | --- |
| [ModuleArchitecturePageView](../../../src/domain-sub-apps/module-architecture/ui/pages/ModuleArchitecturePageView.tsx) | Preserve navigation, selection, resizable details, loading/error states and interaction behavior. Replace the old module DTO and move host chat/assignment dependencies behind injected UI actions or components. | Future `presentation/project-view` |
| [ModuleGraphRadial](../../../src/domain-sub-apps/module-architecture/ui/components/ModuleGraphRadial.tsx), [moduleGraphShared](../../../src/domain-sub-apps/module-architecture/ui/components/moduleGraphShared.ts) and [legend](../../../src/domain-sub-apps/module-architecture/ui/components/ModuleGraphLegend.tsx) | Preserve rendering, pan/zoom, minimap and ghost-node interaction. Rework graph grouping, filters, colors, counts and diagnostic styling around explicit Ramify data. | Future `presentation/project-view`; reusable geometry may belong to existing `layout` |
| [ExportList](../../../src/domain-sub-apps/module-architecture/ui/components/ExportList.tsx) and the page's module/edge detail rendering | Preserve expandable inventories, signatures, source locations and import-spelling display. Use original identities, aliases and exposure contracts instead of fixed barrel categories. | Future `presentation/project-view` |
| [ModuleArchitecturePage](../../../src/domain-sub-apps/module-architecture/ui/pages/ModuleArchitecturePage.tsx) | Reuse the container/view separation and selection lifecycle. Replace tRPC hooks, stale-event handling and enrichment requests with the Ramify service client and revision subscriptions. | Future `explorer` |
| [surface-declaration-extractor](../../../src/domain-sub-apps/module-architecture/core/surface-declaration-extractor.ts) | Adapt declaration-file batching, content-hash caching, overload/merge fragments, body-free signatures, JSDoc and explicit failures. Start from Ramify's resolved originals and read the requested revision's bytes. | Existing `analysis/typescript`, when enrichment is implemented |
| [surface-renderer](../../../src/domain-sub-apps/module-architecture/core/surface-renderer.ts) | Reuse names/summary/signatures/full detail levels and bounded output with explicit degradation. Replace discovery, barrel inventories and automatic vocabulary inlining. | Existing `analysis`, supported by `typescript` |
| [complexity-analyzer](../../../src/domain-sub-apps/module-architecture/core/complexity-analyzer.ts) | Reuse appropriate source measurements after specifying their units, coverage and aggregation. Obtain them through the source adapter; aggregate by exact ownership. | Existing `analysis/typescript` for source facts; `analysis` for module summaries |
| [module-search-executor](../../../src/domain-sub-apps/module-architecture/core/module-search-executor.ts), [coordinates](../../../src/domain-sub-apps/module-architecture/core/module-search-coordinates.ts) and [service](../../../src/domain-sub-apps/module-architecture/core/module-search-service.ts) | Reuse bounded search, coordinates, expansion and output-budget mechanisms when search is scheduled. Replace the ownership/availability profile and ensure source results match the requested revision. | Existing `analysis`, through project/source adapters |
| [moduleChatContext](../../../src/domain-sub-apps/module-architecture/ui/components/moduleChatContext.ts) and [useModuleArchitectureChat](../../../src/domain-sub-apps/module-architecture/ui/hooks/useModuleArchitectureChat.ts) | Reuse bounded module/edge context construction and discussion interactions. Inject the conversation integration; identify context and revision in each submitted selection. Host agent sessions remain an adapter responsibility. | Future `explorer` or consuming host, with UI slots in `project-view` |

The graph also depends on rules in the host's
[shared stylesheet](../../../ui/styles.css). Extract the required styles and
assets with the components so they can render independently of the host page.
Graph-framework objects belong inside presentation; they must not become engine
results or service schemas.

The following mechanisms need replacement rather than direct adoption:

- Cruiser execution, barrel-rule module discovery and mandatory surface entries.
- The [edge-usage extractor](../../../src/domain-sub-apps/module-architecture/core/edge-usage.ts)
  as an authority for source interpretation. It scans static import declarations,
  labels exact barrel targets as public, and skips unresolved targets. Ramify
  already requires original-binding, resource and selected-access semantics.
- The [global architecture cache](../../../src/domain-sub-apps/module-architecture/core/architecture-cache.service.ts),
  module-pair-only enrichment keys and stale-only watcher behavior. The daemon
  owns isolated contexts, input synchronization and revision publication.
- The existing [module-search profile](../../../src/domain-sub-apps/module-architecture/core/module-search-profile.ts)
  as an access model. Descendant source is not the caller's own source, observed
  imports do not establish availability, and search/read scope is not import or
  write permission.

## Architectural provisions to make now

### Preserve facts that several clients can query

Analysis should retain enough structured evidence for CLI, agent and eventual
visualization queries, instead of reducing its output to formatted errors.
Review these information families in the initial contract work:

| Information | Required meaning |
| --- | --- |
| Ownership | Declared module identity, physical location, parent/children, exact file ownership and source-area classification. Module identity is not an inferred path-prefix group. |
| Documentation | README path, extracted purpose and explicit missing-documentation state. No fallback to a parent's prose or barrel comment. |
| Contracts | Original binding/resource identities, names and aliases, defining owner/area, tags, expanded exposures and their declaration evidence. |
| Observed accesses | Source occurrence, written form and specifier, resolved source/resource target, selected original where known, checked value/type form and relevant origin evidence. |
| Decisions and coverage | The checker result attached to that occurrence, its explanation, and unresolved/unsupported or unavailable-stage information. |
| Optional details | Signatures, documentation fragments and metrics, with revision, scope, coverage and completion status. Their absence is distinguishable from an empty result or measured zero. |

An observed file dependency and a dependency on an original binding can have
different targets: an import may pass through a forwarding file owned by one
module to reach a binding owned by another. Preserve both facts. Exposure routes
explain permission; they are not additional observed imports. A graph query must
declare which relation it aggregates and retain links back to its evidence.

Known denied accesses remain visible as observed dependencies. Conversely, an
available export remains discoverable when no source imports it yet. Source
inspection and availability queries share identities and evidence with checking;
the explorer must not implement a competing permission evaluator.

This is a requirement on semantic contracts and retained information. It does
not require implementing every graph query, metric or search mode in the first
milestone, or publishing the entire compiler state as a service response.

### Keep ownership separate from display aggregation

The current detector collects files by module-directory prefix, including files
owned by nested modules. Ramify should count each application file under its
single declared owner, then derive subtree totals and cross-subtree dependencies
as explicit rollups. A collapsed node can summarize descendants without turning
their files into the parent's own source. Aggregation must avoid counting the
same occurrence or original repeatedly through intermediate ancestors.

The existing "method count" counts imported names, not calls or necessarily
methods. Future metrics should specify whether they count source occurrences,
distinct originals, files or neighboring modules, and whether their scope is
owned source or a subtree. Approximate complexity scores need a named formula
and normalization scope; they are analytical aids, not Ramify rule violations.

Production/testing filters use the actual source classification, including
testing modules' ordinary `src/`. Coverage limits accompany totals when relevant.
A filtered or collapsed view preserves drill-down evidence even when several
underlying edges become one displayed edge.

Pure module/usage aggregation belongs with `analysis`; pixel layout, grouping
controls and selection state belong with presentation. No additional analysis
owner is required merely to reserve a future graph feature.

### Make queries independent of UI and transport

The existing module-inspection and explanation contracts should support later
bounded queries for hierarchy, contracts, incoming/outgoing usage, source
occurrences and optional details. Query arguments identify a context, revision,
scope and requested detail. Availability also identifies a consumer file or
owner/source area and binding form. A proposed import spelling must receive the
same source-origin checks as actual code.

Keep semantic result vocabulary with its defining analysis owner. Root owns the
dispatch-facing service contract, as proposed in the daemon architecture. An
adapter serializes results and routes operations; it does not rediscover modules,
read a separate set of source bytes or maintain another semantic cache.

Review how large results can be scoped, paged or expanded without baking a
particular graph library or web framework into these contracts. A detail request
should identify stored modules/occurrences, rather than accept client-provided
file lists that redefine the evidence being queried.

### Carry revision identity through optional work

The daemon already proposes immutable publication and isolated worktree contexts.
Apply those guarantees to descriptions, contracts, usage and enrichment as well
as diagnostics. Any derived-result cache is scoped by the context/generation,
revision and relevant query arguments. Enrichment reads that revision's inputs,
even if files on disk have changed since the overview was requested.

A future explorer can display the latest published revision while another is
being analyzed, then update its overview and details consistently. Old work must
not overwrite newer selections or appear under a newer revision. An evicted
revision returns unavailable; an invalid current model never silently becomes
the last valid model. Reconnection can obtain a complete current snapshot.

Contract review should include how clients discover completed enrichment, either
through completion of its request or an identified notification. This avoids the
current one-time edge-count request missing later precomputation results.
The existing [precomputation scheduler](../../../src/domain-sub-apps/module-architecture/core/precomputation.ts)
provides useful batching/cancellation examples, but its cache and publication
semantics need the daemon's revision discipline.

Required semantic work stays on the checking path. Resolving an unmarked
interface or an interface-file wildcard cannot become optional just because
rendering a signature can be deferred.

## Future visualization boundaries

The later owners are defined in the [daemon ownership proposal](../architecture/daemon.md#ramifys-ownership-tree)
and [process architecture](../architecture/processes-and-clients.md#modules-and-executable-entry-points).
The table maps the extraction work to those owners without adding empty modules
to the initial tree. Each slash denotes a child under its parent's `subs/`.

| Future owner | Responsibility and boundary |
| --- | --- |
| `presentation/project-view [ui, browser]` | Extracted project graph and details, receiving neutral analysis data and UI-owned props/callbacks. It imports no service client, host agent session or filesystem implementation. Existing teaching diagrams remain separately organized under `presentation`; geometry can use `layout` through an explicit relay. |
| `explorer [ui, browser, dispatch]` | Root child containing the connected browser application: context selection, queries, notifications and coordinated view state. It supplies data and actions to presentation. Browser connection code belongs here initially. |
| `service-api [dispatch]` | Root child running the separate, on-demand Express/tRPC web process and event adapter. It connects to the daemon's existing contexts through the local client, with bounded connection/request state. |

The [process decision](../architecture/processes-and-clients.md) selects direct
local IPC for ordinary CLI commands and a separate tRPC web process for the
browser. That web process is started when visualization is used and exits after
its clients leave and its idle grace period expires. Built assets are served
without retaining Vite in the daemon. Web implementation remains later work;
the shared service contract and memory boundaries are reviewed now.

Root relays selected analysis vocabulary to clients. `project-view` exposes its
UI contract upward through presentation; root can relay it to descendants through
declarations without importing UI values into its dispatch-only source. The
explorer is a sibling of the daemon, and browser ancestry is unnecessary for
receiving those components.

Presentation props defined in UI source retain `ui`; service vocabulary retains
`dispatch`. The pure view therefore consumes neutral analysis types and UI-owned
callbacks, while the connected explorer adapts service results. Browser-consumed
values need explicit browser promises. Foreign types that consumers import need
their own exposure routes; an owned `src/interfaces/` wildcard cannot claim
foreign originals. These are applications of existing rules, not new exceptions.

The extracted view should work both inside Ramify's explorer and inside a
consuming application. Preserve the module/edge discussion affordance through
an injected integration. cucumber-viz can supply its existing chat panel and
session behavior; a standalone conversation adapter can be added separately.
Agent launching, workflow execution and write authorization do not become
responsibilities of the analysis engine or reusable graph.

## Adapting the user experience later

Preserve the existing interactions while making the displayed concepts precise:

- Open the explicit Ramify root's children as the project overview, with the
  root selectable and its own source inspectable. Showing only parentless nodes
  would otherwise reduce every project overview to one node.
- Distinguish owned-source information from subtree summaries in details.
  Collapsed groups are view objects, not extra Ramify owners.
- Use tags and the registry for classification filters. Display README purpose
  as documentation, rather than imposing the host's closed purpose categories.
- Distinguish modules outside the current view from third-party targets and
  unresolved targets. Unknown resolution must not appear as a known external.
- Show expanded exposure contracts, aliases and original identity in place of
  fixed `index`/`client`/`vocabulary` categories and export-name-only merging.
  Rendering related declarations does not automatically expose associated types.
- Replace public/deep-import legality cues with actual decisions and explanations.
  Show the consumer's source area and checked binding form when they affect the
  result. Keep the written import spelling available for inspection.
- Preserve graph/detail navigation and discussion selection across revisions
  when identities still exist; explicitly handle removal or invalidation.

## Quick-testing and web-adapter source

The chosen [quick-testing architecture](../architecture/quick-testing.md) reuses
the following patterns while keeping their implementations inside Ramify:

| Source | Extraction boundary |
| --- | --- |
| [tRPC setup](../../../src/server/trpc.ts) and [context factory](../../../src/server/context.ts) | Reuse router/context construction and input/error mapping patterns with a small injected analysis-service contract. Remove host capability gates and service requirements. |
| [Direct caller link](../../../src/core/shared/__test-helpers__/cucumber/workflow-world.ts) | Lift the small `createDirectCallerLink` mechanism with synchronous-error handling. Supply disposal/cancellation behavior required by Ramify. Do not lift the complete workflow world or its global state. |
| [Message channels](../../../src/server/websocket.ts) | Reuse the production/direct-channel abstraction and event delivery pattern. Replace host message types and add bounded buffers, slow-consumer recovery and reliable cleanup. |
| [Quick-mode guide](../../../docs/architecture/quick-mode-e2e-testing.md) | Reuse real route/hooks/router/services over temporary files, substituting transport boundaries. Adapt the harness to inject real Ramify contexts in-process and keep actual wire/process tests separate. |
| [Web startup](../../../src/server/orchestration/start-server.ts) | Use as an inventory of HTTP/tRPC mounting and shutdown responsibilities. Rebuild small Ramify assembly instead of copying Vite startup, the broad router/service registry or host integrations. |

The [memory analysis](../architecture/memory-lifecycle.md#initial-setup-probe)
records the limited startup probe behind the process decision. Runtime footprint
and ballooning must be measured on Ramify's implemented entry points and repeated
workloads; host behavior is not proof of the new budgets.
Those initial figures are historical observations without a checked-in executable
recipe. Use the [repeatable probe](../architecture/memory-lifecycle.md#repeatable-setup-measurements)
for new setup evidence and retain actual-entry/workload measurements separately.

## Delivery and review evidence

During the tooling plan's **architecture and contract review**, cover the retained
facts, query boundaries, vocabulary ownership and revision behavior above. During
engine implementation, expose the implemented semantic queries programmatically
and through the clients already being delivered. Useful headless witnesses are:

1. Exact-owner and subtree queries agree on underlying occurrences without
   double-counting nested modules.
2. An illegal observed import remains in usage results; an unused available
   export appears in contract/availability queries.
3. Original-binding and resolved-path evidence explain aliases, testing-origin
   restrictions and unmarked interfaces consistently with the checker.
4. A delayed detail result cannot join another worktree or a newer revision;
   missing enrichment and expired revisions remain explicit.
5. Description edits, wildcard growth and declaration changes update the
   relevant query results after publication.
6. Equivalent batch and retained-session inputs produce equivalent semantic
   queries, with unavailable capabilities reported explicitly.

These extend the use of DA03, DA04, DA07, DA08, DA10 and DA12–DA15 in the
[daemon acceptance requirements](../architecture/daemon.md#acceptance-evidence).
They do not depend on React, a browser bridge or an extracted graph component.
Exact query delivery follows the implemented capabilities; missing operations
must remain explicit.

During the **later visualization phase**, implement the additional owners and
transport, lift the components and styles, connect the revisioned queries, then
adapt meaningful tests from these sources:

- [Page view tests](../../../src/domain-sub-apps/module-architecture/ui/pages/ModuleArchitecturePageView.test.tsx),
  [shared graph tests](../../../src/domain-sub-apps/module-architecture/ui/components/moduleGraphShared.test.ts)
  and [graph tests](../../../src/domain-sub-apps/module-architecture/ui/components/ModuleGraph.test.tsx).
- [Explorer workflow](../../../src/domain-sub-apps/module-architecture/feature-tests/module-architecture-happy-path.viz.feature)
  and [out-of-view dependency controls](../../../src/domain-sub-apps/module-architecture/feature-tests/module-architecture-external-imports-control.viz.feature).
- [Declaration extraction tests](../../../src/domain-sub-apps/module-architecture/core/surface-declaration-extractor.test.ts)
  and [complexity tests](../../../src/domain-sub-apps/module-architecture/core/complexity-analyzer.test.ts)
  for the backend pieces actually reused.

Preserve test intent while replacing host assumptions and runner dependencies.
Add witnesses for the single-root overview, own/subtree distinctions, collapsed
edge drill-down, revision consistency, missing-versus-zero metrics and independent
rendering without host services or global styles. Ramify's reference project
provides the declared modules and independent expected permission outcomes.

The browser UI, graph framework, detailed metric selection and standalone
conversation provider can all wait. The separate web process, tRPC delivery and
quick-testing pattern are selected; exact wire schemas and their implementation
remain later work. Their information comes from the same owned, explainable,
revisioned analysis that powers enforcement.
