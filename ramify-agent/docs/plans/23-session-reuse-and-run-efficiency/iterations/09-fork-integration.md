# Iteration 9: Integrate predetermined forks and recovery

**Plan:** [Plan 23](../main-plan.md). **Prerequisites:** iteration 8.
**Status:** completed; see [09-results.md](09-results.md) and [final qualification](14-results.md).

## Owners and write boundary

Harness run/service.ts and context-selection/review/consultation/recovery orchestration and tests; serial after 8.

Confirm exact paths against [execution rules](../execution.md) before work begins.
No edits to another active iteration's files or the main checkout's index.

## Goal

Implement every fixed fork source and preserve authority, briefing completeness and explicit recovery.

## Read first

[C3 workflow table](../contracts.md#c3-prompt-and-workflow-inputs), receipt 8, check-findings architecture and current review/context-selection/consultation workflows.

## Deliverables

Persist assignment, completion-request, handback and capability-request points with the corresponding accepted records. Fork selectors/reselectors, consultations, scope review and reconciliation from those exact points, never a moving head.

Implement design-orientation identity checking and global oriented parents with idempotent accepted brief appends. Enforce read-only/snapshot authority and current submission through rebinding. Keep scope review's inherited reasoning distinct from independent fresh code review.

Exercise every C3 row, including unchanged fresh NFR/catalog/failure paths and new engineer iteration/budget-return boundaries. Missing parent uses only the existing named fresh recovery or returns unavailable. Remove transitional old invocation APIs after the final caller migrates; no legacy support. Stop context limits without unrequested summaries.

## Matrix rows executed here

W03, W04, W05, W06, W07 in the [acceptance matrix](../acceptance.md).

## Verification

F1/F2 include later parent changes, concurrent siblings, accepted briefs between numbered turns, changed design guidance, different role instructions, inherited write tools and missing parent. Validate the complete invocation-site inventory against C3 with expected strategy/source contracts rather than runtime heuristics.

From `ramify-agent/` (new `plan23-*` files are deliverables of this iteration):

```sh
npm run test:quick -- subs/harness/src/tests/plan23-fork-workflows.test.ts subs/harness/src/tests/nonfunctional-recovery.test.ts subs/harness/src/tests/session-reducer.test.ts
```

Record focused outcomes and evidence limits in this iteration's receipt. The
integrator runs affected cross-boundary checks after merging accepted work;
final full configured qualification belongs to iteration 14.

## Exit criteria

W03–W07 pass; no invocation site still supplies a replacement inherited head or pi file/ref mechanics.

## Handoff

Complete site-to-operation inventory, explicit recovery map and fork/authority regression evidence for 10. Record exact base/head, changed paths, commands and results in
`09-results.md`; do not create a passing receipt before executing the work.
