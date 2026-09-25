# Acceptance scenarios: the v1 architecture

**Date:** 2026-09-23. **Status:** implemented by
[Plan 10](../plans/10-acceptance-scenarios/main-plan.md); see its
[results](../plans/10-acceptance-scenarios/results.md).

**Where the implementation differs from this text.** The results record
every deviation; these change what the document says:

- The log has three events beyond the events table:
  `scenarios-materializing` and `scenarios-withdrawing`, the intents of the
  harness's own commits, and `scenario-bound-passed { scenario, gate }`, a
  bound scenario's pass against its fakes, which changes no state.
- The harness's own commits carry `Ramify-Scenarios` beside `Ramify-Run`:
  `materialized` on the feature files' commit, `withdrawn-<n>` on the run's
  nth withdrawal. The materialization commit is an accepted boundary; a
  withdrawal commit is not, and a withdrawal of bound scenarios alone makes
  no commit.
- The integration work item is committed with the `scenario-implemented`
  that makes it due; `work-item-started` marks its turn and carries its
  `origin` and `scenario`.
- `acceptance-incomplete` is a run failure checked before the final gate,
  not a rule of the final attempt.
- The untracked counts are `{ passed, skipped, failed }`.
- The run's `review` is derived from `analysis-approved`, not stored in
  `job.json`; an approval is refused twice, or after a failure, a stop or an
  interruption.

This document turns the
[acceptance scenarios analysis](../analysis/2026-09-23-acceptance-scenarios.md)
into one design for the first step: Gherkin scenarios tied to the plan's
top-level capabilities, and gates that require them before work is declared
done. It has no red, green, refactor model and no refactor step; both are
later work. Dan's decisions of 2026-09-23 bind it. Where the analysis left a
proposal open, this document chose, and Dan decided each choice the same day;
[the decisions](#decisions-of-2026-09-23) are collected at the end. The
document is the input of the plan that implements it.

It is written against the harness as it stands at `9197d62`: the states,
records and files it names are the code's, and the analysis's `awaiting-review`
and `unresolved` run states do not exist there yet.

## The design in one page

- **The plan's scenarios are extracted by the harness** when the plan is
  captured, from its fenced `gherkin` blocks. The initial architect assigns
  each one to an entry or decomposes it, and writes scenarios for every entry
  that has none. The harness verifies the form of that assignment.
- **Scenario text freezes when the analysis is accepted.** In v1 no agent
  adds, changes or removes a scenario after that point. A design that
  conflicts with a scenario is reported through the existing `unresolved`
  submission, which fails the run with evidence.
- **The review stop is a run phase**, `awaiting-review`, entered after the
  analysis is accepted when `start-run` asks for it. Nothing has been written
  to the source tree at that point, so a stop there leaves the repository as
  it was. Approval is a command that records who approved and when; it can
  also be sent during a run started without the stop.
- **The harness materializes the feature files** on the run branch once
  readiness has passed, in each entry owner's `src/tests/features/<planId>/`,
  from its own records. Materialization is a pure function of the records
  and the scenario states, so it is idempotent and any drift is a guarded
  change.
- **Every tracked scenario has one of four states:** `pending`, `bound`,
  `declared`, `implemented`. The `@ramify-pending` tag marks the first two in
  the source. Only the harness moves a state and only the harness edits a
  feature file.
- **An engineer declares** the scenarios its iteration bound, in its
  completion proposal. A local architect may declare scenarios that existing
  step definitions already bind, in its completion request. The next gate
  verifies every declaration strictly.
- **A declaration made while the work item has an open requirement** makes
  the scenario `bound`, not `declared`: it passed against a fake. It becomes
  `declared` by itself when the item's last requirement is verified.
- **One Cucumber run per owner module, in the target project's own scenario
  harness.** A project configuration file, `ramify-agent.json`, declares the
  command of each execution mode and the support code that loads the world,
  hooks and driver. A run imports that support code and one module's step
  files and runs that module's feature files, so a scenario binds only to
  definitions its owner wrote or imported. Sharing a definition with another
  owner is an ordinary testing import, exposed with `expose-test`, which
  Ramify verifies. Iteration gates run the scope's owners with scenarios
  selected by identity tag; work-item gates run every module with untagged
  scenarios in quick mode; the final gate runs them all in full mode.
- **An integration scenario gets a work item at the common ancestor** once
  its sub-scenarios are implemented. Its engineer imports the sub-scenarios'
  step definitions there, through `expose-test`, and a composition failure is
  that work item's to resolve.
- **The harness reads Cucumber's message stream itself**, as a registered
  check inside ramify-audit, and derives each scenario's result and the step
  definitions that bound it.
- **A plan is finished** when every tracked scenario, integration scenarios
  included, is `implemented`, carries no pending tag, matches its recorded
  text, and passes in full mode at the final gate, beside the project's
  tests, its type check and a complete Ramify check.

## Terms

They are defined in the [glossary](../glossary.md).

| Term | Definition |
| --- | --- |
| Scenario | One Gherkin `Scenario` or `Scenario Outline` the harness tracks as a requirement of the plan. |
| Plan scenario | A scenario written in the plan, extracted by the harness. Its authority is the plan's. |
| Architect scenario | A scenario the initial architect writes for one entry. Its authority is the person's review. |
| Entry scenario | A scenario assigned to exactly one entry capability. Every plan scenario that is not an integration scenario, and every architect scenario, is one. |
| Integration scenario | A plan scenario that combines several entries. It has sub-scenarios, and an integration work item at their owners' common ancestor binds it once they are implemented. |
| Sub-scenario | An entry scenario the architect derived from an integration scenario, ideally by picking its steps verbatim. |
| Bridging Given | A `Given` in a sub-scenario that replaces another entry's action with the state it leaves. |
| Step definition | The TypeScript that Cucumber matches a step's text to. Agents write step definitions; they never write scenarios. |
| Binding | The set of step definitions a run matched to a scenario's steps, read from Cucumber's message stream. A run loads only the owner's step files, so every binding definition is one of them or reachable from their imports. |
| Scenario harness | The target project's world, driver, hooks and the two scripts that run scenarios in quick and full mode. |
| Execution mode | `quick` or `full`, fixed for one run of the runner and never written into a scenario. |
| Identity tag | `@ramify-sc-NNN`, the tag that names one tracked scenario in the source. |
| Pending tag | `@ramify-pending`, the tag that keeps a scenario out of every run that does not select it by identity. The harness manages it. |

## What v1 leaves out

- A red, green, refactor model; observing a scenario's red phase; any
  requirement that a scenario fail before it passes. A correction's
  reproduction, which must, belongs to the
  [refactoring and debugging analysis](../analysis/2026-09-23-refactoring-and-debugging-plans.md).
- Guarding step definitions once their scenario passes. Step files grow
  across iterations, so a file hash cannot tell a weakened assertion from a
  new step. The local architect's assessment is the v1 control.
- Scenarios an agent proposes during the run. Edge cases beyond the plan go
  in the engineer's own tests.
- Revising the analysis with a note at the review stop, and continuing a
  stopped run's branch.
- Composition duties for the integration work item beyond binding its one
  scenario and repairing what that binding reveals.
- Scenario names in the architect view's `tests.jsonl`.
- Parallel Cucumber workers, module-scoped selection in ramify-audit, and
  reuse of a gate's scenario results by a later gate.
- A project without a scenario harness. Readiness fails it, as it fails a
  project without Vitest today.

## The run, stage by stage

The whole run, with the additions in bold:

```text
start -> capture the plan, its scenarios included
      -> initial analysis: entries, hypotheses, scenarios per entry
      -> analysis accepted: scenario text frozen
      -> awaiting review, when asked for; approve or stop
      -> readiness: baseline, plus the scenario harness and its baseline
      -> run branch; feature files materialized and committed
      -> work items: iterations bind and declare; gates verify
      -> final gate: every scenario, full mode, none pending
      -> completed
```

### 0. What the target project provides

The scenario harness is the target project's, as decided. The project
declares it in a configuration file, `ramify-agent.json`, beside
`package.json` and `module.ramify`. The harness reads nothing else about the
project's scenarios, and the file holds only what the harness cannot derive.

```json
{
  "schema": "ramify-agent.project/1",
  "acceptance": {
    "support": [
      "src/tests/support/world.ts",
      "src/tests/support/hooks.ts"
    ],
    "modes": {
      "quick": { "command": ["npm", "run", "acceptance:quick", "--"] },
      "full": {
        "command": ["npm", "run", "acceptance:full", "--"],
        "setup": ["npm", "run", "acceptance:server:start"],
        "teardown": ["npm", "run", "acceptance:server:stop"],
        "readiness": "dry-run"
      }
    }
  }
}
```

| Field | Meaning |
| --- | --- |
| `acceptance.support` | The files Cucumber imports before any step file, in order: the world constructor, the hooks, the driver. Globs are allowed. They are ordinary testing source of the module whose test area holds them. |
| `acceptance.modes.<mode>.command` | The argv that starts `cucumber-js` in that mode, with the mode's environment and loader, such as `TEST_MODE` and `--import tsx`, and passes the arguments the harness appends through to it. Both `quick` and `full` are required. |
| `acceptance.modes.<mode>.setup`, `teardown` | Optional. Run once per gate attempt before the mode's first run and after its last, so a server or a database started for full mode serves every module's run. Without them, each run starts what its hooks start. |
| `acceptance.modes.full.readiness` | `dry-run`, the default, or `run`: whether readiness executes full mode or only loads it. See [readiness](#4-readiness). |
| `setup` | Optional. The project's setup commands, such as its build, in order: each `{ name?, command, cwd?, timeoutMs?, env? }`, where `command` is a non-empty argv, `cwd` a directory inside the project relative to its root (the root by default), `timeoutMs` a positive bound (ten minutes by default) and `env` names and values added to the command's environment. Every gate runs them before its other commands; see [setup commands](#setup-commands). |
| `typeCheck.output` | Optional. The format the type check prints; `tsc` is the only one. Where it is declared, a failed type check at a gate is attributed by where its errors lie: every error inside the assignment's write scope makes the failure the engineer's to repair, and any error outside makes it `outside-assignment`. Without it, or where the output is truncated, holds a line the gate cannot read or names no error, a failed type check is attributed by which commands failed. |

What the harness derives without configuration:

| Convention | Rule |
| --- | --- |
| Step definitions | Under a module's `src/tests/steps/`, or a testing module's `src/steps/`. The harness imports these directories for every module of the architect view. |
| Feature files | Under a module's `src/tests/features/`, or a testing module's `src/features/`. The harness collects these for every module and writes the plan's files beneath them. |
| Shared step definitions | A step definition lives in the module whose scenarios it binds. A module that needs another owner's definitions imports them by name from a step file that owner exposes with `expose-test`, re-exposed along the path as any testing symbol is. ESM evaluates a file once per process, so the definitions register once. A step text defined twice within one run is `ambiguous` and fails the gate. |
| World and driver | Exposed to descendants through `expose-test`, so step definitions in any module build on them under ordinary Ramify rules. |

The project's own Cucumber profile, `cucumber.js` or a variant, is not read.
The harness passes a profile of its own with `--config`, so a gate's run does
not depend on what the project's profile adds, such as an HTML report written
into the worktree, a `--parallel` setting or a `@wip` filter. A project that
runs its scenarios by hand keeps its profile for that.

A project whose outside is a CLI or an API provides a driver for that; the
harness never sees the driver. Quick and full mode are the project's
definitions, as in cucumber-viz's template applications: JSDOM against an
in-process router with an in-memory database, and a real browser against a
running server.

The configuration file is read at `start-run`, validated against its schema,
captured into `job.json` beside the run policy, and guarded like
`package.json`: an agent's change to it is a guarded change. The file is
designed to hold later settings, such as the test and type-check commands the
policy hardcodes today; v1 moves nothing into it that this design does not
need. A project whose type check is `tsc` may declare so:

```json
{
  "schema": "ramify-agent.project/1",
  "typeCheck": { "output": "tsc" },
  "acceptance": { "...": "as above" }
}
```

The gate then reads `tsc`'s error lines, in its plain form
`path(line,col): error TSnnnn: message` or its pretty form
`path:line:col - error TSnnnn: message`, and passes over blank and indented
lines, the pretty form's code excerpt and summary, npm's `> ` banner and its
`npm error`, `npm ERR!` and `npm warn` lines. Each path is read relative to
the command's working directory.

#### Setup commands

A project whose tests need a build output the repository ignores, such as
`dist/`, declares the commands that make it:

```json
{
  "schema": "ramify-agent.project/1",
  "setup": [
    { "name": "build", "command": ["npm", "run", "build"], "timeoutMs": 900000 },
    { "command": ["npm", "run", "build"], "cwd": "packages/ui", "env": { "NODE_ENV": "production" } }
  ],
  "acceptance": { "...": "as above" }
}
```

Every gate runs them first, in order, as commands of kind `setup`, recorded,
announced with `gate-command-started` and shown like any other command; a
setup command named `build` is shown as the build. Readiness and a
standalone session's gate run them in place at the project root, and
readiness records them as its `baseline-setup` step. A committing gate
forwards them to ramify-audit: its `nodejs` preparation links the installed
dependencies of the project and of each nested package into the worktree of
the committed revision, then runs the commands there, their output captured
beside the attempt and published with the audit's evidence.

Once a setup command has not passed, no later command of the gate runs, and
each is recorded as not verified for that reason, never as a selection that
found nothing. A setup command that ran and exited non-zero fails the
attempt: after readiness passed, the change since the last passing state is
the assignment's own, so the failure is `in-scope` and the engineer repairs
it, briefed with the command, its exit code and the end of what it printed.
A work-item or final gate follows its own next step. One that timed out,
could not start or was stopped is infrastructure, and takes the bounded
retry. At readiness, a setup command that exits non-zero fails readiness
with the end of its output and no recovery; one that timed out is rerun.

The `collection-review` fixture needs the configuration file, a full mode and
the two scripts; its quick mode is the in-process `createTestSystem` its one
existing scenario already uses. Its `test:cucumber` script stops being
reported as an unsupported runner once the file names the acceptance modes.

### 1. Plan capture

The harness already copies the plan to `input/plan.md`. It now also parses
every fenced code block whose info string is `gherkin`, with the Gherkin
parser and no runner, and records each scenario it finds as a plan scenario
`ps-01`, `ps-02`, and so on, in document order, with its `PlanRef` by line
range. A `Background` in a block is folded into each of its scenarios, as
Cucumber's own pickles fold it; a `Scenario Outline` stays one scenario with
its examples. A block that does not parse is a captured limitation, listed in
the architect's briefing and in the run record, never a failure: the plan is
the person's and the harness never edits it.

The initial architect's briefing lists the plan scenarios by ID, with their
text and references. A plan with no `gherkin` block has none, and the
architect writes every scenario.

### 2. Initial analysis

`InitialAnalysisSubmission` becomes `initial-architect/2` and gains one array:

```yaml
scenarios:
  - key: send-email                 # unique within the submission
    entry: send-customer-email       # an entry of this submission
    origin: { kind: plan, planScenario: ps-01 }   # or { kind: architect }
    gherkin: |                       # the Scenario block, tags excluded
      Scenario: A customer receives the email
        Given a customer with the address ada@example.com
        When the user activates email sending
        Then the customer ada@example.com receives one email
  - key: history-lists-sent-email
    entry: email-history
    origin: { kind: architect }
    partOf: ps-02                    # a sub-scenario of a plan scenario
    gherkin: |
      Scenario: Sent emails appear in the history
        Given an email to ada@example.com was sent
        When the user opens the email history
        Then the history lists one email to ada@example.com
integrationScenarios:
  - planScenario: ps-02
    subScenarios: [send-email, history-lists-sent-email]
```

**Form rules.** `validateInitialAnalysis` rejects the submission, under the
existing `rejectedSubmissionsPerTurn` bound, with a message naming the first
rule broken:

1. Every `gherkin` value parses as exactly one `Scenario` or `Scenario
   Outline`, with at least one step and no tags. Tags are the harness's.
2. Every scenario names an entry of the submission; no scenario names two.
3. Every plan scenario appears exactly once: as the origin of one entry
   scenario, or as one integration scenario with at least one sub-scenario.
   A plan scenario's `gherkin` is compared with the extracted text after
   whitespace normalization and must match; the plan's text is the
   requirement, not a paraphrase of it.
4. Every entry has at least one scenario.
5. Every step of an integration scenario appears verbatim, keyword and text,
   in one of its sub-scenarios. Bridging Givens are steps of a sub-scenario
   that appear in no integration scenario; they are exempt because the rule
   runs the other way. The analysis's escape for steps an
   existing step definition already covers is not in v1: it needs a runner
   dry run, and readiness has not verified the runner yet. Such a step is
   picked verbatim into a sub-scenario, and its existing definition binds it
   there.
6. Every `acceptanceRefs` entry of every entry is cited by at least one
   scenario, through `origin.planScenario` or an explicit `refs` list on an
   architect scenario. The analysis lists this rule with the others.

**Warnings**, recorded on the accepted analysis and shown in the review, never
rejections: a step that names an exported symbol or a file path the architect
view records; a sub-scenario none of whose steps came from its integration
scenario; more than one architect scenario per entry with identical steps.

**Acceptance.** `analysis-accepted` commits, beside the entries, hypotheses,
registry and work items, one `ScenarioRecord` per scenario with a sequential
ID `sc-001`, `sc-002`, and so on, in submission order, and the integration
scenarios after the entry scenarios. Each record holds its kind, entry, owner,
origin, sub-scenarios or parent, name, source lines and a hash of those lines.
An integration scenario's owner is the lowest common ancestor of its
sub-scenarios' owners. Text is frozen from here on.

The analysis procedure for the initial architect gains the corresponding
steps: read the plan scenarios first, since their `When` steps name what the
outside does; match them to entries; decompose integration scenarios by
picking steps verbatim and bridging what a slice removed; write scenarios for
entries that have none, with an abstract interaction and concrete data the
plan states or implies, and no module, symbol or deeper capability.

### 3. The review stop

`start-run` gains `reviewStop: boolean`, default `false`. The web sends it;
nothing else changes in the command.

With the stop, `analysis-accepted` is followed by `review-requested`, and the
run's phase becomes `awaiting-review`. The job state stays `running`, so a
second `start-run` is `busy` and the project lock is held, as the analysis
requires. Two commands leave the phase:

| Command | Payload | Effect |
| --- | --- | --- |
| `approve-analysis` | `{ reviewer: string, note?: string }` | `analysis-approved`; the run proceeds to readiness. |
| `stop-job` | unchanged | `job-stopped`. The branch does not exist yet and nothing was written to the tree. |

Time between `review-requested` and `analysis-approved` is subtracted from
the run's elapsed time for `runAbsoluteMs`. No invocation is live, so no
invocation timeout is affected.

`approve-analysis` is also accepted during a run started
without the stop, at any point before `final-verification`, and by a run that
is already complete. It records the same event and changes nothing else. The
run record and the snapshot report `review: not-reviewed` until then, and
`review: { reviewer, at, duringRun: boolean }` afterwards. That answers the
analysis's fifth open question: a person who reviews while the run works
reviews the same frozen text an approval would have judged, so the records
may say so.

The review shows, per entry, its scenarios with their origin and, for an
integration scenario, the person's text beside the sub-scenarios derived from
it, with the warnings of the analysis. The web page for the run's analysis
gains that section; the records are enough for it.

### 4. Readiness

Readiness gains four steps, in this order after `test-runner`:

| Step | Verifies | On failure |
| --- | --- | --- |
| `project-config` | `ramify-agent.json` exists and validates against `ramify-agent.project/1`; every `support` entry matches at least one file inside a module's test area. | `readiness-failed`, reason `project-config-invalid`, with the schema's message. Not a code-repair assignment. |
| `acceptance-runner` | `node_modules/.bin/cucumber-js` exists; each mode's `command` resolves, which for `npm run <script>` means the script exists. | `readiness-failed`, reason `acceptance-harness-missing`, after the usual recoveries. |
| `baseline-acceptance` | One quick run per module with feature files, with `not @ramify-pending`, over the project's existing scenarios, passes strictly. | As `baseline-tests`. The plan's feature files are not written yet, so this is the project's own regression acceptance. |
| `acceptance-full` | With `readiness: dry-run`, the full-mode command with `--dry-run`, once per module, loads every step file and reports no `undefined` or `ambiguous` step. With `readiness: run`, the same runs execute and pass strictly. | As `baseline-tests`. A dry run runs no hook and no `setup`, so a full mode that starts servers costs nothing under the default. |

The default is the dry run because executing full mode costs a browser and a
database for a baseline the final gate will establish anyway, and the dry run
catches the likeliest defect, a step file that does not load under full mode.
A project whose full mode is cheap, or whose runs are long enough that a
broken full mode must be found first, sets `run`.

### 5. Materialization

Once readiness has passed and the run branch exists, the harness materializes
the feature files and commits them, before the first local architect starts:

```text
readiness-passed -> createBranch -> materialize -> commit "Scenarios of <planId>"
                 -> scenarios-materialized { commit, files } -> working
```

The commit carries the `Ramify-Run` trailer and no `Ramify-Gate`; nothing
ran over it, and the attempt history says so by having no attempt. It is the
one commit of a run that is neither a gate's nor a withdrawal's.

**Layout.** One file per entry, in the entry owner's test area, and one file
per common ancestor for integration scenarios:

```text
<owner>/src/tests/features/<planId>/<entry-slug>.feature
<ancestor>/src/tests/features/<planId>/integration.feature
```

A testing module's test area is its `src/`, so its files go beneath
`src/features/<planId>/`. The plan ID in the path keeps a later plan's entry
of the same name apart, and makes each file's provenance visible.

**Content**, rendered by one pure function of the records and states:

```gherkin
# Written by ramify-agent for plan send-customer-email, run 20260923T1200Z-1a2b3c.
# The scenarios are the plan's requirements. Agents never edit this file;
# step definitions bind it from src/tests/steps/. @ramify-pending marks a
# scenario the harness has not yet declared due.

Feature: send-customer-email
  A user activates email sending for a customer, and that customer receives
  one email.

  @ramify-sc-001 @ramify-pending
  Scenario: A customer receives the email
    Given a customer with the address ada@example.com
    When the user activates email sending
    Then the customer ada@example.com receives one email
```

The feature name is the entry's capability slug and the description its
recorded description. Scenario source lines are written verbatim from the
record. The identity tag is `@ramify-` followed by the scenario ID. The
pending tag is present exactly when the scenario is `pending` or `bound`.

**Idempotence.** Every later change to a feature file is a re-rendering: the
harness computes the expected content of every tracked file from the current
states, writes the files that differ, and commits. Recovery after a crash
does the same. A file whose content differs from its expected rendering at a
gate is a guarded change, so the tracked feature files join the guarded list
of every assignment with the hash of their expected rendering, and the write
guard refuses agent edit and write calls to them outright.

`ramify-agent.json` joins the guarded list, in both places it is kept, and
so do the files named by `acceptance.support`. The project's own Cucumber
profiles stay guarded as `cucumber.js` is today, although no gate reads them.

### 6. A work item

The local architect's briefing gains a section per entry scenario of its work
item: ID, state, text, file path and, for a sub-scenario, the integration
scenario it came from. Its procedure changes in one place. Step 5, "a goal a
module already meets needs no iteration", becomes: a goal a module already
meets still needs its scenarios bound; where existing step definitions bind
them, declare them with the completion request; otherwise assign an iteration
that writes the step definitions.

`assignment` gains an optional `scenarios: string[]`, the scenario IDs the
iteration is expected to bind. It is informative: it puts the text in the
engineer's briefing under "Scenarios to bind", and the harness never requires
that the engineer declare exactly those.

The engineer's briefing carries, for each scenario of its work item's entry
that is not `implemented`, the text, the feature file's path, the state, and
three rules: write step definitions in `src/tests/steps/` of a module within
the write scope; never edit a feature file; declare a scenario only once its
steps are defined and pass in quick mode, which `run_scope_tests` can show it
by running the scenario check for its scope. Provider work items have no
scenarios, and their briefings say nothing about them.

### 7. Declaring, and the iteration gate

`completion-proposed` gains `scenarios: string[]`, default empty, and so does
`request-completion`. Both are declarations. The harness accepts a
declaration when every ID names an entry scenario of this work item's entry
that is `pending` or `bound`; an `implemented` or `declared` ID is accepted
and ignored, so a repeated submission is harmless. An unknown ID, another
entry's scenario or an integration scenario is a rejected submission with the
reason, under the existing per-turn bound.

At acceptance, each declared scenario moves:

| Work item has an open requirement, or owes a conformance | New state | Pending tag |
| --- | --- | --- |
| Yes | `bound` | Kept |
| No | `declared` | Removed |

Then the gate runs as today: the harness compares guarded files, re-renders
the feature files, commits, and the audit runs the checkpoint's checks over
that commit. The scenario check is one of them, described
[below](#the-scenario-check). For the `iteration` and `contract` checkpoints
it selects, by identity tag, every scenario in state `bound`, `declared` or
`implemented` whose owner is one of the scope's owners, and runs them strictly
in quick mode. A `bound` scenario therefore runs although it carries the
pending tag, because the selection names it.

On a pass, every `declared` scenario of the gate becomes `implemented`
(`scenario-implemented { scenario, gate }`), and every `bound` one stays
`bound` with the attempt recorded as its fake-backed pass. On a failure the
ordinary repair rounds apply, and the scenario stays where it is while they
run. When the work item leaves the repair path without a pass, by exhaustion,
a placement request or a yield, every `declared` or `bound` scenario that has
not passed a gate since its declaration is withdrawn to `pending`
(`scenario-withdrawn { scenario, reason }`), the files are re-rendered, and a
commit "Withdraw sc-003" restores the tag at once. Restoring it at the next
gate instead would leave an untagged failing scenario in the tree for the next
gate that runs its owner.

An `implemented` scenario never returns to `pending`. When it fails a later
gate it fails that gate, as any regression does.

### 8. Providers, fakes and bound scenarios

A consumer's first iteration usually binds its scenarios against the fake it
implements against, and the fake stands until the provider conforms and a
verification iteration passes. The `bound` state records exactly that
situation instead of refusing the declaration and asking a later engineer to
repeat it. Decided by Dan, 2026-09-23: a declared scenario keeps its pending
tag while it would run against a fake, and the tag is removed only when it
would run without one.

When `requirement-verified` closes the last open requirement of a work item,
and no conformance is owed, the harness moves every `bound` scenario of that
item to `declared` (`scenario-due { scenario, cause: requirements-verified }`).
The next commit removes their tags and the next gate runs them untagged. In
the common order that is the work item's own gate, since the verification
iteration's gate is what produced `requirement-verified`; the scenario has
then run twice against the real provider, once selected as `bound` and once
as `declared`, and `implemented` is the second.

### 9. Work-item completion

`request-completion` is refused, with the existing refusal path and bound,
while any entry scenario of the item is `pending` or `bound`. Its own
declarations are applied first, so a completion request that declares the
last scenario is not refused for it. The `work-item` gate then runs every
module that has feature files, one quick run each with `not @ramify-pending`,
strictly, and every `declared` scenario it passes becomes `implemented`.
`work-item-completed` requires every entry scenario of the item
`implemented`, beside what it requires today.

Those runs include the project's own scenarios and every earlier work item's
implemented ones, so each work-item gate is also the regression acceptance of
the whole project in quick mode.

### 10. Integration scenarios

An integration scenario is `pending` until every sub-scenario is
`implemented`. At the `scenario-implemented` event that makes that true, the
harness creates an **integration work item** at the scenario's owner, the
lowest common ancestor of the sub-scenarios' owners, with the goal of binding
that one scenario. It is a work item like any other, with origin
`integration` and the scenario's ID in place of an entry capability, and it
queues behind the current work item, since work items run one at a time.

Its local architect assigns an engineer whose scope is the ancestor with the
children on the paths to the sub-scenarios' owners included. The engineer
writes a step file at the ancestor that imports, by name, the step files the
sub-scenarios' owners wrote, adds the `expose-test` declarations along each
path, and declares the scenario. The verbatim rule guarantees that those
imported definitions bind every step, so the ancestor's file defines no step
of its own; bridging Givens occur only in sub-scenarios. The iteration gate
runs the ancestor's feature files with the scenario selected by identity, the
scenario becomes `implemented` on a pass, and the work item completes at its
own work-item gate.

Decided by Dan, 2026-09-23: a module's step definitions live in that module,
and definitions another module needs, such as an integration scenario's, are
shared through the testing tag. That decision is why v1 has this work item.
The analysis had deferred it, with the composition failure returned to
whichever work item's gate found it; sharing through `expose-test` needs an
agent's work at the common ancestor, so the work item exists, in this minimal
form: one per integration scenario, created when it becomes due, with no
other composition duty.

When the scenario fails while its sub-scenarios pass, it is a composition
failure: a bridging Given assumed what the real behavior does not do. The
finding names the sub-scenario whose Given it is. The failure is this work
item's to resolve through the ordinary repair rounds, then the local
architect's placement and delegation paths, or `unresolved`. The run cannot
complete around it: the work item must complete like every other.

### 11. The final gate

The `final` checkpoint runs every module's feature files in full mode, one
run per module, with no tag filter and strictly. Its harness rules require
that no tracked scenario is `pending`, `bound` or `declared` before the run.
Once every work item has completed, integration work items included, that
rule cannot fail; it is kept as a consistency rule, and its failure,
`acceptance-incomplete`, fails the run with evidence rather than returning
anywhere. `job-completed` then requires, beside its present conditions, every
tracked scenario `implemented` and the final attempt's scenario check passed
in full mode.

### 12. Stop, crash and recovery

- **A stop during `awaiting-review`** leaves the repository untouched; the
  run's records stay under `plans/<planId>/.harness/jobs/<runId>/`.
- **A stop later** leaves the feature files committed on the run branch with
  their tags as the states were. Continuing from that branch is future work.
- **A crash between a state change and its commit** is recovered by
  re-rendering: the states are in the ledger, the rendering is pure, and the
  commit is retried. `scenarios-materialized` and each withdrawal commit are
  recorded as effects with an intent line first, as gate commits are, so a
  crash between the commit and the record finds the commit by its trailer.
- **A crash during the scenario check** is the audit's interrupted attempt,
  as today, and the retry audits the same commit.

## The scenario check

One new check kind, `scenarios`, planned by `checkpointPolicies` beside
`tests`, `type-check` and `ramify-check`, and executed by the same registered
executor under an ID such as `check-03-scenarios`. Readiness plans it through
the in-place runner.

| Checkpoint | Mode | Modules run | Selection within each run | Strict |
| --- | --- | --- | --- | --- |
| `readiness` | quick | every module with feature files | `not @ramify-pending` | yes |
| `iteration`, `contract` | quick | the scope's owners that have non-pending scenarios | identity tags of those scenarios | yes |
| `breaking-iteration`, `work-item` | quick | every module with feature files | `not @ramify-pending` | yes |
| `final` | full | every module with feature files | everything | yes |

An iteration or contract gate whose scope holds no non-pending scenario plans
no scenario check and records `scenarios: none-selected`; an empty selection
is not a failure there, unlike an empty test selection.

**One run per module.** A run imports the configured support files and one
module's step files, and runs that module's feature files. Nothing else is
loaded, so a scenario can bind only to definitions its owner wrote or
reached through an import, and those imports are what Ramify verifies. The
runs of one attempt execute one after another; `setup` and `teardown` of the
mode, when configured, run once around them.

**The profile and the command.** For each run the harness writes a Cucumber
profile into the attempt's directory, outside the worktree, and runs the
mode's configured command with it. Both are built from the captured
configuration and the refreshed architect view, and the audit's existing path
mapping rebases them into its worktree:

```js
// <attempt-dir>/scenarios/subs-customers.profile.mjs, written by the harness
export default {
  import: [
    'src/tests/support/world.ts',               // acceptance.support, in order
    'src/tests/support/hooks.ts',
    'subs/customers/src/tests/steps/**/*.{ts,js}',   // this module's step files
  ],
  paths: ['subs/customers/src/tests/features'],  // this module's feature files
  tags: '<expression>',
  strict: true,
  format: ['message:<attempt-dir>/scenarios/subs-customers.ndjson'],
};
```

```text
<acceptance.modes.<mode>.command> --config <attempt-dir>/scenarios/<module>.profile.mjs [--dry-run]
```

A testing module's step and feature directories are its `src/steps/` and
`src/features/`. `cucumber-js` loads the project's own default profile only
when no `--config` is given, so nothing of it reaches a gate; the configured
`support` entries are the whole of what the project contributes to a run
beyond the mode's command. Each profile is recorded with the attempt, so
what a gate ran is readable afterwards. Timeouts: 600 s per quick run,
1,800 s per full run, and the attempt's bound is their sum over the modules
run, plus `setup` and `teardown`.

**The result.** The executor reads the message stream, not the exit code
alone, and answers the audit and the attempt with a `ScenarioCheckSummary`:

```yaml
mode: quick
selection: { kind: identity, scenarios: [sc-001, sc-003] }   # or all-untagged, all
excluded: 4                 # tracked scenarios the pending tag kept out
runs:
  - { module: subs/customers, exit: 0, profile: scenarios/subs-customers.profile.mjs, messages: scenarios/subs-customers.ndjson }
scenarios:
  - id: sc-001
    run: subs/customers
    status: passed          # passed | failed | undefined | pending | ambiguous | skipped
    file: subs/customers/src/tests/features/send-customer-email/send-customer-email.feature
    line: 9
    binding:
      - { step: "Given a customer with the address ada@example.com", definition: "subs/customers/src/tests/steps/customers.steps.ts:12" }
    failure: { step: "Then ...", message: "..." }             # when failed
untracked: { passed: 11, failed: 0 }   # the project's own scenarios, by count
```

A scenario's status is the worst of its pickles. The check passes when every
run exited zero, every selected tracked scenario `passed` and every untracked
scenario passed. `undefined`, `pending` and `ambiguous` are failures;
`--strict` already makes the runner say so, and the reducer says which
scenario.

**Binding is recorded, not policed.** Each scenario's `binding` names the
file of every definition that bound a step. A definition outside the owner's
own step files reached the run through an import, which Ramify verified; the
local architect sees it in the gate section, which is enough for v1. One gap
belongs to Ramify rather than the harness: a symbol-free import of another
owner's step file loads it without exposure under the source interpretation
rules, so the engineer's briefing asks for a named import, and a rule on
symbol-free loads of testing source is the toolkit's to add if it matters.

**Diagnostics.** The engineer's repair briefing and the local architect's
gate section carry, per failing scenario, its name, file and line, the failing
step, its message and, for `undefined`, the step text with no definition. The
attempt keeps the full stream at `output.path`.

**ramify-audit's own Cucumber summary** (`CUCUMBER_SUMMARY_FILE`, which treats
`undefined` as a passing warning) is not used. The harness is a registered
executor and reports its own summary, so the strict rule holds whatever the
library would infer. That settles the sixth open question without a spike.

## Records, events and projections

**Record** `ramify-agent.scenario/1`, at `scenarios/<id>.json`, immutable:

```yaml
schema: ramify-agent.scenario/1
id: sc-001
kind: entry            # entry | integration
entry: send-customer-email   # null for integration
owner: subs/customers        # LCA of the sub-scenarios' owners for integration
origin: { kind: plan, planScenario: ps-01, ref: { lines: [42, 47] } }  # or { kind: architect, refs: [...] }
partOf: null           # sc-004 for a sub-scenario
subScenarios: []       # for integration
name: A customer receives the email
source: [ "Scenario: A customer receives the email", "Given ...", "When ...", "Then ..." ]
hash: sha256:...
file: subs/customers/src/tests/features/send-customer-email/send-customer-email.feature
```

**Events**, one line each in `events.jsonl`, and the states a pure reducer
derives from them:

| Event | Data | Transition |
| --- | --- | --- |
| `analysis-accepted` | now also commits the scenario records | all `pending` |
| `review-requested` | | phase `awaiting-review` |
| `analysis-approved` | `reviewer`, `note`, `duringRun` | phase `readiness`, or no phase change during a run |
| `scenarios-materialized` | `commit`, `files` | |
| `scenario-declared` | `scenario`, `by` invocation, `state: bound \| declared` | `pending -> bound \| declared` |
| `scenario-due` | `scenario`, `cause: requirements-verified` | `bound -> declared` |
| `work-item-started` | gains origin `integration` with `scenario` | creates the integration work item when the last sub-scenario is implemented |
| `scenario-implemented` | `scenario`, `gate` | `declared -> implemented` |
| `scenario-withdrawn` | `scenario`, `reason`, `commit` | `bound \| declared -> pending` |

`GateAttempt` becomes `ramify-agent.gate-attempt/3` with the `scenarios`
command kind, the summary above under its command record, and the path of
the profile it ran. `RunRecord` carries `reviewStop` and the captured
`ramify-agent.project/1` configuration, so a run is reproducible from
`job.json` as it is for the policy today. `RunSnapshot` gains `review` and
`counts.scenarios: { pending, bound, declared, implemented }`.

**Projections.** Capability progress gains, per entry,
`scenarios: { implemented, total }`, the measure the
[capability registry analysis](../analysis/2026-09-23-capability-registry-analysis.md#for-the-progress-projection-now)
notes it lacks. A new query, `GET /api/v1/plans/:planId/runs/:runId/scenarios`,
lists every tracked scenario with its state, origin, entry, file and the
gates it ran in. The web shows that list on the run page, the review section
on the analysis page, and the `Approve` action with the `reviewStop` option
on `start-run`.

## Ramify and the module tree

- A `.feature` file is not TypeScript. Ramify neither analyzes nor owns it;
  the harness's convention places it in the owner's test area, and the
  harness enforces every rule about it.
- Step definitions are ordinary testing source in `src/tests/`. Their imports
  of product code, of the world and of the driver are ordinary imports under
  Ramify's rules, and the post-write hook reports a violation as it does for
  any test. The driver and world sit at a common ancestor and are exposed to
  descendants through `expose-test`.
- The binding of a scenario to its step definitions is not an import, but a
  run loads only the owner's step files, so any definition of another owner
  reached the run through an import those files make, exposed with
  `expose-test` and re-exposed along the path. Ramify therefore sees every
  sharing of step definitions between owners, and the harness adds no rule
  of its own.
- The plan's scenarios stay in the plan, which the harness captures and never
  edits. The executable copy is the feature file the harness writes. A
  placement revision that moves an entry to another owner moves the file at
  the next rendering; the record's `file` is revised and its hash is
  unchanged.

## Where the code goes

| Change | Where |
| --- | --- |
| Gherkin parsing, plan scenario extraction, form rules, feature rendering, the message-stream reducer, the per-module profiles | A new module `subs/harness/subs/scenarios`, pure functions with no I/O, the one importer of `@cucumber/gherkin` and `@cucumber/messages`. The harness receives its exports, as it receives the audit adapter's. |
| Integration work items | `work/records.ts` gains the origin; `run/service.ts` creates the item on the last `scenario-implemented` of its sub-scenarios and briefs its local architect with the scenario, its sub-scenarios and their owners' step files. |
| The project configuration: schema, reading, validation, capture into `job.json` | A new `run/project-config.ts` in the harness, with the schema in `run/records.ts` beside the run policy; `subs/evidence` reads the file. |
| Plan capture | `run/service.ts` where `input/plan.md` is written; the plan scenarios join the analysis briefing in `analysisMessage`. |
| Submission `/2`, validation, acceptance | `analysis/submission.ts`, `analysis/accept.ts`; the records under a new `scenarios/` layout entry in `run/records.ts`. |
| `reviewStop`, `approve-analysis`, phase, budget subtraction | `interfaces/protocol/runs.ts`, `run/log.ts`, `run/snapshot.ts`, `run/service.ts`. |
| Readiness steps | `run/readiness.ts`, `run/records.ts` step names. |
| The Cucumber profile written per attempt | The `scenarios` module builds it; `checks/execution.ts` and the audit executor write it into the attempt's directory. |
| Materialization and the two non-gate commits | `run/service.ts` after `createBranch`; `subs/evidence` for the git calls. |
| Guarded and denied files | `work/scope.ts`, `subs/evidence/src/guarded-files.ts`, `guard/write-guard.ts`. |
| Declarations | `work/engineer.ts`, `work/submission.ts`, and the acceptance paths in `run/service.ts`. |
| The check kind, its policy and command | `checks/checkpoint.ts`, `checks/records.ts`, `checks/verify.ts`, `run/policy.ts`, `checks/execution.ts` for the in-place runner, `subs/audit/src/check-execution.ts` for the executor. |
| State transitions at gates and events | `run/service.ts`, `run/log.ts`. |
| Briefings and procedures | `src/prompts/*` at version 2 for the initial architect, local architect and engineer; `work/session.ts`, `work/engineer.ts`. |
| Projections, protocol, web | `projections/progress.ts`, `projections/queries.ts`, `interfaces/protocol/runs.ts`, `http/app.ts`, `subs/web`. |
| Fixture | `fixtures/collection-review`: `ramify-agent.json`, the two scripts, a full mode, and the step and feature directories. |

## Order of implementation

1. The `scenarios` module: parse, validate, render, reduce, with tests over
   recorded message streams and the fixture's plan.
2. Plan capture, the analysis submission and its rules, the records, and the
   review stop with its commands and phase.
3. The project configuration, the readiness steps, the check kind, the
   profile and command, and the executor in both runners.
4. Materialization, the guarded and denied files, and recovery.
5. Declarations, the state transitions at every gate, withdrawal, integration
   scenarios, the completion and final-gate rules.
6. Briefings, procedures and diagnostics.
7. Projections, protocol and web.
8. The fixture's scenario harness, a scripted-agent trial across every stage
   above, and one real pi run on `status-badge-tone` with a plan scenario.

Each step leaves the suite green and the earlier behavior unchanged, so the
plan that adopts this order can gate each iteration as today.

## Decisions of 2026-09-23

The choices this document made beyond the analysis, each put to Dan with its
alternative and decided the same day:

1. Decided by Dan, 2026-09-23: a declaration made while a requirement is open
   is accepted and the scenario keeps its pending tag; the tag comes off only
   when the scenario would run without fakes. `bound` is that state's name.
2. Decided by Dan, 2026-09-23: a local architect may declare scenarios that
   existing step definitions already bind, in its completion request, so
   verified reuse still needs no iteration; the work-item gate is the judge.
3. Decided by Dan, 2026-09-23: no escape from the verbatim rule for steps an
   existing definition covers; such a step is picked into a sub-scenario.
4. Decided by Dan, 2026-09-23: a project configuration file,
   `ramify-agent.json`, with an `acceptance` section only: the support files,
   one command per mode with optional `setup` and `teardown`, and whether
   readiness executes full mode or dry-runs it, defaulting to the dry run.
   The project's own Cucumber profile is not read; the harness writes its own
   per run.
5. Decided by Dan, 2026-09-23: `approve-analysis` is accepted during and after
   a run started without the stop, and recorded as a review.
6. Decided by Dan, 2026-09-23: one Cucumber run per owner module, and step
   definitions shared through `expose-test`. Its consequence, stated to Dan
   and not objected to: an integration work item at the common ancestor in
   v1, which also owns a composition failure.
7. Following from 6: binding is recorded from the message stream and shown to
   the local architect, not policed by a harness rule.
8. Decided by Dan, 2026-09-23: the tag names `@ramify-pending` and
   `@ramify-sc-NNN`, and the path `src/tests/features/<planId>/`.
9. Decided by Dan, 2026-09-23: no agent-proposed scenarios and no guarded
   step definitions in v1.

The analysis's "What this changes" section lists the principle, glossary and
architecture edits that follow from it and from this document.
