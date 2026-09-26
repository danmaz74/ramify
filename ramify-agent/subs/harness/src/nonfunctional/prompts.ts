import type { Assessment, Candidate } from '../../subs/nonfunctional/src/interfaces/contracts.js';
import type { Catalog } from '../../subs/plan-evidence/src/interfaces/contracts.js';

/** Render the fixed catalog without paraphrasing its passages or conditions. */
export function coordinatorAssessmentPrompt(catalog: Catalog, candidate: Candidate, round: number, phase: 'initial' | 'after-repair'): string {
  return [
    `Assess the prepared source tree ${candidate.tree} in round ${round} (${phase}).`,
    'The catalog below is the initial architect\'s accepted reading. Carry its near-verbatim excerpts and stated/inferred conditions forward unchanged.',
    'Submit exactly one result for every non-functional-requirement ID. Advice is context, not another required result.',
    'For each result, name inspected scope, evidence, and uncertainty. If a temporal condition lacks observed intermediate evidence, choose undetermined.',
    'Do not use capability progress or scenario coverage as a substitute for this assessment. Do not edit source.',
    '',
    JSON.stringify(catalog, null, 2),
  ].join('\n');
}

export function coordinatorActionPrompt(candidate: Candidate, unresolved: readonly string[], investigated: readonly string[],
  context?: { assessment: Assessment; allowedAction: 'investigate' | 'repair-or-close' | 'close'; investigationPaths: readonly string[] }): string {
  return [
    `Choose the next action for prepared source tree ${candidate.tree}.`,
    `Unresolved NFR IDs: ${JSON.stringify(unresolved)}`,
    `NFR IDs with committed investigation evidence this round: ${JSON.stringify(investigated)}`,
    ...(context === undefined ? [] : [
      `The current harness decision is ${context.allowedAction}. Choose only an action permitted by that step.`,
      `Current assessment results and evidence: ${JSON.stringify(context.assessment, null, 2)}`,
      `Accepted investigation submissions for this exact assessment: ${JSON.stringify(context.investigationPaths)}`,
      'Read those investigation submissions before deciding when their evidence matters; do not infer an investigation result from its event alone.',
    ]),
    context === undefined
      ? 'You may request another sequential read-only investigation, propose one repair batch with a starting module, or close this round.'
      : context.allowedAction === 'close'
      ? 'The only permitted action at this step is to close the round.'
      : context.allowedAction === 'repair-or-close'
        ? 'At this step, propose one repair batch with a starting module or close this round.'
        : 'At this step, request a sequential read-only investigation.',
    'A repair of an undetermined NFR requires investigation evidence for that same NFR. One repair batch is allowed per round.',
    'If closing with unresolved NFRs, state an alternative or explicit uncertainty for each one. Do not claim the final gate has passed.',
  ].join('\n');
}

export function repairPrompt(task: string, candidate: Candidate, catalog: Catalog, nfrs: readonly string[], startingModule: string,
  context?: { evidence: readonly string[]; uncertainty: string }): string {
  const selected = catalog.items.filter(item => item.classification === 'non-functional-requirement' && nfrs.includes(item.id));
  return [
    `Start in module ${startingModule} and carry out this authorized repair task against tree ${candidate.tree}:`,
    task,
    'The initial architect\'s requirement excerpts and conditions are below. Carry their wording and stated/inferred distinction forward unchanged.',
    JSON.stringify(selected, null, 2),
    ...(context === undefined ? [] : [
      `Coordinator evidence for this repair: ${JSON.stringify(context.evidence)}`,
      `Coordinator uncertainty: ${context.uncertainty}`,
    ]),
    'Report completed or partial work with evidence and any remaining work. This submission does not decide NFR satisfaction.',
  ].join('\n');
}
