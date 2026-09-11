# ramify.ts

Ramify assembles the command line, the resident daemon and lazy batch analysis from its owners, defines the dispatch-facing service vocabulary that the daemon implements, and keeps executable dispatch separate from portable model and presentation entries.

This is the final owner responsibility. The current implementation runs batch
checks; resident assembly, the daemon entry and client wiring remain incomplete.

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
`expose-sub` selects, by name or `*`, the symbols a direct child exposes to it.
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

The batch analysis session and CLI check descriptions and source imports using
the version 1 parser, project acquisition, TypeScript adapter and definitive
model. They report violations, warnings and analysis limits separately.
Teaching diagrams use the same model. The toolkit self-check and all 308
reference gate instances are implemented, including the independent toolkit
negative and relocated installation. The [completion report](docs/plans/done/iteration-1-project-verifier/iterations/iteration15-results.md)
records actual execution, resource measurements and remaining acceptance work.
The resident daemon, Ramify MCP server, interactive explorer and browser verifier
remain unavailable; browser tag matching is implemented.

## Check a project

Build this package with `npm run build`, then install it locally with
`npm install /path/to/ramify` in a consuming package. Its `ramify` executable
is available through npm's local bin directory:

```sh
npx ramify check
npx ramify check --root /path/to/project --format json
```

From this checkout, the same executable can check the reference directly:

```sh
npm run check:reference
npm run check:self
npm run reference:verify -- --plan 1
```

`check` discovers the whole project and its compiler configuration from the
working directory unless `--root` is given. It includes owned tests and
resources. `--batch` is accepted; each invocation uses and disposes a fresh
session. Human output is the default; JSON output is one versioned report on
stdout. See the [CLI contract](docs/architecture/cli-invocation.spec.md) for
scope and exit codes. `--help` and `--version` load no compiler or server.

The reusable session is exported from `ramify.ts/analysis`; command handling
with an injected batch operation is exported from `ramify.ts/cli`.
Portable entries are `ramify.ts/model` and `ramify.ts/layout`;
`ramify.ts/presentation` contains the teaching UI. See the
[batch usage guide](docs/development/batch-verification.md) for direct session
usage, production selection, gate evidence and measurement commands.

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
- `docs/development/` - [development guides](docs/development/README.md):
  implementation workflow, testing, engineering practices, cucumber-viz setup
  and the shared Claude/Codex skills.
- `docs/analysis/` - design studies, including
  [preparation for the future project explorer](docs/analysis/project-explorer-reuse.md):
  reusable source, early analysis contracts and later visualization boundaries.
- `docs/plans/` - ramify's own planning artifacts, including the
  [Collection Review reference-project plan](docs/plans/reference-project/README.md)
  and its planned compatibility and regression cases, plus the
  [implementation roadmap and plan briefs](docs/plans/tooling-architecture/README.md).
- `src/` - the executable entry and lazy batch assembly.
- `subs/analysis/` - batch validation and its declared model, descriptions,
  project and TypeScript children.
- `subs/presentation/` - teaching diagrams, React components and the neutral
  layout child. Every owner's tests live in its own `src/tests/`.
- `subs/cli/` - argument parsing, report formatting and injected command handling.
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
npm run site:dev      # dev server with live reload on port 4300
npm run site:build    # static build into site/build/
npm run site:serve    # serve a previously built site on port 4301
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

`site/` consumes the presentation, model and layout entries through exact
`@ramify/presentation`, `@ramify/model` and `@ramify/layout` aliases in
`site/docusaurus.config.ts`. Diagrams and their model data remain with their
declared owners. Nothing is swizzled and no page body depends on theme-specific
CSS class names, so switching site frameworks stays mechanical config work.

## Conventions

ESM with `.js` extensions in source imports, strict TypeScript, vitest for
unit tests. This package intentionally does not participate in the host
repository's build, test, audit, or dependency-rule tooling.
