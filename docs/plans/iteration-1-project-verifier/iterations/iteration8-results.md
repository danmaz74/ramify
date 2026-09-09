<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 8 results: toolkit migration into declared owners

Status: implemented and locally verified; submitted for workflow acceptance. This iteration completes the toolkit migration and production selection. It does not establish source access checking, the public analysis session, installed CLI behavior or Plan 1 completion.

## Prerequisites and scope

Workflow detail confirmed iterations 1–7 completed with accepted publication. Work started at `4017db8` on `workflow/iteration-1-project-verifier`. All edits, checks and Git operations used the authoritative checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-1-project-verifier`.

Applied the reviewed move map, owner activation manifest, contracts and production-selection specification. No model principles, contract signatures, matrix records, iteration assignments or dependencies changed. The pre-existing modification to iteration7-check-results.md was preserved and excluded from the code commit. No control-plane outputs were edited.

## Delivered

- Removed the seven legacy model files and the combined root and visualization barrels. Independent legacy expectations now exercise the definitive model in its owned tests; there is no second evaluator.
- Moved diagram preparation, fixtures, validation, components, interaction and their tests into presentation. Diagram definitions carry canonical ModelInput facts. Fixture authoring creates real registry, module, source-area, original and exposure records, validated by buildModel. Camel-case teaching labels remain presentation metadata beside valid declared owner IDs.
- Presentation asks the definitive model for import decisions and complete visibility evidence, then selects a displayed arrival from that evidence. Original identities, source areas and relay paths remain intact. Its model imports use the existing model → analysis → root → descendants exposures and explicit browser promises.
- Split geometry and viewport into layout. Implemented the exact placeNodes, placeLanes, placeChords, placeLegend, placeTree, placeFocus and measureBounds contracts over neutral keys and dimensions. Numerical hierarchy, lane, corridor and curve calculations use d3 only within layout. Layout imports no model, presentation or React types or values. Presentation attaches its rows, labels and colors after joining neutral results.
- Migrated pure spacing, lane and viewport assertions into layout tests. Semantic rows, tags, propagation, tree/focus content and snapshot assertions remain in presentation tests.
- Rebased all nine SVG assertions in the three snapshot suites to the existing package-root site/static/diagrams directory. Each suite now requires its artifacts to exist before assertions, preventing Vitest from silently creating a missing snapshot. There is no SVG or snapshot tree under subs.
- Activated the exact presentation and layout declarations, analysis acquireInventory and its inventory vocabulary, and root's declaration-only presentation relay. Root source contains no UI import or re-export. Current analysis validation remains its supported source-only tool surface.
- Activated only implemented package entries: ./analysis/inventory, ./model, ./presentation and ./layout. Removed the legacy main. No future analysis-session or CLI entry was added.
- Updated site aliases and TypeScript paths to those precise portable entries; updated all four page consumers and the emitter. The harness retains its reviewed provider-stage public operations and uses the validation entry for available vocabulary. Its catalog tests no longer import private TypeScript-owned test fixtures.
- Implemented acquireInventory through the actual parser, project acquisition and model profile operations. It validates registry identity, seals influencing inputs, retries changed acquisitions within the existing finite limits, returns detached frozen inventory/profile data and disposes the input view.
- Implemented production:files with the exact versioned, portable JSON document. Selection uses resolved profiles and includes every owned file without testing classification, including ordinary interfaces/resources and test-looking ordinary filenames. It excludes nested test areas and testing owners' ordinary source. Unknown profiles or failed acquisition fail selection.
- Implemented the source-entry production bootstrap and staged build. It acquires selection once, emits through an explicit compiler file list, promotes only source-authorized artifacts, checks runtime and public typing dependencies/package targets, copies required resources/declaration inputs and replaces dist only after success. Failed builds preserve the prior dist and clean their own staging. The dev watcher now type-checks without emitting an unfiltered tree.
- Preserved whole-project type-checking and test discovery. Updated owner and package documentation to describe the implemented stage.

## Executed evidence

The required intermediate gate passed:

```sh
npm run reference:verify -- --plan 1 --iteration 8 --format json --preserve-on-failure
```

Result: exit 0, empty stderr, prerequisite closure [1, 2, 3, 4, 5, 6, 7, 8], **139 required and passed**, **0 failed**, **169 not executed**. Available capabilities remain acquisition, catalog, linking, metadata, parsing and registry. No matrix instance was newly activated here; planComplete remains false.

The source validation entry and, after the clean build, the emitted validation entry both validated the toolkit's migration stage: **9 owners, 121 inventoried files, 54 expanded statements, no diagnostics**. The ordinary Node compiled probe also asserted the presentation original's [browser, ui] tags, the root descendant relay and absence of root-owned exports. Model, layout and presentation package entries loaded and rendered the tag fixtures in ordinary Node without tsx.

Production selection results:

| Project | Owners | Whole inventory | Production selection |
| --- | ---: | ---: | ---: |
| Toolkit | 9 | 121 files | 73 files |
| Collection Review | 15 | 59 files | 32 files |

Both requested production:files commands passed. The reference selection retains ordinary interfaces and resources while excluding nested tests and the integration-tests owner's ordinary source.

A clean-bootstrap probe moved the pre-existing dist into a unique owned temporary directory before invoking npm run build. The build succeeded with dist absent at invocation. Final output has **146 JavaScript/declaration files**, **zero testing outputs** and no legacy src/index.js. The backup and production staging directories were removed. Compiled inventory package calls returned frozen results for both projects in ordinary Node.

## Verification

Passed:

- npm run worktree:prepare, repeated after the site manifest description changed.
- npm run build with dist absent at invocation.
- Final npm run type-check, including toolkit, portable owners, scripts and harness.
- 259 distinct focused tests across the migrated model cases (83), neutral/viewport/presentation layout and tree/focus cases (77), inventory and production tooling (11), presentation adaptation/validation/stages and exact declaration fixtures (57), and public catalog integration (31).
- npx tsx scripts/reference-harness/validate.ts: all 308 instance records, pointers and prerequisites valid. This is inventory integrity, separate from conformance execution.
- The iteration-8 reference gate above.
- npm run diagrams.
- npm run site:build, including a final build after source integration.
- Both production:files commands, compiled inventory/package smoke tests and compiled migration-stage validation.
- Vitest test collection: **764 tests in 38 files**, all in current owned test areas. Collection is not a full test execution.
- Diff and staged whitespace checks; source ownership, public exports, exposure stages and dependency-boundary review.

Per the supplied check policy, full Vitest/Cucumber regression, scenario coverage and sealed-file checks remain with workflow automation. No local full-regression outcome is claimed.

## Diagram and site review

Eight of the nine regenerated SVGs are byte-identical to the originals. In model-core.svg, the only differences are the d attributes of 12 path elements: each of six chords has two rendered paths. Layout now returns sampled points from the same d3 Catmull–Rom curves, keeping the reviewed neutral result contract. Text, element count, nodes, positions and other attributes are unchanged.

Reviewed before/after screenshots in local headless Chromium for the core, shop tree and payment focus views. Curves, labels, spacing, exposure indications and focus highlighting retain their visible behavior. Restored the original tree connector order so the tree and focus artifacts also remain byte-identical.

The site retains all nine accessible teaching diagrams across the landing, model, tags and modularity pages, including their headings and controls. The inspected client output contains 13 JavaScript chunks (688,818 bytes in the first build); Node/compiler/server markers were absent. This is a bounded bundle inspection and static visual review, not the later browser-promise verifier or browser interaction acceptance.

## Failures investigated and corrected

1. Canonical model validation rejected camel-case legacy module names. Fixture authoring now normalizes declared IDs and retains the existing teaching labels as separate presentation metadata; no identity rule was weakened.
2. Two semantic validation tests still expected the retired evaluator's clause/reason text. They now assert the current presentation arrival kinds and model not-visible reason, retaining the original positive and deliberate-mismatch assertions.
3. The first production build compiled successfully but failed in an ad hoc token scan of emitted project/purpose.js with Invalid array length. A bounded reproducer located non-advancing scanning around regex/backtick syntax. Emitted-dependency inspection now uses the pinned compiler's actual AST parser in an independent noResolve/noLib tool program with unconditional disposal. The regex/nested-template regression passes. Inventory acquisition still uses configuration-only integration.
4. Intermediate declaration tests ran before layout's declarations had been activated and correctly failed for the absent statements. Final exact declaration fixtures and real linking both pass.

Failure evidence was retained alongside final results. No expectation, capability membership or declaration exposure was broadened to obtain a pass.

## Evidence location

Ignored local evidence is under `.reference-work/iteration8-evidence/`: reference stdout/stderr and extracted JSON, source and compiled declaration summaries, production build/failure transcript, test discovery, site build/review, SVG structural comparison and before/after Chromium screenshots. These files are local evidence, not committed plan-completion artifacts.

## Handoff and Recommendations for Next Iteration

- Iterations 9–12 can continue using the existing validation/linking inputs on the declared layout. Presentation uses the definitive model; the removed legacy paths must not be restored.
- Iteration 13 activates the remaining analysis/CLI package entries and final declarations. Iterations 14–15 establish the production-selection matrix instances, complete source checks and self-check/relocation evidence.
- The iteration-7 handoff's TypeScript-provider concerns about incompatible resource descriptions and namespace completeness were outside this migration and are not claimed fixed.
- Keep the independent stage-specific parser/acquisition/catalog harness tests on their reviewed public provider operations; full application checking should continue through the analysis entry as its remaining stages arrive.
- No new source-access capability, daemon, server, persistent cache, worker pool or configuration language was implemented. Full regression and acceptance remain workflow-owned.
