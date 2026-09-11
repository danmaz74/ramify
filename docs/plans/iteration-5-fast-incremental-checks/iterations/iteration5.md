# Iteration 5: Project observer and incremental acquisition

**Plan:** [Plan 5: Fast incremental checks](../main-plan.md).
**Prerequisites:** iteration 2 only (the registered `--plan 5` gate); the
observer uses no compiler change, so this iteration may run in parallel with
iterations 3 and 4. **Owners:** `subs/analysis/subs/project/`, with the
`analysis` relay line A7.

## Goal

Keep one acquired project observed instead of sealed: record every input with
its role and identity, update the inventory locally for description, README,
created and deleted files inside existing areas, rebuild it for structural
changes, re-observe the whole set on demand as the sweep, and compute an
input identity equal to `readProject`'s over the same inputs.

## Read first

- [contracts.md](../contracts.md#project-the-observer): `InputChangeKind`,
  `ObservedChange`, `InventoryUpdate`, `ProjectObserver`, `ProjectObserve`,
  the `ObservationSink` this owner declares, and the `observer.ts` paragraph.
- [scope.md](../scope.md#observed-inputs): Observed inputs;
  [The sweep](../scope.md#the-sweep).
- [owners.md](../owners.md): Project, Analysis and the iteration 4 and 5 rows
  of the activation manifest, including why `ObservationSink` is this owner's
  type and reaches `typescript` through A7.
- Main plan: [Resolved decisions](../main-plan.md#resolved-decisions) 4 and 5;
  matrix row I5-05; the observed-set risk row.
- `probes.md`: P5-5, which fixes what the sink must record.
- Source: `subs/analysis/subs/project/src/{read-project,capture,inventory,configuration,purpose,references,selection,resolve-root}.ts`
  and `src/interfaces/project.ts`; `subs/analysis/src/run-analysis.ts` for the
  `inputId` recipe; `src/tests/{capture,project,purpose,references}.test.ts`.
- Plan 1 [contracts](../../done/iteration-1-project-verifier/contracts.md):
  Project: acquisition, inventory and metadata, including the layout issues
  `readProject` reports.

## Deliverables

1. `subs/analysis/subs/project/src/observer.ts` exporting
   `observeProject(options)`. It performs Plan 1's acquisition once through
   the existing capture, inventory, configuration and purpose code, keeps the
   observations instead of sealing and disposing them, and exposes
   `inventory`, `inputs`, `inputId`, `sink`, `apply`, `reobserve`,
   `readDescription`, `readReadme` and `dispose`.
2. `apply(changes)` classifies: a change inside an existing area re-observes
   that path, re-parses a description or re-reads a README and returns
   `local` with its description, README, created, deleted and changed lists; a
   new or removed `module.ramify`, a new directory beneath `subs/`, a case or
   symlink violation or a layout error returns `structural` after a whole
   re-inventory or `invalid` with Plan 1's issues; a read failure returns
   `incomplete`; nothing observed returns `unchanged`.
3. `reobserve()` stats every observed path, hashes the ones whose signature
   changed and returns their changes as ordinary `ObservedChange` values, so
   contexts can feed a sweep into the same update path.
4. Private `src/observations.ts` holding the observation table, the recorded
   roles, identities and signatures, and the `inputId` recipe shared with
   `run-analysis.ts`, so a session revision and a batch report over the same
   inputs carry the same identity. The observer's `sink` implements this
   owner's `ObservationSink`, which the retained adapter of iteration 4
   reports to, so the compiler's reads become observed inputs. That
   declaration lands with whichever of iterations 4 and 5 reaches
   `interfaces/project.ts` first, and the convergence after the parallel
   group keeps exactly one copy of it.
5. `readProject` and `resolveProjectRoot` are unchanged; P4 is activated with
   `observeProject` and the five observer types join the P2 wildcard beside
   `ObservationSink`. Analysis A7 gains the five names, beside the sink it
   carries from iteration 4.
6. Tests: `src/tests/observer.test.ts` (local, structural, invalid,
   incomplete and unchanged updates, description and README reads, disposal)
   and `src/tests/sweep.test.ts` (`reobserve` over unwatched changes and the
   identity equality with `readProject`).

## Matrix rows executed here

- I5-05: `description-local-update` (`remove-hop` returns a local update with
  no directory re-listing); `readme-local-update` (purpose changes, no
  description re-parsed); `file-created-local`; `file-deleted-local`;
  `module-added-structural` (sixteen owners after the rebuild);
  `stray-description-invalid` (Plan 1's layout issue, no inventory offered);
  `sweep-detects-unwatched` (a changed dependency declaration returned once);
  `input-id-equals-batch` (identity equal to `readProject`'s at four steps on
  R and S100).

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/analysis/subs/project/src/tests/observer.test.ts \
  subs/analysis/subs/project/src/tests/sweep.test.ts \
  subs/analysis/subs/project/src/tests/project.test.ts \
  subs/analysis/subs/project/src/tests/capture.test.ts
npm test
npm run reference:verify -- --plan 5 --iteration 5      # requires 2 and 5
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kind: `api` only, over `A/R` and `A/S100`. Expected intermediate
failures: the unfiltered `--plan 5` gate, and `--iteration 6` and beyond until
their own iterations land. An observer whose identity differs from
`readProject`'s for the same inputs is a defect here, not a tolerated
difference.

## Exit criteria

- `observeProject` exists behind P4, classifies every change the scope
  document lists and re-observes on demand.
- Every I5-05 instance ran, including the identity equality on two fixtures.
- Plan 1's acquisition behavior, `check:reference` and `check:self` are
  unchanged.

## Handoff

Iteration 6 opens the observer and the retained adapter together: the
observer's `sink` goes into `createRetainedSourceAnalysis`, its
`InventoryUpdate` kind selects the revision path, and its `inputId` is the
identity every published revision carries.
