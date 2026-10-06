# Iteration 2: Release and handoff

**Plan:** [Affected-rule selection for audits](../main-plan.md).
**Prerequisites:** [Iteration 1](iteration1.md) results are committed and its
gate passed.

**Write scope:**
- in the checkout:
  - the version bump in `package.json` and `package-lock.json`, and nothing
    else in that commit;
  - this iteration's results file;
  - `docs/plans/affected-rule-selection/handoff.md`;
- outside the checkout, under `/home/app/ramify-audit-pb-evidence/ramify-0.3.0-prod/`.
  This mirrors the 0.2.0 layout `ramify-0.2.0-prod/` and contains:
  - `RECEIPT.md`;
  - `artifact/ramify.ts-0.3.0.tgz` and its manifest;
  - `src/`, the clean release clone;
  - `logs/` and `smoke/`;
  - `qualify/`, the toolkit qualification clone.

  The directory is an evidence directory, not a ramify-audit checkout.

No source changes. Do not change `ramify-agent/`, `/ramify`, any ramify-audit
checkout, `~/.npmrc` or the registry before the publication gate. ramify-audit
Plan 8 qualifies against this exact tarball, so it must never be rebuilt or
replaced in place.

## Goal

1. Release `ramify.ts` 0.3.0 from an audited commit, as a production artifact
   built the same way as the 0.2.0 provider artifact.
2. Qualify it against real toolkit changes.
3. Show what ramify-audit 0.5.0 does with its answers.
4. Hand the artifact to ramify-audit Plan 8's qualification, then stop at the
   publication gate.
5. Write the adoption handoff.

## Read first

- [Contracts](../contracts.md): the reader contract, compatibility, how 0.6.0
  consumes `/3`, and the expected toolkit table.
- [Acceptance](../acceptance.md): AR-07 to AR-11.
- `iteration1-results.md`.
- The 0.2.0 production receipt
  `/home/app/ramify-audit-pb-evidence/ramify-0.2.0-prod/RECEIPT.md`. Mirror its
  sections: source identity, environment, commands, artifact, smoke.

## Steps

### 1. Release commit and final gate

```sh
npm version 0.3.0 --no-git-tag-version
```

- Confirm the diff touches only the `version` fields of `package.json` and
  `package-lock.json`.
- Commit as `chore(release): ramify.ts 0.3.0`. This is the **release commit**.
- Run the [gate command](../main-plan.md#execution-rules-for-every-iteration)
  from it. It must pass.
- Confirm 0.3.0 is unpublished:
  `npm view ramify.ts versions --registry https://npm.braimax.com`.

### 2. Production artifact

In a fresh clone, never the working checkout:

```sh
E=/home/app/ramify-audit-pb-evidence/ramify-0.3.0-prod
mkdir -p "$E/logs" "$E/artifact"
git clone /home/app/ramify-affected "$E/src" && cd "$E/src" && git checkout --detach <release commit>
git status --porcelain && git status --porcelain --ignored           # both empty
npm ci --include=dev --no-audit --no-fund > "$E/logs/npm-ci.log" 2>&1
export NODE_ENV=production
npm run build > "$E/logs/build.log" 2>&1
npm pack --dry-run --ignore-scripts > "$E/logs/pack-dry-run.log" 2>&1
npm pack --ignore-scripts --pack-destination "$E/artifact" > "$E/logs/pack.log" 2>&1
```

Record the following in `$E/RECEIPT.md`:

- the commit and tree;
- the sha256 of `package.json` and `package-lock.json`;
- the tree status before and after;
- the Node, npm and Bun versions;
- the tarball's bytes, SHA-256, npm integrity and shasum;
- the file and unpacked counts;
- a manifest `artifact/ramify.ts-0.3.0.manifest.tsv`, with path, bytes and
  sha256 sorted under `LC_ALL=C`, and the manifest's own sha256;
- the file-set difference from the 0.2.0 production manifest.

Make the tarball read-only. If anything changes after packing, build a new
artifact with a new receipt; never replace a tarball silently.

### 3. Isolated smoke (AR-09)

In `$E/smoke`, an empty directory:

```sh
npm init -y
npm install "$E/artifact/ramify.ts-0.3.0.tgz" --omit=dev --ignore-scripts
```

Then run:

- `npx ramify --version`, which prints 0.3.0;
- `npx ramify affected --batch --format json --root "$E/qualify" --path tsconfig.json`,
  run after step 4 creates the clone. It answers `ramify.affected-cli/3` with
  a `captured-input` seed that selects all 15 modules.

Record the outputs. Leave no daemon running: run `npx ramify daemon status`
afterwards, and stop only that daemon if one is found.

### 4. Qualification on a toolkit clone (AR-07, AR-08)

Set up the clone:

```sh
git clone /home/app/ramify-affected "$E/qualify"
cd "$E/qualify"
git checkout -b qualify <release commit>
npm ci
npm run build
```

Make six commits, one per case. Each change is a harmless edit, such as a
comment or a trailing newline, to:

| Case | Path | Expected kind | Expected selects |
| --- | --- | --- | --- |
| Q1 docs edit | `docs/agents/README.md` | ignored | none |
| Q2 module README edit | `subs/presentation/subs/layout/README.md` | readme | none |
| Q3 configuration edit | `tsconfig.json` (a whitespace change) | captured-input | all 15 |
| Q4 auxiliary script edit | `scripts/build-production.ts` | auxiliary-source | `ramify` |
| Q5 declared probe-fixture edit | `scripts/probes/fixtures/compiler-api/consumer.ts` | ignored | none |
| Q5b undeclared probe fixture | `scripts/probes/fixtures/synthetic-owners.ts` | auxiliary-source | `ramify` |

Q5b is the file `scripts/measurements/materialize.ts` imports. It is the reason
the toolkit keeps `ignorePaths: ["scripts/probes/**"]`.

For each case, take the seeds from `git diff --name-only HEAD~1 HEAD`. Run:

- the artifact's `ramify affected --batch --format json --root "$E/qualify" --path …`;
- the clone's own `dist/src/ramify affected --batch --format json --path …`.

The two answers must be byte-equal apart from `ramifyVersion`, if that
differs. Compare each with the expected row above and the
[toolkit table](../contracts.md#expected-toolkit-answers-with-030).

Then pass each answer to the installed 0.5.0 interpreter:

```js
const m = await import('file:///home/app/tools/ramify-audit-0.5.0/node_modules/ramify-audit/dist/ramify-affected.js');
m.interpretAffectedResult({ status: 'exited', exitCode: 0, stdout }, root);
```

Record its `status`, `fallbackReason` and `code`. The expected result for every
answer is `unavailable`, `ramify-unavailable`, `unsupported-schema`.

Do not run a 0.5.0 audit end to end. A partial audit needs a schema-4 baseline
for the clone, and the decoder verdict is the whole finding.

### 5. Hand the artifact to ramify-audit Plan 8

Report the following to the coordinator:

- the receipt path;
- the tarball path, SHA-256 and integrity;
- the release commit.

ramify-audit's Plan 8 qualifies 0.6.0 against this exact tarball, installed
by path, before anything is published, as its Plan 7 did with 0.2.0. That
qualification is Plan 8's work, not this iteration's. If it finds a defect in
0.3.0, fix it on this branch with a new release commit, a new artifact and a
new receipt. Keep the first receipt and mark it superseded.

### 6. Results and handoff

Write `iteration2-results.md` and [`handoff.md`](#handoff), and commit both.
These commits change only this plan directory, so the packed source is
unchanged.

### 7. Publication gate

**Stop here.** Publication requires both:

1. ramify-audit Plan 8's qualification on this tarball has passed. The
   coordinator records its reference.
2. Dan has approved publishing exactly this tarball to
   `https://npm.braimax.com`. The coordinator asks him.

Publish nothing before both are recorded. After that, the coordinator
publishes, or instructs the implementer to:

```sh
npm publish "$E/artifact/ramify.ts-0.3.0.tgz" --registry https://npm.braimax.com
npm view ramify.ts@0.3.0 dist --registry https://npm.braimax.com --json
```

The registry's `integrity` and `shasum` must equal the receipt's (AR-11).
Record these in an addendum to `iteration2-results.md`:

- the Plan 8 qualification reference;
- the approval, with who and when;
- the publish output;
- the registry verification.

## Handoff

`handoff.md` lists what changes for joint adoption with ramify-audit 0.6.0.
Adoption itself is not part of this plan. Adopters follow ramify-audit's own
handoffs (Plan 7 Phase 3 and Plan 8); this handoff states Ramify's side.

### Release

- The published version, tarball SHA-256, integrity and receipt path.
- The schema change: `ramify.affected-cli/3` and `ramify.affected/3`.
  `ramify.ipc/2` is unchanged.
- The qualification table from step 4.

### What ramify-audit 0.6.0 does with `/3`

State this as the audit's behavior, copied from
[how ramify-audit 0.6.0 consumes `/3`](../contracts.md#how-ramify-audit-060-consumes-3):

- It reads `/3` strictly.
- A path selects only when its `selects` is non-empty.
- An empty answer is a selection of zero modules.
- An `undetectedConfigFilesForcingFullAudit` entry is accepted only when its
  seed has `kind: 'inert'`. Every other kind is refused, and the refusal names
  the kind: `source-area`, `auxiliary-source`, `description`, `readme`,
  `captured-input`, `ignored`, or `null` for excluded or outside-project
  paths.

### Toolkit changes

- **`fullAuditPaths`.** The twelve old patterns are dropped.
  `undetectedConfigFilesForcingFullAudit` takes literal files only, never
  globs, and refuses every kind but `inert`. The toolkit declares no undetected
  configuration file unless a literal inert file qualifies under D7, meaning a
  file that no tool detects. As facts for that decision, record the measured
  0.3.0 kind of each file the old patterns match. The expected kinds:
  - `tsconfig.json`: `captured-input`;
  - `package.json`: `captured-input`;
  - `tsconfig.scripts.json`, `tsconfig.build.json`, `tsconfig.portable.json`:
    `inert`;
  - the `vite*`/`vitest*` configurations and the build scripts:
    `auxiliary-source`;
  - `scripts/reference-harness/**` and `examples/collection-review/**`:
    `ignored`;
  - `package-lock.json`: as iteration 0 recorded it.

  `ramify-audit.json` and the preparation lockfile are refused at the audit's
  stage 1 regardless of kind.
- **Probe fixtures.** Keep the two probe-fixture declarations. For context
  only, as a Plan 8 matter decided 2026-10-06: the toolkit's `ignorePaths`
  will be `["docs/**", "ramify-agent/**", "scripts/probes/**"]`.
- **Executable.** Change the executable path in `CLAUDE.md` from 0.4.0 to the
  installed 0.6.0.
- **Baseline.** Expect a new full baseline, because the audit definition
  changes.
- **Interim audits.** The toolkit audit runs the checkout's own
  `dist/src/ramify`. From iteration 1 until adoption, default-mode toolkit
  audits under 0.4.0 or 0.5.0 fall back to full with `ramify-unavailable`.

### ramify-agent changes

- Pin ramify-audit 0.6.0 and `ramify.ts` 0.3.0.
- Remove `enclosingProject`.
- Prerequisite: the R7 root marker (`root module ramify-agent`) and
  declarations for its nested trees.
- Expect a new full baseline.
- Its source never invokes `ramify affected` directly; it consumes answers
  only through ramify-audit.
- Its prompt `.md` files beneath `src/` are `inert` and select nothing (J5).
  An edit to one is an accepted miss under D1, which full audits catch.

### Open items

- Every deviation recorded in iterations 0 to 2.
- Whether Dan has confirmed or reversed J5.

## Exit criteria

- The release commit's full audit passes.
- AR-07, AR-08 and AR-09 have evidence.
- The handoff is committed.
- The artifact is handed to ramify-audit Plan 8.
- The publication gate is reached. AR-11 completes only after Plan 8's
  qualification, Dan's approval and the registry verification.

## Results file

Write `iteration2-results.md` with:

- the release commit;
- the gate verdict and report path;
- a receipt summary with a link to `RECEIPT.md`;
- the smoke outputs;
- the qualification table: case, seeds, kind, selects, changed, affected,
  widening, whether the artifact and the clone build agree, and the 0.5.0
  verdict;
- the protected-document hashes;
- the remaining gaps;
- after publication, the addendum with the Plan 8 qualification reference.
