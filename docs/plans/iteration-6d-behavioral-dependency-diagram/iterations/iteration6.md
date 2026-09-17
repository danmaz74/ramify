# Iteration 6: Render dependency controls and panels

**Plan:** [Plan 6D: Behavioral dependency diagram](../main-plan.md).
**Prerequisite:** iteration 5's C5 DTO and a fixture it produced from a real
daemon result.
**Owner:** `presentation/project-view [ui, browser]`.

## Goal

Make the reusable project view render the behavioral imported-module default,
the two local controls and unit-correct project/module/edge panels.

## Read first

- Main plan sections “Diagram and information panel” and “Failure and coverage
  states”; [Contracts C5](../contracts.md#c5-explorer-dependency-dto); BD30–BD38.
- `ProjectExplorerView.tsx`, `ModuleGraphRadial.tsx`, `moduleGraphShared.ts`,
  `ModuleGraphLegend.tsx`, project-view interfaces and CSS.
- Existing component/graph/auto-fit tests and the iteration 5 mapped fixture.
- The module-tree component only to protect its shared DTO behavior; do not
  change the tree's import summary.

## Deliverables

1. Extend pure view props with dependency data and phase/reason/stale state.
   Keep loading project structure separate from computing dependency links.
2. Add the checkbox and segmented link-target control with accessible names,
   keyboard behavior and defaults. They are controlled/local UI values and
   invoke no data callback.
3. Build active graph edges from exactly one C5 collection and current setting;
   implement visibility, counts, width, line pattern and status dimensions.
4. Keep node sizing independent of active dependency settings; remove
   `approximateIcs` from this graph's visual encoding.
5. Reconcile scope, out-of-view nodes, filters and selection against active
   edges. Use projection-specific IDs; never reinterpret an old raw edge ID.
6. Replace empty/module/edge headline sections with the agreed count cards,
   role groups, labels, breakdowns, revision and coverage. Keep raw access
   occurrences only in the secondary evidence section.
7. Render waiting, analyzing, unavailable, partial, superseded, stale and
   measured-zero states without an old occurrence-edge fallback.
8. Update reusable interfaces, exports, README and focused fixtures/tests.

## Matrix rows executed here

BD30–BD38.

## Verification

```sh
npx vitest run subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx
npx vitest run subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx
npx vitest run subs/presentation/subs/project-view/src/tests/ModuleTreeView.test.tsx
npm run type-check
npm run explorer:build
npm run check:self
```

Tests independently calculate expected units from the fixture. Snapshots or
text-presence assertions alone do not establish count correctness. Instrument
the settings fixture so a data callback would fail BD31.

## Exit criteria

BD30–BD38 pass in the reusable view; the module tree regression passes; the
browser bundle and self-check accept the new declarations and exposures.

## Handoff

Iteration 7 receives the component props, control/selection state contract,
projected fixture screenshots and any measured bundle-size change.
