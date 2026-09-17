# Iteration 9 results: The scope module's own source as a node

**Date:** 2026-09-17. **Mode:** direct work in worktree `/tmp/ramify-plan6d-behavioral-diagram`,
branch `feat/plan6d-behavioral-dependency-diagram`. It is based on the iteration 9 specification at `e6a3f7e`,
which stands on iteration 8's completion at `e302b29`. This report records the accepted
[iteration 9 revision](../main-plan.md#review-decisions) and
[C11](../contracts.md#c11-the-scope-modules-own-source-as-a-node).

| Commit | Content |
| --- | --- |
| `274bdb9` | The C11 scope, mapping, drawn node, control, selection and panel, with the pure and component cases and the browser helpers. |
| `6d2255e` | The own-source end's name in a rolled-up link panel. |
| this commit | This report, the plan and acceptance status, the roadmap prose and the raw browser artifact. |

The focused tests, the type-check, the explorer bundle and the self-check ran on `6d2255e`. The browser gate
ran on a build of `6d2255e`; this commit changes documents and the artifact only.

## Prerequisites

- BD01-BD52 passed in iterations 1-8, as the [gate report](iteration7-results.md) and the
  [scope roll-up report](iteration8-results.md) record.
- The iteration 9 revision, C11 and the edits it carries in C7-C10 were accepted at `e6a3f7e`.
- The daemon operation, the analyzer, the projection, the C5 DTO and the C7 hook are used exactly as
  delivered. No file under `analysis`, `daemon`, `service-api` or the analyzer entry changed, no DTO field was
  added and no new analysis run exists.

## Built

### `presentation/project-view [ui, browser]`

**`src/interfaces/dependency-view.ts`.** `DependencySettings` gains `showOwnSourceNode`.

**`src/dependency-graph.ts`** carries C11's scope and mapping, all pure:

- `ScopeNodeId` is a drawn node: a module ID, or an own-source node ID. `ownSourceNodeId(module)` is
  `own-source/1:<module ID>` and `ownSourceNodeModule(nodeId)` reads it back, or null for any other node ID.
- `DependencyScope` gains `ownSourceNode`, and `dependencyScope(model, scopeModuleId, showOwnSourceNode?)`
  sets it to the scope module when the control is on. It stays null at the project scope, whose frame may be
  the root module but which renders no control, and omitting the third argument keeps C8's folded scope.
- `ScopeEnd` gains `{ kind: 'own-source', module }`. Only clause 2 changed: the frame module's end is the
  own-source node while that node is drawn and the frame otherwise. Clauses 1 and 3 are untouched, and
  `exact` mode returns before clause 2.
- `scopeDependencyLinks` maps each drawn end to its node ID, groups by the ordered pair of node IDs, treats an
  own-source end as displayed and in scope, and leaves clauses 3, 6, 7, 8, 9 and 10 as they stand. An
  own-source link's counts are therefore its distinct `(frame module, original)` pairs, its status, coverage
  IDs, `sources`, `leavesScope` and ordering follow C8 unchanged, and `ActiveDependencyEdge.consumer` and
  `provider` are `ScopeNodeId`.
- `ownSourceLabel(module)` is `<module name> · own source`, and `ownedSourceFiles(module)` moved here from
  `ModuleGraphRadial.tsx`, because both the node and its panel count them.
- `subtreeDependencyCounts`, `scopeLinkCounts`, `scopeCoversProject`, `edgeStatus` and `linkWidth` are
  unchanged, and `subtreeDependencyCounts` is never called with an own-source node ID.

**`src/ProjectExplorerView.tsx`.**

- The scope takes the control's effective value, `showOwnSourceNode && depthMode === 'level'`: `Exact module`
  already draws the scope module itself, so the node is drawn only where the control is enabled.
- The own-source node reaches the graph beside the displayed modules. The displayed set for the class filter
  and for `nodeDiameters` stays the child modules; the drawn nodes add the own-source node, which counts as
  displayed for C9's module effect, never enters the out-of-view set and is kept out of the module lookups by
  `ownSourceNodeModule`.
- The `Show this module's own source as a node` checkbox is rendered where the view has a scope module, is off
  by default and is disabled in `Exact module` without losing its value.
- Selecting the node shows its panel: the `<module name> · own source` header, the module's directory and the
  statement that the node is that module's own source, not its subtree; `Uses` and
  `Owned originals used by others` as `At this level` against `Excluding internals`; the measured imported
  unit, `Excluding internals` only, in a disclosure; `Links displayed`, `Owned source files` and the coverage
  notes naming the module; and the hint that its `Including internals` numbers appear on its own node in the
  enclosing scope.
- The project panel's `Scope's own source` statement becomes the statement that the own source is drawn as its
  own node here, and `Not drawn at this level` then names only the internal and the outside causes.
- A rolled-up link panel names an own-source end `<module name> · own source` instead of its raw node ID, and
  its heading says what each end stands for: one module's own source, everything under a module, or, in
  `Exact module`, one exact module.

**`src/ModuleGraphRadial.tsx`, `src/moduleGraphShared.ts`, `src/project-view.css`.** `ModuleGraphProps` gains
`ownSourceNode`. The radial graph takes it into its node ID set and its ring, labels it, renders it as a
rounded square in the frame module's tag-class colour with `data-own-source` and no sub-module count, and
never drills into it. `nodeDiameters` still takes the displayed child modules only; `ownSourceDiameter`
applies that same scale to the frame module's owned source files, clamped to the existing minimum and maximum.
Link colour, width, status and the direction animation are unchanged.

**`module.ramify`, `README.md`.** The reusable interface exports add `ScopeNodeId`, `ownSourceNodeId` and
`ownSourceNodeModule` beside `ActiveDependencyEdge` and `defaultDependencySettings`, in `presentation` and at
the root, and the prose describes the four settings and the own-source node.

### `explorer [ui, browser, dispatch]`

The hook, the requests and the settings state are unchanged; `defaultDependencySettings` now carries
`showOwnSourceNode: false`. The page's data effect no longer clears a selection that names the own-source
node, because that ID names no module of the model; the view reconciles it.

### `integration-tests [testing, ui, dispatch]`

`src/browser-acceptance.ts` learns the node in its independent calculation: `scopeOf` takes the control and
returns `ownSourceNode`, `endOf` gains the own-source end, `scopeLinks` groups by node ID, `drawnNodesAt` adds
the node to a scope's drawn nodes, `expectedOutOfView` excludes it, and `applyLinkSettings` sets the new
control before or after the depth mode, because it is disabled in `Exact module`. The reference workload adds
two control combinations and an own-source step that compares the drawn links, the node and every panel number
with that calculation.

### Documentation

The plan's status, the acceptance matrix's revision note, the roadmap row and its Plan 6D section.
`analysis/subs/descriptions`' reviewed name list records the three added exposures; no description rule
changed.

## Evidence

### Matrix

| Row | Evidence | Result |
| --- | --- | --- |
| BD01-BD29 | Iterations 1-5; unchanged by this iteration | pass |
| BD30-BD43 | Component, browser and regression cases; unchanged by this iteration | pass |
| BD44 | Pure `nested-levels` case, in its qualified wording, at the control's default | pass |
| BD45, BD46, BD48-BD50, BD52 | Iteration 8's cases, re-run unchanged | pass |
| BD47, BD51 | Iteration 8's cases, in their qualified wording, at the control's default | pass |
| BD53 | Pure `nested-levels` case below | pass |
| BD54 | Pure and component `nested-levels` and `forwarding` cases below | pass |
| BD55 | Pure `reference` case below | pass |
| BD56 | Component `reference` case below | pass |
| BD57 | Component `reference` case below | pass |
| BD58 | Component `nested-levels` case below | pass |
| BD59 | Component `reference` case below | pass |
| BD60 | Component `reference` case below | pass |
| BD61 | Reference browser workload below | pass |

### BD53: the scope and the changed clause

`nested-levels`, inside `app/a` with the control on, returns
`{ frameModule: 'app/a', nodes: ['app/a/left', 'app/a/right'], depth: 2, ownSourceNode: 'app/a' }` and maps
`app/a` to `{ kind: 'own-source', module: 'app/a' }`, which is in scope. Clauses 1 and 3 give the ends BD44
records: `app/a/left` to itself in scope, `app/b/core` to `app/b` out of scope, and `app/c` and `app` to
themselves out of scope. At the project scope `frameModule` is `app` and `ownSourceNode` is null, so `app`
still maps to the frame. The case sweeps every scope, both control values, both depth modes and every module
against the independent mapping in `dependency-fixtures.ts`, confirms that `exact` gives the same ends with
the control on and off, and confirms that no module ID is an own-source node ID. The mapping takes neither
the class filter nor the other settings.

### BD54: both directions

| Fixture | Scope | Link | Counts | Folded at the default |
| --- | --- | --- | --- | --- |
| `nested-levels` | `app/a` | own source of `app/a` -> `app/a/left` | 1/0, allowed | yes |
| `forwarding` | `app/b` | `app/b/core` -> own source of `app/b` | 0/1 | yes, BD47's edge |

Each link's ID, endpoints, counts and status equal the independent calculation, each link's single source is
the exact edge the fixture declares, and switching the control off folds it again while every other link keeps
its drawn shape. The component renders both, with `ownSourceNode` passed to the graph and removed again with
the control.

### BD55: the reference scope

Inside `collection-review/workspace` the roll-up folds 3 edges into the frame at the control's default. With
the control on exactly those 3 become drawn, grouped by their mapped node pairs into 3 links, and every other
link keeps its endpoints, counts, status, `sources` and ID. The project scope still draws 0 links: its 8
folded edges stay folded, because `ownSourceNode` is null there whatever the control's value.

### BD56: the numbers this view moves

On `reference` inside `collection-review/workspace`, with non-behavioral links shown. The panel numbers are
the scope's links before that display filter, so they do not move with it:

| | Links | `This view` | `Not drawn at this level` | `Whole project` |
| --- | ---: | --- | --- | --- |
| control off | 9 | 7/41 | 10/7 | 17/48 |
| control on | 12 | 9/42 | 8/6 | 17/48 |

The three own-source links carry 2/1 distinct pairs, exactly the amount `This view` rises and
`Not drawn at this level` falls, component by component; `This view` plus `Not drawn at this level` still
equals `Whole project`. With the control on the not-drawn explanation names only the internal and the outside
causes, and the `Scope's own source` section states that the own source is drawn as its own node here.

### BD57: the control

Absent at `reference`'s project scope, although its frame is the root module. In a drilled-in scope it is a
labelled checkbox named `Show this module's own source as a node`, off by default, keyboard-reachable like the
other checkboxes, and disabled with its value kept while `Exact module` is selected, where no own-source node
and no own-source link is drawn. Toggling it invoked `onDependencySettingsChange` once and nothing else; the
case fails if any of `onRefresh`, `onToggleExport`, `onToggleDependency`, `onDrillDown` or `onNavigateToScope`
is called.

### BD58: the drawn node

On `nested-levels` inside `app/a` the graph receives one own-source node. Its data carries
`name: 'a · own source'`, `ownSourceModule: 'app/a'` and `subModuleCount: 0`; the rendered node carries
`data-own-source="app/a"`, the same accessible name, `border-radius: 16px` and the
`module-arch__radial-node--own-source` class, against a module node's `50%` and absent attribute. Its link
onto `app/a/left` is drawn, activating it selects it and invokes no `onDrillDown`, and the displayed modules'
diameters are identical with the control on and off.

### BD59: the own-source panel

On `reference` inside `collection-review/workspace`, with the node selected: the header reads
`workspace · own source`; `Uses` shows `At this level` 2/1, the independently calculated own-source links,
against `Excluding internals` 2/1, the scope module's served row; `Owned originals used by others` shows 0/0
against 0/0; `Used through this module` shows 0/0, `Excluding internals` only, inside its disclosure;
`Links displayed` is 3 and `Owned source files` 4; and the panel hints that the module's
`Including internals` numbers appear on its own node in the enclosing scope.

### BD60: selection

An own-source node selection survives while the node is drawn and its panel is shown, and is reported as
`onSelectModule(null)` when the control goes off, when the scope changes and when the depth mode becomes
`exact`. A selected own-source link leaves the drawn set under those same three changes and is reported as
`onSelectEdge(null)` by C9's existing effect; its panel names the node, not its raw ID. A child-to-child link
selection and a module selection survive the toggle, because their IDs do not change with it. No
reconciliation invoked a data callback.

### BD61: the browser gate

The raw artifact is [`evidence/iteration9-browser-acceptance.json`](../evidence/iteration9-browser-acceptance.json),
schema `ramify.resident-explorer-acceptance/1`, `status: passed`. It was measured from 23:03:54 to
23:07:10 UTC with build identity `fb18fca7…d31f24`, Chromium 151.0.7922.173 headless, Node v22.23.2 on Linux. Each
workload used its own private endpoint directory, project copy, real daemon and explorer server. All six
workloads passed in one run: reference, toolkit, mutations, forwarding, dependencies and tree.

On `reference`, drilled into `collection-review/workspace`, the seven control combinations each drew exactly
their independently calculated links, drawn nodes, out-of-view nodes and `This view` numbers:

| Setting | Links | Out-of-view | `This view` |
| --- | ---: | ---: | --- |
| level, non-behavioral | 9 | 1 | 7/41 |
| level, non-behavioral, leaving hidden | 5 | 0 | 2/34 |
| level, non-behavioral, own source | 12 | 1 | 9/42 |
| level, non-behavioral, own source, leaving hidden | 7 | 0 | 4/34 |
| exact, non-behavioral | 16 | 7 | 9/42 |
| exact, behavioral | 6 | 5 | 9/42 |
| level, behavioral (the default) | 4 | 1 | 7/41 |

The own-source step recorded the node `own-source/1:collection-review/workspace`, labelled
`workspace · own source`, drawn with `border-radius: 16px` and no sub-module badge, and its three links:

| Link | Counts | Leaves the scope |
| --- | --- | --- |
| own source -> `collection-review` | 0/1 | yes |
| own source -> `collection-review/workspace/catalog` | 1/0 | no |
| own source -> `collection-review/workspace/reviews` | 1/0 | no |

`This view` went from 7/41 to 9/42 and `Not drawn at this level` from `10/7` to `8/6`, with `Whole project`
17/48 throughout; the not-drawn text no longer names folding. The node's panel read `Uses` 2/1 `At this level`
against 2/1 `Excluding internals`, owned originals 0/0 against 0/0, `Used through this module` 0/0 in its
disclosure, and `Links displayed` 3. Selecting one of its links showed the rolled-up panel with its calculated
counts. Turning the control off restored the folded default and cleared the selection.

**BD61's counters.** Browser `dependencyView` requests were 5 before the controls and 5 after every control,
selection and scope change, including the new one. The daemon's `behaviorRuns` and `dependencyDiagrams` stayed
at their values from the first ready response, and no `dependencyDiagramInputChanges` occurred.

### Regression

- **BD39, BD40 and BD52.** The reference and forwarding workloads passed with the control at its default and
  through its combinations; the forwarding workload made 2 `dependencyView` requests, both before the
  controls, with `behaviorRuns 1, dependencyDiagrams 1, dependencyDiagramInputChanges 0`.
- **BD41 and BD42.** The dependencies workload's ordinary check, `--changed` check and client check again left
  `behaviorRuns 0, dependencyDiagrams 0, dependencyDiagramInputChanges 0` before any diagram request, and the
  stale, superseded, unavailable, late-response, hidden-polling and server-close steps passed.
- **Tree (MT16).** The explorer bundle is 206,122 B gzipped, 12,249 B over the Plan 6B baseline and within the
  25 KiB budget. The first-render, collapse and expand budgets passed.
- **BD43.** The focused tests, the type-check, the production build and the self-check pass on one source
  revision, as the verification below records.

## Verification

```sh
npx vitest run subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx          # 1 file, 14 passed
npx vitest run subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx  # 1 file, 45 passed
npx vitest run subs/explorer/src/tests/ProjectExplorerPage.test.tsx                        # 1 file, 12 passed
npx vitest run subs/explorer/src/tests/ProjectExplorerFocus.test.tsx                       # 1 file, 6 passed
npx vitest run subs/presentation/subs/project-view/src/tests subs/explorer/src/tests \
  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts                           # 11 files, 143 passed
npm run type-check                                                                         # clean
npm run explorer:build                                                                     # built
npm run build                                                                              # built
npm run check:self   # passed: 15 owners, 395 source files, 0 errors, 0 warnings, 0 analysis limits, 0 denied
npm run measure:project-explorer -- --output docs/plans/iteration-6d-behavioral-dependency-diagram/evidence/iteration9-browser-acceptance.json
                                                                                           # passed, all six workloads
```

Cleanup:

- `dist/src/ramify daemon stop` stopped the resident daemon that `check:self` used.
- Every browser workload started and stopped its own daemon and server in a private endpoint directory.
- The only processes signalled were the ones those workloads started, by PID.

The full test suite and a cucumber-viz audit were not run, so this is not the full-suite gate of the
implementation workflow. `npm run probe:modularity` was not rerun: no analysis, projection or DTO code
changed, so iteration 7's BD13 baselines still hold for this source.

## Deviations

- **The rolled-up link panel's naming.** C11 fixes the own-source node's own panel but not how a rolled-up
  link names that end. Left alone it printed the raw node ID, so `6d2255e` names it
  `<module name> · own source` and rewrote the link heading to say what each end stands for. No number, ID or
  drawn link changed.
- **`ownedSourceFiles` moved.** The own-source panel counts the module's own source files, as C11 requires,
  so that helper moved from `ModuleGraphRadial.tsx` into the pure `dependency-graph.ts` rather than making the
  view import the graph component.
- **The explorer page's data effect.** Iteration 9 lists no page change, but the page cleared any selected
  module ID the model does not contain, which would have dropped an own-source selection on every new model.
  Its guard now skips an own-source node ID and leaves the reconciliation to the view.
- **`analysis/subs/descriptions`.** Its `descriptions.test.ts` holds the reviewed name list of every
  `module.ramify`, so the three added exposures required an edit in an owner iteration 9 does not list. No
  description rule changed.
- **The browser run.** The gate ran twice: once on `274bdb9`'s build, which passed, and once on `6d2255e`'s,
  whose artifact is the recorded one. Only the link panel's prose differs between them.

## Limitations

- **The own-source node is not a `ModuleId`.** It counts as displayed, never enters the out-of-view set, never
  reaches `subtreeDependencyCounts` and the class filter does not select it. A consumer that treats every
  drawn node ID as a module ID must call `ownSourceNodeModule` first.
- **`Not drawn at this level` is still a difference, not a partition.** With the control on it names the
  internal and the outside causes only, but it remains `Whole project` minus `This view`.
- **The legend and the link tooltip.** The legend lists the tag classes of the displayed child modules, so a
  frame module whose class no child shares is not in it, and the link tooltip spells node IDs, so an
  own-source end appears there as `own-source/1:<module>`.
- **A refresh keeps an own-source selection only while the node is drawn.** The page no longer clears it on a
  new model, and the view clears it whenever the control, the scope or the depth mode stops drawing the node.
- **`exact` mode is unchanged.** It already draws the scope module itself, so the control is disabled there
  and changes no end.
- **`nested-levels`.** It is hand written, so it establishes BD53, BD58 and its half of BD54 only. It never
  stands in for a served model.
- **Coverage limits.** Unchanged from iterations 1-3: `any` or unresolved references and unsupported syntax
  are unknown, an escaping namespace creates no fact, and the first release draws production source only.

## Handoff

- **The C11 functions.** `dependencyScope`'s third argument, `ownSourceNodeId`, `ownSourceNodeModule`,
  `ownSourceLabel` and `ownedSourceFiles` are exported from
  `subs/presentation/subs/project-view/src/dependency-graph.ts`, beside the C8-C10 functions iteration 8
  handed off. `ScopeNodeId`, `ownSourceNodeId` and `ownSourceNodeModule` are relayed through `presentation`
  to the root.
- **`reference` witnesses.** Inside `collection-review/workspace` the control draws exactly 3 own-source
  links carrying 2/1 distinct pairs: onto `collection-review` 0/1 and leaving the scope, onto `catalog` 1/0
  and onto `reviews` 1/0. `This view` goes 7/41 to 9/42 and `Not drawn at this level` 10/7 to 8/6, against an
  unchanged `Whole project` 17/48. The project scope's drawn set stays empty, with its 8 folded edges
  undrawn.
- **Scopes not verified against the served row.** None. Every own-source link of `reference` was compared
  with the scope module's served row, in the component case and in the browser: `workspace`'s `Uses` row 2/1
  equals the pairs its drawn own-source links carry.
- **The control's accessible name** is `Show this module's own source as a node`; **the node's label and
  accessible name** are `<module name> · own source`; **its encoding** is a rounded square,
  `border-radius: 16px`, in the frame module's tag-class colour, with `data-own-source="<module ID>"`, no
  sub-module count and no drill-down.
- **The default view is unchanged.** The control is off by default, and at every `reference` scope the
  default drawn set, its IDs and its counts are iteration 8's.
- **Deferrals.** Test-source filters, runtime and type-load filtering, historical trends, confidence
  estimates, alternative layouts and module-move suggestions.
