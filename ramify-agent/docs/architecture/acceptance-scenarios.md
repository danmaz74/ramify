# Acceptance scenarios: the v1 architecture

**Date:** 2026-09-23. **Status:** implemented by
[Plan 10](../plans/10-acceptance-scenarios/main-plan.md); see its
[results](../plans/10-acceptance-scenarios/results.md).

**Scenario state since Plan 21.** Iteration 6 of
[Plan 21](../plans/21-project-boundary-adoption/main-plan.md) replaced the
declaration states with the architect-owned obligation states of its
[scenario contract](../plans/21-project-boundary-adoption/contracts.md#10-scenario-state-delegation-and-agent-judgment).
Sections 6 to 11 and the events table below describe that model; the
decisions at the end record the v1 choices as they were made.

**Scenario execution since Plan 21.** Iteration 9 of the same plan removed
the harness's own scenario check. A project's scenarios run as a configured
Cucumber check of its committed audit definition, `ramify-audit.json`, whose
committed profile excludes `@ramify-pending`. Every committing gate asks for
the project's committed audit of its candidate commit, and the provider
selects that check and narrows it by ownership as it narrows Vitest. The
tracked scenario results are read from the raw runner output for display
only. `ramify-agent.json` has no `acceptance` section, readiness has no
acceptance steps, and an engineer has no scoped test tool. Sections 0, 4 and
6 to 11 and [the scenario check](#the-scenario-check) describe that model;
decisions 4, 6 and 7 at the end record the v1 choices it replaced.

**Where the implementation differs from this text.** The results record
every deviation; these change what the document says:

- The log has one event beyond the events table:
  `scenarios-materializing`, the intent of the materialization commit.
- The materialization commit carries `Ramify-Scenarios: materialized`
  beside `Ramify-Run` and is an accepted boundary.
- The integration work item is committed with the `obligation-reported`
  that reports its last sub-scenario done; `work-item-started` marks its
  turn and carries its `origin` and `scenario`.
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
- **Every tracked scenario has one of three states,** its obligation status:
  `pending`, `bound`, `done`. The `@ramify-pending` tag marks only the first
  in the source. Each state is entered by one accepted submission, and only
  the harness edits a feature file.
- **An engineer binds** the obligations its assignment names, in its
  completion proposal, each with the fakes the binding relies on. A proposal
  that leaves one out is refused, naming it.
- **The responsible local architect reports a scenario `done`**, directly
  from `pending` where existing step definitions bind it, and only that
  architect's revision moves it back to `bound`. No gate result, repair exit,
  yield or source change moves a state.
- **Scenarios run as a configured check of the project's committed audit.**
  The project's `ramify-audit.json` declares a Cucumber check whose
  committed profile excludes `@ramify-pending`. Every committing gate asks
  for the project's committed audit of its candidate commit: the project's
  default mode at iteration, contract and work-item gates, a full audit at
  the final gate. The provider selects the check and narrows it by
  ownership. Sharing a step definition with another owner is an ordinary
  testing import, exposed with `expose-test`, which Ramify verifies.
- **An integration scenario gets a work item at the common ancestor** once
  its sub-scenarios are reported done. Its engineer imports the
  sub-scenarios' step definitions there, through `expose-test`, and a failure
  of the scenario is that work item's to resolve.
- **The harness reads the raw runner output the audit published** and
  derives each tracked scenario's result and the step definitions that
  bound it, for display only. The audit's composed verdict decides the
  gate.
- **A plan is finished** when every tracked scenario, integration scenarios
  included, is reported `done` and carries no pending tag, and the final
  gate, a full audit of the project's configured checks, scenarios included,
  its type check and a complete Ramify check, passes. Its scenario results
  are raw evidence, never matched to the states.
  Completion can await user review of non-functional plan deviations before
  that exact candidate is merge-ready. A CheckFinding decision cannot make a
  failed scenario or required gate pass.

## Terms

They are defined in the [glossary](../glossary.md).

| Term | Definition |
| --- | --- |
| Scenario | One Gherkin `Scenario` or `Scenario Outline` the harness tracks as a requirement of the plan. |
| Plan scenario | A scenario written in the plan, extracted by the harness. Its authority is the plan's. |
| Architect scenario | A scenario the initial architect writes for one entry. Its authority is the person's review. |
| Entry scenario | A scenario assigned to exactly one entry capability. Every plan scenario that is not an integration scenario, and every architect scenario, is one. |
| Integration scenario | A plan scenario that combines several entries. It has sub-scenarios, and an integration work item at their owners' common ancestor binds it once they are reported done. |
| Sub-scenario | An entry scenario the architect derived from an integration scenario, ideally by picking its steps verbatim. |
| Bridging Given | A `Given` in a sub-scenario that replaces another entry's action with the state it leaves. |
| Step definition | The TypeScript that Cucumber matches a step's text to. Agents write step definitions; they never write scenarios. |
| Binding | The set of step definitions a run matched to a scenario's steps, read from the Cucumber run a gate's audit published. |
| Scenario harness | The target project's world, driver, hooks and the configured Cucumber check of its committed audit definition that runs its scenarios. |
| Identity tag | `@ramify-sc-NNN`, the tag that names one tracked scenario in the source. |
| Pending tag | `@ramify-pending`, the tag the harness keeps on a `pending` scenario, which the project's committed Cucumber profile excludes. |

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
- Parallel Cucumber workers.

## The run, stage by stage

The whole run, with the additions in bold:

```text
start -> capture the plan, its scenarios included
      -> initial analysis: entries, hypotheses, scenarios per entry
      -> analysis accepted: scenario text frozen
      -> awaiting review, when asked for; approve or stop
      -> readiness: a configured full audit of HEAD, scenarios included
      -> run branch; feature files materialized and committed
      -> work items: iterations bind and declare; gates verify
      -> final gate: a full audit, every scenario reported done
      -> completed
```

### 0. What the target project provides

The scenario harness is the target project's, as decided. Its scenarios run
as a configured Cucumber check of the project's committed audit definition,
`ramify-audit.json`, under a Cucumber profile the project commits. The
profile excludes `@ramify-pending`, so a scenario nothing has bound or
reported done never runs. ramify-agent's own project declares the profile in
`cucumber.json`:

```json
{
  "default": {
    "paths": ["src/tests/features/**/*.feature", "subs/*/src/tests/features/**/*.feature"],
    "import": ["src/tests/steps/**/*.ts", "subs/*/src/tests/steps/**/*.ts"],
    "tags": "not @ramify-pending"
  }
}
```

and the check in `ramify-audit.json`:

```json
{
  "id": "agent-scenarios",
  "executor": { "kind": "command", "commands": [
    { "name": "scenarios", "cmd": "npm", "args": ["run", "test:scenarios"], "parser": "cucumber", "timeoutMs": 600000 }
  ] },
  "dependsOn": ["agent-typecheck"]
}
```

The harness writes no profile, passes no tag and selects nothing. Every
committing gate asks the installed provider for the project's committed
audit of its candidate commit, and the provider selects the configured
checks and narrows Vitest and Cucumber by ownership. The profile and the
definition are guarded configuration, so no agent changes what a gate runs.

What the harness derives without configuration:

| Convention | Rule |
| --- | --- |
| Step definitions | Under a module's `src/tests/steps/`, or a testing module's `src/steps/`. The engineer's briefing names the owner's directory. |
| Feature files | Under a module's `src/tests/features/`, or a testing module's `src/features/`. The harness writes the plan's files beneath them; the project's committed profile must collect them. |
| Shared step definitions | A step definition lives in the module whose scenarios it binds. A module that needs another owner's definitions imports them by name from a step file that owner exposes with `expose-test`, re-exposed along the path as any testing symbol is. A step text defined twice within one run is `ambiguous` and fails the check. |
| World and driver | Exposed to descendants through `expose-test`, so step definitions in any module build on them under ordinary Ramify rules. |

A project whose outside is a CLI or an API provides a driver for that; the
harness never sees the driver. How a project runs its scenarios, in process
or against a running server, is the committed check's business.

The project's configuration file, `ramify-agent.json`, beside `package.json`
and `module.ramify`, holds only what the harness cannot derive, all of it
optional, and names no test and no scenario:

```json
{
  "schema": "ramify-agent.project/1",
  "typeCheck": { "output": "tsc" }
}
```

| Field | Meaning |
| --- | --- |
| `setup` | Optional. The project's setup commands, such as its build, in order: each `{ name?, command, cwd?, timeoutMs?, env? }`, where `command` is a non-empty argv, `cwd` a directory inside the project relative to its root (the root by default), `timeoutMs` a positive bound (ten minutes by default) and `env` names and values added to the command's environment. Readiness requires them to equal the committed definition's workspace setup commands; see [setup commands](#setup-commands). |
| `typeCheck.output` | Optional. The format the type check prints, `tsc`, from which a standalone diagnosis attributes a failed type check by the locations of its errors. |
| `timeouts` | Optional. A standalone diagnosis's command timeouts, in milliseconds, each a positive integer of at most 7,200,000 (two hours): `typeCheck` and `ramifyCheck`. Each replaces the harness's own timeout of that command. |

An `acceptance` section, `timeouts.tests` or `timeouts.scopedTests` makes the
file invalid. The file is read at `start-run`, validated against its schema,
captured into `job.json` beside the run policy, and guarded like
`package.json`: an agent's change to it is a guarded change. With
`typeCheck.output: "tsc"` a standalone diagnosis reads `tsc`'s error lines,
in its plain form `path(line,col): error TSnnnn: message` or its pretty form
`path:line:col - error TSnnnn: message`, and passes over blank and indented
lines, the pretty form's code excerpt and summary, npm's `> ` banner and its
`npm error`, `npm ERR!` and `npm warn` lines. Each path is read relative to
the command's working directory.

#### Setup commands

A project whose tests need a build output the repository ignores, such as
`dist/`, declares the commands that make it as the workspace setup commands
of its committed audit definition. ramify-audit's `nodejs` preparation links
the installed dependencies of the project and of each declared package into
the worktree of every audited commit, then runs the commands there, their
output captured and published with the audit's evidence. Readiness runs the
same commands in place in the run working tree as its `declared-preparation`
step, and fails where `ramify-agent.json`'s `setup` names other commands. A
standalone session's in-place diagnosis runs `ramify-agent.json`'s `setup`
before its type check and Ramify check, as commands of kind `setup`; a setup
command named `build` is shown as the build.

Once a setup command has not passed, no check of the audit runs after it. A
setup command that ran and exited non-zero fails a committing gate as
`check-failed`: after readiness passed, the change since the last passing
state is the assignment's own, so the engineer repairs it, briefed with the
gate's digest. One that timed out is `not-verified` with cause `timeout`;
one that could not start or was stopped is infrastructure. At readiness, a
setup command that exits non-zero fails readiness with the end of its
output and no recovery; one that timed out is rerun. ramify-audit stops the
whole process tree of a setup command that timed out or was cancelled.

A setup command must not install dependencies: the audited worktree already
links the project's installed ones, and a package manager would follow the
link and change or empty the project's own installation. ramify-audit
refuses an installing command (`npm ci`, `pnpm install`, a bare `yarn` and
the like) where its working directory, or one up to four levels below it,
has a linked `node_modules`, so readiness refuses one first, at
`declared-preparation`, before any command runs and with no recovery, saying what
to remove from `setup`. Should a committing gate meet the refusal all the
same, it is infrastructure, with ramify-audit's message.

The `collection-review` fixture commits no audit definition: the tests that
drive a run over it answer each gate with a scripted configured audit, and
its `ramify-agent.json` declares only its type check's output.

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

Readiness has no acceptance step of its own. It verifies the project root,
removes stale scratch, and requires a clean repository, the compiler
configuration, a valid `ramify-agent.json` and an answering Ramify command
line. Then:

| Step | Verifies | On failure |
| --- | --- | --- |
| `audit-config` | The committed `ramify-audit.json` at HEAD has the policy `start-run` captured. | `readiness-failed`; reconcile the configuration and start a new run. |
| `declared-packages` | Every package directory the definition declares is installed. | One bounded reinstall, then `readiness-failed`. |
| `declared-preparation` | The definition's workspace setup commands pass in the run working tree, and `ramify-agent.json`'s `setup`, where present, names the same commands. | `readiness-failed` with the end of the command's output. |
| `configured-full-audit` | The provider's full audit of HEAD completes with the composed verdict `pass`. Its configured scenario check runs the project's own scenarios and any tracked one already bound. | `readiness-failed`; an audit that does not complete takes the bounded recovery. |

The plan's feature files are not written yet, so the full audit is the
project's own regression acceptance, and its gate attempt is the baseline. A
project whose committed audit has no Cucumber check runs no scenario.

### 5. Materialization

Once readiness has passed and the run branch exists, the harness materializes
the feature files and commits them, before the first local architect starts:

```text
readiness-passed -> createBranch -> materialize -> commit "Scenarios of <planId>"
                 -> scenarios-materialized { commit, files } -> working
```

The commit carries the `Ramify-Run` trailer and no `Ramify-Gate`; nothing
ran over it, and the attempt history says so by having no attempt. It is the
one commit of a run that is not a gate's, apart from a deviation's rewording.

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
# scenario that nothing has bound or reported done yet.

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
pending tag is present exactly when the scenario is `pending`.

**Idempotence.** Every later change to a feature file is a re-rendering: the
harness computes the expected content of every tracked file from the current
states, writes the files that differ, and commits. Recovery after a crash
does the same. A file whose content differs from its expected rendering at a
gate is a guarded change, so the tracked feature files join the guarded list
of every assignment with the hash of their expected rendering, and the write
guard refuses agent edit and write calls to them outright.

`ramify-agent.json` and `ramify-audit.json` join the guarded list, in both
places it is kept, and so does the project's Cucumber configuration
(`cucumber.js`, `.cjs`, `.mjs`, `.json`, `.yaml` or `.yml`), whose profile
decides what the configured scenario check runs.

### 6. A work item

The local architect's briefing gains a section per entry scenario of its work
item: ID, state, text, file path and, for a sub-scenario, the integration
scenario it came from, and lists every obligation it is responsible for with
its status, revision, binding fakes and last report. Its procedure changes in
one place. Step 5, "a goal a module already meets needs no iteration",
becomes: a goal a module already meets still needs its scenarios bound; where
existing step definitions already bind them, report them `done` with the
completion request; otherwise assign an iteration that binds them.

`assignment.obligations` is optional: the IDs of the obligations the
iteration must bind, scenarios and registered tests of the assigning
architect alike. They reach the engineer under "Obligations to bind", and a
scenario's text under "Scenarios to bind". The assignment is binding, not
informative: the engineer's completion proposal must bind every one.

The engineer's briefing carries, for each scenario of its work item's entry
that is not `done`, the text, the feature file's path, the state, and three
rules: write step definitions in `src/tests/steps/` of a module within the
write scope; never edit a feature file; bind each assigned scenario in the
proposal, naming the fakes it relies on. It has no scoped test tool: the
briefing names its owners' test areas, and it runs named test files through
`shell`, which refuses a whole-suite run. Provider work items have no
scenarios, and their briefings say nothing about them.

### 7. Binding, and the iteration gate

`completion-proposed` carries `bindings: { id, fakes }[]`. The harness
accepts a proposal only when it binds every ID of `assignment.obligations`
exactly once and nothing else; a proposal that leaves one out is a rejected
submission naming the missing IDs, under the existing per-turn bound, before
any commit, audit or review. A `partial` report is exempt. `fakes` names the
fake class or export names the binding relies on, possibly none.

An accepted binding is recorded (`obligation-bound { id, fakes, by,
submission }`) before the iteration gate. A `pending` obligation becomes
`bound`; a `done` one stays `done` and records the new list. The architect
sees each binding's fakes with its provenance.

Then the gate runs: the harness compares guarded files, re-renders the
feature files, so a bound scenario loses its pending tag in the gate's own
commit, commits, and asks for the project's committed audit of that commit
in the project's default mode. The provider selects the configured checks,
the scenario check among them, and narrows them by ownership; a scenario
that still carries its pending tag is excluded by the committed profile.
See [the scenario check](#the-scenario-check).

A pass leaves every state as it is: a bound scenario stays `bound` until its
architect reports it. On a failure the same engineer session continues with the gate's
digest: the audit's checks, the end of what each failing one printed and
every tracked scenario result read from the raw runner output, with no cause
inferred. Exhaustion, a placement request
or a yield leaves every state as it is; nothing is withdrawn.

### 8. Providers, fakes and bound scenarios

A consumer's first iteration usually binds its scenarios against the fake it
implements against, and the fake stands until the provider conforms and a
verification iteration passes. The binding records that situation as its
`fakes` list. Its scenario loses the pending tag at the binding, and the
configured checks run it against the fake from then on. The verification
iteration binds it again without fakes, and the architect reports it `done`
when it judges the scenario correctly implemented. No requirement or audit
event moves its state.

### 9. Work-item completion

A `request-completion` that leaves any entry scenario of the item, an
integration item's scenario or a test its architect registered not reported
`done` is a rejected submission naming the IDs, under the per-turn
rejected-submission bound and before any outline or gate; the architect
answers in the same turn with the reports, an assignment or a blocker, and
an exhausted bound fails the run as `invalid-submission` naming the IDs
still owed. Its own reports are applied first, so a completion request that
reports the last scenario done is not rejected for it. The
`work-item` gate then asks for the project's committed audit of its
candidate commit in the project's default mode, and `work-item-completed`
requires that gate's pass.

The provider's selection includes the project's own scenarios and every
earlier work item's bound and done ones wherever the change reaches them,
so each work-item gate is also regression acceptance. A failure fails the
gate and leaves every state as it is.

### 10. Integration scenarios

An integration scenario is due once every sub-scenario is reported `done`; a
`bound` sub-scenario is not enough. With the `obligation-reported` that makes
that true, the harness creates an **integration work item** at the scenario's
owner, the lowest common ancestor of the sub-scenarios' owners, with the goal
of binding that one scenario. It is a work item like any other, with origin
`integration` and the scenario's ID in place of an entry capability, and it
queues behind the current work item, since work items run one at a time.

Its local architect assigns the scenario to an engineer whose scope is the
ancestor with the children on the paths to the sub-scenarios' owners
included. The engineer writes a step file at the ancestor that imports, by
name, the step files the sub-scenarios' owners wrote, adds the `expose-test`
declarations along each path, and binds the scenario. The verbatim rule
guarantees that those imported definitions bind every step, so the
ancestor's file defines no step of its own. The architect reports the
scenario `done`, and the work item completes at its own work-item gate.

Decided by Dan, 2026-09-23: a module's step definitions live in that module,
and definitions another module needs, such as an integration scenario's, are
shared through the testing tag. That decision is why v1 has this work item:
one per integration scenario, created when it becomes due.

When the scenario fails, the failure reaches the work item's repair rounds
raw, with every result read from the runner's output; the harness
generates no composition diagnosis and names no suspect step. The agents
investigate it, through the ordinary repair rounds, then the local
architect's placement and delegation paths, or `unresolved`. The run cannot
complete around it: the work item must complete like every other.

### 11. The final gate

The `final` checkpoint asks for a full audit of its candidate commit: every
configured check, the scenario check over every feature file the committed
profile collects. Its harness rule requires that every tracked scenario is
reported `done` before the run, so none carries the pending tag; its
failure, `acceptance-incomplete`, fails the run with evidence rather than
returning anywhere. `job-completed` then requires, beside its present
conditions, a passing final attempt. Its scenario results are display
evidence and never matched to the states.

### 12. Stop, crash and recovery

- **A stop during `awaiting-review`** leaves the repository untouched; the
  run's records stay under `plans/<planId>/.harness/jobs/<runId>/`.
- **A stop later** leaves the feature files committed on the run branch with
  their tags as the states were. Continuing from that branch is future work.
- **A crash between a state change and its commit** is recovered by
  re-rendering: the states are in the ledger, the rendering is pure, and the
  commit is retried. `scenarios-materialized` is recorded as an effect with
  an intent line first, as gate commits are, so a crash between the commit
  and the record finds the commit by its trailer.
- **A crash during a gate's audit** is the audit's interrupted attempt, and
  the retry asks again about the same commit.

## The scenario check

The harness has no scenario check of its own. The project's committed audit
definition declares a Cucumber check, and the project's committed profile
decides what it collects and loads; the profile excludes `@ramify-pending`.

| Checkpoint | Audit asked for | What runs |
| --- | --- | --- |
| `readiness` | full, of HEAD, not committing | every configured check |
| `iteration`, `contract`, `breaking-iteration`, `work-item` | the project's default, of the candidate commit | the checks and owners the provider selects |
| `final` | full, of the candidate commit | every configured check |

The provider's default for a Ramify project is `ramify-partial` from its
baseline, falling back to a full audit where it has none, and full for any
other project. It narrows Vitest and Cucumber by ownership, so a gate runs
the scenarios of the owners its change reaches. Applicable reuse of an
earlier record keeps the requested commit, the audited commit, the report
refs and the ignored changed paths. A run whose captured audit policy no
longer matches the committed definition is refused: the policy is
everything the run captured except the commit.

**The verdict.** The audit's composed verdict is the gate's answer: `fail`
fails the gate as `check-failed`, and an audit that did not complete or was
indeterminate is `not-verified`, caused by a timeout or by infrastructure.
`undefined`, `pending` and `ambiguous` steps fail the scenario check as the
provider's Cucumber parser reports them. A harness rule or an unauthorized
guarded change fails a passing audit.

**The results.** `checks/scenario-results.ts` reads the raw runner output
of every Cucumber command the provider published, identifies each tracked
scenario by its identity tag and counts the project's own scenarios by
outcome:

```yaml
- id: sc-001
  check: scenarios                # the configured check, and the command that ran it
  status: passed                  # passed | failed | undefined | pending | ambiguous | skipped
  file: subs/customers/src/tests/features/send-customer-email/send-customer-email.feature
  line: 9
  binding:
    - { step: "Given a customer with the address ada@example.com", definition: "subs/customers/src/tests/steps/customers.steps.ts:12" }
  failure: { step: "Then ...", message: "..." }   # when failed
  undefined: []                   # step texts no definition matched
```

A scenario's status is the worst of its steps. These results are display
only: they never move a scenario's state, and never create or withdraw a
report or a CheckFinding.

**Binding is recorded, not policed.** Each scenario's `binding` names the
file of every definition that bound a step. A definition outside the owner's
own step files reached the run through an import, which Ramify verified, or
through the project's profile; the local architect sees it in the gate
section, which is enough for v1. A symbol-free import of another owner's
step file loads it without exposure under the source interpretation rules,
so the engineer's briefing asks for a named import.

**Diagnostics.** The gate's digest names the audit request, its modes, the
composed verdict and any reuse, then each published check: one line where
it passed, the provider's record and the end of what it printed where it
did not. Where a tracked scenario did not pass, it lists every tracked
result with its file and line, failing step, message and undefined steps,
and counts the project's own failures. A passing gate's digest carries the
binding of each scenario it passed.

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
| `obligation-bound` | `id`, `fakes`, `by` invocation, `submission` hash | `pending -> bound`; `done` stays `done` |
| `obligation-reported` | `id`, `judgment: done \| bound`, `basedOnRevision`, `revision`, `where?`, `by`, `submission` | `pending \| bound -> done`, `done -> bound`; the last sub-scenario's done report commits the integration work item |
| `work-item-started` | gains origin `integration` with `scenario` | |

`GateAttempt` is `ramify-agent.gate-attempt/3`. A committing gate's attempt
carries its audit request and answer under `audit`, the provider's result
and published checks under `provider`, the evidence refs, and no command
records; the scenario results are read from `provider`. `RunRecord` carries `reviewStop` and the captured
`ramify-agent.project/1` configuration, so a run is reproducible from
`job.json` as it is for the policy today. `RunSnapshot` gains `review` and
`counts.scenarios: { pending, bound, done }`.

**Projections.** Capability progress gains, per entry,
`scenarios: { done, total }`, the measure the
[capability registry analysis](../analysis/2026-09-23-capability-registry-analysis.md#for-the-progress-projection-now)
notes it lacks. A new query, `GET /api/v1/plans/:planId/runs/:runId/scenarios`,
lists every tracked scenario with its state, origin, entry, file and the
gates it ran in, and every obligation with its binding's fakes and its
architect report. The web shows that list on the run page, the review section
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
| Gherkin parsing, plan scenario extraction, form rules, feature rendering | A new module `subs/harness/subs/scenarios`, pure functions with no I/O, the one importer of `@cucumber/gherkin` and `@cucumber/messages`. The harness receives its exports, as it receives the audit adapter's. |
| Integration work items | `work/records.ts` gains the origin; `run/service.ts` creates the item with the done report of its last sub-scenario and briefs its local architect with the scenario, its sub-scenarios and their owners' step files. |
| The project configuration: schema, reading, validation, capture into `job.json` | A new `run/project-config.ts` in the harness, with the schema in `run/records.ts` beside the run policy; `subs/evidence` reads the file. |
| Plan capture | `run/service.ts` where `input/plan.md` is written; the plan scenarios join the analysis briefing in `analysisMessage`. |
| Submission `/2`, validation, acceptance | `analysis/submission.ts`, `analysis/accept.ts`; the records under a new `scenarios/` layout entry in `run/records.ts`. |
| `reviewStop`, `approve-analysis`, phase, budget subtraction | `interfaces/protocol/runs.ts`, `run/log.ts`, `run/snapshot.ts`, `run/service.ts`. |
| Readiness steps | `run/readiness.ts`, `run/records.ts` step names. |
| Scenario results read from the audit's raw runner output | `checks/scenario-results.ts`, for display in `checks/diagnostics.ts` and the projections. |
| Materialization and the two non-gate commits | `run/service.ts` after `createBranch`; `subs/evidence` for the git calls. |
| Guarded and denied files | `work/scope.ts`, `subs/evidence/src/guarded-files.ts`, `guard/write-guard.ts`. |
| Bindings and reports | `work/engineer.ts`, `work/obligations.ts`, `work/submission.ts`, and the acceptance paths in `run/service.ts`. |
| The check kind, its policy and command | `checks/checkpoint.ts`, `checks/records.ts`, `checks/verify.ts`, `run/policy.ts`, `checks/execution.ts` for the in-place runner, `subs/audit/src/check-execution.ts` for the executor. |
| State transitions at gates and events | `run/service.ts`, `run/log.ts`. |
| Briefings and procedures | `src/prompts/*` at version 2 for the initial architect, local architect and engineer; `work/session.ts`, `work/engineer.ts`. |
| Projections, protocol, web | `projections/progress.ts`, `projections/queries.ts`, `interfaces/protocol/runs.ts`, `http/app.ts`, `subs/web`. |
| Fixture | `fixtures/collection-review`: `ramify-agent.json`, the step and feature directories, and a scripted configured audit in the tests that drive it. |

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
