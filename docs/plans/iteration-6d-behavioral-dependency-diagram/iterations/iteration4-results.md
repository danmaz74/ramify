# Iteration 4 results: Serve the daemon operation

**Date:** 2026-09-17. **Mode:** direct work in worktree `/tmp/ramify-plan6d-behavioral-diagram`,
branch `feat/plan6d-behavioral-dependency-diagram`. It is based on iteration 3 at `0d153fc`.
The implementation commit is `27184cc`. The BD24 artifact was recorded from that clean commit.

## Prerequisites

- Iteration 3's runner, `createProcessDependencyAnalyzer`, and the built `dist/src/dependency-analyzer-entry.js` are
  present. `DependencyDiagramRunner` and `DependencyAnalyzerOutcome` are exposed by analysis A15.
- The existing `context-manager.test.ts`, `explorer-details.test.ts`, `service.test.ts`, `ipc.test.ts`, `codec.test.ts`,
  `validation.test.ts`, `session-counters.test.ts` and `resident-assembly.test.ts` passed with the operation added and
  before any of their files changed.

## Built

### `daemon/contexts`

- `src/interfaces/contexts.ts` adds C4's `DependencyDiagramRequest` and `ContextDependencyDiagramOutcome`, the optional
  `ContextManagerOptions.dependencyDiagrams` runner port and `ContextManager.dependencyDiagram`.
- `src/context.ts` adds `RetainedDiagram` and `LiveContext.diagram`: at most one result, with its revision and encoded bytes.
- `src/context-manager.ts` implements the operation:
  - **Order.** An unknown context or earlier generation answers as today. Then `superseded` unless the revision is the
    published one, `unavailable/invalid-current` unless that revision completed, `ready` from the retained result,
    joining the running job for the same context and revision, `busy/analysis-running` while any other job holds the
    slot, and otherwise a new job. A busy answer starts no work.
  - **One job daemon-wide.** The job has its own `AbortController` and pins the published revision while it reads that
    revision's report. It calls the runner with `report.request.project` and the report. The job never enters the
    context queue and never calls `update`, `sweep`, `verify` or any compiler operation of the retained session.
  - **Callers.** A caller's cancellation, or the release of its lease, detaches only that caller. The job aborts when no
    caller remains. An aborted job keeps the slot until its runner settles, which is after the child exits.
  - **Publication.** Publishing a newer revision releases the retained result, aborts a job for another revision and
    answers its callers `superseded` with the new revision. A late outcome from an aborted job is discarded. No job
    restarts without a request.
  - **Outcomes.** `inputs-changed` answers `busy/inputs-changed`. Runner `cancelled` answers `cancelled`.
    `unavailable/resource-limit` stays `resource-limit`, and `invalid-report` and `analysis-failed` become
    `analysis-failed` with the analyzer reason as a message prefix. A ready diagram whose `inputId` differs from the
    revision's is `analysis-failed`.
  - **Retention.** A ready diagram is retained only when the session's `factBytes` plus the diagram's bytes stay within
    `maxRetainedBytesPerContext`, and the daemon total plus the diagram's bytes stays within `maxRetainedBytesGlobal`.
    Otherwise callers receive `unavailable/resource-limit` with the needed and maximum bytes, and nothing is retained.
    The result counts in `ContextStatus.retainedBytes` and in the global total that publication trimming uses. Newer
    publication, a discarded history, eviction and close release it; demotion and cooling keep it.
  - **Lifecycle.** Waiting callers hold the context like explorer-detail deliveries and count in `pending.requests`.
    A request does not touch the context, so it neither reopens a cold context nor schedules a sweep. Job start and end
    emit `status-changed`.

### `daemon`

- `src/interfaces/daemon.ts`: `DaemonServiceOptions.dependencyDiagrams`.
- `src/service.ts`:
  - It wraps the injected runner to count `dependencyDiagrams` (analyzer jobs started), `behaviorRuns` (the sum
    reported by ready outcomes) and `dependencyDiagramInputChanges`.
  - `dependencyDiagram` validates, maps lookup failures to service errors (`unknown-context`, `expired-generation`;
    disposal is `stopping`) and returns every C4 outcome as a value.
  - `dispatchServiceRequest` routes the operation.
- `src/validation.ts` accepts exactly `{ token, requestId, revision }`.
- `src/codec.ts` and `src/host.ts` add the `dependencyDiagram` capability to the welcome. Responses use the existing
  frame and `maxResponseBytes`.
- `src/connection.ts` and `src/connect-daemon.ts` add the client method `dependencyDiagram(params, control?)`.
- `module.ramify` N5 relays the request and outcome types.

### Root `ramify [dispatch]`

- `src/interfaces/service.ts` adds `'dependencyDiagram'` to `ServiceOperation` and `ServiceCapability`, the three
  counters to `DaemonCounters`, and `RamifyService.dependencyDiagram`.
- `src/resident-assembly.ts` injects `createProcessDependencyAnalyzer(process.execPath, dependencyAnalyzerEntry)`, unless
  `ResidentAssemblyOptions.dependencyDiagrams` overrides it. `dependencyAnalyzerEntry` is the sibling built entry; a
  source run uses the package's `dist/src/dependency-analyzer-entry.js`. The assembly now imports `openRetainedSession`
  and `resolveProject` from their owner files instead of the analysis package entry, whose barrel loaded
  `dependency-analyzer.js` into the daemon.
- `module.ramify` R7 relays `DependencyDiagramRequest` and `ContextDependencyDiagramOutcome`. The new R10 relays
  `DependencyDiagramRunner` and `DependencyAnalyzerOutcome` from analysis to descendants for the port.
- `src/tests/quick-environment.ts` accepts an injected runner, advertises the capability and implements the method.

### Tests

- `subs/daemon/subs/contexts/src/tests/dependency-diagram.test.ts` uses the real context manager, the scripted session
  driver and a controllable runner that settles only when the test settles it (BD19–BD22).
- `subs/daemon/src/tests/service.test.ts` runs the real resident analysis with a scripted runner (BD23).
- `subs/daemon/src/tests/ipc.test.ts` uses a real socket, the public `connectDaemon` client and a scripted runner (BD23).
  `ipc-fixture.ts` accepts the runner.
- `validation.test.ts` and `codec.test.ts` add the request shape and capability cases.
- `session-counters.test.ts` injects a runner that throws and asserts zero diagram counters after a racing hook.
- `src/tests/dependency-diagram-daemon.test.ts` is BD24 against the built daemon.
- `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` now lists analysis A14/A15, root R9/R10 and the new
  context relays. It already failed on HEAD for root and analysis because iterations 2 and 3 added A14, A15 and R9
  without updating it.

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| BD19 | A wrong revision is `superseded` with the published revision. A first request starts one run whose `report` is the session's published report object and whose `project` equals `report.request.project`. During the job, the scripted driver records no open, update or sweep, and `analysisRunning` stays false. An equal request joins. A second context's request is `busy/analysis-running` and adds no run. Both joined callers receive the same frozen diagram. Ten more requests are `ready` from the retained result with still one run. After an invalid revision publishes, the old revision is `superseded` and the invalid one is `unavailable/invalid-current`. An earlier generation and an unknown context are unavailable, a pre-aborted request is `cancelled`, and a manager without a runner is `resource-unavailable`, all with no run | pass |
| BD20 | Two callers join one run. Cancelling the first answers it `cancelled` and leaves the run's signal unaborted. Cancelling the second aborts the signal. Until the runner settles, a request is `busy/analysis-running`. After settlement nothing is retained and no run restarts. A new request starts run 2, and releasing its lease answers `cancelled` and aborts it | pass |
| BD21 | Publishing revision 2 during a job answers the waiting caller `superseded` with revision 2 and aborts the run. A late `ready` from that run is discarded (`retainedBytes` stays 100). `inputs-changed` answers `busy/inputs-changed` with the revision, retains nothing and starts no further run. Every runner failure maps as described, with nothing retained. Service level: `dependencyDiagramInputChanges` is 1 after an analyzer reports changed inputs | pass |
| BD22 | `retainedBytes` is `factBytes + diagram bytes` when hot, stays so after demotion to warm and is the diagram's bytes alone when cold. The result still answers `ready` with no new run. Idle eviction removes the context. After reopening, a newer publication returns `retainedBytes` to `factBytes`. A per-context budget of 1,000 B and a global budget of 8,000 B each return `resource-limit` with the needed and maximum bytes, and nothing is retained. Disposal during a job answers the caller `unavailable/disposed` and aborts the run | pass |
| BD23 | See the BD23 witnesses below | pass |
| BD24 | See the BD24 witnesses below | pass |

BD23 witnesses:

- **Validation.** Missing fields, extra fields, a malformed revision or request ID, and an invalid token are
  `invalid-request` and counted in `rejectedRequests`.
- **Dispatch.** Direct, shared and codec-backed dispatch return equal `ready` values from one runner call.
- **Counters.** `dependencyDiagrams`, `behaviorRuns` and `dependencyDiagramInputChanges` are 0 before any request and
  1/1/0 after the first ready diagram. An inputs-changed run makes them 2/1/1.
- **Retention.** `retainedBytes` includes the diagram. An edit's check releases it.
- **IPC.** The welcome lists `dependencyDiagram`, and the public client maps every outcome:
  - `unavailable/resource-limit` and `unavailable/analysis-failed`;
  - `busy/inputs-changed`;
  - wire cancellation to `cancelled`, with the job aborted;
  - `ready` with a 13.2 MiB diagram framed within the fixture's `maxResponseBytes`;
  - `superseded`;
  - the service errors `unknown-context` and `invalid-request`.
- **Existing operations.** A later `check` still reports the same published revision. The existing test files pass
  unchanged.

BD24 witnesses, from the built daemon on a copy of the toolkit's tracked inputs with `node_modules` linked and the
process probe preloaded into every Node process:

- **Job during other work.** The diagram request starts one analyzer child from the daemon. While it runs:
  1. an identical rewrite of `subs/daemon/src/system-clock.ts` produces a watcher update, which completes without a new
     revision;
  2. `ramify check --root <copy> --changed subs/daemon/src/system-clock.ts` exits 0.

  The job has not settled when the hook exits. It then reaches `ready` at the same revision with complete coverage.
- **Sizes and counters.**
  - The diagram has 70 behavioral and 359 non-behavioral dependencies, 479 boundaries and 326,735 B.
  - `retainedBytes` is the session's 19,807,739 `factBytes` plus 326,735.
  - Ten further requests answer from retention. Counters stay at `dependencyDiagrams: 1, behaviorRuns: 1`.
- **Real edit afterwards.** A content edit and `check --changed` publish revision 2 with exit 0. `retainedBytes` returns
  to the session's `factBytes`, and the diagram counters stay 1/1.
- **Trace.**
  - The daemon process loads neither `subs/analysis/src/dependency-analyzer.js` nor the analysis package entry.
  - No process in the daemon's retained-session tree loads the analyzer or `behavior-classifier.js`, or spawns a
    compiler helper. This includes the forked session supervisor, whose `retained-source-analysis.js` load is traced as
    a positive control.
  - No traced process outside the analyzer tree, including both CLI hooks, loads the classifier.
  - The analyzer tree loads the analyzer, spawns one compiler helper, loads the classifier once and has fully exited.

Recorded in `scripts/probes/results/dependency-diagram-daemon/bd24-ramify.json`: the job took 6,633 ms from request to
ready, with `jobStillRunningAfterWatchAndHook: true`.

### Result sizes for iteration 5

| Project | Input | Diagram | Daemon response frame | Headline | Boundaries |
| --- | --- | ---: | ---: | --- | ---: |
| Ramify (BD24 copy at `27184cc`) | `input/1:da0b0664…fdcf` | 326,735 B | about 331 KB | 70 / 359 | 479 |
| Collection Review | `input/1:7e21fb92…d6cf` | 47,812 B | 52,557 B | 17 / 48 | 65 |

The Collection Review row came from a one-off run: quick environment, real session and the process runner over
`examples/collection-review`. The ready answer took 2,959 ms. Its diagram equals iteration 3's size and input ID.

## Verification

```sh
npx vitest run subs/daemon/subs/contexts/src/tests/dependency-diagram.test.ts         # 8 passed
npx vitest run subs/daemon/subs/contexts/src/tests/context-manager.test.ts            # 24 passed
npx vitest run subs/daemon/subs/contexts/src/tests/explorer-details.test.ts           # 2 passed
npx vitest run subs/daemon/src/tests/service.test.ts                                  # 8 passed
npx vitest run subs/daemon/src/tests/ipc.test.ts subs/daemon/src/tests/codec.test.ts  # 26 passed
npx vitest run subs/daemon/src/tests/session-counters.test.ts                         # 3 passed
npx vitest run src/tests/resident-assembly.test.ts                                    # 6 passed
npx vitest run subs/daemon/src/tests/validation.test.ts                               # 16 passed
npx vitest run subs/analysis/subs/descriptions/src/tests/descriptions.test.ts         # 31 passed
npx vitest run subs/daemon src/tests/quick-environment.test.ts src/tests/entry-boundaries.test.ts  # 31 files, 335 passed
RAMIFY_BD24_ARTIFACT=$PWD/scripts/probes/results/dependency-diagram-daemon/bd24-ramify.json \
  npx vitest run src/tests/dependency-diagram-daemon.test.ts                          # 1 passed (requires npm run build)
npm run type-check                                                                    # clean
npm run build                                                                         # built
npm run check:self   # passed: 15 owners, 385 source files, 0 errors, 0 warnings, 0 analysis limits, 0 denied
```

The resident daemon that `check:self` used was stopped with `dist/src/ramify daemon stop`. BD24 starts and stops its own
daemon in a private endpoint directory. The full test suite was not run.

## Deviations

- **Lookup failures.** C4's outcome union has no `unknown-context`, `expired-generation` or `disposed` reason. The manager
  returns these as `Unavailable`, as other operations do. The service returns `unknown-context` and `expired-generation`
  as service errors and disposal as `stopping`. Eviction during a job answers its callers the same way.
- **Port declaration.** The runner port stays declared in analysis. Root R10 relays it, and the daemon imports only the
  type. No daemon-local port was added.
- **Counters.** They are counted where the service wraps the injected runner, not inside the context manager.
  `dependencyDiagrams` counts analyzer jobs started.
- **Report read.** A warm context's job reads its pinned revision's report with `RetainedSession.report(sequence)`.
  A cold context's job reads the report retained in history. That read is the only retained-session call the job makes.
  It is the same read a report check makes, not diagram work.
- **Slot after abort.** An aborted or superseded job keeps the daemon slot until its child has exited, within the
  5-second disposal limit. Requests meanwhile answer `busy/analysis-running`.
- **Cooling and close.** The retained result survives cooling as well as demotion, because it holds no compiler state.
  "Close" is taken as manager or daemon disposal. `closeContext` releases the client's lease pair, which detaches that
  client's callers.
- **No trimming.** Retention admission does not trim history or evict other contexts; it refuses with `resource-limit`.
- **Activity.** A request does not `touch` the context. Waiting callers hold it instead, and settling updates its
  activity time through the existing lease rule.
- **Added names.** `RetainedDiagram` names the retained result. `dependencyAnalyzerEntry` and
  `ResidentAssemblyOptions.dependencyDiagrams` are the assembly defaults and test override.
- **BD24 watch update.** The watch update during the job rewrites identical bytes. A content change would publish a
  newer revision and, by C4, supersede the job instead of letting it reach `ready`. The real content edit and its
  changed-file check run after the diagram is ready.
- **Descriptions fixture.** Beyond this iteration's relays, the fixture now also records A14, A15 and R9 from iterations
  2 and 3.

## Limitations

- BD24 runs on a copy of the toolkit's tracked `src`, `subs` and root inputs, not the checkout itself, so it can edit
  a file. Daemon settled memory with and without a retained result is iteration 7's measurement.
- The session's retained `factBytes` (19.8 MiB for Ramify) dominate `retainedBytes`. The diagram adds 0.33 MiB.
- Busy answers are not remembered by the daemon. Iteration 5's router owns the one-second `waiting` memory.
- The architecture documents were not updated. Iteration 7 owns documentation.

## Handoff

- **Iteration 5** receives:
  - **Client method.** `ServiceConnection.dependencyDiagram({ token, requestId, revision }, { signal? })` returns
    `ServiceResult<ContextDependencyDiagramOutcome>`. The in-process `RamifyService` and the quick environment's
    connection have the same method.
  - **Outcomes.** All are `ok: true` values:
    - `ready { revision, diagram }`;
    - `busy { revision, reason: 'analysis-running' | 'inputs-changed' }`;
    - `superseded { revision | null }`;
    - `cancelled`;
    - `unavailable { reason: 'resource-unavailable' | 'invalid-current' | 'analysis-failed' | 'resource-limit', message }`.

    Service errors are `invalid-request`, `unknown-context`, `expired-generation`, `stopping` and `cancelled` on a
    closed connection. Aborting the control signal over a socket yields `ok: true, cancelled`.
  - **Capability and counters.** The capability is `'dependencyDiagram'` in `daemon.capabilities`. `DaemonCounters`
    adds `behaviorRuns`, `dependencyDiagrams` and `dependencyDiagramInputChanges`.
  - **Result sizes.** See the table above.
  - **Types.** `DependencyDiagramRequest` and `ContextDependencyDiagramOutcome` are relayed by root R7, and
    `DependencyDiagramFacts` by R9.
  - **Real daemon in tests.**
    - Use `createQuickEnvironment({}, { dependencyDiagrams })` for a real service with a scripted runner. Without the
      option, it runs the real process runner and needs `npm run build`.
    - `ipcFixture(budgets, true, undefined, runner)` provides a real socket with the public client.
    - For the built daemon, follow `src/tests/dependency-diagram-daemon.test.ts`:
      1. use `withProcessScope`;
      2. call `selectEndpoint({ packageRoot, version: '0.0.0', endpointDirectory: scope.endpointDirectory })`;
      3. start `dist/src/daemon-entry.js --endpoint-dir … --build-key … --version 0.0.0 --engine ramify.ts@0.0.0+typescript@7.0.2`;
      4. wait for `readDaemonRecord(...).state === 'running'`;
      5. call `connectDaemon({ start: 'never', daemonEntry: null, packageRoot, endpointDirectory })`;
      6. stop with `stopDaemon`.
- **Iteration 7** receives:
  - **Recipe.** `npm run build`, then
    `RAMIFY_BD24_ARTIFACT=<path> npx vitest run src/tests/dependency-diagram-daemon.test.ts`.
  - **Raw artifact.** `scripts/probes/results/dependency-diagram-daemon/bd24-ramify.json`.
