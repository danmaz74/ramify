# Plan 31: the operator driver

**Date:** 2026-10-10. **Status:** proposed; implementation not started.
Source inspected at `5bd14875d16bf96ae3c8e0de90661aa3d21cf269`.
**Prerequisite:** [Plan 30](../30-harness-steps/main-plan.md) complete, for
the step inputs, the transcript declarations and the manual run layout.
**Execution:** authored serial iterations in an isolated checkout.

This plan implements Layer C of
[Exercising the harness one step at a time](../../analysis/2026-10-10-step-wise-dogfooding.md).

## Outcome

A real run proceeds with one or more roles played by an outside operator: a
generalist coding agent such as Claude Code, or a person. When the harness
invokes such a role, the operator receives exactly what the model would
receive, acts through the harness's own tools, and submits through the
harness's own submission tool. The orchestration, the guard, the effect
journal, the post-write hook, the judge, the records and the transcript are
unchanged. Other roles in the same run keep running on pi.

```sh
ramify-agent serve --project <root> --agent pi --operator <closed-role-set>
ramify-agent operator pending --project <root>
ramify-agent operator show    --project <root> --turn <run>/<operation>
ramify-agent operator call    --project <root> --turn <run>/<operation> --tool read --input '{"path":"..."}'
ramify-agent operator submit  --project <root> --turn <run>/<operation> --input @submission.json
ramify-agent operator end     --project <root> --turn <run>/<operation> --reason "..."
```

The operator sees at once what the harness records, gates and schedules after
its submission, and a competent architect's input exercises the engineer and
the orchestration around it on a real plan.
The agent creates a worktree in the real target project and performs its
ordinary documented setup, as in Plan 30. The workflow aims to deliver usable
implementation for review and integration; unsuccessful work can be discarded.
There is no fixture-copy or harness-owned preparation step.
The closed role set and runnable example depend on R31-1 below; selecting
`local-architect` alone is not valid under the currently proposed rule.

## Why this scope

Plan 30 lets the operator run a step by hand and run it again after a
fix. It cannot show what the real orchestration decides across many steps,
with concurrent reviewers, review settlement, reconciliation and capability
coordination. The operator driver gives that at the one seam every session
already passes through: `SessionOperationDriver.dispatch(invocation, runtime)`
(`subs/harness/subs/agent/src/interfaces/session-operations.ts:95`). The
guard, the journal, the hook and the judge live in the generic engine
(`subs/agent/src/session-operations.ts:373-433`), so an operator's tool call
is enforced as pi's is. The scripted test driver's `await` step
(`subs/agent/src/scripted.ts:529-542`) already waits on an external promise;
the operator driver replaces its fixed step array with a queue fed by a
mailbox.

What this plan does not change: after a harness fix, a real run still cannot
be resumed, because recovery requires byte-identical prompt packages. A fix
found through the operator is retried with Plan 30's `step run`. Relaxing
restoration is a separate decision.

## Decisions taken

Suggested in the proposal and adopted here; reversible before implementation.

1. **The channel is a file mailbox under the run directory with a CLI.** An
   MCP server over the same actions can follow; the mailbox format
   assumes neither client.
2. **Built-in tools are implemented by the operator owner** with the
   declarations pi already publishes, which the harness uses as the fallback
   for any port (`run/session-operations.ts:218`). Sharing implementations
   with pi is a later refactor.
3. **Roles are routed by a composite driver**, pi or operator per role,
   chosen at `serve` or `start-run`. The operator role set must be closed
   under fork lineage; a configuration that is not is refused.
4. **Operator turns have no idle bound**; the absolute invocation bound, the
   review deadlines and the run bound stay.

## Current implementation and ownership

Paths are relative to `subs/harness/` unless stated.

| Existing surface | Use in this plan |
| --- | --- |
| `subs/agent/src/interfaces/session-operations.ts` `SessionOperationDriver`, `SessionDriverRuntime`, `SessionDriverInvocation` | The engine seam implemented; adapter composition still needs R31-2. |
| `subs/agent/src/session-operations.ts` `createSessionOperations` | The engine the operator port binds, as pi and the scripted fake do. |
| `subs/agent/src/scripted.ts` `createScriptedSessionDriver`, the enrich pattern (`:692-725`) | Template for the operator driver and port wrapper. |
| `subs/agent/subs/pi/src/session-operations.ts` `piBuiltinDeclarations`, history rebuild (`:96-170`) | Declarations reused; the history rebuild is what the operator renders as text for the operator's fresh context, and what a cross-driver fork must refuse. |
| `src/run/policy.ts` `invocationIdleMs` (`:36`), `src/run/service.ts:4509` bounds | Operator-role bounds: idle unbounded, absolute kept. |
| `src/run/service.ts:4672-4673` single cached `HarnessSessionOperations` | Composite driver by `task.role` behind one port. |
| `src/interfaces/protocol/runs.ts` `runAgentSchema` (`:53`), `startRunCommandSchema` | Operator role set in the run agent choice. |
| Root `src/cli.ts` `agentNames`; harness `src/http/server.ts:27, :167-169`, `src/sessions/command.ts` `SessionAgentChoice` | Wiring of the operator choice for `serve`, `start-run`, `session` and Plan 30's `step run`. |
| Plan 30 `steps/runner.ts`, transcript declarations, manual runs | `step run --agent operator` reuses the driver; the mailbox turn carries the declarations the transcript now records. |
| `src/http/app.ts` sessions and transcript routes | Existing ordinary-run views remain available; operator work uses the CLI/mailbox and requires no new UI integration or freshness guarantee. Manual steps follow Plan 30's CLI-first policy. |

## Contract to implement

### The operator owner

A new module `subs/agent/subs/operator/` with `module.ramify`, `README.md`,
`src/` and `src/tests/`, exposing to its parent `createOperatorAgent` and the
mailbox record schemas. It implements:

- **`dispatch`.** Writes the pending turn, waits for actions, applies each
  through `runtime.callTool` or `runtime.submit`, emits the port events the
  transcript expects (`message`, `tool-started`, `tool-finished`), persists
  each action and result through `runtime.persistPayload` so a continuation or
  fork of the session carries its history, and returns `submitted`, `ended`
  or `stopped` (ordinary driver faults remain `failed`). An ordinary rejected
  submission leaves the turn open; a verdict with `final: true` closes it
  without an accepted submission, preserving the judge's rejection bound.
  It resolves its wait on `runtime.signal` and calls `runtime.assertLive`
  before publishing an actionable turn.
- **Built-in tools** `read`, `grep`, `ls`, `find`, `edit`, `write` matching
  pi's declarations, bound only when the invocation declares and activates
  them, and using the engine's ordering: guard, intent, execute, completion,
  `afterMutation`. Reviewers retain snapshot-only tools; historical inactive
  tools cannot be called. Mailbox project edits go through these bindings;
  a path outside the write scope is refused as for pi. An outside coding
  agent must be instructed to use this channel: the mailbox cannot prevent
  that agent's own shell or editor from writing directly.
- **History rendering.** On a continuation or fork, the pending turn carries
  the inherited history rendered as text from the session's persisted
  payloads at the selected source point: initial instructions, prior context
  additions and tool declarations/activation changes, messages, tool calls
  and results, submissions and verdicts, then the current additions and new
  message. Include generic agent payloads as well as operator payloads;
  display events alone do not carry that history. A fork from a pi session or a
  continuation of an operator session by pi is refused at configuration
  time, by the closed-lineage rule, and at dispatch time with the reason if
  reached anyway.

### The mailbox

Under the run directory, `operator/<operationId>/`:

| File | Content |
| --- | --- |
| `turn.json` | project/plan/run identity, invocation, operation, role, work item when present, start mode and point, opened time, effective absolute deadline, status `pending`, `acting`, `submitted`, `ended` or `stopped`, and terminal reason |
| `instructions.md` | the role instructions, or for a continuation the additions |
| `history.md` | the rendered inherited history, absent for a fresh start |
| `message.md` | the task message |
| `tools.json` | the active tool declarations and the submission tool with its schema |
| `actions/NNN.json` | one operator action: `call`, `submit` or `end`, with stable action ID, published atomically without replacing another action |
| `results/NNN.json` | the harness's answer: the tool result, the submission verdict with its text, or the refusal |

The driver watches `actions/` and answers in order. The CLI writes an action
only when the turn is `pending` or `acting`. Standalone and manual runs use
the same layout under their directories.
Serialize sequence allocation and publication per turn, so two CLI processes
cannot choose and overwrite the same number. Recheck open status when the
driver admits each action, not only when the CLI reads it. Use the stable
action ID for the engine call ID; replaying an admitted action must not execute
its effect twice. Scan already published actions before waiting and after
wake-up, rather than depending on delivery of a filesystem-watch event.

When submission, end or stop closes the turn, settle/refuse queued actions
before dispatch drains. The CLI also observes terminal state while awaiting
a result, so an action racing with closure cannot wait forever after the
watcher exits. Expose a bounded CLI wait (`--timeout-ms`); a wait timeout
reports the action ID and leaves its execution status unknown, never claiming
that it was cancelled or safe to resubmit under a new ID. Server restart
follows existing run recovery; stale mailbox status alone does not reopen a
turn or authorize effects.

### The CLI

`ramify-agent operator` with `pending`, `show`, `call`, `submit` and `end`,
as in the outcome. `pending` lists turns across the project's runs with role,
work item, deadline and age. `show` prints the turn's files in reading order,
including inherited history for a continuation/fork. `call` and `submit` block
until a result, terminal state or wait timeout and print the outcome. Always
include inherited history for continuation/fork execution context; `--history`
may explicitly request it, but it must not be opt-in to seeing the context
the operator is expected to act on. `call` exits 0 for a successful tool
result, 1 for a tool error/refusal, 2 when the action cannot be admitted or its
result is unavailable. `submit` exits 0 for accepted, 1 for rejected, 2 for
a closed/unavailable turn or wait timeout. `end` exits 0 for acknowledged end,
2 if no end was admitted. These statuses do not imply workflow completion.

### Routing and bounds

- `runAgentSchema` gains the operator choice: the base agent and the set of
  roles the operator plays. `serve --operator <roles>` and `start-run` carry
  it; `session` and `step run` accept `--agent operator`.
  Preserve existing `pi` and `scripted` record/command values. The composite
  choice is captured per run, including its role set, rather than inferred
  from the currently running server. Standalone `SessionAgentChoice` and
  step choices are mapped explicitly; they already use `fake`, not the run
  protocol's `scripted` spelling.
- A composite driver dispatches by `task.role`. The configured operator set
  is validated against the fork lineage of the roles: the selector fork of
  the local architect, the scope and design review forks, reconciliation and
  the capability qualification follow their parent's driver. A set that
  splits a lineage is refused before the run starts, naming the roles to add.
- For operator-played roles, `invocationIdleMs` does not apply; the absolute
  invocation bound, review deadlines, `runAbsoluteMs` and stop settlement
  apply unchanged. The bounds record names the operator policy. Supply turn
  metadata and the effective deadline from the harness's actual bounds and
  invocation context; the driver interface currently carries no work-item
  identifier or absolute-deadline field of its own. Do not reset the deadline
  when dispatch publishes the mailbox.
- Usage for operator turns is recorded as unavailable with the reason
  `operator`; metrics treat it as a coverage gap, as they do today for a
  missing usage.

### Records

Nothing new in the ledger. The transcript records operator turns as it
records pi's: the `started` entry with declarations, messages, tool calls and
results, verdicts and the end. The invocation record names the executor
`operator`. The mailbox is raw output, like the transcript, never a record.

## Failure cases the design must prevent

| Problem | Required behavior |
| --- | --- |
| An operator edit bypasses the guard or the hook | Edits go through the built-in tools and the engine; the CLI has no other write path |
| A pi fork of an operator session loses the operator's turns | Closed-lineage validation refuses the configuration; dispatch refuses with the reason |
| A slow operator ends the invocation as `idle-timeout` | No idle bound for operator roles; the absolute bound and deadlines stay and are printed in `turn.json` |
| Two operators act on one turn | Atomic serialized publication loses/overwrites no action; admission is rechecked and stable call IDs prevent repeated effects |
| The operator submits without the context a model would have | `turn.json` names the start mode; a continuation carries the rendered history and the additions, not the instructions alone |
| A stopped run leaves the operator waiting | Dispatch drains admitted calls, publishes terminal state and settles queued results; CLI wait observes closure/timeout even after the watcher exits |
| The mailbox is mistaken for a record | It lives beside the transcript as raw output, outside the ledger and the recovery scan |

## Relationship to other work

- Plan 30 supplies the step inputs, the runner, the declarations in the
  transcript and manual runs. `step run --agent operator` is the single-step
  form of this plan and needs no mailbox change.
- [Plan 23](../23-session-reuse-and-run-efficiency/main-plan.md) defined
  continuation and fork; the closed-lineage rule follows from its exact
  source points.
- Plans 27 and 29 touch `run/service.ts`; serialize edits to the agent
  selection and bounds regions if in flight.

## Implementation sequence

Resolve R31-1 and R31-2 before their dependent implementation work; the
current source does not yet expose the proposed composite-driver seam.

| Iteration | Deliverable | Prerequisite |
| --- | --- | --- |
| [1: the operator owner](iterations/01-operator-owner.md) | Driver, built-ins, history rendering, mailbox records, port wrapper; in-process tests through the mailbox | Plan 30 complete, baseline full audit |
| [2: CLI, routing and bounds](iterations/02-cli-routing-bounds.md) | `operator` commands, composite driver, closed-lineage validation, operator bounds, agent choice wiring | 1 |
| [3: qualification](iterations/03-qualify.md) | Scripted whole-work-item test with the operator as local architect, documentation, final audit, real-plan implementation | 2 |

The [manifest](iterations/manifest.json) records dependencies and case
ownership; the [acceptance cases](acceptance.md) distinguish deterministic
harness checks from real implementation evidence.

## Verification and boundaries

Follow the [testing specification](../../testing.spec.md). Ordinary tests
drive the mailbox in process with a test-controlled operator; no model, Git,
Ramify or audit is launched. Each iteration runs `npm run type-check`, the
changed owners' focused tests and `npm run check:self` from `ramify-agent/`.
Baseline and final full audits use:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

Iteration 3 applies real planned work in an agent-created project worktree.
Record the implementation, its project-declared verification, responsible
agent's review and model cost; harness test health alone does not establish
successful implementation.

Outside scope: an MCP server over the mailbox, serving the mailbox over HTTP
or in the web client, resuming a real run after a harness change, sharing
built-in tool implementations with pi, operator-played analysis and
nonfunctional roles beyond what routing allows, and any change to the model
or to prompt composition.

## Open review decisions

- **R31-1 — High: how broad should operator selection be?** All three review
  kinds and design orientation use the single `reviewer` role. Scope reviews
  fork either local or capability architect assignment points. With strict
  routing by role and no cross-driver history, choosing local architect
  therefore also requires context selector, reviewer and capability architect;
  it cannot leave scope reviewers on pi. Choose this larger closed role set,
  or introduce finer selection by task/review kind or inherited executor.
  Recommendation: keep role-level routing for v1 if the larger set is
  acceptable. Iterate on selection only if playing just the local architect
  is essential. Update the CLI example, lineage matrix and O12 exercise to
  the chosen rule before iteration 2; do not silently fall back fresh merely
  to allow a split lineage.
- **R31-2 — High: compose drivers or ports?** The pi driver is private to
  `pi/src/session-operations.ts`; its port binds an already constructed engine,
  with private built-in enrichment and model-availability checks around
  continue/retry. A composite `dispatch` cannot call that port as a driver or
  bypass those wrappers. Choose an adapter-owned driver/binding factory
  exposed to the agent parent, or a composite `SessionOperations` port which
  delegates each lineage to its existing adapter. Recommendation: keep pi's
  wrappers intact through port composition unless a shared-engine extraction
  is independently desired. Whichever is chosen must retain one authoritative
  session store, exact-point forks, terminal retry, stop/drain behavior and
  per-invocation executor attribution. Include the pi owner in that work's
  boundary and verify native pi preservation on the final candidate. Also
  supply declarations through a legal parent boundary: `piBuiltinDeclarations`
  is exposed to the agent parent today, not to its operator sibling.
