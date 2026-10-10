# Plan 33 acceptance cases

[Main plan](main-plan.md). Cases describe observable behavior, not automated
judgment of advice quality. Every case is owned by one iteration.

## Targets and records — iteration 1

| ID | Case and expected evidence |
| --- | --- |
| C01 | First work dispatch pins global point G0. Later global append G1 does not alter the local context's target. A genuine resumed dispatch can pin G1; recovering that dispatch does not repin it. |
| C02 | Ordinary assignment reuses local point L0 and its global target; capability assignment reuses its assigning coordinator point K0, including inside a nested capability task. Repair/handback retain the original target after the architect advances; a later assignment uses its own point. No consumer-local or ancestor-coordinator substitution and no fabricated missing point. |
| C03 | Inputs/constructors record consultation availability for local- and capability-assigned engineers and local architect turns with recorded targets. Same-run manual assignment retains an available local point; standalone, cross-run imports, ordinary capability-coordinator, selector/reviewer and old inputs have none, with an availability reason. Actual tool activation follows in iteration 2. |
| C04 | Start/outcome records retain caller/tool-call identity, exact target, parent consultation and content references. Completed replay is one exchange; interrupted state is representable without invented completion. Legacy logs still parse. |

## Tool and nesting — iteration 2

| ID | Case and expected evidence |
| --- | --- |
| C05 | Engineers ask their assigning local or capability architect fork and resume with the answer in the same caller session. Forks use L0/K0 respectively, preserve literal question/answer, and contain neither later parent updates nor another consultation's history. The capability fork answers directly without a consultation tool. |
| C06 | Ordinary local architect orientation/work turn can ask global G0 and continue its original task afterward. Context selector has no consultation tool. |
| C07 | Engineer → local → global → local → engineer completes through awaited tools. Local chooses whether to consult and composes the final answer. Global lacks an active consultation tool and cannot start another level. |
| C08 | Consultation prompts explicitly say advisory; read-only equipment and current answer schema replace inherited assignment/placement tools. Capability forks cannot update the capability plan, submit capability actions or initiate consumer consultation. Original parent snapshots, capability plan and workflow/source records remain unchanged, apart from consultation/session evidence. No new semantic advice validator exists. |
| C09 | Missing/invalid source, provider failure and exhausted answer validation return distinct recorded errors without fresh/latest-head substitution or ending the caller's work as completed. An inner failure can be handled by the local fork. Existing unrelated-task fresh fallback still works. |
| C10 | Abort before dispatch starts no child; cancellation while awaiting inner global stops the nested calls, releases idle holds/listeners and prevents late answer delivery. Controlled time verifies idle holds and unchanged absolute deadlines. |
| C11 | Replaying a completed call creates no extra fork or count. Simulated interruption before/after answer acceptance preserves exact known state and unknown delivery; no implicit retry of an uncertain effect. |
| C12 | Runtime and rendered step inputs agree on tools, target and task procedure. Old admitted operations retain their original declarations/hashes; new tasks do not reactivate inherited placement tools. Existing engineer capability consultation remains unchanged. |

## Inspection — iteration 3

| ID | Case and expected evidence |
| --- | --- |
| C13 | Text and JSON run/session lists show ordered exchanges with nested parentage, caller/work, question preview, outcomes, source points and navigable transcript/invocation references. Session filtering includes nested children once. |
| C14 | Detail returns exact question and delivered answer/error, separate accepted-but-undelivered answer, investigation reference and caller result position. Interrupted calls stay visible; unknown IDs fail and valid legacy runs return an empty list. Inspection writes no state and invokes no agent. |
| C15 | Known provider usage categories sum once per invocation across nested calls; missing usage is unknown with known subtotal, not zero or complete. Historical inherited usage is excluded. Outer wait includes inner duration; cumulative top-level call time is not mislabeled session wall time when calls overlap. |
| C16 | Root CLI parsing/dispatch/help matches both inspection forms and text/JSON defaults; malformed arguments fail usefully. The command consumes an exposed harness contract, with valid signature companion exposure. |

## Qualification — iteration 4

| ID | Case and expected evidence |
| --- | --- |
| C17 | Scripted workflows cover ordinary dispatch → assignment → engineer consultation with nesting → submission → local continuation, and capability assignment → engineer consultation → submission → coordinator continuation. A nested capability assignment consults its own assigning coordinator. Assignment/completion/placement/handback behavior is unchanged and all logs distinguish the actual architect role/task. |
| C18 | Real Pi adapter with scripted provider executes both nested tool results, correct answer tool and inactive global consultation tool, exact fork prefixes and cancellation. Captured requests/results prove transport behavior; no live quality/cache claim. |
| C19 | Final committed integration candidate passes type-check, structural check and configured full nested audit with retained candidate/evidence identities and original skip/unavailable statuses. Existing workflow and old-log regressions are included. |
| C20 | User-facing documentation explains advisory use, eligible sessions, nesting, unavailable context, pinned history versus current files, inspection examples and interpreting incomplete metrics. Result receipts cover all cases and unresolved limitations. |

## Verification locations

Proposed new focused files under `subs/harness/src/tests/`:

- `consultation-targets.test.ts`, `consultation-records.test.ts` (C01–C04).
- `consultation-tools.test.ts`, `consultation-workflows.test.ts` (C05–C12, C17).
- `consultation-inspection.test.ts` (C13–C15).

Extend root `src/tests/cli.test.ts` and `subs/harness/src/tests/run-commands.test.ts`,
or add a harness command test beside it, for C16. For C18 extend the Pi child's
`src/tests/plan23-prefix-preservation.test.ts` or add
`src/tests/consultation-nesting.test.ts` beside it using its scripted provider.
Keep any child-specific assertions behind its existing testing API; do not import
Pi-private helpers into harness tests without proper testing exposure.

Existing regressions: `steps-from-run.test.ts`, `steps-authored.test.ts`,
`steps-run.test.ts`, `plan23-task-prompts.test.ts`,
`plan25-block-sessions.test.ts`, `plan23-fork-workflows.test.ts`,
and the neutral agent's `plan23-session-operations.test.ts`.
Select additional changed-owner cases from configured discovery.

Follow [testing.spec.md](../../testing.spec.md): external Git, CLI, audit and
command behavior is scripted in ordinary tests; workflow persistence uses the
in-memory adapter. Native claims require exact registered witnesses, not ordinary
test exceptions. This plan introduces no required live-provider or kernel claim.

