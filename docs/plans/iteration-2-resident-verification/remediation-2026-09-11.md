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
capability/closure expectations and gate input stability. Final commit-bound
results must come from the MCP audit and subsequent acceptance artifacts.

Four batch/resident edit sequences passed, as did three live watch sequences.
Two live source-edit timing cases exceeded their target while other tests were
running; they still require an isolated run. No latency target was relaxed.

## Outstanding acceptance evidence

- Full MCP commit audit and the final broad regression results.
- Full current Plan 1 gate (308 cases), followed by the full Plan 2 gate on the
  same source, build and runtime inputs.
- An idle-host execution of all nine measurement workloads and their fixed
  budget checks. Measured values and raw artifact links will be added here.
- macOS process evidence. The available execution environment is Linux; no
  macOS runner has been supplied.

The duplicate risk finding was waived during the initial review. Genuine
findings must retain their evidence-based disposition; unfinished acceptance
is not a reason to waive them. Workflow notes should identify the audited commit
and actual acceptance artifacts before final release.
