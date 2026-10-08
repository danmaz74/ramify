# Agent declarations and automated audit evidence

**Date:** 2026-10-07. **Status:** analysis of the current implementation and
proposed Plan 21 against Dan's clarified responsibility boundary. This document
records the relevant principles, existing issues, adopted responsibility,
registration and final-verification decisions, and a potential approach for
further investigation.
The remaining protocol and lifecycle design is provisional; this document
does not authorize implementation.

**Plan consolidation, 2026-10-07:** Dan chose to carry these changes in the
expanded [Plan 21](../plans/21-project-boundary-adoption/main-plan.md), rather
than a separate plan. The findings below describe the inspected source and
original Plan 21 proposal. The expanded plan adopts the recorded responsibility
choices and approved optional `where`; exact protocol/lifecycle contracts remain
an iteration 0 prerequisite. This update does not implement runtime behavior.

The implementation inspected is in the Plan 20 preparation worktree at
`4b0123564b02412d1db0416b81e11416d82baaf1`. Plan 21 is the uncommitted
[expanded adoption and completion plan](../plans/21-project-boundary-adoption/main-plan.md)
in that worktree. Dan has since updated the audit responsibility paragraph in
the worktree's harness principles. The runtime and previously planned scenario
mechanisms have not been aligned by the work recorded in this analysis.

## What we want to achieve

The harness must never make semantic calls. Deciding that a requested scenario
has been implemented, that a test represents a requirement, or that a solution
fulfills an assignment requires an agent's interpretation. Passing automated
tests establishes an execution result; it does not establish those meanings.

For an engineer assigned to implement a scenario, the engineer reports what
it implemented. That report is distinct from the responsible architect's
assessment of whether the requirement is satisfied. A reviewer could assess
the work and report concerns. Running audit after an iteration establishes
test health and provides evidence for finding and fixing regressions. Agents
investigate failures and make repair decisions.

The responsible architect also determines whether a registered scenario or
test is implemented and passing. The harness trusts that declaration. It does
not establish, confirm or invalidate the obligation's status from audit
results, and it does not match evidence references to test files or execution
results. If required declarations are missing when an architect requests
completion, the harness asks that architect for clarification.

Dan's further clarification is explicit: audit has no responsibility for
mapping scenarios to tests. Establishing what belongs in the test suite,
whether a required test has been created, and whether it exercises the intended
scenario belongs to agents. Audit establishes that the configured test suite
is green; it does not assess the suite's semantic adequacy. Runner discovery
and execution completeness remain execution concerns, not requirement mapping.

| Participant | Responsibility in the clarified goal |
| --- | --- |
| Engineer | Implements the assigned work and declares what was done, including scenario or test implementation |
| Responsible architect | Coordinates correct implementation and determines and reports whether required scenarios and tests are implemented and passing |
| Reviewer or other judging agent | Interprets the assignment, implementation and declarations when performing a review |
| Audit | Verifies automated test execution and reports results, failures and incomplete execution |
| Harness | Records registered obligations and architect declarations, validates IDs and authority, and asks about missing declarations at completion |

The possibility of review does not establish a new mandatory review stage.
Similarly, keeping the harness free of semantic judgment does not prohibit
schema validation, identifier checks, write-boundary enforcement or scheduling
from explicitly recorded facts.

The distinction applies to both passing and failing results. A passing test
does not prove that its author's translation covers the intended requirement.
A failing test does not, by itself, prove that an engineer's implementation
claim is false or identify the cause of the failure. A missing or unexecuted
required test is not a pass. None of these execution facts supplies the missing
semantic judgment.

The goal also does not imply a fresh full-suite run after every iteration.
Partial selection, applicable evidence reuse and explicit full gates concern
automated verification policy; they do not change who judges the meaning of
the work.

## Relevant established principles and responsibilities

The following principles are relevant to evaluating the process. Their
implications here are an analysis of the existing documents, not amendments
to those documents.

| Principle | Relevance to this analysis |
| --- | --- |
| [An Executable Specification Is a Translation](../harness.principles.md#an-executable-specification-is-a-translation) | Tests carry their author's interpretation; execution does not establish satisfaction of the semantic requirement |
| [Free-Text Judgment Requires an Agent or LLM](../harness.principles.md#free-text-judgment-requires-an-agent-or-llm) | Requirement interpretation and causal diagnosis belong to agents; structured parsing remains mechanical |
| [The Harness Stays Small; Ramify Stays Outside Its Control Loop](../harness.principles.md#the-harness-stays-small-ramify-stays-outside-its-control-loop) | Agents make every semantic decision; runtime failure is not a semantic outcome |
| [ramify-audit Owns Check Execution Evidence](../harness.principles.md#ramify-audit-owns-check-execution-evidence) | The harness records producer execution results; the local architect reads those results and the implementation and tests, assesses requirement satisfaction, and reports a judgment the harness trusts and records |
| [Bounded Context Is What Makes Agents Efficient](../harness.principles.md#bounded-context-is-what-makes-agents-efficient) and [Results Are Need-to-Know Too](../harness.principles.md#results-are-need-to-know-too) | Assessment needs the relevant requirements, results and retrievable evidence without automatically repeating the entire implementation history |
| [Principles Guide Implementation; Specifications Constrain the Plan](../harness.principles.md#principles-guide-implementation-specifications-constrain-the-plan) | A plan or implementation drift is evaluated against the principles; its existence does not establish a new responsibility allocation |
| [Every Engineer Uses the Same Iteration Lifecycle](../harness.principles.md#every-engineer-uses-the-same-iteration-lifecycle) | A correction to scenario assessment should fit the existing assignment, result, review and recovery lifecycle |
| [Fakes and Tests Guide Delegation](../harness.principles.md#fakes-and-tests-guide-delegation) | Real integration remains necessary; passing against a fake or changing a test cannot erase the original behavioral requirement |
| [Trust Follows Provenance](../harness.principles.md#trust-follows-provenance) and [State Lives in the Repository](../harness.principles.md#state-lives-in-the-repository) | Recorded claims retain their author and context; recovery cannot invent completion or depend on a remembered conversation |
| [An Engineer's Failure Is Its Architect's Decision](../harness.principles.md#an-engineers-failure-is-its-architects-decision) | The architect decides what follows an unsuccessful engineer result; that result alone does not settle requirement satisfaction |

The existing architecture supplies the concrete role allocation. Under
[A local architect for each module work item](../architecture/autonomous-implementation-loop.md#2-a-local-architect-for-each-module-work-item),
the architect delegates iterations, assesses their results and requests
completion once local work and dependencies are satisfied. Under
[Harness-owned testing gates and repair](../architecture/autonomous-implementation-loop.md#harness-owned-testing-gates-and-repair),
the local architect assesses whether the result fulfills its goal; passing
commands alone do not prove semantic acceptance.

[A Plan's Acceptance Is Its Scenarios](../harness.principles.md#a-plans-acceptance-is-its-scenarios)
also remains relevant. It establishes scenarios as acceptance requirements,
preserves their text and requires real integration and final execution. Its
pass-based completion wording creates the tension recorded in finding 1. It
cannot be treated as an unqualified basis for transferring semantic judgment
to the harness or audit. The current principle about audit describes execution
evidence broadly; Dan's clarification explicitly excludes scenario mapping and
assessment of what tests ought to exist from audit's responsibility. His
subsequent decisions on final verification and the audit responsibility
paragraph are recorded below; these close the corresponding review P1s at the
design level without claiming that the existing runtime is already aligned.

## Issues in the current implementation and documents

### 1. The documents express two different meanings of acceptance

The [harness principles](../harness.principles.md#an-executable-specification-is-a-translation)
already distinguish a semantic specification from its executable translation.
They say that the translation carries its author's interpretation and that a
verdict concerns the executable specification, never the semantic one. The
premise likewise says test cycles do not make a solution the intended solution.

However, [A Plan's Acceptance Is Its Scenarios](../harness.principles.md#a-plans-acceptance-is-its-scenarios)
says a plan is finished when every scenario passes in full mode at the final
gate, with a separate qualification for non-functional deviations. The
[acceptance-scenarios architecture](../architecture/acceptance-scenarios.md#11-the-final-gate)
ties completion to every tracked scenario being `implemented` and the full
scenario check passing.

These formulations make executable scenario success stand for completion of
the scenario work. That is stronger than the evidence described by the
translation principle. The existence of other agent assessments elsewhere in
the workflow does not remove this conflict in the meaning assigned to scenario
results.

### 2. A passing gate creates the implementation fact

The implementation does receive an agent declaration first. In
[RunService](../../subs/harness/src/run/service.ts), `declareScenarios` accepts
scenario IDs from an invocation and records `scenario-declared`. The problem
is not a complete absence of engineer input.

The subsequent `recordScenarioPasses` method checks a passing gate and its
passing scenario results. For a scenario in `declared`, the harness then writes
`scenario-implemented`. That event records the scenario and gate; its
[schema](../../subs/harness/subs/scenarios/src/states.ts) describes the gate as
the attempt that passed it. The authoritative transition to `implemented` is
therefore produced by the harness from execution evidence.

The resulting state merges two different facts: the engineer's claim about
the work and the automated result of running its executable translation.
Under the clarified meaning of implementation, a passing result cannot supply
the semantic authority for that transition. This is especially visible when
a translation is incomplete or asserts the wrong behavior: successful execution
still triggers the same implementation event.

### 3. Unsuccessful repair can automatically withdraw a declaration

`withdrawScenarios` in [RunService](../../subs/harness/src/run/service.ts)
returns declared or bound scenarios to `pending` when the work item leaves its
repair path without a pass since declaration, for example through exhaustion,
a placement request or a yield. This is not an automatic withdrawal after
every failed test; the scenario retains its state during ordinary repair.

At that exit, however, the harness retracts the declaration according to
execution history and workflow outcome. Neither establishes what was actually
implemented. A failure could concern the implementation, the test translation,
the environment or another dependency; the result alone does not decide which.

The withdrawal also restores the pending tag in generated feature files. Thus
the conflation changes subsequent test eligibility as well as recorded status:
the test's treatment depends on a harness-derived withdrawal of the claim.

### 4. Diagnostics make causal claims about integration failures

The [acceptance-scenarios architecture](../architecture/acceptance-scenarios.md#10-integration-scenarios)
describes an integration scenario failing while its sub-scenarios pass as a
composition failure caused by a bridging Given assuming behavior that the real
implementation does not provide.

The implementation makes this interpretation concrete. `compositionLines` in
[RunService](../../subs/harness/src/run/service.ts) says the step definitions
work individually but not together, and identifies bridging Givens as suspect.
The supporting [composition analysis](../../subs/harness/subs/scenarios/src/composition.ts)
uses scenario result combinations and matching step text.

The observed facts are the integration failure, the sub-scenario passes and
the recorded steps. Those facts do not establish the causal account or the
location of the defect. The generated explanation is a semantic diagnosis,
even when phrased as suspicion. It goes beyond relaying automated evidence for
an agent to interpret.

### 5. The conflation affects scheduling and final completeness

The implementation event is not merely a display label. `integrationItemsDue`
uses the resulting `implemented` states to create integration work items.
[dueIntegrations](../../subs/harness/src/work/integration.ts) waits for the
sub-scenarios to have that state. The final gate uses
[incompleteScenarios](../../subs/harness/src/run/feature-files.ts) to reject a
run with any scenario not yet `implemented` before final execution.

Scheduling from recorded states and checking a structured completion condition
are mechanical operations. The issue is the meaning of their input: an
implementation fact produced from a passing test. Consequently, the same
unsupported semantic equivalence affects when integration work starts and
what the harness reports as incomplete or complete.

## Issues in Plan 21

### 6. The adoption plan leaves the scenario responsibility conflict intact

Plan 21 concentrates on provider adoption, ownership, configured discovery,
scope verification, audit evidence and recovery. Its
[verification contract](../plans/21-project-boundary-adoption/contracts.md#6-verification-and-configured-discovery)
retains explicit scenario obligations. Its commit-audit contract requires the
audit composition verdict together with required scope/scenario evidence.

Those contracts address execution and evidence completeness. They do not
address the pass-driven `scenario-implemented` event, automatic withdrawal or
generated causal diagnosis described above. Successful delivery of the plan
as written therefore does not establish the clarified responsibility boundary.
More accurate producer evidence cannot give the harness semantic authority.

### 7. P4 introduces another verification obligation without resolving meaning

[P4](../plans/21-project-boundary-adoption/provider-requirements.md#p4-revised-execution-contract)
distinguishes assignment verification from ordinary project-impact auditing.
It requires coverage of assigned owners, included subtrees and explicit
suites/scenarios, including unchanged assigned tests, alongside the applicable
audit impact obligations. The
[provider contract review](../plans/21-project-boundary-adoption/provider-contract-review.md#p4-configured-execution-and-diagnostics)
describes separate assignment and project-audit conclusions from shared
execution evidence.

Deterministic selection of tests from explicit assignments is not itself a
semantic call. Configured discovery, inclusion of new tests and refusal to pass
missing required execution are also valid automated-evidence concerns. The
issue is that these extra coverage requirements do not establish that an
assigned scenario was implemented or correctly translated into tests. A
complete assignment test run can still exercise an incomplete translation.

P4 therefore adds a distinct scope-coverage policy beyond ordinary impact-based
regression verification while leaving the disputed implementation inference
untouched. Its extra conclusion cannot answer the semantic completion question
that prompted this analysis.

### 8. The additional policy creates a provider dependency and acceptance cost

P4 requires a settled public composition for both committed and dirty work,
configured discovery, source identity, reuse and complete execution. The plan
records this contract as open even though public ownership grouping, dispatch
and audit-service operations already exist. It makes a runnable P4 witness a
convergence requirement and a prerequisite of
the former scope-verification iteration 5, now replaced in the
[expanded schedule](../plans/21-project-boundary-adoption/iterations/README.md).

[PB3-T06](../plans/21-project-boundary-adoption/acceptance.md) specifically
requires unchanged assigned tests and changed dependent-module impact to be
satisfied by the settled P4 contract. This adds integration and acceptance work
for the separate assignment policy. Passing that witness would prove the
requested execution coverage, not an engineer's semantic implementation claim.
The published provider pair alone does not satisfy the plan's stated P4
prerequisite.

P3, public loading of committed audit configuration, is a separate integration
gap. The clarification about semantic judgment does not itself establish that
P3 is unnecessary or already satisfied.

### 9. The proposed protected wording preserves the disputed boundary

The [protected wording proposal](../plans/21-project-boundary-adoption/protected-wording-proposal.md)
corrects impact selection for inert and excluded paths, but retains the current
assignment-verification sentence and says empty impact selection does not
waive scope verification or scenario obligations. It explicitly proposes no
principles change.

That proposal concerns which automated obligations survive an empty impact
selection. It does not express who declares semantic implementation, what a
passing result establishes, or the limits on harness-generated diagnosis.
Thus the proposed specification patch and the existing scenario architecture
leave the central conflict unresolved even if their discovery and impact rules
are implemented exactly.

## Additional findings from reviewing the process

### 10. Architect assessment is already assigned, but not reflected in scenario authority

The local architect's established responsibility is to assess the engineer's
result and decide whether its goal is satisfied. The
[local architect procedure](../../subs/harness/src/prompts/local-architect.procedure.md)
also asks it to establish whether existing behavior already satisfies the goal
before assigning new work.

The scenario-specific process instead makes engineer declarations and passing
gates sufficient to produce `implemented`. It does not require a distinct
architect judgment about the satisfaction of each required scenario before that
state is reached. Review of individual scenarios may occur through the
architect's broader assessment, but its conclusion is not represented as the
scenario's authoritative satisfaction fact.

The gap is therefore between an existing agent responsibility and the
communication/state contract supporting it. The engineer's report of work done
and the architect's acceptance of that work are not interchangeable.

### 11. The architect can declare bindings, but has no explicit satisfaction submission

The architect's [submission contract](../../subs/harness/src/work/submission.ts)
accepts `request-completion.scenarios`. Its documented meaning is that existing
step definitions already bind those scenarios. The request's prose summary can
express an assessment, but the harness does not record that prose as a distinct
structured judgment that specified required scenarios are satisfied.

The same contract's `assign` submission has no separate field for reporting
scenario satisfaction after an earlier iteration. Its `assignment.scenarios`
field identifies what the next engineer is expected to bind. That field is
explicitly informative, and is not a report that the architect assessed the
previous work as satisfying those scenarios.

These are different communication needs. A work item can satisfy some scenarios
and still need further iterations for others. The lack of an explicit partial
satisfaction report matters because scenario status already affects integration
scheduling, as described in finding 5. Whether declarations need to happen
incrementally, or only at work-item completion, remains a design question to
investigate.

### 12. Existing reviews do not provide a distinct scenario satisfaction record

The [scope review procedure](../../subs/harness/src/prompts/scope-review.procedure.md)
asks whether the candidate delivers the assignment's requested behavior and
identifies omitted promised cases. The
[code review procedure](../../subs/harness/src/prompts/code-review.procedure.md)
also examines behavior and unhandled cases. Those reviews can supply useful
semantic evidence to the architect.

Their reported coverage concerns inspected and missing changed paths. An
absence of review concerns is not an explicit assessment of every required
scenario or of the adequacy of its test translation. The current review
procedures therefore do not fill the missing architect-to-harness satisfaction
contract. This finding does not establish a need for a new reviewer role or a
mandatory separate review of every scenario.

The suite can be green while a required test was never created, was removed,
or checks the wrong behavior. Whether the required test exists and represents
the requirement is an agent assessment. Audit's configured discovery and
execution results cannot establish that missing semantic relationship.

## Additional use case: tests required during module delegation

The responsibility question also applies to required tests established while
delegating work. These are related to initial acceptance scenarios, but do not
necessarily have the same origin, representation or completion boundary.

### Requirements and executable evidence at different levels

| Kind | Origin and purpose | Current representation |
| --- | --- | --- |
| Plan acceptance scenario | An outcome specified in the initial plan, potentially combining several modules | Captured Gherkin scenario, assigned to an entry or decomposed into sub-scenarios and an integration scenario |
| Entry acceptance scenario | An acceptance requirement allocated or written by the initial architect for an entry capability | Scenario record linked to an entry and owner, with provenance and possibly a parent integration scenario |
| Delegated behavioral case or required test | Behavior or evidence required to implement, expose or integrate a capability during the run | Assignment goal/completion evidence, capability examples and use cases with test references; retained contract records also have explicit conformance suites |

The [acceptance-scenarios architecture](../architecture/acceptance-scenarios.md#2-initial-analysis)
requires every captured plan scenario to be represented, and every entry to
have at least one scenario. The initial architect performs the semantic
allocation and decomposition. Thus initial acceptance includes both the
plan's supplied scenarios and architect-authored entry scenarios; it is not
limited to tests discovered later in module source.

Ordinary assignments can require testing through their goal and
`completionEvidence`, and can identify existing acceptance scenarios to bind
through `assignment.scenarios`. These fields do not establish that every
required module test has a Gherkin scenario record or that every test obligation
comes from the initial scenario set.

### What current capability delegation records

The current [capability records](../../subs/harness/src/capability/records.ts)
preserve the engineer's original behavioral examples, designated executable or
pseudocode. The capability architect's revisable plan contains use cases,
expected behavior, links to original examples and coverage declarations.
Coverage can be `unresolved`, `exercised` with test references, or `corrected`
with a reason, evidence, decision provenance and test references. Assignments
also carry intended evidence.

The [capability architect procedure](../../subs/harness/src/prompts/capability-architect.procedure.md)
asks the architect to preserve original examples, inspect iteration results
and verify the real provider and requesting consumer before handback. Its
[submission contract](../../subs/harness/src/capability/submission.ts) accepts
`request-handback.coverage`, identifying cases and their evidence. Unlike the
missing explicit acceptance-scenario satisfaction declaration, this path
already has structured agent-authored case-to-test evidence claims.

The older contract model, still represented in
[contract records](../../subs/harness/src/contracts/records.ts), explicitly
names provider conformance suites and consumer verification evidence. However,
[Plan 16](../plans/16-capability-architect/main-plan.md) states that an unchanged
fake test suite is no longer a universal prerequisite for provider work or
the sole definition of its obligation. The current principles preserve the
required behavior while permitting justified changes to executable tests and
interfaces. A fixed suite prepared before every delegation cannot therefore
be assumed to be the current general process.

### Why this broadens the analysis

There are three distinct questions in this use case:

1. Does the implemented capability satisfy the delegated behavioral need?
2. Has the required test been implemented, and does it exercise that need?
3. Is the configured test suite green?

The responsible agents establish the first two. Audit answers the third.
An architect's acceptance of a provider or capability task also does not
establish completion of the consumer's broader plan scenario. The
[real verification and return architecture](../architecture/autonomous-implementation-loop.md#5-real-verification-and-return)
explicitly keeps the requesting engineer's and parent coordinator's broader
work open after handback.

For example, a plan can require that sending an email makes it appear in
history. During implementation, a delegated history capability might require
a test that saving a sent-email record preserves its recipient and identifier.
That local test is useful evidence for the delegated need, but passing it does
not establish the complete sending-and-history outcome. This is an illustrative
example, not a newly adopted requirement.

The existing capability path also provides implementation evidence worth
investigating before inventing a new protocol. In
[RunService](../../subs/harness/src/run/service.ts), handback checks the
architect's coverage claims against the current plan and cited executed test
files. It additionally requires selected passing tests for the provider and
consumer using path-based owner checks. Comparing explicit evidence references
with execution records is mechanical; it does not establish the meaning of
those tests. The owner-path requirement is a separate coverage policy whose
purpose and fit with the clarified audit boundary remain to be evaluated.

This use case does not yet justify collapsing acceptance scenarios, delegated
behavioral cases and required tests into one record type. Further investigation
needs to establish their responsible architects, how requirements survive
delegation and plan revision, what judgments are already recorded, and how
local handback contributes evidence to broader acceptance. The potential
approach below must be assessed against both use cases.

## Which scenarios and tests the harness tracks: plan and implementation

This distinction was checked separately by two read-only investigations: one
of the planned contracts and one of the current implementation. Here,
"tracked obligation" means an identified requirement or case with durable
progress and completion rules. Recording a test result, test-file inventory or
failure diagnostic is not by itself registration of a tracked obligation.

### Planned inclusion and exclusion

The [original acceptance analysis](2026-09-23-acceptance-scenarios.md) explicitly
limits acceptance scenarios to what the plan asks. It says that edge cases
beyond the plan belong in the engineer's own tests, not plan acceptance. The
[v1 acceptance architecture](../architecture/acceptance-scenarios.md#what-v1-leaves-out)
also excludes agent-proposed scenarios during execution. Its tracked acceptance
set consists of captured plan scenarios and the initial architect's allocated,
derived and integration scenarios, frozen at analysis acceptance.

Existing project scenarios and ordinary tests still participate in automated
verification. They do not acquire acceptance-obligation identities simply
because they run, pass, fail or were authored during an iteration.

Delegation adds a separate kind of tracking: the original behavioral examples
and capability cases needed for a task. The
[Plan 16 contract appendix](../plans/16-capability-architect/contract-appendix.md)
preserves example identities and agent coverage dispositions through plan
revisions. [Plan 18](../plans/18-shared-iteration-lifecycle/main-plan.md)
explicitly retains the agent's responsibility to identify which tests establish
each required behavior. This does not require registering every implementation
test as a separate harness obligation.

### What is implemented

| Item | Current harness tracking |
| --- | --- |
| Accepted plan/initial-architect acceptance scenario | A durable `sc-*` record, owner/provenance, scenario events, state and completion enforcement |
| Original capability-request example | A durable `need-*.ex*` identity, preserved case and coverage disposition; unresolved coverage blocks handback |
| Additional derived capability use case | Stored in the capability plan with coverage; existing cases cannot disappear across revisions, but unresolved additional cases do not have the same handback enforcement as original examples |
| Explicit test references in capability coverage | Persisted as evidence for agent-declared cases and checked against passing executed test files; no independently assessed test-meaning record |
| Test required in ordinary assignment goal/completion prose | Stored within the assignment and subject to architect/reviewer assessment; no automatic individually identified test-satisfaction record |
| Existing project Cucumber scenario | Executed and counted as an untracked result; no automatic `sc-*` registration |
| Ordinary unit/regression/engineer-discovered edge-case test | Execution evidence retained through configured checks; no automatic acceptance or capability-case registration |

The [scenario report adapter](../../subs/harness/subs/audit/src/scenario-report.ts)
associates producer results with existing frozen records using structured tags
and file identity. Unmatched scenarios are counted as untracked results. The
[scenario finding adapter](../../subs/harness/src/checks/scenario-findings.ts)
also explicitly keeps the project's own scenarios outside tracked scenario
findings. A failure record and an acceptance obligation are different kinds of
state.

[Capability plan records](../../subs/harness/src/capability/records.ts) and
[architect submissions](../../subs/harness/src/capability/submission.ts)
already carry the agent's case-to-test evidence declarations. The handback
path in [RunService](../../subs/harness/src/run/service.ts) requires coverage
for original examples, verifies cited files were executed, and requires passing
test-file evidence for the provider and consumer. These checks do not inspect
whether assertions satisfy the behavior. The asymmetry for additional derived
cases is a factual finding, not an established defect. The adopted direction
is that the architect decides which delegated items need independent tracking;
the remaining investigation concerns aligning these existing checks with that
decision.

The retained strict contract/conformance records are not the universal current
production delegation path. `RunService.open` selects the capability workflow;
`openForHistoricalTests` exposes the old workflow only for historical tests.
Current capability assignments set `evidenceObligations` to an empty list and
use the task's plan, case coverage and handback mechanism.

### Consequences for the investigation

The planned and implemented membership boundary broadly agree: required
acceptance scenarios and delegated behavioral cases are tracked; the entire
test suite is not an acceptance ledger. The previously identified pass-driven
scenario-satisfaction problem concerns the authority and meaning of tracked
state, not proof that every ordinary test was accidentally registered.

The potential approach must preserve this distinction. A requirement to write
a test does not automatically imply a need for another tracked object. Dan
has adopted architect-owned registration granularity, as described below.
Aligning current capability handback enforcement with that choice remains
implementation investigation. The original documents contain both
agent-declaration language and later pass-based decisions; attribution of the
conflict to unauthorized agent drift still requires historical evidence.

## Adopted decision: architect-owned registration granularity

**Decision:** Dan adopts this allocation in a KISS context. The responsible
architect chooses which delegated outcomes, scenarios or required tests need
independent completion tracking. The harness records the explicit choice and
does not classify tests itself.

The default is to track the delegated outcome as one obligation. The architect
assesses its implementation and appropriate tests together before reporting it
done. A particular scenario or test receives a separate declaration only when
the architect explicitly registers it because independent tracking is useful.
Ordinary implementation, regression and engineer-discovered edge-case tests
are not automatically registered.

For example, "implement storing sent emails, including appropriate tests" can
remain one obligation. The architect may separately register "add the duplicate
send regression test" when it wants that deliverable reported independently.
These are examples of granularity, not new requirements for this project.

The harness's completion clarification names only registered obligations still
lacking declarations. It trusts the responsible architect's report that they
are done and performs no evidence-to-test matching. A choice about reporting
granularity does not remove a behavioral requirement or an already approved
acceptance obligation.

Keep this in the existing delegation and declaration protocol rather than
introducing a separate test registry or automatic classification system. The
registration-boundary P2 is resolved at the design level by this allocation;
the concrete representation, authority checks and recovery behavior remain to
be specified.

## Additional decisions and clarifications

### Final verification is a full audit

**Adopted:** final verification means running a full audit of the configured
suite. There is no separate harness-owned final scenario-verification
mechanism and no final comparison of registered obligations with individual
test results.

The architect's done declaration covers correct implementation, appropriate
tests and real integration. Ensuring the configured suite includes the required
acceptance and integration behavior is an agent responsibility. A fake-backed
local success does not replace the broader requirement. A full audit executes
the configured checks; it does not determine whether those checks represent
the intended requirements.

The necessary architect declarations and final full-audit pass remain separate
completion facts. Audit reports retain their producer results, while the
harness does not use them to establish, confirm or invalidate scenario status.
This resolves the first review P1 concerning real integration and final
verification at the design level.

### Requirement acceptance belongs to the architect

Dan changed the last two sentences of the audit responsibility paragraph in
the worktree's [harness principles](../harness.principles.md#ramify-audit-owns-check-execution-evidence)
to state that the harness records audit results and enforces execution and
write boundaries, while the local architect reads those results and the
implementation and tests, assesses requirement satisfaction, and reports a
judgment the harness trusts and records.

This replaces the former wording requiring the producer's applicable
verification result before "accepting work." That wording conflated recording
an architect's declaration, accepting an iteration and completing a run. The
revised responsibility does not give the harness an independent assessment
of a requirement or a per-obligation audit acceptance condition.

An audit result remains execution evidence. The architect interprets its
relevance to the requirement, including whether a relevant failure remains
unrecovered, and reports its own assessment. Recording that assessment does
not rewrite the producer's report. Final full-audit verification remains the
separate decision above. This resolves the second review P1 at the
principles/design level; previously planned and implemented gate behavior still
needs alignment.

### Approved optional implementation location hint

**Approved:** when declaring an obligation
done, the architect can supply one short optional `where` string. The requested
purpose is to help agents navigate to the implementation during final checks.

```json
{
  "scenario": "sc-003",
  "where": "subs/history/src/history.ts — recordSentEmail"
}
```

The optional `where` string is approved. The example illustrates its use;
the surrounding declaration protocol remains to be specified and implemented.
The hint can name a main file and a symbol, or a second location when useful.
For a registered test obligation it can name the test file and title. It does
not require line numbers, an exhaustive file list or a separate evidence record.

The harness stores and presents the text with the declaration for agent review.
It does not resolve paths, inspect files, match the hint with runner results,
or attach completion meaning to it. Omitting the hint does not block completion
or trigger a missing-report clarification. The architect's declaration remains
authoritative.

### Clarification, reassessment and recovery reuse the existing workflow

The remaining lifecycle P2 concerns wiring the declarations into existing
coordination mechanisms, not adding another assessment system. The clarified
KISS direction covers four situations:

1. **Missing report:** when an architect requests completion without a required
   declaration, continue that architect with the outstanding obligation IDs.
   It may report work it forgot to declare, recognize unfinished work and
   coordinate it, or explain a blocker. The harness checks reporting
   completeness and trusts an authorized done declaration.
2. **Repeated incomplete responses:** use the existing invocation and work
   limits. Do not add a separate clarification counter or ask indefinitely.
   Exhaustion means completion could not be established through the workflow;
   it is not a harness judgment that the implementation is incorrect. A report
   of genuinely unfinished work continues ordinary coordination within those
   same bounds.
3. **Interruption:** declarations and the outstanding question remain durable.
   A resumed or fresh architect sees the recorded state and continues without
   depending on remembered conversation. Repeated declarations must fit the
   existing idempotent submission/recovery discipline.
4. **Later changes:** the architect receives current source and change
   information and decides whether earlier judgments need revision. The
   harness does not infer affected requirements from changed paths or test
   results, automatically retract declarations, or reset all status after
   every commit. Showing the source delta is distinct from deciding its meaning.

The concrete declaration, clarification and continuation representation remains
to be specified. This P2 is narrowed to that integration work; it does not
justify a new role, state machine, budget or evidence-validation mechanism.

### Review disposition and simplification goal

| Review item | Current disposition |
| --- | --- |
| First P1: real integration and final verification | Resolved at the design level: architect owns correct implementation and real integration; final verification is a full audit |
| Second P1: independent acceptance responsibility inferred from audit wording | Resolved at the principles/design level by Dan's revised paragraph; harness records results and trusts architect assessment |
| P2: registration boundary | Resolved at the design level: architect chooses granularity, with delegated outcomes as the default |
| P2: clarification, reassessment and recovery | KISS behavior clarified; exact integration with existing submissions, limits and durable recovery remains open |

These review dispositions originally preceded the Plan 21 consolidation
noted above; runtime source remains unchanged. The
structural simplification goal is to remove pass-driven implementation
promotion, automatic withdrawal of agent declarations, case-to-test-file
matching, provider/consumer test-file coverage conditions and generated causal
diagnoses. Reassess P4's assignment/scenario certification contract accordingly.
Keep audit execution reports, diagnostics, source provenance, existing write
boundaries and useful inspection tools.

The additions should be limited to architect declarations, explicit
registration choices and missing-report continuation in the existing protocol.
The location hint is optional. There is no demonstrated need for another
reviewer role, mandatory per-scenario review, automatic test classification,
parallel coverage analysis or a generic registry of the whole test suite.
Architects retain bounded context and can retrieve source and reports as needed;
they are not required to reread every implementation detail at each turn.

## Potential approach for further investigation

**Recommendation to evaluate:** preserve the responsible architect's existing
authority over correct implementation and passing status, and provide a small
explicit way to communicate that judgment through the existing harness
protocol. The harness tracks explicitly registered obligations and trusts the
responsible architect's declaration about them. Keep audit concerned with test
health and available to the architect as an inspection tool.

Dan has established two constraints for this approach: the harness must not
map evidence references to test files or execution results, and it must not
use audit results to determine whether a scenario or required test is
implemented and passing. Architect-owned registration granularity and full
audit as final verification are also adopted. The remaining protocol and
lifecycle described below remain a
candidate for exact protocol/lifecycle investigation. The expanded Plan 21
now carries that investigation and implementation sequence; no exact schema
or runtime change is selected merely by this analysis.

### Candidate process

1. The architect chooses the independent completion obligations, defaulting
   to delegated outcomes and separately registering a scenario or test only
   when useful. The harness records those choices and their responsible
   architects; it does not automatically register the project's tests.
2. The architect coordinates the required implementation through bounded
   engineer assignments, including relevant implementation and testing work.
3. The engineer implements its assignment and reports completed work, tests
   created or updated and remaining gaps. Audit independently establishes
   test-suite health under the applicable project policy.
4. The architect evaluates the code, test implementation, engineer reports,
   audit results and relevant review findings. It determines whether a required
   scenario or test is correctly implemented and passing, including whether
   relevant audit failures remain unrecovered, and explicitly reports its
   judgment to the harness.
5. The harness records the authorized architect's declaration and trusts it.
   It does not compare the declaration or its supporting references with test
   files, runner results or audit verdicts. A short implementation location
   hint may accompany it using the approved optional `where` field above.
6. When the architect requests completion with required declarations missing,
   the harness asks for clarification about those specific obligations. The
   architect can report implementation it forgot to declare, recognize work
   it forgot to arrange and continue coordinating it, or explain a blocker
   through the existing workflow. An authorized declaration that it is done
   resolves the reporting gap without a harness assessment of the work.
7. Final verification runs a full audit of the configured suite. Its result is
   recorded and available to architects independently of the obligation
   declarations; no separate final scenario-to-test verification is added.

These steps describe responsibility and information flow. They do not prescribe
a new scheduling order for every existing review, require all reviews before
every architect turn, or alter existing non-test gates. Their timing needs to
be checked against the actual iteration and work-item lifecycle.

An architect declaration and an audit result would remain separate facts.
Scenario and required-test implementation/passing status would come entirely
from the responsible architect. A passing audit would not confirm that status;
a failing audit would not invalidate it. The architect can investigate the
audit, decide which failures matter to its requirement and revise its judgment.
The harness records those agent decisions without deriving a status from the
execution evidence.

Final full-audit verification is the adopted separate execution check. The
precise scheduling of other existing audit operations remains to be aligned
with the revised principle; it must not restore a harness-owned requirement
assessment or evidence-matching condition. The missing-declaration clarification
is a completeness check on reporting, not a second opinion about implementation.

### Tools and protocol to investigate

The architect needs the registered requirements, existing declarations,
relevant dependencies, the engineer's result, current audit diagnostics and
review findings. Existing source, Git and result-artifact tools should let it
inspect code and tests and establish whether earlier failures were recovered.
This does not imply loading every test or transcript into every invocation.

A candidate communication mechanism is a structured declaration in the existing
architect submissions identifying the obligations the architect reports done.
The harness could validate obligation identifiers and the declaring architect's
authority, then persist the declaration and provenance. A completion request
would identify registered obligations still lacking declarations and continue
the architect with a clarification request.

Test and source references can remain ordinary supporting context in agent
reports. The harness would attach no special validation or completion meaning
to them. This candidate excludes mandatory case-to-test mappings, checks that
cited files were executed, provider/consumer test-file coverage checks and
per-obligation comparisons with audit results. Audit reports can be retained
for independent diagnostics and architect inspection without those mappings.

The exact field, event and state representation is open. In particular, simply
reinterpreting `request-completion.scenarios` may be insufficient if the
architect must report satisfaction while assigning another iteration. Adding
a second state machine, a separate assessment agent or a new provider contract
has not been justified by this analysis.

### Why this is a promising direction

The approach connects an existing responsibility to an explicit communication
mechanism. It trusts the architect's judgment about implementation and passing
status and makes missing reports recoverable through clarification. It permits
reuse of already implemented behavior, partial progress across iterations and
ordinary reviewer feedback. It removes evidence-to-execution matching from
the harness while keeping audit results available to agents.

For Plan 21, this direction would require reassessing contracts that ask audit
to receive scenario obligations or produce assignment conclusions. Provider
adoption, configured execution, diagnostics and recovery remain relevant.
P4's current formulation cannot establish semantic satisfaction; any remaining
public execution gap would need a justification in terms of establishing test
health. P3's committed-configuration access question remains separate.

### Investigation needed before choosing

- Trace the relevant design and implementation history. The present conflict
  does not establish when it arose or which agent introduced it; historical
  drift has not been proven by the source inspection in this analysis.
- Trace architect turns and integration scheduling to determine when explicit
  satisfaction declarations are needed, including existing-behavior reuse,
  partial progress and work-item completion.
- Align finalization with the adopted full-audit decision and architect-owned
  implementation/passing declarations. Preserve real consumer/provider
  integration and the original requirement when agents revise tests or
  interfaces, without adding per-obligation execution matching.
- Establish how architects receive required test obligations, report their
  implementation/passing judgments, respond to missing-declaration
  clarifications and recover those judgments after interruption. Source
  provenance must not become a harness inference that a declaration is stale
  or incorrect; the architect owns revisions of its judgment.
- Include the approved optional `where` hint in the final agent briefing. Keep it
  plain supporting context with no resolution, execution matching or
  completion condition.
- Examine feature-file generation, pending tags and runner configuration.
  Determine which operations mechanically apply explicit agent decisions and
  which currently infer test eligibility from scenario state. Test inclusion
  and requirement mapping must remain agent responsibilities.
- Check ordinary, capability and integration architect authority against the
  existing delegation model. This candidate does not establish that one local
  architect may attest to another owner's requirements.
- Compare initial acceptance scenarios with delegated behavioral cases and
  required tests. Examine the existing capability coverage declarations and
  handback checks to identify what can support architect declarations and what
  must be removed because it maps evidence to test files or execution results.
  Specify how the architect's registration choices reach the existing records
  and completion checks, preserving the adopted default of delegated outcomes.
  Local task completion must not automatically satisfy the consumer's broader
  acceptance requirements.
- Reassess the actual public audit integration needed for committed gates and
  dirty diagnostic tools. Distinguish configured execution/discovery gaps from
  the assignment/scenario coverage policy currently bundled into P4.
- Identify the coordinated document, protocol, source and acceptance changes
  needed to express the selected process consistently, without preserving a
  competing pass-driven meaning of satisfaction.

## Scope of this analysis

The findings concern scenario declarations, their execution-driven state
changes, integration diagnostics, delegated behavioral/test obligations and
Plan 21's related verification contracts.
They do not establish that every harness gate makes a semantic call or that
every provider requirement is invalid. The potential approach remains subject
to investigation and selection. No runtime implementation or protected document is changed by this analysis.
The later consolidated Plan 21 revision carries the adopted design choices
with remaining protocol investigations explicitly required.
