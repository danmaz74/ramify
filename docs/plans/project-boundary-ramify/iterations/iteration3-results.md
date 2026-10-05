# Iteration 3 results: canonical path ownership provider

**Date:** 2026-10-03. **Status:** implementation receipt; see the coordinator review below. At the time of writing it awaited the
coordinator's review, protected-file comparison and iteration gate. Changes are
uncommitted in the working tree. This slice produces no case; PB1-03, PB1-04,
PB1-08, PB1-09, PB1-17, PB1-18 and PB1-19 receive classifier-level evidence
only. Discovery pruning, boundary validation on the filesystem, affected
containment answers and dispositions are not claimed.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit / tree | `3f4351720935802524ccbd4cbb0b46e5bf0f472b` / `1f0670cfadd80e33dea4beebbfd804d8aeac4193` |
| Contract revision | `contracts.md` blob `2aa469b0651d7dc39c7e7ab17d88135f1cc1db25`; `module-description.spec.md` blob `f0e5fe7bd377d944fab8bf05b903b69f401116ac`; `cli-invocation.spec.md` blob `2d0bf30b4e06a5b124562dfe521b4ee7b7b85e0d` |
| Audit configuration / lockfile | `ramify-audit.json` blob `b59f28f6…`; `package-lock.json` blob `fd3c84ba…` (both unchanged) |
| Working-tree diff at the reference run | `git diff` sha256 `f6529c1daf9f69da5b8244bc82dbc8130d89cb141079189c802f2a0a80e2dee8`, plus the new `ownership.ts` (sha256 `a2132aa6…`) and `path-ownership.test.ts` (sha256 `74e5a35b…`) |
| Node | v22.23.3 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration3/` |

## Changed behavior

1. **Ownership vocabulary.** `interfaces/project.ts` adds `PathOwner`
   (`{ id, parent, directory }`), `ProjectExclusion` (`{ kind, directory,
   owner }`, kinds `owned-ignored`, `external`, `scratch`, `repository`,
   `packages`, `output`, `generated`), `ProjectOwnership` (`{ modules,
   exclusions }`) and `PathOwnership` exactly as `contracts.md` states.
   `ProjectScope` gains `ownership`; `independentScopes` stays.
2. **One provider** (`subs/analysis/subs/project/src/ownership.ts`):
   - `buildProjectOwnership(modules, outputs)` returns the frozen table and the
     declaration evidence. Modules are byte-ordered by directory. Exclusions,
     byte-ordered by directory, are every module's scratch directory
     `<module>/src/tmp` (present or not), the configured output directories
     inside the root, and the valid declared nested trees. Only owned-ignored
     and scratch exclusions carry an owner.
   - Declaration evidence (`NestedTreeDeclaration`: declaring module,
     description file, statement index, kind, decoded string, directory span,
     normalized project-relative directory and a problem) applies only the
     checks that need no filesystem: malformed string (`invalid-path`),
     escape or equal to its module (`escape`), at or inside a child module
     (`child-module`), external under `src/` (`external-in-src`), at or beneath
     a reserved segment, an output directory or the module's scratch directory
     (`always-excluded`), and equal or nested declarations of any kind or module
     (`overlap`, every participant). A declaration with a problem contributes
     no exclusion. Nothing is reported yet; iteration 8 owns the Project
     issues, existence and symlink checks.
   - `classifyProjectPath(scope, path)` reads nothing. It rejects empty,
     absolute (including drive-qualified), backslash and noncanonical paths;
     leading `..` segments, `..` alone included, are `outside-project`; `'.'`
     is the root directory. Walking from the root, the first exclusion reached
     wins, as discovery stops there: a table exclusion at that prefix, else the
     canonical segment rule (`.git` repository; `node_modules`,
     `bower_components`, `jspm_packages` packages; the six generated forms of
     `isRamifyGeneratedSegment`), whose synthesized exclusion names the prefix
     through the matched segment and no owner. An owned-ignored or scratch
     exclusion returns `owned` with its owner and the exclusion; others return
     `excluded`. Otherwise the nearest module owns the path. A scope without a
     root module answers an in-project, non-excluded path as `invalid-path`
     (no contract variant states an unowned in-project path). An index of the
     table is cached per ownership object in a `WeakMap`, so a scope that
     crossed a JSON boundary classifies identically.
   - `reservedSegmentKind` now holds the repository/package names; the walk's
     `excludedDirectory` uses it with unchanged behavior.
3. **Scope metadata.** `inventoryProject` builds `scope.ownership` from its
   modules and the configuration's `outDir`/`declarationDir`
   (`scopeOwnership`), and the observer's local update recomputes it from the
   updated modules, as it does `walkedAreas`. Inventory, discovery and
   observation are otherwise unchanged; declared trees are still walked. The
   bounded report envelope sets an empty table where it already empties
   `walkedAreas`. Because the scope enters the inventory input identity,
   input IDs change.
4. **Relays.** Project exposes `classifyProjectPath` to parent (P6). Analysis
   A7 and root R4 add `PathOwner, ProjectExclusion, ProjectOwnership,
   PathOwnership, classifyProjectPath` beside `ProjectScope`.
   `scripts/validate-final-contracts.ts` records them as the named layer
   "Phase 1 project boundaries (path ownership)"; `descriptions.test.ts`
   lists them.
5. **Schema versions.** `ramify.affected/2` (analysis `affected-query.ts`,
   `interfaces/affected.ts`, `src/batch-process.ts`), `ramify.affected-cli/2`
   (CLI `affected-command.ts`, `interfaces/cli.ts`, `arguments.ts` help),
   `ramify.watch/2` (`watch-command.ts`, `run-cli.ts`, `interfaces/cli.ts`),
   `ramify.daemon-status/2` (`daemon-command.ts`, `interfaces/cli.ts`) and
   `ramify.ipc/2` (daemon `interfaces/daemon.ts` `Handshake`/`Welcome`/
   `DaemonRecord`, `src/interfaces/service.ts` `DaemonStatus`, `codec.ts`
   welcome, `host.ts` handshake comparison and welcome, `connection.ts` hello,
   `records.ts` reader, `start-daemon.ts` record, `service.ts` status). The
   daemon record keeps `ramify.daemon-record/1` with `protocol:
   'ramify.ipc/2'`. The codec's strict scope validator requires `ownership`
   with exactly `{ modules, exclusions }`, module records `{ id, parent,
   directory }` and exclusions whose owner is a string exactly for
   owned-ignored and scratch and null for the five other kinds.
6. **Readers updated.** Toolkit tests (`affected-batch`, `compiled-client`,
   `resident-cli`, `quick-environment`, analysis `affected-query`,
   `affected-session`, CLI `affected-command`, `arguments`, `changed-command`,
   `errors`, `exhausted-recovery`, `explore-command`, daemon `affected-service`,
   `codec`, `connect`, `discovery-fixture`, `ipc-fixture`, `ipc`, contexts
   `affected`, `scripted-driver`, service-api `project-binding-fakes`),
   `scripts/measurements/resident-workloads.mjs`, and the harness's expected
   values in `equivalence-watch.ts`, `equivalence-process.ts`, `ipc-cases.ts`,
   `process-cases.ts` (`I2-17:stale-record` writes a same-build record),
   `resident-cli-cases.ts`, `plan2a-cli-cases.ts` and the watch reader control
   `fixtures/plan2/watch-stream.mjs`. Scope literals in toolkit test fixtures
   gain an empty `ownership` table, which nothing in them reads. The CLI
   README and `docs/development/testing.md` name the version 2 identifiers;
   the project README describes the table and classifier.
7. **Incompatible-peer literal.** `errors.test.ts`, `exhausted-recovery.ts`
   and `changed-command.test.ts` now use daemon `ramify.ipc/0` against client
   `ramify.ipc/2`; the existing ipc tests and harness already used
   `ramify.ipc/0`.

## Tested case instances

`subs/analysis/subs/project/src/tests/path-ownership.test.ts` (93 tests).
Expected values are written from `fixtures.md` and the layout specification:

- **Written topology (PB1-08, PB1-17, PB1-18):** the exact byte-ordered table
  (five modules; `dist` output, `external-project`, `fixture-project`, five
  scratch directories, `subs/a/fixtures/sample`); 35 seeds covering inert,
  new and deleted root paths, auxiliary root and `a` paths, owned-ignored
  trees and their roots, scratch, analyzed testing `tmp`, the isolated
  grandchild, `a-extra`, `b`, `node_modules`, `dist`, generated catalogs and
  `../outside.ts`; the same answers from a scope copied through JSON; root inert
  paths never naming a descendant, and `subs/a-extra2` not matching
  `subs/a-extra` or `subs/a`.
- **Scratch position (PB1-09):** 13 positions; only `<module>/src/tmp` and
  below are scratch; `src/tests/tmp`, `tools/tmp`, `<module>/tmp`, `src/tmpfile.ts`,
  `src/tmp2`, `src/lib/tmp` and `subs/src/tmp` are ordinary.
- **Reserved exclusions:** repository, package, output and generated rules at
  several depths, near names as positive controls, and first-exclusion-wins for
  nested reserved segments inside declared trees.
- **Outside and invalid:** five outside forms; 16 rejected spellings; a
  scope with no root module.
- **Declaration evidence (partial PB1-03, PB1-04):** equivalent spellings
  normalize with located evidence; escapes, malformed strings, child overlap,
  external under `src/`, scratch/package/output/generated targets fail while an
  owned-ignored tree under `src/tests/` passes; equal and nested declarations
  of mixed kinds fail while `data2` and `datastore/x` pass; a rejected
  declaration excludes nothing; an invalid description contributes nothing.
- **Acquired scope (PB1-08, PB1-19):** `readProject` over the written
  topology on disk (external tree, scratch, `dist` and seeded files absent)
  yields exactly the table above; after deleting the whole project directory,
  every seed still classifies as expected.

`subs/daemon/src/tests/codec.test.ts` adds three tests: a status scope with
modules and owned/unowned exclusions, an empty table and a null scope
round-trip; 13 malformed scopes are rejected (missing or null table, missing
or extra members, owner rules per kind, unknown kind); a welcome accepts only
`ramify.ipc/2`.

## Commands and results

All runs used the working tree above, with `FORCE_COLOR` unset; vitest and
reference runs held `/tmp/ramify-audit-tests.lock`.

| Command | Result | Evidence |
| --- | --- | --- |
| `git diff --check` | Exit 0; the two new files have no trailing whitespace | `diff-check.out` |
| `npm run build` | Exit 0 | `build.out` |
| `npm run type-check` | Exit 0 (all four compiler scopes) | `type-check.out` |
| `npm run check:self` | Exit 0: passed, complete; 15 owners, 451 source files, 0 errors, 0 warnings, 0 analysis limits, 0 denied | `check-self.out` |
| `npx vitest run subs/analysis/subs/project/src/tests/path-ownership.test.ts` | Exit 0, 93/93 | `vitest-path-ownership.out` |
| `npx vitest run` project and descriptions test directories | Exit 0, 15 files, 494/494 | `vitest-project-descriptions.out` |
| `npx vitest run` analysis affected, inventory, modularity, report, session and validation files and the typescript test directory | Exit 0, 35 files, 435/435 | `vitest-analysis.out` |
| `npx vitest run` daemon and contexts test directories, service-api `project-view` and binding tests | Exit 0, 36 files, 437/437 | `vitest-daemon-contexts-service.out` |
| `npx vitest run` CLI test directory and root `affected-batch`, `compiled-client`, `resident-cli`, `quick-environment`, `cli-process`, `daemon-identity`, `lifecycle-process`, `resident-assembly` | Exit 0, 16 files, 303/303 | `vitest-cli-root.out` |
| `node --test scripts/measurements/resident-failure.test.mjs scripts/measurements/resident-composition.test.mjs` | Exit 0, 12/12 | `node-test-measurements.out` |
| Harness `final-contracts.test.ts` and `instances.test.ts` | Exit 0, 18/18 | `reference-focused.out` |
| `npm run reference:cases` (once, after build) | Exit 0: 36 files, 390/390 passed, 345 s (11:48:27–11:54:13 UTC) | `reference.stdout`, `reference.stderr`, `reference.exit` |

`node --import tsx scripts/validate-final-contracts.ts` exits 1 both on this
working tree and on an export of `3f435172` (`vfc-head.out`), with the same
five messages. A per-owner comparison (`layer-diff.ts`) shows the only
differences for root and analysis are Plan 7's affected relays, which no layer
records; the project owner matches. The new layer adds no difference.

## Protected documents

No `.principles.md` or `.spec.md` file was edited.
`proposed-spec-patches.diff` (one hunk, `git apply --check` clean) changes
`docs/architecture/cli-invocation.spec.md` line 228 from
`ramify.affected-cli/1` to `ramify.affected-cli/2`, the one protected passage
naming an identifier this slice advances as current. Lines 162–167 and 245–246
already name version 2.

## Remaining for later slices

- Discovery still walks declared trees, and no declaration is validated on
  the filesystem or reported (iteration 8). Until then the table can list a
  declared tree whose contents inventory still admits, and invalid
  declarations are silently absent from it.
- `independentScopes` remains (iteration 8). Affected path seeds still use the
  old bases; containment, excluded seeds and topology answers are iteration 14.
  Contexts, watchers and the CLI do not classify paths yet (15–17).
- `ramify.analysis/2` now carries `scope.ownership`; iterations 4, 8 and 11
  extend it further.

## Gaps for the coordinator

1. Left at `/1` deliberately: `scripts/reference-harness/plan2-instances.ts`
   row `I2-21:json-lines` ("One `ramify.watch/1` object per line"), compared
   byte for byte with its plan's `subcases.md`; historical plans.
2. Declaration problems are an internal Project type, not exposed; iteration 8
   decides the issue codes and messages. The child-module check covers a
   declaration at or inside a child module; a declaration that contains a child
   module is not flagged, since after pruning such a module would not be
   discovered, and the first-exclusion rule already shadows it.
3. An output directory equal to the project root or outside it is not entered
   in the table. An output directory equal to a scratch directory would make two
   exclusions at one directory; the index keeps the first in byte order of kind
   (`output`). Neither occurs in the toolkit.
4. A scope without a root module answers `invalid-path` for in-project paths;
   if a distinct answer is wanted, the contract needs a variant.
5. The installed `ramify-audit@0.3.2` decodes `ramify affected` strictly at
   version 1, so from this slice only full audits can run; its full mode does
   not query affected (`dist/audit-service.js` calls `askRamify` only for a
   partial plan), so this is not a blocker.

## Coordinator review

The coordinator reviewed the ownership provider, its types and the scope
wiring against the brief and the contracts, authorized
`proposed-spec-patches.diff` unchanged (one hunk, `ramify.affected-cli/2` in
`cli-invocation.spec.md`) and applied it with this slice. Entering valid
declared trees in the scope table while discovery still walks them until
iteration 8 is the intended reading of "scope metadata and declaration
evidence"; the user decided on 2026-10-03 that this interim state needs no
early rejection or warning. The installed audit's full mode does not query
the affected answer, so the version-2 affected documents do not block the
gate. The iteration gate runs on the committed candidate and its result is
recorded in the evidence directory named by that commit.
