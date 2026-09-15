# Iteration 1: Contract review and Plan 5 handoff

**Plan:** [Plan 7: Affected modules](../main-plan.md).
**Prerequisites:** Completed Plan 5 retained-session, worker and context provider evidence. Plan 4 MCP availability is recorded separately; its absence does not block core contract review.
**Owners:** Plan 7 documentation and provider inventory; no runtime source changes.

## Goal

Bind the on-demand query to actual retained facts and review a complete, implementable contract without changing the active Plan 5 workflow.

## Read first

- [Main plan](../main-plan.md): user workflow, on-demand choice and scope.
- [Contracts](../contracts.md) and [owners](../owners.md): query semantics,
  readiness, lifecycle, public types and exact exposure additions.
- [Acceptance](../acceptance.md) and [case inventory](../cases.json): this
  iteration's finite expectations and required evidence levels.
- [Plan 5 contracts](../../iteration-5-fast-incremental-checks/contracts.md),
  [scope](../../iteration-5-fast-incremental-checks/scope.md) and its completed
  provider handoff; preserve its accepted session/freshness contracts.
- [Testing guide](../../../development/testing.md) and the current source/tests
  of the owners named below; inspect provider versions before editing.
- [Data assessment](../data-assessment.md) and [strategy comparison](../storage-strategy-comparison.md), including raw probe provenance.

## Deliverables

1. Refresh [data-assessment.md](../data-assessment.md) against the completed
   provider commit. Inspect inventory, accesses, original.owner, forwarding,
   explicit shim lists, coverage, readiness and worker publication/queue paths.
   Record what survives compiler release and how invalid current inputs block
   queries. Preserve the provenance of earlier prototype results.
2. Review the concrete contracts: exact IDs, module traversal, type/test/shim
   inclusion, current-only freshness, partial fallback and no hook use. Confirm
   on-demand graph construction with no retained graph, cache or contribution
   bookkeeping. Distinguish user requirements from reviewed design decisions.
3. Bind the private fact-view access and any small readiness-record addition
   to named analysis publication sites for iteration 2. If dependency evidence
   is absent, specify the producer, field and acceptance case before consumer
   implementation; do not silently introduce new compiler work.
4. Reconcile [owners.md](../owners.md) with actual Plan 5 declarations and
   package entries. Verify every foreign type's exposure, existing wildcard
   coverage, testing placement and purpose additions. Record the Plan 4 SDK,
   registration, stdio/client and lifecycle handoff needed by iteration 5.
5. Review numeric budgets using the existing source/strategy evidence. Bind
   host/runtime, an admissible real cross-module workload, and Plan 5/4
   regression commands; record evidence for any
   threshold revision before acceptance. No new benchmark is required merely
   to repeat unchanged algorithm/storage measurements.
6. Produce the provider review artifact for A7-01, with exact source paths,
   commit IDs, accepted contracts and any remaining prerequisite explicitly
   assigned. Keep implementation cases unexecuted.

## Matrix rows executed here

A7-01: retained-fields, readiness, consumer-access.

## Verification

Inspect the actual completed provider sources and relevant acceptance results.
Re-run `probes/source-facts.mts` if the producer shape/semantics changed; record
its batch-only limit. Validate Markdown links, JSON schemas, the 88-case inventory
and exact declaration additions. Review readiness without calling a full report.
No runtime query test can pass in this documentation iteration.

## Exit criteria

The provider view, readiness, semantics, exposure paths and measurement protocol are concrete and reviewed. Missing providers remain explicit prerequisites; no design decision is falsely labelled implemented.

## Handoff

Reviewed contracts/owners, provider artifact and resource workload protocol go to iteration 2. The Plan 4 registration/client/harness handoff remains a named prerequisite for iteration 5.
