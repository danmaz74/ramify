<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 9 results: static access checking

Status: implemented and locally verified. This is the static source stage; it does not establish the public analysis session, complete source-form coverage, CLI behavior or Plan 1 completion.

## Prerequisites and scope

Workflow detail confirmed iterations 1–8 completed with accepted publication. Work used the authoritative checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-1-project-verifier` and its `workflow/iteration-1-project-verifier` branch, starting at `bba4f21`. Applied the iteration-work and testing skills, the reviewed contracts and activation manifest, and the definitive source/model principles.

No model rules, public contract signatures, matrix records, implementing iterations or prerequisites changed. The pre-existing iteration8-checklist.json modification was preserved: its generated `mcpTool` marker differs from HEAD. It was not edited or included in the implementation staging.

## Delivered

- Activated the exact reviewed `SourceTarget`, `WrittenForm`, `AccessSelection`, `SourceAccess` types and `SourceAnalysis.accesses(signal?)`. Added their A8/R4 declaration relays without adding a runtime exposure or future session/package entry.
- Implemented static named/default imports, statement-level and inline type modifiers, inferred type-only requests for purely type originals, and named source forwarding exports. Each selected binding is retained individually with its source location, selected/local names, written form, runtime-load flag, accessed source, canonical original and forwarding origins.
- Local forwarding aliases retain the request at their import declaration. Default forwarding aliases preserve the named original. Wrappers and new type aliases keep their defining owner and required tags.
- Reused the real compiler catalog and configured resolution, including .js substitution and application aliases. Proven external targets have explicit package/builtin/library scope; an unresolved bare alias remains unresolved.
- Static side-effect imports retain code/resource targets and their source areas without fabricated symbols or exposures. Plain initialization scripts with no module symbol have a bounded explicit-file fallback using extension and module-suffix priority and requiring the selected script in the captured compiler program.
- Added the analysis-owned internal `evaluateAccesses` stage. It passes resolved selections and known target-only accesses through the model's existing origin and permission decisions. It retains original/tag/exposure/forwarding evidence and produces located, deterministically ordered diagnostics. Missing exports, definite denials, unresolved work and external scope remain distinct; known findings survive alongside coverage limits.
- Extended the supervised helper's bounded operation protocol. Catalog and access operations use one compiler snapshot, support access-first calls, share cancellation/disposal handling, and return frozen plain data. Access/selection limits fail explicitly without publishing a successful prefix.
- Implemented all 26 iteration-9 matrix instances, including each validation-runtime, named/default and type-syntax variant. Every project mutation starts from a checked baseline. Both baseline and changed fixtures pass an independent TypeScript invocation; source denials do not rely on compiler-invalid access.
- The stage harness binds the published acquisition/parser/catalog/linker/model operations on one captured view. It asserts independent expected permissions and evidence, and seals and disposes that view. The completed public analysis session remains iteration 12; no parallel checker or alternate permission algorithm was added.
- Updated owner/harness documentation and the exact declaration fixture. Updated two existing harness integration tests that still expected iteration-6 capability/count totals. They now expect current providers and 165 executed instances, with a finite timeout accommodating the measured gate workload and bounded JSON capture.

## Executed evidence

```sh
npm run reference:verify -- --plan 1 --iteration 9 --format json --preserve-on-failure
```

Passed, exit 0, empty stderr:

| Measure | Result |
| --- | ---: |
| Required instances | 165 |
| Passed | 165 |
| Failed | 0 |
| Not executed | 143 |
| New iteration-9 instances | 26, all passed |

Prerequisite closure: `[1, 2, 3, 4, 5, 6, 7, 9]`. Iteration 8 is independent and adds no matrix instance. Available capabilities: acquire, catalog, link, metadata, parse, registry and static-access. `planComplete` remains false. Recorded instance durations total approximately 311 seconds; this is gate execution evidence, not the later batch performance budget measurement.

The unchanged reference has exactly fifteen owners and **292 static occurrences**: 164 application decisions, all allowed, and 128 compiler-proven external selections. The static form inventory is 189 ordinary imports, 99 statement-level type imports, one inline type import, one type re-export and two side-effect imports. A separate lexical inventory of the authored reference source independently confirmed these form counts without calling the source interpreter or model.

The reference's dynamic import and import-type query retain explicit deferred-interpretation notes. Existing catalog-only notes for the Cucumber feature resource and index.html remain separate. No static reference application access is hidden by these notes.

The emitted adapter and analysis evaluation were also exercised in ordinary Node, using the emitted parser/acquisition/catalog/linker/model providers and no tsx loader. They reproduced 292 static occurrences, 164 application decisions, 128 external selections and zero static diagnostics. Retained results serialize after source disposal.

## Verification

Passed:

- `npm run worktree:prepare`.
- Final `npm run type-check`, including toolkit, portable owners, scripts and harness.
- `npm run build`, including production selection, dependency checks and emitted helper construction.
- Focused compiler/analysis tests: **11 passed** across accesses.test.ts and evaluate-accesses.test.ts.
- Exact current declaration fixtures: **25 passed**.
- New harness matrix-registration test: **1 passed**.
- Focused real iteration-3 invocation test for the updated capability reporting: **1 passed**; the other invocation tests were outside this selected run.
- `npx tsx scripts/reference-harness/validate.ts`: all 308 records, pointers and prerequisites valid.
- The complete iteration-9 intermediate gate above.
- Actual toolkit declaration/export linking: **9 owners, 125 inventoried files, 54 expanded statements**, valid. It includes all twelve current source-contract names and no future session exposure.
- Compiled static-stage check on the unchanged reference.
- `git diff --check` and source/declaration/dependency review.

The **38 distinct focused tests** are implementation feedback. Per the supplied check policy, full Vitest/Cucumber regression, scenario coverage and sealed-file checks remain with workflow automation; no local full-regression pass is claimed. The unfiltered plan-completion gate was not rerun and is still expected to fail for absent later capabilities.

## Failures investigated and corrected

1. An initial type-check found that the pinned native ImportClause API uses `phaseModifier`, not the historical `isTypeOnly` field. The implementation now uses the installed and reviewed API; binding-level modifiers still use `isTypeOnly`.
2. Two focused tests exposed unresolved symbol-free .js imports of plain initialization scripts with no exports. A native API probe confirmed that these scripts have neither a module symbol nor reference-symbol definitions. Added the bounded fallback without modifying script bytes or compiler settings. The plain-script, stylesheet, alias and suffix-priority cases now pass.
3. A temporary local evidence script initially had an incorrect relative import; its path was corrected before the reference probe ran. This did not affect application source.
4. Inspection found stale iteration-6 expectations in the harness's full-gate and invocation tests. Counts/capabilities were updated to the implemented stage; no handler, matrix member or assertion obligation was removed.

Failure transcripts are retained alongside passing output in the local evidence directory.

## Evidence location

Ignored local evidence is under `.reference-work/iteration9-evidence/`: intermediate gate stdout/stderr, focused passing/failing tests, independent static inventory, native script-target probe, toolkit declaration summary, build and type-check output, and compiled static-stage results. These are local evidence files, not a plan-completion artifact or committed dependency inventory.

## Handoff and Recommendations for Next Iteration

- Iteration 10 can use the existing static target-only occurrences for production-side-effect and testing-style, including null symbol selection and retained source-area evidence.
- Iteration 11 extends this same source API for namespace members, stars, dynamic/import-type forms, empty statements and discarded imports. Those forms remain explicitly uncovered in this stage; no whole namespace or lazy permission is manufactured.
- Iteration 12 should connect the internal analysis evaluation stage to the reviewed public session/report contracts. Validation remains validation-only. Its report must retain capability/stage execution separately from bounded coverage.
- Without a compiler-established module target, package, directory, extensionless and rootDirs resolution of plain initialization scripts remain explicit limits. The fallback handles only established explicit-file script targets, stops at the first existing candidate and never classifies an unknown alias as external.
- The predecessor's resource-description conflict and namespace-completeness concerns were outside this iteration and are not claimed fixed.
- Full regression and final source conformance, self-check, CLI/relocation, performance budgets and plan completion remain with their scheduled iterations and workflow checks.
