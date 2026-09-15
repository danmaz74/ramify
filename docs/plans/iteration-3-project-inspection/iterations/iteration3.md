# Iteration 3: Consumer rule and the availability listing

**Plan:** [Plan 3: Project inspection](../main-plan.md).
**Prerequisites:** iteration 2 (`model`: `listAvailability`,
`explainAvailability` and their vocabulary relayed through A5; the `--plan 3`
gate). This iteration may run in parallel with iteration 4, which depends only
on iteration 2. Nothing from Plan 5. **Owners:** `subs/analysis/`.

## Goal

Resolve a working directory or file to one owner and one source area, and
answer the primary question from an `AnalysisSnapshot` alone: every foreign
original available in that area, grouped by its providing module with that
module's purpose, each row carrying the export name, aliases, form, tags, the
effective path and the relative specifier that imports it. The whole
inspection vocabulary lands here so iteration 5 adds no type.

## Read first

- [contracts.md](../contracts.md#analysis-inspection-vocabulary-and-queries):
  the complete `src/interfaces/inspection.ts` block, `resolveConsumer` and
  `answerInspection`, including the members iteration 5 fills
  (`ModuleSummary`, `UsageListing`, `UsageRow`, `OwnExposure`,
  `SymbolExplanation`).
- [scope.md](../scope.md#consumer-area-rule): the four resolution steps;
  [Spelling rule](../scope.md#spelling-rule) in full;
  [Availability semantics](../scope.md#availability-semantics) for the reasons
  the rows carry; [Detail tiers and availability](../scope.md#detail-tiers-and-availability)
  for the placeholder detail view this iteration produces.
- [owners.md](../owners.md): the Analysis section, the foreign signature types
  and the iteration 3 rows of the activation manifest (A13 and A14).
- Main plan: [Resolved decisions](../main-plan.md#resolved-decisions) 1, 2, 3
  and 5; [Required data flow](../main-plan.md#required-data-flow); matrix rows
  I3-03 and I3-04; the iteration-size risk row.
- [subcases.md](../subcases.md): the I3-03 and I3-04 rows with their fixtures
  and independent expectations.
- `probes.md`: P3-3's specifier survey confirming `relative-js`, and P3-4's
  listing sizes fixing `maxListedSymbols`.
- Source: `subs/analysis/src/interfaces/analysis.ts` (`AnalysisSnapshot` and
  its inventory, areas, catalog, model and accesses members);
  `src/inventory.ts` and `src/inventory-entry.ts`; `src/index.ts`;
  `subs/analysis/subs/project/src/` for `InventoryModule.directory`,
  `InventoryArea.root` and `ModulePurpose`; `subs/analysis/subs/model/src/availability.ts`
  and `src/model.ts` for `canonicalOrigin` and the area records.
- [CLI invocation](../../../architecture/cli-invocation.spec.md): Selecting
  the project; Files outside modules. The root is already selected when
  `resolveConsumer` runs.
- [Reference cases](../../reference-project/cases.md) and
  [contract map](../../reference-project/contract-map.md) for the R providers,
  purposes and the `inspect as inspectRecord` alias.

## Deliverables

1. `subs/analysis/src/interfaces/inspection.ts` with the whole vocabulary of
   contracts.md: `ConsumerLocation`, `Consumer`, `DetailLevel`,
   `InspectionQuery`, `SymbolDetailView`, `AvailableSymbol`, `ProviderGroup`,
   `AvailabilityListing`, `OwnExposure`, `UsageRow`, `UsageListing`,
   `ModuleSummary`, `SymbolExplanation`, `InspectionResult`,
   `InspectionUnavailable` and `InspectionInputs`. Type-only, as every owned
   interface file is.
2. `subs/analysis/src/inspection.ts` exporting
   `resolveConsumer(inventory, areas, root, location)` implementing the four
   steps of the consumer rule: canonicalize, longest module-directory prefix,
   tests area beneath `src/tests/` and ordinary area beneath `src/` with
   `outsideSource: true` otherwise, and the base directory taken from the
   location itself for a directory and from its parent for a file. A location
   outside the root returns `{ status: 'unavailable', reason: 'outside-root' }`.
   An absent tests area still resolves, with the fixed testing profile.
3. `answerInspection(inputs)` dispatching on `query.kind` and implementing the
   `available` branch: `listAvailability` over the consumer area; the export
   name of each original taken from the catalog's defining-file exports and
   the differing names of effective exposures listed as `aliases`; the
   specifier computed by the spelling rule with `spellingStyle:
   'relative-js'`; grouping by provider with its purpose, header tags and
   `relation`; and `total`, `listed`, `truncated` and `typeOnly` counts. The
   `module` and `explain` branches return `{ status: 'unavailable', reason:
   'invalid-query' }` until iteration 5 replaces them. A snapshot-less or
   invalid-model input answers `no-snapshot` or `model-invalid`.
4. Filters and ordering: `pattern` as a case-insensitive substring or `*`
   glob on the export name; `owner`, `form` and `tag` filters; `search` over
   names, aliases and provider purposes, extended to signatures and
   documentation by iteration 6; `limit` bounded by
   `inputs.maxListedSymbols` with `truncated` and the counts reported; a
   stable order by owner, defining file and binding. An unknown `owner`
   answers an empty listing with a note naming it.
5. The detail placeholder: every row's `details` is
   `{ state: 'unavailable', reason: 'not-extracted', ... }` and the listing's
   `details` member repeats the level, `available: false` and the reason.
   Iteration 6 fills these from `snapshot.details`; nothing here renders an
   extracted detail as empty text.
6. Exposure: A13 and A14 activated so root receives `answerInspection`,
   `resolveConsumer` and the inspection vocabulary; `src/index.ts` re-exports
   them. `daemon` and `cli` import no analysis value.
7. Tests: `subs/analysis/src/tests/consumer.test.ts` (each location form of
   the consumer rule over R and T copies, including the absent tests area and
   the outside-root rejection) and `src/tests/inspection-available.test.ts`
   (grouping, purposes, spellings, aliases, filters, limits, ordering and the
   unavailable detail state).
8. Harness: `scripts/reference-harness/inspection-cases.ts` with the I3-03 and
   I3-04 api handlers over harness copies, including the copy whose
   `README.md` is removed for `missing-purpose-explicit` and the
   `grouped-by-provider-with-purpose` `missing-file` state.

## Matrix rows executed here

- I3-03: `cwd-in-src`, `cwd-in-tests`, `cwd-module-dir-outside-src`,
  `file-path-consumer`, `nested-module-not-parent`, `root-src-consumer`,
  `outside-root-invalid`.
- I3-04: `grouped-by-provider-with-purpose`, `spelling-relative-js`,
  `spelling-from-file-vs-directory`, `type-only-marked`,
  `alias-exposed-name`, `name-filter`, `owner-filter`, `kind-filter`,
  `tag-filter`, `limit-truncation-reported`, `missing-purpose-explicit`,
  `details-unavailable-explicit`, `ordering-stable`.

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/analysis/src/tests/consumer.test.ts \
  subs/analysis/src/tests/inspection-available.test.ts
npm test
npm run reference:verify -- --plan 3 --iteration 3       # requires 2 and 3
npm run reference:verify -- --plan 1
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kind: `api` only, over R and T copies. Expected intermediate
failures: the unfiltered `--plan 3` gate, the I3-05 and I3-06 instances whose
branches are not implemented here, and every capability after
`consumer-rule` and the listing portion of `inspection-queries`. A specifier
that does not resolve to the original's defining file is a defect in this
iteration; iteration 7's `spellings-pass-check-reference` is the instance that
would otherwise find it late.

## Exit criteria

- Every location form of the consumer rule resolves to the expected owner,
  area, base directory and `outsideSource` flag on both fixtures.
- The `available` answer groups by provider with purposes, spells every row by
  the relative-js rule, reports filters, limits and truncation, and states the
  unavailable detail tier once and per row.
- Every I3-03 and I3-04 instance ran and asserted its own expectation.
- Plan 1's gate, `check:reference` and `check:self` pass unchanged.

## Handoff

Iteration 5 fills the `explain` and `module` branches of `answerInspection`
over this vocabulary, adding no type and no owner line. Iteration 6 replaces
the detail placeholder with `snapshot.details`. Iteration 7 renders
`AvailabilityListing` and writes each row's specifier into a consumer area for
the round-trip instances.
