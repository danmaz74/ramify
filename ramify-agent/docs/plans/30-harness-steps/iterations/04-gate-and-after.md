# Iteration 4: gates and after-handling

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and owners

Iteration 3 committed. Owner: harness `run/service.ts` `committingCheckpoint`,
`commitGate`, `assignIteration`, `closeIteration`, `requestReviews` and the
ownership query after an edit; `checks/`; `guard/write-guard.ts`;
`interfaces/protocol/transcripts.ts` and `transcripts/writer.ts`. Read
`checks/gate.ts`, `checks/checkpoint.ts` and the self-run report's findings
H1, H3 and H4.

## Goal

The gate the run would run and the handling the run would apply after a
submission are commands over a manual run, and every error they meet is
shown with its cause.

## Deliverables

- `steps/gate.ts` and `step gate --checkpoint iteration|work-item|readiness|final
  [--no-commit]`: the checkpoint over the manual run's candidate, with the
  checkpoint policy unchanged: readiness audits the baseline without a new
  commit; iteration/work-item/final commit and audit in their configured mode.
  Write `gates/<id>/attempt.json` with subject, proposal and candidate identity;
  `--invocation` disambiguates iteration proposals. Apply accepted bindings
  before the audit. `--no-commit` is diagnosis only and cannot authorize closure.
- `steps/after.ts` and `step after --invocation <id>`: the table in the main
  plan. Record-only handling is extracted into functions `RunService` calls;
  the rest is reported as not run. Errors exit 1 with the cause and the
  record being written. Preserve transaction atomicity and already committed
  transitions; repeated handling of an invocation does not duplicate them.
  Require the same project lock and settled writer as `run`. Accepted closure
  and review requests require the matching passing committed gate; never
  create a work-item gate-request record absent from the ordinary run.
- `guard/write-guard.ts`: a thrown placement query yields a refusal naming
  the error in the guard decision and the transcript.
- Transcript `started` entry: tool declarations; continuation additions
  recorded; shared readers accept older entries with those fields absent,
  reporting the missing evidence rather than an empty list.

## Verification

Own S15–S20 and S24–S25. Scripted execution-port and Git tests for `gate`; record tests
for each `after` branch including the invalid module description and the
ledger bound; guard and transcript tests. Run the focused files, then
`npm run type-check` and `npm run check:self`.

## Exit and handoff

A manual run can be gated and advanced one submission at a time, and the
three fatal self-run defects surface as named errors. Commit and write
`04-results.md`.
