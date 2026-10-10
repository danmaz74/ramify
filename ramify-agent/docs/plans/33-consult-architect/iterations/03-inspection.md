# Iteration 3: consultation inspection

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and owners

Iteration 2 committed with real consultation record examples.
Owners: harness projection/command and root CLI.
Write boundary: consultation projection/detail reader, thin harness command,
harness parent exposure, root parser/main/help, tests and README usage.
No web client or HTTP endpoint.

## Goal

List and inspect consultations without reconstructing relationships manually,
including nested exchanges, incomplete calls and actual observed usage.

## Read first

- Main inspection contract, acceptance C13–C16 and iteration 2 receipt/examples.
- `subs/harness/src/projections/session-queries.ts`, existing
  transcript/content/observation readers and consultation records.
- `subs/harness/src/steps/command.ts` for the existing command boundary.
- Root `src/cli.ts`, `src/main.ts`, `src/tests/cli.test.ts`;
  `subs/harness/module.ramify` and root ordinary API view.
- [Testing rules](../../../testing.spec.md).

## Deliverables

- One read-only projection over retained records, with session filtering and
  detail by caller invocation/tool-call identity; preserve live incomplete state.
  Reuse content readers for exact question, accepted answer, actual returned
  result/error and navigable caller/fork transcript references.
- `ramify-agent consultations --run ... [--session ...] [--format text|json]`
  and `--id ...` detail. Text defaults to a concise ordered list with nested
  children and references; JSON retains exact facts and unknowns. Filtering
  includes descendant consultations; run-wide listing counts each one once.
- Model, outcome, timings and usage from actual child invocations. Keep partial
  metrics explicit; total each invocation once. Outer elapsed includes inner wait.
  Label summed top-level durations as cumulative call time, not session wall
  time when calls overlap. Keep incomplete durations unknown; no interval-merging
  implementation, quality score or claimed savings.
- Expose the command and signature companions from harness using the existing
  parent-facing pattern. Keep root parsing thin. No library import from generated
  catalogs and no independent root ownership of consultation meaning.
- User-facing CLI examples for inspecting one nested chain and finding subsequent
  caller work. Valid old runs list zero consultations; malformed records return
  an explicit read error rather than a misleading empty successful report.

## Cases and verification

Own C13–C16. Use small retained fixtures from iteration 2 with distinct usage,
overlapping outer intervals, an inner wait, accepted-but-undelivered response,
missing usage and a valid pre-feature log. Compare text/JSON facts and the
resolved transcript targets; assert inspection performs no mutation or agent call.

From `ramify-agent/`:

```sh
npm run test:quick -- subs/harness/src/tests/consultation-inspection.test.ts src/tests/cli.test.ts subs/harness/src/tests/session-queries.test.ts
npm run type-check
npm run check:self
```

Exercise CLI parse/dispatch in process. If native executable behavior becomes a
claim, register a separate exact witness under the existing test-boundary rules.

## Exit and handoff

C13–C16 pass. Commit and write `03-results.md` with text/JSON example outputs,
resolved full-exchange references, metric limitations, exposed contract and
commands. Iteration 4 receives an end-to-end inspectable feature.

