# Iteration 4: Render the architect view

**Plan:** [Plan 2B: Generated architect view](../main-plan.md).
**Prerequisites:** iteration 3.
**Owners:** `analysis`.

## Goal

Render an architect projection and its dependency facts into the exact files
of the specification, deterministically and with every record bounded.

## Read first

- [Contracts C4](../contracts.md#c4-rendering) and AV12–AV18.
- The whole [specification](../../../architecture/architect-view.spec.md),
  especially the layout, `README.md`, `module.json`, the three record files,
  ordering, record design, metadata and agent instructions.
- `subs/analysis/src/interfaces/dependency-diagram.ts` (`DependencyDiagramFacts`,
  `DependencyBoundaryFact`) and `subs/analysis/src/dependency-diagram.ts`
  (`headlineOf`) for the unit precedence.
- `src/architect-view.ts` from iteration 3.
- `subs/daemon/src/api-view-documents.ts` for the existing determinism
  conventions.

## Deliverables

1. Add `renderArchitectView` and C4's types in `analysis`
   (`src/architect-render.ts`), importing no compiler, filesystem or session
   module.
2. Derive the (consumer module, original) units and `uses`/`usedBy` from the
   boundaries.
3. Render `_meta.json`, `README.md` and, per module, `module.json`,
   `behavior.jsonl`, `supporting.jsonl` and `tests.jsonl`, with the
   specification's field order, omissions, bounds, cuts and ordering.
4. Expose the new names from `analysis` to its parent, and relay them from
   the root to descendants in `module.ramify`.
5. Add tests for AV12–AV18, with byte-exact golden files for the `architect`
   fixture in both dependency states.
6. Render the toolkit in-process from a real projection and a real analyzer
   run, and report the files, bytes and mean and maximum behavior record
   length.

## Matrix rows executed here

AV12–AV18.

## Verification

```sh
npx vitest run subs/analysis/src/tests/architect-render.test.ts
npx vitest run subs/analysis/src/tests/architect-view.test.ts
npm run type-check
npm run build
npm run check:self
```

## Exit criteria

AV12–AV18 pass; the toolkit render is within the view-size budget and its
record lengths are recorded.

## Handoff

`renderArchitectView`, the golden files, the root relays and the toolkit
render measurements.
