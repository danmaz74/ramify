# ramify.ts 0.5.0 publication receipt

**Date:** 2026-10-12. **Status:** Published and verified. `ramify.ts@0.5.0` is `latest` at `https://npm.braimax.com`.

- Release commit: `26e382791ae64e52f179573054ff00ff03078700` ([source](https://github.com/danmaz74/ramify/commit/26e382791ae64e52f179573054ff00ff03078700)).
- Release source tree: `1bf467b2938b11fef4f811e95096978d11c31657`.
- Registry `gitHead`: `26e382791ae64e52f179573054ff00ff03078700`, exactly matching the audited release commit.
- Artifact: [ramify.ts-0.5.0.tgz](https://npm.braimax.com/ramify.ts/-/ramify.ts-0.5.0.tgz).
- Downloaded tarball SHA-256: `eab026deec5f71ef2433ecdc951898157a513619606a278169c8a75168a54ec0`.
- Registry integrity: `sha512-N2XY3DBe3JPQ24EhCrvyr0PNZZInivHRn5/fc4W4xxnYTerdIr7UNo2xPaep7oBGZOFy+/iKj2r0FapXeUF0AQ==`.
- Registry SHA-1: `993ded3f633045bfdfbb7ed41fabf37cca0d91b4`.

The release adds fresh ownership queries, structured failure evidence, bounded recovery history, Check/4, CLI/2 and IPC/3. It includes the qualified file-facts and hard-exclusion prerequisites already present in the implementation candidate. The release was fast-forwarded into `main` and pushed before publication. The parked comparison worktree was not merged. No consumer dependency pin was changed.

## Release qualification

Following [the release workflow](../../../README.md#release), only the manifest and root lockfile versions changed after the qualified candidate. The version bump was committed, and published auditor 0.7.0 ran outside the repository against that clean release commit:

```sh
/home/app/tools/ramify-audit-0.7.0/node_modules/.bin/ramify-audit audit --cwd . --full --json
```

The requested full release audit passed all five configured checks: patch integrity, build, type-check, self-check, and all **216 files / 3,007 tests**, with no failures or skips. No configured check was omitted. Audit time: `2026-10-12T11:08:08.219Z`; duration: 348.082 seconds.

- Audit report commit: `dc629f115a44a85a70c1639c2be8406fd38771b0`.
- Audit run ID: `7501e1b7-7f7f-482c-acfc-92a0ed40fb09`.
- Run ref: `refs/audited/runs/2026-10-12T11-08-08Z-26e382791`.
- Tree ref: `refs/audited/by-tree/1bf467b2938b11fef4f811e95096978d11c31657`.

The source `main`, run ref, tree ref and audit notes were pushed atomically to origin. Retrieve the report with:

```sh
git fetch origin refs/audited/runs/2026-10-12T11-08-08Z-26e382791:refs/audited/runs/2026-10-12T11-08-08Z-26e382791
git show refs/audited/runs/2026-10-12T11-08-08Z-26e382791:reports/audit/summary.json
```

The [exact audit response](evidence/release-0.5.0-audit.json.gz) is archived. Earlier [candidate qualification](audit-receipt.md) and [local workflow evidence](completion-report.md) retain their original commit and artifact identities.

## Publication and registry verification

`npm publish --json` ran from the clean audited commit. The required `prepublishOnly` build passed and `publishConfig` selected `https://npm.braimax.com`. The command exited 0. [Publication output](evidence/release-0.5.0-publish.log.gz) and [standard error](evidence/release-0.5.0-publish.stderr.log.gz) retain the exact output, including the existing nonblocking Vite chunk-size warning.

```sh
npm view ramify.ts@0.5.0 version dist gitHead --registry=https://npm.braimax.com --json
npm view ramify.ts dist-tags --registry=https://npm.braimax.com --json
node /tmp/ramify-release-0.5.0/registry-smoke.mjs
```

Registry metadata reports version `0.5.0`, `latest: 0.5.0`, and the release commit above. The [registry smoke recipe](evidence/release-0.5.0-registry-smoke.mjs) packed `ramify.ts@0.5.0` from the registry, compared its integrity with the registry metadata and installed it into a disposable consumer. It verified:

- Installed CLI version `0.5.0`.
- Public `OwnershipDocument` typing and runtime `ownershipDocumentSchema` import through `ramify.ts/cli`.
- Valid and link-invalid ownership: `answered`, exit 0, Ownership/1.
- Broken acquisition: `invalid`, exit 1, no success-only fields.
- Empty daemon endpoint directory after every ownership command.

[Registry metadata](evidence/release-0.5.0-registry-metadata.json), [smoke result](evidence/release-0.5.0-registry-smoke.json) and [smoke output](evidence/release-0.5.0-registry-smoke.log.gz) record these observations. The smoke command exited 0 and removed its owned fixture, consumer, tarball and endpoint directory in `finally`. To repeat the archived recipe, run it from the toolkit root with the metadata saved at `/tmp/ramify-release-0.5.0/registry-metadata.json`; it writes its receipt beside that file.

Consumers can qualify exact pin `ramify.ts@0.5.0` in their own projects. IPC/2 peers must be restarted together with the new clients; there is no downgrade path. The [consumer handoff](handoff.md) records the migration contracts and old discovery-parser limitation.
