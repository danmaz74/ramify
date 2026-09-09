# Using cucumber-viz to develop Ramify

Complete the [standalone setup checklist](cucumber-viz-setup.md) before running
Studio in the new repository. For planning and implementation conventions, use
[the workflow guide](implementation-workflow.md).

## Plan artifacts and prompts

Keep each plan under `docs/plans/<plan>/`, with `main-plan.md`, `plan.json`,
`iterations/iterationN.md` and `iterations/manifest.json`.

Use available Studio planning tools for managed writes and validate against the
installed schemas. During execution `main-plan.md` and existing iteration files
are read-only; `iterationN-results.md` is written through the workflow tools,
and `iterationN-check-results.md` and `status.md` are written by the control
plane. Ordinary Markdown may be edited directly; when a plan-creation tool is
unavailable, create the normal files and validate them before execution.

Use structured execution envelopes only with supported fields and module IDs.
Keep the Markdown sufficient to implement the iteration. Select prompts for the
plan's actual scope; known compatibility issues are in the
[setup checklist](cucumber-viz-setup.md).

## Execute in a worktree

Studio owns scheduling, workflow state, checks, managed commits, recovery and
worktrees. Complete the assigned iteration and return results through its tools;
leave advancement to the server.

Before edits or checks, confirm the execution worktree and revision. Use its
source, plan and generated output. Prepare dependencies for each package whose
checks run, keeping first-party source tied to the tested checkout.

For direct work outside Studio, use an isolated worktree when useful. Preserve
unmerged changes and evidence before cleanup.

## Diagnose workflow execution

Identify the configured project root, workflow ID and execution worktree.
Records usually live under that project's `.cucumber-viz/`, which may differ
from the agent's working directory. Inspect relevant records in this order:

| Record | Purpose |
| --- | --- |
| `.cucumber-viz/workflows/<id>/snapshot.json` | Current persisted phase, iteration and step. |
| `.cucumber-viz/workflows/<id>/journal.ndjson` | Lifecycle history and the last completed transition. |
| `.cucumber-viz/turns/turn_<id>.json` | Claude or Codex request, response, tools and turn status. |
| `.cucumber-viz/logs/planning-studio-*.jsonl` | Process startup/exit, check execution and operational correlation. Older runs may use `agent-studio-*.jsonl`. |

Match workflow/iteration, chat/session/turn and runtime-session IDs. For an empty
response, inspect turn status and runtime startup. Compare failing commands and
working directories with the active plan. Read only the necessary transcript
excerpts, keeping credentials and unrelated content out of reports.

Report the last completed step, failed operation, supporting evidence and proposed
recovery. Use supported controls to resume or retry; keep snapshots, journals and
check outcomes intact. Confirm the target and existing authorization before a
restart or replay that could affect other sessions. Reproduce Ramify product
bugs using the [testing guide](testing.md#regression-scope-and-bug-reproduction).
