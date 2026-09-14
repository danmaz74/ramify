# Iteration 13 results: declarations, document revisions, self-check and completion

**Date:** 2026-09-14. **Outcome:** Plan 5 is closed as complete on branch
`close/plan5-completion`; it is not merged to `main`. The eleven final
declarations and the eight package entries validate, `npm run check:self`
accepts the eleven-owner toolkit, the three architecture documents state the
implemented session, and the three regression gates ran on one build.
Two of the three gates are not fully green: the unfiltered `--plan 5` gate fails
the nine waived `I5-13` measurement instances, one open defect and the two
instances that run the Plan 2 gate; the `--plan 2` gate fails four `I2-29`
resident rows, one of them the waived S500. Every failure is recorded by ID
below, none is counted as a pass.

This iteration ran as direct work, not as a Studio-managed iteration, starting
from `2e612ec`. It is also the plan's completion report: Plans 3, 4, 6 and 7
start from what it records.

## Decisions, 2026-09-14

Decisions by Dan, 2026-09-14, recorded verbatim:

> - Iteration 12's remaining measurement workloads are waived: S500 and S1000 are not measured. The other unexecuted I5-13 workloads (checked-set-bounded, repeated-edit-plateau, hot-warm-memory, cold-open, entry-footprints) are also not run for this closure; record them as not executed, never as passed, and list them as remaining gaps. The reference and S100 hook latency rows are established by the hook optimization and structural edits measurement results; cite those.
> - Plan 5 is closed on this branch; merging to `main` is not part of the closure. Do not describe the plan as merged to main.
> - Iteration 11's unconfirmed automation gate: re-run what iteration 13's gate list requires; if the unfiltered `--plan 5` gate still needs the waived measurement instances, record each such instance by ID as waived by that decision rather than faking a pass, and state that the unfiltered gate is therefore not fully green.

The same decisions are recorded in the [main plan](../main-plan.md#validation-and-completion-conditions)
and in [iteration 13](iteration13.md#decisions-2026-09-14).

Three further decisions of the same date, taken while the iteration ran:

1. **The unknown label no longer decides a path.** The revision classifier no
   longer forces the broad path for an input change labelled `unknown`; the
   observer determines creation, deletion or change from the disk and every broad
   reason is decided from the path. The watcher and the context manager are
   unchanged, and the I5-12 live sequences expect `membership` again.
2. **A report carries its own invocation's root selection.** The context overlays
   each request's `scope.selection` and `scope.invokedFrom` on the report it
   delivers; `inputId` stays the context's identity and excludes the invocation's
   discovery climb; `I2-03:same-root-reuse` compares the scope per invocation and
   the input classes as `I2-03:two-worktrees` does, excluding `runId` and
   `inputId`.
3. **Resident measurements run at the end of the closure**, on the final build and
   an idle host: every I2-29 workload except `synthetic-500` and `synthetic-1000`
   as the complete S100 evidence, `synthetic-1000` as a smoke test, `synthetic-500`
   waived. [Waived and unexecuted work](#waived-and-unexecuted-work) records what
   ran; it supersedes the first decision above for the resident workloads it names.

## Delivered scope

Plan 5 as authored, changed by three successor plans:

| Plan | What it changed in the delivered scope | Closure |
| --- | --- | --- |
| [Contract remediation](../../iteration-5-contract-remediation/main-plan.md) | A periodic sweep is maintenance: it never makes a covered request wait or marks a context reconciling. A cancelled sweep or revision leaves the session as published. Timing budgets other than the hook's acceptable-time budget became ideal budgets. | [iteration 3 results](../../iteration-5-contract-remediation/iterations/iteration3-results.md) |
| [Hook optimization](../../iteration-5-hook-optimization/main-plan.md) | Timing fields, a maintained observed-input list, publication that builds only what a revision keeps, reused root resolution, racing hooks answered on publication, the build-time runtime identity with the Bun-compiled client, and RSS sampling without a process per message. | [closure](../../iteration-5-hook-optimization/iterations/closure.md) |
| [Structural edits](../../iteration-5-structural-edits/main-plan.md) | The `membership` path for created and deleted files, resolution reuse validated by the discovery snapshot, and the reacquisition sweep skip. Revision of 2026-09-14: a hook that names a configuration file is answered at once as not checked with reason `configuration-changed`. | [closure](../../iteration-5-structural-edits/iterations/closure.md) |
| [Repeated deletions](../../iteration-5-repeated-deletions/main-plan.md) | Withdrawn on 2026-09-14 without starting. | none |

Iterations 1 to 11 of this plan completed; iteration 12 produced its harness and
three of nine workloads before the stop recorded in the
[closure of 2026-09-13](../closure.md), which this report supersedes.

## Iteration 13 deliverables

### 1. Final declarations

`scripts/validate-final-contracts.ts` already read [owners.md](../owners.md) as
its third reviewed layer, with `openRetainedSession` as the `./analysis` witness.
On the final build it reported
`{"owners":11,"files":292,"expandedStatements":82,"packageEntries":8,"bin":"dist/src/ramify"}`.
The new `I5-14:declarations-final` handler also requires the six added lines
(T3, T4, T5, P4, A11, A12) by their literal text and the removal of the increment
line. `I5-14:package-entries-unchanged` resolves the eight entries and the bin
from a packed install, requires `./analysis` to export `openRetainedSession` and
not `analyzeIncrement`, and requires the `./cli` and `./client` import closures
to load no session, worker or compiler module.

### 2. Self-check

`npm run check:self` ran once on the final build, through the resident daemon
with a private endpoint directory, and completed in 5.3 s:

```
Mode: resident (daemon; revision 1; cold; synchronized; revision reused)
Execution: completed; check: passed; coverage: complete
Completed scope: 11 owners, 284 source files, 8 resources, 3795 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 2681 allowed, 0 denied, 1114 external
```

Every stage and every requested capability executed. The twenty-two walked
source areas are the eleven owners' `src/` and `src/tests/`. The daemon was
stopped afterwards. `npm run type-check` passed the four compiler scopes in
2.3 s and `git diff --check` reported nothing.

### 3. Document revisions

- [Daemon and analysis](../../../architecture/daemon.md): status; the runtime
  structure and ownership tree; the responsibility table; a new
  [Implemented retained session](../../../architecture/daemon.md#implemented-retained-session)
  section with the session in a worker thread inside a supervisor process, the
  per-file facts, the revision paths, the audit, the covering rule, the sweep,
  deadlines and levels, and the hook request and reply; the toolkit self-check;
  the decisions still requiring review.
- [Memory lifecycle](../../../architecture/memory-lifecycle.md): status; the
  compiler server as a bounded cost; a new
  [Retained sessions and their levels](../../../architecture/memory-lifecycle.md#retained-sessions-and-their-levels)
  section with the hot, warm and cold levels and their defaults; the measurement
  paragraph.
- [Processes and clients](../../../architecture/processes-and-clients.md):
  status; topology with the session supervisor process; the service boundary;
  the implemented commands, `ramify check --changed` with its exits and the
  example host adapter.
- Each status line states that the MCP adapter, unsaved-content overlays and the
  explorer are not implemented.
- The two proposal analyses and the roadmap are not on this branch or carry
  uncommitted edits elsewhere; their edits are in
  [Edits for files outside this branch](#edits-for-files-outside-this-branch).
- [Main plan](../main-plan.md) status line, [closure](../closure.md) supersession
  note and [iteration 13](iteration13.md) decisions.

### 4. Regression gates

Every gate ran once on the final build (`cefe732`, the last commit that changes
code or the harness), from the worktree, with a private daemon endpoint directory
and no other command of this work in flight. Reports are under
`.reference-work/reports/`.

**`npm run reference:verify -- --plan 1`: 308 of 308 required instances passed,
none failed, none unexecuted.** 16 min 04 s;
`plan1-full-7cfd1070-8ed2-4a18-8420-454bc29626a8.json`.

**`npm run reference:verify -- --plan 5`, unfiltered: 103 required instances, 91
passed, 12 failed, none unexecuted.** 41 min 28 s;
`plan5-full-9b8035d2-af90-4d2f-b649-32c4b5fdf61c.json`. The gate is therefore not
fully green. Its twelve failures are:

| Instance | Why |
| --- | --- |
| `I5-13:hook-latency-s500`, `I5-13:hook-latency-s1000`, `I5-13:checked-set-bounded`, `I5-13:repeated-edit-plateau`, `I5-13:hot-warm-memory`, `I5-13:cold-open`, `I5-13:entry-footprints` | `npm run measure:fast` was not run for these rows, by Dan's decision of 2026-09-14; each is waived by ID, never counted as passed |
| `I5-13:hook-latency-reference`, `I5-13:hook-latency-s100` | failed in the unfiltered run for lack of evidence; measured afterwards on the same build and passed when re-run alone, see the [addendum](#addendum-2026-09-14-hook-latency-on-the-final-build) |
| `I5-12:burst-coalesced` | failed the reviewed condition that one revision covers the burst; that expectation was [amended](#changed-harness-expectations) by the decision of 2026-09-14 and the instance passes when re-run alone on the amended harness, with hook sequences `[2, 3, 3, 3, 3]` over the two published revisions 2 and 3 |
| `I5-10:plan2-gate-amended`, `I5-14:plan2-regression` | both run the whole `--plan 2` gate themselves, and that run had no resident measurement report in its environment, so its nine `I2-29` instances failed. `I5-14:plan2-regression` names exactly those nine and nothing else, so every other required Plan 2 instance passed inside this gate |

**`npm run reference:verify -- --plan 2`, with `RAMIFY_RESIDENT_MEASUREMENT_REPORT`
pointing at the merged resident report: 184 instances, 174 required, 170 passed,
4 failed, none unexecuted.** 14 min 40 s;
`plan2-full-0ea4b5b2-f33a-4e6d-856c-45f4d9f91aa9.json`. Ten `I2-10` and `I2-11`
instances report `superseded`, exactly the ten the
[supersession record](../../done/iteration-2-resident-verification/supersession-plan5.md)
names.

Its four failures are all resident measurement rows:

| Instance | Outcome |
| --- | --- |
| `I2-29:synthetic-500` | waived by Dan's decision of 2026-09-14; not run, never counted as passed |
| `I2-29:synthetic-1000` | run once as the smoke test; the workload failed, see the [measurements](#resident-measurements) |
| `I2-29:many-contexts` | run; it stalled and was terminated, see the [open defects](#open-defects) |
| `I2-29:entry-footprints` | measured; one binding predicate fails, see the [open defects](#open-defects) |

The other five `I2-29` rows pass: `cold-warm-broad-reference`,
`cold-warm-broad-hundred`, `repeated-edit-plateau`, `slow-consumer` and
`publication-peak`.

`I5-10:plan2-gate-amended` and `I5-14:plan2-regression` were not re-run against
this report. Both require every required Plan 2 instance to pass, and
`I2-29:synthetic-500` is waived, so both fail whatever the environment carries.

### 5. Command documentation

The [testing guide](../../../development/testing.md) command list gains
`dist/src/ramify check --changed`, `npm run measure:fast` and the
`RAMIFY_ENDPOINT_DIR` convention for every scripted resident run, and corrects
the Plan 2 and Plan 5 gate rows. The root [README](../../../../README.md) shows
`check --changed` beside the other commands and links the
[example hook adapter](../../../../examples/hooks/README.md).
[Resident verification](../../../development/resident-verification.md) describes
the six I5-14 handlers.

### 6. This report

## Defects fixed

Each was found by a gate, reproduced by a focused test that failed before the
fix, and fixed in its owner.

| Defect | Found by | Owner and fix | Focused test |
| --- | --- | --- | --- |
| A production build of any root other than the toolkit failed with `ENOENT`: the compiled-client packaging made `scripts/build-production.ts` chmod `src/cli-entry.js`, write the runtime identity and compile the client unconditionally | `I1-30:production-selection/testing-module` | build script: those steps run only when the selection includes `src/cli-entry.ts` (`48e1487`) | `scripts/reference-harness/production.test.ts` `bootstraps without dist, ...`, which now also requires no identity or executable for a non-toolkit root |
| A failed open stayed memoized in the capture's pending reads, so every later read returned the old failure and a retained session never recovered from a transient read failure | `I2-09:resolver-failure` | `project` `capture.ts` (`ca46b13`) | `capture.test.ts` `reads a file again after a failed open instead of keeping the failure` |
| A local update rebuilt a changed description's module record from the previous inventory, dropping a README purpose of the same module applied earlier in the update | `I2-25:hundred-owner-sequence` | `project` `observer.ts` (`0beea05`) | `observer.test.ts` `keeps both a README purpose and a description of the same module changed in one update`; `session-revision.test.ts` `keeps a README revert that arrives together with %s` (three cases) |
| `reference:verify` exited 0 without a report when a handler awaited a promise that never settled | the Plan 2 gate, which hung in `I2-08:unwatched-dependency` and printed nothing | harness `verify.ts` (`c804fbc`) | `verify.test.ts` `fails a verification process that exits before its gate settles` |
| The process probe recorded `fork` and `execFile` as untracked launches, so every lifecycle process scope that opened a retained session failed its cleanup evidence | `I2-15`, `I2-18`, `I2-20`, `I2-27` process instances | `src/tests/process-probe.mjs` records both as spawns with their child pid (`eee6f70`) | the thirteen process instances themselves |
| `subcases.md` still described `I5-11:changed-exit-2-not-checked` with five runs after `e81d3fa` added the configuration run to its record, so every Plan 5 gate reported an inventory issue | `plan5.test.ts` | reviewed inventory row (`4379f92`) | `plan5.test.ts` |
| A watched create or delete never reached the membership path: Node's watcher reports each created, deleted or atomically replaced file as a rename, the context manager labels a rename `unknown`, and the revision classifier forced the broad path for any `unknown` change | `I5-12:reference-sequence-live`, `I5-12:hundred-owner-sequence-live` | `analysis` `session-revision.ts`: the `unknown` condition is removed from the broad rule and from its whole invalidation, since the observer re-observes every named path and determines creation, deletion or change from the disk, and every broad reason is decided from the path and that finding | `session-revision.test.ts` `membership-identity-equals-batch: a created owned file labelled unknown takes the membership path` and `... a deleted owned file labelled unknown ...`, `takes the observer-determined path for an unknown event that changes an owned input`; `membership-differential.test.ts`, whose generated sequences now label about two steps in five `unknown`, passed 10 seeds of 6 steps on each fixture, 120 compared steps; both I5-12 live sequences pass with the `membership` expectation restored |
| Every report a shared context delivered carried the opening invocation's `scope.selection` and `scope.invokedFrom`, so a second lease that found the same root from a subdirectory received another invocation's root selection | `I2-03:same-root-reuse` | `contexts` `context-manager.ts`: `deliver` overlays `scope.selection` and `scope.invokedFrom` from the requesting invocation's own resolution, which the context already holds per `projectKey`, while `scope.root`, `scope.configuration`, the captured inventory and `inputId` stay the context's identity (`310f826`) | `root-resolution.test.ts` `lease-scope-invocation` |

## Changed harness expectations

Every expectation changed in this iteration, with the successor-plan decision
that justifies it. No assertion was loosened without one.

| Instance | Before | After | Justification |
| --- | --- | --- | --- |
| `I1-30:production-selection/toolkit` | the toolkit build emits exactly the selected files | the selected files plus `runtime-identity.json` and the host compiled client | hook optimization iteration 6 and the compiled client (`b6275fc`, `f2f24d8`): [build binding](../../../architecture/optimization.md#build-binding) |
| `I2-05:generation-on-reopen` | exactly three idle steps expire the generation | the generation expires within a bounded idle schedule of six steps | contract remediation: a periodic sweep runs while a context has activity, and idle work in flight defers the level transition until it completes |
| `I2-08:unwatched-dependency` | `reconciling` while the interval sweep runs | `synchronized` while a periodic sweep runs; the pending capture is always released | contract remediation RC-1 to RC-4: a periodic sweep never marks a context reconciling |
| `I2-09:invalid-description`, `I2-09:invalid-recovery` | an invalid revision's identity starts with `input/1:` | `input/1:` or `invalid/1:` followed by a SHA-256 | Plan 5 iteration 7: an invalid session revision carries the sealed `invalid/1:` identity |
| `I2-14:token-preservation` | direct and IPC replies byte-identical | identical except the report's `runId` and the reply `timings` | hook optimization resolved decision 3 (a full report is built on request) and HO-1 (reply timings) |
| `I2-19:daemon-entry-boundary` | the daemon spawns `compiler-helper` | the daemon launches the session supervisor, whose descendants start the compiler server | Plan 5 iteration 8: the session runs in a supervisor process |
| `I2-24:quick-check-flow` | Mode line `context; revision; synchronized` | Mode line adds the revision path | Plan 5 main plan, commands table: the `Mode:` line adds the revision's path |
| `I2-24:codec-in-direct-channel` | local and transported reports identical | identical except `runId` | hook optimization resolved decision 3 |
| `I2-30:package-entries`, `I2-30:relocated-resident` | duplicate assertion name with relocation | the completion witness names its own launcher assertion | no expectation changed; relocation gained the same assertion with the compiled client |
| `I5-07:created-importing-file` (reviewed row changed) | path `broad`, every file checked | path `membership`, the new file checked and not every owned file | structural edits SE-10 `membership-path-narrow` |
| `I5-07:audit-equal-sequence` steps 11 and 12 | `broad` created and deleted | `membership`; the deletion checks no other file | structural edits SE-10 |
| `I5-07:deleted-file` (reviewed row changed) | path `broad`, every owned file and access checked | path `membership`, a checked set naming no file and no access; the file leaves inventory, catalog and coverage and its finding is in `delta.removed` | structural edits SE-9 and SE-10: a referenced and an unreferenced deletion take the `membership` path, and its [amendment of 2026-09-14](../../iteration-5-structural-edits/main-plan.md) keeps a watched removal off the broad path |
| `I5-05:file-deleted-local` (reviewed row changed) | delete the source an `expose-src` names and expect a `local` update whose references record a missing target | delete a source no exposure names for the `local` update, then delete the exposure target for an `invalid` update carrying the missing source reference, with the previous inventory still current | structural edits `ff22508`: a local update whose exposure target lost its exact file is rejected, as the acquisition rejects it |
| `I2-03:same-root-reuse` | the second lease's report and its own batch run agree on every field but `runId` | each report states its own invocation, and the declaration, registry, engine, source and configuration input classes agree with that invocation's batch run over shared path labels, excluding `runId` and `inputId` | iteration 13 decision 2 of 2026-09-14: a report carries its own invocation's root selection and `inputId` stays the context's identity, so an invocation's discovery climb is excluded ([daemon](../../../architecture/daemon.md), [CLI invocation contract](../../../architecture/cli-invocation.spec.md)) |
| `I5-12:burst-coalesced` | one revision covers all five writes and the sequence advances by one | every hook is answered from a revision covering its own identity, none receives `superseded`, and the burst publishes at most two revisions, so the sequence advances by one or two | Dan's decision of 2026-09-14: the daemon's behaviour is kept. A hook arriving while the context holds a pending debounce cancels it and captures at once, which is what keeps every ordinary hook off the watcher's 100 ms window, so the first racing hook publishes its own revision and the hooks that queue behind that capture are answered together from the next one. The expectation now states the bound the design guarantees |



## Open defects

The `I2-29:many-contexts` stall this section recorded is fixed; its diagnosis,
fix and measured workload moved to
[the addendum below](#addendum-2026-09-14-the-many-contexts-stall).

**`I2-29:entry-footprints` cannot sample the compiled client's help entry.** The
binding predicate `help contains real externally sampled RSS` observes 0: the
Bun-compiled client answers `ramify --help` in 25.5 ms, and the 50 ms POSIX
sampler caught it only once, already exiting, with no resident bytes. Every other
predicate of the workload passes, including all five advisory footprint targets.
The verifier fixes the sampling interval at 50 ms, so the recipe cannot observe an
entry this fast. The decision needed: measure a sub-50 ms entry differently, or
record the help row as unmeasurable for the compiled client.

## Resident measurements

Run last, on the final build, serially, with no other command of this work in
flight, one `npm run measure:resident -- --workload <suffix>` invocation per
workload. `RAMIFY_MEASUREMENT_ACTIVITY` recorded
`Plan 5 iteration 13 closure; idle host, no concurrent builds, matrix runs or
other measurements`; the environment snapshot each report carries also lists
unrelated resident processes of the host (an agent session and Playwright
servers) that performed no work during the runs. Each invocation exits 1 because
the other eight workloads are unmeasured in it; its own row is what counts.

| Workload | Duration | Row | Figures against their targets |
| --- | ---: | --- | --- |
| `entry-footprints` | 16 s | measured, one binding predicate fails | client RSS 48.1 MiB of 64 MiB, idle daemon 62.3 MiB of 96 MiB, daemon with one reference context 71.1 MiB of 192 MiB, reference CLI check 62.1 MiB of 96 MiB, S100 CLI check 93.1 MiB of 160 MiB; `help` has no externally sampled RSS |
| `cold-warm-broad-reference` | 2 min 49 s | measured, passed | cold median 2,532 ms of 6,000; unchanged 561 of 1,500; README 567 of 1,000; exposure 610 of 2,500; source 612 of 4,500; configuration 1,829 of 5,500; service-side status 0.06 ms of 50; end-to-end status 57.6 ms of 300 |
| `cold-warm-broad-hundred` | 5 min 09 s | measured, passed | cold median 4,960 ms of 16,000; unchanged 1,153 of 3,000; README 1,206 of 2,000; exposure 1,276 of 5,000; source 1,219 of 8,000; configuration 3,817 of 12,000; service-side status 0.06 ms of 50; end-to-end status 52.5 ms of 300 |
| `repeated-edit-plateau` | 10 min 42 s | measured, passed | 200 cycles on each fixture; reference settled RSS growth 1.52 MiB of 64, heap beyond history 123 KiB of 16 MiB; S100 RSS growth −11.0 MiB, heap 24 KiB; retained facts 9.99 MiB of 96 MiB per context on every settled cycle |
| `many-contexts` | 47 min 06 s | failed | the seventh of eight S100 contexts never completed its check; terminated |
| `slow-consumer` | 46 s | measured, passed | ten real S100 publications; admitted outbound queue 126.4 MiB of 128; socket disconnect 1,002 ms of 2,000; RSS recovery 22.2 MiB of 32 |
| `publication-peak` | 16 s | measured, passed | reference combined peak 400.6 MiB of 512; S100 combined peak 399.7 MiB of 768 |
| `synthetic-1000` | 57 s | failed | the S1000 cold check exited 2 with `resource-limit: maxRetainedFactBytes limit 100663296 exceeded (observed 167266182)` |

**S1000 smoke test.** Decision 3 asked for a few samples. `synthetic-1000` is a
standalone `--workload`, so it ran once in its reviewed form: a cold CLI check of
S1000 through the daemon, followed by a source edit. It got no further than the
cold check, which the daemon refused after exceeding the 96 MiB per-session
retained-fact limit with 159.5 MiB of facts. No S1000 latency figure exists. The
row is recorded as smoke-tested and failing, never as the plan's workload.

**S500 is waived** and was not run.

Raw evidence, appended by the command itself in the archive's own format, is
under `scripts/measurements/results/` with its `index.json` records:

| Workload | Archive |
| --- | --- |
| `entry-footprints` | `resident-2026-09-14T14-13-56.663Z-f988f0d7-c7aa-4b24-96f5-49c6ca4fd9e2.json.gz` |
| `cold-warm-broad-reference` | `resident-2026-09-14T14-24-47.359Z-35f8cdfe-3c95-4675-b7a0-b5a3da4f2f16.json.gz` |
| `cold-warm-broad-hundred` | `resident-2026-09-14T14-27-36.672Z-c2ba8606-5247-45c0-9b43-65953578692b.json.gz` |
| `repeated-edit-plateau` | `resident-2026-09-14T14-32-45.260Z-26c11cd0-86cd-4e51-b09c-a8cacfbbee23.json.gz` |
| `many-contexts` | `resident-2026-09-14T14-43-27.767Z-cccce697-628b-48a3-a3f5-19ecd24ee7d9.json.gz` |
| `slow-consumer` | `resident-2026-09-14T15-30-33.291Z-397835fb-5dfa-4b74-b598-0beedc15b22a.json.gz` |
| `publication-peak` | `resident-2026-09-14T15-31-20.132Z-9a79485a-39b4-4732-827f-4f735c525636.json.gz` |
| `synthetic-1000` | `resident-2026-09-14T15-31-35.394Z-599a278a-330c-4357-bc2e-e5ecfb7e678c.json.gz` |

The Plan 2 gate consumes one report. Nine per-workload reports cannot be composed
through `ramify.resident-composition/1`, which requires an artifact for every
reviewed workload and S500 has none, so the eight runs were merged into one
`ramify.resident-measurements/1` report by
[`evidence/merge-resident.mjs`](../evidence/merge-resident.mjs): it requires the
schema, inputs, dependencies, budgets, sampling, fixtures, client and
prerequisites of every run to be identical, copies each executed workload row
verbatim from the run that produced it, leaves `synthetic-500` as its
`not-executed` placeholder, and takes the earliest `measuredAt` and the latest
`completedAt`. It invents no measurement: the gate recomputes every predicate
from the raw samples inside each copied row. The merged report is a derived
artifact of about 95 MB and is not checked in; rebuild it from the eight archives
above.

## Addendum, 2026-09-14: hook latency on the final build

Run after the closure commit, at Dan's request, because the created and deleted
rows are the ones the `unknown`-label decision changes and the closure had only
re-cited the structural edits figures for them. Same build (`cefe732` code, docs
commits since), idle host, one `npm run measure:fast -- --workload <suffix>`
invocation per fixture, S100 first, then the reference; the run itself exits 1
because the other seven `I5-13` rows stay unmeasured in it.

| Fixture | Cycle | Session work, median | Ideal budget | Hook end to end, median (p95) |
| --- | --- | ---: | ---: | ---: |
| S100 | created | 440 ms | 1,500 ms | 503 ms (563) |
| S100 | deleted | 466 ms | 1,500 ms | 503 ms (557) |
| S100 | body | 84 ms | 60 ms | 122 ms (151) |
| S100 | source | 182 ms | 400 ms | 221 ms (258) |
| S100 | description | 127 ms | 500 ms | |
| S100 | README | 37 ms | 60 ms | |
| S100 | configuration | 2,792 ms | 2,500 ms | |
| reference | created | 271 ms | 600 ms | 318 ms (351) |
| reference | deleted | 275 ms | 600 ms | 320 ms (351) |
| reference | body | 37 ms | 25 ms | 100 ms (102) |
| reference | source | 64 ms | 250 ms | 107 ms (116) |
| reference | description | 47 ms | 120 ms | |
| reference | README | 18 ms | 30 ms | |
| reference | configuration | 1,334 ms | 1,000 ms | |

Every created and deleted cycle, forty per fixture, took the membership path.
The figures match the structural edits measurement of 2026-09-13 (S100 created
496 ms, deleted 472 ms): the `unknown`-label decision changes which deliveries
reach the membership path, not its cost. This recipe's hook names the file, so
it exercises the route the earlier measurement also exercised; a create or
delete the watcher delivers first now takes the same path (the I5-12 live
sequences verify it) but has no latency figure of its own. Body and
configuration exceed their ideal budgets, which is the state the hook
optimization closure recorded; ideal budgets never fail a workload. The two
misses of the configuration row predate the not-checked answer, which this
recipe does not exercise.

Both reports pass `verify-fast-evidence.mjs`, and `I5-13:hook-latency-s100` and
`I5-13:hook-latency-reference` pass when run alone with
`RAMIFY_FAST_MEASUREMENT_REPORT` naming the matching report; the unfiltered gate
result above is not re-run. Archives under `scripts/measurements/results/`:
`fast-2026-09-14T17-22-06.117Z-2854649b-cacd-4714-9502-4e5be8b334fd.json.gz`
(S100) and `fast-2026-09-14T17-25-50.216Z-2d31ee3c-0693-4cc4-91d2-bbc2ae1c42c6.json.gz`
(reference).

## Addendum, 2026-09-14: the many-contexts stall

`I2-29:many-contexts` failed at closure: the seventh of eight S100 contexts never
completed its check and the workload was terminated after 47 minutes. It was
diagnosed and fixed after closure on branch `investigate/many-contexts`, from
`b642c3f`.

**Smallest reproduction.** Not the context count: the idle time after the third
context. Three S100 contexts back to back, a 90 s idle dwell, then a fourth. Three
contexts are the fewest that demote one (`maxHotContexts` is two), and the runaway
began one `sweepIntervalMs`, 30 s, after the demoted context's last activity. In
the failing build the demoted session's supervisor reached 185 % of a CPU (927
jiffies in a 5 s `/proc` sample) with no client request outstanding, and the
fourth context's check never completed; the instrumented daemon's own worker trace
showed 5.8 replies/s, about 2.9 sweep and verify pairs per second, indefinitely.
The eight-context run merely took longer than 30 s to open, so it first noticed
the stall at the seventh.

**Cause.** The idle audit stayed armed through a demotion, and its failure re-armed
it at once. `auditLater` (`context-manager.ts:144-151`) armed `auditRequired` and a
background `verify`; `demote` (`:84-90`) released the compiler and cancelled
nothing. `verify` on a compiler-released session then always threw:
`session-engine.ts:192` to `session-audit.ts:55` to `recomputeAll`
(`session-revision.ts:200-214`), which kept the retained adapter and called
`describe`, whose `#requireProject` (`retained-source-analysis.ts:218`) failed
because `releaseCompiler` had discarded the project (`:260`, `:332`); `verify` was
the one operation `session-host.ts:135-138` left without a failure conversion. The
catch at `context-manager.ts:448-450` set `sweepRequired`, the `finally` at `:468`
re-armed the audit with no timer and kicked at once, and the next capture paid a
full 320 ms re-observation before failing again. With `maxConcurrentAnalyses` at
one, the pump (`:473-484`) scanned contexts in insertion order and the looping
context was always ready, so the next context's pending synchronized request was
never scheduled. The audit cadence `daemon.md` states, at most once per revision,
was broken.

**Fix.** Two commits, both audited PASS:

| Commit | Change |
| --- | --- |
| `8f091f4` | The audit is armed only while the session is hot, a demotion cancels an armed audit and its background `verify`, a compiler-released `verify` returns a reported `unavailable` outcome instead of throwing (`session-engine.ts`, converted in `session-host.ts` as `update` and `sweep` already were), and an attempt is recorded against its revision, so a failed audit sets no `sweepRequired`, re-arms nothing and waits for the next revision. |
| `46d45b2` | The pump takes contexts with a waiting synchronized request in a first pass and background work only in a second, so background maintenance cannot hold the single analysis slot against a waiting client. A demotion races `releaseCompiler` against the new `demoteDeadlineMs` budget, 5 s, and evicts an unresponsive session under pressure; `ContextStatus` adds `demoting` and `unresponsiveSince`, which the codec and the JSON `ramify daemon status` document carry. |

**Tests.** Five in the contexts owner's `src/tests/hot-budget.test.ts`, on the
scripted clock and driver: a demotion cancels the armed audit and the demoted
context runs no work over five sweep intervals; a rejected audit counts as the
attempt for its revision and the next audit waits for the next revision; a
reported `unavailable` audit is accepted as that attempt; a waiting synchronized
request is captured before another context resumes its background work; and a
`releaseCompiler` that never answers evicts the context at its deadline with
reason `pressure`, with the unresponsive demotion in the status and the waiting
context published. Each fails on the code before its fix. `context-manager.test.ts`,
`root-resolution.test.ts`, `covering.test.ts`, `deadlines.test.ts`,
`session-driver.test.ts`, the daemon codec, service, session-counter and
validation tests and `subs/analysis/src/tests/retained-session.test.ts` pass
unchanged.

**Gates.** The reproduction was re-run on the rebuilt tree: the demoted
supervisor held 0 jiffies in both 5 s `/proc` samples taken during the 90 s dwell,
where the failing build held 927, and the fourth context checked in 4,496 ms. The
workload then ran on the same build: `I2-29:many-contexts` is measured and passed
in 44 s, with all eight of its predicates and no advisory miss. Settled RSS is
134.2 MiB of the 1,024 MiB target and global retained bytes 64.1 MiB of 512 MiB,
over eight warm contexts, two of them hot and six with released compilers, each
retaining 7.98 MiB of facts. The invocation exits 1 because the other eight
workloads are unmeasured in it. `RAMIFY_MEASUREMENT_ACTIVITY` recorded a host
shared with one idle agent session and idle editor servers, no concurrent builds,
audits or other measurements, load average 1.19 at start. Archive:
`scripts/measurements/results/resident-2026-09-14T18-33-21.430Z-1b256c8a-372f-4060-be51-1e493331dc5a.json.gz`.
`npm run type-check`, `git diff --check` and `npm run check:self`, which checks all
eleven owners, pass on the final tree.

**Left open.** `I2-29:entry-footprints` is unaffected and stays open. The
demotion deadline is a budget of the context manager only; a session that stops
answering other operations is still bounded by the existing request deadlines.

## Waived and unexecuted work

**Waived by Dan's decisions of 2026-09-14** (not executed, never counted as
passed):

- `I5-13:hook-latency-s500` and `I5-13:hook-latency-s1000`, and the S500 resident
  workload `I2-29:synthetic-500`.
- `I5-13:checked-set-bounded`, `I5-13:repeated-edit-plateau`,
  `I5-13:hot-warm-memory`, `I5-13:cold-open`, `I5-13:entry-footprints`: not run
  for this closure.
- `I5-13:hook-latency-reference` and `I5-13:hook-latency-s100` had no evidence
  on the final build when the unfiltered gate ran, so it failed them. Dan then
  asked for the created and deleted rows, which today's `unknown`-label fix
  targets; both workloads were measured on the same build and both instances
  pass, see the [addendum](#addendum-2026-09-14-hook-latency-on-the-final-build).

`npm run measure:fast`, the recipe behind every `I5-13` row, was therefore not
run. The nine `I5-13` instances fail the unfiltered Plan 5 gate and are recorded
here by ID.

**Resident measurements ran** under decision 3 of 2026-09-14: seven workloads as
the complete S100 evidence and `synthetic-1000` once as a smoke test. Five rows
pass, `entry-footprints` misses one binding predicate, and `many-contexts` and
`synthetic-1000` failed. [Resident measurements](#resident-measurements) records
every figure; `I2-29:synthetic-500` stays waived by ID.

Also not run by hand, per the instructions for this work: `npm test` and the full
`npm run reference:cases` suite (focused files and the three gates ran instead),
and the non-dry `npm run reference:report`, which runs the example's Vitest and
Cucumber tiers.

## Platform evidence

No macOS run exists for any Plan 5 build, and none can run on this Linux host.
The latest recorded macOS evidence is Plan 2's: the
[remediation](../../iteration-2-resident-verification/remediation-2026-09-11.md#macos-portability-verification)
records 308 of 308 Plan 1 cases, 78 of 78 resident process and IPC cases and
1,243 toolkit tests on Darwin arm64 in validation run 34599155866, and the
composed focused run 34615302017, on 2026-09-11. HO-19 drives the macOS RSS
sampling path on Linux. The worker and process suites on macOS remain a gap.

## Vocabulary and contracts for later plans

The exact shapes are in [contracts.md](../contracts.md), which the successor
plans updated to the implemented source.

**Session and revision.** `openRetainedSession(inputs: SessionInputs)` returns
`SessionOpen`; a `RetainedSession` offers `current`, `update(changes, control,
invocation)`, `sweep`, `verify`, `report(control, sequence)`, `releaseRevision`,
`status`, `releaseCompiler` and `dispose`. A `SessionRevision` is frozen plain
data: `sequence`, `inputId`, `inputs`, `changed`, `checked`, `outcome`,
`summary`, `diagnostics`, `warnings`, `coverage`, `delta` and `timings`.
`SessionUpdate` is `revised` (with `identical` and `reacquired`), `reported` or
`cancelled`; `VerifyOutcome` is `equal`, `mismatch` or `cancelled`.
`SessionStatus.level` is `hot` or `warm`.

**Checked set, delta and timings.** `CheckedSet` is `{ path, files, accesses,
modelRebuilt }` with `RevisionPath` `cold`, `unchanged-surface`, `source`,
`description`, `metadata`, `membership` or `broad`. `FindingDelta` is `{ added,
removed, positionOnly }` by diagnostic identity. `RevisionTimings` names
`classify`, `inventory`, `compiler`, `descriptions`, `accesses`, `link`, `decide`,
`publish` and `total`; `OperationTimings`, `CaptureWork`, `CaptureTimings` and
`ReplyTimings` add the invocation check, promotion, worker status and round trip,
sweep, publication, service and client transport durations beside them.

**Contexts.** `ContextRevision` carries fingerprints from the observed inputs, the
checked set and `capture` timings; `CheckRequest` carries `scope` (`report` or
`delta`), `since` and `deadlineMs`; `CheckOutcome` adds `cold` and
`deadline-exceeded`; `UnavailableReason` adds `unobserved-input` and
`configuration-changed`; `ContextBudgets` adds `maxHotContexts`,
`sweepIntervalMs` and `updateDeadlineMs`. `CheckDelta` is `{ since, findings with
new, removed, warnings, coverage }`.

**The compact reply and `ramify.check/1`.** `CheckDocument` carries
`schemaVersion`, `root`, `revision` (`id`, `sequence`, `path`) or null, `since`,
`changed` (`path`, `sha256`, `covered`), `outcome` (`checked` or `not-checked`),
`reason`, `execution`, `findings` with `new`, `removed`, `warnings`, `coverage`,
`checked`, `timings` (`daemon`, `waitedMs`, `totalMs`, optional `reply`) and
`exitCode`.

**The hook contract.** `ramify check --changed <path>... [--since <revision>]
[--deadline <ms>] [--format json]` hashes the named files in the CLI (absent as
null), sends one synchronized `delta` request, and exits 0 when the covering
revision completed with no finding in the project, 1 with findings or an invalid
revision, 2 when not checked (`cold`, `deadline-exceeded`, `unobserved-input`,
`superseded`, `configuration-changed`, `evicted-revision`, an incomplete or
unavailable outcome, or an unavailable, stopped or incompatible daemon) and 130
when interrupted. It never runs a batch analysis. The plain `ramify check` keeps
the `ramify.analysis/1` document. The
[CLI invocation contract](../../../architecture/cli-invocation.spec.md#hook-and-complete-checks)
pairs the hook and complete checks. `examples/hooks/claude-code-post-write.mjs`
maps a Claude Code `PostToolUse` event to the hook command, exits 2 with new
findings on standard error, and exits 0 with a notice when not checked.

**Covering rule, sweep, deadlines and levels.** As
[daemon and analysis](../../../architecture/daemon.md#implemented-retained-session)
and [memory lifecycle](../../../architecture/memory-lifecycle.md#retained-sessions-and-their-levels)
state: coverage evaluated on arrival and at each publication; periodic sweeps
every 30 s from the start of the previous sweep while active, required sweeps
after configuration, manifest, lockfile, overflow, watcher error, opening,
conservative state, queue overflow and empty-expectation plain checks; a default
hook deadline of 2,000 ms, at most 600,000 ms on the wire; two hot contexts, a
600,000 ms warm idle period and a 1,800,000 ms cold retention; a 512 MiB worker
heap and 96 MiB of retained facts per session.

## Measured budgets and deferral triggers

All figures are Linux 6.8.0-85-generic x64, Intel Xeon E-2176G, Node v22.23.2.
The one acceptable-time budget is the hook's 2 s end-to-end median
([two kinds of budget](../../../architecture/memory-lifecycle.md#two-kinds-of-budget));
every other target in [scope.md](../scope.md#budgets) is an ideal budget,
recorded without failing.

| Racing hook, median ms | Reference | S100 |
| --- | ---: | ---: |
| Body edit | 94 | 123 |
| Source edit | 101 | 222 |
| Description edit | 96 | 169 |
| README edit | 59 | 72 |
| Created file | 306 | 496 |
| Deleted file | 312 | 472 |
| Hook after the watcher published | 45 | 45 |

Source: [structural edits measurement](../../iteration-5-structural-edits/iterations/measurement-results.md),
build `7080722`. Configuration rows there (1,246 and 1,843 ms) were measured
before the 2026-09-14 revision; a configuration hook now answers at once as not
checked, and its reply latency is not re-measured. The bare Node floor measured
24 to 26 ms. The pre-optimization figures of iteration 12 remain in its
[results](iteration12-results.md).

| Deferral trigger | Outcome |
| --- | --- |
| Resolution-bounded narrowing | Triggered in iteration 12; delivered as the structural edits `membership` path. |
| Proportional relink | Not evaluated: it needs S500 and S1000 description medians, waived. Link is the largest narrow stage on S100 (84 to 92 ms). |
| Syntactic pre-filter | Not evaluated: it needs the S1000 filtered extraction median, waived. |
| Persistent checkpoints | Not evaluated: it needs S1000 cold session work, waived. |
| Child-process session host | Resolved by iteration 8: the worker runs inside a supervisor process, because an inherited `NODE_OPTIONS` could override the worker heap limit and a failed worker must not strand its compiler server. |

## Plan 2 supersession

Iteration 9 removed Plan 2's engine core and recorded the
[amendment](../../done/iteration-2-resident-verification/supersession-plan5.md):
ten Plan 2 instances are superseded by named I5 counterparts, as
[scope.md](../scope.md#plan-2-supersession) lists, and the `--plan 2` gate
requires the remaining 166 plus eight distinct counterparts, 174 in all.

## Fixtures, sequences and recipes Plans 3, 4 and 6 inherit

- The reference copy R and its twelve-step sequence
  (`scripts/reference-harness/plan5-live-sequences.ts`), used live by I5-12 and
  in process by `I5-07:audit-equal-sequence`.
- The S100 generator (`scripts/measurements/materialize.ts`, base content-map hash
  `d5b77b9ff57c443b35f386f40598506ff20c51c4ec75b800371f0cec089c0897`) and the
  I5-12 overlay that places seven generated owners at the reference positions.
- The live process harness (`plan5-live-process.ts`, `plan5-live-cases.ts`): real
  daemon, watcher, audits observed through the diagnostic channel, the watcher
  barrier for racing hooks and the burst and removal cases.
- The seeded differential sequences of `subs/analysis/src/tests/membership-differential.test.ts`.
- Root's `createQuickEnvironment` with the session driver, contexts' controlled
  clock, watcher and scripted session handle.
- The hook measurement recipe `node scripts/measurements/fast.mjs --workload
  <id>` with the contention classification of the
  [structural edits recipe](../../iteration-5-structural-edits/iterations/closure.md#measurement-recipe).

## Known limits

- S500 and S1000 hook latency, the `measure:fast` memory plateaus, hot and warm
  memory, cold opens and checked-set bounds are not measured. The resident
  workloads of 2026-09-14 measured the reference and S100 instead.
- A retained session cannot hold S1000: its cold check exceeds the 96 MiB
  per-session retained-fact limit with 159.5 MiB of facts and is refused.
- No macOS evidence for a Plan 5 build.
- The deferred proportional relink: link and model are whole-project work on
  every path that relinks.
- The deferred resolution-bounded narrowing beyond the membership path's fallbacks,
  the deferred syntactic pre-filter and the deferred persistent checkpoints.
- The unchanged `unsupported-commonjs` limit.
- `I2-29:many-contexts` and `I2-29:entry-footprints`, above.
- A burst of writes racing their hooks publishes two revisions rather than one.
  The refinement to consider if bursts prove common: a racing hook waits only
  when the pending debounce holds paths its request does not name. It coalesces
  such a burst into one revision and costs those hooks up to the 100 ms window
  (decision of 2026-09-14).
- The session audit cannot detect a retained compiler holding stale options; a
  CI gate comparing a live session with batch remains open (structural edits
  closure).
- A configuration with `references` keeps the full resolution replay.
- A configuration hook is answered before the daemon knows whether the edit made
  the project unreadable; the next request reports it.
- The remaining gaps of the [hook optimization](../../iteration-5-hook-optimization/iterations/closure.md#remaining-gaps)
  and [structural edits](../../iteration-5-structural-edits/iterations/closure.md#remaining-gaps)
  closures.

## Commit audits

Every commit of this iteration was audited with cucumber-viz
`audit_commit` on the worktree, in `use_existing_head` mode, and every audit
passed.

| Commit | Subject | Audit |
| --- | --- | --- |
| `4379f92` | align the reviewed not-checked instance with its revised record | PASS |
| `96be92a` | add the six I5-14 completion handlers | PASS |
| `0daa3f0` | state the implemented retained session and hook check | PASS |
| `b691e90` | document `check --changed`, `measure:fast` and the endpoint convention | PASS |
| `0fd55c3` | mark Plan 5 complete on this branch and record the closure decisions | PASS |
| `48e1487` | build the executable client only for a root that selects the CLI entry | PASS |
| `ca46b13` | read a file again after a failed open | PASS |
| `0beea05` | keep a README purpose changed with its module's description | PASS |
| `eee6f70` | track the session supervisor launch in process traces | PASS |
| `c804fbc` | fail a verification that exits before its gate settles | PASS |
| `899a3e3` | align Plan 2 and Plan 5 expectations with the successor plans | PASS |
| `74d9b87` | leave an unknown change to the observer | PASS |
| `310f826` | report each invocation's own root selection | PASS (audited as `5501aeb` on `fix/i2-03-scope` before the cherry-pick) |
| `cefe732` | expect the membership path for watched file removals | PASS |
| `b783ead` | amend the superseded broad row of Plan 5's scope | PASS |
| the commit of this report | record the closure, its gates and its measurements | recorded in the final report of this iteration |


## Edits for files outside this branch

Three files are not on this branch or carry uncommitted edits in the shared
checkout, so the coordinator applies these by hand in `/ramify`. Each block is
ready to paste.

### 1. `docs/roadmap.md`, the Plan 5 row of the deliverable table

Replace the last cell of the row that begins
`| [5. Check fast after a write](#plan-5-fast-incremental-checks) |`, which
currently reads
`Brief below; [Detailed Plan 5](plans/iteration-5-fast-incremental-checks/main-plan.md), a draft awaiting its iteration 1 contract review.`,
with:

> Brief below; [Detailed Plan 5](plans/iteration-5-fast-incremental-checks/main-plan.md), complete on 2026-09-14 on branch `close/plan5-completion`, not merged to `main`; its [completion report](plans/iteration-5-fast-incremental-checks/iterations/iteration13-results.md) records the delivered scope, the gates and the remaining gaps.

### 2. `docs/roadmap.md`, the status line of the Plan 5 section

Replace the two lines under `## Plan 5: Fast incremental checks` that read

```
**Detailed plan:** [Plan 5: Fast incremental checks](plans/iteration-5-fast-incremental-checks/main-plan.md),
a draft awaiting its iteration 1 contract review. **Prerequisite:** met on
```

with

```
**Detailed plan:** [Plan 5: Fast incremental checks](plans/iteration-5-fast-incremental-checks/main-plan.md),
complete on 2026-09-14 on branch `close/plan5-completion`, not merged to `main`;
the [completion report](plans/iteration-5-fast-incremental-checks/iterations/iteration13-results.md)
records the delivered scope, the gates and the remaining gaps.
**Prerequisite:** met on
```

### 3. `docs/roadmap.md`, a closure paragraph in the Plan 5 section

Insert after the paragraph that ends
`Ramify checks saved files only.`:

```
**Closure, 2026-09-14.** Dan's decisions of that date close the plan: it is
complete on `close/plan5-completion` and merging to `main` is not part of the
closure; S500 hook latency and the S500 resident workload are waived and S1000
is smoke-tested only; the remaining I5-13 workloads are recorded as not
executed; an `unknown` input label no longer decides a revision path; and a
resident report carries its own invocation's root selection while `inputId`
stays the context's identity. Three successor plans changed the delivered
scope: [contract remediation](plans/iteration-5-contract-remediation/main-plan.md),
[hook optimization](plans/iteration-5-hook-optimization/main-plan.md) and
[structural edits](plans/iteration-5-structural-edits/main-plan.md); the
[repeated deletions](plans/iteration-5-repeated-deletions/main-plan.md) plan was
withdrawn without starting. Follow-ups the closure hands on: a CI gate comparing
a live session's `inputId` with a batch run, so a retained compiler holding stale
options is detected; re-measuring the configuration hook reply, whose recorded
figures predate the not-checked answer of 2026-09-14; narrowing the full
resolution replay a configuration with `references` still keeps; and the
refinement `I5-12:burst-coalesced` records, where a hook racing a write burst
cancels the watcher's debounce and the burst publishes two revisions.

**After closure, 2026-09-14.** `I2-29:many-contexts`, which the completion report
recorded as an open defect, is diagnosed and fixed on branch
`investigate/many-contexts`: an idle audit stayed armed after a demotion, failed
against the released compiler and re-armed itself, which spun the demoted context
and starved the next context's check. The workload now passes, and the
[addendum](plans/iteration-5-fast-incremental-checks/iterations/iteration13-results.md#addendum-2026-09-14-the-many-contexts-stall)
records the diagnosis, the fix, its tests and the measured run.
`I2-29:entry-footprints` stays open: the 50 ms sampler cannot observe the
Bun-compiled client's 25.5 ms help entry.
```

### 4. `docs/analysis/fast-incremental-checks.md`

Insert immediately after the `# Fast incremental checks for agent hooks` heading,
before the `**Date:** 2026-09-11.` paragraph:

```
> **Superseded on 2026-09-14.** The implemented retained session and the hook
> check of [Plan 5](../plans/iteration-5-fast-incremental-checks/main-plan.md),
> closed by its [completion report](../plans/iteration-5-fast-incremental-checks/iterations/iteration13-results.md),
> replace this proposal. [Daemon and analysis](../architecture/daemon.md#implemented-retained-session)
> and [memory lifecycle](../architecture/memory-lifecycle.md#retained-sessions-and-their-levels)
> state what is implemented. This document is kept for its evidence and its
> reasoning; where the two differ, the architecture documents and the plan hold.
```

### 5. `docs/analysis/fast-incremental-checks-retained-session.md`

Insert immediately after the
`# Fast incremental checks: a retained-session daemon architecture` heading,
before the `**Date:** 2026-09-11.` paragraph:

```
> **Superseded on 2026-09-14.** [Plan 5](../plans/iteration-5-fast-incremental-checks/main-plan.md)
> implemented the retained session this document proposes and closed on that
> date; its [completion report](../plans/iteration-5-fast-incremental-checks/iterations/iteration13-results.md)
> records the delivered scope and the gaps, and
> [daemon and analysis](../architecture/daemon.md#implemented-retained-session)
> owns the implemented design. This document is kept for its measurements and
> its reasoning; where the two differ, the architecture documents and the plan
> hold.
```

