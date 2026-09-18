# Cognitive decomposition through the module tree

**Date:** 2026-09-18. **Status:** alternative hypothesis for review. This
document proposes a basis for module decomposition alongside the
[cohesion and coupling hypothesis](2026-09-18-cohesion-coupling-indices.md).
Its practical goal is to inform the decomposition and placement decisions
of a module architect skill or collection of skills. It adopts no new
importability rule, metric or implementation plan.

## The hypothesis

The fundamental reason to decompose an application into modules is
cognitive divide-and-conquer. A module tree lets people and agents reason
about the application at different levels of abstraction. Its recursive
structure allows a complex part to be understood through simpler parts,
which can themselves be decomposed when necessary.

A module should have children when its local complexity needs decomposition
and their responsibilities and contracts make that complexity more
manageable. A module whose complexity is low and reasonably expected to
stay low should remain intact. The depth of decomposition depends primarily
on complexity; different branches may need different depths. Module count,
file count and task duration do not by themselves determine the appropriate
structure.

The candidate principle is:

> **Decompose Until Local Complexity Is Manageable**
>
> Use the module tree to reason at successive levels of abstraction.
> Introduce children when current or credibly anticipated local complexity
> warrants them, and their contracts reduce the total cognitive burden.
> Stop when local complexity is manageable; include the added abstractions,
> contracts and navigation in the cost of further decomposition.

Local complexity includes the concepts, invariants, implementation details
and relationships that must be understood together. Moving files into
children does not reduce it if understanding the parent still requires
understanding all those files. The abstraction must do useful work.

## Preserve simplicity

The possibility of describing a module through child abstractions is not
enough reason to create them. Each child adds concepts, contracts and
navigation that must also be understood. For a simple module these costs
can exceed the implementation complexity they hide.

The architect asks two questions before proposing children:

1. Is local complexity substantial, or credibly expected to become
   substantial?
2. Would the child abstractions reduce the total cognitive burden,
   including the boundaries they introduce?

Expected complexity needs a concrete basis: known requirements or the
established characteristics of an applicable architectural pattern.
Speculative future growth is a weak justification. When current complexity
is manageable and there is no credible reason to expect otherwise,
preserving the existing module is a successful architectural decision.

## Module decomposition and work decomposition

Module decomposition establishes durable cognitive boundaries. Work
decomposition uses those boundaries to organize a particular task. In this
model, a task touching multiple modules must be split at each module
boundary it crosses, with coordination between the resulting units.
Within any one module, complex work can be divided into iterations.

These are related forms of decomposition. Modules create natural units of
work, make those units smaller and can allow parallel execution where the
contracts and dependencies permit it. They are nevertheless chosen for
the abstraction they provide across tasks. A substantial task may require
many iterations in a module whose local complexity remains manageable.

## Children and siblings are different choices

Extracting a child adds a level of abstraction within an existing module's
subtree. It can isolate implementation complexity while the parent
preserves the subtree's external contract, including by re-exposing what
it receives from the child.

Separating responsibilities into siblings places them at the same level
under their common parent. It changes which responsibilities are peers
and where their coordination belongs. These choices should be compared
as different arrangements of abstraction and ownership, not merely as
ways to increase the number of modules.

For example, a configuration module might acquire parsing and validation
children when those internals become complex enough to warrant separate
abstractions. Configuration remains an understandable part of its own
parent. Making parsing and validation peers of configuration would express
a different architecture and needs a separate justification.

## Several capabilities can belong together

A module may implement several related capabilities when their combined
local complexity is manageable. A single-purpose sentence is not a test
for whether another module is needed. Parsing, validation, defaults and
diagnostics might remain together or become children as their complexity
develops.

Cohesion helps a child form an understandable abstraction. Limited
coupling helps that abstraction be understood through contracts without
repeatedly inspecting neighboring implementations. They provide evidence
about the quality of cognitive decomposition; they are not substitutes
for judging whether it makes the application easier to reason about.

## A catalog of architectural patterns

Projects may start with predefined structures known to provide useful
abstractions in their domain. Separating transport from business logic or
organizing routing in a web application are examples. Such patterns can
establish boundaries before complexity forces a local extraction.

The skill should have a collection of worked examples of these practices,
so recurring situations have standard starting points. Each pattern records:

- **Applicability:** the situation, constraints and project conventions
  that make it useful.
- **Suggested module tree:** responsibilities, contracts and where their
  composition belongs, distinguishing children from siblings.
- **Benefit:** the complexity or recurring changes the boundaries separate.
- **Limits:** small cases and other conditions where the structure should
  be simplified or avoided.
- **Worked example:** a concrete decision, its alternatives and the reason
  for the chosen structure.

For example, separating a web server's transport concerns from business
behavior is a useful starting point when both are substantial or known
requirements make that complexity foreseeable. A tiny endpoint with no
meaningful business layer may need no such decomposition. The pattern's
applicability conditions explain when to use it; its name alone is not a
justification.

The architect applies the project's declared conventions and refines the
tree within them. These patterns inform the decomposition without
requiring every application to use the same responsibilities, depth or
number of modules. Their catalog is a proposed skill resource, to be built
and assessed through examples and trials.

The resulting decision procedure has three possible outcomes: preserve a
simple structure, apply an established pattern whose conditions fit, or
design a decomposition for the particular complexity observed. Each outcome
needs a reason grounded in the project.

## Evidence and evaluation

Include keeping the module intact when comparing candidate decompositions.
Ask:

- What makes current or anticipated local complexity require attention?
- Does a known pattern apply, including its limits and simpler cases?
- What must be understood together before and after the change?
- Can the parent reason through the children's contracts without routinely
  reading their implementations?
- Can a child be understood with its own internals and the contracts it
  receives, without routinely inspecting its siblings' internals?
- Does the reduction in implementation knowledge outweigh the added
  abstractions, contracts, navigation and coordination?
- Does the arrangement support reasoning at both the parent level and the
  child level, across more than the task that prompted the proposal?

Use Ramify's retained evidence to support these judgments. Existing
context size, connectedness, dependency, interface-use and history measures
can suggest where to investigate; none directly measures cognitive
complexity. Preserve their coverage, scope and provenance.

Evaluate exact owners and subtrees separately. Extracting a child can
lower its parent's exact-owner locality while preserving the subtree's
locality. That change can accompany successful abstraction and is not,
by itself, evidence that the decomposition became worse.

The hypothesis remains to be evaluated through architect trials. Useful
evidence includes which implementation details an agent needed to inspect,
whether it could explain and change a part correctly from the intended
local context, and which contracts required repeated cross-module
investigation. Fewer reads alone do not establish better understanding.
Trials should include simple modules expected to remain simple, where
leaving them intact is the appropriate result, as well as applicable and
inapplicable cases of each cataloged pattern.

## Open questions

- What observations best distinguish manageable local complexity from
  familiarity with a particular codebase?
- How should trials compare keeping a module intact, extracting children
  and separating responsibilities into siblings?
- Which project conventions should be supplied before the architect judges
  a boundary, and which should it propose from recurring evidence?
- Which recurring situations merit catalog entries, and what evidence is
  sufficient to recommend their structures as standard starting points?
