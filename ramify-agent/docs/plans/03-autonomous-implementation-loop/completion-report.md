# Plan 3 completion report

**Date:** 2026-09-21. **Status:** implemented and verified with the scripted
agent; **not shown with a real model.** Iterations 0 to 12 are delivered,
each with its results note. The composition gate's final run reports **45 of the 46
acceptance cases met**. The one it does not meet is T2, the real pi trial,
which did not run because there is no pi login here. T4 is met only in the
sense the gate checks, that the review sheet exists; its verdict belongs to
the person.

Completion gate item 1, the runnable outcome with a real pi session, is
**not met**. The loop has run end to end in a browser on the scripted agent
(iteration 11). It has run end to end on the fixture's real toolchain on the
scripted agent (the two trials of iteration 12). **It has never run with a
model.** Plan 3 is not complete until a person supplies a pi login and T2
runs; [What the person must do](#what-the-person-must-do) says how.

The iteration results hold the detail:
[0](iterations/iteration0-results.md), [0B](iterations/iteration0b-results.md),
[1](iterations/iteration1-results.md), [2](iterations/iteration2-results.md),
[3](iterations/iteration3-results.md), [4](iterations/iteration4-results.md),
[5](iterations/iteration5-results.md), [6](iterations/iteration6-results.md),
[7](iterations/iteration7-results.md), [8](iterations/iteration8-results.md),
[9](iterations/iteration9-results.md), [10](iterations/iteration10-results.md),
[11](iterations/iteration11-results.md) and
[12](iterations/iteration12-results.md). The trials and the
[review sheet](trial/review-sheet.md) are under [trial/](trial/).

## Completion gate

| # | Gate item | Result |
| ---: | --- | --- |
| 1 | The runnable outcome works end to end in a browser, with a real pi session, on `review-notes`: a run started, watched, completed, and its decisions, work, checks and progress read. | **Not met.** No pi login exists here ([NOT-RUN.md](trial/review-notes/NOT-RUN.md)); no pi session ran and nothing was simulated in its place. What has run: the Run page in a real browser against a scripted-agent run, including closing and reopening the page with the run unaffected (iteration 11, section 5). The same loop also ran with the scripted agent over the fixture's real toolchain (T3 and `status-badge-tone`, below). Neither is a model. |
| 2 | A run completes with no client connected, and a client attached afterwards reads the same state and events. | **Met.** C1, `run-protocol.test.ts`: the run is driven with no server; a client attached afterwards reads the snapshot and every event page, line for line, and the same answers after two restarts. The browser check of iteration 11 showed the same with a page closed during the run. |
| 3 | Every acceptance-matrix case has passing executable evidence, and the composition suite runs them together. | **Partially met.** `scripts/composition-gate.ts --with-trials` ran all 31 owning test files and both fixture trials in one Vitest run. Its final run reports 45 of 46 cases met, every one of the 59 named test titles passing (output in [iteration 12's note](iterations/iteration12-results.md#17-the-composition-gate)). **T2 is not met:** there is no pi login. **T4 is met by the gate only because the review sheet exists.** The sheet is recorded, and the person's verdict on it is open. T1 is met with an explicit exception: 28 union values have no producer (see [Union values without a producer](#union-values-without-a-producer)). |
| 4 | The target project's source is changed only within recorded write scopes; every change outside one is visible in `outsideScope` and in the evaluation projection. | **Met for the runs that ran, with the limits stated.** `live-trial.ts verify` over both trials: `status-badge-tone` changed 2 paths and T3 changed 20, every one inside a recorded write scope. Nothing was outside a scope, there were 0 defects and `git status` was clean. X6 and `unguarded-write.test.ts` prove the other half: a shell write outside the scope appears in `outsideScope` and in the evaluation. Three limits apply. `edit` and `write` are guarded, and `shell` is only observed. Neither trial used the shell or a model. An explicitly broad scope that names the root module covers the whole project (review sheet, observation 3). |
| 5 | ramify-agent passes `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`. | **Met.** Run last, after every change ([iteration 12, part 2](iterations/iteration12-results.md#22-exit-evidence)): type check exit 0; 86 files passed and 1 skipped (87), 661 tests passed and 2 skipped (663); the build succeeded; `check:self` passed with complete coverage, 7 owners, 218 source files, 3438 accesses, 0 findings. |
| 6 | The completion report records the trials, the measured sizes after the plan, the boundaries that have since earned themselves, the limitations found, and the review sheet for the person's verdict. | **Met, with the verdict open.** This report and the [review sheet](trial/review-sheet.md). The sheet's questions and verdict are blank for the person. |

### The four trial cases

| # | Case | Result | Evidence |
| --- | --- | --- | --- |
| T1 | The scripted fake supplies deterministic state, failure and recovery coverage | **Met, with 28 recorded exceptions to the union rule.** | `composition.test.ts` and the three `composition-recovery*.test.ts` files: 35 recovery rows over SM1–SM10, 14 composed scenarios, every query over every composed run with no event appended. No pi, no network. All passed in the composition gate |
| T2 | A real pi end-to-end non-breaking feature with a consumer, delegation, provider and verification on return | **Not met.** | Not run: no pi login ([NOT-RUN.md](trial/review-notes/NOT-RUN.md)). P1, P3 and P4 prove the delegation path on the scripted agent over `review-notes`; that is not T2 |
| T3 | The breaking path on a controlled fixture with globally green iteration boundaries | **Met on the scripted agent, over the real toolchain.** Every *breaking* boundary carried a passing all-project gate. The first, non-breaking boundary carried a scoped `iteration` gate, as the plan's checkpoint table prescribes | Run `20260921T075217Z-236cd4` in [trial/reviewer-identity/](trial/reviewer-identity/): three accepted iterations (ordinary, breaking, breaking), six gate attempts, six passes, `job-completed`, 0 verification defects. The agent's own check found the whole project green at all three accepted commits. **It shows the harness carrying a staged break, not a model staging one** |
| T4 | Human review of the decisions, work, checks and metrics is recorded, with no review wait in execution | **Partially met.** The sheet exists and the trial record and observations are filled in; the verdict is the person's | [trial/review-sheet.md](trial/review-sheet.md) |

### Departures the plan asked this report to record

- **No separate acceptance check at the final gate** (Dan, 2026-09-20). The
  final gate runs all project tests, the type check and a complete Ramify
  check. A feature's acceptance becomes tests its entry work item writes.
  Whether the feature is what the person asked for is the person's review
  afterwards.
- **T3 ran with the scripted agent.** The matrix and the brief ask for the
  real fixture, with all project tests green at every accepted boundary. They
  name a real pi session only for `review-notes`. Part 1 read that as a
  scripted-agent run over the real fixture toolchain, and that is what ran.

## Defects found

| Found by | Defect | Fix |
| --- | --- | --- |
| The composition suite (iteration 12, part 1) | **Production.** Four `RunPolicy` limits (`invocationIdleMs`, `invocationAbsoluteMs`, `maxInvocationsPerRun`, `runAbsoluteMs`) were captured in `job.json` and never enforced; the union values that report them had no producer | `subs/harness/src/run/service.ts`, with `run-bounds.test.ts` (6 tests). The only production change of iteration 12 |
| The T3 trial (iteration 12, part 2) | **Test only.** The trial's final assertion that no caller of `reviews.run` omits the reviewer matched correct calls and refusal tests by substring, and failed a run whose state was correct | `fixture-trials.test.ts`: every call site must name a reviewer or be asserted refused. Verified to flag all 9 omitting callers at the fixture's baseline and none at the final state |

`composition-gate.ts` ran first time with no script fault and found no
further defect. Earlier iterations recorded their own defects in their notes;
iteration 3 of Plan 1 recorded the last real-model one.

## Union values without a producer

Cross-cutting rule 2, "every union value has a producer and a test, or it is
not offered", is **not fully met**. The composition suite walks 108 unions
and 443 values. 343 are produced by a composed run, 58 by a named test and
14 by a projection of a produced record value. **28 have no producer.** The
suite carries them on an explicit list with reasons, and it fails if the list
hides a new gap or outlives a closed one. Each value, and what it would need:

| Union | Values | Why none | What it would need |
| --- | --- | --- | --- |
| `iteration-closed.outcome` | `superseded` | Only the `evidence-reopened` transaction writes a superseded result, never `iteration-closed` | Remove it from the event's schema, or close a superseded assignment through `iteration-closed` |
| `job-failed.reason` | `inputs-changed` | `RunInputs.changes` is never called; a changed plan or source is never a failure | A decision whether a run checks its inputs; if so, a caller and a test; if not, removal |
| `job-failed.reason` | `internal` | Written only for inconsistent states the service never reaches from its own records | A test that constructs one (a missing prompt package, an assignment without an outline) |
| `job.agent` | `pi` | No pi session ran | T2 |
| `InfrastructureRecovery.cause` | `in-scope`, `invalid-session`, `outside-assignment`, `guarded-change`, `unknown`, `session-lost` | Only readiness writes a recovery; gate retries and session reconstruction record elsewhere | Narrow the field to readiness's causes, or write a recovery record for gate retries and reconstructions |
| `InfrastructureRecovery.action` | `reconstruct-session`, `none` | Reconstruction is recorded on the invocation; an unrecoverable failure records no recovery | Same decision as the row above |
| `InvocationOutcome.interruption` | `provider-error` | A provider error arrives as a failed session outcome | Map a provider error to it, which needs a real provider to show one, or remove it |
| `GateAttempt.commands[].kind` (and its query) | `conformance` | A conformance suite runs inside the tests command through `extraSuites` | A separate conformance command, or removal |
| `GateAttempt.commands[].selection.policy` (and its query) | `all-project` | An all-project checkpoint attaches no `TestSelection` | Attach one, or remove the value |
| `GateAttempt.cause` (and its query) | `invalid-session` | A lost session is detected before the gate and recorded on the invocation | Removal, or a gate that can observe it |
| `IterationAssignment.kind` | `integration` | Not assignable and nothing creates it | Removal, or a design for integration iterations |
| `scope.extra[].purpose` | `consumer` | The consumer is a contract scope's base | Removal |
| `scope.extra[].kind` | `file` | The default, written by absence | Write it explicitly, or accept absence as the representation |
| `evidenceObligations[].against` | `fake` | The contract gate resolves the fake suite at the gate, not on the assignment | Removal, or record it on the contract assignment |
| `IterationAssignment.gate.checkpoint` | `readiness`, `work-item`, `final` | An assignment's checkpoint is only `iteration`, `contract` or `breaking-iteration`; the field shares `GateAttempt`'s vocabulary | A narrower type for the assignment's field |
| error code | `inputs-changed` | Plan 1's stale-approval answer; approval was removed | Removal, or the input check above |
| error code | `internal` | An unexpected exception or a lost lock; no test provokes either | A test of each |

Most are dead vocabulary from the proposal, or fields that share a wider
vocabulary than their writer uses. One (`pi`) needs T2. The person decides
between producers and removal.

## What the person must do

1. **Supply a pi login and run T2.** Either log in with `npx pi` and
   `/login`, or export a provider key for the command, as Plan 1 did with an
   OAuth token the person exported themselves. No credential was taken from
   anywhere else. Then follow
   [NOT-RUN.md](trial/review-notes/NOT-RUN.md). **Know before you start:** a
   run is never resumed in place (iterations 6 and 11 considered a resume
   command and kept it out). The forced restart after contract registration
   will therefore end that run `interrupted`, and verification on return has
   to come from a second run over the tree the first left. If T2 is meant to
   show one run that survives the restart and completes, that needs a resume
   design first. The same run also settles whether a real provider accepts a
   `z.toJSONSchema` union discriminated on `kind`, which has been open since
   iterations 0 and 3.
2. **Give the review verdict** on the [review sheet](trial/review-sheet.md):
   the decisions, the work, the checks and the metrics of the two trials.
3. **Settle nested-package discovery: depth 4 or 5.** The plan says 4; the
   implementation walks to 5, because the plan's own readiness fixture
   `subs/workspace/subs/catalog/tools/` is one level deeper than 4
   (iteration 4, deviation 5). Unsettled since.
4. **Decide the 28 producerless union values**: producers or removal, per
   the table above.
5. **Decide whether an explicitly broad scope that names the root module
   may cover the whole project** (review sheet, observation 3).
6. **Decide where the Cucumber gap belongs.** It is recorded per engineer
   invocation; the plan says every gate, and `GateAttempt` has no field for
   it.

## Hand-off to the next plan

What exists, and where:

- **The run.** `subs/harness/src/run/service.ts` drives SM1–SM10 from one
  log, `plans/<plan>/.harness/jobs/<run>/events.jsonl`, through
  `harness/ledger`; record files are materialized copies. Every log write goes
  through `RunService.write`, every agent session through
  `RunService.runInvocation`, every external effect (the gate commit, the
  parent brief) through the ledger's `effect`.
- **The records** are the [core records proposal](core-records.proposal.md)'s,
  with the revisions each results note records. The schemas are in
  `run/records.ts`, `analysis/records.ts`, `work/records.ts`,
  `work/iterations.ts`, `architecture/records.ts` and `contracts/records.ts`.
- **The protocol** is `subs/harness/src/interfaces/protocol/runs.ts`, exposed
  to the parent with the `browser` tag and re-exposed by the root to `web`:
  `start-run` and `stop-job`, the run queries of the plan's table, the event
  page and the error codes, with `unsupported-version` added.
- **The agent port** is `subs/harness/subs/agent/src/interfaces/port.ts`, with
  iteration 0's contract: session modes, `appendContext`, the guard and
  `afterMutation`, context and compaction events, `edit`/`write`,
  `settled()`, `reachedTool`. pi 0.85.1 implements it in `agent/pi`; the
  scripted fake in `agent` emits every event.
- **The gate** is `runGate` in `checks/gate.ts`, one function with one caller,
  kept so for the standalone commit-audit tool that is to replace its body.
- **The trials** are `fixture-trials.test.ts` (env-gated) and
  `scripts/live-trial.ts prepare|verify`, which a real pi trial uses too.
- **The composition gate** is `scripts/composition-gate.ts` over
  `acceptance-evidence.json`.

What the next plan should start with: T2 and the real-model questions of
iteration 0 (schema acceptance, stringified envelopes, correction bounds in
practice, measured context budgets). Then the module candidates below, and
the person's decisions above.

## Measured sizes, before and after

`ramify measure --format json`, revision
`rev/1:024012f3-f3b4-4002-8dc7-2c886f887702:10`, views measured; the document
is [`iterations/iteration12-evidence/measure-part2.json`](iterations/iteration12-evidence/measure-part2.json).
The before column is the main plan's
["Measured sizes"](main-plan.md#measured-sizes). Bytes; files / bytes.

| Owner | Exact production, before | Exact production, after | Subtree production, before | Subtree production, after | Exact tests, before | Exact tests, after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `ramify-agent` | 2 / 5,007 | 2 / 5,040 | 47 / 241,188 | 109 / 1,046,304 | 1 / 1,694 | 1 / 1,694 |
| `ramify-agent/harness` | 28 / 156,355 | **80 / 842,550** (+11 resources, 41,565) | 31 / 183,867 | 94 / 976,573 | 15 / 109,845 | 71 / 941,744 |
| `ramify-agent/harness/agent` | 2 / 11,406 | 2 / 32,276 | 3 / 27,512 | 3 / 60,932 | 1 / 4,879 | 4 / 28,063 |
| `ramify-agent/harness/agent/pi` | 1 / 16,106 | 1 / 28,656 | 1 / 16,106 | 1 / 28,656 | 2 / 24,147 | 8 / 69,278 |
| `ramify-agent/harness/evidence` | — (new) | 6 / 47,604 (+1 resource) | — | 6 / 47,604 | — | 7 / 27,676 |
| `ramify-agent/harness/ledger` | — (new) | 5 / 25,487 | — | 5 / 25,487 | — | 12 / 47,887 |
| `ramify-agent/web` | 14 / 52,314 | 13 / 64,691 (+1 resource, 10,960) | 14 / 52,314 | 13 / 64,691 | 7 / 36,513 | 6 / 30,669 |

**The harness's own source grew 5.4 times, and the plan's two extractions
did not contain it.** `harness`'s exact production went from 28 files and
156,355 bytes to 80 files and 842,550 bytes. The two children the plan
created hold 73,091 bytes between them, 7% of the harness subtree. The plan
chose to keep workflow coordination, checks, obligations and KPIs in the
harness's own `src/` as directories, and to create no broad container. Its
open risk, "the harness's own source grows large even after two extractions",
has occurred. By directory, from the files themselves:

| Directory of `harness/src/` | Files | Lines | Bytes | Share |
| --- | ---: | ---: | ---: | ---: |
| `run/` | 13 | 7,308 | 333,504 | 40% |
| of which `run/service.ts` | 1 | 4,410 | 208,103 | 25% |
| `work/` | 9 | 2,025 | 93,763 | 11% |
| `projections/` | 8 | 1,608 | 77,212 | 9% |
| `contracts/` | 9 | 1,343 | 58,643 | 7% |
| `kpi/` | 5 | 1,026 | 49,473 | 6% |
| `architecture/` | 5 | 1,042 | 47,631 | 6% |
| `interfaces/` | 7 | 1,062 | 43,815 | 5% |
| `checks/` | 5 | 754 | 33,714 | 4% |
| `analysis/` | 3 | 485 | 20,594 | 2% |
| `http/`, `jobs/`, `prompts/` (TS), `hooks/`, `guard/`, `store/`, `tools/`, `plans/` | 16 | 1,983 | 84,201 | 10% |

One file, `run/service.ts`, is a quarter of the harness. Every state machine's
driver was added to it, iteration by iteration, because every log write and
every invocation had to pass through the one `RunService`.

## Module candidates inside `harness`

Measured by directory, with the import edges between directories read from
the source (the harness's directories are not modules, so the architect view
cannot show those edges). **None was extracted.** Each is a brief for a
follow-up plan.

### Earned: `checks`, the gate engine

| Evidence | Value |
| --- | --- |
| Source | `checks/`: 5 files, 754 lines, 33,714 bytes |
| Imports | Node and `harness/evidence` (`runCommand`, `guardedFilesHash`, the view readers) only. Nothing from any other harness directory |
| Consumers | `run/` (9 imports), `work/` (4), `contracts/` (1) |
| Knowledge hidden | Verifying a checkpoint's commands and selections before running any; the closed `not-verified` reasons; deriving `cause` from exit codes, timeouts and runner errors, never from output; resolving a `TestSelectionPolicy` against the current tree; the `GateAttempt` shape |
| Why now | It is already independent. The plan fixes `runGate` as one function with one caller, so that a standalone commit-audit tool can replace its body. That is a boundary by design, and it is a directory |
| What would cross | `runGate`, `GateAttempt` and its vocabulary (`Checkpoint`, `GateCause`, `GateNext`, `NotVerified`), `CheckCommand`, `TestSelection`, `TestSelectionPolicy`, `resolveTestSelection`, exposed to the parent |

### Earned, small: `guard`, write-target resolution

| Evidence | Value |
| --- | --- |
| Source | `guard/`: 2 files, 195 lines, 8,982 bytes, including the lifted `resolve-contained-path.ts` |
| Imports | Node only |
| Consumers | `run/` (7 imports), `work/` (2) |
| Knowledge hidden | Resolving a target or its nearest existing ancestor, traversal and symlinks, `blocked-scope` against `blocked-unresolved` |
| Against | It is small, and extraction buys little navigation; the plan deferred it for that reason. It has earned independence, not size |

### Not yet earned

- **`run/service.ts` is a split inside the harness, not an extraction.** It
  holds the drivers of every state machine. The first follow-up is to
  separate it by state machine behind the one `RunService` writer, before any
  boundary is drawn around it.
- **`analysis/`, `architecture/`, `work/`, `contracts/` and `run/` form a
  cycle.** Each of the four imports `run/records.ts` (`RecordRef`,
  `planRefSchema`, `moduleProposalSchema`, the invocation schemas) and
  `run/submissions.ts` (`validateAgainst`, the one rule-10 judge), and `run/`
  imports all four. The cycle runs through shared record vocabulary, not
  through behavior. Moving those two files out of `run/` is the precondition
  for any of these directories to become a module.
- **`projections/` (77,212 bytes) and `kpi/` (49,473 bytes)** are pure read
  sides with one external consumer (`http/`, through the queries). Each reads
  the records of six or seven directories. As child modules they would need
  the harness to expose its record types to its descendants. Revisit after the
  record vocabulary is separated.
- **`jobs/`** is 5 files and 16,104 bytes. Plan 1's trigger, a second job
  kind, never fired. It stays.

## Known limitations

### Guarded tools and observed activity

- **`edit` and `write` are guarded**: resolved against the recorded write
  scope before they run, a denial mutates nothing, and every call is a
  `guard` observation. **`shell` is not guarded.** Its writes are observed only
  after the fact, through `git status` when the writer settles, in
  `InvocationOutcome.outsideScope`, and as the `unguarded-shell` coverage gap.
  **Zero blocked calls is not evidence that every write respected its
  scope** (iteration 7). `guardingReport` states that on every evaluation.
- **`Settlement.groupsKilled` is 0 by construction** (iteration 7): a shell
  command's process group is not registered with the writer, because the
  lifted executor's wrapper is the group leader and registering the spawned
  process would kill the harness. The shell settles through the executor.
  A zero there does **not** mean that no runaway process group existed.
  `WriterOwnership.register` has no production caller.
- An excursion by an invocation that never mutates is recorded but never
  reminded (iteration 7, deviation 4).
- A `hook-check` observation is not deduplicated across a replay; nothing
  replays one today (iteration 7).
- The settlement snapshot is lost if the harness is interrupted between the
  release and the read of the tree; recovery records `observation-truncated`
  (iteration 7).
- An explicitly broad scope that names a module resolves to its whole
  directory, so naming the root covers the whole project (review sheet,
  observation 3).

### Recovery and runs

- **A run is never resumed in place.** A run without a terminal event is
  `interrupted` on load, its records re-materialized and its unfinished
  effects performed, and then it stops. Iterations 6 and 11 considered a
  resume command and kept it out. Every recovery row proves
  re-materialization without duplicates and without an agent call, not
  continuation. An interrupted fork, contract or iteration is repeated by the
  next run, not by recovery.
- A stopped run whose stop grace is shorter than an invocation's own closing
  ends with `writer-released` and `job-stopped` and **no `invocation-ended`**
  for the stopped invocation (seen with the tests' 500 ms grace; iteration 12
  part 1). Not investigated further.
- `RunInputs.changes` is never called: a changed plan or source is never an
  `inputs-changed` failure.
- A baseline `B` is measured only when the view was published before the
  first snapshot; a real trial's is, because the server's inputs materialize
  the view first (iteration 12, part 1).
- `maxPlacementRequests` is enforced and has no test (iteration 8).
- `superseded` iteration results are produced by the reopening transaction
  in a direct test; no uninterrupted run leaves an assignment unfinished for
  it (iteration 9, part 2).
- An unplaced capability escalates to the requesting work item's architect,
  not directly to the global architect: the harness cannot author a
  placement request (iteration 9, deviation 1).
- **Nested-package discovery walks to depth 5, not the plan's 4**
  (iteration 4, deviation 5). Unsettled.
- A torn log line was never produced by a real crash: across 12 kills none
  tore. The torn path is covered by construction at every byte offset
  (iteration 0B).

### Checks and the fixture

- **The fixture's Cucumber suite is outside the one supported runner.**
  `test:cucumber` runs no gate. Its `unsupported-runner` gap is recorded on
  engineer invocations, not on gate attempts, as the plan's text requires. In
  T3 the agent ran the suite by hand at the final commit and it passed.
- Test discovery applies Vitest's default patterns rather than the project's
  configuration; a project with a narrower custom `include` could disagree
  (iteration 6).
- The first iteration of a staged break is `ordinary`, so its boundary is a
  scoped gate, not an all-project one; only breaking boundaries run the whole
  project.

### Port behaviors from iteration 0

Iteration 0 reported **no behavior unavailable**: 12 verified, 4 verified
with a limitation. The limitations stand:

- **Context observation** (probe 6): pi's `tokens` is itself an estimate; after
  a compaction it is `null` until the next reply, and `null` is never room.
- **After-mutation observation** (probe 11): the `tool_result` hook never fires
  for a call the guard blocked; the guard observation is the record.
- **Cancellation and settlement** (probe 12): `abort()` does not wait for a
  descendant process; settlement is the harness's.
- **Invalid tool input** (probe 16): pi validates and coerces before the
  harness sees a call. **Whether a real provider accepts a `z.toJSONSchema`
  union discriminated on `kind` has never been tested.** Open since
  iterations 0 and 3. The submission tool keeps the permissive schema until
  it is.

Also from iteration 3: the live `appendContext` route is verified one step
short of the model input at the port (probe 4 verified it in the SDK). pi has
no producer for compaction reasons `manual` and `overflow`, and no shipped
implementation reports an observation unavailable.

### KPIs

- **Deferred:** owner, seam and reuse drift, and the knowable-share
  assessment. The initial and final views and the entry assignments are
  retained so they can be computed later.
- **Unmeasured:** the context thresholds per role are a policy, not a
  measurement. Iteration 12 was to measure them, and cannot without a model.
  Every token, cache and context metric of the two trials is `unavailable`,
  because the scripted agent reports none. Real-model cost, correction rates
  and budget returns are unknown.
- `reduction-factor` is an inverse scope-byte ratio, not measured token
  savings; `B` and `S_s` are byte baselines, not the source-line `S0`.

### Toolkit observations

- `ramify stop` is not a command of the installed CLI. A view's dependency
  facts are verified by reading `_meta.json` for `dependencies: measured`.
- The daemon's wait-limit behavior after a structural change (Plan 1)
  still shapes how views are refreshed; the harness uses a private daemon.
- A resident daemon must never analyse a temporary project, and every test
  and trial uses a private daemon it disposes of, or `--batch`.
- `subs/harness/src/.ramify/` and `subs/harness/src/tests/.ramify/` are stale
  generated views, unread by `check:self`.
