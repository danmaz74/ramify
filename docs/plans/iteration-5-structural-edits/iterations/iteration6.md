# Iteration 6: Keep the inventory on an options-only configuration edit

**Plan:** [Plan 5 structural edit latency](../main-plan.md).
**Prerequisites:** iterations 4 and 5; review decision 3 settled.
**Owners:** `analysis/project`, `analysis`.

## Goal

A configuration edit that changes no file selection keeps the inventory and
the capture, spawns the helper once, invalidates the whole compiler program
and publishes a revision equal to batch. An edit that changes the selection
rebuilds as today.

## Read first

- Main plan: [hypothesis 5](../main-plan.md#hypothesis-5-configuration-edits-confirmed-and-mostly-avoidable),
  resolved decisions 2, 4 and 7, rows SE-15 and SE-16, review decision 3.
- Iteration 2's results: the validated query set.
- Iteration 5's results: the reacquisition rule, and its handoff on whether
  this update's capture must still sweep.
- `subs/analysis/subs/project/src/configuration.ts`: the helper at 14-20,
  reuse keyed on byte hashes at 139-149, `ConfigurationChanged` at 135.
- `subs/analysis/subs/project/src/configuration-data.ts`: `ConfigurationData`.
- `subs/analysis/subs/project/src/inventory.ts`: `excludedDirectory` at 19-29,
  the selection at 60, 145 and 164, the fields the project layer reads.
- `subs/analysis/subs/project/src/observer.ts`: `broadRoles` and `broadNames`
  at 28-29, `#classify` at 206-226, `#update` at 228-232, `#rebuild` at 375-396.
- `subs/analysis/subs/project/src/read-project.ts`: 55-88, the retry on
  `ConfigurationChanged` at 87.
- `subs/analysis/src/session-revision.ts`: classification at 365-387 and the
  broad branch; `subs/analysis/subs/typescript/src/retained-source-analysis.ts`
  at 129-135, the configuration re-parse on `invalidateAll`.
- `scripts/measurements/fast-fixture.mjs` at 41: the edit the workload makes.

## Deliverables

1. **Projection comparison, `analysis/project`.** On a changed configuration
   input, re-read the configuration through the helper and compare the
   selection projection, `files`, `references`, `exclusions`, `outDir` and
   `declarationDir`, with the retained data. Equal: keep the inventory, the
   capture and the retained configuration product, refresh the configuration
   observations, and return a local update with `configuration` naming the
   changed inputs and no created, deleted or changed sources. Different, or
   any `package.json` or lockfile change: rebuild as today.
2. **Session path, `analysis`.** A local update with `configuration` and no
   other change takes the broad path with the whole invalidation and
   `recomputeAll`, without retiring observations by membership; the compiler
   re-parses the configuration. `checked.path` stays `broad`.
3. **Sweep.** Following iteration 5's handoff, either show that the whole
   invalidation's promotion re-verifies every retained observation, and report
   reacquisition accordingly, or leave the sweep in place and record its cost.
4. **Helper cost.** Record the helper spawn's duration on the reference and
   S100 fixtures in a unit-level timing, for review decision 3.
5. **Tests** for SE-15 and SE-16 in `observer.test.ts`, `project.test.ts`,
   `session-revision.test.ts` and `retained-session.test.ts`, with the input
   witness against batch.
6. **Results** in `iteration6-results.md`: the projection's fields and the
   argument that no other configuration field reaches the inventory, the
   update shape, the sweep decision and the helper cost.

## Matrix rows executed here

SE-15 `configuration-projection-unchanged`, SE-16
`configuration-projection-changed`.

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

- SE-15 and SE-16 pass; every session-equals-batch and audit case passes.
- `check:self` reports 0 errors on the built toolkit.
- An options-only edit performs no directory walk and hashes no owned source
  in a test that counts capture reads.

## Handoff

The `configuration` update kind and the helper cost, for iteration 7's closure
and for the review of decision 3.
