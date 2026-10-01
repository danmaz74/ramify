# ramify-agent Glossary

**Status:** Proposed

Included-scope vocabulary adopted 2026-10-01; the corresponding whole-tree
scope implementation remains pending.

## Purpose

Define the vocabulary of the [harness principles](harness.principles.md) and
the [harness architecture](architecture.md). Those documents contain the rules
and the design; this companion defines their terms.

Ramify's own vocabulary is defined in the toolkit's
[model glossary](../../docs/model/glossary.md) and
[agents glossary](../../docs/agents/glossary.md) and is not repeated here.

Use **test-shaped file** as defined in ramify-audit's
glossary: `ramify-audit:docs/glossary.md#test-shaped-file`. This reference names
the separate repository and does not require a sibling checkout.

For search space, delivered-change complexity, token efficiency and their
selected measurements, use the [metrics glossary](metrics/glossary.md).

## Semantic specification

A **semantic specification** is what an author means: a principle, a plan,
a requirement or a scenario's text. It constrains the solution space and
cannot execute.

## Executable specification

An **executable specification** is code that checks a solution against a
[semantic specification](#semantic-specification): the
[step definitions](#step-definition) of a scenario, a test for a
requirement, a `module.ramify` declaration that `ramify check` verifies. It
may cover part of the semantic specification, carries its author's
[interpretation](#interpretation), and never replaces the semantic
specification, which stays authoritative over it.

## Translate

To **translate** a [semantic specification](#semantic-specification) is to
write an [executable specification](#executable-specification) of it. The
one who translates is whoever writes that code, usually an engineer; it is
not a role.

## Interpretation

An **interpretation** is the reading of a
[semantic specification](#semantic-specification) that an
[executable specification](#executable-specification) carries. A verdict is
about the executable specification; the interpretation is the gap between
the verdict and the semantic specification.

A semantic specification that has no translation is interpreted at the moment
of judgment, by the agent applying it or reviewing against it.

## Plan

A **plan** is a person's request for a change to a target project, rooted at
`plans/<plan-id>/plan.md` and possibly expressed in accompanying documents.

The harness reads and captures a plan and never edits it. The plans that
deliver ramify-agent itself are development documents under `docs/plans/` and
are not plans in this sense.

## Plan evidence

**Plan evidence** is a captured plan document or passage, identified by its
source path and revision, that establishes what the plan said.

## Principles evidence

**Principles evidence** is a captured passage from a `.principles.md` document,
identified by its source path and revision, that establishes what the
principle said.

## Non-functional requirement

A **non-functional requirement** is a source-grounded plan or principle
obligation about a quality or constraint of the solution, assessed against a
specific candidate.

## Advisory item

An **advisory item** is a source-grounded suggestion that can inform an
architect's choice without creating a satisfaction gate.

## Merge readiness

**Merge readiness** is the revision-bound standing derived from a completed
run's final gate, non-functional assessment and user deviation decisions.

## Capability

A **capability** is a named unit of decomposition that agents use while
planning: an ability the software provides or is expected to provide.

The term is the toolkit's
([agents glossary](../../docs/agents/glossary.md#capability)); this entry adds
how the harness treats it. A capability is not an object of the project. Its
name is ephemeral: it exists in a plan's records and is never materialized in
the project's source, declarations or documentation. Only an agent maps a
capability to the symbols that implement it. The harness records and relays
that mapping and verifies its form, never its meaning.

## Top-level capability

A **top-level capability** is a capability a [plan](#plan) requires that is
used from outside the plan: by a person, by an external system, or by a part
of the project the plan does not change.

"A button that sends an email" is one. It is new, since otherwise the plan
would already be satisfied; a change to existing behavior is a
[capability extension](#capability-extension), which is new. No other
capability of the plan depends on it. The harness's records and prompts call
it an **entry capability**, and the harness makes one
[work item](#work-item) for each.

## Capability extension

A **capability extension** is a new capability: the behavior an existing
capability would have after the requested change, named for itself.

Adding attachments to an existing "send email" is the capability "send email
with attachment". It is planned, owned and implemented as any new capability
is, and no relation to "send email" is recorded. Its implementation may change
the symbols that implement the existing capability, and both capabilities may
end at the same symbol. An existing capability is never revised to cover more.

## Capability request

A **capability request** is an engineer's recorded need for behavior outside
its current implementation scope, including usage, known constraints and
examples.

## Capability task

A **capability task** is a durable coordination unit that answers a
[capability request](#capability-request) through design, scoped implementation
and real consumer verification.

## Capability plan

A **capability plan** is the versioned design, work and evidence record of one
[capability task](#capability-task).

## Capability architect

A **capability architect** is the agent coordinating one
[capability task](#capability-task) from delegation to handback.

## Handback

A **handback** is the accepted return of a verified
[capability task](#capability-task) result to its suspended parent coordinator
and requesting engineer.

## Contract

A **contract** is the interface and behavioral guarantees on which a consumer
relies. The term remains useful independently of the historical contract
engineer workflow.

## Provider obligation (historical workflow)

A **provider obligation** is the historical recorded requirement for a
provider to pass the conformance suite of a fake-backed contract revision.
New runs do not create one; historical readers retain its original meaning.

## Conformance

**Conformance** is evidence that an implementation satisfies a specified
[contract](#contract). It is an evidence claim, not a separate scheduling
unit in the capability workflow.

## Implementation map

The **implementation map** is the architect's record of where the
implementation of one plan falls on the project's module tree.

It names the modules touched with their relative weight, the existing behavior
to reuse, the new capabilities with their owners, the seams, the entry point
with its acceptance, and the proposed work items. It is a first approximation,
identified by revision, that the work loop amends.

## Seam

A **seam** is a place where modules in different branches of the module tree
must agree on an interface.

Every new or changed capability whose consumer is in a different branch from
its owner forms a seam. The interface belongs to neither side.

## Work item

A **work item** is an entry or other ordinary frontier goal with assignments
and sessions over its lifecycle. It is neither one agent session nor a
[capability task](#capability-task).

## Invocation

An **invocation** is one wait by the harness for an agent's outcome, with one
role, prompt and scope, ending with at most one accepted submission.

## Session

A **session** is the conversation that one or more
[invocations](#invocation) share. A fresh or forked invocation opens a session;
a continued invocation joins the session it continues. Each invocation is one
contiguous segment of its session's history.

The harness owns a session's identity and lifecycle. The agent's own session
file is the implementation's record, not the session.

## Session state

A [session](#session) is **live** while the harness awaits one of its
invocations, **suspended** while none is awaited and the harness keeps it for
further use, and **finished** once the harness will not use it again.

## Transcript

A **transcript** is the harness's ordered record of one [session](#session):
each invocation's start, the messages exchanged, the harness's own decisions
and each invocation's end. It is raw output, never quoted in a record.

## Point

A **point** is a place in a [session](#session) from which a later invocation
may continue it or fork from it: the end of one of its invocations, or the
result of one append to it.

## Included child

An **included child** is a child module whose entire subtree is included in
an assignment's scope, subject to the scope's external and ignored-tree rules.

## Included tree

An **included tree** is an owned-ignored tree of an assigned module explicitly
included, whole, in the assignment's scope.

## Vertical work

**Vertical work** is work within one subtree: a module and its descendants.

One agent may carry it out at all of those levels. See
[horizontal work](#horizontal-work).

## Horizontal work

**Horizontal work** is work in different branches of the module tree, joined
by a [seam](#seam).

Each side is carried out by a separate agent. See
[vertical work](#vertical-work).

## Fake

A **fake** is a temporary stand-in for the missing part of a provider. It
replaces only what is missing; existing behavior stays real. Its tests may
adapt when an API changes, with the original behavioral requirement and real
integration still verified.

## Scenario

A **scenario** is one Gherkin `Scenario` or `Scenario Outline` the harness
tracks as a requirement of a [plan](#plan).

## Plan scenario

A **plan scenario** is a [scenario](#scenario) written in the plan and
extracted by the harness; its authority is the plan's.

## Architect scenario

An **architect scenario** is a [scenario](#scenario) the initial architect
writes for one entry capability; its authority is the person's review.

## Entry scenario

An **entry scenario** is a [scenario](#scenario) assigned to exactly one
entry capability: every architect scenario, and every plan scenario that is
not an [integration scenario](#integration-scenario).

## Integration scenario

An **integration scenario** is a [plan scenario](#plan-scenario) that
combines several entry capabilities and is bound by an integration work item
at the common ancestor of its [sub-scenarios](#sub-scenario)' owners.

## Sub-scenario

A **sub-scenario** is an [entry scenario](#entry-scenario) the initial
architect derived from an [integration scenario](#integration-scenario),
ideally by picking its steps verbatim.

## Bridging Given

A **bridging Given** is a `Given` in a [sub-scenario](#sub-scenario) that
states the result of another entry's action in place of the action.

## Step definition

A **step definition** is the TypeScript that Cucumber matches a step's text
to. A scenario's step definitions are its
[executable specification](#executable-specification).

## Binding

A scenario's **binding** is the set of [step definitions](#step-definition)
a run matched to its steps, read from Cucumber's message stream. Binding is
verified mechanically and says nothing about the fidelity of the
[interpretation](#interpretation) those step definitions carry.

## Scenario harness

The **scenario harness** is the target project's world, driver, hooks and
the two commands that run scenarios in quick and full
[execution mode](#execution-mode), declared in its `ramify-agent.json`.

## Execution mode

An **execution mode** is `quick` or `full`, fixed for one run of the scenario
runner and never written into a scenario.

## Identity tag

An **identity tag** is `@ramify-sc-NNN`, the tag that names one tracked
[scenario](#scenario) in its feature file.

## Pending tag

The **pending tag** is `@ramify-pending`, which the harness keeps on a
[scenario](#scenario) while it is `pending` or `bound`, so that only a run
that selects it by [identity tag](#identity-tag) runs it.
