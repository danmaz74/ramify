import { deviationNotice } from '../../plan-evidence/src/interfaces/catalog.js';
import type { CapturedInput } from './inputs.js';
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

/** The fixed question, without run storage or session-fork records. */
export interface ReviewQuestion {
  readonly id: string;
  readonly key: { readonly kind: 'code' | 'scope' | 'design'; readonly iteration: string; readonly candidate: string };
  readonly workItem: string;
  readonly base: string;
  readonly tree: string;
  readonly gate: string;
  readonly guidance: readonly { readonly ref: string; readonly hash: string }[];
}

/** Parent-normalized intent; review preparation does not interpret assignments or gate policy. */
export interface ReviewIntent {
  readonly goal: string;
  readonly approach: string;
  readonly completionEvidence: string;
  readonly scopeRationale: string;
  readonly testAreas: readonly string[];
}

export interface ReviewBriefing {
  readonly request: ReviewQuestion;
  readonly snapshot: CandidateSnapshot;
  /** The iteration's normalized intent, or null where its record could not be read. */
  readonly assignment: ReviewIntent | null;
  /** The CheckFindings of the work item, open or not, each with its title. */
  readonly checkFindings: ReadonlyArray<{ readonly id: string; readonly standing: string; readonly title: string }>;
  /** Code and scope: the assignment package the request cites, rendered by the package creator. */
  readonly package?: string | undefined;
  /** Scope: the run's plan document as the candidate holds it, which a concern can name as its ground; null when it holds none. */
  readonly planDocument?: string | null | undefined;
  /** Exact committed producer/binding evidence, authenticated against the reviewed feature bytes. */
  readonly pendingBindings?: readonly { readonly path: string; readonly sha256: string; readonly scenario: string; readonly invocation: string; readonly submission: string }[] | undefined;
  /** Declared check facts with candidate-relative configuration references. */
  readonly setup?: string | undefined;
  /** Complete inline patches or bounded fallback instructions from the same frozen comparison. */
  readonly diffPayload?: string | undefined;
}

/**
 * What the message is composed from: the briefing, of whose snapshot only
 * the changed paths and the directories are read. A captured briefing
 * supplies those two alone.
 */
export type ReviewMessageInputs = Omit<ReviewBriefing, 'snapshot'> & { readonly snapshot: Pick<CandidateSnapshot, 'changes' | 'directories'> };

const questions = { code: 'Code review', scope: 'Scope review', design: 'Design review' } as const;

export function reviewMessage(briefing: ReviewMessageInputs): string {
  const { request, snapshot, assignment } = briefing;
  const kind = request.key.kind;
  const lines = [
    `${questions[kind]} ${request.id} of iteration ${request.key.iteration} of work item ${request.workItem}.`,
    '',
    `The audited candidate is commit ${request.key.candidate} (tree ${request.tree}); its gate ${request.gate} passed. The diff is taken from ${request.base}.`,
    '',
    'The request\'s assignment path identifies a record in the harness run directory. Use the assignment intent below; that record is not a candidate file readable with snapshot tools.',
    '',
    '## The iteration',
    '',
    ...(assignment === null
      ? ['Its assignment record could not be read; review the diff on its own evidence.']
      : [
        `Goal: ${assignment.goal}`,
        `Approach: ${assignment.approach}`,
        `Completion evidence: ${assignment.completionEvidence}`,
        ...(kind === 'scope' ? [`Its write scope's rationale: ${assignment.scopeRationale}`] : []),
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
  if (briefing.diffPayload !== undefined) lines.push(briefing.diffPayload, '');
  lines.push('Use the supplied changed-path list and complete patches delivered in this message. Fetch a relevant patch with snapshot_diff only when it is not supplied, and inspect the source required to judge it. List paths with snapshot_diff only if the supplied list is unavailable. The audited diff includes harness-produced changes; no feature or pending-tag patch is hidden.', '');
  if (briefing.setup) lines.push(briefing.setup, '');
  if (assignment !== null && kind !== 'design') {
    const testAreas = assignment.testAreas.filter(area => snapshot.directories.has(area));
    if (testAreas.length > 0) lines.push('## Candidate test pointers', '',
      ...testAreas.map(area => `- \`${area}/\`: inspect with snapshot_list; read named files with snapshot_read.`), '');
  }
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
