# Iteration 2: Optional discovery pointers on existing records

**Plan:** [Plan 25](../main-plan.md). **Status:** planned.
**Prerequisite:** iteration 1 and its receipt.

## Owners and write boundary

Harness internal pointer shape, orientation/assignment/engineer/result schemas, record constructors and producer prose. Paths below are relative to `ramify-agent/`;
short owner-local paths are relative to `subs/harness/src/`.

## Goal

Preserve concise agent-declared source pointers through existing durable records.

## Read first

[Main plan](../main-plan.md), [instruction contracts](../instruction-block-contracts.md),
[execution rules](../execution.md), [testing specification](../../../testing.spec.md),
and `context-selection/submissions.ts`, `work/{assignment,engineer,iterations}.ts`,
assignment/result construction and recovery in `run/service.ts`, and
`prompts/packages.ts`.

## Deliverables

Implement main-plan section 1: optional `startingPoints` arrays containing
literal project-relative path and short agent note. Extend work orientation,
assignment and engineer completion/partial submissions and their retained records.
Include capability assignments using those same schemas. Keep legacy records
without the field readable and preserve their bytes/hashes.

Validate shape/path syntax, never semantic usefulness. Hints grant no write scope
or completion authority. Ask producers for useful locations already encountered;
add no compulsory discovery turn or completeness rule. Keep findings on existing
paths; do not mine prose/transcripts for pointers.

Update actual schema delivery and affected package versions together. New runs
capture expanded schemas; old intent replay retains its original schema and
validator identity. Preserve existing package/restart rules and same-name schema
conflict handling; do not implement a hot schema upgrade.

## Matrix rows executed here

D1, D2, D3 in the [acceptance matrix](../acceptance.md).

## Verification

From `ramify-agent/`:

```sh
npm run test:quick -- subs/harness/src/tests/plan25-discovery-records.test.ts subs/harness/src/tests/context-selection-submissions.test.ts subs/harness/src/tests/engineer-submission.test.ts subs/harness/src/tests/capability-assignments.test.ts subs/harness/src/tests/assignment-source-evidence.test.ts
npm run type-check
npm run check:self
```

Files beginning `plan25-` above are proposed new focused test files. Existing
selectors must be reconciled with configured discovery at implementation time.
Script Git, CandidateSource, Ramify, audit and process answers under the testing
specification. No intended intermediate failures remain at handoff.

## Exit criteria

Pointers survive ordinary/capability record round trips and recovery; absent fields work; no access, obligation or completion semantics change.

## Handoff

Stable optional pointer shapes and record origins for task consumers. Record source commit, checks and limits in `02-results.md`.
