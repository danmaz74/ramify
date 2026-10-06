# Iteration 1 results: model and engine

Iteration 1 implements the three declared nested-tree kinds. Both owned kinds retain their enclosing owner and share the established exclusion behavior. `owned-unwired` describes unanalysed input; `owned-nested-project` describes a separately managed project. `external` retains its existing behavior. No declaration inspects a directory for a manifest or project marker.

## Commits and scope

- Starting commit: `21fccc69` on `plan/nested-tree-kinds`, worktree `/home/app/ramify-nested-kinds`.
- Approved protected patches: `07e2026d` (`docs(spec): three kinds of nested tree`), committed first after checking every approved baseline hash.
- Implementation: `90cbdea66956aec5fd3a7d36b3732e9a11a03adb` (`feat(project): distinguish owned nested tree kinds`).
- Evidence-format correction: `7476b9474166b8bfdd8788d6959ccf59d03e9151` (`docs(evidence): normalize verification log endings`). This is the clean commit submitted to the final full audit.
- The results/evidence commit following that audited commit contains only this receipt and verification output. The iteration handoff is its resulting HEAD; `git log 21fccc69..HEAD` identifies the complete range.

Parser, project ownership/validation/inventory, TypeScript resolution/access boundaries, synthetic roots, observers, affected queries, architect projections, modularity filtering, daemon codec/watchers and context dispositions all carry both owned kinds. Missing-directory errors and compiler-selection warnings name the declared kind. The old statement fails with an error naming both replacements, while its spelling is an ordinary name.

All seven formats move as approved: analysis/check `/3`, affected/affected-cli `/4`, architect projection/module/view `/3`. IPC `/2` and modularity `/3` stay unchanged. The Claude post-write hook is also a current check-document consumer and now reads `/3`.

The root declarations follow Q3: docs, harnesses and compiler probe inputs are `owned-unwired`; site and the collection-review example are `owned-nested-project`; ramify-agent is `external`. Restoration helpers accept both owned kinds. Current prose and the site glossary follow the patched model. Original proposal decisions 2, 7 and 13 remain dated historical text, with the amendment under decisions 2 and 7.

No changes were made to `/ramify`, ramify-audit, or ramify-agent. Package versions remain 0.3.0 for iteration 2 to release.

## Protected documents (NT-01)

Each before hash was checked before applying its approved patch verbatim. Each after hash was checked again after implementation. The first commit's diff is the patch evidence. Machine-readable hashes are in [protected-hashes.json](../evidence/iteration1/protected-hashes.json).

| Document | Before SHA-256 | After SHA-256 |
| --- | --- | --- |
| `docs/model/module-description.spec.md` | `19e292a9bc44bff47d60398b7cc1a507523e1aa73e11cc4b2c56e0988c10b07c` | `181402e5b5c64aaffbb544b268681dbb7a99b7e5f35811f89cb51ea929cf6281` |
| `docs/model/glossary.md` | `247587c20b8864b2d0a07f7688fe3e3eeb8b61aadb42603387fa72be0c192cfc` | `4c3c1e2efc3f2c7bdf310349399cf9e58ff2129140eb15113910f80253e67976` |
| `docs/model/cross-module-importability.spec.md` | `4aba3df0be6ff7356e7107f8d7c2786ff45ab35c9ede0b319454547b5029d789` | `4d2485d768ec798b070482b95ab3efda84efbdd92ad48d016c8c26924884d673` |
| `docs/model/typescript-source-interpretation.spec.md` | `c1fd4d6551d130bbcd723c8b1a56075e858c06e2a6eaacb50fb147ea0e3a1a95` | `8cf9eb66529b1de11a771af768138285be186ffa2bb7eadbd859ecdf1da79d53` |
| `docs/agents/module-architect.principles.md` | `3858898770ab5f2a54fd375ba5aa6a4c3f72a5ac00f04f974405ac95aa580d25` | `a4fec944e1697f411a605d1f4506ef9fa16318cb1ba4ed8eaa6ec1d13533e851` |
| `docs/architecture/cli-invocation.spec.md` | `dac3ae58473c74d5f03f82d695e715a41cab98466df48cd4477efd7d8bdabd9f` | `81a6a899ebdb31c602feacf8a978bdb95ee2f7b2f12543f086a6a99b224eedc9` |
| `docs/architecture/architect-view.spec.md` | `f8989ad661566eaf668ad6c213994e345988a4f31d7d733e175302225a826794` | `be6def0a5ec6029ef8a8627cc6280bfea5f101ac9f521f1a49b0890591524c0e` |
| `docs/architecture/modularity-report.spec.md` | `00fc9dba0b42145267e9e83a9b454d2d332deecc845adeadf14cfcf60472c1b4` | `1ab86a7d095a1943b1c87763f104b8715618e3cda636a006dffb09a8b112d765` |

## Focused verification

Every one of the 55 changed test files listed in [focused-files.json](../evidence/iteration1/focused-files.json) has successful focused evidence. Fifty-three use the root Vitest configuration; two use `scripts/reference-harness/vitest.config.ts`. Focused invocations used `npx vitest run <explicit files> --maxWorkers=4` for the initial/rest groups and `--maxWorkers=2` for corrective groups and resident/wire checks.

| Evidence | Result |
| --- | --- |
| [focused-first-rerun](../evidence/iteration1/nested-kind-focused-first-rerun.log) | Grammar, inventory, public boundary analysis and affected-query: 4 files, 140 tests passed. |
| [focused-rest](../evidence/iteration1/nested-kind-focused-rest.log) | 49 remaining root-config files: 42 passed; 7 had migration-expectation failures corrected below. Original failures retained. |
| [fixed-expectations](../evidence/iteration1/nested-kind-fixed-expectations.log) | Architect rendering, context checks, project observer, CLI boundaries and affected-rule: 5 files, 62 tests passed. |
| [extra-focused](../evidence/iteration1/nested-kind-extra-focused.log) | Retained-session and architect-boundary view matrices passed; path/wire expectations failed in this earlier run and were corrected below. |
| [path-ownership-fixed](../evidence/iteration1/nested-kind-path-ownership-fixed.log) | 93 tests passed. |
| [wire-final](../evidence/iteration1/nested-kind-wire-final.log) | 6 tests passed, including positive and negative owner/reason coverage for both owned kinds. |
| [harness-stable](../evidence/iteration1/nested-kind-harness-stable.log) | `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/equivalence.test.ts scripts/reference-harness/plan2b.test.ts --maxWorkers=2`: 2 files, 38 tests passed. |

Initial failures were assertions requiring updated kinds, literal parser spans, messages, schema fixtures or compiler-selection expectations. They are retained in the first/rest/wire logs. The first harness run compared copies taken during source editing and saw 2,094 versus 2,096 architect records; the stable-source repeat passed. Both outputs are retained. There were no full-suite test failures or identified flaky tests requiring isolated reruns.

Other commands:

- `npm run build`: passed, independently and inside both audits.
- `npm run type-check`: passed; [final output](../evidence/iteration1/nested-kind-typecheck-final.log).
- `npm run check:self`: passed, 15 owners, 600 source files, 17 resources, 8,936 accesses, zero errors/warnings; 41 nonblocking analysis limits. [Output](../evidence/iteration1/nested-kind-self.log).
- `npx tsx scripts/validate-final-contracts.ts`: passed, 15 owners, 617 files, 173 expanded statements, eight package entries; [output](../evidence/iteration1/nested-kind-final-contracts.log).
- `git diff --check HEAD^ HEAD` and `git diff --check 21fccc69 7476b947`: passed after normalizing evidence EOFs.
- `rg -n 'owned-ignored' src subs scripts`: no matches (exit 1). The grammar test constructs the removed spelling to verify rejection and ordinary-name behavior.
- `rg -n 'ramify\.(analysis/2|affected/3|affected-cli/3|check/2|architect-projection/2|architect-module/2|architect-view/2)' src subs scripts examples/hooks`: no matches (exit 1).
- `dist/src/ramify materialize --view api --view architect --all --root /home/app/ramify-nested-kinds`: passed with an isolated endpoint; 30 targets, 10,143 entries and 3,964,808 bytes; architect `/3`, 15 modules, 2,096 records. The generated, ignored `/2` architect output was removed only after checking it was not tracked or a symlink, then regenerated. Its daemon was stopped explicitly. [Materialization](../evidence/iteration1/nested-kind-materialize.log), [stop](../evidence/iteration1/nested-kind-materialize-stop.log).

## Acceptance evidence

| Case | Evidence |
| --- | --- |
| NT-02 | `project-boundary-grammar.test.ts` covers parsing, tags, reservations, old-statement rejection and ordinary names. |
| NT-03 | Both-kind matrices in `path-ownership`, `project-boundary-inventory`, `project-boundary-analysis`, `affected-query`, `project-boundary-watcher`, `project-boundary-views` and `project-boundary-wire` cover owner/exclusion retention, source pruning and kind-specific warnings, import denial with normal-source positive control, ignored affected seeds, absent watcher registrations/revisions, architect serialization and strict wire rejection. External tests remain. |
| NT-04 | Inventory tests cover each missing-directory layout error, malformed project-like contents under unwired, and a nested-project directory with neither a manifest nor root marker. |
| NT-05 | Pinned root-selection/inventory message tests cover the correct outside-source and inside-source suggestions. |
| NT-06 | Source/version scans above plus passing codec/CLI/architect tests. |
| NT-07 | Q3 declarations, self-check, final-contract validation and passing measurement/reference-harness cases. |
| NT-08 | [Documentation scan](../evidence/iteration1/current-and-historical-doc-scan.log): matches in plans and dated analyses are history/evidence; current-document matches are only original proposal decisions 2/7/13 and architect-view's schema migration history. Site glossary contains the new kinds. Additional current format-reference gap is recorded below. |
| NT-09 | Final audit below. |

## Full audit by installed 0.6.0

Command for both runs:

```sh
/home/app/tools/ramify-audit-0.6.0/node_modules/.bin/ramify-audit audit --cwd /home/app/ramify-nested-kinds --full --json
```

The preliminary run at `90cbdea66956aec5fd3a7d36b3732e9a11a03adb` failed patch-integrity because ten evidence logs had new blank lines at EOF. Build, typecheck, self-check and all 204 files/2,838 tests passed. This run is not accepted as an interim gate. Its [JSON](../evidence/iteration1/nested-kind-audit.json) is retained, with report `95b2d907c0d7429b22d0011cc8b1152e2aec1b54`, run ref `refs/audited/runs/2026-10-06T21-52-06Z-90cbdea66` and run ID `71261683-4df6-43a1-b416-f551f1a300a4`. Commit `7476b947` corrects all ten EOFs; the complete patch-integrity range is then clean.

The final run audited clean commit `7476b9474166b8bfdd8788d6959ccf59d03e9151` (tree `6d3a22577c500eb3766c244212ca761413e633da`), completed in 338.847 seconds, and meets the plan's interim condition:

- Every check passed: patch-integrity, build, self-check, typecheck and toolkit tests.
- **204 files and 2,838 tests passed; zero failed and zero skipped.**
- `summary.overall: pass`; `composition.verdict: indeterminate`, `outstandingFailures: 0`, `scoped: false`, `chainDepth: 0`.
- Expected-file verification remains unavailable (`expected: null`, `run: 204`, `missing: []`). No complete coverage claim is made.
- The **sole** composition reason is `the expected-file comparison is unavailable: expected-files-unavailable: ownership-unavailable (unsupported-schema: schemaVersion ramify.affected-cli/4 is not ramify.affected-cli/3.)`. This is exactly the expected `/4` versus `/3` reader incompatibility. The plan calls this a Ramify-unavailable diagnostic; released 0.6.0 reports it as `ownership-unavailable (unsupported-schema: ...)`.
- CLI exited 1 for this indeterminate result; stderr was empty. The exit code is not treated as an unconditional full pass.

[Final JSON](../evidence/iteration1/nested-kind-audit-final.json); [stderr](../evidence/iteration1/nested-kind-audit-final.stderr). Run ID `fdb828b5-61ba-4d84-95d5-0649b18723ba`; report commit `ac291f47a44a1a6b55b7c67400a0c347c6017572`; run ref `refs/audited/runs/2026-10-06T21-58-16Z-7476b9474`; tree ref `refs/audited/by-tree/6d3a22577c500eb3766c244212ca761413e633da`. Retrieve with:

```sh
git notes --ref=audit show 7476b9474166b8bfdd8788d6959ccf59d03e9151
git show refs/audited/runs/2026-10-06T21-58-16Z-7476b9474:reports/audit/summary.json
```

## Next inputs and remaining gaps

The extra protected `docs/architecture/architect-view-diff.spec.md:56` still names current architect-view `/2`. It was outside the approved patches; its unchanged baseline SHA-256 is `da621110a5557ae955e2c39f4abb718b3d4c3f74396114e05d66d3a1fc19b573`. The coordinator requested approval for only `/2` to `/3`; it remains untouched pending the reply. All named iteration-1 protected and nonprotected migration sites are complete.

[Local toolkit answers](../evidence/iteration1/nested-kind-toolkit-answers.json) already show each declared excluded seed with `selects: []`, its correct kind and enclosing owner where owned. This is development-build evidence, not the iteration-2 production artifact. Its aggregate selection still widens to all 15 modules with `partial-coverage` even though changed/affected modules are empty. Iterations 2/3 must record artifact answers and assess the NT-14 qualification against this existing analysis limit; iteration 1 introduces no new widening policy.

Iteration 2 receives this clean committed range, the current source declarations and schemas, the preserved full-audit reports, and the hash table. It must bump/build the production 0.4.0 artifact, write its receipt and capture artifact `/4` answers. The 0.6.0 expected-file reader incompatibility is intentionally resolved by iteration 3 and checked with the 0.7.0 candidate in iteration 4.
