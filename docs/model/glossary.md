# Glossary

**Status:** Agreed vocabulary; the model spec, evaluator and site are
aligned with it. One known gap remains: the diagram's node compartment for
symbols received from children is still labeled `holds`, pending its own
naming decision.

Defines the terms used by
[Cross-Module Importability Rules](cross-module-importability-rules.md);
the rules document uses these terms and does not redefine them.

## Ramify Module

A Ramify Module is a unit of code ownership, declared by marking a directory as a module root. Ramify Modules form a tree: a module's parent is the innermost module whose directory contains its directory, and a single root module covers the whole application.

In these documents, "module" always means Ramify Module — not a TypeScript/ES module, which is a single file.

## Files belonging to a module

We say that a file **belongs** to a module when that file is contained by that module's
directory, excluding all directories of its sub-modules.

## Import and Export

Typescript files export symbols, and they import symbols from other files. We aren't
altering what these two verbs mean, but we're limiting the importability of symbols
which are exported by files which sit in a different module.

## Module-owned symbol

If file F belongs to module M, and F exports symbol S, then module M **owns** S. Any
file belonging to M can import S.

## Symbol tagging

In the world of ramify modules, all symbols are always associated with a set of tags. Tags
are assigned to typescript exported symbols by the owner module. By default, the tag
set is empty.

When talking about symbols in the context of ramify modules, we always mean "symbol with
its tag set".

Once the association of a symbol with its tag set is done by the owner, that's immutable.
Nothing can change the tags associated with a symbol.

## Tagged Symbol

A symbol whose tag set is non-empty is called tagged.

## Module-visible symbol

Symbol S is **visible** in module M when M owns S, or S is exposed to M by another module.

Visibility is decided by the exposure decisions alone; tags never change what is
visible in a module.

## Module-exposed symbol

A module M can **expose** any symbol S which is visible in M. The exposure can be
one of two types:

- Expose to parent: S becomes exposed to M's parent
- Expose to descendants: S becomes exposed to all of M's descendants

A module can expose both its owned symbols and symbols exposed to it. In the latter
case, we can specify that the symbol was re-exposed if useful, but re-exposing
isn't different from exposing.

NB: symbols in ramify modules are always associated with their tag set. Exposing or
re-exposing them means exposing the symbol together with its tag set.

NB: if module M1 exposes symbol S to its descendant M2, M2 can re-expose it, but that's
a no-op as the same symbol is already visible in M2's parent and all M2's descendants.

## Module tagging

Tags can also be assigned to modules in the module definition. This assignment affects availability.

By default, no tag is assigned to a module.

## Tag based availability rules

**Tag based availability rules** define which combinations of module and symbol tags make
a symbol available in a module. Currently there are two kinds of rules:

- Required symbol tag: if the module has the tag, then the only symbols visible from exposure that are available in that module are those associated with the same tag
- Required module tag: if the symbol has the tag, then the symbol is only available from exposure if the module has the same tag

When several rules apply to the same symbol and module, all of them must be satisfied.

## Tag-associated availability rule

When a tag is defined, it is associated with its availability rule, and it always carries it.
So, when a tag is associated with a symbol or module, it carries its availability rule.

## Module-available symbol

Saying that symbol S is **available** in module M means that all files belonging to M
can import S.

All symbols owned by M are available in M, because ramify modules don't affect intra-module
imports in any way.

The only other symbols available in M are those which other modules expose to it, subject
to their tag based availability rules.
