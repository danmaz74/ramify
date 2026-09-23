# Iteration 1 results: session identity and lifecycle

**Date:** 2026-09-23. **Owner:** `harness`. **Branch:** `feat/plan9-session-model`.

Every invocation of a run now belongs to a recorded session, and each
session's state is derived from the run log by a pure reducer. Run end and
recovery finish every session the run still keeps. The standalone session
records its executor and model.

## Final names

Later iterations depend on these names. They replace the Events table of the
[main plan](../main-plan.md#events) where the two differ.

### Identifiers and vocabulary

In [run/records.ts](../../../../subs/harness/src/run/records.ts):

| Name | Definition |
| --- | --- |
| `SessionId` | `string`. A run's session is `ses-0001`, `ses-0002`, …, counted from the committed `session-opened` events. |
| `sessionId(count)` | Formats the identifier, like `invocationId`. |
| `sessionIdSchema` | `/^ses-\d{4,}$/`. Every session field in the run log uses it. |
| `sessionFinishReasonSchema`, `SessionFinishReason` | `work-closed`, `run-ended`, `lost`, `replaced`, `interrupted`, `not-kept`. |
| `invocationWorkSchema`, `InvocationWork` | `{ workItem?, iteration?, request? }`, strict, shared by `Invocation.work`, `session-opened` and `invocation-started`. |

A standalone session keeps its existing identifier, `20260921T101500Z-a1b2c3`.

### Run log events

In [run/log.ts](../../../../subs/harness/src/run/log.ts). Every `session` field
is a `SessionId`.

| Event | Data |
| --- | --- |
| `session-opened` (new) | `session`, `role` (`roleSchema`), `work` (`InvocationWork`), `executor` (the agent port's `name`), `model` (string, or `null` where the executor chose its own) |
| `invocation-started` | `invocation`, `role`, and new: `session`, `work`, `start` (`'opened'` for the first invocation of the session just opened, `'continued'` for one that joins a suspended session) |
| `invocation-ended` | `invocation`, `ended`, `submission`, and new: `session` and `kept`. It is a discriminated union on `kept`: `{ kept: true }`, or `{ kept: false, finished: SessionFinishReason }` |
| `session-finished` (new) | `session`, `reason` (`SessionFinishReason`) |
| `brief-appended` | `decision`, `generation`, `outcome`, and `session`, now the harness session that holds the architect context. The executor's opaque point, formerly `session`, is renamed `ref` |

`session-opened` is appended immediately before its invocation's
`invocation-started`. Iteration 2 adds the lineage relations as optional
fields beside these: on `session-opened` for fork, replace and request, on
`invocation-started` for continue and degrade. An optional field reads every
log this iteration writes, so it needs no version change.

### Record versions

| Record | Version | Change |
| --- | --- | --- |
| `job.json` | `ramify-agent.job/3` (`jobSchemaVersion`) | The run log with sessions. A `job/2` run is refused as unsupported, never read as corrupt. |
| standalone `session.json` | `ramify-agent.session/2` | Gains `model: string \| null` beside `agent`, the executor's name. |

`invocation.json` and `outcome.json` are unchanged, at version 1: the session
is in the events.

### The reducer

In [run/sessions.ts](../../../../subs/harness/src/run/sessions.ts):

- `reduceSessions(events: readonly RunEvent[]): RunSessions` folds the whole
  log; `applySessionEvent(sessions, event): RunSessions` applies one event and
  returns the same map for an event it does not read.
- `RunSessions = ReadonlyMap<SessionId, RunSession>`, in the order the
  sessions were opened.
- `RunSession`: `id`, `role`, `work`, `executor`, `model`, `state`,
  `invocations` (in order), `awaiting` (the invocation awaited while live;
  `null` before its first starts and while not live), `appends` (the
  `brief-appended` sequences), `finished` (the reason, or `null`), `opened`
  and `changed` (each `{ sequence, at }`).
- `SessionState = 'live' | 'suspended' | 'finished'`.
- `InvalidSessionTransitionError` carries `sequence`, `session`, `from`
  (`SessionState | 'none'`), `event` (with `, kept` or `, finished` for
  `invocation-ended`) and `detail`.
- `sessionEventTypes` names the five events it reads; `sessionsIn(sessions,
  state)` filters by state.

Interrupted is not a state. A reader shows a live session whose harness is
gone as interrupted; for a standalone session,
`standaloneSessionState(outcome)` in
[sessions/records.ts](../../../../subs/harness/src/sessions/records.ts) answers
`finished` or `interrupted`.

### The transitions

| From | Event | To |
| --- | --- | --- |
| none | `session-opened` | live, awaiting nothing yet |
| live, no invocation started | `invocation-started`, `opened` | live |
| live | `invocation-ended`, kept | suspended |
| live | `invocation-ended`, finished | finished |
| suspended | `invocation-started`, `continued` | live |
| suspended | `brief-appended` | suspended |
| suspended | `session-finished` | finished |
| live, no invocation started | `session-finished` | finished |

`invocation-ended` must name the invocation the session awaits, and an
invocation starts once. Every other pair is rejected with the event's
sequence.

### Reasons by loop

| Session | At its invocation's end | Released later |
| --- | --- | --- |
| Initial architect | kept when submitted; it becomes the architect context | `lost` when an append finds the context unreadable and `global-context-rebuilt` follows; otherwise `run-ended` |
| Global fork | `not-kept`, except the first fork after a rebuild, which becomes the context and is kept when submitted | as the initial architect |
| Local architect | kept after a placement request, an assignment or a completion request; `not-kept` after a yield, an unresolved request or no submission | `work-closed` after `work-item-completed`; `not-kept` when a provider's report ends its turn |
| Engineer | kept after a proposed completion; `work-closed` after a partial, unsuitable or contract-needed result, or its iteration's last budget return; `not-kept` after an earlier budget return or no submission | `work-closed` when its iteration closes after a gate; `replaced` when the session is lost and reconstructed; `lost` when reconstructions are spent |
| Contract engineer | kept after an established agreement; `work-closed` after an incomplete one or a budget return; `not-kept` after no submission | `work-closed` when its iteration closes after a gate |

Any invocation that ends while the run is ending is finished as `run-ended`.
Recovery ends an interrupted invocation with its session finished as
`interrupted`.

## Changes from the design

1. **`invocation-ended` is discriminated on `kept`.** The design's "`kept`,
   or `finished` with a reason" is `kept: true`, or `kept: false` with
   `finished: <reason>`.
2. **`invocation-started.start`** names the start relation as `opened` or
   `continued`. The relation's data is iteration 2's.
3. **A session opened whose first invocation never started accepts
   `session-finished`.** A run can end, or the harness can crash, between the
   two appends. Run end finishes such a session as `run-ended`, recovery as
   `interrupted`. The rule is one: `session-finished` finishes a session
   whose harness awaits no invocation of it. The design counted the opening
   and the first start as one transition.
4. **Run end is one serialized write.** `endRun` appends `session-finished`
   for each kept session, then the terminal event, under the run's write
   lock, so no invocation starts between them. A session whose invocation
   is still awaited at run end, such as a stop whose grace expired, stays
   live: its end is that invocation's own, and a reader shows it
   interrupted.
5. **The executor's ref in `brief-appended` is `ref`,** and `session` is the
   harness session. `GlobalContext` gains `session` (the harness session
   holding the context) and renames its executor point to `ref`.
6. **The record versions.** `job.json` moves to `job/3`, since the events
   change; `invocation.json` does not gain the session identifier the
   analysis sketched, since the events carry it.
7. **The model.** `RunServiceOptions.model` is recorded on every
   `session-opened`. The server resolves pi's model before the run service
   opens and records it; the scripted fake records `null` unless a test
   passes one. The standalone command records pi's resolved model.
8. **Two new crash boundaries.** `RunWrite` gains `session-opened` and
   `session-finished`, and the composed recovery table has a row for each
   (35 rows). Every row is held to one rule for the sessions recovery
   finishes, rather than listing them: each kept session as `run-ended`, each
   opened without an invocation as `interrupted`, just before the
   interruption, with no live or suspended session left.
9. **Projected events.** `session-opened` and `session-finished` have
   summaries; the protocol gains no `session` reference kind, which is
   iteration 6's.

## Exit evidence

From `ramify-agent/`:

```sh
npx vitest run subs/harness/src/tests/session-reducer.test.ts \
  subs/harness/src/tests/session-lifecycle.test.ts \
  subs/harness/src/tests/run-recovery.test.ts subs/harness/src/tests/composition.test.ts
# 4 files, 46 tests passed
npm run type-check
# passed
npm run check:self
# Execution: completed; check: passed; coverage: partial
# Findings: 0 errors, 0 warnings, 87 analysis limits (the baseline's 87)
```

- **Every valid transition, every other pair rejected.** The reducer test
  takes five states (none, opened, live, suspended, finished) by seven events
  (35 pairs): the eight valid ones reach their states and the other 27 are
  rejected with the event's sequence.
- **The scripted run.** `session-lifecycle.test.ts` runs a continued local
  architect, a global fork whose brief is appended back to the architect
  context, a contract sub-session, a provider engineer continued for a
  repair after its first gate failed, and the resumed consumer's fresh
  architect. It states the sessions after each of the 44 session events and
  checks that every other event leaves them unchanged.
- **No suspended session in a final run.** The composition suite derives the
  sessions of all 14 composed runs, completed, failed and stopped: every
  invocation belongs to a session, and none is live or suspended.
- **Recovery.** `run-recovery.test.ts` finishes an interrupted invocation's
  session as `interrupted`, a session opened with no invocation as
  `interrupted`, and a kept session as `run-ended`. The three
  `composition-recovery*` files hold all 35 rows to the rule above (37 tests
  passed).
- `lost` and `replaced` are asserted in `placement.test.ts` and
  `iteration-gate.test.ts`, which the composition suite names as their
  producers.

Other files whose subject changed, run together: the three
`composition-recovery*` files, `placement`, `iteration-gate`,
`single-session`, `union-values`, `run`, `run-protocol`, `work-items`,
`stop-before-start`, `writer-settlement`, `analysis-submission`, `http`,
`run-projections` and `progress` (16 files, 180 tests passed). Earlier, the
40 run-driving files and the 8 integration files passed (7 passed, 1
skipped as before). One mistyped filter, `src/tests`, also ran every test
file once: 114 passed and 1 skipped, 821 tests passed.

## Open items

- **The engineer's continuation append.** Before continuing an engineer the
  harness appends `Continuing iteration …` to its session and continues from
  the returned ref. It is not a `brief-appended`, and so not a point. Iteration
  2 decides whether a continue names this append or the previous
  invocation's end.
- **Degradation is known after the start event.** `invocation-started` is
  appended before `startSession`, and the actual start is known only after
  it (`AgentSession.start`). Iteration 2 records the degrade relation where
  the actual start is known, such as `invocation-ended` or the outcome.
- **A stop whose grace expires** leaves its invocation's session live in a
  stopped run, as before this iteration left the invocation open.
- **A `session` reference kind** for projected events belongs to the
  iteration 6 protocol.
- The standalone `session.json` names its executor `agent`, where the run log
  says `executor`; iteration 6 maps the two.
