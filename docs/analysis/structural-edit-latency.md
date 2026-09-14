# Structural edit latency: exploration brief

**Date:** 2026-09-13. **Status:** explored and repaired. The verdicts are in the
[structural edit latency plan's evidence](../plans/iteration-5-structural-edits/main-plan.md#evidence),
and the delivered repairs, their in-process figures and the remaining gaps are in
its [closure](../plans/iteration-5-structural-edits/iterations/closure.md).
The [measurement results](../plans/iteration-5-structural-edits/iterations/measurement-results.md)
answer the question in real processes: 14 of 14 rows within 2 s, the three S100
rows at 496, 472 and 1,843 ms. A later
[revision](../plans/iteration-5-structural-edits/iterations/closure.md#revision-2026-09-14)
withdrew hypothesis 5's inventory repair and answers a hook that names a
configuration file at once as not checked, so the configuration row is no
longer a hook that waits and leaves the budget. This
brief establishes no capability. It follows the [hook optimization](../plans/iteration-5-hook-optimization/iterations/closure.md)
and its [measurement results](../plans/iteration-5-hook-optimization/iterations/measurement-results.md).

## Question

After the hook optimization, 11 of 14 racing-hook rows meet the 2 s
[acceptable-time budget](../architecture/memory-lifecycle.md#two-kinds-of-budget).
The three misses are all on S100: a created file, a deleted file and a
configuration edit. Why do these edits still cost 2.5 to 3.7 s, and what would
bring them under 2 s without losing exactness?

## Evidence

Measured medians on build `4981ed5`, Linux, Bun-compiled client, from the
measurement results. *Before check* is the client time before the daemon's
`check`, mostly `openContext`.

| Row | Hook | Before check | Invocation check | Session work |
| --- | ---: | ---: | ---: | ---: |
| Reference created | 1,526 ms | 150 ms | 130 ms | 1,209 ms |
| Reference deleted | 1,519 ms | 151 ms | 129 ms | 1,202 ms |
| S100 created | 2,497 ms | 589 ms | 503 ms | 1,780 ms |
| S100 deleted | 2,555 ms | 592 ms | 490 ms | 1,852 ms |
| S100 configuration | 3,697 ms | 605 ms | 480 ms | 2,644 ms, plus the required sweep |

Session stages for the broad path:

| Stage | Reference created | S100 created |
| --- | ---: | ---: |
| Compiler | 554 ms | 623 ms |
| Descriptions | 49 ms | 450 ms |
| Accesses | 82 ms | 403 ms |
| Link and decide | 33 ms | 217 ms |
| Outside the named stages | 456 ms | 104 ms |

S100 configuration edits spend 1,101 ms in inventory.

## Hypotheses to test

1. **Root resolution runs again twice.** Resolution reuse replays the recorded
   discovery lookups, including directory listings. A created or deleted file
   changes a listing, so both the daemon and the worker resolve from scratch,
   although the root and configuration rarely change. Candidate repairs:
   validate only the lookups that can change the outcome, or let the worker
   receive the daemon's resolution for the same change.
2. **The compiler rebuilds its program for a changed file set.** A content edit
   reuses the retained program; a changed root file list may not. Establish
   what the compiler stage does for a created file, and whether the
   TypeScript 7 API can update the program incrementally.
3. **Broad analysis re-extracts every owner.** Descriptions, accesses, link and
   decide scale with the project, not the change. Resolution-bounded narrowing
   would re-analyse only the importers whose resolution the created or deleted
   path can change. Establish how to find them exactly, including
   namespace, lazy and symbol-free accesses and `module.ramify` ownership.
4. **Unattributed reference session time.** About 456 ms of a reference broad
   revision falls outside the named stages. Locate it before ranking anything
   else on the reference.
5. **Configuration edits.** Inventory at 1.1 s and the required sweep dominate.
   Establish which part of a configuration change genuinely requires a sweep
   and a full inventory.

## Method

- Start from the timing fields delivered in iteration 1 and the archives named
  in the measurement results. Add temporary instrumentation or a CPU profile
  where a stage is opaque; do not commit it unless it becomes a timing field.
- Measure only the reference and S100, with focused `measure:fast` hook
  workloads or an in-process loop over the session engine. Keep runs short:
  medians of about ten cycles are enough to rank causes.
- Do not run the full test suite by hand, and never stop every Node process.
- Keep exactness first: every candidate repair must keep session results equal
  to batch.

## Deliverable

An analysis document in `docs/analysis/` that, for each hypothesis, states
confirmed or rejected with measured evidence and source lines, estimates the
saving on the reference and S100, and ranks the repairs by saving per effort
with their risk. It names the smallest set that brings the three S100 rows
under 2 s, or explains why no such set exists. It proposes no implementation
plan.

## Out of scope

S500, S1000 and macOS measurement; the watcher batching window (at most about
70 ms left on S100); narrow edits, which already meet the budget; the client
runtime.
