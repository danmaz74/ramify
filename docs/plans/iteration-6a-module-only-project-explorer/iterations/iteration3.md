# Iteration 3: Module-only project view

**Plan:** [Plan 6A: Module-only project explorer](../main-plan.md).
**Prerequisites:** iteration 2's narrowed model.
**Owner:** `presentation/subs/project-view [ui, browser]`.

## Goal

Make the reusable explorer render and select only modules and module dependency
edges, including when it is used independently of Ramify's connected page.

## Read first

- [View-model amendment](../view-model-amendment.md).
- `subs/presentation/subs/project-view/src/moduleGraphShared.ts`.
- `subs/presentation/subs/project-view/src/ModuleGraphRadial.tsx`.
- `subs/presentation/subs/project-view/src/ProjectExplorerView.tsx`.
- The two component test files under the owner's `src/tests/`.

## Deliverables

1. Narrow `GraphSelection` to its module-edge variant and remove
   `ModuleGraphProps.otherTargets` plus target-edge ID helpers.
2. Remove target nodes and target edges from radial graph construction. Preserve
   out-of-view nodes because they represent Ramify modules.
3. Remove target selection validity, target details and target coverage lookup
   from `ProjectExplorerView`.
4. Preserve module/edge deselection, pan/zoom, minimap, tag filtering,
   breadcrumbs, drill-down, exports, coverage and optional discussion behavior.
5. Replace target-heavy test fixtures with module-only fixtures and add graph
   assertions over node kinds and edge endpoints.
6. Prove a module hierarchy with zero dependency edges is a normal view.

## Matrix rows executed here

MX01 and MX08–MX11.

## Verification

Run:

```sh
npm test -- subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx
npm test -- subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx
npm run type-check
```

Component tests inspect the graph component's nodes/edges, not only visible
text. Keep a nested out-of-view module positive control and confirm its node is
selectively non-interactive as before without confusing it with an external
target.

Expected intermediate failure: full type checking may still identify the old
target reconciliation in `explorer`; that consumer belongs to iteration 4.

## Exit criteria

The reusable view's public props, internal graph data, selection callbacks and
sidebar states have no non-module target concept, while all unchanged Plan 6
module interactions pass.

## Handoff

Iteration 4 receives the narrowed `GraphSelection`, component evidence and the
remaining connected-page errors.
