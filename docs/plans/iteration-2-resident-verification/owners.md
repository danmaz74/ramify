# Plan 2 owners, declarations and placement

**Prepared:** 2026-09-10. **State:** complete proposed final declarations for
the eleven-owner tree, for review with [contracts.md](contracts.md); not
declarations installed by this document and not evidence of acceptance. The
definitive [description principles](../../model/module-description.principles.md)
and [importability principles](../../model/cross-module-importability.principles.md)
remain authoritative. Plan 1's nine declarations are the
[implemented starting point](../done/iteration-1-project-verifier/owners.md);
the texts below repeat them where they change and mark unchanged owners.

Every edge is a physical `subs/` edge. Iteration 2 creates the two new owner
directories with README, empty `src/`, `src/tests/` and header-only
descriptions; each later iteration activates an exposure together with the
real export it names. Comment IDs are review evidence, not syntax.

## The eleven-owner tree

```text
ramify [dispatch]                       CLI, daemon and batch entries; service vocabulary; assembly
├── analysis []                         batch sessions, incremental products, project resolution
│   ├── model [browser]                 unchanged
│   ├── descriptions [browser]          unchanged
│   ├── project []                      + root resolution and retained configuration
│   └── typescript []                   unchanged
├── daemon [dispatch]                   service binding, codec, discovery, client, host, real ports
│   └── contexts []                     context manager, tokens, ordering, publication, budgets
├── presentation [ui, browser]          unchanged
│   └── layout [browser]                unchanged
└── cli [dispatch]                      check, watch, daemon status and stop; documents
```

## Root: ramify

**Directory:** `./`. **README first paragraph:**

> Ramify assembles the command line, the resident daemon and lazy batch analysis from its owners, defines the dispatch-facing service vocabulary that the daemon implements, and keeps executable dispatch separate from portable model and presentation entries.

Complete final `module.ramify` (R2, R4 syntax, R4 source and R5 lines are
byte-identical to Plan 1 and abbreviated here with `…`; the full name lists
are in the [implemented file](../../../module.ramify)):

```ramify
ramify 1
module "ramify" tagged [dispatch]

// R1: invocation vocabulary for the injected CLI operation.
expose-src * from "interfaces/batch.ts" to descendants
// R6: dispatch-facing service vocabulary, implemented by daemon.
expose-src * from "interfaces/service.ts" to descendants
// R8: testing-only quick environment for CLI, daemon and root tests.
expose-test createQuickEnvironment, QuickEnvironment from "quick-environment.ts" to descendants

expose-sub ModuleId, … , explainImport from analysis to descendants

// R4: syntax vocabulary relayed unchanged from analysis.
expose-sub TextSpan, … , LinkedDescriptions from analysis to descendants

// R4: project vocabulary relayed unchanged from analysis.
expose-sub ProjectRequest, ProjectScope, CapturedInput, InventoryArea, ModulePurpose, InventoryModule, InventoryFile, ExactReference, OutsideSourceWarning, ProjectInventory, ProjectIssue, AcquisitionLimits, ProjectInputView, ProjectReadOptions, ProjectRead, ProjectResolution, RetainedConfiguration from analysis to descendants

// R4: source catalog vocabulary relayed unchanged from analysis.
expose-sub CatalogOriginal, … , SourceAnalysis from analysis to descendants

// R3: complete analysis report and operation vocabulary.
expose-sub Capability, StageId, RunControl, AnalysisLimits, AnalysisInputs, InventoryInputs, InventorySnapshot, InventoryRun, ValidationRun, CapabilityExecution, StageExecution, AnalysisCode, AnalysisDiagnostic, AccessResult, AnalysisSnapshot, AnalysisSummary, AnalysisReport, AnalysisRun, AnalysisSession, InputChange, RetainedStageId, RetainedStage, RetainedAnalysis, IncrementInputs, IncrementRun from analysis to descendants

// R5: declaration-only UI relay; root source imports none of these.
expose-sub DiagramDefinition, … , shopFocusDiagram from presentation to descendants

// R7: resident vocabulary and controlled test ports relayed unchanged from daemon.
expose-sub ContextId, GenerationId, RevisionId, LeaseId, ContextToken, ContextSetup, ContextSelection, InputFingerprints, RevisionCause, ContextRevision, ContextState, SynchronizationState, ContextStatus, ExpectedContent, Freshness, FreshnessRecord, CheckRequest, UnavailableReason, Unavailable, CheckOutcome, OpenOutcome, ContextEvent, SubscriptionHandle, WatchEvent, WatcherHandle, WatcherPort, ClockPort, ContextBudgets, DaemonInstance, LogEntry, DaemonBudgets, EndpointSelection, DaemonRecord, StopDisposition, Handshake, Welcome, ConnectTimeouts, ConnectOptions, ConnectionState, DisconnectReason, RecoveryOutcome, ServiceConnection, ConnectOutcome, ServiceConnector, WireMessage, createControlledWatcher, createControlledClock, ControlledWatcher, ControlledClock from daemon to descendants
```

Root source files: `src/cli-entry.ts` (unchanged role), `src/batch.ts`
(unchanged), `src/interfaces/batch.ts` (unchanged), `src/interfaces/service.ts`
(new, type-only), `src/resident-assembly.ts` (new), `src/daemon-entry.ts`
(new), `src/client.ts` (new). Root tests: existing `src/tests/*` plus
`src/tests/quick-environment.ts`, `src/tests/resident-assembly.test.ts`,
`src/tests/daemon-process.test.ts` (the entry's argv and exit codes and the
spawned daemon's lifecycle: record transitions, duplicate exit 3, explicit
stop and idle exit through `--budgets`; it lives here because it spawns the
compiled entry through root's testing-classified `src/tests/process.ts`,
which no descendant may import), `src/tests/cli-resident-process.test.ts`,
`src/tests/entry-boundaries.test.ts` (iteration 10's traced entry closures)
and extensions of `src/tests/process.ts` that trace `connect`, `listen`,
`spawn` and loaded modules for the daemon and client entries. Root source
imports from daemon only the values daemon exposes to parent; it never imports
a contexts file directly.

## Analysis

**Directory:** `subs/analysis/`. **README first paragraph** (revised):

> Analysis composes one captured project view, source facts, descriptions and model decisions into disposable batch work, immutable reports and retained stage products that a later run over unchanged inputs may reuse. It owns stage outcomes, input identity and computational invalidation so every client consumes the same completed analysis.

Complete final `module.ramify` (A5, A6 and A8 unchanged and abbreviated):

```ramify
ramify 1
module analysis

expose-sub * from model to parent, descendants

// A6: syntax vocabulary available to assembly and acquisition.
expose-sub TextSpan, … , LinkedDescriptions from descriptions to parent, descendants

// A7: project vocabulary supplied to assembly and children.
expose-sub ProjectRequest, ProjectScope, CapturedInput, InventoryArea, ModulePurpose, InventoryModule, InventoryFile, ExactReference, OutsideSourceWarning, ProjectInventory, ProjectIssue, AcquisitionLimits, ProjectInputView, ProjectReadOptions, ProjectRead, ProjectResolution, RetainedConfiguration from project to parent, descendants

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

// A9: incremental products and project resolution for the resident driver.
expose-src analyzeIncrement from "increment.ts" to parent
expose-src resolveProject from "resolve-project.ts" to parent
```

New source: `src/increment.ts`, `src/resolve-project.ts`,
`src/retained-products.ts` (private: stage keys, dependency-set accounting,
serialization size). `src/run-analysis.ts` gains the optional retained input
and per-stage observation tagging; its Plan 1 behavior with no retained input
is unchanged. Tests: `src/tests/increment.test.ts`,
`src/tests/retained-products.test.ts`, `src/tests/resolve-project.test.ts`,
and extensions to `src/tests/report-copy.test.ts` for `RetainedAnalysis`
plainness. The `index.ts` entry adds the two operations and `export type`
relays of the new names; `inventory-entry.ts` is unchanged.

## Project

**Directory:** `subs/analysis/subs/project/`. **README first paragraph** (revised):

> Project selects and acquires one real project, validates its physical ownership layout and exact paths, and supplies coherent captured input reads. It resolves the root and compiler configuration on request, records raw source areas, configuration selection, outside-module warnings and README purpose metadata, and can reuse its configuration product when its captured dependencies are unchanged, without deciding import permissions.

```ramify
ramify 1
module project

// P1-P2: acquisition service and owned vocabulary.
expose-src readProject from "read-project.ts" to parent
expose-src * from "interfaces/project.ts" to parent
// P3: root and configuration resolution without acquisition.
expose-src resolveProjectRoot from "resolve-root.ts" to parent
```

New source: `src/resolve-root.ts` (the climb extracted from
`read-project.ts`, which now calls it), configuration reuse in
`src/configuration.ts`. Tests: `src/tests/resolve-root.test.ts` and
extensions of the existing configuration tests for the retained path.

## Daemon

**Directory:** `subs/daemon/`. **README first paragraph:**

> Daemon owns the resident process: the validated in-process service that implements the root's service interface over its contexts child, the local socket host and its discovery records, the lightweight client that other processes use to reach it, the wire codec, and the real filesystem watcher and clock ports.

Complete final `module.ramify`:

```ramify
ramify 1
module daemon tagged [dispatch]

// N1: in-process service binding and real ports.
expose-src createDaemonService from "service.ts" to parent
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
expose-sub AnalysisDriver, ContextId, GenerationId, RevisionId, LeaseId, ContextToken, ContextSetup, ContextSelection, InputFingerprints, RevisionCause, ContextRevision, ContextState, SynchronizationState, ContextStatus, ExpectedContent, Freshness, FreshnessRecord, CheckRequest, UnavailableReason, Unavailable, CheckOutcome, OpenOutcome, ContextEvent, SubscriptionHandle, WatchEvent, WatcherHandle, WatcherPort, ClockPort, ContextBudgets, ContextManagerOptions, ContextManager, createControlledWatcher, createControlledClock, ControlledWatcher, ControlledClock from contexts to parent
```

Source: `src/service.ts` (validation, dispatch, leases), `src/validation.ts`
(private structural schemas), `src/filesystem-watcher.ts`, `src/system-clock.ts`,
`src/codec.ts`, `src/discovery.ts`, `src/launcher.ts` (private: lock, spawn,
readiness wait), `src/connect-daemon.ts`, `src/connection.ts` (private: socket
state machine, pings, recovery), `src/start-daemon.ts`, `src/host.ts`
(private: listener, per-connection queues, backpressure), `src/records.ts`
(private: atomic record writes), `src/client-entry.ts` (package entry),
`src/interfaces/daemon.ts`. Tests, profile `[testing, dispatch]`:
`src/tests/service.test.ts` (quick service with the root quick environment),
`src/tests/watcher.test.ts` (real `fs.watch` on temporary trees),
`src/tests/codec.test.ts`, `src/tests/discovery.test.ts`,
`src/tests/connect.test.ts` (the connection state machine and the launcher
against a fake entry script), `src/tests/ipc.test.ts` (real socket pairs in
one process, iteration 8) and `src/tests/host.test.ts` (real host over the
quick service in one process, iteration 8). Daemon owns no test that spawns
the compiled entry: that lifecycle test is root's `daemon-process.test.ts`.
Daemon source never imports an analysis operation; the driver arrives through
`DaemonServiceOptions`.

## Contexts

**Directory:** `subs/daemon/subs/contexts/`. **README first paragraph:**

> Contexts keeps each selected project root isolated as a context with its own generation, orders its updates and requests into one queue, publishes immutable revisions atomically, and bounds history, retained products, leases and idle lifetime. It drives analysis through a neutral port and never reads project files or transport objects itself.

Complete final `module.ramify`:

```ramify
ramify 1
module contexts

// X1: the context manager.
expose-src createContextManager from "context-manager.ts" to parent
// X2: neutral vocabulary, ports and the analysis-driver port.
expose-src * from "interfaces/contexts.ts" to parent
// X3: controlled ports for the tests of every consumer.
expose-test createControlledWatcher, createControlledClock, ControlledWatcher, ControlledClock from "controlled-ports.ts" to parent
```

Source: `src/context-manager.ts`, `src/context.ts` (private: one context's
state machine), `src/queue.ts` (private: acknowledgment order, coalescing,
supersession), `src/tokens.ts` (private: id derivation, fingerprints),
`src/history.ts` (private: retention accounting), `src/interfaces/contexts.ts`.
Tests, profile `[testing]`: `src/tests/controlled-ports.ts` (the exposed
fakes), `src/tests/scripted-driver.ts` (private fake driver),
`src/tests/tokens.test.ts`, `src/tests/queue.test.ts`,
`src/tests/publication.test.ts`, `src/tests/watcher-events.test.ts`,
`src/tests/history.test.ts`, `src/tests/eviction.test.ts`. Contexts tests use
no real filesystem, socket or engine.

## CLI

**Directory:** `subs/cli/`. **README first paragraph** (revised):

> The CLI parses supported arguments, reaches the resident daemon through an injected connector or runs an injected batch operation, formats completed reports, streamed revisions and daemon status, and selects the documented process exit code. It contains no checking algorithm and keeps help, version and status independent of compiler and server startup.

The declaration text is unchanged from Plan 1:

```ramify
ramify 1
module cli tagged [dispatch]

expose-src runCli from "run-cli.ts" to parent
expose-src * from "interfaces/cli.ts" to parent
```

Source: `src/arguments.ts` and `src/format.ts` (extended), `src/run-cli.ts`
(dispatch to commands), `src/check-command.ts`, `src/watch-command.ts`,
`src/daemon-command.ts`, `src/documents.ts` (the `watch` and `daemon status` JSON documents), `src/errors.ts`
(service error and disconnect reason rendering), `src/interfaces/cli.ts`.
Tests, profile `[testing, dispatch]`: `src/tests/arguments.test.ts`
(extended), `src/tests/check-command.test.ts`, `src/tests/watch-command.test.ts`,
`src/tests/daemon-command.test.ts`, `src/tests/fallback.test.ts`, all through
root's `createQuickEnvironment`.

## Unchanged owners

`model`, `descriptions`, `presentation` and `layout` keep their Plan 1
declarations, READMEs, source and tests byte for byte. `typescript` keeps its
declaration and README and receives one bounded source fix in iteration 3:
`declare global` blocks in module files gain the `shared-global` coverage
note, with a regression test and the `I2-11:declare-global-note` instance; no
public name changes. Iteration 10 completes all eleven declarations and
iteration 14's final validation compares them with these texts.

## Package entries and their runtime closures

| Entry | Target | Permitted transitive runtime dependencies |
| --- | --- | --- |
| `.`, `./analysis` | `dist/subs/analysis/src/index.js` | As in Plan 1, plus the two new operations. No daemon, contexts, CLI, React, d3, MCP or web module. |
| `./analysis/inventory`, `./model`, `./presentation`, `./layout`, `./cli` | Unchanged | Unchanged. `./cli` still imports no engine, compiler, daemon host or server value; its connector type is erased. |
| `./client` (new) | `dist/subs/daemon/src/client-entry.js` | Daemon `connect-daemon`, `connection`, `launcher`, `discovery`, `codec`, `records` and Node built-ins only. Loading it must not load `service.js`, `start-daemon.js`, `host.js`, any contexts, analysis or compiler module. |
| `bin.ramify` | `dist/src/cli-entry.js` | CLI, root `client.js` and the `./client` closure. `src/batch.js` loads only for `--batch` or an eligible fallback. |
| Daemon process entry (not exported) | `dist/src/daemon-entry.js` | Root `resident-assembly.js`, daemon `service`, `start-daemon`, `host`, `filesystem-watcher`, `system-clock`, `records`, `codec`, contexts, analysis and its children. Never `cli`, `presentation`, `layout`, React, d3, MCP or web modules. |

Instance I2-19 traces the actually loaded modules of each entry; source
modularity alone is not the evidence.

## Foreign signature types

Every row preserves the original owner and tags. `X → parent → descendants`
means exposure to the direct parent followed by that parent's explicit relay.

| Consumer | Foreign originals it names | Named exposure path | Form and tags |
| --- | --- | --- | --- |
| Contexts | `AnalysisReport`, `AnalysisSummary`, `Capability`, `RunControl`, `IncrementRun`, `InputChange`, `RetainedAnalysis`, `RetainedStageId`; never `AnalysisInputs` or `IncrementInputs`, because the driver port takes the context's own selection | analysis A4 → root R3 → descendants | Type imports `[]`; no engine value. |
| Contexts | `ProjectRequest`, `ProjectScope`, `ProjectIssue`, `ProjectResolution` | project P2 → analysis A7 → root R4 → descendants | Type imports `[]`. |
| Daemon | `AnalysisDriver`, `WatcherPort`, `ClockPort`, `ContextBudgets`, `ContextEvent`, `ContextToken` in `interfaces/daemon.ts`, as contracts.md's Daemon section lists; `createContextManager` and `ContextManager` in `service.ts`; `createControlledWatcher`, `createControlledClock`, `ControlledWatcher`, `ControlledClock` in its tests | contexts X1–X3 → daemon | Types `[]`; `createContextManager` value `[]`; controlled ports `[testing]`, importable only by daemon tests. |
| Daemon | `RamifyService`, `ServiceOperation`, `ServiceCapability`, `ServiceError`, `ServiceErrorCode`, `ServiceResult`, `OpenContextParams`, `ContextParams`, `CheckParams`, `SubscriptionOpened`, `UnsubscribeParams`, `DaemonCounters`, `DaemonStatus`, `StopParams`, `StopAcknowledged` | root R6 → descendants | Types `[dispatch]`; daemon `[dispatch]` is compatible. |
| Daemon | `RunControl`, `AnalysisReport`, `Capability` (validated in `ContextSetup.capabilities`) | analysis A4 → root R3 → descendants | Types `[]`. |
| Daemon | `ProjectRequest` (validated in `OpenContextParams.project`; its `scope` and `configuration` literals are what `ContextSelection` echoes) | project P2 → analysis A7 → root R4 → descendants | Types `[]`. |
| Root assembly and entries | `createDaemonService`, `createFilesystemWatcher`, `createSystemClock`, `connectDaemon`, `encodeMessage`, `decodeMessage`, `selectEndpoint`, `readDaemonRecord`, `startDaemon` and the N4/N5 vocabulary | daemon N1–N5 → root | Values `[dispatch]`; root `[dispatch]`. |
| Root assembly | `analyzeIncrement`, `resolveProject`, `createDefaultTagRegistry` | analysis A9, A5 → root | Values `[]` and `[browser]`; root has no required-symbol constraint. |
| Root quick environment (tests) | `BatchOperation` (own), daemon values above, `createControlledWatcher`, `createControlledClock` | daemon N5 → root | `[testing]` values into root's `[testing, dispatch]` tests. |
| CLI | `BatchOperation`, `ServiceConnector`, `ConnectOutcome`, `ServiceConnection`, `DisconnectReason`, `DaemonRecord`, `DaemonStatus`, `ServiceResult`, `ServiceError`, `CheckOutcome`, `OpenOutcome`, `ContextToken`, `ContextRevision`, `ContextStatus`, `FreshnessRecord`, `ContextEvent`, `AnalysisReport`, `RunControl` | root R1/R6 → descendants; daemon N4/N5 → root R7 → descendants; analysis A4 → root R3 → descendants | Dispatch types into CLI `[dispatch]`; untagged types freely. No engine or daemon value import. |
| CLI tests | `createQuickEnvironment`, `QuickEnvironment`, controlled ports | root R8/R7 → descendants | `[testing, dispatch]` and `[testing]` originals into CLI `[testing, dispatch]` tests. |
| Independent scripts, harness and external Node hosts | `./client` entry values and types; `./analysis` operations | Supported package entries | Separate compiler scopes; package access is not internal exposure. |

Node's `net.Socket`, `child_process.ChildProcess`, `AbortSignal` and `fs`
watcher handles are external vocabulary that never appears in an owned public
type; `WatcherHandle`, `ClockPort` and `ServiceConnection` wrap them.

## Activation manifest

| Iteration | Added originals and exposures | Provider availability |
| --- | --- | --- |
| 2 | `subs/daemon/module.ramify` and `subs/daemon/subs/contexts/module.ramify` headers, READMEs, empty `src/` and `src/tests/`; no exposure statements | Empty owners; `npm run check:self` reports eleven owners with no findings. |
| 3 | Project P3 and the new P2 names; analysis A9 and the new A4 names; root R3/R4 additions; the `typescript` source fix with no new name | Real `resolveProjectRoot`, `analyzeIncrement`, `resolveProject`; `./analysis` entry extended. |
| 4 | Contexts X1–X3; daemon N5 | Real manager and fakes; daemon has only its header plus N5. |
| 5 | Root R6 and R8; daemon N1; N2's codec line (`encodeMessage`, `decodeMessage`, message encoding only; framing follows in iteration 7 under the same names); the service, instance, budget, log, record, handshake, wire and connect portion of N4 (`DaemonInstance`, `LogEntry`, `DaemonServiceOptions`, `ServiceLease`, `DaemonService`, `DaemonBudgets`, `DaemonRecord`, `StopDisposition`, `Handshake`, `Welcome`, `WireMessage`, `ConnectionState`, `DisconnectReason`, `RecoveryOutcome`, `ServiceConnection`, `ConnectOutcome`, `ServiceConnector`); root `resident-assembly.ts` | Quick environment usable by daemon, CLI and root tests; its connector passes every message through the exposed codec, and root's `quick-environment.ts` names `ServiceConnector` through N4. |
| 6 | No new originals or exposures | Edit-semantics handlers over the quick environment. |
| 7 | Daemon N2's remaining lines (`selectEndpoint`, `readDaemonRecord`, `connectDaemon`), framing added to the codec, and the discovery and client-option portion of N4 (`EndpointSelection`, `ConnectTimeouts`, `ConnectOptions`); root R7; `./client` package entry | Real framed codec and client; no socket host yet. |
| 8 | Daemon N3 and the host portion of N4, with private `host.ts`; root `daemon-entry.ts` | Real detached daemon process; real socket pairs for every `ipc` instance. |
| 9 | CLI C1/C2 with the extended `CliEnvironment`, the `watch` and `daemon status` documents and the `Mode:` line; root `client.ts`; `cli-entry.ts` wiring | Resident `check`, `watch`, `daemon status` and `daemon stop` from the installed executable. |
| 10 | No new originals; every remaining pending exposure line activated | All eleven final declarations complete; `npx tsx scripts/validate-final-contracts.ts` extended to eleven owners and eight package entries. |
| 11–14 | No new public originals or exposures | Gates, process suite, measurements and completion consume the complete contract. |

## Manual description review

| Review obligation | Evidence in this draft |
| --- | --- |
| Valid physical boundaries | `subs/daemon/` and `subs/daemon/subs/contexts/` lie beneath their parents' `subs/`; no description in any `src/`. |
| Exact paths and real staged exports | Every `from` names one explicit `.ts` file relative to `src/` or, for `expose-test`, `src/tests/`. The manifest activates each line only with its real export. |
| Owned wildcards select only owned originals | `interfaces/service.ts`, `interfaces/daemon.ts` and `interfaces/contexts.ts` contain locally defined types only; their foreign imports are `import type` and are never re-exported. |
| Foreign signatures need independent paths | The table above names every foreign type each consumer imports; R3/R4/R7 and N5 enumerate them. |
| Expose-sub names direct children and complete hops | Daemon refers only to `contexts`; root refers to `analysis`, `presentation` and `daemon`. Contexts vocabulary reaches CLI through daemon N5 then root R7. |
| Exposure and availability remain separate | Root receives contexts vocabulary through daemon and may name it in its dispatch interface; contexts cannot import that interface because R6 originals carry `dispatch`. |
| Mandatory tags | Daemon and root values default `[dispatch]`; contexts values `[]`; controlled ports and the quick environment carry `[testing]` from their defining areas. No relay uses `tagged`. |
| Profile derivation and testing origin | Contexts tests `[testing]`; daemon, CLI and root tests `[testing, dispatch]`. The quick environment and controlled ports are new testing-owned bindings, not retagged forwarding aliases. |
| Names, destinations and collisions | Every public name has one original; R7 and N5 lists contain no duplicate names; `ContextStatus` and `DaemonStatus` are distinct originals of contexts and root. |
| Empty and growth semantics | Header-only daemon and contexts owners are valid in iteration 2. Adding an export to an owned interface file deliberately expands that contract and requires package review. |
