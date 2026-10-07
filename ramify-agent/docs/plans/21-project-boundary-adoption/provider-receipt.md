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
