# Iteration 4: integration and qualification

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and owners

Iterations 1–3 committed; R33-1 resolved and all earlier cases accounted for.
Owners: harness integration/tests/docs and agent/Pi adapter tests. Root CLI
integration is included. Write boundary: focused integration fixtures, Pi
scripted-provider witness, documentation, narrowly necessary corrections and
qualification receipts. Serialize any corrections to shared runtime files.

## Goal

Qualify the complete feature on an exact candidate: all three relationships,
one-level nesting, advisory behavior, logs and inspection.

## Read first

- All iteration receipts and [acceptance cases](../acceptance.md).
- `subs/harness/src/tests/consultation-workflows.test.ts` and existing
  `plan23-fork-workflows.test.ts`, `steps-run.test.ts`.
- Pi `src/tests/plan23-prefix-preservation.test.ts` and
  `src/tests/helpers/scripted-provider.ts` under
  `subs/harness/subs/agent/subs/pi/`.
- Neutral agent `src/tests/plan23-session-operations.test.ts`.
- [Testing rules](../../../testing.spec.md) and committed `ramify-audit.json`.

## Deliverables

- C17 scripted workflow from dispatch through consultation/nesting to ordinary
  completion, showing consultation did not change decision/assignment semantics.
  Include capability-assigned and nested-task engineers consulting their actual
  assigning coordinator, then resuming ordinary capability execution/handback.
- C18 real Pi adapter witness with scripted provider responses. Demonstrate
  awaited nested tool results, exact source history, unchanged parents, active
  tool sets and abort propagation. Use existing provider-test facilities; no
  real model credentials, external process allowance or cache-benefit claim.
- User-facing documentation, updated analysis status and complete case receipts.
  Explain inspection, unknown/incomplete evidence, absent supervisor behavior
  and no automatic fresh fallback. Do not mark usefulness as machine-verified.
- Clean committed integration candidate and exact full-audit evidence. Retain
  failing/unrun results honestly; fix in-scope failures before qualification.

## Cases and verification

Own C17–C20. From `ramify-agent/`, run focused new files plus affected existing
session/task/manual regressions. For example, using the new Pi witness location:

```sh
npm run test:quick -- subs/harness/src/tests/consultation-workflows.test.ts subs/harness/src/tests/consultation-inspection.test.ts subs/harness/src/tests/plan23-fork-workflows.test.ts subs/harness/subs/agent/subs/pi/src/tests/consultation-nesting.test.ts
npm run type-check
npm run check:self
```

If extending the existing Pi test instead, name its actual path in the receipt.
Check configured file discovery includes every new test. Ordinary tests use
scripted external boundaries and the workflow in-memory store. Any actual native
claim needs an exact reviewed registration; do not waive the process guard.

Commit the integration candidate, then from its repository root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

Use the installed configured provider, not another direct whole-suite command.
If a later source change is needed, qualify the resulting candidate anew.
A real-model trial is optional later evaluation by the user, not a substituted
acceptance gate or a benchmark requirement.

## Exit and handoff

All twenty cases have evidence; the configured full audit passes on the named
candidate with skips/limitations explicit. Write `04-results.md` and
`../final-results.md`: exact commits, commands/outcomes, audit artifacts,
text/JSON inspection examples and remaining limitations. Update manifest/status
only from actual outcomes. Do not merge, publish or claim live advice quality
as part of this planning task.

