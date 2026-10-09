# Iteration 5: Combined workflow qualification and documentation

**Plan:** [Plan 25](../main-plan.md). **Status:** planned.
**Prerequisite:** iteration 4 and its receipt.

## Owners and write boundary

Harness integrated/projection tests, affected current documentation, receipts and final configured audit. Paths below are relative to `ramify-agent/`;
short owner-local paths are relative to `subs/harness/src/`.

## Goal

Qualify one consolidated delivery workflow and record its practical limits.

## Read first

[Main plan](../main-plan.md), [instruction contracts](../instruction-block-contracts.md),
[execution rules](../execution.md), [testing specification](../../../testing.spec.md),
and All preceding receipts, acceptance.md, `docs/harness.spec.md`,
`docs/metrics/session-observations.md`, observation integration/projections and
existing pi prefix-preservation tests.

## Deliverables

Exercise the integrated orientation → selector fork → assignment → engineer
result → completion/review → NFR workflow through the public scripted agent
boundary. Include fresh and historical controls, physical manifests, occurrence
identities and candidate comparison evidence. Join every acceptance row to its
owning source commit and check result; run relevant predecessor regressions.

Update current harness/owner/prompt and metric-access documentation to describe
actual block delivery and optional pointer handoffs. Do not change foundational
semantic authority or rewrite predecessor receipts. Existing provider identity and
prefix tests retain their purpose; byte evidence cannot prove cache-hit gains.

Run the single final clean-candidate configured full nested audit under execution.md.
Record source identity, complete configured coverage, failures/skips/unrun checks
and remaining limitations. No live benefit trial or performance gate is required.

## Matrix rows executed here

Q01, Q02, Q03, Q04, I06 in the [acceptance matrix](../acceptance.md).

## Verification

From `ramify-agent/`:

```sh
npm run test:quick -- subs/harness/src/tests/plan25-combined-delivery.test.ts subs/harness/src/tests/plan23-observation-integration.test.ts subs/harness/subs/agent/subs/pi/src/tests/plan23-prefix-preservation.test.ts
npm run type-check
npm run check:self
```

Files beginning `plan25-` above are proposed new focused test files. Existing
selectors must be reconciled with configured discovery at implementation time.
Script Git, CandidateSource, Ramify, audit and process answers under the testing
specification. No intended intermediate failures remain at handoff.
Run the configured final full nested audit from the clean committed repository
root under execution.md; do not run a direct whole suite.

## Exit criteria

All cases have evidence; current docs agree; full configured nested audit passes with explicit coverage/limits. Responsible review confirms scope completion.

## Handoff

05-results.md joins source commits, case evidence and audit identity. Mark the combined plan complete only after required checks; benefits remain separately assessed. Record source commit, checks and limits in `05-results.md`.
