# Iteration 21 results: packed artifact and Phase 2 handoff

**Date:** 2026-10-05. **Status:** receipt for [iteration 21](iteration21.md).
The qualified build was packed without rebuilding, the tarball was installed
in an isolated consumer, and the written topology ran through the installed
typed API, batch CLI and resident CLI. PB1-36, PB1-39 and PB1-40 pass at this
slice's evidence boundary. Nothing was committed, pushed or published. Only
what is recorded here was run.

## Identity

| Item | Value |
| --- | --- |
| Packed checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify`, commit `a79e845dd683bdd94a86a2e70b9f58126d87bb80`, tree `bc3b428530d9f1ccb46d51db3f4a26c704a1cbaf`; `git status --short` empty before and after packing, and the `--ignored` listing unchanged |
| Qualified candidate | `7df84ea29377ca3642bb49ef5084b71bf652b2f8`, tree `c4c5c11a21a1c108bc0f104fc9619cc59a44b097` ([iteration 20](iteration20-results.md#final-candidate)) |
| `7df84ea2..a79e845d` | `handoff.md`, `iteration20-results.md`, the three measurement archives and `scripts/measurements/results/index.json`. No other file beneath `src/`, `subs/` or `scripts/` differs (`git diff --stat`) |
| Source identity | Reference-harness `sourceSha256` recomputed read-only on `a79e845d` with the algorithm of `scripts/reference-harness/artifact.ts`: `4c9b5ed22d20260a33b7e6fa3fb3e61c51d5608b4a4c93b782b04babdfe616f0`, equal to every `7df84ea2` verification report |
| Frozen build | `dist/` as the final gate built it; never rebuilt. Harness `buildSha256` `d766e5e018df69b427699a1267576c376e5ad9a53d2d1ee847356a18d5d193b3` (equal to the four verification reports); measurement `treeIdentity` 490 files, `83cb95b5e23a03c2f00ef2633880e257c6e882d273e80d6f64fbdfbe16e1529e` (equal to the three 2026-10-05 measurement archives) |
| Configuration (sha256) | `package.json` `6662831e…` (version 0.2.0), `package-lock.json` `1b822bb4…`, `ramify-audit.json` `371ebef9…` (git blob `b59f28f6…`, unchanged since `33d8a739`), `tsconfig.json` `9c67bd1c…`, `module.ramify` `7a35df0c…` |
| Contract revision | Iteration 1 reviewed `contracts.md` blob `41b269c7f3c77f0b63dcb3612630f8aa0fd3d50b` (`8c02cad3`), adopted in `6d0c66f0`. Current, unchanged since iteration 20 (sha256 prefix): `contracts.md` `240f66dc`, `acceptance.md` `8370b76b`, `cases.json` `2a1a43c1`, `execution.md` `587dea5b`, `budgets.md` `f9946d2f`, `fixtures.md` `3710495c`, `cli-invocation.spec.md` `73862955`, `module-description.spec.md` `19e292a9`, `glossary.md` `fd3a1bad` |
| Node / tools | Node v22.23.3, npm 10.9.9, TypeScript 7.0.2 (the package's dependency) |
| Changed here | This receipt; `handoff.md`; the status notes of `docs/architecture/project-boundary.proposal.md` and `docs/architecture/README.md`. No source, test, configuration, `.principles.md` or `.spec.md` file changed |
| Evidence | `/home/app/ramify-pb1-evidence/a79e845d/` (`artifact/`, `iteration21/`) |

`dist/` in the packed checkout has file times of 15:58 UTC, after the 13:24
build and during the Plan 2A verification (15:56–16:09). Its bytes are those
the evidence names: both build identities above were recomputed on it and
match the reports and archives, and that verification itself refuses a build
that changes while it runs.

## The artifact

Packed with `npm pack --ignore-scripts --pack-destination
/home/app/ramify-pb1-evidence/a79e845d/artifact` at 16:25 UTC, after `npm pack
--dry-run --ignore-scripts` showed the same file list and wrote nothing into
the tree. No build or lifecycle script ran. The files are read-only (mode
0444).

| Item | Value |
| --- | --- |
| Tarball | `/home/app/ramify-pb1-evidence/a79e845d/artifact/ramify.ts-0.2.0.tgz`, 851,540 bytes |
| SHA-256 | `675ed7aad80fcee177f2e4b63e54d6537f0a0d2644ace05e79c41a711b10b91e` |
| npm integrity | `sha512-93oxe7kvDj8a5Pn5MyXWWDLEIo4iT97PLW29SLo3xIN/6Q8MXyLLWEw5n7HFTkGN9NoqoBvfHLnn8sSux6gA7w==`; shasum `f3281f114ca6a1689863c1550790c3f74ee2fe50` |
| Package | `ramify.ts` 0.2.0, MIT; bin `ramify` → `dist/src/ramify`; nine import entries (`.`, `./analysis`, `./analysis/inventory`, `./model`, `./presentation`, `./module-tree`, `./cli`, `./layout`, `./client`) and the stylesheet `./module-tree.css` |
| File manifest | `ramify.ts-0.2.0.manifest.tsv` beside the tarball: 492 lines of path, bytes and SHA-256, 3,273,707 bytes unpacked; manifest SHA-256 `f5b663d2ad68fa2245cc55db28e99dbbd38dc616f74553e1a8b37dca4923f47f`. It equals npm's own file list and the installed copy |
| Identity record | `ramify.ts-0.2.0.identity.json` beside the tarball (SHA-256 `b82ecfb2…`) |

The packed `dist/` is the frozen `dist/` without one file:
`dist/src/ramify-client-Linux-x86_64`, the Bun-compiled host client
(84,288,992 bytes), which the package's `files` rule
`!dist/src/ramify-client-*` excludes. `diff -rq` shows no other difference,
so the 489 packed `dist/` files are byte-identical to the measured and
verified build. Without the client, the installed `ramify` launcher runs the
Node entry. The packed `dist/` has harness `buildSha256` `5ef13027…` and
measurement identity 489 files, `f7eba873…`; these differ from the evidence
values only by that file.

The tarball is the same artifact the final gate's `site:build` installed into
`site/node_modules` at 16:09 (sha256 `675ed7aa…`, 492 files): `npm pack`
reproduced it byte for byte from the same tree.

**Observation: the explorer bundle depends on the build environment.**
`dist/explorer/assets/index-D0_5BFgb.js` contains ten absolute source paths of
the build checkout (`/home/app/ramify-pb1/subs/explorer/src/HomePage.tsx` and
nine others) as JSX development source locations (`jsxDEV` with `fileName`
and `lineNumber`). The build ran with `NODE_ENV=development` set in the
environment, and `vite.explorer.config.ts` (unchanged since `33d8a739`) does
not fix the mode. They are strings in the browser bundle, never module
specifiers, and no other packed file names a checkout path. A rebuild of the
same source in another directory, or with another `NODE_ENV`, therefore gives
different bytes and a different digest. Whether earlier builds embedded the
paths was not checked.

## Isolated consumer probe (PB1-36)

Everything is under `/home/app/ramify-pb1-evidence/a79e845d/iteration21/probe/`.
No directory from there to `/` is a Git repository or holds a `node_modules`
or `package.json`.

- `consumer/`: `npm init -y`, then `npm install
  /home/app/ramify-pb1-evidence/a79e845d/artifact/ramify.ts-0.2.0.tgz
  --omit=dev --ignore-scripts --no-audit --no-fund` from the public registry
  (`registry.npmjs.org`), 100 packages, exit 0. The lockfile records
  `ramify.ts` 0.2.0 with the tarball's `sha512` integrity.
  `node_modules/ramify.ts` is a real directory whose 492 files equal the
  packed manifest (`logs/installed-manifest.tsv`). The `file:` dependency
  exists only in this scratch consumer.
- `topology.mjs` writes the [fixture topology](../fixtures.md) afresh in each
  run, with `outDir: "dist"` so that `dist/` is the configured output
  directory. The imports variant adds `subs/b/src/bad.ts` (relative import
  into `subs/a/fixtures/sample`), `scripts/ext.ts` (relative import into
  `external-project`) and the positive control `subs/b/src/pkg.ts`
  (`import … from 'sample'` through the installed link).
- `expectations.json` holds the independent expectations, written from
  `fixtures.md`, `cases.json`, contract R4 and the installed declarations
  before any run.
- `consumer/api-probe.ts` imports only `ramify.ts/analysis` and
  `ramify.ts/model`. The consumer's installed compiler type-checks it
  (`strict`, `skipLibCheck: false`, `NodeNext`) against the installed
  declarations, including two `@ts-expect-error` lines: the schema literal
  `ramify.affected/1` and an exclusion kind outside the declared union. It
  calls `analyzeProject`, `openRetainedSession` and the retained session's
  `affected`, and disposes the session in `finally`.
- `run-probe.mjs` runs everything and compares each answer with
  `expectations.json`. The resident CLI used a private endpoint directory
  (mode 0700) under `/tmp`, because a Unix socket path beneath the evidence
  directory exceeded the 100-byte limit. The daemon was stopped through that
  endpoint in `finally`.

**Result:** run `run-2026-10-05T16-33-00-284Z`, 90 of 90 assertions passed
(`results.json`, SHA-256 `eba3fa59…`; 44 command records in `out/`).

| Path | Assertions | What was asserted |
| --- | --- | --- |
| Isolation | 6 | Real directory, version 0.2.0, the bin and every probed entry resolve inside `consumer/node_modules/ramify.ts`; `analysis`, `model`, `cli` and `client` load; only the explorer bundle names a checkout path, as above |
| Typed API | 31 | Type-check exit 0 with no output. Batch: completed, passed, complete; 5 owners, 10 source files, 5 accesses, all allowed; modules `app`, `app/a`, `app/a-extra`, `app/a/grand`, `app/b`; the nine rooted exclusions; the ten inventory files with owner, placement (`src` or `auxiliary`) and area. Imports variant: failed, 13 files, 8 accesses, 5 allowed, 2 denied, 1 external, two `project-boundary-import` diagnostics at `scripts/ext.ts` and `subs/b/src/bad.ts`. Retained session: same `inputId` as batch; `affected` for the `app/a` seed and all 15 path seeds of the written table; an unknown module and another sequence refused. No process with the probe's PID remained after it exited |
| Batch CLI | 32 | `check --batch` equal to the typed API (summary, ownership, `inputId`); the imports variant with the same denials; the seven root-selection rows; `fixture-project` checked from its own root; `affected --batch` for the `app/a` seed and all 15 path seeds; no seed gives exit 2; no daemon on the endpoint afterwards |
| Resident CLI | 18 | `check` equal to batch (summary, ownership, `inputId`); the daemon reports 0.2.0 and `ramify.ipc/2` and runs `consumer/node_modules/ramify.ts/dist/src/daemon-entry.js`; hook check exit 0 with `not-analyzed` for `notes/design.md` (`owned-non-source`), both scratch files (`scratch`) and `sample/src/world.ts` (`owned-ignored`), and `checked` for `subs/a/src/api.ts` and `scripts/check.ts`; `../outside.ts` `not-checked` `unobserved-input`, exit 2; `affected` for `app/a` and four path seeds; the imports variant equal to batch, exit 1 |
| Cleanup | 3 | `daemon status` after `daemon stop` reports not running; none of the 45 recorded PIDs (`logs/recorded-pids.txt`) is alive; no process names the run or the consumer |

The answers matched the written table: an `app/a` seed gives changed
`[app/a]`, affected `[app, app/b]`, test `[app, app/a, app/b]`; inert
`notes/*.md` and `grand/new.txt` select their owner on the containment basis;
`scripts/check.ts` and `report.ts` resolve by inventory; the owned-ignored and
scratch seeds select `app/a` with their exclusion; the external, package,
output and generated seeds select nothing on the excluded basis; `../outside.ts`
widens to all five modules with `unowned-path`. Root selection: `app` found
from `grand/src` and `scripts/`, `sample` from inside its tree (exit 1 for its
deliberately malformed child description), `fixture-project` from inside it,
`root-not-found` exit 2 outside, `unmarked-root-description` exit 1 for
`--root subs/a`, and `app` given for `--root .`.

Two expectations were corrected between runs; both runs are kept. The first
run (`failed-run-2026-10-05T16-31-20-789Z`) also used an endpoint path that
exceeded the socket limit, so its resident part did not start.

1. The rooted exclusions were listed with `external-project` before `dist`. The
   installed declaration says they are byte-ordered by directory, so `dist`
   comes first. Only the order changed.
2. The resident `affected` document's `mode` was expected as `daemon`. The
   installed declaration is `mode: 'resident' | 'batch'`. The second run
   (`failed-run-2026-10-05T16-32-30-055Z`) failed only on that assertion.

`expectations.json` records both corrections. No answer of the package
changed between the runs.

The probe does not replace the earlier PB1 cases' own evidence. It shows that
the packed artifact gives the written topology's answers through every
public path without the checkout.

## Iteration 20 workflows rerun on the final source

The PB1 qualification matrix ran on `befc5e77`. `6598a29d` later narrowed the
compiler-source extension pattern in `subs/analysis/subs/project/src/inventory.ts`
and `subs/analysis/subs/typescript/src/resolution.ts`, with its own unit test.
The audit, `reference:cases` and the four plan verifications ran on the final
source; the workflow scripts did not.

They take their build and working directory as two variables, so they were
rerun here without touching either checkout. `run.sh`, `run2.sh`, `run3.sh`
and `lib.sh` were copied to
`/home/app/ramify-pb1-evidence/a79e845d/iteration21/wf/`. Only `T` (now the
installed `consumer/node_modules/ramify.ts`), `W` (that directory) and the
`lib.sh` path changed. The scripts therefore ran the packed `a79e845d`
artifact, through the launcher's Node entry. 16:34:02–16:34:55 UTC.

- 81 steps (62, 14 and 5) and the watch stream: every exit code equals
  iteration 20's (`out*/NNN-*.exit`), and so does the watch exit.
- `compare.py` normalizes paths, removes identifiers, times, PIDs, memory
  figures and retained byte counts that depend on the path length, and
  compares each output with iteration 20's. All outputs are equal except
  three:
  - `044-res-status-after-excluded-edits`: iteration 20's status was taken
    while a sweep reconciled (`analysisRunning: true`), this one after it.
  - `054-res-status-final`: sweep and round-trip timings inside `capture`.
  - `watch.jsonl`: timings only; the same nine events, revisions 3 and 4.
- Each script stopped its daemon; "processes left: 0"; the three daemon and
  compiler PIDs named in the status outputs are not alive.

So the workflows give the same answers on the final source.
`scale.sh` and `limit.sh` (the PB1-37 scale and 50,001-file witnesses) were
not rerun.

## Scope review (PB1-40)

- `git diff --name-only 33d8a739 a79e845d -- ramify-agent`: no path. This
  iteration wrote only to the second worktree's documents and the external
  evidence directory.
- `ramify-audit.json` is the blob `b59f28f6…` of `33d8a739`: no field was
  added.
- No committed manifest names a local artifact. The only `file:` dependency in
  a committed `package.json` outside `ramify-agent/` is
  `scripts/reference-harness/fixtures/module-tree-consumer/package.json`
  (`"ramify.ts": "file:ramify.ts.tgz"`), a harness fixture that predates the
  phase (`26bba1e2`) and installs a tarball the harness packs. `site/package.json`
  names no `ramify.ts` dependency.
- `/ramify/ramify-agent/package.json` still pins `ramify.ts` `0.1.0` and
  `ramify-audit` `0.3.2` (read only).
- `/ramify-audit` links to `/home/app/ramify-audit`, branch `main` at
  `8b49e99`, clean (read with `--no-optional-locks`). Its commits since
  2026-10-03 are its own 0.3.1/0.3.2 recovery records, none from this plan.
- The probe topology was written only under this iteration's evidence
  directory; no fixture was copied into an audit or agent project.

## Merge qualification

The artifact certifies one tree: `a79e845d`, whose source and build are those
of `7df84ea2`. It does not certify a merge result.

- The merge target `ramify-agent` is at `7dc5622e`, one commit after the phase
  baseline `33d8a739`. That commit changes `.claude/skills/testing/SKILL.md`
  and `docs/development/testing.md`; the phase changed `testing.md` too, so the
  merge may need a hand resolution there. `/ramify` also has uncommitted
  changes, which are not part of either side.
- The merged commit is a different tree. As [execution.md](../execution.md#revision-binding-and-closing-work)
  requires, it is verified in full before it is accepted: the full audit
  (`ramify-audit audit --cwd . --full --json` with the toolkit's committed
  `ramify-audit.json`) and, separately, the locked `npm run reference:cases`.
  Until Phase 2's first audit release, every later toolkit commit gets the
  same two gates.
- If the merge changes no file in the source identity (`src/`, `subs/`,
  `scripts/`, manifests, lockfile, `tsconfig*.json`, `module.ramify`), the
  merged commit's harness `sourceSha256` equals `4c9b5ed2…`. That shows the
  source is unchanged; it does not make the merged commit's own build equal to
  this artifact.
- A build of the merged tree is a new build. Because of the explorer bundle's
  embedded paths, a build in `/ramify` gives different bytes even from
  unchanged source. Any artifact packed from it gets a new digest and receipt;
  this artifact is never replaced silently. If source changes, the measurement
  and verification evidence of `7df84ea2` no longer applies to it.
- The four accepted gaps and the open items below travel with the merge.

## Local development and publication

- **Now (Phase 2 development).** `/ramify-audit` installs this tarball by its
  path in temporary installs or fixture setups and checks the SHA-256 above.
  No local path is committed as its dependency. It rebuilds the written
  topology in its own tests from `fixtures.md`.
- **Phase 2 completion (not done here).** Publish exactly this qualified
  artifact as `ramify.ts` 0.2.0, or, after a provider repair, a rebuilt 0.2.0
  with a new digest and receipt. Download the published package and verify
  its integrity equals the release receipt. The release record names the
  version, registry, integrity, source revision and acceptance evidence. The
  audit commits an exact `0.2.0` pin, never a path or range. A repair after
  publication is 0.2.1 or later. If the release is built again rather than
  published from this tarball, the explorer bundle's bytes depend on the
  build directory and `NODE_ENV`, so the published integrity will differ from
  `sha512-93oxe7kv…`; the release receipt then records the new value and its
  own verification.

## Protected documents

The coordinator's comparison against the phase baseline `33d8a739`
(`/home/app/ramify-pb1-evidence/a79e845d/iteration21/protected-compare.txt`;
`protected.diff`, SHA-256
`9786048885fcfce24910958bc6145697974bab8b93a0f7d9c6b89e7bc5b47d62`) lists nine
changed protected files: the specifications `architect-view-diff`,
`architect-view`, `cli-invocation`, `materialized-api-view` and
`modularity-report` in `docs/architecture/`, and
`cross-module-importability.principles.md`, `cross-module-importability.spec.md`,
`module-description.spec.md` and `typescript-source-interpretation.spec.md` in
`docs/model/`. The cumulative `git diff 33d8a739 a79e845d` of those files has
the same SHA-256. This iteration changed none of them.

Twenty-two commits in `33d8a739..a79e845d` touch them, none a merge. Each row
names the approval its receipt records, in the receipt's own terms. "Coordinator"
means the coordinator authorized the exact patch under the
[protected-document procedure](../execution.md#protected-principles-and-specifications)
and the receipt names no user decision for it. "Relay-settled" means the relay
session settled it under the user's standing instruction, and the user may
override it. Line numbers refer to `a79e845d`.

| Commit | Files (short names) | Change | Recorded approval | Kind |
| --- | --- | --- | --- | --- |
| `6d0c66f0` | architect-view, cli-invocation, materialized-api-view, modularity-report, module-description, source-interpretation | Adopts R1–R6 | `contracts.md:22`: "The user accepted all six entries on 2026-10-03"; `iteration1-results.md:197-199`: coordinator authorized the patch unchanged | User (content); coordinator (patch) |
| `3f435172` | cli-invocation, module-description | `ramify.analysis/2`; parser status | `iteration2-results.md:165-167` | Coordinator |
| `8c357cc8` | cli-invocation | `ramify.affected-cli/2` | `iteration3-results.md:221-224` | Coordinator |
| `a735e3a6` | cli-invocation, module-description | Adopts R7, the root marker | `main-plan.md:67`, `execution.md:84-85`: the user decided R7 and authorized its specification changes | User; see gap 1 |
| `de783a7b` | module-description | Marker parsed (status) | `iteration3a-results.md:274-278` | Coordinator |
| `97ac0664` | architect-view, cli-invocation, module-description | Marker selection, exit-2 hint, identity paths | `iteration3b-results.md:329-332` | Coordinator |
| `db477d50` | modularity-report | `outside-module` renamed `outside-project` | `iteration4-results.md:267-271` | Coordinator |
| `ee9e295b` | cli-invocation, modularity-report, module-description | Declared trees pruned and validated; `ramify.modularity/3` | `iteration8a-results.md:299-303` | Coordinator |
| `a8d99307` | cli-invocation, module-description | Compiler-selection warnings; `ramify.check/2` | `iteration8b-results.md:340-344` | Coordinator |
| `b693b37d` | modularity-report | Probes become analysis auxiliary source | `iteration8c-step1-results.md:175-178`: "The user decided the move on 2026-10-04"; `main-plan.md:247-250` | User; coordinator (patch) |
| `a841ac72` | architect-view, cli-invocation, modularity-report, importability spec, module-description, source-interpretation | Auxiliary source analyzed; JavaScript rule; `ramify.measure/2` | `iteration8c-results.md:307-312`: coordinator authorized; "The user decided the identity form, the JavaScript rule and the probe move"; `handoff.md:253-254`: the rule's application outside `src/` only is relay-settled | Coordinator, user and relay-settled; see gap 2 |
| `9e46459a` | architect-view | "Independent compiler scopes" replaced | `final-gate-repair-results.md:351-353, 362-364` | Coordinator |
| `307e86fa` | cli-invocation, modularity-report, source-interpretation | Imports into declared trees unverifiable with a limit | `iteration9-results.md:295-299` | Coordinator |
| `30a16f78` | importability spec, module-description, source-interpretation | `auxiliary-original-exposure` implemented | `iteration10-results.md:192-195` | Coordinator |
| `6b372aa9` | cli-invocation, importability spec, module-description, source-interpretation | `project-boundary-import` and `excluded-target` implemented | `iteration11-results.md:311-314` | Coordinator |
| `376f4539` | cli-invocation | `affected` present tense; scope carries ownership | `iteration14-results.md:256-259` | Coordinator |
| `790a534c` | cli-invocation | What the hook check hashes; narrows a sentence of R4 | `iteration15-results.md:378-388`; `handoff.md:258-262` | Relay-settled |
| `86c1a7f2` | module-description | "Watched" removed; timing moves to `daemon.md` | `iteration16-results.md:391-399`; `handoff.md:263-265`. No patch file was recorded | Relay-settled |
| `ca8ca0fc` | cli-invocation | Git advice on complete checks only | `iteration17-results.md:378-382` (coordinator), `:397-398` (relay accepted the two choices); `handoff.md:266-268` | Coordinator, with relay-settled choices |
| `eb57fbf8` | architect-view, materialized-api-view, architect-view-diff | `boundaries` member; `/2` schemas | `iteration18-results.md:434-439` | Coordinator |
| `7f6ebf7c` | cli-invocation, importability spec | Status "implemented"; inert-file exception | `iteration19-results.md:366-371` | Coordinator |
| `6598a29d` | cli-invocation, importability principles, module-description | Compiler source, inert file, captured input; configuration-named files; principles status sentence | `inert-wording-results.md:108-128`: the user accepted the wording package and authorized the specification changes, reworded "Compiler source" and authorized the one principles sentence; the relay accepted the configuration rule, the file list, the hashed-and-watched sentence and the lockfile behaviour | User, with relay-settled parts |

**Protected hunks with no recorded approval: none found.** These gaps in
the record are listed for the coordinator, not judged:

1. `a735e3a6` (R7): `execution.md:85-87` and `iteration3a.md` ask iteration
   3A's handoff to record the adoption's baseline, approval and diff identity.
   `iteration3a-results.md` has no such record. The user's authorization is
   recorded in `main-plan.md`, `execution.md` and `contracts.md`.
2. `a841ac72`: `iteration8c-results.md:311` says the user decided "the
   JavaScript rule". `handoff.md:253-254` lists its application outside `src/`
   only as relay-settled, later settled by the user's "Compiler source" entry.
   The two receipts differ on who decided the scope.
3. `86c1a7f2`: the approval is recorded, but no reviewed patch file is.
4. The hunk-by-hunk comparison against recorded baselines that
   `iteration20-results.md:736-738` reported missing is this table; it maps
   commits to approvals and does not replay each patch file.

`docs/model/glossary.md` is outside the nine-file listing. Its six phase
commits have recorded approvals (`a735e3a6` under R7; `ee9e295b`,
`a841ac72`, `30a16f78`, `6b372aa9` coordinator; `6598a29d` the user's
wording package), except that no authorizer is named for the glossary
status line `6598a29d` applied from iteration 20's proposed patch
(`iteration20-results.md:486` names the user's authorization only for the
principles sentence).

Working files: `/home/app/ramify-pb1-evidence/a79e845d/iteration21/authority/`.

## Performance report

The report for the user is in [handoff.md](../handoff.md#performance-report):
every target the final candidate missed, with the pre-phase baseline from the
archived measurements where one exists, the four accepted gaps and the
capacity limits. Its values were read from
`/home/app/ramify-pb1-evidence/7df84ea2/measurements/` (the summaries and the
reports, streamed) and from the archives in `scripts/measurements/results/`
(extraction in `/home/app/ramify-pb1-evidence/a79e845d/iteration21/perf/`).
All 24 fast misses agree with iteration 20's table. The resident recipe met
all 36 advisory targets; the Plan 2A recipe has none of its own.

## Remaining items

- **Three `CLAUDE.md` sentences** still wait for the user's wording
  ([iteration 19](iteration19-results.md), items 1–3): the independent
  scripts' compiler scopes, the module header's classification of auxiliary
  source, and the root's `external` declaration of `ramify-agent/`.
- **Sample counts.** Decided question 11 of the [main plan](../main-plan.md)
  and [execution.md](../execution.md#final-gate) say "samples of 30–50"; the
  recipes ran their fixed counts (20 per class in the fast hook workloads).
  Neither text was changed.
- **Plan status lines** in `acceptance.md` ("planned, not executed"),
  `cases.json` (`"status": "planned"`) and `contracts.md` ("implementation
  pending") were left unchanged, so that the contract revision the receipts
  name stays byte-identical. This receipt and the handoff record the states.
- **Explorer bundle build mode** (above): a release build may want a fixed
  production mode; that changes the bytes and is a toolkit change.
- Not rerun here: `scale.sh` and `limit.sh`; the full audit, `reference:cases`
  and the plan verifications, which ran on `7df84ea2` and are bound to this
  artifact by the identities above.
- The known defects, limitations, flaky tests, stale reference prose and
  follow-ups in [handoff.md](../handoff.md) are unchanged.
