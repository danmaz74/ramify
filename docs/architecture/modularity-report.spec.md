# Modularity report

**Date:** 2026-09-17. **Status:** Contract under implementation. Iteration 2
implements the opt-in evidence, iteration 3 the declared-ownership
projection and iteration 4 change affinity, the Git adapter and the baseline
probe; candidate ownership is not implemented. It
fixes the units, filters, formulas, coverage rules, ordering and identity that
the
[project modularity analysis](../analysis/2026-09-17-project-modularity-analysis.md#proposed-execution-path)
names as execution step 1. Thresholds, rankings that combine measures and
module moves are out of scope. The TypeScript contract is
[`interfaces/modularity.ts`](../../subs/analysis/src/interfaces/modularity.ts);
the opt-in evidence contract is
[`interfaces/dependency-behavior.ts`](../../subs/analysis/subs/typescript/src/interfaces/dependency-behavior.ts).
Where this document and those types disagree, this document wins and the
types are corrected.

## Purpose

Describe the structural modularity of one completed analysis as a set of named
measures whose units stay visible. The report supports review of cohesion and
coupling and side-by-side comparison of candidate ownership. It is not a
score, and no measure in it declares a module good or bad.

The report is derived data. It creates no visibility, availability, ownership,
exposure or source dependency, and it never changes check findings, check
completion or exit codes. The
[importability principles](../model/cross-module-importability.principles.md)
remain authoritative for those rules. Dependency vocabulary follows the
[dependency glossary](dependency-glossary.md).

## Owners and placement

| Responsibility | Owner | Location |
| --- | --- | --- |
| Reference discovery and behavior-capability classification while the compiler is alive; frozen `DependencyBehaviorFacts` | `analysis/typescript` | `src/interfaces/dependency-behavior.ts` (contract), implementation in iteration 2 |
| The opt-in `dependency-behavior` capability in batch analysis; attaching its facts to the snapshot | `analysis` | existing batch pipeline |
| Contract types; pure projection of `{revision, report}`; deduplication, coverage and aggregates; candidate ownership validation; pure change-affinity projection | `analysis` | `src/interfaces/modularity.ts`, `src/modularity.ts`, `src/change-affinity.ts` |
| Git history adapter producing `ChangeHistory` | modularity probe | `scripts/probes/modularity/git-history.ts` |
| Probe that runs the analysis, the projections and writes JSON and Markdown | modularity probe | `scripts/probes/modularity/baseline.ts`, rendering in `markdown.ts` |

**Projection owner.** `analysis` owns the `AnalysisReport` contract that is the
projection's only source input, and the modularity analysis already assigns it
deduplication, coverage and the aggregate counts. Every vocabulary the
projection reads (inventory, source areas, catalog, model, accesses) is
available to `analysis` without a new exposure, and the analysis subtree stays
closed. The alternatives were rejected:

- `service-api` projects reports for the explorer, but it is a web adapter and
  the subject of Candidate B; the projection must also serve the probe and later
  clients without a web process.
- `presentation` is UI-tagged and only renders.
- `daemon` and `cli` are resident and command adapters; a batch probe must not
  depend on either.
- A new `analysis/modularity` child would require the parent to expose its
  report vocabulary and relay its children's vocabulary to descendants,
  changing the tree while Candidate A may restructure `analysis`.

The added files enlarge the `analysis` context. The report itself measures that
cost, and a later boundary review may move the projection with the evidence it
produces.

**Probe and Git adapter.** Git execution is repository-history acquisition, not
source analysis, so it stays outside `analysis`. `scripts/` has its own compiler
scope (`tsconfig.scripts.json`) and is not compiler-selected by the project's
`tsconfig.json`, so the probe neither becomes module-owned source nor produces
outside-module warnings. Existing probes import built package output; the
modularity probe imports `ramify.ts/analysis` from `dist/`. Promotion to a
supported command would move the adapter into `cli`, still outside `analysis`.

**Exposure.** Nothing is exposed in iteration 1. Expected additions:

- Iteration 2 adds `expose-src * from "interfaces/dependency-behavior.ts" to parent`
  to `analysis/typescript` when `analysis` source first imports the facts.
- Iteration 3 adds `export type * from './interfaces/modularity.js'` and the
  projection function to `subs/analysis/src/index.ts`, the `ramify.ts/analysis`
  package entry the probe uses. No `module.ramify` exposure is needed while no
  other owner imports the projection. Iteration 4 adds `projectChangeAffinity`
  to the same entry. A later owner consumer requires
  `expose-src` of the interface file and projection to `parent`, and root
  re-exposure to descendants.

## Units

**Access occurrence.** One `SourceAccess`. An access that selects several
symbols is still one occurrence. The **importer file** is `importer.file`; for
an application target the **target file** is `target.origin.file`.

**Application occurrence.** An occurrence whose target kind is `application`.
Only application occurrences form dependencies. External (`package`, `builtin`,
`standard-library`), `outside-module` and `unresolved` occurrences are counted
separately and never contribute to an edge.

**Original identity.** The triple `(kind, defining file, binding)` of an
`OriginalId`. `OriginalId.file` is relative to the declared owner's ordinary
`src/`, so the defining file is the project-relative path of the catalog
original's `origin.file`, equivalently that root joined with `file`. The `owner`
field serves only this resolution; an original's owner is always the owner of
its defining file in the ownership in use, so candidate ownership moves
originals with their files.

**Selected symbol.** The pair `(original identity, exportedName)` of an
`AccessSelection` whose `original` is non-null. Selections with a null original
count toward no symbol measure. These are the explorer's units.

**Consumer and provider.** The consumer of an application occurrence is the
owner of its importer file; the provider is the owner of its target file. An
occurrence is **same-owner** when they are equal and **cross-owner** otherwise.

**Consumer file, provider file and file pair.** The importer file, the target
file and their ordered pair `(importer file, target file)`.

**Edge.** The ordered pair `(consumer, provider)` of one or more cross-owner
application occurrences that pass the filters.

**Exact owner.** One module; its files are the inventory files it owns.

**Subtree.** A module and all its descendants in the ownership tree in use. An
occurrence is **internal** to a subtree when both its consumer and provider
are in the subtree.

**Symbol dependency.** The glossary's unit: one distinct `(consumer module,
original identity)` pair.

## Filters

### Source filter

A file is **testing-classified** when its inventory area is `tests`, or its
area is `ordinary` and the owner's ordinary `SourceArea.profile` contains
`testing`. Under candidate ownership the second condition reads the candidate
module's `headerTags`.

The **production subset** contains inventory files whose kind is `source` and
which are not testing-classified. It excludes resources, module-owned test areas
and the ordinary source of testing-classified modules such as
`integration-tests`. The **test subset** contains testing-classified source files.

An occurrence passes a source filter when its importer file is in that subset.
The same importer rule applies to external, outside-module and unresolved
counts. The provider file is not filtered: a production occurrence targeting a
testing-classified file is a check violation and remains counted, so the
report never hides it.

Every view is computed for one source filter. Production and test results are
never summed or mixed; there is no combined view.

### Load filter

Within a source filter every measure with `LoadVariants` has three variants:

- `all`: every occurrence passing the source filter;
- `runtime`: those whose `runtimeLoad` is true;
- `typeOnly`: those whose `runtimeLoad` is false.

`runtimeLoad` is authoritative; selection requests do not reclassify an
occurrence.

## Measures

Every ratio is a `Ratio`: numerator, denominator and the unrounded quotient, or
`null` when the denominator is zero. A null ratio is undefined, never zero.
Presentation may round; the JSON may not.

### Owners and edges in a view

A view lists an owner when its subtree contains at least one file of the view's
subset, and an edge when its `all` variant has at least one occurrence.

`ViewCounts` for each load variant:

- `owners`: modules owning at least one subset file;
- `sourceFiles`: files in the subset;
- `applicationOccurrences`, `sameOwnerOccurrences`, `crossOwnerOccurrences`;
- `edges`: edges with at least one occurrence in the variant;
- `externalOccurrences`, `outsideModuleOccurrences`, `unresolvedOccurrences`;
- `exactLocality = sameOwnerOccurrences / applicationOccurrences`.

### 1. Boundary locality

For an exact owner or subtree `B` and one load variant:

```text
internal  = application occurrences with consumer and provider in B
outgoing  = application occurrences with consumer in B and provider outside B
incoming  = application occurrences with provider in B and consumer outside B
locality  = internal / (internal + outgoing)
```

Incoming occurrences are reported but never enter the denominator. For an exact
owner, "in B" means equal to the owner. `BoundaryMetrics` retains the internal
count and the outgoing and incoming breadth beside the ratio.

### 2. Contract breadth

`EdgeBreadth` over a set of occurrences:

- `occurrences`;
- `selectedSymbols`: distinct selected symbols;
- `consumerFiles`, `providerFiles`: distinct importer and target files;
- `filePairs`: distinct file pairs.

`BoundaryBreadth` adds `modules`: distinct providers outside `B` for outgoing
breadth, distinct consumers outside `B` for incoming breadth. Each edge carries
its breadth per load variant.

### 3. Interface economy

Defined per exact owner `O` and source filter. An original is an **exposed
owned original** of `O` when its defining file is in `O`'s subset files and the
model has an `effective` exposure of it declared by `O` itself. Its
destinations are the union over those exposures; its capability is `value` when
the catalog original `hasValue`, otherwise `type-only`.

An exposed owned original is **selected** when an occurrence passing the filter,
with a consumer other than `O`, has a selection of that original. Selection is
not attributed to an exposure path, and the load filter does not apply.

`InterfaceUse` has nine rows in the fixed order destinations `parent`,
`descendants`, `any` × capabilities `value`, `type-only`, `any`. An original
exposed to both destinations counts once in each destination row and once in
`any`.

```text
repository interface use = selected exposed owned originals / exposed owned originals
```

The label is `repository interface use`, never unused API. Independent compiler
scopes (`ProjectScope.independentScopes`) are recorded as `omittedScopes` in
provenance; their absence from the graph is not zero use.

Under candidate ownership, declarations are unchanged, so interface use is
`unavailable` with reason `candidate-exposure`. Compare candidates with
contract breadth: the distinct selected symbols of each outgoing and incoming
boundary are the surface a candidate would need to expose.

### 4. Behavioral dependency estimate

Available only when the analysis requested `dependency-behavior` (see
[opt-in evidence](#opt-in-dependency-behavior-evidence)).

For a consumer module `C` in a source filter, take the facts whose consumer file
is in `C`'s subset files and whose original is owned by another module. Group them
by original identity. Each group is one symbol dependency, classified by
precedence:

1. `behavioral` if any fact is `behavioral`;
2. otherwise `unknown` if any fact is `unknown`;
3. otherwise `non-behavioral` if any fact is `non-behavioral`;
4. otherwise `unused`.

`unknown` ranks above `non-behavioral` because an unclassified reference could
hide behavioral evidence. The owner result is exactly
`BehavioralDependencyMetrics`:

```ts
interface BehavioralDependencyMetrics {
  readonly behavioralDependencies: number;
  readonly nonBehavioralDependencies: number;
}
```

`unused` and `unknown` dependencies, same-owner selections and symbol-free loads
count toward neither number. Unknown dependencies make the metric partial and
are counted only in its coverage. The view total is the sum over owners, which
equals distinct `(consumer, original)` pairs because consumers are disjoint. No
subtree variant and no load variant exist. The production view total is the
headline project measure.

### 5. Stability direction

For exact owner `O` and one load variant over the view's edges:

```text
Ca = distinct consumers of edges whose provider is O
Ce = distinct providers of edges whose consumer is O
instability = Ce / (Ca + Ce)
```

For an edge in a variant, `direction` compares the provider's instability with
the consumer's in the same variant by the exact integer comparison
`Ce_p * (Ca_c + Ce_c)` versus `Ce_c * (Ca_p + Ce_p)`: less is `toward-stable`,
equal is `level`, greater is `toward-volatile`. It is `undefined` when the edge
has no occurrence in that variant or either instability is null.

The report flags nothing. Whether a direction conflicts with an intended role
is a review judgment; the intended role is not recorded data.

### 6. Cycle structure

Build two owner graphs from the view's edges: the **runtime graph** from edges
with runtime occurrences, and the **all graph** from every edge. Only strongly
connected components with at least two members are reported.

- A **runtime component** is a component of the runtime graph.
- A **type-only component** is a component of the all graph whose member set is
  not a runtime component. Its `runtimeComponents` lists the runtime components
  contained in it.

For each component, over the cross-owner occurrences of view edges whose
consumer and provider are both members: `occurrences` (all loads),
`runtimeOccurrences`, `files` (distinct consumer and provider files) and
`selectedSymbols`. Same-owner occurrences are not part of a component.

**Witnesses.** For each member in byte order, a breadth-first search over the
component's edges in its own graph (runtime graph for a runtime component, all
graph otherwise), visiting providers in byte order, finds the first shortest
cycle returning to that member. Each cycle is rotated to start at its
byte-least member, duplicates are removed, and witnesses are ordered by length,
then element-wise by owner id. Each `CycleStep` carries the edge's runtime and
type-only occurrence counts.

Runtime components have the highest default review priority; type-only
components call for contract-ownership review.

### 7. Internal connectedness

Defined for the production filter only; the test view reports `unavailable`
with reason `not-defined`.

For exact owner `O`, build an undirected graph whose vertices are `O`'s
production files and whose edges join the importer and target files of every
same-owner application occurrence with both endpoints among those vertices
(all loads).

- `files`, `components`, `largestComponentFiles`;
- `largestComponentCoverage = largestComponentFiles / files`;
- `isolates`: single-file components, with `declarationFile` (path ends in
  `.d.ts`, `.d.mts` or `.d.cts`), `interfaceFile` (beneath the area's
  `interfaces/`), `exposedOriginals` (as in section 3; null under candidate
  ownership) and the file's cross-owner `incomingOccurrences` and
  `outgoingOccurrences` in the production view.

This is a reachability diagnostic, separate from locality. Entry files, shims
and public interfaces can be legitimate isolates.

### 8. Change affinity

Change affinity is not part of `ModularityReport`. It is a separate
`ChangeAffinityReport` computed from a `ChangeHistory` supplied by the Git
adapter, with its own provenance, so the source report stays deterministic for
one analysis.

The adapter reads commits in `range`, oldest first, with rename detection
disabled so a rename lists both paths, first-parent or not and merges excluded
or included as recorded; an included merge lists its changes against its first
parent. It rewrites repository-relative paths relative to the project root,
dropping paths outside it. `head` is the full id of the range's newest commit,
before the merge filter applies.

The projection maps each path through the ownership in use to the owner of an
inventory file in the filter's subset; other paths are unmapped. Then:

```text
examined          = commits in the history
excludedExplicit  = examined commits listed in excludedCommits
owners(c)         = distinct owners of mapped paths of a remaining commit c
excludedBroad     = remaining commits with |owners(c)| > maxOwnersPerCommit
sampled           = remaining, non-broad commits with |owners(c)| >= 1
commits(A)        = sampled commits whose owners include A
shared(A, B)      = sampled commits whose owners include A and B
affinity(A, B)    = shared(A, B) / (commits(A) + commits(B) - shared(A, B))
```

`unmappedPaths` counts distinct unmapped paths across commits excluded neither
explicitly nor as broad. `owners` lists every owner of at least one file in the
filter's subset, including owners with zero commits. An
owner is `sufficient` when `commits(A) >= minOwnerCommits`; a pair when both
owners are sufficient and `shared >= minSharedCommits`. Insufficient values are
retained with their raw counts, never hidden or presented as signals. Only
pairs with at least one shared commit are listed, with `first < second` in byte
order.

Staged plan-delivery or omnibus commits are not blended silently: they are
excluded only by the recorded `maxOwnersPerCommit` or `excludedCommits` filter,
and the counts of excluded commits are reported. `excludedCommits` holds full
commit ids and serializes deduplicated in byte order.

### 9. Context size

For exact owner `O` or its subtree, in a source filter:

- `sourceFiles`, `sourceBytes`: files in the subset and their inventory bytes;
- `resourceFiles`, `resourceBytes`: resources whose area has the filter's
  classification; they are not part of the file subset;
- `originals`: catalog originals defined in those source or resource files;
- `exposedOriginals`: exposed owned originals as in section 3, summed over the
  subtree's owners; null under candidate ownership;
- `accessOccurrences`: occurrences whose importer is one of those files, every
  target kind.

Subtree values are sums over owners; every unit is disjoint by owner.

## Coverage and availability

### Whole projection

`projectModularity` returns `unavailable` with reason `analysis-incomplete`
unless `report.outcome.execution` is `completed` and `inputId`, `registry`,
`snapshot`, `snapshot.catalog` and `snapshot.model` are non-null. It returns
`unavailable` with reason `resource-limit` when the UTF-8 JSON of the report
exceeds `maxReportBytes`; it never truncates a measure. A failed check does not
prevent projection: denied occurrences are still source evidence, and
`provenance.check` records the outcome.

### Metric states

- `measured`: the metric's scope has no coverage limit.
- `partial`: at least one limit applies. Counts are in `observed` and are lower
  bounds; a ratio from partial counts is not an estimate of the true ratio.
  Partial is never presented as a measured zero.
- `unavailable`: the metric cannot be computed, with a reason.

### Scope of a metric

| Metric | Occurrences in scope | Files in scope |
| --- | --- | --- |
| View summary, cycles | every occurrence passing the filters | every subset file |
| Boundary (exact or subtree) | consumer in `B` or provider in `B` | files of `B` |
| Edge breadth | the edge's occurrences | their importer and target files |
| Stability | consumer or provider equal to `O` | files of `O` |
| Interface use | every filtered occurrence with a consumer other than `O` | files of `O` |
| Behavior | occurrences from files of `C` | files of `C` |
| Connectedness | occurrences from files of `O` | files of `O` |
| Context size | occurrences from the counted files | the counted files |

The files of an owner or subtree are its files in the view's subset; context
size adds the counted resources.

A metric is partial when any of these holds:

1. an occurrence in scope names a `coverageIds` entry;
2. an occurrence in scope from a scope file has an `unresolved` or
   `outside-module` target (counted in `unattributedAccesses`);
3. a selection of an application occurrence in scope has a status other than
   `resolved`; external selections never resolve to an original;
4. a source file in scope has `FileExports.state` other than `complete`, or a
   `report.coverage` limit is located in a file in scope. A resource without a
   compiler export description is limited only through the accesses that name
   it;
5. a `report.coverage` limit is located in no inventory file; it applies to
   every metric;
6. for behavior only, a deduplicated dependency in scope is `unknown`, a fact in
   scope names a limit, or the facts' status is `failed`, which attributes every
   `DependencyBehaviorFacts.limits` id to every behavior metric.

`limitIds` lists the attributed `SourceLimit` and `BehaviorLimit` ids in byte
order, including the ids named by `FileExports.issueIds`. The report-level
`coverage` is `partial` when any metric in either view is partial or
`report.outcome.coverage` is `partial`. Its `detail` lists the limit ids of every
partial metric, the sum over views of the `all` summary's unattributed accesses
and the sum over views of the behavior total's unknown dependencies.

### Behavioral availability

- `unavailable`, `not-requested`: `dependency-behavior` is not a requested
  capability.
- `unavailable`, `capability-failed`: requested but not executed, so no facts
  are present.
- `partial`: facts are present with status `failed`, or rule 6 applies. The
  observed counts come from the collected facts.

## Opt-in dependency-behavior evidence

Iteration 2 implements this contract.

- `Capability` gains `'dependency-behavior'`. It is requested only by the
  modularity probe or a later explicit modularity command. The shared CLI
  capability list used by `ramify check`, `--changed`, watch, materialization
  and the explorer does not include it.
- Only disposable batch analysis accepts it. Retained sessions reject it with
  `unavailable-capability` when opened or updated with it; resident contexts
  refuse the setup as `unsupported-setup`. Neither reconfigures nor queues work
  for it.
- `AnalysisSnapshot` gains the optional field
  `dependencyBehavior?: DependencyBehaviorFacts`, present only when requested.
  The report's `capabilities` list contains a `dependency-behavior` row only
  when requested; the row is `available` only in batch analysis and `executed`
  when the facts are present. Report documents without the request are
  byte-identical to those produced before the capability existed.
- The facts never add diagnostics, change `outcome.check`, `outcome.coverage`,
  `summary` or `report.coverage`, or alter exit codes. Classifier limits stay in
  `DependencyBehaviorFacts.limits`.
- `analysis/typescript` emits one `DependencyBehaviorFact` per distinct
  `(consumer file, original)` over **every resolved application selection**,
  including those currently same-owner. The modularity analysis names
  cross-module selections; the wider set is deliberate, because candidate
  ownership can turn a same-owner selection into a boundary selection, and the
  classifier does not need ownership.
- A fact is `behavioral` when some value-position reference in the consumer file
  uses a behavior-capable symbol; `non-behavioral` when referenced only through
  type, data or forwarding evidence; `unused` when the selected bindings have no
  identified reference outside their import declaration and are not forwarded;
  `unknown` when reference discovery, symbol resolution or capability
  interpretation is incomplete. Glossary definitions apply to every term.
- References are identifiers bound to the selected local binding outside its
  import declaration, or the selecting member or destructuring expression.
  Export forms and references in export specifiers or `export default` are
  forwarding; references beneath a type node, JSDoc (JavaScript source only),
  an `implements` clause or an interface heritage clause are type positions.
  A value reference invoked by a call, tagged template, decorator or JSX tag,
  or whose first-level member is so invoked, is `call`; `new` is
  `construction`; any other value reference is `callable-reference` for a
  behavior-capable value and `data` otherwise.
- Capability reads the reference's type: a union is behavior-capable when a
  non-nullish constituent is. A first-level member counts only when declared
  outside default and external library files, so array, string and promise
  methods do not make a value behavior-capable. `any`, `unknown` and
  unconstrained types are `unclassified-capability` limits.
- `evidence` lists the distinct evidence kinds observed, in the declaration
  order of `BehaviorEvidence`. Evidence strength or confidence is not public.
  `limits` lists only limits named by `unknown` facts. `failed` means the
  classification operation failed as a whole; its facts are then empty.
- Facts are ordered by consumer file, then original file, binding and kind;
  limits by id; both in byte order.
- Acceptance shows the classifier executes zero times in ordinary and
  changed-file checks, their capability lists and output documents are
  unchanged, and existing latency evidence still applies.

## Candidate ownership

`CandidateOwnership` evaluates a hypothetical tree without changing the
worktree:

- `id`: a non-empty label without control characters, recorded in provenance;
- `modules`: the complete candidate tree; each module's `id`, `name` and
  `parent` satisfy the identity, single-root, known-parent and acyclicity rules
  the model applies to `ModuleRecord`, and the root id equals the declared root
  id; source areas and directories are not required;
- `files`: inventory files reassigned to candidate owners; every other file
  keeps its declared owner.

Validation returns `invalid-ownership` with every issue, ordered by code then
subject, when:

- the id is invalid (`invalid-candidate-id`);
- a module identity, name or parent is invalid (`invalid-module-id`), repeated
  (`duplicate-module`) or the tree has no single root, a cycle or an unknown
  parent (`invalid-tree`);
- a reassigned path is not an inventory file (`unknown-file`) or is listed
  twice (`duplicate-file`);
- a reassigned file names, or a retained file keeps, an owner absent from the
  candidate tree (`unknown-owner`);
- any file's testing classification would change (`classification-change`).
  A candidate moves boundaries; it never changes the production subset.

Under candidate ownership the projection recomputes every measure with the
candidate owners. Exposure-dependent values are unavailable or null as stated
above. Behavioral dependencies are deduplicated again from the same facts.
`boundaryChanges` lists, in both filters, every application occurrence whose
`(consumer, provider)` differs from declared ownership, classified as
`became-cross-owner`, `became-same-owner` or `changed-owners`, ordered by access
id. The list stops at `maxBoundaryChanges` with `truncated` set and `total`
exact. Under declared ownership `boundaryChanges` is null.

Candidate modules may own no files; they then appear only in `modules`.

## Identity and provenance

`ModularityInput.revision` is the caller's identity of the analysis: a resident
`RevisionId`, or `batch:<inputId>` for a disposable batch analysis.
`ModularityProvenance` records it with the analysis schema, `inputId`, registry
id, check and coverage outcomes, the requested-and-executed capabilities, the
omitted independent scopes and the ownership mode and candidate id. The
analysis `runId` is excluded because it is random.

Git-derived facts carry `ChangeHistoryProvenance` in their own report. The
materialized `ModularityDocument` records the analyzed repository commit and
whether the worktree was clean. The probe refuses to write a comparison when
`history.head` differs from that commit or, unless explicitly allowed and
recorded, when the worktree is not clean. Every evaluation in one document
derives from the same analysis report, so candidates are never compared with
stale owner files, edges, interfaces or history samples. Runtime-derived facts,
when added, follow the same separation.

## Ordering and determinism

Identical analysis reports, revision, candidate and limits produce
byte-identical JSON. Reports contain no timestamps, host paths, process ids or
timings. Properties serialize in the declaration order of the TypeScript
contract. Byte order means UTF-8 code unit order.

- views: production, then test;
- `modules` and owner rows: by module id;
- edges: by consumer, then provider;
- load variants: `all`, `runtime`, `typeOnly`;
- interface-use rows: the fixed order in section 3;
- cycle components: runtime before type-only, then element-wise by sorted member
  ids; members and `runtimeComponents` sorted the same way; witnesses as in
  section 6;
- isolates and file lists: by path;
- `limitIds`: byte order;
- boundary changes: by access id, then filter;
- change-affinity owners by id and pairs by `(first, second)`;
- candidate evaluations in a document: by candidate id.

## Materialized baseline

Iteration 4's probe writes one `ModularityDocument` as JSON and a Markdown
rendering of the same data, containing the declared evaluation and any
candidates. Change affinity uses the production filter. The Markdown contains,
in order: project summary and coverage; exact-owner and subtree tables;
runtime and type-only edge and cycle tables; behavioral and non-behavioral
dependency counts; contract breadth and repository interface use; connectedness
and context size; and ranked evidence. Each ranked table orders by exactly one
named measure, descending, ties by id; explanations are role-aware, and no
measures are combined into a score. Partial and unavailable values are labelled
as such in every table. Evidence written into the repository goes under
`scripts/probes/results/modularity/`.

The probe (`npm run probe:modularity`) writes `<name>.json` and `<name>.md`,
`baseline` by default. It requests the shared CLI check capabilities plus
`dependency-behavior` in one disposable batch analysis and projects both
reports from that single analysis report. Its default history is `HEAD`, all
parents, merges excluded, with `minOwnerCommits` 5, `minSharedCommits` 3 and
`maxOwnersPerCommit` 5; every value is recorded in the change-affinity report.
It refuses, with exit code 2, when the worktree is not clean without
`--allow-dirty`, when `HEAD` or cleanliness changes during the analysis, or when
the history head differs from the analyzed commit. Markdown structural
positions (composition root or parent, provider, leaf consumer, connected
owner) are read from the ownership tree and production edges to explain a
ranking; they are not declared roles.

## Iteration handoff

- **Iteration 2** implements the opt-in evidence against
  `DependencyBehaviorFacts` and the constraints above, adds the capability, the
  optional snapshot field and the `analysis/typescript` exposure.
- **Iteration 3** implements `projectModularity(input: ModularityInput):
  ModularityOutcome` in `subs/analysis/src/modularity.ts` for declared ownership,
  and adds the package-entry exports.
- **Iteration 4** implements `projectChangeAffinity(input: ChangeAffinityInput):
  ChangeAffinityOutcome` in `subs/analysis/src/change-affinity.ts`, the Git
  adapter and the probe.
- **Iteration 5** adds candidate validation, candidate recomputation and
  `boundaryChanges` to both projections.
- **Iteration 6** writes the Candidate A and B mappings as `CandidateOwnership`
  inputs and evaluates them.
