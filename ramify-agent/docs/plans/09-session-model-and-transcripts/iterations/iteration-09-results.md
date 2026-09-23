# Iteration 9 results: lineage timeline

**Date:** 2026-09-23. **Owner:** `web`. **Branch:** `feat/plan9-i9`.

Run → Sessions now draws the run's session history as a timeline. Each
session is a lane. Its invocations are segments, and each segment opens its
chapter of the transcript. Suspended time is a gap, and each appended brief
is a mark. Forks branch from their source point, replacements are dashed
links, and requested sessions are linked from their requester. Degraded
starts are marked. Only the web module changed. It receives the iteration 6
protocol and adds no exposure.

## Final names

### Files

| File | Holds |
| --- | --- |
| [session-timeline.tsx](../../../../subs/web/src/session-timeline.tsx) | `layoutSessionTimeline(sessions)` → `SessionTimelineLayout`; `SessionTimeline({ planId, runId, answer })`; `segmentName(session, segment)`; the types `TimelineColumn`, `TimelineLane`, `TimelineSegment`, `TimelineGap`, `TimelineMark`, `TimelineLink`, `TimelineLinkKind` (`fork`, `replace`, `request`) and `TimelineUnplaced` |
| [run-page.tsx](../../../../subs/web/src/run-page.tsx) | `RunSessions` reads `getRunSessions` through `useRunQuery('sessions:<run>', version, …)` and renders `SessionTimeline` in a wide area (`area area-wide`) |
| [tests/helpers/lineage.ts](../../../../subs/web/src/tests/helpers/lineage.ts) | `lineageSessions()` and `lineageAnswer(sessions?, version?)`: five sessions with every relation, built on `helpers/sessions.ts` |
| [tests/session-timeline.test.tsx](../../../../subs/web/src/tests/session-timeline.test.tsx) | the component and layout tests |

### Layout

`layoutSessionTimeline` is pure and deterministic, like
`layoutCapabilityGraph`:

- **Lanes.** One lane per session, in the answer's order, which is the order
  the run opened them.
- **Columns.** The columns are the run events at which some session changed,
  in sequence order, one step (76 px) apart. These are each invocation's
  start and end, each append, and each suspension's end. A session with no
  invocation uses its `opened` event. Events that change no session, such as
  gates, take no room. A column is an event's position, never a duration.
- **The latest edge.** An invocation that has not ended, or a suspension
  that lasts, reaches one more column, the latest edge (`sequence: null`).
  Its tick reads `now` while a session is live or suspended, and `end`
  otherwise.
- **Segments.** A segment runs from `started` to `ended`, or to the latest
  edge (`open`). Its chapter number is its position in `invocations`.
- **Gaps.** Each gap is one `suspended` entry, from `from` to `until` or the
  latest edge.
- **Marks.** Each mark is one `appends` entry, at its `appended` event.
- **Links.** Each link runs from a source x on the source lane to the
  target lane's start:
  - `fork`: from `lineage.fork.from`, at the end of that invocation's
    segment or at that append's mark;
  - `replace`: from the end of the replaced session's lane;
  - `request`: from the end of the requester invocation's segment, or its
    start while it runs.
- **Unplaced relations.** A relation whose source session, invocation or
  append is not in the answer is not drawn. It is listed in
  `unplaced`, and the page lists it under "Relations not drawn".

### What the page shows

The timeline follows the capability graph:

- a header that says what lanes and columns mean;
- a coverage status for a bounded answer (`total` above the sessions
  returned) and for relations not drawn;
- a legend: invocation, awaited, suspended, brief appended, fork,
  replacement, request, degraded start;
- a focusable scroll frame, `Scrollable session timeline`, around a
  surface of role `group`, named with its session and column counts;
- a closed `<details>`, `Session list`, as the text alternative.

**Lanes.** Each lane is a `group` named `<session> <role>, <state>`. Its
label stays in view while the timeline scrolls sideways (`position:
sticky`). The label shows the session as a link to its transcript, the
state badge and the role. A sticky corner covers the ticks scrolled under
the labels.

**Segments.** Each segment is a link to `chapterHref(ref, invocation)`. Its
name is `segmentName`, for example `Chapter 2 of ses-0003: inv-0005,
continued from the end of inv-0003 (iteration-closed), submitted, kept,
events 13 to 14`. The name holds the start relation, how the segment ended
(`awaited` or `not ended` where it has not), the degraded start and its
events. It is also the segment's `title`.

**Segment classes:**

- `timeline-segment-<outcome>`, or `-awaited`, or `-not-ended` for an
  interrupted session;
- `timeline-segment-open`, with a dashed right edge;
- `timeline-segment-degraded`, with a visible `!` badge.

**Marks.** Each mark is a link to `pointHref(ref, append.point)`, named
`Brief <decision> appended to <session> at event <n>, context generation
<g>`, with `, already present` where it was.

**The SVG.** It is `aria-hidden` and draws the lane bands, the column rules,
the gaps (`timeline-gap`, `timeline-gap-open`) and the links. A link is a
`timeline-link timeline-link-<kind>` with `data-from` and `data-to`: a fork
is solid, a replacement dashed and a request dotted, each with an arrow.

**Keyboard.** The tab order is the lanes in order. Within a lane it is the
session link, then each segment, then each mark. Enter follows a link. This
matches the capability graph, whose nodes are all in the tab order.

**Text alternative.** For each session, `Session list` gives:

- its link, state, finish reason and reach;
- its relations in words, both directions, with point, chapter and session
  links;
- each chapter with its start, end, events and degraded start;
- each suspension;
- each append, as a link to its point.

**Live updates.** The Run page's `useRunQuery` reads the sessions again
whenever the run's version moves. The run's version moves with each poll
of its events while it runs. An awaited segment therefore reaches `now`,
and ends once its `invocation-ended` is read.

### Removed

- `RunSessions`' interim list from iteration 7.
- The Measurements tab's Sessions table (`SessionRow`). Its evaluation
  columns are in the transcript chapters (`EvaluationFacts`).
- The exports of `guardingText`, `hookChecksText`, `excursionsText`,
  `linesText` and `usageText` in `evaluation.tsx`, which only
  `EvaluationFacts` now uses.
- The `.session-chapters` rule.

## Changes from the design

1. **Columns are event order, not time.** The plan says "suspended time as
   gaps". A gap spans the events of its suspension, but its width is not
   its duration. Wall-clock time would squeeze short invocations beside long
   suspensions and waits. The run's event order is what the log records,
   and it keeps the layout deterministic. The times stay in the transcript
   and the events stay in the Overview feed, whose sequence numbers the
   ticks show.
2. **A lane starts at its first invocation's start,** not at
   `session-opened`, which is the event just before it. Fork, replacement
   and request links end there.
3. **A degraded start is known only at the invocation's end** (iteration 2,
   decision 2). An awaited segment is marked degraded only once it has
   ended.
4. **The harness still serves `metrics.evaluation.invocations`.** The web no
   longer reads it. Iteration 6's HTTP test compares it with each
   `SessionInvocation.evaluation`, so the harness field is left in place.

## Exit evidence

From `ramify-agent/`:

```sh
npx vitest run subs/web/src/tests
# 10 files, 95 tests passed (session-timeline 10 new; run-page's Sessions test rewritten)
npm run type-check     # passed
npm run build:web      # built
npm run check:self
# Execution: completed; check: passed; coverage: partial
# Findings: 0 errors, 0 warnings, 132 analysis limits (unchanged)
```

[session-timeline.test.tsx](../../../../subs/web/src/tests/session-timeline.test.tsx)
covers ST12, using the helper run in `helpers/lineage.ts`:

- **Segments and gaps.** Each session is a lane with one segment per
  chapter, each linking to its chapter.
  - The columns are the changed events, then the latest edge.
  - ses-0003's two segments and its two gaps meet at their events.
  - The architect's lasting suspension and the awaited segment reach the
    latest edge, labelled `now`.
- **Appends.** A mark at the append's column links to
  `/appends/6`.
- **Forks.** The fork link starts at the source append's mark and ends at
  the fork's lane start. A variant forked from an invocation's end starts at
  that segment's end. The fork's segment name says where it forked from.
- **Replacements.** A dashed link runs from the end of the replaced lane
  (its `replaced` finish) to the replacing lane.
- **Requests.** The link runs from the end of the requester's segment to the
  requested lane, and the segment's name names the requester.
- **Degraded starts.** Only the degraded segment carries the class and the
  `!` badge, and its name says what was requested and made.
- **Keyboard and text alternative.** The scroll frame is focusable. Links
  come in lane order: session, segments, marks. The list states every
  relation in both directions, each suspension and each chapter link.
- **Coverage.** A bounded answer without the fork's source says "Showing
  4 / 5 sessions" and lists `ses-0002 forked from ses-0001` as not drawn,
  and no fork link is drawn.
- **Selecting a segment opens its chapter.** Through `App`, clicking a
  segment follows its fragment, and the session page marks that chapter
  selected and focuses its heading.
- **Live updates.** On a running run polled every 10 ms, the awaited segment
  becomes `submitted` and the lane becomes `finished` once the version
  moves.

`run-page.test.tsx` checks the timeline inside the Run page and that
Measurements no longer has a Sessions table.

**Browser check.** This is not the acceptance evidence, which is iteration
11's. `serve-progress-fixture.ts` was served on port 4197 and stopped by its
PID afterwards. Its `revision-diff` run has 7 sessions, 11 invocations, 4
appends and 4 forks.

- **1440×1000.** Run → Sessions drew every lane, segment, mark and fork.
  The timeline, 2340 px wide, scrolled inside its frame, and the page did
  not scroll sideways (`scrollWidth` 1440).
- **390×844.** The lane labels stayed in view while the frame scrolled. The
  page did not scroll sideways (`scrollWidth` 390), and the session list
  wrapped.
- **Opening chapters.** Clicking `inv-0006` opened ses-0002's chapter 3,
  selected and focused. Tab from the ses-0001 link, then Enter, opened
  ses-0001's chapter 1.
- **Console.** No errors or warnings at either width.

## Open items

- **The fixture has no replacement, request, degraded start or live
  session.** The tests cover them. Iteration 8 extends the served fixture,
  and iteration 11 records the browser evidence on it.
- **A long run makes a wide timeline:** one column per changed event, which
  the frame scrolls. Collapsing idle stretches or zooming is left for when a
  real run needs it.
- **`metrics.evaluation.invocations`** is now unused by the web. The harness
  could drop it once nothing else needs it.
