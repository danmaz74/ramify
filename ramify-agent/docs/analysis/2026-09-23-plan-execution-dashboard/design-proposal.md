# Plan execution dashboard: design proposal

Status: proposal, 2026-09-23, against `ramify-agent` at `7d6af7f`. Input:
the [inventory](README.md) of this directory, the current web client
(`subs/web/src`), the public protocol
(`subs/harness/src/interfaces/protocol`), the toolkit's module-tree canvas
(`ramify.ts/module-tree`) and the real run `20260923T164537Z-dbf0c2`. A
static [mockup](mockup.html) accompanies it; open it in a browser. Its
"large run" data is invented and labelled so.

The proposal is opinionated: each section recommends one design and says
why. Section 8 lists the questions only Dan can settle, each with the
recommended answer.

---

## 1. Principles and information architecture

### 1.1 Principles

1. **The four questions come first, on one screen.** The run's landing
   screen answers *now*, *done*, *left* and *issues* without a tab, a scroll
   or a click. Everything else is a drill-down from it.
2. **Four levels of detail, and each level is one click from the next.**
   Level 1 is visual (the overview, the map, the timeline); level 2 is a
   summary list; level 3 is one record; level 4 is raw (a transcript, a
   gate's output tail, the plan text). A visual element always opens its
   level-2 or level-3 counterpart; a record always names its level-4 raw
   source when one exists.
3. **Every identifier is a link, and every location is a URL.** No `wi-001`
   or `ga-0003` is ever plain text. Tabs, selected elements and time
   windows live in the URL fragment, so a link can open a gate, a work item
   or a selected capability on the timeline, and the browser's back button
   works.
4. **The work item is the hub.** It is the one element that joins
   capabilities to modules, scenarios to gates, and sessions to the work
   they did ([inventory §3.2](README.md#32-how-they-relate)). The related
   set of any element is computed through it, and the detail panel of any
   element shows its work item first.
5. **The web renders projections; it never establishes facts.** Layout,
   grouping, highlighting and ranking are presentation. "This capability is
   left to do", "this gate is running" or "this forecast is retired" are
   facts, and the harness publishes them or they are not shown. Where the
   harness does not publish a fact yet, the design says so and degrades to
   what is published (section 7).
6. **Aggregate before enumerating.** A view first shows counts and bars
   ("11 of 40 work items completed"), then a bounded list, then one record.
   A run with 3 sessions and a run with 300 use the same screens; the large
   run collapses groups the small one never needs to collapse.
7. **Show coverage and absence honestly.** A partial answer, a bounded
   list, an unavailable module tree or an unrecorded measure is stated where
   the reader would otherwise infer a false zero. This follows the harness's
   own rule that "unavailable is never zero".
8. **One meaning per color, across every view.** Blue means "working or
   awaited now" everywhere; green means "completed or passed"; red means
   "failed or blocking"; amber means "attention"; grey means "not started".
   Session roles use a separate categorical palette that never reuses those
   four hues. Today's By module view uses blue for "has an initial
   association", which the design retires.

### 1.2 Levels and elements

| Level | Screens | Elements at that level |
|---|---|---|
| 1 visual | **Overview**, **Map** (relational), **Timeline** (chronological) | run, phases, entry capabilities, modules, scenarios as marks, work items as lanes, sessions as lanes, gates as marks, issues as marks |
| 2 summary | lists: Work, Scenarios, Gates, Sessions, Capabilities, Modules, Decisions, Issues, Events, Measurements | each element as a row with state, counts and links |
| 3 record | pages: work item, iteration (within its work item), gate, scenario, capability, module, session, decision or hypothesis, issue | every field the protocol exposes, every relation as a link |
| 4 raw | transcript (existing), gate command output, captured plan, frozen scenario text, evaluation evidence | text |

### 1.3 Drill-down paths

Each path starts on the overview and ends at the deepest record. Every
step is a link; nothing needs a tab switch.

- **To a live transcript.** Overview "Now" card (the awaited invocation
  with its role and session) → transcript chapter at the live entry. Also:
  Timeline session lane segment → chapter; Map capability node session chip
  → chapter; Sessions list → transcript.
- **To scenario detail.** Overview "Progress" scenario bar segment (for
  example "3 declared") → Scenarios list filtered by state → scenario page
  (state history, entry, work item, owner, file, every gate result with its
  status, frozen Gherkin) → gate page for one result → the scenarios
  command's per-scenario line and output tail.
- **To a top-level capability.** Overview entry tile → capability page
  (state and reason, owner, scenarios with states, work item, lower-level
  dependencies, evidence gates, sessions) → work item page → iteration →
  gate or chapter.
- **To a lower-level capability.** Capability page "depends on" list, or
  Map capability layer with the entry expanded → capability page (with
  "registered by decision" or "forecast by hypothesis" and its consumers).
- **To gate and test results.** Overview "Gates" tile ("7 passed, 1
  failed, 1 running") → Gates list (checkpoint, subject, verdict, cause,
  next, repair round, duration) → gate page (commands with outcome, exit,
  elapsed; scenario summary; guarded changes; rules; audit refs) → output
  tail, and the full output once the protocol serves it.
- **To an issue's evidence.** Overview "Issues" card → Issues list ranked
  → the issue's subject page (gate, iteration, chapter, scenario) at the
  relevant anchor.
- **To a module.** Map module layer node → module page (placement,
  proposal, its capability rows with initial roles and implemented state,
  work items scoped to it, scenarios owned by it, sessions that reached it).

Every page shows a breadcrumb (`Plan › Run › Work item wi-007 ›
Iteration 2`), a "Related" rail listing every linked element by kind, and
a "Where in time" strip: a miniature of the run timeline with this
element's events marked, which opens the Timeline focused on it.

---

## 2. The overview screen

The overview replaces today's Overview tab and becomes the run's landing
page (`#/plans/<p>/runs/<r>`). It is a fixed set of cards, full width,
laid out in a 12-column grid that reflows to one column on a narrow window.
Nothing on it scrolls internally; a card shows counts, bars, at most a few
rows, and a link to its list.

### 2.1 The cards and their encodings

| Card | Question | Encoding | Source (existing unless marked new) |
|---|---|---|---|
| **Header** | now | plan title, run id, state pill, elapsed or duration, "read at version N", Stop | snapshot |
| **Phases** | now, done, left | a stepper: analysis › review › readiness › working › final › ended; the reached phases filled, the current one pulsing blue with its start time, the rest grey. Review shows "skipped" when there was no review stop | snapshot `phase`, events for phase times |
| **Now** (live run) | now | one row per thing happening: the awaited invocation (role chip, session, work item, iteration, "since 2 m 14 s", last transcript entry age), the running gate (checkpoint, subject, "since 6 s"), waits (work item, requirement, reason), the writer holder, a review awaiting a person. When nothing is open: "Idle between steps" | snapshot `current`, `waits`, `writer`; gate-committing without gate-attempted (client-derived until section 7's `current` extension) |
| **Outcome** (finished run) | done, issues | replaces Now: "Completed after 12 work items in 1 h 40 m", or "Failed: repair-exhausted. wi-007's iteration 3 failed its gate three times" with the evidence links, or stopped or interrupted | snapshot `state`, `failure`, `endedAt` |
| **Progress** | done, left | three horizontal stacked bars with the same segment order and colors: Top-level capabilities (completed, working, todo), Scenarios (implemented, declared, bound, pending), Work items (completed, working, yielded, todo). Each segment is a link to the filtered list. The number at the right end is "done of total" | capabilities (`entry: true` only), snapshot `counts.scenarios`, work items |
| **Left to do** | left | a short list, then "and N more": entry capabilities not completed with their scenario fraction; work items queued or yielded with the reason; open requirements. Ends with the run's limits when known: "repair round 1 of 3", "invocations 37 of 400", "run time 1 h 40 m of 8 h" | capabilities, work items, snapshot counts; limits **new** (section 7) |
| **Issues** | issues | four counters by severity (blocking, attention, caution, info) and the five highest-ranked issues, each one line with its severity glyph, kind, subject link and time | client-derived in phase 1; `issues` projection **new** in phase 4 (section 6) |
| **Gates** | done, issues | one stat tile: "9 gates: 8 passed, 1 failed" and the last gate's line; readiness attempts | events in phase 1; `gates` list **new** |
| **Sessions** | now, done | a stat row: live, suspended, finished, interrupted by role chip; degraded starts | run sessions |
| **Entry map** | done, left, now | one tile per entry capability: name, state color, a row of scenario dots (state-colored), a blue pulse when a session is live on it, an issue glyph when one is open on it. Selecting a tile opens the Map with that capability selected | capabilities, scenarios, sessions |
| **Activity strip** | now, done | the whole run as a miniature timeline: phase bands, gate ticks (green or red), session density by role, issue marks, a "now" line on a live run. Dragging a range opens the Timeline on it | events, sessions |
| **Tokens** | done | one tile with the four categories (input, cache read, cache write, output); "not summed, never priced" | metrics `usage-tokens.*` |

The Notices panel disappears as a panel: module creations, removals and
cycles are issues (section 6), with "info" severity for a created module
and "blocking" for an unresolved cycle. The event feed leaves the overview
and becomes the Events list (level 2), reachable from the Activity strip.

### 2.2 Small run, finished (the real one)

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ status-badge-tone › Run 20260923T164537Z-dbf0c2          [completed]  11 m 57 s      │
│ analysis ●━━━ review ○ skipped ━━ readiness ●━━ working ●━━━━━━━━━━ final ●━━ ended ● │
├───────────────────────────────┬──────────────────────────────────────────────────────┤
│ OUTCOME                       │ PROGRESS                                             │
│ Completed after 1 work item.  │ Top-level capabilities ████████████████████  1 / 1   │
│ Final gate ga-0004 passed,    │ Scenarios              ████████████████████  2 / 2   │
│ full mode, 2 scenarios.       │ Work items             ████████████████████  1 / 1   │
│ Commit e99fee0                │                                                      │
├───────────────────────────────┼──────────────────────────────────────────────────────┤
│ LEFT TO DO                    │ ISSUES   blocking 0  attention 0  caution 2  info 0  │
│ Nothing required is left.     │ ▲ caution  Guarding partial (shell unguarded)  inv-0003 │
│ 2 forecasts not required      │ ▲ caution  Reads outside the scope (2)         inv-0003 │
│   (status-badge-tone-render…) │                                             all issues │
├───────────────┬───────────────┼─────────────────────┬────────────────────────────────┤
│ GATES         │ SESSIONS      │ TOKENS              │ ENTRY MAP                      │
│ 4 passed      │ 3 finished    │ in 101 k            │ ┌─────────────────────────┐    │
│ 0 failed      │ ● ● ●         │ cache 836 k         │ │ render-status-badge-tone│    │
│ readiness 1   │ arch loc eng  │ out 18 k            │ │ ●● scenarios  ✓ ga-0003 │    │
│               │               │                     │ └─────────────────────────┘    │
├───────────────┴───────────────┴─────────────────────┴────────────────────────────────┤
│ ACTIVITY  16:45 ─────────────────────────────────────────────────────────── 16:57     │
│ phases   [analysis        ][r][working                        ][f]                    │
│ gates                          ✓                              ✓   ✓  ✓                │
│ sessions ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮                │
│                                                                    open the timeline › │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

A small run is mostly full bars and short lists. The design does not pad
it: an empty Left-to-do card says "Nothing required is left" and lists the
forecasts it excluded, because that is the one thing a reader of the
current Dependencies view gets wrong (two `todo` capabilities on a
completed run).

### 2.3 Large run, live (invented: 40 work items, 62 sessions, 210 invocations)

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ checkout-redesign › Run 20260925T081200Z-4a91c0             [running]  1 h 41 m  ■Stop│
│ analysis ●━━━ review ●━━━ readiness ●━━━ working ◉ since 08:19 ━━━━━ final ○ ── ended ○│
├───────────────────────────────┬──────────────────────────────────────────────────────┤
│ NOW                           │ PROGRESS                                             │
│ ◉ engineer  ses-0058 inv-0203 │ Top-level capabilities ██████████░░░░░░░░░░  4 / 9    │
│   wi-031.i02  since 4 m 10 s  │ Scenarios              ████████████▒▒▒░░░░  22 / 41  │
│   last entry 6 s ago          │ Work items             ██████████████▒░░░░  29 / 40  │
│ ◉ local architect ses-0044    │                        completed working yielded todo │
│   wi-027  since 48 s          ├──────────────────────────────────────────────────────┤
│ ◉ gate ga-0071 iteration      │ ISSUES  blocking 0  attention 2  caution 9  info 3   │
│   wi-029.i01  since 6 s       │ ● attention  Gate ga-0069 failed, repair round 2 of 3│
│ ◌ wi-018 yielded: waits for   │ ● attention  Degraded start: fork made fresh  inv-0188│
│   rq-004 (cart-total)         │ ▲ caution    Context budget reached          inv-0181│
│ ◌ writer held by inv-0203     │ ▲ caution    Guard denied (blocked-scope ×3) inv-0197│
│                               │ ▲ caution    Module created: checkout/pricing  wi-021│
│                               │                                          all 14 issues│
├───────────────┬───────────────┼─────────────────────┬────────────────────────────────┤
│ LEFT TO DO    │ GATES         │ SESSIONS            │ ENTRY MAP (9)                  │
│ 5 entries:    │ 71: 64 passed │ 3 live  ● ● ●       │ ▣ ▣ ▣ ▣  ▤ ▤ ▤  □ □            │
│  place-order  │ 6 failed      │ 11 suspended        │ done 4  working 3  todo 2      │
│   sc 4/7      │ 1 running     │ 48 finished         │ ▣ place-order ●●●●○○○ ◉ ⚠     │
│  apply-coupon │ 1 not verified│ 0 interrupted       │ ▣ apply-coupon ●●○○     ◉      │
│   sc 0/4      │ readiness 1   │ 4 degraded starts   │ ▤ cart-total  ●●●●●            │
│  +3 more      │               │                     │ ...                            │
│ 11 work items │               │                     │                                │
│ 3 open reqs   │               │                     │                                │
│ repair 2 of 3 │               │                     │                                │
│ inv 210 / 400 │               │                     │                                │
├───────────────┴───────────────┴─────────────────────┴────────────────────────────────┤
│ ACTIVITY  08:12 ───────────────────────────────────────────────── 09:53 ┃ now         │
│ phases   [an][rv][r][working                                            ┃              │
│ gates          ✓ ✓✓ ✓✗✓ ✓✓ ✓ ✓✓✗✓ ✓✓✓ ✓ ✓✓ ✓✗✓✓ ✓ ✓✓ ✓ ✓ ✗✓ ✓✓ ✓ ✓✓✗ ▶┃              │
│ sessions ▁▂▃▅▆▇▇▆▅▆▇█▇▆▆▇▇▆▅▅▆▇▇▇▆▅▆▇▇▆▆▅▆▇▇█▇▆▆▇▇▇▆▅▅▆▇▇▇▆▅▆▇▇▆▆▅ ┃  (density) │
│ issues              ▲     ●        ▲  ▲       ▲   ●      ▲    ▲▲   ▲   ┃              │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

At this size the entry map shows tiles in three groups (working first,
then todo, then done), each tile a name, a scenario dot row (dots collapse
to a fraction bar above 12 scenarios) and glyphs for live sessions and
open issues. The activity strip's session band is a density chart (live
invocations per minute, by role) rather than lanes.

### 2.4 Live behaviour

The overview polls the events page every second while the run runs, as
today. Counters and bars animate between values; the "since" and "last
entry" ages tick locally between polls. A lost connection dims the page
and shows the "last read at version N" line, as the current Run page does.
The plan's runs list on the Plan page refreshes on the same interval while
one of its runs runs, which it does not today.

---

## 3. The relational view: the Map

`#/plans/<p>/runs/<r>/map`. One screen, three **layers** of the same
selection, a **detail panel** on the right, and a **context strip** at the
bottom. The two existing diagrams become two of the layers; scenarios and
work are added; selection is shared across the three and lives in the
URL.

### 3.1 Why layers, not one giant graph

Modules form a tree; capabilities form a DAG with cycles; work items form a
list ordered by time; scenarios attach to entries and to integration work
items. Drawing them in one picture produces the hairball the inventory
warns about. Three layers over one selection keep each picture legible and
still make every relation visible: select anything, and the related
elements light up in every layer while the rest dim.

### 3.2 The layers

**Modules** (today's By module, on the toolkit canvas, reused as is).

- One node per placed module, on `ModuleTreeCanvas` from
  `ramify.ts/module-tree`; the web module supplies `renderNodeBody`,
  `color`, `emphasis` and sizes, as it does now. Nothing is copied.
- The node body changes: each capability row shows one **state** color
  (todo grey, working blue, completed green) and its **initial role** as an
  outlined chip, replacing the two-mark scheme. A row shows a scenario
  fraction ("2/2") for entries. The node shell's accent is the strongest
  state among its rows; blue is no longer "has an initial association".
- New per-node marks: a work-item count ("2 wi"), an issue glyph, and the
  session chips that exist today.
- Scale: untouched branches collapse by default (the canvas supports
  collapse and shows "+N"); a "show all modules" toggle expands them.
  Rows above 12 per node collapse to "12 of 30 capabilities, 9 completed"
  with a row filter in the detail panel. The 2,000-row bound and coverage
  line stay.
- Unplaced modules stay listed beside the canvas.

**Capabilities** (today's Dependencies, extended).

- Nodes are capabilities in columns of dependency depth, as today, with the
  same state colors, tentative dashing and cycle groups.
- **Scenarios enter here.** An entry node carries a row of scenario dots
  below its name, one per tracked scenario, colored by state (pending grey
  outline, bound amber outline, declared amber filled, implemented green).
  Above 12 scenarios the row becomes a fraction bar. An **integration
  scenario** is its own node, drawn as a rounded "scenario" shape at the
  left edge of the graph, linked with dashed edges to the entries of its
  sub-scenarios and labelled with its owner (the common ancestor). Its
  state color follows the scenario's state, and its work item, when
  started, is in its detail.
- **Collapsed by default above 30 capabilities**: the graph shows only
  entry capabilities and integration scenarios, with each entry showing
  "depends on 6 (4 completed)". Expanding an entry (a control on the node,
  or the URL `expand=`) reveals its dependency subtree in place. A "show all
  capabilities" toggle gives the full graph with pan and zoom (today's view
  only scrolls; the graph gets the same pan and zoom as the canvas, through
  a plain SVG viewBox, since the toolkit's canvas is a tree canvas).
- Layout stability: positions are kept per capability id for the page's
  lifetime; a new capability is placed without moving the others, and a
  "re-layout" control tidies on request. The inventory notes that today's
  nodes move between polls.
- Node marks: work-item count, evidence count, session chips (existing),
  issue glyph.

**Work** (new).

- One row per work item, ordered by start, grouped by state (working and
  yielded first, then todo, then completed). A row reads: id, state color,
  capability, module, origin badge (entry, delegated, follow-up,
  integration), then its iterations as small boxes (kind letter, outcome
  color) and after each iteration its gate attempts as ticks (green passed,
  red failed, amber not-verified, blue running), then the work-item gate.
  Session chips at the row's end. A yielded row shows what it waits for
  with a link to the provider work item; a `follows` link joins a follow-up
  to the item it follows.
- Above 40 work items the completed group collapses to a count.
- This layer is the "iteration explorer" the future list asks for
  ([inventory-diagrams Part B](inventory-diagrams.md#part-b-planned-or-proposed-views-not-yet-implemented)),
  in its summary form; the work item page is its record form.

### 3.3 Linked selection

The URL carries `sel=<kind>:<id>` where kind is one of `capability`,
`scenario`, `module`, `work-item`, `iteration`, `gate`, `session`. The
web computes the **related set** of the selection from the answers it
already holds, through the work item:

| Selected | Related, and how |
|---|---|
| capability | owner module; scenarios of the entry; its work items; those items' iterations, gates and sessions (invocations with that work item); dependencies and dependents; decisions and hypotheses naming it |
| scenario | its entry capability; its work item; its owner module; the gates that ran it; the declaring invocation's session |
| module | its capability rows; work items scoped to it; scenarios owned by it; sessions that reached it; parent and children |
| work item | its capability; module; scenarios assigned; iterations; gates; sessions; `follows`, `startedFor`, requirements and their provider work items |
| iteration | its work item; its gates; its invocations' sessions; the scope modules |
| gate | its subject work item or iteration; scenarios it ran; the commit |
| session | its reach (work item, capability, module or request) and everything related to that work item; lineage sessions |

In every layer, related elements keep full color and gain a 2 px accent
ring; unrelated elements drop to 35 % opacity. Edges between two related
nodes stay solid; others fade. The detail panel shows the selected element
at level 2 (state, reason, counts) with links by kind to the related
elements, and a "Open page" link to its level-3 page. Selecting a related
element in the panel re-selects, and the browser history records it.

### 3.4 Legend and colors

One legend for the three layers, always visible, collapsible:

- State: todo, working, completed; failed or not-verified (gates only);
  tentative (dashed).
- Scenario dots: pending, bound, declared, implemented.
- Role chips: initial architect, global fork, local architect, engineer,
  contract engineer, in a categorical palette validated for adjacent
  contrast in light and dark mode (the mockup's `--role-*` tokens). A chip
  always carries the role's short label, never color alone.
- Issue glyphs: filled circle for attention or blocking, triangle for
  caution, small dot for info.

### 3.5 Scale

| Size | Modules layer | Capabilities layer | Work layer |
|---|---|---|---|
| tiny (this run) | 15 modules, 3 rows | 3 nodes, 2 scenario dots | 1 row |
| large (40 wi, 500 caps) | untouched branches collapsed; 2,000-row bound stated | entries only (9 nodes plus integration scenarios), expand per entry | working and yielded rows open; 29 completed collapsed to a count |

The bounded answers' "showing N of total" lines stay at the top of each
layer.

---

## 4. The chronological view: the Timeline

`#/plans/<p>/runs/<r>/timeline`. A time axis, lanes in groups, event and
issue markers, a live "now" line, and the same selection and detail panel
as the Map.

### 4.1 Axis

- **Real time**, not event order. Today's session timeline steps one
  column per changed event, which hides that the initial analysis took
  three minutes and a gate eight seconds.
- **Idle compression, on by default.** A stretch longer than two minutes
  in which no invocation is awaited and no gate runs (typically a review
  wait, or a harness gap) is folded to a fixed-width break drawn with a
  wavy cut and labelled with its duration. A toggle shows uncompressed
  time. This keeps a 12-minute run and an 8-hour run on one screen.
- An **overview brush** across the top shows the whole run; the main area
  shows the brushed window. The window is in the URL (`from=<seq>&to=<seq>`
  as event sequences, which are stable, and mapped to time client-side).
  Mouse wheel zooms, drag pans, and the brush handles set the window.

### 4.2 Lanes

Lanes come in four groups, each collapsible, in this order:

1. **Run.** One lane of phase bands (analysis, review, readiness, working,
   final, ended), and a second lane of gate attempts: each attempt a short
   block from `gate-committing` to `gate-attempted` (readiness: a block
   ending at `readiness-passed`, starting at the analysis acceptance or the
   approval until section 7's start event exists, drawn with a dotted left
   edge to say the start is inferred), colored by verdict, labelled with
   its id and checkpoint; a running gate is blue with an open right edge.
   Repair rounds stack as consecutive blocks.
2. **Work items.** One lane per work item, from `work-item-started` to
   `work-item-completed`, showing iterations as segments (assigned to
   closed) colored by outcome, yielded stretches hatched, and gate ticks
   under the iteration they judged. Order: by start. Completed lanes
   collapse to a single "29 completed" band on large runs, expandable.
3. **Sessions by role.** A group per role in a fixed order (initial
   architect, global forks, local architects, engineers, contract
   engineers). Inside a group, one lane per session, as today: invocation
   segments (chapter links), suspension dashes, brief-append diamonds, and
   fork, replace and request links drawn between lanes. Above 12 sessions in
   a group the group collapses to a **density lane**: a bar chart of live
   invocations per time bucket in the role's color; expanding it reveals the
   lanes. The lane label shows the session id, its role chip and its work
   item, which today's timeline omits.
4. **Scenarios** (collapsed by default). One lane per entry capability with
   its scenarios' state changes as ticks (declared, due, implemented,
   withdrawn); an integration scenario has its own lane.

### 4.3 Markers

- **Events** appear as ticks on the lane of the element they reference;
  events with no element (job started, analysis accepted, materialization)
  go on the Run lane. Hovering shows the summary sentence; selecting opens
  the Events list at that sequence.
- **Issues** appear as glyphs (section 6) on the lane of their subject and
  are repeated on a thin "issues" lane at the top of the window, so a
  collapsed group never hides one. Selecting an issue opens its evidence.
- **The now line** on a live run is a blue vertical rule at the right edge
  with "now" and the age of the last event; the window follows it unless
  the reader has panned away, in which case a "follow" control appears, as
  the transcript page's "new entries" control does today.
- **Selection** on the Timeline highlights the same related set as on the
  Map: the selected work item's lane, its sessions' segments, its gates'
  blocks; the rest dim.

### 4.4 Relational and chronological together: switch, with a context strip

Recommendation: **two views switched by tabs, sharing the selection, the
detail panel and the legend, each carrying a thin strip of the other.**

- The Map shows a **context strip** at the bottom: the miniature timeline of
  the run with the selected element's events marked; clicking it opens the
  Timeline at that window with the same selection.
- The Timeline shows a **context strip** of the selected element's related
  chips (capability, module, scenarios, work item, sessions); clicking one
  re-selects and stays on the Timeline; a "map" control opens the Map on it.

Why not side by side: both views need the full width to scale. The
capability graph already truncates titles at 232 px per node on a full
1,400 px width, and a session timeline with dozens of lanes needs every
pixel of horizontal room for real durations. Halving each defeats the
"visual first" goal at exactly the size where it matters most. Side by
side also doubles the polling and layout cost on every version tick. The
shared selection in the URL makes the switch cheap: the reader never loses
the element when changing dimension, and the context strip means the other
dimension is never absent. On windows at or above 1,800 px the two views may
sit side by side through a "split" toggle; that is an enhancement, not the
default.

---

## 5. Drill-down pages, panels and URLs

### 5.1 The detail panel (level 2, in Map and Timeline)

A 360 px panel on the right, present whenever `sel=` is set. It shows the
selected element's kind and id, state with the harness's reason, a few
counts, its issues, then "Related" grouped by kind, each a link that
re-selects, and "Open page" to the level-3 page. It is the same component
on both views. On a narrow window it becomes a bottom sheet.

### 5.2 Level-3 pages

Each page has the breadcrumb, the "Related" rail (right), the "Where in
time" strip (a miniature timeline focused on the element; opens the
Timeline) and a body of records. Every id in the body is a link.

| Page | Body | Onward links | Back |
|---|---|---|---|
| **Work item** `/work/<wi>` | goal, origin, state and reason, module, capability, `follows` and `startedFor`; outline revisions with stages; iterations as sections (`#iterations/<n>`): kind, stage, goal, scope with modules and extra paths, result with findings and recommendation, gates as rows, invocations as rows with role and ended; work-item gates; requirements with verified state and provider; placement requests with their decisions | gate page, chapter, capability, module, scenario list filtered by work item, decision, provider work item | Work list, Map selected |
| **Gate** `/gates/<ga>` | checkpoint, subject (work item, iteration, or run), verdict, cause, next, repair round, infrastructure attempt, commit and audited commit, audit refs; guarded changes with authorization; rules and violations; commands as sections: kind, outcome, not-verified reason, exit, elapsed, argv and cwd, selection, scenario summary with per-scenario rows (each a link), output tail with ANSI rendered; "full output" link when served | work item, iteration, scenario, commit (id only), previous and next attempt of the same subject | Gates list |
| **Scenario** `/scenarios/<sc>` | name, kind, state and its history (from events: declared by, due, implemented by, withdrawn with reason), origin (plan lines or architect refs), entry, integration and sub-scenarios, work item, owner and file, frozen Gherkin, warnings; gate results as rows | entry capability, work item, gate page at the scenarios command, declaring chapter, sibling scenarios | Scenarios list |
| **Capability** `/capabilities/<slug>` | state and reason, entry or lower-level, tentative or registered (by decision, with origin) or retired (once published), owner and previous owner, depends on and depended on by (each a link), scenarios with states, work items, evidence gates, hypotheses and decisions naming it, sessions reaching it | module, scenario, work item, gate, decision, hypothesis, Map selected | Capabilities list, Map |
| **Module** `/modules/<path>` | placement (declared, proposed with parent, purpose and tags, created or removed with notice), parent and children, capability rows (initial roles, state, implemented reason and evidence), work items scoped to it, scenarios it owns, sessions that reached it | capability, work item, scenario, session, notice as issue | Map modules layer |
| **Session** `/sessions/<ses>` (existing page) | unchanged, plus: `work.workItem`, `iteration`, `request` and `reaches` become links; a chapter's evaluation links guard denials and outside-scope paths to the Issues list; the plan link is added; the transcript gets a chapter table of contents and an entry-type filter (errors and harness decisions only) | work item, capability, module, gate (post-write check) | Sessions list, Timeline selected |
| **Decision or hypothesis** `/decisions/<id>`, `/hypotheses/<id>` | today's cards as pages; hypothesis `dependsOn`, `anticipatedConsumers` and `confirmedBy` shown | capability, work item, module, request, superseding decision | Decisions list |
| **Issue** `/issues/<n>` | severity, kind, subject, summary, time, resolved state, evidence links; the whole list at `/issues?severity=&kind=` | its subject page at the right anchor | Overview |

### 5.3 Level-2 lists

`/work`, `/scenarios`, `/gates`, `/sessions`, `/capabilities`,
`/modules`, `/decisions`, `/issues`, `/events`, `/measurements`,
`/analysis` (today's Plan and entries with the review and Approve). Each
list has the state-count line as filter chips (the URL carries `state=`),
sortable columns, and a fixed set of columns that never wrap mid-word (the
page is full width; ids and paths get `overflow-wrap: anywhere` only on
their own cells). Bounded answers show "showing N of total" and a note
when the total exceeds the bound.

### 5.4 URL scheme

Hash routing stays, since the harness serves a static bundle with no
server-side routing. Grammar, under `#/plans/<p>/runs/<r>`:

```text
                                  the overview
/map[?layer=modules|capabilities|work][&sel=<kind>:<id>][&expand=<slug>,…][&all=1]
/timeline[?from=<seq>&to=<seq>][&sel=<kind>:<id>][&groups=run,work,sessions,scenarios][&raw=1]
/work[?state=…]               /work/<wi>[#iterations/<n>]
/gates[?verdict=…]            /gates/<ga>[#commands/<n>]
/scenarios[?state=…]          /scenarios/<sc>
/capabilities[?state=…]       /capabilities/<slug>
/modules                      /modules/<url-encoded path>
/sessions                     /sessions/<ses>[/chapters/<inv>|/points/<inv>|/appends/<seq>]   (existing)
/decisions                    /decisions/<id>      /hypotheses/<id>
/issues[?severity=&kind=]     /issues/<n>
/events[?after=<seq>&kind=<transition>&ref=<kind>:<id>]
/measurements                 /analysis
```

`sel=` and `state=` are query parameters within the fragment; the router
parses `#/path?query`. Existing routes stay valid: the bare run route opens
the overview, and session routes are unchanged. `#/sessions` and
`#/sessions/standalone/<ses>` stay as they are. Deep links from outside
(a terminal, a commit message) may use any of these.

---

## 6. Issues

### 6.1 Severity and groups

Every recorded problem ([inventory-model §4](inventory-model.md#4-issues-every-problem-or-warning-the-model-records))
receives one **severity** and one **group**. Severity decides the glyph
and the rank; the group decides the filter and the lane.

| Severity | Meaning | Glyph and color | Kinds |
|---|---|---|---|
| **blocking** | the run ended or will end badly | filled circle, red | run failed (15 reasons); interrupted; stopped with an unsettled writer; repair exhausted; dependency cycle unresolved; acceptance incomplete; limit exceeded; inputs changed; readiness exhausted |
| **attention** | work is being redone, delayed or degraded; a person may want to look | filled circle, amber | gate failed with repair or retry pending; gate not verified; iteration partial, unsuitable or superseded; completion refused; scenario withdrawn; scenario failing, undefined or ambiguous in a check; degraded start; session lost or replaced; fork returned partial; context budget reached; provider cannot conform; evidence reopened; readiness step failed then recovered; dependency cycle detected and resolved; view refresh unavailable; write outside scope (unguarded shell) |
| **caution** | recorded, worth knowing, no action implied | triangle, amber outline | guard denied (blocked-scope, blocked-unresolved); read excursion; post-write check findings or not checked; coverage gap; compaction; executor retries; analysis scenario warnings; plan block that does not parse; guarding partial; coverage partial or unavailable; unplaced module; bounded answer truncated |
| **info** | a structural fact the reader should notice | small dot, grey | module created; module removed; analysis approved during the run; stop requested |

Groups: **Run** (outcome, limits, readiness), **Verification** (gates,
scenarios, checks), **Work** (iterations, completion, delegation, cycles),
**Sessions** (starts, losses, budget, compaction, retries, interruptions),
**Scope and guarding** (denials, excursions, outside-scope writes, hook
findings, coverage), **Architecture** (modules created, removed, unplaced,
coverage), **Analysis** (warnings, limitations).

### 6.2 Ranking

Order: severity first; then unresolved before resolved (a resolved cycle,
a repaired gate whose later attempt passed, a recovered readiness step);
then most recent first on a live run and by subject on a finished one. The
overview shows the top five; the list shows all; a badge on every element
shows its highest open severity.

### 6.3 Where issues surface

| Level | Form |
|---|---|
| Overview | four counters, top five, link to the list |
| Map | glyph on the node, row or tile; the detail panel lists the element's issues |
| Timeline | glyph on the subject's lane and on the issues lane |
| Lists | a severity column, filter chips |
| Record pages | an "Issues" section with each issue and its evidence anchor |
| Transcript | the existing entries (guard denied, budget reached, retries, compaction, ended with error) gain a glyph in the margin and are the evidence anchors |

### 6.4 Source

Phase 1 derives issues in the client from what is published: the snapshot
(failure, notices, writer, stop), events (gate-attempted verdicts, degraded
starts, fork partial, withdrawals, readiness failures, cycles, evidence
reopened), gate views (not-verified, guarded changes, rules), scenarios
(statuses), work items (iteration outcomes), sessions (evaluations: guard
verdicts, excursions, hook checks, gaps, outside-scope, budget ended,
interruption) and the module comparison (coverage, unplaced). That is
presentation over published facts; no issue states something the harness
did not publish. Phase 4 moves the list into the harness as an `issues`
projection (section 7), so the severity and resolution of an issue are
published facts and the same for every client, and so the list can be
paged and filtered on the server for large runs.

---

## 7. Protocol changes versus presentation

### 7.1 Purely presentation (no protocol change)

The overview's header, phases, Outcome, Progress bars, Sessions and
Tokens tiles, the entry map, the activity strip, the whole Map (all three
layers, linked selection, scenario dots and integration scenario nodes),
the Timeline's lanes and axis, every level-3 page, the URL scheme, the
issue derivation of phase 1, ANSI rendering of output tails, and the
layout repairs (full width, no mid-word wrapping, no nested scroll boxes).
All of it is computed from existing answers, most already fetched by the
Run page today.

### 7.2 Protocol changes, each a projection of the run log or of a record

Ordered by value to the dashboard. Every one is read-only and derived; none
stores state or changes the log except item 6.

1. **Run limits and configuration.** Add to the snapshot (or a
   `GET …/runs/:runId/policy` answer) the `policy.limits` of `job.json`:
   repair rounds, infrastructure retries, iterations per work item, work
   items, invocations, run bound, and each role's context budget; also
   `reviewStop` and `manifest.source.commit`. Needed by Left-to-do
   ("repair round 2 of 3", "invocations 210 of 400"). A projection of the
   run record.
2. **Gate list.** `GET …/runs/:runId/gates`: every attempt with id,
   checkpoint, subject, verdict, cause, next, repair round, infrastructure
   attempt, commit, `committing` and `attempted` moments, scenario counts
   (passed, failed, undefined) and command outcomes by kind; plus every
   readiness attempt, failed ones included, with its failed step and
   recovery. Needed by the Gates card, the Gates list, and the Timeline's
   gate lane on large runs (today the list is rebuilt from the whole event
   log, and failed readiness attempts are absent).
3. **`current` covers every activity.** Extend the snapshot's `current`
   (or add `activities[]`) with a running gate (id, checkpoint, subject,
   since), a readiness attempt in progress, a materialization or withdrawal
   in progress, and a view refresh in progress, each with its start moment.
   All are derivable from the log's intent events except readiness (item
   6). Needed by the Now card; without it the client infers a running gate
   from an unmatched `gate-committing`, which is fragile.
4. **Typed events with filters.** Make `transition` a published enum of
   the 49 types, and add `?kind=` and `?ref=<kind>:<id>` to the events
   query. Needed by the Timeline and the "Where in time" strips on large
   runs, where the client should not page through thousands of events to
   find a work item's ten. Also expose the structured `data` fields the
   summaries currently swallow (`readiness-failed.step`,
   `fork-returned-partial.retry`, `dependency-cycle-detected.detection`,
   the review note).
5. **Moments on summaries.** Add `started`, `completed` (work items),
   `assigned`, `closed` (iterations), `declared`, `implemented`,
   `withdrawn` (scenarios) as `{sequence, at}` to the list answers. Cheap
   projections; they remove the client's event joins for the Timeline and
   scenario histories.
6. **A start event for non-committing gates.** Record `gate-starting
   {gate, checkpoint}` before a readiness attempt (and any future
   non-committing checkpoint), so readiness has a duration and a "running
   since". This is the one change to the log. Until then the Timeline draws
   readiness with an inferred start and a dotted left edge.
7. **Issues projection.** `GET …/runs/:runId/issues?severity=&kind=&after=`:
   `{n, kind, severity, group, at, sequence, subject refs, summary,
   resolved: {at, by} | null, evidence refs}`. A projection of the log,
   gate records and evaluations, the same derivation as phase 1's client
   rule but published. Needed for parity across clients and for paging.
8. **Retired forecasts.** Per the
   [capability registry analysis](../2026-09-23-capability-registry-analysis.md#for-the-progress-projection-now):
   in a completed run, a forecast outside the required set carries
   `retired: {reason}` beside `tentative`, and every capability carries
   `required: boolean` (entries and confirmed dependencies of required
   work). Needed so Left-to-do and the entry map never overstate remaining
   work. Until then the dashboard's "left" uses only `entry: true`
   capabilities, work items and scenarios, all published facts, and lists
   forecasts separately.
9. **Full gate output.** `GET …/runs/:runId/gates/:gate/output/:command`
   serving the complete log with a byte range, since `output.path` cannot
   be fetched. Level 4 only.
10. **Plans list with the latest run.** Each plan entry carries its runs'
    count and the latest run's id, state and phase. Needed so the Plans
    page shows which plan is running or failed without opening each.
11. **Per-invocation elapsed and scope size** in the sessions answer
    (`elapsedMs`, `scope.size`) for the Timeline's tooltips and a future
    scope-per-line view. Minor.

### 7.3 Not recorded, and how the design copes

| Not recorded | Design |
|---|---|
| Per-test results of Vitest | The gate page shows the `tests` command's exit code, elapsed and output tail, labelled "per-test results are not recorded; only the exit code is read". No test count appears anywhere, so no false precision. Cucumber results are per scenario and shown fully |
| A retired or not-needed state for forecasts and reuse registrations | Item 8 above; meanwhile forecasts are shown as forecasts and never counted as left |
| Cost totals | Not shown; the Tokens tile says "never priced". Per-message cost stays in the transcript, rounded |
| Commit diffs, messages, branch | Commit ids are shown as ids with a copy control; the gate page says "the diff is not recorded" |
| Progress of a plan across runs | The Plan page lists runs with their outcome; no cross-run progress is computed |
| A heartbeat while a model is thinking | The Now card shows "last transcript entry N s ago" from the polled transcript and turns the age amber after 60 s and red after the idle timeout when known (item 1); it never claims the agent is stuck |
| Scheduler queue order | Left-to-do lists queued work items "in start order; the queue order is not recorded" |
| Gate start for readiness | Item 6; inferred start with a dotted edge meanwhile |
| Live context fill | Not shown live; the transcript's budget-reached and compaction entries and the evaluation's usage are the evidence |
| Composition-failure diagnostics | Not shown; the integration scenario's failing check is |

---

## 8. Phased delivery and open questions

### 8.1 Phases

Each phase is shippable on its own and audited on its own.

**Phase 0: addresses and links** (presentation only, small). The URL
grammar of section 5.4 with the existing tabs mapped to list routes;
every id in every existing area becomes a link to its page or list; the
Plan page refreshes while a run runs; the layout repairs (full width,
column widths, ANSI, no nested scroll). This unlocks every later phase and
already answers "the relations are IDs in text".

**Phase 1: the overview** (presentation, plus items 1 and 2 of section
7.2 if cheap). The landing page of section 2 with all cards; client-derived
issues; the activity strip drawn from events and sessions; the entry map.
The old Overview panels move to their lists. Acceptance: on the real run,
the four questions are answered on one screen without a click; on a
scripted large fixture (40 work items, 60 sessions) the page renders in the
same layout and stays under the existing poll budget.

**Phase 2: the Map** (presentation). The three layers over one selection,
scenario dots and integration scenario nodes, the detail panel, the
collapsed entry mode, layout stability, pan and zoom on the capability
layer, the context strip. The toolkit canvas is reused unchanged; if a
needed affordance is missing (for example a per-node badge slot), it is
requested from the toolkit as a package change, never copied.

**Phase 3: the Timeline** (presentation, plus items 4 and 5). Real-time
axis, idle compression, brush, four lane groups with collapse and density
lanes, markers, now line, the context strip and the "Where in time" strips
on record pages.

**Phase 4: harness projections** (items 3, 6, 7, 8, 10). `current` for
every activity, the readiness start event, the issues projection replacing
the client rule, retired forecasts and the required flag, the plans list
with the latest run. Level-3 pages adopt them.

**Phase 5: depth** (items 9 and 11, and the measurements). Full gate
outputs, tokens per work item and role as small multiples on the
Measurements page (never a dual axis), the split toggle on wide windows,
the transcript's chapter table of contents and entry filter.

### 8.2 Open questions for Dan

1. **Does the overview replace the Overview tab, or sit beside it?**
   Recommended: replace it. Its panels survive as the Issues, Events and
   Analysis lists; keeping both would leave two landing pages.
2. **Switch or side by side for Map and Timeline?** Recommended: switch,
   with the context strips and shared selection (section 4.4); a split
   toggle above 1,800 px in phase 5.
3. **Should retired forecasts appear in a completed run?** Recommended:
   yes, in a separate "Forecasts" group on the capability layer and the
   capability list, drawn dashed and grey with the harness's reason, and
   never counted in progress or left-to-do; a toggle hides them.
4. **Issues: client rule first, then a harness projection?** Recommended:
   yes, phase 1 client, phase 4 harness. The client rule is presentation
   over published facts; the projection makes the severity a published
   fact and allows paging.
5. **May the log gain `gate-starting` for readiness?** Recommended: yes,
   in phase 4. It is one intent event with no record body and closes the
   only gap in gate durations.
6. **Time axis: idle compression on by default?** Recommended: yes, with
   the raw toggle in the URL, so a review wait of two hours does not
   flatten a run into a line.
7. **Session lanes: per session or per role by default?** Recommended:
   per session up to 12 sessions in a role group, a density lane beyond.
8. **Tokens on the overview?** Recommended: one tile with the four
   categories and nothing else; every other measure stays on Measurements.
9. **Should "left to do" show the run's limits?** Recommended: yes, once
   item 1 publishes them; a limit is the only honest denominator the model
   has, since the queue grows.
10. **Which fixture proves the large end?** Recommended: a scripted-agent
    run of a synthetic plan with 9 entries and 40 work items, recorded once
    and kept as a served fixture for the web tests and the mockup's
    "large run"; the real pi run stays the small end.
