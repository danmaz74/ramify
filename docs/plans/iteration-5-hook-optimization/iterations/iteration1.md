# Iteration 1: Timing fields and watcher timestamps

**Plan:** [Plan 5 hook optimization](../main-plan.md).
**Prerequisites:** none; starts from `8236a00` or later.
**Owners:** `analysis`, `daemon/contexts`, `daemon`.

## Goal

Every duration a hook pays outside `revision.timings.total` is recorded
directly, so later targets are verified by field rather than by subtraction.

## Read first

- Main plan: resolved decisions 1, 2 and 7; rows HO-1 and HO-2.
- Analysis: [Where session work goes](../../../analysis/fast-incremental-checks-optimization.md#where-session-work-goes),
  [Project-root resolution](../../../analysis/fast-incremental-checks-optimization.md#project-root-resolution)
  and [target 0](../../../analysis/fast-incremental-checks-optimization.md#0-timing-fields).
- `subs/analysis/src/session-revision.ts`: `PhaseTimings` at 39 and
  `zeroTimings` at 60; find `RevisionTimings` where it is declared.
- `subs/analysis/src/session-engine.ts`: `update()` from 120, the invocation
  check at 127-131, `status()` at 221 and `#publish` at 383-422.
- The worker transport: `session-worker*.ts`, `session-supervisor.ts` and the
  daemon's session driver in `subs/daemon/subs/contexts/src/`.
- `subs/daemon/subs/contexts/src/context-manager.ts`: update at 354 and
  publication after a revision.
- `subs/daemon/src/filesystem-watcher.ts` and how its batches reach the
  context manager.
- Existing timing tests: `grep -rn "timings" subs/*/src/tests subs/*/subs/*/src/tests`.

## Deliverables

1. **Fields.** Durations for the worker's invocation check, worker `status`,
   worker round trip (request sent to reply received, measured on the daemon
   side), client transport (visible to the client in the reply) and daemon
   publication, carried beside the existing stage timings in revision and
   reply timings. Additive: no existing field changes meaning or value. If a
   wire schema or validator lists timing fields, extend it and its tests.
2. **Watcher timestamps.** Event receipt and batch flush times for each
   watcher batch, available on the update that batch triggers, using the
   injected clock where one exists so tests stay deterministic.
3. **Tests** for HO-1 and HO-2 in the owners' existing test files.
4. **Results** in `iteration1-results.md`: field names and where each is
   measured, the tests, and any schema change.

## Matrix rows executed here

HO-1 `timing-fields`, HO-2 `watcher-timestamps`.

## Verification

```sh
npx vitest run subs/analysis/src/tests
npx vitest run subs/daemon/subs/contexts/src/tests
npx vitest run subs/daemon/src/tests
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the worktree.

## Exit criteria

- HO-1 and HO-2 pass; every other test in the touched owners passes.
- No existing timing value or reply field changes.

## Handoff

Field names and their locations, for iterations 2 to 5 and the measurement
successor.
