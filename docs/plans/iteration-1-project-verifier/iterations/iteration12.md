# Iteration 12: Resources, coverage and the analysis session

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** iterations 10 and 11.
**Owner:** `subs/analysis/` (session, snapshot and report), with the
external-scope and coverage facts in `subs/analysis/subs/typescript/`.

## Goal

Assemble everything into the disposable `AnalysisSession` and the immutable
`AnalysisReport`: staged execution with blocked dependents, explicit
capabilities, coverage notes distinct from denials, warnings and resolution-blocking
compiler problems as analysis limits, cancellation, finite acquisition and work bounds, and
disposal that leaves no compiler state behind a retained report.

## Read first

- Main plan: Required data flow, the `AnalysisSnapshot`, `AnalysisReport` and
  `AnalysisSession` rows of the contract table, Coherent inputs and later
  reuse, Reports and exit behavior (report schema), matrix rows I1-24,
  I1-27 and I1-29.
- [Daemon architecture](../../../architecture/daemon.md): Revisions and
  atomic publication, the six result dimensions.
- Iteration 1's `scope.md` limits and report schema.
- Its `owners.md` and package-entry activation stages for the analysis session.

## Deliverables

1. `AnalysisSession`: analyze one explicit root, scope, configuration and
   resolved registry from a captured input view; retry the whole affected
   acquisition within a finite policy when inputs change underneath, else
   return an explicit incomplete result; publish one completed result per
   invocation; support cancellation; dispose compiler and input state.
2. Stage tracking: parse, inventory, catalog, link, check. An invalid
   prerequisite yields an explicit invalid result with dependents blocked; a
   blocked source stage is never an allowed source result.
3. `AnalysisReport`: schema version, requested root/configuration/scope/
   registry, batch input identity that cannot be confused with another run,
   requested and executed capabilities, per-stage execution, findings,
   warnings, coverage notes with outside-scope targets and resolution-blocking
   compiler problems, and summary counts. Deterministic ordering; plain data only.
4. External and unresolved scope: proven package/builtin targets reported
   separately; unresolved targets, unsupported macros and CommonJS
   interpretation as visible limits that never become allowed or external;
   a project file outside modules never becomes an external import.
5. Resources at the session level: a missing resource is a coverage note for
   the import and an invalid declaration for an exposure. A source import
   selecting an absent name from a known resource export description produces
   a located missing-export error and a failed check, not an analysis-limit
   note or an omitted access. Assert that outcome through the public session.
6. Retention proof: a retained report holds no reference to the session's
   compiler objects.
7. Activate the reviewed analysis-session exposures and package entry with
   their implementation, and validate the current toolkit declarations.

## Matrix rows executed here

- I1-23: `missing-resource`, `missing-resource-export`.
- I1-24: `external`, `unresolved`, `unsupported-macro`,
  `unsupported-commonjs`, `partial-clean`, `partial-denied`,
  `resolution-blocked`.
- I1-27: `cancel`, `read-failure`, `dispose`, `report-retention`.
- I1-29: `outside-module-target`, `changed-input`.

## Verification

```sh
npm run type-check && npm test
npm run reference:verify -- --plan 1
```

## Exit criteria

- Real project analysis succeeds through the public engine API and returns
  the reviewed report shape; every listed instance ran.
- A partial-coverage clean run and the same run plus one definite denial have
  the documented distinct outcomes.

## Handoff

Iteration 13 formats exactly this report; iteration 14's gate consumes it
through the harness; iteration 15 measures the session's cost.
