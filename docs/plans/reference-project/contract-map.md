# Reference project: contract map

**Date:** 2026-09-07. **Current through:** iteration 5.
**Status:** complete for the baseline. Every owner, statement and exposed symbol
of the reference project is recorded below, and all fifteen descriptions have
passed the plan's [description review checklist](implementation.md#description-review-checklist).
A later iteration extends this map; it does not start a new one.

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
| `RecordId` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/catalog/core`, `workspace/catalog/core (tests)`, `workspace/reviews`, `workspace/reviews/core`, `workspace/reviews/core/tasks`, `workspace/reviews/ui/pure-ui` |
| `revisionSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `Revision` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | — |
| `revisionChainSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | `workspace/catalog/core` |
| `RevisionChain` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/catalog/core`, `workspace/catalog/core (tests)` |
| `revisionScopeSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | `workspace/catalog`, `workspace/reviews` |
| `RevisionScope` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/catalog/core`, `workspace/reviews`, `workspace/reviews/core`, `workspace/reviews/core/tasks` |
| `findingSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `Finding` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/reviews/core`, `workspace/reviews/core/tasks`, `workspace/reviews/core/tasks (tests)`, `workspace/reviews/validation`, `workspace/reviews/ui/pure-ui` |
| `inspectionReportSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `InspectionReport` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/catalog/core`, `workspace/reviews/core`, `workspace/reviews/core/controller (tests)`, `workspace/reviews/core/tasks`, `workspace/reviews/core/tasks (tests)`, `workspace/reviews/validation`, `workspace/reviews/validation (tests)` |
| `reviewStatusSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `ReviewStatus` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/reviews/core`, `workspace/reviews/core/tasks`, `workspace/shared-ui`, `workspace/reviews/ui/pure-ui` |
| `observationSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `Observation` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/catalog`, `workspace/catalog/core (tests)`, `workspace/reviews/core`, `workspace/reviews/core/tasks`, `workspace/reviews/ui/pure-ui` |
| `ObservationCallback` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | `workspace/catalog/core`, `workspace/reviews/core`, `workspace/reviews/core/tasks` |

### Root protocol vocabulary and test support

| Symbol | Owner | Defining file | Kind | Tags | Exposing statement(s) | Importers |
| --- | --- | --- | --- | --- | --- | --- |
| `InvocationContext` | `collection-review` | `src/interfaces/protocol.ts` | type | `[dispatch]` | R1 | — |
| `ProtocolFacilities` | `collection-review` | `src/interfaces/protocol.ts` | type | `[dispatch]` | R1 | `workspace/catalog`, `workspace/reviews` |
| `McpToolContribution` | `collection-review` | `src/interfaces/protocol.ts` | type | `[dispatch]` | R1 | `workspace/catalog`, `workspace/reviews` |
| `ToolInvocation` | `collection-review` | `src/interfaces/protocol.ts` | type | `[dispatch]` | R1 | `workspace/reviews` |
| `AppRouter` | `collection-review` | `src/assembly.ts` | type | `[dispatch]` | R3 | `workspace`, `workspace (tests)`, `workspace/reviews/ui` |
| `createTestSystem` | `collection-review` | `src/tests/setup.ts` | function (value) | `[testing, dispatch]` | R2 | `workspace (tests)`, `workspace/catalog (tests)`, `workspace/reviews (tests)`, `workspace/reviews/ui (tests)`, `integration-tests` (its ordinary `src/`, testing-classified by its header) |

### Catalog

| Symbol | Owner | Defining file | Kind | Tags | Exposing statement(s) | Importers |
| --- | --- | --- | --- | --- | --- | --- |
| `getRecord` | `workspace/catalog/core` | `subs/workspace/subs/catalog/subs/core/src/catalog.ts` | function (value) | `[]` | K1 | `workspace/catalog` |
| `inspect` | `workspace/catalog/core` | `subs/workspace/subs/catalog/subs/core/src/catalog.ts` | function (value) | `[]` | K1, A3 (as `inspectRecord`), W2 | `workspace/catalog`, `collection-review` |
| `CatalogSummary` | `workspace/catalog/core` | `subs/workspace/subs/catalog/subs/core/src/catalog.ts` | type | `[]` | K1, A5 | `workspace/catalog`, `workspace/catalog (tests)`, `workspace/catalog/ui` |
| `makeCatalogFixture` | `workspace/catalog/core` | `subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts` | function (value) | `[testing]` | K2, A4, W3 | `workspace/reviews/core (tests)` |
| `createCatalogRouter` | `workspace/catalog` | `subs/workspace/subs/catalog/src/router.ts` | function (value) | `[dispatch]` | A1, W2 | `collection-review` |
| `createCatalogTools` | `workspace/catalog` | `subs/workspace/subs/catalog/src/mcp.ts` | function (value) | `[dispatch]` | A2, W2 | `collection-review` |
| `CatalogCard` | `workspace/catalog/ui` | `subs/workspace/subs/catalog/subs/ui/src/catalog-card.tsx` | component (value) | `[ui, browser]` | KU1, A6 | `workspace` |

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
| `ReviewResult` | `workspace/reviews/ui/pure-ui` | `subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx` | component (value) | `[ui, browser]` | PU1 | `workspace/reviews/ui`, `workspace/reviews/ui (tests)` |
| `ReviewResultProps` | `workspace/reviews/ui/pure-ui` | `subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx` | type | `[ui, browser]` | PU1 | `workspace/reviews/ui` |
| `ReviewPanel` | `workspace/reviews/ui` | `subs/workspace/subs/reviews/subs/ui/src/review-panel.tsx` | component (value) | `[ui, dispatch, browser]` | RU1, RV5 | `workspace`, `workspace (tests)` |

### Shared UI

| Symbol | Owner | Defining file | Kind | Tags | Exposing statement(s) | Importers |
| --- | --- | --- | --- | --- | --- | --- |
| `StatusBadge` | `workspace/shared-ui` | `subs/workspace/subs/shared-ui/src/status-badge.tsx` | component (value) | `[ui, browser]` | SU1, W5 | `workspace/catalog/ui`, `workspace/reviews/ui/pure-ui` |
| `StatusBadgeProps` | `workspace/shared-ui` | `subs/workspace/subs/shared-ui/src/status-badge.tsx` | type | `[ui, browser]` | SU1, W5 | — |

## Exposing statements

| Id | Owner | Statement |
| --- | --- | --- |
| C1 | `workspace/contracts` | `expose-src * from "interfaces/vocabulary.ts" tagged [browser] to parent` |
| W1 | `workspace` | `expose-sub * from contracts to descendants` |
| R1 | `collection-review` | `expose-src InvocationContext, ProtocolFacilities, McpToolContribution, ToolInvocation from "interfaces/protocol.ts" to descendants` |
| R2 | `collection-review` | `expose-test createTestSystem from "setup.ts" to descendants` |
| R3 | `collection-review` | `expose-src AppRouter from "interfaces/protocol.ts" to descendants` |
| K1 | `workspace/catalog/core` | `expose-src getRecord, inspect, CatalogSummary from "catalog.ts" to parent` |
| K2 | `workspace/catalog/core` | `expose-test makeCatalogFixture from "fixture.ts" to parent` |
| A1 | `workspace/catalog` | `expose-src createCatalogRouter from "router.ts" to parent` |
| A2 | `workspace/catalog` | `expose-src createCatalogTools from "mcp.ts" to parent` |
| A3 | `workspace/catalog` | `expose-sub inspect as inspectRecord from core to parent` |
| A4 | `workspace/catalog` | `expose-sub makeCatalogFixture from core to parent` |
| A5 | `workspace/catalog` | `expose-sub CatalogSummary from core to descendants` |
| A6 | `workspace/catalog` | `expose-sub CatalogCard from "ui" to parent` |
| KU1 | `workspace/catalog/ui` | `expose-src CatalogCard from "catalog-card.tsx" tagged [ui, browser] to parent` |
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
| RV5 | `workspace/reviews` | `expose-sub ReviewPanel from "ui" to parent` |
| RU1 | `workspace/reviews/ui` | `expose-src ReviewPanel from "review-panel.tsx" tagged [ui, dispatch, browser] to parent` |
| PU1 | `workspace/reviews/ui/pure-ui` | `expose-src ReviewResult, ReviewResultProps from "review-result.tsx" tagged [ui, browser] to parent` |
| SU1 | `workspace/shared-ui` | `expose-src StatusBadge, StatusBadgeProps from "status-badge.tsx" tagged [ui, browser] to parent` |
| W2 | `workspace` | `expose-sub createCatalogRouter, createCatalogTools, inspectRecord from catalog to parent` |
| W3 | `workspace` | `expose-sub makeCatalogFixture from catalog to descendants` |
| W4 | `workspace` | `expose-sub createReviewsRouter, createReviewsTools, InspectionPort from reviews to parent` |
| W5 | `workspace` | `expose-sub * from shared-ui to descendants` |

C1 is an interface-file wildcard, so the seventeen vocabulary rows are its
expansion, not seventeen declarations. An export added to `vocabulary.ts` joins
the contract, and W1's child-contract wildcard relays it onward, without either
description changing.

W1 makes the vocabulary visible in every proper descendant of `workspace`,
which is every other owner except the application root. The root receives
nothing from this chain: C1 exposes to `contracts`' parent only, and `workspace`
does not expose the vocabulary to its parent.

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
port is one symbol with one role on both sides: to the parent it is part of the
runtime's contract, so the application can build something that satisfies it,
and to the descendants it is what the task and the controller work against.

RC3 is the whole path between the two children of `workspace/reviews/core`.
`tasks` exposes its operations to its parent, and the parent exposes them
to its own descendants, which is how the controller reaches its sibling.
Nothing travels the other way: CT1 exposes `tick` to parent only, so `tasks`
cannot import the controller that schedules it.

RV4 is the mirror of that arrangement across a wider gap. `validation` is not in
the runtime's subtree at all; it exposes to its parent `reviews`, which exposes the
rules to its descendants, reaching the runtime that calls them. Because RC1 and RC2 stop at
`workspace/reviews`, nothing owned by the runtime or its children is visible in
`validation` — not the port, not the runtime, not the outcome, and not the task
operations. It can import neither their behaviour nor their types.

`ReviewOutcome` likewise stops at `workspace/reviews`, whose adapters name it.
It is never exposed to descendants, so the review views receive values and props
rather than the runtime's own type. The connected panel maps the client's
inferred `reviews.run` output onto `ReviewResultProps` without naming the
outcome at all, and nothing below `workspace/reviews` can name it in either
import form.

R3 is the tree's second same-owner forwarding alias, after A3's rename. The
original `AppRouter` is declared in the root's private `src/assembly.ts`;
`src/interfaces/protocol.ts` re-exports it with `export type { AppRouter } from
'../assembly.js'`, and R3 selects that export. The alias is not a new binding,
so the symbol keeps the root's ownership and its `[dispatch]` tag, and the
assembly file itself stays unexposed. No `browser` promise accompanies it,
which is exactly right: both importers take it as a type. The shell's
`client.ts` uses the statement-level `import type` form and the connected panel
the inline `import { type AppRouter }` form; the required-symbol rule reaches
neither, while `dispatch` reaches both and keeps the router type out of the
untagged core owners and the pure view that can see it.

SU1 and W5 are the shared-UI path. `shared-ui` exposes the badge and its props
to its parent, and `workspace` relays the child's whole to-parent contract to every
descendant. Both feature views import the badge as a value: they carry `ui`, so
the required-importer rule passes, and they carry `browser`, so the owner's
`browser` promise is what makes the value import legal. Every core owner in the
tree receives the same symbols from the same statement and can import neither,
in either form, because no core source carries `ui`.

A5 and A6 are the catalog's two directions. The summary type is exposed to the
catalog's own view child, which renders it; the card reaches the shell, which
composes it. Neither reaches the other feature: `CatalogSummary` stops inside
the catalog's subtree, and `CatalogCard` stops at `workspace`. The shell
therefore names no catalog type at all — it derives the shape it passes from the
router type it already has.

PU1, RU1 and RV5 are the same arrangement on the review side, one level deeper.
The pure view exposes its component and its own props to the connected parent;
the connected parent exposes only the component to its parent, and the feature relays
it to the shell. `ReviewPanel` carries `dispatch` as well as `ui`, because its
defining area does: the shell can import it and no pure view could, whatever
else it carried.

## Owned resources

Application resources follow the ordinary rules. These two are owned bindings of
their views, exposed by nothing, imported by their owners alone.

| Resource | Owner | Defining file | Binding | Tags | Exposed | Importers |
| --- | --- | --- | --- | --- | --- | --- |
| Catalog card styles | `workspace/catalog/ui` | `subs/workspace/subs/catalog/subs/ui/src/catalog-card.module.css` | `default` | `[ui]` | no | `workspace/catalog/ui` (same owner) |
| Review result styles | `workspace/reviews/ui/pure-ui` | `subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.module.css` | `default` | `[ui]` | no | `workspace/reviews/ui/pure-ui` (same owner) |

One ambient declaration in `vite/client` describes both files, and it is not
their owner: each resource's binding belongs to the module whose `src/` contains
it, with an identity of its own. Their default tags are their defining area's
required-importer tags, which is `[ui]` in both cases; `browser` is not assigned
automatically, and neither resource needs it, because only its own owner imports
it. The application stylesheet `subs/workspace/src/styles.css` is a third
resource, loaded by `main.tsx` for its side effect and selecting no binding at
all.

## Symbols exported but deliberately not exposed

These are exported TypeScript symbols that no statement selects. They stay
private to their owner, and a consumer that needs one builds it through
contextual typing instead.

| Symbol | Owner | Defining file | Why it stays private |
| --- | --- | --- | --- |
| `ToolInputSchema`, `ToolResult` | `collection-review` | `src/interfaces/protocol.ts` | Two of the shapes `McpToolContribution` is written in. Exposing a contract does not expose the types its signature mentions; both features build a contribution without naming them. |
| `AssembledSystem`, `assembleSystem` | `collection-review` | `src/assembly.ts` | The root's own composition. `AppRouter` is declared here too and is the one export of this file that leaves the owner, through the forwarding alias R3 selects in `src/interfaces/protocol.ts`. |
| `createFacilities`, `createMcpServer` | `collection-review` | `src/protocol.ts` | The configured runtimes themselves. Features receive facilities as an argument rather than importing a singleton. |
| `startApiServer`, `ApiServer`, `ApiServerOptions` | `collection-review` | `src/server.ts` | The listener, and the shape of what it answers with. `src/main.ts` is the entry that chooses a port and calls it; this owner's own HTTP test is the only other caller, and nothing below the root needs to start a server. |
| `CatalogRecord`, `listRecords`, `findRecord` | `workspace/catalog/core` | `.../catalog/subs/core/src/records.ts` | The fixed records are this owner's private data. |
| `PredecessorResolution`, `resolvePredecessors` | `workspace/catalog/core` | `.../catalog/subs/core/src/history.ts` | The private history helper of case O01: this owner's own `src/tests/` reads it directly, and no other owner can. |
| `CatalogFixtureRecord` | `workspace/catalog/core` | `.../catalog/subs/core/src/tests/fixture.ts` | The fixture's element type. Only `makeCatalogFixture` is exposed. |
| `McpSession`, `TestSystem` | `collection-review` | `src/tests/setup.ts` | The setup's own result types; a foreign test infers them from `createTestSystem`. |
| `collectObservations`, `InspectionTaskInput`, `InspectionTaskResult` | `workspace/reviews/core/tasks` | `.../core/subs/tasks/src/inspection-task.ts` | The task's private observation collector and the shapes of its own signature. This owner's tests read the collector directly; the controller above derives the input type from `runInspectionTask` rather than naming it. |
| `TaskSummary` | `workspace/reviews/core/tasks` | `.../core/subs/tasks/src/result.ts` | The summary's shape. The controller derives it from `summarizeTaskResult`, and the runtime declares its own `ReviewOutcome` instead. |
| `ReviewRuntime` | `workspace/reviews/core` | `.../reviews/subs/core/src/runtime.ts` | The factory's result type. Its adapters hold the runtime the factory returns and never name the type. |
| `SessionBinding`, `SessionBindingRequest`, `SessionTable`, `createSessionTable` | `workspace/reviews` | `.../reviews/src/session.ts` | The review-session table is this feature's own state. `createReviewsTools` creates the one instance the application uses, and only this owner's tests reach the factory. |
| `createClient` | `workspace` | `subs/workspace/src/client.ts` | The shell builds its own client and hands it to the views it composes. A view that could build one would be choosing its own transport. |
| `App`, `Shell`, `loadShell` | `workspace` | `subs/workspace/src/app.tsx` | The screen itself. Nothing is above `workspace` that renders it, and nothing below it composes the screen; only this owner's tests read `Shell` and `loadShell`. |
| `loadReview` | `workspace/reviews/ui` | `.../reviews/subs/ui/src/review-panel.tsx` | The panel's own loading step, separated from rendering so this owner's tests can drive it. What this owner publishes is a component, not a second way to call the API. |
| `formatFinding` | `workspace/reviews/ui/pure-ui` | `.../ui/subs/pure-ui/src/format.ts` | The private formatting of case O04: this view's wording is its own decision, and only its own tests read the function directly. |

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

### Iteration 4 — browser shell and views

The browser shows both records as cards and runs a review from a connected
panel, through the typed client the shell builds from the router type alone.
`shared-ui` supplies the one primitive both feature views render; each feature
owns its view and sends it toward the shell; the review view is split into a
connected panel and a pure result, so the runtime's own outcome type reaches no
view at all.

Added to the map: R3, SU1, W5, A5, A6, KU1, PU1, RU1 and RV5, with the six
symbols they carry, plus the two CSS-module resources the views own. Four
vocabulary rows gain their first browser-classified importers, `CatalogSummary`
gains its view, and `createTestSystem` gains the two test areas that render
components against the real configured system.

Four departures from the plan's iteration 4 text are recorded here.

- The shell does not name `CatalogSummary`. A5 exposes that type to `catalog`'s
  descendants, not its parent, so it is not visible in `workspace`; the shell
  derives the summary shape from the router type it already holds, exactly as
  the connected panel derives the review's shape rather than naming
  `ReviewOutcome`. Both views still receive the values the API returned.
- `CatalogCard` and `ReviewPanel` keep their props types as unexported local
  interfaces. Only a props type another owner constructs needs to be a symbol,
  and both of these are supplied by JSX contextual typing. `StatusBadgeProps`
  and `ReviewResultProps` are exported and exposed because they name a contract
  a different owner writes to; `ReviewResultProps` is what the connected panel
  builds, and `StatusBadgeProps` is exposed alongside its component and so far
  imported by nobody, which the model permits.
- `StatusBadge` has no stylesheet of its own. It carries the plain class name
  the application stylesheet styles, so one badge looks the same wherever a
  feature places it, and the two CSS modules stay what case S04 describes: two
  resources of two different owners under one ambient declaration.
- The catalog card's badge reports whether the record has a recorded history,
  not a review verdict. A pure card knows nothing about reviews, and giving it
  a verdict would have meant giving it something to fetch.

### Iteration 5 — test completion, harness inventory, independence

Every owner has owned tests, the listener answers over a real socket, the case
inventory exists as harness data, and the package is proven independent of the
repository around it.

Added to the map: `startApiServer` and its two result types, under [symbols
exported but deliberately not
exposed](#symbols-exported-but-deliberately-not-exposed). No exposure statement
was added or changed in this iteration: the baseline's contract is exactly what
iterations 1 to 4 built, and this iteration only exercised it.

One correction to the map: `ReviewPanel` gains `workspace (tests)` as an
importer. The shell's test names the component in a type query
(`typeof import(...).ReviewPanel`) to derive the props it must be handed. That
is a cross-owner type-only import like any other, and the shell's test profile
`[testing, ui, dispatch]` satisfies the symbol's `ui` and `dispatch` tags; the
`browser` promise the symbol also carries is a required-symbol tag and does not
reach a type-only request, which is why a Node test area can name a browser
component it could never value-import.

Four notes on what this iteration did and did not establish.

- The listener moved out of the entry. `src/main.ts` now chooses the port and
  calls `startApiServer` from the new same-owner `src/server.ts`; everything the
  process serves is created inside that one call. The root's `src/tests/`
  therefore starts the actual program on port 0, calls `catalog.get` and
  `reviews.run` over HTTP through a real typed client, and opens two MCP
  sessions with the SDK's streamable HTTP transport. Those two sessions are
  identified by ids the transport generated rather than ids a test chose, and
  each one's listing and call snapshot reads its own binding. That is case D03's
  strongest witness and it now runs in about a second.
- All fourteen owners already had tests at the end of iteration 4, so no test
  was added to fill a gap; the HTTP test is the only new one.
- The fourteen descriptions were re-checked against the plan's checklist, one
  point at a time, and the tree was scanned for the two rules a grep can settle:
  no non-testing source imports anything from any `src/tests/`, and no file in
  the example resolves an import outside the package. Both hold, and the
  importer columns above were rebuilt from that scan.
- `scripts/reference-harness/` holds one record per case family and a report
  that runs this package's application tier. Three families are reported as
  passed, all of them protocol-tier: D01, D02 and D03. Every other family is
  **not executed**, because the capability its expectation needs — the loader,
  the evaluator's source areas and custom registry, the resolver, the source
  checker, the browser suite or a host adapter — does not exist. The three
  retained policies are recorded as deliberately unsupported and the six design
  probes as undecided.

### Post-baseline — the Cucumber scenario

Cucumber scenario added, first under the root's `src/tests/features/` and then,
the same day, moved into a fifteenth owner: `integration-tests`, a separately
declared testing module under the root's `subs/` with header
`[testing, dispatch]` and its test code in ordinary `src/`. The module exposes
nothing and adds no statement. Its one foreign import is `createTestSystem`,
which R2 already makes visible in every descendant; the symbol's
`[testing, dispatch]` tags are what force both header tags, and the header's
`testing` is what lets ordinary source import testing-classified source at all.
The setup's result types stay unexposed, so the World reads them off the
exposed function. R2's importer column gains the new owner; no other row
changes. It is case K05's fixture and the baseline witness for O07's positive
half, and the harness runs it.
