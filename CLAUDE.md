# CLAUDE.md - ramify.ts

ramify.ts is a self-contained sub-project that will eventually be extracted
into its own repository. cucumber-viz will become a *consumer* of it.

## Host-repo rules do NOT apply here

When working under `ramify/`, ignore the usual cucumber-viz rules:

- Do **not** check `docs/architecture/key-decisions.md`,
  `docs/architecture/modularization/`, or any other cucumber-viz
  architecture doc - none of them bind this sub-project.
- cucumber-viz conventions (barrel/vocabulary surfaces, BEM/plain-CSS UI
  rules, dependency-cruiser rules, audit semantics, feature-test tiers) do
  not apply.

## Authoritative Model Documents

The importability model is defined by two internal documents:

- [Cross-Module Importability Principles](docs/model/cross-module-importability.principles.md)
  contains the complete rules.
- [Glossary](docs/model/glossary.md) defines their vocabulary.

Read these before changing the model, its implementation, or its documentation.
The website teaches the model through explanations and examples. It must
conform to these documents, as must the evaluator, diagrams, and other tools.
Keep the authoritative rules in the principles document and the vocabulary
in its companion glossary.

The concrete representation is defined separately in
[Directory Structure And Module Description Principles](docs/model/module-description.principles.md).
It specifies the required `src/` and `subs/` layout, with optional same-owner
`src/tests/` and `src/interfaces/`, and the formal `module.ramify` version 1
language. Modules may occur only beneath `subs/`. The module header classifies
ordinary `src/`, including interfaces; the nested `src/tests/` area uses its
distinct testing profile. An optional singleton `tests tagged [...]` statement
immediately after that header sets the complete testing profile. Its default
is `[testing]`, plus `ui` for a UI module, without inheriting `browser`.
Explicit testing profiles retain `testing` and their module's required `ui`.

`expose-src` names owned exports relative to `src/`; `expose-test` does the same
relative to `src/tests/`. An `expose-src` path may also select nested testing
source without changing its original classification. `src/interfaces/` does
not automatically expose exports or enable wildcard syntax.
`expose-sub` names direct children and alone permits
wildcard selection. The three forms use the same parent/descendants exposure
channels. Read the specification before changing discovery, description parsing,
source references, or documentation of the file format. It records the model's
rules; the current toolkit does not yet implement the filesystem loader or parser.

The built-in tags are `testing`, `browser`, and `ui`. New bindings originating
in testing or UI source must retain the corresponding required symbol tags;
forwarding aliases retain their original binding's ownership and tags. Source
without testing classification cannot import or re-export testing-classified
source, including same-owner access and forwarding paths. Other same-owner
imports retain their exemption from exposure and symbol-tag checks. No per-file
or glob classification overrides are part of this model.

[TypeScript Source Interpretation Principles](docs/model/typescript-source-interpretation.principles.md)
contains the adopted resource interpretation and testing-source isolation.
Resource ownership and binding identity follow the resolved resource, export
names come from its effective TypeScript export description, and ordinary
exposure and tag rules apply. Read it before designing source import checks.
Its remaining source-form policies remain proposals, and no TypeScript source
checker is implemented yet.

The existing evaluator and examples predate the `ui` tag and the distinct
classification of module-owned `src/tests/`. Updating these specifications does
not establish implementation support; runtime, evaluator, and source-layout
migration work must be explicitly scoped separately.

## Conventions that DO apply

- Self-contained package: own `package.json` and toolchain; run npm commands
  from `ramify/`. Never import from cucumber-viz `src/`, and never add
  ramify to the host repo's build, test, or enforcement tooling.
- ESM with `.js` extensions in source imports; strict TypeScript;
  vitest tests co-located as `src/**/*.test.ts`.
- Documentation and examples must stay generic - no cucumber-viz domains or
  references in ramify docs or the site.
