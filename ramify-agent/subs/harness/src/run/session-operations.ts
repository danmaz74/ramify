import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AgentPort, AgentSession, AppendOutcome, SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import type { AgentSessionPoint, SessionExecutionIdentity, SessionExecutionBindings, SessionExecutionPolicy, SessionOperations, SessionTaskInput, SessionToolDeclaration } from '../../subs/agent/src/interfaces/session-operations.js';
import { piBuiltinDeclarations } from '../../subs/agent/subs/pi/src/session-operations.js';
import { writeFileExclusive } from '../../subs/ledger/src/atomic.js';
import { openSessionStore, type LedgerSessionStore } from './session-store.js';
import { buildTaskPacket, type TaskEnvironment, type TaskKind, type TaskPacket } from '../prompts/tasks.js';
import { buildBriefingDelivery, taskBriefingRevision, type BriefingRevision } from '../prompts/briefings.js';
import { exactInputHash, type DeliveredInput } from '../prompts/delivered-manifest.js';
import type { LoadedPackage } from '../prompts/packages.js';

export interface HarnessTaskBrief {
  readonly kind: TaskKind;
  readonly objective: string;
  readonly goal: string;
  readonly requirements: readonly string[];
  readonly sections: BriefingRevision['sections'];
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
  readonly schema: 'ramify-agent.harness-operation/1';
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
}
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
    if (!found || JSON.stringify(found.point) !== JSON.stringify(point)) throw new Error('The named session point has no recorded briefing ancestry');
    return found;
  }
  async packet(runId: string, operationId: string): Promise<TaskPacket | null> {
    const intent = await this.read<Intent>(this.path('operations', [runId, operationId]));
    if (!intent) return null;
    if (intent.schema !== 'ramify-agent.harness-operation/1' || intent.runId !== runId || intent.operationId !== operationId) throw new Error('Invalid harness operation identity');
    return intent.packet;
  }
  async acceptance(runId: string, operationId: string): Promise<{ readonly input: unknown; readonly value: unknown; readonly schema: string; readonly submissionHash: string; readonly destination: Readonly<Record<string, unknown>>; readonly validator: Readonly<Record<string, unknown>> } | null> {
    const found = await this.read<{ runId: string; operationId: string; input: unknown; value: unknown; schema: string; submissionHash: string; destination: Readonly<Record<string, unknown>>; validator: Readonly<Record<string, unknown>> }>(this.path('acceptances', [runId, operationId]));
    if (found && (found.runId !== runId || found.operationId !== operationId || typeof found.schema !== 'string' || !/^[a-f0-9]{64}$/u.test(found.submissionHash))) throw new Error('Invalid harness acceptance correlation');
    return found;
  }
  async start(input: HarnessOperationInput): Promise<AgentSession> {
    const { runId, operationId } = input;
    const path = this.path('operations', [runId, operationId]);
    const previous = await this.read<Intent>(path);
    if (input.restore && !previous) throw new Error('Original operation correlation unavailable');
    const spec = input.restore && previous ? { ...input.spec, scope: { workingDirectory: previous.task.environment.workingDirectory },
      session: previous.mode === 'fresh' ? { mode: 'fresh' as const } : previous.mode === 'continue'
        ? { mode: 'continue' as const, ref: sessionPointReference(runId, previous.source!) } : { mode: 'fork' as const, from: sessionPointReference(runId, previous.source!) } } : input.spec;
    const settleMs = input.brief.environment.limits['stopSettleMs'];
    if (typeof settleMs !== 'number' || !Number.isFinite(settleMs) || settleMs <= 0) throw new Error('Captured session settlement bound is required');
    const sourceRef = spec.session.mode === 'fresh' ? null : readSessionPointReference(spec.session.mode === 'continue' ? spec.session.ref : spec.session.from);
    if (spec.session.mode !== 'fresh' && (!sourceRef || sourceRef.runId !== runId)) throw new Error('The requested session point is unavailable; explicit workflow recovery is required');
    const prior = sourceRef ? await this.context(runId, sourceRef.point) : null;
    const originalSections = input.brief.sections;
    // A removed support section gets an explicit replacement. The recorded revision is never inferred from text.
    const sections = [...originalSections, ...(prior?.history.at(-1)?.sections ?? []).filter(section => !['goal', 'requirements'].includes(section.key) && !originalSections.some(current => current.key === section.key))
      .map(section => ({ key: section.key, text: `# Current briefing update\n${section.key} no longer applies to this task.` }))];
    const revision = exactInputHash(JSON.stringify([input.brief.goal, input.brief.requirements, sections]));
    const current = taskBriefingRevision({ revision, goal: input.brief.goal, requirements: input.brief.requirements, sections });
    const history = [...(prior?.history ?? [])];
    if (!history.some(entry => entry.revision === revision)) history.push(current);
    const builtins = input.spec.builtinTools;
    const builtinDeclarations = this.agent.builtinDeclarations?.(builtins, spec.scope.workingDirectory) ?? piBuiltinDeclarations(builtins, spec.scope.workingDirectory);
    const packet = input.restore && previous ? previous.packet : buildTaskPacket({ loaded: input.loaded, ...input.brief,
      environment: { ...input.brief.environment, availableTools: [...builtinDeclarations.map(tool => tool.name), ...spec.tools.map(tool => tool.name), spec.submission.name] },
      briefing: buildBriefingDelivery({ mode: spec.session.mode, current, inheritedRevision: prior?.revision ?? null, history }),
      inheritedPoint: sourceRef ? sessionPointReference(runId, sourceRef.point) : null, inherited: prior?.inherited ?? [],
      supplyRoleInstructions: !prior?.inherited.some(item => item.key === `role:${input.loaded.role}` && item.kind === 'role-instructions'),
    });
    if (packet.submissionTool !== spec.submission.name) throw new Error(`Task packet ${packet.submissionTool} does not bind current validator ${spec.submission.name}`);
    const policy: SessionExecutionPolicy = { context: spec.context, authority: input.authority, validator: input.validator, destination: input.destination };
    const task: SessionTaskInput = input.restore && previous ? previous.task : { role: spec.role, message: packet.message, submissionTool: packet.submissionTool,
      environment: { workingDirectory: spec.scope.workingDirectory, candidate: input.brief.environment.candidate, snapshot: input.brief.environment.snapshot, limits: input.brief.environment.limits },
      policyIdentity: exactInputHash(JSON.stringify(policy)), validatorIdentity: exactInputHash(JSON.stringify(input.validator)), destinationIdentity: exactInputHash(JSON.stringify(input.destination)) };
    const declarations = [...builtinDeclarations, ...spec.tools.map(({ name, description, inputSchema, mutating }) => ({ name, description, inputSchema, mutating: mutating ?? false })), packet.declaration];
    if (input.restore && previous && (JSON.stringify(policy) !== JSON.stringify(previous.policy) || JSON.stringify(declarations) !== JSON.stringify(previous.declarations) || spec.role !== previous.task.role)) throw new Error('Restored authority, validator, destination or declarations differ from original operation');
    const intent: Intent = input.restore && previous ? previous : { schema: 'ramify-agent.harness-operation/1', runId, operationId, session: input.session, source: sourceRef?.point ?? null,
      mode: spec.session.mode, packet, context: { inherited: [...(prior?.inherited ?? []), ...packet.additions], history, revision }, policy, task, declarations };
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
        if (receipt.status !== 'completed' || !receipt.point) throw new Error(receipt.reason ?? 'Session creation/fork is unavailable');
        initialPoint = receipt.point;
      }
      if (!initialPoint) throw new Error('Session point unavailable');
      const inherited = await this.operations.inspect(runId, initialPoint.sessionId, initialPoint);
      if (!inherited) throw new Error('Session state unavailable');
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
    const outcome = handle.receipt.then(async receipt => {
      if (receipt.point) { await this.retain(this.path('points', [runId, receipt.point]), { ...intent.context, point: receipt.point }); ref = sessionPointReference(runId, receipt.point); }
      else ref = '';
      return receipt.outcome ?? { kind: 'failed' as const, error: receipt.reason ?? `Session operation ${receipt.status}` };
    });
    const settled = async (): Promise<'settled' | 'timed-out'> => {
      if (this.unconfirmed.has(barrierKey)) barrier = observeBarrier();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { return await Promise.race([barrier.then(() => 'settled' as const), new Promise<'timed-out'>(resolve => { timer = setTimeout(() => resolve('timed-out'), settleMs); })]); }
      finally { clearTimeout(timer); }
    };
    return { outcome, start: { mode: spec.session.mode }, get ref() { return ref; },
      async stop() {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([handle.stop().then(() => settled()), new Promise<void>(resolve => { timer = setTimeout(resolve, settleMs); })]); }
        finally { clearTimeout(timer); }
      }, settled };
  }
  async append(ref: string, key: string, text: string, briefingSectionKey?: string): Promise<AppendOutcome> {
    const parsed = readSessionPointReference(ref);
    if (!parsed) return { outcome: 'session-lost' };
    const context = await this.context(parsed.runId, parsed.point);
    const operationId = `append:${parsed.point.sessionId}:${key}`;
    const snapshot = await this.operations.inspect(parsed.runId, parsed.point.sessionId);
    const wasPresent = snapshot?.additions.some(addition => addition.key === key) === true;
    const receipt = await this.operations.appendContext({ runId: parsed.runId, operationId, sessionId: parsed.point.sessionId, expectedPoint: parsed.point,
      additions: [{ key, kind: 'brief', text, revision: null }] });
    if (receipt.status !== 'completed' || !receipt.point) return { outcome: 'session-lost' };
    const already = await this.read<Context>(this.path('points', [parsed.runId, receipt.point]));
    let history = context.history; let revision = context.revision;
    if (briefingSectionKey !== undefined) {
      const previous = history.find(item => item.revision === revision);
      if (!previous) throw new Error('Appended briefing section has no captured revision');
      const sections = [...previous.sections.filter(section => section.key !== briefingSectionKey), { key: briefingSectionKey, text }];
      revision = exactInputHash(JSON.stringify(sections));
      history = [...history, { revision, sections }];
    }
    await this.retain(this.path('points', [parsed.runId, receipt.point]), { ...context, history, revision, point: receipt.point,
      inherited: [...context.inherited, { key: `append:${key}`, kind: 'brief', text, source: null, revision: null }] });
    return { outcome: already === null && !wasPresent ? 'appended' : 'already-present', ref: sessionPointReference(parsed.runId, receipt.point) };
  }
}

/** Request equipment cancellation without letting an ignored signal evade the captured bound. */
export async function settleSessionEquipment(settle: (() => Promise<void>) | undefined, boundMs: number): Promise<boolean> {
  if (!settle) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([settle().then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), boundMs); })]); }
  finally { clearTimeout(timer); }
}
