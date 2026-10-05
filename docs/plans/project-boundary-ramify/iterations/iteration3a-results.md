# Iteration 3A results: root marker syntax and root migration

**Date:** 2026-10-03. **Status:** implementation receipt. At the time of
writing it awaits the coordinator's review, protected-file comparison and
iteration gate. Changes are uncommitted in the working tree. PB1-41 passes at
this slice's focused evidence boundary; PB1-44 receives migration evidence
only. Selection and acquisition are unchanged, and the rule's enforcement is
not claimed.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit / tree | `a735e3a6` (tree `98fce61d…`) at assignment; `bc5de000` (tree `79dcf816…`) landed during the work, changing only `contracts.md` (the exit-2 root message) and `iteration3b.md` |
| Contract revision | `contracts.md` blob `8712aace…` (at `bc5de000`); `module-description.spec.md` blob `e6a6b25d…` (unchanged by `bc5de000`) |
| Audit configuration / lockfile | `ramify-audit.json` blob `b59f28f6…`; `package-lock.json` blob `fd3c84ba…` (both unchanged) |
| Working-tree diff at the final reference run | `git diff` against `bc5de000` sha256 `7faefd2a…`, plus the new `root-marker-grammar.test.ts` (sha256 `54afc667…`) |
| Node | v22.23.3 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration3a/` |

## Changed behavior

1. **Grammar.** `root` joins the tokenizer's keyword set and the parser's
   special tag tokens. A line whose first two tokens are `root module` is the
   module header; `LineParser.module()` takes the marker, requires horizontal
   whitespace before `module`, and returns
   `{ name, tags, root, span }`, where `root` is the marker's span or null and
   `span` runs from the first keyword through the last token, as before.
   An unmarked description parses unchanged with `root: null`.
2. **Misplaced marker.** A line beginning with `root` that is not followed by
   `module` is `unknown-statement` at the `root` token. `root` in a name
   position is `reserved-name`, after the module name or tag clause
   `unknown-clause`, and in a destination position `invalid-destination`.
   Order and duplicate checks apply to a marked header as to an unmarked one.
   No issue code was added.
3. **Type.** `DescriptionDocument.module` gains `readonly root: TextSpan | null`.
   `TextSpan` is already exposed beside `DescriptionDocument` by descriptions,
   analysis and root, so no relay changed and `validate-final-contracts.ts`
   needs no new layer.
4. **`ramify.analysis/2`.** The snapshot's inventory carries each parsed
   description, so its module headers now carry `root`. No toolkit reader
   validates that object's members; none needed a change, and no harness
   expected value compares a whole header object. The identifier stays
   `/2`, as the schema table states.
5. **Migration.** Both committed roots, every inventoried generator and every
   root fixture write `root module`; test doubles and header readers accept
   it. Selection and acquisition are unchanged: an unmarked root still
   acquires and a marked child is still accepted.
6. **Documents.** `docs/architecture/daemon.md` quotes the marked toolkit
   header in both places; the descriptions README describes the marker field.

## Migrated sites

The committed-header listing
(`git grep -n -E '^(root )?module ' -- '*module.ramify' ':!ramify-agent'`)
shows 30 headers: `module.ramify:2:root module "ramify" tagged [dispatch]`,
`examples/collection-review/module.ramify:4:root module collection-review tagged [dispatch]`
and 28 unmarked children (14 toolkit, 14 example). `site/` has no description.

**Shared generators (11, 12 root strings).** `src/tests/fixture.ts`
(`fixture()` and `affectedFiles`); analysis `session-test-fixture.ts`,
`architect-fixture.ts`, `affected-fixtures.ts` (`formFiles`); project
`fixtures.ts` `fixture()`; typescript `fixtures.ts` `fixture()`; daemon
`ipc-fixture.ts`; harness `fixtures/plan1/project.ts`,
`plan2a-materialize-fixture.ts`; `scripts/probes/fixtures/synthetic-owners.ts`
and `hundred-owners.ts`, owner 0 only (`index === 0 ? 'root ' : ''`), so the
two stay byte-equal.

**Literal roots in `src/` and `subs/` (51).** As inventoried: root
`batch-cli` (1), `companion-cli` (4), `resident-cli` (3); analysis
`session-input-witness`, `api-view` (2), `dependency-analyzer` (the builder
gained a `marker` argument that only `project()` passes), `evaluate-accesses`
(2), `inventory` (2, including the unknown-tag root), `retained-session`,
`session` (3), `shared-globals`, `validation` (4, including the unknown-tag
root); project `resolve-root` (5) and `project.test` (3); CLI
`affected-command`, `changed-command` (2, including the invalid `expose-src`
root), `changed-cleanup` (2, including the deliberately invalid name, whose
single defect remains), `exhausted-recovery`, `materialize-command`,
`measure-command` (2, including the nested independent root); daemon
`service` (2), `affected-service`; explorer `ProjectExplorerPage`;
integration `explorer-router`, `browser-acceptance` (3); service-api
`project-binding`.

**Literal roots in `scripts/` (11).** `plan2a-projection-cases` (2),
`plan2a-session-cases`, `plan2a-workflow-cases`, `plan2a-isolation-cases` (2),
`bounded-cases`, `production.test` (2, including the unknown-tag root),
`runner.test` (with its header-bytes assertion), `mutation.test`.

**Sites beyond the brief's inventory.**

- `subs/analysis/subs/project/src/tests/path-ownership.test.ts` (added in
  iteration 3): its `described()` double gives the `module.ramify` document a
  marker span, and the acquired-scope test writes `ramify 1\nroot module app\n`
  for the root instead of the placeholder `ramify 1\n` it writes for children.
- `locations.test.ts` and `project-boundary-grammar.test.ts` compare a whole
  header object; each gained `root: null`. No marker was added to their texts.
- `scripts/reference-harness/plan2b-cases.ts` `apiViewIdentity()` (AV34):
  the build of `577b980` materializes copies of the example and the toolkit
  and cannot parse `root`. See the deviation below.

**Test doubles and header readers.** Project `syntax` returns a marked root
fact (`root` 9–13, span 9–28, for `root module fixture`) and an unmarked child;
project `declaration` matches `^(root\s+)?module\s` and records the marker;
the typescript `acquire()` double marks the owner without a directory;
`descriptions.test.ts` asserts that exactly the two path-`''` fixtures carry
the marker and that their header span text begins `root module `;
`gate-cases.ts` finds the header with `^(?:root\s+)?module\s` and expects
`root module "ramify" tagged [dispatch]`; `plan2b-cases.ts`
`declaredModules` accepts the optional marker; `validate-final-contracts.ts`
`header()` marks only the owner at `./`, while archived `owners.md` blocks
stay unmarked and are compared by name, tags and selections only.

**Pinned copy.** `toolkitFixture()` in `plan5-engine-cases.ts` asserts that the
extracted `e0be049` root begins `ramify 1\nmodule "ramify" tagged [dispatch]\n`
and rewrites it as `root module …` before any acquisition.

**Roots deliberately left unmarked.**

- `subs/analysis/subs/project/src/tests/capture.test.ts:116`: a BOM capture
  check that is never acquired; the brief lists it as unchanged.
- Nonsensical root texts kept as written: `project.test.ts` `'invalid ancestor'`,
  `project-cases.ts` `'invalid ancestor\n'`, `ipc-cases.ts`
  `'invalid declaration\n'`, and the edit templates in
  `scripts/measurements/fast-fixture.test.mjs`, which hold statement
  fragments only.
- Children, strays, in-`src/` and excluded descriptions, including
  `plan5-observer-cases.ts` `subs/extra`, stay unmarked.

## Shifted expected values

- `src/tests/companion-cli.test.ts`: the third line starts after
  `ramify 1\n` (9) and `root module fixture\n` (20), at 29 instead of 24; the
  statement is 69 code units, so its end moves from 93 to 98. Line 3 and
  column 1 are unchanged.
- Architect goldens: the root's documentation is its README plus
  `module.ramify`, so it gains 5 bytes (215→220), and the subtree that
  contains it also gains 5 (850→855). They were regenerated with
  `RAMIFY_UPDATE_GOLDEN=1`, and a `sed`/`cmp` check against `HEAD` confirmed
  that each of the three files differs only in these two values
  (`golden-check.out`).
- S100 digest (`materialize.ts:24`, `synthetic-owners.test.ts:14`): `s100-digest.py`
  reimplements the hundred-owner byte recipe in Python without running the
  generator, sorts entries by path and hashes `JSON.stringify` of the pairs.
  The unmarked recipe reproduces the frozen
  `d5b77b9ff57c443b35f386f40598506ff20c51c4ec75b800371f0cec089c0897`, which
  validates the model. With `root ` on owner 0 it gives
  `1b20168da7aa947bd25364d6da2bc5e156d63e529997e6c527820e24573f7098`. Command:
  `python3 /home/app/ramify-pb1-evidence/iteration3a/s100-digest.py`
  (script sha256 `bd535e97…`; output `s100-digest.out`).
- PB1-41 offsets in `root-marker-grammar.test.ts` were counted by hand. A
  recount before the first run corrected four of them (34, 34, 28, 52); the
  file then passed on its first run.
- Archived measurement results and probe outputs that record the old S100
  digest were not rewritten. The `plan2a-inputs.mjs`, `resident-inputs.mjs`
  and `run.mjs` fingerprints change only when those scripts are run.

## Tested case instances

`subs/analysis/subs/descriptions/src/tests/root-marker-grammar.test.ts`
(36 tests, PB1-41):

- **Marked and unmarked headers:** exact marker and header spans, both as
  keyword tokens, and exposure records with exact spans in the marked form;
  the unmarked control has a null marker and the same records 5 code units
  earlier. A BOM, CRLF, tab separators and a trailing comment keep exact
  UTF-16 spans. The marker is accepted before a quoted name, an empty tag
  clause and nested-tree statements.
- **Reserved name:** bare `root` is `reserved-name` at the word in eight
  positions (module name unmarked and marked, export, alias, test selection,
  child selection, child alias and child name), and each position accepts
  `"root"`. Quoted names decode to `root`. `root-tools`, `roots`,
  `rootValue`, `Root`, `uproot` and `root-cause` are not reserved.
- **Tag:** `root` is admitted in module and exposure tag clauses. It does not
  set the marker, duplicates are `duplicate-tag` and quoted it is
  `invalid-tag-syntax`. Under the default registry,
  `deriveSourceAreas` reports `unknown-tag "root"` and `assignOriginalTags`
  reports `unknown-tag`; untagged positive controls pass. With `root`
  registered as a required-symbol tag, both resolve, giving profiles
  `[dispatch, root]` and `[dispatch, testing]`.
- **Malformed (18 located cases):** `root` alone, alone before or after the
  module line, doubled, as the module name, after the name, after the tag
  clause, after a marked header, before an exposure, before a nested-tree
  statement, before the version header, on a marked line before the version
  header, on a second marked module line, as a destination, joined to `module`,
  separated by U+00A0, `Root`, and `"root"`. Every issue code is an existing
  one.

## Commands and results

vitest and reference runs held `/tmp/ramify-audit-tests.lock` unless noted.

| Command | Result | Evidence |
| --- | --- | --- |
| `git diff --check` | Exit 0 | `diff-check.out`, `diff-check.exit` |
| `npm run type-check` | Exit 0 (four compiler scopes) | `type-check.out` |
| `npm run build` | Exit 0 (twice; the second before the final reference run) | `build.out`, `build-final.out` |
| `npm run check:self` | Exit 0 on the final tree: passed, complete; 15 owners, 453 source files, 0 errors, 0 warnings, 0 analysis limits, 0 denied | `check-self-final.out` (an earlier identical run: `check-self.out`) |
| `npx vitest run …/root-marker-grammar.test.ts` (unlocked; no processes) | Exit 0, 36/36 | `vitest-root-marker-grammar.out` |
| `git grep -n -E '^(root )?module ' -- '*module.ramify' ':!ramify-agent'` | 30 headers; exactly two carry `root` | `committed-headers.out` |
| `npx vitest run` descriptions and project test directories | Exit 0, 16 files, 530/530 | `vitest-descriptions-project.out` |
| `npx vitest run subs/analysis/subs/typescript/src/tests` | Exit 0, 19 files, 215/215 | `vitest-typescript.out` |
| `RAMIFY_UPDATE_GOLDEN=1 npx vitest run …/architect-render.test.ts` | Exit 0, 30/30; goldens rewritten | `golden-update.out`, `golden-check.out` |
| `npx vitest run subs/analysis/src/tests` | Exit 0, 37 files, 451/451 | `vitest-analysis.out` |
| `npx vitest run` CLI, daemon, contexts and service-api test directories, one command each | Exit 0: 245/245, 248/248, 177/177, 34/34 | `vitest-subs-*.out` |
| `npx vitest run subs/explorer/src/tests` | Exit 0, 5 files, 33/33 | `vitest-subs-explorer-src-tests.out` |
| `npx vitest run subs/integration-tests/src` | Exit 0, 2 files, 4/4 | `vitest-subs-integration-tests-src.out` |
| `npx vitest run src/tests` | Exit 0, 177 files, 2571/2571. The filter matches every owner's `src/tests`, so this ran nearly the whole toolkit suite, not only root's tests; see gaps | `vitest-root.out` |
| Harness `production`, `runner`, `mutation`, `synthetic-owners`, `final-contracts`, `instances`, `equivalence` tests | Exit 0, 7 files, 97/97 | `reference-focused.out` |
| `node --import tsx scripts/validate-final-contracts.ts` | Exit 1 with the same five messages as an export of `a735e3a6`, which adds a sixth, environment-specific package-import failure | `vfc-candidate.out`, `vfc-head.out` |
| `npm run reference:cases` (first run) | Exit 1: 389/390; `plan2b.test.ts` AV34 failed: baseline `code: 2` | `reference-run1.*` |
| Harness `plan2b.test.ts -t "byte for byte"` after the AV34 fix | Exit 0, 1 passed, 5 skipped | `reference-plan2b-av34.out` |
| `npm run reference:cases` (final, after build) | Exit 0: 36 files, 390/390, 339.85 s (12:33:26–12:39:06 UTC) | `reference.stdout`, `reference.stderr`, `reference.exit` |

No `scripts/**/*.test.mjs` file changed, so no `node --test` run was
required or made. `browser-acceptance.ts` is a browser-driven measurement
script (`measure:project-explorer`) and was not run.

## Protected documents

No `.principles.md` or `.spec.md` file was edited.
`proposed-spec-patches.diff` (sha256 `1e409969…`, two hunks, `git apply
--check` clean against `bc5de000`) updates only the status statements of
`docs/model/module-description.spec.md`: lines 7–8 say the parser accepts the
marker while its selection and validity rules remain pending, and lines
1082–1084 replace "not yet parsed or enforced" with "is parsed; its selection
and validity rules are not yet enforced". `cli-invocation.spec.md`'s pending
selection note remains accurate and is not changed.

## Remaining for iteration 3B

- Marker determination for selection (from the Descriptions tokenizer and
  header rules, supplied to Project), the marked-description climb,
  `--root` marker validation, `unmarked-root-description`,
  `undeclared-project-boundary` and reuse evidence. The parser does not
  decide which description is the root.
- Tests whose meaning changes once selection follows the marker, now marked
  as the brief directs: `resolve-root.test.ts` lines 182 and 188 (the root
  moves to a marked parent or to a marked `src/module.ramify`) and
  `project.test.ts` "rejects a missing parent marker above a child directly
  under subs", whose orphan child is written by `fixture()` and is now marked.
- `ramify-agent/` (four roots) and `/ramify-audit` are unmigrated (Phase 3).

## Gaps for the coordinator

1. **Deviation (AV34).** `apiViewIdentity()` runs the `577b980` build over
   copies of the marked example and toolkit, and that build rejects `root`
   (first reference run, exit 2). The fix removes the marker from the copy's
   root module line for the baseline run only and restores it for this build.
   It first asserts exactly one `^root module ` line. API views carry no
   description bytes, so the byte comparison stays exact. The brief named only
   the `e0be049` copy. Please confirm the adaptation.
2. **Inventory count.** The brief says 25 committed children; the tree holds
   30 descriptions at both `3f435172` and this candidate: 2 roots and 28
   children. All 28 are unmarked.
3. **`mutation.test.ts`** writes a copy-source root that is never acquired.
   The brief conditioned marking on acquisition. It is marked, so every
   toolkit fixture root carries the marker (PB1-44), and nothing reads it.
4. **Malformed-marker codes** are design choices within the existing set. A
   leading `root` not followed by `module` is `unknown-statement` at that token
   (doubled `root root module` therefore also reports `missing-header`), and
   `root` after the name is `unknown-clause`.
5. **Full-suite overlap.** `npx vitest run src/tests` was meant to run root's
   test directory only. Vitest filters by substring, so it ran 177 test files
   across all owners. It passed, but it exceeded the focused-run rule. The
   integration-tests files, which it does not match, ran separately.
6. **Teaching pages** `site/src/pages/model.mdx` and `tags.mdx` contain
   example descriptions. They are outside this slice's scope and were not
   reviewed for root examples that might need the marker.
7. Measurement scripts that run older builds over current projects were not
   exercised; none is part of the gate.

## Coordinator review

The coordinator reviewed the parser change, the committed roots, the pinned
toolkit copy and the reader changes against the brief, authorized
`proposed-spec-patches.diff` unchanged (status wording in
`module-description.spec.md`) and applied it with this slice. The AV34 change
is accepted: the baseline build `577b980` predates the marker, so it reads the
copy unmarked while this build reads it marked, and API views carry no
description bytes. The `npx vitest run src/tests` run matched every owner's
tests; it passed and is recorded as a deviation from the focused-run rule, not
as gate evidence. The iteration gate runs on the committed candidate and its
result is recorded in the evidence directory named by that commit.
