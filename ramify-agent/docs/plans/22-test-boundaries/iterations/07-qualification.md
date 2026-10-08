# Iteration 7: full qualification and handoff

**Plan:** [Plan 22](../main-plan.md). **Prerequisites:** iteration 6. **Owners:**
project verification and responsible architect's preservation assessment.

## Goal

Establish complete configured correctness, preserved real boundaries and a
measured runtime improvement on the exact delivered source.

## Read first

[Acceptance matrix](../acceptance.md), [verification contract](../contracts.md#7-preservation-and-qualification),
all iteration receipts, iteration 1 baseline, current complete audit definition,
boundary registry and case migration map.

## Deliverables

Review all case treatments and acceptance IDs with the responsible architect.
Freeze final discovery and source/configuration identity. Run the complete audit
and explicitly required opt-in boundary witnesses, retaining real outcomes.
Archive zero ordinary process counts, actual boundary command counts, no-target
sleep controls, cleanup results, top file/case times and baseline/final comparison.
Explain changed counts and distinguish source changes from measured performance.
If timing remains poor, identify the remaining critical path and leave the speed
correction unresolved rather than inventing completion from a green audit.

## Matrix rows executed here

TB02, TB04, TB11, TB14, TB15 and TB16; qualification of all earlier rows.

## Verification

From the repository root on a clean committed candidate:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

Use its configured execution for the full regression; do not run another direct
whole suite. Run focused actual boundary workloads separately only when the full
audit did not execute their declared opt-in path. Compare timing to iteration 1
on the same host/four-worker policy, with comparable expected behaviors. Numeric
gates are zero ordinary attempts, lost requirements, discovery gaps/duplicates,
live owned leaks and no-target cleanup sleeps. Repeated no-op timing and suite
speed evidence supplement, rather than replace, those deterministic controls.

## Exit criteria

Every row has actual evidence, the complete configured audit passes, real
boundaries are qualified, no new skip/retry/timeout workaround exists, and the
responsible architect has assessed semantic preservation. Report missing or
unrun evidence explicitly; planning validation cannot satisfy this iteration.

## Handoff

`iteration7-results.md` and `final-results.md`, source/audit references,
case map, declared commands, boundary registry and performance comparison.
