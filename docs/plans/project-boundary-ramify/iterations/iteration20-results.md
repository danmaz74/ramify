# Iteration 20 results: integration acceptance

**Date:** 2026-10-05. **Status:** receipt for [iteration 20](iteration20.md),
in two parts. The qualification part ran in the second worktree on the
committed candidate `befc5e77`: it requalifies the runtime PB1 cases, runs the
real workflows and reviews write scope, documents and schema identity. The
[coordinator's part](#final-gate-on-7df84ea2) ran on the
final candidate `7df84ea2` in the main worktree: the full audit, the three
measurement recipes, the four `reference:verify` plans, `check:reference`,
`diagrams` and `site:build`. It also lists what changed between the two
candidates and the instances accepted as gaps. Only what is recorded here was
run.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1-next`, branch `feat/project-boundary-ramify-next`, clean at assignment |
| Candidate | `befc5e779453911027c27d0be2da771dc6139d7c`, tree `cbadb6d350c18833b7e4a2df1dac1f08fc3359c5` (2026-10-05 08:31:40 UTC) |
| Contract revision (sha256 prefix) | `contracts.md` `240f66dc`, `acceptance.md` `8370b76b`, `cases.json` `2a1a43c1`, `execution.md` `587dea5b`, `budgets.md` `f9946d2f`, `fixtures.md` `3710495c`, `cli-invocation.spec.md` `d57b7f41`, `module-description.spec.md` `20d42a00`, `docs/model/glossary.md` `1cd8cbf3` |
| Configuration (sha256 prefix) | `package.json` `6662831e` (version 0.2.0), `package-lock.json` `1b822bb4`, `ramify-audit.json` `371ebef9`, `tsconfig.json` `9c67bd1c` |
| Node / tools | Node v22.23.3, npm 10.9.9, TypeScript 7.0.2, Vitest 4.1.11, Git 2.39.5, Chromium 154.0.8037.92 (`/usr/bin/chromium`) |
| Changed here | `handoff.md` (stale-prose table, one flaky row); this receipt. No source, test or configuration changed. |
| Evidence | `/home/app/ramify-pb1-evidence/iteration20/` (`NOTES.md` is the running log) |

One mishap is recorded for completeness. At 09:12 UTC a `npx vitest list --json
<files>` call took the first file argument as its output path and overwrote
`subs/analysis/subs/descriptions/src/tests/project-boundary-grammar.test.ts`
with the list. The overwritten content is kept at
`focused/accidental-vitest-list-output.json`. The file was restored with `git
checkout`, and a rerun passed 42/42 (`focused/grammar-after-restore.out`). The
focused descriptions run predates the overwrite. The module-tree browser run
that may have copied the overwritten file was discarded and repeated
(`browser/tree-acceptance-run1.json` kept).

## Commands and results

Unlocked commands ran in the candidate checkout. Locked commands held
`/tmp/ramify-audit-tests.lock` through `timeout 9000 flock`. Outputs are under
`cmd/`, `focused/`, `workflow/`, `browser/` and `flaky-self/`.

| Command | Lock | Result |
| --- | --- | --- |
| `npm run build` | no | exit 0 (`cmd/build.*`) |
| `npm run type-check` | no | exit 0, all four compiler scopes (`cmd/type-check.*`) |
| `npm run check:self` | no | exit 0; execution completed, check passed, coverage partial. 15 owners, 597 source files, 17 resources, 8,886 accesses. 0 errors, 0 warnings, 41 analysis limits. 5,665 allowed, 0 denied, 3,177 external (`cmd/check-self.*`) |
| `npm run check:reference` | no | exit 0; check passed, coverage complete. 15 owners, 56 source files, 5 resources, 318 accesses. 0 errors, 0 warnings, 0 limits. 179 allowed, 0 denied, 139 external (`cmd/check-reference.*`) |
| `npx tsx scripts/validate-final-contracts.ts` | no | exit 0: `{"owners":15,"files":614,"expandedStatements":173,"packageEntries":8,"bin":"dist/src/ramify"}` |
| `npm run diagrams` | no | exit 0; `git status` shows no change to the committed SVGs |
| `npm run site:build` | no | exit 0. `ramify.ts@0.2.0` was installed into `site/node_modules` from the packed build: 492 files, sha256 `b819601ea4a5e9c80eaf17b3fc2d4d6a755fe3a804fd6a87f85e42917da19443`. Docusaurus build succeeded |
| `npm run reference:cases` | yes, 08:51:44–09:00:34 UTC including the wait | **exit 1: 36 of 37 files, 392 of 393 tests.** `self.test.ts`, "checks the real toolkit and detects the independently specified dispatch type violation", timed out at 180,000 ms (`cmd/reference-cases.*`). See [flaky occurrence](#flaky-occurrence) |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/self.test.ts`, three times | yes | 2/2 tests passed each time, in 85.4 s, 93.6 s and 85.6 s (`flaky-self/run{1,2,3}.out`) |
| `npm run measure:project-explorer -- --only toolkit --output …/browser/toolkit-acceptance.json` | yes, 09:11:28–09:12:00 | exit 0, `status: passed` |
| `npm run measure:project-explorer -- --only tree --output …/browser/tree-acceptance.json` | yes, 09:13:40–09:14:19 | exit 0, `status: passed` for the toolkit, mutations and reference workloads |

The 41 self-check limits by code: `excluded-target` 31, `unsupported-commonjs` 4,
`nonliteral-target` 2, `resource-target` 2 and `unresolved-target` 2. All 41
lie in root auxiliary source: `cucumber-viz.config.ts`,
`ecosystem.config.cjs`, `scripts/measurements/`, `scripts/memory-probe.mjs`,
`scripts/probes/` and `scripts/spikes/`. The `excluded-target` limits are
imports of `dist/` or `node_modules/` declaration files without package
resolution.

### Focused toolkit tests

The tests were run unlocked. Each root file was passed as its own argument, and
every printed file count matched the number of files named.

| Group (owner) | Files run | Result |
| --- | --- | --- |
| Descriptions | `project-boundary-grammar`, `root-marker-grammar`, `auxiliary-exposure`, `linking` | 4 files, 126/126 |
| Project | `path-ownership`, `root-selection`, `project-boundary-inventory`, `project-boundary-observer`, `references`, `project`; then `observer` | 6 files, 217/217; 19/19 |
| Model | the owner's whole `src/tests` directory | 11 files, 232/232 |
| TypeScript | `project-boundary-resolution` | 7/7 |
| Analysis | `root-marker`, `provenance-vocabulary`, `toolkit-boundaries`, `session`, `auxiliary-source`, `project-boundary-analysis`, `project-boundary-session`, `project-boundary-affected`, `affected-query`, `modularity`, `modularity-batch`, `project-boundary-views` | 12 files, 169/169 |
| Contexts | `project-boundary-check`, `watch-registration` | 2 files, 14/14 |
| Daemon | `project-boundary-watcher`, `project-boundary-wire`, `codec`, `architect-view-publisher` | 4 files, 76/76 |
| CLI | `git-advice`, `changed-command`, `affected-command`; then the owner's whole `src/tests` directory | 3 files, 35/35; 9 files, 250/250 |
| Root | `project-boundary-cli`, `project-boundary-publication`, `production-boundary`, `package-consumer`, `resident-cli`, `entry-boundaries`, `cli-process` | 7 files, 37/37 |
| Explorer | the owner's whole `src/tests` directory | 5 files, 35/35 |
| Integration tests | `explorer-router`, `project-view-projection` | 2 files, 4/4 |

## Real workflows on the written topology

The topology of [fixtures.md](../fixtures.md) was written independently in
`workflow/lib.sh` (`make_app`) and run with the candidate's built
`dist/src/ramify`. Each scripted resident run used a private endpoint
directory (mode 0700) and stopped its daemon in an `EXIT` trap. Expectations
come from `fixtures.md` and the contracts, before the outputs were read. Each
command's `.cmd`, `.out`, `.stderr` and `.exit` files are kept.

**`workflow/run.sh`** (`out/`, 61 steps; daemon stopped; 0 processes left):

- **Batch check from `app`** (exit 0). 5 owners and 10 source files: `src/main.ts`, three auxiliary files and six `src/` files. Excluded are both scratch files, `fixture-project`, `external-project` and `sample`. 5 accesses, all allowed; no warnings.
- **Scope exclusions.** The exclusions are external `external-project`, owned-ignored `fixture-project` and `subs/a/fixtures/sample`, and scratch `tmp` directly beneath each module's `src/`. Neither `src/tests/tmp` nor `tools/tmp` is excluded.
- **Root selection.**
  - `app` is found from `subs/a/subs/grand/src` and from `scripts/`.
  - `sample` is found from inside `subs/a/fixtures/sample/src`, and `fixture-project` from inside it.
  - From a directory with no marked description: exit 2, `root-not-found` naming that directory.
  - `--root subs/a`: exit 1, `unmarked-root-description` with the add-the-marker message.
  - `--root .`: `app (given)`.
- **Marker mutations.**
  - Without `app`'s marker, the found selection is `root-not-found` with the nearest-description hint (exit 2), and `--root .` is `unmarked-root-description` (exit 1).
  - A marked `subs/b` makes `app`'s check report `undeclared-project-boundary` at `subs/b/module.ramify:2:1` (exit 1). From inside `subs/b`, `b` is selected as its own root.
- **Ignored projects selected from their own roots** are evaluated independently.
  - `fixture-project` passes.
  - `sample` reports the malformed description deliberately placed at `sample/subs/broken/module.ramify` (exit 1).
  - The enclosing check never read that description, nor the invalid `external-project/module.ramify`.
- **`affected --batch`**: every row of the written table matched.
  - A module seed for `a` gives changed `[app/a]`, affected `[app, app/b]` and test `[app, app/a, app/b]`.
  - `notes/{design,new,old}.md` give `app/app`, on the `containment` basis and without reads.
  - `scripts/check.ts` gives `app/app` on the `inventory` basis.
  - The `a` auxiliary, owned-ignored, scratch and `src/tests/tmp` seeds each give `a` and `[app, app/a, app/b]`.
  - `grand/new.txt` gives `grand/grand`.
  - The external seed, present or absent, gives none with an excluded basis, as does `node_modules/sample/index.ts`.
  - `../outside.ts` gives `all-modules` with `unowned-path` widening.
  - With no seed, the result is exit 2 `invalid-invocation`.
  - Deviation: the first topology's configuration named no output directory, so `dist/output.ts` was `app`, `containment`. That is correct under the specification, which excludes only compiler-configured output. `run2.sh` repeats the row with `outDir: dist`: `excluded`, kind `output`, none/none.
- **Boundary imports (batch).**
  - Relative imports from `b` into `sample` and from `scripts/` into `external-project` each give a definite `project-boundary-import` (exit 1).
  - `import … from 'sample'` through the installed link `node_modules/sample` is external and allowed.
  - Totals: 13 files, 8 accesses, 5 allowed, 2 denied, 1 external.
- **Resident complete check against batch.** Summary, outcome and `inputId` are identical (`ramify.analysis/2`).
- **Hook check (`ramify.check/2`).**
  - Healthy request, exit 0. These paths are `not-analyzed`: `notes/design.md` (`owned-non-source`), both scratch files (`scratch`) and `sample/src/world.ts` (`owned-ignored`). `api.ts` and the three auxiliary or testing files are `checked`.
  - Excluded paths only: exit 0.
  - `../outside.ts`: `not-checked` `unobserved-input`, exit 2.
  - An unchanged `tsconfig.json` is `checked`, because a published revision covers it.
  - With a new `subs/b/src/bad.ts` importing into `sample`: `bad.ts` is `checked` and `notes/design.md` is `not-analyzed`, exit 1. A batch check of the same inputs gives exit 1 with the same finding.
  - After deleting `bad.ts`: `checked` (`deleted`), exit 0.
- **Byte edits** inside `notes/design.md`, `sample/src/world.ts` and `subs/a/src/tmp/throwaway.ts` left the context sequence (1), `observedInputs` (154), the registrations and the complete check's `inputId` unchanged.
- **Watch.** `ramify watch --format json` produced `ramify.watch/2` lines: a revision for the `api.ts` edit (new `inputId`, passed) and none for the following inert edit. SIGINT exit 130.
- **Status registrations.** 20 directories; pruned: `external-project`, `fixture-project`, `node_modules`, `src/tmp`, `subs/a/fixtures/sample` and `subs/a/src/tmp`. After materialization the generated directories are pruned too.
- **`materialize --view architect`** (`ramify.architect-view/2`, 5 modules, 10 records).
  - `app` lists external `external-project` and owned-ignored `fixture-project`, each with its description location. `a` lists owned-ignored `subs/a/fixtures/sample`.
  - The auxiliary originals `checked`, `helper` and `reported` are `internal` with their files.
  - No record names a file beneath a declared tree, scratch or the external tree.
- **`materialize --view api --all`** (6 targets). Only `api` appears as a foreign API: in `app`'s children view, and in the external views of `b`, `a-extra` and `grand`.
- **`materialize --view api --from .` inside `sample`**: exit 2, `Not materialized (invalid-location): … lies in the owned-ignored directory "subs/a/fixtures/sample"`.
- **`measure --format json`**: `ramify.measure/2`.
- **Git advice** (repository copy that ignores `fixture-project/`, `tools/`, `notes/`, `subs/a/src/tmp/`, `external-project/` and `node_modules/`). `ignored-but-walked` appears for `notes` and `tools` only. Verdict, findings and `inputId` are equal to the run without Git (`PATH` without `git`), which gives no warning.

**`workflow/run2.sh`** (`out2/`; daemon stopped; 0 processes left):

- With `outDir: dist`, `dist/output.ts` and a generated `.ramify` file are excluded (`output` and `generated`) and select nothing.
- The hook check names `dist/output.ts` as `not-analyzed`, `reserved`, exit 0.
- A Git-ignored `docs with space/` gives one `ignored-but-walked` warning naming it.
- A failing `git` (exit 1 stub on `PATH`) gives no warning and the same verdict and `inputId`.
- A check selected from inside `fixture-project` in the repository gives no advice.

**`workflow/run3.sh`** (`out3/`, batch):

- **PB1-11.** A configuration selecting `fixture-project` and the scratch directories gives exactly four nonblocking warnings, exit 0, check passed:
  - `compiler-selected-owned-ignored` for `fixture-project` (2 files named) and `subs/a/fixtures/sample` (1);
  - `compiler-selected-scratch` for `src/tmp` and `subs/a/src/tmp` (1 each).
- **PB1-13.** `expose-src checked from "forward.ts"` forwarding `scripts/check.ts` gives `auxiliary-original-exposure` at `module.ramify:6:12` with the related original, exit 1. Exposing `main` from `src/main.ts` passes.
- **PB1-06.** `vendor/lib/package.json` in an undeclared directory gives `undeclared-project-boundary` suggesting `owned-ignored "vendor/lib"` or `external "vendor/lib"`, exit 1.

**`workflow/scale.sh`** (`out-scale/`; PB1-37). The base topology was compared with a copy that adds 10,000 inert files (`notes/inert/d0…d99`) and 5,000 excluded files: 2,500 in `fixture-project/data` (50 directories), 1,500 in `external-project/data` (30) and 1,000 in `subs/a/src/tmp` (20). Each daemon had its own endpoint and was stopped; no process was left.

| Measure | Base | With 10,000 inert / 5,000 excluded files |
| --- | --- | --- |
| Batch summary (owners, files, accesses, findings) | 5, 10, 5, passed | identical |
| Inventory files / captured input bytes | 10 / 2,938,362 | 10 / 2,938,362 |
| Captured inputs (`snapshot.inputs`) | 154 | 10,276: +10,001 zero-byte `dependency` kind observations of the inert files and +121 directories; 0 beneath `fixture-project` or `external-project`; scratch contributes only its directly listed entries |
| Resident `observedInputs` | 154 | 10,275 |
| Daemon inotify watches (`/proc/<pid>/fdinfo`) | 20 | 121: +101, exactly `notes/inert` and its 100 ordinary directories; none in an excluded tree |
| Status registrations | 20 directories, 6 pruned | 121 directories, the same 6 pruned |
| Batch check / resident open | 841 ms / 768 ms | 2,961 ms / 3,252 ms |

After byte edits of inert, owned-ignored, external and scratch files, plus one new
inert and one new owned-ignored file, the hook check reports all three named
excluded or inert paths `not-analyzed`, exit 0. The new inert file changes the
directory listing, so the context rebuilt: sequence 2, a new `inputId`, one
more observation. This is the behavior iteration 15 recorded; the byte edits
alone change nothing, as `run.sh` shows. The first attempt (`out-scale-run1/`)
read the daemon's process ID with color codes and counted 0 watches; it is kept.

**`workflow/limit.sh`** (`out-limit/`; PB1-37 capacity). The topology with 50,001 inert files gives an explicit
`Error [resource-limit] notes/inert/d99/f5099.md:1:1: Captured file limit
exceeded`, execution incomplete, check not run, exit 2, in both batch and resident
checks. No partial pass. See [finding 1](#findings-for-the-coordinator).

## Browser workflow

The phase changed the module tree page (`e3c10dc8`) and the explorer DTO's
embedded source origin, so the real toolkit browser workflow ran with the
installed Chromium (`/usr/bin/chromium`, no browser installed here):

- `--only toolkit` passed (`browser/toolkit-acceptance.json`). The script owns its endpoints and its `/tmp` scratch and removes them.
- `--only tree` (toolkit, mutations, reference) also passed (`browser/tree-acceptance.json`), because the module tree page changed.
- Afterwards no Chromium process remained; the only Playwright processes are three MCP servers that predate the runs (`browser/*-processes-after.txt`).

## Qualification matrix

"Requalified" means that the evidence listed was run on `befc5e77` here and
met the case's independent expectation from `cases.json`. Test-file names
are relative to the owner's `src/tests/`; `wf` refers to the workflow steps
above. Where a clause rests on the coordinator's part, the row says so.

| Case | Producer | Evidence run here | Result |
| --- | --- | --- | --- |
| PB1-01 Valid statement grammar | 2 | descriptions `project-boundary-grammar` (42), `linking`; project `references` | Requalified |
| PB1-02 Malformed statement grammar | 2 | `project-boundary-grammar` (31 located malformed inputs); project `project`, `observer` (`invalid-encoding`) | Requalified |
| PB1-03 Boundary layout validation | 8 | project `project-boundary-inventory` (27), `path-ownership` (93) | Requalified |
| PB1-04 Declaration ambiguity and symlinks | 8 | `project-boundary-inventory` | Requalified |
| PB1-05 Excluded discovery and separate roots | 8 | `project-boundary-inventory`, analysis `toolkit-boundaries`; wf batch, own-root selections of `fixture-project` and `sample` | Requalified |
| PB1-06 Undeclared project migration | 8 | `project-boundary-inventory`; wf marked `subs/b`, run3 manifest | Requalified |
| PB1-07 Auxiliary compiler source inventory | 8 | `project-boundary-inventory` ("PB1-07"), `project`, analysis `auxiliary-source`; wf inventory (three auxiliary files analyzed) | Requalified |
| PB1-08 Inert and nonexistent ownership | 14 | analysis `project-boundary-affected`, `path-ownership`; wf `notes/new.md`, `notes/old.md`; scale (no inventory entry, no content bytes, no per-file watch) | Requalified, with finding 1 on kind observations |
| PB1-09 Scratch location and ownership | 8 | `path-ownership` ("Scratch position"); wf exclusions, architect records of `src/tests/tmp/real.test.ts` (testing) and `tools/tmp/helper.ts` (ordinary) | Requalified |
| PB1-10 Git ignores do not define boundaries | 17 | root `project-boundary-cli` ("PB1-10, PB1-26"), CLI `git-advice`; wf Git copy (Git-ignored, unversioned `tools/tmp/helper.ts` still analyzed; advice only) | Requalified |
| PB1-11 Compiler-selected exclusion warnings | 8 | `project-boundary-inventory` ("PB1-11"), analysis `session`; run3 four warnings; wf base with correct exclusions has none | Requalified |
| PB1-12 Auxiliary importer profile | 11 | analysis `project-boundary-analysis` ("PB1-12"); wf same-owner `report.ts` and exposed `check.ts` allowed | Requalified |
| PB1-13 Auxiliary original exposure | 10 | descriptions `auxiliary-exposure` (17), analysis `auxiliary-source`, model directory (232); run3 forwarded exposure denied, positive control passes | Requalified |
| PB1-14 Nonpackage nested-tree imports | 11 | typescript `project-boundary-resolution`, `project-boundary-analysis` ("PB1-14 …"); wf relative imports into both tree kinds | Requalified |
| PB1-15 Installed linked package provenance | 11 | `project-boundary-analysis` ("PB1-15"), `project-boundary-resolution` (paired controls); wf `'sample'` through the link is external | Requalified |
| PB1-16 Outside and unresolved coverage | 11 | `project-boundary-analysis` ("PB1-16"); wf `b` as its own root (outside-project limit), check:self `excluded-target`/`unresolved-target` limits | Requalified |
| PB1-17 Owner and reverse-import selection | 14 | `project-boundary-affected`, `affected-query`; wf every written row | Requalified |
| PB1-18 Affected exclusions | 14 | `project-boundary-affected`; wf owned-ignored, scratch, external, packages rows; run2 `output` and `generated` | Requalified |
| PB1-19 Affected additions deletions and renames | 14 | `project-boundary-affected` (renames, changed declarations); wf absent and new paths, `../outside.ts` widening | Requalified |
| PB1-20 Changed-check dispositions | 17 | root `project-boundary-cli` ("PB1-20 …"), `resident-cli`; contexts `project-boundary-check`; wf hook steps (exit 0 healthy, 1 with a finding equal to batch, 2 for the outside path) | Requalified |
| PB1-21 Boundary structural invalidation | 13 | analysis `project-boundary-session` (15, hot and warm with fresh-batch equality), project `project-boundary-observer` (16) | Requalified |
| PB1-22 Auxiliary incremental membership | 13 | `project-boundary-session`, `project-boundary-observer` | Requalified |
| PB1-23 Excluded and inert observation | 16 | daemon `project-boundary-watcher`, `project-boundary-wire`; contexts `watch-registration`; wf byte edits, watch stream, registrations; scale inotify | Requalified |
| PB1-24 Invalidation cancellation and limits | 13 | `project-boundary-session` (overlap, sweep, cancellation, 48 KiB byte bound, compiler cleanup), `project-boundary-observer` | Requalified at the focused boundary; the eight deadline and limit instances (I5-08) passed in the coordinator's Plan 5 verification on `7df84ea2` |
| PB1-25 Schema and transport coherence | 16 | `project-boundary-wire` (installed daemon over real IPC, stale peers), `codec`; wf resident documents decoded by the CLI | Requalified |
| PB1-26 Git advisory behavior | 17 | `git-advice`, `project-boundary-cli`; wf and run2 (spaces, absent and failing Git, nested root, excluded directories silent) | Requalified |
| PB1-27 Architect boundary visibility | 18 | analysis `project-boundary-views` ("PB1-27 …"); wf architect view | Requalified |
| PB1-28 Foreign API projection | 18 | `project-boundary-views` ("PB1-28 …"), root `project-boundary-publication`; wf API view and the refused selection | Requalified |
| PB1-29 Explorer and measurements | 18 | `project-boundary-views` ("PB1-29 …"), `project-boundary-publication` ("PB1-29 measure and explorer"); explorer directory; browser workflow (toolkit, tree) | Requalified |
| PB1-30 CLI root selection | 17 | root `project-boundary-cli` ("PB1-30", batch and resident processes); wf root selection and marker mutations (batch) | Requalified |
| PB1-31 Production selection policy | 19 | root `production-boundary` (3, real `scripts/production-files.ts`) | Requalified |
| PB1-32 Reference harness boundary | 8 | `toolkit-boundaries`; check:self JSON (`scripts/reference-harness` owned-ignored, 0 warnings, named only by its exclusion); `tsc -p tsconfig.scripts.json --listFilesOnly` (1,280 files, 0 harness); locked `reference:cases` (37 files, 393 tests: unchanged inventory) | Requalified; the run had one flaky timeout |
| PB1-33 Legal toolkit scripting imports | 8 | check:self (0 denied across the root scripts), `auxiliary-source`, model `identity-model`, `project-boundary-analysis` (testing access refused) | Requalified |
| PB1-34 Site package consumption | 19 | root `package-consumer` (isolated NodeNext install); `npm run site:build` from the packed candidate | Requalified |
| PB1-35 Full-mode and fallback gate | 20 | — | Coordinator: full-mode audit on `7df84ea2`, verdict pass ([full audit](#full-audit-pb1-35)); no fallback needed |
| PB1-37 Bounds and cleanup | 20 | scale and limit witnesses; byte bounds in `project-boundary-session`/`-observer`; every daemon stopped with 0 processes left; browser cleanup; no capacity limit raised in this phase (no limit constant changed in the budget sources since `33d8a739`) | Produced here; see finding 1 |
| PB1-38 Full regression and reference acceptance | 20 | locked `reference:cases` 392/393 with one flaky timeout, retained | Coordinator, on `7df84ea2`: audit pass, locked `reference:cases` 393/393, Plans 1 and 2 pass, Plans 5 and 2A pass apart from four [accepted gaps](#accepted-gaps) |
| PB1-41 Root marker grammar | 3A | descriptions `root-marker-grammar` (54) | Requalified |
| PB1-42 Root selection by marker | 3B | project `root-selection` (13), analysis `root-marker` (4); wf selection rows | Requalified |
| PB1-43 Root marker validity | 3B | `root-selection`, `root-marker`; wf unmarked root and marked child | Requalified |
| PB1-44 Toolkit root migration | 3B | `git grep -n -E '^(root )?module ' -- '*module.ramify' ':!ramify-agent'`: 30 headers, exactly two marked (`module.ramify:2`, `examples/collection-review/module.ramify:4`); check:self, check:reference, `reference:cases` | Requalified; the full toolkit suite passed in the coordinator's audit on `7df84ea2` |

PB1-36, PB1-39 and PB1-40 are iteration 21's artifact cases and were not run.

Summary: 41 runtime cases.

- 38 are requalified (PB1-01 to PB1-34 and PB1-41 to PB1-44). The clauses of PB1-24 and PB1-44 that rest on the coordinator's Plan 5 verification and audit passed on `7df84ea2`.
- PB1-37 was produced here, with finding 1 for the coordinator.
- PB1-35 and PB1-38 are the coordinator's. PB1-35 passed; PB1-38 passed apart from the four [accepted gaps](#accepted-gaps).
- Every case named an executable test or command; none rests on a receipt's claim alone, so no test was added.

## Flaky occurrence

`scripts/reference-harness/self.test.ts`, "checks the real toolkit and detects
the independently specified dispatch type violation", timed out at its
180,000 ms limit in the locked `reference:cases` run. Unlocked focused runs and
the coordinator's gate, in the other worktree, were running at the same time.
Three locked runs of the file alone passed in 85–94 s, so it is recorded as
flaky in [handoff.md](../handoff.md#known-flaky-tests). Failing output:
`/home/app/ramify-pb1-evidence/iteration20/cmd/reference-cases.err`. Its normal
duration is about half the limit.

## Reviews

### Write scope

`git diff --stat 33d8a739..befc5e77` changes 445 files (+24,675/−2,427), all in the toolkit:

Counted by new path:

| Area | Files | Area | Files |
| --- | --- | --- | --- |
| `subs/analysis` | 145 | `scripts/reference-harness` | 69 |
| `docs/plans` | 64 | `subs/daemon` | 47 |
| `src` | 23 | `subs/cli` | 21 |
| `scripts/measurements` | 16 | `docs/architecture` | 9 |
| `site` | 7 | `subs/presentation` | 6 |
| `scripts/probes` | 6 | `subs/service-api` | 4 |
| `scripts/` root files | 4 | `docs/model` | 4 |
| `subs/explorer` | 3 | `docs/development` | 3 |
| `subs/integration-tests` | 2 | `examples` | 2 |
| `docs/roadmap.md` | 1 | root files (`module.ramify`, `package.json`, `package-lock.json`, three `tsconfig*.json`, `vitest.config.ts`, `README.md`, `CLAUDE.md`) | 9 |

- Nothing beneath `ramify-agent/` changed (0 paths).
- The 75 additions, 1 deletion (`scripts/reference-harness/plan5-baseline-loader.mjs`) and 15 renames are all inside the toolkit. The renames are:
  - the probe move to `subs/analysis/scripts/probes/`;
  - `markdown.test.ts` into the harness;
  - `plan2a-materialize-fixture.ts` from the harness to `scripts/measurements/`;
  - `emit-diagrams.ts` to `subs/presentation/scripts/`.
- `/ramify-audit` and `/ramify` cannot be compared from this checkout's history. This qualification wrote nothing there: all writes went to the worktree's two documents, the external evidence directory and the site's `node_modules`.

Protected documents changed over the phase: eight specifications
(`docs/architecture/architect-view-diff.spec.md`, `architect-view.spec.md`,
`cli-invocation.spec.md`, `materialized-api-view.spec.md`,
`modularity-report.spec.md`; `docs/model/cross-module-importability.spec.md`,
`module-description.spec.md`, `typescript-source-interpretation.spec.md`) and
`docs/model/glossary.md`. Each was applied by the coordinator under an
authorization the receipts record. **No `.principles.md` file changed.** The
coordinator's protected-file comparison against the recorded baselines and
approvals is still to run.

### Schema identity

Identifiers in `src`, `subs`, `scripts` and `examples` (`review/schema-ids-all.txt`)
agree with [schema versions](../contracts.md#schema-versions). Producers emit:

- at version 2: `ramify.analysis/2`, `ramify.affected/2`, `ramify.affected-cli/2`, `ramify.watch/2`, `ramify.daemon-status/2`, `ramify.ipc/2`, `ramify.check/2`, `ramify.measure/2`, `ramify.architect-module/2`, `ramify.architect-view/2`, `ramify.architect-projection/2`;
- `ramify.modularity/3`;
- still at version 1: `ramify.api-view/1`, `ramify.api-view-projection/1`, `ramify.explorer-http/1`, `ramify.explorer-dependencies/1`, `ramify.explorer-record/1`, `ramify.cli/1`, `ramify.daemon-record/1`, `ramify.runtime-identity/1`, and the measurement and modularity-document identifiers.

The daemon record names `protocol: "ramify.ipc/2"`.

Older versions remain only in these places:

- **Negative tests.** `ramify.ipc/0`, `/1`, `/3`; `ramify.analysis/1` in the wire and consumer tests; `ramify.architect-view/1`, `/3`, `/40` in publisher and publication tests; `/1` `_meta.json` fixtures in `generated-path` and `retained-source-analysis`; `ramify.runtime-identity/2` in `discovery.test.ts`; `ramify.check/1` in `fast-evidence.test.mjs`.
- **Archived probe results** in `scripts/probes/results/modularity/`.
- **Four reviewed instance rows** left byte-identical: `I2-20:json-bare-report` and `I5-11:plain-check-unchanged` (`ramify.analysis/1`), `I2-21:json-lines` (`ramify.watch/1`), and `I5-11:changed-delta-document` (`ramify.check/1`). The receipts of iterations 15 and 17 name the two I5-11 rows as the reviewed ones; the final-gate repair lists all four. Each asserts the version-2 document and is in the handoff's stale-prose table.

In documents outside the archived and completed plans, old versions remain in
`docs/roadmap.md` (`ramify.measure/1`, `ramify.check/1`, kept as historical
deliverable text by 8B and 8C), in two `docs/analysis/` notes (historical) and
in `modularity-report.spec.md`, which correctly calls `/1` and `/2` historical.
No live code or current specification names an outdated version.

### Runtime documents

`rg -n -i "not yet implemented|pending|when project boundaries are implemented" docs/model docs/architecture -g '*.md'`
(`review/status-notes.txt`):

| Location | Note | Assessment |
| --- | --- | --- |
| `docs/model/glossary.md:9` | "… and the remaining tooling changes are not yet implemented." | **Stale.** Every term it defines for project boundaries is now implemented by Ramify: nested trees, owned-ignored and external trees, always-excluded paths, scratch directories, auxiliary source, containment and the root marker. The audit and agent parts are not glossary vocabulary. Patch proposed |
| `docs/model/cross-module-importability.principles.md:7` | "The corresponding tooling changes are not yet implemented." | **Stale.** The specification's status says "Ramify's checks implement these rules". Patch proposed; it is a principles file, so the change needs the procedure's decision |
| `docs/architecture/project-boundary.proposal.md:8`, `docs/architecture/README.md:46` | final qualification and handoff "pending"; Phases 2 and 3 not implemented | Accurate until iteration 21's handoff; iteration 21 updates them |
| `daemon.md` (376, 429, 449, 461, 545, 549, 674), `cli-invocation.spec.md` (268, 304, 310), `memory-lifecycle.md:43`, `processes-and-clients.md:322` | pending updates, sweeps and configuration rebuilds | Runtime vocabulary, not status notes |
| `architect-view-diff.spec.md`, `processes-and-clients.md:14, 30`, `daemon.md:15` | not implemented | Accurate: later features (architect-view differences, MCP adapter, unsaved overlays) |

The proposed patches are in
`/home/app/ramify-pb1-evidence/iteration20/proposed-spec-patches.diff` (`git
apply --check` passes on `befc5e77`):

```diff
--- a/docs/model/cross-module-importability.principles.md
+++ b/docs/model/cross-module-importability.principles.md
@@ -4,7 +4,7 @@

 Whole-tree ownership and project-boundary principles adopted 2026-10-01;
 their detailed contracts, including auxiliary-source rules, are specified
-separately. The corresponding tooling changes are not yet implemented.
+separately. Ramify's checks implement them.

 ## Purpose

--- a/docs/model/glossary.md
+++ b/docs/model/glossary.md
@@ -5,8 +5,9 @@
 Whole-tree ownership and project-boundary vocabulary adopted 2026-10-01,
 and the root marker adopted 2026-10-03; discovery implements the root marker
 and the declared nested trees, auxiliary source is analyzed and its originals
-are never exposed, imports into declared nested trees are enforced, and the
-remaining tooling changes are not yet implemented.
+are never exposed, imports into declared nested trees are enforced, and
+containment decides affected selection and the hook check's path
+dispositions.

 ## Purpose

```

Other plan status lines that iteration 21 may update are not protected:
`acceptance.md` ("planned, not executed"), `cases.json` (`"status":
"planned"`), `contracts.md` ("implementation pending") and `handoff.md` ("no
provider handoff exists yet").

`CLAUDE.md` still says that compiler-selected files outside every module's
`src/`, including sibling `tests/` or `interfaces/` and loose `subs/` source,
"produce warnings" and that an owned import of them is an outside-scope analysis
limit. Since 8C they are root auxiliary source with no warning. This is the
held change C; it was not edited here, and it landed later in `6598a29d`.

### Remaining defects and gaps

**Known defects carried forward** ([handoff](../handoff.md#known-defects-carried-forward)), unchanged:

- The daemon fails later requests once its working directory is deleted. This predates the phase.
- `ProjectExplorerPage.tsx` loses an interaction made before a newly rendered model settles.

The coordinator's measurement runs added one more, which also predates the
phase: the daemon does not recover a context whose session worker died (see
[measurements](#measurements)). The wording package after `befc5e77` added the
lockfile behaviour of the hook check. Both are in the handoff.

**Known flaky tests:** A7-11 `compiled-client` (unresolved, not reproduced);
MT09 and the session-worker cancellation (both product defects, repaired);
the self test above (new).

**Stale prose:** the complete table is now in
[handoff.md](../handoff.md#reference-rows-whose-prose-is-stale). It has 31
rows: the final-gate repair's 29 (from iterations 2, 3, 3B, 4, 8B and 8C,
baseline repair 2 and that slice), plus `I2-19:batch-no-daemon` from the
iteration 17 fix and the two `entry-footprints` rows (`I2-29`, `I5-13`). The
harness README's helper sentence that the iteration 17 fix listed now names
the Git advice child, so it is no longer stale.

**Items earlier slices left for later, and their state on the candidate:**

| Item (receipt) | State |
| --- | --- |
| FORCE_COLOR test and nine reference failures (1) | Repaired by baseline repair 2 |
| Absent tool directories declared external (1, 7) | Done (decided question 1) |
| Tree validation, pruning, `independentScopes` retirement (2, 3, 3B, 7) | Done in 8A |
| Containment-first classification (1 → 15) | Done in 15 |
| A scope without a root module answers `invalid-path` (3, gap 4: "if a distinct answer is wanted, the contract needs a variant") | No later slice; left as is. Optional |
| Explorer DTO `auxiliary` (4) | Decided question 5 |
| Watcher's `.reference-work` exclusion; deviation 1 (8A, 8B) | 12 (observation identity) and 16 (registrations from the scope) |
| Stale owner README first paragraphs (8C) | Final-gate repair |
| Measurement ownership rule wording (8C, gap 4) | Done: the `measure` rule no longer names independent compiler scopes |
| `referenced-resource` (9, 11, 12) | Removed in 14 (relay-settled) |
| Probe scripts without `realpath`/`directoryExists` (3B, 9 gap 5) | Not run by any slice; not run here |
| Synthetic roots through links; `#` import-map entries; link-selected compiler roots (9, 11) | No later slice; left as gaps |
| Absent-directory refusal broader than necessary (13, gap 2) | No later slice; left |
| Warm sessions publish a revision for an inert event (13, gap 3) | No later slice. A hot session published none (`run.sh` watch) |
| Pre-existing: the observer keeps its last valid capture after an invalid acquisition (12 gap 7, 13 gap 4) | Left as is |
| Hook classification round trip cost (15, gap 2) | Not isolated by the fast recipe; see [the classification round trip](#the-classification-round-trip) |
| Invalid revisions classify by the latest completed ownership (15, gap 5) | Left as is |
| Plan 2B/2C view size and timings on the final build (18) | **Not in the coordinator's measurement list** (resident, fast, Plan 2A). 18 recorded the view size (1,066,266 bytes in 62 files, within the 8 MiB budget) but no timings |
| Guides to review (17): `batch-verification.md`, `testing.md` | Updated in 19 |
| `engineering-practices.md` (17) | No change in the phase |
| `CLAUDE.md` changes A and C and the three stale sentences (19) | Held for the user on `befc5e77`. A and C landed later, in `f342133a` and `6598a29d`; the three stale sentences still wait for the user's wording |
| `tags.mdx` flagged, `site/package.json` description, `docs/architecture/README.md` dated status (19) | Left |
| Three Plan 7 purposes; the Project paragraph (final-gate repair, gaps 2–3) | Awaiting the user's review, per that receipt |
| I2-29, I5-13 and I2A-12 measurement instances (baseline repair 2, final-gate repair, entry-footprints) | Measured on `7df84ea2`. All pass except `I5-13:hook-latency-s1000`, `I5-13:checked-set-bounded`, `I5-13:cold-open` and `I2A-12:linux-macos-bytes`, the [accepted gaps](#accepted-gaps) |
| `ramify-agent` reads `/2` architect views (18); agent and audit roots unmarked (3A) | Phases 2 and 3 |

**Relay-settled wordings** (read from the coordinator's `RESUME.md`, not
re-decided here):

- the JavaScript rule outside `src/` only;
- the I5-01 re-pin;
- `referenced-resource` removed;
- the classification round trip per hook, and the client-hashing sentence;
- the watcher window wording;
- the CLI's guarded copy of the reserved-name rule, and Git advice on complete checks only;
- the `entry-footprints` relaxation, now committed in `befc5e77`, so that list's "slice still to do" is stale;
- iteration 18's gate also running Plan 2A;
- PB1-31's amended production clause;
- the MT09 policy.

### Timing targets

From this phase's receipts:

- **I5-08 cold S1000 retained-session open**, against the 30 s acquisition deadline: 23.5 s at the baseline `33d8a739`. The candidate line measured 23.4–25.2 s across iterations 8C–16 (24.3 s after the regression repair, 23.6 s at iteration 16).
- **Installed-daemon S1000 open to the first synchronized report** (iteration 16, no earlier target): 37.0/37.3 s against 36.9/37.0 s.
- **Toolkit architect view:** 1,066,266 bytes against Plan 2C's 844,838, within the 8 MiB budget.
- **Entry footprint help:** about 25 ms.

The candidate values of the resident (I2-29), fast (I5-13) and Plan 2A (I2A-12)
targets are under [timing targets on the final candidate](#timing-targets-on-the-final-candidate).

## Findings for the coordinator

1. **Inert files count toward the 50,000 captured-file limit.** This needs a decision before the candidate is frozen.
   - Discovery walks ordinary directories and observes the kind of every file in them. Each inert file becomes a zero-byte `dependency` captured input whose identity is its kind and path, with no content.
   - `capture.ts` counts every observed file against `maxFiles`.
   - So 10,000 inert files add 10,001 captured inputs, and 50,001 inert files make the check `resource-limit` "Captured file limit exceeded" (exit 2) although none of those files is analyzed.
   - PB1-37 as worded holds: no content, no inventory and no excluded-tree watch growth, and the limit gives an explicit incomplete outcome. budgets.md asks for "no inventory/content-input growth", which also holds for inventory and content.
   - The policy says a limit the new rules reach in the toolkit or the reference project is raised with its measurement. Neither project reaches it (the toolkit captures far fewer files). A user project with more than 50,000 files in ordinary non-source directories could no longer be checked.
   - Options:
     - (a) Accept, and record it as a capacity consequence in the handoff.
     - (b) Count only read files toward `maxFiles` and bound kind observations separately. This is a producer change in Project capture, outside this slice.
2. **The hook canonicalizes named paths through symlinks before classification.**
   - This is `changed-command.ts` `canonicalPath`, from Plan 5 (`b1706f7c`).
   - `--changed node_modules/sample/index.ts` is reported as `subs/a/fixtures/sample/index.ts`, owned-ignored, module `app/a`. `affected --path` gives the same spelling `packages`, no owner.
   - The disposition (`not-analyzed`) and the exit code are right either way. The reported path is not the named spelling, and the two commands disagree on the owner.
   - It predates the phase. Recorded as an observation, not fixed.
3. **Plan 2B/2C measurements** (view size and timings) were listed by iteration 18 for iteration 20 on the final build. They are not among the three recipes the user approved. Decide whether they are part of the measurement run or are reported as not measured.
4. **Proposed status patches** for `glossary.md` and the importability principles (above). The principles edit is status-only; the procedure requires a decision on a principles file.

How they were settled before the final candidate:

- Findings 1 and 3: the relay session accepted the acquisition limit and the unmeasured Plan 2B and 2C views for this phase. The handoff lists both under known limitations and the relay-settled wordings.
- Finding 2: recorded as a follow-up in the handoff.
- Finding 4: both status lines were applied in `6598a29d`. The user authorized the principles sentence.

## Final gate on `7df84ea2`

The coordinator ran this part in `/home/app/ramify-pb1`, branch
`feat/project-boundary-ramify`. Times are UTC on 2026-10-05. Evidence is under
`/home/app/ramify-pb1-evidence/7df84ea2/`, in `final-candidate-3/`,
`preflight/`, `measurements/` and `verification/`. The scripts that ran the
gate and the recipes, `gate.sh` and `measure.sh`, are in the evidence root's
`coordination/`.

### Final candidate

| Item | Value |
| --- | --- |
| Candidate | `7df84ea29377ca3642bb49ef5084b71bf652b2f8`, tree `c4c5c11a21a1c108bc0f104fc9619cc59a44b097` (committed 13:19:13) |
| Supersedes | `723d4698` and `a5b377e8` (see [attempts](#attempts)) |
| Configuration (sha256 prefix) | unchanged from `befc5e77`: `package.json` `6662831e` (version 0.2.0), `package-lock.json` `1b822bb4`, `ramify-audit.json` `371ebef9`, `tsconfig.json` `9c67bd1c` |
| Contract revision (sha256 prefix) | `contracts.md`, `acceptance.md`, `cases.json`, `execution.md`, `budgets.md` and `fixtures.md` unchanged from `befc5e77`; `cli-invocation.spec.md` `73862955`, `module-description.spec.md` `19e292a9`, `docs/model/glossary.md` `fd3a1bad` |
| Frozen build | the single `npm run build` of gate `final-candidate-3` (exit 0, 13:24). Nothing was rebuilt afterwards. The verification reports record build sha256 `d766e5e0` and source sha256 `4c9b5ed2` (prefixes) |
| Worktree state | clean for the gate. From the measurement run on, it holds the three untracked measurement archives and the modified `scripts/measurements/results/index.json` that the run wrote, identical at 14:35 and 16:09 (`verification/status-before.txt`, `status-after.txt`). The verification reports therefore record `dirty: true` |

Changes after the qualified candidate `befc5e77` (`git log befc5e77..7df84ea2`):

- `f342133a`: `CLAUDE.md` change A.
- `6598a29d`: the user's wording package ([receipt](inert-wording-results.md)). It contains the glossary entries and status line, `CLAUDE.md` change C, and passages of `cli-invocation.spec.md` and `module-description.spec.md`. It also contains the principles status sentence the user authorized. In source, it changes the compiler-source extension pattern in `subs/analysis/subs/project/src/inventory.ts` and `subs/analysis/subs/typescript/src/resolution.ts`, with a new test, one test fixture and two harness expectations.
- `c9f724c5` and `723d4698`: this receipt's qualification part and handoff entries.
- `a5b377e8` and `7df84ea2`: the measurement recipes under `scripts/measurements/` and plan documents only. No file beneath `src/` or `subs/` changed after `723d4698`.

The qualification matrix above therefore ran on source without `6598a29d`'s
extension pattern. The audit and the reference chain below ran on the final
source; the workflow scripts were not repeated on it.

### Attempts

**First attempt, `723d4698`.** Gate `final-candidate` passed: audit verdict
pass, build exit 0, locked `reference:cases` 37 files and 393 tests
(`723d4698/final-candidate/`). `measure:resident` ran 10:09:40–10:16:50 and
exited 1. Four of its nine workloads passed. The other five required complete
coverage on the synthetic fixtures, which report `partial` for Plan 8's
expected `signature-inferred` note on `value`. That was a stale recipe
expectation. The sequence stopped and nothing was rerun
(`723d4698/measurements/`). The
[measurement-recipe repair](measurement-recipe-repair-results.md) fixed it
in `a5b377e8`.

**Second attempt, `a5b377e8`.** Gate `final-candidate-2` passed: audit pass,
build, `reference:cases` 393/393. The preflight workloads, Plan 2A
`synthetic-100` and fast `hook-latency-s100`, passed (`a5b377e8/preflight/`).
`measure:resident` (11:43:49–11:57:35) and `measure:plan2a`
(11:57:35–12:07:41) exited 0. `measure:fast` (12:07:41–12:58:14) exited 1. The
cause was the per-context retained-fact limit at S500 and S1000; see the
[diagnosis and repair](#second-attempt-diagnosis-and-repair). The relay
session chose option (a), a repair of the recipe only, under the user's rule
for clear-cut questions. The user may still override it. The repair is
`7df84ea2`.

**Third run, `7df84ea2`.** This is the evidence recorded below.

### Full audit (PB1-35)

Gate `final-candidate-3` (`7df84ea2/final-candidate-3/`), on the clean
checkout:

- `ramify-audit audit --cwd /home/app/ramify-pb1 --full --force --json`, run with `ramify-audit` 0.3.2 from `/ramify/ramify-agent/node_modules/.bin/`. It ran 13:19:15–13:24:41 and exited 0. Requested and executed mode `full`, verdict `pass`, 0 outstanding failures, 325.1 s. Its checks were `patch-integrity`, `toolkit-build`, `toolkit-structure`, `toolkit-tests` and `toolkit-typecheck`, and the failure ledger was complete with no entries. Run ref `refs/audited/runs/2026-10-05T13-24-41Z-7df84ea29`, report commit `a44c2443`.
- `npm run build`: exit 0. This is the frozen build.
- `flock /tmp/ramify-audit-tests.lock npm run reference:cases`: exit 0, 37 files and 393 tests passed, started 13:24:45, 348.4 s.

No direct-verification fallback was needed. This is an audit pass, not a
direct gate.

### Measurements

**Preflight.** This is not evidence. Fast `--workload hook-latency-s100` ran
13:30:41–13:34:29 and S100 was measured and passed. The report's overall
status is `incomplete`, because no other workload was selected. Its report
and archive are in `7df84ea2/preflight/`, outside `scripts/measurements/results/`.

**The run.** `measure.sh` ran the three recipes once, in the order resident,
Plan 2A, fast. Each ran under `flock /tmp/ramify-audit-tests.lock`, on the
frozen build, on Linux only, with
`RAMIFY_MEASUREMENT_ACTIVITY='project boundary Phase 1 final candidate'`.
This follows the user's final measurement decision of 2026-10-04, relayed to
the coordinator. The recipes run complete as written, with their fixed sample
counts, on the candidate only, and are compared with archived baselines. In
the fast hook-latency workloads that is 20 samples per class. Decided
question 11 of the main plan and `execution.md` still say "samples of 30–50".
A watcher would have stopped the S500 hook-latency worker after 45 minutes and
the S1000 worker after 60 minutes, the user's bounds. Neither bound was reached. The S500
workload ran 14:05:16–14:21:16. The S1000 workload ran from 14:22:01 until it
stopped at its failure point at 14:23:13. Outputs are in
`7df84ea2/measurements/`: `timeline.txt`, each recipe's `.stdout`, `.stderr`
and `.exit`, and `resident-report.json`, `plan2a-report.json` and
`fast-report.json` (580 MB).

| Recipe | UTC | Exit | Result |
| --- | --- | --- | --- |
| `measure:resident` | 13:34:31–13:48:11 | 0 | `passed`. All nine I2-29 workloads measured and passed: `entry-footprints`, `cold-warm-broad-reference`, `cold-warm-broad-hundred`, `repeated-edit-plateau`, `many-contexts`, `slow-consumer`, `synthetic-500`, `synthetic-1000`, `publication-peak`. No advisory miss |
| `measure:plan2a` | 13:48:11–13:58:18 | 0 | `passed`. `reference-scale`, `toolkit-scale`, `synthetic-100`, `synthetic-1000` and `repeat-plateau` measured and passed. `synthetic-500` was not executed: the recipe's standing policy, from Plan 5's measurement decision of 2026-09-11, excludes it, and the report says so by name |
| `measure:fast` | 13:58:18–14:34:56 | 1 | `failed`, with exactly three failed workloads: `hook-latency-s1000`, `checked-set-bounded` and `cold-open`. The other seven passed: the reference, S100, S500 and X100 hook-latency workloads, `repeated-edit-plateau`, `hot-warm-memory` and `entry-footprints` |

Archives, untracked in the worktree:
`scripts/measurements/results/resident-2026-10-05T13-34-32.071Z-7feeb3b4-5d9b-419f-8fcb-da61032a615b.json.gz`,
`plan2a-2026-10-05T13-48-12.093Z-c143c50f-dccf-4a22-8ca0-ef39abb19ec9.json.gz`
and `fast-2026-10-05T13-58-18.793Z-a0804e21-9af0-41ae-aa81-9605f7248012.json.gz`
(20 MB). `index.json` lists them.

**S500 retries at the retained-fact limit.** `I5-13:hook-latency-s500` passed
with no failed assertion. Its row "membership revisions retried broad at the
retained-fact limit" lists 8 cycles: created 5, 10, 15 and 20 and deleted 3,
8, 13 and 18. The largest growth one membership revision added was 6,883,102
bytes. The reference, S100 and X100 rows list 0 cycles.

- Before each retry the context held six revisions, against the limit of 100,663,296 bytes. Retained facts were 98,304,757 bytes before deleted 3, the first crossing, and 99,078,599 before created 5. Before each of the other six they were 95,255,922.
- The history reset was observed 2.5–2.8 s after the write. The retry then ran 14.2–14.6 s.
- The broad revision's session work was 13.8–14.2 s, and the hook took 17.0–17.4 s end to end. Across all 20 created and all 20 deleted saves, the median hook end to end was 2.2 s, and the median session work 2.16 s.

**S1000 failure point.** `I5-13:hook-latency-s1000` recorded "Stopped at body
5 (racing): the hook answered not-checked (unavailable) after 28403 ms:
analysis-failed: Session worker exited (1)".

- Body edits 1–4 were checked in 0.8–1.0 s end to end. After them the context retained 74.1, 81.2, 88.4 and 95.5 MB of facts.
- The failure point records 95,495,083 retained bytes and five revisions before the reset, 5,168,213 bytes of headroom, and the reset observed 1,250 ms after the write. The retry then ran 27.2 s to the end of the window.
- The hook answered `not-checked`, reason `unavailable`, exit 2.
- The workload has 24 failed assertions. The first is "workload stopped at its measured failure point". The rest cover body edit 5 and the phases, hooks and probes the workload never reached.
- `I5-13:checked-set-bounded` fails 8 assertions, all for S1000. `I5-13:cold-open` fails none of its own. Each names the source failure: "Source process I5-13:hook-latency-s1000 stopped at body 5 (racing): analysis-failed: Session worker exited (1); this row has no complete evidence from it."

Recipe output does not capture daemon or worker stderr, so the cause of the
worker's exit is still unproven.

#### The classification round trip

Iteration 15 made each hook check classify its paths with one extra round
trip. No recipe isolates its cost, and this run does not either.

- In `subs/cli/src/changed-command.ts`, the client's first check request carries no classification. The daemon answers `classification-changed` with the classification, and the client then sends the classified request.
- The `ramify.check/2` document records `timings.waitedMs`, the client's time waiting on all of its check requests together, and `timings.totalMs`. It records `timings.reply` only for the last request.
- No field and no recipe times the first request alone.
- The session's `classify` stage timing is the revision's change classification, not this round trip.

The evidence allows the following. Values are medians of 20 hooks from
`fast-report.json`, in milliseconds. A published hook is one whose watcher
revision had already published, so the hook performs no analysis. A
zero-work hook is a client on the freshly opened revision.

| Scale | Bare Node process | Zero-work hook: end to end; `waitedMs` | Published hook: end to end | Published hook: `totalMs` | Published hook: `waitedMs`, both requests (range) | Published hook: last request `reply.service` + `reply.clientTransport` |
| --- | --- | --- | --- | --- | --- | --- |
| reference | 24.4 | 29.5; 1.58 | 35.9 | 10.1 | 1.70 (1.27–2.19) | 0.50 + 0.44 |
| S100 | 25.1 | 30.9; 1.91 | 32.1 | 9.9 | 1.36 (1.13–1.68) | 0.16 + 0.42 |
| S500 | 32.1 | 45.9; 3.81 | 34.5 | 10.8 | 1.57 (1.26–2.49) | 0.15 + 0.44 |
| S1000 | 29.5 | 44.0; 8.25 | — (not reached) | — | — | — |
| X100 | 23.9 | 31.0; 1.89 | 34.9 | 10.2 | 1.34 (1.16–1.77) | 0.16 + 0.40 |

So, on a context whose revision already covers the change, the classification
request and the covered request together took a median of 1.3–1.7 ms of a
32–36 ms hook. The classification round trip is a part of that time and is
not measured on its own. In edit cycles, waiting is set by the session work.
For S500 body edits, for example, the hook waited a median of 381.6 ms for
327.4 ms of session work.

#### Timing targets on the final candidate

Every target of these recipes is advisory (resident) or an ideal budget
(fast). A miss is recorded and fails nothing. Plan 2A's report records raw
measurements, which its I2A-12 instances judge. Baseline values come from the
archived reports. Pairing them with these values for the user is iteration 21's
handoff report.

- **Resident:** 36 advisory targets, all met.
- **Plan 2A:** the report has no target of its own. Every I2A-12 instance except `linux-macos-bytes` passed in the Plan 2A verification.
- **Fast:** 76 ideal targets, 52 met and 24 missed. The misses are in the table below. Seven of S1000's misses have no value, because the workload stopped before it measured them.

| Workload | Target | Candidate | Target value |
| --- | --- | --- | --- |
| reference | body / configuration median session work | 38.6 ms / 1,396 ms | 25 ms / 1,000 ms |
| S100 | body / configuration median session work | 61.9 ms / 2,852 ms | 60 ms / 2,500 ms |
| S500 | body / configuration median session work | 327.4 ms / 14,018 ms | 200 ms / 8,000 ms |
| X100 | body / configuration median session work | 88.5 ms / 3,604 ms | 60 ms / 2,500 ms |
| S1000 | body median session work (5 cycles); racing median hook end to end (5 cycles) | 717.0 ms; 942.0 ms | 400 ms; 900 ms |
| S1000 | source, description, readme, created, deleted, configuration session work; published hook | no value | — |
| `repeated-edit-plateau` | reference: worker supervisor RSS growth, combined process RSS growth, compiler server RSS | 22.1, 46.2, 217.5 MiB | 19, 19, 192 MiB |
| `repeated-edit-plateau` | S100: worker supervisor RSS growth, combined process RSS growth, worker heap growth beyond history | 24.8, 37.0, 11.5 MiB | 19, 19, 5 MiB |
| `cold-open` | reference cold session work | 1,712 ms | 1,500 ms |

`cold-open` also records S1000 cold session work of 24.4 s against 40 s. That
row is failed for want of complete S1000 evidence, so the value is not
accepted evidence.

### Reference verification: Plans 1, 2, 5 and 2A

The verifications ran in the final gate's order, without a rebuild. Each was
`npm run reference:verify -- --plan <n> --format json` under the machine test
lock. Outputs are in `7df84ea2/verification/`: `timeline.txt` and
`verify-<n>.stdout`, `.stderr` and `.exit`. Every report names revision
`7df84ea2`, the same source and build digests, Node v22.23.3 and TypeScript
7.0.2.

| Plan | UTC | Exit | Required | Passed | Failed | Report (`.reference-work/reports/`) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 14:35:15–14:54:46 | 0 | 308 | 308 | 0 | `plan1-full-516e56e1-…` |
| 2 | 14:54:46–15:10:38 | 0 | 174 | 174 | 0 | `plan2-full-3fbd7bc7-…` |
| 5 | 15:10:38–15:56:34 | 1 | 103 | 100 | 3 | `plan5-full-fb58f98f-…` |
| 2A | 15:56:34–16:09:30 | 1 | 104 | 103 | 1 | `plan2a-full-4ef44e5d-…` |

- **Plan 2** also lists 10 superseded, not required records: nine `I2-10` records and `I2-11:reuse-equal`, each naming its Plan 5 counterpart. All nine I2-29 measurement instances passed.
- **Plan 5** failed only `I5-13:hook-latency-s1000`, `I5-13:checked-set-bounded` and `I5-13:cold-open`. Each fails one assertion, "current raw fast measurement evidence is available and verified", because the evidence reader refuses with the S1000 failure-point text above. `I5-13:hook-latency-s500` and the other I5-13 instances passed, as did all eight I5-08 instances, `I5-10:plan2-gate-amended` and `I5-14:plan2-regression`. The latter ran its own same-input amended Plan 2 gate: 174/174 with ten superseded records.
- **Plan 2A** failed only `I2A-12:linux-macos-bytes`, on its one assertion that a macOS counterpart report is present. Its Linux-report assertions passed. `I2A-12:synthetic-500` passed: S500 is recorded as not executed, and no measurement was fabricated. All seven I2A-13 instances passed. Among them, `I2A-13:predecessor-regressions` found Plan 1 still 308/308, and Plans 2 and 5 with no failure outside their recorded closure-baseline rows.

### Final `check:reference`, `diagrams` and `site:build`

These ran after the verifications, without a rebuild (16:09:30–16:09:40, all
exit 0).

- `npm run check:reference`: execution completed, check passed, coverage complete. 15 owners, 56 source files, 5 resources, 318 accesses; 0 errors, 0 warnings, 0 analysis limits; 179 allowed, 0 denied, 139 external.
- `npm run diagrams`: wrote the nine SVGs. The worktree status was identical before and after, so no committed diagram changed.
- `npm run site:build`: installed `ramify.ts@0.2.0` into `site/node_modules` from the packed frozen build: `ramify.ts-0.2.0.tgz`, 492 files, sha256 `675ed7aad80fcee177f2e4b63e54d6537f0a0d2644ace05e79c41a711b10b91e`. The Docusaurus build succeeded.

### Accepted gaps

Four required instances fail on `7df84ea2`. They are accepted as gaps, not
passes:

| Instance | Why it fails | Decided by | Handoff |
| --- | --- | --- | --- |
| `I2A-12:linux-macos-bytes` | The measurements ran on Linux only, so no macOS counterpart report exists | The user's measurement decision of 2026-10-04 (decided question 11 of the [main plan](../main-plan.md)) | [Known limitations](../handoff.md#known-limitations) |
| `I5-13:hook-latency-s1000` | The S1000 session worker exited during the broad retry after a retained-limit refusal, and the daemon kept the dead session | The relay session's option (a), under the user's rule for clear-cut questions; the user may override it | [Known limitations](../handoff.md#known-limitations), [known defects](../handoff.md#known-defects-carried-forward) |
| `I5-13:checked-set-bounded` | Uses the S1000 process | As above | As above |
| `I5-13:cold-open` | Uses the S1000 process | As above | As above |

The user's measurement bounds had already provided for one case: a workload
stopped at its 45- or 60-minute bound would be a waived gap. The S1000
workload was not stopped by its bound; it failed. The final gate's rule in
[execution.md](../execution.md#final-gate) says that a failure other than a
timing predicate fails the gate, so these three gaps rest on the relay's
option (a) alone.

### Protected-file comparison and final handoff identity

`git diff --name-status 33d8a739 7df84ea2` changes these protected documents
(outside `ramify-agent/`):

- the eight specifications the [write-scope review](#write-scope) lists;
- `docs/model/glossary.md`;
- `docs/model/cross-module-importability.principles.md`.

Between `befc5e77` and `7df84ea2`, only `6598a29d` changed protected
documents. It changed `cli-invocation.spec.md`, `module-description.spec.md`,
`glossary.md` and the principles file. The principles change is the one
status sentence the user authorized; no principle changed. The write-scope
review's "No `.principles.md` file changed" therefore holds for `befc5e77`
only. No hunk-by-hunk comparison against the recorded baselines and
approvals was recorded in this run.

The identity handed to iteration 21 is the [final candidate](#final-candidate)
above, with its frozen build, the receipts in `7df84ea2/` and this receipt.

### Second attempt: diagnosis and repair

Outputs of the second attempt are in
`/home/app/ramify-pb1-evidence/a5b377e8/measurements/` (`timeline.txt`, each
recipe's `.stdout`, `.stderr` and `.exit`, and `failed-run-archive/`).

In the fast report, the reference, S100 and X100 hook workloads,
`repeated-edit-plateau`, `hot-warm-memory` and `entry-footprints` passed. Four
rows failed:

- `I5-13:hook-latency-s500`: eight `revision path` assertions. Created saves 5,
  10, 15 and 20 and deleted saves 3, 8, 13 and 18 published on the broad path
  where the recipe expects `membership`.
- `I5-13:hook-latency-s1000`: the workload waited out its ten-minute guard at
  its first "watcher already published" save.
- `I5-13:checked-set-bounded` and `I5-13:cold-open`, only because they use the
  S1000 process.

**Diagnosis** (`/home/app/ramify-pb1-evidence/a5b377e8/fast-diagnosis/`). Both
failures come from the per-context retained-fact limit of 96 MiB. A revision
that would exceed it is refused, the session marks itself stale
(`subs/analysis/src/session-engine.ts:817-820`), and the daemon discards the
revision history and retries once, broad (`context-manager.ts:409-417`).

- On S500 each create or delete adds about 6.88 MB. At each crossing the
  history drops from six revisions to one, and the broad retry takes about 14 s
  against about 2.1 s. The eight retries completed correctly.
- On S1000, body edit 5 crossed the limit at 95.5 MB. The broad retry ran
  about 27.6 s, then the session worker exited (1), and the hook answered
  `analysis-failed: Session worker exited (1)` after 29.0 s. The daemon kept
  the failed session, so every later hook answered `unavailable` in about
  33 ms and nothing published again. This predates the phase (`640583cc`).

The handoff records the [limit](../handoff.md#known-limitations) and the
[defect](../handoff.md#known-defects-carried-forward).

**Repair** (relay-settled option (a): the recipe only; no candidate source
changed; committed as `7df84ea2`):

- `fast-assertions.mjs`: a broad created or deleted revision passes its
  `revision path` assertion only when the workload's daemon telemetry, between
  the write and the publication, shows the context at the previous
  publication with more than one retained revision and retained bytes within
  the reported `maxRetainedBytesPerContext`, then a single retained revision
  while the analysis runs. The headroom left under the limit must also be
  smaller than the largest growth a membership revision of the same workload
  added. The assertion records that evidence. A new row,
  `membership revisions retried broad at the retained-fact limit`, lists the
  accepted cycles. Any other broad revision still fails.
- `fast-workloads.mjs` and `fast-driver.mjs`: a save whose hook answers
  `unavailable`, or whose analysis settles without a new revision, stops the
  workload at once. The workload records `failurePoint`: the phase, cycle,
  hook answer and message, and, from telemetry, the retained bytes and history
  before the reset and the retry's duration. A wait for publication also stops
  once an analysis settles without publishing. The point fails the workload's
  `workload stopped at its measured failure point` assertion.
- `fast.mjs` and `verify-fast-evidence.mjs`: a derived row names each failed
  source process and its failure point, and the reader's refusal carries that
  text.
- `fast-evidence.test.mjs`: three tests, for an accepted retry, rejected broad
  revisions and the stop. `scripts/measurements/README.md` states both rules.

Verification: `node --test scripts/measurements/*.test.mjs` passed, 10 files
and 78 tests; `npm run type-check` exited 0. Over `s500.json` the rule
accepts exactly the eight cycles named above and no other save, and the S500
workload's assertions all pass. Over `s1000.json` the stop triggers first at
body edit 5. It records 95,495,083 retained bytes with five revisions before
the reset, a retry of about 27.7 s from the observed reset to the reply, and
the worker's exit message. These checks ran over the second attempt's saved
data; the recipes themselves ran again only on `7df84ea2`, as recorded
[above](#measurements). There the stop triggered at the same edit with the
same retained bytes.
