<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 4 results: Project observer and incremental acquisition

**Date:** 2026-09-12. **Outcome:** complete. `observeProject` keeps one acquired project observed instead of sealed: it records every input with its role and identity, classifies delivered changes into local, structural, invalid, incomplete and unchanged updates, re-observes its whole recorded set on demand as the sweep, and carries the input identity a batch capture of the same inputs carries. P4 is active with its real export, `ObservationSink` and the five observer types joined the P2 wildcard and analysis A7, and `npm run reference:verify -- --plan 5 --iteration 4` passes with all eighteen required instances of iterations 2 and 4 executed and 85 reported `not-executed`. Both project checks pass and the whole vitest suite is green.

## Scope and execution

Work was performed only in `/tmp/worktrees/ramify-67e9dd0f/iteration-5-fast-incremental-checks-iter-4` on `workflow-iter/iteration-5-fast-incremental-checks/4` from `628892a`. No model document, plan artifact, daemon source, CLI source or root source changed. `npm run worktree:prepare` was run first, as this checkout had no example dependencies.

## Implemented behavior

### project owner

- `src/observer.ts` exports `observeProject(options: ProjectReadOptions): Promise<ProjectObserve>`. It performs Plan 1's acquisition once through the existing capture, configuration, inventory and purpose code, keeps the capture instead of sealing and disposing it, and exposes `inventory`, `inputs`, `inputId`, `sink`, `apply`, `reobserve`, `readDescription`, `readReadme` and `dispose`. Every operation is serialized on one promise chain, and a disposed observer refuses further work.
- `apply(changes)` resolves each delivered path against the root and classifies it. A `module.ramify` at an existing module directory is a description change: the path is re-observed, the bytes re-parsed, and the owner's `description` and `headerTags` replaced in place. A `README.md` beside an existing description is re-read and its purpose recomputed with `readPurpose`, without parsing any description. A path inside an existing owner's `src/` is created, deleted or edited: the file joins or leaves `inventory.files`, its enumerated ancestor directories up to the area root are re-listed, and `src/tests/` presence is recomputed. Any other observed input is re-observed and named in `changed`. When descriptions, creations or deletions moved, `exactReferences` recomputes the inventory's references over the new module and owned-file sets.
- Structural triggers rebuild the whole inventory through the shared acquisition: a new or removed `module.ramify`, a description at a directory that is not an existing module, a renamed owner, a new path beneath any owner's `subs/`, a created entry that is not a regular file or whose exact name does not match its parent listing, an excluded destination, and a change to a configuration-role input or a `tsconfig.json`, `package.json` or `package-lock.json`. The rebuild reuses the retained configuration product, adopts the new capture only on success, disposes the old one, and re-merges every reported observation into the new table.
- A description that no longer parses is an `invalid` update carrying Plan 1's issue spelling, including its `1:1: invalid-encoding` form for a description that is not valid UTF-8. A rebuild that Plan 1 reports invalid passes Plan 1's issues through with the inventory Plan 1 offers. After any invalid update `observer.inventory` remains the last valid inventory. A read failure or resource limit is an `incomplete` update with the acquisition issue. A delivery naming nothing observed and nothing inside an area is `unchanged`.
- A missing exposure target is **not** an invalid update: it is recorded as the reference's `missing` status inside the inventory, from which Plan 1's issue is a pure function. Only a layout error or an unparsable description makes an update invalid. This is what I5-05 `file-deleted-local` independently expects, and it keeps `InventoryUpdate` about the inventory's shape.
- `reobserve()` observes without recording: it stats every captured path, re-hashes the ones whose signature moved, promotes the reports the sink holds, and returns each moved path exactly once as an ordinary `ObservedChange` with an absolute path and a `changed`, `created` or `deleted` kind. The recorded state moves only when the returned changes are fed back through `apply`, so a sweep and the watcher share one update path.
- Private `src/observations.ts` holds the reported side of the observation table (`ReportedObservations`, its `ObservationSink` implementation, and `reportedInput`) and the `inputIdentity` recipe. A report is merged into the acquisition table, never substituted for it: promotion re-observes the path through the capture, and a report whose identity disagrees with the recorded state or with the disk is an observed change.
- `src/read-project.ts` gains a private `acquireProject` that returns the live capture, inventory, configuration product and configuration data; `readProject` is that call plus the sealed view it already returned. Its arguments, statuses, issues and behavior are unchanged. `resolveProjectRoot` is untouched.
- `src/capture.ts` gains `refresh`, `forget`, `recorded`, `digest`, `enumerations` and `changes()`. `refresh` releases one observation with its reserved bytes and repeats exactly the reads that were made of it, reading bytes rather than decoding text, and moves a symlink's resolved target with it. `changes()` is the body `validate()` used to hold, now returning absolute paths with a kind; `validate()` maps it to the labels it always returned.
- `src/inventory.ts` exports `outsideSourceWarnings`, `inventoryFileKind` and `excludedDirectory`, which the observer and `inventoryProject` now share. The grouping and classification rules are unchanged.

### Declarations and prose

- `subs/analysis/subs/project/module.ramify` activates P4 with `expose-src observeProject from "observer.ts" to parent` and gains owners.md's P3 comment; `interfaces/project.ts` gains `ObservationSink`, `InputChangeKind`, `ObservedChange`, `InventoryUpdate`, `ProjectObserver` and `ProjectObserve` inside the P2 wildcard.
- `subs/analysis/module.ramify` extends A7 with the same six names to parent and descendants, so `typescript` receives the sink in iteration 5. Root's R4 relay is untouched, as owners.md schedules it for iteration 9.
- The project README's first paragraph is owners.md's revised text.

## Matrix rows executed

| Instance | Evidence | Result |
| --- | --- | --- |
| I5-05:description-local-update | api, A/R | `remove-hop` on `subs/workspace/module.ramify` is a `local` update naming that description only; exactly one input identity moved; all 59 owned files and all 15 owner identities are unchanged; the parsed description no longer carries `createCatalogRouter`; the enumeration count is identical, so no directory beneath `subs/` was listed again; exactly one description was parsed. |
| I5-05:readme-local-update | api, A/R | Editing the catalog README's first paragraph is a `local` update naming that README only; the owner's purpose is the restated paragraph; its `ParsedDescription` is the same object; the injected parser counted zero further parses. |
| I5-05:file-created-local | api, A/R | `subs/workspace/subs/catalog/src/extra.ts` is a `local` update whose `created` names it; it joins its owner's ordinary area as source; the owned file list is the previous 59 plus it; the observer's identity equals a batch capture of the same state. |
| I5-05:file-deleted-local | api, A/R | Deleting `…/reviews/subs/validation/src/validate.ts` is a `local` update whose `deleted` names it; the inventory no longer lists it, no owner changes, the path leaves the observed inputs, and the owner's exposure records the reference as `missing`. |
| I5-05:module-added-structural | api, A/R | A new `…/catalog/subs/extra/module.ramify` with a README and source is a `structural` update; the rebuilt inventory holds sixteen owners with `collection-review/workspace/catalog/extra` beneath catalog and its source file; the rebuilt identity equals a batch capture. |
| I5-05:stray-description-invalid | api, A/R | A description written into `…/catalog/src/` is an `invalid` update whose issues equal, item for item, what `readProject` reports over the same disk state, including the `description-in-src` layout issue naming it; the previous inventory is not offered as current, and `observer.inventory` is unchanged. |
| I5-05:sweep-detects-unwatched | api, A/R | With a private `zod` copy, the observed declaration is reported through the sink, changed on disk and no change delivered to `apply`: `reobserve()` names that path exactly once with kind `changed` and nothing else; the returned change applies as an ordinary update, after which the sweep reports nothing. |
| I5-05:input-id-equals-batch | api, A/R and A/S100 | On both fixtures the cold identity and the identities after three applied changes each equal a `readProject` capture of the same disk state, computed by a recipe transcribed independently in the handler; all four identities differ from one another. |

Unit evidence beside the gate: `src/tests/observer.test.ts` (14 cases: description, README, created, deleted, created test file and area presence, structural rebuild, stray description, unparsable description, non-UTF-8 description, rename, resource limit, unchanged, missing-reference status, description and README reads, disposal) and `src/tests/sweep.test.ts` (6 cases: settled sweep, unwatched edit/creation/removal, sink-only dependency change, superseded report, batch identity across four steps, batch identity after a rebuild).

## Verification

Every row ran in this worktree on the final bytes.

| Command | Result |
| --- | --- |
| `npm run build && npm run type-check` | Pass (all four compiler scopes). |
| `npx vitest run subs/analysis/subs/project/src/tests/` | 7 files, 129 tests pass, including the new `observer.test.ts` and `sweep.test.ts`. |
| `npm test` | 82 files, 1,282 tests pass. |
| `npm run reference:cases` | 31 files, 369 tests pass. |
| `npm run reference:verify -- --plan 5 --iteration 4` | **Passes.** Required 18, passed 18, failed 0, not executed 85; required iterations 1, 2 and 4; available capabilities `engine`, `harness-gate` and `observer`; no inventory issue. Report `.reference-work/reports/plan5-iteration4-42fa0586-4508-4caa-9a69-94ada5b5d359.json`. |
| `npm run reference:verify -- --plan 5 --iteration 2` | **Passes.** Required 10, passed 10, failed 0, not executed 93; iteration 2's gate is unaffected by the added capability. |
| `npm run check:reference` under an owned `RAMIFY_ENDPOINT_DIR` | 15 owners, 54 source files, 294 accesses, 2 `outside-module-source` warnings, 0 errors, complete coverage. |
| `npm run check:self` under an owned `RAMIFY_ENDPOINT_DIR` | 11 owners, 236 source files, 2,865 accesses, no finding, complete coverage. The count exceeds the pinned 229/2,744 harness fixture baseline because the checkout carries iterations 2 and 4's new files. |
| `node dist/src/cli-entry.js daemon stop`, `git diff --check` | Daemon stopped after each resident command; diff clean. |

The unfiltered `--plan 5` gate and `--iteration 5` and beyond still fail, as the iteration document expects.

## Issues encountered and decisions taken

- **`ProjectReadOptions` gained an optional `registry?: string`.** The batch input-identity recipe includes the resolved registry's identity, and `observeProject`'s reviewed signature takes `ProjectReadOptions`, which had no channel for it. The field is an expansion of a type already inside the P2 wildcard, the way owners.md treats `CheckParams`'s later additions; `readProject` and `resolveProjectRoot` ignore it, and only `inputId` depends on it. Iteration 6 should confirm the choice when it wires the session's registry through.
- **The `inputId` recipe is transcribed, not shared, with `run-analysis.ts`.** The deliverable text asks for a shared recipe, but `observations.ts` is owner-private and `run-analysis.ts` belongs to the parent owner, so sharing would need an exposure line that owners.md does not declare for iteration 4. The recipe lives once in `observations.ts` for this owner; equality with the batch spelling is asserted by I5-05 `input-id-equals-batch` against an independently transcribed oracle in the harness, and I5-04 `observed-reads-complete` will assert it again on merged inputs. Iteration 9, which already reshapes root's relays, is the natural place to make it a single definition.
- **`observedEnumerations` is an owner-private evidence export.** I5-05 `description-local-update` requires that no directory beneath `subs/` be listed again, which nothing on the `ProjectObserver` port can show. `observer.ts` exports a non-exposed `observedEnumerations(observer)` that the harness deep-imports, the way `catalog-cases.ts` already deep-imports `read-project.ts`. It is not in `module.ramify` and no toolkit source uses it.
- **A missing exposure target no longer invalidates an update**, as recorded above. Plan 1's `readProject` still returns `invalid` for the same disk state; the observer records the reference status instead, which is what the reviewed I5-05 `file-deleted-local` expectation requires. Iteration 6 must derive the reference issues from `inventory.references` rather than from an update kind.
- **A `package.json` or lockfile change forces a structural rebuild**, which is always correct but is heavier than iteration 7's broad path will need. Left as is rather than guessing iteration 7's classification.
- `Capture.refresh` reads bytes without decoding, so an input that is not valid UTF-8 leaves the observation table coherent and the decoding failure is the caller's to report. This matters for descriptions, where Plan 1's `invalid-encoding` issue must survive.

## Files

- New: `subs/analysis/subs/project/src/observer.ts`, `src/observations.ts`, `src/tests/observer.test.ts`, `src/tests/sweep.test.ts`; `scripts/reference-harness/plan5-observer-cases.ts`.
- Changed: `subs/analysis/subs/project/{module.ramify,README.md}`, `src/{capture,read-project,inventory}.ts`, `src/interfaces/project.ts`, `src/tests/fixtures.ts`; `subs/analysis/module.ramify`; `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` (the toolkit declaration expectation gains P4 and A7's six names); `scripts/reference-harness/{plan5-runtime.ts,plan5.test.ts}`.

## Recommendations for Next Iteration

- Iteration 5's retained adapter should report through `observer.sink` during its update and let the observer promote before publication: promotion re-observes each reported path through the capture, so a callback's role and exact-name evidence are merged rather than substituted, and a report whose identity the disk no longer holds surfaces as a change.
- The sink's `probe` records no identity, so a probe-only path is promoted with the capture's own role. I5-04 `observed-reads-complete` should check that acquisition roles win over the provisional `dependency` a probe records.
- Iteration 6 should select the revision path from `InventoryUpdate.kind` plus its lists — `readmes` only is the metadata path, `descriptions` is the description path, `changed`/`created`/`deleted` inside areas are the source path, and `structural` is broad — and must read reference validity from `inventory.references`, not from the update kind.
- Iteration 6 or 7 should decide whether a dependency-role change delivered to `apply` stays a `local` update naming it in `changed` (as now) or becomes its own kind; the current shape keeps `InventoryUpdate` about the inventory and leaves path selection to the session.
- The observer keeps `outsideModuleFiles` and its warnings across local updates, because a created or deleted owned file never enters them. A configuration change goes through the structural rebuild, which recomputes them from a fresh helper run.
