import { isAbsolute, relative, resolve } from 'node:path';
import type { AgentEvent, AgentPort, AgentSession, ContextPolicy, SessionOutcome } from '../../subs/agent/src/interfaces/port.js';
import type { SessionExecutionIdentity } from '../../subs/agent/src/interfaces/session-operations.js';
import { estimateRecordedCharge } from '../kpi/efficiency.js';
import type { ExplorationObservation } from '../kpi/exploration.js';
import { activityOf } from '../jobs/activity.js';
import type { InvocationTranscript } from '../transcripts/recorder.js';
import type { ExcursionWatcher } from './excursions.js';
import type { ObservationLog } from './observations.js';
import type { InvocationOutcome } from './records.js';
import { PausableDeadline } from './pausable-deadline.js';

/*
 * What one session's port events leave in its observation log and its
 * transcript. An implementation run and a standalone session record the
 * same observations and entries from the same events, so the same readers
 * work on both.
 */

/** Token usage summed over a session's messages. */
export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface PortEventRecorderOptions {
  readonly projectRoot: string;
  readonly invocation?: { readonly id: string; readonly role: string; readonly startedAt: string; readonly submissionTool: string; readonly declaredPaths: readonly string[] };
  /** Where the port resolves relative tool paths. Defaults to project root for readers. */
  readonly workingDirectory?: string | undefined;
  readonly observations: ObservationLog;
  /** Counts an input the implementation rejected before the tool ran toward the submission bound. */
  readonly judge: { countImplementationRejection(callId: string, tool: string, reason: string): () => Promise<void> };
  readonly excursions: ExcursionWatcher;
  readonly context: ContextPolicy;
  /** The invocation's transcript, which receives every event in the order it arrives. */
  readonly transcript?: InvocationTranscript | undefined;
}

/**
 * Records one session's port events: its usage, the call in flight for each
 * tool, context and compaction observations, the implementation's own input
 * rejections, activity and read excursions, and the transcript's entries.
 */
/** One tool call the session had started and not finished. */
export interface CallInFlight {
  readonly callId: string;
  readonly tool: string;
  /** How long it had run, at the moment asked about. */
  readonly runningMs: number;
}

export class PortEventRecorder {
  private readonly calls = new Map<string, string>();
  /** The calls started and not finished, with when each started, in epoch milliseconds. */
  private readonly open = new Map<string, { readonly tool: string; readonly startedAt: number }>();
  private said: string | null = null;
  readonly usage: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  private usageObserved = false;
  private contextObserved = false;
  /** Port callbacks are synchronous, so their durable writes run on this ordered tail. */
  private pending: Promise<void> = Promise.resolve();

  private identity: SessionExecutionIdentity | null = null;
  private readonly finishes = new Map<string, { event: Extract<AgentEvent, { type: 'tool-finished' }>; at: string | null }>();
  private readonly actions = new Map<string, Extract<AgentEvent, { type: 'tool-started' }>>();
  private milestone = false;
  constructor(private readonly options: PortEventRecorderOptions) {
    for (const row of options.observations.observations) {
      if (row.type === 'usage') { this.usageObserved = true; for (const part of ['input', 'output', 'cacheRead', 'cacheWrite', 'total'] as const) this.usage[part] += row.data.usage[part]; }
      if (row.type === 'milestone') this.milestone = true;
    }
  }
  identify(identity: SessionExecutionIdentity): void {
    if (this.identity !== null && JSON.stringify(this.identity) !== JSON.stringify(identity)) throw new Error('Observation execution identity changed');
    this.identity = identity;
  }

  /** The identifier of the call in flight for one tool, as the port last reported it. */
  callId(tool: string): string {
    return this.calls.get(tool) ?? '';
  }

  get usageSeen(): boolean {
    return this.usageObserved;
  }

  /** The tool calls started and not finished, oldest first, and how long each had run at `at`. */
  inFlight(at: number = Date.now()): CallInFlight[] {
    return [...this.open].map(([callId, call]) => ({ callId, tool: call.tool, runningMs: Math.max(0, at - call.startedAt) }));
  }

  /** The text of the session's last assistant message that had any; null where none had. */
  get lastText(): string | null {
    return this.said;
  }

  /** Records one event. What is counted is counted before its ordered durable write. */
  record(event: AgentEvent): Promise<void> {
    const admittedAt = new Date().toISOString();
    // The transcript queues its own entry in order; a failed write there is
    // its own coverage gap and never this observation's failure.
    const { execution: _execution, observation: _observation, replayed: _replayed, ...display } = event;
    this.options.transcript?.event(display);
    if (event.type === 'tool-started') {
      this.calls.set(event.tool, event.callId);
      this.open.set(event.callId, { tool: event.tool, startedAt: Date.now() });
    }
    if (event.type === 'tool-finished') this.open.delete(event.callId);
    if (event.type === 'message' && event.role === 'assistant') {
      const text = event.blocks.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('\n').trim();
      if (text !== '') this.said = text;
    }
    if (event.type === 'context-observed') this.contextObserved = true;
    const recordRejection = event.type === 'tool-finished' && !event.reachedTool
      ? this.options.judge.countImplementationRejection(event.callId, event.tool, event.errorText ?? 'the input was rejected before the tool ran')
      : undefined;

    const recording = this.pending.then(() => this.persist(event, admittedAt, recordRejection));
    // One failed observation is reported by the caller but does not prevent
    // later observations, or the drain, from reaching the end of the queue.
    this.pending = recording.catch(() => undefined);
    return recording;
  }

  /** Waits until every port event received so far has finished recording. */
  async drain(): Promise<void> {
    await this.pending;
  }

  private async persist(event: AgentEvent, admittedAt: string, recordRejection?: (() => Promise<void>) | undefined): Promise<void> {
    const { observations } = this.options;
    await this.efficiency(event, admittedAt);
    if (event.type === 'context-observed') {
      await observations.record({
        type: 'context',
        data: { tokens: event.tokens, window: event.window, threshold: this.options.context.budgetTokens },
      });
    } else if (event.type === 'compaction' && event.phase === 'ended') {
      await observations.record({
        type: 'compaction',
        data: {
          trigger: event.reason === 'manual' ? 'explicit' : event.reason,
          succeeded: event.aborted !== true,
          before: event.tokensBefore ?? null,
          after: event.tokensAfter ?? null,
        },
      });
    } else if (event.type === 'tool-finished' && !event.reachedTool) {
      // The implementation rejected the input before the tool ran. It
      // counts toward the same bound, and no message text is read.
      await recordRejection?.();
    }
    const activity = activityOf(event, this.options.workingDirectory ?? this.options.projectRoot, this.options.projectRoot);
    if (activity) await observations.record({ type: 'activity', data: { activity }, ...(event.observation?.sourceId ? { sourceId: event.observation.sourceId } : {}) });
    if (activity?.kind === 'read') {
      const excursion = this.options.excursions.observe(activity.path);
      if (excursion !== null) {
        await observations.record({
          type: 'excursion',
          data: { callId: activity.callId, module: excursion.module, firstEntry: excursion.firstEntry },
        });
      }
    }
  }

  private path(path: string): string {
    const absolute = isAbsolute(path) ? path : resolve(this.options.workingDirectory ?? this.options.projectRoot, path);
    return relative(this.options.projectRoot, absolute).split('\\').join('/') || '.';
  }
  private async efficiency(event: AgentEvent, admittedAt: string): Promise<void> {
    const { observations, invocation } = this.options;
    if (event.execution) this.identify(event.execution);
    const sourceId = event.observation?.sourceId;
    if (event.type === 'message' && event.role === 'assistant' && event.observation?.elapsedMs !== undefined) {
      await observations.record({ type: 'model-duration', ...(sourceId ? { sourceId } : {}), data: { elapsedMs: event.observation.elapsedMs } });
    }
    if (event.type === 'message' && event.role === 'assistant' && event.usage) {
      const supplied = event.observation?.charge;
      const estimated = supplied ? estimateRecordedCharge({ model: supplied.model, newInputTokens: event.usage.input, cachedInputTokens: event.usage.cacheRead,
        cacheWriteTokens: event.usage.cacheWrite, outputTokens: event.usage.output, ratesPerMillion: supplied.ratesPerMillion }) : null;
      const charge = estimated && supplied ? { ...estimated, ratesPerMillion: { ...estimated.ratesPerMillion }, coverage: [...estimated.coverage], sourceRevision: supplied.sourceRevision } : null;
      const written = await observations.record({ type: 'usage', data: { usage: event.usage, charge, modelElapsedMs: event.observation?.elapsedMs ?? null }, ...(sourceId ? { sourceId } : {}) });
      if (written) { this.usageObserved = true; for (const part of ['input', 'output', 'cacheRead', 'cacheWrite', 'total'] as const) this.usage[part] += event.usage[part]; }
      if (!sourceId) await observations.record({ type: 'coverage-gap', data: { kind: 'usage-unavailable', detail: 'Usage is an unkeyed observed subtotal; replay identity unavailable' } });
    } else if (event.type === 'message' && event.role === 'assistant' && event.observation?.coverage?.some(reason => reason.includes('usage'))) {
      await observations.record({ type: 'coverage-gap', ...(sourceId ? { sourceId } : {}), data: { kind: 'usage-unavailable', detail: event.observation.coverage.join('; ') } });
    }
    if (!invocation || !this.identity) return;
    if (event.type === 'tool-started') {
      this.actions.set(event.callId, event);
      const prior = observations.observations.find(row => row.type === 'tool-start' && row.data.callId === event.callId);
      const startedAt = prior?.type === 'tool-start' ? prior.data.startedAt : event.replayed ? null : event.observation?.at ?? admittedAt;
      const action = event.action;
      const requested = action.kind === 'read' ? [this.path(action.path)] : action.kind === 'search' ? [this.path(action.path ?? '.'), ...(action.glob ? [action.glob] : [])] : [];
      await observations.record({ type: 'tool-start', sourceId: `${event.callId}:start`, data: { callId: event.callId, tool: event.tool,
        kind: action.kind === 'read' || action.kind === 'search' ? action.kind : 'other', requestedScope: requested, startedAt } });
      // The first informed action: the designated submission, or an
      // engineer's first mutating call (an edit, a write, a mutating shell
      // command). A read or a search is exploration before it.
      if (!this.milestone && (event.tool === invocation.submissionTool || (invocation.role.includes('engineer') && action.kind !== 'harness' && event.mutating))) {
        const written = await observations.record({ type: 'milestone', sourceId: 'first-milestone', data: { kind: event.tool === invocation.submissionTool ? 'first-designated-submission' : 'first-engineering-action', at: startedAt } });
        if (written) this.milestone = true;
      }
    } else if (event.type === 'tool-finished') {
      const at = event.replayed ? null : event.observation?.at ?? admittedAt;
      const start = observations.observations.find(row => row.type === 'tool-start' && row.data.callId === event.callId);
      const startedAt = start?.type === 'tool-start' ? start.data.startedAt : null;
      await observations.record({ type: 'tool-duration', sourceId: `${event.callId}:duration`, data: { callId: event.callId, startedAt, endedAt: at,
        elapsedMs: event.replayed ? null : event.observation?.elapsedMs ?? (at !== null && startedAt !== null ? Math.max(0, Date.parse(at) - Date.parse(startedAt)) : null),
        coverage: event.replayed ? ['Known effect replay: original finish duration unavailable unless already recorded'] : [] } });
      this.finishes.set(event.callId, { event, at });
      if (event.observation?.returnedBytes !== undefined) await this.exploration(event.callId);
    } else if (event.type === 'message' && event.role === 'tool-result') {
      const text = event.blocks.filter(block => block.type === 'text').map(block => block.text).join('\n');
      await this.exploration(event.callId, { bytes: Buffer.byteLength(text), textOnly: event.blocks.every(block => block.type === 'text') });
    }
  }
  private async exploration(callId: string, result?: { bytes: number; textOnly: boolean }): Promise<void> {
    const { invocation, observations } = this.options;
    const finish = this.finishes.get(callId); const start = this.actions.get(callId);
    if (!finish || !start || !invocation || !this.identity || (start.action.kind !== 'read' && start.action.kind !== 'search')) return;
    const beginning = observations.observations.find(row => row.type === 'tool-start' && row.data.callId === callId);
    const startedAt = beginning?.type === 'tool-start' ? beginning.data.startedAt : null;
    const facts = finish.event.observation;
    const resolved = facts?.resolvedScope?.map(path => this.path(path)) ?? null;
    const files = facts?.files?.map(path => this.path(path)) ?? null;
    const roots = invocation.declaredPaths.map(path => this.path(path));
    const outside = resolved === null || roots.length === 0 ? null : resolved.some(path => !roots.some(root => root === '.' || path === root || path.startsWith(`${root}/`)));
    const coverage = [...(facts?.coverage ?? []), ...(finish.event.replayed ? ['Known effect replay; original finish/duration unavailable where not recorded'] : []),
      ...(sourceMissing(start) ? ['Producer source event key unavailable; call identity only'] : []), ...(result?.textOnly === false ? ['Non-text returned bytes unavailable'] : [])];
    const observation: ExplorationObservation = { id: `${invocation.id}:${callId}:${start.action.kind}`, invocationId: invocation.id, operationId: this.identity.operationId, role: invocation.role,
      sessionId: this.identity.sessionId, turn: this.identity.turn, callId, kind: start.action.kind,
      requestedScope: beginning?.type === 'tool-start' ? beginning.data.requestedScope : [], resolvedScope: resolved, files,
      returnedBytes: facts?.returnedBytes ?? result?.bytes ?? null, startedAt, endedAt: finish.at,
      elapsedMs: finish.event.replayed ? null : facts?.elapsedMs ?? (startedAt && finish.at ? Math.max(0, Date.parse(finish.at) - Date.parse(startedAt)) : null),
      outcome: facts?.outcome ?? (!finish.event.reachedTool ? 'refused' : finish.event.isError ? 'failed' : 'completed'),
      broad: start.action.kind === 'search' ? (beginning?.type === 'tool-start' ? beginning.data.requestedScope[0] === '.' || (start.action.glob?.includes('**') ?? false) : null) : false,
      outsideScope: outside, coverage };
    await observations.record({ type: 'exploration', sourceId: `${callId}:exploration`, data: { ...observation, requestedScope: [...observation.requestedScope], resolvedScope: observation.resolvedScope === null ? null : [...observation.resolvedScope], files: observation.files === null ? null : [...observation.files], coverage: [...observation.coverage] } });
    this.finishes.delete(callId);
  }

  /** Records what the session never reported: no context size, no usage. Silence is a gap, not room. */
  async recordGaps(agent: AgentPort): Promise<void> {
    const { observations } = this.options;
    for (const callId of [...this.finishes.keys()]) await this.exploration(callId);
    if (this.open.size > 0) await observations.record({ type: 'coverage-gap', data: { kind: 'observation-truncated', detail: `${this.open.size} tool calls have no observed finish; known subtotals only` } });
    if (!this.contextObserved) {
      await observations.record({
        type: 'coverage-gap',
        data: {
          kind: 'context-unavailable',
          detail: agent.support.context.available
            ? 'the session reported no context size at all, so no threshold could fire'
            : agent.support.context.reason,
        },
      });
    }
    if (!this.usageObserved) {
      await observations.record({
        type: 'coverage-gap',
        data: {
          kind: 'usage-unavailable',
          detail: agent.support.usage.available ? 'the session reported no usage' : agent.support.usage.reason,
        },
      });
    }
  }

  /** The usage an outcome records: the totals, or why there are none. */
  outcomeUsage(agent: AgentPort): InvocationOutcome['usage'] {
    return this.usageObserved
      ? { ...this.usage }
      : { unavailable: agent.support.usage.available ? 'the session reported no usage' : agent.support.usage.reason };
  }
}

/** The policy's bounds on one session, as its limits name them. */
export interface InvocationLimits {
  readonly invocationIdleMs: number;
  readonly invocationAbsoluteMs: number;
  readonly writerSettleMs: number;
}

/**
 * What a held command's own timeout is extended by before the idle bound
 * may fire: the time its tool still needs after the command ends, such as
 * the hook check after a shell call, and the command's own kill.
 */
export const commandHoldMarginMs = 60_000;

/**
 * The policy's two bounds on one session: no port event for
 * `invocationIdleMs`, and `invocationAbsoluteMs` in all. Either asks the
 * session to stop and records the bound as its interruption. A session that
 * does not stop is waited for no longer than `writerSettleMs`; settlement is
 * what then says whether it is gone.
 *
 * A command the harness runs for the session is the harness's work, not the
 * session's silence: while one is held, the idle bound cannot fire before the
 * command's own timeout and the margin have passed. The command's timeout
 * already bounds it, and the absolute bound is unchanged. Its release starts
 * the idle bound afresh.
 */
export class InvocationBounds {
  private armed = false;
  private idleTimer: NodeJS.Timeout | undefined;
  private expired: () => void = () => undefined;
  private session: AgentSession | undefined;
  private reached: 'idle-timeout' | 'absolute-timeout' | undefined;
  private readonly reachedListeners: Array<(bound: 'idle-timeout' | 'absolute-timeout') => void> = [];
  /** The time each held command may run until, with the margin. */
  private readonly holds = new Set<{ readonly until: number }>();
  private absolute: PausableDeadline | undefined;
  private readonly pendingAbsolutePauses = new Set<{ release?: () => void }>();
  private completed = false;

  constructor(private readonly limits: InvocationLimits, private readonly marginMs = commandHoldMarginMs) {}

  /** Calls `listener` at the moment a bound fires, before the session is asked to stop. */
  onReached(listener: (bound: 'idle-timeout' | 'absolute-timeout') => void): void {
    this.reachedListeners.push(listener);
  }

  /** The bound that ended the session, if one did. */
  get interruption(): 'idle-timeout' | 'absolute-timeout' | undefined {
    return this.reached;
  }

  /**
   * Every port event is activity: it resets the idle bound while the session
   * is awaited. The bound fires no earlier than the last held command's
   * timeout and margin.
   */
  touch(): void {
    if (!this.armed) return;
    clearTimeout(this.idleTimer);
    const now = Date.now();
    const held = Math.max(0, ...[...this.holds].map(hold => hold.until - now));
    this.idleTimer = setTimeout(() => this.expire('idle-timeout'), Math.max(this.limits.invocationIdleMs, held));
  }

  /**
   * Holds the idle bound for one command the harness runs for the session,
   * for that command's own timeout and the margin. The returned release is
   * called once the command has ended; the idle bound then starts afresh.
   */
  hold(timeoutMs: number): () => void {
    const entry = { until: Date.now() + timeoutMs + this.marginMs };
    this.holds.add(entry);
    this.touch();
    return () => {
      if (!this.holds.delete(entry)) return;
      this.touch();
    };
  }

  /** Machine test lock waiting spends no invocation running budget. */
  pauseAbsoluteForTestLock(): () => void {
    if (this.completed) return () => undefined;
    const pause = { release: this.absolute?.pause() };
    this.pendingAbsolutePauses.add(pause);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.pendingAbsolutePauses.delete(pause);
      pause.release?.();
    };
  }

  /** The session's outcome, or `stopped` once a bound was reached and the settle wait ran out. */
  async outcome(session: AgentSession): Promise<SessionOutcome> {
    this.session = session;
    const expiry = new Promise<void>(resolve => { this.expired = resolve; });
    this.armed = true;
    this.touch();
    const absolute = new PausableDeadline(this.limits.invocationAbsoluteMs);
    this.absolute = absolute;
    for (const pause of this.pendingAbsolutePauses) pause.release = absolute.pause();
    const onAbsolute = () => this.expire('absolute-timeout');
    absolute.signal.addEventListener('abort', onAbsolute, { once: true });
    try {
      return await Promise.race([
        session.outcome,
        expiry.then(() => delay(this.limits.writerSettleMs)).then(() => ({ kind: 'stopped' as const })),
      ]);
    } finally {
      this.armed = false;
      clearTimeout(this.idleTimer);
      absolute.signal.removeEventListener('abort', onAbsolute);
      absolute.dispose();
      this.absolute = undefined;
      for (const pause of this.pendingAbsolutePauses) pause.release = undefined;
      this.pendingAbsolutePauses.clear();
      this.completed = true;
    }
  }

  private expire(bound: 'idle-timeout' | 'absolute-timeout'): void {
    if (this.reached !== undefined) return;
    this.reached = bound;
    for (const listener of this.reachedListeners) {
      try {
        listener(bound);
      } catch {
        // What a listener observes is never the bound's concern.
      }
    }
    void this.session?.stop().catch(() => undefined);
    this.expired();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** How a session ended, from the port's outcome and whether its submission bound was reached. */
export function endedOf(kind: string, boundReached: boolean): InvocationOutcome['ended'] {
  if (kind === 'submitted') return 'submitted';
  if (kind === 'context-budget-reached') return 'context-budget-reached';
  if (kind === 'failed') return 'failed';
  if (kind === 'stopped') return 'stopped';
  return boundReached ? 'invalid-submission' : 'ended';
}

function sourceMissing(event: AgentEvent): boolean { return !event.observation?.sourceId; }
