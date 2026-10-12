# Initial iteration 1 check failures

These are retained excerpts from tool output on 2026-10-12, before the final
passing runs. They are development failures, not accepted intermediate gaps.

`npm run type-check` initially exited 1:

```text
subs/cli/src/tests/recovery-contracts.test.ts(17,37): error TS2339: Property 'scope' does not exist on type 'ProposedOwnershipDocument'.
subs/cli/src/tests/recovery-contracts.test.ts(23,30): error TS2339: Property 'paths' does not exist on type 'ProposedOwnershipDocument'.
subs/cli/src/tests/recovery-contracts.test.ts(23,40): error TS7006: Parameter 'value' implicitly has an 'any' type.
```

The exported positive fixture had the whole union as its declared type. Its
annotation now uses the answered variant explicitly. Subsequent type checks
passed, including the negative compiler witnesses.

The focused command below initially exited 1 with eight passes and one failure:

```sh
npx vitest run subs/cli/src/tests/recovery-contracts.test.ts subs/daemon/src/tests/recovery-contracts.test.ts subs/analysis/src/tests/recovery-fixtures.test.ts
```

```text
AssertionError: expected [ { …(9) }, { …(9) }, { …(9) }, …(1) ] to have a length of 2 but got 4
subs/analysis/src/tests/recovery-fixtures.test.ts:26:21
```

Named root re-exposure introduced two additional missing-export findings.
The fixture now uses root wildcard re-exposure, preserving the two explicit
provider exports and producing exactly the two intended provider diagnostics.
The next focused run passed nine tests.

A later focused run, concurrent with type-check and whole-toolkit self-check,
exited 1 with eight passes and one default-timeout failure:

```text
Error: Test timed out in 5000ms.
subs/analysis/src/tests/recovery-fixtures.test.ts:7:3
Test Files  1 failed | 2 passed (3)
Tests  1 failed | 8 passed (9)
Start at  06:12:11
Duration  6.35s
```

The qualification case intentionally performs three fresh analyses and two
inventory acquisitions. Its aggregate Vitest timeout is now explicitly 30 s;
acquisition limits, deadlines and runtime retention budgets are unchanged.
After self-check completed, the same focused command passed all nine tests in
8.23 s. The coordinator reviewed this adjustment. No test was skipped and no
flaky-test classification is claimed.
