<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 9 results: Contexts on retained sessions

**Date:** 2026-09-12. **Outcome:** session-based contexts, compact history and the increment-engine removal are implemented. Focused behavioral and static verification passes. The complete iteration exit is **not established**: automatic regression remains pending, and the unchanged Plan 2 measurement providers still require their iteration 12 migration before the full amended Plan 2 gate can pass. No required record, assertion or measurement was waived.

## Implemented behavior

- Each context opens and owns one retained session through the revised `AnalysisDriver.resolve/open/dispose` port. Root exports `createSessionDriver()`; assembly forwards effective context limits into the session, including smaller injected retention caps. The quick environment uses the same implementation.
- Context headers derive input fingerprints from the session observations and carry checked sets, finding delta counts and timings. Context sequence numbers remain monotonic across cold-session rebuilding.
- A nonempty delta expectation already covered by a coherent publication returns without an update or report projection. Pending influencing changes, required sweeps and different lease invocation facts prevent that shortcut. An uncovered request flushes debounce and joins the pending paths. Empty-expect synchronized report checks require acquisition or a sweep begun after acknowledgment.
- Each lease preserves its original project request and capability order. Coalescing keeps compatible invocations together and gives each acknowledged request its own outcome. Unobserved paths and superseded hashes remain explicit.
- History stores headers, diagnostics, warnings, coverage and deltas. Exact report projections stay on demand. A requested `since` revision is pinned from acknowledgment through settlement; selected report versions are pinned during projection. Eviction releases the corresponding historical worker facts. Intermediate update/sweep versions without context headers are released, and a retained-fact admission failure reclaims unpinned history before one bounded retry.
- Before cold disposal, the current report is projected and retained within the history budget. A request arriving during disposal reopens afterward. Detached reports from an old session cannot release a new session's version with the same local sequence number.
- Deadline expiry returns `cold` or `deadline-exceeded` and releases only the waiter. The update continues and can publish even when the timed-out client subsequently releases its lease. Explicit cancellation retains its separate behavior.
- Hot-context pressure demotes the least recently used compiler; idle demotion keeps warm facts before cold disposal. Contexts own periodic/required sweeps and one idle audit per revision. Audit mismatches publish the recomputed revision with cause `verify`, increment daemon counters and log the differing fields. Cleanup failures remain observable.
- Daemon revision/event validation accepts the extended headers and session status. Existing service checks still request reports by default. Plain CLI JSON remains `ramify.analysis/1`; human check/watch output reads the revision path and checked/timing fields. New wire parameters and `--changed` remain iteration 10.

## Engine removal and Plan 2 amendment

Removed `increment.ts`, `retained-products.ts`, retained variants in the batch pipeline, the six public increment types, the increment export and its tests. The named `retained-products.test.ts` did not exist in this checkout. The unrelated private TypeScript implementation class was renamed `RetainedSourceState` to avoid retaining the removed public family's name in emitted code; its behavior is unchanged.

The compiled removal witness confirms that every removed operation/type is absent from emitted JavaScript and declarations. `analyzeProject`, `createAnalysisSession`, `validateProject`, `acquireInventory`, `resolveProject` and `openRetainedSession` remain callable, and the first retained reference report equals fresh batch analysis.

The amendment is at `docs/plans/done/iteration-2-resident-verification/supersession-plan5.md`. It records **2026-09-12** authorization from the user's explicit instruction to execute iteration 9, including these ten removals. The earlier review recorded RP-4 as proposed; that historical record is preserved. The original Plan 2 package still lives at its existing non-done path; the amendment links there without relocating managed historical files.

All 176 historical I2 records remain registered. Exactly ten are marked superseded. The amended gate requires **166 I2 instances plus eight distinct I5 counterparts: 174 executions**. Superseded records are not represented as executions. Removing a historical record or counterpart record, inventing an eleventh retirement, omitting a counterpart handler, or failing its assertion prevents a passing gate. The full I5-10 witness invokes the real Plan 2 gate without recursive I5-10 composition.

## Prerequisite and integration corrections

The supplied iteration 8 heap-exhaustion teardown finding is corrected: if the 16 MiB open unexpectedly succeeds, its session is disposed in `finally`, with observation cleanup in a nested `finally`. The original failure assertions remain.

Vitest launches integration children with `NODE_OPTIONS=''` so the environment's inherited 8 GiB V8 override does not defeat the required 512 MiB worker bound. The explicit override-rejection test still supplies its own override; production preflight remains strict. The first quick witness under the inherited override returned an explicit unavailable result, preserved in its earlier receipt. Current passing witnesses use the documented clean environment.

No model rule, package entry or owner was added. Declarations and owner prose were updated with their real exports. The CLI purpose remains at its current stage in the validator rather than asserting iteration 10 behavior.

## Verification before the self-assessment repair

The following evidence was collected for implementation commit `dd6c9c6`, before the focused repair described below. It has not been rerun on the repaired source except for build and type-check.

Coherent focused receipt: `.reference-work/reports/iteration9-final-focused.json`, completed 2026-09-12T11:01:18.109Z. It records source hash `ee708242f7958f45f7e8c0b9a58b669ae800e27304918403119e7df62e44a333`, build hash `7643d6ed656f79b3646d41a65feafe158606248daf668b7946673f5e018d0861`, Node v22.23.2 and TypeScript 7.0.2. The receipt identifies the pre-commit HEAD plus dirty source bytes and checks that source/build hashes remain coherent throughout the run.

| Check | Result |
| --- | --- |
| `npm run worktree:prepare` | Completed for the example and site packages. |
| `npm run build && npm run type-check` | Pass; production build and all four TypeScript scopes, including owned tests. |
| `npx tsx scripts/validate-final-contracts.ts` | Pass: 11 owners, 271 declaration-inventory files, 82 expanded statements, eight package entries and unchanged CLI bin. |
| `NODE_OPTIONS='' node --import tsx .reference-work/iteration9-focused.mts` | All 10 I5-09 handlers plus I5-10 increment-removed pass: **11 handlers / 53 assertions**. This includes a real R quick session/batch equality witness and controlled unit witnesses; it is not the complete prerequisite gate. |
| Same focused command: amended gate controls | Four I2-28 handlers / **68 assertions**, plus **12 supersession admission assertions**, pass. These admission controls do not establish the full I5-10 plan2-gate-amended instance. |
| `NODE_OPTIONS='' node --import tsx .reference-work/iteration9-retention-check.mts` | Three additional controlled witnesses / **12 assertions** pass: cold-session sequence collision, intermediate update/sweep version release, and explicit oversized-open rejection with released facts. Receipt: `.reference-work/reports/iteration9-retention-witnesses.json`. |
| `npm run check:reference`, owned endpoint | Resident, completed, complete coverage: **15 owners, 54 source files, 294 accesses**, zero errors, two expected warnings, zero analysis limits. |
| `npm run check:self`, same owned endpoint | Resident, completed, complete coverage: **11 owners, 264 source files, 3,364 accesses**, zero errors, warnings or analysis limits. |
| Owned daemon stop and `git diff --check` | Pass. Final resident log: `.reference-work/iteration9-final-resident.log`; daemon 3078779 was explicitly stopped and the endpoint removed in finally. |

New and migrated unit suites cover session opening, covering identities, invocation changes, deadlines/disconnects, hot/warm/cold transitions, compact history/pins, retention retry and cleanup races. Root tests cover real session/batch equality, cancellation and effective worker admission. Daemon tests cover audit counters and logs. Harness regressions retain the independent Plan 2 expectations and use explicit wrappers compatible with frozen session handles.

**Not run locally under the supplied policy:** Vitest/Cucumber regression (including the new Vitest suites), scenario coverage, sealed-file checks, full Plan 1/Plan 2 gates, the full iteration 9 prerequisite gate and the two I5-10 full regression/gate handlers. Their automatic verdict is separate. Authored tests and passing selected handlers are not a claim that every new Vitest test ran.

## Focused self-assessment repair

The 2026-09-12 retry inspected the current workflow state: iteration 9 is awaiting output revalidation, with no automatic regression verdict yet. The two false checklist flags cannot be replaced by a passing-test claim from that state.

The review found a concrete exception-delivery defect in `context-manager.ts`. A published reader waiting for the first revision stays in the context queue rather than the synchronized request batch. If the background `driver.open` threw or rejected, the catch branch completed only that batch, leaving the reader waiting indefinitely with no publication or explicit failure.

The catch branch now completes queued published readers with `analysis-failed` as well. Cancelled requests keep their original outcome; no failed revision is published. The context remains reconciling and a later synchronized request can reopen successfully. The change is confined to the contexts implementation and its existing session-driver test suite.

Two new parameterized tests retain the independent failure, cancellation, recovery and teardown expectations. Their equivalent focused reproduction uses the real manager with the existing scripted driver and controlled ports. It does not invoke Vitest or the reserved regression checks.

| Repair verification | Result |
| --- | --- |
| `NODE_OPTIONS='' node --import tsx .reference-work/iteration9-open-failure-check.mts before` | Both cases fail for the defect: neither waiting reader receives an outcome after the open fails. Receipt: `.reference-work/reports/iteration9-open-failure-before.json`. |
| `NODE_OPTIONS='' node --import tsx .reference-work/iteration9-open-failure-check.mts after` | **2/2 cases, 18 assertions pass**, plus teardown checks for timers, watchers and owned session disposal. Receipt: `.reference-work/reports/iteration9-open-failure-after.json`, completed 2026-09-12T11:06:53.434Z. |
| `npm run build && npm run type-check` | Pass on the repaired source; all four TypeScript scopes include the added tests. |
| `git diff --check` | Pass. |

The reserved Vitest/Cucumber suites, scenario coverage and sealed-file checks were not run. No full acceptance gate or measurement workload was run in this focused repair. The new Vitest cases are authored and type-checked, but their automatic execution remains pending. The focused reproduction is not represented as all new tests passing.

Both managed deliverables are updated for this repair. Code will be committed on the authoritative worktree branch; no publication tool is called, as required by the retry instruction.

## Outstanding exit condition

The ten I5-09 instances and the compiled removal instance passed on the preceding implementation commit; those handlers were not rerun during this focused exception-delivery repair. I5-10 `plan2-gate-amended` and `plan2-contexts-regression` remain unexecuted locally. A complete `--plan 2` pass cannot be asserted from the admission controls.

In addition, existing `scripts/measurements/resident-*` providers still consume removed increment stage-reuse telemetry. Their migration is explicitly assigned to iteration 12 by the plan. The 166 retained I2 obligations still include those measurement instances, so strict iteration 9 full-gate acceptance depends on that migration or an explicit plan revision. This implementation neither removes those obligations nor reuses stale measurements as current evidence. The checklist therefore leaves full functional acceptance and all-new-tests-pass unconfirmed.

## Recommendations for Next Iteration

1. Run the reserved regression and acceptance checks on this draft. Preserve current failures if any; focused receipts establish only their named coverage.
2. Iteration 10 should expose the compact reply through validated `scope`, `since` and `deadlineMs` service parameters and the changed-file CLI/host adapter. Contexts already supply the values and deadline semantics.
3. Resolve the ordering dependency between iteration 9's full Plan 2 gate and iteration 12's measurement-provider migration. Keep all nonsuperseded I2 records required and report measurement evidence separately.
4. Preserve iteration 8's supervisor/IPC accounting, the documented observer disagreement-propagation gap and the macOS worker/process verification requirement. None is waived or claimed resolved here.
