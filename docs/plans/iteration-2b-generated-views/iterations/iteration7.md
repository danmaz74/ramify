# Iteration 7: Exported-symbols view

**Plan:** [Plan 2B: Generated project views](../main-plan.md).
**Prerequisites:** Iterations 4 and 6.
**Owners:** `analysis/views` exported-symbols view and its tests, and the
reserved table entry already added in iteration 3. Independent of iteration 8.

## Goal

Generate `.exported_symbols/` with each module's exposed symbols, internal
exports and test inventory, as defined in the scope.

## Read first

- [Exported-symbols view](../scope.md#exported-symbols-view) and the review
  decisions recorded by iteration 1.
- Iteration 4 and 6 results; Plan 2A symbol-detail rendering rules.
- The model's `Exposure` and `Original` records and the catalog's
  `FileExports`.

## Deliverables

1. Implement the view: module-identifier layout, `_meta.json`, and the
   common text layout.
2. `exposed-symbols.txt`: owned effective exposures with destinations, tags,
   aliases and signatures; `relayed` and `ineffective` sections; `[testing]`
   file markers.
3. `internal-exports.txt`: owned exports without an owned exposure, excluding
   foreign forwards and namespace exports.
4. `tests.txt`: testing-classified files per owner, rendering the provider's
   hierarchy, descriptions, lines and exceptional states.
5. Register the view and its recognizable-target shape.
6. Write hand-made expected files for three reference modules and compare them
   byte for byte.

## Matrix rows executed here

I2B-08: all ten leaves.

## Verification

Focused views tests over F and R fixtures with independent expectations,
shuffled-input determinism, and `npm run type-check`. No build while iteration
8 runs; the coordinator builds after the group.

## Exit criteria

The view renders complete, deterministic files for every module, matching the
independent reference expectations.

## Handoff

The view and its expected reference files go to iteration 9.
