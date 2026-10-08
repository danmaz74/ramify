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

/**
 * The final gate's audit as its attempt recorded it: what was requested,
 * what executed and what the provider composed, with each project's verdict.
 * Null when the attempt kept no audit.
 */
export interface FinalAuditFacts {
  readonly mode: 'project-default' | 'full';
  readonly nested: boolean;
  readonly status: 'completed' | 'failed' | 'cancelled' | 'refused';
  readonly executedMode: 'full' | 'ramify-partial' | null;
  readonly verdict: 'pass' | 'fail' | 'indeterminate' | null;
  readonly discovery: 'complete' | 'indeterminate' | null;
  readonly projects: readonly {
    readonly projectRoot: string;
    readonly verdict: 'pass' | 'fail' | 'indeterminate';
    readonly status: 'completed' | 'failed' | 'cancelled' | 'refused';
    readonly executedMode: 'full' | 'ramify-partial' | null;
  }[] | null;
}

export interface MergeReadinessInput {
  readonly completed: boolean;
  readonly candidate: Candidate | null;
  readonly finalGate: {
    readonly id: string;
    readonly tree: string;
    readonly assessment: string;
    readonly passed: boolean;
    readonly audit: FinalAuditFacts | null;
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
  // Final verification is a full audit of the configured suite with every
  // required nested project. A composed failure anywhere fails it; anything
  // short of a completed full nested pass leaves it unestablished, however
  // the run-local summary or the root alone answered.
  const audit = input.finalGate?.audit;
  if (input.finalGate !== null && input.finalGate !== undefined) {
    const failedProjects = (audit?.projects ?? []).filter(project => project.verdict === 'fail').map(project => project.projectRoot);
    if (audit?.verdict === 'fail' || failedProjects.length > 0) {
      return result('gate-failed', `The final audit composed a failure${failedProjects.length === 0 ? '' : ` in ${failedProjects.join(', ')}`}`);
    }
    const gap = finalAuditGap(audit ?? null);
    if (gap !== null) return result('unavailable', `The final gate has no applicable full nested audit pass: ${gap}`);
  }
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
  return result('ready', 'The final gate passed and every cataloged obligation is satisfied or accepted at this revision');
}

/** Why a final gate's audit does not establish a full nested pass, or null when it does. */
function finalAuditGap(audit: FinalAuditFacts | null): string | null {
  if (audit === null) return 'the attempt kept no audit';
  if (audit.mode !== 'full' || !audit.nested) return 'the request was not a full nested audit';
  if (audit.status !== 'completed') return `the audit ${audit.status === 'refused' ? 'was refused' : audit.status === 'cancelled' ? 'was cancelled' : 'failed to complete'}`;
  if (audit.executedMode !== 'full') return `the root executed ${audit.executedMode ?? 'nothing'}, not a full audit`;
  if (audit.verdict !== 'pass') return `the composed verdict is ${audit.verdict ?? 'none'}`;
  if (audit.discovery !== 'complete') return `nested discovery is ${audit.discovery ?? 'absent'}`;
  if (audit.projects === null || audit.projects.length === 0) return 'the audit carries no project results';
  const unpassed = audit.projects.find(project => project.status !== 'completed' || project.verdict !== 'pass' || project.executedMode !== 'full');
  if (unpassed !== undefined) return `project ${unpassed.projectRoot} is ${unpassed.status === 'completed' ? `${unpassed.verdict} over ${unpassed.executedMode ?? 'no'} execution` : unpassed.status}`;
  return null;
}
