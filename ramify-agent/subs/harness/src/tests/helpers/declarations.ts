import type { Script, ScriptStep } from '../../../subs/agent/src/scripted.js';
import type { SessionSpec } from '../../../subs/agent/src/interfaces/port.js';
import { contextSelectorToolName, workOrientationToolName } from '../../context-selection/submissions.js';
import { checkToolName, intakeToolName, principleToolName } from '../../analysis/extraction.js';

/*
 * Scripted local architects that report their work item's scenarios done.
 *
 * Every entry of a scripted analysis has scenarios, and a completion
 * request is refused while one of its entry's scenarios is not reported
 * done (architecture §9). A test whose subject is not the scenarios writes
 * its completion requests without reports, so this wrapper reports for it:
 * a local architect's `request-completion` that names no `reports` reports
 * every scenario obligation its prompt lists as not yet done, as an
 * architect would whose entry existing step definitions already bind. The
 * report names the revision the prompt's "# Registered obligations" lines
 * state, so it is accepted as the harness's own briefing describes.
 *
 * A request that states `reports`, even an empty list, is left as the test
 * wrote it, and no other submission is touched: an engineer binds, and an
 * architect assigns, only where a test says so.
 */

/**
 * The turns a test does not state, answered as a reader that finds
 * nothing to add: an intake that reads no non-functional element or
 * recommendation and incorporates the root plan's scenarios, principles
 * extractions and checks that find nothing, an orientation, and a
 * selection of no element. A test that states a turn of its own is
 * answered by its script instead.
 */
export function defaultTurn(spec: SessionSpec): readonly ScriptStep[] | undefined {
  switch (spec.submission.name) {
    case intakeToolName: {
      if (/^Missing references to judge:$/mu.test(spec.prompt)) throw new Error('A scripted fixture with missing references must state its intake explicitly');
      const plans = [...spec.prompt.matchAll(/^- (doc-\d{3,}) \(plan\):/gmu)].map(match => match[1]!);
      return [{ kind: 'submit', input: {
        goal: 'The plan asks for the behavior its entries name.', elements: [],
        incorporation: { documents: plans.map((document, index) => ({ document, scenarios: index === 0, uncertainty: '' })), missing: [] },
      } }];
    }
    case principleToolName: return [{ kind: 'submit', input: { elements: [] } }];
    case checkToolName: return [{ kind: 'submit', input: { corrections: [], entries: [], scenarios: [] } }];
    case workOrientationToolName: return [{ kind: 'submit', input: {
      focus: 'Understand this work item before assigning it.', currentUnderstanding: 'The captured work item briefing governs this orientation.', questions: [],
    } }];
    case contextSelectorToolName: return [{ kind: 'submit', input: { selected: [] } }];
    default: return undefined;
  }
}

/** The script, with each local architect's completion request reporting its scenarios done unless it states its own reports. */
export function declaringScenarios(script: Script): Script {
  return (spec: SessionSpec): readonly ScriptStep[] => {
    const fallback = scriptedOrDefault(script, spec);
    if (fallback !== undefined) return fallback;
    const steps = typeof script === 'function' ? script(spec) : script;
    if (spec.role !== 'local-architect') return steps;
    const reports = unfinishedScenarioObligations(spec.prompt)
      .map(({ id, revision }) => ({ id, judgment: 'done' as const, basedOnRevision: revision }));
    return steps.map(step => {
      if (step.kind !== 'submit' || !isUnreportedRequest(step.input)) return step;
      return { ...step, input: { ...step.input, reports } };
    });
  };
}

/** The scenario obligations a local architect's prompt lists as not done, each with the revision a report names. */
export function unfinishedScenarioObligations(prompt: string): Array<{ id: string; revision: number }> {
  const section = prompt.split('\n# Registered obligations\n').at(-1);
  if (section === undefined || section === prompt) return [];
  return [...section.matchAll(/^- (sc-\d+) \(scenario\): (pending|bound|done), revision (\d+);/gmu)]
    .filter(match => match[2] !== 'done')
    .map(match => ({ id: match[1]!, revision: Number(match[3]) }));
}

/** The default turns for a script run outside `openRuns`. */
export function withDefaultTurns(script: Script): Script {
  return (spec: SessionSpec): readonly ScriptStep[] => scriptedOrDefault(script, spec) ?? (typeof script === 'function' ? script(spec) : script);
}

/**
 * An orientation and a selection are always the default ones, so no local
 * architect's scripted turn is spent on them. A catalog extractor's turn is
 * the script's where it states one, and the default otherwise.
 */
function scriptedOrDefault(script: Script, spec: SessionSpec): readonly ScriptStep[] | undefined {
  if (spec.submission.name === workOrientationToolName || spec.submission.name === contextSelectorToolName) return defaultTurn(spec);
  if (spec.role !== 'catalog-extractor') return undefined;
  // A static script answers every session alike, so it never states a catalog extractor's turn.
  if (typeof script !== 'function') return defaultTurn(spec);
  const steps = script(spec);
  return steps.length === 0 || steps[0]?.kind === 'end' ? defaultTurn(spec) : steps;
}

function isUnreportedRequest(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
    && (input as { kind?: unknown }).kind === 'request-completion' && !('reports' in input);
}
