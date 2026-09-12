<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 5 results: Retained compiler adapter and observed reads

**Date:** 2026-09-12. **Outcome:** complete. `typescript` now keeps one warm TypeScript 7.0.2 server with exactly one live snapshot behind the plain `createRetainedSourceAnalysis` adapter: `update` names changed, created and deleted files and regenerates the synthetic configuration and resource witness from the inventory it carries, `describe` reads the named files over iteration 3's retained descriptions, `catalog` assembles them, `interpreter` is iteration 2's maintained interpreter following the current snapshot, every filesystem callback reports to project's `ObservationSink`, `releaseCompiler` closes the server while keeping the facts, and a lost server rejects the next call with `read-failure`. T5 is active with its real export and the three contract types joined the T2 wildcard. `npm run reference:verify -- --plan 5 --iteration 5` passes with all 32 required instances of iterations 2 to 5 executed, including every I5-04 row on A/R and A/S100; both project checks pass.

## Scope and execution

Work was performed only in `/tmp/worktrees/ramify-67e9dd0f/iteration-5-fast-incremental-checks` on `workflow/iteration-5-fast-incremental-checks`. Only the `typescript` owner, its tests, one toolkit declaration expectation in `descriptions`' tests and the reference harness changed. No model document, plan artifact, project, analysis, daemon, CLI or root source changed. The agent session that implemented the work ended while the gate and `check:self` were still running in the background; this recovery turn re-ran the gate to completion, corrected three defects in the new harness handlers that the run exposed, and re-ran `check:self`, so every result below is from a completed run on the final bytes.

## Implemented behavior

### The retained adapter

- `src/retained-source-analysis.ts` exports `createRetainedSourceAnalysis(inputs)` behind T5 and the owner-private evidence export `retainedCompilerEvidence(adapter)`. The adapter runs in the caller's thread and creates the synchronous API client itself with filesystem callbacks that read the disk directly. It validates the work limits and the lifetime signal exactly as the other factories do, opens cold through its own first `update`, and disposes everything it opened when the cold open fails.
- `update(changes)` resolves the named paths against the root, regenerates the virtual configuration and witness when `changes.inventory` is non-null, and passes the changed virtual paths along with the named files to one `updateSnapshot` call; `invalidateAll` re-parses the configuration first so the explicit roots follow a changed selection. The previous snapshot is disposed inside the call before it returns; the API's own live-snapshot registry reads two during replacement and one afterwards. An update naming nothing and carrying no inventory makes no snapshot. Each update returns a monotonic sequence and its elapsed time.
- `describe(files)` reads the named files over one `createDescriptionSet()` retained across snapshots, with the same runtime export-path map passed to every round and pruned afterwards to the export objects a current description reaches, so retained entries survive an update and replaced ones do not accumulate. After a cold open, a reopen or `invalidateAll` the next `describe` reads every owned file whatever the call names. Descriptions and the delta are returned frozen, as is the assembled `catalog()`. A file removed from the inventory is dropped from the interpreter when the next description lands.
- `interpreter()` builds one `AccessInterpretation` lazily from the current catalog and returns a frozen port over it. The adapter itself refreshes that interpretation's snapshot, inventory, ordering and areas on every update and replaces the descriptions it recomputed after every `describe`; a caller's `replaceDescriptions` still works. Reading a catalog or an interpreter before the update has been described is an explicit `unavailable` failure, never a stale fact.
- `releaseCompiler()` disposes the interpreter and snapshot and closes the server; `hot` becomes false, `catalog()` still answers from the retained descriptions, `describe` and `interpreter` are `unavailable`, and the next `update` reopens the server, re-reads the disk through the same reporting callbacks and marks the next `describe` broad. `dispose()` releases everything and stays disposed.
- Server loss is detected two ways: the child's `exit` event discards the compiler and arms a `read-failure` for the next call, and any request that fails against a channel that is already gone is converted to the same `read-failure` and discards the compiler, so a call racing the loss fails instead of answering. A failure raised by one of the adapter's own callbacks keeps its own code and also discards the compiler, because the channel treats a failed callback as unrecoverable. A later `update` rebuilds with broad semantics.

### Observed reads

Every callback reports the shape the batch capture records for the same operation. A byte read reports `file` with the SHA-256, the byte count and the role the inventory gives the path (`source`, `resource`, `configuration` or `dependency`); a missing path reports `absent`, a dangling link a probe; existence and realpath lookups report `probe` on the path and, through a symbolic link, on its canonical target as the capture's target lookup observes; an enumeration reports `directory` with its members' full paths and then probes each member as the finite helper's per-entry existence checks do; the synthetic-name occupancy check enumerates the configuration directory. The virtual files are never reported. I5-04 `observed-reads-complete` establishes that an observer merging these reports with its acquisition carries the batch capture's inputs and identity on R (3,615 inputs) and S100 (2,366 inputs), cold and after one edit.

### Shared synthetic inputs

`src/synthetic.ts` holds `referencesOnly`, `syntheticCandidate` and `syntheticInputs`, moved out of `compiler-helper.ts` so the finite helper and the retained adapter regenerate byte-identical virtual configuration and witness texts. The helper's protocol, `derived` accounting, ordering and every byte it sends are unchanged; I5-01's batch-equality instances and Plan 1's gate run against the refactored helper.

### Retargetable interpretation

`Resolution` gains `retarget(project, inventory)`; `AccessInterpretation` gains `refresh(project, inputs)` and a `live` mode of `replaceDescriptions` that skips the detached export-path restoration, because live descriptions share their export objects with the runtime map the interpretation reads. The batch path uses neither.

### Declarations and prose

- `module.ramify` activates T5 with `expose-src createRetainedSourceAnalysis from "retained-source-analysis.ts" to parent`; `interfaces/source.ts` gains `SourceChangeSet`, `RetainedSourceInputs` and `RetainedSourceAnalysis` inside the T2 wildcard. `RetainedSourceInputs.sink` names project's `ObservationSink` through analysis A7, as `resolution.ts` names `ProjectInventory` and `InventoryFile`; this owner defines no observation type.
- The typescript README's first paragraph is owners.md's revised text and a new paragraph describes the adapter. The `descriptions` toolkit-declaration expectation gains the T5 line. The harness README records the `compiler` capability and the 32-instance iteration 5 gate.

## Matrix rows executed

| Instance | Evidence | Result |
| --- | --- | --- |
| I5-04:single-live-snapshot | api, A/R | Twenty body edits of `inspect` through the observer and `update`: the API registers exactly one live snapshot after each update and two during each replacement, the replaced snapshot is disposed inside every call, sequences run 2 to 21, and the facts after the twentieth edit equal a cold adapter's. |
| I5-04:changed-file-facts-equal | api, A/R | A statement inserted in `inspect`'s body: the file is described afresh, its description equals a cold adapter's field by field including the moved declaration positions, its access facts equal the cold adapter's for that file, and the whole catalog is equal. |
| I5-04:created-deleted-configuration | api, A/R | `subs/workspace/subs/catalog/src/extra.ts` importing the vocabulary: the observer's local update names it, the regenerated synthetic configuration names its absolute path, the program contains it, and the catalog equals a cold adapter's; after deletion the configuration and program drop it, its original is in `removedOriginals`, and the catalog equals a cold adapter's again. |
| I5-04:invalidate-all | api, A/R with a private `zod` | An appended declaration in `node_modules/zod/index.d.cts`, which the compiler reads through the package's `types` entry, is an observed local update; after `invalidateAll` all 59 owned files are described afresh and the catalog equals `buildCatalog` through the finite helper over the same state. |
| I5-04:observed-reads-complete | api, A/R and A/S100 | Cold: the merged observer set equals the sealed batch capture by path, role, identity and bytes with nothing observed by only one side, the identities are equal, and the cold catalog and accesses equal the finite helper's. The compiler's own byte reads cover none of the description or README inputs and fewer inputs than the merged set, while owned roles come from the acquisition. After one body edit and update, the merged set and identity equal a fresh batch capture of the edited state, and the two identities differ. |
| I5-04:server-loss-explicit | api, A/R | `SIGKILL` on the server between two updates: the next `update` rejects with a `SourceAnalysisError` of code `read-failure`, `hot` is false, `describe` and `interpreter` return no fact (`unavailable`), a later update rebuilds with a new process, and the rebuilt facts equal a cold adapter's over the edited state. |
| I5-04:release-and-rebuild | api, A/R | `hot` is true before and false after `releaseCompiler`, the server process is gone and no snapshot is live, the retained catalog survives, and after one body edit `update` reopens (`hot` true, live process), the next `describe` reads all 59 files, and the facts equal a cold adapter's. |

Unit evidence beside the gate: `src/tests/retained-source-analysis.test.ts` (12 cases: cold equality with the finite helper and a cold adapter, one live snapshot across twenty edits, declaration moves with positions, created and deleted files through the regenerated configuration, `invalidateAll` against the whole build, the reported reads, probes, listing and roles, server loss then rebuild, a call racing the loss, release and rebuild, disposal, lifetime cancellation and limit validation, solution-style configuration) and the new case in `src/tests/retention.test.ts` (frozen plain descriptions, catalog and accesses, no server or snapshot after disposal).

## Verification

| Command | Result |
| --- | --- |
| `npm run build && npm run type-check` | Pass (all four compiler scopes). |
| `npx vitest run subs/analysis/subs/typescript/src/tests/` | 13 files, 145 tests pass, including `retained-source-analysis.test.ts`, `compiler-paths.test.ts`, `lifetime.test.ts` and `retention.test.ts`. |
| `npx vitest run subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` | 27 tests pass with the T5 declaration expectation. |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan5.test.ts` | 10 tests pass: five capabilities, 32 handlers. |
| `npm run reference:verify -- --plan 5 --iteration 5` | **Passes.** Required 32, passed 32, failed 0, not executed 71; required iterations 1 to 5; available capabilities `catalog`, `compiler`, `engine`, `harness-gate`, `observer`. Report `.reference-work/reports/plan5-iteration5-958bb0c1-bb88-4bcd-9c4f-32dedc5246f8.json`. |
| `npm run check:reference` under an owned `RAMIFY_ENDPOINT_DIR` | 15 owners, 54 source files, 294 accesses, 2 warnings, 0 errors, complete coverage; exit 0. |
| `npm run check:self` under an owned `RAMIFY_ENDPOINT_DIR` | 11 owners, 241 source files, 2,995 accesses, no finding, complete coverage. The counts exceed the pinned 229/2,744 baseline because the checkout carries iterations 2 to 5's new files. |
| `node dist/src/cli-entry.js daemon stop`, `git diff --check` | Daemon stopped explicitly after each resident command; diff clean. |
| `npm test` | Not run by hand, per the project's check policy; the workflow's automatic regression check covers it. |

The unfiltered `--plan 5` gate and `--iteration 6` and beyond still fail, as the iteration document expects.

## Issues encountered and decisions taken

- **The session ended mid-verification.** The implementing session's background gate and `check:self` never completed. The recovery turn re-ran the gate three times: the first run exposed that the `invalidate-all` handler edited `zod/index.d.ts` while the compiler resolves the package's `types` entry `index.d.cts`, and that the `observed-reads-complete` handler counted existence probes of descriptions and READMEs, which directory enumeration legitimately performs, as compiler observations; the second exposed a meaningless size comparison on S100 that was replaced by a precise one on byte-read inputs; the third exposed that S100's one-line functions do not match an anchor requiring a newline after the brace. All three were handler defects; no adapter behavior changed after the implementing session.
- **`compiler-helper.ts` was refactored, not left byte-identical.** The deliverable asks that the helper remain the batch path unchanged. Duplicating the configuration inspection and virtual-input generation would have left two copies of the recipe the input identity depends on, so `synthetic.ts` now holds them and the helper calls it. Its protocol and every byte it generates are unchanged; I5-01, I5-03 and the plain project checks establish that.
- **Evidence lives outside the port.** The live-snapshot count, the server process id, the synthetic configuration text and program membership are what I5-04 asserts and nothing on `RetainedSourceAnalysis` can show them. `retainedCompilerEvidence` reads the API's own snapshot registry and child process through their unexported shapes, the way `observedEnumerations` supplies locality evidence for the observer; it is not in `module.ramify` and no toolkit source uses it.
- **`catalog()` and `interpreter()` refuse an undescribed update.** The contract leaves the order of `update`, `describe` and `interpreter` to the session; returning the previous descriptions after an update would be a stale fact, so both throw `unavailable` until `describe` has run. The session must call `describe` after every `update`, including a metadata-free one.
- **A moved declaration reaches its forwarding importers.** Iteration 3's fixed point treats a description that changed only by position as changed for propagation, so a body edit that moves a declaration's end re-describes the files that forward it; the delta still reports them as neither changed nor moved. The unit tests assert that shape rather than a one-file recomputed set; the one-file checked set the budgets name is a property of iteration 6's access facts, not of the description round.
- **Roles reported for reads come from the inventory.** The finite helper reports every read with the default `dependency` role and relies on the capture's precedence; the adapter reports `source`, `resource` or `configuration` where the inventory says so, which the observer's precedence rule leaves equal after promotion and which keeps the pending, unpromoted view of an owned file correct.

## Known limitations

- Per-call deadlines cannot interrupt the synchronous compiler in the caller's thread; `update`, `describe` and `interpret` check their signal before starting and the lifetime signal discards the compiler, but a running request completes. The worker host of iteration 8 is where a deadline becomes enforceable.
- The exit listener and snapshot registry are read through the API's unexported internals; if a compiler release changes those shapes the evidence export reports zero live snapshots and no process id, and loss detection falls back to the failed request alone. The unit and harness instances would show that immediately.
- A `describe` naming a non-owned, non-deleted path is `unavailable`, as iteration 3 fixed; dependency and shim changes take the broad path through `invalidateAll`.
- The adapter re-parses the configuration only on `invalidateAll`; a configuration change delivered without it would keep the old explicit roots. Iteration 7's broad path must pass `invalidateAll` for configuration changes, as scope.md already requires.

## Files

- New: `subs/analysis/subs/typescript/src/retained-source-analysis.ts`, `src/synthetic.ts`, `src/tests/retained-source-analysis.test.ts`; `scripts/reference-harness/plan5-compiler-cases.ts`.
- Changed: `subs/analysis/subs/typescript/{module.ramify,README.md}`, `src/{accesses,compiler-helper,resolution}.ts`, `src/interfaces/source.ts`, `src/tests/retention.test.ts`; `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`; `scripts/reference-harness/{plan5-runtime.ts,plan5.test.ts,README.md}`.

## Recommendations for Next Iteration

- Iteration 6's session should call, in order, `observer.apply(changes)`, `adapter.update({ changed, created, deleted, inventory, invalidateAll })` with the inventory from a `local` or `structural` update and `null` otherwise, `adapter.describe(changed ∪ created)`, then `interpreter().interpret(...)` over the delta's `changed` and `moved` files and their importers; the adapter already replaces the interpreter's descriptions, so the session need not call `replaceDescriptions` itself.
- Promote the sink's reports through `observer.apply` or `reobserve` before publishing a revision; `observer.inputs` includes pending reports for unknown paths, but a report that disagrees with the disk only surfaces at promotion.
- Use `delta.moved` for the position refresh of iteration 7 and treat `removedOriginals` as iteration 3 recorded, not as the catalog-level removal set.
- The one-file checked set for an unchanged-surface edit must be established on access facts; the description round may re-read forwarding importers of a moved declaration, and that is not a defect of the description delta.
- Iteration 8 should measure the cost of the per-callback SHA-256 hashing on S1000's cold open; batch hashes the same bytes, but the retained path pays it again on every reopen after a compiler release.
