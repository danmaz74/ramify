import type {
  CheckFindingActor, CheckFindingCommand, CheckFindingEntry, CheckFindingRejection,
} from '../../subs/check-findings/src/interfaces/check-findings.js';
import type { CheckFindingUserCommand } from '../interfaces/protocol/check-findings.js';
import type { ErrorCode } from '../interfaces/protocol/errors.js';
import { withinModule } from '../reviews/reconciliation.js';

/*
 * A person's CheckFinding commands (appendix §8), and the authority rules
 * the harness validates before the child decides (appendix §10). A user
 * command becomes one child `dispose` with the person as its actor, bound
 * to the revision the person saw; the child then decides it like any other.
 *
 * Authority: the user may waive any signal and revoke any waiver; the
 * global architect may waive for the project; a local architect only a
 * signal whose modules all lie within its own module. A revocation needs a
 * rank at least the waiver's actor's: user, then global architect, then
 * local architect, then the harness. A required check is waived by no one:
 * the child refuses it whoever asks.
 */

/** Where an actor stands for waiving and revoking: higher decides over lower. */
export function authorityRank(actor: CheckFindingActor): number {
  if (actor.kind === 'user') return 3;
  if (actor.kind === 'harness') return 0;
  if (actor.role === 'global-architect') return 2;
  if (actor.role === 'local-architect') return 1;
  return -1;
}

/** Whether `actor` may waive a signal of these modules; `own` is a local architect's module. */
export function mayWaive(actor: CheckFindingActor, modules: readonly string[], own: string | null): boolean {
  const rank = authorityRank(actor);
  if (rank >= 2) return true;
  if (rank === 1) return own !== null && withinModule(own, modules);
  return false;
}

/** Whether `revoker` may revoke a waiver `waiver` made. */
export function mayRevoke(revoker: CheckFindingActor, waiver: CheckFindingActor): boolean {
  const rank = authorityRank(revoker);
  return rank >= 1 && rank >= authorityRank(waiver);
}

/** What a user command becomes: one child command, or a refusal with the protocol's code. */
export type UserCheckFindingChange =
  | { readonly ok: true; readonly command: CheckFindingCommand }
  | { readonly ok: false; readonly code: ErrorCode; readonly message: string; readonly evidence: readonly string[] };

/**
 * The child command a person's command asks for, against the CheckFinding
 * as the log now holds it. It refuses a CheckFinding that does not exist, a
 * revision that moved, a request that is no longer pending and a revocation
 * the person has no rank for; every other rule is the child's.
 */
export function userCheckFindingChange(command: CheckFindingUserCommand, entry: CheckFindingEntry | undefined): UserCheckFindingChange {
  const { checkFinding, expectedRevision, responder } = command.payload;
  if (entry === undefined) return refuse('not-found', `The run has no CheckFinding ${checkFinding}`, []);
  const current = [`${checkFinding} is at revision ${entry.revision}`];
  if (entry.revision !== expectedRevision) {
    return refuse('conflict', `${checkFinding} is at revision ${entry.revision}, not ${expectedRevision}: it changed since it was read`, current);
  }
  const actor: CheckFindingActor = { kind: 'user', name: responder };
  const latest = entry.reports.at(-1);
  if (latest === undefined) return refuse('internal', `${checkFinding} holds no report`, current);
  const base = {
    actor,
    source: latest.source,
    evidence: [{ kind: 'user-command', ref: command.commandId, hash: null }],
    communication: { mode: 'quiet' as const },
  };
  switch (command.type) {
    case 'respond-to-check-finding': {
      const { request, option, note } = command.payload;
      if (entry.pendingUserDecision !== request) {
        return refuse('conflict', `${request} is not the pending decision request of ${checkFinding}${entry.pendingUserDecision === null ? ', which awaits none' : `, which awaits ${entry.pendingUserDecision}`}`, current);
      }
      return dispose(checkFinding, expectedRevision, {
        ...base,
        rationale: note === undefined || note.trim() === '' ? `${responder} chose option ${option}` : note,
        decision: { action: 'answer-user-decision', request, option },
      });
    }
    case 'waive-check-finding':
      if (!mayWaive(actor, entry.modules, null)) return refuse('conflict', `${responder} may not waive ${checkFinding}`, current);
      return dispose(checkFinding, expectedRevision, {
        ...base,
        rationale: command.payload.reason,
        decision: {
          action: 'waive',
          authority: { kind: 'user-decision', ref: command.commandId },
          acceptedRisk: entry.risk,
          uncertainty: 'The person accepted the signal at its current risk; no new assessment was made',
        },
      });
    case 'revoke-check-finding-waiver': {
      const waiver = entry.decisions.find(decision => decision.id === entry.settledBy && decision.decision.action === 'waive');
      if (waiver !== undefined && !mayRevoke(actor, waiver.actor)) {
        return refuse('conflict', `${responder} may not revoke the waiver ${waiver.id}, which a higher authority made`, current);
      }
      return dispose(checkFinding, expectedRevision, {
        ...base,
        rationale: command.payload.reason,
        decision: { action: 'revoke-waiver', reason: command.payload.reason },
      });
    }
  }
}

/** The protocol code of a child refusal of a user command: an unknown option is the request's fault, the rest a conflict with the CheckFinding's state. */
export function userRejectionCode(rejection: CheckFindingRejection): ErrorCode {
  return rejection.code === 'unknown-option' || rejection.code === 'invalid-command' ? 'invalid-request' : 'conflict';
}

function dispose(checkFinding: string, expectedRevision: number, decision: Extract<CheckFindingCommand, { type: 'dispose' }>['decision']): UserCheckFindingChange {
  return { ok: true, command: { type: 'dispose', checkFinding, expectedRevision, decision } };
}

function refuse(code: ErrorCode, message: string, evidence: readonly string[]): UserCheckFindingChange {
  return { ok: false, code, message, evidence };
}
