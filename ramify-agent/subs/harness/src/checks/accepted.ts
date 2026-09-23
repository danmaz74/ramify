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
 * The audited hash of the latest passed committing checkpoint, or of the
 * commit that materialized the feature files, in committed event order. The
 * run's base is returned only until neither exists.
 */
export function acceptedCommit(entries: readonly AcceptedBoundaryLine[], base: string): string {
  let accepted = base;
  for (const entry of entries) {
    const event = entry.transaction.event;
    if (event.type === 'scenarios-materialized') {
      // The harness's own commit of the feature files is accepted as it is
      // made: no gate runs over it, and the next iteration starts from it.
      const commit = (event.data as { readonly commit?: unknown }).commit;
      if (typeof commit === 'string') accepted = commit;
      continue;
    }
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
