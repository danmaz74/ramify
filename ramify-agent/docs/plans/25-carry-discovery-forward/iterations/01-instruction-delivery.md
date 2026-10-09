# Iteration 1: Reusable instructions and exact-point session delivery

**Plan:** [Plan 25](../main-plan.md). **Status:** planned.
**Prerequisite:** iteration 0 and its receipt.

## Owners and write boundary

Harness task/brief builders, package prose, session-operation integration, narrow run callers and delivery tests. Paths below are relative to `ramify-agent/`;
short owner-local paths are relative to `subs/harness/src/`.

## Goal

Use the provider from iteration 0 to deliver instructions once and updates at the correct session occurrence.

## Read first

[Main plan](../main-plan.md), [instruction contracts](../instruction-block-contracts.md),
[execution rules](../execution.md), [testing specification](../../../testing.spec.md),
and `prompts/{tasks,packages,briefings,delivered-manifest}.ts`, role/procedure and
embedded-skill prose, `run/session-operations.ts`, packet binding in
`run/service.ts`, and existing continuation/fork/append tests.

## Deliverables

First declare explicit procedure families for every supported role/task pair,
including inline procedures. Render one block per environment field and the current
role/task/procedure selector. Use invariant set framing on first and replacement
delivery. Preserve whole-value replacement, null/empty clears, deterministic object
rendering and array order. Keep current tools/cwd/authority/validator/destination
bound independently of inherited explanatory text.

Then wire the corrected briefing occurrences and block resolver to the selected
point's actual `Context.inherited`. Write `/2` manifests/intents only after the
compatible readers are present. Retry original packets exactly, including `/1`.
Accepted named appends record both the unique append identity and logical section
key/effect. Prepared or uncommitted failures cannot create delivered ancestry.
Committed failure points retain their actual context. Preserve Plan 24 fallbacks.

Normalize recognizable legacy components without inventing physical deliveries;
when framing changes, deliver the current block once. Keep immutable tool names
and pinned role bodies. Update instructions that require the complete procedure
or environment in the latest message. Do not introduce pointer submission fields
until iteration 2.

The full runtime path must pass A → B → A with identical goal/requirements; a
pure resolver success alone is insufficient. Also cover named append, restart,
old-point forks and a task after replacement that appends no unchanged block.

## Matrix rows executed here

P01, P02, P03, P04, P05, P06, P07, P08, P09, S01, S02, S03, S04, S05, S06, S07 in the [acceptance matrix](../acceptance.md).

## Verification

From `ramify-agent/`:

```sh
npm run test:quick -- subs/harness/src/tests/plan25-task-packets.test.ts subs/harness/src/tests/plan25-block-sessions.test.ts subs/harness/src/tests/plan23-task-prompts.test.ts subs/harness/src/tests/plan23-fork-workflows.test.ts subs/harness/src/tests/plan23-continuing-work.test.ts
npm run type-check
npm run check:self
```

Files beginning `plan25-` above are proposed new focused test files. Existing
selectors must be reconciled with configured discovery at implementation time.
Script Git, CandidateSource, Ramify, audit and process answers under the testing
specification. No intended intermediate failures remain at handoff.

## Exit criteria

Actual packet, occurrence ancestry and manifest agree across fresh/continue/fork/append/retry. Historical packets and executable authority retain their contracts.

## Handoff

Working generic block delivery, family mapping, exact-message fixtures, session/restart receipts and compatible readers for discovery consumers. Record source commit, checks and limits in `01-results.md`.
