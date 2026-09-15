# Plan 7: Affected modules from retained dependency facts

**Date:** 2026-09-12. **Status:** draft for contract review; implementation has
not started. This plan follows [Plan 5](../iteration-5-fast-incremental-checks/main-plan.md)
and preserves the existing Plan 7 identity.

Given changed module IDs, return every transitively dependent module and the
combined set to test. Use Plan 5's live in-memory facts through one analysis
query, available through the TypeScript API, daemon client, CLI and MCP.

## Design choice

Build a temporary reverse module graph **on demand**, inside Plan 5's analysis
worker, from one revision's retained access, ownership and description facts.
Traverse it once for the complete seed list, return the compact selection,
and release the graph. Ordinary checks and hooks perform no added graph work.
No module graph, contribution counts or query cache are retained between calls.

This is the plan's proposed design for the user's occasional, non-hook usage.
The [comparison and measurements](storage-strategy-comparison.md) support it:
scan/build/traverse took about 3.9 ms p95 for the 1,000-module, 10,000-edge
prototype, with about 0.40 MiB of temporary graph storage. These are algorithm
measurements, not integrated session or client latency guarantees.

Plan 5 already specifies who imports from whom at file/original level. The
new feature adds a query over those facts; it does not need another dependency
store or a compiler run to build the graph. Normal cold startup or a requested
synchronization can still require Plan 5's ordinary analysis work.

## Runnable outcome

For `A -> B -> C`, where an arrow means "depends on", seed C returns A and B
as affected dependents; the test selection contains A, B and C. Multiple
seeds produce one union. Cycles terminate and outputs are deterministic.

```sh
ramify affected app/core app/storage --format json
ramify affected app/core --changed subs/core/src/core.ts --format json
```

The first command reads the current analyzed revision. The second waits for
Plan 5 to cover the supplied saved file's content identity before querying.
Module IDs are exact inventory IDs, including the root name. Results contain
IDs and project-relative directories; the caller chooses and runs tests.
The MCP tool is `ramify_affected_modules`, with explicit root and module IDs.
The [contracts](contracts.md) specify inputs, results, failures and freshness.

## Prerequisites and verified state

Plan 5 must deliver retained per-file accesses/descriptions, module inventory,
coverage, revision readiness, atomic updates, worker hosting, compiler release
and context synchronization. Its reverse invalidation indexes can remain
private; this query reads the underlying source facts. Plan 5's checked set
and unchanged-export optimization cannot substitute for dependency traversal.

At the 2026-09-12 inspection, the workflow reported 5/15 complete. Its checkout
contained description dependencies and retained adapter interfaces, while the
session fact store and worker were still pending. The
[data assessment](data-assessment.md) records the inspected commit, existing
fields, executed probes and precise provider handoff. Iteration 1 refreshes
that inventory after Plan 5 acceptance. This plan adds no tasks to its active
workflow. Any small missing readiness metadata or fact access belongs to
Plan 7 iteration 2; a missing dependency interpretation needs an explicit
provider contract revision before dependent implementation.

Plan 4's stdio MCP adapter, injected client and lifecycle contract are a
separate prerequisite for iteration 5. Full Plan 7 acceptance includes MCP;
core/service/CLI can follow Plan 5 without waiting for that adapter. Plan 3
inspection and Plan 6 visualization are not prerequisites.

## Dependency and coverage semantics

1. Nodes are declared Ramify modules. Same-owner `src/tests/` belongs to its
   module; a separately declared testing module is a separate node. Source
   membership follows the analyzed compiler scope, including its exclusions.
2. Add `consumer -> provider` from actual application targets, selected
   originals' owners and recorded forwarding owners. Include value, type-only,
   namespace, literal dynamic, resource, re-export and symbol-free accesses.
   Resolved denied imports still contribute edges. Exposure declarations and
   ancestry alone contribute none.
3. Include an owned file/resource's dependency on an owned declaration shim
   recorded in `FileDescription.dependencies.shims`. Preserve resource
   ownership. General resolution candidates and resource-description
   contributor backlinks are analysis dependencies, not application imports.
4. Traverse at module granularity. If B/file1 depends on C and A depends on
   B/file2, changing C selects B and A. A stable export surface or zero newly
   checked importers never stops impact propagation.
5. Return sorted, deduplicated `changedModules`, `affectedModules` excluding
   seeds, and `testModules` containing their union. Unknown IDs fail the
   whole query. Empty API seeds yield empty arrays after normal validation;
   CLI requires at least one seed.
6. Partial source coverage returns the known affected closure, the coverage
   notes, and **all inventoried modules** as the conservative test selection
   for nonempty seeds. CLI exits 2. This does not certify independent projects
   or tests excluded by the configured source set.
7. Missing stages/facts, invalid current inputs, stale requested identities,
   resource limits and cancellation are explicit outcomes. Never substitute
   an empty success or a last-valid graph labelled current. A complete query
   preserves existing importability failures separately from dependency coverage.

## Architecture and scope

The [ownership package](owners.md) defines source placement, manifest additions,
foreign type relays, package entries and purpose updates. The analysis worker
builds the graph while serialized with revision mutations, yields for bounded
cancellation, and copies only the answer to contexts. Contexts supplies Plan 5's
covering revision; daemon, CLI and MCP use that same service. Published reads
work after compiler release while the worker still holds valid facts.

Add no filesystem scan, compiler invocation, whole-report projection or second
analysis session to a query over ready facts. Queue, temporary memory, response
size and elapsed work are bounded. No graph maintenance runs on updates;
a query after an update derives the new graph from the newly committed facts.

Deferred: Git diff discovery, changed-file-to-seed inference, historical graph
unions, deleted-module recovery, test execution, individual test-file selection,
symbol-level impact, runtime instrumentation, lazy graph caching, browser/UI
integration and MCP HTTP hosting. Configuration and exposure-policy changes
still need ordinary project verification. No importability rule changes.

## Iterations

| Iteration | Capability and owners | Prerequisite | Matrix |
| --- | --- | --- | --- |
| 1 | Contract review and provider handoff; documentation | Completed Plan 5 provider evidence | A7-01 |
| 2 | On-demand graph and retained-session query; analysis | 1 and Plan 5 session/worker | A7-02–A7-09 |
| 3 | Revision scheduling and daemon access; contexts, daemon, root | 2 and Plan 5 context driver | A7-10–A7-12 |
| 4 | CLI affected command; CLI and root entry | 3 | A7-13 |
| 5 | MCP affected-module tool; Plan 4 MCP owner | 3 and Plan 4 stdio provider | A7-14 |
| 6 | Cross-client acceptance and resource gate; integration | 4 and 5 | A7-15–A7-17 |

The [manifest](iterations/manifest.json) registers these sequentially. Each
iteration has its own prerequisites, read-first list, fixtures, finite cases,
commands and handoff. The [acceptance matrix](acceptance.md) and
[case inventory](cases.json) define completion, including real worker, IPC,
CLI and MCP evidence rather than only algorithm tests.

## Review and completion

The user requires changed-module impact, Plan 5 live data, MCP access and no
hook use. On-demand construction, exact-ID selection, type/test inclusion,
all-module fallback on partial coverage, current-only freshness and numeric
budgets are concrete proposals for the ordinary contract review. They are not
claims of independently accepted architecture or implemented behavior.

- [ ] Verify completed provider fields, readiness and consumer access.
- [ ] Execute every registered semantic and live-revision case.
- [ ] Prove ready queries use no compiler, source reads or report projection.
- [ ] Prove temporary graph release and no graph work on ordinary updates.
- [ ] Match API, daemon, CLI and MCP answers at one input identity.
- [ ] Keep partial, unavailable, superseded and cancelled outcomes explicit.
- [ ] Pass numeric budgets and Plan 5's binding regression gate.
- [ ] Record exact versions, commands, observations and remaining coverage limits.

Plan authoring, metadata validation and isolated probes establish a reviewable
proposal and feasibility evidence. Feature completion requires iteration 6.
