# Iteration 6: Build-time runtime identity

**Plan:** [Plan 5 hook optimization](../main-plan.md).
**Prerequisites:** none; runs after iteration 5 in the worktree.
**Owners:** `daemon`; root build scripts.

## Goal

Endpoint selection derives the build key without reading and hashing every
runtime file, and still refuses a mixed or incomplete build.

## Read first

- Main plan: resolved decision 6; rows HO-17 and HO-18.
- Analysis: [Client cost](../../../analysis/fast-incremental-checks-optimization.md#client-cost)
  and [target 5](../../../analysis/fast-incremental-checks-optimization.md#5-build-key).
- [Optimization: native client](../../../architecture/optimization.md#native-client).
- `subs/daemon/src/discovery.ts` 40-65 and `subs/daemon/src/tests/discovery.test.ts`,
  `discovery-fixture.ts`.
- `scripts/build-production.ts`, `scripts/production-files.ts` and the
  production package file list.

## Deliverables

1. **Identity file.** The build writes the runtime file list and hashes, and
   the build identity, to a file in `dist/` included in the package, in a
   plain format any client can read.
2. **Selection.** Endpoint selection reads that file and derives the same build
   key the hashing path derives today. Mixed-build detection uses a cheap
   check, for example size and modification time recorded at build time plus
   the file list, falling back to hashing when a signature differs. Choose and
   justify the check in the results.
3. **Tests** for HO-17 and HO-18: key equality with the hashing path, and a
   changed, missing or added runtime file failing selection or falling back.
4. **Results** in `iteration6-results.md`.

## Matrix rows executed here

HO-17 `build-identity-read`, HO-18 `mixed-build-detected`.

## Verification

```sh
npx vitest run subs/daemon/src/tests
npm run type-check
npm run build
git diff --check
```

Then the cucumber-viz commit audit on the worktree.

## Exit criteria

- HO-17 and HO-18 pass; every other daemon test passes.
- A production build contains the identity file.

## Handoff

The identity file format, for the native client plan.
