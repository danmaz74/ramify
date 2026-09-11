# Resident verification remediation

The user authorized direct remediation of workflow `_V45arOkcMxXlHArekIG8` on
2026-09-11: “use subagents to fix all issues”. Changes live on
`workflow/iteration-2-resident-verification`; managed iteration publications and
the frozen main plan were preserved.

## Implemented behavior

- Real retained incremental analysis, project resolution and cancellable helper
  lifetimes; known module exports stay complete beside shared-global coverage.
- Context generations, synchronized captures, history, invalid publication,
  queueing, cancellation, watcher recovery, memory limits and idle eviction.
- Shared service dispatch, strict framed IPC, bounded outbound queues and
  client recovery; root service and process assembly use these implementations.
- Atomic lock publication and recoverable startup coordination. A timed-out
  launcher terminates its own unready child. Ambiguous legacy locks report
  unavailable because no dead owner can safely be established.
- Resident check, watch, status and stop, lightweight package client, explicit
  batch mode and visible fallback only after eligible failure recovery.
- Complete registration for all 176 acceptance cases, nine real measurement
  workloads, independent raw-evidence verification, and current Plan 1 evidence
  consumption. Registration alone does not count as execution.
- Large raw traces and report bodies are preserved as portable, hashed gzip
  sidecars; gate summaries remain bounded. Generated measurement outputs do not
  invalidate the source identity that produced them.

## Verification record

Focused verification established all 18 increment, 27 context, 15 service,
20 edit, 15 IPC, 7 startup/client process, 13 Linux lifecycle and 5 fallback
cases. These include actual sockets, SIGKILL recovery, a suspended client during
shutdown, concurrent startup, and explicit stop during a cold S1000 check.
The CLI cases were exercised against real processes and the direct adapter.
The self-check completed 11 owners, 223 source files and 2,710 accesses with
zero findings or coverage gaps. Strict final declarations resolved 11 owners,
230 files, 77 expanded statements and eight package entries.

The first broad owner run passed 1,221 of 1,229 tests; its failures identified
stale description/global expectations, the old compiled shutdown defect and a
source/build input-identity mismatch. Those causes were fixed. The first harness
run passed 347 of 352 tests; remaining reruns cover corrected owner access,
capability/closure expectations and gate input stability. The focused rerun
passed all 43 tests across those four harness files.

Source commit `dba3d40c38a91e1c6956d2311eef78e491613658` passed the MCP commit
audit on 2026-09-11: all 1,241 regression tests across 75 files, dependency
preparation and all four type-check scopes passed. The audit reported no fresh
audit required for that commit. Sealed-file checks were skipped because no check
phase was supplied. The audit is recorded at
`refs/audited/runs/2026-09-11T10-51-50Z-dba3d40`; this configured audit does not
replace the separate full acceptance gates or measurement evidence.

Four batch/resident edit sequences passed, as did three live watch sequences.
Live source-edit checks exposed a wildcard-growth report deadline miss and an
exact changed-path mismatch when moving a source file into tests. Independent
review corrected the initial diagnosis: the runtime matches the
[changed-input contract](contracts.md), which includes captured
directory membership identities. Moving `history.ts` changes both existing
parent directories as well as the four edited file paths. The harness omitted
the two directories from its expected list; filtering them from runtime output
would violate the contract. The correction preserves exact path comparison and
independently checks changed directory membership, with negative controls for
missing directory entries and unrelated paths. The new harness regression failed
before the correction and passed after it; all six retained-analysis tests
passed, including an independent filesystem-membership witness and fresh-batch
equivalence. The actual `I2-26:testing-move-live` process case then passed all
48 assertions, including the expected testing-origin denial and process cleanup.

The user subsequently requested “for now let's relax any performance targets”.
Empirical latency, RSS, heap and growth targets are now advisory for current
batch and resident measurement commands and acceptance gates under the
[scope decision](scope.md#budgets). Numeric baselines and actual measurements
remain visible; no target is claimed met without evidence. Runtime limits,
correctness, eventual updates, resource cleanup and finite hang guards remain
enforced. The old 4.6-second watch target therefore no longer blocks acceptance
by itself; the correct report must still arrive within the 120-second harness
hang guard. The wildcard-growth live-watch case then passed all 78 correctness
assertions. Measurement tooling controls passed, including rejection of missing
evidence, inconsistent raw observations and an oversized outbound queue.

## macOS portability verification

The first actual macOS CI run exposed a compiler-adapter defect: native
`NodeHandle.path` uses a case-folded compiler identity, so treating it as a
physical pathname lost ownership and produced incorrect relative paths.
The adapter now uses the resolved declaration's `SourceFile.fileName` for
physical ownership, forwarding, declaration descriptions and explicit star
exports. It preserves exact case-sensitive comparisons on Linux and does not
invent a physical path when a declaration cannot be resolved.

A new regression failed against the old implementation on macOS and passed
with the correction. The following run identified separate fixture assumptions
about canonical `/var` paths, short Unix socket paths, platform-specific socket
errors and symlink-entry watcher hints. The corrected fixtures still require
canonical roots, the 100-byte socket limit, unchanged live-owner records, no
excluded-tree or symlink-target watches, and exact process cleanup.

The full macOS regression suite passed in
[validation run 34595670619](https://github.com/danmaz74/ramify/actions/runs/34595670619).
Its Plan 1 and process/IPC acceptance results are recorded below.
Linux source commit `cc4785a` passed the MCP audit at
`refs/audited/runs/2026-09-11T11-44-55Z-cc4785a`.

That run completed with Plan 1 at 307/308 and process/IPC acceptance at 75/78.
The relocated package inherited a long `TMPDIR`, which made socket-bearing
test fixtures exceed the unchanged 100-byte endpoint limit. A Linux reproduction
failed nine discovery tests before the correction. Short, uniquely owned socket
fixture roots corrected the failure; the full long-`TMPDIR` regression run then
passed 1,242/1,243 tests and identified one remaining tracing fixture, whose
focused correction passed. Two CLI expectations now derive the canonical root
with `realpath`; the third process failure depended on the failed Plan 1 receipt.
Commit `54a45e9` contains these independently reviewed corrections and preserves
inner relocation test reports before asserting command success. Fresh complete
macOS evidence was produced by
[validation run 34599155866](https://github.com/danmaz74/ramify/actions/runs/34599155866).

The final macOS run passed all **308/308 Plan 1 cases**, **78/78 process/IPC
cases** (1,422 assertions) and **1,243 toolkit tests** on Darwin arm64. Independent
verification matched all 78 reviewed members and validated all 178 raw sidecars'
compressed and uncompressed hashes and byte counts. The complete portable
archive and verification receipt are indexed in
[macOS acceptance evidence](evidence/macos-acceptance.json).
Node 22.23.2 and TypeScript 7.0.2 were used; source SHA-256 is
`c96ce172b06dd3dc39858d22841bf597c1478af6c923d69fce1a24709376e43d`
and build SHA-256 is
`2d6e1152c866fddb3b8a16777ae133c753dbdaaef1058092e194b78fb6ba6cbb`.

A separate Linux subset passed all 89 direct Plan 2 cases: 18 API, 31 unit and
40 quick cases. It supplies no process, IPC, measurement or Plan 1 receipt credit.

The initial all-workload measurement attempt was deliberately interrupted
before further repetition so the corrected build could be measured. Its
archive remains marked incomplete; it establishes no final acceptance.

The second full attempt exposed a measurement correlation defect: concurrent
watcher and CLI checks could leave an unchanged revalidation as the latest
increment, hiding the edit's actual stage-reuse evidence. Commit `6aab35a`
associates the publication with a real completed increment observed after the
pre-edit boundary. Missing or overwritten raw proof fails verification. Memory
sampling waits for public idle state and verifies that no analysis intervened;
resource counters remain independent binding checks. Four regression controls
and ten actual reference cycles across all five edit types passed, with zero
active sessions, files, helpers or owned processes afterward. The interrupted
second archive remains incomplete and is not final workload evidence.

The third full measurement attempt completed all nine workloads. Seven passed,
including 400 repeated source edits, eight warm contexts and slow-consumer
handling. Independent raw-evidence verification reproduced those results.
S500 and S1000 failed their cold checks. Every workload's controller recorded
zero surviving observed processes after cleanup. The complete run is preserved
in `scripts/measurements/results/resident-2026-09-11T12-29-49.293Z-f947427c-9195-465b-94a2-3c586323375b.json.gz`.

A separate exact-fixture S500 reproduction preserved the primary failure:
the registry, acquisition, parse, catalog, link, access and decision stages
completed, but the report exceeded `maxReportBytes=33554432`. An external
diagnostic wrapper measured a 34,792,550-byte report, including a 34,769,338-byte
snapshot. Results and accesses account for approximately 15.1 MB and 8.5 MB.
This is linear verbose public evidence, not a timing-target failure or a
quadratic exposure error. It required coordinated report, response-frame,
outbound-queue and retained-history limits, as implemented below. No
large-project acceptance requirement was waived.
Raw evidence and independent checks are retained under [evidence](evidence/).

The measurement harness previously connected only after validating a cold
report, so cleanup could hide that original failure. Its correction connects
before validation, retains failed raw CLI results and preserves primary and
cleanup errors separately. Focused regressions preserve the resource-limit
diagnostic. A real after-fix S500 run instead hit the unchanged 130-second
command guard; that actual primary error remained visible, and zero processes
survived cleanup. This is cleanup evidence, not a passing large-project check.

## Large-project capacity correction

Commit `028515b` preserves the public report and protocol schemas while sharing
a 96 MiB report allowance between batch and resident dispatch, with 64 KiB of
response-envelope headroom and 128 MiB bounds for the codec, outbound queue,
history and CLI publication queue. Product retention remains 96 MiB per context
and global retention remains 512 MiB. All analysis, command, cancellation and
lifecycle deadlines remain unchanged. The [scope amendment](scope.md#large-report-capacity-amendment-2026-09-11)
records the measured basis and hard limits.

A separate S1000 diagnostic also exposed repeated canonical identity validation
inside every decision lookup. One question in a 128-symbol model performed
258 validations. The correction validates the requested identity once, compares
the four established canonical fields directly and reuses the resolved original
for visibility. It adds no global cache or public API. The regression failed
before the correction; all 242 model/access tests passed afterward. Report,
codec and history boundary tests passed 24/24; CLI process and publication queue
tests passed 14/14, including interrupts, broken pipes and bounded admission.
Independent reviewers found no blocking issues.

Actual focused S500 and S1000 cold/source workloads then passed every assertion
with zero surviving processes. S500 completed in 39.99/41.84 seconds and S1000
in 85.45/87.76 seconds. The full S1000 JSON output was 69,571,145 bytes with
19,001 allowed accesses, zero findings and complete coverage. Its history,
retained products and outbound peak used 69,571,144, 80,591,333 and 69,572,559
bytes respectively, within the new hard bounds. The source-edit timing target
remains an advisory miss. These focused results do not replace the final
same-input gates and all-workload measurement below.

## Remaining empirical memory targets

Commit `438bc03` applies the approved advisory policy to three remaining
reference-harness targets: client entry RSS, retained-report heap growth and
session RSS growth. The harness records each observed value, target and whether
the target was met. Missing or non-finite observations still fail, as do resource
cleanup, report accounting, exact execution counts and leaked sessions.

Two focused tests passed: finite measurements above the target remain valid
observations, while missing, non-finite and invalid raw measurements are rejected.
The reference-harness TypeScript scope also passed. These harness-only changes
do not alter production code, the build or measurement recipes. Fresh Linux and
macOS acceptance runs use this commit's harness.

## Linux acceptance before the measurement correction

The full Plan 1 gate passed **308/308**, with zero failed or unexecuted cases,
on source commit `4211f3422b266eef21fcbb54f3c01eb6b59b5257` in 1,017,486 ms.
Its complete portable artifact is
`.reference-work/reports/plan1-full-3c4a7c5f-a441-44e0-bf37-a30184d67785.json`.
The separate Plan 2 receipt validator accepted all 308 execution slots, the
305 unchanged reviewed definitions, eleven-owner self-checks and eight-entry
relocation evidence. The owned endpoint was removed after confirming no daemon
remained running.

Inputs: source SHA-256
`65be0cbc8d0fe7cc71a028dfcd986e4e7559cb0066f1119ffcdd8d668c87a5c4`;
build SHA-256
`2d6e1152c866fddb3b8a16777ae133c753dbdaaef1058092e194b78fb6ba6cbb`;
Node 22.23.2; TypeScript 7.0.2.

## Acceptance reuse amendment

The user approved [evidence reuse with focused reruns](acceptance-evidence-policy.md)
after the latest Linux and macOS Plan 1 runs each passed 300/308 cases. Six
failures came from the direct API harness retaining the previous 32 MiB request
allowance while the CLI used the approved 96 MiB allowance. Two self-check
failures came from a namespace escape in the new test spy; production decisions
completed successfully with zero denials, but coverage was correctly partial.

The corrected spy retains the complexity regression: the prior implementation
still fails with 258 canonicalizations, and both tests pass on the optimized
implementation. An actual self-check then completed with all eleven owners,
1,952 allowed accesses, zero denials and no coverage notes; its owned daemon was
stopped and its endpoint removed. All nine focused Linux cases passed, including the six CLI comparisons, both
self-checks and a retained-report control. The original eight failed cases are
replaced only in the separately validated acceptance view. Original failed and interrupted reports remain
unchanged. The interrupted fourth measurement run completed three workloads
successfully and released all observed processes.

## Current composed acceptance

Linux Plan 1 now has verified coverage of all 308 required cases: 299 executions
retained from the original run and nine focused reruns. The actual Plan 2
prerequisite consumer accepted the receipt, including all 305 unchanged reviewed
record definitions. The [Linux evidence index](evidence/linux-plan1-composed-20260911.json)
links the original failed report, focused execution, exact source transitions
and raw evidence. Focused daemon stop/status checks passed with no survivor.

macOS also has composed Plan 1 coverage of 308 cases (299 retained plus nine
focused) and all 78 resident process/IPC cases (75 retained plus three focused).
[Focused CI run 34615302017](https://github.com/danmaz74/ramify/actions/runs/34615302017)
passed on actual Darwin arm64, Node 22.23.2 and TypeScript 7.0.2. Independent
verification checked all 183 referenced raw artifacts and clean daemon shutdown.
The [macOS evidence index](evidence/macos-composed-acceptance-20260911.json)
records every process case's origin and preserves the original failed baseline.
Neither composed result is represented as a newly executed full suite.

Current source identity:
`7f49d5a5676e1c7dfd7af8700c4c97d53f551932384680248b25252f478a5392`.
Production build identity:
`495ef420a136e63b116b77a48f44b99c0cbc116319a3987266019fbf53ea34b4`.
The approved changes preserve production and workload inputs. The original
focused Linux run's identity is also preserved through an exact two-file
cleanup-validator transition; its cases were not repeated for that validator edit.

## Final behavioral acceptance and measurement waiver

The 167 Linux non-measurement Plan 2 cases passed in
[CI run 34615535499](https://github.com/danmaz74/ramify/actions/runs/34615535499).
Independent verification confirmed every reviewed case and assertion, matching
source/build/runtime identities, clean shutdown and all 179 raw sidecars.
[Evidence index](evidence/linux-nonmeasurement-34615535499.json).

At the user's instruction to stop further performance-only tests, the remaining
measurement queue was stopped. Five workloads are verified with 1,355 raw
assertions: entry footprints, reference cold/warm/broad checks, S100
cold/warm/broad checks, all 400 repeated-edit cycles, and all eight contexts.
The interrupted slow-consumer measurement is not counted as passed. The queued
S500, S1000 and publication-peak measurements were not started. The earlier
large-project preflights above retain their actual results and input identities.

The [policy amendment](acceptance-evidence-policy.md#stop-performance-only-execution-amendment)
waives these four unfinished measurement requirements and execution of the nine
measurement-only consumers. No full 176-case Plan 2 pass is claimed. Behavioral
slow-consumer and process-cleanup coverage remains established by the accepted
Linux and macOS suites. The interruption evidence preserves the two processes
observed immediately after stopping and their subsequent cleanup; the final
independent process check found zero owned survivors.

The configured commit audit and final finding dispositions are recorded separately
against the final commit and workflow. The [measurement evidence index](evidence/measurement-acceptance-with-waiver-20260911.json)
records the completed workloads, explicit waivers and preserved interruption.

The duplicate risk finding was waived during the initial review. Genuine
findings must retain their evidence-based disposition; unfinished acceptance
is not a reason to waive them. Workflow notes should identify the audited commit
and actual acceptance artifacts before final release.
