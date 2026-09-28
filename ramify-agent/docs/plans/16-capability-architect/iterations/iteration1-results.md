# Iteration 1 results: durable capability records and authority

**Status:** implemented and locally verified in the isolated execution
worktree; later orchestration, final audit and acceptance remain open.

## Baseline and precursor

- The separate version-4 contract procedure precursor was reviewed and
  committed at `b625fa70`. Its reported focused 25 tests, type-check and
  `check:self` passed before Plan 16 execution. Iteration 7 owns its
  retirement from new-run prompts while preserving historical records.
- The clean execution baseline was
  `d957b2861f3d9436e04a73232fa2ef7f7a02a897`. `git status --short`
  printed nothing before iteration 1 edits. Unrelated original-checkout
  changes stayed outside this worktree.
- The baseline audit passed for source commit `d957b286` under audit ID
  `e9078690-222d-4818-a4c8-d594125d5437`, run ref
  `refs/audited/runs/2026-09-28T09-16-29Z-d957b2861`. Its six checks passed:
  patch integrity, agent type-check, agent tests, agent structure, parent
  daemon test and web build. This is baseline evidence, not an audit of the
  iteration 1 changes.

## Implemented scope

- Added harness-owned `capability/records.ts` schemas and materialization
  paths for immutable requests, tasks, plan revisions, exchanges, task-owned
  assignments and handbacks. Request and example IDs are stable; the
  request survives plan changes. A request has a separate pending path until
  qualification decides whether a task exists.
- Added action and plan-update schemas plus shared, pure validation for
  preview and final submission. Structural field errors and stale authority
  errors are separate; semantic judgments remain agent decisions. A plan
  revision builder retains original examples and existing cases.
- Added replayable capability transitions for the active coordinator,
  depth-first parent/child stack, consultation, assignments, verification,
  stop and handback. An unfinished or failed assignment and an active child
  block handback. Added task-owned assignment numbering and captured
  `run-policy/5` limit helpers; work items and tasks count toward one work
  unit bound.
- Added capability event variants to the existing run log, event descriptions,
  invocation work links and committed-record projection. The transaction
  helper validates the event and its immutable bodies, then commits them
  through the real ledger. Historical contract and work-item schemas remain
  readable and unchanged.
- Updated the contract appendix with concrete internal exports and the
  request-path choice. [Reviewed model wording](01-model-wording.md) records
  exact principle, glossary and architecture replacements for iteration 7.
  Current production principles were not changed before rollout.

## Executed checks

| Evidence | Command and result | Limit |
| --- | --- | --- |
| CA01, CA11, CA16, CA29, CA34 and transition/ledger controls | `npx vitest run subs/harness/src/tests/capability-records.test.ts subs/harness/src/tests/capability-submission.test.ts subs/harness/src/tests/capability-state.test.ts`: 3 files, 14 tests passed | Structural and scripted record evidence; it does not establish semantic provider or consumer acceptance. |
| Nearby historical behavior | `npx vitest run subs/harness/src/tests/work-items.test.ts subs/harness/src/tests/run-protocol-materialization.integration.test.ts subs/harness/src/tests/contract-delegation.test.ts subs/harness/src/tests/run-recovery.test.ts`: 4 files, 42 tests passed | Existing-path regression evidence only. |
| Type contracts | `npm run type-check`: passed | Includes agent, web and script TypeScript scopes. |
| Ownership and imports | `npm run check:self`: passed, 0 errors, 0 warnings, 312 analysis limits across 12 owners | Coverage is partial because of reported analysis limits. |
| Diff whitespace | `git diff --check`: passed | Applies to tracked diffs; new files were also reviewed for trailing whitespace. |

An intermediate type-check failed on a readonly array in a new test fixture.
The fixture was corrected, then type-check passed. No production defect was
attributed to that failure.

## Handoff and remaining limits

Iteration 2 can use `commitCapabilityTransition`,
`buildCapabilityPlanRevision`, `validateCapabilityAction`,
`replayCapabilityState` and the small builders in
`subs/harness/src/tests/helpers/capability.ts`. Its scripted project fixture
must exercise actual writer settlement, source capture, qualification,
one fresh capability architect and deferred frontier scheduling. These
records and reducers alone do not enable production dispatch or prove the
real provider/consumer gate. The production constructor still uses its
previous workflow policy; the `run-policy/5` factory is reserved for the
controlled implementation path before rollout.
