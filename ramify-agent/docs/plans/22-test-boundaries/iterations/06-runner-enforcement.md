# Iteration 6: configured runner enforcement

**Plan:** [Plan 22](../main-plan.md). **Prerequisites:** iteration 5. **Owners:**
project root testing/configuration; audit child for complete-run qualification.

## Goal

Ordinary guarding is automatic, actual boundaries are explicitly registered,
and the committed audit still executes the whole configured suite.

## Read first

[Runner partition](../contracts.md#4-configured-runner-partition),
`vitest.config.ts`, `package.json`, `ramify-audit.json`, machine-lock setup,
iteration 2 guard and iteration 5 boundary inventory. Follow current public
provider configuration/discovery contracts; add no production test inventory.

## Deliverables

Create the exact-path boundary manifest under root testing source, validate its
entries and consume it in configured projects. Keep `node` and `web` ordinary,
add `boundaries`, and preserve React/environment/fixture/scratch/lock behavior.
Install the guard before test code in ordinary projects. Declare `test:quick`
and `test:boundaries`; retain `test` as the complete aggregate. Preserve the
committed full audit's complete selection and other required checks. Remove
redundant per-file guard/reset mechanisms only after automatic enforcement is
proven. Write agent-local `docs/testing.spec.md` with the exact rule and
procedures, and link it from `AGENTS.md` and the document index so new test
authors receive it. Keep the foundational claim scoped to ordinary tests and
make real-boundary qualification explicit; do not rewrite protected principles.

## Matrix rows executed here

TB06, TB13 and TB14; F4 controls and all configured files.

## Verification

Run `src/tests/test-process-guard.test.ts` and
`src/tests/test-boundaries.integration.test.ts` by exact paths. The latter is a
registered actual-runner driver; its temporary ordinary sentinels refuse Git
without running it. Use `vitest list --filesOnly --json`
for the aggregate and each declared project; require disjoint and complete union,
valid file ownership, no duplicate entries and no missing files. Add a new ordinary
test control, bad/duplicate/missing registration controls and fixture/scratch
exclusion controls. Run ordinary controls with both focused commands and the
audit's complete invocation so selection cannot disable the guard. Qualify
parser/discovery behavior through the pinned public audit path; retain machine
lock ownership rather than creating another lock around nested commands.

## Exit criteria

Complete configured discovery is preserved and ordinary enforcement cannot be
silently bypassed. The audit cannot pass through quick-only selection.

## Handoff

`iteration6-results.md`, declared commands/projects, boundary registry, discovery
comparisons, guard controls and full-audit compatibility evidence.
