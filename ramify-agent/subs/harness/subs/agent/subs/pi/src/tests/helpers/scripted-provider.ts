import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/*
 * A scripted model provider for pi, written against the provider interface
 * pi's own `ModelRuntime.registerNativeProvider` publishes. A real pi
 * session, with its real agent loop, tool validation, built-in tools, events,
 * abort and session file, runs on it; only the model's replies are scripted.
 * Nothing here calls a network or imports pi-ai, which pi keeps private.
 *
 * `contextWindow` and `maxTokens` are overridable so that pi's compaction
 * threshold and a session's context budget are reachable without a large
 * transcript.
 */

type Provider = Parameters<ModelRuntime['registerNativeProvider']>[0];
type StreamFunction = Provider['streamSimple'];
type Model = Parameters<StreamFunction>[0];
type Context = Parameters<StreamFunction>[1];
type StreamOptions = Parameters<StreamFunction>[2];
type EventStream = ReturnType<StreamFunction>;

/** What one scripted reply holds. A thinking block's signature is the opaque data a provider returns with it. */
export type ReplyBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'thinking'; readonly thinking: string; readonly signature?: string; readonly redacted?: boolean }
  | { readonly type: 'toolCall'; readonly name: string; readonly arguments: Record<string, unknown>; readonly id?: string };

/** The usage a reply reports. The optional fields are left out of pi's usage unless given, as a provider that does not report them does. */
export interface ReplyUsage {
  readonly input: number;
  readonly output: number;
  readonly cacheRead?: number;
  readonly cacheWrite?: number;
  /** The part of `cacheWrite` written with long retention. */
  readonly cacheWrite1h?: number;
  readonly reasoning?: number;
  /** The cost in US dollars; without it pi's usage reports zero. */
  readonly cost?: { readonly input: number; readonly output: number; readonly cacheRead: number; readonly cacheWrite: number; readonly total: number };
}

/** Message fields a provider may report beside the content. */
export interface ReplyDetail {
  readonly responseModel?: string;
  readonly providerThinkingLevel?: string;
}

export type Reply =
  | {
      readonly kind: 'reply'; readonly blocks: readonly ReplyBlock[];
      readonly usage?: ReplyUsage | undefined; readonly detail?: ReplyDetail | undefined;
    }
  /** Streams nothing until the request is aborted, like a model that is still thinking. */
  | { readonly kind: 'hold' }
  /** The provider reports an error. */
  | { readonly kind: 'error'; readonly message: string };

export type ReplyStep = Reply | ((context: Context) => Reply);

export const text = (value: string, usage?: { input: number; output: number; cacheRead?: number; cacheWrite?: number }): Reply => ({ kind: 'reply', blocks: [{ type: 'text', text: value }], usage });
export const call = (name: string, args: Record<string, unknown>, id?: string, usage?: { input: number; output: number; cacheRead?: number; cacheWrite?: number }): Reply => ({ kind: 'reply', blocks: [{ type: 'toolCall', name, arguments: args, id }], usage });
export const calls = (...blocks: ReplyBlock[]): Reply => ({ kind: 'reply', blocks });
/** Streams nothing until the request is aborted. */
export const hold: Reply = { kind: 'hold' };

/** A tool declaration as a system message carries it. */
type DeclaredTool = { readonly name: string; readonly parameters: unknown; readonly description: string };

/** What the model was sent on each request. */
export interface Request {
  /**
   * The prompt after replaying every system message in the request, as a
   * provider without mid-conversation system messages receives it; undefined
   * when the request holds none.
   */
  readonly systemPrompt: string | undefined;
  /** How many system messages the request held; a forced prompt arrives as exactly one. */
  readonly systemMessages: number;
  /** The tools after replaying every system message's additions and removals. */
  readonly tools: readonly DeclaredTool[];
  /** The conversation, without the system messages. */
  readonly messages: Context['messages'];
  /** The thinking level pi asked for, or undefined when it asked for none. */
  readonly reasoning: unknown;
}

export interface ScriptedProvider {
  readonly provider: Provider;
  readonly model: Model;
  readonly requests: Request[];
  /** Replies still queued. */
  pending(): number;
  /** Queues further replies after construction. */
  push(...steps: readonly ReplyStep[]): void;
}

let callCount = 0;

export interface ScriptedOptions {
  /** The model's context window. A small one makes pi's compaction threshold reachable without a large transcript. */
  readonly contextWindow?: number;
  readonly maxTokens?: number;
  /** Whether the model supports thinking; pi clamps a requested level to `off` for one that does not. */
  readonly reasoning?: boolean;
  /** The model's rates per million tokens; default none, which pi prices at zero. */
  readonly cost?: { readonly input: number; readonly output: number; readonly cacheRead: number; readonly cacheWrite: number };
}

export function scriptedProvider(steps: readonly ReplyStep[], options: ScriptedOptions = {}): ScriptedProvider {
  const queue = [...steps];
  const requests: Request[] = [];
  const model = {
    id: 'scripted-1', name: 'Scripted', api: 'scripted', provider: 'scripted', baseUrl: 'http://localhost:0',
    reasoning: options.reasoning ?? false, input: ['text'], cost: options.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: options.contextWindow ?? 200_000, maxTokens: options.maxTokens ?? 16_384,
  } as unknown as Model;

  const stream: StreamFunction = (requestModel, context, options?: StreamOptions) => {
    const system = context.messages.filter(message => message.role === 'system') as unknown as readonly SystemMessage[];
    requests.push({
      systemPrompt: system.length === 0 ? undefined : replayedPrompt(system),
      systemMessages: system.length,
      tools: replayedTools(system),
      messages: structuredClone(context.messages.filter(message => message.role !== 'system')),
      reasoning: (options as { reasoning?: unknown } | undefined)?.reasoning,
    });
    const events = new ReplyStream();
    const step = queue.shift();
    queueMicrotask(() => {
      void play(events, step === undefined ? { kind: 'error', message: 'No scripted reply is left' } : typeof step === 'function' ? step(context) : step, requestModel, options?.signal);
    });
    return events as unknown as EventStream;
  };

  const provider = {
    id: 'scripted',
    name: 'Scripted',
    auth: { apiKey: { name: 'Scripted', resolve: async () => ({ auth: {} }) } },
    getModels: () => [model],
    stream,
    streamSimple: stream,
  } as unknown as Provider;
  return { provider, model, requests, pending: () => queue.length, push: (...steps) => { queue.push(...steps); } };
}

/**
 * A system message as pi sends it to a provider. Since pi 0.86 the prompt and
 * the tool declarations travel in the transcript: a leading system message,
 * and later ones that append text, patch named sections or change the tools.
 */
interface SystemMessage {
  readonly role: 'system';
  readonly content: string | ReadonlyArray<{ readonly type: string; readonly text?: string }>;
  readonly sections?: Readonly<Record<string, string | null>>;
  readonly toolsAdded?: readonly DeclaredTool[];
  readonly toolsRemoved?: ReadonlyArray<{ readonly name: string }>;
}

function systemText(content: SystemMessage['content']): string {
  return typeof content === 'string' ? content : content.filter(block => block.type === 'text').map(block => block.text ?? '').join('');
}

/**
 * The prompt the system messages add up to, replayed as pi's own
 * `getCurrentSystemPrompt` does: each message's text is appended and named
 * sections are patched. pi keeps that helper in a package it does not export,
 * so the replay is restated here.
 */
function replayedPrompt(system: readonly SystemMessage[]): string {
  const content: string[] = [];
  const sections = new Map<string, string>();
  for (const message of system) {
    const text = systemText(message.content);
    if (text.length > 0) content.push(text);
    for (const [name, value] of Object.entries(message.sections ?? {})) {
      if (value === null) sections.delete(name);
      else sections.set(name, value);
    }
  }
  return [content.join('\n\n'), ...sections.values()].filter(part => part.length > 0).join('\n\n');
}

/** The tools the system messages add up to, after every addition and removal in order. */
function replayedTools(system: readonly SystemMessage[]): DeclaredTool[] {
  const tools = new Map<string, DeclaredTool>();
  for (const message of system) {
    for (const tool of message.toolsRemoved ?? []) tools.delete(tool.name);
    for (const tool of message.toolsAdded ?? []) tools.set(tool.name, { name: tool.name, parameters: tool.parameters, description: tool.description });
  }
  return [...tools.values()];
}

/** A model runtime isolated in a temporary agent directory, with the scripted provider registered. */
export async function scriptedRuntime(scripted: ScriptedProvider): Promise<{ runtime: ModelRuntime; agentDirectory: string; remove: () => Promise<void> }> {
  const agentDirectory = await mkdtemp(join(tmpdir(), 'ramify-agent-pi-'));
  const runtime = await ModelRuntime.create({
    authPath: join(agentDirectory, 'auth.json'),
    modelsPath: null,
    modelsStorePath: join(agentDirectory, 'models-store.json'),
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  runtime.registerNativeProvider(scripted.provider);
  return { runtime, agentDirectory, remove: () => rm(agentDirectory, { recursive: true, force: true }) };
}

type AssistantMessage = {
  role: 'assistant';
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'thinking'; thinking: string; thinkingSignature?: string; redacted?: boolean }
    | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }
  >;
  api: string; provider: string; model: string;
  responseModel?: string;
  providerThinkingLevel?: string;
  usage: {
    input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h?: number; reasoning?: number; totalTokens: number;
    cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  };
  stopReason: string;
  errorMessage?: string;
  timestamp: number;
};

async function play(events: ReplyStream, reply: Reply, model: Model, signal: AbortSignal | undefined): Promise<void> {
  const usage = (given?: ReplyUsage): AssistantMessage['usage'] => {
    const { input = 0, output = 0, cacheRead = 0, cacheWrite = 0 } = given ?? {};
    return {
      input, output, cacheRead, cacheWrite, totalTokens: input + output + cacheRead + cacheWrite,
      ...(given?.cacheWrite1h === undefined ? {} : { cacheWrite1h: given.cacheWrite1h }),
      ...(given?.reasoning === undefined ? {} : { reasoning: given.reasoning }),
      cost: given?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
  };
  const message = (content: AssistantMessage['content'], stopReason: string, extra: Partial<AssistantMessage> = {}): AssistantMessage => ({
    role: 'assistant', content, api: model.api, provider: model.provider, model: model.id, usage: usage(), stopReason, timestamp: Date.now(), ...extra,
  });
  const aborted = () => {
    const final = message([], 'aborted', { errorMessage: 'Request was aborted' });
    events.push({ type: 'error', reason: 'aborted', error: final });
    events.end(final);
  };
  if (signal?.aborted) return aborted();
  if (reply.kind === 'error') {
    const final = message([], 'error', { errorMessage: reply.message });
    events.push({ type: 'error', reason: 'error', error: final });
    events.end(final);
    return;
  }
  events.push({ type: 'start', partial: message([], 'pending') });
  if (reply.kind === 'hold') {
    await new Promise<void>(resolve => {
      if (signal?.aborted) resolve();
      signal?.addEventListener('abort', () => resolve(), { once: true });
    });
    return aborted();
  }
  const content: AssistantMessage['content'] = reply.blocks.map((block): AssistantMessage['content'][number] => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    if (block.type === 'thinking') {
      return {
        type: 'thinking', thinking: block.thinking,
        ...(block.signature === undefined ? {} : { thinkingSignature: block.signature }),
        ...(block.redacted === undefined ? {} : { redacted: block.redacted }),
      };
    }
    return { type: 'toolCall', id: block.id ?? `scripted-call-${++callCount}`, name: block.name, arguments: block.arguments };
  });
  const partial = message([], 'pending');
  content.forEach((block, index) => {
    partial.content = content.slice(0, index + 1);
    if (block.type === 'text') {
      events.push({ type: 'text_start', contentIndex: index, partial: { ...partial } });
      events.push({ type: 'text_end', contentIndex: index, content: block.text, partial: { ...partial } });
    } else if (block.type === 'thinking') {
      events.push({ type: 'thinking_start', contentIndex: index, partial: { ...partial } });
      events.push({ type: 'thinking_end', contentIndex: index, content: block.thinking, partial: { ...partial } });
    } else {
      events.push({ type: 'toolcall_start', contentIndex: index, partial: { ...partial } });
      events.push({ type: 'toolcall_end', contentIndex: index, toolCall: block, partial: { ...partial } });
    }
  });
  const final = message(content, content.some(block => block.type === 'toolCall') ? 'toolUse' : 'stop', { usage: usage(reply.usage), ...reply.detail });
  events.push({ type: 'done', reason: final.stopReason, message: final });
  events.end(final);
}

/** The event stream pi consumes: async iteration over events, and the final message. */
class ReplyStream implements AsyncIterable<unknown> {
  private readonly queue: unknown[] = [];
  private readonly waiting: Array<(result: IteratorResult<unknown>) => void> = [];
  private done = false;
  private resolveResult!: (message: AssistantMessage) => void;
  private readonly final = new Promise<AssistantMessage>(resolve => { this.resolveResult = resolve; });

  push(event: { type: string; [key: string]: unknown }): void {
    if (this.done) return;
    const waiter = this.waiting.shift();
    if (waiter) waiter({ value: event, done: false });
    else this.queue.push(event);
  }

  end(result: AssistantMessage): void {
    this.done = true;
    this.resolveResult(result);
    for (const waiter of this.waiting.splice(0)) waiter({ value: undefined, done: true });
  }

  async *[Symbol.asyncIterator](): AsyncIterator<unknown> {
    while (true) {
      if (this.queue.length > 0) yield this.queue.shift();
      else if (this.done) return;
      else {
        const next = await new Promise<IteratorResult<unknown>>(resolve => this.waiting.push(resolve));
        if (next.done) return;
        yield next.value;
      }
    }
  }

  result(): Promise<AssistantMessage> {
    return this.final;
  }
}
