# Iteration 2: Validate resolution reuse by discovery queries only

**Plan:** [Plan 5 structural edit latency](../main-plan.md).
**Prerequisites:** none; independent of iteration 1.
**Owners:** `analysis/project`.

## Goal

A created or deleted source file, or a configuration content edit, no longer
resolves the project root again in the daemon or in the worker, and every
change that can alter the resolution outcome still does.

## Read first

- Main plan: [hypothesis 1](../main-plan.md#hypothesis-1-root-resolution-runs-twice-confirmed),
  resolved decisions 2 and 3, rows SE-3 to SE-5, review decision 4.
- [Hook optimization iteration 4 results](../../iteration-5-hook-optimization/iterations/iteration4-results.md):
  the reuse design, the enumeration counts, and the deferred narrowing.
- [CLI invocation contract](../../../architecture/cli-invocation.spec.md):
  project selection and configuration discovery.
- `subs/analysis/subs/project/src/resolve-root.ts`: evidence at 11-22,
  `recordResolution` at 42-46, `unchanged` at 52-64, `resolveProjectRoot` at
  72-95.
- `subs/analysis/subs/project/src/selection.ts`: `selectRoot` and
  `findConfiguration`, the queries that determine the outcome.
- `subs/analysis/subs/project/src/capture.ts`: `observations()` at 272-275,
  `replay` at 276, `answers` at 301-305, `enumerations` at 306.
- `subs/analysis/subs/project/src/read-project.ts`: 55-88, where the worker
  records its own resolution, and the references-only guard at 64.
- `subs/analysis/subs/project/src/tests/resolve-root.test.ts` cases
  `root-resolution-reused` at 72 and `root-resolution-invalidated` at 115;
  `subs/analysis/src/tests/root-resolution.test.ts`;
  `subs/daemon/subs/contexts/src/tests/root-resolution.test.ts`.

## Deliverables

1. **Discovery evidence.** `recordResolution` records, beside the full
   observations, the subset made before `readConfiguration` ran: the
   selection and configuration-discovery probes and the `module.ramify`
   symlink probe. Both call sites, `resolve-root.ts` and `read-project.ts`,
   take that snapshot at the same boundary.
2. **Validation.** `unchanged` replays only that subset and compares a digest
   of kind, canonical path and exact-name membership. Directory listings and
   file bytes are not replayed. If the recorded configuration had references,
   the full replay remains for that resolution.
3. **Attribution.** Confirm in tests that a directory made unreadable after
   the resolution, and a configuration rewritten as solution-style, are still
   refused with the same codes through acquisition.
4. **Tests** for SE-3 to SE-5, counting helper spawns through the existing
   spied resolver, in `analysis/project`, `analysis` and `daemon/contexts`.
5. **Results** in `iteration2-results.md`: the validated query set and why it
   is complete for the outcome, the replay cost before and after on the
   reference fixture, and the moved attribution points.

## Matrix rows executed here

SE-3 `resolution-survives-membership`, SE-4
`resolution-invalidated-by-discovery`, SE-5
`resolution-survives-configuration-bytes`.

## Verification

```sh
npx vitest run subs/analysis/subs/project/src/tests
npx vitest run subs/analysis/src/tests/root-resolution.test.ts
npx vitest run subs/daemon/subs/contexts/src/tests/root-resolution.test.ts
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the worktree.

## Exit criteria

- SE-3 to SE-5 pass; HO-10 to HO-12 still pass.
- No stale root or configuration path is reachable in a test where a
  discovery input changed.

## Handoff

The validated query set, for iteration 6, which must not reintroduce a byte
comparison when it re-reads a changed configuration.
