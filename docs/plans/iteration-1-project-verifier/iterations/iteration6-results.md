<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 6 results: source catalog

Status: implementation and scoped verification complete; ready for workflow acceptance. This establishes compiler-backed catalog facts, not source import decisions, the public analysis session, CLI checking or Plan 1 completion.

## Prerequisites and scope

Workflow detail confirmed iterations 1 through 5 completed with accepted publication. Work started at `3f1e666` on `workflow/iteration-1-project-verifier`, using only the authoritative checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-1-project-verifier` for edits, tests and Git operations.

The pre-existing iteration-5 checklist change is a generated metadata delta from `workflow.write_iteration_checklist` to `workflow.publish_iteration`. Its bytes were preserved and excluded from iteration-6 implementation staging. No predecessor results, check outcomes, plan contracts, required membership or instance assignments were rewritten.

The reviewed source contract is implemented with only its catalog-stage types and `catalog()`/`dispose()` members. There is no placeholder `accesses()` result. TypeScript remains the already pinned runtime dependency `7.0.2`; no compiler or dependency migration was needed.

## Delivered

- Implemented `createSourceAnalysis` and the exact staged source interfaces in `subs/analysis/subs/typescript/src/`. The parent owns the finite helper process and POSIX process group. All programs, ASTs, native handles, symbols and resolution state remain in the helper.
- The compiler parses the actual discovered configuration. A captured-absence-selected in-memory configuration extends it and supplies every owned compiler-source root plus compiler-selected inputs, with empty include/exclude selection. No project or configuration script executes, and neither the configuration nor the resource witness is written to disk. Solution-style configurations are explicitly unavailable.
- Every compiler filesystem callback is served by the supplied `ProjectInputView`. Missing reads return native `null`, missing existence checks return false, and directory/realpath callbacks retain captured facts without live-disk fallback. The view remains caller-owned so analysis can seal all influencing reads and then dispose it.
- The bridge enforces one operation/callback at a time, 1 MiB encoded frames, sequential 192 KiB chunks, the 8 MiB source-file limit, bounded transfer/result allocation, aggregate captured/in-flight accounting, source deadlines and bounded disposal. Startup and operation cancellation remain responsive while a filesystem callback is unresolved. Failure/cancellation waits for cleanup before returning, and terminal work cannot publish late success.
- Catalogs enumerate every owned file and every compiler export, including private exports. Code identities use the declared owner, owner-src-relative file and original lexical binding name; anonymous defaults use `#default`. Renames, local forwarding, named/default forwarding and star paths preserve originals and defining areas. New wrappers and type aliases receive new identities.
- Original facts retain all resolved declarations and independent value/type existence, including unmarked interfaces, runtime classes and merged runtime bindings. Namespace exports retain constituent originals, without manufacturing a wrapper that changes ownership.
- Conflicting star originals and conflicting lexical declarations remain unresolved through subsequent star and named forwarding. Known independent exports remain available. Declarations spanning different owners or source areas are ambiguous. Temporary native winners are removed from retained original facts when no valid export selection supports them.
- Only parsing/binding diagnostics needed for declaration extraction are requested. Ordinary semantic/type-check, global, suggestion and declaration-emit diagnostics do not run. Syntax, resolution, missing resource descriptions and ambiguous enumeration produce located catalog limits, with compiler codes where applicable.
- Physical resource identity is separated from effective TypeScript descriptions. An unexecuted synthetic witness obtains descriptions for unimported resources. Shared ambient shims, per-file arbitrary-extension declarations, JSON effective exports, resource aliases and testing-area resources retain the actual resource owner and source area.
- Resource aliases use the compiler's parsed `pathsBasePath`, including inherited configuration. This native runtime field was verified directly against the installed API; its public TypeScript declaration omits the field. Resolved code/package targets take precedence over later resource fallback candidates. A declaration shim cannot establish a missing resource.
- External scope comes from compiler-resolved module declarations, native external/default-library metadata or a resolved built-in. A bare alias or unresolved spelling does not establish external scope. Application targets outside owned source remain distinct.
- Public catalogs cross the process boundary as JSON and are recursively frozen. Retained catalogs contain no functions, getters, compiler prototypes, cycles or hidden compiler references. Compiler disposal is idempotent and rejects later catalog requests; a retained catalog still works after both source analysis and the input view are disposed.
- Activated TypeScript T1/T2 and the catalog-name portions of analysis A8 and root R4. Updated the existing parser's independent declaration expectations for this stage. Removed the populated source-test directory's skeleton marker.
- Added only the three assigned catalog handlers to the existing harness and activated its catalog capability. Fixture mutations use independent copies, checked baselines, actual acquisition/parser/model profiles and actual compiler catalogs. Small owner tests supply a local input-view double; real acquisition composition and the complete reference-map test live in the independent harness scope, preserving sibling runtime exposure boundaries.

## Executed matrix evidence

Both the required npm invocation and the final direct Node/tsx invocation of the same verifier passed:

```sh
npm run reference:verify -- --plan 1 --iteration 6 --format json --preserve-on-failure
node --import tsx scripts/reference-harness/verify.ts --plan 1 --iteration 6 --format json --preserve-on-failure
```

Final result: exit 0, empty stderr, prerequisite closure `[1, 2, 3, 4, 5, 6]`, **105 required/passed instances**, **0 failed**, **203 not executed**, and **3,356 assertions including baselines**. Available capabilities are acquisition, catalog, metadata, parsing and registry. `planComplete` remains false.

The final ignored portable report is `examples/collection-review/.reference-work/iteration6-submission-XcLVMeVd/verification.json`, with its empty `stderr.txt`. Earlier successful reports remain in the independent `iteration6-catalog-ploma6dh` and `iteration6-final-ca1xpa5u` directories. The latter npm invocation completed in 30.730 seconds.

| Assigned instance | Outcome | Baseline assertions | Changed/run assertions |
| --- | --- | ---: | ---: |
| I1-23:two-css-resources | passed | 29 | 29 |
| I1-23:resource-alias | passed | 29 | 34 |
| I1-23:json-binding | passed | 10 | 26 |

CSS assertions establish exact default export descriptions, two distinct resource identities under Vite's shared declaration, correct source profiles/default tags and alias preservation. JSON assertions establish ownership by the JSON file and effective binding descriptions without requiring a physical declaration file. These are catalog assertions; missing-resource-export still requires the public analysis-session failure in iteration 12.

## Verification

Passed:

- `npm run worktree:prepare`.
- `npm run type-check`, including toolkit, portable owners, scripts and harness; final run passed.
- `npm run build`; final run passed.
- `npx vitest run subs/analysis/subs/typescript/src/tests`: **4 files, 41 tests passed**. The final additional conflicting-lexical/star positive-negative control also passed in isolation after extending its fixture.
- `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/catalog.test.ts`: **31 tests passed**. Its 28 independent contract-map groups cover the map's exposed and private names, original IDs, locations and value/type existence, plus AppRouter, resources and the standalone testing owner.
- `npx tsx scripts/reference-harness/validate.ts`: all **308 records**, pointers and prerequisites valid. This is inventory validation, not conformance evidence.
- Both iteration-verifier invocations described above.
- Direct Node ESM use of emitted project/parser/model/source entries on the unchanged reference: **15 owners, 59 files, 89 originals**, both distinct CSS originals, correct AppRouter identity, coherent seal, successful disposal and rejection after disposal. A retained frozen catalog remains usable.
- `git diff --check`, staged diff checks and implementation/declaration review.

The compiled catalog has two explicit resource-description limits: the Cucumber feature file and the HTML entry have no effective TypeScript export description. Both remain inventoried. Every reference contract-map binding and both CSS-module bindings are resolved; these resource records are not source-access or permission results.

The supplied check policy leaves full Vitest/Cucumber regression, scenario coverage and sealed-file checks to workflow automation. They were not run locally. The Vitest commands above selected the newly authored source-owner and reference-catalog tests only. No automated regression outcome is claimed here.

## Failures investigated and corrected

- The first focused source run passed 21 tests and failed the configured resource alias. A direct native-options probe established the separate inherited `pathsBasePath`; using that base fixed the failure and all resource tests passed.
- The first iteration verifier hit the source deadline on the reference. The parent was recomputing and hashing the entire captured input set for every callback. Accounting now snapshots identities at stage boundaries and tracks new reads incrementally. A focused regression covers this behavior. The failing verifier was stopped, its owned helper groups terminated, and its abandoned fixture removed; subsequent complete gates passed in about 30 seconds.
- Independent probes found a missing per-file resource misclassified through its shim, a later resource path candidate overriding a resolved package, and ambiguous star members regaining a compiler-selected original downstream. Focused failing cases drove the corrections; all six associated edge/control tests passed.
- A conflicting lexical-export probe showed an arbitrary native winner surviving binder errors. The catalog now marks that binding unresolved, propagates it through aliases/stars and retains an unrelated positive export. The regression passes.
- A compiled reference smoke run performed concurrently with mutable fixture work returned an explicit changed seal and failed its coherence assertion. It published no successful result. A subsequent compiled acquisition/catalog/seal/dispose run passed. The changed result was retained as an observed failed verification attempt, not relabelled as success.

## Handoff and Recommendations for Next Iteration

1. Iteration 7 can link against complete file descriptions and known originals, retaining whole-expansion rejection for incomplete/ambiguous files. Original `id.file` is owner-src-relative; `origin.file`, declaration locations and `FileExports.file` are root-relative.
2. Keep source catalog limits distinct from missing-export source failures and permission decisions. Access interpretation begins in iteration 9; the remaining I1-23 origin and public-session cases remain assigned to iterations 10 and 12.
3. Keep the original input view open through all influencing compiler reads. Seal before claiming coherent analysis, and discard/retry dependent work on a changed seal. The source adapter owns its compiler; analysis owns disposal of the supplied view.
4. Include the deterministic synthetic configuration/resource-witness recipe and complete selected root set in iteration 12's input identity. Their bytes are already bounded and are determined by captured configuration, inventory and absence observations. No daemon revision identity is introduced.
5. Preserve the pinned native API and the observed paths-base behavior when dependencies change. The launcher uses the development tsx loader only for source execution; the emitted helper ran with ordinary Node ESM.
6. Full public-session cancellation, native-child reaping/repeated-use measurements, relocated packaging and the final plan gate remain their later acceptance obligations. The focused lifetime and retention tests do not claim those whole matrix instances.
