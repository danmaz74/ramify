# Plan 2B: Generated architect view

**Date:** 2026-09-18. **Status:** accepted for implementation, 2026-09-18.
This plan replaces the 2026-09-15 draft of Plan 2B, "Generated project views",
whose `.exported_symbols/` and `docs/modules/` views are superseded by the
[architect view specification](../../architecture/architect-view.spec.md). The
draft remains in the Git history at commit `577b980`. Plan 2B keeps its
directory and identity.

Plan 2B delivers the view the specification describes: one generated,
gitignored directory, `.ramify-architect/`, that gives an architect agent the
project's modules, their behavior-capable symbols, their tests with the
symbols they exercise, and their observed use, with no semantic elaboration. It then tests hypothesis H1 with
real agents. The [contracts](contracts.md), the
[acceptance matrix](acceptance.md) and the [agent test cases](test-cases.md)
beside this file complete the plan. The specification's review decisions are
accepted at their proposed defaults.

## Runnable outcome

```sh
ramify materialize --view architect                 # the architect view alone
ramify materialize --view api --view architect --all
ramify materialize                                  # unchanged: the API view alone
rg -n -i 'debounce' .ramify-architect/
```

The command synchronizes one revision, projects the architect view in the
retained session, waits for the daemon's dependency facts for that revision,
and publishes every requested target in one transaction:

```text
<root>/.ramify-architect/
├── _meta.json
├── README.md          # instructions and the module map
├── module.json        # root module
├── behavior.jsonl
├── supporting.jsonl
├── tests.jsonl
└── analysis/
    ├── module.json
    └── ...
```

Repeating an identical invocation writes nothing. A failed, superseded or
cancelled invocation preserves the previous complete view. An agent restricted
to `Read` and `rg` then answers the [test cases](test-cases.md) from the view.

## Completion boundary

Plan 2B is complete when iteration 9 records all of the following on one
coherent build:

1. Every row of the [acceptance matrix](acceptance.md) passes, or is recorded
   as unexecuted with its reason where the matrix allows it (macOS only).
2. The Plan 2A API view is byte-identical to its behavior before this plan:
   `ramify materialize` without `--view` publishes exactly what it did, and the
   Plan 2A harness passes unchanged.
3. `npm run build`, `npm run type-check`, `npm run check:self`,
   `npm run check:reference` and `npm run reference:cases` pass, and the full
   Vitest suite passes through the cucumber-viz audit.
4. With and without interleaved materialization, identical inputs produce
   identical check reports, revision sequences and session counters, and
   publishing the view starts no revision.
5. The hit-cost measurement meets the specification's thresholds on the
   toolkit and the reference project.
6. The core agent trials pass on both harnesses under the specification's
   criteria, and the extended set is recorded.
7. The architecture documents, `AGENTS.md`, the roadmap and a completion report
   describe the implemented behavior, the measured limits and the remaining
   gaps.

If the trials falsify H1, the plan still completes: the completion report
records the failing cases, the hit-cost data and the evidence for the split
view or a query interface, and the roadmap records that decision for the
user. A falsified hypothesis is a result, not a defect.

## Prerequisites and current state

Every prerequisite is implemented. The inventory below was taken at commit
`577b980` on 2026-09-18.

- **Materialize (Plan 2A).** `ramify materialize [--from|--all] [--root]`
  reaches `RamifyService.materialize`. The daemon service holds a per-root
  publication lock, calls `ContextManager.apiView`, which queues a
  `PendingApiView` in the context's check queue and, after the capture
  publishes, pins the revision and calls `RetainedSession.apiView` at that
  sequence. The service then calls `ApiViewPublisher.publish`, which renders
  through `api-view-documents.ts` and stages, compares, switches and rolls back
  one `.ramify` directory per module source area. There is no `--view`.
- **Reserved names.** `isRamifyGeneratedSegment` reserves `.ramify`,
  `.ramify.tmp-*` and `.ramify.old-*`. Inventory, compiler selection, the
  configuration host, capture, the observer and the daemon watcher consult it.
  `.ramify-architect` is currently an ordinary name.
- **Dependency facts (Plan 6D).** `RamifyService.dependencyDiagram` answers
  `ready`, `busy`, `superseded`, `cancelled` or `unavailable` for the exact
  published revision. A ready answer carries `DependencyDiagramFacts`, whose
  `boundaries` hold one fact per distinct (consumer module, imported module,
  original) with a `classification`, under the production source filter.
  Per-(consumer module, original) units are not exported but can be rebuilt
  from the boundaries with the diagram's precedence.
- **Behavior rule.** `behavior-classifier.ts` classifies a type as `capable`,
  `data` or `unknown`; call and construct signatures are merged, and member
  capability collapses to `capable`. Nothing classifies a defining-file export.
- **Symbol details.** `RetainedSourceAnalysis.details` runs
  `describeSymbolDetails` on the retained compiler with byte limits for the
  signature, the documentation paragraph and overloads.
- **Test titles.** Nothing extracts them. The toolkit has 148 Vitest files in
  its suite, 121 table-form calls and 16 template-literal titles; the
  reference project has one `.feature` file, captured as a resource input with
  a hash.
- **Purposes.** `InventoryModule.purpose` holds each README's first paragraph
  or a missing state.

Plan 2A's restorations proposed by the earlier draft (the shared requirement
helper in `decisions.ts`, the API-view entry in the check queue and input
promotion during rehydration) are not part of this plan. This plan verifies
its own invariance directly (AV30).

## Architecture

```text
ramify materialize --view architect
  -> CLI (subs/cli): --view parsing, capability check
  -> daemon service (subs/daemon): publication lock per root
       -> contexts: synchronized check, pinned revision R
            -> retained session (worker): architectView at R
                 -> compiler: symbol details, export shapes, test titles
                 -> analysis: projectArchitectView (pure)
       -> contexts: dependencyDiagram at R, waiting while busy
            -> analyzer child: diagram facts and test references, one run
       -> analysis: renderArchitectView(projection, dependencies) (pure)
       -> daemon publisher: one transaction for API and architect targets
  -> <root>/.ramify-architect/
```

### Ownership

| Owner | Adds |
| --- | --- |
| `analysis/typescript` | The five-valued behavior shape shared with the consumer classifier; `describeExportShapes`; `describeTestTitles`; `RetainedSourceAnalysis.shapes` and `.testTitles`. |
| `analysis/project` | `.ramify-architect` and its staging siblings as reserved names. |
| `analysis` | Gherkin title reading; `planArchitectView` and `projectArchitectView`; `RetainedSession.architectView` through the worker; `projectTestReferences` and the analyzer's `testReferences`; `renderArchitectView`. |
| `daemon/contexts` | `views` on the API-view request; the architect projection at the pinned sequence. |
| `daemon` | The architect target in the publisher; the dependency wait and rendering in `materialize`; validation, capability and client fields. |
| root `ramify` | `MaterializeViewId` and the `views` field in the service vocabulary; relays of the new analysis names; publisher limits; `testReferences` in the analyzer process runner. |
| `cli` | `--view` and its output lines. |

No owner is added. The architect projection lives in `analysis` beside the API
view's projection, and rendering is pure analysis code that the daemon calls,
because it combines the session's projection with the daemon's dependency
facts.

### Exposure changes

- `analysis/typescript` exposes to its parent the new types in
  `interfaces/source.ts` (through its existing `*` selection) and
  `describeExportShapes` and `describeTestTitles` only if a consumer outside
  the owner needs them; `RetainedSourceAnalysis` carries the operations.
- `analysis` exposes to its parent `ArchitectViewProjection`,
  `ArchitectViewQuery`, `ArchitectViewQueryOutcome`, `ArchitectDependencies`,
  `RenderedArchitectView`, `renderArchitectView` and the types they name.
- The root relays those names to descendants for `daemon` and
  `daemon/contexts`, and adds `MaterializeViewId` to its service vocabulary.
- `daemon/module.ramify` is unchanged except where a new daemon name must
  reach the root.

## Lifecycle and consistency

1. The CLI validates `--view` before connecting, and sends `views` only when
   the daemon's welcome lists `materialize-views`.
2. The service takes the root's publication lock, then calls
   `ContextManager.apiView` with `views`. The context synchronizes as it does
   today and, at the pinned sequence, calls `session.apiView` when `api` is
   requested and `session.architectView` when `architect` is requested. Either
   session answer of `superseded` makes the whole outcome `superseded`.
3. For `architect`, the service asks `dependencyDiagram` for revision R. While
   the answer is `busy`, it waits 250 ms and asks again, up to 125 s in total.
   `ready` gives measured dependencies and the test references from the same
   analyzer run. `superseded` ends the invocation as
   `superseded` and publishes nothing. `unavailable`, or reaching the wait
   limit, gives unavailable dependencies with that reason; the view is still
   published.
4. The service renders the architect view and passes the API projection and
   the rendered view to the publisher in one call. The publisher stages every
   changed target, switches them and rolls every one back on failure.
5. The lock is released when publication settles.

Checks, watch updates and changed-file hooks never call `architectView`,
`shapes` or `testTitles`, and never write the view. Counters witness this
(AV11).

## Resource budgets

These are the plan's budgets. Iteration 8 records the measured values; a
measured value above its budget stops the plan for a user decision.

| Budget | Value |
| --- | --- |
| Architect session query, warm, toolkit | ≤ 15 s |
| Whole `materialize --view architect`, warm, toolkit, dependency analyzer included | ≤ 90 s |
| Unchanged repeat | 0 bytes written |
| View size, toolkit | ≤ 8 MiB |
| `maxProjectionBytes` (session projection) | 64 MiB |
| `maxArchitectBytes` (publisher, rendered view) | 64 MiB |
| Dependency wait | 250 ms interval, 125 s total |
| Hit cost per term, toolkit and reference | ≤ 200 lines and ≤ 64 KB |
| Mean behavior record, toolkit | ≤ 300 characters, recorded as evidence |

## Iterations

| Iteration | Title | Owners | Prerequisites |
| ---: | --- | --- | --- |
| 1 | [Classify export shapes](iterations/iteration1.md) | `analysis/typescript` | — |
| 2 | [Read test titles](iterations/iteration2.md) | `analysis/typescript`, `analysis` | 1 |
| 3 | [Project the architect view in the session](iterations/iteration3.md) | `analysis` | 2 |
| 4 | [Render the architect view](iterations/iteration4.md) | `analysis` | 3 |
| 5 | [Reserve and publish the architect target](iterations/iteration5.md) | `analysis/project`, `daemon` | — |
| 6 | [Test references](iterations/iteration6.md) | `analysis`, root | 4 |
| 7 | [Materialize the architect view](iterations/iteration7.md) | `daemon/contexts`, `daemon`, root, `cli` | 5, 6 |
| 8 | [Real runs, invariance and hit cost](iterations/iteration8.md) | integration, documentation | 7 |
| 9 | [Agent trials and completion](iterations/iteration9.md) | evaluation, documentation | 8 |

Iteration 5 shares no files with iterations 1–4 and may run beside them.
Iteration 7 integrates both lines.

Iteration 6 was inserted on 2026-09-18, after iteration 4, when test records
gained `exercises` ([C9](contracts.md#c9-test-references)). The results of
iterations 1–5 name the later iterations by their earlier numbers: their 6, 7
and 8 are now 7, 8 and 9.

## Review decisions

Accepted at their proposed defaults on 2026-09-18, with the refinements the
[specification](../../architecture/architect-view.spec.md) records:

1. The directory is `.ramify-architect/`, reserved at any depth like `.ramify`.
2. Internal and exposed originals share a file, labelled by `role`.
3. There are no relayed records; `reexposed` lists the ancestors.
4. The map lists eight headline names per module.
5. `sig` is cut at 240 bytes and four overloads, `doc` at 280 bytes, titles at
   240 bytes.
6. Modularity metrics are `unavailable` in this delivery.
7. Materialization waits for the dependency facts and publishes without them
   only when they are unavailable.
8. Consumer lists are production-only; test references appear only as
   `exercises` on test records.
9. Consumer lists hold twelve modules, `as` four names, purposes 600 bytes,
   test records 40 titles.
10. The trial thresholds are 200 lines and 64 KB per term, 300 lines and
    64 KB per task.
11. `ramify materialize` without `--view` materializes the API view alone.
12. Test records carry `exercises`: per file, behavioral pairs only, twelve
    entries, same-owner originals included, unknown pairs counted in
    `_meta.json` (decided 2026-09-18).

## Deferrals

- Modularity metrics in `module.json`, a testing scope for consumer lists,
  per-suite attribution of test references, and `src/docs/` contents.
- Automatic publication after revisions.
- The earlier draft's view registry, the API view's re-hosting and its
  restorations of Plan 2A's analysis changes.
- Access explanations for a consumer/original pair and ranked search; Plan 4
  and Plan 7 take them up if the trials show the view is insufficient.
- macOS byte-identity, unless a macOS host is available.

## Handoff

The completion report hands over the architect view format and its measured
limits, the export-shape operation, the test-title reader, the publisher's
project-root target, the trial transcripts and scores, and the verdict on H1.
