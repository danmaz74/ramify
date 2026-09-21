# Cognitive decomposition through the module tree

**Date:** 2026-09-18. **Status:** alternative hypothesis for review.

This document proposes an approach to module decomposition that shares the architectural basis of the [cohesion and coupling hypothesis](2026-09-18-cohesion-coupling-indices.md) and applies it through recursive abstraction.

Its practical goal is to inform decomposition and placement decisions made by a module architect skill or collection of skills. It introduces no new importability rule, metric or implementation plan.

## Terminology

Throughout this proposal, **local complexity**, **cognitive complexity** and
implementation knowledge that an abstraction hides refer to **local cognitive
complexity** in the [metrics glossary](../metrics/glossary.md). This is a
qualitative assessment, not delivered-change complexity or a source-line
count. Inventory context size, when cited, means Ramify's counts and bytes;
model context usage is a different token observation.

## The approach

This approach treats **cognitive divide-and-conquer** as the primary reason for hierarchical module decomposition.

Cohesion and loose coupling remain the basis for choosing good boundaries. Cohesion keeps related concepts, invariants and implementation knowledge together; loose coupling limits the knowledge and assumptions that must cross a boundary. Local complexity determines whether another level of decomposition is worth its cost.

A module tree lets people and agents reason about an application at different levels of abstraction. A complex responsibility can be understood through simpler child abstractions, which can themselves be decomposed when necessary.

A module should have children when its local complexity warrants decomposition and the resulting abstractions reduce the total cognitive burden. A module whose complexity is low and reasonably expected to remain low should stay intact.

Different branches may therefore require different depths. Module count, file count, code size and task duration do not by themselves determine the appropriate structure.

The candidate principle is:

> **Decompose Until Local Complexity Is Manageable**
>
> Use the module tree to reason at successive levels of abstraction.
>
> Introduce children when current or credibly anticipated local complexity warrants decomposition and the resulting abstractions reduce the total cognitive burden.
>
> Stop when local complexity is manageable. Count the additional abstractions, contracts, navigation and coordination introduced by further decomposition as part of its cost.

**Local complexity** is the set of concepts, invariants, implementation details and relationships that must be understood together to reason correctly about a module.

Moving implementation into children does not reduce local complexity if reasoning about the parent still requires understanding those implementations. The abstraction must hide information that the parent no longer needs to understand, not merely relocate it.

## Preserve simplicity

The possibility of describing a module through child abstractions is not itself a reason to create them.

Each child introduces another concept, contract and navigation boundary. For a simple module these costs can exceed the implementation complexity they hide.

Before proposing children, the architect asks:

1. Is local complexity substantial, or credibly expected to become substantial?
2. Would the proposed child abstractions reduce the total cognitive burden, including the boundaries they introduce?

Expected complexity needs a concrete basis, such as known requirements or established characteristics of an applicable architectural pattern.

Speculative future growth is weak justification.

When current complexity is manageable and there is no credible reason to expect otherwise, preserving the existing module is a successful architectural decision.

## Module decomposition and work decomposition

Module decomposition creates durable cognitive and ownership boundaries.

Work decomposition divides one particular task into manageable execution units.

Module boundaries provide natural decomposition points for work that spans multiple modules. Within a module, complex work may instead be divided into iterations.

The two forms of decomposition are related but serve different purposes.

Modules should be chosen because they provide useful abstractions across many tasks, not because one current task happens to be large. A substantial task may require many iterations inside a module whose local complexity remains manageable.

Conversely, a small task may cross several module boundaries without providing any reason to merge those modules.

## Children and siblings are different choices

Extracting a child and separating responsibilities into siblings express different architectures.

A child introduces another level of abstraction inside an existing module's subtree. The parent continues to own the subtree's externally visible responsibility and decides what capabilities received from the child are re-exposed outside that subtree.

The purpose of the child is to hide implementation complexity behind an abstraction that helps the parent remain understandable.

Separating responsibilities into siblings places them at the same abstraction level under a common parent. It changes which responsibilities are peers and where their coordination belongs.

These alternatives should therefore be compared as different arrangements of abstraction and ownership, not merely as different ways of increasing module count.

For example, a configuration module might acquire parsing and validation children when those internals become sufficiently complex to deserve independent abstractions. Configuration remains the responsibility presented to its own parent.

Making parsing and validation siblings of configuration would assert that they are peer responsibilities and would require a different architectural justification.

## Several capabilities can belong together

A module may implement several related capabilities when their combined local complexity remains manageable.

A single-purpose description is not a test for whether another module is required.

For example, parsing, validation, defaults and diagnostics might remain together in one configuration module or become children as their complexity develops.

Several capabilities can form a cohesive abstraction when their correct implementation requires closely related knowledge. A loosely coupled contract lets other modules use that abstraction without routinely inspecting its implementation. Every proposed decomposition should explain both why its responsibilities belong together and why its boundaries limit what others need to understand.

## Architectural patterns as starting points

Established architectural patterns may provide useful starting structures when their applicability conditions fit the project.

Examples include separating transport concerns from business behavior or using established routing structures in a web application.

Such patterns can justify boundaries before current complexity alone would force an extraction, when known requirements or recurring domain characteristics make the relevant complexity foreseeable.

The architect skill should have a catalog of worked patterns. Each pattern should record:

* **Applicability:** the situation, constraints and project conventions that make the pattern useful.
* **Suggested module tree:** the responsibilities, contracts and composition points, including whether boundaries are expressed as children or siblings.
* **Benefit:** the complexity, invariants or recurring changes the boundaries separate.
* **Limits:** small cases and other conditions where the structure should be simplified or avoided.
* **Worked example:** a concrete decision, considered alternatives and the reason for the chosen structure.

For example, separating a web server's transport concerns from business behavior can be a useful starting point when both responsibilities are substantial or known requirements make that complexity foreseeable.

A tiny endpoint with no meaningful business layer may require no such decomposition.

The pattern's applicability conditions justify its use; the pattern's name alone does not.

The architect applies project conventions and adapts the pattern to the existing architecture. Patterns inform decomposition without requiring every project to use the same responsibilities, depth or number of modules.

The resulting decision procedure has three broad outcomes:

* preserve the existing simple structure;
* use an established pattern as a starting point when its applicability conditions fit;
* design a decomposition for the particular complexity observed.

Each outcome needs a reason grounded in the project.

## Evidence and evaluation

Keeping the module intact should always be a candidate when comparing decompositions.

Ask:

* What current or credibly anticipated complexity requires attention?
* Does a known pattern apply, including its limits and simpler cases?
* Which shared concepts, invariants and implementation relationships justify keeping the proposed responsibilities together?
* What knowledge must cross the proposed boundaries: contract types, call ordering, shared state, error handling or other assumptions? How does this compare with the existing structure?
* Does the proposed child hide information that the parent no longer needs to understand, or merely relocate it?
* Can the parent reason correctly through the children's contracts without routinely reading their implementations?
* Can a child be understood from its own internals and the contracts it receives without routinely inspecting sibling implementations?
* Do ordinary changes tend to remain on one side of the proposed boundary, or does the boundary repeatedly require coordinated inspection and modification?
* Does the reduction in implementation knowledge outweigh the added abstractions, contracts, navigation and coordination?
* Does the arrangement support reasoning at both parent and child levels across more than the task that prompted the proposal?

Use Ramify's retained evidence to support these judgments.

Existing inventory context-size, connectedness, dependency, interface-use and history measures can indicate where to investigate, but none directly measures cognitive complexity. Preserve their coverage, scope and provenance.

Evaluate cohesion and coupling at each relevant tree level: within each child, across the parent's composition of its children, and between the subtree and the surrounding application. Keep exact-owner and subtree measurements separate.

Extracting a child can lower its parent's exact-owner locality while preserving or improving the locality of the subtree as a whole. That can be a successful consequence of abstraction and is not, by itself, evidence that the decomposition became worse.

## Open questions

* What observations best distinguish manageable local complexity from familiarity with a particular codebase?
* How should trials compare keeping a module intact, extracting children and separating responsibilities into siblings?
* Which project conventions should be supplied before the architect judges a boundary, and which should it infer or propose from recurring evidence?
* Which recurring situations merit catalog entries, and what evidence is sufficient to treat their structures as useful standard starting points?
* What evidence best reveals that a proposed abstraction genuinely hides implementation knowledge rather than merely moving it behind another module boundary?
