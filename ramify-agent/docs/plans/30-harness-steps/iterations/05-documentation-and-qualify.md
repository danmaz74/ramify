# Iteration 5: documentation and qualification

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and owners

Iteration 4 committed. R30-3 is resolved: the agent prepares an ordinary
worktree for the real implementation target. Owner: `README.md`,
`docs/README.md`, `docs/todo.md`,
Plan 15's status line, and this plan's receipts.

## Goal

An agent uses the step commands to implement real planned work in a real
project worktree, the documentation describes that workflow, and the harness
candidate passes its configured full audit.

## Deliverables

- Documentation: the README's implementation workflow describes agent-owned
  worktree creation, the target project's ordinary setup and the harness's
  own preconditions (the plan under `plans/<id>/plan.md`, a committed audit
  configuration, the project configuration file, a parent commit for the
  patch check), then `step inputs`, `render`, `run`, `gate`, `after` and
  manual runs, and says the agent resets the tree before retrying a step; `docs/README.md` lists this plan;
  explain that agent-operated manual runs use CLI output and recorded files,
  with no requirement to appear or stay current in the web client;
  Plan 15 is marked superseded for capture and replay; `docs/todo.md` drops
  the hand-made replay items this plan covers.
- Apply a real plan, or a bounded deliverable from it, to a real project in
  a worktree the agent creates. This spends model calls and is asked for
  before it starts. Record the project, plan, intended deliverable,
  branch and base before work. Use authored inputs through `inputs`, `render`,
  `run --agent pi`, `gate --checkpoint iteration` and `after`, repeating steps
  and repairing problems as needed to produce a usable implementation.
  `--no-commit` remains diagnosis only.
  In `05-results.md`, report the resulting commits, target-project verification,
  the responsible agent's assessment of the deliverable, unresolved defects,
  elapsed time and cost. Retain successful work for normal review/integration;
  record an unsuccessful attempt honestly if it is discarded. Harness tests
  and implementation review remain distinct evidence. No fixture preparation
  command or generic workspace provisioning is added.
- Final audit from the clean committed candidate, from the repository root:

  ```sh
  ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
  ```

## Verification

Own S21–S23. Validate the documented worktree workflow; `npm run type-check`;
`npm run check:self`; the final audit; and the real implementation's own
project-declared verification and review.

## Exit and handoff

Audit passes on the final harness commit; receipts name commits, case evidence
and limits. Real-plan delivery is assessed separately: an unrun or discarded
attempt is not successful implementation evidence. Hand off to Plan 31 with
the retained result or explicit outstanding qualification work.
