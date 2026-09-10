# Iteration 2: Skeleton tree, build configuration and harness runner

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** iteration 1's draft subcase list and owner drafts.
**Owners touched:** all nine as empty owners; the independent
`scripts/reference-harness/` scope.

## Goal

Make the declared toolkit layout real, compile and test it beside the legacy
`src/`, and give every later iteration a runner that executes reference
instances against a copy of the example. After this iteration every I1
subcase is inventoried as not executed, and nothing is green by omission.

## Read first

- Main plan: Implementation ownership and migration, Harness implementation
  and evidence, Reference acceptance matrix.
- Iteration 1's `owners.md`, `scope.md` and subcase list.
- [Harness plan](../../../reference-project/harness.md) and the current
  `scripts/reference-harness/{cases,report}.ts`.

## Deliverables

1. The nine owner directories with their reviewed header-only `module.ramify`
   and `README.md`, each with an empty `src/` (and `src/tests/` where the drafts
   declare tests). Future exposure statements remain in `owners.md` until
   their exports exist. Legacy `src/model` and `src/viz` stay untouched.
2. Build and test configuration for the nested tree. The root `tsconfig.json`
   becomes the whole-toolkit configuration the checker will read: a
   package-root `rootDir`, `subs/**/src/**` included, Node ambient types
   visible, `dist/src/...` and `dist/subs/...` output paths. The portable
   build that keeps `types: []` for browser-safe owners moves to a separate
   build configuration Ramify never reads. Vitest collects
   `subs/**/src/tests/**` as well as the legacy `src/**/*.test.ts`. Keep this
   whole-project configuration distinct from production emission. The
   inventory-based production selection and build wiring arrive in iteration 8;
   a path exclusion for `src/tests/` alone cannot exclude testing modules.
3. Harness instance records: extend `scripts/reference-harness/cases.ts` with
   one record per I1 subcase from iteration 1's list, carrying matrix ID,
   subcase, implementing iteration, required capability, fixture/root/configuration/registry,
   mutation summary, independent expectation and expected coverage. Execution
   status is never stored; it is derived from assertions that ran.
4. The mutation runner: copy the example into a unique
   `examples/collection-review/.reference-work/<run-id>/` directory excluding
   dependencies, outputs and previous copies; select the copied root
   explicitly; apply one recorded edit; run the instance's assertion through a
   capability-gated entry; restore by deleting the copy; support an explicit
   preserve-on-failure switch; never share directories between concurrent
   runs.
5. `npm run reference:cases` validates instance integrity, pointers and gate
   membership. `npm run reference:report` lists every I1 instance as not
   executed; its hand-written violation total is untouched until iteration 14.
6. `npm run reference:verify -- --plan 1` exists and fails, because every
   required capability is absent. Add `--iteration <n>` to require that
   iteration's instances plus those of its transitive prerequisites. Validate
   the prerequisite map against the plan and require the full reviewed
   membership even when a record or handler is removed. This mode labels its
   report as iteration verification and lists all other instances as not
   executed; it never marks the plan complete.

## Matrix rows executed here

None. The runner has no capability to invoke yet.

## Verification

```sh
npm run build && npm run type-check && npm test
npm run reference:cases
npm run reference:report -- --dry-run
npm run reference:verify -- --plan 1   # must fail: capabilities absent
npm run diagrams && npm run site:build
```

## Exit criteria

- The declared tree, legacy sources, diagrams and site coexist; all existing
  tests pass in the new configuration.
- Every I1 subcase has an instance record and reports not executed.
- The runner copies, mutates, restores and preserves on failure, proven by
  its own tests against a tiny fixture project.
- Runner tests prove that a missing required capability, removed instance,
  unrun assertion or failed assertion fails intermediate verification, while
  future instances remain pending. The unfiltered gate still requires them all.

## Handoff

Iterations 3 to 15 add owner source under the skeleton, activate its reviewed
exposures and wire their subcases into this runner. The runner's capability gate
is the only way an instance becomes executable.
