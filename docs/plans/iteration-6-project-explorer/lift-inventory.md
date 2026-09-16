# Lift inventory

**Date:** 2026-09-16. **Status:** reverified and frozen by iteration 1 as the
EX01 extraction baseline for
[Plan 6](main-plan.md).

Inspected from a clean local cucumber-viz checkout at
`44b7f30e0fdfda79ead8363ef4c85c100e36fda0`. That commit renamed `domain-sub-apps/` to
`domains/`, so the paths in the
[reuse analysis](../../analysis/project-explorer-reuse.md) and the
[roadmap brief](../../roadmap.md#plan-6-project-explorer) no longer resolve.
Paths below are relative to `src/domains/module-architecture/` unless stated.
These are migration references, not dependencies of the Ramify package; retain
the provenance when code is extracted.

Every path below was rechecked with `git ls-tree` at that exact commit. The
source blobs are:

| Source | Git blob |
| --- | --- |
| `ui/components/ModuleGraphRadial.tsx` | `d1caeea79a9193a16686ecfe87f338239b58cfe8` |
| `ui/components/moduleGraphShared.ts` | `9644e50853d27fa0ab0cefdd41dd4026c5f20a78` |
| `ui/components/moduleTypePresentation.ts` | `7ee8210af25374e512fbcb0d39e647f5f628b63e` |
| `ui/components/ModuleGraphLegend.tsx` | `42789814d64f19e76d04d4f65560238f3bb8068f` |
| `ui/components/ModuleGraph.tsx` | `a7708fbec31baa5ff07f2d36e2a777b2d1b7c4ca` |
| `ui/components/ExportList.tsx` | `4428c691217c09e0b8a1d9c873fe30cad4107a73` |
| `ui/pages/ModuleArchitecturePageView.tsx` | `f96e9e605425891bde599a8b4849f137b664d71f` |
| `ui/pages/ModuleArchitecturePage.tsx` | `1762b96b67e98957043bc6e4ad817cb6c26c90e0` |
| repository-root `ui/styles.css` | `ed4be9f6709494aea2dad33d023f1a7a58f75292` |
| `ui/components/ModuleGraph.test.tsx` | `6f755a42c9089f7dd4f4188d22d9177a5956e546` |
| `ui/pages/ModuleArchitecturePageView.test.tsx` | `de35526e9094dcede2e7e1735362d628de8cf3dd` |

## Corrections to existing documents

| Claim | Verified state |
| --- | --- |
| `ui/components/moduleGraphShared.test.ts` | Does not exist, and never did. |
| `ui/components/ModuleGraphLegend.test.tsx` | Does not exist. |
| `server/router/index.ts` | The router is `router/index.ts`. |
| `domain-sub-apps/…` throughout | Renamed to `domains/…`. |
| `moduleTypePresentation.ts` | Required by the graph; absent from the reuse analysis. |

`moduleGraphShared.ts` and `ModuleGraphLegend.tsx` are covered indirectly by
`ModuleGraph.test.tsx`.

## Graph bundle

Every host coupling in this bundle is a type-only import of `../../client.js`,
a twenty-line type barrel over `core/types.ts`. The compatibility view model is
deliberately shaped to replace that barrel with minimal component edits. No file
here imports a client, store, router or session.

| File | Lines | Verdict |
| --- | --- | --- |
| `ui/components/ModuleGraphRadial.tsx` | 439 | Copy first. Drop the unused `BaseEdge` import and change only compatibility-field reads. |
| `ui/components/moduleGraphShared.ts` | 174 | Copy first. Keep its edge builder and interaction hook; adapt props and selection payload mechanically. |
| `ui/components/moduleTypePresentation.ts` | 119 | Lift. Its palette and hash key off tags instead of an inferred type. Delete the stale backend-sync comments. |
| `ui/components/ModuleGraphLegend.tsx` | 61 | Lift with its stylesheet rules. Export its props; the source leaves them unexported. |
| `ui/components/ModuleGraph.tsx` | 14 | Collapse. Its body only returns the radial implementation. |

Geometry constants stay as they are: the radial centre, the diameter range and
the ring radius are self-contained.

## Panels and page

| File | Lines | Verdict |
| --- | --- | --- |
| `ui/components/ExportList.tsx` | 95 | Copy first. Replace barrel badges with exposure badges; keep the expandable inventory, retained-provider signatures and source locations. |
| `ui/pages/ModuleArchitecturePageView.tsx` | 955 | Copy first. Inject the discussion panel, adapt compatibility labels and add limited/unavailable and non-application states without restructuring the page. |
| `ui/pages/ModuleArchitecturePage.tsx` | 256 | Adapt heavily but preserve its selection state, filter reconciliation, breadcrumb walk and handler wiring; replace the query call sites and watcher hook. |

The view is otherwise free of transport: it imports no client, no query
library, no router and no filesystem. Its one value import,
`AgentChatPanel`, reaches into the host tree and pulls Markdown rendering; it
becomes an optional injected component, mirroring the `GraphComponent`
inversion the file already uses. Seven of its props are discussion-related and
become optional with it.

The view owns its loading, error and empty states and its resizable sidebar;
the page owns transport and cross-cutting selection. That split is kept.

The page's `edgeUsageByEdgeId` is hardwired empty in the source, so inline
dependency usage never renders. The projection supplies it; this is a
limitation to correct, not behavior to preserve.

## Destination map

| Source | Destination |
| --- | --- |
| `ui/components/ModuleGraphRadial.tsx` | `subs/presentation/subs/project-view/src/ModuleGraphRadial.tsx` |
| `ui/components/moduleGraphShared.ts` | `subs/presentation/subs/project-view/src/moduleGraphShared.ts` |
| `ui/components/moduleTypePresentation.ts` | `subs/presentation/subs/project-view/src/moduleTypePresentation.ts` |
| `ui/components/ModuleGraphLegend.tsx` | `subs/presentation/subs/project-view/src/ModuleGraphLegend.tsx` |
| `ui/components/ModuleGraph.tsx` | No separate file: collapse its 14-line forwarding body into the `ModuleGraphRadial` export. |
| `ui/components/ExportList.tsx` | `subs/presentation/subs/project-view/src/ExportList.tsx` |
| `ui/pages/ModuleArchitecturePageView.tsx` | `subs/presentation/subs/project-view/src/ProjectExplorerView.tsx` |
| `ui/pages/ModuleArchitecturePage.tsx` | `subs/explorer/src/ProjectExplorerPage.tsx` |
| relevant repository-root `ui/styles.css` rules | `subs/presentation/subs/project-view/src/project-view.css` |
| `ModuleGraph.test.tsx` | `subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx` |
| `ModuleArchitecturePageView.test.tsx` | `subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx` |

Every destination file retains a source-path and commit comment until the
completion report records the extraction.

## Not lifted

| Source | Reason |
| --- | --- |
| `ui/components/ModuleCard.tsx` | Unreferenced; a leftover node renderer from a replaced layout. |
| `ui/components/ViolationSummary.tsx` | Unreferenced. |
| `router/index.ts` and `app/` | Runs dependency-cruiser, merges barrels, caches by module pair and schedules eager precomputation. The existing report and compatibility projection replace all of it. |
| `core/` analyzer, module detector, edge usage | Infer modules from barrel rules and scan import declarations. Ramify declares modules and already resolves originals. |
| `features/module-architecture/` and its world | The world is a miniature host server: a hand-written DOM shim, mock services, a mock socket and a seeded dependency-cruiser fixture. The scenario text informs iteration 7; the world is not lifted. |
| `features/components/…layout-switcher` | Asserts against props the view no longer has, and passes vacuously. |

## Stylesheet

The components read a single global stylesheet in the host, `ui/styles.css`.
Extract only the required rules so the view renders without host styles.

| Rules | Purpose |
| --- | --- |
| The radial canvas rule and the edge-flow keyframe | Canvas sizing and animated edges. |
| The graph legend block, ten classes | The legend; its swatches have no intrinsic size. |
| The export list block, plus the spinner and its keyframe | The export panel and its loading state. |
| The `module-arch` view rules | Layout, sidebar, breadcrumbs, filters and detail panels. |

The canvas needs a sized ancestor chain; the source provides it through four
nested rules. Supply one wrapper rule rather than lifting the host page shell.
`module-arch__radial-node` has no rule and is a dead hook; the node is
inline-styled.

## Dependencies

| Package | Note |
| --- | --- |
| `@xyflow/react` | New. The radial graph is built on it, and it supplies pan, zoom, minimap and controls. Its stylesheet must be imported. Ramify's existing `layout` viewport helpers are not used by the lifted graph. |
| `express`, `@trpc/server`, `@trpc/client`, `zod` | New for the web process. The reference project already pins a working set. |
| `vite`, `@vitejs/plugin-react` | New, for the browser build only. Confined to a development entry point and lifetime. |
| `@testing-library/react`, `@testing-library/jest-dom` | New. The lifted component tests use them; Ramify's presentation tests use raw `react-dom`. |
| `react`, `react-dom`, `d3-shape`, `d3-hierarchy`, `jsdom` | Already present. |

## Tests

| Source test | Lines | Verdict |
| --- | --- | --- |
| `ui/pages/ModuleArchitecturePageView.test.tsx` | 439 | Reuse. Thirteen behavior tests with no module mocking; it injects a stub graph through the existing prop. Adapt the fixtures to the view model, the relabelled badges and an injected discussion stub. |
| `ui/components/ModuleGraph.test.tsx` | 294 | Reuse. Seven tests that replace the graph framework with a recording harness, so they carry no host coupling. Adapt the selection payload assertions. |
| `router/barrel-merge.test.ts` | 71 | Not lifted with its subject. |
| `router/moduleArchitecture.test.ts` | 328 | Not lifted. Its guard and path-traversal half informs iteration 4's own tests. |

Copy both reusable tests before adaptation and preserve each named behavior.
Record any assertion that is changed or removed. Add only the witnesses the
source has none of: the single-root overview, bounded and superseded signatures,
owned counts against subtree rollups, decision and reason badges, coverage
display, non-application targets and revision consistency.

### Exact reusable-test inventory

`ModuleGraph.test.tsx` contributes seven tests:

1. `renders radial layout`
2. `provides module-type color metadata`
3. `node click selects module and clears edge`
4. `edge click emits GraphEdgeSelection payload shape`
5. `pane click clears both selections`
6. `clicking selected edge toggles it off`
7. `scales edge thickness by method count and disables animation`

`ModuleArchitecturePageView.test.tsx` contributes thirteen tests:

1. `renders module type checkboxes and toggles a type filter`
2. `disables module type checkboxes when no modules exist for that type`
3. `preserves selected module detail across re-renders`
4. `preserves selected edge detail across re-renders`
5. `renders "Chat with Claude" heading when a module is selected`
6. `renders "Chat with Claude" heading when an edge is selected`
7. `does not render chat section when nothing is selected`
8. `shows composer placeholder with module name for module selection`
9. `shows composer placeholder with edge direction for edge selection`
10. `renders Send button in the composer`
11. `disables Refresh button when not stale`
12. `enables Refresh button with stale modifier when stale`
13. `renders Retry button always enabled in error state regardless of staleness`

The discussion-related tests remain reuse obligations: adapt them to an
injected discussion component rather than deleting them. The test categories
and completion-accounting rules are frozen in [contracts.md](contracts.md).
