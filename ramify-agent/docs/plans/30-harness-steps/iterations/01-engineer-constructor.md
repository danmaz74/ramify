# Iteration 1: engineer step inputs, constructor and render

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and owners

Inspect the implementation checkout and take its clean committed baseline
full audit with the plan's command. Read the main plan's fresh re-execution contract.
Owner: harness `run/`, `work/`, a new
`steps/` directory, and the root `src/cli.ts` and `src/main.ts`. Read the main
plan, the proposal, `run/service.ts` `takeIteration` and
`implementationTools`, `work/engineer.ts`, `prompts/tasks.ts`,
`run/session-operations.ts` and `docs/testing.spec.md`.

## Goal

The run builds every engineer invocation from a serializable inputs record
through one constructor, and the same constructor renders the packet from the
command line.

## Deliverables

- `steps/inputs.ts`: the `StepInputs` union, schema id
  `ramify-agent.step-inputs/1`, with the engineer members for fresh, repair
  continuation and resumed starts. Explicitly based project- and run-relative
  path fields only; arbitrary captured text is not a path field. Validate and
  persist each invocation's inputs before start in `invocations/<id>/inputs.json`.
- `steps/engineer.ts`: the constructor from engineer inputs and a
  `StepEnvironment` to a `ConstructedStep` holding packet inputs, equipment
  inputs, validator evidence, bounds, context policy, start mode and the
  records written before start. `takeIteration` and `implementationTools`
  call it; the inline construction is removed, not duplicated.
- `steps/from-run.ts`: derive engineer inputs from a run's records and the
  invocation's correlation packet; refuse other roles and incomplete task
  records with the reason. Report `equal` or differing sections diagnostically;
  imported turns render a complete fresh briefing and retain the original
  start as provenance. Do not require or import the old provider history.
- `steps/render.ts` and the CLI: `step inputs --from-run` and `step render`,
  parsed in `src/cli.ts` beside `session`, dispatched in `src/main.ts`.
  `render` takes no lock and writes nothing.
- The harness's `module.ramify` exposes the step command entry and its
  signature companions to its parent, as it exposes `runSessionCommand`.

## Verification

Own S01–S04. Extend `plan23-task-prompts.test.ts` and
`plan25-task-packets.test.ts` with the equality between the run's delivered
packet and the constructor's render over a scripted fixture run. Add focused
tests for the inputs schema, `from-run` and CLI parsing. Run from
`ramify-agent/`:

```sh
npm run test:quick -- subs/harness/src/tests/plan23-task-prompts.test.ts subs/harness/src/tests/plan25-task-packets.test.ts subs/harness/src/tests/engineer-briefing.test.ts
```

Include the new files in the invocation, then `npm run type-check` and
`npm run check:self`.

## Exit and handoff

Every engineer invocation in a scripted run is constructed by the new
function; the same inputs/environment render equal. Imported recorded inputs
also render a usable fresh briefing, with differences reported. Commit the scoped change and write
`01-results.md` with checks, source paths and open issues.
