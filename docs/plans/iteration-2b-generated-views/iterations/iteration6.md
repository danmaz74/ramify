# Iteration 6: Test references

**Plan:** [Plan 2B: Generated architect view](../main-plan.md).
**Prerequisites:** iteration 4.
**Owners:** `analysis`, root `ramify` (the dependency analyzer process runner).

## Goal

Give every Vitest record in `tests.jsonl` the originals its test file
references behaviorally, projected from the dependency analyzer's existing
per-file behavior facts in the same run as the diagram facts, without
changing those facts.

## Read first

- [Contracts C9](../contracts.md#c9-test-references) and
  [C4](../contracts.md#c4-rendering), and AV38–AV39.
- The specification's [`tests.jsonl`](../../../architecture/architect-view.spec.md#testsjsonl),
  [metadata](../../../architecture/architect-view.spec.md#metadata) and
  [materialization](../../../architecture/architect-view.spec.md#materialization)
  sections.
- `subs/analysis/subs/typescript/src/interfaces/dependency-behavior.ts`
  (`DependencyBehaviorFact`: one per consumer file and original, precedence
  already applied).
- `subs/analysis/src/dependency-diagram.ts` (`projectDependencyDiagram`),
  `modularity-context.ts` (`viewFacts` and the source filters) and
  `interfaces/modularity.ts` (`SourceFilter`).
- `subs/analysis/src/dependency-analyzer.ts`,
  `interfaces/dependency-analyzer.ts`, `src/dependency-analyzer-process.ts`
  and `src/dependency-analyzer-entry.ts`.
- `subs/analysis/src/architect-render.ts`, `interfaces/architect-view.ts`,
  `src/tests/architect-render.test.ts` with its golden files, and
  `src/tests/architect-fixture.ts`.
- Iteration 4's results: the golden-file update procedure and the toolkit
  render measurements.

## Deliverables

1. Add C9's types and `projectTestReferences` in `analysis`, pure and reading
   only the report, under the modularity projection's `test` source filter,
   with same-owner originals included.
2. Add `testReferences` to the analyzer's `ready` outcome, projected from the
   same report in the same run, and validate and carry it in the process
   runner. The diagram facts stay byte-identical.
3. Add `testReferences` to `ArchitectDependencies` and render `exercises`,
   `exercisesMore`, `testReferences` and `unclassifiedExercises` as C9 and
   the specification state. Regenerate the golden files in both dependency
   states and add a measured state without test references; review every
   changed line.
4. Extend the `architect` fixture with the test files AV38 names.
5. Expose the new names as the existing dependency-diagram names are exposed,
   and relay what the daemon needs from the root.
6. Measure on the toolkit: the analyzer's time before and after, the
   references' bytes, the view's bytes, and the mean and maximum `exercises`
   length.

## Matrix rows executed here

AV38–AV39, and AV12–AV18 again after the golden files change.

## Verification

```sh
npx vitest run subs/analysis/src/tests/architect-render.test.ts
npx vitest run subs/analysis/src/tests/dependency-diagram.test.ts subs/analysis/src/tests/dependency-analyzer.test.ts
npx vitest run subs/analysis/src/tests/dependency-behavior-capability.test.ts subs/analysis/src/tests/modularity.test.ts
npx vitest run src/tests/dependency-analyzer-process.test.ts src/tests/dependency-diagram-daemon.test.ts
npx vitest run subs/daemon/subs/contexts/src/tests/dependency-diagram.test.ts
npm run type-check
npm run build
npm run check:self
```

The new test file for `projectTestReferences` runs with the first commands.

## Exit criteria

AV38–AV39 pass; the diagram facts and the explorer's dependency answers are
unchanged; the toolkit view stays within its size budget.

## Handoff

`TestReferenceFacts` in the analyzer's `ready` outcome, the renderer's
`testReferences` input, the regenerated golden files and the toolkit
measurements.
