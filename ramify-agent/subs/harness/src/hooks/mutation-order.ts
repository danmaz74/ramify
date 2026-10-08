import { resolve } from 'node:path';

/** Observed changed paths, uncertainty, or an operation refused before execution. */
export type MutationChange =
  | { readonly kind: 'known'; readonly paths: readonly string[] }
  | { readonly kind: 'unknown'; readonly reason: string }
  | { readonly kind: 'refused'; readonly reason: string };

/** A complete file/content-identity inventory, or an observation that cannot prove no change. */
export type MutationSnapshot =
  | { readonly kind: 'complete'; readonly scopeIdentity: string; readonly files: Readonly<Record<string, string>> }
  | { readonly kind: 'unknown'; readonly reason: string };

/** Only comparable complete observations can establish an empty mutation set. */
export function changesBetween(before: MutationSnapshot, after: MutationSnapshot): MutationChange {
  if (before.kind === 'unknown') return before;
  if (after.kind === 'unknown') return after;
  if (before.scopeIdentity !== after.scopeIdentity) return { kind: 'unknown', reason: 'mutation snapshot scopes differ' };
  const paths = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])]
    .filter(path => before.files[path] !== after.files[path]).sort();
  return { kind: 'known', paths };
}

/** A worktree lock retained until mutation, checks and observation settlement all finish. */
export class MutationLease {
  private held = true;

  constructor(readonly worktree: string, private readonly finish: () => void) {}

  assertHeld(worktree: string): void {
    if (!this.held || this.worktree !== resolve(worktree)) throw new Error('mutation lease is not held for this worktree');
  }

  /** Denial, cancellation and thrown handlers release through the same idempotent path. */
  release(): void {
    if (!this.held) return;
    this.held = false;
    this.finish();
  }
}

interface WaitingMutation {
  readonly signal: AbortSignal | undefined;
  readonly accept: (lease: MutationLease) => void;
  readonly refuse: (error: Error) => void;
  readonly cancel: () => void;
}

interface WorktreeQueue {
  held: boolean;
  readonly waiting: WaitingMutation[];
}

function aborted(): Error {
  const error = new Error('mutation cancelled before execution');
  error.name = 'AbortError';
  return error;
}

/** FIFO ordering by canonical worktree identity; independent worktrees share no lock. */
export class MutationOrder {
  private readonly queues = new Map<string, WorktreeQueue>();

  /** Callers use the same resolved project root, including when their cwd is a module src. */
  acquire(worktree: string, signal?: AbortSignal): Promise<MutationLease> {
    const key = resolve(worktree);
    if (signal?.aborted) return Promise.reject(aborted());
    const queue = this.queues.get(key) ?? { held: false, waiting: [] };
    this.queues.set(key, queue);
    return new Promise((accept, refuse) => {
      const pending: WaitingMutation = {
        signal, accept, refuse,
        cancel: () => {
          const index = queue.waiting.indexOf(pending);
          if (index < 0) return; // An active action owns cancellation and settlement.
          queue.waiting.splice(index, 1);
          signal?.removeEventListener('abort', pending.cancel);
          refuse(aborted());
          if (!queue.held && queue.waiting.length === 0) this.queues.delete(key);
        },
      };
      queue.waiting.push(pending);
      signal?.addEventListener('abort', pending.cancel, { once: true });
      this.advance(key, queue);
    });
  }

  async run<T>(worktree: string, action: (lease: MutationLease) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const lease = await this.acquire(worktree, signal);
    try {
      signal?.throwIfAborted();
      return await action(lease);
    } finally {
      lease.release();
    }
  }

  private advance(key: string, queue: WorktreeQueue): void {
    if (queue.held) return;
    const next = queue.waiting.shift();
    if (next === undefined) {
      this.queues.delete(key);
      return;
    }
    next.signal?.removeEventListener('abort', next.cancel);
    if (next.signal?.aborted) {
      next.refuse(aborted());
      this.advance(key, queue);
      return;
    }
    queue.held = true;
    next.accept(new MutationLease(key, () => {
      queue.held = false;
      this.advance(key, queue);
    }));
  }
}

/** Default process-local order; integrations may inject one with their run lifetime. */
export const sharedMutationOrder = new MutationOrder();
