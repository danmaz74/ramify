# Iteration 1: Execution coordinator and verification

> **Superseded** on 2026-09-19 by the [harness principles](../../../../harness.principles.md) and the
> [harness architecture](../../../../architecture.md). Kept for comparison; not current. See the
> [archive index](../../../README.md) for what may be reused.

**Plan:** [Pi implementation runner](../main-plan.md).
**Prerequisites:** Completed architectural planning MVP and its artifact,
workspace, pi adapter, lifecycle and decision contracts; built Plan 2C and
the predecessor measurement adapter/baseline records.
**Owners:** Harness coordinator, scoped engineering worker, verification and
activity/KPI reducer; shared metric contracts.

## Goal

Execute the saved architecture, automatically revising routine work and retaining
independent verification and scope evidence.

## Read first

- Main plan sections 1, 3 and 4.
- [Measurements and KPIs](../../../../measurements-and-kpis.md).
- [Shared artifact contract](../../pi-agent-harness-mvp/architecture-artifact.md).
- [Acceptance PW10–PW12, PW15–PW16 and PW31–PW33](../acceptance.md).
- Predecessor completion evidence and concrete generated fixture artifact.

## Deliverables

1. Revision-bound launch, freshness checks and one execution run per workspace.
2. Automatic brief preparation, dependency scheduling and scoped pi attempts.
3. Structured results, provider/repair work and routine architecture revisions.
4. Independent acceptance/Ramify checks, fingerprint validation and invalidation
   of dependent acceptance when prerequisites change.
5. Direct scope observations and explicit unknown shell activity.
6. Mutation-event capture including repeated/reverted changes, recorded
   exclusions and pre/post Ramify ownership; frozen baseline and scope references.
7. Session/usage/adaptation records and cost, owner/seam/reuse drift reducers,
   with explicit unknowns and optional evidence-backed knowability assessments.
   No human measurement gate or agent-specific Ramify change.

## Matrix rows executed here

PW10–PW12, PW15–PW16 and PW31–PW33.

## Verification

Run `npm run type-check`, `npm run test:implementation` and `npm run test:kpis`. Use deterministic
workers for partial needs, invalid results, routine replanning, failed checks,
post-check changes and scope excursions; retain source/check artifacts.

## Exit criteria

Routine execution progresses without manual task selection. No failed, unrun or
stale check passes. Duplicate requests cannot start concurrent writers.
KPI fixtures verify arithmetic, repeated work, adaptation deduplication and
coverage without zero-filling missing size/usage/graph evidence.

## Handoff

Execution API/events, outcomes, scope evidence and verified fixture transitions
for the browser launch/progress controls in iteration 2.
