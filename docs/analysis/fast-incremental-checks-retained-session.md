# Fast incremental checks: a retained-session daemon architecture

> **Superseded on 2026-09-14.** [Plan 5](../plans/iteration-5-fast-incremental-checks/main-plan.md)
> implemented the retained session this document proposes and closed on that
> date; its [completion report](../plans/iteration-5-fast-incremental-checks/iterations/iteration13-results.md)
> records the delivered scope and the gaps, and
> [daemon and analysis](../architecture/daemon.md#implemented-retained-session)
> owns the implemented design. This document is kept for its measurements and
> its reasoning; where the two differ, the architecture documents and the plan
> hold.

**Date:** 2026-09-11. **Status:** Design proposal for review. It starts from
Plan 1's implemented batch engine and the decided
[process and client split](../architecture/processes-and-clients.md); it does
not build on the draft Plan 2 implementation. The measurements are single
machine observations taken while writing this proposal, reproducible with the
[fast-check probes](../../scripts/probes/fast-check/README.md); they are not
acceptance evidence. Nothing here changes the model documents. Once reviewed,
its decisions belong in [daemon and analysis](../architecture/daemon.md) and
[memory lifecycle](../architecture/memory-lifecycle.md), and its delivery in a
roadmap brief.

## The requirement as a budget

An agent host runs a hook after every file the agent writes. The hook runs
`ramify check` for that file and the agent waits for the answer. The hook's
wall time is CLI startup, the local connection, the daemon's work and output.
Bare CLI startup measured 35 ms, so the daemon's share decides the outcome.

Proposed starting targets, to be agreed from measurements on the implemented
path like every other resident budget:

| Workload in a warm context | Daemon work, median | Hook end to end, median |
| --- | ---: | ---: |
| One source file edited, reference project | ≤ 100 ms | ≤ 200 ms |
| One source file edited, 100 owners | ≤ 300 ms | ≤ 400 ms |
| One source file edited, 1,000 owners | ≤ 1 s | ≤ 1.2 s |
| One `module.ramify` or README edited | ≤ 200 ms | ≤ 300 ms |
| Configuration, dependency or registry change (broad path) | ≤ 3 s reference | explicit wider checked set |
| Cold context, daemon already running | ≤ 2 s reference | explicit `cold` outcome |

A result under budget must equal a fresh batch check over the same captured
inputs. An unmet deadline, a cold context that cannot finish and an
unavailable daemon are explicit outcomes with exit 2, never a pass.

## Where a batch check spends its time

Plan 1's pipeline, run in one process on the reference project (15 owners, 54
source files, 816 compiler program files) and on the toolkit (9 owners, 144
source files, 445 program files):

| Stage | Reference | Toolkit |
| --- | ---: | ---: |
| Acquisition: root, configuration helper, inventory, reads | 0.19–0.23 s | 0.76 s |
| Compiler helper spawn and program creation | 2.3–2.5 s | 1.55 s |
| Catalog: exports and originals | 0.21–0.25 s | 0.49 s |
| Link and model | 0.03 s | 0.08 s |
| Access interpretation | 0.66–0.71 s | 2.86 s |
| Compiler disposal | 0.07 s | 0.08 s |
| Decide | 0.07 s | 1.51 s |
| Seal: re-validate every captured input | 0.37–0.41 s | 0.38 s |
| `ramify check` end to end | 3.6–4.0 s | 7.7 s |

The same compiler, driven directly with ordinary filesystem reads, creates the
reference program in 0.13–0.24 s. Four structural costs of the batch design
explain the rest, and all four are paid per project on every check:

1. **Program creation through the parent-served pipe.** The helper obtains
   every filesystem answer from the parent over a JSON line protocol with
   base64 chunks and 1 ms sleeps on empty pipes. The reference program needs
   about 3,500 callbacks, 2,400 of them absence probes, so a 0.2 s program
   costs 2.3 s.
2. **Sealing.** Coherence is established by re-observing all 3,549 captured
   inputs after analysis, at 0.4 s.
3. **Access interpretation.** Every occurrence performs several checker round
   trips, 8–18 ms per source file.
4. **Decisions.** Each decision scans the whole model for its module, original
   and exposures, 0.35–1.1 ms per selection.

A resident design must turn each of these into work proportional to the
change, or remove it, rather than keep a process warm around them.

## What a warm compiler already provides

TypeScript 7.0.2's `updateSnapshot` accepts explicit changed, created and
deleted files and reuses the retained program for everything else. Measured on
a server kept alive across edits:

| Operation | Reference | Toolkit |
| --- | ---: | ---: |
| Spawn and initial snapshot with direct reads | 0.13–0.24 s | 0.11–0.17 s |
| New snapshot after one changed file | 1.5 ms | 1.5 ms |
| New snapshot after a created or deleted owned file, including the configuration change | 74 / 68 ms | 32 / 31 ms |
| Whole-project `buildCatalog` on the new snapshot | 38–50 ms | 181–184 ms |
| Whole-project `collectAccesses` on the new snapshot | 0.41–0.46 s | 2.6–2.7 s |
| Whole-project decide from the saved report | 75 ms | 1.47 s |
| Server RSS, 40 edit cycles with immediate snapshot disposal | 128 → 149 MiB | 126 → 155 MiB |
| Server RSS after two whole-project re-extractions | 221 → 310 MiB | 258 → 417 MiB |

The blocking client works inside a Node worker thread; the main thread kept
every 5 ms tick while the worker ran a 0.6 s extraction. Snapshots that are
not disposed hold memory that the server does not return afterwards, so the
number of live snapshots per context must be exactly one.

The conclusion: keeping the compiler warm is cheap and solves the largest
cost. The remaining cost is Ramify's own extraction and decisions, which must
become per-file work driven by recorded dependencies.

## Design

### Principles

1. **One retained analysis session per context, in its own thread.** The
   session owns the warm compiler, the input observations and the derived
   facts. The daemon's event loop never blocks on the compiler; a session is
   evicted by terminating its thread.
2. **Change driven and exact.** An update applies the same extraction, linking
   and decision functions as a fresh pass, restricted to an affected set
   derived from recorded dependencies. The set may be a superset of what
   truly changed; it may never be a subset. Every published revision equals a
   fresh batch analysis of its captured inputs.
3. **Live updates, with freshness by content identity.** The watcher drives
   the analysis continuously; every saved change becomes a revision without a
   client asking. A hook request names files and their expected content
   hashes and receives the first revision that covers them, which is usually
   already published. A full sweep of the observed input set runs in the
   background and after configuration or dependency changes, never on the
   hook path.
4. **Description edits need no compiler.** Linking, the model and decisions
   are plain-data computations measured at 30–84 ms for the whole project.
   Only owned source, resources, configuration and dependency changes touch
   the compiler.
5. **The compiler is a private accelerator.** Every fact the model or a client
   needs is retained as plain data. Losing the compiler makes the next update
   cold and conservative, never stale, and no compiler object leaves the
   session.

### Runtime structure

```text
hook / CLI / MCP / external client
        | local socket, plain-data requests and events
+-------+-------------------------------------------------------------+
| daemon process: endpoint, leases, contexts, one queue per context,  |
| watcher adapters, revision history, published projections          |
|   context A                       context B                        |
|   +--------------------------+    +--------------------------+     |
|   | analysis session         |    | analysis session         |     |
|   | (worker thread)          |    | (worker thread)          |     |
|   | input observer           |    | input observer           |     |
|   | compiler client ---------+--> tsgo server (Go child)     |     |
|   | per-file facts, model,   |    | ...                      |     |
|   | decisions, indexes       |    |                          |     |
|   +--------------------------+    +--------------------------+     |
+---------------------------------------------------------------------+

ramify check --batch -> fresh session in the CLI process -> same functions,
                        no retained state, disposed on exit
```

| Component | Owner | Holds | Lifetime |
| --- | --- | --- | --- |
| Daemon host | `daemon` | Endpoint, handshake, leases, watcher subscriptions, context registry | Resident with idle exit |
| Context | `contexts` | One ordered update queue, current and bounded historical revisions as plain data, freshness bookkeeping | Warm, then cold, then evicted |
| Analysis session | `analysis`, running in a worker thread it starts itself | Input observer, compiler client, retained facts and indexes, current candidate | Held while the context is warm; terminated on eviction or after the warm-idle period |
| Compiler server | `typescript`, private to the session | The native program and exactly one live snapshot | Same as the session |
| Batch session | `analysis` | Plan 1's single-use session | One invocation |

The worker boundary is an implementation detail of `analysis`, the way the
supervised helper is an implementation detail of `typescript` today. Contexts
and the daemon see a retained session with `update`, `check` and `dispose`
operations and plain-data results. A child process is the fallback if
measurements show that thread isolation or memory accounting is insufficient;
the session contract does not change.

### Retained state

Each session retains the following, all plain data except the compiler handle.

| State | Content | Granularity |
| --- | --- | --- |
| Observations | Path, role, content hash or stat signature for every input the analysis used, including absent paths and directory listings | Per path |
| Inventory | Root, configuration, modules, areas, owned files, exact references, outside-module warnings | Whole project, rebuilt only on structural change |
| Descriptions and metadata | Parsed `module.ramify` documents, README purposes | Per file |
| Compiler | The API client, the synthetic configuration naming the owned files, the current snapshot | One per session |
| Export descriptions | Each owned file's exports, originals, forwarding and completeness, plus the provider files, resources and shims that description depended on | Per file, with dependency edges |
| Access facts | Each owned file's occurrences, targets, selections and coverage notes, plus the target files, catalog entries and resolution candidates they depended on | Per file, with dependency edges |
| Model | Linked descriptions, originals with tags, exposures | Whole project, rebuilt on any description, area or original change |
| Decisions and findings | Per access, with the original, importer area and exposure evidence they used | Per access |
| Reverse indexes | Original → accesses; target file → importing files; candidate path → importing files; module → accesses as importer and as original owner; provider file → dependent descriptions | Maintained on every update |

Findings, coverage notes and warnings are stored per file or per access, so
removing an obsolete finding is deleting the entries of a recomputed unit, not
searching a report.

### The revision step

An update receives a change set: paths with new content identities, created
and deleted paths, and a flag when the watcher cannot be trusted. It runs on
the session thread, in this order, and publishes one revision or an explicit
failure.

1. **Classify.** Each path is a description, README, owned source or
   resource, configuration or dependency input, a discovery-relevant path
   such as a new `module.ramify` or a directory under `subs/`, or unknown.
   Unknown paths inside the root that no observation covers are ignored
   unless discovery-relevant.
2. **Inventory.** A change confined to files inside existing areas updates
   the inventory locally. A module added, removed or moved, a stray
   description or a layout error rebuilds the inventory, the areas and the
   synthetic configuration; the update then continues on the broad path.
3. **Compiler.** One `updateSnapshot` call names the changed, created and
   deleted files, and the synthetic configuration when the owned file list
   changed. The previous snapshot is disposed immediately afterwards.
   Configuration, dependency or unknown-scope changes use `invalidateAll`.
4. **Export descriptions.** Recompute the description of each changed owned
   file, then of each file whose description depends on a recomputed one,
   until descriptions stop changing by value. Star exports and namespace
   forwarding make this a fixed point over a small dependent set, not the
   whole catalog. The changed originals and export entries are recorded.
5. **Access facts.** Re-interpret each changed source file; each file
   targeting a file whose description changed; each file with a resolution
   candidate matching a created or deleted path; all files on the broad path.
   Interpretation is split so a provider change repeats the selection lookup
   against the new description without repeating the checker round trips of
   the syntactic pass.
6. **Link and model.** Rebuild when a description, an area, a registry input
   or any original's identity, kind or tags changed. Otherwise the model is
   retained.
7. **Decide.** Recompute decisions for every re-interpreted access; every
   access selecting a changed original; and, when the model was rebuilt, every
   access whose importer or original owner lies in the subtree of a module
   whose exposures, areas or tags changed. A registry change decides
   everything. Decisions use indexed lookups so the whole-project cost is
   bounded by the access count, not by the model size.
8. **Publish.** The revision records the captured identities, the checked
   set (files re-interpreted and accesses re-decided), findings added and
   removed since the previous revision, coverage and the same report
   projection a batch run produces for these inputs.

| Change | Compiler | Descriptions and facts | Model | Decisions |
| --- | --- | --- | --- | --- |
| Source edit that leaves exports and accesses unchanged, the common hook edit | one changed file, 1.5 ms | the file only, compared by value | none | none; positions patched |
| Source edit that changes imports or exports | one changed file, 1.5 ms | the file, its dependents by description, its importers if exports changed | only if an original's identity, kind or tags changed | affected accesses, tens to low hundreds |
| Owned file created or deleted | created or deleted plus configuration, ≤ 75 ms | the file, importers with matching candidates | if originals changed | affected accesses |
| `module.ramify` edit | none | none | rebuilt, ≤ 84 ms measured | subtree of the edited module |
| README edit | none | metadata only | none | none |
| Registry change | none | none | rebuilt | all |
| Configuration, dependency, shim or discovery change | `invalidateAll` | all owned files | rebuilt | all |

The measured fan-in bounds the affected set for source edits: the most
imported file has 56 importing accesses in the reference project and 127 in
the toolkit. At the measured per-file and per-decision costs, even the widest
single-file edit stays within the proposed budget, and indexing removes most
of the decision cost.

### The unchanged-surface fast path

Most edits change a function body, not the file's imports or exports. The
revision step recognizes them without a separate detector: after the snapshot
update, it re-extracts the changed file alone and compares the new export
description and access facts with the retained ones by value, ignoring
positions. When both are equal, nothing else follows: no dependent
descriptions, no model rebuild, no decisions. The revision only patches the
positions of that file's declarations and occurrences, and recomputes the
identities of the few diagnostics whose evidence cites those positions, so the
report still equals a fresh batch run. When only the access facts changed,
the file's own accesses are re-decided against the retained model; when the
export description changed, propagation proceeds as above.

Detection through the real extractor, rather than a syntactic signature,
cannot miss a form: dynamic imports, import types, namespace member uses and
loader calls all live in bodies, and a hand-written surface hash that omits
one of them would be the cheaper approximate checker the architecture rules
out. What makes the real extractor cheap enough is bounding its checker
round trips. Today `NamespaceUses` asks the checker for the symbol of every
identifier in a file, which is most of the 8–18 ms per file. Only identifiers
spelled like a namespace-bearing local binding can refer to one, so a
spelling pre-filter before the symbol query keeps the result exact and makes
files without such bindings cost no identifier queries at all; the API's
batched `getSymbolAtLocation` over an array of nodes removes the remaining
round trips. With those two changes a body edit costs the snapshot update,
one source-file fetch and a few specifier resolutions, a few milliseconds,
and it is the same work whether the watcher or a hook triggers it.

A syntactic pre-filter that skips even that extraction is a later option, to
be justified by measuring the filtered extraction first. If added, it must
be conservative: any change to a top-level import or export statement, to
the header of any top-level declaration, to any token spelled like an import
binding, or to any `import`, `require`, `exports`, `module` or
`declare` token anywhere, including JSDoc, must fall back to extraction.

### Live updates and the hook path

The watcher is the primary driver. Its events are debounced briefly,
coalesced per context and applied as revisions whether or not any client is
connected, so the analysis is live for `ramify watch`, the later explorer
and every hook. A synchronized request does not compute; it waits:

1. The CLI reads and hashes the named files and sends paths with hashes; a
   plain `ramify check` names none.
2. The session answers immediately when the current revision's observations
   already record those identities, which is the usual case: the watcher
   event precedes the hook process by its own startup time, and the update
   takes less than that startup.
3. Otherwise the session flushes the pending debounce window, adds the named
   files to the change set, runs the revision step once and answers with the
   revision that covers them. A named file whose disk content no longer
   matches the request is reported as `superseded`.
4. The answer carries the revision, the checked set and the findings, marking
   which findings are new since the caller's last known revision when the
   request names one.

Live updates and hooks therefore share one queue and one computation. Two
hooks on the same context, or a hook arriving while the watcher's update for
the same file is in flight, are answered by the same revision. An agent
writing files in a burst produces one revision per debounce window rather
than one per write, and each hook still finds its file covered.

The watcher is a change feed, not a guarantee. Two mechanisms cover what it
misses. A background sweep re-observes the whole observed set, the 0.4 s that
sealing costs today, on a bounded interval while the context is active, after
every configuration or dependency change and after a watcher overflow. Its
findings enter the queue as ordinary changes. When a sweep is required and
has not completed, a synchronized request waits for it, and the answer
records that wider reconciliation, still within a few hundred milliseconds.
The compiler's dependency reads are covered by the sweep and by watching the
package manifest and lockfile; changes there take the broad path.

Requests on one context are serialized, so a broad update ahead of a hook
delays it. The broad path costs 0.5–3 s on a warm compiler in the measured
projects, and the response records the wider checked set. A request whose
deadline passes returns `deadline-exceeded` with the revision that was current
when it was accepted; it does not return a pass.

### Cold contexts, recovery and daemon absence

The first request for a context spawns the session thread and the compiler,
observes the project with direct reads and runs the full pipeline. Without
the parent-served pipe, the reference project's cold analysis is expected
near 1–1.5 s and must be measured. A hook in a cold context receives the
result if it arrives within the hook deadline, marked `cold`; otherwise it
receives `not-checked` with exit 2 and the context continues warming in the
background, so the next hook is fast.

A hook never falls back to an in-process batch run: a 4–8 s batch inside an
agent's write loop is worse than an explicit `unavailable` that the agent can
retry. The terminating `ramify check` without changed files keeps the
[restricted batch fallback](../architecture/processes-and-clients.md#launch-compatibility-and-shutdown).
Loss of the compiler server inside a warm session discards only the compiler;
the next update rebuilds it and takes the broad path over the retained facts.

### Checkpoints

Three things could be meant by checkpointing; the proposal treats them
separately.

- **Revisions are the checkpoints the design needs.** Each published revision
  is an immutable plain-data view. Incremental updates are deltas from the
  current revision, and a client can ask for findings added or removed since a
  revision it names. For an agent this is the useful query: what its last few
  writes changed in the findings, not the whole report each time.
- **Persistent checkpoints of retained facts** would let a cold daemon skip
  extraction. Validating one requires re-hashing every observed input, about
  the sealing cost, and the compiler must be rebuilt regardless, so the saving
  is the extraction and decision time: 0.7–3 s in the measured projects and
  more on the 500 and 1,000 owner fixtures. This is a later optimization,
  gated by cold measurements on those fixtures; it must never be trusted
  without full identity validation.
- **Compiler snapshots** are TypeScript's own checkpoints and are used
  implicitly; only one is live per session.

### Memory and process bounds

The warm compiler is the dominant resident cost. The measured server ranges
from about 130 MiB after a light workload to about 420 MiB after repeated
whole-project extraction on the toolkit, and its runtime does not return
freed memory promptly. The retained plain-data facts are far smaller. The
policy therefore distinguishes two warm levels:

| Level | Retained | Bound |
| --- | --- | --- |
| Hot | Session thread, compiler server, facts, indexes | A small number of contexts, proposed two by default, most recently used |
| Warm | Session thread and facts, compiler disposed | Bounded by the global retained-bytes budget |
| Cold | Revision history only, per the existing history limits | Existing limits |

A hot context demoted to warm answers its next update on the broad path after
rebuilding the compiler in about 0.2 s. Exactly one compiler snapshot is live
per session; the previous one is disposed before publication. Worker threads
run with explicit resource limits, and their heap, the server's RSS and the
retained bytes are reported through the context status. Budgets for the
1,000 owner fixture are agreed from measurements, as the memory lifecycle
requires; the Plan 2 draft's eight hot contexts in 1 GiB is not achievable
with retained compilers and should be replaced by the two-level policy.

### Exactness and evidence

Exactness is verified, not assumed, at three levels:

1. **Sequence equivalence.** Every reference and synthetic edit sequence
   compares the incremental revision with a batch run over the same captured
   inputs after normalizing run identifiers, and asserts the independently
   expected outcome of each step, extending DA10 and DA11.
2. **Built-in audit.** A session can recompute all facts from its warm
   compiler and compare them with the retained facts. Tests run it after
   every step; the daemon runs it on idle at a bounded interval and reports a
   mismatch as an internal error with the recomputed result published,
   never as a silent repair.
3. **Bounded work.** Each revision records its checked set and the time spent
   per step. Acceptance measures one-file edits on the reference, 100, 500 and
   1,000 owner fixtures and requires the checked set and time to be bounded
   by the change, not by the project.

## Consequences for the documents and the Plan 2 draft

- [Daemon and analysis](../architecture/daemon.md) already requires retained
  compiler state, recorded dependencies and the fast-check outcomes. It gains
  the session-in-a-thread structure, the two-level warm policy, the
  background sweep, the hook request shape and the per-file fact
  granularity.
- [Memory lifecycle](../architecture/memory-lifecycle.md) gains the compiler
  server as a bounded, measured resident cost and the hot/warm distinction.
- The Plan 2 draft's transport, endpoint, tokens, generations, freshness
  modes, publication, leases and stop/recovery rules stand. Its engine core
  does not: it captures the whole project afresh for every revision, forbids
  compiler retention and reuses whole-stage products keyed by input sets,
  which keeps every one of the four structural costs above. Delivering that
  core and then replacing it would be wasted work, so fast checks belong in
  the resident deliverable itself, with the session, facts and hook path
  replacing the draft's engine iterations.
- Plan 1's batch session, functions and report stay as they are; the
  retained session composes the same per-file functions.

## Decisions to review

1. Worker thread with resource limits versus child process for the session;
   the proposal recommends the thread and keeps the contract identical.
2. Per-file export descriptions from the first iteration, or a whole-project
   catalog on the warm compiler first. The whole-project catalog meets the
   reference budget at 40–180 ms but not the proportional-work requirement on
   large fixtures; the proposal recommends per-file from the start, since the
   dependency edges are needed for access invalidation anyway.
3. The hook command shape: `ramify check --changed <path>...` with hashes
   computed by the CLI, plus an adapter that reads the host's hook JSON from
   standard input; output limited to findings new since the caller's last
   revision, with the full report available on request.
4. The numeric targets above, revised once from the implemented path's
   measurements and binding from then on.
5. The default number of hot contexts, the watcher debounce and the sweep
   interval.
6. Whether a syntactic pre-filter before per-file re-extraction is worth its
   conservativeness rules, decided after measuring the spelling-filtered and
   batched extraction.
