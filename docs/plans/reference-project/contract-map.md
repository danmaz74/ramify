# Reference project: contract map

**Date:** 2026-09-07. **Current through:** iteration 3.

This is the living record of every symbol the reference project exposes: its
owner, its defining file, its kind, its tags, the statements that carry it, and
the modules whose source imports it. The
[implementation plan](implementation.md) proposes each iteration's declarations;
this map records what was built and wins on any disagreement with the plan.
Every iteration ends by updating it.

Paths in the table are relative to `examples/collection-review/`. "Owner" is the
module identifier, so `workspace/contracts` is the owner rooted at
`subs/workspace/subs/contracts/`. The application root is `collection-review`.
An importer written `(tests)` is that owner's `src/tests/` area rather than its
ordinary source.

## Exposed symbols

### Neutral vocabulary

| Symbol | Owner | Defining file | Kind | Tags | Exposing statement(s) | Importers |
| --- | --- | --- | --- | --- | --- | --- |
| `recordIdSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | `workspace/catalog`, `workspace/reviews` |
| `RecordId` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/catalog/core`, `workspace/catalog/core (tests)`, `workspace/reviews`, `workspace/reviews/core`, `workspace/reviews/core/tasks` |
| `revisionSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `Revision` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | — |
| `revisionChainSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | `workspace/catalog/core` |
| `RevisionChain` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/catalog/core`, `workspace/catalog/core (tests)` |
| `revisionScopeSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | `workspace/catalog`, `workspace/reviews` |
| `RevisionScope` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/catalog/core`, `workspace/reviews`, `workspace/reviews/core`, `workspace/reviews/core/tasks` |
| `findingSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `Finding` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/reviews/core`, `workspace/reviews/core/tasks`, `workspace/reviews/core/tasks (tests)`, `workspace/reviews/validation` |
| `inspectionReportSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `InspectionReport` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/catalog/core`, `workspace/reviews/core`, `workspace/reviews/core/controller (tests)`, `workspace/reviews/core/tasks`, `workspace/reviews/core/tasks (tests)`, `workspace/reviews/validation`, `workspace/reviews/validation (tests)` |
| `reviewStatusSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `ReviewStatus` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/reviews/core`, `workspace/reviews/core/tasks` |
| `observationSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `Observation` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/catalog`, `workspace/catalog/core (tests)`, `workspace/reviews/core`, `workspace/reviews/core/tasks` |
| `ObservationCallback` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/catalog/core`, `workspace/reviews/core`, `workspace/reviews/core/tasks` |

### Root protocol vocabulary and test support

| Symbol | Owner | Defining file | Kind | Tags | Exposing statement(s) | Importers |
| --- | --- | --- | --- | --- | --- | --- |
| `InvocationContext` | `collection-review` | `src/interfaces/protocol.ts` | type | `[dispatch]` | R1 | — |
| `ProtocolFacilities` | `collection-review` | `src/interfaces/protocol.ts` | type | `[dispatch]` | R1 | `workspace/catalog`, `workspace/reviews` |
| `McpToolContribution` | `collection-review` | `src/interfaces/protocol.ts` | type | `[dispatch]` | R1 | `workspace/catalog`, `workspace/reviews` |
| `ToolInvocation` | `collection-review` | `src/interfaces/protocol.ts` | type | `[dispatch]` | R1 | `workspace/reviews` |
| `createTestSystem` | `collection-review` | `src/tests/setup.ts` | function (value) | `[testing, dispatch]` | R2 | `workspace/catalog (tests)`, `workspace/reviews (tests)` |

### Catalog

| Symbol | Owner | Defining file | Kind | Tags | Exposing statement(s) | Importers |
| --- | --- | --- | --- | --- | --- | --- |
| `getRecord` | `workspace/catalog/core` | `subs/workspace/subs/catalog/subs/core/src/catalog.ts` | function (value) | `[]` | K1 | `workspace/catalog` |
| `inspect` | `workspace/catalog/core` | `subs/workspace/subs/catalog/subs/core/src/catalog.ts` | function (value) | `[]` | K1, A3 (as `inspectRecord`), W2 | `workspace/catalog`, `collection-review` |
| `CatalogSummary` | `workspace/catalog/core` | `subs/workspace/subs/catalog/subs/core/src/catalog.ts` | type | `[]` | K1 | `workspace/catalog`, `workspace/catalog (tests)` |
| `makeCatalogFixture` | `workspace/catalog/core` | `subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts` | function (value) | `[testing]` | K2, A4, W3 | `workspace/reviews/core (tests)` |
| `createCatalogRouter` | `workspace/catalog` | `subs/workspace/subs/catalog/src/router.ts` | function (value) | `[dispatch]` | A1, W2 | `collection-review` |
| `createCatalogTools` | `workspace/catalog` | `subs/workspace/subs/catalog/src/mcp.ts` | function (value) | `[dispatch]` | A2, W2 | `collection-review` |

### Reviews

| Symbol | Owner | Defining file | Kind | Tags | Exposing statement(s) | Importers |
| --- | --- | --- | --- | --- | --- | --- |
| `validateRevisionChain` | `workspace/reviews/validation` | `subs/workspace/subs/reviews/subs/validation/src/validate.ts` | function (value) | `[]` | VL1, RV4 | `workspace/reviews/core` |
| `runInspectionTask` | `workspace/reviews/core/tasks` | `subs/workspace/subs/reviews/subs/core/subs/tasks/src/inspection-task.ts` | function (value) | `[]` | TK1, RC3 | `workspace/reviews/core/controller` |
| `summarizeTaskResult` | `workspace/reviews/core/tasks` | `subs/workspace/subs/reviews/subs/core/subs/tasks/src/result.ts` | function (value) | `[]` | TK2, RC3 | `workspace/reviews/core/controller` |
| `tick` | `workspace/reviews/core/controller` | `subs/workspace/subs/reviews/subs/core/subs/controller/src/controller.ts` | function (value) | `[]` | CT1 | `workspace/reviews/core` |
| `InspectionPort` | `workspace/reviews/core` | `subs/workspace/subs/reviews/subs/core/src/interfaces/port.ts` | type | `[]` | RC1, RV3, W4 | `workspace/reviews`, `workspace/reviews/core/tasks`, `workspace/reviews/core/tasks (tests)`, `workspace/reviews/core/controller (tests)`, `collection-review` |
| `createReviewRuntime` | `workspace/reviews/core` | `subs/workspace/subs/reviews/subs/core/src/runtime.ts` | function (value) | `[]` | RC2 | `workspace/reviews` |
| `ReviewOutcome` | `workspace/reviews/core` | `subs/workspace/subs/reviews/subs/core/src/runtime.ts` | type | `[]` | RC2 | `workspace/reviews`, `workspace/reviews (tests)` |
| `createReviewsRouter` | `workspace/reviews` | `subs/workspace/subs/reviews/src/router.ts` | function (value) | `[dispatch]` | RV1, W4 | `collection-review` |
| `createReviewsTools` | `workspace/reviews` | `subs/workspace/subs/reviews/src/mcp.ts` | function (value) | `[dispatch]` | RV2, W4 | `collection-review` |

## Exposing statements

| Id | Owner | Statement |
| --- | --- | --- |
| C1 | `workspace/contracts` | `expose-src * from "interfaces/vocabulary.ts" tagged [browser] to parent` |
| W1 | `workspace` | `expose-sub * from contracts to descendants` |
| R1 | `collection-review` | `expose-src InvocationContext, ProtocolFacilities, McpToolContribution, ToolInvocation from "interfaces/protocol.ts" to descendants` |
| R2 | `collection-review` | `expose-test createTestSystem from "setup.ts" to descendants` |
| K1 | `workspace/catalog/core` | `expose-src getRecord, inspect, CatalogSummary from "catalog.ts" to parent` |
| K2 | `workspace/catalog/core` | `expose-test makeCatalogFixture from "fixture.ts" to parent` |
| A1 | `workspace/catalog` | `expose-src createCatalogRouter from "router.ts" to parent` |
| A2 | `workspace/catalog` | `expose-src createCatalogTools from "mcp.ts" to parent` |
| A3 | `workspace/catalog` | `expose-sub inspect as inspectRecord from core to parent` |
| A4 | `workspace/catalog` | `expose-sub makeCatalogFixture from core to parent` |
| VL1 | `workspace/reviews/validation` | `expose-src validateRevisionChain from "validate.ts" to parent` |
| TK1 | `workspace/reviews/core/tasks` | `expose-src runInspectionTask from "inspection-task.ts" to parent` |
| TK2 | `workspace/reviews/core/tasks` | `expose-src summarizeTaskResult from "result.ts" to parent` |
| CT1 | `workspace/reviews/core/controller` | `expose-src tick from "controller.ts" to parent` |
| RC1 | `workspace/reviews/core` | `expose-src InspectionPort from "interfaces/port.ts" to parent, descendants` |
| RC2 | `workspace/reviews/core` | `expose-src createReviewRuntime, ReviewOutcome from "runtime.ts" to parent` |
| RC3 | `workspace/reviews/core` | `expose-sub runInspectionTask, summarizeTaskResult from tasks to descendants` |
| RV1 | `workspace/reviews` | `expose-src createReviewsRouter from "router.ts" to parent` |
| RV2 | `workspace/reviews` | `expose-src createReviewsTools from "mcp.ts" to parent` |
| RV3 | `workspace/reviews` | `expose-sub InspectionPort from core to parent` |
| RV4 | `workspace/reviews` | `expose-sub validateRevisionChain from validation to descendants` |
| W2 | `workspace` | `expose-sub createCatalogRouter, createCatalogTools, inspectRecord from catalog to parent` |
| W3 | `workspace` | `expose-sub makeCatalogFixture from catalog to descendants` |
| W4 | `workspace` | `expose-sub createReviewsRouter, createReviewsTools, InspectionPort from reviews to parent` |

C1 is an interface-file wildcard, so the seventeen vocabulary rows are its
expansion, not seventeen declarations. An export added to `vocabulary.ts` joins
the contract, and W1's child-contract wildcard relays it onward, without either
description changing.

W1 makes the vocabulary visible in every proper descendant of `workspace`,
which is every other owner except the application root. The root receives
nothing from this chain: C1 exposes to `contracts`' parent only, and `workspace`
does not expose the vocabulary upward.

Each vocabulary symbol's tags are `[browser]` exactly. `contracts` declares no
header tags, so its ordinary source has no required-importer tags and its
bindings default to the empty set; C1's clause adds the owner's promise that the
vocabulary and the schema library behind it are browser-safe. That promise is
what will let the browser-classified shell and view owners value-import the
schemas, while the absence of `ui` and `dispatch` keeps the vocabulary
importable by the untagged core owners as well — as `catalog/core` and every
owner of the review runtime now do, from untagged source areas.

R1's four symbols default to `[dispatch]`, the root's only header tag. That is
what keeps the protocol vocabulary out of the core owners, the validator and
the pure view: they are within the exposure's reach and can never import it, in
either import form.

R2's `createTestSystem` is a newly defined binding in the root's `src/tests/`,
whose profile is `[testing, dispatch]`, so those are its default tags. Both are
required-importer tags, so only a `[testing, dispatch]` area can import it; the
root's own production source could not, and neither can any descendant's. The
two feature adapters' test areas have that profile and use it; the review
runtime's test areas, whose profile is `[testing]`, do not.

A3 renames the exposure, not the binding. `inspectRecord` and `inspect` are the
same original symbol, owned by `workspace/catalog/core` with tags `[]`; the root
receives it under the alias and its own source imports the original file under
its original name.

K2, A4 and W3 carry a `[testing]`-tagged symbol through two owners whose
ordinary source could not import it. Forwarding requires visibility, not
importability, so the relay is legal and the restriction survives it.

RC1 is the only statement in the tree with two destinations on one line. The
port is one symbol with one role on both sides: upward it is part of the
runtime's contract, so the application can build something that satisfies it,
and downward it is what the task and the controller work against.

RC3 is the whole route between the two children of `workspace/reviews/core`.
`tasks` exposes its operations to its parent, and the parent sends them back
down into its own subtree, which is how the controller reaches its sibling.
Nothing travels the other way: CT1 exposes `tick` to parent only, so `tasks`
cannot import the controller that schedules it.

RV4 is the mirror of that arrangement across a wider gap. `validation` is not in
the runtime's subtree at all; it exposes upward to `reviews`, which sends the
rules back down to the runtime that calls them. Because RC1 and RC2 stop at
`workspace/reviews`, nothing owned by the runtime or its children is visible in
`validation` — not the port, not the runtime, not the outcome, and not the task
operations. It can import neither their behaviour nor their types.

`ReviewOutcome` likewise stops at `workspace/reviews`, whose adapters name it.
It is never exposed downward, so the review views of iteration 4 will receive
values and props rather than the runtime's own type.

## Symbols exported but deliberately not exposed

These are exported TypeScript symbols that no statement selects. They stay
private to their owner, and a consumer that needs one builds it through
contextual typing instead.

| Symbol | Owner | Defining file | Why it stays private |
| --- | --- | --- | --- |
| `ToolInputSchema`, `ToolResult` | `collection-review` | `src/interfaces/protocol.ts` | Two of the shapes `McpToolContribution` is written in. Exposing a contract does not expose the types its signature mentions; both features build a contribution without naming them. |
| `AssembledSystem`, `AppRouter`, `assembleSystem` | `collection-review` | `src/assembly.ts` | The root's own composition. `AppRouter` reaches the browser in iteration 4 through a forwarding alias in `src/interfaces/protocol.ts`. |
| `createFacilities`, `createMcpServer` | `collection-review` | `src/protocol.ts` | The configured runtimes themselves. Features receive facilities as an argument rather than importing a singleton. |
| `CatalogRecord`, `listRecords`, `findRecord` | `workspace/catalog/core` | `.../catalog/subs/core/src/records.ts` | The fixed records are this owner's private data. |
| `PredecessorResolution`, `resolvePredecessors` | `workspace/catalog/core` | `.../catalog/subs/core/src/history.ts` | The private history helper of case O01: this owner's own `src/tests/` reads it directly, and no other owner can. |
| `CatalogFixtureRecord` | `workspace/catalog/core` | `.../catalog/subs/core/src/tests/fixture.ts` | The fixture's element type. Only `makeCatalogFixture` is exposed. |
| `McpSession`, `TestSystem` | `collection-review` | `src/tests/setup.ts` | The setup's own result types; a foreign test infers them from `createTestSystem`. |
| `collectObservations`, `InspectionTaskInput`, `InspectionTaskResult` | `workspace/reviews/core/tasks` | `.../core/subs/tasks/src/inspection-task.ts` | The task's private observation collector and the shapes of its own signature. This owner's tests read the collector directly; the controller above derives the input type from `runInspectionTask` rather than naming it. |
| `TaskSummary` | `workspace/reviews/core/tasks` | `.../core/subs/tasks/src/result.ts` | The summary's shape. The controller derives it from `summarizeTaskResult`, and the runtime declares its own `ReviewOutcome` instead. |
| `ReviewRuntime` | `workspace/reviews/core` | `.../reviews/subs/core/src/runtime.ts` | The factory's result type. Its adapters hold the runtime the factory returns and never name the type. |
| `SessionBinding`, `SessionBindingRequest`, `SessionTable`, `createSessionTable` | `workspace/reviews` | `.../reviews/src/session.ts` | The review-session table is this feature's own state. `createReviewsTools` creates the one instance the application uses, and only this owner's tests reach the factory. |

## Iteration log

### Iteration 1 — package, tree, descriptions, documentation

All fourteen owners exist on disk with a `module.ramify` and a `README.md`
whose first top-level paragraph is prose. The example installs, type-checks,
tests, and builds on its own, and `dev:web` serves the static shell.

Added to the map: the seventeen `vocabulary.ts` exports carried by C1, and the
`workspace` relay W1. Nothing else is exposed yet; the other twelve owners
declare a header and no exposure statement.

### Iteration 2 — catalog capability through both protocols

`catalog.get` answers through the configured tRPC runtime and `catalog.inspect`
through the MCP server, in process and over HTTP. The root owns the two
configured runtimes and an MCP server factory called once per connection; the
catalog feature owns its argument parsing and result adaptation; `catalog/core`
owns the two fixed records, the summary, the inspection, and one private
history helper its own tests read directly.

Added to the map: R1, R2, K1, K2, A1 to A4, W2 and W3, with the ten symbols they
carry. The importer column of the vocabulary rows is filled for the first time:
nine of its seventeen symbols now cross an owner boundary, and the other eight
remain exposed and unused, which is exactly what the model permits.

Two departures from the plan's iteration 2 table are recorded here rather than
in the plan:

- `inspect` returns `InspectionReport | undefined` and `getRecord` returns
  `CatalogSummary | undefined`. Neither core operation raises; turning a missing
  record into a `NOT_FOUND` error or an MCP error result is an adapter's
  decision.
- `src/interfaces/protocol.ts` exports three more types than R1 selects. They
  are listed under [symbols exported but deliberately not
  exposed](#symbols-exported-but-deliberately-not-exposed). If iteration 3's
  review adapters need to name `ToolInvocation`, R1 grows by one name and
  nothing else changes.

### Iteration 3 — review runtime, validation, adapters, sessions

`reviews.run` answers through both surfaces. The review runtime is assembled
from its own children through exposures alone: `validation` supplies the rules
from outside the runtime's subtree, `tasks` supplies the work, `controller`
supplies the one supervisor step, and `reviews/core` puts them together behind
an inspection port it owns. The review feature's own source is the tRPC router,
the MCP tool and the session table behind it. The root builds the port out of
the catalog's inspection and mounts both features.

Added to the map: VL1, TK1, TK2, CT1, RC1 to RC3, RV1 to RV4 and W4, with the
nine symbols they carry, plus `ToolInvocation` joining R1 as iteration 2
anticipated. Every one of the seventeen vocabulary rows that a review owner
uses gains importers, and `makeCatalogFixture` gains its first: the review
runtime's own integration test builds the inspection port out of the catalog's
fixture data, which is the first time the K2–A4–W3 relay carries a symbol into
a foreign test.

Three departures from the plan's iteration 3 text are recorded here.

- `McpToolContribution` produces its descriptor per invocation:
  `describe(invocation)` replaces the former `description` and `inputSchema`
  fields, and the root's `tools/list` handler builds the same invocation from
  the request context that its `tools/call` handler does. A tool whose
  description depends on the session could not otherwise re-resolve its binding
  on a listing, which case D03 requires. Catalog's contribution ignores the
  argument and returns its static descriptor; the root still parses no business
  arguments and reads no descriptor field before a listing asks for one.
- `tick` returns `undefined` when the task it ran inspected nothing, and
  `createReviewRuntime(port).run` therefore answers `ReviewOutcome | undefined`.
  The summary a task produces carries findings but not the report, so a caller
  cannot otherwise tell a failed review from a review of a record that does not
  exist. This keeps the convention iteration 2 established — a core operation
  answers `undefined` and an adapter decides — and leaves `ReviewOutcome` itself
  exactly as the plan describes it. `summarizeTaskResult` keeps its own rule
  that a result with no report is a failed review, and its tests exercise it
  directly.
- `validateRevisionChain` adds a second deterministic rule, for a revision id
  the chain records twice, so that validation owns a rule set rather than a
  single finding. The missing-predecessor finding is unchanged and remains the
  one the whole application demonstrates.
