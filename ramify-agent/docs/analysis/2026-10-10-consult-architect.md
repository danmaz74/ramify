# Consult architect

**Date:** 2026-10-10. **Status:** implemented on `feat/plan33-consult-architect`;
iterations 1–3 accepted, integrated scripted workflow and Pi transport witnesses
pass. Exact-candidate configured full nested qualification is pending iteration 4.

[Plan 33](../plans/33-consult-architect/main-plan.md) translates this proposal
into four serial implementation iterations. It records the selected simple
defaults and the decision to include capability-assigned engineers; the iteration receipts record actual implementation evidence. The source
inspection below remains historical provenance, not a current qualification.

## Purpose

An engineer sometimes needs an explanation or research help from the local
architect that assigned its work. The architect has broader context and the
reasoning behind the assignment. Likewise, a local architect may benefit from
the global architect's context.

`consult-architect` lets either caller send a question to a fork of its
supervising architect and receive the answer in its current session. The fork
starts from the recorded point at which that architect dispatched the caller's
work. This preserves the context relevant to the assignment without advancing
the original architect's conversation.

The original working name was “ask architect.” Dan proposed “consult-architect”
to make the advisory purpose explicit; this analysis adopts that name. The
exact spelling of the Pi tool identifier remains an implementation detail.

## Decisions so far

Dan clarified that this is only a consultative operation. Its purpose is to
make understanding and research easier where the architect has better context.

- Engineers consult their local architect. Local architects consult the global
  architect through the same mechanism.
- The harness forks the architect from the point where it dispatched the
  caller's work, sends the question, and returns the answer to the caller.
- The operation is advisory. It does not change source, assignments, scope,
  permissions, architectural decisions or the original architect session.
- The tool must describe this advisory purpose to the agent that can use it.
- Consultation is an ordinary asynchronous harness tool exposed to Pi. Its
  handler runs the architect fork, awaits the answer, and returns the tool
  result. Use the existing cancellation signal and normal tool lifecycle;
  no special caller suspension/resumption workflow is needed.
- Keep the design simple. Dan described the non-mutation expectation as a
  “gentlemen's agreement”; it does not justify a new enforcement framework.
- Logging is a core requirement. Dan wants to analyze when and how consultation
  was used during a session and evaluate how well it performed. Finding the
  exchanges and their execution evidence must be easy.
- Include one level of nested consultation from day one if it stays simple:
  the local architect answering an engineer may consult the global architect.
  The source inspection below supports including it with the same tool handler
  and existing session operations.
- Dan also selected support for capability-assigned engineers consulting their
  assigning capability architect in the first version. That architect is a
  distinct role, not an alias for a local architect.

“Changes nothing” describes the consultation's effect on project and workflow
state. Running the fork and retaining its ordinary transcript naturally produce
session records. Those records do not constitute an architectural decision or
an assignment update.

The earlier suggestion to automatically brief the original supervising
architect on each answer was withdrawn following this clarification. The
caller can carry useful findings forward through its ordinary work. No
automatic parent-context update is part of this proposal.

## Proposed interaction

The initial interface needs only a message. The harness already knows the
caller, its work and its supervising architect; the agent should not need to
choose a session or supply a fork point.

```text
Engineer -> consult-architect(message) -> local architect fork -> answer
Local architect -> consult-architect(message) -> global architect fork -> answer
Capability-assigned engineer -> consult-architect(message) -> capability architect fork -> answer
```

Pi calls the tool as it would any other asynchronous harness tool. The handler
uses the existing fork operations, awaits the architect's answer, and returns
it as the tool result. The caller then continues its existing session. Asking
a question does not submit completion, yield the assignment, or initiate a
placement request.

Suggested caller-facing description:

> Consult your supervising architect for explanation or research help where
> its broader context may be useful. This is advisory only: the answer does
> not change your assignment, scope, permissions, or architectural decisions.

Suggested instructions appended to the architect fork:

> Answer the caller's question using your inherited context and any useful
> investigation. This is a consultation: explain, research, and advise. Do not
> change files, assignments, or decisions.

An answer may explain a boundary, point to an existing implementation, clarify
an assignment's rationale, or investigate alternatives. If the investigation
suggests that something should change, the answer can say so. Acting on that
suggestion remains part of the caller's ordinary workflow and authority.

Existing read-only tool configuration is a useful implementation convenience
where it fits. No semantic validator, approval flow or special mechanism to
prove that advice changes nothing is proposed.

## One level of nested consultation

Dan requested this for the initial feature, conditional on implementation
simplicity. The source inspection supports including it: the extra level is
another ordinary awaited tool call, not a new recursion framework.

```text
Engineer calls consult-architect
  Local architect fork investigates
    Optionally calls consult-architect
      Global architect fork investigates and answers
    Local architect receives the global answer
  Local architect answers the engineer
Engineer continues
```

The local architect decides whether asking the global architect would help.
It receives the global answer as a tool result and then writes its own answer
to the engineer. The harness does not automatically escalate questions or
substitute the global answer for the local architect's response.

The minimal additional wiring is:

- Retain the local architect's global consultation point alongside its work
  context. When an engineer consults that local architect, carry this reference
  into the local fork's tool setup. Use the point recorded for that work's
  dispatch, not the global architect's latest head.
- Give the local fork the same `consult-architect` tool, bound to that global
  point. Bind the global fork without a consultation tool. This limits nesting
  by the two known roles; no configurable depth policy or general agent graph
  is needed. A direct local-to-global consultation uses the same global setup.
- Pass each tool call's cancellation signal to its child invocation. Use the
  existing bounded idle hold while awaiting the child, releasing it in
  `finally`. Existing invocation deadlines continue to apply.
- Link the inner consultation to the outer consultation in the logs. The
  ordinary caller and fork identities still identify both exchanges.

The global fork inherits its recorded global context and receives the local
fork's question. It does not inherit the local fork's investigation implicitly;
the local architect includes the facts needed to understand its question.
Both forks remain advisory and leave the original architect sessions unchanged.

Capability-assigned engineers use the same direct consultation mechanism with
their assigning capability architect. The simple initial scope in Plan 33 makes
that fork answer directly, without onward consultation; the agreed nested path
remains engineer → local → global. This does not add capability-to-global or
capability-to-parent consultation. Capability assignment records already retain
`capability-assigned.architectRef`, so no duplicate point store is needed.

### Evidence for simplicity

The [invocation runner](../../subs/harness/src/steps/runner.ts), in `invokeOnce`,
serializes invocation startup but runs the session outside that lock. Its
`run.live` map tracks separate invocations; it does not impose a single active
session for the whole run. Its equipment already exposes `hold`, and its
request accepts a cancellation signal that stops the child session.

The [neutral session implementation](../../subs/harness/subs/agent/src/session-operations.ts)
creates a distinct session identity for every fork. Active execution is keyed
by run and operation, and tool handlers are awaited outside the per-operation
record-update queue. The [Pi adapter](../../subs/harness/subs/agent/subs/pi/src/session-operations.ts)
awaits `runtime.callTool` and returns its result to the calling session.
These paths support the proposed nested calls without a new scheduler or
suspend/resume protocol.

This is a source-based feasibility assessment, not a runtime proof. The base
feature still needs supervisor references, tool construction and logging.
Relative to that work, the nested level adds a global target to the local
fork's tool setup and a parent consultation reference. The existing runner's
automatic fresh fallback also needs an explicit choice for consultation;
that is a base consultation concern, not additional recursion machinery.

Focused implementation verification should cover the full answer chain,
absence of the consultation tool in the global fork, unchanged original
architect sessions, cancellation through both levels, an unavailable global
point, and linked logs with correct usage totals. No live nested consultation
was run during this analysis.

## Logging and evaluation

An analyst should be able to list a session's consultations, read each question
and answer, inspect the architect's investigation, and jump to what the caller
did after receiving the answer. Raw transcripts alone are insufficient if this
requires manually reconstructing relationships across several sessions.

The proposed KISS implementation adds an explicit consultation association to
the existing tool-call, invocation and transcript records. Reuse their IDs and
stored content rather than create a second logging system or duplicate whole
transcripts. The exact record shape is still to be designed.

For each consultation, retain or reference:

| Evidence | What it lets an analyst understand |
| --- | --- |
| Run, caller session, invocation, role, work/assignment and tool-call identity | Who asked, during which task, and where the question occurs in the caller's transcript |
| Exact question and exact returned answer or error | What help was requested and what the caller actually received |
| Supervising architect session and exact source point | Which inherited context was consulted |
| Consultation fork session, invocation and transcript | How the architect investigated, including its tool calls and observed results |
| Start and finish timestamps and elapsed time | When consultation happened and how long the caller waited |
| Outcome and failure reason when applicable | Whether an answer was returned, or the call failed, was cancelled, or could not obtain its source context |
| Model identity and available provider usage for the consultation invocation | Which model answered and the observed input, cached-input, output tokens and cost where available |
| Caller tool-result position | Where to continue reading to see how the caller used the answer |
| Parent consultation reference for a nested call | Which engineer-to-local exchange led to a local-to-global question |

Record the start before launching the fork so an interrupted or unfinished
consultation remains visible. A completed architect answer and its delivery to
the caller are distinct observations: if cancellation prevents delivery, retain
that fact. Repeated record publication or replay of the same tool call must not
appear as a second question; link execution attempts to the original call using
existing identities.

Provide a compact per-session listing, ordered by occurrence, with question
preview, outcome, elapsed time and references to the full exchange and fork
transcript. Include consultation count, observed waiting time and available
usage totals. The listing can be a simple projection of existing records; a
new dashboard is not required. Its output surface remains to be chosen.

Show an inner global consultation beneath its outer local consultation. The
outer elapsed time already includes waiting for the global answer: do not add
the inner elapsed time again when reporting the engineer's total wait. Keep
per-invocation model usage separate and sum each invocation once for the whole
exchange. This makes the extra time and usage of global consultation visible.

Count only the consultation's actual model invocations in its usage totals,
not historical model calls inherited through the fork. Preserve unavailable
usage as unknown, and do not count the same invocation again when combining
consultation and run totals. Provider-reported cache usage is evidence; merely
forking a session does not establish a cache hit or a saving.

These records support Dan's evaluation. Returning an answer establishes that
the operation completed, not that the advice was correct or useful. Subsequent
caller actions are evidence for reviewing usefulness, not automatic proof that
the consultation caused a better result. No mandatory agent self-rating,
automatic quality score or benefit benchmark is proposed.

## What the current implementation gives us

The investigation used the `/ramify` checkout on branch `ramify-agent`, at
`969d8cda574bfc47a1764d052cfd510f95acceab`, with local changes present. These
findings describe the inspected working tree, not qualification of that commit
alone or the older status-badge-tone execution checkout.

The refreshed architect view reported revision
`rev/1:142b4a2d-9a99-4069-a906-a506987c36de:1`, with measured production
dependencies and test references, four coverage entries, 1,309 cuts and eleven
unavailable details. Discovery was therefore bounded; not finding an existing
general architect-consultation tool is not proof of its absence everywhere.

The nested-consultation investigation refreshed the view to revision
`rev/1:7b10180c-b083-4400-bd9e-dd6006f0ef7f:1`, with the same input identity
and reported coverage counts. It additionally inspected the invocation runner,
neutral session execution and Pi tool-dispatch paths cited above.

### Exact forks and current tools

The neutral [session operations contract](../../subs/harness/subs/agent/src/interfaces/session-operations.ts)
defines `AgentSessionPoint` and a fork operation accepting `sourcePoint`.
The [harness session layer](../../subs/harness/src/run/session-operations.ts)
retains point references and briefing ancestry and changes active tools for the
current task. These are existing foundations for inheriting the architect's
context while asking it to answer a different question.

The fork should receive consultation instructions and the appropriate current
tools. An inherited assignment task must not be mistaken for a new request to
assign work. This can use the existing task/tool setup rather than a new
authority mechanism.

### A consultation precedent in the opposite direction

`consultCapabilityConsumer` in [RunService](../../subs/harness/src/run/service.ts)
already forks an engineer from the original accepted capability-request point,
asks a read-only question, and records the answer. It deliberately uses that
original point rather than the parent's later head or a previous answer.

That is a useful precedent for the proposed interaction. It is not the new
feature: its caller, workflow and lifecycle are different, and it currently
requires a settled writer. That precondition belongs to the existing
workflow-level method; it does not establish a requirement for this new tool.
The implementation should reuse the fork operations rather than assume it
must call that workflow method unchanged.

### Delegation is not necessarily session ancestry

Local work orientation can start fresh; engineers also have fresh and continued
starts. Therefore a session's transcript parent does not necessarily identify
the architect that assigned its work. The harness needs an explicit association
between the caller's work and the architect point to consult.

For an engineer, the natural point is the completed local assignment turn. The
corresponding point for a local architect needs to be selected and retained at
work dispatch. The representation and lifetime of this association are still
open implementation questions.

### Placement remains a separate operation

The existing [global placement design](../architecture/autonomous-implementation-loop.md#resolve-shared-placement-in-sequential-global-architect-forks)
forks accumulated global context, records accepted decisions and registry
changes, and appends a brief to the parent. Consultation has none of those
decision effects. Reusing fork machinery does not mean invoking the placement
workflow or giving an answer its decision semantics.

## Implementation direction and remaining questions

Keep orchestration in the harness, which already knows work assignments,
session identities and invocation records. Use the existing neutral agent
operations and Pi adapter. No new messaging module is justified by the current
scope. Tool availability should be represented in the same step construction
used by run execution and step rendering; the
[engineer constructor](../../subs/harness/src/steps/engineer.ts) is one relevant
integration point. This is a recommendation, not a completed placement or API
design.

An earlier concern about waiting during an active engineer invocation conflated
the existing workflow-level consultation's settled-writer precondition with
ordinary asynchronous tool execution. Dan clarified that consultation should
be treated like any other harness tool exposed to Pi. This analysis adopts
that decision. Check for concrete bookkeeping conflicts during implementation
and address any that actually arise; do not introduce a new execution lifecycle
for a hypothetical conflict. Reuse existing cancellation and timeout handling.

The following questions remain open:

- **Current evidence.** A fork restores conversation history, not the old
  filesystem. The question may describe discoveries or changes made since
  assignment. Investigation must distinguish inherited observations from the
  files and generated views available now. How to prepare useful evidence
  during the caller's active invocation still needs examination.
- **Repeated questions and follow-ups.** Independent questions naturally fork
  the recorded delegation point. Such forks do not inherit earlier answers.
  Supplying a previous exchange in a follow-up message may be sufficient; a
  persistent consultation conversation has not been requested.
- **Unavailable context.** Decide what the caller receives if its architect
  point is unavailable. An explicit failure is the simplest initial option;
  silently creating a fresh architect would not provide the promised inherited
  context. No fallback policy has been agreed.
- **Other execution modes.** Plan 33 selects no executable target for standalone
  or cross-run imported steps without a recorded supervisor. Same-run manual
  assignments may use their recorded target. Capability-assigned engineers use
  their actual assigning capability architect; do not invent a local supervisor.

The consultation records and compact session listing described above are part
of the proposed feature. Reuse existing recording and projection facilities
where possible. Automatic parent updates and benefit benchmarks remain outside
this initial proposal.

No implementation or runtime verification was performed during the initial
analysis. Plan 33 subsequently implemented the feature: see its iteration
receipts and final-results.md for exact candidate and qualification outcomes.
Planning subsequently identified `iteration-assigned.architectRef` as the
existing exact local assignment point; reuse it. The additional global point
belongs to the local work dispatch. Plan 33 records these integration choices,
the logging and inspection contracts, and the resolved capability-engineer scope.
