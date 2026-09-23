import type { Script, ScriptStep } from '../../../subs/agent/src/scripted.js';
import type { SessionSpec } from '../../../subs/agent/src/interfaces/port.js';
import { scenarioIdOf } from '../../../subs/scenarios/src/records.js';

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

/** The script, with each local architect's completion request declaring its entry's scenarios unless it states its own. */
export function declaringScenarios(script: Script): Script {
  let entries: string[] = [];
  let byEntry = new Map<string, string[]>();
  return (spec: SessionSpec): readonly ScriptStep[] => {
    const steps = typeof script === 'function' ? script(spec) : script;
    if (spec.role === 'initial-architect') {
      const analysis = steps.flatMap(step => (step.kind === 'submit' && isAnalysis(step.input) ? [step.input] : [])).at(-1);
      if (analysis !== undefined) {
        entries = (analysis.entries ?? []).map(entry => String(entry.capability));
        byEntry = new Map();
        (analysis.scenarios ?? []).forEach((scenario, index) => {
          const entry = String(scenario.entry);
          byEntry.set(entry, [...(byEntry.get(entry) ?? []), scenarioIdOf(index + 1)]);
        });
      }
      return steps;
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

function isAnalysis(input: unknown): input is ScriptedAnalysis {
  return typeof input === 'object' && input !== null && Array.isArray((input as ScriptedAnalysis).entries);
}

function isUndeclaredRequest(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
    && (input as { kind?: unknown }).kind === 'request-completion' && !('scenarios' in input);
}
