# pi

Implements the agent port on pi (`@earendil-works/pi-coding-agent`, pinned at
0.85.1), in the harness's process. It hides the pi package, its session format
and its login: nothing else in the project imports pi. `createPiAgent` returns
an `AgentPort`; `piReadiness` says which model a session would run, or why
none can run yet.

## How a session runs

- **Prompt.** The spec's system prompt is sent exactly: an inline extension
  replaces pi's assembled prompt on every agent start. pi's discovery of
  context files (`AGENTS.md`, `CLAUDE.md`), extensions, skills, prompt
  templates and themes is off, and settings are in memory, so nothing from
  the target project or the person's pi configuration enters the session.
- **Tools.** Exactly the spec's built-ins (`read`, `grep`, `ls`; `find` needs
  `fd`, which pi would otherwise download), the harness's tools and the
  submission tool, as pi's tool allowlist.
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
  `tool-started` and `tool-finished`, by call ID. Each assistant message
  becomes `message`, with its text (or the tools it called) and its token
  usage.
- **Outcome.** A provider error that survives pi's two retries, or a failure
  to start, is `failed`; a closing message without a submission is `ended`.
- **Stop.** `stop()` aborts the session and resolves when pi is idle. pi's
  abort is cooperative: a tool that ignores its signal delays it. The harness
  bounds the wait and discards anything reported afterwards; so does this
  adapter.
- **Session record.** pi writes its own `.jsonl` into the job's `session/`
  directory, starting with the first assistant message.
- **Model and login.** Credentials are pi's own, in `auth.json` of pi's agent
  directory (`~/.pi/agent`, or `PI_CODING_AGENT_DIR`). The model is the one
  given as `provider/model`, or else the first model pi has credentials for.
  Log in with `npx pi` and `/login` from the package root.

## Testing

`src/tests/pi-agent.test.ts` runs real pi sessions, with pi's agent loop,
tool validation, built-in tools, events, abort and session file, on a
scripted model provider (`tests/helpers/scripted-provider.ts`). The provider
is written against the interface pi's `ModelRuntime.registerNativeProvider`
publishes, so the tests import nothing but pi's public package: pi keeps
pi-ai, which holds its own faux provider, private. The runtime lives in a
temporary agent directory with `PI_OFFLINE=1`; no test calls a network or
touches `~/.pi`.
