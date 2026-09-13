# Iteration 5: Skip the sweep after reacquisition

**Plan:** [Plan 5 structural edit latency](../main-plan.md).
**Prerequisites:** iteration 1.
**Owners:** `analysis`, `daemon/contexts`.

## Goal

An update that reacquired the project from a fresh capture satisfies the
required sweep of the same capture; every other required sweep still runs.

## Read first

- Main plan: [hypothesis 5](../main-plan.md#hypothesis-5-configuration-edits-confirmed-and-mostly-avoidable),
  resolved decision 6, rows SE-13 and SE-14.
- [Daemon and analysis](../../../architecture/daemon.md#fast-incremental-checks):
  the covering rule and sweep scheduling text this iteration extends.
- `subs/daemon/subs/contexts/src/context-manager.ts`: `sweepRequired` at 99,
  131, 162, 178-183, 188, 192, 322; `sweepKind` at 339-347; the update and
  sweep legs at 366-376; the cancellation and failure paths at 378-395.
- `subs/analysis/src/interfaces/session.ts`: `SessionUpdate` at 65-68.
- `subs/analysis/src/session-engine.ts`: `update()` from 120, `sweep()` at
  161, and where a structural observer update is known.
- `subs/analysis/subs/project/src/read-project.ts`: `capture.validate()` at
  73, the validation a rebuild already performs.
- `subs/daemon/src/service.ts`: the `sweeps` counter at 48;
  `subs/daemon/src/tests/session-counters.test.ts`;
  `subs/daemon/subs/contexts/src/tests/covering.test.ts` and
  `context-manager.test.ts` for the scripted driver pattern.

## Deliverables

1. **Reacquisition report, `analysis`.** A revised `SessionUpdate` carries
   `reacquired: true` when its observer update was structural, that is, the
   project was acquired again on a fresh capture and validated.
2. **Sweep rule, `daemon/contexts`.** In the run at 366-376, when the update
   reported reacquisition, the sweep leg is skipped and the capture is treated
   as swept: `synchronization` and `lastSweepAt` follow as if a sweep had
   returned unchanged. A cancelled or failed update keeps `sweepRequired` as
   today.
3. **Architecture text.** One sentence in the daemon document's sweep
   scheduling: a required sweep is satisfied by an update that reacquired the
   project in the same capture.
4. **Tests** for SE-13 and SE-14 with the scripted driver, and the counters
   test showing one analysis and no sweep for a configuration edit.
5. **Results** in `iteration5-results.md`: the field, the rule as landed, and
   the sweep round trip on the reference fixture from iteration 1's field
   before and after.

## Matrix rows executed here

SE-13 `sweep-skipped-after-reacquire`, SE-14 `sweep-kept`.

## Verification

```sh
npx vitest run subs/analysis/src/tests
npx vitest run subs/daemon/subs/contexts/src/tests
npx vitest run subs/daemon/src/tests/session-counters.test.ts subs/daemon/src/tests/codec.test.ts
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the worktree.

## Exit criteria

- SE-13 and SE-14 pass; HO-13 to HO-15 still pass.
- No test shows a capture published as synchronized after a skipped sweep
  whose update did not reacquire.

## Handoff

The `reacquired` field. Iteration 6's options-only configuration update is not
a reacquisition, so its capture still sweeps unless iteration 6 shows that
its whole compiler invalidation reports every read; iteration 6 decides.
