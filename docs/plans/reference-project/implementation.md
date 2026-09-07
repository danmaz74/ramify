# Reference project: implementation plan

**Date:** 2026-09-06, revised 2026-09-07. **Status:** Ready to execute.
Delivers Phase 1 of the [project plan](README.md) (the runnable reference
with full module descriptions) and the pending-case inventory that opens
Phase 2. Toolkit work (parser, loader, evaluator, source checker) is not part
of this plan.

All paths are relative to the Ramify repository root. The plan is written
before Ramify is separated from its current host repository; nothing in it
depends on the host.

## Scope and principles

**Minimal, functional, complete descriptions.** Every owner in the plan's
tree exists on disk with its `module.ramify` and README from the first
iteration. Code is the simplest that makes the application work with real
protocol libraries: a browser that lists two records and runs one review
through a typed tRPC client, an MCP server that lists and calls two tools, and
in-process tests for all of it. No stub stands in for a protocol surface.

**The contract map grows with the code.** `contract-map.md` beside this plan
is the record of every exposed symbol: owner, defining file, kind, tags, the
statement that exposes it, and the modules that import it. Each iteration
ends by updating it. The tables in the iterations below are the proposal for
that iteration; the map records what was built, and wins on disagreement.

**Nothing checks the descriptions yet.** Version 1 of `module.ramify` has no
parser, loader, or evaluator support. Until it does, every description is
reviewed by hand against the [checklist](#description-review-checklist)
below. When the toolkit can read descriptions, the reference project is the
first input, and whatever it flags is fixed then. Do not write a throwaway
checker inside the example.

**Types are checked, not assumed.** Case D01 requires exact public typing.
Runtime tests alone cannot show it, because a widened router or client type
satisfies every call. Each protocol iteration therefore adds type assertions
with `expectTypeOf` and compiler-negative lines marked `@ts-expect-error`,
placed in the `src/tests/` of the owner that can see the types involved.
The `type-check` script covers `src/tests/`, and the compiler reports an
unused `@ts-expect-error` as an error, so a widened type fails the build.
No test or source file narrows a protocol type with a cast.

**Self-contained example.** `examples/collection-review/` is one npm package
with its own lockfile, `tsconfig.json`, Vite and Vitest configuration. It
never imports the toolkit's `src/`, and the toolkit's `tsconfig.json` and
`vitest.config.ts` do not include it. Root scripts delegate to it with
`npm --prefix`, as the site scripts do.

## Decisions fixed by this plan

| Topic | Decision |
| --- | --- |
| Stack | TypeScript, Vite with the React plugin, React 19, `@trpc/server` and `@trpc/client` v11, `zod`, `@modelcontextprotocol/sdk`, Vitest, `tsx` as the Node runner. Exact versions are chosen and locked in iteration 1. |
| API process | One Node `http` listener serving tRPC under `/trpc` through the standalone adapter and MCP under `/mcp` through the streamable HTTP transport. `dev:api` and the HTTP smoke test run the entry through `tsx`, because the compiler configuration below permits unmarked type imports that Node's own type stripping cannot execute. Vite proxies `/trpc` in development; the browser never talks to `/mcp`. Port from an environment variable with a fixed default; never a port another local server uses. |
| Test transports | Tests use real protocol clients without sockets. tRPC: a `TRPCClient<AppRouter>` built with `httpLink` whose `fetch` is bound to the tRPC fetch adapter over the assembled router. MCP: the SDK's linked in-memory transport pair, one pair per session. Two adapters over one router are both real adapters; the fetch adapter is what lets tests keep an actual client. |
| MCP sessions | Session identity is the transport session id that the SDK passes to every request handler in its request context, for `tools/list` and `tools/call` alike. The HTTP transport generates it. The in-memory test transport carries a session id set by the test before connecting; if the SDK version in use does not let the test set it, wrap the transport so it does. A tool argument is never the session identity: `tools/list` carries no arguments, and root must not parse business arguments. |
| MCP server lifetime | The SDK binds one server instance to one transport. Root therefore exports a server factory that takes the collected tool contributions and is called once per connection. The contributions, and the review-session table behind them, are created once at assembly and shared by every server instance. |
| Module syntax | ESM, `"type": "module"`, `.js` extensions on relative imports. One `tsconfig.json` for the whole example: `strict`, `jsx: react-jsx`, `isolatedModules: true`, `verbatimModuleSyntax` **off** so unmarked type imports stay legal (case T03), Node types included because the root's source is a Node program, Vite client types included for CSS-module and HTML imports. |
| Import specifiers | Relative paths by default. Exactly one configured alias, `@features/*` to `subs/workspace/subs/*`, declared in `tsconfig.json` `paths` and Vite `resolve.alias`, used only by the workspace shell (case S01). |
| Component tests | Vitest in the Node environment. Components are checked with `react-dom/server` static markup; no jsdom and no browser automation in this plan. Static markup does not run effects, so every component that loads data separates its loading function from its rendering, and tests call the loader against the test client and render the loaded state. A lazily loaded child renders as its Suspense fallback in a static-markup test; the child's own test covers its behavior. |
| Module names | `catalog/ui` and `reviews/ui` are declared `module "ui" tagged [...]` and referenced as `expose-sub ... from "ui"`, because `ui` is a reserved keyword. Quoting is syntax only; the identifiers stay `catalog/ui` and `reviews/ui`. Every other name is bare. |
| Symbol tags | Defaults from the defining area everywhere. `browser` is written explicitly on every exposed runtime symbol that a browser-classified module value-imports, and on the contracts wildcard. An explicit clause repeats the defining area's required tags, because the grammar rejects a clause that omits them. Never write a tag clause on `expose-sub`. |
| Owned tests | Every owner's tests and helpers live in its `src/tests/`. No separately declared testing module in the baseline; that shape is an O07 variant for the harness. |
| View contracts | `pure-ui` owns `ReviewResultProps`; the connected panel maps the API's inferred output onto them. Core-owned `ReviewOutcome` is exposed upward to its adapter only and never travels downward, so `validation` cannot see any review-runtime type (cases R01 and D05, project-plan route 5). Catalog deliberately uses the other pattern and relays core-owned `CatalogSummary` down to its view (route 3). |
| Barrels | No `index.ts` anywhere in the baseline. The baseline has two forwarding aliases, both same-owner: the description alias `inspect as inspectRecord` and the source alias `export type { AppRouter } from '../assembly.js'` in root's interface file. Neither creates a new binding. |

## Target tree

The tree, profiles, and file layout are those of the [project plan](README.md#proposed-ownership-tree).
For reference, with derived `src/tests/` profiles:

| Module | Header tags | `src/tests/` profile |
| --- | --- | --- |
| `collection-review` (root) | `[dispatch]` | `[testing, dispatch]` |
| `workspace` | `[ui, browser, dispatch]` | `[testing, ui, dispatch]` |
| `contracts` | `[]` | `[testing]` |
| `shared-ui` | `[ui, browser]` | `[testing, ui]` |
| `catalog` | `[dispatch]` | `[testing, dispatch]` |
| `catalog/ui` | `[ui, browser]` | `[testing, ui]` |
| `catalog/core` | `[]` | `[testing]` |
| `reviews` | `[dispatch]` | `[testing, dispatch]` |
| `reviews/core` | `[]` | `[testing]` |
| `reviews/core/controller` | `[]` | `[testing]` |
| `reviews/core/tasks` | `[]` | `[testing]` |
| `reviews/validation` | `[]` | `[testing]` |
| `reviews/ui` | `[ui, browser, dispatch]` | `[testing, ui, dispatch]` |
| `reviews/ui/pure-ui` | `[ui, browser]` | `[testing, ui]` |

## Iterations

Each iteration is independently verifiable and leaves the example
installable, type-checked, tested, and built. An iteration's proposed files
and declarations may change during execution; the exit criteria may not.

### Iteration 1: package, tree, descriptions, documentation

**Goal.** The whole ownership tree exists on disk with valid descriptions and
purpose READMEs, the example package installs and builds independently, and
the browser shows a static shell.

**Deliverables.**

- `examples/collection-review/package.json` (private, ESM), lockfile,
  `tsconfig.json`, `vite.config.ts` (root `subs/workspace/src/`, proxy for
  `/trpc`, the `@features/*` alias), `vitest.config.ts` (includes every
  `**/src/tests/**/*.test.ts?(x)` under the example, excludes
  `.reference-work/`), `.gitignore` (`node_modules/`, `dist/`,
  `.reference-work/`).
- Package scripts: `dev:api`, `dev:web`, `build`, `type-check`, `test`.
  `type-check` covers ordinary source, `src/tests/`, and the configuration
  files.
- Root `package.json` scripts `example:install`, `example:dev:api`,
  `example:dev:web`, `example:build`, `example:type-check`, `example:test`,
  each delegating with `npm --prefix examples/collection-review`.
- `module.ramify` for all fourteen owners with the headers from the target
  tree, and `README.md` beside each with the purpose paragraph first.
- `contracts/src/interfaces/vocabulary.ts`: `RecordId`, `Revision`,
  `RevisionChain`, `Finding`, `InspectionReport`, `ReviewStatus`,
  `RevisionScope`, `Observation`, plus the `zod` schemas the tools will
  validate arguments and findings with. `RevisionScope` and `Observation`
  are the neutral scope and observation-callback vocabulary that the
  inspection port and catalog's inspection share without either importing
  the other. `contracts/src/tests/vocabulary.test.ts` round-trips one schema.
- `workspace/src/index.html`, `main.tsx` rendering a heading, `styles.css`.
- `contract-map.md` created with its column format and the contracts rows.

**Declarations added.**

| Owner | Statement |
| --- | --- |
| `contracts` | `expose-src * from "interfaces/vocabulary.ts" tagged [browser] to parent` |
| `workspace` | `expose-sub * from contracts to descendants` |

The `browser` clause is the owner's promise that the vocabulary and its
`zod` dependency are browser-safe; it makes the schemas value-importable by
the shell and the UI owners later.

**Exit criteria.** `type-check`, `test`, and `build` pass from the example
directory; `dev:web` serves the static shell; every description passes the
review checklist; every README has a prose first paragraph; the map lists
the contracts vocabulary. Cases authored, pending a checker: L01, L03, L07,
E07.

### Iteration 2: catalog capability through both protocols

**Goal.** `catalog.get` is callable through the configured tRPC runtime and
`catalog.inspect` through the MCP server, in process and over HTTP, with
exact types asserted and the review-side fixture defined and relayed.

**Deliverables.**

- Root: `src/interfaces/protocol.ts` (`InvocationContext`,
  `ProtocolFacilities`, `McpToolContribution`); `src/protocol.ts`
  (`createFacilities` initializing tRPC with the invocation context, and
  `createMcpServer(contributions)`, the per-connection server factory whose
  `tools/list` and `tools/call` handlers delegate to the contributions and
  pass each handler's request context, including the session id, through
  unchanged); `src/assembly.ts` (`assembleSystem` composing the feature
  factories into `AppRouter`, the contribution list, and the server factory);
  `src/main.ts` (the listener, creating one MCP server per HTTP session).
  `src/tests/setup.ts` defines `createTestSystem`, returning the assembled
  router, a `TRPCClient<AppRouter>` over the fetch adapter, and
  `connectMcpSession(sessionId)`, which creates one in-memory transport pair
  with that session id, one server from the factory, and returns a connected
  MCP client. `src/tests/assembly.test.ts` calls `catalog.get` and lists
  tools through one session. `src/tests/protocol-typing.test.ts` holds the
  root-level type assertions: creating a caller without an invocation context
  is a compiler error, and so is mounting the fetch adapter without a context
  factory where the adapter's types make one required.
- `catalog/core`: `src/records.ts` (the two fixed records, private),
  `src/history.ts` (private helper), `src/catalog.ts` (`getRecord`,
  `inspect`, `CatalogSummary`). `inspect(recordId, scope, observe)` takes
  the neutral `RevisionScope` and an `Observation` callback from the
  contracts vocabulary and returns an `InspectionReport` of facts: the
  revision chain as recorded, including a predecessor reference that resolves
  to no revision. It reports no findings; producing findings is validation's
  job in iteration 3. `src/tests/catalog.test.ts` reads the private helper
  directly. `src/tests/fixture.ts` defines `makeCatalogFixture`.
- `catalog`: `src/router.ts` (`createCatalogRouter(facilities)`),
  `src/mcp.ts` (`createCatalogTools()` for `catalog.inspect`, owning
  argument parsing and result adaptation, and collecting observations into
  the tool result). `src/tests/adapters.test.ts` uses `createTestSystem`
  and asserts that the client's `catalog.get` output type is exactly
  `CatalogSummary` and that an input with the wrong shape is a compiler
  error.
- `workspace`: relay statements only.

**Declarations added.**

| Owner | Statement |
| --- | --- |
| root | `expose-src InvocationContext, ProtocolFacilities, McpToolContribution from "interfaces/protocol.ts" to descendants` |
| root | `expose-test createTestSystem from "setup.ts" to descendants` |
| `catalog/core` | `expose-src getRecord, inspect, CatalogSummary from "catalog.ts" to parent` |
| `catalog/core` | `expose-test makeCatalogFixture from "fixture.ts" to parent` |
| `catalog` | `expose-src createCatalogRouter from "router.ts" to parent` |
| `catalog` | `expose-src createCatalogTools from "mcp.ts" to parent` |
| `catalog` | `expose-sub inspect as inspectRecord from core to parent` |
| `catalog` | `expose-sub makeCatalogFixture from core to parent` |
| `workspace` | `expose-sub createCatalogRouter, createCatalogTools, inspectRecord from catalog to parent` |
| `workspace` | `expose-sub makeCatalogFixture from catalog to descendants` |

The root receives `inspectRecord` now so iteration 3 can wire it into the
review factory without touching catalog again; root's source imports the
original `inspect` from its defining file, since an exposed name never
prescribes import spelling. Root's ordinary source imports the factories;
its `src/tests/` imports its own assembly and the same factories under the
`[testing, dispatch]` profile. The fixture, tagged `[testing]`, passes
through `catalog` and `workspace`, whose ordinary source cannot import it:
that relay is the baseline groundwork for case T06, and the alias
`inspectRecord` for case E05.

**Exit criteria.** `catalog.get` returns both records through the client
and through `curl` against `dev:api`; the MCP client on one in-memory
session lists `catalog.inspect` and calls it for both records, one report
carrying a predecessor reference that resolves to no revision; the
private-helper test passes from `catalog/core/src/tests/`; the type
assertions above pass and each `@ts-expect-error` line is exercised; map
and checklist updated. Cases authored: E01, E02, E05, O01, T02 (adapter
side), T05 (baseline half), T06 (baseline half), D01 and D02 (catalog half).

### Iteration 3: review runtime, validation, adapters, sessions

**Goal.** `reviews.run` works through both surfaces, the review runtime is
assembled from its children through exposures, and the MCP session wrapper
re-resolves its binding per request for both list and call.

**Deliverables.**

- `reviews/validation`: `src/validate.ts` (`validateRevisionChain`
  returning `Finding[]`; the missing-predecessor finding is produced here);
  tests for a valid chain and a missing predecessor.
- `reviews/core/tasks`: `src/inspection-task.ts` (`runInspectionTask`
  taking the port and the validator, plus one private exported helper it
  uses, which case R02's mutation later imports from the parent),
  `src/result.ts` (`summarizeTaskResult`); tests.
- `reviews/core/controller`: `src/controller.ts` (`tick`, one supervisor
  tick that takes the scheduled task and runs it); test.
- `reviews/core`: `src/interfaces/port.ts` (`InspectionPort`, a named
  selection from an interface file, kept separate so the tasks child
  imports the port type without a file cycle through the runtime),
  `src/runtime.ts` (`ReviewOutcome`, `createReviewRuntime(port)` scheduling
  one task and driving it with `tick`). `src/tests/runtime.test.ts` is the
  parent-owned integration test that calls the real controller and task,
  using `makeCatalogFixture` as the port's data.
- `reviews`: `src/session.ts` (the review-session table: `bind`,
  `resolveBinding`, keyed by session id), `src/router.ts`
  (`createReviewsRouter(facilities, port)`), `src/mcp.ts`
  (`createReviewsTools(port)` resolving the session binding from the
  request context on every list and call and taking one immutable
  invocation snapshot). Tests: run through the client; MCP list and call;
  a binding change between list and call, observed in both operations; two
  sessions opened with `connectMcpSession` and bound differently, each
  listing and calling under its own binding; the client's `reviews.run`
  output type is exactly `ReviewOutcome` and an input missing the record id
  is a compiler error.
- Root: `assembleSystem` passes catalog's `inspect`, received under the
  exposed name `inspectRecord`, as the `InspectionPort`; `createTestSystem`
  grows accordingly; the assembly test runs one review end to end through
  the API.

**Declarations added.**

| Owner | Statement |
| --- | --- |
| `reviews/validation` | `expose-src validateRevisionChain from "validate.ts" to parent` |
| `reviews/core/tasks` | `expose-src runInspectionTask from "inspection-task.ts" to parent` |
| `reviews/core/tasks` | `expose-src summarizeTaskResult from "result.ts" to parent` |
| `reviews/core/controller` | `expose-src tick from "controller.ts" to parent` |
| `reviews/core` | `expose-src InspectionPort from "interfaces/port.ts" to parent, descendants` |
| `reviews/core` | `expose-src createReviewRuntime, ReviewOutcome from "runtime.ts" to parent` |
| `reviews/core` | `expose-sub runInspectionTask, summarizeTaskResult from tasks to descendants` |
| `reviews` | `expose-src createReviewsRouter from "router.ts" to parent` |
| `reviews` | `expose-src createReviewsTools from "mcp.ts" to parent` |
| `reviews` | `expose-sub InspectionPort from core to parent` |
| `reviews` | `expose-sub validateRevisionChain from validation to descendants` |
| `workspace` | `expose-sub createReviewsRouter, createReviewsTools, InspectionPort from reviews to parent` |

Task helpers travel up to `reviews/core` and down only within its subtree;
validation reaches `reviews/core` through `reviews`; `validation` sees
nothing owned by `reviews/core` or its children, so it can import neither
their behavior nor their types; tasks cannot import the controller.
`ReviewOutcome` stops at `reviews`, whose adapters name it; the views never
import it.

**Exit criteria.** The browser-independent application is complete: both
tools list and call, both procedures answer, and one review of the record
with the missing predecessor yields that finding through tRPC and through
MCP. The session tests demonstrate re-resolution for list and call and
isolation between two sessions. The type assertions pass. Map and checklist
updated. Cases authored: R01, R02, D01, D02, D03, D04, D05, O02, E03.

### Iteration 4: browser shell and views

**Goal.** A browser shows both records as cards and runs a review from a
connected panel, through the typed client, with the view contracts flowing
through the tree as the plan's routes 4 and 5 describe.

**Deliverables.**

- `shared-ui`: `src/status-badge.tsx` (`StatusBadge`, `StatusBadgeProps`);
  markup test.
- `catalog/ui`: `src/catalog-card.tsx` (`CatalogCard` taking a
  `CatalogSummary`, imported unmarked so case T03 has its baseline witness,
  and rendering `StatusBadge` for case T01), `src/catalog-card.module.css`;
  markup test.
- `reviews/ui/pure-ui`: `src/review-result.tsx` (`ReviewResult` and its
  view-owned `ReviewResultProps`, rendering `StatusBadge`), `src/format.ts`
  (private `formatFinding`), `src/review-result.module.css`; tests for the
  private formatter and the markup.
- `reviews/ui`: `src/review-panel.tsx` (`ReviewPanel` taking the typed
  client and a record id; its loading function `loadReview` calls
  `reviews.run` and maps the inferred output onto `ReviewResultProps`; the
  component renders `ReviewResult`). The test drives `loadReview` against
  `createTestSystem`'s client and renders the loaded state. This file uses
  the inline `import { type AppRouter, ... }` form for case S03.
- Root: `src/interfaces/protocol.ts` adds
  `export type { AppRouter } from '../assembly.js'`, a same-owner forwarding
  alias of the assembly's router type.
- `workspace`: `src/client.ts` (`createClient` building the typed tRPC
  client from `AppRouter`, using the statement-level `import type` form for
  case S03), `src/app.tsx` (`loadShell` fetches both summaries through
  `catalog.get`; `Shell` renders a `CatalogCard` each and lazy-loads
  `ReviewPanel` with a literal dynamic import, case S02's baseline half),
  `main.tsx` mounting it. `src/tests/shell.test.tsx` drives `loadShell`
  against `createTestSystem`'s client, renders `Shell` to static markup with
  the panel's fallback in place, and holds the client-side compiler
  negatives: `catalog.get` with a numeric record id and `reviews.run`
  without input are errors. The shell imports its feature views through the
  `@features/*` alias.

**Declarations added.**

| Owner | Statement |
| --- | --- |
| root | `expose-src AppRouter from "interfaces/protocol.ts" to descendants` |
| `shared-ui` | `expose-src StatusBadge, StatusBadgeProps from "status-badge.tsx" tagged [ui, browser] to parent` |
| `workspace` | `expose-sub * from shared-ui to descendants` |
| `catalog` | `expose-sub CatalogSummary from core to descendants` |
| `catalog/ui` | `expose-src CatalogCard from "catalog-card.tsx" tagged [ui, browser] to parent` |
| `catalog` | `expose-sub CatalogCard from "ui" to parent` |
| `reviews/ui/pure-ui` | `expose-src ReviewResult, ReviewResultProps from "review-result.tsx" tagged [ui, browser] to parent` |
| `reviews/ui` | `expose-src ReviewPanel from "review-panel.tsx" tagged [ui, dispatch, browser] to parent` |
| `reviews` | `expose-sub ReviewPanel from "ui" to parent` |

`workspace` imports `CatalogCard` and `ReviewPanel` as received symbols from
its children; no further statement is needed for its own use. The workspace
relays server factories it cannot value-import itself, which is the baseline
witness for case E04. Both core owners see `StatusBadge` and cannot import
it (case T01); `pure-ui` sees `AppRouter` and cannot import it (case T02).

**Exit criteria.** With `dev:api` and `dev:web` running, the browser lists
both records and the Review button renders the finding for the broken
record; `build` emits a lazy chunk for the panel; all markup tests and type
assertions pass; map and checklist updated. Cases authored: T01, T02, T03,
E04, O04, O05, S01, S02 (baseline half), S03, S04. Browser-execution cases
K01 to K04 stay pending automation.

### Iteration 5: test completion, harness inventory, independence

**Goal.** Every owner has owned tests, the case inventory exists as harness
data with an honest capability report, and the example is proven
independent of the repository around it.

**Deliverables.**

- Owned tests wherever iterations 1 to 4 left an owner without one; a
  root-level test that starts the listener on an ephemeral port, calls both
  surfaces over HTTP with two MCP sessions, and closes it.
- `scripts/reference-harness/` with its own `tsconfig.json` and
  `vitest.config.ts`: `cases.ts` holding one record per case family from
  [cases.md](cases.md) with the fields [harness.md](harness.md) requires,
  and `report.ts` that runs the example's application tier and prints the
  report in the harness plan's format, listing every case whose capability
  is absent as **not executed**. Root script `reference:report`. The
  mutation runner is not part of this plan.
- `examples/collection-review/README.md`: how to run, the tree with
  profiles, where the cases live, and the independence procedure.
- The independence procedure executed once: copy the example without
  dependencies and outputs to a directory outside the repository, install
  from its lockfile, type-check, build, and test there. Record the outcome
  in the example README.
- Root `README.md` Layout section lists `examples/` and
  `scripts/reference-harness/`.
- Final pass over all fourteen descriptions with the checklist, and the map
  marked complete for the baseline.

**Exit criteria.** `reference:report` prints passed application and
protocol tiers, zero known violations, and the full pending inventory by
capability; the independence run passed; no owner lacks a test.

## Description review checklist

Apply to every `module.ramify` at the end of each iteration until the parser
exists.

1. After comments and blank lines, the first statement is `ramify 1` and the
   second is `module <name>` with `<name>` matching
   `[a-z][a-z0-9]*(?:-[a-z0-9]+)*`, quoted only when it is a keyword. The two
   `ui` owners are quoted; nothing else is.
2. Header tags are exactly the target tree's; no duplicates; only
   registered names.
3. Each `expose-src` path is relative to `src/`, names an existing file, and
   every selected export exists in that file. Each `expose-test` path is
   relative to `src/tests/`. `*` appears only on a file under
   `src/interfaces/` or on `expose-sub`.
4. Each `expose-sub` names a direct child by its declared name, and every
   selected name is one that child exposes to parent.
5. Every `tagged` clause contains all required-importer tags of the defining
   area (the header's, plus `testing` under `src/tests/`), and `browser`
   appears on every exposed runtime symbol a browser-classified module
   value-imports. No `tagged` on `expose-sub`.
6. Every exposed name in one file resolves to one original, and every
   selected export is an owned binding or a same-owner forwarding alias of
   one; no selection forwards a foreign binding.
7. For every cross-module import in the owner's source, the symbol is
   visible there by a chain in the map, and the importing area's profile
   satisfies the symbol's tags. Non-testing source imports nothing from any
   `src/tests/`.
8. No `module.ramify` under any `src/`; every owner has `README.md` whose
   first top-level paragraph is prose.

## Out of scope, deferred to later plans

- Parser, loader, evaluator, and source checker: Phases 3 and 4, sequenced by
  the [tooling architecture proposal](../tooling-architecture/README.md) once
  it is approved.
- Harness mutations and variants: E02's removed hop, E06, E08, E09, L02,
  L04, L05, L06, O03, O06, O07, R02's parent import of the private task
  helper, T04's renamed registry, T05's invalid declarations, T06's
  forwarding mutations, S05, S06, S07.
- Browser automation, Cucumber, and Jiti fixtures: K01 to K07.
- Host-adapter contracts H01 to H04, the retained policies X01 to X03, and
  the Phase 5 tour.
- The design probes P01 to P06.
