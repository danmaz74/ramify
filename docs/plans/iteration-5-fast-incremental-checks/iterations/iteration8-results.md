<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 8 results: Worker session hosting

**Date:** 2026-09-12. **Outcome:** incomplete. Normal worker hosting and the I5-08 behavior are implemented, but abrupt worker termination leaves an unreaped compiler child. Abrupt-loss and heap-exhaustion cleanup regressions remain failing. This iteration is not ready for acceptance; no cleanup requirement or test has been waived.

## Scope and contracts

All edits, commands and Git operations use `/tmp/worktrees/ramify-67e9dd0f/iteration-5-fast-incremental-checks`, on `workflow/iteration-5-fast-incremental-checks`. Changes are confined to analysis source, same-owner tests and the reference harness. The pre-existing managed modification to iteration7-check-results.md is preserved without editing or staging it. No dependency-owner source, settled public session type, declaration, package entry, CLI or daemon source changes.

The reviewed contract assigns caller deadline replies and sweep scheduling to contexts in iteration 9. `RunControl` still carries only cancellation. The session completes work unless cancelled or failed, while the harness races the same update promise with a caller deadline. `sweep()` performs the required observation and update; this implementation adds no independent scheduler that could race contexts' future queue.

## Implemented behavior

- `retained-session.ts` retains the public factory and opens one analysis-owned worker. The existing engine lives in `session-engine.ts`; batch analysis remains unchanged.
- The private protocol carries detached, recursively frozen commands, revisions and outcomes. AbortSignal remains local to each side, connected by cancellation messages. Successful report projections cross the boundary only in response to `report()`. Historical projections, exact sequence release and identical-revision object identity are preserved.
- The host configures `resourceLimits.maxOldGenerationSizeMb`, constrains young generation size and checks the worker's effective V8 heap ceiling before allowing engine imports or project observation. The inherited `NODE_OPTIONS=--max-old-space-size=8192` is correctly rejected when it overrides the requested limit. Worker sizes below 8 MiB are rejected before startup because a 1 MiB bootstrap was observed to abort the entire Node process.
- Heap exhaustion maps to an unavailable, unpublished report with a `resource-limit` diagnostic. Worker failures clear the host's current revision. The retained-fact admission boundary remains in the engine and preserves the previous published facts and historical projection on rejection.
- Node's per-isolate child-process diagnostic channel records child identities without importing compiler-private evidence. Status checkpoints include worker heap, process-wide worker RSS, compiler PID/RSS, sequence, fact bytes, observed input count and last sweep time. Compiler RSS is measured separately on Linux and macOS.
- Normal demotion releases and reaps the compiler while keeping facts, indexes, observations and historical versions. The next update rebuilds broadly, including an empty update with unchanged identities.
- Sweeps use the observer's reobserve operation, handle cancellation and acquisition failures, and retry observation for a cold invalid capture that has no observer.
- Normal disposal cancels queued operations, waits for compiler exit before closing the worker, clears retained facts and observations, removes listeners and timers, and tolerates repeated calls. Timeout cleanup signals children before forcibly ending their worker, so that the live worker still has an opportunity to reap them.

Source execution uses Node's TypeScript transformation with a local .js-to-.ts resolver; compiled workers load emitted ESM directly and load no development runtime. Production dependency validation verifies the worker and loader assets.

## Unfinished requirement: abrupt worker loss

The real regression is:

```sh
NODE_OPTIONS='' npx vitest run subs/analysis/src/tests/session-worker.test.ts -t 'abrupt worker loss'
```

After opening a real worker and live compiler, it terminates the worker, requests an update and checks disposal. It fails with `Session child process survived disposal`. The host kills the compiler, but its process remains a zombie until the host process exits. This is not a completed disposal and cannot be counted as passing. The host now catches cleanup failure and includes it in the explicit unavailable report, so the update does not reject instead of returning its engine outcome. The child cleanup assertion and disposal still fail.

The original normal-disposal defect had the same cause but was fixable: the worker closed before the compiler's exit event had been reaped. Waiting inside the still-live worker fixes normal shutdown and warm demotion. It cannot repair a worker whose V8 isolate and libuv loop are already gone.

Libuv documents that closing a Unix process handle before child exit creates a zombie requiring waitpid. Its reaper only visits handles retained by the owning loop. The host's PID list can signal a child but cannot recreate that handle through supported Node APIs. See [libuv process lifetime](https://docs.libuv.org/en/v1.x/process.html#c.uv_spawn) and [the Unix process implementation](https://raw.githubusercontent.com/libuv/libuv/v1.x/src/unix/process.c). A separate read-only review reached the same conclusion.

The final combined focused run also reproduces the same cleanup defect during genuine 16 MiB heap exhaustion after a child has started: the unavailable resource-limit report is returned, but the recorded child PID remains alive. Earlier heap witnesses that failed before this phase passed; that does not establish late-crash cleanup.

There is also an early-failure gap: the Node child creation diagnostic precedes PID assignment, so notification currently runs on a microtask or spawn event. A failure in the adapter's synchronous startup before that turn can occur before the host receives the compiler PID.

The iteration-work skill states that neither Studio nor direct work "permits changing a settled contract" (`.agents/skills/iteration-work/SKILL.md:14–17`), and the user-supplied Plan 5 requires a change to the reviewed contracts to revise iteration 1's package first (`main-plan.md:547–548`). The assigned owner remains analysis. These constraints are the reason a broader hosting/provider change requires a review decision.

The robust architectural requirement is surviving ownership of compiler spawning and reaping, established before fallible analysis work. The current RetainedSourceInputs/RetainedSourceAnalysis public port supplies no launch or transport operation, and the installed synchronous compiler client creates its own child. Changing that provider contract exceeds this iteration's analysis-only write scope. The planned child-process session fallback is a candidate, but it must pass the same abrupt-failure test, including container child reaping, before it can be accepted. A request to choose fallback preparation or an incomplete submission is pending with the user.

An isolated real-session experiment tested the planned direction without changing production hosting. A dedicated Node process opened the actual worker and compiler, terminated the worker, killed the compiler and observed a zombie. After that dedicated Node process exited, the container's docker-init reaper removed the compiler. This establishes Linux feasibility for process isolation in this environment, not a completed fallback implementation or portable acceptance. Receipt: `.reference-work/reports/session-supervisor-probe-20260912.json`; probe source: `.reference-work/session-supervisor-probe.mjs`. The production contract remains unchanged.

## Evidence and verification

- `npm run worktree:prepare`: nested example and site dependencies provisioned from this checkout.
- `npm run build && npm run type-check`: passed after correcting source-only loader URLs to respect production dependency validation; all four TypeScript scopes passed.
- The existing ten retained-session tests pass through the public worker with their original assertions unchanged. Under an inherited V8 override, a test-only wrapper runs the complete file in a sanitized child process and propagates failures.
- The required four-file session command on final source executes 44 tests: 42 passed and 2 failed. Both failures are in session-worker.test.ts: abrupt worker loss and actual heap exhaustion after a child was started. Receipt: `.reference-work/reports/iteration8-sessions-coherent-20260912.json`. An earlier full worker-only run passed 12 and failed 1; the later heap-exhaustion failure demonstrates that compiler cleanup also depends on when the worker exhausts memory. No failing test is excluded from the final result.
- `NODE_OPTIONS='' npx vitest run subs/analysis/src/tests/session-revision.test.ts subs/analysis/src/tests/session-audit.test.ts`: 21 passed. Private fault-injection probes keep direct access to the internal engine; all I5-06 and I5-07 acceptance handlers now execute through the worker host.
- `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan5.test.ts`: 10 passed.
- Focused worker inspection smokes: description subtree 20 assertions; injected audit drift 19 assertions, including actual worker/compiler disposal.
- `npm run check:reference`, with an owned endpoint: resident path, 15 owners, 54 source files, 294 accesses, no errors, two expected warnings and complete coverage.
- `npm run check:self`, with the same owned endpoint: resident path, 11 owners, 258 source files, 3,324 accesses, no findings or analysis limits and complete coverage.
- The owned daemon was explicitly stopped and its endpoint removed. `git diff --check` passes.
- Full `npm test`, Cucumber regressions, scenario coverage and sealed-file checks remain reserved for automation under the supplied policy. The known abrupt-loss and heap-exhaustion cleanup failures prevent a passing full regression suite.

I5-08 registration contains eight handlers; total registration is now 61 across iterations 2–8. The unfiltered gate still has 42 future instances and is not claimed complete.

The first focused hosting run preserved six failures: the normal-disposal bug masked otherwise passing behavior, two fixture assumptions needed correction (JSONC configuration and relative dependency paths), and the S1000 deadline witness required explicit capacity for retained broad versions. Corrected W/R runs pass all four warm/sweep/timing handlers with 100 assertions. The S1000 deadline witness passes 13 assertions with a 200.63 ms caller wait, subsequent broad publication, equal audit, full batch equality and compiler cleanup.

The deadline witness explicitly sets workerHeapMiB=1024 and maxRetainedFactBytes=256 MiB, while production defaults remain 512 and 96 MiB. A default cold S1000 session serialized approximately 82.38 MB of retained facts, so two complete broad versions exceed the default fact limit. These enlarged capacities establish continued-work behavior only; they do not establish memory or latency budget acceptance.

All eight I5-08 handlers now pass focused execution: 139 assertions across these current receipts:
- `.reference-work/reports/plan5-hosting-reference-1789206456342.json` (warm, sweeps, timing paths; 100 assertions).
- `.reference-work/reports/plan5-hosting-deadline-1789206628893.json` (S1000 caller deadline; 13 assertions).
- `.reference-work/reports/plan5-hosting-lifecycle-1789206693696.json` (cold responsiveness, actual low-heap failure and normal disposal; 26 assertions).

The corrected cold S1000 run records a maximum 10 ms timer gap of 23.95 ms, a 3,545,479-byte revision with 23,079 frozen objects, and the default 512 MiB / 96 MiB capacities. These focused receipts have overall passed=false because each intentionally executes only its named subset of the 61 required instances; all eight executed hosting handlers pass independently. The initial failed receipt is `.reference-work/reports/plan5-hosting-focused-1789206286243.json`; it remains separate from the corrected executions.

A follow-up focused queued-disposal test passes after moving timeout cleanup before forced thread termination. An initial mistyped filter selected zero tests and is not evidence.

The first full prerequisite-gate run was rejected because source changed during verification (the disposal fix landed while it ran); it supplies no passing evidence. A second run was stopped explicitly when final review identified a status/RSS race; its owned descendants were stopped. The race is corrected by rechecking worker failure after the asynchronous RSS read. The final `NODE_OPTIONS='' npm run reference:verify -- --plan 5 --iteration 8` run passes on stable source and compiled output: required 61, passed 61, failed 0, not executed 42. Every I5-08 handler and all prerequisites ran. Receipt: `.reference-work/reports/plan5-iteration8-0b254b2b-b33f-4fb6-b3f4-9fefa1abc3e5.json`. The gate and its owned children exited. This passing matrix gate does not waive the two failing same-owner lifecycle tests.

## Recommendations for Next Iteration

1. Resolve the worker/compiler supervision blocker before accepting this iteration or integrating its handle into contexts. Keep the abrupt-after-compiler-start regression and the early PID-notification race in the acceptance evidence.
2. Keep sweep scheduling, deadline/cold replies, compact context history, hot-context budgets and idle audit scheduling in iteration 9, as the reviewed contract assigns.
3. Preserve iteration 7's project-observer disagreement-propagation gap; no project-owner change or concurrent-writer guarantee is added here.
4. Revisit S1000 retained-history/candidate accounting and effective worker memory with iteration 12 measurements. The enlarged behavioral-test limits are not a change to production defaults or a memory waiver.
5. Run the process/worker suites on macOS before platform acceptance. This execution establishes Linux evidence only.
