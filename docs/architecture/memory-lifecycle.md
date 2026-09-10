# Memory lifecycle

**Date:** 2026-09-07. **Status:** Decided resource-management requirements.
Numeric budgets, idle periods and detailed representations require measurement
and review before implementation milestones claim these guarantees.

The resident daemon should keep only the dependencies and state needed for
active analysis. Its [client adapters](processes-and-clients.md) have independent
lifetimes: stdio MCP lives with the host connection, while the web process lives
with its browser clients and any future MCP HTTP sessions. Their exit reclaims
adapter allocations without discarding warm analysis.

Keeping TypeScript analysis warm has an unavoidable memory cost. Lightweight
does not mean deleting source semantics required by the model. It means bounded
retention, controlled work and explicit behavior when the requested workload
cannot fit the supported budget.

## Runtime dependency boundaries

The daemon entry point excludes the MCP SDK/adapter, Express, the web tRPC router,
frontend rendering, development tooling and host-only integrations. Ordinary CLI
startup excludes compiler, MCP and web assembly; MCP serving loads its own adapter
only when selected. Verify the transitive runtime imports and actual
loaded modules for each entry point; type-only dependencies should remain erased.
These boundaries also hold during recovery: watch, MCP, web and external service
clients never load or spawn a batch engine. Only a terminating CLI command may
use eligible in-process batch fallback, disposing its session before exit.
Disposing session state alone would not reclaim imported compiler code in a
long-lived adapter.

The web process serves built assets and uses the daemon's analysis service.
It retains only bounded request/connection state and temporary result projections.
It does not mirror the entire project graph or maintain compiler sessions.
Fetch scoped details and send small revision/status notifications instead of
broadcasting whole source inventories on every edit.

Each stdio MCP connection may require its own adapter runtime, but must reuse
compatible daemon analysis rather than duplicate compiler state. Measure aggregate
adapter memory with several connected hosts. Keep tool/resource results, pending
requests and notification buffers bounded. An idle MCP connection may remain
open while releasing unused context/history leases; connection lifetime is not
a reason to pin every revision. HTTP session sharing is an optional deployment
choice, not a prerequisite for bounding the stdio adapter.

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
| Compiler sessions and source inputs | Analysis/source adapter retains the current state required by each active context. Dispose inactive sessions; bound the number and total retained size of contexts. Do not create another session per MCP client, browser or query. |
| Published and candidate analysis | Analysis/context publication retains the current revision and bounded in-flight work. Share unchanged immutable facts where practical; account for temporary overlap during publication. |
| Historical revisions | Context retention has explicit byte/count/age limits and bounded request leases. Retain identifiers, evidence and supported historical content; do not keep a full compiler program per revision. |
| Overlays | Bound clients, source bytes and retained bases. Close abandoned overlays and release their base references. A stale or evicted base returns a conflict/unavailable result. |
| Optional enrichment and search | Use lazy, byte-bounded caches keyed by context/generation/revision and query. Cache eviction cannot alter completed enforcement results. |
| Edit and analysis queues | Coalesce changes and supersede obsolete work. Bound queued bytes, concurrent analysis and enrichment; release canceled work's captured inputs. |
| IPC/HTTP/MCP requests and responses | Bound message bodies, batches, result sizes and in-flight requests. Scope/page large queries so serialization does not create uncontrolled transient copies. |
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
An idle connection without active work does not prevent that exit or immediately
restart the daemon. The next analysis request may coordinate startup and reopen
contexts with new generations. This automatic idle exit is distinct from both a
crash and an explicit user stop; clients follow the
[shutdown and recovery contract](processes-and-clients.md#launch-compatibility-and-shutdown).

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
| ML07 | Idle disposal and recovery release sessions, watchers, timers and child processes. An idle open client does not cause restart churn; the next real request may restart, while an active watch lease prevents idle exit. Long-lived clients do not acquire compiler allocations during failed recovery; unavailable checking cannot pass. |
| ML08 | Repeated MCP connect/call/disconnect cycles and several simultaneous hosts keep adapter buffers and daemon leases bounded. Stdio process loss releases resources without duplicate analysis contexts. Failed daemon recovery never loads a fallback compiler into the adapter. Optional HTTP hosting retains the web process only for its valid client leases. |

Use representative projects and the planned 100/500/1,000-owner fixtures. Agree
numeric ceilings and acceptable settled growth before accepting the corresponding
runtime milestone. Set limits for timeouts, retained bytes, concurrent work and
active contexts; this document does not invent configuration syntax for them.

### Initial setup probe

A local probe on 2026-09-07 used Node v22.23.2 and the installed enclosing
repository dependencies. Three fresh-process samples per case were measured
after explicit garbage collection. No original executable recipe, dependency
version record or raw samples accompany these figures in this checkout. Treat
them as historical observations, not independently reproducible evidence:

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

### Repeatable setup measurements

The checked-in [memory probe](../../scripts/memory-probe.mjs) records a new,
explicit recipe. It does not reconstruct or validate the historical numbers.
It uses only Node built-ins; from the Ramify directory, run:

```sh
node scripts/memory-probe.mjs --samples 3 > /tmp/ramify-memory-empty.json
node scripts/memory-probe.mjs --cases empty,web,web-vite --dependency-root /path/to/installed/project --samples 3 > /tmp/ramify-memory-web.json
```

The default empty setup needs no optional packages. The web cases require an
explicit dependency root with Express, `@trpc/server`, Zod and, for `web-vite`,
Vite installed. In an enclosing checkout that root can be `..`; a standalone
checkout can use any explicitly prepared dependency tree. Do not add these
packages to the resident or baseline implementation just to run the probe.
The script resolves Node require entries from that root, then imports those
files, constructs an Express application and a tiny tRPC/Zod router, and
optionally imports Vite. It opens no listeners and starts no Vite server.

Each sample is a fresh Node child with `--expose-gc` and cleared `NODE_OPTIONS`.
After setup is ready, it waits 100 ms, invokes GC twice, and records RSS, heap,
external and array-buffer bytes. It repeats that measurement after disposal.
The JSON includes raw samples and medians, Node/runtime/platform versions,
resolved dependency versions and entry paths, recipe/fixture and available
package/lockfile hashes, and timing/timeout settings. The empty case includes
the same probe machinery; it is not a bare Node executable. Array-buffer bytes
are included in external memory and should not be added to it again.

For implemented entries, add a checked-in ESM fixture and pass
`--setup /absolute/path/to/fixture.mjs`. Its exported async `setup()` imports
the real implementation, waits for the chosen readiness point and returns an
object with `dispose()` and the state to retain during measurement. The probe
adds an `entry` case and awaits disposal. Missing dependencies, failed setup or
disposal, and children that exceed 30 seconds fail the run; they cannot become
successful empty measurements. Fixtures measure their own process; additional
daemon/web processes need separately instrumented runtime harnesses.

Plan 1 supplies actual batch/session fixtures and repeated-use measurements;
later plans add resident, MCP and web workloads. Preserve their recipes, input
fixtures and versioned raw results with acceptance evidence. The setup probe's
post-disposal samples do not establish peak allocation, long-running plateaus,
module unloading or combined multi-process budgets.

The implemented [batch measurement recipe](../../scripts/measurements/README.md)
and its retained raw results cover the unchanged reference and the reviewed
100-owner fixture. They distinguish setup, combined process peak and the full
25-report retention workload. The [Plan 1 completion report](../plans/iteration-1-project-verifier/iterations/iteration15-results.md)
records actual budget outcomes and their acceptance limits.

The batch implementation releases compiler helpers after source fact extraction;
the captured view remains available for final consistency validation. Reports
share equal frozen plain-data subtrees within one result to avoid retaining
duplicate facts. Serialization still includes the complete report. No interning
table, compiler handle or cross-run cache survives with that report; each later
batch starts a fresh session. These implementation choices do not establish any
resident context, history, queue or lease budget.
