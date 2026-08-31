---
title: ramify.ts
description: A toolkit to define, enforce, visualize, and help agents adhere to a cross-module importability model.
hide_table_of_contents: true
---

# ramify.ts

**ramify.ts is a toolkit to define, enforce, visualize, and help agents adhere
to a cross-module importability model.**

## One question

The model answers exactly one question:

> Given a source file belonging to module `S` and a symbol owned by module
> `T` — **may** that file import that symbol?

That is: **who _could_ import this symbol** — not who does, and not how.
Importability defines a ceiling. It says nothing about the traffic underneath
it: whether an import is actually present in source, whether a module declares
a dependency, and how observed imports are indexed are separate concerns.

It says nothing about mechanism either. Import specifiers, barrels and
generated facades, re-export versus direct access, module resolution — all of
that is an implementation question, and nothing in the model assumes a
particular answer.

## Scope

**Cross-module imports only.** Files inside one owner import each other
freely: no module boundary is crossed, and nothing in the model applies. Every
other import is **closed by default**, and becomes legal only if some chain of
exposure decisions authorized it.

## The shape of it

- Modules exist by declaration and form a **tree** with one application root.
  Every source file has exactly one deepest owning module.
- A module can **expose** any symbol **available** in it — owned, or exposed
  to it by others — through exactly **two channels**: to its direct parent,
  or to every module in its own subtree.
- Reach is therefore never configured. It is the **consequence** of where a
  chain of one-hop decisions turns from going up into going down.

## Start here

[**The core tree model**](/model) — an interactive diagram of a small online
shop, walked through one use case at a time.

[**Illustrative examples**](/examples) — smaller universes, each built to
teach one lesson about reach cleanly.

The normative document is the model specification, which ships with the
repository at `docs/model/cross-module-importability-rules.md`. Everything on
this site derives from it; where they disagree, the specification is right.
