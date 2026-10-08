# Iteration 10: nested verification, recovery and projections

**Plan:** [Plan 21](../main-plan.md). **Prerequisites:** iteration 9 and P5.
**Owners:** audit child and harness gate/recovery/protocol; web for projections.

## Goal

Preserve each nested project's result through final gates, recovery and
display, and project audit health and hook dispositions as separate facts.

## Read first

[Audit contract](../contracts.md#7-commit-audits-reuse-nested-projects-and-recovery),
[final verification contract](../contracts.md#12-final-verification-and-projections),
iteration 9's request/result contract, audit workspace recovery, gate views
and iteration 4's disposition/protocol mapping.

## Deliverables

- Final plan gates request full nested audits. Preserve every project result,
  discovery outcome and skip reason. An enclosing pass cannot hide a nested
  failure or an unavailable required result. Full final verification has no
  per-scenario/file-matching acceptance condition.
- Recover complete root/nested results by durable request/report identities.
  Preserve lease/workspace ownership and process settlement; no rerun to
  reconstruct a missing UI field.
- Project combined verdict, failures, counts, durations, executed/reused/unrun
  status and per-project links through harness contracts into prompts and web.
  Include the hook dispositions from iteration 4. No web-side recomputation.
- Update touched documentation.

## Verification

PB3-E05–E08 using F4 and F5. Extend:

- `subs/harness/src/tests/audit-workspace-recovery.test.ts`
- `subs/harness/src/tests/merge-readiness.test.ts`
- `subs/web/src/tests/execution-map.test.tsx`

Add `subs/harness/src/tests/project-boundary-audit.integration.test.ts`
for the real F4 sequence if the existing conformance file is too broad.
Cover a failed nested child, excluded external definition and interrupted
completion retrieval. Record actual provider artifacts and no second
execution on recovery. Run type-check/check:self and browser checks for the
changed views at desktop and narrow widths.

## Exit criteria

Full/nested applicability is required at final acceptance; all project
identities and failures survive persistence and display. A partial or
run-local pass cannot satisfy a full or composed-failing gate.

## Handoff

`iteration10-results.md`, F4 report refs and source commits, recovery trace,
protocol changes and desktop/narrow browser evidence.
