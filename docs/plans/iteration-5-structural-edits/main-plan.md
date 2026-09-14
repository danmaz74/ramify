# Plan 5 structural edit latency

**Date:** 2026-09-13. **Status:** implemented; iterations 1 to 7 are complete,
and the [closure](iterations/closure.md) records the evidence, the
clarifications of the resolved decisions below, the estimates the evidence does
not support and the decisions still awaiting review. The S100 budget is not yet
verified in the real process. This plan answers the
[structural edit latency brief](../../analysis/structural-edit-latency.md) and
implements what its evidence indicates. It adds no capability, owner or package
entry. [Plan 5](../iteration-5-fast-incremental-checks/main-plan.md) contracts,
the [contract remediation](../iteration-5-contract-remediation/main-plan.md)
and the [hook optimization](../iteration-5-hook-optimization/main-plan.md)
resolved decisions remain authoritative except where a resolved decision below
clarifies them.

**Revision, 2026-09-14.** A decision after the measurement adopted option 2: a
post-write hook exists to verify module exports and their use, and a
`tsconfig.json` edit is not that kind of change, so a hook that names a
configuration file is answered at once as not checked, exit code 2 with the
reason that the configuration changed, while the daemon verifies the change
behind the reply. Iteration 6 is therefore withdrawn and its configuration
projection reverted: a configuration edit acquires the project again, and
iteration 5's sweep skip applies to it once more. Iteration 5's compiler options
fix stays. The configuration row leaves resolved decision 1's 2 s
acceptable-time budget, which now covers the S100 created and deleted rows; the
background revision behind the reply has no hook-facing budget. Resolved
decision 7 is superseded, and review decision 3, the helper spawn on a
configuration edit, is moot. The [closure](iterations/closure.md) records the
revision, and the [CLI invocation contract](../../architecture/cli-invocation.spec.md)
and the [daemon architecture](../../architecture/daemon.md) state the reply.

## Workflow and completion boundary

An agent creates or deletes a source file, or edits `tsconfig.json`, and its
post-write hook runs `ramify check --changed <path>` against a warm resident
context on a project the size of S100. After this plan:

- a created or deleted source file no longer resolves the project root again in
  the daemon or in the worker;
- a created or deleted source file no longer invalidates the whole compiler
  program, and the session re-describes, re-interprets and re-decides only the
  files whose resolution or description that path can change;
- a configuration edit that changes no file selection keeps the inventory and
  runs no second sweep in the same capture;
- the session time outside the named stages is attributed by a timing field.

Every published result, including the observed-input identity, still equals
batch. The plan is complete when every matrix row passes under owner tests,
type-check and the commit audit. Whether the three S100 rows are under the
2 s [acceptable-time budget](../../architecture/memory-lifecycle.md#two-kinds-of-budget)
is established by the measurement successor, see [Deferrals](#deferrals).

## Evidence

Source lines are at `9435952`. Medians are from the
[measurement results](../iteration-5-hook-optimization/iterations/measurement-results.md)
on build `4981ed5`, Linux, Bun-compiled client. The brief's five hypotheses
were examined against the source; this section records the verdicts the brief
asked for.

### Hypothesis 1, root resolution runs twice: confirmed

A reused resolution is validated by replaying every recorded discovery query
and comparing one digest, at
[resolve-root.ts:52-64](../../../subs/analysis/subs/project/src/resolve-root.ts#L52-L64)
and [capture.ts:301-305](../../../subs/analysis/subs/project/src/capture.ts#L301-L305).
The digest includes verbatim directory listings, which come only from the
configuration helper's include walk after the root is already selected. The
resolution outcome itself, root, invocation directory, selection and
configuration path, depends only on the existence, canonical-path and
exact-name probes in `selection.ts`. A created or deleted source file changes a
listing, so validation fails and the helper is spawned again, once in the
daemon's `openContext` and once in the worker's invocation check at
[session-engine.ts:347](../../../subs/analysis/src/session-engine.ts#L347).
The worker keeps its own evidence in a process-local `WeakMap`, so nothing can
be passed from the daemon without a new contract.

| S100 row | Before check | Invocation check | Narrow-edit replay for comparison |
| --- | ---: | ---: | ---: |
| Created | 589 ms | 503 ms | about 135 and 70 ms |
| Deleted | 592 ms | 490 ms | about 135 and 70 ms |
| Configuration | 605 ms | 480 ms | about 135 and 70 ms |

### Hypothesis 2, the compiler rebuilds its program: rejected as stated

TypeScript 7.0.2's snapshot API accepts created and deleted files
incrementally, and the session sends them that way in one update. The cost is
the session's own second update with `invalidateAll` whenever a file was
created or deleted, at
[session-revision.ts:425-428](../../../subs/analysis/src/session-revision.ts#L425-L428).
That update discards the program and also sets the adapter's broad flag at
[retained-source-analysis.ts:135](../../../subs/analysis/subs/typescript/src/retained-source-analysis.ts#L135),
which makes `describe` read every owned file. On S100 the compiler stage is
623 ms for a created file against 5 ms for a source edit.

The condition was added by the commit "Establish live incremental equivalence
and repair deletion inputs" of 2026-09-12, recorded in
[Plan 5 iteration 11](../iteration-5-fast-incremental-checks/iterations/iteration11-results.md#compiler-observations-and-removed-roots).
After a deletion the session's capture kept the compiler's obsolete probes and
its input identity differed from batch while the audit reported equal facts.
The repair retires every compiler-reported observation on a membership change,
at [observer.ts:108-111](../../../subs/analysis/subs/project/src/observer.ts#L108-L111),
and forces the whole invalidation so the compiler's callbacks repopulate the
capture. The invalidation exists for the observation table, not for the
program. Dropping it alone would reintroduce that defect.

### Hypothesis 3, broad analysis re-extracts every owner: confirmed

`recomputeAll` describes, interprets, links and decides every owned file, at
[session-revision.ts:204-229](../../../subs/analysis/src/session-revision.ts#L204-L229).
The data to bound it exactly is already retained per revision:

- `FileFacts.candidates` records every path an importer's resolution probed,
  including absent ones, at
  [session-facts.ts:22](../../../subs/analysis/src/session-facts.ts#L22),
  produced through `Resolution.onCandidate`. A created or deleted path that
  appears in a file's candidates is exactly a file whose resolution can change.
- `FactIndexes.importers` maps a target file to the files with accesses that
  read it, at [session-facts.ts:99-123](../../../subs/analysis/src/session-facts.ts#L99-L123);
  the narrow source path already uses it.
- The retained description set expands a named file set to its dependency
  closure and already selects the dependents of a deleted path and the files
  that listed a created path as absent, at
  [descriptions.ts:113-114](../../../subs/analysis/subs/typescript/src/descriptions.ts#L113-L114).
  The whole invalidation bypasses this.

S100 created: descriptions 450 ms, accesses 403 ms, link 99 ms, decide 117 ms.

### Hypothesis 4, unattributed reference time: located, not measured

About 456 ms of a reference broad revision is outside the eight stages. The
only untimed work of that size is the promotion after computation,
`#promote` at [session-engine.ts:296](../../../subs/analysis/src/session-engine.ts#L296),
called from `#complete` at line 271. It folds every compiler-reported read into
the capture and re-reads disagreeing ones; a whole invalidation maximizes that
list. Iteration 1 adds the timing field and confirms the attribution.

### Hypothesis 5, configuration edits: confirmed and mostly avoidable

The workload edits the `target` option of `tsconfig.json`, at
[fast-fixture.mjs:41](../../../scripts/measurements/fast-fixture.mjs#L41). Two
costs follow:

- **Inventory, 1,101 ms.** Any recorded configuration input is classified
  structural at [observer.ts:224](../../../subs/analysis/subs/project/src/observer.ts#L224),
  which rebuilds the inventory from scratch: a new capture, the helper spawned
  again, a walk of every directory, a read and hash of every owned file. The
  project layer reads only `files`, `references`, `exclusions`, `outDir` and
  `declarationDir` from the configuration, at
  [inventory.ts:19-29](../../../subs/analysis/subs/project/src/inventory.ts#L19-L29),
  and reuse is keyed on the raw byte hash at
  [configuration.ts:139-149](../../../subs/analysis/subs/project/src/configuration.ts#L139-L149),
  so nothing compares the old and new selection.
- **Required sweep, about 260 ms.** A path regex sets `sweepRequired` at
  [context-manager.ts:180](../../../subs/daemon/subs/contexts/src/context-manager.ts#L180),
  and the sweep runs after the update in the same capture at line 374. The
  rebuild has already validated a fresh capture at
  [read-project.ts:73](../../../subs/analysis/subs/project/src/read-project.ts#L73),
  so the sweep verifies a table constructed moments earlier and returns
  unchanged in every measured cycle. It has no product timing field: an
  unchanged result carries no timings at
  [session-host.ts:105](../../../subs/analysis/src/session-host.ts#L105).

The compiler must still honour the option change; the adapter re-parses the
configuration on `invalidateAll`.

### Savings and ranking

Derived from the measured medians; medians of different fields do not add
exactly. The saving assumes the replay cost of a narrow edit remains.

| Repair | Iteration | S100 created and deleted | S100 configuration | Effort | Risk |
| --- | --- | ---: | ---: | --- | --- |
| Narrow root-resolution validation | 2 | about 890 ms | about 880 ms | one file | low; detection of an unreadable directory moves to acquisition |
| Membership path replacing the whole invalidation | 3, 4 | about 1,200 to 1,400 ms | none | design change in three owners | moderate; input identity must stay equal to batch |
| Skip the sweep after reacquisition | 5 | none | about 260 ms | small | low |
| Keep the inventory on an options-only edit | 6 | none | about 700 ms | design change in two owners | withdrawn by the revision above |

Estimated medians after the plan: created and deleted about 400 to 700 ms with
iterations 2 to 4, about 1,600 ms with iteration 2 alone; configuration about
1,800 ms with iterations 2, 5 and 6. The configuration estimate is marginal
against the budget, so iteration 6 records the measured helper cost and the
[review decision](#decisions-for-review) on avoiding the helper spawn.

## Resolved decisions

1. **Budget.** The hook's 2 s end-to-end median on S100 created, deleted and
   configuration rows is the only acceptable-time budget. Every other figure
   is an ideal budget. Memory requires only that no new retained index leaks.
2. **Byte-identical results.** Input order, `inputId`, revision identities,
   reports and replies stay byte-identical to batch for the same inputs. The
   session-equals-batch tests and the session audit remain the exactness gate.
   Iteration 4 adds sequences that cover the iteration 11 deletion defect.
3. **Resolution validation.** A recorded resolution is reused when the
   discovery queries that determine its outcome answer the same: the kind,
   canonical path and exact-name membership of every path `selectRoot` and
   `findConfiguration` probed, and the `module.ramify` symlink probe. Directory
   listings and file bytes are not validated at resolution time. Configuration
   content and directory readability are verified by acquisition, which the
   observer's structural rebuild and the batch path already perform, so an
   error's attribution point may move from resolution to acquisition. The
   solution-style refusal at resolution stays for a fresh resolution and is
   re-evaluated by acquisition when the configuration changes. Nothing is
   passed between the daemon and the worker; both use the same validation.
4. **Membership path.** A local update that only creates or deletes owned
   source files takes a new `membership` path. The compiler receives the
   created and deleted files and the regenerated roots in one incremental
   update and no whole invalidation. The affected set is the created and
   deleted files, every file whose retained candidates or description
   dependencies name one of them, and the importers of the files whose
   descriptions the description set recomputed. Observations are retired by
   the contribution index of resolved decision 5, not wholesale. Link always
   runs; decisions are narrowed as on the source path. Every other broad
   trigger, stale, unknown, structural, shim, non-owned or unexplained inputs,
   changed areas and an invalid previous state, keeps the whole invalidation.
   A created file that makes `src/tests/` appear changes the areas and stays
   broad.
5. **Contribution index.** The session derives, from the retained facts, a map
   from each observation path to the owned files that contribute it: a file
   contributes itself, its candidates and its description dependencies. On a
   membership change the session retires exactly the observations contributed
   only by the affected set, then re-interprets that set, and forgets retired
   observations the compiler did not report again. Compiler reads not
   attributable to owned files, such as library and dependency files, are kept.
   The index is rebuilt with the fact indexes and leaves with them.
6. **Sweep after reacquisition.** A required sweep is satisfied by an update in
   the same capture that reacquired the project from a fresh capture. The
   session reports the reacquisition on its update; contexts skip the sweep leg
   on that report. Every other required sweep, cold open, watcher overflow or
   error, a queue overflow, a cancellation, and a matched path the observer did
   not record, still runs.
7. **Configuration projection.** A changed configuration input is re-read
   through the helper and its selection projection, `files`, `references`,
   `exclusions`, `outDir` and `declarationDir`, is compared with the retained
   one. An equal projection keeps the inventory and the capture and yields a
   local update that names the configuration; the session then invalidates the
   whole compiler program and recomputes every owned file, because any option
   can change resolution or type classification. A changed projection rebuilds
   as today. The comparison is made in `analysis/project`; the session does not
   interpret configuration fields.
8. **No live runs in iterations.** Iterations run owner tests, type-check and
   the commit audit, never `npm run measure:*` or the full suite. Iteration 1
   may run a bounded in-process loop over the session engine, about ten cycles,
   to attribute the reference's unattributed time; its script is not committed
   unless it becomes a test.

## Owners

No owner, exposure line or package entry is added.

| Iteration | Owners | Main source |
| --- | --- | --- |
| 1 | `analysis`, `daemon/contexts` | `session-engine.ts`, `session-host.ts`, `interfaces/session.ts`, `context-manager.ts`, `interfaces/contexts.ts` |
| 2 | `analysis/project` | `resolve-root.ts`, `capture.ts`, `read-project.ts` |
| 3 | `typescript`, `analysis` | `src/tests/retained-membership.ts` and siblings, `session-facts.ts` |
| 4 | `analysis/project`, `analysis` | `observer.ts`, `capture.ts`, `interfaces/project.ts`, `session-revision.ts`, `session-engine.ts` |
| 5 | `analysis`, `daemon/contexts` | `interfaces/session.ts`, `session-engine.ts`, `context-manager.ts`, `docs/architecture/daemon.md` |
| 6 | `analysis/project`, `analysis` | `configuration.ts`, `observer.ts`, `read-project.ts`, `interfaces/project.ts`, `session-revision.ts` |
| 7 | documentation | this plan, the brief, the optimization analysis |

## Contracts to review

Each is additive. The iteration that lands one records the exact shape in its
results and the plan's [Decisions for review](#decisions-for-review) collect
what needs sign-off.

| Contract | Change | Iteration |
| --- | --- | --- |
| `OperationTimings` | adds `promotion` | 1 |
| `Session.sweep()` unchanged result | may carry `timings` so the host attaches the round trip | 1 |
| `CaptureWork` | adds `sweep` | 1 |
| Resolution evidence | records the discovery-query subset used for validation; private to `analysis/project` | 2 |
| `FactIndexes` | adds `contributors` | 3 |
| `ProjectObserver` | a way for the session to retire named observations after `apply`, either an option on `apply` or a `retire` method | 4 |
| `CheckedSet.path` | adds `membership` | 4 |
| `SessionUpdate` revised result | adds `reacquired: boolean` | 5 |
| `InventoryUpdate` local kind | adds `configuration: readonly string[]` beside `descriptions`; withdrawn by the revision above | 6 |

## Acceptance matrix

| ID | Case | Evidence | Iteration |
| --- | --- | --- | --- |
| SE-1 | `promotion-timed`: a revised update's timings carry the promotion duration, and a sweep's round trip reaches the capture work | unit | 1 |
| SE-2 | `unattributed-located`: the results attribute at least four fifths of a reference broad revision's time outside the eight stages to named work, with figures | results | 1 |
| SE-3 | `resolution-survives-membership`: a created or deleted source file in an enumerated directory reuses the resolution in the worker's invocation check and on a daemon reopen, with no helper spawned | unit | 2 |
| SE-4 | `resolution-invalidated-by-discovery`: a created or deleted `module.ramify` or `tsconfig.json` on the discovery path, a moved root and a changed canonical path resolve again | unit | 2 |
| SE-5 | `resolution-survives-configuration-bytes`: a `tsconfig.json` content edit reuses the resolution, and a solution-style rewrite is still refused by acquisition with the same code | unit | 2 |
| SE-6 | `membership-incremental-equal`: after a created and a deleted file delivered without a whole invalidation, program membership, descriptions, the catalog and accesses equal a fresh adapter's | unit, `typescript` | 3 |
| SE-7 | `membership-reads-reported`: the callbacks the compiler reports during that update cover every observation the affected files contribute, including absence probes that the created file satisfies | unit, `typescript` | 3 |
| SE-8 | `contribution-index`: the index maps every observation path to the files contributing it, equals a rebuild after any revision, and holds no path of a removed file | unit | 3 |
| SE-9 | `membership-identity-equals-batch`: after an unreferenced deletion, a referenced deletion, a created file that satisfies an absent probe and a created unreferenced file, the session's inputs and `inputId` equal batch | unit, session fixture | 4 |
| SE-10 | `membership-path-narrow`: those updates take the `membership` path, issue no whole invalidation, and their checked set names only the affected files | unit | 4 |
| SE-11 | `membership-sequences-equal-batch`: the live sequences of Plan 5 iteration 11, extended with restore-after-delete and whole-module removal, equal batch at every step and pass the audit | unit, session fixture | 4 |
| SE-12 | `broad-kept`: structural, configuration, shim, non-owned, unexplained and area changes still take the broad path with the whole invalidation | unit | 4 |
| SE-13 | `sweep-skipped-after-reacquire`: a configuration edit runs one update that reports reacquisition and no sweep, and the counters show it | unit | 5 |
| SE-14 | `sweep-kept`: a matched path the observer did not record, a watcher overflow, a cold open and a cancelled update still sweep | unit | 5 |
| SE-15 | Withdrawn with iteration 6 by the revision above | — | 6 |
| SE-16 | Withdrawn with iteration 6 by the revision above | — | 6 |
| SE-17 | `docs-updated`: the brief records its verdicts, the analysis ranks the delivered repairs, and the closure lists evidence per row | review | 7 |

## Iterations

Iterations run in sequence in one worktree; each is one subagent.

| Iteration | Title | Prerequisites |
| --- | --- | --- |
| [1](iterations/iteration1.md) | Time the promotion and the sweep | none |
| [2](iterations/iteration2.md) | Validate resolution reuse by discovery queries only | none |
| [3](iterations/iteration3.md) | Membership witness and contribution index | 1 |
| [4](iterations/iteration4.md) | Membership path with targeted retirement | 3 |
| [5](iterations/iteration5.md) | Skip the sweep after reacquisition | 1 |
| [6](iterations/iteration6.md) | Keep the inventory on an options-only configuration edit (withdrawn) | 4, 5 |
| [7](iterations/iteration7.md) | Closure and measurement recipe | 1 to 6 |

## Verification policy

Each iteration runs its owners' test directories with `npx vitest run <dir>`,
`npm run type-check` and `git diff --check`, never `npm test` or the full suite
by hand, and never a command that stops every Node process. Iterations 4 and 6
also run `npm run build` and `npm run check:self`, because the hook
optimization closure found self-check failures the commit audit did not. Full
verification is the cucumber-viz commit audit on the worktree after each
iteration's commit; failures are fixed before the next iteration starts.

## Deferrals

| Deferred | Reason |
| --- | --- |
| Real-process measurement | Focused `measure:fast` runs of `hook-latency-s100` and `hook-latency-reference` follow the plan, using iteration 7's recipe, against the 2 s budget. S500, S1000 and macOS follow them. |
| Avoiding the helper spawn on a configuration edit | Moot after the revision above: the projection it served is withdrawn, and no hook waits for a configuration acquisition. |
| Cheaper replay primitives | Deriving entry kinds from a typed `readdir` would shrink the 135 and 70 ms replay on S100 narrow edits; unchanged by this plan. |
| Proportional relink | Link stays whole-project on the membership path; it is about 100 ms on S100. Revisit with S500 and S1000. |
| Target 6, watcher window | At most about 70 ms on S100; out of scope by the brief. |
| Sweep re-hashing only moved files | The deferred step of hook optimization target 1. |

## Decisions for review

1. **Observer retirement contract.** Whether the session names retired
   observations through an option on `ProjectObserver.apply` or through a
   separate `retire` method; iteration 4 proposes one and records the
   alternative.
2. **Repeated deletion plan.** The measurement results did not reproduce the
   repeated deletion revision at `8236a00`. Iteration 4 changes deletion
   handling; confirm or withdraw the
   [repeated deletion plan](../iteration-5-repeated-deletions/main-plan.md)
   before it starts, so the two do not edit the same branch of `revise`.
3. **Helper spawn on configuration edits.** Closed as moot by the revision
   above.
4. **Error attribution.** Accept that an unreadable directory or a
   solution-style rewrite is reported by acquisition rather than resolution,
   with the same codes, as resolved decision 3 states.

## Handoff

Iteration 7 writes `iterations/closure.md`: delivered repairs, contract
clarifications, test evidence per matrix row, audit results and remaining gaps,
plus the focused measurement recipe. The measurement successor attributes each
of the three S100 rows with the timing fields, including iteration 1's
promotion and sweep durations, and replaces this plan's derived estimates with
measured medians.
