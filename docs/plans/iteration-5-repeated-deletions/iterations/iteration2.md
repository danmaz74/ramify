# Iteration 2: Reuse the published revision for a repeated deletion

**Plan:** [Plan 5 repeated deletion revisions](../main-plan.md).
**Prerequisites:** iteration 1.
**Owners:** the owners iteration 1 locates: `analysis`, `analysis/project`, or
both.

## Goal

A repeated deletion reuses the published revision, and a first deletion still
publishes an exact revision.

## Read first

- Main plan: resolved decisions 1 and 2, rows DL-3 to DL-6.
- [Iteration 1 results](iteration1-results.md): the cause and the source lines.
- The reproduction test from iteration 1.

## Deliverables

1. **Repair** at the location iteration 1 names. If the first deletion
   revision was incomplete, repair it so that the second update finds nothing
   changed (resolved decision 2).
2. **Tests** for DL-3 to DL-6. The iteration 1 reproduction becomes DL-5 and
   passes without the expected-failure marker. DL-4 compares the first
   deletion's revision with a batch report over the same inputs.
3. **Results** in `iteration2-results.md`: the repair, the tests and any
   existing expectation revised, each with its reason.

## Matrix rows executed here

DL-3 `repeated-deletion-reuses`, DL-4 `unpublished-deletion-unchanged`, DL-5
`watcher-then-hook-paths`, DL-6 `other-kinds-unchanged`.

## Verification

```sh
npx vitest run subs/analysis/src/tests
npx vitest run subs/analysis/subs/project/src/tests
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the iteration worktree.

## Exit criteria

- DL-3 to DL-6 pass, and every other test in the touched owners passes.
- Session revisions still equal batch for the deletion fixtures.
- The optimization analysis's Deleted files section links the results.

## Handoff

The deleted-file hook is measured with the other workloads after the
optimization work, against the 2 s acceptable-time budget.
