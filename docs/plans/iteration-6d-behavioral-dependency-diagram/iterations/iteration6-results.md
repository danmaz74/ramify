# Iteration 6 results: Render dependency controls and panels

**Date:** 2026-09-17. **Mode:** direct work in worktree `/tmp/ramify-plan6d-behavioral-diagram`,
branch `feat/plan6d-behavioral-dependency-diagram`. It is based on iteration 5 at `0d58cda`.
The implementation commit is `b5d78de`. The verification below was run on that source tree before committing.

## Provenance

An earlier iteration 6 agent from another session left an uncommitted partial draft in this worktree and was stopped.
This iteration treated that draft as unreviewed input. Every changed and new file was read. The parts that meet
iteration 6, C5 and BD30–BD38 were kept, and the rest was corrected:

- **Status.** The draft computed a link's status only from the evidence shown under the current setting. The main plan
  requires it over the per-original status of the edge's evidence. A link's status is now fixed, and settings never
  recolour a link.
- **Page test race.** The draft's rewritten page test clicked a module before the class filters were initialized, and
  failed intermittently under load. It now awaits the module.
- **Link coverage.** A link's coverage IDs are now resolved against the displayed revision's coverage notes.
- **Alternate role.** The title of the alternate role is no longer repeated inside its disclosure.
- **Legend.** It now also describes the module badge and module size.
- **Unused section key.** `edge-occurrences` was removed.
- **Missing parts.** Exposures and relays, the description fixture and the README update were added.

The draft's edit to `subs/explorer/src/ProjectExplorerPage.tsx` was kept, because type-check requires it; see
Deviations. No other page wiring was added.

## Prerequisites

- Iteration 5's C5 declarations in `subs/service-api/src/interfaces/explorer-dependencies.ts`, the pure
  `createExplorerDependencyModel` and the real Collection Review fixtures in
  `scripts/probes/results/dependency-view/` are present.
- `ModuleGraph.test.tsx`, `ProjectExplorerView.test.tsx`, `ModuleTreeView.test.tsx` and the explorer page tests passed
  at `0d58cda`, as iteration 5 recorded.

## Built

### `presentation/project-view [ui, browser]`

- `src/interfaces/dependency-view.ts` declares the view's copy of the C5 model, because service-api's `dispatch` exports
  cannot be imported here. Each name maps to one C5 type:

  | View name | C5 name |
  | --- | --- |
  | `DependencyGraphModel` | `ExplorerDependencyModel` |
  | `DependencyGraphCount` | `ExplorerDependencyCount` |
  | `DependencyGraphImportedCount` | `ExplorerImportedCount` |
  | `DependencyGraphModule` | `ExplorerDependencyModule` |
  | `DependencyGraphEvidence` | `ExplorerDependencyEvidence` |
  | `DependencyGraphImportedEdge` | `ExplorerImportedDependencyEdge` |
  | `DependencyGraphOriginalEdge` | `ExplorerOriginalDependencyEdge` |

  The serialized shape is the same field for field. The file also declares:
  - `DependencyGraphEdge`, the union of the two edge types;
  - `DependencyLinkTarget` and `DependencySettings`, with fields `showNonBehavioral` and `linkTarget`;
  - `DependencyPhase`, which is C7's `idle | waiting | analyzing | ready | superseded | unavailable`;
  - `DependencyGraphState`, which is `{ data, phase, reason, isStale }`.
- `src/dependency-graph.ts` exports:
  - **Defaults.** `defaultDependencySettings` is `{ showNonBehavioral: false, linkTarget: 'imported-module' }`.
    `idleDependencyGraph` is the state for no request.
  - **Active links.** `activeDependencyEdges(model, settings)` reads exactly one collection: `importedModuleEdges` or
    `originalOwnerEdges`. It returns `ActiveDependencyEdge` values with:
    - the model's projection-specific `id`, `projection`, `consumer` and `provider`;
    - `behavioral` and `nonBehavioral` in the projection's unit;
    - `displayed`, the behavioral count plus the non-behavioral count when the setting is on;
    - `pattern`, which is `solid` when any behavioral count exists and otherwise `dotted`;
    - `status`, which is denied, then limited, then allowed over all of the edge's evidence;
    - `source`, the model edge.

    A link with `displayed` 0 is omitted. No other input creates a link.
  - **Width.** `linkWidth(displayed)` is `1.5 + 1.1·log2(count)`, bounded to [1.5, 6].
  - **Helpers.** `edgeStatus` and `edgeCounts`.
- `src/moduleGraphShared.ts`:
  - `ModuleGraphProps.edges` and `GraphSelection.edge` are now `ActiveDependencyEdge`.
  - A link's colour is its status: neutral, amber for limited, red for denied. An allowed non-behavioral-only link is
    muted.
  - The pattern is solid, or dotted (`2 5`) for non-behavioral-only links. Opacity is 0.85, or 0.7 for dotted links.
  - The width is `linkWidth(displayed)`.
- `src/ModuleGraphRadial.tsx`:
  - **Node size.** A node's diameter uses a square-root scale of its owned source files over the modules in view.
    Resources are excluded. The diameter does not depend on dependency settings or links, and `approximateIcs` and the
    `~NN` complexity pill were removed.
  - **Node label.** It shows the owned source-file count.
  - **Node badge.** It counts the denied or limited displayed outgoing links, or reads `allowed` when the module has any
    displayed outgoing link.
  - **Links.** Their flowing dash animation was removed, and each link has a tooltip with both counts in its unit.
- `src/ModuleGraphLegend.tsx` describes:
  - solid (behavioral or mixed) and dotted (non-behavioral only) links;
  - the colours for limited and denied status;
  - the module badge, the width unit and the module size unit.
- `src/ProjectExplorerView.tsx`:
  - **Props.** It adds the optional `dependencies: DependencyGraphState` (default `idleDependencyGraph`),
    `dependencySettings` and `onDependencySettingsChange`. With `dependencySettings` omitted, the view keeps its own
    local settings, starting from the defaults. With it supplied, the view is controlled. Loading the project
    (`isLoading`, `error`, `unavailableReason`) is independent of `dependencies`.
  - **Controls.** A `Dependencies` group sits beside the declared-tag filters. It holds a `Show non-behavioral
    dependencies` checkbox and a `Link targets` radiogroup of two buttons. The radiogroup uses a roving tab index;
    arrow keys, Home and End change and focus the option. Both controls are disabled without dependency data. A change
    calls only `onDependencySettingsChange`.
  - **Graph input.** The graph receives only active links touching a module in view, with both endpoints in view or out
    of view. The project model's occurrence edges are never passed to the graph.
  - **Reconciliation.** Out-of-view related modules are computed from the active links. A selected link is cleared when
    its ID is absent from the links in view after a settings, scope, filter or data change. Otherwise it is kept, and
    the panel reads the current active link with that ID.
  - **Header.** The subtitle shows `N displayed links` only when dependency data exists. A dependency status line has a
    distinct `data-dependency-state` for each state.

    | State | Text |
    | --- | --- |
    | `idle` | `Behavioral dependencies have not been requested` |
    | `waiting` | `Computing behavioral dependencies: waiting for another analysis` |
    | `analyzing` | `Computing behavioral dependencies` |
    | `unavailable` | `Dependency diagram unavailable: <reason>.` |
    | `superseded` | `Dependency result superseded: <reason>. Refresh to update.` |
    | `stale` | `Stale dependency diagram for input <id>. Refresh to update.` |
    | `partial` | `Partial coverage: N unknown dependencies omitted` |
    | `zero` | `Measured zero dependencies` |
    | `complete` | `Behavioral dependencies complete` |

    A superseded or unavailable state keeps any supplied data drawn and says so.
  - **Project panel** (no selection). It shows:
    - the help line;
    - behavioral and non-behavioral headline cards, where the non-behavioral card says `not drawn` or `shown`;
    - displayed module links, coverage (`Complete` or `Partial: N omitted`), the revision and the input ID;
    - a warning with the unknown count and number of limits when coverage is partial.

    Without data, the cards are replaced by the dependency status text.
  - **Module panel.** It shows, in order:
    - `Uses` cards;
    - the active incoming role: `Used through this module` for imported modules, or `Owned originals used by others`
      for original owners;
    - the alternate role inside a `<details>` disclosure;
    - links displayed, owned files, subtree files and dependency coverage.

    `Selected symbols`, `Approx. complexity` and the old occurrence metrics are removed from the headline area. Import
    occurrences, denied/limited occurrences and the per-provider occurrence lists are in the collapsed `Source evidence:
    import occurrences` section.
  - **Imported-module link panel.** It shows:
    - `Behavioral` and `Non-behavioral used originals via this boundary`, and `Total classified originals via this
      boundary`;
    - the `Original owners` breakdown;
    - supporting consumer and `Imported module files`;
    - coverage IDs resolved to their notes;
    - the link's status and reason badges.
  - **Original-owner link panel.** It shows:
    - `Behavioral` and `Non-behavioral dependencies`, and `Total classified dependencies`;
    - the `Imported through` breakdown;
    - consumer and `Original declaration files`;
    - the same coverage and status.
  - **Evidence.** `Referenced originals` has one primary row per original. Under each row is one path per imported
    module, with its classification, status and reasons. Original-owner links also show `imported through M`. Each
    path shows `Supporting occurrences: N`. Only classified evidence exists in the model, so unused and unknown uses
    never appear.
- `src/project-view.css` adds styles for the controls, segmented radiogroup, status line, role sections, headline cards,
  disclosure, breakdowns, file groups and evidence rows. It removes the edge-flow animation.
- `module.ramify` adds the interfaces file with `expose-src *`, the type `ActiveDependencyEdge` and the value
  `defaultDependencySettings` tagged `[ui, browser]`, all to the parent. `README.md` describes the diagram.

### Relays and other owners

- `subs/presentation/module.ramify` P5 and root `module.ramify` P10 relay the twelve interface names,
  `ActiveDependencyEdge` and `defaultDependencySettings` to descendants, so `explorer` can use them in iteration 7.
  `descriptions.test.ts` lists the new statements.
- `subs/explorer/src/ProjectExplorerPage.tsx` removes only its old reconciliation of a selected edge against
  `data.edges`; see Deviations.
- `subs/explorer/src/tests/ProjectExplorerPage.test.tsx` replaces the old occurrence-edge reconciliation test. The new
  test shows that the unconnected page draws no occurrence edge, shows `not requested` and keeps the occurrences in the
  module's source evidence. The `dependencyView` stubs still throw.
- `subs/service-api/src/tests/dependency-model.test.ts` adds a fixture guard. It maps three diagrams through the real
  `createExplorerDependencyModel` and requires byte equality with
  `subs/presentation/subs/project-view/src/tests/fixtures/dependency-models.json`. Setting
  `RAMIFY_UPDATE_DEPENDENCY_FIXTURES=1` rewrites the fixture. The three diagrams are:
  - `forwarding`: BD25's diagram;
  - `bothBoundaries`: one original used behaviorally through `b` and `c` (limited), plus a type through `b`;
  - `zero`: a measured zero.

  Presentation reads the file as data and imports nothing from service-api.

### Fixtures

- `reference`: the real iteration 5 Collection Review `ready` dependency view and matching project view, checked for
  one revision. It has 17/48, 28 imported and 28 owner edges and complete coverage.
- The mapped models:

  | Model | Imported edges | Original-owner edges | Coverage |
  | --- | --- | --- | --- |
  | `forwarding` | a>b 1/0, a>c 0/2, b>c 1/0, b/core>b 0/1 | a>b/core 1/0, a>c 0/1, b>c 1/0, b/core>b 0/1 | partial, 1 unknown |
  | `bothBoundaries` | a>b 1/1, a>c 1/0 | a>b/core 1/0, a>c 0/1 | complete |
  | `zero` | none | none | complete, six zero rows |

- `forwardingProject()` is the matching project structure. Its modules have 1, 2, 4, 9, 3 and 1 source files and one
  resource each. It also has one occurrence edge that has no dependency and must never be drawn.
- `dependency-fixtures.ts` recalculates expected units from evidence rows, never from count fields:
  - imported units, one per evidence row;
  - `(consumer, original)` units, settled behavioral when any row is behavioral;
  - owner-edge, project and module-role counts from those units.

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| BD30 | See the BD30 witnesses below | pass |
| BD31 | See the BD31 witnesses below | pass |
| BD32 | See the BD32 witnesses below | pass |
| BD33 | See the BD33 witnesses below | pass |
| BD34 | See the BD34 witnesses below | pass |
| BD35 | See the BD35 witnesses below | pass |
| BD36 | See the BD36 witnesses below | pass |
| BD37 | See the BD37 witnesses below | pass |
| BD38 | See the BD38 witnesses below | pass |

BD30 witnesses, on `reference` scoped to `collection-review/workspace`:

- **Default links.** The graph receives exactly the independently computed behavioral imported-module links in scope,
  with matching endpoints and counts. `displayed` equals the behavioral count.
- **Absent links.** No non-behavioral-only link and no project occurrence-edge ID is drawn. Over the whole collection,
  the default active IDs equal the behavioral imported IDs.
- **Pending.** With `waiting` and `analyzing` and no data, the same scope's module nodes render, with no links, no
  out-of-view modules and `Computing behavioral dependencies`.

BD31 witnesses, on `reference`:

- **Data callbacks fail.** Refresh, export detail, occurrence detail, drill-down and scope callbacks all throw, and
  `fetch` is spied to throw.
- **Toggle.** It reports `{ showNonBehavioral: true, linkTarget: 'imported-module' }`. Every drawn link's `displayed`
  equals its independent behavioral plus non-behavioral units, and non-behavioral-only links appear. The headline
  cards keep 17/48 and switch to `shown`.
- **Original owners.** Every link uses the independent owner endpoints and counts. Owner units sum to the headline
  counts.
- **Controlled settings.** A click reports the change but does not render it until the owner supplies it.
- **No data calls.** `fetch` and every data callback were never called.

BD32 witnesses, on the mapped models with the forwarding project:

- **Forwarding.** Imported modules draw `a>b 1/0` and `b>c 1/0`. Original owners draw `a>b/core 1/0` and `b>c 1/0`,
  with `b/core` out of view.
- **Both boundaries.** Imported modules draw `a>b 1/1` and `a>c 1/0`. Original owners draw one link, `a>b/core 1/0`.
  The project cards read 1/1.

BD33 witnesses, on the rendered radial graph:

- **Pattern and colour.** Mixed `a>b` is solid and neutral. Behavioral-limited `a>c` is solid and amber.
  Non-behavioral-only denied `a>c` is dotted and red. Non-behavioral-only allowed `b/core>b` is dotted, muted and more
  transparent.
- **Status is independent of settings.** The owner link `a>b/core`, behavioral through `b` (allowed) and non-behavioral
  through `c` (denied), is solid and denied with the setting both off and on.
- **Width.** `linkWidth(1)` is the minimum. Doubling adds a constant, and 1,000,000 is capped at the maximum. The
  rendered width equals `linkWidth(displayed)`.

BD34 witnesses, on `forwarding`:

- **Cards.** They equal the independent project units, with `not drawn` and then `shown`.
- **Metrics.** `Displayed module links` equals the graph's link count in both settings. Coverage reads `Partial: 1
  omitted`, and the warning names 1 unknown dependency. Revision and input ID are shown, with the help text.
- **Nothing else.** The sidebar contains no ratio, percentage, confidence, pie, `svg` or `canvas`.
- **Measured zero.** On `zero`, the cards read 0/0, coverage `Complete` and 0 displayed links.

BD35 witnesses, on module `app/b` in `forwarding`:

- **Order.** With imported modules, the sections are `Uses` (primary), `Used through this module` (primary) and `Owned
  originals used by others` (disclosure). With original owners, the two incoming roles swap.
- **Counts.** Each group equals the independent units: `usedThrough` 1/1 and `ownedUsedByOthers` 0/1, so the units
  differ.
- **Labels.** Cards say `used originals via this module`.
- **Stability.** `Uses` is unchanged by either setting. `Links displayed` follows the active links.

BD36 witnesses, on `forwarding`:

- **Imported link `a>c`** (setting on):
  - It shows the `via this boundary` labels, and the cards equal the independent units, 0/2, total 2.
  - The owner breakdown is `core: 0 behavioral, 2 non-behavioral`.
  - It lists `Imported module files`, not original declaration files.
  - The evidence rows are exactly `run` and `x`. The unknown path of `x` and every unused import are absent, and two
    rows each show `Supporting occurrences: 1`.
- **Owner link `a>b/core`:**
  - It shows the ordinary dependency labels, no `via this boundary` text, and total `Total classified dependencies`.
  - The imported-through breakdown is `b 1/0`, `c 0/1`.
  - It lists `Original declaration files`.
  - It has one evidence row with two paths: behavioral/allowed/exposed through `b`, and non-behavioral/denied/not-visible
    through `c`.

BD37 witnesses:

- **Out of view.** On `forwarding`, `b/core` is out of view only when a non-behavioral link or an owner link reaches
  it.
- **Filters.** With only `untagged` selected, imported modules put `a` and `c` out of view, and original owners only
  `c`.
- **Scope.** Inside `b`, only `b/core>b` is drawn, with `b` out of view.
- **Selection.** On `bothBoundaries`, the imported and owner `a>c` IDs differ. Switching projection clears the selected
  imported `a>c`. The mixed `a>b` survives hiding non-behavioral links. A dotted link is cleared when hidden.
- **Node size.** Across all four settings, diameters are identical and follow source files 1 < 2 < 3 < 4 < 9, from 84
  to 170. No node carries a complexity score.

BD38 witnesses:

- **Controls.** The `Dependencies` group, `Show non-behavioral dependencies` checkbox and `Link targets` radiogroup have
  accessible names. The checked radio has tab index 0 and the other -1. ArrowRight, Home, End and ArrowLeft change and
  focus the selection, and Tab does not change it.
- **States.** `idle`, `waiting`, `analyzing`, `unavailable`, `superseded` with kept data, `stale`, `partial`, `zero` and
  `complete` each have a distinct marker and a distinct text:
  - modules render in every state;
  - links are drawn only when data exists and has links;
  - the controls are disabled exactly when there is no data.

### Regression

- `ModuleTreeView.test.tsx` and `module-tree.test.ts` pass unchanged. The tree's import summary was not touched.
- The explorer page, focus, module tree page and home tests pass.
- `auto-fit.test.tsx` passes unchanged.

### Rendered fixtures

A temporary Vite and Chromium harness rendered the real `ModuleGraphRadial` and `ProjectExplorerView` at 1600x1000.
The harness was removed from the worktree afterwards. There were no page errors and no horizontal overflow. DOM checks
agreed with the component tests:

| Screenshot | Links (colour, pattern, width) |
| --- | --- |
| reference default | 2 neutral solid, 1.5 |
| reference non-behavioral + owners | 1 muted dotted, 2 neutral solid |
| forwarding module `b` | 2 solid |
| forwarding owner link `a>b/core` | selected + 1 |
| forwarding imported `a>c` (on) | 4, selected dotted width 2.6, 1 muted dotted |
| both boundaries | neutral + amber solid |
| analyzing | 0 links |
| unavailable | 0 links |
| superseded with kept data | 2 links |
| zero | 0 links, `Measured zero dependencies` |

The ten PNGs and the harness sources are session scratch artifacts under
`/tmp/claude-1000/-ramify/a8d6b6d0-4bc2-44d5-b9a9-c72a13bded0c/scratchpad/shots/`. They are not committed, because
they total about 4.9 MB.

### Bundle size

These are `npm run explorer:build` outputs. The before build is the iteration 5 build of `da371aa`.

| Asset | Before | After | Change |
| --- | ---: | ---: | ---: |
| JS | 676,359 B (gzip 198,524) | 693,007 B (gzip 202,107) | +16,648 B (gzip +3,583) |
| CSS | 30,089 B (gzip 5,566) | 33,281 B (gzip 6,007) | +3,192 B (gzip +441) |

The existing Vite chunk-size warning is unchanged.

## Verification

```sh
npx vitest run subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx          # 12 passed
npx vitest run subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx  # 30 passed
npx vitest run subs/presentation/subs/project-view/src/tests/ModuleTreeView.test.tsx       # 11 passed
npx vitest run subs/presentation/subs/project-view/src/tests \
  subs/service-api/src/tests/dependency-model.test.ts subs/explorer/src/tests \
  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts                           # 12 files, 126 passed
npm run type-check                                                                         # clean
npm run explorer:build                                                                     # built
npm run build                                                                              # built
npm run check:self   # passed: 15 owners, 394 source files, 0 errors, 0 warnings, 0 analysis limits, 0 denied
```

The explorer page tests were also run ten times while the project-view tests ran concurrently, with no failure after
the race fix. The resident daemon that `check:self` used was stopped with `dist/src/ramify daemon stop`. The full test
suite was not run.

## Deviations

- **Page edit.** `ProjectExplorerPage.tsx` lost its selected-edge reconciliation against `data.edges`, because
  `GraphSelection.edge` is now an active dependency link and the old code no longer type-checks. The view now clears a
  selection whose projection-specific ID is absent. The page still supplies no dependency state, so the live page shows
  `not requested` and draws no links until iteration 7.
- **Status scope.** Link status uses all of the edge's evidence, per the main plan. It does not change with the
  non-behavioral setting, so a behavioral link can show `denied` because of a hidden non-behavioral path. The link
  panel's evidence rows show which path it is.
- **Node badge.** The badge summarizes a module's displayed outgoing links, replacing the old access-based
  denied/limited counts.
- **View names.** Presentation's declarations use `DependencyGraph*` names with the C5 serialized shape. The shapes
  are verified by data, through the byte-equal mapped fixture, not by a shared TypeScript type. Iteration 7's explorer
  assignment from `ExplorerDependencyModel` to `DependencyGraphModel` is the first compile-time structural check.
- **Settings ownership.** Settings may be controlled by the page or kept inside the view. C7 places them in the page;
  either keeps them local and uncached.

## Limitations

- **Browser acceptance.** `subs/integration-tests/src/browser-acceptance.ts` (`npm run measure:project-explorer`)
  still asserts the Plan 6B UI:
  - the `module dependencies` subtitle (line 198);
  - the `Dependency Edge` heading (lines 309, 713);
  - the `Access occurrences` metric (line 714).

  It will fail against this view until iteration 7 updates it. It was not run here.
- **No real forwarding fixture.** BD32 and status are witnessed on mapped hand-built diagrams. The real `forwarding`
  project fixture is iteration 7's BD40.
- **Not connected.** No live transport, polling, stale transition or late-response handling is exercised. These are
  iteration 7's.
- **Screenshots.** The screenshots were not visually reviewed in this session; only their DOM checks were.

## Handoff to iteration 7

- **Component props.** `ProjectExplorerView` accepts:
  - `dependencies?: DependencyGraphState`, which is `{ data: DependencyGraphModel | null, phase: DependencyPhase,
    reason: string | null, isStale: boolean }`;
  - `dependencySettings?: DependencySettings`;
  - `onDependencySettingsChange?: (settings) => void`.

  All are exposed through presentation P5 and root P10 with `defaultDependencySettings`.
- **Mapping the client result.** `data` is drawn whenever present, so pass the kept ready model while its phase is
  `superseded` or `unavailable`, or with `isStale: true`.
  - `ready`: pass `view` as `data` after checking `view.inputId` equals the displayed project view's
    `revision.fingerprints.inputId`.
  - `pending`: pass `data: null` (or the kept model), with `phase` `waiting` or `analyzing`.
  - `superseded` and `unavailable`: pass the `reason`.
  - Before any request: `phase: 'idle'`.

  `ExplorerDependencyModel` should be assignable to `DependencyGraphModel` without a cast.
- **Settings.** Hold `DependencySettings` in the page, initialized from `defaultDependencySettings` on each load and kept
  across refresh, and pass both props. The view invokes no data callback when settings change.
- **Selection.** `GraphSelection.edge` is `ActiveDependencyEdge`. The view clears a selection whose ID is absent from the
  links in view, so the page needs no edge reconciliation.
- **Fixtures.**
  - `dependency-fixtures.ts`: `collectionReview()`, `mappedDependencyModels()`, `forwardingProject()` and the
    independent unit calculators.
  - The rendered-fixture harness in the scratch directory above.
- **Browser acceptance.** Update `browser-acceptance.ts` to the new panel labels:
  - the header text `Showing N of M modules, K displayed links` and the `data-dependency-state` markers;
  - the headings `Imported-module link` and `Original-owner link`;
  - the regions `Project dependencies`, `Uses`, `Used through this module`, `Owned originals used by others`,
    `Used originals via this boundary`, `Dependencies`, `Original owners` and `Imported through`;
  - the controls `Show non-behavioral dependencies` and `Link targets`, with the radios `Imported modules` and
    `Original owners`.
- **Bundle.** It grew by 16.6 kB JS and 3.2 kB CSS, raw.
