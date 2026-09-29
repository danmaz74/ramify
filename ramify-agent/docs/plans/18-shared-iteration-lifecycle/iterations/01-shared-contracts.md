# Iteration 1: shared assignments and provider contracts

[Plan 18](../main-plan.md) · [Provider contract](../provider-contract.md) ·
[Acceptance](../acceptance.md)

## Prerequisites and owners

Establish the identified Plan 16/17 integration baseline and preserve unrelated
changes. Harness owns common iteration contracts; the audit child and separate
ramify-audit owner inspect provider capabilities. These two investigations may
proceed independently. No old live acceptance verdict is a prerequisite.

## Goal and read first

Read work/iterations.ts, work/assignment.ts, work/committed.ts,
run/service.ts assignIteration/takeIteration, capability assignment and recovery
records, and the provider's public exports before its implementation. Read the
provider inventory and Plan 17's policy decisions.

## Deliverables

- Generalize the existing assignment/result contracts to one coordination-owner
  reference and a separate target scope. Keep task-local sequence/limits and
  the original consumer assignment identity; do not fabricate provider work items.
- Define the common architect assignment body, including kind, stage, scope,
  current design basis, selected requirement package, completion evidence,
  scenarios, authorizations and bounds. Harness-derived fields stay derived.
- Characterize ordinary completion, partial, repair, gate/commit and review
  behavior with independent expected assertions. Mark scope-probe/automatic
  repair-owner behavior as deliberately removed in iteration 3, not an invariant.
- Make writer-start attribution explicit so inherited changes can be preserved
  under both coordinators. Define common record readers and the combined new-run
  version boundary; historical records remain truthful.
- Inspect every required provider mode: committed audits, dirty focused checks,
  readiness, standalone sessions, native/registered test reporting and durable
  scenario detail. Identify exact public operations, missing contracts, required
  artifact retention and lifecycle hooks. Specify the minimal audit-child access
  contract; do not create a second provider report schema.
- Record contract decisions in the provider inventory, distinguishing proven
  existing operations from proposed extensions. Provider implementation,
  executable conformance, release and adoption finish in iteration 2.

## Verification and exit criteria

SI01, SI04–SI05, SI09–SI10 characterization and contract tests. Retain independent
expected outcomes; matching two incorrect paths cannot establish parity.
No provider capability is declared available solely because a type is exported.

Exit: both architect actions can express the full common assignment, ordinary
behavior remains characterized, and every provider gap has an owner and a
concrete conformance case. The record boundary can identify both coordinators
without spending the provider entry's budget.

## Handoff

Record revision, contract decisions, affected readers, test results and open
provider work in iteration1-results.md. Do not claim the new executor or provider
integration is already delivered.
