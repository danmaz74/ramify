# Iteration 1 results: Timing fields and watcher timestamps

**Date:** 2026-09-13. **Outcome:** HO-1 and HO-2 pass. Every duration a hook
pays outside `revision.timings.total` is now a field: the worker's invocation
check, worker `status`, worker round trip, daemon publication, service handling
and client transport, together with watcher receipt and flush times. The nine
`RevisionTimings` members keep their keys and values. Direct work; no Studio
workflow.

## Design

The new durations sit in sibling records beside the stage timings, not inside
`RevisionTimings`. Three reasons:

- The published revision is shared. An identical update, including the racing
  hook's second update, returns the previous `SessionRevision` unchanged, so
  per-operation durations placed in it would describe an earlier operation.
- Worker `status`, the round trip and publication are measured after the
  revision is frozen.
- The existing consumers pin the nine stage keys and the rule that every stage
  is at most `total`: `session-worker.test.ts`,
  `scripts/reference-harness/plan5-hosting-cases.ts` (I5-08) and
  `scripts/measurements/fast-assertions.mjs` (`length === 9`). The new
  durations exceed `total` by definition.

Each layer adds only the fields it measures.

| Field | Carried on | Measured in | Meaning |
| --- | --- | --- | --- |
| `invocationCheck` | `SessionUpdate.timings` (`OperationTimings`) | engine `update()`, `subs/analysis/src/session-engine.ts:126-138` | The invocation check at 127-131 plus the request comparison, before `started`. Zero without an invocation. A sweep's engine result has no `timings`; the worker supplies `invocationCheck: 0`. |
| `workerStatus` | `SessionUpdate.timings` | worker, `subs/analysis/src/session-worker.ts:52-58` | The `status()` checkpoint posted with an update or sweep reply. |
| `workerRoundTrip` | `SessionUpdate.timings` | daemon-side host, `subs/analysis/src/session-host.ts:77`, `:98`, `:193` | From the request being posted (after `structuredClone`) until the reply message is received, before RSS sampling. |
| `capture` | `ContextRevision.capture` (`CaptureTimings`) | context manager, `subs/daemon/subs/contexts/src/context-manager.ts:233-240`, `:287-294` | For the capture that published the revision: `invocationCheck`, `workerStatus` and `workerRoundTrip` summed over its update and sweep operations (0 where an operation reports none, such as an open or verify), plus `watch`. |
| `capture.watch` | `ContextRevision.capture` (`WatchBatch \| null`) | `context-manager.ts:172`, `:186`, `:337-342` | The earliest `receivedAt` and latest `flushedAt` of the watcher batches the capture consumed, restored with the changes of a superseded background capture. `null` without watcher input. |
| `timings` | reported `CheckOutcome.timings` (`ReplyTimings`), optional in the type | `context-manager.ts:254`, `:386-407` | The answering capture's `invocationCheck`, `workerStatus` and `workerRoundTrip`, plus `publication`. All four are zero for an answer from an existing publication. An unpublished report carries the capture's work with `publication: 0`. Superseded, cold, deadline and unavailable outcomes have no `timings`. |
| `timings.publication` | `CheckOutcome.timings` | `context-manager.ts:386-388` | `publish()`: fingerprints, candidate bytes, history trimming and admission, and the `revision-published` event. Excludes `hotBudget`. |
| `timings.service` | `CheckOutcome.timings` | daemon service, `subs/daemon/src/service.ts:162-173` | The service `check` call from after parameter validation until the result is returned, including counter observation. |
| `timings.clientTransport` | `CheckOutcome.timings` | socket client, `subs/daemon/src/connection.ts:19-24`, `:118-121` | The client round trip from before encoding to the decoded response, less `service`, floored at 0. Present only on a socket connection. |
| `WatchBatch` | second `WatcherPort` listener argument | filesystem watcher, `subs/daemon/src/filesystem-watcher.ts:19-24`, `:43`, `:75-78` | `receivedAt`: the injected clock at the first event enqueued since the last flush. `flushedAt`: the clock at delivery. |

Durations use `performance.now()` in the process that measures them, matching
the existing stage timings. Watcher times use a clock. `createFilesystemWatcher`
now accepts an optional `Pick<ClockPort, 'now'>` that defaults to `Date.now`,
the same source as `createSystemClock().now`. A listener called without
`batch`, like the controlled watcher's `emit` without times, receives the
context clock's `now()` for both times on delivery.

Relating the fields for a hook: `waitedMs` (CLI) ≈ `clientTransport + service`.
Service handling includes queueing, debounce, each round trip (which includes
`invocationCheck`, the stage `total`, `workerStatus` and IPC) and
`publication`. For a racing hook, `revision.capture` describes the watcher's
update and `timings` the hook's own identical update.

## Schema changes

- `subs/analysis/src/interfaces/session.ts`: adds `OperationTimings`, plus
  optional `timings` on the `revised` and `reported` `SessionUpdate` variants.
- `subs/daemon/subs/contexts/src/interfaces/contexts.ts`: adds `WatchBatch`,
  `CaptureWork`, `CaptureTimings` and `ReplyTimings`. It also adds the
  required `ContextRevision.capture`, optional `timings` on both reported
  `CheckOutcome` variants and an optional `batch` argument on the
  `WatcherPort` listener.
- `subs/daemon/src/codec.ts`: the wire `revision()` validator lists `capture`,
  and a new `capture()` validator requires the three finite non-negative
  durations and `watch` as `null` or integer `receivedAt`/`flushedAt`. Check
  response values are not schema-validated by the codec, so `ReplyTimings`
  needs no codec change.
- Private state: `LiveContext.watched`, `RunningCapture.watch` and
  `spanBatches()` in `queue.ts`.
- `module.ramify` is unchanged. The new contexts types are reachable
  structurally and through `context-types.ts`'s `export type *`; none is
  imported by name outside its owner.

## Files

Source: `subs/analysis/src/interfaces/session.ts`, `session-engine.ts`,
`session-worker.ts`, `session-host.ts`;
`subs/daemon/subs/contexts/src/interfaces/contexts.ts`, `context-manager.ts`,
`context.ts`, `queue.ts`; `subs/daemon/src/filesystem-watcher.ts`,
`service.ts`, `connection.ts`, `codec.ts`.

Tests: `subs/analysis/src/tests/session-revision.test.ts`,
`session-worker.test.ts`, `retained-session.test.ts`;
`subs/daemon/subs/contexts/src/tests/covering.test.ts`,
`context-manager.test.ts`, `scripted-driver.ts`, `controlled-ports.ts`;
`subs/daemon/src/tests/codec.test.ts`, `watcher.test.ts`, `ipc.test.ts`;
`src/tests/resident-assembly.test.ts`.

## Matrix rows

| ID | Test | Result |
| --- | --- | --- |
| HO-1 | `subs/analysis/src/tests/session-revision.test.ts:570` `timing-fields: an update reports its invocation check beside unchanged revision timings`: in-process engine; no invocation gives `invocationCheck: 0`; an identical update with an invocation keeps the same revision and reports `invocationCheck > 0`; a refused invocation reports its check; a computed unchanged-surface update keeps the nine stage keys and adds only `invocationCheck`; equal to batch | pass |
| HO-1 | `subs/analysis/src/tests/session-worker.test.ts:393` `timing-fields: worker replies add the status checkpoint and daemon-side round trip beside the invocation check`: real worker; frozen `{ invocationCheck, workerRoundTrip, workerStatus }`, all positive, round trip ≥ check + status; verify and unchanged sweep carry none | pass |
| HO-1 | `subs/daemon/subs/contexts/src/tests/covering.test.ts:200` `timing-fields: a revision carries its capture's session work and a reply adds publication, zero when covered`: scripted operation timings reach `revision.capture` and reply `timings` with `publication`; a racing identical update's reply reports its own work while the revision keeps its capture; a covered answer reports zeros | pass |
| HO-1 | `subs/daemon/src/tests/ipc.test.ts:102` `timing-fields: a socket check reply carries session work, publication, service handling and client transport`: real service, worker session and socket; all six reply fields finite and non-negative, session work positive, `service ≥ workerRoundTrip + publication`, `revision.capture` equals the single update's work, and the `revision-published` event passes the codec with the same capture | pass |
| HO-1 | `subs/daemon/src/tests/codec.test.ts:164` `timing-fields: accepts a published revision whose capture carries session work and watcher times beside unchanged stage timings`, with `:170` `rejects a revision without its capture or with malformed capture timings` | pass |
| HO-2 | `subs/daemon/src/tests/watcher.test.ts:146` `watcher-timestamps: each batch records its first event receipt and its flush on the injected clock`: fake timers and an injected clock give `{ receivedAt: 1010, flushedAt: 1110 }` and `{ receivedAt: 2000, flushedAt: 2100 }`, frozen; the real-edit test at `:69-70` also requires a time per batch with receipt ≤ flush | pass |
| HO-2 | `subs/daemon/subs/contexts/src/tests/context-manager.test.ts:141` `watcher-timestamps: the update a batch triggers carries its receipt and flush, spanning coalesced and restored batches`: two coalesced batches publish `watch: { receivedAt: 2, flushedAt: 60 }`; a superseded background capture's batch is restored and spans a timeless batch on the context clock (`150` to `260`); a request update without watcher input records `null` | pass |

## Revised test expectations

- Three exact `toEqual` assertions on an identical `update()` now include
  `timings`: `session-worker.test.ts:44-45`,
  `retained-session.test.ts:109-111` and
  `src/tests/resident-assembly.test.ts:43-44`. The last is outside this
  iteration's owners and is updated because the worker reply gained the
  field.
- Test doubles: `scripted-driver.ts` passes optional `ScriptedCapture.timings`
  through to update results, and `controlled-ports.ts` `emit` accepts optional
  batch times.

## Verification

| Command | Result |
| --- | --- |
| `npx vitest run subs/analysis/src/tests` | 11 files, 207 tests passed |
| `npx vitest run subs/daemon/subs/contexts/src/tests` | 8 files, 102 tests passed |
| `npx vitest run subs/daemon/src/tests` | 116 passed, 5 failed, all in `connect.test.ts` with `Missing or incomplete daemon build` (no `dist/` in the worktree). They fail identically on the base with the change stashed. |
| `npm run type-check` | pass (after two strictness fixes in the new tests) |
| `git diff --check` | clean |

Also run: `npx vitest run src/tests/resident-assembly.test.ts` (6 passed), for
the out-of-owner expectation above. The cucumber-viz commit audit runs after
the commit.

## Deviations and limits

- **Sibling records, not new `RevisionTimings` members.** See [Design](#design).
  `ReplyTimings` on `CheckOutcome` is optional in the type so that consumer
  fixtures stay valid; the context manager always sets it on reported
  outcomes.
- **Client transport is not in the CLI document.** The daemon-owned socket
  connection adds `clientTransport` to the reply value, but `ramify.check/1`
  (`changedCommand`) still emits only `timings.daemon`, `waitedMs` and
  `totalMs`. The measurement successor reads CLI JSON, so exposing `reply`
  timings there needs a CLI change; the CLI is not an owner here. Decision
  needed.
- **Publication is on replies only.** A revision cannot carry its own
  publication duration because it is frozen and admitted during publication.
  A watcher-caused revision with no waiting request therefore records no
  publication duration anywhere.
- **Open and verify captures** report zero session work, because `SessionOpen`
  and `VerifyOutcome` gained no timings. The host samples compiler RSS after
  receiving a reply (target 7). That work is outside `workerRoundTrip` but
  inside `service`, and no field isolates it.
- **`src/daemon-entry.ts` still calls `createFilesystemWatcher()`** with its
  `Date.now` default rather than passing the daemon clock. The values are
  identical, and the file is outside this iteration's owners.
- **Order-sensitive heap test.** With the new worker `timing-fields` test
  placed second in `session-worker.test.ts`, the existing `turns an actual
  worker heap exhaustion into an unavailable resource-limit report` failed in 3
  of 4 runs: the 16 MiB worker opened instead of exhausting its heap. It passes
  in isolation, with a bare invocation update in the same position, and on the
  base in 3 of 3 runs. With the new test placed after it (the committed order)
  it passed in 4 of 4 file runs and the full owner run. The open path is
  unchanged, so this looks like pre-existing sensitivity to GC or process
  timing, but it is not proven.

## Handoff

For iterations 2 to 5 and the measurement successor:

- `SessionUpdate.timings: OperationTimings` has `invocationCheck`, which
  iteration 4's HO-10 should drive to about 0 for a matching invocation, plus
  `workerStatus?` and `workerRoundTrip?`.
- `ContextRevision.capture: CaptureTimings` has `invocationCheck`,
  `workerStatus`, `workerRoundTrip` and `watch: { receivedAt, flushedAt } |
  null`. For target 6, `flushedAt - receivedAt` is the batching window plus
  event delivery. The debounce interval runs from `flushedAt` to the capture
  start: `freshness.captureStarted` on a reply, otherwise approximately
  `publishedAt` less the round trip and publication.
- Reported `CheckOutcome.timings: ReplyTimings` has `invocationCheck`,
  `workerStatus`, `workerRoundTrip`, `publication`, `service?` and
  `clientTransport?`. Iteration 5's HO-13 should show a covered-on-publication
  answer with zero session work.
- `WatcherPort` listener: `(events, batch?: WatchBatch)`.
  `createFilesystemWatcher(clock?)`.
- The codec requires `capture` on every wire revision. Any hand-built
  `ContextRevision` sent through `encodeMessage` must include it.
