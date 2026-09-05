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
directory, excluding all directories of its sub-modules.

## Import and Export

TypeScript files export symbols, and they import symbols from other files. We aren't
altering what these two verbs mean, but we're limiting the importability of symbols
which are exported by files which sit in a different module.

TypeScript imports come in two forms: ordinary **value imports**, and **type-only
imports** (`import type`), which are erased at compile time and carry no runtime
dependency.

## Module-owned symbol

If file F belongs to module M, and F exports symbol S, then module M **owns** S. Any
file belonging to M can import S.

## Module-received symbol

Module M **receives** symbol S when a module other than M exposes S to M: a direct
child exposing S to its parent, or a proper ancestor exposing S to its descendants.

## Symbol tagging

In the world of ramify modules, all symbols are always associated with a set of tags. Tags
are assigned to TypeScript exported symbols by the owner module. By default, the tag
set is empty, except that every symbol owned by a testing module must carry
`testing`.

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

Tags are assigned explicitly in a module's definition and classify all files
belonging to that module. By default, a module has no tags. Submodules declare
their own tags; module tags are not inherited.

Ordinary subdirectories share their owning module's classification. Separately
declared submodules have their own ownership and classification. There are no
file-level importer contexts: files needing different cross-module import
permissions belong in different modules. Module boundaries and tags are never
inferred from test-like or client-like filenames or directory names.

## Tagged module

A module whose declared tag set is non-empty is called tagged.

## Tag-based availability rules

**Tag-based availability rules** define which combinations of module and symbol tags make
a symbol available in a module. Currently there are two kinds of rules:

- Required symbol tag: if the module has the tag, then the only symbols visible from exposure that are available in that module are those associated with the same tag. This rule never blocks type-availability: type-only imports pass it.
- Required module tag: if the symbol has the tag, then the symbol is only available from exposure if the module has the same tag. This rule blocks type-availability too: type-only imports must satisfy it.

The two rules are mirror images for availability, but not for type-availability - only
the required module tag reaches type-only imports. This is inherent to each rule, not a
parameter of it.

When several rules apply to the same symbol and module, all of them must be satisfied.

## Tag-associated availability rule

Each built-in tag carries the availability rule fixed by Ramify. Assigning that
tag to a symbol or module does not change its rule. Only `testing` and `browser`
have importability semantics; project-defined labels are inert classification
for search or documentation and cannot define availability rules.

## `testing` tag

The built-in tag carrying the required module tag rule. A symbol tagged `testing` is
test support, never part of the production contract. A **testing module** is a module
tagged `testing` in its own definition. Every
symbol it owns must carry `testing`; a declaration that omits or overrides that
required tag is invalid. Received symbols keep their owner's tags.

## `browser` tag

The built-in tag carrying the required symbol tag rule. On a symbol it is the owner's
claim that the symbol's entire transitive runtime closure is browser-safe. A
**browser module** is a module tagged `browser` in its own definition; its files
run in a browser.

## Module-available symbol

Saying that symbol S is **available** in module M means that all files belonging to M
can import S as a value - the ordinary import. Being able to import as a value implies
that it can also be imported as a type.

All symbols owned by M are available in M, because ramify modules don't affect intra-module
imports in any way.

The only other symbols available in M are those it receives, subject to their tag-based
availability rules.

At times we can use "fully available" as a synonym of "available" to underline that it implies
both value and type availability.

## Type-availability

S is **type-available** in module M when all files belonging to M can import S as a
type-only import. A symbol coming from a different module could be type-available, but not
value-available.

Whether a rule blocks availability entirely or blocks only value imports - leaving the symbol type-available - is part of the rule's definition. Of the two current rules, the required module tag does the former and the required symbol tag the latter.

## Where the precision lives

The authoritative vocabulary is in `docs/model/glossary.md` in the repository.
The complete rules are in its companion, **Cross-Module Importability
Principles**, at `docs/model/cross-module-importability.principles.md`.
The website must conform to these two internal documents.
