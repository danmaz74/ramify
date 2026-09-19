# Harness Principles

**Status:** Proposed

## Purpose

Define the principles of a harness that helps agents implement features in a
Ramify project efficiently while respecting its modularity model. They are
listed in decreasing order of importance.

The toolkit's
[importability principles](../../docs/model/cross-module-importability.principles.md)
define what a module may import, and its
[module architect principles](../../docs/agents/module-architect.principles.md)
define the evidence Ramify supplies to an agent with a global view. This
document redefines neither.

## Principles

### Bounded Context Is What Makes Agents Efficient

Each agent session should work on a task of limited complexity and in a
search space of limited complexity:

- architecture planning mostly works from the architect view
- implementation agents work in only one or a small group of modules
- integration work could touch bigger contexts, but it should always
  only require small/simple changes

The division of work should also facilitate integration and maintaining
a clean architecture. Every other principle serves this divide-and-conquer
strategy.

### Plans Are Incomplete; the System Adapts

Agents work on a need-to-know basis, and the system is based on the
inevitablity of unknown unknowns. The assumption is that no plan made in
advance is fully complete or correct.

Discovering during work that a task needs something beyond its scope is a
normal outcome. How the harness handles discoveries matters more than how
thoroughly it plans.

### Every Agent Scope Is a Cut on the Module Tree

Agent roles differ only in which part of the module tree they see and may
change. Ramify supplies the evidence for choosing that scope and enforces the
model within it.

The tree states who has authority over an interface. A parent owns the
boundaries of its children. An interface between two branches belongs to
neither side.

### A Module Carries Its Own Onboarding

Bounded context covers knowledge as well as code. A module's purpose,
invariants, conventions, entry points and testing guidance live with the
module, beside the contracts it receives from its children.

An agent scoped to a module is competent from that material and the module's
generated API view, without reading the rest of the project. Knowledge that
governs several modules lives at their lowest common ancestor.

Detail is retrieved when needed, never preloaded.

### Architecture Planning Produces a Work-Weight Map

The architecture phase identifies which modules take most of the work. That
guides the division of the plan into phases and iterations. New modules are
rare.

The phase also records what only the global view can supply:

- reuse findings: behavior that already exists, and whether it is available to
  the module that needs it;
- seams: where modules in different branches must agree on an interface.

Finer detail is left to the engineer who reads the code.

### Vertical Work Is Not Split Artificially

When a change touches a module and its descendants, one agent can workworks at
all of those levels if the descendant changes are simple or the complexity of
the subtree is manageable.

The agent's scope is one subtree. The choice is which module is its root: a
higher root gives fewer hand-offs but a larger context, and a lower root gives
the reverse. Complexity evidence guides the choice. Work decomposition is not
1:1 with module decomposition.

### Horizontal Work Uses Separate Agents Joined by a Contract

Work in different branches always uses separate agents. Neither side designs
the other's interface.

A contract engineer reads both sides of a seam and writes only the contract:
interface types, conformance tests and, when required, a temporary double.

### Fakes and Tests Guide Delegation

Work is delegated as executable evidence, never as prose alone.

The consumer implements its real behavior against a fake of what it needs.
Using the fake reveals what the requirement actually is, before anyone
implements it. The fake replaces only the missing part; existing behavior
stays real.

The tests that pass against the fake become the provider's obligation. The
provider's work is complete when the same tests pass unchanged against the
real implementation.

A delegation is finished only when the consumer's own behavioral tests pass
with the real provider in place of the fake. Passing against a fake is never
completion.

This applies to a seam, to a need discovered during work, and to a parent
delegating to a descendant outside its agent's scope.

### Work Starts at the Consumer; Integration Happens on the Return

Work begins at the highest consumer of the feature. It writes its behavioral
tests, implements against fakes of what it lacks, and delegates each fake's
obligation. Each provider repeats this for what it lacks in turn.

On the return, each fake is replaced by its real provider and the tests of
that level run again. Integration therefore happens one delegation at a time,
at every level, and not once at the end.

The work-weight map says which modules carry the work. This order says where
the work starts and how it reaches them.

### Need-to-Know Does Not Forbid Asking

An engineer never holds the global view, but it can ask the architect whether
behavior exists and whether its module may use it.

Ownership and placement decisions belong to the architect. Structural changes
are approved by a person.

### Results Are Need-to-Know Too

Completed work returns only what matters to whoever delegated it: changed
contracts, changed assumptions and required follow-ups. How the work was done
stays with the agent that did it.

A delegating agent's context does not grow with the detail of the work it
delegates. When nothing relevant changed, the result is the completion alone.

### Discoveries Are Priced by Kind

A need discovered during work costs what its kind requires:

| Discovery | Cost |
| --- | --- |
| Exists and is available | None; the engineer uses it. |
| Exists but is not available | The exposure declarations along the path, proposed by the architect. |
| Missing; its owner is within the agent's scope | None; the engineer implements it. |
| Missing; its owner is elsewhere | An architect decision, then a new seam or a changed scope. |
| The planned ownership is wrong | A person's decision. |

The harness never treats every discovery as a reason to pause the run.

### State Lives in the Repository

A blocked agent completes what it can and leaves a failing test, a stub and a
written need. It reports partial completion with its needs, and any fresh
agent can continue from the repository.

Only the next iteration's goal is fixed; later iterations are decided from
the state reached. Resuming a session is an optimization, never a requirement
for correctness.

### What Integration on the Return Leaves Is Resolved at the Common Ancestor

Most integration happens on the return, one delegation at a time. Each
replacement verifies one consumer with one provider; it does not verify the
composition of several modules.

What remains is work of its own: wiring, lifecycle, configuration and
behavior that emerges only when several modules run together. An integration
agent resolves it, scoped to the subtree of the lowest common ancestor of the
modules involved. It owns the composition and may make bounded corrections in
descendants, avoiding a long sequence of delegations.

The conformance tests of each seam prevent it from redesigning a contract.
Feature-level tests at the common ancestor decide completion.

### A Small Closed Set of Outcomes Is the Whole Protocol

An agent resolves ordinary failures itself: compile errors, failing tests and
violations reported by Ramify's checks.

It reports to the harness only an outcome that changes the orchestration: the
goal is reached; the work is partially complete, with its needs; a contract
needs revision; the request cannot be satisfied as specified; the plan is
wrong. The harness acts on nothing else.

### The Harness Stays Small; Ramify Stays Outside Its Control Loop

The harness chooses agent scopes, orders seams and handles discoveries.
Agents make every semantic decision.

Ramify's generated views and post-write checks belong to the agent's project
environment. A violation reaches the agent as an ordinary error.

A runtime failure, such as a crashed session or malformed output, is never a
semantic outcome.

