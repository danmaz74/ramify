import { checkpointPolicies } from './checkpoint.js';
import type { GateAttempt } from './records.js';

/*
 * The accepted source boundary of one run. The ledger is the authority: a
 * branch head may be an attempt whose audit failed, while an unchanged retry
 * may accept that same commit without making another one.
 */

/** The part of a committed ledger line this query reads. */
export interface AcceptedBoundaryLine {
  readonly transaction: {
    readonly event: {
      readonly type: string;
      readonly data: unknown;
    };
    readonly records: ReadonlyArray<{ readonly body: unknown }>;
  };
}

/**
 * The audited hash of the latest passed committing checkpoint, in committed
 * event order. The run's base is returned only until no such attempt exists.
 */
export function acceptedCommit(entries: readonly AcceptedBoundaryLine[], base: string): string {
  let accepted = base;
  for (const entry of entries) {
    const event = entry.transaction.event;
    if (event.type !== 'gate-attempted') continue;
    const data = event.data as { readonly gate?: unknown; readonly verdict?: unknown };
    if (data.verdict !== 'passed' || typeof data.gate !== 'string') continue;
    const record = entry.transaction.records.find(candidate => {
      const body = candidate.body as Partial<GateAttempt> | null;
      return body?.schema === 'ramify-agent.gate-attempt/3' && body.id === data.gate;
    });
    const attempt = record?.body as Partial<GateAttempt> | null | undefined;
    if (attempt === null || attempt === undefined || attempt.checkpoint === undefined) continue;
    if (!checkpointPolicies[attempt.checkpoint].committing) continue;
    if (attempt.audited === null || attempt.audited === undefined) {
      throw new Error(`Passed committing gate ${data.gate} has no audited commit`);
    }
    accepted = attempt.audited;
  }
  return accepted;
}
