# Iteration 8: Daemon host, records, process entry and real IPC

**Plan:** [Plan 2: Keep verification current](../main-plan.md).
**Prerequisites:** iteration 7 (`connectDaemon`, the framed codec, records
and launcher) and, through it, iteration 5's quick environment. **Owners:**
`subs/daemon/` (N3 `startDaemon`; the host portion of N4; private
`host.ts`); root `src/daemon-entry.ts`; root `src/tests/daemon-process.test.ts`;
daemon `src/tests/{ipc,host}.test.ts`.

## Goal

Make the daemon a real detached process and verify the wire against it:
`host.ts` accepts connections over a `DaemonService` with per-connection
queues, coalescing and backpressure; `startDaemon` binds the discovered
socket, writes `starting`, `running` and `stopped` records atomically,
refuses to duplicate a live peer, exits idle when no lease exists, and stops
gracefully; the root entry assembles the resident service with real ports and
default budgets. Every `ipc` instance runs over real socket pairs against
`startDaemon` hosting the quick service, and the client's coordinated
startup, stale cleanup and lock handling are verified against the compiled
entry with eight simultaneous starts.

## Read first

- [contracts.md](../contracts.md): the `DaemonBudgets`, `EndpointSelection`,
  `DaemonRecord`, `StopDisposition`, `StartDaemonOptions`, `DaemonHost` and
  `StartDaemonOutcome` declarations; IPC framing, messages and notification
  rules (the connection limit, `maxRequestsInFlight`, coalescing position
  and slow-consumer rules); Client and transport lifecycle, including the
  per-platform paragraph and the spawn argv.
- [scope.md](../scope.md): Deployment arrangement; Endpoint discovery and
  grouping; Startup, retry and recovery limits; Idle exit, crash and explicit
  stop (the lease definition); Context and daemon budgets.
- [owners.md](../owners.md): Daemon, Root, Package entries and their runtime
  closures, the iteration 8 row of the Activation manifest.
- Main plan: Resolved decisions 1, 5 and 7; matrix rows I2-14 to I2-17;
  harness points 3 and 4.
- [Processes and clients](../../../architecture/processes-and-clients.md):
  Process topology; Launch, compatibility and shutdown.
- Iteration 7's `codec.ts`, `records.ts`, `launcher.ts` and
  `connection.ts`; `src/cli-entry.ts` for the entry conventions (shebang,
  exit handling).

## Deliverables

1. Socket listener core, private `src/host.ts`: connections on a given path
   over a `DaemonService`; handshake verified, `reject` with `incompatible`
   on mismatch and `reject` with `resource-unavailable` when
   `maxConnections` are open; per-connection request queue answering the
   request over `maxRequestsInFlight` with a `resource-unavailable` error;
   outbound queue with replaceable-event coalescing at the newest position,
   `context-evicted` and `goodbye` never dropped, and the slow-consumer
   disconnect; lease release when no `ping` arrives within `leaseMs`.
2. `src/start-daemon.ts` with `startDaemon`: bind the socket from
   `EndpointSelection`; write `starting`, then `running`; if a live peer
   already answers on the socket return `already-running` and write nothing;
   host connections through `host.ts`; idle-exit timer over `idleExitMs`,
   armed only while no lease exists, where a lease is an active subscription
   or an in-flight request, sending `goodbye` `idle-exit` to every open
   connection before exit; `stop('explicit', requestId)` giving in-flight
   requests `stopping`, sending `goodbye` `explicit-stop`, writing the
   `stopped` record before sockets close and forcing closure after
   `shutdownGraceMs`; the `stopped` promise; JSON-line log entries capped at
   8 MiB. N3 and the host portion of N4 activated.
3. Root `src/daemon-entry.ts`: argv `--endpoint-dir`, `--build-key`,
   `--version`, `--engine` and, for tests only, `--budgets <json>`;
   `assembleResidentService` with `createFilesystemWatcher`,
   `createSystemClock` and the default budgets; `startDaemon`; exit 0 after a
   recorded stop, 3 for a duplicate, nonzero for a start failure. It never
   loads the CLI, presentation, layout, React, d3, MCP or web modules; the
   TypeScript package appears only in the finite helpers.
4. Launcher completed: `connectDaemon` with `start: 'if-needed'` acquires the
   `O_EXCL` lock, spawns `dist/src/daemon-entry.js` detached with `stdio`
   ignore/log/log and `unref()`, waits up to `startupMs` polling the record
   and socket every 50 ms, retries once (`startAttempts` 2); waiters on a live
   lock poll the same way; a `running` record with a dead pid is cleaned up
   only under the lock; a lock with a dead pid or older than 30 s is removed.
5. Tests: daemon `ipc.test.ts` (real socket pairs in one process) and
   `host.test.ts` (real host over the quick service in one process); root
   `daemon-process.test.ts` spawning the compiled entry through the
   traced-process helper (start, record transitions, duplicate exit 3,
   explicit stop, idle exit with `idleExitMs: 2000` through `--budgets`, the
   entry's argv and exit codes). Harness: capabilities `ipc`, `client` and
   `daemon-process`; ipc handlers call `startDaemon` over the quick service
   on a socket in a temporary endpoint directory inside the test process;
   every process handler uses a unique `RAMIFY_ENDPOINT_DIR`, kills its daemon
   and removes the directory in `finally`, and fails if a daemon survives.

## Matrix rows executed here

- I2-14: `framing-roundtrip` (every message type decodes deep-equal;
  `ServiceResult` preserved); `malformed-frame` (`goodbye` `failure` where
  writable, then close; host up); `oversized-request` (violation and close;
  no partial dispatch); `oversized-response` (`resource-unavailable`;
  connection survives); `error-preservation` (denial, invalid description,
  an unpublished incomplete report, `unavailable` and `superseded` keep their
  discriminants and `published`); `token-preservation` (tokens and revision
  ids byte-equal to in-process values); `handshake-incompatible` (`reject`
  naming both versions; others still served); `cancel-frame` (`cancelled`
  under the same id).
- I2-15: `connect-validation` (the same `invalid-request` as the quick
  binding); `lease-release-on-close` (subscriptions zero before `close`
  resolves); `abrupt-host-loss` (a SIGKILLed child's lease released within
  `leaseMs`; others unaffected); `client-entry-lightweight` (no analysis,
  contexts, host, compiler, React or d3 module; RSS within budget).
- I2-16: `ordering-per-context` (per-context sequences and connection `seq`
  increase); `coalesce-replaceable` (one `revision-published` with
  `coalesced: 9` carrying the newest header; a read naming it returns its
  report); `non-replaceable-kept` (`context-evicted` delivered after the
  coalesced revision); `slow-consumer-disconnect` (`goodbye`
  `slow-consumer` attempted, socket destroyed, lease released, counter
  incremented); `reconnect-no-replay` (`replay: 'not-available'`; `current`
  is the newest revision; no old events).
- I2-17: `simultaneous-start` (eight `connectDaemon` calls, one process, one
  record, one `instanceId`); `stale-record` (dead pid and dangling socket
  cleaned under the lock, then a start); `stale-lock` (lock older than 30 s
  with a dead pid removed; startup proceeds); `already-running-exit` (second
  entry exits 3; record untouched); `directory-ownership` (mode `0755` gives
  `unavailable` naming the permission problem; nothing spawned).

## Verification

```sh
npm run build && npm run type-check && npm test
npm run reference:verify -- --plan 2 --iteration 8   # requires 2 to 5, 7 and 8
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
node dist/src/daemon-entry.js --endpoint-dir "$RAMIFY_ENDPOINT_DIR" --build-key smoke --version 0.0.0 --engine "ramify.ts@0.0.0+typescript@7.0.2" &
cat "$RAMIFY_ENDPOINT_DIR"/daemon-smoke.json          # state running; a second launch exits 3
node --input-type=module --import ./src/tests/process-probe.mjs -e "await import('./dist/subs/daemon/src/client-entry.js')"
npm run check:self                                   # N3 links; eleven owners
git diff --check
```

Evidence kind: `ipc` (real socket pairs in one process) for I2-14, I2-16 and
the first two I2-15 rows; `process` for `abrupt-host-loss`,
`client-entry-lightweight` and I2-17. A quick run never satisfies an `ipc`
or `process` row. The smoke run above is stopped by hand (`kill` and remove
the directory); no CLI command exists yet to stop it, so `ramify daemon stop`
evidence belongs to iteration 9.

## Exit criteria

- A detached daemon starts from the compiled entry, serves the iteration 7
  client, records every state atomically and exits on idle, duplicate and
  explicit stop with the recorded reasons; every listed instance ran with
  real sockets or real processes and asserted its own expectation.
- Errors, tokens and `published` cross the wire unchanged; the notification,
  connection-limit and slow-consumer rules hold under real backpressure.
- Eight simultaneous starts never produce two daemons or a stale socket; the
  entry's loaded modules match owners.md's daemon closure.

## Handoff

Iteration 9's CLI connects to and starts exactly this entry; iteration 12
drives its idle, crash and stop outcomes end to end; iteration 13 measures its
footprints; iteration 14 relocates it.
