# Iteration 3 results: agent port additions and the pi adapter

**Date:** 2026-09-20. **Status:** complete, with one sub-question left open
for want of a pi login. The [brief](iteration3.md) is satisfied: the port has
the session modes, the appended context, the guard and the after-mutation
hook, the context and compaction events, the `edit` and `write` built-ins,
`settled()` and the two new outcome and event fields; the scripted fake emits
every one of them; and pi implements every one of them behind
`harness/agent/pi`.

The one thing this environment cannot do is a real-model test. There is no pi
login on this machine, so whether a real provider accepts a `z.toJSONSchema`
union discriminated on `kind` is still untested, and the submission tool keeps
the permissive schema, which is the safe order the main plan's open-risks
table names. Section 8 records it as not done, with the reason. Nothing was
simulated in its place.

## 1. Baseline

Run from `ramify-agent/` before anything was changed. All four pass, and each
matches iteration 2's exit exactly.

```text
=== npm run type-check ===   EXIT: 0
=== npm test ===             Test Files  39 passed (39)
                                  Tests  282 passed (282)
                             EXIT: 0
=== npm run build:web ===    ✓ 287 modules transformed.   ✓ built in 229ms
                             EXIT: 0
=== npm run check:self ===   Execution: completed; check: passed; coverage: complete
                             Completed scope: 7 owners, 109 source files, 4 resources, 1151 accesses
                             Findings: 0 errors, 0 warnings, 0 analysis limits; 633 allowed, 0 denied, 518 external
                             EXIT: 0
```

## 2. The architect view this iteration worked from

| | Before | After |
| --- | --- | --- |
| Revision | `rev/1:76dccb45-f79a-4ac6-b0c3-78c4f57519e0:1` | `rev/1:737df0e1-87d0-459b-b851-e616bb351edc:1` |
| Input identity | `input/1:b1c656dc701dd1f931dd4b0442289da6b8c61bb04125f151c04d85092091b96b` | `input/1:17e8c5e967e722beaa056c49e53a6d7253ab66851ef818c2bb19d7750eaa8ae2` |
| Modules, records | 7, 457 | 7, 504 |
| Dependencies, test references, metrics | measured | measured |
| Cut | 111 | 122 |

The before column is iteration 2's recorded after view, which was the view on
disk when this iteration started; this iteration did not materialize one of
its own before changing anything, so the before column is quoted rather than
observed. The after view was materialized from a stopped daemon, before any
claim below about the module tree, and its dependency facts are measured. Its
cut is 122, so an absent detail in it is not evidence that behavior is absent.

The daemon was stopped first, as iterations 1 and 2 require: this iteration
adds `subs/harness/subs/agent/src/tests/helpers/` and
`subs/harness/subs/agent/subs/pi/src/tests/helpers/session.ts`, and a
materialization in a daemon context that has seen a directory added publishes
`dependencies unavailable (wait-limit)`.

### The module tree is unchanged, and pi now receives behavior, not only types

The seven modules of iteration 2 are the seven modules now; this iteration
declares none. What changed is the dependency between the two it touched.

| | After iteration 2 | Now |
| --- | --- | --- |
| `harness/agent` `usedBy` | — | `harness/agent/pi` (1 behavioral, 13 non-behavioral), `harness` (1 behavioral, 10 non-behavioral) |
| `harness/agent/pi` `uses` | — | `harness/agent` (1 behavioral, 13 non-behavioral) |

The one behavioral reference from `pi` to its parent is `contextBudgetReached`,
the single rule that decides whether an observation reaches a session's
budget. Both implementations import it from the port rather than restating it,
so the fake and pi cannot drift on the rule the harness depends on. The 13
non-behavioral references are the port's types.

`harness/agent` exposes two behavioral symbols, `createScriptedAgent` and
`contextBudgetReached`; `harness/agent/pi` exposes `createPiAgent` and
`piReadiness`, exactly as before. Nothing else in the project imports pi.

## 3. What was delivered

### The port

`subs/harness/subs/agent/src/interfaces/port.ts` implements section 3 of the
[iteration 0 results](iteration0-results.md#3-the-port-contract-this-plan-should-implement),
with the four revisions that note names.

| Addition | Shape |
| --- | --- |
| `SessionRef` | An opaque string naming a **point** in a history |
| `SessionStart`, `SessionMode` | `fresh`, `continue` from a ref, `fork` from one |
| `ActualStart` | The mode that was actual, with `degradedReason` |
| `ContextPolicy` | `compaction`, `budgetTokens`, `budgetFraction`, `reportReserveTokens` |
| `GuardedCall`, `GuardDecision` | What the guard is asked, and its answer |
| `SettledMutation` | What `afterMutation` is told |
| `Availability`, `PortObservations` | What an implementation can observe, and the reason for anything it cannot |
| `WriteTool` | `edit` and `write`; a shell is never one |
| `AppendOutcome` | `appended`, `already-present` with a ref, or `session-lost` |
| `contextBudgetReached` | The one rule both implementations apply |

`SessionSpec` gains `session`, `context`, `guard` and `afterMutation`, and its
`builtinTools` widens to `ReadonlyArray<BuiltinTool | WriteTool>`.
`ToolDefinition` gains `mutating`, so a harness tool declares its own mutation
and no generic code infers it from a name. `AgentSession` gains `start`, `ref`
and `settled()`. `AgentPort` gains `observations` and `appendContext`.
`AgentEvent` gains `tool-started.mutating`, `tool-finished.reachedTool`,
`context-observed` and `compaction`; `SessionOutcome` gains
`context-budget-reached`.

`context-observed` carries `{ tokens, window }` and no `estimated` flag, as
iteration 0 directed: pi's figure is always an estimate, so a flag that is
always true distinguishes nothing. What varies is `tokens: null`, which means
unknown and never room.

### The scripted fake

`src/scripted.ts` implements every one of them. The script gains a `context`
step, a `compaction` step, and `mutating` and `reachedTool` on a `tool` step;
`createScriptedAgent` gains a `settleMs` option. `ScriptedSessionRecord` gains
the mode that was actual, the appended context the session started with, every
tool result the agent saw after `afterMutation` appended its text, the call IDs
the guard denied, the compactions the policy suppressed, and the calls the
budget refused. The fake keeps its own histories, so `continue` inherits a
session's appended context and `fork` inherits it up to the ref's point.

### The pi adapter

`subs/pi/src/pi-agent.ts`:

- **Modes.** The session manager is resolved **before** the async run, so
  `start` and `ref` are readable the moment `startSession` returns. `fresh` is
  `SessionManager.create`, `continue` is `SessionManager.open`, and `fork` is
  `SessionManager.open(parent).createBranchedSession(entryId)`, which is the
  call probe 3 settled; `AgentSessionRuntime.fork` is not used. A mode that
  cannot be honored degrades to `fresh` and says why.
- **`appendContext`.** The adapter keeps a map of the sessions it holds, by
  session file. A held session receives the brief through
  `sendCustomMessage(..., { triggerTurn: false })`; one it no longer holds
  receives `appendCustomMessageEntry`. This is the split probe 4 requires, and
  picking the wrong route would fail silently. Idempotency is the adapter's:
  the key is carried on the entry's `details` and a repeat answers
  `already-present`.
- **Guard and after-mutation.** `tool_call` guards a mutating call and returns
  `{ block: true, reason }` on a denial; `tool_result` runs `afterMutation` for
  a mutating call that executed and appends its text to the result. A denied
  call is excluded, because probe 11 showed `tool_result` never fires for one.
- **`reachedTool`.** This iteration measured pi's hook order against the
  pinned SDK and found it decisive: for a call whose arguments pi rejected,
  only `tool_execution_start` and `tool_execution_end` fire, and the
  `tool_call` hook does not. The adapter therefore records the call IDs
  `tool_call` saw and reports `reachedTool` from that set, with no reading of
  pi's message text. A call the guard denied passed pi's validation, so its
  `reachedTool` is true although the tool did not run; the guard's own answer
  is the record of that denial, and rule 10's count stays exactly pi's own
  rejections.
- **Context and compaction.** The context is read after every `message_end`
  and `tool_execution_end` and reported with the model's window. Compaction is
  the spec's policy: `setAutoCompactionEnabled(spec.context.compaction ===
  'allowed')`, and the adapter never calls `compact()`. `compaction_start` and
  `compaction_end` become the `compaction` event, whose sizes come from the
  event because the session reports none until the next assistant reply.
- **Budget.** When an observation reaches the budget the adapter calls
  `setActiveToolsByName([])`, which probe 9 showed applies to the continuation
  request of the running turn, and the session ends `context-budget-reached`
  with that final response as its report. An accepted submission still wins.
- **`settled()`.** pi idle, bounded by `settleMs`. Its JSDoc says what probe 12
  found: pi waits for an in-process tool but cannot see a descendant process,
  so this is evidence the harness uses and never the evidence it relies on.

`PiAgentOptions` gains `settleMs` and `compaction`, the latter being pi's own
compaction thresholds, documented as **not** the policy's
`reportReserveTokens`, which iteration 0 warned must not be conflated.

## 4. Exit evidence

All four run from `ramify-agent/` after every change.

```text
=== npm run type-check ===

> ramify-agent@0.0.0 type-check
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json

EXIT: 0

=== npm test ===

> ramify-agent@0.0.0 test
> vitest run

 RUN  v4.1.11 /ramify/ramify-agent

 Test Files  45 passed (45)
      Tests  334 passed (334)

EXIT: 0

=== npm run build:web ===

> ramify-agent@0.0.0 build:web
> NODE_ENV=production vite build --config subs/web/vite.config.ts

vite v8.3.0 building client environment for production...
✓ 287 modules transformed.
dist/web/index.html                   0.39 kB │ gzip:   0.26 kB
dist/web/assets/index-BVUPCXfX.css    6.25 kB │ gzip:   1.78 kB
dist/web/assets/index-DJ9mvXsL.js   430.38 kB │ gzip: 129.68 kB
✓ built in 195ms
EXIT: 0

=== npm run check:self ===

> ramify-agent@0.0.0 check:self
> ramify check --batch --root .

Root: /ramify/ramify-agent (given)
Configuration: /ramify/ramify-agent/tsconfig.json
Mode: batch
Execution: completed; check: passed; coverage: complete
Stages: registry=completed, acquisition=completed, parse=completed, catalog=completed, link=completed, access=completed, decide=completed, report=completed
Completed scope: 7 owners, 117 source files, 4 resources, 1256 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 694 allowed, 0 denied, 562 external
EXIT: 0
```

### Every new port behavior, with its verdict

Each row says how the behavior is covered with the scripted fake, how it is
covered against pi on the offline scripted provider, and any limitation.

| Behavior | With the fake | Against pi, offline | Limitation |
| --- | --- | --- | --- |
| `session.mode: 'fresh'` | verified | verified | — |
| `session.mode: 'continue'` | verified | verified: the resumed request carries the first session's turn, in the same file | — |
| `session.mode: 'fork'` | verified: the fork inherits to the point and not past it | verified: the fork's request has `ALPHA` and not `BETA`, in a file of its own, with the parent's bytes still a prefix | — |
| Actual mode and `degradedReason` | verified for a missing `continue` and a missing `fork` | verified for a missing file, a missing entry and an unbranchable point | — |
| `AgentSession.ref` names a point and advances | verified | verified: readable before anything runs and different after | — |
| `appendContext` → `appended` | verified, with no model activity | verified, with no model call | — |
| `appendContext` → `already-present` | verified: the second text never appears | verified: the second text never appears in the resumed request | — |
| `appendContext` → `session-lost` | verified | verified for a missing file and for an empty ref | — |
| An append reaches the next fork | verified | verified | — |
| The live append route | not applicable | **verified with a limitation** | The port gives a session one prompt, so that session's *own* next model input cannot be observed through the port. The test proves the held session takes the live route and the entry reaches the file and the next session; probe 4 verified the model input at the SDK level |
| `builtinTools` with `edit` and `write` | verified | verified: the allowed write landed on disk | — |
| No shell | not applicable | verified: `bash` is not offered and a call to it has no effect | — |
| `guard` denies a mutating call | verified | verified: nothing written, the reason in the model's next request, the session continued | — |
| `guard` is not called for a read | verified | verified | — |
| `afterMutation` after a call that succeeded | verified | verified, and its text is in the model's next request | — |
| `afterMutation` after a call that failed | verified | verified | — |
| `afterMutation` never for a denied call | verified | verified | — |
| `tool-started.mutating` | verified for the built-ins and for a declaring tool | verified for both | — |
| `tool-finished.reachedTool` | verified both ways | verified: an invalid `run_scope_tests` is `false`, a valid one `true` | — |
| `context-observed` after each boundary | verified | verified: every `message` and `tool-finished` is followed by one, with the model's window | — |
| `tokens: null` is unknown, never room | verified: the budget cannot fire on it | verified: the session reports `null` after a compaction | — |
| `compaction` events with reason and sizes | verified | verified: `threshold`, `aborted: false`, `tokensAfter < tokensBefore` | pi compacts only when there is something to summarize, so it takes two turns to reach; the test drives two sessions over the same files |
| `compaction: 'forbidden'` | verified: the step is suppressed and counted | verified: the same threshold is crossed with no compaction and no summary request | — |
| Compaction is never prompt text | verified | verified: the system prompt is the spec's exactly and neither it nor the first request names compaction, a budget, a window, a reserve or a token | — |
| `context-budget-reached` | verified: tools refused, one final response, the report | verified: request 1 offers the tools, request 2 offers none, the outcome carries `tokens: 5040` and the final response | — |
| A budget return is never a completion | verified | verified: nothing was submitted | — |
| An accepted submission wins over the budget | not applicable | verified | — |
| `settled()` → `settled` | verified | verified | — |
| `settled()` → `timed-out` | verified with a hang | verified with a tool that ignores its signal | `timed-out` is pi's bound, not settlement; the harness's own confirmation is iteration 4's |
| `AgentPort.observations` | verified: the fake reports all three available | verified: pi reports all three available | — |
| An implementation that lacks one reports unavailable with a reason | verified | not applicable | pi lacks none; the guard test constructs a port that does |
| A real provider's acceptance of a union on `kind` | not applicable | **not done** | No pi login on this machine. See section 8 |

### The two guards this iteration owns

| Guard | Test | How it is enforced |
| --- | --- | --- |
| Usage, context size and compaction are port events; an implementation that lacks one reports unavailable with a reason, and the scripted fake emits all of them | `subs/harness/subs/agent/src/tests/port-observations.test.ts` | Six cases: the fake emits usage, context and compaction in one session; every implementation states all three; a port that lacks two names both reasons and neither is empty; an unknown size cannot fire a budget, at the rule and through a session; a forbidden role's compaction is suppressed and counted while its context is still observed; and the policy is absent from the prompt |
| Compaction is port policy, never prompt text | `subs/harness/subs/agent/subs/pi/src/tests/compaction-policy.test.ts` | Three cases over real pi sessions: the same two turns compact under `allowed` with the reason and both sizes, do not compact under `forbidden` although the threshold is crossed and no summary is requested, and under either policy the system prompt is the spec's exactly and says nothing about compaction or budgets |

### The tests added

52 tests in 6 files. None reaches a network or the person's pi directory:
every pi test runs a real pi session with `PI_OFFLINE=1`, in a temporary agent
directory, over the scripted provider.

| File | Tests | What it covers |
| --- | ---: | --- |
| `subs/harness/subs/agent/src/tests/port-observations.test.ts` | 6 | The guard above |
| `subs/harness/subs/agent/src/tests/port-additions.test.ts` | 19 | The fake's parity: the three modes and degradation, `appendContext` and its three outcomes, the guard and `afterMutation`, the write built-ins, `reachedTool`, the budget, settlement, and the advancing ref |
| `subs/harness/subs/agent/subs/pi/src/tests/session-modes.test.ts` | 10 | pi's modes, degradation, both append routes, `already-present`, `session-lost`, and an append reaching a fork |
| `subs/harness/subs/agent/subs/pi/src/tests/guarded-writes.test.ts` | 9 | pi's write built-ins, the guard, `afterMutation` for a call that succeeded and one that failed, a declaring harness tool, the withheld shell, `reachedTool` both ways, the permissive submission schema, and settlement |
| `subs/harness/subs/agent/subs/pi/src/tests/compaction-policy.test.ts` | 3 | The guard above |
| `subs/harness/subs/agent/subs/pi/src/tests/context-budget.test.ts` | 5 | Observations after every boundary, the unknown size after a compaction, the budget return, a session under its budget, and a submission winning over the budget |

Two helpers were added, one per owner:
`subs/harness/subs/agent/src/tests/helpers/spec.ts` builds a spec over the fake
with its callbacks recorded, and
`subs/harness/subs/agent/subs/pi/src/tests/helpers/session.ts` starts one real
pi session over the scripted provider. The existing
`tests/helpers/scripted-provider.ts` was replaced by the spike's copy of
itself, which is a superset: it takes a `contextWindow` override, carries
`cacheRead` and `cacheWrite`, exposes `hold` and can be pushed to after
construction. Its provenance comment was replaced with what the overrides are
for.

### Every union value has a producer and a test

| Union | Values produced and tested | Values with no producer yet |
| --- | --- | --- |
| `SessionStart.mode` | `fresh`, `continue`, `fork`, each with the fake and with pi | — |
| `ActualStart.mode` | all three, and the degraded `fresh` with its reason | — |
| `AppendOutcome.outcome` | `appended`, `already-present`, `session-lost` | — |
| `ContextPolicy.compaction` | `forbidden`, `allowed` | — |
| `AgentEvent.type` | `tool-started`, `tool-finished`, `message`, `context-observed`, `compaction` | — |
| `AgentEvent.compaction.phase` | `started`, `ended` | — |
| `AgentEvent.compaction.reason` | `threshold` from pi; `manual` and `overflow` from the fake | pi produces `manual` only through an explicit `compact()`, which no policy calls, and `overflow` only against a real provider's overflow |
| `SessionOutcome.kind` | `submitted`, `ended`, `failed`, `stopped`, `context-budget-reached` | — |
| `GuardDecision.allow` | `true`, `false` | — |
| `Availability.available` | `true` from both implementations, `false` from the guard test's port | No shipped implementation reports `false`; pi lacks none |
| `AgentSession.settled()` | `settled`, `timed-out` | — |

### The measured size of the two owners

From the architect view's `metrics.contextSize.exact`, which `ramify measure`
confirms.

| Owner | Production files | Production bytes | Test files | Test bytes |
| --- | ---: | ---: | ---: | ---: |
| `harness/agent`, after iteration 2 | 2 | 11,406 | 1 | 4,879 |
| `harness/agent`, now | 2 | 29,317 | 4 | 26,868 |
| `harness/agent/pi`, after iteration 2 | 1 | 16,106 | 2 | 24,147 |
| `harness/agent/pi`, now | 1 | 28,656 | 7 | 63,341 |
| `harness`, after iteration 2 | 29 | 163,324 | 20 | 142,799 |
| `harness`, now | 29 | 163,618 | 20 | 142,799 |

`harness`'s own production source grew by 294 bytes, which is the two fields
and the comment the new types require at its one `startSession` call. The
growth is in the two owners the brief scopes.

## 5. Acceptance cases owned

None. The brief assigns none: the roles that use these semantics arrive from
iteration 4 onward, and this iteration's exit evidence is its own.

## 6. Deviations from the brief, with reasons

- **The harness core changed by two fields, not by imports alone.** The brief
  allows "no harness core change beyond the imports the new types require".
  `SessionSpec.session` and `SessionSpec.context` are required fields, so the
  one place that builds a spec, `subs/harness/src/jobs/service.ts`, must supply
  them; it now passes `{ mode: 'fresh' }` and an unbudgeted, compaction-allowed
  policy for the mapping job. The alternative was to make both fields optional
  with defaults, which was rejected: a default of `compaction: 'allowed'` would
  let a role that forgets its policy be compacted silently, and iteration 0
  settled that compaction must be per-role policy. No other harness file
  changed.
- **The mode that was actual is reported on `AgentSession.start`, not from
  `startSession`'s return type.** The brief says "`startSession` reports the
  mode that was actual" without saying where. `startSession` returns an
  `AgentSession` synchronously, and pi can resolve its session manager
  synchronously, so the mode is known at once and `start` is readable
  immediately, beside `ref`. The harness records the requested mode from the
  spec it built and the actual mode from `start`.
- **`contextBudgetReached` lives in `interfaces/port.ts`.** The budget rule has
  to be the same in the fake and in pi, or a core test would prove something
  pi does not do. Putting it beside `ContextPolicy` and exposing it to parent
  and descendants makes that enforced rather than conventional, and the
  architect view now records the one behavioral reference from `pi` to its
  parent. The alternative, duplicating five lines in each implementation, is
  exactly the drift the plan's guards exist to prevent.
- **`ToolDefinition` gains `mutating`.** The brief says `tool-started` carries
  `mutating`, "declared by the implementation and not inferred by generic
  harness code". For pi's own built-ins the implementation declares it, and
  `edit` and `write` are its only mutating ones once the shell is withheld. A
  harness tool is not the implementation's to classify, so the tool declares
  itself, and no generic code reads a name. Iteration 7's shell tool is the
  first that needs it.
- **`AgentPort.observations` is an addition the brief does not name.** The
  guard it owns requires that "an implementation that lacks one reports
  unavailable with a reason". Without a place to report it, an adapter that
  drops an observation is indistinguishable from a session that produced none,
  which is the failure the guard exists to prevent. `observations` is static
  per implementation; the per-session gap stays what iteration 0 defined,
  `tokens: null` or no observation at all.
- **`PiAgentOptions` gains `compaction`.** pi's own compaction thresholds are
  16,384 and 20,000 by default, which a test cannot reach cheaply. Rather than
  a test-only hook, the option is on the adapter's public options with a JSDoc
  saying what iteration 0 warned about: these are pi's thresholds and not the
  policy's `reportReserveTokens`.
- **`context-observed` has no `estimated` field.** Iteration 0 directed this
  and the brief's own wording omits it. The proposal's sketch still shows
  `estimated: true`; it is superseded.
- **Four names beyond the contract are exposed from `scripted.ts`.**
  `ScriptedAgentOptions` and `ScriptedToolResult` join the existing list,
  because they are what an exposed function takes and what an exposed record
  holds. This follows iteration 2's precedent.

## 7. What the next iteration must know

- **A `SessionSpec` now needs `session` and `context`.** Iteration 4 builds
  every role's spec. `context` comes from the main plan's
  [context thresholds](../main-plan.md#context-thresholds) table, per role;
  `session` is `{ mode: 'fresh' }` for a first invocation and a ref for a
  continuation or a fork. Neither has a default and neither should get one.
- **The harness reads `session.start`, not the spec, for the mode that
  happened.** Record both: the requested mode from the spec, the actual mode
  and its `degradedReason` from `start`. A fork that degraded to fresh must not
  be counted as a fork when fork cost is compared.
- **`settled()` is half the answer.** Iteration 4's
  `harness/src/tests/writer-settlement.test.ts` owns the other half: the
  session idle, then the invocation's process groups killed and confirmed gone,
  then the tree stable. `timed-out` from the port is not a failure to report;
  it is the bound at which the harness's own confirmation has to carry the
  weight. `harness/evidence`'s `runCommand` already settles a command's
  descendants by process group, which is the piece to reuse.
- **`tool-finished.reachedTool: false` is exactly pi's own input rejections.**
  Count those toward `rejectedToolInputsPerTurn` and
  `rejectedSubmissionsPerTurn` and record each as a `rejection` observation. A
  call the guard denied has `reachedTool: true`; it is a `guarded-change`, not
  a rejected input, and the guard's own answer is its record.
- **No `context-observed` at all is a `coverage-gap` of kind
  `context-unavailable`.** The adapter emits nothing when `getContextUsage()`
  is `undefined`, which happens when no model is selected or the model reports
  no window. `AgentPort.observations` is the other half: an implementation that
  cannot observe one says so with a reason, and that reason belongs in the same
  coverage gap.
- **`context-budget-reached` is never a completion.** `report` is the agent's
  final response, not a submission; nothing was validated. It is the successor
  invocation's input, under `budgetReturnsPerIteration`.
- **A brief's key is the harness's `DecisionId`.** `appendContext` recognizes a
  repeat by that key alone, so an intent performed again after a crash appends
  nothing. Passing a fresh key for the same decision would append it twice.
- **pi compacts only when there is something to summarize.** A session with a
  single turn never compacts, however far past the threshold it is, because
  pi's cut point keeps everything. Any later test that needs a compaction needs
  at least two turns; `compaction-policy.test.ts` shows the shape.
- **The daemon's wait-limit behavior still costs a view its dependency facts.**
  Stop the daemon before the materialization an iteration reports.
- **`subs/harness/src/.ramify/` and `subs/harness/src/tests/.ramify/` are still
  stale**, as iterations 1 and 2 recorded. `npm run check:self` does not read
  them.

## 8. Not done, with the reason

- **The real-model test is not done: there is no pi login on this machine.**
  The brief, the main plan's open-risks table and iteration 0 all leave one
  sub-question to iteration 3's first real-model test: whether a real provider
  accepts a `z.toJSONSchema` union discriminated on `kind`, and, following
  from that, whether the submission tool should carry its real schema instead
  of the permissive one. Neither can be answered without a provider. Nothing
  was simulated in their place, and the safe order the plan names is kept: the
  submission tool still receives the permissive schema, the harness still
  validates everything and still repairs a stringified envelope, and
  `guarded-writes.test.ts` proves that every submission reaches `accept` with
  `reachedTool: true`. **Dan's decision of 2026-09-20 stands unchanged** and
  requires no revision from this iteration. Whoever has a login should run the
  test; until then it belongs to iteration 12's live trials.
- **The live append route is verified one step short of the model input.** The
  port gives a session a single prompt, so a session this adapter holds cannot
  be asked for another turn through the port, and "the append reaches *that*
  session's next model input" is not observable from a test at this level.
  What the test proves is that a held session takes the live route, that the
  append causes no model call, and that the entry reaches the file and the next
  session. Probe 4 verified the model input at the SDK level; this is recorded
  rather than claimed here.
- **`compaction.reason` of `manual` and `overflow` have no pi producer.** The
  fake produces both. pi produces `manual` only through an explicit
  `compact()`, which no policy calls and which a forbidden session must never
  call, and `overflow` only when a real provider overflows. Both are reachable
  through the port's type and neither is reachable from this environment.
- **`Availability.available: false` has no shipped producer.** pi observes all
  three and the fake observes all three. The guard test constructs a port that
  lacks two, which is what makes the reason requirement enforced; no adapter
  in the project reports one.
- **The before architect view was not materialized.** As in iteration 2, the
  before column of section 2 is iteration 2's recorded identity rather than an
  observation of this iteration's own. The after view was materialized from a
  stopped daemon before any claim about the module tree.
