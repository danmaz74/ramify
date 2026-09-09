# Implementation workflow

Each [roadmap](../plans/tooling-architecture/README.md) deliverable has a plan,
divided into implementation iterations. Follow the active plan's scope and
acceptance criteria.

## Prepare a plan

Read the roadmap's brief, relevant specifications, current source and predecessor
handoffs. Record what exists, what is missing and which decisions remain open.
Define the runnable deliverable, its completion criteria and explicit deferrals.

Preserve the plan's directory and identity when revising it. Keep supporting
contracts and reports beside the plan; follow the
[artifact guidance](cucumber-viz.md#plan-artifacts-and-prompts) for managed files.

## Define the iterations

Split a plan into iterations as the roadmap's
[authoring rules](../plans/tooling-architecture/README.md#how-to-author-each-later-plan)
require: one owner or one capability each, sized for a single 250k-token
context, registered in `iterations/manifest.json` in dependency order. Each
iteration file is self-contained and uses the headings of the existing ones:
plan link, prerequisites, owners, goal, read first, deliverables, matrix rows
executed here, verification, exit criteria and handoff. Name fixtures, case
IDs, commands and expected intermediate failures under verification, and the
contracts and artifacts the next iteration needs under handoff.

Implement providers before wiring their consumers. Mark iterations parallel
only when their writes and verification are independent, then add an
integration check. Start each iteration from its own read-first list and
expand reads only to answer a specific question.

## Implement and verify

Check prerequisites, implement the assigned behavior and follow the
[testing guide](testing.md) for baseline and regression checks. Review the diff
for correct ownership, public contracts and unintended changes.

In Studio, follow the [managed workflow](cucumber-viz.md#execute-in-a-worktree).
In direct work, complete the user's requested scope: one iteration or the whole
approved plan. Preserve existing edits and commit or publish when authorized.

Fix defects within that scope. If progress needs additional owner work, record
the affected paths, dependency and revised verification. Put larger additions
into explicit owner or integration tasks.

Prepare concrete alternatives for product or architecture choices at the plan's
required review points. Retain accepted choices and existing approvals, and
continue work that can proceed while a decision is pending.

## Hand off the result

Describe what changed and why, link to the contracts and
[verification results](testing.md#report-what-ran), and record remaining gaps or
approved scope changes. Retire temporary substitutes when the real path works.
At plan completion, run its full acceptance gate and provide the successor
inputs named in the roadmap.
