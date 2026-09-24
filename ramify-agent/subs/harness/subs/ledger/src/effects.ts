import type { Transaction } from './ledger.js';

/**
 * One effect outside the ledger, driven from intent to completion. `key` is
 * the idempotency key the caller hands the external system, so that
 * performing the effect a second time after a crash is a no-op there. The
 * ledger appends `intent`, calls `perform(key)`, and appends the transaction
 * `complete` builds from the result.
 */
export interface EffectSpec<E, R> {
  readonly key: string;
  /** The intent, or how to build it once the caller's serialization is held. */
  readonly intent: Transaction<E> | (() => Transaction<E>);
  readonly perform: (key: string) => Promise<R>;
  readonly complete: (result: R) => Transaction<E>;
  /**
   * The caller's own serialization, held while the intent is built and
   * appended and again while the completion is, but not while `perform`
   * runs. A caller whose other writers must not wait for a slow effect
   * passes it; without it, only the ledger's own append order applies.
   */
  readonly serialize?: (<T>(work: () => Promise<T>) => Promise<T>) | undefined;
}

/** An intent in the log whose completion is not, for the caller to perform again. */
export interface PendingEffect<E = unknown> {
  readonly key: string;
  readonly sequence: number;
  readonly at: string;
  readonly event: E;
}
