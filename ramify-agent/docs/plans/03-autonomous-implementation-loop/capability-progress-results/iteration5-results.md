# Capability progress iteration 5: By module on the packaged canvas

**Date:** 2026-09-21. **Owner:** `ramify-agent/web`, with the web project's
Vite and Vitest configuration, and one line in Ramify's canvas stylesheet (see
deviation 1). **Plan:**
[capability progress visualizations](../initial-hypothesis-vs-implemented-module-tree.proposal.md#iteration-5-by-module-on-the-packaged-canvas).

## Changes

- **One React runtime.** `subs/web/vite.config.ts` sets
  `resolve.dedupe: ['react', 'react-dom']`. The `web` project of
  `vitest.config.ts` sets the same dedupe. It inlines `ramify.ts`,
  `@xyflow/react` and `zustand`, and prebundles
  `use-sync-external-store/shim/with-selector.js` through
  `deps.optimizer.client` (deviation 2).
- **`src/capability-module-tree.tsx`** (new) holds `CapabilityModuleTree`,
  `comparisonNodes`, `nodeHeight` and `ModuleCapabilitySelection`. It imports
  only `ModuleTreeCanvas` and its types from `ramify.ts/module-tree`, and it
  creates no `ProjectExplorerModel`.
  - **Nodes.** One node per module whose `placement` is `declared` or
    `proposed`. A declared module's parent comes from the returned tree, and
    a proposed module's parent from `proposedAtStart.parent`. `unplaced`
    modules are not drawn.
  - **Size.** The height is the shell chrome (14 px) plus the header, the
    proposal label and every row (36 px each, with a 3 px gap). There is no
    `+N` and no truncation. The width comes from the longest leaf name, ID or
    indication text.
  - **Emphasis.** `provisional` when `placement` is `proposed`, `muted` when
    the module has no rows, `normal` otherwise.
  - **Body.** The leaf name (with the full path as its `title`), then
    **proposed at start** when `proposedAtStart` is set, then one row
    `button` per capability. Each row shows the literal ID, an outlined
    `Initial: <roles>` mark and a filled green `Implemented` mark. Both marks
    are text. The shell's accessible name is the full path.
  - **Selection.** A row selects by click, `Enter` or `Space` and does not
    select the module. The row detail shows each initial role with its
    hypothesis ID (or "entry assignment"), and the completion reason and
    evidence. Clicking the shell selects the module: `selectedNodeId` is
    set, and the detail shows its placement, its proposal and its capability
    list. Clicking the pane clears the selection. The Run page holds this
    state (`moduleSelection`), so it survives a change of area.
  - **Header.** It names the initial view identity, the tree's revision and
    input (or the tree's unavailable message), the run version and the
    identity policy. A complete coverage reads "Coverage complete: N of M
    capabilities implemented." A partial one lists the known capabilities,
    the known implemented and, when given, the total, followed by the
    harness's gaps. It shows no ratio. An unavailable coverage shows only its
    reason, in an alert.
  - **`unplaced` modules** are listed with their rows in "Not placed in the
    tree", beside the canvas.
- **`run-page.tsx`.** By module is the default subview. It reads
  `getModuleCapabilities` and names its loading and unavailable conditions.
  Only the active subview is mounted.
- **Styles.** `styles.css` begins with `@import 'ramify.ts/module-tree.css'`,
  the only import of the package stylesheet (deviation 3). The rejected
  prototype's rules are gone (`.module-activity*`, `.activity-*`,
  `.eyebrow`). New rules style only the node bodies and the page around the
  canvas (`.capability-module*`, `.capability-row*`, `.capability-mark*`).
  There is no shell rule, no React Flow class and no `nodrag`/`nopan`.
- **Preview.** `examples/capability-module-example.tsx`
  (`?example=capability-module`) renders both HTTP answers of
  `run-protocol.test.ts` "the module-capability comparison of a completed
  scripted run, over HTTP". They were captured by running that test once
  with a temporary dump, which was then removed. The first answer is before
  the view is materialized: the tree is unavailable and every module
  unplaced. The second is after: every module declared, and coverage
  complete. Both go through the shared component. A
  [Chromium screenshot](iteration5-by-module-preview.png) of the dev server
  shows both.
- **Removed.** `module-activity-tree.tsx`, its test, its preview and the
  `?example=module-activity` branch in `main.tsx`.
- **Kept.** The older implementation-map `module-tree.tsx` and its CSS
  (deviation 4).
- **Documentation.** The web README describes By module and the test
  runtime settings.

## Acceptance rows

The files are `subs/web/src/tests/capability-module-tree.test.tsx` (CMT)
and `subs/web/src/tests/run-page.test.tsx` (RP).

| Row | Tests |
| --- | --- |
| CM01 | CMT "CM01: the web module imports the canvas and its styles only from the package…". It scans every web source outside the tests. Relative imports stay inside the project, and one negative control confirms a `../../../../subs/presentation` path would be caught. There is no deep `ramify.ts` path. The only `ramify.ts` imports are `ramify.ts/module-tree` (component) and `ramify.ts/module-tree.css` (styles). Nothing imports `@xyflow`. No file contains `.module-tree__`, `react-flow__`, `nodrag`, `nopan`, `ProjectExplorerModel` or `module-activity`. |
| CM02 | CMT "CM02: every returned capability ID is a row of its module node…": every row's literal ID appears in each module node, each shell's height equals `nodeHeight`, and no `+N` or count marker appears. RP "By module: every row in its node on the packaged canvas…". |
| CM03 | CMT "CM03–CM06…": `entry owner`, `suggested owner` and `involved` appear as distinct role text, and one hypothesis in both roles gives "Initial: suggested owner, involved". The view renders only the returned rows. Anticipated consumers are excluded by the harness, and iteration 3 covers that. |
| CM04 | CMT "CM04: only an implementedHere row shows Implemented…" (every row of the fixture). |
| CM05 | CMT "CM03–CM06…": `moved-thing` has Initial in `shop/notes` and Implemented in `shop/panel`, with no mismatch, elsewhere or unexpected text. |
| CM06 | CMT "CM03–CM06…": `format-date` has Implemented only. |
| CM07 | CMT "CM07: shells follow the harness placement…": a proposed module has the provisional class, `data-emphasis` and "proposed at start", and is drawn below its recorded parent. Rowless modules are muted. The node parents are the harness's answer, and a declared module that was proposed at start keeps its tree parent and a normal shell. CMT "CM07: unplaced modules are listed with their rows beside the canvas and never drawn". |
| CM08 | CMT "CM08…": the complete count; a partial answer with its subtotals, total and gaps and no ratio of its own; an unavailable tree with every module listed and no canvas; an unavailable comparison with only its reason and no `0`. CMT "the compared states are named…". |
| CM09 | CMT "CM09…" (whole view, with a row selected) and RP "By module…" (the Run page's By module section): no `activity`, `commit(s)`, `changed`, `lines`, `deployed` or `%`. |
| CM10 | CMT "CM10: a hook-using row renders in the packaged canvas…". It uses the real `ramify.ts/module-tree` and React Flow. A `useState` body updates on click, and no invalid-hook-call or duplicate-React error occurs. Before the settings, it failed with `TypeError: Cannot read properties of null (reading 'useRef')` at `../node_modules/react/cjs/react.development.js`. That is the checkout's second React, and this was the expected intermediate failure. Build: with dedupe the bundle is 661.09 kB with 3 React element-symbol sites. A throwaway build without dedupe was 669.33 kB with 5. |
| CM11 | CMT "CM11: a row selects by click, Enter or Space…": the row carries `nodrag nopan`, and the shell is not selected. CMT "CM11: the shell selects its module…": the pane clears the selection. CMT "CM11: collapse hides descendants…": focus order is shell, rows, toggle, and `+1` appears when collapsed. RP "By module…": `Enter` on a row, selection kept across areas, and shell selection. Pan, zoom and auto-fit are the canvas's own (iteration 1) and are not re-exercised in jsdom. |
| CM12 | CMT "CM12: a 60-row module keeps every row…": all 60 rows are present, the height is 14 + 18 + 4 + 60 × 36 + 59 × 3, no two laid-out nodes overlap, and the minimap and controls are present. The response bounds are iteration 3's, and the layout budgets are iteration 1's. |
| CM20 | RP "CM20: Progress offers By module and Dependencies, By module by default…" and "By module names its loading and unavailable conditions". |

Iteration 6 still owes the browser evidence for CM02, CM05 to CM08 and
CM10 to CM12.

## Verification

Commands run from `ramify-agent/`:

| Command | Outcome |
| --- | --- |
| `npx vitest run subs/web/src/tests/capability-module-tree.test.tsx` | 14 passed |
| `npx vitest run subs/web/src/tests/run-page.test.tsx` | 13 passed |
| `npx vitest run subs/web/src/tests/client.test.ts` | 7 passed |
| `npx vitest run subs/web/src/tests/capability-graph.test.tsx` | 15 passed |
| `npm run type-check` | clean |
| `npm run build:web` | built (661.09 kB JS, 34.46 kB CSS) |
| `npm run check:self` | passed: 0 errors, 0 warnings, 88 analysis limits (the same count as iteration 4); 2,763 allowed, 0 denied |
| Ramify root: `npx vitest run …/ModuleTreeCanvas.test.tsx …/ModuleTreeView.test.tsx` (after deviation 1) | 28 passed |

- **Built CSS.** The built stylesheet contains `react-flow__pane`,
  `react-flow__minimap`, `module-tree__canvas`, both emphasis shells and the
  shell's `box-sizing`. It contains no unresolved `@import`.
- **Browser smoke.** A headless Chromium session on the dev preview found
  every node body within its shell, with 3 px to spare, and no row
  overflowing horizontally. `Space` on a row showed its detail. The console
  had no error other than a 404 for a resource the page did not name
  (probably the favicon) and React Flow's attribution notice. This is a
  development check, not iteration 6's evidence.
- **Setup.** Ramify was rebuilt from the worktree root (`npm run build`),
  and `node_modules/.bin/ramify` was linked to `../ramify.ts/dist/src/ramify`.
- **Not run.** The full suite, by instruction. No LLM call was made.
- **Processes.** No daemon was started: `check:self` runs `--batch`. The
  capture run's test disposed of its own private Ramify. The dev server was
  stopped by its own command line.

## Searches (completion gate item 5, for the capability view)

- `grep -rnE "from '(\.\./){4}" subs/web/src`: the only matches are
  `tests/helpers/stub-client.ts`, whose four levels resolve to
  `ramify-agent/subs/harness`, inside the project. The CM01 test checks
  every source by resolved path.
- `grep -rn "module-activity|ModuleActivity|@xyflow|react-flow__|module-tree__|nodrag|ProjectExplorerModel" subs/web/src subs/web/index.html`:
  the only match outside the CM01 test itself is
  `.module-tree__canvas` as an assertion target in `run-page.test.tsx`
  (checking that Dependencies unmounts the canvas).
- Other repository references to `module-activity` are in plan and results
  documents only.

## Deviations

1. **Ramify canvas `box-sizing` (a defect fix outside the owner).** The
   canvas shell was content-box. Outside Ramify's explorer, which resets
   `box-sizing` for its whole page, a shell therefore drew 14 px taller and
   26 px wider than the size it was laid out with. Its edges would miss the
   boundaries, and neighbours could overlap. A consumer may not add shell
   CSS, so `module-tree-canvas.css` now gives `.module-tree__node`
   `box-sizing: border-box`. The explorer is unaffected, since it was already
   border-box there. Ramify's canvas and view tests still pass. Ramify was
   rebuilt, but the tarball consumer and relocation runners were not run
   again.
2. **Two more Vitest settings.** Inlining `ramify.ts` and `@xyflow/react`
   was not enough. `zustand`, which React Flow's store uses, was still
   externalized and required the checkout's React. Once it was inlined, its
   CommonJS `use-sync-external-store/shim/with-selector.js` still
   `require`d that React, because an inlined CommonJS file keeps Node's
   resolution. `zustand` is therefore inlined, and that shim is prebundled
   through `deps.optimizer.client`, which applies the dedupe. Both settings
   are harmless once one installed React remains.
3. **Stylesheet import in `styles.css`.** `import 'ramify.ts/module-tree.css'`
   in `main.tsx` fails the web type check (TS2882, an unchecked side-effect
   import), and the web tsconfig has no Vite client types. The single
   import is therefore an `@import` at the top of `styles.css`, which
   `index.html` links. Vite inlines it, including the nested React Flow base
   rules.
4. **`module-tree.tsx` is kept although nothing imports it.** Plan 3 kept it
   deliberately with no consumer (main plan, conversion table; iteration 11
   results, note 8). Removing it is a decision for that plan's owner, not
   for this iteration.
5. **Muted is decided per node.** A module with no rows of its own is
   muted, even when its descendants have rows.
6. **Full path on focus.** The full path is the shell's accessible name,
   which assistive technology announces on focus. Hover shows it as the
   name's `title`, and the module detail shows it too. No visible path
   appears on keyboard focus, because that would need a shell focus rule.
7. **Row keys.** Rows handle `Enter` and `Space` on `keydown` as well as the
   native `click`, so jsdom can exercise them. In a browser, the handler
   prevents the default action, so each key selects once.
8. **The source scan reads files with `node:fs`**, using a
   `/// <reference types="node" />` in that test file, because the web
   tsconfig has `types: []`. A Vite `import.meta.glob` variant was tried
   first. It added two analysis limits (`shared-global` and
   `unsupported-loader`) and needed CSS processing to read `styles.css`, so
   it was dropped.

## Open issues and iteration 6 inputs

- **Browser fixture.** Iteration 6's scripted-run fixture still needs cases
  that the captured `run-protocol` answers lack:
  - a `proposed` module absent from the tree (provisional shell);
  - changed placement (Initial in one module, Implemented in another);
  - an involved role;
  - a module with 60 rows;
  - partial coverage from a bound.

  The component tests construct each of these, but no real run produces
  them yet.
- **Real-browser behaviour to confirm.**
  - Pan, zoom, minimap and auto-fit with tall nodes.
  - `Space` on a row: React Flow treats `Space` as its pan-activation key,
    and a row is a `button` rather than an input, so a press may also arm
    panning.
  - That a single `click` follows `Enter` in Chromium.
  - The fitted zoom of a 17-module tree is small (about 0.39 at
    1440 × 1000). Rows become readable only after zooming or selecting.
- **Stale preview data.** The preview data is a captured copy of the
  harness answer, and no test ties the two together. This is the same
  limitation iteration 4 recorded.
- **Ramify runners.** Ramify's tarball consumer and relocation runners were
  not re-run after deviation 1.
