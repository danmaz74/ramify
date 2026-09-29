# Plan 16 implementation report

**Status:** implementation in progress; Plan 16 is not accepted as of 2026-09-29. The [main plan](main-plan.md), [acceptance matrix](acceptance.md), [iteration handbacks](iterations/README.md) and [iteration 7 result](iterations/iteration7-results.md) are the controlling evidence.

## Implemented and checked

The isolated branch `feat/plan16-capability-architect` contains the production policy/5 capability workflow: durable request/task/plan/assignment records, one active depth-first capability stack, direct A consultation, owner-scoped engineer assignments, combined verification and review, verified handback and reconstruction. New-run composition replaces contract-engineer dispatch. Historical records remain readable and an incomplete historical run is refused on reopen. The API and served web view expose the coordination state. Iterations 1–6 have committed result records; iteration 7 has the live result above.

The baseline full audit passed at `d957b286` (ID `e9078690-222d-4818-a4c8-d594125d5437`). The six-check Plan 16 audit passed at `491e3fd5` (ID `b6c64ea4-4225-4327-8b37-59361eafa0a0`), before follow-up commits. On isolated follow-up revision `ff6e1c5e`, a crash-boundary suite passed 28/28 tests. A revision-2 reviewer replay test failed on the earlier `491e3fd5` baseline because accepted reviewer starts grew from 9 to 12 after restart; the fix kept them at 9 and yielded one review/handback. CA26 targeted tests passed 3/3 and the complete capability-delegation file passed 11/11. The dedicated CA24 historical-run test passed 1/1. Type-check, `check:self` (zero errors/warnings, 315 analysis limits, partial coverage) and diff check passed for the follow-up changes. A full audit of the integrated final revision remains required.

## Live acceptance

Ten production Pi starts are inventoried in [iteration 7](iterations/iteration7-results.md). CA35 failure handling passes on retry 2. CA27 delivery remains open after retry 5 ended at ledger v171 from the provider usage limit, with four pending scenarios, no semantic review, no handback and no A continuation. Retry 5's combined gate failed root tests before the provider limit; its scoped Analysis/CLI tests, type-check and Ramify check passed. The archive retains prompts, plan revisions, source identities, invocation results, checks, browser captures and run timings. No temporary coordinator source edit substitutes for a production handback.

## Open acceptance

- CA27 needs a fresh bounded real Pi run on the final audited source revision through explicit handback and A continuation, including the four tracked scenarios and a final served-browser capture. The provider reported a usage limit on 2026-09-29, so a new Pi run cannot be claimed now.
- CA20 needs durable process-group registration through the shell runner and service, plus a process-level restart witness. Draft work is isolated and unintegrated.
- CA26 needs a dedicated capability repair-round exhaustion witness. The other follow-up limit witnesses are recorded in [iteration 5's addendum](iterations/iteration5-recovery-followup-results.md).
- A full Plan 16 audit must pass on the eventual final implementation/documentation revision. The existing passing audit is bound to `491e3fd5` only.

No merge or deployment is claimed.
