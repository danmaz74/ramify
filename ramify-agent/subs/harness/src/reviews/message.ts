import type { IterationAssignment } from '../work/iterations.js';
import type { CapturedInput } from './inputs.js';
import type { ReviewRequest } from './records.js';
import type { CandidateSnapshot } from './snapshot.js';

/*
 * The first message of a reviewer: the frozen question, the iteration's
 * intent as its assignment states it, the changed paths, the question's own
 * captured inputs and the CheckFindings its work item already holds, which
 * a concern may suggest it repeats. Everything here is read from committed
 * records and the audited candidate.
 *
 * The message is the complete input of its question whether the session
 * forked or started fresh: a fork adds the history of the point it forked,
 * never something the question depends on. A fork and a fresh start of one
 * request are therefore given the same message.
 */

export interface ReviewBriefing {
  readonly request: ReviewRequest;
  readonly snapshot: CandidateSnapshot;
  /** The iteration's assignment, or null where its record could not be read. */
  readonly assignment: IterationAssignment | null;
  /** The CheckFindings of the work item, open or not, each with its title. */
  readonly checkFindings: ReadonlyArray<{ readonly id: string; readonly standing: string; readonly title: string }>;
  /** Scope: the plan excerpts the assignment cites, as the request binds them. */
  readonly requirements?: readonly CapturedInput[] | undefined;
}

const questions = { code: 'Code review', scope: 'Scope review', design: 'Design review' } as const;

export function reviewMessage(briefing: ReviewBriefing): string {
  const { request, snapshot, assignment } = briefing;
  const kind = request.key.kind;
  const lines = [
    `${questions[kind]} ${request.id} of iteration ${request.key.iteration} of work item ${request.workItem}.`,
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
        ...(kind === 'scope' ? [`Its write scope's rationale: ${assignment.scope.rationale}`] : []),
      ]),
    '',
  ];
  if (kind === 'scope') {
    lines.push('## What the plan asks of it', '');
    const requirements = briefing.requirements ?? [];
    if (requirements.length === 0) lines.push('The assignment cites no part of the plan; judge the candidate against the assignment\'s own goal.', '');
    for (const requirement of requirements) lines.push(`### ${requirement.ref} (sha256 ${requirement.hash.slice(0, 12)})`, '', requirement.text, '');
  }
  if (kind === 'design') {
    lines.push('## The guidance this design is judged against', '',
      'Each file is part of the audited candidate. If this session has not read one of them yet, read it with `snapshot_read` before you judge.', '');
    for (const entry of request.guidance) lines.push(`- ${entry.ref} (sha256 ${entry.hash.slice(0, 12)})`);
    lines.push('');
  }
  lines.push(
    '## The changed paths',
    '',
    ...(snapshot.changes.length === 0
      ? ['The candidate changed nothing. Submit with nothing inspected and nothing missing.']
      : snapshot.changes.map(change => `- ${change.status} ${change.path}`)),
    '',
  );
  if (briefing.checkFindings.length > 0) {
    lines.push('## CheckFindings this work item already holds', '');
    for (const entry of briefing.checkFindings) lines.push(`- ${entry.id} (${entry.standing}): ${entry.title}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * The first message of a design orientation: the selected guidance in full,
 * read once so that every design review of the same selection can fork the
 * session that read it.
 */
export function orientationMessage(guidance: readonly CapturedInput[]): string {
  const lines = [
    'Design orientation. Read the guidance below: it is what the design reviews of this project\'s iterations are judged against.',
    'You review nothing yet. Submit the paths you read and a short account of what the guidance asks of a design.',
    '',
  ];
  for (const entry of guidance) lines.push(`## ${entry.ref} (sha256 ${entry.hash.slice(0, 12)})`, '', entry.text.trimEnd(), '');
  return lines.join('\n');
}
