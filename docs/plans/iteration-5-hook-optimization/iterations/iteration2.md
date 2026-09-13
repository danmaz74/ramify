# Iteration 2: Maintain the observed-input list

**Plan:** [Plan 5 hook optimization](../main-plan.md).
**Prerequisites:** iteration 1.
**Owners:** `analysis/project`; callers in `analysis`.

## Goal

Reading the observer's `inputs` and `inputId` costs nothing when no
observation changed, and yields exactly today's list and identity.

## Read first

- Main plan: resolved decisions 1 and 2; rows HO-3 to HO-6.
- Analysis: [The observed-input list](../../../analysis/fast-incremental-checks-optimization.md#the-observed-input-list)
  and [target 1](../../../analysis/fast-incremental-checks-optimization.md#1-the-observed-input-list).
- `subs/analysis/subs/project/src/capture.ts`: the `inputs` getter at 246-250,
  `inputId`, and every method that adds, replaces, refreshes, forgets or
  changes the role or bytes of an observation.
- `subs/analysis/subs/project/src/data.ts`: `byteOrder` at 5 and its other users.
- `subs/analysis/subs/project/src/observer.ts`: mutations it drives, including
  exact-name probes and reported observations.
- Callers: `subs/analysis/src/session-revision.ts` 331, 332, 349 and
  `subs/analysis/src/session-engine.ts` 221, 261, 290, 298.
- `subs/analysis/subs/project/src/tests/capture.test.ts`, `observer.test.ts`,
  `sweep.test.ts`, `capture-retirement.ts`.

## Deliverables

1. **Comparator.** Replace `byteOrder` with a non-allocating comparator that
   orders by UTF-8 bytes exactly as `Buffer.compare(Buffer.from(a), Buffer.from(b))`
   does. Code-unit order differs from UTF-8 byte order for surrogate pairs
   against U+E000 to U+FFFF; handle that case.
2. **Hash once.** Record each observation's hash, label and byte size when it
   is read or mutated rather than on each `inputs` access.
3. **Cached list.** Cache the sorted list and `inputId` behind a version
   counter that every mutation advances. Prefer one mutation choke point over
   scattered increments. Entries leave with their observations.
4. **Callers.** Remove repeated evaluations that remain costly; a caller may
   hold the list for a revision where that is simpler and still exact.
5. **Tests** for HO-3 to HO-6. HO-4 applies each mutation kind and compares
   the cached result with a fresh rebuild; HO-6 includes non-ASCII and
   surrogate-pair paths.
6. **Results** in `iteration2-results.md`: mutation sites and how each
   advances the version, the comparator proof, iteration 1's fields if any
   test reads them, and a microbenchmark of `inputs` reads on a test fixture
   if cheap, labelled as such.

## Matrix rows executed here

HO-3 `input-list-cached`, HO-4 `input-list-invalidated`, HO-5
`input-cache-no-leak`, HO-6 `byte-order-equivalent`.

## Verification

```sh
npx vitest run subs/analysis/subs/project/src/tests
npx vitest run subs/analysis/src/tests
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the worktree.

## Exit criteria

- HO-3 to HO-6 pass; every other test in the touched owners passes,
  including session-equals-batch tests, with no expectation changed.
- `inputId` values in existing tests are unchanged.

## Handoff

The cache's invalidation contract and its owner-local API, for iteration 4,
which validates root reuse against configuration dependencies the observer holds.
