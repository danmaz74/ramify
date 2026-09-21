# Iteration 7: Renderers, not-checked replies, service messages and completion

**Plan:** [Plan 2E](../main-plan.md).
**Prerequisites:** iterations 1 to 6.
**Owners:** `cli`, `daemon`, `daemon/contexts`, the root; `scripts/reference-harness/`.

## Goal

Both human forms print the full block, a not-checked reply explains itself, the remaining CLI and service messages meet the contract, and the plan's acceptance passes.

## Read first

- Main plan: Rendering, Acceptance, Completion gate.
- `subs/cli/src/format.ts`, `changed-command.ts:30-165`, `check-command.ts:30-75`, `errors.ts`, `command-support.ts`, `arguments.ts`, `run-cli.ts:35-50`.
- `subs/daemon/subs/contexts/src/context-manager.ts` (`Unavailable`), `interfaces/contexts.ts:130-149`; `subs/daemon/src/validation.ts`, `connection.ts`.
- `scripts/reference-harness/report.ts`, `cli-cases.ts`, `session-lifecycle.ts`.

## Deliverables

1. One block renderer used by `formatHuman`, `formatChangedHuman` and the harness: header, message, importer, original, details, related with roles, proposal under its label.
2. `reasonMessage` carried from `Unavailable.message` and from `CliFailure` into `CheckDocument`; `configuration-changed` added to the allow-list; the fixed not-a-pass sentence.
3. Invocation, argument, disconnect and service messages reviewed against the contract; catalogue rows for every `CliFailureCode` and not-checked reason.
4. Reference-harness expectations for DM-04.
5. The completion report with the baseline comparison and the DM-09 review.

## Matrix rows executed here

- DM-01 (no `TBD`)
- DM-02 (cli, daemon)
- DM-04
- DM-07
- DM-09

## Verification

- `changed-command` tests for three not-checked reasons; renderer tests for a denial with and without a proposal.
- `npm run check:diagnostics`, `npm run check:self`, the full reference harness.
- DM-09 is performed once and recorded; it calls a model and is not a test.

## Exit criteria

- The main plan's completion gate.

## Handoff

- The handoff items of the main plan, with the final field list for the consuming harness.
