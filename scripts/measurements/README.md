# Batch measurements

The user's 2026-09-11 decision makes empirical latency, RSS, heap and
memory-growth targets advisory for current batch and resident measurement
commands and acceptance gates, including inherited Plan 1 comparisons. See the [active scope decision](../../docs/plans/done/iteration-2-resident-verification/scope.md#budgets).
The numbers below remain comparison baselines. Record actual values and target
misses without claiming performance acceptance. Runtime protocol, queue and
retention limits, correctness, resource cleanup and finite harness hang guards
remain enforced. The configured lease, idle and shutdown timers still determine
lifecycle behavior; measured completion delays around those transitions are
advisory. Historical Plan 1 measurements retain their original results.

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
provide the retained numeric baselines:

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
The same advisory policy applies to these growth observations; neither an
advisory result nor successful cleanup establishes that a numeric target was met.

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

Plan 8 adds X100, an exposing variant of S100 with the same owners and paths
(`materialize.ts <new-directory> X100`, or `syntheticOwnerFiles(n, { exposures: true })`).
Every non-root owner exposes its `interfaces/api.ts` by wildcard and its nine
`run<N>` functions by name to parent. Each `run<N>` signature names that file's
`Input` and `Output` and the `Input` of the nearest preceding untagged owner.
The root, the grouping level, re-exposes each tenth owner's contract and every
named `Input` to descendants, aliased with the owner's name. The project passes
the signature-companion rule with complete coverage. The default output stays
byte-identical, and the S100 content-map hash is still asserted.

## Resident measurements

```sh
npm run build
RAMIFY_MEASUREMENT_ACTIVITY='Idle host; no concurrent builds or matrix runs' npm run measure:resident
```

The command executes all nine reviewed I2-29 workloads using the installed CLI,
the compiled production daemon and the frozen fixture generator. Allow roughly
40–60 minutes for the complete recipe; actual duration depends on the host.
`--workload entry-footprints` runs a bounded initial diagnostic; the command
still exits 1 because the other required workloads are unmeasured.

The driver measures five independent cold starts and twenty unchanged, README,
exposure, source and configuration cycles on both the reference and S100; 200
alternating source edits on each; eight warm S100 contexts; a non-reading peer
over ten S100 publications; cold/source checks on S500 and S1000; and publication
and serialization peaks. Revision paths come from the actual retained session replies.
Every check must complete with its independently expected owner, denial and
coverage outcomes. The slow peer also requests real published reports without
reading them, since ten publication headers alone do not fill the 128 MiB queue.

A separate measurement daemon entry observes the production operations through
bounded diagnostic channels and OS resource hooks. It records actual session,
helper, watcher, timer and file lifetimes. Diagnostic settling runs two explicit
GC passes across event-loop turns. Service-side status duration and actual
outbound admission, overflow and socket-close times are recorded separately
from end-to-end CLI timings. A 50 ms external POSIX process sampler follows the
real daemon and helper/native descendants; controller memory is excluded from
acceptance peaks. Sampled peaks can miss shorter spikes, and summed RSS counts
shared mappings repeatedly.

The values in `resident-plan.mjs` retain the numeric iteration-1 baselines.
Empirical latency, RSS, heap and growth misses are advisory under the active
scope decision. Missing samples, workload errors, invalid outcomes, exceeded
runtime queue or retention limits, and leaked resources still fail. Finite
hang guards remain in force. The compiler-state trigger is evaluated and
recorded from actual source-edit medians without turning an advisory miss into
an automatic architecture change. Each workload retains partial raw observations
on failure. Every owned daemon is stopped in finally, and cleanup is verified
before persistence.

Raw JSON is written under `.reference-work/reports/` (or `--output FILE`), with a
lossless gzip archive and a new record in `results/index.json`. Archive hashes,
locking, independent output-failure handling and existing batch records remain
unchanged. Evidence identifies source and build trees, the complete scope,
package manifests, executable recipes, fixture inputs and dependency versions;
the same identities are checked again after the run.

All nine reference-harness handlers consume this single completed run:

```sh
RAMIFY_RESIDENT_MEASUREMENT_REPORT=/absolute/path/resident.json npm run reference:verify -- --plan 2
```

Without the environment variable, handlers select the newest archive for the
exact current inputs. `verify-resident-evidence.mjs I2-29:entry-footprints FILE`
independently recomputes predicates from the raw measurements. The matrix never
starts an hour of timing work concurrently with compiler fixtures. Missing or
stale evidence fails and identifies the required measurement command.

`node scripts/measurements/verify-tooling.mjs` runs bounded process-observer,
cleanup, timeout, interruption, archive-integrity and missing/stale/target-miss
controls. These controls provide no resident matrix credit. Run acceptance
measurements on an otherwise idle host after source, build and scope are frozen.

## Fast hook and retained-session measurements

```sh
npm run worktree:prepare
npm run build
RAMIFY_MEASUREMENT_ACTIVITY='Idle host; no other builds or measurements' npm run measure:fast
```

The Plan 5 recipe materializes fresh reference, S100, S500 and S1000 copies,
installs this checkout's compiled CLI into an owned prefix, and runs the real
socket service and watcher. It preserves the generators and records each edit
setup identity. Each workload has a separate daemon and endpoint under an owned
temporary directory. Normal completion, failures and interruption clean up the
observed process tree. `NODE_OPTIONS` is cleared for measured child processes;
the existing worker supervisor still performs its effective heap preflight.

Each fixture receives twenty alternating body, export, exposure, README and
configuration edits, twenty deleted/created file pairs, and twenty additional
body edits whose watcher revision has published before the hook starts. The
created-file setup adds the owned target and a stable same-owner side-effect
import to the body-edit source before recording its setup identity. Each pair
deletes the target and recreates it, preserving complete coverage for the other
workloads. The import preserves the compiler's observation of the absent target
after deletion; an unreferenced deleted file
would correctly receive `unobserved-input`. Every edit and revert preserves the
import, and created/deleted edits reject a missing witness before changing files.
Only the deleted phase has an absent target and its precise `unresolved-target`
coverage note, with no finding. The first body sequence launches the installed
hook command immediately after each save. Every command is recorded, including
unsuccessful or uncovered replies. A racing hook must be answered from the
revision its save produced. The revision's publication may answer it as one
covered request with zero reply session work, or an update that included it may
answer it with no covered request, as when it reached the daemon before the
watcher's batch. Either way at least one analysis other than a sweep or audit
runs; a covered answer from another revision fails.
Twenty bare Node executions and twenty covered zero-analysis CLI checks record
the process floor and client cost. Requests use a finite 600,000 ms measurement
deadline so work exceeding the normal hook deadline remains measurable and its
duration is recorded against the unchanged timing budgets. Startup, setup, explicit
settling and status polling outside the command are excluded from its duration.
Session timings come from the exact published revision, not elapsed CLI time.

A hook whose watcher revision has already published is judged by the work it
caused. Daemon counters are sampled before the hook, immediately after it
returns and once settled. The hook must be answered from that published
revision with exit code 0 and every changed entry covered, and must add exactly
one covered request before it returns. In both intervals every added analysis
must be a sweep or an audit, which the daemon counts in `sweeps` and `audits` as
well as `analyses`. No revision may publish and no covered request may be added
while settling. A sweep that begins inside the settle window is maintenance, not
the hook's work; an update the hook forced, or a request that was not covered,
fails.

Additional workloads retain 200 alternating body edits on the reference and
S100, two hot and six warm S100 contexts with active subscriptions, four cold
opens, and Plan 2's unchanged entry-footprint workloads. The checked-set and cold
instances reuse those process observations with independent predicates; they do
not claim an additional execution. Created/deleted files must report the
membership path; a fixture change whose reach cannot be bounded would report the
broad path and fail this workload.

The external POSIX sampler observes process RSS at a 50 ms target interval.
A separate socket poll records daemon counters, contexts, retained facts and
history bytes at the same target interval, with actual timestamps and delays.
Worker heap is the latest real worker-reply checkpoint, rather than an invented
50 ms heap sample. Passive worker diagnostics record effective heap preflight,
thread/child lifetimes and bounded message traces. Operation traces include analysis, copying, transport and scheduling. A separate,
explicit probe outside hook timing sends the real latest revision input and
diagnostic arrays through an auxiliary worker, twenty round trips per array.
It records both clone directions and scheduling, array bytes, integrity hashes
and thread cleanup; analysis, JSON sizing and hash checks are outside its timings.
The existing supervisor process is included alongside the daemon and compiler. Each PID's RSS is counted
once; shared pages can still occur in several processes' RSS. Polling can miss
short peaks and adds measurement overhead.

Every Plan 5 timing and memory target, on every fixture, is an ideal
optimization budget under [Two kinds of budget](../../docs/architecture/memory-lifecycle.md#two-kinds-of-budget).
Each is recorded with its observed value, its target (`maximum`),
`enforcement: 'ideal'` and `targetMet`; a miss never fails a workload, and the
summary lists misses as `idealMisses`. A missing or non-finite observation is
missing evidence and still fails. Correctness predicates, runtime retention and
queue limits and completeness remain enforced. No acceptable-time budget is
declared. Plan 2 remains advisory under the policy at the top of this document.
No command option reduces sample counts, changes targets or converts failed
execution into a pass. `--workload <I5-13 suffix>` records a partial diagnostic
and exits 1 while any required workload remains unrun. `--output FILE` names the
raw report; every completed invocation also appends a lossless gzip record to
`results/index.json`, preserving failures and exact dependency, recipe, source,
build, scope and fixture identities.

Both resident and fast reports use bounded JSON serialization and incremental
parsing, so a complete raw report can exceed Node's maximum string size. Archives
use concatenated gzip members with indexed byte ranges and member hashes, while
retaining the whole compressed and raw payload hashes. Standard `gzip -dc`
reconstructs the original JSON bytes. The readers validate every indexed member
and the whole payload before accepting evidence; older single-member archives
remain readable. No samples are dropped to reduce the report size. The pinned
`@streamparser/json` development dependency and its version are recorded with
the measurement inputs.

The report evaluates proportional relinking, created-file resolution narrowing,
filtered extraction, persistent checkpoints and host-isolation deferral triggers.
A missing component remains `not-evaluated` and prevents full-recipe acceptance.
RSS growth includes the separate worker supervisor and compiler as well as the
daemon. Runtime retention ceilings apply to every recorded poll; lifecycle
counters must balance at settled checkpoints and after cleanup. A failed
correctness predicate needs an owner fix; the recipe never relaxes its assertion.

`hook-latency-x100` runs the same rows on X100. On the reference example and on
X100 it adds Plan 8's two edit classes, twenty cycles each, after the
deleted/created pairs: a signature edit that adds a named original already
exposed wherever the symbol is (the `source` path), and a `module.ramify` edit
that removes a companion's exposure and restores it (the `description` path).
On a build that enforces the rule, a removal fails the check with only
`exposed-without-companion` findings, one on the reference and nine on X100,
and no denied import. Revision timings then carry a tenth field, `companions`,
and each S fixture's one pinned `signature-inferred` note is expected in
coverage; the reference example declares every exposed signature and has none,
and a pre-plan build reports neither. X100 joins no derived row or deferral trigger.

`companion-stages.mjs` records Plan 8's stage timings and retained facts on the
reference example, the toolkit and X100, through this checkout's measurement
daemon over the real socket. After a cold open it alternates ten
`tsconfig.json` target edits (the broad path, which describes every file again)
and ten `module.ramify` comment edits (the description path, which relinks with
no compiler work), and archives every revision's timings, `factBytes` and
history bytes:

```sh
node scripts/measurements/companion-stages.mjs --output FILE [--cycles 10] [--toolkit DIR] [--fixtures reference,toolkit,X100]
```

`--toolkit` names the toolkit tree to copy, so a pre-plan build can measure
the same toolkit bytes. The script evaluates no budget; it reports medians per
edit kind, counting only revisions on the expected path.

The nine `fast-measure` handlers verify existing current evidence rather than
starting measurements concurrently with the prerequisite matrix:

```sh
RAMIFY_FAST_MEASUREMENT_REPORT=/absolute/path/fast.json npm run reference:verify -- --plan 5 --iteration 12
node scripts/measurements/verify-fast-evidence.mjs I5-13:entry-footprints /absolute/path/fast.json
node --test scripts/measurements/fast-evidence.test.mjs scripts/measurements/resident-reuse.test.mjs
```

Without a report path, the verifier selects the newest archive for the exact
current inputs. It verifies archive hashes and recomputes each predicate from
raw data. A completed individual workload in a partial invocation may supply
that instance; it grants no credit for missing workloads or full-recipe
completion. Controls reject removed rows, missing samples, stale inputs, altered
assertions, process leaks and archive corruption.

The resident recipe now asserts actual retained revision paths and correlates
each edit with its worker reply. Covered synchronized requests may reuse a
revision captured before acknowledgment. Settled retained workers and compiler
servers are expected live resources; cleanup is checked when their daemon stops.

## Plan 2A materialize scale and platform measurements

```sh
npm run build
npm run measure:plan2a
```

The command runs the installed `ramify materialize` against isolated copies of
the reference example (R) and the toolkit itself (T), the S100 synthetic
fixture, an S1000 sanity/smoke run, and a repeated-materialization plateau on R
and S100, each under its own owned `RAMIFY_ENDPOINT_DIR`. It records files,
entries, final bytes, ordinary/tests duplication, the largest ordinary and
tests area, cold and warm (repeat) latency, bytes written, and the daemon's
peak combined RSS/heap — the host process's own `daemon status` reading plus
its open context's worker thread and native compiler child, none of which
appear in the host's own reading alone. S500 is excluded from the default run
by the carried-forward Plan 5 measurement-policy decision (not required); run
it explicitly with `-- --workload synthetic-500` if ever needed. S1000 is a
sanity/smoke run: its real observed outcome (this host currently completes it,
cold and warm, in a few minutes each) is recorded, never forced or retried
toward a nicer number. `-- --workload <name>` runs one workload; `-- --output
FILE` names the raw report. Every completed invocation also appends a lossless
gzip record to `results/index.json`, identifying the exact source, build,
recipe and dependency versions, checked again at verification time.

```sh
node scripts/measurements/verify-plan2a-evidence.mjs I2A-12:reference-scale
```

Without a report path (or `RAMIFY_PLAN2A_MEASUREMENT_REPORT`), the reader
selects the newest archive whose recorded inputs match the current source,
build and recipe files, and recomputes every predicate from the raw
measurement. The nine `scale-evidence` reference-harness handlers use this
reader rather than re-running a heavy workload inside the verification gate.

```sh
npm run measure:plan2a-platform
```

Materializes the small, checked-in
[`plan2a-materialize-fixture.ts`](../reference-harness/plan2a-materialize-fixture.ts)
through the real installed CLI and daemon, and records: the first publication,
a real unchanged-repeat no-op, a real symlinked-target refusal, and a real
rollback (a genuine `EACCES` fault forces a failed second publish; the earlier
target is restored byte-for-byte) — plus a relative-path/bytes/SHA-256 manifest
of every generated file. The report is written to
`scripts/measurements/results/plan2a-platform-<platform>.json` (checked in
directly, not gzip-archived, since it is small and meant to be diffed).

This host is Linux only. **A macOS runner must execute `npm run build` then
`npm run measure:plan2a-platform` unchanged**, producing
`scripts/measurements/results/plan2a-platform-darwin.json`; commit that file
beside the existing `plan2a-platform-linux.json`. Until both exist, the
`I2A-12:linux-macos-bytes` reference-harness leaf fails honestly (a real,
current Linux report with no macOS counterpart), rather than passing on Linux
evidence alone.

## Plan 2B architect view measurements

```sh
npm run build
npm run measure:plan2b
```

The command runs the installed `ramify` against isolated copies of the
reference example and the toolkit and the S100 fixture, each under its own
owned `RAMIFY_ENDPOINT_DIR` below `/tmp`, with every command run from the
project root. For each it records `materialize --view architect` cold, as an
unchanged repeat, with retained dependency facts after deleting the view, and
warm with a new revision whose facts the analyzer computes; the view's files,
bytes and record lengths per file kind; `README.md` and the largest
`behavior.jsonl`; and the daemon's peak combined RSS and heap from polled
`daemon status`. On the reference project and the toolkit it measures hit cost:
`rg -n -i <term> .ramify-architect/` for `revision`, `project`, `session`,
`publish`, `watch` and `create`, with lines and bytes per file kind. The
`session-query` workload times the architect session query in process, hot and
after releasing the compiler. Two witnesses record the fixes of Plan 2B's
iteration 9. `mixed-invocation` reaches a context with another invocation form,
materializing with `--root` from another directory after a check from the root,
and without `--root` after `check --root .`, and requires measured dependencies
within the whole-command budget. `open-with-view` opens a resident session
while views exist and requires no generated input and a batch check's input
identity.

The raw report is written to
`docs/plans/iteration-2b-generated-views/evidence/plan2b-measurements.json`
(`-- --workload <name>` writes `plan2b-measurements-<name>.json`, `-- --output
FILE` another path). Its `budgets` list sets each of Plan 2B's budgets beside
its measured value; an exceeded budget is recorded, never retried. The command
exits 1 only when a workload fails to produce its evidence.

## Plan 2C module measurement acceptance

```sh
npm run build
RAMIFY_MEASUREMENT_ACTIVITY='Idle host; no other builds or measurements' npm run measure:plan2c
```

The command uses the built CLI and one owned endpoint. It records a measure
after daemon startup and a warm repeat, verifies the sum of exact owner buckets
against the root subtree and every listed byte count against disk, and writes
the complete `ramify.measure/1` toolkit document. It then measures the architect
session query, materialization, unchanged repeat, generated size, Plan 2B search
terms and sampled daemon/worker/compiler memory. The report chooses the fixed
architect metrics policy only from the agreed budgets and preserves Plan 2B's
hit thresholds as deferred evidence. Outputs are under
`docs/plans/iteration-2c-module-measurements/evidence/`; the owned daemon is
stopped and its endpoint removed after the run.
