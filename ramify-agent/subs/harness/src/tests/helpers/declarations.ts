import type { Script, ScriptStep } from '../../../subs/agent/src/scripted.js';
import type { SessionSpec } from '../../../subs/agent/src/interfaces/port.js';
import { scenarioIdOf } from '../../../subs/scenarios/src/records.js';
import { contextSelectorToolName, workOrientationToolName } from '../../context-selection/submissions.js';
import { checkToolName, intakeToolName, principleToolName } from '../../analysis/extraction.js';

/*
 * Scripted local architects that declare their work item's scenarios.
 *
 * Every entry of a scripted analysis has scenarios, and a completion
 * request is refused while one of its entry's scenarios is pending
 * (architecture §9). A test whose subject is not the scenarios writes its
 * completion requests without them, so this wrapper declares for it: a
 * local architect's `request-completion` that names no `scenarios` declares
 * every scenario of its work item's entry, as an architect would whose
 * entry existing step definitions already bind. The scripted runner then
 * reports them passed at the work-item gate, where they are untagged.
 *
 * The IDs are the ones acceptance assigns: the analysis's scenarios are
 * numbered `sc-001`… in the order it lists them, and entry work items
 * `wi-001`… in the order of its entries. The wrapper reads both from the
 * initial architect's submission in the same script. An integration work
 * item's request declares its one scenario, which its briefing names in the
 * heading of its integration section. A request that states
 * `scenarios`, even an empty list, is left as the test wrote it, and no
 * other submission is touched: an engineer declares only where a test says
 * so.
 */

interface ScriptedAnalysis {
  readonly entries?: ReadonlyArray<{ readonly capability?: unknown }>;
  readonly scenarios?: ReadonlyArray<{ readonly entry?: unknown }>;
}

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

/** The script, with each local architect's completion request declaring its entry's scenarios unless it states its own. */
export function declaringScenarios(script: Script): Script {
  let entries: string[] = [];
  let byEntry = new Map<string, string[]>();
  return (spec: SessionSpec): readonly ScriptStep[] => {
    const fallback = scriptedOrDefault(script, spec);
    if (fallback !== undefined) return fallback;
    const steps = typeof script === 'function' ? script(spec) : script;
    if (spec.role === 'initial-architect') {
      const prepared = steps;
      const analysis = prepared.flatMap(step => (step.kind === 'submit' && isAnalysis(step.input) ? [step.input] : [])).at(-1);
      if (analysis !== undefined) {
        entries = (analysis.entries ?? []).map(entry => String(entry.capability));
        byEntry = new Map();
        (analysis.scenarios ?? []).forEach((scenario, index) => {
          const entry = String(scenario.entry);
          byEntry.set(entry, [...(byEntry.get(entry) ?? []), scenarioIdOf(index + 1)]);
        });
      }
      return prepared;
    }
    if (spec.role !== 'local-architect') return steps;
    const integration = /^## The integration scenario (sc-\d+):/mu.exec(spec.prompt)?.[1];
    const workItem = /\bwi-(\d+)\b/u.exec(spec.prompt.split('\n')[0] ?? '')?.[1];
    const entry = workItem === undefined || integration !== undefined ? undefined : entries[Number(workItem) - 1];
    const ids = integration !== undefined ? [integration] : entry === undefined ? [] : byEntry.get(entry) ?? [];
    return steps.map(step => {
      if (step.kind !== 'submit' || !isUndeclaredRequest(step.input)) return step;
      return { ...step, input: { ...step.input, scenarios: [...ids] } };
    });
  };
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

function isAnalysis(input: unknown): input is ScriptedAnalysis {
  return typeof input === 'object' && input !== null && Array.isArray((input as ScriptedAnalysis).entries);
}

function isUndeclaredRequest(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
    && (input as { kind?: unknown }).kind === 'request-completion' && !('scenarios' in input);
}
