# Module Architect Principles

**Status:** Active

## Purpose

Define what Ramify gives an agent that reasons about a project's whole
module architecture, and what it leaves to that agent. These principles
hold whatever surface delivers the information: a generated view, a query
interface, or both.

The [importability principles](../model/cross-module-importability.principles.md)
remain authoritative for what may be imported. The accompanying
[glossary](glossary.md) defines the terms used here; behavior terms are
defined in the [dependency glossary](../architecture/dependency-glossary.md).
This document adds nothing about the model.

## Principles

### Two Agents, Two Scopes

An engineering agent works from local data: everything about its own module,
much about its children, and only the foreign APIs its module receives. It
does not need the project's architecture.

The module architect is the one agent with a global view. It answers four
questions: whether a capability already exists, whether a given module may
use it and through what path, where a missing capability belongs, and
whether responsibilities should move.

### Ramify Supplies Evidence, The Architect Supplies Meaning

Ramify gives the architect the module tree, each module's purpose and tags,
its exported originals with their roles, shapes, bounded signatures and
first documentation paragraphs, its test titles, its exposures and their
re-exposures, and its observed dependencies. All of it is derived from
source, declarations and documentation that people wrote.

Ramify adds no summary, keyword, ranking score, capability name or
recommendation. Mapping a capability to symbols, judging whether an
existing symbol satisfies a need, and choosing where new behavior belongs
are the architect's work.

### Outputs Speak Of Behavior, Not Capability

Ramify's outputs use behavior terms only. Capability appears in
architect-facing narrative and instructions, never as a file, field or
count.

### Discovery Is Best Effort, Access Is Definitive

Finding an existing capability may fail even when it exists, and absence
from any surface is not proof. Whether a module may use a symbol is
decided by the importability model alone; a symbol's presence in an
architect surface creates no availability.
