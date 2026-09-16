# Iteration 7 results: browser acceptance and reuse report

**Date:** 2026-09-16. **Result:** completed. **Plan:** [Plan 6](../main-plan.md).

## Delivered acceptance workflow

`integration-tests [testing, ui, dispatch]` now owns an executable acceptance
runner over isolated copies of Collection Review, Ramify and a purpose-built
mutation project. `npm run measure:project-explorer` starts the compiled daemon
and compiled local web process in owned endpoint directories, launches the
installed `/usr/bin/chromium` through pinned `playwright-core`, drives the real
HTTP client and disposes every browser context, web process, daemon and fixture.

The first real browser run found a transport defect that direct callers could
not expose: the browser's `httpBatchLink` sends query batches as POST, while the
Express tRPC adapter had not enabled method override. The raw failure is
retained in
[iteration7-browser-acceptance-failed-post-query.json](../evidence/iteration7-browser-acceptance-failed-post-query.json).
The web adapter now explicitly accepts POST query batches and its process test
executes that exact client/server path.

The passing raw report is
[iteration7-browser-acceptance.json](../evidence/iteration7-browser-acceptance.json),
schema `ramify.project-explorer-acceptance/1`, SHA-256
`fdfa3f9c34689f7b6a0573dbb7ca44fe31ff27f24b6701fb4406cf90047655fa`.
It records build identity
`a90d51600a1d767f8a7956b0e4441ec93f6627f885c917ee9008a791417fc258`,
Node 22.23.2, TypeScript 7.0.2, Chromium 151.0.7922.173,
Playwright Core 1.63.0 and all relevant dependency/runtime versions.

## EX29–EX33 evidence

| Row | Executed witness | Result |
| --- | --- | --- |
| EX29 | Real Chromium at the actual loopback HTTP origin selected a module, module edge and non-application target; loaded export details; resized the sidebar; zoomed and panned React Flow; toggled a tag-class filter; and entered/left a nested breadcrumb scope. | Passed. The raw record retains selected IDs, viewport transforms, graph cardinalities and sidebar widths. |
| EX30 | Collection Review and an isolated copy of Ramify were published by real daemons, projected once and displayed by the browser at the same revision. Header counts were compared independently with each report/projection. | Passed. Reference: 15 report/projected modules, 32 projected edges, initial display `Showing 2 of 15 modules, 0 module dependencies`. Toolkit: 15 modules, 54 edges, initial display `Showing 7 of 15 modules, 8 module dependencies`. |
| EX31 | An isolated three-owner project changed `subs/provider/README.md`, added a second consumer source access, then added `extra` to the provider's parent exposure. Each write used synchronized real publication, produced revisions 2, 3 and 4, became stale in the browser and was accepted only through the explicit Refresh action. | Passed. The changed purpose rendered verbatim, the edge rose to two access occurrences, and `extra` displayed its `parent` exposure badge. |
| EX32 | The pure projector was timed over the same published report shown in the browser; encoded view bytes were counted before transport. Daemon memory came from its own `process.memoryUsage()` status and web memory from the web process's Node inspector. | Observed, not budgeted. Reference: 11.129 ms, 322,794 bytes, web RSS/heap 98,086,912/26,210,264 bytes, daemon RSS/heap 127,328,256/25,750,408 bytes. Toolkit: 258.203 ms, 3,256,514 bytes, web RSS/heap 173,731,840/49,937,496 bytes, daemon RSS/heap 140,115,968/18,828,584 bytes. These are single observations on the recorded host, not performance guarantees. |
| EX33 | Ten README publications on the isolated reference copy each made the page stale and required a button click. A pre-navigation observer counted settled page-global listeners and timers; DOM counts witness the single displayed model and its graph. Daemon status retained bounded history and no requests/subscriptions at the final sample. | Passed. Baseline and every cycle: one model, 12 graph nodes, 21 graph edges, 23 window/document listeners, one polling interval and zero pending timeouts. Revision advanced from sequence 1 to 11. |

The listener observer deliberately counts only window/document registrations.
Short-lived fetch `AbortSignal` targets become unreachable with their requests;
retaining them in a global observer would create the growth it purported to
measure. The evidence therefore establishes page-global listener/timer cleanup,
one settled rendered model and bounded daemon state, not browser-engine heap
object identity or deferred multi-client backpressure.

## EX10 file-by-file reuse account

All source paths below are at cucumber-viz commit
`44b7f30e0fdfda79ead8363ef4c85c100e36fda0`. No candidate is classified as
copied or rewritten.

| Source | Destination | Category | Final account |
| --- | --- | --- | --- |
| `ui/components/ModuleGraphRadial.tsx` | `subs/presentation/subs/project-view/src/ModuleGraphRadial.tsx` | behaviorally changed | Retains radial geometry, chords, React Flow, minimap and controls; maps the compatibility DTO, explicit edge states, other targets, out-of-view nodes and approximate metrics. |
| `ui/components/moduleGraphShared.ts` | `subs/presentation/subs/project-view/src/moduleGraphShared.ts` | behaviorally changed | Retains edge construction and interaction callbacks; uses `ExplorerEdge`, `GraphSelection`, truthful access width and target-group edges. |
| `ui/components/moduleTypePresentation.ts` | `subs/presentation/subs/project-view/src/moduleTypePresentation.ts` | behaviorally changed | Retains palette/hash/alpha logic; declared tag classes replace inferred host types. |
| `ui/components/ModuleGraphLegend.tsx` | `subs/presentation/subs/project-view/src/ModuleGraphLegend.tsx` | behaviorally changed | Retains structure/swatches; presents tag classes and allowed/limited/denied states and exports its props. |
| `ui/components/ModuleGraph.tsx` | no separate file | mechanically adapted | Its fourteen-line forwarding body is intentionally collapsed into the named `ModuleGraphRadial` export. This row is its provenance/accounting record; no source behavior or standalone owner was lost. |
| `ui/components/ExportList.tsx` | `subs/presentation/subs/project-view/src/ExportList.tsx` | behaviorally changed | Retains expandable inventory, spinner and detail panel; uses aliases, capability, forwarding, exposure/source facts and exact detail states rather than host kinds/barrels. |
| `ui/pages/ModuleArchitecturePageView.tsx` | `subs/presentation/subs/project-view/src/ProjectExplorerView.tsx` | behaviorally changed | Retains controlled selection, navigation, resize, collapsibles and loading/error/empty states; adds Ramify counts, decisions, coverage, targets and injected discussion/detail slots. |
| `ui/pages/ModuleArchitecturePage.tsx` | `subs/explorer/src/ProjectExplorerPage.tsx` | behaviorally changed | Retains selection/filter reconciliation, breadcrumb walk, drill-down and handlers; the three-procedure client, polling, race rejection, explicit refresh and revision-bound details replace host query/watcher/chat hooks. |
| repository-root `ui/styles.css` relevant rules | `subs/presentation/subs/project-view/src/project-view.css` | behaviorally changed | One final classification covers the mechanically extracted graph rules and the page additions: local sizing plus Ramify decision, coverage, exposure and unavailable states. |
| `ui/components/ModuleGraph.test.tsx` | `subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx` | behaviorally changed | Ports all seven behaviors and adds three Plan 6 witnesses. DTO/payload assertions changed; `method count` was truthfully renamed `access count`. |
| `ui/pages/ModuleArchitecturePageView.test.tsx` | `subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx` | behaviorally changed | Ports all thirteen behaviors and adds six Plan 6 witnesses with compatibility fixtures and injected discussion. |

Every concrete TypeScript destination retains its source path and full commit
comment. The collapsed forwarding candidate has no destination file; its exact
source, reason and surviving export are accounted for above rather than given a
false provenance comment.

## EX11 reusable-test dispositions

All twenty reusable source behaviors are **ported**; none is replaced or
intentionally omitted. Nineteen titles stay verbatim. The twentieth title
changes `scales edge thickness by method count and disables animation` to
`scales edge thickness by access count and disables animation`, because the
underlying unit is source access occurrences rather than method calls.

| # | Source behavior | Disposition and assertion adaptation |
| ---: | --- | --- |
| 1 | `renders radial layout` | Ported; exact graph/controls/minimap inventory added. |
| 2 | `provides module-type color metadata` | Ported; tag-derived `presentationClass` replaces inferred type registry. |
| 3 | `node click selects module and clears edge` | Ported; fixture IDs only changed. |
| 4 | `edge click emits GraphEdgeSelection payload shape` | Ported; frozen `GraphSelection` carries the complete `ExplorerEdge`. |
| 5 | `pane click clears both selections` | Ported unchanged. |
| 6 | `clicking selected edge toggles it off` | Ported unchanged. |
| 7 | `scales edge thickness by method count and disables animation` | Ported under the truthful renamed title; relative width and both non-animation assertions remain. |
| 8 | `renders module type checkboxes and toggles a type filter` | Ported; declared tag-class checkbox replaces host type. |
| 9 | `disables module type checkboxes when no modules exist for that type` | Ported with a zero-count class. |
| 10 | `preserves selected module detail across re-renders` | Ported; `Export inventory` replaces the false public-interface label. |
| 11 | `preserves selected edge detail across re-renders` | Ported; the direction, heading and source-access assertions all repeat after rerender. The final audit restored the repeated direction assertion that an intermediate port had missed. |
| 12 | `renders "Chat with Claude" heading when a module is selected` | Ported; the host label is preserved only in the traceable test title, while an injected Discussion slot receives module context. |
| 13 | `renders "Chat with Claude" heading when an edge is selected` | Ported through the injected Discussion slot with edge direction. |
| 14 | `does not render chat section when nothing is selected` | Ported; no discussion renders and the expanded empty copy names other targets. |
| 15 | `shows composer placeholder with module name for module selection` | Ported through the injected fixture. |
| 16 | `shows composer placeholder with edge direction for edge selection` | Ported through the injected fixture. |
| 17 | `renders Send button in the composer` | Ported through the injected fixture. |
| 18 | `disables Refresh button when not stale` | Ported unchanged. |
| 19 | `enables Refresh button with stale modifier when stale` | Ported unchanged. |
| 20 | `renders Retry button always enabled in error state regardless of staleness` | Ported unchanged. |

## Full acceptance matrix

| Rows | Final evidence |
| --- | --- |
| EX01 | Iteration 1's exact commit/path/blob inventory remains unchanged. |
| EX02–EX05 | The lifted graph suite passes all seven source behaviors plus its three Plan 6 witnesses. |
| EX06–EX09 | The lifted page suite passes all thirteen source behaviors plus its six Plan 6 witnesses. |
| EX10–EX11 | The exhaustive tables above resolve every file, stylesheet, connected page, collapse and reusable behavior. |
| EX12–EX21, EX34 | Iteration 4 projector/provider tests pass; final real-report counts are re-established by the browser runner. |
| EX22–EX26, EX35 | Real direct router/service and connected-page tests pass; the browser mutation flow also exercises the serialized HTTP path. |
| EX27–EX28 | Iteration 6 CLI/process suite passes on the same final source. |
| EX29–EX33 | The passing versioned raw report and summaries above execute the real Chromium/process boundary. |

## Verification

| Command | Result |
| --- | --- |
| `npm run measure:project-explorer` | Passed all three isolated workloads; raw versioned evidence retained. |
| Focused owner/direct-router/HTTP/process/component command over eight files | Passed: 8 files, 40 tests. |
| `npm test -- subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` | Passed: 31 exact declaration fixtures after adding the four Plan 6 owners and relays. |
| `npm test` | Passed: 125 files, 1,787 tests. |
| `npm run type-check` | Passed toolkit, portable, scripts and reference-harness TypeScript scopes. |
| `npm run build` | Passed production compilation and browser build; Vite's existing 646.65 kB advisory remains nonblocking. |
| Isolated `npm run check:self` and owned daemon stop | Passed: 15 owners, 339 source files, 4,619 accesses, complete coverage and zero findings. |

The first full `npm test` after Plan 6 implementation ran 1,783 tests and found
only four stale exact-text declaration fixtures that still expected the former
eleven-owner toolkit. Those fixtures now enumerate all fifteen owners and the
new relays. The final full-suite rerun passed 125 files and all 1,787 tests.

## Deliberate first-release limits and handoff

The accepted limits remain exactly those in the plan: no precise complexity or
cycle analysis; no pagination/cursors/ranking; no subscription delivery or
hardened multi-client/backpressure lifecycle; no portable `project-view`
package entry; no eager/historical signatures; no Ramify-native redesign of
the compatibility graph; and no optional discussion/MCP host. The 16 MiB view
refusal remains the enforced transport resource boundary; recorded timing and
memory values are observational.

Successors receive the pure compatibility DTO/projector, retained detail
bridge, connected page, local HTTP and CLI launch contracts, real-browser
acceptance runner, raw measurements and exhaustive provenance table. Later
semantic replacement can occur behind the component boundary without
discarding the lifted interaction code.
