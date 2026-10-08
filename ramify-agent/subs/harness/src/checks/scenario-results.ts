import type { GateAttempt } from './records.js';

/*
 * What a gate's audit says of each tracked scenario, read from the raw runner
 * output the provider published: every Cucumber command's parsed run, whose
 * scenarios carry their executed tags. A scenario is identified by its
 * `@ramify-sc-NNN` tag; the project's own scenarios carry none and are
 * counted, not named.
 *
 * This is inspection context only. The audit's composed verdict is the
 * gate's answer, and no result here moves a scenario's state, creates a
 * report or withdraws one.
 */

/** One scenario's result in one Cucumber run: the worst of its steps. */
export type ScenarioResultStatus = 'passed' | 'failed' | 'undefined' | 'pending' | 'ambiguous' | 'skipped';

/** One tracked scenario as one configured Cucumber command ran it. */
export interface ScenarioResult {
  readonly id: string;
  /** The configured check, and the command within it, that ran it. */
  readonly check: string;
  readonly command: string | null;
  readonly status: ScenarioResultStatus;
  /** The feature file as Cucumber's messages give it, relative to where it ran. */
  readonly file: string;
  readonly line: number;
  readonly failure: { readonly step: string; readonly message: string } | null;
  /** Step texts no definition matched. */
  readonly undefined: readonly string[];
  /** The definition that bound each step, `uri:line`. */
  readonly binding: ReadonlyArray<{ readonly step: string; readonly definition: string }>;
}

/** The project's own scenarios, those without an identity tag, by outcome. */
export interface UntrackedScenarioCounts {
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
}

const identityTag = /^@ramify-(sc-\d{3,})$/u;

/** Every tracked scenario the gate's audit ran, in the order the provider listed them. */
export function scenarioResultsOf(gate: Pick<GateAttempt, 'provider'>): ScenarioResult[] {
  return cucumberRunsOf(gate).flatMap(({ check, command, scenarios }) => scenarios.flatMap(scenario => {
    const id = scenario.tags.map(tag => identityTag.exec(tag)?.[1]).find(found => found !== undefined);
    return id === undefined ? [] : [resultOf(id, check, command, scenario)];
  }));
}

/** The project's own scenarios the gate's audit ran, by outcome. */
export function untrackedScenarioCounts(gate: Pick<GateAttempt, 'provider'>): UntrackedScenarioCounts {
  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const { scenarios } of cucumberRunsOf(gate)) {
    for (const scenario of scenarios) {
      if (scenario.tags.some(tag => identityTag.test(tag))) continue;
      counts[scenario.outcome] += 1;
    }
  }
  return counts;
}

/** One scenario as the provider's parsed run gives it. */
interface RunScenario {
  readonly uri: string;
  readonly line: number;
  readonly tags: readonly string[];
  readonly outcome: 'passed' | 'failed' | 'skipped';
  readonly steps: ReadonlyArray<{ readonly text: string; readonly status: string; readonly definitionLocations: ReadonlyArray<{ readonly uri: string; readonly line?: number }>; readonly errorMessage?: string }>;
  readonly message?: string;
}

function resultOf(id: string, check: string, command: string | null, scenario: RunScenario): ScenarioResult {
  const statuses = scenario.steps.map(step => step.status.toLowerCase());
  const status: ScenarioResultStatus = statuses.includes('undefined') ? 'undefined'
    : statuses.includes('ambiguous') ? 'ambiguous'
      : statuses.includes('pending') ? 'pending' : scenario.outcome;
  const failing = scenario.steps.find(step => step.status.toLowerCase() === 'failed');
  return {
    id, check, command, status, file: scenario.uri, line: scenario.line,
    failure: failing === undefined ? null : { step: failing.text, message: failing.errorMessage ?? scenario.message ?? '' },
    undefined: scenario.steps.filter(step => step.status.toLowerCase() === 'undefined').map(step => step.text),
    binding: scenario.steps.flatMap(step => step.definitionLocations.length === 1
      ? [{ step: step.text, definition: `${step.definitionLocations[0]!.uri}${step.definitionLocations[0]!.line === undefined ? '' : `:${step.definitionLocations[0]!.line}`}` }]
      : []),
  };
}

/** Every parsed Cucumber run among the gate's published check results, with the check and command that ran it. */
function cucumberRunsOf(gate: Pick<GateAttempt, 'provider'>): Array<{ check: string; command: string | null; scenarios: RunScenario[] }> {
  const checks = gate.provider?.checks;
  if (!isRecord(checks)) return [];
  const runs: Array<{ check: string; command: string | null; scenarios: RunScenario[] }> = [];
  for (const [check, value] of Object.entries(checks)) {
    if (!isRecord(value)) continue;
    // A command's own run is preferred; the check's level only stands for a
    // check whose commands report none, so no scenario is counted twice.
    const commands = isRecord(value['commands']) ? value['commands'] : {};
    const own = Object.entries(commands).flatMap(([command, entry]) => {
      const scenarios = isRecord(entry) ? scenariosOf(entry) : null;
      return scenarios === null ? [] : [{ check, command, scenarios }];
    });
    const level = own.length === 0 ? scenariosOf(value) : null;
    runs.push(...own, ...(level === null ? [] : [{ check, command: null, scenarios: level }]));
  }
  return runs;
}

function scenariosOf(result: Record<string, unknown>): RunScenario[] | null {
  const messages = result['cucumberMessages'];
  if (!isRecord(messages) || messages['status'] !== 'read' || !isRecord(messages['run'])) return null;
  const scenarios = messages['run']['scenarios'];
  if (!Array.isArray(scenarios)) return null;
  return scenarios.filter((scenario): scenario is RunScenario => isRecord(scenario) && typeof scenario['uri'] === 'string'
    && typeof scenario['line'] === 'number' && Array.isArray(scenario['tags']) && Array.isArray(scenario['steps'])
    && (scenario['outcome'] === 'passed' || scenario['outcome'] === 'failed' || scenario['outcome'] === 'skipped'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
