# Iteration 7 results: Retained-session and context query

**Status:** complete. **Plan:** [Plan 2A](../main-plan.md). **Iteration:**
[iteration7.md](iteration7.md). **Owners:** `analysis` retained
worker/session (`subs/analysis/src/session-*.ts`,
`subs/analysis/src/interfaces/session.ts`) and `daemon/contexts`
(`subs/daemon/subs/contexts/src/**`), plus their focused tests and one new
reference-harness file. Independent of iteration 6.

## Summary

Added `RetainedSession.apiView(query, control?)` end to end: the engine
implementation in `session-engine.ts` (hot/warm/superseded/invalid-revision/
resource-limit/cancellation), the private worker protocol
(`session-messages.ts`, `session-worker.ts`), and the host proxy
(`session-host.ts`). The engine reads `SessionFacts` directly, never calls
`report()` or acquires a project a second time, and chains
`planApiViewRequests` → `RetainedSourceAnalysis.details(...)` →
`projectApiView` exactly as iterations 4/5 handed off. A warm session
rehydrates its compiler with a no-op `adapter.update(...)` and then reuses
the *existing* `#promote()` compiler-read-vs-capture comparison (the same
mechanism a real revision already uses after every compiler operation) to
detect drift; any drift or acquisition problem it raises is reported as
`superseded`, never substituted.

Extended `daemon/contexts` with one serialized `ContextManager.apiView`
operation that is not a bolt-on side call but a **second kind of entry in
the same per-context queue** `check` already schedules, delivers and
cancels through (`queue.ts`'s new `PendingApiView`/`PendingEntry`,
`context-manager.ts`'s generalized `analyze()`/`coverQueued()`/`evict()`/
`release()`). This is what makes "the query runs while the revision slot is
held" concrete rather than aspirational: an apiView entry's
`RetainedSession.apiView` call happens from inside the exact `Promise.all`
the owning capture already awaits before clearing `context.running`, so no
later capture for that context can start first. A dated "Revision
(iteration 7)" note in `contracts.md` records this mechanism and one
additional wiring decision (`ContextManagerOptions.apiViewLimits`, optional,
defaulting to the frozen iteration-1 bounds) precisely, per the
coordinator's instruction.

## Files changed

### `analysis` (owned)

- `subs/analysis/src/interfaces/session.ts` — added
  `RetainedSession.apiView(query: ApiViewQuery, control?: RunControl):
  Promise<ApiViewQueryOutcome>`. No other type changed (the nine `ApiView*`
  types were already added by iteration 5).
- `subs/analysis/src/session-engine.ts` — implemented `Session.apiView(...)`
  and a private `#rehydrate(signal?)` helper on the `Session` class (the
  direct, in-worker implementation of `RetainedSession`). Imports
  `planApiViewRequests`/`projectApiView` from `./api-view.js` and
  `originalKey` from model.
- `subs/analysis/src/session-messages.ts` — added the `apiView` operation to
  `SessionCommand`'s union and `ApiViewQueryOutcome` to `WorkerResult`.
- `subs/analysis/src/session-worker.ts` — added the `apiView` case to the
  worker's request switch.
- `subs/analysis/src/session-host.ts` — added `SessionHost.apiView(...)`,
  proxying the worker request; a disposed-session rejection (`code:
  'session-disposed'`) maps to `{status:'unavailable', reason:
  'invalid-revision', ...}` — the same reason the direct engine gives a
  post-disposal query — rather than the generic `'analysis-failed'` every
  other host-side failure uses.
- `subs/analysis/src/tests/session-test-fixture.ts` — no functional change;
  `instrumentCompiler`'s pass-through proxy already bound `details` from
  iteration 4's authorized stub, and `RetainedSession` fakes were not needed
  here (this fixture's `opened()` always returns a real, direct `Session`).
- `subs/analysis/src/tests/api-view-session.test.ts` (new, 10 tests) — all
  nine `I2A-08` leaves at the session/engine level, plus one end-to-end test
  through the real worker/host wiring (`openRetainedSession` from
  `../index.js`, not the direct engine).

### `daemon/contexts` (owned)

- `subs/daemon/subs/contexts/src/interfaces/contexts.ts` — added
  `ApiViewRequest`, `ContextApiViewOutcome`, `ApiViewQueryLimits` (all
  exactly as contracts.md's frozen shapes; `ApiViewQueryLimits` is a new,
  implementation-level type — see "Contract deviations"), extended
  `ContextManagerOptions` with optional `apiViewLimits`, and extended
  `ContextManager` with `apiView(request, lease, control?):
  Promise<ContextApiViewOutcome>`.
- `subs/daemon/subs/contexts/src/queue.ts` — added `PendingApiView` beside
  `PendingCheck`, both now carrying a `kind` discriminant; `PendingEntry =
  PendingCheck | PendingApiView`; `RunningCapture.requests` retyped to
  `readonly PendingEntry[]`; added `completeApiView` and `completeEntry`
  (the latter resolves either kind through the one outcome shape —
  cancellation or `Unavailable` — every union shares).
- `subs/daemon/subs/contexts/src/context.ts` — `LiveContext.queue`/
  `deliveries`/`requested` retyped from `PendingCheck`-only to the
  `PendingEntry` union.
- `subs/daemon/subs/contexts/src/context-manager.ts` — the bulk of the
  iteration: `apiViewLimits` resolution with a frozen default; a shared
  `expectationMismatch` helper factored out of the old `mismatch`, plus a
  new `mismatchApiView` (same check, no `mismatches` field, per
  contracts.md); `identityCovered`/`covers`/`fresh` retyped to accept either
  entry kind; a new `deliverApiView` (pins the revision, calls
  `RetainedSession.apiView`, translates its five outcome kinds into
  `ContextApiViewOutcome`, translating `resource-limit` to the existing
  `resource-unavailable` `UnavailableReason` and every other session
  `reason` to `analysis-failed`); a new `apiView(request, lease, control?)`
  request function mirroring `check`'s synchronized-only rendezvous
  (deadline, cancellation, expected-content queueing, immediate
  `configuration-changed`, the `covers()` fast path); `analyze()` generalized
  to collect, run and deliver both entry kinds from one capture; `evict`,
  `release` and the `run.status === 'reported'`/catch/`finally` bulk
  paths generalized via `completeEntry`/`publishedCheck` (a small type-guard
  helper, since an apiView entry is structurally never `published`-mode).
- `subs/daemon/subs/contexts/src/tests/scripted-driver.ts` — the fake
  `RetainedSession.apiView` (scriptable via a new `apiViewPending` queue,
  recorded per-session in a new `ScriptedSession.apiViewCalls`); a new
  exported `testApiViewLimits`.
- `subs/daemon/subs/contexts/src/tests/session-fixture.ts` — `sessionEnvironment`
  now accepts and forwards `apiViewLimits` (defaulting to
  `testApiViewLimits`), and exposes a new `apiView(...)` request helper
  alongside the existing `check(...)`.
- `subs/daemon/subs/contexts/src/tests/api-view.test.ts` (new, 8 tests) —
  controlled context-level coverage: basic projection, joining a `check` and
  an `apiView` into one capture/revision, the `covers()` fast path, expected-
  content supersession, immediate `configuration-changed`, session
  `resource-limit` → context `resource-unavailable` translation, deadline
  (`cold`), and cancellation.

### Shared reference-harness infrastructure (not an iteration 6/8/9 owner
file; a mechanical, required fix)

- `scripts/reference-harness/session-driver-operations.ts` — added
  `apiView: session.apiView.bind(session)` to the forwarding `RetainedSession`
  port `interceptSessionOperations` builds around a real production session;
  this file's `RetainedSession` literal became a compile error the moment
  `interfaces/session.ts` gained the method, exactly like the two
  authorized-elsewhere fixture fixes above. No other file in
  `scripts/reference-harness/` needed this (see "Parallel-owner type
  errors" below for who else does).
- `scripts/reference-harness/plan2a-session-cases.ts` (**new**, per the
  brief's explicit instruction) — the nine `I2A-08` handlers, exported as
  `plan2aSessionHandlers: ReadonlyMap<string, InstanceHandler>`. Uses a
  small, independently transcribed real project tree (not imported from
  `subs/analysis/src/tests/session-test-fixture.ts` or my own
  `api-view-session.test.ts`), a real worker-based `openRetainedSession`,
  and an independent oracle (`analyzeProject` + the same
  `planApiViewRequests`/`projectApiView` pair, over a *fresh disposable
  batch* acquisition and compiler — a different lifetime from the session
  under test) compared by shape (category/defining-file/entry
  name/form — not `SymbolDetail`, since the oracle stubs signatures rather
  than re-resolving the compiler a second time).

No file under `analysis/model`, `analysis/project`, `analysis/typescript`,
daemon service/validation/codec/connection/host, root `src/**`, `cli`, or
`plan2a-runtime.ts`/`plan2a-instances.ts`/`verify.ts` was touched.

### Documentation

- `docs/plans/iteration-2a-materialized-api-view/contracts.md` — added a
  dated "Revision (iteration 7, 2026-09-15)" note under "Context operation"
  recording the serialization mechanism and the `apiViewLimits` wiring
  decision precisely (see "Contract deviations").

## Matrix leaves executed (I2A-08, all nine)

| ID | Evidence | Result |
| --- | --- | --- |
| `I2A-08:current-valid-query` | `api-view-session.test.ts` (F, unit, oracle comparison against `planApiViewRequests`/`projectApiView` run directly); `plan2a-session-cases.ts` (F, real worker session vs. independent disposable-batch oracle, shape-compared) | Passed |
| `I2A-08:invalid-or-historical` | Both files: stale sequence, unknown sequence, non-canonical location, each isolated | Passed |
| `I2A-08:hot-details` | Both files: `status().level === 'hot'`/`adapter.hot` asserted before the query; a real `described` signature is present | Passed |
| `I2A-08:warm-rehydration` | Both files: `releaseCompiler()` → `status()`/`hot` becomes warm → query recreates the compiler, publishes no revision (`session.current` reference-equal before/after), and matches the earlier hot projection exactly | Passed |
| `I2A-08:new-observation-supersedes` | Both files: a disk edit made only after `releaseCompiler()` (never observed by `update()`) makes the rehydrating query `superseded`; the session then recovers cleanly through a real `update()` | Passed |
| `I2A-08:no-report-or-rescan` | `api-view-session.test.ts`: `vi.spyOn(handle, 'report')` (0 calls) and `revisionsEntered()` (the fixture's own `recomputeAll`/`revise` entry-point counter, unchanged); `plan2a-session-cases.ts`: a real-process `report` call-count wrapper (0 calls) plus unchanged `current.sequence`/`status().observedInputs` | Passed |
| `I2A-08:query-serialization` | Both files: an unawaited `update()` immediately followed by an unawaited `apiView()` naming the *not-yet-published* next sequence resolves projected at that sequence (included); a second round names the sequence that was current *before* a second in-flight update and is rejected `invalid-revision` (cannot replace) | Passed |
| `I2A-08:query-limits` | Both files: `{maxAreaBytes:1, maxInvocationBytes:1}` against the fixture's real (non-empty) projection deterministically returns `resource-limit`, not a partial catalog | Passed |
| `I2A-08:query-disposal` | Both files: an already-aborted signal returns `cancelled` with no projection; two identical repeated queries both succeed with unchanged `status().factBytes`; a query after `dispose()` is explicit `unavailable/invalid-revision` | Passed |

Controlled context-level coverage (not separately named `I2A-08` leaves, but
required by the iteration's "controlled context tests" and "query
serialization/racing" instructions): `api-view.test.ts`'s 8 tests — basic
projection and one-call-per-request accounting, joining a `check` and an
`apiView` into the exact same capture/revision, the `covers()` fast path
(no new session `update`/`sweep` call), expected-content mismatch →
`superseded` (no `mismatches` field, unlike `CheckOutcome`), immediate
`configuration-changed`, session `resource-limit` → context
`resource-unavailable` translation with the original reason folded into the
message, `cold` on a deadline with no prior publication, and cancellation of
a queued request.

## Commands run

| Command | Outcome |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.portable.json` (repeated after each edit group) | Clean throughout |
| `npm run type-check` (final run) | Every error is in a file outside this iteration's ownership (see "Parallel-owner type errors"); zero errors in any file this iteration touched |
| `npx vitest run subs/analysis/src/tests/ subs/analysis/subs/model/src/tests/ subs/analysis/subs/typescript/src/tests/ subs/analysis/subs/project/src/tests/` (baseline, before my new test file) | 49 files, 779 tests passed — confirms my interface/engine/worker/host edits caused no regression anywhere in `analysis`, including the existing retained-session audit/equivalence suite (`retained-session.test.ts`, `session-revision.test.ts`, `session-worker.test.ts`) |
| `npx vitest run subs/daemon/subs/contexts/src/tests/` (baseline) | 9 files, 137 tests passed — confirms the `check` path is unaffected by the `PendingEntry` generalization |
| `npx vitest run subs/analysis/src/tests/api-view-session.test.ts` | 10/10 passed |
| `npx vitest run subs/daemon/subs/contexts/src/tests/api-view.test.ts` | 8/8 passed |
| `npx vitest run subs/analysis/src/tests/ subs/daemon/subs/contexts/src/tests/` (final combined run, after all fixes) | 27 files, 403 tests passed |
| `npx tsc -p scripts/reference-harness/tsconfig.json --noEmit` | Errors only in `resident-assembly.ts`/`service.ts` (root/daemon core, iteration 8) |
| Direct handler smoke run of `plan2aSessionHandlers` (temporary `tsx` script placed under `scripts/reference-harness/`, deleted after use, matching iteration 5's precedent) | All 9 handlers passed, 24 total assertions |
| `npm run reference:verify -- --plan 2a --iteration 7` | **Not executed as a pass/fail gate**: `plan2a-runtime.ts` does not yet import `plan2aSessionHandlers` (the coordinator wires new handler maps in, per the brief); running it now would only show `I2A-08` as `not-executed`, not a real gate. See "Handoff" for the exact export/capability the coordinator needs. |

Not run (per the brief's hard rules): bare `npm test`, non-dry
`npm run reference:report`, full Plan 1/2/5 `reference:verify` gates,
`npm run build`, `dist/src/ramify check --batch`.

## Design notes worth recording precisely

- **Why `Session.apiView` reuses `#promote()` rather than a new comparison.**
  Iteration 4's handoff and the coordinator's own instruction both pointed
  here: `#promote()` is already the exact mechanism a real revision uses
  after every compiler operation to verify the compiler's own filesystem
  reads did not silently diverge from the observer's captured input list
  (byte/hash comparison per path, plus the observer's own
  incomplete/invalid classification). Calling `adapter.update({changed:[],
  created:[], deleted:[], inventory:null, invalidateAll:false})` on a
  released adapter reopens it directly from disk (`RetainedSourceState`'s
  own `#open()`, unchanged by this iteration) without a new *project*
  inventory walk (the session's own `inventory`/`areas` are reused
  unchanged; only the compiler's own configuration/program discovery runs
  again). `#promote()` then either returns normally (nothing drifted, the
  hot path proceeds) or throws — every throw except a genuine cancellation
  is reported as `superseded` with `state.observer.inputId` as
  `observedInputId`, and `state.stale = true` is set so the *next real*
  `update()`/`sweep()` unconditionally takes the broad recomputation path
  rather than trusting the now-suspect incremental state. This satisfies
  scope.md's "may read that captured view but may not perform another
  project inventory walk or build a second model/report" precisely: no
  `recomputeAll`, no `revise`, no `link`, no `decide` call anywhere in
  `apiView`'s or `#rehydrate`'s bodies.
- **Why `analysis-failed` is the fallback reason for every non-`resource-
  limit` session `unavailable`.** `ApiViewQueryOutcome.reason` has five
  values (`invalid-revision`, `invalid-location`, `invalid-projection`,
  `resource-limit`, `analysis-failed`); `ContextApiViewOutcome`'s
  `Unavailable.reason` is the pre-existing, unrelated `UnavailableReason`
  enum (`unknown-context`, `expired-generation`, `evicted-revision`,
  `unobserved-input`, `resource-unavailable`, `analysis-failed`,
  `unsupported-setup`, `disposed`, `configuration-changed`) that already
  serves `check`. The two enums share only `analysis-failed`, so
  `deliverApiView` folds every session reason except `resource-limit` (→
  the existing `resource-unavailable`) into `analysis-failed`, prefixing the
  message with the original session-level reason (e.g. `"invalid-location:
  ..."`) so nothing is silently lost for a caller inspecting the message.
  This is a plain, necessary mapping between two already-frozen enums, not
  a new contract decision.

## Contract deviations

1. **`ApiViewQueryLimits` is a new type, not previously named in
   contracts.md.** contracts.md's "Analysis projection" section already
   names `SymbolDetailLimits`/`maxAreaBytes`/`maxInvocationBytes` as fields
   of `ApiViewQuery` (the *session*-level request), but says nothing about
   where `ContextManager.apiView` — which accepts no such fields on
   `ApiViewRequest` by design (a caller cannot loosen a frozen bound per
   request) — sources them from. `ApiViewQueryLimits` names exactly that
   triple as one type in `interfaces/contexts.ts`, and
   `ContextManagerOptions.apiViewLimits?: ApiViewQueryLimits` is the wiring
   point, defaulting to contracts.md's own frozen iteration-1 numbers
   inside `createContextManager` when a caller supplies none. Recorded as
   the dated "Revision (iteration 7)" note in contracts.md itself, per the
   coordinator's explicit instruction, rather than only here.
2. **The serialization mechanism** (one merged `PendingEntry` queue rather
   than a `check`-then-separately-call-`apiView` composition) is likewise
   recorded in that same contracts.md revision note, since the coordinator
   asked for the "exact final signature" to be frozen there, not only
   described in this results file. The two designs are not
   interchangeable: composing `check` and a separate `session.apiView` call
   after its promise resolves would leave a real race window (another
   queued update could start and even complete between the two awaits),
   which is exactly what the "query-serialization"/racing requirement rules
   out. The merged-queue design closes that window structurally, not by
   convention.

No deviation from `contracts.md`'s frozen `ApiViewRequest`/
`ContextApiViewOutcome`/`RetainedSession.apiView`/`ContextManager.apiView`
shapes themselves; every field and outcome-union member matches verbatim.

## Remaining limits

- **`I2A-08:query-limits`'s S1000 evidence is a tuned small-fixture bound
  crossing, not a re-run S1000.** Per the brief's explicit instruction and
  the carried-forward Plan 5/iteration-1 measurement policy: Plan 5's
  retained session already refuses S1000 at its 96 MiB
  `maxRetainedFactBytes` limit (a predecessor limitation this plan
  preserves, not a new pass or a new failure this iteration introduces).
  `apiView`'s own area/invocation resource-limit path is exercised exactly
  and deterministically by the fixture's `{maxAreaBytes:1,
  maxInvocationBytes:1}` case instead. Worker-heap exhaustion during an
  `apiView` call is not separately forced: it would surface through the
  same `SessionHost`/worker `resourceLimits` machinery iteration 4's and
  the pre-existing session-worker tests already cover (a killed/OOM worker
  rejects every in-flight request, `apiView` included, through the same
  `#fail`/`#rejectPending` path every other operation uses); no new
  worker-level fault-injection test was added specifically for `apiView`,
  since nothing about `apiView`'s worker-message framing is
  operation-specific enough to need one beyond the wiring itself (already
  exercised end-to-end by both files' "real worker wiring"/`plan2a-session-
  cases.ts` tests).
- **`I2A-08:no-report-or-rescan`'s "no rescan" half is a coarser proxy at
  the reference-harness level than at the unit-test level.** The unit test
  (`api-view-session.test.ts`) instruments the exact `recomputeAll`/`revise`
  entry points via `session-test-fixture.ts`'s existing `vi.mock` hook
  (`revisionsEntered()`), which is authoritative. The harness handler
  (`plan2a-session-cases.ts`, which runs as a plain `tsx` process with no
  test-mocking framework available) instead asserts `session.current?.
  sequence` and `session.status().observedInputs` are unchanged across the
  call — a real, honest signal (a new inventory walk or model rebuild would
  necessarily either publish a new revision or change the observed input
  count) but not a direct call-count instrumentation. This is recorded
  explicitly rather than silently claiming the same precision twice.
- **The context-level `apiView` deadline never fires the `covered` fast
  path for a request whose `expect` list is empty**, exactly mirroring
  `check`'s existing `scope: 'report'` behavior (`needsSweep = !expect.
  length`, identical formula, intentionally reused rather than
  reinvented). A materialization client that always wants "whatever is
  current" therefore always pays for a full capture/sweep; a client that
  names concrete expected content can be answered from the `covered` fast
  path. This is not a limitation this iteration introduced — it is
  `check`'s own long-standing rule, now shared by construction.

## Required follow-up for other owners

1. **`src/resident-assembly.ts`, `subs/daemon/src/service.ts` and
   `subs/daemon/src/tests/session-counters.test.ts`** each construct a
   literal `RetainedSession` (a real production wiring object in the first
   two, hand-rolled test fakes in the third) and now fail `npm run
   type-check` with "Property 'apiView' is missing." These are root/daemon-
   core files this iteration's brief explicitly forbids touching (iteration
   8's scope). Iteration 8 needs one `apiView` member added to each: the
   production two should forward to the real session's `apiView` (the same
   one-line pattern this iteration used in
   `scripts/reference-harness/session-driver-operations.ts`); the test
   fakes need whatever scripted/stub answer their own test bodies want
   (mirroring `scripted-driver.ts`'s new `apiViewPending`/`apiViewCalls`
   pattern in `daemon/contexts`'s own tests, if useful as a reference).
2. **Iteration 8's `daemon` service/validation/codec layer** constructs the
   production `ContextManagerOptions` (via `resident-assembly.ts` or
   equivalent) and should pass the frozen `apiViewLimits` explicitly (even
   though it is optional and defaults correctly) so the production wiring
   is self-documenting rather than relying on the default silently
   matching contracts.md's numbers forever. The exact object shape and
   values are in `context-manager.ts`'s `defaultApiViewLimits` constant and
   contracts.md's own frozen-limits summary table.
3. **The reference-harness coordinator wiring** — see "Handoff" below for
   the exact export name, and the `session` capability (already defined;
   no new capability name needed).

## Parallel-owner type errors (not mine to fix, beyond #1 above which is a
separately itemized follow-up)

At the time of this iteration's final `npm run type-check`, these are the
only remaining errors, all in files this iteration's brief forbids editing:

- `src/resident-assembly.ts:53` — `RetainedSession` literal missing
  `apiView` (root, iteration 8).
- `subs/daemon/src/service.ts:45` — same (daemon core, iteration 8).
- `subs/daemon/src/tests/session-counters.test.ts:29,82,133` — same, three
  hand-rolled fakes (daemon core tests, iteration 8).

## Handoff

For iteration 8 (daemon service, client and CLI command), which joins this
operation with iteration 6's renderer/publisher inside the daemon service:

- **`ContextManager.apiView(request: ApiViewRequest, lease: LeaseId,
  control?: RunControl): Promise<ContextApiViewOutcome>`** is implemented
  and tested exactly per contracts.md's frozen shapes (both types unchanged
  from what iteration 7's own `iteration7.md` and contracts.md already
  specified before this iteration ran). Import both from
  `subs/daemon/subs/contexts/src/interfaces/contexts.ts` (already exported
  via that file's existing wildcard, reachable at `daemon`'s own level with
  no further relay — the same reasoning owners.md's "Cross-subtree relay
  additions" item 5 already recorded for the sibling `ApiViewPublishLimits`/
  etc. types).
- **`ContextManagerOptions.apiViewLimits?: ApiViewQueryLimits`** is new and
  optional. Iteration 8 should supply it explicitly from contracts.md's
  frozen iteration-1 values when constructing the production
  `ContextManager` (see "Required follow-up" #2); omitting it is not wrong
  (the default matches), but explicit is preferable for a production
  wiring site.
- **Semantics iteration 8 must preserve when calling `apiView`:** it is
  already fully serialized against `check` (both share one queue), fully
  deadline/cancellation/lease-aware via the existing `RunControl`/lease
  machinery, and already returns the *complete*, final
  `ContextApiViewOutcome` — iteration 8's service layer needs only to
  validate `MaterializeParams`, translate it into one `ApiViewRequest` (the
  `selection`/`freshness`/`deadlineMs` fields map directly), call
  `contextManager.apiView(...)`, and on `status: 'projected'` pass
  `outcome.projection` to iteration 6's renderer/publisher — still while
  holding nothing further itself, since the projection is already
  ephemeral plain data (no compiler/filesystem handle) safe to move across
  that boundary. On every other status, iteration 8's
  `MaterializeOutcome` mapping is close to direct: `superseded`,
  `cancelled`, `deadline-exceeded`, `pending`/`cold` and `unavailable` all
  carry the same fields `CheckOutcome`'s equivalents already do, needing at
  most a status-name rename per contracts.md's own "Root service and wire"
  section (already specified, unchanged by this iteration).
- **Reference-harness wiring** (for the coordinator, not iteration 8): the
  new file is `scripts/reference-harness/plan2a-session-cases.ts`, exporting
  `plan2aSessionHandlers: ReadonlyMap<string, InstanceHandler>` with all
  nine `I2A-08` leaves keyed by their exact IDs
  (`I2A-08:current-valid-query`, `:invalid-or-historical`, `:hot-details`,
  `:warm-rehydration`, `:new-observation-supersedes`,
  `:no-report-or-rescan`, `:query-serialization`, `:query-limits`,
  `:query-disposal`). It needs the existing `'session'` capability (already
  registered in `runner.ts`'s `capabilityPrerequisites`; no new capability
  name). Wire it into `plan2a-runtime.ts` the same way
  `plan2aProjectionHandlers`/`plan2aSymbolDetailsHandlers` were merged in
  iteration 5 (spread into the runtime's handler map, add `'session'` if
  not already in the runtime's capability set — it should already be,
  since Plan 5's own session handlers use it).
