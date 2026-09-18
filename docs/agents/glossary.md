# Agents Glossary

**Status:** Active

## Purpose

Define the vocabulary of the
[Module Architect Principles](module-architect.principles.md). The
principles document contains the rules; this companion defines their terms.
The specific symbol and dependency classifications are defined in the
[dependency glossary](../architecture/dependency-glossary.md) and are not
repeated here.

## Engineering agent

An **engineering agent** works within one module's abstraction scope.

It uses local information: the module it is working on, the interfaces and
architectural information of its children, and the foreign APIs visible to
that module. It is not expected to understand the global project
architecture.

## Module architect

The **module architect** is the agent with a global architectural view of
the project's modules.

It reasons about capabilities and module responsibilities. In particular,
it can:

- search, on a best-effort basis, for an existing implementation of a
  required capability;
- determine whether that capability is accessible to a module and through
  what exposure path;
- decide where a missing capability most naturally belongs;
- identify when a new module may be needed; and
- reason about architectural health and responsibility changes such as
  moving, splitting, or joining modules.

The module architect needs global architectural evidence, but does not
necessarily need global implementation detail loaded into its context.

## Capability

A **capability** is a semantic ability or responsibility that the software
provides or is expected to provide.

A capability may be attributed to one or more symbols when those symbols
provide access to, enable, or otherwise form an entry point for using that
capability.

The capability is not an intrinsic property or classification of a symbol.
A capability may exist conceptually before it is implemented, may be
implemented by multiple symbols, and the same symbol may provide access
to more than one capability.

Ramify does not derive, name, rank, or count project capabilities. It
exposes deterministic evidence from which a person or agent may identify
capabilities and attribute them to symbols.

Symbols through which a capability can be used are its entry points.
Supporting types, values, schemas, and other symbols needed to understand
or use the capability form its vocabulary.

## Behavioral

**Behavioral** qualifies deterministic source evidence of executable use: a
behavior-capable symbol, or a behavioral reference to one. It describes
neither what the software does nor what executes at runtime; its complement
is non-behavioral, and evidence Ramify cannot classify is unknown.

## Evidence

**Evidence** is deterministic project information made available to an agent
for semantic reasoning.

Examples include module topology, module descriptions, symbols and signatures,
exposure relationships, references, tests, and documentation.

Ramify may extract, organize, and expose evidence, but the semantic conclusions
drawn from that evidence belong to the agent or person consuming it.

## Analysis capability

An **analysis capability** is an optional component of Ramify's own analysis
pipeline that an analysis run may include, skip, or fail.

It corresponds to Ramify's code-level `Capability` type and is unrelated to
a project's semantic capabilities.

## Architect surface

An **architect surface** is an interface through which the module architect
receives architectural evidence.

It may be a generated materialized view, a query interface, or a combination
of both.

An architect surface should expose deterministic information without adding
semantic capability interpretation on Ramify's behalf.

## Revision

A **revision** is one identified, completed result of Ramify analysis for a
project state.

Architect surfaces and queries may be associated with a revision so that evidence
used during architectural reasoning comes from a consistent analysis result.
