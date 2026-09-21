# ramify-agent Glossary

**Status:** Proposed

## Purpose

Define the vocabulary of the [harness principles](harness.principles.md) and
the [harness architecture](architecture.md). Those documents contain the rules
and the design; this companion defines their terms.

Ramify's own vocabulary is defined in the toolkit's
[model glossary](../../docs/model/glossary.md) and
[agents glossary](../../docs/agents/glossary.md) and is not repeated here.

For search space, delivered-change complexity, token efficiency and their
selected measurements, use the [metrics glossary](metrics/glossary.md).

## Plan

A **plan** is a person's request for a feature, written as
`plans/<plan-id>/plan.md` in the target project.

The harness reads and captures a plan and never edits it. The plans that
deliver ramify-agent itself are development documents under `docs/plans/` and
are not plans in this sense.

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

A **work item** is one unit of the work loop: a scope on the module tree and a
goal, carried out by one agent session.

Its kind states the scope: implement, for one subtree; contract, for one seam;
integrate, for the subtree of a lowest common ancestor; architect, for the
architect view.

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

A **fake** is a temporary stand-in for the missing part of a provider, used by
a consumer until the real provider exists.

It replaces only what is missing; existing behavior stays real. The tests that
pass against the fake must pass unchanged against the real provider, and the
fake is then removed.
