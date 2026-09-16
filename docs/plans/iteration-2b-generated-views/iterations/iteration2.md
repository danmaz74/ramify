# Iteration 2: Analysis invariance

**Plan:** [Plan 2B: Generated project views](../main-plan.md).
**Prerequisites:** Iteration 1.
**Owners:** `analysis/model`, `analysis` session query, `daemon/contexts` and
the daemon service's call into contexts. Independent of iterations 3 and 4.

## Goal

Make materialization unable to change analysis: restore the decision engine,
return the context queue to check requests only and remove input promotion
from the session query, while Plan 2A's API output stays identical.

## Read first

- [Analysis invariance](../scope.md#analysis-invariance),
  [session query](../contracts.md#session-query) and
  [context operation](../contracts.md#context-operation).
- `decisions.ts` at `71643d5` and now; `availability.ts` and its tests.
- `session-engine.ts` query and rehydration code, `session-messages.ts`,
  `session-worker.ts`, `session-host.ts`.
- `queue.ts`, `context.ts`, `context-manager.ts` at `71643d5` and now; the Plan
  2A contexts `api-view.test.ts`; `service.ts` materialize path.

## Deliverables

1. Restore `decisions.ts` byte for byte. Reimplement `listAvailableOriginals`
   over `explainImport` and prove output equality with Plan 2A's archived
   results for R and T.
2. Restore the check queue: remove the API entry kind and return `queue.ts`,
   `context.ts` and the check portions of `context-manager.ts` to pre-Plan-2A
   behavior. Record any remaining textual difference and why it is not on the
   check path.
3. Implement contexts materialization as one ordinary synchronized check
   followed by a session query at that sequence, with one retry on
   supersession inside the deadline. At this stage the session query is still
   `apiView`; iteration 5 renames it.
4. Remove input promotion from the session query. A recreated compiler
   compares content identities with the captured ones and returns `superseded`
   on any difference without changing session state.
5. Keep the service's publication lock and outcome mapping unchanged.

## Matrix rows executed here

I2B-02: all seven leaves.

## Verification

Focused model, session and contexts tests; the check-invariance harness case on
R and T; `git diff 71643d5 -- subs/analysis/subs/model/src/decisions.ts`;
`npm run type-check`. Do not build while iterations 3 or 4 run; the coordinator
builds after the group to run `I2B-02:plan5-equivalence`, the batch self-check
and `reference:verify -- --plan 2a`.

## Exit criteria

Decisions are restored, the queue carries only checks, the query observes
nothing, check results are identical with and without materialization, and the
API view output is unchanged.

## Handoff

The contexts materialization shape and the read-only query go to iteration 5.
