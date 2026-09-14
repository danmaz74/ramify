# Hook optimization: measurement results

**Date:** 2026-09-13. **Outcome:** on this Linux host the optimized build
answers every reference hook row and four of seven S100 rows within the 2 s
[acceptable-time budget](../../../architecture/memory-lifecycle.md#two-kinds-of-budget).
Before the plan, five of fourteen rows were within it. Narrow-edit racing hooks
are 9 to 13 times faster on the reference and 5 to 7 times faster on S100. The
S100 created, deleted and configuration rows still exceed the budget. Every
correctness predicate passed on every completed workload run. S500, S1000,
macOS and memory were not measured, by request.

Figures are labelled:

- **measured**: medians from this session's archives;
- **archive**: pre-optimization medians from the Plan 5 iteration 12 run of
  2026-09-12, build `ed91c6d`, as transcribed in the
  [optimization analysis](../../../analysis/fast-incremental-checks-optimization.md);
- **derived**: arithmetic on measured medians. Medians of different fields do
  not add exactly.

A median is the harness's: the element at index `floor(n/2)` of the sorted
cycles.

## Environment and builds

| Item | Value |
| --- | --- |
| Host | Linux 6.8.0-85-generic x64 container, Intel Xeon E-2176G at 3.70 GHz, 12 logical CPUs, 62 GiB |
| Node | v22.23.2 for the harness, daemon, worker and baseline client |
| Bun | 1.4.2 (root `bun` dev dependency) compiled the optimized client |
| Baseline | detached worktree `/tmp/ramify-hook-baseline` at `8236a00` (source equal to `85be06c`), build identity `b93d479d…`; installed bin `dist/src/cli-entry.js` (Node) |
| Optimized | worktree `/tmp/ramify-hook-optimization` at `4981ed5`, build identity `17c117df…`; installed bin `dist/src/ramify`, which executes `dist/src/ramify-client-Linux-x86_64` (Bun-compiled) |
| Harness | each build's own `scripts/measurements`; see [Harness differences](#harness-differences) |

**Load and census.** Before the first run the load average was 0.36 and the
process census showed only idle Claude Code, VS Code and cucumber-viz server
processes. A measurement alone keeps the host about 65 to 75% idle, with a load
average of 3 to 5, through its 50 ms process sampling. From 17:08 a 10 s `top`
log, and from 17:28 a 1 s `/proc/stat` idle sampler, ran beside the
measurements. They showed recurring bursts of host-wide saturation, 0 to 5%
idle for 1.5 to 2 minutes about every 6 to 7 minutes (17:11:44, 17:17:44,
17:24:36). No process visible in this container accounted for them, so they
come from outside it. See [Host contention](#host-contention).

## Commands and archives

From each worktree root, one run at a time:

```sh
RAMIFY_MEASUREMENT_ACTIVITY='Linux host shared with idle Claude Code/VS Code sessions and an idle cucumber-viz server; no other builds or measurements; load average <at start>; one measurement at a time (<label>)' \
  node scripts/measurements/fast.mjs --workload hook-latency-reference   # or hook-latency-s100
```

Both builds ran `npm run build` first; the baseline also ran `npm ci` and
`npm run worktree:prepare`. A `--workload` run always exits 1 because the
remaining workloads are not executed; the workload rows themselves report
`measured` and `passed`.

Raw reports are under each worktree's `.reference-work/reports/`; gzip archives
and an appended `index.json` entry are under `scripts/measurements/results/`.
None is committed.

| Run | Build | Workload | Start (UTC) | Minutes | Raw report | Archive |
| --- | --- | --- | --- | ---: | --- | --- |
| B-ref | baseline | reference | 16:56:35 | 9.4 | `fast-2026-09-13T16-56-35.366Z.json` | `…16-56-35.367Z-3c213982….json.gz` |
| O-ref | optimized | reference | 17:07:08 | 3.7 | `fast-2026-09-13T17-07-08.426Z.json` | `…17-07-08.426Z-40759740….json.gz` |
| B-s100 | baseline | S100 | 17:11:22 | 14.6 | `fast-2026-09-13T17-11-22.102Z.json` | `…17-11-22.102Z-7e63f3df….json.gz` |
| O-s100 | optimized | S100 | 17:27:15 | 6.5 | `fast-2026-09-13T17-27-15.328Z.json` | `…17-27-15.328Z-418898d9….json.gz` |
| B-s100-2 | baseline | S100 | 17:34:48 | 13.6 | `fast-2026-09-13T17-34-48.574Z.json` | `…17-34-48.575Z-1e6f62e7….json.gz` |
| O-s100-2 | optimized | S100 | 17:49:27 | 5.5 | `fast-2026-09-13T17-49-27.626Z.json` | `…17-49-27.627Z-4acc93b8….json.gz` |
| B-ref-2 | baseline | reference | 17:55:29 | stopped | `fast-2026-09-13T17-55-29.676Z.json` | `…17-55-29.676Z-0bcad7ba….json.gz` |

B-ref-2 was interrupted with SIGINT after its zero-work phase when the scope was
reduced; none of its data is used. Optimized S100 figures pool O-s100 and
O-s100-2, 40 cycles per row.

## Workloads

Each `hook-latency-<fixture>` workload runs twenty bare Node processes, twenty
zero-work client checks, twenty racing hooks for each of body, source,
description, README and configuration edits, twenty deleted/created pairs and
twenty hooks after the watcher has published. Twenty cycles are fixed by the
harness.

| Workload | Status | Reason |
| --- | --- | --- |
| `hook-latency-reference` | run, both builds | primary |
| `hook-latency-s100` | run, optimized twice, baseline twice | primary |
| `hook-latency-s500`, `hook-latency-s1000` | not run | by request |
| `repeated-edit-plateau`, `hot-warm-memory`, `entry-footprints` | not run | long; outside the hook comparison; by request |
| `checked-set-bounded`, `cold-open` | not derived | they need all four hook-latency workloads |
| Node entry of the optimized build | not run | by request |

By request, the **S100 baseline is the archive**, not this session's baseline
runs. Those runs are kept as corroboration below.

## Racing hook, end to end

The primary use case. Medians in milliseconds. Every optimized row passed
`racing hooks are answered from the racing revision`; every baseline row passed
its harness's `racing hooks wait for an uncovered identity`.

### Reference, 15 owners

| Edit | Archive | Measured baseline | Measured optimized, p90 | Archive ÷ optimized (derived) |
| --- | ---: | ---: | ---: | ---: |
| Body | 1,381 | 1,392 | **152** (156) | 9.1× |
| Source | 1,409 | 1,447 | **157** (207) | 9.0× |
| Description | 1,404 | 3,259 ¹ | **147** (150) | 9.5× |
| README | 1,362 | 2,376 ¹ | **104** (114) | 13.1× |
| Created | 2,194 | 2,509 | **1,526** (1,570) | 1.4× |
| Deleted | 2,697 | 2,508 ² | **1,519** (1,568) | 1.8× |
| Configuration | 3,262 | 4,699 ³ | **1,872** (2,119) | 1.7× |

¹ Contended: every stage in these cycles is inflated about 2.5 times over the
body and source cycles of the same run. This run predates the host logs, so the
cause is inferred, and the archive is the before figure.
² See [Anomalies](#anomalies): the repeated deletion revision did not occur.
³ Session work matches the archive; see [Anomalies](#anomalies), item 2.

### S100, 100 owners

| Edit | Archive (baseline) | Measured optimized, all 40 cycles, p90 | Optimized, quiet cycles only (n) | Archive ÷ optimized (derived) |
| --- | ---: | ---: | ---: | ---: |
| Body | 2,003 | **319** (370) | 319 (40) | 6.3× |
| Source | 2,110 | **419** (448) | 419 (40) | 5.0× |
| Description | 2,065 | **368** (401) | 368 (40) | 5.6× |
| README | 1,962 | **266** (300) | 266 (40) | 7.4× |
| Created | 3,614 | **2,497** (5,033) | 2,298 (24) | 1.4× |
| Deleted | 5,334 | **2,555** (4,643) | 2,355 (24) | 2.1× |
| Configuration | 5,503 | **3,697** (4,610) | 3,649 (33) | 1.5× |

Quiet cycles are those whose interval from write to hook exit overlaps no host
sample below 40% idle. The wide p90 of created and deleted comes from the
contended cycles.

### Budget verdict

| Rows at or under 2 s median | Reference | S100 | Total |
| --- | ---: | ---: | ---: |
| Before (archive) | 4 of 7 | 1 of 7 (README) | 5 of 14 |
| After (measured optimized) | **7 of 7** | **4 of 7** | **11 of 14** |

Still over: S100 created (2,497 ms; 2,298 quiet), deleted (2,555; 2,355 quiet)
and configuration (3,697; 3,649 quiet). The reference configuration row is at
1,872 ms, with a p90 of 2,119 ms.

## Hook after the watcher published, and client cost

| Workload | Reference archive | Reference measured baseline | Reference optimized | S100 archive | S100 optimized |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hook, watcher already published | 207 | 210 | **49** | 496 | **161** |
| Zero-work client check | 206 | 204 | **57** | about 422 ⁴ | **147** |
| Bare Node process | 34 | 37 | 45 | n/a | 29 |
| Client process start and exit (hook minus CLI `totalMs`, derived) | n/a | 52 | **25** | n/a | **25** |

⁴ Analysis estimate, in-process reproduction.

Every published and zero-work hook passed its zero-analysis predicate, with
all four session-work reply fields zero.

## Session work

`revision.timings`, medians in milliseconds, measured optimized. *Unattr.* is
`total` minus the eight stages. The archive totals are the analysis's.

### Reference

| Edit | Path | Classify | Inventory | Compiler | Descr. | Accesses | Link | Decide | Publish | Unattr. | Total | Archive total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Body | unchanged-surface | 11.8 | 0.7 | 2.3 | 11.1 | 4.2 | 1.0 | 2.9 | 6.8 | 8.1 | **51.0** | 540.2 |
| Source | source | 9.6 | 0.6 | 2.1 | 9.8 | 16.2 | 23.2 | 3.1 | 6.5 | 6.3 | **80.6** | 573.0 |
| Description | description | 10.3 | 1.8 | 0 | 0 | 0 | 18.9 | 13.0 | 6.2 | 3.6 | **58.3** | 567.3 |
| README | metadata | 9.3 | 0.7 | 0 | 0 | 0 | 0 | 0 | 6.4 | 3.6 | **20.7** | 522.8 |
| Created | broad | 5.9 | 11.3 | 554.3 | 49.4 | 81.7 | 20.1 | 12.6 | 6.5 | 456.5 | **1,209.4** | 1,312.6 |
| Deleted | broad | 6.0 | 10.6 | 547.8 | 47.6 | 87.6 | 20.3 | 14.6 | 6.4 | 455.3 | **1,201.6** | 685.1 ⁵ |
| Configuration | broad | 7.5 | 206.8 | 375.8 | 50.8 | 90.9 | 21.4 | 13.4 | 6.6 | 470.2 | **1,234.7** | 1,662.4 |

⁵ Not comparable: the archive row was the repeated deletion's cheap second
revision (compiler 0.5 ms). Measured baseline deleted total: 1,620.0 ms.

### S100

| Edit | Classify | Inventory | Compiler | Descr. | Accesses | Link | Decide | Publish | Unattr. | Total | Archive total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Body | 4.0 | 1.4 | 5.4 | 20.2 | 1.1 | 5.6 | 7.5 | 29.6 | 6.1 | **80.6** | 904.1 |
| Source | 4.0 | 1.5 | 4.9 | 20.4 | 4.9 | 97.7 | 14.5 | 29.3 | 6.1 | **184.3** | 1,006.7 |
| Description | 5.7 | 1.5 | 0 | 0 | 0 | 86.9 | 4.2 | 29.6 | 2.8 | **131.7** | 959.3 |
| README | 3.6 | 1.7 | 0 | 0 | 0 | 0 | 0 | 29.2 | 2.2 | **36.7** | 859.0 |
| Created | 4.9 | 7.2 | 623.2 | 449.5 | 403.2 | 99.4 | 117.3 | 37.6 | 104.1 | **1,779.9** | 2,434.5 |
| Deleted | 5.6 | 6.1 | 635.0 | 443.3 | 407.0 | 115.3 | 133.9 | 37.6 | 108.2 | **1,851.9** | 1,857.7 |
| Configuration | 12.5 | 1,101.4 | 392.7 | 434.4 | 358.7 | 94.9 | 95.7 | 33.2 | 101.8 | **2,643.7** | 3,292.7 |

The per-revision floor (classify, inventory, publish, unattributed) fell from
422 to 27 ms on a reference body edit and from 859 to 41 ms on S100 (derived).

## Where the hook's time goes

Measured optimized medians from `ramify.check/1` `timings` and
`revision.capture`. *Before check* is CLI `totalMs − waitedMs` (derived):
connect, `openContext`, hashing. *Service* includes queueing and the round
trip; *round trip* includes the invocation check and session work.

| Fixture, edit | Hook | Process | Before check | Service | Round trip | Invocation check | Session | Publication | Updates per hook | Covered on publication |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Ref body | 152 | 27 | 31 | 88 | 77 | 13 | 51 | 5.7 | 2 (hook's, then watcher's) | 0/20 |
| Ref source | 157 | 25 | 23 | 114 | 105 | 11 | 81 | 5.2 | 2 | 0/20 |
| Ref description | 147 | 26 | 27 | 90 | 80 | 11 | 58 | 5.4 | 2 | 0/20 |
| Ref README | 104 | 21 | 29 | 55 | 46 | 11 | 21 | 5.6 | 2 | 0/20 |
| Ref created | 1,526 | 20 | 150 | 1,356 | 1,348 | 130 | 1,209 | 5.1 | 1 | 1/20 |
| Ref deleted | 1,519 | 19 | 151 | 1,349 | 1,342 | 129 | 1,202 | 5.3 | 1 | 1/20 |
| Ref configuration | 1,872 | 20 | 171 | 1,679 | 1,341 | 130 | 1,235 | 5.2 | 1, plus the required sweep | 6/20 |
| S100 body | 319 | 19 | 134 | 166 | 161 | 75 | 81 | 3.1 | 1 | 1/40 |
| S100 source | 419 | 22 | 137 | 263 | 258 | 67 | 184 | 2.9 | 1 | 1/40 |
| S100 description | 368 | 20 | 136 | 213 | 207 | 68 | 132 | 2.9 | 1 | 1/40 |
| S100 README | 266 | 19 | 131 | 117 | 111 | 69 | 37 | 2.7 | 1 | 2/40 |
| S100 created | 2,497 | 24 | 589 | 1,872 | 2,292 ⁶ | 503 ⁶ | 1,780 | 0 | 1 | 40/40 |
| S100 deleted | 2,555 | 25 | 592 | 1,919 | 2,342 ⁶ | 490 ⁶ | 1,852 | 0 | 1 | 40/40 |
| S100 configuration | 3,697 | 30 | 605 | 3,052 | 3,149 ⁶ | 480 ⁶ | 2,644 | 0 | 1, plus the required sweep | 40/40 |

⁶ From `revision.capture`, because a hook covered on publication reports zero
reply session work.

Watcher timestamps, measured: `flushedAt − receivedAt` is 100 ms at the median
and at most 107 ms at p90 in every row, the batching window itself. Receipt
coincides with the write at millisecond resolution.

Findings:

- **Reference narrow edits no longer wait for the watcher.** The hook reaches
  `check` about 58 ms after launch (process plus before check, derived), before
  the 100 ms batch flushes. Its own update publishes the revision with
  `capture.watch` null, and the watcher's duplicate update follows after the
  hook returns. Target 6 has no remaining saving on these rows.
- **S100 narrow edits pay root-resolution replay twice.** Before check is about
  135 ms against 31 ms on the reference, and the worker's invocation check is
  66 to 75 ms against 11 to 13 ms. Both are replays of the reused resolution's
  discovery queries, which grow with the fixture's enumerations
  ([iteration 4](iteration4-results.md)). Together they are about 200 ms of a
  266 to 419 ms hook (derived). The hook arrives after the flush, and one update
  consumes both the batch and the request. The time from flush to publication
  exceeds the round trip by about 70 ms (derived), so target 6 could save at most
  that.
- **Created and deleted files resolve the root again, twice.** On S100 the
  worker's invocation check is 490 to 503 ms, and before check is about 590 ms.
  That fits the daemon's `openContext` resolving again for the same enumerated
  directory change, the known iteration 4 gap. Broad analysis adds 1.78 to
  1.85 s: compiler about 630, descriptions about 445, accesses about 405.
- **Configuration on S100** spends 1,101 ms in inventory and 480 ms in the
  invocation check, and waits for the required sweep.
- **Reference broad revisions** keep about 455 ms of session time outside the
  eight stages, 38% of their total; S100 broad revisions keep about 105 ms. No
  field attributes it.
- **Link is now the largest narrow stage on S100:** 87 to 98 ms of a 132 to
  184 ms session for description and source edits.
- **Publication work** is 3 to 6 ms, and the stage `publish` is 6 to 38 ms, down
  from 130 to 713 ms.

## Estimate against actual

| Workload | Analysis estimate | Measured optimized |
| --- | --- | ---: |
| Unchanged-surface session work, reference | 50 to 80 ms | 51.0 ms |
| Unchanged-surface session work, S100 | about 100 ms | 80.6 ms |
| Hook, watcher already published, reference | 60 to 70 ms | 49.2 ms |
| Hook, watcher already published, S100 | not estimated | 161.3 ms |
| Racing hook, reference body | about 300 ms; about 150 ms with target 6 | 152.3 ms |
| Racing hook, S100 body | not estimated | 318.5 ms |
| Target 3, root resolution per invocation and update, S100 | 330 ms each | replay remains: about 135 ms before check and 66 to 75 ms invocation check on narrow edits (derived) |
| Target 4, racing second update | 413 and 489 ms saved | no hook pays a second update before its reply in any row |
| Target 5 plus compiled client, process and endpoint | 25 to 30 ms per invocation from the build key | zero-work client 204 to 57 ms on the reference, including root-resolution reuse |

The reference racing figure reaches the target-6 estimate without target 6,
because the faster client reaches `check` before the batch flushes.

## Harness differences

- The baseline harness installs the Node entry. The optimized harness installs
  the launcher and refuses to run without the compiled client. Hook durations
  therefore include each build's own client.
- The optimized harness replaces the racing predicate. It accepts a hook
  covered on publication or answered by an update that included it. The baseline
  predicate requires no covered request. Both passed on their builds.
- Budgets, cycle counts, fixtures and every other predicate are identical.
  No harness change was made.

## Host contention

Cycles were classified against the host samples: contended if any sample
overlapping the interval from write to hook exit shows less than 40% idle.
Classification is available from 17:08, so B-ref and the first 90 s of O-ref are
unknown. Affected rows:

| Run | Contended rows |
| --- | --- |
| B-ref | description and README, inferred from uniform stage inflation |
| B-s100 | all 20 body cycles, 14 of 20 published, 10 of 20 configuration, the zero-work phase |
| O-s100 | 13 of 20 created, 13 of 20 deleted |
| O-s100-2 | 3 of 20 created, 3 of 20 deleted, 7 of 20 configuration |
| O-ref | none observed after 17:08 |

This contention is why the S100 baseline repeated and the optimized S100 ran
twice. For each S100 row, the table above gives both the all-cycle median and
the quiet-cycle median.

**Corroboration of the S100 archive.** Quiet cycles of the two measured baseline
S100 runs: body 2,104 (20), source 2,395 (32), description 2,154 (20), README
2,094 (35), created 3,907 (29), deleted 3,921 (28), configuration 8,167 (30),
published 498 (26) and zero-work client 468 (20). They agree with the archive
within 15% except deleted and configuration, below.

## Anomalies

1. **Repeated deletion revision not reproduced at `8236a00`.** Every baseline
   deleted cycle, on both fixtures, added one revision; the hook's second update
   reused it. The archive's cheap second revision predates `85be06c`. The
   [repeated deletion plan](../../iteration-5-repeated-deletions/main-plan.md)
   was withdrawn on 2026-09-14 against this evidence, without starting.
2. **Baseline configuration hooks exceed the archive while their session work
   matches it.** Reference: hook 4,699 ms against 3,262 ms, session work
   1,715 ms against 1,662 ms. S100 quiet cycles: hook 8,167 ms against
   5,503 ms, session work 3,207 ms against 3,293 ms. The difference is outside
   session work, and the baseline has no timing fields to attribute it. It was not
   investigated; the optimized build is 1,872 and 3,697 ms.
3. **The invocation check is not zero for an unchanged invocation.** HO-10
   requires no root resolution, and none runs, but the reuse replay costs 11 to
   13 ms on the reference and 66 to 75 ms on S100 per update.
4. **Reference hooks still run two updates** in the narrow classes. The second
   is the watcher's duplicate after the hook returns, so it is not hook latency.
   It is session work the daemon still performs.
5. **Contended baseline rows.** Every baseline reference description and README
   cycle, and all baseline S100 body cycles, were contended; see
   [Host contention](#host-contention).

No correctness predicate failed. No source or harness file was changed.

## Memory

Not measured: no plateau or footprint workload ran. The harness's per-cycle
retention and cleanup predicates passed on every completed run, and no measured
process remained after the runs.

## Recommended next targets

1. **Root-resolution replay per hook.** Replay runs in both `openContext` and
   the worker's invocation check: about 200 ms of an S100 narrow hook. On a
   created or deleted file the root resolves again in both places, about 1 s on
   S100. Skip the replay while the watcher reports no change to a discovery
   input, and resolve once per change rather than in both processes.
2. **Resolution-bounded narrowing** for created and deleted files: 1.78 to
   1.85 s of broad analysis on S100, the largest remaining cost in two
   over-budget rows.
3. **Configuration edits on S100:** 1.1 s of inventory and the required sweep.
4. **Attribute the reference broad path's unattributed session time**, about
   455 ms per revision.
5. **Proportional relink**, now the largest narrow stage on S100; measure at
   S500 and S1000 first.
6. **Target 6** is small: about 70 ms on S100 narrow hooks and nothing on the
   reference, with the batch window measured at 100 ms.
7. **Remaining measurements:** S500, S1000, macOS and memory plateaus, on a host
   without outside CPU bursts or with contention classification.
