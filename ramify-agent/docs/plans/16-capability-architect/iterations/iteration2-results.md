# Iteration 2 results: request, delegation and fresh context

**Status:** implemented and locally verified in the isolated execution worktree. The changes are uncommitted for review. Later coordination, recovery, production rollout, final audit and acceptance remain open.

## Baseline and fixture

- Started from clean committed handoff `7d6c232829c6ab51c4a237e947de37ee81ea529a`. The earlier source audit passed for `d957b286` at `refs/audited/runs/2026-09-28T09-16-29Z-d957b2861`; it does not audit this iteration's tree. The unrelated source checkout was untouched.
- Added independent `fixtures/capability-coordination/` (A, B, D and P) and `fixtures/capability-coordination-nested/` (adds C), including requirement plans, package metadata, TypeScript configuration and source/tests. Harness helpers copy these into temporary Git repositories. The delegation test uses the first fixture through the real run service, writer, ledger, selector, agent session and gate paths.
- Looked for generated foreign API views in `subs/harness/src/.ramify/{external,children}` before new cross-owner use. No generated view was present. This iteration used existing local service interfaces and introduced no child-module cross-owner API.

## Implemented scope

- A capability-mode engineer submission reports `capability-needed` with original need, use, constraints and examples. The harness retains the requesting engineer session and A's provisional edits, settles the writer, and captures accepted base, index, worktree and untracked/deleted bytes in a durable source snapshot. The original example receives a stable request-scoped ID.
- A local architect qualifies the need. Existing API guidance resumes the same engineer session. Placement and unresolved questions use the existing global architect fork and return to the same local architect session for a decision. Registry identity is supplied as a clue, not as an automatic semantic answer.
- Delegation commits the request/task/plan through the ledger, retains A's parent session, and starts one fresh capability architect. Its first prompt includes the original request, current plan, live source path, selected plan package, provider entry outline and recorded B ownership decision. An expanded A/B owner set reuses the existing context selector; the feature catalog remains frozen. A later turn continues that coordinator session with the selected package hash and progress, without repeating its body.
- The active capability stack prevents the ordinary B frontier from dispatching while X owns the work. The B entry remains a distinct recorded work item and is listed as deferred in the task. A test-only workflow factory and policy/5 constructor expose the behavior to fixture tests; public `RunService.open` rejects policy/5 before production rollout.
- Added the capability architect and capability-mode engineer prompt packages, tool descriptions, role context policy and protocol lineage. Production runs still use the historical engineer package and `contract-needed` path.

## Executed checks

| Evidence | Command and result | Limit |
| --- | --- | --- |
| Real service delegation and source | `npx vitest run subs/harness/src/tests/capability-delegation.test.ts`: 1 file, 5 tests passed | Scripted agent and independent Git fixtures; model judgment and provider implementation are not established. |
| Nearby regression and vocabulary | `npx vitest run subs/harness/src/tests/work-items.test.ts subs/harness/src/tests/run-protocol-materialization.integration.test.ts subs/harness/src/tests/contract-delegation.test.ts subs/harness/src/tests/context-selection-runtime.test.ts subs/harness/src/tests/capability-records.test.ts subs/harness/src/tests/capability-state.test.ts subs/harness/src/tests/union-values.test.ts`: 7 files, 66 tests passed | Existing behavior and schema consistency. |
| Type contracts | `npm run type-check`: passed | Agent, web and script TypeScript scopes. |
| Ownership and imports | `npm run check:self`: passed; 0 errors, 0 warnings, 312 analysis limits over 12 owners | Partial coverage from the tool's reported analysis limits. |
| Whitespace | `git diff --check`: passed | Tracked diff; new files were also reviewed. |

The scripted prompt assertion proves a fresh first coordinator session, a continued second turn in the same session, full package delivery on the first turn, a hash/reference on the second, and B's recorded decision in the first. Reconstruction with a full current package is owned by iteration 5. The nested fixture is prepared for depth-first exercise in iteration 5; this iteration proves the active stack blocks the unrelated B frontier but does not execute a nested C task.

## Iteration 3 handoff

Use the captured A/B scripted prompt and suspended session/task fixture in `subs/harness/src/tests/capability-delegation.test.ts` and `subs/harness/src/tests/helpers/capability.ts`. The capability architect currently submits a validated action, but the service parks the active task after non-partial actions. Iteration 3 must execute consultation and owner assignments, resume the same coordinator after responses, and preserve its captured action authority. Iterations 4–5 own real provider/consumer gate and recovery/handback execution.

Historical `contract-needed` branches still to retire in iteration 7: the default engineer submission list and validation in `work/engineer.ts`; the production engineer package and contract-engineer package in `prompts/packages.ts`; `takeIteration`'s contract dispatch and `takeContract`/contract-engineer continuation in `run/service.ts`; and the standalone historical engineer submission type in `sessions/single.ts`. Their records remain readable for earlier runs.
