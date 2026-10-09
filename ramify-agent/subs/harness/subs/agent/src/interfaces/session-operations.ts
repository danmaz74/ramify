import type { AgentEvent, ContextPolicy, GuardedCall, GuardDecision, JsonSchema, SessionOutcome, SettledMutation, SubmissionVerdict, ToolAction, ToolDefinition, ToolResult } from './port.js';

export type AgentSessionId = string;
export type SessionOperationId = string;
export type TranscriptPayloadId = string;
/** Provider history cannot safely be resumed. Historic settled points remain valid. */
export class SessionDriverUnavailableError extends Error {
  constructor(reason: string) { super(reason); this.name = 'SessionDriverUnavailableError'; }
}
export interface AgentSessionPoint { readonly sessionId: AgentSessionId; readonly kind: 'turn' | 'checkpoint'; readonly turn: number; readonly checkpoint: string }
export interface SessionOperationKey { readonly runId: string; readonly operationId: SessionOperationId }
/** Original admitted execution identity. sourcePoint is real; no terminal checkpoint is guessed. */
export interface SessionExecutionIdentity extends SessionOperationKey { readonly sessionId: AgentSessionId; readonly turn: number; readonly sourcePoint: AgentSessionPoint }
export interface SessionLineage { readonly sessionId: AgentSessionId; readonly parent: AgentSessionPoint | null; readonly currentPoint: AgentSessionPoint }
export interface SessionOperationReceipt extends SessionOperationKey {
  readonly sessionId: AgentSessionId; readonly turn: number | null; readonly point: AgentSessionPoint | null;
  readonly status: 'completed' | 'failed' | 'stopped' | 'unavailable' | 'conflict'; readonly outcome: SessionOutcome | null; readonly reason: string | null;
}
export interface SessionToolDeclaration { readonly name: string; readonly description: string; readonly inputSchema: JsonSchema; readonly mutating: boolean }
export interface SessionContextAddition { readonly key: string; readonly kind: 'role-instructions' | 'brief' | 'activation-instructions'; readonly text: string; readonly revision: string | null }
export interface SessionToolChange { readonly add: readonly SessionToolDeclaration[]; readonly activate: readonly string[]; readonly inactivate: readonly string[] }
export interface SessionTaskInput {
  readonly role: string; readonly message: string; readonly submissionTool: string;
  readonly environment: { readonly workingDirectory: string; readonly candidate: string | null; readonly snapshot: string | null; readonly limits: Readonly<Record<string, unknown>> };
  readonly policyIdentity: string; readonly validatorIdentity: string; readonly destinationIdentity: string;
}
export interface SessionStoreRecord { readonly runId: string; readonly id: string; readonly revision: number; readonly schema: 'ramify-agent.session/1' | 'ramify-agent.session-operation/1'; readonly body: Readonly<Record<string, unknown>> }
export interface SessionStoreExpected { readonly id: string; readonly revision: number | null }
export interface SessionStoreCommit { readonly runId: string; readonly expected: readonly SessionStoreExpected[]; readonly records: readonly SessionStoreRecord[]; readonly payloads: readonly TranscriptPayloadId[] }
export interface SessionStore {
  read(runId: string, id: string): Promise<SessionStoreRecord | null>;
  putPayload(bytes: Uint8Array): Promise<TranscriptPayloadId>;
  getPayload(id: TranscriptPayloadId): Promise<Uint8Array | null>;
  commit(input: SessionStoreCommit): Promise<{ readonly kind: 'committed' } | { readonly kind: 'conflict'; readonly reason: string }>;
}
/** Serialized values, not executable authority or validator closures. */
export interface SessionExecutionPolicy { readonly context: ContextPolicy; readonly authority: Readonly<Record<string, unknown>>; readonly validator: Readonly<Record<string, unknown>>; readonly destination: Readonly<Record<string, unknown>> }
export interface SessionExecutionBindings {
  readonly task: SessionTaskInput; readonly policy: SessionExecutionPolicy;
  /** Original identity, after admission/current authority and before events/effects. Rebound on unfinished Retry. */
  readonly prepared?: ((identity: SessionExecutionIdentity) => Promise<void>) | undefined;
  readonly tools: readonly ToolDefinition[];
  readonly submission: { readonly name: string; accept(input: unknown, signal: AbortSignal): Promise<SubmissionVerdict> };
  readonly currentAuthority: (task: SessionTaskInput, policy: SessionExecutionPolicy) => Promise<boolean>;
  readonly guard?: ((call: GuardedCall) => Promise<GuardDecision>) | undefined;
  readonly afterMutation?: ((call: SettledMutation) => Promise<{ readonly text: string } | null>) | undefined;
  readonly onEvent: (event: AgentEvent) => void;
  /** Invoked after durable settlement. Receives the stable key for idempotent destination publication. */
  readonly publish: (receipt: SessionOperationReceipt) => Promise<void>;
  /** Explicit independent recovery for an uncertain external effect; never called by default. */
  readonly recoverEffect?: ((effect: SessionEffectRecord) => Promise<ToolResult | null>) | undefined;
}
export interface SessionTranscriptEntry { readonly key: string; readonly payloadId: TranscriptPayloadId; readonly kind: 'agent' | 'provider' }
export interface SessionEffectRecord { readonly callId: string; readonly tool: string; readonly input: unknown; readonly phase: 'intent' | 'completed'; readonly result: ToolResult | null; readonly verdict: SubmissionVerdict | null }
export interface AgentSessionSnapshot extends SessionLineage {
  readonly runId: string; readonly initialInstructions: string; readonly policy: SessionExecutionPolicy;
  readonly declarations: readonly SessionToolDeclaration[]; readonly activeTools: readonly string[];
  readonly additions: readonly SessionContextAddition[]; readonly transcript: readonly SessionTranscriptEntry[];
  readonly activeOperation: SessionOperationId | null; readonly available: boolean;
}
export interface SessionDriverRuntime {
  readonly signal: AbortSignal;
  /** Required at final provider dispatch, after all awaited payload transformations. */
  assertLive(): Promise<void>;
  describeTool(name: string, input: unknown): { readonly action: ToolAction; readonly mutating: boolean };
  callTool(callId: string, name: string, input: unknown): Promise<ToolResult>;
  submit(callId: string, input: unknown): Promise<SubmissionVerdict>;
  /** Persist exact opaque provider bytes before their dependent effects/dispatches. A key is immutable and repeatable. */
  persistPayload(key: string, bytes: Uint8Array): Promise<TranscriptPayloadId>;
  /** Optional atomic publication of ordered opaque references. Every entry is durably persisted and authority checked. */
  persistPayloads?(entries: readonly { readonly key: string; readonly bytes: Uint8Array }[]): Promise<readonly TranscriptPayloadId[]>;
  readPayload(id: TranscriptPayloadId): Promise<Uint8Array>;
  onEvent(event: AgentEvent): void;
}
export interface SessionDriverInvocation {
  readonly key: SessionOperationKey; readonly identity: SessionExecutionIdentity; readonly session: AgentSessionSnapshot; readonly task: SessionTaskInput;
  readonly recovering: boolean; readonly effects: readonly SessionEffectRecord[];
}
/** Implementations own opaque provider encoding; display events never become provider history.
 * Dispatch must drain its provider work before returning. Admitted runtime calls are also drained by the engine. */
export interface SessionOperationDriver { dispatch(input: SessionDriverInvocation, runtime: SessionDriverRuntime): Promise<SessionOutcome> }
export interface CreateSessionInput extends SessionOperationKey { readonly initialInstructions: string; readonly declarations: readonly SessionToolDeclaration[]; readonly activate: readonly string[]; readonly policy: SessionExecutionPolicy }
export interface ContinueSessionInput extends SessionOperationKey { readonly sessionId: AgentSessionId; readonly expectedPoint: AgentSessionPoint; readonly task: SessionTaskInput; readonly additions: readonly SessionContextAddition[]; readonly toolChange: SessionToolChange; readonly policy: SessionExecutionPolicy; readonly bindings: SessionExecutionBindings }
export interface ForkSessionInput extends SessionOperationKey { readonly sourcePoint: AgentSessionPoint }
export interface AppendSessionContextInput extends SessionOperationKey { readonly sessionId: AgentSessionId; readonly expectedPoint: AgentSessionPoint; readonly additions: readonly SessionContextAddition[] }
export interface ChangeSessionToolsInput extends SessionOperationKey { readonly sessionId: AgentSessionId; readonly expectedPoint: AgentSessionPoint; readonly toolChange: SessionToolChange }
export interface RetrySessionInput extends SessionOperationKey { readonly bindings: SessionExecutionBindings }
export interface StopSessionInput extends SessionOperationKey { readonly sessionId: AgentSessionId }
export interface SessionOperationHandle {
  /** Durable terminal decision; Stop can resolve it while interrupted work is still draining. */
  readonly receipt: Promise<SessionOperationReceipt>;
  readonly outcome: Promise<SessionOutcome | null>;
  /** Fence/abort promptly, then wait for actual driver, runtime calls and publication drainage. The caller bounds this wait. */
  stop(): Promise<SessionOperationReceipt>;
  /** Actual quiescence, independently of receipt. Rejects when a foreign live owner's idle evidence is unavailable.
   * A caller must retain its existing settlement bound and cannot interpret a receipt alone as idle. */
  settled(): Promise<SessionOperationReceipt>;
}
export interface SessionOperations {
  create(input: CreateSessionInput): Promise<SessionOperationReceipt>;
  continue(input: ContinueSessionInput): Promise<SessionOperationHandle>;
  fork(input: ForkSessionInput): Promise<SessionOperationReceipt>;
  appendContext(input: AppendSessionContextInput): Promise<SessionOperationReceipt>;
  changeTools(input: ChangeSessionToolsInput): Promise<SessionOperationReceipt>;
  retry(input: RetrySessionInput): Promise<SessionOperationHandle>;
  stop(input: StopSessionInput): Promise<SessionOperationReceipt>;
  /** Pure original intent lookup. Missing is null; corrupt/unavailable state rejects. No dispatch or acceptance. */
  operationIdentity(runId: string, operationId: SessionOperationId): Promise<SessionExecutionIdentity | null>;
  inspect(runId: string, sessionId: AgentSessionId, point?: AgentSessionPoint): Promise<AgentSessionSnapshot | null>;
}
export interface SessionExecutionOwner { readonly token: string; readonly pid: number }
export interface SessionOperationsOptions {
  readonly sessionStore: SessionStore; readonly driver: SessionOperationDriver;
  /** Script external ownership/liveness answers in ordinary tests. Default uses current-process tokens and kernel PID liveness. */
  readonly isExecutionOwnerAlive?: ((owner: SessionExecutionOwner) => Promise<boolean>) | undefined;
}
