# Plan 10: Acceptance scenarios

**Date:** 2026-09-23. **Status:** implemented on 2026-09-23; see [results](results.md).

The harness declares a plan done when its tests, its type check and a
complete Ramify check pass. None of those says whether the behavior the
person asked for exists. This plan implements the
[acceptance scenarios architecture](../../architecture/acceptance-scenarios.md):
Gherkin scenarios extracted from the plan or written by the initial
architect, frozen when the analysis is accepted, written into the owners'
test areas by the harness, bound by engineers' step definitions, and required
by every gate up to the final one.

The architecture document binds this plan. Its
[decisions of 2026-09-23](../../architecture/acceptance-scenarios.md#decisions-of-2026-09-23)
are not repeated here, and a section reference such as "architecture §7"
names the section of that document with that number. This plan adds what the
document leaves to its implementer: the iteration boundaries, the order that
keeps the suite green, the fixture work each iteration needs, the tests that
prove each rule and the exit of each iteration.

## Runnable outcome

```text
start-run with reviewStop on the collection-review fixture, scripted agents
  analysis accepted        -> scenarios sc-001.. recorded, text frozen
  awaiting-review          -> the analysis page lists each entry's scenarios
  approve-analysis         -> readiness: project-config, acceptance-runner,
                              baseline-acceptance, acceptance-full
  run branch               -> commit "Scenarios of <planId>" with the
                              feature files, each scenario @ramify-pending
  iterations               -> declare; iteration gates run the selected
                              scenarios in quick mode; bound -> declared
                              -> implemented
  integration scenario     -> an integration work item at the common
                              ancestor binds it through expose-test
  final gate               -> every module's features in full mode, none
                              pending
  Run page -> Scenarios    -> every tracked scenario with its state and gates
```

## Scope

**In scope:** everything the architecture document specifies, in its
[order of implementation](../../architecture/acceptance-scenarios.md#order-of-implementation),
split into eleven iterations below. That includes the collection-review
fixture's scenario harness, a scripted-agent trial across every stage, and the
glossary and architecture status edits the design names.

**Out of scope:** what the architecture's
[What v1 leaves out](../../architecture/acceptance-scenarios.md#what-v1-leaves-out)
lists, and:

- **Runs recorded before this plan.** As in Plan 9, readers require the new
  record versions (`initial-architect/2`, `gate-attempt/3`,
  `ramify-agent.project/1` captured in `job.json`); an older run is
  unsupported. No test or fixture reads a recorded run.
- **Plan 9's session model.** This plan is cut from `ramify-agent` without it;
  see [prerequisites](#prerequisites).
- **Moving the test and type-check commands into `ramify-agent.json`.** The
  file is designed to hold them later; v1 moves nothing else into it.
- **A symbol-free-load rule for testing source in Ramify.** Architecture's
  scenario check section leaves that to the toolkit; this plan only asks for
  named imports in the engineer's briefing.

## Prerequisites

1. `ramify-agent` at `2dd07d4` or later, with its type check and
   `npm run check:self` passing. Both pass in the plan's worktree at
   `2dd07d4`.
2. Each iteration works in the plan's one worktree, `/tmp/ramify-plan10`,
   on branch `feat/plan10-acceptance-scenarios`. The worktree is prepared
   once: the root `node_modules` is a symlink to the main checkout's,
   `npm --prefix ramify-agent ci` has run, the root `npm run build` has run,
   and `ramify-agent/node_modules/.bin/ramify` is linked by hand to
   `../ramify.ts/dist/src/ramify`, which `npm ci` skips before `dist/`
   exists. An iteration that changes `ramify-agent/package.json` runs
   `npm --prefix ramify-agent install` and commits the lockfile.
3. **Plan 9 is independent and unmerged** (`feat/plan9-session-model`). Both
   plans change `run/service.ts`, `run/log.ts`, `run/records.ts`,
   `projections/*`, `http/app.ts` and the web. Whichever merges second
   resolves the overlap. This plan adds events and fields; it renames and
   removes none, so its conflicts are additive.

## Rules for every iteration

- **Iterations run in order** in the one worktree. Each ends with one commit
  (or a few) on the branch and leaves the suite green: behavior outside the
  iteration's goal is unchanged, and every test the iteration's change
  invalidates is updated in the same iteration, not skipped.
- **Tests use doubles for external systems.** Agents are scripted; no test
  makes a real model call. Git is a scripted `GitService` where a run needs
  one (`subs/harness/src/tests/helpers/scripted-git.ts`), never a simulated
  repository. The Cucumber runner is a scripted command in harness lifecycle
  tests; the real `cucumber-js` runs only in the `scenarios` module's
  recording tests and in the executor's own integration tests, against a
  small project the test writes.
- **Verification per iteration** is focused: the iteration's new and changed
  test files, `npm run type-check` and `npm run check:self` from
  `ramify-agent/`. The complete suite runs only through the audits of
  [iteration 11](#iteration-11-trial-documents-and-audits).
- **Results.** Each iteration appends a section to
  [results.md](results.md): what it changed, its evidence, deviations from
  this plan with their reason, and open items.
- **Writing conventions** of the toolkit apply to prompts, documents and
  comments: a module exposes and the other side receives.

## Iterations

| Iteration | Delivers | Architecture |
| --- | --- | --- |
| 1 | The pure `scenarios` module | Where the code goes, row 1; §1 parsing; the scenario check's reducer and profile |
| 2 | Plan capture, submission `/2`, form rules, scenario records, the initial architect's briefing and procedure | §1, §2 |
| 3 | The review stop | §3 |
| 4 | The project configuration, two readiness steps, the fixture's configuration and scripts | §0, §4 rows 1–2 |
| 5 | The `scenarios` check kind in both runners; two more readiness steps | The scenario check; §4 rows 3–4 |
| 6 | Materialization, guarded and denied files, recovery | §5, §12 |
| 7 | Declarations and state transitions at every gate, completion and final rules | §7, §8, §9, §11 |
| 8 | Integration scenarios | §10 |
| 9 | Local architect and engineer briefings, procedures, diagnostics | §6, the scenario check's diagnostics |
| 10 | Projections, protocol, HTTP query, web | Records, events and projections |
| 11 | Scripted trial, the fixture plan's scenario, documents, audits | Order of implementation, step 8 |

### Iteration 1: The scenarios module

**Owner:** a new module `subs/harness/subs/scenarios`, with its
`module.ramify`, `README.md`, `src/` and `src/tests/`. It has no I/O and is
the one importer of `@cucumber/gherkin` and `@cucumber/messages`.

**Dependencies:** add `@cucumber/gherkin` `42.0.0` and `@cucumber/messages`
`34.2.0` to `ramify-agent`'s `dependencies`, the versions
`@cucumber/cucumber` `13.2.1` itself depends on, and `@cucumber/cucumber`
`13.2.1` to `devDependencies`, the version the fixture pins. The runner is
used only to record message streams and by the executor's integration tests.

**Work:** exported pure functions, each with the named types its signature
mentions exposed beside it to `parent`:

- **Extraction.** From a Markdown plan, every fenced block whose info string
  is `gherkin`, parsed without a runner: each `Scenario` or
  `Scenario Outline` becomes a plan scenario `ps-01`, `ps-02`, … in document
  order, with its line range in the plan, its name and its source lines. A
  `Background` is folded into each scenario of its block; an outline stays
  one scenario with its examples. A block that does not parse becomes a
  captured limitation with the parser's message and the block's lines, never
  an exception.
- **Form rules.** `validateScenarioForm(submission, planScenarios, entries)`
  implements rules 1–6 of architecture §2 in that order and returns the first
  rule broken with a message naming it, or the accepted form plus its
  warnings. Parsing a submitted `gherkin` value wraps it in a synthetic
  `Feature:`; whitespace normalization for rule 3 collapses runs of spaces and
  trims each line, and nothing else. The warning for a step that names an
  exported symbol or file path takes those names as an argument; the module
  never reads the view.
- **Records.** The `ramify-agent.scenario/1` schema of architecture's Records
  section, with the `sha256:` hash of the source lines, and a pure
  `assignScenarioIds` that numbers entry scenarios `sc-001`… in submission
  order and integration scenarios after them, computing each integration
  scenario's owner as the lowest common ancestor of its sub-scenarios' owners.
- **States.** A pure reducer from scenario events (`scenario-declared`,
  `scenario-due`, `scenario-implemented`, `scenario-withdrawn`) to the four
  states, rejecting every transition architecture's Events table does not
  list.
- **Rendering.** `renderFeatureFiles(records, states, run)` returns every
  tracked file's path and content per architecture §5: layout, header comment,
  feature name and description, the identity tag, the pending tag exactly for
  `pending` and `bound`, source lines verbatim. It is deterministic; the same
  input yields byte-identical output.
- **Profiles.** `buildScenarioProfile(module, mode, selection, config, attemptDir)`
  returns the profile module's text (architecture's scenario check section)
  and the argv to run, with `--dry-run` when asked. The tag expression is
  built from the selection kinds `identity`, `all-untagged` and `all`.
  Testing modules use `src/steps/` and `src/features/`.
- **Reducer of the message stream.** `summarizeScenarioRun(messages, tracked)`
  reads Cucumber's NDJSON message stream and returns the per-scenario part of
  `ScenarioCheckSummary`: status as the worst of the scenario's pickles, file,
  line, binding (step text to definition `uri:line`), failure step and
  message, `undefined` step texts, and untracked counts. Tracked scenarios are
  recognized by their identity tag.

**Recordings:** run the real `cucumber-js` once in development over a small
project written under the module's `src/tests/fixtures/`: passing, failing,
undefined, ambiguous, pending, an outline with a failing example, and a
dry run. Commit the NDJSON streams with a short note on how they were
recorded. The reducer's tests replay them; no test in this iteration starts
the runner.

**Tests:** extraction over the collection-review plans and a plan with
Background, Outline, two blocks and an unparsable block; one test per form
rule and per warning; ID assignment and LCA; every allowed and every rejected
state transition; rendering golden files and idempotence; profile text per
selection kind and module kind; the reducer over each recording.

**Exit:** the module's tests pass; `check:self` passes with the new module
and its exposure; nothing outside the module uses it yet.

### Iteration 2: Plan capture, the analysis submission and scenario records

**Owners:** `run/service.ts` (plan capture and the analysis briefing),
`analysis/submission.ts`, `analysis/accept.ts`, `analysis/records.ts`,
`run/records.ts` (a `scenarios/` layout entry), `run/log.ts`,
`run/snapshot.ts`, the initial architect's prompts, and the tests that
construct initial analyses.

**Work:**

- **Capture.** Where `input/plan.md` is written, extract the plan scenarios
  with iteration 1's function and record them, with the captured
  limitations, in the run record. The initial architect's briefing
  (`analysisMessage`) lists them by ID with text and plan lines, and the
  limitations. A plan without `gherkin` blocks says so in one line.
- **Submission `initial-architect/2`**, with `scenarios` and
  `integrationScenarios` as architecture §2 shows, and `refs` on an architect
  scenario. `validateInitialAnalysis` runs the form rules after its existing
  rules and rejects under the existing `rejectedSubmissionsPerTurn` bound.
  Version `/1` is no longer accepted.
- **Acceptance.** `analysis-accepted` commits one `ScenarioRecord` per
  scenario in the same transaction as the entries, hypotheses, registry and
  work items, and the warnings on the accepted analysis. The owner of an
  entry scenario is its entry's owner. Every state is `pending`.
- **Snapshot.** `counts.scenarios: { pending, bound, declared, implemented }`
  on `RunSnapshot`, derived with iteration 1's reducer.
- **Prompts.** The initial architect's system prompt and
  `initial-analysis.procedure.md` gain architecture §2's steps: read the plan
  scenarios first, match them to entries, decompose integration scenarios by
  picking steps verbatim and bridging, write scenarios for entries that have
  none. The prompt package version is bumped as `prompts/packages.ts`
  requires.
- **Tests that construct analyses.** Every scripted initial analysis in the
  suite gains one architect scenario per entry. Put the construction in the
  existing helpers so the change is one place per helper.

**Tests:** capture over plans with and without blocks and with an unparsable
block; a rejected submission per form rule through the real validation path,
counted against the per-turn bound; acceptance writing the records with IDs,
owners, hashes and integration owners; the snapshot counts.

**Exit:** a scripted run reaches `analysis-accepted` with scenario records;
every existing lifecycle test passes with the updated helpers.

### Iteration 3: The review stop

**Owners:** `interfaces/protocol/runs.ts`, `run/log.ts`, `run/snapshot.ts`,
`run/service.ts`, `run/records.ts`, `http/app.ts` (command acceptance only).

**Work:** architecture §3 as written:

- `start-run` gains `reviewStop: boolean`, default `false`, recorded in the
  `RunRecord`.
- With the stop, `analysis-accepted` is followed by `review-requested` and
  phase `awaiting-review`; the job stays `running` and keeps the lock, so a
  second `start-run` is `busy`.
- `approve-analysis { reviewer, note? }` records `analysis-approved` with
  `duringRun`. In the phase it continues to readiness. Without the stop, it
  is accepted at any point before `final-verification` and after completion,
  records the event and changes nothing else. A second approval is refused
  with a reason; approval of a failed or stopped run is refused.
- `stop-job` in the phase records `job-stopped`; the branch does not exist
  and the tree is untouched.
- Time between `review-requested` and `analysis-approved` is subtracted from
  the elapsed time `runAbsoluteMs` bounds. No invocation timeout changes.
- The run record and `RunSnapshot` report `review: not-reviewed` or
  `{ reviewer, at, duringRun }`.

**Tests:** a stop and approval; a stop and `stop-job` with a scripted Git
that records no branch or commit call; `busy` during the phase; approval
during a run without the stop and after completion; refusals; the budget
subtraction with the injected clock.

**Exit:** both paths pass; a run without the stop behaves as before.

### Iteration 4: The project configuration

**Owners:** a new `run/project-config.ts`, `run/records.ts` (schema beside the
run policy), `run/readiness.ts`, `subs/evidence` (reading the file),
`fixtures/collection-review`, and the test helpers that prepare projects.

**Work:**

- The `ramify-agent.project/1` schema of architecture §0, read at
  `start-run`, validated and captured into `job.json` beside the run policy.
  A missing or invalid file is not a `start-run` refusal; readiness reports
  it.
- Readiness steps `project-config` and `acceptance-runner` after
  `test-runner`, with the failures and reasons of architecture §4
  (`project-config-invalid`, `acceptance-harness-missing`). A `support` entry
  must match at least one file inside a module's test area, judged against
  the view; `npm run <script>` resolves when the script exists.
- **The fixture's scenario harness.** `fixtures/collection-review` gains
  `ramify-agent.json`, the scripts `acceptance:quick` and `acceptance:full`,
  and the conventional directories. Quick mode is the in-process
  `createTestSystem` the existing scenario uses. Full mode reaches the same
  system through a real transport on a loopback port, started by the world's
  hooks, with no browser and no `setup` or `teardown`. The world and hooks
  that step definitions in other modules build on sit where architecture §0
  puts them, at a common ancestor exposed to descendants with `expose-test`;
  the existing `integration-tests` scenario keeps passing. The fixture's
  real-checker guard (Plan 8 iteration 3) stays green, and the fixture's
  `test:cucumber` script stops being reported as an unsupported runner.
- Test projects written by helpers gain a minimal configuration, so existing
  lifecycle tests keep passing readiness.

**Tests:** schema acceptance and each rejection; the two steps' pass and
failure records; capture into `job.json`; the fixture guard.

**Exit:** a project without the file fails readiness with
`project-config-invalid`; the fixture passes both steps.

### Iteration 5: The scenarios check kind

**Owners:** `checks/checkpoint.ts`, `checks/records.ts`, `checks/verify.ts`,
`checks/gate.ts`, `checks/execution.ts` (the in-place runner),
`run/policy.ts`, `run/readiness.ts`, `run/records.ts`, and
`subs/harness/subs/audit/src/check-execution.ts` (the executor).

**Work:**

- `CheckCommandKind` gains `scenarios`; `GateAttempt` becomes
  `ramify-agent.gate-attempt/3` with `ScenarioCheckSummary` under the command
  record and the paths of the profiles it ran.
- `checkpointPolicies` plans the check per the scenario check's table:
  modules, mode, selection and strictness per checkpoint; an iteration or
  contract gate with no non-pending scenario in scope plans none and records
  `scenarios: none-selected`. Until iteration 7 no scenario is ever
  non-pending, so only the `all-untagged` and `all` selections occur at gates.
- Execution, in both runners: write each module's profile into the attempt's
  directory outside the worktree, rebase paths through the audit's existing
  path mapping, run the mode's command once per module in sequence through
  the evidence module's `runCommand`, with `setup` before the first run and
  `teardown` after the last, the timeouts of architecture (600 s quick,
  1,800 s full, summed for the attempt), and reduce the message stream with
  iteration 1's reducer. The check passes by the reducer's result, not the
  exit code alone; `undefined`, `pending` and `ambiguous` fail. ramify-audit's
  `CUCUMBER_SUMMARY_FILE` is not used.
- Readiness steps `baseline-acceptance` and `acceptance-full` after
  `acceptance-runner`, with the dry-run default.
- The gate's verdict treats a failed `scenarios` command like failed tests
  for repair routing (`checks/gate.ts`), until iteration 9 adds its
  diagnostics.

**Tests:** planning per checkpoint; execution with a scripted runner whose
streams are iteration 1's recordings; setup and teardown ordering and a
teardown after a failed run; timeouts; `none-selected`; one integration test
per runner that starts the real `cucumber-js` over a small written project,
once passing and once with an undefined step; readiness with `dry-run` and
`run`.

**Exit:** the fixture's readiness passes all four acceptance steps, and its
work-item and final gates run its existing scenario.

### Iteration 6: Materialization and guarded files

**Owners:** `run/service.ts` (after `createBranch`), `subs/evidence` (the git
calls), `work/scope.ts`, `subs/evidence/src/guarded-files.ts`,
`guard/write-guard.ts`, `run/log.ts`.

**Work:**

- After `readiness-passed` and `createBranch`, render and commit the feature
  files as "Scenarios of <planId>" with the `Ramify-Run` trailer and no
  `Ramify-Gate`, then record `scenarios-materialized { commit, files }`,
  before the first local architect starts. The commit is an effect with an
  intent line first, as gate commits are, and recovery finds it by its
  trailer.
- A general re-render: compute every tracked file's expected content from
  the current states, write the files that differ, and report whether a
  commit is needed. Recovery after a crash calls it.
- The tracked feature files join every assignment's guarded list with the
  hash of their expected rendering; the write guard refuses agent edit and
  write calls to them outright. `ramify-agent.json` and the files
  `acceptance.support` names join the guarded list in both places it is kept.

**Tests:** the commit's content, subject and trailers through the scripted
Git; idempotence of a second re-render; a crash between the commit and its
record, recovered by trailer; the write guard's refusal; a guarded-change
finding when a feature file differs at a gate.

**Exit:** a scripted run materializes the fixture plan's scenarios, and the
work-item gate still passes because every tracked scenario is pending.

### Iteration 7: Declarations and state transitions

**Owners:** `work/engineer.ts`, `work/submission.ts`, `run/service.ts`,
`run/log.ts`, `checks/checkpoint.ts` (selection by identity), the completion
and final rules.

**Work:** architecture §7, §8, §9 and §11:

- `completion-proposed` and `request-completion` gain `scenarios: string[]`,
  default empty. The acceptance rules for IDs and the rejections under the
  per-turn bound are §7's.
- At acceptance, each declared scenario becomes `bound` (open requirement or
  owed conformance) or `declared`, recorded as `scenario-declared`, and the
  re-render and commit follow the ordinary gate flow.
- Iteration and contract gates select `bound`, `declared` and `implemented`
  scenarios of the scope's owners by identity. On a pass, `declared` becomes
  `implemented`; a `bound` scenario records the attempt as its fake-backed
  pass.
- Withdrawal when a work item leaves the repair path without a pass:
  `scenario-withdrawn`, re-render, and the commit "Withdraw sc-NNN", recorded
  as an effect.
- `scenario-due` when `requirement-verified` closes a work item's last open
  requirement and no conformance is owed.
- `request-completion` is refused while an entry scenario of the item is
  `pending` or `bound`, after its own declarations apply. The work-item gate
  promotes the `declared` scenarios it passes; `work-item-completed` requires
  every entry scenario of the item `implemented`.
- The final gate's consistency rule `acceptance-incomplete`, and
  `job-completed`'s added requirement.
- Scripted agents in every lifecycle test that completes a work item declare
  their scenarios, and their iterations write passing step definitions or the
  scripted runner reports them passed.

**Tests:** every row of §7's table; rejected declarations; a `bound`
scenario through `requirement-verified` to `implemented` in the provider
order §8 describes; withdrawal by exhaustion, placement request and yield,
with the commit; a refused completion request; the final rule's failure with
evidence; an `implemented` scenario failing a later gate as a regression.

**Exit:** a scripted run on the fixture completes with every entry scenario
`implemented`.

### Iteration 8: Integration scenarios

**Owners:** `work/records.ts`, `run/service.ts`, `run/log.ts`, the local
architect's briefing for this origin.

**Work:** architecture §10. On the `scenario-implemented` that implements the
last sub-scenario, the harness creates a work item with origin `integration`
and the scenario's ID, at the scenario's owner, queued behind the current
item; `work-item-started` carries the origin. Its local architect is briefed
with the scenario, its sub-scenarios, their owners and those owners' step
files. The engineer's scope is the ancestor with the children on the paths to
the sub-scenarios' owners. A failure of the integration scenario while its
sub-scenarios pass is reported as a composition failure naming the
sub-scenario whose bridging Given is suspect. The final gate cannot complete
around an open integration work item.

**Tests:** creation at the right event and owner; queueing; the briefing's
contents; a composition failure's finding; a scripted run with one
integration scenario to completion, where the ancestor's step file imports
the sub-scenarios' step files through `expose-test` and the real checker
accepts it.

**Exit:** that scripted run completes with the integration scenario
`implemented`.

### Iteration 9: Briefings, procedures and diagnostics

**Owners:** `src/prompts/*` for the local architect and engineer,
`work/session.ts`, `work/engineer.ts`, `work/assignment.ts`,
`work/engineer-equipment.ts` (`run_scope_tests`), `checks/diagnostics.ts`.

**Work:** architecture §6 and the scenario check's diagnostics:

- The local architect's briefing: a section per entry scenario of its work
  item. Its procedure's step 5 changes as §6 states.
- `assignment.scenarios?: string[]`, informative, shown to the engineer under
  "Scenarios to bind".
- The engineer's briefing: each scenario of its entry that is not
  `implemented`, with text, file, state and §6's three rules, and the request
  for named imports of another owner's step files. Provider work items say
  nothing about scenarios.
- `run_scope_tests` also runs the scenario check for its scope in quick mode,
  selecting the scope's scenarios by identity, including pending ones.
- Repair briefings and the local architect's gate section carry per failing
  scenario its name, file, line, failing step, message and undefined step
  texts, and the binding of each passed scenario.
- Prompt package versions are bumped.

**Tests:** briefing contents per role and origin; `run_scope_tests` with a
scripted runner; the diagnostics rendered from a recorded failing stream.

**Exit:** the briefings' tests pass and the prompt versions are recorded.

### Iteration 10: Projections, protocol and web

**Owners:** `projections/progress.ts`, `projections/queries.ts`,
`interfaces/protocol/runs.ts`, `http/app.ts`, `subs/web`, the root's
`module.ramify` for any new protocol symbol it re-exposes.

**Work:**

- Capability progress gains `scenarios: { implemented, total }` per entry.
- `GET /api/v1/plans/:planId/runs/:runId/scenarios` lists every tracked
  scenario with its state, origin, entry, file and the gates it ran in, with
  its schema in the protocol.
- The web: a Scenarios section on the run page; the review section on the
  analysis page, showing an integration scenario's text beside its
  sub-scenarios and the warnings; the `Approve` action; the `reviewStop`
  option on `start-run`.

**Tests:** the projection and query over a scripted run's records; the
protocol contract test; web tests for the three views and the two commands.

**Exit:** the query and the views pass their tests; `check:self` accepts the
new exposure.

### Iteration 11: Trial, documents and audits

**Work:**

- **The fixture plan's scenario.** `plans/status-badge-tone/plan.md` gains a
  `gherkin` block under its Acceptance section stating the plan's first two
  acceptance bullets as scenarios. Tests that read the fixture plans are
  updated.
- **A scripted-agent trial** across every stage, on a copy of the fixture:
  review stop and approval, the four readiness steps, materialization, a
  declaration while a requirement is open, `scenario-due`, a withdrawal, an
  integration work item, and the final gate in full mode with the real
  `cucumber-js`. Its test records the event sequence and the final states.
- **Documents.** Add the architecture's Terms to the
  [glossary](../../glossary.md); set the architecture's status to implemented
  with this plan's reference; apply the edits the analysis's "What this
  changes" section lists that belong to this project's documents; update
  `docs/README.md`.
- **Audits** of the final implementation commit: the ramify-agent suite
  request (`audit/ramify-agent-suite.request.json`, per
  [its README](../../../audit/README.md)) and the repository root cucumber-viz
  audit. Record both in [results.md](results.md).
- **One real pi run** on `status-badge-tone` is development evidence, not a
  gate. It is a long, paid run, so it waits for Dan's go-ahead after the
  audits and is recorded in the results when it happens.

**Exit:** both audits pass on the final implementation commit.

## Acceptance

| ID | Criterion | Evidence |
| --- | --- | --- |
| AS01 | Plan scenarios are extracted, and form rules 1–6 reject with the rule named | Iteration 1 and 2 tests |
| AS02 | Scenario records are committed at acceptance and never change afterwards | Iteration 2 tests; iteration 11 trial |
| AS03 | The review stop holds the lock, leaves the tree untouched and subtracts its time | Iteration 3 tests |
| AS04 | Readiness fails a project without a valid configuration or scenario harness, and passes the fixture | Iterations 4 and 5 |
| AS05 | Each gate plans the scenario check of the architecture's table and passes only by the message stream's strict result | Iteration 5 tests |
| AS06 | Feature files are rendered purely, committed once, re-rendered idempotently, and guarded | Iteration 6 tests |
| AS07 | Every state transition of the events table, and no other, occurs at its event | Iterations 1 and 7 tests |
| AS08 | An integration scenario is bound by an integration work item through `expose-test`, accepted by the real checker | Iteration 8 test |
| AS09 | Briefings and diagnostics carry what §6 and the scenario check specify | Iteration 9 tests |
| AS10 | The scenario list, the review section and the approve action are served and shown | Iteration 10 tests |
| AS11 | A scripted run on the fixture completes with every scenario `implemented` and passing in full mode | Iteration 11 trial |
| AS12 | Both audits pass on one commit | results.md |

## Review decisions

Choices this plan made where the architecture is silent. Each can be revisited
without changing the architecture:

1. **Cucumber versions:** `@cucumber/gherkin` `42.0.0` and
   `@cucumber/messages` `34.2.0`, the pair `@cucumber/cucumber` `13.2.1`
   uses, so the recorded streams and the parser agree with the fixture's
   runner.
2. **The fixture's full mode** is a real loopback transport without a
   browser. `setup` and `teardown` are covered by the executor's tests over a
   written project, not by the fixture.
3. **The initial architect's prompts change in iteration 2**, not with the
   other briefings in iteration 9, because form rule 4 rejects every
   submission without scenarios from the moment `/2` is required.
4. **The fixture's scenario harness lands in iteration 4**, not at the end,
   because readiness fails a project without one from that iteration on.
5. **Approval is refused twice or after failure and stop.** The architecture
   accepts it "by a run that is already complete"; a second approval or one
   on a failed or stopped run is refused with a reason.
