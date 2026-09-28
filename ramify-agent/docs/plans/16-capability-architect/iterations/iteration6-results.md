# Iteration 6 results: capability coordination views

**Status:** implemented in the isolated worktree, with local protocol, HTTP and browser component checks. Changes remain uncommitted for root review. Production browser and live-model witnesses remain iteration 7 gates.

## Baseline and ownership

- Started from `d96a965f85dd5edf50aa43d4b1d1f38831702fd3` in `/tmp/ramify-plan16-capability-architect`; `/ramify` was not edited. Harness protocol, projections and HTTP changes were made before web presentation changes. Root separately edited `ramify-agent/module.ramify` to re-expose the new protocol symbols; that edit is included in the checks below and was not made by this iteration's subagent.
- Read the Plan 16 main plan, contracts, acceptance matrix, iteration 6 brief, prior results and [iteration 5 projection handoff](iteration5-projection-fixtures.json), plus local instructions and the iteration-work skill. Refreshed web's ordinary and testing generated API views with `node_modules/.bin/ramify materialize --view api --from subs/web --root .` before importing public harness types. The generated views were neither edited nor imported.

## Implemented behavior

- The harness exposes a browser-safe `capability-tasks/1` response and `GET /api/v1/plans/:planId/runs/:runId/capability-tasks?version=N`. It projects committed requests, original need and source snapshot, plan revision/design/use-case coverage, owner assignments and interruptions, consultations, checks/reviews, nested dependency stack, deferred work, accepted handback and terminal failure. The reducer supplies task status; the immutable committed record bodies supply detail. An unsupported task record version produces an explicit `unsupported-version` response, and a stale run version produces `stale-version`.
- Session and event projections carry typed capability task, request and assignment references. A capability architect session reaches its task and recorded assignment owner; the execution and transcript views label the role and association. Task IDs remain distinct from registry capability and module-capability IDs. A handback closes its task without marking A's original assignment or B's separate queued entry complete.
- The Run page has a **Capability tasks** tab. It shows current coordination and why a task is blocked without requiring record JSON or transcript scanning. The UI displays provisional failures, pending real verification, revised use-case coverage and handback. Its query key includes the committed run version, so a delayed older response cannot replace the newer task/plan state. An old contract run shows an empty task view and retains its historical contract views.

## Executed evidence

| Check | Result | Limit |
| --- | --- | --- |
| Affected harness suite: `capability-tasks-projection`, `capability-dependencies`, `run-projections`, `protocol-contract`, `execution-map-projection`, `http`, `projections-pure` | 7 files, 82 tests passed in 145.26 s before the last handback assertion. The new projection file was then rerun: 8/8 passed in 2.08 s. | Scripted and constructed fixtures; the service dependency test uses the real ledger, local checks and Git with scripted agents. The full affected set was not repeated after adding only the final projection assertion. |
| `npx vitest run subs/web/src/tests` | 17 files, 180 tests passed in 7.17 s. | Browser components in jsdom, not the production served browser. |
| `npm run type-check` | Passed for main, web and script TypeScript projects. | Local compile check. |
| `npm run check:self` | Passed: 0 errors, 0 warnings, 315 analysis limits; partial coverage over 12 owners, 549 source files, 51 resources and 11,102 accesses. | Partial analysis coverage remains. |
| `npm run build:web` | Passed: 636 modules transformed; 1,096.50 kB JS bundle. Vite reported its chunk-size warning. | Bundle creation, not a served browser witness. |
| `git diff --check` | Passed with no output. | Uncommitted worktree. |

The first full web run had four failures because an existing execution-modules test client lacked the new protocol method. After updating that mock, one assertion still matched two status elements; it was narrowed to the module-tree failure text. The final full web run passed 180/180. The projection tests exercise a durable ledger reopen, nested B→C stack, failed unfinished request, task/registry identity, HTTP stale and unsupported versions, and a committed handback. A historical `contract/2` fake-backed record remains parsed with its original mode and fake artifact, while its capability-task response is empty. This demonstrates historical decoding and inspection; it does not certify old-run resumption.

## Acceptance status and remaining gates

- **CA23:** API and browser component cases cover a suspended A request, active task, unanswered and answered consultation, provisional assignment/type failure, plan revision, pending/failed verification, nested dependency and accepted handback. The actual production-served browser transition is deferred to iteration 7.
- **CA24:** Historical fake-backed contract record readability and old Run page presentation are covered. New-run retirement of contract-engineer dispatch, policy/version capture and explicit refusal to resume an incomplete old run under the new workflow are iteration 7 work. No old fake verdict is reinterpreted as a real capability handback.
- **CA34:** Task, request and assignment references are typed separately from registry capability identity. The projection and browser tests keep B's separate entry deferred after handback. The capability-task view does not synthesize a link to a similarly named registry capability.
- The current tests establish projection and component behavior using scripted/constructed fixtures. They do not establish live model judgment, final semantic acceptance, full audit parity or the served-browser witness.

## Browser handoff for iteration 7

Serve the production web build against a run produced by the production-composed harness. For a run of the capability fixture plan `need`, open `#/plans/need/runs/<run-id>` and select **Capability tasks**. Its versioned API is `/api/v1/plans/need/runs/<run-id>/capability-tasks?version=<run-version>`. The Run page's **Execution map** and **Sessions** tabs, plus `#/plans/need/runs/<run-id>/sessions/<session-id>/chapters/<invocation-id>`, are the companion identity/reconstruction routes. Capture the actual run and session IDs from the service; the iteration 5 fixture JSON names expected checkpoints but is not itself a served run.

At the request/delegation checkpoint, expect A's work item to remain suspended and `wi-001 → cap-001` to be the coordination stack. During consultation and repair, expect the unresolved answer, assignment interruption/type failure and pending or failed real verification to remain visible on the same task, with the correct plan revision. For nested B→C, expect `wi-001 → cap-001 → cap-002`, with B's assignment suspended and C active. At C handback, expect the stack to return to `wi-001 → cap-001`; at X handback, expect only the task to be handed back while A's original assignment and B's separate queued entry retain their own status. Check that a delayed older HTTP response cannot replace a newer plan revision. Open an old contract run through the same Run route to verify its contract/fake history remains readable and its task tab reports no capability request. Attempting to execute that incomplete old run should explicitly refuse the unsupported workflow after iteration 7 retires the old path.
