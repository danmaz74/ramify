# Plan 5 contract remediation

**Date:** 2026-09-13. **Status:** draft; review decisions resolved. This plan
repairs the two behavioral contract violations that kept
[Plan 5](../iteration-5-fast-incremental-checks/main-plan.md) from closing as
delivered, as its [closure](../iteration-5-fast-incremental-checks/closure.md)
records. It adds no capability, owner, package entry or wire field. Plan 5's
contracts, owners and review package remain authoritative except where this
plan clarifies them.

## Workflow and completion boundary

An agent's post-write hook, `ramify check --changed <path>`, against a warm
resident context:

- is answered from the published revision with no analysis whenever the
  watcher has already published the named identity and only routine
  maintenance is running or due; and
- after a `module.ramify` edit, receives a revision on the `description` path
  whether or not background work was cancelled while the edit arrived.

The plan is complete when both behaviors hold under deterministic owner tests
and the harness self-test shows the measurement harness attributing daemon work
to the hook correctly. No real-process run is part of completion. Performance
targets are reported, not enforced.

## Evidence

Plan 5 iteration 12 measured twenty cycles per edit kind on the 15-owner
reference and the 100-owner S100 fixture; its
[results](../iteration-5-fast-incremental-checks/iterations/iteration12-results.md)
record the failures. The raw archive for the 13:27 run on 2026-09-12 was
re-examined for this plan together with the source at `ef7c625`. A scratch
script driving the real context manager on a controlled clock reproduced the
covering failure; no repository file was changed during the investigation.

Both violations are triggered by the periodic sweep. It fires every 9 to 20
seconds instead of every 30, and nothing distinguishes it from a sweep a
request must wait for.

### Violation 1: the covering rule leaks

Reference cycle 1 of the published-hook workload: the watcher had published
sequence 163, a timer-driven sweep started 200 ms before the hook's request,
the request was queued behind it, and the hook's named path then forced a
second update that found nothing new. Two analyses ran and the request was not
counted as covered. Reference cycle 13 and S100 cycle 18 were answered by
coverage within 1 ms; a sweep then began inside the harness's 250 ms settle
window and the assertion attributed it to the hook.

| Cause | Location |
| --- | --- |
| `sweepLater` returns while a timer exists and computes its delay from `lastSweepAt`, which is written only after a sweep finishes; a `touch()` during a sweep schedules the next one from the previous sweep's start | [context-manager.ts:142-152](../../../subs/daemon/subs/contexts/src/context-manager.ts#L142-L152), [:352](../../../subs/daemon/subs/contexts/src/context-manager.ts#L352) |
| When the timer fires it sets `sweepRequired`, `background = 'sweep'` and `reconciling`, so a periodic sweep is indistinguishable from a required one | [context-manager.ts:149](../../../subs/daemon/subs/contexts/src/context-manager.ts#L149) |
| `touch()` marks a sweep required when the interval has elapsed, before the covering test runs | [context-manager.ts:156](../../../subs/daemon/subs/contexts/src/context-manager.ts#L156) |
| The covering test refuses any running background work or required sweep | [context-manager.ts:465-468](../../../subs/daemon/subs/contexts/src/context-manager.ts#L465-L468) |
| An uncovered hook adds its path to the change set, forcing an update after the sweep | [context-manager.ts:471-476](../../../subs/daemon/subs/contexts/src/context-manager.ts#L471-L476) |
| `coveredRequests` increments only when `captureStarted` is null | [service.ts:165](../../../subs/daemon/src/service.ts#L165) |
| The harness samples `settled` after a quiet window in which background sweeps count as analyses | [fast-assertions.mjs:224-229](../../../scripts/measurements/fast-assertions.mjs#L224-L229), [fast-driver.mjs:79-83](../../../scripts/measurements/fast-driver.mjs#L79-L83) |

### Violation 2: description edits fall back to `broad`

Reference description cycle 7 and S100 description cycle 18 each coincided
with the only cancelled analysis of their run. A background sweep was hashing
observed inputs when the watcher delivered the edit's event; the context
manager cancelled the sweep; the cancellation surfaced at the first check
inside `revise()`, before the observer or the compiler had changed; and the
error handler marked the session stale. The next job reconciled through the
configuration boundary and took `broad`, rebuilding the compiler program. S100
created-file cycle 16 hit the same collision unnoticed because `broad` is its
expected path.

| Cause | Location |
| --- | --- |
| A watcher event cancels running background work and restores its paths | [context-manager.ts:179-182](../../../subs/daemon/subs/contexts/src/context-manager.ts#L179-L182) |
| No cancellation check separates `reobserve()` from `revise()` | [session-engine.ts:157-165](../../../subs/analysis/src/session-engine.ts#L157-L165) |
| `revise()` begins with `check(signal)` | [session-revision.ts:326](../../../subs/analysis/src/session-revision.ts#L326) |
| The error handler sets `state.stale = true` before testing for cancellation | [session-revision.ts:528-533](../../../subs/analysis/src/session-revision.ts#L528-L533) |
| Publication after a completed revision repeats the pattern: its handler also sets `state.stale` before testing for cancellation | [session-engine.ts:260-262](../../../subs/analysis/src/session-engine.ts#L260-L262) |
| A stale session reconciles through the configuration and forces `broad` | [session-revision.ts:333-336](../../../subs/analysis/src/session-revision.ts#L333-L336), [:378](../../../subs/analysis/src/session-revision.ts#L378) |

The alternating finding count of the description edits is unrelated: the
reference failure is index 6 and the S100 failure index 17.

## Resolved decisions

1. **Required and periodic sweeps.** [Plan 5 scope](../iteration-5-fast-incremental-checks/scope.md#the-sweep)
   makes a request wait for a *required* sweep without defining one. A sweep
   is required after a configuration, manifest or lockfile change, after a
   watcher overflow or error, when opening or conservative, when queued paths
   exceed `maxQueuedPaths`, and for an empty-expect synchronized plain check.
   A sweep started only because `sweepIntervalMs` elapsed is **periodic**:
   maintenance that never makes a covered request wait and never marks the
   context `reconciling`. It still publishes whatever it finds.
2. **Sweep cadence.** A periodic sweep starts no sooner than `sweepIntervalMs`
   after the start of the previous sweep of either kind. Starting any sweep
   cancels a pending periodic timer; the timer is rescheduled when that sweep
   finishes and re-checks elapsed time when it fires. Activity never shortens
   the interval.
3. **Cancellation without advanced state.** A revision cancelled before it
   applies observer changes or updates the compiler returns `cancelled` and
   leaves the session exactly as published. A revision cancelled after either
   point still marks the session stale, because the next revision must
   recompute from disk rather than lose the edit. The rule applies to both
   handlers that set `stale`: the one in `revise()` and the one around
   promotion and publication in the session engine.
4. **Harness attribution.** A hook is judged by counters sampled immediately
   after it returns. Work after that point passes when it consists only of
   sweeps and audits.
5. **Budgets.** The harness applies
   [Two kinds of budget](../../architecture/memory-lifecycle.md#two-kinds-of-budget):
   every existing Plan 5 timing and memory target is an ideal optimization
   budget, recorded with its value and never enforced. This plan declares no
   acceptable-time budget; deriving them is left to the
   [optimization analysis](../../analysis/fast-incremental-checks-optimization.md).
   Correctness predicates remain enforced.
6. **Coverage during a periodic sweep.** A covered request is answered from
   the revision published before a running periodic sweep, without waiting for
   that sweep. An out-of-band change the sweep finds can therefore publish
   after the reply. Plan 5 requires waiting only for *known* changes, and the
   sweep still publishes what it finds.
7. **No live run.** The plan closes on the deterministic owner tests and the
   harness self-test. At the observed rate of one or two collisions per twenty
   cycles, a clean real-process run would be supporting evidence only, not
   regression evidence.

## Owners

No owner, exposure line or package entry changes. Every edit is internal
source or owned tests.

| Iteration | Owner | Source | Tests |
| --- | --- | --- | --- |
| 1 | `daemon/contexts` | `src/context-manager.ts` | `src/tests/covering.test.ts`, `src/tests/context-manager.test.ts` |
| 2 | `analysis` | `src/session-revision.ts`, `src/session-engine.ts` (`sweep` and the promotion handler) | `src/tests/session-revision.test.ts` |
| 3 | independent `scripts/measurements/` scope | `fast-assertions.mjs`, `fast-workloads.mjs`, `fast.mjs`, `README.md` | `fast-evidence.test.mjs` |

## Acceptance matrix

| ID | Case | Evidence | Iteration |
| --- | --- | --- | --- |
| RC-1 | `sweep-cadence`: a configuration sweep at 20,000 ms produces no periodic sweep at 30,000 ms; the next starts at or after 50,000 ms, and a check during a sweep does not bring it closer | unit, controlled clock | 1 |
| RC-2 | `covered-during-periodic-sweep`: a covered hook during a held-open periodic sweep replies with `captureStarted: null`, `reusedRevision: true` and no update call | unit, scripted driver | 1 |
| RC-3 | `covered-when-interval-elapsed`: a covered hook arriving after `sweepIntervalMs` is answered from coverage before a periodic sweep is scheduled | unit, controlled clock | 1 |
| RC-4 | `required-sweeps-still-wait`: configuration, overflow and error sweeps still make a covered hook wait and record `reconciling` | unit | 1 |
| RC-5 | `cancel-before-apply-keeps-description`: a sweep cancelled after reobservation returns `cancelled`; the next description revision takes `description` and equals batch | unit | 2 |
| RC-6 | `cancel-after-apply-stays-exact`: a revision cancelled after observer changes marks the session stale; the next revision takes `broad`, reflects the edit and equals batch | unit | 2 |
| RC-7 | `cancel-check-before-revise`: a signal aborted during `reobserve()` returns `cancelled` without entering `revise()` | unit | 2 |
| RC-8 | `hook-attribution`: synthetic cycles with a sweep between hook and settle pass; an update during the hook, or a covered count below one, fails | unit, harness | 3 |
| RC-9 | `ideal-budgets-report`: a timing miss is recorded with its target and `enforcement: 'ideal'` and does not fail the workload | unit, harness | 3 |

## Iterations

| Iteration | Title | Prerequisites |
| --- | --- | --- |
| [1](iterations/iteration1.md) | Periodic sweeps as maintenance | none |
| [2](iterations/iteration2.md) | Cancellation without advanced state | none |
| [3](iterations/iteration3.md) | Harness attribution and ideal budgets | 1 and 2 |

Iterations 1 and 2 write different owners and could run in parallel; they are
sequenced so that iteration 3 writes the completion report against one
integrated build.

## Verification policy

Each iteration runs its owners' test files and `npm run type-check`, never the
full suite by hand; full verification is the cucumber-viz commit audit on the
iteration's worktree. No iteration runs real-process measurement workloads.

## Deferrals

| Deferred | Reason |
| --- | --- |
| `contextStatus` resetting activity | Every status poll calls `touch()`, which postpones the idle audit and schedules sweeps; the harness's 20 ms polling kept audits from ever running. It breaks no contract once cadence is fixed. |
| Not cancelling background work on watcher events | Removes the collision entirely but makes an edit wait up to a sweep's duration, which grows with project size. |
| `captureStarted` and per-request analysis attribution in `ramify.check/1` | Would remove counter inference from the harness but changes a published document. |
| Real-process runs of `hook-latency-reference` and `hook-latency-s100` | Resolved decision 7. Live confirmation of the repaired contracts is left to Plan 5's outstanding measurement, which uses the corrected harness. |
| Remaining Plan 5 iteration 12 workloads and iteration 13 | S1000, checked sets, plateau, memory, cold opens, footprints, declarations, self-check and document revisions stay outstanding under Plan 5. |
| Performance work | See the [optimization analysis](../../analysis/fast-incremental-checks-optimization.md). |

## Handoff

The completion report states the sweep classification and cadence, the
cancellation rule, the coverage rule during periodic sweeps, the corrected
harness assertion and the owner and harness test results. Plan 5's outstanding
iteration 13 must carry the sweep definition and the coverage rule into its
revision of [daemon and analysis](../../architecture/daemon.md).
