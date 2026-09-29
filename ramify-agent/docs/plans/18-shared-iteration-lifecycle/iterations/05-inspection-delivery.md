# Iteration 5: inspection and faithful evidence delivery

[Plan 18](../main-plan.md) · [Provider contract](../provider-contract.md) ·
[Acceptance](../acceptance.md)

## Prerequisites and owners

Iteration 4. Harness owns agent delivery and public query contracts; evidence
owns any missing Git read operation; web renders the received facts.

## Goal and read first

Read existing Git operations, architect equipment, ordinary result/failure
briefs, checks/diagnostics.ts, capability coverage validation, query/projection
contracts and browser gate/task views.

## Deliverables

- Give both architect roles the same minimal read-only status/diff/log/show
  surface through existing Git support. Discover untracked content through
  status and ordinary reads. Do not expose source/index/ref mutation.
- Deliver relevant current failures and complete diagnostics with qualifications
  and provenance; retain the full provider report and exact artifact access.
  Replace tail-only briefs without preloading unrelated output or old history.
- Fresh reconstructions receive current goal, open work, useful result details
  and artifact locations through existing recovery briefing. Failed retrieval
  stays unavailable, never an empty clean result.
- Remove read_capability_evidence and its mandatory prompt instruction. Remove
  model-authored candidate/configuration hash transcription; the harness uses
  provider source/report identities and its own orchestration binding. Agents
  still judge test-to-behavior relevance and justify expected-result corrections.
- Project provider counts, verdicts, timing, mode, selection, coverage and
  incompleteness directly. Keep harness scenario associations distinct from
  runner truth; no UI failure recounting or semantic grouping.
- Show common iteration/commit/review/task states truthfully, including old
  unavailable fields. Update shared prompts, commit-before-check wording and
  current design documentation.

## Verification and exit criteria

SI06, SI11–SI14, SI17–SI18; AE05–AE06, AE11–AE12, AE16–AE17.
Verify actual Git results for committed, staged, unstaged, deleted and untracked
source; operations leave source/index/refs unchanged. Capture repeated prompts
and prove no full historical evidence replay.

Use long/multiple diagnostics, partial-chain reports, missing artifacts and
source-area view failures. Agents and browser queries must see the same
producer facts and retrieve complete artifacts at the exact report identity.

Exit: normal inspection and current outcome delivery replace the history tool;
engineers receive enough unabridged relevant evidence to diagnose failures
without a parallel tally or compulsory architect triage.

## Handoff

Record concrete before/after briefs, artifact identities and browser/service
evidence in iteration5-results.md.
