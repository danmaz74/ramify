# Iteration 2: strict no-process fixtures

**Plan:** [Plan 22](../main-plan.md). **Prerequisites:** iteration 1 and adopted
configured-audit source base. **Owners:** root testing infrastructure and harness
test helpers, delivering one no-process testing capability.

## Goal

An ordinary scenario receives complete strict external scripts and cannot hide
an attempted process or missing candidate response.

## Read first

[Ordinary boundary and guard contracts](../contracts.md),
`subs/harness/src/tests/helpers/{runs,external-tools,process-guard,mock-git,scripted-git,candidates,direct-check-execution}.ts`,
`subs/harness/src/tests/external-boundaries.test.ts`, and
`src/tests/vitest-test-lock.ts`. Read actual `RunServiceOptions` in current source.

## Deliverables

Provide no-process fixture assembly requiring Git and candidate scripts, fake
Ramify, configured audit replies and explicit scratch preconditions. Remove
production candidate fallback from that assembly. Add completion checks for
unexpected operations and unused required responses. Fixture setup copies/writes
files without `initRepository` or shell commands. Install the guard for focused
converted files now; global project selection is delivered in iteration 6.
Make attempts persist through caught errors and test teardown, reconcile old
per-file resets, and isolate the guard's own negative controls. Do not introduce
a per-test/environment escape. Move/adapt the common guard into root
`src/tests/helpers/process-guard.ts`; declare the named testing exposures in
contract section 3 for necessary descendant access. Keep reset in root hooks
and all cross-owner helpers testing-classified.

## Matrix rows executed here

TB05 and TB06; fixtures F1, F2 and F4.

## Verification

Run `node_modules/.bin/vitest run subs/harness/src/tests/external-boundaries.test.ts`
and new `src/tests/test-process-guard.test.ts` and
`src/tests/test-boundaries.integration.test.ts` by their exact paths. Exercise actual service
and ledger behavior under scripts, missing candidate/Git/audit responses,
caught errors, unused answers, setup/teardown process attempts and builtin
access variants. Negative controls must fail without launching Git. Run
`npm run type-check` and `npm run check:self` for helper exposure changes.

## Exit criteria

Strict fixtures are usable by migration consumers, ordinary controls report
zero launches, and every negative control proves refusal/teardown enforcement.

## Handoff

`iteration2-results.md`, helper usage examples, exact strict-port contract,
guard installation/control results and any exposure changes.
