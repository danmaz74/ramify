# Three-kind provider handoff

The provider implementation and publication are complete. Ramify 0.4.0 names
`owned-unwired`, `owned-nested-project` and `external`; the old `owned-ignored`
keyword is refused. Audit 0.7.0 consumes affected CLI and selection `/4` only.
The declaration determines the kind; Ramify never inspects a declared tree to
verify whether its contents form a project. Nested audit discovery is unchanged.

## Plan 21 adoption

Adopt exact registry pins `ramify.ts` 0.4.0 and `ramify-audit` 0.7.0 together,
updating the agent package and lockfile in its own implementation iteration.
Mark the agent and three fixture roots with `root module`; ordinary child
descriptions remain unmarked. At the agent root, declare:

```ramify
owned-unwired "docs"
```

At the harness, declare the three project roots individually:

```ramify
owned-nested-project "fixtures/capability-coordination"
owned-nested-project "fixtures/capability-coordination-nested"
owned-nested-project "fixtures/collection-review"
```

Their parent `fixtures/` is not a project root. Retain the fixture locations and
existing compiler/runner exclusions. Owned-unwired docs remain in ordinary
owner write scope, including code examples of any extension; protected-document
authorization still applies. Owned nested projects require whole-tree explicit
inclusion with owner, reason and their own instructions. Plan 21 calls those
records `includedProjectTrees`. External trees remain unwritable.

Set `ignorePaths: ["docs/**"]` in the agent audit definition and remove
`enclosingProject`. Full-audit reuse does not ask Ramify, so the explicit ignore
is necessary independently of the docs declaration. P1's request for a new
provider docs classification is withdrawn. PB3-A02 and PB3-S03 now verify the
declarations, docs ordinary scope and explicit project inclusion. Agent runtime
adoption, package pins and tests remain Plan 21 work.

The revised, untracked Plan 21 lives at
`/tmp/ramify-plan20-project-boundary-preparation/ramify-agent/docs/plans/21-project-boundary-adoption/`.
Its historical inspections retain their original refs and versions, with dated
amendments explaining these successor inputs. P3's public committed-configuration
operation and P4's public assignment-verification composition still require
their provider review and agent witnesses; this release does not implement them.

## Published artifacts

Both packages were published, in this order, to `https://npm.braimax.com`.
Registry integrity, SHA-1 and independently downloaded tarball SHA-256 match the
qualified artifacts exactly.

| Package | Source commit | Tarball SHA-256 |
| --- | --- | --- |
| ramify.ts 0.4.0 | `eaa156ec51ed47eae0c8d06efc2df422a25ba0e5` | `9d608b1322f5b36b6b7ad518b000215f45f425a39152cf76a1127add4bfd5284` |
| ramify-audit 0.7.0 | `5e5228da63fcab934dbb72622798b01482789344` | `4f0d8acc3565f625de64c908cfcd1a8d8d3fd413422b90b3931311c6f41b4217` |

Ramify integrity:
`sha512-Rs4uxaUKGiLAYvwJIyIlD3GglrFioMzl8vN6udGZNODX7SixB6MVBobpQM3Y2MpaBnVxw/WsuxaEXKrBYDb20Q==`.
Audit integrity:
`sha512-2/1uFifIYfoN4FPf4hK4imBOBwyWyGhWvaBOdAnAnZKCJFWEV14AJMklG1QC1qVfynr+1y6pEpWqTGPYXE7Wzg==`.

The immutable Ramify artifact is
`/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/artifact/ramify.ts-0.4.0.tgz`;
the audit candidate is
`/home/app/ramify-audit-pb-evidence/nested-tree-kinds/candidate-final/ramify-audit-0.7.0.tgz`.
Production receipts and manifests remain beside them. Published audit 0.7.0 is
installed at `/home/app/tools/ramify-audit-0.7.0/node_modules/.bin/ramify-audit`.
Publication provenance is
`/home/app/ramify-audit/.git/ramify-audit/releases/ramify-audit-0.7.0.json`.

## Qualification and adoption evidence

The [iteration 2 receipt](iterations/iteration2-results.md) records the exact
production artifact and six independently asserted toolkit path answers. The
[iteration 3 receipt](iterations/iteration3-results.md) records the strict reader,
real suite (56 tests), docs/example zero-selection cases, full reuse,
configuration fan-out to 15 modules and source closure to four modules.

Ramify release full report `0f5533b43767d1c6095b45f6eb9f8fcf8aef9392`, run
`refs/audited/runs/2026-10-06T22-22-17Z-eaa156ec5`, passes all five checks,
204 files and 2838 tests, with expected-file verification complete (204/204).
Iteration 4's newly isolated candidate installation legitimately reused this
exact-commit full report. Audit release report
`872229d70cca1dd9e604f3b56a0e96560192cc2c`, run
`refs/audited/runs/2026-10-06T22-24-54Z-5e5228da6`, passes all four checks,
49 files and 1306 tests, with producer 0.6.0. The audited release script publishes
that exact source and confirms checkout/package identity and registry smoke.

The toolkit adopted the plan by fast-forward from `f9a13153` to `c34f910b`;
commit `9bb5f032` updates its gate instruction to published audit 0.7.0. Commit
`900e6113` applies only approved H1/H2 and the agent README correction, leaving
the user's scratch-lifetime edits unstaged. Plan 20's named D2/provider-wait
sections were revised; its tracked preparation-worktree correction is
`4b012356`, while the root draft remains untracked. The
[iteration 4 receipt](iterations/iteration4-results.md) binds the clean adoption
gate and final synchronization refs. ramify-audit main is fast-forwarded to its
published release commit.

## Remaining limits

Toolkit aggregate affected answers still widen with diagnostic partial-coverage
notes. Known seed ownership/selection and dependency closure remain usable;
qualification verifies the audit's actual selections and complete expected files.
The interim 0.6.0 `/4` reader incompatibility is resolved by installed 0.7.0.

The proposed, unimplemented `docs/architecture/architect-view-diff.spec.md`
still mentions architect-view `/2`; changing its protected wording is outside
this plan's approved patches and awaits the separately requested approval. It
does not change implemented output or gate results. Agent P3/P4 and runtime
adoption remain Plan 21's explicit prerequisites and work, not incomplete
provider deliverables in this plan.
