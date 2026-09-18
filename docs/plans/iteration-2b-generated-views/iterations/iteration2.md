# Iteration 2: Read test titles

**Plan:** [Plan 2B: Generated architect view](../main-plan.md).
**Prerequisites:** iteration 1.
**Owners:** `analysis/typescript` (TypeScript and JavaScript titles),
`analysis` (Gherkin titles).

## Goal

Read test suite, test, feature and scenario titles statically from the
revision's compiler syntax trees and from `.feature` text, bounded and
deterministic.

## Read first

- [Contracts C2](../contracts.md#c2-test-titles) and AV04–AV07.
- The specification's [`tests.jsonl`](../../../architecture/architect-view.spec.md#testsjsonl)
  section.
- `subs/analysis/subs/typescript/src/symbol-details.ts` for walking a source
  file of the compiler program (`project.program.getSourceFile`) and the
  `typescript/unstable/ast` guards used there.
- `subs/analysis/subs/typescript/src/interfaces/source.ts`,
  `retained-source-analysis.ts` and `export-shapes.ts` from iteration 1.
- `subs/analysis/subs/typescript/src/tests/fixtures.ts`.

## Deliverables

1. Add `describeTestTitles`, `testTitleRuns()` and C2's types in
   `analysis/typescript`, and `RetainedSourceAnalysis.testTitles`.
2. Add `readFeatureTitles` in `analysis` (`src/feature-titles.ts`), pure
   text.
3. Add the `titles` fixture and tests for AV04–AV07.
4. Exercise the reader on the toolkit's own test files and report the counts
   of files, suites, titles, dynamic titles and cut titles, as a sanity check
   against the inventory in the main plan.

## Matrix rows executed here

AV04–AV07.

## Verification

```sh
npx vitest run subs/analysis/subs/typescript/src/tests/test-titles.test.ts
npx vitest run subs/analysis/src/tests/feature-titles.test.ts
npx vitest run subs/analysis/subs/typescript/src/tests/retained-source-analysis.test.ts
npm run type-check
npm run build
npm run check:self
```

## Exit criteria

AV04–AV07 pass; the toolkit sanity counts are recorded in the results.

## Handoff

`describeTestTitles`, `RetainedSourceAnalysis.testTitles`,
`readFeatureTitles`, `testTitleRuns()` and the toolkit counts.
