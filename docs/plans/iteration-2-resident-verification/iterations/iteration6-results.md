<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 6 results: edit fixtures and report assertions; quick-service evidence blocked

**Date:** 2026-09-11. **Status:** incomplete. The fixture variants and guarded mutations are implemented and have direct batch smoke evidence. The prerequisite incremental engine, context manager, shared service and quick environment remain absent. None of this iteration's twenty required quick instances executed.

## Prerequisite and scope evidence

Work stayed in `/tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification-iter-6`, on branch `workflow-iter/iteration-2-resident-verification/6`, starting at `9a89323`. The initial checkout was clean. Read CLAUDE.md, the iteration-work and testing skills, development guides, iteration 6's read-first contracts, scope, inventory, reference witnesses and predecessor results. `npm run worktree:prepare` provisioned both independent packages successfully.

Live workflow detail reports iterations 3–5 completed with publication accepted. Their source capabilities remain absent independently of that control-plane state:

- Analysis has no `analyzeIncrement`, `resolveProject`, `IncrementRun` or `RetainedAnalysis`; project has no `resolveProjectRoot` or `ProjectResolution`.
- Contexts has primitives and standalone history, but no `AnalysisDriver`, `ContextManager` or `createContextManager`.
- Daemon has ports, vocabulary and private request validation, but no shared service or codec-backed direct connection.
- Root has neither `resident-assembly.ts` nor `src/tests/quick-environment.ts` / `createQuickEnvironment`.
- There are no iteration 3 I2-11 handlers to reuse. `plan2-runtime.ts` activates only `harness-gate`.

Iteration 6 owns harness scenarios and owner fixes for defects those scenarios expose; restoring the entire missing providers from iterations 3–5 is outside that scope. The implementation therefore completes the independent fixture work without introducing replacement context types, a fake service, batch substitution in an I2 handler, or an unsupported capability registration.

## Implemented fixture and mutation work

All source changes are in the independent `scripts/reference-harness/` scope. Application owners, declarations, package entries, Plan 1 handlers and expectations, Plan 2 registration and managed plan contracts are unchanged.

### F variants

New `fixtures/plan2/project.ts` starts from the unchanged Plan 1 three-owner recipe and prepares four explicit preconditions before a future context opens:

- `type-to-runtime-merge`: the consumer imports `Type` without a type modifier; the guarded edit adds `export const Type = 1` beside the existing interface. The unchanged importer changes from a type-only availability decision to a value decision with no denial.
- `alias-identity`: baseline `export default value` and changed `export { value as default }` select the same provider-owned `value`. Both exposures agree on its existing browser tag. This deliberately avoids replacing the recipe's separate `defaultValue` function and mistaking that identity change for preservation. The catalog originals are equal before and after.
- `config-change`: the consumer uses `@provider/interfaces/api.js`; removing the existing `@provider/*` mapping produces located `unresolved-target` coverage and no permission decision. Exact restoration restores the allowed decision.
- `missing-file-appears`: the consumer imports `./later.js` while `later.ts` is absent. Exclusive creation produces the same-owner allowed decision. Missing importer anchors and existing targets are rejected before overwriting any file.

The factory uses the existing `replaceExactlyOnce` guard. The inherited recipe's other bytes remain intact outside the alias variant's explicitly required setup changes.

### R copies and shared mutations

New `fixtures/plan2/reference.ts` uses the existing isolated copy facility. Ordinary R copies link their reference dependencies. The shim variant instead copies Vite, including its relative declaration references, into the disposable fixture and links the other dependencies. The shim mutation rejects a target whose real path goes through a shared dependency symlink, so it cannot alter the installed reference package through ordinary R preparation.

New `resident-mutations.ts` contains eleven guarded text edits:

1. W2 `remove-hop`, removing only `createCatalogRouter`.
2. K's core header gains `ui`.
3. C vocabulary gains `ResidentVocabulary`, expanding C1 and W1.
4. `RecordId` loses its export, shrinking the vocabulary contract.
5. C vocabulary re-exports K's `inspect`, producing `foreign-original`.
6. F's `Type` gains its value declaration.
7. F's default export changes spelling while preserving its original.
8. F's provider path mapping is removed.
9. The private CSS-module shim loses its default export; both existing CSS consumers receive located `missing-export` diagnostics while their resource targets stay unchanged.
10. W's README paragraph changes.
11. K gains `expose-src Missing from "nowhere.ts" to parent`.

`applyTextMutation(root, mutation, true)` reverses the same guarded edit for restore-hop, invalid recovery and revert controls.

The separate `moveHistoryToTesting` operation moves K's private `history.ts` into `src/tests/`, repairs the helper's relative vocabulary import, and adjusts its ordinary and testing importers. It validates all three anchors and the absent destination before its first write. The ordinary catalog importer receives `testing-origin`; reversing the move restores every original file byte. These operations run on disposable fixtures; a filesystem failure during a multi-file write fails the fixture and is not represented as an atomic filesystem transaction.

Returned path lists are authored edit hints only. Future handlers must independently assert the driver's observed `changed`, including the W-description-only expectation for provider influence.

### Tests and handoff documentation

New `resident-fixtures.test.ts` authors 18 cases under the harness's existing Vitest discovery. They cover the four F effects, unchanged inherited fixture bytes, importer/creation guards, seven exact R edit/restoration controls, missing/repeated W2 anchors, the actual testing-origin effect, move preflight without partial edits, shared-shim rejection and private-shim resource behavior.

The harness README documents setup, mutation reuse and the remaining service boundary. No owner implementation changed, so no cross-owner regression fix was necessary.

## Verification

| Command | Result and scope |
| --- | --- |
| `npm run worktree:prepare` | Passed; example and site dependencies provisioned. |
| `npm run type-check` | Passed all four configurations after the final changes, including all 18 authored cases. |
| `npm run build` | Passed. The subsequent shim guard and test changes are confined to the independent harness, excluded from production compilation. |
| `npx tsx .reference-work/iteration6-fixture-smoke.ts` | Passed six direct assertion groups: four F variants, private shim edit, and helper move/restoration, using real `analyzeProject` sessions. |
| `npx tsx .reference-work/iteration6-reference-smoke.ts` | Passed seven reference edit groups with independent batch expectations and restored baseline counts: W2 removal, tag change, wildcard add/remove, foreign original, README edit, invalid K description. Each edit changed only its authored file. |
| `npx tsx .reference-work/iteration6-mutation-guards-smoke.ts` | Passed three direct groups: shared/private shim isolation; W2 and move preflight rejection without partial writes; later-file importer guard and exclusive creation. |
| `npm run reference:verify -- --plan 2 --iteration 6` | Failed, exit 1: 84 required, 4 passed, 0 failed assertions, 172 not executed overall. Eighty required instances lack capabilities: 18 increment, 27 contexts and 35 daemon-service, including all 20 assigned here. The remaining 92 unexecuted records belong to future iterations. |
| `npm run check:self` | Passed: completed execution, complete coverage, 11 owners, 161 source files, 11 resources, 1,894 accesses; zero errors, warnings, denials or analysis limits. |
| `git diff --check` | Passed. |

Two local development errors were corrected without changing an acceptance expectation: the first scratch smoke read `question.request` instead of the actual `question.selection.request`, and the first type-check identified a nullable `SourceAccess.specifier` in the new test. The corrected smoke and final type-check passed. The initial smoke log is preserved as `.reference-work/iteration6-fixture-smoke-initial.log`.

Evidence is in ignored scratch space: the three named smoke scripts and their corresponding `.json` / `.log` files, `iteration6-type-check.log`, `iteration6-build.log`, `iteration6-self-check.log`, and `iteration6-plan2-gate.log`. The portable gate report is `.reference-work/reports/plan2-iteration6-d7023ef9-b361-47ee-a259-09c4bb24eb38.json`. Successful fixture runs release their isolated directories; the initial failed scratch run was preserved explicitly for diagnosis.

No Vitest/Cucumber regression, scenario-coverage check or sealed-file check was run locally, following the supplied automation-only policy. The 18 authored cases have no runner verdict yet. Direct fixture/batch smoke does not replace that verdict, execute an I2 quick instance, or establish resident lifecycle cleanup.

## Unfinished exit criteria and checklist

All I2-02 and I2-09 records remain unexecuted through the required direct channel. No scenario handler or `daemon-service` capability is registered here. The driver acquisition-failure wrapper also remains unimplemented because there is no real driver or quick-service assembly to wrap.

Unestablished evidence includes watcher withholding/delivery, acknowledgment/capture ordering, coherent freshness, expected revision reuse, content expectation matching and supersession, unobserved-input handling, driver-observed changed paths, watch notifications, atomic invalid/current publication, lastValid retention/advancement, incremental rerun/reuse and fingerprint assertions, unpublished acquisition failure and recovery, and service disposal accounting.

The reviewed contracts and inventory explicitly require `verified: false` for an unpublished incomplete report. The iteration exit's general `verified: true` wording applies to sealed synchronized deliveries; a future resolver-failure handler must preserve the explicit exception, not widen the check or claim a seal.

Checklist disposition:

- `functionalRequirementsSatisfied: false`: the required quick-service providers and all twenty direct-channel instances are absent.
- `newCodeCoveredByTests: true`: the implemented fixtures and mutation paths have 18 authored harness cases.
- `allNewTestsPass: false`: the new cases await an automated Vitest verdict. No new runner failure is being hidden; no local runner was invoked.

The checklist timestamp records this incomplete checkpoint. Managed results and checklist are written through MCP, and the draft is committed on the assigned checkout's branch before publication. Submission does not establish iteration completion.

## Recommendations for Next Iteration

Restore the providers through their owning tasks: resolve the architecture-review disposition recorded by iteration 3, implement/expose incremental analysis and project resolution and pass its 18 instances; implement the context manager and pass its 27; then finish iteration 5's shared service, production codec/direct connection, real analysis driver and quick environment and pass its 15.

Resume iteration 6 against those actual contracts. Reuse these fixture variants and mutation helpers in the twenty quick handlers, add the one-shot acquisition read failure around the real driver, and assert each resident expectation without substitution. Iterations 9 and 11 can reuse the same causes only after their required direct-service, CLI and process boundaries exist. Keep the Plan 2 gate failing until those capabilities and assertions actually execute.

## Single self-assessment remediation

Re-read iteration6.md, the original owner boundary and automation-only check policy, both false checklist items, the current contracts and the actual provider source. This repair starts at `d7b1a3f` on the same assigned branch and checkout. The checkout was clean.

Live workflow detail reports iteration 6 at `validate_output_retry`. Source still contains no `analyzeIncrement`, `resolveProjectRoot`, `AnalysisDriver`, `createContextManager` or `createQuickEnvironment`; the runtime still registers only `harness-gate`. The workflow check-results inventory has no iteration-6 or regression-6 run. Consequently there is neither a service boundary through which to execute the twenty instances nor an automated verdict for the new harness cases.

### Focused completion of report assertions

The seven R text-edit cases previously checked permanent byte-level controls while their semantic assertions existed only in ignored smoke scripts. New `scripts/reference-harness/resident-expectations.ts` supplies reusable, recorded report assertions for those cases, and `resident-fixtures.test.ts` now calls them over the real batch reports as supporting fixture evidence:

- W2 removal requires exactly the root's `createCatalogRouter` denial with `not-visible`.
- The header edit requires every core original, including testing originals, to gain `ui`; both the adapter's `getRecord` and `inspect` value accesses must fail that importer-tag requirement.
- C1 and W1 are selected by their exact canonical providers. Each starts with the independent literal list of seventeen vocabulary names. Adding `ResidentVocabulary` expands both contracts with the same independently specified original; removing `RecordId` shrinks both and yields a located consumer `missing-export` and an explicitly missing selection.
- The foreign re-export and missing K file must produce invalid reports with located declaration errors, no model and no permission decisions.
- The README edit must return the new paragraph and preserve all access results, expanded contracts, diagnostics and coverage.
- Every restored fixture must return the complete original report after replacing only `runId`, in addition to the existing exact file restoration and independent baseline counts.

Each of the seven cases also passes the unchanged baseline to its edit assertion and requires rejection. The new functions accept the harness's existing `Assertions`, allowing later quick handlers to reuse them without losing recorded assertion evidence. They add no analysis implementation, context contract, mock service or handler registration. All freshness, event, reuse and publication checks still belong at the missing real service boundary.

There are still 18 authored harness cases; seven now include the permanent semantic checks and unchanged-report controls. The original fixture/mutation implementations and all application owners are unchanged by this repair. The harness README documents the new assertion helper.

### Remediation verification

- `npm run type-check`: passed all four configurations after the final change.
- Initial `npx tsx .reference-work/iteration6-remediation-smoke.ts`: W2 and tag-change passed, including full report restoration, then the new wildcard selector failed because it compared declaration-relative provider names with canonical linked-provider labels.
- Corrected only that selector to the existing public report representation: C1's root-relative vocabulary path and W1's fully qualified child owner. The exactly-one-statement condition and independent vocabulary membership expectations remain intact.
- `npx tsx .reference-work/iteration6-remediation-smoke.ts wildcard-add wildcard-remove foreign-wildcard-invalid readme-edit invalid-description`: passed all five remaining groups. Together with the unchanged W2/tag branches from the initial run, all seven groups passed 67 recorded direct assertions and seven unchanged-report rejection controls.
- `git diff --check`: passed.

Evidence: `.reference-work/iteration6-remediation-type-check.log`, `iteration6-remediation-smoke.ts`, `iteration6-remediation-smoke-initial.log`, `iteration6-remediation-smoke.log` and `iteration6-remediation-smoke.json`. The initial failure and its preserved disposable fixture remain available for diagnosis; successful runs remove their owned fixture directory.

Build and self-check were not repeated: this repair changes only harness assertions, tests and their README, with no production source or declaration change. The iteration gate was not repeated because no provider capability or handler registration changed; its recorded result remains 4 passed out of 84 required, with all twenty iteration-6 instances unexecuted. No Vitest/Cucumber regression, scenario-coverage or sealed-file check was run locally, as required by the original check policy. The new smoke does not supply an automated Vitest verdict or quick-service evidence.

### Current checklist and remaining work

- `functionalRequirementsSatisfied: false`: report assertions are more complete, but the missing provider operations, context manager, shared service and quick environment still block all twenty required direct-channel instances and the real-driver acquisition-failure wrapper. Restoring those entire predecessor capabilities is outside this iteration's harness/defect scope.
- `newCodeCoveredByTests: true`: all implemented fixture/mutation paths and the new semantic assertions have authored harness coverage, including positive, negative and restoration controls.
- `allNewTestsPass: false`: no iteration-6 automated run is available; all 18 cases still await their Vitest verdict. The focused direct smoke passes after the selector correction, but is not represented as that missing runner evidence.

Both managed deliverables are updated through MCP and this focused repair is committed on the assigned branch. No `workflow.publish_iteration_draft` call is made in this remediation; validation reruns and publication are delegated to the workflow as instructed. The provider-restoration recommendations above remain necessary.
