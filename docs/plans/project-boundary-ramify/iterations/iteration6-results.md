# Iteration 6 results: reference harness boundary preparation

**Date:** 2026-10-03. **Status:** implementation receipt. At the time of
writing it awaits the coordinator's review, protected-file comparison and
iteration gate. Changes are uncommitted in the working tree; the two moves
were made with `git mv`. This slice is preparation only: it produces no PB1
case. PB1-32 receives partial evidence at this slice's boundary; its producer
is iteration 8, after iteration 7 declares the tree.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit / tree | `72c86e14` (tree `b0552847…`), clean at assignment |
| Contract revision | `contracts.md` blob `8712aace…`; `cross-module-importability.spec.md` `410e5a65…`; `typescript-source-interpretation.spec.md` `770fd3e8…`; `module-description.spec.md` `27bf7a55…` (all unchanged) |
| Unchanged configuration | `package.json` `181572f1…`, `package-lock.json` `fd3c84ba…`, `ramify-audit.json` `b59f28f6…`, `tsconfig.json`, `vitest.config.ts`, `scripts/reference-harness/tsconfig.json` `4cde7156…`, `scripts/reference-harness/vitest.config.ts` `a6b8f87e…`, `scripts/probes/modularity/vitest.config.ts` (`git diff --quiet` over all of them) |
| Working tree at the reference run | `git diff HEAD -M` sha256 and the two new files' sha256 in `diff-before-reference.sha256`; status in `status-before-reference.txt`, identical after the run (`status-after-reference.txt`); this receipt is written afterwards |
| Node | v22.23.3; Vitest 4.1.11; TypeScript 7.0.2 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration6/` |

## Importer inventory and removals

The scan (`tools/scan-harness-imports.mjs`, output `scan-before.txt`) covers
every `.ts`, `.mts`, `.cts`, `.tsx`, `.js`, `.mjs`, `.cjs` and `.jsx` file of
the toolkit outside `scripts/reference-harness/`, excluding `ramify-agent/`,
`node_modules/`, `dist/`, `.git/`, `.reference-work/` and `docs/plans/done/`
(641 files at `72c86e14`, 643 after). It resolves the relative specifiers of
static imports and re-exports, side-effect imports, literal `import()`,
`require()`, `import.meta.resolve()` and `new URL(…, import.meta.url)`, lists
every non-literal `import()` form, and lists every textual mention of
`reference-harness`. The package's `exports` map names no harness path and it
has no `imports` map, so no package self-reference reaches the tree.

At `72c86e14` it found exactly the four imports iteration 5 recorded:

| Importer | Bindings | Removal |
| --- | --- | --- |
| `scripts/validate-final-contracts.ts:11` | `validationInputs` from `linking-expectations.ts` | The function moved unchanged (body diff empty) to the new root file `scripts/validation-inputs.ts`. The script imports it from there; `linking-expectations.ts` imports and re-exports it, so `linking-cases.ts` is unchanged. |
| `scripts/measurements/plan2a-platform.mjs:9` | `writeMaterializeFixture`, `materializeFixtureFiles` | `git mv scripts/reference-harness/plan2a-materialize-fixture.ts scripts/measurements/plan2a-materialize-fixture.ts`. The script imports `./plan2a-materialize-fixture.ts`; the harness's `plan2a-cli-cases.ts`, `plan2a-scale-cases.ts` and `plan2a-service-cases.ts` import `../measurements/plan2a-materialize-fixture.js`. |
| `scripts/measurements/plan2b.mjs:11` | `copyProject`, `readViewTree`, `specifiedArchitectLimits`, `withoutRevision` | Moved verbatim, with `ProjectKind`, `ViewFileStat`, `git`, `viewName`, `generatedName` and the private `toolkitExcluded`, to the new root file `scripts/measurements/plan2b-views.ts`. Both measurement scripts import `./plan2b-views.ts`. `plan2b-cases.ts` imports the moved names it still uses (`git`, `viewName` and `generatedName` too, so each is defined once) and loses its now-unused `lstat` import. No harness file imported the moved names from `plan2b-cases.ts`, so nothing re-exports them. |
| `scripts/measurements/plan2c.mjs:7` | `specifiedArchitectLimits` | As above. |

Iteration 5's decision kept `validate-final-contracts.ts` and `plan2b.mjs` in
`scripts/`; `plan2a-platform.mjs` and `plan2c.mjs` stay there too, because
moving the shared helper removes their crossing without moving a measurement
script. `copyProject` computes the toolkit root from its own location, which
is the same directory `plan.ts`'s `repositoryRoot` names.

**Imports of the moved helpers** (`helpers-imports-and-availability.txt`).
`plan2a-materialize-fixture.ts` and `plan2b-views.ts` import Node builtins
only. `validation-inputs.ts` imports `createDefaultTagRegistry` (model
`registry.ts`) and the type `AnalysisInputs` (analysis
`interfaces/analysis.ts`, through `validation-entry.ts`), the two cross-owner
imports `linking-expectations.ts` carried for it. Both are in the root's
ordinary API view `src/.ramify/` that iteration 5 archived from its final
candidate (`api-views-step2.tgz`, extracted to `scratch/it5-views/`); no
`module.ramify` changed since. No new exposure is needed. None of the three
imports any `src/tests/` module; the two `src/tests/` strings in the fixture
are fixture file contents.

**After** (`scan-after.txt`): 0 imports resolve into the tree. The 30
non-literal `import()` forms are the same list before and after; none names
the tree (they build paths from probe settings, scratch fixtures, test
templates or, in `scripts/memory-probe.mjs`, a probe specification's `setup`
path). The remaining textual mentions are comments in `plan2a-platform.mjs`
and `validate-final-contracts.ts` and a test title in
`available-originals.test.ts`.

**Process-level uses by path, not imports:** `package.json` runs
`tsc -p scripts/reference-harness/tsconfig.json` (`type-check`),
`vitest run -c scripts/reference-harness/vitest.config.ts` (`reference:cases`),
`tsx scripts/reference-harness/report.ts` (`reference:report`) and
`tsx scripts/reference-harness/verify.ts` (`reference:verify`), all unchanged.

## Compiler scope

`tsconfig.scripts.json` now excludes `scripts/reference-harness`, which
subsumes the former `scripts/reference-harness/fixtures/module-tree-consumer`
exclusion. `tsc --listFilesOnly`: at `72c86e14` the scope selected 160 harness
files (36 of them test files; `scripts-scope-files-before.txt`, run on a
`git archive` copy); after, 0 of 1257 (`scripts-scope-files-after.txt`).
Outside the tree and `dist/`/`node_modules`, the selection differs only by the
three new helpers and the moved test (`scripts-scope-delta.txt`). The
harness's own `tsconfig.json` still selects the tree (152 files) and also
reaches the three helpers and the probe's `markdown.ts` through imports
(`harness-scope-files-after.txt`); `npm run type-check` passes with all four
scopes.

## The moved probe test (separable)

`scripts/probes/modularity/markdown.test.ts` imports analysis's testing
fixture `subs/analysis/src/tests/modularity-fixture.ts`, which no exposure can
make available to root auxiliary source. Per the coordinator's provisional
decision it moved: `git mv` to
`scripts/reference-harness/modularity-markdown.test.ts`, with its three
specifiers adjusted (`../../subs/analysis/src/index.js`,
`../../subs/analysis/src/tests/modularity-fixture.js`,
`../probes/modularity/markdown.js`). The renderer `markdown.ts` and the rest
of the probe stay: the harness imports the renderer, which is the allowed,
unverified direction.

Where it runs: before, only under `scripts/probes/modularity/vitest.config.ts`
(an explicit command; the toolkit `vitest.config.ts` selects only `src/tests/`
and `subs/**/src/` and the audit runs `npm test`, so the toolkit suite never ran
it, and the audit ignores `scripts/probes/**`). After, under
`npm run reference:cases`. The toolkit suite therefore loses nothing; the
modularity probe's configuration loses the file. The diff is
`markdown-test-move.diff` (the move plus the `docs/development/testing.md`
row); the harness README's last boundary paragraph names it too. Reverting
those three pieces undoes it.

## Test and instance inventory

Captured at `72c86e14` and on the candidate (`inventory-comparison.txt`,
`tools/compare-tests.py`):

| Inventory | Before | After |
| --- | --- | --- |
| Harness reviewed instances (`tools/instance-inventory.mts`: Plan 1 308, Plan 2 176, Plan 2A 104, Plan 5 103, with each record's sha256) and registered handlers (308, 187, 104, 103 with their capability sets) | `instances-before.txt` | `instances-after.txt`, byte-identical (`cmp`) |
| Harness Vitest inventory (`vitest list -c scripts/reference-harness/vitest.config.ts`) | 36 files, 390 entries | 37 files, 393 entries |
| Modularity probe Vitest inventory | 2 files, 8 tests | 1 file, 5 tests |
| Toolkit suite files (`vitest list --filesOnly`) | 182, none under `scripts/` | the same 182 |

The harness inventory is identical except for one named file: no entry is
lost, and the 3 added entries are exactly
`modularity-markdown.test.ts`'s "renders a declared-only document without a
comparison", "renders dependency diagram facts and both endpoint projections"
and "compares each candidate with declared ownership measure by measure and
nests every evaluation", the same titles the probe configuration lost. No
case was deleted or skipped and no reviewed row, count or identity changed.

## README statement

`scripts/reference-harness/README.md` gains a "Project boundary" section
before "Activating an assigned instance": the tree is an owned-ignored tree of
the root that Ramify does not inventory, analyze or view; the root description
declares it from iteration 7 and the checker honors that from iteration 8; its
imports into toolkit internals are a declared, unverified convention; no
analyzed toolkit source imports from it and `tsconfig.scripts.json` does not
select it; the three shared helpers are named; location, compiler and Vitest
configuration and the three commands are unchanged. The measurements README
link and the moved fixture's and `plan2a-platform.mjs`'s comments name the new
fixture path.

## Commands and results

Build, test, self-check and reference runs held `/tmp/ramify-audit-tests.lock`.
No API or architect view was materialized; `src/.ramify/` was absent before
the reference run (`.ramify-architect/` at the root predates this slice and is
gitignored).

| Command | Result | Evidence |
| --- | --- | --- |
| `git diff --check` | Exit 0 | `diff-check.log` |
| `npm run build` | Exit 0 | `build.log` |
| `npm run type-check` | Exit 0, all four scopes | `type-check.log` |
| `tsc -p tsconfig.scripts.json --listFilesOnly` | 0 harness files of 1257 (160 at `72c86e14`) | above |
| `npm run check:self` | Exit 0: passed, complete; 15 owners, 457 source files, 17 resources, 7017 accesses, 0 errors, 0 warnings, 0 analysis limits, 4908 allowed, 0 denied, 2109 external (the same as iteration 5; the check does not yet read `scripts/`) | `check-self.log` |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts` on `modularity-markdown.test.ts`, `linking.test.ts`, `final-contracts.test.ts` | Exit 0, 3 files, 18/18 | `vitest-focused-harness.log` |
| `npx vitest run -c scripts/probes/modularity/vitest.config.ts` | Exit 0, 1 file, 5/5 | `vitest-modularity-probe.log` |
| `node --import tsx scripts/measurements/plan2b.mjs --help` | Exit 0; loads every static import, including `plan2b-views.ts`, then prints usage | `measurement-load.log` |
| `node --check` on `plan2a-platform.mjs`, `plan2b.mjs`, `plan2c.mjs` | Exit 0 each | `measurement-load.log` |
| `node --import tsx` importing the three helpers | Every binding the four importers name is present (`function`/`object`); `validationInputs('.')` returns `project, registry, capabilities, limits` | `measurement-load.log` |
| `npx tsx scripts/validate-final-contracts.ts` | Exit 1, the pre-existing failure (iteration 5 gap 1); output identical to iteration 5's log | `validate-final-contracts.log` |
| `npm run reference:cases` (after the build) | Exit 0: 37 files, 393/393, 339.98 s (started 16:17:13); the same 40 `ExperimentalWarning` lines as iteration 5 | `reference-cases.log` |

`plan2a-platform.mjs` and `plan2c.mjs` were only syntax-checked and their
imported helpers loaded; neither was run, because both run real measurements
(the second writes committed evidence by default). No `*.test.mjs` changed, so
no `node --test` run was needed.

## Protected documents

No `.principles.md` or `.spec.md` file changed (`protected-changed.txt` is
empty), and no patch is proposed.

## What iterations 7 and 8 still need

- Iteration 7: declare `owned-ignored "scripts/reference-harness"` in the root
  `module.ramify`. No toolkit compiler scope other than the harness's own
  selects the tree, and no analyzed file imports from it.
- Iteration 8: when root auxiliary source becomes analyzed,
  `scripts/validation-inputs.ts`, `scripts/measurements/plan2a-materialize-fixture.ts`
  and `scripts/measurements/plan2b-views.ts` are root auxiliary source under
  `[dispatch]`; their only cross-owner imports are the two available ones
  above. PB1-32's "no compiler-selected warning names it" depends on the root
  `tsconfig.json` scope iteration 8 uses, which is not changed here.

## Gaps for the coordinator

1. The brief's premise that the toolkit suite runs `markdown.test.ts` does not
   hold: only the probe's own Vitest configuration ran it. The delta is
   therefore harness +1 file/+3 entries and modularity probe -1 file/-3 tests,
   with the toolkit suite unchanged. The move remains pending the user's
   confirmation.
2. `docs/development/testing.md` is outside the listed source reads; one row
   was edited so it does not name a test that no longer runs where it says.
   It belongs with the separable move.
3. `plan2a-platform.mjs` now records `fixture.source` as
   `scripts/measurements/plan2a-materialize-fixture.ts`. The committed
   `scripts/measurements/results/plan2a-platform-linux.json` still records the
   old path as historical output; no reader compares the field.
4. Every `.mjs`/`.ts` file under `scripts/measurements` is a recipe input of
   the Plan 2A (`plan2a-inputs.mjs`) and resident (`resident-inputs.mjs`)
   measurement identities, so archived measurement evidence no longer matches
   their recipe digests. Source changes in every slice already have that
   effect, and `reference:cases` passes.
5. The scope comparison before used a `git archive` copy without `dist/` and
   after used the worktree with `dist/`. The delta therefore excludes `dist/`
   and `node_modules` paths, whose selection depends on whether `dist/` exists
   (iteration 5 gap 3).

## Coordinator review

Pending.

## Coordinator review

The coordinator reviewed the three helper moves, the compiler-scope change and
the import scan against the brief. No protected document changed. The agent
stalled once on a command that never executed and was resumed from its
transcript; no work was lost. The probe test's move into the tree is the
coordinator's provisional choice, applied as a separable change
(`markdown-test-move.diff`) while the user's decision is pending; the harness
test inventory is otherwise identical, and the toolkit suite never selected
that file. The iteration gate runs on the committed candidate and its result
is recorded in the evidence directory named by that commit; from this slice
`reference:cases` counts 37 files and 393 tests.
