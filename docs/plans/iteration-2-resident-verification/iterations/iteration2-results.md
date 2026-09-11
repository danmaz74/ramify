<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 2 results: Owner skeletons, Plan 2 harness and synthetic generators

**Date:** 2026-09-11. **Outcome:** implemented the iteration's seven deliverables. The four I2-28 instances pass; the full Plan 2 gate correctly fails with 172 instances not executed. No resident engine, context manager, daemon service, client or IPC host is implemented.

## Scope and prerequisites

Work was performed only in `/tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification`, on `workflow/iteration-2-resident-verification`, starting from `6affa839adf68b923466fc332efe081927f63a25`.

Read CLAUDE.md, the iteration-work and testing skills, the implementation/testing/engineering guides, the predecessor handoff, the owner activation manifest, the reviewed 176-leaf inventory, and the existing harness, process helper and frozen generator. Ran `npm run worktree:prepare` successfully for the independent example and site dependencies.

Iteration 1's revised draft inventory is sufficient for this iteration as explicitly allowed. Its architecture acceptance remains pending before iteration 3. The workflow reports iteration 1's publication accepted; this does not independently accept the revised contracts or the main-plan patch preserved in its results.

A pre-existing change to `iteration1-check-results.md` adds the automated regression result. It was preserved and was not directly edited or included in this iteration's code changes.

## Implemented deliverables

1. Installed `subs/daemon/module.ramify` with exactly `ramify 1` and `module daemon tagged [dispatch]`, and `subs/daemon/subs/contexts/module.ramify` with exactly `ramify 1` and `module contexts`. Each README's first paragraph is byte-identical to owners.md. Each owner has only `src/.gitkeep` and `src/tests/.gitkeep`, with no source or exposure statement.
2. Added `scripts/reference-harness/plan2-instances.ts` with 176 explicit records. Each retains its ID, iteration, families, capability, exact fixture selection (including wrappers and multiplicities), evidence kind, mutation and independent expectation. Added Q/P/S100/S500/S1000 fixture vocabulary and an explicit no-project marker; M and H use Plan 2 recipes and have null filesystem roots/configurations. Plan 1's 308 records are unchanged.
3. Added an independent Plan 2 reader in `plan.ts`. It validates 176 unique complete leaves, all thirty matrix groups, fourteen ordered sequence indices and literal titles, both documents' prerequisites and group assignments, and per-iteration counts. The map is `1:[], 2:[1], 3:[2], 4:[3], 5:[4], 6:[5], 7:[5], 8:[7], 9:[6,8], 10:[9], 11:[10], 12:[10], 13:[10], 14:[11,12,13]`. Iterations 1 and 7 contribute no instance. Plan 1's reader and prerequisite map are unchanged.
4. Added `--plan 2`, its iteration range and report titles, Plan 2 portable artifacts and pending-work inventory. The report command lists Plan 2 capability availability without claiming execution. The catalogue validator and reference-case suite cover both plans. The existing isolated fixture runner accepts Plan 2 IDs for later providers while preserving its path checks and cleanup.
5. Added the four I2-28 handlers and a separate `plan2-runtime.ts`. Only its independently implemented `harness-gate` is available. Plan 1's CLI and harness registrations do not activate resident evidence. H controls prove removed records, failed assertions, missing capabilities/handlers and empty assertion runs remain explicit failures in full and intermediate gates. Their nested stubs are not resident providers.
6. Extended root's process preload to observe Unix-socket listen/connect paths alongside spawn, exits and loaded modules. Added `tracedProcess(entry, argv, { cwd, env, timeoutMs })` over the existing bounded capture and descendant cleanup; its environment requires a caller-owned RAMIFY_ENDPOINT_DIR. The CLI helper retains its listener guard and existing defaults. Added the real socket tracing test.
7. Added the deterministic parameterized synthetic generator and extended materialization for S100, S500 and S1000. The frozen hundred-owner generator is unchanged; the new S100 map matches every path and byte. Added generator equality, invalid-count, materialization and overwrite-refusal tests. Generated trees remain ignored.

## Required evidence

| Instance | Result and independent assertions |
| --- | --- |
| I2-28:required-membership | Passed: 176 records, thirty groups, every reviewed metadata field and pointer; iterations 1 and 7 own no leaf. |
| I2-28:removed-record-fails | Passed: full and iteration gates retain the removed required slot, inventory error and failing gate; no membership disappears. Also checks missing capability/handler and unrun assertions. |
| I2-28:failing-assertion-fails | Passed: both gate modes fail and preserve the named failed assertion in the report, despite other pending work. |
| I2-28:iteration-filter | Passed: iteration 5 requires 64 leaves from 2–5; iteration 9 requires 134 leaves from 2–9, with 7 contributing none. Every other leaf is explicitly future/not-executed. |

These are **unit evidence over H**. The standalone process-helper smoke below is tooling verification, not a passed I2 quick, IPC, process or measurement instance.

## Verification executed locally

- `npm run worktree:prepare`: passed.
- `npm run build`: passed.
- `npm run type-check`: passed, including portable, scripts and independent harness configurations.
- `npm run check:self`: completed/passed/complete coverage; **11 owners**, 145 source files, 11 resources, 1,811 accesses; zero errors, warnings, denials or analysis limits.
- `npx tsx scripts/reference-harness/validate.ts`: passed; 308 Plan 1 and 176 Plan 2 records, pointers and prerequisites valid.
- `npm run reference:report -- --dry-run`: exit 0; Plan 2 lists only harness-gate available, and every capability's instances as not executed by that command.
- `npm run reference:verify -- --plan 2 --iteration 2`: exit 0; required 4, passed 4, failed 0, not executed 172; planComplete false.
- `npm run reference:verify -- --plan 2`: **expected exit 1**; required 176, passed 4, failed 0, not executed 172; no future capability is silently satisfied.
- `npm run reference:verify -- --plan 1 --iteration 2`: exit 0 with the unchanged review-only closure [1,2], zero required instances and all 308 not executed. This does not establish the full Plan 1 gate.
- `npx tsx .reference-work/iteration2-smoke.ts`: passed the frozen S100 byte comparison, all three real materializations with every written file checked, and a real socket/child process through tracedProcess. Observed listen, connect, spawn, loaded modules, child and parent exits; no surviving child. The CLI helper's listener guard still rejects the same entry. Temporary socket and trace directories were removed.
- A focused direct harness invocation of the four affected Plan 1 owner-shape handlers ran their real acquisition, analysis and compiled CLI paths. All four passed: I1-27:self-check (34 final assertions), I1-27:self-negative (15), I1-29:scope-report/given (14), I1-29:scope-report/found (14).
- Exact new README paragraphs and empty source/test trees verified; `git diff --check` passed.

The temporary compatibility wrapper initially exited 1 because it compared the passing records in a different order from the inventory. Its saved results show all four handlers passed. The wrapper's expected ordering was corrected and the saved records were independently revalidated by ID, successfully; no engine rerun or suppressed handler failure is claimed.

The prompt reserves Vitest/Cucumber regressions, scenario coverage and sealed-file checks to workflow automation. Therefore neither `npm test` nor `npm run reference:cases` (also Vitest) was run locally. Their new tests are authored and type-checked; no automated regression verdict is claimed here.

Final portable gate reports, under ignored scratch space:
- `.reference-work/reports/plan2-iteration2-2437a341-31a9-4f56-b417-52b1c85940d2.json`
- `.reference-work/reports/plan2-full-1f56c10c-e170-44f0-b3cb-86686fdbcd73.json`
- `.reference-work/reports/plan1-iteration2-2c0132a1-f856-424a-b700-72f82313a3a5.json`

The smoke and targeted compatibility evidence are retained as `.reference-work/iteration2-smoke.json` and `.reference-work/iteration2-compatibility.json`. These are harness execution artifacts, not workflow control-plane drafts.

## Synthetic handoff

| Fixture | Owners | Files | Bytes | Content-map SHA-256 |
| --- | ---: | ---: | ---: | --- |
| S100 | 100 | 1,402 | 1,164,385 | d5b77b9ff57c443b35f386f40598506ff20c51c4ec75b800371f0cec089c0897 |
| S500 | 500 | 7,002 | 5,820,161 | 07cb3d1b9d4dee4200c86c05ef90dfff4f59168ae4e9003c1efff2ebdc6c7fc5 |
| S1000 | 1,000 | 14,002 | 11,641,012 | 0f1ee6d693912b2bc925f41b5543487fa1b42055497e75599bfe8aef13c38c59 |

The generated directories are `.reference-work/iteration2-S100`, `iteration2-S500`, and `iteration2-S1000`. Reproduce with `npx tsx scripts/measurements/materialize.ts <new-ignored-directory> S500` (or S100/S1000). Omitting the fixture keeps the batch S100 default. Materialization establishes no latency or memory result.

## Necessary compatibility correction

Adding the two required owners makes existing nine-owner expectations incorrect immediately. Following the explicit instruction to fix regressions, this iteration updates:
- `project-cases.ts`: the two I1-29 scope-report variants' count from nine to eleven.
- `self-cases.ts`: the literal owner list for I1-27:self-check/self-negative from nine to eleven. Only the two named new owners may be empty, and only with their exact two placeholders; once either has source, the normal owned-test assertion applies.
- `linking.test.ts`: its literal current toolkit owner list from nine to eleven.
- `verify.test.ts`: the now-valid Plan 2 invocation is no longer a negative case.

This brings the self-check shape migration forward from iteration 9 and corrects the plan's omitted acquisition/linking expectations. The two I1-29 executable expectations therefore differ from the main plan's promise to leave the other 305 expectations byte-untouched; this is explicitly recorded, not presented as literal compliance with that promise. All 308 instance records, Plan 1 reader/prerequisites, semantic permission assertions, batch invocation behavior and seven package entries remain unchanged. No plan artifact was directly edited.

## Recommendations for Next Iteration

- Obtain architecture acceptance of iteration 1's concrete contract revisions and resolve its frozen main-plan patch before implementing iteration 3; publication alone is not acceptance.
- Reconcile the master plan's migration wording with the four Plan 1 owner-shape handlers updated here. Later iterations still own the resident CLI/batch migration and the eighth package entry.
- Add each capability and exact handlers to plan2-runtime.ts; use the named iteration gate and retain required evidence kinds. The remaining 172 instances are not implemented or executed.
- Reuse tracedProcess and isolated endpoint directories for later process cases. No daemon or client was started by this iteration.
- Iteration 13 supplies measured resident recipes over the three synthetic sizes. No budgets changed and no macOS evidence is claimed.

## Reported regression remediation (2026-09-11)

The workflow's post-commit Vitest run reported 979 passed and one failed test. The failure was the descriptions owner's exact fixture-membership check: its independent toolkit fixture list still contained nine declarations, while iteration 2 correctly installed eleven. The two missing paths were `subs/daemon/module.ramify` and `subs/daemon/subs/contexts/module.ramify`.

The focused correction is confined to `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`: add literal daemon and contexts fixture records with their exact names, tags ([dispatch] and [] respectively) and empty exposure statements; update the test title and explicit toolkit count to eleven. The existing exact path-set equality, all fifteen reference fixtures, parsed-document/statement checks and token-span assertions remain intact. The fixture loop now adds one parser test for each new owner. No parser implementation, declaration or feature scenario changed.

Focused static verification passed:
`npx tsc --ignoreConfig --noEmit --target ES2022 --module NodeNext --strict --skipLibCheck --types node subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`
and `git diff --check`.

Two initial standalone compiler invocations needed invocation fixes: TypeScript required `--ignoreConfig` when naming a file, then explicit Node ambient types. The final command above passed without further source changes. The supplied automated failure is the regression evidence; Vitest/Cucumber, scenario coverage and sealed-file checks were not rerun locally, as the remediation prompt reserves them to workflow automation. Their post-fix verdict remains pending.
