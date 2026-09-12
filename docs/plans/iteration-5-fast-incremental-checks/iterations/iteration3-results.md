<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 3 results: Per-file export descriptions

**Date:** 2026-09-12. **Outcome:** complete. `typescript` now describes each owned file separately, records what every description read, and recomputes only the descriptions a change can reach; `buildCatalog` is the assembly of every file's description, so batch results come from the same code the session will use. `npm run reference:verify -- --plan 5 --iteration 3` passes with 17 required instances executed, including all seven I5-03 rows; Plan 1's 308-instance gate passes on the same build; `check:reference` and `check:self` are unchanged.

## Scope and execution

All work was performed in `/tmp/worktrees/ramify-67e9dd0f/iteration-5-fast-incremental-checks-iter-3` on `workflow-iter/iteration-5-fast-incremental-checks/3` from `628892a`. Only the `typescript` owner, its tests, the reference harness and two READMEs changed. No model document, plan artifact, daemon, CLI, contexts or analysis source changed. `npm run worktree:prepare` was run first, because the reference example's dependencies are needed by the resource and reference instances.

## Implemented behavior

### Per-file descriptions and their assembly

- `subs/analysis/subs/typescript/src/descriptions.ts` exports `describeFiles(inputs, files)` and `assembleCatalog(descriptions)` behind T4, plus the owner-private `createDescriptionSet()`. `describeFiles` owns a finite compiler lifetime through `CompilerBridge` and disposes it before returning, as `createAccessInterpreter` does; the caller's input view stays caller-owned. `assembleCatalog` is plain data only: it keeps the originals the validated export selections retain, orders files, originals and coverage exactly as the whole build did, and holds no compiler state.
- `interfaces/source.ts` gains `DescriptionDependencies`, `FileDescription` and `CatalogDelta` inside the T2 wildcard, and `AccessInterpreter.replaceDescriptions` now names `FileDescription` instead of iteration 2's structural placeholder.
- `catalog.ts` keeps its public shape. `buildCatalog(project, inputs, host, runtime)` is now `assembleCatalog` over a round that selects every owned file, and the batch helper calls it unchanged. The owner-private `describeRound(project, inputs, host, runtime, selected, retained)` is the compiler-bearing description function; no `Project`, `CatalogHost` or runtime map crosses the T4 exposure.
- `createDescriptionSet()` retains plain records only. Every call supplies the current project, inventory, host and runtime map, so a later state is described over a fresh snapshot with nothing but the descriptions carried across — the shape iteration 5's retained adapter needs.

### The recomputation round

A round starts with the named files, the created files, the files that depend on a deleted path or on a created path matching an absent probe, and the files whose shims or content contributors were named as changed. Each selected file is described afresh, together with everything its extraction reaches (namespace targets and resources are read again by construction). After each round, every file whose own description depends on one that changed by value joins the selection and the round repeats; the loop is bounded by the owned file count and reports `resource-limit` rather than looping. Files outside the selection keep their descriptions **by object identity**, which `I5-03:star-growth-reach` asserts directly.

A file the round did not read acts as a resolved leaf in today's star, selection and incompleteness fixed point: its retained entry supplies the original, the namespace module it forwards, its runtime export-path flag and the ambiguity its own *extraction* established (recorded separately from the final state, because the whole build reads the extraction-time state when it builds its definitions). Nothing may report a coverage note against a leaf; that is an explicit failure, not a silent drop. A propagation target that is neither described nor retained is an explicit failure as well.

`CatalogDelta` reports `recomputed`, `changed`, `moved`, `changedOriginals` and `removedOriginals`. `changed` and `moved` are separated by a position-free comparison: declaration positions, note locations and the position embedded in every note identity are removed before the two descriptions are compared, so a file whose declarations only moved — including one carrying coverage notes — is `moved` and never `changed`.

### Recorded dependencies

| Dependency | Edge |
| --- | --- |
| Named, star and namespace forwarding targets | `dependencies.files`, recorded when extraction resolves the specifier |
| A namespace description embedded from another module, including through a retained leaf | `dependencies.files` |
| Resources described or forwarded, and the specifiers that reach them | `dependencies.resources` on the importer, the importers on the resource |
| The declaration files that described those resources | `dependencies.shims`, root-relative or `external:` |
| Paths resolution probed and did not find | `dependencies.absent`, conservatively including probed candidates whose existence resolution never established |

Two edges cannot be expressed as a dependency on another description, because the file at the other end says nothing about them in its own exports: a shim's content, and the content of a file that augments another owned module with `declare module './x.js'`. Both are followed by content identity: the record keeps the private `contributors` and `contributions` lists, and a round re-reads a description when one of its contributors was named as changed, when a round rewrote a contributor that no longer contributes, or when a described file contributes to a description it did not contribute to before. A resource reached only through a forwarding file is selected for one further round, so its description is the union of what *every* importing specifier reaches, exactly as the whole build computes it.

### Service and declarations

`wire.ts`, `bridge.ts` and `compiler-helper.ts` gain the `describe` operation and its `describe-inputs` request, mirroring iteration 2's `interpret`; no transport, framing or limit changed. `resolution.ts` reports existence alongside each probed candidate so a description can record what it found absent. `module.ramify` activates T4 with the two reviewed names; the `descriptions` owner's declaration expectation and both READMEs record it.

## Reviewed-contract interpretations

- **`describeFiles` signature.** [contracts.md](../contracts.md#typescript-descriptions-the-interpreter-and-the-retained-adapter) fixes `describeFiles(inputs: SourceAnalysisInputs, files)` and states that compiler-bearing description functions stay private to `typescript`; [iteration3.md](iteration3.md) sketches `describeFiles(project, inputs, host, files)`. The reviewed contract was implemented, and the compiler-bearing form is the private `describeRound`.
- **Where the assembly lives.** `assembleCatalog` is defined beside the extraction it mirrors in `catalog.ts` and re-exported by `descriptions.ts`, which is what T4 names. Defining it in `descriptions.ts` would make `buildCatalog`'s module import the module that imports the builder.
- **A cold set describes the whole project.** A file with no retained description has no description at all, so `describeFiles` over a fresh set describes every owned file whatever it names. Incremental calls are only meaningful against a complete previous set; iteration 5's adapter opens cold with every owned file.
- **The specifier scan records resources only.** The whole-project scan that finds resource descriptions is not a description edge: a plain import is not a re-export. Its resolutions record resources and contributors, not `files` or `absent`, which is what keeps `star-growth-reach` down to two files.

## Matrix rows executed

| Instance | Evidence | Result |
| --- | --- | --- |
| I5-03:assembled-equals-whole | api, A/R + A/T + A/S100 | `assembleCatalog(describeFiles(inputs, every owned file))` equals `createSourceAnalysis().catalog()` by value on all three, with one description per owned file. Independent counts asserted first: R 15 owners/54 source files, T 11/229, S100 100/1100. |
| I5-03:star-growth-reach | api, A/F | Adding `extra` to the star target recomputes exactly `interfaces/api.ts` and `interfaces/index.ts`; `index.ts` gains `extra`; every other description is the same object as before; the assembled catalog equals a whole recompute. |
| I5-03:forwarding-chain-reach | api, A/F | Renaming the forwarded export recomputes exactly `mid.ts` and `top.ts`; `api.ts` keeps its recorded description object; `top.ts` reports `renamed` with the provider original. |
| I5-03:namespace-forwarding-reach | api, A/F | Adding an export recomputes exactly `api.ts` and `hub.ts`; the namespace description gains the member; `hub.ts` records `api.ts` as its dependency. |
| I5-03:resource-shim-reach | api, A/R | With `*.module.css` moved from Vite's declaration to `subs/workspace/src/resources.d.ts`, both CSS-module resources record that shim; changing its default binding recomputes and changes both, they follow the new shim's `default` and `styles`, and no recomputed file describes no resource. |
| I5-03:ambiguity-propagation | api, A/F | Two star re-exporters carrying `clash` leave the index `ambiguous` with a null original and one `ambiguous-original` note; removing one recomputes the index alone, settles it to `complete` selecting `interfaces/left.ts` with no note, and the assembled catalog equals a whole recompute in both states. |
| I5-03:closure-superset | api, A/R + A/T + A/S100 | Thirty cumulative single-file edits on each fixture, alternating an added export and an appended comment. After every edit, every description that changed by value in a whole recompute of the same snapshot lies inside the recomputed set, and the retained descriptions assemble a catalog byte-equal to that whole recompute. |

Each incremental comparison describes the incremental set and the whole set over **one** compiler snapshot of the same disk state, so neither side can be stale relative to the other; each state opens its own snapshot from a fresh compiler API.

## Verification

Every row ran in this worktree on the final bytes.

| Command | Result |
| --- | --- |
| `npm run build`, `npm run type-check` | Pass (all four compiler scopes). |
| `npx vitest run` over the `typescript` owner's tests and `descriptions`' declaration test | 13 files, 159 tests pass, including the new `descriptions.test.ts` (10 cases) and the assembly cases added to `catalog.test.ts` and `resources.test.ts`; `cyclic-stars`, `coverage`, `resource-bindings` and `resource-suffixes` are unchanged and pass. |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts` over `plan5.test.ts`, `verify.test.ts`, `instances.test.ts` | 3 files, 30 tests pass. |
| `npm run reference:verify -- --plan 5 --iteration 3` | **Passes.** Required 17, passed 17, failed 0, not executed 86; required iterations 1, 2, 3; available capabilities `catalog`, `engine`, `harness-gate`; no inventory issue. Report `.reference-work/reports/plan5-iteration3-2e4282f1-5e9d-494b-85f4-9bd015d584ba.json`. |
| `npm run reference:verify -- --plan 1` | **Passes.** Required 308, passed 308, failed 0, not executed 0; `planComplete: true`. Report `.reference-work/reports/plan1-full-c8b21a8c-940c-47f2-bc8b-76aa3b8de4cf.json`. The run's own before/after identity comparison passed, so no source or build byte changed under it. |
| `npm run check:reference` under an owned `RAMIFY_ENDPOINT_DIR` | 15 owners, 54 source files, 5 resources, 294 accesses, 2 `outside-module-source` warnings, 0 errors, complete coverage. |
| `npm run check:self` under an owned `RAMIFY_ENDPOINT_DIR` | 11 owners, 234 source files, 7 resources, 2,829 accesses, no finding, complete coverage. The two new owner files account for the growth over iteration 2's 232 files. |
| `node dist/src/cli-entry.js daemon stop`, `git diff --check` | Daemon stopped after each resident command; diff clean. |
| `npm test` | Not run by hand, per the project's check policy; the workflow's automatic regression check covers it. |

## Issues encountered

- An adversarial review of the first implementation reproduced three real defects, each fixed with a regression test in `descriptions.test.ts`:
  1. **A namespace embedded from another module was not a recorded dependency.** A chain `leaf.ts → holder.ts → relay.ts → top.ts` forwarding one namespace left `relay.ts` and `top.ts` retained after `leaf.ts` was deleted, and the propagation loop then read a description that no longer existed. Every module whose namespace a description embeds — including one supplied by a retained leaf — is now one of its `dependencies.files`, and an unknown propagation target is an explicit failure rather than a crash.
  2. **A module augmentation of another owned file had no edge at all.** `declare module './merged.js' { … }` contributes exports to `merged.ts` while changing nothing in the augmenting file's own description, so editing the augmentation left a stale description and an assembled catalog that differed from the whole build. Augmentation targets are now content contributors, followed by content identity like shims.
  3. **`moved` was unreachable for any file carrying a coverage note**, because a note identity embeds its position and the identities are listed in the file's export entry. The position-free comparison now normalises note identities.
- The same review confirmed that the whole-build path is unchanged in ordering, in the originals retain-filter and in the witness position; the earlier `I5-01` batch-equality instances and Plan 1's gate establish that independently.
- Two gate runs were aborted by the harness with `Source or compiled build changed during verification` because source was edited while they ran. Both were re-run to completion on the final bytes; the results above are from those runs.
- The reference example's dependencies are not present in a fresh Studio worktree, so the R instances need `npm run worktree:prepare` first, as the worktree guide records.

## Known limitations

- `removedOriginals` compares the originals each description defines. An original that stops being *referenced* by any export is dropped by the assembly's retain filter without appearing in that list; iteration 6 should not treat `removedOriginals` as the catalog-level removal set.
- A coverage note located in a file other than the one that reported it is handled in one direction: a new such note selects the file it is located in, while its removal by a re-read reporter would not. Every note of this shape observed in the reference, toolkit and synthetic fixtures is located in a file the same round describes, so no case is reachable today; iteration 6's audit is the detector if one appears.
- The specifier scan records no absent probes, so a newly created owned resource at a previously probed path relies on the created-file selection. Created files take the broad path in this plan, as [scope.md](../scope.md#paths-of-an-update) fixes.
- `describeRound`'s export and coverage budgets now bound one round rather than the whole project; a session applying many rounds accumulates no shared counter.

## Files

- New: `subs/analysis/subs/typescript/src/descriptions.ts`, `src/tests/descriptions.test.ts`; `scripts/reference-harness/plan5-catalog-cases.ts`, `plan5-catalog-fixture.ts`.
- Changed: `subs/analysis/subs/typescript/{module.ramify,README.md}`, `src/{catalog,bridge,compiler-helper,resolution,wire}.ts`, `src/interfaces/source.ts`, `src/tests/{fixtures,catalog,resources,access-interpreter}.test.ts`; `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`; `scripts/reference-harness/{plan5-runtime,plan5-engine-cases,plan5.test}.ts`, `README.md`.

## Recommendations for Next Iteration

- Iteration 5's retained adapter should hold one `createDescriptionSet()` and pass the current project and host to every `describe`; the set retains no compiler handle, but the caller's `runtime` export-path map is keyed by export objects and must be replaced or pruned with the descriptions, since retained entries survive an update.
- The adapter must also open cold with every owned file: an incremental round is only defined against a complete previous set.
- Iteration 6 should drive re-interpretation from `CatalogDelta.changed` and `CatalogDelta.moved` and treat `changed` as including a changed dependency record, which is exactly the import-list change that has to re-interpret a file.
- The per-round budgets and the private `contributors`/`contributions` lists are the two pieces of `FileRecord` that iteration 5 will carry across snapshots; they are plain strings and need no compiler state.
- A plan revision should still correct the 2,746-access figure in `iterations/iteration2.md` to the measured 2,744 baseline that iteration 1 recorded.
