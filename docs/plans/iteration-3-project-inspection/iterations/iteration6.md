# Iteration 6: The `symbol-details` capability and stage

**Plan:** [Plan 3: Project inspection](../main-plan.md).
**Prerequisites:** iteration 4 (`typescript`: `describeOriginals`, the
`details` helper operation and `SourceAnalysis.details`) and iteration 5 (the
three query branches of `answerInspection` over the whole inspection
vocabulary). Nothing from Plan 5. **Owners:** `subs/analysis/`.

## Goal

Make symbol details part of an analysis run that asks for them: a requested
capability, a `details` stage that describes the originals of every effective
exposure while the compiler is still alive, the result recorded in the
snapshot, and the three answers rendering it per row and per level. A run that
does not request the capability is unchanged, and a failing stage leaves the
check completed.

## Read first

- [contracts.md](../contracts.md#analysis-inspection-vocabulary-and-queries):
  the changed members of `src/interfaces/analysis.ts` (`Capability`,
  `StageId`, `AnalysisLimits.details`, `AnalysisSnapshot.details`) and the
  stage-state paragraph; `SymbolDetailView` and the `details` member of
  `AvailabilityListing`.
- [contracts.md](../contracts.md#typescript-symbol-details): the
  `SourceAnalysis.details` signature and `SymbolDetails` this stage consumes.
- [scope.md](../scope.md#detail-tiers-and-availability) in full, including the
  table of where details come from and the rule that an unextracted detail is
  never rendered as empty text; [Limits](../scope.md#limits) for
  `AnalysisLimits.details`.
- [owners.md](../owners.md): the Analysis section and the iteration 6 row of
  the activation manifest (the capability inside A4).
- Main plan: [Resolved decisions](../main-plan.md#resolved-decisions) 4;
  matrix row I3-08; the detail-bloat risk row;
  [Coexistence with Plan 5](../main-plan.md#coexistence-with-plan-5) for the
  append rule on `interfaces/analysis.ts` and the single inserted block in
  `run-analysis.ts`.
- [subcases.md](../subcases.md): the I3-08 rows.
- `probes.md`: P3-1's detail cost and output size, and P3-2's snapshot
  retention with and without details, which fix the report-growth budget this
  iteration must stay inside.
- [Daemon and analysis](../../../architecture/daemon.md): Engine inputs and
  analysis pipeline; DA14 on capabilities and stage failure.
  [Memory lifecycle](../../../architecture/memory-lifecycle.md): ML06.
- Source in full: `subs/analysis/src/run-analysis.ts` (the stage list, the
  compiler disposal between `access` and `decide`, the diagnostic and
  capability records), `src/interfaces/analysis.ts`, `src/analyze-project.ts`,
  `src/report.ts`, `src/report-data.ts`, `src/report-copy.ts`,
  `src/report-capacity.ts` and `src/inspection.ts`;
  `src/tests/report-capacity.test.ts` and `src/tests/report-copy.test.ts`.

## Deliverables

1. `subs/analysis/src/interfaces/analysis.ts`: `'symbol-details'` appended to
   `Capability`, `'details'` added to `StageId` between `access` and
   `decide`, `AnalysisLimits.details: DetailLimits` and
   `AnalysisSnapshot.details: SymbolDetails | null`. Plan 5's removals
   elsewhere in the file are untouched.
2. The `details` stage in `src/run-analysis.ts`, inserted as one block after
   `access` and before the compiler session is disposed: it collects the
   originals of every effective exposure from the model, calls
   `SourceAnalysis.details` once with that set and `limits.details`, and
   records the result in the snapshot. Without the capability the stage is
   `not-requested` and no helper call is made.
3. Failure handling: a thrown or rejected stage records an `execution`
   diagnostic, marks the capability record `executed: false`, sets the stage
   `failed` and leaves `decide` and `report` completed, so the check outcome
   is unaffected. A blocked compiler session marks the stage `blocked`.
4. Report carriage: `SymbolDetails` travels inside the snapshot only, is
   counted by `report-capacity.ts` against `maxReportBytes`, and is dropped
   with the snapshot when the report exceeds it. The coverage notes the stage
   produces join the report's coverage list.
5. `answerInspection` consumes `snapshot.details`: `SymbolDetailView` per row
   with `state` and `kind`, `signature` and `summary` at level `signatures`,
   and `declaration` and `documentation` additionally at level `docs`; rows
   for originals the stage did not describe state `unavailable` with reason
   `not-exposed` or `failed`; a snapshot without details keeps
   `not-extracted` for every row and one listing-level reason. `--search` now
   also matches signatures and documentation.
6. Tests: `subs/analysis/src/tests/details-stage.test.ts` (requested and
   not-requested runs, the stage states, the failure path, the snapshot
   member and the report bytes) and `src/tests/inspection-available.test.ts`
   extended with the three detail levels and the per-row states; the existing
   report-capacity and report-copy tests extended for the new snapshot member.
7. Harness: the `details-capability` capability with the I3-08 api handlers in
   `scripts/reference-harness/details-cases.ts`, including the byte-comparison
   instance over two runs of the same fixture.

## Matrix rows executed here

- I3-08: `requested-only`, `exposed-originals-only`,
  `snapshot-carries-details`, `failure-leaves-check-completed`,
  `report-bytes-bounded`, `search-details`.

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/analysis/src/tests/details-stage.test.ts \
  subs/analysis/src/tests/inspection-available.test.ts \
  subs/analysis/src/tests/report-capacity.test.ts \
  subs/analysis/src/tests/report-copy.test.ts
npm test
npm run reference:verify -- --plan 3 --iteration 6       # requires 2 to 6
npm run reference:verify -- --plan 1                     # the pipeline is shared with every batch check
npm run reference:verify -- --plan 2
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kind: `api` only, over R and T copies. Expected intermediate
failures: the unfiltered `--plan 3` gate, and the `inspect-batch`,
`inspect-service`, `inspect-join`, `inspect-measure` and `completion`
capabilities. `requested-only` compares two reports of the same fixture and
requires them byte-identical except `runId`; any difference from adding the
stage is a defect in this iteration, not an accepted cost. Reports with
details must stay inside the growth budget iteration 1 fixed from P3-1.

## Exit criteria

- `symbol-details` is a requestable capability, the `details` stage runs
  between `access` and the compiler disposal, and `AnalysisSnapshot.details`
  carries the result.
- A run without the capability produces a byte-identical report except
  `runId`, and a failing details stage leaves `decide` completed with the
  capability recorded as not executed.
- The three answers render details per row and per level, and never render an
  unextracted detail as empty text.
- Every I3-08 instance ran and asserted its own expectation; Plan 1's and
  Plan 2's gates, `check:reference` and `check:self` pass unchanged.

## Handoff

Iteration 7's `runInspection` requests this capability so the batch path
answers with details, and the CLI renders the per-row states. Iteration 8's
resident path leaves the rows `not-extracted`, and iteration 9 replaces that
state with details obtained from the retained session at the answering
revision.
