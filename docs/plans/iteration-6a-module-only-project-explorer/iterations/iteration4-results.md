# Iteration 4 results: connected workflow and browser gate

**Date:** 2026-09-16. **Result:** completed. **Plan:** [Plan 6A](../main-plan.md).

## Implemented behavior

The connected page now reconciles only module-edge selections. A refresh
rebinds a selected edge to the newer DTO when the same edge ID remains and
clears it when the ID disappears. There is no target selection or target
lookup branch.

The direct router fixture now publishes both package and Node builtin accesses
in its real `AnalysisReport`, then proves that the serialized explorer response
has only declared-module edge endpoints and no removed target fields or target
labels. The root declaration relay was also narrowed: `module.ramify` no longer
re-exposes the deleted `ExplorerTargetGroup` contract.

The browser runner now treats module-only structure as an executable invariant.
For Collection Review, Ramify and the mutation fixture it verifies every model
edge endpoint against the model's module IDs, every rendered React Flow node
against those IDs, every rendered edge against the model's module edges, and
the absence of an `Other target` detail affordance. Collection Review still
executes module and module-edge selection, export details, filtering, pan/zoom,
sidebar resize, drill-down and explicit refresh through the actual HTTP process
and `/usr/bin/chromium`.

The isolated mutation fixture now adds only an npm `react` import. The report
input changes, access count rises from 1 to 2, external count rises from 0 to 1
and revision advances from sequence 1 to 2. Independently compared explorer
topology remains three modules and one module edge, while visible summary
metrics remain one edge, one access occurrence, one selected symbol, one denied
access and zero limited accesses. The browser refresh displays revision 2 with
the same two visible module nodes and one visible module edge.

## Browser and resource evidence

The passing raw record is
[iteration4-browser-acceptance.json](../evidence/iteration4-browser-acceptance.json),
schema `ramify.module-only-project-explorer-acceptance/1`, SHA-256
`1ae77c7bfb51f1b7e6d2ae5345f3db7561f32030893a61fca3f60efa5012c3e2`.
It records build identity
`9b193ddade27e0371f32407395dd99e87938899a9e6d9096587ba274d59f192b`,
Node 22.23.2 and Chromium 151.0.7922.173.

| Workload | Report / explorer result | Projection observation | Process memory observation |
| --- | --- | --- | --- |
| Collection Review | 15 report and projected modules, 294 report accesses including 128 non-application accesses, 32 projected module edges; displayed and report revision are identical. | 7.999 ms and 219,929 bytes, down 102,865 bytes (31.87%) from Plan 6's 322,794-byte observation. | Web RSS/heap 130,916,352/35,639,264 bytes; daemon RSS/heap 119,803,904/18,242,880 bytes. |
| Ramify | 15 report and projected modules, 4,613 report accesses including 1,438 non-application accesses, 54 projected module edges; displayed and report revision are identical. | 240.150 ms and 2,193,098 bytes, down 1,063,416 bytes (32.66%) from Plan 6's 3,256,514-byte observation. | Web RSS/heap 170,237,952/48,563,032 bytes; daemon RSS/heap 140,242,944/18,841,848 bytes. |

These timing and memory values are single observations, not performance
guarantees. The existing 16 MiB refusal remains the enforced response limit.
The mixed-report projection is 5,826 bytes versus the frozen 8,485-byte legacy
ceiling.

Ten Collection Review refreshes returned to the same settled baseline on every
cycle: one model, five rendered module nodes, five rendered module edges, 23
window/document listeners, one polling interval and zero pending timeouts.
Revision advanced from sequence 1 to 11. Final daemon state retained its bounded
eight-revision history with zero request/subscription leases, zero pending
requests or paths and no running analysis.

## MX01-MX17 evidence

| Row | Current evidence pointer |
| --- | --- |
| MX01 | `subs/presentation/subs/project-view/src/interfaces/project-view.ts` and `moduleGraphShared.ts`; the focused service and component type-checks pass with no removed DTO or target selection branch. |
| MX02 | [Iteration 1 baseline](iteration1-results.md#mixed-report-baseline) plus `subs/service-api/src/tests/project-view.test.ts`'s eight-access pre-projection assertions. |
| MX03 | `subs/service-api/src/tests/project-view.test.ts`, test `projects only cross-owner application accesses while preserving exports and truthful coverage`, recursively rejects every removed key, label and access ID. |
| MX04 | The same service test asserts the exact visible-set summary, module and edge metrics. |
| MX05 | The same service test asserts all three coverage rows and their edge, module-only and global associations. |
| MX06 | The same service test's independent report assertions and cloned repeat projection preserve all eight input accesses and report facts. |
| MX07 | The same service test proves deterministic projection, 5,826 <= 8,485 encoded bytes and the 16 MiB maximum/observed refusal. |
| MX08 | `subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx` inspects module-only React Flow nodes and module-endpoint edges. |
| MX09 | `ModuleGraph.test.tsx` and `ProjectExplorerView.test.tsx` pass the retained selection, navigation, filtering, pan/zoom, minimap and resize behaviors. |
| MX10 | `ProjectExplorerView.test.tsx` passes module, module-edge, empty and coverage detail assertions with no target branch. |
| MX11 | `ProjectExplorerView.test.tsx`, test `renders module hierarchy when there are no cross-module dependencies`, proves the zero-edge positive control. |
| MX12 | `subs/integration-tests/src/explorer-router.test.ts` asserts narrowed real-router JSON; `subs/explorer/src/tests/ProjectExplorerPage.test.tsx` proves same-ID edge rebinding and missing-ID clearing. |
| MX13 | Passing raw evidence `/workloads/reference` and `/workloads/toolkit`: report non-application witnesses are 128 and 1,438 respectively, while model and DOM endpoints all map to declared modules. |
| MX14 | Passing raw evidence `/workloads/reference/interactions` and `/workloads/reference/dom` records the complete Chromium interaction workflow and zero target-detail affordances. |
| MX15 | Passing raw evidence `/workloads/mutations/npmOnly` records distinct report input IDs, sequence 1 -> 2, accesses 1 -> 2, the added external access and equal topology/visible metrics. |
| MX16 | Passing raw evidence `/workloads/reference/refreshBaseline`, `/refreshes` and `/memory` records ten stable refreshes and final bounded process state. |
| MX17 | The verification table below records the passing focused owners, router, HTTP/Chromium runner, type-check and production build; the raw report witnesses retain external accesses. |

## Verification

| Command | Result |
| --- | --- |
| `npm test -- subs/explorer/src/tests/ProjectExplorerPage.test.tsx` | Passed: 1 file, 4 tests. |
| `npm test -- subs/integration-tests/src/project-view-projection.test.ts` | Passed: 1 file, 1 test. |
| `npm test -- subs/integration-tests/src/explorer-router.test.ts` | Passed: 1 file, 1 real-service/router test. |
| `npm test -- subs/service-api/src/tests/project-view.test.ts` | Passed: 1 file, 3 tests. |
| `npm test -- subs/presentation/subs/project-view/src/tests/ModuleGraph.test.tsx subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx` | Passed: 2 files, 30 tests. |
| `npm run type-check` | Passed toolkit, portable, scripts and reference-harness scopes. |
| `npm run build` | Passed production and browser builds; Vite repeated its existing nonblocking 500 kB chunk advisory (643.55 kB emitted JavaScript). |
| `npm run measure:project-explorer` | Passed reference, toolkit, npm-only mutation and ten-refresh workloads through real daemon/web processes and Chromium. |
| `git diff --check` | Passed. |

One intermediate browser run failed before projection because the root
`module.ramify` still re-exposed `ExplorerTargetGroup`. The diagnostic artifact
is [iteration4-browser-acceptance-failed-analysis.json](../evidence/iteration4-browser-acceptance-failed-analysis.json),
SHA-256
`a394d1b0d8e06c0fabe2b8d829950038ed9d997ce18bb4fd7e2010e88aecf44d`.
Removing that stale declaration made the Ramify report structurally complete;
the final build and browser runner then passed. A final unit rerun also exposed
an assertion race between revision rendering and React's reconciliation effect;
the test now waits for the observable selection clear and passes. No unrelated
worktree failure remains. External dependency inspection remains deliberately
deferred; no hidden explorer field or dormant selection branch supports it.
