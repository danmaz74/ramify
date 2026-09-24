import type { IterationAssignment } from '../work/iterations.js';
import type { ReviewRequest } from './records.js';
import type { CandidateSnapshot } from './snapshot.js';

/*
 * The first message of a code reviewer: the frozen question, the
 * iteration's intent as its assignment states it, the changed paths, and
 * the CheckFindings its work item already holds, which a concern may
 * suggest it repeats. Everything here is read from committed records.
 */

export interface ReviewBriefing {
  readonly request: ReviewRequest;
  readonly snapshot: CandidateSnapshot;
  /** The iteration's assignment, or null where its record could not be read. */
  readonly assignment: IterationAssignment | null;
  /** The CheckFindings of the work item, open or not, each with its title. */
  readonly checkFindings: ReadonlyArray<{ readonly id: string; readonly standing: string; readonly title: string }>;
}

export function reviewMessage(briefing: ReviewBriefing): string {
  const { request, snapshot, assignment } = briefing;
  const lines = [
    `Code review ${request.id} of iteration ${request.key.iteration} of work item ${request.workItem}.`,
    '',
    `The audited candidate is commit ${request.key.candidate} (tree ${request.tree}); its gate ${request.gate} passed. The diff is taken from ${request.base}.`,
    '',
    '## The iteration',
    '',
    ...(assignment === null
      ? ['Its assignment record could not be read; review the diff on its own evidence.']
      : [
        `Goal: ${assignment.goal}`,
        `Approach: ${assignment.approach}`,
        `Completion evidence: ${assignment.completionEvidence}`,
      ]),
    '',
    '## The changed paths',
    '',
    ...(snapshot.changes.length === 0
      ? ['The candidate changed nothing. Submit with nothing inspected and nothing missing.']
      : snapshot.changes.map(change => `- ${change.status} ${change.path}`)),
    '',
  ];
  if (briefing.checkFindings.length > 0) {
    lines.push('## CheckFindings this work item already holds', '');
    for (const entry of briefing.checkFindings) lines.push(`- ${entry.id} (${entry.standing}): ${entry.title}`);
    lines.push('');
  }
  return lines.join('\n');
}
