# Iteration 1 results: module-only contract and baseline

**Date:** 2026-09-16. **Result:** completed. **Plan:** [Plan 6A](../main-plan.md).

## Frozen contract

The [view-model amendment](../view-model-amendment.md) is frozen without a
compatibility flag or hidden transport field. The visible access set contains
exactly application accesses whose importer owner and target-file owner both
exist and differ. Edge and import-related module/summary metrics use only that
set. Counts retain the units specified by the amendment: access fields count
`SourceAccess` occurrences, while symbol fields count distinct non-null
original/name pairs in their stated edge, module or model scope.

`ProjectExplorerModel.otherTargets`, `ExplorerTargetGroup`,
`ExplorerSummary.otherTargets` and `ExplorerCoverage.targetIds` are removed.
`GraphSelection` retains only `{ kind: 'edge'; id; edge }`, and
`ModuleGraphProps` has no other-target input. This is a breaking in-repository
contract update, not an optionally hidden presentation category.

Every report `SourceLimit` remains one explorer coverage row. Source ownership
supplies `moduleIds` when available; only visible accesses can supply
`edgeIds`; and a row without either association remains global. The report
outcome, diagnostics, coverage completeness and revision remain unchanged.
No counting, compatibility or coverage objection remains open.

## Mixed-report baseline

The purpose-built fixture in
`subs/service-api/src/tests/project-view.test.ts` now includes the previously
missing same-owner application access. Its independent report assertions prove
that the input contains all omission subjects and positive controls before the
production projection runs.

| Input fact | Exact baseline |
| --- | ---: |
| Report accesses | 8 |
| Cross-owner application accesses | 2 |
| Same-owner application accesses | 1 |
| Package / builtin / standard-library accesses | 1 / 1 / 1 |
| Outside-module / unresolved accesses | 1 / 1 |
| Report allowed / denied results | 6 / 2 |
| Report coverage rows | 3 |
| Modules / owned files | 3 / 4 |

The unchanged Plan 6 projection encoded `JSON.stringify(view)` to **8,485
UTF-8 bytes**. Its legacy result contained one module edge with two access
occurrences and two selected symbols, plus five `otherTargets` groups with one
access each. Its summary was: 3 owners, 4 owned files, 1 edge, 5 other targets,
8 access occurrences, 2 selected symbols, 2 denied accesses, 2 limited accesses
and 3 coverage notes. Thus the same-owner access did not form an edge or target
group, but it and the five non-application accesses still inflated legacy
module and summary occurrence metrics. The same-owner access is denied, proving
that an omitted denial does not survive in narrowed explorer metrics.

The three baseline coverage associations are independently distinguishable:

- `coverage-edge` associates with `fixture/consumer` and the one visible module
  edge;
- `coverage-target` associates with `fixture/consumer` and the legacy unresolved
  target group; and
- `coverage-global` has no module, edge or target association.

For iteration 2, the independently expected visible IDs are
`application-limited` and `application-denied`. The narrowed summary therefore
has 1 edge, 2 access occurrences, 2 selected symbols, 1 denied access, 1
limited access and 3 coverage notes. `coverage-target` becomes module-only,
`coverage-global` stays global and all three coverage rows remain. The encoded
model must be no larger than 8,485 bytes.

## Consumer inventory and owned destination

| Iteration | Current branch or consumer | Owned removal/update |
| --- | --- | --- |
| 2 | `subs/presentation/subs/project-view/src/interfaces/project-view.ts` | Remove the target DTO and the three removed fields. |
| 2 | `subs/service-api/src/project-view.ts` | Replace all-access metrics with the frozen visible set; delete target grouping and target coverage indexing. |
| 2 | `subs/service-api/src/tests/project-view.test.ts` | Reuse this exact mixed report, reject removed JSON and compare against the recorded byte ceiling. |
| 2 | `subs/presentation/module.ramify` and `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` | Remove the obsolete public type exposure and its declaration expectation. |
| 3 | `subs/presentation/subs/project-view/src/moduleGraphShared.ts` | Remove the target selection union member, graph prop, target-edge builder and `otherTargetEdgeId`. |
| 3 | `subs/presentation/subs/project-view/src/ModuleGraphRadial.tsx` | Remove target node construction, target node styling/badge and target participation in layout and edges. |
| 3 | `subs/presentation/subs/project-view/src/ProjectExplorerView.tsx` | Remove target filtering/validity, graph input, target detail/coverage lookup and target empty-state wording. |
| 3 | `subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx` and `ProjectExplorerView.test.tsx` | Replace target fixtures and interactions with module/out-of-view and module-edge controls. |
| 4 | `subs/explorer/src/ProjectExplorerPage.tsx` and its test | Remove the target refresh-reconciliation branch and legacy empty DTO fields. |
| 4 | `subs/integration-tests/src/browser-acceptance.ts` | Remove non-application target selection/detail steps and add module-endpoint absence assertions. |
| 4 | `subs/integration-tests/src/project-view-projection.test.ts` and `explorer-router.test.ts` | Assert narrowed real projection/router JSON while retaining pre-projection external-access witnesses. |

The unrelated `targetIds` weak-map variable in the browser runner's process
instrumentation identifies JavaScript event targets; it is not the removed
explorer coverage field and must remain unless that instrumentation changes for
another reason.

## Verification

`npm test -- subs/service-api/src/tests/project-view.test.ts` passed with 1
file and 3 tests. An isolated measurement probe over the ready legacy view
reported 8,485 bytes; the probe was then removed and the focused test was rerun
successfully. No runtime projection, DTO or presentation behavior changed in
this iteration. MX02 has executable baseline evidence; MX01 is frozen contract
evidence and becomes executable as iterations 2 and 3 narrow the types.
