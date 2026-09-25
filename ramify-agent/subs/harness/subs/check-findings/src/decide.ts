import {
  checkFindingCommandSchema, checkFindingEventVersion,
  type CheckFindingChange, type CheckFindingCommand, type CheckFindingDecision, type CheckFindingDecisionInput,
  type CheckFindingEntry, type CheckFindingEvent, type CheckFindingId, type CheckFindingRejection,
  type CheckFindingRejectionCode, type CheckFindingRelationInput, type CheckFindingReport,
  type CheckFindingReportInput, type CheckFindingState,
} from './interfaces/check-findings.js';
import {
  checkFindingId, decisionId, ingestionKey, issueKeyMatches, relationId, reportId, sameObligation, sameOwner,
  sameSource, scopedIssueKey,
} from './identity.js';
import { applyCheckFindingEvent } from './replay.js';
import { currentRelations, sameIssueGroups } from './groups.js';

/*
 * Decisions: validate one command against the current state and the trusted
 * references the harness supplied, and return the events it commits or the
 * exact reason it is refused. The harness calls this under its run mutex with
 * the state replayed from the accepted log, and commits the events it returns
 * in one transaction. Nothing here authenticates an actor or an authority;
 * it checks that the transition, the revision and the evidence fit.
 */

function reject(code: CheckFindingRejectionCode, message: string): { readonly ok: false; readonly rejection: CheckFindingRejection } {
  return { ok: false, rejection: { code, message } };
}

function accepted(events: CheckFindingEvent[], touched: CheckFindingId[], replayed = false): CheckFindingChange {
  return { ok: true, events, replayed, touched: [...new Set(touched)] };
}

/**
 * Validates a command against the state and returns the events that commit
 * it, or the refusal. The state is never changed; the returned events apply
 * to it in order.
 */
export function decideCheckFindingChange(state: CheckFindingState, input: CheckFindingCommand): CheckFindingChange {
  const parsed = checkFindingCommandSchema.safeParse(input);
  if (!parsed.success) return reject('invalid-command', parsed.error.issues.map(issue => `${issue.path.join('.') || '(command)'}: ${issue.message}`).join('; '));
  const command = parsed.data;
  switch (command.type) {
    case 'report': return decideReport(state, command.report);
    case 'dispose': return decideDisposal(state, command.checkFinding, command.expectedRevision, command.decision);
    case 'relate': return decideRelation(state, command.relation);
    case 'assess': return decideAssessment(state, command.commands);
  }
}

// Reports.

function decideReport(state: CheckFindingState, report: CheckFindingReportInput): CheckFindingChange {
  const delivered = state.ingested.get(ingestionKey(report));
  if (delivered !== undefined) {
    if (delivered.contentHash === report.contentHash) return accepted([], [delivered.checkFinding], true);
    return reject('report-key-conflict', `${report.producer} attempt ${report.attempt} report ${report.reportKey} was accepted as ${delivered.report} with ${delivered.contentHash}; this delivery carries ${report.contentHash}`);
  }
  if (report.observation.kind === 'review-concern' && (report.judgment === null || report.verification.kind !== 'assessment')) {
    return reject('invalid-report', 'a review concern carries its judgment and is verified by assessment');
  }
  if ((report.observation.kind === 'plan-deviation' || report.observation.kind === 'environment-problem')
    && (report.judgment === null || report.verification.kind !== 'assessment' || report.credibility !== 'agent-generated' || report.owner.kind !== 'run')) {
    return reject('invalid-report', `a ${report.observation.kind === 'plan-deviation' ? 'plan deviation' : 'environment problem'} is the run's, carries the architect's judgment, is verified by assessment and is agent-generated`);
  }
  if (report.observation.kind === 'check-failed' && report.verification.kind !== 'check') {
    return reject('invalid-report', 'a failed check is verified by a check of its obligation');
  }
  if (report.verification.kind === 'check' && report.verification.producer !== report.producer) {
    return reject('invalid-report', `a ${report.producer} report cannot name ${report.verification.producer} as the producer that verifies it`);
  }
  if ((report.observation.kind === 'check-failed') !== (report.credibility === 'objective')) {
    return reject('invalid-report', 'a failed check is objective, and a review concern is credited by its ground');
  }
  if (report.observation.kind === 'review-concern' && (report.judgment?.ground === null) !== (report.credibility === 'ungrounded')) {
    return reject('invalid-report', 'a review concern is ungrounded exactly when its judgment names no ground');
  }
  if (report.suggests !== null && !state.findings.has(report.suggests)) {
    return reject('unknown-check-finding', `the report suggests ${report.suggests}, which is no CheckFinding`);
  }
  const next = { ...report, id: reportId(state.counters.reports + 1) };
  if (report.issueKey !== null) {
    const matches = issueKeyMatches(state, scopedIssueKey(report.owner, report.verification, report.issueKey));
    if (matches.length > 1) {
      return reject('ambiguous-issue-key', `issue key ${report.issueKey} names ${matches.map(entry => entry.id).join(', ')}; a report attaches to exactly one`);
    }
    const [match] = matches;
    if (match !== undefined) return attach(state, match, next);
  }
  const id = checkFindingId(state.counters.findings + 1);
  return accepted([{ type: 'check-finding-opened', data: { version: checkFindingEventVersion, checkFinding: id, revision: 1, report: next } }], [id]);
}

/**
 * Attaches a report to the CheckFinding its issue key names. A closed one is
 * reopened when the report contradicts what closed it: any report after a
 * check fixed it, or a report on another source than the closing decision
 * considered. A report on the same source adds evidence without reopening,
 * a waiver is never reopened by a report, and a deferral stays deferred.
 */
function attach(state: CheckFindingState, entry: CheckFindingEntry, report: CheckFindingReport): CheckFindingChange {
  const events: CheckFindingEvent[] = [{
    type: 'check-finding-reported',
    data: { version: checkFindingEventVersion, checkFinding: entry.id, revision: entry.revision + 1, report },
  }];
  const closing = entry.standing === 'closed' ? entry.decisions.find(decision => decision.id === entry.settledBy) : undefined;
  const contradicts = closing !== undefined && closing.decision.action !== 'waive'
    && (closing.decision.action === 'fix-by-check' || !sameSource(closing.source, report.source));
  if (closing !== undefined && contradicts) {
    const decision: CheckFindingDecision = {
      id: decisionId(state.counters.decisions + 1),
      considered: entry.revision + 1,
      actor: { kind: 'harness', reason: `report ${report.id} of the same issue key contradicts ${closing.id}` },
      source: report.source,
      rationale: closing.decision.action === 'fix-by-check'
        ? `${report.producer} observed the obligation fail again after ${closing.id} fixed it`
        : `${report.producer} reported the issue on a source other than the one ${closing.id} considered`,
      evidence: report.observation.evidence,
      communication: { mode: 'quiet' },
      decision: { action: 'reopen', cause: { kind: 'report', report: report.id } },
    };
    events.push({ type: 'check-finding-decided', data: { version: checkFindingEventVersion, checkFinding: entry.id, revision: entry.revision + 2, decision } });
  }
  return accepted(events, [entry.id]);
}

// Dispositions.

function decideDisposal(state: CheckFindingState, id: CheckFindingId, expectedRevision: number, input: CheckFindingDecisionInput): CheckFindingChange {
  const entry = state.findings.get(id);
  if (entry === undefined) return reject('unknown-check-finding', `${id} is no CheckFinding`);
  if (entry.revision !== expectedRevision) return reject('stale-revision', `the decision considered ${id} at revision ${expectedRevision}, but it is at ${entry.revision}`);
  const action = input.decision;
  if (entry.pendingUserDecision !== null && action.action !== 'answer-user-decision' && !acceptsDeviation(entry, input)) {
    return reject('awaiting-user-decision', `${id} awaits the user's answer to ${entry.pendingUserDecision}`);
  }
  const refusal = refusalOf(entry, input);
  if (refusal !== null) return refusal;
  const decision: CheckFindingDecision = { ...input, id: decisionId(state.counters.decisions + 1), considered: entry.revision };
  return accepted([{ type: 'check-finding-decided', data: { version: checkFindingEventVersion, checkFinding: id, revision: entry.revision + 1, decision } }], [id]);
}

/**
 * A person's waiver of a plan deviation or an environment problem that
 * awaits their decision: it is the answer the request asks for, accepting
 * the deviation or resuming the run, so it settles the request with it. No
 * one else settles a request by waiving.
 */
function acceptsDeviation(entry: CheckFindingEntry, input: CheckFindingDecisionInput): boolean {
  return input.decision.action === 'waive' && input.actor.kind === 'user' && awaitsThePerson(entry);
}

/** Whether a CheckFinding records a departure from the plan or an environment problem: the run's, for the person to answer. */
function awaitsThePerson(entry: Pick<CheckFindingEntry, 'reports'>): boolean {
  const kind = entry.reports[0]?.observation.kind;
  return kind === 'plan-deviation' || kind === 'environment-problem';
}

/** Why this action does not fit the CheckFinding, its evidence or its authority, or null. */
function refusalOf(entry: CheckFindingEntry, input: CheckFindingDecisionInput): CheckFindingChange | null {
  const action = input.decision;
  const id = entry.id;
  const { standing, verification } = entry;

  // Where each action may start from.
  if (action.action === 'reopen') {
    if (standing === 'open') return reject('invalid-transition', `${id} is open; only a closed or deferred CheckFinding is reopened`);
    if (entry.reason === 'waived') return reject('waived', `${id} is waived; only a revocation of ${entry.settledBy} reopens it`);
  } else if (action.action === 'revoke-waiver') {
    if (entry.reason !== 'waived') return reject('not-waived', `${id} is ${standing} (${entry.reason}), not waived; there is no waiver to revoke`);
  } else if (action.action === 'supersede' || action.action === 'waive') {
    if (standing === 'closed') return reject('invalid-transition', `${id} is closed (${entry.reason}); reopen it before a new disposition`);
  } else if (standing !== 'open') {
    return reject('invalid-transition', `${id} is ${standing} (${entry.reason}); ${action.action} applies to an open CheckFinding`);
  }

  switch (action.action) {
    case 'plan-repair':
    case 'claim-repair':
    case 'reopen':
    case 'revoke-waiver':
      return null;
    case 'fix-by-check': {
      if (verification.kind !== 'check') return reject('verification-kind-mismatch', `${id} is verified by assessment, not by a check`);
      const witness = action.witness;
      if (witness.producer !== verification.producer) return reject('producer-mismatch', `${id} is verified by ${verification.producer}; the witness is from ${witness.producer}`);
      if (witness.obligation.subject !== verification.obligation.subject) {
        return reject('wrong-subject', `${id} is verified by ${verification.obligation.subject}; the witness ran ${witness.obligation.subject}`);
      }
      if (!sameObligation(witness.obligation, verification.obligation)) {
        return reject('obligation-changed', `${id} is verified by ${verification.obligation.subject} at revision ${verification.obligation.revision}; the witness ran revision ${witness.obligation.revision}`);
      }
      if (witness.selection !== verification.selection) {
        return reject('incomparable-inputs', `${id} is verified with selection ${verification.selection}; the witness ran ${witness.selection}`);
      }
      if (!sameSource(witness.source, action.candidate)) {
        return reject('source-mismatch', `the witness ran on ${witness.source.kind} ${witness.source.id}, not on the acceptance candidate ${action.candidate.kind} ${action.candidate.id}`);
      }
      const failed = [...entry.reports].reverse().find(report => report.observation.kind === 'check-failed');
      if (failed !== undefined && sameSource(failed.source, witness.source)) {
        return reject('failure-source', `the witness passed on ${witness.source.id}, where ${failed.id} observed the failure; that is intermittent evidence, not a repair`);
      }
      if (witness.coverage === 'not-run') return reject('not-executed', `the witness did not execute ${witness.obligation.subject}`);
      if (witness.coverage !== 'complete') return reject('insufficient-coverage', `the witness executed ${witness.obligation.subject} only in part`);
      if (witness.outcome !== 'passed') return reject('not-passed', `the witness ${witness.outcome === 'failed' ? 'failed' : 'was inconclusive'}`);
      return null;
    }
    case 'fix-by-assessment':
    case 'supersede': {
      if (verification.kind !== 'assessment') {
        return action.action === 'supersede'
          ? reject('factual-obligation', `${id} carries a factual obligation; a judgment cannot supersede it`)
          : reject('verification-kind-mismatch', `${id} is verified by a check, not by assessment`);
      }
      const unknown = action.reassessed.find(report => !entry.reports.some(held => held.id === report));
      if (unknown !== undefined) return reject('unknown-report', `${unknown} is no report of ${id}`);
      return null;
    }
    case 'waive':
    case 'defer':
      if (verification.kind === 'check' && verification.required) {
        return reject('required-obligation', `${id} is an obligation of a required check; ${action.action === 'waive' ? 'waiving' : 'deferring'} it would evade it; its gate decides it`);
      }
      return null;
    case 'request-user-decision': {
      const ids = action.options.map(option => option.id);
      if (new Set(ids).size !== ids.length) return reject('invalid-command', 'every option of a user decision has its own ID');
      return null;
    }
    case 'answer-user-decision': {
      if (entry.pendingUserDecision === null || entry.pendingUserDecision !== action.request) {
        return reject('no-pending-user-decision', `${id} awaits ${entry.pendingUserDecision ?? 'no user decision'}, not ${action.request}`);
      }
      if (input.actor.kind !== 'user') return reject('insufficient-authority', `only a user answers ${action.request}`);
      const request = entry.decisions.find(decision => decision.id === action.request);
      const options = request?.decision.action === 'request-user-decision' ? request.decision.options : [];
      if (!options.some(option => option.id === action.option)) return reject('unknown-option', `${action.request} offers no option ${action.option}`);
      return null;
    }
    case 'revise-obligation':
      if (verification.kind !== 'check') return reject('verification-kind-mismatch', `${id} has no check obligation to revise`);
      if (!sameObligation(action.from, verification.obligation)) {
        return reject('obligation-changed', `${id} is verified by ${verification.obligation.subject} at revision ${verification.obligation.revision}, not the obligation the revision names`);
      }
      if (sameObligation(action.from, action.to)) return reject('invalid-command', 'an obligation revision names a different obligation');
      if (action.authority.kind === 'work-item-assessment') {
        return reject('insufficient-authority', 'an obligation is revised under an answered user decision or a governing record');
      }
      return null;
  }
}

// Relations.

function decideRelation(state: CheckFindingState, relation: CheckFindingRelationInput): CheckFindingChange {
  const [from, to] = [relation.from, relation.to].map(side => state.findings.get(side.checkFinding));
  for (const [side, entry] of [[relation.from, from], [relation.to, to]] as const) {
    if (entry === undefined) return reject('unknown-check-finding', `${side.checkFinding} is no CheckFinding`);
    if (entry.revision !== side.revision) return reject('stale-revision', `the relation considered ${side.checkFinding} at revision ${side.revision}, but it is at ${entry.revision}`);
  }
  if (from === undefined || to === undefined) return reject('unknown-check-finding', 'the relation names no CheckFinding');
  if (from.id === to.id) return reject('relation-self', `a relation names two CheckFindings, not ${from.id} twice`);
  if (!sameOwner(from.owner, to.owner)) {
    return reject('cross-owner', `${from.id} and ${to.id} have different owners; their common coordination scope decides the relation`);
  }
  if (relation.relation === 'same-issue') {
    const current = currentRelations(state.relations).filter(held => !isPair(held, from.id, to.id));
    const grouped = sameIssueGroups(current).some(group => group.members.includes(from.id) && group.members.includes(to.id));
    const already = currentRelations(state.relations).some(held => isPair(held, from.id, to.id) && held.relation === 'same-issue');
    if (grouped || already) return reject('relation-cycle', `${from.id} and ${to.id} already belong to one same-issue group`);
  }
  const id = relationId(state.counters.relations + 1);
  const related: CheckFindingEvent = { type: 'check-finding-related', data: { version: checkFindingEventVersion, relation: { ...relation, id } } };
  const applied = applyCheckFindingEvent(state, related);
  if (!applied.ok) return { ok: false, rejection: applied.rejection };
  const waived = relation.relation === 'same-issue' ? waiveJoined(state, applied.state, from.id, relation) : [];
  return accepted([related, ...waived.map(entry => entry.event)], [from.id, to.id, ...waived.map(entry => entry.checkFinding)]);
}

/**
 * A same-issue relation that joins open CheckFindings to a group whose
 * canonical is waived settles them too: the harness waives each newly joined
 * open member under the canonical's waiver, so a re-raise of a waived issue
 * stays settled. A member that awaits a user's answer, or carries a required
 * check's obligation, is left open: no waiver may evade either.
 */
function waiveJoined(
  before: CheckFindingState,
  after: CheckFindingState,
  member: CheckFindingId,
  relation: CheckFindingRelationInput,
): Array<{ readonly checkFinding: CheckFindingId; readonly event: CheckFindingEvent }> {
  const group = sameIssueGroups(after.relations).find(held => held.members.includes(member));
  const canonical = group === undefined ? undefined : after.findings.get(group.canonical);
  if (group === undefined || canonical === undefined || canonical.reason !== 'waived') return [];
  const waiver = canonical.decisions.find(decision => decision.id === canonical.settledBy);
  if (waiver === undefined || waiver.decision.action !== 'waive') return [];
  const earlier = sameIssueGroups(before.relations).find(held => held.members.includes(canonical.id))?.members ?? [canonical.id];
  const events: Array<{ readonly checkFinding: CheckFindingId; readonly event: CheckFindingEvent }> = [];
  let current = after;
  for (const id of group.members) {
    const entry = current.findings.get(id);
    if (entry === undefined || earlier.includes(id) || entry.standing !== 'open' || entry.pendingUserDecision !== null) continue;
    if (entry.verification.kind === 'check' && entry.verification.required) continue;
    const decision: CheckFindingDecision = {
      id: decisionId(current.counters.decisions + 1),
      considered: entry.revision,
      actor: { kind: 'harness', reason: `${id} joins ${canonical.id}, which ${waiver.id} waived` },
      source: relation.source,
      rationale: `The same-issue relation joins ${id} to ${canonical.id}; a re-raised waived issue stays waived under ${waiver.id} until that waiver is revoked`,
      evidence: relation.evidence,
      communication: { mode: 'quiet' },
      decision: { action: 'waive', authority: { kind: 'governing-record', ref: waiver.id }, acceptedRisk: entry.risk, uncertainty: waiver.decision.uncertainty },
    };
    const event: CheckFindingEvent = { type: 'check-finding-decided', data: { version: checkFindingEventVersion, checkFinding: id, revision: entry.revision + 1, decision } };
    const applied = applyCheckFindingEvent(current, event);
    // The decision follows the state it was derived from, so replay accepts it.
    if (!applied.ok) throw new Error(`the waiver of ${id} does not follow its state: ${applied.rejection.message}`);
    current = applied.state;
    events.push({ checkFinding: id, event });
  }
  return events;
}

function isPair(relation: CheckFindingRelationInput, a: CheckFindingId, b: CheckFindingId): boolean {
  const { from, to } = relation;
  return (from.checkFinding === a && to.checkFinding === b) || (from.checkFinding === b && to.checkFinding === a);
}

// Assessments.

/** Decides each command against the state the earlier ones leave; one refusal refuses them all. */
function decideAssessment(state: CheckFindingState, commands: Extract<CheckFindingCommand, { type: 'assess' }>['commands']): CheckFindingChange {
  let current = state;
  const events: CheckFindingEvent[] = [];
  const touched: CheckFindingId[] = [];
  for (const [index, command] of commands.entries()) {
    const decided = command.type === 'dispose'
      ? decideDisposal(current, command.checkFinding, command.expectedRevision, command.decision)
      : decideRelation(current, command.relation);
    if (!decided.ok) return { ok: false, rejection: { ...decided.rejection, index } };
    for (const event of decided.events) {
      const applied = applyCheckFindingEvent(current, event);
      if (!applied.ok) return { ok: false, rejection: { ...applied.rejection, index } };
      current = applied.state;
      events.push(event);
    }
    touched.push(...decided.touched);
  }
  return accepted(events, touched);
}
