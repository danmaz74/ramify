# Ramify 0.4.1: hard exclusions beneath owned trees

The provider correction is qualified and the coordinator published its exact
immutable package at `2026-10-07T16:35:04.446Z`. Fresh registry metadata,
downloaded bytes and installed public behavior match the qualified artifact.
Consumer adoption and branch push remain with the coordinating agent.

## Correction and source

`ramify/analysis/project` owns `classifyProjectPath` in
`subs/analysis/subs/project/src/ownership.ts`. It now remembers the first owned
nested-tree or scratch boundary and continues checking canonical path prefixes.
Repository metadata, installed packages, generated paths and enclosing
compiler-configured outputs remain unowned beneath that boundary. Ordinary
owned-unwired, owned-nested-project and scratch contents retain their original
owner and exclusion. Unowned boundaries still stop classification.

The correction reads no filesystem contents and introduces no schema, public
API, production module or consumer classifier. It does not inventory an
independent project's modules, interpret its declarations or infer its outputs
from manifests, inner compiler configurations or names such as `dist`.

- Branch: `fix/owned-tree-hard-exclusions`.
- Baseline: `27214c87a831a01063b31a8b90be3744d93d3e86`.
- Executable correction and version: `65e265fb70d67acbc27627716b61a8913bec544e`.
- Exact final qualified package source: `11170110b764c35892049281cec9fd8174e9abe4`.
- Exact source tree: `9ecefbde1d2b4f16eaa2daf1f5354ecb643645cd`.

The last source commit corrects the owner README's obsolete first-exclusion
sentence. That README is omitted from the package but is not covered by the
committed audit ignores, so the final source received its own full audit.
This receipt follows that source and changes only a `docs/**` path, explicitly
ignored by the committed audit definition and omitted from the package.
The separate source and receipt identities, plus the released CLI's actual
post-receipt applicability answer, are recorded in the external handoff evidence.
No manual equivalence claim replaces that answer.

## Verification

The new focused reproduction failed on the original 0.4.0 source: 25 hard
exclusion cases failed, 30 positive controls passed, and 93 unrelated cases
were deliberately unselected. The failure is retained in
[regression-before.log](/home/app/ramify-audit-pb-evidence/ramify-0.4.1-prod/logs/regression-before.log).

After the correction, this focused command passed all 161 tests in three files:

```sh
node_modules/.bin/vitest run \
  subs/analysis/subs/project/src/tests/path-ownership.test.ts \
  subs/cli/src/tests/affected-command.test.ts \
  subs/analysis/src/tests/project-boundary-affected.test.ts
```

Production build, type-check, self-check and final-contract validation passed.
The self-check completed all 15 owners with no errors or warnings and 41
existing analysis limits; complete analysis coverage is not claimed.

The final clean source was frozen while the released audit executed:

```sh
env -u FORCE_COLOR \
  /home/app/tools/ramify-audit-0.7.0/node_modules/.bin/ramify-audit \
  audit --cwd /home/app/ramify-owned-tree-hard-exclusions --full --json
```

- Producer: `ramify-audit` 0.7.0; requested and executed full scope.
- All five configured checks passed; 204 files and 2,894 tests passed, with
  zero failed or skipped files/tests; duration 341.243 seconds.
- Configured discovery: `runner-configured-files/1`, `vitest.config.ts`,
  expected/run 204/204, missing none, complete.
- Failure ledger complete, entries empty, no unhandled or carried failures.
- Composition: `pass`, unscoped, chain depth 0, outstanding failures 0.
- Run: `a8a9d750-225a-41bb-bda9-8add2d2e2110`.
- Report: `a73f11bbee2aeac2a8f7e3af1ef82d7e4cac3131`.
- Run ref: `refs/audited/runs/2026-10-07T16-33-04Z-11170110b`.

[Final raw audit](/home/app/ramify-audit-pb-evidence/ramify-0.4.1-prod/logs/full-audit.json)
is distinct from the passing pre-README audit and an earlier preparation
failure. The first attempt ran no checks because the declared example package
had no installed dependencies. Installing the committed workspace's example
dependencies corrected preparation; its original failed result remains in
`logs/full-audit-preparation-failure.json`. No failed attempt is called passing.

## Immutable artifact and installed behavior

[Artifact identity](/home/app/ramify-audit-pb-evidence/ramify-0.4.1-prod/artifact/identity.json)
binds the source, source tree, full report and immutable tarball. Production
build used this isolated checkout, without copying any prior `dist`.
`npm pack --ignore-scripts --dry-run --json` and the single actual pack agree.

- Package: `ramify.ts` 0.4.1; registry `https://npm.braimax.com`.
- [Tarball](/home/app/ramify-audit-pb-evidence/ramify-0.4.1-prod/artifact/ramify.ts-0.4.1.tgz):
  mode 0444, 791,616 bytes, 492 files, 3,049,190 unpacked bytes.
- SHA-256: `66ca8cc2e37025da7855fc5240edb561e57e338928d49e5f092eb57daf174c2f`.
- Integrity: `sha512-EU91GS5iq8WcqOv4vUmjTVTLB7a5hWtY6usyaNiGHhNLO6UlTt0gVVqZJcP5BWidDYLgZYdCUdrBM9FKPIxPXQ==`.
- Manifest SHA-256: `902a974d155ee41428400a1b7beed1f95d64d78ff361d409fbe0fc6c82940278`.

No package paths were added or removed relative to 0.4.0; only runtime identity,
`ownership.js`, `ownership.d.ts` and `package.json` changed. Every installed
file matches the manifest, the isolated install's lockfile integrity matches,
and the tarball remains unchanged. The archive contains no `/home/app` paths or
production explorer `jsxDEV` calls.

The actual isolated installed CLI passed two queries and 42 independent path
checks with empty stderr. [Raw controls](/home/app/ramify-audit-pb-evidence/ramify-0.4.1-prod/installed-controls.json)
retain exact executable, argv, stdout, input identities and fixtures. Both a
marked Ramify nested project and an independent non-Ramify tree keep ordinary
ownership while their absent metadata/package/generated paths are excluded.

Reserved exclusions such as absent `docs/.git/config` are authoritative
synthesized negative path facts, absent from the rooted topology table; this
is the existing public contract. Configured output `fixture/dist` is present
in topology and excluded when the enclosing configuration names it. The same
name without configuration, and a separately declared inner compiler output,
remain ordinary owned paths in the enclosing evaluation.

## Preservation and coordinator handoff

All 16 protected files match the supplied baseline in HEAD, index and worktree.
The external [protected comparison](/home/app/ramify-audit-pb-evidence/ramify-0.4.1-prod/logs/protected-comparison.json)
also checks authorized changed paths, additions, untracked files and renames.
Neither `/ramify` nor `/home/app/ramify-nested-kinds` was edited.

The registry's exact 0.4.1 version query returned E404 before preparation;
raw output remains in `logs/registry-version-before.json`. The coordinator
subsequently published the exact tarball; its
[publication log](/home/app/ramify-audit-pb-evidence/ramify-0.4.1-prod/logs/publication.log)
is retained. Fresh [registry metadata](/tmp/ramify-plan21-registry-041-verification/registry.json)
and an independently downloaded tarball match the qualified SHA-256 and
integrity. A fresh registry installation passed two public CLI queries and all
42 path checks with empty stderr; all 492 installed files independently match
the qualified manifest and its lockfile version/integrity are exact.
[Registry public smoke](/tmp/ramify-plan21-registry-041-verification/public-smoke.json)
and [installed manifest verification](/tmp/ramify-plan21-registry-041-verification/installed-manifest-verification.json)
retain those independent results. The publication used:

```sh
npm publish \
  /home/app/ramify-audit-pb-evidence/ramify-0.4.1-prod/artifact/ramify.ts-0.4.1.tgz \
  --registry https://npm.braimax.com --ignore-scripts
```

The external evidence directory is
`/home/app/ramify-audit-pb-evidence/ramify-0.4.1-prod/`.
