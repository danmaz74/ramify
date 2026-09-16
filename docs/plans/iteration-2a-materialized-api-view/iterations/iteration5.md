# Iteration 5: Complete API-view projection

**Plan:** [Plan 2A: Materialized API discovery](../main-plan.md).
**Prerequisites:** Iteration 2 isolation, iteration 3 availability provider and
iteration 4 symbol details.
**Owners:** `analysis` composition and its tests.

## Goal

Join one valid inventory/model/catalog with symbol details into complete,
deterministic ordinary and testing projections, without writing files or
retaining the result.

## Read first

- [Defining names/files](../scope.md#defining-names-and-files),
  [analysis projection contract](../contracts.md#analysis-projection), and all
  provider handoffs from iterations 2–4.
- `session-facts.ts`, analysis report ordering/limit helpers, inventory module
  ancestry and catalog export/original identity helpers.
- Reference modules containing direct children, deep descendants, ancestors,
  siblings, testing source, forwarded exports and aliases.

## Deliverables

1. Implement `projectApiView` over explicit `SessionFacts`, sequence, selection
   and detail results. Reject invalid facts/location/path/identity rather than
   silently dropping entries.
2. Resolve one module by longest declared-directory prefix or every module in
   byte order. Create a testing projection only for an already-present tests
   area.
3. Join available originals to their defining-file export names, deduplicate
   redundant paths, classify by original-owner ancestry and group by canonical
   project-relative defining file.
4. Recompute testing availability independently and prove ordinary entries are
   repeated where still available. Do not create overlay data.
5. Count only API-omission coverage, detail-unavailable and truncated entries;
   produce empty complete areas without placeholder files.
6. Enforce area/invocation projection bounds before returning any projection.
   Compute deterministic encoded bytes and release intermediate indexes.
7. Add R/T/F/S1000 tests for reversible paths, extensions, order, aliases,
   categories, coverage and no package/builtin entries.

## Matrix rows executed here

I2A-05: all nine leaves.

## Verification

Run focused analysis projection tests, model/TypeScript provider suites and
type-check. Compare projection membership to independent expected tables for R
and F, not only to existing enforcement code. Shuffle semantically equal inputs
and require deep equality. Just-over limits must return no prefix.

## Exit criteria

One pure composition returns complete, bounded, deterministic per-area data with
the exact child/external and test-completeness semantics. It performs no output
writes and retains nothing.

## Handoff

The frozen projection becomes the input of iteration 6's renderer/publisher and
iteration 7's retained query.
