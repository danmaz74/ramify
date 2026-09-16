# Iteration 7: Browser acceptance and reuse report

**Plan:** [Plan 6: Project explorer](../main-plan.md).
**Prerequisites:** Iterations 2 through 6 complete.
**Owners:** new `integration-tests [testing, ui, dispatch]` and documentation.

## Goal

Establish that the port is useful against real Ramify data in a real browser and
account honestly for how much cucumber-viz behavior and source were retained.

## Read first

- [Acceptance matrix](../acceptance.md): the complete gate.
- [Lift inventory](../lift-inventory.md): every source and destination.
- Ported component tests and iteration reuse notes.
- Browser/process testing guidance in the development testing guide.

## Deliverables

1. Declare the integration-test owner and expose every foreign binding it needs.
2. Run the actual HTTP process and installed browser assets against the reference
   project and Ramify itself.
3. Exercise navigation, pan/zoom, filters, module/edge/target selection, details,
   sidebar resizing and explicit revision refresh in a real browser.
4. Drive README, source-access and exposure edits through real publication and
   verify the expected visible changes.
5. Record projection time, encoded size, process memory and ten-refresh settled
   state as observations, retaining raw results and versions.
6. Produce the completion report and file-by-file reuse table, including every
   source test's ported/replaced/omitted disposition and every deliberate
   first-release limitation.

## Matrix rows executed here

EX10, EX11, EX29, EX30, EX31, EX32, EX33, plus the full regression matrix.

## Verification

Run all owner tests, direct-router tests, actual HTTP/process tests and the real
browser workflow. Re-run the complete matrix after the final source extraction
diff is reviewed. A passing component fixture does not replace real-report or
browser evidence.

## Exit criteria

Every acceptance row has evidence, both real projects are navigable, no visible
field invents unavailable data, the refresh workload remains bounded, and the
reuse report accounts for every candidate and test.

## Handoff

Successors receive the lifted components, compatibility model, report projection,
launch contract, browser suite, reuse/provenance table and the explicit list of
Ramify-native semantic and production-hardening improvements still deferred.

