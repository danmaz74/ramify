# Iteration 2: Cancellation without advanced state

**Plan:** [Plan 5 contract remediation](../main-plan.md).
**Prerequisites:** none; independent of iteration 1.
**Owners:** `analysis`.

## Goal

A revision or sweep cancelled before it changes the observer or the compiler
leaves the session as published, so the next description edit takes the
`description` path.

## Read first

- Main plan: [Violation 2](../main-plan.md#violation-2-description-edits-fall-back-to-broad),
  resolved decision 3, rows RC-5 to RC-7.
- Plan 5 scope: [Paths of an update](../../iteration-5-fast-incremental-checks/scope.md#paths-of-an-update).
- `subs/analysis/src/session-engine.ts` `sweep` (150-175), the promotion and
  publication handler (250-265), and
  `subs/analysis/src/session-revision.ts` `revise` (315-535).
- `src/tests/session-revision.test.ts`, `src/tests/session-audit.test.ts`
  (the "cancels during observation promotion" case at 150-167) and
  `src/tests/session-test-fixture.ts`.

## Deliverables

1. **Advanced-state marker in `revise()`.** Record the point immediately
   before `observer.apply` and before the adapter update. The error handler
   sets `state.stale` only when that point was passed, or when the error is not
   a cancellation.
2. **Promotion and publication handler.** The handler at
   `session-engine.ts:260-262` follows the same rule: a cancellation before
   `#promote` changes the observer returns `cancelled` without marking the
   session stale; a cancellation after it still does.
3. **Cancellation check before revising.** `sweep` returns `cancelled` when
   the signal aborted during `reobserve()`, before calling `revise()`.
   Where the observer's hashing can observe the sweep's signal cheaply, it
   stops early; otherwise that is recorded as not done.
4. **Tests** in `session-revision.test.ts`:
   - RC-5: open, replace the description file, wrap `state.observer.reobserve`
     to abort after the real call, assert `sweep` returns `cancelled`, then
     assert the next revision's `checked.path` is `description`, the audit is
     equal and the facts equal batch.
   - RC-6: abort after `observer.apply`; assert the next revision is `broad`,
     reflects the edit and equals batch.
   - RC-7: abort during `reobserve()`; assert `revise()` is not entered.
   - A cancellation raised before `#promote` changes the observer leaves the
     next description revision on `description`.

## Matrix rows executed here

RC-5 `cancel-before-apply-keeps-description`, RC-6
`cancel-after-apply-stays-exact`, RC-7 `cancel-check-before-revise`.

## Verification

```sh
npx vitest run subs/analysis/src/tests/session-revision.test.ts subs/analysis/src/tests/session-audit.test.ts subs/analysis/src/tests/session.test.ts
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the iteration worktree. Expected
intermediate failure: RC-5 reports `broad` before deliverable 1.

## Exit criteria

- RC-5 to RC-7 pass with batch equality, and the listed analysis session
  tests pass.
- A cancellation after state advanced still recomputes from disk.

## Handoff

Iteration 3 expects every description cycle to take `description` even when a
background sweep is cancelled by the edit's watcher event.
