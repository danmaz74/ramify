# Iteration 14: Reference gate

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** iteration 13.
**Owners:** the independent `scripts/reference-harness/` scope; root package
scripts.

## Goal

Make the strict reference gate real: the compiled CLI checks the unchanged
example cleanly, every I1 instance from iterations 3 to 13 is required and
executed by one command, the harness report derives its violation total from
the checker, and the reference's own regression tiers remain evidence.

## Read first

- Main plan: Harness implementation and evidence, Required commands table,
  matrix rows I1-01 and I1-30, Validation and completion conditions.
- [Harness plan](../../reference-project/harness.md): execution tiers and the
  separation of execution from semantic readiness.
- The current `scripts/reference-harness/report.ts`.

## Deliverables

1. `npm run check:reference`: the compiled CLI over the unchanged example
   via `--root`; exit 0 with the expected warnings and coverage notes.
2. `npm run reference:verify -- --plan 1`: requires every I1 instance and its
   capability, executes the matrix through the iteration 2 runner, reports
   each subcase separately, and fails on any missing capability, missing
   instance, unrun assertion or failed assertion. Deleting or disabling a
   required instance fails the gate.
3. `npm run reference:report`: keeps running the example's type-check,
   Vitest, Vite build and Cucumber tiers as regression evidence, replaces the
   hand-written violation total with the checker's result, and lists the
   remaining pending families and instances.
4. Test discovery evidence: every migrated toolkit owner's tests and the
   example's standalone testing-module fixture are discovered; production
   selection excludes testing-classified source and retains ordinary
   interfaces. I1-30 `production-selection` invokes iteration 8's actual
   `production:files` command for the toolkit and the reference, compares its
   output with independently named expected inclusions/exclusions, and checks
   that the toolkit build consumes the same selection. Assert absence of
   nested test sources and `integration-tests/src/`, preservation of ordinary
   `src/interfaces/` files, and continued complete type-check/test discovery.
5. A portable gate report: revision and build identity, command, scope,
   capabilities, per-instance outcomes, diagnostics and coverage, durations
   and retained pending work; no machine secrets or dependency inventories.

## Matrix rows executed here

- I1-01: `baseline`.
- I1-30: `reference-regression`, `test-discovery`, `production-selection`,
  `harness-required`.

## Verification

```sh
npm run reference:cases
npm run check:reference
npm run reference:verify -- --plan 1 --iteration 14
npm run reference:verify -- --plan 1
npm run reference:report
```

## Exit criteria

- All I1 instances assigned to iterations 3 to 14 pass in one
  `reference:verify -- --plan 1 --iteration 14` run; none is skipped, and a
  deliberately removed instance fails the run.
- The unfiltered completion gate still fails solely for the pending iteration
  15 instances: I1-27 `self-check` and `self-negative`, and I1-28
  `relocated-package`. Any additional missing or failed assertion blocks this
  iteration. Its successful stage result does not claim plan completion.
- The unchanged reference has all fifteen owners and every required baseline
  construct checked, with proven external dependencies reported separately.

## Handoff

Iteration 15 adds the self-check, relocation and measurements, then writes
the completion report over this gate's output.
