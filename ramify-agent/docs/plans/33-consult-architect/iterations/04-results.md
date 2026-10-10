# Iteration 4 results: integration and qualification

**Status:** C17–C20 completed; integration source and corrections received coordinator review before configured qualification. Final receipt/status acceptance is recorded by the coordinator separately.

Worktree `/home/app/ramify-plan33-consult-architect`, branch `feat/plan33-consult-architect`. Prerequisite HEAD `2a52e8f9c9dcdf15e2c1f7ce32f5c91e7069f9b2` contains coordinator-accepted iterations 1–3. Integration source `7885b9dfb102193f72535f625f422f1261cc17fc` was clean and committed before qualification; receipt/status documentation is committed separately. No other checkout or dependency installation changed.

## Behavior and actual evidence

| Case | Evidence |
| --- | --- |
| C17 | `consultation-workflows.test.ts` runs real RunService dispatch, assignment, engineer → local → global advice, ordinary engineer submission, local continuation, existing placement/contract flow, provider repair, yield/resume and final completion. Each consultation's source equals the actual assigning architectRef or dispatch globalTarget, with linked parentage and recorded caller results. The real scripted dependency-gate flow runs cap-001.i01, nested cap-002.i01/i02, cap-002 handback and continued cap-001.i01. Engineers consult each actual assigning coordinator, and resumed B retains its original cap-001 point. Normal assignment settlement, report rejection/repair, plan revision, reviews and handback still pass the helper's original assertions. Capability consultation attempts at onward consultation and capability-plan update are refused through ordinary inactive-tool dispatch, then the fork answers. |
| C18 | `consultation-nesting.test.ts` drives real installed Pi session operations and the supported native serializer/parser, with only HTTP replies scripted. Both awaited answers appear as literal function_call_output values in subsequent local/engineer provider requests. Exact inherited source prefixes match retained point snapshots and exclude later updates; original architect snapshots remain equal. Global has an active answer tool and rejects actual consult/inherited-submission attempts. A held global native request is aborted by caller stop through both tools; both signals abort, child handles settle stopped, both listener cleanup paths execute, no answer is accepted, and retry dispatches no request. |
| C19 | Released configured full nested audit passed on the exact clean candidate; complete 334/334 file coverage, 2,991 passed tests, existing skips and analysis limits retained below. |
| C20 | README covers advisory behavior, eligible and absent roles, engineer/local/global nesting, exact task coordinators, repair/handback point retention, current files versus pinned history, independent follow-ups, unavailable context/no fresh fallback, replay/interruption, inspection and incomplete metrics. Updated analysis labels its original inspection as historical. All 20 cases are accounted for in final-results.md and the four iteration receipts. |

The only production correction adds `caller.work.task` from the exact recorded capability target where an engineer invocation stores its assignment but omits `work.capabilityTask`. It changes consultation evidence only. The existing simultaneous-call test now compares the two actual call identities without assuming their asynchronous starts occur in argument order; its exact independent results, counts and replay assertions remain.

Pi's preservation adapter retains original native tool definitions as an immutable prefix. Ordered context and neutral activeTools record current activity; historical declaration presence alone does not establish an active tool. The witness verifies actual refusal as well as active snapshots. No neutral operation, admitted packet/hash or scheduler contract changes in this iteration.

## Checks and retained evidence

All agent commands ran from `ramify-agent/`; audit ran at the repository root. Logs, separate exit codes and supporting artifacts are under `/home/app/ramify-plan33-evidence/`.

| Check | Outcome | Evidence basename |
| --- | --- | --- |
| Required focused workflow/inspection/fork/Pi files | Exit 0; 4 files, 23 tests passed; no skips | `iteration04-final-focused-repeat.*` |
| Affected target/record/tool, authored/imported/manual/session/task/neutral/Pi regressions | Exit 0; 13 files, 303 tests passed; no skips | `iteration04-final-regressions.*` |
| Four configured type-check scopes on initial clean committed candidate | Exit 0 | `iteration04-committed-type-check.*` |
| Structural check on initial clean committed candidate | Exit 0; completed/passed; 13 owners, 763 source files; zero errors/warnings, 344 analysis limits, partial coverage | `iteration04-committed-check-self.*` |
| Authoritative `vitest list --filesOnly --json` | Exit 0; 334 configured files; all six Plan 33 new files are in guarded node project | `iteration04-final-discovery.*` |
| Read-only command examples on both retained workflow runs | Exit 0; text/JSON/detail/session results agree | `iteration04-examples.*`, `iteration04-output-examples/` |
| Released configured full nested audit | Exit 0; all six checks and nested composition passed; 334/334 files accounted for, 2,991 passed / 2 skipped tests | `iteration04-full-audit-requalified.*` |
| Committed patch integrity and clean source | Exit 0 | Candidate identity and coordinator review |

`iteration04-requalified-candidate.json` records source/branch/cwd, exact installed releases (`ramify-audit` 0.7.2, `ramify.ts` 0.4.2, Pi 0.87.1), pins and SHA-256 identities of check logs. `iteration04-process-evidence/` retains 21 file receipts from the final focused/regression window with zero allowed and zero refused process launches (including the retained concurrency-assertion failure and its corrected repeat). No ordinary process exception or new test-boundary registration was added.

Earlier unsuccessful checks remain retained: wrong-cwd toolkit-only type check, root materialization refusal, target object/type narrowing assumptions, historic declaration assertions, unsupported scripted-model attempt and concurrent-start ordering assertion. These are superseded by the named passing final checks; no skipped case was introduced to conceal them. Installed CLI foreign API refresh succeeded from the agent cwd before Pi test imports; generated catalogs were neither edited nor imported.

The first full audit failed three outdated regression assertions, with all 334 planned files executed (330 passed, 3 failed, 1 skipped; 2,988 tests passed, 3 failed, 2 skipped). Its source was `2ae3a9dfc2bd7f254feb13284ccde5237bc46322`, evidence `7d9a58d40f42b0f7e3fd54c4bb2af8c9346f76dc`. `iteration04-full-audit.*`, `iteration04-audit-first-artifacts/`, its summary and all 334 process receipts remain retained. Narrow test-only corrections retain exact dispatch equality against the recorded global invocation/outcome and map existing consultation producers; representable-only schema variants retain precise no-producer reasons. The correction run passed 9 files/69 tests, then the corrected source was cleanly committed for full requalification.

The exact released command, run from the clean committed candidate's repository root, was:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

Exit 0. Overall, invocation and nested composition verdicts passed; all six configured checks passed: patch-integrity, agent-typecheck (all four compiler scopes), agent-tests, agent-scenarios, agent-structure and agent-web-build. Planned/executed files: 334/334, missing none; files 333 passed, 0 failed, 1 skipped; tests 2,991 passed, 0 failed, 2 skipped (2,993 total). No omitted checks/units, unavailable/skipped discovered projects, unfinished/unhandled results or carried files not run; complete failure ledger has no entries, composition has zero outstanding failures. Cucumber selected zero scenarios/steps under the committed profile; this does not qualify excluded scenarios.

Qualified source `7885b9dfb102193f72535f625f422f1261cc17fc`, source tree `81a2c725cb933fb87a248bf69d4ab84c5a3c0662`. Evidence commit `7b32b969e8b2b34679f87d6e9ffbd95679bb7bba`; request `d7eee029-a761-47f0-bf39-740ec0791d57`, run `ce6aa72c-7e8e-471a-b779-0c32784f752f`, audited 2026-10-10T21:12:06.092Z. Run ref `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-10T21-12-06Z-7885b9dfb`; tree ref `refs/audited/projects/ramify-agent-f25e9a298228/by-tree/81a2c725cb933fb87a248bf69d4ab84c5a3c0662`.

`iteration04-full-audit-requalified.stdout.json`, `.stderr.log` (empty) and `.exit` retain outer results. `iteration04-audit-qualified-artifacts/reports/audit/` retains summary, each check output, expected-files.json, Cucumber NDJSON and final Vitest group-1.json. `iteration04-audit-qualified-summary.json` retains identities, per-check/project/nested verdicts and counts. Its 334 process receipts (283 ordinary, 51 registered native) are in `iteration04-audit-qualified-process-evidence/`: zero ordinary external attempts and zero refused launches; 10,725 allowed launches belong to existing native registrations. No source changed after this audit; only the final documentation receipt/status commit follows.

## Inspectable examples and limits

`iteration04-workflow-examples/ordinary-nested/` retains actual run records, content and transcripts. `consult-inv-0009:inv-0009%3Acall-1` is the engineer → local exchange; its linked global child is `consult-inv-0010:inv-0010%3Acall-1`. `capability-nested-handback/` retains five exchanges, including `inv-0012` and resumed `inv-0026` targeting cap-001, and `inv-0016` / `inv-0021` targeting cap-002. Matching text/JSON/detail/session reports are in `iteration04-output-examples/`. Usage remains explicitly incomplete in both scripted RunService examples.

`iteration04-pi-examples/nested-native-requests.json` retains exact native and wire requests, parent snapshots, child snapshots, events and returned strings. `nested-cancellation.json` retains held-request/abort/settlement evidence. These prove supplied scripted transport behavior. They do not prove live advice quality, usefulness, cost or cache savings. General inspection still reports modelConsumption unknown: fork acceptance, caller result recording and inclusion in a captured subsequent provider request are distinct facts, and semantic use of the advice remains unmeasured.

Configured exclusions remain explicit: `fixture-trials.test.ts` is the one skipped file, with two opt-in tests: “one work item, one iteration: the outline records single-iteration and one accepted iteration completes it” (status-badge-tone) and “the break is staged, and every accepted boundary passes the whole project's real suite, type check and Ramify check” (reviewer-identity). Their existing `describe.runIf` gates require `RAMIFY_AGENT_TRIAL`; disposable fixture preparation uses npm ci/cache/registry and was not requested. Default Cucumber executed zero selected scenarios/steps. Its committed paths/profile exclude fixture/golden paths and `@ramify-pending`; excluded or unbound scenarios remain unrun, not passed. No new skip or exception was introduced. The composition registry explicitly retains no-producer reasons for shared-schema local/capability roles in dispatch globalTarget and representable-only delivery not-recorded; runtime records unknown until it observes an actual caller result. Structural analysis is partial with 344 limits. The owned `/tmp/ramify-plan33-api` daemon was stopped after final materialization; before/stop/after receipts are retained. No other endpoint was stopped.
