# Iteration 14 results: affected selection over project ownership

**Date:** 2026-10-04. **Status:** implementation receipt for
[iteration 14](iteration14.md). It awaits the coordinator's review,
protected-file comparison and gate. Changes are uncommitted in the second
worktree, pipelined one iteration ahead of the coordinator's gate on
`d4e969c6`. This slice produces PB1-08, PB1-17, PB1-18 and PB1-19 at the
public-api evidence boundary (a real retained session); their final
qualification stays with iteration 20. `reference:verify` was not run: the
coordinator's gate runs it.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1-next`, branch `feat/project-boundary-ramify-next` |
| Base commit / tree | `d4e969c6` (tree `e38dab4b…`), clean at assignment, dependencies installed |
| Contract revision | `contracts.md` blob `ea76b4ec…` at the base, `3288425c…` after this slice's `referenced-resource` edit; `cli-invocation.spec.md` `984f88b9…`; `module-description.spec.md` `2e583562…`; `glossary.md` `ae8e3207…`; Plan 7 `contracts.md` `2948b8f1…` (protected and archived documents unchanged; one patch proposed) |
| Configuration | unchanged: `package.json`, `package-lock.json` `fd3c84ba…`, `ramify-audit.json` `b59f28f6…`, every `tsconfig*.json` and Vitest configuration; nothing under `ramify-agent/`, `/ramify-audit` or `/ramify` |
| Node / tools | v22.23.3; TypeScript 7.0.2; Vitest 4.1.11 |
| Changed | `subs/analysis/src/affected-query.ts`, `subs/analysis/src/interfaces/affected.ts`, `subs/analysis/subs/project/src/interfaces/project.ts`, `subs/analysis/subs/project/README.md`, `subs/cli/src/affected-command.ts`, `subs/cli/src/arguments.ts`, `docs/plans/project-boundary-ramify/contracts.md`; tests `subs/analysis/src/tests/affected-fixtures.ts`, `affected-query.test.ts`, `affected-session.test.ts`, `provenance-vocabulary.test.ts`, `subs/cli/src/tests/affected-command.test.ts`, `subs/daemon/src/tests/affected-service.test.ts`, `ipc.test.ts`, `src/tests/affected-batch.test.ts`, `batch-cli.test.ts`, `fixture.ts`, `resident-assembly.test.ts` |
| Added | `subs/analysis/src/tests/project-boundary-affected.test.ts`, this receipt |
| Evidence | `/home/app/ramify-pb1-evidence/iteration14/` |

## Changed behaviour

1. **Seed resolution by ownership** (`affected-query.ts`). Every path seed is
   classified once with Project's `classifyProjectPath` over the revision's
   `scope`, which reads nothing and checks no existence. Then:
   - `outside-project` (leading `..` segments): `status: 'outside-project'`,
     `module: null`, `basis: 'none'`, `exclusion: null`. Only these seeds widen,
     with `unowned-path`.
   - `excluded` (external tree, installed packages, repository metadata,
     configured output, generated catalogs, wherever the segment occurs):
     `status: 'excluded'`, `module: null`, `basis: 'excluded'` and the unowned
     exclusion. It selects nothing and widens nothing.
   - `owned` inside an owned-ignored tree or a scratch directory: the owner,
     `basis: 'containment'` and that exclusion. A scratch path beneath the
     owner's `src/` is containment, not area, since exclusions take precedence
     over source-area prefixes.
   - `owned` outside every exclusion: the first of `inventory` (an inventory
     file of that module), `declaration` (that module's `module.ramify` or
     `README.md`), `area` (one of that module's areas; only the classified
     module's areas are consulted, so the work is per seed, not per area of the
     project) and `containment`.
   - Any other malformed path is `invalid-query` with the classifier's message;
     `'.'` is the root directory, owned by the root by containment.
   Root-owned configuration, documentation and other inert paths select the
   root and its importers only; ancestry selects nothing. A classified owner
   missing from the inventory, which a scope built from that inventory cannot
   produce, answers `invalid-current` instead of an undefined module.
2. **Topology.** The selection's `scope` already carried `ownership` since
   iteration 3; this slice makes it the documented topology of the answer
   (`AffectedSelection.scope` comment) and asserts it exactly for the written
   topology. Repository, package and generated exclusions remain classifier
   segment rules rather than rows (iteration 3); a seed in one carries its
   exclusion. No per-file inert inventory is added.
3. **Iteration 11's edge, adjusted.** The edge from an importer of a path in
   an owned-ignored tree to the tree's owner is kept: the contract makes such
   a path its owner's and has an owned-ignored seed select the owner and the
   owner's transitive importers, so an importer of that path is an importer of
   the owner. The same reasoning applies to a scratch path, so the edge now
   also covers an `excluded` target whose exclusion has an owner (only
   scratch). That import still carries its `excluded-target` note, so the test
   selection widens by partial coverage as before; only `affectedModules`
   (the real closure) gains the importer. External, package, output,
   repository and generated targets add no edge. The test "a boundary import
   into an owned-ignored tree …" is kept and extended with a path seed in the
   tree; a new unit test covers the scratch edge.
4. **CLI** (`affected-command.ts`, `arguments.ts`). The human seed line adds
   the exclusion when one applies (`Path docs/roadmap.md: ramify (containment,
   owned-ignored docs)`, `Path node_modules/…: no module (excluded, packages
   node_modules)`); the help states which seeds select, which select nothing
   and that only a `../` path widens. The JSON document is unchanged apart from
   the selection's new seed members. Iteration 17 owns the remaining CLI output.
5. **Cancellation, limits, warm answers.** Unchanged: seed count bound 4,096,
   module and edge limits, the cancellation stride, the readiness checks and
   the warm query from retained facts.

## Document shapes and consumers

`ramify.affected/2` and `ramify.affected-cli/2` are extended without a new
version (contracts, schema versions, row "14 bases, seed status, exclusion and
topology"): `AffectedPathBasis` gains `containment` and `excluded`;
`AffectedPathSeed` becomes a union discriminated by `status`
(`owned`/`excluded`/`outside-project`) with a nullable `exclusion`
(`ProjectExclusion`, already relayed with `ProjectScope` since iteration 3, so
no exposure or companion changed and the final-contract validator needs no
layer). No other document changes shape.

Consumers migrated: the analysis projector and session (`interfaces/affected.ts`
types reach the worker, batch process and daemon unchanged, since they relay the
selection opaquely; `batch-process.ts` checks only `schemaVersion` and
`inputId`, so it needed no change), the CLI human renderer and help, and the
toolkit tests listed above. The daemon codec does not decode the selection.
No reference-harness file, measurement script or example reads the seeds: a
search of `scripts/` and `examples/` for the affected documents, `basis` and
`unowned-path` finds none, so no harness expected value changed.

## PB1-08, PB1-17, PB1-18 and PB1-19

`project-boundary-affected.test.ts` builds the written topology (fixtures.md)
with the installed link `node_modules/sample` into `a`'s ignored sample and
both ignored projects holding marked roots and source invalid if interpreted,
opens a real retained session, and asserts answers written from fixtures.md
and the contracts. Every query is wrapped in a file-system read counter that
must stay empty.

| Case | Test | Independent expectation |
| --- | --- | --- |
| PB1-17, PB1-18 | every written row, hot and warm | precondition: `completed`/`passed`/`complete`, no findings, no notes. Each fixtures.md row answers its seed exactly (status, module, basis, exclusion), changed and test modules, `dependency-closure`, no widening, complete coverage, and `scope.ownership` equal to the written topology (5 modules; output `dist`, external `external-project`, owned-ignored `fixture-project` and `subs/a/fixtures/sample`, five scratch directories); `../outside.ts` has no module, basis none, every module, `unowned-path`; the union of all rows changes app, a, grand and affects b, widened only by the outside seed; after `releaseCompiler` every row answers the same |
| PB1-17 | module and description seeds | `app` and `.`/`package.json`/`tsconfig.json` select app alone; `app/a` selects app and b, not grand; `a-extra` and `grand` select themselves; descriptions and READMEs are `declaration`, `api.ts` inventory, a new `src/` file area; the extended sibling name selects only itself; six malformed seeds are `invalid-query` |
| PB1-08 | inert and unanalyzed paths | auxiliary and testing source are inventoried and captured with bytes (positive control); prose, both scratch files and the ignored and external files have no inventory entry and no captured input holding bytes; nothing beneath a declared tree or `node_modules/` is an input; new/deleted inert paths resolve by containment without a read; editing all six files leaves a sweep `unchanged` and the `inputId` |
| PB1-19 | renames and changed declarations | both sides of a source move (a inventory, b area) and of a prose move (app, a-extra containment) resolve without reads; adding `owned-ignored "data"` and an absent `external "vendor"` to b makes `subs/b/data/x.json` b's with that exclusion and `subs/b/vendor/lib.ts` excluded at the new revision, the earlier sequence `invalid-revision`; a new child `subs/b/subs/c` takes its directory; removing the declarations restores containment; a fresh session over the same disk has the same `inputId` and an equal answer |

**Negative control:** with `affected-query.ts` replaced by the base
commit's, all 4 tests fail (`base-negative-control.out`); the candidate file
was restored and its SHA-256 verified (`affected-query.sha256`).

**Process check** (`process-check.sh`, built CLI, batch, on the toolkit):
from the root and from `subs/cli/src`, seeds `subs/analysis/src/affected-query.ts`
(analysis, inventory), `scripts/validate-final-contracts.ts` (ramify,
inventory, auxiliary), `docs/roadmap.md` (ramify, containment, owned-ignored
`docs`), `ramify-agent/package.json` (excluded, external), `node_modules/typescript/package.json`
(excluded, packages), absent `subs/cli/src/deleted-file.ts` (cli, area) and
`../outside.ts` (outside, none): exit 0, changed `ramify`, `ramify/analysis`,
`ramify/cli`, widening `partial-coverage` (the toolkit's 41 limits) and
`unowned-path`, topology 15 modules and 27 exclusions. The nested run equals
the root run in every member except `scope.invokedFrom` and the `inputId`,
which already depends on it. Excluded seeds alone change nothing (widened only
by partial coverage); an interior `..` exits 1 with `invalid-query`
(`process-summary.txt`, `process-*.out`).

## `referenced-resource` removed

The coordinator's choice of 2026-10-04 (relayed to the user, who may
override): nothing in Phase 1 produces that placement, since a non-source file
outside `src/` that source imports is found only by TypeScript resolution after
acquisition, the specification makes other owned files outside `src/` inert,
and the import stays a nonblocking `resource-target` limit. Removed from
`InventoryFile.placement` and its comment (`project.ts`), the Project README,
the iteration 4 type fixtures in `provenance-vocabulary.test.ts` (two
placements; a new negative fixture rejects `'referenced-resource'`) and
`contracts.md` ("Canonical path ownership and inventory": the union and the
sentence on referenced resources outside `src/`, replaced by one sentence that
Phase 1 produces no such placement and the import keeps a `resource-target`
limit). The contracts' other uses of "referenced resources" name resources the
existing stages read and are unchanged. No protected specification names the
value. `ramify.analysis/2` keeps its version: the closed placement field loses
a value nothing produced.

## Re-reasoned expectations

- `affected-query.test.ts`: the fixtures now carry an ownership table (each
  module with its scratch directory). Seeds gain `status` and `exclusion`.
  A7-02 "area-fixture boundary": `subs/a` is a's by containment and
  `subs/ab/srcx/x.ts` ab's by containment (replacing `subs/abc/x.ts`, which has
  no owner in a scope without a root); no widening. "unowned-root-file":
  `package.json` is the root's by containment, changed root and b, affected a,
  no widening. "docs-path": `docs/notes.md`, `.` and `subs/c/tests/loose.ts`
  resolve by containment, changed root and c, affected a, no widening.
  "dotdot-rejected": `../outside.ts` is now the outside form; interior `..`,
  `../`, `../a/./b` remain invalid. Added: scratch, owned-ignored/external,
  reserved, outside, invalid-current, scratch-edge and partial-coverage cases.
- `affected-session.test.ts`: seed shapes; "no-disk-or-report" adds
  `../outside.ts`, since `package.json` is now the root's and widens nothing.
- `affected-command.test.ts` "widened-exit-0": the widening seed is
  `../notes.md`; an added invocation shows `docs/notes.md` (root,
  containment) and an installed-package path (excluded) without widening.
- `batch-cli.test.ts` A7-11: the widening seed is `../notes.md`.
- `ipc.test.ts`: `package.json` is the root's by containment; the answer is
  `dependency-closure` without widening (the comment says so).
- `affected-batch.test.ts`, `affected-service.test.ts`,
  `resident-assembly.test.ts`: seed shapes only. `fixture.ts`: comment.

Stale prose (archived, not edited): Plan 7 `cases.json` A7-02
`unowned-root-file` and `docs-path` (basis none, widening) and
`dotdot-rejected` (any `..` invalid); Plan 7 `contracts.md` "Query
validation" and "Path resolution" (no containment, `none` for every unowned
path). No reference-harness instance row, count or identity changed, and no
harness row became stale.

## Commands and results

Focused commands ran without the lock; the harness files and
`reference:cases` held `/tmp/ramify-audit-tests.lock` (`run-locked.sh`).

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check`; new file checked for trailing whitespace | 0 | clean | `diff-check.log`, `new-file-whitespace.log` |
| `npm run build` (final, after the last source edit) | 0 | built | `build.out`, `build.exit` |
| `npm run type-check` | 0 | four scopes | `type-check.out` |
| `npx tsx scripts/validate-final-contracts.ts` | 0 | 15 owners, 596 files | `validate-final-contracts.out` |
| `npm run check:self` | 0 | passed, partial; 15 owners, 579 source files (578 + the new test), 17 resources, 8543 accesses, 0 errors, 0 warnings, 41 limits, 5474 allowed, 0 denied, 3025 external | `check-self.out` |
| `npx vitest run subs/analysis/src/tests/project-boundary-affected.test.ts subs/analysis/src/tests/affected-query.test.ts` | 0 | 2 files, 44 tests | `vitest-focused.out` |
| Negative control (base `affected-query.ts`) | 1 | 4 of 4 failed; restored, SHA-256 verified | `base-negative-control.out`, `affected-query.sha256` |
| `npx vitest run subs/analysis/src/tests/` | 0 | 44 files, 507 tests | `vitest-analysis-dir.out` |
| `npx vitest run subs/analysis/subs/project/src/tests/` | 0 | 14 files, 315 tests | `vitest-subs-analysis-subs-project-src-tests.out` |
| `npx vitest run subs/cli/src/tests/` | 1, then 0 | first run: the help reflow split the `--changed, --since and --deadline do not apply` phrase that A7-09 asserts; the line was restored; final 8 files, 245 tests | `vitest-subs-cli-src-tests.out` |
| `npx vitest run subs/daemon/src/tests/` | 0 | 21 files, 248 tests | `vitest-subs-daemon-src-tests.out` |
| `npx vitest run subs/daemon/subs/contexts/src/tests/` | 0 | 13 files, 177 tests | `vitest-subs-daemon-subs-contexts-src-tests.out` |
| `npx vitest run src/tests/affected-batch.test.ts src/tests/batch-cli.test.ts src/tests/resident-assembly.test.ts src/tests/compiled-client.test.ts src/tests/entry-boundaries.test.ts` (after the final build) | 0 | 5 files, 48 tests | `vitest-root-files.out` |
| Process check, built CLI `affected --batch` from the root and `subs/cli/src` | 0 (1 for the invalid seed) | as above | `process-*.cmd`, `process-*.out`, `process-summary.txt` |
| Harness `final-contracts.test.ts`, `completion-composition.test.ts` (locked) | 0 | 2 files, 13 tests (lock acquired 18:40:08 UTC after waiting from 18:33:01 UTC for the gate) | `h-final-contracts.log` |
| `npm run reference:cases` (locked, after the build, frozen tree, 18:40:10–18:45:54 UTC) | 0 | **37 files, 393 tests**; tree and status unchanged during the run | `cases.stdout`, `cases.stderr`, `diff-*-cases.sha`, `status-*-cases.txt` |

No reference instance asserts an affected answer (none of the files `rg -n
"affected" scripts/reference-harness -l` lists reads one), so no single
instance was run; `reference:verify` was not run; it is left to the
coordinator's gate.

## Protected documents

No `.principles.md`, `.spec.md` or glossary file was edited.
`proposed-spec-patches.diff` (passes `git apply --check`) changes
`docs/architecture/cli-invocation.spec.md`: it drops "When project boundaries
are implemented," from the `ramify affected` paragraph, to be applied once this
slice passes its gate, and states where the topology is carried ("The
selection's scope carries the revision's whole ownership topology: its modules
and their rooted exclusions, while repository, package and generated segments
are excluded wherever they occur"). Not protected but stale for the coordinator:
`daemon.md`'s affected row says each path seed carries "module and basis"
(now also status and exclusion).

## What iterations 15–17 still lack

- 15–16: changed-path dispositions and `classification-changed`; watcher
  registrations from the scope's exclusions (PB1-23).
- 16: the compiler records zero-byte existence probes for inert and scratch
  files it lists (`notes/design.md`, `src/tmp/throwaway.test.ts`,
  `subs/a/src/tmp/throwaway.ts` in the written topology, role `dependency`,
  no bytes) and the scratch directories' listings; a byte edit does not change
  them (PB1-08 here), but creating or deleting such a file changes the listing
  identity. PB1-23 owns that.
- 17: the CLI's affected and check output beyond the seed line added here.

## Gaps and decisions needed

1. **Scratch edge** (behaviour 3): an extension of iteration 11's accepted
   edge to scratch targets, reasoned from the contract; it changes only
   `affectedModules`, since such an import already widens by partial coverage.
   Accept, or restrict the edge to owned-ignored trees.
2. **Topology carrier**: read as the selection's `scope.ownership`, already in
   the version-2 shape; the reserved segment rules are not listed as data, so a
   consumer that needs them for directory exclusion has them only as the
   classifier's per-seed answers. If Phase 2 needs them as data, that is a
   shape change for the coordinator.
3. **`invalid-current` for an inconsistent scope**: unreachable through a
   session; it replaces an undefined module in the answer.
4. **CLI human line**: the exclusion suffix is a small addition ahead of
   iteration 17, so a human reader does not take an owned-ignored seed for an
   analyzed one.

## Coordinator review

The coordinator reviewed the seed resolution, the topology reading, the
widened dependency edge and the new test against the brief and the contracts,
authorized `proposed-spec-patches.diff` unchanged (`cli-invocation.spec.md`)
and applied it with this slice. This iteration ran one iteration ahead in the
second worktree and was committed to the phase branch after iteration 13's
gate was green. Accepted: the topology is the selection's `scope.ownership`;
the dependency edge also covers scratch targets, which their owner owns; the
`invalid-current` refusal for a scope naming a module the inventory lacks;
the exclusion suffix on the human seed line. Removing the unused
`referenced-resource` placement is the coordinator's choice of 2026-10-04,
relayed to the user, who may override it. The stale affected row in
`daemon.md` is corrected in iteration 15. The agent did not run
`reference:verify`; the coordinator's gate runs the audit, `reference:cases`
and the full Plan 1 and Plan 2 verification on the committed candidate.
