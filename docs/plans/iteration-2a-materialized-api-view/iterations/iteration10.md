# Iteration 10: Final declarations, regressions and Plan 3 handoff

**Plan:** [Plan 2A: Materialized API discovery](../main-plan.md).
**Prerequisites:** Iterations 1–9 complete with every binding I2A leaf passing
and performance results/waivers explicit.
**Owners:** cross-owner declarations, package/build/test configuration,
architecture/roadmap/development documentation and completion evidence.

## Goal

Close Plan 2A on one coherent build, prove existing capabilities did not regress,
record exact remaining limits and hand the implemented providers to the still
separate Plan 3.

## Read first

- [Completion gate](../main-plan.md#completion-gate), all iteration results and
  the full [instance inventory](../subcases.md).
- Final source/declarations/package entries, Plan 1/2/5 completion evidence and
  the current testing guide.
- Architecture status sections, roadmap delivery table/Plan 2A/Plan 3 briefs,
  root README/AGENTS and the materialized-view specification.
- Git tree for `docs/plans/iteration-3-project-inspection/` at this plan's
  implementation base.

## Deliverables

1. Validate exact eleven-owner declarations, real exports, consumer type
   relays, all eight package entries, installed launcher and lightweight
   CLI/client import closures. Remove obsolete temporary aliases or test ports.
2. Run the full Plan 2A gate and require every reviewed binding leaf. Record
   performance waivers/unavailable scale fixtures separately and with authority.
3. On one source/build identity run build, type-check, focused/full tests,
   reference catalogue, self/reference checks and the compiled materialization
   workflow with generated views present.
4. Run Plan 1; compare Plan 2 and Plan 5 gates with their published closure
   baselines. Fix new regressions in scope, but do not relabel predecessor
   waivers/defects or expand into unrelated remediation.
5. Update architecture/spec status, roadmap plan order/handoffs, CLI/testing
   guides and root README with implemented commands, limits and evidence.
6. Write `iteration10-results.md` as the completion report: revisions, commands,
   receipts, platform artifacts, measurements, failures/waivers, cleanup and
   remaining deferrals.
7. Verify the existing Plan 3 directory is byte-identical to the implementation
   base. Record which providers it may reuse and that its discovery/query scope
   still requires a separate review; do not edit its artifacts.

## Matrix rows executed here

I2A-13: all seven leaves, plus the unfiltered requirement for every earlier
I2A leaf.

## Verification

Execute the commands in the main plan's completion gate with isolated endpoint
directories and preserved reports. Run link/schema checks, `git diff --check`,
declaration validation and the Plan 3 tree comparison. Attribute pre-existing,
new, waived and unexecuted outcomes separately.

## Exit criteria

All binding Plan 2A cases pass, the runnable command and agent workflow are
documented with current evidence, no existing capability regresses, resources
are cleaned, and the completion report provides a concrete Plan 3 handoff.

## Handoff

Plan 3 may now be revised and reviewed as a successor using the implemented
availability/detail/projection contracts. Its current plan remains preserved;
no Plan 3 execution starts from this iteration automatically.
