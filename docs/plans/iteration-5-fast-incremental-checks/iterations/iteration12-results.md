# Iteration 12 results: Hook and session measurements

**Date:** 2026-09-12. **Outcome:** the iteration did not complete. The
workflow was stopped during the fourth measurement run, 30.8 minutes into the
S500 workload. Three of the nine I5-13 workloads produced evidence; six were
never executed. Every binding budget row that was measured was missed, and two
correctness predicates failed.

This record was salvaged after the stop rather than published by the workflow,
so it is not a managed artifact. It preserves what the run established. It is
not an exit record: the iteration's exit criteria are unmet and remain unmet.

## Status of the nine I5-13 workloads

| Workload | Status | Note |
| --- | --- | --- |
| `hook-latency-reference` | measured | nine binding budget rows missed; one correctness predicate failed |
| `hook-latency-s100` | measured | nine binding budget rows missed; one correctness predicate failed |
| `hook-latency-s500` | interrupted | SIGKILL at 1,846,497 ms elapsed; `"failure": "Measurement interrupted"` |
| `hook-latency-s1000` | not executed | |
| `checked-set-bounded` | not executed | |
| `repeated-edit-plateau` | not executed | |
| `hot-warm-memory` | not executed | |
| `cold-open` | not executed | |
| `entry-footprints` | not executed | |

The S500 row records an interruption, not a defect and not a budget miss. It
establishes only that the workload had been running for over half an hour when
it was stopped.

## Measured budget rows

Medians of twenty cycles, from the 13:27 run. Every row below was enforced as
binding under RP-6 when the run executed, and every row was missed.

Those rows were reclassified after the stop. Under
[Two kinds of budget](../../../architecture/memory-lifecycle.md#two-kinds-of-budget)
they are ideal optimization budgets, which are recorded and never enforced, so
these misses do not fail the delivered implementation. See
[closure.md](../closure.md). The table records what the run asserted at the time.

| Workload | Reference observed | Reference target | S100 observed | S100 target |
| --- | ---: | ---: | ---: | ---: |
| Unchanged-surface edit, session work | 540.5 ms | 25 ms | 906.5 ms | 60 ms |
| Source edit, session work | 573.9 ms | 250 ms | 1008.1 ms | 400 ms |
| Description edit, session work | 567.9 ms | 120 ms | 960.2 ms | 500 ms |
| README edit, session work | 523.2 ms | 30 ms | 860.7 ms | 60 ms |
| Created owned file, session work | 1313.6 ms | 600 ms | 2434.8 ms | 1500 ms |
| Deleted owned file, session work | 687.0 ms | 600 ms | 1861.4 ms | 1500 ms |
| Configuration change, session work | 1664.3 ms | 1000 ms | 3294.5 ms | 2500 ms |
| Hook end to end, hook racing the watcher | 1391.6 ms | 200 ms | 2006.1 ms | 250 ms |
| Hook end to end, watcher already published | 207.1 ms | 120 ms | 496.0 ms | 150 ms |

Misses range from 1.7 times the target to 21 times it.

### The fixed per-revision overhead

Session work is nearly flat across edit classes: 523 ms to 574 ms on the
reference and 861 ms to 1008 ms on S100, whether the edit was a README touch or
an export change. The cost is dominated by a fixed per-revision overhead rather
than by work proportional to the edit.

The same run measured the floor beneath it, as the budget section requires:

| Floor | Reference median (n=20) |
| --- | ---: |
| Bare Node process | 34.2 ms |
| CLI client covering a revision with zero daemon work | 206.4 ms |

Session work is `revision.timings.total`, measured inside the session, so the
whole floor is daemon-side and client time is additional. The zero-work client
figure is not an irreducible floor either: most of it is project-root
resolution performed by the daemon on every context open. The
[optimization analysis](../../../analysis/fast-incremental-checks-optimization.md)
decomposes both; this paragraph originally attributed part of the session floor
to the client, which was wrong.

## Correctness predicates that failed

Both are real contract violations, not budget misses, and neither is answered
by a revised target.

### Description edits fall back to the broad revision path

`{kind} {n}: revision path` requires `cycle.revision.checked.path` to equal
`description` for a description edit. It observed `broad` on reference cycle 7
of 20 and on S100 cycle 18 of 20. Nineteen of twenty cycles take the narrow
description path and one falls back. This is iteration 7's description path not
holding reliably.

### The covering rule leaks: published hooks still run analysis

`published hooks perform zero analysis` requires, for each of twenty cycles,
that the watcher has published the requested sequence, that the analysis and
revision counters are unchanged across the hook, and that `coveredRequests`
increases by exactly one. Enumerating the twenty reference cycles:

| Cycle | published/requested sequence | analyses | `coveredRequests` | Outcome |
| ---: | --- | --- | --- | --- |
| 1 | 163/163 | 323 to 325 | 21 to 21 | two analyses ran; the request was never counted as covered |
| 13 | 175/175 | 337 to 338 | 32 to 33 | one analysis ran |
| the other 18 | matched | unchanged | increased by one | as required |

The sequence clause held in every cycle: the watcher had published exactly the
revision the hook then requested, and the daemon performed analysis anyway.
S100 fails the same predicate; its cycles were not enumerated.

Later analysis for the [contract remediation](../../iteration-5-contract-remediation/main-plan.md)
found that only cycle 1 is a daemon violation. Cycle 13, and S100 cycle 18,
were answered by coverage; a periodic sweep then started inside the harness's
settle window and was attributed to the hook.

The sibling predicates `racing hooks launched before publication` and
`racing hooks wait for an uncovered identity` passed.

These rates are drawn from twenty-cycle samples on a loaded host and are soft.
The existence of the violations is not.

## Deferral triggers

| Trigger | Outcome | Observed |
| --- | --- | --- |
| Resolution-bounded narrowing | **triggered** | S100 created-file session median 2434.8 ms |
| Proportional relink | not evaluated | needs S500 and S1000 description medians |
| Syntactic pre-filter | not evaluated | needs the S1000 filtered extraction median |
| Persistent checkpoints | not evaluated | needs S1000 cold session work |
| Child-process host | not evaluated | worker heap preflight recorded (limit 549,453,824 bytes, 512 MiB old generation); no clone measurement |

Four of the five triggers depend on workloads that never ran.

## Measurement identity

Linux 6.8.0-85-generic, x64, Intel Xeon E-2176G at 3.70 GHz, 12 logical CPUs,
67,274,752,000 bytes of memory. Node v22.23.2. Build identity
`fb740a5ffc8a0eeb...`, 304 files, in all four runs.

The 12:09 run overlapped iteration 11, which was still executing until 12:22;
its numbers are contaminated. The 13:27 run followed a corrected
observed-deletion recipe with iteration 11 finished, and is the run quoted
throughout this record. Both agree on the magnitude of the misses.

## Retained raw results

Four archives were written. They are **not committed**: 31.5 MB compressed,
980 MB raw, for three workloads of nine, none of them a validated run. Every
value this record needs is transcribed above. Their identities, should they be
recovered from the iteration worktree:

| File | Measured at | Raw bytes | Gzip bytes | Raw sha256 |
| --- | --- | ---: | ---: | --- |
| `fast-2026-09-12T11-48-32.701Z-d1641483…` | 11:48:32 | 102,829,002 | 2,835,760 | `7dfc0ecef905fb5e…` |
| `fast-2026-09-12T11-55-55.331Z-ad3413d2…` | 11:55:55 | 41,035,624 | 1,894,323 | `75cf676d05a87e81…` |
| `fast-2026-09-12T12-09-43.795Z-ac3543cc…` | 12:09:43 | 464,456,403 | 14,958,073 | `084dd1bb4b3d6cf5…` |
| `fast-2026-09-12T13-27-02.867Z-84008d25…` | 13:27:02 | 371,937,870 | 11,837,109 | `15af29f022a80cba…` |

The first two ended inside the first workload. The last two reached S500.

## What was delivered

Deliverable 1 (`scripts/measurements/fast.mjs` behind `npm run measure:fast`),
deliverable 5 (`measure:resident` amended for the session driver) and the
harness side of deliverable 6 are present: `fast.mjs`, `fast-assertions.mjs`,
`fast-clone.mjs`, `fast-driver.mjs`, `fast-fixture.mjs`, `fast-inputs.mjs`,
`fast-plan.mjs`, `fast-worker.mjs`, `fast-workloads.mjs`, `json-stream.mjs`,
`verify-fast-evidence.mjs`, four test files, and the nine `fast-measure`
handlers in `plan5-fast-measure-cases.ts`. The `@streamparser/json` development
dependency supports the archive reader.

Deliverables 2, 3 and 4 are incomplete: six workloads produced no data, the
binding assertions fail, and four of five deferral triggers are unevaluated.

The harness was transferred onto the workflow branch after the stop and its
registration was merged onto iteration 11's. **It has not been executed since
that transfer**, and the recorded handler total of 97 is the arithmetic sum of
iteration 11's 88 and the nine `I5-13` handlers, not an observed count.

## Handoff

Iteration 13 did not run and this plan does not close as delivered. A follow-up
inherits three separate findings:

1. A fixed per-revision cost in the daemon, independent of edit class, which no
   narrowing of the checked set addresses; the
   [optimization analysis](../../../analysis/fast-incremental-checks-optimization.md)
   locates it.
2. The description revision path falling back to the broad path.
3. The covering rule permitting analysis on a published hook.

The six unmeasured workloads remain unmeasured; S500, S1000, checked-set
bounds, the 200-cycle plateau, hot and warm memory, cold opens and entry
footprints have no Plan 5 evidence on any platform.
