# Iteration 4 results: Toolkit and reference example conform; teaching and architecture text

**Date:** 2026-09-21. **Mode:** direct work in worktree `/tmp/ramify-plan8-signature-companions`,
branch `feat/plan8-signature-companions`, based on iteration 3's commit `bd337e1`. The results are committed
with the remediation.

## Prerequisites

- Iteration 3's finding list reproduced exactly on the rebuilt HEAD: 56 toolkit and 23 reference findings, all
  `not-visible`, and 10 plus 10 `signature-inferred` notes.
- Iteration 3 recorded 4,525 allowed toolkit accesses. HEAD reports 4,524, verified by stashing this iteration's
  changes and rerunning the batch check. The remediation leaves it at 4,524.
- RD-1 to RD-7 and the rule are unchanged. No fixture expectation, severity or rule was relaxed (SC21).

## How the findings were corrected

The rule reports a missing companion only at the first step that carries the symbol beyond it. Fixing a step
can therefore reveal a finding at the next re-exposure step, and an exposed companion is itself subject to the
rule. The check was rerun until it was clean:

| Round | Toolkit findings | Reference findings |
| ---: | ---: | ---: |
| Iteration 3's list | 56 | 23 |
| After the first corrections | 66 | 1 |
| 2 | 11 | 0 |
| 3 | 1 | |
| 4 | 0 | |

Each finding got one of two corrections. Most got the first:

- **Expose the companion through the same steps.** The companion is written into the same statement, or into a
  new statement from the file that declares it, and into every relay that carries the symbol further.
- **Change the signature.** Used where the companion is internal state or internal geometry that no importer
  could construct.

No owner had a curated `src/interfaces/` wildcard that a companion could move into, so no vocabulary moved
between files. No `requires-tag` finding occurred.

## Toolkit: signatures changed

| Signature | Change | Reason |
| --- | --- | --- |
| `ModelDiagramProps.layout?: DiagramLayout` (`presentation/src/ModelDiagram.tsx`) | Removed. `ModelDiagram` and `ModelDiagramSvg` take the layout from the memoized `diagramLayout(definition)` | `DiagramLayout` names the whole placement geometry: `TreeGeometry`, `PropagationLayout`, `ChordsLayout`, `LegendLayout`, `HeaderLayout`, `Point` and their own members, from four internal files. The builder is not exposed, so no importer could produce a value for the prop. No caller outside presentation passed one: the site, the emitter script and the tests pass `definition` only. |
| `TreeDiagramProps.layout?: TreeDiagramLayout` (`TreeDiagram.tsx`) | Removed. An internal `renderTreeDiagramSvg(props, layout)` lets the page wrapper still lay out once | `TreeDiagramLayout` names `TreeNodeLayout`, `TreeConnectorLayout`, `TreeNoteLayout` and `Box`, the same internal geometry. |
| `FocusDiagramProps.layout?: FocusDiagramLayout` (`FocusDiagram.tsx`) | Removed, with an internal `renderFocusDiagramSvg(props, layout)` | `FocusDiagramLayout` names `FocusCardLayout`, `FocusMapLayout`, `TreeNoteLayout` and `Box`. |

The exposed components and their props are otherwise unchanged. The emitted diagrams and render tests pass
unchanged.

## Toolkit: exposure statements changed

Line numbers are the pre-iteration ones iteration 3 lists. "Revealed" marks a statement whose finding appeared
only after an earlier step was fixed.

| Statement | Change | Reason |
| --- | --- | --- |
| `module.ramify:9` (R8, `expose-test createQuickEnvironment, QuickEnvironment`) | None; corrected at `:63` | `DaemonService`, `ApiViewPublisher` and `AnalysisDriver` are daemon vocabulary, so root's daemon relay is where they belong. |
| `module.ramify:17` (R4 project relay) | + `ObservationSink`, `ObservationRetirement` | `ProjectObserver`'s members name both. |
| `module.ramify:20` (R4 source relay), revealed | + `SuppliedAccesses`, `DependencyBehaviorFacts`, `DependencyBehaviorFact`, `DependencyBehaviorAccessFact`, `BehaviorClassification`, `BehaviorEvidence`, `BehaviorLimit` | `SourceAnalysis` names the first two, and the behavior facts name the rest. This also corrects `:23`'s `AnalysisSnapshot`. |
| `module.ramify:31` (R10) | + `DependencyAnalyzerTimings` | `DependencyAnalyzerOutcome` names it. |
| `module.ramify:38` (R5), revealed | + `TreeFocus`, `WhatIfNote`, `NodeContentOptions`, `DecisionPolicy`, `LegendGroup`, `LegendEntry`, `TracedSymbol`, `TracedColorKey`, `ChordSpec`, `Theme`, `SymbolName`, `ViewRect` | The definitions and props it relays name them. |
| `module.ramify:45` (module tree relay), revealed | + `ModuleTreeIndex` | `indexModuleTree`, `ancestorsOf` and `collapsibleAtDepth` name it. |
| `module.ramify:54` (service-api router and web process) | + `ExplorerWebProcess`, `ExplorerRouterOptions`, `ExplorerWebProcessOptions`, `DependencyViews`, `DependencyViewsStatus`, `DependencyViewCounters` | The first is `startExplorerWebProcess`'s result. The others were revealed as the next companions. |
| `module.ramify:56` (project binding), revealed | + `ProjectBindingOptions`, `ProjectBindingConnector`, `ProjectBindingLogEntry` | `createProjectBinding`'s options and their members. |
| `module.ramify:60` (P5 explorer), revealed | + `ProjectExplorerPageProps`, `BrowserPage`, `ProjectExplorerBrowserApp`, `ExplorerClient`, `ProjectViewResult` | The page's props and the browser app's parameters and result. |
| `module.ramify:63` (R7 daemon relay) | + `MaterializedViewId`, `DaemonService`, `ServiceLease`, `ApiViewPublisher`, `PublishInput`, `RenderedApiViewArea`, `RenderedApiViewDocument`, `PublishApiViewOutcome`, `AnalysisDriver`, `WatchBatch`, `CaptureTimings`, `CaptureWork` | `MaterializedTarget`, `QuickEnvironment`, `createQuickEnvironment`, `ContextRevision`, `ReplyTimings`, `WatcherPort` and `ControlledWatcher` name these, and the added ones name the rest. |
| `subs/analysis/module.ramify:10` (A7) | + `ObservationRetirement` | `ProjectObserver` names it, to parent and to descendants. |
| `subs/analysis/module.ramify:13` (A8) | + `SuppliedAccesses`, `DependencyBehaviorFacts`, `DependencyBehaviorFact`, `DependencyBehaviorAccessFact`, `BehaviorClassification`, `BehaviorEvidence`, `BehaviorLimit` | `SourceAnalysis` names the first two. This also corrects `:17`'s `AnalysisSnapshot`. |
| `subs/analysis/module.ramify:51` (A13, `expose-src planApiViewRequests, projectApiView from "api-view.ts" to parent`) | **Removed**, with its comment | Both signatures name `SessionFacts`, the retained session's internal state, and `projectApiView` also names `ApiViewProjectOutcome`. `SessionFacts` names `FileFacts`, `AccessDecision`, `CompanionOutputs`, `FactIndexes` and `InvalidAcquisition`. No module imports either function across the boundary: root does not, and the only other caller is the reference harness, which has a separate compiler scope and imports `session-facts.ts` directly. Exposing the retained state would have been gratuitous, so the projection stays internal, as A16 already keeps the architect planning functions internal. |
| `subs/analysis/subs/typescript/module.ramify:14` (Plan 2A) | + `DeclarationInputs` | `describeSymbolDetails`'s parameter. Its members name `ProjectInventory` and `SourceArea`, which analysis already receives. |
| `subs/daemon/module.ramify:18` (N5) | + `ApiViewQueryLimits`, `WatchBatch`, `ApiViewRequest`, `ContextApiViewOutcome`, `ContextDependencyFactsOutcome`, `CaptureTimings`, `CaptureWork` | Named by `ContextManagerOptions`, `ContextManager`, `ContextRevision`, `ReplyTimings`, `WatcherPort` and `ControlledWatcher`. |
| `subs/explorer/module.ramify` | New: `ProjectExplorerPageProps` from `ProjectExplorerPage.tsx`; `BrowserPage` and `ProjectExplorerBrowserApp` from `browser-app.tsx`; `ExplorerClient` and `ProjectViewResult` from `published-project-view.ts`, all to parent | The `:4` and `:5` findings, plus `ProjectViewResult`, which was revealed. Their tags are the header's required-importer default `[ui, dispatch]`. |
| `subs/presentation/module.ramify:8` (comment) | "owned props, no implicit exposure of types they mention" becomes "owned props and definitions; the vocabulary they name is exposed below" | The old comment described the pre-rule contract. |
| `subs/presentation/module.ramify` (V4 to V7) | New: `TreeFocus` from `tree-diagram.ts`; `WhatIfNote`, `NodeContentOptions`, `DecisionPolicy`, `LegendGroup`, `LegendEntry`, `TracedSymbol`, `TracedColorKey`, `ChordSpec` from `diagram-definition.ts`; `Theme` from `theme.ts`; `SymbolName` from `model-access.ts`; `expose-sub ViewRect from layout`, all to parent | Named by the props and definitions at `:9` to `:14`. `LegendEntry` and `TracedColorKey` were revealed. The layout types were removed from the signatures instead, as recorded above. |
| `subs/presentation/module.ramify:35` (P4 relay), revealed | + `ModuleTreeIndex` | Carries the project-view functions that name it. |
| `subs/presentation/module.ramify:40` | + `LayoutGraphInput`, `LayoutNodeInput`, `LayoutEdgeInput`, `LayoutOptions`, `LayoutResult`, `LayoutNode`, `LayoutEdge`, `Box` | `placeTree`'s signature and its companions' members. |
| `subs/presentation/subs/project-view/module.ramify:16` | New `expose-src ModuleTreeIndex from "module-tree.ts" to parent` | The three tree functions name it. |
| `subs/service-api/module.ramify:7` | + `ExplorerRouterOptions` | `createExplorerRouter`'s parameter. |
| `subs/service-api/module.ramify:8` | + `ExplorerWebProcessOptions`, and a new `DependencyViews, DependencyViewsStatus, DependencyViewCounters` statement from `dependency-view.ts` | `startExplorerWebProcess`'s parameter and `ExplorerWebProcess`'s member. The last two were revealed. |
| `subs/service-api/module.ramify:11` | + `ProjectBindingOptions`, `ProjectBindingConnector`, `ProjectBindingLogEntry` | `createProjectBinding`'s parameter and its members. |

## Reference example: exposure statements and signatures changed

All 23 findings, and the one revealed at `catalog`, are corrected. Statement IDs are the contract map's. The
[contract map](../../reference-project/contract-map.md) records each change, including a new
"Plan 8: signature companions" log entry, and its explanatory paragraphs now describe the new contract.

| Statement | Change | Reason |
| --- | --- | --- |
| R1 (`module.ramify:9`) | + `ToolInputSchema`, `ToolResult` | `McpToolContribution`'s members name them. |
| R1 (same line), `ProtocolFacilities` | **Signature:** `Pick<ReturnType<typeof createFacilities>, …>` becomes `Pick<ReturnType<ReturnType<typeof initTRPC.context<InvocationContext>>['create']>, …>` | `typeof createFacilities` made the root's configured runtime factory a companion. Exposing it would have given descendants the runtime the root deliberately keeps private. The new form names only the external `initTRPC` and the already exposed `InvocationContext`. The assembly passes `createFacilities()` where `ProtocolFacilities` is expected, so the two cannot drift. |
| R2 (`:14`) | + `TestSystem`, `McpSession` | `createTestSystem`'s result and its member. Both are testing-owned with `[testing, dispatch]`. |
| R3 (`:22`) | + `assembleRouter`, re-exported type-only from `interfaces/protocol.ts` | `AppRouter` was `AssembledSystem['router']`, and `AssembledSystem.router` was `ReturnType<typeof assembleRouter>`, an unexported function. Any name for the inferred tRPC router type must name a value, so the narrowest companion is the function that builds the router. **Signatures:** `assembleRouter` is now exported and takes `ProtocolFacilities` instead of a local alias of `typeof createFacilities`; `AppRouter` is `ReturnType<typeof assembleRouter>`; `AssembledSystem.router` is `AppRouter`. The `export type` re-export lets importers name it only in type positions. |
| W1 (`subs/workspace/module.ramify:6`) | `to descendants` becomes `to parent, descendants` | `inspect` (as `inspectRecord`, W2) and `InspectionPort` (W4) reach the root, and their signatures name `RecordId`, `InspectionReport`, `RevisionScope` and `ObservationCallback`. |
| K2, A4, W3 | + `CatalogFixtureRecord` | `makeCatalogFixture`'s element type, exposed through the same three steps. |
| KU1, A6 | + `CatalogCardProps` (now exported) | `CatalogCard`'s parameter was an unexported local interface: a companion that no statement could expose. |
| A5 (`catalog/module.ramify:20`), revealed | `to descendants` becomes `to parent, descendants` | `CatalogCardProps` names `CatalogSummary`, and the card reaches `workspace`. |
| RC2 | + `ReviewRuntime` | `createReviewRuntime`'s result. |
| TK1, TK2, RC3 | + `InspectionTaskInput`, `InspectionTaskResult`; + `TaskSummary`; RC3 relays all three | The task operations' parameters and results. |
| CT1 (`tick`), no statement change | **Signature:** `tick(scheduled: ScheduledTask): TaskVerdict \| undefined` becomes `tick(scheduled: InspectionTaskInput): TaskSummary \| undefined` | The two unexported local aliases were companions no statement could expose. The controller now receives the real types through RC3. |
| RU1, RV5 | + `ReviewPanelProps` (now exported) | `ReviewPanel`'s parameter, previously an unexported local interface. |

The comments in each changed `module.ramify` and source file were rewritten where they argued the pre-rule
position that a consumer "builds them through contextual typing rather than by importing them". Four owner
READMEs were updated in the same way: the example's `README.md`, `workspace`, `catalog/ui` and `tasks`.

**Expected-decision fixtures.** The baseline had no denied import, so no import changed from denied to allowed
and no expected decision changed. The pinned description and contract fixtures changed with the statements:

- `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`: the reviewed statements of every changed
  toolkit and reference `module.ramify`, including the removed A13.
- `scripts/reference-harness/linking-expectations.ts`: R1, R2, R3, W1, K2, A4, A5, A6, KU1, TK1, TK2, RC2, RC3,
  RU1 and RV5 carry their added names and destinations. `ToolInputSchema` and `ToolResult` were pinned as
  "private, no accidental exposure" and are now exposed, so that list checks `createFacilities` and `loadReview`
  in their place.
- `scripts/reference-harness/catalog.test.ts`: `assembleRouter`, `CatalogCardProps` and `ReviewPanelProps` join
  the expected exports.
- `reference-baseline.ts` and `resident-expectations.ts`: originals 89 → 92, accesses 294 → 298, allowed
  166 → 169, external 128 → 129, and `coverageNotes` 0 → 11. The notes count includes iteration 3's 10
  `signature-inferred` notes, which those pins did not yet expect, plus one for `assembleRouter`.
- The source-edit anchors in `increment-cases.ts`, `equivalence-sequences.ts` and
  `scripts/measurements/resident-driver.mjs` now match the new `AppRouter` line. The inserted text and the edits'
  meaning are unchanged.

## Teaching and architecture text (SC22)

- **Site, `site/src/pages/model.mdx`.** A new section, "Exposing a signature", defines signature companions and
  what counts. It works through one application-agnostic example: `shipping`'s child `routing` exposes
  `optimizeRoute(plan: ShipmentPlan, options: RouteOptions)` to its parent without `RouteOptions`. The finding
  shown is the exact output of the built CLI on that project, run in a scratch copy. The section gives both
  corrections, re-exposure, the one-level rule, the tag condition, and "Ramify never adds the exposure itself".
- **Site glossary.** `site/src/pages/glossary.md` reproduces the model glossary's new "Signature companion" entry.
- **`CLAUDE.md`.** The model summary now states the rule after the exposure-forms paragraph: the visibility and
  tag conditions, the finding code, the first step that lacks the companion, a valid model, no supplied exposure
  and no opt-out.
- **`docs/architecture/daemon.md`.**
  - Under "Implemented retained session", a new "Signature companions" paragraph records:
    - the per-original companion facts, including which parts are surface and which are positional;
    - collection with one batched symbol request per file;
    - the compiler-free `description` path;
    - the per-model exposure index, which is not retained;
    - the retained findings and notes and their reuse rule;
    - that there is no reverse index and no verdict cache.
  - The exposure-paths paragraph keeps "there is no automatic signature-type exposure" and links to the rule.
- The model documents were changed in iteration 1. They were read for consistency and not edited here.

## Evidence

| ID | Case | Result |
| --- | --- | --- |
| SC21 | `npm run check:self` (resident): exit 0, `check: passed`, 0 errors, 10 analysis limits, 4,524 allowed, 0 denied. `dist/src/ramify check --root . --batch` gives the same. The reference example, batch and resident (`npm run check:reference`): exit 0, 0 errors, 2 warnings (the unchanged `vite.config.ts` and `vitest.config.ts`), 11 analysis limits, 169 allowed, 0 denied. Every changed statement and signature is listed above, and no rule, severity or expectation was relaxed | pass |
| SC22 | The site page, the site glossary, `CLAUDE.md` and `daemon.md` state the delivered rule. They follow the writing conventions: expose/receive, re-expose, no "grant" or "route" for exposure, and one glossary definition | pass |
| Exit | Zero `exposed-without-companion` findings on the toolkit and the reference example | pass |

### Remaining `signature-inferred` notes (handoff to iteration 5)

- **Toolkit: 10, unchanged from iteration 3.** No `signature-unresolved`.
  - `createControlledClock`
  - `LAYOUT`, `wrapText`, `MIN_SCALE`, `MAX_SCALE`, `wheelFactor`, `DRAG_THRESHOLD`
  - `createProjectExplorerModel`, `createExplorerRouter`, `probeExplorerReadiness`
- **Reference example: 11.** No `signature-unresolved`.
  - iteration 3's 10 notes: `createCatalogRouter`, `createReviewsRouter` and the eight vocabulary schemas;
  - plus `assembleRouter`, whose tRPC router return type is inferred by design.

### Checks run

- `npm run type-check`, all four compiler scopes: passes.
- `npm run build`: passes.
- `npx vitest run subs/presentation subs/explorer subs/service-api subs/analysis/subs/descriptions
  subs/analysis/subs/typescript/src/tests/symbol-details.test.ts`: 35 files, 565 tests, all pass.
- `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/catalog.test.ts
  scripts/reference-harness/linking.test.ts`: 2 files, 34 tests, all pass. These include "matches the unchanged
  reference contract map statement by statement".
- The checks in SC21 above. The resident runs used an owned short `RAMIFY_ENDPOINT_DIR`, and that daemon was
  stopped with the build's `daemon stop`.
- In `examples/collection-review`: `npm run type-check`, `npx vitest run` (20 files, 77 tests) and
  `npm run test:cucumber` (1 scenario, 12 steps) all pass.
- In `site/`: `npm run build` passes.
- Not run: the full toolkit test suite and the full reference harness gate. SC26 runs the gate in iteration 5.

## Deviations and decisions within scope

- **One exposure removed rather than extended (A13).** The exposed signatures named the retained session's
  internal state, which no module needed. Removing the unused exposure narrows analysis's contract. The
  alternative was to expose `SessionFacts` and its five internal companion types to root.
- **Presentation props narrowed.** The `layout` prop was removed from three public props types instead of
  exposing at least 11 internal geometry types, and their own companions, from six files. The alternative would have forced exposure of the
  whole placement model, which nothing outside presentation can build.
- **Unexported locals and `typeof` values are companions.** Two reference cases, the `tick` aliases and the two
  local props interfaces, were companions that could not be exposed until they were exported. Two more, `typeof
  createFacilities` and `typeof assembleRouter`, made a function a companion. The rule treats both as it treats
  any owned original, as the principles define. This is recorded as model behavior, not a gap. It affects any
  consumer whose exported types are derived from values, as tRPC router types are.
- **Harness pins updated outside the named owners.** The reference harness is a separate scope, but it pins the
  example's statements, exports, counts and edit anchors. Its pins were updated so that iteration 5's gate
  measures the conforming example. Only the two harness files named above were run. Other harness cases may
  still pin text this iteration changed; SC26 is where that shows.
- `ramify-agent/` was not edited.

## Handoff to iteration 5

- **The toolkit conforms.** It is the real-project measurement case: 15 owners, 432 source files, 6,486 accesses
  and 10 `signature-inferred` notes, with 0 findings.
- **The reference example conforms.** It has 92 originals, 298 accesses and 11 notes.
- **Exposure growth.** Named selections in the toolkit's descriptions went from 608 to 706, counted per
  statement and including relays: 100 added and the 2 of A13 removed. Measure the companion pass and `factBytes` against SC24 and SC25 on this state, not on
  iteration 3's.
- **SC26.** Run the full reference gate. The harness pins listed above were updated; any other harness case that
  pins the old example text will fail there first.
