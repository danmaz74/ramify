# agent

Defines the neutral session operations through which the harness drives agents,
and implements them with an injected scripted driver. Its child Pi owns model
selection, native transport and opaque provider encoding. The harness owns the
store and current executable authority, validators and publication destinations.

## Durable session operations

`AgentPort.sessionOperations` and `bindSessionStore` provide the operations in
`src/interfaces/session-operations.ts`. `create` establishes immutable initial
instructions, declared tools and policy. `continue` admits a current task from
an exact expected point. `fork` copies an exact recorded turn or checkpoint;
`appendContext` and `changeTools` create model-free checkpoints. Reusing an
operation identity with different input is a conflict. No unavailable operation
silently creates a replacement session.

A public `AgentSessionPoint` identifies session, turn and checkpoint. A fork
copies that point's complete history and retains its parent identity even if the
parent later advances. Continuing or forking binds current tools, authority,
submission validator and destination again. Historical declarations remain
immutable; inactive historical tools have no executable authority and cannot
complete the current task.

The caller-owned `SessionStore` provides compare-and-swap committed records and
immutable content-addressed payload bytes. Display events never reconstruct
provider history. Missing or corrupt payloads and unsupported drivers return an
explicit unavailable or failed outcome. The optional receipt indication
`contextUnavailable: true` identifies known missing reusable session/history/payload
inputs without uncertain effects. Missing operation intent, unsupported runtime,
initialization/provider failures and authority conflicts do not set it. The
harness may then start a separate ordinary fresh invocation; the owning operation
never changes its input or creates a replacement. `operationIdentity` reads original
admitted identity without dispatch; `inspect` returns a validated available
snapshot. Unfinished recovery requires the original execution identity and
current bound authority; source-backed fresh recovery belongs to the harness.

`retry` returns a terminal operation's original receipt without model, tool,
submission or destination work. `stop` closes admission and aborts promptly. An
operation handle's `receipt` is its durable terminal decision; `settled()` waits
for actual driver, tool and publication drainage. The caller retains its
settlement bound. A stopped interrupted provider operation has no reusable
current point; previous settled points remain valid.

## Tools and observations

A `ToolDefinition.execute` returns neutral text and declares its mutation and
`ToolAction`; guards run before admitted mutating effects, and `afterMutation`
runs after executed mutations settle. A current submission validator accepts,
rejects with errors for another submission attempt in the current task, or rejects finally. A closing model message
alone is no accepted result. A raw context limit fails unfinished work without
inventing a partial submission or requesting a fresh session.

Agent events carry user/assistant/tool messages, tool-call identities, usage,
context estimates and available timing/source observations. Unknown quantities
remain unknown. Original opaque signatures and native payloads stay with the
provider owner. Observations and support facts do not authorize recovery or
prove semantic completion; architects retain that judgment.

## Scripted verification

`createScriptedAgent` binds the same durable operation engine to explicit script
answers and an injected store. Its actor callback may receive full inherited
model perception; the current received task is separately retained. Fixture loss
injection acts at the owned store read boundary. Ordinary tests script external
commands and model responses under the process guard. Exact registered native
witnesses separately establish installed Git, transport and process behavior.
