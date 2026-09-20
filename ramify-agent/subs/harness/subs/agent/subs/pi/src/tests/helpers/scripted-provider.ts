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
 */

type Provider = Parameters<ModelRuntime['registerNativeProvider']>[0];
type StreamFunction = Provider['streamSimple'];
type Model = Parameters<StreamFunction>[0];
type Context = Parameters<StreamFunction>[1];
type StreamOptions = Parameters<StreamFunction>[2];
type EventStream = ReturnType<StreamFunction>;

/** What one scripted reply holds. */
export type ReplyBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'toolCall'; readonly name: string; readonly arguments: Record<string, unknown>; readonly id?: string };

export type Reply =
  | { readonly kind: 'reply'; readonly blocks: readonly ReplyBlock[]; readonly usage?: { input: number; output: number } | undefined }
  /** Streams nothing until the request is aborted, like a model that is still thinking. */
  | { readonly kind: 'hold' }
  /** The provider reports an error. */
  | { readonly kind: 'error'; readonly message: string };

export type ReplyStep = Reply | ((context: Context) => Reply);

export const text = (value: string, usage?: { input: number; output: number }): Reply => ({ kind: 'reply', blocks: [{ type: 'text', text: value }], usage });
export const call = (name: string, args: Record<string, unknown>, id?: string): Reply => ({ kind: 'reply', blocks: [{ type: 'toolCall', name, arguments: args, id }] });
export const calls = (...blocks: ReplyBlock[]): Reply => ({ kind: 'reply', blocks });

/** What the model was sent on each request. */
export interface Request {
  readonly systemPrompt: string | undefined;
  readonly tools: ReadonlyArray<{ readonly name: string; readonly parameters: unknown; readonly description: string }>;
  readonly messages: Context['messages'];
}

export interface ScriptedProvider {
  readonly provider: Provider;
  readonly model: Model;
  readonly requests: Request[];
  /** Replies still queued. */
  pending(): number;
}

let callCount = 0;

export function scriptedProvider(steps: readonly ReplyStep[]): ScriptedProvider {
  const queue = [...steps];
  const requests: Request[] = [];
  const model = {
    id: 'scripted-1', name: 'Scripted', api: 'scripted', provider: 'scripted', baseUrl: 'http://localhost:0',
    reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000, maxTokens: 16_384,
  } as unknown as Model;

  const stream: StreamFunction = (requestModel, context, options?: StreamOptions) => {
    requests.push({
      systemPrompt: context.systemPrompt,
      tools: (context.tools ?? []).map(tool => ({ name: tool.name, parameters: tool.parameters, description: tool.description })),
      messages: structuredClone(context.messages),
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
  return { provider, model, requests, pending: () => queue.length };
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
  content: Array<{ type: 'text'; text: string } | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }>;
  api: string; provider: string; model: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number; cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number } };
  stopReason: string;
  errorMessage?: string;
  timestamp: number;
};

async function play(events: ReplyStream, reply: Reply, model: Model, signal: AbortSignal | undefined): Promise<void> {
  const usage = (input = 0, output = 0) => ({ input, output, cacheRead: 0, cacheWrite: 0, totalTokens: input + output, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });
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
  const content: AssistantMessage['content'] = reply.blocks.map(block => (block.type === 'text'
    ? { type: 'text', text: block.text }
    : { type: 'toolCall', id: block.id ?? `scripted-call-${++callCount}`, name: block.name, arguments: block.arguments }));
  const partial = message([], 'pending');
  content.forEach((block, index) => {
    partial.content = content.slice(0, index + 1);
    if (block.type === 'text') {
      events.push({ type: 'text_start', contentIndex: index, partial: { ...partial } });
      events.push({ type: 'text_end', contentIndex: index, content: block.text, partial: { ...partial } });
    } else {
      events.push({ type: 'toolcall_start', contentIndex: index, partial: { ...partial } });
      events.push({ type: 'toolcall_end', contentIndex: index, toolCall: block, partial: { ...partial } });
    }
  });
  const final = message(content, content.some(block => block.type === 'toolCall') ? 'toolUse' : 'stop', { usage: usage(reply.usage?.input, reply.usage?.output) });
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
