# Cross-Module Importability Principles

**Status:** Active

The `ui` tag and module-owned `src/tests/` source area are adopted. The current
evaluator still implements the earlier module-only classification model;
these additions require implementation before it conforms to this document.

## Purpose

Define the rules that determine whether a source file may import a symbol
owned by another Ramify module, and prevent production source from depending
on testing source within its own module. These principles preserve module boundaries
while allowing modules to share selected symbols through explicit exposure
and to restrict their use through tags.

This document is authoritative for the importability rules. The accompanying
[Glossary](glossary.md) is authoritative for their vocabulary. Together, these
two documents define the complete model. The website provides didactical
explanations and examples; the website, evaluator, diagrams, and other tools
must conform to these documents.

The required concrete directory structure and declaration grammar are specified in
[Directory Structure And Module Description Principles](module-description.principles.md).
That document records these semantics without adding importability rules.

[TypeScript Source Interpretation Principles](typescript-source-interpretation.principles.md)
records the adopted resource and source-area interpretation and proposes how other source
constructs map to these symbol-level decisions. Its remaining proposed
source-form policies are not yet adopted model rules.

## Goals

- Make the permitted imports of a module understandable from its ownership,
  exposure decisions, and tags.
- Apply the same small set of rules at every level of the module tree.
- Preserve each owner's control over the initial exposure of its symbols and
  each parent's control over their onward exposure.
- Keep importability independent of observed dependencies, import-specifier
  spelling, and enforcement architecture. Resolved source areas determine
  classification and production-to-testing isolation.

## Principles

### Ownership Forms One Declared Tree

A module is declared by marking a directory as a module root. Modules form
one tree with an explicit application root. Every other module's parent is
the innermost declared module whose directory contains its directory.

Every source file belongs to exactly one module. Its source is under `src/`,
including the same-owner `src/tests/` and `src/interfaces/` directories;
separately declared modules belong under `subs/`. Ownership of a symbol follows
its original binding, not a forwarding
alias. Sharing a parent does not give sibling modules shared ownership of
their files or symbols.

The unit of exposure is an individual symbol together with its tag set.

### Shared Ownership Permits Internal Access Subject To Test Isolation

Files belonging to the same module may import each other's exported symbols
under ordinary TypeScript rules without exposure or tag checks, subject to
the production-to-testing source restriction below. Tests in a module's
`src/tests/` can therefore inspect its own `src/` internal exports. This gives
them no access to a separately owned child's private symbols.

A source file whose source-area classification omits `testing` must not
import, re-export, or load testing-classified application source, even with
the same owner. This restriction applies to value and type-only imports,
to the resolved target resource, and to the original defining source of a
selected binding. A testing barrel forwarding a production binding cannot
serve as a production import path. Forwarding does not change the original
binding's tags or classification. An alias outside testing source cannot
hide a binding originally defined in testing source either.

This is a source-origin restriction, not a same-owner symbol-tag check.
A binding defined in non-testing `src/` may carry `testing` to restrict its
cross-module contract while remaining usable by that owner's production
files. Classification does not propagate from tests into the production
files they import. Source checks apply at each import and forwarding step;
declaration-only exposure does not load source or change its classification.

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
when the symbol is also available in the importing source area.

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

Owners assign tags to symbols. Module tags classify ordinary `src/`, including
`src/interfaces/`; the module's test profile classifies `src/tests/`.
These two source areas share visibility,
but their tag-filtered availability can differ. Symbol tags default to the
mandatory `testing` and `ui` tags of their original defining source area,
or the empty set when neither is required. A module tagged `ui` requires
`ui` on all its owned symbols, including those defined in `src/tests/`.

Each built-in tag carries the availability rule fixed by Ramify. There are
two rule kinds:

| Rule | Condition on a cross-module import | Import forms covered |
| --- | --- | --- |
| **Required importer tag** (`⇥`) | If the symbol carries the tag, the importing source area must carry the same tag. | Value and type-only imports. |
| **Required symbol tag** (`⇤`) | If the importing source area carries the tag, the symbol must carry the same tag. | Value imports only. |

All applicable rules must be satisfied. A tag can withhold permission to
import a visible symbol, but must never expose a symbol, widen its reach,
or change its visibility.

Only the built-in tags `testing`, `ui`, and `browser` have importability semantics.
Projects may use other labels for search or documentation, but those labels
are inert for importability. A project cannot define additional availability
rules or change a built-in tag's rule.

### Classification Belongs To Two Source Areas In Each Module

A module has exactly the tags declared in its own definition, or none when
no tags are declared. Its tags classify every file under `src/` outside the
reserved `src/tests/` subtree, including files in `src/interfaces/`.
Submodules are separate owners and do not inherit tags from their ancestors.

The optional `src/tests/` area belongs to the same module and must carry
`testing`. Its default classification is `[testing]`, plus `ui` when the
module is tagged `ui`. A module may explicitly declare a complete test
profile; it must include `testing` and the module's required `ui` tag, and
may add `ui` or `browser`. `browser` is not inherited from `src/`: Node/jsdom
tests of browser implementation can use a non-browser test profile.

The testing profile takes precedence over the containing `src/` directory's
ordinary profile. Each file belongs to exactly one source area; the profiles
are not combined merely because the directory roots are nested.
Ordinary subdirectories share their containing source area's classification.
Each area has one profile; there are no per-file or glob-based overrides.
Mixed Node and browser-only test portions requiring different permissions
need separately declared modules and ordinary exposure between owners.
Subdivision preserves ancestor-supplied visibility, but does not assign tags
or preserve former same-owner access.

The reserved `src/tests/` area is the only directory-based classification rule.
A `*.test.ts` file under ordinary `src/` still has that area's classification;
it gains no testing permissions from its filename. A directory named `tests`
elsewhere, such as `src/helpers/tests/`, is ordinary source, and a `client.ts`
filename does not assign `browser`. Tests and helpers requiring the test
profile belong in the owner's `src/tests/`.

`src/interfaces/` holds curated contract vocabulary with the ordinary source
profile. It does not create a third classification, grant importability, or
automatically expose its contents. Files under `src/tests/interfaces/` remain
testing source; the nested name does not remove their testing classification.

### Testing Support Requires A Testing Importer

The `testing` tag carries the required importer tag rule. A symbol tagged
`testing` is test support and may be imported across a module boundary only
by a source area carrying `testing`. This applies to value and type-only imports:
test support is excluded from the production contract in both forms.

A module curates its test support by tagging and exposing selected symbols.
Testing modules gain no blanket private access to other modules. The tag
does not grant global reach; test support must follow ordinary exposure
chains.

Every original exported binding defined in testing-classified source must carry
`testing`. This includes all bindings defined in `src/tests/` and in a testing
module's `src/`. An explicit symbol tag set omitting `testing` is invalid.
Other tags may be added, including mandatory `ui` where applicable. The
requirement does not classify symbols owned by a separately declared module.

The requirement follows ownership. Received symbols keep their owner's tags,
including when a testing module re-exposes them. A production symbol received
from another module, including a child, retains its original tags. Re-exposure
cannot turn production contracts into test support or remove a test-support
restriction.

An untagged module may receive and re-expose test support while its ordinary `src/`
cannot import it. Its `src/tests/` may import that support when all applicable
rules pass. A parent can expose test support to descendants while the tag
restricts use to their testing-classified source areas.

### UI Contracts Require A UI Importer

The `ui` tag carries the required importer tag rule. Across module boundaries,
a symbol tagged `ui` may be imported only by source carrying `ui`, for both
value and type-only imports. This excludes UI contracts from non-UI core
source even when an ancestor exposes those contracts to its whole subtree.

Every symbol owned by a module tagged `ui` must carry `ui`, including its test
bindings. A test area explicitly tagged `ui` in an otherwise non-UI module
also requires `ui` on its new exported bindings. Explicit assignments cannot omit
these mandatory tags. Received original symbols retain their original tags.

`ui` describes architectural coupling; `browser` describes runtime safety.
A UI source area may use Node services when it is not tagged `browser`.
Browser-safe non-UI utilities need not carry `ui`. For example, an exposed
component tagged `[ui, browser]` can be imported by `[ui, browser]` production
source or `[testing, ui]` Node tests, but not by untagged core source, even
through a type-only import. Like every tag, `ui` never grants visibility.

### Browser Imports Require Browser-Safe Symbols

The `browser` tag carries the required symbol tag rule. A browser-classified
source area may value-import a symbol from another module only when it is visible
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

A symbol is available in a source area when its files may import it as a
value. It is type-available when its files may import it through a type-only
import. Visibility remains a property of the owning module. A concrete
source import must also pass the source-origin restriction for its target
resource, including a forwarding barrel; symbol availability alone does not
authorize every path to that symbol.

A required importer tag restricts coupling, so it applies to both import forms.
A required symbol tag restricts runtime imports, so it does not block erased
type-only imports. This scope belongs to the rule kind.

The complete decision is:

| Import | Ramify permits it when |
| --- | --- |
| Any import from non-testing source to testing source | Denied, including same-owner access, type-only imports, and forwarding through testing source. |
| Other same-owner value or type import | Allowed; no exposure or tag check applies. |
| Cross-module value | The symbol is visible, the source-origin restriction passes, and every applicable availability rule is satisfied. |
| Cross-module type-only | The symbol is visible, the source-origin restriction passes, and every applicable required importer tag rule is satisfied. |

For each source area, relative to its owner's visible symbols:

> available ⊆ type-available ⊆ visible

Without applicable tag or source-origin restrictions, all three sets
coincide. No rule permits a value import while forbidding the corresponding
type-only import.

The rules compose independently. For visible test support, a source area carrying
both `testing` and `browser` requires the symbol to carry `browser` for a
value import. A type-only import remains subject to the `testing`
requirement and is exempt from the browser requirement. If that symbol
also carries `ui`, the importing area must carry `ui` for either form.

### Importability Is Independent Of Dependency Use And Mechanics

These principles determine whether an import is permitted. They do not
require a permitted import to exist or make it an observed dependency.
Dependency declarations and tracking must not be treated as additional
importability rules.

Import specifiers, TypeScript resolution, declaration syntax, generated
surfaces, evaluator APIs, and enforcement architecture are implementation
concerns. They must preserve the ownership, exposure, and availability rules
without introducing additional ways to grant access.
