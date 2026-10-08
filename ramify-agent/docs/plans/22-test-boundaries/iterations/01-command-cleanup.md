# Iteration 1: prompt command cleanup

**Plan:** [Plan 22](../main-plan.md). **Prerequisites:** iteration 0 wrapper
inventory. **Owner:** harness/evidence.

## Goal

Completed commands with no remaining target avoid the grace sleep; owned
descendants still settle before the runner answers.

## Read first

[Cleanup contract](../contracts.md#6-cleanup-behavior),
`subs/harness/subs/evidence/src/run-command-with-cleanup.sh`, `run-command.ts`,
`src/tests/run-command.test.ts` in that owner, and writer process-identity rules.

## Deliverables

Condition waiting/escalation on a target that still needs cleanup in both group
and single-process branches. Preserve the start barrier, stdin, original exit
status, signal/output-cap classification and owned-target protection. Add a
deterministic shell control that records TERM/sleep/KILL behavior for no target,
remaining descendants and escalation. Keep actual-process tests for a command
that exits while leaving descendants and add a TERM-resistant descendant control.
Do not gate group cleanup on parent-PID liveness.

## Matrix rows executed here

TB03 and TB04; fixture F3.

## Verification

From `ramify-agent/`:

```sh
node_modules/.bin/vitest run subs/harness/subs/evidence/src/tests/run-command.test.ts
```

Include deterministic group/fallback sleep controls and actual success,
nonzero exit, timeout, cancellation, output-cap, registration and stdin cases.
Inspect for live owned processes after each actual workload. Repeat ten or
twenty no-op commands before/after and archive median elapsed times without a
fragile millisecond pass assertion. On the clean committed correction, run the
full audit command in the main plan once to obtain a post-cleanup baseline for
the subsequent test migration, retaining the four-worker timing/command counts.

## Exit criteria

Zero no-target cleanup sleeps, correct original outcomes and zero leaked live
owned descendants. Preserve the measured baseline and any failing evidence.

## Handoff

`iteration1-results.md`, wrapper controls, actual-process results and baseline
profile with source/configuration identities.
