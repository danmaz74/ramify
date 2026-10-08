# Iteration 12: Present session and efficiency evidence

**Plan:** [Plan 23](../main-plan.md). **Prerequisites:** iteration 11.
**Status:** proposed; not executed.

## Owners and write boundary

Web run/session/metrics presentation and web tests only. Harness projection changes require coordination, not independent formula edits.

Confirm exact paths against [execution rules](../execution.md) before work begins.
No edits to another active iteration's files or the main checkout's index.

## Goal

Make the new session model and actual exploration/time/cost evidence understandable in existing views.

## Read first

Receipt 11 projection examples, [C6](../contracts.md#c6-metrics-and-observation), web run-page and session components/tests.

## Deliverables

Render unique session identity, numbered turns/checkpoints, fork ancestry and retry/stop/preservation outcomes without exposing pi file mechanics. Preserve existing live transcript behavior.

Show scope components and ratios with correct units, known subtotals and gaps; distinguish read scope and broad searches from declared writer scope. Show elapsed milestones, observed tool time and cached/new/output charges with their identities and coverage. Do not calculate alternative KPIs in the client or label cache share as savings.

## Matrix rows executed here

V01, V02 in the [acceptance matrix](../acceptance.md).

## Verification

Use supplied projection fixtures for same-number sibling turns, standalone checkpoint, restored operation, partial metrics, zero-change and missing usage. Verify accessible labels/details and no fabricated zero or computed client ratio.

From `ramify-agent/` (new `plan23-*` files are deliverables of this iteration):

```sh
npm run test:quick -- subs/web/src/tests/run-page.test.tsx subs/web/src/tests/plan23-session-metrics.test.tsx
```

Record focused outcomes and evidence limits in this iteration's receipt. The
integrator runs affected cross-boundary checks after merging accepted work;
final full configured qualification belongs to iteration 14.

## Exit criteria

V01–V02 pass; existing run/transcript views still render real protocol states.

## Handoff

UI evidence and focused tests for final integrated browser/real-run assessment. Record exact base/head, changed paths, commands and results in
`12-results.md`; do not create a passing receipt before executing the work.
