# Iteration 4: verification, repair and explicit handback

[Plan 16](../main-plan.md) · [Contracts](../contract-appendix.md)

## Prerequisites and owners

Iteration 3. Scope: harness internals; use existing evidence, audit and review
interfaces. The candidate and scope evidence must exist before gates run.

## Goal and read first

Require a usable real capability before returning control to A. Read
`run/gates.ts`, `run/service.ts:iterationGate/workItemGate`, `reviews/`,
`checks/`, `run/mutations.ts`, `run/merge-readiness.ts` and `work/declarations.ts`
under `subs/harness/src/`. Reuse existing gate/review execution and finding
authority; capability acceptance supplies its goal and evidence associations.

## Deliverables

- Track each original example's disposition and executed evidence without
  inferring semantic coverage from test names. Adapt test representation when
  APIs change, retaining behavior and reasons for corrected expectations.
- Support provisional multi-owner migration: preserve failed checks, run
  separately guarded repairs, then review/check the combined candidate before
  its accepted checkpoint. Include inherited A edits with their original scope
  attribution; an A preparation repair has its own assignment. Never hide a
  type failure as expected success or close A's original goal at this checkpoint.
- Require explicit results for participating engineer assignments, real
  provider/consumer checks, compatibility and applicable review outcomes.
  Reuse code/scope/design review and reconciliation machinery with X's context.
- Return repair findings to the same capability architect. Validate candidate,
  plan and configuration identity before accepting evidence.
- Commit a handback exactly once and deliver current result/use guidance to
  the suspended A-architect and A-engineer. Later revision requests preserve
  historical acceptance and identify what changed.
- Replace new-run work-item completion refusal based on fake requirements and
  provider obligations with the appendix's unresolved-request/task-handback
  predicate. Check it at submission and at completion commit, including
  reopened tasks and nested children. Preserve all other completion gates.
- Return intervening changes to deferred B entries for replanning. A task
  handback never completes the provider's independent entry work item. Keep
  follow-up work explicit when previously accepted guarantees need revalidation.

## Verification and exit criteria

Add `capability-acceptance.test.ts` and a real fixture integration test for
CA08, CA11–CA15, CA17, CA25, CA28, CA30 and CA31. Test fake success with real failure, scripted
semantic rejection of circular expectations, cross-owner type migration and
source changes after a passing check. Run per-iteration checks.

Exit: false/incomplete completion attempts fail with usable feedback, and a
correct real result returns A to its interrupted work without duplicate gates
or reopening old accepted evidence as if it were current.

## Handoff

Provide complete success and repair traces, accepted source identities and
the state boundaries where iteration 5 must inject crashes.
Write `iteration4-results.md` following the [iteration index](README.md).
