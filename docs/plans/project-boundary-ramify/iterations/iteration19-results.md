# Iteration 19 results: site package consumption, production selection and runtime guides

**Date:** 2026-10-05. **Status:** implementation receipt for
[iteration 19](iteration19.md). It awaits the coordinator's review,
protected-file comparison and gate. Changes are uncommitted in the second
worktree, pipelined one iteration ahead of the coordinator's gate on
`eb57fbf8` (iteration 18). Cases produced here: PB1-31 at `public-api` and
PB1-34 at `packed-install`; their final qualification remains with iteration
20. `reference:verify` and the audit were not run: they are left to the
coordinator's gate.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1-next`, branch `feat/project-boundary-ramify-next` |
| Base commit | `eb57fbf8` (tree `c21e069b`), clean at assignment; root and example dependencies installed, site dependencies installed here with `npm --prefix site ci` |
| Contract revision | sha256 `contracts.md` `c6baba7d…`, `handoff.md` `0e9a86d6…`, `acceptance.md` `1bdf94f0…`, `cases.json` `fb687a57…`, `cli-invocation.spec.md` `9a32003f…`, `cross-module-importability.spec.md` `6c932717…`, `module-description.spec.md` `20d42a00…`, `docs/model/glossary.md` `1cd8cbf3…`, all unchanged (one patch proposed) |
| Configuration | `package.json` `be7f3c90…` → `6662831e…` (version, `site:prepare`, `site:dev`, `site:build`); `package-lock.json` `cf3b14fc…` → `1b822bb4…` (the two root version entries); `site/package.json` `a4f590d7…` and `site/package-lock.json` `2dbe3b04…` unchanged; `ramify-audit.json` `371ebef9…`, every `tsconfig*.json` of the toolkit and every Vitest configuration unchanged; `site/tsconfig.json` changed; no `module.ramify` changed; nothing under `ramify-agent/`, `/ramify-audit` or `/ramify` |
| Node / tools | v22.23.3; npm 10.9.9; TypeScript 7.0.2; Vitest 4.1.11 |
| Changed (source, configuration) | `package.json`, `package-lock.json`, `site/docusaurus.config.ts`, `site/tsconfig.json`, `site/src/pages/index.mdx`, `model.mdx`, `modularity.mdx`, `tags.mdx` |
| Changed (prose) | `CLAUDE.md` (two of the four consented changes), `README.md`, `docs/development/batch-verification.md`, `docs/development/testing.md`, `docs/roadmap.md`, `docs/architecture/README.md`, `docs/architecture/project-boundary.proposal.md` (status header), `scripts/reference-harness/README.md`, `site/src/pages/glossary.md` |
| Added | `scripts/prepare-site-candidate.ts`, `src/tests/production-boundary.test.ts`, `src/tests/package-consumer.test.ts`, this receipt |
| Evidence | `/home/app/ramify-pb1-evidence/iteration19/` |

## Changed behaviour

### Site consumption through the packed candidate (deliverable 1, PB1-34)

1. **Root script.** `scripts/prepare-site-candidate.ts`, run as
   `npm run site:prepare`, root auxiliary source:
   - when any file the manifest's `exports` or `bin` names is missing from the
     checkout, it runs `npm run build` first (a fresh checkout has no `dist/`);
     when `site/node_modules` is missing, it runs `npm ci` in `site/` first;
   - `npm pack <root> --json --ignore-scripts` into a fresh `os.tmpdir()`
     directory, then the SHA-256 of the tarball;
   - `npm --prefix site install <tarball> --no-save --ignore-scripts
     --prefer-offline --no-audit --no-fund`; every npm call names its prefix or
     package directory explicitly;
   - it fails unless `site/package.json` and `site/package-lock.json` are
     byte-identical before and after, the installed `ramify.ts` has the
     manifest's version, and `site/node_modules` holds exactly one `react` and
     one `react-dom`, at the top level; it prints name, version, tarball file
     count, SHA-256 and npm integrity, and removes the temporary directory.
2. **No-save, no lock write.** The brief names no-save/no-lock options. The
   first version passed `--no-save --no-package-lock`: npm then ignored the
   site's lockfile and resolved the site's whole tree again from the registry
   (`added 72, removed 27, changed 143 packages`; `site-tree-diff-1.txt`
   compares the installed versions with `npm ci`'s). `--no-save` alone writes
   neither the manifest nor the lockfile and keeps every locked version: the
   install only adds the candidate and its dependencies (56 packages, no
   removal or version change; `site-tree-diff-2.txt`). The script uses
   `--no-save` and verifies both files unchanged.
3. **Scripts.** `site:build` is `npm run site:prepare && npm --prefix site run build`.
   `site:dev` runs `site:prepare` too (see deviations). `site:serve` and the
   toolkit `build` are unchanged: the toolkit build never reads the site.
4. **Site.** `site/docusaurus.config.ts` loses the `ramify-source` webpack
   plugin (the `@ramify/presentation`, `@ramify/model`, `@ramify/layout`
   aliases into toolkit `src/` and the `.js`→`.ts` extension alias); its header
   comment says where the diagrams come from. The four pages import
   `ramify.ts/presentation` (no page imported the model or layout aliases).
   `site/tsconfig.json` loses its three `paths`. `site/package.json` and its
   lockfile are unchanged: no `file:` dependency, no registry integrity.
5. **Order.** Toolkit build → pack → install → Docusaurus build. The site never
   compiles toolkit source; webpack resolves `ramify.ts/presentation` through
   the package's `exports` to `dist/subs/presentation/src/index.js`, whose
   `react` and `react/jsx-runtime` resolve to the site's own React.

### Production selection (deliverable 2, PB1-31)

No change to `scripts/production-selection.ts`: it still selects, from the
resolved inventory, files with `placement: 'src'` whose area profile lacks
`testing` (the rule iteration 8C adopted). `src/tests/production-boundary.test.ts`
(3 tests) runs the real `scripts/production-files.ts --root` command as a
child process and reads profiles and placements from `acquireInventory`:

| Test | Independent expectation |
| --- | --- |
| profiles | Over the written topology plus a resource in `b` and a testing module `specs` [testing, dispatch], with a configuration that selects every `.ts` file: exactly `src/main.ts`, `subs/a/src/api.ts`, `subs/a/subs/grand/src/grand.ts`, `subs/b/src/consumer.ts`, `subs/b/src/style.css`; `specs` ordinary and every `tests` area carry `testing`; the five auxiliary files (`scripts/check.ts`, `tools/tmp/helper.ts`, `subs/a/scripts/report.ts`, `report.test.ts`, `subs/specs/scripts/tool.ts`) are inventoried with their owner's ordinary area and not selected; testing files inventoried, not selected; inert files, both declared trees and both scratch directories absent from the inventory; exactly the four warnings `compiler-selected-owned-ignored` (`fixture-project`, `subs/a/fixtures/sample`) and `compiler-selected-scratch` (`src/tmp`, `subs/a/src/tmp`), none for the external tree |
| widening | New inert, auxiliary, testing, testing-module, declared-tree and scratch files leave the selection unchanged; a new ordinary `subs/b/src/extra.ts` is added (positive control) |
| toolkit | Every selected toolkit file has placement `src` and a non-testing profile; `src/cli-entry.ts` and `subs/presentation/src/index.ts` selected; the inventory holds auxiliary source (`scripts/production-selection.ts`, `subs/presentation/scripts/emit-diagrams.ts`), none selected; nothing from `subs/integration-tests/` or any `src/tests/`; no inventory path in `docs/`, `site/`, `examples/collection-review/`, `scripts/reference-harness/`, `ramify-agent/`, `src/tmp/` |

**Negative controls** (`negative/`): removing the placement filter fails all
three tests; removing the profile filter fails all three. The file was restored
and its SHA-256 verified (`restored-2.txt`).

**PB1-31 wording conflict.** The case's expected result says "ordinary
auxiliary inputs are eligible", as does contracts.md ("Transport, observation
and projections"). The implemented rule, adopted in 8C and accepted by the
coordinator there, never selects auxiliary source, and iteration 5's receipt
says production selection must keep excluding it. The test asserts the
implemented rule. Every other clause of PB1-31 passes; the auxiliary clause
needs a decision (see gaps).

### Version (deliverable 3)

`package.json` and the two root entries of `package-lock.json` read `0.2.0`.
The runtime identity, `--version`, the engine string and evidence identities
read the manifest; no expectation names the version literally.

### Guides, pages and documents (deliverable 4)

- `README.md`: root selection by the root marker (climb, `--root`), compiler
  configuration from the root, auxiliary source, nested trees and the two
  compiler-selection warnings; the layout list names each declared tree and
  the root auxiliary hook adapter and scripts; the site section documents
  `site:prepare` and the package consumption; the portability paragraph drops
  the aliases. The first paragraph (the root's purpose) is unchanged.
- `docs/development/batch-verification.md`: production selection over the
  resolved profiles and `src` placement; owned-ignored trees and root
  auxiliary scripts replace "scripts have separate compiler configurations";
  root selection by the marker; the package-entry table gains `module-tree`,
  `module-tree.css` and `client`, and states that no other subpath resolves.
- `docs/development/testing.md`: the `site:build` row describes `site:prepare`.
- `scripts/reference-harness/README.md`: the no-project case's climb wording
  (the checkout's marked description; a marked fixture below a working
  directory with no description above it).
- `site/src/pages/glossary.md`: the entries the phase changed in
  `docs/model/glossary.md` are reproduced verbatim: "Files belonging to a
  module" (owned contents) and the new Nested tree, Owned-ignored tree,
  External tree, Always-excluded path, Scratch directory, Auxiliary source,
  Containment and Package resolution entries; Source area; Module-exposed
  symbol (no auxiliary original); Module header (optional root marker); the new
  Root marker entry; Module tagging. Apart from its closing section the page
  now equals the model glossary from "ramify module" on. Other site pages show
  only child descriptions and were not changed.
- `docs/roadmap.md`: the project-boundary row states Phase 1 implemented
  through iteration 19 on `feat/project-boundary-ramify`, not merged, with
  iterations 20–21 and Phases 2–3 remaining; the strict-warning row says the
  phase replaced the outside-module warnings.
- `docs/architecture/README.md`: the CLI invocation and Project boundary rows.
- `docs/architecture/project-boundary.proposal.md`: status header only
  (Ramify's part implemented by Phase 1, qualification pending, audit and
  agent parts for Phases 2 and 3); content unchanged.
- No skill under `.claude/skills/` and no other `docs/development/` guide
  describes the climb, the warnings or the view formats in a way the phase
  made false.

## `CLAUDE.md` (user's consent of 2026-10-04)

| Change | Applied | Reason |
| --- | --- | --- |
| A: root marker, climb, nested trees | **Held back** | "an owned import into one is denied" is broader than the implemented rule: an import that reaches a declared tree through package resolution (an installed `node_modules` link) is external, not denied (PB1-15; contracts; `cli-invocation.spec.md` "without package resolution"). Proposed: "The project root's description is marked `root module <name>`, and `ramify check` climbs to the nearest marked description. A description may declare nested trees as `owned-ignored` or `external`; Ramify does not inventory or analyze them, and an owned import into one without package resolution is denied." |
| B: "reports project warnings" | Applied | The specification's three warnings are project warnings. |
| C: auxiliary source paragraph | **Held back** | "Other owned files outside `src/` are inert" is false for descriptions, READMEs and configuration, which the analysis reads as inputs (the specification's hook section; the analyzed population of iteration 18). Proposed sentence: "Other owned files outside `src/`, apart from the descriptions, READMEs and configuration the analysis reads, are inert." The remaining sentences of C were checked and are accurate. |
| D: owner count | Applied | `check:self` reports 15 owners: "fifteen". |

Other statements the phase made false, not edited:

1. "The independent scripts, site and example have separate compiler scopes."
   Proposed: "The site, the example, the reference harness and two probe
   fixture projects are owned-ignored trees with their own compiler scopes;
   other scripts are root auxiliary source that `check:self` analyzes."
2. "The module header classifies ordinary `src/`, including interfaces" omits
   auxiliary source. Proposed: "The module header classifies ordinary source,
   including `src/interfaces/` and auxiliary source outside `src/`".
3. "the toolkit's `tsconfig.json` excludes it" (ramify-agent): the root also
   declares it `external`. Proposed addition: "and the root description
   declares it `external`".
4. The paragraph change C would replace stays false until applied.

## PB1-31 and PB1-34

- **PB1-31** (`public-api`): the three tests above; negative controls fail.
  The auxiliary-eligibility clause conflicts with the implemented rule.
- **PB1-34** (`packed-install`):
  - Site: `npm --prefix site ci` (candidate absent), `npm run site:build`
    (pack and install, Docusaurus build exit 0), again at once (exit 0, same
    tarball SHA-256, installed tree identical); `git status` shows no change to
    `site/package.json` or `site/package-lock.json` (SHA-256 `a4f590d7…`,
    `2dbe3b04…` unchanged). Fresh-checkout runs: with `dist/` moved away the
    script built the toolkit first; with `site/node_modules` moved away it ran
    `npm ci` first; both builds succeeded. Negative control: `npm --prefix
    site run build` without the candidate fails, `Can't resolve
    'ramify.ts/presentation'`. One React: `site/node_modules` holds one
    `react` and one `react-dom` (19.2.8), none nested; the client bundle holds
    one React core module (one `useTransition` export definition) and one
    `react-dom` renderer; the built pages carry their diagrams (6, 9, 7, 7 and
    5 `<svg>` elements on the index, model, tags, modularity and glossary
    pages).
  - `src/tests/package-consumer.test.ts` (1 test): `npm pack` of the build into
    a temporary directory with no `node_modules` above it; `npm install
    --omit=dev` of the tarball into a consumer; the test's entry list must
    equal the manifest's `exports`; NodeNext `tsc` of a file importing every
    JavaScript entry's export, `AnalysisReport` and `ResolvedTagRegistry`, with
    an `@ts-expect-error` proving real declarations, exits 0 with no output; a
    file importing `ramify.ts/dist/subs/analysis/src/analyze-project.js`,
    present in the installed package, fails with exactly
    `internal.ts(1,32): error TS2307: Cannot find module '…' or its
    corresponding type declarations.`; Node's `import.meta.resolve` maps every
    entry, the stylesheet included, to its manifest target under
    `node_modules/ramify.ts/` and refuses the internal path with
    `ERR_PACKAGE_PATH_NOT_EXPORTED`; `ramify.ts/model` and `ramify.ts/client`
    load. `vitest`, `tsx` and `jsdom` are absent from the consumer.

## Tarball

`npm pack --dry-run --json --ignore-scripts` on the final tree
(`pack-dry-run.json`, `pack-summary.json`): `ramify.ts-0.2.0.tgz`, version
0.2.0, 492 files, 851,454 bytes packed, 3,273,409 unpacked, integrity
`sha512-CDn9vhbrHQlz4NciC1XDrhfs9GyOjMwphOaTKFI1Jjk4PcTgfPbf1jJouDWm/u7r+ekxSE5hpDijn3cZhAVwUw==`;
the final `site:build` packed the same bytes (SHA-256 `b819601e…`, same
integrity). Top level: `LICENSE`, `README.md`, `package.json`,
`dist/explorer`, `dist/runtime-identity.json`, `dist/src`, `dist/subs`. No
compiled Bun client (`dist/src/ramify-client-*`), no test file and no `.ts`
source other than declarations. Package entries: `.`, `./analysis`,
`./analysis/inventory`, `./model`, `./presentation`, `./module-tree`,
`./module-tree.css`, `./cli`, `./layout`, `./client`, unchanged; `bin.ramify`
`dist/src/ramify`. The digest is for this uncommitted tree; iteration 20/21
packs the committed candidate.

## Re-reasoned expectations and instance rows

- **Version.** No harness or test expectation names `0.1.0`: `--version`
  (`I1-26:help-version/version`), the engine string, the runtime identity and
  the evidence identities (`packageVersion` in `artifact.ts`, the completion
  and reuse checks) read `package.json`, so 0.2.0 changes the measurement
  evidence identity (engine `ramify.ts@0.2.0+typescript@7.0.2`) but no
  expected value. The measurement instances already fail before this slice for
  lack of current evidence (iteration 20). The `relocation.ts` comment
  "Release 0.1.0's `files` list excludes…" remains true and is unchanged.
- **Installed package (`I1-28:relocated-package`, `I2-30:relocated-resident`).**
  The packed file set, the entries, the launcher and the optional React peers
  are unchanged; the relocated `npm test` now runs the two new root tests,
  which need only the build, npm and the npm cache the relocation keeps.
- **Production (`I1-30:production-selection/*`, `test-discovery/*`).** The
  selection is unchanged; the new root tests are testing source discovered
  under `src/tests/`; the new root script is auxiliary source, not selected.
- **Package entries (`I2-30:package-entries`, `I5-14:package-entries-unchanged`,
  `I2A-13:declarations-package`, validator `completionEntries`).** `exports`
  and `bin` unchanged; no validator layer needed.
- **Documents (`I5-14:documents-revised`, `I2A-13:documents-handoff`).** The
  patterns they read are untouched.
- **Instance rows.** No `plan*-instances.ts` row, count or identity changed.
  Rows whose prose no longer describes their instance: none new (the
  baseline-repair-2 list for `I2-30:package-entries` and
  `I5-14:package-entries-unchanged` still applies).

## Protected documents and proposed patch

No `.principles.md`, `.spec.md` or glossary file was edited.
`proposed-spec-patches.diff` (sha256 `b1ac59c3…`, three hunks over two files,
`git apply --check` clean in the worktree):

1. `cli-invocation.spec.md`, status line: "Decided and implemented invocation
   contract for `ramify check` and `ramify affected`", naming what the
   project-boundary phase implemented (root selection by the marker, auxiliary
   source, declared nested trees, project warnings, path dispositions); "Other
   command names" replaces "Command names other than `check`".
2. `cli-invocation.spec.md`, *Files outside modules*: "any other owned file
   outside `src/` is inert and silent, apart from the descriptions, READMEs
   and configuration the analysis reads as inputs" (the hook section and the
   implementation already treat those as analysis inputs).
3. `cross-module-importability.spec.md`, status: "the remaining tooling
   changes are not yet implemented" becomes "Ramify's checks implement these
   rules."

Status passages reviewed and left as they are: `module-description.spec.md`
and `typescript-source-interpretation.spec.md` already state the implemented
rules; `architect-view.spec.md` and `materialized-api-view.spec.md` were
patched in iteration 18; `architect-view-diff.spec.md` ("not implemented")
and `modularity-report.spec.md` ("under implementation") concern other plans
and stay pending; in `cli-invocation.spec.md` the strict configuration and the
project configuration file ("not part of Plan 1"; "Plan 1 has no strict
configuration or CLI flag") remain unimplemented and keep their wording.

## Commands and results

Focused commands ran without the lock; the locked runs held
`/tmp/ramify-audit-tests.lock` (`run-locked.sh`: requested 2026-10-05T07:06:16Z,
acquired 2026-10-05T07:08:58Z, instances to 07:18:19Z, `reference:cases`
07:18:19–07:24:06Z). The tree was frozen: `git status` and the diff hash
(`03434eb7…`) were identical before the locked runs, before and after
`reference:cases`.

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check`; new files scanned for trailing whitespace | 0 | clean | `diff-check.log` |
| `npm run build` (base; after the version; final) | 0 | built | `build-0.out`, `build-1.out`, `final/build.out` |
| `npm run type-check` (final) | 0 | four scopes | `type-check-2.out` |
| `npm run check:self` (final) | 0 | passed, partial; 15 owners, **596** source files (593 + the two tests and the script), 17 resources, 8880 accesses, 0 errors, 0 warnings, 41 limits, 5661 allowed, 0 denied, 3175 external | `check-self-2.out` |
| `npx tsx scripts/validate-final-contracts.ts` (final) | 0 | 15 owners, 613 files, 173 expanded statements, 8 package entries | `validate-2.out` |
| `npm --prefix site ci` (four times) | 0 | 1272 packages, no candidate | `site-ci-*.out`, `final/site-ci.out` |
| `npm run site:build` (candidate absent; again; no `dist`; no site modules; final A and B) | 0 | built; same tarball digest per tree | `site-build-*.out`, `final/site-build-a.out`, `final/site-build-b.out` |
| `npm --prefix site run build` without the candidate | 1 | `Can't resolve 'ramify.ts/presentation'` | `site-build-negative-no-candidate.out` |
| `npm run diagrams` (twice) | 0 | committed SVGs unchanged | `diagrams.out`, `final/diagrams.out` |
| `npx vitest run src/tests/production-boundary.test.ts` | 0 | 3 tests | `pb-production-run2.out` |
| Negative controls (placement, profile filter) | 1 | 3/3 failed each; restored | `negative/` |
| `npx vitest run src/tests/package-consumer.test.ts` | 0 | 1 test | `pb-consumer-run2.out` |
| `npx vitest run` the 24 root test files, each its own argument (first run) | 1 | 23/24 files; `dependency-diagram-daemon.test.ts` BD24 failed: coverage `partial` | `vitest-root-files.out` |
| `npx vitest run src/tests/dependency-diagram-daemon.test.ts` after the fix | 0 | 1 test | `bd24-after-fix.out` |
| `npx vitest run` the 24 root test files, each its own argument (final) | 0 | **24 files, 118 tests** | `vitest-root-files-2.out` |
| `npm pack --dry-run --json --ignore-scripts` | 0 | see Tarball | `pack-dry-run.json`, `pack-summary.json` |
| Harness `final-contracts.test.ts`, `production.test.ts`, `relocation.test.ts` (locked) | 0 | 3 files, 22 tests | `h-final-contracts-production-relocation.log` |
| Plan 1 single instances (locked) | 0 | **32/32 passed**: I1-28 ×16 (incl. `relocated-package`), I1-30 ×14, I1-26 `help-version` ×2 | `p1-instances.out` |
| Plan 2 single instances (locked) | 0 | 4/4: I2-30 `package-entries`, `declarations-final`, `relocated-resident`, `self-check-fifteen` | `p2-instances.out` |
| Plan 5 single instances (locked) | 0 | 4/4: I5-14 `package-entries-unchanged`, `declarations-final`, `self-check-fifteen`, `documents-revised` | `p5-instances.out` |
| Plan 2A single instances (locked) | 0 | 4/4: I2A-13 `declarations-package`, `documents-handoff`, `self-reference-checks`, `plan3-preserved` | `p2a-instances.out` |
| `npm run reference:cases` (locked, after the build, frozen tree) | 0 | **37 files, 393 tests** | `cases.stdout`, `cases.stderr`, `diff-*.sha`, `status-*.txt` |

**BD24 failure (real, fixed).** The first version of
`production-boundary.test.ts` imported `scripts/production-selection.ts`
statically. BD24 checks a toolkit copy holding only `src`, `subs` and root
files, where that import is unresolved, so its check reported partial
coverage. The test now runs the real `production:files` command as a child
process and imports only analysis's inventory entry; BD24 passed alone and in
the final run. No `*.test.mjs` changed, so no `node --test` run was due. No
owner other than the root changed, so no owner directory run was due.

`reference:verify` and the audit were not run; they are left to the
coordinator's gate.

## What iterations 20–21 still lack

- 20: requalification of PB1-31 and PB1-34 on the committed candidate, after
  the decision on PB1-31's auxiliary clause; the measurements, whose evidence
  identity now names 0.2.0; the final gate's `npm run site:build` after
  `npm run build`, as here.
- 21: the packed artifact of the committed candidate with its digest (the
  digests here are for an uncommitted tree), the PB1-36 installed-package
  probe and the receipt.
- The coordinator's application of the proposed patch if authorized, and the
  user's decision on the held-back `CLAUDE.md` changes A and C.

## Deviations, gaps and decisions needed

1. **PB1-31 auxiliary clause (decision).** contracts.md and PB1-31 say
   ordinary auxiliary inputs are eligible for production; the implemented and
   reviewed rule (8C) selects only `src` files. Options: (a) amend the case
   and contracts wording to the implemented rule (auxiliary source is checked
   with the ordinary profile but is never package output), suggested; (b) make
   auxiliary source eligible, which compiles scripts such as
   `cucumber-viz.config.ts` into the package and failed the build in 8C.
2. **`CLAUDE.md` A and C held back** (corrected sentences above).
3. **`--no-package-lock` not used.** It made npm re-resolve the site's tree
   (item 2 above); `--no-save` alone writes neither file.
4. **`site:dev` also runs `site:prepare`** (not named by the brief): after
   `npm --prefix site ci` the dev server would otherwise fail to resolve
   `ramify.ts/presentation`. Live reload of toolkit source no longer reaches
   the site; a toolkit change needs `npm run build` and `site:prepare`.
5. **Build when missing.** The script builds the toolkit only when an entry
   file is missing; an existing build is packed as it is, so the final gate's
   frozen build is never replaced by `site:build`.
6. **Network.** The candidate's dependencies install with `--prefer-offline`
   from the npm cache; a machine without the cache needs the registry. The
   package-consumer test likewise.
7. **Evidence size.** The fresh-checkout runs moved `dist/` (85 MB) and the
   site's `node_modules` into `fresh-checkout/` of the evidence directory,
   where they remain (no deletion was allowed).
8. `site/package.json`'s description still says the pages consume "the
   declared presentation, model and layout package surfaces"; left unchanged
   so the manifest stays byte-identical (the pages consume only presentation).
9. `site/src/pages/tags.mdx` says a module's tags classify "its ordinary
   source under `src/`"; the header also classifies auxiliary source. The
   page teaches the `src/` layout and is not false; left unchanged, flagged.
10. `docs/architecture/README.md`'s dated status paragraph (2026-09-11,
    "eleven toolkit owners", "resident execution remains unavailable") predates
    this phase and is unchanged.

## Coordinator review

Pending.

## Coordinator review

The coordinator reviewed the site preparation script, the two new tests, the
version change and the updated guides against the brief and the contracts,
authorized `proposed-spec-patches.diff` unchanged (`cli-invocation.spec.md`
and `cross-module-importability.spec.md`, status wording and the exception
for descriptions, READMEs and configuration among inert files) and applied
it with this slice. This iteration ran one iteration ahead in the second
worktree and is merged after iteration 18's gate is green. Of the four
`CLAUDE.md` changes the user worded, B and D are applied; A and C are held
back because one clause of each is inaccurate against the implemented
behaviour, and the corrected sentences are put to the user, as the user's
consent requires. The production clause of PB1-31, which calls ordinary
auxiliary inputs eligible while the reviewed rule selects only `src/` files,
is put to the user as well. Accepted: `site:dev` also prepares the candidate;
the script packs an existing build and builds only when an entry is missing.
The agent did not run `reference:verify` or the audit; the coordinator's gate
runs them on the committed candidate.
