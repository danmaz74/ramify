import type { AgentEvent, AgentPort, AgentSession, ContextPolicy, SessionOutcome } from '../../subs/agent/src/interfaces/port.js';
import { activityOf } from '../jobs/activity.js';
import type { InvocationTranscript } from '../transcripts/recorder.js';
import type { ExcursionWatcher } from './excursions.js';
import type { ObservationLog } from './observations.js';
import type { InvocationOutcome } from './records.js';

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
export class PortEventRecorder {
  private readonly calls = new Map<string, string>();
  readonly usage: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  private usageObserved = false;
  private contextObserved = false;
  /** Port callbacks are synchronous, so their durable writes run on this ordered tail. */
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly options: PortEventRecorderOptions) {}

  /** The identifier of the call in flight for one tool, as the port last reported it. */
  callId(tool: string): string {
    return this.calls.get(tool) ?? '';
  }

  get usageSeen(): boolean {
    return this.usageObserved;
  }

  /** Records one event. What is counted is counted before its ordered durable write. */
  record(event: AgentEvent): Promise<void> {
    // The transcript queues its own entry in order; a failed write there is
    // its own coverage gap and never this observation's failure.
    this.options.transcript?.event(event);
    if (event.type === 'message' && event.role === 'assistant' && event.usage) {
      this.usageObserved = true;
      for (const part of ['input', 'output', 'cacheRead', 'cacheWrite', 'total'] as const) this.usage[part] += event.usage[part];
    }
    if (event.type === 'tool-started') this.calls.set(event.tool, event.callId);
    if (event.type === 'context-observed') this.contextObserved = true;
    const recordRejection = event.type === 'tool-finished' && !event.reachedTool
      ? this.options.judge.countImplementationRejection(event.callId, event.tool, event.errorText ?? 'the input was rejected before the tool ran')
      : undefined;

    const recording = this.pending.then(() => this.persist(event, recordRejection));
    // One failed observation is reported by the caller but does not prevent
    // later observations, or the drain, from reaching the end of the queue.
    this.pending = recording.catch(() => undefined);
    return recording;
  }

  /** Waits until every port event received so far has finished recording. */
  async drain(): Promise<void> {
    await this.pending;
  }

  private async persist(event: AgentEvent, recordRejection?: (() => Promise<void>) | undefined): Promise<void> {
    const { observations } = this.options;
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
    const activity = activityOf(event, this.options.projectRoot, this.options.projectRoot);
    if (activity) await observations.record({ type: 'activity', data: { activity } });
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

  /** Records what the session never reported: no context size, no usage. Silence is a gap, not room. */
  async recordGaps(agent: AgentPort): Promise<void> {
    const { observations } = this.options;
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
 * The policy's two bounds on one session: no port event for
 * `invocationIdleMs`, and `invocationAbsoluteMs` in all. Either asks the
 * session to stop and records the bound as its interruption. A session that
 * does not stop is waited for no longer than `writerSettleMs`; settlement is
 * what then says whether it is gone.
 */
export class InvocationBounds {
  private armed = false;
  private idleTimer: NodeJS.Timeout | undefined;
  private expired: () => void = () => undefined;
  private session: AgentSession | undefined;
  private reached: 'idle-timeout' | 'absolute-timeout' | undefined;

  constructor(private readonly limits: InvocationLimits) {}

  /** The bound that ended the session, if one did. */
  get interruption(): 'idle-timeout' | 'absolute-timeout' | undefined {
    return this.reached;
  }

  /** Every port event is activity: it resets the idle bound while the session is awaited. */
  touch(): void {
    if (!this.armed) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.expire('idle-timeout'), this.limits.invocationIdleMs);
  }

  /** The session's outcome, or `stopped` once a bound was reached and the settle wait ran out. */
  async outcome(session: AgentSession): Promise<SessionOutcome> {
    this.session = session;
    const expiry = new Promise<void>(resolve => { this.expired = resolve; });
    this.armed = true;
    this.touch();
    const absoluteTimer = setTimeout(() => this.expire('absolute-timeout'), this.limits.invocationAbsoluteMs);
    try {
      return await Promise.race([
        session.outcome,
        expiry.then(() => delay(this.limits.writerSettleMs)).then(() => ({ kind: 'stopped' as const })),
      ]);
    } finally {
      this.armed = false;
      clearTimeout(this.idleTimer);
      clearTimeout(absoluteTimer);
    }
  }

  private expire(bound: 'idle-timeout' | 'absolute-timeout'): void {
    if (this.reached !== undefined) return;
    this.reached = bound;
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
