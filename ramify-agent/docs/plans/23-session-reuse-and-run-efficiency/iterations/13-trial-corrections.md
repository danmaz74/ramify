# Iteration 13: Repair trial verification and fixture inputs

**Plan:** [Plan 23](../main-plan.md). **Prerequisites:** iteration 10.
**Status:** proposed; not executed.

## Owners and write boundary

Root scripts/live-trial.ts, trial fixtures/README, fixture-trials.test.ts and dedicated trial-verifier tests. Excludes runtime service, metrics, protocol and web.

Confirm exact paths against [execution rules](../execution.md) before work begins.
No edits to another active iteration's files or the main checkout's index.

## Goal

Make trial verification attribute setup precisely and remove fixture inputs that distort a run.

## Read first

[C7](../contracts.md#c7-trials-and-evidence), receipt 10, live-trial script and existing fixture cwd/setup attribution contracts.

## Deliverables

Verify recorded harness scratch setup using exact commit/delta attribution, retaining unauthorized agent changes to the same file. Fix scripted paths relative to module src cwd while preserving project-relative fields.

Remove supplied solution, stale enforcement prose and broken fixture links. Keep job output outside the analyzed project or use an explicit prepared owned-unwired declaration, preserving project configuration and scratch boundaries.

Record every fixture change so a later comparison can tell prompt cleanup from a different task. Start no status-badge comparison run and not the long toolkit trial.

## Matrix rows executed here

T01, T02 in the [acceptance matrix](../acceptance.md).

## Verification

F7 scripts Git facts in ordinary tests and checks positive setup-only and negative setup-plus-agent same-file cases. Validate generated paths and prepared project-boundary declarations. Actual Git/process verification is reserved for Q01.

From `ramify-agent/` (new `plan23-*` files are deliverables of this iteration):

```sh
npm run test:quick -- subs/harness/src/tests/plan23-trial-attribution.test.ts
```

Record focused outcomes and evidence limits in this iteration's receipt. The
integrator runs affected cross-boundary checks after merging accepted work;
final full configured qualification belongs to iteration 14.

## Exit criteria

T01–T02 pass; the corrected fixture and trial verifier are ready for 14.

## Handoff

Trial fixture identities, verifier cases and configuration. Record exact base/head, changed paths, commands and results in
`13-results.md`; do not create a passing receipt before executing the work.
