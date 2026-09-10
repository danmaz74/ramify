<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 12 results: resources, coverage and the analysis session

Status: implemented and locally verified. Submitted evidence is for iteration 12; automated acceptance and Plan 1 completion remain separate.

## Prerequisites and ownership

Workflow detail confirmed iterations 10 and 11 completed with accepted publication. Work began at `875cab970c880218252734844dcd9f95bc45dbde` on `workflow/iteration-1-project-verifier` in the authoritative checkout. The working tree was clean. Applied the iteration-work and testing skills, with focused bug reproduction for source interpretation and report bounds.

Implementation belongs to analysis and its TypeScript child. Harness handlers and owner tests accompany it. No model principle, reviewed public signature, matrix membership, reference application source/configuration or plan prerequisite changed. The reviewed analysis report/session types, exposures and package entries now have implementations.

## Delivered

- Added the public `createAnalysisSession(inputs)` and `analyzeProject(inputs, control?)` operations. Construction captures plain request data without I/O. Each session admits one analyze call, rejects concurrent/repeated work explicitly, supports cancellation, and disposes idempotently. The convenience binding always releases its real session.
- Composed the existing acquisition, parser, source catalog, linker and model evaluator. Registry, acquisition/inventory, parse, catalog, link, access, decide and report stages retain explicit execution outcomes and blocked prerequisites. Invalid input cannot produce a partial permission graph or a passing source check.
- Published the reviewed `ramify.analysis/1` report: request, effective scope, validated registry, fresh batch UUID, sealed content identity, available/requested/executed capabilities, stage evidence, inventory/purpose metadata, originals, expanded descriptions, source selections/origins, decisions, diagnostics, warnings, coverage and derived counts.
- Input identity includes the canonical scope/configuration, registry, integration recipe and sorted captured observations. Changed inputs discard the whole candidate and retry within the finite acquisition policy, disposing each discarded compiler/view before retry. Exhaustion remains incomplete with blocked dependent checking.
- Added finite report/diagnostic/exposure checks, preserved admitted diagnostic and warning prefixes, and checked serialization size before producing detached data. Oversized request metadata is explicitly reduced to a bounded prefix in an incomplete failure envelope. The 64 KiB control reserve also bounds failures when a caller supplies a byte limit smaller than the mandatory schema. Normal requests remain exact echoes.
- Decision evaluation uses one shared implementation for synchronous stage fixtures and asynchronous sessions. Sessions yield between batches of 64 selections, including within large namespace occurrences, so queued cancellation can reach the engine. Report completion rechecks the elapsed deadline after serialization.
- Reports retain frozen plain data only; compiler objects, view methods, callbacks and caches never enter the result. Cleanup completes before successful or cancelled analysis resolves.
- Established builtin/package targets remain external scope. Unresolved targets and project files outside module source retain explicit coverage; outside-module targets also retain compiler-selected warnings and never become external or allowed application imports.
- Added explicit Vite glob, loader method/Jiti and CommonJS coverage. Unsupported forms do not receive an automatic allowed symbol-free verdict. A known testing target still produces its source-origin denial beside coverage.
- Added located native TS2307 evidence for unresolved forwarding targets. Semantic diagnostic queries are limited to files already containing a resolution failure, and only diagnostics overlapping that specifier enter coverage. Ordinary type errors are not architectural failures.
- A missing resource import remains unverifiable; an exposure to that missing file is invalid. A selected missing name from an established resource export description produces a located missing-export diagnostic and failed public-session check.
- Resource consistency now accounts for value/type facts and descriptions reached through static, dynamic and import-type forms. Conflicting descriptions cannot supply an arbitrarily selected original to ground a named exposure.
- Unreferenced opaque resources retain their catalog state without claiming an uncovered source access. Relevant import/declaration gaps remain visible.
- Activated analysis A3, completed the A4/R3 vocabulary relays, and added the installed `.` and `./analysis` entries plus main/types metadata. CLI executable/package surfaces remain iteration 13.

## Inherited source findings corrected

Reproduced and corrected all three supplied iteration-11 findings with 15 new compiler-backed namespace cases:

1. Local unrenamed namespace exports now resolve through the compiler's referenced local symbol, preserving escape coverage for static and awaited imports alongside renamed controls.
2. Explicit nested destructuring follows actual merged namespace constituents and checks their originals, including private members.
3. Destructuring and typeof-import property qualifiers distinguish ordinary function properties from namespace exports, preserving the function original and the correct value/type request.

Related existing namespace, resource and origin checks also passed. No exposure or source rule was weakened.

## Matrix execution

```sh
npm run reference:verify -- --plan 1 --iteration 12 --format json --preserve-on-failure
```

Passed, exit **0**, empty stderr.

| Measure | Result |
| --- | ---: |
| Required instances | 268 |
| Passed | 268 |
| Failed | 0 |
| Later instances not executed | 40 |
| New iteration-12 instances | 23, all passed |
| New-instance baseline assertions | 273 |
| New-instance changed-fixture assertions | 314 |

Prerequisite closure: `[1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]`. Available harness capabilities: acquire, catalog, coverage, lazy, link, metadata, namespace, parse, registry, resources, session, static-access, symbol-free and tags-origin. `planComplete` is **false**.

| Matrix row | Separately executed instances |
| --- | --- |
| I1-23 | missing-resource/source; missing-resource/declaration; missing-resource-export |
| I1-24 | external/package; external/builtin; unresolved; unsupported-macro; unsupported-commonjs/require, import-equals, export-equals and module-exports; partial-clean; partial-denied; resolution-blocked |
| I1-27 | cancel/acquisition; cancel/catalog; read-failure; dispose/completed; dispose/in-flight; report-retention |
| I1-29 | outside-module-target; changed-input/once; changed-input/repeated |

Lifecycle handlers use isolated workers and real file/compiler operations. Instrumentation holds acquisition/catalog boundaries, injects one read fault, and mutates actual captured inputs. It records opened/closed handles and helper lifetimes. The retention case ran five warmups plus 25 retained-report cycles, verified disposed-session weak references clear, and applied the reviewed heap/RSS growth bounds. Raw post-GC samples and assertion evidence remain in the gate output. These are bounded fixture lifecycle evidence; iteration 15 owns reference/100-owner latency, peak-memory and relocation measurements.

Instance durations total **718.883 seconds**; the 23 new instances account for **92.506 seconds**. These are harness execution durations, not cold engine latency measurements.

## Public compiled API and declarations

The final production build's installed `ramify.ts/analysis` entry successfully analyzed the unchanged reference:

- Completed, passed, complete source coverage.
- Exactly 15 owners, 54 source files, five resources and 89 catalog originals.
- 294 source occurrences: 166 allowed application decisions and 128 external selections.
- No source diagnostics or coverage notes.
- Two expected outside-module-source warnings: vite.config.ts and vitest.config.ts, one selected file each.

The authored lazy ReviewPanel selection, import-type query and Cucumber hook remain in the checked source. This is source evidence, not runtime execution of the application or hook.

Current toolkit declarations validated against actual exports through `validateProject`: **9 owners, 134 inventoried files, 56 expanded statements**, valid. This is declaration validation; the full toolkit source self-check remains iteration 15.

## Verification

Passed:

- `npm run worktree:prepare`.
- `npm run type-check` across toolkit, portable owners, scripts and harness.
- `npm run build`, including production selection and emitted dependency/helper checks.
- Final focused session/bounds command: **30 tests passed** (29 public-session cases and one real-source queued-cancellation case):
  `npx vitest run subs/analysis/src/tests/session.test.ts subs/analysis/src/tests/evaluate-accesses.test.ts -t 'public disposable analysis session|cancellable real-source decision batches'`.
- TypeScript coverage owner file: **12 tests passed**.
- Focused namespace/origin/mixed analysis cases: **45 tests passed**, including the 15 new namespace regressions.
- Three existing resource regression files: **28 tests passed**.
- Focused influencing-read-failure/path lifetime regression: passed.
- Harness session registration and hidden-reference detection: **2 tests passed**.
- `npx tsx scripts/reference-harness/validate.ts`: all **308** reviewed records, pointers and prerequisites valid.
- The **268-instance** iteration gate above and all 23 new handlers in focused development runs.
- Compiled public API/reference and actual toolkit declaration validation.
- `git diff --check` and review of ownership, exposed contracts and the resulting diff.

The gate ran alongside final focused review. Subsequent focused checks specifically verified report-size failure envelopes and queued decision cancellation; final type-check, production build and compiled API/declaration checks included those corrections.

Per the supplied check policy, full Vitest/Cucumber regression, scenario coverage and sealed-file checks remain with workflow automation. No local full-regression, full-plan gate, CLI or self-check pass is claimed.

Development failures were retained and corrected: inherited namespace interpretations; resource description disagreement; omitted native resolution diagnostics; lost acquisition error paths; layout diagnostic categorization; warning-only and same-occurrence diagnostic admission; oversized request envelopes; and synchronous decision traversal. One harness assertion was corrected to retain a known source-origin check beside an unresolved original; it still forbids assigning an allowed original-binding decision to that unresolved selection.

## Evidence

Ignored local evidence is under `.reference-work/iteration12-evidence/`: gate stdout/stderr and summary, focused handler transcripts, raw lifecycle/memory assertions, compiled reference report, package API/declaration verification and source before/after logs. Final session/bounds, type-check and build logs are adjacent under `.reference-work/`. These are iteration evidence, not a committed Plan 1 completion report.

## Recommendations for Next Iteration

- Format this exact completed report in iteration 13 and preserve execution/check/coverage independence. Invalid input fails; incomplete or unavailable work cannot be inferred successful from empty diagnostics.
- Keep the two reference configuration-file warnings visible in human and JSON output. Unreferenced opaque-resource catalog state is not an unchecked authored import.
- Use the installed analysis entry and lazy root batch assembly; retain lightweight help/version startup and the reviewed final CLI/package declaration activation.
- Preserve origin evidence for unresolved bindings and known testing targets without turning unsupported CommonJS/loader selections into allowed imports.
- Iterations 14 and 15 retain the whole-reference completion gate, runtime regression tiers, self-check/negative, relocation and workload measurements. No daemon, server, persistent cache, worker pool or alternate checker was added.

## Constraint remediation (2026-09-09)

Addressed both reported iteration-12 findings in the authoritative checkout, starting from workflow checkpoint `f3aac7a`. The original 268-instance gate and implementation evidence above belong to the initial implementation turn; they were not rerun during this focused remediation.

- **cf-constraints-mtuqfi7x-r3lyf0mm — application functions named require:** CommonJS call recognition now inspects the compiler symbol's declarations. Local implementations, overloads with implementations, variables, parameters and imported application bindings do not turn their string arguments into source loads. Ambient function/variable declarations and Node's actual require binding retain the existing CommonJS coverage and testing-origin checks.
- **cf-constraints-mtuqfi7x-bfjx9qy4 — empty nested merged-binding patterns:** an empty nested object pattern retains the consumed runtime original. Static namespaces, awaited imports, callback parameters and callback-body destructuring now check Merged for visibility and browser promises. Nonempty patterns continue to select actual namespace constituents independently.

Added **22 compiler-valid public-session regression cases**. Seven application-function variants include imported/renamed controls; three actual CommonJS variants cover ambient functions, ambient variables and Node types. Twelve merged-binding cases combine four source forms with private, visible-but-unpromised and explicitly browser-promised originals. Each merged-binding case first asserts ordinary named destructuring and then the empty nested pattern, retaining original identity, value request, location, decision and coverage assertions.

Before the fixes, **18 cases failed and four controls passed**, reproducing the reported contradictions without compiler fixture errors. After the fixes, all **22 cases passed**. The independent controls establish that application function calls have no invented resource access, actual CommonJS keeps its known testing-origin denial beside coverage, and empty patterns neither bypass definite denials nor omit allowed selected originals.

Focused verification passed:

```sh
npx vitest run subs/analysis/src/tests/session.test.ts -t 'iteration 12 constraint remediation'
npx vitest run subs/analysis/subs/typescript/src/tests/coverage.test.ts subs/analysis/src/tests/evaluate-accesses.test.ts subs/analysis/src/tests/session.test.ts -t 'records .*CommonJS|keeps known .*origins on unsupported CommonJS|nested-member|name-property|import-type Merged|actual merged namespace export|binding propert|symbol-free source'
npm run type-check
npm run build
git diff --check
```

The first command passed **22 new cases**; the second passed **17 affected existing cases** covering CommonJS forms/origins, nested namespace constituents, ordinary binding properties, import-type qualifiers and symbol-free origin isolation. Type-check covered toolkit, portable owners, scripts and harness. The production build and emitted dependency/helper checks passed. Current toolkit declaration/export validation through the compiled public analysis entry remained valid: **9 owners, 134 files, 56 expanded statements**.

Before/after test logs, affected checks, type-check/build output and declaration validation are retained under ignored `.reference-work/iteration12-evidence/remediation/`. No existing assertion, scenario, public contract, exposure, model principle, reference fixture or matrix record was removed or weakened. Full regression, scenario coverage, sealed-file and constraint acceptance checks remain with workflow automation.
