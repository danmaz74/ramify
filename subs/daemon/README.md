# Daemon

Daemon owns the resident process: the validated in-process service that implements the root's service interface over its contexts child, the local socket host and its discovery records, the lightweight client that other processes use to reach it, the wire codec, and the real filesystem watcher and clock ports.

`createDaemonService` validates each operation and binds it to a context manager. `startDaemon` hosts that same service over framed Unix sockets, enforces connection, request and notification limits, publishes atomic lifecycle records, and releases leases on disconnect or shutdown. Requests and published results retain their context, generation and revision identities across IPC.

The separate `client-entry.ts` exports discovery, codec and `connectDaemon` without importing the service, host, contexts, analysis or compiler. Recovery is bounded and preserves explicit stop: automatic recovery does not restart an explicitly stopped daemon. Endpoint identity covers the complete production build; private endpoint permissions and process liveness are verified before reuse or cleanup.

The filesystem watcher prunes generated and dependency directories, batches hints, and reconciles directory handles after renames or uncertain events. A synchronized request still validates a fresh captured view through the analysis driver.

Owner tests exercise service validation, real filesystem events, framing, socket request dispatch, backpressure, discovery and coordinated startup. The root owns tests spawning the compiled daemon entry.

Startup ownership is written completely before an atomic exclusive link publishes the lock. A recoverable process-id ticket gate serializes lock replacement, dead-owner reclamation and listener startup. The launcher terminates its own child when startup times out before any running record, and never terminates a compatible running daemon. Cancellation leaves the child's ownership visible. Existing legacy empty or malformed lock files cannot prove a dead owner and return an explicit diagnostic; their removal requires an independent ownership check.

Known rename hints refresh only the affected directory and newly discovered subtrees. Unknown watcher events trigger one full reconciliation per batching window, preventing continuous churn from trapping startup in an unbounded rescan loop.

The host remembers at most 100,000 distinct request IDs per connection for exact duplicate rejection. At that lifetime admission bound it sends a failure goodbye requiring reconnect before admitting another request. Opening a fresh connection resets that bounded identity table.

`materialize` holds a publication lock per project root, synchronizes one revision through the contexts child and publishes every requested view from it. `views` selects the API view, the architect view or both; without it the request is Plan 2A's. For the architect view the service asks the contexts child for the revision's dependency facts with the client's lease, pausing `dependencyWait.intervalMs` (250 ms) after each busy answer for at most `dependencyWait.limitMs` (125 s) in total: ready facts render with their test references, unavailable facts or the limit render without consumer lists, and a newer revision ends the invocation as superseded without publishing. `createFilesystemApiViewPublisher` stages every changed target, API areas and the project-root `.ramify-architect` target, switches them in one transaction with the architect target last and `_meta.json` written last, rolls every switched target back on failure, writes nothing for identical bytes, and replaces an existing `.ramify-architect` only when its `_meta.json` names the `ramify.architect-view/1` schema. A stage or backup whose removal fails keeps its sibling marker, so the next publication's recovery reclaims it. The host advertises `materialize-views`.

`measure` is a synchronized, read-only service operation and advertised
capability. It joins the retained inventory measurement and all-module API-view
render only when both name one revision, returning `ramify.measure/1` with the
normative ownership rule, ordered modules/files and outside-module paths. API
projection/render resource failure preserves inventory with uniformly unavailable
view bytes; cancellation, deadline, supersession and invalid inventory end the
whole request. Response assembly counts exact escaped UTF-8 incrementally,
including the negotiated transport envelope, and refuses an oversized document
without truncating its file list. Direct calls reserve the largest legal request
identifier inside the same configured ceiling.
