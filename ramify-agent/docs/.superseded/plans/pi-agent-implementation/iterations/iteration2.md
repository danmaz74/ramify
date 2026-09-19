# Iteration 2: Implementation controls and progress

> **Superseded** on 2026-09-19 by the [harness principles](../../../../harness.principles.md) and the
> [harness architecture](../../../../architecture.md). Kept for comparison; not current. See the
> [archive index](../../../README.md) for what may be reused.

**Plan:** [Pi implementation runner](../main-plan.md).
**Prerequisites:** Iteration 1 coordinator; predecessor web app and decision UI.
**Owners:** Browser implementation view and harness progress/decision projection.

## Goal

Launch implementation from the viewed architecture and follow a real pi run to
verified completion through the web interface.

## Read first

- Main plan sections 1–3 and completion boundary.
- [Measurements and KPIs](../../../../measurements-and-kpis.md).
- [Acceptance PW13–PW14, PW17 and PW34](../acceptance.md).
- Iteration 1 execution API/events and predecessor decision controls.

## Deliverables

1. Implementation tab and Start implementation bound to the displayed revision.
2. Current activity, package states/counts, checks and durable event feed.
3. Reuse substantial-change decisions during execution, with exact-proposal
   approval, cumulative impact checks and automatic alternatives on rejection.
4. Reload/reconnect, explicit Stop/Resume and harness restart reconciliation.
5. KPI read projection and compact browser panel for cost, drift, adaptations,
   actual usage and scope excursions, with raw terms/coverage and final checks.
6. Real browser/pi/subscription run from plan selection through final acceptance,
   retaining the actual metrics and source evidence used by their formulas.

## Matrix rows executed here

PW13–PW14, PW17 and PW34.

## Verification

Run `npm run type-check`, `npm run test:kpis`, `npm run test:web -- --stage implementation` and
`npm run trial:web-workflow -- --project <fixture-root>`. Exercise actual
browser decision controls, process interruption and duplicate tabs. The live
fixture must use real pi output and implementation, not scripted source edits.

## Exit criteria

All successor cases have evidence. The routine fixture needs only its two phase
launches, and every additional required decision concerns a substantial change.
The final browser state agrees with actual checks and workspace identity.

## Handoff

Runnable implementation runner, reviewable target branch/worktree, native pi
sessions, architecture revisions, scope observations and acceptance evidence.
