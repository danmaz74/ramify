# Iteration 9: An optional node for the scope module's own source

**Plan:** [Plan 6D: Behavioral dependency diagram](../main-plan.md).
**Prerequisites:** iterations 1–8 complete, with BD01–BD52 recorded in the
[gate report](iteration7-results.md) and the
[scope roll-up report](iteration8-results.md), and the plan's
[iteration 9 revision](../main-plan.md#review-decisions) accepted. The daemon
operation, the analyzer, the projection, the C5 DTO and the C7 hook are used
exactly as delivered, and the C8–C10 functions iteration 8 handed off are the
basis of this work.
**Owners:** `presentation/project-view [ui, browser]`,
`explorer [ui, browser, dispatch]`,
`integration-tests [testing, ui, dispatch]`, documentation.

## Goal

Let a drilled-in scope draw its own module's own source as its own node beside
its children, so the links in both directions between that own source and each
child become visible and leave the `Not drawn at this level` tally. The option
is off by default, so iteration 8's drawn links stay the default view, and it
changes no analysis.

## Read first

- The plan's [iteration 9 revision](../main-plan.md#review-decisions), its
  `Fixed units and filters` bullet on the folded own source and its
  `Diagram and information panel` section.
- [Contract C11](../contracts.md#c11-the-scope-modules-own-source-as-a-node),
  which is authoritative, and the in-place edits it carries in
  [C7](../contracts.md#c7-browser-state),
  [C8](../contracts.md#c8-scope-roll-up-and-drawn-links),
  [C9](../contracts.md#c9-settings-controls-and-selection) and
  [C10](../contracts.md#c10-panel-numbers-per-scope).
- BD53–BD61, and BD44, BD47 and BD51 in their qualified wording.
- The [iteration 8 results](iteration8-results.md), whose handoff names the two
  functions this option changes and records the `reference` witnesses: 8
  frame-end edges at the project scope and 3 inside `workspace`.
- `subs/presentation/subs/project-view/src/dependency-graph.ts`,
  `ProjectExplorerView.tsx`, `ModuleGraphRadial.tsx`, `moduleGraphShared.ts`,
  `ModuleGraphLegend.tsx`, `interfaces/dependency-view.ts` and the project-view
  CSS.
- `subs/explorer/src/ProjectExplorerPage.tsx` and
  `published-dependency-view.ts` for the settings state; the hook itself does
  not change.
- `subs/integration-tests/src/browser-acceptance.ts`, whose `scopeOf`, `endOf`,
  `scopeLinks`, `expectedLinks`, `expectedOutOfView`, `scopeCounts`,
  `applyLinkSettings`, `labelledCards` and `openDisclosure` helpers compute the
  expected links independently and must learn the own-source node.
- `dependency-fixtures.ts` for `nested-levels` and the mapped `forwarding`
  fixture, which supply both link directions without any fixture change.

## Deliverables

1. Add `showOwnSourceNode` to `DependencySettings` and
   `defaultDependencySettings`, and `ownSourceNode` to `DependencyScope`, with
   the `ownSourceNodeId` and `ownSourceNodeModule` helpers and the
   `ScopeNodeId` alias, per C11.
2. Extend `dependencyScope` with the control's value and `scopeEnd`'s clause 2
   with the `own-source` end. Change no other clause, and keep both functions
   pure and free of the class filter and of the other settings.
3. Map an own-source end to its node ID in `scopeDependencyLinks`, treat that
   node as displayed while it is drawn, and confirm that clauses 3, 6, 7, 8, 9
   and 10 need no change: an own-source link's counts are its distinct
   `(frame module, original)` pairs, its status, coverage IDs, `sources`,
   `leavesScope` and ordering follow C8 as they stand.
4. Draw the node: `ModuleGraphRadial` takes the own-source node beside the
   displayed modules, labels it `<module name> · own source`, renders it as a
   rounded square in the frame module's tag-class colour with
   `data-own-source`, gives it no sub-module count and no drill-down, and keeps
   `nodeDiameters` over the child modules only so no module node resizes when
   the control is toggled. Link colour, width, status and the direction
   animation are unchanged.
5. Add the `Show this module's own source as a node` checkbox per C9's revised
   table: off by default, rendered only where the view has a scope module, and
   disabled while `Exact module` is selected without losing its value.
6. Implement C11's selection rules: count the own-source node as displayed for
   the module effect, clear a node or link selection that names it when the
   control goes off, when the scope changes and when the depth mode becomes
   `exact`, and leave a child-to-child link and a module selection untouched by
   the toggle.
7. Implement C11's panel: the `<module name> · own source` header, `Uses` and
   `Owned originals used by others` as `At this level` against
   `Excluding internals`, the measured imported unit in a disclosure, the
   node's displayed links, its owned source files, its coverage notes and the
   hint that its `Including internals` numbers appear on its own node in the
   enclosing scope. Adjust the project panel's `Scope's own source` statement
   and the `Not drawn at this level` explanation for the scope where the node
   is drawn.
8. Add the pure cases for BD53–BD55 against the existing independent mapping in
   `dependency-fixtures.ts`, extending `expectedScope`, `expectedEnd` and
   `expectedScopeLinks` with the control rather than asserting the
   implementation against itself, and the component cases for BD56–BD60.
9. Extend the browser acceptance helpers and the reference workload with the
   control: drill into `workspace`, toggle it, compare the drawn links and the
   panel numbers with the independent calculation and record the request and
   counter values for BD61.
10. Update the project-view README and module prose, the reusable interface
    exports, the plan's status, the acceptance matrix's revision note and the
    roadmap's Plan 6D row and section, which list the local settings. No other
    architecture document changes: the daemon, its operation and its retention
    are unaffected.

## Out of scope

- Any change to `analysis`, `analysis/typescript`, the analyzer entry, the
  daemon, `service-api`, the C5 DTO, the C6 wire result or the C7 hook. The
  served model is consumed exactly as delivered.
- Any new analysis run, capability request or additional `dependencyView`
  request. The control and every scope change stay local.
- Any change to the measured numbers: the headline units, `model.project`, the
  per-module rows, `subtreeDependencyCounts` and `scopeLinkCounts` keep their
  meaning, and the option moves numbers only between `This view` and
  `Not drawn at this level`.
- An own-source node at the project scope, where the control does not apply,
  and any own-source effect in `Exact module`, which already draws the scope
  module itself.
- Applying the class filter to the own-source node, making it a drill-down
  target, or letting it stand for the module's subtree anywhere.
- Changing C8's other clauses, the internal-link rule, the outside-end rule,
  the leaving-scope toggle's meaning, the link colour, width and animation
  encoding or the `exact` mode's ends.
- New fixtures: `nested-levels` and `forwarding` already carry both link
  directions, and no fixture's edges, evidence rows or totals change.
- Test-source filters, historical trends, confidence estimates, alternative
  layouts and module-move suggestions, as before.

## Matrix rows executed here

BD53–BD61, with BD44, BD47 and BD51 re-confirmed in their qualified wording at
the control's default, plus regression confirmation of BD30–BD40, BD45, BD46,
BD48–BD50, BD52 and BD43.

## Verification

```sh
npx vitest run subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx
npx vitest run subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx
npx vitest run subs/explorer/src/tests/ProjectExplorerPage.test.tsx
npx vitest run subs/explorer/src/tests/ProjectExplorerFocus.test.tsx
npm run type-check
npm run explorer:build
npm run check:self
npm run measure:project-explorer
```

The browser command must use an isolated endpoint and project copy, a real
daemon and actual Chromium, as in iterations 7 and 8. Expected links, out-of-view
nodes and panel numbers are calculated from the served model by the test, never
read back from the view. A case that toggles the control and asserts only that
the link count rose does not establish BD54–BD56.

## Exit criteria

BD53–BD61 pass; BD44, BD47 and BD51 pass in their qualified wording and the
rest of BD30–BD52 pass unchanged; the default view is byte-identical in its
drawn links to iteration 8's at every `reference` scope; inside `workspace` the
control draws exactly the 3 formerly folded edges and lowers `Not drawn at this
level` by their pairs; the browser run records no additional `dependencyView`
request, `dependencyDiagrams` or `behaviorRuns` for the new control; type-check,
the explorer bundle and self-check pass.

## Handoff

`iteration9-results.md` records every executed row against its evidence, the
exact source commit and input IDs, and the `reference` numbers the control
moves: the own-source links drawn inside `workspace`, their distinct pairs, the
new `This view` and `Not drawn at this level` values against the unchanged
`Whole project` 17/48, and the project scope's unchanged empty drawn set. It
states whether any scope's own-source links could not be verified against the
scope module's served row, records the control's accessible name, the node's
label and encoding as built, and confirms that the default view is unchanged.
It restates the remaining deferrals: test-source filters, runtime and type-load
filtering, historical trends, confidence estimates, alternative layouts and
module-move suggestions.
