# Iteration 5: explicit architect declarations

**Plan:** [Plan 21](../main-plan.md). **Prerequisites:** iteration 4 and iteration
0's reviewed registration/declaration contract. **Owners:** harness submissions,
records, scenario/capability identity owners and prompts; web projection contracts.

## Goal

Give the responsible architect a small durable way to register independent
obligations and report correct implementation/passing status, with optional `where`.

## Read first

[Contracts 9–12](../contracts.md#9-registration-and-architect-declarations),
[iteration 0's reviewed protocol](iteration0-contract-freeze.md),
[analysis](../../../analysis/2026-10-07-agent-declarations-and-audit-responsibilities.md),
local and capability submissions, `run/service.ts`, scenario records/states,
capability records and the existing ledger/effect discipline. Search generated
consumer views before adding cross-owner calls.

## Deliverables

- Extend existing architect submissions/records using the iteration 0 contract.
  Preserve accepted initial acceptance IDs and original behavioral requirements.
  Default delegated tracking to the outcome; separately register a scenario/test
  only on an explicit architect choice. No automatic test registration.
- Record registered obligation ownership and authorized architect done reports.
  Check IDs, role/ownership and structure, then trust the judgment. Allow reports
  alongside ongoing coordination using current action/submission composition.
- Persist provenance and the optional short `where` string. Present it as text,
  including when absent or naming a nonexistent path. No path resolution,
  evidence record, runner matching or completion condition.
- Support architect-authored revisions through the existing protocol. Introduce
  no source/audit-triggered retraction or parallel lifecycle.
- Update prompts, API/types and readable projections to distinguish engineer
  work reports, architect judgments and raw audit health. Keep run policy at
  the single boundary established in iteration 3; no second version bump.
- Refuse old-policy records outright; keep no inspection path for them.
  Apply only iteration 0's exact authorized documentation patches.

## Verification

PB3-D01, D02, D04 and D05. Extend `local-architect-submission.test.ts`,
`capability-submission.test.ts`, `capability-records.test.ts`, `scenario-states.test.ts`
and scenario-owner record/state tests as applicable. Add a focused declaration
workflow test only if no existing fixture expresses the actor/ID distinctions.

Exercise separate versus outcome-only registration, unknown IDs, wrong architect,
engineer-only report, duplicate report, nonterminal reporting and missing `where`.
A hint naming a nonexistent path is accepted without filesystem inspection.
Verify an old-policy record is refused naming both versions. Run type-check/check:self.

## Exit criteria

Authorized architect reports persist with independent audit results and optional
navigation text. Ordinary tests stay outside the ledger. Exact payload/event
choices match the reviewed contract; no file matching is added.

## Handoff

`iteration5-results.md`, frozen submission/event fields, actor/ID witnesses,
record projection and protected-patch comparison. Later iterations remove the
remaining old semantic consumers; production enablement stays pending.
