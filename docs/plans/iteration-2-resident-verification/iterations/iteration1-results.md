<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 1 results: Contract package, probes and review points

**Date:** 2026-09-11. **Outcome:** review package revised; all five Linux probes and required static verification passed. Architecture acceptance of the concrete contract revisions is pending. No I2 acceptance instance executed and no resident owner was implemented.

## Scope and review outcome

Work was performed only in `/tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification`, on `workflow/iteration-2-resident-verification`, starting from `b6f9c0447ccd73fab819aca840b10e362715b968`. The starting worktree was clean.

Read CLAUDE.md, the implementation/planning skills and development guides, the complete review package, relevant architecture/model sections, and Plan 1's implemented interfaces, probe record and handoff. Prepared the nested example and site dependencies with `npm run worktree:prepare`.

The four package documents now record the review revision and explicitly pending architecture acceptance. The requested main-plan update was prepared with RP-1/RP-3 confirmations, choices for RP-2/RP-4–RP-8, the three required scheduling decisions, and the decision to keep iteration 9 together. Publication rejected that file as frozen; its exact proposed revision is preserved below through this managed results artifact. [probes.md](../probes.md) contains the complete review findings, platform limitations, commands and stage split.

The review corrected concrete gaps before consumers exist:

- Runtime grouping hashes the production runtime file set, so changing imported engine code changes the group even when daemon-entry.js is unchanged. Live start locks cannot be reclaimed by age alone.
- Recursive directory enumeration with pruned non-recursive watch handles avoids attaching beneath excluded subtrees. Periodic verification continues while watching is unavailable and reschedules after each completed reconciliation, including reuse.
- Invalid acquisition supplies detached sealedInputs; RetainedAnalysis explicitly retains observations and an identity without changing the Plan 1 report. Unsealed engine results carry verified false.
- Each shared-context lease preserves the caller's original invocation facts; capture sharing and revision reuse cannot substitute another caller's batch report.
- Expectations with no captured file/absence observation return unobserved-input. Status-change events gain coalesced, handshake rejection gains incompatible, and connection startup gains cancellation.
- Root R7's required contexts/fakes and connect/service vocabulary activates in iteration 5, before quick consumers; remaining client vocabulary follows in 7. Contexts remains after analysis, and all real IPC remains in 8.
- lastValid is a historical header whose report may be evicted. Cold disposal releases products; published history remains until eviction. Byte accounting is distinct from actual memory measurement.
- Root/configuration resolution may use the existing finite configuration helper to identify references-only configurations; it creates no source catalog.

Manual description review passed for daemon N1–N5 and contexts X1–X3: exact source/test paths, owned wildcards, direct-child relays, preserved original tags, required testing/dispatch profiles and foreign signature exposure paths. No declaration was installed.

Document validation confirmed 176 unique instance identities, membership in every main-plan matrix row, and the declared counts for iterations 2–14: 4/18/27/15/20/0/22/28/5/9/13/9/6. Corrections retain all identities and counts. Local links in all six review documents resolve.

## Executable probes

Each script runs with `npx tsx scripts/probes/<name>.ts` and writes its own JSON under `scripts/probes/results/`. Environment: Node v22.23.2, Linux x64, typescript 7.0.2. Every probe completed with exit 0 and all its assertions passed. These are feasibility probes, not quick, IPC, process or measurement acceptance instances from the I2 matrix.

| Probe | Evidence |
| --- | --- |
| unix-socket-framing | 1 MiB and 32 MiB JSON bodies round-trip with matching hashes through partial header/body reads. Actual 0700/0755 metadata and foreign-uid comparison exercise directory validation. Linux accepted 101 bytes and truncated a 180-byte request; the portable guard rejects both before Node. |
| fs-watch-recursive | All 100 paths in one 100 ms debounced batch. Native callback filtering still observes excluded-tree changes. The separate 57-handle pruned arrangement excludes those trees. Real missing-root ENOENT, injected ENOSPC delivery, six bounded-queue overflows and every handle's close are asserted. No callbacks follow close. No native kernel overflow is claimed. |
| atomic-record | Eight real contenders perform 160 O_EXCL-protected atomic replacements. An independent reader makes 3,539 reads across 161 versions without partial content; no critical sections overlap. A reaped contender establishes dead-pid detection. |
| detached-spawn | Detached/unreferenced child outlives its parent; a duplicate connects and exits 3 without touching the record. The child's exit hook records actual code 23; the child is absent afterward. |
| warm-recompute | Twenty full compiled in-process Plan 1 calls per workload. Every call completes all eight stages with expected owner count and no denials or coverage notes. One stable input identity per workload. Reference median 3,442.24 ms; S100 median 5,723.03 ms. |

Five named result files are archived. Their source SHA-256 values match the final scripts; all forty warm samples and the compiled pipeline/worker identities were verified. The warm worker instruments exact asserted anchors in memory only; source and dist files are unchanged. No regression, build or other probe ran concurrently with the warm measurement.

## RP-7 budget revision

The measured recompute floors are 3.442 s and 5.723 s. Source targets allow at least 1.25 times that floor and broad targets at least 1.5 times it, rounding to 0.5 s where the previous target was lower:

- Reference source edit: 4.0 s -> **4.5 s**.
- Reference broad rebuild: 5.0 s -> **5.5 s**.
- S100 8/12 s and all other latency/memory targets remain unchanged.

This is the one proposed iteration-1 revision, recorded in scope.md for architecture acceptance and binding at this iteration's exit. Parent RSS samples do not establish combined peak memory or justify a memory-budget increase. Iteration 13 must measure actual resident behavior and fail any missed target.

## Verification

Passed locally:

1. `npm run worktree:prepare`.
2. `npm run build`.
3. `npm run type-check`, including tsconfig.scripts.json. An initial failure in the framing probe's Node data-callback union was corrected with a Buffer guard; the final full type-check passed.
4. All five named probe commands. Framing and watcher probes were rerun after their final assertion changes.
5. `npx tsx scripts/validate-final-contracts.ts`: nine current owners, 151 source/resource files, 59 expanded statements, seven package entries and the existing CLI executable.
6. `npm run check:self`: completed/passed/complete coverage; nine owners, 144 source files, seven resources, 1,801 accesses, zero errors/warnings/denials/analysis limits.
7. `npx tsx scripts/reference-harness/validate.ts`: all 308 Plan 1 records, pointers and prerequisites valid; no conformance assertion ran.
8. Review-document membership/count/link validation, archive/source-identity checks, and `git diff --check`.

No Vitest/Cucumber regression, scenario coverage or sealed-file check was run locally: the execution prompt reserves those to workflow automation. Neither the full Plan 1 gate nor any Plan 2 gate is claimed executed. No application source, owner tests, harness code, declarations, dependencies or model documents changed.

## Acceptance and handoff

The iteration's alternative deliverable of a recorded review revision is present in all four documents. An explicit approval request for the concrete package and measured budgets is pending; elapsed time is not approval. Publication of this draft must not be represented as independent architecture acceptance.

The checklist's functionalRequirementsSatisfied is false because architecture acceptance is pending and the required main-plan update cannot be applied through iteration publication. newCodeCoveredByTests and allNewTestsPass are true for the executable probe assertions; there are no new owner regression tests. All executable and document work needed to make the review concrete is complete.

## Recommendations for Next Iteration

Iteration 2 may build from the revised 176-instance draft inventory. Do not begin iteration 3 until the revised contracts, scope, owners and inventory receive architecture acceptance. Implement the exact corrected signatures and activation slices after that decision. Add macOS process evidence when a macOS runner exists; Linux probe success does not establish it. Preserve the five raw archives as inputs to iteration 13, and keep actual resident acceptance separate from probe feasibility.

## Publication policy and preserved main-plan revision

Implementation commit: `dcc8309`. The first publication returned `FILE_POLICY_VIOLATION`: `main-plan.md must not be modified in iteration drafts`. This conflicts with iteration 1's explicit deliverable to record review decisions in that file. The workflow's frozen-file rule is not bypassed: only this iteration's main-plan edits were restored to the starting bytes, while their exact proposed patch is preserved here using workflow.write_iteration_results.

The four ordinary supporting documents and probes remain revised. A plan-authoring/control-plane revision must apply the main-plan patch below when the architecture package is accepted; iteration 3 must not infer acceptance from this draft's publication. No manifest, check-results, status output, workflow state, or enforcement implementation was edited to work around the rejection.

```diff
diff --git a/docs/plans/iteration-2-resident-verification/main-plan.md b/docs/plans/iteration-2-resident-verification/main-plan.md
index ce190c8..de77a39 100644
--- a/docs/plans/iteration-2-resident-verification/main-plan.md
+++ b/docs/plans/iteration-2-resident-verification/main-plan.md
@@ -3 +3,2 @@
-**Date:** 2026-09-10. **Status:** Detailed implementation plan for review,
+**Date:** 2026-09-10. **Iteration 1 review revision:** 2026-09-11.
+**Status:** Revised implementation package awaiting architecture acceptance,
@@ -12 +13,3 @@ iteration's exit. The [contracts](contracts.md), [owners](owners.md),
-its review package.
+its review package. The [probe and contract review record](probes.md) records
+the five Linux probes, concrete corrections and the single RP-7 budget revision.
+Publication of iteration 1 does not approve those contract revisions.
@@ -347 +350 @@ requirements constrain them.
-| `ProjectResolution`, `resolveProjectRoot`, `RetainedConfiguration` | project | Root climb and configuration discovery without capture; configuration-helper reuse keyed on captured dependencies including absence and directory observations. |
+| `ProjectResolution`, `resolveProjectRoot`, `RetainedConfiguration` | project | Root climb and configuration discovery without source acquisition; a short-lived configuration capture classifies references-only setups; configuration-helper reuse keyed on captured dependencies including absence and directory observations; resolution may use the finite configuration helper to classify references-only setups. |
@@ -500,0 +504 @@ to stderr instead of stdout. Resident facts reach JSON consumers through
+| Expectation path not observed in a sealed capture | `unobserved-input` | `Error [unobserved-input]: path was not captured`, exit 2; no fallback or guessed absence | `ramify.cli/1` envelope, exit 2 |
@@ -720,2 +724,2 @@ and each archiving `scripts/probes/results/<name>.json`, as Plan 1's
-| `unix-socket-framing.ts` | `results/unix-socket-framing.json` | Length-prefixed frames round-trip over a socket pair at 1 MiB and 32 MiB with partial reads; a `sun_path` over 100 bytes fails as expected; a `0700` directory with a foreign owner or group/other bits is detectable before use. |
-| `fs-watch-recursive.ts` | `results/fs-watch-recursive.json` | Recursive `fs.watch` on a reference copy delivers root-relative paths, honors the excluded subtrees, batches 100 rapid edits within the 100 ms debounce, and surfaces overflow and error events and close semantics. |
+| `unix-socket-framing.ts` | `results/unix-socket-framing.json` | Length-prefixed frames round-trip over a socket pair at 1 MiB and 32 MiB with partial reads; the portable guard rejects paths over 100 bytes before Node (raw OS acceptance/truncation is recorded); a `0700` directory with a foreign owner or group/other bits is detectable before use. |
+| `fs-watch-recursive.ts` | `results/fs-watch-recursive.json` | Recursive `fs.watch` on a reference copy delivers root-relative paths, demonstrates callback filtering versus truly pruned per-directory watches, batches 100 rapid edits within the 100 ms debounce, and records bounded-queue overflow, injected errors, real missing-root failure and close semantics separately from unobservable kernel loss. |
@@ -815,8 +819,13 @@ Review points for iteration 1, each with the recommended choice:
-| RP-1 | JSON output of `ramify check` | (a) bare `ramify.analysis/1` in both modes, resident facts only in the human `Mode:` line, the `watch` lines and `daemon status`; (b) a wrapping envelope document in both modes; (c) an additive `resident` member inside `ramify.analysis/1` | Decided in this revision: (a). Plan 1's `scripts/reference-harness/cli-cases.ts` (I1-26) and `self-cases.ts` compare the compiled `ramify check --format json` document with the API report by deep equality after removing only `runId`, and every compiled run asserts empty stderr; an envelope or an additional member would fail I2-30 `plan1-regression`, whose records harness item 1 leaves untouched apart from the two tree-shape expectations. The sealed [invocation contract](../../architecture/cli-invocation.spec.md#output-and-exit) and every other consumer (`src/tests/batch-cli.test.ts`, `relocation.ts`, `gate-cases.ts`) read named members and are unaffected either way. Plan 3 defines revision-qualified JSON for its own commands. |
-| RP-2 | Compiler state across revisions | (a) defer, reuse stage products keyed on inputs; (b) keep one long-lived helper snapshot per context | (a): the helper contract is one-shot and its close guarantees are weak; revisit when iteration 13 misses the source-edit target. |
-| RP-3 | Terminating `check` when the daemon is explicitly stopped mid-flight | (a) exit 2 `stopped`; (b) visible batch fallback | Decided in this revision: (a). The architecture ties in-process fallback to exhausted automatic recovery and makes an explicit stop a user decision that existing clients report as stopped; the `check` prints `Error [stopped]: …` and exits 2 with no fallback. |
-| RP-4 | Daemon grouping | (a) one daemon per user; (b) one per user and installation | (b): concurrent checkouts and rebuilt `dist/` never fight; the old group idles out. |
-| RP-5 | Watching `node_modules` | (a) recursive watch of everything; (b) exclude dependency trees, rehash on synchronized captures, verify every 60 s | (b): recursive watches of dependency trees are expensive and unreliable; synchronized correctness does not depend on the watcher. |
-| RP-6 | Concurrent analyses | (a) one per context; (b) one per daemon | (b): each analysis spawns compiler helpers with a measured 480 MiB combined peak; raise it only with two-helper-set measurements. |
-| RP-7 | Provisional latency and memory targets | Fix them now, or after the iteration 1 probe | Revise them once from the warm-recompute probe in iteration 1; they are binding from iteration 1's exit, iteration 13 asserts them and records the measured values, and a missed target is a reviewed revision of scope.md, never a relaxed assertion. |
-| RP-8 | `watch` exit on SIGINT | 0 or 130 | 130: the invocation contract defines it as interruption with no claimed result, and scripts can distinguish it from failure. |
+| RP-1 | JSON output of `ramify check` | (a) bare `ramify.analysis/1` in both modes, resident facts only in the human `Mode:` line, the `watch` lines and `daemon status`; (b) a wrapping envelope document in both modes; (c) an additive `resident` member inside `ramify.analysis/1` | Confirmed in iteration 1: (a), unchanged. Plan 1's `scripts/reference-harness/cli-cases.ts` (I1-26) and `self-cases.ts` compare the compiled `ramify check --format json` document with the API report by deep equality after removing only `runId`, and every compiled run asserts empty stderr; an envelope or an additional member would fail I2-30 `plan1-regression`, whose records harness item 1 leaves untouched apart from the two tree-shape expectations. The sealed [invocation contract](../../architecture/cli-invocation.spec.md#output-and-exit) and every other consumer (`src/tests/batch-cli.test.ts`, `relocation.ts`, `gate-cases.ts`) read named members and are unaffected either way. Plan 3 defines revision-qualified JSON for its own commands. |
+| RP-2 | Compiler state across revisions | (a) defer, reuse stage products keyed on inputs; (b) keep one long-lived helper snapshot per context | Iteration 1 choice: (a). Measured floors 3.442 s / 5.723 s support revised targets; helpers remain finite. Revisit only through a reviewed contract if iteration 13 misses the source-edit target. |
+| RP-3 | Terminating `check` when the daemon is explicitly stopped mid-flight | (a) exit 2 `stopped`; (b) visible batch fallback | Confirmed in iteration 1: (a), unchanged. The architecture ties in-process fallback to exhausted automatic recovery and makes an explicit stop a user decision that existing clients report as stopped; the `check` prints `Error [stopped]: …` and exits 2 with no fallback. |
+| RP-4 | Daemon grouping | (a) one daemon per user; (b) one per user and installation | Iteration 1 choice: (b). Hash the entire production runtime file set, not only the entry, so a rebuilt engine changes groups; the old group idles out. |
+| RP-5 | Watching `node_modules` | (a) recursive watch of everything; (b) exclude dependency trees, rehash on synchronized captures, verify every 60 s | Iteration 1 choice: (b). Use recursive enumeration with pruned non-recursive handles; callback filtering still watches excluded trees. Verify every 60 s even while the watcher is unavailable. |
+| RP-6 | Concurrent analyses | (a) one per context; (b) one per daemon | Iteration 1 choice: (b), one analysis per daemon. Keep batch-derived peak ceilings; the recompute probe is not a two-helper-set memory measurement. |
+| RP-7 | Provisional latency and memory targets | Fix them now, or after the iteration 1 probe | Iteration 1 revision: reference source 4.5 s and broad 5.5 s, from the 3.442 s / 5.723 s recompute medians; other latency and memory targets retained. scope.md records the formula and values, binding from iteration 1 exit subject to package acceptance. Iteration 13 asserts them without silent relaxation. |
+| RP-8 | `watch` exit on SIGINT | 0 or 130 | Iteration 1 choice: 130, preserving the invocation contract and distinguishing interruption from failure. |
+| Schedule-1 | Contexts prerequisites | Iteration 4 after 3, or parallel | Confirmed: 4 follows 3; its port consumes the real analysis/project types. |
+| Schedule-2 | Codec and connect vocabulary | Message codec in 5, or all codec work in 7 | Confirmed: message codec and connect vocabulary in 5, framing/discovery/client in 7. Corrected root R7 activation: contexts/fakes and connect/service slices in 5, remaining client slice in 7. |
+| Schedule-3 | Socket host and IPC evidence | Host in 8, or earlier socket tests | Confirmed: `startDaemon`, host and every IPC instance in 8, after the client. |
+| Schedule-4 | Iteration 9 size | Keep commands and migration together, or split | Keep together: the migration is mechanical and the same iteration must prove the unchanged batch surface; no iteration or matrix renumbering. |
+| Review-1 | Corrections beyond RP-1–RP-8 | Revised package or implement the original contradictions | Revised package: sealed invalid inputs, request-specific report facts, expectation coverage, coalescing/error vocabulary, staged relays, whole-runtime identity, live-lock preservation and cold retention are specified in contracts.md and scope.md. Architecture acceptance is still required before iteration 3. |
```
