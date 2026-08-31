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

## Module-available symbol

Saying that symbol S is **available** in module M means that all files belonging to M
can import S.

All symbols owned by M are available in M.

The only other symbols available in M are those which other modules expose to it.

## Module-exposed symbol

A module M can **expose** any symbol S which is available in M. The exposure can be
one of two types:

- Expose to parent: S becomes exposed to M's parent
- Expose to descendants: S becomes exposed to all of M's descendants

A module can expose both its owned symbols and symbols exposed to it. In the latter
case, we can specify that the symbol was re-exposed if useful, but re-exposing
isn't different from exposing.

NB: if module M1 exposes symbol S to its descendant M2, M2 can re-expose it, but that's
a no-op as the same symbol is already available to M2's parent and all M2's descendants.
