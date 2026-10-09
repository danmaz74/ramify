# pi

Implements the agent's durable session operations using Pi's native messages and
serializer. Pi owns model selection, authentication, SDK objects and opaque
provider history; the harness supplies the authoritative session store and
rebinds current tools, policy, validators and destinations for each operation.

## Supported preservation

The preserving driver qualifies Pi `0.87.1`,
`openai-codex/gpt-5.6-sol` on `openai-codex-responses`, SSE and zero provider
retries. Unsupported models/transports are explicit unavailable or failed
operations without a replacement start. Initial instructions, tool definitions
and every inherited serialized input item retain their order and original
opaque fields. Later roles and tool definitions are appended to the transcript;
historical inactive tools cannot execute or submit for a current task.

`createPiAgent({ model, sessionStore })` exposes modern operations through
`AgentPort`. Continue, exact-point Fork, model-free context/tool additions,
terminal Retry, Stop and actual settlement use the generic committed operation
engine. Source-backed fresh recovery belongs to the harness; this adapter makes
no fallback decision. There are no public provider-file references, file-history
readers or compaction/settlement-threshold options.

Opaque Pi state and original final-request artifacts are immutable payloads in
the caller-owned store. Restoration reads those original bytes, never display
events or a regenerated transcript. `readPiNativeRequestArtifact` exposes only a
validated plain final-request artifact; other provider payloads remain opaque.
Request artifacts are persisted before the final liveness fence. Artifact
presence proves neither HTTP dispatch nor full settled history: final accepted
tool outputs may follow the last request. Pi-owned qualification verifies the
complete settled messages including terminal submission outputs.

Related forks share a Pi-owned provider session identity, persisted in the
opaque transcript. Pi uses it for `session-id`, `x-client-request-id` and
`prompt_cache_key`; logical harness session IDs and branch histories remain
independent. Older transcripts and forks before the first request resolve this
identity from the original creation operation. Unrelated roots use different
identities. Compatible native prefixes can therefore reuse the parent's cache
on a fork's first request; the provider still decides whether a cache hit occurs.

## Execution policy

The driver binds fresh callable tools and the current designated submission.
Guards precede mutating effects; denied calls mutate nothing. The designated
submission's complete schema is supplied once in its declaration description;
Pi's permissive outer schema lets the harness report every validation error.
Accepted submissions terminate the task. Inactive or obsolete submissions retain
definitions but cannot reach the current validator.

Context usage is an estimate. A raw hard budget is explicit unfinished failure
without a fabricated partial report. The generic compaction permission is
retained, including `allowed`; this preserving implementation conservatively
disables actual automatic compaction. SDK retries are disabled. Stop fences new
model/tool/submission work and aborts cooperatively, while `settled()` waits for
actual drainage under the caller's bound. Receipt alone is not quiescence.

## Model and login

Credentials remain Pi's own in its agent directory (`~/.pi/agent` or
`PI_CODING_AGENT_DIR`). `agentDirectory` can select that directory. `model`
selects the requested provider/model, optionally with a supported thinking level;
readiness can report absence of a configured model. Log in through Pi's own
`npx pi` and `/login`; no credential values enter durable task or metric facts.

## Qualification

Ordinary owner tests use installed serializer/parser seams with scripted
external responses; no real Git, process or network is launched. The exact
registered `plan23-transport.boundary.test.ts` observes actual local kernel HTTP
and SSE, production ledger restoration in a new process, inactive-tool refusal
and the final dispatch fence. Default native execution requires no login or
conditional skip. Its explicit original-live evidence invocation additionally
requires the same clean candidate's successful live captures and verifies full
settled inherited prefixes. Default local native controls alone do not establish
external provider acceptance.
