# agent

Defines the port through which the harness drives an agent session, and
implements it with a scripted fake. It hides how a session is driven: the
harness starts a session with a role, a scope, a prompt and tools, receives
its events, receives at most one accepted structured submission, and can
stop it, without knowing which agent runs it. Its child `pi` implements the
port on pi; this module relays it to the harness.

## The port

`src/interfaces/port.ts`, exposed to the parent and to descendants, so that
implementations beneath this module receive it:

- `AgentPort.startSession(spec)` returns an `AgentSession` at once. A failure
  to start is reported through its `outcome`, never thrown.
- `AgentPort.support` is the `ExecutorSupport` the implementation declares:
  each entry available, or unavailable with a reason. Usage, context size
  and compaction are port events; one an implementation cannot observe is
  recorded as a coverage gap, and silence is never read as an empty
  context. The rest are session control: `continue`, `fork`, `forkAtPoint`
  (a fork from any ref, not only a latest one), `appendContext`,
  `exactSystemPrompt`, `guard` and `afterMutation`. A start the executor
  lacks degrades to `fresh` with the declared reason.
- `SessionSpec` holds the role, the scope (the working directory), the
  complete system prompt, the first user message, and the built-in tools to
  enable, which may include `edit` and `write` but never a shell. It also
  holds the harness's own tools with JSON Schema inputs, the submission tool,
  a directory for the implementation's session record, and an `onEvent`
  callback.
- `SessionSpec.session` is where the session starts: `fresh`, `continue` from
  a ref, or `fork` from one. `AgentSession.start` reports the mode that was
  **actual**, with a `degradedReason` when the requested one could not be
  honored, so that a fork which silently became a fresh session cannot pass
  for a fork.
- `SessionSpec.context` is the context policy: whether compaction is
  `forbidden` or `allowed`, the budget as a fraction of the reported window
  or as an absolute figure, and the room reserved for a final report. It is
  port policy and never prompt text.
- `SessionSpec.guard` is called before a mutating call executes; a denial
  becomes that call's error result and nothing is mutated.
  `SessionSpec.afterMutation` is called after a mutating call that executed
  settles, whether it succeeded or not, and never for a denied one; its text
  is appended to the call's result, so a check the harness ran reaches the
  agent before its next step. A tool declares its own mutation; no generic
  code infers it from a name.
- A `SessionRef` names a point in a session's history, not a session.
  `AgentSession.ref` advances as the session runs, and
  `AgentPort.appendContext(ref, key, text)` stores text without a model call,
  answering `appended`, `already-present` for a repeated key, or
  `session-lost`.
- `AgentSession.settled()` answers `settled` or `timed-out`. It is the
  implementation's own belief, which the harness uses as evidence and never
  relies on: the harness confirms settlement itself, by process group and a
  stable tree.
- Every tool call carries a neutral `ToolAction`: a `read` of a path and a
  `LineRange`, a `search` (a pattern, where, and a glob; no pattern for a
  listing), a `write` of `paths`, a `command`, a `harness` tool, or `other`.
  The implementation classifies its own tools from their names and inputs;
  a harness tool declares its action through `ToolDefinition.action`, and
  the default is `harness`. `tool-started`, `GuardedCall` and
  `SettledMutation` carry it beside the executor's own tool name and input,
  which are for display. Nothing above the port reads a call otherwise.
- Events are `tool-started`, carrying `action` and `mutating`, and `tool-finished`,
  matched by `callId` and carrying `reachedTool`, which is false when the
  implementation rejected the input before the tool ran; `message` with token
  usage where the agent reports it; `context-observed` with the estimated
  size and the window, where `tokens: null` means unknown and never room; and
  `compaction` with its reason and its sizes.
- The submission tool's `accept` judges every call:
  - accepted ends the session with outcome `submitted`;
  - rejected with errors goes back to the same session as an error tool
    result, and the session continues;
  - a `final` rejection ends the session with outcome `ended`.
  An agent finishes only through this tool; a closing message is never a
  result.
- `outcome` settles once with `submitted`, `ended`, `failed`, `stopped` or
  `context-budget-reached`, and never rejects. Reaching the budget disables
  the tools, allows one final response and ends the session with that
  response as the report; it is never a completion.
- `stop()` aborts cooperatively and resolves when the session is idle, which
  may be late or never. The caller bounds the wait and discards anything the
  session produces afterwards.

## The scripted fake

`createScriptedAgent(script)` replays steps in order and checks for Stop
before each one:

- `tool` calls a harness tool for real, or only reports a built-in one; the
  write built-ins really write, to the one path their action names.
  `mutating` overrides what the tool declares, so a script can exercise the
  guard over any name, and `reachedTool: false` is a call the implementation
  itself rejected before the tool ran. `action` is the call's action; without
  it a harness tool's declared action is used, and a built-in's is
  classified from the input the port's names take.
- `message` reports a message, with optional usage.
- `context` observes the context after a boundary, and reaches the budget
  when the policy says so.
- `compaction` compacts, unless the session's policy forbids it, in which
  case the step is suppressed and counted.
- `submit` calls the submission tool.
- `wait` waits and ends early on Stop.
- `stall` waits and ignores Stop. With `thenIgnoreStop`, it keeps running
  the script after Stop, so it can submit late.
- `hang` never settles.
- `fail` crashes the session; `end` stops without a submission.

`toolNames` gives the port's built-ins other names, so a script can play an
executor whose read tool is `Read`; `support` declares what the fake lacks.
A script may be a function of the session's spec. `sessions` records each
spec, verdict and outcome for tests, along with the mode that was actual,
the appended context the session started with, every tool result the agent
saw, the calls the guard denied, and what the policy or the budget refused.
The fake implements every port behavior, including the session modes,
`appendContext`, the guard and the after-mutation hook, settlement and the
budget, so the harness's tests never depend on pi.

## Testing

Tests in `src/tests/` run the fake against an in-memory spec. The harness's
own tests run jobs against the fake; nothing here uses pi or the network.
