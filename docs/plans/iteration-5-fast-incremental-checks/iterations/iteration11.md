# Iteration 11: Live equivalence gate

**Plan:** [Plan 5: Fast incremental checks](../main-plan.md).
**Prerequisites:** iteration 10 (`hook-cli`: the compact reply, the
`--changed` command and the installed executable; every earlier capability).
May run in parallel with iteration 12, which starts from the same iteration
10 and owns its own endpoint directories. **Owners:** the integration suite in
`scripts/reference-harness/`; any owner whose real defect the sequences find.

## Goal

Establish, through the real daemon, the real watcher and the installed
executable, that every step of the recorded edit sequences publishes a
revision equal to a batch check of the same disk state, that the session's
audit passes after every step, and that hooks racing the watcher, bursts
inside one debounce window and removals behave as the covering rule fixes.

## Read first

- Main plan: [Deliverable and completion boundary](../main-plan.md#deliverable-and-completion-boundary);
  [Required data flow](../main-plan.md#required-data-flow);
  [Freshness and supersession guarantees](../main-plan.md#freshness-and-supersession-guarantees);
  matrix row I5-12;
  [Harness implementation and evidence](../main-plan.md#harness-implementation-and-evidence)
  items 3 and 7.
- [scope.md](../scope.md#batch-and-session-comparison): Batch and session
  comparison; [Live updates and the covering rule](../scope.md#live-updates-and-the-covering-rule);
  [The sweep](../scope.md#the-sweep).
- [subcases.md](../subcases.md): the twelve-step reference sequence and the
  fixture conventions.
- [Reference cases](../../reference-project/cases.md),
  [contract map](../../reference-project/contract-map.md) and
  [harness](../../reference-project/harness.md) for the statement IDs and the
  independent expectations of each step.
- Plan 2 [iteration 11](../../done/iteration-2-resident-verification/iterations/iteration11.md)
  and its equivalence handlers
  (`scripts/reference-harness/equivalence-{cases,comparison,process,sequences,watch}.ts`),
  which this iteration extends rather than duplicates.
- [Daemon and analysis](../../../architecture/daemon.md): Freshness and saves;
  Revisions and atomic publication.

## Deliverables

1. Live sequence handlers extending the Plan 2 equivalence harness: the
   twelve-step reference sequence and the same twelve steps on S100, applied
   to a real copy watched by the real daemon, with each step followed by a
   `--changed` hook, a batch check of the same disk state and the session's
   `verify()` through `daemon status`.
2. Comparison exactly as [scope.md](../scope.md#batch-and-session-comparison)
   fixes: inventory, areas, catalog files, originals and coverage, model,
   accesses, results with decisions, diagnostics, warnings, report coverage,
   summary and `inputId`, after replacing `runId`; plus each step's own
   expected finding or its absence.
3. Race and burst handlers: a hook issued before the watcher event arrives, a
   hook issued after the revision published, five writes inside one 100 ms
   window with a hook for each, and the removal of an owned file and of a
   whole module directory.
4. Every handler owns its `RAMIFY_ENDPOINT_DIR`, starts its daemon through the
   installed executable and stops it in `finally`; a surviving daemon or a
   leaked helper fails the instance.
5. Real defects the sequences find are fixed in their owners with a regression
   test in that owner; no comparison is relaxed and no step is skipped.

## Matrix rows executed here

- I5-12: `reference-sequence-live` (twelve steps, each equal to batch and
  audited); `hundred-owner-sequence-live` (the same on S100);
  `hook-race-watcher` (one update for the racing hook, immediate answer for
  the later one); `burst-coalesced` (one revision covering five writes, every
  hook covered, none superseded); `removals-live` (file and module removal
  equal to batch with the findings in `delta.removed`).

## Verification

```sh
npm run build && npm run type-check
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npx tsx scripts/measurements/materialize.ts                   # S100 fixture, if not present
npm run reference:verify -- --plan 5 --iteration 11           # requires 2 to 11
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kind: `process` only, over `P/R` and `P/S100`; a quick or session run
of the same sequence does not satisfy these rows. Expected intermediate
failures: the unfiltered `--plan 5` gate, which also needs iterations 12 and
13. Timing observed here is not acceptance evidence; iteration 12 measures.

## Exit criteria

- Every step of both sequences published a revision equal to batch, with
  `verify()` equal after each step and each step's expected finding present or
  absent as recorded.
- The hook race, the coalesced burst and the removals behave as the covering
  rule fixes, with every I5-12 instance executed.
- No daemon, worker, compiler server or helper survives any handler.

## Handoff

Iteration 13 cites this gate as the live equivalence evidence of the
completion report, and Plans 3, 4 and 6 inherit the sequences as the fixtures
for their own live behavior.
