<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 3 checkpoint: shared-global coverage correction

**Date:** 2026-09-11. **Status:** partial; architecture acceptance is pending. This checkpoint does not complete iteration 3 or establish its incremental capability.

## Prerequisites and decision needed

Work is confined to `/tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification`, on `workflow/iteration-2-resident-verification`, starting at `27d87d0b5a4078697e0f3155e90dbfe4462f3e1c`. The existing modification to `iteration2-check-results.md` was preserved without editing or staging it.

Read CLAUDE.md, the iteration-work, testing and bugfixing skills, the development guides, the current analysis contract and invalidation model, the predecessor results, and the source-interpretation rule for application global augmentations. Prepared the example and site dependencies with `npm run worktree:prepare`.

The live workflow detail reports iterations 1 and 2 published/accepted and iteration 3 running. This is publication state only. `iteration1-results.md` explicitly says: "Do not begin iteration 3 until the revised contracts, scope, owners and inventory receive architecture acceptance." `contracts.md` and iteration 2's handoff still record that decision as pending. The iteration 1 main-plan patch is also preserved in its results after publication rejected that target as frozen.

An explicit request to accept the concrete revised package was submitted during this turn and has not received an answer. The request identifies the revised contracts, scope, owners and inventory, finite configuration-helper use during resolution, retained sealed inputs for invalid acquisition, and the 4.5 s / 5.5 s reference latency targets. No acceptance has been inferred from elapsed time or workflow publication.

The separately authorized inherited TypeScript defect and its necessary compatibility correction were completed while that decision remained pending. Analysis/project interfaces, incremental operations, reuse products, exposure activation and increment harness registration remain unimplemented. Iteration 4 must not start from this checkpoint.

## Implemented correction

The catalog previously called `sharedGlobals` only when a source had no module symbol or external-module indicator. It therefore silently treated `declare global` blocks in module files as fully covered.

`subs/analysis/subs/typescript/src/catalog.ts` now uses the compiler's `SourceFile.moduleAugmentations` to identify global augmentations in module source. It records one located `shared-global` note per file, with further blocks as related locations, while retaining the module's ordinary exports. The compiler's augmentation inventory distinguishes these blocks from local namespaces/modules named `global` and from string-named external module augmentations. Script handling is unchanged.

Added two owner regression tests in `src/tests/catalog.test.ts`: multiple blocks with preserved exports and related locations; and an import-only declaration module with ordinary namespace/module and string-named augmentation controls.

The direct reproduction failed before the fix with `0 !== 1` for the missing module augmentation note. After the fix, it passes alongside script and local-namespace controls. A second direct smoke validates the import-only module and both namespace controls. Both run the real source helper and dispose their input view and helper in `finally`.

## Necessary compatibility correction

The corrected catalog exposed `declare global` in `subs/presentation/src/tests/interaction.test.ts`, making the toolkit self-check's coverage partial. The existing self harness explicitly requires complete coverage and every owned source catalogued completely.

To preserve that acceptance expectation, the React fixture now sets the same `IS_REACT_ACT_ENVIRONMENT` property with `Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })` and removes its global type augmentation. This is the sole additional owner edit, required by the instruction to fix regressions. Runtime setup and all presentation assertions are unchanged; the checker is not weakened to hide the new note. The final toolkit self-check has complete coverage again.

## Verification

- `npm run worktree:prepare`: passed.
- `npx tsx .reference-work/iteration3-global-smoke.ts before`: failed as expected for the original missing note; saved before evidence.
- `npx tsx .reference-work/iteration3-global-smoke.ts after`: passed.
- `npx tsx .reference-work/iteration3-augmentation-controls.ts`: passed.
- `npm run build`: passed after the final edits.
- `npm run type-check`: passed after the final edits, including toolkit, portable, scripts and harness configurations.
- `npm run check:reference`: passed; completed execution and complete coverage, 15 owners, zero errors/denials/analysis limits, and the two existing outside-module configuration warnings.
- `npm run check:self`: passed after the React fixture correction; completed execution and complete coverage, 11 owners, 145 source files, 11 resources, 1,811 accesses, zero errors/warnings/denials/analysis limits.
- `npm run reference:verify -- --plan 2 --iteration 2`: passed, 4 required/4 passed; only harness-gate available.
- `npm run reference:verify -- --plan 2 --iteration 3`: failed because increment is unavailable; 22 required, 4 passed, 0 failed assertions, 172 not executed (18 required increment instances plus 154 future instances). This is an incomplete gate, not successful iteration evidence.
- `npm run reference:verify -- --plan 1 --iteration 12`: passed; 268 required/268 passed, 0 failed, 40 future instances not executed.
- `git diff --check`: passed.

Vitest/Cucumber regression, scenario coverage and sealed-file checks were not run locally, as the execution prompt reserves those to workflow automation. The two new Vitest tests are authored and type-checked; their runner verdict remains pending. Direct smoke results do not claim execution of the I2-11 instance, which additionally needs the unimplemented increment operation.

## Evidence artifacts

All execution evidence is under ignored scratch space, separate from managed workflow drafts:

- `.reference-work/iteration3-global-before.json`
- `.reference-work/iteration3-global-after.json`
- `.reference-work/iteration3-augmentation-controls.json`
- `.reference-work/iteration3-self-check.log`
- `.reference-work/iteration3-plan2-gate.log`
- `.reference-work/reports/plan2-iteration2-0f967f6a-4615-4829-b23a-b2f70fd7b3c3.json`
- `.reference-work/reports/plan2-iteration3-d1d6a925-a37a-4dbd-9040-e46853f7f7f8.json`
- `.reference-work/reports/plan1-iteration12-83476d94-f984-445c-b597-3ac1cc34e8b2.json`

## Remaining iteration work

After explicit package acceptance and resolution of its preserved plan revision, implement `resolveProjectRoot`, configuration-product reuse, `resolveProject`, `analyzeIncrement`, recorded stage dependencies, frozen retained products and byte accounting, all listed analysis/project tests, declaration relays, and the 18 I2-10/I2-11 handlers. Assert batch/increment equality and both inherited coverage outcomes. Rerun the iteration 3 gate and required affected checks.

The checklist is intentionally incomplete: functionalRequirementsSatisfied is false; newCodeCoveredByTests is true for the implemented correction; allNewTestsPass is false because the new Vitest tests have not run. Its timestamp records this checkpoint, not iteration completion. Publication for acceptance is withheld while the required architecture decision and implementation remain outstanding.

## Recommendations for Next Iteration

Resolve the pending iteration 1 architecture acceptance and its frozen main-plan patch through the authorized plan controls before proceeding with contract consumers. Retain the complete-coverage self-check expectation and the React setup compatibility correction. Do not treat this partial checkpoint, the successful prerequisite gate, or owner smoke evidence as an implemented increment capability.
