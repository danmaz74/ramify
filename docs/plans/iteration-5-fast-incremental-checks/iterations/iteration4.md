# Iteration 4: Retained compiler adapter and observed reads

**Plan:** [Plan 5: Fast incremental checks](../main-plan.md).
**Prerequisites:** iteration 3 (`catalog`: per-file descriptions, the
dependency-driven recomputation and the assembled catalog). **Owners:**
`subs/analysis/subs/typescript/`, with the `ObservationSink` type in
`subs/analysis/subs/project/src/interfaces/project.ts` and the analysis A7
relay line that carries it.

## Goal

Keep one warm TypeScript server with exactly one live snapshot behind a plain
adapter that updates from a named change set, regenerates the synthetic
configuration when the owned file list changes, reports every filesystem
observation it makes to a sink, releases its compiler on demand and fails
explicitly when the server is lost.

## Read first

- [contracts.md](../contracts.md#typescript-descriptions-the-interpreter-and-the-retained-adapter):
  `SourceChangeSet`, `RetainedSourceInputs`, `RetainedSourceAnalysis` and the
  `retained-source-analysis.ts` paragraph, including the sentence that
  `RetainedSourceInputs.sink` names project's type.
- [contracts.md](../contracts.md#project-the-observer): `ObservationSink`,
  which this iteration declares in project's vocabulary because the adapter is
  its first consumer.
- [scope.md](../scope.md#observed-inputs): Observed inputs;
  [Paths of an update](../scope.md#paths-of-an-update) for what the adapter
  must support on each path; [Session hosting](../scope.md#session-hosting)
  for the compiler release.
- [owners.md](../owners.md): TypeScript, Project, Analysis and the three
  iteration 4 rows of the activation manifest, including why the sink is
  project's type and reaches `typescript` through A7.
- Main plan: [Proposed contract shapes](../main-plan.md#proposed-contract-shapes);
  [Resolved decisions](../main-plan.md#resolved-decisions) 4; matrix row
  I5-04; the observed-set risk row.
- `probes.md`: P5-1 snapshot update costs and P5-5 observed reads, which
  establish this iteration's feasibility before it starts.
- Source: `subs/analysis/subs/typescript/src/{compiler-helper,bridge,wire,resolution,source-analysis}.ts`,
  the virtual synthetic configuration and resource witness, and
  `src/tests/{compiler-paths,lifetime,retention}.test.ts`.
- [Daemon and analysis](../../../architecture/daemon.md): Engine inputs and
  analysis pipeline.

## Deliverables

1. `subs/analysis/subs/typescript/src/retained-source-analysis.ts` exporting
   `createRetainedSourceAnalysis(inputs)`. It runs in the caller's thread,
   which is the session worker from iteration 8, and creates the API client
   with filesystem callbacks that read the disk directly and report every
   read, existence probe, directory listing, realpath and absence to
   `inputs.sink`.
2. `update(changes)` names changed, created and deleted files, an optional
   inventory when the owned file list or areas changed, and `invalidateAll`.
   Exactly one snapshot is live: the previous one is disposed inside the call
   before it returns. The synthetic configuration and the resource witness are
   virtual files regenerated from `changes.inventory` when it is non-null.
3. `describe(files)` over the retained descriptions of iteration 3 returning
   the descriptions and the delta; `catalog()` assembling the current catalog;
   `interpreter()` returning the maintained interpreter of iteration 2.
4. `releaseCompiler()` closes the server and disposes the snapshot, and the
   next `update` reopens with `invalidateAll` semantics and the same
   observations; `dispose()` releases everything. Loss of the server between
   calls rejects the next call with a `SourceFailure` whose code is
   `read-failure`; no stale fact is ever returned.
5. The finite `compiler-helper.ts` and `bridge.ts` remain the batch path,
   unchanged.
6. `ObservationSink` declared in
   `subs/analysis/subs/project/src/interfaces/project.ts`, inside the P2
   wildcard, and added to analysis's A7 name list, so `typescript` names the
   sink through the relay that already carries `ProjectInventory` and
   `InventoryFile` into `resolution.ts`. It is a type only here; iteration 5
   adds the observer that implements it. The two iterations run on parallel
   branches from iteration 2, so whichever lands first adds this four-line
   declaration and the convergence keeps exactly one copy.
7. T5 activated with `createRetainedSourceAnalysis`; `SourceChangeSet`,
   `RetainedSourceInputs` and `RetainedSourceAnalysis` join the T2 wildcard.
8. Tests: `src/tests/retained-source-analysis.test.ts` (one live snapshot,
   equality with a fresh adapter, created and deleted files with the
   regenerated configuration, `invalidateAll`, observed reads, server loss,
   release and rebuild, disposal).

## Matrix rows executed here

- I5-04: `single-live-snapshot` (twenty updates, never more than one live
  snapshot); `changed-file-facts-equal` (facts equal a fresh adapter's
  including positions); `created-deleted-configuration` (the owned list and
  the synthetic configuration follow in both directions);
  `invalidate-all` (every file described afresh, catalog equal to
  `buildCatalog`); `observed-reads-complete` (the sink's observations equal
  `readProject`'s inputs by path, role and identity on R and S100);
  `server-loss-explicit` (`read-failure`, no stale fact); `release-and-rebuild`
  (warm after release, equal facts after the rebuild).

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/analysis/subs/typescript/src/tests/retained-source-analysis.test.ts \
  subs/analysis/subs/typescript/src/tests/compiler-paths.test.ts \
  subs/analysis/subs/typescript/src/tests/lifetime.test.ts \
  subs/analysis/subs/typescript/src/tests/retention.test.ts
npm test
npm run reference:verify -- --plan 5 --iteration 4      # requires 2, 3 and 4
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kind: `api` only, over `A/R` and `A/S100`. Expected intermediate
failures: the unfiltered `--plan 5` gate and every capability after
`compiler`. Every test that starts a server kills it in `finally`; a leaked
server process or an undisposed snapshot fails
`src/tests/retention.test.ts`, not only the new suite.

## Exit criteria

- The adapter keeps one live snapshot, reports every observation to project's
  `ObservationSink` and fails explicitly on server loss, with every I5-04
  instance executed.
- `ObservationSink` is declared once in project's vocabulary and reaches
  `typescript` through A7; no observation type is defined in `typescript`.
- A session-shaped sequence of updates produces facts equal to a fresh
  adapter's at each step.
- The batch path and both project checks are unchanged.

## Handoff

Iteration 6 opens this adapter inside the retained session and feeds it the
change sets the observer of iteration 5 classifies; the sink it takes is the
observer's implementation of the `ObservationSink` declared here, so the
session's input identity is the batch capture's identity.
