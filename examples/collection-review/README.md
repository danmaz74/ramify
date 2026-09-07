# Collection Review

Collection Review is a small, complete application used as a reference for
authoring Ramify modules. It shows two fixed catalog records — one with an
intact two-revision history, one whose chain names a predecessor that resolves
to no revision — and runs one deterministic review over them. This root module
owns the Node entry point, the configured tRPC and MCP runtimes, and the
assembly that composes the feature adapters its descendants expose upward.

The same two capabilities are served through two native protocol surfaces and
one browser screen. tRPC answers `catalog.get` and `reviews.run` for a typed
client. MCP lists and calls `catalog.inspect` and `reviews.run` behind one
server, where a review-session table binds each session to a revision scope and
every list and call resolves that binding again. The browser lists both records
as cards and runs a review from a connected panel. Fourteen Ramify owners share
that work; each one has a `module.ramify`, a `README.md` whose first paragraph
is its purpose, and its own tests under `src/tests/`.

The package is self-contained: it declares its own dependencies and lockfile and
its own TypeScript, Vite and Vitest configuration, and it imports no source from
the repository around it. No owner is a package, and there is no `index.ts`
anywhere in the tree.

## Running it

```bash
npm install
npm run dev:api     # the API listener, http://localhost:8787
npm run dev:web     # the browser shell, http://localhost:5180
```

`dev:web` proxies `/trpc` to the API process, so the browser talks to one
origin; it never talks to `/mcp`. `PORT` overrides the API port. Both mounts are
served by one Node listener: `src/main.ts` chooses the port and `src/server.ts`
starts everything else, which is what lets a test start the same program on a
port the operating system picks.

```bash
npm run type-check    # ordinary source, every src/tests/, and the config files
npm test              # every owner's tests, under Node
npm run test:cucumber # the one feature scenario, through the real runner
npm run build         # the browser bundle, into dist/
```

**A shell-level `NODE_ENV` reaches `vite build`.** With `NODE_ENV=development`
exported, the build still reports "for production" but emits React's development
build — about 415 kB here instead of about 216 kB. Unset it to build what you
would ship.

Tests run under Node with no DOM: components are rendered to static markup, and
the protocol tests use real clients over in-process transports, plus one test
that starts the listener on an ephemeral port and speaks HTTP to both mounts.

One scenario also runs under Cucumber. It lives in `src/tests/features/`, the
root owner's testing source, and `cucumber.js` beside the other runner
configurations collects it. `.viz.feature` is plain Gherkin here: the
`# @viz-…` lines at the top are ordinary comments that nothing reads, and the
file needs `@cucumber/cucumber` and nothing else. The scenario reviews both
records through the typed client and then through one MCP session bound to part
of a history, so it exercises the same system the other tests do.

It is there for reference case K05, which is about how the runner's setup is
loaded rather than about the review: the hook module is reached through two
setup paths in one runtime — the runner's `import` glob and a symbol-free
`import '../support/hooks.js'` in the step definitions — and the shared
initialization is a side effect of loading it rather than an exported
capability invented to justify the load. The scenario's last step asserts that
the initialization was evaluated once and the run-level hook registered once.
This is that fixture and not this package's test framework, which is Vitest.

## The ownership tree

Every module owns the `src/` beside its `module.ramify`, with children only
under `subs/`. A module's header tags classify its ordinary source; its
`src/tests/` area has the fixed derived profile in the third column: `testing`
plus the header's required-importer tags, never `browser`.

| Module | Header tags | `src/tests/` profile |
| --- | --- | --- |
| `collection-review` (root) | `[dispatch]` | `[testing, dispatch]` |
| `workspace` | `[ui, browser, dispatch]` | `[testing, ui, dispatch]` |
| `workspace/contracts` | `[]` | `[testing]` |
| `workspace/shared-ui` | `[ui, browser]` | `[testing, ui]` |
| `workspace/catalog` | `[dispatch]` | `[testing, dispatch]` |
| `workspace/catalog/core` | `[]` | `[testing]` |
| `workspace/catalog/ui` | `[ui, browser]` | `[testing, ui]` |
| `workspace/reviews` | `[dispatch]` | `[testing, dispatch]` |
| `workspace/reviews/core` | `[]` | `[testing]` |
| `workspace/reviews/core/controller` | `[]` | `[testing]` |
| `workspace/reviews/core/tasks` | `[]` | `[testing]` |
| `workspace/reviews/validation` | `[]` | `[testing]` |
| `workspace/reviews/ui` | `[ui, browser, dispatch]` | `[testing, ui, dispatch]` |
| `workspace/reviews/ui/pure-ui` | `[ui, browser]` | `[testing, ui]` |

`workspace` is the browser shell and the tree's relay point: feature adapters
travel through it to the root, and shared vocabulary travels through it down to
every descendant. The two owners named `ui` declare `module "ui"`, because `ui`
is a reserved keyword; their identifiers are still `workspace/catalog/ui` and
`workspace/reviews/ui`.

## Reading the descriptions

Each `module.ramify` states one module's name, its tags, and what it exposes and
in which direction. Read them together with each owner's README, which says what
the module is for; the comments in the descriptions say why each exposure exists.

Nothing checks them yet: version 1 has no parser, loader or evaluator support.
Until it does, every description is reviewed by hand against the
[description review checklist](../../docs/plans/reference-project/implementation.md#description-review-checklist)
at the end of each iteration. Use that checklist when you change a description,
and record the change in the contract map below.

## Cases, contracts and the report

- The [case catalogue](../../docs/plans/reference-project/cases.md) names every
  expectation this project is a witness for, and what each one still needs.
- The [contract map](../../docs/plans/reference-project/contract-map.md) records
  every exposed symbol: its owner, defining file, kind, tags, the statements
  that carry it, and the modules that import it.
- The [reference harness](../../scripts/reference-harness/) holds one record per
  case family and prints what has actually been established. From the repository
  root above this package:

  ```bash
  npm run reference:report            # runs this package's tiers, then reports
  npm run reference:report -- --dry-run
  npm run reference:cases             # the harness's own tests
  ```

  The report is deliberately unflattering: the application, protocol and tools
  tiers pass — the last of them the one Cucumber scenario — and every case whose
  capability does not exist yet is listed as **not executed** rather than
  skipped or dropped.

## Independence

This package must keep working outside the repository that contains it. The
procedure, to be repeated whenever its dependencies change:

1. Copy the package to a directory outside that repository, excluding
   `node_modules/`, `dist/` and `.reference-work/`.
2. `npm ci`, so the copy installs from this lockfile alone.
3. `npm run type-check`, `npm run build`, `npm test` and `npm run test:cucumber`
   in the copy, with no ancestor packages and no inherited module-resolution
   overrides.
4. Remove the copy.

Last run on 2026-09-07 with Node v22.23.2 and npm 10.9.8, after
`@cucumber/cucumber` was added: `npm ci` installed 233 packages, `type-check`
reported nothing, `build` transformed 49 modules into `dist/`, `npm test`
passed 77 tests in 20 files, and `npm run test:cucumber` passed its one
scenario of 12 steps and exited on its own. Nothing outside the copy was
needed.
