# Iteration 0: Block identities, compatible readers and briefing occurrences

**Plan:** [Plan 25](../main-plan.md). **Status:** planned.
**Prerequisite:** clean committed base containing Plans 23/24.

## Owners and write boundary

Harness block resolver, manifest/intent readers and briefing occurrence model; no runtime writer switch. Paths below are relative to `ramify-agent/`;
short owner-local paths are relative to `subs/harness/src/`.

## Goal

Provide exact block resolution and occurrence-aware briefing updates before changing live packet delivery.

## Read first

[Main plan](../main-plan.md), [instruction contracts](../instruction-block-contracts.md),
[execution rules](../execution.md), [testing specification](../../../testing.spec.md),
and `prompts/delivered-manifest.ts`, `prompts/briefings.ts`, `prompts/tasks.ts`,
`run/session-operations.ts` Context/Intent and append paths,
`interfaces/protocol/runs.ts`, and the strict manifest projection consumers.

## Deliverables

Record the clean base and baseline audit. Add the owner-local block resolver and
optional logical key/effect metadata. Prepare `/1` and `/2` manifest/intent readers
before new writers; preserve legacy hashes and exact retained bytes.

Correct the briefing algorithm to distinguish content hashes from occurrence IDs.
Retain actual ancestry order and canonical goal/requirement checks. A1 → B2 → A3
must create a later occurrence of A. Extend types/readers and pure update logic
here; runtime occurrence creation is wired in iteration 1. One existing algorithm
owns revision selection; do not create a second history or delivery database.

Use hand-authored old/new wire and history fixtures. Define stable rendering/hash
interfaces for C2 before consumers are written. Leave production packet writers
on their current behavior until the next iteration.

## Matrix rows executed here

B01, D01, D02, D03, D04, D05 in the [acceptance matrix](../acceptance.md).

## Verification

From `ramify-agent/`:

```sh
npm run test:quick -- subs/harness/src/tests/plan25-blocks.test.ts subs/harness/src/tests/plan23-task-prompts.test.ts subs/harness/src/tests/plan23-observation-integration.test.ts
npm run type-check
npm run check:self
```

Files beginning `plan25-` above are proposed new focused test files. Existing
selectors must be reconciled with configured discovery at implementation time.
Script Git, CandidateSource, Ramify, audit and process answers under the testing
specification. No intended intermediate failures remain at handoff.
Run the configured baseline audit and record its outcome under execution.md.

## Exit criteria

Latest set/removal and repeated content resolve correctly; old/new readers pass. No runtime switch, rewritten historical evidence or unrecorded baseline failure.

## Handoff

Resolver/rendering interfaces, occurrence model, consumer inventory and legacy/new wire fixtures. Record source commit, checks and limits in `00-results.md`.
