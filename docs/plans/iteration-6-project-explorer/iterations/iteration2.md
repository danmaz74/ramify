# Iteration 2: Lift the radial graph

**Plan:** [Plan 6: Project explorer](../main-plan.md).
**Prerequisites:** Iteration 1's compatibility contract and verified source.
**Owners:** new `presentation/subs/project-view [ui, browser]`.

## Goal

Copy and adapt the cucumber-viz radial graph bundle while preserving its
geometry, navigation and interaction behavior.

## Read first

- [Lift inventory](../lift-inventory.md): graph files, styles and provenance.
- [View model](../view-model.md): graph-facing modules, edges and target groups.
- The cucumber-viz graph bundle and `ModuleGraph.test.tsx` at the pinned commit.

## Deliverables

1. Copy `ModuleGraphRadial.tsx`, `moduleGraphShared.ts`,
   `moduleTypePresentation.ts` and `ModuleGraphLegend.tsx` to their mapped
   destinations with provenance comments.
2. Replace the host type barrel with compatibility-model types. Keep geometry,
   edge construction, interaction hooks, minimap and controls.
3. Drive color, legend and filtering from `presentationClass`; keep the hashing
   and palette implementation unless a direct host dependency prevents it.
4. Adapt out-of-view nodes to support both module edges and other-target groups.
5. Extract the graph, legend, animation and sizing CSS plus the graph framework
   stylesheet import.
6. Copy and adapt `ModuleGraph.test.tsx`, recording every changed assertion.

## Matrix rows executed here

EX02, EX03, EX04, EX05.

## Verification

Run the ported graph tests over a compatibility fixture. Compare the rendered
node/edge inventory and recorded interaction callbacks with the source tests.
Inspect the diff against the copied source and explain each behavioral change.

## Exit criteria

The graph bundle renders and passes its preserved interaction tests with no host
service/store/router import. Pan, zoom, minimap, selection and filtering remain.

## Handoff

Iteration 3 receives the graph component and selection callbacks. Iteration 5
receives the finished pure graph view.

