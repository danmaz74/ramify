# Iteration 8 results: Scope-aware roll-up of dependency links

**Date:** 2026-09-17. **Mode:** direct work in worktree `/tmp/ramify-plan6d-behavioral-diagram`,
branch `feat/plan6d-behavioral-dependency-diagram`. It is based on the iteration 8 specification at `8f235e2`,
which stands on iteration 7's completion at `516897a` and the user's dash-pattern fix at `2600b32`. This
report records the accepted [iteration 8 revision](../main-plan.md#review-decisions) of the drawn links.

| Commit | Content |
| --- | --- |
| `11db76e` | The C8-C10 scope functions, the three controls, the labelled panels and the pure cases. |
| `96280da` | The browser acceptance rewrite to the scope mapping. |
| this commit | Plan 6B's RS13 source step, this report, the plan and acceptance status, the roadmap prose and the raw browser artifact. |

The focused tests, type-check, the explorer bundle and the self-check ran on `96280da`. The browser gate ran
on the source of this commit, whose only non-document change is the RS13 source step; it was rerun in full
after that step was corrected, and no source under `src` or `subs/presentation` changed between the two.

## Prerequisites

- BD01-BD43 passed in iterations 1-7, as the [gate report](iteration7-results.md) records.
- The iteration 8 revision, contracts C8-C10 and the edited BD30-BD40 rows were accepted at `8f235e2`.
- The daemon operation, the analyzer, the projection and the C5 DTO are used exactly as delivered. No file
  under `analysis`, `daemon`, `service-api` or the analyzer entry changed, and no new analysis run exists.

## Built

### `presentation/project-view [ui, browser]`

**`src/interfaces/dependency-view.ts`.** `DependencyLinkTarget` is removed. `DependencyDepthMode` is
`'level' | 'exact'`, and `DependencySettings` is now
`{ showNonBehavioral, depthMode, showOutsideScope }`.

**`src/dependency-graph.ts`** owns the C8 scope functions, all pure and all free of the class filter:

- `dependencyScope(model, scopeModuleId)` reproduces the view's scope selection and returns the frame module,
  the candidate nodes and their module-tree depth.
- `scopeEnd(module, scope, depthMode, tree)` applies C8's clauses in order: a node or its descendant becomes
  that node, the scope module becomes the frame, and any other module becomes its ancestor at depth
  `scope.depth - 1`, or itself when it is already at most that deep. In `exact` mode every end is its own
  module and there is no frame.
- `scopeDependencyLinks({ model, scope, displayed, tree, settings })` reads `originalOwnerEdges` only. It
  drops a frame end, an edge whose two ends map to one node and an edge with no end among the displayed
  nodes; groups the rest by their ordered node pair; and counts each group's distinct
  `(exact consumer module, original)` pairs, settled behavioral when any of its evidence rows is behavioral.
  The class filter reaches it only as the `displayed` set.
- `scopeCoversProject(scope, modules, tree)` is true when the scope's subtree contains every module.
- `activeDependencyEdges` is gone. `ActiveDependencyEdge.projection` is now `depthMode`, its single `source`
  is `sources`, and it adds `leavesScope` and `coverageIds`. `edgeStatus` now takes the contributing edges.
- `originalIdentity(original)` is the shared `OriginalId` key the pair counting and the panels use.
- The C10 helpers are `subtreeDependencyCounts(model, module, tree)`, the component-wise sum of the C5 rows
  of a module and its descendants, and `scopeLinkCounts(links)`.
- Link IDs are `scoped-link/1:level:<scope module ID or ->:<JSON([consumer, provider])>` for a rolled-up
  link, and the model's own edge ID in `exact` mode. The view hashes nothing.

**`src/ProjectExplorerView.tsx`.**

- It builds the existing `ModuleTreeIndex` with `indexModuleTree` and derives the scope, the candidate nodes,
  the displayed set, the scope's links and the drawn links from it. `scopeDependencyLinks` is called twice:
  once with `showNonBehavioral: true` for the panel numbers and once with the real settings for the drawn
  set, so a panel number does not move when that setting changes.
- Out-of-view nodes are the mapped ends that are not displayed nodes, and keep the existing level helper over
  the scope's depth. A filtered-out child still receives its subtree's ends and is drawn as a related node.
- The `Link targets` radio group becomes `Link depth` with `Modules at this level` and `Exact module`, keeping
  iteration 6's roving tab stop and arrow/Home/End keys. A `Show dependencies that leave this module`
  checkbox is added, on by default and absent when the scope covers the project.
- The panels label each filtered number against the measured one:
  - no selection: `This view` against `Whole project`, `Not drawn at this level` as their component-wise
    difference with its explanation, displayed links, coverage, revision and input, and, in a drilled-in
    scope, a `Scope's own source` section with the frame module's own rows and the statement that its links
    are not drawn there;
  - a module node: `Uses` and `Owned originals used by others`, each `At this level` against
    `Including internals`, and `Used through this module` with its imported unit, measured only, in a
    disclosure;
  - a rolled-up link: `Rolled-up link`, its `At this level` cards, a `Rolled-up modules` section naming each
    contributing edge's exact consumer and original owner with its counts, an `Imported through` disclosure
    summing the contributing edges per imported module, supporting files, status, reasons and coverage, and
    the referenced originals grouped by original with their exact consumer and owner;
  - an exact link: iteration 6's `Original-owner link` panel, unchanged.
- Each labelled card pair is a `role="group"` whose accessible name is its label, so a test selects it by
  name instead of by position.
- The class-filter items carry `data-presentation-class`, which the browser gate uses to hide one class.

**`src/ModuleGraphRadial.tsx`, `src/ModuleGraphLegend.tsx`, `src/moduleGraphShared.ts`.** The link tooltip
names the rolled-up unit, and the legend adds a row for the drawn links' unit. Width, colour, status and the
direction animation keep their iteration 6 encoding.

**`src/project-view.css`.** Styles for the labelled card pair and the not-drawn line.

**`module.ramify`, `README.md`.** The reusable interface exports swap `DependencyLinkTarget` for
`DependencyDepthMode`, in `presentation` and at the root, and the prose describes the roll-up and the three
settings.

### `explorer [ui, browser, dispatch]`

No hook or page logic changed: the page keeps the settings across scope changes and refreshes, and
`defaultDependencySettings` now carries `depthMode` and `showOutsideScope`. Its test exercises the new
control name.

### `integration-tests [testing, ui, dispatch]`

`src/browser-acceptance.ts` computes the expected links independently of the view, from the project structure
and the served evidence rows:

- `scopeOf`, `endOf`, `coversProject` and `scopeLinks` replace `activeLinks`; `expectedLinks`,
  `expectedOutOfView`, `scopeCounts` and `subtreeCounts` take the project model and a scope.
- `setLinkTarget` becomes `setLinkDepth`, plus `setShowOutsideScope` and `applyLinkSettings`;
  `labelledCards` reads one labelled card pair and `openDisclosure` opens a `<details>` panel section so its
  content reaches the accessibility tree.
- The reference workload drills into the scope whose children carry the links, exercises all three controls
  there, covers the project, module, rolled-up-link and exact-link panels, drills one level further and
  records the request counters.
- The forwarding workload proves the rolled-up and the exact ends of the forwarded original, the per-original
  status evidence, the both-boundaries count, the frame folding inside `b` and the leaving-scope toggle.
- Plan 6B's RS13 source step now selects the rolled-up link that carries the non-behavioral boundary, and
  asserts the served imported-module and original-owner edges beside it.

### Documentation

The plan's status, the acceptance matrix's revision note, the roadmap row and its Plan 6D section.

## Evidence

### Matrix

| Row | Evidence | Result |
| --- | --- | --- |
| BD01-BD29 | Iterations 1-5; unchanged by this iteration | pass |
| BD30-BD32 | Component cases below, in their revised wording | pass |
| BD33 | Component case below, regression confirmation | pass |
| BD34-BD38 | Component cases below, in their revised wording | pass |
| BD39 | Reference browser workload below | pass |
| BD40 | Forwarding browser workload below | pass |
| BD41 | Dependencies browser workload, regression confirmation | pass |
| BD42 | Reference and dependencies workloads, regression confirmation | pass |
| BD43 | Verification below, regression confirmation | pass |
| BD44 | Pure `nested-levels` case below | pass |
| BD45 | Pure sweep and component case below | pass |
| BD46 | Pure `nested-levels` case below | pass |
| BD47 | Component `forwarding` case below | pass |
| BD48 | Pure case below, over `reference` and `nested-levels` | pass |
| BD49 | Component `nested-levels` case below | pass |
| BD50 | Component `reference` case below | pass |
| BD51 | Component `reference` case below | pass |
| BD52 | Reference browser workload below | pass |

### The `nested-levels` fixture

`dependency-fixtures.ts` adds a presentation-owned structure and a hand-written model of the served C5 shape.
It is valid for pure and component rows only.

- Modules: `app` with `a` (children `left` and `right`), `b` (child `core`), `c` and `idle`.
- Eight authored edges give every C8 clause a case: `app/a/left -> app/b/core` (a grandchild of another
  module), `app/a/right -> app/b` and `app/a/left -> app/b` (two edges that collapse into one link inside
  `app/a`), `app/a -> app/a/left` and `app -> app/a/right` (the scope module's own source), `app/c -> app`
  (a link with no displayed end inside `app/a`), `app/a/left -> app/c` (an end shallower than the scope) and
  `app/a/left -> app/a/right` (an in-scope link).
- Both edge collections, the project total and the per-module rows are counted from the fixture's own
  evidence rows, so the model is internally consistent: 6 behavioral and 3 non-behavioral dependencies.
- The file also holds an independent mapping, `expectedScope`, `expectedEnd`, `expectedCoversProject` and
  `expectedScopeLinks`, which reads the project structure and the evidence rows only. Every pure case
  compares the implementation against it.

Its recorded roll-up, with every candidate node displayed and non-behavioral links shown:

| Scope | Nodes | Links | Pairs | Not drawn |
| --- | --- | ---: | --- | --- |
| project (frame `app`) | `a`, `b`, `c`, `idle` | 2 | 3/2 | 3/1 |
| `app/a` (frame `app/a`) | `left`, `right` | 5 | 5/2 | 1/1 |
| `app/b` (frame `app/b`) | `core` | 1 | 1/1 | 5/2 |

### BD44 and BD46: the scope mapping

Inside `app/a`, whose depth is 1, the scope is
`{ frameModule: 'app/a', nodes: ['app/a/left', 'app/a/right'], depth: 2 }` and `scopeEnd` maps:

| End | `level` | `exact` |
| --- | --- | --- |
| `app/a/left` | `app/a/left`, in scope | itself, in scope |
| `app/a` | the frame | itself, in scope |
| `app/b/core` (depth 2) | `app/b`, out of scope | itself, out of scope |
| `app/c` (depth 1) | itself, out of scope | itself, out of scope |
| `app` (depth 0) | itself, out of scope | itself, out of scope |

The case sweeps every scope of the fixture, both depth modes and every module, and compares the scope, the
mapping and `scopeCoversProject` with the independent calculation. The mapping takes neither the class filter
nor the settings, so no end can depend on them.

BD46 records, inside `app/a`: `app/a/left -> app/b/core` and `app/a/left -> app/b` collapse into one link
with `app/b` as its single out-of-view node; `app/c -> app` has no displayed end and is not drawn; and the
frame ends are drawn nowhere. The drilled-in view draws 5 links with `app`, `app/b` and `app/c` out of view.

### BD45: no drawn link maps to one node

The pure sweep runs every scope of `reference` in both depth modes, asserts that no link has equal ends, and
compares the whole drawn set with the independent calculation.

On `reference` (28 original-owner edges, 17/48 measured):

| Scope | Nodes | Links | Pairs |
| --- | --- | ---: | --- |
| project (frame `collection-review`) | `integration-tests`, `workspace` | 0 | 0/0 |
| `workspace` | `catalog`, `contracts`, `reviews`, `shared-ui` | 9 | 7/41 |

At the project scope 20 of the 28 edges are internal to one of the two nodes and the other 8 have a frame
end, so the scope draws nothing; the component case renders the view and records the empty drawn set. This is
the matrix's recorded exception. Drilling into `workspace` draws the 9 scope links, including
`catalog -> contracts` 0/9 and `reviews -> contracts` 0/24.

### BD47: a parent-and-child dependency

`forwarding`'s `app/b/core -> app/b` carries 0/1. The case sweeps every scope in `level` mode and finds it in
no drawn link: at the project scope both ends map to `app/b`, and inside `app/b` its provider is the frame.
`Exact module` keeps iteration 6's ends, so inside `app/b` it is drawn with `app/b` out of view. `app/b`'s
module panel reads `Uses` 1/0 `At this level` against 1/1 `Including internals`, and the drilled-in scope
panel reports `app/b`'s own source: `Uses` 1/0 and `Owned originals used by others` 0/1.

### BD48: a rolled-up link's counts

Over every `reference` scope the case compares each link's counts, sources and ordering with the independent
calculation, and confirms that the distinct pairs equal the sum of the contributing edges' counts. The two
agree at every scope, and at least one link has more than one source; the test calculates the pairs, so the
agreement is a result, not a substitution.

On `nested-levels` inside `app/a`, the link `app/a/left -> app/b` has two sources, whose evidence carries one
allowed, one limited and one denied row:

- counts 1/2, from three distinct `(consumer module, original)` pairs, one settled behavioral;
- `status` `denied`, over limited and allowed;
- `coverageIds` `['limit-nested-1']`, the sorted union;
- `sources` complete and ordered by consumer then provider: `app/a/left -> app/b`, then
  `app/a/left -> app/b/core`;
- the ID contains the scope: `scoped-link/1:level:app/a:...`.

### BD49: the leaving-scope toggle

Inside `app/a` the default draws 5 links, 4 of which leave the scope. Turning the toggle off draws only the
one in-scope link and no out-of-view node, and matches the independent calculation with
`showOutsideScope: false`. A selected leaving link is cleared when the toggle hides it, and the control is
absent at the project scope, which covers this single-root project.

### BD50: selection reconciliation

On `reference`: a rolled-up ID contains its scope and its depth mode, so drilling from `workspace` into
`catalog` and switching to `Exact module` each report `onSelectEdge(null)`. An exact selection survives the
same scope change while its link is still drawn, witnessed by `catalog/core` onto `contracts`. A module
selection survives while its node is displayed and is cleared when the scope makes it the frame. No
reconciliation invoked a data callback; the case fails if any of `onRefresh`, `onToggleExport`,
`onToggleDependency` or `onNavigateToScope` is called.

### BD51: the labelled panels

On `reference`:

| Panel | Filtered | Measured |
| --- | --- | --- |
| project scope, no selection | `This view` 0/0 | `Whole project` 17/48; `Not drawn at this level` 17/48 |
| inside `workspace`, no selection | `This view` 7/41 | `Whole project` 17/48; `Not drawn at this level` 10/7 |
| `workspace`'s own source | - | `Uses` 2/1 |
| `catalog` inside `workspace`, `Uses` | `At this level` 1/11 | `Including internals` 3/13 |
| `catalog` inside `workspace`, owned originals | `At this level` 3/0 | `Including internals` 6/2 |
| `catalog`, `Used through this module` | - | `Including internals` 6/2, in a disclosure |
| `reviews -> contracts` rolled up | `At this level` 0/24 | its contributing exact modules |

`This view` and `At this level` follow the drawn scope. `Whole project` and `Including internals` come from
the C5 model and change with no scope, control or filter.

### BD30-BD38 in their revised wording

- **BD30.** Inside `workspace` the default drawn set equals the independently calculated behavioral rolled-up
  links, every link carries `depthMode: 'level'` and at least one source, and `displayed` equals its
  behavioral count. No occurrence edge of the project model is drawn, and no non-behavioral-only rolled-up
  link appears. While the result is `waiting` or `analyzing` the scope's children stay drawn with no link and
  no out-of-view node.
- **BD31.** Over `reference`, the non-behavioral toggle and the depth selector each change the drawn set to
  its independent calculation, with the measured card unmoved, and `fetch` is never called. Controlled
  settings report the change and render only what the owner supplies.
- **BD32.** On `forwarding` the forwarded original rolls up to `app/a -> app/b` at the project scope and is
  exactly `app/a -> app/b/core`, with `app/b/core` out of view. The imported module `app/b` is the endpoint
  of no exact link and appears only in the `Imported through` breakdown. `bothBoundaries` draws one link and
  counts one headline dependency.
- **BD33.** Colour carries behavior and status over the rolled-up links: behavioral-allowed `#64748b`,
  behavioral-denied `#ef4444`, non-behavioral-limited `#fcd34d`, non-behavioral-allowed `#cbd5e1` and muted,
  non-behavioral-denied `#fca5a5`. Every link keeps the direction animation's dashes, width is bounded and
  logarithmic over the displayed count, and status comes from the contributing evidence, not from the
  settings.
- **BD34.** The project panel shows both labelled card pairs, the numbers not drawn at this level as their
  difference, displayed links, coverage, revision and input; the non-behavioral note reads `not drawn` or
  `shown` and the panel number does not move with it; no ratio, percentage, confidence or chart appears.
- **BD35.** The module panel shows `Uses` and `Owned originals used by others` as `At this level` against
  `Including internals`, and keeps `Used through this module` with its imported unit, measured only, in a
  disclosure with no `At this level` pair.
- **BD36.** The rolled-up panel lists its contributing exact modules and the summed imported-through
  breakdown, and its evidence rows name the exact consumer and owner. The exact panel keeps iteration 6's
  `Original-owner link` labels, lists only referenced classified originals and labels accesses as supporting
  occurrences.
- **BD37.** The scope, the filters and the out-of-view nodes follow the current scope's links; the class
  filter changes the displayed nodes without changing how an end maps, and a hidden child remains its links'
  related node; a settings or scope change reconciles or clears the selection by its exact ID. Node diameters
  are equal across four settings combinations.
- **BD38.** All three controls have labels and keyboard support, the leaving-scope toggle is absent at a
  scope that covers the project and present and checked in a drilled-in scope, and the nine dependency states
  remain distinguishable with the controls disabled while no model is loaded.

### BD39, BD40 and BD52: the browser gate

The raw artifact is [`evidence/iteration8-browser-acceptance.json`](../evidence/iteration8-browser-acceptance.json),
schema `ramify.resident-explorer-acceptance/1`, `status: passed`. It was measured from 19:53:25 to 19:56:39 UTC
with build identity `2588c6c1…60b15`, Chromium 151.0.7922.173 headless, Node v22.23.2 on Linux. Each workload
uses its own private endpoint directory, project copy, real daemon and explorer server. All six workloads
passed in one run: reference, toolkit, mutations, forwarding, dependencies and tree.

#### BD39 and BD52: reference (Collection Review)

`ramify explore` started the server. The page's diagram became ready at
`rev/1:b022f98f…:1`, `input/1:26e822be…7cb6`, 4.6 s after the page opened: complete coverage, 17 behavioral
and 48 non-behavioral dependencies, 116,219 B.

- **Project scope.** The subtitle read `Showing 2 of 15 modules, 0 displayed links`, and the drawn set was
  empty, as the independent calculation required. The panel read `This view` 0/0 against `Whole project`
  17/48, `Not drawn at this level` `17/48`, `Complete` and the input ID. The leaving-scope control was absent:
  this scope covers the project.
- **Drilled into `collection-review/workspace`.** All five control combinations drew exactly their
  independently calculated links, out-of-view nodes and `This view` numbers:

  | Setting | Links | Out-of-view | `This view` | Note |
  | --- | ---: | ---: | --- | --- |
  | level, with non-behavioral | 9 | 1 | 7/41 | `shown` |
  | level, with non-behavioral, leaving hidden | 5 | 0 | 2/34 | `shown` |
  | exact, with non-behavioral | 16 | 7 | 9/42 | `shown` |
  | exact, behavioral | 6 | 5 | 9/42 | `not drawn` |
  | level, behavioral (the default) | 4 | 1 | 7/41 | `not drawn` |

  `Whole project` stayed 17/48 throughout. The scope's own source reported `workspace`'s own rows, 2/1 and
  0/0.
- **Module panel.** `collection-review/workspace/catalog` read `Uses` 1/11 `At this level` against 3/13
  `Including internals`, owned originals 3/0 against 6/2, `Used through this module` 6/2 measured only in its
  disclosure, and `Links displayed` matched the independent count. Its export signature loaded.
- **Rolled-up link panel.** `collection-review -> catalog` 3/0 carried two sources, listed as
  `collection-review -> catalog` and `collection-review -> catalog/core`, with 2 imported modules and 3
  referenced originals. Its ID is
  `scoped-link/1:level:collection-review/workspace:["collection-review","collection-review/workspace/catalog"]`.
- **Exact link panel.** The same pair's exact edge read 2/0 with 1 imported module, under the
  `Original-owner link` heading. Switching the depth mode cleared the rolled-up selection.
- **Class filter.** Hiding `browser+ui` left `catalog`, `contracts` and `reviews` displayed and moved
  `shared-ui` to the related nodes, with the drawn links and the out-of-view set equal to the independent
  calculation for that displayed set. The rendered node count stayed at 5, because the mapping did not
  change.
- **Grandchild scope.** Inside `collection-review/workspace/catalog`, 3 links were drawn over 2 children with
  3 out-of-view nodes, again equal to the independent calculation.
- **Other interactions.** Sidebar resize, zoom and pan worked.
- **BD52.** Browser `dependencyView` requests were 5 before the controls and 5 after every control, selection
  and scope change. `behaviorRuns` and `dependencyDiagrams` were 1/1 after ready and unchanged afterwards.

#### BD40: forwarding

The modules are `fixture`, `a`, `b`, `b/a`, `c`, `d` and `e`, with partial coverage, 2 behavioral and 3
non-behavioral dependencies at `input/1:c21dc07e…b8f7`.

- **Rolled up at the project scope.** `a -> b` 1/1 and `d -> b` 1/0: the forwarded original that `b/a` owns
  rolls up to `b`. `This view` read 2/1, and `b`'s two forwarding uses of its own child are internal to the
  `b` node.
- **Per-original status.** The rolled-up `a -> b` is `denied`, its evidence rows are `act`
  behavioral/allowed and `secret` non-behavioral/denied, each with `Supporting occurrences: 1`, its
  `Rolled-up modules` section names the one exact edge `a -> b/a`, and its `Imported through` disclosure names
  `b`.
- **Exact ends.** `Exact module` drew 3 links, including `a -> b/a`, with `b/a` as the only out-of-view node.
  There is no `a -> b` original-owner edge and no exact link to the imported module.
- **Both boundaries.** `d -> b/a` reads 1/0 and is imported through `b` and `b/a`, with one original and two
  paths. `d`'s module panel reads `Uses` 1/0 at this level and 1/0 including internals, and `Links displayed`
  1.
- **Drilled into `b`.** The scope draws `a -> b/a` and `d -> b/a`; no drawn link has `b` as an end, because
  `scopeEnd` maps it to the frame. The own-source section reported `b`'s rows, `Uses` 0/2 and owned originals
  0/0. Turning the leaving-scope toggle off drew no link and only the scope's children.
- **No requests.** 2 `dependencyView` requests in total, both before the controls; the daemon counters stayed
  `behaviorRuns 1, dependencyDiagrams 1, dependencyDiagramInputChanges 0`.

#### Regression: BD41, BD42 and the other workloads

- **Toolkit.** 70/367 at `rev/1:27865ca8…:1`, 654,386 B, ready 10.9 s after the page opened.
- **BD41 and BD42** (dependencies workload). Before any diagram request, an ordinary check, a
  `--changed` check and a client check left `behaviorRuns 0, dependencyDiagrams 0,
  dependencyDiagramInputChanges 0`. The stale, superseded, unavailable, late-response, hidden-polling and
  server-close steps all passed: the hidden page sent 0 requests, the smallest visible poll gap was 1,006 ms,
  the server exited 100 ms after SIGINT and its analyzer 10 ms after the signal. Daemon `retainedBytes` went
  from 143,576 to 144,947 with a retained diagram on the mutation fixture, and from 1,311,004 to 1,358,816 on
  the reference.
- **Mutations (RS13).** The non-behavioral source step now selects the rolled-up link
  `scoped-link/1:level:fixture:["fixture/consumer","fixture/provider"]`, whose single source is the
  original-owner edge, counts 0/1 and `Supporting occurrences: 2`.
- **Tree (MT16).** The explorer bundle is 205,024 B gzipped, 11,151 B over the Plan 6B baseline and within
  the 25 KiB budget. The first-render, collapse and expand budgets passed.

## Verification

```sh
npx vitest run subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx          # 1 file, 13 passed
npx vitest run subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx  # 1 file, 38 passed
npx vitest run subs/presentation/subs/project-view/src/tests/ModuleTreeView.test.tsx       # 1 file, 11 passed
npx vitest run subs/explorer/src/tests/ProjectExplorerPage.test.tsx                        # 1 file, 12 passed
npx vitest run subs/explorer/src/tests/ProjectExplorerFocus.test.tsx                       # 1 file, 6 passed
npx vitest run subs/analysis/subs/descriptions/src/tests/descriptions.test.ts              # 1 file, 31 passed
npx vitest run subs/presentation/subs/project-view/src/tests subs/explorer/src/tests \
  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts                           # 11 files, 135 passed
npm run type-check                                                                         # clean
npm run explorer:build                                                                     # built
npm run build                                                                              # built
npm run check:self   # passed: 15 owners, 395 source files, 0 errors, 0 warnings, 0 analysis limits, 0 denied
npm run measure:project-explorer -- --output docs/plans/iteration-6d-behavioral-dependency-diagram/evidence/iteration8-browser-acceptance.json
                                                                                           # passed, all six workloads, 3 min 14 s
```

Cleanup:

- `dist/src/ramify daemon stop` stopped the resident daemon that `check:self` used.
- Every browser workload started and stopped its own daemon and server in a private endpoint directory.
- The only processes signalled were the servers and analyzers those workloads started, by PID.

The full test suite and a cucumber-viz audit were not run, so this is not the full-suite gate of the
implementation workflow. `npm run probe:modularity` was not rerun: no analysis, projection or DTO code
changed, so iteration 7's BD13 baselines still hold for this source.

## Deviations

- **`analysis/subs/descriptions`.** Its `descriptions.test.ts` holds the reviewed name list of every
  `module.ramify` in the project. Removing `DependencyLinkTarget` from the reusable interfaces required the
  one-name edit there, in an owner iteration 8 does not list. No description rule and no other name changed.
- **The roadmap.** Iteration 8 asked for no roadmap change, but the roadmap's Plan 6D row and section
  described the removed endpoint-projection control as delivered. Both now describe the roll-up and the three
  settings. Nothing about the daemon, its operation or its retention changed.
- **BD40's inside-`b` claim.** The real `forwarding` browser fixture has no edge from `b/a` onto `b`'s own
  source, so the frame folding there is witnessed by the mapping and by the scope's own-source panel rather
  than by a folded link. The folded link itself is witnessed on the mapped `forwarding` fixture in BD47.
- **BD39's scope.** The reference workload applies the three controls inside `workspace` rather than at the
  project scope, where the leaving-scope control does not apply and no link is drawn.
- **The class-filter step of BD39.** A filtered-out child keeps receiving its subtree's ends, so the rendered
  node count no longer falls when a class is hidden. The step now compares the displayed set, the drawn links
  and the related nodes with the independent calculation for that displayed set, and reads the subtitle's
  sub-module count.

## Limitations

- **The parent's own source has no node.** Decision 4 stands: a dependency whose only ends are a scope
  module's own source and one of its children is drawn at no scope and lives only in the panel numbers. On
  `reference` those are the 8 frame-end edges at the project scope and 3 inside `workspace`. The deferred
  option that gives the parent's own source its own node is not built.
- **`Not drawn at this level` is a difference, not a partition.** It is `Whole project` minus `This view`
  component by component, so it aggregates the internal, the folded and, when leaving links are hidden, the
  outside dependencies without separating them. Its text names the three causes.
- **`exact` mode still draws a module's own descendants.** `Exact module` deliberately keeps iteration 6's
  ends, so at the project scope it can draw a node onto its own descendant, with the descendant out of view.
  That is the mode's purpose and is not a roll-up defect.
- **Ordering.** Links and sources are ordered by comparing JavaScript strings, which is UTF-16 code-unit
  order. It equals UTF-8 byte order for every module ID the fixtures and both baselines contain.
- **Coverage limits.** Unchanged from iterations 1-3: `any` or unresolved references and unsupported syntax
  are unknown, an escaping namespace creates no fact, and the first release draws production source only.
- **`nested-levels`.** It is hand written, so it establishes BD44, BD46 and the status, coverage and ordering
  part of BD48 only. It never stands in for a served model.

## Handoff

- **C8-C10 functions.** `dependencyScope`, `scopeEnd`, `scopeDependencyLinks`, `scopeCoversProject`,
  `subtreeDependencyCounts` and `scopeLinkCounts` are exported from
  `subs/presentation/subs/project-view/src/dependency-graph.ts`. They are the basis for the deferred
  parent-own-source node: that option changes `dependencyScope` to add the frame module as a node and
  `scopeEnd`'s clause 2 to return it, and nothing else. No analysis, DTO or request changes with it.
- **Reusable interface exports.** `DependencyDepthMode` replaces `DependencyLinkTarget` in `presentation` and
  at the root; `DependencySettings`, `ActiveDependencyEdge` and `defaultDependencySettings` keep their names.
- **The removed control's replacement in the browser helpers.** `activeLinks` is replaced by `scopeLinks`,
  which takes the project model, a scope module and the settings; `setLinkTarget` is replaced by
  `setLinkDepth` and `setShowOutsideScope`, with `applyLinkSettings` for all three. `labelledCards` and
  `openDisclosure` read the labelled panels, and `scopeCounts` and `subtreeCounts` supply the panel numbers.
- **`reference` scope witnesses.** The project scope draws 0 links over 2 nodes, with 20 internal and 8
  frame-end edges; `workspace` draws 9 links carrying 7/41; `catalog` reads 1/11 against 3/13 and 3/0 against
  6/2. Every scope's distinct pairs equal the sum of its contributing edges' counts.
- **Scopes not verified against the measured totals.** None. `This view` plus `Not drawn at this level`
  equals `model.project` at every scope by construction, and the per-scope pair counts were compared with the
  contributing edges' sums at every `reference` scope and at every `nested-levels` scope.
- **Deferrals.** The parent-own-source node, test-source filters, runtime and type-load filtering, trends,
  confidence estimates, alternative layouts and module-move suggestions.
