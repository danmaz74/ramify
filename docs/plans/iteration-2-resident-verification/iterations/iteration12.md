# Iteration 12: Real process lifecycle and recovery suite

**Plan:** [Plan 2: Keep verification current](../main-plan.md).
**Prerequisites:** iteration 10 (the completed package; `cli`,
`daemon-process`, `client`). May run in parallel with iterations 11 and 13
using its own endpoint directories. **Owners:** integration in
`scripts/reference-harness/`; root `src/tests/` process helpers where a
signal or suspension primitive is missing; an owner is touched only to fix a
defect this suite finds.

## Goal

Establish with the compiled daemon entry and the installed executable that
idle exit with its lease rule, crash, explicit stop with a missed
notification, restart after idle, watch leases, incompatible clients, lease
release on command and watch exit, idle disposal, eviction under many
contexts and direct-client recovery behave exactly as the lifecycle tables
state, with timings inside the fixed limits.

## Read first

- [scope.md](../scope.md): Idle exit, crash and explicit stop (the lease
  definition); Startup, retry and recovery limits; Context and daemon
  budgets; the idle-disposal row of Latency and memory targets.
- [contracts.md](../contracts.md): Client and transport lifecycle;
  `DisconnectReason`, `RecoveryOutcome`, `StopDisposition`.
- Main plan: Resolved decision 7; the error table; matrix rows I2-18 and
  I2-27; the risk row on missed stop notifications.
- [Processes and clients](../../../architecture/processes-and-clients.md):
  Launch, compatibility and shutdown, PC06. [Memory lifecycle](../../../architecture/memory-lifecycle.md):
  Pressure, eviction and recovery, ML03, ML07. [Quick testing](../../../architecture/quick-testing.spec.md):
  Complementary verification, QT05.
- Iteration 8's `daemon-process.test.ts` and the traced-process helper;
  iteration 9's `watch-command.ts` and `errors.ts`.

## Deliverables

1. Lifecycle handlers that start a daemon with test budgets through
   `--budgets <json>` (`idleExitMs: 2000` or `3000`, `warmIdleMs: 1000`,
   `coldRetainMs: 1000`, `maxContexts: 8`), drive it with the installed
   executable and `connectDaemon` from a traced child, and observe the record,
   the socket, `daemonStatus` counters and process liveness from outside.
2. Signal fixtures: SIGKILL of the daemon during a watch and during a check;
   SIGSTOP of the watch client across a `ramify daemon stop`, then SIGCONT;
   a client presenting `ramify.ipc/0`; a watch held open beyond `idleExitMs`;
   a direct client holding an idle connection without a lease across the
   idle exit. Every fixture works on Linux and macOS without `/proc` or
   GNU-only flags.
3. Timing assertions: recovery within 20 s with three reconnects and one
   restart; stop within the 5 s grace observed by the client's 7 s wait; idle
   exit within `idleExitMs` plus 5 s; disposal within `warmIdleMs` plus 5 s;
   a single rejection for the incompatible client with no retry storm and no
   start.
4. Nine-fixture eviction run: nine `F` copies opened through nine leases
   released in order, with `maxContexts: 8`, observed through `daemonStatus`.
5. Harness: capability `lifecycle`; every handler kills its daemon and
   removes its endpoint directory in `finally`; a surviving daemon or a
   leaked child fails the instance.

## Matrix rows executed here

- I2-18: `idle-exit` (process exits with no lease although a direct client's
  idle connection stays open; that client receives `goodbye` `idle-exit`;
  record `stopped` `idle`); `restart-after-idle` (new daemon; new
  generation; result equals the previous); `crash-recovery` (watch
  reconnects or restarts within 20 s with a reconnect notice; check
  completes; new generations); `explicit-stop` (watch prints `stopped:
  explicit`, exits 2 without restarting; record carries the stop's
  `requestId`); `missed-stop-notification` (the resumed client reads the
  record and reports `stopped: explicit`; no restart);
  `new-command-after-stop` (a new `check` starts a daemon; the old watch
  stays stopped); `watch-lease-prevents-idle` (no exit while the watch runs;
  exit two seconds after); `incompatible-bounded` (one rejection, no retry
  storm, no start).
- I2-27: `watch-exit-releases` (subscriptions zero; context warm until
  `warmIdleMs`); `command-exit-releases` (request leases zero; no compiler
  process alive); `idle-disposal-releases` (`idleExitMs: 3000`; watcher
  handles, retained bytes and history reach zero, then eviction, then idle
  exit within `idleExitMs` plus 5 s); `eviction-under-many-contexts` (the
  first context evicted; its reopen has a new generation; the others
  remain); `reconnect-after-crash-live` (`recovered` with `restarted: true`;
  the client reopens and checks).

## Verification

```sh
npm run build && npm run type-check
npm run reference:verify -- --plan 2 --iteration 12  # requires 2 to 10 and 12; every handler owns its RAMIFY_ENDPOINT_DIR
npm run reference:report
git diff --check
```

Evidence kind: `process` only; nothing here is satisfied by the quick
environment or by iteration 4's controlled clock. Expected intermediate
failures name a timing bound; a bound is revised only by a package revision,
never by widening the assertion in the handler. Record a macOS run of this
suite before acceptance.

## Exit criteria

- Every listed instance ran against a real daemon and asserted its own
  expectation within the fixed limits, on Linux now and on macOS before the
  plan's acceptance.
- No instance leaves a daemon, helper, child or endpoint directory behind.
- The record, not socket closure, is the source of every stop reason the
  clients report; an idle connection neither prevents idle exit nor triggers
  a restart.

## Handoff

Iteration 14 cites this suite as the lifecycle evidence and records the
lifecycle and error tables for Plans 3 to 6; the signal fixtures are the
runnable concurrency and recovery fixtures the roadmap's handoff row names.
