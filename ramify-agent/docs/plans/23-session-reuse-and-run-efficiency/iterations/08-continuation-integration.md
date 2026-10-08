# Iteration 8: Integrate session operations and ordinary continuations

**Plan:** [Plan 23](../main-plan.md). **Prerequisites:** iteration 2, iteration 7.
**Status:** proposed; not executed.

## Owners and write boundary

Harness run/service.ts, run/records.ts, sessions/single.ts, invocation integration and related helpers/tests. No parallel shared runtime writer.

Confirm exact paths against [execution rules](../execution.md) before work begins.
No edits to another active iteration's files or the main checkout's index.

## Goal

Use the high-level session API for ordinary tasks and restoration without exposing adapter mechanics.

## Read first

[C1](../contracts.md#c1-session-identity-history-and-storage), [C3](../contracts.md#c3-prompt-and-workflow-inputs), receipts 1, 2 and 7, existing run/session recovery tests.

## Deliverables

Join run invocation identity/outcomes to session operations and durable storage. Migrate local-architect, capability-architect, engineer and contract continuing turns plus fresh initial and standalone entry points. Deliver current task/tool/environment and revision-bound briefing changes through the accepted builders.

Replace caller-side transcript/file reconstruction with high-level operations. Rebind validators/guards/current destinations and persist exact expected/source points and accepted outcomes. Loaded and restarted sessions use the same API.

Maintain explicit internal transitional callers only for fork sites owned by 9; do not claim them as preserving forks or enable mixed behavior in qualified delivery. Do not broaden fresh-recovery policy.

## Matrix rows executed here

W01, W02 in the [acceptance matrix](../acceptance.md).

## Verification

F1/F2 scripted run flows cover orientation→assignment→qualification/completion, capability nested qualification, engineer/contract repair and standalone fresh command. Restart at an accepted task outcome and an unfinished operation with exact task/submission expectations.

From `ramify-agent/` (new `plan23-*` files are deliverables of this iteration):

```sh
npm run test:quick -- subs/harness/src/tests/session-lifecycle.test.ts subs/harness/src/tests/plan23-continuing-work.test.ts subs/harness/src/tests/single-session.test.ts
```

Record focused outcomes and evidence limits in this iteration's receipt. The
integrator runs affected cross-boundary checks after merging accepted work;
final full configured qualification belongs to iteration 14.

## Exit criteria

W01–W02 pass and all ordinary continuation/fresh entry points use the new abstraction.

## Handoff

Runtime record contract and migration inventory naming every remaining fork site for 9. Record exact base/head, changed paths, commands and results in
`08-results.md`; do not create a passing receipt before executing the work.
