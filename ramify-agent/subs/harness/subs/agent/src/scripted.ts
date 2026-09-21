import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { contextBudgetReached } from './interfaces/port.js';
import type {
  ActualStart,
  AgentPort,
  AgentSession,
  AppendOutcome,
  PortObservations,
  SessionOutcome,
  SessionRef,
  SessionSpec,
  TokenUsage,
} from './interfaces/port.js';

/**
 * One step of a scripted session. The fake runs the steps in order and
 * checks for Stop before each one.
 */
export type ScriptStep =
  /**
   * Calls a tool: a harness tool runs for real; a built-in one only reports
   * its call. `mutating` overrides what the tool declares, so a script can
   * exercise the guard over any name; `edit` and `write` are mutating by
   * default. `reachedTool: false` is a call the implementation itself
   * rejected before the tool ran.
   */
  | {
      readonly kind: 'tool'; readonly tool: string; readonly input: unknown;
      readonly mutating?: boolean | undefined; readonly reachedTool?: boolean | undefined;
    }
  | { readonly kind: 'message'; readonly text: string; readonly usage?: TokenUsage | undefined }
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
}

const never = new Promise<never>(() => undefined);

const writeTools = new Set(['edit', 'write']);

/** What the fake observes; it emits all three, so the core's tests never depend on pi. */
const scriptedObservations: PortObservations = {
  usage: { available: true },
  context: { available: true },
  compaction: { available: true },
};

/**
 * The scripted fake: an agent that replays a script of events, tool calls
 * and submissions, including failures and hangs. It is the port's second
 * implementation and the one the harness's tests run against. A function
 * script is given the session's spec, so it can use the prompt or scope.
 *
 * It implements every port behavior the real implementation does: session
 * modes, appended context, the guard and the after-mutation hook, usage,
 * context observations, compaction under its policy, settlement and the
 * context budget.
 */
export function createScriptedAgent(script: Script, options: ScriptedAgentOptions = {}): ScriptedAgent {
  const sessions: ScriptedSessionRecord[] = [];
  const settleMs = options.settleMs ?? 30_000;
  /** Appended context per scripted session, which a continue inherits and a fork inherits up to its point. */
  const histories = new Map<string, Array<{ readonly key: string; readonly text: string }>>();
  let sessionCount = 0;

  const refOf = (id: string, steps: number): SessionRef => `${id}@${steps}#${histories.get(id)?.length ?? 0}`;

  return {
    name: 'scripted',
    observations: scriptedObservations,
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
      const { id, start, inherited } = beginSession(spec, histories, () => `scripted-${++sessionCount}`);
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
            case 'message':
              spec.onEvent({ type: 'message', text: step.text, usage: step.usage });
              if (budgetTokens !== undefined) {
                report = step.text;
                return { kind: 'context-budget-reached', tokens: budgetTokens, report };
              }
              break;
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
                tokensBefore: step.tokensBefore, tokensAfter: step.tokensAfter,
                aborted: step.aborted, errorText: step.errorText,
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
              const mutating = step.mutating ?? tool?.mutating ?? writeTools.has(step.tool);
              spec.onEvent({ type: 'tool-started', callId, tool: step.tool, input: step.input, mutating });
              if (step.reachedTool === false) {
                // The implementation rejected the input against the tool's schema; the tool never ran.
                finish(spec, record, { callId, tool: step.tool, text: `The input for ${step.tool} was rejected before the tool ran.`, isError: true }, false);
                break;
              }
              if (mutating && spec.guard) {
                const decision = await spec.guard({ callId, tool: step.tool, input: step.input });
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
              } else if (!(spec.builtinTools as readonly string[]).includes(step.tool)) {
                text = `Tool ${step.tool} not found`;
                isError = true;
              } else if (writeTools.has(step.tool)) {
                // The write built-ins really write, as the implementation's
                // own do. A scripted repair is a repair, and a call the guard
                // allowed changes the tree the gate then checks.
                const result = await performWrite(spec.scope.workingDirectory, step.tool, step.input);
                text = result.text;
                isError = result.isError;
              }
              if (mutating && spec.afterMutation) {
                const extra = await spec.afterMutation({ callId, tool: step.tool, failed: isError });
                if (extra) text = text === '' ? extra.text : `${text}\n${extra.text}`;
              }
              finish(spec, record, { callId, tool: step.tool, text, isError }, true);
              break;
            }
            case 'submit': {
              const callId = nextCallId();
              spec.onEvent({ type: 'tool-started', callId, tool: spec.submission.name, input: step.input, mutating: false });
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
 * The write built-ins, as the implementation provides them: `write` replaces
 * a file's contents, creating the directories it needs, and `edit` replaces
 * text that is there. A call that cannot be carried out fails like any other
 * tool, so the after-mutation hook still sees it.
 */
async function performWrite(workingDirectory: string, tool: string, input: unknown): Promise<{ text: string; isError: boolean }> {
  const record = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const requested = typeof record['path'] === 'string' ? record['path'] : '';
  if (requested === '') return { text: `${tool} needs a path`, isError: true };
  const path = isAbsolute(requested) ? requested : resolve(workingDirectory, requested);
  try {
    if (tool === 'write') {
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

/** Reports one tool result, both as the port event and as what the agent saw. */
function finish(spec: SessionSpec, record: ScriptedSessionRecord, result: ScriptedToolResult, reachedTool: boolean): void {
  record.results.push(result);
  spec.onEvent({
    type: 'tool-finished', callId: result.callId, tool: result.tool,
    isError: result.isError, errorText: result.isError ? result.text : undefined, reachedTool,
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
): { readonly id: string; readonly start: ActualStart; readonly inherited: readonly string[] } {
  const start = spec.session;
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
