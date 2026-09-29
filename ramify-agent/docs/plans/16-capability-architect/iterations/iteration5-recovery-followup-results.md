# Iteration 5 recovery follow-up

This addendum records fault witnesses added after the original [iteration 5 result](iteration5-results.md). The work starts from committed `491e3fd5` in an isolated worktree; it does not change the concurrent live Pi target. All fixtures use scripted agents with the real run service, ledger, Git candidate, and writer lifecycle. They do not establish live model judgment.

At this starting commit, policy/5 defaults to 24 capability assignments per task (raised in `491e3fd5`), 2 engineer session reconstructions, 3 context-budget returns, 3 rejected submissions and tool inputs per turn, and 3 work-item gate repair rounds. Each run captures its limits in `job.json`; the exhaustion fixture overrides only its own captured reconstruction limit to 1.

## Behavior and fault evidence

| Boundary | Executable evidence |
| --- | --- |
| Real C handback before B resumes | `capability-dependencies.test.ts` freezes immediately after the committed C handback, reopens the service, and observes one child handback, one settlement of original B assignment `cap-001.i01`, the returned dependency in B's prompt, and no unrelated frontier dispatch. Targeted test passed. |
| Nested accepted qualification | `capability-dependencies.test.ts` freezes after `need-002`'s accepted final qualification and before child delegation. Restart reuses the qualification and creates one child task on the original depth-first stack. Targeted test passed. |
| Combined gate intent and in-flight commit | `capability-acceptance.integration.test.ts` freezes at `gate-attempted`'s commit intent and at the post-commit `gate-committing` hook, then reopens. Each targeted test passed with one `ga-0004` gate attempt, one matching revision-2 review, and one handback. The service now exposes a post-commit handback hook at normal and replay sites for the child fault witness. |
| Reviewer submission before durable aggregate review | The same acceptance fixture freezes after the third accepted revision-2 reviewer submission, before `capability-review-recorded`. On original `491e3fd5`, the exact test failed: reviewer starts rose from 9 to 12 after restart. The candidate authenticates each prior submission against its package and exact prompt hash, accepted outcome, settlement, schema, and bytes, and reuses it only for the same kind, gate/tree, plan revision and assignment basis. Targeted candidate test passed with 9 reviewer starts after restart and one revision-2 `ga-0004` review. Revision-1 reviews remain distinct. |
| Captured engineer reconstruction bound | `capability-recovery.test.ts` freezes after the first interruption of B's dirty assignment, reopens under the captured reconstruction limit of 1, and exhausts it on a second unsubmitted turn. Targeted test passed: original cause and dirty B source persist, the same assignment remains unfinished, and no handback occurs. Existing architect context-budget return and exhaustion tests remain at `capability-recovery.test.ts` and `capability-delegation.test.ts`. |
| Captured action rejection and preview bound | `capability-delegation.test.ts` exercises five invalid previews followed by one rejected final action and a corrected final action, two invalid final actions, and two inputs rejected by the agent port before the final tool runs. The three targeted cases passed. Previews leave the final-action counter unchanged; the two exhaustion paths retain the captured bound of 2, record no assignment or handback, and stop unfinished. The port-input path records an `ended` invocation and an `invalid-submission` job failure, as the actual port reports. |

## Verification

The corrected reviewer baseline and candidate were run in separate worktrees. The baseline failed at 9 versus 12 reviewer starts; the candidate passed 1/1 at 9 versus 9. The real C restart, nested qualification, gate intent, gate commit and engineer-limit tests each passed individually. The combined `capability-recovery.test.ts` plus `capability-dependencies.test.ts` run passed **28/28 tests in 206.64 s**.

| Check | Result |
| --- | --- |
| `npm run type-check` | Passed after the final source edit. |
| `npx vitest run subs/harness/src/tests/capability-delegation.test.ts -t 'CA16 CA26'` | Passed 3/3 targeted tests after correcting the port-input outcome expectation. |
| `npm run check:self` | Passed: 0 errors, 0 warnings, 315 analysis limits over 12 owners, 549 source files and 52 resources. Coverage remains partial. |
| `git diff --check` | Passed before commit. |
| Full Plan 16 audit | Pending on the committed revision; use `audit/plan16-capability-architect.request.json`. |

## Remaining coverage

- CA26 has capability-specific invalid final submission, port-input, preview-counter, reconstruction and architect-budget witnesses. Repair-round exhaustion remains unexercised in a dedicated capability run.
- CA20 still lacks a process-level witness of an actual registered process group surviving service restart. The existing missing confirmed writer-release service test fails closed and blocks the frontier.
- The live Pi, external semantic audit and served-browser gates remain separate Plan 16 iteration 7 evidence.
