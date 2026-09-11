<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 1 results: Contract package, probes and review points

**Date:** 2026-09-11. **Outcome:** review package revised; all five Linux probes and required static verification passed. Architecture acceptance of the concrete contract revisions is pending. No I2 acceptance instance executed and no resident owner was implemented.

## Scope and review outcome

Work was performed only in `/tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification`, on `workflow/iteration-2-resident-verification`, starting from `b6f9c0447ccd73fab819aca840b10e362715b968`. The starting worktree was clean.

Read CLAUDE.md, the implementation/planning skills and development guides, the complete review package, relevant architecture/model sections, and Plan 1's implemented interfaces, probe record and handoff. Prepared the nested example and site dependencies with `npm run worktree:prepare`.

The four package documents now record the review revision and explicitly pending architecture acceptance. The main plan records RP-1/RP-3 confirmations, the choices for RP-2/RP-4–RP-8, the three required scheduling decisions, and the decision to keep iteration 9 together. [probes.md](../probes.md) contains the complete review findings, platform limitations, commands and stage split.

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

The checklist's functionalRequirementsSatisfied is false solely because the requested accepted-contract outcome has not yet been established. newCodeCoveredByTests and allNewTestsPass are true for the executable probe assertions; there are no new owner regression tests. All executable and document work needed to make the review concrete is complete.

## Recommendations for Next Iteration

Iteration 2 may build from the revised 176-instance draft inventory. Do not begin iteration 3 until the revised contracts, scope, owners and inventory receive architecture acceptance. Implement the exact corrected signatures and activation slices after that decision. Add macOS process evidence when a macOS runner exists; Linux probe success does not establish it. Preserve the five raw archives as inputs to iteration 13, and keep actual resident acceptance separate from probe feasibility.
