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
- `site/` — the documentation website (its own npm package).

## Documentation site

The site is a separate npm package under `site/`, so its framework never
enters this package's dependencies. Run it from here:

```bash
npm run site:dev      # dev server with live reload (Docusaurus default port)
npm run site:build    # static build into site/build/
npm run site:serve    # serve a previously built site
```

The first run installs the site's own dependencies: `npm --prefix site install`.
Build output (`site/build/`, `site/.docusaurus/`) is git-ignored.

### URL map

| URL | Page |
| --- | --- |
| `/` | Landing: what ramify.ts is, the model's one question, the scope statement |
| `/model` | The core tree model — the live diagram plus the R1–R6 walkthrough |
| `/examples` | Illustrative examples — the tree-rule universes ("one decision, three reaches"; "both channels at once"), each with its own live diagram |
| `/tags` | Tags — the other half of the rule: the two availability rules (`▢` required module tag, `▭` required symbol tag) and the `testing` and `browser` tags that carry them |

The normative specification is not rendered as a site page; it ships with the
repository at `docs/model/cross-module-importability-rules.md`, and every page
points readers there.

### Portability discipline

`site/` is a thin shell: configuration and MDX/Markdown pages only. Every
component, all logic and all data are imported from `src/` (webpack alias
`@ramify` → `../src`, set in `site/docusaurus.config.ts`); nothing is
swizzled and no page body depends on theme-specific CSS class names, so
switching site frameworks stays mechanical config work.

## Conventions

ESM with `.js` extensions in source imports, strict TypeScript, vitest for
unit tests. This package intentionally does not participate in the host
repository's build, test, audit, or dependency-rule tooling.
