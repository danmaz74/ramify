# Iteration 1 results: durable session operations

**Acceptance:** S01–S06 implemented and qualified by the focused in-process F1
controls below. This receipt establishes the session provider capability; pi,
run-service migration, native process/transport witnesses and the final full
audit remain their assigned iterations. The retained iteration 0 native
materializer failure is not relabeled as passing.

## Identity and write boundary

Worktree `/home/app/ramify-plan23-01-sessions`, branch
`feat/plan23-01-sessions`; base
`97aa9430bf588c0b4daefc7604bec3d775e2ff0e`. Result HEAD is the commit containing
this receipt, resolved with `git log -1 --format=%H --
ramify-agent/docs/plans/23-session-reuse-and-run-efficiency/iterations/01-results.md`.
The main checkout, other workers, shared harness declaration, run service/shared
records, pi, test registry, manifests and package pins/lockfile were not edited.

Exactly these reserved paths changed beneath `ramify-agent/`:

- `subs/harness/subs/agent/module.ramify`
- `subs/harness/subs/agent/src/interfaces/port.ts`
- `subs/harness/subs/agent/src/interfaces/session-operations.ts`
- `subs/harness/subs/agent/src/session-operations.ts`
- `subs/harness/subs/agent/src/scripted.ts`
- `subs/harness/subs/agent/src/tests/plan23-session-operations.test.ts`
- `subs/harness/src/run/session-store.ts`
- `subs/harness/src/tests/plan23-session-store.test.ts`
- `docs/plans/23-session-reuse-and-run-efficiency/iterations/01-results.md`

## Exported provider and durable behavior

The frozen wire values and store envelope live in agent
`interfaces/session-operations.ts`. `createSessionOperations({sessionStore,
driver})` returns `create`, `continue`, `fork`, `appendContext`, `changeTools`,
`retry`, `stop` and `inspect`. Continue/Retry return a handle exposing persisted
receipt/outcome promises and `stop()`/`settled()`; no new usable point is published
before durable settlement. All signature companions are exposed by the agent
owner to parent and descendants.

Create/Fork allocate stable harness session IDs under run-scoped operation keys.
Immutable session-qualified checkpoints retain exact transcript payload references,
initial instructions, historical definitions, activation, additions and lineage.
One Continue consumes one numbered turn; standalone context/tool changes consume
no turn. A child from turn N continues at N+1 independently. Old settled points
remain forkable while the parent advances. Duplicate terminal inputs return the
original receipt before stale-point checking; changed input, tool definition,
context-key content and stale/concurrent advances conflict.

Harness `openSessionStore({directory})` returns a `LedgerSessionStore` with
`close()`. Immutable bytes are SHA256-addressed and written through ledger
`writeFileExclusive`; duplicate identities must have identical bytes. One ledger
transaction commits all envelope records after payload durability and complete
revision comparison. Ledger replay is authoritative when materialized copies are
missing. The adapter holds the existing harness `ProjectLock` throughout its
writer lifetime; same-process reconstructed adapters share a refcounted lock and
one serialization domain. Replay/CAS/append use the same opened ledger under
that authority. Missing/corrupt payloads, unsupported records and storage failures
never become a fresh session. Closing the last adapter releases ownership.

Intent includes original task, environment, serialized context/authority,
validator and destination values. Fresh functions/events/signals are not stored.
Retry validates actual serialized values, rechecks current authority and claims
an execution owner by CAS. Two reconstructed actors cannot Retry a live claim.
Unknown external owner liveness is conservative; PID liveness and same-process
owner tokens never authorize a blind takeover. Completed failed/stopped Retry
returns its recorded outcome without dispatch.

Each stable tool/submission call journals intent before execution and completion
before acceptance/publication. Known effects return recorded results on recovery;
unknown effects require explicit independently established recovery and otherwise
make the new point unavailable. Known mutation completion is retained before its
separately journaled after-mutation hook. Executed mutating handlers that throw
still run the hook with `failed:true`, while their uncertain completion remains
visible. Recovery runs an absent hook once and a completed hook zero times.

Stop fences execution ownership, callbacks, further dispatch and acceptance.
An interrupted dispatched provider or uncertain external effect returns no
reusable point; historical settled points remain available. Late callbacks cannot
append after terminal settlement. A durable accepted submission whose final opaque
provider result is interrupted resumes provider finalization with its recorded
verdict, without accepting it twice. No budget-return result is invented.

## Provider and integration handoff

`SessionOperationDriver.dispatch({key,session,task,recovering,effects},runtime)`
returns the existing `SessionOutcome`. Driver runtime provides `persistPayload`,
`readPayload`, `callTool`, `submit`, `describeTool`, `assertLive`, `signal` and
`onEvent`. Persist exact opaque provider bytes with immutable stable keys before
dependent dispatches/effects. Ordered transcript entries distinguish agent
preparation metadata from provider-owned bytes; display events are not pi history.
The pi final native request guard must await `runtime.assertLive()` after all
payload transformations and immediately before dispatch, and honor its signal.
On accepted-effect recovery, pi must finalize missing exact provider artifacts
without making another model request. Handler calls and designated acceptance
must use runtime wrappers, never bypass them.

`AgentPort.bindSessionStore?(store)` is the narrow composition seam for an already
constructed port; pi implements it in iteration 7. The scripted factory implements
it and also accepts `options.sessionStore`/`options.operationScript`. Iteration 8
can own one store at its existing run/project state lifetime, bind the existing
agent once, use run-scoped keys, and call `store.close()` when that lifetime ends.
Neither run callers nor web decode provider bytes.

Existing `Script` arrays/functions bridge privately to durable tasks when no
`operationScript` is supplied. The bridge persists scripted provider events before
dependent effects and uses current immutable SessionSpec task/policy/definitions.
Its private actor executes one script without reading/writing legacy sessions;
scripted built-in handlers/actions are enriched behind the agent boundary.
Read/search observations retain the existing scripted behavior, and write/edit
retain real in-process file behavior. Existing Script callbacks continue receiving
current role/system/prompt and submission definitions. Assertions on old provider
refs/start modes must migrate to high-level points/lineage when their caller
migrates. The old port entry points remain temporarily compilable until iteration
9; this introduces no legacy-session reader, migration or fresh fallback.

Iteration 10 must avoid attaching a second generic after-mutation checker to a
shell handler that already owns its serialized mutation/check path. Hook bindings
can select the supplied tool's actual owner contract.

## Verification and discovery

`npm ci` passed with independent worktree dependencies and unchanged lockfile.
Ordinary and testing foreign API views were searched separately for the exposed
ledger primitives before imports. Current agent/ledger declarations were read.
Final declaration refreshes passed and the generated APIs were reopened/searched:

```sh
node_modules/.bin/ramify materialize --from subs/harness/src
node_modules/.bin/ramify materialize --from subs/harness/src/tests
```

Both final runs returned revision 1, two targets and 925 entries. Ordinary metadata
records coverage 1/truncated 1; testing metadata retains its own coverage bounds.
These limits are not complete absent-API claims. Initial final-refresh attempts
failed with worker heap exhaustion; after status proved the daemon held only this
worktree's context, its narrow restart allowed both refreshes to complete. No
other worker daemon/context was stopped. Logs are under
`/tmp/ramify-plan23-iteration01/api-*-restart.log`; the earlier failed refresh logs
remain alongside them. Generated views are not committed.

Final focused command from `ramify-agent/`:

```sh
npm run test:quick -- subs/harness/subs/agent/src/tests/plan23-session-operations.test.ts subs/harness/src/tests/plan23-session-store.test.ts subs/harness/subs/agent/src/tests/scripted.test.ts
```

Passed **3 files/31 tests**: 8 agent lifecycle controls, 16 actual-file store and
recovery controls, and 7 unchanged scripted regressions. Final focused duration
3.52 seconds. The independently fixed F1 outcomes include exact role bytes,
T1/C1 forks and isolated sibling turn 2, duplicate keys and terminal stale replay,
active-parent fork, concurrent CAS, immutable definitions and inactive calls,
original-input/policy conflict, before/after intent, dispatch, known result,
accepted-result and outcome interruptions, actual-file reopening, uncertain effect
non-replay, explicit independent effect recovery, live two-store Retry refusal,
authority denial during recovery, final-dispatch Stop fencing, delayed late tool
completion, and before/after mutation-check interruption. Publication interruption
retains the committed receipt without repeating destination effects.

`npm run type-check` passed all four configured compiler scopes.
`npm run check:self` completed/passed with **0 errors, 0 warnings**, 12 owners,
647 source files, 50 resources and 12,573 accesses; coverage remains partial with
313 analysis limits. `git diff --check` passed. Logs:
`/tmp/ramify-plan23-iteration01/{focused,type-check,check-self}.log`.

All new tests use real in-process services/files and scripted provider/effect
answers under the ordinary process guard. No direct complete suite, full audit,
new boundary registration, live provider call, performance comparison, push or
merge was performed. These controls establish ordinary session/storage behavior;
they do not replace iteration 14's native kernel/transport and full qualification.

## Accepted quiescence amendment, 2026-10-08

Provider `f5ef60e5ff909c559e2af277b8b279c01f29a7e5`, joined at
`425cb8d787210ca7f9e408bcb46df359dbb7ad5a`, corrects receipt/idle conflation found
during iteration 8 integration. Stop aborts and fences a durable receipt promptly
with no reusable point for dispatched/unknown effects; `stop()` and `settled()`
separately await actual driver, admitted tool/guard/mutation hook/payload work,
queued persistence and publication. Normal completion drains admitted work before
a reusable receipt. Current public signatures are unchanged.

A process-wide owner-token barrier survives terminal fencing and is shared by
reconstructed factories. A separate owner-checked CAS attests internal
`quiescent: true` only after drainage; exact terminal receipt, effects and session
points remain unchanged. A live foreign owner without that marker cannot prove
idle and reports typed unavailable quiescence. The harness retains its captured
settlement deadline and independently confirms process/tree settlement.

New independent controls cover delayed ignored-signal tool and mutation hook,
detached tool/payload at normal driver return, blocked guard, publication,
reconstructed Stop/terminal Retry, and a completed marker with live foreign PID.
Pi final-hook and production-store liveness controls now observe the receipt
fence before releasing blocked work and awaiting actual drainage. The worker
retains its initial old-control timeout in `/tmp/plan23-quiescence-receipt.md`;
that run is not passing evidence. Final worker selection: 3 files/60 tests.

Integrator executed the engine, Pi prefix preservation/session modes, production
store and scripted selections: **5 files/78 tests passed**; all four type scopes
passed; structural check passed with 0 errors, 0 warnings and 317 analysis limits.
Logs: `/tmp/ramify-plan23-integrated-quiescence-*.log`. No native/live/full audit
claim is made by this amendment. Exact five paths are recorded in write-sets.
