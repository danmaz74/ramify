# Plan 8 iteration 5: By-module layout

**Date:** 2026-09-22. **Owner:** `ramify-agent/web`, with one correction in
Ramify's `presentation/project-view`.
**Plan:** [baseline repairs](../main-plan.md#iteration-5-by-module-layout).
**Branch:** `feat/plan8-baseline-i5`, cut from iteration 4's `d527588`.
**Status:** complete.

Closes KI-8 and covers acceptance rows BR08 and the layout half of BR06. The
fitted zoom of `placements` at 1440 × 1000 is **0.4066**, 2.30 times the 0.177
the capability progress plan recorded, and a keyboard-focused `check-060` is
inside the canvas viewport at both viewports. The session logged no console
message of any level.

## The width cap (KI-8)

`main { max-width: 52rem }` capped the whole page at 832 px. The rule meant to
lift it, `.run-page main`, named a `<main>` inside the Run page, and `<main>`
is the Run page's parent, so it matched nothing.

**A route class on `<main>`, not `main:has(.run-page)`.** `App` already parses
the route, so `<main className={`route-${route.page}`}>` states in one place
which page is drawn, and `main.route-run` names it directly. The `:has()` form
would have inferred the route from a descendant's class, which is the same
indirection that produced the defect: a rule about the shell would again depend
on what the page beneath it happens to be called. The class is also asserted by
a component test rather than only by reading the stylesheet.

**The prose keeps its measure.** Widening the shell alone would have set the
Overview's paragraphs, the connection line and the fact lists to 1392 px lines.
The page therefore keeps the original 52 rem measure on each of its own
children and lifts it only where a canvas is drawn:

```css
main.route-run { max-width: none; }
.run-page > * { max-width: 52rem; }
.run-page > .area-wide { max-width: none; }
```

`Progress` is the one area marked `area-wide` (`run-page.tsx`). Measured at
1440 × 1000: the Run page is 1392 px, the Progress area 1392 px, and the
connection line 832 px, as
[run-overview-measure-desktop.png](iteration5-artifacts/run-overview-measure-desktop.png)
shows.

## The canvas size

`.capability-module-canvas` had a fixed `height: 38rem`. It now takes the
viewport height less the app header, the page padding and a margin:

```css
.capability-module-canvas { height: calc(100vh - 14rem); min-height: 26rem; }
```

At a 1000 px viewport that is 778 px. The bound is deliberate: the canvas stays
no taller than one screenful, so it is wholly visible once it is scrolled to,
and the minimum keeps it usable on a short viewport.

The height only changes the fit of a tree that is taller than it is wide. For
`placements` (2174 × 677) the width binds, and the fitted zoom is the same at
every height tried. For the 61-row tree (2024 × 2853) the height binds, and the
measured fit on a 1392 px canvas at a 1000 px viewport is:

| Canvas height | Fitted zoom |
| --- | ---: |
| 610 px, the replaced `38rem` | 0.1907 |
| 666 px, `calc(100vh - 21rem)` | 0.2082 |
| **778 px, `calc(100vh - 14rem)`** | **0.2433** |
| 874 px, `calc(100vh - 8rem)` | 0.2734 |

The last row fits more of a tall tree but leaves the canvas 874 px in a 1000 px
viewport with a 677 px page header above it, so a viewer scrolls further for
each extra pixel of tree. 14 rem is where the canvas still fits one screenful
with room to spare.

## The stacking breakpoint: 82 rem

The detail panel stacks below the canvas at and under **82 rem (1312 px)** of
viewport, and stays beside it above that. The replaced rule stacked at 760 px.

The panel's column is a fixed cost: the grid gives it its 24 rem maximum
whenever there is room, so with the 1 rem gap it takes 25 rem from the canvas at
every width, on top of `main`'s 3 rem of side padding. The evidence is the
fitted zoom of the 15-module reference tree, measured both ways at a 1000 px
viewport height:

| Viewport | Canvas beside the panel | Fitted zoom | Canvas stacked | Fitted zoom |
| ---: | ---: | ---: | ---: | ---: |
| 1440 | 992 | 0.4066 | 1392 | 0.5713 |
| 1344 | 896 | 0.368 | — | — |
| 1313 | 865 | 0.3546 | — | — |
| 1312 | 864 | 0.3542 | 1264 | 0.5189 |
| 1024 | 576 | 0.2364 | 976 | 0.4002 |
| 928 | 480 | 0.1969, minimap hidden | 880 | 0.3606 |
| 832 | 384 | 0.1573, minimap hidden | 784 | 0.322 |

Twice the recorded 0.177 is 0.354. Beside the panel the tree reaches it only
from 1313 px up; at 1312 px it is 0.3542, and below that the column costs more
readability than the panel's position earns. 82 rem is exactly that boundary,
so above the breakpoint every side-by-side width meets the plan's target and
below it the canvas takes the whole page width instead.

The same threshold clears iteration 4's reviewed 480 px canvas minimum with
room to spare. That rule needs 930 px of viewport before a side-by-side canvas
holds 480 px of content, which the table confirms: at 928 px the canvas is
480 px of border box, 478 px of content, and the canvas's own container query
hides the minimap. 82 rem is well above it, so the minimap is shown at every
width where the panel keeps its column.

Stacked, the canvas is shorter, `calc(100vh - 22rem)`, so the panel below it
stays within reach rather than being pushed a full screen down.

## A canvas defect the browser evidence found

Iteration 4's focus-into-view did not act in Chromium, although its unit tests
passed. The browser scrolls a scrollable ancestor to reveal the element it
focuses; here it scrolled React Flow's own element by 564 px left and 1108 px
top, and React Flow reset that scroll a moment later. The canvas measured the
row where the browser had briefly put it, read it as already in view, and never
panned. jsdom applies no such scroll, so nothing in the unit suite could see it.

`ModuleTreeCanvas` now undoes that scroll before it measures, in a small
`unscroll` helper between the focus ring test and the viewport test. The canvas
contract in the component's documentation comment and in the module's
`README.md` gained the rule. A case in
`subs/presentation/subs/project-view/src/tests/ModuleTreeCanvas.test.tsx`
covers it: a scrolled ancestor and a row whose box follows that scroll, and the
canvas resets the ancestor and centres on the drawn position. The case fails
against the previous implementation.

This is Ramify source, which iteration 4 owns. It is recorded here because
iteration 5's browser evidence is what found it and BR06's browser half depends
on it. `ModuleTreeCanvasProps` is unchanged, and so is MT14.

## Browser evidence

Chromium was driven through the Playwright MCP server against the fixture
server, which served the production `dist/web` build, as the capability
progress plan's
[iteration 6](../../03-autonomous-implementation-loop/capability-progress-results/iteration6-results.md)
did. The measured values are in
[browser-evidence.json](iteration5-artifacts/browser-evidence.json) and the
screenshots are in [iteration5-artifacts/](iteration5-artifacts/).

```sh
npx tsx subs/harness/src/tests/helpers/serve-progress-fixture.ts --port 4190
```

| Case | Desktop 1440 × 1000 | Narrow 390 × 844 |
| --- | --- | --- |
| `placements`, By module | [page](iteration5-artifacts/placements-by-module-page-desktop.png), [fitted canvas](iteration5-artifacts/placements-by-module-canvas-fit-desktop.png) | [page](iteration5-artifacts/placements-by-module-header-narrow.png), [canvas](iteration5-artifacts/placements-by-module-canvas-narrow.png) |
| The 61-row module | [fit](iteration5-artifacts/sixty-rows-fit-desktop.png), [focused `check-060`](iteration5-artifacts/sixty-rows-focused-check-060-desktop.png) | [fit](iteration5-artifacts/sixty-rows-by-module-narrow.png), [focused `check-060`](iteration5-artifacts/sixty-rows-focused-check-060-narrow.png) |
| The page measure | [Overview](iteration5-artifacts/run-overview-measure-desktop.png) | — |

**Fitted zoom.**

| Tree | Viewport | Canvas | Fitted zoom | Recorded before |
| --- | --- | --- | ---: | ---: |
| `placements`, 2174 × 677 | 1440 × 1000 | 992 × 778, panel beside | **0.4066** | 0.1766 |
| `placements` | 390 × 844 | 342 × 494, panel below | **0.1398** | 0.1398 |
| 61 rows, 2024 × 2853 | 1440 × 1000 | 992 × 778 | 0.2433 | 0.1897 |
| 61 rows | 390 × 844 | 342 × 494 | 0.1502 | — |

The narrow fit is unchanged because the page is already the full width at
390 px: the width cap never bound there, and the canvas is 12 px taller while
the width still limits the fit. The desktop gain is the whole of KI-8.

Rows are readable at the desktop fit. Every capability identifier in the fitted
canvas — `compare-revisions`, `field-diff`, `revision-chain`, `note-preview`,
`digest-format`, `text-wrap`, `draft-sync`, `draft-merge` — and both marks are
legible without zooming, which the fitted-canvas screenshot shows. The tree is
2174 px wide against a 1392 px page, so no layout fits it at full size; the
canvas's zoom and pan remain how a viewer reads a row closely.

**The focused off-screen row.** With the 61-row tree zoomed to 1.0459 by the
canvas's own zoom control, `check-060` sits 1109 px right of and 1714 px below
the 990 × 776 canvas viewport. After a Tab press set the keyboard modality and
focus reached the row with its ring, the canvas centred it: 396 px, 369 px
inside the viewport, at the unchanged zoom 1.0459. The same holds narrow: at
zoom 0.93 the row moves from 716 px, 1421 px outside to 82 px, 229 px inside
the 340 × 492 viewport.

**Console.** 0 messages of any level for the whole session, read with
`browser_console_messages` at level `debug` with `all`.

**Minimap.** Shown with its 15 marks on the 992 px desktop canvas, which is the
first time this view has drawn one; hidden on the 340 px narrow canvas, by the
canvas's own container query. Both follow iteration 4's rule, which the wider
canvas now clears.

## Verification

The plan's precondition ran first from the worktree root: `npm install`,
`npm run build`, then `npm --prefix ramify-agent ci`.

From `ramify-agent/`:

```text
$ npx vitest run subs/web/src/tests
 Test Files  7 passed (7)
      Tests  63 passed (63)

$ npm run type-check
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json
(no output; exit 0)

$ npm run build:web
✓ built in 295ms

$ npm run check:self
Execution: completed; check: passed; coverage: partial
Findings: 0 errors, 0 warnings, 87 analysis limits; 3415 allowed, 0 denied, 1381 external
Completed scope: 8 owners, 275 source files, 13 resources, 4796 accesses
```

The 87 limits are `signature-inferred` limits in the harness: 80 in
`subs/harness/src/interfaces/protocol`, 5 in `subs/harness/subs/evidence/src`
and one each in `subs/harness/src/work` and `subs/harness/src/run`. None is in
`subs/web`, and this iteration adds none. They are ramify-agent's own standing
limits, and Plan 8 scopes the equivalent toolkit work to iteration 1.

From the worktree root, for the canvas correction:

```text
$ npx vitest run subs/presentation/subs/project-view/src/tests
 Test Files  6 passed (6)
      Tests  102 passed (102)

$ npm run type-check
(no output; exit 0)

$ npm run build
✓ built in 245ms

$ npm run check:self
Execution: completed; check: passed; coverage: partial
Findings: 0 errors, 0 warnings, 10 analysis limits; 4550 allowed, 0 denied, 1995 external
Completed scope: 15 owners, 437 source files, 17 resources, 6545 accesses

$ npx tsx scripts/reference-harness/module-tree-consumer.ts
"evidence": "module-tree-package-consumer", "passed": true, "assertions": 47, "failed": []

$ npm run measure:project-explorer -- --only tree --output <scratch>
{ "status": "passed", "passed": true, "failures": [] }
```

The ten toolkit limits are KI-1's, unchanged from iteration 4; iteration 1 owns
them. MT14 was run with `--output` to a scratch path, so the tracked evidence at
`docs/plans/iteration-6b-resident-explorer-server/evidence/iteration4-browser-acceptance.json`
is untouched.

## Files changed

- `ramify-agent/subs/web/src/app.tsx`
- `ramify-agent/subs/web/src/run-page.tsx`
- `ramify-agent/subs/web/src/styles.css`
- `ramify-agent/subs/web/src/tests/app.test.tsx`
- `ramify-agent/subs/web/src/tests/capability-module-tree.test.tsx`
- `subs/presentation/subs/project-view/src/ModuleTreeCanvas.tsx`
- `subs/presentation/subs/project-view/src/tests/ModuleTreeCanvas.test.tsx`
- `subs/presentation/subs/project-view/README.md`
- this results document and its artifacts

## For iteration 6

- The canvas correction is Ramify source. The audits of the plan's final commit
  cover it; the reference self-checks and the frozen gates are unaffected, since
  no package entry, `module.ramify` selection or owner changed.
- `npm run check:self` on ramify-agent reports `coverage: partial` from the 87
  harness `signature-inferred` limits listed above. No iteration of this plan
  owns them, so the audit evidence will record `partial` for ramify-agent.
- The By module canvas now draws its minimap at desktop widths, where the
  capability plan's evidence had none. A desktop screenshot of that view is
  therefore not comparable mark for mark with the capability plan's.
