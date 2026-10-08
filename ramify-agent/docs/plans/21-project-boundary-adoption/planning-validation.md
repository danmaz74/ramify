# Planning validation

> **Current validation:** see [consolidated plan](#consolidated-plan-2026-10-07).
> Earlier counts, protected hashes and P4 requirements below are historical.

**Historical record:** the inspection below retains its original evidence.
The [three-kind amendment](#three-kind-amendment-2026-10-06) at the end states
the current adoption contract.

**Date:** 2026-10-06. **Result:** planning checks passed; implementation and
runtime acceptance have not run.

The plan was authored in the existing isolated worktree on source
`d1497178f1e3733d92b2c4c0ab613e37961e5256`. Changes are this plan package and its
entry in the agent documentation index. No runtime source, dependency pin,
provider repository or protected specification was changed.

## Checks performed

- All 74 Markdown links in the plan package resolve, including local heading
  anchors and the inspected provider documents.
- The manifest has eight unique iterations in dependency order; every brief
  has its goal, prerequisites, owners, deliverables, verification, exit criteria
  and handoff.
- All 37 acceptance IDs are assigned to iterations; the manifest names no
  unknown case. Real provider witnesses are distinguished from scripted tests.
- The exact proposed specification replacement matches one location in the
  current protected file. The patch has not been applied.
- All five current agent principles/specification files below are byte-identical
  to HEAD. The prohibited historical `.superseded/` archive was not read.
- Whitespace checks found extra blank lines at the ends of the generated
  iteration briefs. They were removed; the final tracked changes and every
  new file pass Git's whitespace check.
- A consistency review removed the proposed owned-ignored docs declaration.
  Dan's definition that every docs path is inert regardless of extension appears
  in the main plan, provider requirements, contracts, adoption brief and PB3-A02.

Generated-view inspection is recorded in [source state](source-state.md).
No test suite, source audit, real-model call, commit or push was performed for
this documentation-only task. The baseline/adoption/final audits in the briefs
are future execution requirements, not results of planning.

## Protected-file baseline

| File | SHA-256 |
| --- | --- |
| `docs/architecture/plan-context-catalog.spec.md` | `0ce605884b1f2996401040d5ba4d2a49e59906c7a12fb223c28d3c0c1ef4fa14` |
| `docs/check-findings.principles.md` | `6c72c2175de7ecbe3e0746cba469fac7a9051a47c529b3769d11f6b7107bbfea` |
| `docs/check-findings.spec.md` | `ad0c9df605cd60385775c676a7920fbd7865857f84fe02b721b475e2c3c132df` |
| `docs/harness.principles.md` | `80222a6460a08f9c6221f50a8d2ba8ae6d698f632a86c2552521e3cf621d1a84` |
| `docs/harness.spec.md` | `db638c263346d95dd0a637c6265c7272294f34b5a44f87f044d6bb2469192f06` (pre-authorization; `f3635d7e25b8b6d175e543197be9c7d12356048f92266fbf1c5df6431ff948bc` after the scope hunks applied 2026-10-07) |

## Remaining execution prerequisites

The final provider release receipts, P3's public committed-configuration read,
P4's public scope/completeness composition, and the proposed specification
correction's exact authorization remain iteration prerequisites. The audit's
concurrent Plan 8 is not a published artifact. None
of these gaps prevents review of the agent plan or authorizes a consumer workaround.

## Prerequisite-review validation

The continuation refreshed the updated analysis and D10, recorded the provider
contract gaps and retained the direct docs decision. It added iteration 0's
incomplete receipt, the incomplete provider receipt and selected read-only
baseline evidence. Runtime implementation and acceptance remain unstarted.

Rechecked all local document links/anchors, manifest dependency order and
acceptance coverage, JSON syntax, exact protected-file hashes and whitespace.
All checks passed. The five protected documents remain unchanged. The initial
planning check counts above describe that earlier snapshot; the expanded
package is validated as a whole after these additions.


## Parallel prerequisite review validation

Refreshed policy/contracts, added the provider contract review package and
released-public-API inspection, and preserved the earlier evidence as history.
Revalidated local links/anchors, JSON, serial manifest/case coverage, protected
files and whitespace. No runtime tests or full audit were needed for these
planning changes. The public ESM/grouping smoke is recorded separately and
is not runtime acceptance of P1–P5. The final pass checked 108 links, eight
serial iterations and all 37 acceptance IDs. All JSON and whitespace checks
passed. All five protected files still match HEAD and their recorded hashes;
the proposed specification hunk still matches exactly one location. No new
protected file was introduced.

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

## Consolidated plan, 2026-10-07

Dan requested one expanded Plan 21. The current package has eleven serial
iterations, 0–10. Existing adoption/scope/hook work remains; the former unstarted
scope-certification iteration is replaced by architect declarations, scenario
responsibility, delegation handback and clarification/recovery. Audit delivery
and final qualification move to 9/10. Old provider snapshots and iteration 0
witnesses retain their original identities and are not new passing evidence.

The current requirements withdraw P4 assignment/scenario certification, retain
P3's public configuration question, and require only demonstrated configured
execution/dirty-diagnostic gaps to obtain provider extensions. Exact declaration,
feature-eligibility and continuation contracts remain iteration 0 work.
Protected wording is a proposal, not an applied patch or general authorization.

The five protected documents were captured before consolidation, including
Dan's current audit-responsibility edit. Current protected-file baseline:

| File | SHA-256 |
| --- | --- |
| `docs/check-findings.principles.md` | `6c72c2175de7ecbe3e0746cba469fac7a9051a47c529b3769d11f6b7107bbfea` |
| `docs/check-findings.spec.md` | `ad0c9df605cd60385775c676a7920fbd7865857f84fe02b721b475e2c3c132df` |
| `docs/harness.principles.md` | `d8b71a12a895f16440a04ec5066c4fa6bb6fb0d15dca09cdc1e3855217105dc4` |
| `docs/harness.spec.md` | `db638c263346d95dd0a637c6265c7272294f34b5a44f87f044d6bb2469192f06` (pre-authorization; `f3635d7e25b8b6d175e543197be9c7d12356048f92266fbf1c5df6431ff948bc` after the scope hunks applied 2026-10-07) |

Consolidated planning validation passed: 25 Markdown documents, 264 local
links/anchors, eleven serial manifest entries and all 54 acceptance IDs covered.
JSON syntax and whitespace checks passed. All five protected files, including
Dan's principles edit, and all four evidence JSON snapshots match the captured
pre-consolidation hashes. Source files and dependency pins were not edited.
No runtime tests or audit were run for this planning-only revision; these checks
do not mark any implementation acceptance case passing. Iteration 0's remaining
public/protocol witnesses and exact patch review are explicit prerequisites.

## Review corrections, 2026-10-07

A review of the consolidated package against the published 0.7.0 entry, the
Ramify 0.4.0 CLI contract and the live protected documents led to these
document corrections; no runtime source, pin or protected file was changed:

- The protected wording proposal now lists the two scope hunks of the
  specification's "Every Agent Scope Is a Cut" section, which still used the
  refused `owned-ignored` kind, and the acceptance principle whose disposition
  needs Dan's decision. The manifest names them as prerequisites of
  iterations 3 and 6.
- Iteration 0 commits the planning package before recording its baseline, and
  its exit criteria are split into a provider track gating iteration 1 and a
  responsibility track gating iteration 5.
- The main plan and execution document state the enablement mechanism: the
  branch stays unmerged and the new policy identity is valid only at
  iteration 11 (renumbered from 10 by the later split below).
- The provider contract review records the published 0.7.0 export inventory
  and confirms P3 is still internal there.
- Two superseded sentences in source state and the provider receipt are
  annotated inline; the fixture table lists F5 before F6.

Revalidated 137 local links and anchors, manifest JSON and whitespace; all
pass. Dan decided on 2026-10-07 that iteration 0 obtains the ramify-audit release
exposing P3 and iteration 1 bumps the pins once; the main plan, provider
requirements, manifest and iteration 0–2 briefs record it. Dan also accepted
and authorized the acceptance-principle clarification in the
[protected wording proposal](protected-wording-proposal.md#principle-needing-dans-decision);
it is applied, so `docs/harness.principles.md` now hashes to
`263cbe26589c9501f6a1bac37ccb2c7dc8b93d83a7cc182cf3f4d25e8b082695` and the iteration 6 prerequisite is removed.
Dan also chose on 2026-10-07 to split audit delivery: iteration 9 covers
configured execution and applicable reuse, iteration 10 nested verification,
recovery and projections, and integration acceptance is iteration 11; the
manifest, briefs, main plan, execution document and acceptance witness column
are renumbered. The package now has twelve serial iterations, 0–11.
Dan chose a new branch and worktree: the package and his principles edit
now live uncommitted in `/home/app/ramify-plan21-project-boundary-adoption`
on `feat/plan21-project-boundary-adoption`, branched from `4b012356`; the
execution document names them. No review decision remains open.

## Lifecycle review, 2026-10-07

Dan reviewed the engineer lifecycle against the plan and decided:

- The harness runs the gate audit, and a failed audit continues the kept
  engineer session with the gate's digest, as the plan already specifies. An
  engineer-run audit tool relying on exact-tree reuse was considered and
  rejected: a second trigger and a reuse dependency for no gain. Reviews stay
  sequential after a passing gate.
- A completion proposal must declare every scenario its assignment names;
  a missing one is a rejected submission under the existing per-turn bound,
  before any commit, audit or review, and partial work stays exempt. This is
  new case PB3-D11 in iteration 6 and a contract in section 10.
- `run_scope_tests` and the `scopedTests` timeout go; the briefing names the
  scenarios to bind and the assigned owners' test areas as text, named focused
  runs stay, and the audit answers for the rest. This is new case PB3-T07 in
  iteration 9.
- The harness requests no dirty audit, so P4 shrinks to configured committed
  execution; the dirty witnesses leave PB3-T06, the P4 review table, the
  provider requirements and receipt, and iterations 0 and 9.

The matrix now has 56 acceptance IDs. No protected file or pin changed.

## Obligation lifecycle, 2026-10-07

Dan accepted three of the earlier simplification proposals, revised in review:

- Every registered obligation is `pending`, `bound` or `done`, each entered by
  one accepted submission. The engineer's binding names the fakes it relies
  on; the architect's done report is accepted whatever that list says and is
  revisable. `declared`, `implemented`, the open-requirement derivation and
  every automatic transition go. New case PB3-D12, iteration 6; the principle
  already says "bound, not done", so no protected edit is needed.
- A completion or handback request missing a done report is a rejected
  submission naming the IDs under the existing per-turn bound; the
  clarification continuation goes. Section 11, iteration 8 and PB3-C01–C05
  are rewritten.
- An integration work item is due when every sub-scenario is `done`; PB3-D07.

The matrix now has 57 acceptance IDs. The remaining proposals 3 and 5–10 are
still undecided.

## Further proposals, 2026-10-07

Dan accepted proposals 3, 5 and 6; proposal 9 is withdrawn (see below):

- Scenarios are ordinary configured checks: the committed audit definition
  declares the Cucumber commands and the `not @ramify-pending` profile; the
  harness scenario check, its modes, selection table, identity-tag selection,
  written profiles and the `acceptance` configuration section go. Feature
  files, tags and records stay. PB3-T08, iteration 9. Accepted cost: step
  isolation per module is the project's Cucumber configuration and
  `expose-test`, not a harness run property.
- One `included` list of whole trees with reason and instructions; kind and
  owner derive from the ownership answer. PB3-S09, iteration 3.
- Readiness is one full audit request of HEAD, reused when applicable; the
  readiness executor goes. PB3-P05, iteration 2.
- Proposal 9 (drop assignment extras except bootstrap) rested on the claim
  that the contract workflow using them is historical. It is not: the
  service's contract iteration still builds contract, conformance, fake,
  fake-injection and exposure-declaration extras for a live capability
  agreement. The plan keeps those extras and removes only `outside-modules`,
  as section 1 already says.

The matrix now has 60 acceptance IDs.

Dan then accepted proposal 7 as well: the per-example capability coverage
record with its three states and evidence arrays goes; examples stay as
immutable request context and handback is the architect's report. Section 10,
iteration 7 and PB3-D08 record it. Proposals 8 and 10 remain undecided.

Proposal 8, guarding the files the committed audit definition names instead
of the harness's hard-coded list, is deferred to the sealed-files feature
(Dan, 2026-10-07): the seal set and the guarded set are defined together
there, and Plan 21 keeps the current list. Only proposal 10 remains open.

Dan accepted proposal 10 on 2026-10-07: a run under an earlier policy is
refused outright by version, and the historical readers and decoders go with
the policy bump. Section 3, the execution document, iterations 3, 5, 7, 9
and 11 and cases PB3-R01/D05 record it. Dan also authorized the two scope
hunks of the specification with the new naming; they are applied, with the
second adapted to the single `included` list, as the
[protected wording proposal](protected-wording-proposal.md#proposed-scope-hunks)
records with the new hash. The iteration 3 prerequisite
`protected-scope-patch-authorization` is satisfied and removed from the
manifest. No proposal remains open.

Review feedback, 2026-10-07, three points, all valid and fixed: readiness
still runs the declared preparation in the working tree before its full audit
request, since reused or isolated provider execution leaves no setup outputs
there (section 5, iteration 2, PB3-P05 with a reuse-over-missing-outputs
witness); a binding declaration for a `done` obligation records its fakes
list and leaves `done`, with only the architect's revision moving it back
(section 10, iteration 6, PB3-D12); and iteration 0 has one serial gate for
both tracks, matching the manifest (iteration 0 exit criteria, main plan
rows 0 and 1, iteration 1 prerequisites).
