<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 7 results: linking and exposure contracts

Status: implemented and locally verified; submitted for workflow acceptance. This iteration establishes grounded descriptions and the validation library, not source access checking, the CLI, the public analysis session or Plan 1 completion.

## Prerequisites and scope

Workflow detail marked iterations 1–6 completed with accepted publication. Work began at `aa23627` on `workflow/iteration-1-project-verifier`. All source changes, verification commands and Git operations used the authoritative checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-1-project-verifier`.

Implemented the reviewed iteration-7 contracts in descriptions and analysis. No contract signatures, model principles, matrix membership, instance assignments, package dependencies, predecessor results or check outputs were changed. The existing harness's stage-specific resource capability interpretation was retained.

One necessary provider correction was made in the model: dependency declaration evidence can have normalized leading `../` segments when the reference copy uses the example's installed dependencies. Its canonical resource identity and defining source area remain owned. Original paths, source origins, exposure evidence and tag evidence retain their existing containment validation. This was required to link the actual isolated reference, and was reproduced by two failing tests before correction.

## Delivered

- Added the exact `LinkInputs`, `ExpandedSelection`, `LinkIssue` and `LinkedDescriptions` vocabulary and the portable `linkDescriptions` operation. It reads supplied facts only and returns detached, deeply frozen data.
- Named owned references require inventory-validated exact files and established catalog originals. Missing exports, foreign ownership, conflicting assignments and name collisions invalidate the whole result. Equivalent repeated selections merge and retain declaration evidence.
- Interface wildcards select every effective export name, including defaults and aliases. Empty files retain empty selections. Incomplete or ambiguous export descriptions and selections without grounded originals cannot produce partial valid contracts. The inventory's interface eligibility rules remain enforced.
- Child contracts resolve by direct-child declared names, from leaves to root. Wildcards select the child's effective to-parent originals. Named references without a to-parent exposure retain their identity as ineffective. Receipt follows canonical identity even when another alias supplies the parent channel. Relay source tags never filter exposure.
- Explicit tag assignments are collected before defaults and validated through the model. All catalog originals, including private exports and resources, receive their defining area's mandatory tags. Wildcards apply a uniform explicit clause to their selected originals; unknown clauses remain invalid even for empty expansions.
- Added `validateProject` and the staged analysis vocabulary, plus the supported source-only `validation-entry.ts`. The operation validates registry identity, acquires the whole project, retains precise parser diagnostics, derives areas, obtains the real compiler catalog and links descriptions. It seals influencing inputs, retries changed acquisitions within finite bounds, computes an input identity and releases compiler/input state before returning.
- Validation distinguishes valid, invalid, incomplete, unavailable and cancelled outcomes. Unsupported requested capabilities are explicit. Invalid and incomplete branches contain no linked model. Bounds cover source/acquisition work, aggregate acquisition attempts/time, expanded pairs, diagnostic/result sizes, analyze time and disposal. The pure linker has finite pair/diagnostic ceilings; lower per-run limits are checked by assembly without dropping members.
- Activated descriptions D3/D4, linking vocabulary in A6/R4, analysis A1/A4 and the validation vocabulary in R3. Updated the parser's independent staged declaration expectations and owner READMEs. Final surfaces scheduled for later iterations remain absent. No placeholder export or broader exposure was added.
- Extended the existing harness with exactly the 34 executable records assigned to iteration 7, including all three statement-order variants and both collision variants. Each mutation uses its own real filesystem fixture, checked baseline, captured acquisition, compiler catalog and public validation entry.
- Added independent expected data for all 33 reference statements, their original identities, tags, destinations, selectors and selected names. Baselines also assert private exports remain unexposed.

## Executed matrix evidence

The final required gate passed:

```sh
npm run reference:verify -- --plan 1 --iteration 7 --format json --preserve-on-failure
```

Result: exit 0; empty stderr; prerequisite closure `[1, 2, 3, 4, 5, 6, 7]`; **139 required and passed**, **0 failed**, **169 not executed**, and **6,206 assertions including baselines**. All **34 iteration-7 records** passed. Summed instance duration was **151.190 seconds**. Available capabilities are acquisition, catalog, linking, metadata, parsing and registry. `planComplete` remains false.

The ignored evidence directory is `examples/collection-review/.reference-work/iteration7-final-i5tznsom/`. It contains the original npm stdout log, empty stderr, and an extracted portable `verification.json`. Required membership and expectations were not changed to obtain the pass.

| Matrix row | Executed records | Outcome |
| --- | ---: | --- |
| I1-05 | 9, including original/reversed/rotated statement order | All passed |
| I1-09 | 7 | All passed |
| I1-10 | 9 | All passed |
| I1-11 | 9, including same/distinct original collisions | All passed |

## Verification

Passed:

- `npm run worktree:prepare`.
- Final `npm run type-check`, covering toolkit, portable owners, scripts and harness.
- Final `npm run build`.
- `npx vitest run subs/analysis/src/tests/validation.test.ts subs/analysis/subs/descriptions/src/tests/linking.test.ts subs/analysis/subs/model/src/tests/dependency-locations.test.ts`: **3 files, 32 tests passed**.
- `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/linking.test.ts`: **3 tests passed**, covering exact handler membership, the independent reference contract map and all nine current toolkit descriptions.
- `npx tsx scripts/reference-harness/validate.ts`: all **308 records**, pointers and prerequisites valid. This is inventory validation, separate from conformance execution.
- The final iteration gate above.
- Ordinary Node ESM use of the emitted `dist/subs/analysis/src/validation-entry.js`, without tsx: the unchanged reference returned **15 owners, 59 files and 33 expanded statements**; the toolkit returned **9 owners, 112 files and 25 staged statements**. Both retained frozen models after compiler and input disposal.
- Diff and staged whitespace checks and review of source ownership, public contracts and declaration activation.

The **35 distinct focused tests** cover ineffective and empty contracts, alias receipt, relay tag independence, missing/invalid prerequisites, tag collection, collision behavior, frozen results, fresh input identity, parser locations, missing exports, incomplete namespace selections, merged runtime bindings, unsupported capabilities, registry/header validation, finite limits and cancellation.

Per the supplied check policy, full Vitest/Cucumber regression, scenario coverage and sealed-file checks are left to workflow automation. No local full-regression outcome is claimed. No source-access, server, browser, CLI or whole-plan completion evidence is claimed.

## Failures investigated and corrected

1. The first iteration gate passed all 105 prerequisite records but failed all 34 new records during baseline setup. The retained report is `iteration7-linking-g38hb363/`. Reference copies exposed the model's rejection of real dependency declaration locations above the copy root. The independent fixture also exposed a linker check that rejected lexical merged function/namespace originals merely because namespace members were present. Both were corrected; their focused controls now pass.
2. The new public validation test found that acquisition can reject a malformed description before retaining an inventory module. The assembly now retains parser results from the actual acquisition callback, preserving their exact code and span without reparsing live files.
3. The second gate, retained in `iteration7-second-vxarntmo/`, passed 138 records and failed only the malformed test-wildcard location assertion. That process had loaded the assembly before the parser-diagnostic correction. A focused run of the exact handler then passed its 9 baseline and 4 changed assertions; the final complete gate passed all 139 records.
4. An initial ad hoc `tsx --eval` smoke invocation used relative root/cwd values incorrectly and ran through a mode that did not provide `import.meta.resolve`. It was not accepted as verification. Subsequent source probes used absolute fixture requests and Node ESM with the tsx loader; the final compiled probe used ordinary Node ESM.

Failed evidence and preserved mutation copies were retained rather than relabelled as success.

## Handoff and Recommendations for Next Iteration

- Iteration 8 can import `validateProject` and its named vocabulary from `subs/analysis/src/validation-entry.ts` before dist exists. It takes the reviewed explicit project, registry, capability and limit inputs. Keep declarations and actual exports synchronized during migration.
- Iterations 9–12 can consume valid `LinkedDescriptions.modelInput` and the per-statement expanded selections. Ineffective named child references are intentionally valid; absent child names and ungrounded originals are invalid. Do not treat the validation result as source import decisions.
- The reference catalog still reports the existing two resource-description limits for its Cucumber feature and HTML entry. The toolkit catalog similarly retains resource-description notes for remaining skeleton marker files. These files are inventoried; none supplies an exposed binding. No coverage note is counted as source checking.
- The supplied iteration-6 check output describes incompatible effective resource descriptions and namespace completeness propagation defects in the source adapter. This iteration does not claim those provider defects are fixed. A real namespace-forwarding test now establishes that an ungrounded namespace cannot pass an interface wildcard through this linker. The provider's catalog facts and incompatible resource descriptions still require correction before later access stages rely on those cases.
- Full session lifecycle, peak/repeated-use measurements, source interpretation, CLI packaging and final plan acceptance remain in their assigned later iterations. The focused validation cleanup and retention tests do not claim the later I1-27 acceptance instances.
