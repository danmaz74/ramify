# Iteration 6: architect-owned acceptance scenario state

**Plan:** [Plan 21](../main-plan.md). **Prerequisites:** iteration 5.
**Owners:** harness scenario coordination and prompts; scenario owner for
records/rendering; audit child for raw runner-result adapter; evidence/web for projections.

## Goal

Remove audit-derived implementation decisions and causal diagnoses while
preserving useful scenario authoring, configured execution and integration work.

## Read first

[Scenario contract](../contracts.md#10-scenario-state-delegation-and-agent-judgment),
`run/service.ts::{declareScenarios,recordScenarioPasses,withdrawScenarios,compositionLines}`,
scenario rendering/states/composition, `scenario-report.ts`, scenario findings,
integration scheduling and current architecture documents.

## Deliverables

- Implement the three states `pending`, `bound` and `done` from the
  [scenario contract](../contracts.md#10-scenario-state-delegation-and-agent-judgment),
  for scenarios and registered tests alike. The engineer's proposal binds, with
  an optional per-ID `fakes` list recorded with provenance and shown to the
  architect; the architect's declaration moves to `done` and can revise back.
  Remove `declared`, `implemented`, `scenario-due`, `scenario-implemented`,
  `scenario-withdrawn` and the open-requirement derivation. A passing audit
  creates no done report; a failure, repair exit, yield or bound exhaustion
  cannot withdraw one.
- Remove scenario-to-runner-result matching from completion and finding policy.
  Retain complete raw producer diagnostics/counts/artifacts for agent inspection.
  Registered and untracked test execution must not supply semantic state.
- Apply iteration 0's explicit agent feature-generation/eligibility contract.
  Pending tags and renderer effects must not derive from audit outcomes or
  automatic withdrawal; keep idempotent file publication and scratch safety.
- Reject a completion proposal that omits a scenario its assignment names,
  naming the missing IDs under the existing per-turn bound, before the gate
  commits, audits or schedules review. Accept a complete proposal and any
  partial report as today. Update the architecture's statement that assigned
  scenarios are informative only.
- Schedule an integration work item when every sub-scenario is `done`, from
  the done reports alone. Local/fake-backed success cannot mark the broader
  scenario done.
- Remove generated composition/bridging-Given diagnoses and inferred repair
  ownership. Supply actual relevant failures and complete diagnostics to agents,
  who investigate and ask architects about scope/architecture decisions.
- Align prompts, projections and affected architecture documents. Change
  protected wording only through the authorized patches.

## Verification

PB3-D03, D06, D07, D11 and D12. Extend `scenario-states.test.ts`, `scenario-findings-run.test.ts`,
`scenario-check-integration.test.ts`, `integration-scenarios-integration.test.ts`,
`scenario-briefings.test.ts` and scenario-owner rendering/state suites where needed.

Cross audit pass/failure with present/absent architect declarations. Audit pass
without a report stays `bound`; a recorded done report survives an unrelated
failure, repair exit and source edit. Explicit architect revision changes it.
Bind with and without fakes, rebind with none, rebind a `done` obligation and
check it stays `done` with the new list, report done over a non-empty
fakes list, and schedule an integration item on the last sub-scenario's done
report and not before.
Check feature eligibility, integration coordination and full raw failures without
synthetic causal text. Exercise an incomplete proposal, its rejection message,
the complete proposal that follows and a partial report with the same
assignment. Run type-check/check:self.

## Exit criteria

New-policy obligation status is `pending`, `bound` or `done`, moved only by
accepted submissions; feature eligibility and integration scheduling follow.
No execution-to-implementation mapping, derived state or automatic withdrawal
remains; actual configured test failures remain visible.

## Handoff

`iteration6-results.md`, removed semantic consumers, feature/scheduling contract
witnesses and separate declaration/audit projection evidence.
