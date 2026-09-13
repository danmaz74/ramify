# Iteration 7: Closure and measurement recipe

**Plan:** [Plan 5 structural edit latency](../main-plan.md).
**Prerequisites:** iterations 1 to 6.
**Owners:** documentation; no source change.

## Goal

The plan's evidence is gathered in one closure, the brief and the
optimization analysis point at it, and the measurement successor has an exact
recipe.

## Read first

- Main plan: rows SE-1 to SE-17, [Deferrals](../main-plan.md#deferrals),
  [Decisions for review](../main-plan.md#decisions-for-review), [Handoff](../main-plan.md#handoff).
- Every `iterationN-results.md` of this plan.
- [Hook optimization closure](../../iteration-5-hook-optimization/iterations/closure.md)
  and [measurement results](../../iteration-5-hook-optimization/iterations/measurement-results.md):
  the format and the commands, archives and contention classification to
  repeat.
- [Structural edit latency brief](../../../analysis/structural-edit-latency.md).
- [Optimization analysis](../../../analysis/fast-incremental-checks-optimization.md):
  the ranked targets table and the deferrals table.

## Deliverables

1. **Closure** in `iterations/closure.md`: delivered repairs per hypothesis,
   contract clarifications with where they are recorded, test file and case
   per matrix row at the closing commit, commit audit results per iteration,
   and remaining gaps gathered from every results file.
2. **Brief.** Its status line points at this plan's evidence section and the
   closure; its hypotheses table is not rewritten.
3. **Analysis.** The optimization analysis's deferrals table marks
   resolution-bounded narrowing as delivered with a link, and its recommended
   next targets drop the delivered ones.
4. **Measurement recipe.** In the closure: the focused commands for
   `hook-latency-s100` and `hook-latency-reference`, the environment fields to
   record, the contention classification to repeat, the timing fields to
   attribute each row with, including `promotion` and `sweep`, and the three
   acceptance figures to compare against the 2 s budget.
5. **Roadmap link.** One sentence under Plan 5 in `docs/roadmap.md` linking
   this plan as a draft successor of the hook optimization, if the roadmap
   still lacks it.

## Matrix rows executed here

SE-17 `docs-updated`.

## Verification

```sh
git diff --check
```

Links in the edited documents resolve; no source or test file changes. Then
the cucumber-viz commit audit on the worktree.

## Exit criteria

- SE-17 reviewed: every matrix row has a named test case or results section.
- The closure lists every deferral and review decision with its current
  status.

## Handoff

The closure and recipe for the measurement successor, which replaces this
plan's derived estimates with measured medians and re-ranks what remains.
