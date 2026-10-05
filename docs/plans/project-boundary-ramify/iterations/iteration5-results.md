# Iteration 5 results: legal tooling access for root scripts

**Date:** 2026-10-03. **Status:** implementation receipt. At the time of
writing it awaits the coordinator's review, protected-file comparison and
iteration gate. Changes are uncommitted in the working tree. This slice is
preparation only: it produces no PB1 case. PB1-33 receives partial evidence
at this slice's boundary; its producer is iteration 8, and nothing here
claims that the checker verified a root script import.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit / tree | `db477d50` (tree `e6d5398d…`), clean at assignment |
| Contract revision | `contracts.md` blob `8712aace…`; `cross-module-importability.spec.md` `410e5a65…`; `typescript-source-interpretation.spec.md` `770fd3e8…`; `module-description.spec.md` `27bf7a55…`; `modularity-report.spec.md` `b681c5ca…` (all unchanged) |
| Audit configuration / lockfile | `ramify-audit.json` blob `b59f28f6…`; `package-lock.json` blob `fd3c84ba…` (both unchanged) |
| Working tree at the final reference run | `git diff` sha256 and the sha256 of the new emitter file and this receipt's draft in `diff-before-reference-2.sha256`; status in `status-before-reference-2.txt`; this receipt is finalized afterwards |
| Node | v22.23.3 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration5/` |

The slice ran in two steps. Step 1 produced the inventory and a proposal;
the coordinator reviewed it and decided D1 to D6 (below) before any edit.

## Inventory summary

The symbol-level inventory is `inventory.md` in the evidence directory, with
its raw records in `inventory.json` and its generators in `tools/`. It was
produced with the classic TypeScript 5.6 compiler API over the root
`tsconfig.json` options, following aliases to originals with the checker,
and read availability from the root's ordinary API view `src/.ramify/`.
Auxiliary source uses the root's ordinary profile `[dispatch]`, so that view
is the current-access answer for it.

- In scope: 125 root-owned compiler files outside every `src/`, outside
  `scripts/reference-harness/` and outside `site/`, `examples/`,
  `ramify-agent/` and `.reference-work/`: `scripts/` 111, `docs/**` 11, and
  `vitest.config.ts`, `vite.explorer.config.ts`, `cucumber-viz.config.ts`,
  `ecosystem.config.cjs`. Before the relocation below, no child owned
  compiler source outside its `src/`; after it, presentation owns one file.
- 37 import records from 17 files resolved into other owners' source (93
  binding rows). 21 of those records are `ramify.ts/...` package
  self-references. The toolkit's TypeScript 7 resolves a self-reference
  through `package.json` exports to `dist/**.d.ts` when `dist/` exists, and
  leaves it unresolved when it does not (`tsc --traceResolution`, both
  cases). The other 16 are relative source imports.
- 54 binding rows were not available to root: 29 through relative source
  imports, 25 through self-references.
- 28 records import built output (`dist/`), 4 import the harness tree, 3 are
  same-owner imports into root `src/` (`src/batch.ts`, `src/resident-assembly.ts`),
  none import root `src/tests/`, and 17 are analysis limits (non-literal
  dynamic imports, unresolved specifiers, relative paths into `node_modules`).

## Coordinator decisions applied

| ID | Decision |
| --- | --- |
| D1 | `ramify.ts/*` self-references stay; they are coverage notes, not verified imports. No modularity exposure, no probe rewrite. |
| D2 | Imports of `dist/` stay; excluded-target coverage notes from iteration 9. |
| D3 | `scripts/probes/modularity/markdown.test.ts` is not moved here; it moves into the harness tree in iteration 6, pending the user's confirmation of the one-file inventory delta. |
| D4 | `scripts/emit-diagrams.ts` moves to `subs/presentation/scripts/emit-diagrams.ts`. |
| D5 | `validate-final-contracts.ts` and `scripts/measurements/plan2b.mjs` stay in `scripts/`; the proposed daemon, project and analysis exposures are added. |
| D6 | No declarations; iteration 7 candidates are listed below. |

## Changed behavior

1. **Exposures added** (each re-verified before adding; `npm run check:self`
   passes with complete coverage, so no `exposed-without-companion` finding
   and no inferred-signature note):

   | Owner | Statement | Companions | Tags |
   | --- | --- | --- | --- |
   | daemon | `expose-src describeRuntime, runtimeIdentityPath, RuntimeIdentity from "discovery.ts" to parent` (N6) | `describeRuntime` names `RuntimeIdentity`, in the same statement; `RuntimeIdentity` and the annotated `runtimeIdentityPath` name no project type | daemon `[dispatch]` symbols carry `dispatch`; root is `[dispatch]` |
   | daemon | `expose-src dependencyWait from "service.ts" to parent` (N7) | none (annotated `Readonly<{ intervalMs: number; limitMs: number }>`) | as above |
   | project | `expose-src readPurpose from "purpose.ts" to parent` (P7) | `ModulePurpose`, already visible in analysis (`expose-src * from "interfaces/project.ts"`) and in root (analysis A7) | project is untagged |
   | analysis | `expose-sub parseDescription from descriptions to parent` (A20) | `ParsedDescription`, already visible in root (analysis A6) | `parseDescription` carries `browser` (required symbol), which constrains only `browser` importers; `ParsedDescription` has no required-importer tag |
   | analysis | `expose-sub readPurpose from project to parent` (A20) | `ModulePurpose` (analysis A7) | none |

   Descriptions already exposed `parseDescription` to its parent
   (`subs/analysis/subs/descriptions/module.ramify:5`), so no descriptions
   statement was added. Root re-exposes none of these.
2. **Constant annotations** for the two exposed constants, as the toolkit's
   other exposed constants are annotated: `runtimeIdentityPath: string`
   (`subs/daemon/src/discovery.ts`) and the `dependencyWait` type
   (`subs/daemon/src/service.ts`). Values are unchanged.
3. **Script imports.** Each fixed consumer already imports from the owner's
   file that its exposure names, so no specifier changed:
   `scripts/build-production.ts` from `subs/daemon/src/discovery.js`,
   `scripts/measurements/plan2b.mjs` from `subs/daemon/src/service.ts`,
   `scripts/validate-final-contracts.ts` from
   `subs/analysis/subs/descriptions/src/parse.js` and
   `subs/analysis/subs/project/src/purpose.js`.
4. **Relocation (D4).** `scripts/emit-diagrams.ts` is now
   `subs/presentation/scripts/emit-diagrams.ts`, presentation's own auxiliary
   source under presentation's ordinary profile `[ui, browser]`. Changes
   against the old file (`emit-diagrams-move.diff`): the import becomes
   `../src/index.js`, the project root is three levels up, and the header
   says it is presentation's own source. `npm run diagrams` runs the new
   path; `tsconfig.scripts.json` includes `subs/presentation/scripts/**/*`, so
   `npm run type-check` still checks it; the presentation README describes it
   after the purpose paragraph; `emitted-diagrams.test.ts` names the new path.
   No other reference to the old path exists outside `ramify-agent/` and
   `docs/plans/done/`. Its imports: node builtins, `react`,
   `react-dom/server` (packages) and 15 bindings from presentation's own
   `src/index.ts`, every original of which is in presentation's ordinary
   `src/` (no `src/tests/`). All are same-owner or external; none needs
   exposure.
5. **Reviewed selections.** `scripts/validate-final-contracts.ts` gains the
   named layer "Phase 1 project boundaries (root tooling access)" for the
   five statements above. `descriptions.test.ts` lists the new statements in
   the toolkit's analysis, project and daemon fixtures, in file order.
   `scripts/reference-harness/final-contracts.test.ts` expected the daemon's
   exact layer list; it now includes the new layer.
6. **`scripts/production-selection.ts`** is unchanged: it imports
   `acquireInventory` and the `AcquisitionLimits` and `InventorySnapshot`
   types from `subs/analysis/src/inventory-entry.ts`, the
   `ramify.ts/analysis/inventory` public analysis entry, and
   `createDefaultTagRegistry` from the model index. All four are available to
   root (analysis:20; analysis:17; project:6 with analysis:10; model:7 with
   analysis:4).

## Access map for root scripts

**Available by exposure** (relative source imports; the root view
`src/.ramify/` after the final build lists each; `root-view-excerpts.md`):

| Importer | Bindings | Chain to root |
| --- | --- | --- |
| `scripts/build-production.ts:6` | `describeRuntime`, `runtimeIdentityPath`, `RuntimeIdentity` (type-only) | daemon N6 to parent (root) |
| `scripts/measurements/plan2b.mjs:14` | `dependencyWait` | daemon N7 to parent (root) |
| `scripts/validate-final-contracts.ts:8` | `parseDescription` | descriptions:5 to parent (analysis); analysis A20 to parent (root) |
| `scripts/validate-final-contracts.ts:10` | `readPurpose` | project P7 to parent (analysis); analysis A20 to parent (root) |

Already available before this slice (relative source imports, unchanged):
`production-selection.ts` (above); `plan2b.mjs:12` and `plan2c.mjs:8`
`openRetainedSession` (analysis:30); `plan2b.mjs:242` and `plan2c.mjs:9`
`createDefaultTagRegistry`; `validate-final-contracts.ts:7` `validateProject`
(analysis:16) and `:9` `DescriptionDocument` (type-only; descriptions:6 with
analysis:7).

**Same-owner** (legal by ownership): `plan2b.mjs` and `plan2c.mjs` into root
`src/batch.ts` and `src/resident-assembly.ts`; 165 root auxiliary-to-auxiliary
records; and, for presentation, `subs/presentation/scripts/emit-diagrams.ts`
into presentation `src/`.

**Coverage notes, not verified imports:**

- D1, `ramify.ts/*` self-references (21 records): `scripts/measurements/common.mjs:22`,
  `repeated.mjs:65`, `resident-driver.mjs:7`, `session-setup.mjs:6`;
  `scripts/probes/dependency-analyzer/measure.ts:21,115,178`;
  `scripts/probes/modularity/baseline.ts:25,89,90`, `git-history.ts:12`,
  `markdown.ts:10`; `scripts/probes/plan2a/scale-baseline.ts:38,45,63,91`,
  `token-format.ts:30,39,40,67`. Their originals' availability is in
  `inventory.md`; 25 bindings (`projectModularity`,
  `projectChangeAffinity`, `projectDependencyDiagram`, modularity types) are
  not exposed to root, and stay so by D1.
- D2, built output (28 records, listed in `inventory.md` section B):
  `scripts/probes/fast-check/*` (24),
  `scripts/measurements/resident-daemon.mjs:202`, `resident-workloads.mjs:6`
  (daemon codec internals), `scripts/probes/fixtures/warm-recompute-worker.mjs:43`
  and `scripts/spikes/bun-cli-startup/entry.mjs:17`.
- Other limits (17): non-literal dynamic imports in `scripts/memory-probe.mjs`
  and five `docs/**` probes; unresolved `cucumber-viz/config`,
  `typescript/package.json`, `bun/package.json` and the probe fixture alias
  `@probe/originals.js`; relative imports into `node_modules` in three
  `scripts/probes/fast-check/*` files.

**Denied once enforced, owned by iteration 6:** `scripts/probes/modularity/markdown.test.ts`
imports `projectModularity` and three modularity types (not exposed to root)
and four bindings of analysis's testing fixture
`subs/analysis/src/tests/modularity-fixture.ts`. A `.test.ts` name outside
`src/tests/` creates no testing classification, so the testing-source import
is denied for ordinary auxiliary source. It moves into the harness tree in
iteration 6 (D3). No root script imports root `src/tests/`.

The recomputed inventory after the final build (`inventory-after.json`,
`after-summary.txt`) leaves exactly these: the D1 self-reference bindings,
`markdown.test.ts`, and two namespace forms the tool does not resolve
(`plan2b.mjs:242`, which selects the available `createDefaultTagRegistry`,
and `measure.ts:115`, a D1 self-reference).

## Remaining harness crossings for iteration 6

Root scripts importing the harness tree: `validate-final-contracts.ts:11`
(`validationInputs`), `scripts/measurements/plan2a-platform.mjs:9`
(`writeMaterializeFixture`, `materializeFixtureFiles`), `plan2b.mjs:11`
(`copyProject`, `readViewTree`, `specifiedArchitectLimits`,
`withoutRevision`), `plan2c.mjs:7` (`specifiedArchitectLimits`). Plus D3's
`markdown.test.ts` move.

The harness imports root scripts outside the tree 20 times
(`harness-reverse.txt`): `validate-final-contracts.ts` from four files,
`measurements/materialize.ts` from eight, `compiled-client.ts` and
`production-selection.ts` from two each, and `build-production.ts`,
`production-artifacts.ts`, `probes/fixtures/hundred-owners.ts` and
`probes/fixtures/synthetic-owners.ts` from one each.

## Candidates for iteration 7 (not declared)

- `scripts/probes/fixtures/compiler-api/` and
  `scripts/probes/fixtures/plan2a-symbol-details/`: source-shaped fixture
  projects with their own `tsconfig.json`, `src/` directories and, for the
  first, an unresolved `@probe/*` alias.
- `docs/**` compiler source (11 files under `docs/analysis/` and
  `docs/plans/*/probes|evidence/`): evidence and reproduction scripts that
  become root auxiliary source with only coverage notes.
- `scripts/probes/fast-check/` and `scripts/spikes/`: historical probes whose
  imports are built output or `node_modules` paths (D2 coverage).

## Commands and results

vitest, build, self-check, materialization and reference runs held
`/tmp/ramify-audit-tests.lock`. Materialization used a private endpoint
directory `/tmp/pb1-it5-endpoint` and stopped its daemon explicitly.

| Command | Result | Evidence |
| --- | --- | --- |
| `git diff --check` | Exit 0; the new untracked file has no trailing whitespace | `diff-check.log` |
| `npm run type-check` | Exit 0 (four compiler scopes, including the relocated emitter) | `type-check.log` |
| `npm run build` | Exit 0 | `build.log` (step 1: `build-step1.log`) |
| `npm run check:self` | Exit 0: passed, complete; 15 owners, 457 source files, 17 resources, 7017 accesses, 0 errors, 0 warnings, 0 analysis limits, 4908 allowed, 0 denied, 2109 external | `check-self.log` |
| `npm run diagrams` | Exit 0; nine SVGs written; `git status site/` clean and all nine sha256 equal to the committed files | `diagrams.log`, `diagrams-before.sha256` |
| `ramify materialize --view architect --view api --from src`, then `--view api --from subs/presentation/src` | Exit 0; the root view lists all six newly exposed symbols. The generated API views were archived and then removed (see the first reference run) | `materialize-step2.log`, `root-view-excerpts.md`, `api-views-step2.tgz` |
| `npx vitest run subs/analysis/subs/descriptions/src/tests/descriptions.test.ts subs/presentation/src/tests/emitted-diagrams.test.ts` | Exit 0, 2 files, 42/42 | `vitest-descriptions-presentation.log` |
| `npx vitest run subs/daemon/src/tests/` | Exit 0, 21 files, 248/248 | `vitest-daemon.log` |
| `npx vitest run subs/analysis/subs/project/src/tests/` | Exit 0, 11 files, 270/270 | `vitest-project.log` |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/final-contracts.test.ts` | Exit 0, 12/12 | `vitest-final-contracts.log` |
| `npx tsx scripts/validate-final-contracts.ts` | Exit 1, pre-existing (gap 1) | `validate-final-contracts.log` |
| Same at `db477d50` in a scratch copy (`git archive`) | Exit 1, the same five owner messages plus a missing `dist/` | `validate-final-contracts-HEAD.log` |
| Full drift detail, worktree versus `db477d50` (`tools/final-drift.mts`) | Identical output: this slice adds no drift and its layer matches its statements | `final-drift-worktree.txt`, `final-drift-HEAD.txt` |
| `npm run reference:cases`, first run | Exit 1: 389/390; `self.test.ts` "checks the real toolkit …" failed on "all toolkit runtime, owned tests and resources inventoried": the case copies the checkout and lists files under `src/`, which included the gitignored API views this slice had materialized in the worktree (`src/.ramify/`, `src/tests/.ramify/` and presentation's), while the inventory excludes generated paths | `reference-cases-1.log` |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/self.test.ts`, after removing those four generated directories | Exit 0, 2/2 | `vitest-self.log` |
| `npm run reference:cases` (final, after the final build, views removed) | Exit 0: 36 files, 390/390, 340.19 s (started 15:17:48 local) | `reference-cases-2.log` |

No `*.test.mjs` file changed, so no `node --test` run was needed. The
measurement and probe scripts were type-checked, not run.

## Protected documents

No `.principles.md` or `.spec.md` file was edited: `sha256sum -c` of the 11
tracked toolkit files against `db477d50` passes (`protected-baseline.sha256`,
`protected-check.log`). No patch is proposed:
`docs/architecture/modularity-report.spec.md` holds no statement this slice
makes false. Out-of-date statements there that this slice does not change,
for the coordinator:

- "Probe and Git adapter": "`scripts/` has its own compiler scope … so the
  probe neither becomes module-owned source nor produces outside-module
  warnings". Under the adopted whole-tree ownership the probe is root-owned
  auxiliary source; it becomes analyzed in iteration 8.
- The same paragraph's "Existing probes import built package output" stays
  true; D1 and D2 keep it so, as coverage notes.

## Remaining gaps

1. `npx tsx scripts/validate-final-contracts.ts` fails at `db477d50` and in
   this candidate with the same output: root, analysis and daemon selections
   lack layers for exposures added by earlier plans (for example the
   affected-module vocabulary), and the cli and contexts README purposes
   differ from their reviewed text. This slice neither causes nor fixes it.
2. The checker does not yet analyze root auxiliary source, so the access map
   above is shown by exposure chains and the materialized view, not by a
   check. Iteration 8 inventories it; iterations 9 to 11 decide it.
3. Self-reference resolution depends on whether `dist/` exists (excluded
   target with it, unresolved without). Both are coverage notes; iteration 9
   owns the target classification.
4. `readPurpose` changes from internal to exposed in the architect view.
   Plan 2B's agent trial key D5 (`docs/plans/iteration-2b-generated-views/test-cases.md`)
   records its role as internal; its answer, that `explorer` cannot import
   it, still holds because root does not re-expose it. Recorded trial
   evidence is not rewritten.
5. The relocated emitter is presentation-owned auxiliary source. From
   iteration 8 its imports are analyzed under presentation's profile, and
   production selection must keep excluding auxiliary source as inventory
   grows (iteration 8's existing item).
6. The harness self case (`self-cases.ts`, "all toolkit runtime, owned tests
   and resources inventoried") lists every file beneath `src/` of a copied
   checkout, including materialized API views, which the inventory excludes
   as generated. A checkout with `src/.ramify/` present fails that case. This
   slice removed the views it generated before the final run; the case
   itself is unchanged.

## Coordinator review

The coordinator reviewed the inventory before any exposure edit and decided:
the package self-references and the imports of built output stay coverage
notes; five symbols gain an exposure to the root for two root scripts, and
the root re-exposes nothing; the diagram emitter moves into presentation,
whose profile its imports need; `markdown.test.ts` is left for iteration 6,
pending the user's decision on the harness inventory. The coordinator then
reviewed the added statements, annotations and relocation. No protected
document changed. The standalone `validate-final-contracts.ts` failure
predates this phase and is not repaired here; the Plan 2B agent-trial answer
key stays as historical evidence. The harness self case's sensitivity to
materialized `src/.ramify/` views in the checkout is noted for the slice that
changes discovery. The iteration gate runs on the committed candidate and its
result is recorded in the evidence directory named by that commit.
