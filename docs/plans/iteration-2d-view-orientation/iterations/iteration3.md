# Iteration 3: Non-pollution evidence, hit cost, budgets and completion

**Plan:** [Plan 2D](../main-plan.md).
**Prerequisites:** iterations 1 and 2; the baseline archive under
`../evidence/baseline/`.
**Owners:** evidence and documentation; no source owner. A defect found here
is fixed in its owner and its focused tests, and recorded in the results.

## Goal

Establish on real projects that the additions are present, that nothing else
moved, and what they cost.

## Read first

- Main plan: non-pollution invariant, VO13 to VO16, completion gate, handoff.
- Plan 2C's [completion report](../../iteration-2c-module-measurements/iterations/iteration4-results.md)
  and `plan2c-measurements.json`: the hit-cost recipe, its term list and the
  budgets.
- Plan 2B's [completion report](../../iteration-2b-generated-views/iterations/iteration10-results.md):
  the thresholds that failed and their deferral.
- The [testing guide](../../../development/testing.md) for reporting what ran.

## Deliverables

1. Final archives beside the baseline, produced by the same commands on the
   toolkit and the reference project with the installed executable and a real
   daemon, and a comparison script's output listing every path whose hash or
   length changed and every added path.
2. The hit-cost re-measurement with Plan 2C's recipe and terms, reported per
   term as lines and bytes before and after, with each added hit line
   attributed to one named addition.
3. Budget measurements: architect session query, whole materialization,
   published architect bytes, unchanged repeat; API view totals and the
   largest README on the toolkit, the reference project and S100.
4. `iteration3-results.md` as the completion report: VO01 to VO16 with their
   evidence, the archives, the deltas, the disposition of RD-1 to RD-6,
   failures and unexecuted cases stated as such.
5. The roadmap's Plan 2D row, brief and preserved-information row advanced to
   implemented, and the architect view specification's implementation status
   updated.

## Matrix rows executed here

VO13 to VO16.

## Verification

The comparison must report, and only report: added `README.md` files in API
view directories; the architect `_meta.json`; the architect `README.md` with
exactly one added line; non-leaf `module.json` files with `subtree`; and every
`module.json` with changed `views` byte values equal to the sum of the
relevant README sizes. Any other changed path fails VO13. The two documented
API searches over the recorded term list must be identical to the baseline
output. For VO14, a module-identifier term may gain at most two hit lines per
non-leaf module, one in each `subtree` list; record the actual counts. macOS evidence, if no host is
available, is recorded as not executed, never as passed.

## Exit criteria

VO13 to VO16 have evidence or a stated failure; the completion gate of the
main plan is met or its unmet parts are listed for the user's decision.

## Handoff

The completion report, archives and hit-cost delta to the inspection
successor, Plan 4 and Plan 7, as the main plan's handoff names them.
