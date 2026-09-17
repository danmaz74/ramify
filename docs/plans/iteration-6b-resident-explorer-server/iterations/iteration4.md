# Iteration 4: CLI, PM2 and gate

**Plan:** [Plan 6B: Resident explorer server](../main-plan.md).
**Prerequisites:** iterations 1–3.
**Owners:** `cli [dispatch]`, `integration-tests [testing, ui, dispatch]`,
root configuration and documentation.

## Goal

Connect `ramify explore` to the per-project server, add the PM2 entry, update
the architecture and prove the whole workflow with real processes and a real
browser.

## Read first

- [Main plan](../main-plan.md), contracts C5 and C6, and the acceptance table.
- `subs/cli/src/explore-command.ts`, `subs/cli/src/arguments.ts`, `subs/cli/src/interfaces/cli.ts`.
- `src/cli-process.ts`, `src/explore-launcher.ts`.
- `subs/integration-tests/src/browser-acceptance.ts`.
- `ecosystem.config.cjs`.
- [processes-and-clients.md](../../../architecture/processes-and-clients.md), "Web server and tRPC", "Launch, compatibility and shutdown" and PC05.

## Deliverables

1. `explore` passes root and project key to the launcher, opens
   `/analysis/latest`, prints the URL, and on opener failure prints it and
   exits 0 without stopping the server. Help text updated.
2. `ecosystem.config.cjs` `explorer` app per C6.
3. Browser acceptance adapted to `/analysis/latest` and extended with
   RS13–RS16, using an isolated endpoint directory and the `mutation` fixture.
4. Architecture: the web process is resident per project, owns one
   subscription, has no idle exit and respects explicit stops. PC05 restated.
5. Roadmap: Plan 6B row and brief status updated to match the result.
6. Completion report `iteration4-results.md` with evidence per RS row,
   RSS figures and remaining gaps.

## Matrix rows executed here

RS13–RS17.

## Verification

```sh
npm run build
npm test -- src/tests/cli-process.test.ts
npm run measure:project-explorer
npm run type-check
npm run check:self
```

Full-suite verification goes through the Studio audit, not a manual full run.
RS15 checks the daemon record's `stopped.reason` and that the server PID did
not start a daemon. RS16 compares server PIDs before and after `ramify explore`.
Manually confirm once with PM2 in the devcontainer and record the output.

## Exit criteria

Every RS row has current evidence, the type check and self-check pass, and the
architecture describes the resident server.

## Handoff

Completion report with the deferrals from the main plan and the measured server
and daemon memory, for any later multi-project or push-event plan.
