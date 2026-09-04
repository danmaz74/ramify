---
title: Why hierarchical modularity
description: TypeScript is modular at exactly one granularity - the file. Why multi-file, hierarchical modularity matters, and why ramify exists.
---

# Why hierarchical modularity

One of the most important and useful ideas in all of software design is that
you should **decompose** any complex piece of software into modules which are
**internally highly cohesive** and **externally loosely coupled**.

TypeScript helps with that in two ways, but both are limited.

## Modularity in TypeScript

**Modules.** TypeScript already has modules. Every file is one - and
it is a real module, with both ingredients the concept requires: a
**membership boundary** (the file) and an **interface** (its export list).
Whatever a file does not export is invisible outside it, so the interior
can be rewritten freely as long as the exports keep meaning the same thing.
That is modularity, working as intended.

Then it stops. Above the file, TypeScript provides nothing: every exported
symbol is equally importable by every file in the codebase. The only larger
unit the ecosystem offers is the package - and a package is flat, coarse, and
open by default: whatever it exports is available to any dependent, and
inside it the free-for-all is untouched. Between the file and the package -
which is exactly where application architecture lives - there is no boundary,
no interface, no inside and no outside.

**Classes.** Classes are how modularity is implemented in most OOP languages.
But classes don't map to directories, which counts for agents, and a lot
of TS code doesn't use them regardless.
[Classes and modules](#appendix-classes-and-modules), in the appendix,
expands this subject.

## Recursive divide and conquer with hierarchical modules

Expanding the single-file module boundary and interface to groups of files
is an almost natural move. As a matter of fact, teams have been approximating
this for a long time using conventions based on **barrel files and "only
import from the index" mandates**.

Going from single-file modules to multi-file ones is a first step towards
hierarchical modularity. The single file, with its enforced boundary, is the
lowest level. Re-exporting file-exported symbols through a barrel creates a
second level: the directory, with the barrel as its interface. Organizing
barrel-based modules into subdirectories, with sub-barrels, allows
**recursive divide and conquer**, which is how large systems get decomposed
in every engineering discipline: a system into domains, a domain into
capabilities, a capability into implementation pieces, each one an
abstraction level with its own boundary and interface, down to pieces small
enough to hold in one head, or in one context window.

The recursion is the point. Stopping at the second level, a flat set of
packages as most languages offer, does not scale well: a complex system
decomposes into hundreds of modules, and a flat set of hundreds has no level
to zoom out to. This makes it much harder to reason about the system at
different abstraction levels, which is what makes very complex systems
manageable. A **tree** of modules mirrors the
decomposition instead, and modularity at every level of it means:

- **Each level is an abstraction level.** A parent composes its children
  through their interfaces, without needing to understand their internal
  implementation. Zoom out one level and the detail below the boundary
  disappears; zoom in and the level above shrinks to the interfaces it
  consumes.
- **Local reasoning, at every level.** To understand or change a module, you
  read its internals and the interfaces it consumes, not the whole codebase.
- **A small surface, at every level.** Hierarchical splitting allows
  keeping each interface, but also each implementation, small enough to
  be easily understood.
- **Refinement is free.** Splitting a module into sub-modules changes nothing
  about what the rest of the system may import. A flat set renegotiates every
  dependent each time a package splits.
- **Work splits along the boundaries.** A subtree can be handed over whole,
  to a team or to an agent, with its obligations to the rest of the system
  stated entirely at its boundary.
- **Privacy nests.** What a sub-module keeps from its own parent is thereby
  kept from everyone outside it. Hiding composes; a flat set of packages
  cannot say that at all.

### Costs and ROI

A tree with many levels and many modules also has costs.

- **No-shortcuts cost.** Being forced to follow strict importability rules
  means that sometimes you can't adopt a technically working solution to an
  immediate, maybe urgent, problem, just because it violates the self-imposed
  rules. Every engineer has been in a situation where taking on some
  technical debt was justified by the urgency. Discipline has a cost.
- **Cognitive cost of hops.** Small modules, like small functions and small
  classes, mean more indirections to follow before you reach the code that
  does the work. The tree adds a hop of its own: two modules in different
  branches share a symbol only through their common ancestor, one declaration
  per level, where a flat graph would draw a direct edge.

The ROI of this kind of discipline has been debated forever, and different
engineers have come to different conclusions. On both points, though, the
balance is changing fast. Coding agents follow indirection much more easily
than people do, especially when it is well organized and documented. And
organizing code according to set rules costs the engineer much less when an
agent writes the extra declarations, because agents are great with
boilerplate.

Agents increase the ROI of this kind of discipline.

## Where the convention stops

The barrel convention goes in the right direction, but it has huge limits.
Three things it cannot do, the first a matter of enforcement, the other two
a matter of meaning:

- **Enforce the boundary.** A deep import into a module's internals compiles
  and runs; "only import from the index" is a request. Even a lint ban on deep
  paths is a list of path patterns, written and maintained per module, and
  it says nothing about which modules may depend on which.
- **Say who the interface is for.** A barrel exports to everyone or to no
  one. It cannot expose a symbol to the parent only, or to the module's own
  descendants only, so privacy does not nest: a sibling can import a
  sub-barrel directly, and whatever the parent re-exports is open to the
  whole codebase.
- **Show what the tree is.** Nothing declares which directories are modules.
  The tree exists in naming habits and in a few heads, so nobody can list
  the modules, their interfaces, or their dependencies, and a newcomer cannot
  tell a boundary from a convenience.

What is missing is a model that makes the boundary a guarantee rather than
a request, and the hierarchical structure a semantically defined fact rather
than a habit.

ramify gives that at every level of the tree. A module is a declared
directory, and the module tree follows the directory tree; modules are
closed by default, with interfaces stated per direction, to the parent or
to the descendants. The structure is something a tool can draw, an agent can
be handed, and a newcomer can read; adherence to its rules is something the
checker enforces. See [the ramify core model](/model).

## Why this matters more with coding agents

[Costs and ROI](#costs-and-roi) said that agents lower the cost of the
discipline. They also raise its return.

For the agent, three main advantages.

**Smaller contexts.** An agent reasons worse as its context grows. With a good
module architecture, one module's internals plus the interfaces it consumes is
a workload that fits, and because the tree is declared, that workload can be
assembled by a tool rather than guessed: the module's files, plus exactly the
symbols exposed to it.

**The right abstraction level.** An agent planning at the parent level should
reason over children's interfaces, not their implementations - and an agent
implementing inside a child should not be tempted by the internals of its
siblings. The hierarchy gives each task its level and its horizon, and the
declarations say what they are: what the children expose to the parent is
the planning view; the module's internals plus what it receives is the
implementing view.

**Enforcement over convention.** A convention is exactly what an agent under
pressure to make the build pass will violate - the deep import that works is
one edit away. With the checker, the boundary is enforced rather than
requested: the illegal import is a violation the build reports, not a style
complaint, and verifying a change becomes local to the boundary it touches.
And ramify's rules are few and simple, a tree, one rule and two directions,
so an agent can follow them without being told twice, and when the checker
does report a violation the fix is as small as the rule.

None of this is agent-only - it is the same locality that helps a
reviewer, a new team member, or a refactor. But one advantage is specific to
the engineer who works with agents and does not fully trust them.

**Oversight at the level you care about.** When agents write the code,
reading every file they touch can be overwhelming. The module tree offers a
way to keep your eye at the abstraction level you want, and to let the
agents work on their own below it, as far as you trust them. What you watch at
that level is small and meaningful: which modules changed, which interfaces
moved, which dependencies appeared. ramify's module dependency explorer
draws exactly that from the model, so you can follow what agents are doing,
and steer it, one level at a time. And the trust you extend below is
bounded: whatever happens inside a subtree, its boundary still states what
it owes the rest of the system.

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
- [**Module dependency explorer**](/explorer) - the module tree read from
  above: sub-modules, dependencies, interfaces and metrics at every level.
- [**Glossary**](/glossary) - the agreed vocabulary, one term, one
  definition.

One reading note: from here on, **module** always means a ramify module -
the declared multi-file unit. A TypeScript/ES module is always called a
**file**.

## Appendix: classes and modules

The introduction named the class as TypeScript's second mechanism, and it is
a real one: a class can mark members `private`, or `#private` for the
runtime-enforced form, and nothing outside the class can touch them. ramify
does not replace it. It is a different boundary from the one this page is
about.

A class hides the state of one object behind its methods. A module hides the
decisions of one part of the codebase behind an interface: which functions,
types, constants and classes exist inside, and which of them the outside may
use. A class is instantiated many times at runtime; a module once, statically.
The two compose. The class guards the object's fields; the module guards the
class itself, the helpers around it, and whatever module-level state they
share.

Three things the class boundary cannot do:

- **Cover code that is not a class.** Functions, plain types, hooks, reducers,
  closures: most TypeScript is not written as classes, and none of it has a
  `private` keyword. Its only boundary is the file's export list. A module
  boundary covers all of it the same way, types included.
- **Say what belongs together.** A class is one unit; a codebase is thousands.
  Nothing in a class states which other classes, functions and types form a
  part of the system with it. That statement is the module's to make, at
  every level.
- **Show up in the filesystem.** A class boundary exists only inside a parser;
  a module boundary is a directory. This matters most with coding agents,
  because agents work through the filesystem: they list directories, grep
  paths, read files, and are confined by path-based permissions. A directory
  boundary is one that every one of those tools understands natively. A
  listing shows the internals, a grep scoped to the path searches exactly the
  module, and a sandbox that confines an agent to a subtree confines it to a
  module. "Which files may I change, and which interface must I keep" becomes
  a question about paths, answered by the same structure the checker enforces.
  Class privacy is invisible to all of those tools: it gives nothing to scope
  by, and finding what may call a public method is a search of the whole
  repository.

For the record: `#private` holds at runtime, TypeScript `private` at compile
time, ramify's boundaries at check time. All three are boundaries a tool can
verify and a reviewer can trust.
