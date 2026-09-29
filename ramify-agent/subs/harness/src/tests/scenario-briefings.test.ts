import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import type { CommandRequest, CommandRun, CommandRunner } from '../../subs/evidence/src/run-command.js';
import { scenarioSourceHash, type ScenarioRecord } from '../../subs/scenarios/src/records.js';
import type { ScenarioState } from '../../subs/scenarios/src/states.js';
import { planScenarioCheck, type PlannedScenario, type ProjectCommands, type ScenarioCheckInputs } from '../checks/checkpoint.js';
import { gateDiagnostics, scenarioCheckLines } from '../checks/diagnostics.js';
import { checkCommand, type GateAttempt, type GateCommandRecord, type ScenarioCheckSummary } from '../checks/records.js';
import { runScenarioCheck, type ScenarioCheckPlan } from '../checks/scenario-check.js';
import { assignmentErrors, type AssignmentBody } from '../work/assignment.js';
import { createScopeTestsTool, iterationMessage, type ScopeScenarioObservation } from '../work/engineer.js';
import type { IntegrationBriefing } from '../work/integration.js';
import type { IterationAssignment } from '../work/iterations.js';
import type { WorkItem } from '../work/records.js';
import { entryScenariosOf } from '../work/scenario-briefing.js';
import { workItemMessage, type WorkItemBriefing } from '../work/session.js';
import { validateLocalArchitect } from '../work/submission.js';
import { assign, outline } from './helpers/iterations.js';
import { architectIndex, moduleEntry } from './helpers/views.js';

/*
 * What the agents of a work item are told about its scenarios, architecture
 * §6, and what a scenario check says to them, "Diagnostics" and "Binding is
 * recorded, not policed" of the scenario check.
 *
 * The local architect is given every scenario of its entry; the engineer
 * each one not implemented, the assigned ones under "Scenarios to bind", and
 * the three rules; an integration work item's engineer its scenario and the
 * step files it imports; a provider work item's briefings say nothing about
 * scenarios. `run_scope_tests` runs the scope's scenarios in quick mode, and
 * a failing gate names each scenario's failure and each passed one's
 * binding. The streams are the `scenarios` module's recordings of the real
 * cucumber-js; no process starts here.
 */

const streams = fileURLToPath(new URL('../../subs/scenarios/src/tests/fixtures/streams/', import.meta.url));
const shelfFile = 'subs/shelf/src/tests/features/demo-plan/shelf.feature';
const shelfSteps = 'subs/shelf/src/tests/steps/shelf.steps.ts';
const shelf = 'sample/shelf';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()));
});

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'ramify-agent-scenario-briefings-'));
  cleanups.push(() => rm(path, { recursive: true, force: true }));
  return path;
}

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
      base: { module: shelf, includedChildren: [] },
      bootstrap: [],
      resolved: { roots: ['/p/subs/shelf'], files: [] },
    },
    gate: { checkpoint: 'iteration', tests: { policy: 'owned-by-scope', exactOwners: [shelf], subtrees: [], extraSuites: [] } },
    externalCapabilities: [],
    ...extra,
  } as unknown as IterationAssignment;
}

describe('the local architect\'s briefing', () => {
  test('an entry\'s work item: a section per scenario with its ID, state, text, file and, for a sub-scenario, the integration scenario', () => {
    const scenarios = entryScenariosOf(records, states([['sc-001', 'implemented'], ['sc-002', 'bound']]), 'shelve-books');
    expect(scenarios.map(scenario => `${scenario.id} ${scenario.state}`)).toEqual(['sc-001 implemented', 'sc-002 bound', 'sc-003 pending']);
    const text = workItemMessage(architectBriefing(workItem({ entry: 'shelve-books' }), { scenarios }));

    expect(text).toContain('## The scenarios of this work item');
    expect(text).toContain('Its entry has 3 scenarios.');
    expect(text).toContain([
      '### sc-002 (bound): A lent book is marked',
      '',
      `- Feature file: \`${shelfFile}\`.`,
      '- A sub-scenario of the integration scenario `sc-005`, which its integration work item binds once every sub-scenario is implemented.',
      '',
      '```gherkin',
      'Scenario: A lent book is marked',
      '  Given an empty shelf',
      '  When the user shelves "sc-002"',
      '  Then the shelf lists 1 book',
      '```',
    ].join('\n'));
    expect(text).toContain('### sc-001 (implemented): A shelved book is listed');
    expect(text).toContain('### sc-003 (pending): A returned book is listed again');
    // Another entry's scenario and the integration scenario are not this item's.
    expect(text).not.toContain('sc-004');
    expect(text).not.toContain('### sc-005');
    // How binding and declaring work, and the refusal.
    expect(text).toContain('`assignment.scenarios`');
    expect(text).toContain('`request-completion.scenarios`');
    expect(text).toContain('Completion is refused while any\nof them is `pending` or `bound`.');
  });

  test('a provider work item\'s briefing says nothing about scenarios, and the completion refusal names what implements one', () => {
    expect(entryScenariosOf(records, states([]), null)).toEqual([]);
    const text = workItemMessage(architectBriefing(workItem({ obligation: { id: 'ob-001', revision: 1 } as never }), {
      delegation: { open: [], released: [], blocked: ['sc-001 is pending: nothing has declared it'] },
    }));
    expect(text).not.toContain('## The scenarios of this work item');
    expect(text).toContain('a scenario is implemented when a gate passes it after its declaration, so declare with the request the ones existing step definitions bind, and assign an iteration that writes the step definitions for the others.');
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

  test('the assigned scenarios under "Scenarios to bind", the entry\'s other unimplemented ones, and the three rules', () => {
    const text = iterationMessage({
      assignment: assignment({ scenarios: ['sc-003'] }),
      projectRoot: '/p',
      base: 'abc',
      scenarios: entry([['sc-001', 'implemented'], ['sc-002', 'declared']]),
    });
    const bind = text.indexOf('## Scenarios to bind');
    const others = text.indexOf('## The entry\'s other scenarios');
    expect(bind).toBeGreaterThan(0);
    expect(others).toBeGreaterThan(bind);
    expect(text.slice(bind, others)).toContain('### sc-003 (pending): A returned book is listed again');
    expect(text.slice(bind, others)).toContain(`- Feature file: \`${shelfFile}\`.`);
    expect(text.slice(bind, others)).toContain('```gherkin\nScenario: A returned book is listed again\n');
    expect(text.slice(others)).toContain('### sc-002 (declared): A lent book is marked');
    // An implemented scenario is counted, not listed.
    expect(text).not.toContain('### sc-001');
    expect(text).toContain('1 more scenario of the entry is implemented already; the gates run it too.');
    // The three rules, and named imports.
    expect(text).toContain('## Binding a scenario');
    expect(text).toContain('- Write step definitions in `src/tests/steps/` of a module within your write scope (a testing module\'s `src/steps/`). A run of these scenarios loads their owner\'s step files, `subs/shelf/src/tests/steps/`, and what those import.');
    expect(text).toContain('- Never edit a feature file.');
    expect(text).toContain('only once its steps are defined and it passes in quick mode, which `run_scope_tests` shows you');
    expect(text).toContain('never with a symbol-free\n  `import \'…\'`');
    expect(text).toContain('It also runs, in quick mode, every scenario of your scope that has been declared, selected by identity.');
  });

  test('without assigned scenarios, every unimplemented one of the entry; with all implemented, only that they are', () => {
    const open = iterationMessage({ assignment: assignment(), projectRoot: '/p', base: 'abc', scenarios: entry([]) });
    expect(open).toContain('## The scenarios of this work item\n\nEach scenario of its entry that is not implemented yet:');
    expect(open).not.toContain('## Scenarios to bind');
    for (const id of ['sc-001', 'sc-002', 'sc-003']) expect(open).toContain(`### ${id} (pending)`);

    const done = iterationMessage({
      assignment: assignment(), projectRoot: '/p', base: 'abc',
      scenarios: entry([['sc-001', 'implemented'], ['sc-002', 'implemented'], ['sc-003', 'implemented']]),
    });
    expect(done).toContain('Every scenario of its entry is implemented (3).');
    expect(done).not.toContain('## Binding a scenario');
  });

  test('an integration work item\'s engineer: the integration scenario, the step files it imports and how it is bound', () => {
    const integration: IntegrationBriefing = {
      scenario: { id: 'sc-005', name: 'A lent book is shown on the shelf', owner: 'sample', file: 'src/tests/features/demo-plan/demo-plan.feature', source: ['Scenario: A lent book is shown on the shelf', '  Given a lent book'], steps: 'src/tests/steps' },
      subScenarios: [{ id: 'sc-002', name: 'A lent book is marked', owner: shelf, file: shelfFile, source: [], bridging: [] }],
      owners: [{ module: shelf, directory: 'subs/shelf/src/tests/steps', files: [shelfSteps] }],
      scope: { module: 'sample', includedChildren: [shelf] },
    };
    const text = iterationMessage({ assignment: assignment(), projectRoot: '/p', base: 'abc', scenarios: { kind: 'integration', integration, state: 'pending' } });
    expect(text).toContain('## The integration scenario to bind: sc-005 (pending): A lent book is shown on the shelf');
    expect(text).toContain('```gherkin\nScenario: A lent book is shown on the shelf\n  Given a lent book\n```');
    expect(text).toContain(`- \`${shelf}\`, in \`subs/shelf/src/tests/steps/\`: \`${shelfSteps}\`.`);
    expect(text).toContain('- Write one step file in `src/tests/steps/` that imports the step files above and defines no step of its own');
    expect(text).toContain('`expose-test`');
    expect(text).toContain('- Declare `sc-005` in `scenarios` of your completion proposal only once it passes in quick mode');
    expect(text).toContain('never with a symbol-free');
  });

  test('a provider work item\'s engineer is told nothing about scenarios', () => {
    const text = iterationMessage({ assignment: assignment(), projectRoot: '/p', base: 'abc' });
    expect(text).not.toMatch(/scenario/i);
  });
});

describe('assignment.scenarios', () => {
  const context = { entry: 'shelve-books', records };
  const body = (scenarios: string[] | undefined): AssignmentBody => ({ ...assign(shelf).assignment, ...(scenarios === undefined ? {} : { scenarios }) }) as AssignmentBody;
  const evidence = (scenarios = context as typeof context | undefined) => ({
    index: null, registry: new Map(), outline: null, ...(scenarios === undefined ? {} : { scenarios }),
  });

  test('names scenarios of this work item in any state; another entry\'s, an integration scenario and an unknown ID are refused at their path', () => {
    expect(assignmentErrors(body(['sc-001', 'sc-003']), evidence())).toEqual([]);
    expect(assignmentErrors(body(undefined), evidence())).toEqual([]);
    expect(assignmentErrors(body(['sc-004', 'sc-005', 'sc-009', 'sc-002']), evidence())).toEqual([
      { path: 'assignment.scenarios.0', message: 'sc-004 is not a scenario of this work item, so no iteration of it binds sc-004', expected: 'IDs among sc-001, sc-002, sc-003' },
      { path: 'assignment.scenarios.1', message: 'sc-005 is not a scenario of this work item, so no iteration of it binds sc-005', expected: 'IDs among sc-001, sc-002, sc-003' },
      { path: 'assignment.scenarios.2', message: '"sc-009" is no tracked scenario of this run', expected: 'IDs among sc-001, sc-002, sc-003' },
    ]);
  });

  test('an integration work item names its own scenario; a provider work item names none', () => {
    expect(assignmentErrors(body(['sc-005']), evidence({ entry: null, integration: 'sc-005', records } as never))).toEqual([]);
    expect(assignmentErrors(body(['sc-002']), evidence({ entry: null, integration: 'sc-005', records } as never)).map(error => error.expected)).toEqual(['IDs among sc-005']);
    expect(assignmentErrors(body(['sc-001']), evidence({ entry: null, records } as never))).toEqual([
      { path: 'assignment.scenarios.0', message: 'sc-001 is not a scenario of this work item, so no iteration of it binds sc-001', expected: 'no scenarios: this work item has none' },
    ]);
  });

  test('the local architect\'s submission is judged with it, and the list is informative only', () => {
    const submission = { ...assign(shelf, {}, outline()), assignment: { ...assign(shelf).assignment, scenarios: ['sc-004'] } };
    const refused = validateLocalArchitect(submission, { index: null, registry: new Map(), scenarios: context });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.errors.map(error => error.path)).toEqual(['assignment.scenarios.0']);
    const accepted = validateLocalArchitect({ ...submission, assignment: { ...submission.assignment, scenarios: ['sc-003'] } }, { index: null, registry: new Map(), scenarios: context });
    expect(accepted.ok).toBe(true);
  });
});

/** A command runner that answers the scoped tests and copies a recorded stream where each scenario run's profile asks. */
function scriptedRunner(streamsInOrder: string[], exits: number[] = []): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = [];
  let run = 0;
  const runner: CommandRunner = async (request: CommandRequest): Promise<CommandRun> => {
    calls.push([...request.argv]);
    const config = request.argv.indexOf('--config');
    let exitCode = 0;
    if (config >= 0) {
      const index = run++;
      const profile = await readFile(resolve(request.cwd, request.argv[config + 1]!), 'utf8');
      const target = /"message:([^"]+)"/u.exec(profile)![1]!;
      await copyFile(join(streams, `${streamsInOrder[index]!}.ndjson`), target);
      exitCode = exits[index] ?? 0;
    }
    return {
      outcome: { kind: 'completed', exitCode },
      startedAt: new Date(0).toISOString(),
      elapsedMs: 1,
      output: { path: null, bytes: 0, truncated: false, tail: config >= 0 ? '' : '1 passed' },
      stdout: '',
      stderr: '',
    };
  };
  return { runner, calls };
}

const harness = { support: ['src/tests/support/world.ts'], modes: { quick: { command: ['npm', 'run', 'acceptance:quick', '--'] }, full: { command: ['npm', 'run', 'acceptance:full', '--'] } } };
const shelfModule = { module: shelf, dir: 'subs/shelf', testing: false };

describe('run_scope_tests', () => {
  async function project(): Promise<string> {
    const root = await directory();
    await mkdir(join(root, 'subs/shelf/src/tests'), { recursive: true });
    await writeFile(join(root, 'subs/shelf/src/tests/shelf.test.ts'), 'export {};\n');
    return root;
  }

  function tool(root: string, runner: CommandRunner, scenarios: PlannedScenario[], include: string[], seen: ScopeScenarioObservation[], directories: string[]) {
    const inputs: ScenarioCheckInputs = { harness, modules: [shelfModule], scenarios };
    const index = architectIndex([moduleEntry('sample', '', null), moduleEntry(shelf, 'subs/shelf', 'sample')]);
    let call = 0;
    return createScopeTestsTool({
      commandExecution: runner,
      projectRoot: root,
      commands: { scopedTests: checkCommand({ argv: ['vitest', 'run'], cwd: root, timeoutMs: 60_000 }) } as unknown as ProjectCommands,
      policy: { policy: 'owned-by-scope', exactOwners: [shelf], subtrees: [], extraSuites: [] },
      refresh: async () => index,
      judge: async () => ({ ok: true }),
      scenarios: {
        plan: async () => planScenarioCheck('iteration', inputs, { projectRoot: root, scope: { exactOwners: [shelf], subtrees: [] }, include }),
        directory: () => {
          const path = join(root, '..', `scope-scenarios-${++call}`);
          directories.push(path);
          return path;
        },
        names: new Map(records.map(one => [one.id, one.name])),
      },
      observe: async observation => {
        if (observation.scenarios !== undefined) seen.push(observation.scenarios);
      },
    });
  }

  test('runs the tests, then the scope\'s scenarios in quick mode by identity with the work item\'s pending one, and reports each', async () => {
    const root = await project();
    const { runner, calls } = scriptedRunner(['undefined']);
    const seen: ScopeScenarioObservation[] = [];
    const directories: string[] = [];
    // sc-003 is pending and this work item's; sc-007 is pending and not; sc-002 is declared.
    const scenarios: PlannedScenario[] = [
      { id: 'sc-002', owner: shelf, file: shelfFile, state: 'declared' },
      { id: 'sc-003', owner: shelf, file: shelfFile, state: 'pending' },
      { id: 'sc-007', owner: shelf, file: shelfFile, state: 'pending' },
    ];
    const result = await tool(root, runner, scenarios, ['sc-003'], seen, directories).execute({}, new AbortController().signal);

    expect(calls[0]).toEqual(['vitest', 'run', 'subs/shelf/src/tests/shelf.test.ts']);
    expect(calls[1]!.slice(0, 5)).toEqual(['npm', 'run', 'acceptance:quick', '--', '--config']);
    const profile = await readFile(resolve(root, calls[1]![5]!), 'utf8');
    expect(profile).toContain('"@ramify-sc-002 or @ramify-sc-003"');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Outcome: passed (exit 0)');
    expect(result.text).toContain('Scenarios: failed; quick mode, selected by identity: sc-002, sc-003.');
    expect(result.text).toContain(`- \`sc-003\` "A returned book is listed again" undefined, at \`${shelfFile}:22\`:`);
    expect(result.text).toContain('  - The failing step: `the user lends "Dune" to Ada`.');
    expect(result.text).toContain('  - No step definition matches "the user lends "Dune" to Ada".');
    expect(result.text).toContain('- sc-002 was selected but no final scenario result was reported');
    expect(seen).toEqual([{ selected: ['sc-002', 'sc-003'], passed: [], failures: 2 }]);
    expect(await readFile(join(directories[0]!, 'scenarios.log'), 'utf8')).toContain('Scenario check, quick mode');
  });

  test('a passing scenario is reported with its binding, each call in a directory of its own, and a scope with nothing selected says so', async () => {
    const root = await project();
    const { runner } = scriptedRunner(['passing']);
    const seen: ScopeScenarioObservation[] = [];
    const directories: string[] = [];
    const passing = tool(root, runner, [{ id: 'sc-001', owner: shelf, file: shelfFile, state: 'declared' }], [], seen, directories);
    const result = await passing.execute({}, new AbortController().signal);
    expect(result.isError).toBe(false);
    expect(result.text).toContain('Scenarios: passed; quick mode, selected by identity: sc-001.');
    expect(result.text).toContain(`- \`sc-001\` "A shelved book is listed" passed, at \`${shelfFile}:10\`, bound by:\n  - \`an empty shelf\` → \`${shelfSteps}:8\``);
    expect(seen).toEqual([{ selected: ['sc-001'], passed: ['sc-001'], failures: 0 }]);

    const none = tool(root, scriptedRunner([]).runner, [{ id: 'sc-007', owner: shelf, file: shelfFile, state: 'pending' }], [], seen, directories);
    const nothing = await none.execute({}, new AbortController().signal);
    expect(nothing.isError).toBe(false);
    expect(nothing.text).toContain('Scenarios: none of this scope is declared yet, and this work item has no pending one, so none ran.');
    expect(seen.at(-1)).toEqual({ selected: [], passed: [], failures: 0 });
    expect(new Set(directories).size).toBe(directories.length);
  });
});

describe('run_scope_tests over an outside-modules path', () => {
  test('runs each test file outside every module on its own, and a run that selected nothing fails the call', async () => {
    const root = await directory();
    await mkdir(join(root, 'subs/shelf/src/tests'), { recursive: true });
    await writeFile(join(root, 'subs/shelf/src/tests/shelf.test.ts'), 'export {};\n');
    await mkdir(join(root, 'scripts'), { recursive: true });
    await writeFile(join(root, 'scripts/report.test.ts'), 'export {};\n');
    const calls: string[][] = [];
    // The project's runner includes only module sources, so the outside file
    // on its own selects nothing, and the runner says so with a failing exit.
    const runner: CommandRunner = async (request: CommandRequest): Promise<CommandRun> => {
      calls.push([...request.argv]);
      const outside = request.argv.includes('scripts/report.test.ts');
      return {
        outcome: { kind: 'completed', exitCode: outside ? 1 : 0 },
        startedAt: new Date(0).toISOString(),
        elapsedMs: 1,
        output: { path: null, bytes: 0, truncated: false, tail: outside ? 'No test files found, exiting with code 1' : '1 passed' },
        stdout: '',
        stderr: '',
      };
    };
    const observed: Array<{ readonly outcome: string; readonly resolved: readonly string[] }> = [];
    const tool = createScopeTestsTool({
      commandExecution: runner,
      projectRoot: root,
      commands: { scopedTests: checkCommand({ argv: ['vitest', 'run'], cwd: root, timeoutMs: 60_000 }) } as unknown as ProjectCommands,
      policy: { policy: 'owned-by-scope', exactOwners: [shelf], subtrees: [], extraSuites: [], outsideModules: ['scripts'] },
      refresh: async () => architectIndex([moduleEntry('sample', '', null), moduleEntry(shelf, 'subs/shelf', 'sample')]),
      judge: async () => ({ ok: true }),
      observe: async observation => { observed.push(observation); },
    });
    const result = await tool.execute({}, new AbortController().signal);
    expect(calls).toEqual([['vitest', 'run', 'subs/shelf/src/tests/shelf.test.ts'], ['vitest', 'run', 'scripts/report.test.ts']]);
    expect(result.isError).toBe(true);
    expect(result.text).toContain('2 test file(s) in 2 runs');
    expect(result.text).toContain('Run of scripts/report.test.ts: Outcome: failed (exit 1)');
    expect(result.text).toContain('No test files found');
    expect(observed).toEqual([expect.objectContaining({ outcome: 'failed', resolved: ['scripts/report.test.ts', 'subs/shelf/src/tests/shelf.test.ts'] })]);
  });
});

describe('diagnostics from a recorded failing stream', () => {
  /** One scenario check over the recordings, one run per stream, as a gate's `scenarios` command records it. */
  async function recordedCheck(runs: Array<[string, string]>, exits: number[]): Promise<ScenarioCheckSummary> {
    const root = await directory();
    const plan: ScenarioCheckPlan = {
      mode: 'quick',
      selection: { kind: 'identity', scenarios: runs.map(([id]) => id) },
      strict: true,
      dryRun: false,
      support: [],
      runs: runs.map(([id]) => ({ module: shelfModule, selection: { kind: 'identity', scenarios: [id] } })),
      setup: null,
      teardown: null,
      runTimeoutMs: 600_000,
      tracked: ['sc-001', 'sc-002', 'sc-003', 'sc-004', 'sc-005', 'sc-006', 'sc-007'].map(id => ({ id, file: shelfFile })),
    };
    const { summary } = await runScenarioCheck({
      command: checkCommand({ argv: ['npm', 'run', 'acceptance:quick', '--'], cwd: join(root, 'project'), timeoutMs: 1 }),
      plan,
      projectRoot: join(root, 'project'),
      attemptDirectory: join(root, 'attempt'),
      outputFile: join(root, 'check.log'),
      signal: new AbortController().signal,
      runner: scriptedRunner(runs.map(([, stream]) => stream), exits).runner,
    });
    return summary;
  }

  function gate(summary: ScenarioCheckSummary, outcome: 'passed' | 'failed'): GateAttempt {
    const command = {
      kind: 'scenarios', outcome, exitCode: outcome === 'passed' ? 0 : 1, runnerError: null,
      output: { path: '/nowhere/check.log', bytes: 0, truncated: false, tail: summary.failures.join('\n') },
      scenarios: summary,
    } as unknown as GateCommandRecord;
    const typeCheck = {
      kind: 'type-check', outcome: 'failed', exitCode: 2, runnerError: null,
      output: { path: '/nowhere/type-check.log', bytes: 0, truncated: false, tail: 'error TS2322' },
    } as unknown as GateCommandRecord;
    return { id: 'ga-0007', cause: 'in-scope', commands: [command, typeCheck], guardedChanges: [], rules: [] } as unknown as GateAttempt;
  }

  const names = new Map([['sc-001', 'A shelved book is listed'], ['sc-002', 'A miscounted shelf fails'], ['sc-003', 'Lending is not defined yet']]);

  test('per failing scenario its name, file and line, failing step, message and undefined steps; per passed one its binding', async () => {
    const summary = await recordedCheck([['sc-002', 'failing'], ['sc-003', 'undefined'], ['sc-001', 'passing']], [1, 1, 0]);
    for (const audience of ['engineer', 'local-architect'] as const) {
      const { summary: lines } = await gateDiagnostics(gate(summary, 'failed'), audience, names);
      const text = lines.join('\n');
      expect(lines[0]).toBe('- `scenarios`: failed, exit 1; quick mode, selected by identity: sc-002, sc-003, sc-001:');
      expect(text).toContain(`  - \`sc-002\` "A miscounted shelf fails" failed, at \`${shelfFile}:16\`:\n    - The failing step: \`the shelf lists 2 books\`.\n    - Its message`);
      expect(text).toMatch(/AssertionError/);
      expect(text).toContain('1 !== 2');
      expect(text).toContain(`  - \`sc-003\` "Lending is not defined yet" undefined, at \`${shelfFile}:22\`:`);
      expect(text).toContain('    - No step definition matches "the user lends "Dune" to Ada".');
      expect(text).toContain([
        `  - \`sc-001\` "A shelved book is listed" passed, at \`${shelfFile}:10\`, bound by:`,
        `    - \`an empty shelf\` → \`${shelfSteps}:8\``,
        `    - \`the user shelves "Dune"\` → \`${shelfSteps}:12\``,
        `    - \`the shelf lists 1 book\` → \`${shelfSteps}:28\``,
      ].join('\n'));
      // The failure lines of the check that are not about one scenario stay;
      // the per-scenario ones are not repeated.
      expect(text).toContain('  - the run of sample/shelf exited with 1');
      expect(lines.some(line => /^ {2}- sc-00\d (failed|undefined):/.test(line))).toBe(false);
      // Other commands keep their own lines.
      expect(text).toContain('- `type-check`: failed, exit 2; full output: `/nowhere/type-check.log`; the end of what it printed:');
    }
  });

  test('a message is bounded, and a scenario check that passed in a failing gate carries the binding of each scenario', async () => {
    const passed = await recordedCheck([['sc-001', 'passing']], [0]);
    const { summary: lines } = await gateDiagnostics(gate(passed, 'passed'), 'engineer', names);
    expect(lines[0]).toBe('- `scenarios`: passed, exit 0; each scenario it passed, and the step definitions that bound it:');
    expect(lines[1]).toBe(`  - \`sc-001\` "A shelved book is listed" passed, at \`${shelfFile}:10\`, bound by:`);

    const long = { ...passed, scenarios: [{ ...passed.scenarios[0]!, status: 'failed' as const, failure: { step: 'Then it fails', message: Array.from({ length: 40 }, (_, line) => `line ${line}`).join('\n') } }] };
    const bounded = scenarioCheckLines(long);
    expect(bounded).toContain('        line 11');
    expect(bounded).not.toContain('        line 12');
    expect(bounded).toContain('        …');
  });
});
