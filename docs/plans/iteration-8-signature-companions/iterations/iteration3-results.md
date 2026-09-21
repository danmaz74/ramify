# Iteration 3 results: The finding in batch, the retained session and the CLI

**Date:** 2026-09-21. **Mode:** direct work in worktree `/tmp/ramify-plan8-signature-companions`,
branch `feat/plan8-signature-companions`, based on iteration 2's commit `40f67d2`. The results are committed
with the implementation.

## Prerequisites

- Iteration 1's `listCompanionViolations(model)` is exported from `model`'s `src/index.ts` and reaches
  `analysis` through its `model` wildcard. Iteration 2's `CatalogOriginal.companions` is present on every
  catalog original in batch and retained descriptions. RD-1 to RD-7 are unchanged.
- The plan's "What exists" held for `analysis`: `originalSurface()` was an explicit allowlist without
  companions, `patchPositions` refreshed declarations only, and a `LinkIssue` makes the execution `invalid`.
- The coverage notes are this iteration's. Iteration 2's assignment says "No coverage note is emitted here …
  iteration 3 reports the notes", and the main plan's Finding section puts them in `analysis`'s decide stage.

## Built

### `descriptions` (`subs/analysis/subs/descriptions/`)

- `src/link.ts`: originals enter `buildModel` with the catalog original's `companions`, replacing the explicit
  empty placeholder. Nothing else in link changed.

### `analysis` (`subs/analysis/`)

- `src/interfaces/analysis.ts`: `AnalysisCode` gains `exposed-without-companion`; the diagnostic category union
  gains `exposure`.
- `src/interfaces/session.ts`: `RevisionTimings` gains `companions`, the pass's own timing. It is measured
  inside `decide` and is not a disjoint stage.
- `src/companion-findings.ts` (new, internal): `companionOutputs(model)` turns each `CompanionViolation` into one
  diagnostic and derives the notes.
  - Diagnostic: category `exposure`, code `exposed-without-companion`, location the exposure statement,
    `related` the naming position (the companion's entry of `companions.evidence`), `original` the symbol,
    `importer` and `accessId` null. The ID is `companion-diagnostic/1:` and the SHA-256 of the other fields,
    the same content-hash rule the source and validation diagnostics use.
  - Messages. `not-visible`: `` `placeOrder` is exposed to parent without `Order`, which its signature names
    (subs/orders/src/place-order.ts:3:35). Expose `Order` to parent, or remove it from the signature. ``
    `requires-tag`: `` `render` is exposed without the required-importer tags [ui] of `Widget`, which its
    signature names (subs/views/src/render.ts:2:32). Tag the exposure of `render` [ui], or remove `Widget` from
    the signature. ``
  - Notes: `signature-inferred` and `signature-unresolved`, one per original that has an effective exposure
    with a step, meaning to descendants, or to parent from a non-root module. The rule uses the same test.
    Each is located at the original's first model declaration, with no related locations. The ID is
    `companion-limit/1:` and the SHA-256 of `{ code, location, message, related }`.
- `src/session-facts.ts`: `SessionFacts.companions: CompanionOutputs`. Both report drivers record its
  diagnostics and cover its notes in the decide stage, so `draftReport` and `draftPublication` match batch.
- `src/session-revision.ts`:
  - `originalSurface()` adds `companions.named`, `inferred` and `unresolved`, with no position. A change to them
    is no longer a move, so it relinks.
  - `patchPositions` copies the current catalog's `companions`, including refreshed `evidence`, into both the
    patched model and its link input, next to the declarations.
  - `companionPass(model, previous, timings)` runs in the decide window of `recomputeAll` (cold, broad and
    audit), `relinkAndDecide` (source, unchanged-surface and membership) and the description path. It returns
    the previous outputs only when the model is the same object. A relinked or position-patched model is
    evaluated again, which regenerates locations, related locations, messages and IDs from current facts. It
    needs no compiler call: the pass reads the model alone.
  - The metadata path spreads the previous facts and keeps both model and outputs.
- `src/run-analysis.ts`: the batch decide stage calls `companionOutputs` after the access evaluation and
  records its diagnostics and notes.
- `src/session-audit.ts`: `compareFacts` also compares `companions`.
- `README.md`: one paragraph on the decide-stage pass.

### Outside the three owners (scope additions)

- `typescript`'s `src/interfaces/source.ts`: `SourceLimit['code']` gains `signature-inferred` and
  `signature-unresolved`. The report's coverage list is `SourceLimit[]`, so the notes need these codes. The
  field comment says analysis reports them. No `typescript` behavior changed.
- `daemon`'s `src/codec.ts`: the wire shape of revision timings accepts `companions`. Without that key the
  codec rejects every revision.
- `scripts/reference-harness`: the `plan5-hosting-cases.ts` timing key list gains `companions`. The
  `factsFrom` helpers of `plan2a-session-cases.ts` and `plan2a-projection-cases.ts` gain an empty `companions`.
- `docs/architecture/cli-invocation.spec.md`: exit 1 names the finding, and "Output and exit" describes the
  finding and the two notes.
- `format.ts` is unchanged. The pinned forms showed no defect.

### Tests

- `subs/analysis/src/tests/companion-findings.test.ts` (new), on a fixture derived from the reference
  example's shape and added to the session fixture:
  - `orders` exposes `placeOrder(order: Order): Receipt`, an explicitly typed arrow, a function expression
    and a partially annotated arrow, plus `lookup(key: Missing)` and an inferred `count` to parent.
  - `shop` re-exposes `addItem` from `cart` without `Item`.
  - `views` exposes `render(widget: Widget)` untagged beside a `[ui]` `Widget`.
  - Root `src/checkout.ts` makes an unrelated denied import.
- `src/tests/companion-cli.test.ts` (new):
  - pins the batch text and JSON forms, and exit 1 then 0;
  - drives `--changed` over the real resident service, pinning text and JSON through the causing edit, a
    position-only edit and the fix.
- Fixture adjustments, with the reason for each:
  - Exposed fixture originals whose declared signature leaves a type to inference now get a
    `signature-inferred` note, so `coverage` became `partial` in tests asserting `complete`. The originals are
    `export const publicValue = 1`, `rootValue`, `value` and `export function Merged() {}`. The note follows
    the principles' definition and iteration 2's literal `inferred` fact.
  - Those tests are not about signatures, so their fixtures were annotated. Declarations gained `: number` or
    `: void`, which keeps each test's assertion. No expectation was relaxed.
  - Files: `analysis/src/tests/session-test-fixture.ts`, `retained-session.test.ts`, `session.test.ts`,
    `src/tests/fixture.ts` and `src/tests/resident-cli.test.ts`.
- Timing key lists gain `companions` in `session-revision.test.ts`, `session-worker.test.ts` and `ipc.test.ts`.
  The timing fixtures of `report-copy.test.ts`, `codec.test.ts`, `measure-driver.ts`,
  `session-counters.test.ts` and `scripted-driver.ts` gain it too.

## Evidence

| ID | Case | Result |
| --- | --- | --- |
| SC16 | Batch: the `placeOrder` finding's ID form, category, code, statement location `subs/orders/module.ramify:3:1`, related `place-order.ts:3:35` and exact message. Six findings: owned, arrow, function expression, partial arrow, re-exposure at `shop` only (none at `cart`), and `requires-tag [ui]` for `render`, whose message is pinned. The typed arrow and function expression carry no inference note; the partial arrow fails and has its note. The retained session equals batch on the whole report at every step of SC18. After `Order` is exposed, the arrows pass and the partial arrow keeps its note | pass |
| SC17 | The same run also reports the unrelated `not-visible` import at `src/checkout.ts`. Every stage is `completed`, the execution `completed` and the check `failed`, with 7 errors and 1 denial. Every access has a result | pass |
| SC18 | One session: cold; a signature edit (`source`, relinked, the new `Coupon` finding added, `companions` timing > 0 and ≤ `decide`); a body edit (`unchanged-surface`, no relink, empty delta, every diagnostic equal); a blank line before the violating signature and a move of only its naming position (both `unchanged-surface`, `modelRebuilt: false`, one compiler update and one description of the edited file, related locations refreshed); a comment line above the exposed unresolved and inferred originals (notes move one line, no relink); a `module.ramify` fix (`description`, zero compiler calls and compiler, description and access timings, 5 findings removed); a file creation (`membership`); a `tsconfig.json` edit (`broad`). After each step the full retained report equals a fresh batch report and `verify` finds the retained facts equal to a whole recomputation. That covers locations, related locations, messages, IDs and coverage, with IDs unique in both lists | pass |
| SC19 | The installed `dist/src/ramify` against a real daemon with an owned `RAMIFY_ENDPOINT_DIR`, transcript below; the same sequence is pinned as a resident CLI test through the real service. Baseline exit 0; the causing edit prints `Error [new] [exposed-without-companion] module.ramify:3:1: …(src/interfaces/api.ts:3:29)…` and exits 1 on the `source` path; a blank line keeps the violation, exits 1 on `unchanged-surface`, shows `4:29` in text and JSON, and lists the old ID under `removed`; the `module.ramify` fix exits 0 on `description`, listing the ID under `removed`; a source fix after reintroduction also lists it under `removed` | pass |
| SC20 | Notes appear once per exposed original: `placePartial`, `lookup` (unresolved) and `count`. None appears for the unexposed `later`, and notes are never diagnostics. Exposing `later` adds its note on the `description` path with zero compiler work, and position-only edits refresh notes to equal batch with no duplicates. A project whose only outputs are notes passes with exit 0 and coverage `partial` | pass |
| Exit | No existing finding's identity rule changed. `evaluate-accesses.ts` and the validation diagnostics are untouched, and the pre-existing suites below pass with only the fixture annotations and timing keys listed above | pass |

### SC19 transcript (installed executable, real daemon)

```text
$ ramify check --changed src/interfaces/api.ts --deadline 60000
Mode: resident (revision 1; cold)
Checked: src/interfaces/api.ts; checked set: 2 files (…), 1 accesses; wait: 383.7 ms; findings: 0
[exit 0]
# area(n: number) becomes area(shape: Shape)
$ ramify check --changed src/interfaces/api.ts --deadline 60000
Mode: resident (revision 2; source)
Error [new] [exposed-without-companion] module.ramify:3:1: `area` is exposed to descendants without `Shape`, which its signature names (src/interfaces/api.ts:3:29). Expose `Shape` to descendants, or remove it from the signature.
[exit 1]
# a blank line above the declaration
$ ramify check --changed src/interfaces/api.ts --deadline 60000
Mode: resident (revision 3; unchanged-surface)
Error [new] [exposed-without-companion] module.ramify:3:1: `area` is exposed to descendants without `Shape`, which its signature names (src/interfaces/api.ts:4:29). Expose `Shape` to descendants, or remove it from the signature.
[exit 1]      JSON: related line 4, column 29; removed: [the revision 2 ID]
# expose Shape in module.ramify
$ ramify check --changed module.ramify --deadline 60000
Mode: resident (revision 4; description)
[exit 0]      JSON: findings [], removed: [the revision 3 ID]
$ ramify daemon stop
Stopped: daemon stopped explicitly
```

The position-only move shows the finding as `new` and the earlier ID as removed. That is the existing
identity rule: an ID hashes the finding's location and message, as import diagnostics' IDs do. The
message names the naming position, as the runnable outcome requires, so the revision delta counts a
move as added and removed, not `positionOnly`.

### `check:self` and the reference example (expected intermediate failure, RD-6)

Both fail with the rule enforced, as planned. Resident `npm run check:self` and
`dist/src/ramify check --root . --batch` report identical diagnostic and coverage IDs. The rule and
the exposures were not changed.

**Toolkit:** exit 1, 56 `exposed-without-companion` findings, all `not-visible`, none `requires-tag`,
and 0 import denials. The 4525 allowed accesses are unchanged. Findings by exposure statement:

- `module.ramify:9`: `QuickEnvironment` → `DaemonService`; `createQuickEnvironment` → `ApiViewPublisher`, `AnalysisDriver` (descendants)
- `module.ramify:17`: `ProjectObserver` → `ObservationSink` (descendants)
- `module.ramify:31`: `DependencyAnalyzerOutcome` → `DependencyAnalyzerTimings` (descendants)
- `module.ramify:54`: `startExplorerWebProcess` → `ExplorerWebProcess` (descendants)
- `module.ramify:63`: `MaterializedTarget` → `MaterializedViewId` (descendants)
- `subs/analysis/module.ramify:10`: `ProjectObserver` → `ObservationRetirement` (parent, descendants)
- `subs/analysis/module.ramify:13`: `SourceAnalysis` → `DependencyBehaviorFacts`, `SuppliedAccesses` (parent, descendants)
- `subs/analysis/module.ramify:17`: `AnalysisSnapshot` → `DependencyBehaviorFacts` (parent)
- `subs/analysis/module.ramify:51`: `projectApiView` → `SessionFacts`, `ApiViewProjectOutcome`; `planApiViewRequests` → `SessionFacts` (parent)
- `subs/analysis/subs/typescript/module.ramify:14`: `describeSymbolDetails` → `DeclarationInputs` (parent)
- `subs/daemon/module.ramify:18`: `ContextManagerOptions` → `ApiViewQueryLimits`; `ControlledWatcher`, `WatcherPort` → `WatchBatch`; `ContextManager` → `ContextApiViewOutcome`, `ApiViewRequest`, `ContextDependencyFactsOutcome`; `ContextRevision` → `CaptureTimings`; `ReplyTimings` → `CaptureWork` (parent)
- `subs/explorer/module.ramify:4`: `ProjectExplorerPage` → `ProjectExplorerPageProps` (parent)
- `subs/explorer/module.ramify:5`: `createProjectExplorerBrowserApp` → `ExplorerClient`, `ProjectExplorerBrowserApp`, `BrowserPage` (parent)
- `subs/presentation/module.ramify:9`: `ModelDiagramProps` → `ViewRect`, `SymbolName`, `DiagramLayout`, `Theme` (parent)
- `subs/presentation/module.ramify:10`: `TreeDiagramProps` → `TreeDiagramLayout`, `Theme` (parent)
- `subs/presentation/module.ramify:11`: `FocusDiagramProps` → `FocusDiagramLayout`, `Theme` (parent)
- `subs/presentation/module.ramify:12`: `DiagramDefinition` → `WhatIfNote`, `NodeContentOptions`, `DecisionPolicy`, `LegendGroup`, `TracedSymbol`, `ChordSpec` (parent)
- `subs/presentation/module.ramify:13`: `TreeDiagramDefinition` → `TreeFocus` (parent)
- `subs/presentation/module.ramify:14`: `FocusDiagramDefinition` → `TreeFocus` (parent)
- `subs/presentation/module.ramify:40`: `placeTree` → `LayoutResult`, `LayoutOptions`, `LayoutGraphInput` (descendants)
- `subs/presentation/subs/project-view/module.ramify:16`: `collapsibleAtDepth`, `ancestorsOf`, `indexModuleTree` → `ModuleTreeIndex` (parent)
- `subs/service-api/module.ramify:7`: `createExplorerRouter` → `ExplorerRouterOptions` (parent)
- `subs/service-api/module.ramify:8`: `startExplorerWebProcess` → `ExplorerWebProcessOptions`; `ExplorerWebProcess` → `DependencyViews` (parent)
- `subs/service-api/module.ramify:11`: `createProjectBinding` → `ProjectBindingOptions` (parent)

Toolkit `signature-inferred` notes: 10, and no `signature-unresolved`:

- `createControlledClock` (`daemon/subs/contexts/src/tests/controlled-ports.ts:25`)
- `LAYOUT`, `wrapText` (`presentation/subs/layout/src/geometry.ts:15, 218`)
- `MIN_SCALE`, `MAX_SCALE`, `wheelFactor`, `DRAG_THRESHOLD` (`presentation/subs/layout/src/viewport.ts:21, 22, 114, 120`)
- `createProjectExplorerModel` (`service-api/src/project-view.ts:175`)
- `createExplorerRouter` (`service-api/src/router.ts:34`)
- `probeExplorerReadiness` (`service-api/src/web-discovery.ts:80`)

**Reference example** (`examples/collection-review`, batch): exit 1, 23 `exposed-without-companion` findings,
all `not-visible`:

- `module.ramify:9`: `McpToolContribution` → `ToolResult`, `ToolInputSchema`; `ProtocolFacilities` → `createFacilities` (descendants)
- `module.ramify:14`: `createTestSystem` → `TestSystem` (descendants)
- `module.ramify:22`: `AppRouter` → `AssembledSystem` (descendants)
- `subs/workspace/module.ramify:11`: `inspect` → `RecordId`, `InspectionReport`, `RevisionScope`, `ObservationCallback` (parent)
- `subs/workspace/module.ramify:15`: `InspectionPort` → `ObservationCallback`, `InspectionReport`, `RevisionScope`, `RecordId` (parent)
- `subs/workspace/subs/catalog/subs/core/module.ramify:10`: `makeCatalogFixture` → `CatalogFixtureRecord` (parent)
- `subs/workspace/subs/catalog/subs/ui/module.ramify:9`: `CatalogCard` → `CatalogCardProps` (parent)
- `subs/workspace/subs/reviews/subs/core/module.ramify:12`: `createReviewRuntime` → `ReviewRuntime` (parent)
- `subs/workspace/subs/reviews/subs/core/subs/controller/module.ramify:6`: `tick` → `TaskVerdict`, `ScheduledTask` (parent)
- `subs/workspace/subs/reviews/subs/core/subs/tasks/module.ramify:8`: `runInspectionTask` → `InspectionTaskResult`, `InspectionTaskInput` (parent)
- `subs/workspace/subs/reviews/subs/core/subs/tasks/module.ramify:9`: `summarizeTaskResult` → `InspectionTaskResult`, `TaskSummary` (parent)
- `subs/workspace/subs/reviews/subs/ui/module.ramify:9`: `ReviewPanel` → `ReviewPanelProps` (parent)

Reference example `signature-inferred` notes: 10, and no `signature-unresolved`:

- `createCatalogRouter` (`catalog/src/router.ts:16`)
- `createReviewsRouter` (`reviews/src/router.ts:22`)
- In `contracts/src/interfaces/vocabulary.ts`: `recordIdSchema`, `revisionSchema`, `revisionChainSchema`,
  `revisionScopeSchema`, `findingSchema`, `inspectionReportSchema`, `reviewStatusSchema`, `observationSchema`

### Companion pass timing (indicative, for iteration 5)

Measured over the batch reports' frozen models in one Node process, 12 runs each; the machine was shared.

| Measure | Toolkit (1,353 originals, 985 exposures) | Reference example (89, 79) |
| --- | --- | --- |
| Pass median, `companionOutputs` including a fresh exposure index | 10.6 ms | 1.1 ms |
| First run | 29.5 ms | 2.9 ms |
| Rule alone, median, `listCompanionViolations` | 5.1 ms | not measured |
| Tiny project, resident revision `companions` timing | 0.06 ms | |

The toolkit median is within SC24's 20 ms. About half of it is the diagnostic and note projection:
building an original map by `originalKey` and hashing the findings. Iteration 5 measures the stage timing
through the session.

### Checks run

- `npm run type-check` (all four compiler scopes): passes.
- `npx vitest run subs/analysis subs/daemon subs/cli src/tests/batch-cli.test.ts src/tests/resident-cli.test.ts
  src/tests/companion-cli.test.ts`: 117 files, 1,810 tests, all pass. This includes the new
  `companion-findings.test.ts` (3 tests) and `companion-cli.test.ts` (2 tests).
- Before the fixture annotations and timing-key updates, the pre-existing failures were:
  - coverage `partial` from the new inference notes: 27 tests in `session.test.ts`, 1 in
    `retained-session.test.ts`, 2 in `session-revision.test.ts` and 3 in `batch-cli`/`resident-cli`;
  - the new timing key: 2 tests in `session-revision.test.ts`, 2 in `session-worker.test.ts` and 1 in
    `ipc.test.ts`.
- `npm run build`, then with an owned `RAMIFY_ENDPOINT_DIR`: `npm run check:self` (resident) and
  `dist/src/ramify check --root . --batch` both exit 1 with the list above. The daemon was stopped with
  that build's `daemon stop`.
- `dist/src/ramify check --root examples/collection-review --batch`: exit 1 with the list above.
- SC19: the installed executable against a real daemon, as transcribed. Its daemon was stopped and its
  endpoint directory removed.
- Not run: the full test suite and the reference harness gate. SC26 runs Plan 1's reference gate in iteration 5.

## Deviations and decisions within scope

- **Scope additions outside the named owners.** These were required for the contract to work at all:
  - the `SourceLimit` code union in `typescript`'s interface, where the notes live in the report;
  - `daemon`'s wire codec for the new timing key;
  - the harness helpers that construct `SessionFacts` or list timing keys.
- **`companions` timing is inside `decide`.** The stages stay disjoint: `decide` still covers the pass, and
  `companions` is a field beside it, not added to the sum.
- **Position in the message.** The message names the naming position, as the runnable outcome shows, so a
  move changes the message and the ID. The revision's `delta` reports such a move as one added and one removed
  finding, not `positionOnly`. The existing `diagnosticSurface()` compares messages, and this follows the
  existing identity rules as the plan asks. `--changed` marks the moved finding `new`, as it does for a moved
  import diagnostic.
- **Note location and evidence.** A note is located at the original's first declaration and names no related
  location. Its ID changes when the declaration moves, as a batch run's would.
- **Reuse rule.** Outputs are reused only when the revision keeps the same model object, on the metadata path
  and on narrow paths that neither relink nor patch. Any relinked or position-patched model runs the pass
  again. This is simpler than comparing inputs, and exact.
- **Fixture annotations.** Exposed fixture constants and one function in pre-existing tests were annotated so
  those tests keep asserting complete coverage. The alternative was to expect the new `signature-inferred`
  notes in tests unrelated to signatures. Iteration 2 recorded that the literal `inferred` fact includes
  literal-initialized constants; narrowing it remains the user's decision.

## Handoff

### To iteration 4 (remediation)

- The toolkit's 56 findings and the reference example's 23 above. They are all `not-visible`, so each needs the
  named companion exposed at the statement's destination, or the companion removed from the signature.
  Several statements expose many symbols: `subs/daemon/module.ramify:18` has 8 findings and
  `subs/presentation/module.ramify:12` has 6.
- Two toolkit statements report both destinations, `subs/analysis/module.ramify:10` and `:13`.
- The root `module.ramify` findings are to-descendants exposures of root-owned or relayed symbols.
- The 10 plus 10 `signature-inferred` notes are nonblocking. Iteration 4 records the remaining count for
  iteration 5.
- `ramify-agent/` and other consumers see the new finding code, category `exposure`, the message forms
  above, the two note codes and the `companions` timing key. A strict consumer of `RevisionTimings`, like the
  daemon codec, must accept the new key.

### To iteration 5 (evidence)

- `RevisionTimings.companions` is the pass's stage timing on every revision, and each report's decide stage
  includes it. The indicative medians are above.
- `SessionFacts.companions` adds the findings and notes to the retained facts, and so to `factBytes`. On the
  toolkit that is 56 diagnostics and 10 notes before remediation.
