# Iteration 4: Report projection and detail bridge

**Plan:** [Plan 6: Project explorer](../main-plan.md).
**Prerequisites:** Iteration 1's frozen DTO.
**Owners:** new root child `service-api [dispatch]` for the pure projection,
plus existing analysis/session, contexts and daemon interfaces for the detail
bridge.

## Goal

Compute the compatibility model from one `{revision, report}` pair and expose
the existing bounded symbol-detail provider without adding a second analysis.

## Read first

- [View model](../view-model.md): field mapping, stable IDs, units and bounds.
- `subs/analysis/src/interfaces/analysis.ts`: report and snapshot contracts.
- Project, model and TypeScript source interface files referenced by the report.

## Deliverables

1. Implement a pure report-to-model projection.
2. Build modules, files, hierarchy, presentation classes and purpose states.
3. Group application accesses into file-target owner edges while retaining
   selected original/forwarding identity.
4. Group package, builtin, standard-library, outside-module and unresolved
   targets separately.
5. Join catalog exports, originals and exposures into alias groups and exact
   `SymbolDetailRequest`s.
6. Associate coverage with modules, edges and target groups and compute the
   documented metrics.
7. Apply stable IDs, deterministic ordering and the encoded 16 MiB refusal.
8. Add a revision-bound `explorerDetails` service operation accepting at most
   50 unique requests, delegating to the retained provider and preserving
   described, truncated, unavailable and superseded outcomes.

## Matrix rows executed here

EX12, EX13, EX14, EX15, EX16, EX17, EX18, EX19, EX20, EX21, EX34.

## Verification

Use real reference/toolkit reports and purpose-built temporary reports with
independently expected counts. Add an import-closure assertion proving the
projection has no filesystem, compiler, context-manager or daemon-host import.
Round-trip the model through production JSON. Test the bridge against the real
provider, including truncation and an unavailable compiler.

## Exit criteria

Every projection/detail-provider case passes, model facts trace to the input pair,
details trace to the existing provider and invalid input cannot become an empty
successful view.

## Handoff

Iteration 5 receives the projection and encoded result contract. Iteration 7
receives the real-report fixtures and count assertions.
