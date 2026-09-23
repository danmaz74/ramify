import type { ScenarioRecord } from '../../subs/scenarios/src/records.js';
import type { ScenarioState, ScenarioStates } from '../../subs/scenarios/src/states.js';
import type { IntegrationBriefing } from './integration.js';
import { stepDirectoryOf } from './integration.js';

/*
 * What the briefings of a work item's agents say about its scenarios,
 * architecture §6. The local architect is given every scenario of its work
 * item's entry; the engineer each one that is not implemented yet, the ones
 * its assignment names under "Scenarios to bind", and the three rules of
 * binding. A provider or follow-up work item has no scenarios, and its
 * briefings say nothing about them.
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
    /** Every scenario of the work item's entry, implemented ones included. */
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
    ...(scenario.partOf === null ? [] : [`- A sub-scenario of the integration scenario \`${scenario.partOf}\`, which its integration work item binds once every sub-scenario is implemented.`]),
    '',
    '```gherkin',
    ...scenario.source,
    '```',
    '',
  ];
}

/**
 * The local architect's section: every scenario of its work item's entry,
 * with its state, and what binding and declaring them means.
 */
export function architectScenarioSection(scenarios: readonly BriefedScenario[]): string[] {
  if (scenarios.length === 0) return [];
  const lines: string[] = ['## The scenarios of this work item', ''];
  lines.push(
    `Its entry has ${scenarios.length} scenario${scenarios.length === 1 ? '' : 's'}. The harness wrote each into its feature file,`,
    'and no agent edits a feature file. The work item completes only when every one is `implemented`.',
    '',
  );
  for (const scenario of scenarios) lines.push(...scenarioLines(scenario));
  lines.push(
    'A scenario is bound by step definitions, which an engineer writes in `src/tests/steps/` of the owner (a testing',
    'module\'s `src/steps/`), and declared once they bind its steps and it passes. Declaring leaves it `bound` while the work',
    'item runs against a fake, with its pending tag kept, and `declared` otherwise; a `declared` scenario becomes',
    '`implemented` when a gate passes it. Name the scenarios an iteration is to bind in `assignment.scenarios`; declare',
    'the ones existing step definitions already bind in `request-completion.scenarios`. Completion is refused while any',
    'of them is `pending` or `bound`.',
    '',
  );
  return lines;
}

/**
 * The engineer's scenario sections: the assigned ones under "Scenarios to
 * bind", the rest of the entry's unimplemented ones, and the rules of
 * binding. Nothing for a work item without scenarios.
 */
export function engineerScenarioSection(scenarios: EngineerScenarios | undefined, assigned: readonly string[] = []): string[] {
  if (scenarios === undefined) return [];
  if (scenarios.kind === 'integration') return integrationEngineerSection(scenarios.integration, scenarios.state);
  if (scenarios.scenarios.length === 0) return [];

  const open = scenarios.scenarios.filter(scenario => scenario.state !== 'implemented');
  const implemented = scenarios.scenarios.length - open.length;
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
      ? 'Not implemented yet either, and yours to declare only once your step definitions bind them:'
      : 'Each scenario of its entry that is not implemented yet:', '');
    for (const scenario of others) lines.push(...scenarioLines(scenario));
  }
  if (toBind.length === 0 && others.length === 0) {
    lines.push('## The scenarios of this work item', '', `Every scenario of its entry is implemented (${implemented}). The gates run them, and a change that fails one fails the gate.`, '');
    return lines;
  }
  if (implemented > 0) lines.push(`${implemented} more scenario${implemented === 1 ? ' of the entry is' : 's of the entry are'} implemented already; the gates run ${implemented === 1 ? 'it' : 'them'} too.`, '');

  const directories = [...new Set(open.map(scenario => stepDirectoryOf(scenario.file)))];
  lines.push(
    '## Binding a scenario',
    '',
    `- Write step definitions in \`src/tests/steps/\` of a module within your write scope (a testing module's \`src/steps/\`). A run of these scenarios loads their owner's step files, ${directories.map(directory => `\`${directory}/\``).join(', ')}, and what those import.`,
    '- Never edit a feature file. The harness writes them, and a write to one is refused.',
    '- Declare a scenario in `scenarios` of your completion proposal only once its steps are defined and it passes in quick mode, which `run_scope_tests` shows you: it runs your scope\'s scenarios, these included. The gate runs every declared scenario strictly.',
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
    `- Its owner, \`${scenario.owner}\`, is the lowest common ancestor of its sub-scenarios' owners, and every sub-scenario is implemented.`,
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
    `- Declare \`${scenario.id}\` in \`scenarios\` of your completion proposal only once it passes in quick mode, which`,
    '  `run_scope_tests` shows you. The gate runs it strictly.',
    ...namedImportLines(),
    '',
    'When it fails while its sub-scenarios pass, a bridging Given assumed what the real behavior does not do; the',
    'failure names the suspect sub-scenario.',
    '',
  );
  return lines;
}
