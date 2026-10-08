import { createPiSessionOperations } from './session-operations.js';
import type { SessionStore } from '../../../src/interfaces/session-operations.js';
import { type DefaultResourceLoader, getAgentDir, ModelRuntime, resolveCliModel } from '@earendil-works/pi-coding-agent';
import { join } from 'node:path';
import type { AgentPort, ExecutorSupport, JsonSchema, ToolAction } from '../../../src/interfaces/port.js';

/**
 * The Pi-owned preserving driver binds native requests to generic durable
 * session operations. Model selection, authentication, opaque provider payloads
 * and SDK objects remain inside Pi; callers supply an owned SessionStore.
 * Current executable tools and submission are rebound for each operation.
 * Stop, authority and mutation hooks remain execution policy.
 *
 * Support entries describe available observations and operations. They never
 * authorize a replacement start; source-backed recovery belongs to the caller.
 */
const piSupport: ExecutorSupport = {
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

type PiModel = NonNullable<ReturnType<ModelRuntime['getModel']>>;
type PiThinkingLevel = NonNullable<ReturnType<typeof resolveCliModel>['thinkingLevel']>;
/** A model with the thinking level a `provider/model:level` request named, if it named one. */
interface ChosenModel { readonly model: PiModel; readonly thinkingLevel: PiThinkingLevel | undefined }

export interface PiAgentOptions {
  readonly sessionStore?: SessionStore | undefined;
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
  readonly sessionStore?: SessionStore | undefined;
  readonly preservingExtensions?: NonNullable<ConstructorParameters<typeof DefaultResourceLoader>[0]>['extensionFactories'];
  readonly agentDirectory: string;
  readonly model?: string | undefined;
  readonly settleMs?: number | undefined;
  readonly compaction?: PiAgentOptions['compaction'];
  /** pi's first delay before it retries a failed model call; default pi's own. Tests shorten it. */
  readonly retryDelayMs?: number | undefined;
  runtime(): Promise<ModelRuntime>;
}

/** The Pi agent binds its preserving driver to the caller's durable store. */
export function createPiAgent(options: PiAgentOptions = {}): AgentPort {
  const agentDirectory = options.agentDirectory ?? getAgentDir();
  let runtime: Promise<ModelRuntime> | undefined;
  return createPiAgentOn({
    agentDirectory,
    sessionStore: options.sessionStore,
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
  return {
    name: 'pi',
    sessionOperations: source.sessionStore ? createPiSessionOperations(source, source.sessionStore) : null,
    bindSessionStore: sessionStore => createPiSessionOperations(source, sessionStore),
    support: piSupport,
  };
}

/**
 * pi's resolver parses a `:level` suffix but does not apply it; the level is
 * returned beside the model so the session can be started with it. Dropping
 * it would run the model at pi's default level while the request named another.
 */
export async function chooseModel(runtime: ModelRuntime, requested: string | undefined): Promise<ChosenModel> {
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

export function permissiveSchema(schema: JsonSchema): JsonSchema {
  const properties = schema.properties;
  const names = properties !== null && typeof properties === 'object' ? Object.keys(properties) : [];
  return { type: 'object', properties: Object.fromEntries(names.map(name => [name, {}])) };
}

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

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
