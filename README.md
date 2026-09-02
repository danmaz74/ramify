# ramify.ts

**Multi-file hierarchical modules for TypeScript.**

TypeScript is modular at exactly one granularity, the file: above it, every
exported symbol is importable from every file, and an application's
architecture exists only by convention. ramify.ts lets you declare groups of
files as modules with a boundary and an interface, arrange them in a tree,
and have the boundaries checked - so a module can be understood, changed, or
handed to a team or an agent from its inside and the interfaces it consumes
alone.

It is a toolkit to **define, enforce, visualize, and help agents adhere to**
these modules. The rules are few: every cross-module import is closed by
default, a module shares a symbol only with its parent or with its own
subtree, and tags restrict, but never widen, what the tree allows. The model
is specified in
[docs/model/cross-module-importability-rules.md](docs/model/cross-module-importability-rules.md).

Why it matters:

- **Divide and conquer at every abstraction level.** A module tree lets you
  make the same split at every level: a system into domains, a domain into
  capabilities, a capability into implementation pieces. Each level can only
  compose the one below it through public interfaces, with automated checks
  enforcing it. For humans and agents alike.
- **A manageable context for every agent task.** In a module tree every task
  has a natural context: the module it works in, the interfaces it consumes,
  and the interface it owes its parent - nothing else. Splitting bigger tasks
  into smaller ones, on one or very few modules, keeps context sizes
  manageable.
- **Human oversight at the level you care about.** The module dependency
  explorer shows the architecture at the module and interface level, so you
  can keep track of what agents are doing, and steer it, at whichever
  abstraction level you care about. Agents too can use its dependency metrics
  to improve the architecture on their own.

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

- `docs/model/` - the model specification (application-agnostic; travels
  with the project).
- `docs/plans/` - ramify's own planning artifacts.
- `src/` - toolkit source; tests co-located as `src/**/*.test.ts`.
- `site/` - the documentation website (its own npm package).

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
| `/` | Landing page: what ramify.ts is, an overview of the model, and signposts to the detailed pages |
| `/modularity` | Why multi-file, hierarchical modularity matters and why ramify exists |
| `/model` | The simplified, tag-free core model, built up through two interactive examples |
| `/tags` | The two restrictive availability rules (`⇥` required module tag and `⇤` required symbol tag) and the `testing` and `browser` tags that carry them |
| `/explorer` | A preview of the module dependency explorer |
| `/glossary` | Definitions of the model's vocabulary |

The normative specification is not rendered as a site page; it ships with the
repository at `docs/model/cross-module-importability-rules.md`; the model,
tags, and glossary pages point readers there.

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
