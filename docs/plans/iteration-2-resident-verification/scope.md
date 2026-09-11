# Plan 2 scope and lifecycle decisions

**Status:** reviewed and revised 2026-09-11 for [Plan 2](main-plan.md);
architecture acceptance is pending. This
document fixes the deployment arrangement, endpoint discovery, lifecycle
outcomes, the invalidation dependency model, budgets and deferrals in
reviewable form. [contracts.md](contracts.md) owns the exact signatures and
wire schemas; [owners.md](owners.md) owns declarations and placement. Plan 1's
[scope decisions](../done/iteration-1-project-verifier/scope.md) remain in
force for everything they cover: configurations, compiler integration, the
captured input view, report schema, production selection and batch limits.

## Deployment arrangement

One resident daemon per user and installation. The installation is the
package directory that `dist/src/cli-entry.js` belongs to; its `buildKey`
groups every context that installation opens, whatever project or worktree.
A different checkout or version has a different `buildKey`, its own socket and
record, and never contends with another installation's daemon. Within one
daemon, contexts are isolated by `ContextId` and share only the global
budgets.

| Item | Decision |
| --- | --- |
| Transport | Unix domain stream socket on Linux and macOS; length-prefixed JSON frames per [contracts.md](contracts.md#ipc-framing-messages-and-notification-rules). |
| Endpoint directory | `$RAMIFY_ENDPOINT_DIR`, else `$XDG_RUNTIME_DIR/ramify`, else `<os.tmpdir()>/ramify-<uid>`; created `0700`; owner and mode verified on every use. |
| Files | `daemon-<buildKey>.sock`, `daemon-<buildKey>.json` (record), `daemon-<buildKey>.lock`, `daemon-<buildKey>.log`. |
| Process | `node dist/src/daemon-entry.js --endpoint-dir <dir> --build-key <key> --version <v> --engine <e>`, spawned detached and unreferenced by the first client that needs it; never by `--help`, `--version`, `daemon status`, `daemon stop` or `--batch`. |
| Logging | Line-oriented JSON `LogEntry` records in the log file, truncated at daemon start, at most 8 MiB per daemon lifetime after which logging stops with a final entry. Entries identify context, generation, request and revision; no project source bytes. |
| Concurrency | One analysis at a time across the daemon; other contexts' work queues. |

The daemon serves any number of clients up to `maxConnections`; CLI commands,
`ramify watch` and external `connectDaemon` hosts are indistinguishable to it
except by the `client.name` they present.

## Endpoint discovery and grouping

| Step | Rule |
| --- | --- |
| Group key | `buildKey` = first 16 hex characters of SHA-256 over `[package root real path, package version, buildIdentity]`; `buildIdentity` hashes package.json and the sorted path/content hashes of all production `.js`/`.mjs` files under `dist/src/` and `dist/subs/`, as contracts.md specifies and is distinct from the `engine` string the handshake compares. A rebuilt `dist/` is a new group; the old daemon idles out. |
| Record | `DaemonRecord` written atomically at `starting`, `running` and `stopped`. It is the authority for the stop reason a client may have missed. |
| Liveness | `process.kill(pid, 0)` plus a connection attempt. A dead pid establishes a stale record. A refused socket with a live or ambiguous pid returns unavailable; refusal alone never authorizes unlinking. |
| Stale cleanup | Only a client that verified the pid dead removes the stale socket and record, and only while holding the start lock. |
| Start lock | `daemon-<buildKey>.lock` created `O_CREAT|O_EXCL` with holder pid and time; reclaimable only when its pid is verified dead; age over 30 s triggers a liveness check, never removal of a live holder. Malformed/ambiguous locks return unavailable. The holder spawns; waiters poll the record and socket every 50 ms for up to 10 s. |
| Duplicate daemon | A daemon entry that can connect to a live peer on its socket exits with code 3 and writes nothing; the launcher then connects to the peer. |
| Path length | A socket path over 100 bytes is `unavailable`, naming `RAMIFY_ENDPOINT_DIR` as the override. |
| Permissions | A directory not owned by the uid, or with group/other bits, is `unavailable`; a socket is never used across users. |

## Startup, retry and recovery limits

| Limit | Value | Applies to |
| --- | ---: | --- |
| Handshake | 2,000 ms | Every connection. |
| Startup wait | 10,000 ms | From spawn or lock observation to `running` plus handshake. |
| Start attempts per command | 2 | A failed spawn or a daemon that exits before `running` is retried once; then `unavailable`. |
| Reconnect attempts after unexpected loss | 3, backoff 250, 500, 1,000 ms | Existing connections. |
| Restart attempts after reconnect exhaustion | 1 | Existing connections not facing an explicit stop. |
| Total recovery | 20,000 ms | Reconnect plus restart. |
| Ping interval / lease | 15,000 ms / 45,000 ms | Connections holding subscriptions. |
| Graceful shutdown grace | 5,000 ms | Daemon stop: in-flight requests receive `stopping`, sockets receive `goodbye`, then close. |
| Cancel after interrupt | Cancel frame sent immediately; the CLI waits at most 2,000 ms for the response before exiting 130. |

## Idle exit, crash and explicit stop

| Outcome | Record | Existing connection (`watch`, external host) | New CLI invocation |
| --- | --- | --- | --- |
| Idle exit | `stopped` with reason `idle` after `idleExitMs` (30 min) with no lease, where a lease is an active subscription or an in-flight request; open connections without a lease do not prevent it; contexts already cold. | Every open connection receives `goodbye` `idle-exit`; a client disconnected earlier reads the record. `recover('automatic')` does not start anything; the connection reports `stopped`. A watch cannot observe this outcome while subscribed; a direct client with an idle connection reports `stopped: idle exit`. | Starts a daemon; contexts reopen with new generations. |
| Unexpected failure | `running` record with dead pid; or socket lost without `goodbye`. | Bounded reconnect, then one restart, then `unavailable`. A `watch` reports `unavailable` and exits 2. A terminating `check` whose recovery is exhausted uses the visible batch fallback. | Verifies pid dead, cleans up under the lock, starts a daemon. |
| Explicit stop | `stopped` with reason `explicit`, `requestId` of the stop and `at`. Written before sockets close. | Receives `goodbye` `explicit-stop`; a client that missed it reads the record. Automatic recovery returns `stopped`; only `recover('explicit')` starts. A `watch` exits 2 with `stopped: explicit`. An in-flight terminating `check` receives the `stopping` error, reports `Error [stopped]: …` and exits 2; it never falls back. | Is a newly invoked explicit command and starts a daemon. |
| Retired | `stopped` with reason `retired`. Reserved: no Plan 2 operation produces it and `DaemonHost.stop` accepts only `explicit`; a later plan adds the retire request. | A client that reads such a record treats it as idle exit. | Connects to its own group. |

An active subscription or an in-flight request is a lease: while any lease
exists the daemon does not idle-exit, and while any subscription exists the
subscribed context is not evicted for idleness. An open connection without
subscriptions or requests is not a lease and receives `goodbye` `idle-exit`
when the daemon exits. A bare socket closure is never taken as the reason;
the reason comes from `goodbye` or the record.

## Context selection and compatibility

A context is selected by `ProjectRequest` (`cwd`, optional `root`, `scope`,
`configuration`) and `ContextSetup` (`registry`, `capabilities`); the setup
repeats nothing from the request. The daemon resolves the root through the
driver's `resolve`, which applies the CLI invocation contract, and derives
`ContextId` from the canonical real root, the request's `scope` and
`configuration` and the setup. Plan 2 accepts exactly `scope:
'whole-project'`, `configuration: 'discover'`, `registry: 'default'` and any
subset of the thirteen implemented capabilities. A scope or configuration
value outside the literal is `invalid-request`; another registry name or an
unimplemented capability is `unsupported-setup`; neither is ever a silent
substitution. A request whose root or configuration cannot be resolved
receives `unresolved` with the engine's report for that request, exactly what
`--batch` would print, and no context. Two clients selecting the
same root and setup share one context; a client selecting a different setup
for the same root receives a different context, and neither reconfigures the
other. A request always carries a `ContextToken`; there is no fallback to
another root's analysis.

Compatibility: the socket name already separates installations. The handshake
verifies `protocol`, `buildKey` and `engine`; a mismatch is `reject` with
`incompatible`, the daemon is left running, and the client reports
`unavailable` with no reconnect and no restart, as the client table in
[contracts.md](contracts.md#client-and-transport-lifecycle) fixes.

## Invalidation dependency model

Analysis owns the model; contexts only chooses between naming changed paths
and `changes: null`. Every retained stage product records the captured inputs
it depended on, as `(path, role, sha256)` triples, and derives its key from
them. Dependency sets are cumulative along the pipeline, so a stage's key
changes whenever any earlier stage it consumes changed. The daemon may always
recompute more than the minimum; it may never recompute less.

| Stage product | Dependency set | Reused when |
| --- | --- | --- |
| `configuration` | Configuration files, `extends` chain, package manifests and the directory observations the configuration helper enumerated | Every dependency unchanged in the fresh capture. |
| `parse` (per description) | That description's bytes | Same `sha256`. |
| `metadata` (per README) | That README's bytes and its absence observation | Same identity. |
| `catalog` | `configuration` set plus every `source`, `resource`, `dependency`, `directory` and `absent` observation the source helper made, plus the area map (owner, kind, root, profile per owned file) and the registry identity | All unchanged. |
| `access` | `catalog` set | All unchanged. |
| `link` | `catalog` set plus every description identity and the registry identity | All unchanged. |
| `decide` | `link` set plus `access` set | All unchanged. |
| `report` | Everything | Never reused; assembled fresh, sharing unchanged frozen subtrees. |

The rows of the architecture's [required reconsideration table](../../architecture/daemon.md#incremental-updates-and-analysis-depth)
map onto this model as follows:

| Input change | Changed captured inputs | Minimum rerun |
| --- | --- | --- |
| Ordinary source edit | one `source` | `catalog`, `access`, `link`, `decide`, `report` |
| Export addition/removal, alias, merged declaration, resource description | `source` or `dependency` | same as above; unexposed originals recompute with the catalog |
| `module.ramify` edit, module move/add/remove, source-area move | `description`; possibly the area map | `parse` of that file, `link`, `decide`, `report`; plus `catalog` and `access` when the area map differs |
| Registry input | registry identity | everything; unreachable through Plan 2's fixed default registry, verified at the API |
| TypeScript configuration, package resolution metadata, declaration shim, source adapter, installed dependency | `configuration`, `dependency`, `absent`, `directory` | `configuration`, `catalog`, `access`, `link`, `decide`, `report` |
| README change | `readme` | `metadata`, `report` |
| Previously missing target appears; directory membership | `absent`, `directory` | every stage whose set contains the observation |
| Discovery exclusion, uncertain watcher state, overflow, broad operation | unknown | `changes: null`: everything except per-file `parse` and `metadata` |
| Engine string differs from `previous.engine` | — | everything; `previous` is discarded |

Compiler state is not retained across revisions in Plan 2: a recomputed
`catalog` or `access` starts the finite helpers exactly as Plan 1 does and
releases them before publication. Retaining a compiler snapshot across
revisions is deferred with a trigger recorded under [deferrals](#explicit-deferrals).

## Freshness and supersession guarantees

| Guarantee | Rule |
| --- | --- |
| Synchronized check | The report comes from a capture started at or after the request's acknowledgment; the outcome states the driver-start lower bound `captureStarted`, `verified: true` only for a sealed capture, and whether an equal published revision and report were reused. |
| Published read | Returns the current published revision with the context's `synchronization` state and pending counts attached; it never claims disk freshness. |
| Published read naming a revision | Returns exactly that revision and its report while history retains it, otherwise `evicted-revision`; `wait` is ignored and the current revision is never substituted. `watch` fetches every report this way, so an event header and its report always belong to the same revision. |
| Delayed or lost watcher | Cannot affect a synchronized check; may delay background publication, visible as `reconciling` or `conservative` in status. |
| Client-supplied content identities | `expect` mismatches return `superseded` with observed identities; a path without a sealed content/absence observation returns `unobserved-input`; supplied bytes are never accepted and never turn a disk check into an overlay. |
| Concurrent saves during capture | Plan 1's coherent-view retry applies (three attempts, 30 s total); exhaustion is the engine's incomplete report with the `changed-input` diagnostics, delivered `reported` with `published: false` and never a mixed view or a revision. |
| Engine results without a sealed capture, or with incomplete execution | Delivered to the requester as `reported` with `published: false` and the engine's report; the published revision and `lastValid` are unchanged and the context is `reconciling` until a later publication. |
| Acknowledged requests | Never coalesced away; each receives `reported`, `superseded`, `cancelled` or `unavailable` under its own `requestId`. |
| Background work | May be debounced, coalesced and cancelled; publishes nothing when superseded. |
| Generations | A restart, eviction or reopen creates a new generation; old tokens receive `expired-generation`. |
| Evicted revisions | `evicted-revision` for a named revision history no longer retains, never the current revision as a substitute. |
| Invalid current inputs | Published as an invalid revision (`outcome.execution: 'invalid'`, no model); `lastValid` appears in status as explicitly historical and answers no check. |
| Publication atomicity | A revision becomes visible in one assignment; readers never observe a partly replaced revision, and a candidate from an older generation never publishes. |
| Batch equivalence | For identical captured inputs, `report` equals the batch report except `runId`. |

## Budgets

Starting values come from Plan 1's [agreed batch budgets](../done/iteration-1-project-verifier/iterations/iteration15-results.md#batch-measurements-and-agreed-budgets):
5 s and 15 s cold checks, 512 MiB and 768 MiB combined peaks, and 16 MiB heap
and 64 MiB RSS settled growth over the last twenty cycles. Resident values
below replace them where the resident workload differs. The moment they
become binding is fixed once: the provisional latency and memory targets are
revised from iteration 1's warm-recompute probe and are binding from
iteration 1's exit; iteration 13 asserts them through I2-29 and records the
measured values in this document; a missed target is a reviewed revision of
these tables, never a relaxed assertion.

### Context and daemon budgets

Fixed defaults assembled by root; tests override them through
`--budgets <json>` and `createQuickEnvironment(options)`. No user configuration
syntax is added.

| Budget | Value | Exceeding it |
| --- | ---: | --- |
| `maxContexts` | 8 | Evict the least recently active unleased context; if all are leased, `resource-unavailable`. |
| `maxHistoryRevisions` | 8 per context | Drop oldest reports, keeping `published`; `lastValid` remains a historical header even when its report is evicted. Reject a candidate that alone cannot fit. |
| `maxHistoryBytes` | 64 MiB per context | Same. |
| `maxRetainedBytesPerContext` | 96 MiB of `RetainedAnalysis` | Drop retained products; the next revision recomputes conservatively. |
| `maxRetainedBytesGlobal` | 512 MiB of history plus products | Evict history oldest-first across contexts, then cold contexts, then `resource-unavailable`. |
| `maxQueuedPaths` | 10,000 distinct pending paths per context | Mark conservative and pass `changes: null`. |
| `maxConcurrentAnalyses` | 1 | Queue. |
| `warmIdleMs` / `coldRetainMs` | 600,000 / 1,800,000 | Cold, then evicted. |
| `debounceMs` | 100 | — |
| `verificationIntervalMs` | 60,000 | — |
| `maxConnections` | 64 | `reject` with `resource-unavailable` before `welcome`; the client starts no recovery. |
| `maxRequestBytes` / `maxResponseBytes` | 1 MiB / 32 MiB + 64 KiB | Protocol violation / `resource-unavailable` response. |
| `maxOutboundBytes` / `maxOutboundFrames` | 64 MiB / 256 per connection | Disconnect as slow consumer. |
| `maxRequestsInFlight` | 16 per connection | `resource-unavailable` error for the request that exceeds it. |
| `leaseMs` / `pingMs` | 45,000 / 15,000 | Release the connection's lease. |
| `idleExitMs` | 1,800,000 | Daemon exits with reason `idle`. |
| `shutdownGraceMs` | 5,000 | Force close. |
| Plan 1 `AnalysisLimits` | unchanged | Unchanged outcomes inside each revision. |

Accounting unit: `bytes` of a report or `RetainedAnalysis` is the UTF-8 length
of its JSON serialization, computed once at publication. It counts repeated
subtrees even when their heap representation is shared, but object overhead
means it is neither an upper nor a lower bound on heap or RSS. The measurement
rows below enforce actual memory limits separately.

### Latency and memory targets

Iteration 1 revision, 2026-09-11: the measured full-recompute medians are
**3.442 s reference / 5.723 s S100**, from twenty serial compiled in-process
runs each ([raw evidence](../../../scripts/probes/results/warm-recompute.json),
[recipe and stage split](probes.md#warm-recompute)). Source targets allow at
least 1.25 times that floor and broad targets at least 1.5 times it, rounded
up to the next 0.5 s where an existing target was lower. Thus reference source
moves from 4.0 to 4.5 s and reference broad from 5.0 to 5.5 s. S100's existing
8/12 s targets already provide that margin. Reuse targets stay unchanged:
this probe does not implement reuse or measure its latency. Memory targets
remain unchanged from the reviewed batch evidence; end-of-call parent RSS
is not a combined peak measurement and cannot justify raising them.

These are the single RP-7 revision proposed for acceptance and binding from
iteration 1's exit. Iteration 13 must assert every target and record measured
values; there is no automatic budget relaxation on failure.

| Workload | Target | Fixed by |
| --- | ---: | --- |
| First `ramify check` including daemon start, reference / 100 owners | ≤ 6 s / ≤ 16 s median of five | I2-29 `cold-warm-broad-*` |
| Warm synchronized check, unchanged inputs, reference / 100 owners | ≤ 1.5 s / ≤ 3 s median of twenty | same |
| README-only edit, then check | ≤ 1.0 s / ≤ 2 s | same |
| Exposure-only description edit, then check | ≤ 2.5 s / ≤ 5 s | same |
| Source edit, then check | ≤ 4.5 s / ≤ 8 s | same; iteration 1 probe fixes the full-recompute floor |
| Broad rebuild (configuration edit), then check | ≤ 5.5 s / ≤ 12 s | same |
| `contextStatus` service-side / `ramify daemon status` end to end | ≤ 50 ms / ≤ 300 ms | same |
| Watch event after a save, reference | ≤ debounce + source-edit target | I2-21 timing record |
| 500 owners: cold / source edit / combined peak | ≤ 45 s / ≤ 30 s / ≤ 1.5 GiB | I2-29 `synthetic-500` |
| 1,000 owners: cold / source edit / combined peak | ≤ 90 s / ≤ 60 s / ≤ 2.5 GiB | I2-29 `synthetic-1000` |
| Daemon RSS, idle, zero contexts | ≤ 96 MiB | I2-29 `entry-footprints` |
| Daemon RSS, one warm reference context, settled | ≤ 192 MiB | same |
| Daemon RSS, eight warm 100-owner contexts, settled | ≤ 1 GiB | I2-29 `many-contexts` |
| Combined daemon/helper/native peak during one reference / 100-owner analysis | ≤ 512 MiB / ≤ 768 MiB | I2-29 `publication-peak` |
| CLI process RSS for `ramify check` via daemon, reference / 100 owners | ≤ 96 MiB / ≤ 160 MiB | I2-29 `entry-footprints` |
| `./client` entry loaded in an empty process | ≤ 64 MiB | same |
| Repeated edits: 200 alternating source-edit/revert cycles, last 100 | RSS growth ≤ 64 MiB; heap growth beyond the history-bytes delta ≤ 16 MiB; history and product counters at their budgets; watchers, helpers, timers and sessions balanced | I2-29 `repeated-edit-plateau` |
| Slow consumer | Outbound queue never exceeds 64 MiB; disconnect within 2 s of exceeding; daemon RSS returns within 32 MiB of its pre-test settled value | I2-29 `slow-consumer` |
| Idle disposal | Watcher handles, helpers, analysis timers and retained products reach zero within `warmIdleMs` plus 5 s; the published report and cold/idle timers persist until eviction/exit. All context history reaches zero at eviction after `coldRetainMs`; process exits within `idleExitMs` plus 5 s | I2-27 `idle-disposal-releases` |

### Resident measurement recipe

Iteration 13 adds `npm run measure:resident` under `scripts/measurements/`
beside the batch recipe, reusing its process observer, archive format and
`index.json`. The fixtures exist before it: iteration 2 parameterizes
`scripts/probes/fixtures/synthetic-owners.ts` by owner count, with its
100-owner output byte-identical to the frozen `hundred-owners.ts` map, and
materializes S100, S500 and S1000 through `scripts/measurements/materialize.ts`,
because iterations 8 and 11 consume S100 before any measurement runs. The
recipe records, per
workload: entry footprints, cold start, twenty warm cycles of each edit class,
the 200-cycle plateau with per-cycle RSS, heap, external, history and product
bytes, contexts and helper counts, publication peaks sampled at 50 ms, and the
slow-consumer run. Raw results, dependency versions, fixture identities and
the build identity are archived as in Plan 1. A separately instrumented daemon
process reports its own counters through `daemonStatus`; the observer measures
RSS from outside.

## Batch and incremental comparison

For every comparison the harness materializes the same directory state, runs
`ramify check --batch --format json` and a daemon-backed
`ramify check --format json`, and compares `report` after replacing `runId`
with a constant. Everything else must be deep-equal: stages, capabilities,
outcome, snapshot, diagnostics, warnings, coverage and summary, including
expanded contracts and coverage notes. At the API level, `analyzeIncrement`
with and without `previous` is compared with `analyzeProject` the same way.
Every step of a sequence also asserts its independently expected outcome, so a
shared engine defect cannot pass both sides.

## Explicit deferrals

| Deferred | Reason and trigger |
| --- | --- |
| Overlays and unsaved content | Plan 5. `Freshness` has no overlay variant; supplied bytes are rejected. |
| Inspection and explanation commands, published-revision reads from the CLI beyond `watch` and `daemon status` | Plan 3, which reuses `ContextRevision` and `contextStatus`. |
| MCP stdio adapter and HTTP hosting | Plans 4 and later; the daemon never loads either. |
| Web process, tRPC, browser notifications | Plan 6. |
| Compiler-state retention across revisions | Deferred. Trigger: iteration 13 shows the source-edit target missed with stage reuse in place; then a reviewed adapter contract is written before any long-lived helper is added. |
| Retiring a daemon group | `StopDisposition.reason` `retired` is reserved; no Plan 2 operation produces it and `DaemonHost.stop` accepts only `explicit`. |
| Persistent disk caches, worker pools, process recycling | Not added; require measured need. |
| Event replay | `replay: 'not-available'` in Plan 2; a bounded sequence replay is a later capability. |
| Parallel analyses across contexts | `maxConcurrentAnalyses` stays 1; raising it needs peak-memory evidence with two helper sets. |
| Registry configuration serialization | Unspecified; `registry: 'default'` only. |
| Strict project configuration for outside-source warnings | Unspecified; warnings stay warnings. |
| Windows | Unsupported; no named-pipe transport is specified. |
| Explicit `ramify daemon start`/`resume` commands | Not needed: a new `check` or `watch` invocation is the explicit start after a stop. |

## Supported platform consequences

Linux and macOS only, as Plan 1 fixed. The selected primitives are Unix domain sockets, `O_EXCL` lock creation,
same-directory `rename`, `process.kill(pid, 0)` and detached `spawn` with
`unref()`. Linux probe evidence does not establish macOS execution.
Node 22 supports native recursive `fs.watch`, but callback filtering still
attaches native watches beneath excluded subtrees. The reviewed port uses
recursive directory enumeration with non-recursive handles, pruning
`node_modules`, `.git`, `dist` and `.reference-work` before attaching; it
rescans membership on directory changes. Unknown filenames, port queue
overflow and errors trigger conservative reconciliation. Native event loss
has no guaranteed signal, so periodic verification also runs when watching
is unavailable. The [probe record](probes.md) separates raw platform
observations, injected failures and the pruned arrangement. The portable
100-byte socket bound is enforced before Node: Linux accepted 101 bytes and
truncated a longer path during this probe. A detached zombie may still answer
`kill(pid, 0)`; that is ambiguous liveness, never permission to unlink. Plan 2's actual measurements establish Linux
evidence; the process suite must pass on macOS before acceptance, and any
fixture depending on `/proc`, GNU-only flags or macOS case folding is invalid.
