# scenarios

Holds what the harness knows about acceptance scenarios as pure functions:
extracting plan scenarios from a Markdown plan, the form rules of the initial
architect's scenarios, the `ramify-agent.scenario/1` record and its
numbering, the reducer from scenario events to states, the rendering of the
tracked feature files, the Cucumber profile of one module's run and the
reducer of a run's message stream. It hides the Gherkin parser and
Cucumber's message types: it is the one importer of `@cucumber/gherkin` and
`@cucumber/messages`, and its exports speak in lines, names, steps and its
own types. It has no I/O. It reads no file, writes no file, starts no process
and never reads the architect view; its callers pass in what it needs.

## Why it is separate

Each rule about a scenario is decided once, here, and the harness applies it
at plan capture, analysis acceptance, materialization, gates, recovery and
the projections. Being pure, every rule is tested over literal input and
recorded streams, with no run, agent, git or runner. The module receives
nothing from the harness. Every export is exposed to `parent` with the named
types its signature mentions, so the harness can name what it receives.

## Extraction

`extractPlanScenarios(plan)` reads every fenced block whose info string is
`gherkin`, parsed without a runner, and returns a `PlanScenarioExtraction`.
Each `Scenario` or `Scenario Outline` is a `PlanScenario` `ps-01`, `ps-02`,
… in document order, with its plan lines, the heading anchors it sits under,
its name and its source lines. A block without its own `Feature:` is parsed
inside a synthetic one. A `Background` of the feature, and of a `Rule`, is
folded into each scenario after its description, as Cucumber's pickles fold
it. An outline stays one scenario with its examples. Tags and comments are
left out; doc string content is kept whole. A block that does not parse is a
`PlanScenarioLimitation` with the parser's message, located in plan lines,
and the block's lines. Extraction never throws.

## Form rules

`validateScenarioForm(submission, planScenarios, entries, viewNames?)`
applies rules 1–6 of architecture §2 in order and returns the first rule
broken, with the path of the offending value and a message that names the
rule, or the `AcceptedScenarioForm` with its `ScenarioWarning`s.

- A submitted `gherkin` value is parsed inside a synthetic `Feature:`.
- Rule 3 compares a plan scenario's restatement with the extracted text after
  trimming each line and collapsing runs of whitespace, and nothing else.
- Rule 5 compares steps by kind and text: `And` and `But` take the kind of
  the step they continue, so a plan's `And` matches a sub-scenario's `When`.
- Rule 6 counts a reference as cited by overlapping plan lines, or by a
  heading anchor when the reference names no lines.
- The warning for a step that names an exported symbol or a file path takes
  those names as `ScenarioViewNames`; the caller reads them from the view.
  A symbol that is also an ordinary word, such as `order` or `Email`, is not
  matched.

The accepted form carries the plan's own lines for a plan scenario and for an
integration scenario, never the architect's restatement.

## Records and states

`assignScenarioIds(form, context)` numbers entry scenarios `sc-001`, … in
submission order and integration scenarios after them, and returns the
records with the ID each key and each integration plan scenario received. An
entry scenario's owner is its entry's; an integration scenario's is the
`lowestCommonAncestor` of its sub-scenarios' owners. Each record carries the
`sha256:` hash of its source lines and its feature file,
`<owner>/src/tests/features/<planId>/<entry>.feature` or
`…/integration.feature`, beneath `src/features/` for a testing module.

`applyScenarioEvent` and `reduceScenarioStates` derive the four states from
`scenario-declared`, `scenario-due`, `scenario-implemented` and
`scenario-withdrawn`, from every scenario `pending`. They allow exactly the
transitions of architecture's events table and reject every other one with
its reason; the reduction stops at the first rejected event and names its
position. Which event a gate or a declaration calls for is the harness's.

## Rendering

`renderFeatureFiles(records, states, run)` returns every tracked file's path
and content, ordered by path: the header comment, the feature named by the
entry's slug and described by its recorded description, and each scenario
with its identity tag `@ramify-sc-NNN`, the pending tag exactly while it is
`pending` or `bound`, and its source lines verbatim. A description is wrapped
so that no line reads as a tag, a comment or a keyword. The same input yields
byte-identical output in any record order, so a re-rendering writes only what
a state change altered.

## Profiles

`buildScenarioProfile(module, mode, selection, config, attemptDir, options?)`
returns one module's Cucumber profile text, where it goes and where its
message stream goes under `<attemptDir>/scenarios/`, and the argv: the
mode's command, `--config` with the profile, and `--dry-run` when asked. The
profile imports the configured support files in order and the module's step
files, runs the module's feature files, sets the tag expression of the
selection (`identity`, `all-untagged` or `all`), `strict` and the message
formatter. A testing module's areas are its `src/steps/` and
`src/features/`. `cucumber-js` 13 joins its working directory with the
`--config` path even when that path is absolute, so an absolute attempt
directory needs `options.projectRoot`, and the argv names the profile
relative to it. Writing the profile and rebasing it into an audit worktree
are the caller's.

## The message stream

`summarizeScenarioRun(stream, tracked)` reads one run's NDJSON message
stream and returns a `ScenarioRunSummary`: per tracked scenario the run
executed, its status as the worst of its pickles at their last attempt, its
file and line, its binding (each step with the `uri:line` of every
definition that matched it), the first step with the scenario's status and
its message, and the step texts no definition matched. A scenario is tracked
when its identity tag names a record and it sits in the file that record
names. Tracked scenarios the run did not execute are listed as excluded; the
project's own scenarios are counted as passed, skipped or failed. A line that
is not JSON is reported and the rest is read, and a step the stream never
finished did not pass. A scenario the stream does not hold whole also
carries `unfinished`: how many of its pickles never started and of its steps
have no result, and the worst status of the steps that did finish, so a
reader can tell a failure the run observed from a gap in the stream.
Whether the check passes is the caller's, since it also weighs the exit
code, the selection and the mode.

## Composition failures

`compositionFailures(records, results)` reads one scenario check's results
and returns every integration scenario that `failed` while each of its
sub-scenarios `passed` in the same check. For each it names the suspects:
the sub-scenarios with a bridging Given, which `bridgingGivens(integration,
sub)` finds as the context steps of the sub-scenario that appear in no step
of the integration scenario, compared by kind and text as rule 5 compares
them. A sub-scenario the check did not run or did not pass, and an
integration scenario that is undefined rather than failed, are ordinary
failures and no composition failure.

## Recordings

The reducer's tests replay message streams recorded with the real
`cucumber-js` 13.2.1 on Node 22 on 2026-09-23, in `src/tests/fixtures/streams/`.
`src/tests/fixtures/record-streams.ts` recorded them and records them again:
from `ramify-agent/`, run

```text
npx tsx subs/harness/subs/scenarios/src/tests/fixtures/record-streams.ts
```

For each case it builds the `shelf` module's quick profile with
`buildScenarioProfile` into a temporary attempt directory, runs the runner
with it in `src/tests/fixtures/sample-project/`, and copies the stream into
`streams/<case>.ndjson`. The cases are one scenario each passing, failing,
undefined, ambiguous and pending, an outline with a failing example, a bound
scenario selected by identity, the `all-untagged` selection over the tracked
file and the project's own `own.feature`, and a dry run of everything. The
sample project's tracked file is exactly what `renderFeatureFiles` writes for
its records, which a rendering test verifies. A recording carries run IDs,
times and the absolute path of the checkout it was made in, so tests assert
on none of them. No test starts the runner.

## Tests

`src/tests/` covers extraction over the collection-review plans and over a
plan with a background, an outline, two blocks and an unparsable block; a
rejection per form rule and each warning; ID assignment and the lowest common
ancestor; every allowed and every rejected state transition; rendering
against the golden files in `src/tests/golden/` (`UPDATE_GOLDEN=1` rewrites
them) and its idempotence; the profile per selection kind and module kind;
and the reducer over each recording.
