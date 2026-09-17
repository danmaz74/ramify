# Iteration 5 results: Relay dependency views in the explorer server

**Date:** 2026-09-17. **Mode:** direct work in worktree `/tmp/ramify-plan6d-behavioral-diagram`,
branch `feat/plan6d-behavioral-dependency-diagram`. It is based on iteration 4 at `2bada8c`.
The implementation commit is `da371aa`. The BD28 artifacts were recorded from a build of that clean commit.

## Prerequisites

- Iteration 4's client method `ServiceConnection.dependencyDiagram` and its outcomes are present. Root R7 relays
  `DependencyDiagramRequest` and `ContextDependencyDiagramOutcome`; R9 relays `DependencyDiagramFacts`.
- The existing `project-view.test.ts`, `project-binding.test.ts`, `web-process.test.ts`, `explorer-router.test.ts` and
  explorer page tests passed before any of their files changed.

## Built

### `service-api [dispatch]`

- `src/interfaces/explorer-dependencies.ts` holds the C5 and C6 types:
  - `ExplorerDependencyModel` and its parts, and `ExplorerDependencyModelOutcome`;
  - `DependencyViewResult`;
  - `ExplorerDependencyModelInput` and `DependencyViewInput`, which name the function and procedure inputs.

  `module.ramify` exposes the file with `expose-src *` to the parent.
- `src/dependency-model.ts` implements the pure `createExplorerDependencyModel` and exports `maximumDependencyViewBytes`
  (16 MiB) and `dependencyEdgeId`. Its only runtime import is `node:crypto`.
  - **Identity.** A diagram whose `inputId` differs from `revision.fingerprints.inputId` is refused as
    `identity-mismatch`.
  - **Units.** Boundary facts are grouped by `(consumer, original)`, using the full `OriginalId` as the original's
    identity, and settled with the fixed precedence: behavioral, then unknown, then non-behavioral. Settled known units
    form `project`, the consumer's `uses`, the owner's `ownedUsedByOthers` and the original-owner edges. Unknown units
    add no count.
  - **Headline check.** Unless the aggregated project counts equal `diagram.headline`, the diagram is refused as
    `inconsistent-counts`. The same reason refuses a fact naming a module absent from `diagram.modules`, a fact whose
    consumer owns the original, and two facts that disagree on an original's owner.
  - **Imported edges.** Each known boundary fact whose consumer differs from its imported module is one
    `(consumer, imported module, original)` unit. It counts in its imported edge, that edge's `originalOwners`
    breakdown and the imported module's `usedThrough`. A self-barrel fact makes no imported edge, but still supports
    its original-owner dependency and appears in that edge's `importedThrough` breakdown as the consumer itself.
  - **Owner edges.** An original-owner edge's `importedThrough` counts each known boundary fact of its known units by
    that fact's own classification. Its evidence lists those facts.
  - **Evidence.** Every row copies status, reasons, all three file lists, access IDs and `limitIds` (as `coverageIds`)
    from its boundary fact. Unknown facts never appear as evidence.
  - **Order and IDs.** Modules are in ID byte order with one row each, zero rows included. Edges are ordered by
    consumer, then provider. Breakdowns are ordered by module ID, and evidence by original identity, then imported
    module. Edge IDs are `dependency-edge/1:<projection>:<sha256 hex of JSON([consumer, provider])>`.
  - **Size.** The model's encoded UTF-8 bytes are returned as `encodedBytes`. A model above `maxBytes` is refused as
    `resource-limit`; the message names the observed and maximum bytes. No partial model is returned.
- `src/dependency-view.ts` implements `createDependencyViews({ binding, requestId?, now?, maxBytes? })`, the per-binding
  state, and exports `dependencyBusyMemoryMs` (1,000):
  - **Order.** `view({ revision })` follows the main plan's router table:
    1. A binding that is not ready is `unavailable` with the binding's reason.
    2. `contextStatus` supplies the published revision. A request for any other revision, including one from an
       earlier generation or before any publication, is `superseded` with the current revision or null.
    3. A settled DTO for the revision is `ready` when the published revision, the DTO's revision and the model's input
       ID agree.
    4. An in-flight request for the revision is `pending/analyzing`.
    5. A `busy` answer for the revision less than one second old is `pending/waiting`.
    6. Otherwise one daemon request starts without being awaited, and the answer is `pending/analyzing`.
  - **Settlement.** A `ready` outcome is mapped and retained as the one settled DTO. `busy` (either reason) is remembered
    with its time. `superseded` is retained for that revision and returned to every later request for it, and is never
    retried. `unavailable`, a service error, a thrown call and a mapping refusal become an `unavailable` answer, which is
    delivered once and then cleared. `cancelled` stores nothing.
  - **Bounds.** At most one in-flight request and one settled answer exist, both for the newest published revision a
    request named. Any request, `revision-published` event or `context-evicted` event keeps only state for the current
    published revision: another in-flight request is aborted, and another settled DTO or busy memory is released. A late
    answer for an aborted request is discarded. The state creates no timer.
  - **Close.** `close()` unsubscribes from the binding, aborts the in-flight request, releases the DTO and busy memory,
    and answers later requests `unavailable`.
  - **Observation.** `status()` returns `closed`, `inFlight`, `settled` (revision and encoded bytes), `busy` and the
    counters `daemonRequests`, `aborted`, `released`, `busyAnswers`, `readyAnswers`, `supersededAnswers` and
    `unavailableAnswers`.
- `src/router.ts` adds `dependencyView`. Its input is exactly `z.strictObject({ revision })` with the existing revision
  format. `ExplorerRouterOptions.dependencyViews` accepts the state; without one, the router creates its own. The
  binding-state reason moved to `project-binding.ts` as `unavailableReason`. The other three procedures are unchanged.
- `src/project-binding.ts` adds `ProjectBinding.observe(listener)`, which forwards the bound context's events to
  observers and returns a release. Observers are cleared on close, and a throwing observer never changes the binding.
- `src/web-process.ts` creates one state per process and passes it to the router. It exposes the state as
  `ExplorerWebProcess.dependencyViews`, and closes it first on `close()` and on a failed listen.
- `README.md` describes the fourth procedure.

### Root, explorer and descriptions

- Root `module.ramify` adds P9, which relays the eleven C5/C6 type names from `service-api` to descendants.
- `src/explorer-entry.ts` gives its deferred binding an `observe` method. Once the real binding exists, its events are
  forwarded to those observers.
- `subs/explorer/src/published-project-view.ts`: `ExplorerClient.dependencyView({ revision })` returns
  `DependencyViewResult`. `browser-app.tsx` adds the tRPC adapter `client.dependencyView.query(input)`. No page calls it.
  The explorer test clients add a `dependencyView` that throws, so a page call before iteration 7 fails the test.
- `descriptions.test.ts` lists the new service-api statement and the root P9 relay.

### Tests

- `subs/service-api/src/tests/dependency-model.test.ts` (BD25).
- `subs/service-api/src/tests/dependency-view.test.ts` (BD26, BD27) drives a real `createProjectBinding` over the fake
  connector, with the production router and a test-controlled time.
- `project-binding-fakes.ts` extends the fake connection with:
  - a settable `published` revision and `publish(revision)`, which also emits `revision-published`;
  - a `contextStatus` that counts calls;
  - a `dependencyDiagram` that holds each call until the test settles it, answers `cancelled` when its signal is
    aborted, and records `diagramCalls` and `abortedDiagrams`.

  `fakeRevision` builds a valid revision ID. `fakeDiagram(inputId, boundaries, padding)` builds a consistent diagram of a
  chosen size.
- `web-process.test.ts` adds an HTTP case over the real tRPC batch client, including close.
- `subs/integration-tests/src/explorer-router.test.ts` adds a BD29 case over the real resident service with a scripted
  runner. Its binding connection records every request it sends.
- `src/tests/dependency-view-server.test.ts` is BD28 against the built explorer server and daemon.

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| BD25 | See the BD25 witnesses below | pass |
| BD26 | See the BD26 witnesses below | pass |
| BD27 | See the BD27 witnesses below | pass |
| BD28 | See the BD28 witnesses below | pass |
| BD29 | See the BD29 witnesses below | pass |

BD25 witnesses, from a hand-built diagram of six modules. Consumer `a` reaches an original owned by `b/core` through `b`
(behavioral) and through `c` (non-behavioral, denied). It reaches a type through its own barrel (limited), and `x`
through `c` (known) and through `b` (unknown). `b` calls `c`, the child `b/core` uses its parent `b`, and `idle` has no
dependency.

- **Units.** The test recounts the units from the facts, independently of the mapping. The project is 2/2, with 4
  imported units and 4 owner units. The forwarded original makes two imported links (`a -> b`, `a -> c`) and one owner
  dependency (`a -> b/core`, imported through `b` 1/0 and `c` 0/1).
- **Self-barrel and unknown.** The self-barrel makes no `a -> a` edge, but supports `a -> c` imported through `a`. The
  unknown `x` adds no owner dependency, while its known path counts in `a -> c` (0/2).
- **Rows.** All six module rows match exact expected `uses`, `usedThrough` and `ownedUsedByOthers`, including the zero
  rows `app` and `app/idle`.
- **Evidence.** It equals the copied facts, including denied/`not-visible` and limited status. It is ordered by original,
  then imported module, and contains no unknown row.
- **IDs and order.** Edge IDs equal independently computed SHA-256 IDs, and the eight IDs are distinct. Reversed module
  and boundary input produce identical bytes.
- **Measured zero.** It maps to complete coverage with a zero row per module.
- **Refusals.** The mapping refuses:
  - an identity mismatch;
  - either headline count off by one;
  - an unknown module or a consumer-owned original (`inconsistent-counts`);
  - `maxBytes` one byte below the encoded size, and a model above the 16 MiB default (`resource-limit`, no model).

  Exactly the encoded size maps.
- **Imports.** The mapping, the state and the interfaces have no runtime import other than `node:crypto` and
  same-owner files.

BD26 witnesses:

- **Unavailable and input.** While the binding is connecting, a request is `unavailable`. An empty input, a malformed
  revision or an extra `token` is `BAD_REQUEST`.
- **Superseded.** Before publication, and for an older revision, the answer is `superseded` with null or the current
  revision. No daemon call is made.
- **Pending.** The first request answers `pending/analyzing` while its daemon call is still unsettled. That call has
  exactly `{ token, requestId, revision }`. A second request adds no call.
- **Busy memory.** After `busy/analysis-running`, requests at 0 and 999 ms are `pending/waiting` with no call. At
  1,000 ms a second call starts. After `busy/inputs-changed`, ten polls 100 ms apart are `waiting`, and the eleventh
  starts the third call.
- **Ready.** It equals `createExplorerDependencyModel` of the diagram, at the published revision and input ID. Ten more
  requests add no call.
- **Superseded daemon answer.** A daemon `superseded` answer naming r5, while r4 is still published, is returned for
  three requests with no retry. Only after r5 publishes does a request for r5 start a call.
- **Failures.** Each is delivered once as `unavailable`, and the next request starts again:
  - `unavailable/resource-limit`, with the daemon message;
  - the service error `expired-generation`;
  - a ready diagram with another input ID (`identity-mismatch`).
- **Binding lost.** A dropped connection makes the answer `unavailable` with the binding's message.

BD27 witnesses:

- **Publication.** A `revision-published` event aborts the in-flight signal at once, without any browser request, and
  the fake counts one aborted call.
- **Another revision.** A request for a newer published revision, published without an event, aborts the older call.
  Only one call is unsettled, and the counters are 3 requests and 2 aborted. A late `ready` for the aborted call stores
  nothing.
- **Release.** A settled DTO is released by a newer publication (`released: 1`), after which its revision is
  `superseded`, and by `context-evicted` (`released: 2`).
- **Close.** `close()` aborts the in-flight call and leaves `inFlight`, `settled` and `busy` null. A late answer stores
  nothing, and later requests are `unavailable`. The state made no `setTimeout` or `setInterval` call.
- **Web process.** Over the real HTTP tRPC client, `dependencyView` answers `pending/analyzing` and `superseded`. After
  `web.close()`, the daemon call's signal is aborted and the process's state is closed and empty.

BD28 witnesses, from the built `dist/src/explorer-entry.js` on a copy of Collection Review's tracked inputs. The server
started its own isolated daemon, and the process probe was preloaded into every Node process:

- **Ready.** `projectView` became ready at revision 1. Polling once per second gave `pending/analyzing` three times,
  then `ready` after 3,025 ms. The ready revision equals the project view's revision, and `view.inputId` equals its
  input ID.
- **Model.** 17 behavioral and 48 non-behavioral dependencies with complete coverage, 15 module rows in the project
  view's module order, 28 imported and 28 owner edges.
- **Retention.** Ten further requests were `ready`. The daemon counters are `dependencyDiagrams: 1, behaviorRuns: 1`.
- **Exit.** SIGINT stopped the server with exit 0, and the daemon was stopped explicitly.
- **Loaded modules.** The server process loaded 289 modules, including `dist/subs/service-api/src/dependency-model.js`
  and `dependency-view.js`. None matches `/subs/analysis/`, `node_modules/typescript/`, `node_modules/@typescript/`,
  `compiler-helper` or `dependency-analyzer`, and the server spawned no such process.
- **Positive controls.** The daemon's loads match the same pattern, and the daemon spawned
  `dependency-analyzer-entry.js`.

BD29 witnesses:

- **Unchanged tests.** The existing `project-view.test.ts`, `project-binding.test.ts`, RS07/RS08 in
  `explorer-router.test.ts`, RS09 in `web-process.test.ts`, RS10 in `explorer-process.test.ts`, the explorer page and
  module tree tests and `entry-boundaries.test.ts` pass. The only test edits are the new `observe` stub and the
  throwing `dependencyView` stubs.
- **Resident service.** The new integration case uses the real resident service and a scripted runner:
  - `projectView`, `serverStatus` and `explorerDetails` at the published revision run no analyzer;
  - `dependencyView` reaches `ready` at the revision's input ID with one runner call, and ten more requests add none;
  - the binding sent only `openContext`, `subscribe`, `check`, `contextStatus`, `daemonStatus`, `explorerDetails` and
    `dependencyDiagram`;
  - the only `dependencyDiagram` request was `{ token, requestId, revision }`;
  - no request parameters contain `dependency-behavior`, and neither the published report's request nor the report
    passed to the runner lists it.

Recorded in `scripts/probes/results/dependency-view/`:

- `bd28-collection-review.json`: identities, phases, sizes, counters and the server's loaded-module summary;
- `collection-review-dependency-view.json`: the full `ready` `DependencyViewResult`;
- `collection-review-project-view.json`: the matching `ready` `projectView` result at the same revision.

### Sizes

| Project | Input | Model encoded | Project view encoded | Headline | Imported / owner edges |
| --- | --- | ---: | ---: | --- | --- |
| Collection Review copy | `input/1:6a281d2a…db36` | 116,219 B | 224,384 B | 17 / 48 | 28 / 28 |

The model is 2.4 times the 47,812-byte diagram from iteration 4, mostly because evidence rows are listed under both
projections.

## Verification

```sh
npx vitest run subs/service-api/src/tests/dependency-model.test.ts            # 4 passed
npx vitest run subs/service-api/src/tests/dependency-view.test.ts             # 3 passed
npx vitest run subs/service-api/src/tests/project-view.test.ts \
  subs/service-api/src/tests/web-process.test.ts \
  subs/service-api/src/tests/project-binding.test.ts                          # 17 passed
npx vitest run subs/integration-tests/src/explorer-router.test.ts             # 3 passed
npx vitest run subs/explorer/src/tests/ProjectExplorerPage.test.tsx subs/explorer/src/tests/ModuleTreePage.test.tsx \
  subs/explorer/src/tests/ProjectExplorerFocus.test.tsx subs/explorer/src/tests/HomePage.test.tsx \
  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts              # 56 passed
npx vitest run src/tests/entry-boundaries.test.ts subs/service-api subs/integration-tests/src/explorer-router.test.ts \
  subs/integration-tests/src/project-view-projection.test.ts subs/explorer \
  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts              # 15 files, 92 passed
npm run type-check                                                            # clean
npm run build                                                                 # built
npx vitest run src/tests/explorer-process.test.ts                             # 3 passed (requires npm run build)
RAMIFY_BD28_ARTIFACTS=$PWD/scripts/probes/results/dependency-view \
  npx vitest run src/tests/dependency-view-server.test.ts                     # 1 passed (requires npm run build)
npm run check:self   # passed: 15 owners, 391 source files, 0 errors, 0 warnings, 0 analysis limits, 0 denied
```

The resident daemon that `check:self` used was stopped with `dist/src/ramify daemon stop`. BD28 starts its server and
daemon in a private endpoint directory and stops both. The full test suite was not run. The build's existing Vite
chunk-size warning is unchanged.

## Deviations

- **Busy reasons.** Both `busy` reasons map to `pending/waiting`. C6 has no separate phase for `inputs-changed`, so the
  browser cannot tell them apart.
- **Settled failures.** The router table has no row for a settled failure. A daemon `unavailable`, a service error or a
  mapping refusal is kept only until the next request for that revision, which receives `unavailable`. A later request
  retries. A daemon `superseded` answer is kept for its revision, so it is never retried.
- **Unavailable reasons.** They are `<daemon or mapping reason>: <message>`, for example
  `resource-limit: <observed and maximum bytes>`. C6's `unavailable` carries only a reason string.
- **Publication detection.** The state learns of a newer publication from the binding's forwarded
  `revision-published` event, which needed the new `ProjectBinding.observe`, and from the `contextStatus` read on every
  request. Every `dependencyView` request therefore makes one `contextStatus` call.
- **Self-barrel breakdown.** A self-barrel fact is excluded from imported edges and `usedThrough`, as C2 requires.
  It still appears in its original-owner edge's `importedThrough` breakdown and evidence, with the consumer as the
  imported module.
- **Evidence classification.** An original-owner edge's `importedThrough` and evidence use each boundary fact's own
  classification. A behavioral dependency whose other path is non-behavioral lists that path as non-behavioral.
- **Refusal checks.** Beyond C5's headline check, `inconsistent-counts` also refuses facts naming a module absent from
  `diagram.modules`, consumer-owned originals and disagreeing owners.
- **Added names.** `ExplorerDependencyModelInput`, `DependencyViewInput`, `dependencyEdgeId`,
  `maximumDependencyViewBytes`, `createDependencyViews`, `DependencyViews`, `DependencyViewsStatus`,
  `DependencyViewCounters`, `dependencyBusyMemoryMs`, `unavailableReason` (moved) and
  `ExplorerWebProcess.dependencyViews`. Only the interfaces file is exposed.
- **BD28 project.** BD28 runs on Collection Review rather than Ramify, so the recorded DTO fixture is small enough for
  component tests. Its input ID differs from iteration 4's because the copy has another root path.

## Limitations

- **Presentation cannot import the DTO.** `service-api` exports carry the required-importer tag `dispatch`, so
  `presentation/project-view [ui, browser]` cannot import these types, not even type-only. This follows the
  `ProjectExplorerModel` precedent, where presentation owns the DTO types and `service-api` produces the same shape
  without importing them. Iteration 6 must declare structurally identical view types in `presentation/project-view`
  interfaces. `explorer [ui, browser, dispatch]` can import both.
- **No forwarding divergence.** The Collection Review fixture has no self-barrel or forwarding case: its imported and
  owner edge sets are equal, and every evidence row is `allowed`. Iteration 6 needs BD25's hand-built forwarding
  diagram, or its own fixture, for BD32 and the status dimension.
- **No Ramify size.** The model's encoded size for Ramify was not recorded. The daemon diagram is 326,735 B, and by
  Collection Review's ratio the model would be about 0.8 MiB.
- **No memory measurement.** Explorer server memory was not measured. That belongs to iteration 7.
- **Documentation.** The architecture documents were not updated. Iteration 7 owns documentation.

## Handoff

- **Iteration 6** receives:
  - **DTO shape.** `ExplorerDependencyModel` as declared in `subs/service-api/src/interfaces/explorer-dependencies.ts`,
    with the C5 serialized shape, schema `ramify.explorer-dependencies/1` and the ID and ordering rules above.
    Presentation must redeclare the shape locally; see Limitations.
  - **Real fixture.** `scripts/probes/results/dependency-view/collection-review-dependency-view.json`, a 116,219-byte
    model inside the `ready` result. `collection-review-project-view.json` is the matching project view at the same
    revision and input ID. Both came from the real daemon and explorer server.
  - **Status evidence.** Collection Review has complete coverage, 17/48, 28 edges per projection, all allowed and one
    zero module (`collection-review/integration-tests`). For projection divergence, self-barrel, denied and limited
    evidence, and partial coverage, reuse the diagram in `dependency-model.test.ts` through
    `createExplorerDependencyModel`.
- **Iteration 7** receives:
  - **Client operation.** `ExplorerClient.dependencyView({ revision })` returns `Promise<DependencyViewResult>`:
    - `ready { revision, view }`;
    - `pending { revision, phase: 'analyzing' | 'waiting' }`;
    - `superseded { current, reason }`;
    - `unavailable { reason }`.

    The tRPC procedure is `dependencyView`, a query with input exactly `{ revision }`. The browser adapter already
    exists.
  - **Server state contract.**
    - Each request reads `contextStatus`. A newer publication or eviction aborts and releases state at once.
    - `waiting` lasts one second after a busy answer. Polling faster than once per second starts no extra daemon
      request.
    - A settled failure is answered once. A superseded answer is final for its revision.
    - Close aborts and releases. The state holds no timer.
  - **Counters to observe.** `ExplorerWebProcess.dependencyViews.status()` returns `inFlight`, `settled.encodedBytes`,
    `busy`, `closed` and the counters `daemonRequests`, `aborted`, `released`, `busyAnswers`, `readyAnswers`,
    `supersededAnswers` and `unavailableAnswers`. The daemon counters `dependencyDiagrams` and `behaviorRuns` come from
    `daemonStatus`.
  - **Fixtures.**
    - `src/tests/dependency-view-server.test.ts` shows the built server, daemon and trace pattern. It starts the
      explorer entry with `withProcessScope`, lets it start the isolated daemon, polls over the tRPC client and stops
      both.
    - `createFakeConnector` with `publish`, `diagramCalls` and `fakeDiagram`/`fakeRevision` supports controllable state
      tests.
    - The recording `bind()` in `explorer-router.test.ts` captures request parameters.
