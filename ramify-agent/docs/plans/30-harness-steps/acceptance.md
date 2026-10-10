# Plan 30 acceptance cases

[Main plan](main-plan.md). These cases verify that a step run from the CLI is
the step the run performs, that inputs are validated as the producing role's
output would be, and that records and errors are visible. Use small synthetic
records, the scripted agent and scripted Git.

## Engineer constructor and render — iteration 1

| ID | Case and expected evidence |
| --- | --- |
| S01 | A scripted run on the fixture delivers, for every engineer invocation, a packet equal to the one the engineer constructor renders from the inputs the run passed. Fresh, repair continuation and resumed starts are covered. |
| S02 | `StepInputs` parses and round-trips every input the run passes; rejects a function, unknown field, absolute or escaping path field, while allowing absolute-path text in captured prose. |
| S03 | `inputs --from-run` derives engineer inputs and reports equal/differing sections against the recorded packet without making equality an admission gate. An imported continuation yields a full fresh briefing and original-start provenance without provider-history import. Unsupported roles or incomplete task records are refused with the reason. |
| S04 | `render` prints role instructions, message, every tool declaration and the submission schema for a fresh start; for a continuation it prints the additions alone, marked as such. It takes no lock and writes nothing. |

## Local architect and reviewer constructors — iteration 2

| ID | Case and expected evidence |
| --- | --- |
| S05 | A scripted run delivers, for orientation, selection and work-turn invocations, packets equal to the constructors' renders, including a selector fork and a continued work turn. |
| S06 | Code, scope and design review invocations render equal under the same inputs/environment, with snapshot-only tool declarations and no built-ins. Design-guidance orientation is independently constructible; one `step run` never hides an extra orientation invocation. |
| S07 | An authored assignment that fails the local architect's submission schema or the work-item validator is refused by `inputs` with the validator's errors; a valid one yields engineer inputs that render. |
| S08 | `inputs --from-run` derives local architect and reviewer inputs; a start outside the first set is refused with its reason. |

## Invocation runner and `run` — iteration 3

| ID | Case and expected evidence |
| --- | --- |
| S09 | `run --agent fake` with a script writes, under a manual run in the real layout, `job.json` marked `manual`, `inputs.json`, the invocation, outcome, submission, observations and transcript records, with the same schemas a run writes. |
| S10 | Server startup/restart skips manual execution/recovery without changing its records. The CLI can read the explicitly named manual run's records without registering it with the server; UI listing/freshness is not an acceptance condition. Existing `kind: 'implementation'` records still load unchanged; a real run's records are unchanged by a manual run beside it. |
| S11 | `session` with its existing command line behaves as before: guard, hook, validator, progress output, exit statuses, and `--gate` in place; it writes no `plans/.harness/sessions/` directory. |
| S12 | A scripted session's live output shows each tool call, a guard denial, a hook finding, appended harness text, a rejected and an accepted submission, and the summary; the exit status is 0 for submitted, 1 for ended otherwise, 2 for refused. |
| S13 | The invocation record of a manual run names the base commit and whether the tree was dirty at start, through scripted Git; nothing is snapshotted or restored, and a second run after an edit records the new dirty state. |
| S14 | A second `run` on the same inputs after a scripted "harness fix" (a changed prompt package) starts a new invocation and records the new hash and base identity; it restores no tree. Imported source-run points become fresh starts with complete task context and recorded provenance, without changing the source run; compatible same-manual-run points can continue/fork, and missing context is reported as a fresh start. |

## Gates and after-handling — iteration 4

| ID | Case and expected evidence |
| --- | --- |
| S15 | Scripted checkpoints retain their existing policies: iteration/work-item commit and request project-default audit, final commits and requests full nested audit, readiness audits the baseline full/nested without a candidate commit. The attempt names subject, proposal and candidate; ambiguous subjects/missing prerequisites are refused. `--no-commit` is setup/type/Ramify diagnosis only and is never audit evidence. Accepted proposal bindings precede the iteration audit. |
| S16 | `after` on local architect `assign` writes accepted reports, outline and assignment and reports scheduling as not run; on `request-completion` it records reports, checks blockers and writes the applicable outline revision, reporting settlement/reconciliation/gate as not run. It invents no gate-request record. |
| S17 | `after` on `completion-proposed` records bindings and, only with the matching passing committed iteration gate, queries candidate ownership, closes the iteration and requests reviews; review sessions remain not run. Missing, failed, stale or diagnosis-only evidence cannot produce an accepted close. Repeating `after` does not duplicate transitions/reviews. |
| S18 | An invalid module description or exceeded ledger bound exits 1 with the original cause and last completed transition. No partial ledger transaction is visible; earlier committed transitions remain, and a retry does not repeat their effects. |
| S19 | A write refused because the placement query threw names the error in the guard decision and the transcript, not "outside every location". |
| S20 | New transcript `started` entries carry declarations and continuation additions; current shared readers parse both new and historical entries. Missing historical fields mean unavailable evidence. Compare render with the scripted delivered entry under the same inputs/environment/start mode. |
| S24 | `run`, `gate` and `after` use the project lock and refuse an unsettled writer. An implementation-run output directory, mismatched project/branch identity or changed accepted submission is refused before effects. |
| S25 | `after` handles `partial`, `unsuitable` and `capability-needed` using the same result/provisional-source operations as the run, reports unscheduled workflows, and explicitly reports unsupported submission kinds as not run. |

## Documentation and qualification — iteration 5

| ID | Case and expected evidence |
| --- | --- |
| S21 | Documentation starts real-plan implementation with an agent-created worktree and the target project's ordinary setup, lists the harness's own preconditions (plan file location, committed audit configuration, project configuration, parent commit) and says the agent resets the tree before a retry. It requires no `step prepare`, `--self`, fixture copy or harness-owned workspace provisioning. Validate this as a documentation contract, not a new runtime feature. |
| S22 | Type checks, Ramify self-check and the final committed configured full nested audit finish with retained outcomes; ordinary tests launch no external process. |
| S23 | Documentation describes the step commands, manual runs and retired session directory; Plan 15 is marked superseded for capture and replay. The real-plan receipt identifies project/plan/deliverable, worktree/base, resulting commits, project verification, responsible agent's review, unresolved defects and cost. An unrun or discarded attempt is recorded as such, never as successful implementation. |

## Existing verification surfaces

Extend the tests that own the behavior. Locations below are relative to
`subs/harness/src/tests/`; recheck configured discovery before implementation:

- `plan23-task-prompts.test.ts`, `plan25-task-packets.test.ts`: packet equality
  between the run and the constructors.
- `engineer-briefing.test.ts`, `scenario-briefings.test.ts`: engineer inputs.
- `session-command.test.ts` and the single-session tests: the `session`
  command on the runner.
- `helpers/runs.ts` `openRuns`, `helpers/session-fixture.ts`: scripted runs
  that produce records for `inputs --from-run`.
- the guard tests: the thrown-query refusal.

Add test files for the step inputs schema, the constructors' equality and the
CLI parsing; do not add a file that mirrors a renderer's implementation.
