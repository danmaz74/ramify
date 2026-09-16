# Iteration 4: Connected workflow and browser gate

**Plan:** [Plan 6A: Module-only project explorer](../main-plan.md).
**Prerequisites:** iterations 1 through 3 complete.
**Owners:** `explorer [ui, browser, dispatch]` and
`integration-tests [testing, ui, dispatch]` for the integration capability.

## Goal

Connect the narrowed model without dormant target state and prove in the actual
web/browser workflow that analyzed external imports never become explorer
entities.

## Read first

- [Acceptance matrix](../acceptance.md).
- `subs/explorer/src/ProjectExplorerPage.tsx` and its test.
- `subs/integration-tests/src/project-view-projection.test.ts`.
- `subs/integration-tests/src/explorer-router.test.ts`.
- `subs/integration-tests/src/browser-acceptance.ts`.
- Plan 6 iteration 7 results and browser evidence format.

## Deliverables

1. Remove target reconciliation from the connected page; retain module and
   module-edge selection only when the same ID exists after refresh.
2. Update real-router and projection integration assertions for the narrowed
   JSON while checking the pre-projection report for external access witnesses.
3. Update the browser runner to select a module edge instead of an external
   target and assert every graph node/edge endpoint maps to a declared module.
4. Run the reference and toolkit through the actual HTTP process and Chromium,
   including structural assertions that no external-target node or detail
   affordance exists plus positive module/edge interactions.
5. Add the isolated npm-only mutation: establish the report delta and newer
   revision while independently asserting unchanged explorer topology and
   visible import metrics.
6. Re-run ten-refresh cleanup evidence, record new bytes/timing/memory beside
   the Plan 6 baseline and produce `iterations/iteration4-results.md` as the
   completion report with one evidence pointer per matrix row.

## Matrix rows executed here

MX12–MX17, followed by the complete MX01–MX17 gate.

## Verification

Run from the package root:

```sh
npm test -- subs/explorer/src/tests/ProjectExplorerPage.test.tsx
npm test -- subs/integration-tests/src/project-view-projection.test.ts
npm test -- subs/integration-tests/src/explorer-router.test.ts
npm run type-check
npm run build
npm run measure:project-explorer
```

Also run the focused service-api and project-view tests from iterations 2 and
3 after the final integration edits. The browser evidence must name the
displayed revision and the matching report revision. Browser DOM absence does
not replace the router JSON assertion, and router omission does not replace the
report-preservation assertion.

## Exit criteria

Every MX row has current evidence; build, types, focused owners, real router,
actual HTTP and Chromium pass; external accesses remain visible to analysis but
are absent from explorer transport, metrics and UI; cleanup stays within the
settled baseline; and the completion report records any unrelated pre-existing
worktree failures separately.

## Handoff

Consumers receive the module-only DTO and graph props, updated browser workflow,
before/after size record and explicit confirmation that external dependency
inspection is deferred rather than supported through hidden explorer fields.
