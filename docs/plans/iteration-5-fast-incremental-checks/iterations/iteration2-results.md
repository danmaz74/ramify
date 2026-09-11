<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 2 results: Engine changes and the `--plan 5` harness

**Date:** 2026-09-11. **Outcome:** complete. The hoisted access interpreter, the lazy spelling-filtered namespace index and the indexed model lookups are implemented; every recorded batch report is equal except `runId`; the `--plan 5` gate is registered with all 103 instances and `npm run reference:verify -- --plan 5 --iteration 2` passes with its ten instances executed and 93 reported `not-executed`. T3 is active with its real export and `collectAccesses` is private. **Plan 1's gate now passes on this build with 308 of 308 instances**, which closes the one exit criterion the previous attempt left unverified. Both project checks pass.

## Scope and execution

Work was performed only in `/tmp/worktrees/ramify-67e9dd0f/iteration-5-fast-incremental-checks` on `workflow/iteration-5-fast-incremental-checks` from `e0be049`. No model document, plan artifact, daemon source or CLI source changed.

The engine and harness changes were implemented in an earlier attempt of this iteration whose session ended before the Plan 1 gate finished. This recovery turn changed no source: it re-reviewed the delivered code against the reviewed contracts and re-ran the verification from the final bytes, including the outstanding Plan 1 gate as a blocking foreground run. The earlier attempt reported the Plan 1 gate as not completed because it looked for the report under `examples/collection-review/.reference-work/reports`; `persistGateReport` writes every plan's report to `.reference-work/reports` regardless of work root, so that conclusion was a directory mistake rather than a real gap. This turn's run establishes the result first-hand and independently of that earlier artifact.

## Implemented behavior

### typescript owner

- `src/access-interpreter.ts` exports `createAccessInterpreter(inputs: SourceAnalysisInputs): Promise<AccessInterpreter>`, the plain-data factory contracts.md fixes. It owns a finite compiler lifetime through the existing `CompilerBridge`, prepares the interpreter setup once in the helper, and exposes `interpret(files, signal?)`, `replaceDescriptions(descriptions, removed)` and `dispose()`. The caller's input view stays caller-owned, and any startup failure disposes the bridge.
- `src/accesses.ts` now holds the private `AccessInterpretation` class: the catalog file map, original map, sorted inventory, resolved-area map, runtime export-path flags and per-file coverage indexes are built once in the constructor and maintained by `replaceDescriptions`, which replaces only the named files' descriptions, originals and coverage notes and rejects an original whose defining file differs from the description's file. `interpret(paths)` runs the unchanged interpretation rules over the selected inventory files only and returns the accesses, coverage notes and per-file resolution candidates. `collectAccesses` is no longer exported; the helper's whole-project `accesses` operation is a private closure over `interpret(ordered)`.
- The two per-access lookups that previously scanned whole-project arrays now use those indexes: `compiler-blocked` coverage is selected from the accessed file's own coverage list, and `found.issueIds` resolve through a coverage-by-id map. Both relevant locations of a selection lie in the file being visited, so the per-file index selects exactly the issues the whole-project filter selected.
- `src/namespace-uses.ts` builds the identifier index by spelling on first use and resolves one spelling through the array overload of `getSymbolAtLocation`; shorthand-property and export-specifier readings and the `reference === name` skip are unchanged. A file with no namespace-bearing binding issues no identifier symbol query and performs no traversal at all. Lexical identity still comes from compiler symbols, so a local declaration that shadows a namespace import resolves to a different symbol and is not a member selection.
- `src/resolution.ts` reports every probed candidate path through an optional `onCandidate` callback; existence results are unchanged.
- `src/bridge.ts`, `src/compiler-helper.ts` and `src/wire.ts` add the `interpreter` and `interpret` operations and the `interpret-inputs` request that carries the file subset and queued description replacements into the supervised helper; subset calls do not re-materialize the captured input list. Any failure still disposes the bridge, so no partial or stale result can pass as success.
- `src/interfaces/source.ts` gains `AccessInterpreter` inside the T2 wildcard. `module.ramify` activates T3: `expose-src createAccessInterpreter from "access-interpreter.ts" to parent`.
- `README.md` describes the interpreter and the lazy namespace index.

### model owner

- `src/decisions.ts` indexes modules, originals and exposures per model in a `WeakMap`, retained only for models whose object and three arrays are frozen (every `buildModel` result). `src/model.ts` indexes `canonicalOrigin`'s owner lookup on frozen module arrays and freezes the validated module list; exposure grouping is one pass instead of a filter per module. Every exposure reaching the grouping pass has already been validated against the module map, so the grouped lookup cannot miss a module. No rule, public name, decision, order or diagnostic identity changed.

### Harness

- `plan5-instances.ts` transcribes all 103 leaves of subcases.md. `plan.ts` gains `readReviewedPlan5`, validating the transcription against the fourteen matrix groups, the thirteen sequence rows with titles and prerequisites, the per-iteration membership table and counts (10/7/8/7/10/11/8/13/9/5/9/6), the fixture codes `R`, `T`, `F`, `S100`, `S500`, `S1000`, `Q`, `M`, `W`, `A`, `P`, `H` and the evidence kinds `api`, `unit`, `session`, `quick`, `ipc`, `process`, `measurement`. `verify.ts` accepts `--plan 5` with `--iteration 1` to `13`; the Plan 5 work root is the toolkit's gitignored `.reference-work/`.
- `instances.ts` registers the capabilities `engine`, `compiler`, `observer`, `hosting`, `supersession`, `hook-cli`, `live-equivalence` and `fast-measure` beside the existing `catalog`, `session`, `contexts`, `harness-gate` and `completion`; `plan5-runtime.ts` makes only `engine` and `harness-gate` available. `runner.ts`, `artifact.ts` and `mutation.ts` accept plan 5 reports, pending-work summaries and `I5-` instance directories.
- `plan5-engine-cases.ts` implements the six I5-01 handlers. `namespace-lazy-equal` and `decide-indexed-equal` run `analyzeProject` twice per fixture in separate processes over the same fixture copy: `plan5-baseline-loader.mjs` replays the nine engine source files of the pinned commit `e0be049` (`PLAN5_ENGINE=baseline`) or of the working tree (`PLAN5_ENGINE=worktree`) over the built entry through a module load hook, so neither side depends on the staleness of `dist/`. The reports must be equal except `runId`; the toolkit fixture is a `git archive` of the pinned commit, preserving the 229-file, 2,744-access baseline. `plan5-engine-fixture.ts` instruments the owner's synchronous `AccessInterpretation` inside a real compiler snapshot for `zero-queries-without-namespaces` and `hoisted-setup-bounded` (S1000 materialized through `scripts/measurements/materialize.ts`). `plan5-gate-cases.ts` implements the four I5-02 `H` controls after Plan 2's I2-28 analogue, covering sabotage in both full and filtered modes plus the `missing-capability`, `missing-handler` and `unrun-assertion` faults. No Plan 5 handler starts a daemon.
- `plan5.test.ts` covers the inventory transcription, argument parsing, prerequisite closure, the H controls with an unavailable engine and seven reviewed-document drift rejections.

### Documentation

`scripts/reference-harness/README.md` gains a Plan 5 section; `docs/development/testing.md` gains the `--plan 5` row.

## Matrix rows executed

| Instance | Evidence | Result |
| --- | --- | --- |
| I5-01:namespace-lazy-equal | api, R and T | Reports equal except `runId`; R: 15 owners, 294 accesses, 2 warnings, complete coverage, no finding; T: 11 owners, 229 source files, 2,744 accesses, no finding. |
| I5-01:namespace-shadowing | api, F | One `direct-member` selection of `value` from the outer read at line 3; the shadowed read yields no access; no coverage note. |
| I5-01:zero-queries-without-namespaces | api, F | Zero identifier symbol queries for `probe.ts`; its named access equals the whole pass. |
| I5-01:only-subset-equal | api, T | A three-file subset equals the whole pass entry for entry in accesses, coverage and candidates. |
| I5-01:hoisted-setup-bounded | api, S1000 | Setup maps built once (catalog 2 passes, originals 1, inventory 2); twenty one-file calls add no traversal and return equal results. |
| I5-01:decide-indexed-equal | api, R and T | Decisions, order and diagnostic identities equal the pinned pre-change engine's. |
| I5-02:required-membership, removed-record-fails, failing-assertion-fails, iteration-filter | unit, H | 103 registered, sabotage fails both commands and keeps the failure, `--iteration 4` requires 18 instances of iterations 2 and 4, `--iteration 9` requires 74 of 2 to 9. |

Unit evidence beside the gate: `access-interpreter.test.ts` (whole-pass equality, subsets, candidates by file, replacement, disposal, cancellation, no captured-input re-materialization), the three added `accesses.test.ts` cases (shadowing, zero queries, retained shorthand and export-specifier readings) and the `decision-lookups.test.ts` case comparing twenty passes against `recorded-decisions.ts`, recorded with the pre-change engine.

## Verification

All rows ran in this worktree on the final bytes.

| Command | Result |
| --- | --- |
| `npm run type-check` | Pass (all four compiler scopes). |
| `npx vitest run` over `access-interpreter.test.ts`, `accesses.test.ts`, `catalog.test.ts`, `decision-lookups.test.ts`, `descriptions.test.ts` | 5 files, 76 tests pass. |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts` over `plan5.test.ts`, `verify.test.ts`, `instances.test.ts` | 3 files, 30 tests pass. |
| `npm run reference:verify -- --plan 5 --iteration 2` | **Passes.** Required 10, passed 10, failed 0, not executed 93; required iterations 1 and 2; available capabilities `engine` and `harness-gate`; no inventory issue. Report `.reference-work/reports/plan5-iteration2-1c1a3dee-1a85-4b90-88bf-9379c7667133.json`. |
| `npm run reference:verify -- --plan 1` | **Passes.** Required 308, passed 308, failed 0, not executed 0; `planComplete: true`; no inventory issue. Report `.reference-work/reports/plan1-full-e07976c9-8183-4803-9336-98d59e8a6571.json`, recorded against source `dc45b381…` and build `89c59939…` on Node v22.23.2 with typescript 7.0.2. The run's own before/after identity comparison passed, so no source or build byte changed under it. |
| `npm run check:reference` under an owned `RAMIFY_ENDPOINT_DIR` | 15 owners, 54 source files, 294 accesses, 2 `outside-module-source` warnings, 0 errors, complete coverage; every requested capability executed. |
| `npm run check:self` under an owned `RAMIFY_ENDPOINT_DIR` | 11 owners, 232 source files, 2,774 accesses, no finding; every requested capability executed. The checked-out toolkit includes this iteration's new files, so it exceeds the pinned 229/2,744 harness fixture baseline. |
| `node dist/src/cli-entry.js daemon stop`, `git diff --check` | Daemon stopped after each resident command; diff clean. |
| `npm test` | Not run by hand, per the project's check policy; the workflow's automatic regression check covers it. |

Each resident command and each gate ran under its own `RAMIFY_ENDPOINT_DIR` and stopped its daemon afterwards.

## Issues encountered

- The previous attempt's subagent review found that both comparison sides of the equality instances originally ran from `dist/`, so a stale build could have made them pass vacuously; that was fixed by the symmetric loader pin before this turn. It also found the shallow frozen-model check and the inconsistent file key in `replaceDescriptions`; both were fixed.
- The previous attempt recorded the Plan 1 gate as unfinished. Its run had in fact completed; the report was written to `.reference-work/reports`, not the example's work root. This turn re-ran the gate from scratch rather than relying on that artifact.
- `iterations/iteration2.md` still says the toolkit has 2,746 accesses; iteration 1 corrected the measured baseline to 2,744 in subcases.md, which the harness uses.
- `iteration1-check-results.md` and `status.md` are modified in the working tree by the control plane; they were not touched by this iteration.

## Files

- New: `subs/analysis/subs/typescript/src/access-interpreter.ts`, `src/tests/access-interpreter.test.ts`; `subs/analysis/subs/model/src/tests/recorded-decisions.ts`; `scripts/reference-harness/plan5-instances.ts`, `plan5-runtime.ts`, `plan5-engine-cases.ts`, `plan5-engine-fixture.ts`, `plan5-gate-cases.ts`, `plan5-baseline-loader.mjs`, `plan5-report-worker.mjs`, `plan5.test.ts`.
- Changed: `subs/analysis/subs/typescript/{module.ramify,README.md}`, `src/{accesses,namespace-uses,resolution,bridge,compiler-helper,wire}.ts`, `src/interfaces/source.ts`, `src/tests/accesses.test.ts`; `subs/analysis/subs/model/src/{decisions,model}.ts`, `src/tests/decision-lookups.test.ts`; `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` (toolkit declaration expectation gains T3); `scripts/reference-harness/{plan,verify,runner,instances,artifact,mutation}.ts`, `README.md`; `docs/development/testing.md`.

## Recommendations for Next Iteration

- Iteration 5's retained adapter must refresh the runtime export-path flags that `AccessInterpretation` snapshots at construction whenever the compiler snapshot changes; they are correct within one snapshot only.
- Iteration 6 should not pass a created file to `interpret` before the adapter has extended the interpreter's inventory: an unknown path is an `unavailable` failure that ends the compiler lifetime by design.
- Iteration 3 can build `describeFiles` on `Resolution.onCandidate` for `dependencies.absent`.
- A plan revision should correct the 2,746-access figure in `iterations/iteration2.md` to the measured 2,744 baseline that iteration 1 recorded.
