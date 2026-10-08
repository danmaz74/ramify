# Plan 22: enforced test boundaries and prompt command cleanup

**Date:** 2026-10-08. **Status:** draft; planning only, implementation unstarted.

## Outcome

An ordinary ramify-agent regression run exercises real harness behavior and
durable state without launching Git, Ramify, audit or other child processes.
Missing external responses fail the test. A separately selected boundary suite
verifies the actual adapters and process lifecycle. The committed full audit
continues to execute both suites, with no loss of configured coverage.

Production commands that have already exited and left no descendants incur no
cleanup grace sleep. Commands that leave descendants, time out, are cancelled
or exceed output limits still settle their owned processes before returning.

## Basis and current state

The user requested a plan after the 2026-10-08 analysis of slow ramify-agent
tests. Ordinary tests must mock Git. Focused verification of Git itself remains
explicit real-boundary evidence, as established by the predecessor correction.

- [Source state](source-state.md) records current contracts, the supplied timing
  analysis and the independently measured wrapper delay.
- [Plan 7's correction](../07-commit-audit-integration/test-runtime-profile.md)
  already separated ordinary lifecycle tests from real external services and
  reduced four-worker wall time from 686.42 s to 90.94 s. Those are historical
  measurements of a different suite, not this plan's runtime target.
- [Contracts](contracts.md) define the proposed runner partition, strict fakes,
  guard, cleanup and evidence rules.
- [Acceptance](acceptance.md) assigns every plan-local case to an iteration.
- [Iteration manifest](iterations/manifest.json) defines eight serial iterations.
- [Configured discovery snapshot](configured-files.json) lists files selected
  by the installed Vitest configuration at authoring time. It is evidence,
  not a replacement test-discovery algorithm or a runtime allowlist.
- [Planning validation](planning-validation.md) records artifact checks only,
  not implementation or runtime acceptance.

The worktree is receiving Plan 21 changes. Implementation must capture an exact,
clean delivery base containing the adopted configured-audit contracts. Preserve
existing edits and changes delivered after this planning snapshot. Reconcile
source drift in iteration 0 before migrating tests; do not restore the older
check-execution/readiness seams removed by Plan 21. The wrapper correction may
be qualified independently if that base is not yet available. This plan does
not claim that Plan 21 is complete or change its completion criteria.

## Scope and owners

| Owner | Work |
| --- | --- |
| Evidence child | Cleanup wrapper and real command-runner, Git and Ramify adapter witnesses. |
| Harness testing source | Strict Git/candidate/audit/Ramify scripts, fixture setup, lifecycle matrices and retained composed witnesses. |
| Audit child | Existing public-provider conformance witnesses and full-suite integration. |
| Project root testing/configuration | Automatic process guard, explicit boundary registration, Vitest projects and package commands. |

Production Git, candidate, audit and Ramify contracts already provide injection
seams. Reuse them; do not implement another Git repository, diff engine or audit
discovery model in tests. No new provider release or public protocol is planned.
Shared test helpers remain testing-classified and require ordinary Ramify
exposure if another owner receives them.

## Delivery sequence

| Iteration | Capability | Depends on |
| --- | --- | --- |
| 0 | Freeze discovery, case migration and real-boundary inventory | — |
| 1 | Remove unnecessary production cleanup waits | 0 |
| 2 | Supply strict no-process fixtures and guard infrastructure | 1 |
| 3 | Convert the 959 s acceptance matrix; retain actual boundary witnesses | 2 |
| 4 | Convert the 300 s dependency file on the next critical path | 3 |
| 5 | Convert recovery, assignment/delegation and remaining consumers, slowest first | 4 |
| 6 | Enforce configured ordinary/boundary projects and complete audit | 5 |
| 7 | Qualify correctness, process isolation and runtime improvement | 6 |

**Priority revised 2026-10-08:** deliver the slowest tests first after the
small shared prerequisites. Iteration 0 prioritizes the acceptance-file case
map, and iteration 2 delivers only the helper/guard support necessary to begin
that conversion; neither requires completing all other conversions or global
runner enforcement. The wrapper fix removes a production cost shared by every
real-command test and is delivered before migration.

The supplied profile orders conversion as acceptance (959 s), dependencies
(300 s), capability recovery (277 s), nonfunctional recovery (217 s), assignments
(111 s), then delegation (95 s). These are prior diagnostic timings, not newly
measured guarantees. Recheck each converted family's focused timing and remaining
critical path after cleanup; use that evidence to order iteration 5's families.
Keep all planned cases and final full-audit qualification regardless of ordering.

Each iteration retains its focused failures, verification results and handoff.
Implementation proceeds in order, one iteration at a time. Commit and delivery
policy follows the later implementation authorization; this request creates
planning artifacts only.

## Required behavior and preservation

1. Zero attempted child-process launches in ordinary tests, including setup,
   teardown and caught failures. Real filesystem fixtures and in-process HTTP
   remain available where they establish the tested behavior.
2. Strict independently stated external answers, including scratch index/ignore
   status, candidate bytes/tree IDs, changed paths, gate results and recovery
   lookups. Unexpected operations and unused required answers fail.
3. Preserve acceptance IDs, independently expected outcomes, negative controls,
   authority boundaries and durable replay assertions. Every existing case
   either stays, moves or has an explicit equivalent-case mapping.
4. Real Git/process/provider witnesses remain executable and included in the
   complete configured suite. No new skip, quarantine, retry, timeout increase
   or weakened assertion is a performance correction.
5. Audit establishes configured execution health. Engineers report results and
   responsible architects assess semantic preservation and completion. Neither
   the harness nor a new inventory script makes semantic completion judgments.

## Verification and measurements

Use focused Vitest commands from each iteration. Full regression is executed
through the installed audit CLI on a clean committed candidate, not by an
ad-hoc whole-suite invocation. From the repository root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

Before and after runner changes, obtain the actual configured file set with:

```sh
# From ramify-agent/
node_modules/.bin/vitest list --filesOnly --json
```

Discovery is read-only file listing; it is not a passing test run. After the
partition exists, use the project's declared selectors to list each project.
Require exact disjoint membership and a complete union of configured files;
compare case titles and requirements separately where files split or move.

Measure one audit run before migration after the cleanup correction, and one
final full audit on the same host, both with four workers and the same effective
suite policy. Record actual source/configuration identities, pass/fail/skipped
counts, wall time, aggregate file time, top files/cases, command counts by
boundary and runner versions. Preserve supplied 961 s/959 s figures as prior
diagnostic evidence, not a controlled baseline for an evolving worktree.

Hard numeric gates are zero ordinary process attempts, zero unexplained case
losses, zero discovery gaps/duplicates, zero leaked live owned processes, and
zero cleanup sleeps on the completed/no-descendant path. The final targeted
capability and nonfunctional ordinary matrices must also report zero real Git
and cold Ramify invocations. Timing goals are advisory: remove the approximately
200 ms per-command floor and demonstrate a lower median repeated-command time
and a lower full-suite wall time against the recorded comparable baseline.
Do not turn host-load fluctuations into flaky millisecond assertions. If the
full-suite timing does not improve, investigate and retain the explanation;
do not declare the speed correction achieved on passing tests alone.

## Completion and deferrals

Completion requires every acceptance row, the complete configured audit,
qualified real-boundary witnesses, case-preservation review by the responsible
architect, and a timing report with exact input identities. Publish a final
results document in this directory distinguishing automated execution from
semantic review and performance evidence.

This plan defers changing production Git algorithms, provider internals,
test concurrency, worker count, shared mutable fixtures and test quarantine.
It adds agent-local testing guidance during implementation; it does not edit
the toolkit roadmap or protected harness principles/specification during
authoring. All proposed commands and runner projects are explicitly unimplemented
until their owning iteration delivers them.
