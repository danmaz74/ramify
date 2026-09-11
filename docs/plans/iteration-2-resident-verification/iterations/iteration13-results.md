<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 13 results: resident measurement prerequisite checkpoint

**Recorded:** 2026-09-11. **Status: incomplete.** Measurement infrastructure and a reproducible failure archive are implemented. The prerequisite resident package and the real resident workload driver are absent; none of the nine I2-29 instances is complete.

Work stayed in the authoritative checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification-iter-13`, branch `workflow-iter/iteration-2-resident-verification/13`, starting at `b20455d`.

## Prerequisite evidence

Read CLAUDE.md, iteration-work and testing skills, development guides, iteration 10's handoff, scope budgets, the iteration-1 probe record, memory lifecycle architecture, existing batch observer/archive and synthetic generators. Ran worktree preparation successfully.

Live workflow detail labels preceding iterations completed/accepted, but iteration10-results.md explicitly records its incomplete providers. Current source/package inspection confirms no client package export, connectDaemon implementation, daemon host/entry, resident assembly, complete RamifyService or context manager. Their incremental/project-resolution providers are also still missing. Ordinary check remains batch behavior. Workflow publication does not establish resident readiness.

The command records six absent compiled prerequisites: the real ./client import/type targets, dist/src/daemon-entry.js, dist/src/client.js, dist/src/resident-assembly.js, dist/subs/daemon/src/connect-daemon.js and dist/subs/daemon/src/host.js. Presence alone is deliberately documented as insufficient: restored providers still require actual imports, handshake, instrumentation and workload execution. No substitute analyzer, daemon or guessed service implementation was introduced. Restoring predecessor owners exceeds this iteration's measurement scope.

## Implemented work

- Added `npm run measure:resident` and scripts/measurements/resident.mjs. It records the build, dependency versions, manifest/scope/recipe hashes, real fixture identities and required workload inventory. It exits 1 and archives incomplete evidence on this build. Its implementation explicitly remains a prerequisite/entry checkpoint, even if prerequisite files subsequently appear.
- Extracted the existing batch POSIX process observer into process-observer.mjs and preserved its raw sample/role/output format, 50 ms target, process-tree RSS, timeout, interruption, output bounds and observed-descendant cleanup. Both commands consume it.
- Shared the original batch tree-identity algorithm through identities.mjs. The final resident and diagnostic batch archives agree on the 214-file build hash `bf8ff4e40a1f465d31f06b0c28daff51ab5bd132880c817e582d1cf151cade74`. Two earlier resident checkpoints used a different path ordering and remain archived with their original script hashes.
- Added the explicit `--batch` flag to the batch measurement CLI invocation, preserving its intended in-process selection when the resident default eventually exists. No engine or report expectation changed.
- Added archive.mjs: lossless level-9 gzip with zero timestamp, payload/compressed hashes and lengths, preservation of prior index records and finalRecord, exclusive writer lock, and atomic index rename. The format accommodates both original batch and resident payloads; resident records identify their schema and phase.
- Materialized the existing S100/S500/S1000 generators only to establish their content identities, outside timing. Their maps have 1,402/7,002/14,002 files. S100 retains its frozen SHA-256. No generator was changed or synthetic analysis claimed.
- Executed three real compiled CLI help subprocesses per checkpoint, each with an owned endpoint directory that remained empty. The final sampled peak is 32.375 MiB and every subprocess has zero observed survivors. These help calls finish within one 50 ms interval, so the samples do not establish a settled entry footprint. There is no numeric help budget, and this component cannot pass the full entry-footprints instance.
- Added resident-plan.mjs with the nine required workload names, exact counts and iteration-1 targets. Every complete workload remains `not-executed`, `measurements: null`, `passed: false`. The compiler-state trigger is `not-evaluated`.
- Documented the checkpoint, remaining driver, archive semantics and reproduction in the measurement README and results README.

## Archived evidence

All new records are indexed beside Plan 1 without replacing its final record.

| Record under scripts/measurements/results | Evidence |
| --- | --- |
| resident-2026-09-11T09-01-16.314Z-dc5e0da8-3ed2-4257-bf75-d4161aa613fa.json.gz | Final incomplete resident checkpoint, final shared build identity, prerequisite inventory and three help samples. |
| resident-2026-09-11T08-58-53.470Z-9f38178f-0c5f-4482-8614-f5b7408ce858.json.gz | Initial checkpoint retained unchanged. |
| resident-2026-09-11T09-00-43.130Z-0792b780-4d4a-4988-b3bf-165b78d9fc69.json.gz | Intermediate checkpoint retained unchanged. |
| batch-2026-09-11T08-59-43.581Z-101c1f03-25fc-4510-8e67-014b7efc55c8.json.gz | Shared-observer validation: five real clean batch checks, retained latency-budget failure. |

The final resident payload SHA-256 is `2affc94d4902e33a591ecdb26c247c7c3c9f44d593d74f18eae034e53a71a088`. Four-archive verification checked exact raw/compressed hashes and lengths, and preserved failing outcomes.

The batch diagnostic observed parent, helper and native descendants in all five runs; every report completed cleanly with 15 owners, and no observed process survived. Median **5.189 s** exceeds the unchanged **5 s** batch target; combined peak **501.855 MiB** is below 512 MiB. This is not resident evidence. The Studio environment was not isolated from concurrent work, so the failure is retained without attributing a product regression, relaxing a budget or claiming performance acceptance.

Linux x64, Node v22.23.2, TypeScript 7.0.2. No macOS measurement is claimed.

## Verification

| Command | Result |
| --- | --- |
| npm run worktree:prepare | Passed example and site dependency preparation. |
| npm run build | Passed. |
| npm run type-check | Passed all four configurations, including the authored harness test. |
| node scripts/measurements/verify-tooling.mjs | Passed real subprocess/descendant observation, summed RSS, timeout, interruption, missing executable, archive integrity/locking, batch format, malformed-index preservation and absent-prerequisite controls. Repeated after the archive-format change. |
| npm run measure:resident | Exit 1; archived incomplete prerequisite/entry evidence. No resident workload executed. |
| node scripts/measurements/run.mjs --phase cold --workload reference --output .reference-work/reports/iteration13-batch-observer.json | Exit 1 on the unchanged 5 s latency target; all five analysis reports and observer cleanup checks passed. |
| npm run reference:verify -- --plan 2 --iteration 13 | Exit 1: 148 required; 6 passed, 0 failed assertions, 142 required unexecuted. Overall 176 records, 170 unexecuted including 28 future instances. All nine I2-29 cases lack resident-measure. |
| Direct archive and shared-build-identity checks | Passed. |
| node --check for resident.mjs and run.mjs; git diff --check | Passed. |

The matrix report is `.reference-work/reports/plan2-iteration13-01153209-0dc3-4a3c-8414-a9dd630de7d0.json`; logs and raw uncompressed diagnostics remain under the checkout's ignored .reference-work directory.

Added one reference-harness test invoking the checked-in direct tooling controls. Per the supplied automation policy, no Vitest/Cucumber regression, scenario-coverage or sealed-file check was run locally. Passing direct controls and type checking do not claim an automated test-runner verdict.

## Remaining exit criteria and budget disposition

Functional requirements remain unsatisfied. Still required: separately instrumented real daemon status/counters; client import and all daemon/client footprints; five cold and twenty cycles of each edit class on reference/S100 with independent outcomes and predicted stage reuse; the two 200-cycle plateaus; eight warm contexts; ten-publication non-reading subscriber; S500/S1000 analyses; publication peaks; and actual budget assertions and resident-measure harness handlers.

The capability remains unavailable instead of awarding measurement credit for file checks or batch work. No scope.md budget was revised or marked measured: there are no resident observations to enter in those binding rows. The 4.5 s reference and 8 s S100 source targets remain unchanged. The compiler-state deferral trigger cannot be assessed without source-edit measurements with stage reuse; no long-lived helper was added.

Checklist: functionalRequirementsSatisfied false; newCodeCoveredByTests true; allNewTestsPass false pending the automated runner verdict. Draft submission is an incomplete checkpoint, not iteration completion.

## Recommendations for Next Iteration

Restore and verify the missing providers in their owning iterations: incremental analysis/project resolution, contexts, complete shared service/root assembly, connector/codec, host/daemon entry, resident CLI, then final declarations and client entry. Consume their public contracts to finish this recipe; confirm that instrumentation supplies lifecycle and queue counters in addition to DaemonStatus memory/history data. Implement and register all nine measurement handlers, execute the full workloads on an otherwise idle host, record every measured value beside its binding budget through the authorized plan-artifact workflow, and obtain review for any necessary budget revision. Iteration 14 cannot claim measured resident acceptance from this checkpoint.

## Single self-assessment remediation attempt

**Recorded:** 2026-09-11. This focused attempt started at `31ae870` in the same authoritative iteration-13 checkout and branch. Re-read the original iteration scope, project instructions, testing policy and bugfixing skill. Live workflow detail reports iteration 13 at `validate_output_retry`. No automated Vitest/Cucumber verdict or failing-new-test output was supplied.

The prerequisite audit is unchanged: the real client export, connectDaemon, daemon host/entry, resident assembly, complete service, context manager and incremental providers are absent. Implementing those predecessor owners would exceed the measurement scope. The full resident workload driver and all nine I2-29 observations still cannot be completed in this attempt.

### Focused repair: retain evidence after an output failure

Found and reproduced a defect in this iteration's own final persistence. Running resident.mjs with an existing directory as `--output` produced EISDIR. The progress write failed, then the final raw write threw before archiveMeasurement could run. The command therefore discarded the failure report instead of adding an archive record.

The pre-fix end-to-end assertion failed with archive counts **13 before / 13 after**, where 14 was required. The failure log is preserved at `.reference-work/iteration13-persistence-before.log`.

Added `persistMeasurement` to archive.mjs and used it in resident.mjs after resource cleanup:

- Attempt the raw file and gzip/index archive independently.
- If the raw file fails, mark the report incomplete and retain the persistence error with the observations in the archive.
- If the archive fails, retain the observations and archive error in the raw file; preserve any existing index and held lock.
- If neither destination can retain the final report, throw an AggregateError with both causes.
- Return null for an unavailable destination in the command summary. Never report an unavailable file as written or turn an output failure into success.

The helper clones the report and records filesystem error codes without adding host-specific paths to its portable error strings. The existing batch command is unchanged by this repair. Updated the recipe and archive documentation.

### Coverage and executed verification

Extended the existing checked-in tooling controls, which the reference-harness test already invokes, with normal raw/archive byte equality, an EISDIR raw failure with retained real subprocess observations, an EEXIST archive-lock failure with retained raw observations and unchanged index, and simultaneous failures preserving both causes and the held lock.

| Verification | Result |
| --- | --- |
| Pre-fix directory-output end-to-end reproduction | Failed for the intended missing-archive assertion: 13 records before and after. |
| node scripts/measurements/verify-tooling.mjs | Passed existing process/archive controls plus all four final-persistence paths. |
| Post-fix directory-output end-to-end reproduction | Passed: recipe exits 1 with empty stderr, summary output null, a new readable failure archive, unchanged prior index records and no residual scratch fixture. |
| node --check scripts/measurements/archive.mjs, resident.mjs and verify-tooling.mjs | Passed. |
| git diff --check | Passed. |

The post-fix log is `.reference-work/iteration13-persistence-after.log`. Its retained raw archive is [resident-2026-09-11T09-05-17.993Z-8750be52-ac7f-4b54-855c-c70afa881b63.json.gz](../../../../scripts/measurements/results/resident-2026-09-11T09-05-17.993Z-8750be52-ac7f-4b54-855c-c70afa881b63.json.gz), indexed beside the earlier checkpoints. The intentionally invalid output failed at the first progress write, after fixture preparation; no help subprocess or resident workload ran in that reproduction. This record proves failure preservation, not a footprint or resident budget.

No production source, package manifest, TypeScript test body, runtime capability or budget changed. Build, type-check and the unchanged matrix were not repeated for this JavaScript persistence repair; the original results remain historical evidence. No Vitest/Cucumber regression, scenario-coverage or sealed-file check was run, as required by the original automation policy. The passing direct controls are not an automated test-runner verdict.

### Current checklist and handoff

- `functionalRequirementsSatisfied: false`: the persistence defect is fixed, but required resident providers, instrumentation, workload driver and all nine complete I2-29 cases are still absent.
- `newCodeCoveredByTests: true`: existing authored controls now cover normal persistence, either destination failing and both failing; the real command reproduction verifies the wiring and cleanup.
- `allNewTestsPass: false`: no automated runner verdict is available; execution of that runner remains assigned to workflow automation.

No budget was revised and the compiler-state trigger remains unevaluated. Both managed deliverables are updated through MCP, and the code repair is committed on the assigned iteration-13 branch. No publication call is made in this remediation; validation and publication belong to the workflow. The predecessor-restoration and recipe-completion recommendations above remain necessary.
