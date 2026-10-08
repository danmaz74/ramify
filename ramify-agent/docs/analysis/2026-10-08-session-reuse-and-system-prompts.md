# Session reuse and system prompts

**Date:** 2026-10-08. **Status:** proposal with an adopted continuation default,
fork definition, session-operation abstraction and requirement to predetermine
strategies by use case. Handler rebinding is accepted; legacy sessions are ignored.
The use-case mapping and adapter changes below are proposed behavior, not an
implementation plan or evidence of implementation.

[Plan 23](../plans/23-session-reuse-and-run-efficiency/main-plan.md) implements
this proposal together with the related real-run corrections. It defines
dependencies, safe iteration parallelism and acceptance evidence; implementation
has not started.

The [status-badge-tone real run](2026-10-08-status-badge-tone-real-run.md)
(run `20261008T112847Z-ede7d9`) showed that continued sessions and starts
recorded as `fork` pay for inherited history again when their leading system
prompt or tool list changes (cost driver C2 there). Those history-reuse starts
replace the inherited prefix and are not forks under the definition adopted
below. This document explains why the prompt changes, lists every place the
harness starts a model invocation, and proposes a fixed strategy for each use
case. Runtime selection between forks, fresh starts and summary handoffs is
outside this proposal.

## Summary

- The current harness supplies the system prompt and tool list anew for every
  invocation. Its current `continue` and `fork` modes therefore reuse the
  history under whatever prompt and tools the new invocation brings. The
  latter mode does not implement a fork when it replaces the inherited prefix.
- The prompt changes for two different reasons:
  - **Same role, different turn.** The role's system template embeds the
    turn's procedure, submission tool name and submission schema. A local
    architect's orientation turn and its assignment turn share the opening
    role text apart from the submission-tool slot and differ in those three
    slots overall; the prompt grows from 4.4 KB to 53.7 KB, mostly schema.
  - **Different role or procedure.** Several starts recorded as `fork`
    (context selector, scope review, design review, `global-fork`) replace the
    prompt or tool set; only the conversation history is carried over.
- Either change breaks cache reuse from the first changed position onward;
  any identical leading portion remains cached under our assumption. In the
  run: the assignment turn's first call was 30.6k tokens with nothing cached,
  the selector history reuse 16.4k, the scope-review history reuse 38k. The
  completion turn, whose prompt was unchanged, was 92% cached.
- Orientation is expensive in elapsed time as well as tokens. Preserve acquired
  knowledge through continuation or a fork wherever the workflow permits it.
  Cached input costs several times less than new input; a smaller fresh prompt
  does not by itself establish a saving.
- Decision: use ordinary multi-turn agent operation as the default for a
  continuing session. Keep the role instructions and conversation, and send
  each next task as a new message. The initial prompt defines the role and
  general task protocol; each task message names its submission tool, whose
  declaration supplies its instructions and schema.
- Decision: a fork preserves the complete inherited prefix exactly through
  its fork point; everything new is appended. An operation that replaces any
  inherited prompt, tools or messages is different and will not be called
  a fork.
- Decision: callers use uniquely identified sessions, numbered turns and
  high-level operations. Persistence, restoration and request preservation are
  internal guarantees. Continue starts a new turn; retry recovers the same
  interrupted operation. There is no separate caller-facing resume operation.
- Proposal: add new tools at invocation boundaries by appending their
  declarations after the inherited conversation, followed by the new user
  message. No future-tool pre-registration or system-prompt replacement is
  required. The context selector is the first intended use case; see
  [New tool addition](#proposal-new-tool-addition).
- Proposal: choose continuation, a fork or a fresh start by the named workflow
  in [Predetermined strategies](#proposal-predetermined-strategies). No current
  use case adds a separate summary-generation handoff. Initial context size,
  cache share and runtime estimates do not select the strategy.
- The inventory also surfaced four defects in how prompts are rendered for
  reused sessions (see [Defects found](#defects-found)).

## Decision: ordinary continuation is the default

A continuing session uses the same ordinary multi-turn pattern as interactive
agents: retain its role instructions and conversation history, and append the
next task as a new user message. Orientation, assignment, qualification and
repair are tasks within the role; a new task does not by itself require
replacing the role's system prompt. The current task's procedure and
submission requirements belong with that task, and must agree with the tools
actually available.

This is standard agent operation, not a special cache optimization. Ordinary
pi appends a user message through `session.prompt()` and leaves unchanged
system sections in place (`pi-coding-agent/dist/core/agent-session.js:1025,
1297`). Codex likewise retains a thread and adds tasks through `turn/start`
([App Server documentation](https://learn.chatgpt.com/docs/app-server#core-primitives)).
The harness currently departs from this pattern by embedding turn-specific
text in the system prompt and forcing that prompt onto each invocation's head.

For this analysis, assume that sending the same prefix through position X
means that prefix is cached. Ordinary continuation preserves that prefix when
its role instructions and tool definitions remain unchanged.

The default does not require a generic `submit({phase, payload})` tool or
registering every future tool upfront. Existing specialized submission tools
can remain; a necessary equipment change is handled explicitly. A stable
submission interface is a separate optimization for particular transitions.

Use special optimizations only for identified special cases. This proposal
names those cases and their session strategies in advance. Measurements can
inform later design revisions; they do not switch strategies during a run.

### Stable role instructions and task-specific submissions

The initial system prompt contains general role instructions, project context,
orientation guidance and the protocol for receiving tasks. It does not fix the
first task's procedure, submission tool or schema for the lifetime of the
session. Guidance on how to orient remains useful; the instruction to perform
and submit an orientation now belongs in the first user message.

The general protocol states that each task message names the current objective
and submission tool, and that acceptance of that submission completes the task.
Earlier task instructions and submissions remain historical context. A later
task does not acquire permissions beyond the invocation's assigned authority.

| Location | Contents |
|---|---|
| Initial system prompt | Durable role, authority, orientation guidance and general task/submission protocol |
| Current user message | Objective, procedure, relevant inputs or changes, and designated submission tool |
| Submission tool | Operation-specific instructions, argument schema, validation and acceptance behavior |
| Harness | Current accepted submission, execution permissions, validation, persistence and completion |

Invocation-specific environment facts also belong with the task: working
directory, candidate or snapshot identity, effective tool availability and
execution limits. The stable role prompt explains how to interpret those facts;
it must not permanently bind them to the first invocation's values. A fork
preserves earlier facts as history and receives its current environment before
acting. Tool handlers use that same current environment.

For example:

```text
System: You are the local architect. [General role and orientation guidance.]
        Each task message specifies its objective and submission tool.
        An accepted submission completes that task.
Initial tools: read, grep, ls, submit_work_orientation
User: Orient to this work item. [Briefing and procedure.]
      Submit using submit_work_orientation.
... exploration and accepted orientation submission ...
Appended tool: submit_work_item_result [Instructions and schema.]
User: Now determine the assignment. [Task and current inputs.]
      Submit using submit_work_item_result.
```

Each tool describes what it submits when designated by the current task; its
description does not command every future task to use it. Keep the full schema
in the tool declaration once, rather than duplicating it in the system prompt
or task message. Reuse an existing tool when its contract is unchanged; a new
task does not require a new tool name.

The selected submission mechanism in this proposal is a specialized pi tool.
The [principle permitting instructions in user messages](../harness.principles.md#additional-instructions-may-be-supplied-in-user-messages)
also permits other interfaces, but no direct-message result path or generic
dispatcher is needed for these use cases.

### Briefings and updates

The first task receives its complete required briefing. A continued task
receives the current objective, submission tool and changed briefing sections,
identified by their current revisions. Do not append another full copy of
unchanged material merely because an invocation starts.

A fork inherits only through its recorded point. Append the required findings
and accepted updates produced after that point; do not assume it sees the
parent's later history. A fresh start or explicit fresh-session recovery
receives the complete current briefing. Recovery identity must cover the
inherited point and supplied updates so a delta cannot be applied to a different
base context.

The orientation task receives the goal and requirement text its procedure asks
it to read, and explicitly names its orientation submission tool. Catalog text
deliberately reserved for selection is not also required reading for orientation.
The [real-run corrections](2026-10-08-status-badge-tone-real-run.md#proposals)
cover the remaining briefing, review-evidence and prompt-text defects.

## Decision: fork preserves everything through its point

[Fork](../glossary.md#fork) means exactly what it means in a normal agent:
everything through the selected fork point stays the same. The child inherits
the complete model-visible prefix, including system and role instructions,
tool definitions, conversation messages, tool calls and results, and their
order. The parent remains unchanged; its later entries are not inherited.

Everything new is appended after that point. A new task, role instruction or
tool change can be appended, but cannot rewrite, replace, remove or prepend
anything in the inherited prefix. Under the cache assumption above, that
unchanged prefix is cached.

Reusing history with a replaced leading prompt or tool set is a different
operation. We will not call it a fork. The current executor's `fork` label
and existing `global-fork` role identifier are recorded implementation names,
not evidence that those starts meet this definition. The inventory below
retains those identifiers to locate the current behavior and explicitly
distinguishes it from a fork. Special-case alternatives must be named by
what they do; they cannot redefine fork.

## Decision: sessions expose high-level operations

Callers choose the task, session or fork point, submission contract, tool changes
and current execution policy. They do not supply an inherited system prompt,
reconstruct a transcript, manage pi session files or implement preservation checks.
The session abstraction owns those mechanics and restores persisted state
automatically whenever an operation needs it.

### Identity, numbered turns and points

Each session has a unique harness-owned identity independent of a provider's file
or conversation identifier. A turn is one task invocation, from its recorded
input through its outcome, potentially containing many model messages, tool calls
and rejected-submission corrections. It is not each individual assistant response.

Turns are numbered from 1. Initial instructions and tool declarations precede
turn 1. A fork after turn N receives a new session identity, retains the inherited
turn numbers and exact prefix through that boundary, and starts its own next turn
at N + 1. Parent and child may each have turn N + 1; the session identity
distinguishes them. Failed or stopped turns remain recorded with their outcomes.
Forking is from a settled, recorded point, not an in-flight partial exchange.

Settled means more than a terminal harness status: the prefix must also be valid
for a subsequent provider request. Resolve recorded tool calls through the
effect-recovery contract and append their actual results or explicit interruption
outcomes before exposing a reusable boundary. Never invent successful results or
delete earlier calls to make a stopped turn reusable. If completion of an effect
remains unknown, retain that evidence and report that boundary as unavailable;
an earlier settled point can still be forked.

A turn boundary is immutable. Required briefing updates, instruction changes and
tool changes normally accompany the next turn in one operation. This prevents
separate equipment changes from leaving a partially prepared task.

Accepted briefs can also be appended without a model call, as existing workflows
require. Such an append returns an opaque checkpoint naming its precise position.
It does not consume a task turn or alter an earlier turn boundary. Fork accepts
either a numbered turn boundary or this checkpoint; a bare turn number must not
silently include appends made after that turn. A checkpoint exposes no pi entry
IDs or serialization details. Both forms are high-level [points](../glossary.md#point).
Each point is bound to its session identity. Create and Fork also return an
initial settled checkpoint, so their next operation can name an expected point
even before the new session has run a task.

### Operations and caller inputs

The names below illustrate the contract, not implemented API signatures.

| Operation | Caller supplies | Guaranteed behavior |
|---|---|---|
| Create | Initial role instructions, tool definitions and initial policy | Allocate a unique session identity; persist its initial context |
| Continue | Session identity, next task, current execution bindings and optional additions/inactivations | Restore as needed and append exactly one new numbered turn under the preserved prefix |
| Fork | Source session identity and turn boundary or checkpoint | Create a new session with the exact inherited prefix and tool activation state at that point; leave the parent unchanged |
| Add tools / set activation | Definitions for new tools or identities to activate/inactivate, normally bundled with Continue | Append new definitions once; change execution availability without removing historical declarations |
| Append context | Session identity, accepted brief and operation identifier | Append once without invoking the model; return an immutable checkpoint |
| Retry | The original operation identifier and current execution bindings | Return its recorded result or recover the same unfinished operation; do not create another task turn |
| Stop | Session identity and active operation identifier | Fence further dispatch and submission acceptance, settle or record outstanding effects, and durably record the turn's stopped outcome |

Every state-changing operation carries an operation identifier, unique within
the owning run and bound to its recorded inputs. Continue, standalone context
appends and standalone tool changes also require the expected current point.
Standalone tool changes follow the same no-model-call and immutable-checkpoint
rules as Append context; they do not consume a task turn. Stop targets the active
operation explicitly, so a delayed request cannot stop a subsequent turn.

For example:

```text
continueSession(sessionId, {
  operationId: "assignment-1",
  expectedPoint: orientationPoint,
  addTools: [assignmentSubmission],
  inactivateTools: ["submit_work_orientation"],
  execution: currentBindingsAndPolicy,
  task: {
    message: "Determine the assignment from the orientation and these updates...",
    submissionTool: "submit_work_item_result"
  }
})

retryOperation("assignment-1", currentBindingsAndPolicy)
```

One turn is active per session. Serialize operations that advance its history and
reject a stale expected point instead of inheriting intervening changes silently.
An unfinished turn must be recovered or explicitly ended before Continue can
start another turn. A stopped turn is reusable only once its settled boundary is
available. Its settlement process records outstanding effect outcomes; after
settlement, late callbacks cannot append history or accept another submission.
Different forked sessions may run independently. A settled historical point may
be forked even when its parent is now working on a later turn.

Definitions are immutable and persist independently of handlers. Inactivation
retains the declaration and rejects calls before invoking its handler. The
abstraction communicates activation changes through appended equipment
instructions; it does not emit native removals that rewrite leading declarations.
A fork inherits activation state through its selected point, while the next task binds
handlers and enforces its current policy. No inherited activation can bypass that
policy. Reactivation, when requested for a later task, uses the unchanged definition
and a current handler; it grants no authority beyond that task's policy.

### Continue, retry and automatic restoration

Continue always starts the next turn. Whether the session is already loaded or
must be restored after a process restart is an internal matter; there is no public
"resume after restart" operation.

Retry uses the original operation identifier. If that operation completed but its
answer was lost, return the recorded outcome. If it was interrupted, recover its
recorded turn and inputs, restore handlers and policy, and proceed only from an
established execution state. Reusing an identifier with changed task inputs is a
conflict, not another attempt or a new turn.

Current execution bindings means newly constructed handlers for the recorded
task, validator, scope, environment and result destination. It does not permit
Retry to replace those inputs or widen the recorded policy. Check current
authorization before further execution; if the recorded operation is no longer
permitted, stop and report that condition. A changed assignment requires a new
turn after the previous one has settled. A completed, failed or stopped operation
returns its recorded terminal outcome on Retry; only an unfinished operation
can proceed.

Every operation that creates or advances state has a stable operation identifier,
including Create and Fork, so retrying them returns the same session identity.
Record operation intent and inputs durably before dispatch, and record history,
accepted results and effect completion under their existing durable identities.
The abstraction durably records an operation's outcome before reporting it to
the caller. Retrying a previously recorded operation resolves its identity
before checking whether its original expected point is now stale; the operation's
own successful append must not make its retry fail.
Retries must not append the task or tool additions again. Tool effects whose
completion is uncertain require the existing effect-recovery contract; transcript
deduplication alone does not make arbitrary external effects safe to execute twice.
An operation that cannot be recovered reports failure rather than guessing what
already ran. Starting fresh remains an explicit workflow recovery operation.

### Preservation failure is an operation failure

Exact persistence, reconstruction and validation of each provider request are
owned by the session abstraction and adapter. The caller receives a structured
outcome such as unavailable session, stale point, unsupported operation or prefix
preservation failure, with a reason. It does not repair pi's transcript or hooks.

An initial preservation failure sends no provider request. If preservation fails
at a later request boundary, stop before that next request; earlier valid calls,
tool effects and their records remain. Neither case authorizes rewriting the
prefix, automatically starting fresh or silently substituting a summary.

The agent boundary exposes these operations; the harness continues to own durable
run state and storage. The pi adapter implements provider-specific serialization
and final request validation internally. This abstraction changes the contract of
the existing boundary, not the workflow's predefined session strategy.

## How sessions are reused today

### The invocation

Every run invocation goes through `RunService.runInvocation`
(`subs/harness/src/run/service.ts:3905`). Each call supplies its own
`systemPrompt`, first message, submission `toolName`, `inputSchema`,
`validate` and `start` mode (`fresh`, `continue` or `fork`), and optionally
its tools (`equip`; the default is `read`, `grep` and `ls`, 4120-4121). There
is no session-level prompt: a session is whatever history the start mode
yields.

### What pi keeps and what the harness supplies

All in `subs/harness/subs/agent/subs/pi/src/pi-agent.ts`:

- **System prompt.** An inline extension returns the invocation's prompt from
  `before_agent_start` (367). pi 0.87.1 treats it as a forced prompt and
  collapses every system message into one head with that text and the current
  tools (`agent-session.js:1036-1059`). The session file's `system` entries
  are empty; the prompt is never part of the history.
- **Tools.** Every start passes the invocation's built-ins, harness tools and
  submission tool again (398-417). A continuation can therefore have a
  different tool list from its parent.
- **Continue** (235-243) opens the parent session file and resumes from its
  current leaf. It ignores the entry ID in the ref (see
  [Defects found](#defects-found)).
- **Current `fork` mode** (244-257) calls `createBranchedSession(entryId)`:
  a new file holding the parent's entries from the root to that entry. The
  parent is untouched. Replacing the request's leading system prompt or tools
  afterward makes the overall operation history reuse with replacement,
  rather than a fork as defined above.
- **Appends** (186-221), such as the context package, decision briefs and
  "Continuing iteration" notes, are pi `custom` messages, which pi converts to
  `role: "user"` for the model (`pi-coding-agent/dist/core/messages.js:89-96`).
- **Submission schema.** pi sees a permissive schema; the full schema is in
  the tool description (511-556). The role templates also embed it,
  pretty-printed, in the system prompt, so it is sent twice (cost driver C1
  in the run analysis).

What the current history-reuse operation copies, as observed: the context
selector's session (`inv-0005`) begins with entries 0-24 of the local architect's orientation
session: the 7.1 KB briefing message, the architect's two exploring turns
with their tool calls and 18 tool results (about 57 KB, mostly grep output),
and the `submit_work_orientation` call and result. Its own part is an empty
system entry, a 10.8 KB message, one submission and its result.

### Why a same-role prompt changes

`render()` in `subs/harness/src/prompts/packages.ts:559-570` fills the role's
system file with `{{procedure}}`, `{{submissionTool}}` and
`{{submissionSchema}}`, among others. Renderers for different turns of the
same role pass different values:

- `renderWorkOrientationPrompt` (511-514) uses the orientation procedure,
  schema and tool.
- `renderLocalArchitectPrompt` (507-508) uses the assignment procedure,
  schema and tool.
- `renderReconciliationPrompt` (522-526) uses the reconciliation procedure,
  schema and tool.

The observed difference between `inv-0004` (orientation) and `inv-0006`
(assignment), both in session `ses-0004`:

| Part | Orientation | Assignment |
|---|---|---|
| Lines 1-60: role, tools, session and write rules, except the submission-tool slot below | identical | identical |
| Submission tool named on line 28 | `submit_work_orientation` | `submit_work_item_result` |
| Procedure | "Work orientation", 4 lines | assignment procedure and write-scope section, about 90 lines |
| Schema | 3 fields, about 25 lines | about 1,430 lines pretty-printed |
| Registered tools | default tools + `submit_work_orientation` | default tools + `inspect_git` + `submit_work_item_result` |

### Prompt identity

`startInvocation` records `inputsHash([systemPrompt, prompt])` with the
package and its hash (`run/service.ts:3966`, `prompts/packages.ts:587-589`).
Recovery uses it once: a completed local-architect orientation is reused
without a model call when its recorded hash matches the re-rendered
orientation prompt and message (4721-4741). Other recovery paths compare
package hashes (2505, 2607, 1064-1070). Moving turn-level text out of the
system prompt changes what this hash covers, so that recovery path must
change with it.

## Rationale and existing contracts

- [Harness principles: oriented context](../harness.principles.md#an-oriented-context-is-reused-never-required):
  searching, reading and understanding can dominate elapsed time. Reuse or
  transfer acquired knowledge and evaluate total time to an informed result,
  including handoff preparation and remaining exploration. Cached tokens cost
  several times less than new tokens; compare the respective rates. Continuity
  preserves consistency but is never required for recovery or correctness.
- `docs/harness.spec.md:130-150`: fork an oriented session for independent
  tasks so the reused context stays bounded; "Forks limit accumulated context
  but do not necessarily reduce total tokens or latency."
- `docs/architecture/check-findings.md:480-483`: the scope review forks the
  assignment point "to challenge scope, and has no authority inherited from
  its parent's role"; 515-524: forking the design orientation "is an
  optimization, not a requirement for correctness or proof of lower cost".
- `docs/plans/13-plan-evidence-and-nonfunctional-work/main-plan.md:135-136`:
  one read-only selector fork per work item sees the orientation.

The current prompt replacement follows from the invocation model above, not
from a requirement to replace instructions whenever the next task changes.
Repeated task-specific exploration can stay in child forks while accepted
decision briefs are appended to a long-lived parent. These ordinary task
outputs require neither a separate summarization invocation nor a fresh parent.

The cited documents use the existing implementation's fork terminology.
Their descriptions of starts that replace inherited instructions or tools
must be distinguished from the fork definition adopted here.

## Use cases

Rows are invocation sites in `subs/harness/src/run/service.ts` unless noted.
"Prompt vs parent" compares the rendered system prompt; "tools vs parent"
compares the non-submission tools. Rows marked † were inventoried from source
and not observed in the run.

### Fresh starts

These starts inherit no session history. They can still reuse a common cached
prefix and cache their own earlier calls. Listed for completeness, and because
some of them are the parents of later reuse.

| Role and turn | Site | Notes |
|---|---|---|
| initial-architect, initial analysis | 4315-4336 | Kept; becomes the context reused by the `global-fork` role |
| catalog-extractor: intake, principles, check | 4425-4434 | Never kept. Procedure, schema and tool differ per turn |
| reviewer, code review | 1207-1248 | Fresh by design: an independent reading |
| reviewer, design orientation | 1434-1454 | Kept; its history is reused by design review |
| local-architect, work orientation | 4745-4754 | Kept; its history is reused by the selector and continued for assignment |
| nonfunctional-coordinator: action, investigation, assessment † | 3618-3630, 3649-3663, 3853-3870 | Each turn fresh; the prompt carries no procedure at all (defect D1 in the run analysis) |
| nonfunctional-repair-engineer † | 3716-3729 | Fresh |
| engineer, new iteration or after a budget return | 8377-8465 | Fresh by design: "each iteration is a fresh session" (`docs/work-loop.md:176-179`) |
| contract-engineer, first turn † | 9003-9050 | Fresh |
| failure-analyst † | 10054-10080 | Fresh |
| capability-architect, first delegation † | 7456-7499 | Fresh; later turns continue |
| engineer, single session command † | `sessions/single.ts:343-498` | Fresh |

### Continuations: same role, same session

| Role and turn | Site | Parent | Prompt vs parent | Tools vs parent | Message re-sends |
|---|---|---|---|---|---|
| local-architect, first assignment turn | 5400-5473 | its orientation | **changes**: procedure, tool name, schema | adds `inspect_git` | the full briefing again, plus the context package |
| local-architect, later turns (completion, repair review) | same | previous turn | identical | identical | the full briefing again (8.1 KB, then 11.6 KB in the run) |
| local-architect, capability qualification † | 7190-7223 | latest local-architect turn | identical, but it names `submit_work_item_result` and the assignment schema while the tool is `submit_capability_qualification` | drops `inspect_git` | request, provisional source, registry clues |
| capability-architect, later actions † | 7456-7499 | previous turn | identical | identical | plan and progress; the package is not re-sent |
| capability-architect, nested-need qualification † | 7946-7970 | coordinator turn | identical, but it names the action tool and schema | drops the three harness tools | full request and parent plan |
| engineer, repair or capability return † | 8377-8465 | previous engineer turn | identical | identical | the full iteration message again |
| engineer, read-only consultation † | 7679-7700 | the engineer that asked for a capability | same renderer, different arguments (timeout, working directory) | drops `edit`, `write`, `shell` | the question twice: as an appended note and in the prompt |
| contract-engineer, repair † | 9003-9050 | previous turn | identical | identical | the full contract message again |

### Starts currently recorded as `fork`

All rows below change the leading prompt, submission tool or other equipment.
They are history reuse with replacement, not forks under the adopted
definition. The executor mode and role identifiers are retained as current
implementation evidence.

| Current operation | Site | Parent | Prompt vs parent | Tools vs parent | Message re-sends | Uses the inherited history? |
|---|---|---|---|---|---|---|
| context-selector | 4909-4929 | local-architect orientation (also the assignment or qualification turn on re-selection) | **replaced** by the 469-byte selector prompt | same default tools | the orientation packet, which repeats the briefing and the orientation submission, plus every selectable catalog element | No additional exploration was observed; this does not establish that inherited history was unused |
| reviewer, scope review | 1378-1402 | local-architect assignment turn, or the capability architect's turn | **replaced** by the reviewer prompt | replaced: snapshot tools only | the complete review message, the same as a fresh review | Assignment reasoning is available; its contribution was not measured |
| reviewer, design review | 1384-1390 | design orientation | **replaced**: same package, different system file | adds the snapshot tools | the complete review message | Orientation is available; required current-candidate reads do not establish that earlier understanding is redundant |
| reconciliation | 2024-2081 | local architect after its completion request, or the capability architect's handback turn | **changes**: same system file, different procedure, tool and schema; the working directory slot is left unfilled | drops `inspect_git` (and the capability architect's plan tools) | the complete reconciliation packet | Completion rationale is available; its contribution was not measured |
| `global-fork`, placement and unresolved requests † | 5934-5978, 6205-6252 | initial-architect context with appended briefs | **replaced** by the `global-fork` prompt | same default tools | request, view, full registry, hypotheses, decision log; the briefs are also in the parent | Project-wide orientation is available; its contribution was not measured |

## Observed costs in the run

From the [run analysis](2026-10-08-status-badge-tone-real-run.md#invocations),
at this model's rates (input $4/M, cache read $0.4/M, output $20/M):

The start column quotes the executor's recorded mode, not the adopted fork
classification.

| Invocation | Recorded start | Prompt vs parent | Uncached input | Cache read |
|---|---|---|---|---|
| `inv-0006` local architect, assignment | continue | changed | 46.8k (30.6k on its first call, nothing cached) | 74.1k |
| `inv-0010` local architect, completion | continue | identical | 8.9k | 97.5k (92%) |
| `inv-0005` context selector | `fork` | replaced | 16.4k | 0 |
| `inv-0009` scope review | `fork` | replaced | 41.3k (38.2k on its first call) | 76.2k |
| `inv-0012` design review | `fork` | replaced | 22.4k | 23.2k |

`inv-0010` is the control: the same session and history, with an unchanged
prompt and tool list, is almost entirely cached.

## Defects found

1. **Reconciliation prompt leaves `{{workingDirectory}}` unfilled.**
   `renderReconciliationPrompt` (`prompts/packages.ts:522-526`) passes no
   working directory, and `fill` keeps unknown slots, so the local-architect
   variant says "Your working directory is `{{workingDirectory}}`"
   (`local-architect.system.md:15`). The reconciliation call
   (`run/service.ts:2029`) also runs from the project root rather than the
   architect's module. Verified in source.
2. **Qualification turns name the wrong submission tool and schema.** The
   local-architect qualification (`run/service.ts:7193`) reuses
   `renderLocalArchitectPrompt`, which names `submit_work_item_result` and
   embeds the assignment schema, while the turn's tool is
   `submit_capability_qualification`. The capability architect's
   nested-need qualification has the same fault. Reusing the prompt leaves it
   contradicting the current tool; changed leading tools can still invalidate
   the inherited cache. Verified
   for the local architect; the capability-architect case is from the
   inventory.
3. **Continue ignores the ref's entry.** `continue` opens the session file
   and resumes from its current leaf (`pi-agent.ts:235-243`); the entry ID in
   the ref is unused. Anything appended to the same file in between, such as
   consultation turns, is inherited. Verified in source; the consequence for
   consultations is inferred, not observed.
4. **Unfilled placeholders in the non-functional prompts.** Recorded as D1
   in the run analysis: single-brace `{procedure}` and `{submissionTool}`.

Defects 1, 2 and 4 share a cause: nothing fails when a rendered prompt keeps
a placeholder or names a tool the invocation does not register.

## Proposal: new tool addition

Add a tool-injection feature to the pi harness. A continued invocation or a
fork can retain its complete previous context, append declarations for new
tools, and then append the user message explaining the next task. Under this
document's assumption, the unchanged prefix is cached.

This is a proposal, not implemented behavior. It changes how the harness
supplies equipment, without requiring every future tool to be known when the
session starts.

### Invocation contract and ordering

The caller continues a uniquely identified session or forks it at a numbered
turn boundary or checkpoint. It supplies any new tool definitions, current
execution bindings, inactivations and the next task. A workflow
with a distinct authority assignment also supplies its specified appended role
instructions. The invocation identifies which submission is accepted. Its original
system prompt and historical tool declarations come from the inherited
context; the caller does not supply a replacement head.

The model-visible order is:

```text
Original system prompt and original tool declarations
Previous messages, tool calls and tool results, unchanged
---------------- inherited point ----------------
Appended role instructions, only for a workflow that specifies a role change
New tool declarations: name, description and argument schema
Appended equipment instructions for activation changes, when needed
New user message: task instructions and submission requirements
New assistant messages, tool calls and tool results
```

A continuation extends its inherited conversation. A fork copies that exact
prefix through the selected point and extends the child; the parent stays
unchanged. Tool additions made in the parent after that point are not
inherited by the child.

The user message supplies the current task and names its submission tool.
The tool declaration supplies that operation's instructions and schema.
Injection is needed only for a new callable operation or changed contract;
an existing tool can serve successive tasks without being declared again.

### How pi can carry the addition

The installed pi packages are version 0.87.1. Their transcript format can
store later system entries with `toolsAdded`. For a compatible model, pi-ai
keeps the initial request's tool declarations unchanged and serializes later
additions at their positions in the conversation. In the Responses transport,
these become native `additional_tools` input items containing the new names,
descriptions and argument schemas. The model receives the definition when it
is appended; it does not need a separate discovery step.

The installed `openai-codex` catalog entry for `gpt-5.6-sol` sets
`supportsAdditionalTools` and `supportsMidConvoSystemMessages`. This makes it
a concrete first target. Support must be checked for the selected model and
transport; an unsupported combination reports this feature as unavailable.
It must not silently replace the leading tools or start a fresh session while
claiming to preserve the prefix.

The current adapter blocks this mechanism. Its `before_agent_start` hook
forces `spec.systemPrompt`; pi's forced-prompt projection collapses system
entries and the current tools into a new head. The proposal is to replace
that projection for preserved-context invocations with a transcript-aware
integration through pi's `context_with_system` hook. The harness owns the
exact initial prompt and ordered declaration history, while pi continues to
provide tool registration, execution and transport. This integration must
also avoid introducing pi's default prompt text into the preserved prefix.

Preservation failures must stop the provider request. Pi catches exceptions
from `context_with_system` handlers and continues with the remaining transcript
(`pi-coding-agent/dist/core/extensions/runner.js:930-958`). Throwing from that
hook is insufficient. Validate reconstruction before dispatch and enforce a
final request check outside the swallowed hook. An initial failure sends no
provider request, including when inherited prompt or declaration evidence is
missing. A later failure stops before the next request and preserves the earlier
recorded activity. The caller receives the high-level operation failure.

Keep the runtime declaration set equal to the inherited definitions plus
the additions. Pi detects differences between that set and its transcript;
dropping an old definition would generate a removal. Its current serializer
falls back to rebuilding the leading request tool list for removals or
same-name redefinitions, which violates this proposal's prefix contract.

### Decision: declaration history and current handler bindings

Handler rebinding is accepted: persist model-visible definitions and rebuild
execution handlers for the current invocation. A handler must use the current
task, validator, scope and recording destination, never closures retained from
an earlier invocation. Historical declarations do not preserve execution rights.

Keeping a tool's historical definition does not authorize it for every later
task. The harness binds execution handlers and guards for the current
invocation separately from the declarations shown in the transcript.

For example, a selector inherits the architect's orientation submission
tool. A call to that old tool must be rejected as invalid for the selector
turn, without accepting a selector result, causing effects or terminating
the turn as a successful submission. Only the current selection submission
can complete it. Similarly, a read-only consultation retains any inherited
write-tool declarations but rejects their execution under its current scope.

The addition rules are:

| Request | Behavior |
|---|---|
| New tool name | Append its definition once and bind its handler |
| Existing name with the same definition | Reuse the declaration; bind the current handler without appending it again |
| Existing name with a changed description or schema | Reject the redefinition; use a new name, such as a versioned tool name |
| Historical tool unavailable in the current task | Retain its declaration and reject calls through the current execution policy |
| Native removal or redefinition | Outside this feature; requires a separate contract because current pi rewrites the leading tool list |

Definitions must be compared in full, including descriptions and schemas.
Callbacks cannot be serialized into the session: recovery rebinds them to
the current scope, validator and invocation, rather than retaining closures
from an earlier turn.

### First use case and other uses

**Context selector.** Fork the oriented architect's session at the chosen
point, preserving its system prompt and every prior entry. Append the
`submit_context_selection` tool, then a user message containing the selection
instructions and selectable catalog.
The selector uses exactly the inherited context and submits through the new
interface. The parent remains available for its own continuation. Start the
orientation with the stable role/task protocol above so its inherited system
prompt does not permanently require the orientation submission tool.

**Orientation to assignment or qualification.** Continue the architect's
session, append the specialized submission tool needed for that task, and
send the procedure in the new user message. Orientation remains cached and
the current task names the correct submission tool. There is no need to
pre-register assignment and qualification tools during orientation.

**An agent gains an operation during work.** An engineer can receive a newly
available inspection or action tool on its next turn. Its definition is
appended where the capability becomes available, followed by instructions
for its use. Execution still passes through the invocation's scope and
mutation guards.

### Persistence, ownership and recovery

Persist the exact initial prompt and declarations, each appended role instruction,
and each ordered tool addition with its session position, full definition,
definition identity and an idempotency key. Persist activation changes, session
identity, turn numbers, immutable boundaries/checkpoints and operation outcomes
alongside that history. The session abstraction restores this state automatically
for Continue, Fork and Retry. A retry or restart reconstructs the same prefix
without duplicating additions; a fork reconstructs only state through its point.

Preservation covers the provider-visible representation, including ordered tool
calls/results and any provider-required continuation or reasoning artifacts.
A display transcript is not sufficient recovery evidence. Keep internal run,
session and operation identifiers out of the inherited model-visible prefix;
allocating a child's identity must not rewrite historical message metadata.

The current adapter ignores system messages when translating `message_end`
events. Tool additions therefore need explicit durable records and transcript
visibility; recording only the user and assistant messages is insufficient.
Invocation identity and recovery checks must include inherited declaration
history and additions, rather than relying only on a hash of the supplied
system prompt and user message.

Responsibility follows the existing modules:

- The [agent port](../../subs/harness/subs/agent/src/interfaces/port.ts)
  exposes session identities, numbered turns/checkpoints and high-level
  operations, tool activation, operation outcomes and events. Preservation and
  automatic restoration are guarantees of those operations. The scripted
  implementation models the same ordering, retry and rejection behavior.
- The [pi adapter](../../subs/harness/subs/agent/subs/pi/src/pi-agent.ts)
  preserves the transcript, registers and rebinds handlers, and checks model
  and transport support.
- The harness chooses the task, submission validator, scope and guards and
  owns the durable storage used by the session abstraction. Caller code supplies
  current execution bindings and records operation outcomes; it does not
  reconstruct inherited prompts or provider declarations itself.

No new module is required. Automatic compaction and the current budget path
that clears active tools must also be accounted for: neither may silently
rewrite the promised prefix. At its limit, the preserving invocation stops.
Only the workflow's predetermined recovery path may then start a different
context, recorded explicitly as such.

### Verification

Use native appended definitions for new tools on the selected supported model
and transport. Generic dispatchers, upfront registration of future tools and
history reuse with a replaced head are not selected alternatives for these
workflows. Unsupported transport combinations report the feature as unavailable;
they do not trigger an automatic fresh start or summary handoff.

An offline serializer check against the installed `gpt-5.6-sol` catalog entry
confirmed that appending a tool produces `additional_tools` followed by the
new user message, while the initial instructions, initial tools and complete
earlier serialized input remain equal. It also confirmed that removal or
same-name redefinition disables this anchoring. This verifies pi-ai's
serialization path only; the harness feature and a live model invocation
have not been implemented or verified.

The first implementation slice should exercise orientation → selector as a
true fork, starting with the stable role prompt and task-specific user message.
Verification should compare the complete request prefix, accept the new selection
submission, reject stale submissions and unauthorized effects, prove parent/child
isolation, and cover restart idempotency, definition conflicts and unsupported
transports. Exercise the same Continue API before and after a process restart.
Retry interrupted and already-completed operations and prove that session/turn
identities, task inputs, additions and accepted results are not duplicated. Cover
inactivation/reactivation, stale-point conflicts, concurrent continuations and
forks at boundaries before and after standalone context or tool changes. Cover
Stop racing with tool completion, uncertain effects, late callbacks and retry
with conflicting bindings or policy. Verify appended role instructions as well
as tools on each supported transport; catalog flags alone are insufficient.
Inject initial reconstruction failures and prove that no provider call occurs;
inject a later failure and prove that no further request is sent and earlier
activity remains.

This is alpha software. Pre-change sessions are outside scope: no legacy-session
compatibility checks, migrations, recovery support or compatibility tests are
required. The preservation and recovery contract applies to sessions created
under the new implementation. Missing evidence in one of those sessions is a
preservation failure, not permission to reconstruct an assumed equivalent head.

## Proposal: predetermined strategies

Choose the strategy when defining the workflow. Each invocation site has a
specified parent and point, task contract and execution scope. The harness follows
that mapping mechanically. It does not estimate relevance, degradation, future
savings or initial context size to choose a different strategy at runtime.

The following mapping is the proposed first scope. It preserves existing fresh
starts where no reusable session is designated, and introduces no separate
summary-generation handoff.

| Use case | Predetermined strategy and source | Reason |
|---|---|---|
| Local-architect orientation → assignment, subsequent completion or repair review, capability qualification | Continue the work item's architect session from its latest settled point, including accepted brief appends | These tasks build on the same acquired understanding |
| Capability-architect actions and nested-need qualification | Continue that capability's architect session | Preserve the plan, progress and reasoning; change the current task and submission contract |
| Engineer repair or capability return within the same iteration; contract-engineer repair | Continue that engineer's session | Preserve the investigation and implementation knowledge |
| Context selection | Fork the orientation point initially; for re-selection, fork the assignment or qualification point requesting it | Use the requesting architect's knowledge while keeping selection activity out of its continuing conversation |
| Engineer read-only consultation | Fork the engineer point associated with the capability request | Answer from its existing knowledge; append the accepted answer to the requesting workflow through its normal records |
| Reconciliation | Fork the architect's completion-request point or the capability architect's handback point | Preserve completion rationale and append the current reconciliation packet |
| Scope review | Fork the assignment point being reviewed, excluding later architect turns | Preserve assignment context while judging the fixed candidate against fixed intent |
| Design review | Fork the pinned design-orientation point for the captured guidance | Reuse understanding; obtain required evidence from the current audited candidate |
| Project-wide placement and unresolved requests (`global-fork` role) | Fork the initial architect's oriented context with accepted decision briefs appended through the request's recorded point | Reuse costly project-wide orientation; keep individual investigations in child sessions |
| Initial architecture, first local or design orientation, catalog extraction, code review, first capability delegation, first engineer or contract-engineer invocation, failure analysis and standalone session commands | Fresh, using their existing input contracts | No reusable parent is designated for these workflows in this proposal; code review retains its independent reading |
| Non-functional coordinator action, investigation and assessment; non-functional repair engineer | Retain the existing fresh-start policy | No shared orientation session is designated in this scope; differing procedures alone are not evidence that fresh starts are cheaper |
| New engineer iteration or restart after an existing budget-return outcome | Fresh from the work note, accepted plan and existing durable return records | Retain the explicit lifecycle boundary and recovery contract; add no summarization invocation |

An existing budget-return outcome has a predetermined recovery path. This does
not introduce a context-size threshold for choosing between strategies at the
start of a task. Existing hard provider limits still apply; reaching an
unsupported limit reports that condition rather than silently changing strategy.

If a designated parent cannot be recovered, use only the workflow's explicit
fresh-session recovery contract from durable records, recording that recovery
as a fresh start. If no such contract applies, report the missing context.
Neither outcome authorizes an implicit summary handoff or a replacement labeled
as a fork. Reused context remains an optimization, never sole durable authority.

### Role, authority and review evidence

Selection, qualification and reconciliation are tasks that can retain the
architect's general role. Their procedures and submission tools belong to the
current task. A change of task name does not require a fresh session.

Scope review is a distinct authority assignment. Append explicit review
instructions at the same instruction level as the inherited role instructions,
limiting this invocation to reviewing the fixed intent and candidate. The
original prefix remains unchanged. A lower-priority user message must not be
relied on to override conflicting system instructions. The adapter must preserve
these later instructions in place on the selected transport, just as it does
appended tool definitions; otherwise this workflow is unavailable there.

Historical tools remain declared, but current execution policy permits only
the review's snapshot operations and submission. Retaining a declaration does
not retain permission to execute it. The reviewer judges the evidence; the
harness enforces scope and submission contracts mechanically.

Scope review here intentionally inherits assignment context. It is not an
independent reading uninfluenced by the author. Code review retains the fresh
start used for that separate purpose. A summary by the author's session would
not establish independence either.

Design review still reads the candidate evidence required by its procedure.
Earlier orientation helps it understand what to inspect and how to interpret
it; required fresh evidence does not make that understanding redundant. Retain
the [existing orientation identity](../architecture/check-findings.md#reusing-agent-context):
guidance selection and hashes, scope, prompt and execution configuration. A
different or unverifiable identity requires a new orientation before subsequent
review forks. This is deterministic input validity, not a runtime estimate of
context quality or savings. The initial-architect prompt likewise describes
the durable project architect role; its current restriction to one
initial-analysis turn moves to that task message.

### Keep long-lived orientation useful without a handoff

For project-wide questions, fork the oriented parent plus the accepted briefs
already appended to it. Return the normal task's concise conclusions and durable
record references, then append those accepted outputs to the parent without
invoking the model. Later questions fork that updated point. Detailed exploration
remains in the child. Dependent questions receive preceding accepted decisions
before they start.

Design reviews similarly fork their designated orientation point rather than a
previous review's growing transcript. These fixed choices isolate task-specific
history without inspecting context size or generating a new summary. Choosing an
earlier point is an explicit workflow rule; it must not omit required accepted
updates.

## Summary handoffs: no current use case selected

A summary handoff would fork the knowledgeable session, ask it for a task-specific
summary, and start a fresh session with its own role prompt and that summary.
The source agent would select the relevant findings, rationale, references,
uncertainties and refresh needs; the harness would transport the result.

This costs an additional model invocation, cached input for summary generation,
new output tokens, fresh ingestion of the summary, and potentially renewed
exploration after details are lost. The recipient waits for the summary before
it can start. Unchanged common leading content may still be cached under the
prefix assumption; the new summary does not inherit the source conversation's
cache merely because it describes it. Later reuse does not remove the initial
preparation and ingestion costs.

The four considerations below remain valid design criteria. Apply them to a
named workflow before implementation; none is a runtime strategy selector in
this proposal.

| Consideration | Evaluation for the current use cases | Proposed disposition |
|---|---|---|
| Context capacity | Engineer iteration boundaries and existing budget returns already have durable work notes and recovery records. No other named workflow has established a need for a separate summary to fit. | Keep those predetermined fresh starts; ordinary continuations and forks elsewhere. No new summary call or initial-size threshold. |
| Degradation from irrelevant history | No observed run establishes such degradation. Repeated global questions and design reviews have known task boundaries that permit forks from designated orientation points. | Isolate their exploration through those fixed fork policies. Do not score context relevance or quality at runtime. |
| Transfer constraints | No destination unable to inherit context is nominated for this scope. Unsupported native additions are a transport capability limitation, not evidence that summarization is preferable. | Report unavailable support. A future named cross-provider/export workflow would need its own transfer contract before selecting a handoff. |
| Repeated downstream savings | The proposed global-question and design-review forks reuse cached oriented parents; global decision briefs are normal task outputs. No comparison establishes a cheaper or faster summary-based replacement. | Reuse those parents. Require a design-time comparison for a concrete repeated workflow before adding a handoff. |

A future handoff proposal must name its source, destination, lifecycle point,
required retained knowledge and reason an ordinary fork is insufficient. Compare
total time to an informed result and total charges for preparation, ingestion,
subsequent calls and remaining exploration. A smaller prompt or different role
name alone is insufficient justification. Runtime adaptive selection may be
considered later as a separate proposal.

## Correctness and validation

- Fix the unfilled working-directory and non-functional placeholders. Fail
  rendering if any required placeholder survives, and use the invocation's
  actual working directory in the task/role context.
- Make each task message, tool definition and accepted submission agree. New
  initial prompts contain no phase-specific schema or permanent submission-tool
  selection; include each full schema once in its tool declaration.
- Continue from the session's latest settled point and reject a stale expected
  point. A new task creates the next numbered turn; retrying an interrupted
  operation retains its turn number and inputs. Branching from an earlier point
  is Fork. Record the actual inherited boundary/checkpoint for both operations.
- Verify preserved request prefixes, ordered appended instructions and tools,
  current execution guards, accepted submissions and durable recovery. Verify
  automatic restoration through ordinary operations and stopping before dispatch
  on preservation failures.
- Record strategy, source point, fresh-recovery reason when applicable, elapsed
  time, exploration calls and duration, and cached/new input and output charges.
  Compare workflow outcomes and review quality offline. Cache share alone cannot
  establish benefit, and no measurement switches the current run's strategy.

## Remaining internal implementation questions

These details belong behind the session operations; none requires the caller to
manage provider transcripts or choose whether restoration is needed.

- The durable representation joining session identity, turn boundaries,
  checkpoints, operation outcomes and exact model-visible history for new
  sessions. Handler rebinding is accepted; legacy sessions are outside scope.
- The request-boundary implementation that rejects an altered prefix even when
  pi swallows an extension error.
- How invocation identity, recovery evidence and transcript views represent the
  high-level operation, inherited point, current task, additions and authority.
- Which further model/transport combinations can implement these fixed contracts.
  Adding one requires verification; it does not add an automatic fallback policy.
