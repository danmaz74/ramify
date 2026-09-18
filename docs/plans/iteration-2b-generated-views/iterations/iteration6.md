# Iteration 6: Materialize the architect view

**Plan:** [Plan 2B: Generated architect view](../main-plan.md).
**Prerequisites:** iterations 4 and 5.
**Owners:** `daemon/contexts`, `daemon`, root `ramify` service vocabulary and
assembly, `cli`.

## Goal

Make `ramify materialize --view architect` synchronize one revision, project
the view, wait for the dependency facts of that revision, render and publish,
with every outcome mapped and the API view unchanged.

## Read first

- [Contracts C7](../contracts.md#c7-materialize) and
  [C8](../contracts.md#c8-failure-and-preservation), AV24–AV28, and the main
  plan's [lifecycle](../main-plan.md#lifecycle-and-consistency).
- `src/interfaces/service.ts`, `src/resident-assembly.ts` and `module.ramify`.
- `subs/daemon/subs/contexts/src/interfaces/contexts.ts`,
  `context-manager.ts` (`apiView`, `deliverApiView`, `dependencyDiagram`),
  `queue.ts` and `context.ts`.
- `subs/daemon/src/service.ts` (`materialize`, `runMaterialize`,
  `dependencyDiagram`), `validation.ts`, `codec.ts`, `host.ts`,
  `connection.ts`, `connect-daemon.ts` and `interfaces/daemon.ts`.
- `subs/cli/src/arguments.ts`, `materialize-command.ts` and `run-cli.ts`.
- `subs/daemon/subs/contexts/src/tests/api-view.test.ts`,
  `dependency-diagram.test.ts` and `scripted-driver.ts`;
  `subs/daemon/src/tests/service.test.ts` and `validation.test.ts`;
  `subs/cli/src/tests/materialize-command.test.ts`;
  `src/tests/quick-environment.ts` and `resident-cli.test.ts`.

## Deliverables

1. Add `MaterializeViewId`, `views` and the `architect` outcome summary to
   the root service vocabulary, and `materialize-views` to its capabilities.
2. Contexts: carry `views`, call the session only for requested views at the
   pinned sequence, return both projections, and map supersession.
3. Daemon: validate `views`; advertise the capability; wait for dependency
   facts with a clock the tests control; render; publish through
   `PublishInput`; map every outcome.
4. Client: send `views` unchanged; CLI: parse `--view`, check the capability,
   print the architect line.
5. Update the scripted driver and the quick environment to serve
   `architectView`.
6. Tests for AV24–AV28, including a controllable dependency runner for each
   wait outcome.

## Matrix rows executed here

AV24–AV28.

## Verification

```sh
npx vitest run subs/cli/src/tests/materialize-command.test.ts
npx vitest run subs/daemon/subs/contexts/src/tests/api-view.test.ts subs/daemon/subs/contexts/src/tests/dependency-diagram.test.ts
npx vitest run subs/daemon/src/tests/service.test.ts subs/daemon/src/tests/validation.test.ts subs/daemon/src/tests/codec.test.ts
npx vitest run subs/daemon/src/tests/session-counters.test.ts src/tests/resident-assembly.test.ts src/tests/resident-cli.test.ts
npm run type-check
npm run build
npm run check:self
npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan2a.test.ts
```

## Exit criteria

AV24–AV28 pass; `ramify materialize` without `--view` behaves exactly as
before; the Plan 2A harness passes.

## Handoff

A working `ramify materialize --view architect` in the built CLI, and the
list of every changed wire type.
