import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createScriptedAgent, type ScriptStep } from '../../subs/agent/src/scripted.js';
import type { RamifyCheckResult } from '../../subs/evidence/src/ramify-cli.js';
import { observationSchema } from '../run/observations.js';
import { invocationOutcomeSchema, invocationSchema, manualRunRecordSchema, runLayout } from '../run/records.js';
import { loadPromptPackages } from '../prompts/packages.js';
import { runStepCommandWith } from '../steps/command.js';
import { parseStepInputs, serializeStepInputs, type StepInputs } from '../steps/inputs.js';
import { runStep, type StepRunOptions, type StepRunProgress, type StepRunResult } from '../steps/run.js';
import { createStepProgressText } from '../steps/run-text.js';
import { acquireProjectLock } from '../store/lock.js';
import { stateGitignore, stateMarker } from '../store/state-directory.js';
import { passingAudit } from './helpers/direct-check-execution.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { copyFixture } from './helpers/fixture.js';
import { addModule, assign, edit, installMiniRunner, outline, unsuitableScope, write, completionProposed, readDeclaredTree } from './helpers/iterations.js';
import { fixtureScratchGit, mockGit } from './helpers/mock-git.js';
import { runPath } from './helpers/runs.js';
import { iterationLayout } from '../work/iterations.js';
import { workLayout } from '../work/records.js';
import { readBody, readTranscript } from '../transcripts/writer.js';
import { ContentStore } from '../transcripts/store.js';
import { piBuiltinDeclarations } from '../../subs/agent/subs/pi/src/session-operations.js';
import { constructStep } from '../steps/construct.js';
import { renderStep } from '../steps/render.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * S09-S14: `step run` runs one invocation from step inputs in a manual run,
 * on the scripted fake, with scripted Git and Ramify answers.
 */

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const notesSource = `${notesDirectory}/src/notes.ts`;
const planId = 'manual-notes';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

/** A fixture copy with the notes module, and a scratch directory for the authored files. */
async function project(): Promise<{ root: string; scratch: string }> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, notesDirectory, 'notes', {
    'src/notes.ts': 'export const noteLimit = 400;\n',
    'src/tests/notes.test.ts': 'import { test, expect } from \'vitest\';\nimport { noteLimit } from \'../notes.ts\';\n\ntest(\'the limit\', () => { expect(noteLimit).toBe(500); });\n',
  });
  await installMiniRunner(fixture.root);
  const scratch = await mkdtemp(join(tmpdir(), 'ramify-agent-step-run-'));
  cleanups.push(() => rm(scratch, { recursive: true, force: true }));
  return { root: fixture.root, scratch };
}

const item = {
  schema: 'ramify-agent.work-item/1', id: 'state-note-limit', module: notes, origin: { entry: 'review-note' },
  goal: 'State the note limit the reviewers asked for.', requirementRefs: [], acceptanceRefs: [], contextRefs: [], startedFor: null,
};

/** Engineer inputs authored with no run, written to a file. */
async function authoredInputs(root: string, scratch: string): Promise<string> {
  const workItem = join(scratch, 'work-item.json');
  const assignment = join(scratch, 'assignment.json');
  await writeFile(workItem, JSON.stringify(item));
  await writeFile(assignment, JSON.stringify(assign(notes, { goal: 'Raise the note limit to 500.' }, outline())));
  const out = join(scratch, 'inputs.json');
  const result = await runStepCommandWith({
    command: 'inputs', role: 'engineer', fromRun: undefined, invocation: undefined, projectRoot: root, out, authored: { workItem, assignment },
  }, { ramify: new FakeRamifyCli(), git: { currentHead: async () => 'authored-base' }, configuredAudit: passingAudit(), index: readDeclaredTree });
  if (result.exitStatus !== 0) throw new Error(result.stderr);
  return out;
}

async function writeInputs(scratch: string, name: string, inputs: unknown): Promise<string> {
  const path = join(scratch, name);
  await writeFile(path, serializeStepInputs(parseStepInputs(JSON.stringify(inputs))));
  return path;
}

/** The tree as scripted Git reports it: the commit HEAD names and the paths that differ from it. */
interface Tree { head: string; changed: string[] }

function scriptedGit(tree: Tree) {
  const branches = new Set<string>();
  const git = mockGit({
    currentHead: async () => tree.head,
    changedPaths: async () => [...tree.changed],
    createRunBranch: async (_root, runId) => {
      const branch = `ramify-agent-run/${runId}`;
      const created = !branches.has(branch);
      branches.add(branch);
      return { branch, created };
    },
  });
  cleanups.push(async () => {
    expect(git.unexpected, 'unscripted Git').toEqual([]);
    expect(git.commitAccepted).not.toHaveBeenCalled();
  });
  return fixtureScratchGit(git);
}

/** A Ramify whose hook checks answer in order, then checked; the completion check answers checked. */
function scriptedRamify(root: string, hookAnswers: Array<'checked' | 'findings'> = []): FakeRamifyCli {
  const ramify = new FakeRamifyCli();
  const answer = (form: 'changed' | 'complete', outcome: 'checked' | 'findings', paths: readonly string[]): RamifyCheckResult => {
    const report = outcome === 'findings' ? { findings: [{
      code: 'not-visible', category: 'import', message: 'collection-review:interfaces/protocol.ts#ToolResult: not-visible',
      location: { file: notesSource, line: 1, column: 1 }, importer: { owner: notes },
      original: { kind: 'code', owner: 'collection-review', file: 'interfaces/protocol.ts', binding: 'ToolResult' },
    }] } : { findings: [] };
    return {
      form, exitCode: outcome === 'checked' ? 0 : 1, outcome, reason: null, report, stdout: JSON.stringify(report), stderr: '',
      provider: { schema: form === 'changed' ? 'ramify.check/3' : 'ramify.analysis/3', revision: 'scripted' }, execution: 'completed',
      paths: paths.map(path => ({ path, disposition: 'checked' as const, module: 'scripted', exclusion: null, reason: 'content' as const, sha256: '0'.repeat(64) })),
      removed: [], unsupported: null,
    };
  };
  vi.spyOn(ramify, 'checkChanged').mockImplementation(async (paths, project) => {
    expect(project).toBe(root);
    return answer('changed', hookAnswers.shift() ?? 'checked', paths);
  });
  vi.spyOn(ramify, 'checkComplete').mockImplementation(async project => {
    expect(project).toBe(root);
    return answer('complete', 'checked', []);
  });
  return ramify;
}

interface Stepped {
  readonly result: StepRunResult;
  readonly events: StepRunProgress[];
  readonly agent: ReturnType<typeof createScriptedAgent>;
}

async function step(root: string, inputs: string, run: string, script: readonly ScriptStep[], git: ReturnType<typeof scriptedGit>,
  extra: Partial<StepRunOptions> = {}): Promise<Stepped> {
  const agent = createScriptedAgent(script);
  const events: StepRunProgress[] = [];
  const result = await runStep({
    inputs, run, agent, ramify: extra.ramify ?? scriptedRamify(root), git, refresh: readDeclaredTree,
    onProgress: event => events.push(event), ...extra,
  });
  return { result, events, agent };
}

function finished(result: StepRunResult) {
  if (result.status !== 'finished') throw new Error(`the step did not start: ${result.reason}`);
  return result.summary;
}

const manualRun = (root: string, runId: string) => runPath(root, planId, runId);

/** Every file beneath a directory with its size and modification time. */
async function tree(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return Promise.all(entries.filter(entry => entry.isFile()).map(async entry => {
    const path = join(entry.parentPath, entry.name);
    const info = await stat(path);
    return `${path} ${info.size} ${info.mtimeMs}`;
  })).then(items => items.sort());
}

const json = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));

describe('S09/S12: one engineer step in a manual run', () => {
  test('records the run\'s records, shows each tool call, denial, finding and verdict, and exits 0', async () => {
    const { root, scratch } = await project();
    const inputs = await authoredInputs(root, scratch);
    const tree: Tree = { head: 'base-1', changed: [] };
    const git = scriptedGit(tree);
    const cwd = join(root, notesDirectory, 'src');
    const stray = relative(cwd, join(root, 'subs/workspace/subs/reviews/src/stray.ts'));
    const run = manualRun(root, 'm-001');
    const { result, events, agent } = await step(root, inputs, run, [
      edit('notes.ts', 'noteLimit = 400', 'noteLimit = 500'),
      write(stray, 'export const stray = true;\n'),
      { kind: 'submit', input: { kind: 'no-such-kind' } },
      { kind: 'submit', input: unsuitableScope('The limit is owned elsewhere.') },
    ], git, { ramify: scriptedRamify(root, ['findings']) });

    const summary = finished(result);
    expect(result.exitStatus).toBe(0);
    expect(summary).toMatchObject({ role: 'engineer', ended: 'submitted', submissionKind: 'unsuitable', rejectedSubmissions: 1, settled: true,
      base: 'base-1', dirty: false, start: { requested: 'fresh', actual: 'fresh', reason: null } });
    expect(agent.sessions[0]!.spec.scope.workingDirectory).toBe(cwd);
    expect(await readFile(join(root, notesSource), 'utf8')).toBe('export const noteLimit = 500;\n');

    // S09: the records of a run, in a run's layout, under the same schemas.
    expect(manualRunRecordSchema.parse(await json(join(run, 'job.json')))).toMatchObject({
      kind: 'manual', planId, jobId: 'm-001', origin: 'step-run', base: 'base-1', branch: 'ramify-agent-run/m-001',
    });
    // The plan's state directory is a run's: its records are ignored by Git and left out of Ramify's inputs.
    const stateDirectory = join(root, 'plans', planId, '.harness');
    expect(await readFile(join(stateDirectory, '.gitignore'), 'utf8')).toBe(stateGitignore);
    expect(await readFile(join(stateDirectory, 'tsconfig.json'), 'utf8')).toBe(stateMarker);
    const invocation = invocationSchema.parse(await json(summary.records.invocation));
    expect(invocation).toMatchObject({ id: summary.invocation, role: 'engineer', base: 'base-1', startingTree: { dirty: false, changed: [] } });
    const outcome = invocationOutcomeSchema.parse(await json(summary.records.outcome));
    expect(outcome).toMatchObject({ ended: 'submitted', rejectedSubmissions: 1 });
    expect(summary.records.submission).not.toBeNull();
    expect(await json(summary.records.submission!)).toMatchObject({ kind: 'unsuitable' });
    expect(parseStepInputs(await readFile(summary.records.inputs, 'utf8'))).toMatchObject({ role: 'engineer', run: { planId, runId: 'm-001' } });
    const observations = (await readFile(summary.records.observations, 'utf8')).split('\n').filter(Boolean).map(line => observationSchema.parse(JSON.parse(line)));
    expect(observations.filter(line => line.type === 'guard').length).toBeGreaterThan(0);
    expect(observations.filter(line => line.type === 'hook-check').length).toBe(1);
    await expect(stat(summary.records.transcript)).resolves.toBeDefined();
    expect(await json(summary.records.summary)).toMatchObject({ schema: 'ramify-agent.step-run/1', invocation: summary.invocation });
    await expect(stat(join(root, 'plans', '.harness', 'sessions'))).rejects.toThrow();

    // The authored work item, outline and assignment are the manual run's before its invocation.
    await expect(json(join(run, workLayout.item('state-note-limit')))).resolves.toMatchObject({ id: 'state-note-limit', goal: item.goal });
    await expect(json(join(run, workLayout.outline('state-note-limit', 1)))).resolves.toMatchObject({ workItem: 'state-note-limit', revision: 1 });
    await expect(json(join(run, iterationLayout.assignment('state-note-limit', 1)))).resolves.toMatchObject({ goal: 'Raise the note limit to 500.' });

    // S12: the live output, in order.
    const types = events.map(event => event.type);
    expect(types[0]).toBe('step-started');
    expect(types.at(-1)).toBe('step-summary');
    const printer = createStepProgressText();
    const text = events.map(printer).filter(line => line !== null).join('\n');
    expect(text).toContain(`Step: engineer, invocation ${summary.invocation}`);
    expect(text).toContain('Base: base-1; the tree matched it at start.');
    expect(text).toMatch(/→ edit /u);
    expect(text).toMatch(/◆ write refused; the session is told:/u);
    expect(text).toMatch(/◆ Appended to the edit result:[\s\S]*not-visible/u);
    expect(text).toMatch(/◆ Rejected; the session is told:/u);
    expect(text).toMatch(/◆ Accepted; the session is told:/u);
    expect(text).toContain('Step ended: submitted');
    expect(text).toContain('Tokens: ');
    expect(text).toContain(`  invocation: ${summary.records.invocation}`);
    expect(text).toContain('Base: base-1; dirty at start: no.');
  }, 120_000);

  test('a session that ends without an accepted submission exits 1; refused steps exit 2 and start no agent', async () => {
    const { root, scratch } = await project();
    const inputs = await authoredInputs(root, scratch);
    const git = scriptedGit({ head: 'base-1', changed: [] });
    const ended = await step(root, inputs, manualRun(root, 'm-ended'), [{ kind: 'end' }], git);
    expect(finished(ended.result).ended).not.toBe('submitted');
    expect(ended.result.exitStatus).toBe(1);

    // Not a run directory.
    const outside = await step(root, inputs, join(root, 'plans', planId, 'm-001'), [], git);
    expect(outside.result).toMatchObject({ status: 'not-started', exitStatus: 2, reason: expect.stringContaining('is not a run directory') });
    expect(outside.agent.sessions).toEqual([]);

    // An implementation run is never a manual run.
    const implementation = manualRun(root, 'r-impl');
    await mkdir(implementation, { recursive: true });
    await writeFile(join(implementation, 'job.json'), JSON.stringify({ schema: 'ramify-agent.job/3', jobId: 'r-impl', planId, kind: 'implementation' }));
    const refused = await step(root, inputs, implementation, [], git);
    expect(refused.result).toMatchObject({ status: 'not-started', exitStatus: 2, reason: expect.stringContaining('cannot be used') });
    expect(refused.agent.sessions).toEqual([]);

    // A held project lock is someone else's.
    const lock = await acquireProjectLock(root);
    try {
      const locked = await step(root, inputs, manualRun(root, 'm-locked'), [], git);
      expect(locked.result).toMatchObject({ status: 'not-started', exitStatus: 2, reason: expect.stringContaining('holds the project lock') });
    } finally { await lock.release(); }

    // A file that is not step inputs.
    const invalid = join(scratch, 'not-inputs.json');
    await writeFile(invalid, '{}');
    expect((await step(root, invalid, manualRun(root, 'm-x'), [], git)).result).toMatchObject({ status: 'not-started', exitStatus: 2 });
  }, 120_000);
});

describe('S13/S14: the tree as it stands, and a second run', () => {
  test('each run is a new invocation that records its base, its dirty state and its prompt package, and restores nothing', async () => {
    const { root, scratch } = await project();
    const inputs = await authoredInputs(root, scratch);
    const tree: Tree = { head: 'base-1', changed: [] };
    const git = scriptedGit(tree);
    const run = manualRun(root, 'm-001');
    const first = finished((await step(root, inputs, run, [
      edit('notes.ts', 'noteLimit = 400', 'noteLimit = 500'), { kind: 'submit', input: unsuitableScope() },
    ], git)).result);
    const firstRecords = await tree_(first.records.invocation);

    // An edit since: the tree differs from the same base.
    tree.changed = [notesSource];
    const second = finished((await step(root, inputs, run, [{ kind: 'submit', input: unsuitableScope() }], git)).result);
    expect(second.invocation).not.toBe(first.invocation);
    expect(invocationSchema.parse(await json(second.records.invocation))).toMatchObject({ base: 'base-1', startingTree: { dirty: true, changed: [notesSource] } });
    expect(second).toMatchObject({ dirty: true, startingChanged: [notesSource] });

    // A harness fix: a changed engineer prompt package, and a new commit.
    tree.head = 'base-2';
    const loadPackages: StepRunOptions['loadPackages'] = async capabilityWorkflow => {
      const { packages } = await loadPromptPackages({ capabilityWorkflow });
      const engineer = packages.get('engineer')!;
      return new Map([...packages, ['engineer', { ...engineer, procedure: `${engineer.procedure}\n\nA harness fix.`, hash: 'f'.repeat(64) }]]);
    };
    const third = finished((await step(root, inputs, run, [{ kind: 'submit', input: unsuitableScope() }], git, { loadPackages })).result);
    const records = [first, second, third].map(summary => summary.records.invocation);
    const parsed = await Promise.all(records.map(async path => invocationSchema.parse(await json(path))));
    expect(new Set(parsed.map(record => record.id)).size).toBe(3);
    expect(parsed[0]!.prompt.hash).toBe(parsed[1]!.prompt.hash);
    expect(parsed[2]!.prompt.hash).toBe('f'.repeat(64));
    expect(parsed[2]!.base).toBe('base-2');
    // Nothing is restored: the first run's edit stays, and its records are as they were.
    expect(await readFile(join(root, notesSource), 'utf8')).toBe('export const noteLimit = 500;\n');
    expect(await tree_(first.records.invocation)).toEqual(firstRecords);
  }, 180_000);
});

/** The files of one invocation's record directory. */
const tree_ = async (invocationRecord: string) => tree(join(invocationRecord, '..'));

describe('S20: the recorded start is what render shows', () => {
  test('the started entry carries the declarations and additions that render shows for the same inputs', async () => {
    const { root, scratch } = await project();
    const inputs = await authoredInputs(root, scratch);
    const git = scriptedGit({ head: 'base-1', changed: [] });
    const run = manualRun(root, 'm-020');
    const { result } = await step(root, inputs, run, [{ kind: 'submit', input: unsuitableScope('The limit is owned elsewhere.') }], git);
    const summary = finished(result);

    const recorded = await readTranscript(summary.records.transcript);
    expect(recorded.unreadable).toEqual([]);
    const started = recorded.entries.find(entry => entry.type === 'started' && entry.invocation === summary.invocation);
    if (started?.type !== 'started') throw new Error('no started entry');
    if (started.declarations === undefined || started.additions === undefined) throw new Error('the started entry records no declarations or additions');
    const store = new ContentStore(join(run, runLayout.blobs));
    const body = async (stored: Parameters<typeof readBody>[2]) => readBody(run, store, stored);

    const stepInputs = parseStepInputs(await readFile(summary.records.inputs, 'utf8'));
    const { packages } = await loadPromptPackages({ capabilityWorkflow: stepInputs.capabilityWorkflow });
    const rendered = await renderStep(constructStep(stepInputs, { projectRoot: root, packages }), {
      projectRoot: root, packages, builtinDeclarations: piBuiltinDeclarations, operationId: summary.invocation,
    });
    expect(await body(started.systemPrompt)).toBe(rendered.packet.roleInstructions);
    expect(await body(started.prompt)).toBe(rendered.packet.message);
    expect(started.declarations.names).toEqual(rendered.declarations.map(declaration => declaration.name));
    expect(JSON.parse((await body(started.declarations.body))!)).toEqual(JSON.parse(JSON.stringify(rendered.declarations)));
    expect(await Promise.all(started.additions.map(async addition => ({ key: addition.key, kind: addition.kind, text: await body(addition.body) }))))
      .toEqual(rendered.packet.additions.map(addition => ({ key: addition.key, kind: addition.kind, text: addition.text })));

    // The printed render names the same tools and carries the same message.
    const printed = await runStepCommandWith({ command: 'render', inputs: summary.records.inputs, projectRoot: root, invocation: summary.invocation });
    expect(printed.exitStatus).toBe(0);
    expect(printed.stdout).toContain(rendered.packet.message);
    for (const name of started.declarations.names) expect(printed.stdout).toContain(`--- ${name}`);
  }, 120_000);

  test('a started entry written before declarations were recorded still parses, and its evidence reads as unavailable', async () => {
    const { transcriptEntrySchema } = await import('../interfaces/protocol/transcripts.js');
    const historical = {
      n: 1, at: '2026-10-01T00:00:00.000Z', type: 'started', invocation: 'inv-0001', role: 'engineer', work: {}, start: 'opened', requested: 'fresh',
      continues: null, fork: null, replaces: null, requestedBy: null, executor: 'pi', model: null,
      systemPrompt: { stored: 'inline', text: 'role', bytes: 4 }, prompt: { stored: 'inline', text: 'task', bytes: 4 },
    };
    const parsed = transcriptEntrySchema.parse(historical);
    expect(parsed.type === 'started' && parsed.declarations).toBeUndefined();
    expect(parsed.type === 'started' && parsed.additions).toBeUndefined();
  });
});

describe('S14: where a step starts', () => {
  test('a point of the same manual run continues; a point of another run, or one it does not hold, starts fresh with the reason', async () => {
    const { root, scratch } = await project();
    const authored = await authoredInputs(root, scratch);
    const git = scriptedGit({ head: 'base-1', changed: [] });
    const run = manualRun(root, 'm-001');
    const first = finished((await step(root, authored, run, [{ kind: 'submit', input: completionProposed('Done.') }], git)).result);
    expect(first.ended).toBe('submitted');
    const point = invocationOutcomeSchema.parse(await json(first.records.outcome)).session?.ref;
    expect(point).toBeTruthy();

    const fresh = parseStepInputs(await readFile(authored, 'utf8'));
    if (fresh.role !== 'engineer') throw new Error('unreachable');
    const repair = (session: string) => ({ ...fresh, failedGate: { id: 'ga-0001', cause: null, summary: ['The scripted gate failed.'] },
      start: { kind: 'repair-continuation', session, point } });

    const continuing = await writeInputs(scratch, 'repair.json', repair(first.session));
    const continued = await step(root, continuing, run, [{ kind: 'submit', input: unsuitableScope() }], git);
    expect(finished(continued.result).start).toMatchObject({ requested: 'repair-continuation', actual: 'continued', reason: null });
    expect(continued.agent.sessions[0]!.start.mode).toBe('continue');
    expect(finished(continued.result).session).toBe(first.session);

    // The same point given to another manual run: no provider history is imported.
    const elsewhere = await step(root, continuing, manualRun(root, 'm-002'), [{ kind: 'submit', input: unsuitableScope() }], git);
    expect(finished(elsewhere.result).start).toMatchObject({ requested: 'repair-continuation', actual: 'fresh', reason: expect.stringContaining('belongs to run m-001') });
    expect(elsewhere.agent.sessions[0]!.start.mode).toBe('fresh');
    expect(parseStepInputs(await readFile(finished(elsewhere.result).records.inputs, 'utf8')).start)
      .toEqual({ kind: 'fresh', degraded: { requested: 'continued', reason: expect.stringContaining('belongs to run m-001') } });

    // A session the manual run does not hold at that point.
    const missing = await writeInputs(scratch, 'missing.json', repair('s-not-held'));
    const absent = await step(root, missing, run, [{ kind: 'submit', input: unsuitableScope() }], git);
    expect(finished(absent.result).start).toMatchObject({ actual: 'fresh', reason: expect.stringContaining('holds no session') });
  }, 180_000);

  test('inputs imported from a source run start fresh with their provenance and leave the source run unchanged', async () => {
    const { root, scratch } = await project();
    const authored = await authoredInputs(root, scratch);
    const git = scriptedGit({ head: 'base-1', changed: [] });
    const source = manualRun(root, 'm-source');
    const original = finished((await step(root, authored, source, [{ kind: 'submit', input: completionProposed('Done.') }], git)).result);
    const before = await tree(source);

    const fresh = parseStepInputs(await readFile(authored, 'utf8'));
    if (fresh.role !== 'engineer') throw new Error('unreachable');
    const { provenance: _authored, ...rest } = fresh;
    const point = invocationOutcomeSchema.parse(await json(original.records.outcome)).session!.ref;
    const imported: StepInputs = parseStepInputs(JSON.stringify({ ...rest, run: { planId, runId: 'm-source' },
      provenance: { run: { planId, runId: 'm-source' }, invocation: original.invocation, record: { run: runLayout.stepInputs(original.invocation) },
        originalStart: 'repair-continuation', originalPoint: point } }));
    const path = await writeInputs(scratch, 'imported.json', imported);
    const target = await step(root, path, manualRun(root, 'm-target'), [{ kind: 'submit', input: unsuitableScope() }], git);
    const summary = finished(target.result);
    expect(summary.start).toMatchObject({ requested: 'fresh', actual: 'fresh', reason: null, provenance: expect.stringContaining(`m-source ${original.invocation} (original start repair-continuation)`) });
    expect(target.agent.sessions[0]!.start.mode).toBe('fresh');
    expect(parseStepInputs(await readFile(summary.records.inputs, 'utf8'))).toMatchObject({
      run: { planId, runId: 'm-target' }, provenance: { run: { runId: 'm-source' }, invocation: original.invocation } });
    expect(await tree(source)).toEqual(before);
  }, 180_000);
});
