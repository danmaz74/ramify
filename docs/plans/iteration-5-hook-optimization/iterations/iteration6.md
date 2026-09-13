# Iteration 6: Build-time runtime identity

**Plan:** [Plan 5 hook optimization](../main-plan.md).
**Prerequisites:** the compiled client, `b6275fc` on `feat/bun-compiled-client`,
merged into the worktree; runs after iteration 5.
**Owners:** `daemon`; root; root build scripts.

## Goal

Endpoint selection derives the build key without reading and hashing every
runtime file, and still refuses a mixed or incomplete build. The compiled
client refuses a build it was not compiled from.

## Read first

- Main plan: resolved decision 6; rows HO-17, HO-18, HO-21 and HO-22.
- Analysis: [Client cost](../../../analysis/fast-incremental-checks-optimization.md#client-cost)
  and [target 5](../../../analysis/fast-incremental-checks-optimization.md#5-build-key).
- [Optimization: native client](../../../architecture/optimization.md#native-client),
  including its identity limitation.
- `subs/daemon/src/discovery.ts` 40-65 and `subs/daemon/src/tests/discovery.test.ts`,
  `discovery-fixture.ts`.
- `scripts/build-production.ts`, `scripts/compiled-client.ts`,
  `scripts/production-files.ts` and the production package file list.
- `src/compiled-entry.ts`, `src/cli-process.ts`, `src/client.ts` and
  `src/tests/compiled-client.test.ts`.

## Merge first

Merge `feat/bun-compiled-client` before any change. Both branches edit
`discovery.ts`: `b6275fc` keeps only JavaScript `bin` entries in the required
runtime list. Keep that rule. Run the verification below once after the merge,
before starting the deliverables, and record the result.

## Deliverables

1. **Identity file.** After promotion and before compiling the client, the
   build writes the runtime file list with each file's hash and the build
   identity to a JSON file in `dist/`, included in the package. The identity
   uses today's derivation, so the key is unchanged. The file is not a runtime
   file, so it does not hash itself. After compiling the client, the build adds
   the executable's hash for tooling; no client reads that hash per invocation.
2. **Selection.** Endpoint selection reads the file and derives the same build
   key the hashing path derives today. Mixed-build detection uses a check that
   avoids reading every file, falling back to hashing when it cannot decide.
   The check must hold for a packed and installed build, whose files need not
   keep build-time modification times. Choose the check, state what it misses,
   and justify it in the results. A missing or malformed identity file falls
   back to hashing; it never selects an endpoint unchecked.
3. **Compiled client binding.** `scripts/compiled-client.ts` embeds the build
   identity into the executable at compile time. Before reading a daemon
   record, starting a daemon or running batch, the compiled client compares
   its embedded identity with the identity endpoint selection establishes. On
   a difference it exits 2 with a CLI failure coded `incompatible`, naming the
   rebuild as the remedy. The Node entry is unchanged. `--help` and `--version`
   need no identity.
4. **Documentation.** Replace the identity limitation in
   [optimization](../../../architecture/optimization.md#native-client) with the
   delivered binding, and mark target 5 delivered in the analysis.
5. **Tests.**
   - HO-17 and HO-18 in `subs/daemon/src/tests/discovery.test.ts`.
   - HO-22 through a fixture copy that loses modification times; `npm pack` is
     not needed for the unit case.
   - HO-21 in `src/tests/compiled-client.test.ts`, against a copied package tree
     whose runtime identity differs from the executable's. It asserts exit 2,
     the `incompatible` code, no started daemon and an empty endpoint
     directory.
6. **Results** in `iteration6-results.md`, including the post-merge baseline.

## Matrix rows executed here

HO-17 `build-identity-read`, HO-18 `mixed-build-detected`,
HO-21 `compiled-identity-bound`, HO-22 `installed-identity`.

## Verification

```sh
npm run build
npx vitest run subs/daemon/src/tests src/tests/compiled-client.test.ts src/tests/launcher-script.test.ts src/tests/cli-process.test.ts
npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/final-contracts.test.ts scripts/reference-harness/relocation.test.ts
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the worktree.

## Exit criteria

- HO-17, HO-18, HO-21 and HO-22 pass; every other daemon, root CLI and
  compiled-client test passes.
- A production build contains the identity file, and its compiled client
  embeds the same identity.

## Handoff

The identity file format, the compiled client's `incompatible` message, and the
chosen mixed-build check with what it misses. The measurement successor uses
them to report per-invocation client cost for both clients.
