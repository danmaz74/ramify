# Iteration 7: architect-owned delegation handback

**Plan:** [Plan 21](../main-plan.md). **Prerequisites:** iteration 6.
**Owners:** harness capability records, submissions, coordination and prompts;
audit child only for retaining execution diagnostics; web for task projection.

## Goal

Trust the responsible capability architect's implementation judgment while
preserving original behavioral needs, chosen tracking and real consumer integration.

## Read first

[Delegation contract](../contracts.md#10-scenario-state-delegation-and-agent-judgment),
`capability/{records,submission}.ts`, capability actions/handback in `run/service.ts`,
capability architect procedure, consumer-return workflow and capability task views.

## Deliverables

- Preserve original need/example identities and behavioral requirements across
  revised plans. Record the architect's choice of outcome-only tracking or
  separate scenario/test obligations through iteration 5's shared declaration path.
- Replace cited-file execution checks, passing provider/consumer file inventory
  conditions and the per-example coverage record, with its `unresolved`,
  `exercised` and `corrected` states and evidence/test arrays, with authorized
  architect reports. Original examples stay immutable request context; a
  remark about one is free text in the report. Ordinary references may
  remain readable context without validation.
- Handback checks reporting completeness for the registered obligations using
  the shared missing-report mechanism wired in iteration 8. Don't turn every
  preserved example or derived case into another tracked reporting object.
- Retain capability plan/dependency, consultation, scope, fake naming and other
  existing non-test boundaries. Architect/reviewer judgment assesses appropriate
  tests and real integration; no new mandatory review role or fixed fake suite.
- Returning a delegated capability does not complete the requesting engineer's
  work or parent acceptance requirements. Their responsible architect must assess
  and report the broader outcome separately.
- Update projections/prompts: show examples as request context and the
  architect's report as the handback, with no per-example state. Old-policy
  coverage records are refused with their run; no reader remains.

## Verification

PB3-D08–D10. Extend `capability-submission.test.ts`, `capability-records.test.ts`,
`capability-acceptance.integration.test.ts`, `capability-dependencies.test.ts`
and `capability-tasks-projection.test.ts` as needed. Use original examples,
additional cases and outcome-only versus explicitly separate required-test records.

Show authorized done with no cited executed files and no per-example coverage
state, a handback rejected for an unreported registered ID, immutable original
requirements, and broader consumer
work staying open after local handback. Raw failed audit evidence remains visible
without rewriting a declaration or silently passing final verification.
Run type-check/check:self.

## Exit criteria

Handback uses architect judgment and explicit registration, not test-file
coverage matching. Original requirements, real integration responsibility and
parent/consumer completion boundaries remain intact.

## Handoff

`iteration7-results.md`, registration/handback witnesses, removed coverage gates
and consumer-return trace. Shared rejection/recovery qualification follows.
