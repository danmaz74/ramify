# Iteration 2 results: Ramify release candidate

Iteration 2 prepares the immutable production `ramify.ts` 0.4.0 artifact and its qualification answers. It changes only package versions and this results file in the checkout. Source and protected documents are unchanged.

## Release identity and scope

- Starting clean HEAD: `96a3415c3d959b85df8d5e9cd7d4ce94c7f2c2ea`, iteration 1 results.
- Release commit: `eaa156ec51ed47eae0c8d06efc2df422a25ba0e5` (`chore(release): ramify.ts 0.4.0`).
- Release tree: `979218901ff82382f63d899e19e788dd8c61eefc`.
- The release diff changes only the version entries in `package.json` and `package-lock.json`: one version in package.json and the top-level/root-package versions in the lockfile.
- This receipt's commit follows the release commit and changes only `docs/plans/nested-tree-kinds/iterations/iteration2-results.md`; the packed release source is unchanged. The resulting HEAD is the iteration-3 handoff.
- Worktree: `/home/app/ramify-nested-kinds`, branch `plan/nested-tree-kinds`. The release commit was pushed and equality with `origin/plan/nested-tree-kinds` verified; the completed receipt is also pushed and checked at handoff.

## Full audit (NT-09)

```sh
env -u FORCE_COLOR /home/app/tools/ramify-audit-0.6.0/node_modules/.bin/ramify-audit \
  audit --cwd /home/app/ramify-nested-kinds --full --json
```

The clean release commit's full audit meets the approved interim condition:

- Patch-integrity, toolkit-build, toolkit-structure, toolkit-tests and toolkit-typecheck: all **PASS**.
- **204 files / 2,838 tests passed; zero failed or skipped.** No flaky reruns were needed.
- `summary.overall: pass`; `composition.verdict: indeterminate`, outstanding failures 0, scoped false, chain depth 0. Duration 337.235 seconds.
- Sole reason: `the expected-file comparison is unavailable: expected-files-unavailable: ownership-unavailable (unsupported-schema: schemaVersion ramify.affected-cli/4 is not ramify.affected-cli/3.)`. This is the intended expected-file reader incompatibility. No expected-file completeness claim is made.
- CLI exit 1, empty stderr; this is accepted only under NT-09's explicit interim condition.
- Run ID `d78cb362-11b5-4daf-bc00-9a65c38a49f2`; report `9c6032cd2939b4132efc3e0f6368dae8849cd3a0`; run ref `refs/audited/runs/2026-10-06T22-05-35Z-eaa156ec5`; tree ref `refs/audited/by-tree/979218901ff82382f63d899e19e788dd8c61eefc`.

[Full JSON](/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/logs/release-audit.json), [gate summary](/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/logs/gate-summary.json), [stderr](/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/logs/release-audit.stderr). Retrieve durable Git evidence with:

```sh
git notes --ref=audit show eaa156ec51ed47eae0c8d06efc2df422a25ba0e5
git show refs/audited/runs/2026-10-06T22-05-35Z-eaa156ec5:reports/audit/summary.json
```

## Production artifact (NT-10)

[Receipt](/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/RECEIPT.md) records the source identity, machine/tool versions, exact commands, immutable manifest, install smoke and qualification outputs. A clean detached clone at the release commit ran `npm ci --include=dev --no-audit --no-fund`, then `env NODE_ENV=production npm run build`, a dry-run pack and one actual `npm pack --ignore-scripts --json --pack-destination <artifact-dir>`. All exited 0. No full suite ran outside ramify-audit.

| Item | Value |
| --- | --- |
| Tarball | `/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/artifact/ramify.ts-0.4.0.tgz` (mode 0444) |
| Bytes / files / unpacked bytes | 791,536 / 492 / 3,048,866 |
| SHA-256 | `9d608b1322f5b36b6b7ad518b000215f45f425a39152cf76a1127add4bfd5284` |
| Integrity | `sha512-Rs4uxaUKGiLAYvwJIyIlD3GglrFioMzl8vN6udGZNODX7SixB6MVBobpQM3Y2MpaBnVxw/WsuxaEXKrBYDb20Q==` |
| SHA-1 | `9eca2c8d4d10a6735bec321e91718f31561fdf9a` |
| Manifest | `/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/artifact/ramify.ts-0.4.0.manifest.tsv` |
| Manifest SHA-256 | `ebfcf376525ef7c7269f75329ba87b77d5348e66b47a06d3bedad46172236699` |

The dry-run and pack JSON agree. Computed integrity/shasum/size/count match npm pack; the smoke lockfile matches integrity, and all 492 files in both installed copies match the manifest. Tarball SHA-256 was rechecked after smoke and qualification. It was never rebuilt or replaced. The file set is unchanged from 0.3.0, with 41 changed contents; [comparison](/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/artifact/difference-0.3.0.json). Production explorer JS is unchanged from 0.3.0 and contains no `jsxDEV`; no archive file contains `/home/app` or an evidence-directory path.

## Installed artifact smoke and formats

The isolated install under `smoke/` used `npm install <tarball> --omit=dev --ignore-scripts --no-audit --no-fund`, installed 100 packages and passed. Version prints `0.4.0`. Its batch affected query on the clean qualification clone answers `/4`, with captured-input `tsconfig.json` selecting all 15 modules; exit 0, empty stderr.

`node smoke/document-smoke.mjs` passes these package-output/API assertions on the isolated three-kind fixture:

| Surface | Observed version |
| --- | --- |
| analysis | `ramify.analysis/3` |
| affectedCli | `ramify.affected-cli/4` |
| affected | `ramify.affected/4` |
| modularity | `ramify.modularity/3` |
| architectProjection | `ramify.architect-projection/3` |
| architectModule | `ramify.architect-module/3` |
| architectView | `ramify.architect-view/3` |
| changedCheck | `ramify.check/3` |
| ipc | `ramify.ipc/2` |

This includes a real resident changed-path check and IPC welcome. Architect projection carries all three kinds. The architect rendering intentionally records unavailable dependency/measurement data for this document-version smoke; it does not claim complete metrics. [Version summary](/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/smoke/document-versions.json), [command outcomes](/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/smoke/commands.json), [smoke log](/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/logs/document-smoke.log). All final CLI commands exit 0 with empty stderr. The owned endpoint `/tmp/rnt04-i2-smoke` was stopped in `finally`; both recorded final statuses say `not running`.

An initial smoke harness requested batch-only dependency-behavior from a retained session and was refused. Removing that request corrected the harness, with the first assertion output preserved; no source change. A direct npm self-install in the toolkit clone hit npm's `edgesOut` error. Recovery used fresh `npm ci`, then copied the validated isolated-install package and bin link into its ignored node_modules, verifying every file against the manifest. Its local ignored `dist/` was copied from that artifact, with no rebuild or additional pack. Details and failed setup logs remain in the receipt.

## Expected toolkit answers (NT-11)

The qualification clone is clean at the release commit. `node answers/record-answers.mjs` runs the installed artifact separately for each seed, asserting both `/4` schema versions, package version, ownership, exclusion, kind and independently specified seed selections. Six queries exit 0 with empty stderr; [answers directory](/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/answers), [summary](/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/answers/summary.json).

| Seed | Status | Owner | Kind | Exclusion | Seed selects | Changed | Affected | Aggregate test modules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `docs/x.md` | `owned` | `ramify` | `ignored` | `owned-unwired` | 0 | 0 | 0 | 15 |
| `docs/x.ts` | `owned` | `ramify` | `ignored` | `owned-unwired` | 0 | 0 | 0 | 15 |
| `site/package.json` | `owned` | `ramify` | `ignored` | `owned-nested-project` | 0 | 0 | 0 | 15 |
| `examples/collection-review/src/x.ts` | `owned` | `ramify` | `ignored` | `owned-nested-project` | 0 | 0 | 0 | 15 |
| `ramify-agent/x.ts` | `excluded` | `None` | `None` | `external` | 0 | 0 | 0 | 15 |
| `tsconfig.json` | `owned` | `ramify` | `captured-input` | `none` | 15 | 15 | 0 | 15 |

Each owned excluded seed is attributed to `ramify` on the containment basis. The external seed has no owner. The five excluded-tree seeds select nothing, while tsconfig independently selects all 15. **Every aggregate answer still widens to all 15 test modules** with `partial-coverage`, 41 notes and `analysisCheck: passed`. The first five have empty changed/affected lists; tsconfig changes all 15 and affects none. This reproduces iteration 1's known toolkit limit and is not an empty aggregate selection. Iteration 3 receives the exact JSON to assess its interpretation/qualification against that widening; no behavior or policy was changed here.

## Protected documents

No protected document was edited. Before and after hashes are identical and match iteration 1's after hashes, plus the extra untouched architect-view-diff specification. [Machine-readable hashes](/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/logs/protected-hashes.json).

| Document | Before SHA-256 | After SHA-256 |
| --- | --- | --- |
| `docs/model/module-description.spec.md` | `181402e5b5c64aaffbb544b268681dbb7a99b7e5f35811f89cb51ea929cf6281` | `181402e5b5c64aaffbb544b268681dbb7a99b7e5f35811f89cb51ea929cf6281` |
| `docs/model/glossary.md` | `4c3c1e2efc3f2c7bdf310349399cf9e58ff2129140eb15113910f80253e67976` | `4c3c1e2efc3f2c7bdf310349399cf9e58ff2129140eb15113910f80253e67976` |
| `docs/model/cross-module-importability.spec.md` | `4d2485d768ec798b070482b95ab3efda84efbdd92ad48d016c8c26924884d673` | `4d2485d768ec798b070482b95ab3efda84efbdd92ad48d016c8c26924884d673` |
| `docs/model/typescript-source-interpretation.spec.md` | `8cf9eb66529b1de11a771af768138285be186ffa2bb7eadbd859ecdf1da79d53` | `8cf9eb66529b1de11a771af768138285be186ffa2bb7eadbd859ecdf1da79d53` |
| `docs/agents/module-architect.principles.md` | `a4fec944e1697f411a605d1f4506ef9fa16318cb1ba4ed8eaa6ec1d13533e851` | `a4fec944e1697f411a605d1f4506ef9fa16318cb1ba4ed8eaa6ec1d13533e851` |
| `docs/architecture/cli-invocation.spec.md` | `81a6a899ebdb31c602feacf8a978bdb95ee2f7b2f12543f086a6a99b224eedc9` | `81a6a899ebdb31c602feacf8a978bdb95ee2f7b2f12543f086a6a99b224eedc9` |
| `docs/architecture/architect-view.spec.md` | `be6def0a5ec6029ef8a8627cc6280bfea5f101ac9f521f1a49b0890591524c0e` | `be6def0a5ec6029ef8a8627cc6280bfea5f101ac9f521f1a49b0890591524c0e` |
| `docs/architecture/modularity-report.spec.md` | `1ab86a7d095a1943b1c87763f104b8715618e3cda636a006dffb09a8b112d765` | `1ab86a7d095a1943b1c87763f104b8715618e3cda636a006dffb09a8b112d765` |
| `docs/architecture/architect-view-diff.spec.md` | `da621110a5557ae955e2c39f4abb718b3d4c3f74396114e05d66d3a1fc19b573` | `da621110a5557ae955e2c39f4abb718b3d4c3f74396114e05d66d3a1fc19b573` |

## Handoff and limits

NT-09's interim gate, NT-10 artifact and NT-11 seed-answer evidence are complete. Iteration 3 receives release `eaa156ec51ed47eae0c8d06efc2df422a25ba0e5`, this receipt, immutable tarball digest/integrity and `answers/`. Qualification/publication are subsequent plan work; the user's instruction “consider all publications pre-approved” removes a further publication approval request, while iteration 4 still follows qualification.

The interim expected-file reader incompatibility, toolkit aggregate partial-coverage widening and untouched protected architect-view-diff `/2` reference remain explicit. No `/ramify`, ramify-audit or ramify-agent source was changed. Final evidence verification is [recorded here](/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/logs/final-evidence-verification.txt).
