# Iteration 1 results: Tree view component

**Date:** 2026-09-17. **Mode:** direct work in worktree `/tmp/worktrees/ramify-module-tree-view`,
branch `feat/module-tree-view`, based on `25f50ee` (Plan 6B).

## Prerequisites

Plan 6B was verified at `25f50ee` before starting: `serverStatus`, `isNewerRevision`
(`subs/explorer/src/revision-freshness.ts`), `HomePage` with `serverPages`, and the web process
serving `/` and `/analysis/latest` all exist as the plan assumed.

## Built

- `subs/presentation/subs/project-view/src/module-tree.ts`: pure helpers.
  - `indexModuleTree(modules, rootModuleId?)`: name-ordered children, depth, descendants
    counts, maximum depth, and the laid-out root (`PROJECT_NODE_ID` when several modules have no parent).
  - `visibleModuleIds`, `ancestorsOf`, `collapsibleAtDepth`.
  - `layoutModuleTree(index, collapsed)`: `placeTree` input with fixed 184 × 64 boxes, gaps 24/56, and its orthogonal edges.
- `ModuleTreeView.tsx`: the T3 canvas and T4 panel.
  - The canvas uses React Flow with a custom `moduleTreeNode` node and a `treeElbow` edge that draws the
    `placeTree` polyline. Nodes are not draggable, and double-click zoom is disabled.
  - The layout reuses the import explorer's `module-arch__*` header, sidebar, resize handle, collapsible sections and
    metrics. Tree-specific styles live in `module-tree.css`.
- `subs/presentation/module.ramify`: `expose-sub placeTree, Point from layout to descendants`
  and the `ModuleTreeView`/`ModuleTreeViewProps` re-exposure to the parent.
  `project-view/module.ramify` exposes both.
- Tests: `tests/module-tree-fixture.ts` (`tree-fixture`), `tests/module-tree.test.ts`,
  `tests/ModuleTreeView.test.tsx`.

## Evidence

| Row | Test | Result |
| --- | --- | --- |
| MT01 | `module-tree.test.ts`: index, collapsed middle level, ancestors, depth selection, several roots | pass |
| MT02 | `ModuleTreeView.test.tsx`: root first, children below parents, 16 parent–child edges, no import edge | pass |
| MT03 | node name, class label, `5 files · 12 subs`, denied badge, coverage and no-README markers | pass |
| MT04 | toggle without selection and `+12`; click, pane, Enter, `←`, `→`, `o`; header buttons | pass |
| MT05 | every panel section, purpose-state wording, project summary, dependency link expands ancestors | pass |
| MT06 | double-click, panel link, toggle double-click ignored, project node inert | pass |
| MT07 | 500 modules, depth 6: median of 20 `layoutModuleTree` runs ≤ 25 ms | pass |

## Verification

```sh
npx vitest run subs/presentation/subs/project-view/src/tests/   # 47 passed
npm run type-check                                              # clean
npm run build && npm run check:self                             # passed, 0 errors
```

## Deviations

None in this iteration. The `d3-hierarchy` fallback was not needed.

## Handoff

`ModuleTreeView`, `ModuleTreeViewProps`, the helpers and `tree-fixture`. Iteration 2 found that
the explorer also needs the helpers exposed, including through the root `module.ramify`.
