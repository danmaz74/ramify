# Iteration 4 results: report projection and detail bridge

**Status:** complete. **Plan:** [Plan 6](../main-plan.md). **Iteration:**
[iteration4.md](iteration4.md).

## Summary

Created `service-api [dispatch]` and implemented a pure, deterministic
projection from one `{ revision, report }` pair to the frozen explorer
compatibility shape. The projector imports only detached report, model,
project, source and revision vocabulary. It does not import a filesystem,
compiler, session, context-manager or daemon-host implementation.

The projection rejects non-completed, mismatched or structurally incomplete
reports. A successful result contains the module tree, purposes, owned files,
tag presentation classes, application owner edges, all five non-application
target kinds, export alias groups, exposures, coverage associations and the
frozen metrics. IDs use the frozen UTF-8 length-prefixed tuples and arrays are
deterministically byte-ordered. The complete JSON encoding is measured before
success; a result over 16 MiB is refused with the maximum and observed byte
counts and no partial view.

Added the current-revision `explorerDetails` bridge through retained analysis,
the worker host, contexts, root service, request validation, direct dispatch,
IPC dispatch and the lightweight connection. It delegates to the existing
retained TypeScript provider with the fixed 2,048-byte signature, 512-byte
documentation, 8-overload and 32-MiB result bounds. At most 50 distinct
`(original, exportName)` requests are accepted. Contexts pin the displayed
publication and hold the client lease; the serialized session operation checks
the expected analysis sequence when it begins. Superseded, cold,
compiler-released, resource-limit, analysis-failed and cancelled outcomes stay
distinct. The bridge never rehydrates a released compiler or substitutes a
newer revision.

The existing uncommitted Plan 2a API-view work was preserved. Its session and
test wrappers now forward the additional method; its projection, publication
and filesystem behavior were not changed.

## Acceptance evidence

| Row | Witness | Result |
| --- | --- | --- |
| EX12 | Real Collection Review projection has 15 owners and 59 owned files. Its module/file inventory equals the source report and every owned file appears once. | Passed. |
| EX13 | The purpose-built report groups two source occurrences on one `consumer -> provider` edge while retaining the application file target, selected original and forwarding origin. | Passed. |
| EX14 | That edge reports `accessCount: 2` and `symbolCount: 2`; the project reports seven source occurrences and two distinct selected original/name pairs. | Passed. |
| EX15 | The denied occurrence remains on the edge with `not-visible`; a separate coverage-bearing occurrence is limited, and the edge is denied by precedence. | Passed. |
| EX16 | Package, builtin, standard-library, outside-module and unresolved groups remain distinct and retain their source rows. | Passed. |
| EX17 | `Alias` and `Value` form one export group with value-and-type capability, model tags, both exposure records and an exact defining-file detail request. A missing-original export is explicit and an exposed unused export remains visible. | Passed. |
| EX18 | Edge, target and globally unmatched coverage records appear once with independently expected module/edge/target associations. | Passed. |
| EX19 | The import-closure guard excludes filesystem, compiler, context-manager and daemon-host imports. Real toolkit projection has 14 owners, 329 owned files, 44 edges and 4,375 source occurrences, all derived from the same report. | Passed. |
| EX20 | Null snapshot, null registry, non-completed execution, mismatched revision identity and structural omissions return unavailable, never an empty success. | Passed. |
| EX21 | A purpose-built encoding above `16 * 1024 * 1024` bytes returns only the explicit maximum/observed limit and no `view`. | Passed. |
| EX34 | The real retained provider returns described, UTF-8-bounded truncated and per-symbol unavailable details. Duplicate requests retain stable unique order; 51 distinct requests are refused. Superseded and released-compiler paths remain explicit through session/context/service dispatch. | Passed. |

The real report observations used by Iteration 7 are:

| Fixture | State | Owners | Owned files | Edges | Other targets | Access occurrences | Selected symbols | Encoded bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Collection Review | complete | 15 | 59 | 32 | 19 | 294 | 63 | 317,204 |
| Ramify toolkit | complete | 14 | 329 | 44 | 33 | 4,375 | 808 | 3,037,282 |

## Ownership and declarations

- `subs/service-api` owns the pure projector and neutral explorer-service
  inputs; its inferred ready view is not annotated with or imported from the
  `ui`-tagged DTO.
- `subs/integration-tests [testing, ui, dispatch]` contains the compile-time
  assignment from the inferred projection result to the one
  `ProjectExplorerModel` declaration owned by `project-view`.
- Analysis exposes only `SessionExplorerDetailsOutcome`; contexts exposes only
  the request/outcome and manager operation; daemon and root relay those names
  without exposing adapter or live-context implementations.
- Root `ServiceOperation`, `ServiceCapability` and `RamifyService`, daemon
  validation/capability negotiation, direct/wire dispatch and the lightweight
  client all include `explorerDetails`.

## Verification

| Command | Result |
| --- | --- |
| Focused Vitest command over projector, real reports, integration typing, real provider, contexts, validation, service dispatch, codec/connection, quick environment, resident assembly and session counters | Passed: 12 files, 67 tests. |
| `npm run type-check` | Passed: toolkit, portable, scripts and reference-harness TypeScript scopes. |
| `npm run build` | Passed. |
| Isolated `dist/src/ramify check --root .` followed by daemon stop | Passed: 14 owners, 320 source files, 9 resources, 4,375 accesses, zero findings and zero analysis limits. |
| `git diff --check` | Passed. |

The first isolated self-check found that the root test profile lacked the DTO's
required `ui` tag. The compile-time witness was moved to the frozen
`integration-tests [testing, ui, dispatch]` owner; the rebuilt rerun passed.
This was an intermediate declaration-placement defect, not acceptance evidence.

## Handoff

Iteration 5 receives `createProjectExplorerModel`, its ready/unavailable/limit
result, the explorer-service input vocabulary and the daemon-backed
`explorerDetails` operation. It should call `check` with report scope and
published freshness, map only a completed published report to the projector,
and pass the displayed revision unchanged to `explorerDetails`.

Iteration 7 receives the two real-report counts above and the purpose-built
count assertions. HTTP/tRPC routing, connected page state, CLI startup and
browser behavior remain unimplemented, as required by this iteration's scope.
