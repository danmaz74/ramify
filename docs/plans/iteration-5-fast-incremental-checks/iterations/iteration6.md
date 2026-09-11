# Iteration 6: Retained session: facts and source-edit paths

**Plan:** [Plan 5: Fast incremental checks](../main-plan.md).
**Prerequisites:** iterations 4 and 5 (`compiler`: the retained adapter with
observed reads; `observer`: `observeProject` and its updates). **Owners:**
`subs/analysis/`.

## Goal

Open a retained session over one project, keep its facts and reverse indexes
as frozen plain data, and implement the source side of the revision step: the
`unchanged-surface` and `source` paths, the checked set, the finding delta and
the position refresh that keeps decisions and diagnostic identities equal to a
fresh batch analysis.

## Read first

- [contracts.md](../contracts.md#analysis-the-retained-session): the whole
  section, especially `SessionRevision`, `CheckedSet`, `FindingDelta`,
  `RevisionTimings`, `SessionUpdate` and the rules for `update`, `report` and
  positions.
- [scope.md](../scope.md#dependency-model): Dependency model in full,
  including [Paths of an update](../scope.md#paths-of-an-update); the
  [comparison method](../scope.md#batch-and-session-comparison).
- [owners.md](../owners.md): Analysis and the iteration 6 row of the
  activation manifest.
- Main plan: [Required data flow](../main-plan.md#required-data-flow);
  [Retained facts, positions and equivalence](../main-plan.md#retained-facts-positions-and-equivalence);
  [Harness implementation and evidence](../main-plan.md#harness-implementation-and-evidence)
  item 2; matrix row I5-06; the position-drift risk row.
- Source: `subs/analysis/src/{run-analysis,analyze-project,session,report,report-data,report-copy,evaluate-accesses}.ts`
  and `src/interfaces/analysis.ts`; the typescript adapter and the project
  observer from iterations 4 and 5.
- [Daemon and analysis](../../../architecture/daemon.md): Incremental updates
  and analysis depth; Revisions and atomic publication.

## Deliverables

1. `subs/analysis/src/interfaces/session.ts` with the session vocabulary of
   contracts.md: `SessionLimits`, `SessionInputs`, `SessionChange`,
   `RevisionPath`, `CheckedSet`, `FindingDelta`, `RevisionTimings`,
   `SessionRevision`, `SessionUpdate`, `VerifyOutcome`, `SessionStatus`,
   `RetainedSession` and `SessionOpen`. Locally defined types only; foreign
   types arrive as `import type` and are never re-exported.
2. `src/retained-session.ts` exporting `openRetainedSession(inputs, control)`.
   It observes the project, creates the retained adapter with the observer's
   sink, runs the cold path and returns revision 1, or returns `reported` with
   a batch-shaped report and no session for an invalid, incomplete or
   unavailable cold result. In this iteration it runs in the caller's thread;
   iteration 8 moves it into a worker without changing the contract.
3. Private `src/session-facts.ts`: the retained per-file export descriptions,
   per-file access facts, the model, per-access decisions and the reverse
   indexes from original to selecting accesses and from file to importers.
   Facts are frozen and acyclic, and `factBytes` is their serialization length
   measured at publication and bounded by `maxRetainedFactBytes`.
4. Private `src/session-revision.ts` implementing `update(changes)` for the
   source side: classify the changes through the observer, apply one adapter
   update, recompute descriptions over the dependency closure, re-interpret
   the changed files and every file whose target description changed by value,
   rebuild the model when originals changed, and decide the affected accesses.
   The path is `unchanged-surface` when every changed file's description and
   access facts are equal by value ignoring positions, and `source`
   otherwise. `identical: true` reports an update whose named changes had
   unchanged identities and publishes no new sequence.
5. Positions: when facts are equal by value but declarations moved, the
   accesses selecting the moved originals are decided again from the retained
   model so their evidence and diagnostic identities match a fresh pass, and
   `delta.positionOnly` lists the identities that changed for that reason.
6. `report(control)` materializing the `ramify.analysis/1` report of the
   current revision from the retained facts, equal to `analyzeProject` over
   the same inputs except `runId`, and never produced unrequested.
7. A11 and A12 activated with the interface file and `openRetainedSession`;
   `src/index.ts` exports the operation and the type relays.
8. Tests: `src/tests/retained-session.test.ts` (cold open, the two source
   paths, checked sets, deltas, positions, `identical`, report projection and
   disposal); `src/tests/report-copy.test.ts` extended for `SessionRevision`
   plainness. Harness: the `session` capability with handlers that open a real
   session over a `W` copy, apply the edits, call `update` and `verify()` and
   compare with `analyzeProject` over the same disk state.

## Matrix rows executed here

- I5-06: `unchanged-surface-no-propagation` (one file checked, zero accesses
  decided, model not rebuilt); `position-only-refresh` (`positionOnly`
  identities and declarations equal to batch); `import-added-self-only`;
  `export-added-importers` (the file and its importers only, one new
  original); `export-removed-missing` (`missing-export` at each importing
  access); `violation-appears` and `violation-removed` (one finding added,
  then removed); `wide-fanin-bounded` (the vocabulary file and its importers
  only, at most its 56 importing accesses plus its own); `type-to-runtime-merge`;
  `alias-identity`.

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/analysis/src/tests/retained-session.test.ts \
  subs/analysis/src/tests/report-copy.test.ts \
  subs/analysis/src/tests/session.test.ts
npm test
npm run reference:verify -- --plan 5 --iteration 6      # requires 2 to 6
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kind: `session` only, over `W/R` and `W/F`. Every step compares the
session's projection with `analyzeProject` over the same disk state after
replacing `runId`, and asserts its own independent expectation as well.
Expected intermediate failures: the unfiltered `--plan 5` gate; the
description, metadata and broad paths are iteration 7 and are not asserted
here. A revision that differs from batch is a defect, never a tolerance.

## Exit criteria

- `openRetainedSession` exists behind A11 and A12, and its revisions are
  frozen plain data with checked sets, deltas and timings.
- Every I5-06 instance ran, and the projection equals batch at every step of
  the source sequence.
- Plan 2's batch operations, `check:reference` and `check:self` are unchanged.

## Handoff

Iteration 7 adds the description, metadata and broad paths and the audit over
these facts; iteration 8 moves the session into its worker behind the same
contract. `CheckedSet`, `FindingDelta` and `RevisionTimings` are the values
contexts publishes in iteration 9 and the CLI renders in iteration 10.
