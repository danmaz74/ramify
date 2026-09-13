# Iteration 3: Harness attribution and ideal budgets

**Plan:** [Plan 5 contract remediation](../main-plan.md).
**Prerequisites:** iterations 1 and 2 on one build.
**Owners:** the independent `scripts/measurements/` scope.

## Goal

Judge each hook by the work it caused and report Plan 5's timing targets as
ideal budgets. No real-process workload runs (resolved decision 7).

## Read first

- Main plan: resolved decisions 4, 5 and 7, rows RC-8 and RC-9.
- [Two kinds of budget](../../../architecture/memory-lifecycle.md#two-kinds-of-budget).
- `scripts/measurements/fast-assertions.mjs` (the `target` helper at 79-82,
  `binding` at 189, the published-hook predicate at 224-229),
  `fast-workloads.mjs` (hook sampling near 54), `fast-driver.mjs` (`quiet`,
  79-83), `fast.mjs` (help text and `--workload`), `fast-evidence.test.mjs`,
  `README.md`.
- Plan 5 [iteration 12 results](../../iteration-5-fast-incremental-checks/iterations/iteration12-results.md).

## Deliverables

1. **Attribution.** Sample `afterHook` status immediately after each
   published hook returns. The predicate requires, with `b`, `a` and `s` the
   counters before the hook, after it and settled:
   - the published sequence equals the hook's revision, exit code 0, every
     changed entry covered;
   - `a.coveredRequests === b.coveredRequests + 1`;
   - `a.analyses - b.analyses` equals the sweeps and audits between `b` and `a`;
   - `s.revisions === b.revisions` and `s.coveredRequests === a.coveredRequests`;
   - `s.analyses - a.analyses` equals the sweeps and audits between `a` and `s`.
2. **Ideal budgets.** Every timing and memory target is recorded with
   `enforcement: 'ideal'`, its target and `targetMet`, and never fails a
   workload. The fixture split at `binding` is removed. Correctness predicates
   stay enforced. `fast.mjs --help` and `README.md` state the rule.
3. **Harness tests** for RC-8 and RC-9 in `fast-evidence.test.mjs`, including
   synthetic cycles reproducing reference cycles 1 and 13 and S100 cycle 18.

## Matrix rows executed here

RC-8 `hook-attribution`, RC-9 `ideal-budgets-report`.

## Verification

```sh
npm run build && npm run type-check
node --test scripts/measurements/fast-evidence.test.mjs
git diff --check
```

Then the cucumber-viz commit audit on the iteration worktree. Expected
intermediate failures: none.

## Exit criteria

- RC-8 and RC-9 pass.
- The completion report required by the main plan's handoff exists as
  `iteration3-results.md`.

## Handoff

The plan's completion report, and the corrected harness for Plan 5's
outstanding measurement, including any later run of the hook-latency
workloads.
