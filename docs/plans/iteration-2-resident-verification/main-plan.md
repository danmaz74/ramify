# Plan 2: Keep verification current

**Date:** 2026-09-10. **Iteration 1 review revision:** 2026-09-11.
**Status:** Revised implementation package awaiting architecture acceptance,
authored from the roadmap's [Plan 2 brief](../tooling-architecture/README.md#plan-2-resident-verification)
and Plan 1's [completion evidence](../done/iteration-1-project-verifier/iterations/iteration15-results.md).
No daemon implementation or passing resident evidence is established by this
document. The plan runs as fourteen iterations, listed under
[Iteration sequence](#iteration-sequence); each is sized to be implemented
within one 250k-token context, and the plan's completion gate is the last
iteration's exit. The [contracts](contracts.md), [owners](owners.md),
[scope](scope.md) and [instance inventory](subcases.md) beside this plan form
its review package. The [probe and contract review record](probes.md) records
the five Linux probes, concrete corrections and the single RP-7 budget revision.
Publication of iteration 1 does not approve those contract revisions.

## Deliverable and completion boundary

Deliver a resident analysis daemon, its lightweight local client and the CLI
commands that use them, so that a user who edits a real Ramify project obtains
a result for verified current inputs without paying a cold start each time,
and can stream bounded updates while working.

From the Ramify package directory, the installed CLI must support:

```sh
cd examples/collection-review && ramify check
ramify check --root examples/collection-review --format json
ramify watch --root examples/collection-review
ramify daemon status
ramify daemon stop
ramify check --root examples/collection-review --batch --format json
```

The first command starts the daemon if none is running, opens a context for
the discovered root, synchronizes the project's inputs after the command was
acknowledged and prints the result; the second writes the same result as
Plan 1's unchanged `ramify.analysis/1` document, with no additional member,
while the human output carries the resident facts in one `Mode:` line. After
the user edits a source file or a
description, the next `ramify check` reports the effect of that edit even if
the filesystem watcher has not yet delivered it. `ramify watch` prints the
current status and then every published revision until interrupted. The two
daemon commands report and end the resident process without loading an
analysis engine. The last command is Plan 1's batch check: it starts and
contacts no daemon and its report is byte-for-byte the batch report.

Completion requires every I2 instance in the [acceptance matrix](#acceptance-matrix)
to run and assert its independent expectation; equal batch and resident
reports for identical captured inputs across the reference and synthetic edit
sequences; real IPC and process evidence for startup, loss, stop, idle exit,
leases and eviction; measured resident budgets on the reference and the 100,
500 and 1,000-owner fixtures; Plan 1's 308-instance gate still passing on the
same build; and `npm run check:self` accepting the eleven-owner toolkit. A
daemon that returns stale snapshots, a client that silently substitutes batch
analysis, or a watcher without synchronized requests does not complete this
plan.

Inspection commands remain Plan 3, MCP Plan 4, overlays Plan 5 and the
explorer Plan 6. This plan hands them the context, generation, revision and
freshness contracts, the client, the codec, the direct-service harness and
the measured limits the roadmap's
[handoff table](../tooling-architecture/README.md#information-to-preserve-between-plans)
requires.

## Authority and supporting documents

| Document | Role |
| --- | --- |
| [Importability principles](../../model/cross-module-importability.principles.md), [glossary](../../model/glossary.md), [module descriptions](../../model/module-description.principles.md), [TypeScript interpretation](../../model/typescript-source-interpretation.principles.md) | Definitive rules the daemon enforces unchanged; this plan adds no importability rule. |
| [Daemon and analysis](../../architecture/daemon.md) | Ownership tree, exposure paths, context identity, revisions, freshness, invalidation, service operations and DA01–DA18. |
| [Processes and clients](../../architecture/processes-and-clients.md) | Process split, shared service boundary, command roles, launch/shutdown/recovery contract, entry points and PC01–PC10. |
| [Memory lifecycle](../../architecture/memory-lifecycle.md) | Dependency boundaries, retention and backpressure policy, measurement recipe and ML01–ML08. |
| [Quick testing](../../architecture/quick-testing.spec.md) | Direct-adapter flows, harness boundaries and QT01–QT08. |
| [CLI invocation](../../architecture/cli-invocation.spec.md) | Root and configuration discovery, warnings, output order and exits of `ramify check`, unchanged. |
| [Tooling roadmap](../tooling-architecture/README.md) | The brief, the nine authoring rules and the scheduling map for DA/PC/ML/QT. |
| [Plan 1 contracts](../done/iteration-1-project-verifier/contracts.md), [owners](../done/iteration-1-project-verifier/owners.md), [scope](../done/iteration-1-project-verifier/scope.md) and [handoff](../done/iteration-1-project-verifier/iterations/iteration15-results.md#implemented-contracts-and-plan-2-starting-requirements) | Implemented names, entries, limits and measured budgets this plan preserves. |
| [Reference cases](../reference-project/cases.md), [contract map](../reference-project/contract-map.md) and [harness](../reference-project/harness.md) | Independent expectations and statement IDs for the edit sequences. |

This plan selects implementation scope and evidence; it revises no model
document. Where the architecture lists a decision still requiring review, the
[resolved decisions](#resolved-decisions) below fix it or name the two
alternatives and the recommended one as a review point for iteration 1.

## Starting point

The planning inspection on 2026-09-10 established the following from the
current `main`. Recheck at implementation start.

- Plan 1 is complete and merged: `5b943e1` merged the workflow branch and
  `f5b0939` moved the plan to `docs/plans/done/`. The
  [status note](../done/iteration-1-project-verifier/status-2026-09-10.md)
  records `npm run reference:verify -- --plan 1` passing with 308 required, 308
  passed on a clean tree, and a batch measurement on that build: reference
  cold median 3.648 s and peak 480.863 MiB; 100 owners 6.130 s and
  367.785 MiB; settled RSS growth 21.594 MiB and 62.270 MiB. The agreed
  budgets are unchanged: 5 s and 15 s, 512 MiB and 768 MiB, 16 MiB heap and
  64 MiB RSS growth.
- Nine owners are declared: [`module.ramify`](../../../module.ramify) at the
  root and under `subs/analysis`, its four children, `subs/presentation`,
  `subs/presentation/subs/layout` and `subs/cli`. No `subs/daemon` directory
  exists. `npm run check:self` reports nine owners and 144 source files with
  no findings and no analysis limits.
- [`package.json`](../../../package.json) has `bin.ramify` at
  `dist/src/cli-entry.js` and seven `exports`: `.`, `./analysis`,
  `./analysis/inventory`, `./model`, `./presentation`, `./layout`, `./cli`.
  There is no client entry.
- `src/cli-entry.ts` installs SIGINT handling, publishes stdout in 16 KiB
  chunks, treats output failures as exit 2, imports `runCli` and lazily
  imports `./batch.js` through the injected `batch` callback. `src/batch.ts`
  exports `runBatch`, fixes the reviewed `AnalysisLimits` and the default
  registry, and calls `analyzeProject`. `src/interfaces/batch.ts` declares
  `BatchInvocation`, `BatchResult` and `BatchOperation`.
- `subs/cli/src/arguments.ts` accepts only `check [--root <dir>] [--format json] [--batch]`,
  `--help` and `--version`; any other command is `invalid-invocation` with
  exit 2. `run-cli.ts` verifies the eight required stages and thirteen
  capabilities before trusting a completed report and writes a `ramify.cli/1`
  envelope for invocation failures in JSON mode. `format.ts` bounds the
  serialized report at `maxReportBytes`.
- `subs/analysis/src/session.ts` implements the single-use session with
  idempotent `dispose()`; `analyze-project.ts` creates and disposes it;
  `index.ts` exports `createAnalysisSession`, `analyzeProject`,
  `validateProject`, `acquireInventory` and type relays; `run-analysis.ts`
  performs acquisition, registry validation, parse, catalog, link, access,
  decide and report with a three-attempt coherent-view retry.
- The analysis parent process never imports the TypeScript package:
  `subs/analysis/subs/typescript/src/source-analysis.ts` imports only its
  bridge and wire modules, while `compiler-helper.ts` and project's
  `configuration-helper.ts` import `typescript/unstable/sync` inside the
  finite helper processes. A resident daemon therefore retains no compiler
  code in its own heap unless it chooses to.
- `subs/analysis/subs/project/src/interfaces/project.ts` declares
  `ProjectRequest { cwd, root?, scope: 'whole-project', configuration: 'discover' }`,
  `ProjectInputView` with asynchronous reads and `seal()`, and `CapturedInput`
  roles `description | readme | source | resource | configuration | dependency | directory | absent`.
  Root discovery lives inside `read-project.ts`.
- The reference harness under [`scripts/reference-harness/`](../../../scripts/reference-harness/README.md)
  registers 308 Plan 1 instances in `plan1-instances.ts` and `cases.ts`,
  gates them through `verify.ts --plan 1 [--iteration n]`, and validates
  membership in `plan.ts`. Root process tests use `src/tests/process.ts` with
  the `process-probe.mjs` preload, which records `spawn`, `listen`, `bind`,
  `other-launch` and `exit` events plus loaded modules.
- Batch measurements live under [`scripts/measurements/`](../../../scripts/measurements/README.md)
  with the hundred-owner generator at
  [`scripts/probes/fixtures/hundred-owners.ts`](../../../scripts/probes/fixtures/hundred-owners.ts)
  and archived raw results indexed in `results/index.json`. No 500 or
  1,000-owner fixture exists.
- `vitest.config.ts` discovers `src/tests/**/*.test.{ts,tsx}` and
  `subs/**/src/**/*.test.{ts,tsx}`, and `tsconfig.json` includes
  `subs/**/src/**/*`, so the two new owners' source and tests join type-check
  and test discovery without configuration edits.
- Two inherited Plan 1 findings are decided here, as the brief asks. A
  `require` target that is a module file is recorded with coverage notes but
  not resolved, so no testing-origin denial fires for it; resolving `require`
  is a resolution design decision outside this plan, so Plan 2 carries it as
  an explicit coverage limit: the existing `unsupported-commonjs` note remains
  the reported outcome, and instance `I2-11:commonjs-module-target-limit`
  asserts that note for a module-file `require` target from `analyzeProject`
  and `analyzeIncrement` alike. `declare global` blocks inside module files
  pass silently instead of receiving the shared-global coverage note; that is
  a bounded defect in the `typescript` owner, fixed in iteration 3 (which
  therefore lists `typescript` among its owners) with the `shared-global` note,
  a regression test and instance `I2-11:declare-global-note`, so both modes
  report it. Neither gates resident behavior.

## Scope decisions

### Included

1. Two new owners, `daemon [dispatch]` and `contexts []`, completing the
   eleven-owner tree, with their READMEs, tests and exposure manifests.
2. Analysis extensions: `resolveProject` and `analyzeIncrement` with retained
   stage products and a verifiable invalidation dependency model; project's
   `resolveProjectRoot` and configuration-product reuse.
3. Retained contexts with isolation by canonical root and setup, generations,
   monotonic revisions, input fingerprints, one ordered queue per context,
   atomic publication, bounded history and retained bytes, leases, warm and
   cold idle stages and eviction.
4. Watcher-driven background reconciliation, debouncing, coalescing,
   conservative reconciliation on overflow or error, periodic `verify`
   reconciliation through a fresh capture for the influencing inputs the
   watcher does not cover, published reads addressable by revision id, and
   synchronized disk checks with optional client-supplied content identities
   and explicit supersession.
5. The shared validated service implementation with its in-process binding,
   the Unix-socket IPC host with length-prefixed JSON frames, the lightweight
   `connectDaemon` client with discovery, coordinated startup, handshake,
   bounded reconnect and restart, and distinct idle-exit, crash and explicit
   stop outcomes recorded in the daemon record.
6. CLI commands `check` through the daemon, `watch`, `daemon status`,
   `daemon stop`, the human `Mode:` line, the `ramify.watch/1` and
   `ramify.daemon-status/1` documents beside the unchanged `ramify.analysis/1`
   document of `check`, the visible batch fallback for terminating checks
   after exhausted recovery only, and unchanged `--batch`, `--help`,
   `--version`.
7. Root's distinct entries: `cli-entry.ts` unchanged in role,
   `daemon-entry.ts`, `client.ts` and `resident-assembly.ts`; the `./client`
   package entry.
8. The harness extension for `--plan 2`, the quick environment, real IPC and
   process suites, the equivalence gate, the resident measurement recipe and
   the 500 and 1,000-owner fixtures.

### Scheduled later or excluded

| Capability | Treatment in this plan |
| --- | --- |
| Inspection and explanation commands, published-revision reads from the CLI beyond `watch` and `daemon status` | Plan 3, over the revision and status contracts defined here. |
| Ramify MCP serving | Plan 4; the daemon never loads an MCP SDK. |
| Overlays, unsaved content, client versions per file | Plan 5; `Freshness` has no overlay variant and supplied bytes are rejected. |
| Web process, tRPC, browser notifications | Plan 6. |
| Retaining compiler state across revisions | Deferred with a measured trigger; recomputed stages start Plan 1's finite helpers. |
| Persistent caches, worker pools, process recycling, parallel analyses across contexts | Not added; each needs measured need and its own review. |
| Event replay after reconnect | `replay: 'not-available'`; clients resynchronize from status. |
| Registry configuration serialization and strict project configuration | Unspecified; only the default registry and warnings-as-warnings. |
| Resolving `require` targets that are module files | Carried as the explicit `unsupported-commonjs` coverage limit; a resolution design decision for a later plan. |
| Retiring a daemon group (`StopDisposition.reason` `retired`) | Reserved: no Plan 2 operation produces it and `DaemonHost.stop` accepts only `explicit`; a later plan adds the retire request. |
| Windows | Unsupported, as Plan 1 fixed. |

### Source scope and project selection

Root selection, configuration discovery, whole-project scope, outside-module
warnings and exits are the [CLI invocation contract](../../architecture/cli-invocation.spec.md)
and are unchanged. The daemon performs the same selection through
`resolveProjectRoot`, and a context is exactly one whole project from its
canonical root. The reference, site and scripts remain independent scopes;
`npm run production:files` and the production build exclude the new owners'
`src/tests/` areas as they exclude every other testing area.

### Supported platforms

Linux and macOS. The transport is a Unix domain socket on both; the
[platform consequences](scope.md#supported-platform-consequences) list the
primitives relied on and the fixture restrictions. Measurements in this plan
establish Linux evidence; the process suite must pass on macOS before
acceptance.

## Implementation ownership

The complete tree has eleven owners; two are new. Each edge is physically a
`subs/` edge and each owner has `module.ramify`, a purpose `README.md`,
`src/` and owned tests in `src/tests/`.

```text
ramify [dispatch]
├── analysis []
│   ├── model [browser]
│   ├── descriptions [browser]
│   ├── project []
│   └── typescript []
├── daemon [dispatch]
│   └── contexts []
├── presentation [ui, browser]
│   └── layout [browser]
└── cli [dispatch]
```

| Owner / physical directory | Work and public contract responsibility |
| --- | --- |
| Root `./` | Own the dispatch-facing `RamifyService` vocabulary in `src/interfaces/service.ts`; assemble the analysis-backed `AnalysisDriver` and the in-process service in `src/resident-assembly.ts`; own `src/daemon-entry.ts`, `src/client.ts` and the unchanged `src/cli-entry.ts` and `src/batch.ts`; expose a testing-only quick environment to descendants. |
| `subs/analysis/` | Add `analyzeIncrement`, `resolveProject`, `InputChange`, `RetainedAnalysis`, `IncrementInputs`, `IncrementRun`; record per-stage input dependencies; own computational invalidation. Batch behavior is unchanged. |
| `subs/analysis/subs/project/` | Add `resolveProjectRoot`, `ProjectResolution` and configuration-product reuse through `RetainedConfiguration`. |
| `subs/daemon/` | Own `createDaemonService` (validation, dispatch, leases), `createFilesystemWatcher`, `createSystemClock`, the codec, discovery and records, `connectDaemon`, `startDaemon` and the `./client` entry. Relay contexts vocabulary to root. Import no engine operation. |
| `subs/daemon/subs/contexts/` | Own `createContextManager`, the `AnalysisDriver`, `WatcherPort` and `ClockPort` ports, context/generation/revision tokens, fingerprints, queue ordering, coalescing, supersession, publication, history, leases, budgets and eviction; expose controlled ports for tests. |
| `subs/cli/` | Add `watch`, `daemon status`, `daemon stop`; serve `check` through the injected connector with the fallback policy; own the JSON documents and human renderings. No checking algorithm and no daemon startup code. |
| `model`, `descriptions`, `typescript`, `presentation`, `layout` | Unchanged. |

### Exposure rules for the resident owners

- Root exposes `interfaces/service.ts` to descendants; daemon implements it.
  Root receives contexts vocabulary through daemon's relay and may name it in
  that interface. Contexts never imports the root interface: its originals
  carry `dispatch` and contexts is untagged, which the self-negative in I2-30
  verifies.
- The `AnalysisDriver` port is contexts-owned and travels contexts, daemon,
  root. Root implements it from `analyzeIncrement` and `resolveProject`;
  neither daemon nor contexts imports an analysis operation.
- Types stay with the owner of their meaning: `ContextRevision`,
  `ContextStatus` and `CheckOutcome` with contexts; `DaemonRecord`,
  `Welcome`, `ServiceConnection` with daemon; `RamifyService`,
  `ServiceError`, `DaemonStatus` with root; `RetainedAnalysis` with analysis;
  `ProjectResolution` with project; the CLI documents with cli. There is no
  shared-contracts owner.
- Test fakes are testing-owned bindings: contexts exposes
  `createControlledWatcher` and `createControlledClock` from its `src/tests/`
  to parent; daemon relays them; root's `src/tests/quick-environment.ts`
  combines them with the real engine and exposes `createQuickEnvironment` to
  descendants. Daemon, CLI and root tests derive `[testing, dispatch]`;
  contexts tests `[testing]`.
- Package entries confer no visibility. `./client` targets the daemon-owned
  `client-entry.ts`; its type re-exports follow paths root already exposes.

### Distinct entries and the separately importable client

| Entry | Loads | Never loads |
| --- | --- | --- |
| `dist/src/cli-entry.js` (`bin.ramify`) | CLI, root `client.js`, daemon client, codec, discovery | Analysis, compiler, contexts, daemon host, React, d3; `src/batch.js` only for `--batch` or an eligible fallback |
| `dist/src/daemon-entry.js` (spawned by path) | Root resident assembly, daemon host and service, contexts, analysis and children | CLI, presentation, layout, React, d3, MCP, web |
| `ramify.ts/client` | `connect-daemon.js`, `connection.js`, `launcher.js`, `discovery.js`, `codec.js`, `records.js` | Everything else in the package |
| `src/batch.js` (dynamic) | Unchanged Plan 1 closure | Daemon or client modules |

`connectDaemon` is what an external Node program imports; it validates
requests the same way, holds the same leases and follows the same recovery
rules as the CLI, and adds no analyzer. Instance I2-19 traces each entry's
actually loaded modules.

### Declaration stages

[owners.md](owners.md#activation-manifest) records the complete final texts
and when each line becomes valid. Iteration 2 installs the two new headers
only; each later iteration activates exposures with the exports and child
contracts that make them valid; iteration 10 completes all eleven
declarations and the eight package entries, extending
`scripts/validate-final-contracts.ts` to check them. Staging never names an
unimplemented export.

## Resident analysis path and contract review

### Required data flow

```text
CLI arguments / external host
  -> lightweight client (discovery, startup coordination, handshake, framing)
  -> daemon host (frame validation, leases, per-connection queues)
  -> shared service implementation (structural validation, dispatch)
  -> context manager (identity, one queue per context, watcher events, leases)
  -> analysis driver (root assembly over analyzeIncrement / resolveProject)
  -> fresh whole-project capture + reuse of retained stage products
  -> immutable revision {token, sequence, fingerprints, report, retained}
  -> atomic publication, history, notifications
  -> IPC responses/events -> CLI documents / external consumers

ramify check --batch -> runBatch -> analyzeProject (unchanged)
```

Every revision is a complete Plan 1 pipeline over a coherent captured view.
Reuse only skips recomputation of a stage whose recorded inputs are unchanged;
it never changes findings, coverage or expanded contracts. A capture that
cannot be sealed coherently within Plan 1's three attempts yields the engine's
incomplete report, delivered to the requester unpublished and never a mixed
revision; [Engine results and their delivery](#engine-results-and-their-delivery)
fixes every such case.

### Proposed contract shapes

[contracts.md](contracts.md) holds the exact definitions. The following
requirements constrain them.

| Contract | Owner | Required information / behavior |
| --- | --- | --- |
| `ProjectResolution`, `resolveProjectRoot`, `RetainedConfiguration` | project | Root climb and configuration discovery without source acquisition; a short-lived configuration capture classifies references-only setups; configuration-helper reuse keyed on captured dependencies including absence and directory observations; resolution may use the finite configuration helper to classify references-only setups. |
| `InputChange`, `RetainedAnalysis`, `IncrementInputs`, `IncrementRun`, `analyzeIncrement`, `resolveProject` | analysis | Frozen plain products with per-stage dependency keys and accounted bytes; equal reports with and without reuse; `changes: null` means conservative. |
| `ContextToken`, `ContextRevision`, `ContextStatus`, `InputFingerprints`, `Freshness`, `CheckOutcome`, `OpenOutcome`, `ContextEvent`, `ContextBudgets`, `AnalysisDriver`, `WatcherPort`, `ClockPort`, `ContextManager` | contexts | Identity, ordering, publication, retention and eviction semantics stated as rules, testable with fakes. |
| `RamifyService`, `ServiceResult`, `ServiceError`, `DaemonStatus`, `StopAcknowledged` | root | Plain-data operations shared by the in-process binding and the IPC client; domain outcomes are values, transport failures are errors. |
| `DaemonService`, `DaemonRecord`, `Handshake`, `Welcome`, `WireMessage`, `ConnectOptions`, `ServiceConnection`, `ConnectOutcome`, `DaemonHost` | daemon | Validation in one place; codec shared by host, client and quick tests; records that encode idle, explicit and failed stops, with `retired` reserved. |
| `CliEnvironment.connect`, `WatchLine`, `DaemonStatusDocument` | cli | Injected connector; versioned documents for the two new commands; `check` keeps Plan 1's `ramify.analysis/1` document unchanged in both modes. |

### Coherent inputs, retained products and equivalence

The captured view of Plan 1 is the only reader of project bytes in the daemon;
the watcher supplies paths, never content. Retained products are plain data
detached from the view and the compiler; a context that holds them holds no
handle, program or session. Reports published by the daemon are the same
frozen objects the batch path produces, so the harness compares them by deep
equality after replacing `runId`, as [scope.md](scope.md#batch-and-incremental-comparison)
fixes. Independent expectations accompany every comparison.

## Resolved decisions

Each of the brief's eight decisions ends in one proposal. Details, tables and
numbers live in the named sections of the review package.

1. **Local transport and deployment.** One daemon per user and installation,
   grouped by a `buildKey` over the package path, version and engine identity;
   a Unix domain socket, atomic JSON record, `O_EXCL` start lock and log in a
   `0700` endpoint directory chosen from `RAMIFY_ENDPOINT_DIR`,
   `XDG_RUNTIME_DIR` or the user's temporary directory; detached spawn of
   `dist/src/daemon-entry.js` by the first client that needs it; stale
   sockets and records removed only under the lock after a dead-pid check; a
   duplicate daemon exits with code 3. See [scope.md](scope.md#deployment-arrangement)
   and [contracts.md](contracts.md#client-and-transport-lifecycle).
2. **Context selection and compatibility.** A context is the canonical real
   root plus `ContextSetup { scope, configuration, registry, capabilities }`;
   `ContextId` hashes the canonical root, the request's `scope` and
   `configuration` and the setup's `registry` and sorted `capabilities`;
   `ContextSetup` repeats nothing from `ProjectRequest`. The daemon resolves roots through the
   driver using the CLI invocation rules. Plan 2 accepts only the default
   registry and discovered configuration; anything else is
   `unsupported-setup`. The handshake checks protocol, `buildKey` and engine
   and rejects with `incompatible`, leaving the daemon running. See
   [scope.md](scope.md#context-selection-and-compatibility).
3. **Tokens, fingerprints, reads and supersession.** `ctx/1:`, `gen/1:` and
   `rev/1:` identifiers; six fingerprint classes; client-chosen `requestId`
   echoed on every outcome; `published` and `synchronized` freshness modes;
   a `published` read may name a `revision`, which is answered by exactly that
   retained revision or by `evicted-revision`, never by the current one;
   a synchronized request is satisfied only by a capture started after its
   acknowledgment and may reuse an equal published revision with
   `reusedRevision: true`; `expect` mismatches are `superseded`; an engine
   report without a sealed capture or with incomplete execution is delivered
   `reported` but unpublished; background work is cancellable and never
   publishes over a newer generation. See
   [contracts.md](contracts.md#contexts-isolation-ordering-publication-and-the-analysis-port).
4. **Invalidation dependency model.** Per-stage dependency sets of captured
   input identities, cumulative along the pipeline, with the area map and
   registry identity folded into the compiler stages; a product is reused only
   when its recomputed key is equal; `changes: null` permits only per-file
   parse and metadata reuse; compiler state is not retained across revisions.
   Each row of the architecture's reconsideration table maps onto a minimum
   rerun set. See [scope.md](scope.md#invalidation-dependency-model).
5. **IPC schemas, ordering, bounds and reconnect.** Length-prefixed JSON
   frames of one `WireMessage`; `hello`/`welcome`/`reject`, `request`/`response`,
   `cancel`, `event`, `ping`/`pong`, `goodbye`; 1 MiB requests, 32 MiB + 64 KiB
   responses; per-connection sequence numbers; replaceable `revision-published`
   and `status-changed` events coalesced with a count, `context-evicted` and
   `goodbye` never dropped; slow consumers disconnected at 64 MiB or 256
   frames; no replay, `subscribe` returns `replay: 'not-available'` with the
   current status. See [contracts.md](contracts.md#ipc-framing-messages-and-notification-rules).
6. **Budgets.** Eight contexts, eight revisions and 64 MiB of history per
   context, 96 MiB of retained products per context, 512 MiB global, 10,000
   queued paths, one analysis at a time, 10 minutes warm idle then 30 minutes
   cold, 30 minutes daemon idle exit, 45 s leases with 15 s pings, plus the
   latency and memory targets that start from Plan 1's measurements, are
   revised once from iteration 1's warm-recompute probe and are binding from
   iteration 1's exit; iteration 13 asserts them and records the measured
   values. See
   [scope.md](scope.md#budgets).
7. **Idle exit, crash and explicit stop.** The record's `stopped.reason`
   distinguishes `idle`, `explicit` and `failed` (`retired` is reserved and
   unreachable in Plan 2); the daemon exits idle after `idleExitMs` with no
   lease, where a lease is an active subscription or an in-flight request, and
   idle open connections receive `goodbye` `idle-exit`; a crash leaves a
   `running` record with a dead pid; existing connections recover
   automatically only from failure or a slow-consumer disconnect, within three
   reconnects, one restart and 20 s; explicit stop pauses existing clients
   until `recover('explicit')`, while any newly invoked CLI command may start;
   only a terminating `check` may fall back to a visible in-process batch run,
   and only after exhausted automatic recovery (a failed coordinated start, or
   the reconnects and restart after an unexpected loss); a `check` in flight
   when the daemon is stopped explicitly reports `stopped` with exit 2 and no
   fallback; `watch` and external clients report `unavailable` or `stopped`
   and never load an engine. See [scope.md](scope.md#idle-exit-crash-and-explicit-stop).
8. **Command arguments, output and exits.** `check` keeps its Plan 1 syntax,
   exits and `ramify.analysis/1` JSON document in both resident and batch
   modes and gains a `Mode:` line in human output; `watch` and
   `daemon status`/`stop` are added with the exits fixed below; denial,
   incomplete execution and bounded coverage keep Plan 1's distinct outcomes
   because the report is unchanged. See [Required behavior](#required-behavior-and-diagnostics).

## Required behavior and diagnostics

### Commands

| Invocation | Behavior |
| --- | --- |
| `ramify check [--root <dir>] [--format json]` | Connect to a compatible daemon, starting one if needed; open the context for the resolved root with the thirteen implemented capabilities; run a synchronized check with an empty `expect`; print Plan 1's report, preceded in human output by the `Mode:` line; release the request lease; exit per the report. |
| `ramify check --batch [...]` | Plan 1 behavior: fresh in-process session, no connection, no spawn. Human output gains only the `Mode: batch` line; the JSON document is byte-for-byte Plan 1's. |
| `ramify watch [--root <dir>] [--format json]` | Connect, starting if needed; open the context; subscribe; print the current status; for every `revision-published` event fetch the report with a `published` read naming the event's revision id and print the revision with that report, or a `revision-evicted` line when the read returns `evicted-revision`; print every `status-changed` and `context-evicted` event; ping to keep the lease; after a `slow-consumer` disconnect call `recover('automatic')` and resubscribe once; on SIGINT unsubscribe, close and exit 130. |
| `ramify daemon status [--format json]` | Call the connector with `start: 'never'` and render its outcome: `connected` prints `daemonStatus` as `running: true`; `stopped` prints `running: false` with the connector's record; `not-running` prints `running: false` with `record: null`, `not running` in human output. The CLI imports no daemon value and never reads the record itself. Never spawns, never loads an engine. |
| `ramify daemon stop [--format json]` | Connect with `start: 'never'`; on `connected` send `stopDaemon` naming `connection.daemon.instance.instanceId`; on `stopped` or `not-running` report `no daemon running` with exit 0; wait up to 7 s, longer than the daemon's 5 s `shutdownGraceMs`, for the process to exit; report the disposition. |
| `ramify --help`, `ramify --version` | Unchanged; no connection, spawn or engine. |
| Any other command or option | `invalid-invocation`, exit 2, unchanged. |

The human `check` output inserts one line after `Configuration:`:
`Mode: resident (daemon <pid>; context <ContextId>; revision <sequence>; synchronized[; revision reused])`,
`Mode: resident (daemon <pid>; context <ContextId>; unpublished; synchronized)`
for an engine result that was delivered but not published,
`Mode: resident (daemon <pid>; no context)` for an unresolved selection,
`Mode: batch` or `Mode: batch fallback (<reason>)`. Everything after that
line is Plan 1's report rendering, so Plan 1's substring assertions on human
output hold. `watch` prints `Watching <root> (context <ContextId>, generation
<GenerationId>)` and then, per revision,
`Revision <sequence> (<cause>; changed <n> paths; reused <stages>)` followed
by the report's findings block, or `Revision <sequence> (evicted before it
could be read)`. JSON mode writes exactly one `ramify.analysis/1` document for
`check` in every mode, with no additional member, or one
`ramify.daemon-status/1` document, or one `ramify.watch/1` object per line.
A normal resident or batch `check`, including one that starts the daemon,
writes nothing to stderr; recovery notices and the fallback notice go to
stderr, and in JSON mode the `Mode: batch fallback (<reason>)` line is written
to stderr instead of stdout. Resident facts reach JSON consumers through
`watch --format json` and `daemon status --format json`, not through the
`check` document.

### Exits

| Command | 0 | 1 | 2 | 130 |
| --- | --- | --- | --- | --- |
| `check` (resident, batch, fallback) | Completed, no definite errors | Violations or invalid input | Could not complete: invalid invocation, no project or configuration, unavailable capability, an engine result delivered unpublished, daemon unavailable after recovery with no eligible fallback, explicit stop received mid-flight, resource limit | Interrupted; no result claimed; cancel frame sent |
| `watch` | never | never | Invalid invocation, daemon unavailable after recovery, a lease released for a missed ping, explicit stop, eviction without a valid reopen, invalid project | Interrupted after releasing the subscription |
| `daemon status` | Reported, running or not | never | Invalid invocation or unreadable endpoint directory | Interrupted |
| `daemon stop` | Stopped, or no daemon was running | never | Wrong instance, stop failed or timed out | Interrupted |

### Error table

| Condition | Code seen by the CLI | Human message | JSON |
| --- | --- | --- | --- |
| Request rejected by structural validation | `invalid-request` error | `Error [invalid-request]: …` | `ramify.cli/1` envelope, exit 2 |
| Setup not supported in this plan | `unsupported-setup` value from `openContext` | `Error [unsupported-setup]: registry 'custom' is not available; only 'default'` | same |
| Token from an evicted or restarted context | `expired-generation`, `unknown-context` | `watch` prints `Context reopened with generation …` and resubscribes once; `check` reopens once, then reports the error | same on final failure |
| Evicted revision named by a `published` read | `evicted-revision` value | `watch`: `Revision <sequence> (evicted before it could be read)`; a direct client receives the value | `watch` line `revision-evicted`; continues |
| Daemon over budget | `resource-unavailable` value or error | `Error [resource-unavailable]: …`, exit 2; no fallback | same |
| Engine result delivered unpublished (coherent view not sealed, acquisition or stage failure, resource limit inside the engine) | `reported` with `published: false` | `Mode: resident (…; unpublished; synchronized)` then Plan 1's incomplete rendering | Plan 1's report with `outcome.execution` `incomplete` or `unavailable`, exit 2 |
| Unresolved selection (no root, no configuration, references-only configuration, invalid layout) | `OpenOutcome` `unresolved` with the engine's report | `Mode: resident (daemon <pid>; no context)` then Plan 1's rendering, the same diagnostics as `--batch` | Plan 1's report; exit 1 for invalid, 2 for unavailable |
| Expectation path not observed in a sealed capture | `unobserved-input` | `Error [unobserved-input]: path was not captured`, exit 2; no fallback or guessed absence | `ramify.cli/1` envelope, exit 2 |
| Driver threw or rejected | `unavailable` with `analysis-failed` | `Error [analysis-failed]: …` | `ramify.cli/1` envelope, exit 2 |
| Daemon lost, recovered | none | stderr `Reconnected to daemon <pid> (restarted: yes; generations changed)` | continues |
| Daemon lost, recovery exhausted; coordinated start failed | `DisconnectReason` `failure` | `check`: `Mode: batch fallback (daemon unavailable: …)`; `watch`: `Error [unavailable]: daemon unavailable after 3 reconnects and 1 restart` | `check`: the batch report on stdout and the fallback line on stderr; `watch` line `unavailable` |
| Explicit stop | `DisconnectReason` `explicit-stop`; `stopping` error for a request in flight | `watch`: `Stopped: daemon stopped explicitly (request …)`, exit 2; `check` in flight: `Error [stopped]: daemon stopped explicitly (request …)`, exit 2, no fallback | `watch` line `stopped`; `check`: `ramify.cli/1` envelope with code `stopped`, exit 2 |
| Idle exit while a bare connection is open | `DisconnectReason` `idle-exit` on a direct client holding no subscription or request | Not a CLI outcome: `watch` holds a subscription lease, so the daemon cannot exit idle while it runs (I2-18:watch-lease-prevents-idle); the direct client's `recover('automatic')` returns `stopped` with the record and starts nothing (I2-18:idle-exit) | none |
| Incompatible daemon on the socket | `incompatible` | `Error [incompatible]: daemon protocol … client …`, exit 2; no reconnect or restart | exit 2 |
| Connection limit reached | `reject` with `resource-unavailable` before `welcome` | `Error [resource-unavailable]: daemon connection limit reached`, exit 2; no reconnect or restart | exit 2 |
| Wrong instance on stop | `wrong-instance` | `Error [wrong-instance]: …` | exit 2 |
| Slow consumer | `DisconnectReason` `slow-consumer` | `watch`: `Disconnected: this client fell behind; resubscribing`, then `recover('automatic')` and one resubscription | continues or `unavailable` |
| Lease released for a missed `ping` (no client frame within `leaseMs` on a connection holding subscriptions) | `DisconnectReason` `closed` from the daemon's `goodbye` | `watch`: `Error [unavailable]: daemon released this client's lease`, exit 2; `closed` is final, so no reconnect or restart; a direct client's `recover` returns `unavailable` | `watch` line `unavailable`; exit 2 |

### Engine results and their delivery

The engine's `AnalysisReport` is the only carrier of analysis diagnostics in
both modes. The context manager publishes a report as a revision only when the
driver returns retained products, which `analyzeIncrement` does exactly when
the capture sealed a coherent view and `outcome.execution` is `completed` or
`invalid`. Every other engine result reaches the requester unchanged, so the
CLI renders it as `--batch` would.

| Engine result | Delivery | Published revision | CLI |
| --- | --- | --- | --- |
| Completed report from a sealed capture | `reported`, `published: true` | Advances | Plan 1 rendering; exit 0 or 1 |
| Invalid report from a sealed capture (invalid description, registry or layout, missing owned export) | `reported`, `published: true` as an invalid revision; `lastValid` unchanged | Advances | Plan 1 rendering; exit 1 |
| Incomplete or unavailable report (coherent view not sealed within three attempts, acquisition read failure, stage or helper failure, engine resource limit) | `reported`, `published: false`, `revision: null` | Unchanged; the context is `reconciling` until a later publication | Plan 1 rendering with the `unpublished` `Mode:` line; exit 2 |
| Unresolved selection (`root-not-found`, `configuration-not-found`, `references-only-configuration`, layout issues the resolver reports) | `openContext` returns `unresolved` with the engine's report for the request; no context exists | None | Plan 1 rendering with `Mode: resident (daemon <pid>; no context)`; exit per the report |
| Driver exception | `unavailable` `analysis-failed` | Unchanged | `Error [analysis-failed]`; exit 2 |

`Unavailable` is reserved for context-level reasons, each listed in
[contracts.md](contracts.md#contexts-isolation-ordering-publication-and-the-analysis-port);
it never carries analysis diagnostics.

### Freshness and supersession guarantees

The guarantees a consumer may rely on are fixed in
[scope.md](scope.md#freshness-and-supersession-guarantees): synchronized
checks are computed from a capture started after acknowledgment; published
reads never claim disk freshness; delayed watchers cannot affect synchronized
results; acknowledged requests are never coalesced away; background work never
publishes over a newer generation; generations change on reopen and restart;
evicted revisions and invalid current inputs are never replaced by a
substitute; and resident reports equal batch reports for identical captured
inputs.

## Acceptance matrix

Every row is required. Subcase names are stable executable instance suffixes,
for example `I2-09:remove-exposure`; the [inventory](subcases.md) lists every
instance with its iteration, fixture, evidence kind and expectation. A row is
complete only when all its subcases ran and asserted their own result. Quick
evidence runs the real engine and contexts through the daemon-owned service
with controlled watcher and clock; `ipc` and `process` evidence uses the real
socket and the compiled entries and is never replaced by a quick run.

| ID | Families | Required subcases and independently expected outcome |
| --- | --- | --- |
| I2-01 | DA01, QT01, PC03 | `cold-context`: a cold context checks the unchanged reference and its first revision equals the batch report; `unavailable-capability`: a browser-verification request is explicitly unsupported; `unsupported-setup`: a non-default registry or scope is rejected, never substituted. |
| I2-02 | DA02, PC03 | `delayed-watcher`: a save is checked from a capture after acknowledgment while the watcher stays silent; `expect-match` and `expect-superseded`: supplied identities verify or supersede; `provider-influence`: an unchanged importer is rechecked when its provider's declaration changes. |
| I2-03 | DA03 | `two-worktrees`: identical relative paths with different declarations stay isolated; `unknown-context`: unknown ids and foreign generations never reach another root; `same-root-reuse`: the same selection shares one context. |
| I2-04 | DA04 | `concurrent-readers`: complete revisions only; `stale-publish-blocked`: superseded work publishes nothing; `own-request-label`: each outcome carries its own request id. |
| I2-05 | DA03, DA04, DA15 | `context-id-derivation`, `branch-irrelevant`, `generation-on-reopen`, `revision-monotonic`, `fingerprint-classes`. |
| I2-06 | DA04, ML04 | `queue-order`, `coalesce-background`, `cancel-request`, `cancel-background`, `wait-first-publication`. |
| I2-07 | DA05 | `invalid-current`, `historical-last-valid`, `recovery-publishes`, `pending-before-publication`. |
| I2-08 | DA09, ML04 | `lost-events`, `overflow`, `watcher-error`, `unwatched-dependency`, `debounce`. |
| I2-09 | DA05–DA09, DA13, DA14, E02, E05, E07, E09, T03, O03, S04 | `remove-exposure`, `repair-exposure`, `tag-change`, `move-to-testing`, `wildcard-add`, `wildcard-remove`, `foreign-wildcard-invalid`, `type-to-runtime-merge`, `alias-identity`, `config-change`, `shim-change`, `missing-file-appears`, `readme-edit`, `invalid-description`, `invalid-recovery`, `resolver-failure`: each change produces the independently expected rechecks, removals, invalid revision or unpublished incomplete result through the quick service with the real engine. |
| I2-10 | DA09, DA10, PC03 | `null-changes-no-reuse`, `metadata-only-reuse`, `exposure-only-reuse`, `header-tag-rerun`, `source-rerun`, `configuration-rerun`, `absent-appears-rerun`, `dependency-rerun`, `products-plain`, `resolve-given`, `resolve-found`, `resolve-outside`, `resolve-no-configuration`. |
| I2-11 | DA10, DA14 | `identical-inputs-equal`, `reuse-equal`, `independent-negatives` over a six-step reference edit sequence at the API; `commonjs-module-target-limit` and `declare-global-note`: the two inherited coverage outcomes reported identically by `analyzeProject` and `analyzeIncrement`. |
| I2-12 | ML02, ML03, DA04, DA15 | `history-count`, `history-bytes`, `global-bytes`, `context-lru-eviction`, `leased-not-evicted`, `resource-unavailable`, `evicted-revision`, `retained-revision-exact`. |
| I2-13 | QT03 | `invalid-context-request`, `invalid-scope-request`, `sync-throw`, `async-failure`, `dispose-cancels`, `unknown-operation`. |
| I2-14 | QT04, PC07, DA15 | `framing-roundtrip`, `malformed-frame`, `oversized-request`, `oversized-response`, `error-preservation`, `token-preservation`, `handshake-incompatible`, `cancel-frame`. |
| I2-15 | PC09, ML01 | `connect-validation`, `lease-release-on-close`, `abrupt-host-loss`, `client-entry-lightweight`. |
| I2-16 | ML04, QT04, QT07 | `ordering-per-context`, `coalesce-replaceable`, `non-replaceable-kept`, `slow-consumer-disconnect`, `reconnect-no-replay`. |
| I2-17 | PC02, QT05 | `simultaneous-start`, `stale-record`, `stale-lock`, `already-running-exit`, `directory-ownership`. |
| I2-18 | PC06, DA15, QT05, ML07 | `idle-exit`, `restart-after-idle`, `crash-recovery`, `explicit-stop`, `missed-stop-notification`, `new-command-after-stop`, `watch-lease-prevents-idle`, `incompatible-bounded`. |
| I2-19 | PC01, ML01 | `daemon-entry-boundary`, `cli-check-boundary`, `help-version-unchanged`, `status-no-start`, `batch-no-daemon`. |
| I2-20 | PC03, PC04, QT01, DA01 | `human`, `json-bare-report`, `exit-clean`, `exit-denied`, `exit-invalid`, `exit-unavailable`, `synchronized-after-save`, `root-from-subdirectory`, `interrupt`. |
| I2-21 | PC04, QT01 | `stream-updates`, `bounded-burst`, `interrupt-release`, `json-lines`. |
| I2-22 | PC01, PC06 | `status-none`, `status-running`, `stop-running`, `stop-none`, `stop-wrong-instance`. |
| I2-23 | PC10, PC06, DA15, ML07 | `check-fallback-visible`, `stop-no-fallback`, `watch-no-fallback`, `client-no-fallback`, `fallback-disposes`. |
| I2-24 | QT01, QT03, DA15 | `quick-check-flow`, `quick-watch-flow`, `quick-watch-evicted`, `quick-status-stop`, `codec-in-direct-channel`. |
| I2-25 | DA10 | `reference-sequence`, `hundred-owner-sequence`, `contracts-and-coverage-equal`, `removals`: resident and batch reports equal at every step of the recorded sequences. |
| I2-26 | DA06, DA07, DA08, E02, E07, T03, O03 | `remove-hop-live`, `restore-hop-live`, `wildcard-growth-live`, `merge-live`, `testing-move-live` with the real watcher. |
| I2-27 | PC04, ML07, QT05, ML03, DA17 | `watch-exit-releases`, `command-exit-releases`, `idle-disposal-releases`, `eviction-under-many-contexts`, `reconnect-after-crash-live`. |
| I2-28 | harness discipline (Plan 1 `I1-30:harness-required` analogue) | `required-membership`, `removed-record-fails`, `failing-assertion-fails`, `iteration-filter`. |
| I2-29 | DA17, ML01–ML04, ML06, QT07 | `entry-footprints`, `cold-warm-broad-reference`, `cold-warm-broad-hundred`, `repeated-edit-plateau`, `many-contexts`, `slow-consumer`, `synthetic-500`, `synthetic-1000`, `publication-peak`. |
| I2-30 | DA18, PC01, QT05 | `self-check-eleven`, `self-negative-contexts`, `declarations-final`, `package-entries`, `relocated-resident`, `plan1-regression`. |

The matrix exercises only the stated portions of each family. PC07 covers the
local service and the direct client, not tRPC or MCP; PC06 and PC10 cover the
daemon and CLI portions; ML08, QT08, PC05 and PC08 remain later plans'
evidence. DA11 and DA12 are not started here. DA16 was established by Plan 1's
browser-tag matching and remains unaffected.

## Harness implementation and evidence

Extend the existing harness; do not add a second checker or a second daemon.

1. Add `plan2-instances.ts` transcribing every leaf of [subcases.md](subcases.md);
   `plan.ts` validates the transcription against this plan's matrix and
   iteration table; `--plan 2` selects it. One migration accompanies the
   resident `check` in iteration 9: every Plan 1 test and handler that
   invokes `check` to verify the batch engine in the invoking process
   (`src/tests/batch-cli.test.ts`, `src/tests/cli-process.test.ts`, the
   harness's `cli-cases.ts`, `self-cases.ts`, `gate-cases.ts`,
   `relocation.ts` and `cli-direct-worker.ts`) adds `--batch` to its argv,
   which Plan 1 already accepts and which changes nothing else, and every
   constructed `CliEnvironment` (`src/tests/fixture.ts`, the inline
   environment that `src/tests/batch-cli.test.ts` passes to `runCli`,
   `cli-cases.ts`, `cli-direct-worker.ts`,
   `subs/cli/src/tests/arguments.test.ts`) gains a `connect` that fails the
   test if called. Their JSON documents, human substrings, exits and empty
   stderr stay exactly as recorded, which is why `check` keeps the bare
   `ramify.analysis/1` document. Two Plan 1 expectations state the Plan 1
   tree shape and are revised, independently of any declaration, to the
   Plan 2 shape they verify: `self-cases.ts` asserts
   `'exact nine implemented owners'` by equality with a literal list of nine
   owner ids and becomes `'exact eleven implemented owners'` with
   `ramify/daemon` and `ramify/daemon/contexts` added to that literal list;
   `relocation.ts` asserts `'every reviewed portable Node and UI package
   entry remains declared'` and `'all seven actual package entry imports
   executed'` against a literal seven-entry `entryFunctions` map and becomes
   eight with `'ramify.ts/client': 'connectDaemon'` added and the second
   label `'all eight actual package entry imports executed'`. These two
   revisions back three instance records (`I1-27:self-check`,
   `I1-27:self-negative`, `I1-28:relocated-package`); the other 305 Plan 1
   records and their expectations are byte-untouched, and the harness keeps
   its own literal lists rather than deriving them from declarations or
   `package.json`.
2. Register capabilities `increment`, `contexts`, `daemon-service`, `ipc`,
   `client`, `daemon-process`, `cli`, `lifecycle`, `equivalence`,
   `harness-gate`, `resident-measure` and `completion`; availability is
   distinct from execution.
3. Quick instances build their environment with root's `createQuickEnvironment`
   over a harness copy; unit instances use contexts' controlled ports and a
   scripted driver; `ipc` instances open real socket pairs inside one process
   with `startDaemon` over the quick service, which is why every `ipc`
   instance belongs to iteration 8, where `startDaemon` lands; `process`
   instances spawn the compiled daemon entry and the installed executable with
   a unique `RAMIFY_ENDPOINT_DIR`, using root's tracing preload extended to
   record `connect` events and unix-socket listeners.
4. Every process instance kills its daemon and removes its endpoint directory
   in `finally`; a surviving daemon fails the instance. Concurrent runs never
   share an endpoint directory.
5. Equivalence instances materialize each step, run both modes and compare as
   [scope.md](scope.md#batch-and-incremental-comparison) fixes, while
   asserting the step's independent expectation.
6. Measurement instances run through `npm run measure:resident` and assert
   the recorded values against the [budget tables](scope.md#budgets); raw
   results are archived beside Plan 1's.
7. `--iteration <n>` requires the named iteration's instances and its
   transitive prerequisites; the unfiltered command requires everything and is
   expected to fail until iteration 14.
8. Once iteration 9 delivers the resident `check`, `npm run check:self` and
   `npm run check:reference` keep their text and therefore run resident by
   default, starting or reusing a daemon. Every harness or scripted run of
   either command sets `RAMIFY_ENDPOINT_DIR` to a directory it owns and stops
   the daemon it started in `finally`, so no run leaves a daemon in the
   user's endpoint directory; the iteration files repeat this for each
   verification block.

| Command from the Ramify root | Meaning |
| --- | --- |
| `npm run reference:verify -- --plan 2` | Require every I2 instance; fail on missing capabilities, removed records, unrun or failed assertions. |
| `npm run reference:verify -- --plan 2 --iteration <n>` | Require the named iteration and its prerequisites; report the rest as not executed. |
| `npm run reference:verify -- --plan 1` | Unchanged; required to pass on the Plan 2 build by I2-30. |
| `npm run measure:resident` | Run the resident measurement recipe and archive raw results. |
| `npm run check:self` | Unchanged command; resident by default from iteration 9; must report eleven owners. |
| `npm run check:reference` | Unchanged command; resident by default from iteration 9; batch output is verified through `--batch`. |
| `npm run reference:cases`, `npm run reference:report` | Unchanged; the report gains the Plan 2 capability inventory. |

## Iteration sequence

The plan runs as fourteen iterations, each written to be implemented within
a single 250k-token context: one owner or one capability, a bounded slice of
the matrix, its own verification commands and exit criteria. The iteration
files under [`iterations/`](iterations/manifest.json) follow the existing
headings. Iterations 6 and 7 may run in parallel after 5; iterations 11, 12
and 13 may run in parallel after 10. The completion gate is iteration 14's
exit.

| # | Iteration | Owners | Requires | Executes |
| --- | --- | --- | --- | --- |
| 1 | Contract package, probes and review points | none | none | review only: accept contracts.md, owners.md, scope.md, subcases.md; run the five [probes](#probes); settle RP-2, RP-4 to RP-8 (RP-1 and RP-3 are decided in this revision) |
| 2 | New owner skeletons, harness `--plan 2` and synthetic generators | daemon, contexts (headers only); harness; the synthetic generator with S100, S500 and S1000 | 1 | I2-28 |
| 3 | Analysis increments and project resolution | analysis with its project child; `typescript` for the `declare global` fix | 2 | I2-10, I2-11, including the two inherited coverage instances |
| 4 | Contexts owner | contexts | 3 | I2-05, I2-06, I2-07, I2-08, I2-12 |
| 5 | Shared service, root interface and quick environment | daemon (service, real ports, message codec through N2, connect vocabulary); root `interfaces/service.ts`, `resident-assembly.ts`, quick environment | 4 | I2-01, I2-03, I2-04, I2-13 |
| 6 | Edit semantics through the quick service | harness handlers; an owner only for a defect the scenarios find | 5 | I2-02, I2-09 |
| 7 | Codec, discovery and the lightweight client | daemon (framing, discovery, records, launcher, client); `./client` entry | 5 | none; owner tests only, with quick evidence over the in-process connector |
| 8 | Daemon host, records, process entry and real IPC | daemon (`host.ts`, `startDaemon`); root `daemon-entry.ts` | 7 | I2-14, I2-15, I2-16, I2-17 |
| 9 | CLI commands and fallback | cli; root `client.ts`, `cli-entry.ts` wiring; the Plan 1 `--batch` migration | 6, 8 | I2-20, I2-21, I2-22, I2-23, I2-24 |
| 10 | Entries, final declarations and boundaries | all eleven declarations; package entries; `scripts/validate-final-contracts.ts` | 9 | I2-19 |
| 11 | Reference edit sequences and equivalence gate | integration | 10 | I2-25, I2-26 |
| 12 | Real process lifecycle and recovery suite | integration | 10 | I2-18, I2-27 |
| 13 | Resident measurements and budgets | measurement tooling | 10 | I2-29 |
| 14 | Self-check, relocation, completion report | integration | 11, 12, 13 | I2-30 |

Iteration 1 is a review gate: iteration 3 onward implements the reviewed
contracts, and a change to them revises iteration 1's package first.
Iteration 2's harness registration lists every instance as not executed.
Iteration 4 follows iteration 3 because the contexts interface names the
analysis and project types iteration 3 adds. Iterations 5, 8, 9 and 10 touch
root files only for the assembly, entry, wiring and declaration work named in
their rows; iteration 10 completes the eleven final declarations and the
eight package entries, extending `scripts/validate-final-contracts.ts`.
Iteration 7 executes no matrix row: every `ipc` instance needs `startDaemon`
over the quick service, which iteration 8 delivers, so iteration 7's evidence
is its owner tests over the in-process connector and a fake entry.

### Probes

Iteration 1 runs five probe scripts under `scripts/probes/`, in the scripts
scope selected by `tsconfig.scripts.json`, each with `npx tsx scripts/probes/<name>.ts`
and each archiving `scripts/probes/results/<name>.json`, as Plan 1's
[probe record](../done/iteration-1-project-verifier/probes.md) did. The record
`probes.md` beside this plan cites every result.

| Script | Result file | Must establish before iteration 3 |
| --- | --- | --- |
| `unix-socket-framing.ts` | `results/unix-socket-framing.json` | Length-prefixed frames round-trip over a socket pair at 1 MiB and 32 MiB with partial reads; the portable guard rejects paths over 100 bytes before Node (raw OS acceptance/truncation is recorded); a `0700` directory with a foreign owner or group/other bits is detectable before use. |
| `fs-watch-recursive.ts` | `results/fs-watch-recursive.json` | Recursive `fs.watch` on a reference copy delivers root-relative paths, demonstrates callback filtering versus truly pruned per-directory watches, batches 100 rapid edits within the 100 ms debounce, and records bounded-queue overflow, injected errors, real missing-root failure and close semantics separately from unobservable kernel loss. |
| `atomic-record.ts` | `results/atomic-record.json` | A temporary file plus `rename` is never observed partially written by a concurrent reader; `O_CREAT|O_EXCL` lock creation serializes eight contenders; a lock with a dead pid is detectable. |
| `detached-spawn.ts` | `results/detached-spawn.json` | A detached, unreferenced child outlives its parent, its exit code propagates to the record, `process.kill(pid, 0)` reports liveness correctly, and a second start against a bound socket can detect the live peer. |
| `warm-recompute.ts` | `results/warm-recompute.json` | The median wall time and per-stage split of twenty in-process full Plan 1 pipeline runs on the reference and the 100-owner fixture: the floor from which the warm latency targets are revised. |

## Validation and completion conditions

Run the following in the Ramify package; script additions above are
implementation tasks, not commands claimed to exist today. The exported
`RAMIFY_ENDPOINT_DIR` keeps the resident `check:reference` and `check:self`
daemon out of the user's directory, and the final `daemon stop` ends it.

```sh
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run build
npm run type-check
npm test
npm run reference:cases
npm run check:reference
npm run check:self
npm run reference:verify -- --plan 1
npm run reference:verify -- --plan 2
npm run measure:resident
npm run reference:report
npm run diagrams
npm run site:build
node dist/src/cli-entry.js daemon stop
git diff --check
```

Use the quick environment for CLI and service flows, controlled ports for
contexts, real socket pairs for framing and notification behavior, and the
compiled entries for startup, loss, stop, leases, eviction and dependency
boundaries. Compare resident and batch reports on every recorded sequence and
keep the independent expectations. Measure on the reference and the three
synthetic fixtures with retained raw results, dependency versions and build
identity; record the final numeric budgets in scope.md before acceptance.

The plan is complete only when all of these hold:

- [ ] `ramify check` inside the reference starts or reuses a daemon, reports a
  synchronized result, and after an edit reports that edit without waiting
  for the watcher; `ramify watch`, `ramify daemon status` and
  `ramify daemon stop` behave as the command table states.
- [ ] Every required I2 subcase ran and asserted its independent expectation;
  quick, ipc, process and measurement evidence are recorded separately.
- [ ] Resident and batch reports are equal for identical captured inputs on
  every recorded sequence, including coverage notes and expanded contracts.
- [ ] Removed exposures, tag changes, testing moves, wildcard growth,
  type-to-runtime merges, configuration, shim and missing-file changes and
  README edits produce the expected rechecks and removals.
- [ ] Delayed, lost and overflowing watchers and concurrent saves yield
  verified results or explicit supersession, never falsely fresh success.
- [ ] Two worktrees and incompatible setups stay isolated; invalid current
  descriptions are never answered from a last-valid model.
- [ ] Simultaneous startup, abrupt loss, explicit stop with a missed
  notification, idle exit followed by a real request, watch leases, eviction,
  reconnect and disposal pass with the real daemon and installed CLI, and
  direct clients receive the same validation and leases.
- [ ] Only a terminating `check` falls back, visibly, and disposes; `watch`
  and direct clients report unavailable without loading or spawning an
  engine.
- [ ] Entry footprints, warm and cold latencies, the repeated-edit plateau,
  many-context and slow-consumer runs and the 500 and 1,000-owner fixtures
  meet the recorded budgets, with raw results archived.
- [ ] `npm run check:self` accepts eleven owners; the contexts-to-root
  negative is denied; all eleven declarations and eight package entries
  validate; the relocated install checks through its own daemon.
- [ ] Plan 1's 308 instances pass on the same build.
- [ ] The completion report records the client API, lifecycle and error
  tables, codecs, revision and freshness guarantees, per-platform transport
  details, budgets, the direct-service harness and the fixtures Plans 3–6
  need.

## Risks and decisions to settle early

| Risk | Required response inside this plan |
| --- | --- |
| Stage reuse returns a product whose dependencies were not fully recorded | Dependency sets are recorded by the view during acquisition, cumulative by construction, and I2-10 and I2-25 compare every reuse with a fresh batch report; a mismatch fails the gate, never the comparison. |
| A synchronized request is answered from a capture that predates a save | The manager records acknowledgment and capture-start times from the same clock and I2-02, I2-06 and I2-20 assert the ordering with controlled and real timing. |
| Two launches produce two daemons or one daemon serves a stale socket | Lock, record, pid check and the duplicate-daemon exit code are fixed; I2-17 runs eight simultaneous starts and stale records. |
| A missed stop notification looks like a crash | The record is written before sockets close and clients read it; I2-18 `missed-stop-notification` suspends the client during the stop. |
| Warm-edit budgets are unattainable without retaining compiler state | Iteration 1's probe measures the in-process recompute floor; the deferral's trigger is written; budgets may be revised by review, not by silent relaxation. |
| The watcher misses changes under excluded directories | Synchronized captures rehash influencing inputs regardless of the watcher; the periodic `verify` capture covers published reads; I2-08 `unwatched-dependency` and I2-10 `dependency-rerun` assert it. |
| Reports on the wire exhaust memory in a slow client or the daemon | Outbound bounds and slow-consumer disconnects are fixed; I2-16 and I2-29 measure them. |
| Resident `check` changes what Plan 1's tests and handlers observe | The JSON document stays Plan 1's bare `ramify.analysis/1`, a normal run writes nothing to stderr, and the harness item 1 migration adds `--batch` where the batch engine itself is under test and revises only the two tree-shape expectations it names; I2-30 `plan1-regression` runs the Plan 1 gate on the Plan 2 build. |
| Self-checking gives false confidence | The contexts-to-root negative, Plan 1's gate and the relocated resident check are required. |
| Iteration 9 exceeds one context: it carries the CLI owner, root `client.ts` and `cli-entry.ts`, the Plan 1 migration across seven files and 28 mostly process instances | The iteration 1 review may split it into a commands iteration and a migration iteration if the contract package shows it exceeding one 250k-token context; a split keeps I2-20 to I2-24 with the commands and the seven-file `--batch` and `connect` migration with the Plan 1 gate, and renumbers nothing until that review decides. |
| Contract work drifts into Plan 3–6 features | Unsupported operations return `unsupported-operation`; no inspection, overlay or MCP field is implemented. |

Review points for iteration 1, each with the recommended choice:

| ID | Question | Alternatives | Recommendation or decision |
| --- | --- | --- | --- |
| RP-1 | JSON output of `ramify check` | (a) bare `ramify.analysis/1` in both modes, resident facts only in the human `Mode:` line, the `watch` lines and `daemon status`; (b) a wrapping envelope document in both modes; (c) an additive `resident` member inside `ramify.analysis/1` | Confirmed in iteration 1: (a), unchanged. Plan 1's `scripts/reference-harness/cli-cases.ts` (I1-26) and `self-cases.ts` compare the compiled `ramify check --format json` document with the API report by deep equality after removing only `runId`, and every compiled run asserts empty stderr; an envelope or an additional member would fail I2-30 `plan1-regression`, whose records harness item 1 leaves untouched apart from the two tree-shape expectations. The sealed [invocation contract](../../architecture/cli-invocation.spec.md#output-and-exit) and every other consumer (`src/tests/batch-cli.test.ts`, `relocation.ts`, `gate-cases.ts`) read named members and are unaffected either way. Plan 3 defines revision-qualified JSON for its own commands. |
| RP-2 | Compiler state across revisions | (a) defer, reuse stage products keyed on inputs; (b) keep one long-lived helper snapshot per context | Iteration 1 choice: (a). Measured floors 3.442 s / 5.723 s support revised targets; helpers remain finite. Revisit only through a reviewed contract if iteration 13 misses the source-edit target. |
| RP-3 | Terminating `check` when the daemon is explicitly stopped mid-flight | (a) exit 2 `stopped`; (b) visible batch fallback | Confirmed in iteration 1: (a), unchanged. The architecture ties in-process fallback to exhausted automatic recovery and makes an explicit stop a user decision that existing clients report as stopped; the `check` prints `Error [stopped]: …` and exits 2 with no fallback. |
| RP-4 | Daemon grouping | (a) one daemon per user; (b) one per user and installation | Iteration 1 choice: (b). Hash the entire production runtime file set, not only the entry, so a rebuilt engine changes groups; the old group idles out. |
| RP-5 | Watching `node_modules` | (a) recursive watch of everything; (b) exclude dependency trees, rehash on synchronized captures, verify every 60 s | Iteration 1 choice: (b). Use recursive enumeration with pruned non-recursive handles; callback filtering still watches excluded trees. Verify every 60 s even while the watcher is unavailable. |
| RP-6 | Concurrent analyses | (a) one per context; (b) one per daemon | Iteration 1 choice: (b), one analysis per daemon. Keep batch-derived peak ceilings; the recompute probe is not a two-helper-set memory measurement. |
| RP-7 | Provisional latency and memory targets | Fix them now, or after the iteration 1 probe | Iteration 1 revision: reference source 4.5 s and broad 5.5 s, from the 3.442 s / 5.723 s recompute medians; other latency and memory targets retained. scope.md records the formula and values, binding from iteration 1 exit subject to package acceptance. Iteration 13 asserts them without silent relaxation. |
| RP-8 | `watch` exit on SIGINT | 0 or 130 | Iteration 1 choice: 130, preserving the invocation contract and distinguishing interruption from failure. |
| Schedule-1 | Contexts prerequisites | Iteration 4 after 3, or parallel | Confirmed: 4 follows 3; its port consumes the real analysis/project types. |
| Schedule-2 | Codec and connect vocabulary | Message codec in 5, or all codec work in 7 | Confirmed: message codec and connect vocabulary in 5, framing/discovery/client in 7. Corrected root R7 activation: contexts/fakes and connect/service slices in 5, remaining client slice in 7. |
| Schedule-3 | Socket host and IPC evidence | Host in 8, or earlier socket tests | Confirmed: `startDaemon`, host and every IPC instance in 8, after the client. |
| Schedule-4 | Iteration 9 size | Keep commands and migration together, or split | Keep together: the migration is mechanical and the same iteration must prove the unchanged batch surface; no iteration or matrix renumbering. |
| Review-1 | Corrections beyond RP-1–RP-8 | Revised package or implement the original contradictions | Revised package: sealed invalid inputs, request-specific report facts, expectation coverage, coalescing/error vocabulary, staged relays, whole-runtime identity, live-lock preservation and cold retention are specified in contracts.md and scope.md. Architecture acceptance is still required before iteration 3. |

Do not add persistent caches, worker pools, a configuration language, a
second checker or an inspection command to resolve schedule pressure. If a
required case cannot be implemented within the agreed scope, report the
specific unfinished capability; changing the plan gate requires an explicit
plan revision.
