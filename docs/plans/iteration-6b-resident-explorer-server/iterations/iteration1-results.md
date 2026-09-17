# Iteration 1 results: Project binding

**Date:** 2026-09-17. **Mode:** direct work on `docs/roadmap-fast-incremental-checks`, uncommitted.

## Built

- `subs/service-api/src/project-binding.ts`: `createProjectBinding`, `ProjectBinding` and
  `BindingState` as contract C2 describes. It also exports, without exposing,
  `ProjectBindingOptions`, `ProjectBindingConnector`, `ProjectBindingLogEntry` and the
  interval constants `bindingBackoffMs`, `stoppedPollMs` and `projectRetryMs`.
- Every C2 transition. Timers use only the injected `ClockPort`. Attempts run
  one at a time: a newer trigger supersedes the running attempt, which closes
  the connection, context or subscription it acquired before the next attempt starts.
- `subs/service-api/module.ramify` exposes the three names to its parent. The root
  `module.ramify` relays them to descendants beside the other service-api relays (P8).
- `subs/service-api/README.md` now says that the owner opens one project context
  through the binding.
- `subs/service-api/src/tests/project-binding-fakes.ts`: a scripted connector and connection.
- `subs/service-api/src/tests/project-binding.test.ts`: RS01–RS06, plus two tests
  for serialization and superseded attempts.

## Evidence

| Row | Test | Harness |
| --- | --- | --- |
| RS01 | start opens and subscribes; the token matches `daemonStatus`; one subscription lease; one `if-needed` connect | real quick environment |
| RS02 | real idle eviction after the test releases the subscription hold; the eviction event is delivered to the binding; reopens with the same context ID, a new generation and one subscription lease; log sequence `ready, context-evicted, ready` | real quick environment |
| RS03 | failure → `retrying`, delays 1, 2, 5, 10, 30, 30 s (`nextAttemptAt`); 6 `never` and 7 `if-needed` attempts before recovery; after a later drop, backoff restarts at 1 s; idle exit is treated as a failure | scripted connector, controlled clock |
| RS04 | `explicit-stop` → `daemon-stopped`; `never` polls every 5 s; the `if-needed` count stays 1 (the initial start) throughout; reconnects when the daemon runs again; an ambiguous failure plus a `stopped/explicit` record also leads to `daemon-stopped` | scripted connector, controlled clock |
| RS05 | `unresolved` → `project-unavailable` with the first issue message; no reopen at 29 999 ms; `unavailable` at 30 s; `ready` at 60 s; one connection, one `if-needed` attempt | scripted connection opens |
| RS06 | `close()` twice: 0 daemon subscriptions, 0 connections, connection closed once, `service()` null | real quick environment |

Commands and outcomes:

```text
npm test -- subs/service-api/src/tests/project-binding.test.ts   -> 1 file, 8 passed (8); run 4 times, all passed
npm run type-check                                                 -> exit 0
npm run check:self                                                 -> passed; 15 owners, 342 files, 0 errors, 0 warnings, 0 limits
dist/src/ramify check --root . --batch                             -> same counts, passed
```

## Decisions and deviations

1. **Connector shape.** The brief gives `(start) => Promise<ConnectOutcome>`, but the
   binding must also receive `onState`, which `connectDaemon` takes as a connect option.
   The connector is therefore `({ start, onState }) => Promise<ConnectOutcome>`.
   Production calls `connectDaemon({ ...fixed, start, onState })`. The quick
   environment's `connect({ start })` can be passed directly, but its
   connections do not emit `onState`.
2. **Retries check for an explicit stop first.** An `if-needed` connect starts a
   stopped daemon, and only `start: 'never'` returns a stopped record. Each
   `retrying` attempt therefore connects with `never` first. A `stopped/explicit`
   record leads to `daemon-stopped`; a connection is used as it is. Otherwise
   the attempt connects with `if-needed`. The initial Start connects with
   `if-needed` directly, as C2 states. With a connection failure, each retry
   therefore records one `never` and one `if-needed` attempt.
3. **Polling while stopped.** Only `connected` leaves `daemon-stopped`. A
   `stopped` record with a non-explicit reason means that a later lifecycle
   ended without an explicit stop, so the binding moves to `retrying`.
   `not-running` and `unavailable` keep `daemon-stopped`.
4. **Reopen state.** While a reopen after eviction is running, the state is
   `connecting` and `service()` is null.
5. **Project retries.** A retry after `project-unavailable` reuses the live
   connection. If the connection is lost, the loss is handled as a failure or a stop.
6. **Closed state.** After `close()`, `state()` returns
   `{ kind: 'project-unavailable', message: 'Project binding closed' }`. The
   binding never reports `ready` with a released token. If a connector call is
   in flight, `close()` waits for it to return.
7. **RS02 eviction.** With a real analysis driver, the context manager does not
   evict a context held by a subscription. The only held eviction is a demotion
   past its deadline, which needs a scripted driver. The test releases the
   subscription through the underlying connection. It advances the quick clock
   until the real manager evicts the context on idle, then delivers the
   `context-evicted` event to the binding's listener. The reopen, the new
   generation and the subscription run against the real service.
8. **Idle exit.** `idle-exit` and the other non-explicit losses produce
   `retrying`, as C2 specifies.

## Handoff for iteration 2

- Import from `subs/service-api/src/project-binding.ts`:
  - Exposed through the root relay: `createProjectBinding`, `ProjectBinding` and `BindingState`.
  - Exported but not exposed; add an exposure if the entry needs them by name:
    `ProjectBindingOptions` and `ProjectBindingConnector`.
- Factory input: `{ root: string (resolved, absolute); setup: ContextSetup; connect: ({ start, onState }) => Promise<ConnectOutcome>; clock: ClockPort; log?: (entry: { level: 'info' | 'warn'; event: string; message: string }) => void }`.
  - The project request is `{ cwd: root, root, scope: 'whole-project', configuration: 'discover' }`.
  - The CLI capability list lives in `subs/cli/src/command-support.ts` (`capabilities`). The tests copy it.
- The binding starts connecting as soon as it is created. The router should read
  `binding.state()` and `binding.service()` for each request.
- Test fakes: `subs/service-api/src/tests/project-binding-fakes.ts` exports:
  - `createFakeConnector(daemon)`, whose `daemon` condition is mutable and whose
    `calls` and `count(start)` record connect attempts.
  - `FakeConnection`, with `scriptOpen`, `emit`, `drop`, `subscriptions` and `contexts`.
  - `unresolvedOpen(message)`.

  Their tokens are fake (`ctx/1:fake`). The fakes are not exposed. Router tests
  in `service-api/src/tests` can import them directly. Tests in
  `integration-tests` need an `expose-test` plus a root relay.
