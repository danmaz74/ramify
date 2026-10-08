# Iteration 7 results: preserving pi operations

**Acceptance:** S07–S11 implemented and exercised by guarded ordinary controls
using pi's installed native serializer/parser and an intercepted SSE transport.
Live Q02/provider acceptance, kernel/process witnesses and full configured
qualification remain iteration 14. Existing `startSession`/file-ref entry points
remain transitional until iteration 9; this receipt's preservation claims apply
to the new injected session operations.

## Identity and scope

Worktree `/home/app/ramify-plan23-07-pi`, branch `feat/plan23-07-pi`; base
`6deb04694f36124c24dc91f57ed2160bc2d202e1` includes accepted 0–3. Result HEAD is
the commit containing this receipt, resolved by `git log -1 --format=%H --
ramify-agent/docs/plans/23-session-reuse-and-run-efficiency/iterations/07-results.md`.
The coordinator approved the additive typed unavailable contract and exact agent
paths in its reservation commit `a116d986`; no shared store/runtime, registry,
manifest, dependency pin, main checkout or other worker was edited.

Changed paths beneath `ramify-agent/`:

- `subs/harness/subs/agent/subs/pi/module.ramify`
- `subs/harness/subs/agent/subs/pi/src/pi-agent.ts`
- `subs/harness/subs/agent/subs/pi/src/session-operations.ts`
- `subs/harness/subs/agent/subs/pi/src/preservation.ts`
- `subs/harness/subs/agent/subs/pi/src/tests/plan23-prefix-preservation.test.ts`
- `subs/harness/subs/agent/subs/pi/src/tests/helpers/scripted-provider.ts`
- `subs/harness/subs/agent/src/interfaces/session-operations.ts`
- `subs/harness/subs/agent/src/session-operations.ts`
- `subs/harness/subs/agent/src/tests/plan23-session-operations.test.ts`
- `docs/plans/23-session-reuse-and-run-efficiency/iterations/07-results.md`

## Composition and contract handoff

`createPiAgent({sessionStore?, model?, agentDirectory?})` supplies
`AgentPort.sessionOperations` when injected and always supplies
`bindSessionStore(store): SessionOperations`. Bind once to the run/project store's
owned lifetime; share that operations port across tasks and runs. The accepted
generic engine owns keys, CAS, policy/authority/effect journaling and settlement.
Pi owns the opaque encoding and current executable implementations.

New exposed `piBuiltinDeclarations(names, workingDirectory)` returns plain
`SessionToolDeclaration[]` for read/grep/find/ls/edit/write. Use these definitions
in Create/tool additions. The operation adapter privately recreates omitted
builtin handlers and actions against the current task cwd, verifies definition
identity, and passes them to the generic engine. Explicit caller tools override
automatic binding and must retain their immutable definitions. No harness caller
constructs or decodes SDK objects.

Builtin results retain complete JSON content, image blocks, details and usage in
a pi-private `ramify.pi-builtin-result/1` envelope alongside generic display text.
The generic journal preserves that JSON unchanged; native construction and known
effect recovery decode it inside pi. Display text never reconstructs provider
content. Mutation-check text appends separately without replacing original blocks,
and a deterministic private finalizer preserves the tool-error flag. Scripted
image success/error/crash controls prove native image bytes and details survive,
with one builtin execution during completed-effect recovery and no image codec
or process launch.

Each binding carries the original `task` and serialized `policy`, tools,
submission name/accept function, currentAuthority, onEvent and publish. Task
fields are role/message/submissionTool; environment workingDirectory,
candidate/snapshot (nullable), limits; policyIdentity, validatorIdentity and
destinationIdentity. Policy fields are context, authority, validator and
destination. Supply guard/afterMutation/recoverEffect when their accepted
contracts apply. The adapter does not replace these values with defaults.

The additive exported runtime class `SessionDriverUnavailableError(reason)` is
covered by the existing agent interface wildcard exposure. The engine catches
that type and durably settles `status: unavailable`, `point: null`,
`snapshot.available: false`, with the existing failed outcome union and reason.
Historic settled points remain forkable. Terminal Retry returns the identical
receipt without dispatch. No exception-message parsing decides availability.

## Provider history and final dispatch

`ramify.pi-transcript/1` stores exact JSON provider messages, immutable rendered
declarations, ordered applied agent keys/addition keys, activation, complete native
prefix, sequence and preparation operation ID. It records packageVersion
`0.87.1`, transport `sse` and provider/model identity; restoration checks them.
Provider response IDs, text signatures, encrypted reasoning signatures, native
call IDs/arguments and tool result content remain in the opaque messages.

Every message boundary is persisted with `runtime.persistPayload` through an
awaited Agent subscription. Installed `pi-agent-core/dist/agent.js:429–430`
awaits every listener, so persistence blocks dependent tools and subsequent
requests. An unfinished assistant tool call is retained immediately, while the
native frozen prefix remains the last complete boundary: the installed serializer
otherwise invents an aborted output for that unfinished call. Those synthetic
outputs never become authoritative provider artifacts.

Recovery completes missing outputs from durable effects, preserving original
provider calls and using the recorded validated/coerced input identity. A call
whose intent was never written executes once under the original bindings and
installed validation. Uncertain external effects remain the generic engine's
explicit recovery/unavailable decision. An accepted submission missing provider
results and terminal receipt completes those native results with **zero model
requests and zero repeated acceptance/effects**, including other completed calls
in its batch. A newly created result timestamp is local envelope metadata; its
native call-output bytes come from the recorded verdict/result. SDK tool-result
extension rewrites are disabled so that encoding stays deterministic.

The outer `session.agent.streamFunction` wrapper awaits pi's original onPayload,
then checks the final model, exact initial instructions/tools, every ordered input
item and inherited prefix, including JSON field order. It records the complete
credential-free final request body and comparison fields as immutable
`ramify.pi-native-request/1`, then awaits runtime.assertLive and checks the abort
signal before returning that same body. Extension onError sets a fatal fence even
when pi swallows its exception. Stop blocks a delayed final hook and late writes.

Default SDK request/turn prompt and tool refresh callbacks are disabled. All
historical definitions remain; new tools append native `additional_tools`
developer items, later role instructions append developer messages, and brief
inputs append user messages. Identical definitions rebind without redeclaration;
changed schema/description conflicts. Inactive tools cannot reach handlers;
historical submissions cannot complete the current task. Compaction, SDK task
retry and cache warming are disabled; budget settlement retains declarations and
does not invent a submission or summary.

## Installed support and evidence

| Configuration | Result |
| --- | --- |
| pi-coding-agent/pi-ai 0.87.1, openai-codex/gpt-5.6-sol, openai-codex-responses, full-payload SSE | Ordinary serialized/wire controls pass; live acceptance pending 14 |
| Native appended tools and later system messages | Target catalog/runtime explicitly declares both compatibility flags; actual installed serializer exercised |
| WebSocket cached/auto | Not used: installed adapter reduces input with previous_response_id after onPayload; preserving operations explicitly select SSE |
| Other model/API or changed persisted transport/model/version | Explicit unavailable; no fresh session, summary or prefix replacement |
| Provider retries | maxRetries=0; durable Retry remains the operation engine's API |

Inspected installed source seams include coding-agent `dist/core/sdk.js:178`
(request options) and its swallowed extension transform; pi-agent-core
`dist/agent.js:429` (awaited listeners); pi-ai
`dist/api/openai-codex-responses.js:173–181` (native build/onPayload/stringify),
`:373` (catalog-driven serialization) and `:1159` (post-hook cached WebSocket
rewrite). Only the nested package's declared public import exports are loaded;
their installed manifests and versions are checked. Layout/version changes
require renewed qualification.

The test backend emits independently authored SSE responses through the installed
native parser. It records both the final callback body and actual HTTP bytes
(decoding zstd if present), and requires exact equality, scripted exhaustion and
no unused responses. Golden expectations independently name role bytes, full
definitions/schema delivery once, calls, outputs, encrypted reasoning and signed
assistant text. Tests reopen serialized fixture records/payloads from an actual
temporary file into new store and adapter objects. This is provider restoration
evidence; production ledger/process restart qualification remains 14 and the
accepted iteration 1 store evidence.

## Executed verification

All commands ran from `/home/app/ramify-plan23-07-pi/ramify-agent` after an
independent `npm ci` (503 packages; pinned dependencies unchanged).

```sh
npm run test:quick -- subs/harness/subs/agent/subs/pi/src/tests/session-modes.test.ts subs/harness/subs/agent/subs/pi/src/tests/plan23-prefix-preservation.test.ts --maxWorkers=2
```

Final run: **2 files, 40 tests passed**, 2026-10-08 17:53:34 UTC. This comprises
29 new preserving controls and 11 transitional session-mode regressions. It
covers S07–S11, three-task restored prefix/continuation artifacts, T1/C1 siblings,
new tools/rebind/conflicts, inactive calls, private builtin binding, initial and
late hook failures, JSON-order/model mutations, encoding/model/transport corruption,
missing payloads, final-seam Stop, budget behavior, interrupted/accepted effects
and complete rich builtin result/error recovery.

The additional focused engine selection passed with the required files:

```sh
npm run test:quick -- subs/harness/subs/agent/subs/pi/src/tests/session-modes.test.ts subs/harness/subs/agent/subs/pi/src/tests/plan23-prefix-preservation.test.ts subs/harness/subs/agent/src/tests/plan23-session-operations.test.ts --maxWorkers=2
```

That run passed **3 files, 45 tests** before the final extra SDK-coercion control;
the engine's independent typed-unavailable/reconstructed-Retry/historic-fork
control passed. Later pi changes were rerun in the final required selection above.

```sh
npm run test:quick -- subs/harness/subs/agent/subs/pi/src/tests/pi-agent.test.ts subs/harness/subs/agent/subs/pi/src/tests/model-choice.test.ts subs/harness/subs/agent/subs/pi/src/tests/transcript-content.test.ts subs/harness/subs/agent/subs/pi/src/tests/guarded-writes.test.ts subs/harness/subs/agent/subs/pi/src/tests/guard-installed.test.ts subs/harness/subs/agent/subs/pi/src/tests/fork-isolation.test.ts subs/harness/subs/agent/subs/pi/src/tests/compaction-policy.test.ts subs/harness/subs/agent/subs/pi/src/tests/tool-actions.test.ts subs/harness/subs/agent/subs/pi/src/tests/context-budget.test.ts subs/harness/subs/agent/src/tests/scripted.test.ts subs/harness/src/tests/plan23-session-store.test.ts --maxWorkers=2
npm run type-check
npm run check:self
git diff --check
```

Affected regressions: **11 files, 69 tests passed**. All four compiler scopes
passed on the final implementation. Structural checking completed with zero
errors, zero warnings and 316 nonblocking analysis limits; final counts are retained in
`/tmp/plan23-pi-final-structure.log`. No full suite, audit, live request or native
process witness was run. Guard evidence for the 14 selected files records zero
allowed/refused process-launch attempts under this worktree's cwd hash
`a1925d4207a7f215c56a515d36dbeb101488dca23de286067bb8e741523bcc74`.

Initial API materialization succeeded: two ordinary/testing views, 994 entries;
their metadata records coverage 37/51 and truncated 2 each. Foreign contracts
were searched in their separate views before use. Final refresh failed with
`resource-unavailable: Worker terminated due to reaching memory limit: JS heap
out of memory`; no complete refresh is claimed and no daemon was restarted.
Current declarations are separately checked by the structural gate. Dynamic
public-export import targets remain explicit nonliteral-target analysis limits.

## Iteration 14 live recipe and limits

Q02 must use the public createPiAgent/ModelRuntime credential path for
`openai-codex/gpt-5.6-sol`, installed 0.87.1 and **SSE**, with the accepted
production session store. No private AuthStorage import is available/required.
The coordinator verified credential presence only; this worker made no live calls.

Execute frozen F1: exact initial role/read/orientation, settle T1, append B at C1,
fork L from T1 and R from C1, append a new designated tool/role, then advance
parent with C. Close/reopen actual storage and reconstruct the adapter. Capture
credential-free final request bodies through this adapter's provider blobs; verify
initial instructions/tools and every inherited serialized input item with exact
JSON bytes, including actual provider continuation artifacts. Only child routing
identity may change. Retain the live native additional_tools response acceptance,
later role input, unchanged parent and negative hook call counts. Include accepted
submission recovery with no model replay and final Stop fencing. Register and run
the exact native witness under iteration 14's configured boundary discipline.

Intact but unsafe provider data can commit a typed terminal unavailable receipt.
A genuinely missing immutable payload makes the underlying durable store corrupt:
preflight returns unavailable with no usable point and zero dispatch, but cannot
invent a committed terminal operation or weaken ledger payload validation. The
ordinary missing-payload control explicitly observes that no intent was written;
persistence failure/recovery must remain visible. Unsupported preflight likewise
dispatches nothing and creates no operation intent. Full production/process/live
claims remain unqualified here; the inherited iteration 0 materializer failure is
not relabeled as passing.

## Integrated actual settlement refinement

The accepted generic quiescence amendment `f5ef60e5` is recorded in receipt 1.
Its Pi final-hook control preserves the original zero-dispatch/late-event checks
while observing a prompt fenced receipt and delayed actual Stop/settled barrier.
Joined engine/Pi/store/scripted checks passed 5 files/78 tests, all type scopes
and structural checking (317 explicit limits). Q02 live/process evidence remains
iteration 14; this refinement supplies no live claim.
