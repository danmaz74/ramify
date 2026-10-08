import {
  createAgentSession, createEditTool, createFindTool, createGrepTool, createLsTool, createReadTool, createWriteTool,
  DefaultResourceLoader, SessionManager, SettingsManager,
  type AgentSession as PiSession, type AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';
import { createSessionOperations } from '../../../src/session-operations.js';
import { SessionDriverUnavailableError } from '../../../src/interfaces/session-operations.js';
import { assistantText, contextBudgetReached, noMessageDetail } from '../../../src/interfaces/port.js';
import type { BuiltinTool, SessionOutcome, ToolDefinition, ToolResult, WriteTool } from '../../../src/interfaces/port.js';
import type { ContinueSessionInput, SessionDriverInvocation, SessionDriverRuntime, SessionExecutionBindings, SessionOperations, SessionOperationHandle, SessionOperationReceipt, SessionStore, SessionToolDeclaration } from '../../../src/interfaces/session-operations.js';
import { builtinAction, chooseModel, permissiveSchema, type PiRuntimeSource } from './pi-agent.js';
import { copy, decodePreservedTranscript, installedPiPublicExport, installedPiSerialization, same, sameNative, serializeNativePrefix, supportedPreservingModel, validateNativeRequest, type PiTranscriptMessage, type PiTranscriptTool, type PreservedPiTranscript } from './preservation.js';

const builtinFactories = { read: createReadTool, edit: createEditTool, write: createWriteTool, grep: createGrepTool, find: createFindTool, ls: createLsTool };
type NativeToolResult = Awaited<ReturnType<PiSession['agent']['state']['tools'][number]['execute']>>;
/** JSON only: the generic journal keeps these owner-private bytes opaque. */
interface BuiltinResultEnvelope { readonly schema: 'ramify.pi-builtin-result/1'; readonly displayText: string; readonly result: NativeToolResult }
type PortableToolResult = ToolResult & { readonly piBuiltinResult?: BuiltinResultEnvelope };
function nativeToolResult(value: ToolResult): NativeToolResult {
  const envelope = (value as PortableToolResult).piBuiltinResult;
  if (!envelope) return { content: [{ type: 'text', text: value.text }], details: {} };
  if (envelope.schema !== 'ramify.pi-builtin-result/1' || !Array.isArray(envelope.result.content)) throw new SessionDriverUnavailableError('Corrupt opaque builtin result');
  const result = copy(envelope.result);
  if (value.text !== envelope.displayText) {
    if (!value.text.startsWith(`${envelope.displayText}\n`)) throw new SessionDriverUnavailableError('Opaque builtin display/result identity changed');
    result.content.push({ type: 'text', text: value.text.slice(envelope.displayText.length + 1) });
  }
  return result;
}
export function piBuiltinDeclarations(names: readonly (BuiltinTool | WriteTool)[], workingDirectory: string): readonly SessionToolDeclaration[] {
  return names.map(name => {
    const tool = builtinFactories[name](workingDirectory);
    return { name: tool.name, description: tool.description, inputSchema: copy(tool.parameters) as unknown as SessionToolDeclaration['inputSchema'], mutating: name === 'edit' || name === 'write' };
  });
}
function completed(value: SessionOperationReceipt): SessionOperationHandle {
  const receipt = Promise.resolve(value); return { receipt, outcome: receipt.then(item => item.outcome), settled: () => receipt, stop: () => receipt };
}
/** Fresh builtin implementations stay here; no caller receives pi SDK objects. */
function enrichBindings(bindings: SessionExecutionBindings, declarations: readonly SessionToolDeclaration[]): SessionExecutionBindings {
  const tools: ToolDefinition[] = [...bindings.tools];
  for (const declaration of declarations) {
    if (tools.some(tool => tool.name === declaration.name) || !(declaration.name in builtinFactories)) continue;
    const name = declaration.name as keyof typeof builtinFactories;
    const builtin = builtinFactories[name](bindings.task.environment.workingDirectory);
    const expected = { name, description: builtin.description, inputSchema: copy(builtin.parameters), mutating: name === 'write' || name === 'edit' };
    if (!same(declaration, expected)) throw new Error(`Builtin definition conflicts for ${name}`);
    tools.push({ ...declaration, action: input => builtinAction(name, input), async execute(input, signal) {
      const result = await builtin.execute(`builtin:${name}`, input as never, signal);
      const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
      return { text, ...((result as NativeToolResult & { isError?: boolean }).isError ? { isError: true } : {}), piBuiltinResult: { schema: 'ramify.pi-builtin-result/1' as const, displayText: text, result: copy(result) } };
    } });
  }
  return { ...bindings, tools };
}
export function createPiSessionOperations(source: PiRuntimeSource, sessionStore: SessionStore): SessionOperations {
  const operations = createSessionOperations({ sessionStore, driver: { async dispatch(input, runtime) {
    try { return await dispatchPreservingPi(source, input, runtime); }
    catch (error) { if (runtime.signal.aborted) return { kind: 'stopped' }; throw new SessionDriverUnavailableError(String(error)); }
  } } });
  async function availability(runId: string, operationId: string, sessionId: string): Promise<SessionOperationHandle | null> {
    const previous = await sessionStore.read(runId, `operation:${operationId}`);
    if (previous?.body['receipt']) return null; // terminal lookup precedes transport changes and stale points
    try {
      const { model } = await chooseModel(await source.runtime(), source.model);
      const reason = supportedPreservingModel(model);
      if (!reason) { await installedPiSerialization(); return null; }
      return completed({ runId, operationId, sessionId, turn: null, point: null, status: 'unavailable', outcome: null, reason });
    } catch (error) { return completed({ runId, operationId, sessionId, turn: null, point: null, status: 'unavailable', outcome: null, reason: String(error) }); }
  }
  return { ...operations,
    async continue(input) {
      const unavailable = await availability(input.runId, input.operationId, input.sessionId); if (unavailable) return unavailable;
      const prior = await sessionStore.read(input.runId, `operation:${input.operationId}`);
      if (prior?.body['receipt']) return operations.continue(input);
      const snapshot = await operations.inspect(input.runId, input.sessionId);
      return operations.continue({ ...input, bindings: enrichBindings(input.bindings, [...(snapshot?.declarations ?? []), ...input.toolChange.add]) });
    },
    async retry(input) {
      const previous = await sessionStore.read(input.runId, `operation:${input.operationId}`);
      if (previous?.body['receipt']) return operations.retry(input);
      const snapshot = previous?.body['snapshot'] as { sessionId?: string; declarations?: readonly SessionToolDeclaration[] } | undefined;
      const unavailable = await availability(input.runId, input.operationId, snapshot?.sessionId ?? ''); if (unavailable) return unavailable;
      return operations.retry({ ...input, bindings: enrichBindings(input.bindings, snapshot?.declarations ?? []) });
    },
  };
}

async function dispatchPreservingPi(source: PiRuntimeSource, input: SessionDriverInvocation, runtime: SessionDriverRuntime): Promise<SessionOutcome> {
  const modelRuntime = await source.runtime(); const chosen = await chooseModel(modelRuntime, source.model);
  const unsupported = supportedPreservingModel(chosen.model); if (unsupported) throw new SessionDriverUnavailableError(unsupported);
  let state: PreservedPiTranscript | null = null;
  for (const entry of input.session.transcript) if (entry.kind === 'provider' && entry.key.includes(':pi-state:')) state = decodePreservedTranscript(await runtime.readPayload(entry.payloadId));
  const modelIdentity = `${chosen.model.provider}/${chosen.model.id}`;
  if (state && state.model !== modelIdentity) throw new Error('Preserved pi model identity differs');
  let messages: PiTranscriptMessage[] = state ? copy([...state.messages]) : [];
  let declarations: PiTranscriptTool[] = state ? copy([...state.declarations]) : [];
  const applied = new Set(state?.appliedAgentKeys ?? []);
  const additions = new Set(state?.additionKeys ?? []);
  let activeTools = state ? [...state.activeTools] : [];
  let sequence = state?.sequence ?? 0;
  const inherited = state?.native ?? null;
  let completeNative = inherited;
  const declarationFor = (definition: SessionToolDeclaration): PiTranscriptTool => definition.name === input.task.submissionTool
    ? { name: definition.name, description: `${definition.description}\n\nThe input must satisfy this JSON Schema; the harness validates it and returns every error:\n${JSON.stringify(definition.inputSchema)}`, parameters: permissiveSchema(definition.inputSchema) }
    : { name: definition.name, description: definition.description, parameters: copy(definition.inputSchema) };
  function addTools(definitions: readonly SessionToolDeclaration[]): PiTranscriptTool[] {
    const fresh: PiTranscriptTool[] = [];
    for (const definition of definitions) {
      if (declarations.some(tool => tool.name === definition.name)) continue;
      const declared = declarationFor(definition); declarations.push(declared); fresh.push(declared);
    }
    return fresh;
  }
  function addContext(values: readonly { key: string; kind: string; text: string }[], timestamp: number) {
    for (const value of values) {
      if (additions.has(value.key)) continue;
      messages.push({ role: value.kind === 'brief' ? 'user' : 'system', content: value.text, timestamp } as PiTranscriptMessage); additions.add(value.key);
    }
  }
  for (const entry of input.session.transcript) {
    if (entry.kind !== 'agent' || applied.has(entry.key)) continue;
    const data = JSON.parse(new TextDecoder().decode(await runtime.readPayload(entry.payloadId))) as Record<string, unknown>;
    const timestamp = Date.now();
    if ('initialInstructions' in data) {
      if (messages.length !== 0) throw new Error('Initial pi instructions cannot replace inherited history');
      const initial = addTools(data['declarations'] as SessionToolDeclaration[]);
      activeTools = [...data['activate'] as string[]];
      messages.push({ role: 'system', content: data['initialInstructions'] as string, toolsAdded: initial, timestamp } as PiTranscriptMessage);
    } else {
      addContext((data['additions'] ?? []) as Array<{ key: string; kind: string; text: string }>, timestamp);
      const change = data['toolChange'] as { add: SessionToolDeclaration[]; activate: string[]; inactivate: string[] } | undefined;
      if (change) {
        const fresh = addTools(change.add);
        if (fresh.length) messages.push({ role: 'system', content: '', toolsAdded: fresh, timestamp } as PiTranscriptMessage);
        const previous = [...activeTools]; const enabled = new Set(activeTools);
        for (const name of change.activate) enabled.add(name); for (const name of change.inactivate) enabled.delete(name);
        activeTools = [...enabled];
        if (!same(previous, activeTools)) messages.push({ role: 'system', content: `Active tools: ${activeTools.join(', ')}. Inactive historical tools must not be called.`, timestamp } as PiTranscriptMessage);
      }
      const task = data['task'] as { message: string; submissionTool: string } | undefined;
      if (task) messages.push({ role: 'user', content: task.message, timestamp } as PiTranscriptMessage);
    }
    applied.add(entry.key);
  }
  const persist = async () => {
    const native = await serializeNativePrefix(chosen.model, messages);
    if (inherited && (native.instructions !== inherited.instructions || !sameNative(native.tools, inherited.tools) || !sameNative(native.input.slice(0, inherited.input.length), inherited.input))) throw new Error('Restored opaque pi prefix changed before provider dispatch');
    // The installed serializer inserts synthetic outputs for unfinished calls.
    // Persist actual opaque messages immediately, but freeze native input only
    // at complete boundaries; a synthetic missing result was never dispatched.
    const unfinished = messages.some(message => message.role === 'assistant' && message.content.some(block => block.type === 'toolCall' && !messages.some(result => result.role === 'toolResult' && result.toolCallId === block.id)));
    if (!unfinished) completeNative = native;
    if (!completeNative) throw new Error('Opaque transcript has no complete native prefix');
    const next: PreservedPiTranscript = { schema: 'ramify.pi-transcript/1', packageVersion: '0.87.1', transport: 'sse', model: modelIdentity, messages: copy(messages), appliedAgentKeys: [...applied], declarations: copy(declarations), additionKeys: [...additions], activeTools: [...activeTools], native: completeNative, sequence: ++sequence, preparedOperationId: input.key.operationId };
    await runtime.persistPayload(`${input.key.operationId}:pi-state:${sequence}`, new TextEncoder().encode(JSON.stringify(next)));
    state = next;
  };
  await persist();
  // A recorded accepted verdict completes the missing exact tool-result artifact, never a model request.
  const acceptedEffect = input.effects.find(effect => effect.verdict?.accepted);
  if (acceptedEffect) {
    const calls = messages.flatMap(message => message.role === 'assistant' ? message.content.filter(block => block.type === 'toolCall') : []);
    if (!calls.some(call => call.id === acceptedEffect.callId)) throw new Error('Accepted submission lacks its durable opaque provider call');
    for (const call of calls.filter(call => !messages.some(message => message.role === 'toolResult' && message.toolCallId === call.id))) {
      const effect = input.effects.find(item => item.callId === call.id);
      let result: NativeToolResult; let isError = false;
      if (effect?.verdict?.accepted) result = nativeToolResult({ text: effect.verdict.text ?? 'The submission was accepted and recorded.' });
      else if (effect?.verdict?.accepted === false) { result = nativeToolResult({ text: `The submission was rejected:\n${effect.verdict.errors.join('\n')}` }); isError = true; }
      else if (effect?.result) { const value = await runtime.callTool(call.id, call.name, effect.input); result = nativeToolResult(value); isError = value.isError ?? false; }
      else { result = nativeToolResult({ text: 'Tool was not executed: task submission already accepted.' }); isError = true; }
      messages.push({ role: 'toolResult', toolCallId: call.id, toolName: call.name, content: result.content, details: result.details, usage: result.usage, isError, timestamp: Date.now() });
    }
    await persist();
    return { kind: 'submitted', input: acceptedEffect.input };
  }
  const settings = SettingsManager.inMemory({ transport: 'sse', compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: 'off' });
  const loader = new DefaultResourceLoader({ cwd: input.task.environment.workingDirectory, agentDir: source.agentDirectory, settingsManager: settings, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, extensionFactories: source.preservingExtensions ?? [] });
  await loader.reload();
  const manager = SessionManager.inMemory(input.task.environment.workingDirectory);
  for (const message of messages) manager.appendMessage(message as Parameters<SessionManager['appendMessage']>[0]);
  const { session } = await createAgentSession({ cwd: input.task.environment.workingDirectory, agentDir: source.agentDirectory, modelRuntime, model: chosen.model, thinkingLevel: chosen.thinkingLevel, settingsManager: settings, resourceLoader: loader, sessionManager: manager, noTools: 'all', tools: [] });
  let fatal: string | null = null; let accepted: unknown; let final = false; let budget: number | null | undefined;
  await session.bindExtensions({ onError: error => { fatal ??= `Extension ${error.event} failed: ${error.error}`; } });
  // These public callbacks implement SDK default prompt/loadout/compaction refresh. The durable adapter owns them.
  session.agent.prepareRequest = undefined; session.agent.prepareNextTurn = undefined; session.agent.prepareNextTurnWithContext = undefined;
  // Durable runtime guards and deterministic result encoding make accepted
  // effect recovery possible; SDK extension result rewrites are not supported.
  session.agent.beforeToolCall = undefined;
  const nativeErrors = new Map<string, boolean>();
  session.agent.afterToolCall = async context => nativeErrors.has(context.toolCall.id) ? { isError: nativeErrors.get(context.toolCall.id) } : undefined;
  session.agent.finishTurn = () => accepted !== undefined || final || budget !== undefined || fatal ? { action: 'end' } : undefined;
  session.agent.sessionId = input.session.sessionId;
  session.agent.state.messages = copy(messages);
  session.agent.state.tools = declarations.map(definition => ({ ...definition, label: definition.name,
    async execute(callId: string, args: unknown) {
      await runtime.assertLive();
      if (fatal) throw new Error(fatal);
      if (!input.session.activeTools.includes(definition.name)) throw new Error(`Inactive historical tool ${definition.name}`);
      if (definition.name === input.task.submissionTool) {
        const verdict = await runtime.submit(callId, args);
        if (verdict.accepted) { accepted = args; return { content: [{ type: 'text' as const, text: verdict.text ?? 'The submission was accepted and recorded.' }], details: {}, terminate: true }; }
        if ('final' in verdict) final = true;
        throw new Error(`The submission was rejected:\n${verdict.errors.join('\n')}`);
      }
      // Historical specialized submissions retain their declarations but never bind a completing handler.
      const result = await runtime.callTool(callId, definition.name, args);
      if ((result as PortableToolResult).piBuiltinResult) { nativeErrors.set(callId, result.isError ?? false); return nativeToolResult(result); }
      if (result.isError) throw new Error(result.text);
      return nativeToolResult(result);
    },
  })) as PiSession['agent']['state']['tools'];
  const stream = session.agent.streamFunction;
  let requestCount = 0;
  session.agent.streamFunction = async (model, context, options) => {
    if (fatal) throw new Error(fatal);
    if (budget !== undefined) throw new Error('Context budget reached; preserving history cannot remove tools');
    const expected = await serializeNativePrefix(chosen.model, messages);
    const transform = options?.onPayload;
    // Cached WebSocket transport rewrites input after onPayload. Only the
    // qualified full-payload SSE transport may cross this final fence.
    return stream(model, context, { ...options, transport: 'sse', maxRetries: 0, onPayload: async (payload, requestModel) => {
      try {
        const transformed = await transform?.(payload, requestModel); const body = transformed ?? payload;
        if (fatal) throw new Error(fatal);
        if ((body as Record<string, unknown>)['model'] !== chosen.model.id) throw new Error('Final native request changed model identity');
        const actual = validateNativeRequest(body, expected, inherited);
        await runtime.persistPayload(`${input.key.operationId}:pi-request:${sequence}:${++requestCount}`, new TextEncoder().encode(JSON.stringify({ schema: 'ramify.pi-native-request/1', packageVersion: '0.87.1', transport: 'sse', model: modelIdentity, ...actual, request: copy(body) })));
        await runtime.assertLive(); if (runtime.signal.aborted) throw new Error('Operation stopped');
        return body;
      } catch (error) { fatal = String(error); throw error; }
    } });
  };
  const unsubscribe = session.agent.subscribe(async event => {
    if (event.type === 'message_end') { messages = copy(session.agent.state.messages); await persist(); }
    if (event.type === 'tool_execution_start') runtime.onEvent({ type: 'tool-started', callId: event.toolCallId, tool: event.toolName, input: event.args, ...runtime.describeTool(event.toolName, event.args) });
    if (event.type === 'tool_execution_end') runtime.onEvent({ type: 'tool-finished', callId: event.toolCallId, tool: event.toolName, isError: event.isError, reachedTool: input.session.activeTools.includes(event.toolName) });
    if (event.type === 'message_end') reportMessage(event as AgentSessionEvent, runtime);
    if (event.type === 'turn_end') {
      const usage = session.getContextUsage();
      if (usage) { runtime.onEvent({ type: 'context-observed', tokens: usage.tokens, window: usage.contextWindow }); if (contextBudgetReached(input.session.policy.context, usage.tokens, usage.contextWindow)) budget = usage.tokens; }
    }
  });
  const stop = () => session.agent.abort(); runtime.signal.addEventListener('abort', stop, { once: true });
  try {
    await runtime.assertLive();
    if (!input.recovering) runtime.onEvent({ type: 'message', role: 'user', blocks: [{ type: 'text', text: input.task.message }] });
    const last = messages.at(-1);
    if (input.recovering && last?.role === 'assistant') {
      // Complete known tool effects without asking the model to repeat a tool call.
      // A listener/storage crash can append a terminal SDK error after the
      // durable call; retain that artifact and find every missing call output.
      const calls = messages.flatMap(message => message.role === 'assistant' ? message.content.filter(block => block.type === 'toolCall') : []).filter(call => !messages.some(message => message.role === 'toolResult' && message.toolCallId === call.id));
      if (!calls.length) return last.stopReason === 'error' || last.stopReason === 'aborted' ? { kind: 'failed', error: last.errorMessage ?? last.stopReason } : { kind: 'ended' };
      for (const call of calls) {
        const implementation = session.agent.state.tools.find(tool => tool.name === call.name);
        if (!implementation) throw new Error(`Interrupted provider call has no bound tool ${call.name}`);
        // Generic runtime refuses uncertain effects and returns journaled completed ones;
        // calls whose intent was never written execute once under original bindings.
        let result: NativeToolResult; let isError = false;
        try {
          const validation = await import(await installedPiPublicExport('./utils/validation')) as { validateToolArguments(tool: unknown, call: unknown): unknown };
          const args = validation.validateToolArguments(implementation, call);
          result = await implementation.execute(call.id, args as never, runtime.signal) as typeof result;
          isError = nativeErrors.get(call.id) ?? false;
        }
        catch (error) { result = nativeToolResult({ text: error instanceof Error ? error.message : String(error) }); isError = true; }
        messages.push({ role: 'toolResult', toolCallId: call.id, toolName: call.name, content: result.content, details: result.details, usage: result.usage, isError, timestamp: Date.now() });
        if (accepted !== undefined) { await persist(); return { kind: 'submitted', input: accepted }; }
      }
      await persist(); session.agent.state.messages = copy(messages);
    }
    await session.agent.continue();
    if (fatal) throw new SessionDriverUnavailableError(fatal);
    if (runtime.signal.aborted) return { kind: 'stopped' };
    if (accepted !== undefined) return { kind: 'submitted', input: accepted };
    if (budget !== undefined) return { kind: 'context-budget-reached', tokens: budget };
    const lastMessage = messages.at(-1);
    if (lastMessage?.role === 'assistant' && (lastMessage.stopReason === 'error' || lastMessage.stopReason === 'aborted')) return { kind: 'failed', error: lastMessage.errorMessage ?? lastMessage.stopReason };
    return { kind: 'ended' };
  } finally { runtime.signal.removeEventListener('abort', stop); unsubscribe(); session.dispose(); }
}
function reportMessage(event: AgentSessionEvent, runtime: SessionDriverRuntime): void {
  if (event.type !== 'message_end') return;
  const message = event.message;
  if (message.role === 'user') runtime.onEvent({ type: 'message', role: 'user', blocks: typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content.map(block => block.type === 'text' ? block : { type: 'other', kind: block.type, description: 'Provider content' }) });
  else if (message.role === 'toolResult') runtime.onEvent({ type: 'message', role: 'tool-result', callId: message.toolCallId, tool: message.toolName, isError: message.isError, blocks: message.content.map(block => block.type === 'text' ? block : { type: 'other', kind: block.type, description: 'Provider content' }) });
  else if (message.role === 'assistant') {
    const blocks = message.content.map(block => block.type === 'thinking' ? { type: 'thinking' as const, visibility: 'unmarked' as const, text: block.thinking } : block.type === 'toolCall' ? { type: 'tool-call' as const, callId: block.id, tool: block.name, input: block.arguments, action: runtime.describeTool(block.name, block.arguments).action } : block);
    runtime.onEvent({ type: 'message', role: 'assistant', blocks, text: assistantText(blocks), usage: message.usage ? { input: message.usage.input, output: message.usage.output, cacheRead: message.usage.cacheRead, cacheWrite: message.usage.cacheWrite, total: message.usage.totalTokens } : null, detail: noMessageDetail });
  }
}
