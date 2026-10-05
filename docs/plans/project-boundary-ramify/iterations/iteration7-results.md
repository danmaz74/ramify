# Iteration 7 results: toolkit declarations and compiler exclusions

**Date:** 2026-10-03. **Status:** implementation receipt. At the time of
writing it awaits the coordinator's review, protected-file comparison and
iteration gate. Changes are uncommitted in the working tree. This slice is
preparation only: it produces no PB1 case. PB1-03, PB1-05, PB1-09, PB1-11,
PB1-32 and PB1-40 receive partial evidence at this slice's boundary; their
producers are iteration 8 (PB1-40: iteration 21).

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit / tree | `0526c3ec` (tree `8f7f7261…`), clean at assignment |
| Contract revision | `contracts.md` blob `dd1db614…`; `module-description.spec.md` `27bf7a55…`; `cross-module-importability.spec.md` `410e5a65…`; `typescript-source-interpretation.spec.md` `770fd3e8…` (all unchanged) |
| Unchanged configuration | `package.json` `181572f1…`, `package-lock.json` `fd3c84ba…`, `ramify-audit.json` `b59f28f6…`, `.gitignore` `1000d924…`, `tsconfig.build.json`, `scripts/reference-harness/tsconfig.json` `4cde7156…`, `scripts/reference-harness/vitest.config.ts` `a6b8f87e…`, `scripts/probes/modularity/vitest.config.ts` `0cb0bc68…`; nothing under `examples/`, `site/` or `ramify-agent/` (`git diff --quiet` over all of them) |
| Changed files | `module.ramify`, `tsconfig.json`, `tsconfig.portable.json`, `tsconfig.scripts.json`, `vitest.config.ts`, `scripts/validate-final-contracts.ts`, `scripts/reference-harness/plan2b-cases.ts`, `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`; new `subs/analysis/src/tests/toolkit-boundaries.test.ts` and this receipt |
| Working tree at the reference run | `git diff HEAD` sha256 and the new test's sha256 in `diff-before-reference.sha256`; status in `status-before-reference.txt`, compared after the run (`status-after-reference.txt`); this receipt is written afterwards |
| Node | v22.23.3; Vitest 4.1.11; TypeScript 7.0.2 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration7/` |

## Declarations

The root description keeps its marker and gains eleven nested-tree
statements, as the user decided them on 2026-10-03, between the header and the
first exposure:

```ramify
owned-ignored "docs"
owned-ignored "examples/collection-review"
owned-ignored "scripts/probes/fixtures/compiler-api"
owned-ignored "scripts/probes/fixtures/plan2a-symbol-details"
owned-ignored "scripts/reference-harness"
owned-ignored "site"

external ".cucumber-viz"
external ".history"
external ".playwright-mcp"
external ".reference-work"
external "ramify-agent"
```

`scripts/probes/fast-check/` and `scripts/spikes/` are not declared, and
`examples/collection-review/.reference-work` lies inside the example's tree.
No other module gains a declaration.

**Validity against the specification.** Every statement parses, and every
declaration enters the ownership table without a `problem`: none escapes,
lies in a child module, is an external tree under `src/`, names or lies beneath
an always-excluded path, or overlaps another. The filesystem rules discovery
does not apply yet also hold in this checkout (`declaration-filesystem.txt`):
the six owned-ignored directories and every directory between them and the root
are real directories, not symbolic links; `ramify-agent` and `.reference-work`
exist as real directories; `.cucumber-viz`, `.history` and `.playwright-mcp`
are absent, which an external declaration allows. The audit's fresh checkout
lacks all four tool directories until a build writes `.reference-work`.

**Verification through the ownership table.** From the built CLI,
`ramify check --root . --batch --format json --no-snapshot` (exit 0, passed,
complete) reports exactly 27 `scope.ownership.exclusions`
(`check-json-after-exclusions.txt`):

| Kind | Directories | Owner |
| --- | --- | --- |
| `external` | `.cucumber-viz`, `.history`, `.playwright-mcp`, `.reference-work`, `ramify-agent` | none |
| `owned-ignored` | `docs`, `examples/collection-review`, `scripts/probes/fixtures/compiler-api`, `scripts/probes/fixtures/plan2a-symbol-details`, `scripts/reference-harness`, `site` | `ramify` |
| `output` | `dist` | none |
| `scratch` | `src/tmp` and `<module>/src/tmp` for each of the 14 child modules | that module |

Before this slice the same command reported the 16 scratch and output
exclusions only (`check-json-before.json`).

The new toolkit test `subs/analysis/src/tests/toolkit-boundaries.test.ts`
acquires the toolkit's own committed descriptions with `acquireInventory`, as
the self-check does, and states its expectations from the decided list:

- the owned-ignored and external exclusions are exactly the eleven decided
  declarations, with owner `ramify` for owned-ignored and none for external,
  and every other exclusion is a module's scratch directory or `dist`;
- `classifyProjectPath` places representative paths inside each of the eleven
  trees in that tree (owned by `ramify` with the owned-ignored exclusion, or
  excluded as external), including the example's own `.reference-work` inside
  the example's tree and the harness's package-consumer fixture inside the
  harness tree;
- controls stay ordinary: `examples/hooks/`, `scripts/probes/fixtures/synthetic-owners.ts`,
  `scripts/probes/fast-check/`, `scripts/spikes/`, `scripts/validate-final-contracts.ts`,
  `plans/` and the near-miss names `scripts/reference-harness-notes.md` and
  `docs.md` are root-owned without an exclusion; a project module path keeps
  its module; `src/tmp/…` keeps the root with its scratch exclusion; `dist/…`
  is excluded output.

A negative control removed `external ".history"` from the description: both
tests failed, and the description was restored byte-identically
(`vitest-negative-control.log`).

`descriptions.test.ts` now lists the eleven statements, by kind and decoded
directory, first among the root's reviewed statements.
`scripts/validate-final-contracts.ts` gains a named layer, "Phase 1 project
boundaries (toolkit nested trees)", adding the eleven statements to the root.
Its exit and messages are identical to before this slice (the pre-existing
iteration 5 gap 1), and the full drift detail (`tools/final-drift.mts`) is
byte-identical before and after, so the layer matches the description exactly.

## The baseline build in AV34

The first locked `reference:cases` run failed one case: `plan2b.test.ts`,
"publishes the same API view without --view as the build before Plan 2B, byte
for byte" (AV34), with the baseline build exiting 2 on the toolkit copy
(`reference-cases-1.log`). The case runs `ramify materialize --all` with a
build of the pre-Plan 2B baseline commit, whose parser predates the
nested-tree statements, as it predates the root marker. Iteration 3A's
adaptation already removes the marker from the copy's module line for that
build; `apiViewIdentity` in `scripts/reference-harness/plan2b-cases.ts` now
also removes the root's `owned-ignored` and `external` lines for that build
only, and the current build reads the copy as written. API views carry no
description bytes and cover module source only, so the byte comparison is
unchanged. No case, instance, count or expectation changed; the reference
copy has no such lines, so its input is unchanged. The case passes alone
(`vitest-av34.log`: 2 passed, 4 skipped by `-t AV34`) and in the final run.

## What the self-check does with each declared tree today

Discovery does not prune declared trees before iteration 8. The JSON report's
`scope.independentScopes` is identical before and after this slice:
`examples/collection-review`, `ramify-agent`,
`scripts/probes/fixtures/compiler-api`,
`scripts/probes/fixtures/plan2a-symbol-details`, `scripts/reference-harness`
and `site`.

| Tree | Today | Iteration 8 change |
| --- | --- | --- |
| `site`, `examples/collection-review`, `scripts/reference-harness`, both probe fixtures | Skipped as inferred independent scopes: each holds a `tsconfig.json` and the root configuration selects none of its files | Pruned by declaration instead; the inference is removed |
| `ramify-agent` | Skipped as an inferred independent scope | Pruned by declaration, unowned |
| `docs` | Walked: it holds no `tsconfig.json`, so discovery reads every directory beneath it. It holds no description, and no file outside a module's `src/` is inventoried, so it contributes nothing | Pruned; its 11 compiler-source files never become root auxiliary source |
| `.reference-work` | Not entered: the inventory's special case for `.reference-work` with the root configuration's `**/.reference-work` exclusion, which this slice keeps | Pruned by declaration; the special case is removed |
| `.history`, `.cucumber-viz`, `.playwright-mcp` | Absent in this checkout. Where present they hold no `tsconfig.json`, so discovery would walk them and interpret any description inside | Pruned by declaration |

The self-check's counts change only by the new test file: 15 owners, 458
source files (457 before), 17 resources, 7027 accesses (7017), 4914 allowed
(4908), 0 denied, 2113 external (2109), 0 errors, 0 warnings, 0 analysis
limits.

## Re-inventory

`reinventory.txt` records the method and findings across every module,
tracked and untracked (`inventory-tracked-markers.txt`,
`inventory-worktree-markers.txt`).

- Directories with a `package.json`, `tsconfig.json` or `module.ramify` that
  are not a module's own directory: `site`, `examples/collection-review`,
  `scripts/reference-harness` (and its `fixtures/module-tree-consumer`, inside
  it), the two probe fixtures, `ramify-agent` and the 326 marker files under
  `.reference-work`. All are declared or inside a declared tree. No child
  module has a manifest or compiler configuration.
- Compiler source outside every module's `src/` and outside the declared
  trees: four root configuration files, `examples/hooks/`, `scripts/`,
  `scripts/measurements/`, the probes outside the two fixtures (including
  `fast-check/` and the single-file generators in `fixtures/`),
  `scripts/spikes/bun-cli-startup/` and `subs/presentation/scripts/`. Each is a
  runnable script or generator, not a package, project or data tree.
- Plain data outside `src/` (results, candidates, `plans/`, skills, editor and
  container configuration) needs no declaration. No `.ramify` file other than
  `module.ramify` exists, and no `src/` directory outside a module other than
  the two fixtures'.

Nothing outside the decided set needs a declaration, and nothing in the
decided set is rejected by the validity rules.

## Compiler and runner exclusions

| Configuration | Change | Effect |
| --- | --- | --- |
| `tsconfig.json` | Excludes `src/tmp` and `subs/**/src/tmp` | Scratch is not compiler-selected. Existing exclusions, including `**/.reference-work`, are kept |
| `tsconfig.portable.json` | Excludes `subs/**/src/tmp` | As above for the four portable owners; the `src/tests/` exclusion is kept |
| `tsconfig.scripts.json` | Excludes the two owned-ignored probe fixtures, `src/tmp` and `subs/**/src/tmp` | The scope loses exactly the seven fixture files (1257 → 1251 with the new test; `scripts-scope-delta.txt`). The probes still read the fixtures by path with their own configurations; `npm run type-check` no longer type-checks them |
| `vitest.config.ts` | `exclude: [...configDefaults.exclude, 'src/tmp/**', 'subs/**/src/tmp/**']` | No test runs from scratch; Vitest's default exclusions are kept |

Unchanged: `tsconfig.build.json` (the production build supplies an explicit
inventory-derived file list), the harness's `tsconfig.json` and
`vitest.config.ts` (R6), and the modularity probe's Vitest configuration, whose
selection contains no scratch or declared tree. `.gitignore` is unchanged. No
other toolkit runner walks the tree with its own selection:
`vite.explorer.config.ts` builds from `subs/explorer`, `ecosystem.config.cjs`
starts processes without watching, and `ramify-audit.json` was not touched.

**Selection probe** (`scratch/selection-probe/`, `selection-probe-tsc.txt`,
`selection-probe-vitest.txt`, and `…-before…` for the base configurations): a
mock tree with files in `src/tmp`, `src/tests/tmp`, `src/tools/tmp` and the
same three places in nested modules, `subs/x/tools/tmp`, both probe fixtures,
a harness file and other scripts. With the new configurations no compiler scope
or Vitest selects a scratch file and the scripts scope selects neither fixture,
while `src/tests/tmp` and `src/tools/tmp` stay selected in their scopes
(PB1-09's ordinary paths). Against the base configurations, the scratch files
and fixtures were selected. The real toolkit holds no `tmp` directory, so
`tsconfig.json`'s and `tsconfig.portable.json`'s selections change only by the
new test file, and the toolkit Vitest inventory goes from 182 to 183 files,
exactly the new test (`toolkit-files-comparison.txt`).

The patterns rely on module positions: `subs/**/src/tmp` would also match a
directory named `src/tmp` nested beneath an ordinary directory named `src`
inside a module's own source, which the toolkit does not have.

## Generated and work directories

| Directory | Treatment |
| --- | --- |
| `.ramify`, `.ramify-architect` and their `.tmp-<suffix>`/`.old-<suffix>` siblings (and marker files) at any depth | Always-excluded (generated) |
| `dist/`, including `dist/explorer` from the explorer build | Always-excluded (compiler output directory) |
| `node_modules/` at any depth, including `node_modules/.vite` | Always-excluded (installed packages) |
| `.git` | Always-excluded (repository metadata) |
| `src/tmp` of each module | Always-excluded scratch, owned by that module; absent in this checkout |
| `.reference-work/` at the root (production staging, harness and measurement work) | Declared external |
| `.history/`, `.playwright-mcp/`, `.cucumber-viz/` | Declared external; absent here |
| `examples/collection-review/.reference-work/`, the example's `dist/` and `node_modules/` | Inside the declared example tree |
| `site/build/`, `site/.docusaurus/` | Inside the declared site tree |
| `docs/**/evidence/` and other planning output | Inside the declared `docs` tree |
| `scripts/measurements/results/`, `scripts/probes/results/`, `scripts/spikes/fast-check/results/` | Neither: committed plain data, root-owned and inert |
| `*.viz.feature.meta/` (cucumber-viz) | Neither; would appear beside feature files, which exist only inside the example's tree |
| `cucumber-viz.config.local.json`, `.devcontainer/.env` | Neither: plain files, not directories |

## Commands and results

Build, test, self-check and reference runs held `/tmp/ramify-audit-tests.lock`.
No API or architect view was materialized; `src/.ramify/` was absent before the
reference run.

| Command | Result | Evidence |
| --- | --- | --- |
| `git diff --check` | Exit 0 | `diff-check.log` |
| `npm run build` (base, before edits) | Exit 0 | `build-before.log` |
| `ramify check --root . --batch --format json --no-snapshot` (base) | Exit 0; 16 exclusions | `check-json-before.json` |
| `npx tsx scripts/validate-final-contracts.ts` | Exit 1, before and after, identical output (pre-existing iteration 5 gap 1) | `validate-final-contracts-before.log`, `validate-final-contracts.log` |
| `tools/final-drift.mts` | Identical before and after | `final-drift-before.txt`, `final-drift-after.txt` |
| `npx vitest run` on the new test and `descriptions.test.ts` | Exit 0, 2 files, 33/33 | `vitest-focused-1.log` |
| Negative control (`external ".history"` removed) | Exit 1, both new tests fail; description restored | `vitest-negative-control.log` |
| `npm run type-check` | Exit 0, all four scopes | `type-check.log` |
| `tsc --listFilesOnly` per scope | scripts 1251, toolkit 1031, portable 228 | `*-scope-files-after.txt` |
| `vitest list --filesOnly` | 183 files, +1 (the new test) | `toolkit-files-comparison.txt` |
| `npm run build` | Exit 0 | `build.log` |
| `npm run check:self` | Exit 0: passed, complete; 15 owners, 458 source files, 17 resources, 7027 accesses, 0 errors, 0 warnings, 0 analysis limits, 4914 allowed, 0 denied, 2113 external | `check-self.log` |
| `ramify check --root . --batch --format json --no-snapshot` | Exit 0, passed, complete; the 27 exclusions above | `check-json-after.json`, `check-json-after-exclusions.txt` |
| `ramify check --batch --format json --no-snapshot` from `site/`, `docs/`, `scripts/reference-harness/` | Exit 0 each; root `/home/app/ramify-pb1`, selection `found`, passed, 15 owners, 0 errors, 0 warnings | `check-from-subdirs.txt`, `check-from-*.json` |
| The same from `examples/collection-review/` | Exit 0; root `…/examples/collection-review`, selection `found`, passed, 15 owners, 0 errors, 2 warnings (the example's own `vite.config.ts` and `vitest.config.ts` outside module source, unchanged by this slice) | as above |
| `npx vitest run subs/analysis/subs/descriptions/src/tests/` | Exit 0, 6 files, 292/292 | `vitest-descriptions.log` |
| `npx vitest run subs/analysis/src/tests/` | Exit 0, 40 files, 461/461 | `vitest-analysis.log` |
| `npx vitest run` on the 20 root `src/tests/*.test.ts` files, named explicitly | Exit 0, 20 files, 103/103 | `vitest-root.log` |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts` on `final-contracts.test.ts`, `self.test.ts` | Exit 0, 2 files, 14/14 | `vitest-focused-harness.log` |
| `npm run reference:cases`, first run (after the final build) | Exit 1: 37 files, 392/393; AV34 failed as described above | `reference-cases-1.log` |
| `npx tsc -p scripts/reference-harness/tsconfig.json` after the AV34 adaptation | Exit 0 | `type-check-harness.log` |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan2b.test.ts -t AV34` | Exit 0, 2 passed, 4 skipped | `vitest-av34.log` |
| After the AV34 adaptation and a comment-only description edit: `npm run check:self`; the new test and `descriptions.test.ts`; `validate-final-contracts.ts`; drift detail | Exit 0 with the same counts; exit 0, 33/33; exit 1 with output identical to before; drift identical | `check-self-final.log`, `vitest-focused-final.log`, `validate-final-contracts-final.log`, `final-drift-final.txt` |
| `npm run reference:cases`, final run | Exit 0: 37 files, 393/393, 340.10 s (started 16:59:37 local); the same 40 `ExperimentalWarning` lines as iteration 6. Tracked diff identical before and after (`diff-before-reference.sha256`, `diff-after-reference.sha256`) and status unchanged | `reference-cases.log` |

## Protected documents

No `.principles.md` or `.spec.md` file changed (`protected-changed.txt` is
empty), and no patch is proposed.

## Documents

No non-protected layout document became false: the owner READMEs and
`docs/development` describe no toolkit boundary that this slice changes, and
the harness README already names this declaration. Teaching pages for
iteration 19, not edited: `README.md`'s "Layout" section lists `docs/`,
`examples/`, `scripts/reference-harness/` and `site/` without their
declarations; `CLAUDE.md`'s "ramify-agent is a separate project" says the
toolkit's `tsconfig.json` excludes it, but not that the root declares it
external. No `site/` page describes the toolkit's own layout.

## What iteration 8 still lacks

- Pruning declared trees before descent, removing the independent-scope
  inference and the `.reference-work` special case, the filesystem validity
  rules and the issue codes for invalid declarations.
- Toolkit copies that keep the root description but omit owned-ignored trees
  become invalid once a missing owned-ignored directory is an error:
  `src/tests/dependency-diagram-daemon.test.ts` (`copyToolkit` copies `src`,
  `subs` and root files only), `scripts/measurements/plan2b-views.ts`
  (`copyProject` omits `examples` and `site`), `scripts/measurements/plan2a-fixtures.mjs`,
  `subs/integration-tests/src/browser-acceptance.ts`, and the harness's
  `plan2a-workflow-cases.ts` and `plan2a-completion-cases.ts`, which omit
  `site` and `examples`. Each passes today.
- Once root auxiliary source is analyzed, the scripts listed under the
  re-inventory become root (or presentation) auxiliary source; `docs/**`
  source does not, because it is declared.
- The example's own `tsconfig.json` and `vitest.config.ts` select every
  `src/` beneath it, including any future `src/tmp`. The example is a
  separate project inside a declared tree and its configuration feeds the
  reference harness's reviewed inputs, so this slice did not change it.

## Gaps for the coordinator

1. `npm run type-check` no longer type-checks the two probe fixture projects,
   which the scripts scope previously selected. Their own `tsconfig.json`
   files remain; no command runs them.
2. `validate-final-contracts.ts` still exits 1 for the pre-existing drift of
   five owners (iteration 5 gap 1); the new layer adds none.
3. The example's configuration (above) is reported, not changed.
4. The AV34 adaptation edits a case implementation inside the harness tree,
   as iteration 3A did for the marker; R6 keeps the harness's configuration,
   runner and commands, which are unchanged. Iteration 8 should keep the
   adaptation when the toolkit copy in `copyProject` must also contain the
   owned-ignored trees it now omits (`examples`, `site`).
5. After the first reference run, the first comment of the root
   description's declarations was reworded (the site is its own package, not
   a project); the statements are unchanged. The final run covers it.

## Coordinator review

The coordinator reviewed the eleven declarations against the user's decided
set, the compiler and runner exclusions, the new toolkit test and the AV34
adaptation. No protected document changed. Extending iteration 3A's
adaptation in `apiViewIdentity` is accepted under R6: the baseline build
predates the statements, no case, count, instance or expectation changes, and
API views cover module source only. The two probe fixture projects leaving
`npm run type-check` follows from their declaration as owned-ignored data.
The copies that omit owned-ignored trees while keeping the root description
are handed to iteration 8, where a missing owned-ignored directory becomes an
error. The iteration gate runs on the committed candidate and its result is
recorded in the evidence directory named by that commit.
