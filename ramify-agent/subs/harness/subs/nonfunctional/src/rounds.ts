import { assessmentCoverage, assessmentSchema, candidateSchema, roundSchema } from './interfaces/contracts.js';
import type { Assessment, Candidate } from './interfaces/contracts.js';
import type { z } from 'zod';

export type ClosedRound = z.infer<typeof roundSchema>;
export type Phase = Assessment['phase'];
export type Outcome = ClosedRound['outcome'];

/** Durable records are supplied by the harness; this owner never reads the ledger. */
export interface RoundDecisionInput {
  nfrIds: readonly string[];
  /** Captured policy limit, from one to three rounds. */
  maxRounds: number;
  closedRounds: readonly ClosedRound[];
  candidate: Candidate | null;
  initial: Assessment | null;
  investigated: boolean;
  repairCommitted: boolean;
  reassessment: Assessment | null;
  /** The harness has exhausted its bounded attempt to obtain matching evidence. */
  recoveryExhausted?: boolean;
}

export type RoundDecision =
  | { action: 'stop'; closedRounds: number; outcome: Outcome }
  | { action: 'prepare-candidate'; round: number; phase: Phase }
  | { action: 'assess'; round: number; phase: Phase }
  | { action: 'investigate'; round: number; undetermined: string[] }
  | { action: 'repair-or-close'; round: number; unresolved: string[]; closeOutcome: 'continue' | 'exhausted' }
  | { action: 'close'; round: number; outcome: 'satisfied' | 'continue' | 'exhausted'; unresolved: string[] }
  | { action: 'unavailable'; round: number };

function requireAssessment(
  assessment: Assessment,
  phase: Phase,
  round: number,
  nfrIds: readonly string[],
  candidate: Candidate | null,
): void {
  assessmentSchema.parse(assessment);
  if (assessment.phase !== phase || assessment.round !== round) {
    throw new Error(`assessment must be ${phase} in round ${round}`);
  }
  const coverage = assessmentCoverage(assessment, nfrIds);
  if (coverage.length > 0) throw new Error(`invalid NFR coverage: ${coverage.join(', ')}`);
  if (candidate && assessment.candidate.tree !== candidate.tree) {
    throw new Error('assessment candidate differs from prepared candidate');
  }
}

/** Decide the next permitted step from committed round facts and fixed NFR IDs. */
export function decideNonfunctionalRound(input: RoundDecisionInput): RoundDecision {
  const { nfrIds, maxRounds, closedRounds, candidate, initial, investigated, repairCommitted, reassessment } = input;
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 3) {
    throw new Error('maximum rounds must be an integer from one to three');
  }
  if (new Set(nfrIds).size !== nfrIds.length || nfrIds.some((id) => !/^nfr-\d{3,}$/.test(id))) {
    throw new Error('fixed NFR IDs must be unique and valid');
  }
  closedRounds.forEach((record, index) => {
    roundSchema.parse(record);
    if (record.number !== index + 1 || record.number > maxRounds) throw new Error('closed rounds must be consecutive and within the captured limit');
    if (Boolean(record.repair) !== Boolean(record.reassessment)) {
      throw new Error('closed repair requires reassessment, and reassessment requires repair');
    }
    if (index < closedRounds.length - 1 && record.outcome !== 'continue') {
      throw new Error('only a continuing round can have a successor');
    }
    if (record.number === maxRounds && record.outcome === 'continue') throw new Error('the final round cannot continue');
  });
  const lastOutcome = closedRounds.at(-1)?.outcome;
  if (closedRounds.length === maxRounds || (lastOutcome !== undefined && lastOutcome !== 'continue')) {
    if (candidate || initial || investigated || repairCommitted || reassessment) {
      throw new Error('a closed loop cannot have an open round');
    }
    return { action: 'stop', closedRounds: closedRounds.length, outcome: closedRounds.at(-1)!.outcome };
  }

  const round = closedRounds.length + 1;
  if (candidate) candidateSchema.parse(candidate);
  if (reassessment && !repairCommitted) throw new Error('reassessment requires a committed repair');
  if (repairCommitted && !initial) throw new Error('repair requires an initial assessment');
  if (initial && !repairCommitted && !candidate) throw new Error('initial assessment requires a prepared candidate');
  if (investigated && !initial) throw new Error('investigation requires an initial assessment');
  if (reassessment && !candidate) throw new Error('reassessment requires a prepared candidate');
  if (initial) requireAssessment(initial, 'initial', round, nfrIds, repairCommitted ? null : candidate);
  if (repairCommitted && initial?.results.some((result) => result.result === 'undetermined') && !investigated) {
    throw new Error('undetermined results require investigation before repair');
  }
  if (reassessment) requireAssessment(reassessment, 'after-repair', round, nfrIds, candidate);

  const missingEvidence = !candidate || !(repairCommitted ? reassessment : initial);
  if (missingEvidence && input.recoveryExhausted) return { action: 'unavailable', round };
  if (!candidate) return { action: 'prepare-candidate', round, phase: repairCommitted ? 'after-repair' : 'initial' };
  if (!initial) return { action: 'assess', round, phase: 'initial' };
  if (repairCommitted && !reassessment) return { action: 'assess', round, phase: 'after-repair' };

  const results = (reassessment ?? initial).results;
  const unresolved = results.filter((result) => result.result !== 'satisfied').map((result) => result.nfr);
  if (unresolved.length === 0) return { action: 'close', round, outcome: 'satisfied', unresolved };
  const closeOutcome = round === maxRounds ? 'exhausted' : 'continue';
  if (repairCommitted) return { action: 'close', round, outcome: closeOutcome, unresolved };
  const undetermined = results.filter((result) => result.result === 'undetermined').map((result) => result.nfr);
  if (undetermined.length > 0 && !investigated) return { action: 'investigate', round, undetermined };
  return { action: 'repair-or-close', round, unresolved, closeOutcome };
}

/** Call before committing a repair task; a completed batch has no second transition. */
export function requireRepairPermitted(input: RoundDecisionInput): number {
  const decision = decideNonfunctionalRound(input);
  if (decision.action !== 'repair-or-close') {
    throw new Error(`repair is not permitted while the next action is ${decision.action}`);
  }
  return decision.round;
}
