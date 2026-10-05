# Iteration 8A results: declared discovery

**Date:** 2026-10-03. **Status:** implementation receipt for sub-slice 8A of
[iteration 8](iteration8.md), as the coordinator split it after the step 1
assessment (8A declared discovery, 8B warnings and `ramify.check/2`, 8C
auxiliary activation). At the time of writing it awaits the coordinator's
review, protected-file comparison and iteration gate. Changes are uncommitted
in the working tree. PB1-03, PB1-04 and PB1-06 receive their acquisition
evidence here; PB1-05, PB1-09 and PB1-32 receive the evidence of this boundary
(inventory, pruning and the harness tree); PB1-07, PB1-11 and PB1-33 belong to
8B and 8C. No case is claimed complete before iteration 8 closes.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit | `12092fe9`, clean at assignment (`base-head.txt`) |
| Contract revision | `contracts.md`, the three owning specifications and the glossary unchanged; proposed patches below |
| Unchanged configuration | `package.json`, `package-lock.json`, `ramify-audit.json`, every `tsconfig*.json`, both Vitest configurations, `.gitignore`; nothing under `ramify-agent/` or `site/` |
| Working tree at the final reference run | `diff-before-reference.sha256` (tracked diff plus the two new files), `status-before-reference.txt`, compared after the run |
| Node | v22.23.3; Vitest 4.1.11; TypeScript 7.0.2 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration8/8a/` (step 1 assessment and prototype in `../assessment.md`, `../scratch/`) |

## Changed behaviour

1. **Pruning before descent** (`subs/analysis/subs/project/src/inventory.ts`).
   When discovery creates a module, it adds the module's scratch directory
   `src/tmp` and every nested tree the module declares whose directory string
   decodes strictly beneath it (`prunedDirectories`, `ownership.ts`) to the
   walk's pruned set. A pruned directory is observed as an entry of its parent
   and never entered, so no description, marked or not, manifest or file
   beneath it is read. Declarations of every ancestor are known before any
   descendant is walked (breadth-first walk).
2. **Inference removed.** The independent-scope skip (a directory with its own
   unselected `tsconfig.json`) and `excludedDirectory`'s `.reference-work`
   special case are gone, and so is `ConfigurationData.exclusions`, which
   existed only for that case (`configuration-data.ts`,
   `configuration-helper.ts`). Discovery boundaries are now the declared
   trees, scratch directories, installed packages, repository metadata,
   generated paths and compiler output directories.
3. **Declaration validation** (new `nested-trees.ts`). After the walk,
   `buildProjectOwnership`'s declaration evidence is reported as Project
   issues located at the directory string: a table problem (`invalid-path`,
   `escape`, `child-module`, `external-in-src`, `always-excluded`) is
   `invalid-nested-tree`, and every participant of an equal or nested pair is
   `overlapping-nested-tree`, naming the others. Every other declaration is
   checked through `Capture.kind`, one directory at a time from the declaring
   module down to the declared one, never listing: a symbolic link on that
   path or at the target, or a target that exists but is not a directory, is
   `invalid-nested-tree`; an absent owned-ignored target (or one beneath a
   non-directory) is `missing-owned-ignored`; an absent external target is
   valid. Those `kind` observations are captured inputs, so a declared tree's
   appearance, disappearance or replacement changes the sealed inputs (boundary
   existence evidence). Any issue makes acquisition invalid
   (`read-project.ts` already treats every issue so). The three codes join
   `ProjectIssue['code']`, the report's layout category map (`report.ts`) and
   the layout list of `report-data.ts`.
4. **Package manifests.** A walked directory without a description that holds
   a `package.json` is `undeclared-project-boundary`, located at the manifest,
   naming the declaration its nearest enclosing module would add
   (`owned-ignored` only inside `src/`), and becomes a layout-invalid boundary:
   no module receives its contents. A directory with a description is judged
   by its description, as before.
5. **Exact references** (`references.ts`) stop at a pruned directory with
   status `excluded`, without observing anything beneath it.
6. **Observer** (`observer.ts`). A path beneath a declared tree or scratch
   directory is ignored unless the compiler reported reading it (then the
   existing input rules apply); such a directory itself changing is
   structural. A description edit that changes its nested-tree statements
   rebuilds through acquisition instead of a local update. Auxiliary
   membership stays with 8C and iteration 12.
7. **`independentScopes` removed** from `ProjectScope`, the inventory snapshot,
   the bounded report envelope (`report.ts`) and the daemon codec's strict scope
   validator (`codec.ts`). This extends `ramify.analysis/2`,
   `ramify.affected/2`, `ramify.affected-cli/2`, `ramify.watch/2`,
   `ramify.daemon-status/2` and `ramify.ipc/2` without a new identifier.
   `ramify.check/1` and `ramify.measure/1` carry no scope and keep their
   versions, as decided for 8A.
8. **Modularity producer** (`subs/analysis/src/modularity.ts`,
   `interfaces/modularity.ts`): `provenance.omittedScopes` lists the
   owned-ignored and external directories of `scope.ownership.exclusions`, in
   byte order; scratch and other always-excluded paths are not listed. The
   report advances to **`ramify.modularity/3`**. The probe renderer
   `scripts/probes/modularity/markdown.ts` labels the field "omitted declared
   nested trees". Nested-tree and excluded occurrences are not produced yet;
   their bucket stays as iteration 4 left it (counted with unresolved,
   unattributed) for iteration 9 to place.
9. **Copies that omit owned-ignored trees** recreate the root description's
   owned-ignored directories empty (`restoreOwnedIgnored`, reading the copied
   description's `owned-ignored "…"` lines):
   `src/tests/dependency-diagram-daemon.test.ts` (`copyToolkit`),
   `scripts/measurements/plan2b-views.ts` (`copyProject`, used by AV34 and
   `plan2b.mjs`), `scripts/measurements/plan2a-fixtures.mjs`
   (`isolatedProject`), `subs/integration-tests/src/browser-acceptance.ts`
   (`isolatedProject`), and the harness's `plan2a-workflow-cases.ts`
   (`isolatedGitProject`) and `plan2a-completion-cases.ts` (`isolatedCopy`).
   Reasoning: the rule requires a real directory; contents are never read, so
   an empty directory is an equivalent input. Iteration 7's AV34 adaptation is
   kept unchanged.
10. **Q4, the example's own work directory (provisional, pending the user).**
    `examples/collection-review/module.ramify` gains, as its last statement,
    `external ".reference-work"` with a comment. Without it, the example's own
    evaluation (`check:reference`, the in-place analyses in
    `src/tests/dependency-analyzer-process.test.ts` and harness
    `plan2a-availability-cases.ts`) would walk the marked project copies that
    harness runs (Plan 1 focused cases, `gate-cases.ts`) write there. That
    directory used to be skipped only by the removed inference. The change is
    one hunk and separable.
11. **Documents.** The Project README describes the pruning, the manifest rule,
    validation, boundary evidence and the observer rule.

## Q4: what the example's declaration shifted

The statement is last, so no exposure statement index, span or exact reference
changes. Reports of the example gain one ownership exclusion
(`{ kind: 'external', directory: '.reference-work', owner: null }`) and the
description's bytes and input identity change. One expectation changed:

| Expectation | Change | Reasoning |
| --- | --- | --- |
| `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`, the reviewed statements of `examples/collection-review/module.ramify` | `tree('external', '.reference-work')` appended | The fixture lists every statement of every committed description, as it lists the toolkit root's eleven |

No harness expectation changed for it; the final reference run passed with it (below).
Summary counts of the example are unchanged (15 owners, 54 source files,
5 resources, 313 accesses, 0 errors, 2 warnings, 179 allowed, 134 external).

## Re-reasoned expectations

| File | Change and reasoning |
| --- | --- |
| `project/src/tests/project.test.ts` "keeps independent projects out of enclosing discovery" | Now "keeps a declared nested project out of enclosing discovery and reports an undeclared one". Undeclared, `examples/demo` (marked root, own configuration and manifest) is one located `undeclared-project-boundary`, because a configuration no longer ends discovery and the description is judged before the manifest. Declared `owned-ignored`, the project is acquired with one module and no input beneath the tree |
| `project/src/tests/root-selection.test.ts` | The written topology now declares its trees as `fixtures.md` states: root `owned-ignored "fixture-project"` and `external "external-project"` (absent), `a` `owned-ignored "fixtures/sample"`. "acquires the marked root …" expects the three declared exclusions and no input beneath the trees, instead of `independentScopes`. The "iteration 8 will prune" test becomes "never reads a marked description in a declared tree, and reports it once its declaration is removed, configuration or not". Two tests whose root description is invalid now also expect the two marked projects as `undeclared-project-boundary`: an invalid description declares no nested tree, so discovery enters them. Their own `invalid-description` assertions are unchanged |
| `project/src/tests/fixtures.ts` `declaration` | The local header double also reflects `owned-ignored "…"` / `external "…"` lines as nested-tree statements with their spans |
| `analysis/src/tests/modularity*.ts`, `dependency-diagram.test.ts` | `ramify.modularity/3`; the fixture takes ownership `exclusions` instead of `independentScopes`; the identity test expects `['examples/app', 'site']` from an external, an owned-ignored and a scratch exclusion (scratch not listed) |
| `analysis/src/tests/toolkit-boundaries.test.ts` | New test: the scope's keys exclude `independentScopes`; no file, outside-module file, warning, module or captured input lies beneath any of the eleven declared trees; the harness tree's directory is observed; no description input under `ramify-agent/` or the harness |
| `cli/src/tests/measure-command.test.ts` MM18 | The fixture's nested project `examples/independent` is declared `owned-ignored`, as the new model requires; its expected attribution (`unobserved`) is unchanged |
| Ten test fixtures | The empty `independentScopes: []` literal is removed (linking, typescript fixtures, path-ownership, affected fixtures, codec, ipc, contexts affected, root-resolution, scripted driver, service-api project view) |

G10, nested `package.json` fixtures: every toolkit test fixture that writes a
`package.json` writes it in a module's own directory
(`session-input-witness.ts` `subs/provider/`, which is a module) or under
`node_modules`; `session-counters.test.ts` and `covering.test.ts` name
`subs/tool/package.json` as a scripted input, not a file. None needed a
change beyond MM18, `project.test.ts` and the root-selection topology above.

Q6, rows whose prose no longer describes what the case asserts: none in 8A. The
rows named in the step 1 assessment (I1-02:stray-description, the I1-28
warning rows, I1-29:outside-module-target, I5-11) concern the outside warning,
auxiliary source or `ramify.check/1`, which change in 8B and 8C.

## Cases with evidence at this boundary

`subs/analysis/subs/project/src/tests/project-boundary-inventory.test.ts`
(20 tests), with expected codes, paths and spans written from the contracts:

- **PB1-03:** escape, external under `src/`, declaration inside a child module,
  declaration at an always-excluded path and a malformed directory string are
  each one located `invalid-nested-tree`. A missing owned-ignored directory is
  `missing-owned-ignored`, while an absent external is valid (positive
  control). A declared file is `invalid-nested-tree` for either kind.
- **PB1-04:** equal normalized directories across kinds (`"data"`,
  `"./data"`) and nested ones (`"data"`, `"data/inner"`) report every
  participant as `overlapping-nested-tree`. A parent's tree meeting a child's
  is already `invalid-nested-tree` (inside a child module). Equivalent
  spellings of distinct real directories pass. A declared path through a
  symbolic link, or a link as the target, is `invalid-nested-tree`, and nothing
  behind the link is observed.
- **PB1-05 (inventory):** owned-ignored and external trees holding marked
  roots, configurations, manifests, test-shaped files and malformed or
  misplaced descriptions contribute no module, file or input, and the
  acquisition is valid. Each tree's own directory is observed. The owned-ignored
  sample selected as its own root is acquired independently. Edits beneath a
  tree leave the sealed inputs coherent; an absent external tree appearing and
  an owned-ignored tree disappearing change them, and the next acquisition
  reports `missing-owned-ignored`.
- **PB1-06:** a package manifest in an undeclared directory (and inside `src/`)
  is a located `undeclared-project-boundary` suggesting the declaration, and
  nothing beneath it is attributed. Declared, both are pruned. A marked
  description with its own configuration is reported. A directory holding
  only a `tsconfig.json` is walked (its nested stray description is reported).
- **PB1-09 (pruning):** files in `src/tmp` and `subs/a/src/tmp`, including a
  marked description and a manifest, are neither inventoried nor observed,
  while `src/tests/tmp` and `src/tools/tmp` stay owned source in their areas.
  The scratch exclusions keep their owners. An exact reference into scratch is
  excluded without listing it.
- **Observation:** changes beneath a declared tree or scratch directory leave
  the observer unchanged. The declared directory's disappearance rebuilds to
  `missing-owned-ignored`, and removing a declaration rebuilds to the reopened
  tree's layout error.
- **PB1-32 (this boundary):** `toolkit-boundaries.test.ts` and the recorded
  batch check below show the harness tree contributing no inventory file,
  input, warning, module or finding.

A negative control disabled the pruning line: 7 of the 20 tests failed
(`vitest-negative-control.log`), and the file was restored byte-identically.

## Commands and results

Build, test, self-check and reference runs held `/tmp/ramify-audit-tests.lock`.
No view was materialized; `src/.ramify/` was absent before the reference runs.

| Command | Result | Evidence |
| --- | --- | --- |
| `git diff --check` (and a trailing-space search of the two new files) | Exit 0 / none | `diff-check.log` |
| `npm run build` | Exit 0 | `build.log` |
| `npm run type-check` | Exit 0, all four scopes (a first attempt before rebuilding failed only because the harness resolves `ramify.ts/analysis` types from the stale `dist/`) | `type-check.log`, `type-check-1.log` |
| `npm run check:self` | Exit 0: passed, complete; 15 owners, 460 source files (458 plus `nested-trees.ts` and the new test), 17 resources, 7064 accesses, 0 errors, 0 warnings, 0 analysis limits, 4938 allowed, 0 denied, 2126 external | `check-self.log` |
| `dist/src/ramify check --root . --batch --format json` | Exit 0; scope keys `configuration, invokedFrom, ownership, root, selection, walkedAreas`; the eleven declared trees in the ownership table; 0 inventory files, 0 inputs, 0 accesses and 0 diagnostics beneath any of them; each tree's directory observed (`.cucumber-viz`, `.history`, `.playwright-mcp` as `absent`); no `ramify-agent` description read | `check-json.json`, `check-json-summary.json` |
| `ramify check --batch` from `examples/collection-review` | Exit 0; root the example, found; passed, complete; 15 owners, 54 source files, 313 accesses, 0 errors, the 2 existing outside warnings; exclusions include the new external `.reference-work` | `check-example.log`, `check-example.json` |
| `npx vitest run subs/analysis/subs/project/src/tests/project-boundary-inventory.test.ts` | Exit 0, 20/20 | `vitest-project-2.log` (whole directory) |
| Negative control (pruning disabled) | Exit 1, 7 failed | `vitest-negative-control.log` |
| `npx vitest run subs/analysis/src/tests/toolkit-boundaries.test.ts subs/analysis/src/tests/modularity.test.ts subs/analysis/src/tests/modularity-batch.test.ts` | Exit 0, 3 files, 24/24 | `vitest-brief-modularity.log` |
| `npx vitest run subs/analysis/subs/project/src/tests/` | Exit 0, 12 files, 290/290 (270 before) | `vitest-project-2.log` |
| `npx vitest run subs/analysis/src/tests/` | Exit 0, 40 files, 462/462 | `vitest-analysis-1.log` |
| `npx vitest run subs/analysis/subs/descriptions/src/tests/` | Exit 0, 6 files, 292/292 (after the Q4 fixture line; 1 failure before it) | `vitest-descriptions.log` |
| `npx vitest run subs/analysis/subs/typescript/src/tests/` | Exit 0, 19 files, 215/215 | `vitest-typescript.log` |
| `npx vitest run subs/daemon/src/tests/` | Exit 0, 21 files, 248/248 | `vitest-subs-daemon-src-tests.log` |
| `npx vitest run subs/daemon/subs/contexts/src/tests/` | Exit 0, 13 files, 177/177 | `vitest-subs-daemon-subs-contexts-src-tests.log` |
| `npx vitest run subs/service-api/src/tests/` | Exit 0, 7 files, 34/34 | `vitest-subs-service-api-src-tests.log` |
| `npx vitest run subs/cli/src/tests/` | Exit 0, 8 files, 245/245 | `vitest-cli.log` |
| `npx vitest run` on the two `subs/integration-tests/src/*.test.ts` files | Exit 0, 4/4 | `vitest-integration.log` |
| `npx vitest run` on the 20 root `src/tests/*.test.ts` files, named explicitly | Exit 0, 20 files, 103/103 | `vitest-root.log` |
| Harness: `self.test.ts`, `final-contracts.test.ts`, `modularity-markdown.test.ts`, `cli.test.ts`, `session.test.ts` | Exit 0, 5 files, 20/20 | `harness-focused-1.log` |
| Harness: `plan2b.test.ts -t AV34` | Exit 0, 2 passed, 4 skipped | `harness-av34.log` |
| `npm run reference:cases`, first run | Exit 1: 37 files, 391/393. `plan2b.test.ts` AV29/AV31 "other-path toolkit" `bytesWritten` 954450 vs 954451 and `verify.test.ts` iteration 6. This run was not on a frozen tree: the Project README, `observer.ts` and the probe renderer were edited while it ran, between the copies it compares | `reference-cases-1.log` |
| `node --import tsx scripts/reference-harness/verify.ts --plan 1 --format json --iteration 6` | Exit 0, 105/105 required passed | `verify-iter6.json` |
| `npm run reference:cases`, final run on the frozen tree (started 18:05:56 local, after the final build) | Exit 0: 37 files, 393/393, 345.53 s; the same 40 `ExperimentalWarning` lines as iteration 7. Working-tree identity (tracked diff, the new files and this receipt) and status identical before and after; only this row was written afterwards | `reference-cases-2.log`, `diff-before-reference.sha256`, `diff-after-reference.sha256` |

No `*.test.mjs` file changed, so no `node --test` run was needed.

## Protected documents

No `.principles.md` or `.spec.md` file and not the glossary changed
(`protected-compare.sh 12092fe9`: none). Proposed patches, checked with
`git apply --check`, are in
`/home/app/ramify-pb1-evidence/iteration8/proposed-spec-patches.diff`:

- `module-description.spec.md`: the status header, the opening note of
  "Declared Nested Trees Bound Interpretation" and the closing implementation
  note say discovery validates declarations and prunes declared trees and
  scratch directories, and never reads a marked description inside a declared
  tree. Auxiliary-source analysis, the compiler-selection warning and the
  import rule stay pending.
- `cli-invocation.spec.md`: the "Pending declared trees" note becomes the
  implemented statement. The "Files outside modules" pending note records that
  pruning is implemented while auxiliary analysis and warnings remain pending,
  and its sentence calling a nested independent project silent now says an
  undeclared nested project is a layout error.
- `modularity-report.spec.md`: `omittedScopes` lists the declared nested-tree
  directories (scratch and other always-excluded paths not listed), the
  provenance paragraph says "omitted declared nested trees", and the schema
  paragraph names `ramify.modularity/3` and what version 3 changed. The
  auxiliary-source sentence stays prospective. Where nested-tree and excluded
  occurrences count is left to iteration 9; the producer does not decide it
  now, because no such target is produced.
- `glossary.md` status line (not a protected suffix, but an authoritative model
  document, so proposed rather than edited): discovery implements the root
  marker and declared nested trees; the rest is pending.

## What 8B and 8C still lack

- **8B:** `ProjectWarning` (with the transitional `outside-module-source` code),
  the `compiler-selected-owned-ignored` and `compiler-selected-scratch`
  warnings (PB1-11), `ramify.check/2` and its readers. Until then a
  compiler-selected file in a declared tree or scratch directory is still
  reported by the outside warning and read as a dependency input, as before.
- **8C:** auxiliary inventory, `ramify.measure/2` and the decisions C1, Q2 and
  Q3 of the assessment; the widened self-check; PB1-07 and PB1-33.

## Gaps for the coordinator

1. **Compiler selection enumerates excluded directories.** When an `include`
   pattern covers a scratch directory or a declared tree, TypeScript's
   configuration evaluation lists it through the capture to compute the
   selection, even when `exclude` names it. The entries' kinds then become
   configuration-evaluation inputs (observations, not reads). Discovery reads
   nothing there. The toolkit's configurations cover no declared tree and
   exclude scratch, so its inputs are unaffected (`check-json-summary.json`).
   The PB1-09 tests use a `files` configuration for that reason. This belongs
   with configuration capture (contexts, iterations 15–16) or with 8B's
   compiler-selection work; it is not changed here.
2. **Overlap among already-invalid declarations.** As iteration 3 built the
   table, the overlap rule compares only declarations without another problem.
   A parent's declaration inside a child module is reported once
   (`invalid-nested-tree`), and a child's tree beneath it is not additionally
   `overlapping-nested-tree`. Acquisition is invalid either way.
3. **An invalid description declares nothing.** When a description fails to
   parse, its declared trees are unknown, so discovery enters them and reports
   what it meets there, such as marked projects (two root-selection tests show
   this).
4. **Q4 is provisional** pending the user's confirmation of the example's
   `external ".reference-work"`.
5. The watcher's `.reference-work` exclusion stays for iteration 16 (G7).

## Coordinator review

The coordinator reviewed the assessment before any edit and split iteration 8
into 8A (declared discovery), 8B (warnings) and 8C (auxiliary source), each
committed with its own gate. For 8A the coordinator reviewed the pruning,
the declaration validation and the removal of `independentScopes`, authorized
`proposed-spec-patches.diff` unchanged (`module-description.spec.md`,
`cli-invocation.spec.md`, `modularity-report.spec.md` and the glossary's
status line) and applied it with this slice. Appending
`external ".reference-work"` to the example's root description is the
coordinator's provisional choice, pending the user's decision. Accepted:
an already-invalid declaration gains no overlap finding; an unparseable
description declares nothing. The compiler's listing of excluded directories
when an `include` covers them is handed to 8B. The iteration gate runs on the
committed candidate and its result is recorded in the evidence directory
named by that commit.
