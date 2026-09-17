# Project modularity baseline and redesign analysis

**Date:** 2026-09-17. **Status:** Measured analysis and redesign proposal;
no module restructuring or metric contract is approved by this document.

**Revision:** `d5c249828e42121b7cc9532e8a3460b548da3d07`. The worktree was clean
when the analysis ran.

Every measured count in the current baseline, redesign candidates and the
co-change sample refers to that revision. At this document's 2026-09-17 review,
HEAD was `277ddfe`, three commits later. Plans 6B and 6C had added resident project
binding and module-tree work, including `service-api/src/project-binding.ts`
and changes to the router, web process, launcher and explorer. The historical
baseline remains reproducible evidence, but it must be rerun at the revision
under review before any redesign decision is accepted.

## Purpose

Assess Ramify's current module structure using the project's own analysis
facts and repository history, identify which cohesion and coupling measures
can be computed without another analyzer, and propose how to evaluate a better
design before moving source.

The target is a module tree whose modules are highly cohesive internally and
loosely coupled externally. No single number establishes that property. A
stable model owner, a composition parent and a connected adapter have
different useful coupling shapes, so this analysis keeps the underlying
measures separate and interprets them in context.

## Executive assessment

Ramify already retains enough data for a useful structural modularity
analysis. A fresh batch check completed with full coverage and no violations,
warnings, outside-module files or source-analysis limits. Its production graph
has 14 modules, 183 ordinary source files, 2,051 application access
occurrences and 46 distinct directed cross-module owner pairs. Of those
application occurrences, 1,358 stay within one exact owner and 693 cross an
owner boundary.

The most important architectural result is that the production graph has no
runtime dependency cycle. Two strongly connected components appear only when
type-only dependencies are included. One is deliberate dependency inversion
around root-owned service contracts. The other is a smaller type-contract knot
among the descriptions, project and TypeScript analysis children and deserves
review, but not an automatic shared module.

The hierarchy materially changes the interpretation of coupling. The analysis
owner has only 53.2% exact-owner locality because it composes its four children,
but its five-module subtree has 100% locality: the subtree has no outgoing
application dependency. Presentation similarly rises from 77.6% exact-owner
locality to 89.7% as a subtree, and daemon from 58.4% to 77.9%. Exact-owner
fan-out alone is therefore not an adequate cohesion measure for Ramify.

The first redesign work should be counterfactual rather than physical. A pure
projection can remap files to candidate owners in memory and recompute the
same measures. The best initial candidates to test are a retained-session child
of analysis and a separation of pure explorer projection from web/process
hosting in service-api. The model, project, TypeScript and layout boundaries
currently look strong and should remain controls.

## Evidence and method

The baseline command was:

```sh
./dist/src/ramify check --batch --root . --format json
```

The completed `ramify.analysis/1` report is the primary evidence. Its snapshot
contains the project inventory, source areas, captured inputs, export catalog,
linked descriptions, resolved model, source accesses and access results. See
the implemented
[`AnalysisSnapshot`](../../subs/analysis/src/interfaces/analysis.ts) and
[`AnalysisReport`](../../subs/analysis/src/interfaces/analysis.ts) contracts.

The production subset used for the modularity calculations includes ordinary
inventory files whose kind is `source` and whose profile is not
testing-classified. It excludes resources, module-owned test areas and the
ordinary source of the testing-classified `integration-tests` module. The
external-access count uses the same importer filter. Test coupling remains
available for a separate view; it is not mixed into the production scores
below.

One `SourceAccess` is one syntactic access occurrence even when it selects
several symbols. Distinct-symbol measures use non-null original/name pairs.
Cross-module edges group occurrences by ordered `consumer -> provider` owner
pair, where the provider is the target file's owner. These are the same units
used by the module-only explorer. Package, builtin, outside-module, unresolved
and same-owner accesses remain available in the analysis report even though
the explorer omits them.

Git co-change evidence was computed from current module source paths over the
118 commits in history that change source owned by at least one current module.
It excludes documentation and root configuration. This history is secondary
evidence: much of Ramify was delivered in iteration-sized or omnibus commits,
and the explorer-related owners exist in only one source-changing commit.

No persistent analysis artifact or new metric implementation was written for
this baseline. The reported derived values came from read-only projections of
the batch JSON and Git history.

## Available data

### Project and ownership facts

The inventory supplies:

- declared module ID, name, parent, directory and header tags;
- ordinary and testing source areas;
- purpose prose or its explicit absence;
- owned source/resource paths, byte sizes and content hashes;
- compiler-selected source outside every module; and
- exact description references and project scope.

The implemented contract is
[`ProjectInventory`](../../subs/analysis/subs/project/src/interfaces/project.ts).
These facts support owner and subtree size, context-size, documentation and
change-identity measures.

### Source and dependency facts

Each source access supplies:

- importer file and source area;
- application, external, outside-module or unresolved target;
- target file and source area for application targets;
- written and selection forms;
- whether the access loads at runtime;
- selected exported/local names and original identities;
- value/type request, forwarding origins and source locations; and
- attached coverage-limit identities.

The implemented contracts are
[`SourceAccess`](../../subs/analysis/subs/typescript/src/interfaces/source.ts)
and [`SourceLimit`](../../subs/analysis/subs/typescript/src/interfaces/source.ts).
They support exact and weighted dependency graphs, runtime/type separation,
symbol breadth, file-pair dispersion, cycle analysis and complete-versus-partial
status.

The current report does not say whether a selected imported binding is ever
referenced, whether a reference is in a type or value position, or whether the
referenced value is behavior-capable. It therefore cannot exclude unused
imports or produce the behavioral/non-behavioral estimate without additional
compiler-backed evidence. [Execution step 2](#2-add-opt-in-behavioral-evidence)
defines that enrichment and keeps it outside live checks.

### Interface facts

The catalog and resolved model supply original ownership, declarations,
value/type capability, export aliases, tags, exposure direction, effective
exposure paths, forwarding providers and evidence locations. They support
interface-size and repository-consumption measures. Retained symbol details can
add bounded signatures and first documentation paragraphs when a human needs
to inspect a candidate contract; they are not needed to compute the structural
metrics.

### Existing explorer projection

The explorer already projects cross-owner application accesses from a completed
report and calculates owned/subtree files, dependencies, dependents, access
occurrences, selected symbols, denied accesses and limited accesses. See the
implemented
[`ExplorerMetrics`](../../subs/presentation/subs/project-view/src/interfaces/project-view.ts)
and [projection](../../subs/service-api/src/project-view.ts).

Its current edge is an ordered pair of importer owner and target-file owner,
created by one or more cross-owner `SourceAccess` occurrences. Edge thickness is
based on occurrence count. That is not the behavioral dependency unit: a
forwarded original may have a different owner from the target file, one access
may select several originals, and an imported selection may never be
referenced. The behavioral diagram therefore requires a semantic replacement
of the edge evidence and weight, not a client-side filter over the current
edges. The default projection retains the target-file owner as its endpoint;
an alternate projection groups the same used-symbol facts by original owner.

Its `approximateIcs` is not a cohesion or modularity score. It is only:

```text
raw = 0.5 * ownedFiles + 0.5 * dependencies
approximateIcs = raw / max(raw across displayed modules)
```

That fallback remains useful for relative node sizing, but should not guide a
redesign.

### Additional repository data

Git can add file/module change frequency, co-change counts and change-affinity
ratios. Tests and measurements can add execution time and affected-module
evidence when those mappings exist. Neither is part of `AnalysisReport`, so
they need separate adapters and provenance. Source edges are not a test
executor or a runtime call graph.

## Current baseline

### Whole completed report

| Measure | Result |
| --- | ---: |
| Modules/owners | 15 |
| Owned source files | 339 |
| Owned resources | 9 |
| Defined originals | 946 |
| Source access occurrences | 4,613 |
| Allowed decisions | 3,175 |
| External outcomes | 1,438 |
| Denied decisions | 0 |
| Diagnostics | 0 |
| Warnings | 0 |
| Coverage notes | 0 |

The report execution completed, the check passed and coverage was complete.

### Production dependency graph

| Measure | Result |
| --- | ---: |
| Non-testing modules | 14 |
| Ordinary production source files | 183 |
| Application access occurrences | 2,051 |
| Same-owner application occurrences | 1,358 |
| Cross-module application occurrences | 693 |
| Distinct directed module edges | 46 |
| External package/builtin occurrences | 436 |

Overall exact-owner application locality is 66.2%. This aggregate is a
baseline, not a target: the result mixes stable providers, orchestrators and
adapters.

### Largest cross-module edges

| Consumer | Provider | Occurrences | Runtime | Distinct selected symbols | File pairs |
| --- | --- | ---: | ---: | ---: | ---: |
| `analysis` | `analysis/project` | 75 | 7 | 27 | 22 |
| `analysis` | `analysis/model` | 74 | 17 | 32 | 21 |
| `daemon` | `daemon/contexts` | 65 | 1 | 42 | 9 |
| `analysis` | `analysis/typescript` | 61 | 3 | 25 | 17 |
| `presentation` | `presentation/layout` | 45 | 45 | 26 | 8 |
| `ramify` | `daemon` | 42 | 11 | 33 | 21 |
| `analysis` | `analysis/descriptions` | 36 | 8 | 15 | 21 |
| `daemon` | `ramify` | 34 | 0 | 17 | 6 |
| `presentation` | `analysis/model` | 32 | 21 | 22 | 2 |

The first seven rows are parent-to-child composition. Treating their size as
inherently undesirable would work against the declared hierarchy. The
`daemon -> ramify` row is type-only and implements dependency inversion around
root-owned service vocabulary; the reverse edge contains the runtime assembly.

### Exact-owner and subtree locality

Boundary locality is initially defined as:

```text
internal application access occurrences
---------------------------------------------------------------
internal application occurrences + outgoing module occurrences
```

For an exact owner, internal means both files have that owner. For a subtree,
internal means both owners are within the selected subtree. Incoming accesses
are reported separately rather than added to the denominator: a stable
provider can be highly cohesive while having many consumers.

| Module | Exact locality | Subtree locality | Dependencies | Dependents | Interpretation |
| --- | ---: | ---: | ---: | ---: | --- |
| `analysis/model` | 100% | 100% | 0 | 8 | Stable foundational model |
| `presentation/layout` | 100% | 100% | 0 | 1 | Cohesive layout provider |
| `analysis/project` | 97.4% | 97.4% | 1 | 9 | Cohesive acquisition provider |
| `analysis/typescript` | 80.1% | 80.1% | 2 | 7 | Cohesive compiler adapter |
| `presentation` | 77.6% | 89.7% | 2 | 0 | Two visual children contribute to a cohesive subtree |
| `daemon/contexts` | 65.4% | 65.4% | 3 | 4 | Focused provider with substantial consumers |
| `presentation/project-view` | 62.8% | 62.8% | 4 | 1 | Focused project-view child with one declaration isolate |
| `cli` | 59.3% | 59.3% | 6 | 1 | Command adapter with broad provider use |
| `daemon` | 58.4% | 77.9% | 4 | 3 | Parent/child composition explains much fan-out |
| `analysis` | 53.2% | 100% | 4 | 5 | Closed five-module analysis subsystem |
| `analysis/descriptions` | 51.4% | 51.4% | 3 | 2 | Small type-contract knot merits review |
| `ramify` | 28.1% | 100% | 6 | 3 | Composition root wires the complete project subtree |
| `service-api` | 27.8% | 27.8% | 7 | 2 | Broad adapter with two named responsibilities |
| `explorer` | 15.8% | 15.8% | 4 | 0 | Small connected browser adapter |

The table lists all 14 production modules. Low locality does not by itself mean
low cohesion. Root's 28.1% exact locality resembles service-api's 27.8%, but root
is the composition owner that wires six providers and its complete subtree is
closed; its low exact locality is expected. The explorer has only three
production files and one purpose: connecting the browser view to the local
revision-qualified service. Splitting it would add boundaries without reducing
responsibility. At the baseline revision, service-api both projects analysis
reports and hosts the local tRPC application, so its low locality and dependency
breadth support a counterfactual split experiment. Presentation's subtree
includes both `layout` and `project-view`; neither child should disappear from
the interpretation of its 89.7% subtree locality.

### Stability

For a module with `Ce` distinct providers and `Ca` distinct consumers, the
initial instability measure is:

```text
instability = Ce / (Ca + Ce)
```

`analysis/model` is 0%, `analysis/project` 10%, `analysis/typescript` 22.2%,
`daemon/contexts` 42.9%, `daemon` 57.1%, `service-api` 77.8% when the
testing-classified consumer is excluded, and `explorer` 100%. This direction is
appropriate: model and project are stable providers, while explorer is a leaf
adapter. Instability becomes concerning when dependencies point from a stable
core toward a volatile adapter, not merely when its value is high.

### Cycles

There is no strongly connected component in the runtime-load graph.

The graph including type-only accesses has two nontrivial components:

1. `analysis/descriptions`, `analysis/project`, `analysis/typescript`.
2. `ramify`, `cli`, `daemon`, `service-api`.

The first component is closed by these type-only edges:

| Consumer | Provider | Occurrences | Main reason |
| --- | --- | ---: | --- |
| `analysis/descriptions` | `analysis/project` | 1 | Linking input vocabulary |
| `analysis/descriptions` | `analysis/typescript` | 1 | Source catalog vocabulary |
| `analysis/project` | `analysis/descriptions` | 3 | Parser and parsed-description ports |
| `analysis/typescript` | `analysis/project` | 11 | Captured project/input-view ports |

These contracts reflect real collaboration between acquisition, description
linking and compiler interpretation. Moving every type to a generic shared
owner would erase useful ownership. The review question is narrower: whether a
small neutral port belongs at the nearest common parent and reduces dependency
breadth without becoming a catch-all vocabulary.

The second component is dominated by dependency inversion. For example,
`ramify -> daemon` has 42 occurrences, 11 of them runtime, while
`daemon -> ramify` has 34 and all are type-only. Root assembles the daemon; the
daemon implements service vocabulary owned by root. It should not be treated
as a runtime cycle or automatically eliminated.

### Internal connectedness

An undirected file graph was built from same-owner application accesses. This
is a reachability signal, not semantic cohesion: entry files and public
interfaces can be useful isolates.

- `analysis/model`, `analysis/project`, `analysis/typescript`, `cli`,
  `presentation` and `presentation/layout` each have every production file in
  one connected component.
- `analysis` has 28 of 29 files in its largest component.
- `daemon` has 20 of 22 files in its largest component.
- root has 14 of 16 files in its largest component.
- `service-api` and `explorer` each have all production files connected.
- `presentation/project-view` has seven of eight files in its largest
  component; its isolated `styles.d.ts` is a declaration shim with no imports
  to or from another file.

The result does not reveal a disconnected production island that demands an
immediate move.

### Interface economy

The initial repository-use measure is:

```text
effectively exposed owned originals selected by another module
----------------------------------------------------------------
effectively exposed owned originals
```

This is only repository-local utilization. It is not evidence that an
unselected public original is unnecessary; external package consumers,
independent compiler scopes and future clients are absent from the graph.

The strongest internal utilization appears in `analysis/model` (35 of 35),
`analysis/project` (28 of 28), `analysis/descriptions` (15 of 15),
`daemon/contexts` (42 of 46) and `analysis/typescript` (25 of 29). Analysis,
at 25 of 51, and daemon, at 18 of 38, are near 47-49%; service-api is lower at
8 of 21, or 38%. Those wider surfaces are candidates for manual contract review,
not automatic deletion. Presentation is the clearest control: none of its 22
exposed originals is selected by another module in the toolkit analysis, but
the independent site is a real consumer.

### Change affinity

For modules `A` and `B`, the exploratory co-change measure is the Jaccard ratio:

```text
commits changing both A and B
---------------------------------------------------------
commits changing A or B
```

Older module pairs with a nontrivial shared sample include:

| Pair | Shared commits | Jaccard |
| --- | ---: | ---: |
| `daemon`, `daemon/contexts` | 13 | 0.382 |
| `analysis`, `analysis/project` | 16 | 0.286 |
| `analysis`, `analysis/typescript` | 16 | 0.258 |
| `analysis/descriptions`, `analysis/typescript` | 9 | 0.220 |
| `ramify`, `cli` | 9 | 0.205 |

Parent/child pairs are expected to change together while they are being built,
so these values do not argue for a merge by themselves. The four explorer-era
owners—`explorer`, `service-api`, `presentation/project-view` and
`integration-tests`—each have one source-changing commit and produce
meaningless perfect affinities. The same minimum-sample warning applies to
`presentation`, with three source-changing commits, and `presentation/layout`,
with two. Future reporting should require both a minimum number of commits per
owner and a minimum shared count before presenting change affinity as a design
signal.

## Proposed metric contract

Do not replace the current approximate complexity with another opaque score.
Expose a set of named measures whose units remain visible.

### 1. Boundary locality

Compute exact-owner and subtree locality at every module. Provide production,
test, runtime and type-only filters. Show internal and outgoing occurrence
counts beside the ratio so a small sample cannot look authoritative.

### 2. Contract breadth

For each boundary and ordered edge, retain:

- distinct provider/consumer modules;
- access occurrences;
- distinct selected original/name pairs;
- distinct consumer and provider files; and
- distinct consumer/provider file pairs.

This distinguishes a focused, frequently used contract from many files reaching
broadly across a boundary.

### 3. Interface economy

Report exposed original count and repository-selected exposed original count,
split by exposure destination and value/type capability. Label the ratio
`repository interface use`, not unused API. Add known independent consumers as
separate analysis scopes rather than assuming their absence means zero use.

### 4. Behavioral dependency estimate

Use the definitions in the
[dependency glossary](../architecture/dependency-glossary.md). Count one symbol
dependency for each distinct `(consumer module, original symbol)` pair. Repeated
references, import sites and aliases in one consumer count once; two consumers
of the same original count once each.

Exclude same-owner selections, imported symbols with no identified reference,
symbol-free loads and unknown classifications. Classify a referenced dependency
as behavioral when any value-position reference uses a behavior-capable symbol;
otherwise classify its type, data and forwarding evidence as non-behavioral.
Behavioral evidence wins for a mixed-evidence dependency.

For each exact consumer module and for the production project total, publish
only these headline measures:

```ts
interface BehavioralDependencyMetrics {
  readonly behavioralDependencies: number;
  readonly nonBehavioralDependencies: number;
}
```

Confidence or evidence strength may remain an internal implementation detail.
Unknown classifications affect coverage and neither headline count; they do
not create a third public metric.

The diagram may aggregate the same behavioral/non-behavioral classification by
imported-module boundary and by original-owner edge. Those projections do not
add a third dependency classification. Imported-boundary edge counts use the
boundary-specific unit defined below and are not substitutes for the
project/module headline count.

### 5. Stability direction

Report afferent/efferent module counts and instability with runtime/type
variants. Flag an edge only when a comparatively stable consumer depends on a
more volatile provider and the direction conflicts with the intended role.

### 6. Cycle structure

Report runtime and type-only strongly connected components separately. For
each component, include the access occurrences, files, selected symbols and
shortest cycle witnesses. Runtime cycles should have the highest default
priority; type-only cycles require contract-ownership review.

### 7. Internal connectedness

Report component count, largest-component file coverage and isolates for each
exact owner. Keep this diagnostic separate from boundary locality and show the
isolated file roles before recommending a move.

### 8. Change affinity

Compute repository-history evidence through a separate Git adapter with the
commit range, path mapping and thresholds recorded. Show raw counts with the
ratio. Do not blend staged plan-delivery commits with runtime/source coupling
without an explicit filter.

### 9. Context size

Report owned and subtree files, bytes, originals, exposed originals and source
accesses. Context size is a first-class design constraint for agent work even
when dependency cohesion is already good.

### Coverage and provenance

Every metric result must carry the report revision/input identity and coverage
state. A metric affected by an unresolved target, incomplete export set or
omitted scope is partial, never measured zero. Git-derived and runtime-derived
facts carry their own provenance because they are not part of the source
analysis revision.

## Proposed dependency diagram

The implementation follow-up is
[Plan 6D: Behavioral dependency diagram](../plans/iteration-6d-behavioral-dependency-diagram/main-plan.md).
The complementary provider-side and agentic feature-planning workflow is
analyzed in
[Code-derived capability discovery for project architecture](2026-09-17-code-derived-capability-architecture.md).

### Default and optional views

The analysis diagram should default to a **behavioral, imported-module** view.
For an import by `A-A-A` that resolves to a file owned by `B`, where `B`
forwards an original owned by `B-A-A`, the default link is `A-A-A -> B`.
This represents the consumer-facing module boundary selected in source. The
behavioral classification still comes from the referenced original and its
behavior capability.

The imported module is the owner of the resolved source target named by the
consumer's import. It is the immediate source boundary, not every module in a
forwarding or exposure chain. Ramify still records `B-A-A` as the original
owner; choosing `B` as the displayed endpoint does not transfer ownership.

Add two independent controls:

```text
[ ] Show non-behavioral dependencies
Link targets: [ Imported modules ] [ Original owners ]
```

The non-behavioral setting is off by default. `Imported modules` is the default
link target. Use a segmented choice for link targets rather than a checkbox:
the two projections are alternatives, not two sets of dependency arrows to
overlay. Place both in a small “Dependencies” control group beside, but
visually separate from, the existing declared-tag filters. They change relation
evidence and endpoint attribution rather than module membership and should not
be buried in the selection-dependent information panel.

Turning it on adds the classified non-behavioral evidence to the same graph. It
does not replace the behavioral view. The resulting rules are:

| Setting | Link exists when | Link weight within the selected projection |
| --- | --- | --- |
| Off | behavioral count is greater than zero | behavioral classified count |
| On | behavioral plus non-behavioral count is greater than zero | total classified count |

The headline totals use the glossary's distinct
`(consumer module, original symbol)` unit. Edge weights use the selected
projection's unit below. Repeated references and aliases through the same
imported module do not thicken a link. Imported but unreferenced symbols,
symbol-free loads and unknown classifications create no link in either
behavioral setting. Unknown classifications still make coverage partial.

Endpoint attribution has two projections:

| Link target | Grouping | Interpretation |
| --- | --- | --- |
| Imported modules | distinct `(consumer, imported module, original)` facts grouped by `consumer -> imported module` | Contract/source boundary the consumer selected |
| Original owners | distinct `(consumer, original)` dependencies grouped by `consumer -> original owner` | Module that implements or defines the selected original |

If one consumer references the same original through both `B` and `C`, the
headline project/module count remains one while the default diagram shows both
boundary links. That is useful evidence that the consumer relies on two import
surfaces. Imported-boundary edge counts therefore need not sum to the headline
count and must be labeled “used originals via this boundary.” Original-owner
edge counts do sum to the headline count within the same scope and coverage.
Do not choose one arbitrary boundary merely to force additivity, and do not
change the agreed headline unit to `(consumer, imported module, original)`.

An edge supported by any behavioral classified fact uses the standard solid
arrow. A non-behavioral-only edge, visible only when the setting is on, uses a
muted dotted arrow. Keep allowed, denied and limited status in color and badges
rather than also using the line pattern for status. A mixed edge remains solid
and its exact behavioral and non-behavioral counts appear in its tooltip and
detail panel. Use a bounded logarithmic width scale based on the displayed
classified count so one high-count edge does not dominate the canvas.

The behavioral setting affects edge visibility and weight. The link-target
choice changes endpoints, edge IDs, the displayed-link count and out-of-view
related modules. Neither changes the two headline counts in the information
panel. If a selected edge is absent after either change, clear that selection;
otherwise reconcile it only to an edge with the same projection-specific ID.

Keep node size stable while either control changes. The current
`approximateIcs` includes a provider-module count from the old access graph and
should not control this diagram. Use a simple owned-file size scale initially;
later modularity metrics may replace it only under a separately reviewed visual
encoding.

### Right-hand information panel

Keep the two requested headline dependency counts visually primary at project
and consumer-module scopes. Original-owner edges use the same labels and unit;
imported-module edges use the explicit “used originals via this boundary”
labels because their counts may overlap. Do not show confidence percentages or
a behavioral ratio. A short help label should say: “One headline dependency per
consumer module and referenced original symbol.”

Render the pair as adjacent number cards in a fixed order: behavioral first in
the diagram's primary blue, non-behavioral second in neutral gray. The colors
distinguish categories rather than good and bad. When the setting is off, keep
the non-behavioral number visible and append “not drawn”; when it is on, append
“shown”. Avoid a pie chart because the two counts are estimates with possible
omitted unknowns, not necessarily a complete whole.

When nothing is selected, replace the current empty prompt with a project
summary:

| Field | Meaning |
| --- | --- |
| Behavioral dependencies | Project-wide distinct consumer/original pairs classified behavioral |
| Non-behavioral dependencies | Project-wide distinct consumer/original pairs classified non-behavioral |
| Displayed module links | Links visible under the current behavioral setting, link-target projection and diagram scope |
| Coverage | Complete, or partial with a statement that some dependencies were omitted |
| Revision | Exact analyzed revision/input identity |

For a selected module, distinguish its three possible roles:

| Group | Fields |
| --- | --- |
| Uses | Headline behavioral and non-behavioral dependencies for which the module is the consumer |
| Used through this module | Behavioral and non-behavioral originals external consumers reference through source targets owned by this module |
| Owned originals used by others | Behavioral and non-behavioral dependencies for which the module owns the original |

`Uses` retains the agreed consumer/original headline unit. `Used through this
module` describes façade or import-boundary use and uses distinct
`(consumer, imported module, original)` facts. `Owned originals used by others`
describes implementation ownership and uses the headline dependency unit
grouped by original owner. This prevents a re-exporting module from looking as
though it implemented the forwarded behavior while still showing its real
architectural role.

Place the incoming group matching the active link-target projection directly
below `Uses`, and put the alternate incoming group in a secondary disclosure.
All counts remain stable while the behavioral setting changes; only a
separately labeled “links displayed” value follows it. Owned files, subtree
files and coverage remain useful secondary facts. Remove `Selected symbols`
from the headline group because it uses the old original/name unit, and move
raw access occurrences to a secondary source-evidence section.

For a selected imported-module edge, show:

1. consumer and imported module;
2. behavioral used originals via this boundary;
3. non-behavioral used originals via this boundary;
4. total classified originals via this boundary;
5. original-owner breakdown, such as `B-A-A: 7`; and
6. participating consumer/target files, status and coverage.

For a selected original-owner edge, show:

1. consumer and original owner;
2. behavioral dependencies;
3. non-behavioral dependencies;
4. total classified dependencies;
5. imported-through module breakdown, such as `B: 7`; and
6. participating consumer/original-declaration files, status and coverage.

The imported-module edge labels deliberately say “via this boundary” because
their counts can overlap with another boundary edge. The original-owner edge
uses the ordinary dependency labels because each consumer/original dependency
has exactly one original owner.

If source evidence remains expandable, list only referenced classified symbols
as the primary rows, one row per original. Import occurrences may appear below
them as supporting evidence, clearly labeled as occurrences rather than
dependencies. Do not show an unused imported selection as though it contributed
to the edge.

### Projection contract

Use one small shape for the agreed headline dependency unit and a separately
named shape for the imported-boundary projection:

```ts
interface BehavioralDependencyMetrics {
  readonly behavioralDependencies: number;
  readonly nonBehavioralDependencies: number;
}

interface ImportedBoundaryMetrics {
  readonly behavioralUsedOriginals: number;
  readonly nonBehavioralUsedOriginals: number;
}

interface ExplorerDependencyMetrics {
  readonly project: BehavioralDependencyMetrics;
  readonly outgoingByModule: ReadonlyMap<ModuleId, BehavioralDependencyMetrics>;
  readonly incomingByImportedModule: ReadonlyMap<ModuleId, ImportedBoundaryMetrics>;
  readonly incomingByOriginalOwner: ReadonlyMap<ModuleId, BehavioralDependencyMetrics>;
  readonly importedModuleEdges: ReadonlyMap<string, ImportedBoundaryMetrics>;
  readonly originalOwnerEdges: ReadonlyMap<string, BehavioralDependencyMetrics>;
}
```

The serialized explorer DTO should use arrays/objects rather than JavaScript
`Map`, but preserve these scopes and their distinct field names and units.
The pure service projection receives frozen used-symbol facts containing the
consumer, imported-through module, original identity, original owner and
classification. It produces both edge collections from the same facts.
Presentation receives both projections and their two category counts; changing
the link target or behavioral setting requires no additional server or compiler
request.

The imported-module edge collection deduplicates by
`(consumer, imported module, original)`. The original-owner collection and the
project/outgoing headline aggregates deduplicate by `(consumer, original)`.
Do not serialize a single ambiguous `byEdge` map or describe
`incomingByImportedModule` as ownership.

An optional used-symbol row may carry original identity, a display name,
classification, imported-through module, original owner and supporting file
IDs. Reference-level confidence and classifier internals remain outside the
public view model. Existing access status and coverage must be associated only
with supporting classified symbol evidence when determining a displayed edge's
status; unrelated unused or symbol-free imports must not color that edge.

### Availability and refresh

Opening or explicitly refreshing the dependency-analysis diagram is an
explicit modularity-analysis request. It may start the opt-in disposable batch
session from execution step 2. It must not add `dependency-behavior` to the
resident check, watch, changed-file hook or ordinary explorer publication.
Cache at most a bounded set of completed results by exact input identity.

While the explicit analysis is pending, render the module nodes with a clear
“Computing behavioral dependencies” state and no fallback import-occurrence
links. If the live project publishes a new revision, mark the completed diagram
stale and keep its revision visible; refresh starts analysis for the new input.
Never combine module structure from one revision with dependency counts from
another. An unavailable classifier makes the behavioral diagram unavailable,
and a partial classifier shows the known graph plus the coverage warning; zero
is reserved for a completed classification with no dependencies in that scope.

## Redesign candidates

These are hypotheses for counterfactual evaluation, not approved moves.

### Candidate A: retained-session child of analysis

The analysis owner has 29 production files and about 250 KiB of owned source.
The initial retained-session mechanics cluster contains 13 files:

- `api-view.ts` and `retained-session.ts`;
- `session-audit.ts`, `session-engine.ts`, `session-facts.ts`,
  `session-host.ts`, `session-messages.ts`, `session-processes.ts`,
  `session-revision.ts`, `session-source-loader.ts`, `session-supervisor.ts`,
  `session-supervisor-messages.ts` and `session-worker.ts`.

Within the current owner this exact group has 64 internal access occurrences,
89 outgoing occurrences to the rest of analysis and seven incoming occurrences.
The boundary is much more concentrated than 89 suggests: 52 outgoing
occurrences target `interfaces/session.ts`; the other 37 target the shared
analysis contract and report/evaluation files. Four incoming occurrences come
from `index.ts` and three from `session-supervisor-entry.ts`.

The first counterfactual must therefore compare two explicit mappings rather
than treating the 13 files as the candidate boundary:

1. The 13-file mechanics group above, recording
   `session-source-loader.ts` as a static-graph isolate with no imports to or
   from another analysis file.
2. A 15-file retained-session owner that also takes
   `interfaces/session.ts` and `session-supervisor-entry.ts`. At the baseline
   revision this mapping has 119 internal, 42 outgoing and 28 incoming access
   occurrences; all 28 incoming occurrences come from `index.ts` re-exposure.

Keep `session.ts` with the analysis parent because it implements the separate
one-shot batch session, unless a later responsibility review establishes a
shared abstraction. Decide `session-source-loader.ts` from its process/runtime
ownership rather than static connectedness alone. Compare file-context
reduction, the re-exposed surface and the remaining report contract before
accepting either mapping. Then test whether API-view projection belongs with
the retained-session child or with a smaller inspection child.

### Candidate B: pure explorer projection and web host

At the `d5c2498` baseline, service-api has six production files, seven provider
modules and 27.8% boundary locality. Its purpose combines two responsibilities:
projecting a retained analysis report into the explorer service model and
hosting the three-procedure local tRPC application. At the reviewed current
HEAD it has seven production files, including `project-binding.ts`, and the
resident binding now owns context subscription and recovery. The six-file
statement is historical evidence, not the input to a current redesign.

After refreshing the baseline, evaluate a pure projection owner containing
`project-view.ts` and its plain contracts separately from the resident binding,
router, web process, discovery and launcher. Candidate placement must respect
the existing browser/UI/dispatch tags and avoid creating a second analyzer.
Service-api remains small, so accept the split only if it materially narrows
contracts or lets the projection serve other clients.

### Candidate C: analysis-child port ownership

Evaluate the four edge groups in the descriptions/project/TypeScript type-only
component. Candidate changes may move a genuinely neutral port to the analysis
parent or invert a dependency through a narrower callback/data contract. Do
not create a general shared-types module, and do not move concrete source or
project vocabulary away from the owner that defines its meaning merely to make
the graph acyclic.

### Boundaries to retain as controls

Keep these unchanged in the first experiments:

- `analysis/model`: 100% locality, no providers, eight consumers;
- `analysis/project`: 97.4% locality, one provider, nine consumers;
- `analysis/typescript`: 80.1% locality and one connected file component;
- `presentation/layout`: 100% locality and a neutral geometry purpose; and
- `explorer`: three connected files with one adapter purpose.

Presentation's 89.7% subtree locality and daemon's 77.9% subtree locality also
argue against flattening their existing children.

## Proposed execution path

### 1. Freeze units and filters

Write a reviewed `ModularityReport` contract defining occurrence, symbol,
file-pair, owner and subtree units. Fix production/test and runtime/type filters,
coverage behavior, ordering and revision identity before adding thresholds. The
behavioral split uses the dependency glossary's consumer/original unit and its
unused, unknown and mixed-evidence rules.

The contract is recorded in the
[modularity report specification](../architecture/modularity-report.spec.md).

### 2. Add opt-in behavioral evidence

Add a `dependency-behavior` analysis capability used only by an explicit
modularity-analysis probe, command or dependency-diagram request. Do not add it
to the shared capability list used by `ramify check`, `ramify check --changed`,
watch, materialization or ordinary resident-explorer publication. It must not
change check findings, check completion, exit codes, the hook's two-second
deadline or the work needed to publish the revision that answers a hook.

`analysis/typescript` owns reference discovery and behavior-capability
classification while its TypeScript checker is alive. It emits frozen plain
facts for resolved cross-module selections. `analysis` owns deduplication by
consumer module and original identity, coverage, and the two aggregate counts.
The service and presentation owners may consume the result later but perform no
compiler work.

Execute the explicit analysis in its own disposable batch session, preferably
after a live check or while the project is idle. It neither reconfigures nor
queues work in the hook's resident context. This deliberately accepts a separate
compiler run for the modularity operation in exchange for isolating hook
latency; concurrent execution can still contend for CPU and is not the default
schedule.

Acceptance must show that the classifier executes zero times for ordinary and
changed-file checks, that their capability lists and output documents remain
unchanged, and that their existing latency evidence still applies without a
measurement waiver. Failures or unknowns in the opt-in classifier make the
modularity result partial; they never become check findings.

### 3. Implement one pure projection

Compute modularity facts from exactly `{revision, report}` after the requested
analysis capabilities finish. Reuse the completed analysis snapshot and do not
scan files, open another compiler, read daemon internals or build a second
dependency graph in the projection. If `dependency-behavior` was not requested,
the two behavioral measures are unavailable rather than zero. Keep optional Git
history behind a separate adapter so the source result remains deterministic
for one report.

### 4. Materialize the baseline

Rerun the complete source and Git projections against the exact revision under
review before evaluating a candidate. Record that revision in the output and
refuse to compare a counterfactual with stale owner files, edges, interfaces or
history samples.

Produce bounded JSON and human-readable Markdown with:

- project summary and coverage;
- exact-owner and subtree tables;
- runtime/type edge and cycle tables;
- behavioral and non-behavioral dependency counts;
- contract breadth and repository interface use;
- connectedness and context-size diagnostics; and
- ranked evidence, with role-aware explanations rather than a composite score.

The first implementation can be an analysis probe. Promote it to a supported
CLI or generated view only after the metric contract survives the Ramify and
reference-project baselines.

### 5. Integrate the dependency diagram

Extend the explorer DTO with project and outgoing-module headline counts, plus
separate imported-module and original-owner incoming/edge projections. Build
the default links by consumer and imported target-file owner from referenced,
classified symbol facts. Build the alternate links by consumer and original
owner from those same facts. Do not filter or relabel the existing raw
target-file/access-occurrence edges as a substitute.

`service-api` owns the pure revision-bound DTO projection and the bounded
request/result states. `presentation/project-view` owns the default
behavioral/imported-module rendering, original-owner alternative,
non-behavioral-only visual treatment and information-panel layout. `explorer`
owns both controls, refresh, pending/stale handling and projection-specific
selection reconciliation. Neither service nor presentation performs source
interpretation. The analysis execution provider owns the disposable batch job
and a bounded exact-input cache; it must not borrow the hook's resident context.

Implement this after the two-count baseline has been reproduced for Ramify and
the reference project. Acceptance covers at least:

- a referenced function creating a default link;
- a type-only or data-only dependency appearing only when the setting is on;
- an unused imported symbol appearing in neither view;
- repeated references and aliases in one consumer counting once;
- the same original used by two consumers counting once for each consumer;
- mixed evidence for one consumer/original pair counting as behavioral;
- a forwarded import linking to its imported module by default and to its
  original owner in the alternate projection;
- one original referenced through two imported modules producing two default
  boundary links but one project/module headline dependency;
- unknown classification omitting the dependency while making coverage partial;
- both controls, drill-down, out-of-view nodes and selection using the active
  projection and filtered edge set;
- project, module and edge panel counts agreeing with their documented units
  and the same frozen facts;
- revision change never mixing old counts with new module structure; and
- ordinary and changed-file checks invoking the classifier zero times.

### 6. Add counterfactual ownership

Accept an in-memory file-to-candidate-owner mapping and recompute the same
metrics without changing the worktree. Validate that every candidate still
forms a legal module tree and record which imports would become new boundary
accesses. Compare current, split and merge alternatives side by side.

### 7. Evaluate the first two candidates

Run Candidate A and Candidate B first. Review the resulting contracts and
source ownership with the affected owners. Use Candidate C only if the first
report shows that its type-only component materially harms contract breadth or
independent change.

The [candidate evaluation](2026-09-17-modularity-candidate-evaluation.md)
records this step at `d9aa856`: its results, required exposure changes,
recommendations and why Candidate C is not warranted.

### 8. Move one boundary at a time

For an accepted candidate, update declarations and source together, run the
self-check and affected tests, and reproduce the modularity baseline. Preserve
or improve runtime acyclicity and coverage. Record regressions in boundary
breadth, interface size or context size even when the check passes.

### 9. Calibrate thresholds from project history

Do not begin with universal targets. After several real snapshots and accepted
changes, derive project-specific review bands from the observed distribution.
Thresholds should flag investigation, not declare a module good or bad without
its role and sample size.

## Decision rule

Prefer Pareto improvements rather than a weighted modularity score. A redesign
is stronger when it:

- reduces external provider breadth, cross-boundary occurrences, selected
  symbol breadth or file-pair dispersion;
- removes a runtime cycle or narrows a type-only component;
- increases exact or subtree locality without hiding partial coverage;
- reduces the files, bytes and contracts needed for a coherent agent task;
- preserves stable-provider direction and explicit interface ownership; and
- does not widen public exposure merely to make the dependency graph simpler.

If one measure improves only by making another materially worse, retain the
tradeoff for review instead of collapsing it into one score.

## Data not currently established

The available source report does not establish:

- behavioral and non-behavioral dependency counts until the opt-in
  `dependency-behavior` capability is implemented and requested;
- runtime call frequency, event/message flow or data-flow coupling;
- semantic similarity of file responsibilities;
- external consumers of the published package API;
- per-test runtime closures, execution time or coverage;
- team ownership and organizational change cost; or
- enough independent history for newly introduced explorer modules.

These facts can supplement the structural analysis, but none should be inferred
from source import edges alone.
