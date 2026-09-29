# Plan 16 implementation report

**Status:** implementation in progress; Plan 16 is not accepted as of 2026-09-29. The [main plan](main-plan.md), [acceptance matrix](acceptance.md), [iteration handbacks](iterations/README.md) and [iteration 7 result](iterations/iteration7-results.md) are the controlling evidence.

## Implemented and checked

The isolated branch `feat/plan16-capability-architect` contains the production policy/5 capability workflow: durable request/task/plan/assignment records, one active depth-first capability stack, direct A consultation, owner-scoped engineer assignments, combined verification and review, verified handback and reconstruction. New-run composition replaces contract-engineer dispatch. Historical records remain readable and an incomplete historical run is refused on reopen. The API and served web view expose the coordination state. Iterations 1–6 have committed result records; iteration 7 has the live result above.

The baseline full audit passed at `d957b286` (ID `e9078690-222d-4818-a4c8-d594125d5437`). The six-check Plan 16 audit passed at `491e3fd5` (ID `b6c64ea4-4225-4327-8b37-59361eafa0a0`), before follow-up commits. On isolated follow-up revision `ff6e1c5e`, a crash-boundary suite passed 28/28 tests. A revision-2 reviewer replay test failed on the earlier `491e3fd5` baseline because accepted reviewer starts grew from 9 to 12 after restart; the fix kept them at 9 and yielded one review/handback. CA26 targeted tests passed 3/3 and the complete capability-delegation file passed 11/11. The dedicated CA24 historical-run test passed 1/1. The CA20 process-registration branch passed 37/37 runner, writer and recovery tests, full type-check and `check:self` before integration. A full audit at `7fa522fa` failed one static test-inventory check (ID `71cbb691-9ab4-45be-891d-fbca94a94abd`); commit `ae86c25a` restored the literal test titles, and the inventory check and affected recovery cases passed. A full audit at `3664a71d` passed five checks but found one stale event-inventory fixture in the agent test suite (ID `0055115a-50ca-47e0-8495-3ef422ea5796`). The fixture is updated and its test file passes 41/41. The `717be6f4` audit passed five checks but its agent suite timed out at 15 minutes after reporting a CA26 preview failure (ID `84b1c67c-4f90-440d-bddc-68f27e4de152`). The preview case passed alone; its stop now retries stale versions, and the full-suite timeout is 20 minutes. A full audit of the final revision remains required.

## Live acceptance

Ten production Pi starts are inventoried in [iteration 7](iterations/iteration7-results.md). CA35 failure handling passes on retry 2. CA27 delivery remains open after retry 5 ended at ledger v171 from the provider usage limit, with four pending scenarios, no semantic review, no handback and no A continuation. Retry 5's combined gate failed root tests before the provider limit; its scoped Analysis/CLI tests, type-check and Ramify check passed. The archive retains prompts, plan revisions, source identities, invocation results, checks, browser captures and run timings. No temporary coordinator source edit substitutes for a production handback.

The post-run reference comparison used the exact retry-5 accepted base and candidate commits with the same build and reference commands. Both had the same nine failing test names. The live candidate checkout had one additional self-test failure caused by ignored generated API-view files; that self-test passed 2/2 in a fresh worktree at the candidate commit. The [iteration 7 result](iterations/iteration7-results.md) records the source identities, counts and logs. Reference parity on the nine shared failures is evidence of their presence on both revisions, not clean acceptance of either revision.

## Open acceptance

- CA27 needs a fresh bounded real Pi run on the final audited source revision through explicit handback and A continuation, including the four tracked scenarios and a final served-browser capture. The provider reported a usage limit on 2026-09-29, so a new Pi run cannot be claimed now.
- CA20 has a Linux process-level restart witness with durable group registration and authenticated cleanup. On platforms without a kernel process-start identity, recovery fails closed without signalling an unauthenticated PID; cleanup on those platforms remains unverified.
- CA26's dedicated combined-gate repair-bound witness passed. Its scripted scope and the other limit witnesses are recorded in [iteration 5's addendum](iterations/iteration5-recovery-followup-results.md).
- A full Plan 16 audit must pass on the eventual final implementation/documentation revision. The existing passing audit is bound to `491e3fd5` only.

No merge or deployment is claimed.
