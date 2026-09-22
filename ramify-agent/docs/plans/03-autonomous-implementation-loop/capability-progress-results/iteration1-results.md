# Capability progress iteration 1: shared Ramify module-tree canvas

**Date:** 2026-09-21. **Owner:** `ramify/presentation/project-view`.
**Plan:** [capability progress visualizations](../initial-hypothesis-vs-implemented-module-tree.proposal.md#iteration-1-shared-ramify-module-tree-canvas).
**Status:** complete; iteration 2 (package entry and manifest) not started.

## What changed

- `module-tree.ts` gained neutral hierarchy types (`HierarchyNode`,
  `HierarchyShape`, `HierarchyIndex`), a generic `indexHierarchy`, and
  `hierarchyAncestors`. `layoutModuleTree` accepts an optional per-node
  `sizeOf` (default 184 by 64) and returns each placed node's width and height.
  It derives parents from the index's children rather than from explorer
  modules. `indexModuleTree`, `collapsibleAtDepth`, `ancestorsOf` and
  `ModuleTreeIndex` keep their signatures. `indexModuleTree` wraps
  `indexHierarchy`.
- New `ModuleTreeCanvas.tsx` exports `ModuleTreeCanvas`,
  `ModuleTreeCanvasProps`, `ModuleTreeCanvasNode` and
  `ModuleTreeCanvasEmphasis`, following the plan's contract. It owns React
  Flow, shells and handles, elbow edges, collapse controls with
  hidden-descendant counts, the shell keyboard handling (`Enter`, arrows, `o`),
  background, controls, the minimap (each mark titled with the node's name),
  auto-fit and `centerNodeId`. It imports nothing from `ModuleTreeView.tsx`, no
  explorer model type and no stylesheet.
- Emphasis: `module-tree__node--muted` gets reduced opacity, a lighter border
  and background, and no shadow. `module-tree__node--provisional` gets a dashed
  border. Each shell also carries `data-emphasis`.
- Interactive bodies: the canvas wraps each body in `.module-tree__node-body`,
  which uses `display: contents`. It adds `nodrag nopan` to every
  `button, a, input, [role="button"], [tabindex]` in the body after each render
  and again in the capture phase of pointer, mouse and touch down.
  `onNodeClick`/`onNodeDoubleClick` ignore events from those controls, and the
  shell's key handler ignores events from inside the body. Nodes are passed to
  React Flow with `focusable: false`, so the tab order is shell → body controls
  → collapse control.
- New `module-tree-canvas.css` holds the container, shell, emphasis, body,
  toggle, handle and edge rules, moved from `module-tree.css`. `module-tree.css`
  keeps the explorer's body, marker and detail rules. `ModuleTreeView.tsx`
  imports `project-view.css`, `module-tree-canvas.css` and `module-tree.css`.
- `ModuleTreeView` now builds 184 by 64 canvas nodes from `ProjectExplorerModel`
  and renders its unchanged node body (name, markers, class, counts, README
  marker) through `renderNodeBody`. Its header, detail panel and props are
  unchanged.
- `project-view/module.ramify` exposes `ModuleTreeCanvas` tagged `[ui, browser]`
  and the three types untagged to the parent. The check found no
  `exposed-without-companion`.
- The project-view README gained a paragraph on the canvas, placed after the
  purpose paragraph.
- New `src/tests/ModuleTreeCanvas.test.tsx` has 17 cases: mixed heights; no
  overlaps and parents centred over their children (60 seeded nodes); edge
  endpoints on node boundaries; several roots with the project node; a single
  root; both layout budgets; collapse counts; three emphasis shells (class,
  `data-emphasis` and CSS non-color cues); body-control click, double-click and
  keys for all five selector kinds plus a nested element; re-marking a replaced
  class list; focus order; selection and pane clear; keyboard; `o` without an
  open handler; `ariaLabelOf` and minimap titles; auto-fit versus centring; and
  a CM24 import scan.

## Layout budgets

All values are Node, in-process Vitest, median of 20 `layoutModuleTree` calls on
MT07's synthetic 500-node, depth-6 tree.

| Measurement | Median |
| --- | ---: |
| MT07 baseline before editing, first (cold) trial | 4.51 ms (warm trials 2.37, 2.26 ms) |
| MT07 after editing, first trial | 4.63 ms (warm 2.95, 2.53 ms) |
| Canvas, 500 nodes at 184 by 64 (3 runs) | 4.59, 4.19, 4.58 ms |
| Canvas, 500 nodes, seeded heights 64–2,000 (3 runs) | 3.22, 3.42, 3.91 ms |

Budget assertions in `ModuleTreeCanvas.test.tsx`:

- **Fixed size:** the median must be at most 25 ms, MT07's T7 budget, unchanged.
- **Variable height:** the median must be at most twice the larger of the fixed
  median measured in the same run and the recorded 4.5 ms baseline.

Asserting against a same-run measurement instead of a hard-coded few-millisecond
figure keeps the check robust to machine load. It still enforces "within twice
the MT07 median". The variable-height median came out *below* the fixed one
because the variable run follows the fixed run and runs with a warm JIT.

## Verification

| Command | Result |
| --- | --- |
| `npx vitest run …/module-tree.test.ts` | pass (6), MT01 and MT07 assertions unchanged |
| `npx vitest run …/ModuleTreeView.test.tsx` | pass, MT02–MT06 assertions unchanged (the test file is unmodified) |
| `npx vitest run …/ModuleTreeCanvas.test.tsx` | pass (17) |
| `npx vitest run …/ProjectExplorerView.test.tsx` | pass; the four files together had 79 tests |
| Extra: `subs/explorer/src/tests` and `ModuleGraph.test.tsx` | pass (6 files, 47 tests) |
| `npm run type-check` | clean |
| `npm run build` (needed for `check:self`'s `dist/src/ramify`) | success; `module-tree-canvas.css` is promoted into `dist/` beside `module-tree.css` |
| `npm run check:self` | passed: 15 owners, 0 errors, 0 warnings, 10 pre-existing `signature-inferred` analysis limits, none in the new code |

The full suite (`npm test`) was not run, by instruction. No browser session was
driven in this iteration. Plan 6C's MT14 `/modules/latest` check belongs to
iteration 2.

## Deviations and notes

1. **Shell `title`.** The explorer shell's `title={module.directory}` moved into
   the explorer's body, in a `.module-tree__node-content` wrapper with
   `display: contents`. The contract gives the consumer no shell title field.
   Hovering the shell's padding no longer shows the path; hovering its content
   still does.
2. **Wrapper tab stop removed.** React Flow nodes are now `focusable: false`.
   Earlier, each explorer node had two tab stops: React Flow's wrapper and the
   shell. Now it has one, which the contract's focus order requires. No MT
   assertion depends on the wrapper stop.
3. **Node data field name.** The React Flow node data keeps the field name
   `module` for the supplied canvas node, or null for the project node. The
   unchanged MT02 assertions read `node.data.module.parent`.
4. **`data-module-id`.** The attribute stays on the shell because the browser
   acceptance (`subs/integration-tests/src/browser-acceptance.ts`) selects
   `.module-tree__node--selected[data-module-id=…]`.
5. **Minimap titles.** A custom minimap node component (`<rect>` with `<title>`)
   gives each mark a title, as the contract's `name` field requires. The
   explorer's minimap previously had no titles.
6. **`o` and double-click** open a node only when `onOpenNode` is supplied.
7. Ramify source and documents name neither the agent nor capabilities. A
   search of the changed files found no match.

## Successor inputs (iteration 2)

- `module-tree-entry.ts` forwards the four symbols that `project-view` now
  exposes to the parent.
- The package stylesheet should combine `module-tree-canvas.css` with React
  Flow's base rules (`@xyflow/react/dist/style.css`, today imported by
  `project-view.css`). `module-tree.css` and `project-view.css` are explorer
  styles and are not part of that entry.
- `npm run check:self` starts a resident daemon for this worktree's `dist/`. It
  was stopped afterwards with `dist/src/ramify daemon stop`.
