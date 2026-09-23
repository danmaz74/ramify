import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  ModelRuntime,
  resolveCliModel,
  SessionManager,
  SettingsManager,
  type AgentSession as PiSession,
  type AgentSessionEvent,
  type SessionEntry,
  type ToolResultEvent,
} from '@earendil-works/pi-coding-agent';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { contextBudgetReached } from '../../../src/interfaces/port.js';
import type {
  ActualStart,
  AgentEvent,
  AgentPort,
  AgentSession,
  AppendOutcome,
  ExecutorSupport,
  JsonSchema,
  SessionOutcome,
  SessionRef,
  SessionSpec,
  SubmissionTool,
  TokenUsage,
  ToolAction,
  ToolDefinition,
} from '../../../src/interfaces/port.js';

/*
 * The agent port on pi (@earendil-works/pi-coding-agent), in this process.
 *
 * - The system prompt is exactly the spec's: an inline extension replaces
 *   pi's assembled prompt before every agent turn, and pi's discovery of
 *   context files, extensions, skills, prompt templates and themes is off.
 * - The tools are the spec's built-ins plus its own tools and the submission
 *   tool. The submission tool is given to pi with a permissive schema, so
 *   that every call reaches the harness's `accept` and counts toward its
 *   correction bound; the full schema is in the tool's description.
 * - Stop aborts the session; pi's abort is cooperative, so the harness
 *   bounds the wait and discards what the session produces afterwards.
 * - The session's mode, its context policy, the write guard and the
 *   after-mutation hook are all port policy here. None of them is prompt
 *   text, and pi's session files, SDK objects and login stay behind this
 *   module.
 */

/** pi's only mutating built-ins once the shell is withheld. */
const mutatingBuiltins = new Set<string>(['edit', 'write']);

/** The custom-message type every appended brief carries, so a repeat is recognized. */
const briefType = 'ramify-brief';

/**
 * What this adapter supports: everything the port declares. The limitations
 * of its observations are in the values, not in their absence: the context
 * size is always an estimate and is null after a compaction until the next
 * assistant reply. A fork branches at the entry its ref names, so it forks
 * at any point.
 */
const piSupport: ExecutorSupport = {
  usage: { available: true },
  context: { available: true },
  compaction: { available: true },
  continue: { available: true },
  fork: { available: true },
  forkAtPoint: { available: true },
  appendContext: { available: true },
  exactSystemPrompt: { available: true },
  guard: { available: true },
  afterMutation: { available: true },
};

type PiToolDefinition = Parameters<typeof defineTool>[0];
/** What a `tool_result` handler may replace. pi does not export the type. */
type PiToolResult = { content?: ToolResultEvent['content']; isError?: boolean };
type PiModel = NonNullable<ReturnType<ModelRuntime['getModel']>>;
type PiThinkingLevel = NonNullable<ReturnType<typeof resolveCliModel>['thinkingLevel']>;
/** A model with the thinking level a `provider/model:level` request named, if it named one. */
interface ChosenModel { readonly model: PiModel; readonly thinkingLevel: PiThinkingLevel | undefined }

export interface PiAgentOptions {
  /**
   * The model as pi's `--model` accepts it, such as `anthropic/claude-opus-4-5`,
   * optionally with a thinking level, such as `openai-codex/gpt-5.6-sol:high`.
   * Default: the first model pi has credentials for, at pi's default level.
   */
  readonly model?: string | undefined;
  /** pi's agent directory, which holds its credentials (`auth.json`) and model settings. Default: pi's own, `~/.pi/agent` or `PI_CODING_AGENT_DIR`. */
  readonly agentDirectory?: string | undefined;
  /** How long `settled()` waits for pi to report itself idle before answering `timed-out`. */
  readonly settleMs?: number | undefined;
  /**
   * pi's own compaction thresholds. They govern when pi compacts a session
   * whose policy allows it, and they are not the context policy's
   * `reportReserveTokens`, which is room for a role's final report. Default:
   * pi's own.
   */
  readonly compaction?: { readonly reserveTokens?: number | undefined; readonly keepRecentTokens?: number | undefined } | undefined;
}

/** How this adapter reaches pi's models; tests supply a runtime with a scripted provider. */
export interface PiRuntimeSource {
  readonly agentDirectory: string;
  readonly model?: string | undefined;
  readonly settleMs?: number | undefined;
  readonly compaction?: PiAgentOptions['compaction'];
  runtime(): Promise<ModelRuntime>;
}

/** The pi agent: each session is a fresh pi session in this process. */
export function createPiAgent(options: PiAgentOptions = {}): AgentPort {
  const agentDirectory = options.agentDirectory ?? getAgentDir();
  let runtime: Promise<ModelRuntime> | undefined;
  return createPiAgentOn({
    agentDirectory,
    model: options.model,
    settleMs: options.settleMs,
    compaction: options.compaction,
    runtime: () => {
      runtime ??= ModelRuntime.create({ authPath: join(agentDirectory, 'auth.json'), modelsPath: join(agentDirectory, 'models.json') });
      runtime.catch(() => { runtime = undefined; });
      return runtime;
    },
  });
}

/** Whether pi can run a session: a model it has credentials for, or why not. */
export async function piReadiness(options: PiAgentOptions = {}): Promise<{ readonly ready: true; readonly model: string } | { readonly ready: false; readonly reason: string }> {
  const agentDirectory = options.agentDirectory ?? getAgentDir();
  try {
    const runtime = await ModelRuntime.create({ authPath: join(agentDirectory, 'auth.json'), modelsPath: join(agentDirectory, 'models.json') });
    const { model, thinkingLevel } = await chooseModel(runtime, options.model);
    return { ready: true, model: `${model.provider}/${model.id}${thinkingLevel === undefined ? '' : `:${thinkingLevel}`}` };
  } catch (error) {
    return { ready: false, reason: message(error) };
  }
}

/** The adapter over a given source of models. Exported for this module's tests. */
export function createPiAgentOn(source: PiRuntimeSource): AgentPort {
  /**
   * The sessions this adapter is holding, by session file. An append reaches
   * a live session's next model input only through `sendCustomMessage`;
   * `appendCustomMessageEntry` reaches the file but not that session's
   * in-memory state, so the route depends on whether the session is held.
   */
  const live = new Map<string, PiSession>();
  return {
    name: 'pi',
    support: piSupport,
    startSession: spec => startPiSession(spec, source, live),
    appendContext: (ref, key, text) => appendPiContext(live, ref, key, text),
  };
}

/** A ref names a session file and an entry within it. */
function refOf(sessionFile: string | undefined, entryId: string | null): SessionRef {
  return `${sessionFile ?? ''}#${entryId ?? ''}`;
}

function splitRef(ref: SessionRef): { readonly file: string; readonly entryId: string } {
  const marker = ref.lastIndexOf('#');
  return marker === -1 ? { file: ref, entryId: '' } : { file: ref.slice(0, marker), entryId: ref.slice(marker + 1) };
}

/** Whether a brief with this key is already in the session. */
function alreadyAppended(entries: readonly SessionEntry[], key: string): boolean {
  return entries.some(entry => entry.type === 'custom_message'
    && entry.customType === briefType
    && (entry.details as { key?: unknown } | undefined)?.key === key);
}

/**
 * Stores text in a session without a model call. A session this adapter
 * holds receives it through `sendCustomMessage(..., { triggerTurn: false })`,
 * which reaches that session's next model input; one it does not hold
 * receives it as a custom message entry on the file.
 */
async function appendPiContext(live: Map<string, PiSession>, ref: SessionRef, key: string, text: string): Promise<AppendOutcome> {
  const { file } = splitRef(ref);
  if (file === '' || !existsSync(file)) return { outcome: 'session-lost' };
  const held = live.get(file);
  try {
    if (held !== undefined) {
      const manager = held.sessionManager;
      if (alreadyAppended(manager.getEntries(), key)) {
        return { outcome: 'already-present', ref: refOf(manager.getSessionFile(), manager.getLeafId()) };
      }
      await held.sendCustomMessage({ customType: briefType, content: text, display: false, details: { key } }, { triggerTurn: false });
      return { outcome: 'appended', ref: refOf(manager.getSessionFile(), manager.getLeafId()) };
    }
    const manager = SessionManager.open(file, dirname(file));
    if (alreadyAppended(manager.getEntries(), key)) {
      return { outcome: 'already-present', ref: refOf(manager.getSessionFile(), manager.getLeafId()) };
    }
    manager.appendCustomMessageEntry(briefType, text, false, { key });
    return { outcome: 'appended', ref: refOf(manager.getSessionFile(), manager.getLeafId()) };
  } catch {
    return { outcome: 'session-lost' };
  }
}

/**
 * The session manager the spec's mode asks for, and the mode that was
 * actual. A `continue` whose file is gone, or a `fork` whose point cannot be
 * branched, degrades to a fresh session and says why, so that a fork which
 * silently became fresh cannot be mistaken for one.
 */
function openSessionManager(spec: SessionSpec): { readonly manager: SessionManager; readonly start: ActualStart } {
  const fresh = (degradedReason?: string): { manager: SessionManager; start: ActualStart } => ({
    manager: SessionManager.create(spec.scope.workingDirectory, spec.sessionDirectory),
    start: degradedReason === undefined ? { mode: 'fresh' } : { mode: 'fresh', degradedReason },
  });
  const start = spec.session;
  if (start.mode === 'continue') {
    const { file } = splitRef(start.ref);
    if (file === '' || !existsSync(file)) return fresh(`The session named by "${start.ref}" no longer exists.`);
    try {
      return { manager: SessionManager.open(file, spec.sessionDirectory), start: { mode: 'continue' } };
    } catch (error) {
      return fresh(`The session named by "${start.ref}" could not be opened: ${message(error)}`);
    }
  }
  if (start.mode === 'fork') {
    const { file, entryId } = splitRef(start.from);
    if (file === '' || entryId === '' || !existsSync(file)) return fresh(`The point named by "${start.from}" no longer exists.`);
    try {
      // The fork is a new file holding root to that entry; the parent is untouched.
      const branched = SessionManager.open(file, spec.sessionDirectory).createBranchedSession(entryId);
      if (branched === undefined) return fresh(`pi could not branch "${start.from}".`);
      return { manager: SessionManager.open(branched, spec.sessionDirectory), start: { mode: 'fork' } };
    } catch (error) {
      return fresh(`pi could not branch "${start.from}": ${message(error)}`);
    }
  }
  return fresh();
}

/**
 * pi's resolver parses a `:level` suffix but does not apply it; the level is
 * returned beside the model so the session can be started with it. Dropping
 * it would run the model at pi's default level while the request named another.
 */
async function chooseModel(runtime: ModelRuntime, requested: string | undefined): Promise<ChosenModel> {
  if (requested !== undefined) {
    const resolved = resolveCliModel({ cliModel: requested, modelRuntime: runtime });
    if (resolved.error !== undefined || resolved.model === undefined) throw new Error(resolved.error ?? `pi does not know the model "${requested}"`);
    if ((await runtime.getAvailable(resolved.model.provider)).length === 0) {
      throw new Error(`pi has no credentials for ${resolved.model.provider}. Log in with \`npx pi\` and /login first.`);
    }
    return { model: resolved.model, thinkingLevel: resolved.thinkingLevel };
  }
  const available = await runtime.getAvailable();
  const model = available[0];
  if (!model) throw new Error('pi has no model with credentials. Log in with `npx pi` and /login, or pass a model.');
  return { model, thinkingLevel: undefined };
}

function startPiSession(spec: SessionSpec, source: PiRuntimeSource, live: Map<string, PiSession>): AgentSession {
  let stopped = false;
  let pi: PiSession | undefined;
  let accepted: { readonly input: unknown } | undefined;
  let finalErrors: readonly string[] | undefined;
  /** Set once an observation reaches the budget; the tools are removed and one final response is allowed. */
  let budget: { readonly tokens: number | null } | undefined;
  /** Submission calls the harness rejected; their results are errors to the model. */
  const rejectedCalls = new Set<string>();
  /** Calls pi's own validation let through: `tool_call` fires only for those. */
  const validated = new Set<string>();
  /** Calls the guard denied; they executed nothing, so `afterMutation` is not called for them. */
  const denied = new Set<string>();
  const mutatingTools = new Set<string>([
    ...spec.builtinTools.filter(tool => mutatingBuiltins.has(tool)),
    ...spec.tools.filter(tool => tool.mutating === true).map(tool => tool.name),
  ]);
  const harnessTools = new Map(spec.tools.map(tool => [tool.name, tool]));
  /** What one call does: a harness tool's declared action, or pi's own tool classified. */
  const actionOf = (tool: string, input: unknown): ToolAction => {
    if (tool === spec.submission.name) return { kind: 'harness' };
    const harness = harnessTools.get(tool);
    if (harness !== undefined) return harness.action?.(input) ?? { kind: 'harness' };
    return builtinAction(tool, input);
  };

  // The session manager is resolved before anything runs, so `ref` and the
  // mode that was actual are readable from the moment the session starts.
  const { manager, start } = openSessionManager(spec);
  const sessionFile = manager.getSessionFile();

  const emit = (event: AgentEvent) => {
    if (stopped) return;
    try {
      spec.onEvent(event);
    } catch {
      // The port requires onEvent not to throw; a fault there must not end the session.
    }
  };

  /**
   * The context after a model or tool boundary. pi's figure is always an
   * estimate and is null after a compaction until the next assistant reply;
   * a session with no figure at all emits nothing, which the harness records
   * as a coverage gap rather than as room.
   */
  const observeContext = (): void => {
    const session = pi;
    if (session === undefined) return;
    const usage = session.getContextUsage();
    if (usage === undefined) return;
    emit({ type: 'context-observed', tokens: usage.tokens, window: usage.contextWindow });
    if (budget !== undefined) return;
    if (!contextBudgetReached(spec.context, usage.tokens, usage.contextWindow)) return;
    budget = { tokens: usage.tokens };
    try {
      // Removing the tools applies to the next model request, including the
      // continuation of a running turn, so one final response follows.
      session.setActiveToolsByName([]);
    } catch {
      // A session already ending cannot be asked to change its tools.
    }
  };

  const run = async (): Promise<SessionOutcome> => {
    const runtime = await source.runtime();
    const { model, thinkingLevel } = await chooseModel(runtime, source.model);
    const settingsManager = SettingsManager.inMemory({
      retry: { enabled: true, maxRetries: 2 },
      ...(source.compaction === undefined ? {} : { compaction: source.compaction }),
    });
    const loader = new DefaultResourceLoader({
      cwd: spec.scope.workingDirectory,
      agentDir: source.agentDirectory,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories: [{
        name: 'ramify-agent',
        hidden: true,
        factory: api => {
          // The spec's prompt replaces pi's, exactly, on every agent start.
          api.on('before_agent_start', () => ({ systemPrompt: spec.systemPrompt }));
          // pi fires this only for a call whose input passed its own validation.
          api.on('tool_call', async event => {
            validated.add(event.toolCallId);
            if (!mutatingTools.has(event.toolName) || spec.guard === undefined) return undefined;
            const decision = await spec.guard({
              callId: event.toolCallId, tool: event.toolName, input: event.input, action: actionOf(event.toolName, event.input),
            });
            if (decision.allow) return undefined;
            denied.add(event.toolCallId);
            // The reason becomes the call's error result; nothing is mutated.
            return { block: true, reason: decision.text };
          });
          api.on('tool_result', async event => afterToolResult(event));
        },
      }],
    });

    /** A final rejection stays an error; an executed mutation is observed and its hook check reaches the agent. */
    const afterToolResult = async (event: ToolResultEvent): Promise<PiToolResult | undefined> => {
      const base: PiToolResult | undefined = rejectedCalls.has(event.toolCallId) ? { isError: true } : undefined;
      if (!mutatingTools.has(event.toolName) || spec.afterMutation === undefined) return base;
      if (denied.has(event.toolCallId)) return base;
      const observed = await spec.afterMutation({
        callId: event.toolCallId, tool: event.toolName, action: actionOf(event.toolName, event.input), failed: event.isError === true,
      });
      if (observed === null) return base;
      return { ...(base ?? {}), content: [...event.content, { type: 'text', text: observed.text }] };
    };

    await loader.reload();
    const customTools: PiToolDefinition[] = [
      ...spec.tools.map(harnessTool),
      submissionTool(spec.submission, {
        isStopped: () => stopped,
        onAccepted: input => { accepted = { input }; },
        onFinal: (callId, errors) => { finalErrors = errors; rejectedCalls.add(callId); },
      }),
    ];
    const { session } = await createAgentSession({
      cwd: spec.scope.workingDirectory,
      agentDir: source.agentDirectory,
      modelRuntime: runtime,
      model,
      ...(thinkingLevel === undefined ? {} : { thinkingLevel }),
      tools: [...spec.builtinTools, ...spec.tools.map(tool => tool.name), spec.submission.name],
      customTools,
      resourceLoader: loader,
      sessionManager: manager,
      settingsManager,
    });
    pi = session;
    if (sessionFile !== undefined) live.set(sessionFile, session);
    // Compaction is port policy: a forbidden role's session never compacts,
    // and nothing about it is ever said to the agent.
    session.setAutoCompactionEnabled(spec.context.compaction === 'allowed');
    if (stopped) return { kind: 'stopped' };
    session.subscribe(event => translate(event, emit, {
      mutating: tool => mutatingTools.has(tool),
      action: actionOf,
      reachedTool: callId => validated.has(callId),
      observeContext,
      onTurnEnd: () => {
        // An accepted submission ends the work; stop a loop that continues past it.
        if (accepted && !stopped) void session.abort().catch(() => undefined);
      },
    }));
    try {
      await session.prompt(spec.prompt);
    } catch (error) {
      if (stopped) return { kind: 'stopped' };
      if (accepted) return { kind: 'submitted', input: accepted.input };
      if (budget) return { kind: 'context-budget-reached', tokens: budget.tokens, report: session.getLastAssistantText() };
      return { kind: 'failed', error: message(error) };
    }
    if (stopped) return { kind: 'stopped' };
    if (accepted) return { kind: 'submitted', input: accepted.input };
    if (budget) return { kind: 'context-budget-reached', tokens: budget.tokens, report: session.getLastAssistantText() };
    if (finalErrors) return { kind: 'ended', message: finalErrors.join('\n') };
    const last = [...session.messages].reverse().find(entry => (entry as { role?: string }).role === 'assistant') as AssistantLike | undefined;
    if (last?.stopReason === 'error' || last?.stopReason === 'aborted') {
      return { kind: 'failed', error: last.errorMessage ?? `The model's reply ended with ${last.stopReason}` };
    }
    return { kind: 'ended', message: last ? textOf(last) || undefined : undefined };
  };

  const outcome = run()
    .catch((error: unknown): SessionOutcome => (stopped ? { kind: 'stopped' } : { kind: 'failed', error: message(error) }))
    .then(result => {
      if (sessionFile !== undefined) live.delete(sessionFile);
      pi?.dispose();
      return result;
    });

  return {
    outcome,
    start,
    get ref(): SessionRef { return refOf(manager.getSessionFile() ?? sessionFile, manager.getLeafId()); },
    /**
     * pi's own belief, bounded. It waits for an in-process tool even when
     * that tool ignores its signal, but it cannot see a descendant process,
     * so the harness confirms settlement itself by process group and a
     * stable tree.
     */
    settled: async () => {
      const bound = source.settleMs ?? 30_000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<'timed-out'>(resolve => { timer = setTimeout(() => resolve('timed-out'), bound); });
      const idle = (async () => {
        await outcome;
        await pi?.waitForIdle().catch(() => undefined);
        return 'settled' as const;
      })();
      try {
        return await Promise.race([idle, limit]);
      } finally {
        clearTimeout(timer);
      }
    },
    stop: async () => {
      stopped = true;
      // pi's abort resolves once the session is idle; a tool that ignores its signal delays it.
      if (pi) await pi.abort().catch(() => undefined);
      await outcome;
    },
  };
}

/** A harness tool as a pi tool; an error result becomes a thrown error, which pi reports as an error result. */
function harnessTool(tool: ToolDefinition): PiToolDefinition {
  return defineTool({
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.inputSchema as PiToolDefinition['parameters'],
    async execute(_callId, params, signal) {
      const result = await tool.execute(params, signal ?? new AbortController().signal);
      if (result.isError) throw new Error(result.text);
      return { content: [{ type: 'text', text: result.text }], details: {} };
    },
  });
}

/**
 * The submission tool. pi validates tool input against its schema before a
 * tool runs, and a call it rejects never reaches `accept`, so the schema pi
 * sees names the top-level fields and constrains nothing; the harness
 * validates everything and the full schema is in the description.
 */
function submissionTool(tool: SubmissionTool, hooks: {
  isStopped(): boolean;
  onAccepted(input: unknown): void;
  onFinal(callId: string, errors: readonly string[]): void;
}): PiToolDefinition {
  return defineTool({
    name: tool.name,
    label: tool.name,
    description: `${tool.description}\n\nThe input must satisfy this JSON Schema; the harness validates it and returns every error:\n${JSON.stringify(tool.inputSchema)}`,
    parameters: permissiveSchema(tool.inputSchema) as PiToolDefinition['parameters'],
    executionMode: 'sequential',
    async execute(callId, params, signal) {
      if (hooks.isStopped()) throw new Error('The session was stopped; the submission was not accepted.');
      const unwrapped = unwrapStringifiedFields(params, tool.inputSchema);
      const verdict = await tool.accept(unwrapped, signal ?? new AbortController().signal);
      if (verdict.accepted) {
        hooks.onAccepted(unwrapped);
        // The adapter knows the verdict and not what was submitted, so its
        // own acknowledgement says only that. What follows an accepted
        // submission is the harness's to word, by the kind it accepted.
        return { content: [{ type: 'text', text: verdict.text ?? 'The submission was accepted and recorded.' }], details: {}, terminate: true };
      }
      const text = `The submission was rejected:\n${verdict.errors.map(error => `- ${error}`).join('\n')}`;
      if ('final' in verdict) {
        hooks.onFinal(callId, verdict.errors);
        return { content: [{ type: 'text', text }], details: {}, terminate: true };
      }
      // The harness's answer already says what to do next; adding a second
      // instruction here only competes with it.
      throw new Error(text);
    },
  });
}

/** An object schema with the same top-level field names and no constraints. */
export function permissiveSchema(schema: JsonSchema): JsonSchema {
  const properties = schema.properties;
  const names = properties !== null && typeof properties === 'object' ? Object.keys(properties) : [];
  return { type: 'object', properties: Object.fromEntries(names.map(name => [name, {}])) };
}

/**
 * Unwraps a top-level field pi delivered as a JSON-encoded string where the
 * real schema names it `object` or `array`. Against a real model this was
 * reproducible: with every field's type erased by {@link permissiveSchema},
 * the model consistently submitted every object and array field as an
 * escaped JSON string instead of a native value, even after being told
 * exactly which fields were wrong and reasoning that it should not
 * stringify them, exhausting the correction bound. The content itself was
 * always correct, only its envelope was off, so the harness repairs the
 * envelope instead of asking the model to.
 *
 * Declaring each field's type on the tool's own parameter schema, instead
 * of unwrapping here, would fix the model's framing but also hands pi's own
 * schema validation a type to coerce against (pi-ai's `validateToolArguments`
 * coerces, for instance, a number to a string when a field is typed
 * `string`). That would let pi silently alter a malformed submission before
 * it ever reaches {@link SubmissionTool.accept}, so every error the harness
 * reports would no longer be the harness's own. Unwrapping only recognized
 * JSON-object and JSON-array strings, after the fact and only for this
 * tool, keeps that guarantee: a value that fails to parse, or parses to the
 * wrong shape, is passed through unchanged, and the harness's own schema
 * rejects it with the harness's own message.
 */
function unwrapStringifiedFields(params: unknown, schema: JsonSchema): unknown {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) return params;
  const properties = schema.properties;
  if (properties === null || typeof properties !== 'object') return params;
  const result: Record<string, unknown> = { ...(params as Record<string, unknown>) };
  for (const [key, value] of Object.entries(result)) {
    if (typeof value !== 'string') continue;
    const property = (properties as Record<string, unknown>)[key];
    const type = property !== null && typeof property === 'object' ? (property as { type?: unknown }).type : undefined;
    if (type !== 'object' && type !== 'array') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      continue; // Left as a string; the harness's own schema rejects it with its own message.
    }
    const parsedIsObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
    if (type === 'object' ? parsedIsObject : Array.isArray(parsed)) result[key] = parsed;
  }
  return result;
}

interface AssistantLike {
  readonly role: 'assistant';
  readonly content: ReadonlyArray<{ readonly type: string; readonly text?: string; readonly name?: string }>;
  readonly usage?: { readonly input: number; readonly output: number; readonly cacheRead: number; readonly cacheWrite: number; readonly totalTokens: number };
  readonly stopReason?: string;
  readonly errorMessage?: string;
}

function textOf(message: AssistantLike): string {
  return message.content.filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n').trim();
}

/** What the adapter must answer while translating one of pi's events. */
interface Translation {
  mutating(tool: string): boolean;
  action(tool: string, input: unknown): ToolAction;
  reachedTool(callId: string): boolean;
  observeContext(): void;
  onTurnEnd(): void;
}

/**
 * pi's events as port events: tool calls by call ID, each assistant message
 * with its token usage, the context after every model and tool boundary, and
 * compaction with its reason and its sizes.
 */
function translate(event: AgentSessionEvent, emit: (event: AgentEvent) => void, to: Translation): void {
  switch (event.type) {
    case 'tool_execution_start':
      emit({
        type: 'tool-started', callId: event.toolCallId, tool: event.toolName, input: event.args,
        action: to.action(event.toolName, event.args), mutating: to.mutating(event.toolName),
      });
      return;
    case 'tool_execution_end': {
      const content = (event.result as { content?: ReadonlyArray<{ type: string; text?: string }> } | undefined)?.content ?? [];
      const text = content.filter(block => block.type === 'text').map(block => block.text ?? '').join('\n');
      emit({
        type: 'tool-finished', callId: event.toolCallId, tool: event.toolName, isError: event.isError,
        errorText: event.isError ? text || undefined : undefined,
        // pi's `tool_call` hook fires only after its own validation passed.
        reachedTool: to.reachedTool(event.toolCallId),
      });
      to.observeContext();
      return;
    }
    case 'message_end': {
      const message = event.message as unknown as AssistantLike;
      if (message.role !== 'assistant') return;
      const calls = message.content.filter(block => block.type === 'toolCall').map(block => block.name ?? '?');
      const text = textOf(message) || (calls.length ? `(calls ${calls.join(', ')})` : '');
      emit({ type: 'message', text, usage: usageOf(message) });
      to.observeContext();
      return;
    }
    case 'compaction_start':
      emit({ type: 'compaction', phase: 'started', reason: event.reason });
      return;
    case 'compaction_end':
      // The sizes come from the event: the session reports no size between a
      // compaction and the next assistant reply.
      emit({
        type: 'compaction', phase: 'ended', reason: event.reason,
        tokensBefore: event.result?.tokensBefore,
        tokensAfter: event.result?.estimatedTokensAfter,
        aborted: event.aborted,
        errorText: event.errorMessage,
      });
      return;
    case 'turn_end':
      to.onTurnEnd();
      return;
    default:
      return;
  }
}

/**
 * pi's own tools as port actions, from pi's names and inputs: `read` with
 * `path`, `offset` and `limit`; `grep` and `find` with `pattern`, `path` and
 * `glob`; `ls` with `path`; `edit` and `write` with `path`. This is the one
 * place those names are read. A read that names no path, and any other
 * tool, is `other`; a write that names none has no paths. Exported for this
 * module's tests.
 */
export function builtinAction(tool: string, input: unknown): ToolAction {
  const record = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const text = (key: string): string | null => (typeof record[key] === 'string' ? record[key] as string : null);
  const count = (key: string): number | null => (typeof record[key] === 'number' ? record[key] as number : null);
  const path = text('path');
  switch (tool) {
    case 'read': {
      if (path === null) return { kind: 'other' };
      const start = count('offset');
      const lines = count('limit');
      return { kind: 'read', path, range: start === null && lines === null ? null : { start, count: lines } };
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

function usageOf(message: AssistantLike): TokenUsage | undefined {
  const usage = message.usage;
  if (!usage) return undefined;
  return { input: usage.input, output: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, total: usage.totalTokens };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
