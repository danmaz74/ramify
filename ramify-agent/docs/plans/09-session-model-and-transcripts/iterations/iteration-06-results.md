# Iteration 6 results: session queries

**Date:** 2026-09-23. **Owner:** `harness`, and the `web` client's fetch
functions. **Branch:** `feat/plan9-session-model`.

A client can now list every session of the project, read a run's sessions
with their invocations, lineage and the diagram elements each reaches, page
through a transcript, follow several sessions of a run with one poll, and
fetch a body on demand. Every answer is a projection: nothing here writes.

## Final names

### Routes

All are `GET`, under `/api/v1`, built by `protocolPaths` in
[paths.ts](../../../../subs/harness/src/interfaces/protocol/paths.ts).

| Route | `protocolPaths` | Response schema |
| --- | --- | --- |
| `/sessions?offset=<n>` | `sessions(offset = 0)` | `sessionListResponseSchema` |
| `/sessions/standalone/:session` | `standaloneSession(session)` | `standaloneSessionResponseSchema` |
| `/sessions/standalone/:session/transcript?after=<n>` | `standaloneTranscript(session, after)` | `sessionTranscriptResponseSchema` |
| `/sessions/standalone/:session/bodies/:hash` | `standaloneBody(session, hash)` | `sessionBodyResponseSchema` |
| `/sessions/standalone/:session/files?path=<path>` | `standaloneFile(session, path)` | `sessionBodyResponseSchema` |
| `/plans/:planId/runs/:runId/sessions` | `runSessions(planId, runId)` | `runSessionsResponseSchema` |
| `/plans/:planId/runs/:runId/sessions/:session/transcript?after=<n>` | `runSessionTranscript(planId, runId, session, after)` | `sessionTranscriptResponseSchema` |
| `/plans/:planId/runs/:runId/sessions/updates?version=<v>&cursors=<session>:<n>,…` | `runSessionUpdates(planId, runId, version, cursors)` | `sessionUpdatesResponseSchema` |
| `/plans/:planId/runs/:runId/bodies/:hash` | `runBody(planId, runId, hash)` | `sessionBodyResponseSchema` |
| `/plans/:planId/runs/:runId/sessions/:session/files?path=<path>` | `runSessionFile(planId, runId, session, path)` | `sessionBodyResponseSchema` |

`offset`, `after` and `version` are counts, 0 when absent; anything else
is `invalid-request`. `cursors` is `<session>:<after>` pairs, comma-separated.
Each session may appear once, and at most 50 may be named. A malformed pair is
`invalid-request`. So is a `version` after the run's last event. A session the
run never opened is `not-found`, and so is an unknown run or standalone
session. A run that exists but is not served is reported as the run queries
report it (`unsupported-version` or `unreadable`).

### The protocol file

[interfaces/protocol/sessions.ts](../../../../subs/harness/src/interfaces/protocol/sessions.ts)
imports only `zod` and its siblings `evidence.ts`, `ids.ts`, `jobs.ts`,
`runs.ts` and `transcripts.ts`.

| Name | Shape |
| --- | --- |
| `sessionQueryLimits` | `sessions: 200`, `runSessions: 500`, `entries: 200`, `pageBytes: 512 KiB`, `pollSessions: 50`, `bodyBytes: 1 MiB` |
| `runSessionIdSchema` | `/^ses-\d{4,}$/` |
| `standaloneSessionIdSchema` | `jobIdSchema` |
| `sessionRefSchema`, `SessionRef` | `{ source: 'run', planId, runId, session }` or `{ source: 'standalone', session }` |
| `sessionStateSchema`, `ShownSessionState` | `live`, `suspended`, `finished`, `interrupted` |
| `sessionFinishReasonSchema`, `SessionFinishReasonView` | the run log's six reasons |
| `sessionReachSchema`, `SessionReach` | `{ kind: 'run' }`; `{ kind: 'work-item', workItem, capability \| null, module \| null }`; `{ kind: 'request', request, workItem \| null, capability \| null }`; `{ kind: 'module', module }` |
| `sessionListEntrySchema`, `SessionListEntry` | `ref`, `state`, `finished`, `role`, `work`, `executor`, `model`, `invocations` (count), `reaches`, `startedAt`, `changedAt` |
| `unservedSessionSourceSchema`, `UnservedSessionSource` | `{ source: 'run' \| 'standalone', path, message }` |
| `sessionListResponseSchema`, `SessionListResponse` | `sessions` (≤ 200), `total`, `offset`, `next` (offset or null), `unserved` |
| `sessionMomentSchema`, `SessionMoment` | `{ sequence, at }` of a run event |
| `sessionDegradeSchema`, `SessionDegrade` | `{ requested: 'continue' \| 'fork', actual, reason \| null }` |
| `sessionInvocationSchema`, `SessionInvocation` | `invocation`, `start`, `started`, `ended` (moment or null), `outcome` (how it ended, or null), `kept` (or null), `continues`, `degraded`, `point` (its end, or null), `evaluation` (`InvocationEvaluation` or null) |
| `sessionAppendSchema`, `SessionAppend` | `appended` (moment), `decision`, `generation`, `outcome`, `point` (`{ session, append }`) |
| `sessionSuspensionSchema`, `SessionSuspension` | `{ from, until \| null }`: from an end that kept it to the next start or its finish |
| `sessionLineageSchema`, `SessionLineage` | `fork`, `replaces`, `replacedBy`, `requestedBy` (`{ invocation, reason, session }`), `requested` (sessions it asked for), `forks` (sessions forked from its points) |
| `runSessionViewSchema`, `RunSessionView` | `session`, `state`, `finished`, `role`, `work`, `executor`, `model`, `reaches`, `opened`, `changed`, `awaiting`, `point`, `invocations`, `appends`, `suspended`, `lineage` |
| `runSessionsResponseSchema`, `RunSessionsResponse` | `version`, `sessions` (≤ 500, in opening order), `total` |
| `transcriptPageSchema`, `TranscriptPage` | `file` (`present` \| `missing`), `entries` (≤ 200, `TranscriptEntry` unchanged), `cursor`, `more`, `partial`, `unreadable` (line numbers) |
| `sessionTranscriptResponseSchema`, `SessionTranscriptResponse` | `{ session: SessionRef, page }` |
| `sessionCursorSchema`, `SessionCursor` | `{ session, after }` |
| `sessionUpdatesResponseSchema`, `SessionUpdatesResponse` | `version`, `sessions` (changed `RunSessionView`s), `transcripts` (`{ session, page }`, ≤ 50, in the request's order) |
| `sessionBodyResponseSchema`, `SessionBodyResponse` | `content` (≤ 1 MiB), `bytes` (the whole body), `truncated` |
| `sessionBodyHashSchema` | `sha256Schema` |
| `standaloneSessionResponseSchema`, `StandaloneSessionResponse` | `session` (list entry), `prompt`, `outcome` (`{ ended, interruption, error, finishedAt }` or null), `evaluation` |

[transcripts.ts](../../../../subs/harness/src/interfaces/protocol/transcripts.ts)
now exports its relation shapes, which the entry schema and `sessions.ts`
share: `transcriptContinuesSchema`, `transcriptForkSchema`,
`transcriptReplacesSchema`, `transcriptRequestedBySchema` and
`transcriptWorkSchema`. The entry format is unchanged.

`runEventRefKindSchema` in `runs.ts` gains `session`. The projected
`session-opened`, `invocation-started`, `invocation-ended`,
`session-finished` and `brief-appended` events refer to their sessions, and
a replacement also refers to the session it replaces.

### Semantics

- **Cursor.** An entry's number `n` is its cursor. A page answers the entries
  with `n > after`, in file order. Its `cursor` is the last returned `n`, or
  `after` when it returned none, so it is never lower than the request's.
  `more` says that entries follow within the file. A cursor past the end
  answers no entries and keeps its value.
- **Page bounds.** A page holds at most 200 entries and 512 KiB of entry
  lines. It always holds at least one entry, so a larger entry still
  arrives, alone. A poll's pages share one 512 KiB budget in the request's
  order. Once the budget is spent, a page answers no entries and says
  `more`.
- **Poll.** The poll derives the run's sessions first, at the run's current
  version. It answers every session whose `changed.sequence` is after the
  request's `version`, including those opened since, with each invocation's
  evaluation. Then it reads each followed session's page. A state committed
  before the poll is therefore in its answer. An entry written after that
  version, such as the `ended` written after `invocation-ended`, can arrive
  one poll before its state. The answer's `version` is the next poll's.
- **List order.** Live and suspended sessions come first, by `startedAt`,
  newest first. Finished and interrupted sessions follow, by `changedAt`,
  newest first. Ties go to the reference's key. The order is taken afresh
  by each request, so a client that refreshes reads from offset 0.
- **Interrupted.** A run's session is `interrupted` when its log says live
  and the run has a terminal event. The server serves every run it drives
  and recovers the others at start-up, so a run without a terminal event is
  driven. A standalone session is `finished` with its `outcome.json` and
  `interrupted` without one (`standaloneSessionState`). Its `changedAt` is
  its outcome's `finishedAt`, else its transcript's last entry, else its
  start.
- **Executor.** A standalone `session.json`'s `agent` is shown as `executor`,
  as the run log names it. A standalone session's `finished` is null, since
  it records no reason, and its `work` is `{}`.
- **Reaches.** An `initial-architect` reaches `run`. A `global-fork` with a
  request reaches `request`, with the request's `forCapability` and
  `workItem`. Every other role with a work item reaches `work-item`: its
  capability (`capabilityOfItem`) and module. A standalone session reaches
  its `module`.
- **Missing transcript.** A known session whose file is absent answers
  `file: 'missing'` with no entries. The schema refuses entries or `more`
  on a missing page.
- **File bodies.** A `files` query serves only a path that some `file` body
  of that session's transcript names, and only inside the run's or the
  standalone session's directory. Any other path is `not-found`. A blob is
  served by hash from `blobs/`. Both answer at most 1 MiB, cut at a character
  boundary, with the whole size.
- **Standalone evaluation.** It is computed like a run invocation's, as a
  writer. Its `lines` are `partial` with the gap "a standalone session
  records no line events", rather than showing none.

### Harness code

- [projections/sessions.ts](../../../../subs/harness/src/projections/sessions.ts):
  pure functions `runSessionViews(view)` (the reducer's sessions with
  invocations, appends, suspensions and both directions of lineage;
  an invalid transition is `unreadable` with the event's sequence),
  `reachOf`, `shownState`, `runSessionEntry`, `standaloneEntry` and
  `orderSessions`.
- [projections/session-queries.ts](../../../../subs/harness/src/projections/session-queries.ts):
  `SessionQueries(source)`, with `list`, `runSessions`, `transcript`,
  `updates`, `runBody`, `runFile`, `standaloneSession`, `standaloneBody` and
  `standaloneFile`. It keeps each run's sessions by run version and derives
  again only a run whose version moved. It keeps an ended invocation's
  evaluation and a finished standalone session's records.
- [transcripts/pages.ts](../../../../subs/harness/src/transcripts/pages.ts):
  `TranscriptPages`, with `page(path, after, bounds)` and `last(path)`.
  It indexes each file once, one offset and entry number per complete line,
  and reads only the bytes appended since.
- `RunSource` and `RunService` gain `runVersions()`: every served run of
  every plan, with its last event's sequence. `servedRun(source, planId,
  runId)` is shared by both query classes.
- [projections/metrics.ts](../../../../subs/harness/src/projections/metrics.ts):
  `evaluationOf(inputs)` is the pure evaluation `metricsOf` already
  computed, now shared. `invocationEvaluation(view, invocation)` reads its
  inputs. `readObservationLog(path, shown)` reads an observation log by
  path.
- [http/app.ts](../../../../subs/harness/src/http/app.ts) serves the ten
  routes through `SessionQueries`.

### Exposure

- [subs/harness/module.ramify](../../../../subs/harness/module.ramify):
  - `expose-src * from "interfaces/protocol/transcripts.ts" tagged [browser] to parent`
  - `expose-src * from "interfaces/protocol/sessions.ts" tagged [browser] to parent`
- The root [module.ramify](../../../../module.ramify) re-exposes every export
  of both files to its descendants by name, under `// protocol/transcripts.ts`
  and `// protocol/sessions.ts`, as it does for `runs.ts`.

### Web client

The web client is wired as it is for `runs.ts`: [client.ts](../../../../subs/web/src/client.ts)'s
`ProtocolClient` gains these calls. No page uses them yet.

- `listSessions(offset?)`
- `getStandaloneSession(session)`
- `getRunSessions(planId, runId)`
- `getTranscript(ref, after)`
- `pollSessions(planId, runId, version, cursors)`
- `getBody(ref, body)`, which answers an inline body without a request and
  fetches a blob or file body by its hash or path

The test [StubClient](../../../../subs/web/src/tests/helpers/stub-client.ts)
answers them from settable maps: `sessionList`, `runSessions`, `standalone`,
`transcripts` (keyed `<session>@<after>`), `polls` and `bodies`.

## Decisions

1. **A complete line that is not JSON is skipped and reported.** Both
   `readTranscript` and `TranscriptPages` treat it like a line that fails the
   schema. They skip it and report it by line number (`unreadable`), so one
   damaged line never hides the others. `readTranscript` now reads the file
   itself rather than through `readJsonLines`, which throws on such a line.
   It also answers `missing: true` for a missing file. The writer still loads
   through `readJsonLines`. After such a line, every later append fails and
   is recorded as a coverage gap. That is conservative: it never numbers on
   past a line it cannot read.
2. **The poll is a `GET` with a cursor list in the query.** Only the command
   endpoint changes anything, and a poll changes nothing. Fifty cursors fit
   well within a URL.
3. **The run's sessions carry each invocation's evaluation.** Iteration 7
   moves the Run page's Sessions columns into the chapters. So every
   `SessionInvocation` holds the same `InvocationEvaluation` that
   `metrics.evaluation.invocations` holds. The HTTP test asserts that the two
   are equal.
4. **Standalone sessions get a detail route.** The list entry lacks the
   prompt, outcome and evaluation that a standalone session's page needs, so
   `standaloneSession` answers them.

## Changes from the design

- The plan names "a body by run and hash". There are two body queries:
  `bodies/:hash` for the content store, and `sessions/:session/files?path=`
  for `file` bodies such as shell logs and hook check logs. Each has a
  standalone twin.
- `sessionFinishReasonSchema` and the relation schemas are declared again in
  the protocol. `run/records.ts` is not browser-safe, and `transcripts.ts`
  already declared the relations. The web receives only protocol files.
- The `web` module changed, for the client calls and the stub, which the
  iteration's Owner line does not name.

## Exit evidence

From `ramify-agent/`:

```sh
npx vitest run subs/harness/src/tests/session-queries.test.ts subs/harness/src/tests/transcript-pages.test.ts \
  subs/harness/src/tests/transcript-writer.test.ts subs/harness/src/tests/protocol-contract.test.ts \
  subs/web/src/tests/client.test.ts
# 5 files, 56 tests passed
npx vitest run subs/harness/src/tests/union-values.test.ts subs/harness/src/tests/run-projections.test.ts \
  subs/harness/src/tests/projections-pure.test.ts subs/harness/src/tests/accepted-commit.test.ts \
  subs/harness/src/tests/local-authority.test.ts subs/harness/src/tests/work-items.test.ts \
  subs/harness/src/tests/session-lifecycle.test.ts subs/harness/src/tests/kpi-metrics.test.ts \
  subs/harness/src/tests/lineage-metrics.test.ts subs/harness/src/tests/http.test.ts \
  subs/web/src/tests/client.test.ts subs/web/src/tests/run-page.test.tsx \
  subs/harness/src/tests/direct-check-execution.test.ts
# 13 files, 119 tests passed
npx vitest run subs/harness/src/tests/composition.test.ts subs/harness/src/tests/run-protocol.test.ts \
  subs/harness/src/tests/iteration-gate-integration.test.ts subs/harness/src/tests/iterations-integration.test.ts \
  subs/harness/src/tests/transcript-run.test.ts subs/harness/src/tests/run-recovery.test.ts \
  subs/harness/src/tests/single-session.test.ts
# 7 files, 60 tests passed
npm run type-check     # passed
npm run build:web      # built
npm run check:self
# Execution: completed; check: passed; coverage: partial
# Findings: 0 errors, 0 warnings, 132 analysis limits
```

The analysis limits rose from 87, iteration 5's baseline, to 132. Iteration
10's two new `signature-inferred` limits make 89. This iteration adds 43,
one `signature-inferred` limit per newly exposed schema: 25 in `sessions.ts`
and 18 in `transcripts.ts`. It is the limit every exposed schema has. The
second group of test files is the one whose subjects changed: the new
`session` reference kind, the metrics refactor and the client stub. The
third group holds the long run-driving and integration files that assert
projected events or read transcripts.

- **The poll answers only entries after each cursor, never resets a number,
  and reports a state change within one poll** (ST09).
  `session-queries.test.ts` holds a live run's architect waiting.
  - A poll from version 0 with cursor 0 answers the live session and entries
    1–3.
  - A poll at the same version with cursor 3 answers no session and no
    entry, with cursor 3. With cursor 2 it answers entry 3 only.
  - After the stop commits, the next poll answers the session `finished`
    (`run-ended`), its invocation `stopped` with its point, and entries 4
    and 5 (`ended`, `point`), with cursor 5.
  - A version ahead of the run, an unknown session, a malformed or repeated
    cursor, and 51 cursors are all refused.
- **Interrupted run session.** The run before it ignored its stop past the
  grace. That leaves its session live in a stopped log. The project list
  shows the live session first and this one `interrupted`, awaiting its
  unended invocation.
- **A finished standalone session and a crashed one list as finished and
  interrupted.** Two real standalone sessions ran on the scripted fake. The
  second's `outcome.json` was then removed, as a crash before its last write
  leaves it.
  - The list shows them `finished` and `interrupted`, `executor: 'scripted'`,
    each reaching its module.
  - The interrupted one's `changedAt` is its transcript's last entry.
  - Its detail answers `outcome: null` and usage unavailable.
  - The finished one's shell log is served by the path its result names.
- **The session scenario over HTTP.** The scripted run of iterations 1 and 5
  is served after a restart.
  - Every list entry and run view matches the reducer's sessions.
  - The initial architect reaches `run`. The global fork reaches its
    request's capability and work item. The local architect reaches
    `review-notes` in the notes module.
  - The architect context's append is a mark with its point.
  - Each continued architect segment continues from the previous end, and
    the suspension between them runs from that end to the next start.
  - The contract sub-session names its requester's session, which lists it.
  - Every invocation's evaluation equals the metrics'.
  - Every transcript pages back to the file's entries, from 0 and from 2.
  - The system prompt's blob and a file body a run transcript names are
    served. Paths the transcript does not name, and paths outside the run,
    are `not-found`.
  - A non-JSON line appended to a transcript is reported by its line
    number, and every entry is kept. A moved transcript answers `missing`.
- **Pages.** `transcript-pages.test.ts` covers:
  - 450 entries in three pages;
  - the byte bound, and a single entry larger than it;
  - a spent poll budget;
  - a torn line that waits for its newline;
  - damaged lines;
  - a file removed and one replaced by a shorter one.

## Open items

- **`transcript-incomplete` counts against observation coverage.** It is a
  `coverage-gap` observation, so `kpi/metrics.ts` counts its invocation as
  not covered in `observation-coverage`, and lists it as
  `observation-coverage.transcript-incomplete`. It also appears in the
  invocation's evaluation `gaps`. Nothing breaks. However, a failed
  transcript write lowers a KPI about observations, which were complete.
  Iteration 11, or the metrics documents' owner, may exclude the kind from
  the ratio.
- **A live invocation's evaluation changes without a new run version.** Its
  observations are appended outside the log, so a poll does not report the
  change. `getRunSessions` reads it afresh.
- **The list re-derives a run whose sessions cannot be derived on every
  request,** since a failure is not kept. Such a run is reported in
  `unserved`.
- **The writer refuses a transcript that holds a complete non-JSON line**
  (decision 1). A later iteration may number on from the last readable entry
  instead.
- **Iteration 7** reads `transcriptPageSchema`'s `file: 'missing'` for the
  missing-transcript case. It follows a session with `pollSessions`, from
  `RunSessionsResponse.version`.
