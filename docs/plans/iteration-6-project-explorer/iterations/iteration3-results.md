# Iteration 3 results: lifted page and details

**Status:** complete. **Plan:** [Plan 6](../main-plan.md). **Iteration:**
[iteration3.md](iteration3.md).

## Summary

Lifted the page view, export panel, page styles and all thirteen named page
tests from cucumber-viz commit
`44b7f30e0fdfda79ead8363ef4c85c100e36fda0`. The result is a pure
`presentation/subs/project-view [ui, browser]` component: it accepts the frozen
compatibility model, graph and optional discussion component through props and
imports no transport, filesystem, analyzer, session or host UI implementation.

The source layout and interactions remain: tag-class filters, single-root
overview, breadcrumbs, drill-down, out-of-view neighbors, controlled mutual
selection, resizable details, collapsible panels, dependency expansion,
loading/error/empty/retry states and stale refresh affordance. Ramify-specific
adaptations replace claims that do not hold:

- declared-tag presentation classes replace inferred module types;
- allowed, denied and limited status plus decision reasons replace barrel,
  deep-import and violation badges;
- owned and subtree files, access occurrences, selected symbols and approximate
  complexity retain their named units;
- export aliases, value/type capability, forwarding, exposure destinations and
  exact source locations replace declaration kinds and server/client barrels;
- described, truncated and unavailable signature results are distinct from
  idle and loading; missing original identity is explicitly unavailable;
- package, builtin, standard-library, outside-module and unresolved target
  groups have their own detail panel; and
- incomplete coverage is visible globally and on associated modules, edges and
  target groups rather than appearing as measured zero.

The component displays the model revision. State ownership for selection,
filters, scope, expansion, details and refresh remains with the future connected
page, while the view itself performs only presentation filtering and aggregation.

## Source reuse account

These categories are provisional Iteration 3 inputs to the final EX10 report.

| Source at `44b7f30` | Destination | Category | Adaptation |
| --- | --- | --- | --- |
| `ui/components/ExportList.tsx` | `src/ExportList.tsx` | behaviorally changed | Preserved the expandable row, capability marker, badges, chevron, loading spinner and signature panel. Replaced declaration-kind and barrel fields with aliases, value/type capability, forwarding, effective exposure destinations and source locations; added exact described/truncated/unavailable states. |
| `ui/pages/ModuleArchitecturePageView.tsx` | `src/ProjectExplorerView.tsx` | behaviorally changed | Preserved controlled graph/selection props, scoped navigation, filter reconciliation, stale refresh, resize handling, collapsible module/edge panels and loading/error/empty layout. Replaced the host DTO and labels, injected graph/discussion/detail callbacks, added single-root, other-target, coverage and explicit unavailable presentation. |
| `ui/pages/ModuleArchitecturePageView.test.tsx` | `src/tests/ProjectExplorerView.test.tsx` | behaviorally changed | Ported every one of the thirteen named tests to compatibility fixtures and the injected discussion stub, then added six Plan 6 witnesses. |
| repository-root `ui/styles.css` page/export/spinner rules | `src/project-view.css` | behaviorally changed | Retained the source class structure, layout, resize affordance, collapsibles, filters, breadcrumbs, dependency rows, export rows and spinner. Added the local sized wrapper and styles for Ramify statuses, exposure/detail facts, coverage and unavailable states so no host stylesheet is required. |

Every lifted TypeScript destination retains the exact source path and full
commit in its provenance comment. The frozen source blobs are
`4428c691217c09e0b8a1d9c873fe30cad4107a73` for `ExportList.tsx`,
`f96e9e605425891bde599a8b4849f137b664d71f` for the page and
`de35526e9094dcede2e7e1735362d628de8cf3dd` for the page test.

## Assertion reuse account

No reusable source test or assertion was removed. The source test names remain
unchanged for traceability even where their host-specific wording now describes
the injected discussion fixture.

| Source test | Outcome and changed assertions |
| --- | --- |
| `renders module type checkboxes and toggles a type filter` | Preserved checkbox and callback behavior; changed the assertion from inferred `core-domain` to declared `browser+ui`. |
| `disables module type checkboxes when no modules exist for that type` | Preserved disabled-zero behavior; a globally known `ui` class has zero modules in the current scope instead of using a fixed host registry entry. |
| `preserves selected module detail across re-renders` | Preserved rerender assertions; `Export inventory` replaces the false `Public Interface` label. |
| `preserves selected edge detail across re-renders` | Preserved rerender assertions; the frozen edge selection and `Source accesses` replace the flattened host edge and `Methods Used`. |
| `renders "Chat with Claude" heading when a module is selected` | Preserved selected-module slot visibility through the injected discussion component; removed the Claude-specific production dependency. |
| `renders "Chat with Claude" heading when an edge is selected` | Preserved selected-edge slot visibility and directional context through the injected discussion component. |
| `does not render chat section when nothing is selected` | Preserved absence and empty-sidebar assertions; the empty message now includes other targets. |
| `shows composer placeholder with module name for module selection` | Preserved the exact contextual placeholder behavior in the injected fixture. |
| `shows composer placeholder with edge direction for edge selection` | Preserved the exact directional placeholder behavior in the injected fixture. |
| `renders Send button in the composer` | Preserved the action assertion in the injected fixture. |
| `disables Refresh button when not stale` | Preserved unchanged. |
| `enables Refresh button with stale modifier when stale` | Preserved enabled state, accessible name and stale modifier assertions unchanged. |
| `renders Retry button always enabled in error state regardless of staleness` | Preserved unchanged. |

Six port-specific tests add the witnesses absent from the source suite:

1. single-root overview, breadcrumbs, drill-down and out-of-view modules;
2. sidebar resizing with selected detail retained across rerender;
3. distinct loading, empty and unavailable states;
4. aliases, capability, exposures, locations and all signature result states;
5. decision reasons, coverage and non-application target detail; and
6. rendering with neither host service nor discussion component.

## Acceptance evidence

| Row | Witness | Result |
| --- | --- | --- |
| EX06 | The single declared root opens onto its children; a module edge to the root supplies an out-of-view node; breadcrumb navigation and graph drill-down invoke their controlled callbacks. | Passed. |
| EX07 | Module, edge and target details retain their selection on rerender; pointer movement clamps the sidebar to the source bounds; loading, retry, empty and unavailable states remain distinct. | Passed. |
| EX08 | Expanding a compatibility export shows aliases, value/type capability, exposure destinations and source locations, then renders loading, described, truncated and unavailable detail callback states. | Passed. |
| EX09 | The suite renders the page with a stub graph and no discussion component, while separate page tests prove that an injected discussion slot receives module, edge and target context. | Passed. |

## Verification

| Command | Result |
| --- | --- |
| `npm test -- subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx` | Passed: 2 files, 29 tests (all 20 frozen source behaviors plus 9 Plan 6 witnesses across graph and page). Nineteen source names remain verbatim; the misleading graph title `method count` became `access count` while preserving its assertions. |
| `npx tsc --noEmit --pretty false` | Passed. |
| `npx tsc -p tsconfig.portable.json --pretty false` | Passed. |
| `npm run build` | Passed; the production output contains the view, export panel, declarations and extracted stylesheet. |
| Isolated `dist/src/ramify check --root .` followed by daemon stop | Passed: 12 owners, 313 source files, 9 resources, 4,297 accesses, zero findings and zero analysis limits. |

The first isolated self-check failed because a default function declaration did
not expose the named `ProjectExplorerView` binding required by the three relay
declarations. The view now has an explicit named export plus its default export;
the rebuild and isolated rerun passed. This was an intermediate declaration
error, not acceptance evidence.

## Handoff

Iteration 5 receives `ProjectExplorerView`, `ProjectExplorerViewProps`,
`ExportDetailState`, `ExplorerDiscussionProps` and the existing graph boundary.
The connected page should own the controlled filter, scope, selection,
dependency-expansion and export-detail states; clear detail state on revision
refresh; pass the displayed revision's exact detail result; and omit the
discussion component unless a consuming host supplies one.

Iteration 7 receives this source/assertion account and the nineteen-test page
suite. Service projection, retained detail delegation, connected-page state,
transport, CLI and browser acceptance remain outside this iteration.
