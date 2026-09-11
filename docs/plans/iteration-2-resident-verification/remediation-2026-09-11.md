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

## Outstanding acceptance evidence

- A fresh commit audit after subsequent source changes; the audit above covers
  `dba3d40` only.
- Full current Plan 1 gate (308 cases), followed by the full Plan 2 gate on the
  same source, build and runtime inputs.
- An idle-host execution of all nine measurement workloads and their advisory
  target comparisons plus mandatory evidence, correctness and cleanup checks.
  Measured values and raw artifact links will be added here.
- macOS process evidence. The available execution environment is Linux; no
  macOS runner has been supplied.

The duplicate risk finding was waived during the initial review. Genuine
findings must retain their evidence-based disposition; unfinished acceptance
is not a reason to waive them. Workflow notes should identify the audited commit
and actual acceptance artifacts before final release.
