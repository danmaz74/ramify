# Plan 5: Fast incremental checks

**Date:** 2026-09-11. **Status:** Complete on 2026-09-14, on branch
`close/plan5-completion`; not merged to `main`. The
[completion report](iterations/iteration13-results.md) records the delivered
scope, the gates, the waived and unexecuted measurement workloads and the
remaining gaps; the hook optimization, contract remediation and structural edit
plans changed the delivered scope. The text below is the plan as authored,
from the roadmap's [Plan 5 brief](../../roadmap.md#plan-5-fast-incremental-checks),
Plan 2's [completion evidence](../done/iteration-2-resident-verification/iterations/iteration14-results.md),
the [retained-session proposal](../../analysis/fast-incremental-checks-retained-session.md),
the parallel [hook analysis](../../analysis/fast-incremental-checks.md) and
the [spike results](../../../scripts/spikes/fast-check/RESULTS.md) recorded on
branch `spike/fast-check-retained-session`. No retained session, hook command
or passing Plan 5 evidence is established by this document. The plan runs as
thirteen iterations, listed under [Iteration sequence](#iteration-sequence);
each is sized to be implemented within one 250k-token context, and the plan's
completion gate is the last iteration's exit. The [contracts](contracts.md),
[owners](owners.md), [scope](scope.md) and [instance inventory](subcases.md)
beside this plan form its review package.

## Deliverable and completion boundary

Deliver a retained analysis session inside the existing daemon, so that a
coding agent's post-write hook obtains an exact answer for the file it just
wrote in a small fraction of a batch check's time, and every other resident
check benefits from the same retained state. The daemon watches, updates its
analysis live, and answers a hook from the revision that already covers the
written file.

From the Ramify package directory, the installed CLI must support, in
addition to every Plan 2 command unchanged:

```sh
cd examples/collection-review && ramify check --changed src/foo.ts
ramify check --root examples/collection-review --changed src/foo.ts --format json
ramify check --root examples/collection-review --changed src/foo.ts --since rev/1:...
ramify check --root examples/collection-review --changed src/a.ts src/b.ts --deadline 500
node examples/hooks/claude-code-post-write.mjs   # reads the host's hook JSON on stdin
```

The first command hashes the named file, connects to the daemon, starts one if
necessary, and prints the findings of the first revision whose observed
inputs cover that content identity, marking which findings are new since the
previous revision. It exits 0 with no findings, 1 with findings and 2 when the
file was not checked: a cold context that could not finish inside the
deadline, a deadline exceeded, an unobserved path, a superseded content
identity or an unavailable daemon. It never runs a batch analysis. The second
command writes the compact `ramify.check/1` document; the third limits the
new-finding marks to the revisions after a named one; the fourth names
several files and a deadline. The plain `ramify check` keeps Plan 2's
behavior and its unchanged `ramify.analysis/1` document. The last command is
an example host adapter, outside the toolkit owners, that maps a Claude Code
post-write hook to the `--changed` command and returns findings to the agent
through exit 2 and standard error.

Completion requires every I5 instance in the [acceptance matrix](#acceptance-matrix)
to run and assert its independent expectation; equal session and batch
results at every step of the reference and synthetic edit sequences, with the
session's own audit passing after every step; the hook latency budgets in
[scope.md](scope.md#budgets) met on the reference project and S100 with raw
results archived; real watcher, process and IPC evidence for the rendezvous,
deadlines and cold outcomes; Plan 1's 308-instance gate and Plan 2's gate,
amended as [scope.md](scope.md#plan-2-supersession) records, still passing on
the same build; and `npm run check:self` accepting the eleven-owner toolkit.
A session whose revision differs from a batch check of the same inputs, a
hook answered from a revision that does not cover its file, or a check that
reports a pass without executing, does not complete this plan.

Inspection commands remain Plan 3, MCP Plan 4 and the explorer Plan 6. This
plan hands them the compact check reply, the revision delta, the session's
retained facts and indexes, the hook contract and the measured budgets the
roadmap's [handoff table](../../roadmap.md#information-to-preserve-between-plans)
requires.

## Authority and supporting documents

| Document | Role |
| --- | --- |
| [Importability principles](../../model/cross-module-importability.principles.md), [glossary](../../model/glossary.md), [module descriptions](../../model/module-description.principles.md), [TypeScript interpretation](../../model/typescript-source-interpretation.principles.md) | Definitive rules the session enforces unchanged; this plan adds no importability rule. |
| [Daemon and analysis](../../architecture/daemon.md) | Fast incremental check requirement, invalidation table, revisions, freshness, DA01–DA18. Revised by iteration 13 as [scope.md](scope.md#document-revisions) lists. |
| [Processes and clients](../../architecture/processes-and-clients.md) | Process split, service boundary, command roles, PC01–PC10. |
| [Memory lifecycle](../../architecture/memory-lifecycle.md) | Retention and measurement policy, ML01–ML08; gains the compiler server as a bounded cost. |
| [Quick testing](../../architecture/quick-testing.spec.md) | Direct-adapter flows and their limits, QT01–QT08. |
| [CLI invocation](../../architecture/cli-invocation.spec.md) | Root and configuration discovery, warnings, output order and exits, unchanged for the plain check. |
| [Tooling roadmap](../../roadmap.md) | The brief, the nine authoring rules and the scheduling map. |
| Plan 2 [contracts](../done/iteration-2-resident-verification/contracts.md), [owners](../done/iteration-2-resident-verification/owners.md), [scope](../done/iteration-2-resident-verification/scope.md) and [completion report](../done/iteration-2-resident-verification/iterations/iteration14-results.md) | Implemented names, entries, budgets and evidence this plan preserves or explicitly supersedes. |
| [Retained-session proposal](../../analysis/fast-incremental-checks-retained-session.md) and [hook analysis](../../analysis/fast-incremental-checks.md) | The design and its measurements; supporting evidence, not authority. |
| [Spike results](../../../scripts/spikes/fast-check/RESULTS.md) | Measured exactness, latencies, memory and problems of a retained session on the Plan 2 branch; supporting evidence. |
| [Reference cases](../reference-project/cases.md), [contract map](../reference-project/contract-map.md) and [harness](../reference-project/harness.md) | Independent expectations and statement IDs for the edit sequences. |

This plan selects implementation scope and evidence; it revises no model
document. Where the architecture lists a decision still requiring review, the
[resolved decisions](#resolved-decisions) below fix it or name the
alternatives and the recommended one as a review point for iteration 1.

## Starting point

The planning inspection on 2026-09-11 established the following from the
branch `docs/roadmap-fast-incremental-checks` at `a68b356`, which merges
`workflow/iteration-2-resident-verification`. Recheck at implementation start.

- Plan 2 is complete and merged. Its plan directory is being moved under
  `docs/plans/done/`; this plan links it there. Its gate registers 176 I2
  instances under `npm run reference:verify -- --plan 2`; the resident
  measurement recipe is `npm run measure:resident`; performance targets are
  advisory under the [temporary decision](../done/iteration-2-resident-verification/scope.md#budgets)
  of 2026-09-11.
- Eleven owners are declared: root, `analysis` with `model`, `descriptions`,
  `project` and `typescript`, `daemon` with `contexts`, `presentation` with
  `layout`, and `cli`. `npm run check:self` on the Plan 2 branch reports
  eleven owners, 229 source files and 2,746 accesses with no findings.
- [`package.json`](../../../package.json) has eight `exports`: `.`,
  `./analysis`, `./analysis/inventory`, `./model`, `./presentation`,
  `./layout`, `./cli` and `./client`; `bin.ramify` is `dist/src/cli-entry.js`.
  Root entries are `src/cli-entry.ts`, `src/daemon-entry.ts`, `src/batch.ts`,
  `src/client.ts` and `src/resident-assembly.ts`.
- `subs/analysis/src/increment.ts` exports `analyzeIncrement`, which creates a
  fresh single-use session per revision, recaptures the whole project and
  reuses stage products through `retained-products.ts`; `resolve-project.ts`
  exports `resolveProject`. `interfaces/analysis.ts` declares `InputChange`,
  `RetainedStageId`, `RetainedStage`, `RetainedAnalysis`, `IncrementInputs`
  and `IncrementRun`. Compiler state is not retained: `typescript`'s
  `compiler-helper.ts` still starts a finite helper per catalog or access
  recomputation.
- `subs/daemon/subs/contexts/src/interfaces/contexts.ts` declares the
  `AnalysisDriver` port as `resolve`, `check({ project, setup, previous,
  changes })` and `dispose`. `context-manager.ts`'s `analyze()` calls
  `driver.check` per revision, builds `InputFingerprints` from
  `run.retained.inputs`, stores a whole `AnalysisReport` per revision in
  `history.ts`, compares whole reports for reuse and verifies `expect`
  identities against `run.retained.inputs`. `ContextBudgets` has
  `maxContexts`, `maxHistoryRevisions`, `maxHistoryBytes`,
  `maxRetainedBytesPerContext`, `maxRetainedBytesGlobal`, `maxQueuedPaths`,
  `maxConcurrentAnalyses`, `warmIdleMs`, `coldRetainMs`, `debounceMs` and
  `verificationIntervalMs`. The watcher is `subs/daemon/src/filesystem-watcher.ts`
  with a 100 ms batch window, pruned recursive directory handles and
  overflow signalling.
- Root's `src/interfaces/service.ts` declares `RamifyService` with
  `openContext`, `contextStatus`, `check`, `subscribe`, `unsubscribe`,
  `closeContext`, `daemonStatus` and `stopDaemon`; `CheckParams` is
  `{ token, requestId, freshness }` and `Freshness` is `published` or
  `synchronized` with `expect` content identities. `subs/cli/src/arguments.ts`
  accepts `check [--root <dir>] [--format json] [--batch]`, `watch` and
  `daemon status|stop`; `check-command.ts` opens a context, sends one
  synchronized request with an empty `expect` and prints the whole report;
  after exhausted recovery it falls back visibly to batch.
- Plan 2's own archive records the compiler-state deferral trigger as fired:
  source-edit medians of 6,701 ms on the reference and 10,777 ms on S100
  through the daemon, against 4,500 ms and 8,000 ms targets.
- The spike on `spike/fast-check-retained-session` (nine commits from
  `bb484a1` to `b10145a`, based on the Plan 2 branch head and merging cleanly
  onto `a68b356`) measured a retained session that equalled a fresh batch
  analysis in 56 of 56 audits across the reference, S100, S500 and S1000: a
  body edit that leaves exports and accesses unchanged in 59 ms on the
  reference (52 ms of which is the whole-project catalog), 443 ms on S100,
  1.72 s on S500 and 5.28 s on S1000; a real hook process in 78 ms when the
  watcher had published and 130 ms when the hook raced it; 303 ms for
  `ramify check` through the real daemon against 5.1–5.7 s with Plan 2's
  driver; session process 54 MiB and compiler server 129 MiB after 260
  edits. Its engine commit `b62cab0` changes `namespace-uses.ts`,
  `accesses.ts`, `decisions.ts` and `model.ts` and leaves the reference
  batch report byte-identical.
- Synthetic fixtures S100, S500 and S1000 are materialized by
  `scripts/measurements/materialize.ts` from the parameterized generator;
  the fast-check probes live under `scripts/probes/fast-check/`.

## Scope decisions

### Included

- A retained analysis session per context, hosted by `analysis` in a worker
  thread it starts itself, owning a warm TypeScript 7.0.2 server with exactly
  one live snapshot, the observed inputs, per-file export descriptions,
  per-file access facts, the model, per-access decisions and reverse indexes.
- Per-file export descriptions with recorded dependencies and a
  dependency-driven recomputation of the star, forwarding and namespace fixed
  point over the files a change can reach. Whole-project `buildCatalog`
  becomes the assembly of every file's description, so batch results are
  produced by the same code.
- Per-file access interpretation with a hoisted, incrementally maintained
  interpreter setup, the lazy spelling-filtered namespace index and batched
  checker lookups; indexed model lookups for decisions. These land first and
  speed up batch checks as well.
- Incremental project acquisition: a project observer that records every
  observed input including the compiler's own reads, updates the inventory
  locally for description, README, created and deleted files inside existing
  areas, rebuilds it for structural changes, and re-observes its whole set as
  the background sweep. Its input identity equals a batch capture's.
- The revision step with its four paths: unchanged surface, source,
  description and broad, plus the metadata-only path for READMEs, position
  refresh for moved declarations, and the built-in audit that recomputes
  everything from the warm compiler and compares.
- Contexts driven by the session: revision fingerprints from the observed
  inputs, compact history of revision headers and finding deltas with the
  report projection materialized on demand, the covered-identity rendezvous
  for synchronized requests, `unobserved-input`, `superseded`, `cold` and
  `deadline-exceeded` outcomes, hot and warm levels with compiler release
  and rebuild, and the sweep schedule.
- The service and CLI: `check` gains `scope`, `since` and `deadlineMs`; the
  compact `ramify.check/1` document; `ramify check --changed <path>...`
  hashing the named files in the CLI; the example host adapter for Claude
  Code post-write hooks.
- Removal of Plan 2's engine core: `increment.ts`, `retained-products.ts`,
  the retained variant of `run-analysis.ts` and `session.ts`, the
  `RetainedAnalysis` family of types, and `createAnalysisDriverFromSessions`;
  `resolveProject` stays.
- Evidence: the engine equivalence, catalog, compiler, observer, session,
  hosting, contexts, CLI, live equivalence and measurement instances of the
  matrix; the amended Plan 2 gate; Plan 1's gate; measurements on the
  reference, S100, S500 and S1000.

### Scheduled later or excluded

- Inspection and explanation commands (Plan 3), MCP (Plan 4) and the
  explorer (Plan 6). The compact reply and the revision delta are their
  inputs; no query field beyond this plan's is implemented.
- Persistent checkpoints of retained facts on disk. Cold open with direct
  reads measured 781 ms on the reference and 27 s on S1000; a persistent
  checkpoint is a later optimization gated by the S500 and S1000 cold
  measurements recorded here.
- A syntactic pre-filter that skips per-file re-extraction. The real
  extractor compared by value is the detector; iteration 12 records the
  filtered extraction cost that would justify a pre-filter.
- Windows, registry configuration serialization, browser-promise
  verification, strict outside-source configuration: unchanged deferrals.
- A child-process session host. The worker thread is the decided host; the
  session contract does not change if measurements later require a process.

### Source scope and project selection

Unchanged from Plans 1 and 2: whole-project scope, discovered configuration,
default registry, the CLI invocation contract for root selection. A
`--changed` path outside the selected root or not covered by an observation
is `unobserved-input`, never silently checked.

### Supported platforms

Linux and macOS, as Plan 2 fixed. Worker threads with `resourceLimits`,
`fs.watch` recursive coverage through the pruned handles and Unix domain
sockets behave the same on both. Plan 5's measurements establish Linux
evidence; the process and worker suites must pass on macOS before
acceptance.

## Implementation ownership

No owner is added; the eleven-owner tree stands. The worker entry is a
source file of `analysis`, the way `compiler-helper.ts` is a source file of
`typescript`. [owners.md](owners.md) carries the final declaration texts.

| Owner | This plan's responsibility |
| --- | --- |
| `typescript` | The lazy spelling-filtered namespace index and batched lookups; the hoisted access interpreter with `only`; per-file export descriptions with dependencies and the dependency-driven fixed point; the retained compiler adapter with one live snapshot, synthetic configuration regeneration, observed reads and compiler release. The finite helper remains for batch. |
| `model` | Indexed lookups in `decisions.ts` and `canonicalOrigin`; no rule change. |
| `project` | The project observer: observed inputs with roles and identities, local inventory updates, structural rebuilds, the sweep, and an input identity equal to a batch capture's. |
| `analysis` | The retained session: facts, reverse indexes, the revision step and its paths, position refresh, finding deltas, the audit, the worker host, deadlines, hot and warm levels; removal of the increment products. Batch sessions unchanged. |
| `contexts` | The session-based driver port, revision headers from session revisions, compact history with on-demand report projection, the covered-identity rendezvous, `cold` and `deadline-exceeded`, sweep scheduling, hot-context budget and compiler release on demotion. |
| `daemon` | Validation of the extended `check` parameters and the compact reply on the wire; no transport change. |
| root | The session driver in `resident-assembly.ts`; the extended service vocabulary; the `ramify.check/1` document type; document revisions. |
| `cli` | `check --changed`, `--since`, `--deadline`; hashing named files; delta rendering; exit mapping; no batch fallback for `--changed`. |

### Exposure rules for this plan

- `typescript` exposes the retained adapter and the per-file description
  vocabulary to `analysis` through its to-parent contract; compiler objects
  never cross it. The worker entry in `analysis` imports `typescript` and
  `project` through the same channels the batch session uses.
- `analysis` exposes `openRetainedSession` and the session vocabulary to
  root; root relays the plain-data session and revision types to
  descendants, as it relays the analysis report vocabulary today.
- `contexts` keeps its neutral vocabulary and names only relayed analysis
  and project types in its port, as it does now; the `AnalysisDriver` port is
  revised in place, not duplicated.
- The example host adapter lives under `examples/hooks/`, outside every
  owner, and invokes the installed CLI; it imports no toolkit source.

### Declaration stages

Each iteration activates the exposure lines it needs together with the real
exports they name; [owners.md](owners.md) lists the activation stage of every
line. Removals of the Plan 2 increment lines happen in iteration 9, together
with the driver replacement, so no intermediate build exposes a name without
its export.

## The retained analysis path and contract review

### Required data flow

```text
watcher events / hook request with content identities
  -> contexts: one queue per context, debounce, covered-identity rendezvous
  -> session handle (contexts owns it through the driver port)
  -> analysis worker thread: revision step over retained facts
       classify -> inventory (observer) -> compiler update (one snapshot)
       -> per-file descriptions over the dependency closure
       -> per-file access facts over the affected files
       -> link and model when descriptions, areas or originals changed
       -> decisions for the affected accesses
       -> publish: revision header, checked set, finding delta, timings
  -> contexts: revision, compact history, events
  -> service: compact reply or on-demand report projection
  -> CLI: findings new since the caller's revision; exit code

ramify check --batch -> runBatch -> analyzeProject (unchanged)
```

Every published revision equals a fresh batch analysis of its observed
inputs: catalog, model, accesses, results, diagnostics, coverage, warnings,
summary and input identity. The audit establishes that continuously, as
[scope.md](scope.md#batch-and-session-comparison) fixes.

### Proposed contract shapes

[contracts.md](contracts.md) holds the exact definitions. These requirements
constrain them.

| Contract | Owner | Required information or behavior |
| --- | --- | --- |
| `FileDescription`, `DescriptionDependencies`, `CatalogDelta`, `describeFiles`, `assembleCatalog` | typescript | Per-file exports, originals, coverage and the files, resources, shims and absent paths each description depended on; recomputation over the dependency closure until descriptions stop changing by value; the assembled catalog equals `buildCatalog`. |
| `createAccessInterpreter`, `AccessInterpreter` | typescript | Setup hoisted once per project and maintained incrementally; `interpret(files)` yields exactly the accesses a whole-project pass yields for those files. |
| `createRetainedSourceAnalysis`, `RetainedSourceAnalysis`, `SourceChangeSet` | typescript | One warm server and one live snapshot; `update` names changed, created and deleted files and the regenerated synthetic configuration; every filesystem callback reports its observation to the sink; `releaseCompiler` and `dispose`; loss of the server is an explicit failure. |
| `observeProject`, `ProjectObserver`, `InventoryUpdate`, `ObservationSink` | project | Observed inputs by role with identities; `apply(changes)` returns a local, structural, invalid or unchanged update; `reobserve()` is the sweep; `inputId` equals `readProject`'s for the same inputs. |
| `openRetainedSession`, `RetainedSession`, `SessionChange`, `SessionRevision`, `CheckedSet`, `FindingDelta`, `RevisionTimings`, `SessionUpdate`, `VerifyOutcome`, `SessionStatus`, `SessionLimits` | analysis | Frozen plain-data revisions; the four paths and their checked sets; deltas by diagnostic identity; the audit; deadlines; compiler release; the worker boundary invisible to callers. |
| `AnalysisDriver` (revised), `ContextRevision` (extended), `CheckRequest` (extended), `CheckOutcome` (extended), `ContextBudgets` (extended) | contexts | `open` returns a session handle; revisions carry checked set, delta counts and timings; requests carry `scope`, `since` and `deadlineMs`; outcomes add `cold` and `deadline-exceeded`; budgets add `maxHotContexts`, `sweepIntervalMs` and `updateDeadlineMs`. |
| `CheckParams` (extended), the relayed `CheckDelta`, `RamifyService.check` (extended) | root | The compact reply on the wire; the whole report only when `scope: 'report'`. |
| `CheckDocument` (`ramify.check/1`), `parseArguments` (extended) | cli | The delta document, the `--changed`, `--since` and `--deadline` arguments, the exit mapping. |

### Retained facts, positions and equivalence

The session retains plain data only; the compiler handle stays inside the
`typescript` adapter in the session's thread. Positions are evidence that
decisions and diagnostics carry, so a file whose export description and
access facts are unchanged by value but whose declarations moved refreshes
the decisions that select its originals and the diagnostic identities that
cite them. The spike found exactly this defect through its audit; the audit
is therefore part of the session, run after every step in tests and on idle
in the daemon.

## Resolved decisions

Each of the brief's decisions ends in one proposal. Details and numbers live
in the named sections of the review package.

1. **Position in the sequence.** Plan 5 is the next deliverable, ahead of
   Plan 3 and Plan 4, which consume its compact reply and revision delta. The
   withdrawn change-previews deliverable released the number.
2. **Session host.** A worker thread started by `analysis`, with
   `resourceLimits` and one compiler server child per session; the daemon's
   event loop never blocks on the compiler. A child process remains the
   fallback behind the same contract if probe P5-4 or iteration 12 shows
   thread isolation or accounting to be insufficient. See
   [scope.md](scope.md#session-hosting).
3. **Per-file export descriptions from the first session iteration.** The
   whole-project catalog is the single blocker for the 100, 500 and 1,000
   owner budgets; the dependency edges it needs are the ones access
   invalidation needs. See [scope.md](scope.md#dependency-model).
4. **Observed reads include the compiler's.** The retained adapter's
   filesystem callbacks report every read, existence probe, directory
   listing and absence to the observer, so a session's input identity equals
   a batch capture's and the sweep covers dependency and shim changes. See
   [scope.md](scope.md#observation-and-freshness).
5. **Live updates drive the session; hooks rendezvous.** Watcher batches are
   debounced and applied whether or not a client is connected. A synchronized
   request whose `expect` identities are already covered by the published
   revision is answered from it with no analysis; otherwise it flushes the
   debounce window and joins the next update. See
   [scope.md](scope.md#observation-and-freshness).
6. **The hook command and document.** `ramify check --changed <path>...`
   with hashes computed by the CLI, `--since <revision>` and
   `--deadline <ms>`; JSON output is the compact `ramify.check/1` document;
   the plain `ramify check` and its `ramify.analysis/1` document are
   unchanged. A `--changed` check never falls back to batch and never exits
   0 without a covering revision. See [Required behavior](#required-behavior-and-diagnostics).
7. **Plan 2 supersession.** Plan 2's engine core is removed in iteration 9.
   The I2 instances that test stage-product reuse are retired as superseded
   by named I5 instances through a recorded amendment in Plan 2's done
   package and a harness change; every other I2 instance stays required. The
   exact list is [scope.md](scope.md#plan-2-supersession), and its acceptance
   is review point RP-4.
8. **Budgets.** Hook latency targets on the reference and S100 are binding
   from iteration 12's exit; S500 and S1000 targets and memory targets start
   from the spike's measurements and are revised once from iteration 1's
   probes; Plan 2's advisory decision continues to apply to Plan 2's own
   workloads. See [scope.md](scope.md#budgets) and RP-6.
9. **No new owner, entry or wire framing.** The session is analysis-owned
   source, the driver port is revised in place, and the IPC codec, discovery,
   records and lifecycle rules of Plan 2 are untouched.

## Required behavior and diagnostics

### Commands

| Command | Required behavior |
| --- | --- |
| `ramify check [--root <dir>] [--format json]` | Unchanged from Plan 2 in arguments, human output, JSON document and exits; the resident path now answers from the session and the `Mode:` line adds the revision's path (`unchanged-surface`, `source`, `description`, `metadata`, `broad`, `cold`). |
| `ramify check --changed <path>... [--since <revision>] [--deadline <ms>] [--format json]` | Resolve each path against the selected root; read and hash it (a missing file hashes as absent); open or reuse the context; send one synchronized request with `expect` for every path, `scope: 'delta'`, the `since` revision and the deadline (default 2,000 ms); print the findings of the covering revision, marking new ones; exit as the table below fixes; never start a batch analysis. |
| `ramify check --batch` | Plan 1's batch check, unchanged. |
| `ramify watch`, `ramify daemon status`, `ramify daemon stop` | Unchanged; `watch` lines and `daemon status` gain the revision's checked set and timings. |

### Exits

| Exit | `ramify check --changed` |
| --- | --- |
| 0 | A covering revision was published with `outcome.execution: 'completed'` and no finding at all in the project. |
| 1 | A covering revision was published and the project has findings, or the covering revision is invalid (`outcome.execution: 'invalid'`); the document says which are new. |
| 2 | Not checked: `cold`, `deadline-exceeded`, `unobserved-input`, `superseded`, an incomplete or unavailable engine outcome, or an unavailable, stopped or incompatible daemon. |
| 130 | Interrupted. |

Findings anywhere in the project fail the check, not only findings in the
named files: a hook that edits a provider must learn about the importer it
broke. The document lists them with `new: true` when they did not exist in
the `since` revision, or in the previous revision when `since` is omitted.

### Error table

| Condition | `--changed` outcome |
| --- | --- |
| A named path is outside the root or has no observation in the covering revision | `unobserved-input` naming the path; exit 2. |
| The named file's disk content no longer matches the hash the CLI computed | `superseded` with the observed identity; exit 2. |
| The context is cold and the update does not finish inside the deadline | `cold` with the elapsed time; exit 2; the context keeps warming. |
| The context is warm and the update does not finish inside the deadline | `deadline-exceeded` with the current revision's sequence; exit 2. |
| The engine returns an incomplete or unavailable outcome | `reported` with `published: false`, the engine diagnostics and exit 2, as in Plan 2. |
| The `since` revision is no longer retained | `evicted-revision`; exit 2, because the new-finding marks cannot be computed. |
| The daemon is stopped explicitly, unavailable after recovery, or incompatible | `stopped`, `unavailable` or `incompatible`; exit 2; no batch fallback. |

### Engine results and their delivery

| Session outcome | Delivery |
| --- | --- |
| `revised` | Published as a new revision; the reply carries the checked set, the finding delta and timings; subscribers receive `revision-published`. |
| `revised` with an unchanged identity set (the watcher reported a path whose identity did not change) | No new revision; requests are answered from the current one with `reusedRevision: true`. |
| `invalid` | Published as an invalid revision; `lastValid` unchanged; a `--changed` check exits 1 with the invalid diagnostics. |
| `incomplete` or `unavailable` | Delivered unpublished as in Plan 2; the session keeps its last revision; status `reconciling`. |
| `deadline-exceeded` | The update continues to completion and publishes; the waiting request receives `deadline-exceeded` with the sequence current at acknowledgment. |
| Audit mismatch on idle | The recomputed facts are published as a new revision with cause `verify`, the mismatch is logged as an internal error with the differing fields, and the daemon counter `auditMismatches` increments. |

### Freshness and supersession guarantees

Plan 2's [guarantees](../done/iteration-2-resident-verification/scope.md#freshness-and-supersession-guarantees)
stand. [scope.md](scope.md#observation-and-freshness) adds the covering
identity rule, the sweep, the unobserved-path outcome and the deadline
outcomes.

## Acceptance matrix

Every row is required. Subcase names are stable executable instance
suffixes, for example `I5-06:unchanged-surface-no-propagation`; the
[inventory](subcases.md) lists every instance with its iteration, fixture,
evidence kind and expectation. A row is complete only when all its subcases
ran and asserted their own result. `api` evidence calls the owners' operations
directly; `session` evidence opens a real retained session in its worker over
a fixture copy and runs the audit; `quick` evidence uses root's quick
environment with the session driver; `process`, `ipc` and `measurement`
evidence use the real socket, the compiled entries and the recorded recipe
and are never replaced by a quick run.

| ID | Families | Required subcases and independently expected outcome |
| --- | --- | --- |
| I5-01 | DA10, DA18 | `namespace-lazy-equal`: the reference and toolkit batch reports are byte-identical after the namespace index change except `runId`; `namespace-shadowing`: a local declaration that shadows a namespace import is not a member selection and a use in an inner scope still is; `zero-queries-without-namespaces`: a file with no namespace-bearing binding issues no identifier symbol query; `only-subset-equal`: interpreting a subset yields exactly that subset of a whole pass; `hoisted-setup-bounded`: interpreting one file after setup performs no work proportional to the project; `decide-indexed-equal`: decisions, ordering and diagnostic identities are identical. |
| I5-02 | harness discipline | `required-membership`, `removed-record-fails`, `failing-assertion-fails`, `iteration-filter`: the `--plan 5` gate behaves as Plan 2's I2-28 analogue. |
| I5-03 | DA07, DA08, DA10 | `assembled-equals-whole`: per-file descriptions assembled equal `buildCatalog` on R, T and S100; `star-growth-reach`: adding an export to a star target recomputes the star's dependents and nothing else; `forwarding-chain-reach`; `namespace-forwarding-reach`; `resource-shim-reach`; `ambiguity-propagation`: incomplete and ambiguous states propagate along edges and settle; `closure-superset`: the recomputed set contains every file whose description changed by value in a whole recompute. |
| I5-04 | DA09, DA10, DA14, ML02 | `single-live-snapshot`: the previous snapshot is disposed inside the update; `changed-file-facts-equal`: facts after `update` equal a fresh adapter's; `created-deleted-configuration`: the owned file list and synthetic configuration regenerate and the program membership follows; `invalidate-all`; `observed-reads-complete`: the sink's observations equal the batch capture's inputs by path, role and identity; `server-loss-explicit`: killing the server yields an explicit failure, never stale facts; `release-and-rebuild`: after `releaseCompiler` the next update rebuilds and the facts are equal. |
| I5-05 | DA05, DA09, DA13 | `description-local-update`, `readme-local-update`, `file-created-local`, `file-deleted-local`: inventory updates without a whole rescan; `module-added-structural`, `stray-description-invalid`: structural changes rebuild or invalidate; `sweep-detects-unwatched`: a changed dependency declaration is found by `reobserve`; `input-id-equals-batch`: the observer's identity equals `readProject`'s for the same inputs. |
| I5-06 | DA06, DA08, DA10, DA11 | `unchanged-surface-no-propagation`: a body edit re-extracts one file and decides nothing, checked set one file; `position-only-refresh`: moved declarations refresh the decisions and diagnostic identities citing them and the revision equals batch; `import-added-self-only`: a new import of an exposed original decides the file's accesses only; `export-added-importers`: a new export re-interprets importers; `export-removed-missing`: importers of a removed export receive `missing-export`; `violation-appears` and `violation-removed`: exactly one finding added then removed; `wide-fanin-bounded`: editing the most imported file's exports checks its importers and no other file; `type-to-runtime-merge`; `alias-identity`. |
| I5-07 | DA05, DA06, DA07, DA09, DA10, DA13, DA14 | `description-relink-subtree`: removing an exposure re-decides the accesses whose importer or original owner lies in the subtree, the checked set excludes others, and the expected denials appear; `description-revert`; `readme-metadata-only`: no compiler, link or decision work; `created-importing-file` and `deleted-file`: resolution-bounded re-interpretation, expected findings; `configuration-broad` and `dependency-broad`: whole re-extraction on the warm compiler, checked set is every file; `invalid-description-current` and `invalid-recovery`; `audit-equal-sequence`: `verify()` after every step of the twelve-step reference sequence reports equal; `audit-detects-drift`: an injected fact corruption is reported and the recomputed revision published. |
| I5-08 | DA11, DA14, DA15, ML02, ML07 | `worker-nonblocking`: the host thread keeps ticking during a cold open; `resource-limit-explicit`: a worker heap limit produces an explicit failure and no pass; `warm-demotion-rebuild`: releasing the compiler keeps facts, and the next update rebuilds and equals batch; `sweep-scheduled` and `sweep-after-configuration`; `deadline-exceeded-explicit`: the update completes and publishes while the request is answered explicitly; `timings-recorded`; `dispose-releases`: thread, server process, timers and watcher handles gone. |
| I5-09 | DA02, DA04, DA11, DA15, ML02, ML03 | `session-driver-open`; `revision-from-session`: fingerprints from the observed inputs, sequence monotonic; `covered-immediate`: an `expect` already covered is answered with no analysis and `reusedRevision: true`; `flush-on-uncovered`: an uncovered identity flushes the debounce window and is answered by exactly one update; `unobserved-input`; `superseded-mismatch`; `history-compact`: history holds headers and deltas within budget and projects a report on demand equal to batch; `cold-explicit` and `not-checked-at-deadline`; `hot-budget-demotion`: opening a third hot context demotes the least recently used one. |
| I5-10 | DA10, DA18 | `increment-removed`: no `analyzeIncrement` or retained-product export remains and the batch entry is unchanged; `plan2-gate-amended`: `--plan 2` passes with the recorded supersession; `plan2-contexts-regression`: the I2 contexts, IPC, process and lifecycle instances pass on the session driver. |
| I5-11 | DA11, DA15, PC03, PC10, QT01 | `changed-hashes-in-cli`: the CLI computes the identities; `changed-delta-document`: the `ramify.check/1` document names findings with `new` marks; `changed-exit-0-1`; `changed-exit-2-not-checked`: cold, deadline, unobserved, superseded and unavailable each exit 2; `changed-no-batch-fallback`; `since-evicted`; `plain-check-unchanged`: the plain document is Plan 2's bare `ramify.analysis/1`; `host-adapter-claude`: the example adapter maps the host's JSON to the command and returns findings through exit 2 and standard error; `service-params-validated`: malformed `scope`, `since` or `deadlineMs` are `invalid-request` on the wire. |
| I5-12 | DA06, DA07, DA08, DA10, DA11 | `reference-sequence-live` and `hundred-owner-sequence-live`: through the real daemon and watcher, every step audited and equal to batch; `hook-race-watcher`: a hook before the watcher event waits for one update, a hook after it is answered immediately; `burst-coalesced`: five writes in one window produce one revision and each hook is covered; `removals-live`. |
| I5-13 | DA11, DA17, ML01, ML02, ML03, ML04 | `hook-latency-reference`, `hook-latency-s100`, `hook-latency-s500`, `hook-latency-s1000`: per edit class, session work and hook end to end; `checked-set-bounded`: checked sets proportional to the change; `repeated-edit-plateau`: 200 alternating cycles; `hot-warm-memory`: two hot and six warm contexts; `cold-open`; `entry-footprints` unchanged from Plan 2. |
| I5-14 | DA18, PC01, QT05 | `self-check-eleven`; `declarations-final`; `package-entries-unchanged`; `plan1-regression`; `plan2-regression`; `documents-revised`: the architecture documents state the retained session, the sweep and the hot and warm levels. |

The matrix exercises only the stated portions of each family. DA11 is
established here for the reference and S100 workloads and recorded for S500
and S1000. DA12, PC05, PC08, ML05, ML06 and QT08 remain later plans'
evidence.

## Harness implementation and evidence

Extend the existing harness; do not add a second checker or a second daemon.

1. Add `plan5-instances.ts` transcribing every leaf of [subcases.md](subcases.md);
   `plan.ts` validates the transcription against this plan's matrix and
   iteration table; `--plan 5` selects it. Register capabilities `engine`,
   `catalog`, `compiler`, `observer`, `session`, `hosting`, `contexts`,
   `supersession`, `hook-cli`, `live-equivalence`, `fast-measure`,
   `harness-gate` and `completion`; availability is distinct from execution.
2. `session` instances call `openRetainedSession` over a harness copy inside
   the test process, apply edits to the copy, call `update` and `verify`,
   and compare with `analyzeProject` over the same disk state as
   [scope.md](scope.md#batch-and-session-comparison) fixes, asserting the
   step's independent expectation as well.
3. `quick` instances use root's `createQuickEnvironment`, whose driver is the
   session driver from iteration 9; `unit` instances use contexts' controlled
   ports with a scripted session handle; `process` instances spawn the
   compiled daemon and the installed executable with a unique
   `RAMIFY_ENDPOINT_DIR` and kill their daemon in `finally`.
4. The Plan 2 amendment: iteration 9 records
   `docs/plans/done/iteration-2-resident-verification/supersession-plan5.md`,
   listing each retired I2 instance and the I5 instance that supersedes it,
   and `plan2-instances.ts` marks those records `superseded` so the `--plan 2`
   gate requires the remaining records plus the named counterparts. Removing
   any other record still fails the gate.
5. Measurement instances run through `npm run measure:fast`, added beside
   `measure:resident`, and assert the recorded values against the
   [budget tables](scope.md#budgets); raw results are archived under
   `scripts/measurements/results/` with the fixture identities and build
   identity.
6. `--iteration <n>` requires the named iteration's instances and its
   transitive prerequisites; the unfiltered command requires everything and
   is expected to fail until iteration 13.
7. Every harness or scripted run of `check:self`, `check:reference` or a
   resident command sets `RAMIFY_ENDPOINT_DIR` to a directory it owns and
   stops the daemon it started in `finally`.

| Command from the Ramify root | Meaning |
| --- | --- |
| `npm run reference:verify -- --plan 5` | Require every I5 instance; fail on missing capabilities, removed records, unrun or failed assertions. |
| `npm run reference:verify -- --plan 5 --iteration <n>` | Require the named iteration and its prerequisites. |
| `npm run reference:verify -- --plan 2` | Required to pass with the recorded supersession from iteration 9. |
| `npm run reference:verify -- --plan 1` | Unchanged; required to pass on the Plan 5 build by I5-14. |
| `npm run measure:fast` | Run the hook and session measurement recipe and archive raw results. |
| `npm run measure:resident` | Plan 2's recipe, amended for the session driver in iteration 12. |
| `npm run check:self`, `npm run check:reference` | Unchanged commands, resident by default; must report eleven and fifteen owners. |

## Iteration sequence

The plan runs as thirteen iterations, each written to be implemented within
a single 250k-token context: one owner or one capability, a bounded slice of
the matrix, its own verification commands and exit criteria. The iteration
files under [`iterations/`](iterations/manifest.json) follow the existing
headings. Iterations 3 and 4 may run in parallel after 2; iterations 11 and
12 may run in parallel after 10. The completion gate is iteration 13's exit.

| # | Iteration | Owners | Requires | Executes |
| --- | --- | --- | --- | --- |
| 1 | Contract package, probes and review points | none | none | review only: accept contracts.md, owners.md, scope.md, subcases.md; run the five [probes](#probes); settle RP-2 to RP-7 |
| 2 | Engine changes and the `--plan 5` harness | typescript, model; harness | 1 | I5-01, I5-02 |
| 3 | Per-file export descriptions | typescript | 2 | I5-03 |
| 4 | Project observer and incremental acquisition | project | 2 | I5-05 |
| 5 | Retained compiler adapter and observed reads | typescript | 3, 4 | I5-04 |
| 6 | Retained session: facts and source-edit paths | analysis | 4, 5 | I5-06 |
| 7 | Retained session: description, broad and metadata paths, positions and the audit | analysis | 6 | I5-07 |
| 8 | Session hosting: worker thread, sweep, deadlines, hot and warm | analysis | 7 | I5-08 |
| 9 | Contexts on the session driver and Plan 2 engine removal | contexts, daemon, root | 8 | I5-09, I5-10 |
| 10 | Compact reply, `check --changed` and the host adapter | root service, daemon, cli; `examples/hooks/` | 9 | I5-11 |
| 11 | Live equivalence gate | integration | 10 | I5-12 |
| 12 | Hook and session measurements | measurement tooling | 10 | I5-13 |
| 13 | Declarations, document revisions, self-check and completion | all owners; docs | 11, 12 | I5-14 |

Iteration 1 is a review gate: iteration 2 onward implements the reviewed
contracts, and a change to them revises iteration 1's package first.
Iteration 2's harness registration lists every instance as not executed.
Iteration 4 depends only on iteration 2 because the observer uses no
compiler change; iteration 5 needs the per-file descriptions of iteration 3
and the observation sink of iteration 4; iteration 6 needs both the observer
and the adapter.
Iteration 9 is the only iteration that deletes Plan 2 source, and it lands
the supersession amendment in the same commit as the deletion.

### Probes

Iteration 1 runs five probes under `scripts/probes/fast-check/`, each with a
JSON result beside the existing ones, and revises [scope.md](scope.md#budgets)
once from them.

| Probe | Question | Feeds |
| --- | --- | --- |
| P5-1 `snapshot-update-costs.mjs` | The cost of `updateSnapshot` for a body edit, an import-list change, a created file with configuration regeneration, and `invalidateAll`, on the reference, S100 and S1000. | Source and broad budgets; whether a created file can enter the program without regenerating the synthetic configuration. |
| P5-2 `description-closure.mjs` | The dependency closure sizes of per-file export descriptions on R, T, S100 and S1000: star, forwarding and namespace edges, the largest closure, the median. | RP-3; the catalog budget rows. |
| P5-3 `interpreter-setup.mjs` | The per-call setup of `collectAccesses` with `only` at S1000 and the cost after hoisting it into a maintained interpreter. | I5-01 `hoisted-setup-bounded`; the source budget rows. |
| P5-4 `worker-session.mjs` | A session in a worker thread with `resourceLimits`: cold open, the structured-clone cost of an S1000 revision message, behavior at the heap limit, and main-thread responsiveness. | RP-2; the worker limits. |
| P5-5 `observed-reads.mjs` | Whether the compiler's filesystem callbacks, recorded by a sink, reproduce the batch capture's input set by path, role and identity on R and S100. | RP-5 and I5-04 `observed-reads-complete`. |

## Validation and completion conditions

Run the following in the Ramify package; script additions above are
implementation tasks, not commands claimed to exist today.

```sh
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run build
npm run type-check
npm test
npm run reference:cases
npm run check:reference
npm run check:self
npm run reference:verify -- --plan 1
npm run reference:verify -- --plan 2
npm run reference:verify -- --plan 5
npm run measure:fast
npm run measure:resident
npm run reference:report
npm run diagrams
npm run site:build
node dist/src/cli-entry.js daemon stop
git diff --check
```

The plan is complete only when all of these hold:

Decisions by Dan, 2026-09-14, recorded verbatim:

> - Iteration 12's remaining measurement workloads are waived: S500 and S1000 are not measured. The other unexecuted I5-13 workloads (checked-set-bounded, repeated-edit-plateau, hot-warm-memory, cold-open, entry-footprints) are also not run for this closure; record them as not executed, never as passed, and list them as remaining gaps. The reference and S100 hook latency rows are established by the hook optimization and structural edits measurement results; cite those.
> - Plan 5 is closed on this branch; merging to `main` is not part of the closure. Do not describe the plan as merged to main.
> - Iteration 11's unconfirmed automation gate: re-run what iteration 13's gate list requires; if the unfiltered `--plan 5` gate still needs the waived measurement instances, record each such instance by ID as waived by that decision rather than faking a pass, and state that the unfiltered gate is therefore not fully green.

Under these decisions the hook latency condition below is established on the
reference and S100 by the successor measurement results, the S500 and S1000
conditions remain gaps, and `npm run measure:fast` was not run for the closure.
A later decision of the same date ran the resident workloads instead: seven of
them on the final build, `synthetic-1000` once as a smoke test and S500 waived.
The [completion report](iterations/iteration13-results.md) records each
condition's evidence, the three gates and the open defects.

- [ ] `ramify check --changed <file>` inside the reference answers from the
  covering revision, marks new findings, exits 0, 1 or 2 as the tables fix,
  and never runs a batch analysis; the plain `ramify check`, `watch` and
  `daemon` commands behave as Plan 2 fixed.
- [ ] Every required I5 subcase ran and asserted its independent expectation;
  api, session, quick, unit, ipc, process and measurement evidence are
  recorded separately.
- [ ] Session revisions equal batch reports for identical observed inputs at
  every step of the recorded sequences, including input identity, coverage
  and expanded contracts, and the session's audit passed after every step.
- [ ] The unchanged-surface path decides nothing, the source path checks the
  changed files and their importers only, the description path stays inside
  the subtree, the metadata path touches no compiler, and the broad path
  says so.
- [ ] Hooks are answered from published revisions when the watcher has
  delivered, join exactly one update otherwise, and receive explicit `cold`,
  `deadline-exceeded`, `unobserved-input` and `superseded` outcomes.
- [ ] Hook latency budgets on the reference and S100 are met with raw results
  archived; S500 and S1000 values and memory plateaus are recorded against
  their targets.
- [ ] Plan 2's engine core is removed, the supersession amendment is
  recorded, and `--plan 2` and `--plan 1` pass on the same build.
- [ ] `npm run check:self` accepts eleven owners; the declarations and the
  eight package entries validate; the architecture documents are revised.
- [ ] The completion report records the compact reply, the delta and hook
  contracts, the session and revision vocabulary, the budgets, the
  supersession and the fixtures Plans 3, 4 and 6 need.

## Risks and decisions to settle early

| Risk | Required response inside this plan |
| --- | --- |
| The per-file fixed point misses a dependency and a description goes stale | Every description records what it read; I5-03 `closure-superset` compares each recomputed set with a whole recompute on three fixtures; I5-07 and I5-12 audit after every step. |
| Positions carried into decisions drift after a move | I5-06 `position-only-refresh` is a required instance, and the audit compares `results[].decisions[].original.declarations`. |
| The session's observed set is smaller than a batch capture's | P5-5 establishes feasibility before iteration 5; I5-04 `observed-reads-complete` and I5-05 `input-id-equals-batch` assert equality; the sweep covers what the watcher cannot. |
| `updateSnapshot` costs 65–133 ms when import lists or the configuration change | P5-1 measures the alternatives; the source and broad budgets account for it; the unchanged-surface path pays 2–3 ms. |
| The worker thread hides a compiler crash or exhausts memory | `resourceLimits`, explicit `resource-unavailable` and `analysis-failed` outcomes, and I5-08 `resource-limit-explicit` and `dispose-releases`. |
| Retiring I2 instances weakens Plan 2's gate | Only the nine `analyzeIncrement` reuse instances and `I2-11:reuse-equal` are superseded, each by a named I5 instance; every context, IPC, process, lifecycle and equivalence instance stays required (RP-4). |
| The hook's process cost eats the budget | The floor is measured separately (28 ms bare Node, 78 ms measured client); budgets separate daemon work from end to end. |
| Iteration 6 exceeds one context | Its scope is the source-edit paths only; description, broad, metadata, positions and the audit are iteration 7, and hosting is iteration 8. |
| Whole-project link and model at S500 and S1000 | Recorded, not hidden: the description path budgets at S500 and S1000 are advisory; a proportional relink is an explicit deferral with its trigger in scope.md. |

Review points for iteration 1, each with the recommended choice:

| ID | Question | Alternatives | Recommendation or decision |
| --- | --- | --- | --- |
| RP-1 | Number and position | (a) Plan 5 before Plan 3; (b) a new number after Plan 6 | Decided in this draft: (a). |
| RP-2 | Session host | (a) worker thread with `resourceLimits`; (b) child process | (a); P5-4 confirms responsiveness, clone cost and the heap-limit outcome; (b) stays the fallback behind the same contract. |
| RP-3 | Per-file catalog algorithm | (a) dependency-driven recomputation over the closure with the same fixed point; (b) whole-project catalog first | (a); the spike's verdict and P5-2's closure sizes. |
| RP-4 | Plan 2 supersession | (a) retire the reuse instances by amendment; (b) keep them executing against a compatibility shim | (a); a shim would keep the whole-project recapture alive. Needs the user's acceptance. |
| RP-5 | Input identity | (a) observe the compiler's reads and equal batch; (b) accept a smaller observed set with a different `inputId` | (a); P5-5 establishes it. |
| RP-6 | Binding targets | (a) hook targets on the reference and S100 binding at iteration 12; the rest advisory; (b) all advisory under Plan 2's decision | (a); the hook target is the deliverable. Needs the user's acceptance. |
| RP-7 | Hot contexts and sweep interval | Two hot contexts and a 30 s sweep while active, or other values | Two and 30 s, revised once from P5-4 and iteration 12. |

Do not add persistent caches, a syntactic pre-filter, a configuration
language, a second checker or an inspection command to resolve schedule
pressure. If a required case cannot be implemented within the agreed scope,
report the specific unfinished capability; changing the plan gate requires
an explicit plan revision.
