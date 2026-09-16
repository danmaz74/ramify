# Iteration 2: Module-only report projection

**Plan:** [Plan 6A: Module-only project explorer](../main-plan.md).
**Prerequisites:** iteration 1's frozen contract, mixed report and baseline.
**Owners:** `presentation/subs/project-view [ui, browser]` for the public DTO
and `service-api [dispatch]` for its projection. This iteration is one bounded
provider capability; presentation behavior remains in iteration 3.

## Goal

Make the serialized explorer model contain only module-to-module import data
while preserving the full source report and truthful coverage state.

## Read first

- [View-model amendment](../view-model-amendment.md).
- `subs/service-api/src/project-view.ts`.
- `subs/service-api/src/tests/project-view.test.ts`.
- `subs/presentation/subs/project-view/src/interfaces/project-view.ts`.
- Analysis source interfaces used by the projection.

## Deliverables

1. Remove `ExplorerTargetGroup`, `otherTargets`, summary `otherTargets` and
   coverage `targetIds` from the public DTO.
2. Build one visible access collection using the frozen cross-owner application
   predicate and use it for edges plus every import-related module/summary metric.
3. Delete non-application target grouping and target-ID coverage indexing from
   the projection rather than calculating data that is discarded later.
4. Preserve every report coverage row with module/visible-edge association and
   preserve report state, revision, exports, files and details behavior.
5. Update projection fixtures and JSON assertions to reject removed keys and
   target labels while proving the input report still contains them.
6. Retain deterministic ordering and the encoded 16 MiB refusal.

## Matrix rows executed here

MX01, MX03, MX04, MX05, MX06 and MX07.

## Verification

Run:

```sh
npm test -- subs/service-api/src/tests/project-view.test.ts
npm run type-check
```

The focused test independently calculates the visible set from fixture facts,
round-trips production JSON, searches recursively for removed keys/target
labels and compares bytes with iteration 1's baseline. Exercise a limit cited
only by an omitted access and the oversize refusal.

Expected intermediate failure: changing the DTO before the presentation and
connected consumers are updated makes full `npm run type-check` fail on those
consumers. The focused service-api tests must pass; record the exact remaining
consumer failures for iterations 3 and 4 rather than weakening the DTO.

## Exit criteria

The service produces the narrowed model from the same report, all import metrics
use only visible cross-module accesses, coverage remains truthful and no
non-application access row enters serialized explorer data.

## Handoff

Iteration 3 receives the final public model and graph-selection compiler errors.
Iteration 4 receives the updated projection fixture, byte comparison and real
router expectations.
