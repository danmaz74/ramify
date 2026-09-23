/*
 * The agent port: how the harness core drives an agent session without
 * knowing which agent runs it. A session starts with a role, a scope, a
 * prompt and tools; it reports events; it ends with at most one accepted
 * structured submission; and it can be stopped.
 */

/** A JSON Schema object describing a tool's input. The implementation validates against it or leaves validation to the tool. */
export type JsonSchema = { readonly [key: string]: unknown };

/**
 * The read and search tools an implementation provides itself, by the port's
 * names. Each implementation enables its own tool for each, under whatever
 * name and input that tool has, and classifies its calls as `ToolAction`s.
 */
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

/** The lines a read asks for: `start` is the first, counted from 1; `count` the most it returns. Null leaves either open. */
export interface LineRange {
  readonly start: number | null;
  readonly count: number | null;
}

/**
 * What a tool call does, in the port's terms rather than an executor's. The
 * implementation classifies its own tools, and a harness tool declares its
 * action. Everything above the port that reads a call reads this, never the
 * executor's tool or argument names; those stay for display. Paths are as
 * the agent wrote them, relative to the working directory or absolute.
 */
export type ToolAction =
  /** A read of one file; `range` is null when the call asks for all of it. */
  | { readonly kind: 'read'; readonly path: string; readonly range: LineRange | null }
  /**
   * A search or a listing. `pattern` is what is searched for, null for a
   * listing; `path` is where, null for the working directory; `glob`
   * narrows the files searched.
   */
  | { readonly kind: 'search'; readonly pattern: string | null; readonly path: string | null; readonly glob: string | null }
  /** A write of the files it names. A call that names none has an empty list. */
  | { readonly kind: 'write'; readonly paths: readonly string[] }
  /** A command to run; `command` is null when the call names none. */
  | { readonly kind: 'command'; readonly command: string | null }
  /** A harness tool whose action is its own, such as a submission. */
  | { readonly kind: 'harness' }
  /** A call the implementation cannot classify. */
  | { readonly kind: 'other' };

/** What a `guard` is asked about, before the call executes. */
export interface GuardedCall {
  readonly callId: string;
  /** The executor's own name for the tool, for display. */
  readonly tool: string;
  readonly input: unknown;
  /** What the call does; the guard judges this, never the tool's name or input. */
  readonly action: ToolAction;
}

/** A guard's answer. A denial's `text` becomes the tool's error result. */
export type GuardDecision =
  | { readonly allow: true }
  | { readonly allow: false; readonly text: string };

/** What `afterMutation` is told about a mutating call that executed. */
export interface SettledMutation {
  readonly callId: string;
  readonly tool: string;
  readonly action: ToolAction;
  readonly failed: boolean;
}

/** Whether an implementation supports one thing it declares. */
export type Availability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: string };

/**
 * What an executor declares it supports. Each entry is available, or
 * unavailable with a reason; what is missing degrades with that reason and
 * never silently.
 *
 * - Usage, context size and compaction are port events. One the executor
 *   cannot observe is recorded as a coverage gap, never read as room.
 * - `continue`, `fork` and `forkAtPoint` are session starts; a start the
 *   executor lacks degrades to `fresh` with the declared reason, as
 *   `ActualStart` reports. `forkAtPoint` is a fork from any ref, not only
 *   from a session's latest one.
 * - `appendContext` stores text without a model call.
 * - `exactSystemPrompt` sends the spec's prompt with nothing of the
 *   executor's own added.
 * - `guard` asks the spec's guard before a mutating call executes, and
 *   `afterMutation` tells the spec after one settles.
 * - `thinking` reports the model's thinking as `thinking` blocks, each with
 *   its visibility. An executor that lacks it reports none, and its
 *   messages hold no thinking because it cannot say, not because there was
 *   none.
 * - `retries` reports the executor's own retries of a failed model call as
 *   `retry` events.
 */
export interface ExecutorSupport {
  readonly usage: Availability;
  readonly context: Availability;
  readonly compaction: Availability;
  readonly thinking: Availability;
  readonly retries: Availability;
  readonly continue: Availability;
  readonly fork: Availability;
  readonly forkAtPoint: Availability;
  readonly appendContext: Availability;
  readonly exactSystemPrompt: Availability;
  readonly guard: Availability;
  readonly afterMutation: Availability;
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
  /**
   * What a call of this tool does, declared by the tool's author from its
   * own input. A shell declares a command. Default: `harness`.
   */
  readonly action?: ((input: unknown) => ToolAction) | undefined;
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
 * How much of a model's thinking a `thinking` block holds.
 *
 * - `full`: the thinking as the model produced it.
 * - `summary`: a summary of it, which some providers return instead.
 * - `unmarked`: text the executor supplies without saying which of the two
 *   it is.
 * - `redacted`: withheld by the provider; the block's text is empty.
 */
export type ThinkingVisibility = 'full' | 'summary' | 'unmarked' | 'redacted';

/** Text of a message. */
export interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

/** The model's thinking, in an assistant message. Opaque provider data, such as a signature, is never carried. */
export interface ThinkingBlock {
  readonly type: 'thinking';
  readonly visibility: ThinkingVisibility;
  readonly text: string;
}

/**
 * A tool call, in the assistant message that makes it. Its result arrives as
 * a `tool-result` message with the same `callId`. `tool` and `input` are the
 * executor's own; `action` is the one `tool-started` carries.
 */
export interface ToolCallBlock {
  readonly type: 'tool-call';
  readonly callId: string;
  readonly tool: string;
  readonly input: unknown;
  readonly action: ToolAction;
}

/**
 * Content the port does not map, such as an image. It is recorded by its
 * kind and a short description, and its content is not carried; nothing an
 * executor reports is dropped silently.
 */
export interface OtherBlock {
  readonly type: 'other';
  /** The executor's own name for the content, such as `image`. */
  readonly kind: string;
  readonly description: string;
}

/** What a user message or a tool result holds. */
export type ContentBlock = TextBlock | OtherBlock;

/** What an assistant message holds. */
export type AssistantBlock = TextBlock | ThinkingBlock | ToolCallBlock | OtherBlock;

/** Why a model's message ended, in the port's terms. `other` is a reason the port does not name. */
export type StopReason = 'end' | 'tool-use' | 'length' | 'error' | 'aborted' | 'other';

/** A message's price as the executor estimates it, in US dollars. */
export interface MessageCost {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly total: number;
}

/** A message's cache writes by retention, in tokens: `short` is the provider's default, `long` its extended retention. */
export interface CacheWrites {
  readonly short: number;
  readonly long: number;
}

/**
 * The optional detail of one assistant message. Every field is present in
 * the event, and a field the executor did not report for this message is
 * `null`: absent, which is never zero and never an empty value.
 */
export interface MessageDetail {
  /** The model that answered, as the executor names it. */
  readonly model: string | null;
  /** The thinking level the answer was produced at, in the provider's own terms. */
  readonly thinkingLevel: string | null;
  readonly stopReason: StopReason | null;
  /** The error the message ended with; null also when it reports none. */
  readonly error: string | null;
  /** Tokens of `usage.output` spent on thinking. */
  readonly reasoningTokens: number | null;
  readonly cost: MessageCost | null;
  /** `usage.cacheWrite` split by retention. */
  readonly cacheWrites: CacheWrites | null;
}

/** A message detail with nothing reported. */
export const noMessageDetail: MessageDetail = {
  model: null, thinkingLevel: null, stopReason: null, error: null, reasoningTokens: null, cost: null, cacheWrites: null,
};

/**
 * An assistant message's display text: its text blocks, or the tools it
 * calls when it has none, such as `(calls read, grep)`. Every implementation
 * applies this one rule.
 */
export function assistantText(blocks: readonly AssistantBlock[]): string {
  const text = blocks.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('\n').trim();
  if (text !== '') return text;
  const calls = blocks.flatMap(block => (block.type === 'tool-call' ? [block.tool] : []));
  return calls.length > 0 ? `(calls ${calls.join(', ')})` : '';
}

/**
 * Observed activity. Tool calls are matched by `callId`, since parallel
 * calls may finish in any order. `tool` and `input` are the executor's own,
 * for display; what the call does is its `action`.
 *
 * `message` carries every message of the conversation once it is complete,
 * in order: the first prompt before the model is called, each assistant
 * message, and each tool result as the agent saw it. The required core is
 * the text, the tool calls and their results, paired by call ID. Detail an
 * executor may not report is `null` when absent; see {@link MessageDetail}.
 */
export type AgentEvent =
  /** `mutating` and `action` are declared by the implementation or by the tool's author, never inferred from the name. */
  | {
      readonly type: 'tool-started'; readonly callId: string; readonly tool: string; readonly input: unknown;
      readonly action: ToolAction; readonly mutating: boolean;
    }
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
  /** A user message: the first prompt, or other input the executor gave the model as the user's. */
  | { readonly type: 'message'; readonly role: 'user'; readonly blocks: readonly ContentBlock[] }
  /**
   * An assistant message. `text` is for display: its text blocks, or the
   * tools it calls when it has none. `usage` is null when not reported.
   */
  | {
      readonly type: 'message'; readonly role: 'assistant'; readonly blocks: readonly AssistantBlock[];
      readonly text: string; readonly usage: TokenUsage | null; readonly detail: MessageDetail;
    }
  /** A tool's result as the agent saw it, including any text the harness appended; `callId` names its call. */
  | {
      readonly type: 'message'; readonly role: 'tool-result'; readonly callId: string; readonly tool: string;
      readonly isError: boolean; readonly blocks: readonly ContentBlock[];
    }
  /**
   * The context size after a model or tool boundary. It is always an
   * estimate. `tokens: null` means the implementation cannot size the context
   * and is never room: the budget cannot fire on it. No observation at all is
   * a coverage gap, not an empty context.
   */
  | { readonly type: 'context-observed'; readonly tokens: number | null; readonly window: number | null }
  | { readonly type: 'compaction'; readonly phase: 'started'; readonly reason: CompactionReason }
  /** Sizes and an error the executor did not report are null. */
  | {
      readonly type: 'compaction'; readonly phase: 'ended'; readonly reason: CompactionReason;
      readonly tokensBefore: number | null; readonly tokensAfter: number | null;
      readonly aborted: boolean; readonly errorText: string | null;
    }
  /**
   * The executor retrying a failed model call on its own: the failed
   * assistant message precedes `started`. Detail it did not report is null.
   */
  | {
      readonly type: 'retry'; readonly phase: 'started'; readonly attempt: number;
      readonly maxAttempts: number | null; readonly delayMs: number | null; readonly errorText: string | null;
    }
  | { readonly type: 'retry'; readonly phase: 'ended'; readonly attempt: number; readonly succeeded: boolean; readonly errorText: string | null };

/** Why a compaction ran. */
export type CompactionReason = 'manual' | 'threshold' | 'overflow';

/** One message of the conversation, as `AgentEvent` carries it. */
export type MessageEvent = Extract<AgentEvent, { readonly type: 'message' }>;

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
  /** What this implementation supports, and the reason for anything it does not. */
  readonly support: ExecutorSupport;
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
