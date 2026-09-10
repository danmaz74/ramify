<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 14 results: Reference gate

Status: implemented and locally verified. These results establish the iteration-14 gate, not Plan 1 completion or automated acceptance. This file was restored through the workflow tool during missing-output recovery.

## Scope and revision

Work began at `610b869b3c5c0d8d9ffbc766c1defddcac1e196f` on `workflow/iteration-1-project-verifier` in the authoritative checkout, with a clean working tree. Workflow detail reported iteration 13 completed and accepted. Read the project instructions and applied the iteration-work and testing skills.

Implementation is committed as `9247480` (`Implement iteration 14 reference verification gate`): 25 files, 803 insertions and 323 deletions. Recovery restored the managed deliverables from retained implementation evidence; it did not change implementation code.

Changes belong to root package scripts and the independent reference harness. No application runtime source, reference application source/configuration, model principle, module declaration, public engine contract, reviewed matrix membership or prerequisite changed.

## Delivered

- Added `npm run check:reference`, invoking the compiled executable with `check --root examples/collection-review`.
- Registered all 15 iteration-14 instances while preserving the independently reviewed inventory of 308 instances.
- Added a real-session reference baseline asserting all 15 owners, every owned source file, all 33 reference exposure statements, private originals, adapter factories, shared vocabulary, AppRouter forwarding identity, aliases, lazy ReviewPanel selection, import-type queries, distinct CSS resources and the standalone testing module's side-effect hook. Application selections have resolved, allowed decisions; proven external selections are reported separately.
- Replaced the hand-written violation total in `reference:report` with the compiled checker's findings. The report executes the matrix and actual example type-check, Vitest, Vite and Cucumber tiers, retaining separate family expectations and pending matrix instances. Dry-run output remains inventory only and labels violations as unmeasured.
- Added test discovery evidence for 45 toolkit test files across nine owners and all 16 mandatory moved-test destinations. Verified compiler inclusion, 20 reference Vitest files and its Cucumber scenario. An isolated testing-module fixture runs both an ordinary `src/ordinary.test.ts` and a nested `src/tests/nested.test.ts`.
- Invoked the actual `production:files` command for the toolkit, reference and isolated testing fixture. Assertions independently name ordinary interface inclusions and testing-source exclusions, including nested tests and `integration-tests/src/`. The toolkit's 90 selected files produce exactly 180 JavaScript/declaration artifacts in a clean copied build; the reference selects 32 files. The testing fixture retains only its provider interface and consumer, producing four artifacts. Complete type-check and test discovery remain intact.
- Added six gate sabotage variants: removed record, disabled handler and failed assertion, each in intermediate and full mode. Required membership remains independent of available handlers. Positive controls and explicit target failure reasons prevent pending future work from concealing a regression.
- Added portable report persistence with revision, source/build identities, runtime/compiler versions, command, durations, scope, capabilities, expectations, per-instance assertions, diagnostics, coverage and pending work. Reports use detached plain data collected in a run-local context, check source/build stability across execution, normalize scratch/machine paths and enforce a 32 MiB limit with explicit failure rather than truncation.
- Added finite subprocess handling with process-group cleanup on timeout or output limit.
- Repaired fixture copying into deeply nested work directories, stale final-contract expectations and shared-root acquisition races in declaration tests.
- Removed redundant exhaustive matrix executions from inventory tests after they exceeded their existing timeouts under concurrent load. Exhaustive execution remains required by `reference:verify`; inventory tests retain registration, real model controls, bounded prerequisites, and full/intermediate sabotage, unrun-assertion and capability controls. No matrix instance or handler was removed.

## Files changed

Root: `package.json`.

New files under `scripts/reference-harness/`:

- `artifact.ts`
- `gate-cases.ts`
- `gate.test.ts`
- `observations.ts`
- `processes.ts`
- `reference-baseline.ts`
- `tiers.ts`

Updated files under that directory:

- `README.md`
- `catalog-cases.ts`
- `cli-cases.ts`
- `linking-cases.ts`
- `linking-expectations.ts`
- `linking.test.ts`
- `mutation.test.ts`
- `mutation.ts`
- `project-cases.ts`
- `report.ts`
- `runner.test.ts`
- `runner.ts`
- `runtime.ts`
- `session-expectations.ts`
- `static-expectations.ts`
- `verify.test.ts`
- `verify.ts`

## Matrix execution

The iteration-14 prerequisite gate passed with exit 0:

```sh
npm run reference:verify -- --plan 1 --iteration 14 --format json --preserve-on-failure
```

It required and passed **305 instances**, with **zero failed instances** and three later instances explicitly not executed. Prerequisite closure is iterations 1–14. It recorded 15,755 baseline/result assertions. The 15 new instances recorded 1,538 assertions; their instance durations sum to 49,256.329 ms.

The unfiltered gate produced the expected exit 1:

```sh
npm run reference:verify -- --plan 1 --format json --preserve-on-failure
```

It required 308 instances, passed 305, recorded zero failed assertions and lacked handlers only for:

- `I1-27:self-check`
- `I1-27:self-negative`
- `I1-28:relocated-package`

These are the three iteration-15 instances. No additional inventory error, missing capability, missing handler or skipped required work appeared. Every exhaustive report retains `planComplete: false`.

All iteration-14 variants passed separately:

- `I1-01:baseline`
- `I1-30:reference-regression/type-check`
- `I1-30:reference-regression/vitest`
- `I1-30:reference-regression/build`
- `I1-30:reference-regression/cucumber`
- `I1-30:test-discovery/toolkit`
- `I1-30:test-discovery/testing-module`
- `I1-30:production-selection/toolkit`
- `I1-30:production-selection/testing-module`
- `I1-30:harness-required/intermediate-remove`
- `I1-30:harness-required/intermediate-disable`
- `I1-30:harness-required/intermediate-assertion`
- `I1-30:harness-required/full-remove`
- `I1-30:harness-required/full-disable`
- `I1-30:harness-required/full-assertion`

Available capabilities are acquire, build-selection, catalog, cli, coverage, harness-gate, lazy, link, metadata, namespace, parse, registry, regression, resources, session, static-access, symbol-free and tags-origin.

## Unchanged reference and regression results

The compiled reference command exits 0 with completed execution, a passed check and complete source coverage:

| Measure | Result |
| --- | ---: |
| Owners | 15 |
| Source files | 54 |
| Resources | 5 |
| Catalog originals | 89 |
| Accesses | 294 |
| Allowed application decisions | 166 |
| Proven external selections | 128 |
| Denials/errors/source coverage notes | 0 |

Two expected outside-module-source warnings remain visible: `vite.config.ts` and `vitest.config.ts`, one compiler-selected file each.

The HTML entry and Cucumber feature remain explicit inventoried resources without TypeScript export descriptions. Neither is imported as source; all accessed resources are checked. Their catalog state is not concealed.

Actual example regression tiers passed:

- Type-check.
- **77 Vitest tests in 20 files**, with no failures, pending, todo or skipped tests.
- Vite build producing HTML, JavaScript and CSS.
- **One real Cucumber scenario**, “A reviewer inspects the catalog and reviews both records through both surfaces,” with all **12 recorded steps/hooks** passed.

`npm run reference:report` exits 0 while retaining the three pending iteration-15 instances. Its success does not claim the unfiltered completion gate has passed.

## Verification

Passed:

- `npm run worktree:prepare`
- `npm run build`, plus the gate's actual copied clean builds
- Final `npm run type-check` across toolkit, portable owners, scripts and harness
- `npx tsx scripts/reference-harness/validate.ts`: all 308 records, pointers and prerequisites valid
- `npm run check:reference`
- The 305-instance iteration gate above
- The unfiltered gate's independently expected three-instance pending result
- `npm run reference:report`
- `npm run reference:report -- --dry-run`
- Final `npm run reference:cases`: **14 test files and 235 tests passed**, exit 0, duration **48.04 seconds**
- Focused copier, linking and harness tests during implementation
- `git diff --check` and staged diff validation

Full toolkit runtime regression, diagram/site/browser regression, scenario coverage, sealed-file checks and automated constraint acceptance are separate workflow checks; no local pass for those is claimed.

## Portable evidence and its limits

Ignored portable reports are retained at:

- `.reference-work/reports/plan1-iteration14-33d16094-a3b0-4710-b9bc-7676ba0010dc.json`: 3,675,786 bytes; 1,312,018 ms.
- `.reference-work/reports/plan1-full-9fb1c46e-aa42-4e25-90ff-67167ece1491.json`: 3,675,783 bytes; 1,313,784 ms.
- `.reference-work/reports/plan1-full-cbf896d6-ea9e-435f-9b5f-aadc9b2c0e62.json`: reference-report execution; 3,675,695 bytes; 1,310,815 ms.

These reports identify revision `610b869b3c5c0d8d9ffbc766c1defddcac1e196f` with dirty implementation source, source SHA `ad3b7d1e450d38e482325ecc1e5d3aa96556f5c1d7164e2d49ab259fe0aa802f`, build SHA `7061287fabc0fdc63ebcb282413c84a99187c6506cc6c7769f78a1adcf90ee6e`, Node v22.23.2 and TypeScript 7.0.2. A scan found no machine absolute paths under the checked temporary, home, repository or system prefixes.

After these exhaustive runs, only inventory-test scheduling/isolation and README content changed. No gate handler, report implementation, checker, CLI or production implementation changed. Final 235-test and type-check runs cover those final adjustments. The archived report source identity therefore describes the tested implementation before those test/documentation adjustments, not the final commit.

Runs overlapped with five exhaustive executions. Their durations are harness wall times under concurrent load, not cold checker latency or iteration-15 memory/performance measurements.

Logs, including development failures, are retained under `.reference-work/iteration14-*`. Final evidence includes `iteration14-reference-cases-passing.log`, `iteration14-type-check-passing.log`, `iteration14-check-reference.log`, `iteration14-gate-final.json.log`, `iteration14-full-gate.json.log` and `iteration14-reference-report.log`.

## Issues encountered

Corrected during implementation:

- Node's copy operation rejected copying a toolkit directory into a descendant. Ancestor-chain recursion now supports the owned isolated copy, with a regression test.
- Cucumber rejected an absolute formatter destination containing a colon from an instance ID. The runner now uses a relative scratch destination.
- An overly broad resource-completeness assertion included unimported HTML/feature resources. The assertion now reflects their explicit catalog state while retaining checks for all source accesses.
- The migration assertion counted 17 mandatory destinations; the reviewed map has 16, with optional extraction tests separate.
- A linking test expected `createAnalysisSession` to remain unavailable although iteration 13 activated the final contract.
- Redundant exhaustive inventory runs reached their 20-minute timeouts under concurrent execution. Dedicated exhaustive gates passed; bounded inventory tests now avoid duplicating them.
- Concurrent fixture mutation caused acquisition inconsistency when declaration tests inspected the shared root. Those tests now use isolated copies; the final suite passed.

The original results write failed with `FRAME_MISMATCH`; a subsequent read-only publication-status call returned `STALE_ATTEMPT`. Workflow writes stopped and no publication occurred. The implementation commit already existed when this missing-deliverable recovery was requested.

## Recommendations for Next Iteration

Iteration 15 still owns toolkit self-check and its independent negative, relocated build/install/executable verification, reference and 100-owner latency/memory/repeated-disposal measurements, and the final completion report.

Carry forward two supplied predecessor findings. Neither was repaired or independently reproduced in iteration 14:

- CLI interruption after the JSON closing brace lands exactly at a chunk boundary, before trailing whitespace, may still yield a complete successful JSON document with exit 130. The supplied constraint finding remains unaddressed by this harness iteration.
- Compiler-resolved Node `createRequire` loaders reportedly omit CommonJS access/coverage and known testing-origin checks in the TypeScript adapter. Current gate evidence does not establish the missing, unrepresented case.

Keep warnings, definite denials, incomplete execution and coverage limitations distinct. No daemon, persistent cache, worker pool or alternative checker was added. Successful iteration-14 evidence does not replace final automated acceptance or establish Plan 1 completion.

## Workflow recovery

On 2026-09-10, the user authorized recovery after iteration 14 repeatedly retried missing-output validation. The implementation had been committed at 01:29 UTC, but its results write returned `FRAME_MISMATCH` and later workflow calls from the execution session returned `STALE_ATTEMPT`. The control plane kept requesting the missing results and checklist from that session.

The interactive session confirmed that workflow MCP access was healthy, verified the retained 305-instance gate report and final 235-test log, and restored this report through `workflow.write_iteration_results`. The checklist is restored separately through `workflow.write_iteration_checklist`. Existing local verification and its revision limits are recorded above; workflow checks and publication remain owned by Studio.

## Active-attempt submission

The iteration-14 execution resumed on 2026-09-10 05:46:36 UTC at implementation commit `9247480c3b59905edcffe6cc0b87fa0aabed882c`. Workflow detail confirmed iteration 13 completed with accepted publication, iteration 14 running, and iteration 15 pending. The working tree had only the two restored, untracked iteration-14 deliverables. No implementation edits were necessary in this resumed execution.

Revalidated the three portable reports listed above directly: all retain 305 passing instances, zero failed instances, no inventory issues, nonempty passing assertion evidence for every passed instance, and only the three named iteration-15 instances unexecuted. The iteration report has `passed: true`; the full gate and supported-work report have `passed: false`; all have `planComplete: false`. Reviewed the retained final reference-cases log recording 235 passing tests. These are prior execution results, not new exhaustive runs.

Fresh checks in this resumed execution passed:

- `npm run type-check` across toolkit, portable owners, scripts and harness; log: `.reference-work/iteration14-resume-type-check.log`.
- `npx tsx scripts/reference-harness/validate.ts`: 308 reviewed records, pointers and prerequisites valid; no conformance assertion ran.
- `npm run check:reference`: completed, passed, complete source coverage; 15 owners, 54 source files, five resources, 294 accesses, 166 allowed, 128 external, zero denied/errors/analysis limits and the two expected configuration warnings; log: `.reference-work/iteration14-resume-check-reference.log`.
- `git diff --check`.

The current source identity is `5a2fc273a733189c7faad657cdcdc0898f758857779aec11b706fd33812bccf3`. The build identity remains `7061287fabc0fdc63ebcb282413c84a99187c6506cc6c7769f78a1adcf90ee6e`, exactly matching the exhaustive evidence. The existing report explains the intervening test/documentation adjustments. No regression suite was repeated in this resumed execution; workflow automation owns those checks under the supplied policy.

Both managed deliverables are resubmitted through the workflow MCP tools using this execution's attempt. Commit and draft publication follow their successful writes. Automated acceptance, the inherited CLI publication finding, the inherited TypeScript loader finding, and iteration-15 completion remain separate from this handoff.

## Parser fixture regression remediation (2026-09-10 05:50:40 UTC)

The automated post-commit regression reported three failures in `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`, for root, analysis and CLI descriptions. Its retained output is `.cucumber-viz/workflows/_JG0Ucx92X1f6WqRyuxxC/check-results/post_commit_regression-14-1789019261947-ef35bf/regression/output.log`. This failure supersedes any implication that the full toolkit regression had passed; the earlier harness and CLI evidence remains scoped as stated.

The independent expected fixtures still documented iteration 9. The actual declarations include the reviewed iteration-12 analysis contracts and iteration-13 batch/CLI contracts. Compared each reported difference with root R1/R3, analysis A3 and CLI C1/C2 in `owners.md`, including its declaration activation table, before changing the expectations.

Corrected only that test file:

- Root now expects the `interfaces/batch.ts` wildcard to descendants and the complete explicitly named analysis vocabulary, including execution, snapshot, report and session types.
- Analysis now expects `createAnalysisSession` from `session.ts` and `analyzeProject` from `analyze-project.ts`, both to parent.
- CLI now expects `runCli` from `run-cli.ts` and the `interfaces/cli.ts` wildcard, both to parent.
- Updated the fixture's stage comment to the reviewed final iteration-13 declarations.

Expected selections remain independent, explicit fixture data. Exact statement equality, statement indices, token spans, module headers and all nine toolkit/fifteen reference owner checks are unchanged. No parser/runtime behavior, module declaration, model rule, matrix membership or scenario changed; no test was removed or relaxed. This addresses every reported mismatch.

Local verification: `npx tsc --noEmit` passed for the toolkit including the changed owned test (log: `.reference-work/iteration14-parser-fixtures-type-check.log`), and `git diff --check` passed. Per the remediation check policy, Vitest/Cucumber, scenario coverage and sealed-file checks were not rerun locally. The supplied regression output is the failure evidence; automated regression must confirm the corrected expectations. No passing post-fix regression result is claimed.
