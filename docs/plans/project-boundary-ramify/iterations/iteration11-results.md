# Iteration 11 results: batch boundary decisions and reports

**Date:** 2026-10-04. **Status:** implementation receipt for
[iteration 11](iteration11.md). It awaits the coordinator's review,
protected-file comparison and milestone gate. Changes are uncommitted in the
working tree. PB1-12, PB1-14, PB1-15 and PB1-16 are produced here through
public batch analysis; their final qualification stays with iteration 20.
`reference:verify` was not run: the coordinator's milestone gate runs it for
plans 1, 2, 5 and 2a.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit / tree | `30a16f78` (tree `dbce0d22…`), clean at assignment |
| Contract revision | `contracts.md` blob `ea76b4ec…`; `cross-module-importability.spec.md` `163a2236…`; `typescript-source-interpretation.spec.md` `f1886446…`; `module-description.spec.md` `7acfe4c8…`; `glossary.md` `db88c7cf…`; `cli-invocation.spec.md` `d8d0b611…`; `modularity-report.spec.md` `898a931b…` (all unchanged; patches proposed below) |
| Configuration | unchanged: `package.json`, `package-lock.json` `fd3c84ba…`, `ramify-audit.json` `b59f28f6…`, every `tsconfig*.json` and Vitest configuration; nothing under `ramify-agent/` |
| Node / tools | v22.23.3; TypeScript 7.0.2; Vitest 4.1.11 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration11/` |

## Changed behaviour

**Decision order** (`subs/analysis/src/evaluate-accesses.ts`). Each access is
decided by its target before any symbol is selected:

1. `nested-tree` (a declared owned-ignored or external tree reached without
   package resolution): outcome **`denied`**, one located
   **`project-boundary-import`** diagnostic (category `import`, importer area,
   `original: null`, the access ID) and no `ImportDecision`. The same-owner
   exemption, exposure and tag rules and testing classification are never
   consulted. The diagnostic lies at the access's selection when it has one
   (the selected name, namespace member or destructured element), otherwise at
   the statement or import expression. Message: `'<specifier>' resolves to
   <file> in the declared <kind> tree <directory>; an import into a declared
   tree must use package resolution`.
2. `application`: unchanged (testing origin, then same-owner, exposure, tags).
3. `external`: `external`; `outside-project`: `outside-scope`; `excluded` and
   `unresolved`: `unverifiable`.

**Every import form.** The TypeScript interpreter already gives one access per
selected binding or symbol-free statement, each carrying the target; so the
finding applies to value, type-only (`import type`, inline `type`), side-effect
and empty imports, namespace imports (each member selection), lazy imports
(destructured, member or discarded), `typeof import()`, named, type, star,
namespace and empty re-exports, and a CommonJS `require` whose target the
compiler resolved. A star or namespace export into a declared tree is now one
access without the former `incomplete-exports` "cannot enumerate" limit: the
tree's exports are never interpreted and the finding needs none
(`accesses.ts`, `whole`, treated as for an external namespace).

**Package-route exception.** Unchanged from iteration 9: only a bare,
unaliased specifier that the `node_modules` lookup reaches is `external`,
including an installed link whose real location lies in an ignored tree; a
`paths` alias, relative path, import-map entry or link to the same file is
`nested-tree` and denied.

**Limits** (`accesses.ts`, `catalog.ts`, `interfaces/source.ts`).

| Target | Access outcome | Access limit | Catalog limit of a forwarding export |
| --- | --- | --- | --- |
| `nested-tree` | `denied` | none (the finding replaces the iteration 9 stand-in) | `unresolved-original` (named) or `incomplete-exports` (star), naming the tree: the file's description is incomplete, so a consumer never gets a false `missing-export` |
| `excluded` | `unverifiable` | **`excluded-target`** (new code), message unchanged | `excluded-target` |
| `outside-project` | `outside-scope` | `outside-module-target` (unchanged code and message) | `outside-module-target` (unchanged) |
| `unresolved` | `unverifiable` | `unresolved-target` / `resource-target` (unchanged) | unchanged |

`outside-module-target` stays the outside-project code: a target outside the
root is outside every module, the contracts name a new code only for excluded
targets, and the specification calls that case "an outside-scope analysis
limit". After this slice the code is produced only for outside-project
targets, so its name is no longer false.

**Counts** (`report.ts`, `session-facts.ts`). `summary.denied` adds every
`denied` access result to denied decisions (a boundary denial has no
decision), in batch reports and in retained-session publication; `errors`
already counts the diagnostic. The check fails through the diagnostic and the
CLI exit is 1 (`diagnostics.length || summary.denied`), even when the access
selected no symbol.

**Affected answers** (`affected-query.ts`). A boundary access no longer carries
a limit that widened the answer, so an import into an owned-ignored tree adds
a dependency edge from the importer to the tree's owner (an external tree has
no owner and adds none). This keeps the importer selected when the owner is a
seed. It is a compensating change; see decisions.

**Consumers.** `AccessResult.outcome` gains `denied` (doc comment);
`AnalysisCode` gains `project-boundary-import`; `SourceLimit.code` gains
`excluded-target`. Service-api's explorer status maps a `denied` outcome to
`denied` (only application accesses are listed, so it is unreachable today).
The dependency diagram is unchanged: its status rule (modularity
specification) reads only decisions for a fact's original, and a boundary
access selects no original. Modularity keeps its documented counting
(nested-tree and excluded occurrences with unresolved ones, unattributed).
READMEs: Analysis (a new paragraph after the check paragraph) and TypeScript
(the limit paragraph); no first paragraph changed; no exposure statement
changed, so the final-contract validator needs no layer.

## Report and check-document shapes

`ramify.analysis/2` and `ramify.check/2` are extended without a new version,
as the schema-versions table places them: the closed `AccessResult.outcome`
gains `denied`; `project-boundary-import` and `excluded-target` are new values
of open code fields. No other document changes shape. Strict consumers
checked: the daemon codec (`subs/daemon/src/codec.ts`) decodes revision
outcome and summary fields only, not access results or codes, so it needs no
change; CLI human and JSON formatting print codes generically; the changed
check copies findings unchanged; service-api mapping updated; the browser DTO
carries only application accesses (`ramify.explorer-http/1` unchanged);
modularity counts by target kind (`ramify.modularity/3` unchanged). No
`ramify.watch`, `ramify.daemon-status`, `ramify.ipc`, explorer or architect
shape changes.

## PB1-12, PB1-14, PB1-15 and PB1-16 evidence

`subs/analysis/src/tests/project-boundary-analysis.test.ts` (8 tests, new)
builds the written topology on disk (root `app` [dispatch] with owned-ignored
`fixture-project` and external `external-project`, child `a` with owned-ignored
`fixtures/sample`, `node_modules/sample` linked to it, `links/external` linked
to the external tree) and runs public `analyzeProject`. Every expectation is
derived from the contracts and specifications.

| Case | Independent expectation |
| --- | --- |
| PB1-14 forms | Root `src/forms.ts` into its own owned-ignored tree: value, `import type`, inline type, side-effect, empty, namespace member, lazy destructure, `typeof import()`: 8 accesses `denied`, no decisions, no limits, no original; one finding each at lines 1, 2, 3, 4, 5, 7, 8, 9 (selection or statement) with the exact message; importer profile `['dispatch']`; `related: []` |
| PB1-14 routes | `@tree/*` alias, exact bare alias `sample-alias`, the link `links/external`, a relative path into the external tree: denied, the link classified at its physical target; `@a/api.js` alias to application source allowed `exposed`; `sample` external |
| PB1-14 re-exports | named, type, star, namespace and empty re-exports into either tree denied (lines 1–5); the barrel `incomplete` with no tree original; catalog notes `unresolved-original` ×3, `incomplete-exports`, `unresolved-original` (package) |
| PB1-14 same owner, testing, auxiliary | `a`'s ordinary `own.ts` and testing `tree.test.ts` into `a`'s own tree, and root auxiliary `scripts/check.ts` into the root's: denied (testing importer area `['testing']`) |
| PB1-14 totals | check `failed`, coverage `partial`, all stages completed; 20 boundary findings + `not-visible` + 2 `testing-origin`; 32 accesses, 7 allowed, 23 denied, 23 errors, 2 external; no tree file inventoried, catalogued or interpreted |
| PB1-15 | `sample` through the installed link: external package, `resolvedFile` `subs/a/fixtures/sample/index.d.ts`, no note, no finding; `sample-alias` to the same file: nested-tree, one `project-boundary-import` |
| PB1-12 | Root auxiliary `scripts/check.ts`: a's received `api` allowed `exposed`, root `tools/tmp/helper.ts` allowed `same-owner`, b's unexposed `hidden` denied `not-visible`; a's auxiliary `report.ts`: `api` and `internal` same-owner allowed, `src/tests` denied `testing-origin`; `report.test.ts` denied `testing-origin` (stays ordinary, profile `[]`); positive controls `src/main.ts` and b's consumer allowed |
| PB1-16 | Separate project, no tree import: `../../outside.js` outside-scope with `outside-module-target`; `../dist/out.js`, `./tmp/scratch.js`, `../node_modules/realpkg/index.js` unverifiable with `excluded-target` (output, scratch, packages); `realpkg` external; `./missing.js`, `realpkg/hidden` unverifiable with `unresolved-target`; each with its exact message; no decision, no diagnostic, check **passed**, coverage partial; only `src/limits.ts` catalogued |

Negative controls (`negative-control/`): with `evaluate-accesses.ts` restored
to `30a16f78`, 7 of 8 tests fail and PB1-16 passes (its limits come from the
TypeScript owner) (`base-evaluate.log`); with `accesses.ts` restored to
`30a16f78`, the forms, re-export and PB1-16 tests fail (`base-accesses.log`).
Both files were restored byte-identically (`cmp`).

TypeScript-boundary evidence was re-reasoned in
`project-boundary-resolution.test.ts` (below).

## Toolkit and example self-checks against the prediction

The prediction (`self-check-prediction.md`) was written before implementing,
from the base reports (`base-self*.json`, `base-example*.json`).

| | Base | Predicted | Actual |
| --- | --- | --- | --- |
| Source files | 575 | 576 (+ the new test) | 576 |
| Nested-tree targets / boundary denials | 0 | 0 | 0 |
| Excluded targets | 37 (`dist` 33, `node_modules` 4) | 37, unverifiable | 37, unverifiable |
| Coverage notes | 41: `outside-module-target` 31, `unsupported-commonjs` 4, `nonliteral-target` 2, `resource-target` 2, `unresolved-target` 2 | 41 with `excluded-target` 31 in place of `outside-module-target` | identical |
| Accesses / allowed / external | 8442 / 5433 / 2965 | grow by the new file only | 8461 / 5437 / 2980 (+4 application, +15 external: the new file and three new `node:` bindings in `affected-session.test.ts`) |
| Errors / denied / warnings | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Exit / check / coverage | 0, passed, partial | same | 0, passed, partial |

No analyzed toolkit source imports into a declared tree (`docs`,
`examples/collection-review`, the probe fixtures, `scripts/reference-harness`,
`site`, `.cucumber-viz`, `.history`, `.playwright-mcp`, `.reference-work`,
`ramify-agent`), so no source fix was needed. No `outside-module-target` note
remains in the toolkit. Example (`examples/collection-review`): unchanged,
exit 0, passed, complete; 56 files, 318 accesses, 0 notes; it declares no tree.

## Process check

Built CLI, `dist/src/ramify check --root <project> --batch`, human and
`--format json`, on `process/pc` (expected results written first,
`process/expected.md`): exit 1 both ways; four `Error
[project-boundary-import]` lines at `src/boundary.ts:1:10`, `2:10` (external
tree), `3:15` (type-only) and `4:1` (symbol-free), each with `Importer: pc
(ordinary; tags: none)`; `vendor-pkg` through the installed link to the same
physical `vendor/index.d.ts` external with no finding; `Analysis limit
[excluded-target] src/allowed.ts:2:1` for the `dist` import; summary 6
accesses, 4 denied, 4 errors, 1 external, 1 limit. `process/pc-limits`
(without the boundary file): exit 0, passed, partial, the one
`excluded-target` limit. `process/linkcopy` shows that a relative import
through a `node_modules` link to a directory outside the root is
`outside-module-target`, which a harness copy of the toolkit produces (below).

## Re-reasoned expectations and stale rows

Toolkit tests (no reviewed rows):

- `project-boundary-resolution.test.ts`: declared-tree statements carry no
  limit; the forwarding file's catalog notes are `incomplete-exports` and
  `unresolved-original` ×3; the star export into the external tree is one
  `whole-star` access without limits; excluded targets carry
  `excluded-target`.
- `catalog.test.ts`: the forwarding export into the owned-ignored `loose` is
  `unresolved-original` naming the tree.
- `resources.test.ts`, `resource-suffixes.test.ts`: the forwarding export to
  an installed-package declaration through a `paths` alias is `excluded-target`.
- `provenance-vocabulary.test.ts`: the import of the owned-ignored `vendor` is
  `denied` with one finding (line 3), no limit, so the fixture's check fails
  with complete coverage; supplied nested-tree and external-tree accesses are
  denied, the scratch one unverifiable.
- `report-publication.test.ts`: the `tools` boundary import adds one denial
  and one error and removes one note (denied 2, errors 2, notes 1; final
  denied 3).
- `affected-session.test.ts` A7-04: the outside file is now beside the root
  (outside the project), keeping the case's intent and its
  `outside-module-target` widening; `affected-query.test.ts` gains the
  owned-ignored edge test; `modularity-fixture.ts` maps nested-tree to
  `denied`.

Harness: `self-cases.ts` (I1-27 and, through `assertToolkit`, I2-30):
`excluded-target` joins the permitted script note codes; `outside-module-target`
stays, because a harness copy links `node_modules` to the checkout's
installation outside the copy's root. A search of every harness file for the
changed outcomes, codes and fields (`outside-module-target`, `unverifiable`,
`outside-scope`, `denied`, `summary.denied`, coverage assertions, nested-tree
declarations) found no other expectation they change: no harness fixture
imports into a declared tree or an always-excluded path. No instance row,
count or identity changed, and no row became stale through this slice
(`I1-29:outside-module-target` and `I1-27:self-check` were listed stale in 8C).

## Performance

The decision is one `switch` and one diagnostic per boundary access; the
interpreter adds no classification (iteration 9's one classifier call per
non-inventoried target). S1000 cold retained-session open with the I5-08
inputs: **23.4 s**, 1000 owners, 11 000 files, complete (`s1000.log`;
iteration 9 24.4 s; deadline 30 s). Both I5-08 instances passed.

## Commands and results

All test and harness commands ran under `flock /tmp/ramify-audit-tests.lock`.

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check` (new file checked separately) | 0 | clean | `diff-check.log` |
| `npm run build` | 0 | built | `build.log` |
| `npm run type-check` | 1, then 0 | a test typing error, fixed; four scopes | `type-check.log` |
| `npx tsx scripts/validate-final-contracts.ts` | 0 | 15 owners, 593 files | `validator.log` |
| `npm run check:self`; JSON | 0 | passed, partial; 576 files, 8461 accesses, 41 limits (`excluded-target` 31), 0 errors, 0 denied | `check-self.log`, `self-final.json`, `self-final-summary.json` |
| `dist/src/ramify check --root examples/collection-review --batch` (human, JSON) | 0 | passed, complete; unchanged | `example.log`, `example.json` |
| `npx vitest run subs/analysis/src/tests/project-boundary-analysis.test.ts` | 0 | 8 tests | `t-pba.log` |
| Negative controls (base `evaluate-accesses.ts`; base `accesses.ts`) | 1, 1 | 7 failed / 1 passed; 3 failed / 5 passed | `negative-control/` |
| `npx vitest run subs/analysis/subs/typescript/src/tests` | 1, then 0 | 6 stale (re-reasoned); final 20 files, 222 tests | `t-typescript-1.log`, `t-typescript.log` |
| `npx vitest run subs/analysis/src/tests --maxWorkers=4` | 1, then 0 | 5 stale (re-reasoned); final 42 files, 481 tests | `t-analysis-1.log`, `t-analysis.log` |
| `npx vitest run subs/analysis/subs/model/src/tests` | 0 | 11 files, 232 tests | `t-model.log` |
| `npx vitest run subs/service-api/src/tests` | 0 | 7 files, 34 tests | `t-service-api.log` |
| `npx vitest run subs/cli/src/tests` | 0 | 8 files, 245 tests | `t-cli.log` |
| `npx vitest run subs/daemon/src/tests` | 0 | 21 files, 248 tests | `t-daemon.log` |
| `npx vitest run subs/daemon/subs/contexts/src/tests` | 0 | 13 files, 177 tests | `t-contexts.log` |
| Plan 1: I1-27 `self-check`, `self-negative`, I1-29 `outside-module-target` | 0 | 3/3 passed | `p1.log` |
| Plan 2: I2-30 `self-check-fifteen`, `self-negative-contexts` | 0 | 2/2 passed | `p2.log` |
| Plan 5: I5-08 `worker-nonblocking`, `deadline-exceeded-explicit` | 0 | 2/2 passed | `p5.log` |
| S1000 cold open | 0 | 23.4 s | `s1000.log` |
| Process check (built CLI, human and JSON) | 1, 0 | as expected | `process/` |
| `npm run reference:cases` (after the final build, frozen tree, 13:36:50–13:42:32 UTC) | 0 | **37 files, 393 tests**; tree unchanged during the run (`diff-*-cases.sha`, `status-*-cases.txt`) | `cases.stdout`, `cases.stderr` |

No root `src/tests` file changed. No plan 2a instance asserts an output this
slice changes, so none was run singly. `reference:verify` was not run (left to
the coordinator's milestone gate).

## Protected documents

No `.principles.md`, `.spec.md` or glossary file was edited. Proposed patch
`/home/app/ramify-pb1-evidence/iteration11/proposed-spec-patches.diff`
(5 files, 7 hunks, `git apply --check` clean):

- `typescript-source-interpretation.spec.md`, status and closing paragraph:
  the definite `project-boundary-import` finding and the `excluded-target`
  limit are implemented (replaces "not yet implemented").
- `cross-module-importability.spec.md`, status: an import into a declared tree
  without package resolution is a definite violation.
- `module-description.spec.md`, status and implementation note: analysis
  enforces the declared-tree import rule (replaces "not yet implemented").
- `glossary.md`, status: imports into declared nested trees are enforced.
- `cli-invocation.spec.md`, "Files outside modules", last paragraph: the
  finding, its category, location and exit 1 for declared trees; the
  `excluded-target` limit for always-excluded paths and `outside-module-target`
  for the outside root (replaces "unverifiable ... await the project-boundary
  import rules", which this slice makes false).

## What iterations 12–18 still lack

- 12: precise observer membership for auxiliary creation/deletion (8C note).
- 14: affected path bases (`containment`, `excluded`), seed status and
  topology; a path in a declared tree still resolves `none` and widens.
- 15–17: changed-check path dispositions and `classification-changed`.
- 18: architect boundary metadata and measurement buckets.

## Gaps and decisions needed

1. **Affected edge.** The added edge from a boundary importer to an
   owned-ignored tree's owner replaces the widening the former limit caused;
   it is not named by the contracts. Accept, or leave it to iteration 14.
2. **Outside-project code.** Kept `outside-module-target` (see above); a
   rename such as `outside-project-target` would touch the I1-29 identity and
   A7-04 vocabulary and is not asked for.
3. **Catalog codes for declared trees.** A forwarding export into a declared
   tree keeps a nonblocking catalog note (`unresolved-original` or
   `incomplete-exports`) beside the re-export's definite finding, so its
   file's description stays incomplete.
4. **Diagnostic location.** At the access's selection, else its statement; no
   related location of the tree's declaration (`ProjectExclusion` has no span).
5. **Referenced resources (G3).** Not required by this slice: deliverable 2's
   counts already exclude non-interpreted files. The contracts place
   `referenced-resource` placement in the inventory, which iteration 8 owned;
   it remains open and needs an owner. An owned resource outside `src/` stays
   `unresolved`/`resource-target`.
6. **Link-selected compiler roots** (iteration 9 gap 1) and **`#` import-map
   entries to a dependency** (gap 3): no contract of this slice requires them;
   unchanged. A `#` entry into a declared tree is denied, like an alias; one
   into `node_modules` is an `excluded-target` limit.

## Coordinator review

The coordinator reviewed the decision order, the codes and counts, the new
analysis test and the consumer changes against the brief and the
specifications, authorized `proposed-spec-patches.diff` unchanged and applied
it with this slice. Accepted: the dependency edge from an importer to an
owned-ignored tree's owner in the affected query, which keeps an affected
answer from narrowing when the limit became a finding; `outside-module-target`
kept for targets outside the root; a nonblocking catalog note beside the
finding for a re-export into a declared tree; the finding located at the
selected name or statement. `referenced-resource` placement still has no
producing slice and is carried forward. The agent did not run
`reference:verify`; the coordinator's milestone gate runs the audit,
`reference:cases` and the full verification of plans 1, 2, 5 and 2A on the
committed candidate.
