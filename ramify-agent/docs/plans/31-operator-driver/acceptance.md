# Plan 31 acceptance cases

[Main plan](main-plan.md). These cases verify that an operator's turn is
enforced and recorded as a model's, that routing cannot split a session
lineage, and that the mailbox and CLI behave. Tests drive the mailbox in
process with a test-controlled operator and the scripted agent for other
roles.

## The operator owner — iteration 1

| ID | Case and expected evidence |
| --- | --- |
| O01 | Dispatch writes turn identity, work item/opened time/effective deadline and active tools/submission schema. Continuation/fork history includes initial instructions, generic context and tool changes, prior messages/calls/results/verdicts at the selected point, then current additions. Future parent turns do not leak into an earlier fork. |
| O02 | A `call` action on `edit` inside the write scope passes guard, intent, execute, completion and `afterMutation`; one outside the scope is refused by the guard and the refusal appears in `results/` and in the transcript as a guard denial. |
| O03 | A submission goes through the harness judge: ordinary rejection returns errors and keeps the turn open; `final: true` closes it without a submission and accepts no further action; acceptance closes it as submitted. The configured rejection bound is unchanged. |
| O04 | Each action and result is persisted through the runtime so a later continuation of the operator session renders them in `history.md`. |
| O05 | Aborting while waiting or executing a call fences new work, drains admitted runtime calls, writes terminal status and settles queued actions. A CLI action racing with closure observes a refusal or terminal state even after the watcher exits, without hanging or executing late effects. |
| O06 | Transcript entries for an operator turn parse with the current schemas; usage is unavailable with reason `operator`. |
| O16 | Snapshot-only reviewers cannot call `read`/`edit`/`write` built-ins or inactive inherited tools. Permitted operator calls still use the harness guard, hook and judge; using the channel is an explicit instruction to the outside agent, not a claimed OS sandbox. |

## CLI, routing and bounds — iteration 2

| ID | Case and expected evidence |
| --- | --- |
| O07 | `pending` lists open turns across runs with role, work item, deadline and age; `show` includes inherited context by default. `call`, `submit` and `end` use the documented statuses and observe result/terminal state/wait timeout; timeout names the action ID and does not claim cancellation. |
| O08 | The chosen composition dispatches the local architect to the operator and the engineer to the scripted agent within one scripted run; records name the executor per invocation. |
| O09 | Under the resolved R31-1 selection rule, split lineages are refused before start with the missing roles named, including selectors and scope reviews from both local and capability architects. A closed set is accepted. Dispatch also rejects foreign-driver history rather than dropping it or silently starting fresh. |
| O10 | An operator-played invocation has no idle bound and keeps the absolute bound; `turn.json` carries the deadline; a pi-played invocation in the same run keeps both bounds. |
| O11 | `serve --operator` and `start-run` persist the base agent/role set while existing `pi`/`scripted` values still parse. Standalone `session`/`step` operator choices map explicitly without confusing `fake` and `scripted`; unknown roles are usage errors. Recovery never substitutes the server's current role set. |
| O15 | Concurrent action publishers cannot overwrite or lose each other's commands. Already published actions are discovered without a watch event; repeated stable action IDs return their recorded results with no repeated effect. |
| O17 | The chosen composition preserves pi built-in binding, availability checks, exact-point fork, terminal retry and stop/drain behavior. Relevant registered pi witnesses qualify any changed adapter path; scripted ports alone are not provider evidence. |

## Qualification — iteration 3

| ID | Case and expected evidence |
| --- | --- |
| O12 | A scripted whole work item uses the operator for the closed set chosen in R31-1: orientation, selection, assignment, scripted engineer iteration, gate, completion request, reviews, reconciliation and completion. Every operator turn, including scope reviews when required by the lineage, is answered through the mailbox. |
| O13 | Type checks, Ramify self-check and the final committed configured full nested audit finish with retained outcomes; ordinary tests launch no external process. |
| O14 | Documentation describes the operator choice, mailbox, CLI, closed-lineage rule and agent-owned worktree setup. A real-plan receipt records project/plan/deliverable, worktree/base, resulting commits, project verification, responsible agent's review, unresolved defects and cost. An unrun or discarded attempt remains explicitly unqualified as successful implementation. |

## Existing verification surfaces

- `subs/harness/subs/agent/src/tests/`: the scripted driver tests are the template for the
  operator driver tests.
- `subs/harness/src/tests/helpers/runs.ts` `openRuns` and the plan 23 and 25
  session tests: composite routing and bounds.
- `subs/harness/src/tests/session-command.test.ts` and Plan 30's step tests:
  the `--agent operator` choice.
- The transcript writer tests: operator entries.
