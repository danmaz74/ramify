# Maintaining the graph versus building it on demand

**Date:** 2026-09-12. **Requirement clarification:** affected-module queries
will not be invoked by hooks. This compares alternatives for [Plan 7](main-plan.md);
on-demand construction is the proposed design now used consistently in its
main plan, contracts and acceptance cases. This records design evidence, not
independent architecture acceptance or completed implementation.

## Recommendation

Build a temporary reverse module graph inside the analysis worker when an
affected-module query arrives. Traverse it once for the complete seed list,
return the compact result, and release the graph. Use one coherent revision
of Plan 5's already-retained access, ownership, description and coverage facts.
An on-demand query does not mean running a new analysis or reading source files.

For occasional queries this avoids continuous storage and index maintenance
for a modest query cost. No additional dependency facts need to be stored for
the supported graph, provided Plan 5 retains the facts identified in the
[data assessment](data-assessment.md). The query API and its revision guarantee
are needed under either strategy.

## Tradeoffs

| Property | Maintain a live module index | Build only for a query |
| --- | --- | --- |
| Additional graph memory between queries | Retain reverse adjacency, counts and per-file contributions. | None; graph becomes eligible for collection after the request. RSS need not immediately shrink. |
| Work while editing | Replace contributions when dependency facts change; coordinate publication and invalid updates. Unchanged dependency facts can keep the index. | No added module-graph maintenance; use Plan 5's ordinary fact updates. |
| Query work | Traverse the reached adjacency, then order the result. | Scan retained access/description facts, build reverse adjacency, traverse and order the result. |
| Small affected set in a large project | Can visit only the reached part of the index. | Still scans the input facts to build the graph. |
| Correctness burden | Edge reference counts, file deletion, ownership changes, index/fact agreement and revision identity. | Edge interpretation and revision identity; no separately maintained index to become stale. |
| Memory during a query | Existing index plus traversal/output state. | Temporary adjacency plus traversal/output state; no per-file removal records or edge counts needed. |
| Frequent queries | Low query latency amortizes maintenance. | Repeated construction creates more CPU work and allocation. |
| Hook interaction | Maintenance is added to relevant Plan 5 update paths. | No graph work on hooks; an overlapping query can briefly occupy the same worker. |

Both approaches need the same source/type/test/shim edge semantics, coverage
handling, exact module IDs, cancellation, bounded work and current-revision
validation. Both depend on Plan 5's normal startup or synchronization when
the requested facts are not ready. Neither can use the latest checked-file
set as a substitute for transitive impact.

## Prototype timings

The [query prototype](probes/query-strategies.mjs) compared traversal over an
already-built map with scanning retained-shaped facts, constructing a map and
traversing it. Unlike the earlier memory probe, this starts with every source
access, including same-owner and external occurrences, not just precomputed
file-to-provider pairs. Each synthetic foreign access includes a target and
two selected bindings; each file also has a same-owner occurrence. The real
project records were extracted from the current analyzer.

Node v22.23.2, Linux x64; 20 warmups, 200 measured queries, alternating order.
All answers were checked for equality outside the timed intervals. Real
projects use the seed with the largest closure; synthetic rings reach every
module. Times below are milliseconds, median / p95.

| Workload | Source access records | Module edges | Traverse retained map | Build and traverse on demand |
| --- | ---: | ---: | ---: | ---: |
| Reference, 15 modules | 294 | 32 | 0.005 / 0.008 | 0.027 / 0.090 |
| Toolkit, 11 modules | 2,744 | 28 | 0.002 / 0.002 | 0.136 / 0.157 |
| Synthetic, 100 modules | 2,500 | 1,000 | 0.039 / 0.064 | 0.320 / 0.426 |
| Synthetic, 1,000 modules | 25,000 | 10,000 | 0.416 / 0.538 | 3.290 / 3.859 |
| Denser synthetic, 1,000 modules | 220,000 | 100,000 | 2.112 / 2.350 | 32.260 / 33.955 |

These are isolated algorithm measurements, not complete CLI/MCP response
times. They exclude synchronization, worker/IPC scheduling, scope/error
processing, output envelopes and incremental maintenance. The facts preserve
the dependency-bearing structure; they do not reproduce every incidental
object in a running compiler/session. Real extraction is preparatory work for
the probe, not part of the proposed runtime query.

## Memory comparison

The on-demand builder needs only `Map<provider, Set<consumer>>`. It does not
need contribution reference counts or per-file removal lists. Existing
ownership maps, ID strings and source facts are reused in both designs.

| Workload | Maintained index between queries, including bookkeeping | On-demand temporary graph |
| --- | ---: | ---: |
| Current toolkit | 15.9 KiB | 2.2 KiB |
| 100 modules, 1,000 edges | 127.1 KiB | 41.9 KiB |
| 1,000 modules, 10,000 edges | 1.31 MiB | 0.40 MiB |
| 1,000 modules, 100,000 edges | 7.59 MiB | 2.54 MiB |

These are GC-settled live-heap measurements, excluding temporary allocation
peaks and result/serialization buffers. The maintained-index values come from
the [earlier storage probe](memory-assessment.md). Temporary graph memory is
released logically after use and physically reclaimed when GC runs. Concurrent
queries must stay inside the worker's request and memory bounds.

## Cost and possible later optimization

Ignoring common synchronization and output costs, let Q be the number of
queries, B the cost of building the graph, T the traversal cost, and U the
total added index-maintenance work across revisions. Maintaining costs roughly
`U + Q*T`; rebuilding costs `Q*(B+T)`. The probe has not measured U, so it does
not establish an exact break-even query rate. Infrequent queries favor avoiding
the maintenance machinery, especially while Plan 5 is still being implemented.

If repeated queries against the same revision later become common, a bounded
lazy cache is an intermediate option: build on first use, reuse for that exact
revision, discard on a new revision or inactivity. It keeps no per-file edge
counts and never updates edges incrementally. Add it only after observed query
usage justifies the retained memory and cache lifecycle.

## Effect on the implementation plan

The [contracts](contracts.md) now use an on-demand worker projection. There
is no per-file contribution store, reference counting or module-index audit.
Revision-edit cases remain: querying newly committed facts must produce the
new closure after additions, removals and ownership changes.

[Acceptance](acceptance.md) measures scan/build plus traversal, temporary heap,
release, cancellation and overlapping updates. It requires zero compiler
calls, source reads or whole-report projections on a ready query and zero
module-graph work on ordinary updates. One serialized query holds a coherent
read of the worker's facts; only its compact answer crosses the boundary.

Lazy caching remains a possible later optimization, outside this plan.

## Evidence and reproduction

[Raw results](evidence/query-strategies.json) and
[captured query inputs](evidence/query-inputs.json) preserve the measurement.
Inputs came from workspace HEAD `25cac533497a8fa9f1c120f77443fd9c18cb8ca0` and
include analysis input identities. Run from the toolkit root:

```sh
node --expose-gc docs/plans/iteration-7-affected-modules/probes/query-strategies.mjs \
  docs/plans/iteration-7-affected-modules/evidence/query-inputs.json \
  /tmp/affected-query-strategies.json
```

To refresh the real input records from a toolkit checkout with dependencies:

```sh
node --import tsx docs/plans/iteration-7-affected-modules/probes/query-inputs.mts \
  /path/to/toolkit /tmp/affected-query-inputs.json
```
