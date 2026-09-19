# Iteration 1: Specify and compute context size with documentation

**Plan:** [Plan 2C](../main-plan.md).
**Prerequisites:** Main-plan decisions 1–3 and the effective-ownership,
documentation and path-attribution contracts.
**Owners:** `analysis`; the architect-view and modularity-report specifications.

## Goal

One internal computation yields the context-size buckets, including
documentation, from an inventory, and the modularity report uses it.

## Read first

- Main plan: what exists, decisions 1–3, contract.
- [Modularity report](../../../architecture/modularity-report.spec.md), source
  filter and section 9.
- `subs/analysis/src/modularity-owner.ts` (`contextSize`),
  `subs/analysis/src/modularity-context.ts` (`viewFacts`, `OwnershipResolver`),
  `subs/analysis/src/modularity-candidate.ts`,
  `subs/analysis/src/session-facts.ts`, `session-engine.ts` (retained captured
  inputs and sequence guards),
  `subs/analysis/subs/project/src/interfaces/project.ts` and `inventory.ts`.

## Deliverables

1. Specification text: section 9 gains the documentation bucket and states
   that it is independent of the source filter; the architect-view
   specification replaces the reserved `metrics` text with the contract and
   states the uninventoried-files limit; the ordered path-attribution rule and the
   `ramify.measure/1` document are specified for iteration 3's operation.
2. Shared arithmetic over inventory files with resolved effective ownership,
   production/testing classification and the selected owner set. The report
   adapter preserves its validated candidate resolver/tree; the session adapter
   uses declared ownership. Documentation uses captured inputs, never live
   filesystem reads. The session adapter receives the existing retained
   captured-input list from `session-engine.ts`, paired with facts under its
   serialized sequence guard; the report adapter uses its captured inputs.
   Do not add duplicate lengths to `InventoryModule` or `SessionFacts`, or
   expose a new project operation. Missing required capture evidence refuses
   measurement instead of silently counting zero.
3. `contextSize` delegates its four file and byte fields to that function and
   gains the documentation fields in `ContextSize`; the probe's Markdown lists
   them. For candidate reports only, the new documentation field is unavailable
   with reason candidate-documentation; existing file/byte metrics and coverage
   remain unchanged. Document the complete-bucket classification derivation and
   documentation record area; do not add redundant per-file testing flags.

## Matrix rows executed here

MM01–MM03 and MM14.

## Verification

Focused Vitest runs of `modularity.test.ts`, `modularity-candidate.test.ts` and
a new unit test of the shared function using `modularity-fixture.ts` extended
with a README and description input. The existing expected values at
`modularity.test.ts` context-size case must not change. Run the probe's own
Vitest configuration for the Markdown change.
Extend the candidate fixtures with source/resource reassignment and assert
exact, subtree and root totals, plus unavailable candidate documentation. Add
resource-only/testing/empty owners for the documented classification derivation.

## Exit criteria

Existing context-size values are unchanged; documentation is counted once per
owner in declared reports; candidate source/resource totals retain effective
ownership and candidate documentation is explicitly unavailable. Both
specifications describe the fields and the unobserved-path limit.

## Handoff

The function's signature, resolved-file adapters, bucket types and retained
documentation provenance, for the session operation and projection in iteration 2.
