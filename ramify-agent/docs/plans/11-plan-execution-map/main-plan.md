# Plan 11: Plan execution and modules maps

**Date:** 2026-09-24. **Status:** proposed for implementation. **Starting source:** `7d6af7f` plus the current, uncommitted [execution-map design](../../analysis/2026-09-24-plan-execution-decomposition-map.proposal.md).

The [design proposal](../../analysis/2026-09-24-plan-execution-decomposition-map.proposal.md) is the product specification for this plan. Its [element catalog](../../analysis/2026-09-24-dashboard-elements-and-relationships.md) marks facts as published, retained, joinable or unavailable. This plan supplies the missing projections and browser work. It does not change the autonomous implementation decisions or make the visualization a writer of run state.

## Runnable outcome

```text
Run page -> Execution map
  top-level capability A [working] -> named scenarios and their latest real results
    work item in full module path -> local architect lane
      assigned iteration 1 -> engineer session -> gate attempt [failed]
      assigned iteration 2 -> engineer session -> gate attempt [passed, audited]
        contract need [working] -> shared provider capability and work item
  top-level capability C [completed] -> its own scenarios and work

Companion modules map, visible beside the execution map
  full module path -> violet "worked in" mark -> captured +LOC / -LOC
  click either map -> directly related nodes highlighted in the other
  each map -> independent pan, zoom and fit

Click a capability -> its full recorded description
Click a scenario name -> its complete frozen Gherkin block
Click a session -> one movable, resizable live transcript window
Click another session -> a second window remains open and follows its own cursor
```

The run band shows initial architect sessions, integration work, readiness and final gates, and sessions or gates without a single entry root. The session shelf and gate list make **every** run session and gate attempt reachable, including finished sessions, failed attempts and records hidden by a collapsed branch. The map shows the current run version; it does not play back historical module trees.

## Scope and prerequisites

**In scope:** a versioned harness-owned execution-map projection and HTTP query; targeted complete capability and scenario detail; typed causal links and per-consumer requirement state; a run-wide gate/session census; a compact module hierarchy with captured writer-line subtotals; two linked, independently pannable and zoomable maps; detail, event and transcript navigation; multiple live transcript windows; browser and harness acceptance evidence.

**Out of scope:** changing the implementation scheduler, inferring agent intent from prose, historical tree playback, estimates of future iterations or completion time, net accepted-commit LOC, standalone sessions inside a plan run, deployment status, hover-driven highlighting, and a run-wide severity issue index or header total before the shared dashboard issues projection exists. The existing standalone session page remains available. This plan keeps the older Progress views until the new map is accepted; removal is a later decision.

Prerequisites before iteration 1:

1. Work from the `ramify-agent` project, preserving unrelated workspace edits. Plans 7, 9 and 10 provide audited gates, run sessions/transcripts and tracked scenarios in the current source. Record the actual starting commit and baseline results in this plan's future `results.md`; the design proposal itself is not executable evidence.
2. Refresh the generated `.ramify-architect/` view and each receiving module's `src/.ramify/` view when stale, then verify browser-safe protocol exposure. These views are generated, gitignored and never imported or edited. The harness owns records, projections and public contracts; `web` owns rendering and browser workspace state. Toolkit presentation changes, if needed, use `ramify.ts/module-tree`, never a relative toolkit import.
3. Run commands from `ramify-agent/`: focused Vitest cases, `npm run type-check`, `npm run check:self` and `npm run build:web` when web files change. If the packaged Ramify canvas changes, build and check the toolkit from `/ramify` first. Baseline failures remain named failures; an iteration does not claim them repaired merely because focused tests pass.

## Contracts to settle in iteration 1

| Contract | Required decision |
| --- | --- |
| Identity | One canonical card per run element. A key includes its kind and durable ID; capability identity uses the current exact-slug policy. A shared provider has references from its consumers, not duplicate cards. Module identity is the full declared-name path. |
| Snapshot and bounds | `execution-map/1` is a read-only, cursor-paged answer for one committed run version. Pages have bounded node/link arrays, stable ordering, `shown / total` coverage and an opaque next cursor. A page requested for an obsolete version returns an explicit stale-version result; the client restarts the snapshot instead of merging versions. All sessions and gates remain enumerable even when a page or existing list query is capped. |
| Graph | Nodes have typed IDs, current state and source refs. Links have a typed relation, endpoint IDs, provenance and event sequence where one exists. Missing endpoints are explicit unresolved references. The harness publishes the many-to-many graph; the web chooses one display parent and draws references and cycles. |
| Complete detail | The compact map carries scenario names, current result and capability summaries. Targeted capability and scenario queries return the full entry description or registered behavior and the frozen scenario `source[]`; existing work-item and gate queries remain the detail source. No transcript body goes into the index. |
| Module changes | Per-module `+LOC / -LOC` sums retained text-path `line-events/1` from settled writer invocations, including failed and repair attempts. It is labeled **captured writer changes**, with source invocation IDs, partial/unavailable coverage, unmapped paths and separate binary count. The snapshot method can miss edits even when capture is complete; the detail explains this. It is not net accepted change or a scope-based estimate. |
| Selection and viewports | Click and keyboard activation select. A main node can relate to several modules with consumer/provider roles. A module click highlights direct matches and gives a hidden-match count and jump list. Both map viewports pan and zoom independently; selecting may reveal a hidden target but does not synchronize zoom or pan continuously. |
| Gate and current activity | Publish an explicit audit lifecycle independent of the gate verdict, including not applicable, not started, passed, failed, incomplete and unavailable; `audited` alone is not an audit-result enum. An active gate has no verdict until its result is recorded; a settled gate has one. Publish or join exact current awaited-session and running-gate IDs at the same run version. No animation or ring claims a missing fact. |
| Visual semantics | Fix semantic status and participation tokens, five role icon/accent/label mappings, light/dark contrast and reduced-motion behavior before component work. Role styling remains distinct from the violet participation mark; icons and labels disambiguate hues that are necessarily close. |

The protocol belongs under `subs/harness/src/interfaces/protocol/`, the projection under `subs/harness/src/projections/`, and its HTTP route under `subs/harness/src/http/`. The web receives only exposed browser-safe contracts. Iteration 1 writes the exact Zod schema, query limits, role and link discriminants, cursor error semantics and a worked two-root fixture before any large renderer is built.

## UI reuse decisions

| Area | Reuse | Work that remains in this plan |
| --- | --- | --- |
| Execution canvas | Use [`@xyflow/react`](https://reactflow.dev/api-reference/react-flow) for the viewport, pan, zoom, fit, custom nodes and edges, keyboard-focusable nodes and selection. Declare it as a **direct** `ramify-agent` dependency when `web` imports it; the toolkit's transitive copy is not the agent's dependency contract. Align its installed version with the packaged module-tree canvas and verify the web build does not bundle incompatible React Flow copies. | Turn the typed execution projection into cards, lanes, sequence and reference edges. Keep the tree-and-iteration layout, stable positions across version updates, reveal behavior and cross-map selection in web-owned code. React Flow [does not supply graph layout](https://reactflow.dev/learn/layouting/layouting). Evaluate `dagre` or `elkjs` against the representative two-root/provider/sequence fixture only if the local layout becomes a measured obstacle; do not add a layout dependency in advance. |
| Companion modules canvas | Reuse the packaged `ramify.ts/module-tree` component and its existing pan, zoom, fit and hierarchy behavior. | Supply compact nodes, line totals, direct involvement and cross-highlights; extend only the packaged highlight API if needed. |
| Floating transcript geometry | Try [`react-rnd`](https://github.com/bokuweb/react-rnd/blob/master/README.md) for controlled position and size, header-only dragging, resize handles and pointer bounds. Its current package [declares React and React DOM peers from 16.3 onward](https://github.com/bokuweb/react-rnd/blob/master/package.json), which admits the agent's React 19 version but is not browser compatibility evidence. Add it as a pinned direct dependency only after an actual React 19 browser spike proves drag, resize, text selection and embedded transcript controls work together. Mount windows outside either zoomed map. | Own the window registry, stacking, open/raise/close, minimize/maximize, keyboard move/resize and reset, focus restoration, viewport-change clamping, narrow-screen panels and transcript update coordinator. The geometry package does not implement those behaviors or the live transcript. |

Keep the map nodes read-only (`nodesConnectable={false}` and no deletion action); clicking scenario links, session markers and gate controls must not start a node drag or canvas pan. The desktop transcript windows are nonmodal and may coexist, so a modal dialog or anchored-popover library is not a substitute for their workspace behavior. Avoid introducing a separate state or virtualization library until fixture or browser evidence shows the existing React state and bounded lists cannot meet the acceptance case.

## Visual refinement review

| Suggestion | Improvement and effort | Decision |
| --- | --- | --- |
| 1. Audit ring and repair chain | High value; medium effort because audit outcome must be published separately from gate verdict. | Adopt with distinct passed, failed, incomplete and unavailable audit treatments; no ring only when audit is not applicable. Keep each repaired attempt selectable. |
| 2. Capability summaries | High value; medium effort to count current direct consumer requirements without double counting. | Adopt scenario-result and requirement-verification summaries on expanded cards, with the capability's recorded reason beside them. |
| 3. Collapsed scenario dots | Moderate value; low effort from the projected scenario list. | Adopt through 20 scenarios, then a stacked result bar; keep textual counts and named rows on expansion. |
| 4. Moving Now focus | High value; medium effort for exact current targets and version changes. | Adopt the header control and pulse only recorded awaited sessions or active gates; honor reduced motion. |
| 5. Shared palette | High value; low-to-medium effort, with contrast review. | Fix tokens and role icon/label mapping in iteration 1. Use a distinct participation violet; role accents remain secondary because five wholly separate unused hue families are impractical. |
| 6. Severity issue chip | High value; high effort for a complete, stable issue census across the catalog's many issue kinds. | Defer the run-wide count and cycle control to the shared dashboard issues projection. A partial map-derived count must not answer `any issues?` as though it were complete. Existing failed-gate and unavailable-fact marks remain visible. |
| 7. Hidden-match badges | High value; medium effort from the canonical match index and display tree. | Adopt counts on collapsed execution branches and involved-descendant counts on parent modules, without turning parents into direct matches. |
| 8. Line-volume bars | Moderate value; low effort from existing numeric totals. | Adopt a diverging bar with one run-wide scale, numeric totals, hatching plus text for partial data, and no bar for unavailable data. |
| 9. Idle-gap folding | No improvement on this event-order rail; a long wall-clock wait already takes no extra width. | Keep the selected element's event ticks and elapsed-time detail. Revisit gap folding only for a future time-proportional mode. |
| 10. Role tint and marker flash | Moderate value; low-to-medium effort with focus and reduced-motion handling. | Adopt restrained role header tints and a short marker outline after Focus on map reveals its target. |

## Iteration order and verification

| Iteration | Delivers | Depends on |
| --- | --- | --- |
| 1 | Wire contract, bounds, source map and scripted fixture | Current harness records and design |
| 2 | Capability, scenario, work-item, iteration and gate census | 1 |
| 3 | Causal provider/repair links and current requirement states | 2 |
| 4 | Module hierarchy, direct participation and captured line totals | 2–3 |
| 5 | HTTP/client integration and versioned pagination | 2–4 |
| 6 | Execution canvas, details, time rail and complete session/gate access | 5 |
| 7 | Compact modules canvas and bidirectional click selection | 4–6 |
| 8 | Multiple transcript windows and one live update coordinator | 5–7 |
| 9 | Browser, scripted-run and audit acceptance; documentation | 1–8 |

Each iteration updates `results.md` with changes, focused evidence, deviations and open gaps. Its exit includes focused tests for the behavior it adds, `npm run type-check` and `npm run check:self`; web iterations also run `npm run build:web`. The complete harness suite, browser suite and recorded audit request run in iteration 9 against the final implementation commit. Tests use scripted agents and Git boundaries except for named real-process and browser witnesses; no test calls a real model.

### Iteration 1: Public contract and representative run

**Owners:** harness protocol, projection test fixtures, web protocol client types.

Define the `execution-map/1` page and targeted detail schemas, `protocolPaths`, bounded page sizes and source-ref types. Specify allowed node kinds (entry and lower-level capability, scenario, work item, iteration, placement request, contract, requirement, session, gate), link kinds and module relation roles. Preserve gate attempts and session IDs separately from the visual card that refers to them. Specify independent gate-verdict and audit-lifecycle values, exact current activity IDs, scenario-result buckets and direct current-revision consumer-requirement membership. Use stable run-version and cursor semantics, including stale responses, partial records, unavailable tree, and unresolved endpoints. Keep full Gherkin and transcript bodies out of the index.

Create one scripted fixture with two entry roots sharing a provider in another module, local architect continuations, a contract engineer, two consumers at different requirement stages, a failed gate followed by repair, a reopened contract revision, a follow-up work item, an integration scenario, and a dependency cycle. Include one proposed module, one unplaced module, a binary path, an unmapped path and a partial line event. Retain the small recorded `status-badge-tone` run as a separate compatibility witness. The fixture must expose expected IDs, source sequences and run versions without parsing narrative summaries.

Fix a semantic palette contract: status gray/blue/green/amber/red; direct module participation violet; initial/global/local/engineer/contract role icon, label and accent tokens; light/dark contrast and reduced-motion rules. Do not treat the current dashboard mockup's initial-architect purple as this map's role token.

**Exit:** schema validation accepts every fixture case and rejects duplicate IDs, dangling links without coverage, mixed run versions and over-limit pages. A contract table maps every node/link field to its owning record or event. The visual token table is recorded with a contrast review. No UI implementation is required yet.

### Iteration 2: Core execution index and complete descriptions

**Owner:** harness projections and targeted detail queries.

Project entry roots from accepted analysis; `CapabilityProgress` supplies literal `todo`, `working`, `completed` and evidence. Join each entry's tracked scenario IDs and names. Select the latest **non-dry-run** scenario result while retaining the full ordered gate history; green requires that result to be `passed` and the scenario still `implemented`. A later failure or withdrawal clears green. Publish capability owner/proposed path, work-item ID and work-item state. Index assigned iterations in committed order, outline revision, the work item's full path and scope exceptions. Forecast hypotheses remain dashed and never create implementation work.

Enumerate all readiness, iteration, contract, breaking-iteration, work-item and final gate attempts from their records, including attempts absent from one work-item detail. Publish checkpoint, subject, verdict, cause, repair round, commit, audited commit, evidence presence and separate audit lifecycle; `not-verified` is distinct from failed, and a missing audit record cannot be read as a failed audit. Project every run session, its role/state/reach and invocation references, including finished and replaced sessions. Add targeted capability and scenario detail queries for full entry description, lower-level registered behavior and frozen Gherkin `source[]`, with explicit unavailable detail where a retained record is absent. Reuse existing gate and work-item detail queries.

**Exit:** the fixture yields every root, scenario, work item, ordered iteration, gate and run session exactly once, including run-wide records. A dry-run pass stays non-green, a later real failure replaces an earlier pass, and selecting a named scenario or entry returns its entire source text or description. A restart reconstructs the same index from durable records.

### Iteration 3: Causal decomposition and requirement progress

**Owner:** harness projection over typed decisions, assignments, contracts, requirements and events.

Publish `started-for`, `follows`, `requested-by`, `established-by`, `provider-for`, `verification-of`, `proposed-by`, `repair-of` and dependency links with exact source refs. Show one canonical provider implementation card, references from all consumers, reverse consumers and a finite cycle group. Attach a local architect session lane to its work item across outline revisions, assignments, yields, resumes and completion; attach global forks to placement requests and the initial architect to the run band. Publish exact current awaited-session and active-gate references when recorded; do not infer them from a merely open work item or from an old gate without a start event. Keep authorized write scope distinct from observed writes.

For each consumer requirement at its **current revision**, derive `todo` before contract work starts, `working` once contract engineer or provider work starts, and `completed` only after `requirement-verified`. Publish provider substage separately, including `provider not started` after agreement work begins. For access-only agreements, registration is the green `access established` point and no provider work item is invented. Reopening evidence replaces the current color without erasing prior gate or verification history. An unknown provider binding is unavailable, not gray. Add a gate-start event for checkpoints whose active execution cannot be established from the existing run log, especially readiness; pair it with the attempt or an interrupted/unavailable ending on recovery.

**Exit:** tests prove two consumers of one provider can show different colors, conformance alone stays blue, a fake-backed pass stays blue, access-only closes without provider work, reopened green clears, cycles terminate at references, and failed then repaired gates remain separate. An active readiness gate has a truthful running marker and Now target; an old run without a start event invents neither.

### Iteration 4: Module relations and captured change volume

**Owner:** harness projection; current module tree and retained invocation line records are inputs.

Index each module by its full declared-name path and current parent, with proposed placement and a separate unplaced set. Publish direct module relations for capability owner, work item, local architect/engineer session reach, scenario owner, consumer/provider branch and any exceptional authorized iteration scope. Only recorded started work or a session attached to the module creates the violet `worked in` mark; an initial association, request or scope alone does not. Parent nodes may carry descendant counts without being marked directly involved.

Read all settled writer `lines.json` records. Group text-path added/deleted counts by recorded `owner`, include failed and repaired invocations, and carry invocation IDs. Put `owner: null` in `unmapped`; report binary paths separately. A missing/partial settled record makes the affected run total a known subtotal with partial coverage, rather than a complete zero. A live writer is pending until its record is written. Name the method limit from two worktree snapshots even when `coverage` is complete.

**Exit:** the fixture produces exact direct module relations, separate consumer/provider highlights, two-module line subtotals, unmapped and binary counts, and partial coverage. Scope-only modules remain unmarked. The current tree's revision and unavailable/proposed/unplaced states are preserved.

### Iteration 5: Query, client and page consistency

**Owners:** harness HTTP adapter and `web` protocol client.

Serve `GET /api/v1/plans/:planId/runs/:runId/execution-map` with version and cursor parameters, plus targeted capability/scenario detail. A query reads one committed run snapshot and returns deterministic pages. Stale-version and unreadable-data responses identify their cause; an incomplete page states `shown / total`. The client accumulates pages at one version, restarts after a version change, and never merges old and new node or module states. Session and gate census pages finish before the UI claims completeness. Existing `/analysis`, `/work-items/:id`, `/gates/:id`, `/scenarios`, `/sessions`, transcript and update paths remain valid.

**Exit:** protocol tests cover URL encoding, all page boundaries, 500-plus links, stale cursor restart, missing relation target, partial snapshot, restart reconstruction and an unchanged existing client path. The browser client distinguishes connection loss from run state and keeps the last coherent version visible with a stale label.

### Iteration 6: Execution canvas and evidence drill-down

**Owner:** `web`, using the run-page progress/query conventions and the existing capability graph as layout input.

Add an Execution map area to the Run page with a direct `@xyflow/react` dependency. Use its controlled nodes, edges and viewport, custom cards and built-in navigation controls; keep layout and projection-specific state in `web`. Render one root per top-level capability, its named scenarios, canonical work-item/provider cards, persistent local architect lane, ordered iteration sequence, session markers, gate attempts and requirement branches. Put initial architect, integration work and run-wide gates/sessions in a run band. Shared providers and cycles use references, not recursive duplicate trees. Initial focus shows roots, current work and latest issue; users expand, collapse, pan, zoom, fit and deliberately relayout. Preserve positions on ordinary version updates. Show `shown / total`, unresolved references and explicit unavailable facts in collapsed summaries and detail.

Clicking a capability opens its full description; clicking a scenario name opens its full frozen Gherkin and result history without also selecting the capability. An expanded capability shows a scenario-result segmented summary and verified/known direct consumer requirements; the recorded state reason stays visible when all scenarios pass but the card remains blue. A collapsed root shows scenario-result dots through 20 scenarios and a stacked result bar above that. Gate markers put the verdict in the center and the independent audit lifecycle in a ring; typed repairs form short inline chains with round numbers. Gate detail opens the existing full check/audit answer. A time rail lists real event moments in event order and marks the selected element's ticks; it does not stretch or fold idle time. A complete shelf lists all run sessions and gate attempts, with role, state, subject and latest result, even if their branch is collapsed. A Now control focuses exact current activity; only recorded active session or gate marks pulse, with a static reduced-motion alternative. Colors, icons and labels follow the iteration 1 palette: capability green only for current `completed`, scenario green only for latest real pass while implemented, requirements per current revision; failed gates retain red markers rather than changing a capability's state.

**Exit:** component tests cover the fixture's two roots, shared provider, iteration order, local architect continuity, full detail, gate result and audit independence, inline repair chain, scenario-dot threshold, requirement counts, run-wide records, cycle references and `shown / total`. A blue capability with green scenarios still names its open requirement or other recorded reason. Keyboard selection and focus reach every displayed marker; Now focuses only evidence-backed current activity. The canvas pans and zooms without moving open detail or changing run state.

### Iteration 7: Companion modules canvas and cross-selection

**Owners:** `web`; a narrowly scoped Ramify presentation-package change only if the packaged `ModuleTreeCanvas` needs multi-node highlight support.

Render a compact current modules tree beside the execution canvas, reusing `ramify.ts/module-tree` through its package export. Do not shrink the existing By module view's large capability-row bodies into a miniature. Show full paths in selected detail, proposed shells, unplaced modules, violet participation, directly owned captured `+LOC / -LOC` with coverage, and a separately labeled descendant count. Give this canvas its **own** pan, zoom and fit controls; on narrow screens the same zoomable canvas opens in a drawer. If the toolkit canvas cannot show multiple highlighted modules with accessible labels, add an optional highlighted-node-ID prop to that packaged component, build the toolkit, and verify its existing consumers.

One selection model derives highlights in both directions. Main-map clicks select one or several directly related modules, labeled by role. A module click highlights direct execution matches, displays the count and a jump list for hidden matches, and adds `N inside` to each collapsed branch with matches. Count canonical nodes once. Parent module nodes show a distinct involved-descendant count, without a direct participation mark. The numeric `+LOC / -LOC` has a compact diverging bar on one run-wide scale; partial subtotals are hatched and labeled, unavailable data has no bar. Click or keyboard activation persists; there is no hover synchronization. Selecting a node may expand ancestors or reveal a target once, but each viewport retains its zoom and pan otherwise.

**Exit:** browser checks prove independent pan/zoom in both maps; direct and multi-module cross-highlights; keyboard selection; hidden-match navigation and branch badges; full paths; a narrow drawer; unavailable tree fallback; and no `+0 / -0` or zero-length bar for missing line data. An uninvolved parent stays neutral while its involved descendant retains violet; partial line totals retain both hatching and a text label.

### Iteration 8: Movable transcript workspace

**Owner:** `web`, reusing `transcript.tsx`, `session-page.tsx` and the existing transcript/update protocol.

Extract reusable transcript chapters, bodies, evaluation and navigation from the full-page session view. First verify `react-rnd` with the project's React 19 build in a real browser: dragging by the header, resizing after dragging, selecting transcript text, clicking header controls without dragging, and staying reachable after a viewport resize. Pin it in the agent's package and lockfile if the spike passes; otherwise record the failure and choose the smallest compatible geometry primitive before building a custom drag/resize system. A session marker or shelf row opens one window keyed by session ID; reopening raises it. Windows move, resize, minimize, maximize and close independently, with keyboard controls, focus management, viewport bounds and a reset-position action. Headers use the shared role icon, label and restrained tint; they show state, session ID, reach and the full associated module path, while run-wide sessions say so. Keep chapter/point deep links, **Focus on map** and **Open full page**. Focus on map reveals and briefly outlines the marker, or selects the shelf row when no map marker is available; reduced motion uses a static outline. On a narrow or touch layout, use full-screen panels with a window switcher.

Use one update coordinator per run. Load each opened transcript by cursor, then batch open-session cursors through `/sessions/updates` within its 50-session limit. Honor `more` immediately, follow near the bottom, pause follow while scrolled back, show new-entry count and Jump to live, and stop only after a final session's trailing entries arrive. Each window keeps its own cursor, scroll and error state; missing/unreadable pages and lost connection retain the last good content. Minimized windows can defer bodies. No marker creates its own polling loop or duplicates the renderer.

**Exit:** the React 19 browser spike records its dependency and result; two simultaneous windows can be moved and resized, one updates live while the other is scrolled back, and closing/reopening one leaves the other intact. Header buttons and transcript selection do not move a window. Keyboard controls and reset recover an off-screen window after viewport changes. Role treatment matches map and shelf; Focus on map reveals the correct marker and respects reduced motion. A chapter link opens the correct window and point. Full-page session routes still render the same transcript. A test opens more than 50 windows and proves bounded batches rather than an over-limit poll.

### Iteration 9: End-to-end acceptance and handoff

**Owners:** harness and web tests, browser acceptance setup, this plan's `results.md` and the docs index.

Run the scripted nested-provider fixture through protocol queries and an actual browser at desktop and narrow widths. Exercise scenario dry run/pass/failure/withdrawal, capability green clearing after reopened evidence, every requirement color and access-only branch, failed and repaired gate attempts with independent audit rings, every session including local architect/global fork/finished, transcript windows, two-map navigation, hidden-match badges, partial line bars, Now focus and reduced-motion behavior, disconnect/reconnect and version restart. Verify the 20/21 scenario-dot threshold, a large bounded answer with at least one page boundary, and a collapsed branch containing a session and gate. Use a real browser runner with a pinned project-local dependency and command; keep the fixture's scripted agents and Git boundary so CI needs no model login. The recorded pi trial is a read-only compatibility witness, not proof of the synthetic provider cases.

Run the full project tests, type check, web build, `check:self` and the recorded ramify-audit request on the same final commit. If the toolkit canvas changed, run its focused canvas tests, root build and self-check too. Record commands, revisions, browser viewport sizes, screenshot/artifact paths, coverage gaps and failed checks in `results.md`. Update `docs/README.md` with the shipped state only after acceptance. Do not mark this plan implemented on structural validation alone.

## Acceptance matrix

| ID | Observable result | Iteration |
| --- | --- | --- |
| EM01 | Every top-level capability is a root; shared lower-level work has one canonical card with consumer references and finite cycles. | 2, 3, 6 |
| EM02 | Every entry scenario is named, its latest real result is colored correctly, and its full frozen Gherkin opens by name. | 2, 6 |
| EM03 | Capability green follows current verified progress; clicking it opens the full description or registered behavior. | 2, 6 |
| EM04 | A work item shows its full module path, local architect session, assigned iterations in order, all engineer sessions and each gate attempt/result. | 2, 6 |
| EM05 | A provider request, contract engineer, provider work and consumer verification are connected; per-consumer status follows the current revision. | 3, 6 |
| EM06 | The run band/shelf reaches every initial/global/local/engineer/contract session and every gate, including collapsed and finished records. | 2, 3, 6 |
| EM07 | The modules map shows direct involvement, full paths, captured writer `+LOC / -LOC` and honest coverage; both maps pan/zoom independently and click-select bidirectionally. | 4, 7 |
| EM08 | Multiple movable transcript windows retain independent live cursors, scroll and errors; one bounded coordinator follows them. | 8 |
| EM09 | Version changes, partial answers, unavailable tree/records and connection loss do not become false zeroes or mixed-version maps. | 1, 4, 5, 9 |
| EM10 | Scripted-run, real-browser, type/build/self-check and final commit audit evidence are recorded separately. | 9 |
| EM11 | Gate verdict and audit remain distinct on a marker; repair rounds remain selectable. Expanded capability summaries and collapsed scenario marks explain current status without claiming unavailable counts. | 1–3, 6 |
| EM12 | Now targets and motion follow recorded activity; hidden-match badges, line bars and transcript focus feedback remain keyboard-accessible and respect reduced motion. | 1, 3, 6–9 |

The implementation and executable acceptance are recorded in [results.md](results.md). The final commit's independent audit outcome is published as a Git note under `refs/notes/audit`.
