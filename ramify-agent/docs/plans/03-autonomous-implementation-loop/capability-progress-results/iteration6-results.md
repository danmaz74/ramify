# Capability progress iteration 6: browser acceptance and completion gate

**Date:** 2026-09-21. **Owner:** `ramify-agent/web` tests, a harness test
fixture, and the plan's result report. Three defects that this evidence found
were fixed in product source; see [defects](#defects-found-and-fixed).
**Plan:** [capability progress visualizations](../initial-hypothesis-vs-implemented-module-tree.proposal.md#iteration-6-browser-acceptance-and-completion-gate).
**Branch:** `feat/capability-progress-views`.

**Outcome.** Every acceptance row has executable or browser evidence. Every
completion-gate item holds, except for two parts:

- The full test suites. The root `npm test`, run through the cucumber-viz
  audit, has one failure, BD24. It predates this plan and is outside its
  surface.
- `ramify-agent`'s complete suite. It has no audit scope, and it was not run
  by hand, by instruction.

Both are listed under [decisions needed](#decisions-needed).

## Commits

| Commit | Content |
| --- | --- |
| `7274c55` | fix(project-view): Enter on a focused collapse control reaches the control |
| `0af48b8` | fix(web): room for the two-line cycle label, and wrapping tab rows |
| `24e7074` | test(harness): capability progress fixture over HTTP, and its browser evidence |
| (this report) | docs: iteration 6 results and plan status |

## Scripted-run fixture

[`subs/harness/src/tests/helpers/progress-fixture.ts`](../../../../subs/harness/src/tests/helpers/progress-fixture.ts)
builds one copy of the `collection-review` project and drives five runs to
their end with the real `RunService` and the scripted fake. No record is
written by hand, and no model is called.

- Every submission goes through the judge.
- Every gate command is spawned.
- Placement decisions come from real global forks.
- The architect view is then materialized by the installed Ramify, in a
  private daemon that is disposed afterwards.

The comparison and capability list below are therefore the harness's own
answers. Building the fixture takes about 40 s.

| Run | Plan | End | Cases it holds |
| --- | --- | --- | --- |
| `placements` | revision-diff | completed | Matching placement (`compare-revisions` in `catalog/core`, `compare-panel` in `catalog/ui`). Changed placement: `field-diff` was suggested for `core`, moved to `ui` by the `extract` decision `gd-002`, and verified by reuse through `wi-002`. Implemented only: `revision-chain`, created by `gd-003` and absent from revision 1. All three initial roles: entry owner, suggested owner, and `field-diff` involved in `contracts`. Dependency depth (`review-digest` → `digest-format` → `text-wrap`). A shared dependency: `text-wrap`, which three consumers depend on. A cycle (`draft-sync` ↔ `draft-merge`). Confirmed and tentative links. An omitted target (`spell-check`). |
| `proposed` | review-notes | failed (`unresolvable-requirement`) | `shared-ui/archive`, proposed at start and absent from the tree, so provisional. A registered `todo` (`badge-legend`) beside a tentative `todo` (`badge-tones`). A `working` capability whose run failed. |
| `capabilityBound` | reviewer-identity | completed | 520 hypotheses: both queries return 500 of 520 and say so. |
| `rowBound` | status-badge-tone | completed | 402 hypotheses, each with five module rows (2,010 rows), so the comparison's 2,000-row bound drops two whole capabilities. |
| `sixtyRows` | status-badge-tone | completed | `reviews/validation` holds 60 rows. |

The two bounds are protocol constants (`runQueryLimits`). Nothing injects
them, so the fixture reaches them by size, without lowered limits.
Hypotheses create no work, which keeps these runs cheap.

[`progress-fixture.test.ts`](../../../../subs/harness/src/tests/progress-fixture.test.ts)
reads each case over HTTP with the protocol schemas (7 tests). It covers:

- how each run ends, as recorded in its final event;
- exact rows per module;
- exact dependency edges and states;
- the proposed placement and its recorded parent;
- both partial coverages, with their gap text and totals;
- the 60 rows;
- CM09 on the real answer.

[`serve-progress-fixture.ts`](../../../../subs/harness/src/tests/helpers/serve-progress-fixture.ts)
serves the same fixture to the built client:

```sh
npm run build:web
npx tsx subs/harness/src/tests/helpers/serve-progress-fixture.ts --port 4191 --out runs.json
```

It prints each run's page, and SIGTERM closes the server and removes the
copy. One detail: the run service's waits hold no event-loop handle of their
own. Vitest's worker masks this, so under plain `tsx` the script keeps an
interval alive until it is stopped.

## Browser acceptance (Chromium)

Chromium was driven through the Playwright MCP server against the fixture
server, which served the production `dist/web` build. The viewports were
desktop 1440 × 1000 and narrow 390 × 844. The measured values are in
[browser-evidence.json](iteration6-artifacts/browser-evidence.json). The
screenshots are in [iteration6-artifacts/](iteration6-artifacts/).

| Case | Desktop | Narrow |
| --- | --- | --- |
| Matching, changed and implemented-only placement; the involved role | [zoomed catalog](iteration6-artifacts/placements-matching-changed-implemented-only-desktop.png), [page](iteration6-artifacts/placements-by-module-desktop.png), [fitted canvas](iteration6-artifacts/placements-by-module-canvas-fit-desktop.png) | [page](iteration6-artifacts/placements-by-module-header-narrow.png), [canvas](iteration6-artifacts/placements-by-module-narrow.png), [zoomed core, row selected by Space](iteration6-artifacts/placements-core-zoomed-narrow.png) |
| Row selection and detail | [Enter](iteration6-artifacts/placements-row-enter-selected-desktop.png), [Enter detail](iteration6-artifacts/placements-row-enter-detail-desktop.png), [click detail](iteration6-artifacts/placements-row-click-detail-desktop.png) | as above |
| Collapse | [workspace collapsed by Enter, +12](iteration6-artifacts/placements-collapsed-workspace-desktop.png) | — |
| Proposed at start, provisional | [provisional shell under its parent](iteration6-artifacts/proposed-provisional-module-desktop.png), [page](iteration6-artifacts/proposed-by-module-page-desktop.png) | [page](iteration6-artifacts/proposed-by-module-header-narrow.png), [canvas](iteration6-artifacts/proposed-by-module-narrow.png) |
| Module with 60 rows | [fit](iteration6-artifacts/sixty-rows-fit-desktop.png), [zoomed top](iteration6-artifacts/sixty-rows-zoomed-top-desktop.png), [panned to check-060](iteration6-artifacts/sixty-rows-panned-bottom-desktop.png) | [page](iteration6-artifacts/sixty-rows-by-module-header-narrow.png), [canvas](iteration6-artifacts/sixty-rows-by-module-narrow.png) |
| Partial coverage from a bound | [capability bound](iteration6-artifacts/capability-bound-by-module-partial-desktop.png), [row bound](iteration6-artifacts/row-bound-by-module-partial-desktop.png) | [capability bound](iteration6-artifacts/capability-bound-by-module-narrow.png), [row bound](iteration6-artifacts/row-bound-by-module-narrow.png) |
| Dependency depth, shared dependency, tentative, omitted target | [graph](iteration6-artifacts/placements-dependencies-desktop.png), [shared dependency selected](iteration6-artifacts/placements-dependencies-shared-selected-desktop.png) | [graph](iteration6-artifacts/placements-dependencies-narrow.png) |
| Cycle | [cycle group](iteration6-artifacts/placements-dependencies-cycle-desktop.png) | in the narrow graph |
| Registered versus tentative `todo`; failed run | [graph](iteration6-artifacts/proposed-dependencies-registered-and-tentative-todo-desktop.png) | [graph](iteration6-artifacts/proposed-dependencies-narrow.png) |
| Bounded capability response (shown / total) | [500 / 520](iteration6-artifacts/capability-bound-dependencies-page-desktop.png) | [graph](iteration6-artifacts/capability-bound-dependencies-narrow.png) |

The row-selection screenshots were taken before the canvas fix, whose code
paths they do not touch. Every other screenshot uses the fixed build that
applied when it was taken, as the page reloads record.

### Behavior observed

**By module, on the packaged canvas.**

- **Only the selected subview is mounted.** With By module selected, the page
  has one React Flow canvas and no dependency graph. With Dependencies
  selected, it has no React Flow element and one graph. This held for every
  run.
- **Rows.** All 12 returned rows of `placements` render with literal IDs and
  the Initial and Implemented marks as text. Their accessible names are, for
  example, `compare-revisions, Initial: entry owner, Implemented`,
  `field-diff, Implemented` (in `ui`) and `field-diff, Initial: involved` (in
  `contracts`). Nine rowless branches are muted.
- **Focus order.** The order is the `catalog/core` shell, its three rows, then
  the next shell. `core` has no collapse control.
- **Row keys.**
  - Enter selects the row. No synthetic click fires, because the handler
    prevents the default, and the shell is not selected.
  - Enter followed by a mouse click gives exactly one click event, and the
    selection is unchanged.
  - Space selects the row without any click event.
- **Space and React Flow's pan key.** Space on a row does reach React Flow's
  pan-activation listener. The keydown arrives at `window` with
  `defaultPrevented: true`, and React Flow's input filter does not exclude a
  `button`, so the pan key is armed while Space is held. In this canvas that
  has no observable effect:
  - the pane is already `draggable`;
  - the wheel still zooms, with Space held on a row and on the page body
    alike;
  - no click fires, and the selection happens once.

  This is recorded as a latent coupling. It is not a defect.
- **Shell selection.** Clicking the `core` shell selects it, and the detail
  lists its three rows. Enter on the `ui` shell selects it. A pane click
  clears the selection.
- **Collapse.**
  - Clicking the `reviews` toggle hides its descendants (15 → 9 → 15 nodes).
  - ArrowLeft and ArrowRight on the `reviews` shell do the same.
  - Enter on the focused `workspace` toggle collapses it (15 → 3 nodes,
    labelled `+12`) and expands it again, with no module selected. This works
    only after the fix below; before it, Enter did nothing.
- **Pan, zoom, minimap and auto-fit with tall nodes.**
  - Auto-fit: scale 0.177 for `placements` in the 432 × 610 desktop canvas,
    0.190 for the 60-row tree, and 0.1 (the canvas minimum) for the row-bound
    tree, whose nodes are thousands of pixels tall.
  - Wheel zoom goes from 0.177 to 1.30. The zoom controls step
    0.180 → 0.216 → 0.180, and the fit-view control restores the fit.
  - Dragging the pane pans. Nine drags moved the 60-row node by 3,600 px at
    scale 1.95, until `check-060` was in view.
  - The minimap has 15 titled marks, and dragging inside it pans the view.
  - The 60-row and row-bound trees have no overlapping nodes, and no row lies
    outside its shell. `validation` is laid out 2,373 px tall.
- **Proposed at start.** `shared-ui/archive` has the class
  `module-tree__node--provisional`, `data-emphasis="provisional"`, a dashed
  computed border and the label "proposed at start". It is drawn under
  `shared-ui` (top 1,056 below the parent's bottom at 1,045, centres aligned).
  Its detail says it is placed under its recorded parent.
- **Partial coverage.** Only known subtotals are shown (500 / 520 and
  400 / 402 total), with the harness's gap text. There is no ratio and no `%`.

**Dependencies.**

- **`placements` graph.**
  - Columns are Depth 0, 1 and 2, with `review-digest` at 0, `digest-format`
    at 1 and `text-wrap` at 2.
  - The detail of `text-wrap` reads "Depended on by field-diff, digest-format,
    note-preview".
  - There are 8 edges, 6 of them tentative (dashed), and one cycle group
    labelled "Dependency cycle: no order among these".
  - `spell-check` is listed as unavailable and gets no node.
  - The counts read "State counts of the 10 returned capabilities".
  - The four registered nodes say "current owner", and the six forecast nodes
    say "suggested owner".
- **`proposed` graph.** It shows `badge-archive, working, entry`,
  `badge-legend, todo, entry` and `badge-tones, todo, forecast only`. The run
  header says `failed`, and no text in the Progress area contains "fail".
- **`capabilityBound` graph.** 500 nodes, with "Showing 500 / 520
  capabilities … Every count here is of the returned set."
- **Keyboard.** Enter on the first node opens its detail, and Tab then Space
  opens the next one. On a node, Enter followed by a click gives two click
  events, one for each action (native button behavior). Selection is
  idempotent.

**Page and runtime.**

- **Narrow width.** After the tab fix, the document is 390 px wide in both
  subviews of all five runs. Before it, the document was 752 px wide.
- **Console.** No console message of any level was recorded in the whole
  session.
- **One React (CM10).**
  - *Built chunk.* A production build with `--sourcemap`, written to a
    scratch directory, lists exactly one `react/cjs/react.production.js`, one
    `react/cjs/react-jsx-runtime.production.js`, one
    `react-dom/cjs/react-dom.production.js`, one
    `react-dom/cjs/react-dom-client.production.js` and one `scheduler`. All
    are from `ramify-agent/node_modules`, and none is from the checkout
    root's copy.
  - *Runtime.* A stub React DevTools hook was installed before load. Exactly
    one renderer injected itself (`react-dom` 19.2.8). Hook-using rows render
    and update, and no invalid-hook-call error occurs.

  This replaces iteration 5's ambiguous marker count.

## Defects found and fixed

| # | Defect | Owner | Fix | Focused test |
| ---: | --- | --- | --- | --- |
| 1 | Enter on a focused collapse control did nothing. The control is inside the node shell, so Enter bubbled to the shell handler. The handler selected the module and prevented the default, which suppressed the button's click. This predates the extraction: Plan 6C's `ModuleTreeView` had the same handler. The contract puts the control in the keyboard focus order. | Ramify `presentation/project-view` (`ModuleTreeCanvas.tsx`) | The shell's key handler acts only when `event.target === event.currentTarget`. That covers the body, as before, and the collapse control. | `ModuleTreeCanvas.test.tsx` "leaves Enter and the other shell keys on a focused collapse control to the control" fails on the unfixed canvas and passes on the fix. The browser confirms Enter collapses (+12) and expands without selecting. |
| 2 | The cycle label wraps to two lines at the node width in Chromium (35 px). Its second line overlapped the first member, because the header left 29 px. | `ramify-agent/web` (`capability-graph.tsx`) | `cycleHeader` 26 → 40. | `capability-graph.test.tsx` cycle test: the header holds two lines at 0.72rem and a 1.5 line height. It fails on 26. The browser shows the label bottom at 1,126 and the first member at 1,135. |
| 3 | At 390 px the Run page's seven area tabs overflowed the page (752 px wide), and Progress itself was off-screen. This predates the plan (Plan 3's Run page), but it blocks narrow access to both diagrams. | `ramify-agent/web` (`styles.css`) | `.tabs { flex-wrap: wrap }`. | `capability-module-tree.test.tsx` "the tab rows wrap…" (a CSS assertion). The browser shows a 390 px document everywhere. |

Fix 1 changes Ramify source, so Ramify was rebuilt. Both Ramify runners,
MT14, the project-view tests and the root self-check were run again
afterwards, as listed below.

## Completion gate

### 1. CM01–CM20 have executable evidence

See the [acceptance matrix](#acceptance-matrix-cm01cm24). Each row names its
tests and artifacts.

### 2. Ramify

All commands ran from the worktree root, after fix 1.

| Command | Result |
| --- | --- |
| `npx vitest run subs/presentation/subs/project-view/src/tests subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` | 7 files, 128 tests passed (project-view alone: 6 files, 97 tests; MT01–MT07 unchanged) |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/relocation.test.ts` | 4 passed |
| `npm run type-check` | clean |
| `npm run build` | success |
| `npm run check:self` | passed: 15 owners, 0 errors, 0 warnings, 10 `signature-inferred` analysis limits (unchanged), 4,550 allowed, 0 denied. The daemon was then stopped with `dist/src/ramify daemon stop`. |
| `npx tsx scripts/reference-harness/module-tree-consumer.ts` | passed, 47 assertions (before fix 1 as well) |
| `npx tsx scripts/reference-harness/relocation-smoke.ts` | passed, 74 assertions (before fix 1 as well) |
| `npm run measure:project-explorer -- --only tree` (MT14) | passed. The 15-module toolkit tree has first render 69 ms; collapsing `ramify/analysis` gives `+4` and 11 nodes; selecting `ramify/analysis/model` shows its purpose; the explorer URL, breadcrumb and back URL are as in iteration 2; full height at 1440 × 1000. See [tree-browser-acceptance.json](iteration6-artifacts/tree-browser-acceptance.json). |

The consumer and relocation runners now include iteration 5's `box-sizing`
change, closing that iteration's open issue.

### 3. `ramify-agent`

| Command | Result |
| --- | --- |
| Focused tests of iterations 3–6: `protocol-contract`, `projections-pure`, `run-protocol`, `progress`, `http`, `progress-fixture`, `capability-graph`, `run-page`, `capability-module-tree`, `client` | 10 files, 117 tests passed |
| `npm run type-check` | clean |
| `npm run build:web` | built: 661.09 kB JS, 34.47 kB CSS |
| `npm run check:self` | passed: 7 owners, 0 errors, 0 warnings, 88 analysis limits (as in iteration 5), 2,813 allowed, 0 denied |
| Complete test suite | **Not run.** It has no audit scope (see [audit](#audit)), and a manual full run was excluded by instruction. |

### 4. A real HTTP query and a Chromium Run-page session

Both demonstrate every named case: see the fixture test and the browser
table above. Initial-only rows appear throughout, for example `note-preview`
and `review-digest`.

### 5. Searches

- **No relative import from Ramify in the web module.** A search for
  `from '../../../../` and `@import '../../../../` in `subs/web/src` outside
  its tests finds nothing. CM01's test also checks every import by its
  resolved path.
- **Package imports.** The only `ramify.ts` imports are
  `ramify.ts/module-tree` in `capability-module-tree.tsx` and
  `ramify.ts/module-tree.css` in `styles.css`. Nothing imports `@xyflow`.
- **No copied layout or React Flow code.** `layoutModuleTree`,
  `indexHierarchy`, `ReactFlow`, `react-flow__`, `module-tree__`, `nodrag`,
  `nopan` and `ProjectExplorerModel` occur in no web source outside the tests.
- **No reference to the rejected nested-list component.** `module-activity`,
  `ModuleActivity` and imports of `./module-tree.js` occur nowhere in
  `subs/web/src` or `index.html` outside the tests. The older
  `module-tree.tsx` still exists with no importer, as iteration 5 recorded.
- **CM24.**
  - No file of Ramify's `src/`, `subs/` or `scripts/` names `ramify-agent`.
  - Of the 28 files this plan changed outside `ramify-agent/`, none gained a
    line naming the agent or a capability. The matches that exist predate
    the plan: `worktree:prepare` in `package.json`, and Ramify's own
    "capability" vocabulary in the reference harness README,
    `relocation.ts` and `descriptions.test.ts`.
  - Ramify's `presentation` uses "capability" only for its own concepts: an
    export's value/type capability and the teaching tree's example domains.
  - Documents such as the root `CLAUDE.md` describe the separate project by
    design. They are not model or source references.

### 6. The report distinguishes kinds of evidence

See the legend of the acceptance matrix below, and the list of
[unavailable evidence](#unavailable-or-failed-evidence).

## Audit

`mcp__cucumber-viz__audit_commit` was run with
`workingDirectory: /tmp/ramify-capability-progress-views` and
`use_existing_head` on `24e7074`. **Overall: FAIL.** Its report ref is
`refs/audited/runs/2026-09-21T21-15-08Z-24e7074`.

- **static: PASS.** This covers `worktree-dependencies` and `type-check`.
- **regression: FAIL.** The root `npm test` passed 2,248 of 2,249 tests in
  167 of 168 files. The one failure is:

  ```text
  FAIL src/tests/dependency-diagram-daemon.test.ts > dependency diagram in the built daemon >
    BD24: reaches ready on Ramify through the process runner while a watch update and
    check --changed complete; the retained session never classifies
  - "coverage": "complete",
  + "coverage": "partial",
  ```

  BD24 expects Ramify's self-check of its own tree to have complete coverage.
  That coverage is partial because of the 10 `signature-inferred` analysis
  limits under Plan 8's signature-companion rule:
  - `subs/presentation/subs/layout/src/geometry.ts` (2);
  - `…/layout/src/viewport.ts` (4);
  - `subs/service-api/src/{project-view,router,web-discovery}.ts` (3);
  - `subs/daemon/subs/contexts/src/tests/controlled-ports.ts` (1).

  Iteration 1 recorded all ten as pre-existing before its first edit. This
  plan changed none of those files and no analysis code. The failure
  therefore predates this branch. No earlier audit record exists to show it
  directly.
- **The frozen gates did not run.** Iteration 2's known gate failures are in
  `validatePackageEntries`, `completion-cases.ts`, `plan5-completion-cases.ts`,
  `entryClosures` in `plan2b-cases.ts`, and "all eight …" in
  `completion-regression.ts`. The audit's `npm test` does not execute them,
  so they were neither observed failing nor passing. They are unchanged.
- **`ramify-agent` audit: unavailable.** `ramify-agent/` has no cucumber-viz
  configuration. The audit call with its directory failed before any check,
  with `Command failed: npm run build` / `Production compiler failed with
  exit 2`, and recorded no report. `ramify-agent`'s complete suite therefore
  has no audited run.

## Acceptance matrix (CM01–CM24)

The evidence kinds are: **S**, a structural check (a search, a source scan
or a manifest); **E**, an executable component, projection or protocol test;
**B**, browser behavior; and **U**, evidence that is unavailable or failed.

| Row | Evidence |
| --- | --- |
| CM01 | S: iteration 5 CMT "CM01…" and the searches in gate item 5. B: the packaged canvas renders the capability tree; MT14 shows the explorer on the same canvas. E: iteration 1 canvas tests. |
| CM02 | E: CMT "CM02…"; RP "By module…"; fixture test (exact rows per module). B: every returned ID is a row in its node in `placements`, `proposed`, the 60-row run and both bounded runs (500 and 2,000 rows drawn). |
| CM03 | E: `progress.test.ts` (iteration 3); CMT "CM03–CM06"; fixture test (`entry-owner`, `suggested-owner`, `involved`, and no row for the anticipated consumer `ui` on `field-diff`'s hypothesis). B: "Initial: entry owner", "suggested owner" and "involved" rows. |
| CM04 | E: `progress.test.ts` reopened and working cases; CMT "CM04". Fixture: only the four registered completed capabilities are implemented; the `working` `badge-archive` and every tentative `todo` are not. B: Implemented only on those four. |
| CM05 | E: `progress.test.ts` `moved-thing`; CMT; fixture `field-diff`. B: [zoomed catalog](iteration6-artifacts/placements-matching-changed-implemented-only-desktop.png), with Initial in `core` and Implemented in `ui`, and no mismatch text. |
| CM06 | E: `progress.test.ts` `format-date`; CMT; fixture `revision-chain`. B: the same screenshot, where `revision-chain` shows Implemented only. |
| CM07 | E: iteration 3 placement tests; CMT "CM07"; fixture `archive` (`proposed`, with its recorded parent). B: the provisional dashed shell under `shared-ui`, labelled proposed at start. The `unplaced` list is covered in E only (iteration 5); the fixture has an available tree. |
| CM08 | E: `protocol-contract.test.ts` and `progress.test.ts` coverage rows; CMT "CM08"; fixture complete and partial answers. B: "Coverage complete: 4 of 10…"; partial answers with known subtotals and gaps, and no ratio or `%`. |
| CM09 | E: `protocol-contract.test.ts` CM09; CMT and RP CM09; the fixture test on the real answer. |
| CM10 | E: iteration 2 tarball consumer (re-run, 47 assertions, one `react`); CMT "CM10". S: built-chunk source map with one React and one React DOM, from `ramify-agent/node_modules`. B: one registered renderer at runtime, and no console error. |
| CM11 | E: iteration 1 canvas tests; CMT "CM11"; RP; plus fix 1's test. B: collapse by click, arrow keys and Enter; shell selection by click and Enter; row selection by click, Enter and Space; focus order; pan; wheel and control zoom; minimap drag; auto-fit. All with variable-height nodes, up to 60 rows and the row-bound tree. |
| CM12 | E: iteration 1 layout budgets; iteration 3 bound tests; fixture both bounds (500 of 520; 400 of 402 at 2,000 of 2,010 rows, with lower-bound text); CMT 60 rows. B: the 60-row module and the 2,000-row tree with no overlap and no row outside its shell, navigable by pan and zoom. |
| CM13 | E: MT01–MT07 unchanged (project-view tests). B: MT14 re-run on the rebuilt explorer after fix 1. |
| CM14 | E: iteration 3 determinism, identity and purity tests. |
| CM15 | E: `capability-graph.test.tsx`; RP CM15–CM17. B: literal `todo`, `working` and `completed` on every node. |
| CM16 | E: graph test "a registered todo and a tentative forecast-only todo…". B: `badge-legend, todo, entry` beside `badge-tones, todo, forecast only`; current and suggested owner labels. |
| CM17 | E: graph layout tests (depth, shared, cycle, determinism); the cycle-header assertion (fix 2). B: depth columns, a shared node with three consumers, and a cycle group with its internal edges and label. |
| CM18 | E: graph bounded tests; fixture. B: "Showing 500 / 520", "State counts of the 500 returned capabilities", and `spell-check` listed as unavailable with no node. |
| CM19 | E: RP CM19 (iteration 4); fixture `proposed` (`capabilityStateSchema` has three members). B: failed run header; nodes read `working` and `todo`, and no "fail" appears in Progress. |
| CM20 | E: RP CM20 (both tests). B: only the selected subview is mounted in every run. |
| CM21 | E: iteration 1 emphasis and body-control tests. B: muted and provisional shells, the latter with a dashed computed border. |
| CM22 | E: consumer runner plain-Node probe (re-run). |
| CM23 | E: both runners (re-run); relocation test (4 passed). |
| CM24 | S: iteration 1's import scan; the searches in gate item 5. |

## Unavailable or failed evidence

- **U.** The root `npm test` in the audit has one failure, BD24, a
  pre-existing coverage expectation (see [audit](#audit)).
- **U.** `ramify-agent`'s complete test suite has no audited run, and it was
  not run by hand.
- **U.** The frozen package-entry gates from iteration 2 were not executed by
  the audit.
- **U.** I1-28 matrix credit still needs `npm run reference:verify` (the
  copied full `npm test`). `relocation-smoke.ts` does not claim it
  (iteration 2).
- **The `unplaced` list in a browser.** The fixture's tree is available, so
  no module is `unplaced`. The list is covered at component level only.
- **A browser only.** Only Chromium was driven, at two widths, and only
  through the Playwright MCP session. There is no committed Playwright
  script, so the browser steps are not repeatable by a test command.

## Observations (not fixed)

1. **The fitted zoom is too small to read.** At 1440 × 1000 the By module
   canvas is 432 px wide beside the detail panel, so the 15-module tree fits
   at about 0.18. Rows become readable only after zooming. Iteration 5 noted
   the same at 0.39. The contract allows navigation by zoom, but the layout
   (canvas width versus side panel) deserves a design decision.
2. **Keyboard focus does not bring a row into view.** Focusing an off-screen
   row, such as `check-060`, selects it by Enter but does not pan the
   canvas. React Flow's auto-pan on focus applies only to focusable React
   Flow nodes, and the canvas makes nodes non-focusable for the contract's
   focus order.
3. **The minimap covers much of the narrow canvas.** At 390 px it takes
   about 200 × 150 of a 342 × 482 canvas, and it can cover the lower part of
   a tall node.
4. **Space arms React Flow's pan key on a row.** See the behavior notes. It
   has no effect today. It would matter if the canvas ever turned off
   `panOnDrag` or made the pan key change the wheel's behavior.

## Decisions needed

1. **BD24.** Either accept `partial` coverage from `signature-inferred`
   limits in BD24's expectation, or declare the 10 signatures so that the
   toolkit's coverage is complete again. It is outside this plan.
2. **The frozen Plan 2 and 2B package gates.** Decide whether they should
   accept the two new entries, for example by comparing the reviewed subset,
   or remain historical (iteration 2's open issue).
3. **`ramify-agent`'s full suite.** Decide how it gets audited evidence: an
   audit scope for `ramify-agent/`, or a sanctioned manual run.
4. **Observation 1**, the By module canvas width, and whether a later plan
   should address observations 2 and 3.
5. The plan's own review decisions 1–3 remain open as written.
