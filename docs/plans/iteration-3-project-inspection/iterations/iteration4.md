# Iteration 4: Symbol details in the compiler helper

**Plan:** [Plan 3: Project inspection](../main-plan.md).
**Prerequisites:** iteration 2 (the `--plan 3` gate). This iteration may run
in parallel with iteration 3: it needs no query code, and the two touch
disjoint owners. Nothing from Plan 5, whose changes to this owner are
disjoint by name. **Owners:**
`subs/analysis/subs/typescript/`.

## Goal

Describe a named set of originals from the live program and checker: kind, a
one-line body-free signature, body-free declaration text with overloads
merged, and documentation, each bounded and each explicit about truncation and
failure. No compiler object crosses the owner boundary and no position or
timestamp enters a detail.

## Read first

- [contracts.md](../contracts.md#typescript-symbol-details): `SymbolKind`,
  `SymbolDetail`, `DetailLimits`, `SymbolDetails`, the revised
  `SourceAnalysis`, the `describeOriginals` paragraph, the two new
  `SourceLimit.code` values and the determinism rules.
- [scope.md](../scope.md#detail-tiers-and-availability): the second tier, the
  bounds, and the instruction to adapt cucumber-viz's body-free rendering,
  overload merging and documentation extraction while discarding its
  content-hash cache and barrel inventories. [Limits](../scope.md#limits) for
  the five defaults.
- [owners.md](../owners.md): the TypeScript section and the iteration 4 rows
  of the activation manifest (T1 and T2).
- Main plan: [Resolved decisions](../main-plan.md#resolved-decisions) 4;
  [Proposed contract shapes](../main-plan.md#proposed-contract-shapes); matrix
  row I3-07; the detail-bloat risk row;
  [Coexistence with Plan 5](../main-plan.md#coexistence-with-plan-5) for the
  append-only rule on `source.ts`, `wire.ts`, `compiler-helper.ts`,
  `bridge.ts` and `source-analysis.ts`.
- [subcases.md](../subcases.md): the I3-07 rows.
- `probes.md`: P3-1's measured cost and output size per original on R, T, S100
  and S1000, which fixed the limits this iteration enforces.
- [Project-explorer reuse analysis](../../../analysis/project-explorer-reuse.md):
  the declaration extractor and surface renderer, with the tests to adapt.
- [Memory lifecycle](../../../architecture/memory-lifecycle.md): ML06, detail
  expansion and result serialization within budgets, and the requirement that
  unavailable enrichment stays distinguishable from empty data.
- Source in full: `subs/analysis/subs/typescript/src/compiler-helper.ts`,
  `src/wire.ts`, `src/bridge.ts`, `src/source-analysis.ts`,
  `src/interfaces/source.ts`, `src/catalog.ts` (the `OriginalId` and
  `originalKey` shapes and the file exports the lookup uses),
  `src/resolution.ts`; tests `src/tests/{catalog,coverage,lifetime,resources}.test.ts`.

## Deliverables

1. `subs/analysis/subs/typescript/src/interfaces/source.ts` appended with
   `SymbolKind`, `SymbolDetail`, `DetailLimits`, `SymbolDetails` and the
   `details(originals, limits, signal?)` member of `SourceAnalysis`.
   `SourceLimit.code` gains `'detail-failed'` and `'detail-limit'`. Existing
   members are not reordered; the names are disjoint from Plan 5's additions
   to the same file.
2. `subs/analysis/subs/typescript/src/details.ts` exporting
   `describeOriginals(project, catalog, originals, limits)`, executed inside
   the helper process against the live program and checker after `catalog`.
   Per original it resolves the declaration, classifies the kind, renders a
   one-line body-free signature, renders body-free declaration text with
   overloads merged into one block, extracts JSDoc without markers and takes
   its first sentence or line as `summary`.
3. Bounds and states: each string truncated at its limit with the member named
   in `truncated` and the state `truncated`; an unresolvable or unreadable
   original recorded as `failed` with `limitId` naming a `detail-failed`
   coverage note; `maxOriginals` and `deadlineMs` exceeded recorded as
   `detail-limit` coverage notes with the remaining originals `failed`.
   `SymbolDetails` reports `requested` and `described`.
4. Determinism: details ordered by `originalKey`, whitespace normalized, no
   position, path-dependent text or timestamp in a detail, so two runs over
   identical inputs are equal by value.
5. The `details` operation appended to `src/wire.ts` with `{ originals,
   limits }` input, served in `src/compiler-helper.ts` from the live program
   and checker, and exposed through `src/bridge.ts` and
   `src/source-analysis.ts`. The program and checker stay alive across it, as
   for `catalog` and `accesses`; `dispose` is unchanged.
6. Exposure: `SourceAnalysis.details` and the detail vocabulary activated
   inside T1 and T2 as the activation manifest records. No compiler object is
   exposed.
7. Tests: `subs/analysis/subs/typescript/src/tests/details.test.ts` over R and
   T copies covering each kind, overload merging, JSDoc extraction,
   truncation, unknown originals, determinism and the deadline; the existing
   catalog, coverage, resource and lifetime tests unchanged and passing.
8. Harness: the `symbol-details` capability with the I3-07 api handlers in
   `scripts/reference-harness/details-cases.ts`, calling `describeOriginals`
   through a real `SourceAnalysis` over the two fixtures.

## Matrix rows executed here

- I3-07: `function-signature-body-free`, `overloads-merged`, `class-summary`,
  `interface-and-type`, `jsdoc-first-line-and-full`, `resource-original`,
  `truncation-bounded`, `unknown-original-failed-explicit`, `deterministic`,
  `deadline-explicit`.

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/analysis/subs/typescript/src/tests/details.test.ts \
  subs/analysis/subs/typescript/src/tests/catalog.test.ts \
  subs/analysis/subs/typescript/src/tests/lifetime.test.ts \
  subs/analysis/subs/typescript/src/tests/coverage.test.ts
npm test
npm run reference:verify -- --plan 3 --iteration 4       # requires 2 and 4
npm run reference:verify -- --plan 1                     # the helper path is shared with batch
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kind: `api` only. Expected intermediate failures: the unfiltered
`--plan 3` gate, and the `details-capability`, `inspect-batch`,
`inspect-service`, `inspect-join`, `inspect-measure` and `completion`
capabilities, none of which exists yet. A run that does not request `details`
must behave exactly as before: no added helper work, no added coverage note.
A body that reaches the declaration text, or a detail that varies between two
identical runs, is a defect in this iteration.

## Exit criteria

- `describeOriginals` and the `details` helper operation exist behind T1 and
  T2, answer from the live checker, and never return a compiler object.
- Every string is bounded, every failure names its limit, and two runs over
  identical inputs produce equal details.
- Every I3-07 instance ran and asserted its own expectation.
- Plan 1's gate, `check:reference` and `check:self` pass unchanged.

## Handoff

Iteration 6 calls `SourceAnalysis.details` once per run from the new `details`
stage with the model's effective exposures and records `SymbolDetails` in
`AnalysisSnapshot.details`. Iteration 9 calls the same operation on the
retained session's warm compiler for the listed originals of one query.
