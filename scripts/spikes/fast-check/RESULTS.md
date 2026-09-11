# Retained-session spike: results

**Date:** 2026-09-11. **Status:** spike evidence, not acceptance evidence. One
machine, one branch, no archived recipe, no reviewed budgets. It answers one
question from the [retained-session proposal](../../../docs/analysis/fast-incremental-checks-retained-session.md):
can a warm TypeScript server with retained per-file facts answer an agent's
post-write hook in tens of milliseconds while its answer equals a fresh batch
check of the same inputs.

Exactness is established; the latency target is reached on the reference
project and missed on the synthetic ones. Every revision the spike published
equalled a fresh batch analysis of the same disk state, in all 56 audits it
ran across four fixtures. A body edit that moves no declaration is answered in
59 ms on the reference project, and a real hook process around it costs 78 ms
end to end. Three whole-project computations survive inside the revision step,
and they are what keeps the larger fixtures out of budget: the export catalog,
project acquisition, and linking with the model.

## Setup

Branch `spike/fast-check-retained-session`, based on
`workflow/iteration-2-resident-verification` at 6ac9dc0. Linux x64, Node
v22.23.2, TypeScript 7.0.2, built toolkit in `dist/`.

| Commit | What it carries |
| --- | --- |
| `bb484a1` | The proposal and the fast-check probes, copied into the branch |
| `b62cab0` | The engine changes in `typescript` and `model` (step 1) |
| `94f149c` | `session.ts`, `serve.ts`, `hook.ts`, `audit.ts`, `bench.ts` (step 2) |
| `b8ec54d` | `hookbench.ts`, the in-place body edit, the single-audit mode |
| `8d4c4e0` | Each benchmark repetition restarts from the restored files |
| `7bc2625` | This report and the raw results (step 4) |
| `00b4303` | `driver.ts` and its wiring behind `RAMIFY_SPIKE_DRIVER` (step 5) |

Fixtures: the reference example `examples/collection-review` (15 owners, 54
owned source files, 89 originals, 294 accesses, 817 compiler program files) and
the synthetic S100, S500 and S1000 fixtures from
`scripts/measurements/materialize.ts`, materialized under `.reference-work/`.
Raw results are in `results/`.

Reproduce with

```sh
npm ci && npm run worktree:prepare && npm run build
npx tsx scripts/spikes/fast-check/bench.ts reference --repeats 10 --audit first
npx tsx scripts/measurements/materialize.ts .reference-work/S100 S100
npx tsx scripts/spikes/fast-check/bench.ts S100 --repeats 10 --audit first
node scripts/spikes/fast-check/hookbench.ts --iterations 30 --cycles 200
```

## Step 1: engine changes and their effect

Three changes, all backward compatible, all in the toolkit's own owners.

**`NamespaceUses` defers and filters its symbol queries.** The class used to ask
the checker for the symbol of every identifier in a file when it was
constructed. Only an identifier spelled like the binding being resolved can
reference that binding, so the class now builds a syntactic index of identifiers
by spelling on first use, and resolves one spelling at a time through the array
overload of `getSymbolAtLocation`. A file whose bindings carry no namespace
costs no identifier query at all, and a namespace import costs one batched call.
The shorthand-property and local export-specifier readings are unchanged, so the
grouping still reaches the binding the checker reaches.

Whole-project `collectAccesses` on a warm server, measured with
`scripts/probes/fast-check/warm-compiler-stages.mjs` on this machine before and
after the change:

| Project | Before | After |
| --- | ---: | ---: |
| Reference, cold checker | 646-654 ms | 155-156 ms |
| Reference, warm server | 481-577 ms | 111-117 ms |
| Toolkit, cold checker | 5,160 ms | 895 ms |
| Toolkit, warm server | 4,986-5,213 ms | 699-714 ms |

`buildCatalog` is unaffected, as expected: 45-56 ms before and 56-77 ms after on
the reference, 374-402 ms before and 350-357 ms after on the toolkit, inside
run-to-run variation.

**`collectAccesses` accepts an optional `only` set** of root-relative owned
source paths. Resolution, the catalog and the compiler program stay
whole-project; only the interpretation loop is restricted. Each selected file
then yields exactly the accesses and coverage notes a whole-project pass yields
for it, because every note an interpreted file produces is located in that file.

**`decisions.ts` and `canonicalOrigin` index their lookups.** A model's
originals and exposures are indexed by canonical identity, and a module list by
module identity, both on first use and keyed by the object, keeping the first
record and the declared order of any repeated identity so an indexed lookup
answers exactly what the previous scan answered. The index spells identities
directly rather than revalidating them, which keeps the existing
`decision-lookups` test's bound of two `originalKey` calls per decision.
Measured with `scripts/probes/fast-check/decide-timing.mjs` over the same saved
reports, before and after:

| Project | Whole-project decide, before | After | Per resolved selection, before | After |
| --- | ---: | ---: | ---: | ---: |
| Reference, 294 accesses | 45.1 ms | 19.9 ms | 0.190 ms | 0.052 ms |
| Toolkit, 2,746 accesses | 1,842 ms | 125-129 ms | 0.927 ms | 0.046 ms |

`buildCatalog` was left whole-project. Its export resolution is a fixed point
over the whole file set: `resolveExports` grows star-export names to a fixed
point, resolves every selection graph against the completed name sets, and then
propagates incompleteness until it settles. A restricted catalog would not have
been exact without redesigning that fixed point, which is beyond a spike. The
spike measures what keeping it whole-project costs; see the per-file catalog
verdict.

**Exactness of the engine changes.** The reference project's batch report is
byte-identical before and after the three changes once run identifiers are
replaced (1,641,122 bytes both times). `check:self` passes with no findings
(11 owners, 229 source files, 2,746 accesses). The focused Vitest files for the
`typescript`, `model` and `analysis` owners pass: 20 files, 356 tests.

## Step 2: the retained session

`scripts/spikes/fast-check/session.ts` holds, per project:

- the warm compiler with exactly one live snapshot, the synthetic configuration
  and the resource witness as virtual files and ordinary filesystem reads for
  everything else;
- the observed content identity of every input the acquisition captured;
- the inventory, the areas, the whole catalog split into per-file export
  descriptions, per-file access facts, the linked descriptions, the model, and
  one decision and diagnostic set per access;
- reverse indexes from canonical original to accesses and from owned target file
  to owned importing files.

The revision step classifies each changed path, tells the compiler exactly what
changed and disposes the previous snapshot at once, re-extracts the changed
files through `only`, compares the results with the retained ones by value
ignoring positions, and recomputes only what the comparison can reach:

- **unchanged surface**: the file's export description, every original and the
  file's own access facts are equal including positions. Nothing else follows.
- **source**: the changed files are re-interpreted, together with every owned
  importer of a file whose export description changed. When an original's
  identity, kind or declaration evidence changed, the model is rebuilt and the
  accesses selecting the changed originals are decided again, alongside the
  accesses of every file whose facts changed.
- **description**: a `module.ramify` or README edit reacquires the project and
  relinks, with no compiler call unless owned source changed in the same batch.
- **broad**: a created or deleted owned file, a configuration or dependency
  change, or an unknown path recomputes everything on the retained compiler.

`serve.ts` drives the session from the branch's `createFilesystemWatcher()` and
answers hook requests over a Unix domain socket; `hook.ts` is the post-write
client, which hashes the files it names and exits 0, 1 or 2. `audit.ts` compares
a published revision with a fresh `analyzeProject` run over the same disk state,
field by field.

## Step 3: measurements

All figures are medians. The reference and S100 are 10 repetitions of the whole
sequence; S500 and S1000 are 3. Every repetition opens a fresh session and
restores the fixture afterwards, so a sequence never starts from the previous
repetition's edits. Times are the session's own work: no process start, no
transport.

### Reference project

Cold open: 781 ms. A fresh batch check of the same project takes 4.2-5.6 s.

| Edit class | Path | median | min | max | snapshot | acquire | catalog | access | link | decide | files | accesses |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| body edit, moves declarations | source | 78.6 | 57.8 | 120.6 | 2.0 | - | 49.1 | 0.7 | 20.2 | 1.1 | 1 | 2 |
| body edit in place | unchanged-surface | 58.7 | 44.8 | 82.3 | 1.8 | - | 51.5 | 1.0 | - | - | 1 | 0 |
| import an exposed symbol | source | 183.2 | 155.5 | 204.7 | 93.3 | - | 53.0 | 6.9 | 23.8 | 1.1 | 3 | 4 |
| add an export | source | 83.6 | 75.7 | 99.7 | 1.9 | - | 48.3 | 7.0 | 22.0 | 0.8 | 3 | 0 |
| import that violates exposure | source | 183.8 | 161.9 | 208.6 | 94.2 | - | 51.3 | 6.6 | 22.3 | 1.5 | 3 | 5 |
| remove the violating import | source | 174.8 | 150.4 | 233.0 | 94.3 | - | 53.4 | 5.2 | 23.1 | 1.0 | 3 | 4 |
| description removes an exposure | description | 292.2 | 258.1 | 363.2 | - | 250.4 | - | - | 20.4 | 18.3 | 54 | 295 |
| description reverted | description | 272.1 | 241.9 | 374.5 | - | 239.0 | - | - | 21.4 | 12.4 | 54 | 295 |
| create an importing file | broad | 525.5 | 458.6 | 583.8 | 97.7 | 229.4 | 57.7 | 95.4 | 26.1 | 12.7 | 55 | 296 |
| delete that file | broad | 515.4 | 443.9 | 584.7 | 100.3 | 231.4 | 54.4 | 91.0 | 26.3 | 15.4 | 54 | 295 |
| README edit | description | 287.6 | 263.2 | 327.0 | - | 246.6 | - | - | 25.4 | 16.1 | 54 | 295 |
| configuration touch | broad | 580.0 | 504.1 | 611.0 | 131.8 | 243.6 | 50.2 | 99.4 | 25.8 | 18.0 | 54 | 295 |

Each step also asserted the outcome it was designed to establish, independently
of the audit, and every assertion held in every repetition: the violating import
added exactly one finding and removing it removed exactly that one; removing the
vocabulary exposure produced 55 denials at the importers and reverting the
description removed all 55; the created file entered the inventory and the
deleted file left it; the configuration touch took the broad path; and the
in-place body edit took the unchanged-surface path.

### S100

100 owners, 1,100 owned source files, 1,100 originals, 1,900 accesses, 1,164
program files. Cold open: 2,775 ms; a fresh batch check takes 5.1 s.

| Edit class | Path | median | snapshot | acquire | catalog | access | link | decide | files | accesses |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| body edit, moves declarations | source | 539.4 | 3.2 | - | 397.1 | 6.0 | 95.9 | 5.1 | 1 | 1 |
| body edit in place | unchanged-surface | 442.5 | 2.1 | - | 417.7 | 4.5 | - | - | 1 | 0 |
| add an export | source | 575.6 | 2.6 | - | 439.4 | 10.8 | 92.1 | 4.5 | 2 | 0 |
| import that violates exposure | source | 644.1 | 65.8 | - | 440.3 | 11.0 | 89.6 | 5.1 | 2 | 4 |
| remove the violating import | source | 614.2 | 64.8 | - | 418.2 | 9.1 | 100.1 | 5.2 | 2 | 3 |
| description adds an exposure | description | 1,621.2 | - | 1,407.3 | - | - | 101.1 | 96.3 | 1,100 | 1,900 |
| description reverted | description | 1,557.6 | - | 1,369.3 | - | - | 92.3 | 88.2 | 1,100 | 1,900 |
| create an importing file | broad | 2,499.6 | 85.0 | 1,358.2 | 425.8 | 417.9 | 89.7 | 92.5 | 1,101 | 1,901 |
| delete that file | broad | 2,498.5 | 85.5 | 1,377.0 | 408.7 | 380.3 | 96.4 | 91.4 | 1,100 | 1,900 |
| README edit | description | 1,542.8 | - | 1,356.3 | - | - | 90.3 | 86.8 | 1,100 | 1,900 |
| configuration touch | broad | 2,536.3 | 132.9 | 1,430.5 | 419.6 | 397.4 | 91.7 | 82.8 | 1,100 | 1,900 |

### S500 and S1000

500 owners, 5,500 owned source files, 9,500 accesses, 5,564 program files; and
1,000 owners, 11,000 owned source files, 19,000 accesses, 11,064 program files.
A fresh batch check takes 20.5 s and 40.3 s. Cold open: 10.5 s and 27.1 s.

| Fixture | Edit class | Path | median | snapshot | catalog | access | link | decide | files | accesses |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| S500 | body edit, moves declarations | source | 2,390.4 | 13.0 | 1,752.2 | 20.7 | 406.7 | 23.8 | 1 | 1 |
| S500 | body edit in place | unchanged-surface | 1,721.5 | 11.3 | 1,611.2 | 20.4 | - | - | 1 | 0 |
| S500 | add an export | source | 2,240.8 | 9.9 | 1,690.8 | 41.3 | 409.5 | 21.7 | 2 | 0 |
| S1000 | body edit, moves declarations | source | 6,483.9 | 43.6 | 4,998.1 | 55.4 | 1,141.0 | 59.8 | 1 | 1 |
| S1000 | body edit in place | unchanged-surface | 5,279.6 | 27.8 | 4,986.5 | 63.3 | - | - | 1 | 0 |
| S1000 | add an export | source | 6,286.2 | 25.1 | 4,858.6 | 108.9 | 1,012.5 | 51.5 | 2 | 0 |

### The hook, end to end

A real server process holds the session and the watcher; every sample writes the
file and spawns a real `node hook.ts` process. Reference project, 30 samples of
each kind. A bare `node -e 0` on this machine takes 28.4 ms, which is the floor
under any hook.

| Case | median | p95 | max | session update | waited in the session |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hook races the watcher (written, then run at once) | 130.5 ms | 160.1 ms | 164.0 ms | 51.7 ms | 51.9 ms |
| Revision already published (250 ms after the write) | 78.0 ms | 89.8 ms | 97.2 ms | 52.6 ms | 0.1 ms |

All 60 samples exited 0 with outcome `checked`; 59 of them took the
unchanged-surface path and the first took the source path, because it was the
write that introduced the pad line and therefore moved declarations. The
difference between the two cases is the session's own update: when the hook
arrives first it flushes the debounce window and waits for exactly one update;
when the watcher has already published, the hook is answered from the current
revision and its whole cost is process start and the socket round trip, about
50 ms above the bare Node floor.

A further 200 alternating body-edit and revert cycles, each answered by a real
hook process, had a median wall time of 133.5 ms and a p95 of 149.9 ms; those
edits move declarations, so they take the source path.

### Memory

Reference project, resident sizes from `ps`:

| Point | Session process | Compiler server (its child) |
| --- | ---: | ---: |
| At open | 55.8 MiB | 112.9 MiB |
| After 260 updates (60 hook samples and 200 alternating cycles) | 54.2 MiB | 128.9 MiB |

Exactly one snapshot is live at a time and the previous one is disposed inside
the same update, which is what keeps the compiler's growth to 16 MiB over the
260 edits. This matches the proposal's own probe: undisposed snapshots hold
memory the server never returns.

## Audit outcomes

Every audit runs a fresh `analyzeProject` over the current disk state and
compares the session's revision with it: the inventory, the areas, the catalog's
files, originals and coverage, the model, the accesses, the results with their
decisions, the diagnostics and the report coverage.

| Fixture | Audits | Equal | Batch run, median |
| --- | ---: | ---: | ---: |
| Reference | 25 | 25 | 4,511 ms |
| S100 | 23 | 23 | 5,136 ms |
| S500 | 4 | 4 | 19,653 ms |
| S1000 | 4 | 4 | 51,212 ms |
| Total | 56 | 56 | |

The reference and S100 were audited after every step of the first and last
repetition; S500 and S1000 after every step of the first. No difference was
found in the final runs, in any field, for any edit class, including the
description edit that adds 55 denials and the create and delete steps.

One audit failure was found and fixed during development, and it is the most
instructive result in this spike. A body edit that only moves a declaration left
the retained decisions citing the old declaration positions, because the session
spelled the canonical original identity two different ways: the reverse index
from original to accesses used an array spelling and the change comparison used
an object spelling, so no access was re-decided. The revision looked correct in
every field the session itself computed and differed from the batch run only in
`results[].decisions[].original.declarations`. A surface comparison that ignores
positions is therefore necessary but not sufficient: positions are evidence that
the decisions carry, and an original whose declarations moved must still refresh
the accesses that select it.

## The unchanged-surface path

The unchanged-surface path fires exactly when it should and covers the workload
that matters. In the scripted sequence it is one class out of twelve, because
the sequence deliberately exercises every other kind of change. In the hook
workload, which writes a changed value inside a function body, 59 of 60 writes
took it. It is also the cheapest path by a wide margin, because it skips the
access re-interpretation, the link, the model and every decision: 59 ms against
79 ms on the reference, 443 ms against 539 ms on S100, 1.72 s against 2.39 s on
S500, 5.28 s against 6.48 s on S1000.

What it does not skip is the catalog.

## The per-file catalog verdict

The whole-project `buildCatalog` is the dominant remaining cost of a one-file
edit at every size, and it scales with the project rather than with the change:

| Fixture | Owned source files | Catalog in an unchanged-surface revision | Per owned file | Whole revision |
| --- | ---: | ---: | ---: | ---: |
| Reference | 54 | 51.5 ms | 0.95 ms | 58.7 ms |
| S100 | 1,100 | 417.7 ms | 0.38 ms | 442.5 ms |
| S500 | 5,500 | 1,611.2 ms | 0.29 ms | 1,721.5 ms |
| S1000 | 11,000 | 4,986.5 ms | 0.45 ms | 5,279.6 ms |

Against the proposal's starting targets of 100 ms for the reference, 300 ms at
100 owners and 1 s at 1,000 owners, the whole-project catalog alone consumes
half the reference budget, overruns the 100-owner budget on its own and
overruns the 1,000-owner budget five times over. The verdict is unambiguous:
**per-file export descriptions are required from the first iteration**, and the
proposal's open decision 2 should be settled that way rather than starting with
a whole-project catalog. The fixed point in `resolveExports` has to be turned
into a dependency-driven recomputation over the files a change can reach, which
is the same dependency information the access invalidation already needs.

The two other whole-project computations rank behind it:

- **Project acquisition** (`readProject`) costs 230-250 ms on the reference,
  1.36-1.43 s on S100. It runs on every description, README, create, delete and
  configuration change, and it alone overruns the proposal's 200 ms description
  budget on the reference. A local inventory update for a description or README
  edit, and a directory-scoped rescan for a created or deleted file, are
  required.
- **Link and model** cost 20-26 ms on the reference, 90-101 ms on S100, 407 ms
  on S500 and 1.0-1.1 s on S1000. They are rebuilt whenever any declaration
  moved, because the model carries declaration evidence. Either the model's
  declarations become patchable per original, or the rebuild has to become
  proportional to the changed originals.

## Problems found

1. **A changed import list makes `updateSnapshot` expensive.** A body edit costs
   1.8-3.2 ms on the reference and S100, but adding or removing an import
   statement in the same file costs 65-94 ms, and regenerating the synthetic
   configuration costs 85-133 ms. The compiler redoes module resolution for the
   file; the proposal's 1.5 ms figure only covers edits that leave the import
   list alone.
2. **`collectAccesses` keeps a per-call setup proportional to the project even
   with `only`.** Interpreting one file costs 0.7 ms on the reference, 4.5-6 ms
   on S100, 20 ms on S500 and 55-63 ms on S1000, because each call builds maps
   over every catalog file and every original and sorts the whole inventory
   before interpreting anything. The per-call setup has to be hoisted into the
   session and maintained incrementally, or the same scaling will reappear once
   the catalog is per-file.
3. **The session does not observe the compiler's own filesystem reads.** It
   reads the disk directly for speed, so its observation set is what the
   acquisition captured. A batch run also captures the compiler's reads, absence
   probes and directory listings, so the session cannot claim an equal `inputId`
   and cannot notice a dependency or declaration shim changing outside its
   observed set. The proposal's background sweep is not optional; it is what
   closes this gap.
4. **A hook may name a path the session does not observe.** The spike answers
   `checked` for such a path after one update rather than reporting that it was
   not checked. A real endpoint must answer `unobserved-input`.
5. **The watcher adds its own latency to the update it triggers.** The same
   unchanged-surface update measured 58.7 ms when the benchmark drove it
   directly and about 52 ms inside the server, but the hook that raced the
   watcher waited 51.9 ms on top of its own 78 ms of process cost. The
   debounce window and the watcher's directory rescans belong in the budget.
6. **Node's own type stripping does not remap `.js` specifiers to `.ts`.** The
   session runs under tsx; only the dependency-free hook client runs on bare
   Node. This is a spike packaging detail, not a finding about the design.
7. **Positions are carried into decisions.** See the audit failure above.

## Recommendations for the real plan

1. **Keep the compiler warm, with exactly one live snapshot per session,
   disposed inside the update that replaces it.** Confirmed: 260 revisions cost
   the server 16 MiB, and a body edit's snapshot update is 2-3 ms.
2. **Take the `NamespaceUses` change into the engine now.** It is
   backward compatible, byte-identical on the reference report, and it is what
   makes per-file re-extraction affordable: 0.7 ms for one reference file
   against 111-117 ms for a whole-project pass.
3. **Take the decision indexes too.** Whole-project decide falls from 1.84 s to
   0.13 s on the toolkit, and the bounded re-decide of a source edit is under
   1.5 ms everywhere the spike measured.
4. **Settle open decision 2 in favour of per-file export descriptions.** The
   whole-project catalog is the single blocker for the 100, 500 and 1,000 owner
   budgets, and the dependency edges it needs are the same ones access
   invalidation needs.
5. **Make acquisition incremental before promising a description budget.** A
   local inventory update for description and README edits, and a directory
   scoped rescan for created or deleted files, are both required at the
   reference size, not only at scale.
6. **Rebuild the model proportionally, or make declaration evidence patchable.**
   Whole-project linking is affordable on the reference and not at 500 owners.
7. **Budget the hook's process cost separately from the daemon's work.** On this
   machine the floor is 28 ms of bare Node and the measured client costs 78 ms
   end to end with zero daemon work. A 200 ms hook target leaves about 120 ms
   for the daemon, not 200.
8. **Drive updates from the watcher and answer hooks from published revisions.**
   The measured difference is 78 ms against 130 ms for the same edit, and the
   waiting case is entirely the debounce window plus one update.
9. **Keep the built-in audit.** It found the one real defect in this spike, in a
   field no unit test covers, on the first edit class. Run it after every step
   in tests and on idle in the daemon, exactly as the proposal says.
10. **Take the broad path and say so, rather than guessing a bound.** The spike
    takes it for created and deleted files, because a created file can shadow an
    existing resolution and the reach cannot be bounded cheaply. That cost 525
    ms on the reference and 2.5 s on S100, and it was exact.

### Does the session fit behind Plan 2's `AnalysisDriver` port?

It fits, and the spike ran it there; the mismatches are worth naming before the
plan commits to the port as it stands.

`resolve` and `dispose` map directly. `check({ project, setup, previous,
changes })` maps to opening the session for `project` and calling
`update(changes)`, ignoring `previous`: the retained state lives in the session,
keyed by project root, not in the value the caller hands back. That inversion is
the point of the design and the port tolerates it, because `previous` is an
input the driver may ignore.

Three things do not map cleanly.

- The driver must return `IncrementRun.retained`, a `RetainedAnalysis` with
  `inputId`, the captured `inputs`, `bytes` and per-stage product keys. The
  context manager builds its revision fingerprints from it, enforces
  `maxRetainedBytesPerContext` on it and marks the context conservative when it
  is absent. A retained session has no stage-product set and its captured input
  set is smaller than a batch run's, so it would have to synthesize one. The
  honest change is to replace that contract with the session's own revision
  identity and observed input set.
- The driver returns a whole `AnalysisReport` per check, and the context manager
  stores it in history and compares whole reports for reuse. The reference
  report is 1.6 MiB of JSON and the S1000 report is 66 MiB. A session that
  answers in 59 ms should not be serializing and comparing a whole report in
  order to publish, so the revision projection and the findings delta belong in
  the contract.
- Freshness verification reads the captured inputs, so an unobserved path has to
  become an explicit outcome rather than an absent entry.

The spike wired it anyway, synthesizing a `RetainedAnalysis` over the session's
own observed inputs so the measurement could be taken. See step 5.

## Step 5: the session behind the real daemon

`driver.ts` is an `AnalysisDriver` that keeps one session per project root,
ignores the `previous` product set, applies the reported changes and projects
the revision into a batch-shaped report through `ReportDraft`. It is loaded by
`selectResidentDriver` in `src/resident-assembly.ts` when `RAMIFY_SPIKE_DRIVER`
names its compiled module, and `src/daemon-entry.ts` passes the result to
`assembleResidentService`. Nothing else in the daemon or the contexts changed.

`ramify check --root examples/collection-review` through the real daemon, with
the file edited and the watcher given 400 ms to report it:

| Invocation | Driver | Wall time |
| --- | --- | ---: |
| `ramify --version` | none | 43-60 ms |
| First check, cold context | retained session | 1,338 ms |
| Body edit, warm context | retained session | 295-312 ms, median 303 ms |
| No change, warm context | retained session | 301-320 ms |
| First check, cold context | Plan 2 batch sessions | 5,510 ms |
| Body edit, warm context | Plan 2 batch sessions | 5,099-5,698 ms |

Two readings matter. The session-backed driver answers a body edit 17 times
faster end to end than the branch's own driver, which recaptures the project and
restarts the compiler helpers per revision; that is the proposal's central claim
about the Plan 2 engine core, measured through the shipped CLI and transport.
And a check with no change at all costs the same 300 ms as a check with an edit,
so on this path the analysis is not the cost: about 50 ms is CLI startup and the
remaining 250 ms is the connection, the request and a 1.6 MiB report crossing
the socket and being rendered. A hook budget has to account for that separately
from the daemon's work, and the report projection a hook receives should be the
findings delta rather than the whole report.

The wiring is an escape hatch, not a design: `selectResidentDriver` dynamically
imports a path named by an environment variable, and the module it names lives
outside every module source area. `check:self` reports that correctly, as one
`nonliteral-target` analysis limit at `src/resident-assembly.ts:76`, with
`coverage: partial`, no errors and an exit code of 0. That is the model working
as specified, and it is the reason a real driver would live inside a module.

## What the spike did not implement

For the record, so none of this is read as established:

- per-file export descriptions, an incremental inventory, a background sweep, a
  worker thread, deadlines, `cold` and `deadline-exceeded` outcomes, context
  eviction or a memory policy;
- the subtree bound on a description edit: the spike re-decides every access
  after any description or README change;
- the `importers with matching candidates` bound for created and deleted files:
  the spike takes the broad path;
- persistent checkpoints of retained facts, which the proposal already defers;
- an input identity equal to a batch run's. The session reads the disk directly
  and never observes the compiler's own reads, so the report its driver
  publishes carries a different `inputId` and a smaller captured input set than
  a batch report of the same project. Its catalog, model, accesses, results,
  diagnostics and coverage are equal; its input envelope is not.
