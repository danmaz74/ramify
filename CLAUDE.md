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
It specifies the required `src/` and `subs/` layout and the formal
`module.ramify` version 1 language: `expose-src` names owned exports relative
to `src/`; `expose-sub` names direct children and alone permits wildcard
selection. Read it before changing discovery, description parsing, source
references, or documentation of the file format. It does not add importability
rules; the current toolkit does not yet implement the filesystem loader or parser.

[TypeScript Source Interpretation Principles](docs/model/typescript-source-interpretation.principles.md)
contains the adopted resource interpretation: ownership and binding identity
follow the resolved resource, export names come from its effective TypeScript
export description, and ordinary exposure and tag rules apply. Read it before
designing source import checks. Its other source-form policies remain proposals,
and no TypeScript source checker is implemented yet.

## Conventions that DO apply

- Self-contained package: own `package.json` and toolchain; run npm commands
  from `ramify/`. Never import from cucumber-viz `src/`, and never add
  ramify to the host repo's build, test, or enforcement tooling.
- ESM with `.js` extensions in source imports; strict TypeScript;
  vitest tests co-located as `src/**/*.test.ts`.
- Documentation and examples must stay generic - no cucumber-viz domains or
  references in ramify docs or the site.
