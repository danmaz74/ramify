# Iteration 7: macOS RSS sampling and plan closure

**Plan:** [Plan 5 hook optimization](../main-plan.md).
**Prerequisites:** iterations 1 to 6.
**Owners:** `analysis`; plan and analysis documents.

## Goal

Worker supervision on macOS samples RSS without a process per worker message,
and the plan closes with its evidence.

## Read first

- Main plan: rows HO-19 and HO-20, [Deferrals](../main-plan.md#deferrals).
- Analysis: [target 7](../../../analysis/fast-incremental-checks-optimization.md#7-macos-process-sampling).
- `subs/analysis/src/session-processes.ts` around 57 and its callers; its tests.
- Iteration results 1 to 6.

## Deliverables

1. **Sampling.** Sample the worker's RSS on an interval, or only when a limit
   check needs it, instead of on every worker message. The RSS limit is still
   enforced within a bounded delay; state the bound. Linux behavior unchanged.
2. **Tests** for HO-19 with an injected sampler or platform, runnable on Linux.
3. **Analysis update.** In the optimization analysis, mark targets 0 to 5 and
   7 as delivered by this plan with links to the results; leave measured
   figures unchanged and labelled as pre-optimization.
4. **Closure** in `closure.md`: per matrix row, the test file and case; the
   contract clarifications; the commit audit results per iteration; remaining
   gaps and the measurement successor.

## Matrix rows executed here

HO-19 `rss-sampling`, HO-20 `docs-updated`.

## Verification

```sh
npx vitest run subs/analysis/src/tests
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the worktree.

## Exit criteria

- HO-19 passes; every other analysis test passes.
- Every matrix row has evidence in the closure or is listed as a gap.

## Handoff

The measurement successor runs the fast workloads on the reference and S100,
then S500, S1000 and macOS, against the 2 s acceptable-time budget.
