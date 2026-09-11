# Plan 5 scope and lifecycle decisions

**Status:** draft review package for [Plan 5](main-plan.md), prepared
2026-09-11. This document fixes the dependency model, the observation and
freshness rules, session hosting, the Plan 2 supersession, budgets and
deferrals in reviewable form. [contracts.md](contracts.md) owns the exact
signatures and wire schemas; [owners.md](owners.md) owns declarations and
placement. Plan 2's [scope decisions](../done/iteration-2-resident-verification/scope.md)
remain in force for deployment, endpoint discovery, startup and recovery,
idle exit, crash and explicit stop, context selection and compatibility,
IPC bounds and the large-report capacity amendment. Only the sections below
change or extend them.

## Dependency model

The retained session keeps facts per file and per access, each with the
observations and other facts it depended on. An update recomputes a fact when
one of its dependencies changed, compares the result by value, and continues
only along the edges the comparison reaches. Recomputing more than the minimum
is allowed; recomputing less is not.

### Export descriptions

A file's export description is its `FileExports` entry, the originals it
defines and the coverage notes located in it. It depends on:

| Dependency | Recorded as |
| --- | --- |
| The file's own content | its observed identity |
| Each file it re-exports from by name, star or namespace forwarding | `dependencies.files` |
| Each resource it describes or forwards | `dependencies.resources` and the shims that describe them |
| Each path its module resolution probed and found absent | `dependencies.absent` |
| The area map entry of every file above | the areas' identity |

Recomputation: the set starts with the changed, created and deleted owned
files and the files that depend on a deleted path or a created path matching
an absent probe. Each file in the set is described afresh from the new
snapshot; every file whose description depends on a file whose description
changed by value joins the set; the star, selection and incompleteness
propagation of today's `resolveExports` runs over the set until nothing
changes. Files outside the set keep their descriptions. `assembleCatalog`
over all descriptions equals `buildCatalog`; batch checks use the same
assembly.

### Access facts

A file's access facts depend on its own content, on the export descriptions
of every file its accesses target, on the resolution candidates it probed, and
on the areas. Re-interpretation covers the changed files, every file whose
target description changed by value, every file with a candidate matching a
created or deleted path, and every file on the broad path. Interpretation is
split: the syntactic pass with its checker round trips runs only for files
whose content changed; the selection lookup against descriptions runs for
every file in the set.

### Model and decisions

The model depends on every description document, every README-independent
area, the registry and every original's identity, kind, tags and declaration
evidence. It is rebuilt whole when any of these changed; whole-project
linking measured 20–26 ms on the reference and 1.0–1.1 s on S1000, which is
why the S500 and S1000 description budgets are advisory and a proportional
relink is deferred with its trigger below.

A decision depends on its access, its selected original, the importer area
and the exposures of the original. Decisions are recomputed for every
re-interpreted access; every access selecting an original whose identity,
kind, tags or declarations changed; and, when the model was rebuilt, every
access whose importer or original owner lies in the subtree of a module whose
exposures, areas or tags changed. A registry change decides everything.

### Paths of an update

| Path | Taken when | Compiler | Facts | Model | Decisions |
| --- | --- | --- | --- | --- | --- |
| `unchanged-surface` | Owned source changed and every changed file's description and access facts are equal by value ignoring positions | one update | the changed files | none | positions refreshed for accesses selecting moved originals |
| `source` | Owned source changed with a description or access change | one update | closure and importers as above | if originals changed | affected accesses |
| `description` | `module.ramify` changed inside existing areas | none | none | rebuilt | subtree of the changed modules |
| `metadata` | README changed only | none | purposes | none | none |
| `broad` | Created or deleted owned file, configuration, dependency, shim, discovery-relevant or unknown path, or an area change | `invalidateAll` or created and deleted files | all owned files | rebuilt | all |
| `cold` | First revision of a session | open | all | built | all |

A created or deleted owned file takes the broad path in this plan, as the
spike did; the resolution-bounded narrowing named in the proposal is a
deferral with its trigger below. The path is recorded in every revision's
checked set, and a hook's answer names it.

## Observation and freshness

### Observed inputs

The project observer records every input the analysis used: descriptions,
READMEs, owned sources and resources, configuration files, dependency reads,
directory listings and absence probes, with the same roles and identities as
Plan 1's capture. The retained compiler adapter reports every filesystem
callback to the observer's sink, so the compiler's reads are observed inputs
too. The observer's `inputId` is computed exactly as `readProject`'s over the
same inputs; probe P5-5 establishes that the two sets coincide before
iteration 5, and I5-04 and I5-05 assert it.

### Live updates and the covering rule

The watcher drives updates: batches are debounced by `debounceMs`, coalesced
per context and applied whether or not a client is connected. Revision
fingerprints are the six Plan 2 classes over the observed inputs.

A synchronized request names `expect` identities. The context manager
answers it from the published revision, with `reusedRevision: true` and no
analysis, when every named path has an observation in that revision whose
identity equals the expected one. Otherwise it flushes the debounce window,
adds the named paths to the change set, and the request is answered by the
next revision. A named path with no observation in the covering revision is
`unobserved-input`; an identity that differs from the observed one after the
update is `superseded`. Every acknowledged request still receives its own
outcome; coalescing never drops it.

### The sweep

`reobserve()` stats every observed path, hashes the ones whose signature
changed, and returns the changes as ordinary input changes. Contexts schedule
it every `sweepIntervalMs` while a context is hot or warm with activity,
immediately after a configuration, manifest or lockfile change, and after a
watcher overflow or error. A synchronized request arriving while a required
sweep has not completed waits for it and its answer records
`synchronization: 'reconciling'` at acknowledgment. The sweep replaces Plan
2's periodic `verify` capture.

### Deadlines and cold contexts

`CheckRequest.deadlineMs` bounds the wait. A cold context that cannot publish
inside it answers `cold` with the elapsed time and keeps warming; a warm
context whose update does not finish answers `deadline-exceeded` with the
sequence current at acknowledgment. The update itself always completes and
publishes. A `--changed` check exits 2 on either outcome and never runs a
batch analysis.

## Session hosting

The session runs in a worker thread that `analysis` starts from its own
entry file, with `resourceLimits.maxOldGenerationSizeMb` set from
`SessionLimits.workerHeapMiB`. The compiler server is a child of that thread's
process, one per session. Messages between the host and the worker are
frozen plain data: changes in, revisions and outcomes out; the report
projection is requested explicitly and crosses the boundary only then.

| Level | Retained | Transition |
| --- | --- | --- |
| Hot | worker, compiler server, facts, indexes, observer | demoted to warm when `maxHotContexts` is exceeded by a more recently used context, or after `warmIdleMs` without activity |
| Warm | worker, facts, indexes, observer; compiler released | next update rebuilds the compiler and takes the broad path; demoted to cold after `coldRetainMs` |
| Cold | revision history only | Plan 2's history limits and eviction |

Loss of the compiler server inside a hot session discards only the compiler;
the next update rebuilds it. Loss of the worker discards the session; the
context reopens with a new generation. Neither loss can publish stale facts.

## Batch and session comparison

For every comparison the harness materializes the same directory state and
compares the session's revision projection with `analyzeProject` over that
state after replacing `runId`: inventory, areas, catalog files, originals and
coverage, model, accesses, results with decisions, diagnostics, warnings,
report coverage, summary and `inputId`. Every step of a sequence also asserts
its independently expected outcome. The session's own `verify()` performs
the same comparison against a full recomputation from its warm compiler and
is run after every step in tests and on idle in the daemon.

## Plan 2 supersession

Iteration 9 removes `subs/analysis/src/increment.ts`,
`subs/analysis/src/retained-products.ts`, the retained input of
`run-analysis.ts` and `session.ts`, the `InputChange`, `RetainedStageId`,
`RetainedStage`, `RetainedAnalysis`, `IncrementInputs` and `IncrementRun`
types, and root's `createAnalysisDriverFromSessions`. `resolveProject` stays.

The I2 instances retired as superseded, each by the named I5 instance:

| Retired instance | Superseded by |
| --- | --- |
| `I2-10:null-changes-no-reuse` | `I5-07:configuration-broad` |
| `I2-10:metadata-only-reuse` | `I5-07:readme-metadata-only` |
| `I2-10:exposure-only-reuse` | `I5-07:description-relink-subtree` |
| `I2-10:header-tag-rerun` | `I5-07:description-relink-subtree` |
| `I2-10:source-rerun` | `I5-06:export-added-importers` |
| `I2-10:configuration-rerun` | `I5-07:configuration-broad` |
| `I2-10:absent-appears-rerun` | `I5-07:created-importing-file` |
| `I2-10:dependency-rerun` | `I5-07:dependency-broad` |
| `I2-10:products-plain` | `I5-06:unchanged-surface-no-propagation` (revisions are frozen plain data) |
| `I2-11:reuse-equal` | `I5-07:audit-equal-sequence` |

`I2-10:resolve-given`, `resolve-found`, `resolve-outside` and
`resolve-no-configuration` stay required because `resolveProject` stays.
`I2-11:identical-inputs-equal`, `independent-negatives`,
`commonjs-module-target-limit` and `declare-global-note` stay required and
run through the session driver. `I2-25` and `I2-26` stay required and run
through the session driver. `I2-29` workloads that assert predicted stage
reuse are amended in iteration 12 to assert the revision's path instead. The
amendment file `docs/plans/done/iteration-2-resident-verification/supersession-plan5.md`
records this table with the user's acceptance date, and `plan2-instances.ts`
marks the ten records `superseded` with their counterparts.

## Budgets

Plan 2's runtime limits stand. The values below start from the spike's
measurements and are revised once from iteration 1's probes; RP-6 proposes
that the hook rows for the reference and S100 are binding from iteration 12's
exit, while the S500, S1000 and memory rows are advisory under Plan 2's
temporary decision until it is reversed.

| Workload | Reference | S100 | S500 | S1000 | Fixed by |
| --- | ---: | ---: | ---: | ---: | --- |
| Cold open, session work | ≤ 1.5 s | ≤ 4 s | ≤ 15 s | ≤ 40 s | I5-13 `cold-open` |
| Unchanged-surface edit, session work, median of twenty | ≤ 25 ms | ≤ 60 ms | ≤ 200 ms | ≤ 400 ms | I5-13 `hook-latency-*` |
| Source edit changing an import list or exports, session work | ≤ 200 ms | ≤ 400 ms | ≤ 1 s | ≤ 2 s | same |
| Description edit, session work | ≤ 120 ms | ≤ 500 ms | ≤ 1.5 s | ≤ 3 s | same |
| README edit, session work | ≤ 30 ms | ≤ 60 ms | ≤ 100 ms | ≤ 200 ms | same |
| Created or deleted owned file, session work | ≤ 400 ms | ≤ 1.5 s | ≤ 5 s | ≤ 10 s | same |
| Configuration or dependency change, session work | ≤ 1 s | ≤ 2.5 s | ≤ 8 s | ≤ 16 s | same |
| Hook end to end, watcher already published, unchanged-surface edit | ≤ 120 ms | ≤ 150 ms | ≤ 300 ms | ≤ 500 ms | same |
| Hook end to end, hook racing the watcher, unchanged-surface edit | ≤ 200 ms | ≤ 250 ms | ≤ 500 ms | ≤ 900 ms | same |
| Checked set of an unchanged-surface edit | 1 file, 0 accesses | same | same | same | I5-13 `checked-set-bounded` |
| Checked set of an export edit | the file and its importers only | same | same | same | same |
| Worker RSS, one hot reference context, settled | ≤ 96 MiB | | | | I5-13 `hot-warm-memory` |
| Compiler server RSS after 200 cycles | ≤ 192 MiB | ≤ 256 MiB | ≤ 512 MiB | ≤ 768 MiB | I5-13 `repeated-edit-plateau` |
| Daemon with two hot and six warm S100 contexts | ≤ 1.5 GiB combined | | | | I5-13 `hot-warm-memory` |
| Retained facts per warm context | ≤ 64 MiB reference, ≤ 96 MiB S100 | | | | same |
| Entry footprints | unchanged from Plan 2 | | | | I5-13 `entry-footprints` |

The bare Node floor on the measurement host and the CLI client's cost with
zero daemon work are measured and recorded beside the hook rows.

### Session limits and budgets

| Name | Default | Meaning |
| --- | ---: | --- |
| `maxHotContexts` | 2 | Contexts with a live compiler server; the least recently used is demoted first. |
| `sweepIntervalMs` | 30,000 | Sweep interval while a context has activity. |
| `updateDeadlineMs` | 2,000 | Default request deadline when the client names none. |
| `workerHeapMiB` | 512 | Worker `resourceLimits`; exhaustion is `resource-unavailable`. |
| `maxRetainedFactBytes` | 96 MiB | Facts and indexes per session, measured by serialization at publication. |
| `debounceMs` | 100 | Unchanged from Plan 2. |

## Document revisions

Iteration 13 revises the architecture documents to state what this plan
implements: [daemon and analysis](../../architecture/daemon.md) gains the
session-in-a-thread structure, the per-file fact granularity, the covering
rule, the sweep and the hook request and reply; [memory lifecycle](../../architecture/memory-lifecycle.md)
gains the compiler server as a bounded cost and the hot and warm levels;
[processes and clients](../../architecture/processes-and-clients.md) gains
`check --changed` and its exits. The two analysis documents are marked as
superseded by the implemented architecture where they differ.

## Explicit deferrals

| Deferred | Reason and trigger |
| --- | --- |
| Proportional relink of the model | Whole-project link and model are 20–26 ms on the reference and 1.0–1.1 s on S1000. Trigger: iteration 12 misses the S500 or S1000 description budget after the per-file catalog lands; then declaration evidence becomes patchable per original before any partial relink. |
| Resolution-bounded narrowing for created and deleted files | The broad path is exact and measured at 525 ms on the reference. Trigger: iteration 12 misses the created-file budget on S100. |
| Syntactic pre-filter before re-extraction | Trigger: the spelling-filtered, batched extraction of one file exceeds 10 ms on S1000 in iteration 12. |
| Persistent checkpoints of retained facts | Trigger: S1000 cold open exceeds its budget after iterations 3 and 4 land. |
| Child-process session host | Trigger: P5-4 or iteration 12 shows a worker limit that cannot be enforced or a clone cost that cannot be bounded. |
| Windows, registry serialization, browser-promise verification, strict configuration | Unchanged from Plans 1 and 2. |
