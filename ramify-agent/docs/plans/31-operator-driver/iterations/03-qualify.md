# Iteration 3: qualification

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and owners

Iteration 2 committed. Owner: combined harness tests, `README.md`,
`docs/README.md`, receipts.

## Goal

The operator plays the local architect through a whole scripted work item,
then uses the workflow on real planned work in a real project. Documentation
describes the feature, and the harness candidate passes its configured full audit.

## Deliverables

- A scripted whole-work-item test with the operator as local architect and
  every additional role required by the resolved R31-1 rule; the engineer
  stays scripted. Every operator turn is answered through the mailbox. Do
  not leave scope reviewers scripted while their parent is operator-driven.
- Documentation of the operator choice, mailbox, CLI and closed-lineage rule
  in the README and `docs/README.md`.
- Apply a real plan, or a bounded deliverable from it, in a worktree the agent
  creates in the target project and sets up using its development instructions.
  Use `serve --agent pi --operator <closed-role-set>`, recording the role set
  after R31-1 is resolved. A generalist agent answers operator turns through
  the CLI, with pi as engineer, and drives the work toward a usable result.
  Record project/plan/deliverable, worktree/base, resulting commits, project
  verification, responsible agent's review, unresolved defects, elapsed time
  and cost in `03-results.md`. Retain successful work for ordinary review and
  integration; an unsuccessful attempt may be discarded and is reported as
  such. There is no `step prepare` or fixture preparation prerequisite.
- Final audit from the clean committed candidate:

  ```sh
  ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
  ```

## Verification

Own O12–O14. The combined test, `npm run type-check`, `npm run check:self`,
the final audit. If composition changes pi, run its existing relevant
registered native preservation witnesses; mailbox-only scripted tests do not
qualify provider preservation.
The real implementation also receives its own project-declared verification
and review, distinct from these harness checks.

## Exit and handoff

Audit passes on the final harness commit; receipts name commits, case evidence
and limits. An unrun or discarded real-plan attempt leaves successful
implementation qualification outstanding.
