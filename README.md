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
is specified in the
[Cross-Module Importability Principles](docs/model/cross-module-importability.principles.md),
with its vocabulary defined in the [Glossary](docs/model/glossary.md).
The [Directory Structure And Module Description Principles](docs/model/module-description.principles.md)
define the required `src/` and `subs/` layout, optional same-owner
`src/tests/` and `src/interfaces/`, and the `module.ramify` language.
`expose-src` selects owned exports relative to the module's `src/`, by name or
with `*` for one explicitly named file beneath `src/interfaces/`;
`expose-test` selects owned exports relative to its `src/tests/`;
`expose-sub` selects a direct child's upward-exposed symbols by name or `*`.
The [TypeScript Source Interpretation Principles](docs/model/typescript-source-interpretation.principles.md)
define resource ownership, testing-source isolation, and how TypeScript imports
and source re-exports map to symbol checks. Source checking reports definite
violations separately from nonblocking analysis limits.

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
toolkit; the feasibility study of adopting the model there is in the host
repository under `docs/analysis/2026-09-05-ramify-adoption-feasibility/`.

The version 1 description language is specified; its filesystem loader and
parser are not yet implemented. The evaluator currently accepts constructed
module trees and implements the earlier module-only `testing`/`browser`
model. The definitive specification uses a project-wide registry with two fixed
tag kinds and ordinary defaults `testing`, `ui`, `dispatch`, and `browser`.
The registry, separate `src/tests/` profile, and production-to-testing source
restriction still require evaluator/source-checker implementation. TypeScript
source interpretation is definitive within its stated bounded profile; a
source checker is not yet implemented.

## Layout

- `docs/model/` - the importability principles and glossary, plus the
  directory and module-description principles and the source interpretation
  specification
  (application-agnostic; travel with the project).
- `docs/architecture/` - [implementation architecture](docs/architecture/README.md):
  the resident daemon, lightweight CLI, stdio MCP adapter, separate on-demand
  tRPC web process, bounded memory lifecycle and quick testing, plus the proposed
  engine/module contracts. These documents distinguish decided architecture from details
  still under review; they do not establish implementation.
- `docs/analysis/` - design studies, including
  [preparation for the future project explorer](docs/analysis/project-explorer-reuse.md):
  reusable source, early analysis contracts and later visualization boundaries.
- `docs/plans/` - ramify's own planning artifacts, including the
  [Collection Review reference-project plan](docs/plans/reference-project/README.md)
  and its planned compatibility and regression cases, plus the
  [implementation roadmap and plan briefs](docs/plans/tooling-architecture/README.md).
- `src/` - toolkit source; tests co-located as `src/**/*.test.ts`.
- `examples/` - the [Collection Review reference project](examples/collection-review/README.md):
  a small runnable application whose fifteen owners carry the module
  descriptions, with its own package, lockfile and toolchain.
- `scripts/reference-harness/` - the reference harness: one record per case
  family from the [case catalogue](docs/plans/reference-project/cases.md), and
  `npm run reference:report`, which runs the example's own tiers and reports
  what has and has not been established. `npm run reference:cases` runs the
  harness's own tests.
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
| `/tags` | The two restrictive availability rules (`⇥` required importer tag and `⇤` required symbol tag), the default and project-defined tags, and module-owned `src/tests/` |
| `/explorer` | A preview of the module dependency explorer |
| `/glossary` | Definitions of the model's vocabulary |

The website is didactical. The internal principles document and glossary
together define the complete, authoritative model; the website and
implementation must conform to them. The model, tags, and glossary pages
point readers to these documents in `docs/model/`.

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
