# Plan 6C: Module tree view

**Date:** 2026-09-17. **Status:** implemented on branch `feat/module-tree-view`; see the
[completion report](iterations/iteration3-results.md). A focused successor
to [Plan 6B](../iteration-6b-resident-explorer-server/main-plan.md), which must
be complete first. [Plan 6](../iteration-6-project-explorer/main-plan.md) and
[Plan 6A](../iteration-6a-module-only-project-explorer/main-plan.md) remain
historical records.

## Product decision

The resident explorer server gains a second page: a module tree. It shows the
module hierarchy only, as a top-down tree with the root module at the top, and
no import edges. Selecting a node shows that module's description and summary
data in a right-hand panel. Nodes with children can be collapsed.

The two pages link to each other. Double-clicking a tree node opens the import
explorer in a new tab, focused on that module; both detail panels also carry
an explicit link to the other page.

The tree reuses Plan 6B's `projectView` procedure and the existing
`ProjectExplorerModel`. No analysis, daemon, service procedure, model or
principles change is required.

## Runnable outcome

```sh
npm run build
pm2 restart explorer
# browse http://localhost:4302/                          -> home lists "Module explorer" and "Module tree"
# browse http://localhost:4302/modules/latest            -> tree of the newest published analysis
# double-click "model" in the tree                       -> new tab:
#   http://localhost:4302/analysis/latest?module=ramify%2Fanalysis%2Fmodel
#   import explorer scoped to "analysis", with "model" selected
```

## Current state (verified 2026-09-17)

Verified against the working tree while Plan 6B is being implemented.
[project-binding.ts](../../../subs/service-api/src/project-binding.ts)
already exists; the rest of Plan 6B does not. Iteration 1 re-verifies Plan
6B's delivered routes, `serverStatus` and revision comparison before starting.

| Area | Today |
| --- | --- |
| Data | [project-view.ts](../../../subs/presentation/subs/project-view/src/interfaces/project-view.ts): every `ExplorerModule` has `id`, `name`, `directory`, `parent`, `children`, `tags`, `presentationClass`, `purpose`, `files`, `exports` and `metrics`. The model has `rootModuleId`, `edges`, `coverage` and `summary`. Module IDs are slash-joined names, such as `ramify/analysis/model`. |
| Import explorer | [ProjectExplorerView.tsx](../../../subs/presentation/subs/project-view/src/ProjectExplorerView.tsx) renders a radial React Flow graph of one scope with filters, breadcrumbs and a resizable sidebar. Double-click drills into a module with children. |
| Explorer details | Header (name, directory, class badge, README paragraph or purpose state), metrics (owned and subtree files, dependencies, dependents, access occurrences, selected symbols, denied, limited, approximate complexity), sub-modules, consumed accesses, access consumers, export inventory with lazily loaded signatures, coverage limits and discussion. |
| Connected page | [ProjectExplorerPage.tsx](../../../subs/explorer/src/ProjectExplorerPage.tsx) owns loading, polling, staleness, selection and scope state in one component. Plan 6B iteration 3 removes its token and adds a pure revision comparison. |
| Tree layout | [tree-placement.ts](../../../subs/presentation/subs/layout/src/tree-placement.ts) `placeTree` places measured nodes as a compact vertical tree with centered parents and orthogonal edges. It is exposed to `presentation` only, which uses it for teaching diagrams. |
| Dependencies | `@xyflow/react`, `d3-hierarchy`, React 19 are already present. |

## Contracts

### T1. Routes and entry

| Route | Page |
| --- | --- |
| `GET /modules/latest` | Browser app: module tree on the newest published revision. |
| `GET /analysis/latest` | Unchanged import explorer; now honours `?module=`. |
| `GET /` | Home lists "Module explorer" → `/analysis/latest` and "Module tree" → `/modules/latest`. |

- The web process serves `index.html` for `/modules/latest` exactly as for
  `/analysis/latest`. Query strings are ignored by the server.
- `browser-entry.tsx` selects the page by `location.pathname` and passes the
  decoded `module` query parameter, if any, to the page.
- No new tRPC procedure. The tree uses `projectView`, `serverStatus` and the
  Plan 6B revision comparison.

### T2. Shared published-view hook

The loading, polling and staleness logic moves out of `ProjectExplorerPage`
into an `explorer`-owned hook used by both pages:

```ts
export interface PublishedProjectView {
  readonly data: ProjectExplorerModel | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly unavailableReason: string | null;
  readonly isStale: boolean;
  readonly bindingNotice: string | null;   // Plan 6B connection notice
  refresh(): void;                         // loads the newest known revision
}
export function usePublishedProjectView(client: ExplorerClient,
  options?: { readonly pollIntervalMs?: number }): PublishedProjectView;
```

Export-signature loading stays in `ProjectExplorerPage`. Behavior of the
import explorer is unchanged; its existing component tests and Plan 6B RS12
are the regression witness.

### T3. Tree view component

`ModuleTreeView` is a pure component in `presentation/subs/project-view`:

```ts
export interface ModuleTreeViewProps {
  readonly data: ProjectExplorerModel | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly unavailableReason: string | null;
  readonly isStale: boolean;
  readonly notice: string | null;
  readonly selectedModuleId: string | null;
  readonly collapsedModuleIds: ReadonlySet<string>;
  readonly onSelectModule: (id: string | null) => void;
  readonly onToggleCollapsed: (id: string) => void;
  readonly onExpandAll: () => void;
  readonly onCollapseToDepth: (depth: number) => void;
  readonly onOpenModule: (id: string) => void;   // double-click and panel link
  readonly onRefresh: () => void;
  readonly centerModuleId?: string | null;       // centres once instead of fitting
}
```

Layout and rendering:

- One React Flow canvas with pan, zoom, controls and a minimap, like the
  import explorer. Node positions come from `placeTree` with
  `orientation: 'vertical'`, and edges are its orthogonal parent–child polylines.
  Nodes are not draggable; there are no import edges.
- The tree root is `data.rootModuleId`. If the model ever holds several
  modules without a parent, they are laid out as siblings under a synthetic,
  unselectable "Project" node.
- A collapsed module's descendants are omitted from layout input. Layout is
  recomputed on collapse, expand and data change; the viewport is kept. The
  first load fits the view.
- Children are ordered by name.

Node content (fixed 184 × 64 px box):

| Element | Source |
| --- | --- |
| Name, bold | `name` |
| Left border colour and class label | `presentationClass`, via the existing presentation-class palette |
| `N files · M subs` | `metrics.ownedFiles`, `children.length` |
| Red count badge, if non-zero | `metrics.deniedAccesses` |
| Amber marker, if the module has coverage notes | `coverage[].moduleIds` |
| Muted "no README" marker | `purpose.state !== 'present'` |
| Collapse toggle below the box, with `+K` hidden descendants when collapsed | `children`, subtree count |

Interaction:

| Input | Effect |
| --- | --- |
| Click node | Select; the panel shows it. |
| Click pane | Clear selection. |
| Click toggle | Collapse or expand; does not change selection. |
| Double-click node | `onOpenModule(id)`. The synthetic node ignores it. |
| Keyboard | Nodes are focusable; Enter selects, `←` collapses, `→` expands, `o` opens. |
| Header buttons | Expand all; Collapse to depth 1; Refresh (stale state as in the import explorer). |

The header shows `N modules, depth D` and the revision, and the Plan 6B
connection notice while it is set. Loading, failure, unavailable and empty
states mirror the import explorer's wording with the title "Module tree".

### T4. Detail panel

The resizable right panel shows, for the selected module, data already in the
model and nothing that needs `explorerDetails`:

| Section | Content |
| --- | --- |
| Header | Name, directory, header tags as chips, presentation-class badge. |
| Description | README first paragraph; otherwise `No README purpose (missing-file)` or `(no-paragraph)` and the README path. |
| Structure | Parent (clickable), depth, direct children (clickable, with owned file counts), subtree module count. |
| Files | Owned and subtree files; owned files split into ordinary/tests and source/resource. |
| Imports | Dependencies and dependents as module name lists, each with its access count and a denied/limited status badge; names are clickable. Totals of denied and limited accesses. |
| Exports | Count, and exported names grouped by exposure destination (to parent, to descendants), each marked `forwarded` where true. No signatures. |
| Coverage | Coverage notes attached to the module: code, message and location. |
| Action | "Open in import explorer" → same as double-click. |

Clicking a module name elsewhere in the panel selects it and expands its
collapsed ancestors. Access-level lists, signatures, discussion and
approximate complexity stay in the import explorer.

With nothing selected, the panel shows the project summary: modules, owned
files, cross-module dependencies, denied and limited accesses and coverage
notes, from `data.summary`.

### T5. Connected tree page

`ModuleTreePage` in `explorer`:

- uses `usePublishedProjectView`;
- initial collapsed set: empty when the model has at most 60 modules, otherwise
  every module at depth ≥ 2 that has children;
- after a refresh, keeps the selection and the collapsed set for IDs that still
  exist and drops the others;
- `initialModuleId` (from `?module=`): when present in the first loaded model,
  selects it, expands its ancestors and centres it. When absent, shows the
  default tree and the notice `Module <id> is not in this revision`;
- `onOpenModule(id)` calls `window.open('/analysis/latest?module=' +
  encodeURIComponent(id), '_blank', 'noopener')`.

### T6. Focusing the import explorer

`ProjectExplorerPage` accepts `initialModuleId`. On the first loaded model:

| Target | Scope | Selection |
| --- | --- | --- |
| Unknown ID | default | none; notice `Module <id> is not in this revision` |
| The root module | default | none |
| A top-level module shown by the default scope | default | the module |
| Any other module | its parent | the module |

Presentation-class filters are reset to all classes so the target is visible.
The query parameter is applied once; later navigation does not rewrite the URL.

`ProjectExplorerViewProps` gains an optional `onOpenModuleTree?: (id) => void`.
When set, the module detail header shows "Show in module tree", which opens
`/modules/latest?module=<id>` in a new tab. The radial graph's double-click
keeps its drill-down meaning.

### T7. Resource budget

| Measure | Budget |
| --- | --- |
| `placeTree` on a synthetic 500-module tree, depth 6 | ≤ 25 ms median of 20 runs in Node |
| First tree render after `projectView` resolves, `reference` | ≤ 500 ms in Chromium |
| Collapse/expand of the root's largest child, `reference` | ≤ 100 ms to next paint |
| Added `explorer` bundle size | ≤ 25 KiB gzipped over Plan 6B's bundle |

## Ownership and exposure

| Owner | Change |
| --- | --- |
| root `module.ramify` | Exposes `ModuleTreeView`, `ModuleTreeViewProps` and the tree helpers received from `presentation` to descendants, as it does for the import explorer. |
| `presentation [ui, browser]` | `module.ramify` exposes `placeTree` and `Point` to descendants, and re-exposes `ModuleTreeView`, `ModuleTreeViewProps`, `indexModuleTree`, `collapsibleAtDepth` and `ancestorsOf` to its parent. |
| `presentation/project-view [ui, browser]` | `ModuleTreeView`, its node and panel components, pure tree helpers (visible nodes, subtree counts, depth, ancestors), CSS and tests; optional `onOpenModuleTree` in `ProjectExplorerView`. |
| `explorer [ui, browser, dispatch]` | `usePublishedProjectView`, `ModuleTreePage`, `initialModuleId` for both pages, entry path selection, home page entry, new-tab opener. |
| `service-api [dispatch]` | `/modules/latest` served as the app. |
| `integration-tests [testing, ui, dispatch]` | HTTP and real-browser evidence. |

`project-view` importing `placeTree` from its sibling `layout` needs the
`presentation` exposure to descendants; `layout`'s `browser` symbol tag is
compatible with `project-view`'s header. If review prefers not to widen that
exposure, the fallback is `d3-hierarchy`'s `tree()` inside `project-view`,
with the same T3 contract.

## Iterations

| # | Title | Outcome |
| --- | --- | --- |
| 1 | Tree view component | T3, T4 and the `placeTree` exposure, under component and pure tests. |
| 2 | Connected tree page | T1, T2, T5 without `?module=`: hook extraction, tree page, entry, home entry and server path. |
| 3 | Cross-navigation and gate | T5 and T6 focus behavior, links both ways, T7 measurements, real browser acceptance, roadmap and report. |

Iterations run in order; each file is self-contained.

## Acceptance

Fixtures: `tree-fixture` is a hand-built `ProjectExplorerModel` with a root,
three levels, one module with 12 children, one module with denied accesses,
one with coverage notes, one without a README and IDs containing `/`;
`reference` is Collection Review, `toolkit` is Ramify and `mutation` is an
isolated temporary copy of a small real project.

| ID | Iter | Evidence | Required witness |
| --- | ---: | --- | --- |
| MT01 | 1 | pure | Visible-node, subtree-count, depth and ancestor helpers on `tree-fixture`, including a collapsed middle level and the several-roots case. |
| MT02 | 1 | component | Root renders at the top; every child's `y` exceeds its parent's; one edge per visible parent–child pair and no import edges. |
| MT03 | 1 | component | Node shows name, class colour, file and child counts, denied badge, coverage marker and no-README marker per T3. |
| MT04 | 1 | component | Toggle collapses and expands, shows `+K`, keeps selection; node click selects, pane click clears; keyboard `←`/`→`/Enter/`o`. |
| MT05 | 1 | component | Panel shows every T4 section for a selected module, the purpose-state wording, and the summary with nothing selected; a clicked dependency name selects it and expands its ancestors. |
| MT06 | 1 | component | Double-click and "Open in import explorer" call `onOpenModule` with the ID; the synthetic node does not. |
| MT07 | 1 | pure | T7 `placeTree` budget on 500 synthetic modules. |
| MT08 | 2 | component | The import explorer's existing page tests and RS12 pass unchanged on the extracted hook. |
| MT09 | 2 | component | Tree page: initial collapse rule at 60 and 61 modules; a newer revision marks stale; refresh keeps surviving selection and collapsed IDs and drops removed ones; binding notice keeps the tree. |
| MT10 | 2 | HTTP | `/modules/latest` and `/modules/latest?module=x` serve the app with the Plan 6B host policy; home lists both pages. |
| MT11 | 3 | component | Tree `initialModuleId`: nested target selected, ancestors expanded; unknown target notice. |
| MT12 | 3 | component | Import explorer `initialModuleId`: each T6 row, including filters reset. |
| MT13 | 3 | component | "Show in module tree" appears only with `onOpenModuleTree`, and both openers encode `/` in IDs. |
| MT14 | 3 | browser | Real server + Chromium on `toolkit`: open `/modules/latest`, collapse and expand, select `ramify/analysis/model` and see its README paragraph, double-click it, and the new tab shows the import explorer scoped to `analysis` with `model` selected; "Show in module tree" returns to it selected. |
| MT15 | 3 | browser | `mutation`: add a module directory with `module.ramify` and README; the tree marks stale; refresh shows the new node at the same URL with the prior selection kept. |
| MT16 | 3 | browser | `reference`: T7 first-render and collapse budgets and the bundle size delta recorded; no console errors. |

Quick and component evidence do not establish MT14–MT16.

## Deferrals

- A tree-specific transport projection without edges or exports. The tree
  receives the full model; measure its size in MT16 before deciding.
- Search or filtering in the tree, and presentation-class filters.
- Showing import edges, or dependency highlighting, in the tree.
- Export signatures, access lists and discussion in the tree panel.
- Persisting collapsed state across reloads, or encoding it in the URL.
- Same-tab navigation or a combined single-page view with shared selection.
- Horizontal orientation and draggable nodes.
