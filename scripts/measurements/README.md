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

The [scope budgets](../../docs/plans/iteration-1-project-verifier/scope.md)
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
