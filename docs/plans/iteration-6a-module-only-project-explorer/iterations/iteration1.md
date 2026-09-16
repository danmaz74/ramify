# Iteration 1: Module-only contract and baseline

**Plan:** [Plan 6A: Module-only project explorer](../main-plan.md).
**Prerequisites:** completed Plan 6 artifacts and current source are present.
**Owners:** cross-owner public contract and plan evidence; no runtime behavior
changes in this iteration.

## Goal

Freeze the breaking DTO/presentation narrowing and capture evidence that the
existing projection exposes non-module targets before implementation removes
them.

## Read first

- [View-model amendment](../view-model-amendment.md).
- [Acceptance matrix](../acceptance.md).
- Plan 6's `view-model.md`, acceptance matrix and iteration 7 results.
- `subs/presentation/subs/project-view/src/interfaces/project-view.ts`.
- `subs/service-api/src/project-view.ts` and its projection tests.

## Deliverables

1. Review and freeze the visible-access formula, metric units, coverage
   preservation and exact removed public fields.
2. Extend the purpose-built projection fixture, if needed, so one report
   independently contains every omitted category, a same-owner application
   access and cross-module positive controls.
3. Capture the pre-change encoded JSON bytes and expected report counts for the
   exact fixture that iteration 2 will reuse.
4. Record the current target branches in projection, graph, page and connected
   state so every removal has an owned destination and test.
5. Resolve review objections in this plan package before source implementation;
   do not add a compatibility flag or hidden field without revising the contract.

## Matrix rows executed here

MX01 and MX02 as contract/baseline evidence. MX01 becomes executable when the
public types change in iterations 2 and 3 and is rerun at the final gate.

## Verification

Run `npm test -- subs/service-api/src/tests/project-view.test.ts` against the
unchanged implementation and archive the fixture's model JSON size and category
counts. A baseline pass must show the legacy `otherTargets` rows; absence at
this stage means the fixture cannot prove the requested removal.

Review the proposed TypeScript snippets against current foreign consumer usage
with `rg -n 'otherTargets|ExplorerTargetGroup|targetIds|GraphSelection' subs`.

## Exit criteria

The contract has no unresolved counting or coverage decisions, the fixture has
both omission subjects and positive controls, and every current consumer of a
removed field is assigned to a later iteration.

## Handoff

Iteration 2 receives the frozen DTO, mixed report, independent expected visible
set and pre-change byte count. Iterations 3 and 4 receive the complete consumer
inventory.
