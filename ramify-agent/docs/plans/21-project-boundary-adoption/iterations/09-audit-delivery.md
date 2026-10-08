# Iteration 9: configured execution and applicable reuse

**Plan:** [Plan 21](../main-plan.md). **Prerequisites:** iteration 8 and revised P4.
**Owners:** audit child and harness gate/protocol; web only for the gate
projection fields this iteration changes.

## Goal

Execute the configured suite through the public provider path and accept only
applicable producer evidence, with no harness runner inventory or
scenario/assignment coverage conclusion.

## Read first

[Audit contract](../contracts.md#7-commit-audits-reuse-nested-projects-and-recovery),
[verification contract](../contracts.md#6-verification-and-configured-discovery),
the release's result/evidence/reuse contracts,
`check-execution.ts::{auditRequest,unexpectedCompletedAudit,missingExecutedRecords}`,
`checks/gate.ts` and `run/service.ts`.

## Deliverables

- Use the revised P4 configured committed execution path. Remove harness
  test filename walks, test-area guesses, outside-module suite loops and parallel
  expected/run comparison. Preserve all required configured command results,
  custom runner discovery and genuinely empty selection as producer facts.
  Native execution retains lifecycle hooks; no registered bridge may bypass
  missing producer discovery. Agent-selected focused checks stay diagnostic.
- Remove `run_scope_tests` from every engineer role's tools and prompts and
  the `scopedTests` timeout from the project configuration; the harness
  requests no dirty audit. Brief each engineer, as text, on the scenarios it
  must bind and its assigned owners' test areas. Keep the shell's whole-suite
  refusal and named focused runs. A failed gate audit continues the same
  engineer session with the gate's digest, as it does today.
- Run scenarios as configured checks: migrate the agent's own Cucumber
  commands and the `not @ramify-pending` profile into its committed audit
  definition, remove the harness scenario check with its modes, selection
  table, identity-tag selection, written profiles and the `acceptance`
  configuration section, and read per-scenario results from the raw runner
  output for display only. Feature-file writing, tags and records stay.
- Keep audit results independent from architect declarations; pass, fail, reuse
  and unrun outcomes cannot create or withdraw a done report.
- Carry the committed project's effective audit policy through requests.
  Preserve stable universe/definition identity and the captured configured
  check requirements.
- Replace blanket force/refusal behavior with provider-applicable reuse.
  Retain requested source, original audited source, report refs and applicability.
  Require execution receipts only for commands actually executed.
- Remove stale new-run schema-v3/old-policy assumptions from the request path
  and the readers that served them; update touched documentation.

## Verification

PB3-T01–T08, PB3-E01–E04 and PB3-P03/P04 using F2 and F3, with F4's root
project for reuse. Extend:

- `subs/harness/subs/audit/src/tests/completed-audit.test.ts`
- `subs/harness/subs/audit/src/tests/audit-conformance.test.ts`
- `subs/harness/src/tests/audit-check-execution.test.ts`
- `subs/harness/src/tests/iteration-source-delivery.test.ts`

Cover a docs zero-selection link with carried failures, actual shared-input
behavior, ignored-only full reuse and changed ignore policy/new baseline.
Include real F2 multi-configuration/custom-name witnesses from the revised P4
review. Retain every command result and current source identity. For PB3-T07,
extend the prompt-package and engineer-briefing tests and the F5 repair
continuation: no role lists the removed tool, the briefing carries the
scenario and test-area text, and a failed gate reopens the kept session.
Run type-check/check:self.

## Exit criteria

Configured committed execution passes revised P4 witnesses; no
assignment/scenario coverage conclusion, harness runner inventory, scoped test
tool, harness scenario check or harness-requested dirty audit remains.
Legitimate reuse is accepted without fabricated command records, while partial
or incompatible evidence is refused. No required command can become a pass
through an absent count.

## Handoff

`iteration9-results.md`, F2/F3 witnesses, reuse evidence with both source
identities, and the request/result contract iteration 10 extends with nested
results.
