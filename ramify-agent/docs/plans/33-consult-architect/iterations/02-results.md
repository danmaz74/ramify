# Iteration 2 results: advisory tool and nesting

**Status:** accepted by the coordinator after review of actual behavior, tests, diff and retained evidence on source commit `3fce0649f59421bd9953865ac0d2c2f6cab1003c`; C05–C12 pass. Inspection, capability-assignment integration (C17), Pi transport (C18) and final configured qualification remain iterations 3–4.

Worktree `/home/app/ramify-plan33-consult-architect`, branch `feat/plan33-consult-architect`. Prerequisite HEAD `2462b4a709b074f460236f9570ca626117af64eb` contains coordinator-accepted iteration 1. Source commit `3fce0649f59421bd9953865ac0d2c2f6cab1003c` contains only iteration 2's authorized changes. No other checkout, dependency installation, scheduler or source snapshot machinery changed.

## Behavior and evidence

| Case | Actual evidence |
| --- | --- |
| C05 | `consultation-tools.test.ts` forks real neutral local and capability points, after later parent appends, for independent repeated questions. Literal question/answer whitespace survives; each fork excludes later parent updates and prior consultation answers. The same caller resumes and submits its ordinary task. Capability equipment has only read/grep/ls and the answer tool. |
| C06 | `consultation-workflows.test.ts` executes a local → global call and an actual normal workflow's local orientation consultation. The normal workflow's context selectors have no consultation tool; recorded constructors and runtime declarations agree. |
| C07 | The real runner/neutral chain engineer → local → global → local → engineer completes through awaited tools with three distinct identities. The local composes its answer. Global's attempted additional consultation returns an inactive-tool error. The global question contains the local's supplied facts, with no invented inheritance of its investigation. |
| C08 | Dedicated advisory procedure and current answer task replace active inherited submissions. Attempts to write, submit an old assignment or update the capability plan return errors. Actual original parent checkpoints are unchanged by consultation. Equipment starts no process, refresh or materialization; no semantic advice validator was added. |
| C09 | Separate invalid-source, unavailable-source, provider-failure and answer-exhausted outcomes are recorded. Both consultation levels explicitly disable fresh fallback. A failed inner global call reaches the local as an error and the local can still answer. A separate unrelated fork retains existing fresh fallback after lost history. |
| C10 | Abort before dispatch starts no child. Nested cancellation stops all three live invocations, delivers no late answer and retains unknown delivery. Controlled timers observe idle holds at both waiting levels while global activity continues, then the unchanged absolute deadline stops the caller. Both holds release and all three runner stop listeners are removed. |
| C11 | Completed same-ID neutral effect replay returns its existing result with one consultation/fork. Real neutral retry of a stopped intent before answer makes no new child. Interruption after acceptance/effect completion retains accepted-but-undelivered evidence. A separate barrier stops the fork after accepting its answer but before child outcome delivery; its hash-verified accepted answer remains known in the cancelled consultation, without a caller result. Simultaneous same-name calls retain independent actual call IDs and results. |
| C12 | Actual normal workflow constructors match their recorded runtime tool declarations; `steps-gate-after.test.ts` runs an actual same-run manual assigning-architect consultation and resumes the ordinary engineer submission. Missing/cross-run inputs remain unavailable. Existing continuing-work, block-session, task-packet and neutral-operation tests preserve old declarations, hashes and recovery behavior. Existing engineer capability-consumer consultation was unchanged. |

`consultations/submissions.ts` owns shared message/answer schemas and the advisory tool declaration. `consultations/tools.ts` runs the existing reader runner at the exact target with `architect-consultation` task/fork reason and no fresh fallback. `prompts/tasks.ts` owns its short procedure. Engineer/local constructors advertise the tool only for recorded available targets. `steps/runner.ts` binds those same inputs for ordinary and manual execution and publishes caller delivery only after an actual transcript result exists.

A demonstrated neutral API gap required one bounded change: `ToolDefinition.execute` accepts an optional third `callId`, passed by ordinary neutral effect dispatch. An event recorder's last call per tool cannot identify concurrent same-name calls after queued effect writes. The simultaneous-call witness verifies this correction. Existing declarations and operation-hash inputs do not change.

## Checks

Commands ran from `ramify-agent/`; logs and retained exit codes are under `/home/app/ramify-plan33-evidence/`.

| Command | Outcome | Evidence basename |
| --- | --- | --- |
| `npm run test:quick -- subs/harness/src/tests/consultation-tools.test.ts subs/harness/src/tests/consultation-workflows.test.ts subs/harness/src/tests/steps-run.test.ts subs/harness/src/tests/plan23-task-prompts.test.ts subs/harness/src/tests/plan25-block-sessions.test.ts` | Exit 0; 5 files, 86 tests passed | `iteration02-final-required.log`, `.exit` |
| `npm run test:quick -- subs/harness/src/tests/consultation-targets.test.ts subs/harness/src/tests/consultation-records.test.ts subs/harness/src/tests/steps-gate-after.test.ts subs/harness/src/tests/union-values.test.ts subs/harness/src/tests/plan23-continuing-work.test.ts subs/harness/src/tests/plan25-task-packets.test.ts subs/harness/subs/agent/src/tests/plan23-session-operations.test.ts` | Exit 0; 7 files, 207 tests passed | `iteration02-final-regressions.log`, `.exit` |
| `npm run type-check` | Exit 0; four configured compiler scopes | `iteration02-final-type-check.log`, `.exit` |
| `npm run check:self` | Exit 0; completed/passed; 13 owners, 759 source files; zero errors/warnings, partial coverage with 343 analysis limits | `iteration02-final-check-self.log`, `.exit` |
| `git diff HEAD^ HEAD --check` | Exit 0 | `iteration02-final-diff-check.exit` |

No selected tests were skipped. Foreign API discovery used the owning ordinary/testing generated views. Installed `ramify materialize --from subs/harness/src` and `--from subs/harness/src/tests` refreshed them with the existing owned `/tmp/ramify-plan33-api` endpoint; their logs/exit codes are `iteration02-api-ordinary.*` and `iteration02-api-testing.*`. No generated catalog was edited or imported.

Earlier failures remain retained: initial type errors, fixture assertions, the newly extended fork-reason union assertion, and an accidental root-cwd npm invocation that found no `test:quick` script. They are superseded by the named passing final checks, not erased. A trailing blank line in the new schema file was removed after the passing checks and before coordinator review; it changed no behavior. The source commit was amended only for that whitespace correction.

## Retained examples and successor input

`/home/app/ramify-plan33-evidence/iteration02-examples-final/` holds actual small run ledgers, materialized records, invocation outcomes/observations/submissions, transcripts, blobs and exact run identities. The test-only retention helper is inert without explicit `RAMIFY_PLAN33_EVIDENCE_DIR`; it copies no project source or provider store.

- `nested-and-direct-global`: outer `consult-inv-0004:ask` calls local `inv-0005/ses-0005`; its inner `consult-inv-0005:global-question` calls global `inv-0006/ses-0006`. The actual caller results are `ses-0004` entry 4 and `ses-0005` entry 5. A separate direct local → global call is `consult-inv-0007:ask`. Actual scripted usage is local input/output/cacheRead/cacheWrite/total `10/1/2/3/16`, global `100/2/20/30/152`; seed/caller usage remains explicitly unavailable.
- `direct-and-capability` retains four independent local/capability exchanges from the original pinned points after later parent appends.
- `error-invalid`, `error-missing`, `error-provider`, `error-exhausted` retain distinct errors and exact child/no-child evidence.
- `completed-replay`, `interrupted-before-answer`, `accepted-undelivered`, `accepted-before-cancellation` and `absolute-bound` retain the recovery, acceptance/delivery and cleanup distinctions.

Start is durable before dispatch. An unfinished child's existing `invocation-started` event has `work.request = consultationId` and its actual harness session, and its `session-opened` event has the pinned point plus `architect-consultation` fork reason. Inspection must use that association when an outcome is absent; `onStarted`'s in-memory value is not the only child association.

Initial outcome revisions retain unknown delivery even for an accepted answer. Later immutable revisions name the actual caller result position. Replayed display results do not overwrite the first observed position. No record asserts subsequent model consumption. Normal caller delivery is observed at invocation settlement; during an active caller the result position can still be unknown. If display recording fails, the outcome stays unknown rather than treating display failure as a new run failure.

These tests establish scripted harness/neutral behavior and the selected checks. They do not establish Pi transport, live advice quality, usefulness, cache savings, cost or full configured qualification. C13–C20 and the clean committed released full nested audit remain pending.
