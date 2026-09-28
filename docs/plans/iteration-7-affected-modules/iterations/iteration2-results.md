# Iteration 2 results: context scheduling, daemon operation and root service

**Date:** 2026-09-28. **Branch:** `feat/plan7-affected-modules`, from `5e2504ba`.
**Status:** complete. Every A7-06 to A7-08 instance passes; `npm run type-check`
and `npm run check:self` pass.

## What changed

Iteration 1's deviations are resolved:

- `RetainedSession.affected` is required in
  `subs/analysis/src/interfaces/session.ts`, the authorized analysis edit. The
  worker's guard for a session without the member
  (`subs/analysis/src/session-worker.ts`, one line) is removed with it.
- The member is forwarded by `ownedSession` in `src/resident-assembly.ts`, the
  counted session in `subs/daemon/src/service.ts`, and the reference harness
  wrapper `scripts/reference-harness/session-driver-operations.ts` (see
  deviation 5). It is added to the stubs in `subs/daemon/src/tests/measure-driver.ts`,
  the three stubs in `subs/daemon/src/tests/session-counters.test.ts` and
  `subs/daemon/subs/contexts/src/tests/scripted-driver.ts`.
- The root relay of the eight analysis types was not repeated. A worker failure
  still answers `invalid-revision`.

Contexts (`subs/daemon/subs/contexts/`):

- `interfaces/contexts.ts`: `AffectedRequest` with the contract's fields,
  `ContextAffectedOutcome` (shape below), and `ContextManager.affected(request,
  lease, control?)`.
- `queue.ts`: `PendingAffected`, a third pending kind with the rendezvous shape
  of `PendingApiView`; `completeAffected`; `unavailableAffected`, which turns a
  lifecycle `Unavailable` into the affected variant with `revision: null` and
  `unknownModules: []`; `completeEntry` completes all three kinds.
- `context-manager.ts`: one scheduling path for both queries.
  - Synchronized freshness takes `apiView`'s path. The deadline and
    cancellation arming and the synchronized rendezvous that `apiView` had
    inline are now the shared `arm` and `rendezvous`, used by `apiView` and
    `affected` alike. The coverage test, the capture that joins the request,
    `coverQueued` and the expected-content mismatch (`mismatchAffected`) are the
    existing ones.
  - Published freshness uses the published-check wait. `publishedCheck` is now
    `publishedWait`, covering check and affected entries, so a waiting affected
    request is delivered after the next publication, receives a reported
    failure as `unavailable/analysis-failed`, and receives analysis errors and
    evictions exactly as a waiting check does.
  - `deliverAffected` pins the publication's history slot, calls
    `session.affected({ sequence, modules?, paths? })` at that revision's session
    sequence with a request-owned abort signal, and translates the answer:
    `answered` at the same sequence answers; `answered` at another sequence is
    `superseded`; `invalid-revision` while the live session has moved past that
    sequence is `superseded`; every other refusal is `unavailable` with the
    session's reason, message, unknown IDs and the revision. A thrown query is
    `unavailable/analysis-failed`.
- `README.md`: the owners.md purpose sentence appended to the first paragraph.

Daemon (`subs/daemon/`):

- `service.ts`: `affected` with `guard('affected', ...)`, the client's context
  lease via `pair`, the manager call, `timings.service` on an answer, and the
  response bound. As for `measure`, an answer is counted as its complete response
  envelope against the transport's `maxResponseBytes`, or the direct
  `maxResponseBytes` with the largest legal request id; over the bound it is
  `unavailable/resource-unavailable` with the revision, never truncated.
  `dispatchServiceRequest` has `case 'affected'` inside the response budget,
  as `measure`.
- `validation.ts`: `affected` in the operation set and its wire guard: exact
  fields (`token`, `requestId`, `freshness`, optional `modules`, `paths`,
  `deadlineMs`), a valid token and request id, either freshness mode, `modules`
  an array of nonempty strings, `paths` an array of strings, each list at most
  10,000 entries, and a safe-integer deadline in 1 to 600,000 ms.
- `codec.ts`, `host.ts`: `affected` in the accepted and advertised capability
  lists.
- `connection.ts`: the gated `affected` method, answering
  `unsupported-operation` ("The daemon does not support affected") when the
  welcome lacks the capability; an answered reply gains `clientTransport` as
  check and materialize replies do. `connect-daemon.ts` forwards the method.
- `client-entry.ts`: relays `affected.ts`'s types. `AffectedRequest` and
  `ContextAffectedOutcome` arrive through the existing contexts relay, the
  service types through the service relay.
- `module.ramify`: `AffectedRequest, ContextAffectedOutcome` appended to the N5
  contexts relay. `README.md`: the purpose sentence.

Root:

- `src/interfaces/service.ts`: `affected` in `ServiceOperation` and
  `ServiceCapability`; `AffectedParams = AffectedRequest`;
  `AffectedOutcome = ContextAffectedOutcome`; `RamifyService.affected`.
- `module.ramify`: `AffectedRequest, ContextAffectedOutcome` appended to the R7
  daemon relay. `README.md`: the purpose sentence.
- `src/tests/quick-environment.ts`: `affected` in the quick welcome and on the
  quick connection; `request('affected', ...)` dispatches it; new
  `sessionDriver()` (see deviation 6).

Tests:

- `subs/daemon/subs/contexts/src/tests/affected.test.ts`: 8 tests over the
  scripted driver with the controlled watcher and clock, one per A7-06 instance
  and a second `A7-06:deadline` test for the cold answer before any publication.
- `subs/daemon/src/tests/affected-service.test.ts`: 4 tests, one per A7-07
  instance, over real services and analysis on a disposable four-module project
  (`app -> mid -> core`, and `lone`).
- `subs/daemon/src/tests/ipc.test.ts`: 3 tests, one per A7-08 instance, over the
  real socket host and the public client.
- `subs/daemon/src/tests/codec.test.ts`: `A7-07:capability` for the welcome
  schema.
- `src/tests/entry-boundaries.test.ts` with `clientEntryBoundary` in
  `entry-boundary-cases.ts`: the built client entry imported in a traced Node
  process loads no analysis, compiler, contexts, host or UI module and opens
  nothing.
- `src/tests/resident-assembly.test.ts`: the resident session handle and the
  quick environment's connection and request both answer `affected`.

Every expected selection is written by hand from the fixture's stated edges.
`A7-07:equivalence-with-session` also opens an independent retained session
through `sessionDriver()`, asserts that its `inputId` equals the daemon answer's
`inputId` and its revision fingerprint, and compares the two selections as plain
JSON, both parsed and as the exact serialized string.

## Final `ContextAffectedOutcome`

```ts
export type ContextAffectedOutcome =
  | { readonly status: 'answered'; readonly requestId: string; readonly revision: ContextRevision;
      readonly freshness: FreshnessRecord; readonly result: AffectedSelection; readonly timings: ReplyTimings }
  | { readonly status: 'pending' | 'cold'; readonly requestId: string;
      readonly current: ContextStatus }
  | { readonly status: 'deadline-exceeded'; readonly requestId: string;
      readonly revision: ContextRevision | null; readonly elapsedMs: number }
  | { readonly status: 'superseded'; readonly requestId: string;
      readonly revision: ContextRevision | null }
  | { readonly status: 'cancelled'; readonly requestId: string }
  | { readonly status: 'unavailable'; readonly requestId: string; readonly revision: ContextRevision | null;
      readonly reason: AffectedUnavailableReason | UnavailableReason; readonly message: string;
      readonly unknownModules: readonly string[] };
```

The `pending`, `cold`, `deadline-exceeded`, `superseded` and `cancelled`
variants are exactly those of `ContextApiViewOutcome` and root's `MeasureOutcome`.
The `unavailable` variant is theirs plus the contract's `revision` and
`unknownModules`. `revision` is null for a lifecycle outcome (unknown context,
expired generation, disposal, eviction, a failed capture, a lost session or a
thrown query) and the queried revision for a session answer.

## Behavior by request and state

| Request/state | Answer |
| --- | --- |
| Synchronized, covered by the published revision | Answered from it with no capture; `reusedRevision: true`. |
| Synchronized, not covered | Joins the next capture as `apiView` does; answered from the revision it publishes. |
| Published, the live session holds the published revision and no capture other than periodic maintenance runs | Answered from it at once; `verified: false`. |
| Published, `revision` names another revision | `superseded` with the published revision; no session query. |
| Published, cold context, `wait: false` | `cold` with the status before the request; the request's activity reopens the context. |
| Published, no publication or a capture running, `wait: false` | `pending`. |
| Published, `wait: true` | Waits for the next publication, which a cold context's reopening or a running capture supplies; a warm context whose session moved past its publication with nothing running or due starts a request capture. |
| Invalid published revision | `unavailable/invalid-current` from that revision, never from `lastValid`. |
| Deadline | `deadline-exceeded` with the acknowledged revision, or `cold` with the status before any publication. The capture continues. |
| Cancellation or lease release | `cancelled`; a running session query is aborted and the history pin released. |

## Commands and outcomes

From the worktree root:

| Command | Outcome |
| --- | --- |
| `npm run type-check` | first run failed: `scripts/reference-harness/session-driver-operations.ts` lacked `affected` (deviation 5); after forwarding it, passed (exit 0) |
| `npx vitest run subs/daemon/subs/contexts/src/tests/affected.test.ts subs/daemon/src/tests/affected-service.test.ts subs/daemon/src/tests/codec.test.ts subs/daemon/src/tests/ipc.test.ts` | passed: 4 files, 49 tests |
| `npm run build` | passed (exit 0; the existing explorer chunk-size warning) |
| `npx vitest run src/tests/resident-assembly.test.ts src/tests/entry-boundaries.test.ts subs/daemon/src/tests/session-counters.test.ts subs/daemon/src/tests/measure-service.test.ts` | passed: 4 files, 18 tests (run after the build, because the client-entry boundary case imports `dist/`) |
| `npx vitest run subs/daemon/subs/contexts/src/tests/api-view.test.ts subs/daemon/subs/contexts/src/tests/covering.test.ts subs/daemon/subs/contexts/src/tests/deadlines.test.ts subs/daemon/subs/contexts/src/tests/context-manager.test.ts` | passed: 4 files, 90 tests (deviation 7) |
| `RAMIFY_ENDPOINT_DIR=$(mktemp -d) npm run check:self` | passed: 15 owners, 446 source files, 17 resources, 6,761 accesses; 0 errors, 0 warnings, 0 analysis limits; 4,725 allowed, 0 denied |
| `RAMIFY_ENDPOINT_DIR=<same> dist/src/ramify daemon stop` | `Stopped: daemon stopped explicitly`; the daemon process is gone |

During development the new test files were also run alone while they were
written. The whole Vitest suite was not run.

## Deviations from contracts.md and owners.md

1. **Non-answered variant fields.** Aligned with the measure outcome as the
   contract asks: `pending` and `cold` carry `current: ContextStatus`,
   `deadline-exceeded` and `superseded` carry `revision`. The `unavailable`
   variant keeps the contract's fields.
2. **Session reasons pass through unchanged.** `apiView` folds session refusals
   into `analysis-failed` or `resource-unavailable`; the affected union admits
   `AffectedUnavailableReason`, so `invalid-query`, `unknown-module`,
   `missing-facts`, `invalid-current`, `resource-limit`, `invalid-revision`
   and `analysis-failed` reach the client as the session gave them. A worker
   failure therefore answers `unavailable/invalid-revision` with the failure's
   message and the revision, unless the live session has moved past the
   sequence, which is `superseded`. An operation error on a live session
   answers `unavailable/analysis-failed`, a reason the iteration 1 review
   fixes added.
3. **Published freshness details the contract left open.** A named
   `freshness.revision` other than the published one answers `superseded`,
   because the session answers only its current revision. A published request
   during a capture that could move the session answers `pending` or waits.
4. **Wire seed bound.** Each seed list is at most 10,000 entries on the wire, so
   the session's 4,096-seed bound stays a domain `invalid-query` answer up to
   that size; larger lists are `invalid-request`. `paths` entries may be empty
   strings on the wire; the session answers them `invalid-query`.
5. **Reference harness wrapper.** `scripts/reference-harness/session-driver-operations.ts`
   implements `RetainedSession` and was missing from iteration 1's list. It now
   forwards `affected`; without it `npm run type-check` fails.
6. **`QuickEnvironment.sessionDriver()`.** Daemon tests cannot import
   `openRetainedSession` or root's `createSessionDriver`. The quick environment,
   root's testing exposure, now returns a production session driver independent
   of the service's own, which the caller disposes. `A7-07:equivalence-with-session`
   uses it.
7. **Extra focused test runs.** `apiView`'s arming and rendezvous became shared
   helpers and the scripted driver changed, so the four contexts test files that
   exercise that code were run as well (90 tests, all passing).
8. **Root purpose sentence.** The owners.md root sentence, "It assembles the
   affected-module service and its batch form.", is appended now, before the
   batch form exists in iteration 3.
9. **Counters.** The service does not add affected outcomes to the check-only
   `coldOutcomes`, `deadlineOutcomes` or `coveredRequests` counters, as
   `measure` does not.

## Cases not satisfied

None.

## Handoff to iteration 3

- Client method: `connection.affected(params: AffectedParams, control?: RunControl):
  Promise<ServiceResult<AffectedOutcome>>` on `ServiceConnection` (the public
  `connectDaemon` connection) and on the quick connection. When the welcome lacks
  `affected`, the socket connection answers `{ ok: false, error: { code:
  'unsupported-operation', message: 'The daemon does not support affected',
  details: {} } }` without sending. Check `connection.daemon.capabilities`
  before opening a context, as `measure-command.ts` does.
- Types: `AffectedParams` and `AffectedOutcome` from `src/interfaces/service.ts`;
  `AffectedRequest` and `ContextAffectedOutcome` from
  `subs/daemon/src/context-types.js` (relayed to root's descendants by R7);
  `AffectedSelection` and the other analysis types through R3. The capability
  and operation name is `affected`.
- Quick environment: its connection has `affected`, its welcome lists
  `affected`, and `environment.request('affected', params)` dispatches the
  operation through the codec. `environment.sessionDriver()` opens an
  independent retained session for comparisons.
- Freshness: send `{ mode: 'synchronized', expect: [] }`, as `measure` does; it
  requires a sweep and answers from the revision it publishes or reuses.
- Outcomes for exit codes: `answered` exits 0 whatever `selection` is;
  `unavailable` with `unknown-module` or `invalid-query` is the contract's exit 1
  and carries `unknownModules`; every other `unavailable`, `pending`, `cold`,
  `superseded` and `deadline-exceeded` is exit 2; `cancelled` is 130. An unknown
  context or expired generation is an `ok: true` `unavailable` value with
  `revision: null`, not a service error. Malformed params are the service error
  `invalid-request`.
- An answered value carries `revision` (use `revision.sequence` and
  `revision.fingerprints.inputId`, which equals `result.inputId`), `freshness`,
  `result` and `timings`, with `timings.service` and, over a socket,
  `timings.clientTransport`.
- The daemon architecture service table row, the CLI invocation contract and
  the README command list remain for iteration 3. The root README purpose
  sentence is already present.

## Addendum: review fixes

**Date:** 2026-09-28, on `0629ccb1`.

1. **A named published revision is compared again at delivery.** A published
   request naming a revision was compared with the published one only on
   arrival, so one that then waited for a running capture or a cold context's
   reopening was answered from the next publication, a different revision.
   `deliverAffected` now completes such a request as `superseded`, with the
   current published revision and no session query, when the publication it
   would answer from is not the named one. The contexts test
   `A7-06:superseded named-revision-after-wait` names revision 1 with `wait:
   true` during a capture that publishes revision 2 and expects `superseded`
   with revision 2, while the synchronized request that started the capture is
   answered; it fails without the fix. `apiView` and `measure` do not share the
   gap: `ApiViewRequest.freshness` admits only synchronized freshness, and the
   `measure` wire guard requires it, so neither can name a published revision.
   They were not changed.
2. **Response byte bound tests.** `A7-07:validation response-bound` answers the
   same query in a quick environment whose direct `maxResponseBytes` is one
   below the encoded envelope and expects `unavailable/resource-unavailable`
   with the published revision, `unknownModules: []`, the exact message and no
   `result`. `A7-08:round-trip response-bound` does the same over the socket
   with the host's negotiated bound. Real timings differ between runs, so
   `encoded` is the envelope with every number at its one-byte form, a lower
   bound for the refused answer's envelope.
3. **Wire cap tests.** `A7-07:validation` adds `modules` of 10,001 entries,
   refused as `invalid-request` directly and on the wire, and 4,097 distinct
   module IDs on an opened context, answered by the session as
   `unavailable/invalid-query` ("A query names at most 4096 seeds; it named
   4097").
4. **Quick environment drivers.** `QuickEnvironment` records every driver that
   `sessionDriver()` hands out and disposes them all in `dispose()`, after the
   service and before the controls; a driver's disposal is idempotent, so a
   caller's own disposal is harmless. A new `quick-environment.test.ts` case
   shows that a forgotten driver and a caller-disposed one both open nothing
   afterwards.
5. **Replaced session during the query.** An `invalid-revision` refusal from a
   session that was replaced while the query ran deliberately stays
   `unavailable/invalid-revision` with the queried revision, rather than
   `superseded`, because only a live session that has moved past the sequence
   shows that a newer revision of the same session supersedes it.

No other behavior changed.

Follow-up, deferred: affected answers do not restate the invocation's scope per
request as `check` does (`stated()` in `context-manager.ts`), so a resident
answer carries the context's first opener's scope and `inputId`.

| Command | Outcome |
| --- | --- |
| `npm run type-check` | passed (exit 0) |
| `npm run build` | passed (exit 0; the existing explorer chunk-size warning) |
| `npx vitest run subs/daemon/subs/contexts/src/tests/affected.test.ts subs/daemon/subs/contexts/src/tests/api-view.test.ts subs/daemon/subs/contexts/src/tests/covering.test.ts subs/daemon/subs/contexts/src/tests/deadlines.test.ts` | passed: 4 files, 75 tests |
| `npx vitest run subs/daemon/src/tests/affected-service.test.ts subs/daemon/src/tests/ipc.test.ts subs/daemon/src/tests/measure-service.test.ts src/tests/quick-environment.test.ts src/tests/resident-assembly.test.ts` | passed: 5 files, 41 tests (after the build) |

The whole Vitest suite was not run.
