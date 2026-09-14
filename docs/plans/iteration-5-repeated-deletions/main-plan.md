# Plan 5 repeated deletion revisions

**Date:** 2026-09-13. **Status:** withdrawn on 2026-09-14; no iteration ever
started. The behavior it was written to repair did not occur in the hook
optimization
[measurement](../iteration-5-hook-optimization/iterations/measurement-results.md#anomalies)
on build `4981ed5`, and the
[structural edit latency plan](../iteration-5-structural-edits/main-plan.md)
has since replaced deletion handling with its `membership` path. A hook update
followed by the watcher's update is now the normal shape of a deleted-file
cycle, and its remaining cost is the
[watcher-window deferral](../../analysis/fast-incremental-checks-optimization.md#6-watcher-latency),
target 6 of the optimization analysis. Nothing below was implemented; the text
stands as the record of what was proposed.

This plan was to find and repair why a deleted-file hook publishes a second
broad revision whose inputs equal the revision the watcher just published. It
adds no capability, owner, package entry or wire field.
[Plan 5](../iteration-5-fast-incremental-checks/main-plan.md) contracts and the
[contract remediation](../iteration-5-contract-remediation/main-plan.md) remain
authoritative.

## Workflow and completion boundary

An agent deletes a source file and runs `ramify check --changed <path>` against
a warm resident context. The watcher publishes the deletion first; the hook
then names the same path.

- The hook's update recognizes that nothing changed since the published
  revision and reuses it: no new revision sequence, no broad analysis.
- A deletion the watcher has not yet published is still analysed and published
  exactly as today, and the published result still equals batch.

The plan is complete when both hold under deterministic owner tests, or when
iteration 1 shows the second revision is required for exactness and records
why. No real-process run is part of completion; the deleted-file hook is
measured with the other workloads after the
[optimization work](../../analysis/fast-incremental-checks-optimization.md#measurement-sequencing).

## Evidence

The 13:27 run of Plan 5 iteration 12 on 2026-09-12, build `ed91c6d`, recorded
twenty racing deleted-file cycles on each fixture; its
[results](../iteration-5-fast-incremental-checks/iterations/iteration12-results.md)
identify the archive. Worker message records from that archive, per cycle:

| | Reference | S100 |
| --- | --- | --- |
| Watcher's update, worker round trip | 1,461 to 1,698 ms, broad, 2 changed paths | 2,725 to 3,009 ms, broad, 2 changed paths |
| Hook's update, worker round trip | 848 to 1,113 ms, broad, 1 changed path | 2,150 to 2,464 ms, broad, 1 changed path |
| Hook's update publishes a new sequence | 20 of 20 | 20 of 20 |
| Hook's update has the watcher revision's input identity | 20 of 20 | 20 of 20 |
| Hook end to end, median | 2,697 ms | 5,334 ms |

In every other edit class, body, source, description, README, created and
configuration, the hook's second update in the same archive reuses the
published revision's sequence. Only deletion publishes again, and the repeated
revision carries the same input identity. The deleted rows exceed the 2 s
[acceptable-time budget](../../architecture/memory-lifecycle.md#two-kinds-of-budget)
on both fixtures; the second revision's round trip is 848 to 1,113 ms of the
2,697 ms reference median and 2,150 to 2,464 ms of the 5,334 ms S100 median.

The archive predates `85be06c`, which changed cancellation and sweep
scheduling but not the identity test or deletion classification.

### Where the behavior can arise

These are candidates for iteration 1, not findings.

| Candidate | Location at `85be06c` |
| --- | --- |
| The identity test requires `!state.stale` and a hot adapter; the watcher's broad deletion revision may leave either unmet | [session-revision.ts:362](../../../subs/analysis/src/session-revision.ts#L362) |
| A repeated deletion of an uninventoried path refreshes, and may forget, a compiler-owned absence probe, so `changedInputs` reports a change although the input identity is unchanged | [observer.ts:298-311](../../../subs/analysis/subs/project/src/observer.ts#L298-L311), [session-revision.ts:349-350](../../../subs/analysis/src/session-revision.ts#L349-L350) |
| The engine publishes a broad result without comparing the new input identity to the published one | [session-engine.ts:352-369](../../../subs/analysis/src/session-engine.ts#L352-L369), [:261-262](../../../subs/analysis/src/session-engine.ts#L261-L262) |
| The watcher's update carries two changed paths and the hook's carries one; they may take different classification branches | [observer.ts:203-282](../../../subs/analysis/subs/project/src/observer.ts#L203-L282) |

## Resolved decisions

1. **Reuse rule.** An update whose resulting input identity and facts equal the
   published revision's reuses that revision, whatever the edit kind that
   produced it. A deletion is not exempt.
2. **Exactness first.** If a second revision is needed because the first
   deletion revision was incomplete, iteration 2 repairs the first revision so
   that it is complete, rather than keeping the second.
3. **No live run.** Deterministic owner tests close the plan; measurement
   follows the optimization work.

## Owners

No owner, exposure line or package entry changes.

| Iteration | Owner | Source | Tests |
| --- | --- | --- | --- |
| 1 | `analysis`, `analysis/project` | none, or a test fixture helper | `src/tests/session-revision.test.ts`, `subs/project/src/tests/observer.test.ts` |
| 2 | as iteration 1 locates | `src/session-revision.ts`, `src/session-engine.ts` or `subs/project/src/observer.ts` | as iteration 1 |

## Acceptance matrix

| ID | Case | Evidence | Iteration |
| --- | --- | --- | --- |
| DL-1 | `repeated-deletion-reproduced`: applying a published deletion's path again to a warm session reproduces a new revision with an unchanged input identity | unit, session fixture | 1 |
| DL-2 | `repeated-deletion-cause`: the results name the branch that produces the revision, with source lines and the observed state that selects it | results | 1 |
| DL-3 | `repeated-deletion-reuses`: the repeated update returns `identical: true` with the published sequence and runs no broad analysis | unit | 2 |
| DL-4 | `unpublished-deletion-unchanged`: a deletion not yet applied still produces a broad revision that equals batch | unit | 2 |
| DL-5 | `watcher-then-hook-paths`: the watcher's changed paths followed by the hook's file path publish exactly one revision | unit, session fixture | 2 |
| DL-6 | `other-kinds-unchanged`: repeated created, body and configuration updates still reuse the published revision | unit | 2 |

## Iterations

| Iteration | Title | Prerequisites |
| --- | --- | --- |
| [1](iterations/iteration1.md) | Reproduce and locate the repeated deletion revision | none |
| [2](iterations/iteration2.md) | Reuse the published revision for a repeated deletion | 1 |

## Verification policy

Each iteration runs its owners' test files and `npm run type-check`, never the
full suite by hand; full verification is the cucumber-viz commit audit on the
iteration's worktree. No iteration runs real-process measurement workloads.

## Deferrals

| Deferred | Reason |
| --- | --- |
| Resolution-bounded narrowing for deletions | The watcher's own broad revision remains; narrowing is an optimization target, see the [optimization analysis](../../analysis/fast-incremental-checks-optimization.md#plan-5-deferrals-revisited). |
| Answering the racing hook without a second update at all | Target 4 of the optimization analysis. This plan makes the second update cheap and correct; target 4 removes it. |

## Handoff

The completion report states the cause, the reuse rule as implemented and the
owner test results. The optimization analysis's
[Deleted files](../../analysis/fast-incremental-checks-optimization.md#deleted-files)
section is updated to point at the result.
