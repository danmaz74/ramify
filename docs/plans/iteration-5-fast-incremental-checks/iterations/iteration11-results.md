<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 11 results: Live equivalence gate

**Date:** 2026-09-12. **Outcome:** all five I5-12 process providers are implemented and passed on one coherent build: **846 assertions, 30 complete batch/report comparisons and 30 equal session audits**. Both twelve-step sequences published exactly one watcher revision per edit. The full prerequisite/iteration exit remains unconfirmed because the supplied check policy reserves regression runners for automation, and the prerequisite gate composes those runners and the inherited Plan 2 measurement obligations. No required record or expectation was removed or waived.

## Implemented behavior

- Registered `live-equivalence` and all five I5-12 handlers. The Plan 5 runtime now has 88 available handlers through iteration 11; availability remains distinct from execution.
- Extended the existing Plan 2 harness using its installed-package process fixture, watch reader, strict report comparison, guarded mutations and evidence archive. The new `plan5-live-sequences.ts`, `plan5-live-process.ts` and `plan5-live-cases.ts` contain the sequence setup, process orchestration and independent expectations. The focused entry `plan5-live-smoke.ts` calls the same handlers registered in the canonical gate and automatic harness tests.
- The reference and S100 sequences execute body edit, declaration move, allowed import addition, wildcard export addition/removal, forbidden import addition/removal, parent exposure removal/restoration, README edit and source creation/deletion. Each baseline and every step is compared with the installed batch command after replacing only top-level runId. Inventory, areas, catalog, originals and positions, expanded contracts/model, accesses, decisions, diagnostics, warnings, coverage, summary, invocation and inputId remain in the comparison.
- The watch header's input identity, outcome and summary must match its report. Hooks must carry their independently computed hashes, name the watcher publication, retain all project findings, mark new findings against the exact preceding revision and report the exact removed identities.
- A test-only observer records actual session worker requests and replies through the existing diagnostic channel. Every sequence audit must return `equal` for the precise published sequence; installed `daemon status` confirms its counter, unchanged publication, synchronized state and absence of mismatch/cancellation. A started audit counter alone cannot pass.
- The race handler holds actual native filesystem event delivery behind a temporary endpoint-owned barrier. The installed hook returns from exactly one update before those events are delivered. After delivery and the duplicate hint's completed update, the revision remains unchanged; a later hook returns verified reuse with no capture or analysis. The barrier is removed in finally.
- Five actual writes finish inside one 100 ms window. Five concurrently launched installed hooks must each have their own matching process trace, correct hash and covering response. They share one publication and none is superseded.
- Removal evidence begins with two independently located `not-visible` findings. Deleting their owned file and the complete integration-tests module removes the corresponding findings, inventory/catalog entries and owner, and each revision equals batch and passes its audit.
- Every handler owns its endpoint, installation, fixture and processes. The installed executable starts and stops the real daemon. Worker exit observations and the existing process reaping checks enforce cleanup, including supervisor/compiler/helper processes.

### Fixture and scheduling details

R is the ordinary fifteen-owner reference copy with its own dependency link. The frozen S100 generator is unchanged and still checks its base content-map hash `d5b77b9ff57c443b35f386f40598506ff20c51c4ec75b800371f0cec089c0897`. A recorded setup overlay moves seven complete generated owners into the reference tree positions, renames their headers and adds seven small source witnesses plus their exposures. Every generated source file remains, and the fixture has 100 owners. This overlay makes the same twelve semantic steps executable; the live fixture is distinct from iteration 12's unmodified measurement fixture.

The process wrappers use a five-second audit/sweep interval for sequences and removals. Edits begin just after an observed real idle sweep completes, so the real watcher has its delivery window before another sweep. The strict `cause: watch` assertion remains. Race and burst wrappers use 30- and 10-second intervals respectively. These are scheduling controls for functional evidence, not latency acceptance measurements.

An unreferenced deleted source has no observation in a fresh batch capture. Its own hook therefore asserts exit 2 with `unobserved-input`; a hook naming the retained `src/assembly.ts` identity confirms that same removal revision and its project findings. The absent-path request must leave the revision unchanged.

## Owner repairs

### Compiler observations and removed roots

The inherited deletion defect reproduced before correction: the baseline matched batch, while file and module deletion retained obsolete compiler probes and produced a different inputId even though the audit returned equal.

Project acquisition now retains its observation recipes separately from compiler contributions. Membership changes retire obsolete compiler observations while retaining acquisition evidence; structural acquisition accepts fresh callbacks. TypeScript refreshes configured root filenames when inventory changes, removing deleted original roots from the synthetic configuration. Analysis performs broad warm-compiler invalidation on membership changes so current observations repopulate the capture.

Owner regressions cover a shared acquisition/compiler path, deletion of an original configured source while retaining the compiler process, and complete session/batch equality with independent findings across deletion, restoration and whole-module removal.

### Repeated missing-file request

The first live sequences found a second defect after the above repair: asking again for the deleted unreferenced file returned the correct unobserved outcome but caused revision 14 after deletion revision 13, without a disk change. The observer had classified every absent owned-area path as a fresh deletion.

Only an inventoried file can now be deleted. An already absent path preserves existing compiler absence evidence or discards a request-only probe, then returns unchanged. The extended owner witness requires identical revision, complete batch equality and an equal audit after this repeat request. Both final live sequences pass the same assertion.

### Cancellation after CLI cleanup

The supplied iteration-10 constraint failure also reproduced: aborting during either closeContext or connection.close allowed a clean result document and exit 0. The changed-check handler now checks cancellation after asynchronous cleanup and before output.

Both owner regressions require exit 130, no stdout, completed cleanup and zero connections/leases. The existing cleanup-failure and connect-cancellation controls still pass.

## Coherent I5-12 evidence

Command:

```sh
NODE_OPTIONS='' node --import tsx scripts/reference-harness/plan5-live-smoke.ts
```

Receipt: `.reference-work/reports/iteration11-live-1789214663560.json`.

- Started: **2026-09-12T11:58:32.454Z**.
- Completed: **2026-09-12T12:04:23.560Z**.
- Source SHA-256: `30bb24cbc71c3edc2e6ce01197f5fa133dd90d9b4d5f37dd902dc859b28d9542`.
- Build SHA-256: `9b930ad1f8b4ace4cf522ece9a572f9e47c5131c538df0fe5bc49dc7b4386e93`.
- Base HEAD: `ed91c6d1fa559c9a854ccc26aed8792b075b4286`, with the implemented source dirty.
- Node **v22.23.2**, TypeScript **7.0.2**. Source and build hashes are unchanged before/after the entire run.

| I5-12 subcase | Evidence | Assertions | Batch comparisons / equal audits | Result |
| --- | --- | ---: | ---: | --- |
| reference-sequence-live | process, R | 361 | 13 / 13 | Baseline plus all twelve edits; independent findings, positions, checked sets and hook deltas. |
| hundred-owner-sequence-live | process, S100 overlay | 362 | 13 / 13 | Same twelve edits and expectations at the corresponding tree positions. |
| hook-race-watcher | process, R | 26 | 0 / 0 | One update before real event delivery; completed delayed delivery; later verified reuse with no analysis. |
| burst-coalesced | process, R | 48 | 1 / 1 | Five writes, five independently traced hooks and one covering publication. |
| removals-live | process, R | 49 | 3 / 3 | Baseline, owned-file deletion and complete-module deletion, including exact removed findings. |

Every handler's cleanup receipt has empty leaked and surviving-process lists. Raw commands, reports, audits, watch lines and process traces are archived under `.reference-work/evidence/` and linked by the receipt.

Earlier failures are preserved. The first R and S100 runs reached the final step and failed the repeat-deletion revision assertion (`iteration11-live-1789213741011.json` and `iteration11-live-1789213900882.json`). A subsequent run (`iteration11-live-1789214170531.json`) captured a periodic sweep legitimately discovering an edit before the watcher; that did not earn watcher credit and prompted the real-sweep scheduling guard. The final coherent run supersedes these for passing evidence. Review also strengthened race-timeout, concurrent-process attribution and header/report coherence assertions before the final run.

## Other verification

| Check | Result |
| --- | --- |
| `npm run worktree:prepare` | Passed; example and site dependencies provisioned in the authoritative checkout. |
| `npm run build` | Passed. |
| `npm run type-check` | Passed across toolkit, portable, scripts and reference-harness scopes after the final harness changes. |
| `npx tsx scripts/validate-final-contracts.ts` | Passed: eleven owners, 278 declaration-inventory files, 82 expanded statements, eight package entries and existing bin. |
| Direct owner witnesses on the final production build | Passed: 49 session assertions, 4 capture assertions, 6 compiler assertions and 58 CLI cleanup/cancellation assertions; **117 total**. |
| `npm run check:reference`, owned endpoint | Resident pass: fifteen owners, 54 sources, 294 accesses, zero errors/limits and the two expected warnings. |
| `npm run check:self`, same owned endpoint | Resident pass: eleven owners, 271 sources, 3,503 accesses, zero errors/warnings/limits. |
| Installed daemon stop and process reaping | Passed for the resident checks and every live handler. |
| `git diff --check` | Passed. |

Owner receipt: `.reference-work/reports/iteration11-owner-witnesses.json`, completed 2026-09-12T11:53:25.698Z. Resident receipt: `.reference-work/reports/iteration11-resident.json`, completed 2026-09-12T11:53:01.793Z. Both use the same production build hash as the final live run. Their source hash `062d6de5f884c11b8e97f4c7c92e820c6fc60a3692833056889560e97abafc51` precedes the final harness-only evidence improvements; the owner/runtime implementation did not change afterward.

Before/after owner evidence remains in `deletion-before.json`, `deletion-after.json`, `repeated-missing-before.json`, `repeated-missing-after.json` and `iteration11-cleanup-cancellation-before.json` / `iteration11-cleanup-cancellation-after.json` under the reports directory. Separate fresh-batch fixture qualification passed 107 R and 108 S100 assertions; those 215 assertions are not credited as process equivalence.

**Reserved and unrun locally:** Vitest/Cucumber regression, scenario coverage and sealed-file checks. The full `reference:verify -- --plan 5 --iteration 11` prerequisite gate is also unrun because I5-10:plan2-gate-amended invokes the full Plan 2 gate, including its Plan 1 regression runners and measurement obligations. No automatic verdict or passing full prerequisite gate is claimed. The checklist leaves functional completion and complete new-test runner confirmation false, while recording authored executable coverage and passing focused witnesses.

## Recommendations for Next Iteration

1. Automation should run the reserved suites and establish the full iteration/prerequisite exit. The five process providers and owner regressions are ready; their direct evidence does not waive any earlier gate.
2. Iteration 13 can cite this coherent I5-12 receipt as the live equivalence evidence. Plans 3, 4 and 6 inherit the guarded sequences, strict report comparison, real watcher publication and audit observations.
3. Integrate the membership observation repairs before accepting iteration 12 measurements. That parallel iteration starts from the preceding build; performance evidence must identify the implementation actually measured.
4. The inherited Plan 2 measurement-provider migration, macOS worker/process acceptance, mixed-invocation provenance observations and broader observer disagreement-propagation limitation remain separate obligations. This iteration's bounded membership and cancellation repairs do not establish those cases.

## Focused self-assessment attempt

**2026-09-12:** read-only workflow inspection found iteration 11 at `validate_output_retry`. The journal records the draft publication at 12:06:13.140Z, but no iteration-11 regression execution or verdict. Publication does not establish those checks. The full prerequisite gate still invokes the reserved Plan 1 Vitest/Cucumber runners through I5-10:plan2-gate-amended; its inherited measurement obligations also remain required. No reserved runner was invoked in this attempt.

This one focused attempt reproduced and repaired a defect in the new focused evidence entry: `runLiveInstances([])` returned `passed: true` with zero executed instances. Its default list and automatic test registration also came from provider keys, allowing a removed provider to silently reduce those lists. The canonical Plan 5 inventory and gate were unaffected, and the earlier five-provider receipt did execute all five cases.

The focused entry and automatic registration now select from the reviewed iteration-11 inventory. Preflight rejects an empty or duplicate selection, an unknown instance, and a provider registry that omits or adds a record. Explicit valid subsets remain supported and retain caller order. A shared executable witness supplies thirteen positive and negative controls, including removal of each of the five providers and rejection by the actual focused entry before a receipt is produced. The witness is registered in the existing live Vitest file for automation.

| Focused verification | Result |
| --- | --- |
| Direct call of `runLiveInstances([])` before correction | Failed the independent expectation: returned a passing receipt with zero executions. |
| Direct `liveSelectionWitness()` through Node/tsx after correction | **13 assertions passed**; the same witness is registered for automatic regression. |
| `NODE_OPTIONS='' node --import tsx scripts/reference-harness/plan5-live-smoke.ts hook-race-watcher` | **26 process assertions passed** through the installed executable; racing and later hooks still have their required behavior. All owned processes were reaped. |
| `npx tsc -p scripts/reference-harness/tsconfig.json` | Passed, including the selection witness and Vitest registration. |
| `git diff --check` | Passed. |

The before receipt is `.reference-work/reports/iteration11-selection-before.json`; the zero-execution raw receipt `iteration11-live-1789214909516.json` is defect evidence only and must not be credited as a passing live run. The after receipt is `iteration11-selection-after.json`, completed 12:09:08.099Z. The process receipt is `iteration11-live-1789214965841.json`, completed 12:09:25.841Z. Both passing receipts preserve coherent before/after identities:

- Pre-commit HEAD: `4c2efe2ae51f0614c273bd71d9e43f8db60534e1`.
- Source SHA-256: `a1ea305675cc45f0fd5bea45334f8dcf4490076dc68e86ab526d27ebb47fa6ba`.
- Unchanged production build SHA-256: `9b930ad1f8b4ace4cf522ece9a572f9e47c5131c538df0fe5bc49dc7b4386e93`.

The thirteen selection assertions are harness controls, not process or prerequisite credit. This attempt changed only three reference-harness files; it did not change production code or the five process providers. The earlier 846-assertion coherent run, 117 owner-witness assertions and resident checks remain evidence for their recorded inputs. The other four process cases and owner witnesses were not repeated for this selection-only repair.

**Checklist disposition remains:** `functionalRequirementsSatisfied: false`, `newCodeCoveredByTests: true`, `allNewTestsPass: false`. All checks run in this repair pass after correction, but the required full prerequisite gate and complete execution under automatic Vitest/Cucumber remain unconfirmed. The inherited obligations listed above are not waived. The primary agent commits the repair on the authoritative iteration branch; publication is left to validation recovery as explicitly requested.

## Regression remediation: audit setup, observed deletion and runner timeouts

**2026-09-12:** automatic Vitest regression ran and reported **1,437 passed and 10 failed tests across 93 files**. Its output is preserved at `.cucumber-viz/workflows/lD1vuzYQuKvbHViU1BMjX/check-results/post_commit_regression-11-1789215116461-6516f7/regression/output.log`. This is a failed automatic verdict, superseding the earlier statement that no verdict had been recorded.

This remediation changes only the three failing test files and addresses the three failure causes:

- **Five audit setup failures:** the new static import of `session-input-witness.ts` loaded `session-engine.ts` before `session-test-fixture.ts` registered its recomputation mock. The engine retained the original function binding, so the fixture could not capture its state. The witness is now imported inside its test body, after fixture registration. All existing cold-open, drift, position, cancellation, full-report comparison and audit assertions remain. The five failures occurred before those assertions could run; automatic regression must confirm the corrected mock ordering.
- **One observed-deletion fixture failure:** the fixture deleted an unreferenced source, which the repaired batch/session observation contract correctly removes from the current inputs. It therefore could not satisfy the test's stated observed-deletion precondition. A retained same-owner side-effect import now makes the compiler probe the missing source. The original expectations remain unchanged: the CLI sends a null hash, receives confirmed coverage, exits 0 and reports no findings. The test additionally requires the precise unresolved-target coverage note. The outside-root and unobserved-path rejection assertions remain.
- **Four CLI runner timeouts:** recovery/supersession, warm deadline mapping, close-context cleanup and invalid-description tests reached Vitest's default five-second test limit while real compiler startup, updates and cleanup ran under parallel regression. The changed-command suite now has an explicit 30-second runner allowance, consistent with the root resident CLI tests. CLI request deadlines remain unchanged, including the controlled one-millisecond deadline assertions and the requirement that timed-out context work completes. No production limit or timing expectation was relaxed.

| Focused verification | Result |
| --- | --- |
| `npm run type-check` | Passed all four scopes, including all three changed test files. |
| `NODE_OPTIONS='' node --import tsx .reference-work/iteration11-regression-remediation.mts` | **34 assertions passed:** 19 observed-deletion/negative-path/cleanup checks through the real quick service, plus the existing 15-assertion close-context cleanup witness. |
| Fresh batch comparison in that direct probe | Complete resident report equals batch with the same invocation after replacing only runId, including inputId and the unresolved-target coverage note. |
| Quick-service teardown | Zero connections, request/subscription leases, watcher handles or timers remain. |
| `git diff --check` | Passed. |

The focused receipt is `.reference-work/reports/iteration11-regression-remediation.json`, completed **2026-09-12T12:17:37.955Z**. Its source/build identities remain coherent before and after execution:

- Pre-commit HEAD: `87d72fe1693f4056a6a793711e106f587f00b56f`.
- Source SHA-256: `5a78bbd991a0d4e24f6d733b3e866c89caeb3227a3532b6fe57f6865cfdd77ce`.
- Unchanged production build SHA-256: `9b930ad1f8b4ace4cf522ece9a572f9e47c5131c538df0fe5bc49dc7b4386e93`.

An initial exploratory comparison supplied only two requested capabilities to batch while the CLI requested thirteen. It failed on request/capability metadata; `iteration11-regression-probe-setup-failure.json` records that setup error. The corrected probe passes the CLI's actual capability request to batch and retains the complete comparison. The earlier fixture probe is retained as `iteration11-deletion-fixture-probe.json`.

No Vitest/Cucumber runner, scenario coverage check or sealed-file check was rerun locally. The direct checks do not establish Vitest mock execution, success under parallel runner load, or a passing full prerequisite gate. Automatic revalidation remains required for those claims. The checklist therefore retains `functionalRequirementsSatisfied: false`, `newCodeCoveredByTests: true` and `allNewTestsPass: false`. The decision-pending self-assessment finding and inherited prerequisite obligations are neither waived nor marked resolved.

The primary agent commits these bounded test repairs on the authoritative iteration branch. Validation and subsequent publication remain with the workflow.
