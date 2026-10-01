# Iteration 5: Explanations and incoming usage

**Plan:** [Plan 3: Project inspection](../main-plan.md).
**Prerequisites:** iteration 3 (`analysis`: `src/interfaces/inspection.ts` in
full, `resolveConsumer`, the `available` branch of `answerInspection`, and the
A13 and A14 lines already activated). Iteration 4 is not required here.
Nothing from Plan 5. **Owners:** `subs/analysis/`.

## Goal

Answer the two secondary questions over the vocabulary iteration 3 delivered:
why a named original is or is not available from here, with the exposure
declarations that would make it visible rendered as a labeled proposal; and
who imports this module's own exports, denied accesses included. This
iteration adds no type, no declaration line and no owner exposure.

## Read first

- [contracts.md](../contracts.md#analysis-inspection-vocabulary-and-queries):
  `SymbolExplanation`, `ModuleSummary`, `OwnExposure`, `UsageRow`,
  `UsageListing` and the `answerInspection` paragraph; the `explain` and
  `module` members of `InspectionQuery`. The file is already written; this
  iteration implements against it and changes nothing in it.
- [scope.md](../scope.md#explanations-and-proposals): the shortest-legal-path
  rule, the three rendered declaration forms, the proposal label and the
  instruction that tag and testing-origin blocks are reported as facts;
  [Usage semantics](../scope.md#usage-semantics) in full.
- [owners.md](../owners.md): the Analysis section; the activation manifest
  records no new line for this iteration.
- Main plan: [Resolved decisions](../main-plan.md#resolved-decisions) 6 and 7;
  [Commands](../main-plan.md#commands) for `inspect` and `explain`; matrix
  rows I3-05 and I3-06; the proposal-mistaken-for-permission risk row.
- [subcases.md](../subcases.md): the I3-05 and I3-06 rows with their fixtures
  and independent expectations.
- Source: `subs/analysis/src/inspection.ts` and
  `src/interfaces/inspection.ts` from iteration 3;
  `subs/analysis/subs/model/src/availability.ts` (`explainAvailability` and
  `MissingHop`); `subs/analysis/src/interfaces/analysis.ts` for
  `AnalysisSnapshot.accesses` and the recorded `AccessResult` decisions;
  `subs/analysis/src/evaluate-accesses.ts` for the decision shapes;
  `subs/analysis/subs/descriptions/src/` for the declared child names and the
  exposure evidence locations the summary prints.
- [Reference cases](../../reference-project/cases.md) and
  [contract map](../../reference-project/contract-map.md): the
  `workspace/contracts` importer counts `incoming-by-importer-owner` asserts
  and the sibling-branch exposure `ineffective-exposure-explained` used.
- [Module-description specification](../../../model/module-description.spec.md):
  the `expose-src`, `expose-sub` and destination syntax the proposal renders.

## Deliverables

1. The `explain` branch of `answerInspection`: for every original whose
   binding or export name equals the query's `name`, or exactly the one named
   `owner:name`, a match carrying `explainAvailability`'s
   `OriginalAvailability`, the defining file's export name, the specifier when
   the requested form is available and `null` otherwise, the `MissingHop`
   list as `proposal`, and the fixed `proposalLabel`. Zero matches is a normal
   answer, not an unavailable one. Matches are ordered by owner, defining file
   and binding.
2. Proposal rendering taken from the hops iteration 2 computes: each hop's
   declaration text is `expose-src <name> from "<path>" to parent` in the
   owner and `expose-sub <name> from <child> to parent` or `to descendants` in
   an ancestor, naming the child by its declared name and the original by its
   defining-file export name. Existing effective hops are marked and kept in
   the list as evidence; no tag edit and no testing-origin edit is ever
   proposed.
3. The `module` branch of `answerInspection`: the consumer's header tags,
   purpose with its state, parent, declared children, the module's own
   exposures as `OwnExposure` records with destination, expanded names,
   provider, effectiveness and evidence locations, and its source areas.
4. The usage listing, produced when `query.usage` is true: accesses from
   `snapshot.accesses` whose selection resolves to an original owned by the
   consumer's module, joined with the recorded decisions, grouped by importing
   owner then importing file then selection, each row carrying the written
   form, the checked request, the status, the reason and the location.
   Accesses from the module's own files are excluded; accesses from its
   descendants are included, because descendants are other modules. Exposed
   originals with no observed access are listed with zero uses. `unit` is
   `'selections'`. `query.symbol` restricts the listing to one original and is
   meaningful only with `usage`.
5. No subtree rollup, edge aggregation, ranking or complexity score; those
   belong to Plan 6.
6. Tests: `subs/analysis/src/tests/inspection-explain.test.ts` (the available,
   not-visible, tag-blocked, type-only, testing-origin, same-owner, ambiguous,
   unknown and owner-qualified cases, and the proposal label) and
   `src/tests/inspection-usage.test.ts` (the module summary and the usage
   grouping, denied rows, unused exposed originals, the owned-only rule and
   the symbol filter).
7. Harness: the I3-05 and I3-06 api handlers added to
   `scripts/reference-harness/inspection-cases.ts`, including the copy with an
   injected denied import for `denied-access-retained` and the copy with an
   export added to `vocabulary.ts` for `wildcard-growth-reflected`.

## Matrix rows executed here

- I3-05: `available-with-spelling`, `not-visible-with-proposal`,
  `blocked-by-importer-tag`, `type-only-by-symbol-tag`,
  `testing-origin-blocked`, `same-owner`, `ambiguous-name-lists-all`,
  `unknown-name-empty`, `owner-qualified-name`, `wildcard-growth-reflected`.
- I3-06: `incoming-by-importer-owner`, `denied-access-retained`,
  `unused-export-listed`, `owned-only-not-subtree`, `type-vs-value-form`,
  `symbol-filter`.

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/analysis/src/tests/inspection-explain.test.ts \
  subs/analysis/src/tests/inspection-usage.test.ts \
  subs/analysis/src/tests/inspection-available.test.ts \
  subs/analysis/src/tests/consumer.test.ts
npm test
npm run reference:verify -- --plan 3 --iteration 5       # requires 2, 3 and 5
npm run reference:verify -- --plan 1
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kind: `api` only, over R and T copies. Expected intermediate
failures: the unfiltered `--plan 3` gate, and the `details-capability`,
`inspect-batch`, `inspect-service`, `inspect-join`, `inspect-measure` and
`completion` capabilities. A proposal presented as an existing permission, a
usage row that counts an access from the module's own files, or a proposed
tag edit is a defect in this iteration.

## Exit criteria

- `explain` answers every match with its availability, its spelling when
  available, and, when not visible, the shortest legal hops rendered as
  declaration text under the fixed proposal label.
- `inspect` answers the module summary and, with `--usage`, the owned
  incoming usage with denied accesses retained and unused exposed originals
  listed.
- Every I3-05 and I3-06 instance ran and asserted its own expectation.
- No type, declaration line or owner exposure changed relative to iteration 3.

## Handoff

Iteration 6 fills `SymbolDetailView` for all three answers from
`snapshot.details`. Iteration 7 renders `SymbolExplanation` and
`ModuleSummary` as human text and as the `ramify.inspect/1` document, and
maps their outcomes to the exits.
