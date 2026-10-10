# Iteration 3 results: consultation inspection

**Status:** C13–C16 verified; pending coordinator acceptance. Iteration 4 integration and exact-candidate full qualification remain pending.

Worktree `/home/app/ramify-plan33-consult-architect`, branch `feat/plan33-consult-architect`. Prerequisite HEAD `5873fc46d6513fe2f2563b039eb21477b3d69285` contains coordinator-accepted iteration 2. Source commit `729ff8484bb594b8f724d468a9a0167d4b8f7ff5` changes only the consultation projection/command, harness parent exposure, root CLI/help/tests and README. No other checkout or dependency installation changed.

## Behavior and evidence

| Case | Actual evidence |
| --- | --- |
| C13 | `consultation-inspection.test.ts` executes a real neutral engineer → local → global exchange, then reads ordered text/JSON lists with exact caller/work/source/model and record/transcript references. Filtering the engineer session includes its child exchange once. Detail keeps its own exchange and counts the complete chain's actual child usage. Eleven retained iteration 2 runs also produce run, session, detail and JSON output successfully. |
| C14 | Literal question/accepted answer/actual caller-result blocks and positions resolve through existing content/transcript readers. The accepted-and-cancelled fixture retains both answer and error with unknown caller delivery. An unfinished child is found from its actual `invocation-started.work.request` and `session-opened`, independently of consultation completion. Child acceptance committed before consultation outcome is recovered only from hash-verified submission bytes; its status remains incomplete. Unknown IDs, malformed records, conflicting event/body facts, missing outcome bodies and modified accepted bytes return explicit read errors. Valid pre-feature manual and implementation runs return empty lists. File hashes and mtimes remain unchanged, including a trailing event fragment and absent mirrors; the actual agent invocation count remains unchanged. |
| C15 | Distinct local/global usage observations sum to 168 tokens: input 110, output 3, cache read 22, cache write 33. Historical parent and caller invocations have 15,000 tokens each and are excluded. Missing/truncated observations retain known category subtotals with incomplete totals. Overlapping one-second outer calls report 2,000ms cumulative call time; nested duration is excluded from the outer waiting sum. Incomplete durations remain unknown. |
| C16 | Root `cli.test.ts` covers both forms, text default, JSON, session/detail flags and useful malformed-argument failures. The exported `main()` dispatches in process through the exposed harness command, preserving stdout/stderr/exit status. `check:self` validates command and signature companion exposure. No new native executable claim or exemption was registered. |

`subs/harness/src/projections/consultations.ts` reads complete event lines, validates the projected committed bodies and uses existing transcript/content/observation readers. It never opens `RunLog` or a mutable ledger, repairs records, takes a project lock or starts an agent. `consultations/command.ts` owns read errors, text/JSON formatting and the plain command boundary. Harness exposes `runConsultationsCommand`, `ConsultationCommandOptions` and `ConsultationCommandResult` to its parent. Root parsing and dispatch remain thin.

## Checks and retained outputs

Commands ran from `ramify-agent/`. Logs and separate exit-code files are under `/home/app/ramify-plan33-evidence/`.

| Command | Final outcome | Evidence basename |
| --- | --- | --- |
| `npm run test:quick -- subs/harness/src/tests/consultation-inspection.test.ts src/tests/cli.test.ts subs/harness/src/tests/session-queries.test.ts` | Exit 0; 3 files, 28 tests passed; no skips | `iteration03-final-quick.log`, `.exit` |
| `npm run type-check` | Exit 0; all four configured compiler scopes | `iteration03-final-type-check.log`, `.exit` |
| `npm run check:self` | Exit 0; completed, passed; 13 owners, 762 source files; zero errors/warnings, partial coverage with 344 analysis limits | `iteration03-final-check-self.log`, `.exit` |
| `node_modules/.bin/tsx /home/app/ramify-plan33-evidence/iteration03-examples.mts` | Exit 0; all 11 retained source2 example runs read successfully | `iteration03-final-examples.log`, `.exit` |
| `git diff --check` / staged diff check | Exit 0 | Source commit review |

`iteration03-process-evidence/` retains the final three ordinary test receipts, starting at `2026-10-10T20:39:03.530Z`–`.546Z`, for this exact cwd. Each records zero allowed and zero refused process launches. The earlier two narrowing errors and one incorrectly rooted npm invocation remain in `iteration03-second-type-check.*` and `iteration03-second-quick.*`; subsequent final checks above passed on the committed source bytes.

The retained input examples come from accepted iteration 2 source `3fce0649f59421bd9953865ac0d2c2f6cab1003c`, at `/home/app/ramify-plan33-evidence/iteration02-examples-final/`. Their matching output files are in `iteration03-output-examples/`: `<name>.json`, `.json.exit`, `.text.txt`, `.detail.txt` and `.session.txt`.

For `nested-and-direct-global`, the outputs resolve outer `consult-inv-0004:ask` to local `inv-0005` / `ses-0005`, inner `consult-inv-0005:global-question` to global `inv-0006` / `ses-0006`, and caller `ses-0004` request/result/subsequent entries 3/4/5. Full investigation files are the retained run's `transcripts/ses-0005.jsonl` and `transcripts/ses-0006.jsonl`. The outer chain totals 168 tokens; adding the separate direct global call gives 320 observed tokens across three actual children. The outer elapsed 173ms includes the 69ms inner wait; adding the separate 70ms call yields 243ms cumulative top-level time. These are observations of this scripted example, not performance or benefit claims.

`accepted-before-cancellation` and `accepted-undelivered` outputs keep accepted text separate from absent caller results. `interrupted-before-answer`, all error examples, `absolute-bound`, `completed-replay` and direct/capability examples retain their exact outcomes and usage limitations.

## Successor input and limits

Iteration 4 receives an inspectable feature and the README command examples. JSON separately represents accepted answer, consultation error, retained outcome delivery, actual observed caller result, and a subsequent caller transcript pointer. `modelConsumption` remains unknown; a transcript result or later assistant entry does not prove the next native request consumed advice or that advice was useful.

Provider usage is represented by observed input/output/cache-read/cache-write/total tokens, with completeness and known subtotals. No cost, usefulness score, cache saving or live-model claim is computed. The reader has no atomic snapshot of independently appended transcript/observation files; incomplete tails and missing observations are explicit and a later read may see more retained evidence. Structural coverage remains partial. The configured full nested audit and C17–C20 are unrun here and belong to iteration 4.
