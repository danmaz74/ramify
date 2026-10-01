# Plan 3 owners, declarations and placement

**Prepared:** 2026-09-11. **State:** draft review package for
[Plan 3](main-plan.md); iteration 1 accepts it or records its revision. These
are the required final declaration texts and the source and test placement the
inspection commands add; implementation and acceptance evidence are verified
separately by the gates. [contracts.md](contracts.md) holds the exact
signatures and wire schemas, [scope.md](scope.md) the consumer, spelling,
availability and detail decisions and [subcases.md](subcases.md) the executable
instances. The definitive
[description specification](../../model/module-description.spec.md) and
[importability principles](../../model/cross-module-importability.principles.md)
remain authoritative, and
[Plan 1 owners](../done/iteration-1-project-verifier/owners.md) and
[Plan 2 owners](../done/iteration-2-resident-verification/owners.md) are the
implemented starting point. The texts below repeat an owner in full where this
plan changes it and mark the owners it leaves untouched.

No owner is added: the eleven-owner tree stands, and every edge is a physical
`subs/` edge. Each iteration activates the exposure lines it needs together
with the real exports they name, so no intermediate build exposes a name
without its export. Comment IDs are review evidence, not syntax. This plan
adds exactly three declaration lines, M7, A13 and A14, whose IDs continue the
numbering of [Plan 5's owners](../iteration-5-fast-incremental-checks/owners.md);
Plan 5 is implemented in parallel and its IDs are never reused here. Name
lists this plan does not change are abbreviated with `…` and expand from the
Plan 2 and Plan 1 texts; every name this plan adds to a list is spelled in
full. Where Plan 5 also edits an abbreviated list or a README paragraph, the
plan that merges second keeps both sides' additions, as
[scope.md](scope.md#coexistence-with-plan-5) fixes.

## The eleven-owner tree

```text
ramify [dispatch]                       + the inspect service and batch operations; the inspection vocabulary relay
├── analysis []                         + the consumer rule, the inspection queries and the symbol-details capability
│   ├── model [browser]                 + the availability listing and explanation; no rule change
│   ├── descriptions [browser]          unchanged
│   ├── project []                      unchanged
│   └── typescript []                   + symbol details from the live compiler
├── daemon [dispatch]                   + validation and binding of the inspect operation
│   └── contexts []                     unchanged
├── presentation [ui, browser]          unchanged
│   └── layout [browser]                unchanged
└── cli [dispatch]                      + available, inspect and explain over the ramify.inspect/1 document
```

## Root: ramify

**Directory:** `./`. **README first paragraph** (unchanged; the root assembles
one more operation from the same owners):

> Ramify assembles the command line, the resident daemon and lazy batch analysis from its owners, defines the dispatch-facing service vocabulary that the daemon implements, and keeps executable dispatch separate from portable model and presentation entries.

Complete final `module.ramify`. R1, R6, R8, the syntax R4 line and R5 are
byte-identical to Plan 2; the unchanged heads of R2, R3, the source-catalog R4
line and R7 are abbreviated with `…` and expand from the
[implemented file](../../../module.ramify):

```ramify
ramify 1
module "ramify" tagged [dispatch]

// R1: invocation vocabulary for the injected CLI operation.
expose-src * from "interfaces/batch.ts" to descendants
// R6: dispatch-facing service vocabulary, implemented by daemon.
expose-src * from "interfaces/service.ts" to descendants
// R8: testing-only quick environment for CLI, daemon and root tests.
expose-test createQuickEnvironment, QuickEnvironment from "quick-environment.ts" to descendants

// R2: model originals received through analysis, with the availability contract.
expose-sub ModuleId, … , explainImport, ConsumerArea, AvailabilityForm, AvailabilityReason, MissingHop, OriginalAvailability, listAvailability, explainAvailability from analysis to descendants

// R4: syntax vocabulary relayed unchanged from analysis.
expose-sub TextSpan, … , LinkedDescriptions from analysis to descendants

// R4: project vocabulary relayed unchanged from analysis.
expose-sub ProjectRequest, … , RetainedConfiguration from analysis to descendants

// R4: source catalog and symbol-detail vocabulary relayed from analysis.
expose-sub CatalogOriginal, … , SourceAnalysis, SymbolKind, SymbolDetail, DetailLimits, SymbolDetails from analysis to descendants

// R3: complete analysis report, operation and inspection vocabulary.
expose-sub Capability, … , AnalysisSession, ConsumerLocation, Consumer, DetailLevel, InspectionQuery, SymbolDetailView, AvailableSymbol, ProviderGroup, AvailabilityListing, OwnExposure, UsageRow, UsageListing, ModuleSummary, SymbolExplanation, InspectionResult, InspectionUnavailable, InspectionInputs from analysis to descendants

// R5: declaration-only UI relay; root source imports none of these.
expose-sub DiagramDefinition, … , shopFocusDiagram from presentation to descendants

// R7: resident vocabulary and controlled test ports relayed unchanged from daemon.
expose-sub ContextId, … , ControlledWatcher, ControlledClock from daemon to descendants
```

Lines this plan changes. Each relay is extended in the iteration that
declares the vocabulary it carries, so root's description is edited once per
contract rather than once per consumer:

- R2 gains the two availability values `listAvailability` and
  `explainAvailability` and the five vocabulary names `ConsumerArea`,
  `AvailabilityForm`, `AvailabilityReason`, `MissingHop` and
  `OriginalAvailability` in iteration 3, which root receives through analysis
  A5 and relays the way it relays `explainImport` today. The values keep
  model's `[browser]` promise across the relay.
- R3 gains, in iteration 3, the sixteen inspection names root receives from
  analysis A13:
  `ConsumerLocation`, `Consumer`, `DetailLevel`, `InspectionQuery`,
  `SymbolDetailView`, `AvailableSymbol`, `ProviderGroup`,
  `AvailabilityListing`, `OwnExposure`, `UsageRow`, `UsageListing`,
  `ModuleSummary`, `SymbolExplanation`, `InspectionResult`,
  `InspectionUnavailable` and `InspectionInputs`. `answerInspection` and
  `resolveConsumer` are **not** relayed: root imports them itself and injects
  them, so no descendant can call an analysis value.
- The source-catalog R4 line gains `SymbolKind`, `SymbolDetail`,
  `DetailLimits` and `SymbolDetails` in iteration 4, which root receives
  through analysis A8, so a descendant naming a detail state can spell its
  type.
- R1, R6, R8, the syntax and project R4 lines, R5 and R7 keep their text.
  `interfaces/batch.ts` gains `InspectInvocation`, `InspectResult` and
  `InspectOperation` inside the R1 wildcard in iteration 7, and
  `interfaces/service.ts` gains `InspectParams`, `InspectOutcome`,
  `RamifyService.inspect` and the `inspect` operation and capability members
  inside the R6 wildcard in iteration 8. Both are expansions of an existing
  wildcard contract and need no new line.

Root source: `src/interfaces/batch.ts` extended and `src/batch.ts` gains
`runInspection` beside `runBatch`, with `src/cli-entry.ts` injecting it
lazily (iteration 7); `src/interfaces/service.ts` extended and
`src/resident-assembly.ts` passes the inspection engine to
`createDaemonService` (iteration 8). `src/client.ts`, `src/daemon-entry.ts`,
`src/publication-queue.ts`, `src/report-capacity.ts` and
`src/resident-budgets.ts` keep their roles. Root tests:
`src/tests/inspect-batch.test.ts` (iteration 7) over the injected operation,
`src/tests/inspect-resident.test.ts` (iteration 8) over the resident path,
and `src/tests/quick-environment.ts` mirrors the `inspect` method in process
(iteration 8). `src/tests/entry-boundaries.test.ts` keeps its traced entry
closures and asserts that no CLI entry loads the engine through the injected
inspection operation.

## Analysis

**Directory:** `subs/analysis/`. **README first paragraph** (revised, because
the owner answers queries over a completed snapshot; Plan 5 revises the same
paragraph in its iteration 9, and the merge keeps both clauses):

> Analysis composes one captured project view, source facts, descriptions and model decisions into disposable batch work, immutable reports and retained stage products that a later run over unchanged inputs may reuse, and answers availability, module and explanation queries for one consumer source area over a completed snapshot. It owns stage outcomes, input identity and computational invalidation so every client consumes the same completed analysis.

Complete final `module.ramify` (A6, A7 and the unchanged head of A8 are
abbreviated):

```ramify
ramify 1
module analysis

// A5: portable model vocabulary relayed unchanged, including availability.
expose-sub * from model to parent, descendants

// A6: syntax vocabulary available to assembly and acquisition.
expose-sub TextSpan, … , LinkedDescriptions from descriptions to parent, descendants

// A7: project vocabulary supplied to assembly and children.
expose-sub ProjectRequest, … , RetainedConfiguration from project to parent, descendants

// A8: current source catalog and symbol-detail vocabulary.
expose-sub CatalogOriginal, … , SourceAnalysis, SymbolKind, SymbolDetail, DetailLimits, SymbolDetails from typescript to parent, descendants

// A1/A4: validation operations and implemented analysis vocabulary.
expose-src validateProject from "validation.ts" to parent
expose-src * from "interfaces/analysis.ts" to parent

// A2: inventory and source-profile assembly for production selection.
expose-src acquireInventory from "inventory.ts" to parent

// A3: disposable batch sessions and the direct service binding.
expose-src createAnalysisSession from "session.ts" to parent
expose-src analyzeProject from "analyze-project.ts" to parent

// A9: project resolution and increment entry as Plan 1 and Plan 2 left them.
expose-src analyzeIncrement from "increment.ts" to parent
expose-src resolveProject from "resolve-project.ts" to parent

// A13: plain-data inspection vocabulary for the root's operations.
expose-src * from "interfaces/inspection.ts" to parent
// A14: the consumer rule and the query answer, injected by root.
expose-src answerInspection, resolveConsumer from "inspection.ts" to parent
```

Lines this plan changes:

- A13 and A14 are new in iteration 3 with `src/interfaces/inspection.ts` and
  `src/inspection.ts`. Both name `parent` only: root receives them, relays the
  vocabulary of A13 through R3 and keeps the two values to itself, so the
  daemon and the CLI receive data and no algorithm.
- A8 gains `SymbolKind`, `SymbolDetail`, `DetailLimits` and `SymbolDetails` in
  iteration 4, so analysis's own `details` stage names them and root relays
  them onward. Both destinations stay as they are.
- A5 is unchanged: its wildcard already carries model's contract to parent and
  descendants, so the availability values and vocabulary of M7 and M1 reach
  root without a line change.
- A1 to A4, A6, A7 and A9 keep their text. `interfaces/analysis.ts` gains
  `'symbol-details'` in `Capability`, `'details'` in `StageId`,
  `AnalysisSnapshot.details` and `AnalysisLimits.details` inside the A4
  wildcard in iteration 6. Plan 5 removes the six increment types and the
  `analyzeIncrement` line of A9 in its own iteration 9; this plan neither adds
  nor removes a name there.

New source: `src/interfaces/inspection.ts` (the query, consumer, listing,
summary, usage and explanation vocabulary) and `src/inspection.ts`
(`resolveConsumer` and `answerInspection`), both iteration 3. Changed source:
`src/index.ts` exports the two functions and relays the inspection types
(iteration 3); `src/inspection.ts` gains the explanation and module branches
over the vocabulary iteration 3 declared (iteration 5), reads
`snapshot.details` (iteration 6) and gains the optional details input of the
join (iteration 9); `src/interfaces/analysis.ts` and `src/run-analysis.ts`
gain the `details` stage between `access` and the compiler disposal
(iteration 6). No source is removed.

New tests: `src/tests/consumer.test.ts` (the consumer rule over the reference
inventory, including the tests area, a module directory outside `src/` and a
location outside the root) and `src/tests/inspection-available.test.ts` (the
listing, grouping, spellings, filters, limits and ordering), both iteration 3;
`src/tests/inspection-explain.test.ts` (the explanation, its facts and its
labeled proposals) and `src/tests/inspection-usage.test.ts` (the module
summary and the incoming usage of owned originals), both iteration 5; and
`src/tests/details-stage.test.ts` (the capability requested and not requested,
the stage failure leaving `decide` completed, and the report growth bound),
iteration 6. No test is removed.

## Model

**Directory:** `subs/analysis/subs/model/`. **README first paragraph**
(revised, because the owner now enumerates what one area may import as well as
deciding one access):

> The model defines canonical module and original identities, validates the shared tag registry, derives source profiles, and explains visibility and importability from grounded exposure evidence, including the complete set of originals available to one consumer source area and the exposure hops a blocked original is missing, without filesystem, compiler or UI dependencies.

Complete final `module.ramify`:

```ramify
ramify 1
module model tagged [browser]

// M1: portable owned vocabulary.
expose-src * from "interfaces/model.ts" to parent
// M2-M6: values explicitly promise browser-safe transitive closures.
expose-src resolveTagRegistry, createDefaultTagRegistry from "registry.ts" tagged [browser] to parent
expose-src deriveSourceAreas, assignOriginalTags from "profiles.ts" tagged [browser] to parent
expose-src originalKey from "identity.ts" tagged [browser] to parent
expose-src buildModel from "model.ts" tagged [browser] to parent
expose-src explainVisibility, explainImport from "decisions.ts" tagged [browser] to parent
// M7: availability of every original to one consumer source area.
expose-src listAvailability, explainAvailability from "availability.ts" tagged [browser] to parent
```

Lines this plan changes:

- M7 is new in iteration 2 with `src/availability.ts`. It carries the same
  `tagged [browser]` promise as M2 to M6, because the two values are portable
  data functions over a `Model` and are relayed to the site and the diagrams
  through A5 and R2 like every other model value.
- M1 to M6 are unchanged. `interfaces/model.ts` gains `ConsumerArea`,
  `AvailabilityForm`, `AvailabilityReason`, `MissingHop` and
  `OriginalAvailability` inside the M1 wildcard in iteration 2, which is an
  expansion of that contract and needs no new line.

New source: `src/availability.ts` (iteration 2), which holds the one-pass
enumeration, the classification and the missing-hop computation. Changed
source: `src/interfaces/model.ts` (iteration 2); `src/index.ts` exports the
two functions and the five types (iteration 2); `src/decisions.ts` is
**untouched until iteration 9**, when the shared tag-rule helper moves into
`availability.ts` and `explainImport` calls it, after Plan 5's indexed lookups
in `decisions.ts` and `model.ts` have merged. New test:
`src/tests/availability-listing.test.ts` (iteration 2), named apart from the
existing `src/tests/availability.test.ts`, which keeps its retained truth
table and gains the case asserting that the listed visible set equals
`explainVisibility` over every original. `src/tests/decisions.test.ts` gains
the iteration 9 regression for the shared helper. No test is removed.

## TypeScript

**Directory:** `subs/analysis/subs/typescript/`. **README first paragraph**
(revised, because the owner describes named originals from the live compiler;
Plan 5 revises the same paragraph in its iterations 3 and 5, and the merge
keeps both clauses):

> The TypeScript adapter owns compiler sessions and resolution state, extracts complete export and original catalogs, records bounded source-access facts, and describes named originals with a body-free signature, declaration text and documentation while its program and checker are alive. It separates real resource identity from declaration shims and returns plain data and explicit analysis limits.

Complete final `module.ramify`, unchanged from Plan 1:

```ramify
ramify 1
module typescript

// T1-T2: compiler service and detached catalog vocabulary.
expose-src createSourceAnalysis from "source-analysis.ts" to parent
expose-src * from "interfaces/source.ts" to parent
```

T1 and T2 are unchanged and this plan adds no line. `interfaces/source.ts`
gains `SymbolKind`, `SymbolDetail`, `DetailLimits` and `SymbolDetails`, the
`SourceAnalysis.details` method and the two new `SourceLimit.code` values
inside the T2 wildcard in iteration 4; the operation reaches its callers as a
method of the service T1 already exposes, so no owned value is added.
`describeOriginals` stays a private export of `src/details.ts`, executed
inside the helper process and never named across the owner boundary; the
harness calls it from its own compiler scope, which is package access rather
than internal exposure.

New source: `src/details.ts` (iteration 4). Changed source, all iteration 4:
`src/wire.ts` (the `details` request and reply), `src/compiler-helper.ts`
(serving it from the live program and checker after `catalog`),
`src/bridge.ts` and `src/source-analysis.ts` (the method on the detached
service) and `src/interfaces/source.ts`. `src/catalog.ts`, `src/accesses.ts`,
`src/namespace-uses.ts` and `src/resolution.ts` keep their roles. New test:
`src/tests/details.test.ts` (iteration 4), covering the kinds, merged
overloads, documentation, bounded truncation, the explicit failure of an
unknown original, determinism and the deadline. No source or test is removed.

## Daemon

**Directory:** `subs/daemon/`. **README first paragraph** (unchanged; the
service gains one validated operation over the same binding):

> Daemon owns the resident process: the validated in-process service that implements the root's service interface over its contexts child, the local socket host and its discovery records, the lightweight client that other processes use to reach it, the wire codec, and the real filesystem watcher and clock ports.

Complete final `module.ramify`, unchanged from Plan 2 (the N5 list is
abbreviated):

```ramify
ramify 1
module daemon tagged [dispatch]

// N1: in-process service binding and real ports.
expose-src createDaemonService, dispatchServiceRequest from "service.ts" to parent
expose-src createFilesystemWatcher from "filesystem-watcher.ts" to parent
expose-src createSystemClock from "system-clock.ts" to parent
// N2: lightweight client, codec and discovery.
expose-src connectDaemon from "connect-daemon.ts" to parent
expose-src encodeMessage, decodeMessage from "codec.ts" to parent
expose-src selectEndpoint, readDaemonRecord from "discovery.ts" to parent
// N3: the process host.
expose-src startDaemon from "start-daemon.ts" to parent
// N4: owned transport, lifecycle and service-binding vocabulary.
expose-src * from "interfaces/daemon.ts" to parent
// N5: neutral context vocabulary, ports and controlled test ports relayed unchanged.
expose-sub AnalysisDriver, … , ControlledWatcher, ControlledClock from contexts to parent
```

N1 to N5 are unchanged and this plan adds no line. `interfaces/daemon.ts`
gains `InspectionEngine` and `DaemonServiceOptions.inspection` inside the N4
wildcard in iteration 8; the engine is a port the root assembly fills, so the
daemon still imports no analysis value.

Changed source, all iteration 8: `src/validation.ts` (the `inspect` request,
its query record and the rejections), `src/service.ts` (the binding over the
context manager's existing `check`, the `snapshot-not-retained` outcome and
the `dispatchServiceRequest` case), `src/connection.ts` and
`src/connect-daemon.ts` (the mirrored method and the `inspect` capability in
the welcome). The codec, host, discovery, records and watcher are untouched,
and no transport changes. In iteration 9 the binding obtains the report from
the compact history's projection and requests details from the retained
session for the listed originals. Tests: `src/tests/validation.test.ts` gains
the accepted and rejected `inspect` requests and `src/tests/service.test.ts`
gains the published, synchronized, evicted and no-snapshot answers (iteration
8). No source or test is added or removed.

## CLI

**Directory:** `subs/cli/`. **README first paragraph** (revised, because the
CLI renders availability listings and explanations; Plan 5 revises the same
paragraph in its iteration 10, and the merge keeps both clauses):

> The CLI parses supported arguments, reaches the resident daemon through an injected connector or runs an injected batch operation, formats completed reports, availability listings, module summaries and symbol explanations, streamed revisions and daemon status, and selects the documented process exit code. It contains no checking algorithm and keeps help, version and status independent of compiler and server startup.

Complete final `module.ramify`, unchanged from Plan 1:

```ramify
ramify 1
module cli tagged [dispatch]

// C1: the command entry point.
expose-src runCli from "run-cli.ts" to parent
// C2: owned argument, environment and document vocabulary.
expose-src * from "interfaces/cli.ts" to parent
```

C1 and C2 are unchanged and this plan adds no line. `interfaces/cli.ts` gains
`CliEnvironment.inspect` and `InspectDocument` inside the C2 wildcard in
iteration 7. The two new command files are private source of this owner: they
are reached through `runCli`, which C1 already exposes.

New source: `src/inspect-commands.ts` (the three commands over
`environment.inspect` and, from iteration 8, `connection.inspect`, reusing
`check-command.ts`'s connection, reopen and terminating-command fallback
rules) and `src/inspect-format.ts` (the human rendering of the listing, the
summary, the usage sections and the labeled proposals), both iteration 7.
Changed source: `src/arguments.ts` (the three commands, their options, the
rejections and the extended help), `src/run-cli.ts` (the dispatch),
`src/errors.ts` (the new reasons) and `src/interfaces/cli.ts`, all iteration
7; `src/inspect-commands.ts` gains the resident path in iteration 8.
`src/format.ts`, `src/check-command.ts`, `src/watch-command.ts`,
`src/daemon-command.ts` and `src/command-support.ts` keep their roles. New
test: `src/tests/inspect-format.test.ts` (iteration 7);
`src/tests/arguments.test.ts` gains the three commands and their invalid
invocations (iteration 7). The resident flows are covered by root's
`src/tests/inspect-resident.test.ts` through the quick environment, as Plan 2
covers `check`. No source or test is removed.

## Unchanged owners

`descriptions`, `project`, `contexts`, `presentation` and `layout` keep their
declarations, READMEs, source and tests byte for byte. The consumer rule reads
`InventoryModule.directory` and `InventoryArea.root` from the vocabulary
`project` already exposes through P2 and analysis A7, and `contexts` answers
the `inspect` operation through the `check` path it already implements;
iteration 9 consumes Plan 5's compact history through its reviewed contract
without adding a Plan 3 line to either owner.

## Placement outside every owner

The four probes of iteration 1 live under `scripts/probes/inspection/` with
their results under `scripts/probes/results/`, and the measurement recipe is
`scripts/measurements/inspect.mjs` beside the resident recipe, with raw
results under `scripts/measurements/results/`. The harness gains
`scripts/reference-harness/plan3-instances.ts` beside `plan2-instances.ts`,
with `verify.ts`, `plan.ts` and `instances.ts` extended for `--plan 3`. All
three areas are independent compiler scopes outside every owner's `src/`, so
the check's outside-source warnings stay as Plan 1 fixed them, and their
direct imports of owner source are package access, not internal exposure.

## Package entries

No package entry is added or removed. The eight entries `.`, `./analysis`,
`./analysis/inventory`, `./model`, `./presentation`, `./layout`, `./cli` and
`./client` and `bin.ramify` stand exactly as Plan 2 left them. The `./model`
entry gains `listAvailability` and `explainAvailability` and the `./analysis`
entry gains `answerInspection` and `resolveConsumer`, which are changes of
those entries' exports, not of the entry map;
`scripts/validate-final-contracts.ts` is extended in iteration 11 to expect the
new witnesses. The `./cli` and `./client` closures are unchanged: neither
loads an engine, compiler or helper module.

## Foreign signature types

Rows this plan adds. `X → parent → descendants` means exposure to the direct
parent followed by that parent's explicit relay. Every row preserves the
original owner and tags; a type mentioned in a signature is never implicitly
exposed.

| Consumer | Foreign originals it names | Named exposure path | Form and tags |
| --- | --- | --- | --- |
| Analysis | `listAvailability`, `explainAvailability`, `ConsumerArea`, `AvailabilityForm`, `AvailabilityReason`, `MissingHop`, `OriginalAvailability` in `interfaces/inspection.ts` and `src/inspection.ts` | model M1, M7 → analysis A5 | Values `[browser]`; types `[browser]`. Analysis has no required-symbol constraint, so the promise is satisfied. |
| Analysis | `SymbolKind`, `SymbolDetail`, `DetailLimits`, `SymbolDetails` in `interfaces/analysis.ts`, `interfaces/inspection.ts` and `src/run-analysis.ts` | typescript T2 → analysis A8 | Types `[]`; the `details` method arrives on the `SourceAnalysis` value T1 exposes. |
| TypeScript | `OriginalId` in `interfaces/source.ts` and `src/details.ts`, beside the model vocabulary it names today | model M1 → analysis A5 → descendants | Type `[browser]`; no new path. |
| Root | `answerInspection`, `resolveConsumer` in `src/batch.ts` and `src/resident-assembly.ts`, beside `analyzeProject` and `createDefaultTagRegistry` | analysis A14 → root | Values `[]`; root has no required-symbol constraint. Neither value is relayed to a descendant. |
| Root | `InspectionQuery`, `InspectionResult`, `InspectionUnavailable`, `InspectionInputs`, `Consumer`, `AnalysisSnapshot` in `interfaces/batch.ts`, `interfaces/service.ts` and `src/batch.ts` | analysis A13, A4 → root | Types `[]`. |
| Daemon | `InspectionQuery`, `InspectionInputs`, `InspectionResult`, `InspectionUnavailable` in `interfaces/daemon.ts`, `src/validation.ts` and `src/service.ts` | analysis A13 → root R3 → descendants | Untagged types into daemon `[dispatch]`; no engine value import. |
| CLI | `InspectionQuery`, `InspectionResult`, `AvailabilityListing`, `ModuleSummary`, `SymbolExplanation`, `AvailableSymbol`, `SymbolDetailView`, `OriginalAvailability`, `MissingHop`, `AvailabilityReason`, `RevisionId` in `interfaces/cli.ts`, `src/inspect-commands.ts` and `src/inspect-format.ts` | analysis A13 → root R3 → descendants; model M1 → analysis A5 → root R2 → descendants; daemon N5 → root R7 → descendants | Untagged and `[browser]` types into CLI `[dispatch]`; type positions only, so no browser promise is required of the CLI. |
| CLI | `InspectOperation`, `InspectInvocation`, `InspectResult` in `interfaces/cli.ts` and `src/inspect-commands.ts`; `InspectOutcome`, `InspectParams` in `src/inspect-commands.ts` | root R1; root R6 | Dispatch-owned types into CLI `[dispatch]`. The operation itself is injected, never imported. |
| Harness, probes and measurement scripts | `listAvailability`, `explainAvailability`, `resolveConsumer`, `answerInspection`, `describeOriginals`, `analyzeProject` and the vocabulary they return | Separate compiler scopes | Package access and script scopes are not internal exposure. |

## Activation manifest

| Iteration | Owner | Lines activated or extended |
| --- | --- | --- |
| 2 | model | M7 activated with `listAvailability` and `explainAvailability`; `ConsumerArea`, `AvailabilityForm`, `AvailabilityReason`, `MissingHop` and `OriginalAvailability` join the M1 wildcard. |
| 2 | analysis, root | None; A5's wildcard relays model's extended contract to parent and descendants unchanged, and root's relay waits for the consumers of iteration 3. |
| 3 | analysis | A13 activated with `interfaces/inspection.ts`; A14 activated with `answerInspection` and `resolveConsumer`. |
| 3 | root | R3 extended with the sixteen inspection names; R2 extended with the two availability values and the five model vocabulary names, so the two relays are declared in one edit. |
| 4 | typescript | No line change; `SymbolKind`, `SymbolDetail`, `DetailLimits`, `SymbolDetails`, `SourceAnalysis.details` and the two `SourceLimit.code` values join the T2 wildcard. |
| 4 | analysis | A8 extended with the four detail names. |
| 4 | root | The source-catalog R4 line extended with the same four detail names. |
| 5 | none | No line change and no new type; the explanation and module branches implement the vocabulary A13 already declares. |
| 6 | analysis | No line change; `'symbol-details'`, `'details'`, `AnalysisSnapshot.details` and `AnalysisLimits.details` join the A4 wildcard. |
| 7 | root | No line change; `InspectInvocation`, `InspectResult` and `InspectOperation` join the R1 wildcard. |
| 7 | cli | No line change; `CliEnvironment.inspect` and `InspectDocument` join the C2 wildcard. |
| 8 | root | No line change; `InspectParams`, `InspectOutcome`, `RamifyService.inspect` and the `inspect` operation and capability members join the R6 wildcard. |
| 8 | daemon | No line change; `InspectionEngine` and `DaemonServiceOptions.inspection` join the N4 wildcard. |
| 9 | analysis, model, daemon | No line change; the optional details input sits behind A14, the shared tag-rule helper behind M7 and M6, and the projection behind N1. |
| 10 | none | No new originals or exposures; the process evidence and the measurements consume the complete contract. |
| 11 | all | No new originals or exposures; `scripts/validate-final-contracts.ts` compares the eleven final texts and the eight package entries with this document. |

## Manual description review

| Review obligation | Review finding, 2026-09-11 |
| --- | --- |
| Valid physical boundaries | No owner is added or moved; every description stays beside its owner's `src/`, and each new source file is an ordinary `src/` file of its owner. `scripts/probes/inspection/`, `scripts/measurements/` and `scripts/reference-harness/` stay outside every owner's `src/`. |
| Exact paths and real staged exports | The three new lines are `expose-src` statements naming one explicit `.ts` file relative to `src/`: `availability.ts`, `interfaces/inspection.ts` and `inspection.ts`. The activation manifest pairs each with the iteration that implements its exports. |
| Owned wildcards select only owned originals | `interfaces/inspection.ts` defines its types locally; the model, typescript and project types it names are `import type` and are never re-exported. The same holds for `interfaces/model.ts`, `interfaces/source.ts`, `interfaces/analysis.ts`, `interfaces/service.ts`, `interfaces/batch.ts`, `interfaces/daemon.ts` and `interfaces/cli.ts`, so `expose-src *` remains valid for each of them. |
| Interface-file wildcards | A13's `*` selects one explicitly named file beneath `subs/analysis/src/interfaces/`, as the rule requires. M7 and A14 use named selections for files directly under `src/`, where `*` would be invalid. |
| Foreign signatures need independent paths | The foreign signature table names every foreign original each consumer adds; M7, M1, A5, A8, A13, A14, R1, R2, R3, R4, R6 and R7 enumerate them. No consumer names a type it receives through no declared path. |
| Expose-sub names direct children and complete hops | A5 and A8 name `model` and `typescript`, direct children of `analysis`; R2, R3 and R4 name `analysis`, a direct child of the root. No statement names a grandchild or a sibling, and the daemon and CLI reach the inspection vocabulary through root's explicit relay, never through analysis directly. |
| Exposure and availability remain separate | `daemon` and `cli` receive the inspection vocabulary and name it, and still cannot import `answerInspection` or `resolveConsumer`: root keeps both values and injects them, so the query algorithm crosses no boundary as a value. |
| Mandatory tags | M7 repeats model's `[browser]` promise, as M2 to M6 do, because the relayed values are used by the site and the diagrams. The analysis and root values this plan adds default to their owners' header tags, `[]` and `[dispatch]`; no new line uses `tagged` elsewhere. Every detail and inspection name is a type and carries no promise. |
| Profile derivation and testing origin | Every new test lives in its owner's `src/tests/`, whose profile is the owner's header tags plus `testing`. No test needs a tag its owner does not declare, so no testing module under `subs/` is required. The listing itself never offers a testing-classified original to an ordinary consumer area. |
| Names, destinations and collisions | Each added name has one original: the five availability types and two values are model's, the four detail types are typescript's, the sixteen inspection types and two query values are analysis', and `InspectParams`, `InspectOutcome`, `InspectInvocation`, `InspectResult` and `InspectOperation` are root's. `InspectionEngine` is daemon's own port and `InspectDocument` the CLI's own document; neither collides with an analysis name. |
| Empty and growth semantics | Adding an export to `interfaces/model.ts`, `interfaces/source.ts`, `interfaces/analysis.ts`, `interfaces/inspection.ts`, `interfaces/batch.ts`, `interfaces/service.ts`, `interfaces/daemon.ts` or `interfaces/cli.ts` deliberately expands that wildcard contract, which is why every addition is listed here with its iteration. I3-05 `wildcard-growth-reflected` asserts that behavior on the reference project. |
| Coexistence with Plan 5 | The three new lines carry IDs Plan 5 does not use; every other change is an appended name on an existing line or an added member behind an existing wildcard. No Plan 5 line is reordered, renumbered or reformatted, and the four shared README paragraphs are revised by appended clauses that survive either merge order. |
