# Iteration 2: Availability in the model and the `--plan 3` harness

**Plan:** [Plan 3: Project inspection](../main-plan.md).
**Prerequisites:** iteration 1 (the accepted contract package, the four probe
results and the revised budgets). Nothing from Plan 5. **Owners:**
`subs/analysis/subs/model/` and the reference harness under
`scripts/reference-harness/`.

## Goal

Enumerate, in the model and with no compiler, every foreign original available
to a named consumer area, with the same rules and the same reasons
`explainImport` produces, and explain one original with the exposure hops that
are missing when it is not visible. Register the `--plan 3` gate with every
I3 instance recorded, so every later iteration has a selector to run.

## Read first

- [contracts.md](../contracts.md#model-availability): `ConsumerArea`,
  `AvailabilityForm`, `AvailabilityReason`, `MissingHop`,
  `OriginalAvailability`, `listAvailability`, `explainAvailability` and the
  paragraph fixing ordering, exclusions and throwing.
- [scope.md](../scope.md#availability-semantics): the five classification
  steps; [Explanations and proposals](../scope.md#explanations-and-proposals)
  for the missing-hop computation and the rendered declaration text.
- [owners.md](../owners.md): the Model section, the foreign signature types
  and the iteration 2 rows of the activation manifest.
- Main plan: [Resolved decisions](../main-plan.md#resolved-decisions) 1, 3
  and 6; [Proposed contract shapes](../main-plan.md#proposed-contract-shapes);
  [Harness implementation and evidence](../main-plan.md#harness-implementation-and-evidence)
  items 1 and 5; matrix rows I3-01 and I3-02; the enforcement-agreement and
  enumeration-speed risk rows.
- [subcases.md](../subcases.md): the I3-01 and I3-02 rows with their fixtures
  and independent expectations.
- `probes.md`: the P3-4 listing sizes and per-original enumeration timings
  that fix the one-pass algorithm and `maxListedSymbols`.
- Source: `subs/analysis/subs/model/src/decisions.ts` in full
  (`explainVisibility`, `explainImport` and the inline tag rules),
  `src/model.ts` (`canonicalOrigin`, the ancestor walk and the effective
  exposure index), `src/interfaces/model.ts`, `src/profiles.ts`,
  `src/registry.ts`, `src/index.ts`, and
  `src/tests/{availability,decisions,tags,tree,fixtures}.ts` for the existing
  truth tables and fixture builders.
- Harness source: `scripts/reference-harness/{verify.ts,plan.ts,instances.ts,plan2-instances.ts,model-cases.ts}`
  and `README.md`; Plan 2's iteration that registered `--plan 2` for the
  pattern.
- [Importability principles](../../../model/cross-module-importability.principles.md)
  and the [glossary](../../../model/glossary.md): visibility, effective
  exposure, required-importer and required-symbol tags, testing isolation.

## Deliverables

1. `subs/analysis/subs/model/src/interfaces/model.ts` appended with
   `ConsumerArea`, `AvailabilityForm`, `AvailabilityReason`, `MissingHop` and
   `OriginalAvailability`, exactly as contracts.md declares. Existing members
   are not reordered or renamed.
2. `subs/analysis/subs/model/src/availability.ts` exporting
   `listAvailability(model, consumer)` and
   `explainAvailability(model, consumer, original)`. The listing makes one
   pass over the effective exposures of the consumer module's proper ancestors
   with destination `descendants` and of its direct children with destination
   `parent`; it never calls `explainVisibility` per original. It excludes
   same-owner and not-visible originals and orders by owner, defining file and
   binding. `explainAvailability` classifies any original of the model,
   reports `same-owner` for the consumer's own originals, and for a
   not-visible original computes the missing hops of
   [scope.md](../scope.md#explanations-and-proposals), marking each existing
   effective hop `existing: true` and rendering each hop's declaration text.
3. The classification of steps 2 to 5 of the availability semantics in one
   private helper in `availability.ts`, producing `TagRequirement` records
   with the same `tag`, `kind` and `satisfied` values `explainImport` produces
   for the same importer area, original and request. `decisions.ts` and
   `model.ts` are not edited by this iteration; iteration 9 moves the shared
   helper after Plan 5's changes to `decisions.ts` have merged.
4. Throwing rules: `listAvailability` throws `TypeError` for a consumer whose
   area is not the canonical area of its module; `explainAvailability` throws
   for an unknown original and never for a foreign or same-owner one.
5. Exposure: the model's M1 wildcard covers the new vocabulary and a new value
   line exposes `availability.ts` to the parent; `analysis` relays both
   through A5 so root and the harness receive them. `src/index.ts` re-exports
   them.
6. Tests: `subs/analysis/subs/model/src/tests/availability-listing.test.ts`
   (the name `availability.test.ts` is taken by the existing visibility truth
   table, which stays unchanged and passing) covering the listing over the
   fixture tree, the exclusions, the ordering, the testing-origin and tag
   classifications and the thrown cases; and
   `src/tests/availability-hops.test.ts` covering the missing-hop path for an
   ancestor consumer, a cousin consumer and an owner that is itself the lowest
   common ancestor.
7. Harness: `scripts/reference-harness/plan3-instances.ts` transcribing every
   leaf of [subcases.md](../subcases.md); `plan.ts` validating the
   transcription against this plan's matrix and iteration table; `verify.ts`
   and `instances.ts` accepting `--plan 3` with `--iteration <n>`. The
   capabilities `availability-model`, `consumer-rule`, `inspection-queries`,
   `symbol-details`, `details-capability`, `inspect-batch`, `inspect-service`,
   `inspect-join`, `inspect-measure`, `harness-gate` and `completion` are
   registered, availability is distinct from execution, and every instance
   except I3-01's and I3-02's is recorded as not executed.
8. `scripts/reference-harness/availability-cases.ts` holding the I3-01 api
   handlers over harness copies of the reference project and the toolkit.

## Matrix rows executed here

- I3-01: `visible-set-equals-explain`, `agrees-with-enforcement`,
  `testing-consumer-differs`, `browser-type-only`,
  `required-importer-blocks-both`, `same-owner-excluded`,
  `children-contracts-included`, `ineffective-exposure-explained`,
  `unknown-consumer-rejected`.
- I3-02: `required-membership`, `removed-record-fails`,
  `failing-assertion-fails`, `iteration-filter`.

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/analysis/subs/model/src/tests/availability-listing.test.ts \
  subs/analysis/subs/model/src/tests/availability-hops.test.ts \
  subs/analysis/subs/model/src/tests/availability.test.ts \
  subs/analysis/subs/model/src/tests/decisions.test.ts
npm test
npm run reference:verify -- --plan 3 --iteration 2       # requires 2 only
npm run reference:verify -- --plan 1
npm run reference:verify -- --plan 2
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kind: `api` over the R and T harness copies. Expected intermediate
failures: the unfiltered `npm run reference:verify -- --plan 3` gate, which
fails until iteration 11, and every capability after `availability-model` and
`harness-gate`, which is registered and unavailable. `agrees-with-enforcement`
compares every recorded access decision of both fixtures with the
corresponding availability answer; a disagreement is a defect in this
iteration, never an accepted difference.

## Exit criteria

- `listAvailability` and `explainAvailability` exist behind the model's
  exposure lines, and the listing's visible set equals `explainVisibility` over
  every original on the reference project and the toolkit.
- Every recorded access decision of both fixtures agrees with the area's
  availability answer for the same original and request.
- Every I3-01 and I3-02 instance ran and asserted its own expectation.
- `--plan 3` and `--plan 3 --iteration <n>` select, and Plan 1's and Plan 2's
  gates, `check:reference` and `check:self` pass unchanged.

## Handoff

Iteration 3 consumes `listAvailability`, `explainAvailability`,
`OriginalAvailability`, `ConsumerArea` and `MissingHop` for its listing,
explanation and proposal answers, and the `--plan 3` selector for its own
instances. Iteration 4 needs only the selector. Iteration 9 moves the private
tag-rule helper of deliverable 3 so `explainImport` calls it too.
