# Iteration 1: Tree view component

**Plan:** [Plan 6C: Module tree view](../main-plan.md).
**Prerequisites:** Plan 6B complete. Confirm its routes, `serverStatus`, home
page and revision comparison exist as specified; record any difference in the
handoff before continuing.
**Owners:** `presentation [ui, browser]` and `presentation/project-view [ui, browser]`.

## Goal

Deliver the pure `ModuleTreeView` component: a top-down, collapsible module
tree with a detail panel, laid out by `placeTree`.

## Read first

- [Main plan](../main-plan.md), contracts T3 and T4, ownership and exposure.
- `subs/presentation/subs/project-view/src/interfaces/project-view.ts`.
- `subs/presentation/subs/project-view/src/ProjectExplorerView.tsx` (sidebar,
  collapsible sections, resize handle, loading/failure/empty states).
- `subs/presentation/subs/project-view/src/ModuleGraphRadial.tsx` and
  `moduleTypePresentation.ts` (React Flow setup and class palette).
- `subs/presentation/subs/layout/src/tree-placement.ts` and `interfaces/layout.ts`.
- `subs/presentation/module.ramify`, `subs/presentation/subs/project-view/module.ramify`.
- `subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx`
  for fixture and rendering style.

## Deliverables

1. `presentation/module.ramify`: expose `placeTree` and the layout input,
   option and result types it needs to descendants; re-expose
   `ModuleTreeView` and `ModuleTreeViewProps` to the parent. If `check:self`
   rejects the exposure, use the `d3-hierarchy` fallback and record why.
2. `module-tree.ts`: pure helpers for visible nodes under a collapsed set,
   subtree module counts, depth, ancestors, several-roots handling and
   `placeTree` input with fixed 184 × 64 boxes.
3. `ModuleTreeView.tsx` with node and panel components per T3 and T4, reusing
   the presentation-class palette and the sidebar's visual conventions.
4. `module-tree.css`, scoped under a `module-tree` class prefix.
5. `project-view/module.ramify` exposes `ModuleTreeView` and its props to the parent.
6. README of `project-view` mentions the tree view in one sentence.
7. `tree-fixture` in `src/tests/module-tree-fixture.ts`.

## Matrix rows executed here

MT01–MT07.

## Verification

```sh
npm test -- subs/presentation/subs/project-view/src/tests/module-tree.test.ts
npm test -- subs/presentation/subs/project-view/src/tests/ModuleTreeView.test.tsx
npm test -- subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx
npm run type-check
npm run check:self
```

MT02 reads node positions from the React Flow nodes passed to the canvas, as
the existing graph tests do. MT07 runs 20 layouts of a generated 500-module
tree and asserts the median.

No intermediate failures are expected.

## Exit criteria

MT01–MT07 pass, the existing project-view tests pass, type-check and
self-check are clean.

## Handoff

Iteration 2 receives `ModuleTreeView`, `ModuleTreeViewProps`, the exposure
path from `presentation`, the helper for ancestors and subtree counts, and the
`tree-fixture`.
