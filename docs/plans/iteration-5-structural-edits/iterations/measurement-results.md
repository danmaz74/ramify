# Structural edit latency: measurement results

**Date:** 2026-09-13. **Outcome:** on the same Linux host as the hook
optimization measurement, the closing build `7080722` answers every reference
and S100 hook row within the 2 s
[acceptable-time budget](../../../architecture/memory-lifecycle.md#two-kinds-of-budget):
14 of 14 rows, against 11 of 14 on `4981ed5`. The three S100 rows over budget
before now measure 496 ms (created), 472 ms (deleted) and 1,843 ms
(configuration). The configuration row keeps a p90 of 2,044 ms, and 2 of its 20
cycles exceed 2 s. The reference configuration row is 1,246 ms; the in-process
regression of iteration 6 does not appear in the hook. Every correctness
predicate passed. No cycle was contended. S500, S1000, macOS and memory were not
measured.

**Revision, 2026-09-14.** Every configuration figure below was measured on a
build with iteration 6 in place, and with a hook that waited for the
configuration verdict. The
[closure's revision](closure.md#revision-2026-09-14) changed both: iteration 6
is reverted, so a configuration edit acquires the project again, and a hook that
names a configuration file is answered at once as not checked, exit code 2, with
the daemon's revision published behind the reply. The configuration rows
therefore no longer measure a hook that waits, and the reference configuration
regression and review decision 3 they weighed are moot. A successor re-measures,
in real processes, the configuration hook's reply latency, which should fall to
about the zero-work client check, and the background revision the daemon
publishes behind it, including whether its capture still carries no sweep. Every
other row below stands.

Figures are labelled:

- **measured**: medians from this session's archives, build `7080722`;
- **before**: the optimized medians on build `4981ed5` from the hook optimization
  [measurement results](../../iteration-5-hook-optimization/iterations/measurement-results.md),
  on the same host;
- **derived**: arithmetic on medians. Medians of different fields do not add
  exactly.

A median is the harness's: the element at index `floor(n/2)` of the sorted
cycles. A p90 is the element at index `floor(0.9n)`.

## Environment and builds

| Item | Value |
| --- | --- |
| Host | Linux 6.8.0-85-generic x64 container, Intel Xeon E-2176G at 3.70 GHz, 12 logical CPUs, 62 GiB (`totalMemoryBytes` 67,274,752,000) |
| Node | v22.23.2 for the harness, daemon, worker and batch analysis |
| Bun | 1.4.2 (root `bun` dev dependency) compiled the client |
| Measured build | detached worktree `/tmp/ramify-structural-measure` at `7080722`, build identity `e0b88843…`; report `inputs.build` 315 files, `f905bd9e…` |
| Client | report `client`: bin `node_modules/.bin/ramify`, launcher `dist/src/ramify`, executes `dist/src/ramify-client-Linux-x86_64`, runtime `bun-compiled` |
| Harness | the build's own `scripts/measurements`; see [Harness differences](#harness-differences) |
| Before | `4981ed5`, not measured again: CPU model, logical CPUs, memory, platform and release equal the hook optimization record |

**Load and census.** Before the reference run the load average was 0.35; before
the S100 run it was 0.86. The census showed only idle Claude Code, VS Code,
Codex, Playwright MCP and cucumber-viz server processes, 406 entries. A 1 s
`/proc/stat` idle sampler (idle plus iowait) and a 10 s `top` log ran from
22:38:28 to 22:48:07 UTC, before the worktree install and past the last run.
Idle was never below 72% (mean 84% during the runs). No process other than the
measurement's own used more than 20% of a CPU in any `top` sample. The outside
bursts recorded by the hook optimization measurement, about every 6 to 7
minutes, did not occur in this 9.6 minute window.

## Commands and archives

From `/tmp/ramify-structural-measure`, after `npm ci`, `npm run worktree:prepare`
and `npm run build`, one run at a time:

```sh
RAMIFY_MEASUREMENT_ACTIVITY='Linux host shared with idle Claude Code/VS Code sessions and an idle cucumber-viz server; no other builds or measurements; load average <at start>; one measurement at a time (<label>)' \
  node scripts/measurements/fast.mjs --workload hook-latency-reference   # or hook-latency-s100
```

Each run exited 1, as a `--workload` run does, and its row reported `measured`
and `passed` with no failed assertion and no live process at cleanup.

Raw reports are under the worktree's `.reference-work/reports/`; gzip archives
and their appended `index.json` entries are under `scripts/measurements/results/`.
None is committed.

| Run | Workload | Load | Start (UTC) | Minutes | Raw report | Archive |
| --- | --- | ---: | --- | ---: | --- | --- |
| S-ref | reference | 0.35 | 22:39:07 | 2.8 | `fast-2026-09-13T22-39-07.444Z.json` | `…22-39-07.444Z-f57ba437….json.gz` |
| S-s100 | S100 | 0.86 | 22:42:36 | 3.4 | `fast-2026-09-13T22-42-36.775Z.json` | `…22-42-36.775Z-fafcb079….json.gz` |

The recipe's second S100 run applies when contention affects more than a few
created, deleted or configuration cycles. None was contended, so S100 ran once
and every S100 figure is from 20 cycles.

## Racing hook, end to end

Medians in milliseconds. Every row passed `racing hooks are answered from the
racing revision`. Quiet cycles are those whose interval from write to hook exit
overlaps no idle sample below 40%; here every cycle is quiet.

### Reference, 15 owners

| Edit | Before | Measured, p90 | Quiet (n) | Before ÷ measured (derived) |
| --- | ---: | ---: | ---: | ---: |
| Body | 152 | **94** (99) | 94 (20) | 1.6× |
| Source | 157 | **101** (112) | 101 (20) | 1.6× |
| Description | 147 | **96** (99) | 96 (20) | 1.5× |
| README | 104 | **59** (71) | 59 (20) | 1.8× |
| Created | 1,526 | **306** (344) | 306 (20) | 5.0× |
| Deleted | 1,519 | **312** (345) | 312 (20) | 4.9× |
| Configuration | 1,872 | **1,246** (1,297) | 1,246 (20) | 1.5× |

### S100, 100 owners

| Edit | Before, all cycles (quiet) | Measured, p90 | Quiet (n) | Before ÷ measured (derived) |
| --- | ---: | ---: | ---: | ---: |
| Body | 319 (319) | **123** (150) | 123 (20) | 2.6× |
| Source | 419 (419) | **222** (247) | 222 (20) | 1.9× |
| Description | 368 (368) | **169** (198) | 169 (20) | 2.2× |
| README | 266 (266) | **72** (95) | 72 (20) | 3.7× |
| Created | 2,497 (2,298) | **496** (553) | 496 (20) | 5.0× |
| Deleted | 2,555 (2,355) | **472** (522) | 472 (20) | 5.4× |
| Configuration | 3,697 (3,649) | **1,843** (2,044) | 1,843 (20) | 2.0× |

Ranges: S100 created 447 to 617 ms, deleted 454 to 550 ms, configuration 1,747 to
2,063 ms; reference configuration 1,202 to 1,402 ms.

### Budget verdict

| Acceptance figure | Before, all (quiet) | Measured, all (quiet) | p90 | Within 2 s |
| --- | ---: | ---: | ---: | --- |
| S100 created | 2,497 (2,298) | **496** (496) | 553 | yes |
| S100 deleted | 2,555 (2,355) | **472** (472) | 522 | yes |
| S100 configuration | 3,697 (3,649) | **1,843** (1,843) | 2,044 | yes, median; 2 of 20 cycles over |
| Reference configuration | 1,872, p90 2,119 | **1,246** (1,246) | 1,297 | yes |

| Rows at or under 2 s median | Reference | S100 | Total |
| --- | ---: | ---: | ---: |
| Before (`4981ed5`) | 7 of 7 | 4 of 7 | 11 of 14 |
| Measured (`7080722`) | **7 of 7** | **7 of 7** | **14 of 14** |

## Hook after the watcher published, and client cost

| Workload | Reference before | Reference measured | S100 before | S100 measured |
| --- | ---: | ---: | ---: | ---: |
| Hook, watcher already published | 49 | **45** | 161 | **45** |
| Zero-work client check | 57 | **44** | 147 | **45** |
| Bare Node process | 45 | 24 | 29 | 26 |
| Client process start and exit, zero-work (hook minus CLI `totalMs`, derived) | 25 | 36 | 25 | 37 |
| Before check, zero-work (CLI `totalMs − waitedMs`, derived) | n/a | 6.9 | n/a | 7.7 |

Every published and zero-work hook passed its zero-analysis predicate. The
S100 published and zero-work hooks now equal the reference: the resolution
replay that made them 3 times slower is gone. See
[Anomalies](#anomalies), item 4, for the client process figure.

## Where the hook's time goes

Measured medians from `ramify.check/1` `timings` and `revision.capture`.
*Before check* is CLI `totalMs − waitedMs` (derived). *Round trip* is
`capture.workerRoundTrip`. *Session* is `revision.timings.total`. No hook in
either fixture was covered on publication, so reply and capture fields are
equal.

| Fixture, edit | Hook | Process | Before check (before) | Service | Round trip | Invocation check (before) | Promotion | Sweep | Session | Publication | Covered on publication |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ref body | 94 | 31 | 7.3 (31) | 55 | 48 | 0.4 (13) | 2.3 | 0 | 36 | 4.4 | 0/20 |
| Ref source | 101 | 17 | 7.2 (23) | 77 | 70 | 0.4 (11) | 1.8 | 0 | 59 | 4.4 | 0/20 |
| Ref description | 96 | 28 | 7.2 (27) | 59 | 53 | 0.4 (11) | 0 | 0 | 45 | 4.6 | 0/20 |
| Ref README | 59 | 17 | 7.3 (29) | 33 | 27 | 0.4 (11) | 0 | 0 | 16 | 4.4 | 0/20 |
| Ref created | 306 | 17 | 7.2 (150) | 281 | 275 | 0.4 (130) | 42.5 | 0 | 265 | 4.4 | 0/20 |
| Ref deleted | 312 | 17 | 7.8 (151) | 286 | 280 | 0.6 (129) | 44.8 | 0 | 270 | 4.4 | 0/20 |
| Ref configuration | 1,246 | 23 | 7.2 (171) | 1,207 | 1,200 | 0.4 (130) | 415.6 | 0 | 1,192 | 4.4 | 0/20 |
| S100 body | 123 | 18 | 7.5 (134) | 96 | 92 | 0.4 (75) | 2.8 | 0 | 84 | 2.9 | 0/20 |
| S100 source | 222 | 18 | 7.3 (137) | 197 | 191 | 0.4 (67) | 2.6 | 0 | 184 | 2.8 | 0/20 |
| S100 description | 169 | 17 | 7.3 (136) | 143 | 135 | 0.4 (68) | 0 | 0 | 129 | 2.8 | 0/20 |
| S100 README | 72 | 17 | 7.2 (131) | 47 | 43 | 0.4 (69) | 0 | 0 | 37 | 2.7 | 0/20 |
| S100 created | 496 | 18 | 7.4 (589) | 450 | 442 | 0.4 (503) | 30.8 | 0 | 435 | 4.1 | 0/20 |
| S100 deleted | 472 | 17 | 7.6 (592) | 447 | 443 | 0.4 (490) | 31.4 | 0 | 436 | 2.8 | 0/20 |
| S100 configuration | 1,843 | 19 | 7.5 (605) | 1,801 | 1,795 | 0.4 (480) | 86.3 | 0 | 1,785 | 3.2 | 0/20 |

Revision paths, in 20 of 20 cycles of each row: `unchanged-surface`, `source`,
`description`, `metadata`, `membership` for created and deleted, and `broad` for
configuration. Created revisions check 2 files and 1 access; deleted revisions
1 file and 1 access; configuration revisions check 60 files and 295 accesses on
the reference, 1,201 files and 1,902 accesses on S100. No capture carried a
`watch`: every hook's own update published its revision.

### After the hook returns

Worker operations recorded in each cycle's settled instrumentation, medians.
The hook's update is sent 42 to 43 ms after the write in every row, before the
watcher's 100 ms batch flushes.

| Fixture, edit | Watcher's update after the hook | Sweep after the hook |
| --- | --- | --- |
| Ref narrow rows | 20 to 26 ms, 100 to 142 ms after exit | 1 maintenance sweep in 20 description cycles |
| Ref created, deleted | 20 ms (18 of 20 start after exit), 20 ms | 1 maintenance sweep in 20 deleted cycles |
| Ref configuration | `broad`, **116 ms**, 16 of 20 start after exit, the other 4 within 1 ms before | **282 ms** in 20 of 20 cycles, starting 129 ms after exit |
| S100 narrow rows | about 14 ms (2 of 20 source cycles start before exit) | none |
| S100 created, deleted | 15 ms (3 of 20 created start before exit), 12 ms | 1 maintenance sweep in 20 created cycles |
| S100 configuration | `broad`, **172 ms**, 17 of 20 start after exit, the other 3 within 1 ms before | **285 ms** in 20 of 20 cycles, starting 186 ms after exit |

Findings:

- **Root resolution no longer runs per hook.** Before check is 6.9 to 7.8 ms and
  the worker's invocation check 0.4 to 0.6 ms in every row of both fixtures. Before
  the plan they were 23 to 171 and 11 to 130 ms on the reference, and 131 to 605
  and 67 to 503 ms on S100. On S100 created and deleted the two together fell by
  about 1,080 ms (derived).
- **Created and deleted files take the membership path.** Session work is
  265 and 270 ms on the reference (from 1,209 and 1,202) and 435 and 436 ms on
  S100 (from 1,780 and 1,852). Round trip minus session is about 10 ms on the
  reference and 7 ms on S100.
- **The configuration hook no longer waits for a sweep.** Its update reaches the
  worker before the watcher's batch, so the capture has no sweep requirement
  (`capture.sweep` 0 in 40 of 40 cycles). The configuration-only sweep, 282 and
  285 ms, runs after the hook returns, following the watcher's second `broad`
  update. Before the plan the configuration row waited for the required sweep.
- **Every hook in both fixtures runs one update before its reply.** The watcher's
  update follows. On S100 this is new: before the plan the S100 hook arrived
  after the flush and was covered on publication in 40 of 40 structural cycles.

## Session work

`revision.timings`, measured medians in milliseconds. *Prom.* is
`capture.promotion`. *Still unattr.* is `total` minus the eight stages minus
promotion, per cycle. *Before total* is the `4981ed5` median.

### Reference

| Edit | Path | Classify | Inventory | Compiler | Descr. | Accesses | Link | Decide | Publish | Prom. | Still unattr. | Total | Before total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Body | unchanged-surface | 7.5 | 0.7 | 1.8 | 8.7 | 2.8 | 0.6 | 2.4 | 5.8 | 2.3 | 3.1 | **35.7** | 51.0 |
| Source | source | 7.1 | 0.7 | 1.7 | 8.3 | 11.9 | 16.1 | 3.0 | 5.7 | 1.8 | 3.0 | **59.2** | 80.6 |
| Description | description | 7.3 | 1.9 | 0 | 0 | 0 | 15.5 | 10.6 | 5.6 | 0 | 3.1 | **44.5** | 58.3 |
| README | metadata | 7.1 | 0.7 | 0 | 0 | 0 | 0 | 0 | 5.7 | 0 | 3.0 | **16.4** | 20.7 |
| Created | membership | 7.3 | 3.2 | 177.4 | 5.5 | 2.3 | 16.0 | 2.8 | 5.9 | 42.5 | 3.1 | **264.7** | 1,209.4 |
| Deleted | membership | 7.5 | 3.1 | 177.6 | 5.1 | 2.6 | 17.3 | 2.8 | 6.0 | 44.8 | 3.1 | **270.4** | 1,201.6 |
| Configuration | broad | 3.2 | 104.4 | 499.7 | 44.7 | 79.2 | 20.5 | 12.0 | 6.2 | 415.6 | 5.0 | **1,191.5** | 1,234.7 |

### S100

| Edit | Path | Classify | Inventory | Compiler | Descr. | Accesses | Link | Decide | Publish | Prom. | Still unattr. | Total | Before total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Body | unchanged-surface | 3.5 | 1.1 | 5.3 | 19.9 | 1.1 | 5.2 | 11.2 | 29.5 | 2.8 | 3.3 | **84.2** | 80.6 |
| Source | source | 3.5 | 1.3 | 5.0 | 19.1 | 4.7 | 92.3 | 18.3 | 29.9 | 2.6 | 3.2 | **184.3** | 184.3 |
| Description | description | 5.7 | 1.4 | 0 | 0 | 0 | 84.9 | 4.3 | 29.6 | 0 | 2.7 | **129.4** | 131.7 |
| README | metadata | 3.4 | 1.4 | 0 | 0 | 0 | 0 | 0 | 29.6 | 0 | 2.2 | **36.9** | 36.7 |
| Created | membership | 4.7 | 3.3 | 230.4 | 19.4 | 1.1 | 86.1 | 21.0 | 30.2 | 30.8 | 7.7 | **435.2** | 1,779.9 |
| Deleted | membership | 4.7 | 3.0 | 223.8 | 20.2 | 1.3 | 91.6 | 22.4 | 29.5 | 31.4 | 8.0 | **436.2** | 1,851.9 |
| Configuration | broad | 2.3 | 163.4 | 540.5 | 398.9 | 338.9 | 89.0 | 98.9 | 30.7 | 86.3 | 20.8 | **1,785.0** | 2,643.7 |

## Attribution of the structural rows

Before-plan stage medians are from the hook optimization results; *unattributed*
there is `total` minus the eight stages, which then included promotion.

**S100 created and deleted, 496 and 472 ms.** Process 18, before check 7, and the
worker round trip 442 and 443 ms, of which session work is 435 and 436 ms. The
compiler stage, 230 and 224 ms, is one incremental update; before it was 623 and
635 ms. Descriptions fell from about 445 to 20 ms, accesses from about 405 to 1 ms
and decide from 117 and 134 to 21 and 22 ms. Link is unchanged at 86 and 92 ms
(from 99 and 115) and is now the second largest stage. Promotion is 31 ms, and
publish 30 ms. About 8 ms stays unattributed.

**S100 configuration, 1,843 ms.** Process 19, before check 7.5, round trip
1,795 ms, of which session work is 1,785 ms. The kept projection removed most of
the inventory: 163 ms, from 1,101 ms. The compiler stage rose from 393 to 541 ms,
consistent with the extra snapshot update of the options fix `76728ac`. The
broad path still re-extracts descriptions (399 ms) and accesses (339 ms), and
decide (99), link (89) and promotion (86) follow. About 21 ms stays unattributed.
The sweep, 285 ms, is outside the hook.

**Reference configuration, 1,246 ms.** Process 23, before check 7, round trip
1,200 ms, session work 1,192 ms. Inventory fell from 207 to 104 ms, the compiler
rose from 376 to 500 ms, and promotion is 416 ms, 98.5% of the time outside the
stages. About 5 ms stays unattributed. The hook fell 626 ms (derived): before
check 164 ms, the update round trip 141 ms (its invocation check 130 ms), and
the sweep wait it no longer includes (before: service 1,679 ms against a round
trip of 1,341 ms).

**Promotion and the reference's unattributed time.** On the reference broad
path before the plan, 470 ms of session time was outside the stages. Promotion
now names 416 ms of 422 ms on the configuration row, and 42.5 of 45.9 ms and 44.8 of
48.2 ms on created and deleted. The roughly 50 ms that iteration 1 could not
attribute in process was relative to the old broad created and deleted revisions,
and no longer occurs: 3 to 5 ms remain on every reference row.

## Estimates against the measurement

### The closure's expected timing fields

| Field | Expected after the plan | Measured |
| --- | --- | --- |
| Before check | narrow and structural rows lose the resolution replay and helper | 6.9 to 7.8 ms in every row, both fixtures |
| Revision path | `membership` for created and deleted; `broad` for configuration | as expected, 20 of 20 per row |
| `invocationCheck` | a few ms on created, deleted and configuration, from about 500 ms on S100 | 0.4 to 0.6 ms |
| `capture.sweep`, created and deleted | 0 | 0 |
| `capture.sweep`, configuration | about 300 to 330 ms, in process | **0 in 40 of 40**; the sweep, 282 and 285 ms, runs after the hook returns |
| Created and deleted compiler | about 170 to 200 ms | reference 177 and 178; S100 **230 and 224** |
| Created and deleted promotion | about 25 to 40 ms | reference **42.5 and 44.8**; S100 30.8 and 31.4 |
| Configuration inventory | about 250 ms reference, 330 ms S100 | 104 and 163 ms |
| Configuration promotion | about 467 ms reference, 83 ms S100 | 416 and 86 ms |
| Still unattributed, reference broad | about 5 ms | 5.0 ms |
| Covered on publication | as before | 0 in every row; before, S100 created, deleted and configuration were 40 of 40 |

`reacquired` is not recorded in the report. The configuration rows' inventory,
104 and 163 ms, is below a fresh acquisition (288 to 334 and 1,152 to 1,272 ms in
process, iteration 6), and a sweep follows every edit; both are consistent with
the kept update reporting `reacquired: false`.

### The plan's estimates

| Plan estimate | Measured | Status |
| --- | --- | --- |
| Iteration 2: about 890 ms per S100 created or deleted hook, about 880 ms on configuration | before check plus invocation check: 1,092 to 7.8 ms (created), 1,082 to 8.0 ms (deleted), 1,085 to 7.9 ms (configuration), derived | met, exceeded |
| Iterations 3 and 4: about 1,200 to 1,400 ms on S100 created and deleted | session work 1,780 to 435 ms (−1,345) and 1,852 to 436 ms (−1,416) | met |
| Iteration 5: about 260 ms on the S100 configuration row | the hook includes no sweep, because its update precedes the watcher's batch, not because of iteration 5's skip; the options-only edit still sweeps, 285 ms, after the hook | saving present in the hook, **not from iteration 5** |
| Iteration 6: about 700 ms on the S100 configuration row | session work 2,644 to 1,785 ms (−859): inventory −938, compiler +148 | met |
| After the plan: created and deleted about 400 to 700 ms | S100 496 and 472 ms | met |
| After the plan: configuration about 1,800 ms | S100 1,843 ms, p90 2,044 ms | met at the median; the closure had judged it not supported. The sweep is outside the hook and the replay saving exceeded its estimate |
| Hypothesis 4: promotion names at least four fifths of the reference time outside the stages | 98.5% on configuration, 93% on created | met in real processes |

### The reference configuration regression

Iteration 6 measured the reference capture about 225 ms slower in process: a
kept update plus the sweep that runs again (1,870 ms) against a reacquiring
update that skips it (1,643 ms). **It does not appear in the hook.** The row fell
from 1,872 to 1,246 ms, and its p90 from 2,119 to 1,297 ms. The hook's update
round trip is 1,200 ms against 1,341 ms before. The sweep that runs again,
282 ms, and a second `broad` update from the watcher, 116 ms, follow the hook's
reply, about 400 ms of daemon work after each configuration edit (derived). No
reacquiring build was measured, so the kept path's net cost against
reacquisition in real processes is not isolated.

**For review decision 3 and the small-project option.** The reference row is
754 ms under the budget and excludes the sweep. The helper spawn lies inside
inventory, 104 and 163 ms, which bounds its saving on the hook (derived). On
this evidence neither change has a hook-latency case at these fixture sizes. The
sweep's cost lands on the next edit within about 400 to 500 ms, which this workload
does not measure.

## Harness differences

- The measured harness expects `membership` for created and deleted rows, and
  its resolution-narrowing deferral reads membership revisions. Those two lines
  of `fast-assertions.mjs`, its evidence test, `resident-reuse.mjs` and the
  README are the only measurement changes since `4981ed5`. Budgets, cycle counts, fixtures and every
  other predicate are identical.
- No harness change was made in this session. Per-cycle tables, contention
  classification and the worker operation sequences were computed from the raw
  reports outside the repositories.

## Anomalies

1. **The configuration sweep is never in the hook.** The closure expected
   `capture.sweep` of about 300 to 330 ms; it is 0 in all 40 captures. The
   configuration-only sweep runs after the watcher's update, after the hook
   returns, as the closure's remaining gap on the sweep skip describes. A hook that
   reaches the daemon after the watcher's flush, from a slower client or a later
   launch, would take the path the pre-plan row measured. That case is not
   measured.
2. **The watcher's second update on a configuration edit is not cheap.** It is a
   `broad` update of 116 ms on the reference and 172 ms on S100, beside the
   12 to 26 ms second update of every other row. It publishes no revision.
3. **S100 configuration tail.** With no contended cycle (lowest idle 76%), 2 of
   20 cycles exceed 2 s (2,044 and 2,063 ms), so the p90 is over the budget.
4. **Client process time of zero-work and published hooks rose** from 25 to 36
   and 37 ms (hook minus CLI `totalMs`), while the hooks themselves fell and bare
   Node fell from 45 to 24 ms. Racing rows show 17 to 31 ms, as before. Not
   investigated.
5. **S100 membership compiler stage** is 224 to 230 ms, above the in-process
   estimate of 170 to 200 ms; reference promotion on created and deleted is 42.5
   and 44.8 ms, above 25 to 40 ms.
6. **Ideal misses,** advisory: body session work 35.7 against 25 ms (reference)
   and 84.2 against 60 ms (S100); reference configuration session work 1,191.5
   against 1,000 ms. The S100 created, deleted and configuration ideal targets
   (1,500, 1,500 and 2,500 ms) are met.
7. **Expected failures.** Alternate description cycles remove an exposure and
   exit 1 with their independently expected denial, as before.

No correctness predicate failed. No source or harness file was changed. The
optimization analysis's figures and remaining targets, which the recipe's last
step updates, are not changed by this document.

## Memory

Not measured: no plateau or footprint workload ran. The per-cycle retention and
cleanup predicates passed on both runs, and no measured process remained after
them.

## Recommended next targets

1. **S100 configuration edits,** the only row near the budget (1,843 ms, p90
   2,044 ms). An options-only edit still takes the broad path: compiler 541 ms,
   including the options fix's second snapshot update, descriptions 399 ms,
   accesses 339 ms, decide 99, link 89 and promotion 86 ms. Attribute the compiler
   stage between its two snapshot updates, and evaluate whether a kept
   projection needs the whole description and access re-extraction.
2. **Daemon work after a configuration hook:** the watcher's `broad` second
   update (116 and 172 ms) and the sweep (282 and 285 ms). Let the hook's update
   satisfy the pending batch (target 6), and pursue the deferred sweep step that
   re-hashes only moved files. Measure a configuration hook launched after the
   watcher's flush and an edit that follows within 500 ms.
3. **Membership path on S100,** 435 ms: compiler 224 to 230, link 86 to 92,
   promotion 31, publish 30, decide 21 to 22 ms.
4. **Proportional relink:** link is 92 of 184 ms on an S100 source edit, 85 of
   129 ms on a description edit, and about 90 ms on every S100 structural row.
   Measure at S500 and S1000 first.
5. **The S100 publish stage,** about 30 ms on every revision, is a third of body
   session work (84 ms).
6. **Review decisions:** decision 3 (helper spawn) and iteration 6's
   small-project option have no hook-latency case on these fixtures; see
   [the reference configuration regression](#the-reference-configuration-regression).
7. **Remaining measurements:** S500, S1000, macOS and memory; a selection-changing
   configuration edit, which spawns the helper twice; a configuration with
   `references`, which keeps the full replay; and a hook launched after the
   watcher's flush.
8. **Harness:** record `reacquired` per revision, add `promotion` and `sweep` to
   the reply session-work fields, and record the post-hook sweep per cycle.
