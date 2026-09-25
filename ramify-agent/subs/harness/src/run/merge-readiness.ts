import type { z } from 'zod';
import {
  assessmentCoverage,
  assessedCandidateMatches,
  type Assessment,
  type Candidate,
} from '../../subs/nonfunctional/src/interfaces/contracts.js';
import { deviationOriginSchema, type MergeReadiness } from './nonfunctional-records.js';

type DeviationOrigin = z.infer<typeof deviationOriginSchema>;

/** Facts authenticated by the run adapter from committed records and CheckFinding replay. */
export interface ReadinessDeviation {
  readonly origin: DeviationOrigin;
  readonly checkFinding: string;
  readonly findingRevision: number;
  /** Revision is the resulting revision of the current user answer, not its considered revision. */
  readonly decision: { readonly standing: 'accepted' | 'rejected'; readonly revision: number } | null;
}

export interface MergeReadinessInput {
  readonly completed: boolean;
  readonly candidate: Candidate | null;
  readonly finalGate: {
    readonly id: string;
    readonly tree: string;
    readonly assessment: string;
    readonly passed: boolean;
  } | null;
  /** Null means the fixed catalog is unavailable; [] is an explicit empty catalog. */
  readonly nfrIds: readonly string[] | null;
  readonly assessment: Assessment | null;
  readonly deviations: readonly ReadinessDeviation[];
}

/** Derive review standing without changing the recorded final-gate verdict. */
export function projectMergeReadiness(input: MergeReadinessInput): MergeReadiness {
  const checkFindings = [...new Set(input.deviations.map(item => item.checkFinding))];
  const result = (status: MergeReadiness['status'], reason: string): MergeReadiness => ({
    status,
    candidate: input.candidate,
    finalGate: input.finalGate?.id ?? null,
    checkFindings,
    reason,
  });

  if (input.finalGate?.passed === false) return result('gate-failed', 'The required final gate failed');
  if (!input.completed) return result('unavailable', 'The run has not completed');
  if (input.candidate === null || input.finalGate === null || input.assessment === null || input.nfrIds === null) {
    return result('unavailable', 'The candidate, final gate, catalog or assessment is unavailable');
  }
  if (!input.finalGate.passed || input.finalGate.tree !== input.candidate.tree
    || input.finalGate.assessment !== input.assessment.id
    || !assessedCandidateMatches(input.assessment, input.candidate.tree)) {
    return result('unavailable', 'The final gate and assessment do not bind the current candidate');
  }
  if (new Set(input.nfrIds).size !== input.nfrIds.length || assessmentCoverage(input.assessment, input.nfrIds).length > 0) {
    return result('unavailable', 'The assessment does not cover the fixed catalog exactly once');
  }

  const resultByNfr = new Map(input.assessment.results.map(item => [item.nfr, item]));
  const deviationsByNfr = new Map<string, ReadinessDeviation[]>();
  for (const item of input.deviations) {
    if (item.origin.kind !== 'nonfunctional-assessment') continue;
    if (item.origin.assessment !== input.assessment.id
      || item.origin.candidate.tree !== input.candidate.tree
      || item.origin.coordinatorInvocation !== input.assessment.coordinatorInvocation) {
      return result('unavailable', `The deviation for ${item.origin.nfr} names another assessment or candidate`);
    }
    const group = deviationsByNfr.get(item.origin.nfr) ?? [];
    group.push(item);
    deviationsByNfr.set(item.origin.nfr, group);
  }
  for (const [nfr, assessmentResult] of resultByNfr) {
    const linked = deviationsByNfr.get(nfr) ?? [];
    if (assessmentResult.result === 'satisfied') {
      if (linked.length > 0) return result('unavailable', `A satisfied ${nfr} has a conflicting deviation`);
      continue;
    }
    if (linked.length !== 1) return result('unavailable', `${nfr} requires exactly one current deviation`);
  }
  for (const nfr of deviationsByNfr.keys()) {
    if (!resultByNfr.has(nfr)) return result('unavailable', `The deviation for ${nfr} is outside the fixed catalog`);
  }
  if (new Set(input.deviations.map(item => item.checkFinding)).size !== input.deviations.length) {
    return result('unavailable', 'A CheckFinding is linked to more than one deviation');
  }
  for (const item of input.deviations) {
    if (!Number.isInteger(item.findingRevision) || item.findingRevision < 1
      || (item.decision !== null && item.decision.revision !== item.findingRevision)) {
      return result('unavailable', `The decision for ${item.checkFinding} is not at its current revision`);
    }
  }
  if (input.deviations.some(item => item.decision?.standing === 'rejected')) {
    return result('rejected', 'A plan deviation was rejected for this candidate');
  }
  if (input.deviations.some(item => item.decision === null)) {
    return result('pending-review', 'A plan deviation awaits user review');
  }
  return result('ready', 'The final gate passed and every fixed obligation is satisfied or accepted at this revision');
}
