import type {
  CheckFindingDecision, CheckFindingEntry,
} from '../../subs/check-findings/src/interfaces/check-findings.js';
import { planDeviationOptions } from './finding.js';

/** A current, user-authorized choice about a run-owned plan deviation. */
export interface CurrentDeviationDecision {
  readonly standing: 'accepted' | 'rejected';
  /** The resulting finding revision, which the readiness projection must match. */
  readonly revision: number;
  readonly decisionId: string;
  /** The accepted user command carried by the decision's evidence. */
  readonly command: string;
  readonly source: CheckFindingDecision['source'];
  /** Only a current rejection states a requirement for a follow-up run. */
  readonly followUp: string | null;
}

/**
 * Normalize only the current replayed user answer or waiver. The caller must
 * independently bind this finding and source to the recorded deviation.
 * Historical answers, revoked waivers and generic closed status are not
 * acceptance of the current candidate.
 */
export function currentDeviationDecision(entry: CheckFindingEntry): CurrentDeviationDecision | null {
  if (entry.owner.kind !== 'run' || entry.reports[0]?.observation.kind !== 'plan-deviation') return null;
  const decision = entry.decisions.at(-1);
  const source = entry.reports.at(-1)?.source;
  if (decision === undefined || source === undefined || decision.actor.kind !== 'user'
    || decision.considered + 1 !== entry.revision
    || decision.source.kind !== source.kind || decision.source.id !== source.id) return null;
  const command = decision.evidence.find(item => item.kind === 'user-command')?.ref;
  if (command === undefined) return null;

  if (decision.decision.action === 'waive'
    && decision.decision.authority.kind === 'user-decision'
    && decision.decision.authority.ref === command
    && entry.standing === 'closed' && entry.reason === 'waived'
    && entry.settledBy === decision.id && entry.pendingUserDecision === null) {
    return { standing: 'accepted', revision: entry.revision, decisionId: decision.id,
      command, source: decision.source, followUp: null };
  }
  const action = decision.decision;
  if (action.action === 'answer-user-decision'
    && action.option === planDeviationOptions.reject
    && entry.decisions.some(prior => prior.id === action.request
      && prior.decision.action === 'request-user-decision'
      && prior.decision.options.some(option => option.id === planDeviationOptions.reject))
    && entry.standing === 'open' && entry.reason === 'user-decision-answered'
    && entry.pendingUserDecision === null && decision.rationale.trim() !== '') {
    return { standing: 'rejected', revision: entry.revision, decisionId: decision.id,
      command, source: decision.source, followUp: decision.rationale };
  }
  return null;
}
