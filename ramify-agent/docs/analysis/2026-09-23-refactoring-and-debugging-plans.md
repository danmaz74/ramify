# Refactoring and debugging plans

**Date:** 2026-09-23. **Status:** draft analysis. It asks whether the
capability-based planning of the autonomous loop generalizes to refactoring
and debugging, or whether they need a mechanism of their own. It is not a
plan, and nothing here is implemented.

## The question

The harness is designed around the capabilities a plan requires. The initial
architect names the plan's
[top-level capabilities](../glossary.md#top-level-capability), the harness
makes one work item for each, and the work descends from the highest consumer
through fakes, contracts and provider obligations. That fits a plan that asks
for new behavior. Two other common kinds of work may not fit it:

- **refactoring:** change the structure and keep the behavior;
- **debugging:** make existing behavior meet a guarantee it already had.

## Conclusion

- **Debugging generalizes.** A defect and a feature share the kind of
  requirement: behavior at an entry point that is absent or wrong, stated as a
  test that fails now. The run, the work item, the obligation and the forecast
  all carry over. The initial analysis frames the requirement differently, and
  one step of delegation uses no fake.
- **Refactoring is a plan kind of its own.** It shares the execution
  machinery: runs, work items, local architects, iterations, gates and the
  ledger. It needs its own planning unit and its own completion criterion.
  Nothing is missing, so the capability requirement has nothing to hold on to.
- **Mixed plans compose by sequence.** The
  [sequential sub-plans hypothesis](../decomposition/breaking-vs-non-breaking-plans.md#longer-term-hypothesis-sequential-sub-plans)
  is where kinds combine: one kind per sub-plan, never mixed within a work
  item.

## What "capabilities" consists of

The capability mechanism is five parts. Only two of them are specific to
features.

| Part | Where | Specific to features? |
| --- | --- | --- |
| **Requirement unit:** the entry capability, new behavior used from outside the plan, one work item each | [`analysis/submission.ts`](../../subs/harness/src/analysis/submission.ts), [glossary](../glossary.md#top-level-capability) | Yes |
| **Forecasts:** hypotheses that create no work and are retired by deduction | [`analysis/records.ts`](../../subs/harness/src/analysis/records.ts) | No; only their vocabulary is |
| **Placement:** the registry, ownership, global and local authority | [architecture §1–2](../architecture/autonomous-implementation-loop.md#1-a-global-architect-form-hypotheses-first-resolve-actual-needs-later) | No |
| **Delegation:** consumer-led, with fakes, contract, obligation and verification on the return | [architecture §4–5](../architecture/autonomous-implementation-loop.md#4-the-contract-sub-session) | Partly: the fake assumes a missing provider |
| **Execution:** gates, iterations, the ledger, state in the repository | [Plan 3](../plans/03-autonomous-implementation-loop/main-plan.md) | No |

The [required capabilities analysis](2026-09-23-capability-registry-analysis.md)
makes the gap precise. Completion is the required set: the entry capabilities
and everything reachable from them over confirmed links. For a refactor that
set is empty, and the run would complete without doing anything. For a
defect, the set is well defined once an entry can name an existing capability
that misbehaves.

## The three kinds compared

| | Feature | Defect | Refactor |
| --- | --- | --- | --- |
| Required | New behavior at an entry | Existing behavior corrected at an entry | A target structure |
| Unknown at the start | Placement of deeper capabilities | Where the fault lies | Little; the consumers are derivable. The risk is in the order of steps |
| Direction of work | Down from the highest consumer | Down from where the symptom is observed | Expand at the new location, migrate consumers, contract the old one |
| Executable evidence | Acceptance scenarios, fakes, conformance tests | A reproduction scenario, failing on the baseline and passing after | The existing tests pass at every step |
| Fakes | Central | None: the provider exists and is wrong | None |
| The initial architect forecasts | Capabilities to reuse or create | Suspect locations | The sequence and the affected consumers |
| Ramify verifies | Importability, exposure and signature companions | The same, and the references along the suspect path | The same, and the goal itself: ownership, exposure and dependencies |

## Debugging: generalize the requirement

### A correction is not an extension

The glossary says a change to existing behavior is a
[capability extension](../glossary.md#capability-extension): a new capability
named for itself. That is right for a request that asks for more. A defect
asks for no more: the capability already guarantees the behavior, and the
fix restores it. Naming a fix as a new capability, such as "send email
without dropping attachments", would be ceremony that no later role uses.

A third term is needed beside capability and extension. A **correction**
restores a guarantee an existing capability already has. The rule that an
existing capability is never revised to cover more still holds, because a
correction does not cover more.

Whether the expected behavior is an existing guarantee is a planning
judgment, as the breaking classification is. A report that says the software
"does not handle X" may be a missing feature. The initial analysis decides,
and a request that turns out to be a feature is planned as one.

### The shape of a correction run

1. **The requirement.** An entry gains a change kind: `create`, which is
   today's entry, or `correct`. A `correct` entry names the existing entry
   point where the symptom is observed, cited against the view; the guarantee
   that is violated; and the expected behavior. Its work item's module is the
   observation point.
2. **Reproduction first.** The entry's reproduction is an
   [acceptance scenario](2026-09-23-acceptance-scenarios.md); the first
   iteration binds it at the observation point, where it must fail. "Not
   reproducible" is a legitimate result: the existing `unresolved` outcome,
   with the attempt as evidence. The failing scenario is the durable state of
   the investigation, as the principle that
   [state lives in the repository](../harness.principles.md#state-lives-in-the-repository)
   asks.
3. **Descent without fakes.** When the fault lies in a provider, the consumer
   registers a **defect obligation**: a failing test at the provider's
   boundary, which the provider's work item makes pass. On the return, the
   consumer's reproduction test runs again. This is integration on the return
   with the same obligation and verification records; only the fake is
   absent. If the provider behaves as its contract says and the consumer
   misread it, the fault is local. If the contract is ambiguous, deciding who
   is right is the existing contract-revision path.
4. **Fault hypotheses.** A forecast names a suspect module, with rationale,
   confidence and citations. It creates no work and is retired by deduction,
   as the required capabilities analysis describes. The hypothesis change
   values each need an outcome that can confirm them
   ([`records.ts`](../../subs/harness/src/analysis/records.ts)); for a
   suspect, that outcome is the module where the fix landed.
5. **Compatibility.** A fix can break consumers that rely on the defective
   behavior. The local architect's existing `breakingChanges` analysis applies
   unchanged.

### Red on the baseline

The gate for a correction verifies that the reproduction test fails on the
run's baseline commit and passes on the result. That is mechanical evidence
that the requirement was captured, not only satisfied. The interface a
correction exercises already exists, so a failure on the baseline shows the
defect.

The check does not carry over to features. On a feature's baseline the
interface does not exist, and a failure there shows only a missing import.
Features observe their
[acceptance scenarios](2026-09-23-acceptance-scenarios.md#binding) as unbound,
then bound and failing, then passing, instead. A correction's reproduction is
itself a scenario of that kind, and must be bound and failing before the fix.

### Limits

Intermittent, environmental and performance defects may have no
deterministic failing test. A run for one ends `unresolved` with its
evidence. Supporting them is not proposed here.

## Refactoring: a plan kind of its own

### The requirement is structural

A refactor names a **transformation** and the **target assertions** that
hold when it is done. They are verified against a refreshed Ramify view:

- a module exists, or no longer exists;
- a named symbol is owned by a given module;
- one module has no dependency on another;
- an exposure is present, or removed.

These are structural and behavioral evidence that Ramify derives, not
capabilities, so the
[module architect principles](../../../docs/agents/module-architect.principles.md)
still hold: Ramify supplies evidence and the harness verifies form. A
refactor is the one kind of plan whose goal Ramify can verify directly,
beyond the tests.

[Plan 2](../plans/02-contract-authority-refactor/main-plan.md) already had
this shape: a before-and-after module tree, and "the existing application
behaves exactly as before".

### A declared protected boundary

A refactor
[preserves observable behavior at the boundary being protected](../decomposition/breaking-vs-non-breaking-plans.md#a-cleaner-interface-does-not-justify-a-breaking-plan).
Contracts inside that boundary are meant to change. The plan declares the
boundary; by default it is the whole project's tests and the root's exposed
contracts.

Without that declaration, every internal contract change counts as breaking.
A refactor would then run as a series of `breaking` iterations with a broad
scope and the whole-project gate, and nothing would state what it has to
reach.

### Behavior preservation as evidence

The architect view's `tests.jsonl` records each test file's module, suites
and test titles. The baseline's titles must still exist and pass after the
refactor, including tests that moved with the code they test. A removed test
or a changed assertion needs a recorded reason. Titles are brittle and can be
gamed, so a mismatch is a warning with a required reason, not a failure.

The project's [acceptance scenarios](2026-09-23-acceptance-scenarios.md#scenarios-accumulate)
are the stronger evidence. Every scenario earlier runs left must pass
unchanged, and an agent never changes one, so the accumulated scenarios form
the protected boundary a refactor plan relies on without scenarios of its own.

### Decomposition by parallel change

Each transformation follows
[parallel change](https://martinfowler.com/bliki/ParallelChange.html):

1. **Expand.** Establish the new location, with the old one delegating or
   coexisting.
2. **Migrate.** One iteration per consumer subtree, each a narrow goal in a
   narrow scope. This fits
   [bounded context](../harness.principles.md#bounded-context-is-what-makes-agents-efficient)
   better than most feature work, and the iterations are candidates for
   parallel execution later.
3. **Contract.** Remove the old location and the exposures that served it.

Every step passes the whole-project gate. Work items are ordered by phase, not
by a consumer waiting for its provider. The consumers to migrate are
derivable from the references Ramify records. Static references are definite;
use Ramify cannot resolve is a coverage limit, and the plan records it as one.

### Capabilities are optional here

A split or a join may be described as capability relocations, using the
entry points of the
[registry candidate](../future/README.md#plan-scoped-capability-registry-with-entry-points):
the entry point before and after. That helps review. A purely structural
refactor, such as removing a cycle, renaming, or moving contracts to their
authority, is not required to name capabilities.

### Approval

The harness principles say structural changes are approved by a person. In a
refactor plan, the structure is the request, so the person stated it by
writing the plan. The harness holds the agents to it through the target
assertions.

## Mixed plans

Features often need preparatory refactoring, and fixing a defect often shows
refactoring worth doing. The sequential sub-plans hypothesis composes them: an
ordered list of sub-plans, each of one kind (feature or correction, refactor,
breaking), each leaving a coherent verified result. One kind per sub-plan
keeps each run's completion criterion single.

## Suggested order

1. **Corrections:** the `correct` entry, the reproduction iteration, defect
   obligations and the red-on-baseline check. The change to the harness is
   small, and it builds on the acceptance scenarios, which a correction uses
   for its reproduction.
2. **The refactor kind:** transformations, target assertions, the protected
   boundary and parallel-change work items. It is more work, and it is where
   Ramify gives the most leverage.
3. **Composition** of kinds through sub-plans.

## Open questions

1. Can Ramify's current views answer "module A has no dependency on module B"
   and "which modules use symbol S" directly? `behavior.jsonl` records
   behavioral references per symbol, which may be enough; this is not
   verified.
2. What does running a new test against the baseline commit cost, and where
   does it run? The harness commits at every gate, so the baseline exists; a
   separate checkout may be needed.
3. Does the person declare the plan's kind, or does the initial architect
   classify it? Declaring it is cheap and removes a class of misclassification;
   the architect could still report a mismatch as `unresolved`.
4. How small can the target-assertion language stay? Four forms may be
   enough. A general query language is a risk to avoid.
5. Should a fault hypothesis be a new change value, or a separate record,
   given the open question of whether `confirmed` remains a standing?
