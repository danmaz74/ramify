# Iteration 4 results: the implementation run

**Date:** 2026-09-20. **Status:** complete. The [brief](iteration4.md) is
satisfied: a run is a job of kind `implementation`, with its own record, its
captured policy, its layout and its log; it invokes the initial architect
once, establishes readiness with bounded recovery, verifies the final
composition and completes; every durable boundary of its log recovers; and
the `.gitignore` iteration 2 assigned to this one is written by the harness.

The smallest coherent run, the one with no entry capabilities, starts, passes
readiness, passes its final gate and completes with no client connected. That
is this iteration's exit evidence and it is executable.

## 1. Baseline

Run from `ramify-agent/` before anything was changed. All four pass, and each
matches iteration 3's exit exactly.

```text
=== npm run type-check ===   EXIT: 0
=== npm test ===             Test Files  45 passed (45)
                                  Tests  334 passed (334)
=== npm run build:web ===    ✓ 287 modules transformed.   ✓ built in 254ms
=== npm run check:self ===   Execution: completed; check: passed; coverage: complete
                             Completed scope: 7 owners, 117 source files, 4 resources, 1256 accesses
                             Findings: 0 errors, 0 warnings, 0 analysis limits; 694 allowed, 0 denied, 562 external
```

## 2. The architect view this iteration worked from

| | Before | After |
| --- | --- | --- |
| Revision | `rev/1:737df0e1-87d0-459b-b851-e616bb351edc:1` | `rev/1:484e9434-865d-438a-b32c-b64057e1472e:1` |
| Input identity | `input/1:17e8c5e967e722beaa056c49e53a6d7253ab66851ef818c2bb19d7750eaa8ae2` | `input/1:d4ac0c40c1f9dbf183f24fcc51545ddd4f25046dce0d29439fc75673c8a931e8` |
| Modules, records | 7, 504 | 7, 724 |
| Dependencies, test references, metrics | measured | measured |
| Cut | 122 | 187 |

The before column is iteration 3's recorded after view, which was the view on
disk when this iteration started; this iteration did not materialize one of
its own before changing anything, so the before column is quoted rather than
observed. The after view was materialized from a stopped daemon, before any
claim below about the module tree, and its dependency facts are measured. Its
cut is 187, so an absent detail in it is not evidence that behavior is absent.

### The module tree is unchanged, and one exposure is added

The seven modules of iteration 3 are the seven modules now; this iteration
declares none. Every consumer this iteration adds is inside `harness`'s own
`src/`, so the dependency facts are the same as iteration 3's:

| Module | `uses` | `usedBy` |
| --- | --- | --- |
| `ramify-agent/harness` | `evidence`, `ledger`, `agent`, `agent/pi` | `ramify-agent`, `web` |
| `ramify-agent/harness/evidence` | — | `harness` |
| `ramify-agent/harness/ledger` | — | `harness` |
| `ramify-agent/harness/agent` | — | `harness`, `agent/pi` |

`harness/evidence` exposes one name more than iteration 2 left it:
`ramifyExecutable`. See deviation 1.

## 3. What was delivered

### The run as a job

`job.json` is `ramify-agent.job/2`, and `kind` discriminates the two records
that declare it: `jobs/records.ts`'s mapping job, which keeps its present
fields, and `run/records.ts`'s `RunRecord`. A reader of one kind answers
nothing for the other, so each service serves its own jobs and warns about
neither the other's nor a directory Plan 1 left behind. The run ID is the job
ID.

The captured plan, the prompt manifest, the frozen baseline snapshot and
`job.json` are written once, in that order, before the first event: each of
the later ones names the earlier. The layout is the proposal's.

### `start-run` and `stop-job`

`interfaces/protocol/runs.ts` holds `start-run` with `planId` and `agent`, and
nothing the harness executes; `stop-job` is Plan 1's, reused unchanged.
Plan 1's three command rules hold, over `CommandLedger`, which now states them
over any command's ID, expected version and content rather than over the
mapping command union. A second run while one is active is `busy`.

### Invocations and the observation log

`invocation-started` is appended before `startSession` and commits the
`Invocation` with the `MeasurementSnapshot` its scope was measured against.
Each invocation has `invocations/<id>/observations.jsonl`, written by the
harness only, with the proposal's types; a replayed `(invocation, callId,
type)` is dropped and counted. `invocation-ended` commits the
`InvocationOutcome` and the submission's hash, and the accepted submission is
stored verbatim before anything is derived from it.

This iteration invokes `initial-architect` and accepts the
`InitialAnalysisSubmission`. Its prompt package asks for no entry assignment,
so no run of this iteration produces one; a submission that carries entries is
valid and is recorded in `analysis/entries.json`, and no work is derived from
it until iteration 5.

### Validated JSON, once

`run/submissions.ts` is the one place that answers an invalid input: the
strict schema, then the rules the schema cannot hold, then the same answer for
every caller. Nothing changes on a failure; every error returns to the same
session as the tool's error result, as JSON with its path, what was expected
and the attempts that remain, capped at 20 with the total stated; each
rejection is a `rejection` observation; the bound ends the invocation as
`invalid-submission`. `reachedTool: false` — an input the implementation
rejected before the tool ran — counts toward the same bound and is recorded
with the implementation's own reason, never a reading of its message text.

`run/analysis.ts` supplies the schema and four rules beyond it: a capability
slug unique in the run, a hypothesis ID unique in the run, an owner the
refreshed view has or a `ModuleProposal` whose parent it has and whose
directory is a direct child under that parent's `subs/`, and a citation that
names a module of the view. Without a view the rules that need one are not
applied, and the run records that rather than accepting a claim it did not
check.

### Writer ownership and settlement

`run/writer.ts` holds the one writer of a run. `acquire` is called before a
writer starts and a second acquisition without an intervening release is a
fault of the harness. Settlement is the harness's own observation: the
session idle **and** every registered process group killed and confirmed
gone, both, within `writerSettleMs`. `stop()` resolving is not evidence and
neither is the agent's word. The tree is read before the groups are killed and
after, so a write that still arrived is `lateWrites` rather than nothing. An
unconfirmed release blocks every writer and every gate that would follow, and
the run fails `writer-unsettled`.

The initial architect writes nothing and holds no writer, but a session of
its that cannot be confirmed idle blocks the same way: a gate run against a
tree something might still be writing proves nothing.

### Readiness

One `ReadinessAttempt` per attempt, with the ten steps the main plan lists, in
its order. A step that does not pass stops the attempt before any command
runs, and the three baseline steps record `not-verified` with the step that
stopped them. The baseline itself is one `readiness` gate attempt: the
project's tests, each nested package's tests, the type check and a complete
Ramify check, and each baseline step reads its own command's record.

Recovery is bounded by `readinessRecoveries`. A failure a preparation can
repair consumes one: missing nested dependencies are `reinstall-nested`, an
unanswering Ramify command line is `restart-daemon`, and a timeout or a runner
error is `rerun-command`. A failure it cannot repair consumes none: a missing
command, a baseline the project itself fails, and every structural step. A
recovery that reports `failed` ends the run at once rather than repeating a
preparation that did not work.

### The run branch

Readiness requires a git repository with a clean working tree and refuses
anything else with the step `git-clean`. The branch
`ramify-agent/run-<run-id>` is created and checked out once that has been
established, so a refused run leaves no branch behind. A run resumed after a
crash finds its branch and stays on it; the harness never resets or reverts,
and agents never commit.

`ensureStateDirectory` now writes a `.gitignore` ignoring everything in it,
itself included, beside the `tsconfig.json` marker, for `plans/.harness/` and
each plan's `.harness/`. Without it `git add -A` at a gate would commit the
run's own log, its records and the project lock, and readiness would never see
a clean tree. A plan's `map/` gets none: it holds project content.

### The final gate

`all-project`: all project tests, the type check and a complete Ramify check,
on the current tree. `job-completed` names the passing attempt and requires
it; the count of work items is recorded with it, and an empty queue alone
never satisfies it.

The commit is the ledger's fourth external effect. `gate-attempted` is the
intent and commits the attempt with `commit: null`, as the record says it
stands until the effect completes; the effect finds the commit by its
`Ramify-Gate` trailer or makes it; `gate-committed` commits the attempt's
second revision, naming it. A passing gate over an unchanged tree makes no
commit, which is every run of this iteration that changes nothing. The message
is written mechanically from records.

### Measurement capture

`kpi/capture.ts` captures one `ramify.measure/1` document verbatim with its
revision and the hash of the producer's own bytes, and `scopeSize` is the
`S_s` recipe over it: the owned source of the selected exact owners and
subtrees, each declared API-view area once, the architect view when the role's
profile includes it, and the named support documents, with production,
testing, documentation and API buckets preserved beside the aggregate. `B` is
frozen from the run's first snapshot, over the root subtree, all view areas,
the architect view and the initial support set, each once.

A missing component makes the total unavailable with its known subtotal and
its coverage beside it, never a zero; a module the document does not have has
an unknown size, not a zero one. Every figure is captured when the observation
happens: `job.json` names the baseline before the first event, and the
invocation's record carries its own components.

### Recovery

`RunService.open` replays each run's log, rewrites every record file that is
missing or differs, performs again each external effect whose intent has no
completion, closes an invocation whose start has no end as `failed` with
`session-lost`, and marks the run interrupted. None of it calls an agent and
none of it makes a duplicate. The source tree is outside every transaction and
is never restored.

## 4. Exit evidence

All four run from `ramify-agent/` after every change.

```text
=== npm run type-check ===

> ramify-agent@0.0.0 type-check
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json

EXIT: 0

=== npm test ===

> ramify-agent@0.0.0 test
> vitest run

 RUN  v4.1.11 /ramify/ramify-agent

 Test Files  57 passed (57)
      Tests  427 passed (427)
   Duration  38.35s (transform 3.52s, setup 0ms, import 21.32s, tests 238.41s, environment 6.53s)

EXIT: 0

=== npm run build:web ===

> ramify-agent@0.0.0 build:web
> NODE_ENV=production vite build --config subs/web/vite.config.ts

vite v8.3.0 building client environment for production...
✓ 287 modules transformed.
dist/web/index.html                   0.39 kB │ gzip:   0.26 kB
dist/web/assets/index-BVUPCXfX.css    6.25 kB │ gzip:   1.78 kB
dist/web/assets/index-DJ9mvXsL.js   430.38 kB │ gzip: 129.68 kB
✓ built in 288ms
EXIT: 0

=== npm run check:self ===

> ramify-agent@0.0.0 check:self
> ramify check --batch --root .

Root: /ramify/ramify-agent (given)
Configuration: /ramify/ramify-agent/tsconfig.json
Mode: batch
Execution: completed; check: passed; coverage: complete
Stages: registry=completed, acquisition=completed, parse=completed, catalog=completed, link=completed, access=completed, decide=completed, report=completed
Completed scope: 7 owners, 146 source files, 6 resources, 1777 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 1085 allowed, 0 denied, 692 external
EXIT: 0
```

### The brief's exit evidence, item by item

| Item | Where it is proved |
| --- | --- |
| A run on a fixture copy whose initial analysis returns no entry capabilities starts, passes readiness, passes its final gate and completes, with no client connected | `run.test.ts`, "starts, passes readiness, passes its final gate and completes, with no client connected": the eight events in order, the snapshot, the records on disk, and no HTTP server anywhere in the test |
| A run whose readiness fails ends `failed` with a `ReadinessAttempt` naming the step, after the bounded recovery | `readiness.test.ts`, six cases: nested dependencies repaired and not repaired, a missing command, a failing baseline, a timeout that recurs until the bound, and the two structural refusals |
| A run stopped mid-invocation ends `stopped` within `stopSettleMs`, and the late submission is rejected | `run.test.ts`, "a run stopped mid-invocation ends stopped": the stop lands while the session stalls, the run ends `stopped`, the submission that follows is refused as final and `analysis/entries.json` was never written |
| The recovery table, with one passing test per row | `run-recovery.test.ts`, ten cases; the table is below |
| The mapping job keeps passing its tests beside the run | `mapping.test.ts`, `jobs.test.ts`, `approval.test.ts`, `recovery.test.ts` and the rest, all passing; one assertion changed, see deviation 3 |
| The frozen baseline and one invocation's `S_s` components, with an `unavailable` component in a second fixture where the measure document is absent | `measurement.test.ts`, seven cases: the frozen `B` with its support set, the invocation's components with its buckets, a producer that cannot be run, a run whose baseline is therefore unavailable, subtree deduplication, an unknown module and the architect view at its publication size |

### The recovery table

Each row is one test of `run-recovery.test.ts`. The run is frozen at the
boundary through the `afterWrite` hook, as a crash would leave it, the lock is
replaced by one held by a process that is gone, and the project is reopened.

| Crash after | What recovery does | Duplicate avoided |
| --- | --- | --- |
| `job.json` and `job-started`, before the driver ran | Loads the run and appends `job-interrupted` | No invocation is started |
| `invocation-started` | Closes `inv-0001` as `failed` with `session-lost` and `disposition: 'incomplete'`, then interrupts | No second `invocation-started`, and no agent call |
| `invocation-ended` | Leaves the outcome as it was, then interrupts | No second `invocation-ended` |
| `analysis-accepted`, with `analysis/entries.json` removed | Rewrites the entries from the log, then interrupts | No second `analysis-accepted` |
| `readiness-passed`, with `readiness/01/attempt.json` removed | Rewrites the attempt and its gate from the log, then interrupts | Readiness does not run again |
| The commit intent, before the commit | Performs the effect again: makes the one commit and appends `gate-committed` with it | One commit on the branch |
| The commit, before its completion line | Performs the effect again: finds the commit by its `Ramify-Gate` trailer and makes no second one | One commit on the branch |
| `gate-committed` | Appends the interruption only | The commit is left alone |
| `job-completed` | Rewrites nothing and appends nothing | — |
| A run directory a mapping service loads | It is not a mapping job, is not listed and is not a warning | — |

## 5. Acceptance cases owned

| # | Case | The tests that prove it |
| --- | --- | --- |
| C2 | Restart after every durable multi-write boundary recovers with no duplicate work, obligation, decision or brief | `subs/harness/src/tests/run-recovery.test.ts`, one test per row of the table above. The boundaries are this iteration's; later iterations extend the same table |
| C5 | Command retry, conflict and stale-version rules hold for implementation commands | `subs/harness/src/tests/run-commands.test.ts`: an identical `start-run` retry returns its original receipt and starts no second run; a reused ID with other content is `conflict` and starts nothing; a stale expected version is `stale-version` carrying the current version and the run is not stopped. Beside them: a start expects version 0, a second run while one is active is `busy`, an unknown plan is `not-found`, a missing or differently named agent is `unavailable`, and `stop-job` keeps the same three rules |
| K5a | Missing nested dependencies, a missing command and a failing initial baseline retain distinct causes and recovery paths | `subs/harness/src/tests/readiness.test.ts`. Each fixture is a temporary copy mutated for its own step. Missing nested dependencies fail at `nested-packages` and consume one `reinstall-nested` recovery, which repairs them in one case and does not in the other; a missing command fails at `baseline-tests` with `command-missing`, runs nothing at all and consumes no recovery; a baseline the project itself fails is `failed` with its exit code and consumes no recovery. A fourth case shows the bound: a command that keeps timing out consumes both recoveries and then ends the run |

## 6. Guards owned

| Guard | Test | How it is enforced |
| --- | --- | --- |
| Work is never marked complete before its last write | `subs/harness/src/tests/run-closing-order.test.ts` | Which record files exist is read at every durable write. The invocation's record is there while the session runs; its submission and its outcome are there before it is closed; the entries are committed with the event that accepts them; readiness commits its attempt and its gate in one transition; the final gate's attempt is a record before the run completes; and the closing event is last |
| Cancellation is not settlement | `subs/harness/src/tests/writer-settlement.test.ts` | Eight cases over real detached process groups: an idle session whose group is killed and confirmed gone is settled; a group that cannot be confirmed gone is not, whatever the session says, and blocks every writer and every gate after it; a session that never becomes idle is not settled although nothing is left running; a write that arrives while the group is being killed is recorded as a late write; a second writer without a release is refused; a group nobody registers is a group nothing waits for; and a run whose invocation is not confirmed settled fails `writer-unsettled` with no gate run against that tree |
| A stop between `invocation-started` and the session's start applies to that invocation | `subs/harness/src/tests/stop-before-start.test.ts` | The stop is accepted from the `invocation-started` hook, which is exactly between the event and `startSession`. No session runs, the invocation's record is there, its outcome is `stopped` with `disposition: 'incomplete'`, nothing is derived from an analysis that never happened, and the terminal event is last. A second case lands a stop before the first invocation at all |

## 7. Every union value has a producer and a test

`subs/harness/src/tests/union-values.test.ts` writes each value of each union
this iteration establishes into a record through the ledger and reads it back
through the reader that answers valid, unsupported version or invalid.

| Union | Values written and read back | Values with no producer in a run yet |
| --- | --- | --- |
| `RunEvent.type` | All fifteen, with the four terminal ones named | `writer-acquired` and `writer-released` have no producer until an engineer writes |
| `InvocationOutcome.ended` | All six | `context-budget-reached` is produced by the port, not yet by a run's role |
| `InvocationOutcome.disposition` | All three | `superseded` is produced only when a run is stopped mid-invocation |
| `InvocationOutcome.interruption` | All five | Only `session-lost` and `adapter-fault` have a producer here |
| `ReadinessAttempt.step` | All ten | — |
| `ReadinessAttempt.steps[].outcome`, `verdict` | All | — |
| `InfrastructureRecovery.cause` | All nine | `in-scope`, `invalid-session`, `outside-assignment`, `guarded-change`, `unknown` and `session-lost` belong to later checkpoints |
| `InfrastructureRecovery.action` | All five | `reconstruct-session` and `none` have no producer: an unrecoverable readiness failure records no recovery at all, so that it consumes no attempt |
| `InfrastructureRecovery.outcome` | Both | — |
| `MeasurementSnapshot.measure` | Both arms | — |
| `Observation.type` | All nine | `guard`, `mutation`, `hook-check` and `excursion` arrive with the writers that produce them |
| `coverage-gap.kind` | All five | `context-unavailable` and `usage-unavailable` are produced by a run; the other three arrive with the shell and its mutations |
| `guard.verdict`, `mutation.observedBy`, `compaction.trigger` | All | Produced from iteration 7 |
| `Role` | All five, each with its context policy | Only `initial-architect` is invoked here |
| `RunFailureReason` | All twelve named; `readiness-failed`, `invalid-submission`, `agent-failed`, `writer-unsettled`, `repair-exhausted`, `recovery-exhausted` and `internal` have a producer | The rest belong to later state machines |
| `RunPhase`, `SessionMode` | All | — |

## 8. The tests added

93 tests in 12 files, and one helper.

| File | Tests | What it covers |
| --- | ---: | --- |
| `run.test.ts` | 5 | The complete run, the run branch and its `.gitignore`, a failing final gate, a passing one over a changed tree with its one commit, and a stop mid-invocation |
| `run-commands.test.ts` | 10 | C5, and the rest of the command surface |
| `readiness.test.ts` | 10 | K5a, the bound, and the structural refusals |
| `run-recovery.test.ts` | 10 | C2, the recovery table |
| `run-closing-order.test.ts` | 2 | The closing-order guard |
| `writer-settlement.test.ts` | 8 | The settlement guard |
| `stop-before-start.test.ts` | 2 | The stop guard |
| `analysis-submission.test.ts` | 13 | Rule 10 for the analysis: the schema, the rules beyond it, the answer a session receives, the bound, an implementation rejection, and the package's offered members |
| `measurement.test.ts` | 7 | The frozen baseline, an invocation's components, the recipe and an unavailable component |
| `union-values.test.ts` | 12 | Section 7 |
| `observation-log.test.ts` | 6 | The observation log's dedup and numbering, and what a run observes |
| `run-policy.test.ts` | 8 | The captured commands and limits, nested-package discovery and the checkpoint policy |

`subs/harness/src/tests/helpers/runs.ts` builds what a run test needs: a
fixture copy made a git repository, the test runner readiness looks for, a
policy whose commands are cheap, inputs that need no materialized view, and
the scripted fake. **Nothing there simulates a command.** Every command a
policy names is spawned and its exit code read; what a test substitutes is
which command, never whether it ran. The default policy's own argv,
environment and timeouts are asserted in `run-policy.test.ts`.

## 9. The measured size of the owner this iteration changed

From `ramify measure`, with the daemon stopped.

| Owner | Production files | Production bytes | Test files | Test bytes |
| --- | ---: | ---: | ---: | ---: |
| `harness`, after iteration 3 | 29 | 163,618 | 20 | 142,799 |
| `harness`, now | 45 | 345,891 | 33 | 269,270 |
| `harness/evidence`, now | 6 | 40,518 | 7 | 27,676 |

The before row for `harness` is iteration 3's recorded figure. `evidence` has
no before row: iteration 3 recorded none, and this iteration adds no file to
it, only an exposure. All sixteen production files and thirteen test files
this iteration adds are `harness`'s own.

## 10. Deviations from the brief, with reasons

1. **`harness/evidence` exposes `ramifyExecutable`.** A `RunPolicy` captures
   the complete command it ran each check with, its environment included, so
   that an exhaustion is reproducible and so that what ran is in the record.
   A captured command that names no executable is not a command. The
   alternative, letting the policy name `npx ramify`, would record a command
   that resolves differently later, which is the opposite of what capturing
   it is for. The module's README says what crosses and why.
2. **The gate attempt is committed at two revisions.** The proposal says
   `GateAttempt.commit` is null "until that effect completes", and the layout
   gives the attempt one file. Revision 1 is committed with the intent and
   revision 2 with the completion, naming the commit, so a restart between
   them can read the attempt and perform the effect again. The alternative,
   committing the record only at the completion, leaves recovery with no
   attempt to read.
3. **One assertion of `mapping.test.ts` changed.** It listed a plan's
   `.harness/` and expected `['tsconfig.json']`; that directory now also
   holds the `.gitignore` this iteration was assigned. The assertion names
   both files and says what each is for.
4. **`CommandLedger` states its rules over a shape, not over the mapping
   command union.** Plan 1's three rules are the run's rules unchanged, and
   the run's commands are a different union. Widening the parameter type to
   the ID, the expected version and the content is the smallest change that
   keeps one implementation of the rules; duplicating them would be the drift
   the guards exist to prevent.
5. **Nested-package discovery walks to depth 5, not 4.** The main plan asks
   for depth 4 and names `subs/workspace/subs/catalog/tools/` as the readiness
   fixture, which is one directory deeper than that. The walk reaches the
   fixture the plan names. Whoever revises the plan should settle which figure
   it meant; the constant says so where it is defined.
6. **A run of this iteration blocks on any unconfirmed session, not only on a
   writer's.** SM9 is about the writer, and this iteration has no writer role.
   The rule it protects — no gate against a tree something may still be
   writing — is not about who declared itself a writer, so an invocation whose
   session cannot be confirmed idle blocks the same way and fails the run
   `writer-unsettled`.
7. **The run's events and its snapshot are internal, and only `start-run` is
   in `interfaces/protocol/`.** The brief scopes the protocol to the
   `start-run` command, and the proposal's rule 7 makes the run log private:
   the web receives projected events, which iteration 11 defines. The events
   are in `run/log.ts` and the projection in `run/snapshot.ts`; `runs.ts`
   holds the command, the roles, the failure reasons and the phases, and is
   not yet exposed to the parent, because nothing outside the harness reads it
   until iteration 11 adds its statement.
8. **The gate attempt's zod schema is in `run/records.ts`, not beside the type
   in `checks/records.ts`.** The check engine describes an attempt and returns
   it; the run is what persists one and reads it back. A compile-time check in
   `run/records.ts` keeps the two descriptions in step.
9. **An unrecoverable readiness failure records no `InfrastructureRecovery`.**
   K5a requires that only the recoverable failure consume a recovery attempt,
   and a record with `action: 'none'` would be a consumed attempt. The value
   keeps its producer in `union-values.test.ts`.
10. **`all-project` checkpoints attach no `TestSelection`.** The project's own
    runner does the selecting, and the resolver that turns an
    `owned-by-scope` policy into files, with the two reasons a rediscovery can
    fail, belongs to the iteration that assigns a write scope. The readiness
    step `test-discovery` separately establishes that the project discovers
    tests.
11. **Component 3 of the `S_s` recipe is measured from the published
    directory.** The recipe says to take the architect view's bytes from
    Ramify's publication target size, and `ramify.measure/1` carries per-module
    API-view totals but no publication size for the architect view. The
    snapshot records `.ramify-architect` among its supplementary entries, at
    the bytes of the published directory, and the component says where its
    figure came from. Where no view is published the component is
    `unavailable` with that reason, never zero.

## 11. What the next iteration must know

- **The run's driver is one `advance`-shaped path, and every log write goes
  through `RunService.write`.** It serializes with `run.mutex` and builds the
  event inside the lock, so the sequence in the event and the sequence of the
  ledger's line can never disagree. Two concurrent appends did disagree before
  it existed, and a log whose sequences disagree does not load. Any iteration
  that adds a transition uses that one writer, and a hook it calls from inside
  the gate's commit effect must not issue a command, which would wait on the
  same mutex.
- **A run is `interrupted` on load and is not resumed.** The brief requires
  recovery "without an agent call", and starting a successor invocation is an
  agent call, so the recovery table ends each interrupted run rather than
  continuing it. An engineer interrupted mid-edit still leaves a dirty tree,
  and the next run's engineer reads it with `git diff`; iteration 6 should say
  whether a run is ever resumed in place, because nothing here decides it.
- **`ObservationLog` counts a rejection, and `SubmissionJudge` is the only
  place that answers one.** An iteration that adds a submission union member
  or a harness tool supplies a schema and its rules to `SubmissionJudge` and
  gets steps 3 to 6 of rule 10 for nothing. `countImplementationRejection` is
  how a `reachedTool: false` event reaches the same bound.
- **The policy is captured, so a test that needs other commands supplies its
  own policy and the run records it.** `RunServiceOptions.policy` builds the
  policy from the project root and the nested packages discovered at the
  start. Readiness verifies those packages again and reports one that appeared
  afterwards, whose tests are not in the gate.
- **`runCheckpoint` refuses a checkpoint whose selection is not
  `all-project`.** Iteration 6's resolver is what lets `iteration`,
  `contract` and `work-item` run; until it exists, asking for one is an error
  rather than a gate that quietly ran the whole project.
- **Do not let a run test make a resident Ramify daemon analyse a temporary
  project.** The daemon spawns its compiler helper from the working directory
  of the invocation that started it, and that helper fails with `getwd` as
  soon as the project is removed — and so does every later analysis through
  that daemon. `helpers/runs.ts` therefore gives run tests a `ramify` that
  answers its version and nothing else, and `realRamify()`, for a test that
  needs real evidence, starts its private daemon from this package's own root
  with a bounded check that analyses nothing. This cost half a day; it is the
  reason `measurement.test.ts` is the only run test with a real command line.
- **The `.gitignore` is written by `ensureStateDirectory`, and the fixture's
  own `.gitignore` already ignores the generated views.** A target project
  that does not would fail `git-clean` as soon as a view is materialized;
  nothing checks that yet.
- **The daemon's wait-limit behavior still costs a view its dependency
  facts.** Stop the daemon before the materialization an iteration reports.
- **`subs/harness/src/.ramify/` and `subs/harness/src/tests/.ramify/` are
  still stale**, as iterations 1, 2 and 3 recorded. `npm run check:self` does
  not read them.

## 12. Not done, with the reason

- **No pi session was run.** This iteration is not one of the three the
  iterations README permits to touch pi, and its tests use the scripted fake
  throughout. Whether a real provider accepts the analysis schema is still
  iteration 3's open sub-question and iteration 12's live trial.
- **The run has no HTTP surface.** The brief leaves the web untouched and
  iteration 11 adds the Run page, its queries, its projected events and its
  error codes. `interfaces/protocol/runs.ts` is not exposed to the parent yet,
  and `http/app.ts` serves the mapping protocol alone. A run is therefore
  driven by `RunService.execute` and watched through the file system, which is
  what the exit evidence's "no client connected" means.
- **No `WorkItem`, `RegistryEntry` or `Hypothesis` record is written.** The
  brief gives the initial analysis's own records to iteration 5; this
  iteration commits `EntryAssignments` and nothing else, and its prompt
  package asks for no entry.
- **The baseline `B` of a run in the tests is `unavailable`.** The run tests
  give the harness a stubbed `ramify` for the reason above, so their baseline
  records that reason rather than a document. The real capture, with a real
  `ramify.measure/1` document, its hash and its components, is
  `measurement.test.ts`'s, which also runs a complete run over the real
  command line.
- **`ramify check --batch` is not run by a run in the test suite.** The
  captured `ramifyCheck` command is asserted in `run-policy.test.ts` and the
  form itself was exercised by iteration 2; a run test that ran it would add
  about three seconds to each of some forty runs. `testPolicy` takes
  `realRamifyCheck` for a test that wants it.
