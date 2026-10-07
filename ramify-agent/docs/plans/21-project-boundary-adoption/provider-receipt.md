> **Expanded-plan note, 2026-10-07:** this receipt preserves earlier evidence.
> [Plan 21](main-plan.md) now also covers architect-owned completion. The former P4
> assignment/scenario certification proposal is withdrawn; revised execution
> witnesses and the declaration/lifecycle contract review remain unrun. No old
> witness is relabeled as passing the expanded prerequisites.

# Provider convergence receipt: incomplete

**Historical record:** the inspection below retains its original evidence.
The [three-kind amendment](#three-kind-amendment-2026-10-06) at the end states
the current adoption contract.

**Date:** 2026-10-06. **Latest review:** parallel prerequisite work authorized
while the two provider plans execute. This is not a release/adoption receipt.
The [current snapshot](evidence/iteration0-provider-refresh.json) records source
revisions, concurrent working-tree changes and exact document hashes. The
[initial snapshot](evidence/iteration0-provider-snapshot.json) is retained as
history; its schema mismatch and external-only ignore restriction are superseded.

## Inspected identities

| Provider | Inspected source | Target contract |
| --- | --- | --- |
| Ramify affected-rule work | `/home/app/ramify-affected`, `cb2926844cf4b4331f34c6bf498510edefe32ccd` | 0.3.0, affected CLI and answer `/3` |
| ramify-audit | `/home/app/ramify-audit-pb`, `627389ea6fe9a61352dfd012028056e9365b9f85`, with concurrent implementation edits | Plan 8 approved/executing, 0.6.0 consuming affected `/3` strictly |
| Released audit API probe | `/home/app/tools/ramify-audit-0.5.0` | Public ESM export inspection and synthetic ownership grouping only |

The agent still installs Ramify 0.1.0 and audit 0.3.2. No target tarball,
integrity, release gate or installed target pair has been qualified here.
Draft/target version numbers are not adopted pins. Audit qualifies the fixed
Ramify production artifact; publication proceeds Ramify first, then audit.

## Requirement outcomes

| Requirement | Current finding | Required completion evidence |
| --- | --- | --- |
| P1 | Open. Every `.md` path now has inert affected selection, but compiler source such as `docs/example.ts` still reaches auxiliary selection. Ownership/check classification is expressly unchanged by the affected plan. | All-extension docs witnesses for both source-check disposition and affected selection, including present/new/deleted paths and scripts controls; no agent declaration or ignore workaround |
| P2 | Contract agreement reached: both plans use `/3`. Release qualification pending. | Exact compatible package artifacts, real partial selection, full reuse and configuration precedence; a full fallback does not pass compatibility |
| P3 | Open. Released public entry lacks the committed-configuration reader; CLI has no configuration-only path. The existing internal operation supplies a concrete export proposal. | Public package witness reading commit A with HEAD B and dirty definition C, preserved blob/policy identity and no execution side effects |
| P4 | Open. Released grouping and dispatch work; configured discovery/comparison remain internal and committed assignment composition is unsettled. | Provider-reviewed public composition with separate audit/scope conclusions, shared execution and PB3-T06 witnesses; dirty-source witnesses were dropped on 2026-10-07 |
| P5 | Present in inspected contract; target qualification pending. | Installed target through the agent adapter, including nested failure/indeterminate discovery and recovery |

The [contract review package](provider-contract-review.md) names the owning
provider, consumer operations, proposed P3 signature, recommended P4 composition,
rejected substitutes and concrete witnesses. It does not assert an unapproved
new public API. P3/P4 are not deliverables of the current Plan 8 write set.
Provider review must select an amendment/follow-up or demonstrate an existing
public composition before this receipt can be accepted.

## Recorded audit policy

Current D10 and Plan 8:

- Restore `ignorePaths` and full reuse for the same tested tree.
- Allow entries inside both owned-ignored and external trees. Validation does
  not query ownership or refuse a pattern merely because of its tree.
- Keep the audit definition, `src`/`module.ramify` segments and known
  configuration inputs protected from ignoring. Known runner configuration,
  preparation inputs and listed undetected configuration retain precedence.
- Treat a changed ignore list as changed policy requiring a new full baseline.
- Preserve nested discovery independently of ignore matching and ordinary
  assignment exclusions independently of audit policy.
- Adopt the fixed audit and affected-rule releases together. D10 adds no agent
  ignore entry; the agent removes `enclosingProject`.

The agent's docs definition remains settled: all docs contents are inert
regardless of extension. A permanent `docs/**` audit-policy entry for full
reuse would be a separate decision. This plan adds none. (Superseded: the
three-kind amendment below adds `ignorePaths: ["docs/**"]`.) Inert affected
selection alone does not establish full reuse or a source-check disposition.
The accepted `.md` rule includes runtime prompts under `src/`; full gates
retain that coverage obligation without a harness partial-selection override.

## Completed inspection and remaining gate

The [public API inspection](evidence/iteration0-public-api-inspection.json)
confirms named export availability against released 0.5.0 and a two-group
root/grandchild result. It runs no tests/audit and passes no acceptance ID.
The previous committed agent baseline remains recorded in
[iteration 0 results](iterations/iteration0-results.md); no new execution is
claimed at this refresh.

Refresh both handoffs, settle P1/P3/P4, then verify exact artifacts and run
real qualification and the disposable adoption probe. Iteration 0 stays
incomplete and dependent iterations stay unstarted. Provider repositories
were read only; their concurrent implementation work was preserved.

## Three-kind amendment, 2026-10-06

The preceding inspection and prerequisite evidence retains its original source
refs, package versions, document hashes and unrun witnesses. It is historical
evidence, not the current adoption contract. Dan's later three-kind decision
supersedes the earlier no-declaration/no-ignore docs proposal and withdraws P1.
Plan 21 now targets exact published pins ramify.ts 0.4.0 and ramify-audit 0.7.0,
affected CLI/answer /4 and audit evidence schema 4. Declare owned-unwired docs
at the agent root and ignorePaths ["docs/**"] for full reuse. Declare the three
actual harness fixture project roots individually as owned-nested-project;
their parent fixtures/ is not a project root. Owned-unwired contents remain in
ordinary owner write scope; project trees are included through the single
`included` list (superseding the separate `includedProjectTrees` record,
2026-10-07). PB3-A02 and PB3-S03 follow those rules. See the current contracts
and the [provider handoff](/home/app/ramify-nested-kinds/docs/plans/nested-tree-kinds/handoff.md)
for artifact identities and qualification. P3/P4 remain open public integration
witnesses, and agent runtime adoption/acceptance remains unimplemented.

### Released provider inputs for the next agent review

| Package | Published source | Tarball SHA-256 |
| --- | --- | --- |
| ramify.ts 0.4.0 | eaa156ec51ed47eae0c8d06efc2df422a25ba0e5 | 9d608b1322f5b36b6b7ad518b000215f45f425a39152cf76a1127add4bfd5284 |
| ramify-audit 0.7.0 | 5e5228da63fcab934dbb72622798b01482789344 | 4f0d8acc3565f625de64c908cfcd1a8d8d3fd413422b90b3931311c6f41b4217 |

Both were published in that order to https://npm.braimax.com; registry
integrities match the provider receipts. Ramify's complete full gate is report
0f5533b43767d1c6095b45f6eb9f8fcf8aef9392 (204 files / 2838 tests, expectedFiles
complete 204/204). The audit release gate is report
872229d70cca1dd9e604f3b56a0e96560192cc2c (49 files / 1306 tests, producer 0.6.0).
These provider inputs do not accept the still-unrun agent P3/P4 witnesses.

## Iteration 0 current provider prerequisite, 2026-10-07

The isolated Plan 21 branch is at clean committed source
`1c8764a85ed605893b1fde908d905e4d5aa3383c`. Its current exact pins are
still `ramify.ts` 0.1.0 and `ramify-audit` 0.3.2, retained until iteration 1.
The live registry at `https://npm.braimax.com` reports `ramify.ts` 0.4.0 and
`ramify-audit` 0.7.0 as latest at this review. The registry SHA-512 integrities
and the two recorded tarball SHA-256 hashes above were rechecked and match.
The installed, published 0.7.0 public-entry
[probe](evidence/iteration0-published-0.7.0-entry.json) resolves `runAudit`,
`createAuditService`, `dispatchCheck`, `findCompletedAuditRequest` and the
other listed execution operations. It resolves
`requestFromCommittedConfiguration` as `undefined`. This is a public-surface
failure of P3; the internal implementation is present in the clean provider
source `/home/app/ramify-audit` at
`5e5228da63fcab934dbb72622798b01482789344`.

The bounded provider task approved by Dan on 2026-10-07 is in the provider
project, starting from that published source. Its minimal expected public
change is the named line in `src/index.ts`:

```ts
export { requestFromCommittedConfiguration } from './cli-configuration.js';
```

The existing function accepts `{ git: GitExecutorPort, repositoryPath,
sourceCommit, projectRoot, full, force, nested? }` and returns
`Promise<AuditRequest>`; both types are already public. The provider owns
focused public-package tests for commit A while HEAD is B and working definition
bytes are C, exact configuration blob/policy/workspace identity, missing,
nonregular and invalid definitions, and no preparation, check execution or ref
mutation during configuration loading. It must qualify and publish a release
after 0.7.0, then the consumer repeats P3 through that installed public entry.
Provider implementation and publication are separate from this receipt; no
provider source change or release is claimed here.

The [current baseline](evidence/iteration0-current-baseline.json) is applicable
to the Plan 21 commit by exact project tree, reusing original source
`a2a4ad7d35790598f8d0b069f3aa552bdc7d2788`, producer 0.3.2 and report
`7beb7e62d5c55b5066f2f3d40e81a02e362648ab`. It is not evidence from
the proposed new release. The [disposable adoption probe](evidence/iteration0-disposable-adoption-probe.json)
uses installed Ramify 0.4.0 to confirm a marked root, owned-unwired docs and
newly analyzed auxiliary source. It does not qualify the agent's future
fixtures, complete P4 or change the consumer pins.

## Published public provider and installed Plan 21 witnesses, 2026-10-07

Dan approved the bounded P3 provider export, qualification and publication.
The separate provider worktree published `ramify-audit` 0.7.1 at
`https://npm.braimax.com` from audited source
`1944162e7f73a00f81bd35c3536807eba307d982`; its producer-0.7.0 full
audit report is `f4b2f11dc86794d19c46b521c578374a5b2b1dd0` and passed
all four checks (50 files, 1,309 tests, none skipped). The provider receipt is
`/home/app/ramify-audit-p3/docs/2026-10-07-public-committed-configuration.md`
at pushed clean commit `bfafec81a7963aae8eb49caa3a4bb0186c903571`.
The published tarball SHA-256 is
`c9c2c6638ba0a8aa1775afb8eba5edcf880c4e0e44ab281da928464e6543074c`;
the registry SHA-512 integrity is
`sha512-s2Hwp/6gI92igx2oRH15lG1lkSidQYrsDIdN3tvUZMIRmeqEOzyWqO+kjYHlIazw23uq1b5UpSkVvMh17tfLZw==`.

An independent install in `/tmp/plan21-iteration0-provider-probe` exercised
the public 0.7.1 ESM entry. The initial
[F2 P3 result](evidence/iteration0-p3-installed-public.json) binds commit A's
configuration while HEAD is B and working bytes are C. The separate
[F3 public-reader result](evidence/iteration0-p3-f3.json) strengthens this
with different committed A/B checks, ignore policy, workspace inputs and
blobs under malformed working C, a nested committed request, and explicit
missing, nonregular, malformed and invalid-definition rejections. All reader
calls left refs unchanged and executed no checks.

The [P4 result](evidence/iteration0-p4-installed-f2.json) contains full and
partial passing real Vitest runs, newly eligible and deleted tests, a genuine
empty configured selection, a failed discovery/command control, exact report
identities, public completed-run recovery, and an actual running command
cancelled after its child process started and settled. The disposable Git
histories, original producer responses and public operation scripts are
[retained](evidence/iteration0-public-fixtures/README.md). These witnesses
qualify configured execution, discovery and completeness; they do not certify
implementation correctness, apply future consumer pins or replace the active
agent audit. Iteration 1 adopts exact 0.4.0/0.7.1 pins atomically.
