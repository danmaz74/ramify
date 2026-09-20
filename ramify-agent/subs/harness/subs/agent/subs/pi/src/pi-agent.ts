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
} from '@earendil-works/pi-coding-agent';
import { join } from 'node:path';
import type {
  AgentEvent,
  AgentPort,
  AgentSession,
  JsonSchema,
  SessionOutcome,
  SessionSpec,
  SubmissionTool,
  TokenUsage,
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
 */

type PiToolDefinition = Parameters<typeof defineTool>[0];
type PiModel = NonNullable<ReturnType<ModelRuntime['getModel']>>;

export interface PiAgentOptions {
  /** The model as pi's `--model` accepts it, such as `anthropic/claude-opus-4-5`. Default: the first model pi has credentials for. */
  readonly model?: string | undefined;
  /** pi's agent directory, which holds its credentials (`auth.json`) and model settings. Default: pi's own, `~/.pi/agent` or `PI_CODING_AGENT_DIR`. */
  readonly agentDirectory?: string | undefined;
}

/** How this adapter reaches pi's models; tests supply a runtime with a scripted provider. */
export interface PiRuntimeSource {
  readonly agentDirectory: string;
  readonly model?: string | undefined;
  runtime(): Promise<ModelRuntime>;
}

/** The pi agent: each session is a fresh pi session in this process. */
export function createPiAgent(options: PiAgentOptions = {}): AgentPort {
  const agentDirectory = options.agentDirectory ?? getAgentDir();
  let runtime: Promise<ModelRuntime> | undefined;
  return createPiAgentOn({
    agentDirectory,
    model: options.model,
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
    const model = await chooseModel(runtime, options.model);
    return { ready: true, model: `${model.provider}/${model.id}` };
  } catch (error) {
    return { ready: false, reason: message(error) };
  }
}

/** The adapter over a given source of models. Exported for this module's tests. */
export function createPiAgentOn(source: PiRuntimeSource): AgentPort {
  return {
    name: 'pi',
    startSession: spec => startPiSession(spec, source),
  };
}

async function chooseModel(runtime: ModelRuntime, requested: string | undefined): Promise<PiModel> {
  if (requested !== undefined) {
    const resolved = resolveCliModel({ cliModel: requested, modelRuntime: runtime });
    if (resolved.error !== undefined || resolved.model === undefined) throw new Error(resolved.error ?? `pi does not know the model "${requested}"`);
    if ((await runtime.getAvailable(resolved.model.provider)).length === 0) {
      throw new Error(`pi has no credentials for ${resolved.model.provider}. Log in with \`npx pi\` and /login first.`);
    }
    return resolved.model;
  }
  const available = await runtime.getAvailable();
  const model = available[0];
  if (!model) throw new Error('pi has no model with credentials. Log in with `npx pi` and /login, or pass a model.');
  return model;
}

function startPiSession(spec: SessionSpec, source: PiRuntimeSource): AgentSession {
  let stopped = false;
  let pi: PiSession | undefined;
  let accepted: { readonly input: unknown } | undefined;
  let finalErrors: readonly string[] | undefined;
  /** Submission calls the harness rejected; their results are errors to the model. */
  const rejectedCalls = new Set<string>();
  const emit = (event: AgentEvent) => {
    if (stopped) return;
    try {
      spec.onEvent(event);
    } catch {
      // The port requires onEvent not to throw; a fault there must not end the session.
    }
  };

  const run = async (): Promise<SessionOutcome> => {
    const runtime = await source.runtime();
    const model = await chooseModel(runtime, source.model);
    const settingsManager = SettingsManager.inMemory({ retry: { enabled: true, maxRetries: 2 } });
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
          // A final rejection ends the loop with `terminate`; it is still an error to the model.
          api.on('tool_result', event => (rejectedCalls.has(event.toolCallId) ? { isError: true } : undefined));
        },
      }],
    });
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
      tools: [...spec.builtinTools, ...spec.tools.map(tool => tool.name), spec.submission.name],
      customTools,
      resourceLoader: loader,
      sessionManager: SessionManager.create(spec.scope.workingDirectory, spec.sessionDirectory),
      settingsManager,
    });
    pi = session;
    if (stopped) return { kind: 'stopped' };
    session.subscribe(event => translate(event, emit, () => {
      // An accepted submission ends the work; stop a loop that continues past it.
      if (accepted && !stopped) void session.abort().catch(() => undefined);
    }));
    try {
      await session.prompt(spec.prompt);
    } catch (error) {
      if (stopped) return { kind: 'stopped' };
      if (accepted) return { kind: 'submitted', input: accepted.input };
      return { kind: 'failed', error: message(error) };
    }
    if (stopped) return { kind: 'stopped' };
    if (accepted) return { kind: 'submitted', input: accepted.input };
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
      pi?.dispose();
      return result;
    });

  return {
    outcome,
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
        return { content: [{ type: 'text', text: 'The submission was accepted. Your work is complete.' }], details: {}, terminate: true };
      }
      const text = `The submission was rejected:\n${verdict.errors.map(error => `- ${error}`).join('\n')}`;
      if ('final' in verdict) {
        hooks.onFinal(callId, verdict.errors);
        return { content: [{ type: 'text', text }], details: {}, terminate: true };
      }
      throw new Error(`${text}\nCorrect these errors and submit again.`);
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

/** pi's events as port events: tool calls by call ID, and each assistant message with its token usage. */
function translate(event: AgentSessionEvent, emit: (event: AgentEvent) => void, onTurnEnd: () => void): void {
  switch (event.type) {
    case 'tool_execution_start':
      emit({ type: 'tool-started', callId: event.toolCallId, tool: event.toolName, input: event.args });
      return;
    case 'tool_execution_end': {
      const content = (event.result as { content?: ReadonlyArray<{ type: string; text?: string }> } | undefined)?.content ?? [];
      const text = content.filter(block => block.type === 'text').map(block => block.text ?? '').join('\n');
      emit({ type: 'tool-finished', callId: event.toolCallId, tool: event.toolName, isError: event.isError, errorText: event.isError ? text || undefined : undefined });
      return;
    }
    case 'message_end': {
      const message = event.message as unknown as AssistantLike;
      if (message.role !== 'assistant') return;
      const calls = message.content.filter(block => block.type === 'toolCall').map(block => block.name ?? '?');
      const text = textOf(message) || (calls.length ? `(calls ${calls.join(', ')})` : '');
      emit({ type: 'message', text, usage: usageOf(message) });
      return;
    }
    case 'turn_end':
      onTurnEnd();
      return;
    default:
      return;
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
