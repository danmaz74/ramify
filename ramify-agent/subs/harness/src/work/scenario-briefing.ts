import type { ScenarioRecord } from '../../subs/scenarios/src/records.js';
import type { ScenarioState, ScenarioStates } from '../../subs/scenarios/src/states.js';
import type { IntegrationBriefing } from './integration.js';
import { stepDirectoryOf } from './integration.js';

/*
 * What the briefings of a work item's agents say about its scenarios,
 * architecture §6. The local architect is given every scenario of its work
 * item's entry; the engineer the ones its assignment names under "Scenarios
 * to bind", the entry's others that are not done, and the rules of binding.
 * A provider or follow-up work item has no scenarios, and its briefings say
 * nothing about them. A state is the obligation status that accepted
 * submissions set; no gate result is folded into one.
 */

/** One scenario as a briefing carries it. */
export interface BriefedScenario {
  readonly id: string;
  readonly name: string;
  readonly state: ScenarioState;
  /** The project-relative feature file the harness wrote it into. */
  readonly file: string;
  /** The `Scenario` block, as the feature file carries it. */
  readonly source: readonly string[];
  /** For a sub-scenario: the integration scenario it was derived from. */
  readonly partOf: string | null;
}

/** The entry scenarios of one entry, in their order, with their states; none for a work item without an entry. */
export function entryScenariosOf(records: readonly ScenarioRecord[], states: ScenarioStates, entry: string | null): BriefedScenario[] {
  if (entry === null) return [];
  return records
    .filter(record => record.kind === 'entry' && record.entry === entry)
    .map(record => briefed(record, states.get(record.id) ?? 'pending'));
}

/** One record as a briefing carries it. */
export function briefed(record: ScenarioRecord, state: ScenarioState): BriefedScenario {
  return { id: record.id, name: record.name, state, file: record.file, source: record.source, partOf: record.partOf };
}

/** What an engineer is told of its work item's scenarios. */
export type EngineerScenarios =
  | {
    readonly kind: 'entry';
    /** Every scenario of the work item's entry, done ones included. */
    readonly scenarios: readonly BriefedScenario[];
  }
  | {
    readonly kind: 'integration';
    readonly integration: IntegrationBriefing;
    readonly state: ScenarioState;
  };

/** The lines of one scenario: its heading, its file, its origin and its text. */
export function scenarioLines(scenario: BriefedScenario, level = '###'): string[] {
  return [
    `${level} ${scenario.id} (${scenario.state}): ${scenario.name}`,
    '',
    `- Feature file: \`${scenario.file}\`.`,
    ...(scenario.partOf === null ? [] : [`- A sub-scenario of the integration scenario \`${scenario.partOf}\`, whose integration work item is due once every sub-scenario is reported done.`]),
    '',
    '```gherkin',
    ...scenario.source,
    '```',
    '',
  ];
}

/**
 * The local architect's section: every scenario of its work item's entry,
 * with its state, and what binding and reporting them means.
 */
export function architectScenarioSection(scenarios: readonly BriefedScenario[]): string[] {
  if (scenarios.length === 0) return [];
  const lines: string[] = ['## The scenarios of this work item', ''];
  lines.push(
    `Its entry has ${scenarios.length} scenario${scenarios.length === 1 ? '' : 's'}. The harness wrote each into its feature file,`,
    'and no agent edits a feature file. The work item completes only when you have reported every one `done`.',
    '',
  );
  for (const scenario of scenarios) lines.push(...scenarioLines(scenario));
  lines.push(
    'A scenario is bound by step definitions, which an engineer writes in `src/tests/steps/` of the owner (a testing',
    'module\'s `src/steps/`). Name the scenarios an iteration is to bind in `assignment.obligations`; its engineer\'s',
    'accepted proposal binds each, naming the fakes the binding relies on, and the scenario is `bound` and loses its',
    'pending tag at the next commit, so the gates\' configured checks run it. A passing gate is evidence, never your',
    'report: when, in your judgment, a scenario is correctly implemented and passing, report it `done` in `reports`,',
    'whatever fakes its binding names. A completion request that leaves one not `done` is rejected, naming it.',
    '',
  );
  return lines;
}

/**
 * The engineer's scenario sections: the assigned ones under "Scenarios to
 * bind", the rest of the entry's ones that are not done, and the rules of
 * binding. Nothing for a work item without scenarios.
 */
export function engineerScenarioSection(scenarios: EngineerScenarios | undefined, assigned: readonly string[] = []): string[] {
  if (scenarios === undefined) return [];
  if (scenarios.kind === 'integration') return integrationEngineerSection(scenarios.integration, scenarios.state);
  if (scenarios.scenarios.length === 0) return [];

  const open = scenarios.scenarios.filter(scenario => scenario.state !== 'done');
  const done = scenarios.scenarios.length - open.length;
  const toBind = scenarios.scenarios.filter(scenario => assigned.includes(scenario.id));
  const others = open.filter(scenario => !assigned.includes(scenario.id));
  const lines: string[] = [];

  if (toBind.length > 0) {
    lines.push('## Scenarios to bind', '', 'The architect expects this iteration to bind these:', '');
    for (const scenario of toBind) lines.push(...scenarioLines(scenario));
  }
  if (others.length > 0) {
    lines.push(toBind.length > 0 ? '## The entry\'s other scenarios' : '## The scenarios of this work item', '');
    lines.push(toBind.length > 0
      ? 'Not done yet either, and not assigned to this iteration, so not yours to bind:'
      : 'Each scenario of its entry that is not done yet:', '');
    for (const scenario of others) lines.push(...scenarioLines(scenario));
  }
  if (toBind.length === 0 && others.length === 0) {
    lines.push('## The scenarios of this work item', '', `Every scenario of its entry is reported done (${done}). The gates run them, and a change that fails one fails the gate.`, '');
    return lines;
  }
  if (done > 0) lines.push(`${done} more scenario${done === 1 ? ' of the entry is' : 's of the entry are'} reported done already; the gates run ${done === 1 ? 'it' : 'them'} too.`, '');

  const directories = [...new Set(open.map(scenario => stepDirectoryOf(scenario.file)))];
  lines.push(
    '## Binding a scenario',
    '',
    `- Write step definitions in \`src/tests/steps/\` of a module within your write scope (a testing module's \`src/steps/\`). A run of these scenarios loads their owner's step files, ${directories.map(directory => `\`${directory}/\``).join(', ')}, and what those import.`,
    '- Never edit a feature file. The harness writes them, and a write to one is refused.',
    '- Bind each assigned scenario in `bindings` of your completion proposal once its step definitions bind its steps, naming the fakes they rely on. `run_scope_tests` shows you how they run in quick mode; the next gate runs every bound scenario strictly, without its pending tag.',
    ...namedImportLines(),
    '',
  );
  return lines;
}

/** The request for named imports of another owner's step files, which Ramify verifies where a symbol-free import escapes it. */
function namedImportLines(): string[] {
  return [
    '- Import another owner\'s step file by name, as `import { reviewSteps } from \'…\'`, never with a symbol-free',
    '  `import \'…\'`: a symbol-free import loads the file without Ramify verifying that its owner exposes it.',
  ];
}

/** The integration engineer's section: the scenario, what it imports and how it is bound. */
function integrationEngineerSection(integration: IntegrationBriefing, state: ScenarioState): string[] {
  const { scenario } = integration;
  const lines: string[] = [
    `## The integration scenario to bind: ${scenario.id} (${state}): ${scenario.name}`,
    '',
    `- Feature file: \`${scenario.file}\`.`,
    `- Its owner, \`${scenario.owner}\`, is the lowest common ancestor of its sub-scenarios' owners, and every sub-scenario is reported done.`,
    '',
    '```gherkin',
    ...scenario.source,
    '```',
    '',
    '### The step files it imports',
    '',
  ];
  for (const sub of integration.subScenarios) lines.push(`- \`${sub.id}\` (${sub.name}) is owned by \`${sub.owner}\`.`);
  for (const owner of integration.owners) {
    lines.push(`- \`${owner.module}\`, in \`${owner.directory}/\`: ${owner.files.length === 0 ? 'none yet' : owner.files.map(file => `\`${file}\``).join(', ')}.`);
  }
  lines.push(
    '',
    '## Binding it',
    '',
    `- Write one step file in \`${scenario.steps}/\` that imports the step files above and defines no step of its own:`,
    '  the sub-scenarios\' definitions bind every step. Add the `expose-test` declarations along each path, so this',
    '  module receives them.',
    '- Never edit a feature file. The harness writes them, and a write to one is refused.',
    `- Bind \`${scenario.id}\` in \`bindings\` of your completion proposal once your step file binds it, naming the fakes`,
    '  it relies on. `run_scope_tests` shows you how it runs in quick mode; the gate runs it strictly.',
    ...namedImportLines(),
    '',
  );
  return lines;
}
