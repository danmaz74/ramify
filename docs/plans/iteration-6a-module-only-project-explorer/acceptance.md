# Plan 6A acceptance matrix

**Date:** 2026-09-16. **Status:** frozen gate; baseline established by iteration 1. Companion to the
[plan](main-plan.md) and [view-model amendment](view-model-amendment.md).

**Fixtures.** `mixed-report` is a hand-built report with two cross-owner
application accesses, one same-owner application access and package, builtin,
standard-library, outside-module and unresolved accesses. At least one omitted
access is denied and at least one carries a coverage ID. `reference` is
Collection Review, `toolkit` is Ramify and `mutation` is an isolated real
project whose npm-only import can change without changing its module graph.

## Contract and projection

| ID | Iter | Fixture | Required witness |
| --- | ---: | --- | --- |
| MX01 | 1 | public types | `ProjectExplorerModel`, summary and coverage reject `otherTargets`, `ExplorerTargetGroup`, `otherTargets` count and `targetIds`; `GraphSelection` admits only an `ExplorerEdge`. |
| MX02 | 1 | mixed-report | The pre-change baseline records encoded bytes and proves every target category and the positive cross-module controls are present before implementation. |
| MX03 | 2 | mixed-report | Projection JSON contains modules and cross-owner application edges but no omitted target label, group, row, ID or discriminator. |
| MX04 | 2 | mixed-report | Edge, module and summary access/symbol/denied/limited metrics equal independent expectations over only the visible access set. Same-owner and non-application accesses contribute zero. |
| MX05 | 2 | mixed-report | Every report coverage limit remains once; visible edge associations remain, omitted-target associations become module-only or global, and report completeness is unchanged. |
| MX06 | 2 | mixed-report | AnalysisReport input is not mutated and still contains all omitted accesses, decisions and coverage after projection. |
| MX07 | 2 | mixed-report | Repeated projection is deterministic, the encoded model is no larger than its recorded pre-change baseline, and the 16 MiB refusal still reports maximum and observed bytes. |

## Reusable project view

| ID | Iter | Fixture | Required witness |
| --- | ---: | --- | --- |
| MX08 | 3 | component fixture | React Flow receives only in-scope and out-of-view module nodes; every dependency edge has module endpoints and `ExplorerEdge` data. |
| MX09 | 3 | component fixture | Module and module-edge selection, deselection, pan/zoom, minimap, filters, breadcrumbs and drill-down retain their Plan 6 behavior without a target selection branch. |
| MX10 | 3 | component fixture | The sidebar renders module, module-edge and empty details only; coverage remains visible without target-detail lookup. |
| MX11 | 3 | component fixture | A root with modules but no cross-module imports renders the module hierarchy and zero edges rather than an empty or error state. |

## Connected and real-browser workflow

| ID | Iter | Fixture | Required witness |
| --- | ---: | --- | --- |
| MX12 | 4 | mixed-report | The real tRPC router returns the narrowed JSON and the connected page reconciles only module/edge IDs across a newer revision. |
| MX13 | 4 | reference, toolkit | Actual HTTP projection contains only declared module IDs as graph node/edge endpoints while the corresponding reports prove external accesses exist. |
| MX14 | 4 | reference | Chromium completes navigation, module/edge selection, filtering, pan/zoom, sidebar resize and explicit refresh with no external-target node or detail affordance. |
| MX15 | 4 | mutation | An npm-only import edit publishes a newer revision and changes the underlying report, but does not change explorer topology or visible import metrics. |
| MX16 | 4 | reference | Ten refreshes retain no additional model, listener or timer relative to the established settled baseline; projection bytes, timing and process memory are recorded. |
| MX17 | 4 | regression | `npm run type-check`, focused owner tests, production build, real router/HTTP tests and the browser runner pass; source checking still reports external targets normally. |

Passing MX03 by returning an empty access model fails because MX02 supplies
cross-module positive controls. Passing component tests does not establish
MX12–MX16, and browser absence alone does not establish payload omission.
