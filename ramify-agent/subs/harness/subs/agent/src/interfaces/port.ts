/*
 * The agent port: how the harness core drives an agent session without
 * knowing which agent runs it. A session starts with a role, a scope, a
 * prompt and tools; it reports events; it ends with at most one accepted
 * structured submission; and it can be stopped.
 */

/** A JSON Schema object describing a tool's input. The implementation validates against it or leaves validation to the tool. */
export type JsonSchema = { readonly [key: string]: unknown };

/** The read and search tools an implementation provides itself. */
export type BuiltinTool = 'read' | 'grep' | 'ls' | 'find';

/** What a tool returns to the agent. An error result lets the agent correct itself in the same session. */
export interface ToolResult {
  readonly text: string;
  readonly isError?: boolean | undefined;
}

/** A tool the harness implements and the agent may call. */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  /** Runs the tool. It must end promptly once `signal` is aborted. */
  execute(input: unknown, signal: AbortSignal): Promise<ToolResult>;
}

/** The harness's verdict on one submission. */
export type SubmissionVerdict =
  | { readonly accepted: true }
  /** The errors go back to the same session as an error tool result; the session continues. */
  | { readonly accepted: false; readonly errors: readonly string[] }
  /** The session must end without a result, for example because the job was stopped or the bound was reached. */
  | { readonly accepted: false; readonly final: true; readonly errors: readonly string[] };

/**
 * The tool that ends a session with a result. An agent finishes only by
 * calling it; a closing message is never a result. An accepted call ends the
 * agent's turn loop.
 */
export interface SubmissionTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  /** Judges one call. Called for every call the agent makes, in order. */
  accept(input: unknown, signal: AbortSignal): Promise<SubmissionVerdict>;
}

/** What a session may see and where it runs. */
export interface SessionScope {
  /** The agent's working directory; relative paths in its tool calls resolve against it. */
  readonly workingDirectory: string;
}

export interface SessionSpec {
  /** The role the session plays, such as `architect`. */
  readonly role: string;
  readonly scope: SessionScope;
  /** The complete system prompt; the implementation adds nothing of its own. */
  readonly systemPrompt: string;
  /** The first user message. */
  readonly prompt: string;
  readonly builtinTools: readonly BuiltinTool[];
  readonly tools: readonly ToolDefinition[];
  readonly submission: SubmissionTool;
  /** A directory the implementation may use for its own session record. */
  readonly sessionDirectory: string;
  /** Receives every event in order. It must not throw. */
  readonly onEvent: (event: AgentEvent) => void;
}

/** Token usage of one model message, as the agent reports it. */
export interface TokenUsage {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly total: number;
}

/**
 * Observed activity. Tool calls are matched by `callId`, since parallel
 * calls may finish in any order. Paths in `input` are as the agent wrote
 * them, relative to the working directory or absolute.
 */
export type AgentEvent =
  | { readonly type: 'tool-started'; readonly callId: string; readonly tool: string; readonly input: unknown }
  | { readonly type: 'tool-finished'; readonly callId: string; readonly tool: string; readonly isError: boolean; readonly errorText?: string | undefined }
  | { readonly type: 'message'; readonly text: string; readonly usage?: TokenUsage | undefined };

/** How a session ended. */
export type SessionOutcome =
  /** A submission was accepted; `input` is exactly what `accept` judged. */
  | { readonly kind: 'submitted'; readonly input: unknown }
  /** The agent stopped without an accepted submission. */
  | { readonly kind: 'ended'; readonly message?: string | undefined }
  /** The session could not continue: a crash, a provider error or malformed output. */
  | { readonly kind: 'failed'; readonly error: string }
  /** The session ended because `stop` was called. */
  | { readonly kind: 'stopped' };

export interface AgentSession {
  /** Settles once, when the session ends. It never rejects. */
  readonly outcome: Promise<SessionOutcome>;
  /**
   * Asks the session to end: in-flight model calls and tools are aborted.
   * Resolves when the session is idle. Aborting is cooperative, so this
   * may resolve late or never; the caller bounds the wait and discards
   * anything the session produces afterwards.
   */
  stop(): Promise<void>;
}

/** An agent implementation: pi, or the scripted fake. */
export interface AgentPort {
  /** A short name recorded with each job, such as `pi` or `scripted`. */
  readonly name: string;
  /** Starts a session. Failures to start are reported through `outcome`, not thrown. */
  startSession(spec: SessionSpec): AgentSession;
}
