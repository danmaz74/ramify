# Iteration 3 results: Build the lean dependency analyzer

**Date:** 2026-09-17. **Mode:** direct work in worktree `/tmp/ramify-plan6d-behavioral-diagram`,
branch `feat/plan6d-behavioral-dependency-diagram`. It is based on iteration 2 at `1f313fe`.
The implementation commit is `9195d9e`. Both measurements ran from that clean commit.

## Prerequisites

- Iteration 1's access facts and `behaviorRuns` counter are present. The three existing cases in
  `dependency-behavior.test.ts` and both cases in `dependency-behavior-capability.test.ts` pass with this
  iteration's bridge change.
- Iteration 2's `projectDependencyDiagram` and the two baseline artifacts at `b3552cb` are present.

## Built

### `analysis/typescript`

- `src/interfaces/source.ts` adds `SuppliedAccesses` from C1. `SourceAnalysis.dependencyBehavior(signal?, supplied?)`
  keeps its batch call unchanged.
- `src/bridge.ts`:
  - With `supplied`, it sends `{ kind: 'command', command: 'behavior', supplied: true }`.
  - It serves the accesses and `maxFactBytes` through the parent-served `behavior-inputs` request, in the same way
    `interpret` receives its inputs.
  - A non-positive `maxFactBytes` is rejected as `resource-limit` before any command.
  - Without `supplied`, the frame is byte-identical to before.
- `src/compiler-helper.ts`:
  - A supplied `behavior` command requests its inputs and calls `classifyDependencyBehavior` over them.
  - It never builds the catalog, the interpreter or its own accesses.
  - It encodes the facts within `min(maxFactBytes, RESULT_BYTES)`, so a larger result fails as `resource-limit`.

### `analysis`

- `src/interfaces/dependency-analyzer.ts` holds the C3 types:
  - `DependencyAnalyzerLimits`, `DependencyAnalyzerOutcome` and `DependencyDiagramRunner`;
  - `DependencyAnalyzerInput` and `DependencyAnalyzerTimings`, which name the function input and the timings record.
- `src/dependency-analyzer.ts` implements `analyzeDependencyDiagram`, following C3's steps:
  1. **Report check.** A report that fails `completeReport`, or has no recorded acquisition limits, is
     `invalid-report`. No work starts.
  2. **Acquisition.** `readProject` runs with the report's acquisition limits and one attempt. The analyzer then
     compares the acquired inventory, and the areas derived with `report.registry`, with the report by JSON
     equality.
     - A difference is `inputs-changed`. Its paths are the captured inputs the report did not record, the differing
       inventory files and module descriptions, and `.` when the scopes differ.
     - An acquisition that is no longer valid is also `inputs-changed`, with its issue paths.
     - Acquisition that fails only on its own `resource-limit` or `read-failure` issues is `unavailable`.
  3. **Classification.** `createSourceAnalysis` runs over the acquired view and the report's areas, then
     `dependencyBehavior` with `report.snapshot.accesses` supplied. The helper is disposed before sealing.
  4. **Sealing.** `view.seal()` runs next. A `changed` seal, or any sealed input whose path, role, SHA-256 or bytes
     the report did not record, is `inputs-changed` with those paths in byte order.
  5. **Projection.** The report copy carries the facts and a request that includes `dependency-behavior`, and keeps
     `snapshot.results`. It is passed to `projectDependencyDiagram` with `maxResultBytes`.
     - A projection throw, a refusal other than size, or a `failed` behavior status is
       `unavailable/analysis-failed`.
     - A size refusal is `unavailable/resource-limit`, with the observed and maximum bytes in its message.
- **Cancellation and deadline.** Cancellation returns `cancelled`, and the deadline returns
  `unavailable/resource-limit`. The helper and the input view are disposed in every case.
- **Timings:**
  - `acquireMs` covers acquisition, comparison, sealing and the input comparison;
  - `classifyMs` covers the helper's start, classification and disposal;
  - `projectMs` covers the projection;
  - `totalMs` covers the whole call.
- `src/index.ts` exports `analyzeDependencyDiagram` and the new types from `ramify.ts/analysis`.
- **Exposure.** `module.ramify` A15 exposes `analyzeDependencyDiagram` and `* from "interfaces/dependency-analyzer.ts"`
  to the parent.

### Root `ramify [dispatch]`

- `src/dependency-analyzer-entry.ts` is the analyzer process entry:
  - It reads `{ project, report }` from standard input, bounded by the report response capacity.
  - It runs the analyzer with the batch source limits, 16 MiB `maxResultBytes` and a 115-second analyzer deadline.
  - It writes one JSON outcome line and exits.
  - SIGTERM and SIGINT abort the run, and a malformed request is `invalid-report`.
- `src/dependency-analyzer-process.ts` holds `createProcessDependencyAnalyzer(runtime, entry, options?)`, a
  `DependencyDiagramRunner`, and `dependencyAnalyzerCapacity`:
  - It starts one Node child per run and writes the request to the child's standard input.
  - It accepts one validated outcome within `reportCapacity.responseBytes`.
  - Cancellation, the 120-second job deadline or an oversized response send SIGTERM; the child disposes its helper.
    A child still running 4.5 seconds later is killed.
  - A run settles only after the child closes, and never with a partial outcome.
  - A spawn failure, non-zero exit or invalid output is `unavailable/analysis-failed`.
  - The `deadlineMs` and `responseBytes` options exist for tests.
- `src/batch.ts` exports its existing `limits`, which the entry reuses.

### Probe

`scripts/probes/dependency-analyzer/measure.ts` refuses a dirty worktree, ignoring its own output directory. For each
run, it:

1. runs a full batch with `dependency-behavior` in the built `batch-entry.js`;
2. removes the behavior facts and request from that report, as a published report carries it;
3. runs the built analyzer entry over it.

It samples `ps` every 25 ms for the process tree of each run and records per-role peaks. Roles follow tree position:
process, configuration helper, compiler helper and native compiler. Every run asserts that the analyzer diagram is
byte-equal to `projectDependencyDiagram` over the batch report. The probe also compares against a Plan 6D modularity
artifact that has the same input ID. It writes `scripts/probes/results/dependency-analyzer/<name>.json`.

### Tests

- `subs/analysis/subs/typescript/src/tests/dependency-behavior.test.ts` records the command frames each helper
  receives by wrapping `spawn` for `compiler-helper.` children. It adds:
  - supplied-equals-batch for `path-facts`;
  - a compiler-level `forwarding` fixture, with the same equality;
  - fact bound, zero bound and cancellation refusals.
- `subs/analysis/src/tests/dependency-analyzer.test.ts` builds real on-disk `path-facts` and `forwarding` projects. It
  records helper command frames and counts calls to `openWorkerSession`, `openSessionEngine` and
  `createRetainedSourceAnalysis`. Its fixtures cover:
  - equality with the batch path (BD14/BD15);
  - the three changed-input edits (BD16);
  - incomplete, oversized and cancelled refusals.
- `src/tests/dependency-analyzer-process.test.ts` runs the built entry over a Collection Review report and observes
  the analyzer child and its compiler helper with `ps` (BD17).

### `forwarding` fixture

A real project where root `fixture` is A, `subs/b` is B and `subs/b/subs/a` is B/A. B/A exposes only `act` to its parent,
and B relays `act` with `expose-sub`.

| File | Content |
| --- | --- |
| `subs/b/src/index.ts` | forwards `act`, `secret` and `Settings` from B/A |
| `src/use.ts` | `import { act, secret }` from B; calls `act`; `secret` unused; type use of `Settings` |
| `src/reexport.ts` | `export * from` B |

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| BD14 | **Compiler level:** for `path-facts` and `forwarding`, supplied facts in a fresh lifetime equal the batch lifetime's facts, `toEqual` and byte-equal JSON, frozen. **Analyzer:** over an ordinary report, the diagram is byte-equal to `projectDependencyDiagram` over a requesting batch report with the same input ID, for both fixtures. `path-facts` gives 7 consumer boundaries with partial coverage (1 unknown). `forwarding` gives 6 boundaries: `fixture→fixture/b` for `act` (behavioral, allowed), `Settings` and `secret` (non-behavioral, denied), and B's forwards to B/A. **Probe:** 5 of 5 runs are byte-equal on each project. The Collection Review diagram also equals `plan6d-reference.json` exactly (input `input/1:7e21fb92…d6cf`) | pass |
| BD15 | The supplied lifetime's recorded command frames are exactly `['behavior(supplied)', 'dispose']`, at compiler and analyzer level. It sends no `catalog`, `describe`, `accesses`, `interpreter` or `interpret`, and `behaviorRuns` is 1. The analyzer test records no `openWorkerSession`, `openSessionEngine` or `createRetainedSourceAnalysis` call | pass |
| BD16 | After a report, three edits each return `inputs-changed` with no `diagram` property and byte-ordered paths. Editing `src/use.ts` includes `src/use.ts`. Adding `noUnusedLocals` to `tsconfig.json` includes `tsconfig.json`. Adding module `subs/extra` includes `subs/extra/module.ramify` and `subs/extra/src/index.ts` | pass |
| BD17 | See the process runner observations below | pass |
| BD18 | Measurements below, 5 runs each, from clean `9195d9e` | recorded |

BD17 process runner observations use the built entry over a Collection Review report:

- **Ready.** A ready run's child and helper PIDs are both gone within 5 seconds of settling. Its diagram is byte-equal
  to the in-process analyzer's.
- **Cancellation.** Aborting after both PIDs are observed returns `{ status: 'cancelled' }` in under 5 seconds, and
  both PIDs exit within 5 seconds.
- **Deadline.** The deadline is set to the observed helper start time plus 300 ms. It returns
  `unavailable/resource-limit` without a diagram, and both PIDs exit within 5 seconds of the deadline.
- **Oversized response.** A 1,024-byte response limit returns `unavailable/resource-limit`, and both PIDs exit.
- **Invalid report.** An `invalid` or `incomplete` report returns `invalid-report` from the child and leaves no
  analyzer process. A pre-aborted signal returns `cancelled` without a child.

### Measurements (BD18)

Environment: Linux 6.8.0-85, Node v22.23.2, Intel Xeon E-2176G, 12 threads, 62.7 GiB. Values are medians of 5 runs. The
batch is the complete `check` capability set plus `dependency-behavior` in `batch-entry.js`. The analyzer runs in
`dependency-analyzer-entry.js` over that report without its behavior facts. Peak RSS is the largest sampled value
per role. "Combined" is the largest simultaneous sum over the whole process tree.

| Project | Run | Wall | Acquire | Classify | Project | Analyzer total | Peak combined RSS | Process | Compiler helper | Native compiler |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ramify (`input/1:ffddc7b6…e5f3`) | full batch | 9,109 ms | | | | | 848 MiB | 263 MiB | 310 MiB | 377 MiB |
| Ramify | analyzer | 5,312 ms | 837 ms | 4,193 ms | 41 ms | 5,084 ms | 742 MiB | 189 MiB | 225 MiB | 323 MiB |
| Collection Review (`input/1:7e21fb92…d6cf`) | full batch | 3,218 ms | | | | | 428 MiB | 148 MiB | 145 MiB | 169 MiB |
| Collection Review | analyzer | 2,779 ms | 499 ms | 2,191 ms | 5 ms | 2,698 ms | 387 MiB | 131 MiB | 120 MiB | 153 MiB |

Sizes:

| Project | Batch report | Analyzer request | Analyzer response | Diagram |
| --- | ---: | ---: | ---: | ---: |
| Ramify | 19,444,869 B | 17,155,522 B | ~320,400 B | 320,235 B |
| Collection Review | 1,750,891 B | 1,641,287 B | ~47,980 B | 47,812 B |

Other measured facts:

- The configuration helper peaks at about 60 MiB in both paths.
- Both diagrams have complete coverage.
- Ramify headline is 70 / 351 at this commit, with 469 boundaries. Collection Review is 17 / 48, with 65 boundaries.

The analyzer takes 58% of the batch wall time on Ramify and 86% on Collection Review. Its peak combined memory is 12%
lower on Ramify and 10% lower on Collection Review. Classification dominates in both cases: 82% of analyzer time on
Ramify and 81% on Collection Review. That time covers helper start, compiler program creation and the checker queries of
the classifier.

## Verification

```sh
npx vitest run subs/analysis/subs/typescript/src/tests/dependency-behavior.test.ts      # 6 passed
npx vitest run subs/analysis/src/tests/dependency-analyzer.test.ts                      # 4 passed
npx vitest run subs/analysis/src/tests/dependency-behavior-capability.test.ts           # 2 passed
npx vitest run src/tests/dependency-analyzer-process.test.ts                            # 3 passed
npx vitest run subs/analysis/subs/typescript/src/tests/lifetime.test.ts subs/analysis/src/tests/modularity-batch.test.ts \
  subs/analysis/src/tests/dependency-diagram.test.ts subs/analysis/subs/typescript/src/tests/accesses.test.ts  # 37 passed
npm run type-check                                                                      # clean
npm run build                                                                           # built
npm run check:self   # passed: 15 owners, 383 source files, 0 errors, 0 warnings, 0 analysis limits, 0 denied
npx tsx scripts/probes/dependency-analyzer/measure.ts --root . --runs 5                         # written, clean 9195d9e
npx tsx scripts/probes/dependency-analyzer/measure.ts --root examples/collection-review --runs 5  # written, clean 9195d9e
```

The resident daemon that `check:self` used was stopped with `dist/src/ramify daemon stop`. The full test suite was not run.

## Deviations

- **One selection per access.** The `forwarding` fixture cannot contain one access that selects both an allowed and a
  denied original. The access interpreter records one selection per access; iteration 1 records the same fact. Both
  `import { act, secret }` and `export *` therefore give one access per original. Real per-original status is
  witnessed across the accesses of one declaration (`act` allowed, `secret` denied). The single-access case remains
  iteration 2's pure fixture (BD11).
- **Command witness.** BD15 records the command frames written to each helper's standard input by wrapping `spawn`
  in the test. This follows the existing reference-harness pattern. No production command counter was added.
- **Runner port location.** `DependencyDiagramRunner` and the outcome types are declared in analysis
  (`interfaces/dependency-analyzer.ts`, A15), and root implements the port. C3 gives the types but not their owner
  file. Iteration 4 decides how the daemon receives the port type, either through a root declaration relay or its own
  port declaration.
- **Added names.** `DependencyAnalyzerInput` names the function input and `DependencyAnalyzerTimings` names the
  timings record. `dependencyAnalyzerCapacity` holds the process bounds.
- **Fact bound.** `SuppliedAccesses.limits.maxFactBytes` is fixed by the analyzer at the helper result bound,
  32 MiB − 64 KiB, because `DependencyAnalyzerLimits` does not carry it.
- **Acquisition policy.** Acquisition uses the report's recorded acquisition limits with one attempt. C3 does not say
  what happens when acquisition fails:
  - an invalid project, or a change during acquisition, is `inputs-changed` with its issue paths;
  - acquisition that fails only on its own `resource-limit` or `read-failure` issues is `unavailable`.
- **Request identity.** The inventory includes the scope, so a request that resolves differently from the report's,
  for example `root` given instead of found, differs at step 2. It returns `inputs-changed` with `.`. Callers must pass
  the report's own resolved request (`report.request.project`) or an identical one.
- **Deadline split.** The analyzer's own deadline is 115 seconds and the runner's job deadline is 120 seconds, so
  process exit fits in the job deadline. Invalid analyzer limits are `unavailable/resource-limit`.
- **Toolkit artifact equality.** The toolkit could not be compared with `plan6d-toolkit.json` by input ID. At `b3552cb`,
  checked out in this worktree, the analyzer diagram equals that artifact's production diagram except `inputId`: the
  analyzer gives `ff5bf4ee…` and the artifact has `fe5d6352…`. The captured inputs differ outside the classified
  facts. Collection Review matches its artifact exactly, including input ID.

## Limitations

- **Speed.** The analyzer is materially faster only on Ramify. It is about 42% faster there and about 14% faster on
  Collection Review. Helper start, program creation and classification cost the same as in the batch, and the skipped
  catalog, interpretation and evaluation are a small share on the smaller project. This is recorded for review, as the
  iteration requires, and does not block iteration 4.
- **Retained reports.** A retained session's published report was checked only with a throwaway in-process script,
  not a committed test. For Collection Review and Ramify, `openRetainedSession(...).report()` gave `ready` diagrams
  byte-equal to a requesting batch over the same input ID, with no false `inputs-changed`. Iteration 4's BD24 is the
  committed witness.
- **Cancellation granularity.** The synchronous helper cannot observe an abort signal between consumer files.
  Cancellation terminates the helper (the existing bridge behavior), so no partial facts are returned.
- **Deadline test.** The BD17 deadline case adapts its deadline to the helper start time observed in the preceding
  cancellation case. The oversize case uses a reduced `responseBytes` option instead of a 96 MiB diagram.
- **Toolkit baseline drift.** Ramify's headline at `9195d9e` is 70 / 351, against 69 / 348 at `b3552cb`, because this
  iteration adds toolkit source. Its diagram is 320,235 bytes.

## Handoff

- **Iteration 4** receives:
  - **Runner.** `createProcessDependencyAnalyzer(process.execPath, join(packageRoot, 'dist/src/dependency-analyzer-entry.js'))`
    in `src/dependency-analyzer-process.ts` returns a `DependencyDiagramRunner`:
    `run({ project, report }, { signal }) => Promise<DependencyAnalyzerOutcome>`. It never rejects; start failures
    are `unavailable/analysis-failed`.
  - **Outcomes.**
    - `ready { diagram, behaviorRuns, timings }`;
    - `inputs-changed { paths }`, which maps to `busy/inputs-changed`;
    - `cancelled`, returned only after the child has exited;
    - `unavailable { reason: 'invalid-report' | 'analysis-failed' | 'resource-limit', message }`, where the deadline
      and an oversized response are `resource-limit`.
  - **Project request.** Pass the context's resolved request, which must equal `report.request.project`.
  - **Measurements.** Ramify: 5.3 s wall and 742 MiB peak combined RSS, 320,235-byte diagram. Collection Review:
    2.8 s and 387 MiB, 47,812-byte diagram. Batch: 9.1 s and 848 MiB; 3.2 s and 428 MiB.
  - **Types.** `DependencyDiagramRunner`, `DependencyAnalyzerOutcome` and `DependencyAnalyzerLimits` are exposed by
    analysis A15 to root. Relay the declarations to `daemon` as R9 does, or declare the daemon port there. The daemon
    must not import the runner or analyzer.
  - **Counters.** `behaviorRuns` is 1 per ready outcome, for the daemon counters.
- **Iteration 7** can reuse `scripts/probes/dependency-analyzer/measure.ts` for analyzer peak memory, and the process
  observation pattern in `src/tests/dependency-analyzer-process.test.ts`.
