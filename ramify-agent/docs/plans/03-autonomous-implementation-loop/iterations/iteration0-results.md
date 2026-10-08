# Iteration 0 results: pi and session lifecycle spike

**Date:** 2026-09-20. **Status:** complete. The
[iteration brief](iteration0.md) is satisfied: the baseline was re-established,
sixteen probes were run against the pinned SDK and none is recorded as assumed.

No production code was written. The probes lived in `spikes/autonomous-loop/`,
outside every module, outside the compiler's scope and outside the Vitest
selection; nothing imported them. The obsolete spike tree was removed on
2026-10-04. The results below retain the evidence from that run; its probe
command is no longer available in the checkout.

**How the probes reach pi.** There is no pi login on this machine, so no probe
made a real model call. Each instead runs a real pi session — its own agent
loop, tool-argument validation, built-in tools, event stream, abort,
compaction and session file — over the scripted provider the pi module's tests
already use, registered through `ModelRuntime.registerNativeProvider`. Only the
model's replies are invented. That covers every behavior the plan depends on
except one: whether a real provider accepts a `z.toJSONSchema` union schema.
That single sub-question of probe 16 is recorded as not done, with its reason.

## 1. Baseline

Run from `ramify-agent/` before anything else.

```text
=== npm run type-check ===

> ramify-agent@0.0.0 type-check
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json

EXIT: 0

=== npm test ===

> ramify-agent@0.0.0 test
> vitest run


 RUN  v4.1.11 /ramify/ramify-agent


 Test Files  21 passed (21)
      Tests  160 passed (160)
   Start at  13:54:26
   Duration  32.91s (transform 1.93s, setup 0ms, import 11.43s, tests 74.43s, environment 6.08s)

EXIT: 0

=== npm run build:web ===

> ramify-agent@0.0.0 build:web
> NODE_ENV=production vite build --config subs/web/vite.config.ts

vite v8.3.0 building client environment for production...
transforming...
✓ 287 modules transformed.
rendering chunks...
computing gzip size...
dist/web/index.html                   0.39 kB │ gzip:   0.26 kB
dist/web/assets/index-BVUPCXfX.css    6.25 kB │ gzip:   1.78 kB
dist/web/assets/index-DJ9mvXsL.js   430.38 kB │ gzip: 129.68 kB

✓ built in 200ms
EXIT: 0

=== npm run check:self ===

> ramify-agent@0.0.0 check:self
> ramify check --batch --root .

Root: /ramify/ramify-agent (given)
Configuration: /ramify/ramify-agent/tsconfig.json
Mode: batch
Execution: completed; check: passed; coverage: complete
Stages: registry=completed, acquisition=completed, parse=completed, catalog=completed, link=completed, access=completed, decide=completed, report=completed
Requested capabilities: registry=executed, layout=executed, metadata=executed, descriptions=executed, source-catalog=executed, exposure-linking=executed, static-access=executed, tags-origin=executed, namespace-access=executed, lazy-access=executed, symbol-free-access=executed, resource-access=executed, coverage=executed
Completed scope: 5 owners, 73 source files, 3 resources, 776 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 478 allowed, 0 denied, 298 external
Walked source areas: src, src/tests, subs/harness/src, subs/harness/src/tests, subs/harness/subs/agent/src, subs/harness/subs/agent/src/tests, subs/harness/subs/agent/subs/pi/src, subs/harness/subs/agent/subs/pi/src/tests, subs/web/src, subs/web/src/tests
EXIT: 0
```

And the two Ramify commands:

```text
=== ramify materialize --view architect ===
Root: /ramify/ramify-agent
Materialized: revision 1; 1 target(s), 338 entries, 162374 bytes written, 0 unchanged
Architect view: .ramify-architect, 5 modules, 338 records, dependencies measured
EXIT: 0

=== _meta.json ===
{"schema":"ramify.architect-view/1","revision":"rev/1:5ffe9f33-7468-48cf-b54e-18ddcd610cad:1","input":"input/1:f8bd3dd94ccce942fefd1858909fd4dfec6053ce3c0eca9a5ccc702e843a7625","modules":5,"dependencies":"measured","dependencyScope":"production","testReferences":"measured","metrics":"measured","cut":92}

=== ramify measure ===
Root: /ramify/ramify-agent
Revision: rev/1:5ffe9f33-7468-48cf-b54e-18ddcd610cad:1
Views: measured
Module                         Scope    Prod src   Prod res  Test src   Test res  Docs      Views o/t
-----------------------------  -------  ---------  --------  ---------  --------  --------  -------------
ramify-agent                   exact    2/5007     0/0       1/1694     0/0       2/8242    28721/28718
ramify-agent                   subtree  47/241188  3/14778   26/177078  0/0       10/31325  122332/122317
ramify-agent/harness           exact    28/156355  2/7469    15/109845  0/0       2/13288   6238/6235
ramify-agent/harness           subtree  31/183867  2/7469    18/138871  0/0       6/19932   65971/65962
ramify-agent/harness/agent     exact    2/11406    0/0       1/4879     0/0       2/3163    28254/28251
ramify-agent/harness/agent     subtree  3/27512    0/0       3/29026    0/0       4/6644    59733/59727
ramify-agent/harness/agent/pi  exact    1/16106    0/0       2/24147    0/0       2/3481    31479/31476
ramify-agent/harness/agent/pi  subtree  1/16106    0/0       2/24147    0/0       2/3481    31479/31476
ramify-agent/web               exact    14/52314   1/7309    7/36513    0/0       2/3151    27640/27637
ramify-agent/web               subtree  14/52314   1/7309    7/36513    0/0       2/3151    27640/27637
EXIT: 0
```

### Does the baseline still match?

**On substance, yes; on identity, no, and the difference is explained.** The
main plan recorded 5 owners, 73 source files, 776 accesses, 0 findings and a
type check at exit 0. All five figures are unchanged, and `npm test`,
`build:web` and `check:self` all exit 0.

The revision and the input identity both differ:

| | Recorded in the main plan | Measured now |
| --- | --- | --- |
| revision | `rev/1:7c47db45-ed53-4d35-ab73-65b8a5c4bdcb:1` | `rev/1:5ffe9f33-7468-48cf-b54e-18ddcd610cad:1` |
| input | `input/1:a9cd361b802e43465f59efd10185aa245b21b4aea1539b5c241cf4a1b32193c8` | `input/1:f8bd3dd94ccce942fefd1858909fd4dfec6053ce3c0eca9a5ccc702e843a7625` |

The revision's UUID is fresh on each `materialize`, so it carries no
information about drift. The input identity changed because Plan 1's completion
report found that it covers **every directory listing**, not only TypeScript
source, and this plan's own documents were added to `docs/plans/` after the main
plan was authored. No source file changed: the source counts and the access
count are identical. This is incidental confirmation of what iteration 2 is
asked to verify under decision 9, and iteration 2 should still perform its own
deliberate test by changing a non-TypeScript resource.

The baseline was re-run after the probes were written. It is unchanged:
`type-check` exits 0, and `check:self` reports the same 5 owners, 73 source
files, 776 accesses and 0 findings. `spikes/` lies outside `tsconfig.json`'s
`include` (`src/**/*`, `subs/**/src/**/*`) and outside the Vitest `include`
patterns, so the probes are invisible to all three commands.

## 2. The probes

Sixteen probes, sixteen verdicts, none of them assumed: **12 verified, 4
verified with a limitation, 0 unavailable**.

| # | Behavior | Verdict | What it turned on |
| ---: | --- | --- | --- |
| 1 | Continue a role session | **verified** | `SessionManager.open(file)` handed to `createAgentSession`; the same process and a second process both resume with history |
| 2 | Continue after a structured submission ends the turn | **verified** | `prompt()` is accepted after a `terminate: true` tool result, resumes from the same history, and the submission tool is callable again |
| 3 | Fork from an oriented point | **verified** | `createBranchedSession(entryId)`, not `AgentSessionRuntime.fork` |
| 4 | Append without inference | **verified** | All three routes cause zero model calls; only two of them reach the model input, and they differ |
| 5 | The append reaches the next fork | **verified** | Both context-bearing routes reach the fork's rendered input |
| 6 | Context observation | **verified with a limitation** | `tokens` is itself an estimate, never an exact provider figure |
| 7 | Disable compaction | **verified** | Driven past 100% of the window with no `compaction_start` |
| 8 | Observe compaction | **verified** | `reason: 'threshold'`, with before and after sizes on `compaction_end.result` |
| 9 | Threshold-triggered final response | **verified** | Takes effect on the next model request, including the continuation of a running turn |
| 10 | Guarded `edit` and `write` | **verified** | Nothing written, the reason reaches the model, the session continues |
| 11 | After-mutation observation | **verified with a limitation** | The `tool_result` hook fires for a failed tool but never for a blocked one |
| 12 | Cancellation and settlement | **verified with a limitation** | `abort()` waits for an in-process tool but not for a descendant process |
| 13 | Session reconstruction after restart | **verified** | Session file version 3; the file is the whole handover |
| 14 | Withholding the shell | **verified** | `bash` and `powershell` are absent from the offered tools and from the system prompt, and cannot be re-enabled |
| 15 | Usage and events | **verified** | The delivered event union and the usage fields, recorded verbatim |
| 16 | Invalid tool input | **verified with a limitation** | pi rejects before `execute` and **coerces**; provider acceptance of the union schema is untested |

### Evidence

Each block is the probe's own output. Every line is a value the probe read from
the SDK, not a restatement.

#### 1. Continue a role session — **verified**

```text
sessionFile = true
messagesAfterFirstTurn = 2
reopenedMessages = 2
reopenedSessionId = true
secondRequestCarriesHistory = true
secondRequestMessageCount = 3
newProcess = {"messages":4,"carried":true,"requestMessages":5}
```

#### 2. Continue after a structured submission ends the turn — **verified**

```text
submissionsAfterFirstTurn = 1
requestsAfterFirstTurn = 1
isIdleAfterTerminate = true
isStreamingAfterTerminate = false
eventsAfterFirstTurn = ["agent_start","turn_start","message_start","message_end","message_start","message_update","message_update","message_end","tool_execution_start","tool_execution_end","message_start","message_end","turn_end","agent_end","agent_settled"]
secondPromptThrew = null
requestsAfterSecondPrompt = 2
secondRequestCarriesTheSubmissionAndItsResult = true
submissionsAfterSecondTurn = 2
messagesAtEnd = 6
```

#### 3. Fork from an oriented point — **verified**

The fork is `SessionManager.open(parent).createBranchedSession(entryId)`, which writes a new file. `AgentSessionRuntime.fork` was not used: it replaces the runtime’s current session rather than producing a second one, so it does not fit a harness that keeps the parent open.

```text
forkPointEntryId = true
parentEntries = 8
forkFileCreated = true
forkEntries = 4
forkRequestHas = {"ALPHA":true,"BETA":false,"GAMMA":false}
parentFileUnchanged = true
parentLeafUnchanged = true
parentEntriesUnchanged = true
```

#### 4. Append without inference — **verified**

Zero model calls for all three routes. `sendCustomMessage(..., { triggerTurn: false })` reaches the model input: true. `appendCustomMessageEntry` reaches it: false. `appendCustomEntry` reaches it: false.

```text
requestsBeforeAppends = 1
requestsAfterAppends = 1
isIdleAfterAppends = true
entriesAfterAppends = 7
reachedTheModelInput = {"sendCustomMessage":true,"customMessageEntry":false,"customEntry":false}
forkRequestHas = {"BRIEF-SEND":true,"BRIEF-MESSAGE-ENTRY":true,"BRIEF-CUSTOM-ENTRY":false}
```

#### 5. The append reaches the next fork — **verified**

```text
requestsBeforeAppends = 1
requestsAfterAppends = 1
isIdleAfterAppends = true
entriesAfterAppends = 7
reachedTheModelInput = {"sendCustomMessage":true,"customMessageEntry":false,"customEntry":false}
forkRequestHas = {"BRIEF-SEND":true,"BRIEF-MESSAGE-ENTRY":true,"BRIEF-CUSTOM-ENTRY":false}
```

#### 6. Context observation — **verified-with-limitation**

`tokens` is never an exact provider figure: pi computes `calculateContextTokens(lastAssistantUsage) + estimateTokens(messages after it)`, which charges cacheWrite as well and counts characters, not bytes. `contextWindow` is the model’s. `tokens` was null immediately after a compaction with no assistant response since.

```text
beforeAnyTurn = {"tokens":0,"contextWindow":40000,"percent":0}
afterOneTurn = {"tokens":1550,"contextWindow":40000,"percent":3.875}
planEstimateAfterOneTurn = {"tokens":1250,"usage":1250,"trailingBytes":0}
lastAssistantUsage = {"input":1000,"output":50,"cacheRead":200,"cacheWrite":300,"totalTokens":1550,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}}
calculateContextTokensOfThatUsage = 1550
afterAppendingFourThousandChars = {"tokens":2550,"contextWindow":40000,"percent":6.375}
planEstimateAfterAppend = {"tokens":2279,"usage":1250,"trailingBytes":4113}
requestsSoFar = 1
afterThreeTurns = {"tokens":3270,"contextWindow":40000,"percent":8.175}
compaction = {"tokensBefore":3270,"estimatedTokensAfter":766,"summaryChars":36}
afterCompaction = {"tokens":null,"contextWindow":40000,"percent":null}
planEstimateAfterCompaction = {"tokens":3270,"usage":3270,"trailingBytes":0}
```

#### 7. Disable compaction — **verified**

The threshold (10000 - 2000) was crossed and no compaction_start arrived. `setAutoCompactionEnabled(false)` is per session and does not prevent an explicit `compact()`.

```text
autoCompactionEnabled = false
compactionSettings = {"enabled":false,"reserveTokens":2000,"keepRecentTokens":500}
contextUsageAfterEachTurn = [{"tokens":1020,"contextWindow":10000,"percent":10.2},{"tokens":9520,"contextWindow":10000,"percent":95.19999999999999},{"tokens":10032,"contextWindow":10000,"percent":100.32000000000001}]
compactionEvents = []
modelRequests = 3
messagesAtEnd = 6
```

#### 8. Observe compaction — **verified**

reason was `threshold`. Before and after sizes come from `compaction_end.result` (`tokensBefore`, `estimatedTokensAfter`): true. `getContextUsage()` reports `tokens: null` between the compaction and the next assistant reply, so the after size must be read from the event, not from the session.

```text
autoCompactionEnabled = true
compactionSettings = {"enabled":true,"reserveTokens":2000,"keepRecentTokens":500}
contextUsageAfterEachTurn = [{"tokens":1020,"contextWindow":10000,"percent":10.2},{"tokens":null,"contextWindow":10000,"percent":null},{"tokens":820,"contextWindow":10000,"percent":8.200000000000001}]
compactionEvents = [{"type":"compaction_start","reason":"threshold"},{"type":"compaction_end","reason":"threshold","aborted":false,"tokensBefore":9520,"estimatedTokensAfter":2025}]
modelRequests = 4
messagesAtEnd = 5
```

#### 9. Threshold-triggered final response — **verified**

The removal takes effect on the next model request. Called from inside a running tool it already applies to the continuation request of the same run: true. One final response with no tool call was obtained: "here is my final report, with no tool call".

```text
activeToolsAtStart = ["work"]
toolsOfferedOnRequest0 = ["work"]
toolsOfferedOnRequest1 = []
activeToolsAfterTurn = []
requestsAfterFirstPrompt = 2
finalAssistantText = "here is my final report, with no tool call"
toolsOfferedOnRequest2 = []
```

#### 10. Guarded `edit` and `write` — **verified**

Both built-ins were enabled through the `tools` allowlist; the `tool_call` hook’s `{ block: true, reason }` reached the model as an error tool result, the session continued, and neither blocked target was touched.

```text
guardSawCalls = [{"tool":"write","blocked":true},{"tool":"edit","blocked":true},{"tool":"write","blocked":false},{"tool":"write","blocked":false}]
toolExecutionEnd = [{"tool":"write","isError":true},{"tool":"edit","isError":true},{"tool":"write","isError":false},{"tool":"write","isError":true}]
postToolHooks = [{"hook":"tool_result","tool":"write","isError":false},{"hook":"tool_result","tool":"write","isError":true}]
activeTools = ["read","write","edit"]
modelSawTheReason = true
modelSawBothReasons = 2
modelSawTheHookCheckTheResultHookAdded = true
sessionContinuedAfterBlocks = true
blockedFileExists = false
editedFileUnchanged = true
allowedFileWritten = true
```

#### 11. After-mutation observation — **verified-with-limitation**

The `tool_result` extension hook fires for a mutating tool that failed on its own (1 of 2 firings carried `isError`), but only for tools that executed: it fired 2 times for 2 executed calls out of 4 attempted, so a blocked call never reaches it. The `tool_execution_end` session event fired for all 4, blocked calls included, so after-mutation observation must come from that event rather than from `tool_result`.

```text
guardSawCalls = [{"tool":"write","blocked":true},{"tool":"edit","blocked":true},{"tool":"write","blocked":false},{"tool":"write","blocked":false}]
toolExecutionEnd = [{"tool":"write","isError":true},{"tool":"edit","isError":true},{"tool":"write","isError":false},{"tool":"write","isError":true}]
postToolHooks = [{"hook":"tool_result","tool":"write","isError":false},{"hook":"tool_result","tool":"write","isError":true}]
activeTools = ["read","write","edit"]
modelSawTheReason = true
modelSawBothReasons = 2
modelSawTheHookCheckTheResultHookAdded = true
sessionContinuedAfterBlocks = true
blockedFileExists = false
editedFileUnchanged = true
allowedFileWritten = true
```

#### 12. Cancellation and settlement — **verified-with-limitation**

`abort()` waits for an in-process tool even when that tool ignores its signal, and `agent_settled` fires (2 times). It does not wait for a descendant process: a detached child wrote its file after the session reported idle: true. The SDK therefore cannot confirm that no writer remains, and the harness must confirm settlement itself by process group and a stable tree, as the plan assumes.

```text
isStreamingBeforeAbort = true
abortWaitedForTheRunningToolMs = true
toolSawTheAbortSignal = true
inProcessWriteHadAlreadyLandedWhenAbortResolved = true
isIdleAfterAbort = true
agentSettledAfterFirstAbort = 1
detachToolRan = true
isIdleAfterSecondAbort = true
agentSettledAtEnd = 2
detachedFileExistsWhenTheSessionReportsIdle = false
detachedFileExistsTwoSecondsLater = true
```

#### 13. Session reconstruction after restart — **verified**

A second process reopens the file with `SessionManager.open` and rebuilds the same message list, including the tool call, its result and the appended brief. No pi object crosses the process boundary; the session file is the whole handover.

```text
entriesWrittenByTheFirstProcess = 7
messagesInTheFirstProcess = 5
sessionFileVersion = 3
newProcess = {"messages":5,"entries":7,"hasToolResult":true,"hasBrief":true,"hasAssistantText":true,"contextUsage":{"tokens":29,"contextWindow":200000,"percent":0.0145}}
```

#### 14. Withholding the shell — **verified**

The allowlist withholds `bash` and `powershell`; they appear neither in the offered tool list nor in the system prompt, they survive a `reload()`, and `setActiveToolsByName` cannot enable a tool that is not in the registry. A model that calls one anyway gets an unknown-tool error result and the call has no effect.

```text
activeToolNames = ["read","grep","ls","find","edit","write","run_scope_tests"]
allConfiguredTools = ["read","edit","write","grep","find","ls","run_scope_tests"]
toolsOfferedOnRequest0 = ["read","grep","ls","find","edit","write","run_scope_tests"]
modelWasToldAboutTheCall = true
shellSideEffect = false
systemPromptMentionsBash = false
activeToolNamesAfterReload = ["read","grep","ls","find","edit","write","run_scope_tests"]
activeToolNamesAfterAskingForBash = ["read"]
```

#### 15. Usage and events — **verified**

One ordinary turn delivers `agent_start`, `turn_start`, paired `message_start`/`message_update`/`message_end`, `tool_execution_start`/`tool_execution_end`, `turn_end`, `agent_end`, `agent_settled`. Per-message usage carries `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens` and `cost`; `getSessionStats()` aggregates those over every entry, compacted history included, and carries `contextUsage`. Usage values here are the scripted provider’s; only their presence and shape are evidence.

```text
eventsInOrder = ["agent_start","turn_start","message_start","message_end","message_start","message_update","message_update","message_end","tool_execution_start","tool_execution_end","message_start","message_end","turn_end","turn_start","message_start","message_update","message_update","message_end","turn_end","agent_end","agent_settled"]
distinctEventTypes = ["agent_end","agent_settled","agent_start","message_end","message_start","message_update","tool_execution_end","tool_execution_start","turn_end","turn_start"]
toolExecutionStartFields = ["args","toolCallId","toolName","type"]
toolExecutionEndFields = ["isError","result","toolCallId","toolName","type"]
assistantMessages = 2
usageFieldsPerAssistantMessage = [["cacheRead","cacheWrite","cost","input","output","totalTokens"],["cacheRead","cacheWrite","cost","input","output","totalTokens"]]
usageValues = [{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},{"input":1200,"output":40,"cacheRead":800,"cacheWrite":100,"totalTokens":2140,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}}]
stopReasons = ["toolUse","stop"]
sessionStats = {"userMessages":1,"assistantMessages":2,"toolCalls":1,"toolResults":1,"tokens":{"input":1200,"output":40,"cacheRead":800,"cacheWrite":100,"total":2140},"cost":0,"contextUsage":{"tokens":2140,"contextWindow":200000,"percent":1.0699999999999998}}
```

#### 16. Invalid tool input — **verified-with-limitation**

pi validates tool arguments against the declared schema before the tool runs and turns a failure into an error tool result the model sees: 3 of the 5 calls ended in error. 1 of 2 calls reached the harness tool and 1 of 3 reached the submission tool. pi coerces a number to a declared string: true. The adapter observes every rejection through `tool_execution_end` with `isError`, which is what rule 10 needs to count them. The `z.toJSONSchema` union discriminated on `kind` is accepted by `defineTool` and offered to the model unchanged; whether a real provider accepts it was not tested, because this spike has no pi login.

```text
discriminatedUnionJsonSchemaTopLevelKeys = ["$schema","oneOf"]
discriminatedUnionJsonSchema = {"$schema":"https://json-schema.org/draft/2020-12/schema","oneOf":[{"type":"object","properties":{"kind":{"type":"string","const":"completed"},"files":{"minItems":1,"type":"array","items":{"type":"string"}},"summary":{"type":"string"}},"required":["kind","files","summary"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"blocked"},"reason":{"type":"string"},"needs":{"type":"array","items":{"type":"string"}}},"required":["kind","reason","needs"],"additionalProperties":false}]}
toolExecutionEnd = [{"tool":"run_scope_tests","isError":true,"text":"Validation failed for tool \"run_scope_tests\":\n  - suite: must have required properties suite\n  - retries: must be number\n\nReceived arguments:\n{\n  \"retries\": \"two\"\n}"},{"tool":"run_scope_tests","isError":false,"text":"ran"},{"tool":"submit","isError":true,"text":"Validation failed for tool \"submit\":\n  - files: must have required properties files, summary\n  - root: must not have additional properties\n  - kind: must be equal to constant\n  - reason: must have required properties reason, needs\n  - root: must not have additional properties\n  - kind: must be equal to constant\n  - root: must match exactly one schema in oneOf\n\nReceived arguments:\n{\n  \"kind\": \"abandoned\",\n  \"why\": \"I gave up\"\n}"},{"tool":"submit","isError":true,"text":"Validation failed for tool \"submit\":\n  - files: must not have fewer than 1 items\n  - reason: must have required properties reason, needs\n  - root: must not have additional properties\n  - kind: must be equal to constant\n  - root: must match exactly one schema in oneOf\n\nReceived arguments:\n{\n  \"kind\": \"completed\",\n  \"files\": [],\n  \"summary\": \"nothing\"\n}"},{"tool":"submit","isError":false,"text":"accepted"}]
argumentsThatReachedTheHarnessTool = [{"suite":"7"}]
argumentsThatReachedTheSubmissionTool = [{"kind":"completed","files":["a.ts"],"summary":"done"}]
modelRequests = 5
modelSawAValidationMessage = true
submissionSchemaOfferedToTheModel = {"$schema":"https://json-schema.org/draft/2020-12/schema","oneOf":[{"type":"object","properties":{"kind":{"type":"string","const":"completed"},"files":{"minItems":1,"type":"array","items":{"type":"string"}},"summary":{"type":"string"}},"required":["kind","files","summary"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"blocked"},"reason":{"type":"string"},"needs":{"type":"array","items":{"type":"string"}}},"required":["kind","reason","needs"],"additionalProperties":false}]}
```

## 3. The port contract this plan should implement

This is a concrete revision of the
[proposal's agent port additions](../core-records.proposal.md#agent-port-additions).
Every entry says whether pi can supply it, supply it with a limitation, or not
supply it. Types are additions to
[`subs/harness/subs/agent/src/interfaces/port.ts`](../../../../subs/harness/subs/agent/src/interfaces/port.ts).

### `SessionRef` names a point, not a session

```ts
/**
 * An opaque handle to a point in a session's history. The implementation
 * resolves it; the harness stores it and compares it for equality only.
 * pi resolves it to a session file and an entry within that file.
 */
export type SessionRef = string;
```

The proposal's `{ mode: 'fork'; from: SessionRef }` forks at whatever the ref
denotes. Probe 3 shows that pi can only fork at a named entry, so a ref that
denoted a whole session would always fork at its leaf and the plan's "oriented
point" would be unreachable. Making the ref denote a point costs nothing and
gives iteration 8 exactly what it needs: every ref the port hands back — from
`AgentSession.ref`, from `SessionOutcome`, from `appendContext` — is pinned to
the history as it stood when that ref was produced.

### `SessionSpec` additions

```ts
export interface SessionSpec {
  // ... the fields the port already has ...

  /** Where this session starts. `startSession` reports the mode that was actual. */
  readonly session:
    | { readonly mode: 'fresh' }
    | { readonly mode: 'continue'; readonly ref: SessionRef }
    | { readonly mode: 'fork'; readonly from: SessionRef };

  readonly context: {
    /** `forbidden` disables the implementation's automatic compaction for this session. */
    readonly compaction: 'forbidden' | 'allowed';
    /** The harness's own budget. Null leaves the budget unbounded for this role. */
    readonly budgetTokens: number | null;
    /** The same budget as a fraction of the reported window; used when the window is known. */
    readonly budgetFraction: number | null;
    /** Room the role is left to write its report once the budget is reached. */
    readonly reportReserveTokens: number;
  };

  /** `edit` and `write` are permitted here; the shell never is. */
  readonly builtinTools: ReadonlyArray<BuiltinTool | 'edit' | 'write'>;

  /** Called before a guarded tool executes. A denial becomes the tool's error result. */
  guard?: (call: { readonly callId: string; readonly tool: string; readonly input: unknown }) =>
    Promise<{ readonly allow: true } | { readonly allow: false; readonly text: string }>;

  /**
   * Called after a mutating tool that executed has settled, whether it
   * succeeded or not. Returned text is appended to the tool's result, so the
   * hook check reaches the agent before its next step. It is NOT called for a
   * call the guard denied: that call never executed and mutated nothing.
   */
  afterMutation?: (call: { readonly callId: string; readonly tool: string; readonly failed: boolean }) =>
    Promise<{ readonly text: string } | null>;
}
```

| Field | pi | Evidence |
| --- | --- | --- |
| `session.mode: 'fresh'` | supplies | `SessionManager.create(cwd, sessionDir)` |
| `session.mode: 'continue'` | supplies | probe 1: `SessionManager.open(file)`; `CreateAgentSessionOptions` has no `continueSession` field despite its own JSDoc example, and none is needed |
| `session.mode: 'fork'` | supplies | probe 3: `SessionManager.open(parent).createBranchedSession(entryId)` writes a new file holding root to that entry; the parent's bytes, leaf and entry count are unchanged |
| `context.compaction: 'forbidden'` | supplies | probe 7: `setAutoCompactionEnabled(false)`; the session passed 100.3% of its window with no compaction |
| `context.compaction: 'allowed'` | supplies | probe 8: `reason: 'threshold'` at `contextTokens > contextWindow - reserveTokens` |
| `context.budgetTokens` / `budgetFraction` | **harness-side only** | pi has no budget of its own. The adapter reads `getContextUsage()` and the harness compares |
| `context.reportReserveTokens` | **harness-side only** | pi's `CompactionSettings.reserveTokens` governs compaction, not the report reserve; they are different numbers and must not be conflated |
| `builtinTools` with `edit`/`write` | supplies | probe 10; `ToolName` includes both and `tools` is an allowlist |
| no shell | supplies | probe 14: absent from the offered tools and from the system prompt, survives `reload()`, and `setActiveToolsByName(['read','bash'])` yields `['read']` |
| `guard` | supplies | probe 10: extension `tool_call` returning `{ block: true, reason }`; the handler may be async; `reason` becomes the error tool result; no mutation, session continues |
| `afterMutation` | supplies with a limitation | probe 11: extension `tool_result`, async, may replace the result content so the hook check reaches the model. It fires for a tool that executed and failed, but **never for a blocked call** |

### `AgentPort` additions

```ts
export interface AgentPort {
  readonly name: string;
  startSession(spec: SessionSpec): AgentSession;

  /**
   * Stores text in a session without a model call. `key` makes a repeat a
   * no-op, which is what rule 4 needs for an intent performed after a crash.
   * The returned ref names the point after the append, so a fork taken from it
   * carries the appended text.
   */
  appendContext(ref: SessionRef, key: string, text: string):
    Promise<{ readonly outcome: 'appended' | 'already-present'; readonly ref: SessionRef }
      | { readonly outcome: 'session-lost' }>;
}
```

| Member | pi | Evidence |
| --- | --- | --- |
| `appendContext` on a **live** session | supplies | probe 4: `sendCustomMessage({ ... }, { triggerTurn: false })`, zero model calls, reaches the live session's next model input and the next fork's |
| `appendContext` on a **closed** session | supplies with a limitation | probe 4: `SessionManager.appendCustomMessageEntry` writes the entry and it reaches the next fork's input, but it does **not** reach a live `AgentSession`'s next request, because that session sends its in-memory state. The adapter must use `sendCustomMessage` while it holds the session object and `appendCustomMessageEntry` only when it does not |
| `already-present` | supplies | the adapter reads the branch's entries and matches `key` before appending; pi has no idempotency of its own |
| `session-lost` | supplies | a missing or unreadable session file |

`SessionManager.appendCustomEntry` must not be used for a brief: probe 4 shows
it reaches neither the live input nor the fork's, which is what its
documentation says.

### `AgentSession` additions

```ts
export interface AgentSession {
  readonly outcome: Promise<SessionOutcome>;
  /** The point this session's history has reached. It advances as the session runs. */
  readonly ref: SessionRef;
  /**
   * Resolves when nothing this session started can still write: the
   * implementation is idle AND the harness's own confirmation has passed.
   * The implementation's idleness alone is not settlement.
   */
  settled(): Promise<'settled' | 'timed-out'>;
  stop(): Promise<void>;
}
```

| Member | pi | Evidence |
| --- | --- | --- |
| `ref` | supplies | `sessionFile` plus `sessionManager.getLeafId()` |
| `settled()` | **supplies only half** | probe 12: `abort()` waits for an in-process tool even when that tool ignores its signal, and `agent_settled` fires. It does **not** wait for a descendant process: a detached child wrote its file after the session reported idle. The other half is the harness's own, by process group and a stable tree |
| `stop()` | supplies | probe 12: `abort()` then `waitForIdle()` |

### Events and outcomes

```ts
export type AgentEvent =
  | { type: 'tool-started'; callId: string; tool: string; input: unknown; mutating: boolean }
  | { type: 'tool-finished'; callId: string; tool: string; isError: boolean; errorText?: string;
      /** False when the implementation rejected the input before the tool ran. */
      reachedTool: boolean }
  | { type: 'message'; text: string; usage?: TokenUsage }
  | { type: 'context-observed'; tokens: number | null; window: number | null; estimated: true }
  | { type: 'compaction'; phase: 'started' | 'ended'; reason: 'manual' | 'threshold' | 'overflow';
      tokensBefore?: number; tokensAfter?: number; aborted?: boolean; errorText?: string };

export type SessionOutcome =
  | { kind: 'submitted'; input: unknown }
  | { kind: 'ended'; message?: string }
  | { kind: 'failed'; error: string }
  | { kind: 'stopped' }
  | { kind: 'context-budget-reached'; tokens: number | null; report?: string };
```

| Item | pi | Evidence |
| --- | --- | --- |
| `tool-started.mutating` | supplies | the adapter names its own mutating tools; `edit` and `write` are pi's only mutating built-ins once the shell is withheld |
| `tool-finished.reachedTool` | supplies | probe 16: the adapter records which `callId`s reached a tool's `execute`; a call that ends in error without having reached one was rejected by pi's own validation. This is what lets rule 10 count every rejection without matching pi's message text |
| `context-observed` | supplies with a limitation | probe 6: `getContextUsage()` gives `{ tokens, contextWindow, percent }`. `tokens` is **always** an estimate and `estimated` is therefore always `true`; it is `null` after a compaction until the next assistant reply, and the whole value is `undefined` when no model is selected or the model reports no window |
| `compaction` | supplies | probe 8: `compaction_start`/`compaction_end` with `reason`, and `result.tokensBefore` / `result.estimatedTokensAfter` |
| `context-budget-reached` | **harness-side only** | pi has no such outcome. The harness sees the budget crossed, calls `setActiveToolsByName([])` and prompts for the report; probe 9 shows one final tool-free response is then obtained |

`SessionSpec.onEvent` stays synchronous and must not throw, as it does today.

## 4. Consequences for the plan

### Decision 4 — every turn ends in a submission

**Confirmed. No change.** Probe 2 answers the plan's decisive question: after a
submission tool returned `terminate: true`, `prompt()` is accepted, the resumed
request carries the submission and its result, and the submission tool is
callable again. `terminate` is a stop hint for the agent loop after the current
tool batch, not a close of the session — `pi-agent-core` documents it that way
and the probe confirms the behavior.

Iterations 3, 6 and 9 may therefore keep a role's session alive across
submissions. The fallback of a fresh session rebuilt from records stays worth
building, because probe 13 shows it works and iteration 4 needs restart recovery
anyway, but it is no longer on the critical path.

### Decision 12 — engineers receive no shell tool

**Confirmed. No change.** Probe 14: with an allowlist that names neither,
`bash` and `powershell` appear in neither the offered tool list nor the system
prompt; they survive a `reload()`; and `setActiveToolsByName(['read','bash'])`
yields `['read']`, because a tool outside the registry cannot be enabled. A
model that calls one anyway receives an error result and nothing happens.
Iterations 6 and 7 proceed as written, with `run_scope_tests` as the harness's
own tool.

### Context thresholds and the estimate — the plan needs two changes

The [context thresholds](../main-plan.md#context-thresholds) table stands as a
policy. Two statements under it do not.

**First, there is no exact figure to prefer.** The plan says "Where the port
reports `tokens` exactly, `estimated` is `false`." Probe 6 shows pi's
`getContextUsage().tokens` is itself
`calculateContextTokens(lastAssistantUsage) + Σ estimateTokens(messages after
it)`. It is the plan's own formula with two differences: it also charges
`cacheWrite`, and it counts characters rather than bytes. On the probe's session
pi reported 1550 where the plan's formula gives 1250, the 300 being `cacheWrite`.
`estimated` is therefore **always true** for pi and the flag as specified can
never distinguish anything. Replace it with what does vary:

| Observation | Meaning |
| --- | --- |
| `{ tokens: n, window: w }` | The implementation's own estimate, derived from the last assistant usage |
| `{ tokens: null, window: w }` | The implementation knows the window but cannot size the context |
| no observation | `coverage-gap` of kind `context-unavailable` |

**Second, the plan's fallback estimate is wrong exactly where pi says
"unknown".** After a compaction and before the next assistant reply, pi reports
`tokens: null`, while the plan's formula — which reads the last assistant usage
from the session entries — returns the stale **pre-compaction** figure: 3270 on
a session whose compaction had just reduced it to about 766. Computing the
plan's formula as a fallback there would charge a role for context it no longer
holds and would fire its budget immediately after a compaction freed room. The
rule must be: **when the port reports `tokens: null`, the harness records the
gap and the role's threshold cannot fire.** It must not substitute an estimate
of its own. Where a size is needed across a compaction, `compaction_end.result`
carries `tokensBefore` and `estimatedTokensAfter`; probe 8 shows both.

Because pi's number already is the estimate, the plan's own formula has no
remaining use for the pi port and should be dropped from
[Context thresholds](../main-plan.md#context-thresholds), keeping only its
intent: the estimate charges cached context, because that is what occupies the
window. The scripted fake still emits `context-observed` so the core's tests do
not depend on pi.

### Compaction policy — stands

Probes 7 and 8 confirm both halves. `forbidden` for `global-fork`, `engineer`
and `contract-engineer` is enforceable per session and held past 100% of the
window. `allowed` for `initial-architect` and `local-architect` is observable
with its reason and its before and after sizes. Two notes for iteration 3:

- `setAutoCompactionEnabled(false)` does not prevent an explicit `compact()`.
  A forbidden session must simply never call it.
- pi's compaction settings are read from the `SettingsManager`, which the
  adapter already builds in memory per session, so `reserveTokens` and
  `keepRecentTokens` are per session and do not leak between roles. They govern
  pi's compaction only and are **not** the plan's `reportReserveTokens`.

### Rule 10 and the submission schema — a decision iteration 3 must make

This is the one place where the evidence complicates the plan rather than
confirming it, and it belongs in iteration 3.

Probe 16 shows pi validates tool arguments against the declared schema **before
the tool runs**, and turns a failure into an error tool result carrying every
error with its path. That is exactly the shape rule 10 wants. But two things
follow that the plan has not accounted for:

1. **A call pi rejects never reaches the harness.** Of the two malformed
   submissions and the one malformed harness-tool call, none reached the tool's
   `execute`, and so none would reach `SubmissionTool.accept`. `rejectedSubmissionsPerTurn`
   and `rejectedToolInputsPerTurn` cannot be counted inside the tool. The
   adapter must count them, which is what `tool-finished.reachedTool` above is
   for. Iteration 3 owns that; iterations 6 and 9 consume it.
2. **pi coerces.** A call of `run_scope_tests` with `{ suite: 7 }` against a
   schema declaring `suite` as a string reached the tool as `{ suite: "7" }`.
   The value the harness validates is then not the value the model sent, and
   "every error the harness reports is the harness's own" no longer holds.

The current adapter already avoids both by giving pi a permissive schema for
the submission tool and validating everything itself — and its comment records
a real cost of that choice, which a real model reproduced: with every field's
type erased, the model consistently submitted object and array fields as
escaped JSON strings. The adapter repairs that envelope rather than asking the
model to.

Iteration 3 should therefore decide deliberately, with this evidence:

- **Keep the permissive schema for the submission tool.** Every call reaches
  `accept`, every rejection is the harness's own and is counted where the bound
  lives, and the envelope repair stays. The cost is that the model is not told
  the field types by the schema, only by the description.
- **Declare the real schema for harness tools**, whose inputs are small and
  flat, and re-validate inside the tool so that a coerced value is still
  rejected by the harness's own rules. Count pi's own rejections through
  `reachedTool`.

Probe 16 also confirms that `z.toJSONSchema` of a union discriminated on `kind`
is accepted by `defineTool` unchanged, is offered to the model as written, and
that pi's validator reports `oneOf` failures member by member with paths. What
is **not** tested is whether a real provider accepts that schema; that needs a
pi login and is the one sub-question this spike leaves open. Iteration 3 should
test it in the first real-model test it runs, and the safe order is to keep the
permissive submission schema until it has.

### Iteration 3's implementation notes

- The fork is `createBranchedSession(entryId)`. `AgentSessionRuntime.fork` is
  the wrong tool: it replaces the runtime's current session rather than
  producing a second one, so it cannot serve a harness that keeps the parent
  open. The plan's port-additions table should name `createBranchedSession`.
- `appendContext` needs both routes. `sendCustomMessage(..., { triggerTurn:
  false })` while the adapter holds the live session; `appendCustomMessageEntry`
  when it does not. Probe 4 shows the second does not reach a live session's
  next request, which is a silent failure if the adapter picks the wrong one.
- `afterMutation` must not be relied on to see a blocked call. Probe 11: the
  `tool_result` hook fired twice for four attempted calls — once for the write
  that succeeded and once for the write that failed — and not at all for the two
  the guard blocked. The guard itself is the record of a blocked call, and
  `tool_execution_end` fires for all four, so the adapter emits `tool-finished`
  from that event and calls `afterMutation` only for calls that executed.
- `setActiveToolsByName([])` takes effect sooner than documented: called from
  inside a running tool it already applies to the continuation request of the
  same run. The budget path does not need to wait for a turn boundary.
- The event union for one ordinary turn is `agent_start`, `turn_start`, then
  per message `message_start` / `message_update`* / `message_end`, then
  `tool_execution_start` / `tool_execution_end`, then `turn_end` — `turn_start`
  and `turn_end` repeat per turn — then `agent_end`, `agent_settled`. Per-message
  usage carries `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens` and
  `cost`. `getSessionStats()` aggregates those over every entry, compacted
  history included, and carries `contextUsage`. The scripted fake must emit all
  of these for parity.
- The session file is version 3 and is the whole handover between processes;
  no pi object crosses a process boundary.

## 5. What the SDK cannot do that the architecture assumed

Three things, each stated with the adaptation rather than hidden behind an
abstraction.

**1. pi cannot confirm that no writer remains.** Probe 12: `abort()` waits for
an in-process tool even when that tool ignores its signal, and `agent_settled`
fires after it. But a tool that leaves a descendant process behind returns at
once; the session reports idle, `waitForIdle()` resolves, and the descendant
wrote its file two seconds later. The architecture's writer settlement cannot
be `waitForIdle()`. **Adaptation:** `AgentSession.settled()` is the harness's,
not pi's: pi idle, then the invocation's process group confirmed gone, then the
tree stable. The plan already assumes this; the probe is why it is not optional.
With the shell withheld the MVP's engineers spawn nothing, so the gap is small,
but the harness tool that runs tests does spawn, and that is the one to settle.

**2. pi has no exact context size, and no size at all after a compaction.**
Covered in full above. **Adaptation:** treat every observation as an estimate,
and treat `null` as unknown rather than as room.

**3. pi's tool validation runs before the harness sees the call, and it
coerces.** Covered in full above. **Adaptation:** the adapter counts
pre-execution rejections and reports them through `tool-finished.reachedTool`;
the submission tool keeps the permissive schema and the harness's own
validation until a real-model test settles the alternative.

Nothing else the architecture assumed was found missing. The two behaviors the
main plan flagged as unclear or absent from the declarations — resuming after
`terminate`, and the missing `continueSession` option — both have working
routes.

## 6. Statements this iteration resolves, and those it leaves provisional

### Resolved

| Statement | Where | Resolution |
| --- | --- | --- |
| Decision 4, conditional on the spike | [Decisions](../main-plan.md#decisions-pending-dans-review) | Adopt unconditionally. Probe 2 |
| Decision 12, conditional on the spike | [Decisions](../main-plan.md#decisions-pending-dans-review) | Adopt unconditionally. Probe 14 |
| "Provisional until iteration 0 reports against the pinned SDK" | [Agent port additions](../main-plan.md#agent-port-additions) | Resolved: the contract in section 3 replaces it, with four named revisions — the ref denotes a point, `afterMutation` never sees a blocked call, `tool-finished` gains `reachedTool`, and `settled()` is the harness's |
| Whether a session resumes after `terminate` | Port table, last row | Verified |
| Whether `SessionManager.open` resumes with history | Port table, row 1 | Verified, in one process and across two |
| Whether a fork starts at the chosen entry and leaves the parent alone | Port table, row 2 | Verified, by `createBranchedSession` |
| Whether an append causes zero model calls and reaches the next fork | Port table, row 3 | Verified, for two of three routes, which differ |
| Whether compaction can be off for a role | Port table | Verified |
| Whether before and after usage is available for a compaction | Port table | Verified, from the event, not the session |
| Whether one final no-tools response can be obtained | Port table | Verified, and sooner than documented |
| Whether a denial mutates nothing and the session continues | Port table | Verified, for `edit` and `write` |
| Whether a post-tool hook fires when the tool failed | Port table | Verified for a failed tool; **not** for a blocked one |
| Whether a session reopened in a new process continues | Port table | Verified |
| `contextWindow` when it is not reported | [Context thresholds](../main-plan.md#context-thresholds) | pi reports it from the model whenever a model is selected; the "absolute value" branch applies only when `getContextUsage()` is `undefined` |
| Whether the plan's estimate formula is needed | [Context thresholds](../main-plan.md#context-thresholds) | It is not, and using it as a fallback after a compaction would be wrong |

### Left provisional, with the reason

| Statement | Reason | Who resolves it |
| --- | --- | --- |
| That a real provider accepts a `z.toJSONSchema` union schema discriminated on `kind` | No pi login on this machine; the scripted provider proves pi's side only | Iteration 3, in its first real-model test |
| Whether the submission tool should carry its real schema or the permissive one | Both costs are now measured, but the second depends on the row above | Iteration 3 |
| Real-model behavior of any kind: stringified envelopes, correction bounds in practice, how often a role reaches its budget | Every probe used a scripted provider | Iteration 12's real trials, and the measurements iteration 4 starts |
| What Ramify's `input` identity covers for non-TypeScript resources | This iteration observed the identity change when documents were added, which is consistent but not a deliberate test | Iteration 2, under decision 9 |
| Measured context budgets per role | The thresholds in the plan remain a policy, not a measurement | Iteration 12 |
