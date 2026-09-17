# Iteration 2: Connected tree page

**Plan:** [Plan 6C: Module tree view](../main-plan.md).
**Prerequisites:** iteration 1's `ModuleTreeView`.
**Owners:** `explorer [ui, browser, dispatch]` and `service-api [dispatch]`.

## Goal

Serve the tree at `/modules/latest` as a live page sharing the import
explorer's loading, polling and staleness logic.

## Read first

- [Main plan](../main-plan.md), contracts T1, T2 and T5.
- `subs/explorer/src/ProjectExplorerPage.tsx`, `browser-entry.tsx`,
  `browser-app.tsx`, `HomePage.tsx` and the revision comparison, as delivered by Plan 6B.
- `subs/explorer/src/tests/ProjectExplorerPage.test.tsx`, `real-router-model.ts`.
- `subs/service-api/src/web-process.ts` and `src/tests/web-process.test.ts`.
- `subs/explorer/module.ramify`.

## Deliverables

1. `usePublishedProjectView.ts` per T2; `ProjectExplorerPage` uses it with no
   behavior change.
2. `ModuleTreePage.tsx` per T5, without `initialModuleId`: collapsed-set rule,
   selection and collapsed-set reconciliation on refresh, new-tab opener.
3. `browser-entry.tsx`: `/modules/latest` → tree page; `browser-app.tsx`
   renders the selected page.
4. Home page: second entry "Module tree".
5. `web-process.ts`: `/modules/latest` serves `index.html` under the Plan 6B
   host policy.
6. `explorer/module.ramify` exposure updated for any new exported symbol.

## Matrix rows executed here

MT08–MT10.

## Verification

```sh
npm test -- subs/explorer/src/tests/ProjectExplorerPage.test.tsx
npm test -- subs/explorer/src/tests/ModuleTreePage.test.tsx
npm test -- subs/explorer/src/tests/HomePage.test.tsx
npm test -- subs/service-api/src/tests/web-process.test.ts
npm run explorer:build
npm run type-check
npm run check:self
```

MT09 uses a fake `ExplorerClient` that publishes a second revision removing
one module and adding another.

No intermediate failures are expected.

## Exit criteria

MT08–MT10 pass, the bundle builds, type-check and self-check are clean.

## Handoff

Iteration 3 receives `ModuleTreePage`, the hook, the entry path selection and
the `explorer:build` bundle size after this iteration.
