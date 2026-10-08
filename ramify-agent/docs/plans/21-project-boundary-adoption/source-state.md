# Inspected source and predecessor evidence

> **Consolidation note, 2026-10-07:** the initial inspection below is historical.
> The current responsibility boundary and twelve-iteration schedule are in
> [contracts](contracts.md) and [main plan](main-plan.md). The three-kind amendment
> supersedes old owned-ignored fixture statements. The former assignment scope
> certification consequence is replaced by configured test health and architect
> reports; historical observations are not new prerequisites.

**Historical record:** the inspection below retains its original evidence.
The [three-kind amendment](#three-kind-amendment-2026-10-06) at the end states
the current adoption contract.

Inspected on 2026-10-06 in
`/tmp/ramify-plan20-project-boundary-preparation`, branch
`feat/plan20-project-boundary-preparation`, clean before plan creation at
`d1497178f1e3733d92b2c4c0ab613e37961e5256`. The branch was 59 commits ahead of
its local origin tracking ref; that is not a live remote synchronization check.
The main `/ramify` checkout is preserved.

The agent pins `ramify.ts` 0.1.0 and `ramify-audit` 0.3.2. The newer toolkit
merged into the enclosing repository does not update those installed providers.
The audit repository was inspected at `a1fe29c2746717341d9f764ad0860f4fab74c1ff`,
version 0.5.0. The updated ignore-list analysis was an untracked document there;
its SHA-256 was
`f2eafe5cb6ac067e29a1c1220b53c46af8c2e1a2ee008a6e082102a9f08a7ed3`.
Refresh these facts at iteration 0 because the provider fixes run concurrently.
During authoring, untracked audit Plan 8 files appeared in that same worktree.
They record D10 and a 0.6.0 target; they are linked in provider requirements as
draft planning evidence, not a completed release.

## Completed preparation

[Plan 20 final results](../20-project-boundary-preparation/final-results.md)
and its five iteration receipts establish shared root-header recognition,
`rootDescription`, scratch setup and safety, and the fixture move to
`subs/harness/fixtures/`. The final report ref `refs/plan20/final-audit` resolves
to `7beb7e62d5c55b5066f2f3d40e81a02e362648ab`; its summary records source
`a2a4ad7d35790598f8d0b069f3aa552bdc7d2788`, producer 0.3.2, full execution,
`overall: pass` and a complete empty failure ledger. This is predecessor
evidence, not an audit of the later merged head or of this plan.

## Current consumer seams

Paths below are relative to `ramify-agent/`.

| Existing owner and entry points | Observed behavior | Plan consequence |
| --- | --- | --- |
| Root: `package.json`, `package-lock.json`, `module.ramify`, `ramify-audit.json` | Old pins; unmarked root; definition still contains `enclosingProject: "ignore"` | Update together; remove the refused key and use the adopted definition contract |
| Harness fixtures and `src/tests/helpers/root-description.ts` | Three moved fixture roots; helper defaults to `module` | Mark four committed roots and change helper default; child descriptions stay unmarked |
| Evidence: `subs/harness/subs/evidence/src/views.ts` | Architect reader requires `ramify.architect-view/1`; ordinary/testing API reader requires `ramify.api-view/1`; index has no ownership topology | Adopt actual published view formats; API-view version need not change merely because architect version changes; obtain ownership from provider output |
| Evidence: `ramify-cli.ts` | Check result is classified by exit code; no ownership query method | Preserve full payload and path dispositions; add a CLI-owned ownership query with revision identity |
| Harness: `work/scope.ts`, `work/iterations.ts`, `work/assignment.ts` | Own contents means `src/`, declaration and README; extra purpose `outside-modules`; guard has only positive roots/files | Replace source-prefix ownership; represent exclusions and explicit ignored-tree inclusions |
| Harness: `guard/write-guard.ts`, `guard/resolve-contained-path.ts` | Real-target resolution, explicit harness-only files and one target per write | Reuse containment safety; add exclusion precedence, including nonexistent targets and symlinks |
| Harness: `hooks/post-write.ts` | Old check/analysis comments and payload readers; warning suppression keyed by outside-module extras; requested paths can drive settling | Decode current disposition evidence and remove suppression; never clear findings merely because an excluded path was named |
| Harness: `checks/selection.ts`, `checks/checkpoint.ts`, `work/engineer.ts` | Filename regex walk; test-area assumptions; an outside suite runs alone | Replace with provider groups and runner discovery; preserve real explicit evidence obligations |
| Harness: `run/policy.ts`, `run/readiness.ts` | Nested manifests walked to depth five; default filename discovery; scripts infer nested test work | Use the committed audit's package preparation and required commands |
| Audit: `subs/harness/subs/audit/src/check-execution.ts` | Builds its own checks; overrides workspace preparation from dependency directories; sets `force: true`; rejects unexpected reuse | Adopt policy through public provider configuration; preserve lifecycle callbacks; consume applicable reuse faithfully |
| Audit: `focused-check.ts` | Public `dispatchCheck`, native Vitest parser and focused lock mode already used | Extend this seam; do not create a runner or parser in harness |
| Shared lifecycle: `work/`, `capability/`, `sessions/single.ts`, `run/service.ts` | Ordinary/capability execution is shared; `run-policy/6`; historical-resume guard exists | Keep parity, version changed scope/acceptance semantics, preserve historical inspection |
| Web and harness protocol | Existing gate/command/evidence projections | Add path dispositions and per-project nested results through harness contracts |

## Layout requiring care

`scripts/` becomes root auxiliary source under the updated Ramify automatically;
it does not need an invented ownership declaration. Its imports, and the web
tooling configuration's imports, must pass the actual checker. Preserve compiler
scopes and fix real access/exposure defects rather than excluding production code.

Dan defined everything under `docs/` as inert on 2026-10-06 while reviewing
this plan. That is a semantic requirement, independent of file extension.
For example, `docs/plans/03-autonomous-implementation-loop/reuse/clean-env.ts`
and `docs/spikes/module-local-cwd/live/architect-eval.mts` remain inert docs.
Use these as regression witnesses; their suffixes do not justify declaring
the tree owned-ignored or restricting ordinary owner write scope. The
prohibited `.superseded/` archive was not inspected.

Keep the three fixture projects below the harness. Do not move them again.
(Superseded: this section originally said to declare `owned-ignored
"fixtures"`; the three-kind amendment below declares each fixture root
`owned-nested-project` instead, and Ramify 0.4.0 refuses the old keyword.) The deleted
`spikes/` tree is not recreated; if it returns, it requires an explicit owner
declaration. The separate `docs/spikes/` remains inert documentation.

## Discovery used for planning

The installed 0.1.0 CLI materialized the architect view with
`node_modules/.bin/ramify materialize --view architect --root .` from the agent
directory. It reported 12 modules and 3,398 records. Metadata recorded
`ramify.architect-view/1`, measured dependencies and test references, 1,036 cut
fields and 17 dynamic titles. Those limits make absence inconclusive.
An initial invocation with `--batch` was refused; materialize in that release
does not support the flag. The successful invocation was a planning read, not
a check or acceptance run.

The generated architect map identified the existing owners above. The harness's
ordinary `src/.ramify/children/` view was searched for the evidence and audit
contracts before inspecting source. Its external catalog was absent, so no
absence claim was made. Iteration 0 refreshes each actual consumer's view before
adding cross-module access. Generated files are never edited or imported.

## Prerequisite-review continuation

The later iteration 0 review confirmed through the released audit that Plan 20's
full evidence still applies to the committed head above. See the
[iteration receipt](iterations/iteration0-results.md) for both source identities
and the exact project-specific query. This is an applicability finding, not a
new test execution. Updated provider revisions and document hashes are in the
[incomplete provider receipt](provider-receipt.md) and its snapshot; the initial
planning observations above remain historical.


The parallel prerequisite refresh is in the current
[provider receipt](provider-receipt.md) and [contract review package](provider-contract-review.md).
It supersedes the initial `/2` mismatch and external-only ignore restriction.
A public ESM inspection of released audit 0.5.0 confirmed grouping/dispatch
availability and absent configuration/discovery/comparison exports. This is
separate from the changing audit source and does not qualify 0.6.0.

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

## Responsibility seams added to Plan 21, 2026-10-07

The source inspected by the responsibility analysis is
`4b0123564b02412d1db0416b81e11416d82baaf1`. The plan package moved on
2026-10-07 to the implementation worktree
`/home/app/ramify-plan21-project-boundary-adoption/ramify-agent`, on
`feat/plan21-project-boundary-adoption` branched from that commit; the Plan 20
worktree is clean again. Source implementation is unstarted.

| Existing seam | Expanded-plan change |
| --- | --- |
| `run/service.ts::{declareScenarios,recordScenarioPasses,withdrawScenarios}` and scenario states | Responsible architect declarations replace audit-derived implementation and automatic withdrawal |
| Initial/local architect submissions and scenario records | Preserve accepted IDs, record responsible actor judgments and optional location text |
| Scenario rendering, raw report adapter and scenario findings | Explicit agent test eligibility; remove harness requirement/result matching while retaining runner diagnostics |
| Integration coordination and composition brief text | Explicit architect readiness and investigation, no generated causal verdict |
| Capability records/submissions and handback file checks | Outcome-default tracking and trusted architect reports; preserve original needs, remove evidence-to-execution and owner-file coverage gates |
| Existing continuation, ledger, invocation limits and recovery | Missing-ID rejection under the existing bound, idempotent persistent reports and current context for agent reassessment |
| Harness protocol, prompts and web projections | Separate declaration/provenance/location hints from audit execution results |

Iteration 0 refreshes these locations and freezes exact protocol timing and
ownership; no new cross-module API is assumed available by this table.
