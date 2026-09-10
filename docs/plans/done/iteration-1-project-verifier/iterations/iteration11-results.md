<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 11 results: namespaces, forwarding stars and lazy forms

Status: implemented and locally verified. Automated acceptance remains pending. This is bounded source-stage evidence, not public analysis-session, CLI or Plan 1 completion evidence.

## Prerequisites and scope

Workflow detail confirmed iteration 9 completed with accepted publication. Work started from `b737b9a` on `workflow/iteration-1-project-verifier` in the authoritative checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-1-project-verifier`; the working tree was clean. Applied the iteration-work, testing and bugfixing skills, the reviewed source contracts and activation manifest, and the definitive interpretation/model rules.

Implementation belongs to the TypeScript owner. The necessary analysis integration changes only how its existing evaluator recognizes completed empty selections and applies the existing target-origin check to erased empty forms. Harness handlers, owner tests and documentation accompany those changes. No model rule, public contract signature, exposure declaration, reference application/configuration, reviewed matrix record or prerequisite changed.

## Delivered

- Added a compiler-symbol reference index and bounded namespace interpretation. Direct members, string-literal keys, explicit destructuring/renaming and qualified types select their identifiable originals. Shadowed identifiers do not become namespace accesses. Named imports of forwarded module namespaces retain nested constituent originals and forwarding source areas.
- Added explicit coverage for unknown keys, namespace escape, object rest, unsupported promise flows and nonliteral dynamic targets. Known selections remain independently checked; a private selection still produces its denial beside an escape note. Unknown portions are never expanded into all exports.
- Added source star and namespace re-export checks. Stars exclude default; namespace re-exports include it. Type-only variants retain type requests and no runtime load. Private exports remain selected by whole re-exports, and a downstream named import cannot narrow the forwarding file's checks.
- Kept source forwarding separate from Ramify exposure. The nested-provider fixture allows its parent's forwarding source while denying the root consumer when that parent has no declaration exposing the original to root.
- Added literal dynamic-import selection for directly awaited members, awaited namespace members/keys, destructuring, direct .then callback members/keys and callback destructuring. The unchanged reference's `.then((panel) => ({ default: panel.ReviewPanel }))` is checked as authored.
- Added AST-based TypeScript and JSDoc import-type queries. Member queries request types; unqualified typeof-import namespace queries select runtime members' types, including default and excluding purely type exports. The JSDoc instance uses a separate JavaScript fixture with allowJs, checkJs and noEmit; the reference configuration is unchanged. Attached native JSDoc wrappers are deduplicated by syntax position.
- Added empty imports/re-exports and discarded dynamic imports without dummy symbol requests. They share the existing source-origin evaluation path with side-effect imports. Erased forms retain origin isolation; inline type imports retain their runtime-load flag independently of type availability.
- Preserved incomplete namespace expansion coverage through named relays while checking known members. Added a focused regression for that case.
- Made occurrence identities retain namespace path segments, distinguishing a literal exported name such as "group.value" from the nested path group.value. A real-catalog regression reproduced the collision before the fix and passes afterward.
- Registered all 44 reviewed iteration-11 handlers and the namespace, lazy, symbol-free and bounded coverage capabilities. The shared source harness now exposes all evaluation decisions alongside the existing static subset, using the same captured acquisition/parser/catalog/linker/evaluation path and disposing it before return.

## Executed matrix evidence

```sh
npm run reference:verify -- --plan 1 --iteration 11 --format json --preserve-on-failure
```

Passed, exit **0**, empty stderr.

| Measure | Result |
| --- | ---: |
| Required instances | 209 |
| Passed | 209 |
| Failed | 0 |
| Other instances not executed in this gate | 99 |
| New iteration-11 instances | 44, all passed |

Prerequisite closure: `[1, 2, 3, 4, 5, 6, 7, 9, 11]`. Iteration 10 is independently available but outside that closure. Available capabilities: acquire, catalog, coverage, lazy, link, metadata, namespace, parse, registry, static-access, symbol-free and tags-origin. `planComplete` is **false**.

| Matrix row | Executed instances |
| --- | --- |
| I1-19 | namespace-members; literal-key/single-quote and double-quote; destructure/direct and renamed; qualified-type/ordinary-namespace and type-namespace; private-growth; unknown-key; escape; known-denial-plus-escape |
| I1-20 | source-star; type-star; namespace-export; type-namespace-export; downstream-selection; no-declaration |
| I1-21 | reference-lazy; await-member/direct, namespace-dot and namespace-key; await-destructure; then-member/dot and key; then-destructure; import-type/typescript and jsdoc-javascript; typeof-import-member; typeof-import-namespace; nonliteral-target/variable and template |
| I1-22 | hook-side-effect; empty-import; empty-export; discarded-lazy; inline-type-statement; testing-target with separate same-owner/foreign records for side-effect, empty-import, empty-export and discarded-lazy |

All 44 new handlers completed their own compiler-valid checked baseline and changed-fixture assertions. The gate records **352 baseline assertions** and **1,240 changed-fixture assertions** for them. The focused 44-handler development run also passed before the full prerequisite gate.

The unchanged reference retains exactly fifteen owners and has **294 source occurrences: 166 allowed application decisions and 128 proven external selections**, with no access coverage notes or permission diagnostics. This includes its authored lazy ReviewPanel load, shell import-type query and testing-module Cucumber hook. Runtime execution of the hook remains separate regression evidence.

Recorded instance durations total **417.217 seconds**; the 44 new instances account for **89.029 seconds**. These are harness execution durations, not iteration-15 latency or memory-budget measurements.

## Inherited JSX resolution correction

The supplied iteration-10 check finding identified a relative .jsx import with adjacent plain .js and .jsx scripts and no TypeScript counterpart. Added a compiler-trace regression through the actual analysis pipeline. Before the correction, the compiler resolved the JSX script while the adapter selected the JavaScript script.

The script fallback now preserves JSX-before-JavaScript priority for a .jsx spelling after its TypeScript/declaration candidates. Existing explicit paths-target priority, module-suffix handling and ordinary relative substitution controls remain intact. All nine selected compiler-trace checks passed: the new relative JSX case, six exact-path/relative controls and two absent-target substitution controls. No classification override or guessed external target was introduced.

## Verification

Passed:

- `npm run worktree:prepare`.
- Initial and final `npm run type-check`, covering toolkit, portable owners, scripts and harness.
- `npm run build`, including production selection and emitted dependency/helper checks.
- Focused TypeScript access and analysis evaluation tests: final run **20 selected tests passed**. These cover all new owner tests plus affected mixed-binding, origin, incomplete-source and compiler-resolution controls.
- `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/bounded.test.ts`: **1 registration test passed**, matching all 44 handlers against the independent inventory.
- `npx tsx scripts/reference-harness/validate.ts`: all **308** reviewed records, pointers and prerequisites valid.
- The **209-instance** iteration-11 gate above.
- Actual toolkit declaration/export validation through `validateProject`: **9 owners, 126 inventoried files, 54 expanded statements**, valid.
- `git diff --check` and review of source ownership, existing exposure contracts and the resulting diff.

The final focused test command was:

```sh
npx vitest run subs/analysis/subs/typescript/src/tests/accesses.test.ts subs/analysis/src/tests/evaluate-accesses.test.ts -t 'literal dotted|nested expansion|bounded|nested namespace|attached JSDoc|import types|relative JSX priority|exact paths priority|script substitution priority|mixed binding|origin guard|missing exports and unresolved'
```

Both TypeScript and JSDoc tests also compile independent fixtures and assert that type queries preserve exposure denials, required-importer tag denials and testing-origin denials, alongside an allowed type control.

Per the supplied check policy, full Vitest/Cucumber regression, scenario coverage and sealed-file checks remain with workflow automation; no local full-regression pass is claimed. The unfiltered completion gate was not rerun. The runtime now implements 245 reviewed instances across the completed capabilities; its 63 later instances remain pending. Existing full-gate tests were updated to those capability/count expectations without removing assertions or changing timeouts.

Development failures were retained and corrected: optional native binding-node types, duplicate JSDoc traversal, the inherited JSX target selection and dotted-name occurrence identity. An initial evidence command used unavailable `python` instead of `python3`; an inline tsx evidence probe selected a CommonJS execution mode incompatible with import.meta.resolve, so it was rerun from an ESM .ts file. Neither evidence setup issue changed application behavior.

## Evidence location

Ignored local evidence is under `.reference-work/iteration11-evidence/`: gate stdout/stderr and summary, the 44-handler focused transcript, final focused tests, before/after JSX and dotted-name regressions, type-check/build logs, inventory validation, reference source facts and toolkit declaration validation. These are local iteration evidence, not a committed Plan 1 completion report.

## Recommendations for Next Iteration

- Iteration 12 should fold the existing located SourceLimit records into the public report's coverage section and preserve the distinction between checked, mixed and unverifiable access outcomes.
- Reuse the existing analysis-owned target-origin path for symbol-free and erased forms. Preserve runtime-load flags independently from selected type requests and accessed source independently from originals and forwarding origins.
- Namespace whole selections require completeness evidence even after named relays. Preserve known constituent checks alongside expansion limits and retain distinct path segments in occurrence identities.
- Complete resource-access reporting, unsupported macro/CommonJS coverage, session cancellation/disposal and coherent-input outcomes remain iteration 12 obligations. The inherited resource-description conflict concern is not claimed resolved here.
- The public session, CLI, whole-plan reference gate, self-check/negative, relocation and performance evidence remain with their assigned later iterations. No daemon, server, persistent cache or alternate checker was added.

## Constraint remediation (2026-09-09)

Addressed all four reported iteration-11 contradictions in the authoritative checkout, starting from workflow checkpoint `a1b40c6`. The original 209-instance gate and earlier implementation evidence above belong to the original implementation turn; they were not rerun during this focused remediation.

- **cf-constraints-mtuokf8t-pxtrkmnf — shorthand namespace escape:** the reference index now resolves shorthand properties through their referenced value symbols. Static and awaited dynamic namespaces passed as `{ ns }` produce located namespace-escape coverage. Any independently selected private member still produces its denial.
- **cf-constraints-mtuokf8t-n0cmr3tj — erased export paths:** runtime membership now belongs to the export path, independently of the canonical original's value/type existence. Compiler namespace-member facts handle named and local type-only forwarding; the existing finite forwarding graph preserves erasure through named relays and type-star edges. Whole typeof-import queries exclude erased paths, while explicit type imports keep their original identities and permission checks. These private facts stay within the helper lifetime, are cleared on disposal, and do not change the public catalog contract.
- **cf-constraints-mtuokf8t-10lyqima — merged function properties:** namespace traversal distinguishes an actual nested export from ordinary properties on an owned runtime binding. Calls, function name access, call-method access and literal property access select the function original. Actual merged namespace members still select their own originals and receive their independent permission checks.
- **cf-constraints-mtuokf8t-9ms7h83l — incomplete nested namespaces:** each lookup segment accumulates completeness and issue evidence from its forwarding sources. An absent member produces a definite missing-export diagnostic only with complete evidence; otherwise it produces located incomplete-exports coverage with related source evidence. Known members continue to resolve and receive their checks through one or multiple namespace relays.

Added **26 parameterized compiler-backed regression cases** through the real acquisition, catalog, linker and analysis evaluation pipeline. They cover static/awaited shorthand and direct escape controls (including known denials), six erased-forwarding forms with explicit type controls, mixed live/erased nested namespaces, merged/unmerged function properties and actual namespace members, and complete/incomplete nested namespace lookups with known-member controls. Missing-source/member fixtures intentionally assert their compiler diagnostics; the remaining fixtures compile successfully.

The first focused run exposed the reported failures. Two fixture assertions were corrected before final verification: native subprocess diagnostics are on stdout, and an absent namespace member uses TS2694. An executable compiler probe also established that the pinned compiler includes type-star keys in its module type; the runtime-path implementation therefore uses explicit type-star edges rather than relying solely on that native property list. The type-star regression retains an independent zero-runtime-selection assertion.

Focused verification passed:

```sh
npx vitest run subs/analysis/src/tests/evaluate-accesses.test.ts -t 'iteration 11 constraint regressions'
npx vitest run subs/analysis/subs/typescript/src/tests/accesses.test.ts subs/analysis/src/tests/evaluate-accesses.test.ts -t 'bounded|nested namespace|attached JSDoc|nested expansion|literal dotted|keeps exposure, importer tags'
npm run type-check
npm run build
git diff --check
```

The first test command passed all **26 new cases**; the second passed **8 affected existing cases**. Type-check covered toolkit, portable owners, scripts and harness. The production build and helper/dependency checks passed. Direct unchanged-reference verification retained **294 occurrences, 166 application decisions, no access coverage and no permission diagnostics**, including the authored lazy load and import-type query. Toolkit declaration/export validation remained valid: **9 owners, 126 files, 54 expanded statements**.

Before/after test logs, compiler probe, type-check/build output, reference facts and declaration validation are retained under ignored `.reference-work/iteration11-evidence/remediation/`. After these checks, only an explanatory test comment and workflow draft artifacts changed. Full regression, scenario coverage, sealed-file and constraint acceptance checks remain with workflow automation. No scenario, existing assertion, exposure, public contract, reviewed matrix record or reference configuration was removed or weakened.
