# Iteration 7: Retained session: description, broad and metadata paths, positions and the audit

**Plan:** [Plan 5: Fast incremental checks](../main-plan.md).
**Prerequisites:** iteration 6 (`session`: the retained facts, the source
paths, the checked set and the delta). **Owners:** `subs/analysis/`.

## Goal

Complete the revision step: a description change relinks the model and decides
the subtree it can reach, a README change touches no compiler, a created or
deleted file, a configuration, dependency or unknown path takes the broad
path, an invalid description publishes as invalid, and the session's own
audit recomputes everything from the warm compiler and compares.

## Read first

- [contracts.md](../contracts.md#analysis-the-retained-session): `verify`,
  `report`, the position rule, the `reported` outcome and the fact-size bound.
- [scope.md](../scope.md#model-and-decisions): Model and decisions;
  [Paths of an update](../scope.md#paths-of-an-update);
  [Batch and session comparison](../scope.md#batch-and-session-comparison);
  the deferral rows for the proportional relink and for resolution-bounded
  narrowing.
- [owners.md](../owners.md): Analysis and the iteration 7 row of the
  activation manifest.
- Main plan: [Engine results and their delivery](../main-plan.md#engine-results-and-their-delivery);
  matrix row I5-07; the fixed-point and position risk rows.
- Source from iteration 6: `src/{retained-session,session-facts,session-revision}.ts`;
  `subs/analysis/src/validation.ts` and the linking and model stages in
  `run-analysis.ts`; the reference [contract map](../../reference-project/contract-map.md)
  for W2, C1 and the subtree each statement reaches.
- Plan 2 [scope](../../done/iteration-2-resident-verification/scope.md): the
  invalidation dependency model this plan replaces, so the retired assumptions
  are recognizable.

## Deliverables

1. The `description` path: a `module.ramify` change inside existing areas
   re-parses and re-links, rebuilds the model and decides every access whose
   importer or original owner lies in the subtree of a module whose
   exposures, areas or tags changed. No compiler work and no re-extraction.
2. The `metadata` path: a README change refreshes purposes only, with no
   compiler, link or decision work, and the revision records it.
3. The `broad` path: a created or deleted owned file, a configuration,
   dependency, shim, discovery-relevant or unknown path, or an area change
   re-describes every owned file on the warm compiler and decides everything.
   The checked set says so, and the resolution-bounded narrowing stays
   deferred with its trigger.
4. Invalid and recovering revisions: an invalid description publishes a
   revision with `outcome.execution: 'invalid'` and the observed input
   identity while the last valid revision stays available to status; the next
   valid update publishes normally. An incomplete or unavailable engine
   outcome is delivered unpublished as `reported`, and the session keeps its
   last revision.
5. `verify(control)` in private `src/session-audit.ts`: recompute
   descriptions, accesses, model and decisions for every file from the warm
   compiler and compare field by field with the retained facts, including
   `results[].decisions[].original.declarations`. On mismatch it publishes the
   recomputed facts as a new revision with cause `verify` and returns the
   differing fields.
6. Tests: `src/tests/session-revision.test.ts` (description, metadata and
   broad paths, invalid and recovery) and `src/tests/session-audit.test.ts`
   (equal after each step of the twelve-step sequence, and mismatch on an
   injected corruption). Harness: the twelve-step reference sequence from
   [subcases.md](../subcases.md) with `verify()` after every step.

## Matrix rows executed here

- I5-07: `description-relink-subtree` (decided accesses confined to the
  subtree, the root's denial present); `description-revert`;
  `readme-metadata-only` (no compiler, link or decide work);
  `created-importing-file` and `deleted-file` (broad, equal to batch);
  `configuration-broad` and `dependency-broad` (whole re-extraction on the
  warm compiler); `invalid-description-current` and `invalid-recovery`;
  `audit-equal-sequence` (`verify()` equal after all twelve steps);
  `audit-detects-drift` (mismatch reported and the recomputed revision
  published).

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/analysis/src/tests/session-revision.test.ts \
  subs/analysis/src/tests/session-audit.test.ts \
  subs/analysis/src/tests/retained-session.test.ts
npm test
npm run reference:verify -- --plan 5 --iteration 7      # requires 2 to 7
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kind: `session` only, over `W/R`. Expected intermediate failures: the
unfiltered `--plan 5` gate, and hosting, contexts, CLI, live and measurement
capabilities still unavailable. The audit is part of the session, not a test
helper: a mismatch it reports is a defect in the revision step, and the
published recomputation is the safe response, never a reason to relax the
comparison.

## Exit criteria

- All six revision paths exist, each recording its own checked set, and the
  projection equals batch at every step of the twelve-step sequence.
- `verify()` reports equal after every step and detects an injected
  corruption, publishing the recomputed facts.
- Every I5-07 instance ran and asserted its own expectation.

## Handoff

Iteration 8 hosts this session in a worker thread with limits, the sweep, the
hot and warm levels and deadlines; iteration 9 schedules `verify()` on idle
from contexts and counts its mismatches.
