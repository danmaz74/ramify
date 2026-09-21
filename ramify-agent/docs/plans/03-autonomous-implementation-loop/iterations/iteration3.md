# Iteration 3: Agent port additions and the pi adapter

**Goal:** give the generic port the semantics every role needs, keep everything
pi-specific behind `harness/agent/pi`, and make the scripted fake emit every one
of them.

## Prerequisites

Iteration 0's results note, which supplies the port contract this iteration
implements. **Do not invent a behavior the spike did not settle.** Where the
spike reported a limitation, implement the adaptation it proposed and record the
limitation; where it reported unavailable, the port reports `unavailable` with a
reason and the harness records a `coverage-gap`.

## Write scope

`subs/harness/subs/agent/` and `subs/harness/subs/agent/subs/pi/`. No harness
core change beyond the imports the new types require.

## Interfaces established

The port additions of the
[proposal](../core-records.proposal.md#agent-port-additions), revised by
iteration 0: `SessionRef`, `SessionSpec.session`, `SessionSpec.context`,
`builtinTools` including `edit` and `write`, `guard`, `afterMutation`,
`AgentSession.ref` and `settled()`, `AgentPort.appendContext`, the
`context-observed` and `compaction` events, `tool-started.mutating`, and the
`context-budget-reached` outcome.

## Work

- **Session modes.** `fresh`, `continue` and `fork`. `startSession` reports the
  mode that was **actual**; a mode that degraded records `degradedReason`. The
  harness records both, so a fork that silently became a fresh session cannot
  corrupt the comparison of fork cost.
- **`appendContext(ref, key, text)`.** Stores text without a model call.
  A repeated key answers `already-present`; a lost session answers
  `session-lost`. The key is the harness's `DecisionId`.
- **Context policy.** `compaction: 'forbidden' | 'allowed'`, `budgetTokens`,
  `budgetFraction`, `reportReserveTokens`, as the results name them. Compaction is port policy, never
  prompt text. A `context-observed` event follows each model or tool boundary
  and carries `{ tokens: number | null, window }`. It is always an estimate, and
  `tokens: null` means unknown, never room: pi reports it after a compaction
  until the next assistant reply, and the threshold then cannot fire. With no
  observation at all the port reports unavailable with a reason. When the threshold is reached the
  port disables tools, allows one final response and ends the session
  `context-budget-reached`.
- **Rejected input.** pi validates tool input before the tool runs and coerces
  it. `tool-finished` carries `reachedTool: boolean`, so every rejection pi makes
  itself is counted and recorded under rule 10, and the harness validates again
  whatever reaches it. By Dan's decision the submission tool keeps the
  permissive schema and harness tools declare their real one; this iteration's
  first real-model test measures whether the submission tool can show its real
  schema, and whether a provider accepts a union discriminated on `kind`.
- **A `SessionRef` names a point** in a session's history, not a session. A fork
  is `createBranchedSession(entryId)`; `AgentSessionRuntime.fork` replaces the
  current session and is the wrong tool. `appendContext` returns the ref after
  the append, and uses `sendCustomMessage(..., { triggerTurn: false })` while the
  adapter holds the live session and `appendCustomMessageEntry` when it does not;
  the wrong route fails silently.
- **Guards.** `guard` is called before a mutating built-in executes; a denial
  becomes that tool's error result and no mutation happens. `afterMutation` is
  called after a mutating tool that executed settles, **whether it succeeded or
  not**, and never for a call the guard denied; the adapter emits `tool-finished`
  from `tool_execution_end`, which fires for every call, and its
  returned text reaches the agent. `tool-started` carries `mutating`, declared
  by the implementation and not inferred by generic harness code.
- **Write tools.** `edit` and `write` join `BuiltinTool`. pi's own `bash` stays
  withheld, which the spike's probe 14 verified; the shell engineers get is a
  harness tool, by decision 12, added in iteration 7.
- **Settlement.** `settled()` resolves when the implementation believes the
  session is idle and its tools have finished. It is evidence the harness uses,
  never the evidence it relies on: the harness still confirms by process group
  and a stable tree.
- **Scripted fake parity.** Every new event, outcome and callback has a script
  step. The fake emits usage, context observations and compaction for every
  session, so the core's tests never depend on pi.
- **pi adapter.** Session modes through the SDK's session manager and fork
  mechanism; the append through whichever of the two documented paths the spike
  showed reaches the model input; compaction through the settings and the
  session's own control, observed through its compaction events; context through
  `getContextUsage()` with the plan's
  [estimate](../main-plan.md#context-thresholds) as the fallback; the guard
  through the pre-tool hook; `edit` and `write` through the allowlist. pi's
  session format, SDK objects and login stay here.

## Acceptance cases owned

None. The roles that use these semantics arrive from iteration 4 onward.

## Guards owned

| Guard | Test |
| --- | --- |
| Token cost, model context usage in tokens and compaction are port events; an implementation that lacks one reports unavailable with a reason, and the scripted fake emits all of them | `subs/harness/subs/agent/src/tests/port-observations.test.ts` |
| Compaction is port policy, never prompt text | `subs/harness/subs/agent/subs/pi/src/tests/compaction-policy.test.ts` |

## Exit evidence

- Every new port behavior has a scripted-fake test and, where the spike allowed
  it, a pi test against the existing offline scripted provider.
- A denied `edit` through the real pi adapter returns a useful error result and
  writes nothing.
- An append with a repeated key answers `already-present` and adds nothing.
- A forked session starts from the parent's point and does not carry the
  parent's later entries.
- A session driven past its threshold ends `context-budget-reached` with one
  final no-tools response, and with no compaction for a forbidden role.
- Each behavior the spike reported unavailable is listed with the reason the
  port returns for it, and no behavior is hidden behind an unverified
  abstraction.
- `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`.
