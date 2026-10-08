import { describe, expect, test } from 'vitest';
import { scenarioSourceHash, type ScenarioRecord } from '../../subs/scenarios/src/records.js';
import type { ScenarioState } from '../../subs/scenarios/src/states.js';
import { gateDiagnostics, passedScenarioLines } from '../checks/diagnostics.js';
import type { GateAttempt } from '../checks/records.js';
import { assignmentErrors, type AssignmentBody } from '../work/assignment.js';
import { iterationMessage } from '../work/engineer.js';
import type { IntegrationBriefing } from '../work/integration.js';
import type { IterationAssignment } from '../work/iterations.js';
import { obligationsOf } from '../work/obligations.js';
import type { WorkItem } from '../work/records.js';
import { entryScenariosOf } from '../work/scenario-briefing.js';
import { workItemMessage, type WorkItemBriefing } from '../work/session.js';
import { validateLocalArchitect } from '../work/submission.js';
import { assign, outline } from './helpers/iterations.js';

/*
 * What the agents of a work item are told about its scenarios, architecture
 * §6, and what a scenario check says to them, "Diagnostics" and "Binding is
 * recorded, not policed" of the scenario check.
 *
 * The local architect is given every scenario of its entry; the engineer
 * the obligations its assignment names, each scenario not done, the assigned
 * ones under "Scenarios to bind", and the three rules; an integration work item's engineer its scenario and the
 * step files it imports; a provider work item's briefings say nothing about
 * scenarios. No harness tool runs scenarios: the gate's committed audit
 * runs them through the project's configured scenario check, and a failing
 * gate names each tracked scenario's failure, a passed one its binding,
 * read from the provider's parsed Cucumber run. No process starts here.
 */

const shelfFile = 'subs/shelf/src/tests/features/demo-plan/shelf.feature';
const shelfSteps = 'subs/shelf/src/tests/steps/shelf.steps.ts';
const shelf = 'sample/shelf';

function record(id: string, name: string, extra: Partial<ScenarioRecord> = {}): ScenarioRecord {
  const source = [`Scenario: ${name}`, '  Given an empty shelf', `  When the user shelves "${id}"`, '  Then the shelf lists 1 book'];
  return {
    schema: 'ramify-agent.scenario/1',
    id,
    kind: 'entry',
    entry: 'shelve-books',
    owner: shelf,
    origin: { kind: 'architect', refs: [] },
    partOf: null,
    subScenarios: [],
    name,
    source,
    hash: scenarioSourceHash(source),
    file: shelfFile,
    ...extra,
  };
}

const records: ScenarioRecord[] = [
  record('sc-001', 'A shelved book is listed'),
  record('sc-002', 'A lent book is marked', { partOf: 'sc-005' }),
  record('sc-003', 'A returned book is listed again'),
  record('sc-004', 'Another entry\'s scenario', { entry: 'lend-books' }),
  record('sc-005', 'A lent book is shown on the shelf', { kind: 'integration', entry: null, subScenarios: ['sc-002'], owner: 'sample' }),
];

const states = (entries: Array<[string, ScenarioState]>) => new Map<string, ScenarioState>(entries);

function workItem(origin: WorkItem['origin']): WorkItem {
  return {
    schema: 'ramify-agent.work-item/1',
    id: 'wi-001',
    module: shelf,
    origin,
    goal: 'Shelve books.',
    requirementRefs: [],
    acceptanceRefs: [],
    contextRefs: [],
    startedFor: null,
  } as WorkItem;
}

function architectBriefing(item: WorkItem, extra: Partial<WorkItemBriefing> = {}): WorkItemBriefing {
  return {
    item,
    onboarding: { path: 'subs/shelf/README.md', purpose: 'Shelves books.' },
    views: { evidence: null, unavailable: 'this run has no architect view, so no API view was materialized' },
    hypotheses: [],
    registry: [],
    decisions: [],
    outlines: [],
    ...extra,
  };
}

/** Only what the message reads of an assignment. */
function assignment(extra: Partial<IterationAssignment> = {}): IterationAssignment {
  return {
    id: 'wi-001.i01',
    goal: 'Shelve books.',
    approach: 'Add the shelf.',
    completionEvidence: 'A test shelves a book.',
    scope: {
      base: { module: shelf, included: [] },
      bootstrap: [],
      resolved: { excluded: [], included: [], ownership: { provider: 'ramify.affected-cli/4', ramifyVersion: 'scripted-lifecycle-only', inputId: 'scripted-scope', configuration: 'tsconfig.json', root: '/p', modules: [{ id: 'app', parent: null, directory: '.' }], exclusions: [] }, roots: ['/p/subs/shelf'], files: [] },
    },
    gate: { checkpoint: 'iteration', tests: { policy: 'owned-by-scope', exactOwners: [shelf], subtrees: [], extraSuites: [] } },
    externalCapabilities: [],
    ...extra,
  } as unknown as IterationAssignment;
}

describe('the local architect\'s briefing', () => {
  test('an entry\'s work item: a section per scenario with its ID, state, text, file and, for a sub-scenario, the integration scenario', () => {
    const scenarios = entryScenariosOf(records, states([['sc-001', 'done'], ['sc-002', 'bound']]), 'shelve-books');
    expect(scenarios.map(scenario => `${scenario.id} ${scenario.state}`)).toEqual(['sc-001 done', 'sc-002 bound', 'sc-003 pending']);
    const text = workItemMessage(architectBriefing(workItem({ entry: 'shelve-books' }), { scenarios }));

    expect(text).toContain('## The scenarios of this work item');
    expect(text).toContain('Its entry has 3 scenarios.');
    expect(text).toContain([
      '### sc-002 (bound): A lent book is marked',
      '',
      `- Feature file: \`${shelfFile}\`.`,
      '- A sub-scenario of the integration scenario `sc-005`, whose integration work item is due once every sub-scenario is reported done.',
      '',
      '```gherkin',
      'Scenario: A lent book is marked',
      '  Given an empty shelf',
      '  When the user shelves "sc-002"',
      '  Then the shelf lists 1 book',
      '```',
    ].join('\n'));
    expect(text).toContain('### sc-001 (done): A shelved book is listed');
    expect(text).toContain('### sc-003 (pending): A returned book is listed again');
    // Another entry's scenario and the integration scenario are not this item's.
    expect(text).not.toContain('sc-004');
    expect(text).not.toContain('### sc-005');
    // How binding and reporting work, and the refusal: a pass is evidence, never the report.
    expect(text).toContain('`assignment.obligations`');
    expect(text).toContain('A passing gate is evidence, never your\nreport');
    expect(text).toContain('report it `done` in `reports`,\nwhatever fakes its binding names. A completion request that leaves one not `done` is rejected, naming it.');
    expect(text).not.toContain('`request-completion.scenarios`');
  });

  test('a provider work item\'s briefing says nothing about scenarios, and the completion refusal names what still blocks it', () => {
    expect(entryScenariosOf(records, states([]), null)).toEqual([]);
    const text = workItemMessage(architectBriefing(workItem({ obligation: { id: 'ob-001', revision: 1 } as never }), {
      delegation: { open: [], released: [], blocked: ['cap-001 has no accepted current handback'] },
    }));
    expect(text).not.toContain('## The scenarios of this work item');
    expect(text).toContain('## Completion was refused\n\n- cap-001 has no accepted current handback');
    expect(text).toContain('a capability request closes with an accepted current handback of its task, or an accepted consumer verification where it used an existing interface.');
    // A missing done report is never a refusal here: it is a rejected submission in its own turn.
    expect(text).not.toContain('report it `done`');
  });

  test('the last accepted iteration carries each scenario its gate passed, with the definition that bound each step', () => {
    const text = workItemMessage(architectBriefing(workItem({ entry: 'shelve-books' }), {
      lastIteration: {
        id: 'wi-001.i01', outcome: 'accepted', findings: [], commit: 'abc',
        scenarios: ['- `sc-001` "A shelved book is listed" passed, at `x.feature:10`, bound by:', '  - `Given an empty shelf` → `subs/other/src/tests/steps/other.steps.ts:3`'],
      },
    }));
    expect(text).toContain('The scenarios its gate passed, and the step definition that bound each step:\n\n- `sc-001` "A shelved book is listed" passed');
    expect(text).toContain('A definition outside the owner\'s own step files reached the run through an import, which Ramify verified.');
  });
});

describe('the engineer\'s briefing', () => {
  const entry = (entries: Array<[string, ScenarioState]>) => ({ kind: 'entry' as const, scenarios: entryScenariosOf(records, states(entries), 'shelve-books') });

  test('the obligations to bind with what each is, the assigned scenarios under "Scenarios to bind", the entry\'s other open ones, and the three rules', () => {
    const text = iterationMessage({
      assignment: assignment({ obligations: ['sc-003', 'test-001'] }),
      projectRoot: '/p',
      base: 'abc',
      scenarios: entry([['sc-001', 'done'], ['sc-002', 'bound']]),
      obligations: [{ id: 'sc-003', text: 'scenario "A returned book is listed again"' }, { id: 'test-001', text: 'registered test: a book shelved twice is listed once' }],
    });
    // PB3-D11: what the proposal must bind, and how.
    expect(text).toContain('## Obligations to bind\n\nThe architect assigned these to this iteration:\n\n- `sc-003`: scenario "A returned book is listed again"\n- `test-001`: registered test: a book shelved twice is listed once\n');
    expect(text).toContain('Your completion proposal\'s `bindings` names each of them exactly once, as `{ id, fakes }`');
    expect(text).toContain('A proposal that leaves one out is\nrefused with the missing IDs; report `partial` with what is unfinished instead.');
    const bind = text.indexOf('## Scenarios to bind');
    const others = text.indexOf('## The entry\'s other scenarios');
    expect(bind).toBeGreaterThan(0);
    expect(others).toBeGreaterThan(bind);
    expect(text.slice(bind, others)).toContain('### sc-003 (pending): A returned book is listed again');
    expect(text.slice(bind, others)).toContain(`- Feature file: \`${shelfFile}\`.`);
    expect(text.slice(bind, others)).toContain('```gherkin\nScenario: A returned book is listed again\n');
    expect(text.slice(others)).toContain('### sc-002 (bound): A lent book is marked');
    // A done scenario is counted, not listed.
    expect(text).not.toContain('### sc-001');
    expect(text).toContain('1 more scenario of the entry is reported done already; the gates run it too.');
    // The three rules, and named imports.
    expect(text).toContain('## Binding a scenario');
    expect(text).toContain('- Write step definitions in `src/tests/steps/` of a module within your write scope (a testing module\'s `src/steps/`). A run of these scenarios loads their owner\'s step files, `subs/shelf/src/tests/steps/`, and what those import.');
    expect(text).toContain('- Never edit a feature file.');
    expect(text).toContain('- Bind each assigned scenario in `bindings` of your completion proposal once its step definitions bind its steps, naming the fakes they rely on.');
    expect(text).toContain('never with a symbol-free\n  `import \'…\'`');
    expect(text).toContain('so the next gate\'s audit runs it through the project\'s configured scenario check');
    expect(text).not.toContain('run_scope_tests');
  });

  test('without assigned scenarios, every open one of the entry and nothing to bind; with all done, only that they are', () => {
    const open = iterationMessage({ assignment: assignment(), projectRoot: '/p', base: 'abc', scenarios: entry([]) });
    expect(open).toContain('## The scenarios of this work item\n\nEach scenario of its entry that is not done yet:');
    expect(open).not.toContain('## Scenarios to bind');
    expect(open).not.toContain('## Obligations to bind');
    for (const id of ['sc-001', 'sc-002', 'sc-003']) expect(open).toContain(`### ${id} (pending)`);

    const done = iterationMessage({
      assignment: assignment(), projectRoot: '/p', base: 'abc',
      scenarios: entry([['sc-001', 'done'], ['sc-002', 'done'], ['sc-003', 'done']]),
    });
    expect(done).toContain('Every scenario of its entry is reported done (3).');
    expect(done).not.toContain('## Binding a scenario');
  });

  test('an integration work item\'s engineer: the integration scenario, the step files it imports and how it is bound', () => {
    const integration: IntegrationBriefing = {
      scenario: { id: 'sc-005', name: 'A lent book is shown on the shelf', owner: 'sample', file: 'src/tests/features/demo-plan/demo-plan.feature', source: ['Scenario: A lent book is shown on the shelf', '  Given a lent book'], steps: 'src/tests/steps' },
      subScenarios: [{ id: 'sc-002', name: 'A lent book is marked', owner: shelf, file: shelfFile, source: [] }],
      owners: [{ module: shelf, directory: 'subs/shelf/src/tests/steps', files: [shelfSteps] }],
      scope: { module: 'sample', includedChildren: [shelf] },
    };
    const text = iterationMessage({ assignment: assignment(), projectRoot: '/p', base: 'abc', scenarios: { kind: 'integration', integration, state: 'pending' } });
    expect(text).toContain('## The integration scenario to bind: sc-005 (pending): A lent book is shown on the shelf');
    expect(text).toContain('```gherkin\nScenario: A lent book is shown on the shelf\n  Given a lent book\n```');
    expect(text).toContain(`- \`${shelf}\`, in \`subs/shelf/src/tests/steps/\`: \`${shelfSteps}\`.`);
    expect(text).toContain('- Write one step file in `src/tests/steps/` that imports the step files above and defines no step of its own');
    expect(text).toContain('`expose-test`');
    expect(text).toContain('- Bind `sc-005` in `bindings` of your completion proposal once your step file binds it, naming the fakes');
    expect(text).not.toContain('bridging');
    expect(text).toContain('never with a symbol-free');
  });

  test('a provider work item\'s engineer is told nothing about scenarios', () => {
    const text = iterationMessage({ assignment: assignment(), projectRoot: '/p', base: 'abc' });
    expect(text).not.toMatch(/scenario/i);
  });
});

describe('assignment.obligations', () => {
  const item = (id: string, origin: WorkItem['origin']): WorkItem => ({ ...workItem(origin), id });
  const projection = obligationsOf({
    scenarios: records, workItems: [item('wi-001', { entry: 'shelve-books' }), item('wi-002', { entry: 'lend-books' })], events: [],
  });
  const context = { actor: { kind: 'work-item' as const, id: 'wi-001' }, projection };
  const body = (obligations: string[] | undefined): AssignmentBody => ({ ...assign(shelf).assignment, ...(obligations === undefined ? {} : { obligations }) }) as AssignmentBody;
  const evidence = () => ({ index: null, registry: new Map(), outline: null, obligations: context });

  test('names this architect\'s obligations in any state; another work item\'s, an integration scenario and an unknown ID are refused at their path', () => {
    expect(assignmentErrors(body(['sc-001', 'sc-003']), evidence())).toEqual([]);
    expect(assignmentErrors(body(undefined), evidence())).toEqual([]);
    expect(assignmentErrors(body(['sc-004', 'sc-005', 'sc-009', 'sc-002']), evidence())).toEqual([
      { path: 'assignment.obligations.0', message: 'sc-004 is reported by the local architect of wi-002, so the local architect of wi-001 cannot assign its binding', expected: 'IDs among sc-001, sc-002, sc-003' },
      { path: 'assignment.obligations.1', message: 'sc-005 is reported by the local architect of sc-005\'s integration work item, which does not exist yet, so the local architect of wi-001 cannot assign its binding', expected: 'IDs among sc-001, sc-002, sc-003' },
      { path: 'assignment.obligations.2', message: '"sc-009" is no registered obligation of this run', expected: 'IDs among sc-001, sc-002, sc-003' },
    ]);
    // Without the run's obligations nothing may be named.
    expect(assignmentErrors(body(['sc-001']), { index: null, registry: new Map(), outline: null })).toEqual([
      { path: 'assignment.obligations', message: 'This assignment has no obligation context, so it names no obligation', expected: 'an empty list' },
    ]);
  });

  test('the local architect\'s submission is judged with it, and a corrected list is accepted', () => {
    const submission = { ...assign(shelf, {}, outline()), assignment: { ...assign(shelf).assignment, obligations: ['sc-004'] } };
    const refused = validateLocalArchitect(submission, { index: null, registry: new Map(), obligations: context });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.errors.map(error => error.path)).toEqual(['assignment.obligations.0']);
    const accepted = validateLocalArchitect({ ...submission, assignment: { ...submission.assignment, obligations: ['sc-003'] } }, { index: null, registry: new Map(), obligations: context });
    expect(accepted.ok).toBe(true);
  });
});

describe('no harness scenario run', () => {
  test('an engineer is told the gate\'s audit runs its scenarios through the configured check, and is offered no scope test tool', () => {
    const entry = { kind: 'entry' as const, scenarios: entryScenariosOf(records, states([['sc-002', 'bound']]), 'shelve-books') };
    const text = iterationMessage({ assignment: assignment({ obligations: ['sc-003'] }), projectRoot: '/p', base: 'abc', scenarios: entry,
      obligations: [{ id: 'sc-003', text: 'scenario "A returned book is listed again"' }] });
    expect(text).toContain('Binding removes its pending tag, so the next gate\'s audit runs it through the project\'s configured scenario check; a pending scenario is not run.');
    expect(text).not.toContain('run_scope_tests');
    expect(text).not.toContain('quick mode');
    expect(text).not.toContain('selected by identity');
  });
});

/** A gate whose committed audit's configured Cucumber check reported `scenarios`, as the provider publishes its parsed run. */
function auditedGate(scenarios: readonly unknown[], passed: boolean): GateAttempt {
  const check = {
    status: passed ? 'passed' : 'failed', passed, summary: passed ? 'scenarios passed' : 'scenarios failed', output: passed ? '' : '2 scenarios failed',
    cucumberMessages: { status: 'read', run: { scenarios } },
  };
  return {
    id: 'ga-0007', cause: passed ? null : 'check-failed', commands: [], guardedChanges: [], rules: [],
    audit: {
      requestId: 'run-1:ga-0007', mode: 'project-default', status: 'completed', definition: { path: 'ramify-audit.json', blob: 'b'.repeat(40) },
      requestedSourceCommit: 'c'.repeat(40), auditedSourceCommit: 'c'.repeat(40), requestedMode: 'ramify-partial', executedMode: 'ramify-partial',
      fallbackReason: null, reuse: null, verdict: passed ? 'pass' : 'fail', detail: passed ? 'composed pass' : 'composed fail',
    },
    provider: { result: { status: 'completed', summary: { coverage: { universe: { checkIds: ['agent-scenarios'] } } } }, checks: { 'agent-scenarios': check } },
  } as unknown as GateAttempt;
}

/** One scenario of a provider's parsed Cucumber run. */
function parsed(id: string | null, line: number, outcome: 'passed' | 'failed' | 'skipped', steps: unknown[]) {
  return { uri: shelfFile, line, name: id ?? 'An unplanned scenario', tags: id === null ? ['@smoke'] : [`@ramify-${id}`], outcome, steps };
}

const step = (text: string, status: string, line?: number, errorMessage?: string) => ({
  text, status, definitionLocations: line === undefined ? [] : [{ uri: shelfSteps, line }], ...(errorMessage === undefined ? {} : { errorMessage }),
});

const passing = parsed('sc-001', 10, 'passed', [step('an empty shelf', 'PASSED', 8), step('the user shelves "Dune"', 'PASSED', 12), step('the shelf lists 1 book', 'PASSED', 28)]);

describe('diagnostics from the raw runner output of the configured scenario check', () => {
  const names = new Map([['sc-001', 'A shelved book is listed'], ['sc-002', 'A miscounted shelf fails'], ['sc-003', 'Lending is not defined yet']]);

  test('per failing tracked scenario its name, check, file and line, failing step, message and undefined steps; the project\'s own failures by count', async () => {
    const gate = auditedGate([
      parsed('sc-002', 16, 'failed', [step('an empty shelf', 'PASSED', 8), step('the shelf lists 2 books', 'FAILED', 28, 'AssertionError [ERR_ASSERTION]: 1 !== 2\n    at World.<anonymous>')]),
      parsed('sc-003', 22, 'failed', [step('an empty shelf', 'PASSED', 8), step('the user lends "Dune" to Ada', 'UNDEFINED')]),
      passing,
      parsed(null, 40, 'failed', [step('something unplanned', 'FAILED', 3, 'boom')]),
    ], false);
    for (const audience of ['engineer', 'local-architect'] as const) {
      const { summary: lines } = await gateDiagnostics(gate, audience, names);
      const text = lines.join('\n');
      expect(lines[0]).toBe('- audit `run-1:ga-0007`, the project\'s default audit of `' + 'c'.repeat(40) + '` under `ramify-audit.json`: requested ramify-partial, executed ramify-partial; composed verdict `fail`, composed fail');
      expect(text).toContain('- `agent-scenarios`: failed; the provider\'s record of it follows:');
      expect(text).toContain(`- scenario \`sc-002\` "A miscounted shelf fails" failed in \`agent-scenarios\`, at \`${shelfFile}:16\`:\n  - The failing step: \`the shelf lists 2 books\`.\n  - Its message:`);
      expect(text).toMatch(/AssertionError/);
      expect(text).toContain('1 !== 2');
      expect(text).toContain(`- scenario \`sc-003\` "Lending is not defined yet" undefined in \`agent-scenarios\`, at \`${shelfFile}:22\`:`);
      expect(text).toContain('  - No step definition matches "the user lends "Dune" to Ada".');
      // A passed scenario is not repeated as a failure; an untracked one is counted, not named.
      expect(text).not.toContain('`sc-001` "A shelved book is listed" failed');
      expect(text).toContain('- 1 of the project\'s own scenarios failed.');
      expect(text).not.toContain('An unplanned scenario');
    }
  });

  test('a passed gate carries the binding of each scenario, and a message is bounded', async () => {
    const passed = auditedGate([passing], true);
    expect(passedScenarioLines(passed, names)).toEqual([
      `- \`sc-001\` "A shelved book is listed" passed in \`agent-scenarios\`, at \`${shelfFile}:10\`, bound by:`,
      `  - \`an empty shelf\` → \`${shelfSteps}:8\``,
      `  - \`the user shelves "Dune"\` → \`${shelfSteps}:12\``,
      `  - \`the shelf lists 1 book\` → \`${shelfSteps}:28\``,
    ]);

    const long = auditedGate([parsed('sc-001', 10, 'failed', [step('Then it fails', 'FAILED', 3, Array.from({ length: 40 }, (_, line) => `line ${line}`).join('\n'))])], false);
    const bounded = (await gateDiagnostics(long, 'engineer', names)).summary;
    expect(bounded).toContain('        line 11');
    expect(bounded).not.toContain('        line 12');
    expect(bounded).toContain('        …');
  });
});
