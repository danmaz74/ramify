# Iteration 3: Lifecycle capture and token-efficiency projection

**Goal:** capture the new evidence at the correct run boundaries and publish a
pure, additive `token-efficiency/1` query.

## Prerequisites

Iterations 1 and 2 complete.

## Work

1. Capture and commit `source-line-baseline/1` after the run's clean baseline
   and `ramify.measure/1` snapshot exist and before its first agent invocation.
2. After the passing final gate's accepted commit, capture a final
   `ramify.measure/1` snapshot and `delivered-change/1`. Commit them before
   `job-completed`.
3. A capture failure records unavailable evidence and does not reverse a
   passing final gate. Bind every attempt to the same baseline and accepted
   final commit.
4. Add crash points before and after each new external read and record commit.
   Recovery may repeat a read-only acquisition but creates one durable record
   and one transition.
5. Implement a pure token-efficiency projection that aggregates every
   invocation outcome and usage-accounting record, preserving identity groups,
   categories, subtotals and coverage. Use provider-reported `total` for `T`.
6. Compute `g(S0)`, `U` and `K` exactly as the policy specifies. Apply the
   completed, zero-change, unavailable and incomplete-run state rules.
7. Add `TokenEfficiencyResponse`, its strict schema, protocol path, harness
   query, HTTP handler and web client method for:

   ```text
   GET /api/v1/plans/:planId/runs/:runId/token-efficiency
   ```

   Keep the existing `/metrics` schema and payload unchanged.
8. Bound response evidence with the protocol's existing response-size
   discipline. A query writes nothing.
9. Implement the pure `context-limits/1` projection from invocation outcomes,
   context policy and compaction observations. Count automatic events, exact
   overflow-triggered compactions, budget returns, triggers and completion
   states by role; retain ordered occurrence details and coverage.
10. Add `ContextLimitsResponse`, its strict schema, protocol path, harness
    query, HTTP handler and web client method for:

    ```text
    GET /api/v1/plans/:planId/runs/:runId/context-limits
    ```

    Derive the action following each occurrence from durable run events. Keep
    explicit compactions outside the automatic total, and mark old Plan 3
    compaction-attempt coverage partial.

## Acceptance cases owned

TE10–TE15 and TE21–TE22.

## Exit evidence

- Recovery-table tests cover every new boundary.
- Formula tests use non-round inputs and assert exact unrounded results.
- Completed, `C = 0`, running, failed, incomplete-usage, mixed-model and old
  Plan 3 runs produce their specified states.
- A query over a completed run leaves the log and every record hash unchanged.
- Existing `/metrics` contract fixtures are unchanged.
- Context-limit projection cases cover every mechanism, every configured role,
  interrupted attempts, old runs and the difference between same-iteration
  reinvocation and a later iteration.
- The four standard project checks pass.
