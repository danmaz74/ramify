# ramify.ts

A toolkit to **define, enforce, visualize, and help agents adhere to** the
ramify cross-module importability model: a recursive ownership tree with
closed-by-default boundaries, two exposure channels (to parent, to
descendants), and purely restrictive tagged cross-requirements for test and
browser contexts.

The model itself is specified in
[docs/model/cross-module-importability-rules.md](docs/model/cross-module-importability-rules.md).

## Status

Early development. ramify.ts currently lives inside the cucumber-viz
repository because that is where the motivating knowledge and the first
target codebase are; it is deliberately self-contained (own `package.json`,
`tsconfig.json`, docs and tests) so it can be extracted into its own
repository later. cucumber-viz will eventually become a consumer of this
toolkit; the analysis of how its current enforcement maps onto the model is
in the host repository at
`docs/analysis/2026-08-31-importability-rules-cucumber-viz-coverage.md`.

## Layout

- `docs/model/` — the model specification (application-agnostic; travels
  with the project).
- `docs/plans/` — ramify's own planning artifacts.
- `src/` — toolkit source; tests co-located as `src/**/*.test.ts`.

## Conventions

ESM with `.js` extensions in source imports, strict TypeScript, vitest for
unit tests. This package intentionally does not participate in the host
repository's build, test, audit, or dependency-rule tooling.
