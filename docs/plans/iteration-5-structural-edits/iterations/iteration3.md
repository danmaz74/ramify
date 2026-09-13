# Iteration 3: Membership witness and contribution index

**Plan:** [Plan 5 structural edit latency](../main-plan.md).
**Prerequisites:** iteration 1.
**Owners:** `typescript`, `analysis`.

## Goal

It is established, by owner tests, that the compiler handles a created or
deleted file without a whole invalidation and reports every read the affected
files contribute, and the session can name, for any observation path, the
owned files that contribute it.

## Read first

- Main plan: [hypotheses 2 and 3](../main-plan.md#hypothesis-2-the-compiler-rebuilds-its-program-rejected-as-stated),
  resolved decisions 4 and 5, rows SE-6 to SE-8.
- [Plan 5 iteration 11 results](../../iteration-5-fast-incremental-checks/iterations/iteration11-results.md#compiler-observations-and-removed-roots):
  the deletion defect this plan must not reintroduce.
- `subs/analysis/subs/typescript/src/retained-source-analysis.ts`: `update`
  at 120-145, `#regenerate`, `#broad` at 135 and 159, the sink callbacks at
  392-464.
- `subs/analysis/subs/typescript/src/descriptions.ts`: `recompute` at
  91-168, the created and deleted selection at 96-101 and 113-114.
- `subs/analysis/subs/typescript/src/accesses.ts`: `interpret` at 119,
  `onCandidate` at 254; `resolution.ts`: `exists` at 75-79.
- `subs/analysis/subs/typescript/src/tests/retained-membership.ts` and
  `retained-source-analysis.test.ts`: the existing membership witness.
- `subs/analysis/src/session-facts.ts`: `FileFacts.candidates` at 22,
  `buildIndexes` at 99-123, `FactIndexes` at 31.
- `subs/analysis/src/interfaces/source.ts` in `typescript`:
  `FileDescription.dependencies` at 30-43.

## Deliverables

1. **Membership witness, `typescript`.** Extend the retained membership
   witness: for a created unreferenced file, a created file that an existing
   importer already probed as absent, a deleted referenced file and a deleted
   unreferenced file, one incremental `update` with `invalidateAll: false`
   yields program membership, descriptions, catalog and accesses equal to a
   fresh adapter over the same disk. Record which files the compiler re-read.
2. **Reported reads, `typescript`.** In the same cases, the sink receives,
   during that update, a callback for every path the affected files contribute
   after the change, including the created path where an importer probed it.
   If the compiler's resolution cache suppresses a re-probe, record the exact
   condition and the smallest adapter change that reports it; do not fall back
   to `invalidateAll`.
3. **Contribution index, `analysis`.** `FactIndexes.contributors`: observation
   path, relative to the root, to the sorted owned files contributing it, from
   each file's own path, its `candidates` and its description
   `dependencies.files`, `resources`, `shims` and `absent`. Built in
   `buildIndexes`, frozen, and equal to a rebuild after every revision kind.
4. **Results** in `iteration3-results.md`: per case, the files re-read and the
   callbacks reported, the index shape, and any adapter change made under
   deliverable 2.

## Matrix rows executed here

SE-6 `membership-incremental-equal`, SE-7 `membership-reads-reported`, SE-8
`contribution-index`.

## Verification

```sh
npx vitest run subs/analysis/subs/typescript/src/tests
npx vitest run subs/analysis/src/tests
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the worktree.

## Exit criteria

- SE-6 to SE-8 pass with explicit 120 s timeouts on the compiler-bearing
  cases.
- The results state, for each witness case, that the reported callbacks cover
  the contributions, or name the gap and the adapter change that closes it.

## Handoff

The witness outcomes and the contributors index, which iteration 4's
retirement relies on; the description set's expansion rule as observed, so
iteration 4 names only the seed set.
