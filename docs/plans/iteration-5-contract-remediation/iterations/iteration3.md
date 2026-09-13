# Iteration 3: Harness attribution, ideal budgets and live correctness

**Plan:** [Plan 5 contract remediation](../main-plan.md).
**Prerequisites:** iterations 1 and 2 on one build.
**Owners:** the independent `scripts/measurements/` scope.

## Goal

Judge each hook by the work it caused, report Plan 5's timing targets as ideal
budgets, and confirm the repaired contracts on the reference and S100 with real
processes.

## Read first

- Main plan: resolved decisions 4 and 5, RD-2, rows RC-8 to RC-10.
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
   synthetic cycles reproducing reference cycles 1 and 13.
4. **Live run** (RD-2) with one fresh daemon per workload in its own
   `RAMIFY_ENDPOINT_DIR`, no other builds, tests or measurements on the host:
   `hook-latency-reference`, then `hook-latency-s100`. The results record each
   predicate, every ideal miss with its value, cancelled-analysis and sweep
   counts, and the platform. Raw archives are not committed; their hashes are.

## Matrix rows executed here

RC-8 `hook-attribution`, RC-9 `ideal-budgets-report`, RC-10 `live-correctness`.

## Verification

```sh
npm run build && npm run type-check
node --test scripts/measurements/fast-evidence.test.mjs
npm run measure:fast -- --workload hook-latency-reference --output .reference-work/reports/remediation-reference.json
npm run measure:fast -- --workload hook-latency-s100 --output .reference-work/reports/remediation-s100.json
git diff --check
```

Evidence kind for RC-10 is `measurement` from real processes.
Expected intermediate failures: none after iterations 1 and 2; a correctness
failure here reopens the owning iteration rather than being recorded.

## Exit criteria

- RC-8 and RC-9 pass.
- Both live workloads pass every correctness predicate; ideal misses are
  recorded, not failed.
- The completion report required by the main plan's handoff exists as
  `iteration3-results.md`.

## Handoff

The plan's completion report, and the corrected harness for any later run of
Plan 5's remaining workloads.
