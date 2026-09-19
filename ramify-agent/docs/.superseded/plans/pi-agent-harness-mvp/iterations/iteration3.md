# Iteration 3: Architectural plan visualization

> **Superseded** on 2026-09-19 by the [harness principles](../../../../harness.principles.md) and the
> [harness architecture](../../../../architecture.md). Kept for comparison; not current. See the
> [archive index](../../../README.md) for what may be reused.

**Plan:** [Pi architectural planning MVP](../main-plan.md).
**Prerequisites:** Iteration 2 validated artifact producer and persisted jobs.
**Owners:** Web architecture client and harness read projections.

## Goal

Make the saved architectural plan understandable and finish the planning-only
product with a real browser/pi trial.

## Read first

- Main plan sections 4–5.
- [Measurements and KPIs](../../../../measurements-and-kpis.md).
- [Client protocol](../client-protocol.md).
- [Architectural artifact contract](../architecture-artifact.md).
- [Acceptance PW08–PW09, PW19–PW20, PW24 and PW30](../acceptance.md).
- Iteration 2 real artifact and event handoff.

## Deliverables

1. Summary, work-package dependency diagram and equivalent ordered list.
2. Affected-module list and package details for scope, reuse, seams, acceptance,
   assumptions and evidence, without an architecture editor.
3. Revision selection, freshness labels and regeneration tied to input identities.
4. Snapshot/event-cursor reconciliation through the shared HTTP client, with
   browser-local state limited to presentation and connection state.
5. Live browser/pi/subscription planning trial, with no execution controls or
   engineering workers. Preserve the reusable artifact/job contracts.
6. Scope-size and actual planning KPI panels from the harness metrics endpoint,
   showing raw buckets/units/coverage and implementation metrics as Not started.

## Matrix rows executed here

PW08–PW09, PW19–PW20, PW24 and PW30.

## Verification

Run `npm run type-check`, `npm run test:plans`, `npm run test:protocol`, `npm run test:measurements` and
`npm run test:web -- --stage architecture`. Use the real artifact plus fixtures
with a subtree, proposed module and revision changes. Exercise stale tabs and
input edits in the harness as well as in the UI. Interrupt polling, attach
a second client and reconcile snapshots/events without duplicate transitions. Run
`npm run trial:web-planning -- --project <fixture-root>` and verify that the
product never executes the proposed packages or changes application source.

## Exit criteria

The user can understand scopes, dependencies and contracts without reading JSON.
The displayed artifact and freshness labels name the same exact revision.
All first-plan cases have evidence, including real pi output. No implementation
launch control or execution endpoint is included.

## Handoff

Runnable architectural planning product, schema and produced artifact, captured
inputs/worktree, client protocol, pi integration and lifecycle/decision evidence for the separate
[implementation runner](../../pi-agent-implementation/main-plan.md).
