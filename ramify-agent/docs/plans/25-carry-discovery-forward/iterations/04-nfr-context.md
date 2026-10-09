# Iteration 4: NFR starting locations and historical source comparisons

**Plan:** [Plan 25](../main-plan.md). **Status:** planned.
**Prerequisite:** iteration 3 and its receipt.

## Owners and write boundary

Harness NFR source inputs/prompts, named snapshot comparisons and candidate/recovery tests. Paths below are relative to `ramify-agent/`;
short owner-local paths are relative to `subs/harness/src/`.

## Goal

Give the NFR assessor implementation locations and historical changes without substituting prior claims for its judgment.

## Read first

[Main plan](../main-plan.md), [instruction contracts](../instruction-block-contracts.md),
[execution rules](../execution.md), [testing specification](../../../testing.spec.md),
and `run/service.ts:runBase`, `nonfunctionalSourceInputs` and
`assessNonfunctionalCandidate`, `nonfunctional/{submissions,prompts}.ts`,
`reviews/snapshot.ts`, and `tests/helpers/candidates.ts`.

## Deliverables

Implement the NFR rows of section 2 and both comparisons from section 3.
Supply grouped module/source/test locations and explicit accepted assignment/result
pointers. Provide run-start → candidate and accepted-boundary → candidate identities
and filtered changed paths. Candidate provenance is authoritative; hints are not.

Add NFR-only named comparison selection to snapshot_diff while preserving ordinary
review defaults and the installed source policy, limits and observations. Use
existing CandidateSource APIs. Lists and patches identify the actual comparison.
Do not fabricate missing historical provenance, substitute current HEAD, or call a
failed diff empty. Preserve original dirty-source qualifications.

Rebuild inputs for repaired candidates and scoped investigations. Keep complete
fixed/NFR packages and independent source judgment; previous implementation claims,
audit results and pointer notes cannot establish NFR satisfaction. NFR instructions
start from supplied locations without requiring a redundant pathless diff.

## Matrix rows executed here

D8, D9, D10, D12, D13, I05 in the [acceptance matrix](../acceptance.md).

## Verification

From `ramify-agent/`:

```sh
npm run test:quick -- subs/harness/src/tests/nonfunctional-run.test.ts subs/harness/src/tests/nonfunctional-repair.test.ts subs/harness/src/tests/nonfunctional-recovery.test.ts subs/harness/src/tests/nonfunctional-submissions.test.ts subs/harness/src/tests/review-tools.test.ts
npm run type-check
npm run check:self
```

Files beginning `plan25-` above are proposed new focused test files. Existing
selectors must be reconciled with configured discovery at implementation time.
Script Git, CandidateSource, Ramify, audit and process answers under the testing
specification. No intended intermediate failures remain at handoff.

## Exit criteria

A scripted status-badge-shaped case finds accepted changes with base A and accepted/candidate B. Both patch comparisons, scope filters, restart and repair identities agree; all obligations remain present.

## Handoff

Complete discovery and instruction delivery implementation, candidate-bound NFR fixtures and evidence for D8–D13/I05. Record source commit, checks and limits in `04-results.md`.
