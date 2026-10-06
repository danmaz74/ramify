# Iteration 4 results: Publication and adoption

NT-16 through NT-20 are complete. The user's instruction “consider all
publications pre-approved” authorizes both releases after their qualification
gates; no additional publication approval was requested. The implementation
uses the iteration-work skill and the approved plan scope.

## Clean Ramify release gate (NT-16)

Installed the exact frozen audit candidate in the new external prefix
`/home/app/ramify-audit-pb-evidence/nested-tree-kinds/iteration4/candidate-install`:

```sh
npm install --prefix <candidate-install> <recorded-0.7.0-tarball> \
  --omit=dev --ignore-scripts --no-audit --no-fund
env -u FORCE_COLOR <candidate-install>/node_modules/.bin/ramify-audit \
  audit --cwd /home/app/ramify-audit-pb-evidence/nested-tree-kinds/toolkit-qualification \
  --full --json
```

The checkout is clean at exact Ramify release
`eaa156ec51ed47eae0c8d06efc2df422a25ba0e5`. The request legitimately reused
the already qualified full report at that same commit, with no ignored changed
paths. It did not execute the suite again. `composition.verdict: pass`,
outstanding failures 0; all five checks pass, 204 files / 2838 tests pass,
zero failures/skips, and `summary.coverage.expectedFiles.status: complete`
(204 expected / 204 run, no missing files). Report
`0f5533b43767d1c6095b45f6eb9f8fcf8aef9392`, run
`refs/audited/runs/2026-10-06T22-22-17Z-eaa156ec5`.
[Actual request output](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/iteration4/ramify-release-gate.json).

## Publications and installed tool (NT-17)

Published the recorded production Ramify tarball first, without rebuilding:

```sh
npm publish /home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/artifact/ramify.ts-0.4.0.tgz \
  --registry https://npm.braimax.com --ignore-scripts
```

Then, in the clean audit release worktree at
`5e5228da63fcab934dbb72622798b01482789344`:

```sh
npm run release -- --publish \
  --audited-source 5e5228da63fcab934dbb72622798b01482789344 \
  --audit-run-ref refs/audited/runs/2026-10-06T22-24-54Z-5e5228da6 \
  --audit-producer 0.6.0
npm install --prefix /home/app/tools/ramify-audit-0.7.0 ramify-audit@0.7.0 \
  --registry https://npm.braimax.com --omit=dev --ignore-scripts --no-audit --no-fund
```

The audited release script's source and clean-checkout packs both reproduce the
qualified candidate SHA-256 and package contents. It verifies registry-installed
help, audit, check-branch and status smoke, all passing. Its provenance is
`/home/app/ramify-audit/.git/ramify-audit/releases/ramify-audit-0.7.0.json`.
The installed package metadata and lockfile identify exactly 0.7.0.

| Artifact | Registry/download SHA-256 | Registry SHA-1 |
| --- | --- | --- |
| ramify.ts 0.4.0 | `9d608b1322f5b36b6b7ad518b000215f45f425a39152cf76a1127add4bfd5284` | `9eca2c8d4d10a6735bec321e91718f31561fdf9a` |
| ramify-audit 0.7.0 | `4f0d8acc3565f625de64c908cfcd1a8d8d3fd413422b90b3931311c6f41b4217` | `0dd0dae7f3f4291af2f8de6e656af14009fca2b2` |

Both `npm view <package>@<version> dist --json` outputs match the recorded
integrities. Independently downloading both registry tarballs proves exact
byte identity with the immutable candidates. The full integrity strings are
in [handoff](../handoff.md) and
[registry artifact evidence](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/iteration4/registry-artifacts.json).
[Ramify publication log](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/iteration4/ramify-publication.log),
[audit publication log](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/iteration4/audit-publication.log).

## Toolkit adoption (NT-18)

`/ramify`, branch `ramify-agent`, fast-forwarded from `f9a13153` to the plan
receipt commit `c34f910bfa29efec481dd2e45eb2161ba003bf41`. Adoption commit
`9bb5f032` changes only the root `CLAUDE.md` audit sentence/path to published
0.7.0. `ramify-audit.json` is unchanged. A clean detached worktree
`/home/app/ramify-nested-kinds-adoption` was created at that adoption commit.

The initial gate attempt could not link absent worktree dependencies and
executed no checks; its `dependency-link-failed` result is retained as
[unrun setup evidence](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/iteration4/adoption-gate-unrun-dependencies.json).
Root and `examples/collection-review` ran `npm ci --no-audit --no-fund`, exactly
the package directories declared by the committed audit definition. Then:

```sh
env -u FORCE_COLOR /home/app/tools/ramify-audit-0.7.0/node_modules/.bin/ramify-audit \
  audit --cwd /home/app/ramify-nested-kinds-adoption --full --json
```

The exact adoption commit passes with published 0.7.0: all five configured
checks pass; 204 files / 2838 tests pass, zero failures/skips,
`composition.verdict: pass`, outstanding failures 0 and expected-file verification
complete (204 expected / 204 run, no missing files). Report
`e8a2237dcc127497c71acbccb0c07063b6632513`, run
`refs/audited/runs/2026-10-06T23-02-33Z-9bb5f032c`. This is fresh full execution, not reuse.
[Adoption gate output](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/iteration4/adoption-gate.json).

Later agent and final plan documentation advances the adopted HEAD through
ignored paths. A final full request from the clean worktree verifies applicable
reuse of this adoption evidence; the actual final source/report refs and branch
equality are in
[final synchronization](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/iteration4/final-synchronization.json).

Clean ramify-audit main fast-forwarded from `38cfb308` to its published release
`5e5228da63fcab934dbb72622798b01482789344` and was pushed; HEAD equals
origin/main. The plan branch contains the adoption/doc commits, final receipt,
handoff and completed status and is adopted locally into `/ramify`. Its final
push remains pending authentication: three bounded attempts timed out in the
VS Code devcontainer credential helper. Parent fallback checks found no alternate
GitHub token/store, while SSH and ssh-agent requests also timed out in the
forwarded devcontainer bridge. No alternate commit history was synthesized.
`origin/plan/nested-tree-kinds` remains at `c34f910bfa29efec481dd2e45eb2161ba003bf41`;
the latest local HEAD and attempted synchronization are recorded in the linked
final synchronization evidence. Audit main is synchronized. The root branch's
unrelated pre-existing local commits are not pushed.
The earlier iteration 3 plan-receipt synchronization gap is closed by a
successful bounded retry; no tests were repeated for that network issue.

## Agent documentation and protected patches (NT-19)

Commit `900e6113` changes only the approved H1/H2 protected paragraphs and the
named agent README fixture explanation. H1/H2 were applied verbatim after
checking their approved HEAD baselines. `git apply --cached` staged only their
own hunks. The remaining harness diff contains exactly the user's original
scratch-lifetime added/deleted lines, with no user edits staged. The final
ordinary README wording says Plan 21 **will** declare the fixture project root;
agent runtime adoption remains deferred.

| Protected file | Before SHA-256 (approved HEAD) | After SHA-256 (committed approved content) |
| --- | --- | --- |
| ramify-agent/docs/harness.spec.md | `78b1de2aef9c013fd40048cf8d664e819d00887259036bb590aaa46529e8e6ed` | `31c55d9ae209cfc74024495eae4454050c2a2d286bd4e9ef0619696e1fa1b7bd` |
| ramify-agent/docs/glossary.md | `6e8809ae8a9af42a78a61f8265f85979807e2c4871eae83b818b386735c3de20` | `7fd986fa9171f7a8080573298b03158850af9cbb161f6f59257a9a8910797161` |

The harness's working-content hash was
`db638c263346d95dd0a637c6265c7272294f34b5a44f87f044d6bb2469192f06`
before H1 and is
`19168b092cd9bee9aa53f30231353ec1614b7d74febbecc26d5d981b0838ccba`
after H1, including the retained user scratch paragraph. No other protected
agent patch was applied.

Plan 20's named D2/provider-wait sections now use owned-unwired spikes and
individual owned-nested-project fixture roots. The tracked preparation checkout
commits only that file as `4b012356`; its pre-existing docs index edits remain
unstaged. The root Plan 20 draft stays untracked and receives only those named
section corrections. [Before/after identities](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/iteration4/plan20-amendments.json).

Plan 21 remains untracked in the preparation checkout. Fourteen files were
revised: main-plan, contracts, acceptance, provider-requirements,
provider-contract-review, provider-receipt, source-state, planning-validation,
iterations/00-provider-convergence, 01-provider-adoption, 03-write-scope,
07-integration-acceptance, iteration0-results and manifest. They consistently
specify owned-unwired docs plus docs/** ignore, withdrawn P1, three actual
project-root declarations, includedProjectTrees, PB3-A02/PB3-S03 and exact
0.4.0/0.7.0 pins with affected /4. Historical records retain original refs,
versions and findings, with dated amendments. Original evidence JSON hashes
are unchanged. All 108 local document links resolve and the manifest parses.
The changed-file hash list and revised-document snapshot are in
[iteration 4 evidence](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/iteration4/plan21-changed.json).

The root baseline captured 63 dirty/untracked user paths. Every other path's
bytes/deletion status are preserved; only the authorized harness and root
Plan 20 sections differ. The index is empty after the commits. Agent source,
package pins, lockfile, declarations and tests were not changed. No user
scratch edits or unrelated deleted spike files were committed.
[Preservation check](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/iteration4/user-preservation.json).

## Handoff and remaining limits (NT-20)

[Handoff](../handoff.md) contains the exact Plan 21 adoption inputs, artifact
identities, qualification/publication/adoption refs and remaining limits.
All required cases in this plan are complete; the main-plan status is complete.
Toolkit partial-coverage aggregate widening remains diagnostic, with complete
expected-file verification and qualified known selections. The interim old
reader incompatibility is closed by published 0.7.0.

The optional protected architect-view-diff proposal still mentions /2 pending
the separately requested exact-text approval. It is unimplemented and outside
this plan's approved inventory; implemented formats and release gates are /3.
Agent P3/P4 public integration witnesses and code adoption remain Plan 21 work.
