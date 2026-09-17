# Iteration 2: Project diagram facts and baselines

**Plan:** [Plan 6D: Behavioral dependency diagram](../main-plan.md).
**Prerequisite:** iteration 1's per-access facts and BD01–BD06 evidence.
**Owner:** `analysis`; the modularity probe is an independent acquisition
adapter for the two real baselines.

## Goal

Produce bounded, deterministic dependency-diagram facts in one pure
`projectDependencyDiagram`, used by `projectModularity` and later by the
retained session, and record clean Ramify and Collection Review baselines.

## Read first

- [Contracts C2](../contracts.md#c2-dependency-diagram-facts) and BD07–BD13.
- [Modularity report specification](../../../architecture/modularity-report.spec.md),
  especially units, filters, behavior and coverage.
- `subs/analysis/src/modularity.ts`, `modularity-owner.ts`,
  `modularity-context.ts` and `interfaces/modularity.ts`.
- `subs/analysis/src/tests/modularity-fixture.ts`, `modularity.test.ts` and
  `modularity-batch.test.ts`.
- `scripts/probes/modularity/baseline.ts` and its result directory.

## Deliverables

1. Add C2 types, `projectDependencyDiagram` and
   `ModularityView.dependencyDiagram` without changing the existing `behavior`
   field or its unit. Change the schema to `ramify.modularity/2`.
2. Resolve imported-module ownership from each contributing access target and
   original ownership from its defining file under the ownership in use.
3. Aggregate paths per boundary with the fixed precedence, retain unknown facts
   for coverage, omit unused and consumer-owned originals, list every view
   module, and assert headline equality.
4. Derive `status` and `reasons` from the decisions for the fact's own original
   in the contributing access results, never from other selected originals.
5. Apply production/test and candidate ownership consistently. Reuse existing
   ownership, original-key, coverage and byte-limit helpers; create no second
   access graph.
6. Update the modularity report specification with the C2 unit, status,
   unknown, self-loop and schema-version rules; the dependency glossary's
   headline definition is unchanged.
7. Add `dependency-report` fixture cases and deterministic/size/freeze tests.
8. Expose the C2 result types through `analysis/module.ramify` and root
   declaration relays to `daemon` and `service-api`; expose no analysis runtime
   function to them.
9. On a clean implementation commit, build and run the probe for Ramify and
   `examples/collection-review`; record JSON and Markdown under
   `scripts/probes/results/modularity/` with distinct names and exact commits.

## Matrix rows executed here

BD07–BD13.

## Verification

```sh
npx vitest run subs/analysis/src/tests/modularity.test.ts
npx vitest run subs/analysis/src/tests/modularity-batch.test.ts
npx vitest run subs/analysis/subs/typescript/src/tests/dependency-behavior.test.ts
npm run type-check
npm run build
npm run check:self
npm run probe:modularity -- --name plan6d-toolkit
npm run probe:modularity -- --root examples/collection-review --name plan6d-reference
```

The committed baseline commands must run without `--allow-dirty`. Counts may
change from the plan-creation observations only when the result records a newer
input and the change is explained; zero or partial is not accepted silently.

## Exit criteria

BD07–BD13 pass, both clean artifacts exist and `dependencyDiagram.headline`
equals `behavior` for every view/owner scope used by the new projection.

## Handoff

Iteration 3 receives `projectDependencyDiagram`, exact artifact input IDs,
encoded result sizes and coverage. Iterations 4 and 5 receive the exposure names
available to `daemon` and `service-api`.
