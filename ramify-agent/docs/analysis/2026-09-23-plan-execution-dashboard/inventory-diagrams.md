# Inventory: existing diagrams, planned views and measurements (input for a plan execution dashboard)

Date: 2026-09-23. Scope: ramify-agent at `/ramify/ramify-agent` (branch `ramify-agent`, HEAD `7d6af7f`).
Path prefixes: `W/` = `subs/web/src/`, `H/` = `subs/harness/src/`, `P/` = `subs/harness/src/interfaces/protocol/`,
`D/` = `docs/`, `T/` = toolkit `/ramify/subs/presentation/subs/`. `docs/.superseded/` was not read.

---

## Part A. The existing diagrams

### A.0 Where they live

The Run page (`W/run-page.tsx:26-36`) has nine tab areas: Overview, Plan and entries, Hypotheses and decisions, Work items,
Scenarios, Checks, Progress, Sessions, Measurements. Only **Progress** and **Sessions** hold diagrams. Everything else is a
list, a table or a set of cards.

- **Progress** has two sub-tabs, "By module" (the default) and "Dependencies" (`W/run-page.tsx:591-629`). Only the
  selected sub-tab is mounted (`:597-601`).
- **Sessions** is the session timeline (`W/run-page.tsx:670-681`).
- Every area re-queries when the run's `version` moves, through `useRunQuery(key, version, …)`
  (`W/run-page.tsx:615, 637, 652, 671`). The Run page polls, so the diagrams are one poll behind the run at most. There
  is no push.

### A.1 Progress → By module (`W/capability-module-tree.tsx`, drawn on toolkit `ramify.ts/module-tree`)

**Data.** `GET /api/v1/plans/:planId/runs/:runId/module-capabilities` (`P/paths.ts:28`) returns
`ModuleCapabilityComparisonResponse` (`P/runs.ts:788-849`). It holds:

- `identityPolicy`, which is always `exact-capability-slug/1`, with no fuzzy matching (`P/runs.ts:704`);
- `runVersion`;
- `initialView`, the architect-view identity of revision 1;
- `tree`, the current module tree;
- `modules[]`: `{module, placement: declared|proposed|unplaced, proposedAtStart, capabilities: ModuleCapabilityRow[]}`
  (`P/runs.ts:748-755`);
- `coverage`, one of `complete | partial | unavailable` (`P/runs.ts:763-775`).

A row is `{capability, initial: [{role: entry-owner|suggested-owner|involved, hypothesis}], implementedHere: {reason, evidence}|null}`
(`P/runs.ts:738-745`). The run's sessions are also fetched, through `getRunSessions`, to draw marks
(`W/run-page.tsx:615-616`).

**Nodes and edges.**

- Nodes are modules. The harness decides where each module is drawn, and the view only maps the answer
  (`W/capability-module-tree.tsx:105-134`):
  - a declared module sits under its current parent;
  - a proposed module sits under its recorded parent;
  - an `unplaced` module is not drawn. It is listed beside the canvas with its rows (`:399-414`).
- Edges are only parent→child containment, drawn as elbow edges (`T/project-view/src/ModuleTreeCanvas.tsx:206-211`).
  There are no dependency or import edges.
- Parentless nodes share a synthetic "Project" root (`ModuleTreeCanvas.tsx:139-144`).

**Encodings.**

- *Node shell accent* (the left border and the minimap colour, `W/capability-module-tree.tsx:129`):
  - green `#2f7d4f` when any row is Implemented;
  - blue `#2f5fa7` when the node has rows but none is Implemented;
  - grey `#94a3b8` when it has no rows.
  - Note that blue here means "has an initial association". In Dependencies, blue means `working`. The two views use
    the same colour for different meanings.
- *Emphasis* (`:100-103`; CSS at `T/project-view/src/module-tree-canvas.css`):
  - `provisional` gives a dashed shell, for a module proposed at start that is absent from the tree;
  - `muted` gives 0.55 opacity and no shadow, for a module with no capability rows;
  - otherwise `normal`.
- *Rows*: each capability row is a button 36 px tall (`:41, 136-160`). It shows the literal capability id and two
  independent marks:
  - **Initial: <role>**, outlined blue (`W/styles.css:242`);
  - **Implemented**, filled green (`W/styles.css:243`).
  - A capability whose placement changed shows Initial in one module and Implemented in another. No "mismatch" status
    is derived (`D/plans/03-…/initial-hypothesis-vs-implemented-module-tree.proposal.md:57-65`).
- *"proposed at start"* is a warn-coloured label in the node (`:189`).
- *Size*: node height is chrome, plus header, plus one row per capability (`nodeHeight`, `:74-80`). Node width comes
  from the character count of the longest id or mark, plus the session marks (`:82-98`). Rows are never truncated or
  hidden behind `+N`, by contract (`proposal.md:570-576`).
- *Header facts* (`:359-375`): initial-view identity, current tree revision and input, run version, identity policy,
  a coverage line and a legend.

**States shown.**

- Per row: Initial (with its role), Implemented, or both.
- Per module: declared, proposed (dashed) or unplaced (listed), and muted when it has no rows.
- By design it does **not** distinguish `todo` from `working`. It does not show iteration activity, commits, changed
  paths or line counts (`proposal.md:73-75`).
- Coverage has three forms (`:206-225`):
  - complete: "N of M capabilities implemented";
  - partial: known subtotals plus a list of gaps, and never a ratio or a percentage;
  - unavailable: an alert, and no canvas.

**Selection.** Selection state is lifted to the Run page, so it survives a switch between tabs (`W/run-page.tsx:65`).

- Selecting a **row** shows `RowDetail` (`:233-262`):
  - each Initial association, with its hypothesis id or "entry assignment";
  - the Implemented reason and its evidence ids;
  - the sessions whose reach names that capability.
- Selecting a **module shell** shows `ModuleDetail` (`:270-299`):
  - its placement;
  - the proposal's parent, purpose and tags;
  - its capability list, each entry linking to its row;
  - its sessions.
- A pane click clears the selection.

**Layout and limits.**

- *Layout*: the toolkit's `placeTree`, a compact top-down tidy tree. It computes subtree spans, centres parents over
  their children, and aligns each depth to its tallest node (`T/layout/src/tree-placement.ts:11-40`), with
  `gapX 24, gapY 56, padding 24` (`T/project-view/src/module-tree.ts:173`).
- *Canvas*: React Flow (`@xyflow/react`) with pan, zoom (min 0.1, max 1.2 on fit), a dotted background, controls and a
  minimap (`ModuleTreeCanvas.tsx:330-360`).
  - The minimap is hidden below a canvas width of 480 px (`module-tree-canvas.css`, Plan 8 KI-10).
  - Collapse controls show `+N` hidden descendants (`:191-201`).
  - Keyboard: Enter selects, ArrowLeft and ArrowRight collapse and expand, and focus pans the canvas into view
    (`:147-158, 308-318`).
- *Bounds* (`P/runs.ts:158-171`): 500 capabilities and 2,000 module-capability rows. A capability is kept or dropped
  whole. A drop makes coverage `partial` with `totalCapabilities` set. Capabilities first discovered during the run
  come last in order, so they are dropped first, and `knownImplemented` is then a lower bound
  (`proposal.md:515-528`). The coverage invariants are enforced in the schema refinement (`P/runs.ts:795-848`).
- *Layout budget*: 500 nodes with heights from 64 to 2,000 px, within twice the MT07 median (`proposal.md:394-399`).

**Known defects and limitations.**

- **Fitted zoom too small (KI-8).** It was fixed in Plan 8: the fitted zoom is 0.4066 at 1440×1000
  (`D/plans/08-baseline-repairs/results.md:24`). The narrow width (390 px) still fits at 0.1398 (`results.md:24`), and
  rows are readable there only after zooming.
- **Focus into view (KI-9).** Fixed. Browser evidence exists, but only from a recorded Chromium MCP session. It is not
  a repeatable test command (`results.md:22, 322-331`).
- **Space pan-key coupling (KI-11).** Fixed, with unit-test evidence only (`results.md:272-278`).
- **The `unplaced` list** was never exercised in a browser, only at component level
  (`D/plans/03-…/capability-progress-results/iteration6-results.md:381-383`).
- **No committed Playwright script.** All browser evidence for both diagrams is MCP-driven and not repeatable
  (`iteration6-results.md:384-386`; Plan 8 `results.md:322-331`).
- **Deliberately deferred** (`proposal.md:910-919`):
  - a durable forecast-to-registry identity beyond the exact slug;
  - deployment observation;
  - effort-weighted progress or time remaining;
  - source-change attribution by module;
  - exporting the toolkit's `ModuleTreeView` and `ProjectExplorerView`.
- **Review decisions still open** in the proposal (`proposal.md:900-908`):
  - `unavailable` versus `partial` for an unavailable tree;
  - the 2,000-row bound versus a per-module bound;
  - whether the plan takes its own number.
- **Session-mark gaps.** A global-fork session reaches a `request`, which has a capability but no module, so By module
  draws it on the run-level strip rather than on a module (`W/session-marks.tsx:142-145`; Plan 9 `results.md:181-183`).

### A.2 Progress → Dependencies (`W/capability-graph.tsx`)

**Data.** `GET …/runs/:runId/capabilities` (`P/paths.ts:26`) returns `{capabilities: CapabilityProgress[] (max 500), total}`
(`P/runs.ts:690-694`). A `CapabilityProgress` holds:

- `capability`, `owner`, `entry`, `tentative`;
- `state`, one of `todo | working | completed`;
- `reason`;
- `dependsOn: [{capability, tentative}]`;
- `workItems[]`, `evidence[]`;
- `scenarios: {implemented, total} | null`, for entries only (`P/runs.ts:672-687`).

It is derived in `H/projections/progress.ts`:

- `completed` needs every work item closed by a passing work-item gate, and every consumed requirement verified at its
  current contract revision (`progress.ts:12-16, 151-175`).
- `evidence` is the list of **gate ids**: work-item gates, conformance gates and verification gates
  (`progress.ts:152-166`).
- A superseded hypothesis leaves the list. A live one stays as a tentative `todo` (`progress.ts:19-21, 130-140`).
- There is no `failed` state, by design (`proposal.md:95-101`).

**Nodes and edges.**

- Nodes are capabilities, each drawn once, including shared ones.
- Edges are consumer → dependency arrows, with a cubic Bézier path (`capability-graph.tsx:272-284`).
- A dependency target that is absent from the response gets no node. It is listed as "unavailable" in a coverage box
  (`:314-331`).

**Encodings** (CSS at `W/styles.css:285-323`).

- *Node left border*: grey `#8a949f` for todo, accent blue for working, green for completed (`styles.css:313-315`).
  Each node also carries a text badge `state-<state>` (`capability-graph.tsx:428`).
- *Tentative (forecast only)*: a dashed warn-coloured border on three sides, a cream background, a "forecast only"
  badge, and the owner labelled "suggested owner" instead of "current owner" (`:80-81, 418, 430`;
  `styles.css:316`).
- *Entry*: an "entry" badge, and in the legend a thicker accent left border (`styles.css:286`).
- *Edges*: confirmed edges are solid slate. Tentative edges are dashed warn-coloured with a warn arrowhead
  (`styles.css:301-304`). When one pair holds both, the confirmed observation wins (`:246-258`).
- *Cycle*: a strongly connected component is one group in one column. It has a dashed red outlined rect, the label
  "Dependency cycle: no order among these", and internal edges that loop out to the right (`:209-241, 276-280, 390, 406-410`).
- *Node face*:
  - id, truncated with an ellipsis (`styles.css:317`);
  - owner label and owner path, wrapped at `/`;
  - badges;
  - "N work items · M evidence";
  - an optional session-marks line (`:424-433`).
- *Node size*: a fixed width of 232 px. The height is 142 px plus 18 px per extra owner line, plus 24 px when sessions
  are marked (`:17-31, 83-97`).
- *Header*: state counts (todo, working, completed) of the **returned** set (`:307-311, 353-362`). There is a legend and
  "Depth N" column labels.

**Selection.** Selection is local component state (`:303`), so it is lost on a sub-tab switch. There is no
cross-selection with By module. The `CapabilityDetail` panel (`:469-531`) shows:

- the reason and the owner;
- depends on, with tentative or not-in-response flags;
- depended on by;
- work items, each a button that opens the Work items tab on that item (`W/run-page.tsx:95`);
- verification evidence, as **plain gate-id text** with no link to Checks (`:523`);
- **Acceptance scenarios: "N of M implemented"**, for entries only (`:524-526`);
- the sessions reaching the capability.

Edges are not selectable. A text "Dependency list" in a `<details>` element repeats the edges and cycles (`:443-464`).

**Layout and limits.**

- *Layout*: deterministic per response (`layoutCapabilityGraph`, `:116-270`).
  - Tarjan SCC is computed in response order.
  - The condensation is ranked by longest path, so each column is the dependency depth from a capability nothing
    depends on. Consumers sit left of their dependencies, and links may skip columns.
  - Rows are stacked per column in first-response order.
  - Absolutely positioned buttons sit over an SVG edge layer, inside a scroll box with `max-height: 42rem`
    (`styles.css:289-292`).
  - There is **no zoom, minimap or collapse**, only scroll.
- *Bound*: 500 capabilities. When more exist it says "Showing N / total", and every count is of the returned set
  (`:312-321`).
- *Layout stability*: the architecture asks to "keep unrelated positions stable where possible as the graph evolves"
  (`D/architecture/autonomous-implementation-loop.md:1143-1145`). The implementation lays out each response afresh, so a
  new capability can shift columns and rows. There is no cross-version stability.
- *Architecture gap*: the architecture asks that "node and edge details expose the linked work, outstanding consumer
  requirements and evidence" (`autonomous-implementation-loop.md:1145-1146`). Edges have no details, and outstanding
  requirements are shown only on the work-item detail (`W/run-page.tsx:493-497`), not in the capability detail.
- *Performance*: Plan 9 notes that "the first read of the sessions lays the capability graph out twice", because the
  layout depends on whether marks are present (`D/plans/09-…/results.md:426-427`; `capability-graph.tsx:293`).

### A.3 Module tree (`W/module-tree.tsx`): not rendered anywhere

- `ModuleTree({tree, touched})` draws the project module tree as nested `<ul>`s (`W/module-tree.tsx:41-100`). It shows:
  - touched modules with weight badges: `heavy` (red tint), `light` (blue tint) or `exposure only` (grey)
    (`:8, 24-28`; `W/styles.css:120-122`);
  - a "why" line for each touched module;
  - proposed modules under their parent;
  - untouched branches collapsed to one muted line with "+N beneath" (`:61-81`; `styles.css:133-134`);
  - touched modules missing from the tree in a failure list (`:68, 92-97`).
- **It has no consumer.** No page imports it (grep over `W/` finds only its own definition and the unrelated
  `CapabilityModuleTree`).
- Its data source, `getModuleTree()` → `GET /api/v1/project/modules` (`W/client.ts:151`; `P/paths.ts:14`), is called
  only by the test stub (`W/tests/helpers/stub-client.ts:76`).
- Plan 3 iteration 5 kept it "for the Run page to draw on", and said that iteration 11 would feed it from the run's
  projections (`D/plans/03-…/iterations/iteration5-results.md:209-212, 394-398`). That never happened.
- `Weight` and `TouchedModule` are web-only presentation types, not harness records (`module-tree.tsx:3-8`).
- The concept comes from the plan-level "modules touched" footprint, with its heavy, light and exposure-only weights
  (`D/architecture.md:36`).
- It is a candidate building block for an iteration or work-item footprint view.

### A.4 Run → Sessions: session timeline (`W/session-timeline.tsx`)

**Data.** `GET …/runs/:runId/sessions` (`P/paths.ts:36`) returns `RunSessionsResponse {version, sessions (max 500), total}`
(`P/sessions.ts:239-245`). A `RunSessionView` holds:

- `session` (`ses-NNNN`), `state`, `finished` (the reason), `role`;
- `work {workItem?, iteration?, request?}`, `executor`, `model`, `reaches`;
- `opened`, `changed`, `awaiting`, `point`;
- `invocations[]`, `appends[]`, `suspended[]`;
- `lineage {fork, replaces, replacedBy, requestedBy, requested[], forks[]}` (`P/sessions.ts:213-233`).

Each invocation carries:

- `start` (opened or continued), `started`/`ended` moments, `outcome`, `kept`, `continues`, `degraded`;
- `evaluation`, which is guarding, hook checks, excursions, lines and tokens (`P/sessions.ts:149-176`).

**Lanes, segments and links.**

- One lane per session, in the order the run opened them.
- *Segments* are invocations, which are chapters. Each is a link to that chapter of the transcript
  (`session-timeline.tsx:366-383`).
- *Gaps* are suspensions: a dashed grey line, and warn-coloured while open (`styles.css:414-415`).
- *Marks* are appended briefs: a warn-coloured diamond linking to the point (`styles.css:449-452`).
- *Links* between lanes (`:179-199`; `styles.css:416-421`):
  - fork: solid accent;
  - replace: dashed red;
  - request: dotted green.
- A relation whose source is absent from the answer is listed in words, not drawn.

**Encodings.**

- Segment classes by outcome (`styles.css:437-448`):
  - awaited: a striped blue pattern;
  - not-ended: red fill;
  - failed, stopped, context-budget-reached or invalid-submission: red border;
  - open: a dashed right edge;
  - degraded start: an inset warn ring and a "!" glyph.
- The lane label shows the session id (linked), a state badge and the role (`:361-365`).
- Alternate lanes are banded.

**Axis.** Columns are the **run event sequences** at which some session changed, one step (76 px) apart. They show order,
**not duration** (`:17-21, 110-137`). A last "now" or "end" column exists for open segments (`:135, 351`).

**Selection and words.** There is no in-diagram selection panel: every segment or mark is a link that navigates to the
transcript. A `<details>` "Session list" gives every fact in words (`:396-458`):

- the reach, as `reachText` (work item, capability, module);
- the relations;
- per chapter, the start, end, events and degraded reason;
- suspensions and appends.

**Limits.**

- Bound: 500 sessions per answer, with "Showing N / total" (`P/sessions.ts:30-35`; `:283-298`).
- **A long run makes a wide timeline**, one column per changed event, with no collapsing and no zoom. The frame only
  scrolls (Plan 9 `results.md:428-429`, open item at `:436-438`).
- The lane shows the **role**, but not the work item, capability or iteration. Those appear only in the session list
  text (`W/run-labels.tsx:32-39`).
- Gates and tests are not on the timeline.
- `metrics.evaluation.invocations` is no longer read by the web. The same data now arrives per invocation in the
  sessions answer (Plan 9 `results.md:430, 439-440`).
- The served fixture has no replacement, request, degraded start or live session. Those are covered by tests only
  (Plan 9 `results.md:433-435`).

### A.5 Session marks on the progress diagrams (`W/session-marks.tsx`)

**Data.** The run's sessions from `getRunSessions`, grouped by the harness-computed `reaches` (`P/sessions.ts:75-87`;
`H/projections/sessions.ts:33-45`):

| Role | Reach |
| --- | --- |
| initial-architect | `run` |
| global-fork | `request {request, workItem, capability}` |
| a session with a work item (local-architect, engineer, contract-engineer) | `work-item {workItem, capability, module}` |
| standalone | `module` |

**Attachment.**

- Dependencies marks a node by `capabilityOf(reach)`, which covers work-item and request reaches.
- By module marks a module heading by `moduleOf(reach)`, which covers work-item and module reaches. Its row detail
  groups sessions by capability (`session-marks.tsx:137-156`; `capability-module-tree.tsx:318-325`).
- A session with no drawn element goes to the **run-level strip**. That includes the initial architect, global forks in
  By module, and elements that are not drawn (`:268-308`).

**Encodings.**

| State | Shown as |
| --- | --- |
| live | `N live`, filled accent, plus a role chip per role (`×n` when several share one) |
| suspended | `N suspended`, dashed warn |
| interrupted | `N interrupted`, red outline (`styles.css:544-548`) |
| finished | no mark; listed in the element's selected detail and counted in a `<details>` element on the strip (`:171-174, 294-305`) |

**Selected detail.** `ElementSessions` lists each session: id and role (linked to the transcript), state, "awaiting
<invocation>" (linked to its chapter) and the finish reason. The order is live and suspended, then interrupted, then
finished with the latest first (`:212-266`).

**Limitations.**

- Degraded starts are not marked on the diagrams, only in notices (Plan 9 `results.md:371-373`).
- Marks are counts by role. They do not show which iteration, or how long a session has been live.

### A.6 Explicit answers

**Are acceptance scenarios represented in either diagram?** Barely. They are in neither diagram's drawing.

- **Dependencies**: only the selected capability's detail panel shows "Acceptance scenarios: N of M implemented", and
  only for entry capabilities (`W/capability-graph.tsx:524-526`; source: `H/projections/progress.ts:22-23, 121`). The
  count is "beside its state and does not decide it" (`progress.ts:22-23`). There is no node badge, no scenario node,
  and no scenario state (pending, bound, declared or implemented).
- **By module**: nothing about scenarios.
- **Elsewhere, not diagrams**:
  - the Scenarios tab is a table (`W/run-scenarios.tsx:507-549`) with id, state, origin, "belongs to" (entry
    capability, work item, sub-scenario or integration), owner and file, and each gate that ran it, with its status and
    failure;
  - the review is in Plan and entries (`:447-499`);
  - scenario-check summaries appear in gate detail (`:552-575`);
  - counts appear in the Overview (`W/run-page.tsx:144`).
- **Integration scenarios** (owned by a common-ancestor module) and **sub-scenario** relations are text only.

**Sessions?**

- On both progress diagrams, as marks, but only for live, suspended and interrupted sessions.
- In the selected detail, as lists.
- In full on the Sessions timeline.

**Session types (roles)?** They appear as role chips on live marks, as the role in timeline lane labels, and as the
role in detail lists. There is no colour or shape per role.

**Work items?**

- Dependencies: a count on the node face, and clickable ids in the detail (they open Work items).
- By module: none.
- Timeline: text in the session list only.

**Iterations?**

- In no diagram.
- They are cards in Work items → work-item detail, showing kind, checkpoint, scope, result, commit, gates and sessions
  (`W/run-page.tsx:474-491`).
- `session.work.iteration` exists (`P/transcripts.ts:124`), but `reaches` ignores it (`H/projections/sessions.ts:33-45`).

**Gates and tests?**

- In no diagram.
- Gate ids appear only as the text `evidence` list in the capability detail of Dependencies and the row detail of By
  module. They are not linked.
- The Checks tab lists gate attempts from the event feed. Its gate detail shows commands (ramify-check, type-check,
  tests, conformance, scenarios), outcome, exit, `elapsedMs`, the output tail and the scenario summary
  (`W/run-page.tsx:527-587`).

**Relations visible in the diagrams:**

| Relation | Where |
| --- | --- |
| module ⊃ module (containment) | By module edges |
| capability → module (initial association with role; implemented-here) | By module rows |
| capability → capability (depends on; tentative or confirmed; cycles) | Dependencies edges |
| capability → owner module (current or suggested) | Dependencies node face |
| capability → work items (count; ids in detail) | Dependencies |
| capability → evidence gate ids (text, in detail) | both |
| capability (entry) → scenario count | Dependencies detail |
| session → capability or module (reach) | marks on both |
| session → session (fork, replace, request) | timeline |
| session → invocations (chapters), suspensions, briefs | timeline |
| module proposed at start → recorded parent | By module |

**Relations missing from the diagrams:**

- capability ↔ **individual scenarios**, and their states;
- scenario ↔ module owner and file, ↔ integration or sub-scenario structure, ↔ the gates that ran it (shown in the table
  only);
- capability, work item or iteration ↔ **gate attempts, tests and verdicts**. Evidence is unlinked text;
- **work item ↔ iteration ↔ session** as a structure. Iterations are absent from every diagram, and sessions are not
  grouped by iteration;
- work item ↔ work item (`follows`, `waitingFor`), and requirement, obligation or contract ↔ capability. These appear in
  lists only (`W/run-page.tsx:445, 493-503`; the decisions tab);
- session ↔ capability on the timeline itself. A lane shows only the role;
- session ↔ gate or commit;
- any **time** dimension. Timeline columns are event order, and nothing on the diagrams shows durations;
- token or cost figures on any diagram node;
- the touched-module footprint of an iteration or work item (`module-tree.tsx` is unused);
- run ↔ run comparison.

---

## Part B. Planned or proposed views not yet implemented

Only **Plan 4's two Run-page panels** have an implementation plan behind them. Everything else is a candidate, an open
item, a deferral or an open question. Nothing proposes a cross-run comparison view, a cost or pricing view, or
notifications. Plan 4 rules pricing and cross-model token comparison out of scope
(`D/plans/04-token-efficiency/main-plan.md:422-434`).

**Stale status text.**

- `D/future/README.md:79-88` still says the capability dependency graph is "Specified" and that "the current MVP …
  does not deliver the graph".
- `D/README.md:73-76` still labels the visualization plan "proposed".
- Both are implemented (proposal `:3-12`).

| View | What it would show | Status | Source |
| --- | --- | --- | --- |
| **Token efficiency panel** (Run page, before the older KPIs) | `T, A, D, C, S0, g(S0), U, K`, policy version, endpoint identities and state; production/test and provider/model breakdowns disclosed progressively | Planned in Plan 4; the plan is "proposed; blocked until Plan 3 is complete". Dan still has to start it | `D/plans/04-token-efficiency/main-plan.md:3-4, 30-45, 330-333`; `D/dan-to-do.md:88-89` |
| **Context limits panel** | automatic events, exact overflows, budget returns and compactions; per role and invocation: trigger, threshold, before/after usage, completion state, workflow action; a running occurrence visible before it completes | Planned (Plan 4, `context-limits/1`), acceptance cases TE16 and TE23 | `main-plan.md:335-339, 389, 396` |
| Relabelled older KPI table | declared-scope wording for today's `kpi/1` table | Planned (Plan 4, TE17) | `main-plan.md:341-351, 390` |
| **Iteration explorer** | planned, active, completed and superseded iterations, with assignments, scope revisions, outcomes, retries, and reasons for waiting or reopening. **Gate attempts and test/check results belong here**: every gate attempt, its selected checks, result, repair round and full-output reference | Captured (future candidate); the MVP already records the evidence | `D/future/README.md:90-101` |
| Agent session explorer (remaining parts) | search across sessions and within transcripts, list filters, retention, redaction, streaming text within an entry | Partly delivered by Plan 9; the rest is captured | `D/future/README.md:105-125`; Plan 9 `results.md:425` |
| Check findings lifecycle | stable finding identity, status, evidence, disposition, resolution history | Captured, deferred from the MVP | `D/future/README.md:129-137` |
| Automated code-review findings | actionable review results shown as findings | Captured | `D/future/README.md:139-145` |
| Plan-scoped capability registry with entry points | the graph drawn over registry entries | Captured, post-MVP | `D/future/README.md:34-75` |
| Isolated worktree execution | implies parallel sessions in the views | Captured | `D/future/README.md:149-157` |
| **Retired forecasts** | a completed run shows forecasts as `todo` ("shows unfinished work"). Proposal: show forecasts outside the required set as *retired*, with a harness reason | Proposed; open question whether to show them at all or behind a toggle | `D/analysis/2026-09-23-capability-registry-analysis.md:34-35, 82-84, 168-178, 208-210` |
| Lineage comparisons as a view | fork cost against a fresh start, continuation growth, repair cost, degraded-start rate | Measurements exist (`lineage/1`), but only as a table; no comparative view | `D/analysis/2026-09-23-session-transcripts-live-view.md:296-305` |
| Streaming text (SSE) | live text within an entry | Deferred (decision 4) | `…session-transcripts-live-view.md:500-502, 730-733, 746-747` |
| Retention display ("pruned on <date>") | what was pruned, and when, instead of a missing file | Open item or proposal | `D/todo.md:128-149` (esp. `:146-147`); `…live-view.md:650-656` |
| Timeline collapse or zoom | collapse idle stretches, zoom a long run | Open item: "left for when a real run needs it" | Plan 9 `results.md:428-429, 436-438` |
| Scenario list → gate detail link | open the Checks gate detail from a scenario's gate | Open item | Plan 10 `results.md:1490-1491` |
| Composition-failure suspects, scope-tests scenarios, gate bindings | recorded but not projected to the web | Open item | Plan 10 `results.md:1483-1486` (earlier asks at `:1188-1191, 1349-1350`) |
| Stale web-bundle warning | `serve` warns when the bundle is older than the sources | Proposed | Plan 10 `results.md:1932-1936` |
| Red/green outer loop state | red while scenarios are bound and failing, green when all pass | Future ("later step") | `D/analysis/2026-09-23-acceptance-scenarios.md:493-502` |
| Scenarios in `tests.jsonl` | make behavior searchable in the architect view | Left out of v1; open question 7 | `D/architecture/acceptance-scenarios.md:131`; `…acceptance-scenarios.md:526-527` |
| Relocation "entry point before and after" | a review aid for refactor plans | Proposed | `D/analysis/2026-09-23-refactoring-and-debugging-plans.md:213-218` |
| Behavior-preservation check | baseline `tests.jsonl` titles still exist and pass; a mismatch is a warning with a reason | Proposed | `…refactoring-and-debugging-plans.md:181-185` |
| Capability-graph coherence checks on the initial analysis | "checks on a forecast" | Open question (Dan) | `D/dan-to-do.md:93-95` |
| Architectural history from `module.ramify` changes | a history view | Hypothesis only | `D/additional-to-evaluate.md:153` |
| Deferred drift KPIs | owner, seam and reuse drift; knowable share | Deferred; the inputs are retained | `D/plans/03-…/completion-report.md:359-361`; `D/measurements-and-kpis.md:229-235` |
| Dependency graph details (architecture) | node **and edge** details expose linked work, outstanding consumer requirements and evidence; stable positions as the graph evolves | Specified; partly implemented (see A.2) | `D/architecture/autonomous-implementation-loop.md:1143-1146` |

**Relations the documents ask for, against what exists.**

- *Gates and tests → iteration*: the iteration explorer is only captured (`future/README.md:98-101`).
- *Capability → scenarios*: delivered as a count only (Plan 10; `D/architecture/acceptance-scenarios.md:729-731`).
- *Session → capability or module, and run-level sessions*: delivered (`…live-view.md:47-54, 504-514`).
- *Tests (Vitest titles) → capability*: requested nowhere. The only link from a test to the architecture is
  `tests.jsonl` by module.
- *Cucumber gap*: `GateAttempt` has no field for it (`D/plans/03-…/completion-report.md:130-132`), and Dan has an open
  decision on where to record it (`D/dan-to-do.md:86`).
- *Plan 6*: proposes no web view.

---

## Part C. Measurements and KPIs a dashboard could show

**Source.** `GET …/runs/:runId/metrics` (`P/paths.ts:32`) returns `MetricsResponse` (`P/runs.ts:1102-1124`), which holds:

- `kpi/1` metrics, produced by `H/kpi/metrics.ts:424-449`;
- `lineage/1` measurements, produced by `H/kpi/lineage.ts:244-254`;
- the baseline `B`, measured under `scope-size/1`;
- `evaluation`: run guarding, `outsideScope`, and `invocations[]` with tokens per invocation.

Everything is assembled in `H/projections/metrics.ts:160-277`.

Every metric carries `{id, unit, policyVersion, measurementPolicy, state: measured|partial|unavailable|not-applicable,
value, numerator, denominator, subtotal, coverage, evidence, note}` (`P/runs.ts:1006-1034`). "Unavailable is never
zero": only a `measured` metric has a value.

**Current display.** The Measurements tab shows every metric generically, as a table row: id and unit, state, value
(or known subtotal), numerator, denominator, coverage, and note or evidence (`W/run-page.tsx:685-736`). There are no
charts, no grouping and no trend. By design the client performs no calculation (`D/measurements-and-kpis.md:59-62`).

### C.1 `kpi/1`: implemented, shown as a Metrics table row

| id | Measures | Docs / code |
| --- | --- | --- |
| `scope-bytes-per-changed-line`, `scope-size-ratio`, `reduction-factor` | the change-weighted scope size, then over B, then its inverse | `D/measurements-and-kpis.md:172-174`; `H/kpi/metrics.ts:115-187, 426-431` |
| `session-count`, `session-weighted-total` | sessions; Σ S_s/B per context history | `measurements-and-kpis.md:175-176`; `metrics.ts:215-256, 432-437` |
| `adaptation-session-share`, `adaptation-usage-share.{input,cache-read,cache-write,output}` | the share of sessions and tokens spent on adaptation | `measurements-and-kpis.md:177-178`; `metrics.ts:301-313` |
| `usage-tokens.{input,cache-read,cache-write,output}` | **whole-run** tokens per category, never summed or priced | `measurements-and-kpis.md:192-194`; `metrics.ts:258-295` |
| `compactions.<role>`, `budget-return-rate.<role>` (5 roles each), `repeated-budget-returns` | context pressure by role | `D/metrics/glossary.md:121-139`; `metrics.ts:323-346` |
| `gate-attempts-per-accepted-iteration` | gate attempts on accepted iterations, divided by accepted iterations | `metrics.ts:442`; `H/projections/metrics.ts:196-202` |
| `blocked-write-attempts` | blocked calls over guarded edit/write calls; the role·tool·verdict breakdown only in evidence | `metrics.ts:354-381` |
| `observation-coverage`, `observation-coverage.<kind>` | invocations with no observation gap; gaps by kind | `measurements-and-kpis.md:257-259`; `metrics.ts:393-419` |

### C.2 `lineage/1`: implemented, shown as a Lineage table row

The ids are from `H/kpi/lineage.ts` and the documentation is `D/metrics/lineage.md`.

- `fork.generation-<g>.{start-context,input,cache-read,cache-write,output}`: fork cost profiles, by generation
  (`lineage.ts:142-148`).
- `fresh-fork.*`, `repair.*`, `fresh-engineer.*`: cost profiles per segment class (`:149-177`).
- `continuation-growth`: the start-context delta of each continuation (`:158-170`).
- `degraded-starts` (with `.continue` and `.fork`), `replacements.{reconstructed,context-rebuilt}`,
  `forks-served.generation-<g>` (`:182-241`).

### C.3 Other figures in the protocol, and where the web shows them

| Figure | Where it is shown |
| --- | --- |
| Baseline B (bytes and snapshot, or unavailable with a subtotal) | One line above the Metrics table (`W/run-page.tsx:703`) |
| Snapshot counts: work items and completed, open requirements, invocations, **gate attempts**, **readiness attempts**, scenarios by state, degraded starts (`P/runs.ts:247-258`) | Overview "State" facts (`W/run-page.tsx:140-144`); degraded starts as a notice (`:194-241`) |
| `startedAt` / `endedAt` | Raw timestamps in the Overview (`run-page.tsx:147-148`); **no computed duration** |
| Per work item: iterations, gate attempts, invocations, outline revisions (`P/runs.ts:571`) | Work-item list: iterations and gates only (`run-page.tsx:445`) |
| Gate `repairRound`, `infrastructureAttempt`; per command `elapsedMs` | Gate detail text in Checks (`run-page.tsx:558, 574`); **not aggregated** |
| Invocation wall-clock `elapsedMs` (`H/run/records.ts:568`) | **Not in any protocol response**; not displayed |
| Per-invocation `usage {input, cacheRead, cacheWrite, output}`, `lines`, `hookChecks`, `excursions`, `gaps`, guarding | **In a transcript chapter only** (`W/evaluation.tsx:34-53`, via `W/session-page.tsx:223`). `metrics.evaluation.invocations` is served but unused by the web (Plan 9 `results.md:430`) |
| Per-message usage (with total), reasoning tokens, and **executor-reported cost** (`P/transcripts.ts:82-91`) | Per assistant message in the transcript (`W/transcript.tsx:214-243`). The only place cost appears; never aggregated |
| Budget-reached tokens and threshold; compaction tokens before and after | Transcript entries (`transcript.tsx:453-458, 500-506`) |
| Guarding verdicts (allowed, blocked-scope, blocked-unresolved); guarded and unguarded tools; run `outsideScope` | "What was guarded" panel (`run-page.tsx:692-700`) |
| Scenario figures: analysis totals, check `untracked {passed,skipped,failed}`, per-scenario gate status, entry `{implemented,total}` | Overview counts, the Scenarios table, gate detail, capability detail |

### C.4 Aggregations that do not exist, which a dashboard would need

- **Tokens**:
  - Totals exist only per whole run, per invocation, per message and as lineage group means.
  - Nothing is aggregated **per work item, iteration, capability, module, role or session type**.
  - Token-efficiency asks to "retain phase and role breakdowns" (`D/metrics/token-efficiency.md:228`), which is not
    implemented. Per-role KPIs cover only compactions and budget returns.
- **Cost**: only per message. Monetary cost, latency and productivity are explicitly outside token efficiency
  (`D/metrics/measurement-principles.md:100-103`; `H/kpi/metrics.ts:19-20`).
- **Durations**:
  - There is no run duration, and no served invocation duration.
  - There is no total or mean gate or check time.
  - Timeline columns are event order.
- **Lines**: there is no run-level added/deleted total, and no final-diff measure. Cumulative edit volume is proposed
  (`D/measurements-and-kpis.md:25-30, 196-221`).
- **Per-invocation scope size S_s**: captured (`H/projections/metrics.ts:173`) but not served.
- **Repair rounds**: there is no maximum or mean. The closest figure is `gate-attempts-per-accepted-iteration`.
- **Excursions and hook checks**: per invocation only. There is no run-level count or rate.
- **Across runs**: there is no endpoint and no trend. Every projection is scoped to one run.

### C.5 Planned but not implemented

| Item | Status | Source |
| --- | --- | --- |
| `token-efficiency/1`: `T, A, D, C = A + D, S0, g(S0), U = 100T/C, K = 100T/(C·g(S0))` | Planned (Plan 4), blocked; no code | `D/metrics/token-efficiency.md:119-262`; `D/metrics/README.md:10-14` |
| `context-limits/1`: budget returns; threshold, overflow and explicit compactions by role and mechanism; exact overflow count | Planned (Plan 4) | `token-efficiency.md:230-233`; Plan 4 `main-plan.md:238-255` |
| Planning drift (owner, seam, reuse), adaptations and their cost, knowable share | Proposed or deferred | `D/measurements-and-kpis.md:229-235` |
| Architect-only delivery measures (session count, elapsed time, reads and searches, excursions, retries) | Proposed | `D/measurements-and-kpis.md:138-147` |
| Actual exploration (reads, searches, exposure) | Deferred | `D/metrics/measurement-principles.md:121-123` |
| Learned expected-token model | Deferred | `measurement-principles.md:125-128` |
| Candidate measurements: solve rate, max context per agent, unnecessary reads, hand-off failures | Hypotheses | `D/additional-to-evaluate.md:145-149` |
| Rule | Show implementation KPIs as "not started" until their observations exist | `D/measurements-and-kpis.md:150-151` |
