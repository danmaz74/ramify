# Iteration 6: Cross-client acceptance and resource gate

**Plan:** [Plan 7: Affected modules](../main-plan.md).
**Prerequisites:** Iterations 1–5 complete, reviewed numeric budgets and completed Plan 5/4 provider regression commands.
**Owners:** Root integration tests, independent measurement/verification tooling, final documentation and roadmap handoff.

## Goal

Prove API, daemon, CLI and MCP equivalence and bounded on-demand work, then record complete feature evidence.

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

## Deliverables

1. Execute A7-15 on the actual reference project and chain/partial source
   fixtures. Compare selections, scope and coverage at matching input IDs
   across session, direct client, executable CLI and actual MCP. Verify live
   body-change propagation despite unchanged Plan 5 export descriptions.
2. Add `scripts/measurements/affected.mjs` and `measure:affected` with the
   exact source-shaped sparse/dense projection workloads and actual live
   reference/toolkit/admissible cross-module fixtures, 20 warmups/200 samples,
   raw output and reviewed latency/memory counters. Keep projection capacity
   distinct from live fact-budget admission. Separate startup, synchronization,
   ready query, process round trips, GC-settled heap and observed peak/RSS.
3. Measure temporary graph release, no graph construction on ordinary updates,
   repeated-query rebuilding, query/update contention and cancellation.
   Keep Plan 5 memory/hook gates binding; do not add hook graph work.
4. Complete the evidence validator's review/measurement/gate records and
   require all 88 case IDs at their declared levels. The completeness case
   is produced by the validator's inventory check, not accepted as its own
   prewritten passing input. Missing/stale/duplicate/unexecuted cases fail.
5. Run final gate commands in acceptance.md and the provider's bound extra
   regressions. Inspect owned temporary cleanup and preserve raw evidence.
   Resolve failures within their owning capability; record reviewed changes
   to any threshold or scope before claiming acceptance.
6. Write a completion report with exact versions, source/transport schemas,
   coverage limits, query/update/memory results and command statuses. Update
   roadmap and architecture/CLI documentation to implemented only after this
   strict gate passes; preserve deferred historical/test-execution/UI scope.

## Matrix rows executed here

A7-15, A7-16, A7-17 and full validation of every prior case.

## Verification

Run the complete command sequence in [acceptance.md](../acceptance.md#evidence-registration-and-final-gate)
using a fresh evidence directory. The full test run supplies JSON case evidence;
measure once under the bound protocol, then validate every ID and command
record. Additional reruns require a code change, failure or unresolved concern.
Review the final diff, package imports, actual process cleanup and predecessor
coverage. Planning/prototype measurements cannot replace integrated evidence.

## Exit criteria

All 88 cases and all binding predecessor/project gates pass with no skipped MCP or measurement work; numeric resource limits and lifecycle outcomes are evidenced. The final report is the plan completion authority.

## Handoff

Hand off supported graph semantics, API/client/CLI/MCP schemas, revision and coverage behavior, package exposures, finite case results and measured costs to test-runner integrations. Later visualization or caching requires its own scope.
