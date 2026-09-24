# pi

Implements the agent port on pi (`@earendil-works/pi-coding-agent`, pinned at
0.87.1), in the harness's process. It hides the pi package, its session format
and its login: nothing else in the project imports pi. `createPiAgent` returns
an `AgentPort`; `piReadiness` says which model a session would run, or why
none can run yet.

## How a session runs

- **Prompt.** The spec's system prompt is sent exactly: an inline extension
  replaces pi's assembled prompt on every agent start. pi records its own
  prompt and tool state as system messages in the session, and a replaced
  prompt reaches the model as the request's only system message, holding the
  spec's text and the current tools. pi's discovery of
  context files (`AGENTS.md`, `CLAUDE.md`), extensions, skills, prompt
  templates and themes is off, and settings are in memory, so nothing from
  the target project or the person's pi configuration enters the session.
- **Session.** `fresh` creates a session file, `continue` opens the one a ref
  names, and `fork` branches the parent at the entry a ref names, into a file
  of its own, leaving the parent untouched. A mode that cannot be honored
  degrades to `fresh` and `AgentSession.start` says why. The session manager
  is resolved before anything runs, so the mode and `ref` are readable at
  once.
- **Appended context.** A session this adapter still holds receives a brief
  through `sendCustomMessage(..., { triggerTurn: false })`, which reaches
  that session's own next model input; one it no longer holds receives a
  custom message entry on the file. A repeat is recognized by the key carried
  on the entry, so the same brief is never appended twice.
- **Tools.** Exactly the spec's built-ins (`read`, `grep`, `ls`, and `edit`
  and `write` where the spec asks for them; `find` needs `fd`, which pi would
  otherwise download), the harness's tools and the submission tool, as pi's
  tool allowlist. pi's own `bash` and `powershell` are withheld and cannot be
  re-enabled; the shell an engineer receives is a harness tool.
- **Guard.** `edit` and `write`, and any harness tool that declares itself
  mutating, pass through the spec's `guard` before they execute; a denial
  becomes that call's error result, nothing is mutated and the session
  continues. `afterMutation` runs after a mutating call that executed
  settles, succeeded or failed, and never for a denied one; its text is
  appended to the call's result.
- **Context and compaction.** The context is read after every model and tool
  boundary and reported as `context-observed`. pi's figure is always an
  estimate, and it is `null` between a compaction and the next assistant
  reply, which the port reports as unknown rather than as room. Compaction is
  the spec's policy: a forbidden session has pi's automatic compaction off
  and this adapter never compacts it. pi's own compaction thresholds are
  separate from the policy's `reportReserveTokens`, which is room for a
  role's report.
- **Budget.** When an observation reaches the session's budget the adapter
  removes every tool, which applies to the next model request including the
  continuation of a running turn, and the session ends
  `context-budget-reached` with that final response as its report. An
  accepted submission still wins.
- **Submission.** pi validates tool input before a tool runs, and a call it
  rejects never reaches the harness. The submission tool is therefore given
  to pi with a schema that names the top-level fields and constrains nothing,
  so that every call reaches `accept` and counts toward the harness's
  correction bound. The full schema is in the tool's description.
  - Accepted: the result ends the loop (`terminate`), and the outcome is
    `submitted`. If the model called another tool in the same turn, the loop
    would go on, so the adapter aborts it after that turn.
  - Rejected: an error result with every error; the session continues.
  - Final: an error result that ends the loop; the outcome is `ended`.
- **Events.** `tool_execution_start` and `tool_execution_end` become
  `tool-started` and `tool-finished`, by call ID. `tool-started` carries
  `mutating`, which this adapter declares, and the call's action: pi's
  `read` (`path`, `offset`, `limit`), `grep` and `find` (`pattern`, `path`,
  `glob`), `ls` (`path`), and `edit` and `write` (`path`) are classified
  here, the one place their names are read; a harness tool's action is its
  declaration, and anything else is `other`. The guard and `afterMutation`
  receive the same action; `tool-finished` carries
  `reachedTool`, which is false for a call pi's own validation rejected, so
  every such rejection is counted without reading pi's message text.
  `message_end` becomes `message` for every conversation role: the first
  prompt, which pi reports before the model call; each assistant message;
  each tool result, as the agent saw it; and pi's `custom` messages, such as
  a brief, as the user's. pi's `system` messages, which record its own prompt
  and tool state, are left out. An assistant message carries its blocks: text, thinking (`redacted`
  when pi marks it so, otherwise `unmarked`, since pi does not say whether
  the provider summarized it) and tool calls with their actions. Its usage
  and detail follow: the model that answered, pi's provider thinking level,
  the stop reason and error, reasoning tokens, cache writes by retention, and
  the cost, which is null for a model pi has no rates for. Detail pi does not
  report is null. Signatures and other opaque provider data stay in pi's
  file, and an image is an `other` block that is described, not carried.
  `compaction_start` and `compaction_end` become `compaction`, with the
  reason and the sizes the event carries, and `auto_retry_start` and
  `auto_retry_end` become `retry`. Nothing is read from pi's session file.
- **Outcome.** A provider error that survives pi's two retries, or a failure
  to start, is `failed`; a closing message without a submission is `ended`.
- **Stop and settlement.** `stop()` aborts the session and resolves when pi
  is idle. pi's abort is cooperative: a tool that ignores its signal delays
  it. The harness bounds the wait and discards anything reported afterwards;
  so does this adapter. `settled()` answers `settled` once the session has
  ended and pi reports itself idle, and `timed-out` at its bound. pi waits
  for an in-process tool but cannot see a descendant process, so settlement
  here is evidence only: the harness confirms it by process group and a
  stable tree.
- **Session record.** pi writes its own `.jsonl` into the job's `session/`
  directory, starting with the first assistant message. It holds pi's
  `system` messages beside the conversation.
- **Support.** The adapter declares every entry of the port's
  `ExecutorSupport` available: pi observes usage, context and compaction,
  continues and forks a session at the entry a ref names, appends without a
  model call, sends the exact system prompt, runs the guard and the
  after-mutation hook, and reports thinking and its own retries.
- **Model and login.** Credentials are pi's own, in `auth.json` of pi's agent
  directory (`~/.pi/agent`, or `PI_CODING_AGENT_DIR`). The model is the one
  given as `provider/model`, or else the first model pi has credentials for.
  Log in with `npx pi` and `/login` from the package root.

## Testing

`src/tests/` runs real pi sessions, with pi's agent loop, tool validation,
built-in tools, events, abort, compaction and session file, on a scripted
model provider (`tests/helpers/scripted-provider.ts`); `tests/helpers/session.ts`
starts one. `pi-agent.test.ts` covers the prompt, the tools, the submission
and stop; `session-modes.test.ts` the modes and appended context;
`guarded-writes.test.ts` the write built-ins, the guard, the after-mutation
hook and settlement; `compaction-policy.test.ts` the compaction policy;
`context-budget.test.ts` the context observations and the budget; and
`tool-actions.test.ts` the classification of pi's tools as actions and the
declared support. The provider
is written against the interface pi's `ModelRuntime.registerNativeProvider`
publishes, so the tests import nothing but pi's public package: pi keeps
pi-ai, which holds its own faux provider, private. The runtime lives in a
temporary agent directory with `PI_OFFLINE=1`; no test calls a network or
touches `~/.pi`.
