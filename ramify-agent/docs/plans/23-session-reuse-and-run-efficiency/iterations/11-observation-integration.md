# Iteration 11: Capture all roles and publish metric projections

**Plan:** [Plan 23](../main-plan.md). **Prerequisites:** iteration 6, iteration 10.
**Status:** proposed; not executed.

## Owners and write boundary

Harness run/service.ts, run/observations.ts, run/records.ts, interfaces/protocol and projections; agent event enrichment if required by frozen contract. Serial runtime owner; no web/trial edits.

Confirm exact paths against [execution rules](../execution.md) before work begins.
No edits to another active iteration's files or the main checkout's index.

## Goal

Collect the facts needed by the metrics without extra agent exploration or a runtime session-strategy decision.

## Read first

Receipts 6 and 10, [C6](../contracts.md#c6-metrics-and-observation), observation log, existing KPI/projection and staged role-size capture paths.

## Deliverables

Capture actual role package/brief/size or explicit limit at every invocation site, including orientation, selectors, reviews, catalog, NFR, capability and repair. Join observations and lineage to durable session/turn/operation/point identities.

Enrich tool events with resolved read/search scope, returned bytes and durations where observed. Keep missing facts unknown and replay keys stable across retries; do not count inherited exploration as a new child tool call. Preserve separate authority and durable-history channels.

Publish pure calculation outputs for declared/read scope, exploration, time milestones and cached/new/output charges. Use recorded rates and consistent components/revisions. Retain current delivered-line attribution. Existing observations with insufficient data remain coverage-limited without inventing measurements.

## Matrix rows executed here

M06, M07, M08 in the [acceptance matrix](../acceptance.md).

## Verification

F6 composed runs exercise each role and interrupted/replayed observations, inherited manifests, zero-match project-wide search, truncation and absent usage. Assert recorded arithmetic equals pure fixture results and capture adds zero model/tool exploration calls.

From `ramify-agent/` (new `plan23-*` files are deliverables of this iteration):

```sh
npm run test:quick -- subs/harness/src/tests/observation-log.test.ts subs/harness/src/tests/projections-pure.test.ts subs/harness/src/tests/plan23-observation-integration.test.ts
```

Record focused outcomes and evidence limits in this iteration's receipt. The
integrator runs affected cross-boundary checks after merging accepted work;
final full configured qualification belongs to iteration 14.

## Exit criteria

M06–M08 pass; API projections contain all units/coverage/identity needed by 12.

## Handoff

Frozen web projection examples including partial/unavailable/zero states and retry/fork lineage. Record exact base/head, changed paths, commands and results in
`11-results.md`; do not create a passing receipt before executing the work.
