# Plan 9: Session model and transcripts

**Date:** 2026-09-23. **Status:** implemented 2026-09-23; see its [results](results.md).

The harness runs agent sessions but does not model them. An invocation is
recorded, and the conversation that invocations share exists only as pi's
opaque refs. No transcript is recorded in the harness's own format, and the
web cannot show what an agent did. This plan adds a harness-owned session
model with lifecycle and lineage, a transcript per session, the queries that
serve them, and the web views: a session list, a live transcript, markers on
the progress diagrams, a lineage timeline and lineage measurements.

The design and its evidence are in the
[session transcripts analysis](../../analysis/2026-09-23-session-transcripts-live-view.md).
Its [decisions](../../analysis/2026-09-23-session-transcripts-live-view.md#decisions)
bind this plan and are not repeated in full here.

## Runnable outcome

```text
ramify-agent serve, a run in progress
  Sessions page        -> live and suspended sessions first, then finished,
                          across every plan's runs and standalone sessions
  a live session       -> its transcript grows entry by entry; thinking, file
                          contents and tool calls are collapsed until opened
  Run -> Progress      -> capability and module nodes show their live
                          sessions by role, suspended ones marked; selecting
                          a node lists its sessions, and a session opens
  Run -> Sessions      -> the lineage timeline: lanes, segments, forks,
                          replacements and degraded starts
  Run -> Metrics       -> fork, continuation and repair measurements
```

## Scope

**In scope:**

- A session identity, its lifecycle and its lineage, recorded in the run log
  and derived by a pure reducer.
- Neutral tool actions on the agent port, and transcript content with a
  required core and optional detail.
- One transcript per session, with bodies stored out of line by content.
- The HTTP queries, the web pages and the diagram markers.
- The lineage timeline and the lineage measurements.
- The correction of the metrics' session grouping.
- Standalone `ramify-agent session` sessions, in the list and with
  transcripts.

**Out of scope:**

- **Retention.** It is item 6 of the [to-do list](../../todo.md). This plan
  only keeps transcripts and bodies in the run directory, where retention can
  find them.
- **Streaming text.** The live view shows complete entries. Entry numbers are
  designed so streaming can follow without a format change.
- **Redaction** of secret-looking values in transcripts, which is not decided.
- **Parallel sessions.** The model is correct for them; the harness still
  runs one invocation at a time.
- **Another executor.** The port changes keep one possible; none is added.
- **Runs recorded before this plan.** The project is alpha, and no test or
  fixture reads a recorded run; the two trial logs under Plan 3 are cited
  evidence only. Readers require the new record versions and the session
  events, and an older run is unsupported: nothing derives its sessions or
  reports them unavailable.
- **Trial copies in other directories,** which are other projects.

## Prerequisites

1. `ramify-agent` at `9197d62` or later, with its type check,
   `npm run check:self` and the recorded
   [ramify-audit request](../../../audit/ramify-agent-suite.request.json)
   passing.
2. Each iteration runs `npm run worktree:prepare` and the root
   `npm run build` from its worktree root before its first check.
3. The plan is independent of Plans 4 and 6. The
   [capability registry analysis](../../analysis/2026-09-23-capability-registry-analysis.md)
   may change which capabilities the progress graph draws; markers attach by
   capability ID and follow whatever the graph draws.

## Design

### Sessions and their states

A **session** is the conversation one or more invocations share; each
invocation is one segment of it (see the [glossary](../../glossary.md#session)).
A fresh or forked invocation opens a session; a continued invocation joins
the one it continues. A run's sessions are numbered `ses-0001`, `ses-0002`,
and so on; a standalone session keeps its existing ID.

| State | Meaning |
| --- | --- |
| live | The harness awaits one of its invocations, settlement included. |
| suspended | None is awaited; the harness keeps it to continue it, or to append to it and fork from it. |
| finished | The harness will not use it again. |

**Interrupted** is what a reader shows for a session whose log says live and
whose harness is gone, until recovery records its end. The server holds the
project lock, and so does a standalone session
([server.ts](../../../subs/harness/src/http/server.ts),
[single.ts](../../../subs/harness/src/sessions/single.ts)), so a run is live
only if the serving process drives it, and the server never sees a running
standalone session. No lease is needed.

### Events

| Event | Change |
| --- | --- |
| `session-opened` | New: the session, role, work, executor and model, and its relation to other sessions |
| `invocation-started` | Gains the session, the work and its start relation |
| `invocation-ended` | Gains whether the session is `kept`, or `finished` with a reason |
| `session-finished` | New: a kept session the harness releases later, with a reason |
| `brief-appended` | Gains the session appended to |

Reasons for finishing: `work-closed`, `run-ended`, `lost`, `replaced`,
`interrupted`, `not-kept`.

| From | Event | To |
| --- | --- | --- |
| none | `session-opened` and its first `invocation-started` | live |
| live | `invocation-ended`, kept | suspended |
| live | `invocation-ended`, finished | finished |
| suspended | `invocation-started` | live |
| suspended | `brief-appended` | suspended |
| suspended | `session-finished` | finished |

Every other pair is invalid, and the reducer rejects it. A live session never
starts a second invocation; two branches at once are a fork, which opens a
new session. A run records `session-finished` for every kept session before
its final event.

### Lineage

A **point** is where a session can be continued or forked from: the end of
one of its invocations, or the result of one append. It is recorded as the
session plus the invocation or the `brief-appended` sequence, never as an
executor ref.

| Relation | Recorded at | Data |
| --- | --- | --- |
| continue | `invocation-started` | the point, the reason (such as `next-round`, `repair`, `revision`), the briefs appended since the previous invocation |
| fork | `session-opened` | the source point, the reason (such as `placement-request`), the context generation, the briefs held at the point |
| replace | `session-opened`, with `session-finished` on the old one | the replaced session, `reconstructed` or `context-rebuilt` |
| request | `session-opened` | the invocation whose result asked for it, such as the engineer iteration behind a contract sub-session |
| degrade | `invocation-started` | the relation requested, the one that was actual, and the executor's reason |

Opaque refs stay in `invocation.json` and `outcome.json` for continuation.
Nothing above the port parses them.

### Transcripts

One transcript per session, `transcripts/<session>.jsonl` in the run
directory and `transcript.jsonl` in a standalone session's directory. Each
line is an entry with `n`, `at`, `type` and, where it belongs to one, the
invocation.

| Entry | Content |
| --- | --- |
| `started` | an invocation's start: relation, executor, model, the system prompt and first prompt as bodies |
| `message` | `user`, `assistant` or `tool-result`, as blocks: text, thinking with its visibility, tool call with ID and action, tool result with call ID, other |
| `harness` | guard denial, submission verdict, post-write check, read reminder, appended brief, budget reached |
| `compaction`, `retry` | the executor's own events, with sizes and reasons |
| `point` | a point other sessions may name |
| `ended` | an invocation's outcome, interruption and error |

Each block has a **header**, always shown and small, and a **body**, shown on
expansion. A body over the inline threshold (8 KiB, a recorded policy value)
is stored in the run's content store, `blobs/<sha256>`, and the entry holds
its hash and size. The same file read twice and the system prompt every
invocation of a role shares are stored once. A shell call's body references
its existing log under `invocations/<id>/shell/`.

Transcripts, stored prompts and blobs are **raw output**. The rule that
records hold no file contents stands: no record, event or observation quotes
a body.

Entries are appended with the ledger's `appendJsonLine`, which syncs each
line, and read with `readJsonLines`, which reports a trailing partial line
as an interrupted append; the reader discards it.
A failed transcript write is recorded as a coverage gap in the invocation's
observations and never fails the session.

### The port

- **Tool actions.** `tool-started` gains a neutral `action`: a read of a path
  and range, a search, a write of paths, a command, a harness tool, or other.
  The adapter classifies its own tools; a harness tool declares its action.
  Activity, read excursions and the write guard use the action, never a tool
  or argument name.
- **Transcript content.** Events carry every message: the user prompt, the
  assistant's blocks and each tool result. The **required core** is text,
  tool calls and results paired by call ID, the outcome and the actual start
  mode. **Optional detail** is recorded when present and marked absent when
  not: thinking and its visibility, reasoning tokens, cost, cache writes by
  retention, the model that answered, the thinking level used, stop reason
  and error per message, compaction and retries.
- **Declared support.** The port's `observations` grow into a declaration
  of what an executor supports, including thinking and fork at a point.
  Anything missing degrades with a reason.

## Iterations

Iterations 1 and 3 can start in parallel. Iteration 2 needs 1; 4 needs 3; 5
needs 2 and 4; 6 needs 5; 7 needs 6; 8 and 9 need 7; 10 needs 2; 11 needs all.

### Iteration 1: Session identity and lifecycle

**Owner:** `harness`.

**Goal:** every invocation belongs to a recorded session, and each session's
state is derived from the run log.

**Work:**

- Add `session-opened` and `session-finished`, and the session fields of
  `invocation-started`, `invocation-ended` and `brief-appended`. A new field
  that is required bumps its record's schema version; readers accept the new
  version only.
- A pure reducer over the log with the transition table above. It rejects an
  invalid pair with the event's sequence.
- The run service assigns sessions in every loop: the initial architect,
  global forks, local architects, engineers and contract engineers. The local
  `sessionRef` variables stay the executor's ref; the session ID is recorded
  beside them. Each loop records `kept` or `finished` at each invocation's
  end, and `session-finished` when it releases a kept session.
- Run end finishes every kept session. Recovery finishes each interrupted
  invocation's session with `interrupted` and, as run end does, every
  session the interrupted run still kept, so a recovered run holds no
  suspended session either.
- The standalone session records its session's executor and model and
  derives finished from its outcome, or interrupted from its absence.
- Name the events, data and reasons finally, and record any change from the
  design here in this plan's results.

**Verification (from `ramify-agent/`):**

```sh
npx vitest run subs/harness/src/tests/session-reducer.test.ts \
  subs/harness/src/tests/session-lifecycle.test.ts \
  subs/harness/src/tests/run-recovery.test.ts subs/harness/src/tests/composition.test.ts
npm run type-check
npm run check:self
```

**Exit:** reducer tests cover every valid transition and reject every other
pair. A scripted run with a continued local architect, a repaired engineer,
a global fork and a contract sub-session derives the expected state after
every event. A final run holds no suspended session. A recovered run's
interrupted sessions are finished with `interrupted`.

### Iteration 2: Lineage and the metrics correction

**Owner:** `harness`.

**Prerequisite:** iteration 1.

**Goal:** continuation, forking, replacement, request and degradation are
recorded as relations between harness points, and the metrics group by
session.

**Work:**

- Record the relations of the lineage table, with the reasons each loop has.
  A fork names its source point, its context generation and the briefs it
  held. A reconstruction and a context rebuild name the session they replace.
  A contract sub-session names the invocation whose need opened it.
- Replace the metrics' grouping by `outcome.session.ref`
  ([projections/metrics.ts](../../../subs/harness/src/projections/metrics.ts))
  with the session ID.
- A test builds the metric inputs from records through the projection, so
  the grouping itself is exercised. The existing test supplies session keys
  directly ([kpi-metrics.test.ts](../../../subs/harness/src/tests/kpi-metrics.test.ts)).

**Exit:** every non-fresh start in the scripted run of iteration 1 names its
point and reason, with no executor ref above the port. A continued session
counts once in `session-weighted-total`, at its largest size.

### Iteration 3: Neutral tool actions

**Owners:** `harness/agent`, `harness/agent/pi`, `harness`.

**Goal:** no harness logic depends on an executor's tool or argument names.

**Work:**

- Add `action` to `tool-started`. The pi adapter maps `read`, `grep`, `find`,
  `ls`, `edit` and `write`; each harness tool declares its action, and the
  shell's is a command. The scripted fake takes actions from its script.
- `activityOf` ([activity.ts](../../../subs/harness/src/jobs/activity.ts)),
  the excursion watcher and the write guard's `targetOf`
  ([write-guard.ts](../../../subs/harness/src/guard/write-guard.ts)) use the
  action.
- Grow the port's `observations` into the executor's declared support,
  keeping the three it has.

**Verification:** the read-excursion, write-guard, activity and
observation-log tests, with the type check and `npm run check:self`.

**Exit:** a scripted executor whose read tool is `Read` with `file_path`, and
whose write tool is named differently again, records the same reads,
excursions and guard decisions as the pi names do.

### Iteration 4: Transcript content through the port

**Owners:** `harness/agent`, `harness/agent/pi`.

**Prerequisite:** iteration 3.

**Goal:** the port carries a complete transcript, with its required core and
optional detail.

**Work:**

- Extend `AgentEvent`: messages of every role with their blocks, thinking
  with its visibility, and retries. The existing `message` consumers keep
  working.
- The pi adapter translates `message_end` for every role, including the first
  prompt, which pi emits before the model call; thinking, marked `redacted`
  when pi says so; the optional usage and message fields; and
  `auto_retry_start` and `auto_retry_end`. Opaque provider data such as
  thinking signatures is not emitted.
- The scripted fake emits the core and chosen optional detail from its
  script, so tests cover both presence and absence.

**Verification:** the pi adapter's tests with its scripted provider, the
scripted agent's tests, the type check and `npm run check:self`.

**Exit:** for one scripted pi session, the port's events hold the first
prompt, every assistant block, every tool result paired by call ID, and the
optional detail pi supplied, with nothing read from pi's files.

### Iteration 5: The transcript writer

**Owner:** `harness`.

**Prerequisites:** iterations 2 and 4.

**Goal:** every session of a run or standalone session has a durable
transcript.

**Work:**

- Write entries from the port events and from the harness's own decisions,
  beside the observations, in both the run service and the standalone
  session. The `started` entry, with its prompts as bodies, is written before
  the model is called.
- Headers and bodies; the content store; the shell log reference; the
  threshold as a policy value.
- The standalone layout's `transcript` key
  ([sessions/records.ts](../../../subs/harness/src/sessions/records.ts))
  names the executor's own `session/` directory; it is renamed so that
  `transcript.jsonl` is the harness's transcript.
- `point` entries at each invocation end and each append, and a fork's first
  entry naming its source point.
- A failed write is a coverage gap.

**Exit:** tests show a crash after an entry keeps every earlier entry, a
torn last line is discarded, a file read twice is stored once, and no record,
event or observation contains a body. A transcript written for a scripted
run reads back to the port events that produced it.

### Iteration 6: Session queries

**Owner:** `harness` (a new `interfaces/protocol/sessions.ts`, exposed to the
parent tagged `[browser]` and received by `web` through the root, as
`runs.ts` is).

**Prerequisite:** iteration 5.

**Goal:** a client can list every session, follow several at once and fetch
bodies on demand.

**Work:**

- **The project's sessions:** live and suspended first, by start, then
  finished, by last change, across every plan's runs and the standalone
  sessions, paginated and bounded like the run queries. The index is built
  from the run logs and the standalone records, and refreshed by run version.
- **A run's sessions:** state, role, work, executor, model, invocations,
  lineage and the diagram elements each reaches: a work item's capability and
  module; a global fork's request's capability and work item; none for the
  initial architect, which the run shows at run level.
- **A transcript page:** the entries after a cursor, with headers and inline
  bodies.
- **An update poll:** for one run, a cursor per session in one request; it
  answers the newer entries of each and every session whose state changed.
- **A body:** by run and hash.

**Verification:** protocol contract tests and HTTP tests against scripted
runs, the type check and `npm run check:self`.

**Exit:** the poll returns only entries after each cursor, never resets a
number, and reports a state change within one poll. A finished standalone
session and a crashed one list as finished and interrupted.

### Iteration 7: Session list and transcript view

**Owner:** `web`.

**Prerequisite:** iteration 6.

**Goal:** a person can find any session and read or follow its transcript.

**Work:**

- A Sessions page, linked from the header beside the plans, and a session
  route, reachable from the Sessions page and from the Run page.
- The transcript view: entries in order, each block as its header;
  thinking, file contents, tool input and output, the system prompt and
  appended briefs collapsed by default; a body fetched on first expansion;
  a read rendered as a file with its path, range and line numbers; the
  thinking visibility and any absent optional detail shown.
- Segments shown as chapters with their start relation and reason; points
  and the fork source as links. Each chapter carries its invocation's
  evaluation, which the Run page's Sessions table shows today: guarding, hook
  checks, reads outside the scope, lines and tokens.
- Following a live session: polling with cursors, sticking to the bottom
  within a small margin, and a "new entries" control otherwise.

**Verification (from `ramify-agent/`):**

```sh
npx vitest run subs/web/src/tests
npm run type-check
npm run build:web
npm run check:self
```

**Exit:** component tests cover collapsed-by-default blocks, lazy bodies,
entries that arrive in separate polls, a state change while open and a
session whose transcript file is missing.

### Iteration 8: Diagram markers

**Owner:** `web`.

**Prerequisite:** iteration 7.

**Goal:** the progress diagrams show where agents are working.

**Work:**

- Capability graph nodes and By-module bodies (through the web module's own
  `renderNodeBody`) show the number of live sessions with role chips, and
  suspended sessions distinctly.
- Selecting a node lists its sessions in the side panel, live and suspended
  first; a session opens its transcript.
- A run-level strip for sessions without an element.
- Extend the served progress fixture
  ([serve-progress-fixture.ts](../../../subs/harness/src/tests/helpers/serve-progress-fixture.ts))
  with sessions in every state.

**Exit:** component tests cover counts, the suspended mark, the element
list and the run-level strip; the markers change within one poll of a state
change.

### Iteration 9: Lineage timeline

**Owner:** `web`.

**Prerequisite:** iteration 7.

**Goal:** a run's session history is visible at a glance.

**Work:** a timeline under Run → Sessions, replacing the table of
invocations there; its evaluation columns moved to the transcript chapters
in iteration 7. One lane per session; its invocations as segments;
suspended time as gaps; appended briefs as marks; forks branching from their
source point; replacements as dashed links; requested sessions linked to
their requester; degraded starts marked. Selecting a segment opens that
chapter of the transcript. Keyboard access and text alternatives follow the
existing diagrams.

**Exit:** component tests cover each relation, and the fixture's timeline
renders without console errors at 1440×1000 and 390×844.

### Iteration 10: Lineage measurements

**Owner:** `harness` projections, and the [metrics documents](../../metrics/README.md).

**Prerequisite:** iteration 2.

**Goal:** the comparisons the architecture wants are measured.

**Work:**

- Define each measurement in the metrics glossary before computing it: a
  fork's inherited context and its cost against a fresh start, by context
  generation; a continued session's growth across segments; a repair
  segment's cost; how often starts degrade and sessions are reconstructed,
  by reason; forks served by each context generation.
- Compute them from records: invocation usage, the first context
  observation of each segment and the lineage events. A value without its
  inputs is unavailable with a reason, never zero.
- Show them on the Run page's metrics, with their coverage.

**Exit:** projection tests compute each measurement from a scripted run with
known values, and report unavailable when a measurement's inputs are missing.

### Iteration 11: Acceptance

**Owner:** this plan's results.

**Prerequisites:** iterations 1 to 10.

**Work:**

- **Browser evidence.** Serve the extended fixture and record the Sessions
  page, a transcript with a block open, a live transcript receiving entries,
  both diagrams with markers, and the timeline, at 1440×1000 and 390×844,
  with no console error.
- **A quick pi test,** for development only, on a prepared copy
  (`npm run session -- --project <copy> --module <path> --prompt-file <file>`,
  with a cheap model). It confirms that a real pi session's transcript shows
  the first prompt, thinking, tool calls and results, and the optional detail
  pi supplies. No test calls a real model.
- **Audit.** Run the recorded ramify-audit request on the final commit.
- **Documents.** Update the analysis to point to this plan's results,
  revise its decision 7 so that an earlier run is unsupported rather than
  listed without transcripts, and mark the future
  [session explorer](../../future/README.md#agent-session-explorer) as
  delivered in part: search remains, and retention and redaction are
  pending.
- **Results.** Write `results.md` mapping ST01–ST14 to evidence.

## Acceptance

| ID | Required result | Iteration |
| --- | --- | ---: |
| ST01 | Every invocation belongs to a session; the reducer derives each state and rejects every invalid transition | 1 |
| ST02 | Run end and recovery finish every kept or interrupted session; a final run holds no suspended session | 1 |
| ST03 | Every lineage relation names harness points and a reason; nothing above the port parses an executor ref | 2 |
| ST04 | `session-weighted-total` groups by session, tested through the projection | 2 |
| ST05 | Activity, excursions and the write guard use neutral actions; a differently named executor is recorded and guarded identically | 3 |
| ST06 | The port carries the required core, and optional detail when present, marked absent otherwise; thinking carries its visibility | 4 |
| ST07 | A transcript's first entry precedes the model call; entries survive a crash; a torn line is discarded; a failed write is a coverage gap | 5 |
| ST08 | Large bodies are stored once by content; no record, event or observation holds a body | 5 |
| ST09 | The session list orders live and suspended first across runs and standalone sessions; the update poll returns only newer entries | 6 |
| ST10 | The transcript view collapses thinking, files and tool calls by default, fetches bodies on expansion and follows a live session | 7 |
| ST11 | Diagram nodes show live sessions by role and suspended ones distinctly, and open their sessions | 8 |
| ST12 | The timeline shows segments, gaps, appends, forks, replacements, requests and degraded starts | 9 |
| ST13 | Each lineage measurement is defined in the metrics glossary and computed from records, unavailable with a reason when its inputs are missing | 10 |
| ST14 | Browser evidence at both widths, the development pi check, `npm run check:self` and the ramify-audit request pass on the final commit | 11 |

## Review decisions

Open, each with its recommendation:

1. **Event names and reasons.** As in [Events](#events) and
   [Lineage](#lineage). Iteration 1 may refine them and records any change.
2. **Inline body threshold.** 8 KiB, as a policy value the results can
   revise from the fixture's and the pi check's sizes.
3. **Transcript location.** `transcripts/<session>.jsonl` and `blobs/` in the
   run directory, beside `invocations/`, so retention finds raw output in two
   known places.
