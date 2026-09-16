# Iteration 3 results: module-only project view

**Date:** 2026-09-16. **Result:** completed with only the planned Iteration 4
consumer type errors. **Plan:** [Plan 6A](../main-plan.md).

## Implemented behavior

The reusable project-view owner now has no non-module target concept.
`GraphSelection` contains only the module-edge variant, `ModuleGraphProps` has
no target collection, and graph edge construction accepts only
`ExplorerEdge`s whose consumer and provider are present module nodes.

The radial graph constructs nodes only for in-scope and out-of-view Ramify
modules. Out-of-view modules retain their dashed presentation, depth badge and
non-interactive node behavior, while their incident module edges remain
selectable. Target layout, badges, edge identifiers and selection payloads were
removed. Pan and zoom state, controls, minimap, module selection and
deselection, edge selection and deselection, and drill-down behavior remain.

`ProjectExplorerView` now validates selected edges only by their module
endpoints and renders only module, module-edge and empty sidebar states. Module
and edge coverage continue to use `moduleIds` and `edgeIds`; there is no target
coverage lookup. Filters, breadcrumbs, exports, optional discussion and sidebar
resizing retain their previous behavior.

No declaration or exposure edit was needed in this iteration: Iteration 2 had
already removed `ExplorerTargetGroup` from the public DTO and the presentation
parent exposure, while the project-view owner continues to expose the narrowed
`GraphSelection` and `ModuleGraphProps` under their existing names.

## Component evidence

The radial graph test inspects the actual props passed to React Flow. Its normal
fixture contains exactly module nodes `a` and `b`; its only edge has endpoints
`a` and `b` and carries `{ kind: 'edge', id, edge: ExplorerEdge }` data. A
separate positive control adds out-of-view module `c`, verifies that the `a` to
`c` module edge remains, and verifies that selecting the `c` node is disabled.

The project-view fixture no longer constructs removed DTO fields or target
selections. Existing tests cover module and edge detail, selection persistence,
deselection, filters, breadcrumbs, drill-down, coverage, exports, optional
discussion, pan and zoom retention, minimap presence and sidebar resizing. The
empty sidebar names only modules and dependency edges.

A new zero-dependency fixture retains the four-module hierarchy and presents
the two top-level child modules with zero graph edges. It renders the ordinary
project view with `0 module dependencies`, not the empty or failure state.
This supplies the positive control required by MX11.

## Verification

- `npm test -- subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx`
  passed: 1 file, 10 tests.
- `npm test -- subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx`
  passed: 1 file, 20 tests.
- `npm run type-check` reached the expected intermediate failure with 11 errors,
  all in Iteration 4 consumers. No project-view owner error was reported.

The exact remaining type errors are:

```text
subs/explorer/src/ProjectExplorerPage.tsx(159,29): error TS2339: Property 'otherTargets' does not exist on type 'ProjectExplorerModel'.
subs/explorer/src/ProjectExplorerPage.tsx(159,47): error TS7006: Parameter 'item' implicitly has an 'any' type.
subs/explorer/src/ProjectExplorerPage.tsx(159,80): error TS2339: Property 'target' does not exist on type 'GraphSelection'.
subs/explorer/src/ProjectExplorerPage.tsx(160,25): error TS2345: Argument of type '{ kind: "target"; id: string; consumerModuleId: any; target: any; } | null' is not assignable to parameter of type 'SetStateAction<GraphSelection | null>'.
  Type '{ kind: "target"; id: string; consumerModuleId: any; target: any; }' is not assignable to type 'SetStateAction<GraphSelection | null>'.
    Types of property 'kind' are incompatible.
      Type '"target"' is not assignable to type '"edge"'.
subs/explorer/src/ProjectExplorerPage.tsx(160,60): error TS2339: Property 'consumerModuleId' does not exist on type 'GraphSelection'.
subs/explorer/src/ProjectExplorerPage.tsx(161,83): error TS2339: Property 'consumerModuleId' does not exist on type 'GraphSelection'.
subs/integration-tests/src/browser-acceptance.ts(276,24): error TS2339: Property 'otherTargets' does not exist on type 'ProjectExplorerModel'.
subs/integration-tests/src/browser-acceptance.ts(276,42): error TS7006: Parameter 'item' implicitly has an 'any' type.
subs/integration-tests/src/browser-acceptance.ts(276,76): error TS7006: Parameter 'id' implicitly has an 'any' type.
subs/integration-tests/src/browser-acceptance.ts(277,34): error TS7006: Parameter 'id' implicitly has an 'any' type.
subs/integration-tests/src/browser-acceptance.ts(279,48): error TS7006: Parameter 'id' implicitly has an 'any' type.
```

## Handoff

Iteration 4 receives the edge-only `GraphSelection`, module-only graph props and
the two passing component suites. It must remove target reconciliation from
`ProjectExplorerPage.tsx` and target assertions from `browser-acceptance.ts`,
then run the connected router, HTTP and browser acceptance gates. No Iteration 4
consumer was changed here.
