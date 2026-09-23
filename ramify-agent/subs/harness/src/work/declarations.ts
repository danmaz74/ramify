import type { ScenarioRecord } from '../../subs/scenarios/src/records.js';
import type { ScenarioStates } from '../../subs/scenarios/src/states.js';
import type { SubmissionError } from '../run/submissions.js';

/*
 * Scenario declarations, architecture §7. An engineer's completion proposal
 * and a local architect's completion request each name the scenarios they
 * declare. A declaration names entry scenarios of its own work item's entry,
 * or, for an integration work item, its one integration scenario (§10): a
 * `pending` or `bound` one is accepted, and an `implemented` or `declared`
 * one is accepted and ignored, so a repeated submission is harmless. Any
 * other ID is a rejected submission with the reason, under the per-turn
 * bound the judge already applies.
 *
 * Which state an accepted declaration leaves is the harness's to decide at
 * acceptance, from the work item's open requirements and owed conformance.
 */

/** What a declaration is judged against: the work item's entry or integration scenario, and every tracked scenario. */
export interface DeclarationContext {
  /** The entry capability the work item implements; null for any other work item. */
  readonly entry: string | null;
  /**
   * The integration scenario an integration work item binds, which is the
   * one scenario it may declare; null or absent for every other work item.
   */
  readonly integration?: string | null | undefined;
  readonly records: readonly ScenarioRecord[];
}

/** The scenarios of one work item: its entry's, or an integration work item's one scenario; none for any other. */
export function ownScenarios(context: DeclarationContext): string[] {
  const integration = context.integration ?? null;
  return integration !== null
    ? [integration]
    : context.records.filter(record => record.kind === 'entry' && record.entry !== null && record.entry === context.entry).map(record => record.id);
}

/** Every reason the declared IDs cannot be accepted, each at its path. */
export function declarationErrors(ids: readonly string[], context: DeclarationContext, path = 'scenarios'): SubmissionError[] {
  const records = new Map(context.records.map(record => [record.id, record]));
  const integration = context.integration ?? null;
  const own = ownScenarios(context);
  const expected = own.length === 0 ? 'an empty list: this work item has no scenarios' : `IDs among ${own.join(', ')}`;
  const errors: SubmissionError[] = [];
  ids.forEach((id, index) => {
    const record = records.get(id);
    const at = `${path}.${index}`;
    if (record === undefined) {
      errors.push({ path: at, message: `"${id}" is no tracked scenario of this run`, expected });
      return;
    }
    // An integration work item declares its own scenario, and nothing else.
    if (integration !== null) {
      if (id === integration) return;
      errors.push({
        path: at,
        message: record.kind === 'integration'
          ? `${id} is another integration scenario; this work item binds ${integration} alone`
          : `${id} is an entry scenario of ${record.entry ?? 'no entry'}; this integration work item binds ${integration} alone`,
        expected,
      });
      return;
    }
    if (record.kind === 'integration') {
      errors.push({
        path: at,
        message: `${id} is an integration scenario; it is bound by its own integration work item once its sub-scenarios are implemented, never declared by an entry's`,
        expected,
      });
      return;
    }
    if (context.entry === null) {
      errors.push({ path: at, message: `This work item implements no entry capability, so it declares no scenario; ${id} belongs to ${record.entry ?? 'no entry'}`, expected });
      return;
    }
    if (record.entry !== context.entry) {
      errors.push({ path: at, message: `${id} is a scenario of ${record.entry ?? 'no entry'}, not of ${context.entry}, which this work item implements`, expected });
    }
  });
  return errors;
}

/**
 * The IDs an accepted declaration moves, once each, in the order given:
 * the `pending` ones. A `bound` one stays bound, and `declared` and
 * `implemented` ones are ignored.
 */
export function scenariosToDeclare(ids: readonly string[], states: ScenarioStates): string[] {
  const moved: string[] = [];
  for (const id of ids) {
    if (states.get(id) === 'pending' && !moved.includes(id)) moved.push(id);
  }
  return moved;
}

/**
 * Every reason an assignment's `scenarios` cannot name these IDs. The list is
 * informative, the scenarios the iteration is expected to bind, so it names
 * scenarios of this work item in any state; binding them is still declared
 * by the engineer, and the harness never requires exactly these.
 */
export function assignedScenarioErrors(ids: readonly string[], context: DeclarationContext, path = 'assignment.scenarios'): SubmissionError[] {
  const known = new Set(context.records.map(record => record.id));
  const own = ownScenarios(context);
  const expected = own.length === 0 ? 'no scenarios: this work item has none' : `IDs among ${own.join(', ')}`;
  const errors: SubmissionError[] = [];
  ids.forEach((id, index) => {
    if (own.includes(id)) return;
    errors.push({
      path: `${path}.${index}`,
      message: known.has(id)
        ? `${id} is not a scenario of this work item, so no iteration of it binds ${id}`
        : `"${id}" is no tracked scenario of this run`,
      expected,
    });
  });
  return errors;
}
