import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { assistantText, contextBudgetReached, noMessageDetail } from './interfaces/port.js';
import type {
  ActualStart,
  AgentPort,
  AssistantBlock,
  AgentSession,
  AppendOutcome,
  BuiltinTool,
  ExecutorSupport,
  MessageDetail,
  SessionOutcome,
  SessionRef,
  SessionSpec,
  TokenUsage,
  ToolAction,
  ToolCallBlock,
  WriteTool,
} from './interfaces/port.js';

/**
 * One step of a scripted session. The fake runs the steps in order and
 * checks for Stop before each one. Before the first step it reports the
 * spec's prompt as the user message, as an executor does before its first
 * model call. Each tool call and submission is reported as an assistant
 * message holding the call, and its result as a tool-result message.
 */
export type ScriptStep =
  /**
   * Calls a tool: a harness tool runs for real; a built-in one only reports
   * its call, except that the write built-ins really write. `mutating`
   * overrides what the tool declares, so a script can exercise the guard
   * over any name; the write built-ins are mutating by default.
   * `reachedTool: false` is a call the implementation itself rejected before
   * the tool ran. `action` is what the call does; without it a harness tool's
   * declared action is used, and a built-in's is classified from the input
   * the port's names take (`path`, `pattern`, `glob`, `offset`, `limit`).
   */
  | {
      readonly kind: 'tool'; readonly tool: string; readonly input: unknown;
      readonly action?: ToolAction | undefined;
      readonly mutating?: boolean | undefined; readonly reachedTool?: boolean | undefined;
    }
  /**
   * An assistant message: `blocks`, such as thinking, and then `text` as a
   * text block unless it is empty. Detail the step leaves out is reported
   * absent, so a script chooses what its executor reports.
   */
  | {
      readonly kind: 'message'; readonly text: string; readonly usage?: TokenUsage | undefined;
      readonly blocks?: readonly AssistantBlock[] | undefined; readonly detail?: Partial<MessageDetail> | undefined;
    }
  /**
   * The executor retries a failed model call on its own: the failed
   * assistant message, then the retry's start and end. `succeeded: false`
   * is a retry that gave up; the script goes on either way.
   */
  | {
      readonly kind: 'retry'; readonly errorText: string; readonly attempt?: number | undefined;
      readonly maxAttempts?: number | undefined; readonly delayMs?: number | undefined; readonly succeeded?: boolean | undefined;
    }
  /** Observes the context after a boundary. `tokens: null` is unknown, never room. */
  | { readonly kind: 'context'; readonly tokens: number | null; readonly window: number | null }
  /** Compacts, unless the session's policy forbids it, in which case the step is suppressed and counted. */
  | {
      readonly kind: 'compaction'; readonly reason: 'manual' | 'threshold' | 'overflow';
      readonly tokensBefore?: number | undefined; readonly tokensAfter?: number | undefined;
      readonly aborted?: boolean | undefined; readonly errorText?: string | undefined;
    }
  /** Waits, ending early on Stop. */
  | { readonly kind: 'wait'; readonly ms: number }
  /**
   * Waits, ignoring Stop, like a tool that does not honor its signal. With
   * `thenIgnoreStop` the session also keeps running the rest of its script
   * after Stop: an agent that misbehaves, whose output must be discarded.
   */
  | { readonly kind: 'stall'; readonly ms: number; readonly thenIgnoreStop?: boolean | undefined }
  /** Never settles and ignores Stop. */
  | { readonly kind: 'hang' }
  /** Calls the submission tool. Accepted ends the session; rejected continues with the next step. */
  | { readonly kind: 'submit'; readonly input: unknown }
  /** The session crashes. */
  | { readonly kind: 'fail'; readonly error: string }
  /** The agent stops talking without submitting. */
  | { readonly kind: 'end'; readonly message?: string | undefined };

export type Script = readonly ScriptStep[] | ((spec: SessionSpec) => readonly ScriptStep[]);

/** One tool result as the agent saw it, after `afterMutation` appended its text. */
export interface ScriptedToolResult {
  readonly callId: string;
  readonly tool: string;
  readonly text: string;
  readonly isError: boolean;
}

/** What a scripted session did, for tests. */
export interface ScriptedSessionRecord {
  readonly spec: SessionSpec;
  /** Every submission verdict, in order. */
  readonly verdicts: unknown[];
  /** The mode that was actual, and why it degraded if it did. */
  readonly start: ActualStart;
  /** The appended context this session started with, oldest first. */
  readonly inherited: readonly string[];
  /** Every tool result the agent saw, in order. */
  readonly results: ScriptedToolResult[];
  /** The call IDs the guard denied. */
  readonly denied: string[];
  /** Compaction steps the session's policy forbade. */
  suppressedCompactions: number;
  /** Tool and submission steps refused because the budget had disabled the tools. */
  refusedAfterBudget: number;
  stopCalls: number;
  ref: SessionRef;
  outcome?: SessionOutcome;
}

export interface ScriptedAgent extends AgentPort {
  readonly sessions: readonly ScriptedSessionRecord[];
  /**
   * Forgets a session, as an implementation that can no longer read one does.
   * A `continue` from a ref of a forgotten session degrades to `fresh` with
   * its reason, and an `appendContext` to it answers `session-lost`.
   */
  forget(ref: SessionRef): boolean;
}

export interface ScriptedAgentOptions {
  /** How long `settled()` waits before answering `timed-out`. */
  readonly settleMs?: number | undefined;
  /**
   * The fake's own names for the port's built-in tools, so a script can be
   * an executor whose tools are named otherwise, such as `Read`. Default:
   * the port's names.
   */
  readonly toolNames?: { readonly [tool in BuiltinTool | WriteTool]?: string } | undefined;
  /**
   * What the fake declares it lacks. A `continue` or `fork` it lacks degrades
   * to `fresh` with the declared reason; without `thinking` its messages hold
   * no thinking blocks, and without `retries` it reports no retry events.
   * Default: it supports everything.
   */
  readonly support?: Partial<ExecutorSupport> | undefined;
}

const never = new Promise<never>(() => undefined);

const portTools: ReadonlyArray<BuiltinTool | WriteTool> = ['read', 'grep', 'ls', 'find', 'edit', 'write'];

/** What the fake supports: everything, so the core's tests never depend on pi. */
const scriptedSupport: ExecutorSupport = {
  usage: { available: true },
  context: { available: true },
  compaction: { available: true },
  thinking: { available: true },
  retries: { available: true },
  continue: { available: true },
  fork: { available: true },
  forkAtPoint: { available: true },
  appendContext: { available: true },
  exactSystemPrompt: { available: true },
  guard: { available: true },
  afterMutation: { available: true },
};

/**
 * The scripted fake: an agent that replays a script of events, tool calls
 * and submissions, including failures and hangs. It is the port's second
 * implementation and the one the harness's tests run against. A function
 * script is given the session's spec, so it can use the prompt or scope.
 *
 * It implements every port behavior the real implementation does: session
 * modes, appended context, the guard and the after-mutation hook, usage,
 * context observations, compaction under its policy, retries, every message
 * of the conversation, settlement and the context budget.
 */
export function createScriptedAgent(script: Script, options: ScriptedAgentOptions = {}): ScriptedAgent {
  const sessions: ScriptedSessionRecord[] = [];
  const settleMs = options.settleMs ?? 30_000;
  const support: ExecutorSupport = { ...scriptedSupport, ...options.support };
  /** The port's built-in each of the fake's own tool names stands for. */
  const builtinOf = new Map(portTools.map(tool => [options.toolNames?.[tool] ?? tool, tool]));
  /** Appended context per scripted session, which a continue inherits and a fork inherits up to its point. */
  const histories = new Map<string, Array<{ readonly key: string; readonly text: string }>>();
  let sessionCount = 0;

  const refOf = (id: string, steps: number): SessionRef => `${id}@${steps}#${histories.get(id)?.length ?? 0}`;

  return {
    name: 'scripted',
    support,
    sessions,

    forget(ref) {
      const id = sessionOf(ref);
      return id === undefined ? false : histories.delete(id);
    },

    async appendContext(ref, key, text) {
      const id = sessionOf(ref);
      const history = id === undefined ? undefined : histories.get(id);
      if (id === undefined || history === undefined) return { outcome: 'session-lost' };
      if (history.some(entry => entry.key === key)) return { outcome: 'already-present', ref: refOf(id, pointOf(ref)) };
      history.push({ key, text });
      return { outcome: 'appended', ref: refOf(id, pointOf(ref)) };
    },

    startSession(spec: SessionSpec): AgentSession {
      const { id, start, inherited } = beginSession(spec, histories, () => `scripted-${++sessionCount}`, support);
      let stepsRun = 0;
      const record: ScriptedSessionRecord = {
        spec, verdicts: [], start, inherited, results: [], denied: [],
        suppressedCompactions: 0, refusedAfterBudget: 0, stopCalls: 0, ref: refOf(id, 0),
      };
      sessions.push(record);
      const controller = new AbortController();
      let deaf = false;
      let callCount = 0;
      const nextCallId = () => `call-${++callCount}`;
      /** Set once an observation reaches the budget: the tools are disabled from then on. */
      let budgetTokens: number | null | undefined;

      const run = async (): Promise<SessionOutcome> => {
        const steps = typeof script === 'function' ? script(spec) : script;
        let report: string | undefined;
        spec.onEvent({ type: 'message', role: 'user', blocks: [{ type: 'text', text: spec.prompt }] });
        for (const step of steps) {
          if (controller.signal.aborted && !deaf) return { kind: 'stopped' };
          stepsRun += 1;
          record.ref = refOf(id, stepsRun);
          if (budgetTokens !== undefined && step.kind !== 'message') {
            // The tools are gone, so a call cannot happen; only the final response can.
            if (step.kind === 'tool' || step.kind === 'submit') record.refusedAfterBudget += 1;
            continue;
          }
          switch (step.kind) {
            case 'message': {
              // An executor that declares no thinking reports none.
              const given = (step.blocks ?? []).filter(block => block.type !== 'thinking' || support.thinking.available);
              const blocks: AssistantBlock[] = [...given, ...(step.text === '' ? [] : [{ type: 'text' as const, text: step.text }])];
              spec.onEvent({
                type: 'message', role: 'assistant', blocks, text: assistantText(blocks),
                usage: step.usage ?? null, detail: { ...noMessageDetail, ...step.detail },
              });
              if (budgetTokens !== undefined) {
                report = step.text;
                return { kind: 'context-budget-reached', tokens: budgetTokens, report };
              }
              break;
            }
            case 'retry': {
              const attempt = step.attempt ?? 1;
              spec.onEvent({
                type: 'message', role: 'assistant', blocks: [], text: '', usage: null,
                detail: { ...noMessageDetail, stopReason: 'error', error: step.errorText },
              });
              // An executor that declares no retries retries silently.
              if (!support.retries.available) break;
              spec.onEvent({
                type: 'retry', phase: 'started', attempt,
                maxAttempts: step.maxAttempts ?? null, delayMs: step.delayMs ?? null, errorText: step.errorText,
              });
              const succeeded = step.succeeded ?? true;
              spec.onEvent({ type: 'retry', phase: 'ended', attempt, succeeded, errorText: succeeded ? null : step.errorText });
              break;
            }
            case 'context': {
              spec.onEvent({ type: 'context-observed', tokens: step.tokens, window: step.window });
              if (contextBudgetReached(spec.context, step.tokens, step.window)) budgetTokens = step.tokens;
              break;
            }
            case 'compaction':
              if (spec.context.compaction === 'forbidden') {
                record.suppressedCompactions += 1;
                break;
              }
              spec.onEvent({ type: 'compaction', phase: 'started', reason: step.reason });
              spec.onEvent({
                type: 'compaction', phase: 'ended', reason: step.reason,
                tokensBefore: step.tokensBefore ?? null, tokensAfter: step.tokensAfter ?? null,
                aborted: step.aborted === true, errorText: step.errorText ?? null,
              });
              break;
            case 'wait':
              await delay(step.ms, controller.signal);
              break;
            case 'stall':
              await delay(step.ms);
              if (step.thenIgnoreStop) deaf = true;
              break;
            case 'hang':
              await never;
              break;
            case 'fail':
              return { kind: 'failed', error: step.error };
            case 'end':
              return { kind: 'ended', message: step.message };
            case 'tool': {
              const callId = nextCallId();
              const tool = spec.tools.find(candidate => candidate.name === step.tool);
              const builtin = tool === undefined ? builtinOf.get(step.tool) : undefined;
              const writer = builtin === 'edit' || builtin === 'write' ? builtin : undefined;
              const action: ToolAction = step.action
                ?? (tool !== undefined ? tool.action?.(step.input) ?? { kind: 'harness' } : builtinAction(builtin, step.input));
              const mutating = step.mutating ?? tool?.mutating ?? writer !== undefined;
              announceCall(spec, { type: 'tool-call', callId, tool: step.tool, input: step.input, action });
              spec.onEvent({ type: 'tool-started', callId, tool: step.tool, input: step.input, action, mutating });
              if (step.reachedTool === false) {
                // The implementation rejected the input against the tool's schema; the tool never ran.
                finish(spec, record, { callId, tool: step.tool, text: `The input for ${step.tool} was rejected before the tool ran.`, isError: true }, false);
                break;
              }
              if (mutating && spec.guard) {
                const decision = await spec.guard({ callId, tool: step.tool, input: step.input, action });
                if (!decision.allow) {
                  record.denied.push(callId);
                  // A denied call executed nothing, so `afterMutation` is not called for it.
                  finish(spec, record, { callId, tool: step.tool, text: decision.text, isError: true }, true);
                  break;
                }
              }
              let text = '';
              let isError = false;
              if (tool) {
                const result = await tool.execute(step.input, controller.signal);
                text = result.text;
                isError = result.isError === true;
              } else if (builtin === undefined || !spec.builtinTools.includes(builtin)) {
                text = `Tool ${step.tool} not found`;
                isError = true;
              } else if (writer !== undefined) {
                // The write built-ins really write, as the implementation's
                // own do. A scripted repair is a repair, and a call the guard
                // allowed changes the tree the gate then checks.
                const result = await performWrite(spec.scope.workingDirectory, writer, step.tool, action, step.input);
                text = result.text;
                isError = result.isError;
              }
              if (mutating && spec.afterMutation) {
                const extra = await spec.afterMutation({ callId, tool: step.tool, action, failed: isError });
                if (extra) text = text === '' ? extra.text : `${text}\n${extra.text}`;
              }
              finish(spec, record, { callId, tool: step.tool, text, isError }, true);
              break;
            }
            case 'submit': {
              const callId = nextCallId();
              announceCall(spec, { type: 'tool-call', callId, tool: spec.submission.name, input: step.input, action: { kind: 'harness' } });
              spec.onEvent({ type: 'tool-started', callId, tool: spec.submission.name, input: step.input, action: { kind: 'harness' }, mutating: false });
              const verdict = await spec.submission.accept(step.input, controller.signal);
              record.verdicts.push(verdict);
              const text = verdict.accepted ? verdict.text ?? 'The submission was accepted.' : verdict.errors.join('\n');
              finish(spec, record, { callId, tool: spec.submission.name, text, isError: !verdict.accepted }, true);
              if (verdict.accepted) return { kind: 'submitted', input: step.input };
              if ('final' in verdict) return { kind: 'ended', message: verdict.errors.join('\n') };
              break;
            }
          }
        }
        if (controller.signal.aborted && !deaf) return { kind: 'stopped' };
        if (budgetTokens !== undefined) return { kind: 'context-budget-reached', tokens: budgetTokens, report };
        return { kind: 'ended', message: 'The script ended without a submission' };
      };

      const outcome = run().catch((error: unknown): SessionOutcome => ({
        kind: 'failed', error: error instanceof Error ? error.message : String(error),
      })).then(result => {
        record.outcome = result;
        return result;
      });

      return {
        outcome,
        start,
        get ref(): SessionRef { return record.ref; },
        settled: async () => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const bound = new Promise<'timed-out'>(resolve => { timer = setTimeout(() => resolve('timed-out'), settleMs); });
          try {
            return await Promise.race([outcome.then(() => 'settled' as const), bound]);
          } finally {
            clearTimeout(timer);
          }
        },
        stop: async () => {
          record.stopCalls++;
          controller.abort();
          await outcome;
        },
      };
    },
  };
}

/**
 * A built-in call's action, classified from the input the port's names take,
 * as an implementation classifies its own tools. An unknown tool, or a read
 * that names no path, is `other`; a write that names none has no paths.
 */
function builtinAction(builtin: BuiltinTool | WriteTool | undefined, input: unknown): ToolAction {
  const record = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const text = (key: string): string | null => (typeof record[key] === 'string' ? record[key] as string : null);
  const count = (key: string): number | null => (typeof record[key] === 'number' ? record[key] as number : null);
  const path = text('path');
  switch (builtin) {
    case 'read': {
      if (path === null) return { kind: 'other' };
      const range = { start: count('offset'), count: count('limit') };
      return { kind: 'read', path, range: range.start === null && range.count === null ? null : range };
    }
    case 'grep':
    case 'find':
      return { kind: 'search', pattern: text('pattern'), path, glob: text('glob') };
    case 'ls':
      return { kind: 'search', pattern: null, path, glob: null };
    case 'edit':
    case 'write':
      return { kind: 'write', paths: path === null ? [] : [path] };
    default:
      return { kind: 'other' };
  }
}

/**
 * The write built-ins, as the implementation provides them: `write` replaces
 * a file's contents, creating the directories it needs, and `edit` replaces
 * text that is there. The target is the one path the action names. A call
 * that cannot be carried out fails like any other tool, so the
 * after-mutation hook still sees it.
 */
async function performWrite(
  workingDirectory: string,
  writer: WriteTool,
  tool: string,
  action: ToolAction,
  input: unknown,
): Promise<{ text: string; isError: boolean }> {
  const record = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const requested = action.kind === 'write' && action.paths.length === 1 ? action.paths[0]! : '';
  if (requested === '') return { text: `${tool} needs a path`, isError: true };
  const path = isAbsolute(requested) ? requested : resolve(workingDirectory, requested);
  try {
    if (writer === 'write') {
      const content = typeof record['content'] === 'string' ? record['content'] : '';
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
      return { text: `Wrote ${requested}.`, isError: false };
    }
    const edits = Array.isArray(record['edits']) ? (record['edits'] as Array<Record<string, unknown>>) : [];
    if (edits.length === 0) return { text: 'edit needs at least one edit', isError: true };
    let content = await readFile(path, 'utf8');
    for (const edit of edits) {
      const oldText = typeof edit['oldText'] === 'string' ? edit['oldText'] : '';
      const newText = typeof edit['newText'] === 'string' ? edit['newText'] : '';
      if (oldText === '' || !content.includes(oldText)) {
        return { text: `edit found no occurrence of the text it replaces in ${requested}`, isError: true };
      }
      content = content.replace(oldText, newText);
    }
    await writeFile(path, content);
    return { text: `Edited ${requested}.`, isError: false };
  } catch (error) {
    return { text: `${tool} failed on ${requested}: ${error instanceof Error ? error.message : String(error)}`, isError: true };
  }
}

/** Reports the assistant message that makes one call, before the call starts. Its detail is absent. */
function announceCall(spec: SessionSpec, call: ToolCallBlock): void {
  spec.onEvent({ type: 'message', role: 'assistant', blocks: [call], text: assistantText([call]), usage: null, detail: noMessageDetail });
}

/** Reports one tool result: the port event, then the tool-result message, and what the agent saw. */
function finish(spec: SessionSpec, record: ScriptedSessionRecord, result: ScriptedToolResult, reachedTool: boolean): void {
  record.results.push(result);
  spec.onEvent({
    type: 'tool-finished', callId: result.callId, tool: result.tool,
    isError: result.isError, errorText: result.isError ? result.text : undefined, reachedTool,
  });
  spec.onEvent({
    type: 'message', role: 'tool-result', callId: result.callId, tool: result.tool, isError: result.isError,
    blocks: result.text === '' ? [] : [{ type: 'text', text: result.text }],
  });
}

/**
 * Resolves the session a spec starts from. A `continue` or `fork` whose ref
 * names a session the fake has never seen degrades to `fresh` and says so.
 */
function beginSession(
  spec: SessionSpec,
  histories: Map<string, Array<{ readonly key: string; readonly text: string }>>,
  fresh: () => string,
  support: ExecutorSupport,
): { readonly id: string; readonly start: ActualStart; readonly inherited: readonly string[] } {
  const start = spec.session;
  // A start the fake declares it lacks degrades with the reason it declared.
  const declared = start.mode === 'fresh' ? undefined : support[start.mode];
  if (declared !== undefined && !declared.available) return degrade(histories, fresh, declared.reason);
  if (start.mode === 'continue') {
    const id = sessionOf(start.ref);
    const history = id === undefined ? undefined : histories.get(id);
    if (id !== undefined && history !== undefined) {
      return { id, start: { mode: 'continue' }, inherited: history.map(entry => entry.text) };
    }
    return degrade(histories, fresh, `The session named by ${start.ref} is not known to the scripted agent.`);
  }
  if (start.mode === 'fork') {
    const id = sessionOf(start.from);
    const history = id === undefined ? undefined : histories.get(id);
    if (id !== undefined && history !== undefined) {
      const forked = fresh();
      const taken = history.slice(0, pointOf(start.from, history.length));
      histories.set(forked, [...taken]);
      return { id: forked, start: { mode: 'fork' }, inherited: taken.map(entry => entry.text) };
    }
    return degrade(histories, fresh, `The session named by ${start.from} is not known to the scripted agent.`);
  }
  const id = fresh();
  histories.set(id, []);
  return { id, start: { mode: 'fresh' }, inherited: [] };
}

function degrade(
  histories: Map<string, Array<{ readonly key: string; readonly text: string }>>,
  fresh: () => string,
  reason: string,
): { readonly id: string; readonly start: ActualStart; readonly inherited: readonly string[] } {
  const id = fresh();
  histories.set(id, []);
  return { id, start: { mode: 'fresh', degradedReason: reason }, inherited: [] };
}

/** The scripted ref is `<session>@<steps>#<entries>`. */
function sessionOf(ref: SessionRef): string | undefined {
  const id = ref.split('@')[0];
  return id === undefined || id === '' ? undefined : id;
}

function pointOf(ref: SessionRef, fallback = 0): number {
  const after = ref.split('#')[1];
  const parsed = after === undefined ? Number.NaN : Number.parseInt(after, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
  });
}
