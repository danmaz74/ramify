# Iteration 1: Projector, session operation and worker round trip

**Plan:** [Plan 7: Affected modules](../main-plan.md).
**Prerequisites:** none beyond the checkout at `5a1934aa` or later on
`feat/plan7-affected-modules`. **Owners:** `subs/analysis/` only. No contexts,
daemon, root or CLI change in this iteration.

## Goal

Answer `RetainedSession.affected` inside the analysis worker by building and
discarding one temporary reverse module graph from the current revision's
retained facts, with path seeds resolved through the inventory.

## Read first

- [Contracts](../contracts.md): Analysis API, query validation, readiness,
  path resolution, projection and worker sections, in full.
- [Main plan](../main-plan.md): decisions 1 to 4 and 8, verified state items
  1 to 3, dependency and coverage semantics.
- [Owners](../owners.md): the analysis row, manifest addition A19 and the
  package entry.
- [Acceptance](../acceptance.md) rows A7-01 to A7-05 and their instances in
  [cases.json](../cases.json).
- Source: `subs/analysis/src/interfaces/session.ts`, `session-facts.ts`,
  `session-engine.ts` (the `measurements` method is the pattern),
  `session-host.ts`, `session-messages.ts`, `session-worker.ts`,
  `interfaces/measurements.ts`, `src/index.ts`, `module.ramify`.
- Shapes: `subs/analysis/subs/typescript/src/interfaces/source.ts`
  (`SourceAccess`, `SourceTarget`, `AccessSelection`, `SourceLimit`,
  `FileDescription.dependencies.shims`),
  `subs/analysis/subs/project/src/interfaces/project.ts` (`ProjectInventory`,
  `InventoryModule`, `InventoryFile`, `InventoryArea`),
  `subs/analysis/subs/model/src/interfaces/model.ts` (`OriginalId`,
  `SourceOrigin`).
- Tests to imitate: `src/tests/module-measurements-session.test.ts`,
  `session-worker.test.ts`, `session-test-fixture.ts`,
  `session-worker-fixture.ts`, `dependency-diagram.test.ts` for fixture style.
- [Testing guide](../../../development/testing.md) and the module description
  principles for test placement.

## Deliverables

1. `src/interfaces/affected.ts` with exactly the types in contracts.md.
   `interfaces/session.ts` gains `affected(query, control?)` on
   `RetainedSession` with the documented comment.
2. Private `src/affected-query.ts`: `projectAffected(facts, seeds, limits,
   control?)` over a plain `AffectedFacts` input; path normalization and
   resolution; edge derivation; single traversal; sorted deduplicated output;
   coverage classification by the code set; widening; resource limits and
   cooperative cancellation. Export a small `assembleAffectedFacts(facts:
   SessionFacts, inputId, scope, analysisCheck)` helper for the engine that
   references the retained accesses without copying them.
3. `session-engine.ts`: `affected(query, control)` under `#serialize` with the
   readiness checks of contracts.md. Identify the retained evidence that the
   access stage completed for `missing-facts` and record what you used in the
   results file. Use the revision's existing verdict for `analysisCheck`.
4. `session-messages.ts`, `session-worker.ts` and `session-host.ts`: the
   `affected` operation, exactly as `measurements`.
5. `src/index.ts`: `export type * from './interfaces/affected.js'`.
   `subs/analysis/module.ramify`: the A19 exposure line. The analysis README
   purpose sentence from owners.md.
6. Tests in `src/tests/`: `affected-fixtures.ts` (plain facts builders for
   chain, diamond-cycle, isolated, root, shim and coverage fixtures),
   `affected-query.test.ts` (A7-01, A7-02, A7-04 unit instances),
   `affected-session.test.ts` (A7-03, A7-04 session instances and A7-05
   session instances over disposable projects written by the test),
   `affected-worker.test.ts` (A7-05 worker instances). Each test names its
   case ID and states its expected answer independently of the projector.

## Matrix rows executed here

A7-01 to A7-05, all instances in cases.json.

## Verification

From the checkout root:

```sh
npm run type-check
npx vitest run subs/analysis/src/tests/affected-query.test.ts subs/analysis/src/tests/affected-session.test.ts subs/analysis/src/tests/affected-worker.test.ts
npx vitest run subs/analysis/src/tests/session-worker.test.ts subs/analysis/src/tests/module-measurements-session.test.ts
npm run build && npm run check:self
```

Do not run the whole Vitest suite. `check:self` needs the built `dist/`;
isolate its endpoint with `RAMIFY_ENDPOINT_DIR` set to a temporary directory
and stop that daemon afterwards, as the testing guide says. Expected
intermediate failure: `check:self` reports `exposed-without-companion` until
every foreign type named by the new interface is visible on the same
channel; fix the manifest, never the principle.

## Exit criteria

- All listed tests pass; `npm run type-check` and `npm run check:self` pass.
- `A7-05:no-disk-or-report` observes zero source reads, compiler calls and
  `report()` calls during a ready query.
- No change outside `subs/analysis/` except none; no new package subpath.
- Results file `iteration1-results.md` beside this file: what changed, the
  `missing-facts` evidence used, the `InventoryArea.root` spelling verified,
  commands run with their outcomes, and any deviation from contracts.md.

## Handoff

Iteration 2 consumes `AffectedQuery`, `AffectedSelection`,
`AffectedUnavailableReason`, `SessionAffectedOutcome` and
`RetainedSession.affected` exactly as declared here.
