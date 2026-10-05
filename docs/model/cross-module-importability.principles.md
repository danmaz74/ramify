# Cross-Module Importability Principles

**Status:** Active

Whole-tree ownership and project-boundary principles adopted 2026-10-01;
their detailed contracts, including auxiliary-source rules, are specified
separately. Ramify's checks implement them.

## Purpose

Define the principles that determine whether a source file may import a symbol
owned by another Ramify module, and prevent production source from depending
on testing source within its own module. These principles preserve module boundaries
while allowing modules to share selected symbols through explicit exposure
and to restrict their use through tags.

These principles govern the importability model. The website, evaluator,
diagrams and other tools must conform to them.

## Goals

- Make the permitted imports of a module understandable from its ownership,
  exposure decisions, and tags.
- Apply the same small set of rules at every level of the module tree.
- Preserve each owner's control over the initial exposure of its symbols and
  each parent's control over their onward exposure.
- Keep importability independent of observed dependencies, import-specifier
  spelling, and enforcement architecture.

## Principles

### Ownership Forms One Declared Tree

A module is declared by marking a directory as a module root. Modules form
one tree with an explicit application root. Every other module's parent is
the innermost declared module whose directory contains its directory.

Module ownership follows declared boundaries and containment, independently
of inventory and analysis coverage.

The unit of exposure is an individual exported symbol.

### Imports Respect Project Boundaries

An import from analyzed source into a declared nested tree must use package
resolution.

### Non-Testing Source Does Not Depend On Testing Source

Non-testing source must not import, re-export or load testing-classified
source, including within the same module.

### Visibility Comes From Ownership And Exposure

Every cross-module symbol import is closed by default: the symbol must first
be made visible through explicit exposure. A module's position in the tree,
including being the application root, gives no implicit access to another
module's symbols.

### Re-Exposure Uses The Same Channels

Exposing a received symbol is re-exposure. It is the same operation as
exposing an owned symbol and uses the same two channels.

Eligibility to expose requires visibility and an exposable original.
Permission to pass a symbol onward does not imply permission to use it.

### Exposure To Parent Cedes Onward Exposure

A child exposing a symbol to its parent permits the parent to re-expose it
through either channel. The child cannot expose a symbol to the parent while
withholding the parent's authority to expose it onward.

Re-exposure follows a chain of one-hop decisions. A grandchild's symbol can
reach the application root only when every intermediate module exposes it
to its parent in turn.

### Exposure To Descendants Covers The Whole Subtree

One exposure to descendants reaches every depth and branch of the exposing
module's subtree. It requires no further decisions inside that subtree and
cannot exclude a branch or stop at a selected depth.

### Tags Restrict Availability Without Changing Visibility

All applicable rules must be satisfied. A tag can withhold permission to
import a visible symbol, but must never expose a symbol, widen its reach,
or change its visibility.

### Re-Exposure Preserves Ownership And Tags

Every exposure carries the original binding with its owner and its immutable
tag set. Re-exposure and forwarding aliases never transfer ownership and
cannot add, remove, or change those tags.

### Exposure Requires Available Signature Companions

A module exposing a symbol must make that symbol's signature companions
type-available wherever the exposure makes the symbol visible.

### Source Checking Reports Definite Violations And Its Coverage

Source interpretation checks identifiable symbol selections and reports
unsupported or unresolved portions as unverifiable. Definite violations and
invalid models fail a check. Analysis limits produce nonblocking coverage
notes by default, so a completed bounded check may pass with partial coverage.
Unchecked access must not be labelled allowed or external.

### Importability Is Independent Of Dependency Use And Mechanics

These principles determine whether an import is permitted. They do not
require a permitted import to exist or make it an observed dependency.
Dependency declarations and tracking must not be treated as additional
importability rules.

Import specifiers, TypeScript resolution, declaration syntax, generated
surfaces, evaluator APIs, and enforcement architecture are implementation
concerns. They must preserve the ownership, exposure, and availability rules
without introducing additional ways to give access.
