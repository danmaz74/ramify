# Iteration 3: Build the lean dependency analyzer

**Plan:** [Plan 6D: Behavioral dependency diagram](../main-plan.md).
**Prerequisites:** iterations 1–2, including BD01–BD13 and both clean baselines.
**Owners:** `analysis/typescript`, `analysis` and root `ramify [dispatch]`
(analyzer entry and runner only).

## Goal

Produce the dependency diagram for a published report by classifying its
recorded imports over verified inputs, in a separate process, without repeating
discovery, description linking, export cataloging, import interpretation or
evaluation.

## Read first

- [Contracts C1](../contracts.md#c1-compiler-evidence) (supplied imports),
  [C3](../contracts.md#c3-lean-dependency-analyzer) and BD14–BD18.
- `subs/analysis/subs/typescript/src/compiler-helper.ts` (the `behavior` and
  `interpret` commands), `bridge.ts`, `wire.ts` and `interfaces/source.ts`.
- `subs/analysis/subs/project/src/read-project.ts` and the `ProjectInputView`
  contract in `interfaces/project.ts`, especially `seal()`.
- `src/batch-entry.ts`, `src/batch-process.ts` and `src/report-capacity.ts` for
  the process runner pattern and response bounds.
- `subs/analysis/src/tests/dependency-behavior-capability.test.ts` and
  `subs/analysis/subs/typescript/src/tests/dependency-behavior.test.ts`.

## Deliverables

1. Let `SourceAnalysis.dependencyBehavior` accept supplied imports; send them to
   the helper through a parent-served input request, and classify them without
   the catalog or interpretation. Keep the existing batch call unchanged.
2. Add `analyzeDependencyDiagram` in `analysis`: completed-report check,
   acquisition with inventory/area comparison, helper run over the acquired
   view, sealed-input comparison, report copy and `projectDependencyDiagram`.
   Return phase timings and `behaviorRuns`.
3. Add root's analyzer entry and `DependencyDiagramRunner` implementation: one
   Node child per run, request on standard input, one JSON outcome on standard
   output within response capacity, termination on cancellation, deadline or
   oversize.
4. Add changed-input fixtures: edit a read source file, a configuration file and
   the module layout after producing the report.
5. Record the BD18 measurement with a small probe under
   `scripts/probes/dependency-analyzer/`, writing raw results under
   `scripts/probes/results/dependency-analyzer/`.

## Matrix rows executed here

BD14–BD18.

## Verification

```sh
npx vitest run subs/analysis/subs/typescript/src/tests/dependency-behavior.test.ts
npx vitest run subs/analysis/src/tests/dependency-analyzer.test.ts
npx vitest run subs/analysis/src/tests/dependency-behavior-capability.test.ts
npx vitest run src/tests/dependency-analyzer-process.test.ts
npm run type-check
npm run build
npm run check:self
npx tsx scripts/probes/dependency-analyzer/measure.ts --root . --runs 5
npx tsx scripts/probes/dependency-analyzer/measure.ts --root examples/collection-review --runs 5
```

BD14 compares against a real batch report over identical inputs, not a fixture
written by hand. BD15 records the helper's received commands rather than
inferring them from timing. BD17 uses the built entry and observes both process
IDs exiting.

## Exit criteria

BD14–BD18 pass; supplied-import classification equals the batch path; changed
inputs never produce a diagram; the analyzer's time and memory are recorded
beside a full batch on both projects.

## Handoff

Iteration 4 receives `DependencyDiagramRunner`, `analyzeDependencyDiagram`'s
outcomes, the analyzer entry path and the measured time, memory and result
sizes. If the analyzer is not materially faster than a full batch, record that
in the handoff for review; it does not block iteration 4.
