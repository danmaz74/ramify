import { createHash } from 'node:crypto';
import { capabilityEngineerSubmissionSchema } from '../work/engineer.js';
import { deviationNotice } from '../../subs/plan-evidence/src/interfaces/catalog.js';
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
  /** Code and scope: the assignment package the request cites, rendered by the package creator. */
  readonly package?: string | undefined;
  /** Scope: the run's plan document as the candidate holds it, which a concern can name as its ground; null when it holds none. */
  readonly planDocument?: string | null | undefined;
  /** Exact committed producer/binding evidence, authenticated against the reviewed feature bytes. */
  readonly pendingBindings?: readonly { readonly path: string; readonly sha256: string; readonly scenario: string; readonly invocation: string; readonly submission: string }[] | undefined;
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
  if (kind === 'code' || kind === 'scope') {
    lines.push('## What the plan asks of it', '');
    if (briefing.package === undefined) lines.push('The assignment cites no element of the plan; judge the candidate against the assignment\'s own goal.', '');
    else {
      lines.push(kind === 'scope'
        ? `The elements the assignment cites, whole. ${deviationNotice} Where a deviation amends an element, judge the candidate against the element as the deviation amends it, and raise no concern for what the deviation leaves out.`
        : 'The elements the assignment cites, whole, as its engineer received them.', '', briefing.package.trimEnd(), '');
    }
  }
  if (kind === 'scope') {
    lines.push(briefing.planDocument === undefined || briefing.planDocument === null
      ? 'The candidate holds no copy of the plan, so the plan itself cannot be a concern\'s ground here.'
      : `The candidate holds the plan as \`${briefing.planDocument}\`. To name it as a concern's ground, read it with \`snapshot_read\`.`, '');
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
      : [...new Map(snapshot.changes.map(change => [`${change.status}\0${change.path}`, change])).values()].map(change => `- ${change.status} ${change.path}`)),
    '',
  );
  lines.push('Read snapshot_diff first, then inspect the changed implementation and the source required to judge it. The audited diff includes harness-produced changes; no feature or pending-tag patch is hidden.', '');
  for (const binding of briefing.pendingBindings ?? []) lines.push(`Harness pending-tag binding: ${binding.scenario} in ${binding.path}, exact candidate sha256 ${binding.sha256}, accepted producer ${binding.invocation}, submission ${binding.submission}. This attribution supplies provenance; review the actual audited patch.`, '');
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


/** Committed acceptance supplies identity; exact candidate/rendering bytes supply attribution. */
export function pendingBindingEvidence(input: { readonly path: string; readonly scenario: string; readonly invocation: string;
  readonly submission: string; readonly submissionBytes: Uint8Array; readonly candidateBytes: string; readonly expectedBytes: string | undefined }) {
  if (input.expectedBytes === undefined || input.candidateBytes !== input.expectedBytes
    || createHash('sha256').update(input.submissionBytes).digest('hex') !== input.submission) return null;
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder().decode(input.submissionBytes)); } catch { return null; }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { schema, ...body } = raw as Record<string, unknown>;
  if (schema !== 'ramify-agent.engineer-submission/1') return null;
  const proposal = capabilityEngineerSubmissionSchema.safeParse(body);
  if (!proposal.success || proposal.data.kind !== 'completion-proposed' || !proposal.data.bindings.some(binding => binding.id === input.scenario)) return null;
  return { path: input.path, scenario: input.scenario, invocation: input.invocation, submission: input.submission,
    sha256: createHash('sha256').update(input.candidateBytes).digest('hex') };
}
