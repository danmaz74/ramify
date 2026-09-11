# Iteration 8: Session hosting: worker thread, sweep, deadlines, hot and warm

**Plan:** [Plan 5: Fast incremental checks](../main-plan.md).
**Prerequisites:** iteration 7 (`session`: every revision path, the positions
and the audit). **Owners:** `subs/analysis/`.

## Goal

Move the session into a worker thread that `analysis` starts itself, with
resource limits, a frozen plain-data message boundary, the sweep, the caller's
deadlines, the hot and warm levels with compiler release and rebuild, and a
disposal that leaves no thread, process, timer or handle behind. The session
contract does not change: callers of `openRetainedSession` cannot tell where
it runs.

## Read first

- [contracts.md](../contracts.md#analysis-the-retained-session): the
  `openRetainedSession` rule about `session-worker.ts` and `resourceLimits`,
  `SessionStatus`, `SessionLimits`, `releaseCompiler` and the fact-size bound.
- [scope.md](../scope.md#session-hosting): Session hosting and its level
  table; [The sweep](../scope.md#the-sweep);
  [Deadlines and cold contexts](../scope.md#deadlines-and-cold-contexts);
  [Session limits and budgets](../scope.md#session-limits-and-budgets).
- [owners.md](../owners.md): Analysis and the iteration 8 row of the
  activation manifest.
- Main plan: [Resolved decisions](../main-plan.md#resolved-decisions) 2;
  matrix row I5-08; the worker risk row.
- `probes.md`: P5-4, which measured the cold open, the structured-clone cost
  of an S1000 revision message, behavior at the heap limit and main-thread
  responsiveness.
- [Memory lifecycle](../../../architecture/memory-lifecycle.md): State
  ownership and bounds; Pressure, eviction and recovery.
- Source from iterations 6 and 7: `src/{retained-session,session-facts,session-revision,session-audit}.ts`.

## Deliverables

1. `subs/analysis/src/session-worker.ts`: the worker entry that owns the
   observer, the retained adapter and the facts. `openRetainedSession` starts
   it with `resourceLimits.maxOldGenerationSizeMb` from
   `session.workerHeapMiB` and keeps the handle. Messages are frozen plain
   data: changes in, revisions and outcomes out. The report projection is
   requested explicitly and is the only large message; it is never sent
   unrequested.
2. Failure and limits: exhausting the worker heap or losing the worker is an
   explicit `resource-unavailable` or `analysis-failed` outcome with no
   published revision; exceeding `maxRetainedFactBytes` fails the update with
   the engine's `resource-limit` diagnostic in a `reported` outcome. The host
   thread never blocks on the compiler.
3. `sweep(control)` calling the observer's `reobserve()` and running the
   resulting changes through the ordinary update path, returning `unchanged`
   when nothing changed.
4. Deadlines: the caller's deadline bounds the wait, never the work. The
   update always runs to completion and publishes; a waiting call that
   reaches its deadline is answered explicitly with the sequence current at
   acknowledgment.
5. Levels: `releaseCompiler()` demotes to warm, keeping facts, indexes and
   observer while the compiler server is closed; the next update rebuilds the
   compiler and takes the broad path. `status()` reports the level, the
   sequence, the observed input count, `factBytes`, worker heap and RSS,
   compiler pid and RSS and the last sweep time.
6. `dispose()` releases the worker thread, the compiler server, every timer
   and every handle, and is safe to call twice.
7. Tests: `src/tests/session-worker.test.ts` (host responsiveness, resource
   limits, message plainness, deadlines, level transitions, sweep and
   disposal), with the existing session suites re-run unchanged through the
   worker host so the contract move is verified rather than assumed.

## Matrix rows executed here

- I5-08: `worker-nonblocking` (the host thread keeps ticking during a cold
  S1000 open); `resource-limit-explicit` (an explicit `resource-unavailable`
  and no published revision); `warm-demotion-rebuild` (facts kept, next
  revision broad and equal to batch); `sweep-scheduled` and
  `sweep-after-configuration`; `deadline-exceeded-explicit` (the update
  completes and publishes while the caller is answered); `timings-recorded`;
  `dispose-releases` (thread, server process, timers and handles gone).

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/analysis/src/tests/session-worker.test.ts \
  subs/analysis/src/tests/retained-session.test.ts \
  subs/analysis/src/tests/session-revision.test.ts \
  subs/analysis/src/tests/session-audit.test.ts
npm test
npm run reference:verify -- --plan 5 --iteration 8      # requires 2 to 8
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kind: `session` only, over `W/R` and `W/S1000`. The S1000 fixture is
materialized by `npx tsx scripts/measurements/materialize.ts` before the run.
Expected intermediate failures: the unfiltered `--plan 5` gate; contexts, CLI,
live equivalence and measurements follow later. A worker that hides a compiler
crash or a session that survives `dispose` fails this iteration, and latency
numbers observed here are not acceptance evidence: iteration 12 measures.

## Exit criteria

- The session runs in its worker with enforced limits, explicit failures and
  a message boundary of frozen plain data, and every earlier session instance
  still passes through the new host.
- The sweep, the deadlines and the hot and warm levels behave as scope.md
  fixes, with every I5-08 instance executed.
- Disposal leaves no thread, process, timer or handle.

## Handoff

Iteration 9 holds this session handle from contexts through the revised driver
port, schedules its sweeps and its idle audit, enforces `maxHotContexts`
through `releaseCompiler`, and answers requests from the published revision
when it already covers their identities.
