# Plan 7 regression runtime profile

**Date:** 2026-09-22. **Status:** completed external-boundary correction with
the original diagnostic retained below. **Conclusion:** explicit scripted
external services reduced the four-worker wall time from 686.42 seconds to
90.94 seconds while named real Git, Ramify, audit, readiness and process
witnesses remained executable.

## Completed correction result

The final command was:

```sh
npm test -- --maxWorkers=4 --reporter=json \
  --outputFile=/tmp/ramify-agent-final-profile.json
```

It completed successfully on the final worktree diff:

| Measure | Baseline | Final | Change |
| --- | ---: | ---: | ---: |
| Test files | 101 | 112 | +11 |
| Tests | 809 | 806 | -3 |
| Passed | 807 | 804 | -3 |
| Failed | 0 | 0 | — |
| Skipped | 2 | 2 | — |
| Suite wall time | 686.42 s | 90.94 s | 86.8% lower (7.55x) |
| Sum of test-file durations | 2,606.60 s | 309.51 s | 88.1% lower (8.42x) |

The count changed through coherent-case consolidation and explicit integration
splits. The composed acceptance matrix passed against the new filenames and
unchanged owning titles. Type checks, `git diff --check`, and `check:self` also
passed; the structural check reported zero errors, zero warnings and the same
87 declared analysis limits.

Ordinary lifecycle tests now choose explicit Git, Ramify, readiness, check and
shell boundaries. Exact sequential scripts reject missing and unused answers,
and subprocess guards prove that ordinary semantic flows do not escape through
Node's process APIs. Named integration tests retain the real boundaries,
including a real-Git crash/reopen witness that proves trailer-based idempotent
recovery without a duplicate commit.

The remainder of this document is the historical baseline diagnostic that led
to the correction. Its present-tense descriptions apply to that baseline, not
to the completed rollout.

## Historical baseline diagnostic

## Evidence boundary

The timed run used the Plan 7 worktree at
`/tmp/ramify-plan7-commit-audit/ramify-agent`, based on commit
`eef54d1f0c5b4f78c33e9901c7f19f2ac9ab402e`, with the current uncommitted
baseline corrections and direct check-execution test helper present. The exact
source identity is therefore the worktree diff, not the base commit alone.

The command was:

```sh
npx vitest run --maxWorkers=4 --reporter=json \
  --outputFile=/tmp/ramify-agent-timings.40habD/vitest.json
```

It completed successfully:

| Measure | Result |
| --- | ---: |
| Test files | 101 |
| Tests | 809 |
| Passed | 807 |
| Failed | 0 |
| Skipped | 2 |
| Suite wall time | 686.42 s (11m 26.42s) |
| Sum of test-file durations | 2,606.60 s (43m 26.60s) |
| Sum of individual-test durations | 2,606.49 s |

The wall time measures the four-worker run. Summed durations expose where the
work went even though files ran concurrently; they are not another elapsed
suite time. The JSON reporter output was retained under `/tmp` for this
investigation and is not a revision-bound repository artifact.

An earlier one-worker run before the direct executor changes reported 99 files,
802 tests and 3,049.16 seconds of wall time. It is useful historical context,
but it is not a controlled before/after comparison: the test set and worker
count differ.

## Concentration

The cost is not distributed evenly:

| Population | Aggregate duration | Share |
| --- | ---: | ---: |
| Slowest 5 files | 980.1 s | 37.6% |
| Slowest 10 files | 1,624.0 s | 62.3% |
| Slowest 15 files | 2,051.1 s | 78.7% |
| Slowest 20 files | 2,282.9 s | 87.6% |
| 17 files taking at least 60 s | 2,188.3 s | 84.0% |
| 33 files taking at least 10 s | 2,517.4 s | 96.6% |

The slowest files were:

| Rank | Test file | Tests | Duration |
| ---: | --- | ---: | ---: |
| 1 | `contract-revision.test.ts` | 5 | 228.94 s |
| 2 | `composition-recovery.test.ts` | 19 | 198.46 s |
| 3 | `run-recovery.test.ts` | 30 | 195.25 s |
| 4 | `breaking-work.test.ts` | 6 | 187.24 s |
| 5 | `contract-scheduling.test.ts` | 3 | 170.21 s |
| 6 | `iteration-gate.test.ts` | 7 | 168.56 s |
| 7 | `composition-recovery-delegation.test.ts` | 6 | 136.96 s |
| 8 | `iterations.test.ts` | 5 | 124.76 s |
| 9 | `contract-delegation.test.ts` | 3 | 111.75 s |
| 10 | `composition-recovery-chains.test.ts` | 10 | 101.84 s |
| 11 | `run-protocol.test.ts` | 10 | 92.59 s |
| 12 | `placement.test.ts` | 8 | 90.46 s |
| 13 | `requirement-verification.test.ts` | 4 | 89.28 s |
| 14 | `accepted-commit.test.ts` | 6 | 82.13 s |
| 15 | `no-rewind.test.ts` | 2 | 72.62 s |
| 16 | `module-creation.test.ts` | 3 | 69.98 s |
| 17 | `engineer-submission.test.ts` | 14 | 67.23 s |
| 18 | `local-authority.test.ts` | 1 | 37.87 s |
| 19 | `work-items.test.ts` | 6 | 29.18 s |
| 20 | `gate-diagnostics.test.ts` | 4 | 27.58 s |

## Slowest individual scenarios

| Rank | File | Scenario | Duration |
| ---: | --- | --- | ---: |
| 1 | `contract-revision.test.ts` | Three consumers complete revision 1, a third revises it, and the follow-ups finish | 132.83 s |
| 2 | `contract-scheduling.test.ts` | A three-change cross-module chain completes in reverse dependency order | 67.82 s |
| 3 | `contract-scheduling.test.ts` | A second consumer attaches to and reuses a shared obligation | 63.69 s |
| 4 | `contract-revision.test.ts` | `revision-needed` reaches the waiting consumer and the revision registers | 58.90 s |
| 5 | `breaking-work.test.ts` | Reviewer-identity run stages the break and preserves green boundaries | 52.00 s |
| 6 | `requirement-verification.test.ts` | A passing verification that retains the fake closes nothing | 47.81 s |
| 7 | `contract-delegation.test.ts` | Contract gate runs against the fake and provider gate against the real provider | 46.92 s |
| 8 | `breaking-work.test.ts` | An unadapted consumer fails the whole-project gate | 46.12 s |
| 9 | `contract-delegation.test.ts` | Delegation completes end to end | 41.99 s |
| 10 | `composition-recovery-delegation.test.ts` | Recovery from `requirement-verified` | 39.56 s |
| 11 | `no-rewind.test.ts` | Added work leaves completed work completed | 39.40 s |
| 12 | `contract-scheduling.test.ts` | A repeated transitive cycle becomes a run failure | 38.69 s |
| 13 | `local-authority.test.ts` | Local refinement, escalation and revision propagation | 37.87 s |
| 14 | `iteration-gate.test.ts` | Three failed gate attempts exhaust the repair bound | 37.33 s |
| 15 | `contract-revision.test.ts` | A second report at one obligation revision fails the run | 37.21 s |

The longest scenario alone is 5.1% of all aggregate test time. It creates a
real temporary repository and drives a full run through multiple consumers,
contract engineers, provider work, verification work, revision and follow-up
gates. Its scripted agents are fake, but the surrounding repository and
lifecycle machinery are not.

## What remains real in the quick tests

The new direct executor is correctly narrow. `openRuns()` supplies
`createDirectCheckExecution()` by default, which preserves gate classification
and records deterministic test evidence without spawning the checkpoint's
commands or creating an audit worktree. See
[`helpers/runs.ts`](../../../subs/harness/src/tests/helpers/runs.ts) and
[`helpers/direct-check-execution.ts`](../../../subs/harness/src/tests/helpers/direct-check-execution.ts).

That change does not make the surrounding lifecycle direct:

1. `RunService.reachReadiness()` ignores the injected check executor and calls
   `runReadiness(inPlaceCheckExecution, ...)`. Each new run therefore performs
   the real readiness command path. See
   [`run/service.ts`](../../../subs/harness/src/run/service.ts) and
   [`run/readiness.ts`](../../../subs/harness/src/run/readiness.ts).
2. The service calls `currentHead`, `changedPaths`, `diffNameStatus` and
   `commitForGate` directly. Writer settlement, mutation accounting,
   checkpoints, accepted boundaries and recovery all continue to observe or
   modify a real Git repository.
3. A changed committing gate performs one history lookup, then normally checks
   the branch, stages the tree, checks the index, commits and reads the new
   head. That is up to six Git processes before the direct executor receives
   the prepared gate. See
   [`run/gates.ts`](../../../subs/harness/src/run/gates.ts) and
   [`evidence/git.ts`](../../../subs/harness/subs/evidence/src/git.ts).
4. Every production `runCommand` invocation is wrapped by
   [`run-command-with-cleanup.sh`](../../../subs/harness/subs/evidence/src/run-command-with-cleanup.sh).
   After the child exits, `cleanup_child` sends `TERM`, sleeps for 200 ms and
   sends `KILL`. The sleep occurs even when `TERM` found no remaining process
   group.

The wrapper therefore adds a fixed 200 ms to every successful Git or readiness
command. A changed gate's six Git calls alone have an approximately 1.2-second
cleanup floor. One `changedPaths` observation runs both `git diff` and
`git status`, adding approximately 400 ms. A readiness pass adds its own Git
queries and three baseline command processes. Complex revision and recovery
scenarios multiply those costs over many transitions and replay boundaries.

The fixture copy is not large enough to explain the result by itself:
`fixtures/collection-review` is approximately 828 KiB and 100 files in this
worktree. Repository setup and filesystem traversal still contribute, but the
fixed per-command delays explain why scenarios with many gates and transitions
grow into tens or hundreds of seconds.

## Real audit witnesses are not the main cost

Only two ordinary lifecycle scenarios explicitly opt back into
`createAuditCheckExecution()`:

| File | Scenario | Duration |
| --- | --- | ---: |
| `iteration-gate.test.ts` | A real failing assertion produces scoped diagnostics and one repair round | 28.56 s |
| `iterations.test.ts` | One small work item is accepted, committed and published through the real audit | 27.90 s |

Together they account for 56.46 seconds, or 2.2% of aggregate test time. The
audit conformance and audit-workspace tests remain separate focused boundary
tests. Reducing the number of real audit witnesses further would not address
the dominant cost shown by this profile.

## Recommended correction order

### 1. Remove the unconditional cleanup delay

Change `cleanup_child` so it waits before `KILL` only when `kill -TERM` reports
that the process group still exists. Preserve the current real tests for a
command that exits while leaving descendants and for timeout/cancellation.
This keeps the cleanup guarantee while removing 200 ms from ordinary completed
commands.

Reprofile after this correction before changing test architecture. It is the
smallest change and affects every remaining real command.

### 2. Inject readiness execution

Give `RunService` a readiness execution dependency, defaulting to the current
in-place executor in production. Let ordinary lifecycle tests supply the direct
executor. Keep focused readiness tests on the in-place executor when command
outcomes, cancellation, recovery or process behavior are the subject.

### 3. Separate repository semantics from Git-process integration

Introduce a repository-operation port for head lookup, changed paths, diff
status, gate commits and trailer lookup. Ordinary state-machine, scheduling and
recovery scenarios should drive a deterministic direct implementation. Retain a
small explicit suite over real Git that proves:

- run-branch creation and protection;
- one changed and one unchanged committing gate;
- trailer-based idempotent recovery;
- accepted-boundary behavior after a failed commit and unchanged retry;
- audit publication for a passing and a failing commit.

The direct implementation must preserve revision identity, changed-path
answers, commit/no-commit distinctions and crash points. It cannot return a
generic success that bypasses the production state machine.

### 4. Reduce recovery-fixture reconstruction

The recovery tables prepare related durable states repeatedly. After the
process and Git costs are removed, profile them again. If fixture preparation
is still material, build one immutable prepared state per scenario family and
copy it for each recovery boundary, or test pure ledger replay separately from
the smaller set of restart-through-service witnesses. Do not share mutable run
state between tests.

## Verification for the corrections

For each step, retain the current JSON timing command and compare:

- complete pass/fail/skipped counts;
- wall time and aggregate test time;
- top-file and top-scenario durations;
- count and identity of tests that spawn real commands, use real Git and invoke
  the real audit adapter;
- cleanup behavior for leaked descendants, cancellation and timeout.

A faster passing suite does not by itself establish the process boundaries that
were replaced. The retained real-process, real-Git and real-audit witnesses must
pass separately and remain named in the test source. This follows the project's
quick-testing rule: semantic flows use direct adapters, while actual process and
transport behavior receives focused complementary verification.

## Scope limits

- This report profiles one successful four-worker run. It does not establish
  stability across hosts or repeated samples.
- No per-command trace was captured. The 200 ms floor and Git call counts are
  derived from the executed source paths, while the file and test durations are
  measured results.
- Parallel file execution means a file's duration can include contention from
  other workers. The concentration is suitable for prioritization, not a
  microbenchmark of an isolated file.
- The report does not change the Plan 7 audit contract or reduce its acceptance
  requirements. It identifies how to keep a few real boundary witnesses without
  making every semantic lifecycle scenario pay their process cost.
