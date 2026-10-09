# Iteration 6: Scope-size corrections and exploration calculations

**Plan:** [Plan 23](../main-plan.md). **Prerequisites:** iteration 0.
**Status:** completed; see [06-results.md](06-results.md) and [final qualification](14-results.md).

## Owners and write boundary

Harness src/kpi/ calculations and local tests. Excludes run/service.ts, run/observations.ts, run/records.ts, protocol and web. Consume frozen proposed input types through owner-local types until integration.

Confirm exact paths against [execution rules](../execution.md) before work begins.
No edits to another active iteration's files or the main checkout's index.

## Goal

Complete and verify current staged size/attribution corrections and calculate useful exploration evidence.

## Read first

[C6](../contracts.md#c6-metrics-and-observation), current metrics specifications, staged capture/metrics/delivered/lines changes, existing arithmetic tests.

## Deliverables

Audit existing staged fixes against M01–M04 and preserve them. Complete support/brief deduplication, comparable project-only/total baselines, all known subtotal/weight/coverage states and revision/policy checks. Keep soft read scope outside the scope-size/2 writer denominator and expose it separately.

Add pure exploration aggregation over the frozen observation contract: unique/repeated reads, observed returned bytes, broad/zero-match/outside-scope searches and tool duration with explicit limits. Do not infer exact scanned bytes or agent understanding.

Keep delivered-change attribution distinct from guarding, counting harness setup separately and retaining unknown overlapping writers. Do not implement Plan 4's score. Expose calculation inputs/results to 11; no runtime strategy chooser or source re-exploration.

## Matrix rows executed here

M01, M02, M03, M04, M05 in the [acceptance matrix](../acceptance.md).

## Verification

F6 uses hand-calculated expected arithmetic with overlapping files, zero/unknown baseline, partial and unknown writers, reverts, binary/rename and setup deltas, repeated/forked/replayed call identities and missing durations. Verify all numerical units and null/coverage states.

From `ramify-agent/` (new `plan23-*` files are deliverables of this iteration):

```sh
npm run test:quick -- subs/harness/src/tests/kpi-metrics.test.ts subs/harness/src/tests/scope-size-recipe.test.ts subs/harness/src/tests/delivered-change.test.ts subs/harness/src/tests/plan23-exploration-metrics.test.ts
```

Record focused outcomes and evidence limits in this iteration's receipt. The
integrator runs affected cross-boundary checks after merging accepted work;
final full configured qualification belongs to iteration 14.

## Exit criteria

M01–M05 pass against independently calculated values and existing staged metrics behavior is preserved.

## Handoff

Pure metric inputs/results, hand-computed fixtures, staged-change verification and explicit collection gaps for 11. Record exact base/head, changed paths, commands and results in
`06-results.md`; do not create a passing receipt before executing the work.
