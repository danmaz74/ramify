---
title: Glossary
description: Definitions of the terms the model documents use - one term, one definition.
# Unlike the diagram pages, this one keeps the table of contents: a glossary
# is exactly the page where a jump-to-term index earns its column.
---

# Glossary

Defines the terms used by the Cross-Module Importability Principles and by
the pages on this site. These definitions are reproduced from the internal
glossary.

## ramify module

A ramify module is a unit of code ownership, declared by marking a directory as a
module root. ramify modules form a tree: a module's parent is the innermost module
whose directory contains its directory, and a single root module covers the whole
application.

In these documents, "module" always means ramify module - not a TypeScript/ES
module, which is a single file.

## Files belonging to a module

We say that a file **belongs** to a module when that file is contained by that module's
declared `src/` directory, including `src/tests/` and `src/interfaces/`.
The concrete layout places child modules under `subs/`; no part of `src/`
may contain another module declaration.

## Source area

A module's **source areas** are ordinary source under `src/` excluding
`src/tests/`, and the optional testing source under `src/tests/`.
They share one owner and the same module-scoped visibility, but can have
different importer classifications. A source area is not a child module and
creates no exposure channel.

The module header's tag set classifies ordinary source, including
`src/interfaces/`. The `src/tests/` area defaults to
`[testing]`, plus `ui` when the module is tagged `ui`. An optional
`tests tagged [...]` statement declares the complete test-area tag set; it must
include `testing` and cannot omit the module's `ui`. It may add `ui` in a
non-UI module. `browser` is independent and is not inherited into `src/tests/`:
browser tests declare it explicitly, for example
`tests tagged [testing, ui, browser]`.

Every file uses exactly one area's classification: the profile for `src/tests/`
takes precedence over the ordinary profile of its containing `src/` directory.
An arbitrary nested directory or a `*.test.ts` filename does not create another
area or override its tags. A test-looking file outside `src/tests/` has the
ordinary source classification. There are no per-file importer contexts.

## Interface directory

A module's optional **interface directory** is `<module>/src/interfaces/`.
It contains curated contract vocabulary, including types, schemas, enums, and
constants. It is ordinary source of the same owner, with no separate profile
or automatic exposure. Directory placement and exposure selection are separate
decisions; the directory does not itself enable wildcard syntax.

## Importer classification

The **importer classification** is the tag set of the importing file's source
area. It determines which cross-module availability rules apply to that file.
Module membership determines visibility; source-area classification determines
availability. A test area receives no additional module reach from its tags.

## Source origin

A binding's **source origin** is its original defining application source or
resource and that file's source area. Forwarding aliases retain this origin,
ownership, and tags. A new implementation binding has its own defining area.

A resource's origin is the resolved resource, not the declaration shim that
describes it. The source/resource accessed through an import is also recorded
independently of the selected binding's origin: a testing barrel can forward a
production symbol without becoming its owner or changing that symbol's tags.

## Testing-origin restriction

Non-testing source cannot import or re-export testing-classified application
source or resources. This restriction applies within one module as well as
across modules, for values, types, and loads without selected symbols. Check
the resolved source/resource and the original binding's defining area; a
testing barrel forwarding a production symbol remains forbidden to a
non-testing importer.

This is a source-origin restriction, not a blanket same-owner symbol-tag rule.
A binding explicitly tagged `testing` but newly defined in non-testing `src/`
retains the ordinary same-owner tag exemption. The tag still limits its
cross-module importers.

## Import and Export

TypeScript files export symbols, and they import symbols from other files.
Ramify limits cross-module importability and forbids non-testing imports of
testing-origin source, including within one module. Source forwarding exports
do not create Ramify exposure or transfer symbol ownership.

TypeScript imports come in two forms: ordinary **value imports**, and **type-only
imports** (`import type`), which are erased at compile time and carry no runtime
dependency.

## Module-owned symbol

If an original exported binding S is defined by file F belonging to module M,
then module M **owns** S. Unexported lexical locals are not exposure units.
A file forwarding another module's symbol does not acquire ownership.
Resource bindings likewise belong to their resource's containing module and
source area. Same-owner imports require no exposure and retain the tag
exemption after the testing-origin restriction passes.

## Module-received symbol

Module M **receives** symbol S when a module other than M exposes S to M: a direct
child exposing S to its parent, or a proper ancestor exposing S to its descendants.

## Symbol tagging

In the world of ramify modules, all symbols are always associated with a set of tags. Tags
are assigned to TypeScript exported symbols by the owner module. By default, the tag
set contains the tags required by the binding's defining source area: a new
owned exported binding defined in testing-classified source must carry `testing`, and one
defined in UI-classified source must carry `ui`. Without either classification,
the default is empty. A module tagged `ui` therefore requires `ui` on all its
newly owned symbols, including test-area bindings. These requirements also
apply to unexposed bindings and resource bindings. `browser` is never assigned
to symbols automatically.

Explicit symbol tag assignments may add tags but cannot omit required
`testing` or `ui`. Forwarding aliases are not new bindings and retain their
original tags; passing a production symbol through a testing area does not
reclassify the symbol.

When talking about symbols in the context of ramify modules, we always mean "symbol with
its tag set".

Once the association of a symbol with its tag set is done by the owner, that's immutable.
Nothing can change the tags associated with a symbol.

## Tagged symbol

A symbol whose tag set is non-empty is called tagged.

## Module-visible symbol

Symbol S is **visible** in module M when M owns S or receives S.

Visibility is decided by the exposure decisions alone; tags never change what is
visible in a module.

## Reach

The **reach** of symbol S is the set of modules in which S is visible. S's owner is
always in its reach; every other module is added by exposure.

## Module-exposed symbol

A module M can **expose** any symbol S which is visible in M. The exposure can be
one of two types:

- Expose to parent: S becomes exposed to M's parent
- Expose to descendants: S becomes exposed to all of M's descendants

A module can expose both the symbols it owns and the symbols it receives. Exposing
a received symbol may be called **re-exposing**, but re-exposing isn't different
from exposing.

NB: symbols in ramify modules are always associated with their tag set. Exposing or
re-exposing them means exposing the symbol together with its tag set.

NB: if module M1 exposes symbol S to its descendant M2, M2 can re-expose it, but that's
a no-op as the same symbol is already visible in M2's parent and all M2's descendants.

## Module tagging

Tags assigned in a module header classify its ordinary `src/` area. By default,
a module has no tags. Its same-module `src/tests/` area follows the separate
test-area profile rules, including the mandatory `ui` classification for a UI
owner. Submodules declare their own tags; module tags are not inherited by
child modules.

Ordinary subdirectories share their source area's classification. Separately
declared submodules have their own ownership and source areas. Module
boundaries and tags are never inferred from test-like or client-like filenames
or arbitrary directory names. The reserved same-module `src/tests/` area is an
explicit part of the required layout.

## Tagged module

A module whose declared tag set is non-empty is called tagged.

## Tag-based availability rules

**Tag-based availability rules** define which combinations of importer
source-area tags and original symbol tags permit a cross-module import.
There are two kinds of rules:

- Required symbol tag: if the importer classification has the tag, a visible foreign symbol is value-available only when it has the same tag. This rule never blocks type-availability: type-only imports pass it.
- Required importer tag: if the symbol has the tag, it is available through exposure only when the importer classification has the same tag. This rule also restricts type-availability: type-only imports must satisfy it.

The two rules are mirror images for availability, but not for type-availability - only
the required importer tag reaches type-only imports. This is inherent to each rule, not a
parameter of it.

When several rules apply to the same symbol and importing source area, all of
them must be satisfied. The testing-origin restriction applies separately,
including before the remaining same-owner exemption.

## Tag-associated availability rule

Each built-in tag carries the availability rule fixed by Ramify. Assigning that
tag to a symbol, module, or test-area profile does not change its rule. Only
`testing`, `ui`, and `browser` have importability semantics; project-defined labels are inert classification
for search or documentation and cannot define availability rules.

## `testing` tag

The built-in tag carrying a required importer tag rule. A symbol tagged
`testing` is test support and may cross a module boundary only into a
testing-classified source area, for both value and type-only imports.

A **testing module** has `testing` in its module header. Its `src/` and
same-module `src/tests/` are testing-classified. A non-testing module's `src/tests/`
is also testing-classified without changing the module's ordinary source.
Every new owned exported binding defined in testing-classified source must carry `testing`;
an explicit assignment omitting that required tag is invalid. Received and
forwarded symbols retain their original owners, origins, and tags.

## `ui` tag

The built-in tag carrying a required importer tag rule for UI coupling. A
symbol tagged `ui` may cross a module boundary only into a UI-classified
source area. This applies to both values and types. The tag never grants
visibility and makes no browser-safety claim.

A **UI module** has `ui` in its module header. Its `src/` and `src/tests/` are
UI-classified, and every newly owned binding must carry `ui`. A non-UI module
can give its test area a UI classification explicitly; new bindings defined
there then also require `ui`. Forwarding preserves the original symbol's tags.
`ui` and `browser` are independent: UI code may run outside a browser, and
browser-safe infrastructure need not be UI code.

## `browser` tag

The built-in tag carrying the required symbol tag rule. On a symbol it is the owner's
claim that the symbol's entire transitive runtime closure is browser-safe. A
**browser module** is a module tagged `browser` in its own definition; its
ordinary source runs in a browser. A **browser test area** explicitly includes
`browser` in its test-area profile. The test area does not inherit `browser`
from its module header. On an importing source area, this tag requires the
tag on foreign value bindings; type-only imports are exempt from this rule.

## Module-available symbol

Availability is evaluated for an importing **source area**, not uniformly for
all files owned by a module. A symbol S is **available** there when it can be
imported as a value. A foreign symbol must be visible in the area's owning
module and satisfy the area's applicable tag rules. A same-owner symbol needs
no exposure or tag check after the testing-origin restriction passes.

Every actual import must also pass the source-origin restriction for the
resolved source/resource it accesses. Availability of a production binding
does not permit non-testing source to obtain it through a testing barrel.
Thus "available in module M" is sufficient shorthand only when the importing
area is specified or all its areas have the same result.

Being able to import a binding as a value implies that it can also be imported
as a type along the same permitted source path. This does not establish a
blanket exemption for imports within one module.

At times we can use "fully available" as a synonym of "available" to underline that it implies
both value and type availability.

## Type-availability

S is **type-available** in a source area when it can be imported there as a
type-only binding, subject to the testing-origin restriction on the original
binding and the accessed source/resource. A foreign symbol may be type-available
but not value-available. Visibility still belongs to the area's module.

Whether a rule blocks availability entirely or only value imports is part of
the rule's definition. A required importer tag (`testing` or `ui`) does the
former; a required symbol tag (`browser`) does the latter.

## Where the precision lives

The authoritative vocabulary is in `docs/model/glossary.md` in the repository.
The complete rules are in its companion, **Cross-Module Importability
Principles**, at `docs/model/cross-module-importability.principles.md`.
The website must conform to these two internal documents.
