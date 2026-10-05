# Iteration 18 results: boundary-aware views and explorer projections

**Date:** 2026-10-05. **Status:** implementation receipt for
[iteration 18](iteration18.md). It awaits the coordinator's review,
protected-file comparison and gate. Changes are uncommitted in the second
worktree, pipelined one iteration ahead of the coordinator's gate on
`fc3680d4` (iteration 17). Cases produced here: PB1-27 and PB1-28 at the
`materialization` evidence boundary and PB1-29 at `public-api`; their final
qualification remains with iteration 20. `reference:verify` was not run: it is
left to the coordinator's gate.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1-next`, branch `feat/project-boundary-ramify-next` |
| Base commit | `fc3680d4`, clean at assignment, dependencies installed |
| Contract revision | sha256 `contracts.md` `c6baba7d…`, `architect-view.spec.md` `a6b9ecd8…`, `materialized-api-view.spec.md` `7400357c…`, `architect-view-diff.spec.md` `254d5747…`, `module-architect.principles.md` `38588987…`, `docs/agents/glossary.md` `e0cc1e89…`, `docs/model/glossary.md` `1cd8cbf3…`, all unchanged (one patch proposed) |
| Configuration | unchanged: `package.json` `be7f3c90…`, `package-lock.json` `cf3b14fc…`, `ramify-audit.json` `371ebef9…`, every `tsconfig*.json` and Vitest configuration; no `module.ramify` changed; nothing under `ramify-agent/`, `/ramify-audit` or `/ramify`; `CLAUDE.md` untouched |
| Node / tools | v22.23.3; TypeScript 7.0.2; Vitest 4.1.11 |
| Changed (source) | `subs/analysis/src/architect-view.ts`, `architect-render.ts`, `interfaces/architect-view.ts`, `api-view.ts`; `subs/daemon/src/api-view-publisher.ts`, `service.ts`; `subs/daemon/subs/contexts/src/context-manager.ts`, `interfaces/contexts.ts` |
| Changed (tests, goldens, harness) | `subs/analysis/src/tests/architect-render.test.ts`, `architect-view.test.ts`, the three `fixtures/architect-view-*.txt` goldens; `subs/daemon/src/tests/architect-view-publisher.test.ts`, `architect-view-fixtures.ts`, `service.test.ts`; `subs/daemon/subs/contexts/src/tests/scripted-driver.ts`; `subs/cli/src/tests/materialize-command.test.ts`; `src/tests/resident-cli.test.ts`; `scripts/reference-harness/plan2b-cases.ts`, `plan2b.test.ts` |
| Changed (prose) | `subs/analysis/README.md`, `subs/daemon/README.md`, `subs/daemon/subs/contexts/README.md` (no first paragraph changed) |
| Added | `subs/analysis/src/tests/project-boundary-views.test.ts`, `src/tests/project-boundary-publication.test.ts`, this receipt |
| Evidence | `/home/app/ramify-pb1-evidence/iteration18/` |

## Changed behaviour

### Boundaries and auxiliary evidence in the architect view (deliverable 1)

1. **Projection.** `ArchitectModuleFacts` gains `boundaries`, after `areas`:
   the owned-ignored and external trees the module's description declares,
   byte-ordered by `dir`, each `{ kind, dir, description, line, column }`:
   the tree's project-relative directory and the declaring statement's
   project-relative description path and 1-based line and column (the
   statement span's start). The type is inline in `ArchitectModuleFacts`, so no
   relay or `module.ramify` changes.
2. **Join, not a second boundary table.** `select` joins each valid module
   description's nested-tree statements to the revision's
   `scope.ownership.exclusions`: the statement's directory, resolved against
   the module directory, must be an exclusion of the same kind and owner
   (`owned-ignored`: the declaring module; `external`: none), claimed once, and
   every declared exclusion must be claimed by a statement. Any mismatch is
   `analysis-failed` (never a partial view). Valid facts already guarantee
   each statement decoded strictly beneath its module (acquisition is invalid
   otherwise), so the resolution only looks the directory up.
3. **A module record** (`module.json`, `ramify.architect-module/2`) writes
   `boundaries` after `areas`, one tree per line like `uses`, `[]` when none:

   ```json
     "areas": ["src"],
     "boundaries": [
       { "kind": "external", "dir": "external-project", "description": "module.ramify", "line": 4, "column": 1 },
       { "kind": "owned-ignored", "dir": "fixture-project", "description": "module.ramify", "line": 3, "column": 1 }
     ],
   ```

   The toolkit's root record lists its eleven trees (`.cucumber-viz`,
   `.history`, `.playwright-mcp`, `.reference-work`, `docs`,
   `examples/collection-review`, `ramify-agent`, the two probe fixtures,
   `scripts/reference-harness`, `site`), lines 8–13 and 18–22. The README map
   is unchanged: it renders no boundary (the specification's map renders
   counts, purpose and headline only).
4. **Nothing beneath a tree.** Declared trees, scratch directories and inert
   files were already absent from inventory, catalog and test sources since
   iterations 8–8C; the view draws only on those facts, so no file, symbol,
   test title or count from them appears (verified by marker strings in the new
   tests and the process check).
5. **Auxiliary internals.** Originals defined in auxiliary source (owned
   compiler source outside `src/`) were already in the catalog and the linked
   model (8C, 10); the projection records them like any other original, always
   `role: internal` because linking refuses any exposure of them, with their
   project-relative `file` outside `src/` and their `../` identity. Their
   consumers count: in the topology the root's only consumer of `a#api` is its
   auxiliary `scripts/check.ts`, and `a`'s record lists `app` as behavioral.
   A test-named auxiliary file (`scripts/report.test.ts`) is ordinary source: a
   supporting record without `testing`, never a test record. The doc comments of
   `role` and `files` state this; no code path changed for it.
6. **Counts and bytes.** `files.own`/`subtree` and the `metrics` buckets read the
   inventory, which includes auxiliary source (listed with its owner's
   ordinary area) and excludes inert, scratch and declared-tree files; the new
   tests derive both from the fixture's file contents. No inventoried resource
   lies outside `src/` in Phase 1 (contracts: no placement for such resources).
7. **API-view selection (PB1-28).** `resolveModules` no longer takes the
   longest module-directory prefix: after the canonical-path check it asks
   Project's `classifyProjectPath` over `inventory.scope`. An owned path with no
   exclusion selects its module (auxiliary source selects its owner, whose
   ordinary and testing views are refreshed as for any path of the module); a
   path in an owned-ignored or external tree, a scratch directory, a reserved
   segment (`.git`, `node_modules`, `.ramify`, `.ramify-architect`, …) or a
   configured output, and an outside path, is `invalid-location` with the
   message `"<from>" lies in the <kind> directory "<dir>", which Ramify does not
   analyze`. Before, `subs/a/fixtures/sample/src/index.ts` selected `a` and
   `fixture-project/...` the root. Availability is unchanged: API views list
   only originals `listAvailableOriginals` derives from legal exposures,
   profiles and selection rules; an auxiliary original can never be exposed.
8. **Relaying `invalid-location`.** The contexts manager relayed every session
   refusal as `analysis-failed` with the message `<reason>: <message>`, so the
   CLI printed `Not materialized (analysis-failed): invalid-location: …`
   (process run 1). `ContextApiViewOutcome` gains an `unavailable` member with
   reason `invalid-location`; the manager keeps the session's `invalid-location`
   as such; the service's materialize passes it on (its `MaterializeOutcome`
   already had `invalid-location`, used for the publisher's `invalid-path`), and
   `measure` (always the whole project, so never a location) maps it to
   `analysis-failed`. The CLI now prints `Not materialized (invalid-location):
   "src/tmp" lies in the scratch directory "src/tmp", which Ramify does not
   analyze`, exit 2. The wire codec already accepted the value.

### Publisher (deliverable 4, decided by the user on 2026-10-03)

9. `subs/daemon/src/api-view-publisher.ts`: the rendered view must still name
   exactly `ramify.architect-view/2` (a build never publishes a view it would
   not recognize). An existing `.ramify-architect` is replaced when its
   `_meta.json` is a JSON object whose `schema` matches
   `^ramify\.architect-view\/[0-9]+$`, so a view written by any Ramify version
   is replaced; a missing `_meta.json`, malformed JSON, an array, a missing or
   non-string `schema`, or any other string (`ramify.api-view/1`,
   `ramify.architect-view`, `/`, `/x`, `/2.1`, `/-1`, a leading space,
   `ramify.architect-viewer/2`) is refused with `invalid-path` and the
   directory is left untouched. The symbolic-link and non-regular-file
   refusals are unchanged. `subs/daemon/README.md` states the rule. No
   specification change: `architect-view.spec.md` already says the directory
   is replaced when its `_meta.json` "names the `ramify.architect-view`
   schema".

## Schema identifiers and consumers

| Identifier | Change | Consumers migrated |
| --- | --- | --- |
| `ramify.architect-projection/2` | `modules[].boundaries` | analysis projection and interface; session worker transfer (plain data); contexts scripted driver; daemon test fixture; render test fixture; harness `renderedInstructionBlock` |
| `ramify.architect-module/2` | `boundaries` member after `areas` | renderer; goldens; render test key-order and object expectations; harness Plan 2B structural expectation (schema and boundaries per module, from the declarations) |
| `ramify.architect-view/2` | the view's documents changed shape (`_meta.json` members unchanged) | renderer; publisher constant; render, service, CLI materialize, resident CLI tests; harness `plan2b-cases.ts` and `plan2b.test.ts` |
| `ramify.api-view/1`, `ramify.api-view-projection/1` | unchanged: no member changed; module selection only | none |
| `ramify.explorer-http/1`, `ramify.explorer-dependencies/1`, `ramify.explorer-record/1` | unchanged: no browser, dependency or envelope member changed (the explorer model already listed auxiliary files with `area: ordinary`; dependency evidence already counted auxiliary consumers) | none |
| `ramify.measure/2` | unchanged: no bucket member added (auxiliary source was already listed with its owner's ordinary area since 8C) | none |

`ContextApiViewOutcome` is an in-process contexts type without an identifier;
the IPC `MaterializeOutcome` already carried `invalid-location`.
Not migrated, outside this scope: `ramify-agent/subs/harness/subs/evidence/src/views.ts`
and its tests read the architect view and will see `/2` documents (Phase 3).
The fixtures `generated-path.test.ts` and `retained-source-analysis.test.ts`
write a `.ramify-architect/_meta.json` naming `/1` only as an excluded file on
disk; they are left as they are (any schema is excluded there).

## PB1-27, PB1-28 and PB1-29

`subs/analysis/src/tests/project-boundary-views.test.ts` (7 tests; one real
retained session per test over the written topology of `fixtures.md`:
`app` [dispatch] with owned-ignored `fixture-project` and external
`external-project`, root auxiliary `scripts/check.ts` and `tools/tmp/helper.ts`,
inert `notes/design.md`, root scratch `src/tmp`; `a` with owned-ignored
`fixtures/sample`, auxiliary `scripts/report.ts` and test-named
`scripts/report.test.ts`, testing `src/tests/api.test.ts` and
`src/tests/tmp/real.test.ts`, scratch `src/tmp`; `grand`; `b` consuming
`a#api`; the ignored trees hold marked roots, a malformed description and
test-shaped files; the dependency analyzer runs in process on the session's
report):

| Test | Independent expectation |
| --- | --- |
| PB1-27 boundaries | projection `/2` at the revision's sequence and input; `boundaries` of all four modules; byte-exact `module.json` of `app` and `a` (key order, one tree per line, files 3/10 and 5/6, symbol and test counts, `uses`/`usedBy`, metrics derived from the fixture's byte lengths for the analyzed population only, revision); `grand` and `b` have `[]`; `_meta.json` `/2`; the 18 view paths |
| PB1-27 auxiliary | root `check`, `helper` internal callable with `scripts/…`/`tools/tmp/…` files; `a#api` exposed, behavioral consumers `app` (through the auxiliary script only) and `app/b`, re-exposed by `app` to descendants; `report` internal; `reportShape` supporting without tags; test records only from `src/tests` (exercises `app/a#api` and `[]`); `../scripts/check.ts`, `../tools/tmp/helper.ts`, `../scripts/report.ts`, `../scripts/report.test.ts` identities, all internal |
| PB1-27 nothing beneath | sixteen marker strings of inert, scratch and excluded files absent from every rendered file, the projection and the measurements |
| PB1-28 availability | the all-modules projection lists only `api` (root `children`, `grand` and `b` `external`); no auxiliary, internal or excluded name |
| PB1-28 selection | auxiliary `subs/a/scripts/report.ts` and `subs/a/scripts` select `a` with both areas; `scripts/check.ts`, `tools/tmp/helper.ts`, `notes/design.md` the root; `subs/a/src/tests/tmp/real.test.ts` `a`; thirteen excluded paths (both trees and paths in them, `a`'s sample, both scratch directories, `node_modules`, `.ramify`, `.ramify-architect`, `.git`) `invalid-location`, with the exact message for the sample |
| PB1-29 measurements | the session's file records equal the expected analyzed population (source, auxiliary and documentation) with exact bytes; every module's exact and subtree buckets |
| PB1-29 one revision, byte limits | architect, API, dependency, test-reference and measurement inputs equal the revision's; the architect projection at exactly its bytes projects and one byte less is `resource-limit` with the exact message; the API invocation limit likewise; a one-byte area limit refuses |

`src/tests/project-boundary-publication.test.ts` (5 tests; the same topology
through the real daemon service, contexts, analysis and filesystem publisher of
the quick environment, the CLI's `runCli`, and the explorer projection over a
batch report):

| Test | Independent expectation |
| --- | --- |
| one transaction, one revision | `materialize --view api --view architect --all`: 6 targets; generated directories exactly `.ramify-architect` and five module areas (none in a tree or scratch directory); every API `_meta.json` names the architect view's revision; `/2` module records with the boundaries and counts; only three API documents, all `api.ts`; no marker in any generated file; the repeat writes 0 bytes, 6 unchanged, identical files |
| selection through the CLI | `--from` auxiliary paths of `a` (2 targets) and the root (1); four excluded paths exit 2 with the exact three-line `Not materialized (invalid-location): …` output |
| any-version replacement | a view naming `/1` and one naming `/3`, with a stale module directory, are replaced by the `/2` view |
| refusal is transactional | a `.ramify-architect` without `_meta.json`, and one naming `ramify.api-view/1`, are refused (`invalid-location` from the publisher's `invalid-path`), left byte-identical, and no API view is written |
| PB1-29 measure and explorer | `measure --format json`: `ramify.measure/2` file records equal the population with exact bytes; root subtree and exact buckets; the explorer model's module files, owned and subtree counts, ten owned files, the two cross-owner edges (`scripts/check.ts`, `consumer.ts`); no marker; a report of another input is refused |

`subs/daemon/src/tests/architect-view-publisher.test.ts` gains the refusal
cases above and replacement of `/1`, `/2`, `/3` and `/40` views (the old
"replaces a directory whose `_meta.json` names the architect schema" became
the `/1` case).

**Negative control** (`negative3/`): with the eight changed source files
replaced by the base commit's (sha256 recorded), the new analysis test failed
2 of 7 (boundaries; excluded selection), the publication test 3 of 5
(boundaries, CLI invalid location, any-version replacement) and the publisher
test 4 of 45 (each replacement case). The passing tests on base are the
already implemented behaviour this slice qualifies (auxiliary records, no
excluded content, availability, measurements, the explorer model, the
existing refusals). The candidate files were restored and their SHA-256
verified (`negative3/restored.txt`); `negative2/` is the same run over the
first five files, before the relay change.

**Process check** (`process/process-check.sh`, run `process/run2/`, final
build, `dist/src/ramify`, a resident daemon in the private endpoint
`run2/endpoint/` (mode 0700); `run/` is the same check on the previous build,
before the relay change):

- `materialize --view architect`: 1 target, 10 records, 8,676 bytes, 4 modules,
  dependencies measured; the repeat 0 bytes written, 1 unchanged;
- `materialize --view api --all`: 5 targets, 3 entries; from `subs/a/scripts`
  2 targets (`a`), from `tools/tmp` 1 (root);
- from `external-project/`, `src/tmp/` and `--from subs/a/fixtures/sample/src/index.ts`:
  exit 2, `Not materialized (invalid-location): "…" lies in the external|scratch|owned-ignored directory …`;
  from inside `fixture-project/` R7 selects that project as its own root
  (its evaluation is invalid because the fixture deliberately holds a
  malformed description);
- generated directories: `.ramify-architect` and the five module areas;
  `_meta.json` names `ramify.architect-view/2`; the root and `a` records show
  the boundaries; auxiliary records internal; the sixteen markers: 0 hits in
  every generated file; `check(`, `helper(`, `report(`, `reportShape` in API
  views: 0;
- a `.ramify-architect` whose `_meta.json` names `/1` with a stale directory:
  replaced (identical to the first publication apart from the revision);
  one with only `notes.md`: exit 2, `".ramify-architect" has no _meta.json, so
  it is not a generated architect view; it was left untouched`, untouched, and
  the removed `src/.ramify` stays absent;
- `daemon stop` exit 0, status not running, no process names the endpoint.

**Toolkit view** (`toolkit/`): Plan 2B's `copyProject` copy, the built CLI, a
private endpoint: 15 modules, 62 files, 2,068 records, 1,066,266 bytes,
`ramify.architect-view/2`, dependencies measured; repeat 0 bytes; daemon
stopped. The root record lists the eleven declared trees; no record file, docs
entry or purpose path lies in `docs/`, `site/`, `examples/collection-review/`,
`scripts/reference-harness/`, `ramify-agent/`, the probe fixtures or the
external work directories; 161 records come from auxiliary source, all
internal. The copy's root `files.subtree` is 592: the checkout's batch check
counts 593 source files, the one difference being the root auxiliary
`examples/hooks/claude-code-post-write.mjs`, which `copyProject` omits with
every `examples/` path.

## Re-reasoned expectations and instance rows

- **Goldens** (`architect-render.test.ts`, three files): the fixture has no
  declared tree, so each `module.json` gains exactly the line
  `  "boundaries": [],` after `"areas"` (20 bytes) and its schema becomes
  `/2`, and `_meta.json` names `/2`: 7 inserted and 8 changed lines per golden.
  The files were regenerated with `RAMIFY_UPDATE_GOLDEN=1` and compared with
  `HEAD`'s goldens transformed by exactly those three edits: byte-identical
  (`golden-check.out`; each `git diff --stat` 15 insertions, 8 deletions).
- `architect-render.test.ts`: `_meta.json` literals `/2`; key order with
  `boundaries` after `areas`; the `core/module.json` object with
  `boundaries: []`.
- `architect-view.test.ts`: the seven module facts gain `boundaries: []`;
  projection `/2`.
- `service.test.ts`, `materialize-command.test.ts`, `resident-cli.test.ts`:
  `_meta.json` `/2`.
- Publisher test: see above.
- Harness `plan2b-cases.ts`: `_meta.json` `/2`; each module record's `schema`
  `ramify.architect-module/2` and `boundaries` equal to the module's
  `owned-ignored`/`external` lines read with a line pattern (kind, the
  directory joined to the module directory, its description, physical line and
  column), byte-ordered by directory; the reference copy's root declares
  `external ".reference-work"` and the toolkit copy's root its eleven trees.
  `renderedInstructionBlock`'s projection gains `boundaries: []` and `/2`.
  `plan2b.test.ts`: `/2`.
- **AV34** (`apiViewIdentity`): it compares `materialize --all` API views with
  the `577b980` build's; this slice changes only module selection, not `--all`
  or any API document, so its expectation is unchanged (run below).
- **Instance rows.** No `plan*-instances.ts` row, count or identity changed.
  Rows whose prose no longer describes what their instance asserts: none found.
  `I2A-10:from-selection` ("select the expected innermost module") still holds
  for the fixture's paths, none of which is excluded.

## Plan 2A and 2B instances

All held `/tmp/ramify-audit-tests.lock` (`run-locked.sh`: requested
2026-10-05T02:50:25Z, acquired 03:02:52Z after the gate released it, harness
files and instances to 03:09:35Z, `reference:cases` 03:09:35–03:15:23Z). The
tree was frozen: `git status` and the diff hash (`01ec2a82…`) were identical
before the locked runs, before and after `reference:cases`.

**Run singly (locked), all passed:**

- Harness `plan2b.test.ts`: 6 tests (real runs of the reference project and
  the toolkit against the updated structural expectation, including each
  module record's `/2` schema and boundaries; second daemon and other path;
  agent instructions; invariance; AV34 API view byte for byte against
  `577b980`; entries and closures) (`h-plan2b.log`).
- Harness `plan2a.test.ts`, `final-contracts.test.ts`, `self.test.ts`: 3
  files, 22 tests (`h-plan2a-final-contracts-self.log`).
- Plan 2A single instances, **94/94 passed** (`p2a-instances.out`): I2A-01 ×4,
  I2A-02 ×12, I2A-03 ×8, I2A-04 ×8, I2A-05 ×9 (projection over module
  selections), I2A-06 ×7, I2A-07 ×10 (publication), I2A-08 ×9 (session
  queries, including `../escape` → `invalid-location`), I2A-09 ×7 (service:
  `from` `.`, `subs/app/src/index.ts`, failure mapping), I2A-10 ×9 (CLI
  `--from` selection), I2A-11 ×6, I2A-12 `limit-preservation`, I2A-13
  `self-reference-checks`, `declarations-package`, `documents-handoff`,
  `plan3-preserved`.

**Judged unaffected or not runnable singly, not run:**

- I2A-12 `reference-scale`, `toolkit-scale`, `synthetic-100/500/1000`,
  `repeat-plateau`, `linux-macos-bytes`: they read the Plan 2A measurement
  report, which no current run produces (failing before this slice, owned by
  iteration 20, as the final-gate repair recorded); this slice changes no
  measurement input they read.
- I2A-13 `all-instances` (aggregates a complete verification report),
  `predecessor-regressions` (reads the latest Plan 2 and Plan 5 verification
  reports; failing before this slice on I5-01), `build-tests` (runs build,
  type-check, the focused owner directories, `plan2a.test.ts` with
  `final-contracts.test.ts` and `reference:cases`, each run here separately).
- Plan 1, Plan 2 and Plan 5 instances: no case reads an architect or API view,
  the publisher or a materialize outcome (Plan 5's session driver binds
  `apiView`/`architectView` but no case calls them); none was run.
- Plan 2C and Plan 2B measurement scripts (`plan2c.mjs`, `plan2b.mjs`,
  `plan2b-views.ts`): not part of any gate; they parse the CLI summary lines
  (unchanged) and the measure document (unchanged) and walk view sizes; not run.

## Generated README text

Unchanged. The instruction block the materializer writes at the top of
`.ramify-architect/README.md` (quoted in `CLAUDE.md`, `AGENTS.md` and the
specification) is byte-identical; the Plan 2B agent-instructions case compares
it.

## Commands and results

Focused commands ran without the lock; the locked runs are listed above.

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check`; new files scanned for trailing whitespace | 0 | clean | `diff-check.log` |
| `npm run type-check` (final) | 0 | four scopes | `type-check.out` |
| `npm run build` (final, after the last source edit) | 0 | built | `build.out`, `build.exit` |
| `npm run check:self` (final) | 0 | passed, partial; 15 owners, **593** source files (591 + the two new tests), 17 resources, 8835 accesses, 0 errors, 0 warnings, 41 limits, 5658 allowed, 0 denied, 3133 external | `check-self.out` |
| `npx tsx scripts/validate-final-contracts.ts` (final) | 0 | 15 owners, 610 files, 173 expanded statements | `validate-final-contracts.out` |
| `RAMIFY_UPDATE_GOLDEN=1 npx vitest run …/architect-render.test.ts -t golden`, then the `HEAD`-transform comparison | 0 | 4 passed; three goldens identical to the predicted transform | `golden-update.out`, `golden-check.out` |
| `npx vitest run subs/analysis/src/tests/project-boundary-views.test.ts` | 0 | 7 tests (first run and final run) | `pb-views-run1.out`, `pb-views-final.out` |
| `npx vitest run src/tests/project-boundary-publication.test.ts` | 0 | 4, then 5 tests with the CLI selection test | `pb-publication-run1.out`, `pb-publication-run2.out` |
| Negative control (base sources, the three test files) | 1 | 2/7, 3/5, 4/45 failed; restored, SHA-256 verified | `negative3/`, `negative2/` |
| `npx vitest run subs/analysis/src/tests/` | 0 | 45 files, 514 tests | `vitest-analysis.out` |
| `npx vitest run subs/analysis/subs/project/src/tests/` | 0 | 14 files, 315 tests | `vitest-subs_analysis_subs_project_src_tests_.out` |
| `npx vitest run subs/daemon/src/tests/` (after the relay change) | 0 | 23 files, 270 tests | `vitest2-subs_daemon_src_tests_.out` |
| `npx vitest run subs/daemon/subs/contexts/src/tests/` (after the relay change) | 0 | 15 files, 191 tests | `vitest2-subs_daemon_subs_contexts_src_tests_.out` |
| `npx vitest run subs/cli/src/tests/` (after the relay change) | 0 | 9 files, 250 tests | `vitest2-subs_cli_src_tests_.out` |
| `npx vitest run subs/service-api/src/tests/` | 0 | 7 files, 34 tests | `vitest-subs_service-api_src_tests_.out` |
| `npx vitest run subs/explorer/src/tests/` | 0 | 5 files, 35 tests | `vitest-subs_explorer_src_tests_.out` |
| `npx vitest run subs/presentation/src/tests/`, `…/project-view/src/tests/`, `…/layout/src/tests/` (one each) | 0 | 12/190, 6/104, 2/16 | `vitest-subs_presentation_*.out` |
| `npx vitest run` eight root files, each its own argument: `project-boundary-publication`, `resident-cli`, `project-view-reports`, `quick-environment`, `resident-assembly`, `publication-queue`, `project-boundary-cli`, `entry-boundaries` | 0 | **8 files, 40 tests** (before the fifth publication test was added; that file was rerun alone after) | `vitest-root-files.out` |
| Process check, built launcher, private endpoint, final build | as listed | stopped explicitly, no process left | `process/process-check.sh`, `process/run2.log`, `process/run2/` |
| Toolkit view in a copy, built CLI, private endpoint | 0 | 15 modules, 62 files, 1,066,266 bytes; stopped | `toolkit/` |
| Harness `plan2b.test.ts` (locked) | 0 | 6 tests | `h-plan2b.log` |
| Harness `plan2a.test.ts`, `final-contracts.test.ts`, `self.test.ts` (locked) | 0 | 3 files, 22 tests | `h-plan2a-final-contracts-self.log` |
| Plan 2A single instances (locked) | 0 | 94/94 passed | `p2a-instances.out` |
| `npm run reference:cases` (locked, after the build, frozen tree) | 0 | **37 files, 393 tests** | `cases.stdout`, `cases.stderr`, `diff-*.sha`, `status-*.txt` |

`reference:verify` was not run; it is left to the coordinator's gate. No
`*.test.mjs` changed, so no `node --test` run was due.

## Protected documents and proposed patch

No `.principles.md`, `.spec.md` or glossary file was edited.
`proposed-spec-patches.diff` (sha256 `12f7f265…`, six hunks over three files,
`git apply --check` clean in the worktree):

1. `architect-view.spec.md`, *`module.json`* example: schema `/2` and
   `"boundaries": []` after `"areas"`.
2. Same section: replaces the "When project boundaries are implemented" and
   `files` bullets with the implemented rules: `boundaries` (kind, project-relative
   `dir`, the declaring statement's `description`, `line`, `column`; byte order
   by `dir`; one per line; `[]`; with an example line from the toolkit), nothing
   beneath a tree in any record, count or measurement; `files` counts the
   module's source areas and its auxiliary source, `metrics` the same
   inventory, never inert files, scratch or declared trees; auxiliary originals
   are always `internal` records with a `file` outside `src/`; version 2 of the
   three identifiers added `boundaries`.
3. Same section, layout bullet: a nonempty `boundaries` spans lines like
   `uses`/`usedBy`.
4. *Metadata* example: `ramify.architect-view/2`.
5. `materialized-api-view.spec.md`, *Materialization*: the "When project
   boundaries are implemented" sentence in the present tense, naming the
   project's path classifier, a module scratch directory and exit 2.
6. `architect-view-diff.spec.md` (proposed feature, not implemented): "Accept
   the current `ramify.architect-view/2` format".

The publisher rule needed no patch (the materialization paragraph already says
"names the `ramify.architect-view` schema").

## What iterations 19–21 still lack

- 19: the coordinator's application of this patch if authorized; `CLAUDE.md`
  needs no quotation change from this slice. Teaching or guide prose that
  describes architect module records or `--from` selection: none found outside
  the specifications (`docs/development/*`, `docs/architecture/daemon.md`,
  `processes-and-clients.md` name neither).
- 20: requalification of PB1-27/28/29; the Plan 2B/2C measurements (view size
  and timings) on the final build: the toolkit view measured here is
  1,066,266 bytes in 62 files (Plan 2C recorded 844,838), within the 8 MiB
  budget; timings were not measured here (budgets are reported, not
  blocking).
- Phase 3: `ramify-agent` reads architect views and must accept `/2`.

## Deviations, gaps and decisions needed

1. **Second test file (deviation).** The brief names
   `subs/analysis/src/tests/project-boundary-views.test.ts`. The analysis
   owner receives neither the daemon's publisher, the service nor the
   service-api explorer projection (and its testing profile lacks `dispatch`),
   so transactional publication, the measure document and the explorer DTO are
   verified in the root's `src/tests/project-boundary-publication.test.ts`.
2. **`invalid-location` relay (scope).** Making excluded selection reachable
   exposed the contexts manager's folding of every session refusal into
   `analysis-failed`; the slice keeps `invalid-location` end to end (item 8).
   It touches `ContextApiViewOutcome`, an in-process type without an
   identifier; no wire document changes shape. The coordinator may prefer to
   leave the old folding (then the CLI shows `analysis-failed` with an
   `invalid-location:` message).
3. **Selection of inert owned paths.** `--from notes/design.md` selects the
   root, as any owned path outside an exclusion; the contracts refuse only
   declared trees and always-excluded paths.
4. **Declaration location form.** The record carries the statement's line and
   column and the description path, not a span object; the column is in UTF-16
   code units, as the description parser's spans are.
5. **No explorer or measure member added.** The brief asks to migrate
   browser, dependency and measurement DTOs; none needed a new member (the
   population they show was already the analyzed one). Whether the explorer's
   module records or the measure document should also list boundaries is a
   possible later addition, not asked for by the contracts.
6. **`ramify-agent`** reads `ramify.architect-view/1` documents and is not
   migrated here (Phase 3).

## Coordinator review

Pending.

## Coordinator review

The coordinator reviewed the boundary member of module records, the
auxiliary records, the `--from` selection through the Project classifier, the
publisher rule and the two new test files against the brief, the contracts
and the module-architect principles, authorized
`proposed-spec-patches.diff` unchanged (`architect-view.spec.md`,
`materialized-api-view.spec.md`, `architect-view-diff.spec.md`) and applied
it with this slice. This iteration ran one iteration ahead in the second
worktree; it is merged after iteration 17's gate is green. Accepted: the
second test file at the root, since the analysis owner cannot import the
publisher or the service; `invalid-location` passing through the contexts
manager unchanged, so the CLI names the refusal it received; an inert owned
path selecting its owner. The user decided the publisher rule on 2026-10-03.
The agent did not run `reference:verify`; the coordinator's gate runs the
audit, `reference:cases` and the full verification of plans 1, 2 and, for
this iteration, 2A on the committed candidate.
