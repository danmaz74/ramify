# Plan 6D acceptance matrix

**Date:** 2026-09-17. **Status:** accepted strict gate, 2026-09-17. Companion to the
[plan](main-plan.md) and [contracts](contracts.md).

**Revision, 2026-09-17, iteration 8:** the scope-aware roll-up accepted in the
[plan's revision](main-plan.md#review-decisions) removes the endpoint-projection
control, so BD30-BD32 and BD34-BD40 are edited in place and re-executed in
iteration 8; the iteration 6 and 7 results keep their earlier wording as those
rows' history. BD44-BD52 are new. BD01-BD29, BD33 and BD41-BD43 are unchanged.
Every row through BD52 passes, as the
[iteration 8 completion report](iterations/iteration8-results.md) records.

**Revision, 2026-09-17, iteration 9:** the optional node for the scope module's
own source, accepted in the [plan's iteration 9 revision](main-plan.md#review-decisions)
and specified in [C11](contracts.md#c11-the-scope-modules-own-source-as-a-node),
adds BD53-BD61. BD44, BD47 and BD51 are qualified in place with the control's
default value, which is off; iteration 8's evidence was recorded at that default
and still establishes them. No other row changes. Every row through BD61 passes,
as the [iteration 9 completion report](iterations/iteration9-results.md)
records.

## Fixtures

- `path-facts`: compiler-backed project where consumer `A` reaches one original
  through imported modules `B` and `C`; variants reference only B, both, neither,
  type/data uses, mixed uses and an isolated compiler limit.
- `forwarding`: real modules `A`, `B`, `B/A` where `B` forwards originals owned
  by `B/A`, including one access that selects an allowed and a denied original
  and an unrelated unused import.
- `dependency-report`: frozen complete report containing behavioral,
  non-behavioral, unused, unknown, same-owner, self-barrel and external controls.
- `reference`: Collection Review.
- `toolkit`: Ramify.
- `mutation`: isolated small real project whose edit publishes a new input ID.
- `nested-levels`: presentation-owned project structure and hand-written
  dependency model of the served C5 shape, with `app/a` (children `app/a/left`
  and `app/a/right`), `app/b` (child `app/b/core`), `app/c` and `app/idle`, and
  dependencies whose ends are the scope module's own source, a grandchild of
  another module, and a module shallower than the scope, so every clause of the
  C8 mapping has a case. Its `app/a -> app/a/left` edge is the parent-own-source
  end C11's control draws as a link onto a child. It is valid for pure and
  component rows only.

## Classifier and projection

| ID | Iter | Evidence | Required witness |
| --- | ---: | --- | --- |
| BD01 | 1 | compiler | Only-B-used produces a used B access fact and an unused C access fact; the aggregate headline fact is behavioral. |
| BD02 | 1 | compiler | Both-used produces two independently classified access facts; neither-used produces one aggregate unused dependency and no used path. |
| BD03 | 1 | compiler | Repeated references and aliases in one access do not add facts; two import declarations to the same boundary deduplicate later without losing their supporting access IDs. |
| BD04 | 1 | compiler | Call/construction/callable-reference, type/data/forwarding and mixed evidence follow the fixed precedence per access and aggregate. |
| BD05 | 1 | compiler | An access-specific limit affects only its path; aggregate unknown is omitted unless behavioral evidence on another path settles it. Limits remain frozen and ordered. |
| BD06 | 1 | regression | Ordinary batch, retained open/update and daemon context behavior remain unchanged; the `behaviorRuns` counter stays zero for ordinary and changed-file paths. |
| BD07 | 2 | pure | Imported-boundary facts use `(consumer, imported module, original)`; original-owner/headline aggregation uses `(consumer, original)`. Both-B-and-C yields two boundaries and one headline dependency. |
| BD08 | 2 | pure | Only-B-used yields no C boundary; unused, symbol-free, same-owner, external, outside-module and unresolved controls yield no diagram fact. A self-barrel access to a foreign original yields a boundary fact that downstream mapping gives no imported edge. |
| BD09 | 2 | pure | Unknown facts make coverage partial and add no displayed count; known imported-boundary lower bounds remain identified without turning the original-owner unit into known. |
| BD10 | 2 | pure | Production/test filters and declared/candidate ownership resolve consumers, imported modules and original owners consistently; consumer-owned originals are absent. |
| BD11 | 2 | pure | Status and reasons come only from decisions for the fact's original: one access selecting an allowed and a denied original gives an allowed and a denied fact. |
| BD12 | 2 | pure | Projection is deterministic, ordered, frozen, lists every view module, is headline-equal to `behavior`, is reached through `projectModularity` under `ramify.modularity/2`, and refuses rather than truncates above its byte limit. |
| BD13 | 2 | real batch | Clean Ramify and Collection Review baselines record commit/input identity, complete or explicit partial coverage and the two headline counts. |

## Lean analyzer

| ID | Iter | Evidence | Required witness |
| --- | ---: | --- | --- |
| BD14 | 3 | compiler | For `path-facts` and `forwarding`, `behavior` with supplied imports equals the batch path's facts over identical inputs, and the analyzer's diagram equals `projectDependencyDiagram` over the batch report. |
| BD15 | 3 | compiler | A supplied-import run issues no `catalog`, `describe`, `accesses`, `interpreter` or `interpret` helper command, and opens no retained session. |
| BD16 | 3 | analyzer | Editing a read source file, a configuration file or the module layout after the report was produced returns `inputs-changed` with the differing paths and no diagram. |
| BD17 | 3 | process | Cancellation, the deadline and an oversized response terminate the analyzer child and its compiler helper within 5 seconds, with no partial outcome; an incomplete report is `invalid-report`. |
| BD18 | 3 | measurement | On Ramify and Collection Review, the analyzer's acquire/project/classify/total times and peak memory of both processes are recorded beside a full batch with `dependency-behavior` over the same commit, 5 runs each. |

## Daemon operation

| ID | Iter | Evidence | Required witness |
| --- | ---: | --- | --- |
| BD19 | 4 | service | Superseded, invalid-current, ready-from-retained, join, `busy/analysis-running` and start follow C4's order; busy starts no work. |
| BD20 | 4 | service | Two callers for one revision create one runner call; ten requests after ready add none. One caller's cancellation leaves the job for the other; the last cancellation aborts it. A second context's request during the job is busy. |
| BD21 | 4 | service | Publication of a newer revision aborts the job and answers waiting callers superseded; `inputs-changed` answers `busy/inputs-changed` and counts it; nothing is retained in either case; no job restarts without a request. |
| BD22 | 4 | service | The retained result counts in `retainedBytes`, and is released on newer publication, eviction and close but not demotion; exceeding the per-context or global retained budget returns `resource-limit` without retention. |
| BD23 | 4 | IPC | The operation validates input, frames large results within existing response capacity, appears in capabilities and counters, and the client method maps every outcome. Existing operations' requests and outputs are unchanged. |
| BD24 | 4 | process | Against the real daemon with the injected process runner on Ramify, a diagram reaches ready while a watch update and a `check --changed` complete during the job; the retained session receives no diagram operation, its helper records zero `behaviorRuns`, and the daemon loads no analyzer module. |

## Explorer server

| ID | Iter | Evidence | Required witness |
| --- | ---: | --- | --- |
| BD25 | 5 | pure | DTO counts, one row per diagram module, breakdowns, copied evidence status/reasons, self-barrel omission from imported edges and deterministic IDs follow C5; identity mismatch, inconsistent counts and oversize are refused. |
| BD26 | 5 | service | `dependencyView` follows the router table: unavailable, superseded, ready, analyzing, one-second waiting memory and start; a superseded daemon answer is never retried with another revision. |
| BD27 | 5 | service | One in-flight request and one settled DTO per binding; a different revision aborts the in-flight request; newer publication releases the DTO; server close aborts and releases. |
| BD28 | 5 | HTTP/process | A real daemon and explorer server reach ready for one exact input ID over HTTP; the server's loaded module list contains no compiler or analysis runtime module. |
| BD29 | 5 | regression | Existing `projectView`, `explorerDetails`, `serverStatus`, module tree and daemon setup remain compatible; no request other than `dependencyDiagram` contains `dependency-behavior`. |

## Presentation and connected workflow

| ID | Iter | Evidence | Required witness |
| --- | ---: | --- | --- |
| BD30 | 6, 8 | component | Default renders the behavioral links of `originalOwnerEdges` rolled up to the current scope; non-behavioral-only and occurrence-only links are absent. Nodes remain visible while dependency data is pending. |
| BD31 | 6, 8 | component | The non-behavioral toggle adds counts and links locally; the depth selector switches between rolled-up and exact ends locally; neither action requests data. |
| BD32 | 6, 8 | component | A forwarded original links to its original owner in both depth modes: `app/a -> app/b` rolled up at the project scope, and `app/a -> app/b/core` with `app/b/core` out of view in `Exact module`. The imported module `app/b` appears only in the panel's imported-through breakdown. Both-boundaries renders one link and one headline dependency. |
| BD33 | 6 | component | An edge with behavioral evidence takes its status's full-strength colour and a non-behavioral-only edge the lighter, muted one; every edge keeps the direction animation's dashes; logarithmic width is bounded. |
| BD34 | 6, 8 | component | Project panel shows `This view` against `Whole project` headline cards, the numbers not drawn at this level, displayed links, coverage and revision; non-behavioral says `not drawn` or `shown` and no ratio/pie/confidence appears. |
| BD35 | 6, 8 | component | Module panel shows `Uses` and `Owned originals used by others` as `At this level` against `Including internals`, and keeps `Used through this module` with its imported unit, measured only, in a disclosure. |
| BD36 | 6, 8 | component | The rolled-up link panel lists the exact modules rolled into the link and its imported-through breakdown; the exact link panel keeps iteration 6's labels; evidence lists only referenced classified originals and labels accesses as supporting occurrences. |
| BD37 | 6, 8 | component | Scope, filters and out-of-view nodes use the current scope's links; the class filter changes the displayed nodes without changing how an end maps; changing a setting or the scope reconciles or clears the selection by its exact ID; node size does not change. |
| BD38 | 6, 8 | component/a11y | All three controls have keyboard and label support, and the leaving-scope toggle is absent at a scope that covers the project; waiting, analyzing, unavailable, measured-zero, partial, superseded and stale states are distinguishable. |
| BD39 | 7, 8 | HTTP/browser | Real `reference` server reaches ready and renders the rolled-up default, which is zero links at its project scope and the positive links of BD45 inside `workspace`; it exercises all three controls in a drilled-in scope, covers every panel scope, and performs no second request for a control or scope change. |
| BD40 | 7, 8 | HTTP/browser | Real `forwarding` fixture proves the rolled-up and the exact ends of a forwarded original, per-original status evidence and both-boundaries count behavior. |
| BD41 | 7 | HTTP/browser | `mutation` publishes a newer revision during and after analysis; polling stops on superseded, the old graph remains coherent and stale, refresh obtains matching structure/counts, and late old results cannot overwrite it. |
| BD42 | 7 | process/browser | Ten settled refreshes, hidden-page polling, an edit during a job, and server close meet the lifecycle limits, with recorded daemon settled memory with and without a retained result, analyzer peak memory, server memory and `behaviorRuns`. |
| BD43 | 7 | regression | Focused tests, type-check, production build, self-check, real browser gate, BD24 isolation evidence and zero `behaviorRuns` for ordinary and changed-file checks pass on one source revision. |

## Scope-aware roll-up

| ID | Iter | Evidence | Required witness |
| --- | ---: | --- | --- |
| BD44 | 8 | pure | `nested-levels`: `scopeEnd` maps an end inside the scope to the child containing it, an end outside to its ancestor at the scope module's depth, an end shallower than that depth to itself, and, while the own-source control is off, the scope module's own source to the frame; `exact` mode maps every end to itself with no frame. Ends do not change with the class filter or with the display settings; the own-source control reaches the mapping only through the scope, as BD53 records. |
| BD45 | 8 | pure/component | No drawn link has both ends mapping to one node, at any scope. On `reference` the project scope shows `integration-tests` and `workspace`, draws zero links and hides the 20 edges internal to those nodes; drilling into `workspace` draws 9 scope links carrying 7 behavioral and 41 non-behavioral dependencies, including `catalog -> contracts` 0/9 and `reviews -> contracts` 0/24. |
| BD46 | 8 | pure | `nested-levels` in a nested scope: an outside end deeper than the scope shows as its ancestor at the scope module's depth in one out-of-view node, several deep ends of one subtree collapse into one link, and a link with no displayed end is not drawn. |
| BD47 | 8 | component | `forwarding`: with the own-source control off, its default, `app/b/core -> app/b` is drawn at no scope, internal at the project scope and a frame end inside `app/b`, while `app/b`'s module panel keeps it in `Including internals` (1/1 against 1/0 at this level) and the drilled-in scope panel reports the scope's own source. |
| BD48 | 8 | pure | A rolled-up link's counts are the distinct `(consumer module, original)` pairs of its subtrees, calculated in the test from evidence rows and settled behavioral when any row is behavioral; they equal the sum of the contributing edges' counts for every `reference` scope; `status` is denied over limited over allowed across contributing evidence, `coverageIds` is their sorted union, and `sources` is complete and ordered. |
| BD49 | 8 | component | The leaving-scope toggle defaults on; off removes every link with an end outside the scope together with its out-of-view nodes, keeps the in-scope links, clears a selected leaving link, and the control is absent at a scope that covers the project. |
| BD50 | 8 | component | A rolled-up link ID contains its scope, so drilling or changing the depth mode clears that selection; an exact selection survives a scope change while its link is still drawn; a module selection survives while its node is displayed; no reconciliation invokes a data callback. |
| BD51 | 8 | component | Panels in each scope show `This view` against `Whole project` with `Not drawn at this level` equal to the difference (`reference` inside `workspace` with the own-source control off: 7/41 against 17/48, so 10 and 7 not drawn), and per module `At this level` against `Including internals` (`catalog`: `Uses` 1/11 against 3/13, owned originals 3/0 against 6/2), with `Used through this module` in a disclosure and the rolled-up link panel listing its contributing exact modules. |
| BD52 | 8 | HTTP/browser | Over a real daemon and explorer server on `reference`, every control and every scope change draws its independently calculated links while the `dependencyView` request count, `dependencyDiagrams` and `behaviorRuns` stay at their values from the first ready response. |

## The scope module's own source as a node

| ID | Iter | Evidence | Required witness |
| --- | ---: | --- | --- |
| BD53 | 9 | pure | `nested-levels`: with `showOwnSourceNode` on, `dependencyScope` in a drilled-in scope returns the scope module as `ownSourceNode` and `scopeEnd` maps that module to the own-source node, in scope, while clauses 1 and 3 give the ends BD44 records. `ownSourceNode` is null at the project scope, although its frame is the root module, and `exact` mode maps every end as BD44 records. Ends still do not change with the class filter or with the other settings. |
| BD54 | 9 | pure/component | Both directions are drawn: `nested-levels` inside `app/a` draws the own-source node onto `app/a/left` for `app/a -> app/a/left`, and `forwarding` inside `app/b` draws `app/b/core` onto the own-source node for the edge BD47 records as drawn at no scope. Each link's consumer and provider, counts, status and ID match an independent calculation, and each disappears again when the control is switched off. |
| BD55 | 9 | pure | `reference`: inside `workspace` with the control on, exactly the 3 edges iteration 8 folded into the frame become drawn, grouped by their mapped node pairs, and every other link keeps its endpoints, counts, status, `sources` and ID. The project scope still draws 0 links with the 8 folded edges undrawn, because the control is not rendered there. |
| BD56 | 9 | component | `reference` inside `workspace`: turning the control on raises `This view` by exactly the own-source links' distinct pairs and lowers `Not drawn at this level` by the same amounts, component by component; `Whole project` stays 17/48 and `This view` plus `Not drawn at this level` still equals it. The iteration records the exact numbers, and the not-drawn explanation then names only the internal and the outside causes. |
| BD57 | 9 | component | The control is absent at `reference`'s project scope and at every scope reached with no scope module; in a drilled-in scope it is present, off by default, named `Show this module's own source as a node`, keyboard-reachable and labelled like the other checkboxes, and disabled with its value kept while `Exact module` is selected. Toggling it invokes `onDependencySettingsChange` only: `onRefresh`, `onToggleExport`, `onToggleDependency` and `onNavigateToScope` are not called. |
| BD58 | 9 | component | The node is labelled `<module name> · own source`, carries `data-own-source`, is distinguishable from a module node, shows no sub-module count and invokes no `onDrillDown`; the displayed module nodes' diameters are identical with the control on and off. |
| BD59 | 9 | component | Selecting the node shows `Uses` and `Owned originals used by others` as `At this level` against `Excluding internals`, with `Excluding internals` equal to the scope module's served row and `At this level` equal to the independently calculated own-source links; `Used through this module` is measured only, in a disclosure; its displayed links and owned source files appear; and the project panel's `Scope's own source` section states that the own source is drawn as its own node. |
| BD60 | 9 | component | An own-source node selection survives while the node is drawn and is cleared, through `onSelectModule(null)`, by switching the control off, by a scope change and by `Exact module`; a selected own-source link is cleared by the same three changes through `onSelectEdge(null)`; a child-to-child link selection and a module selection survive the toggle because their IDs do not change. No reconciliation invokes a data callback. |
| BD61 | 9 | HTTP/browser | Over a real daemon and explorer server on `reference`, drilling into `workspace` and toggling the control draws the independently calculated links in both directions, and the `dependencyView` request count, `dependencyDiagrams` and `behaviorRuns` stay at their values from the first ready response, as BD52 recorded them for the other controls. |

Returning old occurrence links while pending fails BD30. Returning an empty
graph fails wherever the fixture has a positive control at that scope;
`reference`'s project scope, where every dependency is internal to a node or
folded into the frame, is BD45's recorded exception. Component tests
do not establish BD39–BD42 or BD52, and a clean browser rendering does not
establish hook isolation. The hand-written `nested-levels` model establishes
BD44, BD46, BD53 and its own half of BD54 only; it cannot stand in for the
served models in BD39, BD40, BD52 or BD61. Summing child links instead of counting distinct pairs fails BD48 even
where the two agree, because the test calculates the pairs. A component row
that toggles the own-source control without comparing the drawn set with an
independent calculation does not establish BD54-BD56, and component evidence
does not establish BD61's request and counter values.
