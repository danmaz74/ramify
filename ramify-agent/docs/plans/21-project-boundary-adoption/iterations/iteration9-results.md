# Iteration 9: configured audit delivery results

**Date:** 2026-10-08. **Status:** iteration 9 source qualified by the
`ramify-audit@0.7.2` normal audit of clean `392a1367`. It was requested as
ramify-partial (defaulted), executed as ramify-partial at chain depth 1 over
the failed full audit of `286ca017`, and passed. The branch push awaits
coordinator review. **Entry source:** `4ee60235` (clean).
**Source commits** on `feat/plan21-project-boundary-adoption`:

- `5942a950011622798f46ccfc763877e58a258cae` (tree
  `7a899089ef75d45b5723e4ac4cc3c5d3d42dc61b`): deliver gates through the
  configured committed audit;
- `7a5f8061e9f4c8335fdf748aeadc9889c20f9ffa` (tree
  `d33fc1ea7f50ab533048035f83886756b8927d33`): run the agent's own scenarios
  as a configured audit check;
- `52f6c45cb8a3440803dbb511a805400de782e403` (tree
  `3d923fa5d18a79e2c69d4070b12310557561507d`): witness configured audit
  delivery over real projects;
- `286ca017d360b642610ca82f713cb2a222684fc1` (tree
  `df6dc5e0de4ff9a62a0dce0f5d3bbd292aa9cb26`): describe configured audit
  delivery and scenario checks;
- `392a1367fc3e937d84b101e8abd10ec296ff7fd8` (tree
  `ba2782aec5570c32cbc832b172172777609e00f1`): align the remaining gate
  fixtures with configured audit delivery, after the first delivery audit.
  This is the final audited source.

This is intermediate Plan 21 qualification work, not production enablement.
The provider pair is unchanged: exact `ramify.ts` 0.4.1 and `ramify-audit`
0.7.2. No provider capability was missing. Run policy stays `run-policy/7`;
no policy bump. No protected document was edited, nothing was pushed by the
implementation agent and iteration 10 was not started.

## Actual changes

**One committed execution path.** Every committing checkpoint commits its
candidate and calls `executeConfiguredGate`, which asks the configured audit
port (`createConfiguredAudit`, `subs/audit`) about that commit. The port
reads the captured `ramify-audit.json` definition through
`requestFromCommittedConfiguration` and runs `createAuditService` with a
private or machine test lock. Iteration, contract, breaking-iteration and
work-item gates request `project-default`; the final gate and readiness
request `full`. The gate plans no checks of its own (`checks: []`). It records
`gate.audit` (`GateAuditRecord`) and the provider's result and raw check
records under `gate.provider`. The harness rules (write scope, scratch
safety, guarded files) are still judged beside the audit. Verdicts:

- a composed `fail`, a failing harness rule or `setup-command-failed` is
  `failed`/`check-failed`;
- an audit that did not complete, or completed `indeterminate`, is
  `not-verified`. Its cause is `timeout` when the gate's own bound expired or
  the provider reports a timeout, lock-wait or setup timeout, and
  `infrastructure` otherwise.

`commands` lists only commands the harness itself executed, so a gate
answered by the provider has none.

**Captured policy.** Readiness captures the committed definition.
`sameAuditPolicy` compares a later commit's definition with it, ignoring
only `sourceCommit` and key order. A changed blob, ignore list, check list or
workspace preparation is refused before anything executes ("Captured audit
policy conflicts with ramify-audit.json"); the gate is
`not-verified`/`infrastructure`.

**Applicable reuse, not force/refusal.** `configuredResultRefusal` accepts a
fresh record of the requested commit, or the provider's `reused` answer whose
`sourceCommit` is the request and whose audited commit is the record's. It
refuses:

- old-schema or foreign evidence;
- evidence of another project, definition blob or check universe;
- a partial chain answering a full request;
- a selection that does not account for every configured check;
- a selected check without its record.

A reused answer keeps both source identities, `ignoredChangedPaths`, the
original report refs and its applicability, and records no receipt. The
`force` option and the "unexpected completed audit" refusal are gone.

**Scenarios as configured checks.** The agent's `ramify-audit.json` gains
`agent-scenarios`. It runs `npm run test:scenarios` (Cucumber through tsx)
with the `cucumber` parser, `continueOnFailure` and `onFailure: record`,
depends on `agent-typecheck`, and uses the new `cucumber.json`, whose default
profile is `not @ramify-pending` over every owner's `src/tests/features`. The
agent has no feature files yet, so the check runs zero scenarios and passes.
Per-scenario results (`checks/scenario-results.ts`, `GateScenarioResultView`)
come from the raw Cucumber messages the provider appends. They are for
display and diagnostics only. Audit outcomes never create, revise or
withdraw an architect's report.

**Engineer briefing.** No role has `run_scope_tests`. The engineer prompt
names:

- the scenarios to bind, with their feature files and binding rules;
- each assigned owner's test area as text;
- the shell's named focused runs, with whole-suite runs refused.

It says the harness runs no test selection of its own. A failed gate audit
continues the same engineer session with the digest ("## The gate did not
pass", the audit line, each check's status and the end of its output).

**Removed.** See the inventory below. The `acceptance` section of
`ramify-agent.json` (modes, `runner`, `support`), the readiness
`acceptance-runner` step, the `scopedTests` timeout and the readiness/gate
harness inventories are gone. So are the expected/run comparison,
`passWithNoTests` handling and the empty-selection, required-suite-missing
and discovery-failed causes.

## Acceptance mapping

| Case | Evidence |
| --- | --- |
| PB3-T01 | `audit-check-execution.test.ts` F2 witness ([evidence](../evidence/iteration9-audit-delivery/iteration9-f2-runner-truth.json)): the installed provider narrows two Vitest configurations and a Cucumber check by ownership. `ga-0002` selects only `subs/a/subs/grand`, `ga-0006` selects `.` and `subs/a/subs/grand` but not the child `subs/a` between them, and `ga-0007` selects only `subs/ab` (a path-prefix collision with `subs/a`). The runner-excluded `excluded.check.ts` never runs. There is no harness inventory. |
| PB3-T02 | The same witness: custom `*.check.ts` names, a second configuration with its own root (`checks/aux.test.ts`, auxiliary to `src/tests`) and runner exclusions are the runner's discoveries at the full baseline (`ga-0001`). |
| PB3-T03 | `ga-0002` runs the new `new-grand.check.ts` on the next attempt. `ga-0006` deletes it and the runner no longer reports it. The excluded file creates no obligation: no gate names it. |
| PB3-T04 | `ga-0003`: an ambiguous step fails the configured `scenarios` check, giving `failed`/`check-failed`/`repair` with the runner's output. "configured gate outcomes" covers a failing configured command, a failing harness rule, a setup command that fails (`setup-command-failed`, no evidence) or times out (`timeout`), cancellation (`cancelled`, no refs), the gate's bound (`timeout`) and recovery of the same attempt without re-execution. None creates or withdraws a report (`scenario-states`, `iteration-source-delivery`). |
| PB3-T05 | `ga-0004`: a README-only change selects no module (`selectedModules: []`), runs no narrowed test, reruns the carried `sc-003` failure and composes `fail`. `ga-0008`: a runner configuration that discovers nothing makes `aux-vitest` fail, and the harness supplies no pass. |
| PB3-T06 | Every F2/F4 gate records the configuration identity, `requestedSourceCommit`/`auditedSourceCommit`, requested and executed mode, fallback reason and report refs (`GateAuditRecord`). `completed-audit.test.ts` (10 tests) and `audit-conformance` "fact 14" cover refused evidence. There is no assignment/scenario certification API and no harness dirty audit (`run_scope_tests`, `focused-audit-check` and `runFocusedCheck` removed). |
| PB3-T07 | `engineer-briefing.test.ts`: no role's prompt package, with or without the capability workflow, mentions `run_scope_tests`, `acceptance:quick`, quick mode or scenario check mode; the briefing carries test areas. `iteration-source-delivery.test.ts` (F5): the first prompt carries the test area, the whole-suite refusal and `### sc-001 (pending)`; after the failed `ga-0002` the same session continues (`mode: continue`, same session id) with the digest; `sc-001` is reported once. `shell-tool.test.ts`, `engineer-submission.test.ts`. |
| PB3-T08 | F2: the committed `not @ramify-pending` profile runs the bound `sc-001`/`sc-003` and leaves the pending `sc-002` out (`ga-0001`); the partial `ga-0002` runs only `sc-003`; the full audits run all; an ambiguous step is the producer's failure (`ga-0003`). The agent's own `agent-scenarios` check is in the committed definition and ran in the delivery audit. The harness scenario check, its modes, selection table, written profiles and `acceptance` configuration are removed (`project-config.test.ts`, `run-policy.test.ts`). |
| PB3-E01 | `ga-0004` (module README) and F4's `docs/guide.md` select no module; carried failures and fallback reasons are the provider's (`selectedModules`, `carriedFailures`, `fallbackReason` are recorded verbatim). |
| PB3-E02 | `ga-0008`: a detected runner configuration change falls back to full (`runner-configuration: vitest.aux.config.mjs …`). `ga-0009`: restoring it restores `ga-0007`'s tree, and the provider answers with that record (`reuse.auditedCommit` = `ga-0007`'s commit, same report refs, no command). The harness adds no fallback. |
| PB3-E03 | F4 ([evidence](../evidence/iteration9-audit-delivery/iteration9-f4-ignored-reuse.json)): a non-Ramify root requests `full`. A docs-only commit is answered by reuse (`auditedSourceCommit` = first, `ignoredChangedPaths: ['docs/guide.md']`, same report, the command counter unchanged); a source change runs fresh. |
| PB3-E04 | F4 ([evidence](../evidence/iteration9-audit-delivery/iteration9-f4-ignore-policy.json)) and F2 `ga-0010`/`ga-0011`: an ignore-list change is refused under the old capture, executing nothing. A run that captured it starts a new full baseline (`baseline-incompatible`), and a later notes-only change is reused from the new baseline. Schema-3 or foreign evidence is refused (`completed-audit.test.ts`). |
| PB3-P03 | Readiness and every gate use the provider's discoveries and required checks (F2 `ga-0001`: custom names found, excluded file not demanded). `readiness.test.ts` covers the readiness full request. |
| PB3-P04 | `sameAuditPolicy` unit tests; F2 `ga-0010`, F4 policy witness; readiness compatibility uses the same comparison (`readiness.ts`). |

## Removal inventory

Deleted source:

- `subs/harness/src/checks/scenario-check.ts`, `scenario-findings.ts`,
  `selection.ts`;
- `subs/harness/subs/audit/src/scenario-report.ts`;
- `subs/harness/subs/scenarios/src/messages.ts`, `profiles.ts`.

Deleted tests and fixtures:

- `fixture-acceptance`, `focused-audit-check`, `readiness-nested-packages`,
  `scenario-check-integration`, `scenario-check`, `scenario-findings-run`,
  `scenario-findings` and `test-selection` (`.test.ts`);
- `subs/scenarios/src/tests/profiles.test.ts`, `fixtures/record-streams.ts`
  and the nine recorded `streams/*.ndjson`.

Removed exports and behaviour, among others:

- the scoped test tool (`createScopeTestsTool`, `runScopeTests`,
  `scopeTests*`);
- `TestSelection`/`resolveTestSelection`, `scopedChecks`, `allProjectChecks`;
- the scenario check (`ScenarioCheck*`, `ScenarioMode*`, `scenarioCheckView*`,
  `planScenarioFindings`, `buildScenarioProfile`, `matchSupport`);
- `runFocusedCheck`, `createAuditCheckExecution`, `workspacePreparationOf`,
  `unexpectedCompletedAudit`;
- `acceptanceModeSchema`, `CheckHarnessGuardedChange` and the
  `acceptance-runner` readiness step.

Replacements: `createConfiguredAudit`/`executeConfiguredGate`,
`configuredResultRefusal`, `sameAuditPolicy`, `checks/scenario-results.ts`,
the `agent-scenarios` check with `cucumber.json`, and the tests above.

## Focused verification

All commands ran from `ramify-agent/` with explicit files. No `npm test` or
unrestricted `vitest run` was used.

- The 57 test files this iteration added or changed before the first audit: 56 passed and 1 skipped
  (the opt-in `fixture-trials`); 455 tests passed and 2 skipped, in 1,015 s
  ([log](../evidence/iteration9-audit-delivery/focused-harness.log)).
- `npm run type-check` exited 0 for all four compiler configurations
  ([log](../evidence/iteration9-audit-delivery/type-check.log)).
- `npm run check:self` passed with 0 errors, 0 warnings and 310 nonblocking
  analysis limits over 12 owners, 569 source files, 47 resources and 11,306
  accesses ([log](../evidence/iteration9-audit-delivery/check-self.log)). The
  only exposures added replace removed ones: `sameAuditPolicy` (audit to
  harness) and `GateScenarioResultView`/`gateScenarioResultViewSchema`
  replacing the scenario check view.
- After the first delivery audit, the five files it failed passed 116/116
  ([log](../evidence/iteration9-audit-delivery/audit-fixes.log)), and
  type-check and check:self were rerun on that tree with the same results
  (the logs above are from that rerun).

## Delivery audit

From the repository root, on clean committed heads:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json
```

| Source | Window (UTC) | Requested mode | Executed mode | Result |
| --- | --- | --- | --- | --- |
| `286ca017` | 03:55:41–04:12:28 | ramify-partial (defaulted) | full (`baseline-incompatible`: another check universe) | **fail**: 47 tests in 5 files |
| `392a1367` | 04:16:49–04:33:55 | ramify-partial (defaulted) | ramify-partial, chain depth 1 | **pass**: 202/203 files, 0 failed |

- **First audit, a defect of this iteration.** Adding `agent-scenarios`
  changed the check universe, so the provider executed a full audit, a new
  baseline. Five files that this iteration had not touched still built
  gates the old way: `run-page`, `protocol-contract`,
  `execution-map-projection`, `composition-recovery` and
  `work-item-api-views` ([projection](../evidence/iteration9-audit-delivery/delivery-audit-1-failed.json)).
  Their fixtures carried harness commands, selections and scenario-check
  summaries, or expected the work-item gate rather than the iteration gate
  to make the commit. `392a1367` fixes them, and also the browser
  acceptance fixture, which the audit does not run. No test was weakened:
  each assertion now states the configured-audit behaviour.
- **Second audit.** The projection is
  [delivery-audit.json](../evidence/iteration9-audit-delivery/delivery-audit.json).
  The raw JSON is `/tmp/pb3-it9-audit.json`, with its SHA-256 recorded
  there.
- **Run.** The audit took 1,024.8 s and the CLI exited 0, with status
  `completed` and `overall: pass`.
- **Identifiers.** Request `1d5708d4-96e6-48a5-8c0d-c9dc043abeaf`, run
  `3f94f5e6-d609-4338-b0c6-11ae0d960de5`, report
  `38803658136b9c88433ebdd00374db4f541db8e8`. The chain root is report
  `800a0dc3dfe7c40b93ba52066f72e4cd23ca461b`, the full audit of `286ca017`.
- **Selection.** Scoped over the modules `.`, `subs/harness`,
  `subs/harness/subs/agent/subs/pi`, `subs/harness/subs/audit` and
  `subs/web`. All six checks were selected and none omitted. The 47 carried
  failures were rerun and pass, so the composition has 0 outstanding
  failures.
- **Checks.** All six passed: agent-scenarios (0 scenarios; the agent has
  no feature file yet), agent-structure (17.4 s), agent-tests (988.8 s),
  agent-typecheck (5.5 s), agent-web-build (0.6 s) and patch-integrity.
- **Expected files.** 203 expected and 203 run (`partial-answer`):
  `complete`.
- **Counts.** Files: 202 passed, 0 failed and 1 skipped (the opt-in
  `fixture-trials`). Tests: 1,586 passed, 0 failed and 2 skipped.
- **Ledger.** The failure ledger is complete with zero entries.
- **Run conditions.** Lock wait was 0 s for both invocation groups. There
  was no cancellation and no skipped required command, and stderr was empty.
- **Flakes.** None was observed.

## Deviations and limitations

- **Standalone in-place diagnosis remains.** The `session` command still uses
  `createInPlaceCheckExecution`: setup, type check and a complete Ramify
  check, and no dirty audit. It is not a run gate. PB3-R02 (iteration 11)
  decides it. Its `dispatchHarnessCommand` Vitest branch in
  `focused-check.ts` is now unused.
- **Acceptance-trial real Cucumber variant deleted.** The env-gated variant
  drove the removed harness scenario check. Real Cucumber execution is now
  witnessed by F2 and the agent's own `agent-scenarios` check.
- **Gate view passes the provider result unbounded.** `gate.provider` is
  `z.unknown()` in the run protocol and the work projection
  (`interfaces/protocol/runs.ts`, `projections/work.ts`). This predates the
  iteration, which only adds the raw check records to it.
- **Fixtures have no `ramify-audit.json`.** `collection-review` and the
  capability fixtures commit none, so lifecycle tests answer gates with
  scripted configured audits (`passingAudit`, `mappedAudit`,
  `localCommandAudit`), which use the same `sameAuditPolicy` as production.
  `collection-review`'s `cucumber.js` has no `not @ramify-pending` profile.
- **Plan 3 K3/K8 evidence.** Their tests exercised the removed harness
  selection, so the Plan 3 matrix now names this results note as their
  document.
- **Prompt guarded-file wording.** The engineer and local architect
  procedures describe guarded files as the runner and compiler
  configuration, manifests and contracts. They do not name
  `ramify-audit.json`, whose change is refused as a policy conflict rather
  than a guarded change.
- **Tree-identical reuse.** The provider answered `ga-0009` with an earlier
  commit's record because the trees are identical, with
  `ignoredChangedPaths: []`. The harness accepts it as applicable reuse.
- **Evidence production.** Witness evidence is written by the committed
  `audit-check-execution` test when `PLAN21_ITERATION9_EVIDENCE` names a
  directory. Commit IDs are those of temporary repositories.
- **Later commits on the branch.** While the second audit ran, five
  commits not made by this iteration landed on the branch in this worktree
  (`2683945c` to the merge `e1ebdb75`, Plan 22 optimization 1). They include
  a source change to `run-command-with-cleanup.sh` and its test. Uncommitted
  Plan 22 drafts (`docs/README.md`, `docs/plans/22-test-boundaries/`) were
  also present. The audit qualifies `392a1367` only; those commits and drafts
  were neither audited nor touched here.
- This receipt commit is documentation only. The audit checked source
  `392a1367`, not the receipt commit.

## Protected-file comparison

The baseline taken at entry `4ee60235` lists the 16 tracked
`.principles.md`/`.spec.md` files, exactly the tracked set at `392a1367`.
All 16 match the baseline at the audited source and in the index and
worktree. They match at the later branch head `e1ebdb75` too. No protected
path is staged, unstaged, untracked or renamed, and none changed in any
commit since entry
([comparison](../evidence/iteration9-audit-delivery/protected-comparison.json)).
No protected document needed a patch. The two pending authorized
`harness.spec.md` patches remain the coordinator's and were not applied.

## Request/result contract for iteration 10

Iteration 10 extends these with nested results:

- `ConfiguredAuditInput`: `{ projectRoot, sourceCommit, configuration
  (captured CommittedAuditConfiguration), mode: 'project-default' | 'full',
  runId, attemptId, signal?, started?, waiting?, lockAcquired? }`;
- `ConfiguredAuditResult`: `status` (`completed | failed | cancelled |
  refused`), `requestId`, `mode`, `requestedSourceCommit`,
  `auditedSourceCommit`, `reused`/`reuse` (`auditedCommit`,
  `ignoredChangedPaths`, `requestedMode`, `resolution`),
  `requestedMode`/`executedMode`/`fallbackReason`, `verdict`, report refs,
  the raw provider result and check records;
- `GateAuditRecord` on `GateAttempt.audit` and `gate.provider { result,
  checks }`;
- `sameAuditPolicy(current, captured)` and `configuredResultRefusal(result,
  configuration, mode, sourceCommit)`.

## Next-iteration prerequisites

Iteration 10 (nested verification) may start after the coordinator reviews
this receipt, applies or schedules the pending `harness.spec.md` patches and
pushes the branch, verifying `HEAD == origin/feat/plan21-project-boundary-adoption`
on the live remote. It builds on `run-policy/7`, the exact `ramify.ts` 0.4.1
/ `ramify-audit` 0.7.2 pair and the contract above.
