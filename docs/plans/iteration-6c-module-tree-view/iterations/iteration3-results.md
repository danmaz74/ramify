# Iteration 3 results: Cross-navigation and gate

**Date:** 2026-09-17. **Mode:** direct work in worktree `/tmp/worktrees/ramify-module-tree-view`,
branch `feat/module-tree-view`, uncommitted. This is the Plan 6C completion report.

## Built

- `browser-app.tsx`: `selectInitialModule(search)` decodes `?module=` and treats an empty value as absent.
  `createProjectExplorerBrowserApp(container, page, client?, initialModuleId?)` passes it to both pages.
- `ModuleTreePage`: T5 focus.
  - The initial selection is the target, and its ancestors are removed from the initial collapsed set.
  - `centerModuleId` makes the view call `setCenter` once, instead of `fitView`.
  - An unknown target shows `Module <id> is not in this revision`, joined with any binding notice.
- `ProjectExplorerPage`: T6 focus through the exported pure `focusModule(model, id)`.
  - It is applied once to the first model and sets every presentation-class filter.
  - `openModuleTree` defaults to a new tab at `moduleTreeUrl(id)`.
- `ProjectExplorerView`: optional `onOpenModuleTree` and a "Show in module tree" button in the module detail header.
- `ModuleTreeView`: optional `centerModuleId` prop (see deviations).
- `subs/integration-tests/src/browser-acceptance.ts`: a `tree` workload (`--only tree`, and part of the default run).
  - Each fixture gets a foreground server with `--root --port`, as the PM2 app starts it.
  - The run records first-render and toggle-to-paint timings, gzipped bundle bytes and the encoded model size.
  - It fails on any console error or HTTP status ≥ 400.
- `subs/explorer/public/favicon.svg` and its `<link rel="icon">`. The browser's automatic
  `/favicon.ico` request returned 404 and was the only remaining console error.
- Documentation:
  - [processes-and-clients.md](../../../architecture/processes-and-clients.md) lists `/modules/latest` and `?module=`.
  - [testing.md](../../../development/testing.md) describes the `tree` workload.
  - The roadmap row and brief are marked implemented.

## Defect fixed on the way

`createProjectExplorerModel` gave an `ExplorerExport` the ID `['export', originalKey, primaryAlias]`.
The same original exported under the same primary name from two files of one owner therefore
produced two exports with one ID. On the toolkit this caused 210 React duplicate-key warnings in both pages.
It also meant expanding one such export expanded both in the import explorer.

- The ID now includes the file: `['export', file, originalKey, primaryAlias]`.
- New regression test: `project-view.test.ts`, "gives an original exported from two files of one owner distinct export IDs".
  It failed before the fix.
- The pinned encoded size of that file's fixture changed from 5,826 to 5,880 bytes. It is still within the Plan 6A ceiling of 8,485.

## Evidence

| Row | Evidence | Result |
| --- | --- | --- |
| MT11 | `ModuleTreePage.test.tsx`: a nested target collapsed by the 60-module rule is selected, revealed and centred (`fitView` false); an unknown target shows the notice with `fitView` true | pass |
| MT12 | `ProjectExplorerFocus.test.tsx`: `focusModule` for unknown, root, top-level and nested targets; nested scope, breadcrumb, selection and all filters checked; top-level selection; root and unknown notice | pass |
| MT13 | `ProjectExplorerView.test.tsx`: link only with an opener; `ProjectExplorerFocus.test.tsx`: link calls the opener, both URLs encode `/`; `HomePage.test.tsx`: `selectInitialModule` | pass |
| MT14 | [browser evidence](../evidence/iteration3-browser-acceptance.json) `workloads.tree.toolkit` | pass |
| MT15 | same file, `workloads.tree.mutations` | pass |
| MT16 | same file, `workloads.tree.reference` | pass |

MT14 (toolkit, 15 modules):

- Collapsing `ramify/analysis` hid 4 modules and labelled the toggle `+4`; expanding restored them.
- Selecting `ramify/analysis/model` showed its README paragraph.
- Double-clicking opened `/analysis/latest?module=ramify%2Fanalysis%2Fmodel` in a new tab. It showed breadcrumb
  `All Modules / ramify / analysis` with `model` selected.
- "Show in module tree" opened `/modules/latest?module=ramify%2Fanalysis%2Fmodel` with `model` selected.
- No console errors.

MT15 (mutation fixture):

- `fixture/provider` was selected. The harness then added `subs/extra` with a README, a source file and `module.ramify`.
- The refresh control turned stale; refreshing showed revision 2 with `fixture/extra` at the same URL and `provider` still selected.

MT16 and T7 budgets:

| Measure | Budget | Tree-only run | Full run¹ |
| --- | --- | --- | --- |
| `placeTree` median, 500 modules, depth 6 (MT07, Node) | ≤ 25 ms | pass | — |
| First tree render after `projectView` response, reference | ≤ 500 ms | 43 ms | 146 ms |
| Collapse / expand `collection-review/workspace` (12 descendants) to second frame | ≤ 100 ms | 26 / 30 ms | 66 / 88 ms |
| Added gzipped JavaScript over Plan 6B (193,873 → 198,527 bytes) | ≤ 25 KiB | 4,654 bytes | 4,654 bytes |

¹ The [full run](../evidence/iteration3-full-browser-acceptance.json) (`npm run measure:project-explorer`)
also passed every Plan 6B workload, including RS13–RS17. 503 focused Vitest tests were running on the
same host at the same time, which explains the slower timings, still within budget.

Encoded `projectView` model sizes, the transport the tree receives: toolkit 2,347,888 bytes,
reference 224,392 bytes, mutation fixture 5,439 bytes.

## Verification

```sh
npx vitest run subs/explorer subs/service-api subs/presentation subs/integration-tests \
  subs/analysis/subs/descriptions src/tests/explorer-process.test.ts subs/cli/src/tests/explore-command.test.ts
                                   # 35 files, 503 tests passed
npm run type-check                 # clean
npm run build                      # explorer bundle 675.28 kB, gzip 200.24 kB (vite)
npm run check:self                 # passed: 0 errors, 0 warnings, 0 analysis limits
npm run measure:project-explorer -- --only tree --output docs/plans/iteration-6c-module-tree-view/evidence/iteration3-browser-acceptance.json
npm run measure:project-explorer -- --output <scratch>/full-acceptance.json   # passed; copied as iteration3-full-browser-acceptance.json
```

`subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` pins every `module.ramify` as parser
fixtures. Its root, `presentation` and `project-view` fixtures were updated for the new exposures.
The full Vitest suite was not run by hand; per project practice it belongs to the Studio audit on a commit.

## Deviations

- `ModuleTreeViewProps` gained optional `centerModuleId`, the minimal way for the page to centre
  a focused module in React Flow. The main plan's T3 records it.
- Beyond the plan's `placeTree` exposure, the tree helpers `indexModuleTree`, `collapsibleAtDepth` and `ancestorsOf`
  are exposed from `project-view` through `presentation` and the root `module.ramify`.
  The main plan's ownership table records them.
- The export ID fix and the favicon are outside T1–T7 but were needed for a clean MT14 console.

## Remaining gaps

- The toolkit model sent to the tree is 2.3 MB, almost all edges, accesses and exports it does not draw.
  This is the input for the deferred tree-specific projection.
- Centring uses zoom 1. For a very wide tree, the focused module is centred but its siblings may be off-screen.
- No manual PM2 check was repeated. The server process, arguments and routes are unchanged apart from `/modules/latest`.
- Every other deferral in the main plan remains.

## Follow-up: full-height pages

The standalone pages used only about 640 px of the window. The lifted CSS relied on
`height: 100%` from a host container, and the explorer's `index.html` provided none.

- `subs/explorer/src/app-shell.css`, imported by `browser-entry.tsx`, gives `html`, `body` and `#root`
  the full height. The reusable views still fill whatever container embeds them.
- `ProjectExplorerPage` is a column: the notice line, then the view with `flex: 1; min-height: 0`.
- The minimum heights are lower: page 480 px, layout 440 px, content 300 px.
- `useAutoFit` (`project-view/src/auto-fit.ts`) fits both canvases once nodes exist and again after
  each canvas resize, until the viewer pans or zooms. Collapsing or filtering keeps the viewport.
  A focused tree (`centerModuleId`) is not refitted.
- Both views set `initialWidth`/`initialHeight` on their controlled nodes. Before this, the minimap
  drew no nodes, because controlled nodes never receive their measured size.

Evidence:

- [Full browser run](../evidence/followup-full-height-browser-acceptance.json), which passed every workload including RS13–RS17.
  At 1440 × 1000 the tree canvas is 878 px tall and the explorer canvas reaches the window's bottom padding.
  After resizing to 1100 × 700, the tree refits to 578 px. No node lies outside either canvas, both minimaps draw every node,
  and the document does not scroll.
- `auto-fit.test.tsx` covers the first fit, the resize refit, viewer versus programmatic moves, and the disabled case.

## Handoff

- `ModuleTreeView`/`ModuleTreeViewProps` with `centerModuleId`, and the helpers `indexModuleTree`, `collapsibleAtDepth` and `ancestorsOf`.
- `usePublishedProjectView` and `ExplorerClient` in `subs/explorer/src/published-project-view.ts`.
- The `?module=` contract for `/analysis/latest` and `/modules/latest`, with `focusModule`, `moduleTreeUrl` and `importExplorerUrl`.
- The `tree` acceptance workload, and the budgets and sizes above.
