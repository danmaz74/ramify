# Iteration 3: Discovery handoffs through reusable briefing blocks

**Plan:** [Plan 25](../main-plan.md). **Status:** planned.
**Prerequisite:** iteration 2 and its receipt.

## Owners and write boundary

Harness starting-point rendering, architect/engineer/reviewer task callers, snapshot filtering and fresh fallback tests. Paths below are relative to `ramify-agent/`;
short owner-local paths are relative to `subs/harness/src/`.

## Goal

Deliver useful recorded discoveries to the correct downstream task through the shared block mechanism.

## Read first

[Main plan](../main-plan.md), [instruction contracts](../instruction-block-contracts.md),
[execution rules](../execution.md), [testing specification](../../../testing.spec.md),
and `work/{starting-inputs,session,engineer}.ts`, `context-selection/submissions.ts`,
`prompts/briefings.ts`, `reviews/message.ts`, actual current review-diff delivery
callers, and `run/service.ts` task construction.

## Deliverables

Implement main-plan section 2 except NFR wiring. Fresh engineers receive
assignment pointers; local architects receive the engineer result; reviewers
receive pointers associated with their exact assignment/result/candidate. Fresh
selector/architect fallbacks reuse available orientation records. Retaining forks
inherit orientation pointers without unnecessary repetition.

Use a named starting-points block and deterministic exact-pair coalescing with
origin preservation. Workspace and snapshot path conventions remain distinct.
Filter inaccessible generated/run data with the existing consumer source policy;
missing optional hints do not fail tasks. Do not broaden read/write authority.

Apply C2/C6 for replacement, withdrawal, reintroduction and occurrence identity.
Exercise actual task/session construction for pointer A → B → A and withdrawal
→ reintroduction, followed by an unchanged turn. Cover old-point forks, parent/
sibling isolation, available records after context loss and accepted named appends
across restart/retry. Keep current review-diff delivery rather than restoring
redundant inspection behavior from an older source snapshot.

## Matrix rows executed here

D4, D5, D6, D7, D11, I01, I02, I03, I04 in the [acceptance matrix](../acceptance.md).

## Verification

From `ramify-agent/`:

```sh
npm run test:quick -- subs/harness/src/tests/plan25-discovery-delivery.test.ts subs/harness/src/tests/context-selection-runtime.test.ts subs/harness/src/tests/engineer-briefing.test.ts subs/harness/src/tests/plan23-task-prompts.test.ts subs/harness/src/tests/review-attempts.test.ts
npm run type-check
npm run check:self
```

Files beginning `plan25-` above are proposed new focused test files. Existing
selectors must be reconciled with configured discovery at implementation time.
Script Git, CandidateSource, Ramify, audit and process answers under the testing
specification. No intended intermediate failures remain at handoff.

## Exit criteria

Fresh and inherited consumers get correct task-specific pointers once, with unchanged prefix, source provenance and scope. Combined I01–I04 have evidence.

## Handoff

Reusable pointer rendering/filtering and complete ordinary-consumer regression fixtures for NFR integration. Record source commit, checks and limits in `03-results.md`.
