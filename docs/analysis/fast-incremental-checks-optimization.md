# Fast incremental checks: optimization targets

**Date:** 2026-09-13. **Status:** analysis for planning, revised after the
[contract remediation](../plans/iteration-5-contract-remediation/main-plan.md)
landed in `85be06c` and after review decisions on this analysis. It locates
where warm revision and hook time goes in the retained session that
[Plan 5](../plans/iteration-5-fast-incremental-checks/closure.md) delivered and
ranks the work that would reduce it. It establishes no implemented capability.
Measured figures are labelled as measured; savings and end-to-end projections
are estimates derived from them.

## Priorities

The agent's post-write hook, `ramify check --changed <path>`, is the primary use
case. It is optimized for two things: latency, and the space its reply takes in
the agent's context.

| Budget | Kind | Value | Judged on |
| --- | --- | --- | --- |
| Hook end to end, every edit class and fixture size | acceptable time | 2 s | median of the measured cycles |
| Per-class session work and hook targets from Plan 5 | ideal optimization | as Plan 5 records them | median |

Both kinds follow [Two kinds of budget](../architecture/memory-lifecycle.md#two-kinds-of-budget).
The 2 s budget equals the hook's default request deadline
([changed-command.ts:116](../../subs/cli/src/changed-command.ts#L116)): a hook
that exceeds it in normal use replies `deadline-exceeded` instead of a result.
The measurement harness passes `--deadline 600000`, so the figures below show
the full time instead.

A hook usually races the watcher's update for the same write. Its measured
medians against the 2 s budget, from the archive described below:

| Edit | Reference | S100 |
| --- | ---: | ---: |
| Body | 1,381 ms | 2,003 ms |
| Source | 1,409 ms | 2,110 ms |
| Description | 1,404 ms | 2,065 ms |
| README | 1,362 ms | 1,962 ms |
| Created | 2,194 ms | 3,614 ms |
| Deleted | 2,697 ms | 5,334 ms |
| Configuration | 3,262 ms | 5,503 ms |

Nine of fourteen rows exceed the acceptable-time budget. Targets 1 to 4 below
address the fixed costs every row pays; the deleted rows also carry a separate
defect, see [Deleted files](#deleted-files).

## Summary

Path selection works. The `unchanged-surface`, `source`, `description` and
`metadata` paths skip the compiler, description and access work they are meant
to skip: on S100, description and access extraction cost 22 ms for a body edit
and about 730 ms for a broad revision. The flat floor of 523 to 574 ms on the
reference comes from work that runs on every revision whatever its path:

1. **The observed-input list is rebuilt seven times per revision.** Every
   access to the observer's `inputs` re-hashes every observation, relabels it
   and sorts the list with a comparator that allocates two buffers per
   comparison. On the reference that is about 48 ms per rebuild.
2. **Publication builds, walks and deep-copies the complete report, then keeps
   five of its fields.** About 100 ms on the reference and 550 to 590 ms on
   S100.

Together they are about 90% of warm session work on both fixtures. A hook
additionally pays project-root resolution, which spawns a helper process on
every context open and again on every update, a redundant second update when
it races the watcher, and about 200 ms of watcher batching and debounce.

With the first four ranked targets and the build-key cache, a warm
unchanged-surface revision is estimated at 50 to 80 ms on the reference and
about 100 ms on S100, an already-published hook at 60 to 70 ms, and a racing
hook at about 300 ms.

## Evidence and method

- **Archive.** Per-stage `revision.timings`, worker message records and hook
  durations from the 13:27 run of Plan 5 iteration 12 on 2026-09-12, medians of
  twenty cycles, Linux x64, Node v22.23.2, build `ed91c6d`. The run and its
  identity are recorded in
  [iteration 12 results](../plans/iteration-5-fast-incremental-checks/iterations/iteration12-results.md).
- **In-process reproduction.** A private export of `1d1d7b5`, built outside the
  checkout, ran the session engine with instrumentation, stack capture and a
  CPU profile on a quiet host. It reproduced the archive within about 10%:
  reference body 476 to 515 ms against 540 measured, S100 body 813 to 877 ms
  against 904, zero-work client 201 ms against 206. The two builds differ only
  in observer and capture retirement logic and one-line changes to
  `session-revision.ts`, `retained-source-analysis.ts` and `changed-command.ts`.
- **Client phases.** Six runs per phase against a warm scratch daemon on a
  private endpoint, stopped afterwards; module loading verified with an ESM
  load hook.
- No test suite, measurement recipe or reference gate ran. The scratch scripts
  were not retained in the repository.
- **Later source.** Every measurement predates `85be06c`, which changed sweep
  scheduling, covering during periodic sweeps and cancellation. Source links
  below point at `85be06c`.

`revision.timings.total` is measured inside the session. It contains no
client, transport, invocation-check or daemon publication time; those appear
only in hook end-to-end figures.

## Where session work goes

Medians in milliseconds. *Unattributed* is `total` minus the eight named
stages; the section below attributes it.

### Reference, 15 owners

| Edit | Path | Classify | Inventory | Compiler | Descriptions | Accesses | Link | Decide | Publish | Unattributed | Total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Body | unchanged-surface | 55.4 | 112.3 | 1.8 | 9.3 | 3.3 | 0.7 | 2.4 | 129.9 | 224.0 | 540.2 |
| Source | source | 56.3 | 112.9 | 1.8 | 8.5 | 13.3 | 21.4 | 2.9 | 130.2 | 219.2 | 573.0 |
| Description | description | 63.2 | 114.7 | 0 | 0 | 0 | 19.2 | 12.1 | 130.6 | 218.2 | 567.3 |
| README | metadata | 63.1 | 112.3 | 0 | 0 | 0 | 0 | 0 | 128.5 | 217.8 | 522.8 |
| Deleted | broad | 57.7 | 115.7 | 0.5 | 42.6 | 77.9 | 17.8 | 11.5 | 132.2 | 222.2 | 685.1 |
| Created | broad | 57.2 | 116.1 | 509.6 | 44.1 | 77.9 | 17.9 | 15.3 | 131.3 | 338.1 | 1312.6 |
| Configuration | broad | 59.3 | 632.3 | 349.1 | 44.2 | 80.8 | 18.0 | 12.6 | 131.9 | 337.1 | 1662.4 |

### S100, 100 owners

| Edit | Classify | Inventory | Compiler | Descriptions | Accesses | Link | Decide | Publish | Unattributed | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Body | 28.5 | 58.2 | 5.1 | 21.0 | 1.1 | 5.7 | 8.9 | 661.5 | 110.6 | 904.1 |
| Source | 28.8 | 57.6 | 5.0 | 20.1 | 4.9 | 101.8 | 15.7 | 654.8 | 111.6 | 1006.7 |
| Description | 31.0 | 57.4 | 0 | 0 | 0 | 97.0 | 5.2 | 649.7 | 110.8 | 959.3 |
| README | 28.5 | 58.6 | 0 | 0 | 0 | 0 | 0 | 661.8 | 109.2 | 859.0 |
| Deleted | 30.2 | 61.4 | 7.5 | 390.0 | 340.8 | 98.6 | 95.6 | 702.5 | 126.7 | 1857.7 |
| Created | 29.9 | 61.3 | 500.9 | 406.3 | 339.6 | 97.9 | 95.2 | 712.5 | 181.9 | 2434.5 |
| Configuration | 30.2 | 1142.5 | 323.3 | 402.9 | 334.6 | 96.4 | 99.8 | 666.7 | 182.0 | 3292.7 |

The classify, inventory, publish and unattributed columns are the floor: 422 of
540 ms for a reference body edit and 859 of 904 ms on S100. The reference is
slower than S100 in classify and inventory because it observes more: 3,606
inputs totalling 10.2 MB, including 872 dependency reads such as compiler
libraries and typings and 2,416 absent probes, against 2,367 inputs and 4.0 MB
on S100. S100 is slower overall almost entirely through publication, whose
report is 7.0 MB of JSON against 1.65 MB.

Plan 5's [explicit deferrals](../plans/iteration-5-fast-incremental-checks/scope.md#explicit-deferrals)
quote the broad path at 525 ms on the reference. The tables show that figure was
mostly this floor rather than broad analysis.

## Causes of the per-revision floor

### The observed-input list

The `inputs` getter at
[capture.ts:246-250](../../subs/analysis/subs/project/src/capture.ts#L246-L250)
rebuilds on every access: it maps every observation, hashes its bytes or its
signature JSON, relabels its path and sorts with `byteOrder`, which allocates
two buffers per comparison
([data.ts:5](../../subs/analysis/subs/project/src/data.ts#L5)). `inputId`
repeats the work. Stack capture found seven evaluations in one body revision:

| Caller at `85be06c` | Timed as |
| --- | --- |
| `session-revision.ts:331` and `:332` | inventory |
| `session-revision.ts:349` | classify |
| `session-engine.ts:290` and `:298`, in promotion | unattributed |
| `session-engine.ts:261`, the `inputs` and `inputId` arguments to publication | unattributed |

The worker's `status()` at `session-engine.ts:221` performs an eighth on every
worker reply, about 50 ms on the reference. A revision that finds nothing
changed still performs four, about 190 ms. The call sites are the same for
metadata and description revisions. In a CPU profile of the reference loop the
getter accounts for 67% of samples: hashing about half, the comparator a
quarter and relabelling most of the rest.

### Report materialization on publication

Publication at
[session-engine.ts:383-422](../../subs/analysis/src/session-engine.ts#L383-L422)
calls `draftReport(...).finish()`. `finish()` walks the whole report twice to
measure it against `maxReportBytes` and hash-conses a deep copy, yet the
revision keeps only `outcome`, `summary`, `diagnostics`, `warnings` and
`coverage`.

| Fixture | `finish()` | `build()` alone | `factBytes` |
| --- | ---: | ---: | ---: |
| Reference | 96 to 110 ms | 0.1 ms | about 5 ms |
| S100 | 552 to 588 ms | 0.5 ms | about 23 ms |

On S100 the deep copy is about 60% of `finish()` and the size walks about 40%.

Almost all of that size is the report's `snapshot`, not its findings. The
problem lists (`diagnostics`, `warnings`, `coverage`) are small and usually
empty. The snapshot carries the inventory, source areas, every captured input,
the catalog of originals, the linked descriptions, the model, every access and
one result per access, including every allowed decision. Its consumers are:

- `--format json`, which writes the whole `ramify.analysis/1` document and
  applies its own size limit
  ([format.ts:21-50](../../subs/cli/src/format.ts#L21-L50));
- the summary counts, which are cheap and need no size walk or copy;
- Plan 3's planned `inspect` and `available` queries, and later visualization.

The hook reply, the human report and the daemon never read it. The session does
not retain the published report either: each version keeps the facts a report
is built from
([session-engine.ts:417](../../subs/analysis/src/session-engine.ts#L417)),
bounded by `maxRetainedFactBytes`, so a full report can be built from them on
request.

### Smaller fixed costs

- The daemon's `createFingerprints` sorts with `JSON.stringify` inside the
  comparator
  ([tokens.ts:28](../../subs/daemon/subs/contexts/src/tokens.ts#L28), called at
  [context-manager.ts:282](../../subs/daemon/subs/contexts/src/context-manager.ts#L282)):
  16 ms on the reference, 9 ms on S100.
- Structured clone of a revision across the worker boundary: about 3 ms. The
  reference revision's JSON is 563 KB, mostly the inputs list.
- On macOS, every worker message spawns `/bin/ps` to sample RSS
  ([session-processes.ts:57](../../subs/analysis/src/session-processes.ts#L57)).
  Linux is unaffected and no macOS figure exists; see target 7.

## Hook latency beyond session work

### Project-root resolution

The daemon resolves the project on every `openContext`
([context-manager.ts:503](../../subs/daemon/subs/contexts/src/context-manager.ts#L503)),
which reads the compiler configuration through a spawned helper process. The
worker resolves again on every update that carries an invocation
([session-engine.ts:127-131](../../subs/analysis/src/session-engine.ts#L127-L131)),
and the context manager always passes one
([context-manager.ts:354](../../subs/daemon/subs/contexts/src/context-manager.ts#L354)).
That check runs before the session's timer starts, so it never appears in
`total`.

Measured configuration reading takes 110 to 120 ms on the reference and 323 to
339 ms on S100. A bare helper, Node plus the TypeScript synchronous API, takes
73 ms; the remainder is one synchronous request per filesystem callback, 161 on
the reference and 1,811 on S100.

### Racing hooks run a second update

A reference body hook that races the watcher, 1,381 ms:

| Step | ms |
| --- | ---: |
| Watcher batching and debounce | 200 |
| The watcher's update | 725 |
| Revision release round trip | 53 |
| The hook's own update, which finds the same revision | 413 |

The hook reaches `check` while the watcher's update runs. The covering test
([context-manager.ts:432-438](../../subs/daemon/subs/contexts/src/context-manager.ts#L432-L438))
is evaluated when the request arrives. Since `85be06c` it tolerates a running
periodic sweep, but not a running update, so the request queues its paths and a
second update follows. On S100 that update costs 489 ms, in every edit class.
In the archive every racing cycle of every edit class ran exactly two updates,
except one reference description cycle.

The watcher's 200 ms is a 100 ms batching window
([filesystem-watcher.ts:8](../../subs/daemon/src/filesystem-watcher.ts#L8))
and a 100 ms debounce
([resident-budgets.ts:11](../../src/resident-budgets.ts#L11)), plus event
delivery; the split among them is not measured.

### Due sweeps before delivery

In the measured build a sweep that had come due ran before the waiting request
was answered, adding 320 to 390 ms: all twenty configuration cycles and one to
four of twenty in the other classes. Since `85be06c` a periodic sweep runs only
when no request is waiting and never makes a covered request wait. A request
that needs a sweep, a report request or a check with no expected files, still
waits for one, as does every required-sweep trigger. The remaining limits are
recorded in the remediation's
[iteration 1 results](../plans/iteration-5-contract-remediation/iterations/iteration1-results.md#deviations-and-limits).
The configuration cycles' sweep is required and remains.

### Deleted files

A deleted-file hook runs two broad revisions: the watcher's, 1,461 to 1,698 ms
worker round trip on the reference and 2,725 to 3,009 ms on S100, then the
hook's, 848 to 1,113 ms and 2,150 to 2,464 ms. In all forty delete cycles the second update
publishes a new revision sequence with the same input identity as the first;
in every other edit class the hook's second update reuses the published
revision. A repeated deletion is not recognized as identical. The measured
deleted session-work row is the second revision. The
[repeated deletion plan](../plans/iteration-5-repeated-deletions/main-plan.md)
investigates and repairs it.

## Client cost

The `./cli` and `./client` closures are clean. A real `check --changed` loads 20
project modules and 10 Node built-ins, and no analysis, session, worker or
compiler module.

| Phase, warm daemon | Reference ms | S100 ms |
| --- | ---: | ---: |
| Node bootstrap to script start | about 21 | about 21 |
| Import the CLI closure | about 16 | about 16 |
| Endpoint selection: read and SHA-256 every runtime file to derive the build key ([discovery.ts:46-59](../../subs/daemon/src/discovery.ts#L46-L59)) | 26 to 34 | 23 to 30 |
| Read the record, connect, handshake | about 4 | about 4 |
| `openContext`, dominated by daemon-side root resolution | 106 to 114 | 324 to 375 |
| Hash the changed file, `check` on the covering path, close | about 3 | about 3 |
| Total in process, and spawned end to end | about 184, 201 | about 420, 422 |

Bare Node measured 25.8 ms on the same host. Of the roughly 175 ms above it on
the reference, root resolution is about 63% and build-key hashing about 17%.

## Ranked targets

Savings are estimates from the measured components. Timing fields come first,
because targets 3, 4 and 6 cannot be verified without them.

| Rank | Target | Owner | Estimated saving, reference and S100 | Kind | Depends on |
| ---: | --- | --- | --- | --- | --- |
| 0 | Timing fields for work outside `total` and watcher timestamps | `analysis`, `daemon/contexts`, `daemon` | none; replaces inference | cheap | none |
| 1 | Maintain the observed-input list instead of rebuilding it | `analysis/project`; callers in `analysis` | 290 to 340 and 160 to 185 ms per revision; 50 and 27 ms per worker reply | cheap steps, then a small design change | none |
| 2 | Build only what a hook publishes | `analysis` | 60 and 345 ms from skipping the copy; 95 and 555 ms fully | cheap step, then a contract clarification | none |
| 3 | Reuse project-root resolution for a known context | `analysis/project`, `analysis`, `daemon/contexts` | 110 and 330 ms per invocation; 120 and 330 ms per update | design change | 0 |
| 4 | Answer a queued racing hook from the revision that just published | `daemon/contexts` | 413 and 489 ms per racing hook today; 60 to 100 ms after 1 to 3 | contract clarification | 0; best after 1 to 3 |
| 5 | Cache the client build key | `daemon` discovery, build scripts | 25 to 30 ms per invocation | cheap | none |
| 6 | Shorten the watcher's path to a hook's analysis | `daemon` | up to 130 ms per racing hook | design change | 0, 3 and 5 |
| 7 | Sample worker RSS without a process per message on macOS | `analysis` | unmeasured; one process spawn per worker message | cheap | none |

### 0. Timing fields

Add timing fields beside the existing stage timings for the worker's invocation
check, worker `status`, worker and client transport and daemon publication,
carried through the revision and reply timings. Add two watcher timestamps:
event receipt and batch flush. Every later measurement then shows the split
directly instead of by subtraction.

### 1. The observed-input list

Record each observation's hash, label and byte size when it is read or
mutated, and cache the sorted list and `inputId` behind a version counter.
Independently, replace `byteOrder` with an equivalent non-allocating
comparator. Risk is moderate: every mutation must advance the version,
including in-place role and byte changes, exact-name probes, forgetting,
refreshing and reported observations, and the order feeds `inputId`, so it must
remain byte-identical. The comparator and hash-once steps are safe first steps.

The cache's only memory requirement is that it does not leak: an entry leaves
with its observation, and a forgotten observation leaves no cached state. No
separate memory measurement is required.

A later step may let a sweep re-hash only observations whose size or
modification time moved, reusing the recorded hashes; a sweep currently
re-hashes every file, about 260 to 280 ms on the reference.

### 2. Build only what a hook publishes

Decided. Publication builds only what the revision keeps: `outcome`, `summary`
and the three problem lists, and applies the report-size limit to those. The
full report, with its snapshot, is built from the retained facts only when it
is requested: `--format json`, batch, and later `inspect`. Its size limit
applies where it is produced, so every output that includes the snapshot is
unchanged.

The contract clarification: a hook's check can pass while a full report for the
same revision would exceed `maxReportBytes`. The limit protects whoever
receives the full report, and that receiver still gets the resource-limit
failure.

The first step, omitting the deep copy, changes no behavior.

### 3. Root resolution

Skip the invocation check when the invocation equals the session's, and reuse a
known context's resolution, validated against the configuration dependencies
the observer already holds; configuration acquisition already has a
replay-and-reuse path. The risk is a stale root when discovery inputs change;
configuration edits already take the structural path.

### 4. Racing hooks

Decided. The covering rule is evaluated when a request arrives and again when
each revision publishes. A queued request whose expectations the new revision
covers, with no other known change or required sweep pending, is answered from
that revision without another update. The plan that implements this target
writes that sentence into the covering rule of
[daemon and analysis](../architecture/daemon.md). The harness attribution from
`85be06c` distinguishes a covered answer from an analysed one.

Attaching a request to the running update on arrival was rejected: it is harder
to keep exact when the request's expectations differ from what that update
analyses.

### 5. Build key

Precompute the runtime identity at build time or cache it by file signature. It
must still detect a mixed build.

**Delivered** by [hook optimization iteration 6](../plans/iteration-5-hook-optimization/iterations/iteration6-results.md).
The build writes the runtime identity, and selection reads it, checking file
paths, sizes and modification times. The compiled client refuses a build
whose identity differs from its embedded one. See
[build binding](../architecture/optimization.md#build-binding) for the identity
file and the mixed builds the check misses.

### 6. Watcher latency

After targets 3 and 5, the client reaches `check` in about 60 to 70 ms, before
the watcher's batch flushes, so a request-triggered update could start sooner.
The watcher's later duplicate event must stay cheap, which targets 1 and 3
provide. Batching and debounce values change only after target 0's timestamps
show the split.

### 7. macOS process sampling

Sample the worker's RSS on an interval, or only when a limit check needs it,
instead of spawning `/bin/ps` for every worker message. A process per message
is a cost on every revision and reply without a measurement to justify it.

### Smaller items

The fingerprint comparator (16 and 9 ms), `factBytes` (5 and 23 ms), and a
Node compile cache or bundling (speculative, 5 to 10 ms).

### Resolved elsewhere

Running a due periodic sweep after delivery, previously target 7, was delivered
by the contract remediation in `85be06c`; see
[Due sweeps before delivery](#due-sweeps-before-delivery).

## Projection

Estimates, assuming targets 1 to 5:

| Workload | Measured reference | Estimated reference | Measured S100 | Estimated S100 |
| --- | ---: | ---: | ---: | ---: |
| Unchanged-surface session work | 540 ms | 50 to 80 ms | 904 ms | about 100 ms |
| Hook, watcher already published | 207 ms | 60 to 70 ms | 496 ms | not estimated |
| Hook racing the watcher | 1,392 ms | about 300 ms; about 150 ms with target 6 | 2,006 ms | not estimated |

## Plan 5 deferrals revisited

| Deferral | Verdict | Reason |
| --- | --- | --- |
| Proportional relink | not indicated on the reference | Link is 0.7 to 21 ms there. On S100 narrow paths it is about 100 ms, which becomes 10 to 25% of session work once targets 1 to 3 land; revisit with S500 and S1000. |
| Resolution-bounded narrowing | indicated for created and deleted files | About 1.4 s of broad analysis on S100 created files, on top of the floor; created and deleted racing hooks exceed the 2 s budget on both fixtures. |
| Syntactic pre-filter | not indicated | Access extraction is 1 to 3 ms for body edits. |
| Persistent checkpoints | unrelated to warm latency | Concerns cold opens only. |
| Child-process host | not a latency lever | A supervisor process already hosts the worker thread ([session-supervisor.ts:52](../../subs/analysis/src/session-supervisor.ts#L52)); clone cost is about 3 ms. |

## Measurement sequencing

- Target 0 lands before any target it verifies.
- Each target is measured on the reference and S100 with focused runs of the
  workloads it affects.
- S500, S1000 and macOS are measured once, after the optimization plan
  completes, against the 2 s acceptable-time budget.
- No batch-check baseline is required: the acceptable-time budget is set by the
  use case.

## Open questions

- How much of the agent's context a hook reply occupies: the length of a
  passing reply and the wording and size of a failing one. This is to be
  examined against the priority above, not measured for latency.
- The cause of the repeated deletion revision, owned by its
  [plan](../plans/iteration-5-repeated-deletions/main-plan.md).
- The remaining covering limits after `85be06c`: a running idle audit still
  refuses coverage, and a covered request can be refused between the session
  advancing and the context publishing. Target 4 must account for the second.
