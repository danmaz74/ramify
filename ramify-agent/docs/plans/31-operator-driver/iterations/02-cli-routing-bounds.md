# Iteration 2: CLI, routing and bounds

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and owners

Iteration 1 committed; R31-1's role selection and R31-2's composition resolved.
Owner: agent composition, harness `run/service.ts` agent selection and
bounds (`:4509`, `:4672-4673`), `run/policy.ts`,
`interfaces/protocol/runs.ts` `runAgentSchema`, `http/server.ts`,
`sessions/command.ts`, Plan 30's step command, and the root `src/cli.ts` and
`src/main.ts`.

## Goal

A run chooses the operator for a closed set of roles, operator turns are not
idle-bounded, and the operator acts from the command line.

## Deliverables

- `runAgentSchema`: the operator choice with a base agent and a role set;
  carried by `serve --operator <roles>`, `start-run`, `session --agent operator`
  and `step run --agent operator`.
- Composition according to R31-2 and selection according to R31-1;
  closed-lineage validation before start names roles to add. Preserve existing
  run-agent values and persist the selected routing; keep standalone fake/run
  scripted choice mappings explicit. Attribute each invocation to its executor.
- Operator bounds: no idle bound for operator roles, absolute bound and
  deadlines unchanged; the bounds record names the policy. Supply work item,
  opened time and effective deadline to the mailbox from the harness context.
- `ramify-agent operator pending|show|call|submit|end` over the mailbox
  schemas, with the specified exit statuses, concurrent publication, terminal
  state checks and bounded result waits. `show` includes inherited context
  by default for continuations/forks.

## Verification

Own O07–O11, O15 and O17. Extend `helpers/runs.ts` scripted runs with the composite
choice; policy and lineage tests; CLI parsing tests. Run the focused files,
then `npm run type-check` and `npm run check:self`. For O17, run the relevant
existing registered pi preservation witnesses with `npm run test:boundaries
-- <exact files>` when the composition changes that path; retain their
results, not merely the scripted composite result.

## Exit and handoff

A scripted run mixes operator and scripted roles with the right bounds and
records. Commit and write `02-results.md`.
