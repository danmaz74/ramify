# Iteration 8C results: auxiliary source activation

**Date:** 2026-10-04. **Status:** implementation receipt for sub-slice 8C of
[iteration 8](iteration8.md), step 2 (step 1, the probe move, is
[its own receipt](iteration8c-step1-results.md), committed as `b693b37d`). It
awaits the coordinator's review, protected-file comparison and gate. Changes
are uncommitted in the working tree. PB1-07 and PB1-33 receive their evidence
here; no case is claimed complete before iteration 8 closes.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit | `b693b37d`, clean at assignment |
| Contract revision | `contracts.md`, the owning specifications and the glossary unchanged; proposed patches below |
| Changed configuration | none: `package.json`, `package-lock.json`, `ramify-audit.json`, every `tsconfig*.json` and both Vitest configurations unchanged; nothing under `ramify-agent/` |
| Node | v22.23.3; Vitest 4.1.11; TypeScript 7.0.2 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration8/8c/step2/` |

## Changed behaviour

1. **Auxiliary inventory** (`subs/analysis/subs/project/src/inventory.ts`).
   The walk inventories every owned compiler source file outside its owner's
   `src/` as `{ owner: nearest valid module, area: 'ordinary', kind: 'source',
   placement: 'auxiliary' }`, selected or not, including loose source beneath
   `subs/` and sibling `tests/`/`interfaces/` directories. Files beneath a
   layout-invalid boundary stay unattributed. Pruned trees, scratch
   directories and always-excluded paths are never entered, as in 8A.
   Classification is one regular-expression test per file (`auxiliarySource`),
   so acquisition stays proportional to the walk.
2. **JavaScript rule** (user decision 9). Outside `src/`, a `.js`, `.jsx`,
   `.mjs` or `.cjs` file is compiler source only when the root configuration
   admits JavaScript: `allowJs`, which defaults to `checkJs` as in the
   compiler. Every other owned file outside `src/` is inert: neither
   inventoried nor read. The rule is applied outside `src/` only; beneath
   `src/` every file stays inventoried as source or resource, as before (see
   decisions needed).
3. **Retired outside handling.** `ProjectInventory.outsideModuleFiles`, the
   transitional `outside-module-source` warning code and the extra
   `dependency` read of outside files are removed. `ProjectWarning.code` keeps
   the two compiler-selection codes; codes stay an open set.
4. **Model** (`subs/analysis/subs/model/src/identity.ts`, `model.ts`).
   `validOriginalId` accepts the auxiliary file form; `canonicalOrigin`
   accepts an auxiliary origin that lies outside its owner's `src/`, whose
   nearest module directory is its owner, with the owner's ordinary area and
   profile; the original's origin is checked against
   `originalSourcePath(root, file)`. `explainImport` therefore decides
   auxiliary importers and targets by the ordinary rules: same-owner allowed,
   received foreign originals by exposure, testing isolation unchanged (an
   auxiliary importer has the ordinary profile). `buildModel` refuses an
   exposure whose original is auxiliary (`ungrounded-exposure`, fail-closed).
5. **Observer bridge (G6)** (`observer.ts`). An edit of an inventoried
   auxiliary file updates its hash in place (`local`, `changed`); a deleted or
   replaced one, a new owned compiler source file outside every `src/`, or a
   change of a directory above an inventoried auxiliary file rebuilds the
   inventory (`structural`). Inert files and inadmissible JavaScript are
   ignored. Iteration 12 owns the precise membership path.
6. **Production selection** (`scripts/production-selection.ts`) keeps only
   `placement: 'src'` files, so the package build never compiles scripts.
   Without it the build compiled `cucumber-viz.config.ts` and failed.
7. **`ramify.measure/2`** (`src/interfaces/service.ts`,
   `subs/daemon/src/service.ts`, `measure-response.ts`): `outsideModuleFiles`
   retired; the ownership rule's step 2 says auxiliary source is listed with
   its owner's ordinary area. `SessionMeasurements.outsideModuleFiles`
   removed. No other document changes shape: the analysis, check, affected,
   watch, daemon-status and IPC documents carry the same members (an
   inventory file already had `placement`, an origin already had
   `auxiliary`), so they are extended at version 2 as decided.
8. **Modularity producer.** No source change was needed: it attributes files
   from the inventory, so auxiliary source counts as its owner's production
   source. A test now states it (`modularity.test.ts`).

## Identity form (user decision 7)

An original defined in auxiliary source keeps the `src/`-relative file form
with exactly one leading `../`, for example
`{ kind: 'code', owner: 'ramify', file: '../scripts/build-production.ts', binding: 'main' }`.
Two leading segments, a remainder naming `src/` again, or any interior `.`/`..`
are refused, so each file has one spelling. No specification states the
original-identity file form, so no identity patch is proposed.

## PB1-07 and PB1-33 evidence

| Case | Test | Independent expectation |
| --- | --- | --- |
| PB1-07 | `project-boundary-inventory.test.ts` "PB1-07: auxiliary compiler source inventory" (3 tests) | Selected `tools/selected.ts`, unselected `scripts/unselected.ts`, loose `subs/loose.ts` under `app`; `subs/a/scripts/a-tool.ts` and sibling `subs/a/tests/sibling.test.ts` under `app/a`, all `ordinary`/`auxiliary`, no warning; JavaScript inert without `allowJs`, admitted by `allowJs` or `checkJs` alone, not by `allowJs: false`; inert `.md`/`.json` never inventoried; an installed `node_modules` package and an external tree never become application files |
| PB1-07 | `project.test.ts` (re-reasoned) | Inherited and package-based configurations admitting JavaScript make `tests/selected.js` root auxiliary source |
| PB1-07 (analysis) | `auxiliary-source.test.ts` | The four auxiliary files of the written topology inventoried and catalogued; `tools/tmp/` is not scratch; nested `scripts/tsconfig.json` and `notes/` inert |
| PB1-33 | `auxiliary-source.test.ts` | `scripts/check.ts`: a's received `api` allowed `exposed`, b's unexposed `hidden` denied `not-visible`; `tools/tmp/helper.ts` same-owner allowed; `subs/a/scripts/report.ts` same-owner api allowed, a's `src/tests/` denied `testing-origin`; `report.test.ts` denied `testing-origin` (a test-shaped name creates no testing area); b's ordinary consumer allowed (positive control); importer profiles `['dispatch']` and `[]` |
| PB1-33 (model) | `identity-model.test.ts` "auxiliary origins" | Same-owner, received and testing decisions for auxiliary importers; a child never sees a root auxiliary original; a forged exposure refused; origins beneath `src/`, in a nearer module's directory or with a mismatched identity refused |
| PB1-33 (toolkit) | `npm run check:self` | No definite violation in 110 auxiliary files |
| G6 | `project-boundary-inventory.test.ts` "observation of auxiliary source" | Edit is local; inert and inadmissible files unchanged; creation, deletion and directory removal structural with the expected inventory |

## Toolkit and example self-checks against the prediction

Toolkit (`check-self.log`, `self-final.json`, `self-final-summary.txt`,
`aux-access-summary.txt`): exit 0, passed, coverage partial; 15 owners, **573
source files** (463 beneath `src/` + 110 auxiliary: root 103, analysis 6,
presentation 1), 17 resources, 1620 originals (161 auxiliary), 8391 accesses,
0 errors, 0 warnings, **38 analysis limits**, 5399 allowed, 0 denied, 2952
external.

| | Predicted (assessment) | Actual | Difference |
| --- | --- | --- | --- |
| Source files | 568 = 458 + 110 | 573 = 463 + 110 | The base grew from 458 to 462 in 8A/8B and to 463 with this slice's `auxiliary-source.test.ts`; auxiliary count identical |
| Auxiliary owners | root 109, presentation 1 | root 103, analysis 6, presentation 1 | Step 1 moved both probes (6 files) into analysis |
| Accesses from auxiliary source | about 1281: 806 external, 437 application, 33 outside-project, 7 unresolved | 1280: 805, 435, 33, 7 | Within the prediction's rounding; the 57 formerly foreign modularity/dependency-analyzer decisions are now same-owner |
| Definite violations | 30 without a fix | 0 | Step 1's move made every probe import same-owner |
| Coverage notes | 38: outside-module-target 28, unresolved-target 2, unsupported-commonjs 4, nonliteral-target 2, resource-target 2 | identical by kind and count | none |
| Warnings | 0 | 0 | none |

Every note lies in an auxiliary file: `dist/` imports from
`scripts/probes/fast-check/*` (24), `scripts/measurements/resident-daemon.mjs`,
`resident-workloads.mjs`, `scripts/probes/fixtures/warm-recompute-worker.mjs`
and `scripts/spikes/bun-cli-startup/entry.mjs` (outside-module-target);
`cucumber-viz.config.ts` and `scripts/probes/compiler-api.ts`
(unresolved-target); `ecosystem.config.cjs`, `compiler-api.ts` ×2,
`reference-resolution.ts` (unsupported-commonjs); `scripts/memory-probe.mjs`
×2 (nonliteral-target); `compiler-api.ts`, `reference-resolution.ts`
(resource-target). A harness copy has no `dist/`, so there the 28 become
unresolved-target.

Example (`example-final.log`, `example-final.json`): exit 0, passed, coverage
**complete**; 15 owners, 56 source files (54 + `vite.config.ts` and
`vitest.config.ts` as root auxiliary source), 5 resources, 97 originals (their
two default exports), 318 accesses (their five static external imports), 179
allowed, 0 denied, 139 external, **0 warnings** (the two former
`outside-module-source` warnings are gone: those files are now analyzed root
source, which warns about nothing). `cucumber.js` is inert under the
JavaScript rule (the example has no `allowJs`), so there is no
`compiler-blocked` note.

## Readers migrated

`ramify.measure/2`: daemon service and response rule, `src/interfaces/service.ts`,
`subs/cli/src/arguments.ts` help, `scripts/measurements/plan2c.mjs`, READMEs
(`subs/cli`, `subs/daemon`, `scripts/measurements`), `docs/architecture/daemon.md`,
`processes-and-clients.md`, and tests (`measure-command`, `measure-service`,
`service`, `measurements`, `ipc`, contexts `scripted-driver`). `outsideModuleFiles`
and the outside warning: every toolkit test and fixture listed in the diff,
the Project README, `docs/development/batch-verification.md`, and the harness
files below. `docs/roadmap.md` keeps its historical `ramify.measure/1`
deliverable text.

## Re-reasoned expectations and stale rows

Toolkit tests (no reviewed rows): `inventory.test.ts`, `provenance-vocabulary.test.ts`
(an owned-ignored `vendor/tool.ts` now supplies the outside-project target;
`loose.ts` is root auxiliary, same-owner allowed), `session.test.ts` (a child
importing root `tools/outside.ts` is a definite `not-visible` denial; two
scratch selections supply the bounded warnings), `affected-session.test.ts`
A7-04 and `report-publication.test.ts` (an owned-ignored `lib`/`tools` keeps
their outside-project target and warning counts), `project.test.ts` (the
stopping read is a later module's README, since selected source beneath an
invalid boundary is no longer read), `generated-path.test.ts`,
`inventory-scaling.test.ts`, `toolkit-boundaries.test.ts`, `batch-cli.test.ts`
(a scratch selection supplies the warning), `measure-command.test.ts` (with no
configured `outDir`, `dist/output.ts` is root auxiliary source), the daemon
measurement tests, `identity-model.test.ts` and `decision-lookups.test.ts`
(`../escape.ts`/`../api.ts` are now the canonical auxiliary form; the
noncanonical case uses `../../`).

Harness: `self-cases.ts` (I1-27 self-check and self-negative), `session-cases.ts`
(I1-29:outside-module-target), `project-cases.ts` (I1-02 stray/loose/sibling
cases, I1-29:stray-files, reference inventory), `cli-cases.ts` (I1-28
warnings/stray, clean), `reference-baseline.ts`, `resident-expectations.ts`,
`relocation.ts`, `plan5-engine-cases.ts`, `plan5-catalog-cases.ts`,
`static-cases.ts`, `catalog-cases.ts`, `service-cases.ts`,
`plan2a-isolation-cases.ts`, `linking-expectations.ts` (catalogued reference
files 59 → 61), `plan5-observer-cases.ts` (owned files 59 → 61),
`completion-cases.ts` (the toolkit negative's coverage is partial) and
`gate-cases.ts` (owner tests are the test files beneath a module's `src/`;
analysis's modularity probe test, moved in step 1 and run by its own Vitest
configuration, is auxiliary source, so the first Plan 1 run failed both I1-30
toolkit instances on it). Every reference count is reasoned from the two
configuration files' content (5 static external imports, 2 default exports).

**I1-29:outside-module-target.** The contracts make owned source outside
`src/` an application target, and the module description specification says
foreign symbols of auxiliary source need ordinary exposure while auxiliary
originals cannot be exposed. A child's import of root `loose.ts` is therefore
an ordinary `not-visible` denial from the existing model; it needs no
iteration 9 target kind or iteration 11 `project-boundary-import`.

Reviewed rows kept byte-identical whose prose no longer describes what their
instance asserts:

| Row | Prose now stale |
| --- | --- |
| I1-01:baseline | "the two configuration warnings are separate" (no warnings; the files are root auxiliary source) |
| I1-02:stray-description | "alongside ordinary outside-source warning" (no warning; the file beneath the stray marker has no owner) |
| I1-02:loose-subs-source | "One aggregated `subs` warning count 1; no ... owner" (root auxiliary source, no warning) |
| I1-02:sibling-tests | "One `tests` warning count 1" (root auxiliary, ordinary; still no testing classification) |
| I1-02:sibling-interfaces | "One `interfaces` warning count 1; no owner" (root auxiliary; still no exposure or third area) |
| I1-27:self-check | "independent scripts/site/example absent from program" (scripts are now analyzed auxiliary source; site and the example remain absent) |
| I1-28:compiled-cli-warnings/human, /json | "Visible aggregated warning" / "Same warning/count" (no warning; exit 0 unchanged) |
| I1-28:compiled-cli-stray-description/human, /json | "marker not included in ordinary-file warning count" (no warning exists) |
| I1-29:outside-module-target | "Warning plus located outside-scope analysis limit" (a definite `not-visible` denial; still no allowed verdict, no external) |
| I1-29:stray-files | "Warnings root config-extra count 1 and tests count 2 only; ... ignored file silent" (all four files root auxiliary, no warning) |
| I2-01:cold-context | "two warnings" (zero) |
| I2-30:self-check-fifteen | "no findings or limits" (38 nonblocking limits, all in auxiliary source; still no finding) |

## Performance

S1000 cold retained-session open with the I5-08 inputs
(`s1000-cold-open.mts`, `s1000-cold-open.out`): opened in **25.2 s**, 1000
owners, 11 000 source files, complete (regression repair after its fix:
24.3 s); acquisition deadline 30 s. Both I5-08 instances
(`worker-nonblocking`, `deadline-exceeded-explicit`) pass through the real
runner (`i508-instances.out`, 143 s for both).

## Commands and results

All test and verification commands ran under `flock /tmp/ramify-audit-tests.lock`.

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check` | 0 | Clean | `diff-check.log` |
| `npm run build` | 0 | Built (a first build failed in production selection before item 6) | `build.log`, `build-1.log` |
| `npm run type-check` | 0 | All four scopes | `type-check.log` |
| `npm run check:self` | 0 | passed, partial; 573 files, 8391 accesses, 0 errors, 0 warnings, 38 limits, 0 denied | `check-self.log`, `self-final.json` |
| `dist/src/ramify check --root examples/collection-review --batch` (human, JSON) | 0 | passed, complete; 56 files, 318 accesses, 0 warnings, 0 limits | `example-final.log`, `example-final.json` |
| `npx vitest run subs/analysis/subs/model/src/tests` | 0 | 11 files, 232 tests | `model-tests.log` |
| `npx vitest run subs/analysis/subs/project/src/tests` | 0 | 13 files, 295 tests (before the new PB1-07 tests) | `project-tests.log` |
| `npx vitest run subs/analysis/subs/project/src/tests/project-boundary-inventory.test.ts` | 0 | 27 tests | `pbi.log` |
| `npx vitest run subs/analysis/src/tests --maxWorkers=4` | 1 | 3 stale failures, re-reasoned and rerun below | `analysis-tests.log` |
| `npx vitest run` the three re-reasoned analysis files | 0 | 3 files, 82 tests | `analysis-tests-2.log` |
| `npx vitest run subs/analysis/src/tests/modularity.test.ts subs/analysis/src/tests/modularity-batch.test.ts` | 0 | 2 files, 22 tests | `t-modularity.log` |
| `npx vitest run subs/analysis/src/tests/auxiliary-source.test.ts` | 0 | 2 tests | `t-auxiliary.log` |
| `npx vitest run subs/analysis/subs/descriptions/src/tests` | 0 | 6 files, 292 tests | `t-subs_analysis_subs_descriptions_src_tests.log` |
| `npx vitest run subs/analysis/subs/typescript/src/tests` | 0 | 19 files, 215 tests | `t-subs_analysis_subs_typescript_src_tests.log` |
| `npx vitest run subs/cli/src/tests` | 1, then 0 | MM18 re-reasoned (`dist/` without `outDir`); rerun 4 tests | `t-subs_cli_src_tests.log`, `t-cli-measure.log` |
| `npx vitest run subs/service-api/src/tests` | 0 | 7 files, 34 tests | `t-subs_service-api_src_tests.log` |
| `npx vitest run subs/daemon/subs/contexts/src/tests` | 0 | 13 files, 177 tests | `t-subs_daemon_subs_contexts_src_tests.log` |
| `npx vitest run subs/daemon/src/tests` | 0 | 21 files, 248 tests | `t-subs_daemon_src_tests.log` |
| `npx vitest run` the 20 root `src/tests/*.test.*` files by name | 0 | 20 files, 103 tests | `t-root.log` |
| `node --check scripts/measurements/plan2c.mjs` | 0 | No `*.test.mjs` changed | — |
| S1000 cold open (`s1000-cold-open.mts`) | 0 | opened in 25.2 s | `s1000-cold-open.out` |
| I5-08 instances (`some-instances.mts 5 …`) | 0 | 2/2 passed | `i508-instances.out` |
| `npm run reference:verify -- --plan 1 --format json`, run 1 (04:27–04:44) | 1 | 286/308: 22 stale expectations (reference file count 59 ×19, I1-29 coverage, I1-30 toolkit discovery ×2), re-reasoned | `run1/` |
| Plan 1 failed instances rerun (`some-instances-p1.mts`) | 0 | 6/7, then `I1-23:resource-alias` re-reasoned | `plan1-rerun-failed.out` |
| `npm run reference:verify -- --plan 1 --format json`, run 2 (04:47–05:05) | 0 | **308/308**, plan complete; report `plan1-full-c98f8d90…` | `plan1-verify.*` |
| `npm run reference:verify -- --plan 2 --format json` (05:06–05:22) | 1 | 162 passed, 10 superseded, 12 failed: the known I2-29 ×9, I2-30 `declarations-final` and I5-07, plus `I2-30:self-negative-contexts` (toolkit coverage now partial), re-reasoned | `plan2-verify.*`, `plan2-failures.txt` |
| I2-30 toolkit instances rerun (`some-instances.mts 2 …`) | 0 | `self-negative-contexts` and `self-check-fifteen` passed | `i230-rerun.out` |
| `npm run reference:cases` (05:24–05:29) | 0 | **37 files, 393 tests** | `reference-cases.log` |

The tree did not change during the second Plan 1 run or the reference cases
run (`diff-before-*.sha`). The full Plan 2 run was not repeated after the
`completion-cases.ts` re-reasoning; only its two toolkit instances were.

## Protected documents

No `.principles.md`, `.spec.md` or glossary file was edited. Proposed patch
`/home/app/ramify-pb1-evidence/iteration8/8c/proposed-spec-patches-step2.diff`
(passes `git apply --check`):

- `module-description.spec.md`: status (auxiliary source inventoried and
  analyzed; the declared-tree import rule and the exposure finding pending);
  the JavaScript rule beside "Analyze all owned compiler source"; the
  implementation note near the end.
- `typescript-source-interpretation.spec.md`, `cross-module-importability.spec.md`,
  `glossary.md`: status lines.
- `cli-invocation.spec.md`: "Files outside modules" becomes the implemented
  statement (auxiliary source, the JavaScript rule, two warnings, Git advice
  pending, auxiliary imports decided by ordinary rules, non-inventoried
  targets outside scope until the project-boundary import rules).
- `modularity-report.spec.md`: auxiliary source counts as its owner's.
- `architect-view.spec.md`: `ramify.measure/2` example and attribution rule
  without `outsideModuleFiles`.

## What iterations 9–11 still lack

- Iteration 9: imports into declared trees, compiler output and other
  exclusions still give `outside-project` with `outside-module-target`
  coverage; `nested-tree`/`excluded` targets and `referenced-resource` (G3)
  have no producer.
- Iteration 10: linking does not yet report `auxiliary-original-exposure` for
  a selection or forwarding chain reaching an auxiliary original; the model
  refuses such an exposure input instead (fail-closed: an invalid model).
- Iteration 11: no `project-boundary-import` denial.
- Iteration 12: the observer bridge rebuilds for every auxiliary creation or
  deletion; a directory created with files already inside it is seen only
  through its files' events.
- Iteration 18: views list auxiliary originals as internal with their `../`
  file.

## Gaps and decisions needed

1. The JavaScript rule is applied outside `src/` only. Beneath `src/`, a
   `.js` file in a project without `allowJs` remains `kind: 'source'` (and
   compiler-blocked), as before. Whether the rule should also turn such a
   file into a resource is a user decision; the proposed patch scopes the
   rule to files outside `src/`.
2. Stale first paragraphs (left for the final-gate repair slice): the Project
   README's first paragraph says "outside-module warnings". `CLAUDE.md`'s
   implementation section still says compiler-selected files outside every
   module's `src/` produce warnings and that an owned import targeting them
   is an outside-scope limit; it is outside this slice's write scope.
3. `docs/architecture/project-boundary.proposal.md` and `docs/roadmap.md`
   keep historical wording.
4. The measurement ownership rule's last paragraph still names "independent
   compiler scopes" (from before 8A); unchanged here.

## Coordinator review

The coordinator reviewed the auxiliary inventory, the identity rule, the
model's acceptance of auxiliary origins, the retirement of
`outsideModuleFiles` and the re-reasoned expectations, authorized
`proposed-spec-patches-step2.diff` unchanged and applied it with this slice.
The user decided the identity form, the JavaScript rule and the probe move on
2026-10-04. The JavaScript rule is applied outside `src/`, where auxiliary
source is decided; whether it also changes the long-standing treatment of a
JavaScript file inside `src/` is put to the user. Refusing an exposure of an
auxiliary original in the model, with the located finding left to iteration
10, is accepted. Stale first paragraphs of owner READMEs and the rows whose
prose no longer describes their instances go to the final-gate repair slice;
`CLAUDE.md` waits for the user's consent in iteration 19. The gate, with the
full Plan 1 and Plan 2 verification, runs on the committed candidate.
