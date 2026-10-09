# Iteration 10: Integrate command, catalog and briefing corrections

**Plan:** [Plan 23](../main-plan.md). **Prerequisites:** iteration 3, iteration 4, iteration 5, iteration 9.
**Status:** completed; see [10-results.md](10-results.md) and [final qualification](14-results.md).

## Owners and write boundary

Harness run/service.ts, work/engineer-equipment.ts, work/scenario-briefing.ts, work/session.ts and briefing/submission wiring/tests; serial shared-runtime owner.

Confirm exact paths against [execution rules](../execution.md) before work begins.
No edits to another active iteration's files or the main checkout's index.

## Goal

Make the real-run fixes operate together under unchanged architect and audit responsibilities.

## Read first

Receipts 2–5 and 9, [C3–C5](../contracts.md#c3-prompt-and-workflow-inputs), source P1/P3/P4 proposals and current configured-audit completion contract.

## Deliverables

Bind hook scheduling and precise change status into engineer equipment; create and deliver the focused scenario config/command with scratch lifecycle. Include actual project Cucumber/support/step paths and available API views.

Use one declared capability guarded-set policy for briefing, accepted authorizations and execution. Bound NFR assessment inputs/read scope with requirements, base/candidate and changed paths; exclude Git/run records and omit irrelevant temporal language.

Pass accepted intake classifications to initial architecture and integrate catalog/form corrections. Send one canonical review path list, patch-first instructions and exact pending-tag binding attribution while preserving audited diff and snapshot evidence. Correct step provenance only from actual recorded imports. Keep architect declarations and configured audit health separate; test missing reports and failed audit as existing blockers.

## Matrix rows executed here

W08, W09, W10, W11 in the [acceptance matrix](../acceptance.md).

## Verification

Composed F2–F5 run tests reproduce original D1–D3 triggers, capability-policy mismatch and catalog rejection loops. Prove completion accepts trusted architect reports without scenario-execution matching while still rejecting missing reports/failed audit. Ordinary external answers remain scripted.

From `ramify-agent/` (new `plan23-*` files are deliverables of this iteration):

```sh
npm run test:quick -- subs/harness/src/tests/catalog-extraction.test.ts subs/harness/src/tests/scenario-briefings.test.ts subs/harness/src/tests/hook-run-boundaries.test.ts subs/harness/src/tests/plan23-real-run-corrections.test.ts
```

Record focused outcomes and evidence limits in this iteration's receipt. The
integrator runs affected cross-boundary checks after merging accepted work;
final full configured qualification belongs to iteration 14.

## Exit criteria

W08–W11 pass through real harness orchestration, with no duplicated schemas/full unchanged briefings or unsupported permissions.

## Handoff

Integrated runtime candidate, focused-command fixture and trial inputs for metrics/trial lanes. Record exact base/head, changed paths, commands and results in
`10-results.md`; do not create a passing receipt before executing the work.
