# Historical alternative: retained module-index memory

**Measured:** 2026-09-12, Node v22.23.2, Linux x64. Supports
[Plan 7](main-plan.md); this is an isolated storage prototype, not integrated
retained-session acceptance evidence. The selected plan proposal builds its
graph on demand; this document preserves measurements of the alternative
maintained design, not implementation requirements.

The subsequent [on-demand comparison](storage-strategy-comparison.md) accounts
for the clarified occasional-query usage and measures construction latency
and the smaller temporary graph that needs no update bookkeeping.

## Result

Storing the map is straightforward. The important implementation work is
correctly replacing edge contributions and publishing them with their facts.
Storage grows with the number of direct module edges and file-to-provider
contributions; transitive reachability is computed on request and not stored.

| Workload | Modules | Direct module edges | Contributing files | File-to-provider contributions | Reverse map and counts | Full maintained index |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Collection Review | 15 | 32 | 36 | 61 | 3.3 KiB | 8.7 KiB |
| Current toolkit | 11 | 28 | 98 | 172 | 2.6 KiB | 15.9 KiB |
| Synthetic, 100 modules | 100 | 1,000 | 500 | 2,000 | 54.4 KiB | 127.1 KiB |
| Synthetic, 1,000 modules | 1,000 | 10,000 | 5,000 | 20,000 | 0.52 MiB | 1.31 MiB |
| Synthetic, denser 1,000 modules | 1,000 | 100,000 | 20,000 | 200,000 | 3.51 MiB | 7.59 MiB |

The full index includes per-file arrays needed to remove old contributions,
not only the reverse map. Several imports from one file to the same provider
contribute one file/provider relation. Several files from one consumer module
to one provider increment the same module-edge count.

The ordinary Plan 5 S100/S1000 generator imports only within each owner, so
those fixtures alone do not stress a module dependency index. The added
synthetic fixtures explicitly introduce cross-module edges with repeated
file contributions.

## Measurement method and limits

The [prototype](probes/memory.mjs) uses ordinary JavaScript Maps and arrays:

```text
reverse: Map<providerModuleId, Map<consumerModuleId, contributingFileCount>>
byFile: Map<filePath, { consumerModuleId, providerModuleIds[] }>
```

Module IDs and file strings reference existing input facts. No source text,
compiler objects, original catalogs or transitive closures are copied into
the index. The prototype deduplicates each file's providers on construction.

Inputs are allocated before the baseline. After warmup, each sample retains
4–64 independent indexes, forces garbage collection, and divides the heap
delta by the number of indexes. Report the median of five samples; raw
samples are in [project results](evidence/memory-projects.json) and
[synthetic results](evidence/memory-synthetic.json). Repeated copies reduce
noise for small maps. These figures measure additional live JavaScript heap,
not RSS, maximum allocation during an update, or transient request/JSON buffers.
The prototype has not validated incremental removal or concurrency.

The real project inputs came from the current workspace's real analyzer at
HEAD `25cac533497a8fa9f1c120f77443fd9c18cb8ca0`, using resolved access targets,
original owners, forwarding owners and owned description-file inputs.
[Captured graph inputs](evidence/memory-inputs.json) include the analysis
input identities and keep the measurement reproducible if those projects grow.
This extractor is for counting memory inputs; the definitive edge semantics
remain in [contracts.md](contracts.md). The live implementation must use Plan 5's
explicit shim dependencies and coverage rules.

The likely cost is kilobytes for the present toolkit and around 1–2 MiB for
the illustrated 1,000-module graph with 10,000 direct edges. File fan-in and
graph density matter more than module count alone. These are measured
prototype estimates; integrated session overhead and peak memory still need
the integrated acceptance cases. The earlier 16 MiB serialized retained-graph
proposal is superseded by the on-demand limits in [acceptance.md](acceptance.md);
it is not a current requirement or a measured RSS limit.

## Reproduction

The storage measurement needs only Node; use a new output path for its result:

```sh
node --expose-gc docs/plans/iteration-7-affected-modules/probes/memory.mjs \
  docs/plans/iteration-7-affected-modules/evidence/memory-inputs.json \
  /tmp/affected-memory-results.json
```

To refresh the real-project graph inputs, use the analysis checkout and its
installed dependencies, then measure the resulting JSON:

```sh
node --import tsx docs/plans/iteration-7-affected-modules/probes/memory-inputs.mts \
  /path/to/toolkit /tmp/affected-memory-inputs.json
```
