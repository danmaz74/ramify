# Iteration 1: Periodic sweeps as maintenance

**Plan:** [Plan 5 contract remediation](../main-plan.md).
**Prerequisites:** none; starts from the merged Plan 5 contexts owner.
**Owners:** `daemon/contexts`.

## Goal

Make a covered hook answer from the published revision whenever only routine
maintenance is running or due, and make periodic sweeps keep their interval.

## Read first

- Main plan: [Violation 1](../main-plan.md#violation-1-the-covering-rule-leaks),
  resolved decisions 1 and 2, RD-1, rows RC-1 to RC-4.
- Plan 5 scope: [Live updates and the covering rule](../../iteration-5-fast-incremental-checks/scope.md#live-updates-and-the-covering-rule)
  and [The sweep](../../iteration-5-fast-incremental-checks/scope.md#the-sweep).
- `subs/daemon/subs/contexts/src/context-manager.ts`: `sweepLater` (142-152),
  `touch` (153-160), watcher delivery (170-186), the run loop around 330-360,
  and `check` (440-480).
- `src/tests/covering.test.ts`, `src/tests/context-manager.test.ts`,
  `src/tests/controlled-ports.ts` and `src/tests/scripted-driver.ts`.

## Deliverables

1. **Sweep kind.** Record whether the pending or running sweep is `required`
   or `periodic`. The timer and the elapsed-interval test in `touch()` mark a
   periodic sweep due without setting `sweepRequired`, without setting
   `synchronization: 'reconciling'` and without making `background` block
   coverage. Every trigger listed in resolved decision 1 keeps producing a
   required sweep.
2. **Covering test.** A synchronized request whose expectations are covered is
   answered from the published revision when the only running or due work is
   a periodic sweep carrying no changes. The covering test runs before
   `touch()` can schedule anything for that request.
3. **Cadence.** Starting any sweep cancels the periodic timer and records the
   start as `lastSweepAt`. No timer is scheduled while a sweep runs; the
   sweep's completion reschedules it, and a firing timer re-checks elapsed
   time before starting work.
4. **A periodic sweep that finds changes** publishes them as today, with cause
   `verify` or `watch` as Plan 5 records.
5. **Tests** for RC-1 to RC-4 using the controlled clock and a scripted driver
   whose pending promise holds a sweep open, counting update and sweep calls
   separately. Existing tests that expected a periodic timer to mark the
   context `reconciling` are revised to resolved decision 1, and each revision
   is listed in the results.

## Matrix rows executed here

RC-1 `sweep-cadence`, RC-2 `covered-during-periodic-sweep`, RC-3
`covered-when-interval-elapsed`, RC-4 `required-sweeps-still-wait`.

## Verification

```sh
npx vitest run subs/daemon/subs/contexts/src/tests
npx vitest run subs/daemon/src/tests
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the iteration worktree. Expected
intermediate failures: existing context-manager expectations of periodic
reconciliation, until revised.

## Exit criteria

- RC-1 to RC-4 pass, and every other contexts and daemon test passes.
- No required-sweep trigger lost its waiting behavior.
- The results list each revised test expectation with its reason.

## Handoff

Iteration 3 relies on periodic sweeps never counting against a covered hook
and on sweep spacing of at least `sweepIntervalMs`.
