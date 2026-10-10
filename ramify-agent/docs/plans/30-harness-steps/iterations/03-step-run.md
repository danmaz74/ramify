# Iteration 3: the invocation runner and `step run`

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and owners

Iteration 2 committed. Manual operation is CLI-first, as adopted in R30-2.
Owner: harness `run/service.ts` `runInvocation`,
`startInvocation`, `runSession`; `sessions/`; `run/records.ts`; root CLI.
Read `sessions/single.ts:331-551`, `run/service.ts:4164-4670`,
`run/records.ts:936-981` and `run/service.ts` `load` (`:2540-2702`).

## Goal

One invocation runner, used by the run and by `step run`, writes the run's
records into a manual run in the real layout; `session` keeps its command
line on top of it.

## Deliverables

- `steps/runner.ts`: the invocation runner extracted from `runSession` and
  `single.ts`: records, transcript, submission judge, equipment binding,
  bounds, outcome and usage. `RunService` calls it; `single.ts` is
  reimplemented on it and `sessions/records.ts` is retired.
- Manual runs: `job.json` gains `kind: 'manual'` alongside the unchanged
  `kind: 'implementation'`; `load` skips manual execution/recovery. CLI output
  and direct record access suffice; no manual-run server discovery or UI
  projection is required. Retain the step inputs
  captured in iteration 1. Refuse implementation directories as destinations;
  record and validate project, plan, base and branch identity on creation/reuse.
- `step run --inputs --agent pi|fake [--model] [--script] --run <dir>`:
  lock, view materialization, one invocation, condensed live output (the
  `session` command's progress vocabulary extended with guard denials, hook
  findings and verdicts), exit statuses 0, 1, 2. The invocation record names
  the base commit and whether the tree was dirty at start, through the
  existing Git service. Reruns use the current tree and a new invocation ID;
  nothing is snapshotted or restored. Imported run inputs execute fresh with
  complete task context and retained original-start provenance; compatible
  same-manual-run points can continue/fork. Missing context is a recorded
  fresh start.

## Verification

Own S09–S14. Scripted-agent tests for the manual run records, `load` skip,
`session` compatibility, base and dirty-state recording and live output.
Run the focused files, then
`npm run type-check` and `npm run check:self`.

## Exit and handoff

`step run` and `session` both run on the runner, with manual-run output and
records inspectable through the CLI and filesystem. Commit and write
`03-results.md`.
