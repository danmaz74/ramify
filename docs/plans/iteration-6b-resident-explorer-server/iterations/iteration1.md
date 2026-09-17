# Iteration 1: Project binding

**Plan:** [Plan 6B: Resident explorer server](../main-plan.md).
**Prerequisites:** completed Plans 6 and 6A.
**Owner:** `service-api [dispatch]`.

## Goal

Add `ProjectBinding`, the component that owns one project's daemon connection,
context and subscription and keeps them valid, without changing any HTTP or
browser behavior yet.

## Read first

- [Main plan](../main-plan.md), contract C2.
- [processes-and-clients.md](../../../architecture/processes-and-clients.md), "Launch, compatibility and shutdown".
- `src/interfaces/service.ts` (`RamifyService.openContext`, `subscribe`, `closeContext`).
- `subs/daemon/src/interfaces/daemon.ts` (`ConnectOptions.onState`, `ConnectionState`, `DisconnectReason`, `ConnectOutcome`).
- `subs/daemon/src/connect-daemon.ts`, only the connect and recovery paths.
- `src/explorer-entry.ts` and `subs/cli/src/explore-command.ts` for the current open sequence.
- `src/tests/quick-environment.ts` for the real in-process service harness.

## Deliverables

1. `subs/service-api/src/project-binding.ts` exporting `createProjectBinding`,
   `ProjectBinding` and `BindingState` as C2 specifies. Inputs: resolved root,
   context setup, a connector `(start: 'if-needed' | 'never') => Promise<ConnectOutcome>`,
   a `ClockPort` and an optional logger.
2. Every C2 transition, with the stated backoff and the 5 s / 30 s intervals
   driven by the injected clock.
3. Opening and subscribing are serialized: at most one open attempt in flight,
   and a superseded attempt closes whatever it acquired.
4. `service-api/module.ramify` exposes the three names to parent; root
   relays them to descendants beside the existing service-api relays.

## Matrix rows executed here

RS01–RS06.

## Verification

```sh
npm test -- subs/service-api/src/tests/project-binding.test.ts
npm run type-check
npm run check:self
```

Use the real service through the quick environment for RS01, RS02 and RS06.
Use a connector fake that returns scripted `ConnectOutcome` values and emits
`onState` transitions for RS03–RS05; the controlled clock advances the
backoff. Each test asserts the state sequence and the number of connect
attempts with each `start` value; RS04 asserts zero `if-needed` attempts while
stopped.

## Exit criteria

All six rows pass; nothing outside `service-api` and the root relay changes.

## Handoff

Iteration 2 receives `createProjectBinding`, its state type and the test
fakes' location for router tests.
