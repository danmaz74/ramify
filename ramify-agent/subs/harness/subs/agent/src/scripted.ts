import { createSessionOperations } from './session-operations.js';
import type { AgentSessionPoint, SessionDriverInvocation, SessionExecutionBindings, SessionOperationDriver, SessionOperations, SessionStore, SessionToolDeclaration } from './interfaces/session-operations.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { assistantText, contextBudgetReached, noMessageDetail } from './interfaces/port.js';
import type {
  ActualStart,
  AgentPort,
  AgentEvent,
  AssistantBlock,
  AgentSession,
  AppendOutcome,
  BuiltinTool,
  ExecutorSupport,
  MessageDetail,
  SessionOutcome,
  SessionRef,
  SessionSpec,
  SessionStart,
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
  /** Waits until `until` settles, ending early on Stop: a script its test paces, one step at a time. */
  | { readonly kind: 'await'; readonly until: () => Promise<unknown> }
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
  readonly sessionOperations: SessionOperations | null;
  bindSessionStore(sessionStore: SessionStore): SessionOperations;
  readonly sessions: readonly ScriptedSessionRecord[];
  /** Explicit scripted loss of a structured session; never a replacement fresh strategy. */
  loseSession(point: AgentSessionPoint): boolean;

}

export interface ScriptedAgentOptions {
  readonly sessionStore?: SessionStore | undefined;
  readonly operationScript?: SessionScript | undefined;
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
  const lost = new Set<string>();
  return {
    name: 'scripted',
    support: { ...scriptedSupport, ...options.support },
    sessions,
    loseSession(point) { if (!point || typeof point.sessionId !== 'string') throw new Error('A structured session point is required'); const fresh = !lost.has(point.sessionId); lost.add(point.sessionId); return fresh; },
    bindSessionStore: store => createScriptedOperations(store, script, options, sessions, lost),
    sessionOperations: options.sessionStore ? createScriptedOperations(options.sessionStore, script, options, sessions, lost) : null,
  };
}

/** One private script actor. All history and restoration belong to SessionOperations. */
function createScriptActor(script: Script, options: ScriptedAgentOptions) {
  const sessions: ScriptedSessionRecord[] = [];
  const settleMs = options.settleMs ?? 30_000;
  const support: ExecutorSupport = { ...scriptedSupport, ...options.support };
  /** The port's built-in each of the fake's own tool names stands for. */
  const builtinOf = new Map(portTools.map(tool => [options.toolNames?.[tool] ?? tool, tool]));
  return {
    sessions,
    execute(spec: SessionSpec): AgentSession {
      const start: ActualStart = { mode: 'fresh' };
      const inherited: readonly string[] = [];
      let stepsRun = 0;
      const record: ScriptedSessionRecord = {
        spec, verdicts: [], start, inherited, results: [], denied: [],
        suppressedCompactions: 0, refusedAfterBudget: 0, stopCalls: 0, ref: '',
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
            case 'await':
              await settledOrAborted(step.until(), controller.signal);
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

/** Settles when `pending` does, or on abort, whichever is first; a rejection counts as settling. */
function settledOrAborted(pending: Promise<unknown>, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve();
    const done = () => {
      signal.removeEventListener('abort', done);
      resolve();
    };
    signal.addEventListener('abort', done, { once: true });
    pending.then(done, done);
  });
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

/** Explicit scripts for the durable lifecycle; no implicit external answers or legacy session lookup. */
export type SessionScriptStep =
  | { readonly kind: 'tool'; readonly tool: string; readonly input: unknown; readonly callId?: string }
  | { readonly kind: 'submit'; readonly input: unknown; readonly callId?: string }
  | { readonly kind: 'message'; readonly payload: Readonly<Record<string, unknown>> }
  | { readonly kind: 'await'; readonly until: () => Promise<unknown> }
  | { readonly kind: 'fail'; readonly error: string }
  | { readonly kind: 'end'; readonly message?: string };
export type SessionScript = readonly SessionScriptStep[] | ((input: SessionDriverInvocation) => readonly SessionScriptStep[]);
export function createScriptedSessionDriver(script: SessionScript): SessionOperationDriver {
  return {
    async dispatch(input, runtime) {
      const steps = typeof script === 'function' ? script(input) : script;
      runtime.onEvent({ type: 'message', role: 'user', blocks: [{ type: 'text', text: input.task.message }] });
      for (let index = 0; index < steps.length; index += 1) {
        if (runtime.signal.aborted) return { kind: 'stopped' };
        const step = steps[index]!;
        const key = `${input.key.operationId}:step:${index}`;
        if (step.kind === 'await') { await settledOrAborted(step.until(), runtime.signal); continue; }
        if (step.kind === 'fail') return { kind: 'failed', error: step.error };
        if (step.kind === 'end') return step.message === undefined ? { kind: 'ended' } : { kind: 'ended', message: step.message };
        await runtime.persistPayload(key, new TextEncoder().encode(JSON.stringify(step)));
        if (step.kind === 'message') {
          const text = typeof step.payload['text'] === 'string' ? step.payload['text'] : '';
          runtime.onEvent({ type: 'message', role: 'assistant', blocks: text === '' ? [] : [{ type: 'text', text }], text, usage: null, detail: noMessageDetail });
          continue;
        }
        const callId = step.callId ?? key;
        const tool = step.kind === 'tool' ? step.tool : input.task.submissionTool;
        const description = runtime.describeTool(tool, step.input);
        const call: ToolCallBlock = { type: 'tool-call', callId, tool, input: step.input, action: description.action };
        runtime.onEvent({ type: 'message', role: 'assistant', blocks: [call], text: assistantText([call]), usage: null, detail: noMessageDetail });
        runtime.onEvent({ type: 'tool-started', callId, tool, input: step.input, ...description });
        const finish = (text: string, isError: boolean) => {
          runtime.onEvent({ type: 'tool-finished', callId, tool, isError, reachedTool: input.session.activeTools.includes(tool), errorText: isError ? text : undefined });
          runtime.onEvent({ type: 'message', role: 'tool-result', callId, tool, isError, blocks: text === '' ? [] : [{ type: 'text', text }] });
        };
        if (step.kind === 'tool') {
          const answer = await runtime.callTool(callId, step.tool, step.input);
          await runtime.persistPayload(`${key}:result`, new TextEncoder().encode(JSON.stringify(answer)));
          finish(answer.text, answer.isError ?? false);
        } else {
          const verdict = await runtime.submit(callId, step.input);
          await runtime.persistPayload(`${key}:result`, new TextEncoder().encode(JSON.stringify(verdict)));
          finish(verdict.accepted ? verdict.text ?? 'The submission was accepted.' : verdict.errors.join('\n'), !verdict.accepted);
          if (verdict.accepted) return { kind: 'submitted', input: step.input };
          if ('final' in verdict) return { kind: 'ended' };
        }
      }
      return { kind: 'ended' };
    },
  };
}

/** Reuses existing Script declarations; durable session history remains solely in the new store. */
function createScriptDeclarationDriver(script: Script, options: ScriptedAgentOptions, observations: ScriptedSessionRecord[]): SessionOperationDriver {
  return {
    async dispatch(input, runtime) {
      await runtime.assertLive();
      // This private actor executes one script, without reading or writing any old session.
      const diagnosticMode = input.session.currentPoint.turn === 0 && input.session.parent === null ? 'fresh'
        : input.session.parent !== null && input.session.currentPoint.turn === input.session.parent.turn ? 'fork' : 'continue';
      const diagnosticRef = JSON.stringify(input.session.currentPoint);
      const diagnosticStart: SessionStart = diagnosticMode === 'fresh' ? { mode: 'fresh' }
        : diagnosticMode === 'fork' ? { mode: 'fork', from: JSON.stringify(input.session.parent) } : { mode: 'continue', ref: diagnosticRef };
      const diagnostic = (spec: SessionSpec): SessionSpec => ({ ...spec, session: diagnosticStart });
      const inheritedMessages: string[] = [];
      const payloadKeys = new Map<string, string>();
      for (const entry of input.session.transcript) {
        if (entry.kind !== 'provider') continue;
        if (!/^.+:event:\d+$/u.test(entry.key)) throw new Error('Unknown scripted provider event ancestry');
        const previous = payloadKeys.get(entry.key);
        if (previous !== undefined) { if (previous !== entry.payloadId) throw new Error('Conflicting scripted provider event ancestry'); continue; }
        payloadKeys.set(entry.key, entry.payloadId);
        const bytes = await runtime.readPayload(entry.payloadId);
        const event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Partial<AgentEvent>;
        if (event === null || typeof event !== 'object' || typeof event.type !== 'string') throw new Error('Corrupt scripted provider event ancestry');
        if (event.type !== 'message' || event.role !== 'user') continue;
        if (!Array.isArray(event.blocks) || event.blocks.some(block => block.type !== 'text' || typeof block.text !== 'string')) throw new Error('Corrupt scripted user event ancestry');
        // Retry may already contain this operation's current packet; it is supplied once below.
        if (!entry.key.startsWith(`${input.key.operationId}:event:`)) inheritedMessages.push(event.blocks.map(block => block.type === 'text' ? block.text : '').join('\n'));
      }
      const inherited = [...inheritedMessages, ...input.session.additions.map(addition => addition.text)];
      // Only script perception receives its already visible context. Actual records and emitted packets remain current-only.
      const actor = createScriptActor(typeof script === 'function' ? spec => script({ ...diagnostic(spec), prompt: [...inherited, spec.prompt].join('\n\n') }) : script, { ...options, sessionStore: undefined });
      let eventIndex = 0;
      let events: Promise<unknown> = Promise.resolve();
      let eventError: unknown;
      const flush = async () => { await events; if (eventError !== undefined) throw eventError; };
      const scopedCall = (callId: string) => `${input.key.operationId}:${callId}`;
      const declarations = input.session.declarations;
      const submission = declarations.find(item => item.name === input.task.submissionTool)!;
      let activeCallId: string | null = null;
      const spec: SessionSpec = {
        role: input.task.role, scope: { workingDirectory: input.task.environment.workingDirectory },
        systemPrompt: input.session.initialInstructions, prompt: input.task.message,
        session: { mode: 'fresh' }, context: input.session.policy.context,
        builtinTools: [],
        tools: declarations.filter(item => item.name !== submission.name).map(declaration => ({
          ...declaration,
          action: value => runtime.describeTool(declaration.name, value).action,
          async execute(value) { const callId = activeCallId; await flush(); if (callId === null) throw new Error('Scripted tool has no observed call identity'); return runtime.callTool(callId, declaration.name, value); },
        })),
        submission: { ...submission, async accept(value) { const callId = activeCallId; await flush(); if (callId === null) throw new Error('Scripted submission has no observed call identity'); return runtime.submit(callId, value); } },
        onEvent(event) {
          if (event.type === 'tool-started') activeCallId = scopedCall(event.callId);
          const observed = { ...event, ...('callId' in event && typeof event.callId === 'string' ? { callId: scopedCall(event.callId) } : {}),
            ...('blocks' in event ? { blocks: event.blocks.map(block => block.type === 'tool-call' ? { ...block, callId: scopedCall(block.callId) } : block) } : {}) } as AgentEvent;
          const index = eventIndex++;
          events = events.then(async () => {
            await runtime.persistPayload(`${input.key.operationId}:event:${index}`, new TextEncoder().encode(JSON.stringify(observed)));
            runtime.onEvent(observed);
          }).catch(error => { eventError ??= error; });
        },
      };
      const session = actor.execute(spec);
      for (const record of actor.sessions) {
        Object.defineProperty(record, 'spec', { value: diagnostic(record.spec) });
        Object.defineProperty(record, 'start', { value: { mode: diagnosticMode } });
        Object.defineProperty(record, 'inherited', { value: inherited });
        record.ref = diagnosticRef;
        observations.push(record);
      }
      const stop = () => { void session.stop(); };
      runtime.signal.addEventListener('abort', stop, { once: true });
      try { const result = await session.outcome; await flush(); return result; }
      finally { runtime.signal.removeEventListener('abort', stop); }
    },
  };
}

/** Provider built-ins are bound here, never by a harness-side transcript decoder. */
function createScriptedOperations(ownedStore: SessionStore, script: Script, options: ScriptedAgentOptions, observations: ScriptedSessionRecord[], lost: ReadonlySet<string>): SessionOperations {
  const sessionStore: SessionStore = { async read(runId, id) { return id.startsWith('session:') && lost.has(id.slice(8)) ? null : ownedStore.read(runId, id); }, putPayload: bytes => ownedStore.putPayload(bytes), getPayload: id => ownedStore.getPayload(id), commit: input => ownedStore.commit(input) };
  const operations = createSessionOperations({ sessionStore, driver: options.operationScript ? createScriptedSessionDriver(options.operationScript) : createScriptDeclarationDriver(script, options, observations) });
  function enrich(bindings: SessionExecutionBindings, declarations: readonly SessionToolDeclaration[]): SessionExecutionBindings {
    const tools = [...bindings.tools];
    for (const declaration of declarations) {
      if (tools.some(item => item.name === declaration.name)) continue;
      const builtin = portTools.find(name => (options.toolNames?.[name] ?? name) === declaration.name);
      if (!builtin) continue;
      tools.push({ ...declaration, action: input => builtinAction(builtin, input), async execute(input) {
        const action = builtinAction(builtin, input);
        if (builtin === 'write' || builtin === 'edit') return performWrite(bindings.task.environment.workingDirectory, builtin, declaration.name, action, input);
        // As in the existing Script fake, reads/searches are explicitly scripted observations.
        return { text: '', isError: false };
      } });
    }
    return { ...bindings, tools };
  }
  return {
    ...operations,
    async continue(input) {
      const snapshot = await operations.inspect(input.runId, input.sessionId);
      return operations.continue({ ...input, bindings: enrich(input.bindings, [...(snapshot?.declarations ?? []), ...input.toolChange.add]) });
    },
    async retry(input) {
      const operation = await sessionStore.read(input.runId, `operation:${input.operationId}`);
      const snapshot = operation?.body['snapshot'] as { declarations?: readonly SessionToolDeclaration[] } | undefined;
      return operations.retry({ ...input, bindings: enrich(input.bindings, snapshot?.declarations ?? []) });
    },
  };
}
