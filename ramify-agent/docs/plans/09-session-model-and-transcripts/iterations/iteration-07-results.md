# Iteration 7 results: session list and transcript view

**Date:** 2026-09-23. **Owner:** `web`. **Branch:** `feat/plan9-session-model`.

A person can now find any session of the project and read or follow its
transcript. The Sessions page lists every session, and a session route shows
its transcript as chapters, one per invocation. Bodies are fetched only when
opened, and a live run session is followed with the run's update poll. Only
the web module changed. It receives the iteration 6 protocol and adds no
exposure.

## Final names

### Routes

The URL fragment selects each route, as before. `routes.ts` holds the new
`Route` members `{ page: 'sessions' }` and
`{ page: 'session', session: SessionRef, anchor: SessionAnchor | null }`.

| Fragment | Page |
| --- | --- |
| `#/sessions` | the Sessions page |
| `#/plans/<plan>/runs/<run>/sessions/<ses-NNNN>` | a run's session |
| `#/sessions/standalone/<session-id>` | a standalone session |
| either session fragment + `/chapters/<invocation>` | opens that invocation's chapter |
| either session fragment + `/points/<invocation>` | opens the point that invocation's end made |
| either session fragment + `/appends/<sequence>` | opens the point an append made, by its `brief-appended` sequence |

`SessionAnchor` is `{ kind: 'chapter', invocation }`,
`{ kind: 'point', invocation }` or `{ kind: 'append', append }`. Opening an
anchor scrolls to its element and focuses it: the chapter heading
`#chapter-<invocation>`, or the point entry `#point-<invocation>` or
`#point-append-<sequence>`. A chapter opened this way is marked
`chapter-selected`.

Iterations 8 and 9 link with these helpers from `routes.ts`:

- `sessionHref(ref, anchor?)`: a session's transcript.
- `chapterHref(ref, invocation)`: one invocation's chapter. A timeline
  segment or a node's session opens this.
- `pointHref(from, point)`: a `TranscriptPoint`. In a run, the point's session
  belongs to the same run as `from`.
- `sessionKey(ref)`: a key that names a session wherever it is. `App` keys
  `SessionPage` with it, so a new anchor on the same session opens that
  place without a new read.

`App` mounts `SessionsPage` and `SessionPage`, and `<main>` carries the
classes `route-sessions` and `route-session`. The header's new
`<nav aria-label="Pages">` links Plans and Sessions and marks the current one
with `aria-current`.

### Files and components

| File | Holds |
| --- | --- |
| [sessions-page.tsx](../../../../subs/web/src/sessions-page.tsx) | `SessionsPage({ client, interval = 5000 })`: the project's list in two groups, live and suspended, then finished and interrupted, in the harness's order; each entry links to its transcript, and a run session also to its run; unserved sources as an alert; Previous and Next by the harness's offsets; read again every `interval` while a listed session is live or suspended, and on Refresh |
| [session-page.tsx](../../../../subs/web/src/session-page.tsx) | `SessionPage({ client, session, anchor, interval? })`: the session's facts and lineage, the following status line, the missing-file notice, and the transcript frame with its chapters; `stickMargin` (48 px) |
| [transcript.tsx](../../../../subs/web/src/transcript.tsx) | `TranscriptEntryView`, `TranscriptBodies` (the page's body source, which requests each blob or file once), `FileView`, `ActionText`, `PointLink`, `pointText`, `pointElementId`, `transcriptCalls`, `bytesText`, `TranscriptContext` |
| [session-progress.ts](../../../../subs/web/src/session-progress.ts) | the polling hook `useSessionTranscript(client, ref, interval = 1000)` → `SessionTranscript { detail, entries, file, unreadable, following, error }`; `SessionDetail` (`{ source: 'run', version, session, sessions }` or `{ source: 'standalone', standalone }`); `isFinal(state)` |
| [evaluation.tsx](../../../../subs/web/src/evaluation.tsx) | `EvaluationFacts({ evaluation })`: the chapter's facts, labelled `Evaluation of <invocation>`; `guardingText`, `hookChecksText`, `excursionsText`, `linesText` and `usageText`, which the Run page's Sessions table now uses too |
| [run-labels.tsx](../../../../subs/web/src/run-labels.tsx) | `SessionState({ state })` (the `session-state-<state>` badge) and `reachText(reach)` |
| [run-page.tsx](../../../../subs/web/src/run-page.tsx) | a new **Sessions** area (`RunSessions`, between Progress and Measurements): each session links to its transcript, and each invocation to its chapter |

### How the transcript reads

- **Chapters.** Consecutive entries of one invocation make one chapter.
  Entries with `invocation: null`, such as an appended brief or note and its
  point, stand between chapters under "Between invocations". An invocation
  that the session view names but that has no entries is an empty chapter at
  the end. This covers a missing transcript file.
- **The chapter header** shows:
  - the chapter number and the invocation;
  - its outcome, or `awaited` while the session is live, or `not ended`;
  - the start relation and its reason: opened fresh, forked from a point
    (with the context generation), opened in place of a session, requested by
    an invocation, or continued from a point with the briefs appended since;
  - `requested <mode>` from the `started` entry;
  - a degraded start;
  - the start and end moments, whether its end kept the session, and its end
    point as a link;
  - `EvaluationFacts`.

  A run session's header reads the run's view. A standalone session's reads
  its `started` entry and its detail's evaluation.
- **Blocks.** A body is rendered only while its disclosure is open. Each
  disclosure is a button with `aria-expanded` and `aria-controls`.
- **Collapsed by default:**
  - thinking, with its visibility as a badge; a `redacted` block is a line
    that says so, with no body;
  - a tool call's input;
  - a tool result's output, and its complete `output` file;
  - the system prompt and the first prompt;
  - brief and note texts, guard and submission texts, check logs and
    reminders;
  - any text block that is stored, or longer than 2000 characters.
- **Shown open:** inline text of at most 2000 characters.
- **Tool calls.** A call's header is its neutral action, such as
  `command npm test` or `read src/app.ts, lines 10–12`, with its status:
  `answered`, `running` while the session is live, or `no result`.
- **Reads.** A tool result is paired with its call by call ID. A successful
  read's output is a `FileView`: the path, the range, and an `<ol start>` of
  lines numbered from the range's start. A last bracketed line after a blank
  line is the tool's note, shown unnumbered.
- **Optional detail.** Each assistant message shows its usage and each
  reported detail, then `not reported:` with the absent ones.
- **Bodies.** A stored or file body is fetched on its first expansion, and
  its failure offers Try again. A truncated body says so.
- **Points.** A point entry names the sessions forked from it and the
  invocations continued from it.

### Following

`useSessionTranscript` works as follows:

1. **Reading.** For a run session, it reads `getRunSessions` and then every
   transcript page from cursor 0. A standalone session is read with
   `getStandaloneSession` and is never polled, since the server never sees
   one running.
2. **Polling.** While a run session can change, it polls
   `pollSessions(planId, runId, version, [{ session, after: cursor }])` every
   `interval`. It polls at once when a page says `more`.
   - Each answer's changed sessions update the run's session map.
   - The answer's `version` is the next poll's.
   - An entry at or below the cursor is dropped, so an entry is never shown
     twice.
3. **Stopping.** Polling stops once the session is `finished` or
   `interrupted`, the last page had no `more`, and the entries are complete.
   They are complete when the last entry is `ended` or `point`, or when the
   file is missing, or after two polls brought nothing. The end's entries can
   follow its state, as iteration 6 notes.
4. **Errors.** A failed poll keeps what was read, and the status line says
   the harness is not answering. The poll is tried again. A protocol
   refusal on the first read, such as an unknown session, is final.

`SessionPage` keeps the view at the bottom as entries arrive:

- The transcript scrolls inside a frame: a focusable
  `region "Transcript of <session>"`.
- Within 48 px of the bottom, new entries scroll it to the bottom.
- Otherwise a `N new entries below` button counts them. Pressing it scrolls
  to the bottom.
- A live session opens at its bottom, unless an anchor names a place.
- The status line (`role="status"`, `Following`) states the session's state.
  After a change while the page is open, it begins "It became <state> while
  this page was open".

## Changes from the design

1. **Run → Sessions is a list for now.** The plan's runnable outcome puts the
   timeline under Run → Sessions (iteration 9). The Run page had no Sessions
   area, and its per-invocation table is under Measurements. This iteration
   adds the Sessions area as a list of sessions with chapter links, so a
   session is reachable from the Run page. Iteration 9 replaces that list
   with the timeline, and removes the Measurements table, whose columns the
   chapters now carry.
2. **A message's `error: null` is not listed as "not reported".** For every
   other detail field, null is listed as absent. An error is shown only
   when present, since a null error is the ordinary case and would otherwise
   appear on every message.
3. **The first prompt is collapsed** with the system prompt. Its copy, the
   first `user` message (iteration 5, change 5), is a text block that is
   collapsed above 2000 characters.
4. **The chapter's evaluation formatting is shared** with the Run page's
   Sessions table, through `evaluation.tsx`, rather than copied.

## Exit evidence

From `ramify-agent/`:

```sh
npx vitest run subs/web/src/tests
# 9 files, 85 tests passed (session-page 14, sessions-page 5, run-page +1)
npm run type-check     # passed
npm run build:web      # built
npm run check:self
# Execution: completed; check: passed; coverage: partial
# Findings: 0 errors, 0 warnings, 132 analysis limits (unchanged)
```

The three touched test files were also run together three times, and passed
every time (34 tests each run).

Component tests in [session-page.test.tsx](../../../../subs/web/src/tests/session-page.test.tsx)
(ST10):

- **Collapsed-by-default blocks.** Every Thinking, Input, File, System
  prompt, Prompt, Note and Complete output disclosure has
  `aria-expanded="false"`. No body is in the page, and text is shown.
  Another test shows the thinking visibility and every absent detail.
- **Lazy bodies.** A read's blob is requested on its first expansion only.
  It renders as `src/app.ts`, "lines 10–12", with an `<ol start="10">` of
  three lines and the tool's note. Closing and reopening it asks nothing
  more. The inline thinking needs no request. The system prompt blob both
  invocations share is requested once. A body that is not served offers
  Try again.
- **Entries in separate polls.** Two polls append entries 11, then 12 and 13,
  to chapter 2 in order. The polls ask after 10, then 11, then 13, with the
  version each answer gave. A repeated entry is not shown twice.
- **A state change while open.** One poll answers the session `finished`
  before its `ended` and `point` arrive, two polls later. The badge and the
  status line change, and the chapter shows `submitted`. Polling stops
  after the point. Another test covers a session that becomes `interrupted`
  and gets no end: polling stops after two quiet polls.
- **Following.** Away from the bottom, arrivals are counted as "1 new entry
  below", then "2 new entries below", and pressing it scrolls to the bottom.
  Within the margin, the view follows.
- **A missing transcript file.** The page shows the notice, both chapters
  with "No entries" and their evaluations (guarding, hook checks, reads
  outside the scope, lines and tokens, or unavailable), and makes no poll.
- **Links.** The tests cover chapter relations and reasons, the point and
  fork-source links, a degraded fork, and a point's forked sessions. A
  point anchor and a chapter anchor each focus their target. Further tests
  cover a standalone session and an unknown session.

[sessions-page.test.tsx](../../../../subs/web/src/tests/sessions-page.test.tsx)
covers:

- the list's order, groups, links and unserved sources;
- rereading while a session is live, and no rereading otherwise;
- paging and the empty project;
- the header's links and the session routes through `App`;
- round trips of every route and anchor.

`run-page.test.tsx` covers the Run page's Sessions area and its chapter
links.

**Browser sanity check** (not the acceptance evidence, which is iteration
11):

- The page was served with `serve-progress-fixture.ts` on port 4193, then
  stopped.
- The Sessions page listed the fixture runs' 12 sessions.
- `ses-0006` (local architect, two chapters) rendered at 1440×1000.
- At 390×844 its `/chapters/inv-0011` link opened chapter 2. The
  screenshot shows no horizontal overflow; it was not measured.
- A system prompt blob was fetched from the real server on expansion.
- The console showed no errors or warnings.

## Open items

- **Iteration 8.** A node's session list links with `sessionHref` or
  `chapterHref`. `SessionState` and `reachText` render a state and a reach.
- **Iteration 9.** Iteration 9 replaces `RunSessions` in run-page.tsx and the
  Measurements Sessions table (`SessionRow`) with the timeline. A segment
  links with `chapterHref(ref, invocation)`, and a point or append with
  `pointHref`.
- **A live invocation's evaluation is not refreshed by the poll.** Iteration 6
  notes that its observations change without a run version, so a chapter's
  evaluation updates only when the session's state or history changes, or on
  reload.
- **One session per poll.** The transcript page follows only its own session.
  The poll already accepts up to 50 cursors, if a later view follows
  several.
- **The Sessions list** reorders on each read, as the harness orders it
  afresh. It has no filter or search. Search remains the future session
  explorer's.
- **The fixture has no live or suspended session** to watch in a browser.
  Iteration 8 extends it with sessions in every state.
