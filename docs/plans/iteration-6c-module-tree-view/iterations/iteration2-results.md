# Iteration 2 results: Connected tree page

**Date:** 2026-09-17. **Mode:** direct work in worktree `/tmp/worktrees/ramify-module-tree-view`,
branch `feat/module-tree-view`.

## Built

- `subs/explorer/src/published-project-view.ts`:
  - `usePublishedProjectView(client, { pollIntervalMs })` per T2. It holds the loading, polling, `isNewerRevision`
    staleness, binding notice and `refresh()` logic that lived in `ProjectExplorerPage`.
  - `ExplorerClient`, `ProjectViewResult` and `bindingStateText` moved here. `HomePage`,
    `browser-app` and the page test import them from here.
- `ProjectExplorerPage.tsx` uses the hook. Export-signature loading, selection, scope and filters stay in the page.
- `ModuleTreePage.tsx`:
  - Selection and the collapsed set are derived during render: the initial collapse rule
    (`EXPANDED_TREE_LIMIT = 60`) and the pruning of removed IDs apply in the same render as a new model.
    An effect then stores the pruned values. A first implementation applied the rule in an effect,
    which rendered one frame fully expanded; the MT09 test caught it.
  - `importExplorerUrl(id)` and a `window.open(..., '_blank', 'noopener')` opener, which tests can inject.
- `browser-app.tsx`: `selectBrowserPage` returns `'tree'` for `/modules/latest`, and the app renders `ModuleTreePage`.
- `HomePage.tsx`: `serverPages` lists "Module explorer" and "Module tree".
- `subs/service-api/src/web-process.ts`: `/modules/latest` serves `index.html`.
- Exposures: `project-view` and `presentation` expose `indexModuleTree` and `collapsibleAtDepth`
  (tagged `[ui, browser]`: a first attempt with `[browser]` failed `missing-required-tag`). The root
  `module.ramify` exposes the tree view and helpers from `presentation` to descendants.
  Without that exposure the explorer imports were `not-visible`.

## Evidence

| Row | Test | Result |
| --- | --- | --- |
| MT08 | `ProjectExplorerPage.test.tsx`, all 7 existing cases including RS12, unchanged | pass |
| MT09 | `ModuleTreePage.test.tsx`: 60 vs 61 modules, collapse below depth 2, stale and refresh with kept/dropped IDs, binding notice, opener | pass |
| MT10 | `web-process.test.ts`: `/modules/latest` and `?module=` served on both loopback hosts, 403 for other hosts; `HomePage.test.tsx`: two links and path selection | pass |

## Verification

```sh
npx vitest run subs/explorer/src/tests subs/service-api/src/tests/web-process.test.ts   # 23 passed
npm run type-check                                                                    # clean
npm run build && npm run check:self                                                   # passed, 0 errors
```

## Deviations

- T3 exposure scope grew to the tree helpers the page needs (`indexModuleTree`, `collapsibleAtDepth`),
  and the root `module.ramify` gained the matching `expose-sub`. The main plan's ownership table records both.

## Handoff

The hook, `ModuleTreePage`, the path selection and the built bundle.
