# Iteration 2 results: module-only report projection

**Date:** 2026-09-16. **Result:** completed with the planned downstream
consumer type errors. **Plan:** [Plan 6A](../main-plan.md).

## Implemented contract

The public explorer DTO no longer defines or serializes
`ExplorerTargetGroup`, `ProjectExplorerModel.otherTargets`,
`ExplorerSummary.otherTargets` or `ExplorerCoverage.targetIds`. The presentation
owner's parent exposure and exact declaration fixture no longer name the removed
type.

The service projection now constructs one visible access collection from the
frozen predicate: the access target is application source, both importer and
target files have owners, and those owners differ. Edges and all import-related
module and summary metrics derive from that collection. Non-application target
grouping and target coverage indexing were deleted rather than projected and
discarded later.

Every report coverage row remains. `coverage-edge` associates with the consumer
module and visible edge, `coverage-target` associates only with the consumer
module even though its sole citing access is omitted, and `coverage-global`
remains global. Report state, revision, registry, files, exports and symbol-detail
requests remain represented, deterministic ordering is unchanged, and the
encoded 16 MiB refusal still returns no partial view.

## Frozen fixture evidence

The focused test independently proves that the input report still has eight
accesses: two cross-owner application accesses, one same-owner application
access, and one each of package, builtin, standard-library, outside-module and
unresolved access. The visible serialized access IDs are exactly
`application-denied` and `application-limited`.

The narrowed result has one edge, two access occurrences, two selected symbols,
one denied access, one limited access and three coverage rows. Its encoded JSON
is **5,826 UTF-8 bytes**, below the frozen legacy baseline of **8,485 bytes**.
The round-tripped JSON is searched recursively and contains neither removed key
nor any omitted target label or access ID.

## Verification

`npm test -- subs/service-api/src/tests/project-view.test.ts` passed with one
file and three tests. A temporary exact-byte measurement assertion first
reported 5,826 bytes; the final test records that exact value and the 8,485-byte
ceiling, and the final rerun passed.

`npm run type-check` reached the expected intermediate failure with 23 errors,
all in deferred consumers:

- iteration 3: `ModuleGraphRadial.tsx`, `ProjectExplorerView.tsx`,
  `moduleGraphShared.ts`, `ModuleGraph.test.tsx` and
  `ProjectExplorerView.test.tsx` still reference the removed target type,
  `otherTargets` or `targetIds`; their dependent callback parameters also lose
  contextual types;
- iteration 4: `ProjectExplorerPage.tsx` and `browser-acceptance.ts` still read
  `otherTargets`; their dependent callback parameters also lose contextual
  types.

There were no reported errors in the narrowed DTO, service projection, service
test, presentation declaration or exact declaration fixture. `git diff --check`
passed for the five Iteration 2 implementation files.

## Handoff

Iteration 3 receives the narrowed public DTO and the graph/view compiler errors
listed above. Iteration 4 receives the 5,826-byte projection fixture result and
the remaining page/browser consumer errors. No deferred consumer was weakened or
updated in this iteration.
