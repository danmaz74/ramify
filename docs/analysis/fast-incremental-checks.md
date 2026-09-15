# Fast incremental checks for agent hooks

> **Superseded on 2026-09-14.** The implemented retained session and the hook
> check of [Plan 5](../plans/iteration-5-fast-incremental-checks/main-plan.md),
> closed by its [completion report](../plans/iteration-5-fast-incremental-checks/iterations/iteration13-results.md),
> replace this proposal. [Daemon and analysis](../architecture/daemon.md#implemented-retained-session)
> and [memory lifecycle](../architecture/memory-lifecycle.md#retained-sessions-and-their-levels)
> state what is implemented. This document is kept for its evidence and its
> reasoning; where the two differ, the architecture documents and the plan hold.

**Date:** 2026-09-11. **Status:** Design proposal for review. The
[fast incremental check requirement](../architecture/daemon.md#fast-incremental-checks)
and the [pending roadmap deliverable](../roadmap.md#pending-fast-incremental-checks)
own the requirement and its scheduling. This document proposes an
implementation and records the evidence behind it. It establishes no
implemented capability, and its latency figures other than measurements are
estimates.

The daemon stays resident so that a check is fast when one or a few saved files
change. The main use case is agent post-write hooks: after a coding agent writes
a file, its host runs a hook that checks the change and returns violations to
the agent before it continues. The hook runs on every write and the agent waits
for it. This proposal aims at roughly 300 ms end to end for a one-file edit in a
warm context, a target to confirm by measurement.

## Evidence

The investigation used `main` at `256b35c` for the batch engine and the branch
`workflow/iteration-2-resident-verification` at `6ac9dc0` for Plan 2's resident
implementation and measurements. Paths prefixed `branch:` exist only on that
branch. TypeScript is the pinned `typescript@7.0.2` package.

### How a check runs today

A batch check creates one analysis session, runs every stage and disposes the
session; [run-analysis.ts](../../subs/analysis/src/run-analysis.ts) keeps
nothing between runs. The stages are registry, acquisition, parse, catalog,
link, access, decide and report.

| Stage | Work | Scope |
| --- | --- | --- |
| Acquisition | Captures files, runs a separate configuration helper and walks modules. | Whole project |
| Parse | Parses each `module.ramify`. | Per description |
| Catalog | Builds effective exports and original bindings, including star and forwarding chains. | Whole program |
| Link | Builds exposures, tagged originals and the model. | Whole project |
| Access | Extracts supported accesses for every file and resolves them against the catalog. | Per file, global lookups |
| Decide | Applies the model to each access. | Per access |
| Seal and report | Re-stats and re-hashes every captured input, then assembles the report. | Whole project |

TypeScript 7 is the native Go compiler, reached through its synchronous API.
Each check starts a Node helper
([compiler-helper.ts](../../subs/analysis/subs/typescript/src/compiler-helper.ts)),
which starts a native `tsc --api` process, opens one synthetic project listing
every owned file (`compiler-helper.ts:140`) and closes both at the end
(`compiler-helper.ts:157-158`). A second native process parses the compiler
configuration ([configuration-helper.ts](../../subs/analysis/subs/project/src/configuration-helper.ts)).
Every compiler file read passes from the native process through the helper to
the parent's capture.

Some facts need the program: resolution under the configuration, effective
exports (stars, merging, `export =`, resource shims), alias-to-original
resolution, merged value/type kinds, runtime member presence and namespace-flow
tracking, which queries the symbol of every identifier
([namespace-uses.ts](../../subs/analysis/subs/typescript/src/namespace-uses.ts)).
Import and export forms, names, locations and type-only markers are syntactic.

Decisions use linear scans. `requireOriginal` and the exposure filter search
all originals and exposures for every access
([decisions.ts](../../subs/analysis/subs/model/src/decisions.ts), lines 12-26).
No reverse index exists from a file or original to its importers.

### Measured cost

Plan 2's iteration 1 probe (`branch:scripts/probes/results/warm-recompute.json`)
timed twenty in-process full recomputes per workload with no retained state.
Medians in milliseconds:

| Stage | Reference | 100 owners |
| --- | ---: | ---: |
| Acquisition | 172 | 884 |
| Catalog, including helper startup and program build | 2,134 | 1,561 |
| Link | 16 | 84 |
| Access, including helper disposal | 621 | 668 |
| Decide | 48 | 1,597 |
| Seal and dispose | 326 | 331 |
| Report assembly | 115 | 585 |
| **Full call** | **3,442** | **5,723** |

The resident measurement archive
(`branch:scripts/measurements/results/resident-2026-09-11T12-29-49.293Z-*.json.gz`)
records end-to-end CLI medians through the daemon:

| Workload | Reference | 100 owners |
| --- | ---: | ---: |
| Unchanged inputs | 1,792 | 2,901 |
| README edit | 3,306 | 5,066 |
| Exposure edit | 3,393 | 7,150 |
| **Source edit** | **6,701** | **10,777** |
| Configuration edit | 6,392 | 9,848 |

The fixed cost of a trivial request is small. `ramify daemon status` takes a
median of 85.5 ms as a full CLI process; the IPC round trip is 0.46 ms and the
service work 0.05 ms. Loading the `./client` entry takes roughly 40 ms of that.

### What Plan 2 retains

Plan 2 reuses whole stage products keyed on their inputs
(`branch:subs/analysis/src/retained-products.ts`). Catalog and access are reused
only when the dependency key over every captured source input is unchanged
(`branch:subs/analysis/src/run-analysis.ts:128-148`), so any source edit reruns
catalog, access, link and decide for the whole project with freshly started
helpers. With every stage reused, an unchanged check still re-hashes all
inputs, seals and sends a 1.65 MB report, which accounts for the 1.8 s floor.

Compiler state is deliberately not retained. Review point RP-2 chose stage reuse
over "one long-lived helper snapshot per context" because "the helper contract
is one-shot and its close guarantees are weak". Its deferral requires a reviewed
adapter contract before any long-lived helper is added. The recorded
`compilerStateTrigger` has fired: source edits measured 6,701 ms against a
4,500 ms target and 10,777 ms against 8,000 ms, advisory under the current
performance policy.

### What the installed TypeScript API offers

The TypeScript 7.0.2 API supports a project that stays open while files change
(`node_modules/typescript/dist/api/`):

- `updateSnapshot(params)` accepts `fileChanges`, either a
  `FileChangeSummary { changed, created, deleted }` or `{ invalidateAll: true }`
  (`proto.d.ts:84-96`).
- Projects opened through `openProjects` are "ref-counted and persist across
  snapshots until closed" (`proto.d.ts:58-61`).
- The response reports `SnapshotChanges` per project (`proto.d.ts:107-131`), and
  the client's source file cache keeps unchanged trees through
  `retainForSnapshot` (`sourceFileCache.d.ts:58`).
- `collectTiming` and `getTimingInfo()` report server time per request
  (`sync/api.d.ts:50-53`).

The typings do not show whether the Go server reuses checker work across
snapshots or only parsed files. Symbols and types belong to one snapshot.
Ramify's own original identifiers are built from paths and bindings, so they
remain stable across snapshots.

## Proposal

The proposal keeps one rule engine. Incremental work re-runs the same
extraction, linking and decision functions as a fresh pass over a smaller,
justified set of files.

### 1. Keep a compiler session warm per context

Each warm context keeps one helper with its project open. A revision sends the
changed, created and deleted files with their content, and the helper applies
them through `updateSnapshot({ fileChanges })`. The helper serves compiler
reads from its own copy of the captured view: full content when the context
opens, changed content afterwards. Configuration is parsed again only when a
configuration input changes, so an ordinary edit starts no process.

The session stays in a separate process because the synchronous API would block
the daemon's event loop. Its adapter contract answers RP-2's concern: a health
check, a deadline on each request, process-group termination, and a new context
generation plus one conservative full recompute after any helper failure. Idle
and eviction policy dispose it like other context state, and its memory counts
toward the context budget.

### 2. Store facts per file and propagate changes

The engine keeps each file's facts: its effective exports and the originals it
defines, its accesses with their resolved targets, its coverage notes, and the
paths its resolution observed as present or absent. It adds three reverse
indexes: file to importers, file to re-exporting files (forwarding and star
dependents), and absent path to the files whose resolution looked for it.

Each file also has an **export signature**: exported names, original
identities, value/type kinds, forwarding targets, resource identities and
export-related issue identifiers. It must include every catalog fact a decision
reads; the equivalence tests below enforce that.

For a change set C:

| Change | Work |
| --- | --- |
| Edits to files in C with unchanged export signatures | Re-extract C's accesses from the new snapshot and re-decide them. The model is unchanged, so link is skipped. |
| An export signature changes | Recompute exports along the re-export chain, re-link, then re-extract and re-decide the importers of every affected original. |
| A file is created or deleted | Re-extract the files whose resolution observed that path, plus the rows above. |
| `module.ramify` edit | Re-parse it and re-link; re-decide the accesses whose originals, tags or exposures changed. Area changes also re-extract the moved files. |
| Configuration, package metadata, shim, registry or uncertain watcher state | Full recompute, as the architecture already permits. |

The common hook edit changes a function body or an import list, so most checks
take the first row: one file re-extracted and a few accesses re-decided.

### 3. Remove whole-project overheads

- **Indexed decisions.** Index the model by original and by exposure. This
  removes the 1.6 s decide cost at 100 owners and also speeds up batch checks.
- **Stat-based synchronization.** Stat every captured path (size, modification
  and change times, inode) and hash only files whose stat changed, plus every
  file the request names. Re-hashing every input is what sets today's 1.8 s
  floor.
- **Compact results.** A changed-file check returns the checked set, its
  findings and project-wide counts. The full report stays in the daemon and can
  be fetched by revision. This also keeps large projects clear of the report
  size limit that the 500- and 1,000-owner workloads exceeded.
- **Preemption.** A synchronized request cancels pending watcher-driven
  reconciliation instead of queuing behind it. The CLI's 6.7 s source-edit
  median against a 4.9 s repeated-edit plateau suggests such queuing today.

### 4. Hook check mode

A hook invokes a lightweight client that names the file it just wrote and
receives a compact answer:

- The request names the changed paths and optionally their hashes; the daemon
  verifies them against the captured view.
- The client enforces a deadline. A missed deadline, a cold context or an
  unavailable daemon produces an explicit "not verified" result, never a pass.
  A cold context starts warming in the background for the next hook.
- A hook never falls back to batch analysis.
- Output names each violation, its location and the failed rule, with the
  missing exposure or tag where that is the cause. Small host adapters, such as
  one for Claude Code post-write hooks, map it to each host's hook format.

### 5. Exactness safeguards

- Randomized edit sequences over the reference project and synthetic fixtures
  compare every incremental result with a fresh batch check of the same inputs
  (DA10, DA11).
- A diagnostic option runs both paths on each check and reports any difference.
- Periodic background verification rebuilds a context fully and compares its
  result with the incremental one.

### Tentative ownership

These placements follow the current tree and need the usual manifest review.

| Owner | Responsibility |
| --- | --- |
| analysis TypeScript child | Long-lived session adapter, snapshot updates, per-file extraction. Compiler objects stay private here. |
| analysis | Per-file fact store, reverse indexes, export signatures, propagation, incremental link and decide. |
| model | Indexed lookups for decisions. |
| project | Stat-based refresh of the captured view. |
| contexts | Session lifetime, generations, preemption and cancellation. |
| daemon and root service | Changed-file check operation and compact result. |
| CLI | Hook mode, deadline and output. Host adapters may live outside the toolkit owners as examples. |

## Expected latency

| Step | Estimate |
| --- | --- |
| Hook process, client import and IPC | about 85 ms (measured) |
| Stat scan and hashing changed files | 5–20 ms (estimate) |
| Snapshot update and one-file extraction | unknown; step 1 of the sequence measures it |
| Indexed decisions and compact reply | under 10 ms (estimate) |

The 300 ms target is plausible if the snapshot update and one-file extraction
stay under about 150 ms on both workloads.

## Risks and open questions

- **Checker reuse.** If the Go server rebuilds all checker state on every
  snapshot, one-file extraction may cost close to a full program check. The
  first probe decides this; lazily computed symbols would keep the cost near
  the changed file.
- **Helper reliability.** A long-lived helper can hang or leak. The adapter
  contract above bounds it, and failure costs one slow recompute, not a wrong
  answer.
- **Memory.** A warm native compiler per context adds resident memory. Plan 2's
  budgets (192 MiB for one warm reference context) need remeasurement, and
  eviction must dispose the helper.
- **Signature completeness.** A missing fact in the export signature would let
  a stale decision survive. The oracle tests exist to catch this; the signature
  should err towards including more.
- **Stat blind spots.** Same-size edits within timestamp granularity could hide
  a change. Named files are always hashed, watcher events still apply, and
  periodic verification catches the rest.
- **Wide fan-out.** Changing the exports of a widely imported file affects many
  importers. The check then reports its wider checked set, and a missed
  deadline is explicit.

## Suggested sequence

1. **Probe.** Keep one project open, apply one-file edits through
   `updateSnapshot({ fileChanges })` with `collectTiming`, and time the
   re-extraction of that file on the reference project and the 100-owner
   fixture. Also time a stat scan of the captured view. The probe establishes
   whether the target is reachable before any contract work.
2. **Overheads without a warm compiler.** Indexed decisions, stat-based
   synchronization, compact results and preemption. These help every resident
   check and should bring the unchanged check well below its 1.8 s floor.
3. **Warm compiler session.** The reviewed adapter contract, revisiting RP-2.
4. **Per-file facts and propagation.** Fact store, reverse indexes, export
   signatures and incremental link and decide.
5. **Hook mode and evidence.** Hook client, deadline and output, a host adapter,
   the equivalence tests and latency measurements.

## Alternatives considered

- **A syntax-only fast checker.** Parsing the changed file and checking it
  against cached resolution would be faster, but it would miss alias, merged
  declaration and type-only semantics. The architecture rules out a cheaper
  parallel checker that approximates the rules.
- **Parallel whole-project stages.** Worker pools cannot bring a 2.1 s catalog
  down to a hook budget.
- **Persistent disk caches.** They speed up cold starts, not warm edits.

## Relationship to Plan 2

The proposal builds on Plan 2's contexts, synchronized checks, retained stage
products and service. Implementing step 3 requires revisiting RP-2 and writing
the adapter contract its deferral requires. Steps 2 and 4 could extend Plan 2's
retained products or form part of the pending deliverable; the roadmap brief
decides that split.
