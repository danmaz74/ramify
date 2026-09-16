# Iteration 2 results: lifted radial graph

**Status:** complete. **Plan:** [Plan 6](../main-plan.md). **Iteration:**
[iteration2.md](iteration2.md).

## Summary

Created `presentation/subs/project-view [ui, browser]` and lifted the radial
graph bundle from cucumber-viz commit
`44b7f30e0fdfda79ead8363ef4c85c100e36fda0`. The graph remains a pure
props-and-callback component. It imports no service, client, router, store,
session or filesystem implementation.

The source geometry, ring sizing, chord construction, React Flow controls,
minimap and interaction hook remain. The compatibility changes replace
path-inferred module classifications and dependency-cruiser violations with
the frozen Plan 6 DTO:

- `presentationClass` supplies deterministic colors and legend entries;
- owned-file, dependency and approximate-complexity values use their named DTO
  units, and approximate complexity is visibly marked with `~`;
- explicit `ExplorerEdge` rows supply allowed, limited and denied edge states,
  and edge width follows `accessCount`;
- filtered module neighbors remain dashed out-of-view nodes; and
- package, builtin, standard-library, outside-module and unresolved groups can
  appear as dashed target nodes with selectable graph links.

The compatibility DTO is declared once in the new owner's interface file, as
frozen in Iteration 1. The new declarations re-expose the DTO, graph props,
selection and component through presentation and root without adding the
deferred package entry.

## Source reuse account

These categories are provisional Iteration 2 inputs to the final EX10 report.

| Source at `44b7f30` | Destination | Category | Adaptation |
| --- | --- | --- | --- |
| `ui/components/ModuleGraphRadial.tsx` | `src/ModuleGraphRadial.tsx` | behaviorally changed | Kept geometry, nodes, chord path, React Flow configuration, minimap and controls. Mapped fields to `ExplorerModule`, added explicit edges and other-target nodes, and labelled approximate complexity. |
| `ui/components/moduleGraphShared.ts` | `src/moduleGraphShared.ts` | behaviorally changed | Kept edge styling and interaction callbacks. Replaced embedded dependency rows with `ExplorerEdge`, changed the payload to `GraphSelection`, and added target-group edges. |
| `ui/components/moduleTypePresentation.ts` | `src/moduleTypePresentation.ts` | behaviorally changed | Kept the palette, djb2 hash and alpha conversion. Colors and labels now use `presentationClass`; host registry and stale backend-sync claims were removed. |
| `ui/components/ModuleGraphLegend.tsx` | `src/ModuleGraphLegend.tsx` | behaviorally changed | Kept the component structure and swatches. Replaced module-type and violation labels with tag-class and allowed/limited/denied labels and exported its props. |
| `ui/components/ModuleGraph.tsx` | no separate file | mechanically adapted | Collapsed the fourteen-line forwarding component into the named `ModuleGraphRadial` export, as frozen by the lift inventory. |
| repository-root `ui/styles.css` graph rules | `src/project-view.css` | mechanically adapted | Extracted the radial canvas, edge animation and ten legend rules, retained the React Flow stylesheet import and supplied the required local sized-ancestor rule. |
| `ui/components/ModuleGraph.test.tsx` | `src/tests/ModuleGraph.test.tsx` | behaviorally changed | Ported all seven named source behaviors to the compatibility fixture and added three Plan 6 witnesses. |

Every destination retains its source path and full commit in a provenance
comment. The four source blob identities remain those frozen in
[lift-inventory.md](../lift-inventory.md).

## Assertion reuse account

No reusable source test or assertion was removed.

| Source test | Outcome and changed assertions |
| --- | --- |
| `renders radial layout` | Preserved node and edge renderer assertions; added exact module/target inventory, child-count, background, controls and minimap assertions for EX02. |
| `provides module-type color metadata` | Changed `classification.type` and registry-color assertions to `presentationClass`, the same palette hash, and its tag-derived legend label for EX05. |
| `node click selects module and clears edge` | Preserved both callback assertions; only fixture IDs changed. |
| `edge click emits GraphEdgeSelection payload shape` | Preserved mutual exclusion and payload verification; changed the host-specific flattened dependency fields to the frozen `{ kind, id, edge }` `GraphSelection`. |
| `pane click clears both selections` | Preserved both callback assertions unchanged. |
| `clicking selected edge toggles it off` | Preserved clear-without-module-selection assertions unchanged. |
| `scales edge thickness by method count and disables animation` | Renamed “method count” to the truthful `accessCount` unit; preserved the two non-animation assertions and relative-width assertion. |

Three port-specific tests witness source behavior that the original fixture did
not cover: external-target selection and mutual exclusion, out-of-view module
links with non-selectable ghost nodes, and React Flow viewport state surviving
a rerender while the presentation-class-filtered module and legend inventory
changes.

## Acceptance evidence

| Row | Witness | Result |
| --- | --- | --- |
| EX02 | The recording React Flow harness receives the expected module hierarchy badge, one-ring node inventory, module/target links, background, controls and minimap. | Passed. |
| EX03 | Module, module-edge, package-target and pane clicks produce the expected mutually exclusive callbacks. | Passed. |
| EX04 | A selected edge toggles off, edge width follows access occurrences, animation remains disabled and mock viewport state survives component rerender. | Passed. |
| EX05 | `browser+ui` and `dispatch` fixture classes, not paths, determine node metadata and the legend; filtering the module props reconciles both inventories. | Passed. |

## Verification

| Command | Result |
| --- | --- |
| `npm test -- subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx` | Passed: 1 file, 10 tests. |
| `npx tsc --noEmit --pretty false` | Passed. |
| `npx tsc -p tsconfig.portable.json --pretty false` | Passed with project-view in the portable scope. |
| `npm run build` | Passed; production selection accepted the new owner and declarations. |
| Isolated `dist/src/ramify check --root .` followed by daemon stop | Passed: 12 owners, 309 source files, 9 resources, 4,255 accesses, zero findings and zero analysis limits. |
| `git diff --check` over Iteration 2-owned paths | Passed. |

The first build attempt failed because `expose-sub` does not accept a `tagged`
clause. The two relay clauses were corrected to preserve the child binding's
existing tags, then the build and self-check passed. This was an intermediate
declaration error, not a passing result.

## Handoff

Iteration 3 receives `ModuleGraphRadial`, `ModuleGraphProps` and
`GraphSelection`. The page should pass its displayed `modules`, `edges` and
`otherTargets`, supply related filtered modules through `outOfViewModules`,
retain the selected graph ID, and import `project-view.css` once from the view
entry. It can discriminate module edges from non-application targets through
`GraphSelection.kind` without reaching into graph-framework data.

Iteration 5 receives the same pure graph boundary. No transport callback,
service client or runtime owner was introduced here. Page panels, filtering
controls, details and service/CLI wiring remain Iterations 3-6 scope.
