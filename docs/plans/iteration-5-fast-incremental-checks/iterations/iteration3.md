# Iteration 3: Per-file export descriptions

**Plan:** [Plan 5: Fast incremental checks](../main-plan.md).
**Prerequisites:** iteration 2 (`engine`: the hoisted interpreter, the lazy
namespace index and the registered `--plan 5` gate). This iteration may run in
parallel with iteration 5, which depends only on iteration 2. **Owners:**
`subs/analysis/subs/typescript/`.

## Goal

Describe each file's exports, originals, coverage notes and recorded
dependencies separately, recompute only the descriptions a change can reach,
and make `buildCatalog` the assembly of every file's description, so batch
results come from the same code the session uses.

## Read first

- [contracts.md](../contracts.md#typescript-descriptions-the-interpreter-and-the-retained-adapter):
  `DescriptionDependencies`, `FileDescription`, `CatalogDelta` and the
  `descriptions.ts` paragraph.
- [scope.md](../scope.md#export-descriptions): Export descriptions and its
  dependency table; [Access facts](../scope.md#access-facts) for what the
  delta must tell the next stage.
- [owners.md](../owners.md): TypeScript and the iteration 3 row of the
  activation manifest.
- Main plan: [Resolved decisions](../main-plan.md#resolved-decisions) 3;
  [Proposed contract shapes](../main-plan.md#proposed-contract-shapes); matrix
  row I5-03; the fixed-point risk row.
- `probes.md`: the P5-2 closure sizes on R, T, S100 and S1000.
- Source: `subs/analysis/subs/typescript/src/catalog.ts` in full, especially
  `resolveExports` and its star, selection and incompleteness propagation;
  `src/resolution.ts`; `src/interfaces/source.ts`;
  `src/tests/{catalog,cyclic-stars,coverage,resources,resource-bindings}.test.ts`.
- Plan 1 [contracts](../../done/iteration-1-project-verifier/contracts.md):
  TypeScript: catalog, originals and coverage.

## Deliverables

1. `subs/analysis/subs/typescript/src/descriptions.ts` exporting
   `describeFiles(project, inputs, host, files)` and
   `assembleCatalog(descriptions)`. A description carries the file's
   `FileExports` entry, the originals it defines, the coverage notes located
   in it, and the files, resources, shims and absent probed paths it depended
   on.
2. Recomputation as [scope.md](../scope.md#export-descriptions) fixes: the set
   starts with the changed, created and deleted owned files and the files
   depending on a deleted path or on a created path that matches an absent
   probe; each file in the set is described afresh; every file whose
   description depends on a file whose description changed by value joins the
   set; today's star, selection and incompleteness propagation runs over the
   set until nothing changes. Files outside the set keep their descriptions by
   identity.
3. `CatalogDelta` reporting `recomputed`, `changed`, `moved`,
   `changedOriginals` and `removedOriginals`, with `moved` separating a
   position-only change from a change by value, because iteration 6 decides
   the two differently.
4. `buildCatalog` becomes `assembleCatalog(describeFiles(..., allOwnedFiles))`
   with its name, signature and result unchanged from the outside;
   `catalog.ts` keeps its public shape and the batch helper calls it
   unchanged.
5. T4 activated with `describeFiles` and `assembleCatalog`;
   `DescriptionDependencies`, `FileDescription` and `CatalogDelta` join the T2
   wildcard.
6. Tests: `src/tests/descriptions.test.ts` (dependency recording, the
   recomputed set, propagation to a fixed point, ambiguity and incompleteness,
   removed originals); `src/tests/catalog.test.ts` extended with the assembled
   catalog equal to the whole build on the reference and toolkit copies; the
   existing star, coverage and resource tests unchanged and passing.

## Matrix rows executed here

- I5-03: `assembled-equals-whole` (assembly equals `buildCatalog` on R, T and
  S100); `star-growth-reach` (only the star target and its re-exporter are
  recomputed); `forwarding-chain-reach` (exactly the three chain files);
  `namespace-forwarding-reach` (the namespace re-exporter and its target);
  `resource-shim-reach` (the shim path recorded and only resource describers
  recomputed); `ambiguity-propagation` (ambiguity recorded and settled in
  bounded rounds); `closure-superset` (thirty edits on each of R, T and S100:
  every description that changed by value lies inside the recomputed set).

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/analysis/subs/typescript/src/tests/descriptions.test.ts \
  subs/analysis/subs/typescript/src/tests/catalog.test.ts \
  subs/analysis/subs/typescript/src/tests/cyclic-stars.test.ts \
  subs/analysis/subs/typescript/src/tests/resources.test.ts
npm test
npm run reference:verify -- --plan 5 --iteration 3      # requires 2 and 3
npm run reference:verify -- --plan 1                    # the catalog path is shared with batch
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kind: `api` only, over `A` fixtures. Expected intermediate failures:
the unfiltered `--plan 5` gate, and every capability after `catalog` still
unavailable. A description that goes stale because a dependency was not
recorded is a defect in this iteration; `closure-superset` is the instance
that detects it, and recomputing more than the minimum is allowed while
recomputing less is not.

## Exit criteria

- `describeFiles` and `assembleCatalog` exist behind T4 and the assembled
  catalog equals `buildCatalog` by value on three fixtures.
- Every I5-03 instance ran and asserted its own expectation, including the
  closure comparison against a whole recompute.
- Plan 1's gate, `check:reference` and `check:self` pass unchanged.

## Handoff

Iteration 4 gives these descriptions a warm compiler and one live snapshot;
iteration 6 keeps them as retained facts and drives access re-interpretation
from `CatalogDelta.changed` and `CatalogDelta.moved`, so the two lists are
the contract between the catalog and the session.
