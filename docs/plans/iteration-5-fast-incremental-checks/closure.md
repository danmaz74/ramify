# Plan 5 closure: stopped before completion

**Date:** 2026-09-13. **Status:** stopped. Plan 5 is **not complete** and its
completion gate did not run.

Workflow `lD1vuzYQuKvbHViU1BMjX` was stopped by the user on 2026-09-12 during
iteration 12. Iterations 1 through 11 completed and were accepted. Iteration 12
produced its harness but only three of nine measurement workloads. The
convergence step after iteration 10 and iteration 13 never started.

This record closes the plan as stopped. It does not assert the completion
conditions of the [main plan](main-plan.md), and no exit criterion should be
read as met because this file exists.

## What was delivered

Iterations 1 through 11 are merged on `docs/roadmap-fast-incremental-checks`
with their results documents beside their iteration plans: the contract package
and probes, the engine changes and the `--plan 5` harness, per-file export
descriptions, the project observer and incremental acquisition, the retained
compiler adapter, the retained session with its fact, source-edit, description,
broad and metadata paths and its audit, session hosting in a worker with the
sweep and deadlines, contexts on the session driver with the Plan 2 engine
removed, the compact reply with `check --changed` and the host adapter, and the
live equivalence gate.

Iteration 11 established functional equivalence: 846 assertions, 30 complete
batch and report comparisons and 30 equal session audits on one build.

## What was not delivered

- **Iteration 12** produced the `measure:fast` harness and the nine
  `fast-measure` handlers, but not its evidence. See
  [iteration12-results.md](iterations/iteration12-results.md).
- **Iteration 13** did not run. The eleven final declarations were not
  validated against [owners.md](owners.md), the resident self-check was not
  turned on the toolkit, the three architecture documents were not revised, and
  the three regression gates were not run on one build.
- The unfiltered `npm run reference:verify -- --plan 5` completion gate, which
  requires all 103 instances, never executed.

## Why the plan cannot be closed as delivered

Functional equivalence held. Two behavioral contracts did not. The performance
result is reclassified below and is not by itself a reason to reject the
implementation.

Two correctness predicates failed: description edits fall back to the broad
revision path, and the covering rule permits analysis on a hook whose revision
the watcher has already published. Neither is answered by any budget revision,
and together they are the reason this plan does not close as delivered.

### The budget result, reclassified

Plan 5 declared its reference and S100 rows binding under RP-6 and enforced
them, and all eighteen were missed by 1.7 to 21 times their targets. Under
[Two kinds of budget](../../architecture/memory-lifecycle.md#two-kinds-of-budget),
adopted 2026-09-13, those rows are ideal optimization budgets: they state what
the design predicts when it behaves as intended, not what the use case
tolerates. **A first delivery is not failed by them, and Plan 5's is not.** The
misses are recorded, with their reasons, as findings for a follow-up.

Plan 5 declared no acceptable-time budget at any point, so the delivered hook
was never measured against a tolerance derived from its use case. Judged
informally against that use case, the measured cost is defensible: 207 ms end to
end when the watcher has already published, and 1392 ms on the reference when
the hook races the watcher, against the alternative of a full batch check. The
figure that would settle it is a batch baseline on the same build, which was
never taken.

One target was infeasible rather than aspirational. The 120 ms end-to-end budget
for an already-published hook sat below the 206 ms cost of the client performing
no analysis; the observed 207 ms means the daemon contributed under a
millisecond and the entire cost is client startup and IPC. That row could not
have been met by any engine, and it is the most actionable item in the set.

Three findings pass to a follow-up, and they are separate problems. None is a
budget dispute:

1. **A fixed per-revision overhead.** Session work is flat across edit classes,
   523 to 574 ms on the reference and 861 to 1008 ms on S100, whether the edit
   was a README touch or an export change. Of the reference floor, roughly
   206 ms is CLI client round trip and roughly 320 ms is fixed daemon cost
   before any analysis runs. Narrowing the checked set reaches neither. This
   is the finding that decides whether the design can meet its budgets at all.
2. **The description revision path falls back to broad**, in 1 of 20 cycles on
   each binding fixture.
3. **The covering rule leaks**, in 2 of 20 reference cycles, one of which also
   failed to count the request as covered.

The deferral triggers Plan 5 defined are mostly unanswered: resolution-bounded
narrowing triggered, and the other four depend on workloads that never ran.

## Evidence and its limits

Measured on Linux 6.8.0-85-generic, x64, Intel Xeon E-2176G, Node v22.23.2,
build identity `fb740a5ffc8a0eeb…`. All figures come from the 13:27 run of
2026-09-12; the 12:09 run overlapped iteration 11 and is contaminated, though
it agrees on magnitude.

Six of the nine I5-13 workloads have **no evidence on any platform**: S1000
hook latency, checked-set bounds, the 200-cycle plateau, hot and warm memory,
cold opens and entry footprints. `hook-latency-s500` was interrupted by the
stop after 30.8 minutes and records nothing about the implementation. No macOS
evidence was collected for this plan.

Rates drawn from twenty-cycle samples on a loaded host are soft. The existence
of the two violations is not.

The four raw measurement archives were not committed: 31.5 MB compressed and
980 MB raw, covering three workloads of nine, none from a validated run. Their
identities are recorded in
[iteration12-results.md](iterations/iteration12-results.md).

## Verification not performed

Closing the plan as stopped deliberately skipped the build, the test suites and
all three regression gates, because the completion gate cannot pass and
re-running the measurement recipe was the cost that prompted the stop. The
merged tree therefore carries **no fresh build or test evidence**. In
particular, the iteration 12 harness was transferred onto iteration 11's
registration by hand and has not been executed since; `plan5.test.ts` expects
97 handlers by arithmetic, not by observation.

A follow-up should run `npm run build && npm run type-check && npm test` before
trusting the merged tree.

## Remaining bookkeeping

The [roadmap](../../roadmap.md) still describes Plan 5 as "a draft awaiting its
iteration 1 contract review". Its Plan 5 row and section should be advanced to
"stopped, implementation merged, two behavioral contracts unmet" and point at
this file. That edit was left undone because the roadmap has unrelated revisions
in flight on this branch.

[scope.md](scope.md#budgets) still presents its table as binding under RP-6 and
splits enforcement by fixture. A follow-up that inherits this recipe should
restate the table by kind and derive acceptable-time budgets from the use case;
the table is left as the record of what Plan 5 actually enforced.
