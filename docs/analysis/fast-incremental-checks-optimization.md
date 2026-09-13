# Fast incremental checks: optimization targets

**Date:** 2026-09-13. **Status:** analysis for planning. It locates where warm
revision and hook time goes in the retained session that
[Plan 5](../plans/iteration-5-fast-incremental-checks/closure.md) delivered and
ranks the work that would reduce it. It establishes no implemented capability.
Measured figures are labelled as measured; savings and end-to-end projections
are estimates derived from them.

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

- **Archive.** Per-stage `revision.timings` from the 13:27 run of Plan 5
  iteration 12 on 2026-09-12, medians of twenty cycles, Linux x64, Node
  v22.23.2, build `ed91c6d`. The run and its identity are recorded in
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

| Caller | Timed as |
| --- | --- |
| `session-revision.ts:328` and `:329` | inventory |
| `session-revision.ts:345` | classify |
| `session-engine.ts:273` and `:281`, in promotion | unattributed |
| `session-engine.ts:258`, the `inputs` and `inputId` arguments to publication | unattributed |

The worker's `status()` at `session-engine.ts:218` performs an eighth on every
worker reply, about 50 ms on the reference. A revision that finds nothing
changed still performs four, about 190 ms. The call sites are the same for
metadata and description revisions. In a CPU profile of the reference loop the
getter accounts for 67% of samples: hashing about half, the comparator a
quarter and relabelling most of the rest.

### Report materialization on publication

Publication at
[session-engine.ts:370-399](../../subs/analysis/src/session-engine.ts#L370-L399)
calls `draftReport(...).finish()`. `finish()` walks the whole report twice to
measure it and hash-conses a deep copy, yet the revision keeps only `outcome`,
`summary`, `diagnostics`, `warnings` and `coverage`.

| Fixture | `finish()` | `build()` alone | `factBytes` |
| --- | ---: | ---: | ---: |
| Reference | 96 to 110 ms | 0.1 ms | about 5 ms |
| S100 | 552 to 588 ms | 0.5 ms | about 23 ms |

On S100 the deep copy is about 60% of `finish()` and the size walks about 40%.

### Smaller fixed costs

- The daemon's `createFingerprints` sorts with `JSON.stringify` inside the
  comparator: 16 ms on the reference, 9 ms on S100.
- Structured clone of a revision across the worker boundary: about 3 ms. The
  reference revision's JSON is 563 KB, mostly the inputs list.
- On macOS, every worker message spawns `ps` to sample RSS. Linux is unaffected.

## Hook latency beyond session work

### Project-root resolution

The daemon resolves the project on every `openContext`
([context-manager.ts:488](../../subs/daemon/subs/contexts/src/context-manager.ts#L488)),
which reads the compiler configuration through a spawned helper process. The
worker resolves again on every update that carries an invocation
([session-engine.ts:127-131](../../subs/analysis/src/session-engine.ts#L127-L131)),
and the context manager always passes one. That check runs before the session's
timer starts, so it never appears in `total`.

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

The hook reaches `check` while the watcher's update runs. The covering test at
[context-manager.ts:464-468](../../subs/daemon/subs/contexts/src/context-manager.ts#L464-L468)
requires nothing to be running, so the request queues its paths and a second
update follows. On S100 that update costs 489 ms, in every edit class.

### Due sweeps before delivery

A sweep that has come due runs before the waiting request is answered, adding
320 to 390 ms to the affected hooks: all twenty configuration cycles and one to
four of twenty in the other classes. This is also the trigger of the covering
violation the [contract remediation](../plans/iteration-5-contract-remediation/main-plan.md)
repairs.

### Deleted files

A deleted-file hook runs two broad revisions: the watcher's, about 1,470 ms,
then the hook's, about 690 ms, which is not identical to the first. The measured
deleted row is the second. Why it is not identical is unexplained.

## Client cost

The `./cli` and `./client` closures are clean. A real `check --changed` loads 20
project modules and 10 Node built-ins, and no analysis, session, worker or
compiler module.

| Phase, warm daemon | Reference ms | S100 ms |
| --- | ---: | ---: |
| Node bootstrap to script start | about 21 | about 21 |
| Import the CLI closure | about 16 | about 16 |
| Endpoint selection: read and SHA-256 every runtime file to derive the build key ([discovery.ts:46-53](../../subs/daemon/src/discovery.ts#L46-L53)) | 26 to 34 | 23 to 30 |
| Read the record, connect, handshake | about 4 | about 4 |
| `openContext`, dominated by daemon-side root resolution | 106 to 114 | 324 to 375 |
| Hash the changed file, `check` on the covering path, close | about 3 | about 3 |
| Total in process, and spawned end to end | about 184, 201 | about 420, 422 |

Bare Node measured 25.8 ms on the same host. Of the roughly 175 ms above it on
the reference, root resolution is about 63% and build-key hashing about 17%.

## Ranked targets

Savings are estimates from the measured components.

| Rank | Target | Owner | Estimated saving, reference and S100 | Kind | Depends on |
| ---: | --- | --- | --- | --- | --- |
| 1 | Maintain the observed-input list instead of rebuilding it | `analysis/project`; callers in `analysis` | 290 to 340 and 160 to 185 ms per revision; 50 and 27 ms per worker reply | cheap steps, then a small design change | none |
| 2 | Stop materializing the full report on publication | `analysis` | 60 and 345 ms from skipping the copy; 95 and 555 ms fully | cheap step, then contract review | none |
| 3 | Reuse project-root resolution for a known context | `analysis/project`, `analysis`, `daemon/contexts` | 110 and 330 ms per invocation; 120 and 330 ms per update | design change | none |
| 4 | Answer a queued racing hook from the revision that just published | `daemon/contexts` | 413 and 489 ms per racing hook today; 60 to 100 ms after 1 to 3 | contract clarification | best after 1 to 3 |
| 5 | Cache the client build key | `daemon` discovery, build scripts | 25 to 30 ms per invocation | cheap | none |
| 6 | Shorten the watcher's path to a hook's analysis | `daemon` | up to 130 ms per racing hook | design change | 3 and 5 |
| 7 | Run a due periodic sweep after delivery | `daemon/contexts` | 320 to 390 ms on affected hooks | contract decision | the remediation's sweep classification |

### 1. The observed-input list

Record each observation's hash, label and byte size when it is read or
mutated, and cache the sorted list and `inputId` behind a version counter.
Independently, replace `byteOrder` with an equivalent non-allocating
comparator. Risk is moderate: every mutation must advance the version,
including in-place role and byte changes, exact-name probes, forgetting,
refreshing and reported observations, and the order feeds `inputId`, so it must
remain byte-identical. The comparator and hash-once steps are safe first steps.

### 2. Report materialization

First step, with no behavioral change: omit the deep copy in the publication
projection. Full step: build the report without `finish()` and replace the
exact size walk with a sound upper bound that proves a report is far below
`maxReportBytes`. The full step moves where the report-size limit is enforced
and needs contract review.

### 3. Root resolution

Skip the invocation check when the invocation equals the session's, and reuse a
known context's resolution, validated against the configuration dependencies
the observer already holds; configuration acquisition already has a
replay-and-reuse path. The risk is a stale root when discovery inputs change;
configuration edits already take the structural path.

### 4. Racing hooks

When a publication's inputs match a queued request's expectations and no other
change is pending, deliver that publication instead of running another update.
Plan 5's covering rule is evaluated at acknowledgment, so this needs its
contract clarified.

### 5. Build key

Precompute the runtime identity at build time or cache it by file signature. It
must still detect a mixed build.

### 6. Watcher latency

After targets 3 and 5, the client reaches `check` in about 60 to 70 ms, before
the watcher's batch flushes, so a request-triggered update could start sooner.
The watcher's later duplicate event must stay cheap, which targets 1 and 3
provide.

### 7. Due sweeps

With periodic sweeps classified as maintenance, as the contract remediation
proposes, a due periodic sweep could run after delivery rather than before.
Required sweeps would still run first.

### Smaller items

The fingerprint comparator (16 and 9 ms), `factBytes` (5 and 23 ms), sweep
re-hashing of every file (about 260 to 280 ms per sweep on the reference), and a
Node compile cache or bundling (speculative, 5 to 10 ms).

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
| Resolution-bounded narrowing | indicated for created and deleted files | About 1.4 s of broad analysis on S100 created files, on top of the floor. |
| Syntactic pre-filter | not indicated | Access extraction is 1 to 3 ms for body edits. |
| Persistent checkpoints | unrelated to warm latency | Concerns cold opens only. |
| Child-process host | not a latency lever | A supervisor process already hosts the worker thread ([session-supervisor.ts:52](../../subs/analysis/src/session-supervisor.ts#L52)); clone cost is about 3 ms. |

## Interaction with the contract remediation

- The description fallback is a cancellation defect, not a description defect;
  faster sweeps narrow its window but do not remove it.
- In the enumerated covering violation, a due sweep was the trigger. Targets 1
  and 3 make the resulting redundant update cheap; target 7 decides whether it
  runs at all.
- The remediation's attribution fix to the harness is a prerequisite for
  measuring any of these targets reliably.

## Toward acceptable-time budgets

[Two kinds of budget](../architecture/memory-lifecycle.md#two-kinds-of-budget)
requires acceptable-time budgets derived from the use case, beside an
irreducible floor. The inputs this analysis provides:

- **Irreducible floor.** Bare Node startup measured 25.8 to 34.2 ms on the
  measurement host. Everything above it in the client is implementation cost.
- **Design aim.** The [original proposal](fast-incremental-checks.md) aimed at
  roughly 300 ms end to end for a one-file edit in a warm context.
- **Missing comparison.** No batch check was measured on the same build, so the
  saving a warm hook offers over the alternative is unknown.

A reasonable derivation sets acceptable-time budgets for the racing hook, the
position an agent actually occupies, from that aim and a batch baseline, and
records targets 1 to 7's estimates as ideal budgets.

## Open questions and missing measurements

- A `check --batch` baseline on the same build for the reference and S100.
- S500 and S1000. The report walk and copy, the inputs list and link all scale
  with project size.
- Timing fields for work outside `total`: the invocation check, worker
  `status`, transport and daemon publication. Adding them would replace
  inference.
- The watcher's 200 ms, split into event delivery, batching and debounce.
- Why a deleted file's second broad revision is not identical to the first.
- macOS figures, including FSEvents delivery and `ps` per worker message.
- The memory cost of maintaining the inputs list, and tail percentiles; every
  figure here is a median.
