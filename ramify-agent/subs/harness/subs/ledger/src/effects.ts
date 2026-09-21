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
  readonly intent: Transaction<E>;
  readonly perform: (key: string) => Promise<R>;
  readonly complete: (result: R) => Transaction<E>;
}

/** An intent in the log whose completion is not, for the caller to perform again. */
export interface PendingEffect<E = unknown> {
  readonly key: string;
  readonly sequence: number;
  readonly at: string;
  readonly event: E;
}
