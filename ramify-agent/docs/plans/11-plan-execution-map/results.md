# Plan 11 execution results

## Iteration 1 — public contract and representative run

**Starting commit:** `7d6af7f410aba9e644044719f1903bd39deaf6e8`. The design proposal and source dashboard material were untracked in the starting checkout and are committed with this iteration. The toolkit and agent packages were prepared in this worktree. The first agent type-check could not resolve `ramify.ts/module-tree` because the linked toolkit had not yet been built; the first `check:self` could not find the linked `ramify` binary. `npm run build` at the worktree root followed by `npm --prefix ramify-agent ci` created those artifacts. Both required checks then passed. These were preparation gaps, not source findings.

### Delivered

- Browser-safe `execution-map/1` node, link, page, cursor query, complete detail and source-reference schemas under the harness protocol owner; the root re-exposes their named symbols to the web owner.
- Version-bound path functions for map pages and targeted capability/scenario detail. The existing `stale-version` error remains the 409 response with `currentVersion`.
- A structured two-root scripted fixture with expected IDs, source sequences, run versions and the provider, requirement, repair, cycle, proposed/unplaced module and captured writer-change cases. Its expected outcomes are literal fixture data rather than a projection's own output.
- A semantic light/dark token map and [field provenance, cursor and contrast contract](iteration-1-contract.md). No map endpoint or UI component is implemented in this iteration.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| `npx vitest run subs/harness/src/tests/execution-map-contract.test.ts` | Pass, 10 tests | Runtime schema validation, fixture identity, active gate without a verdict, gate/audit independence, duplicate and dangling references, mixed versions, page bounds, partial/unavailable records, exact capability keys, current activity, complete detail and stale error shape. No HTTP handler or durable-run projection yet. |
| `npm run type-check` in `ramify-agent/` | Pass | Harness, web and scripts TypeScript scopes. |
| `npm run check:self` in `ramify-agent/` | Pass: 0 errors, 0 warnings; 186 analysis limits | Batch ownership and exposure analysis over 9 owners. Limits are signature inference coverage, including the new Zod schemas; this is not an executable acceptance run. |
| `npm run build:web` in `ramify-agent/` | Pass | Build of the existing web app with the added token module. Vite reports a chunk-size advisory. No browser interaction has been tested. |
| `git diff --check` | Pass | Tracked diff whitespace only; staging and commit review follows. |

### Handoff to iteration 2

Use `subs/harness/src/interfaces/protocol/execution-map.ts`, the path functions and `subs/harness/src/tests/helpers/execution-map-fixture.ts` as the public wire and independent expected data. Implement the census from durable run records, retaining every gate attempt and run session, and add the targeted complete capability/scenario detail projection. The fixture's scripted inputs are not themselves durable records; adapt them through existing run-test helpers rather than treating this contract test as projection acceptance. Keep gate verdict separate from audit lifecycle, preserve previous verified requirement revision after reopening, and report missing or partial source data explicitly. The current schema's per-page checks cannot by themselves prove snapshot-wide uniqueness or cursor ordering; the projection and HTTP layers must enforce those rules.

The separate recorded `status-badge-tone` pi witness has not been replayed. Full harness, browser and audit acceptance remain iteration 9 work.

### Gate-result correction

The first contract required a gate verdict even while `active: true`, which would have forced the projection to invent a result before a running readiness or committing gate finished. The gate node now requires `verdict: null` exactly while active and requires a real verdict when settled. The fixture includes a separate running-gate page, and the focused test checks both invalid combinations. The audit lifecycle stays independent. This is an iteration 1 contract correction; it adds no projection or HTTP behavior. The focused Vitest run passed 10 tests; `npm run type-check` passed; `npm run check:self` passed with 0 errors, 0 warnings and 186 analysis limits.

## Iteration 2 — core execution index and complete descriptions

**Starting commit:** `e50fa5c641a83734e34c470a60d560206006bf07` (iteration 1 handoff).

### Delivered

- `executionCoreOf` projects an unpaged census directly from `RunView` and the committed records, rather than the capped work-item, scenario or session list answers. It includes accepted entry and registered lower capability cards with current owner and proposed module path, named tracked scenarios, latest non-dry-run scenario result, work items, assignment order and outline revision, every settled gate attempt plus a recorded running gate, and every run session including finished/replaced ones. It retains exact iteration outcome, module path, scope extras, session reach and invocation IDs, and gate subject/cause/evidence presence. Core `tracks-scenario`, `started-for`, `assigned-iteration`, `session-for` and `gate-for` links use typed source refs. Later causal links remain iteration 3 work.
- `executionCapabilityDetailOf` returns the full accepted entry description or registered lower-level behavior; `executionScenarioDetailOf` returns the entire frozen `source[]`. Missing retained detail is explicit `unavailable`. `RunQueries` exposes these read-only operations and the complete core index internally; versioned HTTP paging remains iteration 5.
- `allWorkItemsOf` separates unbounded projection input from the existing bounded list response. The index checks snapshot-wide node/link uniqueness and endpoint existence before returning ordered streams.
- The browser-safe node contract gained the capability's proposed module, compact gate subject/cause/evidence presence, iteration outcome/module/scope exceptions, session reach/invocations, and a `capability-record` source-ref kind. These additive fields close omissions in the iteration 1 contract while preserving keys, run versions and the active-gate `verdict: null` rule.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| Focused `execution-map-contract`, `execution-map-projection` and `execution-map-durable` Vitest files | Pass, 16 tests | Contract corrections; two accepted roots and one lower provider; ordered iterations; dry-run versus later real failure; complete descriptions; all gate/session records; 205 work items beyond the old cap; replay from the persisted ledger after service restart. The constructed run supplies deliberate edge cases, while the service run supplies the disk/restart witness. |
| Related `scenario-projections` and `run-projections` Vitest files | Pass, included in a 25-test run | Existing scenario and gate query behavior remains compatible. |
| `npm run type-check` | Pass | Harness, web and scripts TypeScript scopes. |
| `npm run check:self` | Pass: 0 errors, 0 warnings; 186 analysis limits | Ownership/exposure check over 9 owners. The limits are signature inference coverage, not executable acceptance. |
| `git diff --check` | Pass | Source and documentation whitespace. |

### Audit result provider gap and handoff

The gate verdict and audit outcome are distinct. The current `GateAttempt` retains `audited` and `GateEvidence` publication refs but **no audit overall result**. The audit adapter receives `result.summary.overall` (`pass` or `fail`) in `subs/harness/subs/audit/src/check-execution.ts`; it currently returns only the refs in `CheckExecutionResult`. Published evidence can accompany a failed audit, so neither evidence presence nor the gate verdict establishes a green audit ring. The core projection reports `audit: unavailable` with a named gap for an evidence-present gate, `incomplete` when `gate-committing` or a commit identity is recorded without publication, `not-started` where none of those start facts is recorded, and `not-applicable` for readiness.

**Required successor work before the gate marker is accepted:** the harness/audit owner must carry the exact `result.summary.overall` through `CheckExecutionResult` into a versioned durable outcome associated with the gate attempt (a new gate record version with backward reading for v3, or a separate committed audit-outcome record). The projection can then map exact `pass`/`fail` to `passed`/`failed`; it must not derive either from the gate verdict. Iteration 3 is the earliest dependency-safe place to add this provider fact while it adds causal gate links; if deferred, iteration 9's audit acceptance remains open. The final browser witness needs one failed gate with a passing audit and one audit failure independently of the gate verdict.

Iteration 3 should add the remaining typed provider, repair, request, verification and cycle links and requirement states to this index. It should preserve source order and reuse these canonical keys; it should also add exact awaited-session/running-gate activity from the log without inferring a readiness gate from an open phase. The existing scripted two-root fixture is a contract witness, not a replayed durable run. The separate `status-badge-tone` pi witness still has not been replayed; full harness, browser and audit acceptance remain iteration 9 work.

## Iteration 3 — causal decomposition and requirement progress

**Starting commit:** `1dcfb95dac87ada47000f81eabbae87e3b9527a6` (iteration 2 handoff).

### Delivered

- The core index now projects canonical placement request, contract and current consumer requirement cards. Typed links join requests to their originating work items, decisions and contracts to requests and establishing iterations, providers to each consumer requirement, current requirement verification to its contract, confirmed capability dependencies, successive iterations and follow-up work items, global forks and engineer sessions to their recorded work, and repair attempts to the prior gate. Dependency cycles remain finite references between canonical cards.
- Requirement state is computed for the current revision only. A registered fake-backed requirement can be working while provider implementation remains `not-started`; provider start and conformance advance that substage separately. Verification is per consumer. Reopening clears the current green state and retains the earlier verified revision. A missing provider binding is unavailable and reported as a coverage gap. Access-only contracts show `mode: access-only` and close at registration without an invented provider work item or requirement.
- `executionCoreOf.current` now names only an unended invocation and an explicitly started gate, with source sequence. Readiness writes `gate-started` before it runs and pairs `readiness-failed` with that gate ID; old logs without this event do not invent active readiness. Terminal runs with an unmatched start show a gap rather than a live marker.
- The audit adapter carries the exact `result.summary.overall` through gate execution. A `ramify-agent.gate-audit-outcome/1` record is committed atomically beside the existing `/3` gate attempt. Old `/3` runs remain readable and their published evidence without an outcome remains `unavailable`; a new `pass` or `fail` is projected independently of the gate verdict. The outcome is bound to the attempt's audited commit and exposed as an audit source reference. Standalone gate serialization strips the in-memory outcome from its unchanged `/3` record.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| Ten focused Vitest files for execution map contracts/projection/causality/durable replay, audit adapter, run/readiness/recovery, event unions and standalone sessions | Pass, 124 tests | Includes two consumers with distinct current colors, provider conformance before consumer verification, reopened revision, access-only agreement, finite dependency cycle, repair chain, explicit readiness Now and backward audit reading. A service-run test reopens the committed audit outcome after restart. The service witness uses scripted checks; the adapter test reads a real published audit report. |
| `npm run type-check` | Pass | Harness, web and scripts TypeScript scopes. |
| `npm run check:self` | Pass: 0 errors, 0 warnings; 187 analysis limits | Ownership/exposure check over 9 owners. Limits are inference coverage, not runtime acceptance. |
| `git diff --check` | Pass | Source and documentation whitespace. |

### Handoff to iteration 4

Use `executionCoreOf` and its `current`, node and link streams as the unpaged input. The new `providerStage`, `provider` and contract `mode` fields are browser-safe and version-bound with the rest of `execution-map/1`. The `modules` arrays currently contain only baseline owner/consumer/provider associations; iteration 4 must derive direct participation from recorded work, session reach and observed writes, and keep authorized scope distinct from participation. Captured line totals and tree coverage remain iteration 4 work. Gate audit color must use the new exact outcome record when present and preserve `unavailable` on historical records. Full browser and final audit acceptance remain iteration 9 work.

## Iteration 4 — module relations and captured change volume

**Starting commit:** `ec90d83db2ffb4b7f73edaed6f3af728517f0dae` (iteration 3 handoff).

### Delivered

- `executionModuleMapOf` indexes the current architect tree by full declared-name path, parent and directory with its revision/input identity. It retains proposed capability placements, work items without a module, and recorded modules outside the current tree separately. Direct relations keep owner, scenario, consumer, provider, local architect, engineer, contract engineer, authorized scope and observed write roles. A started work item, started iteration, attached local/engineer session or captured write marks only its direct module `workedIn`; a request or authorized path alone does not. Parent modules report an involved-descendant count without becoming violet.
- `capturedLinesOf` reads every writer invocation's retained `lines.json`, including failed and repair invocations, and sums text additions/deletions by the **recorded owner**. It keeps invocation IDs, unmapped text, binary path counts and owner modules absent from the current tree. A missing, malformed or partial settled snapshot yields a known subtotal with partial coverage; a live writer yields pending coverage. It never fabricates binary line counts or treats unavailable snapshots as complete zeroes. Every line summary names the two-snapshot method limit.
- `executionMapOf` and `RunQueries.executionMap` combine the unpaged execution index with the current tree and captured writer records. `execution-map/1` adds a browser-safe `moduleMap` contract. The page contract rejects a module map whose tree differs from the page tree. The HTTP endpoint and versioned pagination are iteration 5 work.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| Five focused Vitest files for module projection, map contract, core, causal and durable replay | Pass, 27 tests | Direct fixture roles, scope-only neutral module, parent descendant count, proposed and outside-tree owner, two-module text subtotals, failed/repair writers, unmapped and binary paths, missing/partial records, pending writer and deterministic disk replay. The constructed line records exercise the reader; final scripted-run/browser acceptance is iteration 9. |
| `npm run type-check` | Pass | Harness, web and scripts TypeScript scopes. |
| `npm run check:self` | Pass: 0 errors, 0 warnings; 189 analysis limits | Ownership/exposure analysis over 9 owners. Limits are inference coverage, not runtime acceptance. |
| `git diff --check` | Pass | Source and documentation whitespace. |

### Handoff to iteration 5

Use `RunQueries.executionMap` as the unpaged query. Its `moduleMap` carries current tree identity, direct relation roles and captured line coverage. The current architect tree can refresh **without a run event**: bind every cursor/page to both the run sequence and the tree revision/input, and restart or report a named stale/partial state if either changes during pagination. Do not combine module rows from one tree revision with nodes from another. `lines.json` is retained beside each invocation **outside the committed event log**; the query reads it after settlement. A missing or partial file is a coverage gap, and a live writer is pending. Do not infer complete `+0 / -0` for either. Page the module map or return a bounded module census rather than copying an unbounded tree into every page. Final scripted-run and browser checks remain iteration 9 work.

## Iteration 5 — HTTP query, bounded pages and coherent client read

**Starting commit:** `db813fbda28aa5162d0f5f58bea5f4ca2ea18b40` (iteration 4 handoff).

### Delivered

- `GET /api/v1/plans/:planId/runs/:runId/execution-map` and targeted capability/scenario detail routes. The run and detail requests require a version; a changed version returns `stale-version` with the current sequence, a missing element returns `not-found`, and an inconsistent retained census returns `unreadable`. Existing query routes are unchanged.
- The harness pages nodes, links, current-tree module rows, direct module relations and line provenance as five separate bounded streams. Each page carries `shown / total` for every stream. Module rows contain numeric line summaries, with the invocation IDs and gap text paged separately; the current tree is sliced with its module rows. A link endpoint absent from the complete census is explicitly `unresolved` with a reason. Duplicate identities and missing module relation targets are rejected before paging.
- The opaque cursor binds the plan/run scope, requested limit, run sequence and a digest of the full projected snapshot. The digest includes current architect-tree revision/input and projected totals, provenance IDs and gaps from retained `lines.json`, so a tree refresh or a change to those projected line facts between pages is reported as stale even when the run sequence has not advanced. A file change that leaves the projected facts identical does not change the map. The query checks the run and tree again after projection to catch changes during a request. There is no durable cursor cache.
- `ProtocolClient.getExecutionMap` collects all streams before returning one map, checks page identity, totals and uniqueness, resolves page-local link endpoints against the completed node census, and restarts on stale-version (up to four reads). On connection loss after a coherent read, it returns that last map with `freshness: 'stale'`; a first read with no prior map still reports the connection failure. Targeted detail methods use the encoded protocol paths.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| `npx vitest run` with execution-map contract, pages, HTTP, durable replay, browser client and existing client files | Pass: 6 files, 31 tests | Includes 610 nodes, 551 links, 610 direct module relations, >300 line references, page boundaries including links continuing after nodes, unresolved targets, changed tree and line evidence, same-version tree restart, bounded repeated staleness, partial coverage, missing detail, URL encoding, connection loss, old route and cursor equality after a disk-backed service restart. The large census is constructed; iteration 9 still owns scripted-run/browser acceptance. |
| `npm run type-check` | Pass | Harness, web and scripts TypeScript scopes. |
| `npm run build:web` | Pass | Vite built the client; its existing large-chunk advisory remains. |
| `npm run check:self` | Pass: 0 errors, 0 warnings; 189 analysis limits | Ownership/exposure analysis over 9 owners; analysis limits are inference coverage, not runtime acceptance. |
| `git diff --check` | Pass | Source and documentation whitespace. |

### Handoff to iteration 6

Use `ProtocolClient.getExecutionMap(planId, runId)` for the complete, coherent execution and module census; `freshness` is independent of run progress. The map's `coverage` counts include every session and gate node, and `moduleMap.modules[].direct` is fully reassembled from relation pages. Fetch full descriptions through `getExecutionCapability` and frozen Gherkin through `getExecutionScenario` at the displayed `runVersion`. A stale-version retry is bounded, so UI state must show its error if changes keep occurring. A partial line summary retains its known subtotal and gap text; an unavailable tree stays explicit. No execution canvas or browser interaction was added here; those are iterations 6–9.

## Iteration 6 — execution canvas and evidence drill-down

**Starting commit:** `b9eeffcb1b9bc31043ccea06c86b83681663559e` (iteration 5 handoff).

### Delivered

- The Run page has an Execution map area built with a direct, pinned `@xyflow/react@12.11.6` dependency, matching the packaged Ramify canvas. `npm ls @xyflow/react --all` resolves both direct and toolkit consumers to 12.11.6. The canvas uses read-only custom cards, controlled pan/zoom, Fit and Relayout controls, stable old positions across run-version updates, a run band, two entry roots, a canonical provider card, typed reference/cycle edges, ordered iterations, local architect lanes, requirement branches and all session/gate markers. The full census remains in a shelf when branches are collapsed.
- Cards and detail show full associated module paths, named scenarios, complete targeted capability descriptions and frozen Gherkin, current capability reason, scenario result summaries, verified/current-revision requirement counts, independent gate verdict and audit marks, inline repair chains with round number, and explicit unavailable and coverage facts. The gate detail can open the existing full Checks answer. An active gate explains that the settled check body is pending. The time rail follows event order and marks selected evidence; no wall-time gap folding was added. Now targets only the recorded awaited session or running gate, and only those markers pulse; reduced motion leaves a static outline. Role SVG glyphs, labels and accents remain separate from status color.
- The existing scenario list is capped at 500, so the targeted scenario detail now includes every retained gate result for that scenario in committed order. A constructed 501-scenario test proves history for the item beyond the list cap. The module-tree CM01 test was narrowed to its original ownership claim: the separate execution canvas is allowed its Plan 11 direct React Flow dependency.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| Focused web and execution-map Vitest files | Pass: 16 files, 144 tests | Covers two roots, shared provider/cycle references, iteration order, local architect lane, collapsed shelf access, full detail, independent gate/audit, repair chain, 20/21 scenario marks, Now focus, keyboard-reachable card controls, pan/zoom state, stable positions, and targeted scenario history beyond the 500-row list cap. React Flow was mocked for component assertions; real-browser layout and interaction remain iteration 9 work. |
| `npm run type-check` | Pass | Harness, web and scripts TypeScript scopes. |
| `npm run build:web` | Pass | Vite built the client; `npm ls` reports the same 12.11.6 React Flow version for the direct and toolkit consumers. The large-chunk advisory remains. |
| `npm run check:self` | Pass: 0 errors, 0 warnings; 189 analysis limits | Ownership/exposure analysis over 9 owners; limits are inference coverage. |
| `git diff --check` | Pass | Source and documentation whitespace. |

### Handoff to iterations 7–9

`ExecutionMapArea` owns selected execution key, collapsed branches, card positions and viewport; the companion map can connect its selection at that boundary in iteration 7. The module tree and direct/descendant highlight counts are not yet rendered. Sessions currently open the existing full-page transcript; iteration 8 replaces that activation with multiple floating windows and a shared live update coordinator. Browser viewport, drag/zoom/focus, contrast and reduced-motion behavior need real-browser acceptance in iteration 9. The full suite, scripted-run witness and final-commit audit remain iteration 9 gates.

## Iteration 7 — compact modules canvas and cross-selection

**Starting commit:** `f7ed9845663aa04dd9878dd8f5c091a53db9bea9` (iteration 6 handoff).

### Delivered

- The Execution map now includes a smaller companion modules hierarchy from the complete `moduleMap` snapshot. It uses the packaged `ramify.ts/module-tree` canvas and a separate React Flow provider, so each canvas owns its pan, zoom and fit state. Its current-tree rows retain full paths in selected detail; proposed and outside-tree shells, unplaced work, and an explicit unavailable-tree fallback remain visible. The narrow layout has an expandable modules panel.
- Violet marks only `workedIn` modules; uninvolved parents remain gray and show a separate involved-descendant count. Captured writer additions and deletions appear numerically and as symmetric diverging bars scaled to the largest known module side in the run. Partial and pending subtotals have text and hatching; unavailable data has no numeric zero or bar. Selected detail preserves coverage gaps and binary counts.
- One selection state links the maps. Selecting an execution node highlights every directly related module with its role available in detail. Selecting a module highlights distinct canonical direct execution nodes from the fully reassembled relation rows. Hidden matches remain in a jump list and add a counted, accessible badge to each collapsed branch containing them. A jump reveals and focuses the target. Main cards, Now, session/gate shelves and event rail all clear a previous module selection when they select execution work. Hover has no selection effect.
- The toolkit `ModuleTreeCanvas` received one optional, backward-compatible `highlightedNodeIds` prop. Its shells expose an outline, `data-highlighted`, and a spoken highlighted label; existing consumers pass no new prop.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| Focused web execution-map, companion-map and existing capability-module-tree Vitest files | Pass: 3 files, 25 tests | Covers direct and multi-module selection, deduplicated canonical matches, keyboard module activation, hidden badge and reveal, direct vs descendant color, run-wide bar scale, partial and unavailable lines, proposed/outside/unplaced, drawer control and independent mocked viewport state. |
| Focused toolkit `ModuleTreeCanvas` Vitest file | Pass: 1 file, 23 tests | Optional multi-highlight accessibility and existing selection/collapse consumers. |
| Agent `npm run type-check`, `npm run build:web`, `npm run check:self` | Pass | Self-check: 0 errors, 0 warnings, 189 existing analysis limits. The Vite large-chunk advisory remains. |
| Toolkit `npm run build`, `npm run type-check`, `npm run check:self` | Pass | Toolkit self-check: 0 errors, 0 warnings, 0 analysis limits. |
| `git diff --check` | Pass | Source and documentation whitespace. |

### Handoff to iteration 8 and acceptance

`ExecutionMapArea` now owns a single execution-or-module selection, and `ExecutionModules` consumes the reassembled `moduleMap` directly. Its separate React Flow provider and narrow panel must remain when transcript windows are added. Session activation still goes to the full-page route; iteration 8 replaces that activation with the live floating workspace. The mocked viewport tests establish state separation, while real pointer pan/zoom, responsive layout and keyboard focus in Chromium remain iteration 9 browser acceptance work, along with the full scripted run and final-commit audit.
