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

  constructor(private readonly options: PortEventRecorderOptions) {}

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
    // The transcript queues its own entry in order; a failed write there is
    // its own coverage gap and never this observation's failure.
    this.options.transcript?.event(event);
    if (event.type === 'message' && event.role === 'assistant' && event.usage) {
      this.usageObserved = true;
      for (const part of ['input', 'output', 'cacheRead', 'cacheWrite', 'total'] as const) this.usage[part] += event.usage[part];
    }
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
