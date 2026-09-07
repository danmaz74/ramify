# Quick testing and transport verification

**Date:** 2026-09-07. **Status:** Decided testing architecture; implementation
follows the capabilities and delivery stages in the tooling plan.

Quick tests exercise real client behavior, routers, services and analysis in one
process. Replace communication boundaries with direct adapters while preserving
the feature logic. This test topology is independent of the production decision
to run the web server and analysis daemon in separate processes.

## Real flows with direct adapters

For the future explorer, exercise this chain:

```text
React route/container and hooks
  -> real tRPC client with direct caller link
  -> real Ramify tRPC router and input middleware
  -> injected in-process analysis service
  -> real context manager and analysis engine
  -> temporary project inputs

real context publication
  -> real event mapping
  -> direct message channel
  -> real client listeners and query updates
  -> rendered UI
```

Production injects the daemon IPC client into the same web router. Quick mode
injects a service binding backed by real contexts and analysis sessions. This
replaces both the HTTP hop and daemon IPC hop without replacing their underlying
checking, synchronization or publication behavior. The binding is the
`daemon`-owned service implementation also called by the IPC host, including its
request validation and dispatch to contexts. Root assembly injects dependencies;
it does not implement another router or bypass validation in quick mode. The
[shared service boundary](processes-and-clients.md#shared-service-boundary)
defines the interface ownership and exposure route.

The tRPC direct caller executes the router's procedures, middleware and input
validation; it is an integration-testing facility. Procedures themselves should
call shared services instead of invoking other procedures through a caller.
[tRPC server-side calls](https://trpc.io/docs/server/server-side-calls)

Before visualization exists, exercise CLI handlers and service flows through
the same in-process binding. Use real output formatting and assert the selected
freshness, structured findings and exit behavior. UI providers and browser
packages are introduced only in the later UI test scope.
The daemon-owned binding arrives with the resident iteration; the preceding
batch-only iteration injects real analysis sessions without a context manager.

MCP tests use the real MCP registration, input validation and response mapping
with an injected in-process analysis service. Exercise a protocol client/server
pair through an in-memory transport when available, then real contexts, the
engine and temporary project files. This does not require tRPC, React or the web
process. Assert the same semantic results as CLI/service queries, including
revision tokens, denials, coverage and unavailable capabilities.

## Harness boundaries

| Part | Quick-mode treatment |
| --- | --- |
| Route/container, hooks and query state | Real components in JSDOM with the actual routing, tRPC and query providers. |
| Router and services | Real Ramify implementations. Supply the service dependencies required by their ordinary contracts. |
| Project files and descriptions | Isolated temporary projects, including real `module.ramify`, source and README changes needed by the scenario. |
| Contexts, checking and publication | Real implementation, including invalid inputs, revision identity and supported source semantics. |
| HTTP and daemon IPC | Direct tRPC caller and in-process service binding. |
| Notification transport | Direct channel carrying the same mapped events; preserve async ordering and subscription behavior used by clients. |
| Clock, watcher timing and external runtimes | Controlled adapters where the scenario needs determinism. Real watcher/subprocess behavior is verified separately. |

Drive the real command or UI action, then assert both user-visible output and
the corresponding backend state or derived result. Setup creates preconditions;
it does not precompute the outcome or call internal mutations in place of the
user's workflow. Deterministic model unit tests remain useful alongside these
flows, with independently stated expected permission outcomes.

The direct caller link must propagate synchronous throws and asynchronous
failures, complete requests, honor cancellation where supported and prevent late
delivery after disposal. Do not preserve a host helper's empty teardown merely
because its happy path works. Each test owns its query client, event listeners,
contexts, sessions and temporary files and releases them on success and failure.

Direct execution must not exploit shared object identity that production loses
through serialization. Use plain-data contracts and exercise the production
codecs explicitly where relevant. A direct channel can carry encoded/decoded
messages, but this alone does not prove network ordering, disconnect or buffer
behavior. Memory tests distinguish test-runner retention from product retention.

## Complementary verification

Quick mode cannot establish HTTP middleware, wire compatibility, actual IPC,
process cleanup or real browser layout. Keep a focused suite at those boundaries:

| ID | Required witness |
| --- | --- |
| QT01 | A CLI workflow uses real services and project inputs; changed descriptions/source produce the independently expected output and backend result. |
| QT02 | An explorer workflow uses the real route, hooks, tRPC router, context manager and engine; revision publication updates the UI consistently. |
| QT03 | Direct callers/channels use the daemon-owned service validation and routing, reject invalid context/scope requests, propagate sync/async errors and dispose canceled or disconnected work without leaving listeners, sessions or timers. |
| QT04 | Real HTTP/IPC tests preserve validation, serialized values, errors, context/revision tokens and notification mapping; a direct call is not accepted as this evidence. |
| QT05 | Real process tests cover concurrent startup, stale discovery, compatibility, idle exit with demand-driven restart, crash recovery and explicit stop even when its notification is lost. Active watch leases prevent idle exit; web/daemon lifetimes remain independent. Long-lived clients never load or spawn a fallback engine. |
| QT06 | Real browser tests cover graph sizing, navigation and interactions whose behavior JSDOM cannot establish. |
| QT07 | Repeated-use and slow-consumer tests cover the limits and cleanup in the memory architecture using the relevant actual transport/process. |
| QT08 | Real MCP handlers agree with service results in quick mode. Separate stdio-process tests verify initialization, framing, protocol-only stdout, errors, cancellation, connection loss and daemon reuse without starting the web server. Optional HTTP hosting gets its own session/reconnect and web-lifetime tests. |

HTTP tests also verify any configured batching, cancellation, output transforms
and error formatting. IPC tests verify framing, size bounds and reconnect behavior.
Real watcher tests verify filesystem changes and reconciliation. These tests
supplement quick mode rather than forcing every semantic scenario through a
full browser and server stack.

## Test ownership and reuse

Daemon, CLI and MCP tests belong to their owners' `src/tests/`, using the fixed
`[testing, dispatch]` profile. Presentation tests use `[testing, ui]`. Full quick
UI tests combining services and views can use the later root child
`integration-tests [testing, ui, dispatch]`, with scenario/test source in its
ordinary `src/` and normal exposure for every foreign binding. Shared test
helpers must have an explicit testing-classified owner and compatible consumers;
there is no profile override or undeclared shared-test directory.

The approach reuses the existing tRPC/direct-caller and message-channel design.
The [explorer reuse analysis](../analysis/project-explorer-reuse.md#quick-testing-and-web-adapter-source)
links to the source patterns and tests to lift. Extract the small adapters and
meaningful workflows into Ramify; do not import the host's entire test world,
service factory, global state or runner configuration.

QT01/QT03 and relevant IPC/process/resource cases accompany the initial CLI and
daemon. QT02, browser HTTP cases and QT06 accompany later visualization.
QT08 accompanies the MCP adapter independently of visualization;
its HTTP-specific part applies only if that extension is delivered. Test
runner/framework configuration and exact fixture placement belong to the
contract and migration review; adding this document does not implement tests
or claim any of these witnesses pass.
