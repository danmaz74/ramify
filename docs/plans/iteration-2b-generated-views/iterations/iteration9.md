# Iteration 9: Evidence, regressions and completion gate

**Plan:** [Plan 2B: Generated project views](../main-plan.md).
**Prerequisites:** Iterations 7 and 8, with every earlier binding leaf passing.
**Owners:** harness process cases, measurement scripts and artifacts, ignore
rules, agent guidance, declarations validation and documentation.

## Goal

Prove all three views on real projects and processes, confirm no predecessor
regression and close the plan with a completion report.

## Read first

- [Completion gate](../main-plan.md#completion-gate) and the full
  [instance inventory](../subcases.md).
- Every Plan 2B results file; Plan 2A's completion report and measurement
  recipes.
- Root and reference `.gitignore`, `AGENTS.md`, the architecture index, roadmap
  and testing guide.

## Deliverables

1. Add ignore rules for `.exported_symbols/`, `docs/modules/` and transient
   forms to the toolkit and reference project; add the short `AGENTS.md`
   section.
2. Run compiled R and T materializations with independent expected trees,
   unchanged repeats, Git status checks and `check:self` input identity.
3. Record R, T, S100 and S1000 smoke measurements and just-over/just-under
   limit cases. Record S500 as not required.
4. Produce the Linux platform manifest and the macOS command; the platform row
   fails without a macOS artifact.
5. Run the Plan 1, 2, 5 and 2A gates, one at a time, and compare with their
   recorded baselines. The full Vitest suite runs through the cucumber-viz audit.
6. Validate twelve declarations, eight package entries and lightweight
   CLI/client closures; remove unused `ApiView*` relays.
7. Update the architecture index, a new generated-views specification or a
   revision section beside the API view specification, roadmap, CLI and testing
   guides.
8. Write `iteration9-results.md` as the completion report.

## Matrix rows executed here

I2B-10: all seven leaves. I2B-11: all four leaves, plus the unfiltered
requirement for every earlier leaf.

## Verification

Run the commands in the completion gate on one build with owned endpoint
directories. Run long gates detached and poll them in the foreground until they
exit. Run `git diff --check` and link checks on changed files.

## Exit criteria

Every binding Plan 2B leaf passes, predecessor gates show no regression, the
views and command are documented with measured limits, and resources are
cleaned.

## Handoff

The completion report lists the registry contract for future views, measured
limits, waivers, unexecuted rows and remaining gaps.
