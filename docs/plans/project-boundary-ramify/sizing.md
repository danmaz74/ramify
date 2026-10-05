# Context bounds and iteration discipline

**Status:** planning assessment, not a measured execution estimate.

The source inventory during authoring found 152 TypeScript files / 1,739,413
bytes in the current reference harness, 26 / 229,122 bytes in Project and
41 / 585,103 bytes in TypeScript. Loading the entire harness would exceed the
intended context allowance. Iteration read-first lists therefore name entry
points, contracts and bounded case slices, not entire source trees.

| Iterations | Context boundary |
| --- | --- |
| 1 | Contract/specification and baseline review; no runtime implementation. |
| 2–4 | Parser, one path-ownership provider and mechanical provenance migration are separate receipts. Iterations 2 and 3 also carry the mechanical schema-identifier migrations of their first shape changes. |
| 3A–3B | The root marker is two receipts. 3A owns the parser field and the mechanical migration of 2 committed roots, 11 shared generators and about 62 literal sites in 34 further files; 3B owns selection, resolution reuse and validity in Project. Enforcement alone cannot pass a gate while any root is unmarked, and the migration alone is a toolkit-wide edit, so the migration lands first, without enforcement, and each candidate passes its gate. The inventory is in the 3A brief so neither agent rediscovers it. |
| 5–7 | Provider access for root scripts, severing analyzed imports into the harness tree and declarations/configuration are separate. The harness is not relocated and its bodies are not read beyond the helpers root scripts import. |
| 8–11 | Discovery activation, resolution, exposure rejection and batch decisions each have independent expected fixtures. Iteration 8 also owns the modularity producer and three schema advances. |
| 12–14 | Observation, retained recomputation and affected projection are separate ownership responsibilities. |
| 15–18 | Context synchronization, daemon transport/watching, CLI and projections each have their own boundary tests. |
| 19–21 | Package/teaching migration, executable qualification and packed delivery are separate. |

Each slice targets one 250k-token context including tool results and verification
evidence. Expose the next owner only to its fixed predecessor receipts, relevant
contracts, source entry points and case rows. Store long test output/measurements
as primary artifacts and bounded excerpts. Do not inline the whole suite or
catalog in a handoff.

If a slice needs a new responsibility or cannot fit the context, revise its
bounded ownership/deliverables before execution rather than silently extending
it. Splitting must preserve case IDs and dependency order; substantial acceptance
defects reopen the producing iteration and invalidate its consumers' receipts.
The 23-entry manifest schedules no parallel execution.
