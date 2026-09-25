import type { InitialAnalysisSubmission } from '../../analysis/submission.js';
import type { LocalArchitectSubmission } from '../../work/submission.js';

/*
 * The two submissions a run of this iteration accepts, as a test writes
 * them. Nothing here simulates a transition: each one goes through the same
 * judge, the same schema and the same rules an agent's would.
 */

/** A plan reference as an entry or an architect scenario states it. */
type PlanRef = { anchor?: string; lines?: [number, number] };

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
    requirementRefs: [{ anchor: 'Request' }] as PlanRef[],
    acceptanceRefs: [{ anchor: 'Acceptance' }] as PlanRef[],
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
    changesExistingSymbols: false,
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

/**
 * The one architect scenario every entry of a scripted analysis gets unless
 * the test states its own: an abstract interaction named for the
 * capability, citing each of the entry's acceptance references, as form
 * rules 4 and 6 require.
 */
export function architectScenario(
  subject: { readonly capability: string; readonly acceptanceRefs: ReadonlyArray<{ anchor?: string; lines?: readonly [number, number] }> },
  key = `${subject.capability}-is-used`,
): InitialAnalysisSubmission['scenarios'][number] {
  return {
    key,
    entry: subject.capability,
    origin: { kind: 'architect' },
    refs: subject.acceptanceRefs.map(ref => ({
      ...(ref.anchor === undefined ? {} : { anchor: ref.anchor }),
      ...(ref.lines === undefined ? {} : { lines: [ref.lines[0], ref.lines[1]] as [number, number] }),
    })),
    gherkin: [
      `Scenario: A person uses ${subject.capability}`,
      '  Given the project as the plan finds it',
      `  When the person uses ${subject.capability}`,
      `  Then the outcome ${subject.capability} promises is shown`,
    ].join('\n'),
  };
}

/**
 * An initial analysis as `initial-architect/2` states it. Unless the test
 * gives its own scenarios, each entry has the one `architectScenario`.
 */
export function analysis(
  entries: ReadonlyArray<ReturnType<typeof entry>>,
  hypotheses: ReadonlyArray<ReturnType<typeof hypothesis>> = [],
  coverageLimits: readonly string[] = [],
  scenarios: InitialAnalysisSubmission['scenarios'] = entries.map(one => architectScenario(one)),
  integrationScenarios: InitialAnalysisSubmission['integrationScenarios'] = [],
): InitialAnalysisSubmission {
  return {
    entries: [...entries],
    hypotheses: [...hypotheses],
    coverageLimits: [...coverageLimits],
    scenarios: [...scenarios],
    integrationScenarios: [...integrationScenarios],
    // The scripted analysis explicitly asserts no NFR/advice passages. The
    // fixture wrapper binds its document judgment to the run's captured bytes.
    catalog: [],
    incorporation: { documents: [], missing: [] },
  };
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
