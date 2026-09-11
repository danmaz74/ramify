# Iteration 5: Shared service, root interface and quick environment

**Plan:** [Plan 2: Keep verification current](../main-plan.md).
**Prerequisites:** iteration 4 (`contexts`) and, through it, iteration 3
(`increment`). **Owners:** `subs/daemon/` (N1; N2's codec line; the service,
instance, budget, log, record, handshake, wire and connect portion of N4;
private validation); root `src/interfaces/service.ts` (R6),
`src/resident-assembly.ts` and `src/tests/quick-environment.ts` (R8).

## Goal

Implement the one validated service that the IPC host and quick tests share:
structural validation, dispatch to a context manager it creates, leases and
stop notification. Root supplies the analysis-backed driver and the assembly,
and exposes a testing-only quick environment in which the real engine and
contexts run under controlled watcher and clock. The resident rules that need
the real engine but no edit sequence are verified here through the direct
channel; iteration 6 runs the edit scenarios over the same environment.

## Read first

- [contracts.md](../contracts.md): Root: the dispatch-facing service
  interface, including the value-or-error table; Daemon: service binding,
  client, host and records (the `createDaemonService` paragraph and the
  quick environment with its codec and connect-vocabulary note).
- [scope.md](../scope.md): Context selection and compatibility; Freshness and
  supersession guarantees; Batch and incremental comparison.
- [owners.md](../owners.md): Root, Daemon, Foreign signature types, the
  iteration 5 row of the Activation manifest.
- Main plan: Exposure rules for the resident owners; Required data flow;
  Engine results and their delivery; matrix rows I2-01, I2-03, I2-04 and
  I2-13.
- [Quick testing](../../../architecture/quick-testing.spec.md) in full.
  [Processes and clients](../../../architecture/processes-and-clients.md):
  Shared service boundary.
- Source: `src/batch.ts` (the limits and registry the driver reuses),
  `subs/analysis/src/increment.ts`, the contexts interface.

## Deliverables

1. Root `src/interfaces/service.ts`, type-only, exactly as contracts.md; R6
   activated. Root receives contexts vocabulary through daemon's N5 relay and
   names it there; contexts never imports this file.
2. Daemon `src/service.ts` with `createDaemonService`: structural validation
   in private `src/validation.ts` exactly as contracts.md lists it
   (`invalid-request` for shape, literal, `requestId`, `expect` size and
   `revision` format failures; `unsupported-setup` for a registry other than
   `default` or a capability outside the thirteen); dispatch to the manager;
   `lease(client)` whose release drops its subscriptions and requests;
   `onStop`; `dispose`; the `cancelledAnalyses` counter. Domain outcomes,
   including `unresolved` opens and unpublished `reported` results, stay
   values inside `ServiceResult`; only transport and validation failures are
   errors, as the contracts table fixes per code.
3. Real ports `src/filesystem-watcher.ts` (recursive `fs.watch` excluding
   `node_modules`, `.git`, `dist` and `.reference-work`; batching;
   `overflow` and `error` mapping) and `src/system-clock.ts`; N1 and the
   named portion of N4 activated: `DaemonInstance`, `LogEntry`,
   `DaemonServiceOptions`, `ServiceLease`, `DaemonService`, `DaemonBudgets`,
   `DaemonRecord`, `StopDisposition`, `Handshake`, `Welcome`, `WireMessage`,
   `ConnectionState`, `DisconnectReason`, `RecoveryOutcome`,
   `ServiceConnection`, `ConnectOutcome` and `ServiceConnector` in
   `interfaces/daemon.ts`, so that the quick environment's `connect` has its
   reviewed type and `npm run check:self` accepts root's import of it.
4. The message codec `src/codec.ts` (`encodeMessage`, `decodeMessage` over
   one `WireMessage` as validated UTF-8 JSON), exposed through N2's codec
   line now, because root's quick connector imports it to pass every request
   and event through it; iteration 7 adds the length-prefixed framing under
   the same two names. contracts.md and owners.md record this split.
5. Root `src/resident-assembly.ts`: `createAnalysisDriverFromSessions`
   (`check` builds `IncrementInputs` from the port's `project`, `setup`,
   `previous` and `changes` with the reviewed limits and default registry,
   then calls `analyzeIncrement`; `resolve` calls `resolveProject`) and `assembleResidentService`
   over `createDaemonService`. Root imports daemon values only through N1 and
   N4 and no contexts file directly.
6. Root `src/tests/quick-environment.ts` exposing `createQuickEnvironment`
   and `QuickEnvironment` to descendants (R8): real engine and contexts under
   the controlled ports, a `connect` yielding an in-process
   `ServiceConnection` with no shared object identity, `batch` bound to
   `runBatch`, and `dispose` asserting zero listeners, timers, watchers,
   helpers and sessions. Tests: root `resident-assembly.test.ts`, daemon
   `service.test.ts` and `watcher.test.ts`.
7. Harness: capability `daemon-service`; quick handlers for the 15 instances
   of I2-01, I2-03, I2-04 and I2-13 over `R` and `F` copies, importing the
   quick environment by path from the harness's independent scope.

## Matrix rows executed here

- I2-01: `cold-context` (revision 1, `cause: 'open'`, report equals batch
  except `runId`; 15 owners, two warnings); `unavailable-capability`
  (`unsupported-setup`; no context); `unsupported-setup` (`invalid-request`
  for the scope, `unsupported-setup` for the registry; no substitution).
- I2-03: `two-worktrees` (different ids; one denial; fingerprints differ in
  `declarations` only); `unknown-context` (`unknown-context`,
  `expired-generation`; no foreign report); `same-root-reuse` (`created:
  false`, same token; one release leaves it warm).
- I2-04: `concurrent-readers` (every read complete; `inputId` matches its
  report); `stale-publish-blocked` (first candidate publishes nothing;
  `counters.cancelledAnalyses` is 1); `own-request-label` (each outcome under
  its own `requestId`; one `superseded`, one `reported`).
- I2-13: `invalid-context-request` and `invalid-scope-request`
  (`invalid-request` before any context work); `sync-throw` and
  `async-failure` (`unavailable` `analysis-failed`; service and context
  usable); `dispose-cancels` (`unavailable` `disposed`; zero handles after);
  `unknown-operation` (`unsupported-operation`).

## Verification

```sh
npm run build && npm run type-check && npm test
npm run reference:verify -- --plan 2 --iteration 5   # requires 2, 3, 4 and 5
npm run check:self                                   # R6, R8, N1 and N2's codec line link to real exports
git diff --check
```

Evidence kind: `quick` over `Q/R` and `Q/F` only. The real-watcher owner test
is owner evidence, not matrix evidence; no ipc or process instance can run
before iteration 8. The unfiltered `--plan 2` still fails.

## Exit criteria

- `createQuickEnvironment` runs the real engine under controlled ports and
  every listed instance ran through it and asserted its own expectation.
- The in-process binding returns the same `ServiceResult` shapes the wire will
  carry; no domain outcome is folded into an error.
- Every quick instance leaves zero listeners, timers, watchers, helpers and
  sessions after disposal.

## Handoff

Iteration 6 runs the edit scenarios over this environment; iteration 7 adds
framing to the codec and builds the client; iteration 8's `startDaemon`
hosts exactly this implementation; iteration 9's CLI tests and I2-24 run over
`createQuickEnvironment`.
