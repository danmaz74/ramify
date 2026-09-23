# Iteration 2 results: lineage and the metrics correction

**Date:** 2026-09-23. **Owner:** `harness`. **Branch:** `feat/plan9-session-model`.

Continuation, forking, replacement, request and degradation are recorded as
relations between harness points, and the metrics group invocations by the
harness session. No relation names an executor's ref, and nothing above the
port reads one to decide which session an invocation belongs to.

## Final names

Later iterations depend on these names. They replace the Lineage table of
the [main plan](../main-plan.md#lineage) where the two differ.

### Points and relations

In [run/records.ts](../../../../subs/harness/src/run/records.ts):

| Name | Shape |
| --- | --- |
| `sessionPointSchema`, `SessionPoint` | `{ session, invocation }`, the end of one of the session's invocations, or `{ session, append }`, the result of one append, by its `brief-appended` sequence. Strict: never both, never a ref |
| `continueRelationSchema`, `ContinueRelation` | `{ from: SessionPoint, reason: ContinueReason, briefs: string[] }` |
| `forkRelationSchema`, `ForkRelation` | `{ from: SessionPoint, reason: 'placement-request', generation, briefs: string[] }` |
| `replaceRelationSchema`, `ReplaceRelation` | `{ session, reason: 'reconstructed' \| 'context-rebuilt' }` |
| `requestRelationSchema`, `RequestRelation` | `{ invocation, reason: 'contract-needed' }` |
| `degradeRelationSchema`, `DegradeRelation` | `{ requested: 'continue' \| 'fork', actual: 'fresh' \| 'continue' \| 'fork', reason: string \| null }` |

`briefs` are decision IDs. `ContinueReason` is `continueReasonSchema`:

| Reason | Loop | When |
| --- | --- | --- |
| `placement-answered` | local architect | its placement request was decided or came back unresolved |
| `iteration-closed` | local architect | the iteration it assigned closed, a contract iteration included |
| `completion-refused` | local architect | its completion was refused while evidence was owed |
| `repair` | local architect, engineer, contract engineer | a gate failed after its result |

`forkReasonSchema`, `replaceReasonSchema` and `requestReasonSchema` hold the
other reasons above.

### Where each relation is recorded

In [run/log.ts](../../../../subs/harness/src/run/log.ts). Every field is
optional, so the log stays `ramify-agent.job/3`.

| Relation | Event | Field |
| --- | --- | --- |
| continue | `invocation-started` | `continues`, on every `continued` start |
| fork | `session-opened` | `fork`, on every session whose start was a fork |
| replace | `session-opened` | `replaces`; the replaced session is finished before it opens (`replaced` for a reconstruction, `lost` for a rebuilt context) |
| request | `session-opened` | `requestedBy`, on a contract sub-session |
| degrade | `invocation-ended` | `degraded`, on an invocation whose actual start differs from the one requested |

Who records what:

| Session | Relation |
| --- | --- |
| Global fork | `fork` from `GlobalContext.point`, with its generation and `appended` briefs |
| First fork after a rebuild | `replaces` the previous generation's parent, `context-rebuilt`; it forks from nothing |
| Local architect, continued | `continues` from its previous invocation's end, with the reason its loop set |
| Engineer, continued | `continues` from its previous invocation's end, `repair` |
| Engineer, reconstructed | `replaces` the lost session, `reconstructed` |
| Contract engineer | `requestedBy` the engineer invocation whose `contract-needed` result opened it, `contract-needed`; `continues` for a `repair` |

### The reducer and the context

In [run/sessions.ts](../../../../subs/harness/src/run/sessions.ts):

- `RunSession` gains `point` (its latest point, null before its first
  invocation ends), `fork`, `replaces` and `requestedBy` (each null where
  absent).
- The reducer rejects, with the event's sequence, a `continues` whose point
  is not the session's latest, a `continues` on an `opened` start, a `fork`
  from a point no session has reached (an invocation still awaited, one
  that never ran, an append that did not happen), a `replaces` naming a
  session never opened, and a `requestedBy` naming an invocation that never
  started. A fork's source may be in any state.
- `invocationSessions(events)`: each invocation's session, read from its
  `invocation-started`, without validating the log. It is the metrics'
  grouping.
- `samePoint(left, right)` and `pointLabel(point)` (`ses-0001 at inv-0001`,
  `ses-0001 at append 12`).

In [architecture/context.ts](../../../../subs/harness/src/architecture/context.ts),
`GlobalContext` gains `point`, the harness point beside `ref` (null exactly
when `ref` is), and `previous`, the session that held the generation before
a rebuild.

In [run/service.ts](../../../../subs/harness/src/run/service.ts),
`InvocationRequest` gains `continuing`, `fork`, `replaces` and `requestedBy`.
`runInvocation` throws for a continued start without `continuing` and a
forked start without `fork`, and derives the continuation's point and briefs
from the log (`continuationOf`), not from the loop's executor ref.

### The metrics grouping

[projections/metrics.ts](../../../../subs/harness/src/projections/metrics.ts)
sets `InvocationFacts.session` from `invocationSessions(view.events)`. The
grouping by `outcome.session.ref` is gone, and `kpi/metrics.ts`'s
`sessionsOf` now groups by the harness session. `kpi/1` is unchanged: the
formula is the same, and its input is now the session the formula meant.

Projected events name the relations: `forked from ses-0001 at inv-0001
(placement-request, generation 1)`, `in place of ses-0004 (reconstructed)`,
`requested by inv-0005 (contract-needed)`, `continuing session ses-0002 from
ses-0002 at inv-0002 (placement-answered)`, and `it started fresh where fork
was requested: <reason>`. A point's invocation and a requester are event
references of kind `invocation`.

## Decisions on iteration 1's open items

1. **The engineer's continuation names its previous invocation's end.**
   Before continuing an engineer the harness appends `Continuing iteration
   …` and continues from the executor ref that append returns. That append
   is the executor's way of starting the segment, not a harness point: it
   carries no brief, is keyed per attempt, and no other session continues or
   forks from it. Recording it as a `brief-appended` would make the
   reducer's appends mean two things. So `continues.from` is the previous
   invocation's end, the session's latest point, and the harness point and
   the executor's ref differ here by that note. Iteration 5 may show the
   note in the `started` entry of the segment it begins.
2. **Degradation is recorded at `invocation-ended`.** The design put it on
   `invocation-started`, but that event is committed before `startSession`,
   and the actual start is known only after it. `invocation-ended` carries
   `degraded` for any start whose actual mode differs from the requested
   one; `outcome.json` records the same, as before. A dedicated event after
   `startSession` would show a degraded start while its invocation runs, at
   the cost of a new crash boundary; nothing needs that before iteration 9,
   which may add it. An interrupted invocation's degradation is unknown.

## Changes from the design

1. **Degrade is at `invocation-ended`,** as decided above.
2. **A reconstruction is a replacement, not a degradation.** The engineer
   loop decides to reconstruct before it starts anything, so the new session
   records `replaces` and starts fresh; `invocation.json` keeps its
   `requested: continued` with the harness's reason, as before. `degraded`
   records only what the executor answered.
3. **A request is recorded for a contract sub-session only,** as the plan's
   Work names. An engineer opened by an assignment and a fork opened by a
   placement request are not recorded as requested: their work names the
   iteration or request, and the fork relation names its source.
4. **The fork's generation and briefs are the architect context's,** read
   from `GlobalContext` at the fork. A fork taken after a failed rebuild
   fork forks that fork's end, as the context already did.
5. **Every lineage field is optional in the schema;** the reducer checks a
   relation where one is present and the run service always writes one for
   a start that is not fresh. The first fork after a rebuild, which starts
   fresh, names the session it replaces and no fork.
6. **The composition suite** names a producer for each value its composed
   runs do not write (`repair`, `completion-refused`, both replace reasons,
   both degrade requests and `fresh`), and records `continue` and `fork` as
   degrade outcomes nothing produces: the port degrades to fresh.

## Exit evidence

From `ramify-agent/`:

```sh
npx vitest run subs/harness/src/tests/session-reducer.test.ts \
  subs/harness/src/tests/session-lifecycle.test.ts \
  subs/harness/src/tests/run-recovery.test.ts subs/harness/src/tests/composition.test.ts \
  subs/harness/src/tests/kpi-metrics.test.ts subs/harness/src/tests/union-values.test.ts
# 6 files, 101 tests passed
npm run type-check
# passed
npm run check:self
# Execution: completed; check: passed; coverage: partial
# Findings: 0 errors, 0 warnings, 87 analysis limits (the baseline's 87)
```

- **Every non-fresh start names its point and reason.** The scripted run of
  iteration 1 (`session-lifecycle.test.ts`) now traces each relation: the
  global fork `forked from ses-0001 at inv-0001 (placement-request,
  generation 1, briefs [])`, the consumer architect continued for
  `placement-answered` and `iteration-closed`, the provider engineer for
  `repair`, and the contract sub-session `requested by inv-0005
  (contract-needed)`. The test checks that every `continued` start has
  `continues` from its own session, that a session has `fork` exactly when
  its invocation asked to fork, and that none of the executor refs the run
  produced (more than ten: every outcome's and every append's) appears in
  any relation.
- **Replacement and degradation.** `iteration-gate.test.ts` shows a
  reconstructed engineer `replaces` its lost session with `reconstructed`;
  `placement.test.ts` shows the fork that rebuilt the context replaces
  `ses-0001` with `context-rebuilt`, and a new test there forgets the
  context and the architect's session so that a fork and a continuation both
  end `degraded` to `fresh` with the executor's reason, their requested
  relations unchanged. `requirement-verification.test.ts` shows the turn
  after a refused completion continues for `completion-refused`.
- **Reducer.** `session-reducer.test.ts` covers the moving point, a
  continuation from a stale point, a fork from reached and unreached points
  of a suspended and a finished source, an unknown replaced session and
  requester, and `invocationSessions`.
- **ST04.** `kpi-metrics.test.ts` builds a run's records line by line and
  reads them through `metricsOf`: one session continued at 1000 then 3000
  bytes, each invocation ending at another ref, and one of 500. It counts 2
  sessions, and `session-weighted-total`'s subtotal is 3500: the continued
  session once, at its largest. Run with the old grouping, the same test
  fails with 3 sessions.

Other files whose subject changed, run together: the 53 run-driving,
projection and recovery files, the six above among them (52 passed, 1
skipped as before; 413 tests passed, 2 skipped), and the six integration
files (7 tests passed).

## Open items

- **A degraded continuation stays in its session.** A continued start the
  executor answered fresh joins its harness session with no history, so
  `session-weighted-total` counts it once with its predecessor, at the
  larger size. Iteration 10 defines the lineage measurements and may count a
  degraded segment as a fresh context.
- **A degraded start is known only at the invocation's end,** as decided
  above.
- **The metrics documents** still say "distinct pi sessions"; iteration 10
  owns them.
- The standalone session has no lineage: its one invocation is fresh.
