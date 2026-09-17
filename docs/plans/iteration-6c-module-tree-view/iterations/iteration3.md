# Iteration 3: Cross-navigation and gate

**Plan:** [Plan 6C: Module tree view](../main-plan.md).
**Prerequisites:** iterations 1 and 2.
**Owners:** `explorer [ui, browser, dispatch]`, `presentation/project-view [ui, browser]`,
`integration-tests [testing, ui, dispatch]`, documentation.

## Goal

Link the two pages both ways, focus each on a module from the URL, and prove
the workflow with a real server and browser.

## Read first

- [Main plan](../main-plan.md), contracts T5, T6 and T7, and the acceptance table.
- `subs/explorer/src/ProjectExplorerPage.tsx`, `ModuleTreePage.tsx`, `browser-entry.tsx`.
- `subs/presentation/subs/project-view/src/ProjectExplorerView.tsx`.
- `subs/integration-tests/src/browser-acceptance.ts` as extended by Plan 6B.
- [Roadmap](../../../roadmap.md) Plan 6C row and brief.
- The web server section of [processes-and-clients.md](../../../architecture/processes-and-clients.md).

## Deliverables

1. `browser-entry.tsx` passes the decoded `module` query parameter as
   `initialModuleId` to both pages.
2. Tree page: T5 `initialModuleId` behavior, centring the target.
3. Import explorer page: T6 scope, selection, filter reset and notice.
4. `ProjectExplorerView`: optional `onOpenModuleTree` and the "Show in module
   tree" link; the page wires it to a new tab.
5. Browser acceptance extended with MT14–MT16 on isolated endpoints, recording
   T7 timings and the bundle size delta.
6. Architecture: add `/modules/latest` and `?module=` to the web server's page
   list. Roadmap: Plan 6C row and brief updated to match the result.
7. Completion report `iteration3-results.md` with evidence per MT row, the
   T7 measurements, the transport size of the tree's model on `reference` and
   remaining gaps.

## Matrix rows executed here

MT11–MT16.

## Verification

```sh
npm test -- subs/explorer/src/tests/ModuleTreePage.test.tsx
npm test -- subs/explorer/src/tests/ProjectExplorerPage.test.tsx
npm test -- subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx
npm run build
npm run measure:project-explorer
npm run type-check
npm run check:self
```

Full-suite verification goes through the Studio audit, not a manual full run.
MT14 listens for the new page in the browser context and asserts its URL,
breadcrumb and selected module. MT15 waits for the stale control within the
existing polling interval plus the daemon's settle time.

## Exit criteria

Every MT row has current evidence, Plan 6B's RS13–RS17 still pass, and
type-check and self-check are clean.

## Handoff

Completion report with the deferrals from the main plan and the measured model
transport size, for a later tree-specific projection or search plan.
