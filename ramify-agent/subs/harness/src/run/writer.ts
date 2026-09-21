import type { AgentSession } from '../../subs/agent/src/interfaces/port.js';
import type { InvocationOutcome } from './records.js';

/*
 * Writer ownership. One writer works at a time, and the run's log says which
 * invocation holds it: `writer-acquired` is appended before the writer
 * starts, and `writer-released` records whether the harness confirmed it
 * settled.
 *
 * Settlement is the harness's own observation: the session idle and its
 * registered process groups killed and gone. Neither `stop()` resolving nor
 * an agent's statement is evidence. A write that still arrives late cannot
 * touch an accepted commit; it shows as an uncommitted change and joins the
 * next commit.
 *
 * An unconfirmed release blocks every writer and every gate that follows:
 * a check run against a tree something may still be writing proves nothing.
 */

/** What the harness observed when a writer settled. */
export type Settlement = InvocationOutcome['settled'];

/** What the tree says changed since the last accepted commit. */
export interface TreeObserver {
  changed(): Promise<string[]>;
}

/** The operating system, as this module uses it. A test supplies its own. */
export interface ProcessGroups {
  /** Whether the process is still there. */
  alive(pid: number): boolean;
  /** Kills the whole group the process leads. */
  kill(pid: number): void;
}

export const nodeProcessGroups: ProcessGroups = {
  alive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  },
  kill(pid: number): void {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Gone already, which is what the caller is waiting for.
      }
    }
  },
};

/** A writer is held or a release was not confirmed; either blocks what follows. */
export class WriterBlockedError extends Error {
  constructor(readonly reason: 'held' | 'unsettled', message: string) {
    super(message);
    this.name = 'WriterBlockedError';
  }
}

export interface WriterOwnershipOptions {
  /** How long the harness waits for the registered process groups to be gone. */
  readonly settleMs: number;
  /** How often it looks again while it waits. */
  readonly pollMs?: number | undefined;
  readonly tree?: TreeObserver | undefined;
  readonly groups?: ProcessGroups | undefined;
  readonly now?: (() => Date) | undefined;
}

/**
 * The one writer of a run. It records nothing itself: the caller appends
 * `writer-acquired` before the writer starts and `writer-released` with what
 * this answered, so the log and the observation stay one transition apart
 * and never disagree.
 */
export class WriterOwnership {
  private holder: string | undefined;
  private unsettled: string | undefined;
  private readonly registered = new Map<string, Set<number>>();

  constructor(private readonly options: WriterOwnershipOptions) {}

  /** The invocation that holds the writer, if any. */
  get held(): string | undefined {
    return this.holder;
  }

  /** Why no writer and no gate may start, or `undefined` when they may. */
  get blocked(): string | undefined {
    if (this.unsettled !== undefined) return this.unsettled;
    if (this.holder !== undefined) return `Invocation ${this.holder} still holds the writer`;
    return undefined;
  }

  /** Whether a release was left unconfirmed, which nothing later clears. */
  get isUnsettled(): boolean {
    return this.unsettled !== undefined;
  }

  /**
   * Takes the writer for one invocation. A second acquisition without an
   * intervening release is a fault of the harness, not of the agent.
   */
  acquire(invocation: string): void {
    if (this.unsettled !== undefined) throw new WriterBlockedError('unsettled', this.unsettled);
    if (this.holder !== undefined) {
      throw new WriterBlockedError('held', `Invocation ${this.holder} holds the writer; ${invocation} cannot acquire it`);
    }
    this.holder = invocation;
    this.registered.set(invocation, new Set());
  }

  /**
   * Registers a process group the writer started. Every one of them must be
   * confirmed gone before the writer is settled; a group nobody registers is
   * a group nothing waits for.
   */
  register(invocation: string, pid: number): void {
    const groups = this.registered.get(invocation);
    if (groups === undefined) throw new Error(`Invocation ${invocation} does not hold the writer`);
    groups.add(pid);
  }

  /**
   * Settles the writer and answers what was observed. The session is asked to
   * be idle, every registered group is killed and confirmed gone, and the
   * tree is read before and after so that a write which still arrived is
   * recorded rather than lost.
   *
   * `confirmed` is true only when both hold. A session that did not become
   * idle within the port's own bound is not idle, whatever it reports, and a
   * group still alive at the harness's bound is not gone.
   */
  async release(invocation: string, session?: AgentSession | undefined): Promise<Settlement> {
    if (this.holder !== invocation) throw new Error(`Invocation ${invocation} does not hold the writer`);
    const now = this.options.now ?? (() => new Date());
    const groups = this.options.groups ?? nodeProcessGroups;
    const tree = this.options.tree;

    const idle = session === undefined ? 'settled' : await session.settled().catch(() => 'timed-out' as const);
    const before = tree === undefined ? [] : await tree.changed().catch(() => []);

    const pending = [...(this.registered.get(invocation) ?? [])];
    let killed = 0;
    for (const pid of pending) {
      if (groups.alive(pid)) groups.kill(pid);
    }
    const deadline = Date.now() + this.options.settleMs;
    const poll = this.options.pollMs ?? 20;
    let remaining = pending.filter(pid => groups.alive(pid));
    while (remaining.length > 0 && Date.now() < deadline) {
      await delay(poll);
      remaining = remaining.filter(pid => groups.alive(pid));
    }
    killed = pending.length - remaining.length;

    const after = tree === undefined ? [] : await tree.changed().catch(() => []);
    const seen = new Set(before);
    const lateWrites = after.filter(path => !seen.has(path));

    const confirmed = idle === 'settled' && remaining.length === 0;
    this.holder = undefined;
    this.registered.delete(invocation);
    if (!confirmed) {
      this.unsettled = remaining.length > 0
        ? `Invocation ${invocation} left ${remaining.length} process group${remaining.length === 1 ? '' : 's'} running; no writer and no gate may follow`
        : `Invocation ${invocation}'s session did not become idle within the implementation's bound; no writer and no gate may follow`;
    }
    return { confirmed, at: now().toISOString(), groupsKilled: killed, lateWrites };
  }

  /**
   * Records that one invocation's session could not be confirmed settled,
   * although it held no writer. A session whose tools may still be running
   * blocks what follows for the same reason a writer does: a check run
   * against such a tree proves nothing.
   */
  markUnsettled(invocation: string, reason: string): void {
    this.unsettled ??= `Invocation ${invocation} was not confirmed settled: ${reason}; no writer and no gate may follow`;
  }

  /** Refuses the caller while a writer is held or a release was not confirmed. */
  requireSettled(what: string): void {
    const reason = this.blocked;
    if (reason !== undefined) throw new WriterBlockedError(this.unsettled === undefined ? 'held' : 'unsettled', `${what}: ${reason}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms).unref());
}
