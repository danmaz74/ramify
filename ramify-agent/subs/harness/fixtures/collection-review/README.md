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
as cards and runs a review from a connected panel. Fifteen Ramify owners share
that work; each one has a `module.ramify` and a `README.md` whose first
paragraph is its purpose. Fourteen keep their own tests under `src/tests/`; the
fifteenth, `integration-tests`, is a separately declared testing module whose
ordinary `src/` is the Cucumber scenario.

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
npm run test:cucumber # the feature scenarios, through the real runner
npm run acceptance:quick # the scenarios in quick mode: the system in process
npm run acceptance:full  # the scenarios in full mode: the listener over HTTP
npm run build         # the browser bundle, into dist/
```

**A shell-level `NODE_ENV` reaches `vite build`.** With `NODE_ENV=development`
exported, the build still reports "for production" but emits React's development
build — about 415 kB here instead of about 216 kB. Unset it to build what you
would ship.

Tests run under Node with no DOM: components are rendered to static markup, and
the protocol tests use real clients over in-process transports, plus one test
that starts the listener on an ephemeral port and speaks HTTP to both mounts.

One scenario also runs under Cucumber. It lives in `subs/integration-tests/src/`,
the ordinary source of a separately declared testing module,
`integration-tests tagged [testing, dispatch]`, and `cucumber.js` beside the
other runner configurations collects it. Being a separate owner, that module
has no private access to the root: it reaches the configured system only
through `createTestSystem`, which the root exposes to its descendants from its
`src/tests/`, and its header must carry both `testing` and `dispatch` because
that symbol does. `.viz.feature` is plain Gherkin here: the
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

### The scenario harness

The package's scenarios run in two modes, fixed for one run of the runner by
`TEST_MODE` and never written into a scenario. `acceptance:quick` drives the
configured system in process, through `createTestSystem`, as every other test
does. `acceptance:full` reaches the same system through the real listener on
a loopback port: the `BeforeAll` hook starts it with `startServedTestSystem`,
which the root also exposes to its descendants, the typed client and the MCP
sessions speak HTTP to it, and the `AfterAll` hook stops it. Full mode needs
no browser and no setup command, and a dry run starts nothing. An MCP
session's id is the one the listener's transport generated there, which the
scenario compares against the id the server saw. `test:cucumber` runs quick
mode under this package's own `cucumber.js` profile.

Engineering tools can execute the project's declared commands. Each gate
independently asks for the committed configured audit, whose Cucumber check
runs the scenarios under its committed profile. The fixture commits no audit
definition, so the tests that drive a run over it answer each gate with a
scripted configured audit; a trial copy made by `npm run trial -- prepare`
commits one in the copy. `cucumber.js` also collects the feature files a run
writes and their step definitions, in a module's `src/tests/features/` and
`src/tests/steps/` or a testing module's `src/features/` and `src/steps/`,
and leaves out `@ramify-pending` scenarios. `ramify-agent.json` beside
`package.json` declares only that the type check prints `tsc`'s output, so a
standalone diagnosis attributes a failed type check by where its errors lie.

Step definitions and feature files sit in the conventional directories the
harness writes feature files beneath and briefs engineers to use: a module's `src/tests/steps/` and `src/tests/features/`, or,
for a testing module such as `integration-tests`, its `src/steps/` and
`src/features/`.

Scenario support, World and hooks are configured by `cucumber.js`. Their
module declarations and generated API views identify which source areas can
import them. New scenarios retain the requirements stated by their plan;
implementation choices belong to the assigned engineer and responsible architect.

## The ownership tree

Every module owns the `src/` beside its `module.ramify`, with children only
under `subs/`. A module's header tags classify its ordinary source; its
`src/tests/` area has the fixed derived profile in the third column: `testing`
plus the header's required-importer tags, never `browser`.

| Module | Header tags | `src/tests/` profile |
| --- | --- | --- |
| `collection-review` (root) | `[dispatch]` | `[testing, dispatch]` |
| `integration-tests` | `[testing, dispatch]` | `[testing, dispatch]` |
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

`integration-tests` is the one testing module: its header classifies its
ordinary `src/`, where the scenario, its World and its hooks live, and it
exposes nothing. Every other
owner keeps its tests in `src/tests/`.

`workspace` is the browser shell and the tree's relay point: feature adapters
travel through it to the root, and shared vocabulary travels through it down to
every descendant. The two owners named `ui` declare `module "ui"`, because `ui`
is a reserved keyword; their identifiers are still `workspace/catalog/ui` and
`workspace/reviews/ui`.

## Reading the descriptions

Each `module.ramify` states one module's name, its tags, and what it exposes and
in which direction. Read them together with each owner's README, which says what
the module is for; the comments in the descriptions say why each exposure exists.

The installed Ramify CLI parses these descriptions and checks source access.
Run the configured structural check when changing a description and use the
generated source or testing API view for the area that will import a symbol.
An analysis limitation records incomplete evidence; it does not supply access
or establish a scenario's semantic completion.

## Trial records

`plans/` is explicitly owned-unwired in the root description. It holds plan
requirements and the harness's durable `plans/<plan>/.harness/` run records;
source modules and their configured tests remain analyzed. Trial verification
reports and retained evidence are written outside the prepared project. The
project's existing configured audit obligations still apply to every gate.

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

Historical standalone evidence from 2026-09-07 with Node v22.23.2 and npm 10.9.8, after the scenario
moved into `integration-tests`: `npm ci` installed from the lockfile with no
vulnerabilities, `type-check` reported nothing, `build` transformed 49 modules
into `dist/`, `npm test` passed 77 tests in 20 files, and
`npm run test:cucumber` passed its one scenario of 12 steps and exited on its
own. Nothing outside the copy was needed.

That historical result predates the current fixture-input changes and is not
qualification of a new prepared copy.
