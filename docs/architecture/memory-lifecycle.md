# Memory lifecycle

**Date:** 2026-09-07. **Status:** Decided resource-management requirements.
Numeric budgets, idle periods and detailed representations require measurement
and review before implementation milestones claim these guarantees.

The resident daemon should keep only the dependencies and state needed for
active analysis. Its [separate web process](processes-and-clients.md) exists only
while visualization is used. This reduces persistent overhead and gives web
allocations a reclamation boundary without losing warm analysis.

Keeping TypeScript analysis warm has an unavoidable memory cost. Lightweight
does not mean deleting source semantics required by the model. It means bounded
retention, controlled work and explicit behavior when the requested workload
cannot fit the supported budget.

## Runtime dependency boundaries

The daemon entry point excludes Express, the web tRPC router, frontend rendering,
development tooling and host-only integrations. Ordinary CLI startup excludes
both compiler and web assembly. Verify the transitive runtime imports and actual
loaded modules for each entry point; type-only dependencies should remain erased.

The web process serves built assets and uses the daemon's analysis service.
It retains only bounded request/connection state and temporary result projections.
It does not mirror the entire project graph or maintain compiler sessions.
Fetch scoped details and send small revision/status notifications instead of
broadcasting whole source inventories on every edit.

Lazy loading delays an optional dependency's initial cost, but it is not a
reclamation strategy: imported modules are cached, and closing a listener does
not unload its module graph. Node documents a separate ESM cache. Process exit
provides the reclamation boundary for optional web code and allocations.
[Node ESM documentation](https://nodejs.org/api/esm.html#no-requirecache)

## State ownership and bounds

Specify both per-context and process-wide budgets. A fixed limit per project is
insufficient when arbitrarily many projects can remain warm. Entry-count limits
alone are insufficient when entries contain arbitrarily large source or results.

| State | Owner and required policy |
| --- | --- |
| Compiler sessions and source inputs | Analysis/source adapter retains the current state required by each active context. Dispose inactive sessions; bound the number and total retained size of contexts. Do not create another session per browser or query. |
| Published and candidate analysis | Analysis/context publication retains the current revision and bounded in-flight work. Share unchanged immutable facts where practical; account for temporary overlap during publication. |
| Historical revisions | Context retention has explicit byte/count/age limits and bounded request leases. Retain identifiers, evidence and supported historical content; do not keep a full compiler program per revision. |
| Overlays | Bound clients, source bytes and retained bases. Close abandoned overlays and release their base references. A stale or evicted base returns a conflict/unavailable result. |
| Optional enrichment and search | Use lazy, byte-bounded caches keyed by context/generation/revision and query. Cache eviction cannot alter completed enforcement results. |
| Edit and analysis queues | Coalesce changes and supersede obsolete work. Bound queued bytes, concurrent analysis and enrichment; release canceled work's captured inputs. |
| IPC/HTTP requests and responses | Bound message bodies, batches, result sizes and in-flight requests. Scope/page large queries so serialization does not create uncontrolled transient copies. |
| Events and client connections | Bound listeners, retained revisions and queued bytes. Clean disconnects release promptly; activity leases expire abandoned clients. |

Snapshots and cached query results contain plain data, not hidden references to
TypeScript programs, source-file objects or compiler symbols. Those references
can keep a much larger compiler graph alive. Compiler objects remain private to
the source adapter, as required by the engine architecture.

Change coalescing preserves required synchronization: superseding background work
must not falsely satisfy a caller requesting exact content. If a queue bound
prevents retaining every watcher event, mark the input view for conservative
reconciliation. Do not silently skip influencing inputs to fit the budget.

## Slow consumers and backpressure

The event bridge handles clients that stop reading. For replaceable revision
announcements, retain the newest relevant state and let clients resynchronize.
For events whose loss matters, use a bounded sequence/replay contract or report
that replay is unavailable. No client may force unbounded retention of every
intermediate revision.

When a queue reaches its limit, apply backpressure, reject new work or disconnect
the slow consumer with an explicit recovery path. Avoid constructing a new full
snapshot for each subscriber. Transport buffers and serialization allocations
count toward resource measurements as well as application caches.

## Pressure, eviction and recovery

Under memory pressure, reclaim optional enrichment and inactive contexts/history
first, according to the reviewed retention policy. Active exact-content requests
hold bounded leases, not indefinite pins. If required current analysis cannot
fit after eligible eviction, reject or defer the request with explicit resource
status. Missing execution must never become a successful check or a silent
substitution of older inputs.

An expired historical revision remains expired even when a newer revision can
answer a similar question. Invalid current input remains invalid even when a
last-valid result is retained. Memory policy must preserve the
[revision and coverage semantics](daemon.md#revisions-and-atomic-publication).

Closing the last CLI request does not immediately evict a useful context. Apply
a bounded warm-idle period, then dispose its compiler session, watchers and
indexes if no active lease requires it. A watch subscription keeps its selected
context active within the supported budget. An entirely idle daemon can exit.

Workers and subprocesses are optional analysis execution strategies that require
evidence. They can improve responsiveness or isolation, but can also duplicate
compiler state. Bound their count and lifetime; spawning a worker per request is
not the default architecture. If measurements justify process recycling, preserve
generation changes and explicit unavailable/reconnect outcomes rather than
presenting a rebuilt session as the old one.

## Measurement and acceptance

Measure resident memory (RSS), JavaScript heap and external/buffer allocations,
alongside live context/session counts, retained bytes, queued work and listeners.
Measure peak memory during rebuilds and serialization as well as settled memory.
For multiple processes, report each and an appropriate combined measurement,
accounting for shared pages when interpreting aggregate RSS.

Stable heap usage is not sufficient evidence of stable process memory. Node
documents that allocator fragmentation can sustain RSS growth with stable heap
allocation. Track both and investigate their causes separately; forced garbage
collection is a diagnostic aid, not a production retention policy.
[Node memory documentation](https://nodejs.org/api/process.html#processmemoryusage)

Extend DA17 with the following measurements and acceptance witnesses:

| ID | Required witness |
| --- | --- |
| ML01 | Compare cold/idle CLI, batch, daemon with zero and active contexts, and web startup. Verify their runtime dependency boundaries. |
| ML02 | A repeated edit/rebuild/query workload reaches a bounded memory plateau at fixed project size; old revisions, removed files and canceled tasks stop accumulating. |
| ML03 | Repeated worktree/overlay open-close cycles evict eligible state. Global budgets apply across many individually small contexts. |
| ML04 | Oversized requests, rapid edits and slow subscribers exercise limits, reconciliation and explicit errors without losing enforcement semantics. |
| ML05 | Repeated explorer open-close cycles terminate the idle web process, release its daemon leases and leave no additional compiler contexts or subscriptions. |
| ML06 | Detail expansion, large result serialization and historical requests respect peak and retention budgets; unavailable enrichment remains distinguishable from zero/empty data. |
| ML07 | Idle disposal and any measured recovery strategy release sessions, watchers, timers and child processes; a requested unavailable check cannot pass. |

Use representative projects and the planned 100/500/1,000-owner fixtures. Agree
numeric ceilings and acceptable settled growth before accepting the corresponding
runtime milestone. Set limits for timeouts, retained bytes, concurrent work and
active contexts; this document does not invent configuration syntax for them.

### Initial setup probe

A local probe on 2026-09-07 used Node v22.23.2 and the installed enclosing
repository dependencies. Three fresh-process samples per case were measured
after explicit garbage collection:

| Setup | Median RSS |
| --- | --- |
| Empty Node process | 42.2 MiB |
| Express, tRPC, Zod and a tiny router | 73.1 MiB |
| The same setup with Vite imported | 96.7 MiB |

There were no listening sockets, Vite server, project analysis, source watchers
or traffic. These figures demonstrate setup cost only. They are not a Ramify
budget, a long-running leak test or the incremental cost atop a future daemon
that may already load some dependencies. Repeat measurements on the implemented
entry points before using them for capacity decisions.
