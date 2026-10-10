# Plan 34: execution breakpoints

**Date:** 2026-10-10. **Status:** controls implemented; iteration 4 qualification in progress;
R34-1 and R34-2 resolved by the user on 2026-10-10. **Execution:** serial authored iterations
in an isolated checkout. Source inspected at
`969d8cda574bfc47a1764d052cfd510f95acceab`.

## Outcome

A calling agent launches a real plan, receives control before an engineer
starts, inspects its normal inputs, and chats with that engineer before
resuming implementation. The first message is appended to the ordinary task
prompt. Follow-ups continue the same logical Pi session. The caller can explore
the engineer's understanding using its normal tools, then let the harness
continue through submissions, gates, reviews and architect completion.

This implements the smallest version recommended in the
[breakpoint analysis](../../analysis/2026-10-10-execution-breakpoints.md).
It does not require [Plan 31](../31-operator-driver/main-plan.md), replace its
operator driver, or change its status. The existing Plan 30 constructors and
shared invocation runner are prerequisites already present in the inspected
checkout. Use the existing session operations port; do not expose Pi's private
driver or introduce a second executor.

## Scope and simple choices

- One selector: `before-agent:engineer`. It applies to normal assignments,
  repair invocations and capability-task engineers through the shared executor.
  Each new workflow invocation can stop; debugger follow-ups and internal
  context-loss fallback do not create another stop for the same occurrence.
- Break only between operations, after preparing the ordinary assignment and
  before starting its model call. No interruption during generation or tools.
- Continue the same conversation. No discussion forks, hidden instruction to
  explain rather than work, read-only toolset, special reply tool or new role.
- Reuse `serve`, `real-session`, the HTTP command/event protocol, the ledger and
  existing session records. A short-lived CLI is enough; no MCP, mailbox,
  background-daemon installer or new module is needed.
- CLI and recorded evidence are the supported debugger interface. Existing web
  readers must remain compatible, but live UI integration is outside scope.
- No exact replay, worktree restoration, hot reload, automatic prompt repair,
  accepted-result replacement or benefit benchmark. The caller creates the
  target worktree and performs normal project setup.

Architect orientation, engineer-returned and gate breakpoints are later work.
Their accepted-result and session-lifetime rules should be designed from use
of this first version, rather than generalized in advance.

## Resolved review decisions

The user selected whole-run suspension and live-server-only operation on
2026-10-10. These are the implementation contracts for this first version.

| Decision | Selected behavior | Deferred alternative |
| --- | --- | --- |
| **R34-1: what pauses?** | Suspend the whole run cooperatively: stop new ordinary work, settle admitted work, then return control. | Main-workflow-only suspension would leave reviewers changing state during chat. |
| **R34-2: server restart?** | First version requires the same live server. A disconnected client can reattach; server loss interrupts debug-enabled runs, with records retained and no automatic continuation. | Recovery after server restart would require restoring pending actions, interaction state and command outcomes. |

There are no outstanding review decisions. Implementation discoveries that
materially change these contracts require a new judgment call.

## Ownership and existing seams

All paths below are relative to `ramify-agent/`.

| Owner and current surface | Planned change |
| --- | --- |
| Harness: `src/run/service.ts`, `src/steps/runner.ts` beneath `subs/harness/` | Park a prepared engineer request before execution, keep its workflow continuation pending, run debugger exchanges with ordinary equipment, and release one final result on resume. |
| Harness: `src/run/session-operations.ts` | Compose caller text before immutable operation admission; retain each new conversation point and its briefing ancestry through ordinary operations. |
| Harness: `src/reviews/scheduler.ts`, run deadlines and stop handling | Coordinate suspension, settlement and pause accounting under R34-1. |
| Harness: `src/interfaces/protocol/`, HTTP app and run records | Breakpoint selection, commands, queries, receipts, interaction revisions and event projections. Durable writes remain through the ledger child. |
| Root: `src/cli.ts`, `src/main.ts`, `scripts/real-session.ts` | CLI commands, server attachment, output and bounded polling. Consume the harness's exposed contracts, not its private files. |
| Agent and Pi children | Preserve generic session operations, current enforcement and Pi's existing history persistence. Change only a demonstrated missing contract; do not duplicate these mechanisms in the debugger. |

`InvocationRunner.runInvocation` currently treats a plain return without a
submission as an unsuccessful ordinary task. A debug exchange needs an
explicit pending result at the harness boundary without changing that default.
`HarnessSessionOperations.start` retains an immutable packet before dispatch;
caller text must be included before that retention. Pi already rebuilds a
logical session from stored history, so keeping an SDK object alive between
commands is unnecessary.

`ReviewQueue.close()` is permanent, and completion wakes the queue again.
Run-wide suspension therefore needs reversible admission control, including
timer-driven expiry and overflow, rather than reusing permanent close.

## Behavior to implement

### Prepare, stop and inspect

Capture the selector in the run's start inputs. Unsupported selectors are
refused before starting a run. No selector preserves existing behavior.
Each pause has a stable occurrence ID, interaction revision, run/work-item/
iteration identity, role, task objective and next action. Keep the run's normal
nonterminal job state; expose debugger state separately as `pausing`, `paused`
or `exchanging`. Ordinary execution has no current pause.

Prepare the normal engineer request without invoking Pi. `inspect` presents
the effective role instructions, task prompt, inherited context when present,
current additions, active tool declarations, scope, bounds and source session
point. Reuse recorded packet/history presentation where available. An inherited
block is not an absent block; a preview is not evidence of delivery. Inspection
is read-only and does not allocate a model invocation or consume its bounds.
Revalidate the normal source/context preconditions before execution.

Do not park while holding the run mutex, writer lease or a ledger transaction.
Retain the server's project lock. Do not wait for global settlement from an
invocation-ended callback whose outer cleanup is itself part of that settlement.

### Message and resume

`message` admits one exchange and returns when it is settled. On the first
exchange, append the caller's text verbatim after the ordinary task message;
retain the full normal fresh/fork/continuation inputs, task identity, tools,
guard, hooks and submission validator. Do not rewrite the assignment as a
question. The caller supplies any instruction not to edit or submit.

Follow-ups continue the returned logical session at its latest settled point,
with current normal bindings. Store the caller message and actual delivered
packet as intervention evidence. Carry updated points through harness briefing
ancestry as well as the agent store; otherwise ordinary continuation may lose
the conversation even though Pi retained it.

A plain assistant return during `message` leaves the assignment pending and
retains its session. Determine this from the structured operation outcome, not
the meaning of its prose. No engineer completion, missing-submission repair,
gate, review or next assignment follows while the pause is held. Errors,
context exhaustion, final submission rejection and unsettled tools remain
their real outcomes; do not relabel them as a successful conversation.

If the engineer submits during an exchange, apply the ordinary judge and
record its actual verdict. Hold any accepted action, including partial work
or a capability request, and any terminal failure for ordinary workflow
handling on resume. Further messages after an accepted or terminal outcome are
refused in this first version; `inspect`, `resume` and ordinary stop remain available. This avoids
editing a candidate after the result that describes it has already been
accepted. Resume consumes that outcome once, without another model call.

If there is no held outcome, resume executes the pending task. With no prior
chat it uses the normal input, optionally followed by caller text. After chat
it continues the retained point with the normal task continuation and optional
caller text; it adds no hidden instruction undoing an earlier caller request.
The documented example supplies an explicit “now implement” message. Once
resumed, normal missing-submission and failure handling applies again.

All exchanges are recorded invocations and consume the existing run invocation
and execution bounds. Each model call has normal idle/absolute/context and
submission bounds; explanatory turns do not provide unbounded execution.
Report pause duration separately from invocation time and usage. Writer
ownership is acquired for an exchange and released only after tools settle.
Unconfirmed settlement prevents another exchange, writer or gate.

### Suspension and lifetime

At `pausing`, stop admitting ordinary model calls and review attempts. Let
already admitted calls, tools, review completions and gates settle under their
normal bounds. Only then publish `paused`. A failure during settlement keeps
its ordinary terminal meaning; do not return a usable breakpoint instead.
While paused, admit only the selected debugger exchange or stop. The ordinary
review queue stays suspended throughout that exchange.

Exclude caller waiting time from the run budget. Preserve pending review
budgets while their queue is suspended, including during debugger exchanges.
Already active work keeps its bounds during settlement; debugger calls retain
their own bounds and count toward the run's execution budget. Use controlled
clocks and the existing deadline mechanisms, counting overlapping pause causes
once and never reviving an expired deadline. No queued review expires or
overflows merely because the caller is thinking.

CLI exit or transport loss does not cancel an admitted command or stop the
independently hosted run. Stop takes precedence, closes the pause, settles any
active exchange and wakes waiters with the real terminal outcome. Under the
chosen live-server policy, startup detects unfinished debug-enabled runs
and terminates them through existing interruption/failure recording; it never
re-dispatches their pending effect. Make this decision before ordinary effect
completion, capability reconciliation or workflow restoration, even when the
run had not reached its first breakpoint or had already resumed from one.
Reading and rematerializing existing records does not authorize replaying work.
Retain evidence and distinguish server loss
from successful completion. Runs without debugging retain existing recovery.

### CLI and command protocol

Commands below are proposed additions except `serve`. Run from `ramify-agent/`.
Use the checkout's installed entrypoint; no global executable is assumed.

```sh
npm run serve -- --project "$TARGET" --agent pi --model "$RAMIFY_MODEL" --port 4180
npm run --silent real-session -- --project "$TARGET" --plan export-records --server "$SERVER" --break before-agent:engineer --command-id start-1 --json
./node_modules/.bin/tsx src/main.ts debug inspect --server "$SERVER" --plan export-records --run r1 --pause p1 --json
./node_modules/.bin/tsx src/main.ts debug message --server "$SERVER" --plan export-records --run r1 --pause p1 --expected-revision 1 --command-id message-1 --message-file /tmp/question.txt --json
./node_modules/.bin/tsx src/main.ts debug resume --server "$SERVER" --plan export-records --run r1 --pause p1 --expected-revision 2 --command-id resume-1 --message-file /tmp/proceed.txt --json
./node_modules/.bin/tsx src/main.ts debug wait --server "$SERVER" --plan export-records --run r1 --after 42 --json
```

The caller supplies the target worktree, server URL and model. `serve` needs a
persistent terminal or supervised process. Attachment requires an explicit
project and plan, validates canonical project identity against the server and
uses that server's configured model. Refuse `--model` in attachment mode with
guidance to configure `serve`; never silently ignore it. `--break` requires
`--server`. Without attachment, preserve the launcher's existing owned-server
and fixture behavior. An attached client never spawns or kills the server.

Mutations use the existing HTTP command mechanism. Serialize admission per
pause. A stable command ID and identical request return the prior admission
and result without another effect, even if the interaction revision has since
advanced. Reusing that ID with different content is a conflict. A new command
requires the current pause ID/revision and an idle interaction. Reserve it
before starting the model; a concurrent new message or resume is refused.
Do not hold the serialization mutex during model execution or caller wait.
Persist enough command/intervention identity for inspection and detecting
unfinished work even under the live-server-only policy.

Every return at a breakpoint contains `kind`, `runId`, `pauseId`, `revision`,
`cursor`, role/work context, `taskState` and a concise `summary`. Message results
also include the answer, session identity, submission verdict if any, and
references to tool/transcript evidence. Say what has finished, what remains
pending and what resume will do. Refresh the summary after chat; never continue
saying the engineer has not started. Text and JSON convey the same information.

`resume` acknowledges release without waiting for the next stop. `wait --after`
reads retained events before polling, returns the next reached breakpoint or
terminal result, and includes the current interaction state if that breakpoint
has since progressed. A historical breakpoint is not permission to mutate a
newer pause. Polling drains paginated events and never loses a stop reached
before the command started. Every debug command names the plan as well as
the run: the server's queries, commands and events are plan-scoped, so no
run-only lookup is added.

All waiting commands accept `--timeout-ms` with a documented finite default.
A timeout or disconnected client is not cancellation: return command/run IDs
and the last cursor so the caller can retry the same command or wait again.
JSON mode emits one result object on stdout; diagnostics go to stderr.
Exit 0 means control returned successfully (including a breakpoint or resume
acknowledgment), 1 means a terminal unsuccessful run, and 2 means invalid or
refused command, transport failure or wait timeout. A returned rejection verdict
during a completed exchange is data, not proof that the run completed.

## Specification compatibility

Reviewed the relevant sections of [harness principles](../../harness.principles.md),
[harness specification](../../harness.spec.md) and
[testing specification](../../testing.spec.md). Existing scope, closed role
submissions, validator authority, candidate-bound audit evidence and instruction
delivery remain binding. Caller prose cannot authorize wider writes or make a
task complete. Debug conversation is a control interaction outside the closed
workflow action union, not a new semantic completion result.

Add the opt-in debugger control contract to the harness specification as it is
implemented: pending conversational returns, caller-text delivery, suspension,
retention and chosen restart policy. Preserve immutable admitted packet identities
and ordinary context-loss rules. If context is lost after chat, report the loss
explicitly; never claim the fresh fallback preserved that conversation. Any
permitted fresh fallback must append the current command's caller text to the
rebuilt ordinary task too: rebuilding the brief must not drop that message.
This preserves the current request without reconstructing lost earlier chat.
Keep legacy records readable and default behavior unchanged. No principles or Ramify
model changes are needed.

## Implementation sequence

| Iteration | Deliverable | Depends on |
| --- | --- | --- |
| [1: pause lifecycle](iterations/01-pause-lifecycle.md) | Selection, prepared boundary, records, suspension, resume/stop and server-loss handling through in-process commands | Clean baseline; decisions resolved above |
| [2: engineer conversation](iterations/02-engineer-conversation.md) | Inspection, caller messages, pending returns, session continuation and result handoff | 1 |
| [3: CLI attachment](iterations/03-cli-attachment.md) | Existing launcher attachment, debug commands, receipts, polling and retry behavior | 2 |
| [4: qualification](iterations/04-qualification.md) | Combined workflow, native Pi/CLI witnesses, docs and real-plan exercise | 3 |

The [manifest](iterations/manifest.json) assigns acceptance ownership.
[Acceptance cases](acceptance.md) are behavioral requirements, not proof that
the implementation already satisfies them. At each handoff record changed
contracts, checks and remaining failures in `NN-results.md`; keep results tied
to the candidate commit. Serialize edits to the shared runner and run service.

## Verification

Use focused guarded tests, type checking and module checks per iteration.
Ordinary tests use scripted external answers and controlled clocks. Register
exact native test files/claims in `src/tests/test-boundaries.json` where real
HTTP/CLI processes, provider history or kernel lifetime are the subject.
Do not simulate those boundaries and claim they have been verified.

Take a clean committed baseline and final configured full audit from the
repository root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

The decisive real exercise uses an agent-created worktree of a real target
project and a useful plan. Stop before an engineer, ask for its interpretation
without implementation, follow up, then resume the same session into normal
implementation and project-declared verification. Retain source/model/run IDs,
intervention records, candidate commit and responsible-agent assessment in a
dated note under this harness checkout's `docs/analysis/`. Audit success alone
does not prove useful implementation; failed work remains failed evidence.
No exact replay or before/after benefit study is required.
