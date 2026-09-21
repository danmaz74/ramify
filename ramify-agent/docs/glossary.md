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
