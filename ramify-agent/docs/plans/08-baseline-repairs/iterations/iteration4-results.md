# Plan 8 iteration 4: canvas focus, Space and minimap

**Date:** 2026-09-22. **Owner:** Ramify's `presentation/project-view`.
**Plan:** [baseline repairs](../main-plan.md#iteration-4-canvas-focus-space-and-minimap).
**Branch:** `feat/plan8-baseline-i4`. **Status:** complete.

Closes KI-9, KI-10 and KI-11, and covers acceptance rows BR06 (canvas half)
and BR07. `ModuleTreeCanvasProps` is unchanged, and so is the explorer's MT14
behavior.

## Defects and what closed them

| ID | Defect | What closed it |
| --- | --- | --- |
| KI-9 | Keyboard focus on an off-screen row or shell did not bring it into view. Nodes are `focusable: false`, which disables React Flow's own pan on focus. | `ModuleTreeCanvasNodeView` has an `onFocus` handler on the node shell. Focus bubbles, so one handler covers the shell, every body control and the collapse control. It calls the canvas's `focusIntoView`, which acts only on a `:focus-visible` target whose box is not wholly within the canvas viewport, and then centres the view on that element at the current zoom. |
| KI-10 | React Flow's default 200 by 150 minimap, styled only with `bottom: 12`, covered much of a narrow canvas and could cover a tall node's lower rows. | `module-tree-canvas.css` makes `.module-tree__canvas` a size container (`container-type: inline-size`) and hides `.react-flow__minimap` below a 480 px canvas width, as review decision 2 settled. The web module touches no React Flow class. |
| KI-11 | Space on a body control reached React Flow's pan-activation key on the document, although the canvas contract says a body control's key press does not reach the shell. | The body wrapper stops propagation of a Space `keydown` and `keyup` that started in a body control. It neither prevents the default nor runs in the capture phase, so the control still activates on its own Space, and the shell and the pane keep their Space behavior. |

`focusIntoView` centres on the **focused element**, not on its node: a tall
node's lower rows would otherwise stay out of view. It reads the element's box,
maps its centre through `screenToFlowPosition`, and calls `setCenter` with
`{ zoom: flow.getZoom() }`. A focus pan counts as a viewer move for auto-fit,
through a new internal `markMoved` in `auto-fit.ts`, so the canvas stops
refitting itself after the viewer has navigated.

## The canvas contract

The contract lives in the component's own documentation comment in
`ModuleTreeCanvas.tsx` and in the module's `README.md`. Both gained the rule.
The comment now reads:

```text
Keyboard focus is navigation. A `:focus-visible` element outside the viewport —
a shell, a body control or a collapse control — is centred at the current zoom,
so the fitted zoom survives navigation; centering on the caller's `centerNodeId`
sets zoom 1 instead, because that is the viewer's choice of one node. A focus pan
counts as a viewer move, and ends auto-fitting.

A body control's key press does not reach the shell, and Space on one does not
reach React Flow's pan-activation key on the document; the shell and the pane
keep their Space behavior.

Below 480 px of canvas width the minimap is hidden, by the container query in
`module-tree-canvas.css`.
```

The two centering rules differ deliberately. Selection is the viewer's choice
of one node, so `centerNodeId` still sets zoom 1. Focus is navigation, so it
must not change the zoom the viewer fitted or chose.

## The breakpoint

480 px of canvas width, measured by a container query on the canvas itself, not
by the window width: the same canvas is drawn at very different widths beside a
detail panel, so only its own width decides.

Why 480: the minimap's box is fixed at 200 by 150. At 480 px it already takes
more than two fifths of the canvas width, and iteration 6 of the capability
progress plan measured it covering about 200 by 150 of a 342 by 482 canvas at a
390 px page. Below that width the canvas hides it; panning and the zoom
controls remain, so nothing becomes unreachable. Ramify's own explorer keeps
the minimap at every width MT14 looks at: the browser run below measures the
tree canvas at 1031 px and 691 px, with 15 minimap marks in both.

## New tests

Three cases beside the existing collapse-control case in
`subs/presentation/subs/project-view/src/tests/ModuleTreeCanvas.test.tsx`, plus
one for the new internal in `auto-fit.test.tsx`:

- *pans to a keyboard-focused element outside the viewport, at the current zoom,
  and stops fitting.* A row low in the 1000 px tall `B1` node is focused with a
  focus ring: the canvas centres on the row's own centre at the current zoom
  (0.25), never at zoom 1. A following resize does not refit, which verifies the
  `markMoved` rule. A shell off to the right is centred the same way. An element
  already within the viewport moves nothing, and neither does focus without a
  ring.
- *keeps Space on a body control off React Flow's pan-activation key, and leaves
  the shell's Space alone.* A document `keydown` listener stands in for React
  Flow's, which `useKeyPress` attaches to the document. Space on a body control
  reaches the control's own handlers and is not prevented, so the browser still
  turns it into the control's click, but the document listener never sees it.
  Space on the shell and on the pane does reach the listener.
- *is a size container that hides the minimap below a 480 px canvas width.* Reads
  `module-tree-canvas.css` and verifies `container-type: inline-size` on the
  canvas and the `@container (width < 480px)` rule that hides the minimap, as the
  existing emphasis case reads its own rules.
- *stops fitting after a move the canvas makes on the viewer's behalf*
  (`auto-fit.test.tsx`), for `markMoved` on its own.

The focus case states the focus ring for the element under test rather than
relying on jsdom's `:focus-visible` emulation, which answers from its own
record of the interactions that led to the focus. The rule under test is what
the canvas does with the answer, and the helper that states it is named and
commented.

## Verification

All commands run from the worktree root. `npm install` and `npm run build` ran
first, as the plan's precondition requires.

```text
$ npx vitest run subs/presentation/subs/project-view/src/tests
 Test Files  6 passed (6)
      Tests  101 passed (101)
```

MT01 (five cases), MT02 to MT06, MT07 and MT13 all pass unchanged in that run,
as does MT07's second budget case in the canvas suite.

```text
$ npm run type-check
> tsc --noEmit && tsc -p tsconfig.portable.json && tsc -p tsconfig.scripts.json && tsc -p scripts/reference-harness/tsconfig.json
(no output; exit 0)

$ npm run build
✓ built in 558ms
```

```text
$ npm run check:self
Execution: completed; check: passed; coverage: partial
Findings: 0 errors, 0 warnings, 10 analysis limits; 4550 allowed, 0 denied, 1995 external
Completed scope: 15 owners, 437 source files, 17 resources, 6545 accesses
```

The ten limits are KI-1's `signature-inferred` limits, which iteration 1 owns.
This iteration adds none: the check passes with no error and no warning.

```text
$ npx tsx scripts/reference-harness/module-tree-consumer.ts
"evidence": "module-tree-package-consumer", "passed": true, "assertions": 47, "failed": []
tarball ramify.ts-0.0.0.tgz, 3058 files; one React copy at 19.2.8
plain-Node load probes ramify.ts/presentation and ramify.ts/module-tree: exit 0
```

```text
$ npm run measure:project-explorer -- --only tree
{ "status": "passed", "passed": true, "failures": [] }
```

MT measurements from that run, kept in
[iteration4-artifacts/tree-browser-acceptance.json](iteration4-artifacts/tree-browser-acceptance.json):

```text
toolkit    15 modules, 3,151,691 encoded bytes; first render 67.9 ms
MT14       15 initial nodes; collapse of ramify/analysis -> +4, 11 nodes;
           selected ramify/analysis/model; breadcrumb All Modules / ramify / analysis;
           explorer and back URLs carry the module; no console errors
full page  tree at 1440x1000: canvas 1031 x 878, 15 nodes, 0 outside, 15 minimap marks
           after resize to 1100x700: canvas 691 x 578, 15 nodes, 0 outside, 15 minimap marks
           explorer at 1440x1000: canvas 1031 x 658, 4 nodes, 4 minimap marks
MT15       3 modules before, 4 after; refreshed revision ...:2
MT16       first render 52.8 ms; collapse 25.2 ms, expand 34.4 ms (12 descendants,
           3 collapsed and 15 expanded nodes); added 13,388 gzip bytes against a
           25,600 byte budget
```

`--only tree` rewrites the tracked full-run evidence at
`docs/plans/iteration-6b-resident-explorer-server/evidence/iteration4-browser-acceptance.json`
with the tree workloads alone. That file is restored to its committed content,
and this iteration's copy of the tree-only run is the artifact named above.

## Files changed

- `subs/presentation/subs/project-view/src/ModuleTreeCanvas.tsx`
- `subs/presentation/subs/project-view/src/auto-fit.ts`
- `subs/presentation/subs/project-view/src/module-tree-canvas.css`
- `subs/presentation/subs/project-view/README.md`
- `subs/presentation/subs/project-view/src/tests/ModuleTreeCanvas.test.tsx`
- `subs/presentation/subs/project-view/src/tests/auto-fit.test.tsx`
- this results document and its artifact

## For iteration 5

- The By module canvas is 432 px wide at 1440 by 1000 today (KI-8), so it is
  below the new breakpoint and shows no minimap until the layout widens it.
  Review decision 2 accepted that; if iteration 5's layout leaves the canvas
  narrower than 480 px, the minimap stays hidden by rule, not by defect.
- The canvas now reads its own width through a container query, so a layout that
  sizes the canvas from its parent works without any change here.
- `ModuleTreeCanvasProps` is unchanged, so the web module's canvas call site
  needs no edit.
