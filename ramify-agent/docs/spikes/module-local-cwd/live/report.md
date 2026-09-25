# Module-local cwd live pi spike

Date: 2026-09-25. Model: `openai-codex/gpt-6-sol`, same in all four fresh sessions. Fixture: independent copies of `ramify-agent/fixtures/collection-review` at seed commit `4678ade40be7c38824ad9b1cd600a28f560726c0`; dependencies installed offline once in the seed and copied. Baseline harness checkout: detached `a015ce0d` at `/tmp/ramify-cwd-baseline`. Candidate checkouts: `/tmp/ramify-engineer-cwd` and `/tmp/ramify-architect-cwd`. No model credentials are archived here.

## Tasks and boundaries

- Engineer: actual public `npm run session` with pi agent and `--gate`, Reviews module, identical task file `engineer-task.txt`. The task asks for a `SessionTable.bindFromJson` method that parses unknown input with the exposed shared `revisionScopeSchema` before mutating state, plus own tests. This task explicitly directs generated API discovery and discourages foreign source reads in both arms. The harness assembled prompts, materialized views, guarded edits, ran hooks and scope tests, and recorded pi transcripts. The outer evaluator used a 180-second bound for the candidate.
- Local architect: real pi adapter, `loadPromptPackages`/`renderLocalArchitectPrompt`, `workItemMessage`, materialized architect and API views, and `validateLocalArchitect` for an `assign` submission. This is a single isolated role turn with a 180-second bound, not a full `RunService` job. The candidate direct adapter uses the same module `src` cwd as the actual service. The work item asks for an assignment for the same binding feature.

## Observations

| Role | Arm | pi session header cwd | Read/search calls | Global architect view calls | Foreign source/declaration reads | Generated own API calls | Path errors | Submitted result | Time to submission |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Engineer | Baseline | fixture root | 10 | 0 | 0 | 4 | 1 ENOENT (`src/sessions.ts`) | accepted completion proposal | 63 s |
| Engineer | Candidate | Reviews `src` | 9 | 0 | 0 | 2 | 0 | accepted completion proposal | 65 s |
| Local architect | Baseline | fixture root | 23 | 2 | 1 source + 1 declaration | 5 | 0 | accepted `assign` | 48 s |
| Local architect | Candidate | Reviews `src` | 13 | 0 | 0 | 6 | 0 | accepted `assign` | 37 s |

The cwd values above come from pi's own session JSONL header, not only prompt text or session configuration. Architect baseline read `.ramify-architect/module.json`, `contracts/src/interfaces/vocabulary.ts`, and `contracts/module.ramify` before the generated API page. Candidate read own README, module declaration, source/test, and generated source/test API pages. Baseline engineer first read a nonexistent `sessions.ts` then corrected to `session.ts`; candidate used `session.ts` directly. Candidate engineer explicitly changed shell directory back to the fixture root for `npm run type-check && npm run build`, because those package commands live there; its pi session and relative read/edit calls remained in module `src`.

The architect assignments were both valid and scoped to Reviews' own source, with the contracts module in read scope and no foreign writes. Both identified parse-before-bind, state/counter preservation on invalid input, and focused tests as completion evidence. The engineer patches in both arms import the exposed schema, parse before invoking existing `bind`, and add tests for valid/invalid cases. Both changed only Reviews' `src/session.ts` and `src/tests/sessions.test.ts`.

## Verification

Both engineers ran `run_scope_tests`: 3 Reviews test files and 16 tests passed in each session. Their own shell calls ran fixture type check and build with exit 0, and the harness's completion post-write Ramify hook reported passed with zero new findings. Independent focused reruns passed 10/10 session tests in each copy, and `git diff --check` passed for both patches.

The full post-session iteration checkpoint did not reach a terminal verdict. The baseline checkpoint was interrupted during the turn reset after the accepted submission. The candidate reached the evaluator's 180-second outer timeout after its accepted submission, during later Ramify materialization/analysis; the 180-second limit was external to the harness's own check policy. Neither arm has a successful full gate receipt. Separate fresh-endpoint `ramify check --batch --root <copy> --format json --no-snapshot` commands then exited 0 on both copies with `execution: completed`, `check: passed`, and `coverage: partial` (the fixture has coverage notes); both private daemons stopped cleanly. These direct results verify the final trees but do not turn the interrupted harness checkpoints into completed gate receipts. A separate fresh-endpoint `ramify materialize --view architect --root <copy>` then exited 0 on both final copies (15 modules, 137 records in each), with owned daemons stopped. This shows the view can refresh on each tree in a fresh service, while leaving the original checkpoint stall unexplained. Raw reports are `check-baseline.json`, `check-candidate.json`, and `materialize-{baseline,candidate}.out`.

## Cost and scope limits

An initial candidate architect setup attempt used the module directory instead of its `src` directory. It reached one model response (7 read/search calls, 15,376 reported total tokens) before termination, without a submission. Its raw pi session is the `08:28:45` file in `architect-candidate-artifacts/pi-session/`; the matched candidate result points to the later `08:29:16` file. The aborted setup attempt is excluded from the four-arm metrics and remains in the artifact directory.

The candidate prompts bundled cwd-specific instructions and path examples with the cwd change. The comparison therefore measures the package as delivered, not cwd in isolation. The engineer task itself coached API-view use in both arms, so it does not show whether a less directed engineer would discover the view on its own. One fresh run per role and arm, provider cache differences, concurrent host load, and distinct materialized revision IDs make elapsed time and token counts descriptive only. Architect session usage totals (including cache reads) were 118,002 baseline and 53,440 candidate; engineer totals were 101,195 baseline and 106,877 candidate. Candidate prompt bytes increased: architect system 55,203 to 56,924 and user 1,892 to 2,338; engineer system 19,970 to 21,871 and user 2,494 to 2,986.

## Artifacts

- Machine summary and path-level tool calls: `summary.json`; compact view: `summary-condensed.json`; exact matched and aborted pi header provenance: `pi-headers.json`.
- Reproduction: `architect-eval.mts`, `summarize.mjs`, and `engineer-task.txt`.
- Raw architect records: `architect-{baseline,candidate}-artifacts/{events.jsonl,result.json,prompt-stats.json,pi-session/}`.
- Raw engineer records: each `engineer-{baseline,candidate}/plans/.harness/sessions/<id>/` (`transcript.jsonl`, `observations.jsonl`, pi `session/`, `submission.json`, hook and shell logs).
- Source patches: `engineer-baseline.patch`, `engineer-candidate.patch`.
