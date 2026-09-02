---
title: Modularity
description: TypeScript is modular at exactly one granularity - the file. Why multi-file, hierarchical modularity matters, and why ramify exists.
---

# Why modularity

One of the most important and useful ideas in all of software design is that
you should **decompose** any complex piece of software into modules which are
**internally highly cohesive** and **externally loosely coupled**.

TypeScript only offers very limited help with that.

## Modularity in TypeScript

TypeScript already has modules. Every file is one - and it is a real module,
with both ingredients the concept requires: a **membership boundary** (the
file) and an **interface** (its export list). Whatever a file does not export
is invisible outside it, so the interior can be rewritten freely as long as
the exports keep meaning the same thing. That is modularity, working as
intended.

Then it stops. Above the file, TypeScript provides nothing: every exported
symbol is equally importable by every file in the codebase. The only larger
unit the ecosystem offers is the package - and a package is flat, coarse, and
open by default: whatever it exports is available to any dependent, and
inside it the free-for-all is untouched. Between the file and the package -
which is exactly where application architecture lives - there is no boundary,
no interface, no inside and no outside.

## Multi-file modularity

The concept that is missing is not exotic. It is the same two ingredients,
lifted from one file to a group of files: a declared boundary saying which
files are inside, and an interface saying what the outside may see. What
**export** is to a file, some deliberate act must be to the group.

That unit is what buys the properties good software architecture actually wants:

- **Local reasoning.** To understand or change the inside, you read the
  inside and the interfaces it consumes - not the whole codebase.
- **A small surface.** Others depend on the interface, so everything behind
  it is free to change. Without the boundary, every helper someone happened
  to import is load-bearing forever.
- **Honest change review.** Every change either stays behind an interface or
  visibly alters a contract. There is no third, invisible category.

Teams approximate this today with conventions - barrels, "only import from
the index", lint bans on deep paths. The concept is right; what is missing is
a model that makes the boundary a checked fact rather than a request.

## Divide and conquer with hierarchical modules

Complex systems often decompose into hundreds of modules. Forcing them into
a flat list makes it impractical to work with them.

A hierarchical structure also helps with reasoning at different abstraction
levels, applying a **divide and conquer** approach: split a system into domains,
a domain into capabilities, a capability into implementation pieces. A **tree**
of modules mirrors that decomposition, and modularity at every level of it means:

- **Each level is an abstraction level.** A parent composes its children
  through their interfaces, without their insides. Zoom out one level and the
  detail below the boundary genuinely disappears.
- **Work splits along the boundaries.** A subtree can be handed over whole -
  to a team, or to an agent - with its obligations to the rest of the system
  stated entirely at its boundary.
- **Privacy nests.** What a sub-module keeps from its own parent is thereby
  kept from everyone outside it. Hiding composes; a flat namespace cannot say
  that at all.

## Especially - but not only - with agents

Everything above holds for human teams; coding agents raise the stakes on
each point.

**Smaller contexts.** An agent reasons worse as its context grows. Splitting
its work into smaller chunks at every abstraction level counters this: one module's inside plus the
interfaces it consumes is a workload that fits. The module tree allows
the decomposition of a codebase into contexts of an ideal size.

**The right abstraction level.** An agent planning at the parent level should
reason over children's interfaces, not their implementations - and an agent
implementing inside a child should not be tempted by the internals of its
siblings. The hierarchy gives each task its level and its horizon.

**Enforcement over convention.** A convention is exactly what an agent under
pressure to make the build pass will violate - the deep import that works is
one edit away. A checked model turns the boundary from a request into a fact:
the illegal import is not a style complaint but a verifiable violation, and
verifying a change becomes local to the boundary it touches.

None of this is agent-specific - it is the same locality that helps a
reviewer, a new team member, or a refactor. Agents simply make the cost of
its absence immediate.

## That's why ramify

**ramify.ts makes multi-file, hierarchical modularity declared and
enforceable in TypeScript.** Modules exist by declaration and form a tree;
everything cross-module is closed by default; a module passes symbols onward
only by exposing them again, to its parent or to its descendants, so reach is
never configured, only composed from one-hop decisions.

From here:

- [**The core model**](/model) - the rules, introduced from scratch and
  illustrated with two small interactive examples.
- [**Tags**](/tags) - the other half of the rule: availability rules carried
  by tags, which can only ever restrict.
- [**Glossary**](/glossary) - the agreed vocabulary, one term, one
  definition.

One reading note: from here on, **module** always means a ramify module -
the declared multi-file unit. A TypeScript/ES module is always called a
**file**.
