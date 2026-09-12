<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 8 results: Worker session hosting and surviving compiler supervision

**Date:** 2026-09-12. **Outcome:** the reported lifecycle failures are fixed. Forced worker termination, genuine heap exhaustion before and after compiler startup, and forced supervisor termination now produce explicit unavailable outcomes and release their owned processes. Focused verification passes; independent workflow acceptance remains pending. No failure assertion or cleanup requirement was waived.

## Reported failure and correction

The prior host retained compiler PIDs but lost the native child wait handles when the worker died. Sending SIGKILL from another isolate could stop the compiler without reaping it. The prior self-assessment therefore correctly remained incomplete: the combined session run passed 42 of 44 tests, and the subsequent focused follow-up passed one of four lifecycle cases. Those historical failures are retained in their receipts; they are not passing evidence.

This remediation implements the constraint finding's direction to make supervision survive worker failure. Analysis now starts a dedicated supervisor process containing the real, resource-limited session worker. The observer, retained compiler adapter and facts still live in that worker. The caller owns the supervisor's ChildProcess handle, an isolated Unix process group and the reported child identities independently of the worker's lifetime. This is an internal hosting change with an additional process and serialization cost; it is not described as the original in-process topology remaining unchanged.

On worker failure, the supervisor closes its recorded children and exits. Ending the process that lost the worker's native wait handles allows the system reaper to reap those children. The caller awaits the supervisor's close and verifies that both its process group and reported child PIDs have disappeared. The process group also covers the compiler's synchronous spawn-to-PID-notification gap. If the supervisor itself dies, the caller performs the same group cleanup. A zombie still counts as a surviving process; timeout or inspection failure rejects disposal instead of reporting success.

Worker exit invalidates the public current revision and status immediately, independently of the process cleanup promise. Repeated disposal shares that promise. Child tracking is cleared only after successful cleanup. Inspection failures receive bounded retries; failed cleanup retains evidence, but a finished cleanup attempt cannot later signal cached numeric IDs that the OS may recycle. The host's final child verification no longer sends another signal after the supervisor has completed ownership.

## Scope and contracts

All edits, checks and Git operations use `/tmp/worktrees/ramify-67e9dd0f/iteration-5-fast-incremental-checks`, on `workflow/iteration-5-fast-incremental-checks`. Changes are confined to analysis source, same-owner tests and reference-harness support/documentation. There are no changes to dependency-owner source, public session/provider shapes, declarations, package entries, CLI, daemon or model rules. Managed results and checklist are written through workflow tools; control-plane outputs are not edited.

The reviewed session port remains unchanged. `RunControl` carries cancellation; contexts in iteration 9 owns request deadlines and scheduling. A caller may stop waiting without aborting an update, which continues and publishes. `sweep()` performs observation and ordinary updates when invoked; the session adds no competing periodic scheduler.

## Implemented iteration behavior

- The public `openRetainedSession` factory opens the analysis-owned bounded worker through the new supervisor. Source execution uses the existing local TypeScript loader; compiled execution uses emitted ESM and no development runtime. The production build includes the private supervisor entry.
- Detached plain commands, revisions and outcomes are recursively frozen at the worker/public boundaries. Reports are projected only on explicit request. Historical projections, exact sequence release, cancellation and identical-revision object identity are preserved. A private MessagePort bridge supports the existing harness inspection channel without adding a public testing operation.
- Worker old/young-generation limits and the effective V8 heap preflight remain enforced. An inherited overriding V8 flag is rejected before engine loading or compiler startup. Unsafe bootstrap limits below 8 MiB are rejected before a worker starts.
- Heap exhaustion produces an unavailable, unpublished resource-limit report; abrupt loss produces analysis-failed. No failed worker retains a published current revision. Retained-fact admission continues to preserve the prior published facts on an oversized engine candidate.
- Hot/warm transitions retain facts, indexes, observations and history while releasing the compiler. The next update rebuilds broadly, including an empty update.
- Sweeps find observed input and configuration changes, track newly observed files, record their completion time, and recover from a cold invalid acquisition without an existing observer.
- Status carries sequence, observed count, fact bytes, worker heap/RSS, compiler PID/RSS and last sweep time. Worker RSS now describes the containing supervisor process, including its worker; compiler RSS remains separate.
- Successful disposal releases worker, supervisor, compiler, ports, pipes, timers, listeners, observations and history, including failure and repeated-disposal paths.

## Regression coverage

The original abrupt-loss, cold-heap and deterministic late-heap assertions remain enabled. The late-heap case opens a real 64 MiB worker and compiler, then sends 40,000 ordinary changed paths with 2,048-character prefixes through `session.update`. Real message deserialization exhausts the worker heap. It independently asserts resource-unavailable, no new revision, cleared current state, successful disposal and vanished compiler PID.

The abrupt-loss case additionally asserts that public state clears at worker exit before the cleanup promise resolves, and that an ended cleanup cannot issue further process signals. A new case kills the supervisor itself after opening the real compiler and requires the same unavailable outcome and actual process disappearance. Cleanup assertions settle disposal and restore listeners even on an assertion failure.

The harness observes real thread-created/online/exit messages through a dedicated Ramify diagnostic channel. It asserts real positive thread IDs, terminated final IDs, supervisor and compiler disappearance, and destruction of process, pipe, message-port, timer and watcher resources. No native Worker diagnostic is fabricated.

## Verification for this remediation

| Check | Result |
| --- | --- |
| `npm run build && npm run type-check` | Pass; production assets and all four TypeScript scopes. Type-check also passed after the final added regression. |
| Four-file session command: worker, retained-session, revision and audit suites | **45/45 pass**, including all three formerly failing worker/compiler cleanup cases. Receipt: `.reference-work/reports/iteration8-supervised-sessions-final.json`. |
| Newly added supervisor-loss regression | **1/1 pass**; 14 unrelated worker cases not selected in this additional run. Receipt: `.reference-work/reports/iteration8-supervisor-loss.json`. Together with the preceding run, all 46 current tests in the four files have passed. |
| Focused harness: I5-07 audit-detects-drift; I5-08 worker-nonblocking, resource-limit-explicit, dispose-releases | **4/4 selected handlers pass, 50 assertions**. Receipt: `.reference-work/reports/iteration8-supervision-harness-1789209708560.json`. |
| `npm run check:self`, with an owned endpoint | Resident execution, **11 owners, 261 source files, 3,345 accesses; zero errors, warnings or analysis limits; complete coverage**. The daemon was explicitly stopped and the temporary endpoint cleaned in finally. Log: `.reference-work/iteration8-supervised-self-check.log`. |
| `git diff --check` | Pass. |

The focused harness deliberately selects four of the 61 prerequisites, so its overall report has passed=false for unexecuted prerequisites; this is not represented as a full gate pass. The selected audit case verifies private inspection through the supervisor, actual drift repair and full batch equality. The selected resource/disposal cases verify the new thread/process accounting.

The current cold S1000 witness materializes 1,000 owners, uses default 512 MiB worker/96 MiB fact capacities, records 3,331 timer ticks with a maximum gap of 21.23 ms, and receives a 3,545,490-byte frozen revision containing 23,079 objects. This establishes host responsiveness through the new transport. These observations are behavioral evidence, not iteration 12 latency or memory acceptance.

An earlier intermediate remediation run passed all 24 worker/retained-session cases, and the first targeted cleanup rerun passed all four previously selected lifecycle cases. The final receipts above supersede those intermediate runs for their covered behavior.

Full `npm test`, Cucumber regression, scenario coverage and sealed-file checks were not run locally, as required by the supplied check policy. The complete prerequisite gate was not repeated during this focused remediation. Independent automatic revalidation remains required. No draft publication is requested by this turn.

## Existing prerequisite and matrix evidence

Before the supervision repair, a coherent `NODE_OPTIONS='' npm run reference:verify -- --plan 5 --iteration 8` run executed **61/61 required instances successfully**, including all eight I5-08 handlers, with 42 future instances not executed. Receipt: `.reference-work/reports/plan5-iteration8-0b254b2b-b33f-4fb6-b3f4-9fefa1abc3e5.json`. This is historical evidence on the prior topology, not a claim that the full gate ran on this commit. Its success never waived the failing same-owner lifecycle tests.

That run covered cold S1000 responsiveness, heap failure, W/R warm rebuild, dependency/configuration sweeps, S1000 deadline continuation, timings and normal disposal. The deadline witness uses explicitly enlarged test capacities of 1,024 MiB worker heap and 256 MiB retained facts to hold broad historical versions and an audit candidate; production defaults remain unchanged. Current focused session suites recheck warm rebuild, sweep/configuration, deadline continuation, cancellation and projections through the supervisor. The selected current harness checks are listed separately above.

Previous reference checking reported 15 owners, 54 source files, 294 accesses, no errors, two expected warnings and complete coverage. This historical reference check is not represented as a new run in the remediation. The unfiltered Plan 5 gate remains a later completion requirement.

## Recommendations for Next Iteration

1. Include the dedicated supervisor process and extra IPC serialization in iteration 12's memory, repeated-edit and end-to-end measurements. Worker status RSS now includes its containing supervisor, while compiler RSS remains separate; do not double count it or omit it. Internal supervision has changed without a public session/provider contract change.
2. Keep request deadline/cold replies, sweep and idle-audit scheduling, compact context history and hot-context budgets in iteration 9.
3. Preserve iteration 7's documented project-observer disagreement-propagation gap. This analysis-only repair adds no concurrent-writer guarantee or project-owner fix.
4. Revisit S1000 retained-history/candidate capacity with measured evidence. Enlarged behavioral-test capacities are not a production-default change or a memory waiver.
5. Run worker/process suites on macOS before platform acceptance. This repair establishes Linux evidence in the current environment and explicitly verifies actual OS reaping; it does not claim macOS execution.

Both previously false self-assessment checks can now be true on the focused evidence: the missing supervision behavior is implemented and all current new session tests have passed. Workflow acceptance and future plan capabilities remain separate.
