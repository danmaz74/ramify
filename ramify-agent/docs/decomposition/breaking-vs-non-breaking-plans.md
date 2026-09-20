# Breaking and non-breaking plans

**Status:** Design direction. The non-breaking-only MVP is the chosen scope;
sequential sub-plans are a longer-term hypothesis. This document describes
intended behavior, not an implemented workflow.

This develops the [distinction in the harness principles](../harness.principles.md#distinguish-breaking-from-non-breaking-changes)
and defines the execution boundary for the process explored in
[decomposition hypothesis 2](dan-hypothesis-2.md).

## Why the distinction belongs in planning

A non-breaking plan adds or extends capabilities while preserving existing
contracts and behavioral guarantees. Existing consumers can continue to use
them unchanged. A breaking plan intentionally changes or withdraws particular
guarantees, so existing consumers may need to adapt.

Compatibility includes behavior, not just signatures or successful compilation.
Changing an operation from completing when an email is delivered to completing
when it is queued can break a consumer without changing its source code.

The distinction comes from the requested outcome. These requests differ:

- **Add a workflow that requests approval before sending an email.** Existing
  email workflows can remain unchanged. The new workflow can use a separate
  approval-aware operation.
- **Require approval before any customer email is sent.** Keeping an existing
  unrestricted sending path would violate the request. Existing workflows
  must conform to the new rule.

Implementation agents should know which obligation they are fulfilling before
they start. They should not have to decide whether preserving old behavior or
satisfying the new requirement takes precedence.

## A cleaner interface does not justify a breaking plan

When adding behavior, first seek a compatible extension. If the existing
interface cannot express the new use case, a separate interface may do so
while preserving the old one. An adapter can sometimes let both interfaces
share an implementation.

The initial result may be less elegant. That alone is not a reason to force
existing consumers to migrate as part of the feature. First establish the new
use case and preserve existing guarantees; then consider refactoring through
focused iterations. Refactoring preserves observable behavior at the boundary
being protected. See [Definition of Refactoring](https://martinfowler.com/bliki/DefinitionOfRefactoring.html).

Where appropriate, add the new interface, migrate consumers incrementally and
remove the old interface after its obligations have been discharged. This is
the [parallel change](https://martinfowler.com/bliki/ParallelChange.html)
approach. Coexistence can require adapters, extra tests or temporary duplication;
it is a trade-off, not a claim that compatibility is free.

However, a separate interface cannot satisfy a requirement that explicitly
prohibits the old behavior while that behavior remains available. Such a plan
requires an intentional behavioral change, not merely a tidier design.

Every plan therefore preserves existing guarantees except those it explicitly
authorizes changing. A breaking classification does not authorize unrelated
breaks.

## Initial planning provides two things to review

The initial planner considers both architecture and compatibility:

| Planning result | What the user reviews |
| --- | --- |
| Capability map | Required capabilities, likely module ownership, reuse findings, dependencies and proposed new modules. |
| Compatibility assessment | Existing guarantees to preserve, any required breaks, affected consumers, supporting evidence and unresolved questions. |

The map remains a map of capabilities. Compatibility findings and any future
execution sequence are separate from it; work items and iteration schedules
do not become capability-map entries.

For each required break, the assessment states the existing behavior, the
requested replacement, why a compatible extension would not meet the request,
and the known affected consumers. It distinguishes required breaks from
avoidable consequences of a proposed implementation.

These are evidence-backed planning judgments, not mechanically proven claims
that every consumer has been found. Material uncertainty is made explicit and
resolved through further investigation or clarification before treating the
plan as eligible for non-breaking execution.

The user reviews the capability map and compatibility assessment together.
Implementation follows that reviewed direction while keeping later iterations
flexible. Ordinary discoveries refine the work; hard conflicts with the
reviewed intent require replanning.

## Longer-term hypothesis: sequential sub-plans

For a plan containing required breaking changes, the planner could produce an
ordered sequence of sub-plans. Each sub-plan is breaking or non-breaking,
relative to the contracts established when it starts. The user would review
this sequence and its compatibility obligations alongside the capability map.

A wholly non-breaking plan would have one non-breaking sub-plan. It needs no
additional split merely to fit the model.

The sequence follows dependencies. Breaking work need not all happen first:
it may require a new capability that can be introduced without breaking
anything. For example:

| Order | Kind | Outcome |
| --- | --- | --- |
| 1 | Non-breaking | Add approval and an approved-send operation alongside existing email operations. |
| 2 | Breaking | Adapt existing email workflows to require approval and remove unrestricted sending. |
| 3 | Non-breaking | Add a bulk-email workflow using the established approval and sending capabilities. |

The planner seeks a practical sequence: establish prerequisites, avoid repeated
migration of the same consumers, and keep each sub-plan coherent and bounded.
This is planning judgment, not an optimization algorithm.

Each sub-plan records its goal, acceptance conditions, prerequisites and
compatibility classification. Breaking sub-plans also name the guarantees they
may change and those they must preserve.

Two execution approaches would share the sequential outer loop:

- **Non-breaking sub-plans:** use the specialized process being designed:
  capability mapping, consumer-led contract iterations, fakes, executable
  delegation and integration on return.
- **Breaking sub-plans:** initially use ordinary agentic work. Plan iterations,
  execute each iteration and verify the result. Each invocation still obeys
  the principle of a narrow goal or narrow search space. No general automated
  migration protocol is required.

Only the current sub-plan needs detailed implementation planning. The initial
sequence remains flexible, and later mapping and briefs use the repository
as changed by completed predecessors.

### A sub-plan must leave a coherent result

Proceed only when the current sub-plan has met its acceptance conditions
against real implementations and the relevant verification passes. A breaking
sub-plan is not complete merely because the provider has changed; its affected
consumer adaptations belong to that sub-plan too.

Unresolved consumer repairs or missing providers cannot be silently handed to
the next sub-plan. A tested compatibility interface intentionally retained for
later removal can, however, be a valid intermediate result.

After the last sub-plan, verify the original plan's acceptance. Completing all
local goals does not by itself establish that their composition fulfills the
original request.

If a hard issue invalidates the sequence or reveals an additional required
break, revise the remaining sub-plans explicitly. Automatic restructuring of
an ongoing migration is not part of this hypothesis's initial execution model.

## The smaller MVP: implement non-breaking plans only

The MVP retains the expanded initial planning and user review, but omits
sub-plan generation, sequencing and execution of breaking work.

```text
Request -> capability map + compatibility assessment
                         |
                         +-- non-breaking -> user review -> implementation
                         |
                         +-- required breaking changes -> report to user -> stop
```

When initial planning finds required breaking changes, it returns the map and
assessment for the user to inspect and stops before implementation. The report
explains the incompatible behavior, affected capabilities and consumers, why
an additive alternative is insufficient, and any remaining uncertainty. It
need not produce an executable decomposition into sub-plans.

The user can use a normal agent to split or revise the request into two or
more plans and handle breaking work outside the harness. The user controls
their order. A resulting non-breaking plan can enter the harness once its
prerequisites are satisfied. Its planning is checked against the current
repository, including changes made by any completed prerequisite work.

A non-breaking plan follows the reviewed direction through the specialized
implementation process. Local choices and future iterations remain flexible;
ordinary missing capabilities still use its normal discovery and delegation
mechanisms.

If implementation discovers that a breaking change is actually necessary,
record the conflict and the work already completed, report it to the user,
and stop the affected execution before undertaking the break. Do not silently
weaken existing contracts or automatically switch to a migration workflow.
The user can then revise or split the remaining work outside the harness.

This limit applies to required breaking changes, not every contract refinement
or additional capability found during implementation. A compatible solution
within the reviewed intent remains ordinary non-breaking work.

The MVP's promise is therefore limited and explicit: it helps users identify
breaking work during planning, and automates the specialized implementation
process only for work that preserves existing contracts. The longer-term
sub-plan hypothesis can add orchestration later without being a prerequisite
for this first implementation loop.
