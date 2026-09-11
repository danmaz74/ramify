<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 4 results: context primitives and report history; manager incomplete

**Date:** 2026-09-11. **Status:** incomplete. The iteration 3 provider contracts are absent, so the context manager and all 27 contexts acceptance instances remain unimplemented.

## Prerequisite and scope evidence

Work stayed in `/tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification` on `workflow/iteration-2-resident-verification`, starting at `404e248`. The pre-existing modification to `iterations/iteration3-checklist.json` changes its managed-tool marker; it was preserved without editing or staging it.

Read CLAUDE.md, the iteration-work and testing skills, the development guides, the iteration 4 contract/read-first documents and iteration 3's partial handoff. Ran `npm run worktree:prepare` successfully.

Live workflow detail reports iteration 3 completed with publication accepted and iteration 4 running. The source independently confirms the predecessor's unfinished capability:

- `subs/analysis/src/interfaces/analysis.ts` has no `IncrementRun`, `InputChange`, `RetainedAnalysis` or `RetainedStageId`.
- `subs/analysis/subs/project/src/interfaces/project.ts` has no `ProjectResolution` or `RetainedConfiguration`; its `ProjectRead` remains the Plan 1 contract.
- `analyzeIncrement`, `resolveProject` and `resolveProjectRoot` are absent from application source, and the analysis/root declarations do not expose the new provider vocabulary.
- `scripts/reference-harness/plan2-runtime.ts` supplies only `harness-gate`, with neither `increment` nor `contexts`.

Iteration 4 explicitly requires those real provider types and limits writes to contexts, the daemon N5 declaration and its harness obligations. Implementing the provider operations, copying foreign definitions into contexts, or substituting batch analysis would not satisfy that contract. The package documents also continue to record architecture acceptance as pending; this report does not infer an architecture decision from workflow publication. The absent provider contracts are independently sufficient to prevent completing the manager within this iteration's scope.

## Implemented independent work

All source changes are within the assigned contexts owner; the only other owner edit is daemon's declaration.

- `src/interfaces/contexts.ts` contains the contract's implemented subset: context/generation/revision/lease identifiers, token, setup, selection, fingerprints and watcher/clock vocabulary. It imports only existing analysis `Capability` and project `ProjectRequest` types through their declared exposure paths. It defines no replacement analysis/project types and makes no manager claim.
- `src/tokens.ts` derives `ctx/1:` identifiers from the canonical selection tuple with sorted capabilities, creates fresh UUID generations, and formats revision identifiers from a generation UUID and positive integer sequence. It computes frozen plain fingerprints from supplied detached observations, with separate declaration, source, configuration, registry and engine hashes. README observations affect the supplied overall input identity only, as the contract's class table specifies. The helper does not read files, normalize roots or retain inputs.
- `src/tests/controlled-ports.ts` implements `createControlledClock` and `createControlledWatcher`. The clock runs callbacks synchronously in deadline order with scheduling order for ties, supports cancellation and releases callbacks on disposal. The watcher isolates roots, delivers immutable batches, preserves error/overflow events, supports a one-shot attachment failure and releases listeners on handle close or disposal. These controls create no OS timer, filesystem watcher, engine or socket.
- `src/tests/tokens.test.ts` and `src/tests/controlled-ports.test.ts` author 24 cases, counting the eight fingerprint-role cases separately. They cover fixed identity/fingerprint digests, root/capability separation, immutable inputs, UUID/revision formatting, deadline ordering, cancellation, callback failure, root isolation, attachment recovery and disposal. Each port test releases its resources in finally; token helpers have no retained resources.
- Contexts X2 exposes only the implemented interface originals; X3 exposes the real controlled ports. Daemon N5 relays only those existing exports. X1 and the remaining X2/N5 vocabulary are not activated. The owner README documents this partial state and how the controls advance and release resources.

These are the independent parts of deliverables 1, 2 and 5, with corresponding partial declaration work. No `contexts` harness capability or matrix handler was registered. Token helper tests do not establish manager generation-on-reopen, publication sequencing or any other I2 instance.

## Initial checkpoint verification

| Command | Result and scope |
| --- | --- |
| `npm run worktree:prepare` | Passed; example and site dependencies installed. |
| `npm run type-check` | Passed for toolkit, portable, scripts and harness configurations, including both new test files. |
| `npm run build` | Passed; current production source compiled. |
| `npx tsx .reference-work/iteration4-primitives-smoke.ts` | Passed six direct assertion groups: fixed identity/root/capability rules; generation/revision formatting; frozen fingerprints/class isolation; deterministic scheduling/cancellation; controlled watcher delivery/close/attachment failure; disposal and rejection of new work. This is primitive smoke evidence, not execution of the authored Vitest suite or an I2 matrix instance. |
| `npm run check:self` | Passed: completed execution and complete coverage; 11 owners, 150 source files, 11 resources, 1,839 accesses; zero errors, warnings, denials or analysis limits. Validates the currently staged X2/X3/N5 declarations, not the final manager contract. |
| `npm run reference:verify -- --plan 2 --iteration 4` | Failed, exit 1: 49 required, 4 passed, 0 failed assertions, 172 not executed overall. Of the unexecuted records, 45 are required here: 18 missing increment instances and 27 missing contexts instances. The other 127 belong to future iterations. |
| `git diff --check` | Passed. |

Vitest/Cucumber regression, scenario coverage and sealed-file checks were not run locally, as the execution prompt reserves them to workflow automation. No failing test was observed locally; the 24 authored Vitest cases have no runner verdict yet. Direct smoke evidence does not replace that verdict.

Evidence is in ignored scratch space:

- `.reference-work/iteration4-primitives-smoke.ts`
- `.reference-work/iteration4-primitives-smoke.json`
- `.reference-work/iteration4-self-check.log`
- `.reference-work/iteration4-plan2-gate.log`
- `.reference-work/reports/plan2-iteration4-1bebb4ac-0c44-44f9-ad7f-d59215cb2782.json`

## Remaining exit criteria

The complete contexts interface and `AnalysisDriver`, `createContextManager`, context state machine, queue, manager integration of history and retained-product accounting, publication, freshness/expectation handling, leases, background cancellation/debounce/verification, idle re-warming and eviction remain absent. The standalone report-history store implemented in this remediation does not supply those manager behaviors. There is no scripted analysis driver, no manager owner tests and no implementation of the 27 I2-05/I2-06/I2-07/I2-08/I2-12 handlers. Full X1–X3 and N5 activation remains incomplete.

The checklist deliberately records:

- `functionalRequirementsSatisfied: false`: missing provider contracts and manager behavior.
- `newCodeCoveredByTests: true`: the implemented primitives, controls and report-history storage have owner tests.
- `allNewTestsPass: false`: direct smoke and type-check pass, but Vitest execution is delegated to automation and no runner verdict is available.

## Single self-assessment remediation attempt

Re-read iteration4.md, its retention rules, the two false checklist items, and the actual provider interfaces. The source still lacks all five named prerequisite types and the increment operations. Live workflow detail reports iteration 4 at `validate_output_retry`; no `iteration4-check-results.md` exists in this checkout and no new Vitest verdict was supplied. The remediation instruction leaves the owner boundary and automation-only regression policy in force.

The focused implementation completed the independent report-storage portion of `src/history.ts`, using the existing `AnalysisReport` type. A private generic header preserves the caller's exact revision object without defining a substitute `ContextRevision` or analysis/product contract. The store:

- Retains reports by exact revision id; missing ids return no entry and never the current report.
- Accounts actual serialized UTF-8 report bytes and keeps the newest entries within both count and byte limits.
- Rejects an individually oversized candidate before modifying current or past entries.
- Exposes oldest-first historical removal for later global-pressure coordination, protecting the current publication.
- Drops past reports for later cold-context integration and clears all entries and counters on idempotent disposal.
- Rejects duplicate retained identifiers and writes after disposal.

Publication eligibility, invalid-current/lastValid handling, generation checks, global context selection and `RetainedAnalysis.bytes` remain the future manager's responsibilities. In particular, storing a fixture report does not establish that an incomplete report may be published by the manager.

Added `src/tests/history.test.ts` with seven cases and the private `src/tests/history-fixture.ts`. The fixture is a plain, explicitly unexecuted report; it imports no engine value. Tests cover eight-of-twelve retention, actual 10 MiB report accounting under 32 MiB, UTF-8 sizes and exact object lookup, atomic rejection, oldest-first removal with the current entry protected, cold-history release, zero capacity, duplicate ids and disposal. All tests release their histories in finally. There are now 31 authored owner cases across the three test files, with no new harness registration.

The owner README describes this additional implemented storage and the remaining integration gap. No provider, public context interface, declaration, harness, manifest or other owner's source changed in this remediation. The pre-existing iteration 3 checklist edit remains preserved and unstaged.

### Remediation verification

- Initial `npm run type-check` failed because the new storage fixture used a nonexistent `ResolvedTagRegistry.tags` field. The fixture was corrected to the existing `id`, `definitions` and `isDefault` contract; no provider change or cast was introduced.
- Final `npm run type-check`: passed all four configurations, including the seven new cases.
- `npx tsx .reference-work/iteration4-history-smoke.ts`: passed five direct assertion groups over the new store, including three actual 10 MiB reports retained under a 32 MiB cap, exact lookup, atomic oversized-candidate rejection and zero entries/bytes after disposal. Evidence: `.reference-work/iteration4-history-smoke.json`; the reproducible script is beside it.
- `npm run build`: passed.
- `npm run check:self`: passed with completed execution, complete coverage, 11 owners, 153 source files, 11 resources and 1,849 accesses; zero errors, warnings, denials or analysis limits. Evidence: `.reference-work/iteration4-remediation-self-check.log`.
- `git diff --check`: passed.

The original gate result above belongs to the initial checkpoint and was not rerun: no capability, handler or prerequisite changed. No Vitest/Cucumber regression, scenario-coverage or sealed-file check was run locally. The 31 owner cases still have no runner verdict; the direct smoke does not replace that verdict or execute any I2 instance.

This is partial remediation. `functionalRequirementsSatisfied` remains false for the missing providers and manager; `newCodeCoveredByTests` remains true for implemented code; `allNewTestsPass` remains false for unavailable runner evidence.

## Recommendations for Next Iteration

Restore the iteration 3 prerequisite through its owning workflow task: resolve its recorded contract-review disposition, implement the analysis/project operations and retained-product types, activate their relays and pass all 18 increment instances. Then resume the contexts manager against those actual contracts, extend this exact interface file, complete X1/X2/N5 and execute all 27 contexts instances through fixture M.

Iteration 5 must not treat these primitives or the successful self-check as an available context manager. The controlled ports are ready for later consumer tests, but no quick-service or resident correctness evidence exists yet.

The initial checkpoint was committed as `88b22b5` and its draft publication succeeded. This single remediation updates the two managed deliverables and commits its source changes without calling `workflow.publish_iteration_draft`, as requested. The workflow owns validation reruns and finding disposition; neither submission nor a passing self-check establishes iteration completion.
