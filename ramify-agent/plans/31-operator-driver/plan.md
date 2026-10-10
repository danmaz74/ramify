# Plan 31: operate harness roles from an outside agent

**Status:** execution input; implementation not started. R31-1 and R31-2
were resolved on 2026-10-10 (see [Resolved decisions](#resolved-decisions)).
**Target:** ramify-agent.
**Prerequisite:** Plan 30's step inputs, runner, transcript declarations and
manual-run layout are implemented, qualified and merged into the `ramify-agent`
branch at `7c32632a` (final full nested audit passed).

Converted from `docs/plans/31-operator-driver/` on 2026-10-10. The original
iteration plan is retained as historical authoring provenance, not incorporated
as execution instructions. This plan and its [acceptance](acceptance.md) are
the execution input. Work decomposition belongs to the harness's architects.

## Problem and intended result

A generalist coding agent such as Claude Code or Codex, or a person, needs to
play selected harness roles while the real orchestration runs. A standalone
step cannot show how scheduling, concurrent reviews, reconciliation and
capability coordination respond across a whole work item.

Allow an outside operator to receive the effective context and active tools
that the selected role would receive, act through those tools and submit through
the ordinary submission tool. Other roles continue on pi. Preserve the
orchestration, guard, effect journal, mutation hook, judge, records and
transcript. The intended result is usable implementation of a real plan in a
real project, with enough evidence to inspect and improve the harness.

The supervising agent creates an ordinary worktree and follows the target's
setup instructions. Workspace preparation is not a harness command. Useful work
is retained for review and integration; discarded or unsuccessful work is
reported as such. CLI and file inspection are sufficient; no new UI integration
or freshness guarantee is required.

## Required operator interface

Provide these command surfaces:

```sh
ramify-agent serve --project <root> --agent pi --operator local-architect,context-selector,reviewer,capability-architect
ramify-agent operator pending --project <root>
ramify-agent operator show --project <root> --turn <run>/<operation>
ramify-agent operator call --project <root> --turn <run>/<operation> --tool read --input '{"path":"..."}'
ramify-agent operator submit --project <root> --turn <run>/<operation> --input @submission.json
ramify-agent operator end --project <root> --turn <run>/<operation> --reason "..."
```

The operator role set is closed under fork lineage (R31-1). Playing the local
architect means playing `local-architect,context-selector,reviewer,capability-architect`,
as the example shows; `local-architect` alone is refused before the run starts.
Standalone `session` and Plan 30's `step run` also accept `--agent operator`.
An MCP interface, HTTP mailbox interface and web client are outside this plan.

### Effective context and execution authority

For each operator invocation, publish the project/plan/run identity, invocation
and operation, role, work item when present, start mode and source point, opened
time, effective absolute deadline, current instructions/message and active tool
declarations including the submission schema. Assert that execution is still
live before publishing an actionable turn.

A continuation or fork includes the inherited history at its selected source
point: initial instructions, generic context additions, tool declarations and
activation changes, messages, calls, results, submissions and verdicts, followed
by current additions and the new task. Render persisted generic agent payloads
as well as operator payloads; display events alone are insufficient. A later
parent turn must not appear in an earlier fork. Context display is complete by
default; an optional `--history` flag cannot be required to see inherited context.

Apply tool calls through `SessionDriverRuntime.callTool` and submissions through
`SessionDriverRuntime.submit`. Operator built-ins are `read`, `grep`, `ls`,
`find`, `edit` and `write`, matching pi's declarations and bound only when
declared and active. Preserve the engine order: guard, intent, execution,
completion, then `afterMutation`. Preserve existing scope and guarded-file
authority. Snapshot-only reviewers get only their permitted snapshot tools;
they gain no ordinary filesystem built-ins or inactive historical tools.

An ordinary rejected submission returns the judge's errors and leaves the turn
open. A final rejection closes it without an accepted submission; acceptance
closes it as submitted. Preserve the existing rejection bound. An explicit end
returns ended, cancellation returns stopped, and ordinary driver faults retain
failed outcomes. Persist actions and results through the runtime payload store
so later compatible continuations/forks retain them.

Document that outside agents must use the operator channel for project edits.
The mailbox is not an OS sandbox for their independent shells or editors.

### Mailbox and action lifecycle

Use a file mailbox beneath each run directory at `operator/<operationId>/`.
Standalone sessions and manual runs use the same relative layout beneath their
own directories.

| File | Required content |
| --- | --- |
| `turn.json` | Turn identity and bounds above; status `pending`, `acting`, `submitted`, `ended` or `stopped`; terminal reason. |
| `instructions.md` | Role instructions, or instruction additions for a continuation. |
| `history.md` | Rendered inherited history for continuation/fork; absent for fresh execution. |
| `message.md` | Current task message. |
| `tools.json` | Active tool declarations and submission tool/schema. |
| `actions/NNN.json` | A `call`, `submit` or `end` action with a stable action ID. |
| `results/NNN.json` | Tool result, submission verdict and text, or refusal. |

Process actions in order. Serialize per-turn sequence allocation and atomic
publication so concurrent CLI processes never overwrite or lose actions. CLI
publication requires pending/acting status, and the driver rechecks openness
when admitting each action. Use stable action IDs as engine call IDs, persisting
identity before effects. Repeated admitted actions must not execute their
effects twice. Discover already published actions before waiting and after
wake-up; filesystem-watch delivery is not sufficient on its own.

On submission, end or stop, fence new work, drain admitted runtime calls and
settle or refuse queued actions before dispatch finishes. Resolve waits on the
runtime abort signal. A CLI waiting for a result also observes terminal status,
including after the watcher exits, so a closure race cannot leave it hanging.

Expose bounded CLI result waiting through `--timeout-ms`. A wait timeout reports
the action ID and that the execution result is unknown; it does not assert
cancellation or make resubmission under a new ID safe. Existing recovery rules
govern server restart. Stale mailbox status cannot reopen a turn or authorize
effects. The mailbox is raw output beside the transcript, not a ledger record
or an independent recovery authority.

### CLI results

`pending` lists open turns across the project's runs with role, work item,
deadline and age. `show` presents the context files in reading order, including
inherited history. `call` and `submit` wait for a result, terminal state or the
bounded wait timeout.

| Action | Exit 0 | Exit 1 | Exit 2 |
| --- | --- | --- | --- |
| `call` | Successful tool result | Tool error or refusal | Action not admitted or result unavailable, including wait timeout |
| `submit` | Accepted submission | Rejected submission | Closed/unavailable turn or wait timeout |
| `end` | Acknowledged end | Not used | No end admitted |

These statuses describe the action, not completion of the work item or plan.

## Mixed execution and compatibility

Capture the base agent and operator role set in each run's agent choice,
supplied through `serve --operator` and `start-run`. Preserve existing `pi` and
`scripted` command/record values. Map standalone/step choices explicitly:
their existing `fake` spelling differs from the run protocol's `scripted`.
Unknown roles are usage errors. Recovery uses the captured choice, never the
current server's role set. Record executor attribution for each invocation.

Select execution by role (R31-1) and compose session operation ports, not
drivers (R31-2): a composite `SessionOperations` port hands each new lineage
whole to pi's existing port or to the operator's port by `task.role`, and every
continuation, fork, retry and stop of that lineage to the same port. Nothing
calls pi directly. Keep each continuation/fork lineage within its compatible executor.
Validate closure before starting, naming roles that must be added. This includes
context selection, scope/design review forks, reconciliation and capability
qualification following their parent's executor. Refuse foreign-driver history
again at dispatch if reached; do not silently drop it or start fresh to permit
an invalid split.

Operator roles have no idle bound. Absolute invocation bounds, review deadlines,
run bounds and stop settlement remain unchanged; pi roles retain their existing
idle bounds too. Record the operator policy. Obtain work identity and deadlines
from the actual harness invocation context and bounds, not a new timer started
when the mailbox appears. Operator usage is unavailable with reason `operator`,
and metrics represent it as a coverage gap.

Use the existing transcript schemas, including Plan 30's started declarations,
messages, tool starts/results, verdicts and termination. Name the executor
`operator` in invocation records. Add no new ledger event/record family for
mailbox state. Preserve the one authoritative session store, exact-source-point
fork semantics, terminal retry, and stop/drain behavior for existing executors.

After a harness change, this plan does not relax ordinary run restoration's
prompt-package identity requirement. Use Plan 30's steps for a new execution
with the current harness and working tree. Exact replay and restoration of old
working trees are not required.

## Architecture constraints and useful starting points

The adopted owner is a new `subs/harness/subs/agent/subs/operator/` module with
`module.ramify`, README, source and owned tests. Expose `createOperatorAgent`
and mailbox schemas to its parent. The operator port identifies itself as
`operator` and binds the caller's session store with the shared engine and
operator driver. Built-in implementations belong to this owner; sharing pi's
implementations is deferred. Supply matching declarations through a legal
parent boundary: pi's declarations are not exposed directly to its sibling.
The root CLI consumes a harness command entry and its signature companions.
No Ramify model or prompt-composition change is part of this work.

Current-source navigation, to verify against the implementation baseline:

- `subs/harness/subs/agent/src/interfaces/session-operations.ts` defines the
  driver/runtime seam. It currently has no dedicated work-item/deadline fields.
- `subs/harness/subs/agent/src/session-operations.ts` owns generic enforcement;
  `scripted.ts` supplies an await/enrichment example, not a required algorithm.
- `subs/harness/subs/agent/subs/pi/src/session-operations.ts` contains private pi
  dispatch, history reconstruction and built-in enrichment. Its port also has
  availability checks around continuation/retry that must remain effective.
- Harness `src/run/service.ts`, `src/run/policy.ts`, protocol run schemas,
  HTTP server setup and session commands own invocation selection and bounds;
  root `src/cli.ts` and `src/main.ts` own command parsing/dispatch. Plan 30 adds
  the step surface this plan consumes.

Inspection at commit `7c32632a` (Plan 30 merged) finds the step surface this
plan consumes, `subs/harness/src/steps/*.ts` and the root `step` subcommands,
and no operator surface. Plan 30 also moved the committing gates, the
after-handling and the review finishing out of `run/service.ts` into
`run/committing-gate.ts`, `run/after-handling.ts` and `run/review-finish.ts`.
The existing architect view describes the generic engine and pi adapter;
absence in that generated view alone is not proof of absence. Recheck the shared
source before execution, including any concurrent Plans 27/29 changes to the
same selection/bounds regions.

## Qualification and delivery

Preserve all O01–O17 obligations in [acceptance](acceptance.md). Their labels
provide conversion traceability, not run-local scenario IDs or iteration
assignments. The executing architect chooses the implementation breakdown.

Follow `docs/testing.spec.md`: ordinary tests drive the mailbox in process with
a test-controlled operator and script external Git, Ramify and audit answers.
Use focused tests, `npm run type-check` and `npm run check:self`. Actual native
claims require registered witnesses under `src/tests/test-boundaries.json`.
When composition changes a pi adapter path, its relevant registered native
preservation witnesses must pass on the final candidate; scripted ports alone
are not provider evidence.

Take a clean committed baseline full audit after Plan 30 qualification, and
qualify the final clean committed candidate with the configured full nested
audit. From the current enclosing repository root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

Document the operator choice, mailbox, CLI, closed-lineage rule and agent-owned
worktree setup in `README.md` and `docs/README.md`. Apply a real plan or bounded
deliverable using a generalist operator through the CLI and pi as engineer.
Retain target project/plan/deliverable, worktree/base, selected roles, resulting
commits, project verification, responsible agent's review, unresolved defects,
elapsed time and available model usage/cost. Keep receipts outside this input
directory and authoritative run records. Successful implementation requires
the target's verification and semantic review as well as harness qualification;
an unrun or discarded attempt leaves that evidence outstanding.

## Resolved decisions

Both were decided by the user on 2026-10-10.

**R31-1: breadth of operator selection — role-level routing with the closed
set.** All review kinds and design orientation share the `reviewer` role, and
scope reviews fork both local and capability architect assignment points, so
selecting the local architect also selects the context selector, the reviewer
and the capability architect. No finer selection by task/review kind or
inherited executor in v1. Scope reviews forked from an operator architect's
point are answered through the mailbox, as O12 exercises; fresh code and design
reviews are the reviewer role too and therefore also go to the operator when
that set is chosen. Finer selection is reconsidered only if playing just the
local architect proves essential.

**R31-2: compose session-operation ports, not drivers.** Nothing calls pi
directly; everything goes through the session operations abstraction ramify-agent
already uses. The composite is a `SessionOperations` port that delegates each
lineage whole to pi's existing port or to the operator's port. Pi's driver stays
private and its built-in enrichment and availability wrappers stay intact, so a
role under test, for example the engineer while the operator plays the local
architect, runs as the complete harness role on pi exactly as in a run without
an operator. The operator owner binds the shared generic engine itself and
receives its tool declarations through a legal parent boundary. The composite
keeps the common store, history, binding, availability, attribution and
lifecycle guarantees above, includes the pi owner where necessary, and
qualifies O17 with the registered native pi witnesses.

Operator-played analysis/nonfunctional roles beyond the permitted selection
rule, cross-driver history translation, and broader run-resumption support
remain outside scope.
