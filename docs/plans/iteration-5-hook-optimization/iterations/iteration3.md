# Iteration 3: Build only what a hook publishes

**Plan:** [Plan 5 hook optimization](../main-plan.md).
**Prerequisites:** iteration 2.
**Owners:** `analysis`; `cli` only if a consumer needs a change.

## Goal

Publication stops building, walking and copying the full report; outputs that
include the snapshot are unchanged.

## Read first

- Main plan: resolved decisions 2 and 3; rows HO-7 to HO-9.
- Analysis: [Report materialization on publication](../../../analysis/fast-incremental-checks-optimization.md#report-materialization-on-publication)
  and [target 2](../../../analysis/fast-incremental-checks-optimization.md#2-build-only-what-a-hook-publishes).
- `subs/analysis/src/report.ts`: `ReportDraft`, `build()` near 121, `finish()`
  at 153, report size accounting and the `maxReportBytes` limit.
- `subs/analysis/src/session-engine.ts`: `#publish` at 383-422, the report
  projection at 204 and the reported path at 92.
- `subs/analysis/src/session.ts` 25 and `session-host.ts` 27 (batch).
- `subs/cli/src/format.ts` 21-50 and how a report scope request reaches 204.
- `subs/analysis/src/tests/report-capacity.test.ts`, `report-copy.test.ts`,
  `retained-session.test.ts`.
- [Daemon and analysis](../../../architecture/daemon.md): where report limits
  and published revision fields are described.

## Deliverables

1. **First step, no behavior change.** Publication no longer deep-copies the
   report. Commit this step separately after its tests pass.
2. **Publication projection.** Publication builds `outcome`, `summary`,
   `diagnostics`, `warnings` and `coverage` without the snapshot, and applies
   `maxReportBytes` to what it builds. Summary counts come from facts.
3. **Full report on request.** Report scope, `--format json` and batch build
   the full report from retained facts and apply the limit there, unchanged.
4. **Contract text.** Add resolved decision 3's clarification to
   `docs/architecture/daemon.md` where the report limit or published revision
   is described.
5. **Tests** for HO-7 to HO-9. HO-7 compares revision fields with a full
   `finish()` of the same facts.
6. **Results** in `iteration3-results.md`.

## Matrix rows executed here

HO-7 `publication-without-snapshot`, HO-8 `full-report-on-request`, HO-9
`hook-passes-under-limit`.

## Verification

```sh
npx vitest run subs/analysis/src/tests
npx vitest run subs/cli/src/tests
npx vitest run subs/daemon/subs/contexts/src/tests
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the worktree, after each commit.

## Exit criteria

- HO-7 to HO-9 pass; every other test in the touched owners passes.
- Only HO-9's behavior differs from before; any existing expectation changed
  for it is listed with its reason.

## Handoff

The publication projection's function and the report-on-request path, for the
closure report.
