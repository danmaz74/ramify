# Execution breakpoints and conversation with paused agents

## Request

Analyze configurable breakpoints during real plan execution: before an engineer
starts, after it returns, after local-architect orientation, and other useful
handoffs. At a breakpoint the launching agent receives control, can exchange
messages with the relevant Pi conversation, and can resume orchestration.

Question type: discovery and proposed placement. Requesting module: none; the
consumer is an outside supervising agent. This is analysis, not an approved
implementation plan or a change to Plans 30/31.

## Answer

The architecture supports a practical version: pause at stable workflow
boundaries and run explicitly recorded discussion turns against retained
sessions. It does not currently expose a general interactive debugger.

Recommend cooperative workflow breakpoints first. Most requested locations are
between settled invocations. Arbitrarily interrupting a model stream or a
running tool introduces a different problem involving cancellation, incomplete
effects and recovery. It is unnecessary for the first useful version.

The feature keeps Pi playing its role while the supervising agent questions or
guides it. Plan 31 instead lets the outside agent perform the role itself.
Those modes are complementary; breakpoint support need not depend on completing
the operator driver. Plan 30's shared constructors and runner are already
present in this checkout, although its real-plan qualification remains open.

## Evidence

- The shared `InvocationRunner` prepares inputs, executes a session, settles its
  tools/writer and records the result. Ordinary execution calls it before
  applying the result to subsequent workflow. This is a useful separation
  between execution and orchestration, not a ready-made pause API.
  See `steps/runner.ts:444`, `:629`, `:845`, `:934` and
  `run/service.ts:8264`/`:8469`.
- Local orientation is recorded before context selection. The selector receives
  the recorded orientation point explicitly, and the selected package is then
  appended to the architect. See `run/service.ts:4667`, `:4686`, `:4726`.
- `SessionOperations` offers create, continue, fork, appendContext, changeTools,
  inspect and stop. A continuation requires an idle session and the expected
  current point. It also requires an active designated submission tool.
  See agent `interfaces/session-operations.ts:120` and
  `session-operations.ts:171`–`:187`.
- The Pi adapter reconstructs a session from persisted messages for a dispatch,
  drives it, and disposes the SDK session afterward. A retained conversation
  survives; the same live SDK object does not. Plain assistant completion returns
  `ended`; accepted workflow submission returns `submitted`.
  See pi `session-operations.ts:213`, `:349`–`:357`.
- The initial-analysis review stop already holds a project while awaiting a
  command, and run-time accounting excludes that review wait. It provides a
  precedent for caller-controlled suspension but no dialogue facility.
  See `run/service.ts:711` and `:4277`.
- Reviews run concurrently with the writer; queue completion can start another
  review and enforce deadlines. Pausing one orchestration await does not pause
  the run. See `reviews/scheduler.ts:1`–`:18`, `:72`–`:116`.
- `PausableDeadline` already excludes overlapping waits once, and invocation
  bounds use it for machine-test-lock waits. That utility is reusable; it does
  not yet provide debugger-wide timing semantics. See `run/pausable-deadline.ts`
  and `run/port-events.ts:363`–`:385`.
- The current `real-session` launcher exits its loop when the run is no longer
  running and terminates its child server in `finally`. Simply returning a new
  paused status would therefore stop the host. See `scripts/real-session.ts:111`
  and `:123`.

## Where to stop

Names below are illustrative configuration labels, not existing commands.
Use a small explicit vocabulary with optional work-item/iteration filters;
arbitrary source-line breakpoints or executable condition expressions are not
needed. Match every occurrence unless configured otherwise, including repair
and post-handback engineer invocations where selected.

| Breakpoint | Boundary and useful evidence | Conversation target and purpose |
| --- | --- | --- |
| `analysis.ready` | Accepted intake/catalog and initial architecture, before readiness and implementation | Initial architect: inspect missing requirements, placement and acceptance. Existing review-stop behavior is a starting point. Accepted analysis is already recorded, so revising it needs an explicit supported path. |
| `local.orientation.returned` | Orientation invocation settled and its packet recorded, before selector fork | Local architect: test its understanding, discoveries and questions before downstream context selection. This is the strongest first breakpoint. |
| `context.selected` | Selector answer recorded, before package append and assignment | Selector or local architect: inspect omitted constraints and irrelevant context. Chat alone does not replace the recorded selection. |
| `engineer.before` | Assignment and proposed engineer inputs available, before normal engineer task dispatch | Inspect scope, requirements, API views, tools and bounds; discuss the assignment with its architect or the prepared engineer. Covers ordinary and capability-task engineers. |
| `engineer.returned` | Invocation, tool processes and writer settled, outcome/submission retained, before result-dependent handling | Engineer: examine the diff, problems and completion claim before bindings, gate or capability dispatch proceed. Submission acceptance and tool effects have already happened. |
| `gate.returned` | Candidate-bound check result durable, before repair/closure branch | Engineer or issuing architect: understand failures and judge the next action. The gate itself has no Pi session. |
| `capability.requested` / `capability.handback` | Settled provisional candidate and request; or verified provider/consumer handback before parent resumes | Requesting engineer or capability architect: examine the original need, reuse, scope and actual integration. |
| `reviews.ready` | Required reviews settled, before reconciliation decisions | Issuing architect or a named reviewer: evaluate concerns and the candidate they describe. Pausing after each individual review is a later useful option. |
| `completion.ready` | Architect completion/NFR assessment available, before final progression | Responsible architect/assessor: check the delivered result and unresolved deviations. Preserve the distinction between semantic judgment and audit health. |

Start with the before-agent boundary using the message-append behavior below.
Orientation-returned and engineer-returned are the next useful handoffs, followed
by gate-returned for repair investigation. Do not make all locations mandatory
or enable them all by default.

## Discussion and its effect on execution

Expose the breakpoint's run, work item, task/phase, pending next action, outcome
references and available session targets. The caller sends a message to a named
target, receives the response and may repeat; resume advances to the next
configured breakpoint or completion. Use the current command/event protocol
behind a CLI. Each message/resume names the breakpoint and expected revision so
a delayed caller cannot act on a later pause. There is no UI requirement.

**Same conversation.** Continue the retained logical Pi session, record the
messages and resulting point, then resume workflow from the updated point.
This fulfills ordinary chat expectations without retaining a live SDK object
between invocations. A fresh fallback must be explicit when the conversation
is unavailable; it cannot claim to be the interrupted conversation.

**Start breakpoint: ordinary prompt plus the caller's message.** User clarification
on 2026-10-10 replaces the proposed separate discussion mode. Prepare exactly the
context, task, tools and authority the agent would normally receive, pause before
dispatch, and let the debugger user append a message after the ordinary task
prompt. For a continuation, preserve inherited context and append after the
normal new task input. Keep the original input and the additional message
separately identifiable in the evidence; finalize the dispatched input with both,
rather than editing an already recorded immutable operation intent.

For example, the caller could append: “Before implementing anything, explain your
understanding of the goal, which constraints apply, where you would look first
and what is uncertain. Do not edit files or submit completion yet.” The debugger
does not add that instruction automatically. It is the caller's responsibility
to ask for explanation, exploration or normal execution. The agent retains its
ordinary tools and submission tool, with the same guards, hooks, judge and
bounds. There is no special read-only loadout or debugger reply tool. This
preserves the setup whose behavior and point of view the caller wants to explore.

**Explanatory replies.** A response without a workflow submission must remain
visible as a conversational return with the task still pending. The debugger
keeps control so the caller can follow up or authorize normal execution; it does
not infer completion from prose or immediately pass that return into the ordinary
missing-submission failure path. This requires a small lifecycle distinction
around the existing invocation result, even though prompt injection is simple.
An actual submission still goes through the ordinary judge and is recorded as
such. Debugger follow-ups must not recursively hit the same start breakpoint.

**Point propagation.** Advancing a session is insufficient by itself. After
orientation, the selector currently forks the point in the orientation record.
If a conversation advances the architect, its later selection and assignment
must use an explicit updated continuation point. Preserve the original event
as evidence and record the intervention separately; do not rewrite history.
Likewise maintain the harness's briefing-ancestry correlations for discussion
points, otherwise ordinary continuation cannot resolve its inputs.

**Before a fresh engineer exists.** This pause has an assignment, not an
interrupted engineer conversation. Its first invocation receives the ordinary
engineer prompt followed by the debugger user's message. No preliminary
discussion-only task or substitute architect conversation is needed. A resumed
engineer receives the additional message with its normal continuation input.

**After an accepted answer.** Conversation can explain or challenge the result,
but cannot replace its accepted submission by changing a file or a return value.
Resume applies the recorded result unless a supported corrective action runs a
new validated work turn or replans. Some roles normally finish their logical
sessions immediately; configured breakpoints need deliberate session retention
or an explicitly identified discussion fork before disposal of workflow handles.

Caller-directed exploration or edits through the agent's normal tools retain
writer ownership and enforcement. Asking for no edits is a conversational
instruction, not a new sandbox. Accepted workflow decisions and candidate-bound
evidence still cannot be silently replaced; correction after acceptance remains
a separate question from appending a message before the first task invocation.

## One API use case: question an engineer before letting it implement

The caller has prepared a real project's worktree and a plan to add CSV export.
In this successful example the harness derives one engineer assignment and needs
no repair invocation. The caller wants to explore that engineer's understanding
before allowing implementation. All commands run from the harness checkout's
`ramify-agent/` package directory, through the caller agent's ordinary shell tool.
No MCP server is needed.

Every command that returns control at a breakpoint includes a short description
of where execution is, not only opaque IDs. Identify the breakpoint/phase, role,
work item and iteration when applicable, and the task's goal. Say what has just
finished or has not started yet, and what resuming would do. JSON output includes
this description as `summary` alongside the structured identities; text output
prints the same description. The caller should not need an `inspect` call merely
to understand why control returned.

For the first stop in this scenario:

```text
Paused before engineer implementation — export-records, work item w1, iteration i1.
Task: implement CSV export with the required column order.
The assignment is prepared; the engineer has not been invoked yet.
You can inspect the prompt or send a message. Resume starts the assigned work.
```

After a debugger message, refresh that description rather than repeating the
initial location: “Engineer s1 answered your question about column order; work
item w1 / iteration i1 remains paused. No completion submission was accepted.
You can send another message or resume implementation.” If a submission was
accepted, report that instead and name its pending workflow handling. The same
rule applies when `wait` returns at a later breakpoint.

Reuse the existing `serve` command to host the project and the existing
`real-session` command to start the plan. **The debugger commands and the
`real-session` options `--server`, `--break`, `--command-id` and `--json` below
were proposed additions when this was written; Plan 34 implemented them,
and the README's "Engineer breakpoints on a live server" has the current
commands, which also name the plan.** Server attachment must
bypass the script's current spawn/kill lifecycle: returning at a breakpoint must
leave the independently running server alive. The attached server must serve
the explicitly named project; a mismatch is an error.

The examples use `TARGET=/absolute/path/to/target-worktree` and
`SERVER=http://127.0.0.1:4180`. Set them in each command environment as needed;
separate agent shell calls need not share environment variables. The model is
selected when starting the server. The `tsx src/main.ts` form uses this
checkout's installed CLI entrypoint without assuming a globally installed
`ramify-agent` executable.

The caller writes three ordinary UTF-8 message files outside the captured plan
input directory:

- `/tmp/ramify-debug-question.txt`: “Before implementing, explain the requested
  behavior, relevant constraints, APIs you would investigate and your
  uncertainties. Do not edit files or submit completion yet.”
- `/tmp/ramify-debug-followup.txt`: “You mentioned a serialization helper.
  Inspect it and explain whether it preserves the required column order.
  Still do not edit or submit.”
- `/tmp/ramify-debug-proceed.txt`: “Now implement the original assignment using
  what you learned, verify it and submit your result.”

| Step | Caller CLI invocation | Harness response and effect |
| --- | --- | --- |
| 1. Host the project | `npm run serve -- --project "$TARGET" --agent pi --model "$RAMIFY_MODEL" --port 4180` | Existing command. Prints its address and remains running in a persistent terminal or supervised process. The caller issues the following commands separately; starting the server alone does not start the plan. |
| 2. Launch and wait for control | `npm run --silent real-session -- --project "$TARGET" --plan export-records --server "$SERVER" --break before-agent:engineer --command-id start-1 --json` | Reuses the plan launcher with the proposed attachment/breakpoint options. Runs normal analysis and planning, then returns `{ kind: "breakpoint", runId: "r1", pauseId: "p1", revision: 1, cursor: 42, role: "engineer", workItem: "w1", iteration: "i1", summary: "Paused before engineer implementation: implement CSV export with the required column order. Assignment prepared; engineer not yet invoked. Inspect, message, or resume to start work." }`. This is a successful return of control, not run completion; the server remains alive. |
| 3. Inspect | `./node_modules/.bin/tsx src/main.ts debug inspect --server "$SERVER" --run r1 --pause p1 --json` | Returns the ordinary prepared instructions and task prompt, tool declarations, scope, bounds and next action, with `revision: 1`. This fresh engineer has no conversation yet. |
| 4. Ask before acting | `./node_modules/.bin/tsx src/main.ts debug message --server "$SERVER" --run r1 --pause p1 --expected-revision 1 --command-id message-1 --message-file /tmp/ramify-debug-question.txt --json` | Launches the engineer with its normal full input followed by the file's message, retaining ordinary tools and authority. Returns its answer, `sessionId: "s1"`, `revision: 2` and `taskState: "pending"` after the turn settles. Orchestration remains paused. |
| 5. Explore its viewpoint | `./node_modules/.bin/tsx src/main.ts debug message --server "$SERVER" --run r1 --pause p1 --expected-revision 2 --command-id message-2 --message-file /tmp/ramify-debug-followup.txt --json` | Continues `s1`, performs permitted reads through normal harness tools, and returns the answer and tool evidence with `revision: 3`. The ordinary task is still pending; both exchanges are retained in the conversation. |
| 6. Let it work | `./node_modules/.bin/tsx src/main.ts debug resume --server "$SERVER" --run r1 --pause p1 --expected-revision 3 --command-id resume-1 --message-file /tmp/ramify-debug-proceed.txt --json` | Acknowledges the resume and continues `s1` with the file's caller-authored message. The harness releases the workflow to consume the eventual validated result. This same start breakpoint occurrence is already handled, so it does not immediately stop again. |
| 7. Await the outcome | `./node_modules/.bin/tsx src/main.ts debug wait --server "$SERVER" --run r1 --after 42 --json` | In this example returns `{ kind: "completed", result: ... }` after ordinary engineer submission, gates, reviews and architect completion. The result points to commits, verification and recorded interventions. Another scheduled engineer task would instead return control at the next matching breakpoint. |

The short-lived CLI processes communicate with the existing HTTP command/event
protocol; the server owns run and conversation state across all seven steps.
`message` means “run one conversational exchange and return control here”;
`resume` means “release this pause and continue the workflow,” optionally adding
text from `--message-file`. The CLI can poll events while awaiting a model answer;
no single HTTP request has to remain open throughout model execution. `wait`
returns the next fully reached breakpoint or terminal outcome, and `--after`
prevents missing an event that arrived before the caller began waiting.
`--expected-revision` identifies the paused interaction revision; stable
`--command-id` values distinguish retrying a request from sending a new one.

The example's requests for explanation and no edits come entirely from the
caller. The debugger adds no hidden instruction or restricted discussion toolset.
Explanatory returns leave the assignment pending. If the engineer actually
submits during a message exchange, the CLI must expose that accepted/rejected
submission rather than label it merely an answer; acceptance retains its normal
meaning, while subsequent orchestration still waits for resume. Exiting any
client command leaves the independently hosted run available for the next call.

## Suspension, concurrency and lifetime

Recommend run-wide cooperative suspension: stop admitting new ordinary work,
let admitted work settle, then report the run as paused. Make `pausing` distinct
from `paused`; the caller must know whether background work can still change
state. Gate/audit work already underway settles too. Active model/tool calls
retain their execution bounds during settlement. A reader may commit its
already-running review before the pause is fully reached.

The review queue must stop both new attempts and timer-driven expiry/overflow
progression while paused. Do not hold a run mutex, an effect transaction or
the writer lock while awaiting the caller. In particular, blocking inside the
existing `afterWrite('invocation-ended')` callback leaves the invocation's
outer cleanup pending; a barrier that then waits for all live invocations can
wait on itself. Put the workflow wait after settlement/cleanup, or explicitly
exclude parked operations from that barrier.

Exclude operator thinking time from run and pending-review budgets. At the
initial three boundaries there is no active task invocation whose timer needs
freezing; discussion turns get their own bounds. Track pause duration and
discussion usage separately from automatic execution. Reuse existing deadline
mechanisms where applicable, without allowing a pause to revive an expired run.

Returning control means returning a breakpoint receipt to the launching client,
not terminating the harness server. Keep a persistent server/project lock and
provide wait-until-breakpoint-or-terminal behavior. The present launcher's
server lifetime must change or it must use an independently running server.

Persist enough state to know which boundary is paused, what result is pending,
which conversation point is current and which resume commands were accepted.
Repeated resume commands must not apply a result twice. A disconnected caller
leaves a visible paused run that can be reattached to or explicitly stopped.
Restoration remains subject to existing compatible-source/prompt rules; this
proposal does not imply hot-reloading a changed harness into a paused run.

## Placement and alternatives

Preserve the current module tree for the initial feature. The harness owns
breakpoint selection, run coordination, pending actions, intervention records,
command protocol and updated session references. The agent module retains
generic session execution and enforcement; Pi retains provider history and
transport. The same engine should execute the agent with its ordinary bindings
and the additional caller message. No new owner is justified by the current evidence.

The strongest alternative is putting pause/steer controls inside the Pi driver.
That could support interruption during generation, but it cannot decide what
to do with an accepted architect result, a committed gate, queued reviews or
the run's next action. It also introduces provider-specific in-flight semantics
where the requested handoffs already have durable boundaries. Defer it until
actual use shows that between-invocation control is insufficient.

A discussion fork is another option: questions do not affect the workflow
conversation unless a concise instruction is explicitly carried back. It is
useful for detached diagnosis, but continuation is the closer default for the
requested normal-chat behavior. Make branch choice explicit if both are added.

## Relationship to Plan 31 and recommended order

Compared with the current [Plan 31 execution input](../../plans/31-operator-driver/plan.md),
which resolves role-level selection and session-operation port composition:

| Question | Breakpoints and caller messages | Plan 31 operator driver |
| --- | --- | --- |
| Who performs the role? | Pi, with normal context and equipment plus caller messages. | The outside agent/person, using exposed harness tools and submissions directly. |
| Main purpose | Understand and improve Pi's interpretation, exploration and decisions while exercising the real workflow. | Supply the decisions/actions externally and exercise how the surrounding harness handles them. |
| Intervention granularity | A selected handoff or invocation; Pi retains its lineage. | A configured role set closed under fork lineage. Local-architect selection also selects context selector, reviewer and capability architect. |
| New mechanism | Workflow pause/resume, appended messages, conversational returns and updated session points through the existing server. | Operator adapter, built-in implementations, action/result mailbox, history rendering and composite session-operation ports. |
| Waiting policy | Proposed exclusion of caller pause time from relevant execution budgets. | Removes operator idle bounds but retains absolute invocation, review and run deadlines. |

**Plan 31 is not a prerequisite.** Start breakpoints can use the existing Pi
port and ordinary tool bindings. They need no operator adapter, mailbox or
cross-executor selection. Conversely, Plan 31 can wait for operator actions
without implementing conversational debugging or a run-wide pause. The features
have no necessary dependency on each other, although both touch session lifecycle,
context presentation, command handling and stopping behavior.

**The debugger does not fully supersede Plan 31.** Asking Pi to use a tool or
submit a supplied decision still delegates that action to Pi. Plan 31 permits
the caller to do it directly through the harness's validators. It remains
useful when the experiment requires taking over a role, avoiding model calls
for that role, or supplying a known architect decision to isolate the behavior
of the engineer and orchestration. Breakpoints better serve the current aim of
exploring Pi's point of view. Much of that aim can be met without operator
replacement, so Plan 31 may become unnecessary in practice for this workflow.

**Recommendation: implement the smallest debugger first; defer Plan 31.**
Use before-engineer prompt inspection, caller-message injection, follow-up and
resume on real work, then decide whether direct role replacement is still
needed. The restricted scope avoids Plan 31's adapter/tool implementation work;
it does not make session continuation or pause coordination trivial. Broader
concurrent breakpoints still need their own lifecycle work.

Reuse existing session, record, guard and CLI conventions where they fit. Do not
build a generalized shared debugger/operator framework as a prerequisite. If
Plan 31 is later pursued, reconcile its mailbox transport and waiting policy
with the actual debugger experience rather than assuming they are interchangeable.
Implementations touching the same lifecycle paths should be coordinated even
though neither feature is a functional prerequisite for the other.

This is a sequencing recommendation. Plan 31 remains a separate plan; this
analysis does not mark it cancelled, superseded or implemented.

## Decisions to make

The start-breakpoint interaction is now specified: ordinary prompt and equipment
plus a caller-authored message, with behavioral direction left to that caller.
The following questions concern the broader debugger, beyond that first step.

1. Should breakpoint chat influence later work by default? Recommend continuing
   the logical session, with updated point propagation; use explicit forks for
   detached diagnosis.
2. Should all ordinary execution pause? Recommend run-wide cooperative suspension
   for a stable debugger experience, with visible settlement before control.
3. Can the caller ask for immediate corrections to accepted work? Recommend
   discussion plus unchanged resume first; add an explicit new validated
   correction/replan action rather than silently replacing accepted output.
4. Should this precede operator replacement? For questioning Pi while testing
   the harness's own decisions, it is more directly useful than Plan 31.
   Changing the implementation priority remains the user's choice.

## Method

Inspected checkout HEAD `969d8cda574bfc47a1764d052cfd510f95acceab`, with existing
uncommitted Pi adapter changes preserved. Refreshed architect revision
`rev/1:142b4a2d-9a99-4069-a906-a506987c36de:1`; 13 modules, measured dependencies,
1,309 cut records, 11 unavailable details, 28 dynamic titles and 4 coverage
entries. Followed candidate signatures into source where lifecycle details
were not available from the generated view.

Applied `module-architect` references: discovery, placement, cognitive
decomposition and report guidance. The open status-badge repeat postmortem was
used as a concrete example of the orientation/selection/engineer/review handoffs,
not as evidence of the current runtime's implementation status.

Source files read/searched for this investigation, relative to ramify-agent:

- `subs/harness/src/run/service.ts`
- `subs/harness/src/run/session-operations.ts`
- `subs/harness/src/run/pausable-deadline.ts`
- `subs/harness/src/run/port-events.ts`
- `subs/harness/src/steps/runner.ts`
- `subs/harness/src/steps/constructed.ts`
- `subs/harness/src/steps/after.ts`
- `subs/harness/src/reviews/scheduler.ts`
- `subs/harness/subs/agent/src/interfaces/session-operations.ts`
- `subs/harness/subs/agent/src/session-operations.ts`
- `subs/harness/subs/agent/subs/pi/src/session-operations.ts`
- `scripts/real-session.ts`

## Not verified

No runtime implementation, tests, audit or model invocation was performed.
Generated discovery has the coverage limits above; no general breakpoint/chat
API was found in the inspected paths, which is not proof of absence everywhere.
The proposal's concurrency barrier, conversational returns and propagation of new
session points need focused scripted checks and a registered live Pi witness.
No performance benefit or exact replay capability is claimed.

## Next step

Specify the smallest start-breakpoint version. Its decisive witness should
prepare a real engineer task, append a caller message asking for explanation
before action, retain the answer with the task pending, then continue the same
conversation into ordinary implementation and verification. Verify that the
normal briefing and tool authority are retained, the injected message is
recorded, and an explanatory return cannot be mistaken for completed work.
Broader handoffs, corrective actions and concurrency can be added from actual use.
