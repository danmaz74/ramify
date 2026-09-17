# Iteration 8: Scope-aware roll-up of dependency links

**Plan:** [Plan 6D: Behavioral dependency diagram](../main-plan.md).
**Prerequisites:** iterations 1–7 complete, with BD01–BD43 recorded in the
[completion report](iteration7-results.md), and the plan's
[iteration 8 revision](../main-plan.md#review-decisions) accepted. The daemon
operation, the analyzer, the projection and the C5 DTO are used exactly as
delivered.
**Owners:** `presentation/project-view [ui, browser]`,
`explorer [ui, browser, dispatch]`,
`integration-tests [testing, ui, dispatch]`, documentation.

## Goal

Draw, at every scope, only the links between distinct nodes of that level: a
node stands for its module's whole subtree, a link internal to one node is not
drawn there, and the scope module's own source is folded into the frame. Replace
the endpoint-projection control with the depth selector and the leaving-scope
toggle, and label the filtered numbers against the measured ones.

## Read first

- The plan's [iteration 8 revision](../main-plan.md#review-decisions), `Fixed
  units and filters` and `Diagram and information panel`.
- [Contracts C8–C10](../contracts.md#c8-scope-roll-up-and-drawn-links), the
  revised [C7 defaults](../contracts.md#c7-browser-state) and BD30–BD40,
  BD44–BD52.
- `dependency-graph.ts`, `ProjectExplorerView.tsx`, `ModuleGraphRadial.tsx`,
  `moduleGraphShared.ts`, `ModuleGraphLegend.tsx`, `interfaces/dependency-view.ts`
  and the project-view CSS.
- `subs/explorer/src/ProjectExplorerPage.tsx` and `published-dependency-view.ts`
  for the settings and scope state; the hook itself does not change.
- `subs/integration-tests/src/browser-acceptance.ts`, whose `LinkSettings`,
  `activeLinks`, `expectedLinks`, `expectedOutOfView` and `setLinkTarget`
  helpers compute the expected links independently and must be rewritten for the
  scope mapping.
- The iteration 5 recorded `reference` results under
  `scripts/probes/results/dependency-view/` and iteration 6's mapped fixtures,
  which supply every number in BD45, BD48 and BD51.

## Deliverables

1. Add the C8 scope functions: `dependencyScope`, `scopeEnd`,
   `scopeDependencyLinks` and `scopeCoversProject`, replacing
   `activeDependencyEdges`. Keep them pure and free of the class filter in their
   mapping, taking the displayed set as an input.
2. Rename `ActiveDependencyEdge.projection` to `depthMode` and its `source` to
   `sources`, and update the radial graph, its legend and the link tooltip to
   the rolled-up unit. Width, colour, status and the direction animation keep
   their iteration 6 encoding.
3. Replace the `Link targets` radio group with the `Link depth` selector and add
   the leaving-scope checkbox, both per C9, and remove `DependencyLinkTarget`
   and `linkTarget` from the interfaces, the view, the page and the browser
   helpers.
4. Derive the drawn links, the out-of-view nodes and their levels from the
   mapped ends; keep a filtered-out child receiving its subtree's ends and
   drawn as a related node, as today.
5. Implement the C9 selection reconciliation for setting and scope changes, and
   confirm that no control and no scope change reaches the dependency hook.
6. Implement the C10 panels: `subtreeDependencyCounts`, `scopeLinkCounts`, the
   labelled card pairs, `Not drawn at this level`, the scope's own source
   section, the rolled-up link's contributing modules and the imported-through
   disclosure.
7. Add the `nested-levels` fixture and the pure cases for BD44, BD46 and BD48,
   calculating every expected number from evidence rows rather than from the
   model's count fields, as iteration 6's fixtures do.
8. Rewrite the browser acceptance expectations to the scope mapping, drill into
   a nested scope, exercise the three controls and record the request and
   counter values for BD52.
9. Update the project-view README, the reusable interface exports and the module
   prose affected by the removed control. No roadmap or architecture document
   changes: the daemon, its operation and its retention are unaffected.

## Out of scope

- Any change to `analysis`, `analysis/typescript`, the analyzer entry, the
  daemon, `service-api`, the C5 DTO, the C6 wire result or the C7 hook. The
  served model is consumed exactly as delivered.
- Any new analysis run, capability request or additional `dependencyView`
  request. Scope and control changes are local.
- The deferred option that draws the scope module's own source as a node beside
  its children, with the links in both directions between that own source and
  each child. Decision 4 stands for this iteration; the plan's deferrals record
  the option, which would change the scope mapping and the drawn links only.
- Test-source filters, historical trends and module-move suggestions, as before.

## Matrix rows executed here

BD44–BD52, and BD30–BD32 and BD34–BD40 in their revised wording, plus
regression confirmation of BD33, BD41 and BD43.

## Verification

```sh
npx vitest run subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx
npx vitest run subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx
npx vitest run subs/presentation/subs/project-view/src/tests/ModuleTreeView.test.tsx
npx vitest run subs/explorer/src/tests/ProjectExplorerPage.test.tsx
npx vitest run subs/explorer/src/tests/ProjectExplorerFocus.test.tsx
npm run type-check
npm run explorer:build
npm run check:self
npm run measure:project-explorer
```

The browser command must use an isolated endpoint and project copy, a real
daemon and actual Chromium, as in iteration 7. Expected links, out-of-view
nodes and panel numbers are calculated from the served model by the test, never
read back from the view. A pure case that maps ends without asserting the drawn
set does not establish BD45.

## Exit criteria

BD44–BD52 pass; the revised BD30–BD32 and BD34–BD40 pass in their new wording;
`reference` draws no link whose ends map to one node at any scope; the browser
run records no additional `dependencyView` request, `dependencyDiagrams` or
`behaviorRuns` for control and scope changes; type-check, the explorer bundle
and self-check pass.

## Handoff

`iteration8-results.md` records every executed row against its evidence, the
exact source commit and input IDs, the `reference` scope numbers used as
witnesses, and the removed control's replacement in the browser helpers. It
hands off the C8–C10 functions as the basis for the deferred parent-own-source
node, and states any scope whose rolled-up numbers could not be verified
against the measured totals.
