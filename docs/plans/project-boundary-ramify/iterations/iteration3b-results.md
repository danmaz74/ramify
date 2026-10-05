# Iteration 3B results: root selection and root-marker validity

**Date:** 2026-10-03. **Status:** implementation receipt. At the time of
writing it awaits the coordinator's review, protected-file comparison and
iteration gate. Changes are uncommitted in the working tree. PB1-42 and PB1-43
pass at this slice's focused evidence boundary. PB1-44 passes the focused
suites, the self-check and the locked reference run recorded below; its full
toolkit suite runs in the coordinator's audit gate and is not claimed here.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit / tree | `de783a7b` (tree `ebd1dbcb…`), clean at assignment |
| Contract revision | `contracts.md` blob `8712aace…`; `module-description.spec.md` blob `70689be3…`; `cli-invocation.spec.md` blob `0c183a8f…`; `architect-view.spec.md` blob `90add232…` (all unchanged) |
| Audit configuration / lockfile | `ramify-audit.json` blob `b59f28f6…`; `package-lock.json` blob `fd3c84ba…` (both unchanged) |
| Working tree at the reference run | `git diff` against `de783a7b` sha256 `33b4b096…` (50 files), plus three new files: `subs/analysis/subs/project/src/marker.ts` (sha256 `c22a8c5e…`), `subs/analysis/subs/project/src/tests/root-selection.test.ts` (`c5a7bef2…`), `subs/analysis/src/tests/root-marker.test.ts` (`d3fb2cc4…`) |
| Node | v22.23.3 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration3b/` |

## Changed behavior

1. **Marker determination.** The Descriptions owner adds
   `readRootMarker(file, text): TextSpan | null` in `src/parse.ts` and the type
   `RootMarkerReader`. It tokenizes the text, takes the second significant line
   after a `ramify` line as the module header, recognized by the same
   `moduleHeader` rule the parser now uses, and returns the span of a leading
   `root`. Later lines never matter; a missing or misplaced header gives null.
   Descriptions exposes the function to analysis; analysis relays the type to
   its parent and descendants and root relays it to descendants, because
   `ProjectReadOptions` now names it (signature companion). Project adds no
   grammar: `src/marker.ts` only decodes. Valid UTF-8 is decoded whole; for
   invalid UTF-8 the reader receives the leading physical lines that decode, so
   an encoding error before or on the module line leaves the description
   unmarked and one after it does not.
2. **Injection.** `ProjectReadOptions` gains the required `marker` beside
   `parse`, and `resolveProjectRoot(request, read, signal?, known?)` takes the
   reader as its second argument. Analysis supplies `readRootMarker` at every
   acquisition and resolution site: `resolveProject`, the session engine's two
   observations and its invocation check, batch `run-analysis`, `validation`,
   `inventory`, `session-revision` and `dependency-analyzer`. Every command that
   selects a project reaches Project's one `selectRoot`.
3. **Selection** (`selection.ts`). Without `--root`, the climb reads each
   `module.ramify` it meets and stops at the nearest marked one; unmarked
   descriptions never stop it. The `subs/` advance and the missing-parent check
   are removed. With no marked description, `root-not-found` (unavailable,
   exit 2) names the working directory, and, when an unmarked description lies
   at or above it, the nearest one: `No marked project root at or above <cwd>;
   the nearest description is <path>: add root before module on its module
   line if it is the project root`. `--root` on an unmarked description is
   `unmarked-root-description` (invalid, exit 1): `<path> does not carry the
   root marker: add root before module on its module line to declare the
   project root`. `--root` on a directory without `module.ramify` stays
   `missing-root-description`. A linked or non-file `module.ramify` is not read,
   so it still ends the climb and its existing rules reject it
   (`symlink-description` at resolution, `invalid-description` in acquisition).
4. **Reuse evidence** (`resolve-root.ts`, `capture.ts`). `AnsweredQueries`
   gains `markers`, the path and determination of every description selection
   read. The replay observes those paths without reading them, and
   `Capture.answers(unread)` (formerly the `answers` getter) leaves their bytes
   out of the digest; `unchanged()` reads each one again and re-decides its
   marker. A marker change at any read description makes a reused resolution
   stale; a marker-preserving edit leaves it reusable. A configuration with
   references keeps every other query, as before, with the same exclusion.
5. **Acquisition validity** (`inventory.ts`). Discovery decides the marker of
   every regular description it meets, at every position. A root description
   without it is `unmarked-root-description` (also covering a change between
   selection and reading); the root still contributes its module, so its
   children are not reported again. Any other marked description is
   `undeclared-project-boundary`, located at the marker through the new optional
   `ProjectIssue.span`, with the message `Invalid module boundary:
   undeclared-project-boundary at <line>:<column>: a marked project root must
   lie in a declared nested tree; declare owned-ignored "<dir>" or external
   "<dir>" in <enclosing description>` (only `owned-ignored` beneath the
   enclosing module's `src/`, where `external` is invalid). It takes precedence
   over `description-in-src`, `reserved-container` and `stray-description`; the
   directory contributes no module and its contents are attributed to none, so
   a description beneath it is a stray, as beneath any layout-invalid
   description. A consequence: descriptions at those invalid positions are now
   read, so they appear as `description` inputs.
6. **Observer.** A description edit that gains or loses the marker (a child
   gaining it, the root losing it) rebuilds through acquisition instead of a
   local update.
7. **Codes and categories.** Both codes join `ProjectIssue`, the invalid sets
   in `resolve-root.ts` and `read-project.ts`, the layout list in
   `report-data.ts` and the carried categories in `report.ts`. Report
   diagnostics use `issue.span` as their location when present
   (`report-data.ts`, `analysis/src/inventory.ts`).
8. **`ramify.analysis/2`.** The two codes are new values of the open code
   fields; no identifier advances. `ProjectIssue.span` is not serialized: the
   report carries it only as the existing diagnostic `location`.
9. **Declared trees and inferred independent scopes.** Declared trees are not
   pruned: a marked description inside a declared `owned-ignored` or
   `external` tree is read and reported as `undeclared-project-boundary` when
   discovery reaches it (tested). A directory with its own `tsconfig.json`
   that the root configuration does not select is still skipped as an
   independent scope, so a marked description inside one is never read and
   contributes nothing (tested). Selection from inside either kind of tree
   selects that tree's own marked root, independently of declarations.
10. **Toolkit self-check.** `examples/collection-review` carries the marker and
   lies inside the toolkit tree without a declaration. It stays valid because
   it holds its own `tsconfig.json`, which the toolkit configuration does not
   select, so the toolkit walk skips it as an independent scope and never reads
   its description; the self-check's scope lists `examples/collection-review`,
   `ramify-agent`, `scripts/probes/fixtures/compiler-api`,
   `scripts/probes/fixtures/plan2a-symbol-details`, `scripts/reference-harness`
   and `site` as independent scopes. Iteration 7 declares it.
11. **Documents.** The Project, Analysis and Descriptions READMEs describe the
   marker climb, the injected reader, the two codes and the reuse evidence.
   No other non-protected document under `docs/architecture` or
   `docs/development` described the old climb as current.

## Tested case instances

`subs/analysis/subs/project/src/tests/root-selection.test.ts` (13 tests),
over the plan's written topology (`app` marked; `a`, `grand`, `b` unmarked;
`subs/a/fixtures/sample` and `fixture-project` marked with their own
configurations). The marker reader and header parser are this owner's local
doubles over real bytes, as the other Project tests use.

- **PB1-42.** From `subs/a/subs/grand/src`, `subs/a/subs/grand`, `scripts/` and
  `tools/helper` beneath an unmarked stray `tools/module.ramify`: `app`,
  found; `--root ../..` from `subs/b`: `app`, given (positive control). From
  inside `sample` and `fixture-project`: each its own root. Marking `b` selects
  `b` from inside it. A marked root followed by a malformed line stops the climb
  and acquisition reports `3:1: unknown-statement … [43,46)`. An invalid byte
  after the module line keeps the marker (acquisition reports
  `invalid-encoding`); one before it removes the marker (`root-not-found` naming
  `subs/a/module.ramify`); a lone invalid byte as `--root` is
  `unmarked-root-description` without calling the parser. `root-not-found` names
  the working directory alone with no description above, and the nearer of two
  unmarked descriptions otherwise. `--root subs/a` is `unmarked-root-description`
  with the exact message in resolution and acquisition; removing `app`'s marker
  makes a found selection from `app` `root-not-found` and an explicit one
  invalid. Reuse: marker-preserving edits of both read descriptions, and a
  marked description and configuration above the root, reuse the resolution
  with no helper; `a` gaining the marker, `a` and `app` losing it, `app`
  regaining it, and an explicit root losing it each make it stale.
- **PB1-43.** The marked root with unmarked children acquires, each module's
  description equal to the parser's output, with no description input from
  either independent scope. A reader that answers marked for selection and
  unmarked for acquisition gives exactly one `unmarked-root-description` and
  keeps all four modules. A marked `subs/b` is `undeclared-project-boundary`
  with span `{9,13,2,1}` and the exact message, no `app/b` module and no
  `subs/b/` file; its unmarked child is a stray. Marked descriptions at
  `tools/` and `subs/a/src/vendor/` are located boundaries naming `module.ramify`
  and `subs/a/module.ramify` (the latter suggesting only `owned-ignored
  "src/vendor"`). A marked description in a declared but configuration-less
  tree is reported (pre-iteration-8 state). An observed project stays local for
  a marker-preserving edit and reports invalid when `b` gains the marker or the
  root loses it.

`subs/analysis/src/tests/root-marker.test.ts` (4 tests) runs the same rules
through `analyzeProject` and `resolveProject` with the real reader and parser:
the marked root passes given and found with identical results and the marker
span `{9,13,2,1}`; a later syntax error stops the climb and is reported as
`unknown-statement` at `{92,95,4,1}`, category description; an unmarked
`--root` is one `unmarked-root-description` diagnostic, category layout; no
marked description is `root-not-found` with the hint; a marked child is one
`undeclared-project-boundary` diagnostic located at `{28,32,3,1}`.

`root-marker-grammar.test.ts` gains 17 reader cases (marked, unmarked, later
errors, tab, BOM and CRLF, comments, missing and misplaced headers, a second
module line, misplaced `root`, empty text) and an agreement check with the
parser on every valid case.

**PB1-44.** No root that 3A missed was exposed: with the rule enforced every
focused suite, the self-check and the reference run pass. The committed
headers are unchanged from 3A.

## Changed expectations, reasoned from R7

- `project.test.ts` "rejects malformed description UTF-8 before calling the
  parser": the byte now follows a marked module line, since a lone invalid
  byte has no readable module line and would be an unmarked root; the test
  keeps its meaning (parser never called, `invalid-encoding`).
- `project.test.ts` "rejects a missing parent marker above a child directly
  under subs" becomes two tests: an unmarked orphan with no marked ancestor is
  `root-not-found` naming its working directory and description; an unmarked
  orphan beneath the marked root is that root's `stray-description`.
- `project.test.ts` nested `examples/demo`: unchanged; it is an inferred
  independent scope, still skipped.
- `resolve-root.test.ts` invalidation test: a marked parent above the marked
  `child` is no longer read, so the resolution is reused; removing `child`'s
  marker moves the root to `parent`, restoring it moves it back; a marked
  `src/module.ramify` still becomes the root; an unmarked one there makes a new
  resolution with the same root. The symlinked root description step is
  unchanged (`symlink-description`). The other tests only pass the reader.
- `analysis/src/tests/root-resolution.test.ts`: the `subs/branch/src`
  description is now marked, since only a marked one moves the root; the
  resolver mock reads `known` at argument index 3.
- `descriptions.test.ts`: the reviewed selections of the toolkit's
  descriptions, analysis and root descriptions add `readRootMarker` and
  `RootMarkerReader`.
- `measure-command.test.ts:145`: unchanged; `examples/independent` is an
  independent scope, still skipped.
- `batch-cli.test.ts`: the no-project test now asserts `root-not-found` and the
  exact message from `/`; a new test asserts an unmarked `--root` exits 1 and an
  unmarked climb exits 2 with the hint. `affected-batch.test.ts`
  `invalid-project` adds an unmarked root description (exit 1).
  `materialize-command.test.ts` is unchanged: its explicit root has no
  description, still `missing-root-description`, exit 1.
- Reference harness: `project-cases.ts` I1-02 (missing file, explicit),
  I1-04 (symlinked root directory and child description) and I1-29 (given,
  found through grouping, outside, nested marked projects) keep their expected
  values; each fixture root is marked by 3A. `increment-cases.ts` I2-10,
  `resident-cli-cases.ts` I2-20 and `plan2a-cli-cases.ts` likewise. Harness
  changes are only the supplied reader in eight files; no instance row, count
  or identity changed. `scripts/validate-final-contracts.ts` gains the layer
  "Phase 1 project boundaries (root marker)" for the three new selections; its
  output equals 3A's candidate output (five pre-existing messages).
- Probe scripts `scripts/probes/fast-check/p5-common.mjs` and
  `stage-timing.mjs` pass the reader; they were not run.

## Commands and results

vitest and reference runs held `/tmp/ramify-audit-tests.lock`.

| Command | Result | Evidence |
| --- | --- | --- |
| `git diff --check` | Exit 0; the three new files have no trailing whitespace and end in a newline | `diff-check.out`, `diff-check.exit` |
| `npm run type-check` | Exit 0 (four compiler scopes) | `type-check.out` |
| `npm run build` | Exit 0 (twice; the second before the final self-check and reference run) | `build.out`, `build-final.out` |
| `npm run check:self` | Exit 0: passed, complete; 15 owners, 456 source files, 17 resources, 0 errors, 0 warnings, 0 analysis limits, 4895 allowed, 0 denied | `check-self-final.out` (earlier identical: `check-self.out`) |
| `npx vitest run …/root-selection.test.ts` | Exit 0, 13/13 | `vitest-root-selection.out` |
| `npx vitest run` descriptions and project test directories | Exit 0, 17 files, 562/562 | `vitest-descriptions-project.out` |
| `npx vitest run subs/analysis/src/tests` | Exit 0, 38 files, 455/455 | `vitest-analysis.out` |
| `npx vitest run` CLI, daemon, contexts test directories, one command each | Exit 0: 245/245, 248/248, 177/177 | `vitest-subs-*.out` |
| `npx vitest run` service-api, explorer, integration-tests, typescript, one command each | Exit 0: 34/34, 33/33, 4/4, 215/215 | `vitest-subs-*.out` |
| `npx vitest run` root files `batch-cli`, `affected-batch`, `companion-cli`, `resident-cli`, `resident-assembly`, `cli-process` (named explicitly) | Exit 0, 6 files, 57/57 | `vitest-root-files.out` |
| Harness `final-contracts.test.ts`, `catalog.test.ts` | Exit 0, 2 files, 43/43 | `reference-focused.out` |
| `node --import tsx scripts/validate-final-contracts.ts` | Exit 1 with the same five messages as 3A's candidate | `vfc-candidate.out` |
| Manual process check (built `dist/src/ramify check --batch`) | See below | `manual-process-check.out` |
| `npm run reference:cases` (once, after the final build) | Exit 0: 36 files, 390/390, 339.31 s (13:27:44–13:33:23 UTC) | `reference.stdout`, `reference.stderr`, `reference.exit` |

**Manual process check.** From the toolkit root: `Root: /home/app/ramify-pb1
(found from /home/app/ramify-pb1)`, exit 0. From
`subs/analysis/subs/project/src`: the toolkit root, found, exit 0. From
`examples/collection-review`: `Root: …/examples/collection-review (found from
…)`, exit 0. From `site/`: the toolkit root, found, exit 0. From a fresh
temporary directory: `Error [root-not-found] .:1:1: No marked project root at
or above <dir>`, exit 2. From `src/` of a temporary tree holding only
`lib/module.ramify` (`ramify 1\nmodule lib\n`): the same with `; the nearest
description is <tmp>/lib/module.ramify: add root before module on its module
line if it is the project root`, exit 2. From the toolkit root with
`--root subs/cli`: `Error [unmarked-root-description]`, exit 1. The temporary
trees were removed.

## Protected documents

No `.principles.md` or `.spec.md` file was edited.
`proposed-spec-patches.diff` (sha256 `d9105d62…`, five hunks, `git apply
--check` clean against `de783a7b`) proposes:

- `docs/architecture/cli-invocation.spec.md`: replace the "Pending root marker"
  note with "Pending declared trees": selection by the marker is implemented
  and every other marked description discovery meets is reported, but until
  declared trees are pruned discovery still meets one inside them, unless it
  lies beneath a directory with its own unselected `tsconfig.json`, which
  discovery still skips. Item 3 adds the exit-2 hint naming the nearest
  unmarked description.
- `docs/model/module-description.spec.md`: both status statements say the
  marker is parsed, selects the root and is enforced in discovery, except that
  a marked description inside a declared nested tree is not yet excluded.
- `docs/architecture/architect-view.spec.md` "Determinism and bounds": the
  climb now stops at the nearest marked description, so a found selection from
  the root probes no ancestor `module.ramify` (a toolkit batch report from its
  root holds no external description input). The patch says the `input`
  identity records the project's canonical root and configuration paths, which
  both input identities include through `scope`, so copies at different paths
  still differ.

## What iteration 8 still lacks

Pruning declared `owned-ignored` and `external` trees before descent, so a
marked description inside one is not read; retiring `independentScopes` and
the inferred independent-scope skip; declaration validation; extending
`undeclared-project-boundary` to package manifests.

## Gaps for the coordinator

1. **Linked description on the climb.** A symlinked or non-file
   `module.ramify` is not read, so its marker is undetermined; selection keeps
   treating it as a candidate, so the existing symlink and kind rules reject
   it ("symlink rules are unchanged"). The alternative, passing it as
   unmarked, would turn a linked root description into `root-not-found` with a
   misleading hint. Please confirm.
2. **Precedence and reads.** `undeclared-project-boundary` replaces
   `description-in-src`, `reserved-container` and `stray-description` for a
   marked description, because one declaration fixes it. Deciding the marker
   at those positions reads descriptions earlier left unread, adding
   `description` inputs for them.
3. **The message names a declaration that is not yet honored.** Until
   iteration 8, adding the suggested `owned-ignored` or `external` statement
   does not remove the error (declared trees are not pruned).
4. **Unmarked root keeps its module.** Acquisition reports one
   `unmarked-root-description` and still interprets the root, rather than
   treating it as layout-invalid and reporting every child as stray.
5. **U+00A0 between `root` and `module`** carries the marker, by the parser's
   header rule (the first two tokens), and parsing then reports the whitespace
   error; documented by a reader case.
6. **`ProjectIssue.span`** is a new optional member of an exposed interface,
   used to locate the boundary diagnostic; it is not serialized.
7. **Input identity values change.** A found selection no longer probes every
   ancestor's `module.ramify`, and descriptions read during the climb are
   inputs; batch `inputId` values change without a schema change.
8. **ramify-agent.** Its four roots are unmarked (Phase 3). The toolkit's new
   climb run from inside `ramify-agent/` passes them and selects the toolkit
   root; its pinned Ramify 0.1.0 is unaffected.
9. **Archived prose.** `docs/plans/done/iteration-1-project-verifier/subcases.md`
   row I1-29:nested-project-root says "enclosing subs ancestry does not cross
   nearer non-subs boundary"; its instances now select the nested project
   because its description carries the marker. The exact-reason table there
   uses "root marker" for the root description file
   ("Missing explicitly selected root marker → `missing-root-description`").
   Not edited. Project test titles "rejects a marker at %s" and "discovers
   stray markers" use the same old sense; not renamed.
10. **Teaching pages for iteration 19** (not edited): `README.md` lines 144-145
    ("`check` discovers the whole project … from the working directory unless
    `--root` is given", without the marker); `site/src/pages/glossary.md`
    lines 16-17 ("declared by marking a directory as a module root");
    `CLAUDE.md`'s description-layout summary, which does not mention the
    marker. The site's example descriptions are children and need none.
11. Resident processes were not exercised for selection; PB1-30 closes in
    iteration 17.

## Coordinator review

The coordinator reviewed the climb, the marker reader, the acquisition rules
and the relays against R7, authorized `proposed-spec-patches.diff` unchanged
(`cli-invocation.spec.md`, `module-description.spec.md` and
`architect-view.spec.md`) and applied it with this slice. Accepted choices: a
linked or non-file `module.ramify` still stops the climb and is rejected by
its existing rules; `undeclared-project-boundary` takes precedence over the
position codes for a marked description; an unmarked root still contributes
its module, so it yields one diagnostic; `ProjectIssue.span` is optional and
not serialized. The `undeclared-project-boundary` message names a declaration
that clears the error only from iteration 8; the user decided on 2026-10-03
that the interim state on this branch needs no further handling. The
iteration gate runs on the committed candidate and its result is recorded in
the evidence directory named by that commit.
