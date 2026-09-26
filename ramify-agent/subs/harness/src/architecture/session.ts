import { architectViewDirectory } from '../../subs/evidence/src/views.js';
import type { ViewIdentity } from '../interfaces/protocol/evidence.js';
import type { Hypothesis, RegistryEntry } from '../analysis/records.js';
import type { PlacementDecision, PlacementRequest } from './records.js';
import type { EnvironmentProblem, UnresolvedRequest } from '../deviations/records.js';

/*
 * What one fork of the architect context is given: the focused request, the
 * refreshed view, the registry and the decision log. It is not given the
 * view's contents: the fork reads what it needs itself, and the request
 * explains intent and local discoveries rather than reproducing the view.
 *
 * Inherited briefs orient the fork; they never replace the records. The
 * message says so, because a brief is what an earlier fork concluded and
 * the registry is what the run committed.
 */

export interface ForkBriefing {
  readonly request: PlacementRequest;
  /** The view the harness refreshed for this request, and recorded with it. */
  readonly view: ViewIdentity;
  /** Why the view is not the current one, where a refresh could not be made. */
  readonly viewUnavailable?: string | undefined;
  readonly registry: readonly RegistryEntry[];
  readonly hypotheses: readonly Hypothesis[];
  readonly decisions: readonly PlacementDecision[];
  /** The orientation a parent rebuilt from records starts from. */
  readonly orientation?: string | undefined;
  /** What an earlier fork of this request returned without deciding. */
  readonly partial?: { readonly attempt: number; readonly findings: readonly string[]; readonly gaps: readonly string[] } | undefined;
  /** The view identity that changed under an earlier fork of this request. */
  readonly revalidate?: { readonly was: string; readonly now: string } | undefined;
}

/** The first user message of one placement fork. */
export function forkMessage(briefing: ForkBriefing): string {
  const { request } = briefing;
  const lines: string[] = [];
  if (briefing.orientation !== undefined) lines.push(briefing.orientation, '');

  lines.push(
    `# Placement request ${request.id}`,
    '',
    `The local architect of \`${request.requester}\`, working ${request.workItem} for the capability \`${request.forCapability}\`, asks:`,
    '',
    `> ${request.question}`,
    '',
    '## The behavior it requires',
    '',
    request.requiredBehavior,
    '',
    '## What its own investigation established',
    '',
  );
  if (request.findings.length === 0) lines.push('It reports nothing established.');
  else for (const finding of request.findings) {
    lines.push(`- ${finding.text}${finding.citations.length === 0 ? '' : ` (${finding.citations.map(citation => `\`${citation.module}\`${citation.file === undefined ? '' : `:${citation.file}`}${citation.symbol === undefined ? '' : ` ${citation.symbol}`}`).join(', ')})`}`);
  }

  lines.push('', '## Candidates it suggests', '');
  if (request.candidates.length === 0) lines.push('None. The choice is open.');
  else for (const candidate of request.candidates) {
    lines.push(`- ${candidate.capability === undefined ? '' : `capability \`${candidate.capability}\`; `}${candidate.owner === undefined ? '' : `owner \`${candidate.owner}\`; `}${candidate.note}`);
  }
  lines.push('', 'A candidate is a suggestion. Search for the required behavior, not only where the requester looked.', '');

  lines.push('## What it could not resolve', '');
  if (request.unresolved.length === 0) lines.push('It names nothing.');
  else for (const entry of request.unresolved) lines.push(`- ${entry}`);

  lines.push('', '## The hypotheses it tests', '');
  if (request.hypotheses.length === 0) lines.push('It names none.');
  else for (const tested of request.hypotheses) {
    lines.push(`- \`${tested.ref.id}\` revision ${tested.ref.revision}, which its evidence **${tested.stance}**: ${tested.evidence}`);
  }
  if (request.localDecisions.length > 0) {
    lines.push('', `Its own local decisions this request rests on: ${request.localDecisions.map(id => `\`${id}\``).join(', ')}.`);
  }

  lines.push(...evidenceSections(briefing));
  lines.push('', 'Investigate and decide. The parent context does not reassess your choice.');
  return lines.join('\n');
}

/** What one fork of an unresolved request is given, beside the evidence a placement fork has. */
export interface UnresolvedForkBriefing extends Omit<ForkBriefing, 'request'> {
  readonly request: UnresolvedRequest;
  /** The work item's goal. */
  readonly workItem: { readonly goal: string };
  /** The work item's package, rendered with every plan deviation recorded so far; a deviation amends its elements by ID. */
  readonly package: string;
  /** How many plan deviations this run has recorded. */
  readonly deviations: number;
  /** How many deviations the run records before the next one waits for the person. */
  readonly deviationLimit: number;
  /** Every environment problem already reported in this run, with the operator's note where they resumed it. */
  readonly environmentProblems?: ReadonlyArray<{ readonly problem: EnvironmentProblem; readonly resumed: string | null }> | undefined;
}

/** The first user message of one fork of an unresolved request. */
export function unresolvedForkMessage(briefing: UnresolvedForkBriefing): string {
  const { request } = briefing;
  const lines: string[] = [];
  if (briefing.orientation !== undefined) lines.push(briefing.orientation, '');
  lines.push(
    `# Unresolved request ${request.id}`,
    '',
    `The local architect of \`${request.requester}\`, working ${request.workItem}, answered that its request cannot be met as stated:`,
    '',
    ...request.conflict.split('\n').map(line => `> ${line}`),
    '',
    '## Its evidence',
    '',
    ...(request.evidence.length === 0 ? ['It names none.'] : request.evidence.map(entry => `- ${entry}`)),
    '',
    `## What ${request.workItem} asks`,
    '',
    `Goal: ${briefing.workItem.goal}`,
    '',
    `## The package of ${request.workItem}`,
    '',
    'The elements the work item works from and every plan deviation recorded so far. A deviation names the elements it amends by their IDs; context cannot be amended.',
    '',
    briefing.package.trimEnd(),
  );
  lines.push('', briefing.deviations >= briefing.deviationLimit
    ? `This run has recorded ${briefing.deviations} deviations, its limit. A further one is recorded, and the run then waits for the person to accept or reject it before it goes on.`
    : `This run records at most ${briefing.deviationLimit} deviations before the next one waits for the person; ${briefing.deviations} are recorded.`);
  const reported = briefing.environmentProblems ?? [];
  if (reported.length > 0) {
    lines.push('', '## Environment problems already reported', '');
    for (const { problem, resumed } of reported) {
      lines.push(`- \`${problem.id}\`, for ${problem.request} of ${problem.workItem}: ${problem.diagnosis.replace(/\s+/gu, ' ')} ${resumed === null ? 'The operator has not resumed the run for it.' : `The operator resumed the run${resumed.trim() === '' ? '.' : `, noting: ${resumed.replace(/\s+/gu, ' ')}`}`}`);
    }
  }
  lines.push(...evidenceSections(briefing));
  lines.push('', 'Investigate and answer: a placement decision, a plan deviation that keeps as much of the plan as the conflict allows, an environment problem for the operator, or that nothing is possible. The parent context does not reassess your answer.');
  return lines.join('\n');
}

/** The evidence a fork decides against, and what an earlier fork of its request left: shared by both questions. */
function evidenceSections(briefing: Omit<ForkBriefing, 'request' | 'orientation'>): string[] {
  const lines: string[] = [];
  lines.push('', '## The evidence you decide against', '');
  lines.push(briefing.view.status === 'materialized'
    ? `- The architect view at \`${architectViewDirectory}/\` was refreshed for this request: revision \`${briefing.view.revision}\`, input \`${briefing.view.input}\`. Coverage limits: ${briefing.view.coverageLimits.length === 0 ? 'none' : briefing.view.coverageLimits.join('; ')}.`
    : '- No architect view was materialized for this request, so every claim about the module tree is yours to establish from the source.');
  if (briefing.viewUnavailable !== undefined) {
    lines.push(`- The refresh did not succeed: ${briefing.viewUnavailable}. An older view is not the current one; record what you could not establish in \`decision.evidence.gaps\`.`);
  }
  lines.push('- Neither an empty search nor an absent hit establishes that behavior is absent. Say so in `decision.evidence.gaps`.');

  lines.push('', '### The capability registry', '');
  if (briefing.registry.length === 0) lines.push('It is empty.');
  else for (const entry of briefing.registry) {
    lines.push(`- \`${entry.capability}\` → \`${entry.owner}\` (revision ${entry.revision}, ${entry.origin}${entry.proposed === undefined ? '' : `, proposed at \`${entry.proposed.directory}\``}): ${entry.behavior}`);
  }
  lines.push('', 'A registered capability may be decided and not implemented yet. Reusing one preserves its identity; it does not claim its provider is complete.');

  lines.push('', '### Decisions already made', '');
  if (briefing.decisions.length === 0) lines.push('None.');
  else for (const decision of briefing.decisions) {
    lines.push(`- \`${decision.id}\` (${decision.authority}): \`${decision.capability}\` ${decision.outcome} → ${decision.owner === null ? 'outside this project' : `\`${decision.owner}\``}.${decision.changesExistingSymbols ? ' It changes symbols that already have consumers.' : ''} ${decision.rationale}`);
  }
  lines.push('', 'To place a capability differently from one of these, name that decision in `decision.revises` with what it affects. A contradiction that says nothing is refused.');

  lines.push('', '### The hypotheses of this run', '');
  if (briefing.hypotheses.length === 0) lines.push('None.');
  else for (const hypothesis of briefing.hypotheses) {
    lines.push(`- \`${hypothesis.id}\` revision ${hypothesis.revision}, ${hypothesis.standing}, confidence ${hypothesis.confidence}: capability \`${hypothesis.capability}\`, change \`${hypothesis.change}\`, suggested owner \`${hypothesis.suggestedOwner}\`.${hypothesis.changesExistingSymbols ? ' It is forecast to change symbols that already have consumers.' : ''} ${hypothesis.rationale}`);
  }

  if (briefing.partial !== undefined) {
    lines.push('', '## An earlier fork of this request did not decide', '');
    lines.push(`Attempt ${briefing.partial.attempt} returned findings and gaps instead of a decision:`);
    for (const finding of briefing.partial.findings) lines.push(`- Finding: ${finding}`);
    for (const gap of briefing.partial.gaps) lines.push(`- Gap: ${gap}`);
    lines.push('', 'Start from current records and current evidence. The earlier findings are not established facts.');
  }

  if (briefing.revalidate !== undefined) {
    lines.push('', '## The evidence changed under the earlier fork', '');
    lines.push(`The view was \`${briefing.revalidate.was}\` when this request started and is \`${briefing.revalidate.now}\` now. Revalidate what the earlier investigation rested on and repeat what it affected. Two revisions are never combined.`);
  }

  return lines;
}
