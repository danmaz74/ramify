# Iteration 1: Classify export shapes

**Plan:** [Plan 2B: Generated architect view](../main-plan.md).
**Prerequisites:** none.
**Owners:** `analysis/typescript`.

## Goal

Classify every defining-file export by kind and behavior shape on the
compiler, with one shape function shared with the consumer dependency
classifier, and without changing any consumer classification.

## Read first

- [Contracts C1](../contracts.md#c1-export-shapes) and AV01–AV03.
- The specification's [classification](../../../architecture/architect-view.spec.md#classification)
  and the [behavior-capable symbol](../../../architecture/dependency-glossary.md#behavior-capable-symbol)
  definition.
- `subs/analysis/subs/typescript/src/behavior-classifier.ts`, especially
  `BehaviorShapes` and `behaviorRuns`.
- `subs/analysis/subs/typescript/src/symbol-details.ts` for resolving an
  original's primary declaration from an `OriginalId` and export name.
- `subs/analysis/subs/typescript/src/interfaces/source.ts` and
  `retained-source-analysis.ts` (`details`).
- `subs/analysis/subs/typescript/src/tests/dependency-behavior.test.ts`,
  `symbol-details.test.ts`, `retained-source-analysis.test.ts` and
  `fixtures.ts`.
- `subs/analysis/src/dependency-analyzer.ts` for running the lean analyzer
  in-process for AV02's equivalence.

## Deliverables

1. Replace `BehaviorShapes.of` with `shape(type)` returning the five values,
   and `of(type) = collapse(shape(type))`, keeping every existing rule: the
   depth limit, nullish filtering, the instantiable constraint, the
   library-member exclusion and the non-recursive member check.
2. Add `describeExportShapes` and `shapeRuns()` in a new
   `src/export-shapes.ts`, reusing the symbol-detail declaration resolution
   rather than duplicating it.
3. Add `RetainedSourceAnalysis.shapes` with the `details` precondition.
4. Add C1's types to `interfaces/source.ts`.
5. Add the `shapes` fixture and tests for AV01 and AV03.
6. For AV02, add a test that walks every type the classifier meets on the
   fixtures and asserts `of` equals `collapse(shape)`, and record a
   before/after comparison of the lean analyzer's facts for the toolkit and
   the reference project, using a small script under the scratch area or
   `scripts/probes/`, run against a build of commit `577b980` and of this
   iteration.

## Matrix rows executed here

AV01–AV03.

## Verification

```sh
npx vitest run subs/analysis/subs/typescript/src/tests/export-shapes.test.ts
npx vitest run subs/analysis/subs/typescript/src/tests/dependency-behavior.test.ts
npx vitest run subs/analysis/subs/typescript/src/tests/symbol-details.test.ts
npx vitest run subs/analysis/subs/typescript/src/tests/retained-source-analysis.test.ts
npx vitest run subs/analysis/src/tests/dependency-analyzer.test.ts subs/analysis/src/tests/dependency-diagram.test.ts
npm run type-check
npm run build
npm run check:self
```

## Exit criteria

AV01–AV03 pass; the dependency-behavior and analyzer tests pass unchanged;
the analyzer's facts for the toolkit and the reference project are
byte-identical to the base.

## Handoff

`describeExportShapes`, `RetainedSourceAnalysis.shapes`, `shapeRuns()`, the
`shapes` fixture and the equivalence evidence.
