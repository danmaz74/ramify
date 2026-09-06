# Cross-Module Importability Principles

**Status:** Active

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
defines how TypeScript source is resolved and translated into these
importability decisions.

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

Every source file belongs to exactly one module. A symbol belongs to the
module that defines its original binding. Forwarding a symbol does not change
its owner. Sharing a parent does not give sibling modules shared ownership
of their files or symbols.

The unit of exposure is an individual exported symbol.

### Visibility Comes From Ownership And Exposure

Every cross-module symbol import is closed by default: the symbol must first
be made visible through explicit exposure. A module's position in the tree,
including being the application root, grants no implicit access to another
module's symbols.

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

### Re-Exposure Uses The Same Channels

Exposing a received symbol is re-exposure. It is the same operation as
exposing an owned symbol and uses the same two channels.

Eligibility to expose depends only on visibility. Permission to pass a symbol
onward does not imply permission to use it.

### Exposure To Parent Cedes Onward Exposure

A child exposing a symbol to its parent permits the parent to re-expose it
through either channel. The child cannot grant access to the parent while
withholding the parent's authority to expose it onward.

Re-exposure follows a chain of one-hop decisions. A grandchild's symbol can
reach the application root only when every intermediate module exposes it
further upward.

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
subtree. Subdivision preserves visibility supplied by existing ancestor exposures to descendants, but does not preserve former same-owner access.

### Redundant Exposure Is Permitted

A symbol received through an ancestor's exposure to descendants may be
re-exposed. That operation adds no visibility: the symbol is already visible
in the re-exposing module's parent and descendants. Passing it above the
ancestor still requires that ancestor's own expose-to-parent decision.

### Tags Restrict Availability Without Changing Visibility

A tag is a named classification assigned to a symbol or to importing source.
Each has a tag set, which may be empty. Owners assign their symbols' tags.

A source area is a group of files within one module that share an importer
classification: the tag set used to check their imports. Source areas share
their owner's visible symbols, but can have different import permissions.

A symbol is available in a source area when its files may import it as a
value. It is type-available when its files may import it through a type-only
import. A value request asks for the runtime binding; a type-only request
asks for a type without requiring that runtime binding. The rules below
determine these permissions.

Ramify defines exactly two tag rule kinds:

| Rule                            | Condition on a cross-module import                                                | Import forms covered         |
| ------------------------------- | --------------------------------------------------------------------------------- | ---------------------------- |
| **Required importer tag** (`⇥`) | If the symbol carries the tag, the importing source area must carry the same tag. | Value and type-only imports. |
| **Required symbol tag** (`⇤`)   | If the importing source area carries the tag, the symbol must carry the same tag. | Value imports only.          |

All applicable rules must be satisfied. A tag can withhold permission to
import a visible symbol, but must never expose a symbol, widen its reach,
or change its visibility.

### One Registry Defines Tags For The Whole Evaluation

A project-wide tag registry assigns each tag name one rule kind. A tag
definition contains a name, one of the two fixed rule kinds, and an optional
prose description. Projects may define additional tags of either kind. They
cannot supply a new rule algorithm, tag implications, or exceptions to the
behavior fixed by a kind. Matching and propagation depend on the rule kind,
not the spelling of a tag name.

The default registry contains ordinary definitions:

| Tag        | Kind                  | Meaning in the default profile  |
| ---------- | --------------------- | ------------------------------- |
| `testing`  | Required importer tag | Test support                    |
| `ui`       | Required importer tag | UI coupling                     |
| `dispatch` | Required importer tag | Dispatch and transport coupling |
| `browser`  | Required symbol tag   | Browser runtime safety          |

Registering a tag does not apply it to source or symbols. All modules and
source areas in an evaluation use one immutable resolved registry; modules
cannot shadow its definitions. Unknown tag uses, duplicate or conflicting
definitions, and invalid kinds are errors. Separate evaluations must not leak
definitions into each other. Cached decisions and reports must identify the
registry used, because changing it can change availability.

The `testing` definition is reserved: it must remain a required-importer tag
and cannot be removed or rebound. The other defaults have no name-specific
matching or propagation behavior. Tools claiming the default
profile must validate that the resolved definitions match that profile;
verification of a tag's domain promise is a separate concern.

The resolved registry contract is definitive. Its configuration serialization
and the explicit configuration operation for omitting or replacing ordinary
defaults are not yet specified; they must preserve this contract.

### Re-Exposure Preserves Ownership And Tags

Every exposure carries the original binding with its owner and its immutable
tag set. Re-exposure and forwarding aliases never transfer ownership and
cannot add, remove, or change those tags.

### Ordinary Source Code And Tests Have Their Own Tag Profiles

A module's source belongs under its `src/` directory. Separately declared
child modules belong under `subs/` and remain separate owners. Within one
owner, the fixed layout defines two source areas:

- **Ordinary source:** files under `src/` outside its reserved `src/tests/`
  subtree.
- **Testing source:** files under the optional `src/tests/` subtree, including
  the module's tests and their helpers.

Each source area's tag set is its profile. Ordinary source uses exactly the
tags declared on the module, or none when no tags are declared. Submodules
do not inherit tags from their ancestors.

#### Testing

Testing code requires special treatment:

- A module’s own tests need access to its internal exports.
- Production code must not depend on testing source, including test helpers.
- Tests may run in a different environment from the implementation—for example, Node/jsdom tests of browser code.

Ramify therefore keeps a module’s tests in `src/tests/`, which shares the
module’s ownership and visibility while using a separate profile: `testing`
plus every required-importer tag on the module. Required-symbol tags are not
inherited, and the profile cannot be overridden or extended.
With the default registry, a `[ui, dispatch, browser]` module therefore has
`[testing, ui, dispatch]` in `src/tests/`: Node/jsdom tests of browser
implementation use a non-browser profile.

Each file uses exactly one profile: the reserved `src/tests/` profile takes
precedence over ordinary `src/`. Ordinary subdirectories share their containing
area's profile, and filenames or globs cannot override it. For example,
`src/helpers/tests/` and a `*.test.ts` file outside `src/tests/` keep the
ordinary profile; a `client.ts` filename does not assign `browser`.

The connection between `testing`, `src/tests/`, and production-to-testing
source isolation is part of the model: a project cannot remove or redefine
it. No other tag has a reserved directory-based role.

Tests needing additional tags belong to a separately declared testing module
under `subs/`. That module declares `testing` and the other needed tags in its
own definition. Its test code belongs in its ordinary `src/`, where those tags
apply. For example, a module tagged `[testing, ui, browser]` checks its `src/`
imports with all three tags; its optional `src/tests/` still uses the fixed
derived profile `[testing, ui]`.

A separate testing module needs ordinary exposure and tag compatibility to
import another owner's exports, including its parent's. Moving owned tests
into such a module therefore loses their automatic private access. The
implementation owner can expose selected bindings or a newly defined wrapper
tagged `testing` to provide controlled access to its private implementation.

### Interface Vocabulary Belongs To Ordinary Source

The optional `src/interfaces/` directory holds a module's curated contract
vocabulary, including types, schemas, enums, and constants. It belongs to the
same owner and uses the ordinary source profile.

The directory does not create a third classification, grant importability,
or automatically expose its contents. The only special feature is that an
owner can expose all symbols exported by files in `src/interfaces/` using
a wildcard, which isn't allowed for owned files in other directories.
Each wildcard explicitly names one file and its exposure destinations. It
preserves original ownership and tags, and includes later additions to that
file's exports. Wildcard re-exposure of a child's contract remains available.

Files under `src/tests/interfaces/`
remain testing source; the nested name does not remove their testing
classification.

### New Exported Bindings Retain Their Source Area's Required Tags

Every new exported binding must carry all required-importer tags of its
original defining source area. Its tag set defaults to exactly those tags;
an explicit set may add tags but cannot omit any of them. Required-symbol
tags are not assigned automatically.

This applies to unexposed exports, new wrappers, type aliases, and resource
bindings. Forwarding aliases are not new bindings and do not acquire the
forwarding area's tags.

For example, under the default registry, a `[ui, dispatch, browser]` module's
new ordinary exports default to `[ui, dispatch]`, and its new test exports
to `[testing, ui, dispatch]`.

### Testing Support Requires A Testing Importer

The `testing` tag marks a symbol as test support. Its required-importer rule
permits cross-module imports only from testing-classified source, for both
values and types.

For example, suppose a module exposes one of its own symbols tagged `testing`
to its descendants. In a child module that does not declare `testing`:

- Files under `src/tests/` may import that symbol, provided every other
  applicable tag rule also passes.
- Files elsewhere under `src/` cannot import it, even through a type-only
  import.

### UI Contracts Require A UI Importer

In the default registry, `ui` carries the required importer tag rule. Across
module boundaries, a symbol tagged `ui` may be imported only by source
carrying `ui`, for both value and type-only imports. This excludes UI contracts
from non-UI core source even when an ancestor exposes those contracts to its whole
subtree.

`ui` describes architectural coupling; `browser` describes runtime safety.
A UI source area may use Node services when it is not tagged `browser`.
Browser-safe non-UI utilities need not carry `ui`. For example, an exposed
component tagged `[ui, browser]` can be imported by `[ui, browser]` production
source or `[testing, ui]` Node tests, but not by untagged core source, even
through a type-only import.

### Dispatch Contracts Require A Dispatch Importer

In the default registry, `dispatch` carries the required importer tag rule.
Foreign dispatch-tagged contracts require a dispatch-classified importer for
both values and types.

This can separate transport contracts, typed clients, and connected UI from
transport-independent logic or pure UI. The tag does not prove that a function
only dispatches: code responsibilities require separate architectural review
or verification.

### Browser Imports Require Browser-Safe Symbols

In the default registry, `browser` carries the required symbol tag rule. A
browser-classified source area may value-import a symbol from another module
only when it is visible there and carries `browser`.

On a symbol, `browser` is the owner's promise that the symbol's entire
transitive runtime closure is browser-safe, including the owner's private
files. The promise is verified separately from the importability decision.
A false claim is the owner's error and must be reported at the owner, not
at an importer that relied on the declared tag.

Browser safety is declared per symbol. A module may own both browser-safe
and Node-only symbols; the distinction does not require separate modules.
The verification mechanism does not introduce restrictions on same-owner
imports or add an exposure channel.

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

### Type-Only Imports Retain Coupling Restrictions

A required importer tag restricts coupling, so it applies to both import forms.
A required symbol tag restricts runtime imports, so it does not block erased
type-only imports. This scope belongs to the rule kind.

Source interpretation also produces a type-only availability request for an
unmarked import whose resolved original exists only as a type, such as an
interface with no merged value binding. Runtime-bearing originals require an
explicit type-only form to receive this exemption. Exposure, required-importer
tags, and testing-source isolation still apply in either case.

The complete decision is:

| Import                                               | Ramify permits it when                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Any import from non-testing source to testing source | Denied, including same-owner access, type-only imports, and forwarding through testing source.                             |
| Other same-owner value or type import                | Allowed; no exposure or tag check applies.                                                                                 |
| Cross-module value                                   | The symbol is visible, the source-origin restriction passes, and every applicable availability rule is satisfied.          |
| Cross-module type-only                               | The symbol is visible, the source-origin restriction passes, and every applicable required importer tag rule is satisfied. |

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

### Source Checking Reports Definite Violations And Its Coverage

Ramify provides bounded architectural checks, not a proof of every runtime
dependency. There is no general prohibition on symbol-free cross-module
runtime loads and no new exposure channel or file-level permission for them.
Known source-origin restrictions still apply, including production loads of
testing source. Runtime initialization does not add a transitive path-tag rule
to the original-symbol decision; browser-closure verification remains separate.

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
without introducing additional ways to grant access.
