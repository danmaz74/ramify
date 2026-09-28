# Model amendments required by Plan 16

[Main plan](main-plan.md) · [Contracts](contract-appendix.md)

Iteration 1 reviews these replacements against the implemented records and
protocol. Iteration 7 applies the resulting wording to current principles,
glossary and architecture when the complete workflow is enabled. These are
proposed amendments; the existing documents have not been changed by this plan.

## Principles

The following headings in [harness principles](../../harness.principles.md)
must be amended explicitly. Preserve their unrelated guarantees.

| Existing heading | Required replacement or clarification |
| --- | --- |
| Bounded Context Is What Makes Agents Efficient | A fresh capability architect reads relevant A/B source and evidence for one bounded task. Its continuing context and concise return brief do not require inheriting either local architect's complete history. |
| Every Agent Scope Is a Cut on the Module Tree | Separate the architect's read/design context from an engineer's write scope. X's authority to coordinate several owners does not turn those owners into one engineer write scope or change module responsibility. |
| Horizontal Work Uses Separate Agents Joined by a Contract | Separate scoped engineers implement the affected owners under one capability architect. The interface and implementation evolve together. The capability architect handles all X decisions through verified handback; a separate contract iteration and pre-provider integration are no longer required. Existing consumer guarantees and explicit breaking-change authority remain. |
| Fakes and Tests Guide Delegation | A request carries behavior, usage and examples, with pseudocode explicit. Fakes are optional. Executable evidence develops with design; provider and real consumer verification are required before handback. Correcting an oracle or adapting an API test preserves the original need and records its reason. |
| Fakes Are Explicitly Named | Preserve naming rules. Replace references to the contract iteration checking them with the implementing assignments and their gates. |
| A Fake Is Exactly As Importable As What It Stands For | Preserve exposure parity when a fake is used. Remove the contract-iteration exception granting individual provider files; new source changes use assignments in the owning modules. |
| Work Starts at the Consumer; Integration Happens on the Return | Start with the consumer's request and preserve its partial candidate. Execute nested capability tasks depth-first. The active capability architect coordinates real requesting-consumer integration before handback; the parent then resumes its broader goal. Unrelated frontier work, including a provider entry, is deferred during the delegation. |
| What Integration on the Return Leaves Is Resolved at the Common Ancestor | Keep separate composition work at its proper ancestor. Replace “The conformance tests of each seam prevent it from redesigning a contract” with a requirement to honor the currently accepted interface/behavior and its evidence. If composition requires a revision, record the need, reopen capability work, coordinate affected owners and reverify; changing tests alone cannot remove a guarantee. |
| A Small Closed Set of Outcomes Is the Whole Protocol | Define a closed action union per role, including qualification, consultation, assignment, nested delegation, placement/unresolved, handback request and partial result as applicable. Accepted actions change orchestration; read/plan-update/prevalidation tools have explicit recorded effects and do not complete work. Distinguish accepted submission from accepted implementation. Preserve the existing environment-problem path. |
| State Lives in the Repository | Preserve recoverability; explicitly capture the consumer's dirty candidate and its attribution before suspension. Fresh recovery must not discard it or invent a completed result. |

Retain the existing authority for a responsibility-boundary change and for plan
deviations. Task-local authority and the serial scheduler do not authorize
silently changing guarantees owned outside that task.

## Glossary

Use the existing **Capability**, **Top-level capability** and **Capability
extension** meanings. The task records coordinate behavior described by those
concepts; they do not create persistent project capabilities. Add these concise
definitions to [the glossary](../../glossary.md):

- **Capability request:** an engineer's recorded need for behavior outside its
  current implementation scope, including usage, known constraints and examples.
- **Capability task:** a durable coordination unit that answers a capability
  request through design, scoped implementation and real consumer verification.
- **Capability plan:** the versioned design, work and evidence record of one
  capability task.
- **Capability architect:** the agent coordinating one capability task from
  delegation to handback.
- **Handback:** the accepted return of a verified capability task's result to
  its suspended parent coordinator and requesting engineer.
- **Contract:** the interface and behavioral guarantees on which a consumer
  relies. This term remains useful independently of the historical
  contract-engineer workflow.
- **Provider obligation (historical workflow):** the recorded requirement for
  a provider to pass the conformance suite of a fake-backed contract revision.
  New runs do not create this record family; historical readers keep its meaning.
- **Conformance:** evidence that an implementation satisfies a specified
  contract. It is an evidence claim, not a separate new-workflow scheduling unit.

Keep ordinary “obligation” in non-functional requirements and other prose;
retiring `ProviderObligation` does not erase those requirements. Keep the old
`ContractRecord` and associated conformance verdicts explicitly historical.
No historical `conformed` status is reinterpreted as a new task handback.

Revise **Work item** to describe an entry or other ordinary frontier goal,
with assignments and sessions over its lifecycle; it is not synonymous with
one agent session or a capability task. Update **Fake** to preserve its
substitution meaning without requiring unchanged test source across every API
revision. Behavioral requirements and real integration still apply.

## Existing capability projections

Entry capability IDs/slugs, module paths, work-item IDs and capability-task IDs
remain distinct typed references in the protocol. Add task associations to the
execution map and task details. Preserve the existing capability graph and
module-capability aggregation meanings. A task serving several entries can
carry explicit agent-established references to them; a shared module/name
does not supply that relation. Handback updates task progress only. Entry and
feature completion still require their own current gates.

## Current architecture

Update `docs/architecture/autonomous-implementation-loop.md` and any current
work-loop documentation still prescribing contract/fake establishment, provider
obligation scheduling or automatic entry completion on conformance. Describe
the coordination stack, deferred provider entries, task assignment numbering,
new completion predicate and provisional consumer candidate from the appendix.
Keep the two hypothesis documents and trial reports as historical evidence.
