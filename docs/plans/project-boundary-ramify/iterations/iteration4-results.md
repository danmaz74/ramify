# Iteration 4 results: auxiliary provenance vocabulary

**Date:** 2026-10-03. **Status:** implementation receipt. At the time of
writing it awaits the coordinator's review, protected-file comparison and
iteration gate. Changes are uncommitted in the working tree. This slice is
preparation only: it produces no PB1 case. PB1-07, PB1-12, PB1-13, PB1-14,
PB1-15 and PB1-25 receive vocabulary and default evidence only and stay
pending with their producing slices.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit / tree | `97ac0664` (tree `fd034655…`), clean at assignment |
| Contract revision | `contracts.md` blob `8712aace…`; `cross-module-importability.spec.md` `410e5a65…`; `typescript-source-interpretation.spec.md` `770fd3e8…`; `module-description.spec.md` `27bf7a55…`; `modularity-report.spec.md` `20329272…` (all unchanged) |
| Audit configuration / lockfile | `ramify-audit.json` blob `b59f28f6…`; `package-lock.json` blob `fd3c84ba…` (both unchanged) |
| Working tree at the final reference run | `git diff` against `97ac0664` sha256 `c34b2032…` (39 files), plus one new file `subs/analysis/src/tests/provenance-vocabulary.test.ts` (sha256 `7fabb66a…`); this receipt is written afterwards |
| Node | v22.23.3 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration4/` |

## Changed behavior

1. **`SourceOrigin.auxiliary: boolean`** (model `interfaces/model.ts`), required.
   True only for owned compiler source outside its owner's `src/`, which keeps
   the owner's ordinary `area`; false for every origin beneath `src/`.
2. **`InventoryFile.placement: 'src' | 'auxiliary' | 'referenced-resource'`**
   (project `interfaces/project.ts`), required.
3. **`SourceTarget`** (typescript `interfaces/source.ts`):
   - `{ kind: 'outside-project'; file: string }` replaces `outside-module`;
   - `{ kind: 'nested-tree'; file: string; exclusion: ProjectExclusion & { kind: 'owned-ignored' | 'external' } }`;
   - `{ kind: 'excluded'; file: string; exclusion: ProjectExclusion & { kind: 'scratch' | 'repository' | 'packages' | 'output' | 'generated' } }`.
   `file` is the physical project-relative target, as for `outside-project`.
   No new exported names: the members are inline and name the existing
   `ProjectExclusion`, which is exposed wherever `SourceTarget` is (typescript
   to analysis, analysis to parent and descendants, root to descendants), so no
   `expose-sub` list changes and `scripts/validate-final-contracts.ts` needs no
   new layer. The self-check verifies the companion rule.
4. **Explicit defaults.** Project acquisition (`inventory.ts`) and the
   observer's local creation (`observer.ts`) admit files beneath `src/` only,
   and set `placement: 'src'`. The TypeScript adapter's two origin builders
   (`accesses.ts`, `catalog.ts`) derive `auxiliary` from the inventory file's
   `placement === 'auxiliary'`, not a hardcoded false; today that is always
   false. Presentation's diagram fixture model and `diagramImport` set
   `auxiliary: false` for their `src/` origins.
5. **Model validation.** `canonicalOrigin` (model `model.ts`) establishes only
   origins beneath the owner's `src/`, so it requires `auxiliary === false`
   and returns `{ file, area, auxiliary: false }`. A supplied origin flagged
   auxiliary is not established: `buildModel` reports `invalid-original`,
   `explainImport` throws, as for any other unestablished origin.
6. **Rename.** The resolver's internal `ResolvedModule.kind` (`resolution.ts`),
   the access target builder and its `outside-module-target` coverage check
   (`accesses.ts`), the catalog's limit mapping (`catalog.ts`),
   `evaluate-accesses.ts` and the modularity producer's internal
   `Occurrence.kind` (`modularity-context.ts`, `modularity-graph.ts`) use
   `outside-project`. The serialized modularity report is unchanged
   (`ramify.modularity/2`). The coverage code `outside-module-target`, the
   warning code `outside-module-source` and `outsideModuleFiles` are unchanged.
   Which files are classified outside is unchanged: a selected file inside the
   root but outside every module's `src/` is still an `outside-project` target
   until iterations 8–9.
7. **Unproduced targets never pass as checked.** `evaluate-accesses.ts` maps
   targets through an exhaustive `outcomeOf`: application keeps the previous
   checked/mixed/unverifiable rule, external is `external`, outside-project is
   `outside-scope`, and unresolved, nested-tree and excluded are
   `unverifiable`; an unknown kind fails the `never` check. The modularity
   producer counts nested-tree and excluded occurrences with unresolved ones
   and marks them unattributed. Neither member is produced in this slice.
8. **`ramify.analysis/2`** is extended without a new identifier: report
   snapshots now carry `placement` on every inventory file, `auxiliary` on
   every origin (catalog originals and forwarding, access importers, targets
   and selection forwarding, decision questions and checked/blocking origins,
   model originals, dependency-behavior consumers) and the renamed target
   kind. No closed status field gains a value: `AccessResult.outcome`, the
   `denied` outcome, `project-boundary-import`, `auxiliary-original-exposure`
   and the `excluded-target` limit code are left to iterations 10–11, as the
   contracts' schema-versions table places them.
9. **Documents.** The Model, Project and TypeScript READMEs describe the
   flag, the placement and its current `src` value, the renamed kind and the
   declared but unproduced members. No non-protected document under
   `docs/architecture` or `docs/development` names the target kind as current.

## Schema and type producer list

Producers below name every toolkit site that constructs the changed shapes;
"derives" means the value comes from data, "explicit" a literal default.

| Shape | Producer (file) | Value in this slice |
| --- | --- | --- |
| `InventoryFile.placement` | project `inventory.ts` (acquisition walk) | explicit `src` (walk admits `src/` only) |
| | project `observer.ts` (`#owned`, local creation) | explicit `src`; edits spread the known record |
| `SourceOrigin.auxiliary` | typescript `accesses.ts` (`origin`) | derives from `placement` |
| | typescript `catalog.ts` (`origin`) | derives from `placement` |
| | model `model.ts` (`canonicalOrigin`, used by `buildModel` and `explainImport`) | explicit false; rejects true |
| | presentation `diagrams/fixture-model.ts`, `model-access.ts` | explicit false (teaching diagrams) |
| | scripts `probes/plan2a/scale-baseline.ts`, `token-format.ts` (not run) | explicit false |
| `SourceTarget` `outside-project` | typescript `accesses.ts` (`targetOf`), from `resolution.ts` | same targets as the former `outside-module` |
| `SourceTarget` `nested-tree`, `excluded` | none | not produced until iteration 9 |
| Consumers branching on target kind | analysis `evaluate-accesses.ts`, `modularity-context.ts`, `modularity-graph.ts`; typescript `catalog.ts` (resolver kinds) | handled explicitly as above |
| Consumers reading only `application`/`external`/`unresolved` | service-api `project-view.ts`, analysis `affected-query.ts`, `session-facts.ts`, `session-revision.ts`, typescript `behavior-classifier.ts` | unchanged; new kinds take the non-application path |

Embedding documents: `ramify.analysis/2` (all report snapshots), and the
explorer's `ProjectExplorerModel` browser DTO, whose `ExplorerSelection.forwarding`
is `SourceOrigin[]` (see gap 1). `ramify.production-files/1`, `ramify.check/1`,
`ramify.measure/1`, architect and API-view documents and the daemon codec
copy no origin, inventory file or target, and are unchanged.

## Tested case instances

`subs/analysis/src/tests/provenance-vocabulary.test.ts` (4 tests) over the
public analysis entry:

- Type fixtures, enforced by `npm run type-check`: positive origins (false and
  true), the three placements, and eight targets (outside-project, both
  declared tree kinds, all five reserved exclusion kinds); seven negatives
  with `@ts-expect-error`: an origin without `auxiliary`, placement `outside`,
  an inventory file without `placement`, kind `outside-module`, a nested-tree
  target with a scratch exclusion, an excluded target with an external
  exclusion, a nested-tree target without its exclusion.
- Through `analyzeProject` on a fixture with a root, a child, a forwarding
  barrel, a testing file, a CSS resource and a selected root `loose.ts`: every
  inventory file is placed `src` (six named files), `loose.ts` stays in
  `outsideModuleFiles`, and every origin the snapshot carries is non-auxiliary,
  including the barrel's forwarding origin.
- The `../loose.js` access targets `{ kind: 'outside-project', file: 'loose.ts' }`
  with outcome `outside-scope`, no decisions and the one coverage note
  `outside-module-target`.
- `evaluateAccesses` over the same model: the consumer's application access
  is `checked` and allowed (positive control); the same access with an
  owned-ignored or external nested-tree target or a scratch excluded target
  is `unverifiable` with no decision and no diagnostic.

`identity-model.test.ts` adds one test: an established origin is returned
with `auxiliary: false`; an importer or forwarding origin flagged auxiliary
beneath `src/` throws "established source origin"; an original flagged
auxiliary makes `buildModel` invalid with `invalid-original`.

## Changed expectations, reasoned from the contracts

- Origins: every origin in these fixtures lies beneath `src/`, so each gains
  `auxiliary: false` ("Old fixture defaults are false only for actual `src/`
  origins"): model `fixtures.ts`, `decisions.test.ts`,
  `available-originals.test.ts`, `identity-model.test.ts`, the 38 origins of
  `recorded-decisions.ts` (header comment notes the addition), descriptions
  `linking.test.ts`, analysis `affected-fixtures.ts`, `modularity-fixture.ts`,
  typescript `catalog.test.ts` (two), `resources.test.ts`, presentation
  `model-access.test.ts`, service-api `project-view.test.ts`, harness
  `model-cases.ts`, `plan2a-availability-cases.ts` and `catalog-cases.ts`
  (resource origin under `src/`).
- Inventory files: every fixture file lies beneath `src/`, so `placement: 'src'`:
  `linking.test.ts`, `affected-fixtures.ts`, `modularity-fixture.ts`,
  typescript `fixtures.ts`.
- Target kind: `outside-project` in `affected-query.test.ts`,
  `modularity-fixture.ts` (with its outcome mapping), `session.test.ts`,
  `coverage.test.ts` (and its title), `project-view.test.ts`, and the harness
  `session-cases.ts` I1-29:outside-module-target expected target (assertion
  label now "outside-project target has no invented permission or external
  scope"). Instance identities and rows are unchanged.
- `project-view.test.ts` explorer byte count: 5880 becomes 5880 + 2 × 18. The
  two projected selections each carry one forwarding origin, and each
  `,"auxiliary":false` member is 18 bytes.

## Commands and results

vitest, verification and reference runs held `/tmp/ramify-audit-tests.lock`.

| Command | Result | Evidence |
| --- | --- | --- |
| `git diff --check` | Exit 0; the new test file has no trailing whitespace and ends in a newline | `diff-check.out` |
| `npm run type-check` | Exit 0 (four compiler scopes) | `type-check.out` (earlier: `type-check-1.out`) |
| `npm run build` | Exit 0 (twice) | `build.out`, `build-final.out` |
| `npm run check:self` | Exit 0: passed, complete; 15 owners, 457 source files, 17 resources, 7017 accesses, 0 errors, 0 warnings, 0 analysis limits, 4908 allowed, 0 denied, 2109 external | `check-self-final.out` (earlier: `check-self.out`) |
| New and changed files: `provenance-vocabulary.test.ts`, `identity-model.test.ts` | Exit 0, 2 files, 42/42 | `vitest-new.out` |
| `npx vitest run` model, project, typescript, descriptions test directories, one command each | Exit 0: 227/227, 270/270, 215/215, 292/292 | `vitest-subs-analysis-subs-*.out` |
| `npx vitest run subs/analysis/src/tests` | Exit 0, 39 files, 459/459 (final run) | `vitest-subs-analysis-src-tests.out` |
| Same, earlier run | Exit 1, 458/459: `session-worker.test.ts` "cancels queued and active calls…" received a revised update (the abort raced the worker); the file then passed alone three times, 16/16 each, and the whole directory passed above | `vitest-subs-analysis-src-tests-flake.out`, `vitest-session-worker-{1,2,3}.out` |
| `npx vitest run` presentation, presentation/project-view, presentation/layout, service-api, explorer, cli, daemon, daemon/contexts, integration-tests, one command each | Exit 0: 190/190, 104/104, 16/16, 34/34, 33/33, 245/245, 248/248, 177/177, 4/4 | `vitest-subs-*.out` |
| Root files `batch-cli`, `affected-batch`, `project-view-reports`, `companion-cli` (named explicitly) | Exit 0, 4 files, 32/32 | `vitest-root-files.out` |
| `npm run reference:cases`, first run | Exit 1: 389/390; `verify.test.ts` iteration 6 failed because three I1-23 resource instances compared origins without `auxiliary` (`catalog-cases.ts`, fixed above) | `first-reference.*` |
| `node --import tsx scripts/reference-harness/verify.ts --plan 1 --format json --iteration 6` | Before the fix exit 1 (102/105); after it exit 0 (105/105) | `verify-i6.json`, `verify-i6-after.json` |
| `node --import tsx scripts/reference-harness/verify.ts --plan 1 --format json` (whole plan, a final-gate command, run to find other origin comparisons) | Exit 1: 276/308, 32 failed; none mentions `auxiliary`, `placement` or the target kind (see gap 3) | `verify-plan1.json` |
| `npm run reference:cases` (final, after the final build) | Exit 0: 36 files, 390/390, 335.09 s (14:30:01–14:35:37 UTC) | `reference.stdout`, `reference.stderr`, `reference.exit` |

No `scripts/**/*.test.mjs` changed. The two probe scripts were type-checked,
not run.

## Protected documents

No `.principles.md` or `.spec.md` file was edited; `sha256sum -c` against
`protected-baseline.sha256` (16 files) passes. `proposed-spec-patches.diff`
(sha256 `24f70e15…`, four hunks, `git apply --check` clean against
`97ac0664`) proposes for `docs/architecture/modularity-report.spec.md`:

- "Units" and "source filter": `outside-module` occurrences and counts become
  `outside-project`.
- The project-boundary paragraph: drop "the `outside-module` target kind
  becomes `outside-project`" from the pending list; say owned source outside
  `src/` is analyzed as auxiliary source "rather than counted as an
  `outside-project` target", and that the rename left the report's shape
  unchanged.
- Partial-metric rule 2: an `unresolved` or `outside-project` target.

## Occurrences of `outside-module` deliberately left

Coverage code `outside-module-target` and its uses; warning code
`outside-module-source` and `outsideModuleFiles` with their prose (Project
README, daemon README, `generated-path.ts` comment and test comment,
`plan2a-isolation-cases.ts`); the harness README's "outside-module targets",
which names the I1-29 coverage fixtures; the instance identity
`I1-29:outside-module-target` and the `plan2a-instances.ts` I2A-02 row (compared
with archived rows); `catalog.test.ts` title "outside-module source"; the
negative type fixture; `docs/roadmap.md` and `docs/analysis/` history.

## What later slices still lack

Iteration 8: inventorying auxiliary source and referenced resources with
their placements and retiring `outsideModuleFiles`; the modularity bucket for
nested-tree and excluded occurrences. Iteration 9: producing nested-tree,
excluded and outside-project targets from the Project classifier and turning
owned source outside `src/` into application targets. Iteration 10:
`auxiliary-original-exposure` and model acceptance of auxiliary origins.
Iteration 11: auxiliary importer profiles, the `denied` outcome,
`project-boundary-import` and `excluded-target` coverage, replacing the
interim `unverifiable` outcome.

## Gaps for the coordinator

1. **Explorer DTO.** `ProjectExplorerModel` (`ExplorerSelection.forwarding:
   SourceOrigin[]`) now carries `auxiliary`. It has no schema identifier of
   its own; it travels under `ramify.explorer-http/1`, whose reuse check also
   requires the same build key and version, so no reader of another build
   receives it. Per the brief, no version was chosen: please decide whether
   this is a shape change of `ramify.explorer-http/1` or an unversioned
   same-build DTO, as the schema-versions table's "explorer-*, 18, only if the
   shape changes" row leaves open.
2. **Model rejects auxiliary origins.** `canonicalOrigin` now rejects an origin
   flagged auxiliary (it only establishes origins beneath `src/`). This fails
   closed until iterations 10–11 accept auxiliary origins; the alternative was
   to ignore the flag, which would drop provenance.
3. **Full plan 1 verification is red, not from this slice.** 30 instances fail
   their baseline because fixture F's report has coverage `partial` from a
   `signature-inferred` note (`subs/provider/src/interfaces/api.ts`
   `value`), where `complete` is expected; `I1-28:relocated-package` lacks
   `dist/src/ramify-client-Linux-x86_64`; `I1-30:production-selection/toolkit`
   finds the explorer assets in the build. Not rerun at the base commit, so
   pre-existence is inferred from the messages, not shown. Baseline failures
   hide those instances' later assertions, which may still compare origins.
   It is a final-gate command (`reference:verify --plan 1`).
4. **Interim classification.** A file inside the root but outside every
   module's `src/` is reported as an `outside-project` target until
   iteration 9, which the name does not describe.
5. **Modularity bucket.** Nested-tree and excluded occurrences, if produced,
   count as unresolved and unattributed; the modularity specification does not
   place them. Iteration 8 owns the producer.
6. **Iteration 1 inventory vs contracts.** Iteration 1's schema inventory row
   lists the `excluded-target` limit and `AccessResult` `denied` under "4
   types"; the contracts' schema-versions table places them in iteration 11.
   This slice followed the contracts.
7. **Harness write scope.** Beyond the renamed target kind, three harness
   files needed `auxiliary: false` on `src/` origins they build or compare
   (`model-cases.ts`, `plan2a-availability-cases.ts`, `catalog-cases.ts`);
   no instance row, count or identity changed.
8. The `session-worker.test.ts` cancellation race (above) appeared once under
   load and is unrelated to these changes.

## Coordinator review

The coordinator reviewed the type changes, the explicit outcome mapping and
the rename against the brief and the contracts, authorized
`proposed-spec-patches.diff` unchanged (`modularity-report.spec.md`) and
applied it with this slice. Following the contracts' schema-versions table,
which places the denied outcome, boundary diagnostics and the excluded-target
limit in iteration 11, is accepted. Rejecting an origin flagged auxiliary in
the model until iterations 10–11 is accepted. Whether the explorer browser
DTO's added `auxiliary` member advances `ramify.explorer-http/1` is put to the
user; iteration 18 owns the explorer schemas. The `reference:verify --plan 1`
failures (30 fixture F instances with the `signature-inferred` note, already
recorded by Plan 8, plus `I1-28:relocated-package` and
`I1-30:production-selection/toolkit`) are not part of the iteration gate;
their origin is to be established before iteration 20's qualification. The
iteration gate runs on the committed candidate and its result is recorded in
the evidence directory named by that commit.
