import type { InitialAnalysisSubmission } from '../../analysis/submission.js';
import type { LocalArchitectSubmission } from '../../work/submission.js';

/*
 * The two submissions a run of this iteration accepts, as a test writes
 * them. Nothing here simulates a transition: each one goes through the same
 * judge, the same schema and the same rules an agent's would.
 */

/** A module an entry capability proposes, where its owner does not exist yet. */
export interface ProposedModule {
  readonly parent: string;
  readonly directory: string;
  readonly purpose: string;
  readonly tags: readonly string[];
}

/** One entry capability of an analysis, with the module it proposes where it has one. */
export function entry(capability: string, owner: string, description = `The module provides ${capability}.`, proposed?: ProposedModule) {
  return {
    capability,
    description,
    owner,
    requirementRefs: [{ anchor: 'Request' }],
    acceptanceRefs: [{ anchor: 'Acceptance' }],
    citations: [] as Array<{ module: string; file?: string; symbol?: string; note?: string }>,
    ...(proposed === undefined ? {} : { proposed: { ...proposed, tags: [...proposed.tags] } }),
  };
}

/** One hypothesis of an analysis, which creates nothing. */
export function hypothesis(id: string, extra: Partial<InitialAnalysisSubmission['hypotheses'][number]> = {}) {
  return {
    id,
    capability: id,
    change: 'reuse' as const,
    suggestedOwner: 'collection-review',
    anticipatedConsumers: [] as string[],
    involvedModules: [] as string[],
    dependsOn: [] as string[],
    confidence: 'medium' as const,
    rationale: `The behavior behind ${id} may already exist.`,
    assumptions: [],
    uncertainties: [],
    citations: [],
    ...extra,
  };
}

export function analysis(
  entries: ReadonlyArray<ReturnType<typeof entry>>,
  hypotheses: ReadonlyArray<ReturnType<typeof hypothesis>> = [],
  coverageLimits: readonly string[] = [],
): InitialAnalysisSubmission {
  return { entries: [...entries], hypotheses: [...hypotheses], coverageLimits: [...coverageLimits] };
}

/** A local architect asking for completion with the smallest honest outline. */
export function requestCompletion(extra: Partial<Extract<LocalArchitectSubmission, { kind: 'request-completion' }>['outline']> = {}) {
  return {
    kind: 'request-completion' as const,
    summary: 'The goal is already satisfied by behavior this module has.',
    outline: {
      changes: 'The module already does what the goal asks; the gate is what verifies it.',
      decomposition: { kind: 'single-iteration' as const, rationale: 'No change is needed, so one empty piece of work carries the goal.' },
      reuse: [],
      breakingChanges: [],
      stages: [],
      revisionReason: '',
      ...extra,
    },
  };
}

/** A local architect reporting that the request cannot be met as stated. */
export function unresolved(conflict = 'The request contradicts the module\'s own guarantee.', evidence: readonly string[] = ['README.md']) {
  return { kind: 'unresolved' as const, conflict, evidence: [...evidence] };
}
