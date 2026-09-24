# Plan execution dashboard: what we already have

Status: inventory, 2026-09-23, against `ramify-agent` at `7d6af7f`. It is the
input for a design of a plan execution dashboard: one place that shows, at a
glance, what is happening now, what has been done, what is left to do and
which issues arose, and from which the user drills down to capabilities,
scenarios, modules, sessions and tests, and finally to a session's
transcript.

This overview classifies what the web client already shows, what the
harness records and publishes, how the elements relate and at which level of
detail each appears. Three detailed inventories back it, with source
citations:

- [inventory-web.md](inventory-web.md): every page and area of the web
  client, the answer that feeds it, its links, and the relations its answers
  carry but do not make navigable.
- [inventory-model.md](inventory-model.md): the harness's information model:
  27 entities, 59 relations with an ER diagram, 49 event types, the
  timelines and "now" and "left to do" that can be derived, about 40 kinds of
  issue, and what is recorded but not exposed or not recorded at all.
- [inventory-diagrams.md](inventory-diagrams.md): the two capability
  progress diagrams, the session timeline and markers, the unused module
  tree, planned views and the measurements a dashboard could show.

Two later research documents add
[cross-module interfaces](research-interfaces.md) and
[gates, checks and test runs](research-tests.md). The
[catalog of elements and relationships](../2026-09-24-dashboard-elements-and-relationships.md)
brings all of them together.

The design built on this inventory is the
[design proposal](design-proposal.md), with a static [mockup](mockup.html)
of a real finished run and an invented large live run.

Evidence: the real pi run `20260923T164537Z-dbf0c2` of the fixture plan
`status-badge-tone` (1 work item, 3 sessions, 4 invocations, 4 gates,
2 scenarios, 12 minutes), served from a copy with `ramify-agent serve`. The
[screenshots](screens/README.md) (31, at 1440×900) and the captured
protocol answers in [api-examples/](api-examples/) come from it. A small
run makes some views look sparser than a long one would; the diagrams'
limits at scale are recorded in the diagram inventory.

## 1. The four questions, and where each is answered today

| Question | Answered today by | How well |
|---|---|---|
| **What is happening now** | Run › Overview State and current work (one text line), waits, connection dot; session marks (live, suspended, interrupted) on both Progress diagrams; `working` capabilities in Dependencies; the live transcript; the Sessions page's live group | Scattered over four tabs and two pages. `current` covers only agent invocations: a running gate, materialization or view refresh is invisible, and a readiness gate has no start event. The Plan page's run list never refreshes. |
| **What has been done** | Event feed; Work items (completed, iterations with commits); Checks (gate attempts); Scenarios (implemented, by which gate); Implemented marks in By module; completed nodes in Dependencies; Sessions timeline; Measurements | Well recorded but spread over nine tabs, mostly as text. The event feed carries typed references and shows only its summary sentence. |
| **What is left to do** | `todo` capabilities in Dependencies; forecast-only boxes; scenario counts (pending, bound, declared); work-item states; counts in State | No area states it. It must be inferred. It is overstated: a completed run still shows two `todo` capabilities (a tentative forecast and a reuse registration), because no retired or not-needed state exists. The queue grows during a run, and its order and limits are not exposed. |
| **Which issues arose** | Overview Notices (modules created or removed, cycles, degraded starts); Failure panel; gate summaries and detail; scenario gate statuses; Measurements (guarding, outside-scope writes, coverage gaps); transcript entries (guard denials, budget reached, retries) | About 40 kinds of issue are recorded ([model §4](inventory-model.md#4-issues-every-problem-or-warning-the-model-records)). Only notices and the failure are gathered in one place. Repairs, refused completions, withdrawn scenarios, excursions and context overflows are found only by opening the right record. |

## 2. What each page shows, by question and level of detail

Levels: **1** at a glance or visual, **2** summary list, **3** detailed
record, **4** raw (transcripts, output tails, file contents). Questions:
**now**, **done**, **left**, **issues**.

| Page › area | Level | Now | Done | Left | Issues | Visual? | Updates |
|---|---|---|---|---|---|---|---|
| Header connection dot | 1 | ● | | | ● | dot | 5 s probe |
| Plans list | 2 | | ● | | ● | text | Refresh button |
| Plan page: runs, plan text | 2 / 4 | ● | ● | ● | ● | text, pill | loaded once |
| Run › Overview: notices, state, waits, failure, review | 2–3 | ● | ● | ○ | ● | text | 1 s event poll |
| Run › Overview: event feed | 2–3 | ● | ● | | ○ | text | appended |
| Run › Plan and entries: entries, scenario review, plan | 2–4 | | ● | ● | ● | table, Gherkin | per run version |
| Run › Hypotheses and decisions | 3 | | ● | ● | | cards | per version |
| Run › Work items: list, detail | 2–3 | ● | ● | ● | ○ | text | per version |
| Run › Scenarios | 2–3 | | ● | ● | ● | table | per version |
| Run › Checks: gate list, gate detail with tails | 2–4 | | ● | | ● | text, pre | per version |
| Run › Progress › By module | 1→3 | ○ | ● | ○ | ○ | canvas | per version |
| Run › Progress › Dependencies | 1→3 | ● | ● | ● | ○ | graph | per version |
| Run › Sessions: timeline, list | 1–3 | ● | ● | | ○ | SVG lanes | per version |
| Run › Measurements | 2–3 | | ● | | ● | tables | per version |
| Sessions page | 2 | ● | ● | | ○ | text | 5 s while live |
| Session transcript: facts, chapters, evaluation, entries | 3–4 | ● | ● | | ● | text | 1 s poll |

● answers the question; ○ answers it partially or only implicitly. The
complete table, with the answer behind each area, is
[inventory-web.md §8](inventory-web.md#8-summary-table-page--area).

Two observations follow from the table. Only three areas are visual, and all
three are buried in tabs of the Run page. And the only overview there is,
Run › Overview, is a stack of text panels that says nothing about progress
through the plan.

## 3. The elements and their relations

### 3.1 The elements a dashboard must relate

| Element | Kinds and states | ID | Detail (model §) |
|---|---|---|---|
| Plan | readable; its Gherkin blocks are plan scenarios `ps-NN` | slug | [1.2](inventory-model.md#12-plan-and-plan-entry) |
| Run | running, completed, failed, stopped, interrupted; phases `analysis`, `awaiting-review`, `readiness`, `working`, `final-verification`, `ended` | `20260923T164537Z-dbf0c2` | [1.3](inventory-model.md#13-run-job) |
| Top-level capability | the plan's entries; each has one work item and its scenarios | slug | [1.4](inventory-model.md#14-capability-entry-and-lower-level-registered-and-forecast) |
| Lower-level capability | registered by placement decisions, or forecast by a hypothesis (tentative); `todo`, `working`, `completed`; depends on others | slug | [1.4](inventory-model.md#14-capability-entry-and-lower-level-registered-and-forecast), [1.5](inventory-model.md#15-hypothesis) |
| Scenario | entry or integration scenario with sub-scenarios; `pending`, `bound`, `declared`, `implemented`; quick and full mode | `sc-NNN` | [1.18](inventory-model.md#118-scenario-plan-scenario-architect-scenario-tracked-scenario) |
| Module | declared, proposed, created or removed during the run, unplaced | path | [1.8](inventory-model.md#18-module-declared-proposed-created-removed) |
| Work item | `todo`, `working`, `yielded` (waiting for a requirement), `completed`; entry, delegated, follow-up or integration | `wi-NNN` | [1.9](inventory-model.md#19-work-item) |
| Iteration | one engineer assignment with a write scope; accepted, partial, unsuitable, exhausted, superseded | `wi-NNN.iNN` | [1.10](inventory-model.md#110-iteration) |
| Session | roles: initial architect (whose session stays as the global architect context), global fork, local architect, engineer, contract engineer; standalone engineer; `live`, `suspended`, `finished`, `interrupted`; lineage fork, replaces, requested by | `ses-NNNN` | [1.11](inventory-model.md#111-session-every-role) |
| Invocation | one model call chain in a session; a transcript chapter | `inv-NNNN` | [1.12](inventory-model.md#112-invocation) |
| Gate attempt | readiness, iteration, work-item, final; verdict, cause, next (repair, retry, exhausted), repair round | `ga-NNNN` | [1.15](inventory-model.md#115-gate-and-gate-attempt) |
| Check (test) | `tests` (Vitest, exit code only), `type-check`, `ramify-check`, `conformance`, `scenarios` (Cucumber, per-scenario status) | step of a gate | [1.16](inventory-model.md#116-check-command-and-which-ones-are-tests) |
| Hypothesis, decision, placement request, contract | forecasts and their revisions; placement, scope, contract and plan decisions | slug or record ID, e.g. `ld-wi-001-01` | [1.5–1.7](inventory-model.md#15-hypothesis), [1.21](inventory-model.md#121-contracts-obligations-requirements-delegation) |
| Event, notice, failure | 49 event types; module and cycle notices; 15 failure reasons | sequence | [1.25–1.27](inventory-model.md#125-events-run-log) |

Tests exist only as gate steps. Per-test results of Vitest are never
recorded. Cucumber is the only runner whose results are structured, per
scenario and per gate.

### 3.2 How they relate

The relations among the elements the dashboard must connect, simplified from
the [full ER diagram](inventory-model.md#22-er-diagram). The work item and
its iterations connect everything else: capabilities to modules, scenarios to
gates, and sessions to the work they did.

```mermaid
flowchart LR
  Plan -->|entries| TopCap[Top-level capability]
  Plan -->|Gherkin blocks| Scn[Scenario]
  TopCap -->|depends on| LowCap[Lower-level capability]
  LowCap -->|depends on| LowCap
  Hyp[Hypothesis] -.->|forecasts| LowCap
  TopCap -->|owner| Mod[Module]
  LowCap -->|owner| Mod
  Scn -->|of entry| TopCap
  Scn -->|integration → sub| Scn
  Scn -->|feature file in| Mod
  TopCap -->|one| WI[Work item]
  LowCap -->|work items| WI
  Scn -->|assigned to| WI
  WI -->|scope| Mod
  WI -->|iterations| It[Iteration]
  It -->|gated by| Gate[Gate attempt]
  WI -->|work-item gate| Gate
  Gate -->|steps| Check[Check / test]
  Check -->|per-scenario result| Scn
  Gate -->|evidence of| LowCap
  It -->|worked by| Inv[Invocation]
  Ses[Session · role] -->|chapters| Inv
  Ses -->|reaches| WI
  Ses -->|lineage| Ses
  Inv -->|transcript chapter| Tx[Transcript]
```

### 3.3 Which relations the user can see and follow today

| Relation | In the answers | Shown | Navigable |
|---|---|---|---|
| Capability → module (owner, initial role) | yes | By module rows; Dependencies owner | selection within the view only |
| Capability → capability (depends on) | yes | Dependencies edges | select the other node; edges not selectable |
| Capability → work item | yes | Dependencies detail | **the only cross-tab link** (to Work items) |
| Capability → gate evidence | yes | gate IDs as text | no |
| Capability → scenarios | count only per entry | "N of M implemented" in Dependencies detail | no |
| Scenario → entry, work item, owner, feature file | yes | Scenarios table text | no |
| Scenario → gate results | yes | Scenarios table (status, not verdict) | no |
| Scenario → declaring invocation | event only | no | no |
| Work item → iterations → gates, invocations | yes | Work item detail, IDs as text | no |
| Gate → work item, iteration (subject) | yes | not shown | no |
| Session → invocations (chapters) | yes | timeline segments, list | yes, to chapters |
| Session → session (lineage) | yes | timeline links, list, transcript facts | yes |
| Session → work item, capability, module (reach) | yes | text on the list, Sessions page, transcript | no |
| Session marks on capabilities and modules | yes | chips on both diagrams | yes, to transcript |
| Event → any element (typed refs) | yes | summary sentence only | no |
| Notice → iteration, commit, decision, cycle members | yes | text | only degraded starts link to a chapter |
| Hypothesis → decisions, dependencies, consumers | yes | partly | no |

The session side is well linked; everything else is text. The run's tabs
and selections are not in the URL, so no link can open a particular work
item, gate, capability or scenario, and every link back to a run lands on
its Overview. [inventory-web.md §9–10](inventory-web.md#9-cross-entity-links-that-exist-in-the-ui-today)
lists every link and every relation that could be one.

### 3.4 What the two diagrams show

| | By module | Dependencies |
|---|---|---|
| Nodes | modules on the module-tree canvas (`ramify.ts/module-tree`), each listing its capability rows | capabilities, in columns of dependency depth |
| Edges | parent → child containment only | consumer → dependency; dashed when tentative; cycle groups |
| States | Initial (outlined, with role) and Implemented (filled green) per row; proposed modules dashed, empty ones muted | `todo`, `working`, `completed`; forecast-only dashed amber |
| Sessions | marks on nodes and rows; a run-level strip | the same |
| Scenarios | **no** | only a count in the detail panel |
| Work items, iterations, gates, tests | **no** | work item link and evidence text in the detail |
| Time | no | no |
| Known problems | illegible at fitted zoom; blue means "has an initial role" here and `working` in Dependencies | truncated titles; positions can move between polls; scroll only, no zoom |

The session timeline is a third diagram: one lane per session, invocation
segments, suspensions and lineage links, on an axis of event order rather
than time. The module tree of touched modules (`module-tree.tsx`) is built
and unused.

## 4. Chronology

- Every event has a sequence number and a time. The record files have no
  timestamps of their own; their times come from their events.
- Durations come from event pairs: invocation started and ended, gate
  committing and attempted, writer acquired and released, work item started
  and completed, review requested and approved. Readiness has no start event.
- Gate steps have `startedAt` and `elapsedMs`; transcript entries carry
  per-message times.
- The example run's timeline, reconstructed from its events, is in
  [inventory-model.md §3.3](inventory-model.md#33-building-timelines): 3 min
  of initial analysis, 9 s of readiness, 4 min of local architect planning,
  3 min of engineer work, then three gates of 8 to 10 s each.

No view has a time axis today. The event feed is chronological text, and the
session timeline orders by event.

## 5. The existing elements, in pictures

### Navigation pages

The Plans list and a Plan page: centred text lists, a status pill per run.

![Plans list](screens/01-plans-list.png)
![Plan page](screens/02-plan-page.png)

### The Run page overview

The Overview tab is the run's only summary: notices, a key/value State
list, the review form and the event feed in a 352 px scroll box. Nine tabs
lead to the rest; the chosen tab is not in the URL.

![Run page, top](screens/03-run-overview-top.png)
![Run overview, full](screens/04-run-overview-full.png)
![Event feed](screens/05-run-events-feed-end.png)

### Plan, entries, scenarios and forecasts

![Plan and entries with the scenario review](screens/06-run-plan-entries-scenario-review.png)
![Hypotheses and decisions](screens/07-run-hypotheses-decisions.png)
![Scenarios](screens/10-run-scenarios.png)

### Work and checks

A work item's detail names its iterations' gates and sessions as plain
text. The gate detail shows each check with its command and an 8 KiB tail,
including raw ANSI codes.

![Work items](screens/08-run-work-items.png)
![Work item detail](screens/09-run-work-item-detail.png)
![Checks](screens/11-run-checks.png)
![Final gate detail](screens/12-run-check-final-gate-detail.png)

### The capability diagrams

By module at its fitted zoom, a selected row, and the canvas zoomed until it
is legible:

![By module](screens/14-progress-by-module.png)
![By module, row selected](screens/15-progress-by-module-row-selected.png)
![By module, zoomed](screens/16-progress-by-module-canvas-zoomed.png)

Dependencies, and a selected capability with its detail:

![Dependencies](screens/17-progress-dependencies.png)
![Dependencies, capability selected](screens/18-progress-dependencies-selected-expanded.png)

### Sessions and transcripts

The session timeline, the Sessions page and a transcript, with a chapter's
evaluation and expanded blocks:

![Session timeline](screens/19-run-sessions-timeline.png)
![Session list](screens/20-run-sessions-list-expanded.png)
![Sessions page](screens/25-sessions-list.png)
![Transcript top](screens/26-transcript-top.png)
![Transcript chapter](screens/27-transcript-chapter-opened.png)
![Tool call and file read](screens/28-transcript-toolcall-file-read-expanded.png)
![Edit tool call](screens/31-transcript-edit-tool-call-expanded.png)

### Measurements

About 20 KPI families and the lineage measurements, as tables that wrap
mid-word in an 856 px column; the tab is 6,521 px tall.

![Measurements, top](screens/21-run-measurements-top.png)
![Lineage](screens/23-run-measurements-lineage.png)

The [screenshot index](screens/README.md) describes all 31 and the rendering
problems each shows. The example previews (`?example=capability-module`,
`?example=capability-graph`) exist only in the development server and were
not captured.

## 6. Gaps a dashboard design must address

### Presentation gaps (the data exists)

1. No single at-a-glance view. The Overview is text; the three visual views
   sit in two tabs.
2. "Left to do" is never stated, and inferring it from capability states
   overstates it.
3. Relations are shown as IDs in text. Only session lineage is navigable;
   the event references, the work item's gates and chapters, the gate's
   subject and the scenario's gates are not.
4. No deep links: tabs and selections are page state.
5. Scenarios appear in no diagram, and neither do work items, iterations,
   gates or tests.
6. No time axis anywhere.
7. Issues are scattered: notices and the failure are gathered, while repairs,
   refused completions, withdrawals, guard denials, excursions and budget
   returns are not.
8. Measurements are long tables; nothing sums tokens per work item,
   capability, role or session type.
9. Layout defects: the Run page is fixed at 856 px while Progress is full
   width; tables wrap mid-word; transcripts and file cards scroll inside
   scroll boxes.

### Data gaps (the protocol does not expose it)

1. The run's limits (repair rounds, iterations, invocations, run time), so
   no "round 2 of 3" or budget gauge.
2. A list of a run's gates; readiness and final gates are found only
   through event references.
3. A running gate, materialization or view refresh as "current"; readiness
   has no start event.
4. The event type on the wire (`transition` is free text).
5. The live context fill of an invocation, which is recorded only as
   observations.
6. The scheduler's queue order, so no "next up".
7. Full gate command output beyond the 8 KiB tail.

### Not recorded at all

1. Per-test results of Vitest.
2. A retired or not-needed state for forecasts and reuse registrations.
3. Cost totals; commit diffs and the run branch.
4. Progress of a plan across runs.
5. A heartbeat while a model is thinking.

[inventory-model.md §5](inventory-model.md#5-gaps) has the complete lists.

## 7. Planned views already on record

- Plan 4 plans token-efficiency and context-limit panels; it is blocked
  until Dan starts it.
- An iteration explorer (the stated home of gate attempts and check
  results), the rest of the session explorer (search, filters, streaming)
  and a findings lifecycle are captured without a plan.
- Retired forecasts are proposed in the
  [capability registry analysis](../2026-09-23-capability-registry-analysis.md).
- Open items: timeline zoom, a link from a scenario to its gate detail, and
  composition failures shown to the user.

Details and sources: [inventory-diagrams.md Part B](inventory-diagrams.md).
