# Iteration 4: Membership path with targeted retirement

**Plan:** [Plan 5 structural edit latency](../main-plan.md).
**Prerequisites:** iteration 3; review decision 2 settled.
**Owners:** `analysis/project`, `analysis`.

## Goal

A created or deleted owned source file takes a `membership` path that
invalidates nothing wholesale: the compiler update is incremental, only the
affected files are described, interpreted and decided, only their obsolete
observations are retired, and the published revision, including its input
identity, equals batch.

## Read first

- Main plan: [hypotheses 2 and 3](../main-plan.md#hypothesis-2-the-compiler-rebuilds-its-program-rejected-as-stated),
  resolved decisions 2, 4 and 5, rows SE-9 to SE-12, review decisions 1
  and 2.
- Iteration 3's results: the witness outcomes and the contributors index.
- [Plan 5 iteration 6 results](../../iteration-5-fast-incremental-checks/iterations/iteration6-results.md#issues-encountered-and-decisions-taken):
  why the created and deleted update must precede any whole invalidation.
- `subs/analysis/src/session-revision.ts`: classification at 365-387, the
  broad branch at 414-433, the source path at 436-533 as the pattern for
  narrowing, `recomputeAll` at 204-231.
- `subs/analysis/src/session-engine.ts`: `#complete` at 268, `#promote` at
  296, and the audit path.
- `subs/analysis/subs/project/src/observer.ts`: `apply` at 104-113 with the
  wholesale retirement at 108-111, `#owned` at 286-352, `#rebuild` at 375.
- `subs/analysis/subs/project/src/capture.ts`: `retainAcquisition` at 86,
  `retireReported` at 100-108, `forget`, `replay` at 276.
- `subs/analysis/subs/project/src/interfaces/project.ts`: `InventoryUpdate`
  at 135-140, `ProjectObserver.apply` at 151.
- `subs/analysis/src/session-audit.ts`; `src/tests/session-input-witness.ts`;
  `scripts/reference-harness/plan5-live-sequences.ts` for the sequences SE-11
  extends.

## Deliverables

1. **Retirement contract, `analysis/project`.** The observer retires only
   named observations: propose `apply(changes, { retire })` or a `retire(paths)`
   method, record the alternative, and remove the wholesale
   `retireReported` on local created and deleted updates. Retirement keeps
   acquisition recipes as today and forgets compiler-contributed observations
   that are not reported again by the next promotion.
2. **Membership path, `analysis`.** In `revise`, a local update whose only
   owned changes are created or deleted files, with no other broad trigger,
   takes `membership`: one incremental adapter update carrying the inventory;
   the affected set from the contributors index, the importers index and the
   description delta; `describe` over the seed set; `interpret` over the
   affected set; a whole link; decisions narrowed as on the source path;
   `checked.path` is `membership` and names the affected files. The whole
   invalidation condition drops `created` and `deleted` and keeps every other
   trigger.
3. **Promotion.** After the update, retired observations the compiler did not
   report again are forgotten before the input list is published, so an
   unreferenced deleted file leaves no entry, as in batch.
4. **Tests** for SE-9 to SE-12 in `session-revision.test.ts`,
   `retained-session.test.ts`, `session-audit.test.ts` and `observer.test.ts`,
   with the input witness comparing the session's inputs to a fresh batch
   acquisition after each step.
5. **Results** in `iteration4-results.md`: the retirement contract as landed,
   the affected-set rule with an example, the stage timings of a created file
   on the reference fixture before and after, and any case where the
   membership path had to fall back to broad.

## Matrix rows executed here

SE-9 `membership-identity-equals-batch`, SE-10 `membership-path-narrow`,
SE-11 `membership-sequences-equal-batch`, SE-12 `broad-kept`.

## Verification

```sh
npx vitest run subs/analysis/subs/project/src/tests
npx vitest run subs/analysis/src/tests
npm run type-check
npm run build
npm run check:self
git diff --check
```

Then the cucumber-viz commit audit on the worktree.

## Exit criteria

- SE-9 to SE-12 pass; every session-equals-batch and audit case passes.
- `check:self` reports 0 errors on the built toolkit.
- No test path reaches `invalidateAll` for a plain created or deleted file.

## Handoff

The `membership` path and `reacquired`-free update shape, for iteration 5,
which adds the reacquisition report; the retirement contract for iteration 6,
whose configuration update must not retire observations.
