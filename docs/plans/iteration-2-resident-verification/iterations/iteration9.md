# Iteration 9: CLI commands and fallback

**Plan:** [Plan 2: Keep verification current](../main-plan.md).
**Prerequisites:** iterations 6 and 8 (`daemon-service` with the edit
scenarios, `daemon-process`, `client`, `ipc`). **Owners:** `subs/cli/`; root
`src/client.ts` and the `src/cli-entry.ts` wiring; the Plan 1 `--batch`
migration in root tests and the harness; root
`src/tests/cli-resident-process.test.ts`.

## Goal

Deliver the user-facing commands: `check` through the daemon with the human
`Mode:` line and Plan 1's unchanged `ramify.analysis/1` document, `watch`
streaming `ramify.watch/1` lines whose reports are fetched by revision id,
`daemon status` and `daemon stop`, the visible batch fallback for terminating
checks after exhausted recovery only, `stopped` with exit 2 for a check
interrupted by an explicit stop, and unchanged `--batch`, `--help` and
`--version`. Migrate Plan 1's batch-engine tests and handlers to `--batch`
so the Plan 1 gate keeps passing on this build.

## Read first

- Main plan: Required behavior and diagnostics in full (commands, human
  output and JSON rule, exits, error table, Engine results and their
  delivery); Resolved decisions 3, 7 and 8; RP-1 and RP-3; Harness
  implementation and evidence items 1 and 8; matrix rows I2-20 to I2-24.
- [contracts.md](../contracts.md): CLI: commands, environment and output
  documents, including the `CliEnvironment.connect` migration; Package
  entries and activation; the `ConnectOutcome`, `ServiceConnector`,
  `RecoveryOutcome` and `DisconnectReason` declarations.
- [scope.md](../scope.md): Idle exit, crash and explicit stop; Startup, retry
  and recovery limits (the cancel-after-interrupt row).
- [owners.md](../owners.md): CLI, Root, Foreign signature types, the
  iteration 9 row.
- [CLI invocation](../../../architecture/cli-invocation.spec.md) in full;
  [Processes and clients](../../../architecture/processes-and-clients.md):
  CLI commands; PC01, PC03, PC04, PC10.
- Source: `subs/cli/src/{arguments,run-cli,format}.ts`,
  `subs/cli/src/interfaces/cli.ts`, `src/cli-entry.ts`, `src/batch.ts`,
  `src/tests/{fixture,batch-cli.test,cli-process.test}.ts`, the harness's
  `cli-cases.ts`, `self-cases.ts`, `gate-cases.ts`, `relocation.ts` and
  `cli-direct-worker.ts`.

## Deliverables

1. `subs/cli/`: `arguments.ts` accepting `check [--root] [--format json] [--batch]`,
   `watch [--root] [--format json]`, `daemon status|stop [--format json]`,
   `--help` and `--version`, else `invalid-invocation` exit 2;
   `check-command.ts` (connect `if-needed`, open with the thirteen
   capabilities, synchronized check with empty `expect`, one reopen on
   `expired-generation` or `unknown-context`, release, exit per report;
   `unresolved` and unpublished `reported` outcomes rendered from their
   reports as the engine-results table fixes; `stopping` rendered as
   `Error [stopped]: …` with exit 2); `watch-command.ts` (subscribe, print
   status, fetch each event's report with a `published` read naming its
   revision and print `revision` or `revision-evicted`, ping, one
   resubscription after `recover('automatic')` on `slow-consumer` or after a
   reopen, exit 130 on SIGINT after unsubscribing); `daemon-command.ts`
   (`start: 'never'`; `status` renders the connector's `connected`,
   `stopped` and `not-running` outcomes; `stop` names
   `connection.daemon.instance.instanceId` and waits up to 7 s, longer than
   `shutdownGraceMs`; the CLI never reads the record itself); `errors.ts` per the error table;
   `format.ts` adding the `Mode:`, `Watching` and `Revision` lines and the
   `ramify.watch/1` and `ramify.daemon-status/1` documents; `interfaces/cli.ts`
   extending `CliEnvironment` with the required `connect`. `check --format
   json` writes Plan 1's serialized report and nothing else, in every mode.
   No checking algorithm, no startup code.
2. Fallback policy: only a terminating `check` falls back, and only after
   exhausted automatic recovery (a failed coordinated start, or the reconnects
   and restart after an unexpected loss), printing `Mode: batch fallback
   (<reason>)` on stdout in human mode and on stderr in JSON mode; it
   dynamically imports `src/batch.js` and disposes. An explicit stop received
   mid-flight, `resource-unavailable`, `incompatible` and `rejected` never
   fall back. `watch`, `daemon status`, `daemon stop` and `--batch` never fall
   back and never both connect and load an engine. A normal resident or batch
   run writes nothing to stderr.
3. Root `src/client.ts` building the connector from `connectDaemon` with the
   endpoint directory, the resolved `dist/src/daemon-entry.js` path (replaced
   by `RAMIFY_DAEMON_ENTRY` when that variable is set: the harness's
   failed-start override, read here only), version and engine string; `src/cli-entry.ts` injecting `connect` beside `batch`,
   passing `control.signal` so SIGINT sends a `cancel` frame, waiting at most
   2 s, then exiting 130.
4. Plan 1 migration: `src/tests/fixture.ts`, the inline environment in
   `src/tests/batch-cli.test.ts`, the harness's `cli-cases.ts` and
   `cli-direct-worker.ts` and `subs/cli/src/tests/arguments.test.ts` supply
   a `connect` that fails the test if called; every `check` invocation in
   `src/tests/batch-cli.test.ts`, `src/tests/cli-process.test.ts`,
   `cli-cases.ts`, `self-cases.ts`, `gate-cases.ts`, `relocation.ts` and
   `cli-direct-worker.ts` adds `--batch`. Two expectations are revised to the
   tree this build has, as harness item 1 states: `self-cases.ts`'s
   `assertions.equal('exact nine implemented owners', …, owners)` becomes
   `'exact eleven implemented owners'` with `ramify/daemon` and
   `ramify/daemon/contexts` in its literal `owners` list, and
   `relocation.ts`'s literal `entryFunctions` map gains
   `'ramify.ts/client': 'connectDaemon'`, so that `'every reviewed portable
   Node and UI package entry remains declared'` holds and `'all seven actual
   package entry imports executed'` becomes `'all eight actual package entry
   imports executed'`. Every other Plan 1 record and expectation is
   byte-untouched. `npm run check:reference` and `npm run check:self` keep their
   text and therefore now run resident; every scripted run of either sets
   `RAMIFY_ENDPOINT_DIR` to a directory it owns and stops its daemon.
5. Harness: capability `cli`; process handlers for I2-20 to I2-23 with unique
   `RAMIFY_ENDPOINT_DIR`, the I2-23 fault fixtures setting `RAMIFY_DAEMON_ENTRY`
   to a script that exits at once and `stop-no-fallback` using the S1000 cold
   check; quick handlers for I2-24 over `createQuickEnvironment`
   and `runCli`, including the wrapped connector that holds a report fetch.
   Tests: the five CLI owner tests owners.md lists and root
   `cli-resident-process.test.ts`.

## Matrix rows executed here

- I2-20: `human` (Plan 1 lines plus `Mode: resident …synchronized`; exit 0);
  `json-bare-report` (one `ramify.analysis/1` document with no additional
  member, equal to the `--batch` document except `runId`; stderr empty);
  `exit-clean` (0); `exit-denied` (1 with the located denial); `exit-invalid`
  (1); `exit-unavailable` (2; `Mode: resident (daemon <pid>; no context)`
  then the batch diagnostic; JSON equals batch except `runId`);
  `synchronized-after-save` (edit reflected before the watcher fires;
  `freshness.verified`); `root-from-subdirectory` (same root, `found`);
  `interrupt` (130, cancel frame sent, no result claimed, daemon alive).
- I2-21: `stream-updates` (status, a revision with the denial, one without;
  each report fetched by its revision id); `bounded-burst` (bounded revision
  lines; the last equals a fresh check); `interrupt-release` (130;
  subscriptions zero within 1 s); `json-lines` (one `ramify.watch/1` object
  per line with embedded reports).
- I2-22: `status-none` (`running: false`, `record: null`, exit 0);
  `status-running` (instance, one context, budgets, counters); `stop-running`
  (exit 0; record `explicit`; process gone within the 5 s grace, observed by
  the 7 s wait); `stop-none` (exit 0, `no daemon running`);
  `stop-wrong-instance` (`wrong-instance`; daemon keeps running).
- I2-23: `check-fallback-visible` (`RAMIFY_DAEMON_ENTRY` names an entry that
  exits at once, so both coordinated starts fail; `Mode: batch
  fallback (…)` on stdout in human mode, on stderr in JSON mode; the bare
  batch document; report equals batch); `stop-no-fallback` (`ramify daemon
  stop` during a cold S1000 check: `Error [stopped]: …`, exit 2, no batch,
  analysis or compiler module loaded); `watch-no-fallback` (exit 2 `unavailable`; no
  batch, analysis or compiler module); `client-no-fallback` (`unavailable`;
  no engine loaded or spawned); `fallback-disposes` (zero helpers, handles,
  sessions; no listener).
- I2-24: `quick-check-flow` (each document equals the backend revision's
  report; the human `Mode:` line names the context and sequence; second run
  shows the denial); `quick-watch-flow` (two renderings fetched by revision
  id; released; 130); `quick-watch-evicted` (the held fetch renders
  `revision-evicted` for sequence 2 and the report for sequence 3; no
  mislabelled report); `quick-status-stop` (status document, stop
  acknowledgment, `onStop` `explicit`); `codec-in-direct-channel` (everything
  through `encodeMessage`/`decodeMessage`; no shared identity).

## Verification

```sh
npm run build && npm run type-check && npm test
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
(cd examples/collection-review && node ../../dist/src/cli-entry.js check)               # Mode: resident (daemon <pid>; …)
node dist/src/cli-entry.js check --root examples/collection-review --format json         # one bare ramify.analysis/1 document
node dist/src/cli-entry.js daemon status && node dist/src/cli-entry.js daemon stop
node dist/src/cli-entry.js check --root examples/collection-review --batch --format json  # byte-for-byte Plan 1
npm run reference:verify -- --plan 2 --iteration 9   # requires 2 to 9; 7 contributes none
npm run reference:verify -- --plan 1                 # the migrated Plan 1 gate passes on this build
npm run check:self && node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kind: `process` for I2-20 to I2-23 with the compiled entries;
`quick` for I2-24 only. Every command above that may start a daemon runs
under the exported `RAMIFY_ENDPOINT_DIR`, and the last `daemon stop` ends
it. The unfiltered `--plan 2` still fails on iterations 10 to 14.

## Exit criteria

- The six commands of the main plan's deliverable section work from the
  package directory with the documented output, exits and `Mode:` lines;
  every listed instance ran.
- `check --format json` is Plan 1's document in every mode; the Plan 1 gate
  passes on this build with the `--batch` and `connect` migration and the two
  revised tree-shape expectations applied and every other record untouched.
- Only a terminating `check` ever falls back, visibly, after exhausted
  recovery, and disposes; an explicit stop mid-flight is `stopped`, exit 2.

## Handoff

Iteration 10 completes the declarations and traces the entry boundaries over
these commands; iterations 11, 12 and 13 run over this installed CLI in
parallel with distinct endpoint directories; iteration 14 relocates and
self-checks the completed package.
