# Iteration 1: Durable session operations and scripted behavior

**Plan:** [Plan 23](../main-plan.md). **Prerequisites:** iteration 0.
**Status:** proposed; not executed.

## Owners and write boundary

Harness/agent port and scripted implementation; new harness session-store adapter and its own tests. Own run/sessions.ts if required; do not edit run/service.ts, pi or shared run records.

Confirm exact paths against [execution rules](../execution.md) before work begins.
No edits to another active iteration's files or the main checkout's index.

## Goal

Expose the complete high-level lifecycle with durable recovery and a scripted implementation that models its guarantees.

## Read first

[C1](../contracts.md#c1-session-identity-history-and-storage), agent port/scripted source, harness run/sessions.ts, current ledger API and session lifecycle tests.

## Deliverables

Implement unique identities, numbered turns, immutable checkpoints, run-scoped idempotency keys, compare-and-advance and current operation state. Bundle task/equipment preparation atomically; standalone appends and activation changes do not create turns. Retain fork lineage without mutating the parent.

Implement the injected durable store using existing ledger primitives, complete transcript payload references and intent/outcome ordering. Restore without caller transcript handling. Bind Retry to original task/policy/validator/environment; handle changed-input conflicts and completed retries before stale-point checking.

Implement Stop fencing, tool-effect recovery boundaries and unavailable points when effects remain uncertain. Use new session-owned records instead of concurrently editing shared run schemas. Keep temporary old entry points only for build sequencing until iteration 9 removes them; implement no legacy-session reader or migration.

## Matrix rows executed here

S01, S02, S03, S04, S05, S06 in the [acceptance matrix](../acceptance.md).

## Verification

Use F1 with deterministic interruption at each durable/dispatch boundary, stale/concurrent advances, duplicate keys, sibling points and uncertain tool effects. Reopen actual temporary files in process with newly constructed store/agent objects; script external effects. Expected failures are explicit unavailable/conflict outcomes, never silent fresh starts.

From `ramify-agent/` (new `plan23-*` files are deliverables of this iteration):

```sh
npm run test:quick -- subs/harness/subs/agent/src/tests/plan23-session-operations.test.ts subs/harness/src/tests/plan23-session-store.test.ts
```

Record focused outcomes and evidence limits in this iteration's receipt. The
integrator runs affected cross-boundary checks after merging accepted work;
final full configured qualification belongs to iteration 14.

## Exit criteria

All S01–S06 pass with stable identities and no duplicate task, declaration, accepted result or blindly replayed effect.

## Handoff

Frozen operation/storage contracts, scripted fixture API, structured failure outcomes and receipt for pi and runtime consumers. Record exact base/head, changed paths, commands and results in
`01-results.md`; do not create a passing receipt before executing the work.
