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

/**
 * The mutating tools an implementation provides itself. A shell is never one
 * of them: the shell an engineer receives is a harness tool.
 */
export type WriteTool = 'edit' | 'write';

/**
 * An opaque handle to a point in a session's history, not to a session. The
 * implementation resolves it; the harness stores it and compares it for
 * equality only. A fork taken from a ref starts at the point that ref names,
 * so every ref the port hands back is pinned to the history as it stood when
 * the ref was produced.
 */
export type SessionRef = string;

/** Where a session starts. */
export type SessionStart =
  | { readonly mode: 'fresh' }
  | { readonly mode: 'continue'; readonly ref: SessionRef }
  | { readonly mode: 'fork'; readonly from: SessionRef };

export type SessionMode = SessionStart['mode'];

/**
 * The mode that was actual. A requested mode the implementation could not
 * honor degrades to `fresh` and says why, so that a fork which silently
 * became a fresh session cannot corrupt the comparison of fork cost.
 */
export interface ActualStart {
  readonly mode: SessionMode;
  readonly degradedReason?: string | undefined;
}

/**
 * The context policy for one session. It is port policy: the implementation
 * enforces it, and none of it is ever prompt text.
 */
export interface ContextPolicy {
  /** `forbidden` disables the implementation's automatic compaction for this session, and the implementation never compacts on its own. */
  readonly compaction: 'forbidden' | 'allowed';
  /** The harness's own budget in tokens, used when no window is reported. Null leaves the budget unbounded. */
  readonly budgetTokens: number | null;
  /** The same budget as a fraction of the reported window; it applies whenever the window is known. */
  readonly budgetFraction: number | null;
  /** Room the role is left to write its report once the budget is reached. */
  readonly reportReserveTokens: number;
}

/**
 * Whether an observed context size reaches a session's budget, leaving its
 * report reserve. The fraction of a known window is the budget whenever the
 * window is known; the absolute figure applies only when no window is
 * reported. An unknown size never reaches a budget, because unknown is not
 * room. Every implementation applies this one rule.
 */
export function contextBudgetReached(policy: ContextPolicy, tokens: number | null, window: number | null): boolean {
  if (tokens === null) return false;
  const budget = window !== null && policy.budgetFraction !== null
    ? policy.budgetFraction * window
    : policy.budgetTokens;
  if (budget === null) return false;
  return tokens + policy.reportReserveTokens >= budget;
}

/** What a `guard` is asked about, before the call executes. */
export interface GuardedCall {
  readonly callId: string;
  readonly tool: string;
  readonly input: unknown;
}

/** A guard's answer. A denial's `text` becomes the tool's error result. */
export type GuardDecision =
  | { readonly allow: true }
  | { readonly allow: false; readonly text: string };

/** What `afterMutation` is told about a mutating call that executed. */
export interface SettledMutation {
  readonly callId: string;
  readonly tool: string;
  readonly failed: boolean;
}

/** Whether an implementation can observe one of the port's observations. */
export type Availability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: string };

/**
 * What an implementation can observe. Usage, context size and compaction are
 * port events; an implementation that cannot observe one says so with a
 * reason, which the harness records as a coverage gap rather than treating
 * the silence as room.
 */
export interface PortObservations {
  readonly usage: Availability;
  readonly context: Availability;
  readonly compaction: Availability;
}

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
  /**
   * Whether this tool mutates the working directory. The tool's author
   * declares it; no generic code infers it from the name. A mutating tool is
   * guarded and observed after it settles. Default: false.
   */
  readonly mutating?: boolean | undefined;
  /** Runs the tool. It must end promptly once `signal` is aborted. */
  execute(input: unknown, signal: AbortSignal): Promise<ToolResult>;
}

/** The harness's verdict on one submission. */
export type SubmissionVerdict =
  /** `text` is what the agent is told; without it the implementation's own acknowledgement is used. */
  | { readonly accepted: true; readonly text?: string | undefined }
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
  /** Where this session starts. The session reports through `start` the mode that was actual. */
  readonly session: SessionStart;
  /** The context and compaction policy for this session. */
  readonly context: ContextPolicy;
  /** The implementation's own tools to enable. `edit` and `write` are permitted here; a shell never is. */
  readonly builtinTools: ReadonlyArray<BuiltinTool | WriteTool>;
  readonly tools: readonly ToolDefinition[];
  readonly submission: SubmissionTool;
  /** A directory the implementation may use for its own session record. */
  readonly sessionDirectory: string;
  /**
   * Called before a mutating call executes: a mutating built-in, or a harness
   * tool that declares itself mutating. A denial becomes that call's error
   * result and nothing is mutated.
   */
  readonly guard?: ((call: GuardedCall) => Promise<GuardDecision>) | undefined;
  /**
   * Called after a mutating call that executed has settled, whether it
   * succeeded or not. Returned text is appended to the call's result, so a
   * check the harness ran reaches the agent before its next step. It is never
   * called for a call the guard denied: that call executed nothing and
   * mutated nothing.
   */
  readonly afterMutation?: ((call: SettledMutation) => Promise<{ readonly text: string } | null>) | undefined;
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
  /** `mutating` is declared by the implementation or by the tool's author, never inferred from the name. */
  | { readonly type: 'tool-started'; readonly callId: string; readonly tool: string; readonly input: unknown; readonly mutating: boolean }
  | {
      readonly type: 'tool-finished'; readonly callId: string; readonly tool: string;
      readonly isError: boolean; readonly errorText?: string | undefined;
      /**
       * False when the implementation rejected the input before the tool ran,
       * which is how every such rejection is counted without reading the
       * implementation's message text. A call the guard denied passed the
       * implementation's validation, so it is true although the tool did not
       * run; the guard's own answer records that denial.
       */
      readonly reachedTool: boolean;
    }
  | { readonly type: 'message'; readonly text: string; readonly usage?: TokenUsage | undefined }
  /**
   * The context size after a model or tool boundary. It is always an
   * estimate. `tokens: null` means the implementation cannot size the context
   * and is never room: the budget cannot fire on it. No observation at all is
   * a coverage gap, not an empty context.
   */
  | { readonly type: 'context-observed'; readonly tokens: number | null; readonly window: number | null }
  | {
      readonly type: 'compaction'; readonly phase: 'started' | 'ended';
      readonly reason: 'manual' | 'threshold' | 'overflow';
      readonly tokensBefore?: number | undefined; readonly tokensAfter?: number | undefined;
      readonly aborted?: boolean | undefined; readonly errorText?: string | undefined;
    };

/** How a session ended. */
export type SessionOutcome =
  /** A submission was accepted; `input` is exactly what `accept` judged. */
  | { readonly kind: 'submitted'; readonly input: unknown }
  /** The agent stopped without an accepted submission. */
  | { readonly kind: 'ended'; readonly message?: string | undefined }
  /** The session could not continue: a crash, a provider error or malformed output. */
  | { readonly kind: 'failed'; readonly error: string }
  /** The session ended because `stop` was called. */
  | { readonly kind: 'stopped' }
  /**
   * The context budget was reached: the implementation disabled the tools,
   * allowed one final response and ended the session. `tokens` is the
   * observation that reached the budget; `report` is that final response.
   */
  | { readonly kind: 'context-budget-reached'; readonly tokens: number | null; readonly report?: string | undefined };

export interface AgentSession {
  /** Settles once, when the session ends. It never rejects. */
  readonly outcome: Promise<SessionOutcome>;
  /** The mode that was actual, which may differ from the one the spec asked for. */
  readonly start: ActualStart;
  /** The point this session's history has reached. It advances as the session runs. */
  readonly ref: SessionRef;
  /**
   * Resolves `settled` when the implementation believes the session is idle
   * and its tools have finished, and `timed-out` when it cannot say so within
   * its own bound. It is evidence the harness uses, never the evidence it
   * relies on: the harness confirms settlement itself, by process group and a
   * stable tree.
   */
  settled(): Promise<'settled' | 'timed-out'>;
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
  /** What this implementation can observe, and the reason for anything it cannot. */
  readonly observations: PortObservations;
  /** Starts a session. Failures to start are reported through `outcome`, not thrown. */
  startSession(spec: SessionSpec): AgentSession;
  /**
   * Stores text in a session without a model call, so that a session started
   * from the returned ref carries it. `key` makes a repeat a no-op, which is
   * what an intent performed again after a crash needs. A ref whose session
   * can no longer be read answers `session-lost`.
   */
  appendContext(ref: SessionRef, key: string, text: string): Promise<AppendOutcome>;
}

/** What an `appendContext` did. */
export type AppendOutcome =
  | { readonly outcome: 'appended' | 'already-present'; readonly ref: SessionRef }
  | { readonly outcome: 'session-lost' };
