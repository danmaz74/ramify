# Iteration 2 results: release and handoff

**Date:** 2026-10-06. **Checkout:** `/home/app/ramify-affected`, branch
`feat/affected-rule`. **Base revision:** `a188a124` (iteration 1 done, its
gate passed). Uncommitted evidence is under
`/home/app/ramify-affected-evidence/iteration2/`. The production evidence is
under `/home/app/ramify-audit-pb-evidence/ramify-0.3.0-prod/`.

**Status:** complete. Steps 1 to 5 are done. ramify-audit Plan 8 qualified the
artifact, Dan approved, and the coordinator published `ramify.ts` 0.3.0; see
the [publication addendum](#addendum-publication). The
[handoff](../handoff.md) is written (step 6).

## Commits

| Commit | Content |
| --- | --- |
| `63cb7ccf` | **Release commit.** `chore(release): ramify.ts 0.3.0`: `npm version 0.3.0 --no-git-tag-version`. The diff touches only the `version` member of `package.json` and the two `version` members of `package-lock.json` (the root and `packages[""]`). |
| `154bcb97` | `docs(plan)`: this results file up to the publication gate. |
| `83a33801` | `docs(plan)`: the post-release contract correction (the basis of a description seed beneath `src/`); see the plan's execution record. |
| the publication commit | `docs(plan)`: the [publication addendum](#addendum-publication), the [handoff](../handoff.md), the plan's completion and the roadmap line. |

## Protected documents

All tracked `.principles.md` and `.spec.md` files and the glossary, before
(`a188a124`) and after (`HEAD`) this iteration (`protected-before.txt`,
`protected-after.txt`). Nothing changed, and iteration 2 had no authorized
patch.

| File | Before = after |
| --- | --- |
| `docs/agents/module-architect.principles.md` | `3858898770ab5f2a54fd375ba5aa6a4c3f72a5ac00f04f974405ac95aa580d25` |
| `docs/architecture/architect-view-diff.spec.md` | `da621110a5557ae955e2c39f4abb718b3d4c3f74396114e05d66d3a1fc19b573` |
| `docs/architecture/architect-view.spec.md` | `f8989ad661566eaf668ad6c213994e345988a4f31d7d733e175302225a826794` |
| `docs/architecture/cli-invocation.spec.md` | `dac3ae58473c74d5f03f82d695e715a41cab98466df48cd4477efd7d8bdabd9f` |
| `docs/architecture/materialized-api-view.spec.md` | `abf24295d49ff32ad1202c8c8209d76e68ed4c18a2aa0ab758811b0527a92bb5` |
| `docs/architecture/modularity-report.spec.md` | `00fc9dba0b42145267e9e83a9b454d2d332deecc845adeadf14cfcf60472c1b4` |
| `docs/architecture/quick-testing.spec.md` | `b04db2008bacef3146dbfc211206187ac28abb41866f91b07568f56d1d271002` |
| `docs/model/cross-module-importability.principles.md` | `c3b6539448902130822c183f6d3613f49c4686cb91eef17d5f73cfe546b441ea` |
| `docs/model/cross-module-importability.spec.md` | `4aba3df0be6ff7356e7107f8d7c2786ff45ab35c9ede0b319454547b5029d789` |
| `docs/model/glossary.md` | `247587c20b8864b2d0a07f7688fe3e3eeb8b61aadb42603387fa72be0c192cfc` |
| `docs/model/module-description.spec.md` | `19e292a9bc44bff47d60398b7cc1a507523e1aa73e11cc4b2c56e0988c10b07c` |
| `docs/model/typescript-source-interpretation.spec.md` | `c1fd4d6551d130bbcd723c8b1a56075e858c06e2a6eaacb50fb147ea0e3a1a95` |
| `ramify-agent/docs/architecture/plan-context-catalog.spec.md` | `0ce605884b1f2996401040d5ba4d2a49e59906c7a12fb223c28d3c0c1ef4fa14` |
| `ramify-agent/docs/check-findings.principles.md` | `6c72c2175de7ecbe3e0746cba469fac7a9051a47c529b3769d11f6b7107bbfea` |
| `ramify-agent/docs/check-findings.spec.md` | `ad0c9df605cd60385775c676a7920fbd7865857f84fe02b721b475e2c3c132df` |
| `ramify-agent/docs/harness.principles.md` | `80222a6460a08f9c6221f50a8d2ba8ae6d698f632a86c2552521e3cf621d1a84` |
| `ramify-agent/docs/harness.spec.md` | `78b1de2aef9c013fd40048cf8d664e819d00887259036bb590aaa46529e8e6ed` |

The two plan-tracked documents, `docs/architecture/cli-invocation.spec.md`
and `docs/model/glossary.md`, keep iteration 1's post-patch hashes.

## Step 1: release commit and final gate

- `npm view ramify.ts versions --registry https://npm.braimax.com` before
  packing: `[ '0.1.0', '0.2.0' ]`. 0.3.0 is unpublished.
- The gate command, fresh from the clean checkout at `63cb7ccf`, with
  ramify-audit 0.4.0 and `--full` (`gate-audit.json`):

| Commit | `composition.verdict` | Run ref | Report commit |
| --- | --- | --- | --- |
| `63cb7ccf` | **`pass`** (0 outstanding failures, `summary.overall: pass`, not scoped, chain depth 0) | `refs/audited/runs/2026-10-06T14-51-49Z-63cb7ccf0` | `c0118696` |

  Every check passed: patch integrity, build, type-check, structure
  (`check:self`) and tests (204 files, 2823 tests, 0 failed, 330 s).

## Step 2: production artifact (AR-09)

Receipt: [`RECEIPT.md`](/home/app/ramify-audit-pb-evidence/ramify-0.3.0-prod/RECEIPT.md),
in the sections of the 0.2.0 receipt.

| Item | Value |
| --- | --- |
| Clone | `ramify-0.3.0-prod/src`, detached at `63cb7ccf`, tree `fe96ee22f5b181d0223b3935f469b1cb8b99a9c0`; porcelain and ignored status empty before; only `dist/` and `node_modules/` ignored after |
| `package.json` / `package-lock.json` sha256 | `a30a83c3…a764673` / `fd94578e…a036f06c3` |
| Environment | Node v22.23.3, npm 10.9.9, Bun 1.4.2; `npm ci --include=dev`, then build and pack with `NODE_ENV=production` |
| Tarball | `/home/app/ramify-audit-pb-evidence/ramify-0.3.0-prod/artifact/ramify.ts-0.3.0.tgz`, mode 0444, 791,265 bytes |
| SHA-256 | `aaaf41272fb1337477a01cf15210283c1e9bed141f57870d7a98e1c6686745d3` |
| npm integrity | `sha512-D35L+Mc9tzhxdqZLdBQqAOeAx3spw5hUfEVUoFQoOWbrr9aJe38YlxbbgI2T99uHEzn80eBaKbI6o6V0nR3LGA==` |
| shasum | `521e0f79a174f281345c871aa2a1f824d2ce3932` |
| Files | 492, 3,047,501 bytes unpacked |
| Manifest | `artifact/ramify.ts-0.3.0.manifest.tsv`, sha256 `e4865832e0ed87170b57a60e11a763f21dc4ff7f8e9ce3212fd6a46c99e37bcf` |
| Difference from 0.2.0 | Same 492 paths. 14 files differ in content: `package.json`, `README.md`, `dist/runtime-identity.json` and the compiled output of the files iteration 1 changed. The explorer bundle is byte-identical. |

## Step 3: isolated smoke (AR-09)

In `ramify-0.3.0-prod/smoke/`, with no `package.json`, `node_modules` or
`.git` in any ancestor directory:

- `npm install <tarball> --omit=dev --ignore-scripts`: 100 packages, exit 0;
  the lockfile's integrity for `ramify.ts` 0.3.0 equals the tarball's.
- `npx ramify --version`: `0.3.0`.
- `npx ramify affected --batch --format json --root "$E/qualify" --path tsconfig.json`
  (the clone at `487df678`): exit 0, `ramify.affected-cli/3` with
  `ramify.affected/3`, `ramifyVersion` `0.3.0`, batch; seed `tsconfig.json`
  owned by `ramify`, containment, kind `captured-input`, selecting all 15
  modules; changed all 15, affected none; `all-modules` with
  `partial-coverage`, 41 coverage notes; `analysisCheck` `passed`.
- `npx ramify daemon status`, from `smoke/` and from `qualify/`:
  `not running`. No process remained.

## Step 4: qualification on a toolkit clone (AR-07, AR-08)

The clone `ramify-0.3.0-prod/qualify`: branch `qualify` from `63cb7ccf`,
`npm ci`, `npm run build`. Six case commits, each a harmless edit: a trailing
newline for the three non-TypeScript files, a trailing comment line for the
three TypeScript files. Each case ran at its own commit, with the seeds from
`git diff --name-only HEAD~1 HEAD`, through the artifact (installed in
`smoke/`, `--root "$E/qualify"`) and through the clone's own
`dist/src/ramify` (no `--root`). Answers:
`/home/app/ramify-affected-evidence/iteration2/qualify-answers/`.

Every answer exits 0 with `ramify.affected-cli/3`, `ramifyVersion` `0.3.0`,
batch mode, `selection: all-modules`, widening `partial-coverage`, 15 test
modules, coverage partial with 41 notes and `analysisCheck: passed`, as the
contracts expect for the toolkit.

| Case | Commit | Seed | Status / module / basis / exclusion | Kind | Selects | Changed | Affected | Artifact = clone | 0.5.0 verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 docs edit | `d848ec4d` | `docs/agents/README.md` | owned / `ramify` / containment / owned-ignored `docs` | ignored | [] | [] | [] | yes¹ | unavailable, ramify-unavailable, unsupported-schema |
| Q2 module README edit | `94753643` | `subs/presentation/subs/layout/README.md` | owned / `ramify/presentation/layout` / declaration / null | readme | [] | [] | [] | yes¹ | as Q1 |
| Q3 configuration edit | `e47639d2` | `tsconfig.json` | owned / `ramify` / containment / null | captured-input | all 15 | all 15 | [] | yes¹ | as Q1 |
| Q4 auxiliary script edit | `f21941c4` | `scripts/build-production.ts` | owned / `ramify` / inventory / null | auxiliary-source | [ramify] | [ramify] | [cli, daemon, explorer, integration-tests, service-api] | yes¹ | as Q1 |
| Q5 declared probe-fixture edit | `c65bda90` | `scripts/probes/fixtures/compiler-api/src/consumer.ts`² | owned / `ramify` / containment / owned-ignored `scripts/probes/fixtures/compiler-api` | ignored | [] | [] | [] | yes¹ | as Q1 |
| Q5b undeclared probe fixture | `487df678` | `scripts/probes/fixtures/synthetic-owners.ts` | owned / `ramify` / inventory / null | auxiliary-source | [ramify] | [ramify] | [cli, daemon, explorer, integration-tests, service-api] | yes¹ | as Q1 |

Affected IDs are written without the `ramify/` prefix. Every kind and
selection equals the brief's expected row and the
[expected toolkit table](../contracts.md#expected-toolkit-answers-with-030).

¹ Equal apart from `revision.inputId`, `selection.inputId` and
`selection.scope.selection`; `ramifyVersion` is `0.3.0` in both. See
[deviations](#deviations).

² The brief names `scripts/probes/fixtures/compiler-api/consumer.ts`, which
does not exist; see [deviations](#deviations).

**AR-08.** The installed 0.5.0 interpreter
(`interpretAffectedResult({ status: 'exited', exitCode: 0, stdout }, root)`,
`qualify-answers/interpret-050.mjs`, output `interpret-050.json`) gives every
one of the twelve answers, artifact and clone, `status: 'unavailable'`,
`fallbackReason: 'ramify-unavailable'`, `code: 'unsupported-schema'`, with the
message "schemaVersion ramify.affected-cli/3 is not ramify.affected-cli/2."
No 0.5.0 audit ran end to end, as the brief says.

**AR-07, from the artifact.** The 18 paths of the expected toolkit table, each
queried alone through the artifact on the clone at the release commit
(`qualify-answers/toolkit-18/01.json` to `18.json`). Every answer is
`ramifyVersion` `0.3.0`, exit 0, and its seed kind, selects, changed and
affected lists equal iteration 1's answers from the build at `f49cfbb6`, which
equal the contracts' table. Row 08 is the brief's literal Q5 path, absent,
and is `ignored`.

## Step 5: hand-over to ramify-audit Plan 8

Reported to the coordinator: the receipt path, the tarball path, SHA-256 and
integrity above, and the release commit `63cb7ccf`. Plan 8's qualification on
this tarball is its own work and has not been recorded here.

## Steps 6 and 7: handoff and publication

- Step 6: [`handoff.md`](../handoff.md), written after publication. It
  includes the measured 0.3.0 kind of each file that the toolkit's old
  `fullAuditPaths` patterns match.
- Step 7: the gate's two conditions were met and the coordinator published.
  See the [addendum](#addendum-publication).

## Deviations

- **Q5's path.** The brief's and contracts' Q5 path
  `scripts/probes/fixtures/compiler-api/consumer.ts` does not exist; the
  tracked file is `scripts/probes/fixtures/compiler-api/src/consumer.ts`, in
  the same owned-ignored tree. Q5 edits the tracked file, so its seed is that
  path. The literal path, as an absent seed, is row 08 of the 18-path run and
  is also `ignored`. The expected answer holds for both.
- **Byte equality of the artifact and the clone answers.** The brief expects
  them byte-equal apart from `ramifyVersion`. Both have `ramifyVersion`
  `0.3.0`, yet two members differ in every case:
  - `scope.selection` is `given` for the artifact, which the brief runs with
    `--root`, and `found` for the clone, which it runs without `--root`;
  - `inputId` (in `revision` and `selection`) differs because it depends on
    where the analyzing `ramify.ts` package is installed. Two installs of the
    same tarball in different directories give different `inputId` values for
    the same tree; each install gives a stable value. The clone run with
    `--root` differs from the artifact only in `inputId`.

  The comparison therefore removes those two members, and every other byte
  is equal. This is existing behavior, not part of the rule; the 0.2.0 receipt
  also recorded `inputId` differences.
- **Evidence placement.** The qualification answers are under this
  iteration's evidence directory rather than `ramify-0.3.0-prod/`, whose
  layout the brief fixes without an answers directory.

## Flaky tests

None. The final audit passed on its first run.

## Remaining gaps

- The coordinator's `npm publish` output was not handed to the implementer,
  so the addendum records the command, the time and the registry state
  instead.
- Adoption by the toolkit and ramify-agent is outside this plan; the
  [handoff](../handoff.md) lists it.

## Addendum: publication

**Date:** 2026-10-06. Recorded after the coordinator's word. No source
changed and the artifact was not rebuilt.

### Plan 8 qualification reference

ramify-audit Plan 8, iteration 4, qualified the 0.6.0 candidate against this
iteration's artifact. Verdict **pass**, with no defect in ramify-audit or in
`ramify.ts` 0.3.0, and no new artifact needed.

| Item | Value |
| --- | --- |
| Results commit | `a4483a35f778d24e9ddb617301f315544a0861d7` on `feat/project-boundary`, `/home/app/ramify-audit-pb` |
| Results file | `docs/plans/08-ignore-paths/iterations/iteration4-results.md` |
| Artifact digest check (R4-01) | SHA-256, integrity and shasum equal to the receipt's |
| Candidate | `ramify-audit-0.6.0.tgz` from `543b38e`, SHA-256 `7d57fc781b1b95a43f4379462181a962c76ae7de00b2519f571470471c04e4a3` |
| Toolkit clone | `63cb7ccf`, the release commit, with qualification commit `6945ae35` (`ignorePaths: ["docs/**", "ramify-agent/**", "scripts/probes/**"]`, the 12 `fullAuditPaths` patterns removed); T4-01 full audit pass, run ref `refs/audited/runs/2026-10-06T17-15-08Z-6945ae352` |
| Expected toolkit answers | Every kind, `selects`, changed and affected list equals this plan's [expected toolkit table](../contracts.md#expected-toolkit-answers-with-030). Differences: none |
| Real suite against the artifact | 5 files, 56 tests passed |

### Approval

Dan approved publication on 2026-10-06 ("approved"), conditional on that
qualification. The coordinator ramify-65 relayed the approval.

### Publish

The coordinator published at 2026-10-06T17:47:14Z, from
`/home/app/ramify-audit-pb-evidence/ramify-0.3.0-prod/`:

```sh
npm publish ./artifact/ramify.ts-0.3.0.tgz --registry https://npm.braimax.com
```

The registry records 0.3.0 at `2026-10-06T17:47:14.544Z`. The coordinator's
evidence is `publication-view.json` and `registry-download.tgz`, beside
`RECEIPT.md`.

### Registry verification (AR-11)

Verified independently by the implementer at 2026-10-06T17:49:51Z, with
`npm view ramify.ts@0.3.0 dist --registry https://npm.braimax.com --json`,
`sha256sum` and a fresh download (`publication-verify.txt` beside the
receipt):

| Item | Registry | Receipt | Equal |
| --- | --- | --- | --- |
| `dist.integrity` | `sha512-D35L+Mc9tzhxdqZLdBQqAOeAx3spw5hUfEVUoFQoOWbrr9aJe38YlxbbgI2T99uHEzn80eBaKbI6o6V0nR3LGA==` | the same | yes |
| `dist.shasum` | `521e0f79a174f281345c871aa2a1f824d2ce3932` | the same | yes |
| Downloaded tarball SHA-256 | `aaaf41272fb1337477a01cf15210283c1e9bed141f57870d7a98e1c6686745d3` (`registry-download.tgz` and a fresh download) | the artifact's | yes |
| `dist-tags.latest` | `0.3.0` | | |

AR-11 is complete: the qualification is recorded, Dan approved, the registry
serves the receipt's tarball, and [`handoff.md`](../handoff.md) lists the
adoption changes. `RECEIPT.md` has a matching "Publication" section.
