import type { Assessment, Candidate } from '../../subs/nonfunctional/src/interfaces/contracts.js';

/** The assessment package: every non-functional and fixed element, whole, rendered by the package creator. */
export function coordinatorAssessmentPrompt(assessmentPackage: string, candidate: Candidate, round: number, phase: 'initial' | 'after-repair'): string {
  return [
    `Assess the prepared source tree ${candidate.tree} in round ${round} (${phase}).`,
    'The package below holds every non-functional requirement of the plan and every fixed requirement, with the plan deviations recorded in this run. Carry their wording and stated/inferred conditions forward unchanged.',
    'Submit exactly one result for every element ID of the package.',
    'For each result, name inspected scope, evidence, and uncertainty. If a temporal condition lacks observed intermediate evidence, choose undetermined.',
    'Do not use capability progress or scenario coverage as a substitute for this assessment. Do not edit source.',
    '',
    assessmentPackage.trimEnd(),
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

/** A repair engineer's task with the package of the requirements the coordinator cites. */
export function repairPrompt(task: string, candidate: Candidate, repairPackage: string, startingModule: string,
  context?: { evidence: readonly string[]; uncertainty: string }): string {
  return [
    `Start in module ${startingModule} and carry out this authorized repair task against tree ${candidate.tree}:`,
    task,
    'The requirements this repair concerns are below, whole. Carry their wording and stated/inferred distinction forward unchanged.',
    repairPackage.trimEnd(),
    ...(context === undefined ? [] : [
      `Coordinator evidence for this repair: ${JSON.stringify(context.evidence)}`,
      `Coordinator uncertainty: ${context.uncertainty}`,
    ]),
    'Report completed or partial work with evidence and any remaining work. This submission does not decide NFR satisfaction.',
  ].join('\n');
}
