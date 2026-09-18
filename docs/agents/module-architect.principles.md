# Module Architect Principles

**Status:** Active

## Purpose

Define what Ramify provides to an agent reasoning about a project's whole
module architecture, and what remains the agent's responsibility.

These principles apply regardless of the architect surface: generated views,
query interfaces, or other representations.

The [importability principles](../model/cross-module-importability.principles.md)
remain authoritative for what may be imported. The accompanying
[glossary](glossary.md) defines the terms used here; behavioral terms are
defined in the [dependency glossary](../architecture/dependency-glossary.md).

This document does not redefine the Ramify model.

## Principles

### Local Engineering, Global Architecture

Engineering agents should work from local architectural context: their own
module, its children, and the foreign APIs visible to it. They should not
need to understand the project's global architecture.

The module architect has global architectural scope. It reasons about
whether a required capability appears to exist, whether it is accessible to
a module and through what path, where a missing capability belongs, and whether
responsibilities should move.

When an existing capability is not accessible where needed, the architect
decides whether the architecture should change to make it accessible.

### Ramify Supplies Evidence, the Architect Supplies Meaning

Ramify exposes deterministic architectural evidence: module topology,
purposes and tags, owned symbols, source-derived behavioral evidence,
documentation and tests, exposure relationships, and statically observed
dependencies.

Ramify does not infer application capabilities, rank architectural choices,
or recommend where responsibilities belong.

Mapping capabilities to symbols, deciding whether existing behavior
satisfies a need, and choosing architectural placement are the architect's
work.

### Behavioral Evidence Is Derived; Capability Is Interpreted

Ramify describes concrete symbols, references and dependencies in behavioral
terms derived from source.

Application capabilities are semantic concepts identified and attributed by
people or agents. They are not facts derived by Ramify.

Analysis capabilities refer only to parts of Ramify's own analysis pipeline
and are unrelated to application capabilities.

### Global Discoverability, Progressive Detail

The architect has global discoverability without loading all implementation
detail at once.

Ramify provides compact project-wide evidence first, ordered by facts such
as exposure and observed use, and deterministic drill-down into more
detailed evidence. Source inspection is a fallback when that evidence is
insufficient.

### One Revision Per Project State

Evidence combined to represent one project state comes from one analysis
revision.

Historical comparisons identify the revision of each compared state
separately.

### Discovery Is Best Effort; Access Is Definitive

Finding an existing capability is a best-effort semantic task. Failure to
find one is not proof that it does not exist.

Whether a module may use a symbol is determined by the importability model.
A symbol's presence in an architect surface does not make it available to
that module.
