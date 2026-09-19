# Plan execution - agent work decomposition on a Ramify project

> **Superseded** on 2026-09-19 by the [harness principles](../../harness.principles.md) and the
> [harness architecture](../../architecture.md). Kept for comparison; not current. See the
> [archive index](../README.md) for what may be reused.

**Date:** 2026-09-19. **Status:** current thinking, before any trial. This
document records where the design of agent-driven feature implementation
stands after reviewing three earlier proposals. It fixes a starting point to
measure against; it adopts no harness, schema or Ramify feature.

## Goal

Our goal is to optmize a plan agentic implementation leveraging a project's
ramify modular structure and some principles.

The first principle is that agents work best when their context stays limited.
A project's modular structure offers natural boundaries to create work units
which act on a limited search space, and to integrate the work done
in different work units in a clean way.

## Starting principle

Use a decomposition or integration rule only when it makes the work simpler.
When it does not, agents work as they do on any project without Ramify, with
the model enforced by the post-write hook. Start with the smallest set of
rules, measure where they help and where they cost, and add machinery only
where the measurements justify it.

## Sources

Three proposals, written in this order, form one pipeline:

1. *Ramify Agent Architecture: Converging Design Choices*. Agent hierarchy
   equals module hierarchy; per-module scope and generated instructions;
   physical `.ramify` views; delegation downward and requirement escalation
   upward to the lowest common ancestor; continuations; loop safety through
   monotone escalation and a wait-for graph; an architect agent; Ramify as a
   thin layer over existing agent runtimes.
2. *Capability-First Planning and Module Decomposition*. An architect phase
   that maps required capabilities, classifies gaps, clusters capabilities
   into responsibilities and searches the tree for owners; then a recursive
   implementation protocol in which a consumer drafts a contract, works
   against a double and publishes consumer-owned conformance tests.
3. *Implementation Harness: Minimal Architecture*. A small state machine over
   an approved, immutable structural plan; fixed upfront iteration plans; a
   Contract Engineer that designs lateral contracts from both sides; eight
   semantic outcomes; Ramify entirely outside the control loop.

They disagree on who designs a lateral contract, who resolves an external
need, and how much routing Ramify owns. The drift from the first to the
third is consistent: semantic work moves into agents, the harness shrinks.

What exists today: the per-module API view (`src/.ramify/`), the architect
view (`.ramify-architect/`) with the
[module-architect skill](../../../../.claude/skills/module-architect/SKILL.md),
and the post-write hook (`ramify check --changed`). No harness, contract
engineer, task-brief schema, architectural history or dry-run exists.

## Separation from Ramify

A Ramify agent, when one exists, is a separate project. Ramify publishes
evidence and enforcement: the generated views, the modularity metrics, the
hook and the batch check, and later MCP access. The agent consumes them
through files and commands. Nothing in Ramify references the agent's roles,
outcomes or plans, so the agent can move to its own repository if it proves
useful. The module-architect skill is a consumer artifact that lives in this
repository for convenience; its installation is an open question of the
[skill plan](../../../../docs/plans/module-architect-skill/main-plan.md).

## Two constraints

**Need to know.** An agent holds the smallest context sufficient for its
scope: its own source, its children's contracts, and the foreign APIs its
API view lists. It does not hold the global architecture.

**Unknown unknowns.** No plan is complete or correct before implementation.
Discovering an external need during implementation is an expected event.
The system prices and handles it; it does not treat it as failure.

Need to know is not "cannot ask". An engineering agent may query the global
view through a read-only discovery run of the module-architect skill without
loading that view into its own context.

## The architect phase

The most useful output of architecture planning is a **work-weight map**:
which existing modules carry most of the work, and which get small changes.
This survives the surprises that invalidate a detailed capability-to-module
plan. New modules are rare.

Two further outputs need the global view and are cheap to record:

- **Reuse findings**: a capability that already exists, its symbol and owner,
  and whether it is visible to the module that needs it. An engineer that
  does not know it exists reimplements it.
- **Seams**: pairs of heavy modules that must agree on a contract, with their
  lowest common ancestor. Seams decide the horizontal splits below.

Anything finer is a guess that the engineer revises.

## Vertical and horizontal work

**Vertical work** covers a module and some of its descendants. A parent owns
its children's visibility boundary, so one agent scoped to the subtree has
authority over every interface inside it. The importability model holds
inside the subtree and the hook enforces it. One agent does the work at
several levels when the subtree's complexity plus the expected change is
manageable; the work is not split into an iteration per descendant. The
decision is how high to cut. Subtree context size and the modularity
report's subtree measures are evidence for it.

**Horizontal work** crosses a seam whose lowest common ancestor is neither
side. Neither side has authority over the other's contract, so separate
agents always do the work, and a contract engineer with read access to both
sides and to other affected consumers designs the contract.

Order horizontal work **provider first** when the seams form a DAG: design
the contract, implement the provider, then the consumer against the real
provider. A consumer double is needed only when the consumer must go first,
because of a cycle or a contract nobody can design before the consumer tries
it. Contract-first design makes that the exception.

## Complexity as search space size

The index for how high to cut is the **search space size**: the bytes a
search from the scope's root traverses. That is what `rg` sees from a
module's `src/` with default filters: production source, tests, docs and
resources, excluding ignored and hidden paths. The definition is
mechanical and names no agent. Bytes are enough; tokens are roughly bytes
divided by four at a ratio stable across code and prose. The subtree
figure decides a vertical cut; the exact-owner figure is the cost of the
parent's own composition. The index says nothing about whether a boundary
is good; cohesion and coupling evidence answers that.

Two search spaces are reported, per exact owner and per subtree:

- the **default search space**, everything a search from the scope
  traverses. Resources count: a large fixture is rarely read whole, but
  every search traverses it and returns hits from it. The largest files are
  named beside the total so the skew is visible;
- the **view search space**, the generated `src/.ramify/` views, which are
  hidden from a default search and searched deliberately. `external` grows
  with the foreign symbols the module may use and `children` with its
  children's contracts; it is what the agent reads beyond its own text and a
  coupling signal in itself.

The buckets stay visible under the totals:

| Bucket | Search space | Counted today by context size |
| --- | --- | --- |
| Production source | default | yes, production subset |
| Tests | default | yes, test subset, kept separate |
| `README.md`, `module.ramify`, module docs | default | inventoried, not counted |
| Resources such as JSON fixtures | default | yes, separately |
| Generated `src/.ramify/` views | view | no |

Whole-file reads for orientation and identifier density, which drives hit
counts more than bytes do, are not captured; both correlate with size well
enough for a first index. Thresholds are a project parameter that the
first trial calibrates. A later normalized figure, search space divided by
a declared budget per agent, would be an agent context index.

Candidate Ramify additions, justified only by the trial: documentation and
view bytes in context size, and the architect view's `metrics` block
published rather than unavailable.

## Handling an external need

When an engineer in module M discovers a need outside M, the cases have
different costs and stay separate:

| Discovery | Cost | Decided by |
| --- | --- | --- |
| Exists and visible | none | the engineer, from its API view |
| Exists, not visible | exact re-expose declarations along the path | architect access workflow; may be policy-approved when the path stays inside the current vertical scope |
| Missing, owner inside the current subtree | none | the engineer |
| Missing, owner outside | an architect placement call, then a new seam or a scope change | architect |
| Ownership in the plan was wrong | replan | architect with a person |

The engineer does not suspend. It leaves a failing test, a stub and a written
need, completes what it can, and ends its iteration as partial with the needs
listed. State lives in the repository, so any fresh agent can resume. An
iteration goal is a state to reach or a precise reason it was not reached;
only the next iteration's goal is fixed in advance.

## Integration

Contracts and conformance tests prove each seam in isolation. Integration
failures are emergent: wiring, lifecycle, configuration, error semantics and
ordering across several modules. That composition sits in the lowest common
ancestor's own source.

The **integration agent is a vertical agent scoped to the lowest common
ancestor subtree** of the modules being integrated. It owns the composition,
may make small fixes in descendants, works under the hook, and inherits the
consumer-owned conformance tests as the guard against redesigning a contract.
A size bound on its descendant changes, with fallback to delegation when
exceeded, limits scope creep. Feature-level tests at that ancestor, from the
plan rather than from any contract, are its acceptance.

## The resulting shape

Every role is a cut on the same tree. Ramify supplies the evidence for the
cut and enforces the model inside it:

| Role | Scope | Reads | Writes |
| --- | --- | --- | --- |
| Architect | whole tree | architect view, README purposes | work-weight map, reuse findings, seams |
| Vertical engineer | a subtree chosen by complexity | subtree source, its API views | subtree source and contracts inside it |
| Contract engineer | one seam | both sides and affected consumers | contract types, conformance tests, a double when needed |
| Integration engineer | the seams' lowest common ancestor subtree | that subtree | composition, bounded descendant fixes |

A harness, when one exists, chooses cuts, orders seams and prices
escalations. Everything semantic stays in agents. cucumber-viz already runs
plans, iterations and agent sessions; scope selection and the escalation
table are what it lacks.

## Measuring the approach

The cost of implementing a plan is measured against one baseline: every
change made by an agent whose scope is the root. Decomposition improves on
it when changes are made in smaller search spaces.

For every changed line *i*, *S_i* is the search space of the session that
changed it: the subtree default search space of its scope root plus that
scope's view search space. A contract engineer's *S* is the sum of the
scopes it reads. A line changed twice counts twice, each time at the *S* of
the session that touched it, so rework penalizes itself. Mechanical commits
such as renames and formatting are excluded, as in the change-affinity
report.

- **Mean search space per change** = Σ *lines_i* · *S_i* ÷ Σ *lines_i*.
- **Search space ratio** = mean search space per change ÷ *S_root*, in
  (0, 1]; the baseline is 1. Its inverse is the **reduction factor**.
- **Session count**, and the **session-weighted total** = Σ over sessions
  of *S_s* ÷ *S_root*. Architect sessions change no lines; their search
  space, the architect view, counts here only.

The two weightings bracket the cost. Cost has a per-change term and a
per-session orientation term, both scaling with *S*; the line-weighted
ratio captures the first and makes many tiny sessions look free, the
session-weighted total captures the second. The first trial measures
tokens per session and records which weighting predicts them. A validated
predictor becomes a planning objective: the expected ratio of a proposed
set of cuts can be computed from expected line counts before any agent
runs.

No role labels are needed: composition, integration fixes in descendants,
contract work and bounded work are one formula at different weights. Only
the scope of each session is recorded, as a commit trailer. Grouping the
same sum by owner names the modules whose lines were changed at a large
*S*, which is where cuts or contracts failed.

The measure prices cost only. It is paired with hook violations remaining
at the end of the run and with completion of the plan's acceptance.

### Measuring the plan

**This subsection is a rough draft.** It is a first attempt at measuring
how many adaptations the unknowns forced, before any run has produced the
records it depends on. Every figure here is expected to change after the
first trial.

The aim is to separate unknowns the planner could have known from the
evidence it had, which measure planning quality, from unknowns only
implementation reveals, which measure how much adaptability the system
needs.

The architect phase makes three claims, each with a mechanical actual:

- **Owner drift.** Lines per owner, already computed for the cost measure,
  against the work-weight map: the share of changed lines in modules the
  map did not name, planned heavy modules with little or no change, and
  the overlap between the planned heavy set and the actual top modules by
  lines. The miss and the overlap are reported separately; a plan that
  names every module scores well on one and badly on the other.
- **Seam drift.** The behavioral dependency diagram at the start and end
  revisions gives the cross-module edges the run added. Added edges between
  modules on no planned seam are missed seams; planned seams with no added
  edge and no contract session are false seams.
- **Reuse drift.** Symbols from other modules newly imported during the
  run that the reuse findings did not name. Only those that needed an
  escalation count; an engineer finds visible symbols itself.

Every escalation is one adaptation, classified by its row in the
external-need table. Sessions caused by an escalation carry a `Cause:`
trailer, so **adaptation cost** is their tokens and sessions divided by
the run's total.

One judgment step remains, at review, per escalation: was it knowable? For
a missed reuse, whether the symbol was in the architect view; for a missed
seam, whether the dependency was inferable before code existed. The answer
is recorded with a pointer to the evidence. **Knowable share** is knowable
escalations divided by all escalations: the planning-quality figure. Its
complement is the adaptability demand that no planning removes.

A small trial yields a handful of escalations, so the knowable share is a
list to read, not a statistic. The drifts are informative from one run.

## Hypotheses to measure

1. One agent on a subtree under a context-size bound produces fewer
   violations and fewer escalations than per-module splitting of the same
   work.
2. With contract-first design, provider-first ordering makes doubles
   unnecessary on most seams.
3. An integration agent at the lowest common ancestor resolves integration
   failures with descendant changes that stay small.
4. The rows of the external-need table that occur in practice, and what each
   costs, decide which escalation paths deserve mechanism.

## First trial

Run one real multi-module toolkit change by hand: an architect run with the
skill producing the three outputs, a vertical cut per heavy module, one seam
handled contract-first, and an integration pass at the ancestor. Use the
existing skill, API views and hook; write no controller. Record per session
its scope as a commit trailer, the tokens consumed, source files read, hook
results, escalations by table row, and where a rule was skipped because it
did not simplify the work. Compute the search space ratio, the session count
and the session-weighted total from the commits and the modularity report.
