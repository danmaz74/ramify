# Iteration 1: Time the promotion and the sweep

**Plan:** [Plan 5 structural edit latency](../main-plan.md).
**Prerequisites:** none; starts from `9435952` or later.
**Owners:** `analysis`, `daemon/contexts`.

## Goal

The work a revision performs after its computation, and the work a sweep
performs, are reported by timing fields; the reference broad revision's
unattributed time is explained.

## Read first

- Main plan: [hypothesis 4](../main-plan.md#hypothesis-4-unattributed-reference-time-located-not-measured),
  resolved decisions 1 and 8, rows SE-1 and SE-2, the contracts table.
- [Hook optimization iteration 1 results](../../iteration-5-hook-optimization/iterations/iteration1-results.md):
  how `OperationTimings`, `CaptureWork` and `ReplyTimings` were added and
  carried through the codec.
- `subs/analysis/src/interfaces/session.ts`: `OperationTimings` at 55-64,
  `SessionUpdate` at 65-68.
- `subs/analysis/src/session-engine.ts`: `#complete` at 268, `#promote` at
  296, `sweep()` at 161, `#publish` around 414-443.
- `subs/analysis/src/session-host.ts`: the round trip attached at 105 only for
  revised and reported results.
- `subs/daemon/subs/contexts/src/interfaces/contexts.ts`: `CaptureWork` at
  38-45; `context-manager.ts`: accumulation around 237-241 and the sweep leg
  at 369-375.
- `subs/analysis/src/tests/session-revision.test.ts` case `timing-fields` at
  587 and `session-worker.test.ts` at 397, as the pattern to extend.

## Deliverables

1. **Promotion timing.** `OperationTimings.promotion`: the duration of
   `#promote` inside `#complete`, zero when it did not run. Carried by the
   worker reply and into `CaptureWork` as the other fields are.
2. **Sweep timing.** A sweep's `unchanged` result may carry `timings`, so the
   host attaches `workerRoundTrip` to it and contexts add it to a new
   `CaptureWork.sweep`. `ReplyTimings` inherits it. The codec accepts the new
   fields and still rejects malformed capture timings.
3. **Attribution.** Under resolved decision 8, run a bounded in-process loop
   over the session engine on the reference example: about ten created-file
   cycles, recording `revision.timings`, the new `promotion` field and the
   remainder. Also time, with temporary instrumentation, the fact assembly and
   `deepFreeze` after `decide`, `findingDelta` and `factBytes` inside
   `publish`. Do not commit the instrumentation.
4. **Results** in `iteration1-results.md`: the field shapes, the codec
   change, and a table attributing the reference broad revision's time outside
   the eight stages, naming what remains unattributed.

## Matrix rows executed here

SE-1 `promotion-timed`, SE-2 `unattributed-located`.

## Verification

```sh
npx vitest run subs/analysis/src/tests
npx vitest run subs/daemon/subs/contexts/src/tests
npx vitest run subs/daemon/src/tests/codec.test.ts subs/daemon/src/tests/ipc.test.ts
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the worktree.

## Exit criteria

- SE-1 passes; every existing timing-field case still passes with the added
  fields.
- SE-2: at least four fifths of the unattributed time is named, with figures,
  or the results say what could not be attributed and why.

## Handoff

The `promotion` and `sweep` fields, which iterations 4 and 5 use to show
their savings, and the attribution table for iteration 7's closure.
