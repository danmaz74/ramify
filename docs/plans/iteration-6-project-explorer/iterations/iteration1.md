# Iteration 1: Reuse baseline and compatibility contract

**Plan:** [Plan 6: Project explorer](../main-plan.md).
**Prerequisites:** retained `check` with report scope, `contextStatus`, the
lightweight daemon client and the existing retained `SymbolDetail` provider.
**Owners:** plan artifacts only. No source changes.

## Goal

Freeze a source-faithful extraction boundary and the smallest contract needed to
feed the lifted cucumber-viz components from one existing Ramify report.

## Read first

- [Main plan](../main-plan.md): accepted product boundary and reuse contract.
- [View model](../view-model.md): complete compatibility DTO and computations.
- [Lift inventory](../lift-inventory.md): verified source paths and destination map.
- [Acceptance matrix](../acceptance.md): the first-release gate.
- Current `AnalysisReport`, service and context/revision interfaces.

## Deliverables

1. Recheck every lift path at cucumber-viz `44b7f30` and record any unavailable
   source before implementation starts.
2. Freeze the compatibility DTO, stable IDs, count units, unavailable states and
   the `{revision, report}` projection input.
3. Freeze three tRPC procedures: `projectView`, `explorerDetails` and
   `contextStatus`, using the request/result shapes in the main plan.
4. Draft the four module headers and every exposure required by the destination
   map; record the narrow existing-owner interface changes for `explorerDetails`.
5. Freeze the local binding/origin policy, web discovery record and 16 MiB
   response refusal used by iterations 5 and 6.
6. Record the exact source-test inventory and the required reuse-accounting
   categories for the completion report.

## Matrix rows executed here

EX01.

## Verification

Confirm every DTO field has a report source or named pure computation, every
lift candidate has a destination, and the detail operation can delegate to the
existing bounded provider without a new source-interpretation algorithm.

## Exit criteria

The contract and destination map are reviewed, all source paths resolve or have
an explicit replacement, and iterations 2–6 require no unresolved product
choice.

## Handoff

Iterations 2 and 3 receive the component contract and source baseline.
Iteration 4 receives the projection contract. Iterations 5 and 6 receive the
wire and launch contracts.
