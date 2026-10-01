# Acceptance scenarios

**Date:** 2026-09-23. **Status:** analysis. It records Dan's decisions of
2026-09-23 on Gherkin acceptance scenarios, the proposals that follow from
them and are not yet agreed, and what remains open. It is not a plan, and
nothing here is implemented. The
[v1 architecture](../architecture/acceptance-scenarios.md) turns its decisions
into one design and resolves its open questions for the first step.

## The problem

A [top-level capability](../glossary.md#top-level-capability) is written in
plain English. Turning it into a concrete test requires designing at least its
interface first. A test written at the start of a run would fix that design
before anyone has read the code, and a guarded test would bind the run to it.
If a later decision changes the design, "it must pass this test" makes the run
worse, not better.

Below the top level the loop already avoids this. A consumer designs a
provider's interface in a contract sub-session at the moment of use, and a
hypothesis binds nothing. The top level has no executable acceptance at all.
The run completes when every work item passes the whole-project gate, and
[`checkpoint.ts`](../../subs/harness/src/checks/checkpoint.ts) states that
there is no separate acceptance check in the MVP, as decided on 2026-09-20.

## Decisions

Dan, 2026-09-23:

- **Gherkin scenarios are an integral part of ramify-agent and the main
  acceptance gate for the whole plan.**
- A plan may contain scenarios. When it does, the initial architect matches
  them to the plan's top-level capabilities. Where coverage is short, it writes
  more.
- A scenario the architect writes is abstract enough not to fix early choices:
  "the user activates email sending", not "the user clicks the Send email
  button", unless the plan requires the latter.
- The person reviews the scenarios as they review the initial decomposition,
  and that review gives the scenarios their authority.
- `start-run` offers an optional stop for that review before implementation.
  Without the stop, implementation starts at once, and everything stays
  reviewable as the run proceeds. A person who dislikes what they see stops
  the run.
- The runner is Cucumber. Scenarios can be slower than unit tests, and running
  them independently of the Vitest suite is an advantage.
- Scenarios bind to the real UI through a driver with a quick and a full mode,
  as cucumber-viz's template applications do.
- Revising the analysis with a note at the review stop, and continuing from a
  stopped run's branch, are future work.
- The first step is scenarios associated with the top-level capabilities, and
  gates that require them before work is declared done. A formal red, green,
  refactor model is a later step.
- The harness keeps track of the top-level capabilities' scenarios. A plan
  cannot be declared finished until every one of them passes, no longer marked
  as unfinished and with every step defined. An agent tells the harness as soon
  as a scenario is implemented.
- The mark that excludes an unfinished scenario from the gates is managed by
  the harness, not by an agent.
- Top-level capabilities are independent of each other, so the architect
  writes each scenario for one capability alone.
- A scenario the plan defines may combine capabilities that are otherwise
  top-level. The architect then defines those top-level capabilities, writes
  scenarios for each, ideally picked from the plan's scenario, and associates
  them with it as its sub-scenarios. The plan's scenario is an integration
  scenario, and it stops being marked unfinished once all its sub-scenarios
  have.

## Scenario and glue

An acceptance test combines three layers:

| Layer | Example | Whose it is |
| --- | --- | --- |
| Behavior | Given a customer with an address, when the user activates email sending, then the customer receives one email | The plan's: it is the requirement |
| Interaction boundary | A button, a CLI flag, an HTTP route, a function | Partly the plan's, mostly design |
| Glue | Fixtures, imports, modules, test doubles | Design |

A plain test fixes all three at once. Gherkin separates the first from the
other two: the scenario text is the behavior, and the step definitions are the
boundary and the glue. The text can bind early without binding a design. The
step definitions are written when the interface is designed, by the engineer
who designs it. A contract or placement revision changes step definitions and
leaves the scenarios, and the plan's completion criterion, unchanged.

## Where scenarios come from

| | From the plan | Written by the architect |
| --- | --- | --- |
| What it is | A requirement the person wrote | The architect's interpretation of the plan |
| Level of detail | Whatever the person wrote; "clicks the Send email button" is then a requirement | Abstract interaction, concrete data, unless the plan is concrete |
| Authority | The plan's | The person's review |

The architect's scenarios make an existing judgment concrete: the entry
capabilities are already its interpretation of the plan. What the person
reviews becomes more specific, and more of it can be verified.

**Keep the interaction abstract and the data concrete.** "When the user
activates email sending" fixes no UI. "Then the customer ada@example.com
receives one email" keeps the outcome observable; "then the email is sent"
does not say what to verify. Data can be design too, such as a subject line,
so an architect's scenario uses only data the plan states or implies.

**A scenario names no module, deeper capability or symbol.** A scenario is a
requirement; naming a module in one would turn a forecast into a binding. The
harness can warn when a step names an exported symbol or a file path that the
architect view records.

**Scenarios cover what the plan asks.** Each scenario is an obligation with a
cost in step definitions, gate time and maintenance. The architect adds edge
cases only where the plan mentions them. Other edge cases belong in the
engineer's own tests, not in the plan's acceptance.

## Review

With the stop, the run enters `awaiting-review` after its initial analysis.
The person approves it or stops the run. Without the stop, the run proceeds
and the person reviews the same records while it works. The approval records
who approved and when; a run without the stop records its scenarios as not
reviewed.

**Proposed, not agreed: one rule in both modes.** Scenario text freezes when
the analysis is accepted. An agent may propose an additional scenario, which
the harness records and writes and a person can review, and never changes or
removes one. A conflict with a scenario ends the run as
`unresolved`, with its evidence. The option then changes when the person
looks, never what the run does, and a review during the run judges the same
frozen requirements an approval would have judged.

The stop touches the run's machinery:

- Time spent in `awaiting-review` counts toward neither `runAbsoluteMs` nor the
  invocation timeouts.
- A run awaiting review holds the project lock, so a second `start-run` is
  `busy` until the person approves or stops it.
- A stopped run cannot continue today. To act on a review, the person revises
  the plan and starts a new run from the original baseline.

## Matching scenarios to entries

| Shape | Meaning | Where it goes |
| --- | --- | --- |
| Several scenarios, one entry | Normal | That entry's work item |
| A plan scenario that combines several entries | An [integration scenario](#integration-scenarios) | Its sub-scenarios, one or more per entry, each in its entry's work item |
| A plan scenario that matches no entry | A missed entry, or behavior that already exists | A new entry, or assigned to the entry whose existing behavior satisfies it |
| An entry with no scenario | A coverage gap | The architect writes scenarios for it |

These give the harness form rules for the initial analysis, which today it has
no way to express:

- every scenario the architect writes is assigned to exactly one entry;
- every plan scenario is assigned to exactly one entry, or is an integration
  scenario with sub-scenarios;
- every entry has at least one scenario;
- every acceptance reference is cited by at least one scenario.

Whether the coverage is sufficient remains the architect's judgment and the
person's review. A scenario the person wrote can no longer go unassigned.

The matching also runs the other way. A scenario's `When` steps name what the
outside does, which is close to the entry points. Reading the scenarios first
may be a better way to identify top-level capabilities than reading the plan's
prose.

## Integration scenarios

Top-level capabilities are independent, so a scenario the architect writes
never spans two of them. An integration scenario comes only from the plan: a
scenario the person wrote that combines capabilities the analysis defines as
separate top-level capabilities. The architect decomposes it:

1. define the top-level capabilities;
2. write scenarios for each, ideally picking their steps from the integration
   scenario;
3. associate those sub-scenarios with the integration scenario.

No agent declares an integration scenario. Its state follows from its
sub-scenarios, so the harness manages its pending tag, and the review shows
the person's scenario beside the sub-scenarios derived from it.

### Steps picked verbatim

When a sub-scenario's steps are copied word for word from the integration
scenario, every step of the integration scenario is defined once its
sub-scenarios are bound, and nobody writes step definitions for it. The
harness verifies at analysis time that each step of an integration scenario
appears verbatim in one of its sub-scenarios. A step about behavior the
project already has may instead be covered by an existing step definition,
which `cucumber-js --dry-run` reports without running anything. Rewording a
picked step breaks the rule.

### Bridging Givens

Slicing alone rarely yields independent scenarios:

```gherkin
Scenario: Sent emails appear in the history
  Given a customer with the address ada@example.com
  When the user activates email sending
  Then the customer receives one email
  When the user opens the email history
  Then the history lists one email to ada@example.com
```

The sending sub-scenario is its first three steps. The history sub-scenario
cannot begin by activating email sending, since it would then depend on the
other capability. It begins with a **bridging Given**, such as "Given an email
to ada@example.com was sent", which replaces the other capability's action
with the state it leaves. Bridging Givens appear only in sub-scenarios, so the
verbatim rule does not apply to them.

A bridging Given is an assumption about what another capability leaves. The
integration scenario runs the real action in its place, so it is where that
assumption is verified.

### Running an integration scenario

- **Its run loads several owners' step files.** Its steps are defined by the
  owners of its sub-scenarios, so a run scoped to one module cannot bind it.
  It runs in a run that loads exactly those owners' step files. Its feature
  file lives at the lowest common ancestor of those owners.
- **A shared step has one definition.** A step such as "Given a customer with
  the address ada@example.com" may occur in several sub-scenarios. Defined by
  two owners, it is `ambiguous` in the combined run. Either the harness assigns
  each shared step text to one owner at analysis time, or shared steps are
  defined once at the common ancestor and loaded by every run beneath it. The
  first keeps ownership simpler.
- **It becomes due once its sub-scenarios are implemented.** Its pending tag
  is removed when every sub-scenario is `implemented`, not merely `declared`,
  so it first runs at the next gate, after its sub-scenarios have passed.
- **A failure is a composition failure.** When the sub-scenarios pass and the
  integration scenario fails, a bridging Given assumed what the real behavior
  does not do, and its repair may lie outside the scope of the work item whose
  gate ran it. In the first step the failure either returns to that work
  item's local architect, which uses the placement and delegation paths or
  reports `unresolved`, or ends the run as `unresolved`. An integration work
  item at the common ancestor is a later step.

## The acceptance gate

Capabilities, work items and the required set are the means; the scenarios
are the end. The
[retirement of forecasts by deduction](2026-09-23-capability-registry-analysis.md#retirement-at-completion)
works unchanged. A feature or correction plan whose analysis leaves an entry
without a scenario cannot be accepted.

This section is the proposed design for the first step. It follows from the
decisions above; its details are not yet agreed.

### Every gate runs the scenarios

ramify-audit audits every committing gate, the iteration gates included, and
the harness's gate checks already run inside it as a registered executor that
the harness controls. Running every scenario in every audit would fail each
one until the end of the implementation, because most scenarios are not
implemented until late. The gates therefore exclude the scenarios not yet
implemented, and the exclusion is a mark in the source that the harness
manages.

### The harness owns the feature files

- When the initial analysis is accepted, or approved with the review stop, the
  harness writes each scenario's feature file into its entry owner's
  `src/tests/`, from its own records. The text is exactly what was reviewed.
- Each scenario carries a stable identity tag, such as `@s-003`, and a pending
  tag. This document calls it `@ramify-pending`; its name is open. A
  harness-specific name keeps it apart from a `@wip` a person uses by hand.
- An agent never edits a feature file. Any agent change to one is a guarded
  change, so the frozen-text rule has no exception for tags.
- The harness removes the pending tag when a declaration is accepted, as a
  mechanical write while the single writer is idle, committed with the gate.

Agents write the step definitions; the harness writes the feature files. This
is a narrow exception to agents being the only writers of source: the feature
files are the requirement, which the harness already holds, and it writes
nothing else.

### The harness tracks every scenario

Each scenario has a record: its identity, its entry, its origin, the plan or
the architect, its text hash and its state. The state moves one way:

| State | Meaning | Pending tag |
| --- | --- | --- |
| `pending` | Not yet declared implemented | Present |
| `declared` | An agent declared it implemented; the next gate verifies it | Removed |
| `implemented` | It passed a gate after its declaration, and is due at every later gate | Removed |

An implemented scenario that fails a later gate fails that gate, like any
regression. It never returns to `pending`.

An integration scenario is never `declared`. It is `pending` while any of its
sub-scenarios is not `implemented`; the harness then removes its tag, and it
becomes `implemented` when it passes. A capability's progress is its
implemented scenarios out of all its scenarios, a measure the
[progress projection](2026-09-23-capability-registry-analysis.md#for-the-progress-projection-now)
lacks today.

### The engineer declares

An engineer's iteration submission names the scenarios the iteration bound
and ran green. For each accepted declaration the harness removes the pending
tag, and the iteration's gate runs the declared scenarios strictly:
`undefined`, `pending` and `ambiguous` steps are failures. On a pass the
scenarios become `implemented`. On a failure the ordinary repair rounds apply;
when they are exhausted, the declaration is withdrawn and the harness restores
the pending tag in a new commit.

- A declaration is refused while the work item has an open requirement. A
  scenario that passes while a provider obligation is unverified passes against
  a fake. The harness's records already hold the requirements, so this rule
  needs nothing from the future no-fake rule.
- The local architect's completion request is refused while any scenario of its
  entry is not `implemented`, as a request with an open requirement is refused
  today.
- Existing behavior still needs one binding iteration. A goal already met is no
  longer completed with no iteration: its scenarios need step definitions, so
  the local architect assigns an iteration that writes them.

### What each gate runs

| Checkpoint | Vitest tests | Scenarios |
| --- | --- | --- |
| Iteration | Owned by the write scope, as today | Every untagged scenario, in quick mode |
| Work item | The whole project | Every untagged scenario, in quick mode |
| Final | The whole project | Every scenario, in full mode; none may be tagged |

Untagged scenarios include those the project already had, so every gate runs
the project's regression acceptance. Its cost grows as scenarios accumulate;
Cucumber's tag filtering and `--parallel`, and later ramify-audit's
module-scoped selection, are the remedies once that time matters.

### What the harness verifies at every gate

- Each tag agrees with its record: a pending tag on a `pending` scenario, none
  on a `declared` or `implemented` one.
- No feature file changed except by the harness, and each matches its recorded
  text hash.
- Every untagged scenario runs, strictly.
- The audit evidence records how many scenarios the pending tag excluded, so a
  pass is not read as full acceptance.

### When a plan is finished

A plan is finished when every tracked scenario, integration scenarios
included, is `implemented`, its feature
file carries no pending tag and matches its recorded text, every step has a
definition, and it passes in full mode at the final gate. The project's tests,
its type check and a complete Ramify check pass too.

## Binding

The entry work item's first iteration binds the entry's scenarios: it writes
their step definitions against the interface it designs then. The runner
reports each step as `undefined`, `pending`, `failed` or `passed`. In the first
step a gate runs a scenario only once it is declared, so the harness records
when each scenario was declared and when it first passed, not its red phase.

- A feature scenario declared in the same iteration that bound it, with no
  implementation change, is shown to the local architect. It may be verified
  reuse, or glue that asserts nothing.
- A correction's reproduction scenario must be bound and failing before the
  fix; see
  [refactoring and debugging plans](2026-09-23-refactoring-and-debugging-plans.md#red-on-the-baseline).
  Observing that red phase belongs with corrections and the formal red, green
  model, not with the first step.
- Red first on the baseline is not required for features. On the baseline the
  interface does not exist, and a failure there shows only a missing import.

**Proposed, not agreed: glue is guarded once it passes.** With scenarios as
the main gate, a step definition that asserts nothing is the easiest way to
pass. Once its scenario first passes, a change to a step definition is a
guarded change that needs the local architect's recorded reason. The design
stays free to change, and a weakening becomes visible.

## Quick and full mode

cucumber-viz's template applications (`template-apps/default-web` and
`example-apps/site-monitor` in the installed package, under
`dev/cucumber-support/`) bind every step through a `TestDriver` interface with
accessible, user-centric queries: `navigate`, `getByRole`, `click`, `type`,
`waitForText`. `TEST_MODE` selects one of two implementations, and the same
step definitions run in both:

| | Quick mode | Full mode |
| --- | --- | --- |
| UI | The real application, router and components, in JSDOM | A real browser |
| Client to server | The real tRPC router, called in-process through `createCaller` | HTTP to a running server |
| Database | PGLite, an in-memory Postgres truncated between scenarios | A test Postgres database |
| Authentication | A mock client; protected procedures still run against the session context | Real sign-up and sign-in |

This answers the question of how high to bind. A scenario about a person
binds at the UI, through the driver. The choice between a fast and a complete
run is the execution mode, fixed for the run, not a property written into each
scenario. Quick mode does not verify what JSDOM lacks, layout and styles, the
HTTP transport and serialization, server wiring or real authentication; full
mode does.

Test doubles for systems outside the project, such as an email provider,
remain in both modes. They are not [fakes](../glossary.md#fake): a fake stands
in for a provider of the project that does not exist yet.

**The scenario harness is the target project's.** This driver is specific to
one stack, React, tRPC and Prisma, and ramify-agent cannot supply one in
general. The target project provides its world, its driver, both modes and
their commands, and the readiness gate verifies that both commands exist and
run. A project whose outside is a CLI or an API provides an equivalent driver
for it.

## Cucumber and the module tree

Gherkin is the language; Cucumber is one runner that executes it. The Gherkin
parser works without the runner, so the harness can parse scenarios and apply
the form rules above in any project.

A step definition is ordinary TypeScript. Placed in a module's `src/tests/`,
its imports of product code are ordinary imports that Ramify's rules apply
to. The driver and the world are shared testing source: they can sit at a
common ancestor and be exposed to its descendants through `expose-test`.

The binding of a `.feature` file to a step definition is not an import.
Cucumber resolves it at runtime, by matching step text against every step
file the run loaded, and Ramify does not analyze feature files. If one run
loads the step files of several modules, a scenario owned by one module can
bind to another's steps, and Ramify does not see it. The cucumber-viz template
configuration loads the steps of every domain in one run.

A run scoped to one module restricts both `paths` and `import` to that
module's `src/tests/`:

```js
{ paths: ['subs/notifications/src/tests/features/**/*.feature'],
  import: ['subs/notifications/src/tests/steps/**/*.ts'] }
```

The harness derives its test selection per module already, so it can build
these runs, and it can verify that no run loads a step file outside the
owners of the scenarios it runs, counting an integration scenario's
sub-scenarios among them. Keeping the binding inside the owner is then a rule
the harness enforces, not one Ramify enforces.

A plan's scenarios stay in the plan, which the harness captures and never
edits. The executable copy lives in the owner module's `src/tests/`, where the
harness writes it, as
[the harness owns the feature files](#the-harness-owns-the-feature-files)
describes. A placement revision moves the file; its recorded text hash still
holds.

## Scenarios accumulate

After a run, its scenarios stay in their owner modules.

- **Regression.** Every later run's final gate runs them.
- **Breaking changes.** An agent never changes a scenario, so a plan that must
  change behavior an existing scenario describes has to say so itself, and the
  review is where that change is approved. The compatibility assessment can
  cite the scenario, so a required break becomes visible at analysis time.
- **Refactoring.** The accumulated scenarios become a refactor's protected
  boundary, beside its target assertions. A refactor plan needs no scenarios
  of its own.
- **Onboarding.** A module's scenarios state its behavior in readable form, as
  the principle that
  [a module carries its own onboarding](../harness.spec.md#a-module-carries-its-own-onboarding)
  asks.

## What this changes

- The [harness principles](../harness.principles.md) need a principle,
  folded in beside "Fakes and tests guide delegation": a plan's acceptance is
  its scenarios, bound late and frozen once accepted.
- The [glossary](../glossary.md) needs scenario, step definition, binding and
  execution mode.
- The [architecture](../architecture/autonomous-implementation-loop.md)
  changes in its initial analysis, its work-item and final gates, and the
  review stop.
- Plan 3's decision of 2026-09-20, no separate acceptance check in the MVP, is
  reversed on purpose, and so is its deferral of a second test runner. Its
  deferred "executable acceptance check, a file of the target project beside
  its plan" is what the scenarios provide.
- The initial analysis submission gains scenarios with their origin, plan
  references and entry; the local architect's and engineer's briefings carry
  them, and the engineer's submission gains its declarations.
- The harness gains scenario records, writes the feature files and their
  pending tags, and adds a scenario check to every committing gate it runs
  through ramify-audit.
- The local architect can no longer complete a work item with no iteration,
  since its scenarios need step definitions.

## Future

The first step is scenarios associated with capabilities, and gates that
require them before work is declared done. Later steps:

- **A formal red, green, refactor model for the whole process.** The plan's
  scenarios give it an outer loop: red when they are bound and failing, green
  when they all pass. The delegation loop already exists. It needs two further
  rules: green counts only with no fake in place, which the fake-naming
  principle makes verifiable; and a refactor step, either as an iteration kind
  after green whose gate verifies that the module's exposed surface is
  unchanged, or as the refactor plan kind of the
  [refactoring and debugging analysis](2026-09-23-refactoring-and-debugging-plans.md).
  Red and green of the engineer's own tests stay observable, not enforced.
- Revising the analysis with a note at the review stop, which runs the initial
  analysis again with the person's feedback.
- Continuing from a stopped run's branch with revised scenarios. It would reuse
  completed work, some of which may rest on the rejected scenarios.

## Open questions

1. Are the proposals above agreed: frozen text with proposed additions only,
   the first-step design of the acceptance gate, and guarded glue?
2. Does a shared step get its single definition from an owner the harness
   assigns at analysis time, or from the common ancestor?
3. Does an integration scenario's failure return to the local architect of the
   work item whose gate ran it, or end the run as `unresolved`, until an
   integration work item exists?
4. What is the pending tag called?
5. Can a person approve during a run started without the stop, so the records
   show that the review happened?
6. Where does the Cucumber summary come from? ramify-audit reads it through
   `CUCUMBER_SUMMARY_FILE` and treats a suite with undefined steps as `warn`,
   which passes. No writer is in the cucumber-viz template, so the target
   project or a harness-supplied formatter provides it, and the strict rule for
   untagged scenarios must hold whatever that formatter reports. A spike on the
   `collection-review` fixture, with one run scoped to one module, would settle
   it.
7. How do scenarios enter the architect view? `tests.jsonl` records Vitest
   test titles; scenario names would make behavior searchable there.
