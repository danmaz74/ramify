# Iteration 1: Reproduce and locate the repeated deletion revision

**Plan:** [Plan 5 repeated deletion revisions](../main-plan.md).
**Prerequisites:** none; starts from `85be06c` or later.
**Owners:** `analysis`, `analysis/project`.

## Goal

Reproduce, in a deterministic owner test, a warm session publishing a new
revision for a deletion it has already published, and name the cause.

## Read first

- Main plan: [Evidence](../main-plan.md#evidence), the candidate table, resolved
  decisions 1 and 2, rows DL-1 and DL-2.
- `subs/analysis/src/session-revision.ts`: `revise()` from 320, the identity
  test at 362 and the broad decision after it.
- `subs/analysis/src/session-engine.ts`: `update()` from 120 and the broad
  publication paths around 261 and 352-369.
- `subs/analysis/subs/project/src/observer.ts`: `#update` from 203 and `#owned`
  from 285, including the repeated-deletion branch at 298-311.
- `subs/analysis/src/tests/session-test-fixture.ts` and
  `src/tests/session-revision.test.ts`.

## Deliverables

1. **Reproduction test.** In `session-revision.test.ts`, or a new owned test
   beside it, open a warm session over a fixture with an owned source file,
   delete the file, apply the changes the watcher delivers for that deletion
   (the archive records two changed paths; establish which) and then the
   hook's single path. Record the second result's status, `identical` flag,
   sequence, input identity and checked path. Mark the test as an expected failure against the
   reuse rule, so iteration 2 flips it.
2. **Observer-level evidence.** If the cause is in the observer, an
   `observer.test.ts` case showing the repeated deletion's update kind and
   input changes.
3. **Results** in `iteration1-results.md`: the branch that produces the second
   revision, with source lines, the state that selects it, and whether the
   first revision was complete. If the second revision is required for
   exactness, state why and which repair resolved decision 2 calls for.

## Matrix rows executed here

DL-1 `repeated-deletion-reproduced`, DL-2 `repeated-deletion-cause`.

## Verification

```sh
npx vitest run subs/analysis/src/tests/session-revision.test.ts
npx vitest run subs/analysis/subs/project/src/tests/observer.test.ts
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the iteration worktree.

## Exit criteria

- The reproduction is deterministic and marked as an expected failure.
- The results name one cause with source lines, or show that no deterministic
  reproduction exists and list what was tried.
- No source outside tests changed.

## Handoff

Iteration 2 implements the repair the results identify and turns the expected
failure into a passing test.
