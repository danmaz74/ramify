# Iteration 9 results: resolution provenance and boundary targets

**Date:** 2026-10-04. **Status:** implementation receipt for
[iteration 9](iteration9.md). It awaits the coordinator's review,
protected-file comparison and gate. Changes are uncommitted in the working
tree. This slice produces the targets only; PB1-14, PB1-15 and PB1-16 receive
evidence at the TypeScript adapter's boundary and stay with iteration 11.
`reference:verify` was not run: the coordinator's gate runs it.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit / tree | `c99db9c4` (tree `3a404b13…`), clean at assignment |
| Contract revision | `contracts.md` blob `ea76b4ec…`; `typescript-source-interpretation.spec.md` `cad9df75…`; `cross-module-importability.spec.md` `6eb1ca6c…`; `modularity-report.spec.md` `5234bb52…`; `cli-invocation.spec.md` `409c9928…` (all unchanged; patches proposed below) |
| Configuration | unchanged: `ramify-audit.json` `b59f28f6…`, `package-lock.json` `fd3c84ba…`, every `tsconfig*.json` and Vitest configuration; nothing under `ramify-agent/` |
| Node / tools | v22.23.3; TypeScript 7.0.2 (native API); Vitest 4.1.11 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration9/` |

## Changed behaviour

1. **Package route retained before classification**
   (`subs/analysis/subs/typescript/src/resolution.ts`). `Resolution.module`
   now classifies every compiler-resolved file through one `place` step. A
   path specifier never carries a package route; a file a `paths`
   substitution spells (extension substitution, module suffixes, directory
   index or a resource's declaration file) was reached by that alias. Only a
   remaining bare specifier can be a package resolution, and only when the
   `node_modules` lookup from the importer reaches the file (`packaged`):
   - the file lies in `<ancestor>/node_modules/<name>` (or its `@types`
     package, or `<name>.d.ts` beside it) as spelled: no observation needed;
   - otherwise the lookup is retraced with the compiler's own observations,
     nearest ancestor first (an existing `node_modules` directory, then the
     package directory), and the first directory holding the package decides:
     the file lies in its physical location through a link, or in an
     installed copy with the same `name@version` as the manifest that scopes
     the file (the compiler resolves identical copies to one file);
   - `#` import-map specifiers and the importer's own package name with
     `exports` (self-name) never count.
   A relative path into `node_modules`, a path segment named `node_modules`
   and the compiler's external-library flag no longer establish anything. An
   ambient module declaration (no resolution route) keeps its previous rule.
2. **Canonical classification of every other target.** An inventoried file is
   application source. Any other compiler-resolved file is taken through every
   link (`CatalogHost.realpath`, the same observation as the compiler's
   callback) and classified by Project's `classifyProjectPath`: `nested-tree`
   with its declared owned-ignored or external exclusion, `excluded` with its
   scratch, output, packages, repository or generated exclusion, and
   `outside-project` outside the root. A link to an inventoried file gives
   that file's application target. An owned location the inventory does not
   hold is not an established application target: it is `unresolved`
   (`resource-target` for a resource). Classification is one call per
   non-inventoried target, proportional to the path's depth; there is no
   second ownership algorithm.
3. **Access targets and notes** (`accesses.ts`). `targetOf` emits the
   `nested-tree` and `excluded` members with their exclusion. Following the
   contracts' schema-versions table (the `excluded-target` limit, the denied
   outcome and `project-boundary-import` are iteration 11's), each of the
   three non-application targets keeps the nonblocking `outside-module-target`
   code, with an accurate message naming the tree or directory. The existing
   `evaluate-accesses.ts` mapping makes nested-tree and excluded accesses
   `unverifiable`; outside-project stays `outside-scope`.
4. **Catalog** (`catalog.ts`). A forwarding export or star export whose target
   is nested-tree or excluded is treated like outside-project: an
   `outside-module-target` limit and no original. Excluded files are never
   described, so no export is interpreted from them.
5. **Hosts.** `CatalogHost` gains `realpath` and `directoryExists`, supplied by
   the finite helper (`compiler-helper.ts`, the same requests as the compiler's
   callbacks) and the retained adapter (`retained-source-analysis.ts`).
6. **Comments and README.** `evaluate-accesses.ts`, `modularity-context.ts`,
   `modularity-graph.ts` and `interfaces/source.ts` no longer say the members
   are unproduced; the TypeScript README states the route and classification
   rules (not its first paragraph).

No document changes shape: the `SourceTarget` members exist since iteration
4; coverage codes are unchanged; no closed status field gains a value. The
analysis, check and watch documents are extended at version 2 as decided.

## How package routes are retained, and the resolver evidence

Probe `probe/probe.mjs` over `probe/p1` (outputs `probe/p1.out`,
`probe/p1-aliases.out`) established what the pinned native API offers:

- the compiler realpaths only `node_modules` resolutions: `sample` through the
  link `node_modules/sample` resolved to `fixtures/sample/index.d.ts`, while
  `./linked/index.js` through a non-package link kept the spelled
  `src/linked/index.d.ts`;
- the per-file `isFromExternalLibrary` flag was `false` for the linked
  package's file because a relative import loaded the same file, and `true`
  for `sample/sub`, loaded only by the package import: the flag cannot tell
  two routes to one file apart;
- under NodeNext an exact `paths` entry needs the exact file (`.d.ts`); a
  wildcard entry gets extension substitution; an unlisted export-map subpath
  (`sample/hidden`) is unresolved;
- the API exposes no per-import resolution record (`originalPath`,
  `packageId`), only per-file metadata including `packageJsonDirectory`.

The route is therefore retained from the specifier, the configured `paths`
candidates and the compiler's resolved file, and the package evidence is
retraced with observations the compiler made. The first implementation
realpath'd `<ancestor>/node_modules/<name>` for every ancestor; the first
`reference:cases` run showed that this added paths the compiler never
observed (248 absent inputs present in batch but not in the live revision of
`I5-12`, and 1478 extra inputs on the linked reference copy), and that a
deduplicated package copy (the private Vite copy of the resident shim
fixture) was not recognized. The retrace and the identical-copy rule replaced
it; the toolkit's captured inputs now differ from 8C's only by the new test
file (`inputs-diff-vs-8c.txt`).

## PB1-14, PB1-15 and PB1-16 evidence at this boundary

`subs/analysis/subs/typescript/src/tests/project-boundary-resolution.test.ts`
(7 tests) builds the written topology with the TypeScript owner's supplied
view double, now given a real ownership table, links and files beside the
root. Every expectation is derived from the contracts.

| Case | Test | Independent expectation |
| --- | --- | --- |
| PB1-14 | forms | value, type-only, inline type, side-effect, empty, namespace member, CSS resource, lazy destructure and `typeof import()` into the owned-ignored tree: nine accesses, all `nested-tree` with the declaration, no original selected, one limit text per statement |
| PB1-14 | routes | relative, exact alias, wildcard alias and workspace link (`src/linked`, classified at its physical target) into either tree: `nested-tree`; application source by relative path and by alias: application, resolved original (positive controls) |
| PB1-14 | re-exports | named, type, star and empty re-exports from the barrel: `nested-tree`; the barrel's tree exports have no original; no catalog file or original lies outside `src/` or in `src/tmp/`; a consumer's selections keep the barrel as forwarding provenance (`thing`, `sample`, `api`, `Shape`), `api` resolves |
| PB1-15 | paired controls | `sample` through the installed link: external `package`, `resolvedFile` in the ignored tree, no note; `sample-alias` and `#sample/index.js` to the same file: `nested-tree`; `sample/sub` and `sample/style.css` (export map, resource): external; `#sample/style.css`: `nested-tree`; `sample/hidden`: unresolved; `realpkg`: external; `../node_modules/realpkg/index.js`: `excluded` packages |
| PB1-15 | name collision | a `paths` alias named `sample` wins over the installed link: `nested-tree`; `sample/sub` still external |
| PB1-16 | distinct limits | `../../outside.js`: `outside-project` `../outside.ts`; `dist/`: `excluded` output; `src/tmp/`: `excluded` scratch; relative `node_modules`: `excluded` packages; missing file and unlisted subpath: unresolved with `unresolved-target`; each with its own message |
| parity | retained adapter | the retained adapter's interpreter gives the batch helper's 39 targets |

Negative control: with `resolution.ts` reverted to `c99db9c4`, 6 of the 7
tests fail and parity passes (`negative-control-head-resolution.log`).

Iteration 11 still owes the verdicts: the denied outcome and
`project-boundary-import` for nested-tree targets, and `excluded-target`.

## Toolkit self-check before and after

Prediction written before each run (`self-check-prediction.md`); both runs
matched it exactly.

| | 8C baseline | Predicted | Actual |
| --- | --- | --- | --- |
| Source files | 573 | 574 (+ the new test) | 574 |
| Originals | 1620 | 1621 (+ `FixtureBoundaries`) | 1621 |
| Accesses | 8391 | 8422 | 8422 |
| Targets | application 5399, external 2952, outside-project 33, unresolved 7 | 5417, 2961, excluded 37, 0, 7 | identical |
| Allowed / denied / errors / warnings | 5399 / 0 / 0 / 0 | 5417 / 0 / 0 / 0 | identical |
| Coverage notes | 38 (outside-module-target 28) | 41 (outside-module-target 31) | identical |
| Outcomes | outside-scope 33 | unverifiable 44 (37 excluded + 7 unresolved), outside-scope 0 | identical |
| Exit / coverage | 0, partial | 0, partial | 0, partial |

Why: the 33 imports of `dist/` (28 statements) become `excluded` output
targets, keep their 28 notes with new text, and move from outside-scope to
unverifiable. Four relative imports of `../../../node_modules/typescript/…`
in `warm-compiler-cycles.mjs` (two bindings), `warm-compiler-stages.mjs` and
`worker-thread.mjs` were external only through the path segment; they become
`excluded` packages targets with three new notes (one per statement). The new
test file adds 20 accesses (7 external, 13 application); `fixtures.ts`,
`resolution.ts` and two test hosts add 11 more (6 external, 5 application).
The self-name imports (`ramify.ts/model`, `…/analysis`, `…/client`) stay
application targets. Every note is in auxiliary source. Example
(`examples/collection-review`): unchanged, 56 files, 318 accesses, 0 limits,
complete (`example.log`).

## Re-reasoned expectations and stale rows

Toolkit tests (no reviewed rows):

- `catalog.test.ts`: `loose/` holds owned source outside `src/`, which is
  auxiliary application source under the contracts; the double does not model
  auxiliary inventory, so `loose` is declared owned-ignored and the outside
  forwarding keeps its `outside-module-target` limit.
- `coverage.test.ts`: the outside file now lies beside the root
  (`../outside.ts`), the only `outside-project` location; target asserted.
- `resources.test.ts`, `resource-suffixes.test.ts`: a `paths` alias onto
  `./node_modules/pkg/index.d.ts` is not package resolution: the forwarding
  export gets an `outside-module-target` limit (excluded packages target),
  not "compiler-resolved external".
- `provenance-vocabulary.test.ts`: `../vendor/tool.js` in the owned-ignored
  `vendor` is a `nested-tree` target with its declaration, outcome
  unverifiable, note unchanged.
- `modularity.test.ts` (new test with `modularity-fixture.ts` `nested` and
  `excluded` targets): both counted in `unresolvedOccurrences` and
  `unattributedAccesses`, no edge or application occurrence added.
- Comments only: `report-publication.test.ts`, `affected-session.test.ts`.
- Host plumbing only: `descriptions.test.ts`, `companions.test.ts`,
  `access-interpreter.test.ts`, and the harness's `plan5-catalog-fixture.ts`
  and `plan5-engine-fixture.ts` (needed for the harness compiler scope).

Harness expectations: none changed. No reviewed instance row, count or
identity changed, and no row became stale through this slice. Instances run
singly as regression evidence (all passed): I1-24 `external/package`,
`external/builtin`, `unresolved`; I1-29 `outside-module-target`; I1-27
`self-check`, `self-negative`; I2-30 `self-check-fifteen`,
`self-negative-contexts`; I5-03 ×5 and I5-01 ×2 (the changed host fixtures);
I5-08 ×2.

## Modularity placement

The modularity specification places external, outside-project and unresolved
occurrences and does not name nested-tree or excluded ones. The producer
already kept them out of edges and counted them with unresolved occurrences
and as unattributed (iteration 4); now that they are produced a test pins
that, and a specification patch is proposed. Flag: this widens what
`unresolvedOccurrences` counts in `ramify.modularity/3` (the 37 toolkit
`excluded` occurrences move there from `outsideModuleOccurrences`); the
alternative is `outsideModuleOccurrences`. No version was chosen.

## Performance

No path filter compares against every exclusion or file pair; the classifier
runs once per non-inventoried target and the retrace once per (importer,
package, file) with memoized observations. S1000 cold retained-session open
with the I5-08 inputs: 24.1 s after the first implementation
(`s1000-cold-open.out`) and **24.4 s** after the rework (`r2-s1000.log`); 8C
recorded 25.2 s; deadline 30 s. Both I5-08 instances passed (`i508-instances.out`,
`r2-p5.log`).

## Commands and results

All test and harness commands ran under `flock /tmp/ramify-audit-tests.lock`.

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check` (and the new file checked for trailing spaces) | 0 | clean | `diff-check.log` |
| `npm run build` | 0 | built | `build.log` |
| `npm run type-check` | 0 | four scopes | `type-check.log` |
| `npx tsx scripts/validate-final-contracts.ts` | 0 | 15 owners, 591 files | `validator.log` |
| `npm run check:self` (human, JSON) | 0 | passed, partial; 574 files, 8422 accesses, 41 limits, 0 denied | `check-self.log`, `self-final.json`, `self-final-summary.txt` |
| `dist/src/ramify check --root examples/collection-review --batch` | 0 | passed, complete; unchanged | `example.log` |
| `npx vitest run …/project-boundary-resolution.test.ts` | 0 | 7 tests | `t-pbr-2.log`, `r2-pbr.log` |
| Negative control (HEAD `resolution.ts`) | 1 | 6 failed, 1 passed | `negative-control-head-resolution.log` |
| `npx vitest run subs/analysis/subs/typescript/src/tests` | 1, then 0 | 4 stale (re-reasoned); final 20 files, 222 tests | `t-typescript-1.log`, `r2-typescript.log` |
| `npx vitest run subs/analysis/src/tests --maxWorkers=4` | 1, then 0 | 1 stale (re-reasoned); final 41 files, 469 tests | `t-analysis-1.log`, `r2-analysis.log` |
| Seven other-owner files naming target kinds (root, cli, integration-tests, daemon ×2, service-api, explorer) | 0 | 7 files, 59 tests | `r2-other.log` |
| `npm run reference:cases`, run 1 | 1 | 390/393: I5-12 `reference-sequence-live`, `removals-live`, resident Vite shim (see the route section) | `cases.stdout`, `cases.stderr` |
| `vitest -c scripts/reference-harness/vitest.config.ts resident-fixtures.test.ts` | 0 | 18 tests | `r2-resident-fixtures.log` |
| `vitest -c scripts/reference-harness/vitest.config.ts plan5-live.test.ts` | 0 | 6 tests | `r2-p5-live.log` |
| Single instances (Plans 1, 2, 5; runners `some-instances*.mts`) | 0 | all passed | `r2-p1.log`, `r2-p2.log`, `r2-p5.log`, `instances-p*.out` |
| S1000 cold open | 0 | 24.4 s | `r2-s1000.log` |
| `npm run reference:cases`, run 2 (final, frozen tree, 10:36–10:42 UTC) | 0 | **37 files, 393 tests**; tree unchanged during the run (`diff-*-cases2.sha`) | `cases2.stdout`, `cases2.stderr` |

`reference:verify` was not run (left to the coordinator's gate).

## Protected documents

No `.principles.md`, `.spec.md` or glossary file was edited. Proposed patch
`/home/app/ramify-pb1-evidence/iteration9/proposed-spec-patches.diff` (sha256
`c8346c56…`, 3 files, 6 hunks, `git apply --check` clean):

- `typescript-source-interpretation.spec.md`, status and closing paragraph:
  resolution retains the package route and classifies nested-tree,
  always-excluded and outside-project targets; the definite finding, the
  excluded-target limit and the auxiliary-exposure rejection are pending.
- `cli-invocation.spec.md`, "Files outside modules": an owned import into a
  declared tree or an always-excluded path without package resolution is
  unverifiable with a limit; one outside the root is outside scope with the
  same limit; none is allowed or external; the finding and excluded-target
  limit await the import rules (replaces "is reported as outside scope").
- `modularity-report.spec.md`: nested-tree and excluded occurrences are
  counted with unresolved ones, never as edges, under the same importer rule,
  and as unattributed (partial-metric rule 2).

## What iterations 10–11 still lack

- Iteration 10: `auxiliary-original-exposure` (unchanged here).
- Iteration 11: the denied outcome and `project-boundary-import` for
  `nested-tree` targets (including type-only and symbol-free loads and
  re-exports), and the `excluded-target` limit replacing
  `outside-module-target` on `excluded` targets; until then the code name is
  false for excluded and nested-tree targets.

## Gaps and decisions needed

1. **Synthetic roots through links.** The 8B root filter classifies the
   configuration's spelling, so a file a configuration selects through a link
   into a declared tree stays a compiler root; its imports are not
   interpreted (it is not inventoried), but it is compiled. Not changed here.
2. **Referenced resources (G3).** The 8C receipt listed `referenced-resource`
   placement under iteration 9; the brief does not. An owned resource outside
   `src/` that the inventory lacks is now `unresolved`/`resource-target`, not
   `outside-project`. Whether to inventory it is open.
3. **Lookup limits.** A package import-map entry (`#x` mapped to a
   dependency) is not recognized as package resolution (classified
   physically, so an `excluded` packages target). When the nearest directory
   holding the package does not contain the file and is no identical copy,
   the retrace stops there, as the compiler's lookup would on success.
4. **Double.** The TypeScript owner's view double inventories `src/` only;
   tests needing owned source outside `src/` declare it a nested tree.
5. **Probe scripts.** `scripts/probes/fast-check/description-closure.mjs`,
   `p5-common.mjs` and `warm-compiler-stages.mjs` build hosts without
   `realpath`/`directoryExists`; they are not run by any gate and were left.
6. **Modularity bucket**: see above.

## Coordinator review

The coordinator reviewed the route placement, the classification through the
canonical Project classifier and the new resolution test, authorized
`proposed-spec-patches.diff` unchanged (`typescript-source-interpretation.spec.md`,
`cli-invocation.spec.md`, `modularity-report.spec.md`) and applied it with
this slice. Counting nested-tree and excluded occurrences with unresolved ones
extends `ramify.modularity/3`, which advanced in iteration 8A and has not been
handed off, so no further version advances. The coverage code keeps its name
until iteration 11 introduces the excluded-target limit. `referenced-resource`
placement and the three gaps the receipt lists are carried to iterations 10
and 11. The agent did not run `reference:verify`; the coordinator's gate runs
the audit, `reference:cases` and the full Plan 1 and Plan 2 verification on
the committed candidate.
