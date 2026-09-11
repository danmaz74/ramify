# Iteration 1 probes and contract review

**Recorded:** 2026-09-11. **Review outcome:** revised package ready for
architecture acceptance. No I2 matrix instance ran, no resident owner was
implemented, and no independent architecture acceptance is claimed.
Iteration 2 may use the revised inventory; iteration 3 requires acceptance of
this package. Workflow publication submits the draft and does not supply that
decision.

## Reproduction and environment

All five probes ran in the authoritative execution checkout on Linux x64,
Node **v22.23.2**, with **typescript@7.0.2**. `npm run worktree:prepare`
installed the reference and site dependencies. `npm run build` prepared the
compiled Plan 1 engine. No owner source, declaration, harness implementation,
dependency manifest or lockfile changed. Each script is in the independent
`tsconfig.scripts.json` scope, asserts its observations, exits unsuccessfully
on a failed assertion, and writes its own JSON archive. Temporary inputs,
sockets, watchers and subprocesses belong to the probe and are cleaned up.

Run from the Ramify package root after preparation and build:

| Command | Raw result | Observation and decision |
| --- | --- | --- |
| `npx tsx scripts/probes/unix-socket-framing.ts` | [unix-socket-framing.json](../../../scripts/probes/results/unix-socket-framing.json) | 1 MiB and 32 MiB JSON payloads round-trip over a real Unix socket with partial headers and bodies. Hashes and lengths match. A real 0755 directory is rejected; 0700 accepted; foreign-uid comparison rejects the real stat metadata. Enforce 100 bytes before Node. |
| `npx tsx scripts/probes/fs-watch-recursive.ts` | [fs-watch-recursive.json](../../../scripts/probes/results/fs-watch-recursive.json) | A reference copy yields all 100 changed root-relative paths in one 100 ms debounced batch. Native recursive watch delivers excluded-tree events; the separate pruned arrangement uses 57 eligible directory handles, no excluded handles and no excluded callbacks. Every handle closes. |
| `npx tsx scripts/probes/atomic-record.ts` | [atomic-record.json](../../../scripts/probes/results/atomic-record.json) | Eight independent processes contend for O_EXCL, perform 160 atomic replacements, and an independent reader observes 161 versions in 3,539 reads without partial content. Critical sections never overlap. An exited/reaped contender supplies a proven dead pid for stale-lock detection. |
| `npx tsx scripts/probes/detached-spawn.ts` | [detached-spawn.json](../../../scripts/probes/results/detached-spawn.json) | A detached, unreferenced child remains running after its launching parent exits. A second process connects to the live socket, exits 3 and changes no record. The child's exit hook records code 23, and the child is absent after termination. |
| `npx tsx scripts/probes/warm-recompute.ts` | [warm-recompute.json](../../../scripts/probes/results/warm-recompute.json) | Twenty full in-process compiled Plan 1 runs per workload, with all eight stages completed, correct owner counts, no denials/coverage notes and one stable input identity per workload. Medians 3.442 s / 5.723 s inform RP-2, RP-6 and RP-7. |

The framing probe observed Linux accepting a 101-byte socket path and creating
a 108-byte endpoint from a requested 180-byte path. That corrects the draft's
assumption that the OS rejects everything over 100 bytes. The probe's explicit
portable guard rejects both before binding. Foreign ownership is tested by
comparing real stat metadata to a different uid; no foreign-owned directory
was created. See the [Node IPC documentation](https://nodejs.org/api/net.html#ipc-support).

Watcher evidence distinguishes native behavior from port policy. The overflow
witness feeds actual observed paths into a bounded 16-path queue; six
overflows are observed. An ENOSPC error event is injected on the watcher and
delivered; watching a missing root independently fails with real ENOENT.
No kernel overflow was induced or claimed. Native watch has no subtree
exclusion option or guaranteed complete delivery, so periodic captures remain
required. The reviewed arrangement prunes before attaching per-directory
handles. See the [Node watch caveats](https://nodejs.org/api/fs.html#caveats).

Atomic replacement proves reader visibility, not durability after power loss.
The start lock must not be reclaimed solely because it is old: only proven
dead-pid ownership permits removal. The detached result proves termination
on this run, not universal orphan reaping by every container init. A refused
socket plus an existing/ambiguous pid cannot authorize destructive cleanup.

Linux evidence is complete for this probe recipe. **No macOS execution is
claimed**; the later macOS process suite remains a completion requirement.

## Warm recompute

Each workload has one fresh worker process. It imports compiled `runBatch`
once and performs twenty serial calls with a fresh disposable session each
time; no warmup is discarded. The S100 map is the unchanged Plan 1
`hundredOwnerFiles()` generator, materialized beneath an owned ignored
directory. The reference uses its installed dependencies. Fixture setup,
imports, subprocess startup and report serialization for recording are
outside the timed calls. No regression, build or other probe ran concurrently
with these measurements.

The script's worker uses an in-memory
[Node load hook](https://nodejs.org/api/module.html#moduleregisterhooksoptions)
to insert phase marks at exact asserted anchors in compiled `run-analysis.js`.
It edits no source or dist file. Parse callback time is subtracted from the
acquisition interval; access includes helper disposal; seal/disposal and
report assembly have separate intervals. Raw results retain all forty runs,
phase durations, end-of-call parent RSS, input identities, report bytes,
worker hash and compiled pipeline hash. Medians of separate phases need not
sum to the median total.

| Median duration (ms) | Reference | S100 |
| --- | ---: | ---: |
| Registry/setup | 0.35 | 0.61 |
| Acquisition excluding parse | 171.67 | 884.16 |
| Description parse | 0.77 | 1.48 |
| Catalog | 2,133.74 | 1,560.65 |
| Link/model | 15.96 | 84.37 |
| Access and source-helper disposal | 621.06 | 667.65 |
| Decide | 48.49 | 1,597.45 |
| Seal and view disposal | 326.16 | 331.33 |
| Report assembly and return | 115.36 | 584.54 |
| Full call | **3,442.24** | **5,723.03** |

Keep compiler-state retention deferred and one analysis active per daemon.
The [single RP-7 revision](scope.md#latency-and-memory-targets) raises the
reference source target from 4.0 to **4.5 s**, and broad target from 5.0 to
**5.5 s**. Source allows at least 1.25 times measured full recompute and broad
at least 1.5 times, rounded up to 0.5 s where the previous target is lower.
S100's existing 8/12 s targets already exceed those margins. All other latency
and memory targets remain unchanged. This probe establishes neither stage
reuse performance nor resident/combined peak memory; iteration 13 must
measure and assert those independently.

## Contract review

Review used the full main plan, four package documents, Plan 1's implemented
interfaces and handoff, the daemon/process/memory/testing architectures, and
the module-description grammar, exposure, identity and tag rules. The table
records corrections incorporated into the package, rather than leaving
consumers to choose incompatible interpretations.

| Finding | Concrete revision | Consumer evidence required later |
| --- | --- | --- |
| Hashing only the daemon entry misses changed imported engine code at the same package version. | Group identity hashes package.json plus the sorted path/content hashes of all production runtime files. Discovery reads bytes without loading engine modules. | I2-14 handshake/group checks; I2-19 runtime entry boundaries. |
| Reclaiming an old lock with a live holder can create competing launchers. | Require a verified dead pid. Old live or malformed/ambiguous locks remain intact and waits are bounded. | I2-17 stale-lock, simultaneous-start. |
| Native recursive watch plus callback filtering still watches dependency trees. | Prune recursive directory enumeration and attach non-recursive handles; rescan membership; treat unknown paths, overflow and errors conservatively. Verify even when watching is unavailable. | I2-08 watcher/error/verification and I2-26 real watcher sequences. |
| Invalid acquisition releases its view without exposing sealed observations; the unchanged invalid batch report may have null inputId. | ProjectRead returns detached sealedInputs for coherent invalid acquisition. RetainedAnalysis explicitly carries all inputs and a resident identity. No batch report member changes. | I2-07 invalid-current and I2-11 batch equivalence. |
| Shared context selection does not preserve each caller's cwd, root spelling and capability order in Plan 1's report. | Freeze each lease's original invocation facts at acknowledgment; driver uses those facts. Only equivalent invocation requests share capture; revision reuse also requires full report equality except runId. | I2-03 same-root-reuse now checks independent batch reports from both invocations. |
| Arbitrary expectations cannot be verified from an observation the engine never captured. | Restrict comparisons to sealed content/absence observations; return unobserved-input for unknown observations. Unsealed engine results are delivered with verified false. | I2-02 expect-match includes an uncaptured-path negative. |
| Status-change coalescing has no count field; handshake rejection names an absent error code. | Add coalesced to status-changed and incompatible to ServiceErrorCode. Add ConnectOptions.signal for startup/handshake cancellation. | I2-14/I2-16 codec and client owner tests. |
| Root R7 is scheduled after quick consumers need its vocabulary and fakes. | Stage its contexts/fakes and connect/service slices in 5 and remaining client slice in 7. No final exposure list changes. | Manual activation review, I2-30 final declarations. |
| Always retaining lastValid conflicts with maxHistoryRevisions: 1; cold state retains published history while a budget row requires zero history. | Keep lastValid as a historical header whose report may be evicted. Enforce byte/count bounds; release products at cold transition and final history on eviction. | I2-12 history/bytes and I2-24 quick-watch-evicted; I2-27 idle disposal. |
| Path-only resolution cannot classify references-only configuration. | Permit a finite configuration helper/capture during selection, then dispose; no source catalog or long-lived compiler is created. | I2-10 resolution and unchanged unavailable CLI diagnostics. |
| A no-change verification scheduled from the last publication can spin after its first interval. | Schedule the next interval after each completed reconciliation, including revision reuse. | I2-08 unwatched-dependency second unchanged interval. |
| Cross-worktree input identities include root; driver port has no cause field; --batch still launches finite compiler helpers. | Correct these inventory expectations while retaining all 176 stable instance identities and counts. | I2-03, I2-05, I2-08 and I2-19. |

RP-1 and RP-3 remain confirmed, unchanged. RP-2 and RP-4–RP-8 select their
recommended alternatives with the measured RP-7 revision. The three required
scheduling decisions remain: contexts after analysis, message codec/connect
vocabulary in 5 before framing/client in 7, and host/all IPC in 8. Iteration 9
remains one iteration; its batch migration is mechanical and belongs with the
command change. The main plan records each decision separately.

Manual review of daemon N1–N5 and contexts X1–X3 passes: exact source/test
roots, owned-only interface wildcards, direct-child relay chains, preserved
original ownership/tags and valid staged providers. Root/daemon/CLI test
profiles include dispatch; contexts test bindings carry testing only. Every
foreign type has the R3/R4/R6/R7 or N5 exposure path listed in owners.md.
No declaration was installed and no self-negative is claimed executed here.

Inventory review confirms 176 unique rows, every row in its main-plan matrix
family and the declared iteration, and per-iteration counts
4/18/27/15/20/0/22/28/5/9/13/9/6 for iterations 2–14. The review preserves
every ID; it corrects expectations where the draft contradicted the public
interfaces. This is document validation, not harness or acceptance execution.

## Verification boundary

The required probes, script type-check and whitespace validation are recorded
in the managed iteration results. An initial type-check found Node's data
callback union type in the framing probe; a Buffer guard corrected it before
the final check. Regression Vitest/Cucumber, scenario coverage and sealed-file
checks are reserved for workflow automation by the execution prompt and were
not run locally. The full Plan 1 and Plan 2 gates are not claimed here.
