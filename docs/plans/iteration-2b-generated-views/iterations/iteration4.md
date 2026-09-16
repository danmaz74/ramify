# Iteration 4: Test-hierarchy provider

**Plan:** [Plan 2B: Generated project views](../main-plan.md).
**Prerequisites:** Iteration 1 and frozen test-hierarchy limits.
**Owners:** `analysis/typescript` only. Independent of iterations 2 and 3.

## Goal

Extract the static suite and case hierarchy of testing-classified source and
Gherkin features, with titles, descriptions and line numbers, without running
any test.

## Read first

- [`tests.txt`](../scope.md#teststxt) and the
  [test-hierarchy contract](../contracts.md#test-hierarchy-provider).
- `interfaces/source.ts`, `retained-source-analysis.ts`, `symbol-details.ts`
  and their tests, for the retained project and bounded-result conventions.
- Representative toolkit tests and the reference feature file.

## Deliverables

1. Add `TestNode`, `TestFileHierarchy` and `TestHierarchyLimits` to the
   TypeScript vocabulary.
2. Implement `describeTestHierarchy` over the syntax tree: recognized call
   names and modifiers, literal and dynamic titles, lexical nesting through
   callback arguments, adjacent comment descriptions and one-based lines.
3. Parse `.feature` resources from captured input content: `Feature`, `Rule`,
   `Background`, `Scenario` and `Scenario Outline` titles and lines.
4. Enforce per-file and total bounds; isolate parse failures per file.
5. Add `RetainedSourceAnalysis.tests` without a new process or cache, and
   update test doubles that implement the interface.
6. Add the owned `module.ramify` line; list relays for the coordinator.

## Matrix rows executed here

I2B-05: all seven leaves.

## Verification

Focused typescript owner tests with exact expected trees, UTF-8 boundary cases,
cancellation and disposal. `npm run type-check`. No build while iterations 2 or
3 run.

## Exit criteria

The provider returns deterministic, bounded plain data for every recognized
form, never evaluates a title and never reads a file outside captured inputs.

## Handoff

The provider and limits go to iteration 7.
