# Batch measurements

These independent tools measure the compiled batch checker and its public
analysis session. They do not load the toolkit through `tsx` during a measured
check. The setup probe, cold processes and repeated workload produce separate
evidence; none establishes daemon, MCP, web, history, queue or lease behavior.

Prepare the package and the reference dependencies, then build:

```sh
npm ci
npm run worktree:prepare
npm run build
node scripts/measurements/run.mjs --output scripts/measurements/results/batch.json
```

The command requires Linux or macOS and POSIX `ps`. Run it while other builds,
matrix executions and measurements are idle. Its output identifies the exact
build, recipe files, dependency versions and fixture bytes. A failure persists
its observed samples and exits 1, including interrupted or malformed subprocess
output. Interrupts and timeouts terminate the owned parent and observed helper
process groups; fixture cleanup runs even if report persistence fails.
Budgets and workloads cannot be silently
reduced through command arguments. The optional `--phase setup|cold|repeated`
and `--workload reference|hundred-owners` select partial evidence explicitly.
Partial reports do not claim that the omitted phases ran.

The synthetic input is materialized from the reviewed
[hundred-owner generator](../probes/fixtures/hundred-owners.ts), with its frozen
content-map SHA-256 asserted before use. It contains 100 owners, 1,100
TypeScript files, 100 CSS resources, 100 nested test areas and nine separately
testing-classified owners. Source bytes and configuration are unchanged from
the iteration-1 fixture. Each measurement owns a unique ignored temporary
directory and removes only that directory. The reference is read unchanged;
its authored content identity is checked again after measurement.

The [scope budgets](../../docs/plans/done/iteration-1-project-verifier/scope.md)
remain the authority:

| Measurement | Reference | 100 owners |
| --- | ---: | ---: |
| Median of five cold compiled CLI checks | 5 seconds | 15 seconds |
| Peak combined parent/helper/native compiler RSS | 512 MiB | 768 MiB |
| Repeated create/check/dispose | 5 warmups + 25 retained reports | 5 warmups + 25 retained reports |
| Last 20 settled samples: heap growth minus retained serialized report bytes | 16 MiB | 16 MiB |
| Last 20 settled samples: RSS growth | 64 MiB | 64 MiB |
| Disposal | 5 seconds | 5 seconds |

Cold latency includes fresh Node process startup and complete JSON output
drain. OS caches are not flushed. POSIX `ps` observes the process tree at a
50 ms target interval, including helper and native compiler descendants.
Raw samples retain elapsed times, per-process RSS and summed RSS; the report
also retains each process's sampled maximum. Shared mappings count more than
once in the sum. Peaks shorter than the interval can be missed, and delayed
samples remain visible. The observer is outside the measured process tree.

The repeated worker uses a fresh process per workload and imports
`ramify.ts/analysis` and `ramify.ts/model` through their installed package
surfaces. Each cycle creates one real session, checks the whole project,
validates the completed result, inspects every report property/prototype for
frozen plain data, and disposes the session. All 25 measured reports remain
reachable; their actual serialized byte count is retained beside every sample.
Two explicit GC calls separated by event-loop turns produce each settled
measurement. GC is a diagnostic method, not production resource management.

Instrumentation observes actual file opens/closes, child starts/exits and
analysis timer creation/destruction without replacing the engine, compiler or
input view. Every cycle checks zero active sessions, zero reachable disposed
sessions through `WeakRef`, zero open captured-input handles, zero helper or
native descendants and zero analysis timers. Report inspection catches hidden
session/compiler references as well as non-JSON objects. Per-cycle samples
include RSS, heap, external bytes and array-buffer bytes. Array-buffer bytes
are included in external bytes; do not add them twice. Strict monotonic heap
or RSS growth is recorded for investigation even below the numeric budget.
It does not add an unreviewed numeric threshold or silently waive one.

The [results summary](results/README.md) records final outcomes and investigates
the retained-report RSS growth. The [measurement archive](results/index.json) identifies each lossless
raw JSON payload, its SHA-256, the gzip bytes' SHA-256 and the measured build.
Gzip streams use level 9 and timestamp zero. Inspect one with:

```sh
gzip -dc scripts/measurements/results/baseline-cold.json.gz
```

Initial failures remain in the archive beside later samples. The intermediate
`buffer-fix-cold-nonquiet` run explicitly records concurrent verification and
does not establish performance acceptance. The interrupted-recorder sample is
an independently expected operational failure, with captured memory samples,
an explicit parse failure and zero observed processes after exit.

Run the checked-in real-session setup fixture directly through the existing
probe if only ready/disposed samples are wanted:

```sh
node scripts/memory-probe.mjs --samples 3 --setup scripts/measurements/session-setup.mjs
```

Readiness means the real analysis completed with its session and plain report
still retained by the fixture. The analysis currently releases its compiler
and captured view before returning that report, so this is the completed batch
state. Disposal releases the session/report references; imported code remains
cached until process exit. The fixture defaults to Collection Review; the
orchestrator sets `RAMIFY_MEASUREMENT_ROOT` and `RAMIFY_MEASUREMENT_OWNERS` for
the synthetic run. The existing probe keeps its three fresh processes, 100 ms
settling delays, two GC calls and 30-second per-sample timeout. Its setup and
post-disposal values do not establish peak or repeated-use memory limits.

## Synthetic fixtures for resident work

The parameterized [generator](../probes/fixtures/synthetic-owners.ts) materializes
S100, S500 and S1000. The original hundred-owner map remains frozen; a test
compares every S100 path and byte against it and the original content hash.
Each owner contributes eleven TypeScript files (including one nested test), one
CSS resource, its declaration and README. Every tenth non-root owner is tagged
`testing`; root remains `dispatch`.

```sh
mkdir -p .reference-work
npx tsx scripts/measurements/materialize.ts .reference-work/S100 S100
npx tsx scripts/measurements/materialize.ts .reference-work/S500 S500
npx tsx scripts/measurements/materialize.ts .reference-work/S1000 S1000
```

Supply a new destination under ignored scratch space; the command refuses an
existing directory and prints the owner count, file count, bytes and content-map
SHA-256. Omitted fixture selection preserves the S100 default used by batch
measurements. Callers own cleanup. Generated trees are never checked in, and
materialization alone establishes no performance or resident acceptance result.

`materialize.ts` also exports `materializeSynthetic(newDirectory, fixture)` with
the same no-overwrite rule, default and metadata. Importing it performs no writes.
Iteration 11's materialized edit oracle is in
[`equivalence-sequences.ts`](../reference-harness/equivalence-sequences.ts): use
`prepareSequence` for its explicit consumer setup, then `applySequenceStep` for
each recorded edit. These edits apply to a private copy, never to generator bytes
or a fixture used concurrently by another measurement.

The iteration 13 resident command below records their identities using this same
generator.

## Resident measurement checkpoint

```sh
npm run build
npm run measure:resident
```

This build has no resident service, context manager, connector or daemon entry.
`measure:resident` therefore exits **1**: it is an incomplete measurement
checkpoint, not the completed Plan 2 recipe. It audits the required compiled
entries, materializes the existing S100/S500/S1000 generators for content
identities, records dependency versions and hashes the build, scripts, manifests
and binding scope. Three fresh compiled CLI help processes supply actual RSS
samples through the shared batch process observer at a 50 ms target interval.
Each has its own endpoint directory, which must remain empty. The help row has
no numeric budget and cannot pass the full `entry-footprints` instance.

The command writes raw JSON under `.reference-work/reports/` (or `--output FILE`)
and lossless gzip beside the batch archives, appending a record to `results/index.json`.
The index's existing version and records are preserved; `phase: resident` and
`payloadSchema: ramify.resident-measurements/1` distinguish these new records.
The archive lock rejects concurrent index writers, and rename publishes a complete
index. A stale lock is not automatically removed. Final persistence attempts the
raw file and archive independently: an unwritable raw path is recorded in the
archive; an archive failure is recorded in the raw file. If both fail, the command
reports both errors. Its summary uses null for any unavailable output destination.
Cleanup precedes persistence. No resident command or implicit batch
check is timed while these prerequisites are missing.

`resident-plan.mjs` records all nine required I2-29 workloads, exact cycle counts
and the unchanged iteration-1 targets. Their measurements remain `null` with
`not-executed` status; the compiler-state trigger remains `not-evaluated`.
Restoring the prerequisites does **not** automatically enable this checkpoint:
the real workload driver, instrumented daemon counters, budget assertions and
`resident-measure` harness handlers still need implementation against those
providers. In particular, help measurements cannot establish daemon memory,
stage reuse, a plateau, slow-consumer behavior, or large-fixture performance.

The remaining recipe must drive five cold starts and twenty cycles of every edit
class on the reference and S100; 200 alternating edits on each; eight warm S100
contexts; a non-reading subscriber over ten S100 publications; cold/source cycles
on S500 and S1000; and publication/serialization peaks. It must read heap,
external, history, products and lifecycle counters from the separately
instrumented real daemon and stop every daemon in finally. No workload receives
credit until all its independent expectations and binding budgets pass.

`node scripts/measurements/verify-tooling.mjs` runs bounded direct controls for
the shared observer, helper cleanup, timeout, interruption, spawn failure,
lossless archive hashes, index preservation/locking, independent output failures,
and absent prerequisites.
The reference-harness test invokes these same controls. They are tooling
verification, with no resident matrix credit. Run measurements without concurrent
builds or matrix execution before using performance values for acceptance.
