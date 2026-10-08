# Plan 23 contract appendix: execution v1

**Frozen base:** `d01a57bdbac6a56c29a893519f70297513824313`.
This appendix fixes engineering seams for C1–C7; it changes no workflow or
product policy. Provider receipts publish concrete exported signatures before
consumers integrate them. Internal implementation types may be finer grained;
any change to the fields or guarantees below requires dependent review.

## Session and operation wire values

The agent owns the following JSON values, separately from harness run schemas.
All identities are harness-owned strings, never pi file names or entry IDs.

```ts
type AgentSessionId = string;
type SessionOperationId = string; // unique within runId
type TranscriptPayloadId = string; // sha256 of exact immutable bytes
interface AgentSessionPoint {
  readonly sessionId: AgentSessionId;
  readonly kind: 'turn' | 'checkpoint';
  readonly turn: number; // settled turns through this point; initial = 0
  readonly checkpoint: string; // immutable opaque position; required for both kinds
}
interface SessionOperationKey {
  readonly runId: string;
  readonly operationId: SessionOperationId;
}
interface SessionLineage {
  readonly sessionId: AgentSessionId;
  readonly parent: AgentSessionPoint | null;
  readonly currentPoint: AgentSessionPoint;
}
interface SessionOperationReceipt extends SessionOperationKey {
  readonly sessionId: AgentSessionId;
  readonly turn: number | null; // null for Create/Fork/context/tool-only changes
  readonly point: AgentSessionPoint | null; // null when reuse unavailable
  readonly status: 'completed' | 'failed' | 'stopped' | 'unavailable' | 'conflict';
  readonly outcome: SessionOutcome | null; // existing agent-owned union
  readonly reason: string | null;
}
interface SessionToolDeclaration {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly mutating: boolean;
}
interface SessionContextAddition {
  readonly key: string;
  readonly kind: 'role-instructions' | 'brief' | 'activation-instructions';
  readonly text: string;
  readonly revision: string | null;
}
interface SessionToolChange {
  readonly add: readonly SessionToolDeclaration[];
  readonly activate: readonly string[];
  readonly inactivate: readonly string[];
}
interface SessionTaskInput {
  readonly role: string;
  readonly message: string;
  readonly submissionTool: string;
  readonly environment: {
    readonly workingDirectory: string;
    readonly candidate: string | null;
    readonly snapshot: string | null;
    readonly limits: Readonly<Record<string, unknown>>;
  };
  readonly policyIdentity: string;
  readonly validatorIdentity: string;
  readonly destinationIdentity: string;
}
```

Points are session-bound even when siblings have the same turn number. A turn
point before an append never includes that append. The checkpoint distinguishes
multiple positions at the same turn. A fork preserves the source checkpoint's
content but returns a child-qualified initial checkpoint. Create and Fork do not
run a model task; the next Continue consumes turn 1 or inherited N+1.

The high-level public operation surface provides Create, Continue, Fork,
Append context, Add tools/set activation, Retry and Stop. Each mutating input
carries `SessionOperationKey`. Continue, Append and standalone tool change carry
`sessionId` and `expectedPoint`; Fork carries `sourcePoint`. Continue bundles
`task`, `additions`, `toolChange` and execution bindings. Create carries initial
role instructions, declarations, activation and serialized policy. Retry carries
only the original operation key plus newly constructed bindings; its task and
preparation are read from the recorded intent. Stop carries the targeted active
operation key and session identity. An operation handle exposes its persisted
receipt/outcome and stop/settlement promises; it cannot expose a usable point
before settlement. Exact method naming is owned by iteration 1's exported port,
while these wire fields and semantics are frozen for 7–12.

## Durable store and provider injection

Iteration 1 introduces the store contract in agent `interfaces/port.ts` (or the
new `interfaces/session-operations.ts`, re-exported/exposed with companions).
The harness implementation lives in `run/session-store.ts`. Agent code imports
no harness or ledger source. Factory options inject `sessionStore`; no global
singleton or provider-file discovery is the authoritative record.

The store supports loading run-scoped operations and session snapshots, storing
immutable content-addressed payload bytes, and a serialized atomic commit of
operation/session updates with expected-point compare-and-advance. An append
transaction contains intent or terminal receipt plus any new session point and
its complete ordered payload references. Payloads are durably written before a
boundary referencing them commits. A duplicate payload ID must contain identical
bytes. The harness implements this with ledger `append`/`replay` and atomic or
exclusive payload writes; operation replay, model preservation and workflow
policy belong above ledger. Stored session envelopes identify schema version,
initial instructions, declarations, activation state, ordered transcript
references, immutable points, lineage, active operation and turn counter.
An implementation may return explicit unsupported/corrupt/unavailable outcomes;
it never converts missing new-format data into a fresh session.

Pi supplies opaque provider payload encoding/decoding behind the agent boundary.
Provider payloads retain reasoning/continuation artifacts and exact system/tool
history. Display events cannot reconstruct this data. Intent is committed before
dispatch; accepted submissions/effects and terminal outcome are durable before
publication. Store CAS applies to the expected session position, including appends,
under one per-session serialization domain. Old settled points remain forkable
while a later parent operation is active.

The injected store's cross-owner envelope is fixed as follows. The snapshot body
is agent-owned JSON (pi payloads remain immutable byte references), so the
harness adapter validates the envelope/CAS and never interprets transcript roles.

```ts
interface SessionStoreRecord {
  readonly runId: string;
  readonly id: string;
  readonly revision: number;
  readonly schema: 'ramify-agent.session/1' | 'ramify-agent.session-operation/1';
  readonly body: Readonly<Record<string, unknown>>;
}
interface SessionStoreExpected {
  readonly id: string;
  readonly revision: number | null; // null means record must not exist
}
interface SessionStoreCommit {
  readonly runId: string;
  readonly expected: readonly SessionStoreExpected[];
  readonly records: readonly SessionStoreRecord[];
  readonly payloads: readonly TranscriptPayloadId[];
}
interface SessionStore {
  read(runId: string, id: string): Promise<SessionStoreRecord | null>;
  putPayload(bytes: Uint8Array): Promise<TranscriptPayloadId>;
  getPayload(id: TranscriptPayloadId): Promise<Uint8Array | null>;
  commit(input: SessionStoreCommit): Promise<
    { readonly kind: 'committed' } |
    { readonly kind: 'conflict'; readonly reason: string }
  >;
}
```

Record IDs distinguish sessions from operations within the run. CAS checks all
expected revisions before appending one ledger transaction; a failed comparison
writes no records. The agent compares the named immutable expected point against
the loaded snapshot before preparing that CAS. Concurrent first allocation of an
operation key uses expected revision null, preventing duplicate Create/Fork IDs.
Ledger replay is authoritative if materialized files are incomplete. Missing
referenced payloads are explicit unavailable/corrupt evidence, never a valid
committed point. Storage exceptions remain failures and cannot become success.

## Handler, policy and effect identity

A serializable intent records the complete task, ContextPolicy, current authority
policy, tool definitions/activation, scope/environment, validator identity and
result destination identity. Their canonical serialized content binds the
operation key. Handler functions, AbortSignal and onEvent callbacks are never
part of that serialization and never persisted as closures.

A binding supplies fresh tool handlers, current designated submission validator,
guard, mutation hook, event sink and destination for the original task. It also
supplies the current authority check. Retry requires those bindings to name the
recorded policy/validator/environment/destination identities and checks their
recorded serialized values; merely reusing a hash string with changed values is
insufficient. Current authority may deny the recorded operation, but cannot widen
its immutable policy or silently substitute a new task. A policy change is a new
turn after settlement. Completed/failed/stopped receipt lookup precedes the old
expected-point check, and terminal Retry performs no dispatch or external effect.

An effect journal distinguishes intent, known completion and unresolved completion
under stable call/effect IDs. Only independently established idempotence or
recorded effect recovery may replay an unfinished effect. Stop fences both future
dispatch and acceptance, settles outstanding callbacks, and preserves their
actual results or explicit interruption records. Unknown external completion
retains an unavailable point; it is never a fabricated successful tool result.
Late callbacks after settlement cannot append or accept. Transcript idempotency
makes no exactly-once promise for arbitrary shell/provider effects.

## Installed pi final dispatch seam

Installed package: `@earendil-works/pi-coding-agent@0.87.1`; its nested
`@earendil-works/pi-ai` and `pi-agent-core` supply serialization. Current source
inspection on the execution base found:

- `dist/core/sdk.js:207` supplies the extension transform as Agent `onPayload`;
  `dist/core/extensions/runner.js:961` runs `before_provider_request` and catches
  each extension exception at 976.
- `pi-agent-core/dist/agent-loop.js:263` transforms context and converts to LLM
  messages before calling `agent.streamFunction` at 271.
- `pi-ai/dist/api/openai-codex-responses.js:173` builds the native request,
  awaits `options.onPayload(body, model)` at 174 and uses its returned body;
  `JSON.stringify(body)` occurs at 181, before native HTTP/WebSocket dispatch.

Iteration 7 wraps the installed `session.agent.streamFunction`. Its request
options wrap the existing `onPayload`: first await the existing callback, then
validate the final resulting native body and return that same body. The final
validator lives outside extension dispatch, so throwing rejects provider dispatch
instead of being swallowed. Validate initial instructions, initial tools, all
inherited serialized input items and their order, including reasoning metadata,
then record a credential-free comparison. Both initial and subsequent failures
are structured operation failures. Keep a separate fatal fence so an extension
error cannot permit a later call. Pin/check the installed seam before use.

Installed `pi-ai/dist/providers/data/openai-codex.json` selects the
`openai-codex-responses` entry for `gpt-5.6-sol` with explicit
`supportsAdditionalTools: true` and `supportsMidConvoSystemMessages: true`;
`openai-codex.models.js` flattens that catalog at runtime.
Supported first target is `openai-codex/gpt-5.6-sol`, which declares native
additional-tools and later system-message compatibility. Do not infer transport
support from flags alone. Actual serialization plus live acceptance remains Q02.
Native later declarations are `additional_tools` items. Keep all historical
runtime declarations; block inactive calls before handlers and accept only the
current designated submission. Remove forced inherited head replacement and
pi automatic/default prompt/compaction rewrites for preserving operations.
The request's session/cache routing identity may differ for a child; inherited
instructions/tools/input message metadata must remain exactly equal.

## Installed Cucumber configuration seam

`@cucumber/cucumber@13.2.1` exports `loadConfiguration`, `IConfiguration`,
`IRunEnvironment`, `loadSources` and `runCucumber` from
`@cucumber/cucumber/api` (package public export and `lib/api/index.d.ts`).
The effective declared flat setup is returned as `useConfiguration`; executable
coordinates are `runConfiguration`. The public call is:

```ts
const effective = await loadConfiguration(
  { file: declaredConfigPath, profiles: declaredProfiles, provided: declaredArguments },
  { cwd: projectCwd, env: declaredEnvironment },
);
const selected = { ...effective.useConfiguration,
  paths: assignedFeaturePaths, tags: '', name: [], dryRun: false };
const focused = await loadConfiguration(
  { file: false, provided: selected }, { cwd: projectCwd, env: declaredEnvironment },
);
```

Do not pass assigned paths while resolving the source default profile: installed
`lib/api/load_configuration.js:32` warns and merges both path lists. Empty or
omitted profiles means the default profile; `file:false` disables config discovery.
Iteration 4 retains explicit file/profile/argument/environment identity and all
required support/loaders/imports/require/world setup from the effective config,
then writes a dedicated scratch config containing exact paths and execution
filters that permit all assigned pending scenarios. Native command uses explicit
`--config <generated>` and the generated profile; no broader defaults are merged.
Unknown/dynamic selection returns a limitation instead of verified focus.
Loading target config is external execution; put the adapter behind evidence
using its injected command boundary. Ordinary tests script that answer; Q01
registers actual Cucumber discovery/execution with support/world/loader checks.
The public package API was inspected locally; no retired `buildScenarioProfile`
API is available or required.

## Observation and metric wire v1

Iteration 6 defines these owner-local inputs; 11 adds validated run/protocol
records and projects pure outputs. Missing facts use null plus coverage reasons.

```ts
interface ExplorationObservation {
  readonly id: string; // run/operation/invocation/call/event-kind identity
  readonly invocationId: string;
  readonly operationId: string;
  readonly role: string;
  readonly sessionId: string;
  readonly turn: number;
  readonly callId: string;
  readonly kind: 'read' | 'search';
  readonly requestedScope: readonly string[];
  readonly resolvedScope: readonly string[] | null;
  readonly files: readonly string[] | null; // observed returned/read files
  readonly returnedBytes: number | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly elapsedMs: number | null;
  readonly outcome: 'completed' | 'failed' | 'refused' | 'interrupted';
  readonly broad: boolean | null;
  readonly outsideScope: boolean | null;
  readonly coverage: readonly string[];
}
interface ExplorationMetrics {
  readonly reads: number;
  readonly uniqueFilesRead: number;
  readonly repeatedReads: number;
  readonly returnedBytes: number; // known subtotal, accompanied by coverage
  readonly searches: number;
  readonly broadSearches: number;
  readonly outsideScopeSearches: number;
  readonly toolElapsedMs: number; // sum of observed durations, never wall time
  readonly coverage: readonly string[];
}
interface InvocationTiming {
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly milestone: 'first-designated-submission' | 'first-engineering-action' | null;
  readonly milestoneAt: string | null;
  readonly elapsedMs: number | null;
  readonly toMilestoneMs: number | null;
  readonly modelElapsedMs: number | null;
  readonly toolElapsedMs: number | null;
  readonly checkElapsedMs: number | null;
  readonly coverage: readonly string[];
}
interface RecordedCharge {
  readonly model: string;
  readonly currency: 'USD';
  readonly source: 'provider-recorded' | 'estimated-from-recorded-rates';
  readonly newInputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly outputTokens: number | null;
  readonly ratesPerMillion: {
    readonly newInput: number | null; readonly cachedInput: number | null;
    readonly cacheWrite: number | null; readonly output: number | null;
  };
  readonly newInput: number | null; readonly cachedInput: number | null;
  readonly cacheWrite: number | null; readonly output: number | null;
  readonly total: number | null;
  readonly coverage: readonly string[];
}
```

Aggregate replay identities once; inherited calls are not child observations.
Null files/bytes/durations do not become fabricated zeros. Search target paths
measure breadth, never exact scanned bytes. Keep existing scope-size/2 and
changed-line attribution intact: soft read scope is separately reported;
architect view remains its own component; same-file identities count once.
Baseline and metric revision/policy mismatches stay unavailable. Use fixed
component units, known subtotals and explicit unknown weights. Web displays
supplied results and coverage, never recalculates a score or chooses session mode.

## Cross-owner exposure

Iteration 1 owns agent declaration changes; 4 owns evidence declarations; 5 owns
plan-evidence and scenarios declarations. Every exposed signature companion must
be exposed from its defining owner. The integrator exclusively edits harness
`module.ramify`, which concurrent providers may need for future web contracts.
Workers send requested harness exposure lines to the integrator. The test-boundary
registry and shared runner config are reserved to the integrator/iteration 14.
The refreshed API views report coverage/truncation limits; current declarations
are decisive for exposed access and generated absence proves no missing API.

## Accepted preserving-provider refinement (iteration 7)

The agent exports `SessionDriverUnavailableError(reason)` as a typed driver
signal. With intact durable data, the engine records terminal unavailable status
and no usable point; terminal Retry dispatches nothing. A missing immutable blob
is corrupt storage and cannot receive a fabricated committed receipt: preflight
returns explicit unavailable without intent or dispatch. Neither path starts fresh.

The qualified implementation target is installed pi 0.87.1, model
`openai-codex/gpt-5.6-sol`, full-payload SSE with provider retry disabled. The final
payload seam validates exact native instructions, ordered tool definitions and
inherited input after extension transforms and immediately before HTTP dispatch.
Cached websocket/auto transports are unavailable because their later incremental
payload rewrite would escape that seam. Full live qualification remains Q02 in
iteration 14. Pi-private JSON builtin results preserve native content and details
through opaque journaling; harness callers receive only provider-neutral values.

The provider-neutral `piBuiltinDeclarations(names, workingDirectory)` exposes
plain immutable declarations; executable SDK builtin handlers stay inside pi and
are rebound to each task's current working directory and authority. Consumers
must use accepted task packets and their compact declaration schema so each full
submission schema is delivered once; actual validators retain the owning schema.
