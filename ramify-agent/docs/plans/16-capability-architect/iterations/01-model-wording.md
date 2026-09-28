# Reviewed Plan 16 model wording for iteration 7

This is the iteration 1 wording handoff. It is staged beside the plan because
the current principles still describe the production contract workflow.
Iteration 7 applies these replacements only when the new workflow is enabled.
Unrelated sentences in each principle remain unless they contradict the new
coordination path.

## Harness principles

### Bounded Context Is What Makes Agents Efficient

Add after the search-space examples: “A fresh capability architect reads the
relevant requesting and provider source and evidence for one bounded task. It
may continue within that task. Its return brief gives the suspended parent the
decisions and evidence needed to continue without inheriting either local
architect's complete history.”

### Every Agent Scope Is a Cut on the Module Tree

Replace the first sentence with: “An architect's read and design context and
an engineer's write scope are separate. A capability architect may coordinate
several owners for one task, but each implementation assignment has its own
module scope. Coordination does not change module responsibility or combine
owners into one engineer write scope.” Retain the tree's boundary ownership.

### Horizontal Work Uses Separate Agents Joined by a Contract

Replace the contract-iteration prescription with: “Implementation in different
branches uses separate engineers under one active capability architect. That
architect coordinates the interface, provider implementation, compatibility
repairs and real requesting-consumer verification as one revisable task. The
interface and implementation may evolve together. The architect handles the
task's ordinary decisions until verified handback, while a responsibility
change outside its authority goes to the responsible architect. Existing
consumer guarantees remain unless an explicit breaking-change decision
authorizes their revision.”

### Fakes and Tests Guide Delegation

Replace the mandatory fake path with: “A capability request records the
behavior needed, actual or prospective use sites, known constraints and
example tests. Pseudocode and suggested signatures are marked provisional.
Fakes can support implementation but are optional. Executable evidence
develops with the design. A changed test representation retains its original
case link; an expected-result correction records its reason, evidence and
agent decision. Provider and real consumer verification are required before
handback.”

### Fakes Are Explicitly Named

Keep the naming examples and replace the contract-iteration sentence with:
“When a fake is used, the implementing assignments and their gates verify its
designation and eventual retirement.”

### A Fake Is Exactly As Importable As What It Stands For

Keep the exposure parity rule and replace the final contract-iteration
exception with: “The agreement records the real export each fake stands for.
New source changes, including exposure and fake removal, use assignments in
their actual owning modules. The gates verify parity while the fake is in
use.”

### Work Starts at the Consumer; Integration Happens on the Return

Replace the fake-first sequence with: “Work begins with the requesting
consumer's need and preserves its provisional source candidate. A qualified
need outside its scope starts one capability task. The active capability
architect coordinates provider work, compatibility and real requesting-
consumer integration before handback. Nested tasks execute depth-first, and
unrelated frontier work, including the provider's own entry work, waits while
the task is active. After handback the parent architect and engineer resume
their broader goal from the returned candidate.”

### What Integration on the Return Leaves Is Resolved at the Common Ancestor

Keep the composition owner and focused-iteration rules. Replace the
conformance-test prohibition with: “Composition honors the currently accepted
interface and behavioral guarantees and their evidence. If it needs a
revision, record the need, reopen capability work, coordinate affected owners
and reverify. Changing tests alone cannot remove a guarantee.”

### A Small Closed Set of Outcomes Is the Whole Protocol

Replace the old outcome list with: “Each role has a closed action union.
Capability qualification can satisfy a need with existing behavior, delegate
it, request placement or report it unresolved. A capability architect can
consult the consumer, assign owner-scoped work, delegate a nested need,
request placement, report unresolved work, request handback or report a
partial result. Accepted submissions change orchestration; accepting a
submission is not acceptance of its implementation. Read, plan-update and
prevalidation tools have explicit recorded effects and cannot complete work.
The environment-problem path remains separate.”

### State Lives in the Repository

Add: “Before suspension, the harness settles the writer and durably captures
the requesting consumer's actual provisional tree, including tracked and
relevant untracked changes and its assignment attribution. Recovery resumes
that candidate or records a failure. It cannot discard it, silently accept
it or invent an engineer result or task handback.”

Existing authority over responsibility changes and plan deviations remains.
Task-local authority does not revise guarantees owned outside the task.

## Glossary

Use the definitions in [model amendments](../model-amendments.md) verbatim for
Capability request, Capability task, Capability plan, Capability architect,
Handback, Contract, Provider obligation (historical workflow) and
Conformance. Revise the current entries to read:

- **Work item:** An ordinary frontier goal, including an entry or integration
  goal, with assignments and sessions across its lifecycle.
- **Fake:** A temporary stand-in for missing provider behavior while a
  consumer develops against it. Its behavior and exposure match what it
  stands for; real integration remains required. An API revision may adapt
  executable tests while retaining the original behavioral case and reason.

Capability, Top-level capability and Capability extension retain their current
meanings. Task IDs, entry slugs, module paths and work-item IDs remain distinct.
Historical `ContractRecord`, `ProviderObligation` and `conformed` verdicts
retain their original meaning and do not become task handbacks.

## Architecture documents

`autonomous-implementation-loop.md` and current work-loop prose should use
the appendix's depth-first stack, deferred provider entry, task-owned
assignment numbering, completion predicate and provisional requesting-source
candidate. They should state that `run-policy/5` counts work items and tasks
together, captures a distinct task assignment limit and leaves old runs under
their recorded policy and contract verdicts. The trial and hypothesis reports
remain historical evidence.
