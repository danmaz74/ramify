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
- `SessionSpec` holds the role, the scope (the working directory), the
  complete system prompt, the first user message, and the built-in read and
  search tools to enable. It also holds the harness's own tools with JSON
  Schema inputs, the submission tool, a directory for the implementation's
  session record, and an `onEvent` callback.
- Events are `tool-started` and `tool-finished`, matched by `callId`, and
  `message` with token usage where the agent reports it.
- The submission tool's `accept` judges every call:
  - accepted ends the session with outcome `submitted`;
  - rejected with errors goes back to the same session as an error tool
    result, and the session continues;
  - a `final` rejection ends the session with outcome `ended`.
  An agent finishes only through this tool; a closing message is never a
  result.
- `outcome` settles once with `submitted`, `ended`, `failed` or `stopped`,
  and never rejects.
- `stop()` aborts cooperatively and resolves when the session is idle, which
  may be late or never. The caller bounds the wait and discards anything the
  session produces afterwards.

## The scripted fake

`createScriptedAgent(script)` replays steps in order and checks for Stop
before each one:

- `tool` calls a harness tool for real, or only reports a built-in one.
- `message` reports a message, with optional usage.
- `submit` calls the submission tool.
- `wait` waits and ends early on Stop.
- `stall` waits and ignores Stop. With `thenIgnoreStop`, it keeps running
  the script after Stop, so it can submit late.
- `hang` never settles.
- `fail` crashes the session; `end` stops without a submission.

A script may be a function of the session's spec. `sessions` records each
spec, verdict and outcome for tests.

## Testing

Tests in `src/tests/` run the fake against an in-memory spec. The harness's
own tests run jobs against the fake; nothing here uses pi or the network.
