# Live-data assessment

**Inspected:** 2026-09-12. Supports [Plan 7](main-plan.md); implementation status
is a snapshot and must be refreshed at the provider handoff.

## Finding

Plan 5 already plans to retain who imports from whom at file/original level.
Its source records contain enough information for the supported module graph.
Add an on-demand projection and revision-consistent session/worker query.
No additional live module dependency map or compiler pass is needed.

| Information | Existing or planned field | Handoff requirement |
| --- | --- | --- |
| Module and file ownership | `ProjectInventory.modules`, `files`; `SourceOrigin.area.owner` | Reuse current inventory and file-owner lookup. |
| Actual target, including symbol-free load | `SourceAccess.target` | Retain supported application targets even with zero selections. |
| Original and forwarding owners | `AccessSelection.original.owner`, `forwarding` origins | `OriginalId` already carries owner; no new symbol-owner index. |
| Type and test dependencies | Access forms/requests and importer source area | Keep these occurrences; no runtime-only filter. |
| Dependency uncertainty | `SourceLimit`, located coverage, pipeline execution state | Retain notes and prove required stages completed. |
| Owned declaration shims | `FileDescription.dependencies.shims` | Use the explicitly classified list, not arbitrary description inputs. |
| Current source evidence | Plan 5 iteration 6's `session-facts.ts` | Frozen per-file accesses/descriptions, model, decisions and atomic revision. |
| Reverse analysis indexes | File-to-importers and original-to-selecting-accesses | Already planned for invalidation; not the module test-impact result. |
| Query access/readiness | New worker-local read view and session operation | Add in Plan 7; small private readiness metadata only if absent. |

## Verified implementation versus planned provider

The active checkout was
`/tmp/worktrees/ramify-67e9dd0f/iteration-5-fast-incremental-checks`, commit
`8cd2543d599dfc87d8561d4be3d648eb9e1acb0f`. Workflow
`lD1vuzYQuKvbHViU1BMjX` reported 5/15 complete during inspection. The checkout
contained `DescriptionDependencies`, `FileDescription`, `AccessInterpreter`,
retained adapter interfaces and observation support. It did not yet contain
`session-facts.ts`, `retained-session.ts`, `interfaces/session.ts` or
`session-worker.ts`. Those are provider prerequisites, not completed features.
The `/ramify` workspace at `25cac533497a8fa9f1c120f77443fd9c18cb8ca0` still
contains the predecessor analysis implementation.

Plan 5 [iteration 6](../iteration-5-fast-incremental-checks/iterations/iteration6.md)
explicitly retains per-file descriptions/access facts and reverse indexes;
its later iterations add worker and context integration. Its
[contracts](../iteration-5-fast-incremental-checks/contracts.md) currently expose
update/sweep/verify/report/status/release/disposal, with no affected query.
`SessionRevision` includes coverage and verdict but no stage execution array;
Plan 7 must access readiness privately without requesting a full report.

## Why invalidation is not test impact

Plan 5's [dependency model](../iteration-5-fast-incremental-checks/scope.md#dependency-model)
can stop analysis propagation when descriptions/access facts are unchanged.
A function body edit can still break a caller at runtime. The new query scans
retained dependencies regardless of what the latest update rechecked.

`DescriptionDependencies.files` can include resolution candidates and resource
export-description contributor backlinks. Using these wholesale as application
edges can reverse the meaning of a resource import. Source edges come from
resolved access evidence; the separate `shims` list supplies the supported
resource-to-declaration dependency. Owned resource and declaration identities
remain distinct.

## Executed probes and their limits

The [source-fact probe](probes/source-facts.mts) ran the real batch analyzer
from Plan 5's earlier iteration 2 checkout at
`628892add024b899fadd033726a00e202b8d9630` over a disposable nine-module fixture.
It asserted exact edges `a->b`, `a->c`, `b->c`, `integration->a`, `side->c`,
`tested->c`, `types->c`, and no edge to `unrelated`. Barrel/original ownership,
exportless side effects with zero selections, same-owner tests, separate
testing modules, denied imports, a body-only edit and nonliteral dynamic
coverage all passed. [Raw results](evidence/source-facts.json) preserve that
historical probe; they are not evidence that a retained query has been built.

The [strategy comparison](storage-strategy-comparison.md) uses current
source-shaped access records and isolated synthetic workloads to measure
scan/build/traverse and temporary memory. It supports the on-demand choice.
The [maintained-index memory probe](memory-assessment.md) is historical
alternative-design evidence; its contribution bookkeeping is not planned work.
None of these probes establishes live revision correctness, cancellation,
worker/IPC behavior or production latency. Those remain A7 acceptance cases.

To rerun source feasibility against a provider checkout with dependencies:

```sh
node --import tsx docs/plans/iteration-7-affected-modules/probes/source-facts.mts /path/to/plan5-checkout
```

## Provider handoff and allowed additions

Iteration 1 records the completed provider commit and proves that accesses,
targets, original/forwarding ownership, explicit shim dependencies, inventory
and coverage survive source/broad updates and compiler release. The query
must read one committed revision and distinguish invalid or incomplete input.

Iteration 2 may add a private fact-view accessor and bounded readiness metadata
at existing publication points, plus the new API/protocol/algorithm. Reuse
retained objects. Do not add a duplicate import store, module-edge maintenance,
compiler behavior, public fact-store export or whole-report dependency.
If a required semantic fact is missing, name the exact producer and acceptance
case in a revised contract before implementing its consumer. No edit to the
running Plan 5 workflow is part of authoring or executing this plan.
