# ramify.ts

Ramify assembles the command line, the resident daemon and lazy batch analysis from its owners, defines the dispatch-facing service vocabulary that the daemon implements, and keeps executable dispatch separate from portable model and presentation entries. It assembles the affected-module service and its batch form.

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
[Cross-Module Importability Specification](docs/model/cross-module-importability.spec.md),
under the [importability principles](docs/model/cross-module-importability.principles.md),
with its vocabulary defined in the [Glossary](docs/model/glossary.md).
The [Directory Structure And Module Description Specification](docs/model/module-description.spec.md)
defines the required `src/` and `subs/` layout, optional same-owner
`src/tests/` and `src/interfaces/`, and the `module.ramify` language.
`expose-src` selects owned exports relative to the module's `src/`, by name or
with `*` for one explicitly named file beneath `src/interfaces/`;
`expose-test` selects owned exports relative to its `src/tests/`;
`expose-sub` selects, by name or `*`, the symbols a direct child exposes to it.
The [TypeScript Source Interpretation Specification](docs/model/typescript-source-interpretation.spec.md)
defines resource ownership, testing-source isolation, and how TypeScript imports
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
Resident checks, streamed watch revisions, daemon status/stop and the lightweight
`ramify.ts/client` entry are implemented. The daemon keeps a retained analysis
session per project and answers `ramify check --changed`, the bounded check an
agent's post-write hook runs, from the revision that covers the written file.
The [Plan 5 completion report](docs/plans/iteration-5-fast-incremental-checks/iterations/iteration13-results.md)
records its evidence and remaining gaps.
The Ramify MCP server, interactive explorer and browser verifier remain future
work; browser tag matching is implemented.
`ramify materialize` publishes a per-module, gitignored Markdown API catalog
(`src[/tests]/.ramify/{external,children}`) an agent searches with a documented
`rg` command instead of exploring source; the [materialized API discovery
specification](docs/architecture/materialized-api-view.spec.md) and [Plan 2A
completion report](docs/plans/iteration-2a-materialized-api-view/iterations/iteration10-results.md)
record its scope, measured limits and the one outstanding macOS platform gap.

## Install

ramify.ts is published to the registry at https://npm.braimax.com as `ramify.ts`.
Point npm at that registry in the consuming package's `.npmrc`, then install:

```ini
registry=https://npm.braimax.com
```

```sh
npm install ramify.ts
```

The package does not contain the Bun-compiled client executable, so its
`ramify` launcher runs the Node entry `node dist/src/cli-entry.js`.

## Check a project

To use a checkout instead of the published package, build it with
`npm run build`, then install it locally with `npm install /path/to/ramify`
in a consuming package. The build also compiles a
client executable for the host with Bun, a pinned devDependency. The `ramify`
command, the `dist/src/ramify` launcher, runs that executable, or the Node entry
`node dist/src/cli-entry.js` where none was built. It is available through npm's
local bin directory:

```sh
npx ramify check
npx ramify check --root /path/to/project --format json
npx ramify check --changed src/foo.ts
npx ramify check --changed src/a.ts src/b.ts --deadline 500 --format json
npx ramify check --batch
npx ramify watch --format json
npx ramify daemon status
npx ramify daemon stop
npx ramify materialize
npx ramify materialize --from subs/workspace/subs/reviews/src/tests
npx ramify materialize --all --root /path/to/project
npx ramify affected --path src/foo.ts --format json
npx ramify affected app/core app/storage
npx ramify affected --path src/foo.ts --batch --format json
```

`ramify affected` names the modules whose tests a change calls for: the changed
modules, the modules that depend on them and their union as test modules, from
one revision's dependency facts. Each path seed is owned, excluded or outside
the project; only a path outside the project, written with a leading `../`, or
partial coverage widens the answer to every module and says why. It exits 0 for any
complete answer, 1 for an invalid project, unknown module ID or invalid seed,
2 when unavailable and 130 when interrupted.

From this checkout, the same executable can check the reference directly:

```sh
npm run check:reference
npm run check:self
npm run reference:verify -- --plan 1
```

`check` checks the whole project beneath one root description, which declares
itself with the root marker, `root module <name>`. Without `--root` it selects
the nearest marked description at or above the working directory; `--root` must
name a directory whose description carries the marker. The compiler
configuration is found from the root as TypeScript finds it. The check includes
owned tests and resources. Owned compiler source outside every module's `src/`
is that module's auxiliary source, checked under its ordinary rules; trees a
description declares `owned-ignored` or `external` are not analyzed, and
compiler-selected source inside an owned-ignored tree or a module's scratch
directory `src/tmp/` produces a warning. `--batch` uses and disposes a fresh
session. Human output is the default; JSON output is one versioned report on
stdout. Inside a Git repository a complete check also warns about each
directory Git ignores that Ramify still walks; that advice never changes the
result. See the [CLI contract](docs/architecture/cli-invocation.spec.md) for
scope and exit codes. `--help` and `--version` load no compiler or server.

`check --changed <path>...` is the bounded hook check. It hashes the named files
the daemon's classification analyzes, waits up to `--deadline` milliseconds
(default 2000) for a daemon revision that covers them and prints every project
finding, marking the new ones, with each path checked, not analyzed or not
checked; JSON output is one `ramify.check/2` document. It exits 0 without
findings, 1 with findings or an invalid revision, whatever paths are not
analyzed, and 2 when a path was not checked, and it never falls back to batch. The
example adapter [`examples/hooks/claude-code-post-write.mjs`](examples/hooks/README.md)
runs it from a Claude Code post-write hook. Use the plain `check` or `--batch` at
the end of a task, before a commit or in CI.

The reusable session is exported from `ramify.ts/analysis`; command handling
with an injected service connector and batch operation is exported from `ramify.ts/cli`.
Portable entries are `ramify.ts/model` and `ramify.ts/layout`;
`ramify.ts/presentation` contains the teaching UI. See the
[batch usage guide](docs/development/batch-verification.md) for direct session
usage, production selection, gate evidence and measurement commands.

## Layout

- `docs/model/` - the importability principles and glossary, plus the
  importability, directory and module-description, and source interpretation
  specifications
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
  [implementation roadmap and plan briefs](docs/roadmap.md).
- `src/` - the installed launcher, Node and compiled CLI entries, the daemon
  entry, resident assembly and lazy batch assembly.
- `subs/analysis/` - batch validation and its declared model, descriptions,
  project and TypeScript children.
- `subs/presentation/` - teaching diagrams, React components and the neutral
  layout child. Every owner's tests live in its own `src/tests/`.
- `subs/cli/` - argument parsing, report formatting and injected command handling.
- `examples/` - the [Collection Review reference project](examples/collection-review/README.md):
  a small runnable application whose fifteen owners carry the module
  descriptions, with its own package, lockfile and toolchain; the root declares
  `examples/collection-review` owned-ignored, and the example is its own
  project. The [post-write hook adapter](examples/hooks/README.md) beside it is
  root auxiliary source.
- `scripts/reference-harness/` - the reference harness: one record per case
  family from the [case catalogue](docs/plans/reference-project/cases.md), and
  `npm run reference:report`, which runs the example's own tiers and reports
  what has and has not been established. `npm run reference:cases` runs the
  harness's own tests. The root declares it owned-ignored, as it does two
  probe fixture projects under `scripts/probes/fixtures/`; other compiler source
  beneath `scripts/` is root auxiliary source.
- `site/` - the documentation website (its own npm package), declared
  owned-ignored.

The root description also declares `docs/` owned-ignored, and `ramify-agent/`
and the work directories tools write into the checkout external.

## Documentation site

The site is a separate npm package under `site/`, so its framework never
enters this package's dependencies. Run it from here:

```bash
npm run site:prepare  # pack the built toolkit and install it into the site
npm run site:dev      # site:prepare, then a dev server with live reload on port 4300
npm run site:build    # site:prepare, then a static build into site/build/
npm run site:serve    # serve a previously built site on port 4301
```

The site consumes the toolkit as a package, never as source. `site:prepare`
packs the current toolkit build with `npm pack` and installs that tarball into
`site/node_modules` with `npm install --no-save`, so the site's manifest and
lockfile never name it and nothing local is committed. `npm --prefix site ci`
removes the candidate again, which is why `site:build` and `site:dev` run
`site:prepare` first. Without a toolkit build it runs `npm run build` first, and
without installed site dependencies `npm ci` in `site/`. It packs the build as
it is, so rebuild the toolkit after changing it. Build output (`site/build/`,
`site/.docusaurus/`) is git-ignored.

### URL map

| URL | Page |
| --- | --- |
| `/` | Landing page: what ramify.ts is, an overview of the model, and signposts to the detailed pages |
| `/modularity` | Why multi-file, hierarchical modularity matters and why ramify exists |
| `/model` | The simplified, tag-free core model, built up through two interactive examples |
| `/tags` | The two restrictive availability rules (`⇥` required importer tag and `⇤` required symbol tag), the default and project-defined tags, and module-owned `src/tests/` |
| `/explorer` | A preview of the module dependency explorer |
| `/glossary` | Definitions of the model's vocabulary |

The website is didactical. The internal principles, specifications and glossary
together define the complete, authoritative model; the website and
implementation must conform to them. The model, tags, and glossary pages
point readers to these documents in `docs/model/`.

### Portability discipline

`site/` imports diagrams and their model data from the `ramify.ts/presentation`
package export of the installed candidate; it reads no toolkit source and has
no aliases. Diagrams and their model data remain with their declared owners.
Nothing is swizzled and no page body depends on theme-specific CSS class names,
so switching site frameworks stays mechanical config work.

## Conventions

ESM with `.js` extensions in source imports, strict TypeScript, vitest for
unit tests. This package intentionally does not participate in the host
repository's build, test, audit, or dependency-rule tooling.

## Release

1. Bump `version` in `package.json` and the root entries of `package-lock.json`.
2. Commit the change.
3. Audit that commit using its committed `ramify-audit.json`:
   `ramify-agent/node_modules/.bin/ramify-audit audit --cwd . --full --json`.
   The CLI reads the checks and workspace configuration from the commit being
   audited. Its full audit must pass before publishing.
4. From a clean checkout of the audited commit, run `npm publish`. Its
   `prepublishOnly` script runs `npm run build`, and `publishConfig` sends the
   package to https://npm.braimax.com.

## License

MIT, see [LICENSE](LICENSE).
