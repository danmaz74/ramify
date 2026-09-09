<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 10 results: tags, source areas and testing origin in real source

Status: implemented and locally verified. Automated acceptance remains pending. This iteration establishes its bounded static tag/origin evidence; it does not establish the public analysis session, later source forms, CLI behavior or Plan 1 completion.

## Prerequisites and scope

Workflow detail confirmed iterations 1–9 completed with accepted publication. Work began at `eacd53f` on `workflow/iteration-1-project-verifier` in the authoritative checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-1-project-verifier`. The working tree was initially clean. Applied the iteration-work, testing and bugfixing skills, the reviewed contracts/activation manifest and the definitive source/model principles.

The supplied iteration-9 check output still identified a concrete script-resolution contradiction. It affects this iteration's origin decisions and belongs to its TypeScript owner, so it was reproduced and fixed here. No principles, public contract signatures, exposure declarations, matrix records, implementing iterations or prerequisites changed. No classification override was added.

## Delivered

- Registered the `tags-origin` capability with all **36** reviewed iteration-10 instance handlers, including every explicit type, dispatch-importer, production-origin and browser-promise variant. Registration is checked against the independent reviewed inventory.
- Exercised importer profiles from actual inventory areas. Ordinary source, reserved `src/tests/`, and a separate testing module's ordinary source retain their distinct profiles. `example.test.ts` and `helpers/tests/probe.ts` remain ordinary source. Header required-importer tags survive test derivation; browser does not. Children retain their independent headers.
- Established SU1/W5 and root dispatch visibility before asserting UI/dispatch tag denials. Matching browser tags do not repair the missing controller-to-task exposure.
- Verified explicit type modifiers and inferred type-only requests for unmarked interfaces. Unmarked classes used only in annotations and function/namespace merged bindings used through `typeof` still request values. Fixtures compile independently with non-verbatim type imports permitted.
- Verified same-owner browser exemptions after source-origin checks, own-private test access, denial of foreign-private test access, K2/A4/W3 fixture exposure, and removal of W3 while own tests remain allowed.
- Checked production value, type and symbol-free imports of both own and foreign testing source. Testing barrels preserve production originals but still block production access; ordinary forwarders retain the testing original and are themselves denied.
- Distinguished an ordinary production binding explicitly tagged `testing` from testing-classified source: own production access is allowed, foreign production access is denied by the required-importer tag.
- Exercised the standalone integration-tests owner with its full `[testing, dispatch]` ordinary profile, its authorized setup import and denial of parent-private assembly. Independent `[testing, browser]` fixtures require a foreign value's browser promise, while their nested test area drops browser.
- The stylesheet instance checks both a default binding and a symbol-free load of the copied testing CSS resource. Resource identity, original testing profile and target origin survive the shared shim; both accesses are denied before same-owner exemptions.
- Reused the existing model and source-area implementation. The shared source harness now invokes analysis-owned `evaluateAccesses` instead of assembling import questions in the harness. Both iteration-9 and iteration-10 assertions consume the real acquisition/parser/catalog/linker/evaluation path on one captured view, sealed and disposed before returning.
- Retained located analysis diagnostics alongside independent expected decisions. Assertions check exact originals, profiles, requests, exposure paths, forwarding origins and denial sets; compiler errors cannot substitute for permission findings.
- Updated owner/harness documentation and the harness's current capability/count expectations. The two full-gate integration tests retain their assertions and have finite 1,200-second execution limits (1,210 seconds for the outer subprocess test), accommodating the measured 491-second gate and concurrent test execution. Analysis resource/deadline limits are unchanged.

## Executed matrix evidence

```sh
npm run reference:verify -- --plan 1 --iteration 10 --format json --preserve-on-failure
```

Passed on its first run, exit **0**, empty stderr.

| Measure | Result |
| --- | ---: |
| Required instances | 201 |
| Passed | 201 |
| Failed | 0 |
| Later instances not executed | 107 |
| New iteration-10 instances | 36, all passed |

Prerequisite closure: `[1, 2, 3, 4, 5, 6, 7, 9, 10]`. Available capabilities: acquire, catalog, link, metadata, parse, registry, static-access and tags-origin. `planComplete` is **false**.

| Matrix row | Executed instances |
| --- | --- |
| I1-12 | ui-value; ui-type; dispatch-value/core; dispatch-value/pure-ui; dispatch-type/core; dispatch-type/pure-ui; tag-without-path |
| I1-13 | browser-value; explicit-type/statement; explicit-type/inline; unmarked-interface; unmarked-class; merged-runtime; same-owner |
| I1-15 | derived-profile; child-profile; test-looking-file; nested-helpers-tests; own-private-test; foreign-private-test |
| I1-16 | foreign-fixture; remove-fixture-hop; production-value/same-owner; production-value/foreign-owner; production-type/same-owner; production-type/foreign-owner; production-side-effect/same-owner; production-side-effect/foreign-owner; testing-barrel; production-forwarding-test |
| I1-17 | production-tagged-testing; separate-testing-module; testing-module-browser/unpromised; testing-module-browser/promised; nested-tests |
| I1-23 | testing-style, with both binding and side-effect assertions |

Each instance used an isolated reference copy or the reviewed independent fixture and completed its own checked baseline. The new instances recorded 360 baseline assertions and 4,340 changed-fixture assertions, including per-occurrence diagnostic checks. All passed.

Reference baselines retained exactly fifteen owners, 292 static occurrences, 164 allowed application decisions and 128 proven external selections. The shared evaluation's baseline diagnostics are empty. Dynamic/import-type interpretation remains explicitly deferred; this is static-stage evidence only.

Recorded instance durations total **491.427 seconds**. This is harness execution time, not an iteration-15 batch latency or memory-budget measurement.

## Resolution defect reproduced and corrected

The inherited constraint report identified a `paths` alias with candidates `./src/init.jsx` and `./src/tests/init.ts`. With plain scripts at `src/init.ts` and `src/tests/init.ts`, the pinned compiler selects the ordinary script. The adapter omitted the `.ts` substitution for `.jsx`, advanced to the testing candidate, and produced a false testing-origin denial.

Added compiler-trace comparisons through the real analysis evaluation suite for both `.jsx` and the existing `.js` positive control. Before the correction, the `.jsx` regression failed for the reported wrong target/profile while `.js` passed. The fallback now uses the pinned compiler's `.ts`, `.tsx`, declaration, `.js`, `.jsx` candidate order for both spellings and retains first-candidate priority.

After the fix, all four selected resolution tests passed: the two new substitution instances and the existing relative/bare wildcard-path controls. Compiler resolution and adapter targets agree, ordinary loads are allowed without invented symbols, and the bare testing alias still receives its origin denial.

An ignored declaration-evidence script initially addressed `result.inventory` instead of `result.input.inventory` after successful validation. Corrected the script and reran it. This was an evidence-script error, not a runtime defect; both transcripts are retained.

## Verification

Passed:

- `npm run worktree:prepare`.
- Initial and final `npm run type-check`, covering toolkit, portable owners, scripts and harness.
- `npm run build`, including production selection and emitted dependency/helper checks.
- `npx vitest run subs/analysis/src/tests/evaluate-accesses.test.ts -t 'compiler script substitution priority|wildcard paths resolution'`: **4 selected tests passed**.
- `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/tags-origin.test.ts scripts/reference-harness/static.test.ts`: **2 registration tests passed**.
- `npx tsx scripts/reference-harness/validate.ts`: all 308 records, pointers and prerequisites valid.
- The complete 201-instance iteration-10 gate above.
- Actual toolkit declaration/export validation through `validateProject`: **9 owners, 125 inventoried files, 54 expanded statements**, valid.
- `git diff --check` and source/declaration/ownership review.

The **6 selected Vitest tests** are focused implementation feedback. Per the supplied check policy, full Vitest/Cucumber regression, scenario coverage and sealed-file checks remain with workflow automation; no local full-regression pass is claimed. The unfiltered plan-completion gate was not rerun and still requires the 107 later instances. After the passing intermediate gate, only harness test timeouts/comments and workflow draft artifacts changed; final type-check and diff validation passed.

## Evidence location

Ignored local evidence is under `.reference-work/iteration10-evidence/`: the gate's stdout/stderr and summary, before/after resolution test logs, registration results, initial/final type-check logs, build output and declaration validation transcripts. These are local evidence files, not a committed plan-completion report.

## Handoff and Recommendations for Next Iteration

- Iteration 11 should extend the existing source API for its namespace, star, lazy, import-type and empty-statement forms. Iteration 10 did not activate those capabilities.
- Iteration 12 can connect these existing evaluation decisions and diagnostics to the reviewed public session/report. Preserve selected requests separately from runtime loads, and accessed source separately from original identity and forwarding origins.
- Use profile membership, including a testing module's ordinary source, for origin isolation. Keep the reserved test-area derivation and ordinary same-owner exemption order; do not infer profiles from file names or globs.
- Without a compiler-established module, the script fallback still has its documented package, directory, extensionless and rootDirs limits. Unknown targets remain coverage limits.
- The predecessor's resource-description conflict and namespace-completeness concerns remain outside this iteration. Complete resource-access reporting, self-check/negative, CLI/relocation, performance evidence and Plan 1 completion remain assigned to later iterations.
