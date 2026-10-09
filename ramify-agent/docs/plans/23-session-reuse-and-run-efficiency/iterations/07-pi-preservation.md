# Iteration 7: Pi prefix preservation and appended tools

**Plan:** [Plan 23](../main-plan.md). **Prerequisites:** iteration 1.
**Status:** accepted for its recorded scope; see [07-results.md](07-results.md).

## Owners and write boundary

Harness/agent/pi implementation and tests only; consume accepted agent/storage contract from 1.

Confirm exact paths against [execution rules](../execution.md) before work begins.
No edits to another active iteration's files or the main checkout's index.

## Goal

Implement session operations on pi while preserving the actual complete request prefix at every dispatch.

## Read first

[C2](../contracts.md#c2-provider-request-and-tool-contract), accepted iteration 1 receipt, pi-agent.ts and installed pi serialization/hook/dispatch implementation.

## Deliverables

Persist initial instructions, full definitions and provider-required artifacts through the injected store. Reconstruct exact requests on Continue/Fork/Retry and bind current handlers without replacing declarations. Append native additions and role instructions in order, retaining inactive definitions while blocking execution.

Implement final dispatch validation outside swallowed extension errors. Reject unsupported transports/definition changes and stop before any invalid next request. Prevent default-prompt insertion, automatic compaction and budget-tool clearing from rewriting history; emit the appropriate structured outcome.

Restore activation/point state and isolate parent/child mutations. Include transport/model support checks and source-version evidence. Keep real-provider behavior unclaimed until 14.

## Matrix rows executed here

S07, S08, S09, S10, S11 in the [acceptance matrix](../acceptance.md).

## Verification

Use installed serializer with an intercepted scripted transport to compare complete request objects, including messages/calls/results and continuation artifacts. Inject hook exceptions, missing persisted data, changed leading tools, late role instructions, stale submissions and changed-name definitions. Assert exact call counts before/after each failure.

From `ramify-agent/` (new `plan23-*` files are deliverables of this iteration):

```sh
npm run test:quick -- subs/harness/subs/agent/subs/pi/src/tests/session-modes.test.ts subs/harness/subs/agent/subs/pi/src/tests/plan23-prefix-preservation.test.ts
```

Record focused outcomes and evidence limits in this iteration's receipt. The
integrator runs affected cross-boundary checks after merging accepted work;
final full configured qualification belongs to iteration 14.

## Exit criteria

S07–S11 pass; offline request evidence is retained and explicitly distinguished from live acceptance.

## Handoff

Supported transport matrix, final validation seam, serialized golden prefixes, live witness recipe and adapter limitations. Record exact base/head, changed paths, commands and results in
`07-results.md`; do not create a passing receipt before executing the work.
