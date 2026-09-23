# Iteration 4 results: transcript content through the port

**Date:** 2026-09-23. **Branch:** `feat/plan9-i3`. **Owners:** `harness/agent`,
`harness/agent/pi`.

The port now carries the whole conversation. Every message reaches the
harness as a `message` event once it is complete: the first prompt, each
assistant message with its blocks, usage and optional detail, and each tool
result paired with its call by ID. Retries are events. pi's adapter builds
all of it from pi's events and reads nothing from pi's files.

## Final names

All of these are in
[`subs/harness/subs/agent/src/interfaces/port.ts`](../../../../subs/harness/subs/agent/src/interfaces/port.ts),
which the module exposes with `expose-src *` to the parent and to
descendants.

### The `message` event

`message` is three `AgentEvent` variants, one per `role`:

| Role | Fields |
| --- | --- |
| `user` | `blocks: readonly ContentBlock[]` |
| `assistant` | `blocks: readonly AssistantBlock[]`, `text: string`, `usage: TokenUsage \| null`, `detail: MessageDetail` |
| `tool-result` | `callId`, `tool`, `isError`, `blocks: readonly ContentBlock[]` |

- **`MessageEvent`** is `Extract<AgentEvent, { type: 'message' }>`.
- **Order:** the first prompt is the first event, reported before the model
  is called. An assistant message precedes the `tool-started` of each call
  it makes. A tool result follows the call's `tool-finished` and holds what
  the agent saw, including any text `afterMutation` appended.
- **`text`** on an assistant message is for display. It is the text blocks
  joined, or `(calls read, grep)` when there are none. **`assistantText(blocks)`**
  computes it, and both implementations use it. Existing consumers read this
  field, as they did before.
- **`usage`** changed from optional to `TokenUsage | null`.

### Blocks

- **`TextBlock`**: `{ type: 'text'; text }`.
- **`ThinkingBlock`**: `{ type: 'thinking'; visibility: ThinkingVisibility; text }`.
  The text is empty when the thinking is `redacted`.
- **`ToolCallBlock`**: `{ type: 'tool-call'; callId; tool; input; action: ToolAction }`.
  It carries the same `action` as `tool-started`.
- **`OtherBlock`**: `{ type: 'other'; kind; description }`. It stands for
  content the port does not map, such as an image. The block is described,
  its content is not carried, and it is never dropped.
- **`ContentBlock`** is `TextBlock | OtherBlock`, for user messages and tool
  results. **`AssistantBlock`** is all four kinds.
- **`ThinkingVisibility`** is `'full' | 'summary' | 'unmarked' | 'redacted'`.

### Optional detail

**The absence convention:** every optional field is present in the event,
and `null` means the executor did not report it. Null is never zero and
never an empty value. A retry or compaction event is absent altogether when
the executor declares it cannot report one.

- **`MessageDetail`** has seven fields, each `T | null`:
  - `model`: the model that answered;
  - `thinkingLevel`: in the provider's own terms;
  - `stopReason: StopReason`;
  - `error`: also null when the message reports no error;
  - `reasoningTokens`: the part of `usage.output` spent on thinking;
  - `cost: MessageCost`: `input`, `output`, `cacheRead`, `cacheWrite` and
    `total`, in US dollars;
  - `cacheWrites: CacheWrites`: `{ short; long }` tokens by retention.
- **`noMessageDetail`** is the value with every field null.
- **`StopReason`** is `'end' | 'tool-use' | 'length' | 'error' | 'aborted' | 'other'`.

### Retries and compaction

- **`retry`** has two phases:
  - `started`: `attempt`, `maxAttempts | null`, `delayMs | null` and
    `errorText | null`;
  - `ended`: `attempt`, `succeeded` and `errorText | null`.

  The failed assistant message comes before `started`, with `stopReason:
  'error'` and its `error`.
- **`compaction`** is now two variants:
  - `started`, with its `reason`;
  - `ended`, with `tokensBefore | null`, `tokensAfter | null`, `aborted:
    boolean` and `errorText | null`. These fields were optional before.
- **`CompactionReason`** names `'manual' | 'threshold' | 'overflow'`.

### Declared support

`ExecutorSupport` gains two keys, both `Availability`:

- **`thinking`**: the executor reports thinking blocks with their
  visibility.
- **`retries`**: the executor reports its own retries.

pi declares both. The scripted fake declares both by default. When its
`support` option withholds one, the fake drops thinking blocks or retry
events.

### pi adapter

The adapter is
[`pi-agent.ts`](../../../../subs/harness/subs/agent/subs/pi/src/pi-agent.ts).

- **`message_end` for every role:**
  - `user`, including the first prompt;
  - `assistant`;
  - `toolResult`, which becomes `tool-result`;
  - `custom`, such as an appended brief, which becomes `user` because it
    reaches the model as the user's;
  - any other role, which becomes a `user` message with one `other` block.
- **Thinking:** `redacted` when pi's block says `redacted: true`, with pi's
  placeholder text dropped. Otherwise `unmarked`.
- **Usage fields:**
  - `usage.reasoning` becomes `reasoningTokens`;
  - `usage.cacheWrite1h` becomes `cacheWrites.long`, and `short` is the rest
    of `cacheWrite`;
  - `usage.cost` becomes `cost`, but only for a model with nonzero rates.
    pi reports a cost of zero for a model without rates, so that cost is
    null.
- **Message fields:**
  - `model` is `provider/(responseModel ?? model)`;
  - `thinkingLevel` is `providerThinkingLevel`;
  - pi's `stopReason` is mapped to `StopReason`, with `pending` and
    `deferred` as `other`;
  - `error` is `errorMessage`.
- **Retries:** `auto_retry_start` and `auto_retry_end` become `retry`.
- **Left out:** `thinkingSignature`, `textSignature`, `thoughtSignature`, a
  tool call's `namespace`, tool-result `details` and a tool's own `usage`.
- **Context observation:** it follows each assistant message only, as it did
  before.
- **Test-only setting:** `PiRuntimeSource.retryDelayMs` sets pi's
  `retry.baseDelayMs` for tests. It is not part of `module.ramify`.

### Scripted fake

The fake is
[`scripted.ts`](../../../../subs/harness/subs/agent/src/scripted.ts).

- **The first prompt:** it reports the spec's prompt as the `user` message
  before its first step.
- **Tool and submit steps:** each is reported as:
  - an assistant message holding the call, with usage `null` and
    `noMessageDetail`;
  - the call's `tool-started` and `tool-finished`;
  - a `tool-result` message.
- **The `message` step** gains `blocks?: AssistantBlock[]`, which come
  before the text, and `detail?: Partial<MessageDetail>`. Detail the step
  leaves out is null.
- **A new `retry` step:** `{ errorText, attempt?, maxAttempts?, delayMs?, succeeded? }`.
  It reports the failed message, then `started` and `ended`. The standalone
  `--script` step kinds in
  [`sessions/command.ts`](../../../../subs/harness/src/sessions/command.ts)
  accept it.

## Harness-side changes

The port change required these four edits. Nothing in the run service,
records, recovery or the run writer changed.

- **`activityOf`**
  ([`jobs/activity.ts`](../../../../subs/harness/src/jobs/activity.ts))
  records assistant messages only. The prompt and tool results are not
  activity. The activity record is unchanged.
- **`PortEventRecorder.record`**
  ([`run/port-events.ts`](../../../../subs/harness/src/run/port-events.ts))
  sums usage from assistant messages.
- **The standalone session's progress**
  ([`sessions/single.ts`](../../../../subs/harness/src/sessions/single.ts))
  prints an assistant message only when it has text. A message that only
  calls tools is already shown as those calls, so pi's `… (calls read)`
  lines are gone.
- **`sessions/command.ts`** accepts the `retry` step kind.

## Changes from the design

- **Tool results are messages, not blocks.** The plan lists a "tool result
  with call ID" among the blocks. The port reports a `tool-result` message
  whose `callId` names the call, and its content blocks are text and other.
  The pairing is the same, and there is no nested content array. Iteration
  5's writer can render the message as one tool-result block.
- **`unmarked` is a fourth visibility.** The analysis names `full`,
  `summary` and `redacted`. pi reports thinking text without saying whether
  the provider summarized it: OpenAI's is a summary, and Claude 4's usually
  is. The adapter does not guess, so pi's thinking is `unmarked` unless it
  is redacted.
- **`retries` is a declared-support key beside `thinking`.** Without it, an
  executor that cannot report retries could not be told apart from one that
  never retried.
- **Cost is null for a model without rates.** pi prices each message from
  the model's rates, so such a model reports zero whatever it used.
- **`custom` messages are `user` messages.** If the harness appended a brief
  to a session the adapter holds, the brief would reach the port once as a
  `user` message. Iteration 5's own "appended brief" entry could then
  repeat it. Today briefs are appended only to suspended sessions, which
  pi's adapter does not hold, so this cannot happen yet.
- **The fake reports an assistant message for every call.** This adds a
  `message` activity, `(calls read)`, to each tool step's observations, as
  pi's sessions already record. The ordered comparison in
  [`neutral-actions.test.ts`](../../../../subs/harness/src/tests/neutral-actions.test.ts)
  became flaky with the extra queued writes. That test assumed a fixed
  interleaving between two independent writers, the port-event recorder and
  the guard. It now compares each writer's records in its own order.

## Exit evidence

The Exit is met by
[pi `transcript-content.test.ts`](../../../../subs/harness/subs/agent/subs/pi/src/tests/transcript-content.test.ts).
It runs one real pi session on the scripted provider with three replies:

1. two thinking blocks with signatures, one of them redacted, text and two
   tool calls, with usage that reports reasoning tokens, a 1h cache-write
   split and a cost, and a response model and thinking level;
2. a `529 overloaded` error, which pi retries on its own;
3. the submission.

It shows:

- **The first prompt** is the first event, and it was reported before the
  first model request.
- **Assistant blocks:** the three assistant messages hold every block in
  order. The thinking is `unmarked` and `redacted`. The tool calls carry
  their actions.
- **Detail:** every field pi supplied is present, and the failed message
  holds its `error`.
- **Retry:** `retry` `started` follows the failed message, and `ended`
  (succeeded) follows the next assistant message.
- **Tool results:** each of the three names a call that an earlier
  assistant message made. The read's result holds the file.
- **Against pi's own file,** which only the test reads, the port's messages
  have the same roles in the same order and the same tool-result call IDs.
  The file holds `opaque-signature-one`. The events hold neither signature
  nor pi's redaction placeholder.

A second test shows absence: a model pi has no rates for, and a reply that
reports no optional fields, yield `null` for everything but the model and
the stop reason.

[Agent `transcript-content.test.ts`](../../../../subs/harness/subs/agent/src/tests/transcript-content.test.ts)
covers the fake:

- the prompt first, and each call's message, start, finish and result in
  order;
- detail fully supplied, partly supplied (with a reasoning count of zero
  kept as zero) and left out;
- retries that succeed and that give up;
- compaction sizes left out;
- `assistantText`;
- an executor that declares no thinking or retries and reports neither.

Commands, run from `ramify-agent/`:

```sh
npx vitest run subs/harness/subs/agent/src/tests subs/harness/subs/agent/subs/pi/src/tests
# Test Files 14 passed (14); Tests 96 passed (96)
npx vitest run subs/harness/src/tests/iterations.test.ts subs/harness/src/tests/run-bounds.test.ts \
  subs/harness/src/tests/observation-log.test.ts subs/harness/src/tests/single-session.test.ts \
  subs/harness/src/tests/compaction.test.ts subs/harness/src/tests/unguarded-write.test.ts \
  subs/harness/src/tests/late-writes.test.ts subs/harness/src/tests/neutral-actions.test.ts \
  subs/harness/src/tests/protocol-contract.test.ts subs/harness/src/tests/union-values.test.ts \
  subs/harness/src/tests/composition.test.ts subs/harness/src/tests/hook-checks.test.ts \
  subs/harness/src/tests/shell-tool.test.ts subs/harness/src/tests/engineer-submission.test.ts \
  subs/harness/src/tests/writer-settlement.test.ts subs/harness/src/tests/module-creation.test.ts \
  subs/harness/src/tests/read-excursions.test.ts subs/harness/src/tests/write-guard.test.ts \
  subs/harness/src/tests/stop-before-start.test.ts subs/harness/src/tests/kpi-metrics.test.ts
# Test Files 20 passed (20); Tests 174 passed (174)
npx vitest run subs/harness/src/tests/analysis-submission.test.ts subs/harness/src/tests/commit-recovery.test.ts \
  subs/harness/src/tests/local-architect-submission.test.ts subs/harness/src/tests/local-authority.test.ts \
  subs/harness/src/tests/placement.test.ts subs/harness/src/tests/run-protocol.test.ts \
  subs/harness/src/tests/run-recovery.test.ts subs/harness/src/tests/single-session-integration.test.ts
# Test Files 8 passed (8); Tests 94 passed (94)
npm run type-check      # passes (root, web and scripts compiler scopes)
npm run check:self
# Execution: completed; check: passed; coverage: partial
# Findings: 0 errors, 0 warnings, 87 analysis limits (87 before this iteration)
```

The harness files above are those that drive the scripted fake and read its
events or observations. `neutral-actions.test.ts` passed four runs in a row
after its change.

## Open items

- **Iteration 5** writes the transcript from these events:
  - `message` for message entries;
  - `retry` and `compaction` for their own entries;
  - `tool-started` only where it needs the running state.

  Detail that is `null` should show as "not reported". A session whose
  executor declares no `thinking` should say so.
- **Not yet recorded by the harness.** `PortEventRecorder` ignores
  `message` for other roles, `retry` and `MessageDetail`. Iteration 5 adds
  the transcript; no observation records them.
- **Images** are `other` blocks. Whether a transcript should keep them in
  the content store is undecided.
- **Tool results after a stop are discarded.** pi's tool result carries the
  full output. For a result the adapter's `stopped` flag drops after Stop,
  the transcript has no result for that call. The harness already discards
  what a stopped session produces.
