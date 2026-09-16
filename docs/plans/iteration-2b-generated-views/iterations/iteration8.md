# Iteration 8: Module-docs view

**Plan:** [Plan 2B: Generated project views](../main-plan.md).
**Prerequisites:** Iteration 6.
**Owners:** `analysis/views` module-docs view and its tests. Independent of
iteration 7.

## Goal

Generate `docs/modules/`, mirroring the module tree with one relative `docs`
symlink to each module's `src/docs` directory.

## Read first

- [Module-docs view](../scope.md#module-docs-view),
  [replacing an existing target](../scope.md#replacing-an-existing-target) and
  the review decisions recorded by iteration 1.
- Iteration 3 publisher results and iteration 6 results.
- Inventory module directories and area presence.

## Deliverables

1. Implement the view from the inventory only: identifier-derived directories,
   symlinks for modules whose `src/docs` is a real directory and relative
   targets.
2. Register the view and its recognizable-target shape.
3. Prove resolution after publication, absence for modules without `src/docs`
   and the root-module case.
4. Prove that source under a linked `src/docs` is analyzed only at its real
   path.

## Matrix rows executed here

I2B-09: all six leaves.

## Verification

Focused views tests, publisher tests over real temporary roots and one retained
session case. `npm run type-check`. No build while iteration 7 runs.

## Exit criteria

The view produces the exact link tree, resolves every link and adds no analysis
input.

## Handoff

The view and its fixtures go to iteration 9.
