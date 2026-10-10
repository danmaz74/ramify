# Iteration 1 results: targets and observation records

**Status:** C01–C04 verified; coordinator acceptance pending. R33-1 remains resolved: capability-assigned engineers are included.

Worktree `/home/app/ramify-plan33-consult-architect`, branch `feat/plan33-consult-architect`; starting HEAD `ff371b849e4cca37432c7cc9198a144507230d57`. Source commit `6c56189c1bba895a0f35b5c9835a90a719d62b93` preserves and finishes the interrupted iteration's edits. No other worktree or dependency installation changed.

## Behavior and evidence

| Case | Actual passing evidence |
| --- | --- |
| C01 | `consultation-targets.test.ts` uses real neutral sessions and G0→G1 model-free appends; dispatch targets remain pinned. The actual yielded/resumed workflow captures its new append point. A frozen `work-item-resumed` dispatch is restored through `openRuns`; no second resume appears and restored local inputs retain that target. |
| C02 | Real neutral L0/K0 histories plus assignment derivation preserve the original point after later appends, repairs and nested-task handback; a later assignment takes its own point. The actual repair workflow's two engineer inputs agree. `capability-assignments.test.ts` checks actual engineer inputs for four capability assignments against each assigning coordinator's recorded `architectRef`, with no global target. Nested capability-task target selection is derivation evidence here; full nested capability execution/handback remains C17. |
| C03 | Actual orientation/work constructors match the dispatch inputs; engineer constructors record availability without dispatching a tool. `steps-gate-after.test.ts` executes same-run manual assignment, missing-session and cross-run cases. `steps-from-run.test.ts` clears executable targets and retains provenance. `steps-authored.test.ts` records standalone unavailability. Legacy absent fields add no consultation prompt text. Selector availability is absent; unsupported role schemas gain no field/tool. |
| C04 | `consultation-records.test.ts` commits and reopens exact content/target/parent/caller references, replays one start/outcome, represents interrupted acceptance with unknown delivery, and reads old dispatch records. Later observed caller-result entries append outcome revision 2; the initial ledger record stays identical. Replay reads the latest observation. Invalid caller/null result positions and attempts to change an observed position are refused. No model-consumption fact is inferred. |

The existing `plan23-continuing-work.test.ts` regressions preserve admitted task/policy, acceptance identities and original transcripts on restore/retry. `plan25-task-packets.test.ts` retains runtime/rendered packet agreement, including resumed engineer tasks. No historical record or admitted operation is rewritten to advertise consultation.

## Checks

All commands ran from `ramify-agent/`; full logs and separately retained exit codes are under `/home/app/ramify-plan33-evidence/`.

| Command | Outcome | Evidence basename |
| --- | --- | --- |
| `npm run test:quick -- subs/harness/src/tests/consultation-targets.test.ts subs/harness/src/tests/consultation-records.test.ts subs/harness/src/tests/steps-from-run.test.ts subs/harness/src/tests/steps-authored.test.ts` | Exit 0; 4 files, 34 tests passed | `iteration01-owned-quick.log`, `.exit` |
| `npm run type-check` | Exit 0; all four configured compiler scopes passed | `iteration01-owned-type-check.log`, `.exit` |
| `npm run check:self` | Exit 0; completed, passed; 13 owners, 754 source files; zero errors/warnings, partial coverage with 343 analysis limits | `iteration01-owned-check-self.log`, `.exit` |
| `npm run test:quick -- subs/harness/src/tests/steps-gate-after.test.ts subs/harness/src/tests/union-values.test.ts subs/harness/src/tests/plan23-continuing-work.test.ts subs/harness/src/tests/plan25-task-packets.test.ts subs/harness/src/tests/capability-assignments.test.ts` | Exit 0; 5 files, 124 tests passed | `iteration01-owned-regressions.log`, `.exit` |
| `git diff --check` | Exit 0 | Coordinator/subagent review |

No tests were skipped in these selected runs. Earlier failure evidence (`iteration01-targets.log`) remains retained. A prior duplicate background Codex tree was discovered writing this same iteration. The coordinator stopped only that tree and retained ancestry/cwd in `duplicate-background-tree.json`; its in-scope changes were preserved and reviewed. Potentially shared logs were retained as `iteration01-collision-*.log`; the `iteration01-owned-*` checks above ran after exclusion on the final source bytes and establish this receipt's outcomes.

## Successor input and limits

Iteration 2 consumes `consultations/targets.ts` (target schemas/capture/availability), `records.ts` (start/outcome/content/position contracts) and `store.ts` (mutex-owned ledger helpers). `recordConsultationStart` precedes dispatch; `recordConsultationOutcome` retains answer acceptance separately from caller delivery; `recordConsultationDelivery` requires an actually observed caller transcript result entry and appends an immutable revision. Event summaries and exhaustive event-union tests cover all three new events.

Only new inputs carry availability. Normal engineers reuse the assigning event's `architectRef`; local turns reuse the work dispatch's captured global point. Capability targets include their assigning task and permit no implicit onward target. Cross-run/manual imports retain non-executable provenance. The original provider-neutral ref and harness point are both retained; provider session ID is not equated to harness session ID.

Tool execution/nesting, cancellation, recovery of tool effects and read-only inspection remain pending iterations 2–4. This receipt proves target/record behavior and focused execution health, not completed tool transport, subsequent model consumption, live advice quality, cache benefit or full configured qualification. The required released full nested audit remains unrun until the final clean integration candidate.
