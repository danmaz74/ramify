# Iteration 11: Reference edit sequences and equivalence gate

**Plan:** [Plan 2: Keep verification current](../main-plan.md).
**Prerequisites:** iteration 10 (the completed package; `cli`,
`daemon-process`, `client`, `increment`; the S100 fixture from iteration 2).
May run in parallel with iterations 12 and 13 using its own endpoint
directories. **Owners:** integration in `scripts/reference-harness/` and
`scripts/measurements/materialize.ts`; an owner is touched only to fix a
defect these sequences find.

## Goal

Prove that the resident path and the batch path are the same checker: at
every step of the recorded reference and 100-owner edit sequences a
daemon-backed `ramify check` and `ramify check --batch` produce equal reports
except `runId`, including coverage notes and expanded contracts, while each
step also asserts its independently expected outcome. Verify the live
watcher against the same edits.

## Read first

- [scope.md](../scope.md): Batch and incremental comparison; Freshness and
  supersession guarantees; the watch-event row of Latency and memory targets.
- [subcases.md](../subcases.md): Fixture and evidence conventions (statement
  IDs, `remove-hop`, `restore-hop`); rows I2-25 and I2-26.
- Main plan: Coherent inputs, retained products and equivalence; harness
  points 5 and 8; the first risk row.
- [Reference contract map](../../reference-project/contract-map.md): Exposing
  statements; [reference cases](../../reference-project/cases.md): Exposure
  and original identity, Tags and source areas, Testing and composition.
- The iteration 3 I2-11 handlers, the iteration 6 scenario mutations and
  `scripts/reference-harness/mutation.ts` (`replaceExactlyOnce`), which
  these sequences reuse at process level.
- [Daemon and analysis](../../../architecture/daemon.md): Incremental updates
  and analysis depth, DA06 to DA08, DA10.

## Deliverables

1. Comparison helper: run both commands with `--format json` on the same
   directory state, replace `runId` with a constant, deep-compare the two
   `ramify.analysis/1` documents (stages, capabilities, outcome, snapshot,
   diagnostics, warnings, coverage, summary); any difference fails the
   instance with the first differing path.
2. Recorded sequences as data: the ten reference steps (`remove-hop`,
   `restore-hop`, `wildcard-add`, `wildcard-remove`, README edit, header tag
   add, header tag revert, source edit, configuration edit, configuration
   revert), the five S100 steps (exposure removal, README edit, source edit,
   testing-area move, revert), the coverage steps (an `unsupported-loader`
   note from a macro import target, and wildcard growth) and the removal
   steps. Each step names its anchor, asserted to occur exactly once, and its
   independent expectation.
3. Live watcher instances through `ramify watch --format json` on a real
   copy: the revision line after each edit is recorded with its arrival time
   against the debounce-plus-source-edit target, and a following `check`
   confirms it.
4. Harness: capability `equivalence`; handlers over `P/R`, `P/S100` and
   `P/F`, each with a unique `RAMIFY_ENDPOINT_DIR`, stopping its daemon in
   `finally`. Defects found are fixed in their owners with a regression test.

## Matrix rows executed here

- I2-25: `reference-sequence` (ten steps; reports equal except `runId` at
  every step); `hundred-owner-sequence` (five S100 steps; same equality);
  `contracts-and-coverage-equal` (expanded selections and coverage arrays,
  including the `unsupported-loader` note, deep-equal); `removals` (an
  introduced denial and coverage note disappear in both modes alike).
- I2-26: `remove-hop-live` (the watch shows the denial within the target;
  the check confirms); `restore-hop-live` (denial gone); `wildcard-growth-live`
  (contract expands; `changed` names only the source file); `merge-live` (the
  unchanged unmarked importer's decision becomes a value check in both modes;
  no tag denial from the untagged fixture); `testing-move-live`
  (`testing-origin` denial for the ordinary importer).

## Verification

```sh
npm run build && npm run type-check
npm run reference:verify -- --plan 2 --iteration 11  # requires 2 to 11; every handler owns its RAMIFY_ENDPOINT_DIR
npm run reference:report                             # equivalence instances executed
git diff --check
```

Evidence kind: `process` only, with the installed executable and a real
daemon per instance; never a quick run. Expected until fixed: a first
difference usually points at reuse that dropped a coverage note or an
expanded contract; the fix belongs to analysis, never to the comparison.

## Exit criteria

- Every step of every recorded sequence is equal in both modes and asserts
  its own expectation; every listed instance ran.
- Live watcher revisions arrive within the recorded target on the reference.
- No comparison tolerance beyond `runId` exists in the harness.

## Handoff

Iteration 14 cites these sequences as the equivalence evidence and Plan 5
reuses the materialized-step oracle; iteration 13 reuses the S100 fixture
and the edit classes as its warm workloads.
