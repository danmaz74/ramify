# Plan 5 owners, declarations and placement

**Prepared:** 2026-09-11. **State:** draft review package for
[Plan 5](main-plan.md); iteration 1 accepts it or records its revision. These
are the required final declaration texts and the source and test placement the
retained session adds or removes. Implementation and acceptance evidence are
verified separately by the gates. [contracts.md](contracts.md) holds the exact
signatures and wire schemas, [scope.md](scope.md) the lifecycle decisions and
[subcases.md](subcases.md) the executable instances. The definitive
[description principles](../../model/module-description.principles.md) and
[importability principles](../../model/cross-module-importability.principles.md)
remain authoritative. Plan 1's nine declarations and Plan 2's eleven-owner
completion are the implemented starting point:
[Plan 1 owners](../done/iteration-1-project-verifier/owners.md) and
[Plan 2 owners](../done/iteration-2-resident-verification/owners.md). The texts
below repeat an owner in full where this plan changes it and mark the owners
it leaves untouched.

No owner is added: the eleven-owner tree stands, and every edge is a physical
`subs/` edge. The session worker is a source file of `analysis`, the way
`compiler-helper.ts` is a source file of `typescript`. Each iteration activates
the exposure lines it needs together with the real exports they name; iteration
9 removes the Plan 2 increment line in the same commit as the source it names,
so no intermediate build exposes a name without its export. Comment IDs are
review evidence, not syntax; name lists that this plan does not change are
abbreviated with `…` and expand from the Plan 2 and Plan 1 texts.

## The eleven-owner tree

```text
ramify [dispatch]                       CLI, daemon and batch entries; service vocabulary; assembly
├── analysis []                         + the retained session, its facts, revisions, audit and worker host
│   ├── model [browser]                 + indexed decision lookups; no rule and no name change
│   ├── descriptions [browser]          unchanged
│   ├── project []                      + the project observer, local inventory updates and the sweep
│   └── typescript []                   + per-file descriptions, the hoisted interpreter, the retained adapter
├── daemon [dispatch]                   + validation of the extended check parameters; no transport change
│   └── contexts []                     + the session driver port, compact history, covering rendezvous, hot and warm
├── presentation [ui, browser]          unchanged
│   └── layout [browser]                unchanged
└── cli [dispatch]                      + check --changed, --since, --deadline and the delta document
```

## Root: ramify

**Directory:** `./`. **README first paragraph** (unchanged):

> Ramify assembles the command line, the resident daemon and lazy batch analysis from its owners, defines the dispatch-facing service vocabulary that the daemon implements, and keeps executable dispatch separate from portable model and presentation entries.

Complete final `module.ramify`. The R2, syntax R4, source-catalog R4 and R5
name lists are byte-identical to Plan 2 and abbreviated with `…`; the full
lists are in the [implemented file](../../../module.ramify):

```ramify
ramify 1
module "ramify" tagged [dispatch]

// R1: invocation vocabulary for the injected CLI operation.
expose-src * from "interfaces/batch.ts" to descendants
// R6: dispatch-facing service vocabulary, implemented by daemon.
expose-src * from "interfaces/service.ts" to descendants
// R8: testing-only quick environment for CLI, daemon and root tests.
expose-test createQuickEnvironment, QuickEnvironment from "quick-environment.ts" to descendants

// R2: unchanged model originals received through analysis.
expose-sub ModuleId, … , explainImport from analysis to descendants

// R4: syntax vocabulary relayed unchanged from analysis.
expose-sub TextSpan, … , LinkedDescriptions from analysis to descendants

// R4: project vocabulary relayed unchanged from analysis.
expose-sub ProjectRequest, ProjectScope, CapturedInput, InventoryArea, ModulePurpose, InventoryModule, InventoryFile, ExactReference, OutsideSourceWarning, ProjectInventory, ProjectIssue, AcquisitionLimits, ProjectInputView, ProjectReadOptions, ProjectRead, ProjectResolution, RetainedConfiguration, InputChangeKind, ObservedChange, InventoryUpdate, ProjectObserver, ProjectObserve from analysis to descendants

// R4: source catalog vocabulary relayed unchanged from analysis.
expose-sub CatalogOriginal, … , SourceAnalysis from analysis to descendants

// R3: complete analysis report, session and operation vocabulary.
expose-sub Capability, StageId, RunControl, AnalysisLimits, AnalysisInputs, InventoryInputs, InventorySnapshot, InventoryRun, ValidationRun, CapabilityExecution, StageExecution, AnalysisCode, AnalysisDiagnostic, AccessResult, AnalysisSnapshot, AnalysisSummary, AnalysisReport, AnalysisRun, AnalysisSession, SessionLimits, SessionInputs, SessionChange, RevisionPath, CheckedSet, FindingDelta, RevisionTimings, SessionRevision, SessionUpdate, VerifyOutcome, SessionStatus, RetainedSession, SessionOpen from analysis to descendants

// R5: declaration-only UI relay; root source imports none of these.
expose-sub DiagramDefinition, … , shopFocusDiagram from presentation to descendants

// R7: resident vocabulary and controlled test ports relayed unchanged from daemon.
expose-sub ContextId, GenerationId, RevisionId, LeaseId, ContextToken, ContextSetup, ContextSelection, InputFingerprints, RevisionCause, ContextRevision, ContextState, SynchronizationState, ContextStatus, ExpectedContent, Freshness, FreshnessRecord, CheckRequest, CheckDelta, UnavailableReason, Unavailable, CheckOutcome, OpenOutcome, ContextEvent, SubscriptionHandle, WatchEvent, WatcherHandle, WatcherPort, ClockPort, ContextBudgets, DaemonInstance, LogEntry, DaemonBudgets, EndpointSelection, DaemonRecord, StopDisposition, Handshake, Welcome, ConnectTimeouts, ConnectOptions, ConnectionState, DisconnectReason, RecoveryOutcome, ServiceConnection, ConnectOutcome, ServiceConnector, WireMessage, createControlledWatcher, createControlledClock, ControlledWatcher, ControlledClock from daemon to descendants
```

Lines this plan changes, all in iteration 9:

- R3 loses `InputChange`, `RetainedStageId`, `RetainedStage`,
  `RetainedAnalysis`, `IncrementInputs` and `IncrementRun` with the
  increment types, and gains the thirteen session names `SessionLimits`,
  `SessionInputs`, `SessionChange`, `RevisionPath`, `CheckedSet`,
  `FindingDelta`, `RevisionTimings`, `SessionRevision`, `SessionUpdate`,
  `VerifyOutcome`, `SessionStatus`, `RetainedSession` and `SessionOpen`, which
  root receives from analysis A11 and relays to descendants the way it relays
  today's report vocabulary.
- The project R4 line gains `InputChangeKind`, `ObservedChange`,
  `InventoryUpdate`, `ProjectObserver` and `ProjectObserve`. Contexts names
  `ObservedChange` where it turns watcher paths into session changes.
  `ObservationSink` stays inside analysis's subtree, where `typescript` names
  it: no root descendant does.
- R7 gains `CheckDelta`, which daemon receives from contexts N5 and root
  relays to CLI.
- R1, R6, R8, R2, the syntax and source-catalog R4 lines and R5 are unchanged.
  `interfaces/service.ts` gains `CheckParams.scope`, `since`, `deadlineMs` and
  the six daemon counters inside the R6 wildcard in iteration 10, which is an
  expansion of that contract and needs no new line.

Root source: `src/resident-assembly.ts` exports `createSessionDriver()` in
place of `createAnalysisDriverFromSessions`, which is removed (iteration 9);
`src/resident-budgets.ts` gains `maxHotContexts`, `sweepIntervalMs`,
`updateDeadlineMs`, `workerHeapMiB` and `maxRetainedFactBytes` and loses
`verificationIntervalMs` (iteration 9); `src/interfaces/service.ts` is extended
(iteration 10); `src/cli-entry.ts`, `src/client.ts`, `src/daemon-entry.ts` and
`src/batch.ts` keep their roles. Root tests: `src/tests/quick-environment.ts`
builds its environment over the session driver, `src/tests/resident-assembly.test.ts`
covers `createSessionDriver`, and `src/tests/resident-cli.test.ts` gains the
`--changed` flows; `src/tests/entry-boundaries.test.ts` keeps the traced entry
closures and asserts that no CLI entry loads the session, worker or compiler.
Root source imports from daemon only the values daemon exposes to parent, and
never a contexts file directly.

## Analysis

**Directory:** `subs/analysis/`. **README first paragraph** (revised, because
the retained stage products this plan removes are replaced by the session):

> Analysis composes one captured project view, source facts, descriptions and model decisions into disposable batch work, immutable reports and a retained session whose revisions recompute only the facts a change reaches. It owns stage outcomes, input identity and computational invalidation so every client consumes the same completed analysis.

Complete final `module.ramify` (A6 and A8 unchanged and abbreviated):

```ramify
ramify 1
module analysis

// A5: portable model vocabulary relayed unchanged.
expose-sub * from model to parent, descendants

// A6: syntax vocabulary available to assembly and acquisition.
expose-sub TextSpan, … , LinkedDescriptions from descriptions to parent, descendants

// A7: project vocabulary supplied to assembly and children.
expose-sub ProjectRequest, ProjectScope, CapturedInput, InventoryArea, ModulePurpose, InventoryModule, InventoryFile, ExactReference, OutsideSourceWarning, ProjectInventory, ProjectIssue, AcquisitionLimits, ProjectInputView, ProjectReadOptions, ProjectRead, ProjectResolution, RetainedConfiguration, ObservationSink, InputChangeKind, ObservedChange, InventoryUpdate, ProjectObserver, ProjectObserve from project to parent, descendants

// A8: current source catalog vocabulary.
expose-sub CatalogOriginal, … , SourceAnalysis from typescript to parent, descendants

// A1/A4: validation operations and implemented analysis vocabulary.
expose-src validateProject from "validation.ts" to parent
expose-src * from "interfaces/analysis.ts" to parent

// A2: inventory and source-profile assembly for production selection.
expose-src acquireInventory from "inventory.ts" to parent

// A3: disposable batch sessions and the direct service binding.
expose-src createAnalysisSession from "session.ts" to parent
expose-src analyzeProject from "analyze-project.ts" to parent

// A9: project resolution for the resident driver.
expose-src resolveProject from "resolve-project.ts" to parent

// A11/A12: the retained session and its plain-data vocabulary.
expose-src * from "interfaces/session.ts" to parent
expose-src openRetainedSession from "retained-session.ts" to parent
```

Lines this plan changes:

- A7 gains `ObservationSink` and the five observer names in iteration 4, so
  analysis's own session source names the observer and the retained adapter
  of iteration 5 names the sink it reports to, exactly as `resolution.ts`
  names `ProjectInventory` and `InventoryFile` today. Both destinations stay
  as they are: to parent, so root relays the vocabulary onward, and to
  descendants, so `typescript` receives the sink.
- A11 and A12 are new in iteration 6 with `interfaces/session.ts` and
  `openRetainedSession`. Iterations 7 and 8 complete the session vocabulary
  inside the A11 wildcard and add the worker host behind A12, with no further
  line.
- A9's `expose-src analyzeIncrement from "increment.ts" to parent` is
  **removed** in iteration 9; `resolveProject` stays on its own line. The A4
  wildcard is unchanged while `interfaces/analysis.ts` loses the six increment
  types in the same iteration.

New source: `src/interfaces/session.ts` (the session vocabulary, iteration 6),
`src/retained-session.ts` (`openRetainedSession` and the session handle,
iteration 6), private `src/session-facts.ts` (retained per-file facts and the
reverse indexes, iteration 6), private `src/session-revision.ts` (the revision
step, its paths, position refresh and the finding delta, iterations 6 and 7),
private `src/session-audit.ts` (`verify`, iteration 7) and
`src/session-worker.ts` (the worker entry, its resource limits and the frozen
message boundary, iteration 8). Removed source: `src/increment.ts`,
`src/retained-products.ts`, the retained input of `src/run-analysis.ts` and the
retained variant of `src/session.ts` (iteration 9). `src/index.ts` exports
`openRetainedSession` and the session type relays and loses the two increment
exports.

New tests: `src/tests/retained-session.test.ts` (the source-edit paths and the
checked sets), `src/tests/session-revision.test.ts` (description, metadata and
broad paths, positions and deltas), `src/tests/session-audit.test.ts`
(`verify` equal and mismatch), `src/tests/session-worker.test.ts` (the worker
boundary, resource limits and disposal). Removed tests:
`src/tests/increment.test.ts` and `src/tests/retained-products.test.ts`
(iteration 9); `src/tests/report-copy.test.ts` keeps its plainness assertions
over `SessionRevision` instead of `RetainedAnalysis`.

## Project

**Directory:** `subs/analysis/subs/project/`. **README first paragraph**
(revised, because the observer makes acquisition live):

> Project selects and acquires one real project, validates its physical ownership layout and exact paths, and supplies coherent captured input reads. It resolves the root and compiler configuration on request, records raw source areas, configuration selection, outside-module warnings and README purpose metadata, can reuse its configuration product when its captured dependencies are unchanged, and can keep its observations live for a retained session, updating the inventory locally, rebuilding it for structural changes and re-observing its whole observed set, without deciding import permissions.

```ramify
ramify 1
module project

// P1-P2: acquisition service and owned vocabulary.
expose-src readProject from "read-project.ts" to parent
expose-src * from "interfaces/project.ts" to parent

// P3: root and configuration resolution without source acquisition.
expose-src resolveProjectRoot from "resolve-root.ts" to parent
// P4: live observation of one project for the retained session.
expose-src observeProject from "observer.ts" to parent
```

P4 is new in iteration 4 with `observeProject`; P1, P2 and P3 are unchanged.
`interfaces/project.ts` gains `ObservationSink`, `InputChangeKind`,
`ObservedChange`, `InventoryUpdate`, `ProjectObserver` and `ProjectObserve`
inside the P2 wildcard in the same iteration. The observer implements the
sink, and iteration 5's retained adapter reports its filesystem callbacks to
it.

New source: `src/observer.ts` (`observeProject`, the observation table, local
and structural updates and the sweep) and private `src/observations.ts`
(recorded roles, identities, signatures and the `inputId` recipe shared with
`read-project.ts`), both iteration 4. `src/read-project.ts`,
`src/capture.ts`, `src/configuration.ts`, `src/inventory.ts`, `src/purpose.ts`
and `src/resolve-root.ts` keep their roles; the observer performs Plan 1's
acquisition once through them. New tests: `src/tests/observer.test.ts` (local,
structural, invalid and unchanged updates, and README and description reads)
and `src/tests/sweep.test.ts` (`reobserve` and identity equality with
`readProject`). No source or test is removed.

## TypeScript

**Directory:** `subs/analysis/subs/typescript/`. **README first paragraph**
(revised, because the owner gains per-file descriptions and a retained
adapter):

> The TypeScript adapter owns compiler sessions and resolution state, describes the exports and originals of each file with the inputs that description depended on, assembles them into complete catalogs, and records bounded source-access facts through an interpreter it sets up once. It keeps one live snapshot in a retained adapter, reports every filesystem observation it makes, separates real resource identity from declaration shims, and returns plain data and explicit analysis limits.

```ramify
ramify 1
module typescript

// T1-T2: compiler service and detached catalog vocabulary.
expose-src createSourceAnalysis from "source-analysis.ts" to parent
expose-src * from "interfaces/source.ts" to parent
// T3: the hoisted access interpreter.
expose-src createAccessInterpreter from "access-interpreter.ts" to parent
// T4: per-file export descriptions and their assembly.
expose-src describeFiles, assembleCatalog from "descriptions.ts" to parent
// T5: the retained compiler adapter with one live snapshot.
expose-src createRetainedSourceAnalysis from "retained-source-analysis.ts" to parent
```

T1 and T2 are unchanged. T3, T4 and T5 are new in iterations 2, 3 and 5.
Analysis names `createRetainedSourceAnalysis` to open the session's adapter,
`assembleCatalog` to project a report from the descriptions the session
retains, and `describeFiles` and `createAccessInterpreter` in the audit that
recomputes from the warm compiler. `interfaces/source.ts` gains
`AccessInterpreter` (iteration 2), `DescriptionDependencies`,
`FileDescription` and `CatalogDelta` (iteration 3) and `SourceChangeSet`,
`RetainedSourceInputs` and `RetainedSourceAnalysis` (iteration 5) inside the
T2 wildcard. `RetainedSourceInputs.sink` names project's `ObservationSink`,
received through analysis A7, the way `resolution.ts` names `ProjectInventory`
and `InventoryFile` today; this owner defines no observation type.

New source: `src/access-interpreter.ts` (iteration 2),
`src/descriptions.ts` (iteration 3) and `src/retained-source-analysis.ts`
(iteration 5). Changed source: `src/namespace-uses.ts` (the lazy
spelling-filtered identifier index) and `src/accesses.ts` (`collectAccesses`
becomes a private wrapper over the interpreter) in iteration 2;
`src/catalog.ts` (`buildCatalog` becomes `assembleCatalog(describeFiles(...))`
with its signature unchanged) in iteration 3. `src/compiler-helper.ts`,
`src/bridge.ts`, `src/wire.ts`, `src/resolution.ts` and
`src/source-analysis.ts` stay as the batch path. New tests:
`src/tests/access-interpreter.test.ts`, `src/tests/descriptions.test.ts` and
`src/tests/retained-source-analysis.test.ts`; `src/tests/accesses.test.ts`
gains the shadowing and query-count cases and `src/tests/catalog.test.ts` the
assembled-equals-whole case. No test is removed.

## Daemon

**Directory:** `subs/daemon/`. **README first paragraph** (unchanged):

> Daemon owns the resident process: the validated in-process service that implements the root's service interface over its contexts child, the local socket host and its discovery records, the lightweight client that other processes use to reach it, the wire codec, and the real filesystem watcher and clock ports.

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
expose-sub AnalysisDriver, ContextId, GenerationId, RevisionId, LeaseId, ContextToken, ContextSetup, ContextSelection, InputFingerprints, RevisionCause, ContextRevision, ContextState, SynchronizationState, ContextStatus, ExpectedContent, Freshness, FreshnessRecord, CheckRequest, CheckDelta, UnavailableReason, Unavailable, CheckOutcome, OpenOutcome, ContextEvent, SubscriptionHandle, WatchEvent, WatcherHandle, WatcherPort, ClockPort, ContextBudgets, ContextManagerOptions, ContextManager, createControlledWatcher, createControlledClock, ControlledWatcher, ControlledClock from contexts to parent
```

N5 gains `CheckDelta` in iteration 9; N1 to N4 are unchanged. Source:
`src/validation.ts` accepts `scope`, `since` and `deadlineMs` and rejects
anything else as `invalid-request` (iteration 10); `src/service.ts` passes the
extended request through unchanged; the codec, host, discovery, records,
client and watcher are untouched. Tests: `src/tests/validation.test.ts` gains
the three parameters and their rejections and `src/tests/service.test.ts` the
compact reply. No source or test is added or removed.

## Contexts

**Directory:** `subs/daemon/subs/contexts/`. **README first paragraph**
(revised, because retained products are replaced by a session handle and a
compact history):

> Contexts keeps each selected project root isolated as a context with its own generation, orders its updates and requests into one queue, publishes immutable revisions atomically, and bounds compact history, sessions, leases and idle lifetime. It drives one retained analysis session through a neutral port, answers a request from the published revision when that revision already covers the identities it names, and never reads project files or transport objects itself.

```ramify
ramify 1
module contexts

// X1 and X2: context manager and transport-independent vocabulary.
expose-src createContextManager from "context-manager.ts" to parent
expose-src * from "interfaces/contexts.ts" to parent
// X3: controlled ports for consumer tests.
expose-test createControlledWatcher, createControlledClock, ControlledWatcher, ControlledClock from "controlled-ports.ts" to parent
```

The declaration text is unchanged: X1, X2 and X3 keep their names and paths,
and iteration 9 revises `interfaces/contexts.ts` inside the X2 wildcard. That
revision replaces `AnalysisDriver.check` with `open`, extends
`ContextRevision`, `CheckRequest`, `CheckOutcome` and `ContextBudgets`, adds
`CheckDelta` and removes `ContextRevision.reused` and
`ContextBudgets.verificationIntervalMs`.

Changed source, all iteration 9: `src/context-manager.ts` (holds the session
handle, schedules sweeps and the idle audit, enforces `maxHotContexts`),
`src/context.ts` (hot, warm and cold levels and the compiler release),
`src/queue.ts` (the covered-identity rendezvous, the flush of the debounce
window, the cold and deadline outcomes), `src/history.ts` (headers,
diagnostics, warnings, coverage and deltas with the report projected on
demand) and `src/tokens.ts` (fingerprints from the observed inputs). New
tests: `src/tests/session-driver.test.ts`, `src/tests/covering.test.ts`,
`src/tests/deadlines.test.ts` and `src/tests/hot-budget.test.ts`; the private
`src/tests/scripted-driver.ts` becomes a scripted session handle with
controlled ports. Contexts tests still use no real filesystem, socket or
engine.

## CLI

**Directory:** `subs/cli/`. **README first paragraph** (revised, because the
CLI renders revision deltas):

> The CLI parses supported arguments, reaches the resident daemon through an injected connector or runs an injected batch operation, formats completed reports, revision deltas for the files a caller names, streamed revisions and daemon status, and selects the documented process exit code. It contains no checking algorithm and keeps help, version and status independent of compiler and server startup.

```ramify
ramify 1
module cli tagged [dispatch]

// C1: the command entry point.
expose-src runCli from "run-cli.ts" to parent
// C2: owned argument, environment and document vocabulary.
expose-src * from "interfaces/cli.ts" to parent
```

The declaration text is unchanged: `interfaces/cli.ts` gains `CheckDocument`
inside the C2 wildcard in iteration 10. Changed source, all iteration 10:
`src/arguments.ts` (`--changed <path>...`, `--since <revision>`,
`--deadline <ms>`, `--batch` with `--changed` rejected as an invalid
invocation, and the extended help text), `src/check-command.ts` (hashing the
named paths, one synchronized request with `scope: 'delta'`, the exit mapping
and no batch fallback for `--changed`), `src/format.ts` (the finding lines
with their `new` marks, the summary line naming the path, checked set and
wait, and the `Mode:` line with the revision's path),
`src/command-support.ts` and `src/errors.ts` (the new reasons). New test:
`src/tests/changed-command.test.ts` through root's `createQuickEnvironment`;
`src/tests/arguments.test.ts` gains the new arguments and their rejections.
No source or test is removed.

## Unchanged owners

`descriptions`, `presentation` and `layout` keep their Plan 1 declarations,
READMEs, source and tests byte for byte. `model` keeps its declaration and
README and receives one bounded source change in iteration 2: indexed lookups
in `src/decisions.ts` and `src/model.ts`, including `canonicalOrigin`, with no
rule change and no public name change. Its own
`src/tests/decision-lookups.test.ts` gains the regression for those lookups.

## Placement outside every owner

`examples/hooks/claude-code-post-write.mjs` (iteration 10) is an example host
adapter outside every owner. It invokes the installed executable, imports no
toolkit source and is excluded from every owner's `src/`, so the check's
outside-source warnings stay as Plan 1 fixed them. The five probes of
iteration 1 live under `scripts/probes/fast-check/` and the measurement recipe
under `scripts/measurements/`; both are independent compiler scopes.

## Package entries

No package entry is added or removed. The eight entries `.`, `./analysis`,
`./analysis/inventory`, `./model`, `./presentation`, `./layout`, `./cli` and
`./client` and `bin.ramify` stand exactly as Plan 2 left them. The `./analysis`
entry loses `analyzeIncrement` and gains `openRetainedSession` in iteration 9,
which is a change of that entry's exports, not of the entry map;
`scripts/validate-final-contracts.ts` is extended in iteration 13 to expect the
new witness. The `./cli` and `./client` closures are unchanged: neither loads a
session, worker or compiler module.

## Foreign signature types

Rows this plan adds or changes. `X → parent → descendants` means exposure to
the direct parent followed by that parent's explicit relay. Every row
preserves the original owner and tags.

| Consumer | Foreign originals it names | Named exposure path | Form and tags |
| --- | --- | --- | --- |
| TypeScript | `ObservationSink` in `interfaces/source.ts` and `src/retained-source-analysis.ts`, beside the `ProjectInventory`, `InventoryFile` and `SourceArea` it names today | project P2 → analysis A7 → descendants | Type `[]`. |
| Analysis | `FileDescription`, `DescriptionDependencies`, `CatalogDelta`, `AccessInterpreter`, `SourceChangeSet`, `RetainedSourceInputs`, `RetainedSourceAnalysis`, `createRetainedSourceAnalysis`, `describeFiles`, `assembleCatalog`, `createAccessInterpreter` | typescript T2 to T5 → analysis | Types `[]`; values `[]`. |
| Analysis | `ProjectObserver`, `ObservedChange`, `InventoryUpdate`, `ProjectObserve`, `ObservationSink`, `observeProject` | project P2, P4 → analysis | Types `[]`; value `[]`. |
| Contexts | `SessionOpen`, `RetainedSession`, `SessionRevision`, `SessionUpdate`, `SessionStatus`, `SessionChange`, `CheckedSet`, `FindingDelta`, `RevisionTimings`, `RevisionPath`, `VerifyOutcome`, `ObservedChange`; never `SessionInputs` or `SessionLimits`, because the driver supplies them | analysis A11 → root R3 → descendants; project P2 → analysis A7 → root R4 → descendants | Type imports `[]`; no engine value. |
| Daemon | `CheckDelta` in `interfaces/daemon.ts` and `service.ts` validation | contexts X2 → daemon N5 | Type `[]` into daemon `[dispatch]`. |
| Root assembly | `openRetainedSession`, `SessionInputs`, `SessionLimits`, `SessionOpen`, `RetainedSession`, `resolveProject`, `createDefaultTagRegistry` | analysis A9, A11, A12, A5 → root | Values `[]` and `[browser]`; root has no required-symbol constraint. |
| CLI | `CheckDelta`, `CheckedSet`, `RevisionPath`, `RevisionTimings`, `RevisionId`, `AnalysisDiagnostic` in `interfaces/cli.ts` and `check-command.ts` | daemon N5 → root R7 → descendants; analysis A11 → root R3 → descendants | Dispatch types into CLI `[dispatch]`; untagged types freely. No engine or daemon value import. |
| Harness, probes and measurement scripts | Owner source they import directly, as Plan 1 and Plan 2 do | Separate compiler scopes | Package access and script scopes are not internal exposure. |

Node's `Worker`, `MessagePort` and `ChildProcess` stay external vocabulary
wrapped by owned public types: the worker boundary is invisible to a caller of
`openRetainedSession`, and `AbortSignal` remains explicit in `RunControl`.

## Activation manifest

| Iteration | Owner | Lines activated or removed |
| --- | --- | --- |
| 2 | typescript | T3 activated with `createAccessInterpreter`; `AccessInterpreter` joins the T2 wildcard. |
| 2 | model | None; indexed lookups sit behind M5 and M6 with no name change. |
| 3 | typescript | T4 activated with `describeFiles` and `assembleCatalog`; `DescriptionDependencies`, `FileDescription` and `CatalogDelta` join the T2 wildcard. |
| 4 | project | P4 activated with `observeProject`; `ObservationSink`, `InputChangeKind`, `ObservedChange`, `InventoryUpdate`, `ProjectObserver` and `ProjectObserve` join the P2 wildcard. |
| 4 | analysis | A7 extended with the same six names, so root relays them and `typescript` receives the sink its adapter reports to. |
| 5 | typescript | T5 activated with `createRetainedSourceAnalysis`; `SourceChangeSet`, `RetainedSourceInputs` and `RetainedSourceAnalysis` join the T2 wildcard. |
| 6 | analysis | A11 activated with `interfaces/session.ts`; A12 activated with `openRetainedSession`. |
| 7 | analysis | None; the description, metadata and broad paths, positions and `verify` complete the A11 vocabulary. |
| 8 | analysis | None; the worker host and `SessionLimits` sit behind A11 and A12. |
| 9 | analysis | A9's `analyzeIncrement` line **removed** with `increment.ts` and `retained-products.ts`; the six increment types leave the A4 wildcard. |
| 9 | contexts | No line change; `interfaces/contexts.ts` revised inside X2, including `CheckDelta` and the removal of `ContextRevision.reused` and `ContextBudgets.verificationIntervalMs`. |
| 9 | daemon | N5 extended with `CheckDelta`. |
| 9 | root | R3 revised (six increment names **removed**, thirteen session names added); the project R4 line extended with the five observer names; R7 extended with `CheckDelta`; `createAnalysisDriverFromSessions` **removed** from `resident-assembly.ts` in favor of `createSessionDriver`. |
| 10 | root | No line change; `CheckParams.scope`, `since`, `deadlineMs` and the six counters join the R6 wildcard. |
| 10 | daemon | No line change; the validator accepts the three parameters. |
| 10 | cli | No line change; `CheckDocument` joins the C2 wildcard. |
| 11, 12 | none | No new originals or exposures; the live gate and the measurements consume the complete contract. |
| 13 | all | No new originals or exposures; `scripts/validate-final-contracts.ts` compares the eleven final texts and the eight package entries with this document. |

## Manual description review

| Review obligation | Review finding, 2026-09-11 |
| --- | --- |
| Valid physical boundaries | No owner is added or moved; every description stays beside its owner's `src/`, and the new source files are ordinary `src/` files of their owners. |
| Exact paths and real staged exports | Each of the six new lines is an `expose-src` naming one explicit `.ts` file relative to `src/`: `access-interpreter.ts`, `descriptions.ts`, `retained-source-analysis.ts`, `observer.ts`, `interfaces/session.ts` and `retained-session.ts`. The activation manifest pairs each with the iteration that implements its export. |
| Owned wildcards select only owned originals | `interfaces/session.ts` contains locally defined types only; its foreign imports are `import type` and are never re-exported. The same holds for `interfaces/source.ts`, `interfaces/project.ts`, `interfaces/contexts.ts`, `interfaces/service.ts` and `interfaces/cli.ts`. |
| Foreign signatures need independent paths | The foreign signature table names every foreign type each consumer adds; A7, A11, R3, R4, R7 and N5 enumerate them. |
| Expose-sub names direct children and complete hops | A7 names `project`, a direct child, and reaches `typescript` through analysis alone, which is the path `ProjectInventory` and `InventoryFile` already take. No statement names a grandchild or a sibling. |
| Exposure and availability remain separate | Contexts receives the session vocabulary through root R3 and names it; it still cannot import an analysis value, because the session handle arrives through the driver port. |
| Mandatory tags | Every new value defaults to its owner's header tags: typescript, project and analysis values `[]`; no new line uses `tagged`. `ObservationSink` is a type and carries no promise. |
| Profile derivation and testing origin | Every new test lives in its owner's `src/tests/`, whose profile is the owner's header tags plus `testing`. No test needs a tag its owner does not declare, so no testing module under `subs/` is required. |
| Names, destinations and collisions | Each added name has one original: `CheckDelta` is contexts', `CheckedSet` and `RevisionTimings` are analysis', `ObservationSink` and `ObservedChange` are project's. `SessionChange` is analysis' alias of `ObservedChange` and is relayed separately. |
| Empty and growth semantics | Adding an export to `interfaces/source.ts`, `interfaces/project.ts`, `interfaces/analysis.ts`, `interfaces/contexts.ts`, `interfaces/service.ts` or `interfaces/cli.ts` deliberately expands that wildcard contract, which is why every addition is listed here with its iteration. |
