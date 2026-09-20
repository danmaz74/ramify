# Iteration 4: The implementation run

**Goal:** an implementation run that starts, invokes an agent, establishes a
passing baseline, verifies the final composition and completes or fails, with
every durable boundary recoverable. The smallest coherent run is one with no
entry capabilities; that is this iteration's exit evidence.

## Prerequisites

Iterations 1, 2 and 3. The run uses the harness's `src/jobs/`, on the ledger, for its log and commits,
`harness/evidence` and the check engine for readiness and the final gate, and
the revised port for its one invocation.

## Write scope

`subs/harness/src/run/`, `subs/harness/src/checks/` (checkpoint policy only),
`subs/harness/src/prompts/`, `subs/harness/src/kpi/` (capture only), the
mapping service where the job kind discriminates, and
`subs/harness/src/interfaces/protocol/` for the `start-run` command. The web is
untouched; iteration 11 adds its page.

## Interfaces consumed and established

Consumed: `RecordRef`, `commitRecord`, `readCommitted`, `recoverCommits`,
`CommandLedger`, `JobLog`, `GateAttempt`, the git service, `runCommand`,
`readMeasurement`, the agent port.

Established: `RunRecord` (`ramify-agent.job/2` with `kind`), `RunPolicy`,
`Invocation`, `InvocationOutcome`, the observation log, `ReadinessAttempt`,
`InfrastructureRecovery`, `MeasurementSnapshot`, `PromptPackageManifest`,
`RunFailureReason`, and the run-log events from `job-started` through
`readiness-passed`/`readiness-failed` to `job-completed`, `job-failed`,
`job-stopped` and `job-interrupted`.

## Work

### The run as a job

`job.json` moves to `ramify-agent.job/2` with `kind` as the discriminator; a
`mapping` job keeps its present fields. The run layout is the
[proposal's](../core-records.proposal.md#layout-of-a-run). The captured plan,
the manifest, the prompt manifest and the policy are written once, before the
first event. The run ID is the job ID.

### `start-run` and `stop-job`

`start-run` carries `planId` and `agent`, and nothing the harness executes. See
the main plan's [protocol commands](../main-plan.md#commands-1).
Plan 1's three command rules hold unchanged: an identical retry returns its
receipt, a reused ID with other content conflicts, a stale expected version is
rejected with the current version, and a second run while one is active is
`busy`. `stop-job` is unchanged from Plan 1.

### Invocations and the observation log

`invocation-started` is appended **before** `startSession`, and
`writer-acquired` before any writer starts, so a stop arriving in between
applies to a known invocation. Each invocation has
`invocations/<id>/observations.jsonl`, written by the harness only, with the
proposal's types. A replayed `(invocation, callId, type)` is dropped.
`invocation-ended` commits `InvocationOutcome` and the submission hash.

This iteration invokes exactly one role, `initial-architect`, and accepts only
the `InitialAnalysisSubmission` union with empty `entries`. A
non-empty submission is valid but produces no work until iteration 5; the prompt
package of this iteration does not ask for one.

### Writer ownership and settlement

`writer-acquired` and `writer-released` with `confirmed`. Settlement is the
harness's own observation: the session idle and its registered process groups
killed and gone. A write that still arrives late shows as an uncommitted change
and joins the next commit. `stop()` resolving is not
evidence; nor is an agent's statement. An unconfirmed release blocks every
writer and every gate, and the run fails `writer-unsettled` after the bound.

### Readiness

One `ReadinessAttempt` per attempt, with the steps the main plan lists:
project root, compiler configuration, the test runner, nested-package discovery
to depth 4, test discovery, the Ramify daemon, and the three baseline commands.
Missing dependencies or a nonexistent command are readiness failures, not
code-repair assignments. A failure attempts one bounded
`InfrastructureRecovery` per `readinessRecoveries`, then ends the run
`readiness-failed` with evidence.

### The run branch

Readiness requires that the execution directory is a git repository with a
clean working tree, and refuses the run otherwise with the step `git-clean`.
The harness then creates and checks out `ramify-agent/run-<run-id>`. It ensures
that the plan's `.harness/` holds a `.gitignore` ignoring everything in it,
beside the `tsconfig.json` marker, so that the run's own log never changes the
tree a gate compares. Agents never commit; the harness never resets or reverts.
See [commits at accepted boundaries](../core-records.proposal.md#run-the-checks-then-commit).

### The final gate

`all-project`: all project tests, the type check and a complete Ramify check.
There is no separate acceptance check in the MVP, by Dan's decision.
`job-completed` requires a passing `final` attempt
on the current tree, every work item completed and every requirement verified;
an empty queue alone never satisfies it.

### Measurement capture

The first `MeasurementSnapshot` freezes `B`. Every invocation records its
snapshot reference and its `S_s` components by the
[recipe](../main-plan.md#the-s_s-recipe), its role, session ref, usage by
category, timing and outcome. Nothing is deferred to iteration 11 but the
projection.

### Recovery

For every transition of this iteration, a restart replays the log and
re-materializes its record files, and performs again any external effect whose
intent has no completion, without an agent call and without a duplicate. An
engineer interrupted by the crash leaves a dirty tree, and its successor starts
from it. Build the recovery table here; later
iterations extend the same table with their own boundaries.

## Acceptance cases owned

| # | Case | Evidence |
| --- | --- | --- |
| C2 | Restart after every durable multi-write boundary recovers with no duplicate work, obligation, decision or brief | One test per boundary of this iteration's log, forcing a restart after each write and comparing the recovered state with the table |
| C5 | Command retry, conflict and stale-version rules hold for implementation commands | Three tests on `start-run`, mirroring Plan 1's for `start-mapping` |
| K5a | Missing nested dependencies, a missing command and a failing initial baseline retain distinct causes and recovery paths | Three readiness fixtures, each naming a different failing step; only the recoverable one consumes a recovery attempt |

## Guards owned

| Guard | Test |
| --- | --- |
| Work is never marked complete before its last write | `subs/harness/src/tests/run-closing-order.test.ts` |
| Cancellation is not settlement | `subs/harness/src/tests/writer-settlement.test.ts` |
| A stop between `invocation-started` and the session's start applies to that invocation | `subs/harness/src/tests/stop-before-start.test.ts` |

## Exit evidence

- A run on a fixture copy whose initial analysis returns no entry capabilities
  starts, passes readiness, passes its final gate and completes, with **no
  client connected**.
- A run whose readiness fails ends `failed` with a `ReadinessAttempt` naming the
  step, after the bounded recovery.
- A run stopped mid-invocation ends `stopped` within `stopSettleMs`, and the
  late submission is rejected.
- The recovery table, with one passing test per row.
- The mapping job, still present until iteration 5 converts it, keeps passing
  its tests beside the run.
- The frozen baseline and one invocation's `S_s` components, with an
  `unavailable` component in a second fixture where the measure document is
  absent.
- `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`.
