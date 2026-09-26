import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { GateAttempt } from '../checks/records.js';
import { runGate } from '../checks/gate.js';
import { checkCommand } from '../checks/records.js';
import {
  commitForMaterialization, contentHash, expectedFeatureFiles, expectedFeatureHashes, materializationMessage, rerenderFeatureFiles,
  trackedScenarios,
} from '../run/feature-files.js';
import { runLayout } from '../run/records.js';
import { iterationLayout, type IterationAssignment } from '../work/iterations.js';
import { captureGuardedFiles } from '../work/scope.js';
import { scenarioRecordSchema, scenarioSourceHash, type ScenarioRecord } from '../../subs/scenarios/src/records.js';
import { initialScenarioStates } from '../../subs/scenarios/src/states.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { statedCommands } from './helpers/composition.js';
import { createPassingCheckExecution } from './helpers/direct-check-execution.js';
import { expectNoProcesses, forgetExternalTools, directReadinessExecution } from './helpers/external-tools.js';
import { copyFixture, temporaryDirectory } from './helpers/fixture.js';
import { gateGit, scenariosCommit as gateScenariosCommit, type GateCommit } from './helpers/gate-git.js';
import {
  addModule, assign, byRole, completionProposed, installMiniRunner, outline, shell, submit, treeInputs, write,
} from './helpers/iterations.js';
import { mockGit } from './helpers/mock-git.js';
import { emptyAnalysis, installTestRunner, onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import { assertUnchangedGit, openUnchangedRuns } from './helpers/unchanged-run.js';
import { finalCandidate } from './helpers/final-candidate.js';

/*
 * The feature files on the run branch, architecture §5 and §12.
 *
 * Once readiness has passed and the branch exists, the harness renders
 * every tracked feature file from the records and the states, writes it and
 * commits it as "Scenarios of <planId>" with the run's trailer and no gate's,
 * before the first local architect starts. A re-rendering writes only what
 * differs. The files join every assignment's guarded list with the hash of
 * their expected rendering, the write guard refuses an agent's edit of them
 * and of the project's configuration, and a file that differs at a gate is a
 * guarded change.
 *
 * Git is external and answered: a scripted Git states each commit's answer,
 * and the calls the run made are asserted with their arguments. The crash
 * between the commit and its record is the recovery table's row
 * `scenarios-committed`, run by the composition's recovery suite.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

const plan = 'review-notes';
const root = 'collection-review';
const reviews = 'collection-review/workspace/reviews';
const reviewsFeature = `subs/workspace/subs/reviews/src/tests/features/${plan}/reviewer-note.feature`;
const rootFeature = `src/tests/features/${plan}/note-in-panel.feature`;

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe('materializing the feature files', () => {
  test('a scripted run commits every tracked file once readiness has passed, and each work-item gate implements the scenario its request declared', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    const project = fixture.root;
    const submitted = analysis([
      entry('reviewer-note', reviews, 'A reviewer can attach one note to a completed review run.'),
      entry('note-in-panel', root, 'The review panel shows the note under the findings.'),
    ]);
    const { service, git } = await openUnchangedRuns(project, {
      script: spec => spec.role === 'catalog-extractor' ? [] : [{ kind: 'submit', input: spec.role === 'initial-architect' ? submitted : requestCompletion() }],
      unchangedCheckpoints: [
        scenariosCommit(plan, 'scenarios-revision', [rootFeature, reviewsFeature]),
        'wi-001', 'wi-002', `final verification of plan "${plan}"`,
      ],
    });
    cleanups.push(() => service.close());
    const commitAccepted = vi.spyOn(git, 'commitAccepted');
    const lookups = vi.spyOn(git, 'findCommitByTrailers');

    const receipt = await service.execute(startRun(plan));
    await service.settled(plan, receipt.jobId);
    expect(onlyRun(service, plan).state).toBe('completed');

    // After readiness and the branch, before the first work item: the intent,
    // then the completion with the commit and every tracked file.
    const events = await runEventsOnDisk(project, plan, receipt.jobId);
    const types = events.map(event => event.type);
    expect(types.slice(types.indexOf('readiness-passed'), types.indexOf('work-item-started') + 1)).toEqual([
      'readiness-passed', 'scenarios-materializing', 'scenarios-materialized', 'work-item-started',
    ]);
    expect(events.find(event => event.type === 'scenarios-materializing')!.data).toEqual({ files: [rootFeature, reviewsFeature] });
    expect(events.find(event => event.type === 'scenarios-materialized')!.data).toEqual({
      commit: 'scenarios-revision', files: [rootFeature, reviewsFeature],
    });
    const lines = (await readFile(runPath(project, plan, receipt.jobId, runLayout.events), 'utf8')).split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as { event: { type: string }; effect?: { key: string; phase: string } });
    expect(lines.filter(line => line.event.type.startsWith('scenarios-')).map(line => line.effect)).toEqual([
      { key: 'scenarios-materialize', phase: 'intent' },
      expect.objectContaining({ key: 'scenarios-materialize', phase: 'completion' }),
    ]);

    // The commit: the run branch's first, over the project root, with the
    // subject, the files and the run's trailer, and no gate's. The live
    // attempt looks nothing up, since its intent was just appended.
    expect(git.branch()).toBe(`ramify-agent-run/${receipt.jobId}`);
    expect(commitAccepted).toHaveBeenCalledTimes(4);
    const [committedRoot, message] = commitAccepted.mock.calls[0]!;
    expect(committedRoot).toBe(project);
    expect(message).toBe([
      `Scenarios of ${plan}`,
      '',
      'The 2 acceptance scenarios of the accepted analysis, written by ramify-agent',
      'with the pending tag until the harness declares each due. Agents never edit these files.',
      '',
      `  ${rootFeature}`,
      `  ${reviewsFeature}`,
      '',
      `Ramify-Run: ${receipt.jobId}`,
      'Ramify-Scenarios: materialized',
      '',
    ].join('\n'));
    expect(message).not.toContain('Ramify-Gate');
    // Each gate looks its own commit up first; nothing looked this one up.
    expect(lookups.mock.calls.map(([, trailers]) => trailers.map(trailer => trailer.key))).toEqual([
      ['Ramify-Run', 'Ramify-Gate'], ['Ramify-Run', 'Ramify-Gate'], ['Ramify-Run', 'Ramify-Gate'],
    ]);
    expect(git.commits().map(made => made.id)).toEqual(['scenarios-revision']);

    // The content is the rendering of the records: each scenario tagged by
    // its identity, its source verbatim. Each work item's completion request
    // declared its scenario, so the pending tag is gone from both.
    const reviewsText = await readFile(join(project, reviewsFeature), 'utf8');
    expect(reviewsText.split('\n').slice(0, 9)).toEqual([
      `# Written by ramify-agent for plan ${plan}, run ${receipt.jobId}.`,
      '# The scenarios are the plan\'s requirements. Agents never edit this file;',
      '# step definitions bind it from src/tests/steps/. @ramify-pending marks a',
      '# scenario the harness has not yet declared due.',
      '',
      'Feature: reviewer-note',
      '  A reviewer can attach one note to a completed review run.',
      '',
      '  @ramify-sc-001',
    ]);
    expect(reviewsText).toContain('  Scenario: A person uses reviewer-note\n    Given the project as the plan finds it\n');
    expect(await readFile(join(project, rootFeature), 'utf8')).toContain('Feature: note-in-panel\n  The review panel shows the note under the findings.\n\n  @ramify-sc-002\n');

    // The commit is the accepted boundary the first local architect starts from.
    // inv-0001 to inv-0003 are the intake, the initial architect and the plan's checker.
    const firstArchitect = JSON.parse(await readFile(runPath(project, plan, receipt.jobId, runLayout.invocation('inv-0004')), 'utf8')) as { role: string; base: string };
    expect(firstArchitect).toMatchObject({ role: 'local-architect', base: 'scenarios-revision' });

    // Each work-item gate plans the scenario check over both owners with the
    // pending tag excluded, and passes: the first runs its own declared
    // scenario and excludes the other, still pending; the second runs both.
    const gateIds = events.filter(event => event.type === 'gate-attempted').map(event => (event.data as { gate: string }).gate);
    const attempts = await Promise.all(gateIds.map(async id =>
      JSON.parse(await readFile(runPath(project, plan, receipt.jobId, runLayout.gate(id)), 'utf8')) as GateAttempt));
    const workItemGates = attempts.filter(attempt => attempt.checkpoint === 'work-item');
    expect(workItemGates).toHaveLength(2);
    for (const [index, attempt] of workItemGates.entries()) {
      expect(attempt.verdict).toBe('passed');
      const scenarios = attempt.commands.find(command => command.kind === 'scenarios')!;
      expect(scenarios.scenarios).toMatchObject({ mode: 'quick', selection: { kind: 'all-untagged' }, excluded: 1 - index, failures: [] });
      expect(scenarios.scenarios!.runs.map(run => run.module)).toEqual(expect.arrayContaining([root, reviews]));
      expect(scenarios.scenarios!.scenarios.map(result => `${result.id} ${result.status}`).sort())
        .toEqual(index === 0 ? ['sc-001 passed'] : ['sc-001 passed', 'sc-002 passed']);
    }
  }, 300_000);

  test('a run without scenarios writes and commits nothing', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    const { service, git } = await openUnchangedRuns(fixture.root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      unchangedCheckpoints: [`final verification of plan "${plan}"`],
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun(plan));
    await service.settled(plan, receipt.jobId);
    expect(onlyRun(service, plan).state).toBe('completed');
    const types = (await runEventsOnDisk(fixture.root, plan, receipt.jobId)).map(event => event.type);
    expect(types.filter(type => type.startsWith('scenarios-'))).toEqual([]);
    expect(git.commits()).toEqual([]);
  }, 120_000);
});

/** Two records in two owners, as acceptance commits them. */
function records(): ScenarioRecord[] {
  const source = (name: string) => [`Scenario: ${name}`, '  Given a shelf', '  When a book is shelved', '  Then the shelf lists it'];
  return [
    { id: 'sc-001', entry: 'shelve-book', owner: 'shop/shelf', name: 'A book is shelved', file: 'subs/shelf/src/tests/features/demo/shelve-book.feature' },
    { id: 'sc-002', entry: 'list-books', owner: 'shop', name: 'Books are listed', file: 'src/tests/features/demo/list-books.feature' },
  ].map(record => scenarioRecordSchema.parse({
    schema: 'ramify-agent.scenario/1',
    id: record.id,
    kind: 'entry',
    entry: record.entry,
    owner: record.owner,
    origin: { kind: 'architect', refs: [] },
    partOf: null,
    subScenarios: [],
    name: record.name,
    source: source(record.name),
    hash: scenarioSourceHash(source(record.name)),
    file: record.file,
  }));
}

const tracked = () => ({
  records: records(),
  states: initialScenarioStates(['sc-001', 'sc-002']),
  entries: [
    { capability: 'shelve-book', description: 'A book can be shelved.' },
    { capability: 'list-books', description: 'The shelf lists its books.' },
  ],
});

describe('re-rendering', () => {
  test('writes every file that differs and nothing else, and a second re-rendering writes nothing', async () => {
    const directory = await temporaryDirectory();
    cleanups.push(directory.remove);
    const expected = expectedFeatureFiles(tracked(), { planId: 'demo', runId: 'run-1' });
    expect(expected.map(file => file.path)).toEqual(['src/tests/features/demo/list-books.feature', 'subs/shelf/src/tests/features/demo/shelve-book.feature']);

    const first = await rerenderFeatureFiles(directory.path, expected);
    expect(first).toEqual({ files: expected.map(file => file.path), written: expected.map(file => file.path), commitNeeded: true });
    for (const file of expected) expect(await readFile(join(directory.path, file.path), 'utf8')).toBe(file.content);

    const second = await rerenderFeatureFiles(directory.path, expected);
    expect(second).toEqual({ files: expected.map(file => file.path), written: [], commitNeeded: false });

    // A file that drifted is written back, and only that one.
    await writeFile(join(directory.path, expected[1]!.path), `${expected[1]!.content}# drift\n`);
    const third = await rerenderFeatureFiles(directory.path, expected);
    expect(third.written).toEqual([expected[1]!.path]);
    expect(await readFile(join(directory.path, expected[1]!.path), 'utf8')).toBe(expected[1]!.content);
  });

  test('a state change is what a re-rendering writes: the pending tag comes off exactly where the state says', async () => {
    const directory = await temporaryDirectory();
    cleanups.push(directory.remove);
    const before = expectedFeatureFiles(tracked(), { planId: 'demo', runId: 'run-1' });
    await rerenderFeatureFiles(directory.path, before);
    const after = expectedFeatureFiles({ ...tracked(), states: new Map([['sc-001', 'declared'], ['sc-002', 'pending']]) }, { planId: 'demo', runId: 'run-1' });
    const rendered = await rerenderFeatureFiles(directory.path, after);
    expect(rendered.written).toEqual(['subs/shelf/src/tests/features/demo/shelve-book.feature']);
    expect(await readFile(join(directory.path, rendered.written[0]!), 'utf8')).toContain('  @ramify-sc-001\n  Scenario: A book is shelved');
  });

  test('refuses a file outside the project before writing any', async () => {
    const directory = await temporaryDirectory();
    cleanups.push(directory.remove);
    await expect(rerenderFeatureFiles(directory.path, [
      { path: 'src/tests/features/demo/inside.feature', content: 'Feature: inside\n' },
      { path: '../outside.feature', content: 'Feature: outside\n' },
    ])).rejects.toThrow('A feature file must lie within the project: ../outside.feature');
  });

  test('the ledger replays into the records, their states and the entries that describe the files', () => {
    const [one, two] = records();
    const replayed = trackedScenarios([
      { transaction: { event: { type: 'analysis-accepted' }, records: [
        { body: { schema: 'ramify-agent.entry-assignments/1', view: { status: 'placeholder' }, entries: [
          { capability: 'shelve-book', description: 'A book can be shelved.', owner: 'shop/shelf', requirementRefs: [], acceptanceRefs: [], contextRefs: [], citations: [] },
        ] } },
        { body: one }, { body: two },
      ] } },
      { transaction: { event: { type: 'scenario-declared', data: { scenario: 'sc-002', by: 'inv-0004', state: 'declared' } } as { type: string }, records: [] } },
    ]);
    expect(replayed.records.map(record => record.id)).toEqual(['sc-001', 'sc-002']);
    expect([...replayed.states]).toEqual([['sc-001', 'pending'], ['sc-002', 'declared']]);
    expect(replayed.entries).toEqual([{ capability: 'shelve-book', description: 'A book can be shelved.' }]);
  });
});

describe('the materialization commit', () => {
  const message = materializationMessage({ planId: 'demo', runId: 'run-1', files: ['a.feature'], scenarios: 1 });

  test('a live attempt commits at once, with nothing looked up', async () => {
    const git = mockGit({ commitAccepted: async () => 'made-1' });
    expect(await commitForMaterialization('/project', 'run-1', message, false, git)).toBe('made-1');
    expect(git.commitAccepted).toHaveBeenCalledWith('/project', message);
    expect(git.findCommitByTrailers).not.toHaveBeenCalled();
    expect(message.split('\n')[0]).toBe('Scenarios of demo');
    expect(message.endsWith('\nRamify-Run: run-1\nRamify-Scenarios: materialized\n')).toBe(true);
  });

  test('a recovery finds the commit by the run and scenario trailers and makes no second one', async () => {
    const git = mockGit({ findCommitByTrailers: async () => 'made-1' });
    expect(await commitForMaterialization('/project', 'run-1', message, true, git)).toBe('made-1');
    expect(git.findCommitByTrailers).toHaveBeenCalledWith('/project', [
      { key: 'Ramify-Run', value: 'run-1' },
      { key: 'Ramify-Scenarios', value: 'materialized' },
    ]);
    expect(git.commitAccepted).not.toHaveBeenCalled();
  });

  test('a recovery that finds none makes the commit', async () => {
    const git = mockGit({ findCommitByTrailers: async () => null, commitAccepted: async () => null });
    expect(await commitForMaterialization('/project', 'run-1', message, true, git)).toBeNull();
    expect(git.commitAccepted).toHaveBeenCalledWith('/project', message);
  });
});

describe('the guarded list', () => {
  test('holds the configuration, the support files as they stand and each feature file at the hash of its expected rendering', async () => {
    const directory = await temporaryDirectory();
    cleanups.push(directory.remove);
    const write = async (path: string, content: string) => {
      await mkdir(join(directory.path, path, '..'), { recursive: true });
      await writeFile(join(directory.path, path), content);
    };
    await write('package.json', '{}\n');
    await write('ramify-agent.json', '{"schema":"ramify-agent.project/1"}\n');
    await write('src/tests/support/world.ts', 'export {};\n');
    const expected = expectedFeatureFiles(tracked(), { planId: 'demo', runId: 'run-1' });
    // The tree holds a drifted copy of one file: the list is the rendering's, not the tree's.
    await write(expected[0]!.path, 'Feature: drifted\n');

    const guarded = await captureGuardedFiles(directory.path, [], {
      support: ['src/tests/support/world.ts'],
      expected: expectedFeatureHashes(expected),
    });
    expect(guarded).toEqual([
      { path: 'package.json', hash: sha256('{}\n') },
      { path: 'ramify-agent.json', hash: sha256('{"schema":"ramify-agent.project/1"}\n') },
      { path: expected[0]!.path, hash: contentHash(expected[0]!.content) },
      { path: 'src/tests/support/world.ts', hash: sha256('export {};\n') },
      { path: expected[1]!.path, hash: contentHash(expected[1]!.content) },
    ]);
  });

  test('a feature file that differs from its expected rendering at a gate is a guarded change', async () => {
    const directory = await temporaryDirectory();
    cleanups.push(directory.remove);
    const expected = expectedFeatureFiles(tracked(), { planId: 'demo', runId: 'run-1' });
    await rerenderFeatureFiles(directory.path, expected);
    const guarded = await captureGuardedFiles(directory.path, [], { expected: expectedFeatureHashes(expected) });
    await writeFile(join(directory.path, expected[1]!.path), expected[1]!.content.replace('@ramify-sc-001 @ramify-pending', '@ramify-sc-001'));

    const attempt = await runGate(createPassingCheckExecution(), 'iteration', {
      id: 'ga-0002',
      projectRoot: directory.path,
      directory: join(directory.path, '.gates', 'ga-0002'),
      head: 'a'.repeat(40),
      checks: [{ kind: 'type-check', command: checkCommand({ argv: ['true'], cwd: directory.path, timeoutMs: 30_000 }) }],
      guarded,
    });
    expect(attempt.verdict).toBe('failed');
    expect(attempt.cause).toBe('guarded-change');
    expect(attempt.guardedChanges).toEqual([{
      path: expected[1]!.path,
      before: contentHash(expected[1]!.content),
      after: expect.stringMatching(/^[0-9a-f]{64}$/u),
      authorizedBy: null,
    }]);
  });
});

describe('an engineer and the feature files', () => {
  const notes = 'collection-review/workspace/reviews/notes';
  const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
  const notesFeature = `${notesDirectory}/src/tests/features/${plan}/review-note.feature`;
  const base = 'revision-00';
  const unchanged: GateCommit = { commit: null };

  test('its edits of a feature file and of the configuration are refused, a shell change is a guarded change at the gate, and the gate\'s commit restores the file', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await addModule(fixture.root, notesDirectory, 'notes', {
      'src/notes.ts': 'export const noteLimit = 500;\n',
      'src/tests/notes.test.ts': [
        'import { test, expect } from \'vitest\';',
        'import { noteLimit } from \'../notes.ts\';',
        '',
        'test(\'the note limit is what the plan asks for\', () => { expect(noteLimit).toBe(500); });',
        '',
      ].join('\n'),
    });
    await installMiniRunner(fixture.root);
    const project = fixture.root;
    // What the engineer's shell leaves, stated and written directly: one
    // line appended to the feature file. No shell runs.
    const tamper = `printf '# tampered\\n' >> '${join(project, notesFeature)}'`;
    const commands = statedCommands(project, [{
      argv: () => ['bash', '-c', tamper],
      cwd: () => join(project, notesDirectory, 'src'),
      leaves: async where => appendFile(join(where, notesFeature), '# tampered\n'),
    }]);

    const finalEvidence = finalCandidate(project, 'scenarios-revision');
    const scripted = gateGit(project, {
      head: base,
      previews: finalEvidence.previews,
      commits: [
        gateScenariosCommit(plan, 'scenarios-revision', base, [notesFeature]),
        // The shell's change is written back before the gate commits, so the
        // tree holds nothing new, and neither does any later gate's.
        unchanged, unchanged, unchanged, unchanged,
      ],
    });
    const opened = await openRuns(project, {
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes)]))],
        'local-architect': [
          submit(assign(notes, {}, outline())),
          submit(assign(notes, { goal: 'Carry out the work in the notes module, leaving the feature file to the harness.' })),
          submit(requestCompletion()),
        ],
        engineer: [
          submit(completionProposed('Tried to mark the scenario done.'),
            write(join(project, notesFeature), 'Feature: review-note\n'),
            write(join(project, 'ramify-agent.json'), '{}\n'),
            shell(tamper)),
          submit(completionProposed('Nothing else was needed.')),
        ],
      }),
      inputs: treeInputs(),
      git: scripted.git,
      candidates: finalEvidence.candidates,
      readinessExecution: directReadinessExecution(),
      commandExecution: commands,
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun(plan));
    await opened.service.settled(plan, receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, plan).state).toBe('completed');
    scripted.assertComplete();
    commands.assertComplete();

    // The work item's completion request declared the scenario, and its
    // gate's commit rendered it without the pending tag; the assignments
    // guarded the rendering with the tag, which is what the tree held then.
    const final = await readFile(join(project, notesFeature), 'utf8');
    expect(final).toContain('  @ramify-sc-001\n');
    expect(final).not.toContain('tampered');
    const rendered = final.replace('  @ramify-sc-001\n', '  @ramify-sc-001 @ramify-pending\n');

    // The assignment guards the feature file at its rendering's hash, the
    // configuration and the support files the configuration names.
    const assignment = JSON.parse(await readFile(runPath(project, plan, runId, iterationLayout.assignment('wi-001', 1)), 'utf8')) as IterationAssignment;
    const guarded = new Map(assignment.guarded.map(file => [file.path, file.hash]));
    expect(guarded.get(notesFeature)).toBe(contentHash(rendered));
    expect(guarded.get('ramify-agent.json')).toBe(sha256(await readFile(join(project, 'ramify-agent.json'), 'utf8')));
    expect([...guarded.keys()]).toEqual(expect.arrayContaining([
      'subs/integration-tests/src/support/world.ts', 'subs/integration-tests/src/support/hooks.ts',
    ]));

    // The two guarded writes were refused outright, the feature file although
    // it lies inside the scope; the observation says why.
    const engineer = opened.agent!.sessions.filter(session => session.spec.role === 'engineer')[0]!;
    expect(engineer.denied).toHaveLength(2);
    const events = await runEventsOnDisk(project, plan, runId);
    const engineerStart = events.find(event => event.type === 'invocation-started' && event.data.role === 'engineer');
    if (engineerStart?.type !== 'invocation-started') throw new Error('Missing engineer invocation');
    const observations = await readFile(runPath(project, plan, runId,
      runLayout.observations(engineerStart.data.invocation)), 'utf8');
    const refusals = observations.split('\n').filter(Boolean).map(line => JSON.parse(line) as { type: string; data: { verdict?: string; reason?: string } })
      .filter(line => line.type === 'guard');
    expect(refusals.map(line => [line.data.verdict, line.data.reason])).toEqual([
      ['blocked-scope', `${join(await realRoot(project), notesFeature)} is written by the harness alone; no agent edits it`],
      ['blocked-scope', `${join(await realRoot(project), 'ramify-agent.json')} is written by the harness alone; no agent edits it`],
    ]);

    // The shell's change reached the gate: a guarded change no record
    // authorized, from the rendering's hash.
    const gateIds = events.filter(event => event.type === 'gate-attempted').map(event => (event.data as { gate: string }).gate);
    const attempts = await Promise.all(gateIds.map(async id =>
      JSON.parse(await readFile(runPath(project, plan, runId, runLayout.gate(id)), 'utf8')) as GateAttempt));
    const [refused, passed] = attempts.filter(attempt => attempt.checkpoint === 'iteration');
    expect(refused).toMatchObject({ verdict: 'failed', cause: 'guarded-change' });
    expect(refused!.guardedChanges).toEqual([{ path: notesFeature, before: contentHash(rendered), after: expect.stringMatching(/^[0-9a-f]{64}$/u), authorizedBy: null }]);
    // The next assignment's gate finds the file as the harness wrote it back.
    expect(passed).toMatchObject({ verdict: 'passed', guardedChanges: [] });
  }, 300_000);
});

async function realRoot(path: string): Promise<string> {
  const { realpath } = await import('node:fs/promises');
  return realpath(path);
}
