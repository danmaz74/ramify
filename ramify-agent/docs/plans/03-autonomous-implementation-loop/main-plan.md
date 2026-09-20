# Plan 3: The autonomous implementation loop MVP

**Date:** 2026-09-20. **Status:** iteration 0, the spike, is complete; no production code
has been written. Its predecessor, Plan 2, has passed its completion
gate, so execution is **unblocked**; the evidence is in
[Predecessor evidence](#predecessor-evidence).

This plan takes ramify-agent from its implemented mapping harness, whose mapping
job it converts into the run's initial analysis, to a durable,
deterministic work loop that implements a selected plan with pi agents. It
implements the MVP defined by
[Autonomous implementation loop with global and local architects](../../architecture/autonomous-implementation-loop.md)
under the boundaries of the [authoring brief](authoring-brief.md).

The durable records, identifiers, rules, submission unions and run-log events
are defined once in the [core records proposal](core-records.proposal.md). This
plan references those structures by name and does not restate their shapes. It
defines only the records the proposal left to it, and records a working
assumption for each of the proposal's twelve open decisions.

## Runnable outcome

A person starts the harness for a Ramify project, opens its web page, chooses a
plan and starts an **implementation run**. A global architect assigns the plan's
entry capabilities to modules and records its deeper hypotheses. The harness
establishes a passing baseline, then works the frontier: a local architect plans
each module work item, engineers implement bounded iterations behind a write
guard, contract sub-sessions establish agreements and fakes, provider work items
satisfy the registered obligations, and consumers verify against the real
provider. The harness owns every check verdict and every durable record. The run
ends `completed` with a passing final gate, or `failed` with evidence. Nothing
waits for a person.

```text
start-run
  -> initial analysis: entry assignments and hypotheses
  -> readiness: dependencies, commands, baseline
  -> work: local architects, engineers, global placement forks,
           contracts, providers, verification
  -> final gate: all project tests, type check, complete Ramify check
  -> completed

bounded unrecoverable failure -> failed, with evidence
```

The web client is optional to the run. It starts and stops a run and shows the
plan, entry assignments, hypotheses against decisions, work items, iterations,
checks, failures, capability progress and KPI coverage.

## Predecessor evidence

[Plan 2](../02-contract-authority-refactor/main-plan.md) is a hard execution
predecessor. Its completion gate is verified as follows, from its
[iteration 1 results](../02-contract-authority-refactor/iterations/iteration1-results.md)
and from the working tree on 2026-09-20.

| Plan 2 gate item | Evidence in the tree today |
| ---: | --- |
| 1. `subs/contracts/` gone; no `ramify-agent/contracts` owner | No `module.ramify` exists under `subs/contracts/`; the only remaining `contracts` declaration is `fixtures/collection-review/subs/workspace/subs/contracts/module.ramify`, which belongs to the fixture project. `.ramify-architect/` holds `harness`, `harness/agent`, `harness/agent/pi`, `web` and the root, and no `contracts` directory. |
| 2. Public names, shapes, signatures and `browser` tags preserved | Recorded in the results note: the same seven files and the same 110 names before and after, each declaration block byte-identical once the source path is normalized. Not re-derived here; the baseline copies were kept outside the working tree. |
| 3. Web requester view reports every imported contract symbol as available from harness-owned source | `npm run check:self` reports 0 denied accesses over 776 accesses. |
| 4. HTTP paths, payload schemas, error mappings, command semantics, map validation and persisted formats unchanged | Recorded in the results note, file by file. |
| 5. `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self` pass | Re-run here: `npm run type-check` exit 0 and `npm run check:self` passed with complete coverage (below). `npm test` and `npm run build:web` were **not** re-run by hand; their outcome is taken from the Plan 2 results note (21 files, 160 tests; 287 modules built). Iteration 0 re-runs the complete baseline at execution start. |
| 6. A result note with evidence identity, surface comparison, tree, commands | Present. |

The harness's `module.ramify` exposes the seven `src/interfaces/` contract files
to its parent with the `browser` tag, and the root re-exposes exactly those
names to its descendants. Plan 3 therefore extends a harness-owned protocol in
place and creates no neutral definitions module.

The [contract-module analysis](../../analysis/2026-09-20-contract-module-analysis-brief.md)
has a [result note](../../analysis/2026-09-20-contract-module-analysis-result.md),
which also states what the analysis did not record. Its result is an
uncommitted addition to the toolkit's module-architect principles, **Contracts
Follow Responsibility**, and to the module-architect skill's decomposition
reference: a capability's public contract normally belongs with its
implementation, a consumer-defined port with the consumer, and a separate
contract module needs independent agreement, compatibility responsibility or
abstraction benefit that outweighs its navigation and coordination costs.
Sharing alone does not justify separation. That confirms Plan 2's target
structure and is the rule this plan applies when it places contracts. Those
toolkit files are outside this project and are not edited by this plan.

## Current state this plan was authored from

Established on 2026-09-20 from the working tree, not copied from earlier
documents.

| Fact | Value |
| --- | --- |
| Architect view | `ramify.architect-view/1`, revision `rev/1:7c47db45-ed53-4d35-ab73-65b8a5c4bdcb:1`, input identity `input/1:a9cd361b802e43465f59efd10185aa245b21b4aea1539b5c241cf4a1b32193c8`, 5 modules, 338 records, dependencies measured, production scope, detail cut 92 |
| Refreshed with | `node_modules/.bin/ramify materialize --view architect` |
| `ramify measure` revision | `rev/1:7c47db45-ed53-4d35-ab73-65b8a5c4bdcb:1`, views measured |
| `npm run type-check` | exit 0 (root, `subs/web`, `scripts`) |
| `npm run check:self` | `ramify check --batch --root .`: completed, check passed, coverage complete. 5 owners, 73 source files, 3 resources, 776 accesses. 0 errors, 0 warnings, 0 analysis limits; 478 allowed, 0 denied, 298 external |
| `npm test`, `npm run build:web` | Not run by hand. Baseline from the Plan 2 results note: 21 files and 160 tests pass; the browser build produces 287 modules. Iteration 0 re-runs all four |
| Installed toolkit CLI | `ramify check`/`watch`/`materialize`/`measure`/`explore`/`daemon`; `check --changed` and `check --batch` both available |
| Pinned agent SDK | `@earendil-works/pi-coding-agent` 0.85.1, exact pin, with `@earendil-works/pi-agent-core` 0.85.1 nested beneath it |

The detail cut of 92 means an absent detail in the architect view is not
evidence that behavior is absent.

### Module tree and exposures today

```text
ramify-agent                     src/cli.ts, src/main.ts, src/tests/
├── harness                      the only writer of durable state
│   ├── src/interfaces/map.ts, src/interfaces/protocol/{ids,queries,errors,jobs,maps,paths}.ts
│   ├── src/{jobs,mapping,maps,plans,store,http}/
│   └── agent                    the agent port and the scripted fake
│       └── pi                   pi 0.85.1 behind the port
└── web                          browser client; receives contracts only
```

The root exposes the harness's 110 public contract names to its descendants by
explicit named selection. `harness` exposes `startServer`, `ProjectRootError`
and `ProjectLockError` to its parent and nothing to its descendants. `agent`
exposes its port to its parent **and** to its descendants, and re-exposes
pi's factory to its parent. `web` exposes nothing.

### Measured sizes

From `ramify measure`, in bytes, and from the files themselves.

| Owner | Exact production source | Subtree production source | Exact tests |
| --- | ---: | ---: | ---: |
| `ramify-agent` | 2 files / 5,007 | 47 files / 241,188 | 1 / 1,694 |
| `ramify-agent/harness` | 28 files / 156,355 | 31 / 183,867 | 15 / 109,845 |
| `ramify-agent/harness/agent` | 2 / 11,406 | 3 / 27,512 | 1 / 4,879 |
| `ramify-agent/harness/agent/pi` | 1 / 16,106 | 1 / 16,106 | 2 / 24,147 |
| `ramify-agent/web` | 14 / 52,314 | 14 / 52,314 | 7 / 36,513 |

Inside the harness's own production source: `jobs/` is 6 files, 1,074 lines and
47,677 bytes; `mapping/ramify-cli.ts` and `mapping/views.ts` are 2 files, 306
lines and 14,623 bytes; `store/` is 4 files and 11,629 bytes;
`src/interfaces/` is 7 files and 29,375 bytes.

### Agent port today

`subs/harness/subs/agent/src/interfaces/port.ts` defines `AgentPort`,
`SessionSpec`, `ToolDefinition`, `SubmissionTool`, `AgentEvent` (three
variants), `TokenUsage`, `SessionOutcome` (`submitted`, `ended`, `failed`,
`stopped`) and `AgentSession` (`outcome`, `stop`). `BuiltinTool` is
`'read' | 'grep' | 'ls' | 'find'`: no `edit`, no `write`, no shell. There is no
session mode, no context observation, no compaction event, no tool guard and no
settlement signal. Plan 3 adds those; see [Agent port](#agent-port-additions).

## Inputs and precedence

1. [Autonomous implementation loop](../../architecture/autonomous-implementation-loop.md) — the MVP behavior.
2. [Harness principles](../../harness.principles.md) — the general boundaries. Where the architecture records an MVP difference, such as continuing without a review wait, the architecture governs and the difference stays visible.
3. The contract-authority result described above, and [Plan 2](../02-contract-authority-refactor/main-plan.md) as the executed predecessor.
4. [Plan 1's completion report](../01-implementation-map/completion-report.md) — implemented capabilities and the handoff. Historical evidence, not current architecture authority.
5. [The initial capability and module hypothesis](../../spikes/autonomous-loop-initial-analysis/README.md) and its [machine artifact](../../spikes/autonomous-loop-initial-analysis/initial-analysis.json). Only its two entry assignments are accepted; deeper placements are hypotheses this plan confirms or revises.
6. [Measurements and KPIs](../../measurements-and-kpis.md) — reconciled in [KPIs](#kpi-storage-and-projection-versioning).
7. Ramify's [hook and complete check contract](../../../../docs/architecture/cli-invocation.spec.md#hook-and-complete-checks) and its [post-write example](../../../../examples/hooks/README.md).
8. [The core records proposal](core-records.proposal.md) — referenced, not restated.
9. [The MVP shortlist of cucumber-viz lessons](../../cucumber-viz-lessons/mvp-shortlist.md) — its sections 0, 1, 3 and 4 are decided requirements of this plan; section 2's reference copies are in [reuse/](reuse/README.md). Everything in its "Left for later" list and in the other lesson documents is [deferred](#deferred-work).

The proposed Ramify architect-view diff is not a dependency. `docs/.superseded/`
was not read.

## Module tree after Plan 3

Two children are created: `evidence`, extracted with the measured justification
below, and the ledger, which Dan decided on 2026-09-20. `harness/jobs` is not
extracted: see [why not](#why-harnessjobs-is-not-extracted). No broad
`execution` container is created. Workflow coordination, checks, obligations and
KPI calculation stay in `harness`'s own `src/` as directories.

```text
ramify-agent
├── harness                      the only writer of durable state
│   ├── src/interfaces/          the protocol, with the run protocol; `map.ts` and `protocol/maps.ts` removed
│   ├── src/{analysis,work,contracts,gates,guard,context,prompts,kpi}/   new
│   ├── src/{jobs,plans,store,http}/                                     kept; jobs moves onto the ledger
│   ├── src/{mapping,maps}/                                              converted into analysis/ and removed, iteration 5
│   ├── ledger                   NEW: the transaction service; imports nothing from the harness
│   ├── evidence                 NEW: facts about the target project, and its git
│   └── agent
│       └── pi
└── web
```

### Why `harness/ledger` is its own module

It is the critical path of every recovery, so it is one independent service,
tested beyond the rest, and the normal harness code uses it. It implements rules
3, 4 and 11 of the proposal and knows nothing of jobs, runs, agents or git.

| Evidence | Value |
| --- | --- |
| Source | `store/atomic.ts` and `store/jsonl.ts` move into it, 140 lines; the transaction, replay, materialization and effect code is new |
| Knowledge hidden | How an append becomes durable, what a torn line is, how record files are rebuilt from the log, how an external effect goes from intent to completion |
| Imports | Node and zod only. Nothing from `harness`, `jobs`, `evidence` or `agent` |
| Consumers | `harness`, in its `src/jobs/` for every job's log and in its lock and state-directory files that need an atomic write |
| What crosses | `openLedger`, `Ledger` (`append`, `replay`, `materialize`, `effect`, `pendingEffects`), `Transaction`, `RecordBody`, `RecordRead`, `LedgerCorruptError`, and the two file primitives |

`subs/harness/subs/ledger/module.ramify`:

```ramify
ramify 1
module ledger

// One flushed append is one transaction; record files are materialized copies
// of the log; an external effect goes from intent to completion under a key.
expose-src Ledger, openLedger, Transaction, RecordBody, RecordRead, LedgerCorruptError from "ledger.ts" to parent
expose-src EffectSpec, PendingEffect from "effects.ts" to parent
expose-src writeFileAtomic, writeFileExclusive, syncDirectory, ExclusiveWrite from "atomic.ts" to parent
expose-src JsonLines, CorruptJsonLinesError, readJsonLines, appendJsonLine, discardPartialLine from "jsonl.ts" to parent
```

The harness's `src/jobs/` keeps what is about jobs: the job record and directory
layout, the job event schema, command acceptance and the mapping of a job's
version to the ledger's last sequence. Its `commit.ts` is a thin adapter over
the ledger, not a second implementation.

### Why `harness/evidence` is extracted

It hides one dependency with one responsibility: **obtaining a fact about the
target project**, by running the Ramify CLI or one of the project's own
commands, and by reading what Ramify generates.

| Evidence | Value |
| --- | --- |
| Source moving out | `mapping/ramify-cli.ts` and `mapping/views.ts`: 2 files, 306 lines, 14,623 bytes, 9.4% of the harness's own production source |
| Knowledge hidden | The `ramify` executable and its exit codes, the private daemon (`RAMIFY_ENDPOINT_DIR`) that works around the toolkit defect Plan 1 recorded, the architect-view and API-view file formats, the `ramify.measure/1` document, and process-group teardown for external commands |
| Consumers today | 4: `mapping/procedure.ts`, `mapping/architect.ts`, `mapping/validate.ts`, `http/app.ts` |
| Consumers Plan 3 adds | 8: readiness, the gate engine, the post-write hook check, placement view refresh, measurement snapshots, write-guard owner resolution, test selection, the run branch and its commits |
| What crosses | Named operations only. No CLI argument vector, endpoint directory or view path reaches a consumer |

### Why `harness/jobs` is not extracted

Plan 1 set the trigger: extract when a second job kind exists. Dan decided on
2026-09-20 that the mapping job is [converted into the initial analysis](#the-mapping-job-becomes-the-initial-analysis),
so the implementation run is the only kind of job and the trigger never fires.
What is hard and shared, the durable transaction, already has its own module in
the ledger. The job code stays a directory of the harness's own source,
`src/jobs/`, 6 files and 47,677 bytes today, and iteration 1 moves it onto the
ledger. Iteration 12 measures the result, as for every other boundary.

### Boundaries deliberately not created

| Candidate | Decision |
| --- | --- |
| `harness/execution` | Rejected. It would hold workflow composition, records, checks and measurements before the interfaces among them are known. That moves complexity; it hides none. |
| `harness/contracts` or `harness/run` | Rejected. A definitions repository, which the contract-authority rule excludes. |
| `harness/gates`, `harness/guard` | Deferred. They are directories in the harness's own `src/` in this plan. Iteration 12 measures the result and names any boundary that has since earned itself. |

### Exact public exposures

`subs/harness/subs/evidence/module.ramify`:

```ramify
ramify 1
module evidence

// Running the Ramify CLI: the executable, its exit codes and the private
// daemon stay here.
expose-src RamifyCli, RamifyRun, MaterializeResult, ramifyVersion, privateRamify from "ramify-cli.ts" to parent

// Reading what Ramify generates: the architect view, a requester API view and
// the measurement document. Their file formats stay here.
expose-src ArchitectMeta, readArchitectMeta, coverageLimitsOf, ArchitectIndex, loadArchitectIndex, loadModuleTree from "views.ts" to parent
expose-src ModuleEntry, SymbolRecord, findModule, symbolRecords, SourceArea, ApiViewSnapshot, readApiView, findInView from "views.ts" to parent
expose-src MeasurementDocument, ModuleMeasurement, readMeasurement from "measure.ts" to parent

// Running one of the target project's own commands, in its own process group
// and with a clean environment.
expose-src runCommand, CommandRun, CommandOutcome, CommandOutput from "run-command.ts" to parent

// The identity of the state the evidence describes.
expose-src guardedFilesHash from "guarded-files.ts" to parent

// Git, for the run branch: a clean-repository check, the branch, the commit made
// after a gate passes, and what changed.
expose-src GitError, isCleanRepository, createRunBranch, commitAccepted, findCommitByTrailer, changedPaths, diffNumstat from "git.ts" to parent
```

`subs/harness/module.ramify` adds one statement in iteration 11, and in
iteration 5 loses the two for `interfaces/map.ts` and
`interfaces/protocol/maps.ts`, which are removed with the map:

```ramify
// The run protocol, beside the job protocol this module already owns.
expose-src * from "interfaces/protocol/runs.ts" tagged [browser] to parent
```

Neither child needs the harness's vocabulary: `ledger` imports nothing from the
harness, and `evidence` returns its own types, so nothing is exposed to
descendants.

The root `module.ramify` adds named selections for
`interfaces/protocol/runs.ts` to its descendant channel, in the same style as
its existing per-file groups. It re-exposes nothing from `evidence` or `ledger`:
both are the harness's internals.

`subs/harness/subs/agent/module.ramify` is unchanged in shape; the port file it
exposes gains the additions below.

Each new module is declared in the iteration that gives it behavior, with a
`README.md` whose first top-level prose paragraph states its purpose.

## The mapping job becomes the initial analysis

Decided by Dan, 2026-09-20. Plan 1's implementation map was an earlier
hypothesis of how to describe a plan on the module tree. It is removed, and the
mapping job is converted into the run's initial analysis; the two are the same
shape, one architect session that reads the plan and the architect view and
submits a validated result.

| Map section | In the run |
| --- | --- |
| `entryPoint` and its acceptance | `EntryAssignments.entries` with their owners and acceptance refs |
| `workItems` | Dropped: one work item per entry capability, always |
| `newCapabilities` | `Hypothesis` with change `create`, a suggested owner and anticipated consumers |
| `reuse`: capability, symbols, owner | `Hypothesis` with change `reuse` or `extend` |
| `seams` | `Hypothesis.dependsOn`, tentative |
| `modulesTouched` | `Hypothesis.involvedModules`; the weights are dropped with the deferred owner-drift KPI |
| `assumptions`, `notFound`, `coverageLimits` | `uncertainties` and `coverageLimits` |
| `evidence` with citations | `citations` on every entry and hypothesis, validated against the view under rule 10 |
| Map revisions | `Hypothesis` revisions; revision 1 is never rewritten |
| `reuse.availability` | Dropped from the analysis. Placement does not establish requester-specific importability; the local architect verifies it against concrete work, and the API-view tool moves to it |
| Approval, `approve-map`, the approval record | Dropped. No step waits for a person |

| Code | Becomes |
| --- | --- |
| `mapping/architect.ts`: the session, its tools, bounded correction | The initial-architect invocation in `src/analysis/` |
| `mapping/validate.ts`: citations verified against the views | The rules beyond the schema for `InitialAnalysisSubmission` |
| `mapping/architect-prompt.md`, `mapping/feature-mapping.md` | The starting point of the `initial-architect/1` prompt package |
| `mapping/ramify-cli.ts`, `mapping/views.ts` | `harness/evidence`, in iteration 1 |
| `mapping/procedure.ts`, `mapping/demo-script.ts`, `maps/revisions.ts` | Removed |
| `interfaces/map.ts` | Removed, except `modulePathSchema`, `sha256Schema`, `citationSchema`, `viewIdentitySchema` and `inputManifestSchema`, which move to `interfaces/protocol/evidence.ts` |
| `interfaces/protocol/maps.ts`, the `approve-map` command, `start-mapping` | Removed; `start-run` takes their place |
| Web `map-view.tsx`, `map-document.tsx`, `mapping.ts` | Removed; the Run page of iteration 11 shows hypotheses and decisions. `module-tree.tsx` is kept |
| `scripts/live-trial.ts` | The live trial of iteration 12 |

The conversion happens in iteration 5, where the initial analysis is built, so
that the job machinery keeps a living consumer while iterations 1 to 4 move it
onto the ledger. Between iteration 5 and iteration 11 the web shows plans only.
A mapping job directory left on disk by Plan 1 is not a run and is not listed.
What is lost is running the analysis alone before anything is implemented;
letting a run stop after its analysis is [deferred](#deferred-work).

## Durable records

The [core records proposal](core-records.proposal.md) defines the ten rules,
the identifiers, the run layout, `RunRecord`, `RunPolicy`, `EntryAssignments`,
`Hypothesis`, `RegistryEntry`, `PlacementRequest`, `PlacementDecision`,
`GlobalContext`, `WorkItem`, `WorkItemOutline`, `IterationAssignment`,
`WriteScope`, `TestSelection`, `IterationResult`, `Invocation`,
`InvocationOutcome`, `ContractRecord`, `ProviderObligation`,
`ConsumerRequirement`, `GateAttempt`, the submission unions, the run log, the
observation log and the public projections. This plan adopts all of them.

### Records the proposal left to the plan

Same style, same rules: immutable files, committed by an event, no status
field, links point backwards.

```ts
interface ReadinessAttempt {                // readiness/<nn>/attempt.json
  schema: 'ramify-agent.readiness-attempt/1';
  attempt: number;                          // count of committed readiness attempts
  head: string;                             // the commit readiness ran on
  steps: Array<{
    step: 'project-root' | 'git-clean' | 'compiler-config' | 'test-runner' | 'nested-packages'
        | 'test-discovery' | 'ramify-daemon' | 'baseline-tests' | 'baseline-type-check'
        | 'baseline-ramify-check';
    outcome: 'passed' | 'failed' | 'not-verified';
    detail: string;
    command?: CheckCommand; gate?: GateAttemptId;
  }>;
  /** Independent nested packages found, and what each one answered. */
  nested: Array<{ directory: string; manifest: string; installed: boolean; testScript: string | null }>;
  verdict: 'passed' | 'failed';
  recovery: RecoveryId | null;              // the recovery attempted after a failure
}

interface InfrastructureRecovery {          // recoveries/<recovery-id>.json
  schema: 'ramify-agent.infrastructure-recovery/1';
  id: RecoveryId;                           // `rec-0004`, count of committed recoveries
  subject: { gate?: GateAttemptId; readiness?: number; invocation?: InvocationId };
  cause: GateAttempt['cause'] | 'session-lost' | 'daemon-unavailable';
  action: 'restart-daemon' | 'reinstall-nested' | 'rerun-command' | 'reconstruct-session' | 'none';
  attempt: number;                          // counted over committed history for this subject
  outcome: 'recovered' | 'failed';
  evidence: string[];                       // command output file references
}

interface MeasurementSnapshot {             // measurements/<snapshot-id>.json
  schema: 'ramify-agent.measurement-snapshot/1';
  id: string;                               // `ms-0007`
  policy: 'scope-size/1';
  head: string;                             // the run branch's head when it was taken
  /** The captured `ramify.measure/1` document, verbatim, with its revision. */
  measure: { revision: string; document: unknown; hash: string } | { unavailable: string };
  view: ViewIdentity | null;
  /** Supplementary bytes outside Ramify's inventory: prompts, skills, the captured plan. */
  supplementary: Array<{ path: string; bytes: number }>;
}

interface LineEventSummary {                // invocations/<inv>/lines.json
  schema: 'ramify-agent.line-events/1';
  invocation: InvocationId;
  /** Per path: added and deleted text lines, from `git diff --numstat` between two accepted commits. */
  paths: Array<{ path: string; owner: ModulePath | null; added: number; deleted: number; binary: boolean }>;
  unmapped: { paths: number; added: number; deleted: number };
  coverage: 'complete' | 'partial';
  gaps: string[];                           // such as 'unguarded-shell', 'changed-paths-unknown'
}

interface PromptPackageManifest {           // prompts/manifest.json, written once
  schema: 'ramify-agent.prompt-manifest/1';
  packages: Record<Role, {
    package: string;                        // such as 'engineer/1'
    hash: string;                           // over every file below
    files: Array<{ path: string; hash: string; kind: 'system' | 'procedure' | 'skill' | 'submission-schema' }>;
    /** The submission union members this package offers the role. */
    submissionKinds: string[];
  }>;
}
```

`RecoveryId` joins the proposal's identifier table with the same rule: a count
of committed recoveries. The run's failure vocabulary is:

```ts
type RunFailureReason =
  | 'readiness-failed' | 'analysis-invalid' | 'agent-failed' | 'invalid-submission'
  | 'inputs-changed' | 'dependency-cycle' | 'unresolvable-requirement'
  | 'repair-exhausted' | 'recovery-exhausted' | 'writer-unsettled'
  | 'limit-exceeded' | 'internal';
```

### The S_s recipe

`MeasurementSnapshot` plus an invocation's declared scope yields `S_s`, the
deduplicated union in bytes, as
[the KPI contract](../../measurements-and-kpis.md#scope-size-policy-v1)
defines it. The recipe is mechanical:

| Component | Source | Deduplication |
| --- | --- | --- |
| 1. Source, resource and documentation bytes of the selected exact owners and subtrees | `ramify.measure/1` per-module buckets, selected by `WriteScope.resolved.roots` and `read` | By owner and source area |
| 2. Each declared ordinary or testing API-view area, once, at its measured total | The same document's view buckets | By owner and physical source area |
| 3. Architect-view bytes when the role's profile includes the global view | The measure document's publication size for the architect view | Once per invocation |
| 4. Named support documents: the captured plan, the prompt package, the skill | `MeasurementSnapshot.supplementary` | Never counted again if component 1 already supplied the file |

`B` is frozen from the first snapshot of the run, over the root subtree, all
view areas, the architect view and the initial support set, each once. A missing
component makes the total `unavailable` with its known subtotal and coverage
beside it, never zero. A new module's proposed size is `unknown`.

## The state machines

The harness owns states, transitions, durable events, bounds and scheduling.
Agents decide semantics. Every event name below is the proposal's unless marked
**new**; new events are named where this plan needs a transition the proposal
did not enumerate.

Shared rules, from the proposal: one log line is one transaction and record files are materialized copies; the closing event is
the last write of its work; an event that licenses an agent is appended before
the agent starts; counters are counts over committed history keyed by the work,
never by session; every idempotency key is derived by the harness from committed
state, so a repeated step after a crash derives the same key.

### SM1 — The implementation run

| | |
| --- | --- |
| States | `starting`, `analysis`, `readiness`, `working`, `final-verification`, `completed`, `failed`, `stopped`, `interrupted` |
| Authority | `events.jsonl` of the run; `job.json` is `RunRecord`, written once |
| Projection | `RunSnapshot` (`phase`, `state`, `failure`, `current`, `counts`) |
| Idempotency | `commandId` + content hash for `start-run`; the run ID is the job ID |
| Bounds | `maxWorkItems`, `maxInvocationsPerRun`, `runAbsoluteMs` from `RunPolicy` |
| Proves completion | `job-completed`, which requires a passing `final` `GateAttempt` on the current tree, every work item closed by `work-item-completed`, and every `ConsumerRequirement` closed by `requirement-verified` at its current contract revision |

| From | Event | To | May start |
| --- | --- | --- | --- |
| — | `job-started` | `analysis` | the initial architect |
| `analysis` | `analysis-accepted` | `readiness` | readiness |
| `analysis` | `job-failed` (`analysis-invalid`) | `failed` | — |
| `readiness` | `readiness-passed` | `working` | the first local architect |
| `readiness` | `readiness-failed` after `readinessRecoveries` | `failed` | — |
| `working` | `work-item-completed` for the last work item | `final-verification` | the final gate |
| `final-verification` | `job-completed` | `completed` | — |
| any | `stop-requested` then `job-stopped` | `stopped` | — |
| any | process loss | `interrupted` on restart | recovery |

An empty work queue alone never satisfies `job-completed`. A run that starts
with no entry capabilities and passes its final gate completes; that degenerate
case is iteration 4's exit evidence.

### SM2 — Initial analysis

| | |
| --- | --- |
| States | `invoking`, `validating`, `accepted`, `failed` |
| Records | `EntryAssignments` (once), every `Hypothesis` at revision 1, one `RegistryEntry` and one `WorkItem` per entry capability |
| Idempotency | `InvocationId`; the submission hash. Every record of the phase is in the one `analysis-accepted` line; recovery re-materializes the files |
| Bounds | `rejectedSubmissionsPerTurn`, then `invalid-submission`; one retry of the invocation itself under `sessionReconstructionsPerWork` |
| Invalid inputs | An owner absent from the refreshed architect view, a duplicate capability slug, a `PlanRef` outside the captured plan |
| Proves completion | `analysis-accepted`, one event committing every record of the phase |

Revision 1 of every hypothesis is never rewritten. No harness code reads a
hypothesis to create work, an obligation or a completion requirement.

### SM3 — A global placement request

| | |
| --- | --- |
| States | `requested`, `view-refreshed`, `forking`, `returned`, `accepted`, `appended`, `delivered`, `exhausted` |
| Records | `PlacementRequest`, `PlacementDecision`, `RegistryEntry` revisions, `Hypothesis` revisions; `GlobalContext` is a projection, never a record |
| Idempotency | `RequestId` from the count of committed requests; `DecisionId` = `gd-<request>`; the parent append is keyed by `DecisionId` and is a no-op when the session already holds that key |
| Bounds | `forkRetriesPerRequest`; a `partial` return counts one retry |
| Stale inputs | If the view identity changes between `view-refreshed` and `decision-accepted`, the fork's evidence is revalidated and the affected investigation repeats; two revisions are never combined |
| May start an agent | `view-refreshed` licenses exactly one fork. Requests run one at a time |
| Proves completion | `decision-delivered` |

| Crash after | Recovery |
| --- | --- |
| `placement-requested` | Refresh the view again and start a fork |
| Before `decision-accepted` | The fork's answer was never recorded. The invocation is interrupted and a new fork starts; the cost is one repeated fork |
| `decision-accepted` written, files missing | Re-materialize the decision, registry entries and hypothesis revisions from the line |
| `decision-accepted` | The decision is pending; append its brief keyed by its ID, or rebuild the parent, which clears pending |
| `brief-appended` | Append `decision-delivered` |
| Parent session lost | `global-context-rebuilt` raises the generation; the next fork is oriented from hypotheses, registry and decisions |

### SM4 — A module work item

| | |
| --- | --- |
| States | `todo`, `planning`, `iterating`, `yielded`, `gating`, `completed`, `failed` |
| Records | `WorkItem` (once), `WorkItemOutline` revisions, `IterationAssignment`/`IterationResult`, a work-item `GateAttempt` |
| Idempotency | `WorkItemId` from the count of committed work items; `work-item-started` is appended once per item |
| Bounds | `maxIterationsPerWorkItem`, `repairRoundsPerWorkItemGate` |
| Stale inputs | A delivered hypothesis revision or decision arrives at the next coordination point and never rewrites an active assignment |
| May start an agent | `work-item-started` and `iteration-closed` license the local architect |
| Proves completion | `work-item-completed`, which requires a passing `work-item` gate and no open `ConsumerRequirement` of this item |

The local architect's submissions are the proposal's `LocalArchitectSubmission`
union. `yield-for-providers` appends `work-item-yielded` with the requirements
waited for; `work-item-resumed` returns when every one is verified.

### SM5 — An iteration

| | |
| --- | --- |
| States | `assigned`, `implementing`, `proposed`, `gating`, `repairing`, `accepted`, `partial`, `unsuitable`, `exhausted`, `superseded` |
| Records | `IterationAssignment` with its captured `WriteScope`, `TestSelection` and guarded hashes; `IterationResult`; `GateAttempt`s |
| Idempotency | `IterationId` = `<work-item>.i<nn>` from the count of committed assignments; `writer-acquired` carries the scope revision |
| Bounds | `repairRoundsPerIteration`, `budgetReturnsPerIteration`, `sessionReconstructionsPerWork`. A fresh session never resets them |
| Invalid inputs | A scope that names a module absent from the view; an `expose` path outside the assignment; a `TestSelection` that resolves to nothing where tests are required |
| May start a writer | `writer-acquired`, appended before `startSession` |
| Proves completion | `iteration-closed` with `outcome: 'accepted'` and the passing `GateAttemptId` |

`gate` and `TestSelection` are derived by the policy from `kind` and `scope`.
No submission carries them, so an agent cannot narrow the selection.

### SM6 — Contract delegation and a provider obligation

| | |
| --- | --- |
| States | `requested`, `establishing`, `established`, `registered`, `provider-pending`, `provider-conformed`, `verifying`, `verified`, `revision-needed`, `incomplete` |
| Records | a `contract` `IterationAssignment` with `requestedBy`; `ContractRecord`; `ProviderObligation`; `ConsumerRequirement` |
| Idempotency | `ObligationId` = `ob-<contract-id>`; registration keyed by `(obligation, revision)` and by `requirement`. A registration already in the log is not appended again |
| Bounds | The requesting work item's limits. A `provider-cannot-conform` return is one `revision-needed` per contract revision |
| Stale inputs | A new `ContractRecord` revision leaves the obligation and every requirement on it open; a completion naming an earlier revision does not satisfy it |
| May start an agent | `contract-requested` licenses the contract engineer; `work-item-started` for the provider work item |
| Proves completion | `requirement-verified`, the only event that closes a delegation. It requires a passing gate **and** that no `fakeInjections` location still references the fake |

Scheduling is depth-first. A consumer finishes what it can against the fake and
yields at an iteration boundary; the harness runs the provider work items of its
open requirements before the next independent entry work item, then returns the
consumer for verification. A shared obligation is one obligation with several
requirements: its provider work item runs once and each consumer verifies on its
own. A cycle is a cycle of **capabilities**, never of modules or changes: the graph's
nodes are capabilities, and a requirement adds the edge from the capability its
consumer is implementing to the capability of its obligation. Change 1 in module
A needing change 2 in module B needing change 3 in module A is three
capabilities and three work items, which complete in the order 3, 2, 1; a
provider obligation always starts a work item of its own, even in a module that
has one yielded. The harness checks the graph when it commits a requirement, and
a capability that transitively depends on itself appends `dependency-cycle-detected`, returns to the local architect of the
work item that closed it, and is a notice the person sees. The run fails with
`dependency-cycle` only when the same cycle recurs or `cycleReplansPerWorkItem`
is spent.

### SM7 — A gate, its repair and infrastructure recovery

| | |
| --- | --- |
| States | `verifying-commands`, `running`, `passed`, `failed`, `not-verified`, `repairing`, `recovering`, `exhausted` |
| Records | `GateAttempt` per attempt, append-only; `InfrastructureRecovery`; `ReadinessAttempt` for the readiness checkpoint |
| Idempotency | `GateAttemptId` from the count of committed attempts. There is no stored verdict: the verdict for a subject is that of its latest attempt, and nothing invalidates it |
| Bounds | `repairRoundsPerIteration`, `repairRoundsPerWorkItemGate`, `infrastructureRetriesPerGate`, `readinessRecoveries` |
| Invalid inputs | An unauthorized guarded change, a missing command, an empty required selection. None of them is ever `passed` |
| May start an agent | `gate-attempted` with `next: 'repair'` licenses the engineer; with `next: 'return-to-local-architect'` licenses the local architect |
| Proves completion | `gate-attempted` with `verdict: 'passed'` as the subject's latest attempt, followed by the harness's commit |

Every checkpoint verifies every command and selection before it runs the first.
A checkpoint that cannot run what it requires records `not-verified` with its
reason and runs nothing. `cause` derives from `runnerError`, the timeout and the
exit codes, never from output text.

| Cause | Next action |
| --- | --- |
| `in-scope` | Concise diagnostics to the engineer; one repair round |
| `infrastructure` | `InfrastructureRecovery`, bounded, no code-repair assignment |
| `timeout` | `not-verified`; one infrastructure retry, then exhausted |
| `invalid-session` | Settle the writer, reconstruct the session from records, preserve the counters |
| `outside-assignment`, `guarded-change` | Return to the local architect for a scoped assignment or a recorded revision |
| `unknown` | Stays explicit; never treated as an assertion failure |

### SM8 — Context budget and compaction

| | |
| --- | --- |
| States | `working`, `reporting`, `returned(context-budget-reached)`, `compacted` |
| Records | `InvocationOutcome.budget`; `context` and `compaction` observations |
| Idempotency | One budget return per invocation; the counter is keyed by the work, not the session |
| Bounds | `budgetReturnsPerIteration`, `forkRetriesPerRequest` for a fork |
| May start an agent | The successor invocation, from files and the concise handoff |
| Proves nothing | A budget return is never a completion, and a contract session that returns incomplete registers nothing |

The harness checks the estimated current context after each model or tool
boundary and reserves `reportReserveTokens` for one final response with tools
disabled. Compaction is port policy, never prompt text.

### SM9 — Writer ownership

| | |
| --- | --- |
| States | `free`, `held`, `settling`, `settled`, `unsettled` |
| Records | `writer-acquired`, `writer-released` with `confirmed`; `InvocationOutcome.settled` |
| Idempotency | One writer at a time, enforced by the run's `Mutex` and by the log: a second `writer-acquired` without an intervening release is `internal` |
| Bounds | `writerSettleMs`, `stopSettleMs` |
| Rule | Settlement is the harness's own observation: the session idle and its registered process groups killed and gone. Neither `stop()` resolving nor an agent's statement is evidence. A write that still arrives late cannot touch an accepted commit; it shows as an uncommitted change and joins the next commit |
| Effect of `unsettled` | `writer-released` with `confirmed: false` blocks every writer and every gate. The run fails with `writer-unsettled` after the bound |

### SM10 — Stop, restart and supersession

| | |
| --- | --- |
| States | `running`, `stop-requested`, `stopped`, `interrupted`, `superseded` |
| Idempotency | `stop-job` by `commandId`; a repeat returns the original receipt |
| Rule | `invocation-started` and `writer-acquired` are appended **before** `startSession`, so a stop arriving in between applies to a known invocation |
| Supersession | `InvocationOutcome.disposition: 'superseded'` retains the result for diagnosis and usage and never applies it. A superseded invocation cannot complete its work |
| Restart | Any run without a terminal event is `interrupted` on load. Recovery replays the log, re-materializes every record file, and performs again each external effect whose intent has no completion. An engineer interrupted mid-edit leaves a dirty tree; its successor starts from it, and `git diff` shows it the interrupted work |
| A change to the working directory | Blocks nothing and invalidates nothing. A gate runs the checks in the working directory and, on a pass, the harness commits; a later change is content for the next commit |

## RunPolicy

The policy is captured in `job.json`, not configurable at runtime, so an
exhaustion is reproducible. `version: 'run-policy/1'`.

| Limit | Value | Reason |
| --- | ---: | --- |
| `repairRoundsPerIteration` | 3 | Three failed repairs of the same iteration is evidence about the assignment, not the code |
| `repairRoundsPerWorkItemGate` | 3 | Same, at the work-item gate |
| `infrastructureRetriesPerGate` | 2 | Enough for a daemon restart and one rerun |
| `forkRetriesPerRequest` | 2 | A partial return counts one |
| `budgetReturnsPerIteration` | 3 | Repeated returns are the decomposition signal the KPIs measure |
| `sessionReconstructionsPerWork` | 2 | |
| `cycleReplansPerWorkItem` | 1 | A cycle returns once to the local architect; the same cycle again fails the run |
| `rejectedSubmissionsPerTurn` | 3 | Plan 1 bounded corrections at two and a real model exhausted it once before the prompt fix; the fix stays and one more attempt is allowed |
| `rejectedToolInputsPerTurn` | 3 | Same rule for a harness tool |
| `readinessRecoveries` | 2 | |
| `stopSettleMs` | 30,000 | |
| `writerSettleMs` | 30,000 | |
| `invocationIdleMs` | 300,000 | No port event for five minutes ends the invocation as `failed`/`idle-timeout` |
| `invocationAbsoluteMs` | 3,600,000 | |
| `maxIterationsPerWorkItem` | 12 | |
| `maxWorkItems` | 64 | |
| `maxPlacementRequests` | 32 | |
| `maxInvocationsPerRun` | 400 | |
| `runAbsoluteMs` | 28,800,000 | Eight hours |

Exceeding any of the last five fails the run with `limit-exceeded` and the
counter as evidence.

### Context thresholds

The values are a policy, not a measurement; iteration 12 measures them. pi
reports `contextWindow` whenever a model is selected, and the threshold is the
stated fraction of it; the absolute value applies only when no window is
reported.

| Role | Compaction | Threshold | Fraction | Report reserve |
| --- | --- | ---: | ---: | ---: |
| `initial-architect` | allowed | 150,000 | 0.75 | 16,000 |
| `local-architect` | allowed | 150,000 | 0.75 | 16,000 |
| `global-fork` | forbidden | 120,000 | 0.60 | 16,000 |
| `engineer` | forbidden | 140,000 | 0.70 | 12,000 |
| `contract-engineer` | forbidden | 140,000 | 0.70 | 12,000 |

The long-lived global parent has no per-invocation policy: briefs append without
inference, and any reorientation or compaction happens under the next
`global-fork`. That is the one `Role` gap in the proposal's
`context: Record<Role, ...>`; this plan fills it by recording parent maintenance
against the fork that performed it.

**The context size is always an estimate, and unknown is never room.**
Iteration 0 found that pi's `getContextUsage().tokens` is itself an estimate
from the last assistant usage, which charges cached context, because that is
what occupies the window. The harness therefore computes no estimate of its
own. An observation is `{ tokens: n, window: w }`, or `{ tokens: null, window:
w }` when the implementation cannot size the context, which pi reports after a
compaction until the next assistant reply. With `tokens: null` the harness
records the gap and the role's threshold cannot fire; substituting a figure
there would charge a role for context it no longer holds and fire its budget
just after a compaction freed room. Across a compaction the sizes come from the
`compaction` event. With no observation at all, the gap is a `coverage-gap` of
kind `context-unavailable`.

### Commands

The MVP supports one test runner, Vitest, reached through the target project's
own npm scripts. `env` is built by the harness and never passed on from its own
process; `NODE_OPTIONS` is stripped.

| Command | argv | Where |
| --- | --- | --- |
| `typeCheck` | `npm run type-check` | project root |
| `allTests` | `npm test` | project root |
| scoped tests | `node_modules/.bin/vitest run <resolved files>` | project root |
| `ramifyCheck` | `ramify check --batch --root <project> --format json` | project root |
| `ramifyChanged` | `ramify check --changed <path>... --format json --deadline 2000` | the file's directory |
| nested package | `npm ci` then its `test` script | the nested directory |

Timeouts: `typeCheck` 300 s, `allTests` 900 s, scoped tests 600 s,
`ramifyCheck` 600 s, `ramifyChanged` `hookTimeoutMs` 5,000 ms. A
`ramifyChanged` exit of 2 is `not-checked` with the CLI's reason; it permits
continued editing and is never a pass. A named configuration file is answered at
once as not checked, so the harness runs a complete check instead of claiming
hook coverage.

**Nested-package discovery.** At readiness the harness walks the project root to
depth 4 for `package.json`, skipping `node_modules`, any directory carrying the
empty-selection `tsconfig.json` state marker, and the root manifest. For each it
verifies that `node_modules` exists and records the `test` script or its
absence. A nested package whose dependencies are missing is a readiness failure,
not a code-repair assignment. The `collection-review` fixture has none; the
fixtures of iteration 4 add one.

**Test discovery and selection.** `TestSelection.resolved` is the union of

1. each exact owner's test files beneath its `src/tests/`;
2. every descendant owner's test files for each included child subtree;
3. the ordinary `src/` of every separately declared testing module lying inside
   the selection;
4. `extraSuites` from `evidenceObligations`;

filtered by the project's Vitest `include` patterns. Owner-to-directory mapping
comes from the architect view. Selection never shrinks to changed files and
never expands through an inferred impact graph. An empty selection where the
checkpoint requires tests is `not-verified` with reason `empty-selection`.

The `collection-review` fixture also has a Cucumber suite, `test:cucumber`,
which the MVP's one supported runner does not select. That is recorded as a
`coverage-gap` on every gate over that fixture, never as an absence of tests.

## Agent port additions

**Resolved by iteration 0.** The port contract is section 3 of the
[iteration 0 results](iterations/iteration0-results.md#3-the-port-contract-this-plan-should-implement),
verified against the pinned `@earendil-works/pi-coding-agent` 0.85.1 with real
pi sessions over the scripted provider: sixteen probes, twelve verified, four
verified with a limitation, none unavailable. Iteration 3 implements that
contract. It revises the proposal's sketch in four ways:

| Revision | Evidence | Consequence |
| --- | --- | --- |
| A `SessionRef` names a point in a session's history, not a session | pi forks only at a named entry, with `createBranchedSession(entryId)`; `AgentSessionRuntime.fork` replaces the current session and is the wrong tool | Every ref the port returns is pinned to the history as it stood; `appendContext` returns the ref after the append, and iteration 8 forks from it |
| `afterMutation` never sees a call the guard blocked | pi's `tool_result` hook fired for the write that succeeded and the write that failed, not for the two blocked ones; `tool_execution_end` fired for all four | The adapter emits `tool-finished` from `tool_execution_end`; the `guard` observation is the record of a blocked call |
| `tool-finished` gains `reachedTool: boolean` | pi validates tool input before the tool runs, so a call it rejects never reaches the harness | See [validated JSON](#every-agent-communication-is-validated-json) |
| `settled()` is the harness's, not pi's | `abort()` waits for an in-process tool, but a detached child wrote its file after the session reported idle | Settlement is pi idle, then the harness's registered process groups confirmed gone. With the `shell` tool of decision 12 this matters for every engineer |

Verified as the plan assumed: a session continues from its file, in one
process and across two; **a session resumes after a submission ended its turn**,
since `terminate` is a stop hint and not a close; a fork starts at the chosen
entry and leaves the parent untouched; an append causes zero model calls and
reaches the next fork's input; compaction can be forbidden per session and is
observable with its reason and sizes; one final response without tools is
obtained, sooner than documented; a denied `edit` or `write` mutates nothing
and the session continues; pi's own `bash` can be withheld.

`appendContext` has two routes and the wrong one fails silently:
`sendCustomMessage(..., { triggerTurn: false })` while the adapter holds the
live session, `appendCustomMessageEntry` when it does not. `appendCustomEntry`
reaches no model input and is never used for a brief.

Left provisional, for iteration 3's first real-model test: whether a real
provider accepts a `z.toJSONSchema` union discriminated on `kind`. Every probe
used the scripted provider, because no pi login was available.

Where the SDK cannot supply an observation, the implementation reports it
`unavailable` with a reason and the harness records a `coverage-gap`. The
scripted fake emits every port event, so the core's tests never depend on pi.
pi-specific session formats, SDK objects and login stay in `harness/agent/pi`.

## Prompt packages and submissions

One package per role, versioned and hashed into `PromptPackageManifest` at
`start-run`; `RunRecord.prompts` carries the hash, and every `Invocation`
records `{ package, hash, inputsHash }`. The rendered prompt is not stored: it
may contain file contents.

| Role | Package | Receives | Submits |
| --- | --- | --- | --- |
| `initial-architect` | `initial-architect/1` | The captured plan, the architect view, the module-architect skill, the analysis procedure | `InitialAnalysisSubmission` |
| `global-fork` | `global-fork/1` | Inherited parent context, the refreshed view, the `PlacementRequest`, the registry and decision log | `ForkSubmission` |
| `local-architect` | `local-architect/1` | The work item's goal and requirement refs, its acceptance refs with the instruction that tests stating them are part of the work, the module's onboarding and API view, relevant hypotheses with their rationales, delivered decisions, registered dependencies and evidence obligations | `LocalArchitectSubmission` |
| `engineer` | `engineer/1` | The `IterationAssignment`: goal, approach, write scope, requirement refs, external capabilities, completion evidence, evidence obligations | `EngineerSubmission` |
| `contract-engineer` | `engineer/1` plus `contract-skill/1` | The contract assignment with its consumer, contract, conformance and fake locations, and read access to the provider | `ContractSubmission` |

`submissionKinds` in the manifest names the union members the package offers.
A member a prompt package does not offer is not merely unused: the role never
sees it, so no run can produce it. That is how each iteration keeps the rule
that every value of every union has a producer and a test.

Provenance identity of a submission is `(InvocationId, package, hash,
inputsHash, submission hash)`, and the accepted submission is stored verbatim at
`invocations/<inv>/submission.json` before anything is derived from it.

## Write boundaries and observation

`edit` and `write` are intercepted before execution. The target is resolved
against the invocation's working directory, then `realpath` is taken of the
target, or of the existing parent of a new file, and the lexical containment
check from [reuse/resolve-contained-path.ts](reuse/resolve-contained-path.ts)
is applied against the recorded `WriteScope.resolved.roots` and `files`. A
target that cannot be resolved is blocked as `blocked-unresolved`, which is a
distinct verdict from `blocked-scope`.

A block returns a concise explanation naming the target and the scope and
directing the engineer to report the need or use the delegation mechanism. It
makes no mutation, does not end the session and does not widen scope. Only a
recorded assignment changes write authority.

Every guarded call is a `guard` observation with the proposal's fields; no
proposed file contents are stored. A replayed `(invocation, callId, type)` is
dropped, so replay counts once and a new retry counts again.

Read and search boundaries are soft: the assignment's scope, the generated views
and the module's onboarding are the default, an excursion is permitted and
recorded as an `excursion` observation on first entry to another module, and
compiler or test-runner reads are not excursions.

When a writer settles, `git status` gives the paths changed since the last
accepted commit. That is one `mutation` observation with `observedBy:
'snapshot'`, which is what makes an unguarded write visible without new
machinery, and it fills `InvocationOutcome.outsideScope`. Engineers have a
`shell` harness tool, by decision 12, whose writes only this observation sees. Shell
write enforcement, command allowlists and filesystem sandboxing are deferred;
zero blocked calls is never proof of scope compliance, and every evaluation
report states which tools were guarded.

## Hooks

Every source-writing invocation uses harness-installed Ramify hooks, through
pi's tool lifecycle rather than an instruction the agent must remember. The
adapter disables automatic extension discovery, so the harness installs the
integration explicitly, as the
[post-write example](../../../../examples/hooks/README.md) does for Claude Code.

After each settled mutation the harness runs `ramify check --changed <paths>
--format json` and records a `hook-check` observation with the paths, mode,
outcome, reason, newly introduced findings and log reference. New
findings, or an explicit not-checked reason, reach the engineer before its next
step. Mutations are observed even when the tool failed. Where the changed set
cannot be established, the harness records the gap and runs a complete check
instead of claiming hook coverage. Exit 2 is never a pass.

## Completion gates

Mechanical and hardcoded, as the architecture requires. Every checkpoint also
runs the configured type check and a complete Ramify check.

| Checkpoint | `TestSelection.policy` | Behavioral tests |
| --- | --- | --- |
| `readiness` | `all-project` | All project tests, plus each nested package's tests |
| `iteration` | `owned-by-scope` | All tests owned by modules in the assigned write scope |
| `contract` | `owned-by-scope` + `extraSuites` | Consumer-scope tests plus the contract, fake and conformance tests |
| `breaking-iteration` | `all-project` | All project tests |
| `work-item` | `all-project` | All project tests |
| `final` | `all-project` | All project tests |

The harness owns the verdict; a completion submission is provisional until the
gate passes. A gate runs its commands in the working directory while the one
writer is idle, and on a pass the harness commits on the run branch with the
summary of the checks in the message, as the proposal's
[run the checks, then commit](core-records.proposal.md#run-the-checks-then-commit)
defines. Nothing is compared or invalidated, so no change to the working
directory blocks anything. Running a gate is one function with one caller,
because a standalone commit-audit tool, extracted from cucumber-viz, will
replace its body later. Each attempt records its
command, working directory, input identity, timing, outputs and evidence
obligations. `guardedChanges` compares the captured guarded hashes with the
tree, with `after: null` for a deletion; an unauthorized change is `cause:
'guarded-change'` and returns to the local architect. Gate attempts are
append-only; a later pass supersedes a failure only for the inputs it verified.
There is no finding registry, adjudication, waiver or publication workflow.

## Protocol

The harness owns the public protocol. New file `src/interfaces/protocol/runs.ts`,
exposed to the parent with the `browser` tag and re-exposed by the root to its
descendants. Plan 1's retry, cursor and reconnect behavior is preserved
unchanged.

### Commands

`POST /api/v1/commands`, `202 { receipt }`, each with `commandId` and
`expectedVersion`. An identical retry returns the original receipt; a reused ID
with other content is `conflict`; a stale expected version is `stale-version`
with the current version; a second run while one is active is `busy`.

| Command | Payload |
| --- | --- |
| `start-run` | `{ planId, agent: 'pi' \| 'scripted' }` |
| `stop-job` | unchanged from Plan 1 |

No command carries anything the harness will execute.

**No separate acceptance check in the MVP.** Decided by Dan, 2026-09-20. The
final gate is all project tests, the type check and a complete Ramify check. A
feature's acceptance conditions are requirements of its entry work item, whose
local architect is told that tests stating them are part of the work; those
tests then run in every later all-project gate. Whether the feature is what the
person asked for is the person's review after the run. This departs from the
brief's "original feature acceptance" at the final gate, and the departure is
recorded in the completion report. An executable acceptance check, as a file of
the target project beside its plan, is [deferred](#deferred-work).

### Queries

| Method and path | Answer | Limit |
| --- | --- | --- |
| `GET /plans/:id/runs` | `RunListResponse`: run entries, newest first | 200 |
| `GET /plans/:id/runs/:run` | `RunResponse`: `RunSnapshot` | — |
| `GET /plans/:id/runs/:run/events?after=<n>` | `RunEventPage`: projected events, `cursor`, `more` | 500 |
| `GET /plans/:id/runs/:run/analysis` | Entry assignments and hypotheses, each with `standing` and revision | 500 |
| `GET /plans/:id/runs/:run/decisions` | The decision list projection: placement decisions plus scope, breaking and contract choices read from the records that hold them | 500 |
| `GET /plans/:id/runs/:run/work-items` | Work-item summaries with current iteration, waits and counts | 200 |
| `GET /plans/:id/runs/:run/work-items/:wi` | Outline revisions, iterations, results, gates, requirements | — |
| `GET /plans/:id/runs/:run/capabilities` | `CapabilityProgress[]` | 500 |
| `GET /plans/:id/runs/:run/gates/:ga` | One `GateAttempt` projection with bounded output tails | tail 8 KiB |
| `GET /plans/:id/runs/:run/metrics` | `Metric[]` with `policyVersion` and coverage | — |

A query never appends an event. Every projection is a pure function of the logs
and the records. Durable records stay private: the web receives only what
`src/interfaces/protocol/runs.ts` exposes.

### Error codes

Plan 1's nine are kept: `invalid-request`, `not-found`, `unreadable`,
`conflict`, `stale-version`, `busy`, `unavailable`, `inputs-changed`,
`internal`. Plan 3 adds `unsupported-version`, returned when a record's schema
version is not supported. That is a failure with evidence, never an absent
record.

### Web MVP

One Run page beside the existing Plans and Plan pages, replacing the Map page, with a simple list and
detail presentation. No graph.

| Area | Shows |
| --- | --- |
| Overview | **Notices first:** every module created or removed, with the decision that proposed it or the statement that none did; every detected dependency cycle, with its members and whether the re-plan resolved it, kept after the run ends. Then phase, run state, current work item, iteration and role, waits, counts, terminal failure with its evidence references. Connection state is shown separately from run state |
| Plan and entries | The captured plan and the entry assignments with their owners |
| Hypotheses and decisions | Hypotheses with `standing` and revision, beside accepted decisions, visibly distinct and linked |
| Work items | List and detail: outline revisions, iterations, scopes, results, dependencies and waits |
| Checks | Gate attempts with checkpoint, verdict, cause, commands, selections and bounded output tails |
| Progress | `CapabilityProgress`: todo, working on, completed, each with its reason and evidence |
| Measurements | `Metric[]` with state, coverage, numerator and denominator |

Start and Stop are the only commands. Reloading, disconnecting or closing the
page does not affect the run.

## KPI storage and projection versioning

The [KPI contract](../../measurements-and-kpis.md) was written for superseded
plans. It is reconciled here rather than rewritten; this plan does not edit it.

| KPI document term | Plan 3 record |
| --- | --- |
| attempt | `Invocation` |
| brief | `IterationAssignment`, or `PlacementRequest` for a fork |
| pi session | `Invocation.session.ref`; distinct sessions are distinct refs. A resumed session keeps its ref; a fresh one has a new ref |
| baseline `B` | `RunRecord.baseline`, frozen from the first `MeasurementSnapshot` |
| pre-attempt snapshot | `Invocation.scope.measurement` |
| metric policy version | `MeasurementSnapshot.policy` = `scope-size/1` |
| KPI projection version | `Metric.policyVersion` = `kpi/1`, versioned separately from the measurement policy |

Its producer dependency is satisfied: `ramify measure` exists in the installed
CLI and prints `ramify.measure/1` with `--format json`. The harness stores the
document once per snapshot and stores references elsewhere.

**Captured from the first implementation invocation**, not added after the
trial: the frozen baseline, each invocation's scope measurement and `S_s`
components, role and session identity, usage by category, timing, outcome,
mutation and `LineEventSummary`, compactions, budget returns, gate attempts,
adaptation causes, guarded-call verdicts and observation coverage.

MVP metrics, all with `state`, `value`, `numerator`, `denominator`, `coverage`
and `evidence`:

| Metric | Definition |
| --- | --- |
| `scope-bytes-per-changed-line` | `sum(w_e * S_e) / sum(w_e)` over attributable line events |
| `scope-size-ratio` | the above divided by frozen `B` |
| `reduction-factor` | `1 / scope-size-ratio`, only when defined and positive |
| `session-count` | Distinct session refs, including failed, stopped, repaired, context-limited and no-change sessions |
| `session-weighted-total` | `sum(S_s / B)` over included sessions, a continued session counting each component once at its largest observed value |
| `adaptation-session-share` | Sessions caused by a recorded adaptation over all sessions. An adaptation cause is an `unsuitable` outcome, a decision that `revises` another, a contract revision or an `evidence-reopened` event |
| `adaptation-usage-share` | Usage of those sessions over the total, by compatible category |
| `compactions-by-role` | `compaction` observations per role |
| `budget-return-rate` | Invocations ending `context-budget-reached` over invocations, by role |
| `repeated-budget-returns` | Budget returns beyond the first for one work item or placement request |
| `gate-attempts-per-accepted-iteration` | `GateAttempt`s over accepted `IterationResult`s |
| `blocked-write-attempts` | `guard` verdicts other than `allowed`, by role, tool and reason, beside the total guarded calls |
| `observation-coverage` | `coverage-gap` observations by kind, beside the totals they qualify |

Input, cache-read, cache-write and output tokens stay separate. A missing
observation yields `unavailable`, never zero, and an unqualified whole-run ratio
is refused when coverage is partial. Owner, seam and reuse drift are
[deferred](#deferred-work); the initial and final architect views and the
initial entry assignments are retained so they can be computed later.

## Fixtures and trials

`fixtures/collection-review` is the target project: a Vitest project with 15
modules, a `type-check` script and two plans. It is copied to a temporary
directory before every run, as Plan 1's tests already do.

| Fixture plan | State | Exercises |
| --- | --- | --- |
| `plans/review-notes/plan.md` | exists | The non-breaking delegation trial. The consumer is `workspace/reviews` (its tRPC router and MCP surface); note storage belongs in `reviews/core`; the review panel in `reviews/ui` renders it. One contract, one fake, one obligation, one verification on return |
| `plans/revision-diff/plan.md` | exists | Cross-branch placement. `reviews` needs a comparison that `catalog/core` owns and that it receives only as the shell re-exposes it, so a global placement fork is required; the second request reuses the registry entry |
| `plans/status-badge-tone/plan.md` | **added by iteration 12** | One small work item completed in one iteration: a `tone` prop on `shared-ui`'s `StatusBadge`, with its own tests. No decomposition, recorded as `single-iteration` |
| `plans/reviewer-identity/plan.md` | **added by iteration 10** | The breaking path. `ReviewOutcome` in `reviews/core` gains a structured reviewer in place of a plain field; `reviews`' router and MCP surfaces and both review views must adapt. Compatible staging, then removal, with all project tests green at every accepted boundary |

Readiness fixtures, built by mutating a temporary copy: one with an added nested
package under `subs/workspace/subs/catalog/tools/`; one whose `test` script is
missing; one whose nested `node_modules` is absent; one with a pre-existing
failing test.

The live trial runs `review-notes` with a real pi session on a disposable copy,
as Plan 1's `npm run trial` already does for mapping. A person reviews the
resulting decisions, work, checks and metrics afterwards. No review wait is
added to execution.

## Iterations

The order is derived from what each step must consume. The brief's candidate
structure is kept where it holds and split where an intermediate state would
otherwise be incoherent or an iteration would combine a broad change goal with a
broad search space.

Three departures from the candidate structure, each with its reason:

- **The spike stays a spike.** Iteration 0 writes no production code; the port
  additions it settles are implemented in iteration 3, after the evidence
  boundary of iteration 1 exists.
- **The check engine precedes the run.** Readiness and the final gate need a
  command executor, `not-verified` reasons and the git service, and so do every
  later checkpoint. Building them once, without run records, keeps iteration 4
  to wiring.
- **Write tools arrive with the iteration loop, the shell after it.** Decided by
  Dan, 2026-09-20. Iteration 6 gives engineers `edit` and `write` behind the
  guard, so repair is real repair, an accepted iteration is a real commit, and
  the rule that a guard must be called is testable from the guard's first day.
  Iteration 7 adds the `shell` tool, mutation observation and hook checks.

| # | Brief | Delivers | Exit evidence |
| ---: | --- | --- | --- |
| 0B | [The ledger](iterations/iteration0b.md) | `harness/ledger`: transactions, replay, materialization, external effects, and the file primitives moved into it, with fault-injection, torn-line and killed-process tests. Independent of the spike | Every fault point and every torn byte offset recovers to the last complete transaction; a killed writer process leaves a log that replays; the mapping job is unchanged |
| 0 | [Pi and session lifecycle spike](iterations/iteration0.md) | Throwaway probes of the pinned SDK against the behaviors above and the handling of invalid tool input; the re-run baseline | A results note stating, per behavior, verified, verified with a limitation, or unavailable, and the revisions this plan needs |
| 1 | [Extract `harness/evidence` and move jobs onto the ledger](iterations/iteration1.md) | `evidence` declared with its README and the listed exposures; the harness's `src/jobs/` writing only through the ledger; the record-commit adapter and its recovery | Behavior unchanged; the mapping job runs on the ledger; a crash before a transition's line leaves no trace and after it every file is re-materialized |
| 2 | [External commands and the check engine](iterations/iteration2.md) | The four lifted files placed and adjusted; `CheckCommand` verification and execution; `GateAttempt` shape, causes and `not-verified` reasons; the small git service | A command leaving a descendant is settled by its process group; a missing command and an empty selection each record `not-verified` and run nothing |
| 3 | [Agent port additions and the pi adapter](iterations/iteration3.md) | Session modes, `appendContext`, guard and after-mutation hooks, context and compaction events, `edit`/`write` built-ins, `settled()`, the new outcomes; scripted-fake parity; the pi implementation | Every new port behavior has scripted-fake coverage and a pi test against the offline scripted provider; each unavailable behavior is reported with a reason |
| 4 | [The implementation run](iterations/iteration4.md) | `RunRecord`, `RunPolicy`, the run layout and log, invocations and the observation log, writer ownership and settlement, `start-run`/`stop-job`, readiness, the final gate, the measurement baseline | A run with no entry capabilities completes with no client connected; a readiness failure ends the run with evidence; a restart after each durable boundary recovers |
| 5 | [Initial analysis and work-item coordination](iterations/iteration5.md) | The mapping job converted into the initial analysis, and the map, its protocol, its command and its web pages removed; Entry assignments, hypotheses, the registry, the work-item frontier, local architect sessions, outlines, `request-completion`, the work-item gate, progress projections | A run whose work items need no change completes; hypotheses create no work; compaction by an architect is recorded |
| 6 | [Iteration assignments, engineers and the iteration gate](iterations/iteration6.md) | `IterationAssignment`, `WriteScope` capture and resolution, engineer invocations with `edit` and `write` behind the write guard, path resolution, the commit after a passing gate, the `run_scope_tests` harness tool, the iteration gate with `owned-by-scope` selection, repair rounds, results, outline revision, context-budget returns | Exact-owner and included-subtree selections differ observably; a denied call through the real adapter mutates nothing for every writer role; a gate fails on a real defect, is repaired with `edit` and is followed by one commit; repair exhausts deterministically; a fresh session does not reset a counter |
| 7 | [The shell, mutations and hooks](iterations/iteration7.md) | The `shell` harness tool, mutation observation from `git status`, hook checks, writer settlement of late writes, coverage gaps | A shell command that leaves a descendant is settled by its group; a write through the shell outside the scope appears in `git status` and in `outsideScope`, reported and not blocked |
| 8 | [Global architect decisions](iterations/iteration8.md) | The long-lived parent, sequential forks, view refresh, requests, decisions, registry and hypothesis revisions, brief append, delivery, rebuild | Two sequential forks without a diff baseline; appending a brief causes zero model calls and reaches the next fork's input; a crash between decision and append recovers exactly once |
| 9 | [Contract delegation and provider obligations](iterations/iteration9.md) | Contract iterations, contract, obligation and requirement records, fake naming checks, depth-first provider scheduling, yield and resume, consumer verification, shared obligations, cycle detection, revision reopening | One consumer, one delegation, one provider, verification on return; duplicate registration is idempotent; a requirement whose fake is still injected is not verified |
| 10 | [Breaking work and gate integrity](iterations/iteration10.md) | The `breaking` iteration kind and its explicitly broad scope, all-project boundaries, guarded-change detection, rejection of narrowed discovery, `break-discovered` return | A breaking fixture feature is isolated into iterations that are green at every accepted boundary; an attempt to disable a required suite is rejected |
| 11 | [Protocol, web MVP and KPI projections](iterations/iteration11.md) | `interfaces/protocol/runs.ts`, the commands, queries, event pages and error codes, the web Run page, the KPI projections | A reconnecting client reads the same state and events; no query appends an event; an unavailable metric is not reported as zero |
| 12 | [Integrated trials and the completion gate](iterations/iteration12.md) | The composed recovery suite, the small one-iteration fixture plan, the real pi non-breaking trial, the breaking trial, the human review record, the completion report | The acceptance matrix is satisfied end to end; the trial's decisions, work, checks and metrics are recorded for review |

Iterations 1, 2 and 3 own no acceptance case. They are the foundations the
later iterations consume, and their exit evidence is their own.

Each iteration leaves ramify-agent passing its type check, its tests and
`npm run check:self`, and leaves the fixture project unchanged outside the
temporary copies a test makes.

## Cross-cutting requirements

These apply to **every** iteration, not to one of them.

### Every agent communication is validated JSON

This is rule 10 of the proposal and section 0 of the
[MVP shortlist](../../cucumber-viz-lessons/mvp-shortlist.md#0-the-fundamental-lesson).
Every iteration that adds a submission union member or a harness tool must, in
the same iteration:

1. define one strict zod schema, from which both the JSON Schema handed to
   the agent's tool (`z.toJSONSchema`) and the validation are taken, so what
   the agent is told and what is enforced cannot differ. Unions discriminate
   on `kind`. The stored `submission.json` carries the
   `schema: 'ramify-agent.<name>/1'` literal; the agent does not supply it;
2. validate beyond the schema: references that must exist in committed state,
   owners that must exist in the refreshed view, paths that must lie in the
   scope, uniqueness of a proposed slug;
3. change nothing on failure;
4. return every error to the same session as the tool's error result, as JSON:
   `{ accepted: false, errors: [{ path, message, expected? }], remainingAttempts }`,
   all errors of the attempt at once, capped at 20 with the total stated, and a
   closing request to correct them and call the tool again;
5. record each rejection as a `rejection` observation with its errors;
6. end the invocation as `invalid-submission` at the bound;
7. add one test that breaks the schema and one that breaks a rule the schema
   cannot hold, each asserting that nothing changed, that every error carries
   its path, that a corrected input is accepted, and that the bound ends the
   invocation.

No submission or tool schema has a field for an ID the harness already knows.
Free text from an agent is never parsed for meaning. One shared function in
`harness` performs steps 3 to 6 for every submission and tool, so an iteration
supplies a schema and its rules and cannot omit the rest. Iteration 0 answered how pi
treats tool input.

**What iteration 0 found, and what follows.** pi validates tool input against
the declared schema before the tool runs, answers a failure itself with every
error and its path, and coerces: `{ suite: 7 }` reached a string-typed tool as
`{ suite: "7" }`. A call pi rejects never reaches the harness. Three rules
follow for every iteration:

- The adapter counts pi's own rejections and reports each as `tool-finished`
  with `reachedTool: false`; the harness records it as a `rejection` observation
  and counts it toward the same bound. No rejection escapes the count.
- The harness validates again whatever reaches it, with the same zod schema and
  its rules. A value pi coerced is judged as it arrived, so the harness never
  relies on pi's validation having happened.
- **Decided by Dan, 2026-09-20:** the submission tool keeps the permissive schema Plan 1 uses, so every submission
  reaches the harness and every error is the harness's own, and harness tools,
  whose inputs are small and flat, declare their real schema. Plan 1 measured the
  permissive schema's cost: a real model sent object and array fields as escaped
  JSON strings, which the adapter repairs. Showing the model the real submission
  schema is a measured decision for iteration 3's first real-model test, which
  also settles whether a provider accepts a union discriminated on `kind`.

### The guards the lessons require

Each row is a cucumber-viz error, its guard and the iteration and named test
that enforces it.
Sources: [shortlist section 3](../../cucumber-viz-lessons/mvp-shortlist.md#3-critical-errors-not-to-repeat)
and the proposal's "Tests the records require".

| Guard | Iteration | Test |
| --- | ---: | --- |
| Work is never marked complete before its last write | 4 | `harness/src/tests/run-closing-order.test.ts` |
| A transition already in the log is not appended again; a repeated external effect happens once | 1 | `harness/src/tests/commit.test.ts` |
| A reader returns valid, unsupported version or invalid, never an absent record | 1 | `harness/src/tests/record-reader.test.ts` |
| A crash before a transition's log line leaves no trace; after it, every file is re-materialized, without an agent call and without a duplicate | 1 | `harness/src/tests/commit-recovery.test.ts` |
| A projection never writes | 11 | `harness/src/tests/projections-pure.test.ts` |
| Adding a work item, an iteration or a repair leaves every completed one completed | 6 | `harness/src/tests/no-rewind.test.ts` |
| A change to the working directory blocks nothing: a gate that passes is followed by one commit, and a crash between them makes one commit | 6 | `harness/src/tests/accepted-commit.test.ts` |
| A check that did not run says why; an empty required selection never passes | 2 | `harness/src/tests/gate-not-verified.test.ts` |
| Cancellation is not settlement: the session idle, process groups killed and confirmed | 4 | `harness/src/tests/writer-settlement.test.ts` |
| A command leaving a descendant running is settled by its process group | 2 | `harness/subs/evidence/src/tests/run-command.test.ts` |
| A guard nothing calls: a denied call through the real adapter for every writer role | 6 | `harness/subs/agent/subs/pi/src/tests/guard-installed.test.ts` |
| A write the guard cannot see appears in `git status` when the writer settles and in `outsideScope` | 7 | `harness/src/tests/unguarded-write.test.ts` |
| Observations an adapter drops: usage, context and compaction are port events, `unavailable` with a reason otherwise | 3 | `harness/subs/agent/src/tests/port-observations.test.ts` |
| Compaction is port policy, never prompt text | 3 | `harness/subs/agent/subs/pi/src/tests/compaction-policy.test.ts` |
| Every value of every union is written and read back | each | Each iteration extends `harness/src/tests/union-values.test.ts`; iteration 12 asserts the union is complete |
| A stop between `invocation-started` and the session's start applies to that invocation | 4 | `harness/src/tests/stop-before-start.test.ts` |
| A requirement whose fake is still injected is not verified | 9 | `harness/src/tests/requirement-verification.test.ts` |
| No query appends an event | 11 | `harness/src/tests/projections-pure.test.ts` |

### Code lifted from cucumber-viz

The reference copies in [reuse/](reuse/README.md) are outside the compiler's
scope and outside every module. Each is placed, adjusted and tested in the
iteration named here. Each keeps its provenance comment. None of it enters the
Ramify toolkit.

| Copy | Iteration | Owner | Adjustments | Tests |
| --- | ---: | --- | --- | --- |
| [run-command-with-cleanup.sh](reuse/run-command-with-cleanup.sh) | 2 | `harness/evidence`, as a resource beside `run-command.ts` | None; verbatim with its header | A command that leaves a descendant; TERM during a run; a timeout |
| [exec-and-collect.ts](reuse/exec-and-collect.ts) | 2 | `harness/evidence`, inside `run-command.ts` | Tell a timeout from a failure using Node's `killed` and `signal`; write the complete output to a file and return `{ path, bytes, truncated, tail }`; surface a spawn failure's string `code` as `runnerError`; resolve the wrapper script from the module's own directory | Success, non-zero exit, spawn failure, timeout, abort, output cap |
| [clean-env.ts](reuse/clean-env.ts) | 2 | `harness/evidence`, inside `run-command.ts` | Becomes `cleanEnvironment`, the only builder of a child environment | `NODE_OPTIONS` is absent in the child |
| [resolve-contained-path.ts](reuse/resolve-contained-path.ts) | 6 | `harness`, in `src/guard/` | `realpath` the target, or the existing parent of a new file, before the lexical check; return `blocked-unresolved` distinctly | Existing file, new file, traversal, symlink, absolute path, unresolvable parent |

### Measurement capture

Every iteration that creates an observation captures it when it happens.
Iteration 4 freezes `B` and captures per-invocation snapshots; iteration 6
captures line events; iteration 7 captures mutation and guard observations;
iteration 11 only projects. No measurement is added after a trial.

### Documentation

Every iteration that declares a module writes its `README.md` with a first
top-level prose paragraph stating its purpose, and updates the READMEs of the
modules whose responsibility changed. Writing conventions: a module exposes a
symbol and the other side receives it; a module's internals; enforced, verified
or a rule.

## Acceptance matrix

Every case of the brief's
[required acceptance coverage](authoring-brief.md#required-acceptance-coverage)
has exactly one owning iteration and executable evidence. Iteration 12 is the
final composition gate over all of them.

Two of the brief's bullets cover two disjoint recovery families each and are
split into two cases so that each has one owner; that is noted below.

### Core lifecycle and recovery

| # | Case | Owner | Executable evidence |
| --- | --- | ---: | --- |
| C1 | A run completes with no web client; a reconnecting client reads the same state and events | 11 | A run driven to completion while the file system alone is watched, then a client attached afterwards reads the same `RunSnapshot` and the same event page |
| C2 | Restart after every durable multi-write boundary recovers with no duplicate work, obligation, decision or brief | 4 | A test per boundary of the run log, forcing a restart after each write and comparing the recovered state; later iterations extend the same table with their own boundaries |
| C3 | Stop is bounded; late tool writes settle before a new writer or check; a late result cannot complete superseded work | 7 | A scripted tool that writes after cancellation: the next writer and the next gate both wait for a confirmed settlement, and the superseded `InvocationOutcome` is retained with `disposition: 'superseded'` |
| C4 | A crash after passing checks recovers the accepted result; a later source change invalidates stale evidence | 6 | A restart between `gate-attempted` and `iteration-closed` recovers the acceptance and makes the one commit. By Dan's decision of 2026-09-20 a later source change invalidates nothing: it is uncommitted work for the next gate, and the accepted commit stays as it is |
| C5 | Command retry, conflict and stale-version rules hold for implementation commands | 4 | `start-run` retried identically returns its receipt; a reused ID with other content conflicts; a stale expected version is rejected with the current version |

### Global and local architecture

| # | Case | Owner | Executable evidence |
| --- | --- | ---: | --- |
| G1 | Initial analysis produces executable entry assignments and separate deeper hypotheses; hypotheses create no work | 5 | A submission with entries and hypotheses commits both; the work-item frontier contains exactly one work item per entry capability, and no hypothesis appears in any work item, obligation or completion requirement |
| G2 | Two sequential placement forks run without a diff baseline; the first revises a hypothesis and registers a capability, the second inherits its brief and reuses the entry | 8 | Two scripted forks on the `revision-diff` fixture; the second's `PlacementDecision` has `outcome: 'reuse'` and names the existing `RegistryEntry` |
| G3 | Appending a parent brief causes zero model calls and reaches the next fork's input | 8 | The scripted agent counts model calls across the append; the next fork's rendered input contains the brief text |
| G4 | A crash between an accepted decision and the parent append recovers exactly once | 8 | Restart after `decision-accepted`: the append is keyed by `DecisionId`, the port answers `already-present` on the repeat, and exactly one `brief-appended` exists |
| G5 | A local architect uses an external-owner hypothesis as evidence, makes routine local refinements without a global call, and escalates real counterevidence | 8 | Three scripted local architects over one hypothesis: one refines locally with no `placement-requested`, one escalates, and the recorded local decision is visible without a parent append |
| G6 | A later fork finds a locally registered unimplemented capability without a parent brief | 8 | A local decision registers a capability; a later fork's input contains no brief for it and its decision reuses the registry entry |
| G7 | A relevant hypothesis revision reaches affected local architects before dependent work is assigned | 8 | `hypotheses-delivered` precedes the next `iteration-assigned` of every work item whose `involvedModules` match |
| G8 | One small work item completes in one iteration; another is revised across several without losing obligations | 6 | Two work items: one outline with `decomposition: 'single-iteration'` and one accepted iteration; one with three outline revisions whose open requirements survive every revision |

### Contract and provider flow

| # | Case | Owner | Executable evidence |
| --- | --- | ---: | --- |
| P1 | One consumer performs one real delegation, works against a named fake, registers the provider once, implements it and verifies on return | 9 | The `review-notes` fixture driven by the scripted agent: `contract-registered`, one `ProviderObligation`, `provider-conformed`, `requirement-verified` |
| P2 | Fake files, exports and re-exports remain unmistakable, and architectural evidence does not present them as production behavior | 9 | The contract gate rejects a fake file without `.fake`, an exported fake without `Fake`, and a re-export that drops the designation; the architect view of the accepted state shows the fake under its fake name |
| P3 | Duplicate obligation registration is idempotent; a changed contract revision reopens implementation and conformance evidence | 9 | A repeated registration appends no second line; a new `ContractRecord` revision leaves the obligation and every requirement open |
| P4 | A provider that cannot implement the agreement reports a revision need rather than changing the contract | 9 | A `provider-cannot-conform` submission returns `revision-needed` to the consumer's local architect and leaves the `ContractRecord` untouched |
| P5 | Shared obligations and at least one cycle or unresolvable dependency reach a deterministic outcome | 9 | One obligation with two requirements runs its provider once and verifies each consumer separately; a module chain A, B, A over three capabilities completes with no notice; a constructed capability cycle appends `dependency-cycle-detected`, returns to the local architect and appears in `RunSnapshot.notices`; the same cycle detected again fails the run with `dependency-cycle` and the cycle as evidence |

### Checks, repair and breaking work

| # | Case | Owner | Executable evidence |
| --- | --- | ---: | --- |
| K1 | A module gate fails, returns concise diagnostics, is repaired and reruns the complete gate | 6 | A failing assertion in scope: `cause: 'in-scope'`, `next: 'repair'`, a second attempt at `repairRound: 1` running the full required set |
| K2 | A global work-item gate exposes a failure outside the last engineer's scope; the local architect assigns repair and rechecks | 6 | `cause: 'outside-assignment'`, `next: 'return-to-local-architect'`, a new assignment whose scope covers the failing owner, then a passing work-item gate |
| K3 | Exact-owner and included-child-subtree test selection are both exercised | 6 | Two assignments over `workspace/reviews`, one with no included children and one including `reviews/core`; their `TestSelection.resolved` lists differ by exactly the subtree's test files |
| K4 | Fake and real-provider conformance obligations are both enforced | 9 | The contract gate runs the conformance suite against the fake; the provider gate runs the same suite against the real provider; neither substitutes for the other |
| K5a | Missing nested dependencies, a missing command and a failing initial baseline retain distinct causes and recovery paths | 4 | Three readiness fixtures; each `ReadinessAttempt` names a different failing step, and only the recoverable one consumes a `readinessRecoveries` attempt |
| K5b | An invalid session, a test timeout and exhausted repair limits retain distinct causes and recovery paths | 6 | `invalid-session` reconstructs the session and preserves the counters; a timeout records `not-verified`/`timeout` and one infrastructure retry; exhaustion records `next: 'exhausted'` with the original cause preserved |
| K6 | Narrowing test discovery or disabling a required suite is rejected unless an accepted revision authorizes it | 10 | An engineer edit to the Vitest configuration is a `guarded-change` and the gate does not pass; the same edit under a recorded obligation revision is authorized |
| K7 | A breaking feature is isolated into coherent iterations and all project tests pass at every accepted boundary | 10 | The `reviewer-identity` fixture: an outline with `breakingChanges` and staged iterations, each accepted boundary carrying a passing `breaking-iteration` gate |

### Context and boundary controls

| # | Case | Owner | Executable evidence |
| --- | --- | ---: | --- |
| X1a | An engineer threshold returns partial evidence without compaction or false completion; repeated returns do not reset limits | 6 | `context-budget-reached` with the report, the threshold and the observed usage; no `compaction` observation for the role; the third return exhausts `budgetReturnsPerIteration` |
| X1b | A contract sub-session threshold returns incomplete and registers nothing | 9 | An `incomplete` contract submission commits no `ContractRecord` and no obligation |
| X1c | A decision fork threshold returns partial findings and no accepted decision | 8 | `fork-returned-partial`; no `decision-accepted`, no append, one retry within `forkRetriesPerRequest` |
| X2 | Initial, global and local compaction is observed and recorded when it happens | 5 | A scripted compaction during initial analysis and during a local architect session yields `compaction` observations with trigger, success and before/after where available |
| X3 | Allowed and denied `edit`/`write` targets cover existing files, new files, traversal, symlinks and explicit contract or exposure locations | 6 | One table-driven test per case, each asserting the verdict, the resolved target and the absence of a mutation |
| X4 | Denied tools do not mutate, return useful guidance and stay deduplicated across replay while a new retry is counted separately | 6 | A replayed `(invocation, callId)` appears once in the observation log; a fresh call to the same target appears again |
| X5 | A path-resolution failure differs from a proven scope violation | 6 | `blocked-unresolved` and `blocked-scope` are distinct verdicts with distinct reasons and distinct counts |
| X6 | One outside read and one unguarded shell mutation make the MVP's limits visible rather than reported as complete enforcement | 7 | An `excursion` observation for the read; a `coverage-gap` of kind `unguarded-shell` plus the `git status` difference when the writer settles, for the mutation; the evaluation projection states which tools were guarded |

### Progress, protocol and measurements

| # | Case | Owner | Executable evidence |
| --- | --- | ---: | --- |
| M1 | Hypothesis, decision, work and progress records remain visibly distinct | 5 | Distinct record kinds, distinct directories and distinct projections; a hypothesis has no reference to a work item and nothing references it but a decision and a local architect's input |
| M2 | Todo, working on and completed handle provider waits, verified reuse, reopened evidence and superseded hypotheses correctly | 11 | Four constructed states: a provider wait stays `working` with its reason; verified reuse is `completed`; `evidence-reopened` returns a completed capability to `working`; a superseded hypothesis leaves the list without becoming `completed` |
| M3 | The UI can disconnect and reconnect without affecting the run | 11 | A browser check against a run driven by the scripted agent: closing and reopening the page changes no event and no state |
| M4 | KPI projections retain their numerators, denominators, revision and coverage; unavailable data is not reported as zero | 11 | A metric with a missing size component reports `unavailable` with its known subtotal and coverage; `sum(w_e) = 0` reports `not-applicable` |
| M5 | Failed, stopped, repaired, context-limited and no-change sessions remain in usage and session counts | 6 | Five constructed invocations; `session-count` and `session-weighted-total` include all five, and the no-change session contributes no change weight |

### Real trials

| # | Case | Owner | Executable evidence |
| --- | --- | ---: | --- |
| T1 | The scripted fake supplies deterministic state, failure and recovery coverage | 12 | The composed suite runs every state machine's recovery table on the scripted agent with no pi and no network |
| T2 | At least one real pi end-to-end non-breaking feature with a consumer, delegation, provider and verification on return | 12 | The `review-notes` live trial on a disposable copy, with its run directory, decisions, gates and metrics retained |
| T3 | The breaking path on a controlled fixture with globally green iteration boundaries | 12 | The `reviewer-identity` trial, each accepted iteration carrying a passing all-project gate |
| T4 | Human review of the resulting decisions, work, checks and metrics is recorded, with no review wait in execution | 12 | A review sheet beside the trial, in the style of Plan 1's, with the agent's own observations kept apart from the reviewer's verdict |

## Decisions pending Dan's review

The proposal's twelve decisions. Each carries this plan's working assumption,
which is the proposal's position unless a contradiction was found, and the
iteration that would change if the review reverses it.

| # | Decision | Working assumption | Reversal changes |
| ---: | --- | --- | ---: |
| 1 | A run is a job, and the only kind of job | **Decided by Dan, 2026-09-20.** The run takes over Plan 1's job lifecycle: commands, receipts, expected versions, stop and interrupted recovery. With the mapping job converted there is one kind, so `job.json` needs no discriminator for two and `harness/jobs` is not extracted | — |
| 2 | Two logs: transitions in the run log, through the ledger; observations per invocation as plain append-only JSONL | **Decided by Dan, 2026-09-20.** It is what keeps the state authority small enough to reason about and keeps file contents out of the state record Observations use the ledger's `appendJsonLine` primitive and torn-line handling, with no transaction, no materialization and no flush per line; a crash may lose the last observations of an interrupted invocation, reported as a coverage gap | — |
| 3 | The run log is the transaction: one line carries a whole transition and record files are materialized copies | **Decided by Dan, 2026-09-20.** SQLite was considered and set aside. A dirty source tree after a crash is kept, and the next engineer starts from it | — |
| 4 | Every turn ends in a submission, including an engineer asking for a contract sub-session | **Decided by Dan, 2026-09-20, with decision 5.** Iteration 0's probe 2 verified it: after a submission returned `terminate: true`, `prompt()` is accepted and the session resumes with the submission and its result in its history. The fresh session from records is still built, for restart recovery | 3, 6, 9 |
| 5 | A contract sub-session is an iteration of kind `contract` | **Decided by Dan, 2026-09-20.** It gives the sub-session its own assignment, scope, gate and result, so a caller that dies discovers the outcome from records | — |
| 6 | One provider obligation per contract; consumers attach through `ConsumerRequirement` | **Decided by Dan, 2026-09-20.** A shared obligation then needs nothing further | — |
| 7 | A dependency cycle returns once to the local architect of the work item that closed it, and the person is told | **Decided by Dan, 2026-09-20.** `dependency-cycle-detected` carries the cycle; the architect re-plans with its ordinary submissions; the run fails only when the same cycle recurs. Every detected cycle is a notice in `RunSnapshot.notices`, shown on the Run page's overview during the run and after it, resolved or not | — |
| 8 | Only placement decisions are their own record; the decision list is a mechanical projection over named fields of validated records; a created module is always reported | **Decided by Dan, 2026-09-20:** the simplest thing. No second decision record and no extra citations. What the person must learn at the end is whether a module was created, which the harness reads from the tree: a `module.ramify` added by an accepted commit is a `module-created` notice, shown first on the Run page and listed in the commit message. See the proposal's [a created module is always reported](core-records.proposal.md#a-created-module-is-always-reported). Iteration 6 detects it, iteration 11 shows it | — |
| 9 | A gate runs the checks in the working directory and, on a pass, the harness commits on the run branch with the summary of the checks in the message | **Decided by Dan, 2026-09-20.** Nothing is compared or invalidated, so no change blocks anything. The commit audit becomes a standalone tool that ramify-agent integrates later; running a gate is one function so that the tool can replace its body. See the proposal's [run the checks, then commit](core-records.proposal.md#run-the-checks-then-commit). Iteration 2 builds the git service, iteration 4 the run branch and the clean-tree rule, iteration 6 the commit | — |
| 13 | The transaction mechanism is one independent, heavily tested service, `harness/ledger`, and every other part of the harness writes durable state only through it | **Decided by Dan, 2026-09-20.** Rule 11 of the proposal. [Iteration 0B](iterations/iteration0b.md) builds it; it needs nothing from the spike and can run beside it | — |
| 10 | One work item per entry capability, always | **Decided by Dan, 2026-09-20:** keep it simple. No grouping field, no validation of groups and no judgment. Two related capabilities in one module get two work items; grouping is a later addition once real plans show it matters | — |
| 11 | The mapping job is converted into the run's initial analysis, and the implementation map is removed | **Decided by Dan, 2026-09-20.** See [the mapping job becomes the initial analysis](#the-mapping-job-becomes-the-initial-analysis). Iteration 5 converts it and removes the map, its protocol and its pages | — |
| 12 | Engineers have a shell: a harness tool, `shell`, run through the lifted executor, while pi's own `bash` stays withheld | **Decided by Dan, 2026-09-20.** The spike's probe 14 verified that the built-in can be withheld, so the shell the agent gets is one the harness runs: its own process group, a clean environment, a timeout, a bounded tail, the command recorded. Its writes are unguarded; they appear in `git status`, in `outsideScope` and as the `unguarded-shell` coverage gap. `run_scope_tests` stays. Arrives in iteration 7; `edit` and `write` arrive in iteration 6 with the guard | — |

### Contradictions found in the inputs

| Where | Contradiction | This plan's resolution |
| --- | --- | --- |
| Proposal, `Hypothesis.change` and `PlacementDecision.outcome` | `change` offers `refactor`, which no decision outcome can confirm or reject, while the shortlist requires that every union value have a producer and a test | Resolved in the proposal on review: `refactor` is dropped from `Hypothesis.change`, and `create-by-extraction` pairs with the decision outcome `extract`. A refactor is not a placement |
| Proposal, `RunPolicy.context: Record<Role, ...>` | The long-lived global parent is not a `Role` value, so it has no context policy entry, yet the architecture gives it one | Resolved in the proposal on review: the parent has no per-invocation policy, and its maintenance is recorded against the `global-fork` that performed it. Stated in [Context thresholds](#context-thresholds) |
| Proposal, decision 9, as first written | "To verify before acceptance: which files Ramify's `input` covers" | Superseded by Dan's decision of 2026-09-20: the git tree of the working directory is the content identity, so what `input` covers no longer decides a gate's currency |
| KPI document, status note | It says its references need review against the harness architecture, and its Plan 2C producer was unbuilt | `ramify measure` exists in the installed CLI. The document is reconciled term by term in [KPIs](#kpi-storage-and-projection-versioning) and is not edited by this plan |
| Spike README, deeper placements | Its `contracts`, `contracts/map` and `contracts/protocol` observations describe the tree Plan 2 replaced | Only its two entry assignments are accepted. Its `harness/evidence` hypothesis is confirmed here with current measurement, and its `harness/jobs` hypothesis is revised: with the mapping job converted there is one job kind, so the job code stays in the harness, on the ledger; its "keep coordination in `harness`" hypothesis is confirmed; its contract hypothesis is already executed |

## Completion gate

1. The runnable outcome works end to end in a browser, with a real pi session,
   on the `review-notes` fixture plan: a run started, watched, completed, and
   its decisions, work, checks and progress read.
2. A run completes with no client connected, and a client attached afterwards
   reads the same state and events.
3. Every case of the [acceptance matrix](#acceptance-matrix) has passing
   executable evidence, and the composition suite of iteration 12 runs them
   together.
4. The target project's source is changed only within recorded write scopes;
   every change outside one is visible in `outsideScope` and in the evaluation
   projection.
5. ramify-agent passes `npm run type-check`, `npm test`, `npm run build:web`
   and `npm run check:self` from `ramify-agent/`.
6. The completion report records the trials, the measured module sizes after
   the plan, the boundaries that have since earned themselves, the limitations
   found, and the review sheet for the person's verdict.

## Deferred work

Deferred means not in this MVP and not evidence of completion.

- Letting a run stop after its initial analysis, so a person can read the
  hypotheses before anything is implemented.
- An executable feature-acceptance check, a file of the target project beside
  its plan, run at the final gate.
- The capability dependency graph visualization. Plan 3 retains stable
  capability IDs, consumer-to-dependency links, states and evidence so it can be
  rendered later.
- Human approval gates, review commands, approval-expiry rules and an
  awaiting-review state.
- Ramify architect-view diffs as an optimization for placement forks.
- Parallel implementation writers and parallel global placement requests.
- A configurable check workflow, a second test runner, and inferred
  impacted-test selection.
- cucumber-viz's finding registry, adjudication, waivers, commits and
  publication workflow.
- Filesystem sandboxing, shell-command allowlists, and any claim that every
  shell mutation is prevented.
- A general migration state machine for breaking changes.
- Remote or multi-project hosting and a new command-line client.
- Automatic module creation from a forecast capability.
- Owner, seam and reuse drift KPIs and the knowable-share assessment. The
  initial and final architect views and the initial entry assignments are
  retained so they can be computed later.
- Everything in the shortlist's
  [left for later](../../cucumber-viz-lessons/mvp-shortlist.md#left-for-later)
  list: a deferred-discovery record and its projection, per-requirement
  acceptance progress, mechanical assignment validation beyond owner and scope,
  evidence on an `unsuitable` outcome, failed-test identities read from the
  runner's report, focused reruns for a suspected flaky test, a cached
  projection with its applied sequence, a follow-up prompt for a session that
  ended without a submission, and device and inode revalidation in the write
  guard.
- Everything recorded in the other
  [cucumber-viz lesson documents](../../cucumber-viz-lessons/README.md) that
  the shortlist did not select.

## Explicit non-goals

The brief's non-goals, restated so they cannot be mistaken for oversights: no
human approval gate during execution; no graphical capability view; no
dependence on architect-view diffs; no parallel writers or parallel placement
requests; no general configurable check workflow or inferred impacted-test
selection; no finding registry, adjudication, waiver, commit or publication
workflow; no filesystem sandbox, command allowlist or claim that shell mutations
are prevented; no migration state machine; no remote or multi-project hosting
and no new CLI client; no automatic module creation from a forecast; and no
broad container module created only to hold loop-related files.

## Open risks

| Risk | Where it bites | What this plan does about it |
| --- | --- | --- |
| A real provider may reject a `z.toJSONSchema` union discriminated on `kind` | Every submission schema | Iteration 0 verified pi's side only, with the scripted provider. Iteration 3 tests it in its first real-model test and keeps the permissive submission schema until then |
| pi validates and coerces tool input before the harness sees it | Rule 10, the rejection counts | The adapter reports `tool-finished.reachedTool`; the harness validates again whatever reaches it. See [validated JSON](#every-agent-communication-is-validated-json) |
| The context size is unknown after a compaction | Every context-budget return of an architect role | `tokens: null` means unknown and the threshold cannot fire; the gap is recorded |
| The daemon stalls for about 125 s after a structural change | Every view refresh and hook check after a file is created | Plan 1's private-daemon workaround is inherited by `harness/evidence`, which restarts it before a capture. A stall is an infrastructure cause with bounded recovery, never a code-repair assignment |
| Breaking-change isolation may not keep every boundary green | Iteration 10 and the architecture's second open question | The fixture feature is small and staged; a failure is reported as a finding of the trial, not hidden |
| The fixture's Cucumber suite is outside the one supported runner | Every gate over the fixture | Recorded as a `coverage-gap` on each attempt |
| The target project must be a git repository with a clean tree | `start-run` on a project that is neither | Readiness refuses it with the step `git-clean`; the fixtures are initialized as repositories in their temporary copies |
| The harness's own source grows large even after two extractions | Maintainability after the plan | Iteration 12 measures exact and subtree sizes and names the boundaries that have earned themselves, for a follow-up plan |

## Status of execution

**Iteration 0 is complete; nothing else has run.** Its
[results](iterations/iteration0-results.md) hold the re-run baseline, sixteen
probe verdicts and the port contract, and its probes are under
`spikes/autonomous-loop/`. It wrote no production code. No source has been
changed by this plan, and nothing in it is evidence of an implemented
capability.

The one predecessor condition, Plan 2's completion gate, is satisfied as
recorded in [Predecessor evidence](#predecessor-evidence), and iteration 0 re-ran the complete
baseline: the type check, 21 test files with 160 tests, the browser build and
`check:self` all pass, with the same 5 owners, 73 source files, 776 accesses
and 0 findings.
