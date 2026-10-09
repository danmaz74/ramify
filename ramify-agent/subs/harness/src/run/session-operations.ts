import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { AgentPort, AgentSession, AppendOutcome, SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import type { AppendSessionContextInput, AgentSessionPoint, SessionExecutionIdentity, SessionExecutionBindings, SessionExecutionPolicy, SessionOperations, SessionTaskInput, SessionToolDeclaration } from '../../subs/agent/src/interfaces/session-operations.js';
import { piBuiltinDeclarations } from '../../subs/agent/subs/pi/src/session-operations.js';
import { writeFileExclusive } from '../../subs/ledger/src/atomic.js';
import { openSessionStore, type LedgerSessionStore } from './session-store.js';
import { buildTaskPacket, type TaskEnvironment, type TaskKind, type TaskPacket } from '../prompts/tasks.js';
import { buildBriefingDelivery, createBriefingOccurrence, taskBriefingRevision, type BriefingRevision } from '../prompts/briefings.js';
import { renderBlockSet } from '../prompts/blocks.js';
import { exactInputHash, type DeliveredInput } from '../prompts/delivered-manifest.js';
import type { LoadedPackage } from '../prompts/packages.js';
import { deliveredManifestViewSchema } from '../interfaces/protocol/runs.js';

export interface HarnessTaskBrief {
  readonly kind: TaskKind;
  readonly objective: string;
  readonly goal: string;
  readonly requirements: readonly string[];
  readonly sections: BriefingRevision['sections'];
  /** Selector forks keep the parent's known facts; their new task adds only selection inputs. */
  readonly retainInheritedSections?: boolean;
  readonly environment: TaskEnvironment;
  readonly consultationSubmissionSchema?: string;
}
export interface HarnessOperationInput {
  readonly runId: string;
  readonly operationId: string;
  readonly session: string;
  readonly loaded: LoadedPackage;
  readonly brief: HarnessTaskBrief;
  readonly spec: SessionSpec;
  readonly authority: Readonly<Record<string, unknown>>;
  readonly validator: Readonly<Record<string, unknown>>;
  readonly destination: Readonly<Record<string, unknown>>;
  readonly currentAuthority: () => Promise<boolean>;
  readonly prepared?: (packet: TaskPacket) => Promise<void>;
  readonly identified?: (identity: SessionExecutionIdentity) => Promise<void>;
  readonly restore?: boolean;
  readonly accepted?: () => { readonly value: unknown; readonly schema: string; readonly submissionHash: string };
}
interface Context {
  readonly point: AgentSessionPoint;
  readonly inherited: readonly DeliveredInput[];
  readonly history: readonly BriefingRevision[];
  readonly revision: string;
}
interface Intent {
  readonly schema: 'ramify-agent.harness-operation/1' | 'ramify-agent.harness-operation/2';
  readonly runId: string;
  readonly operationId: string;
  readonly session: string;
  readonly source: AgentSessionPoint | null;
  readonly mode: SessionSpec['session']['mode'];
  readonly packet: TaskPacket;
  readonly context: Omit<Context, 'point'>;
  readonly policy: SessionExecutionPolicy;
  readonly task: SessionTaskInput;
  readonly declarations: readonly SessionToolDeclaration[];
  readonly requestHash?: string;
}

const retainedText = z.string().min(1);
const pointSchema = z.object({ sessionId: retainedText, kind: z.enum(['turn', 'checkpoint']), turn: z.int().nonnegative(), checkpoint: z.string() }).strict();
const retainedSource = z.object({ path: retainedText, hash: retainedText, bytes: z.int().nonnegative(), kind: z.string().optional() }).strict();
const inputSchema = z.object({ key: retainedText, kind: z.enum(['role-instructions', 'procedure', 'brief', 'environment', 'task', 'tool-declaration', 'skill']),
  text: z.string(), source: z.string().nullable(), revision: z.string().nullable(), sources: z.array(retainedSource).optional() }).strict();
const annotatedInputSchema = inputSchema.extend({ block: z.object({ key: retainedText, effect: z.enum(['set', 'remove']) }).strict().optional() }).strict();
const revisionSchema = z.object({ revision: retainedText, sections: z.array(z.object({ key: retainedText, text: z.string(), source: z.string().nullable().optional() }).strict()) }).strict();
const occurrenceSchema = revisionSchema.extend({ contentHash: retainedText.optional(), sections: z.array(z.object({ key: retainedText, text: z.string(), source: z.string().nullable().optional(), effect: z.enum(['set', 'remove']).optional() }).strict()) }).strict();
const jsonRecord = z.record(z.string(), z.unknown());
const declarationSchema = z.object({ name: retainedText, description: z.string(), inputSchema: jsonRecord, mutating: z.boolean() }).strict();
const packetFields = { roleInstructions: z.string(), message: z.string(), submissionTool: retainedText,
  declaration: z.object({ name: retainedText, description: z.string(), inputSchema: z.object({ type: z.literal('object') }).strict(), mutating: z.literal(false) }).strict(),
  manifest: deliveredManifestViewSchema };
const intentFields = { runId: retainedText, operationId: retainedText, session: retainedText, source: pointSchema.nullable(), mode: z.enum(['fresh', 'continue', 'fork']),
  policy: z.object({ context: z.object({ compaction: z.enum(['forbidden', 'allowed']), budgetTokens: z.number().nullable(), budgetFraction: z.number().nullable(), reportReserveTokens: z.number() }).strict(),
    authority: jsonRecord, validator: jsonRecord, destination: jsonRecord }).strict(),
  task: z.object({ role: retainedText, message: z.string(), submissionTool: retainedText, policyIdentity: retainedText, validatorIdentity: retainedText, destinationIdentity: retainedText,
    environment: z.object({ workingDirectory: retainedText, candidate: z.string().nullable(), snapshot: z.string().nullable(), limits: jsonRecord }).strict() }).strict(),
  declarations: z.array(declarationSchema) };
const intentSchema = z.discriminatedUnion('schema', [
  z.object({ schema: z.literal('ramify-agent.harness-operation/1'), ...intentFields,
    packet: z.object({ ...packetFields, additions: z.array(inputSchema) }).strict(),
    context: z.object({ inherited: z.array(inputSchema), history: z.array(revisionSchema), revision: retainedText }).strict(),
  }).strict(),
  z.object({ schema: z.literal('ramify-agent.harness-operation/2'), ...intentFields, requestHash: retainedText.optional(),
    packet: z.object({ ...packetFields, additions: z.array(annotatedInputSchema) }).strict(),
    context: z.object({ inherited: z.array(annotatedInputSchema), history: z.array(occurrenceSchema), revision: retainedText }).strict(),
  }).strict(),
]);

/** Validate both retained wire forms without normalizing or rewriting any original bytes. */
export function readHarnessOperationIntent(value: unknown): Intent {
  intentSchema.parse(value);
  const intent = value as Intent;
  if (intent.schema === 'ramify-agent.harness-operation/1' && intent.packet.manifest.schema !== 'ramify-agent.delivered-inputs/1') throw new Error('Legacy harness intent requires its legacy manifest');
  return intent;
}
/** Only unavailable reusable context licenses a new ordinary fresh invocation. */
export class ReusableSessionUnavailableError extends Error {}

export const genericSessionDriverUnavailableError = 'The configured agent does not expose injected high-level session operations';
/** A provider-neutral transitional reference. It contains only a harness run and structured point. */
export function sessionPointReference(runId: string, point: AgentSessionPoint): string {
  return JSON.stringify({ schema: 'ramify-agent.session-point/1', runId, point });
}
export function readSessionPointReference(ref: string): { readonly runId: string; readonly point: AgentSessionPoint } | null {
  try {
    const value = JSON.parse(ref) as { schema?: unknown; runId?: unknown; point?: AgentSessionPoint };
    const point = value.point;
    if (value.schema !== 'ramify-agent.session-point/1' || typeof value.runId !== 'string' || !point ||
      typeof point.sessionId !== 'string' || !['turn', 'checkpoint'].includes(point.kind) || !Number.isInteger(point.turn) || point.turn < 0 || typeof point.checkpoint !== 'string') return null;
    return { runId: value.runId, point };
  } catch { return null; }
}

/** Harness correlations are immutable; provider bytes and execution intent remain in the injected ledger store. */
export class HarnessSessionOperations {
  private readonly pending = new Set<Promise<unknown>>();
  private readonly unconfirmed = new Set<string>();
  private constructor(private readonly directory: string, private readonly store: LedgerSessionStore, readonly operations: SessionOperations, private readonly agent: AgentPort) {}
  static async open(directory: string, agent: AgentPort): Promise<HarnessSessionOperations> {
    if (!agent.bindSessionStore) throw new Error(genericSessionDriverUnavailableError);
    const store = await openSessionStore({ directory: join(directory, 'store') });
    try { return new HarnessSessionOperations(directory, store, agent.bindSessionStore(store), agent); }
    catch (error) { await store.close(); throw error; }
  }
  /** Refuses to release the store while any dispatched operation still owns its barrier. */
  async close(): Promise<boolean> {
    if (this.pending.size > 0 || this.unconfirmed.size > 0) return false;
    await this.store.close(); return true;
  }
  private path(kind: string, key: unknown): string { return join(this.directory, 'correlations', kind, `${exactInputHash(JSON.stringify(key))}.json`); }
  private async read<T>(path: string): Promise<T | null> {
    try { return JSON.parse(await readFile(path, 'utf8')) as T; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  private async retain(path: string, value: unknown): Promise<void> {
    const bytes = JSON.stringify(value);
    await mkdir(dirname(path), { recursive: true });
    await writeFileExclusive(path, bytes);
    if (await readFile(path, 'utf8') !== bytes) throw new Error('Conflicting harness session correlation');
  }
  /** Verify a durable generic source without opening provider files or moving its point. */
  async hasPoint(runId: string, ref: string): Promise<boolean> {
    const source = readSessionPointReference(ref);
    if (!source || source.runId !== runId) return false;
    const snapshot = await this.operations.inspect(runId, source.point.sessionId, source.point);
    return snapshot !== null;
  }

  private async context(runId: string, point: AgentSessionPoint): Promise<Context> {
    const found = await this.read<Context>(this.path('points', [runId, point]));
    if (!found) throw new ReusableSessionUnavailableError('The named session point has no recorded briefing ancestry');
    if (JSON.stringify(found.point) !== JSON.stringify(point)) throw new Error('The recorded briefing ancestry names a different session point');
    return found;
  }
  async packet(runId: string, operationId: string): Promise<TaskPacket | null> {
    const raw = await this.read<unknown>(this.path('operations', [runId, operationId]));
    if (!raw) return null;
    const intent = readHarnessOperationIntent(raw);
    if (intent.runId !== runId || intent.operationId !== operationId) throw new Error('Invalid harness operation identity');
    return intent.packet;
  }
  async acceptance(runId: string, operationId: string): Promise<{ readonly input: unknown; readonly value: unknown; readonly schema: string; readonly submissionHash: string; readonly destination: Readonly<Record<string, unknown>>; readonly validator: Readonly<Record<string, unknown>> } | null> {
    const found = await this.read<{ runId: string; operationId: string; input: unknown; value: unknown; schema: string; submissionHash: string; destination: Readonly<Record<string, unknown>>; validator: Readonly<Record<string, unknown>> }>(this.path('acceptances', [runId, operationId]));
    if (found && (found.runId !== runId || found.operationId !== operationId || typeof found.schema !== 'string' || !/^[a-f0-9]{64}$/u.test(found.submissionHash))) throw new Error('Invalid harness acceptance correlation');
    return found;
  }
  async start(input: HarnessOperationInput): Promise<AgentSession & { readonly unavailableReason?: string | undefined }> {
    const { runId, operationId } = input;
    const path = this.path('operations', [runId, operationId]);
    const raw = await this.read<unknown>(path);
    const previous = raw === null ? null : readHarnessOperationIntent(raw);
    if (previous && (previous.runId !== runId || previous.operationId !== operationId)) throw new Error('Invalid harness operation identity');
    if (input.restore && !previous) throw new Error('Original operation correlation unavailable');
    const spec = previous ? { ...input.spec, scope: { workingDirectory: previous.task.environment.workingDirectory },
      session: previous.mode === 'fresh' ? { mode: 'fresh' as const } : previous.mode === 'continue'
        ? { mode: 'continue' as const, ref: sessionPointReference(runId, previous.source!) } : { mode: 'fork' as const, from: sessionPointReference(runId, previous.source!) } } : input.spec;
    const settleMs = input.brief.environment.limits['stopSettleMs'];
    if (typeof settleMs !== 'number' || !Number.isFinite(settleMs) || settleMs <= 0) throw new Error('Captured session settlement bound is required');
    const sourceRef = spec.session.mode === 'fresh' ? null : readSessionPointReference(spec.session.mode === 'continue' ? spec.session.ref : spec.session.from);
    if (sourceRef && sourceRef.runId !== runId) throw new Error('The requested point belongs to another run');
    if (spec.session.mode !== 'fresh' && !sourceRef) throw new ReusableSessionUnavailableError('The requested session point is unavailable');
    const prior = sourceRef ? await this.context(runId, sourceRef.point) : null;
    // Retried packets and occurrences are immutable, including the legacy wire form.
    if (previous?.requestHash && !input.restore && previous.requestHash !== exactInputHash(JSON.stringify(input.brief))) throw new Error('Conflicting harness session correlation');
    if (previous && !input.restore) {
      const requestedSource = input.spec.session.mode === 'fresh' ? null : readSessionPointReference(input.spec.session.mode === 'continue' ? input.spec.session.ref : input.spec.session.from)?.point;
      if (input.session !== previous.session || input.spec.session.mode !== previous.mode || input.spec.scope.workingDirectory !== previous.task.environment.workingDirectory ||
        JSON.stringify(requestedSource) !== JSON.stringify(previous.source)) throw new Error('Conflicting harness session correlation');
      const retained = previous.context.history.find(entry => entry.revision === previous.context.revision);
      const canonical = taskBriefingRevision({ revision: 'validation', goal: input.brief.goal, requirements: input.brief.requirements, sections: [] });
      const originalTask = previous.packet.additions.find(item => item.key === 'task' && item.kind === 'task');
      const legacyTask = [`# Current task: ${input.brief.kind}`, input.brief.objective, '', 'Submit only through `' + previous.packet.submissionTool + '`. Only an accepted submission completes this task.'].join('\n');
      if (previous.schema === 'ramify-agent.harness-operation/1' && originalTask?.text !== legacyTask) throw new Error('Conflicting harness session correlation');
      if (!retained || canonical.sections.some(section => !retained.sections.some(old => old.key === section.key && old.text === section.text)) ||
        !previous.packet.message.includes(input.brief.objective) || input.brief.sections.some(section => !retained.sections.some(old => old.key === section.key && old.text === section.text && (old.source ?? null) === (section.source ?? null)))) throw new Error('Conflicting harness session correlation');
    }
    const originalSections = input.brief.sections;
    const selected = prior?.history.find(entry => entry.revision === prior.revision) ?? null;
    // Selector forks retain known facts; other callers declare structural withdrawals.
    const sections = [...originalSections, ...(selected?.sections ?? []).filter(section => !['goal', 'requirements'].includes(section.key) && !originalSections.some(current => current.key === section.key))
      .map(section => input.brief.retainInheritedSections && spec.role === 'context-selector' && spec.session.mode === 'fork'
        ? section : { key: section.key, text: '', effect: 'remove' as const })];
    const current = previous ? previous.context.history.find(entry => entry.revision === previous.context.revision)! : createBriefingOccurrence({ previous: selected,
      operationId, sections: taskBriefingRevision({ revision: 'construction', goal: input.brief.goal, requirements: input.brief.requirements, sections }).sections });
    const revision = current.revision;
    const history = previous ? [...previous.context.history] : [...(prior?.history ?? [])];
    if (!history.some(entry => entry.revision === revision)) history.push(current);
    const builtins = input.spec.builtinTools;
    const builtinDeclarations = this.agent.builtinDeclarations?.(builtins, spec.scope.workingDirectory) ?? piBuiltinDeclarations(builtins, spec.scope.workingDirectory);
    const packet = previous ? previous.packet : buildTaskPacket({ loaded: input.loaded, ...input.brief,
      environment: { ...input.brief.environment, workingDirectory: spec.scope.workingDirectory, availableTools: [...builtinDeclarations.map(tool => tool.name), ...spec.tools.map(tool => tool.name), spec.submission.name] },
      briefing: buildBriefingDelivery({ mode: spec.session.mode, current, inheritedRevision: prior?.revision ?? null, history }),
      inheritedPoint: sourceRef ? sessionPointReference(runId, sourceRef.point) : null, inherited: prior?.inherited ?? [],
      supplyRoleInstructions: !prior?.inherited.some(item => item.key === `role:${input.loaded.role}` && item.kind === 'role-instructions'),
    });
    if (packet.submissionTool !== spec.submission.name) throw new Error(`Task packet ${packet.submissionTool} does not bind current validator ${spec.submission.name}`);
    const policy: SessionExecutionPolicy = { context: spec.context, authority: input.authority, validator: input.validator, destination: input.destination };
    const task: SessionTaskInput = previous ? previous.task : { role: spec.role, message: packet.message, submissionTool: packet.submissionTool,
      environment: { workingDirectory: spec.scope.workingDirectory, candidate: input.brief.environment.candidate, snapshot: input.brief.environment.snapshot, limits: input.brief.environment.limits },
      policyIdentity: exactInputHash(JSON.stringify(policy)), validatorIdentity: exactInputHash(JSON.stringify(input.validator)), destinationIdentity: exactInputHash(JSON.stringify(input.destination)) };
    const declarations = [...builtinDeclarations, ...spec.tools.map(({ name, description, inputSchema, mutating }) => ({ name, description, inputSchema, mutating: mutating ?? false })), packet.declaration];
    if (previous && (JSON.stringify(policy) !== JSON.stringify(previous.policy) || JSON.stringify(declarations) !== JSON.stringify(previous.declarations) || spec.role !== previous.task.role)) throw new Error('Restored authority, validator, destination or declarations differ from original operation');
    const intent: Intent = previous ? previous : { schema: 'ramify-agent.harness-operation/2', runId, operationId, session: input.session, source: sourceRef?.point ?? null,
      requestHash: exactInputHash(JSON.stringify(input.brief)), mode: spec.session.mode, packet, context: { inherited: [...(prior?.inherited ?? []), ...packet.additions], history, revision }, policy, task, declarations };
    await this.retain(path, intent);
    await input.prepared?.(packet);
    let identified: string | null = null;
    const identify = async (identity: SessionExecutionIdentity) => {
      const key = JSON.stringify(identity);
      if (identified === key) return;
      await input.identified?.(identity); identified = key;
    };
    // These executable closures belong to this invocation. Serialized inputs are fixed independently.
    const bindings: SessionExecutionBindings = { prepared: identify, task: intent.task, policy: intent.policy, tools: spec.tools,
      submission: { name: spec.submission.name, accept: async (value, signal) => {
        if (signal.aborted) return { accepted: false, errors: ['The operation was stopped'] };
        const verdict = await spec.submission.accept(value, signal);
        if (verdict.accepted && input.accepted) await this.retain(this.path('acceptances', [runId, operationId]), { runId, operationId, input: value, destination: intent.policy.destination, validator: intent.policy.validator, ...input.accepted() });
        return verdict;
      } },
      currentAuthority: async () => input.currentAuthority(), guard: spec.guard, afterMutation: spec.afterMutation, onEvent: spec.onEvent, publish: async () => undefined };
    let handle;
    let initialPoint: AgentSessionPoint | null = sourceRef?.point ?? null;
    const engineIntent = previous ? await this.operations.operationIdentity(runId, operationId) : null;
    if (engineIntent) {
      await identify(engineIntent);
      handle = await this.operations.retry({ runId, operationId, bindings });
    } else {
      if (spec.session.mode !== 'continue') {
        const receipt = spec.session.mode === 'fresh'
          ? await this.operations.create({ runId, operationId: `${operationId}:create`, initialInstructions: packet.roleInstructions, declarations, activate: declarations.map(item => item.name), policy })
          : await this.operations.fork({ runId, operationId: `${operationId}:fork`, sourcePoint: sourceRef!.point });
        if (spec.session.mode === 'fork' && receipt.status === 'unavailable' && receipt.contextUnavailable === true) throw new ReusableSessionUnavailableError(receipt.reason ?? 'Fork source unavailable');
        if (receipt.status !== 'completed' || !receipt.point) throw new Error(receipt.reason ?? `Session creation/fork ${receipt.status}`);
        initialPoint = receipt.point;
      }
      if (!initialPoint) throw new Error('Session point unavailable');
      const inherited = await this.operations.inspect(runId, initialPoint.sessionId, initialPoint);
      if (!inherited) {
        if (spec.session.mode !== 'fresh') throw new ReusableSessionUnavailableError('Retained session state unavailable');
        throw new Error('New session state unavailable');
      }
      const additions = spec.session.mode !== 'fresh' ? packet.additions.filter(item => item.kind === 'role-instructions').map(item => ({ key: `role:${operationId}:${item.key}`, kind: 'role-instructions' as const, text: item.text, revision: item.revision })) : [];
      handle = await this.operations.continue({ runId, operationId, sessionId: initialPoint.sessionId, expectedPoint: initialPoint,
        task, additions, policy, bindings, toolChange: { add: declarations,
          activate: declarations.map(item => item.name), inactivate: inherited.activeTools.filter(name => !declarations.some(item => item.name === name)) } });
    }
    const barrierKey = JSON.stringify([runId, operationId]);
    const observeBarrier = () => {
      const barrier = handle.settled();
      this.pending.add(barrier);
      void barrier.then(() => { this.pending.delete(barrier); this.unconfirmed.delete(barrierKey); }, () => { this.pending.delete(barrier); this.unconfirmed.add(barrierKey); });
      return barrier;
    };
    let barrier = observeBarrier();
    let ref = initialPoint ? sessionPointReference(runId, initialPoint) : '';
    let unavailableReason: string | undefined;
    const outcome = handle.receipt.then(async receipt => {
      if (spec.session.mode !== 'fresh' && receipt.status === 'unavailable' && receipt.contextUnavailable === true) unavailableReason = receipt.reason ?? 'Retained session unavailable';
      if (receipt.point && await this.operations.inspect(runId, receipt.point.sessionId, receipt.point)) { await this.retain(this.path('points', [runId, receipt.point]), { ...intent.context, point: receipt.point }); ref = sessionPointReference(runId, receipt.point); }
      else ref = '';
      return receipt.outcome ?? { kind: 'failed' as const, error: receipt.reason ?? `Session operation ${receipt.status}` };
    });
    const settled = async (): Promise<'settled' | 'timed-out'> => {
      if (this.unconfirmed.has(barrierKey)) barrier = observeBarrier();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { return await Promise.race([barrier.then(() => 'settled' as const), new Promise<'timed-out'>(resolve => { timer = setTimeout(() => resolve('timed-out'), settleMs); })]); }
      finally { clearTimeout(timer); }
    };
    return { outcome, start: { mode: spec.session.mode }, get ref() { return ref; }, get unavailableReason() { return unavailableReason; },
      async stop() {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([handle.stop().then(() => settled()), new Promise<void>(resolve => { timer = setTimeout(resolve, settleMs); })]); }
        finally { clearTimeout(timer); }
      }, settled };
  }
  /**
   * Append a brief to the session holding `ref`. A stale `ref` is retried once
   * against the session's current point, so two appends recorded against one
   * point both land; a session with an active operation is a conflict the
   * caller carries, and only an unreadable session is lost.
   */
  async append(ref: string, key: string, text: string, briefingSectionKey?: string): Promise<AppendOutcome> {
    const parsed = readSessionPointReference(ref);
    if (!parsed) return { outcome: 'session-lost' };
    const { runId } = parsed; const { sessionId } = parsed.point;
    let point = parsed.point;
    let context: Context;
    try { context = await this.context(runId, point); }
    catch (error) { if (error instanceof ReusableSessionUnavailableError) return { outcome: 'session-lost' }; throw error; }
    const operationId = `append:${sessionId}:${key}`;
    const appendPath = this.path('appends', [runId, operationId]);
    type AppendIntent = { point: AgentSessionPoint; context: Context; input: DeliveredInput; text: string; sectionKey: string | null };
    let retained = await this.read<AppendIntent>(appendPath);
    if (retained && (retained.text !== text || retained.sectionKey !== (briefingSectionKey ?? null))) throw new Error('Conflicting harness session correlation');
    const snapshot = await this.operations.inspect(runId, sessionId);
    const wasPresent = snapshot?.additions.some(addition => addition.key === key) === true;
    // The durable engine record also covers pre-migration appends and a crash before
    // the harness recorded completion. Replay its original admitted bytes and point.
    const original = await this.store.read(runId, `operation:${operationId}`);
    const originalInput = original?.body['input'] as AppendSessionContextInput | undefined;
    if (!retained && originalInput) {
      if (originalInput.runId !== runId || originalInput.operationId !== operationId || originalInput.sessionId !== sessionId || originalInput.additions.length !== 1) throw new Error('Invalid original append identity');
      const addition = originalInput.additions[0]!;
      if (addition.key !== key || (addition.text !== text && addition.text !== renderBlockSet(`brief:${briefingSectionKey}`, text))) throw new Error('Conflicting harness session correlation');
      const replay = await this.operations.appendContext(originalInput);
      if (replay.status !== 'completed' || !replay.point) throw new Error(replay.reason ?? `Context append ${replay.status}`);
      const recorded = await this.read<Context>(this.path('points', [runId, replay.point]));
      if (recorded) return { outcome: 'already-present', ref: sessionPointReference(runId, replay.point) };
      point = originalInput.expectedPoint;
      context = await this.context(runId, point);
    }
    const prepare = (base: Context): AppendIntent => {
      let history = base.history; let revision = base.revision;
      if (briefingSectionKey !== undefined) {
        const previous = history.find(item => item.revision === revision);
        if (!previous) throw new Error('Appended briefing section has no captured revision');
        const existing = previous.sections.findIndex(section => section.key === briefingSectionKey);
        const sections = [...previous.sections];
        const section = { key: briefingSectionKey, text };
        if (existing === -1) sections.push(section); else sections[existing] = section;
        const current = createBriefingOccurrence({ previous, operationId, sections });
        revision = current.revision;
        if (revision !== previous.revision) history = [...history, current];
      }
      const delivered: DeliveredInput = { key: `append:${key}`, kind: 'brief', text: originalInput?.additions[0]?.text ?? (briefingSectionKey === undefined ? text : renderBlockSet(`brief:${briefingSectionKey}`, text)), source: null,
        revision: originalInput ? originalInput.additions[0]!.revision : briefingSectionKey === undefined ? null : revision,
        ...(briefingSectionKey === undefined || originalInput?.additions[0]?.text === text ? {} : { block: { key: `brief:${briefingSectionKey}`, effect: 'set' as const } }) };
      return { point: base.point, context: { ...base, history, revision }, input: delivered, text, sectionKey: briefingSectionKey ?? null };
    };
    const attempt = async (intent: AppendIntent) => {
      // A rejected CAS has admitted no append. Each proposal is immutable at its
      // own source point; only the accepted proposal becomes the replay intent.
      await this.retain(this.path('append-proposals', [runId, operationId, intent.point]), intent);
      return this.operations.appendContext({ runId, operationId, sessionId, expectedPoint: intent.point,
        additions: [{ key, kind: 'brief', text: intent.input.text, revision: intent.input.revision }] });
    };
    retained ??= prepare(context);
    let receipt = await attempt(retained);
    if (receipt.status === 'conflict' && original === null) {
      const current = await this.operations.inspect(runId, sessionId);
      if (current && current.activeOperation === null && JSON.stringify(current.currentPoint) !== JSON.stringify(retained.point)) {
        try { context = await this.context(runId, current.currentPoint); }
        catch (error) { if (error instanceof ReusableSessionUnavailableError) return { outcome: 'session-lost' }; throw error; }
        retained = prepare(context);
        receipt = await attempt(retained);
      }
    }
    if (receipt.status === 'conflict') return { outcome: 'conflict', reason: receipt.reason ?? 'The session cannot take the addition at this point' };
    if (receipt.status === 'unavailable' && receipt.contextUnavailable === true) return { outcome: 'session-lost' };
    if (receipt.status !== 'completed' || !receipt.point) throw new Error(receipt.reason ?? `Context append ${receipt.status}`);
    await this.retain(appendPath, retained);
    const already = await this.read<Context>(this.path('points', [runId, receipt.point]));
    if (already === null) await this.retain(this.path('points', [runId, receipt.point]), { ...retained.context, point: receipt.point,
      inherited: [...retained.context.inherited, retained.input] });
    return { outcome: already === null && !wasPresent ? 'appended' : 'already-present', ref: sessionPointReference(runId, receipt.point) };
  }
}

/** Request equipment cancellation without letting an ignored signal evade the captured bound. */
export async function settleSessionEquipment(settle: (() => Promise<void>) | undefined, boundMs: number): Promise<boolean> {
  if (!settle) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([settle().then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), boundMs); })]); }
  finally { clearTimeout(timer); }
}
