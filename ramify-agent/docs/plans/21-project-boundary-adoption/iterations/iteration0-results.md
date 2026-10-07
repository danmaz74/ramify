> **Expanded-plan note, 2026-10-07:** this receipt preserves earlier evidence.
> [Plan 21](../main-plan.md) now also covers architect-owned completion. The former P4
> assignment/scenario certification proposal is withdrawn; revised execution
> witnesses and the declaration/lifecycle contract review remain unrun. No old
> witness is relabeled as passing the expanded prerequisites.

# Iteration 0: prerequisite review results

**Historical record:** the inspection below retains its original evidence.
The [three-kind amendment](#three-kind-amendment-2026-10-06) at the end states
the current adoption contract.

**Date:** 2026-10-06. **Status:** in progress; exit criteria not met.
This receipt records completed inspection and existing-baseline applicability.
It does not claim provider convergence, PB3-T06 acceptance or source adoption.

## Source and changes

Worktree `/tmp/ramify-plan20-project-boundary-preparation`, branch
`feat/plan20-project-boundary-preparation`, committed source
`d1497178f1e3733d92b2c4c0ab613e37961e5256`.
The agent still pins Ramify 0.1.0 and ramify-audit 0.3.2. Its committed subtree
is identical to Plan 20's accepted source `a2a4ad7d35790598f8d0b069f3aa552bdc7d2788`:

```sh
git diff a2a4ad7d35790598f8d0b069f3aa552bdc7d2788 HEAD -- ramify-agent
```

The command produced no diff. Working-tree changes are the Plan 21 documents
and their documentation-index entry. No runtime files, pins, provider files
or protected documents were edited. No commit or push was performed.

At the initial review the plan recorded the then-current external-only
restatement rule and `/2` versus `/3` disagreement. Both are superseded by
the continuation below and the current [provider receipt](../provider-receipt.md).
The direct docs decision remains unchanged.

## Applicable full baseline

From the repository root, using the installed released provider:

```sh
ramify-agent/node_modules/.bin/ramify-audit check-branch HEAD --project-root ramify-agent --cwd . --json
```

Exit 0. The provider returned `auditStillApplies: true`, `auditPassed: true`
and `composition.verdict: pass`, with no outstanding failures. The
[selected response fields](../evidence/iteration0-baseline.json) retain its
project-specific notes ref, both commits and the original report identity.

| Identity | Value |
| --- | --- |
| Checked committed source | `d1497178f1e3733d92b2c4c0ab613e37961e5256` |
| Original full-audit source | `a2a4ad7d35790598f8d0b069f3aa552bdc7d2788` |
| Original report commit | `7beb7e62d5c55b5066f2f3d40e81a02e362648ab` |
| Producer / evidence schema | ramify-audit 0.3.2 / 3 |
| Original execution time | 2026-10-04T11:29:28.450Z |
| Applicability kind | `exact-tree` |

This was a read-only applicability query. No tests or new full audit executed;
the uncommitted plan documents are outside the queried source identity. The
brief now explicitly permits this provider-confirmed baseline reuse. The new
provider pair will still require its own full adoption baseline.

An initial exploratory query with `--project-root .` addressed the enclosing
toolkit. It is excluded from agent evidence; the command above corrects the
target and returns `projectRoot: ramify-agent` with its own notes ref.

## Protected documents and remaining work

The five-file [protected baseline](../planning-validation.md#protected-file-baseline)
remains byte-identical to HEAD. The proposed specification correction is not
applied or specifically authorized. Historical `.superseded/` documents were
not inspected. Document validation is recorded in the continuation section of
[planning validation](../planning-validation.md#prerequisite-review-validation).

P1–P4 remain open. P5 is present in the inspected contract but awaits target
qualification. Release identity checks, PB3-T06's committed and dirty witnesses,
the final-provider adoption probe and the exact protected-patch authorization
remain unrun or pending. No acceptance ID is marked passing by this receipt.
The next work is provider convergence as specified in the incomplete receipt;
dependent iterations remain unstarted.

## Parallel prerequisite work: provider refresh and API review

Completed after Dan authorized work that can proceed while the provider plans
run. Read the current D10, both provider plans/contracts and the relevant public
and internal audit signatures. The new
[provider snapshot](../evidence/iteration0-provider-refresh.json) distinguishes
committed identities from concurrent uncommitted audit implementation.

- Removed the stale `/2` compatibility blocker: both plans now agree on `/3`.
  Actual artifact qualification is still pending.
- Updated ignore policy: owned-ignored and external trees can both be listed;
  there is no ownership-based restatement validation. Configuration precedence,
  nested discovery and agent write authority remain separate.
- Recorded the `.md` rule under `src/`, including runtime prompts. This is an
  affected-selection decision, not a source-check disposition. The all-extension
  docs requirement still needs provider inventory/check and selection witnesses.
- Prepared the [contract review package](../provider-contract-review.md): exact
  existing P3 signature proposed for export; concrete P4 inputs, results,
  reuse/dirty-source requirements and decisive positive/negative F2 cases.
  No provider review, implementation or publication is implied.
- Imported released audit 0.5.0 through its public ESM entry, inspected named
  exports and invoked `vitestOwnershipGroups` on a synthetic topology. Root
  and disconnected grandchild produced two groups with the necessary child
  exclusion. The [API evidence](../evidence/iteration0-public-api-inspection.json)
  records exact inputs, outputs and package-entry digest.

The public-package smoke exited 0. An earlier CommonJS-resolution attempt
failed because this package exports its entry only for ESM import; it ran no
provider operation and was replaced by the successful ESM invocation. No tests,
new audit, P3 configuration-read witness or PB3-T06 acceptance executed.

Plan documents now link the review package from the relevant iteration briefs.
Protected files and source pins remain unchanged. No source commit/push or
provider-repository change was made. P1/P3/P4 remain open; P2 agreement is
recorded separately from unrun release qualification. The next actionable step
is provider contract review and assignment of its additional work, followed
by the specified installed-package witnesses.

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
ordinary owner write scope; includedProjectTrees carries explicit project-tree
inclusions. PB3-A02 and PB3-S03 follow those rules. See the current contracts
and the [provider handoff](/home/app/ramify-nested-kinds/docs/plans/nested-tree-kinds/handoff.md)
for artifact identities and qualification. P3/P4 remain open public integration
witnesses, and agent runtime adoption/acceptance remains unimplemented.
