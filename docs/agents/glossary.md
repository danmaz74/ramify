# Agents Glossary

**Status:** Active

## Purpose

Define the vocabulary of the
[Module Architect Principles](module-architect.principles.md). The
principles document contains the rules; this companion defines their terms.
Behavior terms are defined in the
[dependency glossary](../architecture/dependency-glossary.md) and are not
repeated here.

## Engineering agent

An **engineering agent** is an agent that changes one module using local
data: its own module, its children and the foreign APIs its module receives.

## Module architect

The **module architect** is the agent with a global view of a project's
modules. It answers whether a capability exists, whether a module may use
it and through what path, where a missing capability belongs, and whether
responsibilities should move.

## Capability

A **capability** is a purpose that a person or agent ascribes to one or more
symbols. Ramify never derives, names or counts a capability. A capability's
entry points are behavior-capable symbols; its vocabulary is supporting
types and data.

## Behavior

A **behavior** is a property Ramify derives from source for one symbol or
one reference: a behavior-capable symbol's static shape can run, and a
behavioral dependency calls, constructs or passes such a symbol. Ramify's
outputs use behavior terms only.

## Analysis capability

An **analysis capability** is an optional part of Ramify's own analysis
pipeline that a run may include, skip or fail. It is the code's `Capability`
type and is unrelated to a project's capabilities.

## Architect surface

An **architect surface** is any output through which the module architect
receives evidence: a generated view, a query interface, or both.

## Revision

A **revision** is one identified completed analysis of a project. Every
fact combined in one answer comes from one revision.
