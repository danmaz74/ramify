# CLAUDE.md — ramify.ts

ramify.ts is a self-contained sub-project that will eventually be extracted
into its own repository. cucumber-viz will become a *consumer* of it.

## Host-repo rules do NOT apply here

When working under `ramify/`, ignore the usual cucumber-viz rules:

- Do **not** check `docs/architecture/key-decisions.md`,
  `docs/architecture/modularization/`, or any other cucumber-viz
  architecture doc — none of them bind this sub-project.
- cucumber-viz conventions (barrel/vocabulary surfaces, BEM/plain-CSS UI
  rules, dependency-cruiser rules, audit semantics, feature-test tiers) do
  not apply.
- ramify.ts-specific architecture docs will be added later. Until then, the
  only normative document is the model spec in
  [docs/model/cross-module-importability-rules.md](docs/model/cross-module-importability-rules.md).

## Conventions that DO apply

- Self-contained package: own `package.json` and toolchain; run npm commands
  from `ramify/`. Never import from cucumber-viz `src/`, and never add
  ramify to the host repo's build, test, or enforcement tooling.
- ESM with `.js` extensions in source imports; strict TypeScript;
  vitest tests co-located as `src/**/*.test.ts`.
- Documentation and examples must stay generic — no cucumber-viz domains or
  references in ramify docs or the site.
