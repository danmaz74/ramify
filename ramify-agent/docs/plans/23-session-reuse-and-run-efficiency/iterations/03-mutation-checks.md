# Iteration 3: Correct and serialize mutation checks

**Plan:** [Plan 23](../main-plan.md). **Prerequisites:** iteration 0.
**Status:** proposed; not executed.

## Owners and write boundary

Harness src/hooks/post-write.ts, src/tools/shell.ts and owner-local scheduling helpers/tests. Excludes shell-tests.ts, engineer-equipment.ts and run/service.ts.

Confirm exact paths against [execution rules](../execution.md) before work begins.
No edits to another active iteration's files or the main checkout's index.

## Goal

Check actual mutations without races, duplicate logs or fabricated violations.

## Read first

[C4](../contracts.md#c4-mutation-checks-and-focused-commands), post-write.ts, shell.ts, hook-checks tests and evidence result contracts.

## Deliverables

Represent known-empty, unknown and actual changed sets distinctly. Skip only known no-change/refused mutation hooks; retain checks for failed mutating commands and independent completion checks.

Serialize same-worktree mutation/check settlement and reserve log identities before awaits. Prevent one check from clearing later findings out of order. Preserve genuine provider findings while reporting changed-input/incomplete as not checked; no synthetic module violation or pass. Supply role-appropriate legal submission names through an explicit input.

Expose scheduling/result interfaces for iteration 10 to wire into equipment and run state. Job-record placement is coordinated with trial iteration 13, not a guessed toolkit exclusion.

## Matrix rows executed here

H01, H02, H03, H04 in the [acceptance matrix](../acceptance.md).

## Verification

F3 scripts three overlapping calls with controlled promises, reversed completion and unique expected logs. Exercise empty/unknown/refused/failed-mutating outcomes and incomplete results with genuine findings. No real shell or Ramify launch in ordinary tests.

From `ramify-agent/` (new `plan23-*` files are deliverables of this iteration):

```sh
npm run test:quick -- subs/harness/src/tests/hook-checks.test.ts subs/harness/src/tests/plan23-mutation-order.test.ts
```

Record focused outcomes and evidence limits in this iteration's receipt. The
integrator runs affected cross-boundary checks after merging accepted work;
final full configured qualification belongs to iteration 14.

## Exit criteria

H01–H04 pass; recorded check ordering and results retain existing completion/authority contracts.

## Handoff

Mutation/check scheduling contract, result mapping and equipment integration recipe. Record exact base/head, changed paths, commands and results in
`03-results.md`; do not create a passing receipt before executing the work.
