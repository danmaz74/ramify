# Iteration 1: Contract review and scale probes

**Plan:** [Plan 2A: Materialized API discovery](../main-plan.md).
**Prerequisites:** Plan 5 retained-session implementation and its completion
record are present on the execution base. The existing Plan 3 directory is a
read-only successor artifact.
**Owners:** Plan 2A documents and checked-in probe scripts only; no production
owner changes.

## Goal

Bind the proposal to current Plan 5 providers, measure its projected scale and
freeze every public contract, owner relay and numeric bound before code is
implemented.

## Read first

- [Main plan](../main-plan.md), [scope](../scope.md),
  [contracts](../contracts.md), [owners](../owners.md) and
  [subcases](../subcases.md).
- [Materialized API discovery specification](../../../architecture/materialized-api-view.spec.md).
- Plan 5 [completion report](../../iteration-5-fast-incremental-checks/iterations/iteration13-results.md),
  contracts and owner map.
- Current model, TypeScript, project, analysis session, contexts, daemon
  service/codec and CLI interfaces named in `owners.md`.
- [Testing guide](../../../development/testing.md), especially evidence levels
  and the predecessor measurement-waiver policy.

## Deliverables

1. Record the exact source commit and current provider shapes: retained facts,
   compiler hot/warm behavior, observer capture, current-sequence rules,
   context serialization, service bounds and lightweight import closures.
2. Add checked-in, deterministic probes that compute available-entry/file
   counts and estimated ordinary/test Markdown bytes for R, T, S100, S500 and
   S1000 without claiming the feature exists. Record where Plan 5 refuses a
   fixture before projection.
3. Probe signature/doc extraction feasibility against the current TypeScript
   7 API using the same captured compiler setup. Cover overloads, aliases,
   Unicode byte bounds, missing docs and isolated failures.
4. Record token counts for the specified compact format and an equivalent
   verbose representation using one named tokenizer/version. Do not add fields
   merely because the probe can produce them.
5. Freeze numeric values in `contracts.md`: signature/docs/overloads/result,
   area/invocation/staged bytes, deadline and recovery-artifact bounds. Link raw
   observations and explain any revision from initial candidates.
6. Replace proposed declaration snippets in `owners.md` with exact reviewed
   lines and verify every consumer-needed foreign type has a legal relay.
7. Reconcile the 104 instance leaves with the final contracts. Preserve IDs;
   if a semantic change is necessary, record it as an explicit plan revision.

## Matrix rows executed here

I2A-01: all four leaves.

## Verification

Run the probe tests/scripts on the named fixtures, validate their deterministic
raw artifacts, and inspect current sources rather than relying on the old Plan
3 draft. Validate all Markdown links, the plan/manifest schemas, unique instance
IDs and exact group/iteration counts. No production materialization case can
pass in this iteration.

## Exit criteria

The provider handoff, semantic contracts, declaration map, request/result
limits, failure behavior and measurement recipes are concrete and reviewed.
Every unresolved predecessor limit is explicit. Production work has no open
product decision.

## Handoff

Frozen contracts and raw probe paths go to iterations 2–4, which may execute in
parallel. The generated-name predicate is fixed before isolation code; detail
and projection bounds are fixed before their providers.
