# Session transcripts and live session views

**Date:** 2026-09-23. **Status:** draft analysis. It records what the harness
already collects for a web view of agent sessions, what is missing, and a
proposed shape, with lessons from how cucumber-viz tracks live sessions. It is
not a plan; [Plan 9](../plans/09-session-model-and-transcripts/main-plan.md)
implements it.

## The feature

From the web interface, a person can:

- see every agent session, the running ones first and the finished ones after;
- open a running session and follow its transcript live;
- open a finished session and read its whole transcript;
- see on the progress diagrams, the capability dependency graph and the module
  tree, which elements have one or more active sessions, and open them from
  there, together with the element's finished sessions.

The harness runs sessions one at a time today. Parallel sessions will come
later, and this design must not need rework when they do.

## What is collected today

Evidence comes from the source and from a real pi trial run with four
invocations (`/tmp/ramify-agent-loop-trial-uT2Y7F/...`, 2026-09-21).

**The whole conversation is on disk, in pi's format.** Each invocation passes
pi a session directory, `invocations/<id>/session/`
([`runLayout.session`](../../subs/harness/src/run/records.ts)), where pi writes
its own JSONL session file. The trial's files hold the first user prompt,
thinking, assistant text, tool calls with their arguments, every tool result,
per-message token usage and a timestamp on every entry.

**The invocation records link a session to its work.**

- `invocation.json` records the role, the work (`workItem`, `iteration`,
  `request`), the attempt, the requested and actual session mode, the prompt
  package and its hashes, and the start time.
- `outcome.json` records how the session ended, the session ref where its
  history ended, usage, elapsed time and settlement.
- `observations.jsonl` records context sizes, compaction, rejected
  submissions, activity and reads outside the scope, as numbered entries.

**The link from work to diagram elements exists.** One work item is created per
entry capability, and it has exactly one module
([work records](../../subs/harness/src/work/records.ts)). Each capability's
progress lists its work items, and every work item summary names its module
([run protocol](../../subs/harness/src/interfaces/protocol/runs.ts)). An
invocation therefore reaches one capability node and one module node through
its work item.

**Running and finished are known.** The run snapshot names the invocation the
run has open (`current.invocation`); an ended invocation has `outcome.json` and
an `invocation-ended` event in the run log. The Run page already polls the run
every second ([run-progress.ts](../../subs/web/src/run-progress.ts)).

## Gaps

1. **pi's file format is private to its adapter.** The adapter's header says
   pi's session files stay behind that module
   ([pi-agent.ts](../../subs/harness/subs/agent/subs/pi/src/pi-agent.ts)). The
   port events it emits carry assistant text only: thinking is dropped, a
   message with only tool calls becomes `(calls read, grep)`, and the user
   prompt and tool results are never emitted
   ([port](../../subs/harness/subs/agent/src/interfaces/port.ts)). Nothing
   outside the adapter can build a transcript without reading pi's format.
2. **A continued session writes into its parent's file.** In the trial,
   `inv-0004` continued `inv-0002` and its entries are inside `inv-0002`'s file.
   The start ref (in `invocation.json`) and end ref (in `outcome.json`) bound
   the slice once the session has ended. While it runs, only the start is
   known. A running fresh session's file is found only by listing its
   directory. The refs hold absolute paths, which break if the project moves.
3. **pi writes late and coarsely.** pi persists whole messages only and
   buffers everything until the first assistant message completes, so a fresh
   session with a thinking model shows nothing for its first 10 to 60 seconds.
   Streaming text is recorded nowhere.
4. **The system prompt is not in the transcript.** pi injects it on every turn
   through an extension. Only the prompt package and its hashes are recorded.
5. **Not every session is served.** HTTP serves one project's plans and runs.
   There is no invocation list across runs, standalone `ramify-agent session`
   records under `plans/.harness/sessions/` are not served, and trial copies
   under `/tmp` are other projects.
6. **Some sessions have no diagram element.** The initial architect has no
   work. A global fork belongs to a request, which reaches a work item and a
   capability only through the request record.
7. **Stale open invocations are handled, in part.** When the server opens,
   recovery closes every invocation whose start has no end as interrupted,
   without an agent call, and marks its run interrupted
   ([service.ts](../../subs/harness/src/run/service.ts)). It records nothing
   about the session's lifecycle, and a standalone session has no such
   recovery.
8. **Sessions have no identity or state.** See
   [the proposed session model](#proposed-session-model).
9. **Continuation, fork and replacement are recorded as pi refs only,** and
   the metrics' grouping of invocations into sessions is wrong because of it.
   See [lineage](#lineage-continuing-forking-and-replacing).
10. **Tool activity is classified by pi's tool names and argument names.** See
    [executors beyond pi](#executors-beyond-pi).

## The session lifecycle belongs to the harness

The harness controls every agent session, so their lifecycle is the
harness's, never pi's. pi's idleness, `settled()` or the growth of its file
never decide what state a session is in.

**A session and its invocations.** An invocation is one wait by the harness
for an outcome. A session is the conversation those waits share: a continued
invocation extends its predecessor's session, and a fork starts a new session
from a point in another. In the trial, `inv-0002` and `inv-0004` are two
invocations of one local architect session.

**Three states:**

| State | Meaning |
| --- | --- |
| **live** | The harness is waiting for one of the session's invocations: from the start of the invocation until the harness records its end, settlement included. |
| **suspended** | No invocation is awaited, and the harness keeps the session for further use: to continue it, as with a local architect between rounds or an engineer while its gate runs and a repair may follow; or to append to it and fork from it, as with the global architect context. |
| **finished** | The harness will not use it again: its work closed, its run ended, or the harness replaced it, for example with a session reconstructed from records or with a rebuilt global context. |

### What exists today

The harness has two layers over pi, and neither is a session.

- **The agent port** ([port.ts](../../subs/harness/subs/agent/src/interfaces/port.ts))
  abstracts pi and the scripted fake. An `AgentSession` is one agent run: an
  `outcome` promise with five kinds, the actual start mode, an opaque `ref`
  into the history, `settled()` and `stop()`. It has no state property;
  whether it runs is whether its promise has settled.
- **The invocation** is the harness's unit. `invocation.json` is written at
  its start and `outcome.json` at its end; the run log records
  `invocation-started` and `invocation-ended`, and `writer-acquired` and
  `writer-released` for a writer. Idle and absolute bounds, the submission
  bound and settlement by process groups
  ([writer.ts](../../subs/harness/src/run/writer.ts)) surround it, and
  recovery closes one whose start has no end. Its lifecycle is a sequence of
  log events; there is no state type or transition table for it.

The conversation that invocations share has no identity, record or state. It
exists only as a chain of opaque refs, `session.ref` and `from` on the
invocation and `session.ref` on the outcome. Whether the harness will continue
it lives in local `sessionRef` variables of the work item loop and the
iteration loop ([service.ts](../../subs/harness/src/run/service.ts)). Live is
derivable from the log; suspended and finished are not. The
[glossary](../glossary.md) defined neither term before this analysis.

### Proposed session model

A harness-level session over the port, derived from the run log as the work
loop's state is: a pure function of recorded events with a closed set of
transitions.

**Identity.** A session ID, such as `ses-0001`, is assigned when an invocation
starts fresh or from a fork; a continued invocation joins the session it
continues. `invocation.json` gains the session ID beside its existing refs. A
fork records the session and point it started from; the source session's
state is unaffected, and it may already be finished.

**Segments.** Each invocation is one segment of its session: the stretch of
history from its start to its end, between two suspensions. The segment is
the unit of display and analysis within a session. It has its own start
relation and reason, the context it inherited, its usage, which includes
re-reading the inherited context, its outcome and a chapter of the
transcript. Appended briefs fall between segments. No separate term is needed:
the invocation is the segment. "Sub-session" already names something else, a
contract engineer's session opened at another session's request.

**Events.** A first sketch, each in the run log:

| Event | Data |
| --- | --- |
| `session-opened` | session, role, work, and the fork source if any |
| `invocation-started` | gains the session and the work |
| `invocation-ended` | gains the session and whether the harness keeps it: `kept`, or `finished` with a reason |
| `session-finished` | session and reason, for a kept session the harness releases later |
| `brief-appended` | exists today; gains the session it appended to |

The reasons: `work-closed` (its iteration or work item closed), `run-ended`,
`lost` (the agent can no longer read it), `replaced` (a reconstruction from
records took its place), `interrupted` (recovery closed its invocation) and
`not-kept` (the harness has no further use for it, such as a global fork's
session once its decision is accepted).

**Transitions:**

| From | Event | To |
| --- | --- | --- |
| none | `session-opened` with its first `invocation-started` | live |
| live | `invocation-ended`, kept | suspended |
| live | `invocation-ended`, finished | finished |
| suspended | `invocation-started` | live |
| suspended | `brief-appended` | suspended |
| suspended | `session-finished` | finished |

Every other pair is invalid, and the reducer rejects it. The global architect
context shows why appending is its own transition: the initial architect's
session is kept after its invocation ends, accepted decisions are appended to
it as briefs without a model call, and every global fork starts from its
latest point, until a rebuild replaces it with the first fork that follows
([context.ts](../../subs/harness/src/architecture/context.ts)). In particular, a
live session cannot start a second invocation: a conversation has one line of
history, and running two branches at once is a fork, which opens a new
session. That one rule is what keeps the model correct under parallelism: any
number of sessions may be live at once, each awaiting one invocation.

A run records `session-finished` for each session it still keeps before its
final event, so a final run holds no suspended session. Recovery ends an
interrupted invocation with `finished` and reason `interrupted`.

**Interrupted is a view, not a state.** The log of a crashed run still says
live. Interrupted is what a reader shows for a live session whose harness no
longer exists, until recovery records its end.

**Who reads it.** A run query answers each session's state, role, work,
invocations and last change. The session list, the diagram markers and the
retention rule read that, and none infers a state of its own. A standalone
`ramify-agent session` has one session and one invocation, recorded under its
own directory with the same events.

**Earlier runs.** Runs recorded before the model have no session events. A
reader can group their invocations into sessions by following the continue
refs. Their runs are final, so every such session is finished.

**After a crash.** An invocation whose harness is gone is awaited by no one,
so it is not live, whatever its records last said. It shows as interrupted
until recovery records its end and the harness's decision about its session.
A standalone `ramify-agent session` is its own harness, in its own process.
It holds the project lock for its whole life, as the server does
([single.ts](../../subs/harness/src/sessions/single.ts),
[server.ts](../../subs/harness/src/http/server.ts)), so the server never sees
one running: a standalone session without an outcome was interrupted. No lease
is needed.

### Lineage: continuing, forking and replacing

The harness continues sessions (the code's `continue`; resuming, in other
words), forks them and replaces them. These relations are to be recorded as
harness facts, so that a view can show them and a measurement can analyse
them.

**What is recorded today.** `invocation.json` has the requested mode, the
actual mode as the harness expected it, a degradation reason, and the source
as pi's opaque ref, `file#entry`
([`requestedSession`](../../subs/harness/src/run/service.ts)). `outcome.json`
has the mode that was actual and the ref where the history ended, and
`brief-appended` has the ref after each append. What is missing:

- **The source as a harness identity.** A continuation or fork names a pi ref,
  not the session and invocation it came from. Joining them means matching
  opaque strings across outcomes and appends.
- **Why.** Nothing says whether the harness continued for the next round, a
  gate repair or a revision, or forked for a placement request.
- **What was inherited.** Neither the context size at the source point nor the
  briefs a fork carried is recorded with the start.
- **Replacement.** A reconstruction after a lost session and a global context
  rebuild start fresh sessions; nothing links them to the session they
  replace, although the harness counts reconstructions.

**A defect this causes.** The metrics group invocations into sessions by
`outcome.session.ref` ([projections/metrics.ts](../../subs/harness/src/projections/metrics.ts)),
on the assumption that "a continued session keeps its ref". It does not: a ref
names a point in the history, so each invocation ends at a different one. In
the trial, `inv-0002` ends at `…jsonl#f9edcce3` and its continuation
`inv-0004` at `…jsonl#873de1a1`; the scripted fake's refs change the same way.
`session-weighted-total`, which counts a continued session once at its largest
size, therefore counts each invocation as a session of its own. Its test
supplies equal session keys directly and does not exercise the grouping
([kpi-metrics.test.ts](../../subs/harness/src/tests/kpi-metrics.test.ts)).
A recorded session ID removes the guess.

**What to record.** Every relation points at a recorded harness point, never
at a pi ref. The points a session can be continued or forked from are exactly
the end of an invocation and the result of an append, and the harness records
both, so a point is a session and its transcript entry number.

| Relation | Recorded at | Data |
| --- | --- | --- |
| **continue** | `invocation-started` | the session, the point it continues from, the reason, such as `next-round`, `repair` or `revision`; the exact set comes from the harness's loops, the briefs appended since the previous invocation |
| **fork** | `session-opened` | the source session and point, the reason (such as `placement-request`), the context generation, the briefs the source held at that point |
| **replace** | `session-opened`, with `session-finished` on the old one | the replaced session and the reason (`reconstructed`, `context-rebuilt`) |
| **degrade** | `invocation-started` | the relation requested, the one that was actual, and the implementation's reason |
| **request** | `session-opened` | the invocation whose result asked for this session, such as the engineer iteration whose need opens a contract sub-session (`contract-requested` already names it as `requestedBy`); no history is shared |

The context size inherited at the start is an observation: the first context
observation of the invocation, recorded as it is today, now attributable to
a known source.

**Display.** A run's sessions as lanes on a timeline: invocations as segments
of a lane, suspended time as gaps, appended briefs as marks, forks as branches
from a point in the source lane, replacements as dashed links, and degraded
starts marked. The transcript view shows the same relations inline: "forked
from ses-0001 at entry 142", "invocation 2 of 3 of this session, continued for
a repair".

**Analysis.** With lineage recorded, the harness can measure what the
architecture compares and today cannot:

- fork cost against a fresh start: inherited context, cache reads and output
  per fork, by context generation;
- growth of a continued session across its invocations, and what a repair
  costs compared with a fresh engineer;
- how often starts degrade and sessions are reconstructed, and why;
- how many forks each context generation serves before a rebuild.

Lineage is structured and small, so it is kept when retention prunes the
transcripts it points into.

## Designing for parallel sessions

Parallel writers and parallel placement requests are excluded from Plan 3
([main plan](../plans/03-autonomous-implementation-loop/main-plan.md)), and the
future [isolated worktree execution](../future/README.md) suggests parallel
sessions will also run in separate workspaces. The design follows from not
assuming one open session per run and not letting two sessions share a file:

- **Live sessions come from the log, as a set.** `current.invocation` is a
  single value. The live set is every invocation started and not ended whose
  harness is waiting. The `invocation-started` event carries only the
  invocation and role; adding its work lets the log alone say which elements
  have live sessions, keeping the rule that a run's status lives in its log.
- **One transcript file per session, with one writer.** A session awaits at
  most one invocation at a time ([session model](#proposed-session-model)), and
  the harness appends to it only while it is suspended, so its file never has
  two writers. A fork opens a new session and a new file. Slicing pi's shared
  file is never needed.
- **One request fetches updates for many sessions.** Polling one transcript
  per live session grows with parallelism. A cursor per session, sent
  together, returns only newer entries.
- **Diagram nodes show counts, not a flag.** A capability can have a local
  architect and an engineer at once, and a module node collects sessions from
  every work item in it.
- **An invocation records its workspace.** Every session runs in the project
  root today, which is not recorded. With worktrees, tool-call paths resolve
  against the invocation's own workspace.
- **Recovery ends every interrupted invocation.** A crash with several
  sessions live must not leave them shown live forever; recovery records each
  end and whether its session is kept or finished.

## Hypothesis: the harness writes its own transcript

pi is a library in this process, and its events carry everything a transcript
needs. `message_end` fires for every message: the first prompt before the model
call ([agent-loop.js](../../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js)),
each assistant message with thinking and tool calls, and each tool result.
`message_update` and `tool_execution_update` carry streaming text and partial
tool output. Compaction and retries have events of their own. The location of
pi's file is already ours to choose.

### Option A: our own transcript beside pi's file

The pi adapter emits transcript content through the port, and the harness
writes one transcript per session, such as `sessions/<session>/transcript.jsonl`
in the run directory, in its own format. Each entry names its invocation, or
none for text the harness appended between invocations. pi keeps its file for
continue and fork only.

Pros:

- **Parallel-safe.** One file and one writer per session. A continuation
  extends its session's file; a fork opens its own. Nothing needs slicing.
- **Live from the start.** The system prompt and first prompt are written
  before the model is called.
- **A stable format.** The web never reads pi's format, so a pi upgrade cannot
  silently break it.
- **Harness events in the same stream.** Guard denials, rejected submissions
  with their errors, read-outside-scope reminders, post-write checks, context
  budget, stops and timeouts, and context appended between sessions, which pi
  records only for a session it holds. Entries can link to existing records:
  full shell output (the tool answers only its tail) and hook outputs.
- **Agent-agnostic.** The scripted fake produces the same transcript, so tests
  cover it without real model calls, and a second agent would too.
- **Ownership is preserved.** pi's format stays in its adapter, and the
  harness stays the only writer of durable state.
- **Our choice of granularity.** Complete messages are durable; streaming can
  be added in memory later without changing the format.

Cons:

- **Two records of one session.** They can diverge. The rule must be
  explicit: pi's file is the state for continuing, ours is the record for
  display and audit. A failed transcript write is a coverage gap, never
  silent.
- **Duplicate storage.** Tool results, mostly file reads, dominate. Storing
  large bodies once by content limits it
  ([rendering and storage](#rendering-and-storage)).
- **A mapping of content blocks.** Images and provider-specific blocks get a
  representation or an explicit "not captured" entry, never silent loss.
- **Still pi's API.** The event translation follows pi upgrades, as it already
  must.

### Option B: our file replaces pi's

pi runs in memory (`SessionManager.inMemory`), our file is the only record, and
continue and fork rebuild pi's session from it.

The one gain is a single record. The cost is that faithful continuation needs
provider-exact data: tool call IDs, and thinking signatures or encrypted
reasoning that some providers require on the next request, plus pi's entry
tree for branching and its compaction entries. Our format would become lossless
pi entries, a reimplementation of pi's format that follows its upgrades.
Getting it wrong breaks continuations and prompt caching, which the fork-cost
measurements depend on.

### Recommendation

Option A, with three choices:

1. **The harness writes the file.** The port's `AgentEvent` grows to carry
   transcript content, and the harness's
   [`PortEventRecorder`](../../subs/harness/src/run/port-events.ts) writes it
   beside the observations. Implementation runs and standalone sessions already
   share that recorder, so both get transcripts. The format is defined once
   for every agent.
2. **Entries are numbered per session**, as observations are per invocation.
   Cursors and the live view rely on the number.
3. **Durable writes at message granularity.** Streaming deltas, if wanted,
   stay in memory on the same entry numbers.

## Proposed shape

### Transcript entries

Each line has `n`, `at` and a `type`. A first sketch:

| Type | Content |
| --- | --- |
| `started` | role, work, workspace, requested and actual mode, model, the rendered system prompt |
| `message` | `user`, `assistant` or `tool-result`; content blocks (text, thinking, tool call with ID and arguments, other); usage and stop reason for an assistant message; a tool result names its call ID |
| `harness` | what the harness said or decided: guard denial, submission verdict, post-write check, read reminder, appended context, budget reached |
| `compaction`, `retry` | pi's own events, with their sizes and reasons |
| `ended` | the outcome kind, interruption and error |

A tool call is visible from the assistant message that makes it; it shows as
running until the result with its call ID arrives. The shell tool already
writes its whole output to `invocations/<id>/shell/`, which could serve a live
tail of a long command.

A forked session's transcript starts with an entry naming the session and
entry it forked from; it links to that history rather than repeating it.

### Rendering and storage

The transcript view shows every entry as a header, and much of its content
collapsed by default: thinking, whole files, tool calls with their input and
output, the system prompt and appended briefs. That decides the storage.

- **Everything is stored.** Nothing can be expanded that was not kept, so
  file contents stay in the transcript, as [decision 8](#decisions) allows.
- **Each block has a header and a body.** The header is always shown and
  small: the block's kind and, for a tool call, its neutral action and result,
  such as "read `subs/web/src/app.tsx`, 240 lines", "shell `npm test`, exit 1"
  or "edit `x.ts`, +3 −1"; for thinking, its first line and size. The body is
  the content an expansion shows: the thinking text, the file, the tool's
  input and output.
- **Large bodies are stored out of line and addressed by content.** A body
  over a threshold goes to the run's content store, `blobs/<sha256>`, and the
  entry holds its hash and size. A file read many times, and the system
  prompt every invocation of a role shares, are stored once.
- **The view loads headers and fetches bodies on expansion.** Polling for new
  entries stays small however large the session's reads are.
- **A file is shown as a file.** A read's body is rendered with its path, line
  numbers and highlighting, and a partial read shows its range.
- **Retention can prune in two steps.** Bodies go first; headers, which are
  small, can stay longer and keep the session's shape readable.

The shell tool already writes each call's whole output to
`invocations/<id>/shell/`, which a body can reference instead of copying.

### Crash durability

A crash must not lose session history, which cucumber-viz does because its
durable record is written once per turn.

- Each entry is appended with the ledger's
  [`appendJsonLine`](../../subs/harness/subs/ledger/src/jsonl.ts), which syncs
  every line, and read with `readJsonLines`, which discards a trailing partial
  line as an interrupted append. A crash loses only the entry in progress: a
  streaming assistant message or a tool result not yet returned.
- The `started` entry holds the rendered prompts before the model is called.
  Today a crash before the first reply leaves no record of them: pi buffers its
  file until that reply, and the harness stores only the prompts' hashes.
- Entry numbers are never reused, and recovery adds an interrupted
  invocation's end without removing its records.
- pi appends to its own file without syncing, so an operating-system crash can
  lose its last messages. That affects continuation, which already falls back
  to a session reconstructed from records, not the transcript.

### Liveness and the session list

A project-wide list is built from each run's log, not by scanning invocation
directories every second. Standalone sessions join the same list without a
diagram element. Live sessions come first, by start time, then the others, by
their last end time. An entry is a session; its invocations are segments of
its transcript.

### Updates

One request per run carries a cursor per live session and returns the newer
entries of each, plus which sessions changed state. Polling suffices at
message granularity; server-sent events could later reuse the same numbers.

### Diagram association

| Session | Element |
| --- | --- |
| local architect, engineer, contract engineer | its work item's capability node and module node |
| global fork | its request's capability and work item |
| initial architect, readiness and other run-wide work | a run-level strip |

A node shows the number of live sessions with role chips, and suspended
sessions distinctly. Selecting it lists
its sessions, running first; selecting a session opens its transcript.

## Executors beyond pi

Another executor, such as Claude Code or Codex, may be added later. The design
above generalizes if nothing above the agent port depends on pi.

**Already independent of pi:**

- The agent port abstracts pi and the scripted fake. A session mode the
  executor cannot honor degrades to fresh with a reason, and an observation it
  cannot make is a coverage gap with a reason
  ([port.ts](../../subs/harness/subs/agent/src/interfaces/port.ts)).
- The session model, lineage, liveness and retention are the harness's. Their
  points are sessions and transcript entry numbers, never an executor's refs.
- The transcript is written by the harness in its own format from port
  events, not read from an executor's files.

**One leak today.** Activity, read excursions and search records are
classified by tool name and argument names: `read` with `path`, `grep`,
`find` and `ls` with `path`, `pattern` and `glob`, anything with `command`
([activity.ts](../../subs/harness/src/jobs/activity.ts)). These are pi's
names. The port's built-in tool names match pi's, and the adapter passes pi's
tool names and inputs through unchanged. An executor whose read tool is
`Read` with `file_path` would record no reads and no excursions, silently.

**Rules that keep it independent:**

1. **Nothing above the port reads an executor's native records or parses its
   refs.** Refs stay opaque to everything but their adapter.
2. **The adapter classifies each tool call.** `tool-started` carries a neutral
   action, such as a read of a path, a search, a write of paths, a command or
   a harness tool, beside the executor's own tool name and input. Activity,
   excursions and guards use the action; the transcript shows the executor's
   own names.
3. **The transcript's vocabulary is neutral.** Blocks are text, thinking, tool
   call, tool result and other. A block the adapter cannot map is recorded as
   unmapped, never dropped.
4. **Each executor declares what it supports,** extending the port's
   `observations` to continue, fork, fork at a point, append without a model
   call, an exact system prompt, a guard before a mutating call, a hook after
   one, streaming and thinking. What it lacks degrades with a reason, as modes
   do today, and optional detail it lacks is simply absent (see below).
5. **The executor and model are recorded per session,** in `session-opened`,
   not only as the run's agent. Different roles could then use different
   executors.
6. **Retention prunes only what the harness owns.** An executor may keep its
   native session outside the session directory, as command-line tools
   usually do in the user's home directory. Nothing but continuation may
   depend on those files.
7. **Liveness and settlement stay the harness's.** A subprocess executor is
   one more process group to settle; nothing it reports decides a state.

**A required core, and optional detail.** Independence limits what is
required, not what is used. Every executor must supply the core: messages
with text, tool calls and results paired by call ID, an outcome, and the
start mode that was actual. Anything more an executor reports is recorded and
shown when present. When it is absent, the transcript or measurement says so,
and nothing fails, as with the port's observations today. No view or measurement
may depend on optional detail to work; it may only be richer with it.

Thinking is the main example. pi supplies each thinking block's full text, and
marks a block the provider redacted. Another executor may supply a summary or
nothing. A thinking block therefore carries its visibility, `full`, `summary`
or `redacted`, and a session whose executor reports no thinking says so rather
than showing none.

Optional detail pi supplies today:

| Detail | From pi | Used for |
| --- | --- | --- |
| thinking text, and whether it was redacted | each assistant message's thinking blocks | the transcript, collapsed |
| reasoning tokens, cost, and cache writes by retention | each message's usage | cost analysis |
| the model that actually answered, and the thinking level used | each assistant message | the transcript, and comparing forks and models |
| stop reason and error per message | each assistant message | the transcript, and failure analysis |
| context size estimate and window | observed after each boundary | context growth across segments |
| compaction with its sizes, automatic retries | pi's session events | the transcript, and coverage notes |
| streaming text and partial tool output | `message_update`, `tool_execution_update` | the live view only |

Opaque provider data, such as thinking signatures, stays in pi's own file for
continuation and is not copied into the transcript.

**Where it is not natural.** The visualization, lineage and transcript
design carry over unchanged. What varies by executor is the harness's control
over a session: whether it can replace the system prompt exactly, guard a
write before it happens, run a check after it, append context without a model
call, and fork at an arbitrary point. Each needs checking against the
executor's API. They decide whether a role can run on that executor at all,
not how its sessions are shown.

## Retention

Raw run output becomes irrelevant some time after its plan is done, and it
needs cleaning up. The measurement below shows that transcripts are not the
bulk of it.

**What a run stores.** The largest trial run on disk
(`/tmp/ramify-agent-loop-trial-EywzIE/...`, 32 invocations, 62 MB):

| Data | Size | Kind |
| --- | --- | --- |
| post-write hook outputs, `invocations/*/hooks/` | 28 MB | raw |
| gate logs, `gates/*/*.log` | 25 MB | raw |
| pi session files | 3.4 MB | raw |
| shell outputs, `invocations/*/shell/` | 3.3 MB | raw |
| the run log, invocation, outcome, submission, observation, line, gate, measurement and work records | about 2 MB | structured |

The proposed transcript would add about as much as pi's files. The raw check
output is over 80% of a run.

**Two tiers.**

- **Structured records are kept.** They are small, and the run page, the
  progress diagrams, the metrics and KPIs, and the audit's workspace records
  (`gates/<id>/audit-workspace.json`) read them. The session metrics are a
  projection of records, not of raw output
  ([kpi/sessions.ts](../../subs/harness/src/kpi/sessions.ts)).
- **Raw output is pruned:** hook outputs, gate logs, shell outputs, pi session
  files and transcripts. The records that name a raw file keep its name; the
  file goes.

**When a run is eligible.** Only when it is final: `completed`, `failed`,
`stopped` or `interrupted`. None of them is resumed, since recovery never
restarts an interrupted run, so no pruned session can be continued. A running
run, one this process drives, and any run holding a live or suspended session
are never touched. The harness has no plan-completed state: a plan has runs,
and delivery or merge is out of scope. Two candidate rules:

- **By run:** a final run's raw output is pruned a week after it ended.
- **By plan, as asked:** a week after a plan's run completes, the raw output of
  every final run of that plan is pruned. A plan that never completes keeps
  its failed runs for debugging until a longer age or a manual prune.

**Who and how.**

- The harness prunes, being the only writer, when the server opens and daily
  while it serves, and through a command such as `ramify-agent prune` with a
  dry run.
- Each pruned run gets a retention record, beside `job.json` and outside its
  final run log: the rule, the date, the paths removed and the bytes freed.
  The web then shows "pruned on <date>" instead of a missing file, which is
  the behavior the future
  [session explorer](../future/README.md#agent-session-explorer) asks for when
  a raw transcript is unavailable.
- A run can be kept from pruning, for example a run cited as measurement or
  audit evidence.
- Standalone sessions under `plans/.harness/sessions/` belong to no plan and
  follow the age rule. Trial copies under `/tmp` belong to their scripts, not
  to the harness.

A cheaper first step is compression: JSONL and logs compress well, and a
transcript kept compressed stays readable after the raw check output is gone.

## Lessons from cucumber-viz

A study of the cucumber-viz 0.7.0 install on 2026-09-23 adds to the earlier
[lessons](../cucumber-viz-lessons/README.md). Paths below are relative to
that install. It records sessions as follows:

- **Its own format.** Each runtime's output is folded into one normalized
  event stream (`src/core/shared/services/agent-chat/types.ts`); the native
  conversation ID is kept only for resume and fork. This is the split Option A
  proposes.
- **Live events in memory only, durable once per turn.** The events live in
  unbounded in-memory arrays, and a turn file is written once, non-atomically,
  when the turn ends (`agent-chat/turn-recorder.ts`). A crash loses the turn
  in progress. Offsets restart when a chat key is reused.
- **Push first, polling added later.** One WebSocket broadcasts every event to
  every client, with no sequence numbers and no catch-up on reconnect. The
  client later gained 1-second polling after a start, a 10-second backstop,
  whose comment says push alone "leaves the UI permanently stale if a session
  event is missed", and a "longer wins" merge of snapshots
  (`ui/hooks/useAgentChat.ts`). An offset query exists but the UI never uses it.
- **Thinking dropped, tools late and unpaired.** Thinking is discarded. A tool
  call is emitted once, when its result arrives, without a call ID, so a long
  command is invisible until it ends. Raw tool output is uncapped through
  memory, the socket and the files; only the display truncates it.
- **Association by key strings and named slots.** Work is encoded in chat key
  strings such as `…:iter:${i}`, workflow state holds one named chat key per
  role, and finished transcripts are found by scanning and parsing every turn
  file.
- **Liveness from memory, and orphans.** A session is live while its in-memory
  aggregate exists; staleness is a 24-hour client heuristic. A crash once left
  a turn marked active and blocked every later prompt to that session.
- **Two incidents from testing.** Events that arrived while the client was idle
  were dropped, and a bug where chunks after the first did not render was
  hidden by tests that delivered every chunk in one batch.
- **Rendering that works.** Text and tool blocks interleave in order, each
  tool is one summary line with its raw input and result collapsed, earlier
  failed attempts and the long initial prompt are collapsed, and the view
  sticks to the bottom with a "new messages" flag
  (`ui/components/AgentChatPanel.tsx`).

What this design takes from it:

| Lesson | Stance |
| --- | --- |
| A harness-owned normalized transcript; the agent's native record only for continue and fork | adopt |
| Append each complete entry as it happens, never one write at the end | adopt |
| Cursors unique per session and never reset | adopt |
| Polling for entries after a cursor as the primary channel; push, if ever, only as a hint to poll | adopt |
| Record thinking, render it collapsed | adopt |
| Tool calls and results paired by pi's call ID; a call without a result is shown running | adopt |
| Keep large tool output out of the entry, stored out of line and fetched on demand | adopt |
| Structured references from invocation to work, queried from an index, never key strings or file scans | adopt |
| A set of invocations per work item, never one slot per role | adopt |
| Lifecycle from the harness's records, never from the agent or a client heuristic; an invocation no harness awaits is shown interrupted | adopt |
| The rendering patterns above, tested with entries arriving at different times | adopt |
| Broadcast to every client and merge snapshots heuristically | avoid |

Two points sharpen the proposal:

- **The waiting harness must be known to exist.** The HTTP server and the run
  service share one process ([server.ts](../../subs/harness/src/http/server.ts)),
  so the server knows which invocations its harness awaits. A standalone
  `ramify-agent session` cannot run beside the server; see
  [the lifecycle](#the-session-lifecycle-belongs-to-the-harness).
- **Streaming is within reach.** Because the server holds the run service,
  in-memory streaming text for implementation runs needs no separate channel
  between processes. Standalone sessions would still show only complete
  entries.

## Decisions

Taken on 2026-09-23, before planning:

1. **One plan, in iterations.** It covers the session model and lineage,
   transcript recording, the query protocol, the session list and transcript
   view, the diagram markers, the lineage timeline and the lineage
   measurements. Later parts are later iterations.
2. **The metrics grouping defect is fixed in this plan,** once session IDs
   exist.
3. **The neutral tool classification is in this plan,** since it changes the
   same port events.
4. **Live granularity is complete entries.** Streaming text may follow later
   on the same entry numbers.
5. **Every session means this project's runs and standalone sessions.** Trial
   copies in other directories are other projects.
6. **Suspended sessions are listed with the live ones,** marked suspended.
7. **Transcripts exist for runs recorded after the feature.** An earlier run
   lists its invocations without transcripts.
8. **Transcripts and stored prompts are raw output, not records.** The rule
   that records hold no file contents stands. A transcript is stored whole, as
   pi's files, shell logs and hook outputs already are: never quoted in a
   record, pruned by retention, and never part of committed trial evidence.
   Redaction of secret-looking values is not decided.

## Open decisions

1. **Recovery:** add the session's lifecycle to the recovery that already
   closes interrupted invocations.
2. **Session events:** confirm the names, data and reasons of the
   [proposed model](#proposed-session-model).
3. **Body size threshold:** the size above which a body is stored out of line.
4. **Redaction:** whether transcripts mask secret-looking values.
5. **Retention**, deferred to the [to-do list](../todo.md): by run or by plan,
   the age, and compression before deletion.
