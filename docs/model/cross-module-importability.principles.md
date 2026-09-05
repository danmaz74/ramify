# Cross-Module Importability Principles

**Status:** Active

## Purpose

Define the rules that determine whether a source file may import a symbol
owned by another Ramify module. These principles preserve module boundaries
while allowing modules to share selected symbols through explicit exposure
and to restrict their use through tags.

This document is authoritative for the importability rules. The accompanying
[Glossary](glossary.md) is authoritative for their vocabulary. Together, these
two documents define the complete model. The website provides didactical
explanations and examples; the website, evaluator, diagrams, and other tools
must conform to these documents.

## Goals

- Make the permitted imports of a module understandable from its ownership,
  exposure decisions, and tags.
- Apply the same small set of rules at every level of the module tree.
- Preserve each owner's control over the initial exposure of its symbols and
  each parent's control over their onward exposure.
- Keep importability independent of observed dependencies, import paths,
  and enforcement architecture.

## Principles

### Ownership Forms One Declared Tree

A module is declared by marking a directory as a module root. Modules form
one tree with an explicit application root. Every other module's parent is
the innermost declared module whose directory contains its directory.

Every source file belongs to exactly one module. A module's files are those
inside its directory, excluding the directories of its submodules. It owns
the symbols exported by those files. Sharing a parent does not give sibling
modules shared ownership of their files or symbols.

The unit of exposure is an individual symbol together with its tag set.

### Ramify Restricts Cross-Module Imports Only

Files belonging to the same module may import each other's exported symbols
freely under ordinary TypeScript rules. Ramify applies no exposure or tag
checks to same-owner imports.

Every cross-module import is closed by default. It must be authorized by
explicit exposure and satisfy the applicable tag rules. A module's position
in the tree, including being the application root, grants no implicit access
to another module's symbols.

### Visibility Comes From Ownership And Exposure

A symbol is visible in a module if and only if one of these conditions holds:

1. The module owns the symbol.
2. A direct child exposes the symbol to its parent.
3. A proper ancestor exposes the symbol to its descendants.

A module may expose any symbol visible in it through exactly two channels:

- **Expose to parent:** make it visible in the direct parent.
- **Expose to descendants:** make it visible in every proper descendant.

A symbol's reach is the set of modules in which it is visible. Every exposure
chain begins with ownership; re-exposing a symbol that has never reached the
module cannot create visibility.

Each decision is local: the exposing module acts on a visible symbol and
addresses its parent or its own subtree. There is no additional sibling,
cousin, global, or branch-targeted exposure channel.

### Re-Exposure Preserves Ownership And Tags

Exposing a received symbol is re-exposure. It is the same operation as
exposing an owned symbol and uses the same two channels.

Every exposure carries the original symbol and its immutable tag set.
Re-exposure never transfers ownership and must not add, remove, or change
tags.

Eligibility to expose depends on visibility. A module may re-expose a symbol
even when tag rules prevent its own files from importing it. Permission to
pass a symbol onward does not imply permission to use it.

### Exposure To Parent Cedes Onward Exposure

A child exposing a symbol to its parent permits the parent to re-expose it
through either channel. The child cannot grant access to the parent while
withholding the parent's authority to expose it onward.

Re-exposure follows a chain of one-hop decisions. A grandchild's symbol can
reach the application root only when every intermediate module exposes it
further upward. Receiving the symbol lets the parent compose with it only
when the symbol is also available there.

### Exposure To Descendants Covers The Whole Subtree

One exposure to descendants reaches every depth and branch of the exposing
module's subtree. It requires no further decisions inside that subtree and
cannot exclude a branch or stop at a selected depth.

The exposure also reaches the branch from which a re-exposed symbol arrived.
An exposure from above can therefore make a symbol visible between siblings
even when their immediate parent does not expose it downward. The downward
turn in a cross-branch chain may occur at the lowest common ancestor or at
an ancestor above it.

An owner exposing a symbol only to descendants keeps it within its subtree.
A descendant cannot carry it outside: reaching the owner's parent still
requires the owner's own expose-to-parent decision.

Exposure to descendants is independent of the shape of the receiving
subtree. Subdivision preserves visibility supplied by existing ancestor
exposures to descendants.

### Redundant Exposure Is Permitted

A symbol received through an ancestor's exposure to descendants may be
re-exposed. That operation adds no visibility: the symbol is already visible
in the re-exposing module's parent and descendants. Passing it above the
ancestor still requires that ancestor's own expose-to-parent decision.

### Tags Restrict Availability Without Changing Visibility

Owners assign tags to symbols. Module tags classify the files belonging to
that module. Symbol tags default to empty except
where the owner's testing classification requires `testing`.

Each built-in tag carries the availability rule fixed by Ramify. There are
two rule kinds:

| Rule | Condition on a cross-module import | Import forms covered |
| --- | --- | --- |
| **Required module tag** (`⇥`) | If the symbol carries the tag, the importing module must carry the same tag. | Value and type-only imports. |
| **Required symbol tag** (`⇤`) | If the importing module carries the tag, the symbol must carry the same tag. | Value imports only. |

All applicable rules must be satisfied. A tag can withhold permission to
import a visible symbol, but must never expose a symbol, widen its reach,
or change its visibility.

Only the built-in tags `testing` and `browser` have importability semantics.
Projects may use other labels for search or documentation, but those labels
are inert for importability. A project cannot define additional availability
rules or change a built-in tag's rule.

### Classification Belongs To The Declared Module

A module has exactly the tags declared in its own definition, or none when
no tags are declared. Its tags classify every file belonging to that module.
Submodules are separate owners and do not inherit tags from their ancestors.

Ordinary subdirectories remain part of their owning module and share its
classification. Declaring a new submodule creates a new ownership boundary;
its classification must be declared independently. Exposure to descendants
still preserves visibility across subdivision, but does not assign tags.

There are no file-level importer contexts. All files belonging to a module
have the same cross-module import permissions for a given import form. Code
requiring a different classification belongs in a separately declared
module. Tests kept inside a production module have ordinary same-owner
access, but gain no additional cross-module access to test support.

Module boundaries and classification originate in explicit declarations,
never in filename or directory-name conventions. A `*.test.ts` filename does
not make its file part of a testing module, and a `client.ts` filename does
not assign `browser`.

### Testing Support Requires A Testing Module

The `testing` tag carries the required module tag rule. A symbol tagged
`testing` is test support and may be imported across a module boundary only
by a module carrying `testing`. This applies to value and type-only imports:
test support is excluded from the production contract in both forms.

A module curates its test support by tagging and exposing selected symbols.
Testing modules gain no blanket private access to other modules. The tag
does not grant global reach; test support must follow ordinary exposure
chains.

Every symbol owned by a module tagged `testing` must
carry `testing`. This is mandatory: an explicit symbol tag set that omits
`testing` is invalid, including an empty set. The owner may add `browser`, but
cannot put the symbol on the default production contract. This requirement
does not classify symbols owned by a separately declared submodule.

The requirement follows ownership. Received symbols keep their owner's tags,
including when a testing module re-exposes them. A production symbol received
from another module, including a child, retains its original tags. Re-exposure
cannot turn production contracts into test support or remove a test-support
restriction.

An untagged module may receive and re-expose test support while being unable
to import it itself. This allows a parent to expose received test support
to its descendants while the tag restricts its use to testing modules.

### Browser Imports Require Browser-Safe Symbols

The `browser` tag carries the required symbol tag rule. A browser module may
value-import a symbol from another module only when that symbol is visible
there and carries `browser`.

On a symbol, `browser` is the owner's promise that the symbol's entire
transitive runtime closure is browser-safe, including the owner's private
files. The promise is verified separately from the importability decision.
A false claim is the owner's error and must be reported at the owner, not
at an importer that relied on the declared tag.

Browser safety is declared per symbol. A module may own both browser-safe
and Node-only symbols; the distinction does not require separate modules.
The verification mechanism does not introduce restrictions on same-owner
imports or add an exposure channel.

### Type-Only Imports Retain Coupling Restrictions

A symbol is available in a module when its files may import it as a value.
It is type-available when its files may import it through a type-only import.

A required module tag restricts coupling, so it applies to both import forms.
A required symbol tag restricts runtime imports, so it does not block erased
type-only imports. This scope belongs to the rule kind.

The complete decision is:

| Import | Ramify permits it when |
| --- | --- |
| Same-owner, value or type | Always; no module boundary is crossed and no Ramify exposure or tag check applies. |
| Cross-module value | The symbol is visible and every applicable availability rule is satisfied. |
| Cross-module type-only | The symbol is visible and every applicable required module tag rule is satisfied. |

For every module:

> available ⊆ type-available ⊆ visible

With no tags declared, all three sets coincide. No rule permits a value
import while forbidding the corresponding type-only import.

The rules compose independently. For visible test support, a module carrying
both `testing` and `browser` requires the symbol to carry `browser` for a
value import. A type-only import remains subject to the `testing`
requirement and is exempt from the browser requirement.

### Importability Is Independent Of Dependency Use And Mechanics

These principles determine whether an import is permitted. They do not
require a permitted import to exist or make it an observed dependency.
Dependency declarations and tracking must not be treated as additional
importability rules.

Import specifiers, TypeScript resolution, declaration syntax, generated
surfaces, evaluator APIs, and enforcement architecture are implementation
concerns. They must preserve the ownership, exposure, and availability rules
without introducing additional ways to grant access.
