# Inventory of the ramify-agent web client

Input for the design of a plan execution dashboard. Covers what the existing
web client displays today, where it gets each item, and how it links.

- Root: `/ramify/ramify-agent/`. All paths below are relative to it.
- Sources read: `subs/web/README.md`, every file in `subs/web/src/` (outside
  `tests/`), the protocol in `subs/harness/src/interfaces/protocol/`, and
  `subs/web/src/tests/helpers/*` for StubClient data shapes.
- Nothing in the repository was changed.

Legend for the classification columns:

- **Q** is the user question the area answers: a = what is happening now,
  b = what has been done, c = what is left to do, d = issues or problems.
- **L** is the level of detail: 1 = at a glance or visual, 2 = summary list,
  3 = detailed record, 4 = raw (transcripts, output tails, file contents).

---

## 0. The shell, data plumbing and update model

### App shell (`subs/web/src/app.tsx:28-55`)

- **Header.** The brand link `ramify-agent` goes to `#/` (`app.tsx:38`). The
  project name comes from `getProject`, with the root path as a tooltip
  (`app.tsx:30,39`). The nav has links to Plans and Sessions (`app.tsx:40-43`).
- **Connection status.** It reads "Connecting / Connected / The harness is not
  answering", with a colored dot (`connection.tsx:4-8,26-31`). It probes
  `getProject` every 5 s (`connection.tsx:21-25`). This is live.
- **Routing.** Routes come from the URL hash (`routes.ts:47-73`):
  - `#/`: the Plans list.
  - `#/plans/<id>`: the Plan page.
  - `#/plans/<id>/runs/<run>`: the Run page.
  - `#/sessions`: the Sessions page.
  - `#/plans/<id>/runs/<run>/sessions/<ses>[/chapters/<inv>|/points/<inv>|/appends/<seq>]`: a run session's transcript.
  - `#/sessions/standalone/<ses>[...]`: a standalone session's transcript.
  - Any unknown hash falls back to the Plans list.
- **What the URL does not hold.** Run-page tabs, the selected work item, the
  selected gate, the selected capability node, the selected module row and the
  Progress view are React state only (`run-page.tsx:63-65,529,613`). None of
  them can be deep-linked, and every link back to a run lands on the
  Overview tab.

### Client (`subs/web/src/client.ts:55-98,147-196`)

- Every answer is validated by its zod schema.
- The client exposes these queries: `getProject`, `listPlans`, `getPlan`,
  `getModuleTree`, `listRuns`, `getRun`, `getEvents`, `getAnalysis`,
  `getDecisions`, `getWorkItems`, `getWorkItem`, `getCapabilities`,
  `getModuleCapabilities`, `getScenarios`, `getGate`, `getMetrics`,
  `listSessions`, `getStandaloneSession`, `getRunSessions`, `getTranscript`,
  `pollSessions` and `getBody`.
- `sendCommand` retries a command up to 3 times with the same command ID
  (`client.ts:180-190`).
- The HTTP paths are in `subs/harness/src/interfaces/protocol/paths.ts:11-54`.
- **Unused.** `getRun` is never called by a page, since the Run page uses
  `getEvents`. `getModuleTree` is also never called by a page (StubClient
  only, `tests/helpers/stub-client.ts:76`).

### Update model

| Mechanism | Where | Behaviour |
|---|---|---|
| `useQuery` | `use-query.ts:13-35` | Loads once per key; `reload()` keeps the old answer shown while it refetches |
| `useRunProgress` | `run-progress.ts:21-57` | Polls `getEvents(after=cursor)` every 1 s while `run.state === 'running'` and stops when the run is not running (`run-progress.ts:43`). The events array grows without bound in memory |
| `useRunQuery` | `run-progress.ts:63-73` | Re-fetches an area's whole query whenever `run.version` moves (every event) |
| Sessions page poll | `sessions-page.tsx:88-92` | `listSessions` every 5 s while any listed session is live or suspended |
| Transcript follow | `session-progress.ts:58-160` | For run sessions: `getRunSessions` and transcript pages first, then `pollSessions(version, cursor)` every 1 s until the session is final and its entries are complete. A standalone session is never followed (`session-progress.ts:78`) |
| Connection probe | `connection.tsx:21-25` | `getProject` every 5 s |
| Static | Plans page (manual Refresh button), Plan page (runs list loads once; no Refresh and no poll, `plan-page.tsx:38`) | — |

### StubClient data shapes (`subs/web/src/tests/helpers/stub-client.ts`)

- `StubRun` holds these answers (`stub-client.ts:18-30`): `snapshot`
  (RunSnapshot), `events` (ProjectedRunEvent[]), and optionally `analysis`,
  `decisions`, `workItems`, `workItem{}`, `capabilities`,
  `moduleCapabilities`, `gates{}`, `scenarios` and `metrics`.
- The stub also serves `plans`, `documents`, `runList`, `tree` (unavailable
  by default), `sessionList`, `runSessions` (by run), `standalone`,
  `transcripts` (keyed `<session>@<after>`), `polls` (a queue) and `bodies`.
- **Fixture defaults.** The session fixtures (`tests/helpers/sessions.ts:13-60`)
  use plan `review-notes`, run `20260921T080000Z-c0ffee` and sessions
  `ses-000N`. Their engineer is on work item `wi-001`, iteration `wi-001.i02`,
  capability `send-button` and module `shop/reviews`. The evaluation defaults
  are partial guarding, 1 blocked-scope, hook checks 2/1/0, excursion
  `shop/search`, lines +12/−3, and tokens 100/50/10/40.

---

## 1. Plans list page (`#/`, `subs/web/src/plans-page.tsx`)

- **Reached by.** The brand link, the "Plans" nav link, any unknown hash, and
  "← All plans" on the Plan page.
- **Feeds.** `listPlans` → `GET /api/v1/plans` → `planListResponseSchema`
  (`queries.ts:100-102`), plus `getProject` for the empty state.

| Area | Fields shown | Links out |
|---|---|---|
| Header | "Plans" and a Refresh button (`plans-page.tsx:11-16`) | — |
| Plan list (`plans-page.tsx:38-57`) | Readable plan: title and path. Unreadable plan: id, path and "Unreadable: message" | The title goes to the Plan page (`plans-page.tsx:44`) |
| Empty state (`plans-page.tsx:26-36`) | The plan pattern `plans/<plan-id>/plan.md` and the project root | — |

- **Classification.** It answers b only weakly: which plans exist. Unreadable
  plans are d. Level 2, text. Static, with manual refresh.
- **Entities and relations.** Only plans are shown. Plans have no relation to
  runs here: no run count, latest state or running indicator.
- **Weaknesses for a dashboard.** You cannot see which plan is running or
  failed without opening each one, and there is no aggregate status at all.

---

## 2. Plan page (`#/plans/<id>`, `subs/web/src/plan-page.tsx`)

- **Reached by.** A plan title on the Plans list, and "← The plan" on the Run
  page.
- **Feeds.** `getPlan` → `planResponseSchema` (`queries.ts:106-113`), and
  `listRuns` → `GET /plans/:id/runs` → `runListResponseSchema`
  (`runs.ts:278-284`, which carries full `RunSnapshot`s,
  `runs.ts:222-264`).

| Area | Fields shown | Q | L | Links out |
|---|---|---|---|---|
| Header (`plan-page.tsx:24-27`) | Title and path | b | 2 | "← All plans" (`:19`) |
| Implementation runs (`plan-page.tsx:37-96`) | Start button and review-stop checkbox. The agent line: "Runs start on the X agent", or "No agent is configured" (`:71-72`), and "Run X is running; one run runs at a time". One row per run: jobId, a `RunState` badge, phase, `completedWorkItems/workItems` work items, `startedAt`, and a notice count (`:78-85`). Unserved runs: jobId, code and message in red (`:86-90`). "Showing newest N of total" (`:93`) | a (state badge), b (list), d (notice count, unserved, start refused `:73`) | 2 | The jobId goes to the Run page (`:80`). After Start, the page navigates to the new Run page (`:52`) |
| Plan text (`plan-page.tsx:29`, `markdown.tsx:35-41`) | The plan Markdown rendered read-only; embedded HTML is shown as text | c (what the plan asks for) | 4 | Markdown links only |

- **Visual or textual.** Mostly text. The state is a text badge whose color
  comes from a CSS class.
- **Live or static.** Static. The runs list is loaded once, so a running
  run's phase and counts do not update here.
- **Entities.** Plan, run and agent. Relations shown: plan→runs,
  run→state/phase/work-item counts, run→notices (count only).
- **In the data but not shown.** Each RunSnapshot carries a lot that the list
  drops:
  - `current` (the role, invocation, work item or iteration running now);
  - `waits`, `failure.reason` and `failure.message`, and `review`;
  - `counts.scenarios`, `counts.degradedStarts`, `counts.gateAttempts`,
    `counts.openRequirements` and `counts.invocations`;
  - `endedAt`, `updatedAt`, `stopRequested` and `writer`;
  - the notice kinds.
  A failed run's reason is invisible until you open it.

---

## 3. Run page (`#/plans/<id>/runs/<run>`, `subs/web/src/run-page.tsx`)

- **Reached by.** The run id on the Plan page, the post-Start navigation,
  "Run X of plan" on the Sessions page (`sessions-page.tsx:34`), and "← The
  run" on a run session's transcript (`session-page.tsx:318`).
- **Page header (`run-page.tsx:70-86`).**
  - "← The plan" link, `Run <id>` and a RunState badge.
  - A connection line: "Read at version N. Closing or reloading this page does
    not affect the run", or "The harness is not answering (…). What is shown
    is the last state read at version N" (`:76-80`).
  - Then **nine tabs**, one mounted at a time (`:26-36,82-98`): Overview,
    Plan and entries, Hypotheses and decisions, Work items, Scenarios,
    Checks, Progress, Sessions, Measurements.
- **Live source.** `useRunProgress` polls `getEvents` every 1 s while running.
  It supplies `run: RunSnapshot`, `events: ProjectedRunEvent[]` and `version`.
  Every other tab refetches its whole query when the version moves.

### 3.1 Overview tab (`run-page.tsx:105-176`)

#### 3.1.1 Notices (`run-page.tsx:194-262`)

- **Feed.** `RunSnapshot.notices` (`runs.ts:199-214,263`), plus
  `counts.degradedStarts`. When that count is above 0, it also reads
  `getRunSessions` (`run-page.tsx:219`).
- **Fields.**
  - Module created or removed: the module, summary, declaration path,
    iteration, commit (12 characters) and event sequence (`:253-261`).
  - Dependency cycle: a resolved or not-resolved badge, the summary, members
    joined with "→", closedBy and the event sequence (`:244-251`).
  - Degraded starts: the count, then per invocation "session role,
    invocation: requested X was made Y (reason)" (`:217-241`).
  - When empty: "None so far / No module was created or removed, and no
    dependency cycle was detected" (`:200-201`).
- **Classification.** d, and b (structural changes). Level 3. Text with a
  colored badge. Live.
- **Links.** Each degraded start links to its transcript chapter
  `…/sessions/<ses>/chapters/<inv>` (`:233`).
- **Not navigable.**
  - `notice.iteration` → Work items or iteration.
  - `notice.commit`, and `notice.decision` (the placement decision that
    proposed the module; this is in the data and not shown at all).
  - `notice.at` is not shown.
  - Cycle members → capabilities in Progress; `closedBy` → work item.

#### 3.1.2 State (`run-page.tsx:125-149`)

- **Feed.** RunSnapshot.
- **Fields.** Run state (plus "a stop was requested"), phase, agent, current,
  work items "X of Y completed", open requirements, invocations, gate attempts
  (and readiness attempts), scenarios "implemented, declared, bound, pending",
  review, writer (held by / unsettled), started and ended (`:136-148`).
- **Current work.** `currentText` (`:178-188`) joins role, "session
  <invocation>", work item, iteration, request and "waiting: …" into one
  string.
- **Classification.** a (current work, phase, writer), b (counts), c
  (implicitly: Y−X work items, pending scenarios, open requirements), d
  (writer unsettled, stopRequested). Level 2. A text `<dl>` with no
  progress bars. Live.
- **Links.** None. `current.invocation`, `current.workItem`,
  `current.iteration` and `current.request` are plain text. It labels an
  invocation id as "session". `writer.held` (an invocation) is not linked to
  its transcript.
- **Not shown.** `updatedAt`.

#### 3.1.3 Waits (`run-page.tsx:150-155`)

- **Feed.** `RunSnapshot.waits` (`runs.ts:246`).
- **Fields.** Only `wait.reason`, one line each. `wait.workItem` is used as
  the key and not shown; `wait.requirements` is not shown.
- **Classification.** a/c: what is blocked. Level 2. Text. Live.
- **Links.** None. Work item → Work items tab would fit here.

#### 3.1.4 Failure (`run-page.tsx:156-161`)

- **Feed.** `RunSnapshot.failure`.
- **Fields.** "Failed: <reason>. <message>" and the evidence strings as code.
- **Classification.** d. Level 3. A text alert box. Live.
- **Links.** None. The evidence strings are raw ids or paths, and the failure
  is not linked to a gate, work item or session.

#### 3.1.5 Review (`run-scenarios.tsx:87-98`, mounted at `run-page.tsx:163`)

- **Feed.** `RunSnapshot.review` and `phase`.
- **Fields.**
  - "Not reviewed", or "Approved by X at T[, while the run was working]"
    (`run-scenarios.tsx:23-26`).
  - At `awaiting-review`, a warning: the run waits, nothing is written, read
    the scenarios under Plan and entries, then approve or stop (`:92-94`).
  - The Approve form.
- **Classification.** a (waiting for a person), c (a pending approval), d.
  Level 2. Live.
- **Links.** None. The warning tells the user to go to the "Plan and entries"
  tab in words; there is no link.

#### 3.1.6 Event feed (`run-page.tsx:164-173`)

- **Feed.** Accumulated `ProjectedRunEvent[]` from `getEvents`
  (`runs.ts:304-325`).
- **Fields.** Sequence, time (HH:MM:SS) and summary. The `transition` is used
  only as a CSS class: failed and interrupted jobs in red, completed in green
  (`styles.css:92-93`).
- **Classification.** a (latest lines) and b (history). Level 2/3. Text. Live
  (appends every 1 s poll).
- **Layout.** Oldest first. A scroll box with max-height 22rem
  (`styles.css:89`) that does not stick to the bottom, so the newest events
  sit at the bottom of a long list.
- **Not navigable.** Every event has typed `refs[]` of kind work-item,
  iteration, invocation, gate, decision, request, contract, obligation,
  requirement, capability, commit, scenario or session (`runs.ts:292-309`;
  producer `harness/src/projections/events.ts:20-200`). None is rendered or
  linked, and there is no filter by transition or ref.

### 3.2 Plan and entries tab (`run-page.tsx:276-324`)

- **Feed.** `getAnalysis` → `analysisResponseSchema` (`runs.ts:449-464`).

| Area | Fields | Q | L |
|---|---|---|---|
| Entry assignments (`:283-302`) | A table of capability, owner (plus "proposed under <parent>"), work item and description. When pending: "The initial analysis has not been accepted yet" | b (the plan's decomposition), c | 2 |
| Review of the scenarios (`:303-313`, `run-scenarios.tsx:127-179`) | Warnings first (kind, scenarios, message) (`:138-144`). Per entry: `capability in owner` and scenario cards with id, name, a plan/architect origin badge, origin text (plan lines or architect citations), partOf, file, frozen Gherkin, and per-scenario warnings (`:107-120`). Per integration scenario: owner, origin, the plan's Gherkin beside its sub-scenario cards (`:154-176`). "Showing N of total" | b (what was frozen), c (what must pass), d (warnings) | 3/4 (the Gherkin text) |
| Approve form (`:311`) | See Commands | a/c | — |
| The captured plan (`:314-318`) | The first 16 characters of the SHA-256, and the plan Markdown in a collapsed `<details>` | b | 4 |

- Visual or textual: text. Live (refetched per version, though the analysis
  is frozen once accepted).
- **Entities.** Entry capability, owner module, work item, scenario,
  integration scenario and warning. Relations shown: entry→owner,
  entry→work item (as text), entry→scenarios, integration→sub-scenarios,
  warning→scenarios.
- **Not navigable.**
  - Entry work item → Work items tab; capability → Progress; owner → module
    in Progress By module; scenario → its row in the Scenarios tab (state,
    gates).
- **In the data but not shown.**
  - `analysis.view` (architect view identity).
  - `entry.proposed.directory`, `purpose` and `tags` (only the parent is
    shown).
  - `total.entries` and `total.hypotheses` (no bounded notice for entries).
- The review repeats data that the Scenarios tab shows again with state; the
  two are not joined.

### 3.3 Hypotheses and decisions tab (`run-page.tsx:328-426`)

- **Feed.** `getAnalysis` (hypotheses, `runs.ts:350-368`) and `getDecisions`
  → `decisionListResponseSchema` (`runs.ts:477-549`). Two columns
  (`.columns`).

| Area | Fields | Q | L |
|---|---|---|---|
| Hypotheses (`:355-367`) | A "hypothesis" badge, id, change, capability and suggestedOwner. Standing, revision and confidence. Rationale. When revised: the initial change, owner and rationale. "Revised by <decision ids>". "Superseded by X" | b (forecast versus current), c (forecasts are what is expected) | 3 |
| Decisions (`:379-426`), cards by kind | **placement**: id, authority, workItem, outcome, capability, owner, "changes symbols with consumers", question, rationale, proposed module parent and purpose, revises, hypothesis revisions id@rev. **scope**: iteration, iterationKind, modules, "explicitly broad", includedChildren, rationale, authorizations. **breaking**: workItem, outline revision, guarantee, reason, affected consumers. **plan-revision**: workItem, outline revision, decomposition, stages, rationale, reason. **contract**: contract, revision, mode, capability, provider, authority kind, owner and rationale, establishedBy iteration and gate, placed by decision | b | 3 |

- Text cards. Live.
- **Entities and relations shown as text.** hypothesis→capability,
  hypothesis→owner module, hypothesis→decisions, hypothesis→supersededBy,
  decision→work item, decision→hypotheses, decision→revises,
  contract→establishing gate and iteration.
- **Not navigable.** None of these ids is a link: decision ids in a
  hypothesis card, `revises`, work item, gate, iteration, capability and
  module.
- **In the data but not shown.**
  - Hypothesis: `changesExistingSymbols`, `dependsOn`,
    `anticipatedConsumers` and `confirmedBy`.
  - Decision: `at`, `sequence` (used as a key only), `placement.request`,
    `placement.registry`, `scope.extra`, and the list `total` (no bounded
    notice).
- **Weaknesses.** Long card lists. There is no ordering by work item or
  grouping, no filter, and no time axis, even though decisions carry an
  event sequence.

### 3.4 Work items tab (`run-page.tsx:430-510`)

- **Feed.** `getWorkItems` → `workItemListResponseSchema`
  (`runs.ts:555-580`); the selected item comes from `getWorkItem` →
  `workItemResponseSchema` (`runs.ts:606-660`).

| Area | Fields | Q | L |
|---|---|---|---|
| List (`:438-449`) | A button with the id, a state badge (todo, "working on", yielded, completed), module, capability, "N iterations", "N gates", "waits for R…", "follows X" | a (working), b (completed), c (todo, yielded), d (waits) | 2 |
| Detail (`:456-510`), below the list | `id: goal`. **Outline revisions**: revision, decomposition kind, changes, "Why: revisionReason", breaking changes. **Iterations** as cards: id, kind, checkpoint, goal; scope modules, includedChildren and rationale; result outcome and commit (12 characters) or "open"; findings; "Gates: id verdict (cause)"; "Sessions: invocation id, role, ended or running"; a warning "Changed outside the write scope: …". "Work-item gates: id verdict". **Requirements**: id@rev on obligation, verified or open. **Placement requests**: id, question → decision or "no decision yet" | b, c, d (outside scope) | 3 |

- Text. Live (refetched per version).
- **Entry.** Also reachable from the Progress → Dependencies capability
  detail's work item button (`capability-graph.tsx:514-516` →
  `run-page.tsx:95`), the only cross-tab link on the page.
- **Relations shown as text.** work item→module, work item→capability,
  work item→follows, work item→waitingFor requirements,
  work item→iterations, iteration→gates, iteration→invocations (sessions),
  work item→requirements, work item→requests→decision.
- **Not navigable.**
  - Iteration gate ids → Checks gate detail.
  - Iteration invocations → transcript chapters. The data gives an
    invocation id; the session id needs `getRunSessions`.
  - Request decision → the Decisions card; requirement → obligation or
    contract; module and capability → Progress.
- **In the data but not shown.**
  - Summary: `origin` (entry, obligation, verification or integration),
    `goal` (list), `startedFor`, `currentIteration`, `completedBy`,
    `counts.outlineRevisions` and `counts.invocations`, and the list `total`.
  - Outlines: `invocation`, `stages[]` (title, approach, dependsOn, note),
    `reuse[]`, `hypothesesSeen` and `breakingChanges.affectedConsumers`.
  - Iterations: `stage`, `approach`, `scope.broad`, `extra` and `read`,
    `completionEvidence`, `authorizations`, `result.gate`,
    `changedAssumptions` and `recommendation`.
  - Requirements: `consumer`, `forCapability` and `behavior`.
  - Requests: `requiredBehavior`, `forCapability`, `candidates` and the
    hypothesis stances.
- **Weaknesses.** A flat list in commit order. There is no grouping by
  state, module or capability, and no iteration timeline. The detail is a
  long vertical dump below the list.

### 3.5 Scenarios tab (`run-page.tsx:514-523`, `run-scenarios.tsx:187-229`)

- **Feed.** `getScenarios` → `scenarioListResponseSchema`
  (`runs.ts:971-1003`).
- **Fields.**
  - A state-count line: "N pending · N bound · N declared · N implemented",
    plus "(showing N of total)" (`:192-195`).
  - A table (`:196-226`): scenario id and name; a state badge and
    "by <implementedBy gate>"; origin text; belongs to (entry, work item,
    sub-scenario of, or integration of subs); owner and file; and gates, one
    line per gate: id, checkpoint, subject, mode, dry run, status, failure
    step and message, undefined steps.
- **Classification.** b (implemented), c (pending, bound, declared), d
  (failing or undefined steps). Level 2/3. A text table. Live.
- **Relations shown.** scenario→entry, scenario→work item,
  scenario→integration, scenario→owner module and file, scenario→gates
  (with status), scenario→implementedBy gate.
- **Not navigable.** Gate ids → Checks detail; work item → Work items;
  entry → Progress; partOf and subScenarios → other rows.
- **In the data but not shown.** `ScenarioGateResult.verdict` (the gate
  attempt's overall verdict; only the scenario's status is shown).
- **Weaknesses.** A wide table with many rows (500 max). There is no
  filtering by state, and the counts line is text only.

### 3.6 Checks tab (`run-page.tsx:527-587`)

- **Feed, list.** Derived client-side from events with transition
  `gate-attempted` or `readiness-passed`. The gate id comes from the
  event's gate ref (`:528,535`).
- **Feed, detail.** `getGate` → `gateResponseSchema` (`runs.ts:892-948`).

| Area | Fields | Q | L |
|---|---|---|---|
| List (`:532-544`) | A gate-id button and the event summary | b, d (summary text only) | 2 |
| Gate detail (`:550-587`) | `id: checkpoint, verdict`. Cause, next, repair round and infrastructure attempt. Attempt commit, audited commit, and audit evidence (runRef, reportCommit, treeRef). Guarded changes: path, deleted, authorized by id@rev or "not authorized". Per command: kind, outcome, notVerified, exit code and ms; argv; selection policy and resolved files; output bytes and path ("the last 8 KiB are shown"); the scenario check summary (`run-scenarios.tsx:232-255`: mode, dry run, selection, excluded, per-module run exits, untracked passed/skipped/failed, per-scenario status with file:line, failure and undefined steps, failure lines); **output tail `<pre>`** | b, d | 3/4 |

- Text. Live. The list grows with events.
- **Gaps in the list.** `readiness-failed` events carry no gate ref, so failed
  readiness attempts are not listed (`harness/src/projections/events.ts`,
  `readiness-failed` case). The list has no verdict badge, checkpoint or
  subject column; the summary text is all there is.
- **Not navigable.** Gate subject (work item or iteration): not shown in the
  detail at all, although `subject` is in `GateView` (`runs.ts:895`). Guarded
  change `authorizedBy` → decision; commits.
- **In the data but not shown.** `subject`, `head`, **`rules[]` with
  violations** (rule, path, detail), guarded change `before` and `after`
  content, command `cwd`, `startedAt`, `runnerError`,
  `selection.exactOwners`, `subtrees` and `extraSuites`, and
  `output.truncated`.

### 3.7 Progress tab, two views (`run-page.tsx:608-662`)

- **Feed.** Both views are marked with sessions from `getRunSessions`
  (`:615`). If that fails, the view shows "The sessions are not marked"
  (`:624`). Only the selected view is mounted. The view selector is local
  state.

#### 3.7.1 By module, the default (`capability-module-tree.tsx:317-419`)

- **Feed.** `getModuleCapabilities` → `moduleCapabilityComparisonResponseSchema`
  (`runs.ts:788-848`).
- **Fields.**
  - Header: the compared states (initial analysis architect view revision and
    input, or placeholder or none; the current module tree revision and input;
    run version; identity policy) (`:195-204,362-367`).
  - Coverage: "complete: X of Y capabilities implemented", or partial with
    known subtotals and gaps, or unavailable (`:206-225`).
  - A legend.
  - **Canvas.** Ramify's `ModuleTreeCanvas` (`:381-390`) draws one node per
    placed module:
    - Node color: green if any row is implemented here, blue if it has rows,
      grey otherwise (`:129`).
    - A dashed shell marks a module proposed and absent from the tree; a muted
      shell marks a module with no rows.
    - The node header shows the module leaf name, session marks and
      "proposed at start".
    - Each capability row shows its id, "Initial: <roles>" (outlined) and
      "Implemented" (filled).
    - Nodes collapse and expand.
  - Side panel:
    - Row detail: Initial associations (role and hypothesis id or entry
      assignment); Implemented reason and evidence; the element's sessions
      (`:233-262`).
    - Module detail: placement, proposal (parent, purpose, tags), a row list
      (clickable), sessions (`:270-299`).
    - Unplaced modules, listed (`:399-414`).
  - A run-level session strip (`session-marks.tsx:160-194`).
- **Classification.** b (implemented where), c (initial rows not yet
  implemented, which is readable visually), a (session marks: live roles),
  d (coverage partial, unavailable, unplaced). Level 1 (canvas), then 3
  (detail). Visual canvas plus text side panel. Live.
- **Entities.** Module, capability, hypothesis and session.
- **Relations shown.**
  - capability→module in two senses: initial association by role, and
    implemented-here.
  - module→parent (tree), module→proposal.
  - module/capability→sessions: live, suspended and interrupted marks, and
    the list on selection.
- **Links.** Session lines link to the transcript, and "awaiting
  <invocation>" links to its chapter (`session-marks.tsx:113-126`).
- **Not navigable.** The hypothesis id in the row detail → Hypotheses tab;
  capability → the Dependencies node, work items or scenarios; the evidence
  strings.
- **Not shown.** `initialView.coverageLimits`; tree module `dir`.
- **Weaknesses.** It needs the canvas's width, and it shows no
  todo/working/completed state of a capability (only Implemented or not).

#### 3.7.2 Dependencies (`capability-graph.tsx:291-531`)

- **Feed.** `getCapabilities` → `capabilityListResponseSchema`
  (`runs.ts:672-693`).
- **Fields.**
  - Header counts: todo, working and completed of the returned capabilities
    (`:307-311,353-362`).
  - Coverage warning: bounded "Showing N / total", and omitted dependency
    targets (`:314-331`).
  - A legend and the run-level session strip (`:373`).
  - **Graph.** Absolutely positioned nodes in "Depth N" columns (the longest
    dependency depth). Arrows go from consumer to dependency, dashed when
    tentative. Cycle groups are outlined with "Dependency cycle: no order
    among these" (`:381-410`).
  - Each node (`:411-436`) shows the capability id, "current owner" or
    "suggested owner", the owner path, badges (state, entry, "forecast
    only"), "N work items · N evidence", and session marks.
  - Detail on selection (`:469-531`): reason, owner, depends on (tentative,
    "not in this response"), depended on by, work items (buttons), evidence,
    "Acceptance scenarios X of Y implemented", and element sessions.
  - A collapsed text "Dependency list" and the cycles (`:443-464`).
- **Classification.** a (working, live marks), b (completed), c (todo,
  forecasts), d (cycles, omitted targets). Level 1 (graph), then 3 (detail).
  Visual. Live.
- **Relations shown.** capability→dependencies (confirmed or tentative),
  capability→dependents, capability→owner module, capability→work items,
  capability→evidence, capability→scenarios (count), capability→sessions.
- **Links.** A work item button switches to the Work items tab with the item
  selected (`:514-516`). Session links go to transcripts.
- **Not navigable.** Dependency and dependent ids (they cannot select that
  node from the detail); owner module → By module; the scenarios count → the
  Scenarios tab filtered; evidence → gates.

### 3.8 Sessions tab (`run-page.tsx:670-681`, `session-timeline.tsx:274-458`)

- **Feed.** `getRunSessions` → `runSessionsResponseSchema`
  (`sessions.ts:213-244`).
- **Fields.**
  - **Timeline (`:300-395`).** One lane per session in the order opened.
    - The lane label: a session id link, a state badge and the role
      (`:361-365`).
    - Invocation segments are links to the chapter, with outcome-colored
      classes, "!" for a degraded start, and an open segment reaching "now"
      (`:366-383`).
    - A suspension gap line; brief-append marks linking to the append point
      (`:384-390`).
    - Fork, replace and request links between lanes (`:342-345`).
    - The x-axis is run-event sequences, not time (`:349-353`).
  - Coverage: bounded "Showing N / total", and relations whose source is
    missing (`:286-298`).
  - A legend (`:312-321`).
  - **Session list** (collapsed `<details>`, `:396-401,411-458`), per
    session:
    - an id and role link, the state and the finish reason, and
      `reachText(reaches)` (work item, capability, module, or request);
    - relations: forked from a point, in place of, replaced by, requested
      by, requested, forked into;
    - per chapter: start text, end text, events range, and a degraded
      warning;
    - suspensions and appends.
- **Classification.** a (live, awaited, "now"), b (history), d (degraded
  starts, interrupted, unplaced relations). Level 1 (timeline) and 2/3
  (list). Visual plus text. Live.
- **Entities.** Session, invocation (chapter), append (brief), suspension
  and point.
- **Relations shown.** session→invocations, session→fork source point,
  session→replaces and replacedBy, session→requestedBy invocation,
  session→requested and forks, and session→reaches (text only in the list).
- **Links.** Many; see the cross-link list.
- **Not navigable.** `reaches` (work item, capability, module, request) →
  run tabs. `session.work` (work item, iteration, request) is not shown in
  the timeline at all. Invocation evaluation is not shown here (only in the
  transcript chapter). Executor and model are not shown.
- **Weaknesses.** The x-axis is event order, not time. With many sessions the
  lanes get long both horizontally and vertically, and the list is hidden in
  `<details>`.

### 3.9 Measurements tab (`run-page.tsx:685-736`)

- **Feed.** `getMetrics` → `metricsResponseSchema` (`runs.ts:1102-1124`).

| Area | Fields | Q | L |
|---|---|---|---|
| What was guarded (`:692-700`) | The guarding statement (warning styled when incomplete), guarded and unguarded tools, verdict counts (allowed, blocked by scope, blocked unresolved). "Changed outside a write scope": path by invocation (role, iteration) | d, b | 2 |
| Metrics (`:701-708`) | KPI policy, measurement policy, baseline B (bytes and snapshot, or unavailable with its reason). A table: id and unit, state, value (or known subtotal), numerator, denominator, coverage, note, and evidence in `<details>` | b | 2/3 |
| Lineage (`:709-716`) | Lineage policy and an explanation. A table with the same columns | b, d (degraded) | 2/3 |

- A text table. Live (refetched per version).
- **Not navigable.** The outside-scope `invocation` → its transcript chapter;
  `workItem` (not shown) → Work items.
- **In the data but not shown.**
  - `evaluation.invocations[]`, the per-invocation evaluation list. It is
    only reachable one at a time through transcript chapters; there is no
    table of all invocations.
  - Per-metric `policyVersion` and `measurementPolicy`.
  - `baseline.subtotal` when unavailable.
- **Weaknesses.** Pure tables with no visualization or trend. The metric
  ids need domain knowledge.

---

## 4. Sessions page (`#/sessions`, `subs/web/src/sessions-page.tsx`)

- **Reached by.** The "Sessions" nav link, "All sessions" on a transcript
  page, and "← Sessions" on a standalone transcript.
- **Feed.** `listSessions(offset)` → `sessionListResponseSchema`
  (`sessions.ts:90-137`).
- **Fields.**
  - A Refresh button and "N sessions; a–b shown".
  - Unserved sources (path, source, message) as a warning (`:63-68`).
  - Two groups, "Live and suspended" and "Finished and interrupted"
    (`:76-77`). Per session (`:21-45`):
    - a session id and role link, a state badge, a degraded-starts badge
      with its explanation (`run-labels.tsx:62-66`), and the finish reason;
    - "Run <runId> of <planId>" or "Standalone session", then the work item,
      iteration and request, and reachText;
    - executor and model, invocation count, started and changed timestamps.
  - A pager at 200 per page (`:107-112`).
- **Classification.** a (live and suspended first), b (finished), d
  (degraded, interrupted, unserved). Level 2. Text. Live: polled every 5 s
  while something is live.
- **Entities.** Session, run, plan, work item, iteration, request,
  capability and module (via reaches).
- **Links.** The session → its transcript; the run id → the Run page
  (`:34`).
- **Not navigable.** The plan id → the Plan page (text only); work item,
  iteration, request, capability and module → the Run tabs. There is no
  filter by run, plan or role.
- **Weaknesses.** A long vertical list across all runs, with no grouping by
  run or plan.

---

## 5. Session transcript page (`subs/web/src/session-page.tsx`, `transcript.tsx`, `evaluation.tsx`)

- **Routes.** `#/plans/<id>/runs/<run>/sessions/<ses>` or
  `#/sessions/standalone/<ses>`, optionally with `/chapters/<inv>`,
  `/points/<inv>` or `/appends/<seq>`. The anchor scrolls to and focuses
  that place (`session-page.tsx:302-315`).
- **Reached by.** The Sessions page; Run Overview degraded notice; Progress
  session marks and strips; the Sessions timeline (lanes, segments, marks,
  list); and in-transcript lineage links.
- **Feeds.**
  - Run session: `getRunSessions` (the session and its siblings), then
    `getTranscript` pages (`sessionTranscriptResponseSchema`,
    `sessions.ts:252-279`), then `pollSessions`
    (`sessionUpdatesResponseSchema`, `sessions.ts:292-298`) every 1 s.
  - Standalone session: `getStandaloneSession`
    (`standaloneSessionResponseSchema`, `sessions.ts:325-337`) plus
    transcript pages, not followed.
  - Bodies come from `getBody` (blob or file) on first expansion
    (`transcript.tsx:43-60,87-123`).

| Area | Fields | Q | L |
|---|---|---|---|
| Page links and header (`:317-330`) | "← The run" or "← Sessions", "All sessions", `Session <id>` with a state badge, "Of run X of plan Y" (text) | — | — |
| Following line (`:331-338`) | "The session is live: the harness awaits one of its invocations / suspended / finished (reason) / interrupted". "Following its transcript as it grows" or "complete as read". "It became X while this page was open" | a, d | 1/2 |
| Degraded starts notice (`:135-154`) | A count and explanation; per item a "Chapter N: inv" link, requested versus actual, reason | d | 2 |
| Session facts (`:79-129`) | **Run session**: role, work (work item, iteration, request), reaches, executor and model, opened and last change (time and event), awaiting, finished because, latest point (link), lineage (fork point link, replaces, replaced by, requested by chapter link, requested, forks). **Standalone session**: role, reaches, executor and model, started, last change, outcome (ended, interruption, error, finishedAt), prompt | a, b | 3 |
| Transcript missing or unreadable (`:342-348`) | Warnings | d | — |
| Chapters (`:190-232`) | "Chapter N: inv", with an outcome, "awaited" or "not ended" badge. **StartRelation**: continued from a point (link) because of the reason plus briefs; forked from a point; opened in place of a session (link); requested by; opened fresh; requested mode; a degraded warning (`:157-188`). **Moments**: started and ended time and event, kept or finished, end point link. **EvaluationFacts** (`evaluation.tsx:34-54`): guarding complete or partial plus outside-scope paths, hook checks passed/findings/not checked, reads outside the scope, lines +a −d (coverage), tokens in/cache read/cache write/out, coverage gaps. The entries follow | b, d | 3 |
| "Between invocations" sections (`:356-359`) | Harness entries with no invocation | b | 3 |
| Transcript entries (`transcript.tsx:338-532`) | The number and time per entry. **started**: invocation, role, start, requested, executor, model; system prompt and prompt collapsed. **user** text. **assistant**: text (open if 2000 characters or less, inline), thinking (collapsed, with a visibility badge, or "redacted"), tool call (action text: read path and range, search pattern, path and glob, write paths, command, harness or other tool; status answered, running or no result; JSON input collapsed); message detail (tokens, model, thinking level, stop reason, reasoning tokens, cost, cache writes, "not reported: …", error). **tool-result**: "Result of <action>", an error badge, output or file (a `FileView` with line numbers and range), "Complete output" collapsed. **harness decisions**: guard denied (tool, verdict, requested, reason, what the agent was told), submission verdict, post-write or completion check (per check: outcome, mode, paths, new findings, reason, log), read reminder, brief appended (decision, generation, outcome, brief), note appended, context budget reached (tokens, threshold, report delivered). **compaction** started or ended (reason, tokens before→after, aborted, error). **retry** started or ended. **point** ("a later start may continue or fork from here", forked-from-here session links, continued-from-here invocations). **ended** (outcome, actual start mode and degraded reason, interruption, error) | b (history), a (the latest entries while live), d (errors, guard denials, findings, budget, retries) | 4 |
| New-entries button (`:362-366`) | "N new entries below" when the reader has scrolled up; it sticks to the bottom otherwise | a | — |

- Mostly text with collapsible disclosures. Live for run sessions.
- **Entities.** Session, invocation, point, append and brief, tool call and
  result, harness decision, evaluation, and the file read.
- **Relations shown.** session→run and plan (text), session→work and reaches
  (text), session→lineage (links), invocation→continues point (link),
  point→forks (links), call→result.
- **Not navigable.**
  - The plan and run in "Of run X of plan Y" (only the "← The run" link
    exists; there is no plan link).
  - `work.workItem`, `iteration` and `request` → Run tabs; reaches
    capability and module → Progress.
  - Continuations from a point (invocation ids as text, not chapter links,
    `transcript.tsx:477`).
  - A guard-denied or post-write check → the gate or scope decision; a
    "brief appended" decision id → the Decisions card; the `requestedBy`
    invocation in StartRelation (text, `session-page.tsx:177`).
- **In the data but not shown.**
  - Evaluation: `role`, `workItem`, `iteration`, `request`, `ended`,
    `writer`, `guarding.guarded`, `unguarded`, `verdicts` and `statement`,
    `hookChecks.newFindings`, and `lines.paths` and `lines.gaps`.
  - `started.work`; the transcript page `partial` flag; guard-denied
    `callId`.
- **Weaknesses.** Very long vertical scroll. There is no chapter table of
  contents or outline, no search, and no filter by entry type (for example,
  only errors or harness decisions).

---

## 6. Components not mounted by any page

- **`subs/web/src/module-tree.tsx:41-114` (`ModuleTree`).** It draws "touched"
  modules with heavy, light or exposure-only weights on the project tree,
  with proposed modules and a missing list. It is **not imported by any page**
  (grep finds no importer; the README describes it as available to "whatever
  draws on the tree"). It would need `getModuleTree`, which is also not
  called by any page.
- **`subs/web/src/examples/*`.** Dev-only previews through
  `?example=capability-module` or `?example=capability-graph`
  (`main.tsx:9-17`).

---

## 7. Commands the UI offers

| Command | Where | Protocol | Conditions and behaviour |
|---|---|---|---|
| **Start a run** | Plan page, "Implementation runs" header (`plan-page.tsx:63-66`), with a "Stop for review after the analysis" checkbox (`:67-70`) | `start-run`, `{planId, agent, reviewStop}`, expectedVersion 0 (`plan-page.tsx:48-50`; `runs.ts:49-54`) | Disabled when no agent is configured, when a run of *this plan* is running, or while sending (`:63`). On success, navigates to the new Run page; on refusal, shows "The start was refused: …" and reloads the list |
| **Stop** | Run page, Overview → State panel header (`run-page.tsx:128-132`) | `stop-job`, `{planId, jobId}` at `run.version` (`run-page.tsx:115`; `jobs.ts` stopJobCommandSchema) | Shown only while running. Disabled once `stopRequested` or sent ("Stopping…"). Shows a refusal message |
| **Approve** | Run page, in two places: Overview → Review panel (`run-scenarios.tsx:95`) and Plan and entries → Review of the scenarios (`run-page.tsx:311`) | `approve-analysis`, `{planId, jobId, reviewer, note?}` at `run.version`. On a `stale-version` refusal it resends once at `currentVersion` (`run-scenarios.tsx:44-61`) | Offered when `canApprove` (`run-scenarios.tsx:16-20`): not reviewed and no stop requested, and either completed, or running with phase not analysis and not final-verification. The form has a reviewer (required, 200 max) and a note (4000 max). On success it refreshes the run |

Other controls, none of which writes: Refresh on the Plans and Sessions
pages; tabs; the Progress view switch; node, row and gate selection; the
transcript disclosures; "Try again" on a body load; the pager.

---

## 8. Summary table: page × area

| Page | Area | Q: a now | b done | c left | d issues | L | Visual/Text | Live? (how) | Feed (query) |
|---|---|---|---|---|---|---|---|---|---|
| Shell | Connection status | x | | | x | 1 | visual dot + text | live (5 s probe) | getProject |
| Plans | Plan list | | x | | x (unreadable) | 2 | text | static + Refresh | listPlans |
| Plan | Header + plan text | | | x | | 4 | text (MD) | static | getPlan |
| Plan | Implementation runs | x (badge) | x | | x (notice count, unserved, refusal) | 2 | text + badge | static (loaded once) | listRuns |
| Run | Header / connection line | x | | | x | 1 | text | live (1 s events poll) | getEvents |
| Run › Overview | Notices | | x | | x | 3 | text + badge | live | RunSnapshot.notices (+getRunSessions) |
| Run › Overview | State | x | x | x (implicit) | x (writer, stop) | 2 | text dl | live | RunSnapshot |
| Run › Overview | Current work | x | | | | 2 | text (one line) | live | RunSnapshot.current |
| Run › Overview | Waits | x | | x | x | 2 | text | live | RunSnapshot.waits |
| Run › Overview | Counts | | x | x | | 2 | text | live | RunSnapshot.counts |
| Run › Overview | Failure | | | | x | 3 | text alert | live | RunSnapshot.failure |
| Run › Overview | Review (+Approve) | x | x | x | x | 2 | text + form | live | RunSnapshot.review/phase |
| Run › Overview | Event feed | x | x | | (colour only for job end) | 2–3 | text | live (append) | getEvents |
| Run › Plan & entries | Entry assignments | | x | x | | 2 | table | per version | getAnalysis |
| Run › Plan & entries | Scenario review (+Approve) | | x | x | x (warnings) | 3–4 | text + Gherkin | per version | getAnalysis |
| Run › Plan & entries | Captured plan | | x | | | 4 | text (collapsed) | per version | getAnalysis |
| Run › Hyp. & decisions | Hypotheses (forecasts) | | x | x | | 3 | cards | per version | getAnalysis |
| Run › Hyp. & decisions | Decisions | | x | | | 3 | cards | per version | getDecisions |
| Run › Work items | List | x | x | x | x (waits) | 2 | text list | per version | getWorkItems |
| Run › Work items | Detail | | x | x | x (outside scope) | 3 | text | per version | getWorkItem |
| Run › Scenarios | Table + state counts | | x | x | x | 2–3 | table | per version | getScenarios |
| Run › Checks | Gate attempt list | | x | | x (summary text) | 2 | text | live (from events) | getEvents (derived) |
| Run › Checks | Gate detail + tails | | x | | x | 3–4 | text + pre | per version | getGate |
| Run › Progress | By module | x (marks) | x | x (visually) | x (coverage/unplaced) | 1→3 | canvas + side panel | per version | getModuleCapabilities + getRunSessions |
| Run › Progress | Dependencies | x (working, marks) | x | x (todo/forecast) | x (cycles, omitted) | 1→3 | graph + detail | per version | getCapabilities + getRunSessions |
| Run › Progress | Session marks / run-level strip | x | | | x (interrupted) | 1–2 | chips | per version | getRunSessions |
| Run › Sessions | Timeline | x | x | | x (degraded) | 1 | SVG lanes | per version | getRunSessions |
| Run › Sessions | Session list | x | x | | x | 2–3 | text (collapsed) | per version | getRunSessions |
| Run › Measurements | Guarding / outside scope | | x | | x | 2 | text | per version | getMetrics |
| Run › Measurements | KPI + lineage tables | | x | | x (partial/unavailable) | 2–3 | tables | per version | getMetrics |
| Sessions | Session list | x | x | | x (degraded, unserved) | 2 | text | live (5 s while active) | listSessions |
| Transcript | Following line / state | x | | | x | 1–2 | text | live (1 s poll, run only) | getRunSessions/pollSessions |
| Transcript | Degraded starts notice | | | | x | 2 | text | live | RunSessionView |
| Transcript | Session facts / lineage | x | x | | | 3 | text dl | live | RunSessionView / StandaloneSessionResponse |
| Transcript | Chapter header + evaluation | | x | | x | 3 | text dl | live | SessionInvocation.evaluation |
| Transcript | Transcript blocks | x (latest) | x | | x | 4 | text, collapsible | live (append) | getTranscript/pollSessions/getBody |
| (unmounted) | ModuleTree (touched modules) | — | — | — | — | 1 | tree | — | getModuleTree (unused) |

The "c left" column is weak everywhere. No area states "what remains"
directly; it has to be inferred from todo, yielded, pending and forecast
states and from counts.

---

## 9. Cross-entity links that exist in the UI today

The first group is hash links or in-page navigation.

1. The header brand and nav go to the Plans list and the Sessions page
   (`app.tsx:38-43`).
2. On the Plans list, a plan title goes to the Plan page
   (`plans-page.tsx:44`).
3. On the Plan page, "← All plans" goes to the Plans list
   (`plan-page.tsx:19`).
4. On the Plan page, a run jobId goes to the Run page (`plan-page.tsx:80`).
   After Start, the page auto-navigates to the new Run page
   (`plan-page.tsx:52`).
5. On the Run page, "← The plan" goes to the Plan page
   (`run-page.tsx:71`).
6. In the Overview, a degraded-start item (session and invocation) goes to
   its transcript chapter (`run-page.tsx:233`).
7. In Progress → Dependencies, the capability detail's work item button
   switches to the Work items tab with that item selected
   (`capability-graph.tsx:514-516`, `run-page.tsx:95`). This is the only
   cross-tab jump.
8. In both Progress views, element and run-level session lines go to the
   session transcript. "awaiting <inv>" goes to that chapter
   (`session-marks.tsx:117-120`).
9. In the Sessions tab timeline, a lane label goes to the session, a segment
   to its chapter, and a brief mark to the append point
   (`session-timeline.tsx:362,376,387`).
10. In the Sessions tab list (`session-timeline.tsx:411-458`):
    - the session goes to its transcript;
    - "forked from" goes to the source point, and "in place of" and
      "replaced by" go to those sessions;
    - "requested by" goes to the requester's chapter, and "requested" and
      "forked into" go to those sessions;
    - "Chapter N" goes to the chapter, and an append goes to its point.
11. On the Sessions page, a session goes to its transcript, and "Run <id>"
    goes to the Run page (`sessions-page.tsx:27,34`).
12. On the Transcript page, "← The run" goes to the Run page (Overview),
    "← Sessions" to the Sessions page, and "All sessions" to the Sessions
    page (`session-page.tsx:317-325`).
13. In the Transcript degraded notice, "Chapter N" goes to the chapter
    (`session-page.tsx:148`).
14. In the Transcript session facts:
    - the fork point, the latest point and "replaces" or "replaced by" go to
      that session or point;
    - "requested by" goes to the requester's chapter, and "requested" and
      "forks" go to those sessions (`session-page.tsx:102-125`).
15. In a Transcript chapter start relation, "continued from" or "forked
    from" goes to the point, "in place of" goes to the session, and the
    chapter's end point goes to its point (`session-page.tsx:169-176,220`).
16. On a Transcript point entry, "forked from here" goes to those sessions
    (`transcript.tsx:476`).

The rest are selections within one area: work item list → detail, gate list
→ gate detail, capability node → detail, module row or shell → detail, the
module detail's capability button → row detail, and unplaced module → detail.

---

## 10. Relations present in answers but not navigable

These are either shown as plain text or not shown at all.

**Run snapshot (`runs.ts:222-264`)**

- `current.invocation`, `current.workItem`, `current.iteration` and
  `current.request` → transcript chapter or Work items. Text only.
- `writer.held` and `writer.unsettled` (invocations) → transcript chapter.
  Text only.
- `waits[].workItem` and `waits[].requirements` → Work items. Not shown; only
  the reason is.
- Module notices: `iteration`, `commit` and `decision` → the iteration,
  commit or placement decision. The decision is not shown at all.
- Cycle notices: `cycle[]` (capabilities) and `closedBy` (work item) →
  Progress or Work items. Text.
- `failure.evidence[]` → gate, work item or file. Text.

**Events (`runs.ts:304-311`)**

- `refs[]` of every kind (work-item, iteration, invocation, gate, decision,
  request, contract, obligation, requirement, capability, commit, scenario,
  session). None is rendered or linked; only Checks reads the gate refs.

**Analysis (`runs.ts:449-464`)**

- Entry `workItem`, `capability` and `owner` → Work items or Progress. Text.
- Scenario `entry`, `partOf` and `subScenarios` → the Scenarios tab row
  (state and gates).
- Hypothesis `decisions[]`, `supersededBy`, `confirmedBy` (not shown),
  `dependsOn` (not shown), `anticipatedConsumers` (not shown), `capability`
  and `suggestedOwner`.

**Decisions (`runs.ts:477-541`)**

- `workItem`, `revises`, `hypotheses[]` → Hypotheses, `request` (not shown),
  and `registry` (not shown).
- Contract `establishedBy.iteration` and `establishedBy.gate`, and
  `decision`. Scope `iteration`.

**Work items (`runs.ts:555-660`)**

- `module`, `capability`, `follows`, `startedFor` (not shown),
  `currentIteration` (not shown), `completedBy` gate (not shown), and
  `waitingFor` requirements.
- Iteration `gates[]` → Checks gate detail, and iteration `invocations[]` →
  transcript chapters. This is the key missing drill-down from work to the
  agent's session.
- `result.gate` (not shown) and `result.commit`; outline `invocation` (not
  shown).
- Requirement `obligation`, `consumer` and `forCapability` (the last two not
  shown); request `decision` → the Decisions card; request `forCapability`
  and `candidates` (not shown).

**Capabilities (`runs.ts:672-686`)**

- `dependsOn[]` and dependents → select that node (text only in the detail).
- `owner` → the By module view; `evidence[]` → gates; `scenarios` count →
  Scenarios.

**Module comparison (`runs.ts:788-848`)**

- Row `initial[].hypothesis` → Hypotheses; `implementedHere.evidence` →
  gates; the capability → the Dependencies node, work items or scenarios.

**Scenarios (`runs.ts:971-992`)**

- `workItem`, `entry`, `partOf`, `subScenarios`, `implementedBy` gate, and
  `gates[].gate` → Checks. `gates[].verdict` is not shown.

**Gate (`runs.ts:892-944`)**

- `subject.workItem` and `subject.iteration`: not shown at all.
- `guardedChanges[].authorizedBy` → the decision or iteration authorization;
  `rules[]` and violations: not shown.

**Metrics (`runs.ts:1102-1124`)**

- `evaluation.outsideScope[].invocation` → chapter, and `.workItem` (not
  shown).
- `evaluation.invocations[]`, the per-invocation evaluation table: not shown
  on the Run page.

**Sessions (`sessions.ts`)**

- `reaches` (work item, capability, module, request) and `work` (work item,
  iteration, request) → Run tabs, on the timeline list, the Sessions page and
  the transcript facts. Text only.
- `ref.planId` → the Plan page: text on both the Sessions page and the
  transcript.
- The continuation from a point → the continuing chapter
  (`transcript.tsx:477`, text).
- The `requestedBy` invocation in the chapter StartRelation → the chapter
  (`session-page.tsx:177`, text).
- Brief-appended `decision` → the Decisions card. Guard-denied and post-write
  checks → gate or scope.

**Module tree (`evidence.ts:89-99`)**

- `getModuleTree` and the `ModuleTree` component exist but no page uses them.

**Run tabs themselves**

- Tabs and selections are not in the URL, so no external link can open a
  particular work item, gate, capability or scenario. Every "← The run" link
  lands on the Overview.
