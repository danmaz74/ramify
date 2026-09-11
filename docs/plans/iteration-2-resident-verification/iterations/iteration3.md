# Iteration 3: Analysis increments and project resolution

**Plan:** [Plan 2: Keep verification current](../main-plan.md).
**Prerequisites:** iteration 2 (`harness-gate` under `--plan 2`, the
eleven-owner skeleton). Iteration 4 follows this iteration because the
contexts interface names the types added here. **Owners:**
`subs/analysis/` and `subs/analysis/subs/project/`; `subs/analysis/subs/typescript/`
for the bounded `declare global` fix; root `module.ramify` R3/R4 relay lists
only.

## Goal

Give the resident driver two operations over Plan 1's unchanged pipeline:
`analyzeIncrement`, which reuses retained stage products whose recorded input
identities are unchanged and otherwise returns exactly the batch report, and
`resolveProject`, which selects the root and configuration without capturing
anything. Decide the two inherited Plan 1 findings so both modes report them
identically, with an executable instance each. Batch behavior is
byte-for-byte unchanged.

## Read first

- [contracts.md](../contracts.md): Conventions and dependency direction;
  Analysis: incremental products and project resolution, including the
  `ProjectRead` migration and the `retained: null` rule.
- [scope.md](../scope.md): Invalidation dependency model; Batch and
  incremental comparison.
- [owners.md](../owners.md): Analysis, Project, Unchanged owners, the
  iteration 3 row of the Activation manifest.
- Main plan: Starting point; Coherent inputs, retained products and
  equivalence; Engine results and their delivery; Resolved decision 4; the
  inherited findings paragraph.
- [Daemon and analysis](../../../architecture/daemon.md): Engine inputs and
  analysis pipeline; Incremental updates and analysis depth.
- [CLI invocation](../../../architecture/cli-invocation.spec.md): Selecting
  the project; Compiler configuration.
- Source: `subs/analysis/src/{run-analysis,session,analyze-project,index}.ts`
  and `interfaces/analysis.ts`; `subs/analysis/subs/project/src/{read-project,configuration}.ts`
  and `interfaces/project.ts`; the `require` and `declare global` coverage
  paths in `subs/analysis/subs/typescript/src/{accesses,catalog}.ts`.
- Plan 1 [contracts](../../done/iteration-1-project-verifier/contracts.md):
  Analysis: staged composition and completed results; Project: acquisition,
  inventory and metadata.

## Deliverables

1. Project: `src/resolve-root.ts` with `resolveProjectRoot`, the climb and
   configuration discovery extracted from `read-project.ts`, which now calls
   it; canonical real paths; no description read, no helper, no capture;
   `unavailable` for `root-not-found`, `configuration-not-found` and
   `references-only-configuration` exactly as `readProject` classifies them,
   `invalid` reserved for layout and description issues.
   `interfaces/project.ts` adds `ProjectResolution`, `RetainedConfiguration`,
   `ProjectReadOptions.retained` and the required `configuration` and
   `reusedConfiguration` members of the `acquired` `ProjectRead`, which only
   `read-project.ts` constructs; consumers are unchanged. `src/configuration.ts`
   skips the configuration helper when every retained dependency, including
   `absent` and `directory` observations, has the same role and `sha256` in
   the fresh capture. P3 activated; the new P2 names exist.
2. Analysis: `src/increment.ts` (`analyzeIncrement`), `src/resolve-project.ts`
   (`resolveProject`) and private `src/retained-products.ts` (stage keys,
   cumulative dependency sets, serialization size, the `changed` path list).
   `run-analysis.ts` accepts optional retained input and records per-stage
   `(path, role, sha256)` dependencies during acquisition; with no retained
   input it behaves as in Plan 1. `interfaces/analysis.ts` adds `InputChange`,
   `RetainedStageId`, `RetainedStage`, `RetainedAnalysis`, `IncrementInputs`
   and `IncrementRun`; `index.ts` exports the two operations and type relays.
   A9 activated; root R3 and R4 lists extended, with no root source change.
3. Reuse rules exactly as scope.md's stage table: reuse only on an equal
   recomputed key; `changes: null` permits only per-file parse and metadata
   reuse; `changes: []` lets the fresh capture decide every reuse; a
   differing `previous.engine` discards `previous`; every stage is still
   recorded `completed`; `retained` is non-null exactly for a sealed capture
   with `completed` or `invalid` execution, so an incomplete or unavailable
   report returns `retained: null` and equals `analyzeProject`'s report for
   the same request; `changed` names the inputs whose identity differs from
   `previous`; `RetainedAnalysis` is frozen plain data with no compiler, view
   or session reference and `bytes` equal to its UTF-8 serialization length;
   helpers are released within the call that recomputes `catalog` or
   `access`.
4. Inherited findings: a `require` whose target is a module file keeps the
   `unsupported-commonjs` coverage note as its reported outcome; `declare
   global` blocks in module files now receive the `shared-global` coverage
   note through a bounded fix in `subs/analysis/subs/typescript/src/catalog.ts`
   with a regression test in that owner. `analyzeProject` and
   `analyzeIncrement` report both identically, which the two I2-11 instances
   assert.
5. Tests: `subs/analysis/src/tests/{increment,retained-products,resolve-project}.test.ts`,
   the `report-copy.test.ts` extension for `RetainedAnalysis` plainness,
   `subs/analysis/subs/project/src/tests/resolve-root.test.ts`, the
   configuration-reuse extension and the `typescript` regression test.
   Harness: capability `increment` registered; API handlers for I2-10 and
   I2-11 over `R` and `F` copies, comparing with `analyzeProject` after
   replacing `runId`.

## Matrix rows executed here

- I2-10: `null-changes-no-reuse` (only parse and metadata reused; report
  equals batch); `metadata-only-reuse` (README edit reuses every other stage;
  no helper spawned); `exposure-only-reuse` (`remove-hop` reruns link and
  decide; denial appears; no source helper); `header-tag-rerun` (area map
  change reruns catalog and access); `source-rerun` (catalog, access, link,
  decide rerun; configuration reused); `configuration-rerun` (only parse and
  metadata reused); `absent-appears-rerun` (the `absent` observation reruns
  catalog); `dependency-rerun` (a changed `node_modules` declaration reruns
  catalog and access although `changes` omitted it); `products-plain`
  (frozen, acyclic, round-trips; `bytes` equals serialization length);
  `resolve-given` (`selection: 'given'`, canonical path, configuration);
  `resolve-found` (`selection: 'found'`, same root as `readProject`);
  `resolve-outside` (`unavailable` with `root-not-found`; no subdirectory
  search); `resolve-no-configuration` (`unavailable` with
  `configuration-not-found`).
- I2-11: `identical-inputs-equal` (six steps without `previous`: each report
  equals `analyzeProject` except `runId`); `reuse-equal` (same with chained
  `previous`; `reused` nonempty after step one); `independent-negatives`
  (step 1 denies root's import `not-visible`, step 2 allows, step 3 expands
  C1, step 4 changes only purpose metadata, steps 5 and 6 as authored);
  `commonjs-module-target-limit` (a `require` of a module file yields the
  `unsupported-commonjs` note and no `testing-origin` denial from both
  operations; reports equal except `runId`); `declare-global-note` (a
  `declare global` block in a module file yields the `shared-global` note
  from both operations; reports equal except `runId`).

## Verification

```sh
npm run build && npm run type-check && npm test
npm run reference:verify -- --plan 2 --iteration 3   # requires 2 and 3
npm run check:reference && npm run check:self        # batch output unchanged; eleven owners
npm run reference:verify -- --plan 1 --iteration 12  # batch session regression on the modified pipeline
git diff --check
```

Evidence kind: `api` only; the unfiltered `--plan 2` still fails. Reuse that
changes a finding, coverage note or expanded contract is a defect, never a
comparison tolerance. `check:reference` and `check:self` still run batch
here; they become resident in iteration 9.

## Exit criteria

- Both operations exist through the `./analysis` entry; every listed instance
  ran and asserted its own expectation; every reuse comparison is equal.
- `resolveProjectRoot` and `readProject` agree on every fixture root and
  classify `root-not-found` and `configuration-not-found` as `unavailable`.
- The two inherited findings are decided with tests and instances; Plan 1's
  iteration 12 instances still pass.

## Handoff

Iteration 4's contexts interface names the analysis and project types added
here; root's driver in iteration 5 calls exactly `analyzeIncrement` and
`resolveProject`; `RetainedAnalysis.bytes` is the unit contexts accounts;
`retained: null` is the signal contexts uses to deliver a result unpublished;
`ProjectResolution.root` is the canonical root from which `ContextId` is
derived.
