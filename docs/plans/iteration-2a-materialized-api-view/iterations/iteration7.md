# Iteration 7: Retained-session and context query

**Plan:** [Plan 2A: Materialized API discovery](../main-plan.md).
**Prerequisites:** Iteration 5 projection, frozen limits and the completed Plan
5 session/context implementation.
**Owners:** `analysis` retained worker/session and `daemon/contexts`. This
iteration is independent of iteration 6.

## Goal

Answer one synchronized API-view request from exactly one current valid retained
revision, including hot details or safe warm compiler rehydration, without a
report projection or new inventory walk.

## Read first

- [Revision behavior](../scope.md#revision-behavior),
  [analysis query](../contracts.md#analysis-projection) and
  [context operation](../contracts.md#context-operation).
- Plan 5 session engine/host/worker messages, observer capture/promotion,
  compiler release/rebuild, context request queue, leases, deadlines and
  freshness tests.
- Iterations 4–5 provider handoffs.

## Deliverables

1. Add `RetainedSession.apiView`, worker command/result framing, host
   cancellation and bounded transfer accounting.
2. Accept only the current valid sequence and read `SessionFacts` directly.
   Prohibit `report()`, a second model/store and project inventory acquisition.
3. Use the hot compiler when present. For a warm session, recreate one compiler
   against the observer's retained captured view; do not publish a revision for
   the query itself.
4. Promote/compare any newly observed compiler inputs. If input ID or sequence
   differs, return superseded, discard the projection and let normal
   reconciliation handle the change.
5. Extend contexts with one serialized `apiView` request that reuses
   synchronized freshness, queue ordering, generation, lease, deadline and
   cancellation semantics. Keep the selected revision slot until the caller
   finishes with the ephemeral projection.
6. Add hot/warm/current/invalid/historical/racing/limit/cancellation/disposal
   session tests and controlled context tests. Verify repeated queries retain no
   projections and respect existing memory counters.
7. Apply exact interface relays without touching daemon rendering, service or
   CLI files owned by iterations 6/8.

## Matrix rows executed here

I2A-08: all nine leaves.

## Verification

Run focused session engine/worker/host and contexts tests, the existing retained
session audit/equivalence suite and type-check. Instrument inventory/report/model
entry points to assert zero calls during a current query. Compare hot and warm
projections against independent R expectations. Force races at every queue
boundary and require exact sequence behavior.

## Exit criteria

Contexts returns an ephemeral complete projection bound to one current revision;
hot and warm paths are explicit, no stale/last-valid data is substituted, and
all limits and lifecycle outcomes are bounded.

## Handoff

The context operation and revision outcome go to iteration 8, which joins them
with iteration 6's publisher inside the daemon service.
