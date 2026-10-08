# scenarios

Holds what the harness knows about acceptance scenarios as pure functions:
extracting plan scenarios from a Markdown plan, the form rules of the initial
architect's scenarios, the `ramify-agent.scenario/1` record and its
numbering, the reducer from scenario events to states and the rendering of
the tracked feature files. The project's own Cucumber configuration runs the
scenarios as checks of its committed audit definition; nothing here builds a
run. It hides the Gherkin parser and Cucumber's message types: it is the one importer of `@cucumber/gherkin` and
`@cucumber/messages`, and its exports speak in lines, names, steps and its
own types. It has no I/O. It reads no file, writes no file, starts no process
and never reads the architect view; its callers pass in what it needs.

## Why it is separate

Each rule about a scenario is decided once, here, and the harness applies it
at plan capture, analysis acceptance, materialization, gates, recovery and
the projections. Being pure, every rule is tested over literal input, with
no run, agent, git or runner. The module receives
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
- Rule 6 compares element citations as given: an entry's acceptance
  element is cited when one of its scenarios names it in `refs`, whatever
  the scenario's origin.
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

`applyScenarioEvent` and `reduceScenarioStates` derive the three states,
`pending`, `bound` and `done`, from the two accepted-submission events, from
every scenario `pending`. `obligation-bound`, an engineer's accepted binding,
makes a scenario `bound` and leaves a `done` one `done`; `obligation-reported`,
its responsible architect's accepted report, sets the judgment, `done` or the
revision back to `bound`. An event naming another kind of obligation changes
no scenario. No gate, audit or repair exit moves a state.

## Rendering

`renderFeatureFiles(records, states, run)` returns every tracked file's path
and content, ordered by path: the header comment, the feature named by the
entry's slug and described by its recorded description, and each scenario
with its identity tag `@ramify-sc-NNN`, the pending tag exactly while it is
`pending`, and its source lines verbatim. A description is wrapped
so that no line reads as a tag, a comment or a keyword. The same input yields
byte-identical output in any record order, so a re-rendering writes only what
a state change altered.

## Tests

`src/tests/` covers extraction over the collection-review plans and over a
plan with a background, an outline, two blocks and an unparsable block; a
rejection per form rule and each warning; ID assignment and the lowest common
ancestor; every state transition; and rendering against the golden files in
`src/tests/golden/` (`UPDATE_GOLDEN=1` rewrites them), its idempotence, and
the tracked file of `src/tests/fixtures/sample-project/`, which is exactly
what `renderFeatureFiles` writes for its records. No test starts the
runner.
