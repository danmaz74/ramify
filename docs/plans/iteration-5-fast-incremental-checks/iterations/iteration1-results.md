<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 1 results: Contract package, probes and review points

**Date:** 2026-09-11. **Outcome:** review package revised; five Linux probes executed and archived; RP-1 to RP-7 and the schedule recorded. RP-4 and RP-6 are **proposed, awaiting the user's acceptance**, which this non-interactive session could not obtain. No I5 acceptance instance ran and no owner source, harness, daemon code or model document changed. A single remediation attempt ([below](#single-self-assessment-remediation-attempt-2026-09-11)) confirmed that the two remaining items require the user.

## Scope and execution

Work was performed only in `/tmp/worktrees/ramify-67e9dd0f/iteration-5-fast-incremental-checks` on `workflow/iteration-5-fast-incremental-checks`, from `5661e55` with a clean tree. Implementation research, probes and document revisions were delegated to Codex in two passes (the review and probes, then a follow-up for the frozen main plan and archive size); the coordinator reviewed the reports, diffs and ledgers and owns these artifacts, the commit and publication.

[probes.md](../probes.md) is the full record: environment, fixture identities, per-probe method and limits, the review table for each package document, the RP-1 to RP-7 and scheduling table, the budget revision, the verification ledger and SHA-256 of every probe script and archive.

## Review outcome

| Document | Outcome |
| --- | --- |
| [contracts.md](../contracts.md) | Draft → reviewed and revised; all eight proposed-contract rows reviewed. Compiler-bearing constructors stay private behind plain-data factories; explicit probe observations in the sink; exact historical report lifetime and release; invalid publication; per-lease invocation facts on synchronized updates; model position refresh; covering freshness (a nonempty covered delta request uses the coherent revision with `captureStarted: null`); complete CLI reasons, warnings and coverage. `InventoryUpdate` gains `incomplete`. |
| [owners.md](../owners.md) | Manual declaration review passed with revisions: six added exposure lines, one removed increment line and five revised relay lists checked against the module-description principles and the eleven real declarations (all eleven expanded texts parse with the production parser); A7/root activation prose and explicit CLI foreign-type paths corrected. |
| [scope.md](../scope.md) | Revised: merged observation recipe (acquisition plus compiler callbacks), covering freshness, server loss, historical retention, effective worker-heap enforcement, process versus compiler memory accounting, and the one budget revision below. |
| [subcases.md](../subcases.md) | Revised; all 103 instance IDs preserved. Counts per iteration 2–13 validated as 10/7/8/7/10/11/8/13/9/5/9/6. Corrected expectations: toolkit baseline 2,744 accesses (not 2,746), snapshot overlap, forwarding-chain reach, renamed binding identity, type/value flags, deadlines, unavailable-start fixtures, history and advisory memory. |

Each document's status line records the review revision and that RP-4 and RP-6 await the user's acceptance; none claims independent acceptance.

## Review points and scheduling

| ID | Recorded entry |
| --- | --- |
| RP-1 | Confirmed: Plan 5 before Plan 3; not reopened. |
| RP-2 | Selected: worker thread with `resourceLimits` when its effective heap limit is enforceable; the child process is the required fallback behind the same contract when inherited V8 flags override it (P5-4). |
| RP-3 | Selected: dependency-driven recomputation over the closure (P5-2). |
| RP-4 | **Proposed (recommended alternative), awaiting the user's acceptance:** retire the Plan 2 reuse instances by amendment; iteration 9 lands deletion and amendment together. |
| RP-5 | Selected: observe the compiler's reads **merged with acquisition** so the session's `inputId` equals a batch capture's (P5-5). Compiler callbacks alone are insufficient. |
| RP-6 | **Proposed (recommended alternative), awaiting the user's acceptance:** reference and S100 hook targets binding from iteration 12's exit; S500, S1000 and memory rows advisory. |
| RP-7 | Confirmed: two hot contexts and a 30 s sweep; multi-context memory and sweep cost remain for iteration 12 to record. |
| Schedule | Confirmed unchanged: 3 and 4 in parallel after 2; 11 and 12 in parallel after 10; 4 needs only 2; 5 needs 3 and 4; 6 needs 4 and 5; only iteration 9 deletes Plan 2 source, with the supersession amendment in the same commit. No iteration file or manifest changed. |

## Probes

Linux x64, Node v22.23.2, typescript@7.0.2; fixtures R (`examples/collection-review`, 15 owners), T (toolkit, 11 owners, 229 sources), S100 and S1000 materialized under the gitignored `.reference-work/`. S500 was not measured. Archives: `scripts/probes/results/{snapshot-update-costs,description-closure,interpreter-setup,worker-session,observed-reads}.json`, each under 102 KB; bulky per-file detail is written to ignored `.reference-work/probe-details/` with its path and hash recorded in the archive.

- **P5-1 snapshot updates** (median ms, R / S100 / S1000): body edit 0.88 / 1.05 / 13.07; added import 147.77 / 143.69 / 1,476.66; created file with regenerated roots 144.92 / 146.79 / 1,537.54; `invalidateAll` 276.98 / 213.26 / 1,955.00. An unreferenced created file needs configuration regeneration to enter the program; a file imported by an existing source enters through resolution without it. S1000 import and configuration costs far exceed the spike's 65–133 ms small-fixture figure.
- **P5-2 description closures:** star/forwarding/namespace edges R 0/1/0, T 13/54/0, S100 and S1000 none; median / largest reverse closure R 1/2, T 1/5, S100 1/1, S1000 1/1. Supports RP-3; namespace, shim, absence and ambiguity propagation still need I5-03's own witnesses.
- **P5-3 interpreter setup** (S1000, probe-local prototype via a load hook, no source edit): per-call setup 45.27 ms, complete one-file call 47.70 ms, hoisted call 0.93 ms with equal outputs over twenty pairs. The unchanged-surface budgets depend on iteration 2 removing project-sized setup from each call.
- **P5-4 worker hosting:** S1000 cold worker work 21.51 s median; max main-thread timer gap 73.48 ms; a report-sized (78.46 MiB) structured clone takes 1,013 ms median, so whole reports stay on demand. **Contradiction found:** the inherited `NODE_OPTIONS=--max-old-space-size=8192` overrides the worker's `resourceLimits` (reported 16 MiB, effective 8.6 GB heap); the first unisolated heap witness had to be stopped (exit 143). Relaunched without the flag, three workers each emit `ERR_WORKER_OUT_OF_MEMORY`. The compiler child's RSS (321–347 MiB) is outside worker limits. Hence RP-2's conditional wording.
- **P5-5 observed reads:** merged acquisition plus compiler observations equal the batch capture by path, role, identity, bytes and `inputId` in 3/3 trials on R (3,549 inputs) and S100 (2,367). Callbacks alone miss 2 (R) and 1 (S100) inputs and differ in 90 and 1,401 entries (roles, exact-name evidence). All differences are archived exactly.

## Budget revision

The single revision in [scope.md](../scope.md#budgets): R source edit changing imports or exports 200 → **250 ms**; R created or deleted owned file 400 → **600 ms**; advisory S1000 source edit 2 → **3 s**. Other targets and the session defaults (two hot contexts, 30 s sweep, 2 s request deadline, 512 MiB effective worker heap, 96 MiB retained facts) remain, with memory accounting now separating daemon-process RSS from compiler RSS and including historical and candidate facts. The R and S100 hook rows bind from iteration 12's exit only if the user accepts RP-6.

## Files

- Revised: `contracts.md`, `owners.md`, `scope.md`, `subcases.md`; new `probes.md` (all beside the main plan).
- New probes: `scripts/probes/fast-check/{snapshot-update-costs,description-closure,interpreter-setup,worker-session,observed-reads}.mjs`, shared `p5-common.mjs`, and `review-package.mjs` (validates the 103 IDs, matrix and count agreement and the declaration texts); five result archives.
- Brought verbatim from `spike/fast-check-retained-session` so the cited evidence resolves: the throwaway probes `scripts/probes/fast-check/{stage-timing,decide-timing,warm-compiler-stages,warm-compiler-cycles,worker-thread}.mjs` and README (extended with the P5 probes), and `scripts/spikes/fast-check/RESULTS.md` with its five `results/*.json`. No spike TypeScript or engine change was imported.

## Verification

Ran by Codex in the worktree (full ledger with exact commands in [probes.md](../probes.md#verification-ledger)): `npm run worktree:prepare`; `npm run type-check` (all four scopes, after the final probe edits); `npm run build`; both batch checks (reference 15 owners, 294 accesses, two warnings, no findings; toolkit 11 owners, 229 sources, 2,744 accesses, no findings); both materializations; all five probes (exit 0; P5-2, P5-4 and P5-5 rerun for compact archives with unchanged interpretation); `review-package.mjs`; `node --check` on every probe; archive and script hash checks; relative-link check; `git diff --check`. The coordinator confirmed `git apply --check --unidiff-zero` of the preserved patch against the restored main plan and `git diff --cached --check` on the commit.

Not run locally, per the check policy: `npm test`, Vitest, Cucumber, `reference:cases`, scenario coverage, sealed-file checks and the Plan 1, 2 and 5 gates.

## Open items

- **User acceptance of RP-4 and RP-6** is required before the package is accepted; this iteration's exit criterion for it is unmet, which is why the checklist reports `functionalRequirementsSatisfied: false`.
- **The preserved main-plan revision below must be applied** through a plan revision; iterations should treat the package documents and probes.md as governing where the frozen main plan differs.
- Unresolved links (unchanged): Plan 2 is still at `docs/plans/iteration-2-resident-verification/`, so the plan's `../done/iteration-2-resident-verification/...` links do not yet resolve; `docs/analysis/fast-incremental-checks-retained-session.md` exists only on the spike branch and `docs/analysis/fast-incremental-checks.md` on no available branch.
- macOS probe runs are pending; P5-4's memory collection uses Linux `/proc`.

## Recommendations for Next Iteration

- Iteration 8's worker host must verify the **effective** heap limit (`v8.getHeapStatistics().heap_size_limit`), not only `resourceLimits`, and fall back to the child process when inherited V8 flags override it; it must also clean up the compiler child after a worker OOM (not covered by P5-4).
- Iteration 2 must actually hoist interpreter setup out of each call; P5-3 shows setup is ~95% of a one-file call at S1000.
- Iterations 4 and 5 must implement merged acquisition-plus-compiler observation under concurrent change; P5-5 establishes equality only for a quiescent replay.
- Iteration 12 should measure compact revision clone cost, two-hot/six-warm memory and the 200-cycle plateau, none of which the probes established.

## Single self-assessment remediation attempt (2026-09-11)

This is the one focused attempt requested after output validation found `functionalRequirementsSatisfied` false. Re-reading the iteration's goal, deliverables and exit criteria confirms that every executable and document deliverable is present; the remaining gaps are two decisions that belong to the user, not missing implementation. The original instructions delegate implementation to Codex, but there is no source, test or probe work to delegate: no failing test, missing probe or incomplete document section exists.

Checks made in this attempt:

- Live workflow detail reports iteration 1 at `validate_output_retry`, `reviewEachIteration: false`, and records no user decision on RP-4 or RP-6. No acceptance was supplied with the remediation request.
- `main-plan.md` is byte-identical to `HEAD`; `git apply --check --unidiff-zero` of the preserved patch below still succeeds.
- The only working-tree change before this attempt was publication-generated provenance metadata in `iteration1-checklist.json` (`mcpTool` set by publication); rewriting the checklist through its owning MCP tool replaces it.

Why the two items stay open:

1. **RP-4 and RP-6.** The iteration itself states they "need the user's acceptance and are not settled by this iteration alone". Recording acceptance without it would misrepresent the plan's authority, so both remain "proposed, awaiting the user's acceptance".
2. **Decisions in `main-plan.md`.** Publication rejects main-plan edits in iteration drafts, and none of the available workflow tools revises the active plan. No file policy was bypassed, and no manifest, status output, workflow state or approval was fabricated.

No application, probe, fixture or document content changed in this attempt, so no probe or static check was rerun; the earlier passing evidence applies to unchanged bytes.

| Check | State | Reason |
| --- | --- | --- |
| functionalRequirementsSatisfied | false | RP-4 and RP-6 lack the user's acceptance, and the frozen main plan cannot carry the decision table through an iteration draft. |
| newCodeCoveredByTests | true | The probe scripts' own assertions ran and passed; no owner code was added. |
| allNewTestsPass | true | All five probes and the document validator pass on the committed bytes; no regression pass is claimed. |

**Reviewable resolution:** the user accepts (or revises) RP-4 and RP-6 and has the patch below applied through a plan revision before iteration 3. Alternatively, the user explicitly accepts [probes.md](../probes.md) and these results as the authoritative location of the review decisions. Neither decision is inferred here. Iteration 2 can start from the revised package as drafted, since only iteration 9 depends on RP-4 and only iteration 12 on RP-6.

## Publication policy and preserved main-plan revision

`main-plan.md` is frozen in iteration drafts (Plan 2's iteration 1 publication was rejected with `FILE_POLICY_VIOLATION: main-plan.md must not be modified in iteration drafts`). This iteration's main-plan edits were therefore restored to their starting bytes, and the exact requested revision is preserved here as a zero-context patch. It applies cleanly with `git apply --unidiff-zero` to the current main plan and must be applied by a plan revision once the user accepts RP-4 and RP-6. No manifest, status output or workflow state was edited to work around the rule.

```diff
diff --git a/docs/plans/iteration-5-fast-incremental-checks/main-plan.md b/docs/plans/iteration-5-fast-incremental-checks/main-plan.md
index f40fd88..264f76b 100644
--- a/docs/plans/iteration-5-fast-incremental-checks/main-plan.md
+++ b/docs/plans/iteration-5-fast-incremental-checks/main-plan.md
@@ -3 +3,2 @@
-**Date:** 2026-09-11. **Status:** Detailed implementation plan for review,
+**Date:** 2026-09-11. **Status:** Iteration 1 review revisions recorded; RP-4 and RP-6 await the
+user's acceptance,
@@ -9,2 +10,2 @@ the [spike results](../../../scripts/spikes/fast-check/RESULTS.md) recorded on
-branch `spike/fast-check-retained-session`. No retained session, hook command
-or passing Plan 5 evidence is established by this document. The plan runs as
+branch `spike/fast-check-retained-session`. The [iteration 1 probes](probes.md) establish component feasibility only.
+No retained session, hook command or passing Plan 5 acceptance evidence is established by this document. The plan runs as
@@ -222,2 +223,3 @@ branch `docs/roadmap-fast-incremental-checks` at `a68b356`, which merges
-- A child-process session host. The worker thread is the decided host; the
-  session contract does not change if measurements later require a process.
+- A child-process session host. The worker thread is selected when its effective heap limit is
+  enforceable; P5-4 requires a child-process fallback when inherited V8 flags
+  override it. The session contract stays the same.
@@ -254 +256 @@ source file of `analysis`, the way `compiler-helper.ts` is a source file of
-| root | The session driver in `resident-assembly.ts`; the extended service vocabulary; the `ramify.check/1` document type; document revisions. |
+| root | The session driver in `resident-assembly.ts`; the extended service vocabulary; document revisions. |
@@ -317,2 +319,2 @@ constrain them.
-| `observeProject`, `ProjectObserver`, `InventoryUpdate`, `ObservationSink` | project | Observed inputs by role with identities; `apply(changes)` returns a local, structural, invalid or unchanged update; `reobserve()` is the sweep; `inputId` equals `readProject`'s for the same inputs. |
-| `openRetainedSession`, `RetainedSession`, `SessionChange`, `SessionRevision`, `CheckedSet`, `FindingDelta`, `RevisionTimings`, `SessionUpdate`, `VerifyOutcome`, `SessionStatus`, `SessionLimits` | analysis | Frozen plain-data revisions; the four paths and their checked sets; deltas by diagnostic identity; the audit; deadlines; compiler release; the worker boundary invisible to callers. |
+| `observeProject`, `ProjectObserver`, `InventoryUpdate`, `ObservationSink` | project | Observed inputs by role with identities; `apply(changes)` returns a local, structural, invalid, incomplete or unchanged update; `reobserve()` is the sweep; `inputId` equals `readProject`'s for the same inputs. |
+| `openRetainedSession`, `RetainedSession`, `SessionChange`, `SessionRevision`, `CheckedSet`, `FindingDelta`, `RevisionTimings`, `SessionUpdate`, `VerifyOutcome`, `SessionStatus`, `SessionLimits` | analysis | Frozen plain-data revisions; the four paths and their checked sets; deltas by diagnostic identity; the audit; per-lease invocation facts on synchronized updates; exact historical reports; deadlines; compiler release; the worker boundary invisible to callers. |
@@ -375,2 +377,2 @@ in the named sections of the review package.
-8. **Budgets.** Hook latency targets on the reference and S100 are binding
-   from iteration 12's exit; S500 and S1000 targets and memory targets start
+8. **Budgets.** Hook latency targets on the reference and S100 are proposed to bind
+   from iteration 12's exit, subject to the user's acceptance of RP-6; S500 and S1000 targets and memory targets start
@@ -435 +437,4 @@ Plan 2's [guarantees](../done/iteration-2-resident-verification/scope.md#freshne
-stand. [scope.md](scope.md#observation-and-freshness) adds the covering
+stand except that a nonempty covered delta request uses the coherent
+revision directly, with `captureStarted: null`, rather than claiming a new
+capture after acknowledgment. Empty-expect plain checks still require a
+post-acknowledgment sweep. [scope.md](scope.md#observation-and-freshness) adds the covering
@@ -457 +462 @@ and are never replaced by a quick run.
-| I5-04 | DA09, DA10, DA14, ML02 | `single-live-snapshot`: the previous snapshot is disposed inside the update; `changed-file-facts-equal`: facts after `update` equal a fresh adapter's; `created-deleted-configuration`: the owned file list and synthetic configuration regenerate and the program membership follows; `invalidate-all`; `observed-reads-complete`: the sink's observations equal the batch capture's inputs by path, role and identity; `server-loss-explicit`: killing the server yields an explicit failure, never stale facts; `release-and-rebuild`: after `releaseCompiler` the next update rebuilds and the facts are equal. |
+| I5-04 | DA09, DA10, DA14, ML02 | `single-live-snapshot`: one snapshot remains live between updates; the previous one is disposed during replacement; `changed-file-facts-equal`: facts after `update` equal a fresh adapter's; `created-deleted-configuration`: the owned file list and synthetic configuration regenerate and the program membership follows; `invalidate-all`; `observed-reads-complete`: the observer's merged acquisition and compiler observations equal the completed batch capture's inputs by path, role and identity; `server-loss-explicit`: killing the server yields an explicit failure, never stale facts; `release-and-rebuild`: after `releaseCompiler` the next update rebuilds and the facts are equal. |
@@ -460 +465 @@ and are never replaced by a quick run.
-| I5-07 | DA05, DA06, DA07, DA09, DA10, DA13, DA14 | `description-relink-subtree`: removing an exposure re-decides the accesses whose importer or original owner lies in the subtree, the checked set excludes others, and the expected denials appear; `description-revert`; `readme-metadata-only`: no compiler, link or decision work; `created-importing-file` and `deleted-file`: resolution-bounded re-interpretation, expected findings; `configuration-broad` and `dependency-broad`: whole re-extraction on the warm compiler, checked set is every file; `invalid-description-current` and `invalid-recovery`; `audit-equal-sequence`: `verify()` after every step of the twelve-step reference sequence reports equal; `audit-detects-drift`: an injected fact corruption is reported and the recomputed revision published. |
+| I5-07 | DA05, DA06, DA07, DA09, DA10, DA13, DA14 | `description-relink-subtree`: removing an exposure re-decides the accesses whose importer or original owner lies in the subtree, the checked set excludes others, and the expected denials appear; `description-revert`; `readme-metadata-only`: no compiler, link or decision work; `created-importing-file` and `deleted-file`: broad re-interpretation, expected findings; `configuration-broad` and `dependency-broad`: whole re-extraction on the warm compiler, checked set is every file; `invalid-description-current` and `invalid-recovery`; `audit-equal-sequence`: `verify()` after every step of the twelve-step reference sequence reports equal; `audit-detects-drift`: an injected fact corruption is reported and the recomputed revision published. |
@@ -533 +538 @@ headings. Iterations 3 and 4 may run in parallel after 2; iterations 11 and
-| 1 | Contract package, probes and review points | none | none | review only: accept contracts.md, owners.md, scope.md, subcases.md; run the five [probes](#probes); settle RP-2 to RP-7 |
+| 1 | Contract package, probes and review points | none | none | review revisions recorded in contracts.md, owners.md, scope.md, subcases.md and [probes.md](probes.md); RP-4/RP-6 await user acceptance |
@@ -555 +560,5 @@ Iteration 9 is the only iteration that deletes Plan 2 source, and it lands
-the supersession amendment in the same commit as the deletion.
+the supersession amendment in the same commit as the deletion, subject to RP-4.
+Iteration 1 confirms this schedule: 3 and 4 may run in parallel after 2;
+11 and 12 may run in parallel after 10; 4 requires only 2, 5 requires 3 and 4,
+and 6 requires 4 and 5. No probe requires a scheduling change, so the iteration
+files and workflow manifest remain unchanged.
@@ -644,7 +653,7 @@ Review points for iteration 1, each with the recommended choice:
-| RP-1 | Number and position | (a) Plan 5 before Plan 3; (b) a new number after Plan 6 | Decided in this draft: (a). |
-| RP-2 | Session host | (a) worker thread with `resourceLimits`; (b) child process | (a); P5-4 confirms responsiveness, clone cost and the heap-limit outcome; (b) stays the fallback behind the same contract. |
-| RP-3 | Per-file catalog algorithm | (a) dependency-driven recomputation over the closure with the same fixed point; (b) whole-project catalog first | (a); the spike's verdict and P5-2's closure sizes. |
-| RP-4 | Plan 2 supersession | (a) retire the reuse instances by amendment; (b) keep them executing against a compatibility shim | (a); a shim would keep the whole-project recapture alive. Needs the user's acceptance. |
-| RP-5 | Input identity | (a) observe the compiler's reads and equal batch; (b) accept a smaller observed set with a different `inputId` | (a); P5-5 establishes it. |
-| RP-6 | Binding targets | (a) hook targets on the reference and S100 binding at iteration 12; the rest advisory; (b) all advisory under Plan 2's decision | (a); the hook target is the deliverable. Needs the user's acceptance. |
-| RP-7 | Hot contexts and sweep interval | Two hot contexts and a 30 s sweep while active, or other values | Two and 30 s, revised once from P5-4 and iteration 12. |
+| RP-1 | Number and position | (a) Plan 5 before Plan 3; (b) a new number after Plan 6 | Confirmed: (a); not reopened. |
+| RP-2 | Session host | (a) worker thread with `resourceLimits`; (b) child process | Selected (a) when effective V8 limits are enforced; (b) is required fallback when inherited heap flags override them. P5-4 finds `NODE_OPTIONS=--max-old-space-size=8192` in this environment; isolated runs deliver explicit OOM and responsive cold opens. Large report clones take about 1 s and remain on demand. |
+| RP-3 | Per-file catalog algorithm | (a) dependency-driven recomputation over the closure with the same fixed point; (b) whole-project catalog first | Selected (a). P5-2 forwarding closures have median 1 on R/T/S100/S1000 and maxima 2/5/1/1. Namespace edges are absent from these fixtures; their propagation still needs independent I5-03 witnesses. |
+| RP-4 | Plan 2 supersession | (a) retire the reuse instances by amendment; (b) keep a compatibility shim | Proposed (recommended alternative), awaiting the user's acceptance: (a). Iteration 9 lands the amendment and deletion together; no user acceptance is claimed. |
+| RP-5 | Input identity | (a) observe compiler reads and equal batch; (b) accept a smaller set and different identity | Selected (a), with acquisition and capture-compatible probe semantics retained. P5-5 reproduces all 3,549 R and 2,367 S100 observations and their input IDs in three runs each. Callbacks alone miss paths and roles; they are not a replacement for acquisition. |
+| RP-6 | Binding targets | (a) R/S100 hook targets bind at iteration 12; other targets advisory; (b) all advisory | Proposed (recommended alternative), awaiting the user's acceptance: (a), using scope.md's single probe-based revision. No target is represented as user-accepted. |
+| RP-7 | Hot contexts and sweep interval | Two hot contexts and a 30 s sweep while active, or other values | Confirmed: two and 30 s. P5-4 supports isolated hosting, not a multi-context memory plateau or sweep measurement. Runtime limits remain enforced; iteration 12 records those unmeasured costs and cannot silently revise the reviewed defaults. |
@@ -656,0 +666,12 @@ an explicit plan revision.
+
+## Iteration 1 review provenance
+
+The current source and declarations contain Plan 2's resident providers and
+eight package entries; the two batch baselines pass with fifteen and eleven
+owners. The toolkit baseline has 229 source files and 2,744 accesses, two fewer
+than the planning snapshot; subcases.md now names this measured baseline. The cited `iterations/iteration14-results.md` in the current Plan 2
+directory is an older incomplete checkpoint, not evidence for the later
+remediation's completion. This iteration does not rerun the full Plan 2 gate.
+The pending directory move and missing analysis links are listed in
+[probes.md](probes.md#unresolved-context-and-follow-up). RP-4 and RP-6 remain
+user decisions; the package is revised for review, not independently accepted.
```
