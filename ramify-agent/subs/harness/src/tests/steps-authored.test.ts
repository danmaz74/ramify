import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { piBuiltinDeclarations } from '../../subs/agent/subs/pi/src/session-operations.js';
import { loadPromptPackages } from '../prompts/packages.js';
import { runStepCommand, runStepCommandWith } from '../steps/command.js';
import { constructStep } from '../steps/construct.js';
import { inputsFromRun } from '../steps/from-run.js';
import type { AuthoredFiles } from '../steps/authored.js';
import type { AuthoringPorts } from '../steps/authoring.js';
import { parseStepInputs } from '../steps/inputs.js';
import { passingAudit } from './helpers/direct-check-execution.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { copyFixture } from './helpers/fixture.js';
import { addModule, assign, outline, readDeclaredTree } from './helpers/iterations.js';
import { repairContinuationRun, type RepairRun } from './helpers/repair-run.js';
import { runEventsOnDisk, runPath } from './helpers/runs.js';

/*
 * S07: authored inputs are judged as their producing role's output, with
 * the context the run recorded for that role, or, for engineer inputs
 * authored with no run, the context a run reads from the project at its
 * start. A file the role's schema or rules refuse is refused with the
 * reason, and one without its context is refused with what is missing;
 * nothing is defaulted.
 */

const notes = 'collection-review/workspace/reviews/notes';
const cleanups: Array<() => Promise<void>> = [];
afterAll(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

let run: RepairRun;
let directory: string;
let engineerId: string;
let orientationId: string;
let workTurnId: string;
let scratch: string;
beforeAll(async () => {
  run = await repairContinuationRun(cleanups);
  directory = runPath(run.root, run.planId, run.runId);
  const started = (await runEventsOnDisk(run.root, run.planId, run.runId)).flatMap(event => event.type === 'invocation-started' ? [event.data] : []);
  engineerId = started.find(item => item.role === 'engineer')!.invocation;
  const architect = started.filter(item => item.role === 'local-architect').map(item => item.invocation);
  [orientationId, workTurnId] = architect as [string, string];
  scratch = await mkdtemp(join(tmpdir(), 'ramify-agent-authored-'));
  cleanups.push(() => rm(scratch, { recursive: true, force: true }));
}, 300_000);

let written = 0;
async function file(value: unknown): Promise<string> {
  const path = join(scratch, `authored-${++written}.json`);
  await writeFile(path, JSON.stringify(value));
  return path;
}

const authoring = { ramify: new FakeRamifyCli(), index: readDeclaredTree };
const authored = (role: string, invocation: string, files: AuthoredFiles) => inputsFromRun({
  role, runDirectory: directory, invocation, builtinDeclarations: piBuiltinDeclarations, authored: files, authoring,
});

describe('S07: an authored assignment', () => {
  test('one the local architect would accept is given with the recorded engineer inputs and renders its own goal', async () => {
    const result = await authored('engineer', engineerId, { assignment: await file(assign(notes, { goal: 'State the authored note limit.' }, outline())) });
    if (result.status !== 'imported') throw new Error(result.reason);
    if (result.inputs.role !== 'engineer') throw new Error('unreachable');
    expect(result.inputs.assignment.goal).toBe('State the authored note limit.');
    expect(result.inputs.start).toEqual({ kind: 'fresh' });
    expect(result.inputs.provenance).toMatchObject({ invocation: engineerId, originalStart: 'fresh', authored: ['assignment'] });
    const { packages } = await loadPromptPackages({ capabilityWorkflow: result.inputs.capabilityWorkflow });
    expect(constructStep(result.inputs, { projectRoot: run.root, packages }).prompt).toContain('State the authored note limit.');
  });

  test('one the local architect\'s schema refuses is refused with the schema\'s reasons', async () => {
    const result = await authored('engineer', engineerId, { assignment: await file({ kind: 'assign', localDecisions: [] }) });
    expect(result).toEqual({ status: 'refused', reason: expect.stringMatching(/--assignment .*: the local architect's submission schema refuses it: /u) });
  });

  test('one the local architect\'s rules refuse is refused with the rules\' reasons', async () => {
    const result = await authored('engineer', engineerId, { assignment: await file(assign(notes, { citedElements: ['no-such-element'] }, outline())) });
    expect(result).toEqual({ status: 'refused', reason: expect.stringMatching(/--assignment .*: the local architect's rules refuse it: .*no-such-element/u) });
  });

  test('one that changes what the engineer inputs derive their gate from is refused', async () => {
    const scope = { base: { module: notes, included: [] }, extra: [], read: [], rationale: 'The work is in this module.' };
    const result = await authored('engineer', engineerId, { assignment: await file(assign(notes, { kind: 'verification', scope }, outline())) });
    expect(result).toEqual({ status: 'refused', reason: expect.stringMatching(/--assignment .*: it changes kind, which the engineer inputs derive the gate/u) });
  });

  test('an assignment given for a role it does not produce inputs for is refused', async () => {
    const result = await authored('local-architect', workTurnId, { assignment: await file(assign(notes)) });
    expect(result).toEqual({ status: 'refused', reason: expect.stringContaining('it replaces part of an engineer\'s inputs') });
  });
});

describe('S07: authored local architect inputs', () => {
  test('a work item other than the recorded one is refused, and the recorded one with new text is accepted', async () => {
    const recorded = await inputsFromRun({ role: 'local-architect', runDirectory: directory, invocation: orientationId, builtinDeclarations: piBuiltinDeclarations });
    if (recorded.status !== 'imported' || recorded.inputs.role !== 'local-architect') throw new Error('unreachable');
    const item = recorded.inputs.briefing.item as Record<string, unknown>;
    const other = await authored('local-architect', orientationId, { workItem: await file({ ...item, id: 'another-item' }) });
    expect(other).toEqual({ status: 'refused', reason: expect.stringContaining('is not the recorded') });
    const invalid = await authored('local-architect', orientationId, { workItem: await file({ id: item.id }) });
    expect(invalid).toEqual({ status: 'refused', reason: expect.stringContaining('not a work item') });

    const goal = 'An authored goal for the recorded work item.';
    const accepted = await authored('local-architect', orientationId, { workItem: await file({ ...item, goal }) });
    if (accepted.status !== 'imported') throw new Error(accepted.reason);
    expect(accepted.inputs.provenance).toMatchObject({ authored: ['work-item'] });
    const { packages } = await loadPromptPackages({ capabilityWorkflow: accepted.inputs.capabilityWorkflow });
    expect(constructStep(accepted.inputs, { projectRoot: run.root, packages }).prompt).toContain(goal);
  });

  test('a selection the context selector\'s schema refuses is refused; one it accepts replaces the work turn\'s package', async () => {
    const refused = await authored('local-architect', workTurnId, { selection: await file({ selected: [{ id: 'x' }] }) });
    expect(refused).toEqual({ status: 'refused', reason: expect.stringContaining('the context selector\'s submission schema refuses it') });
    const onOrientation = await authored('local-architect', orientationId, { selection: await file({ selected: [] }) });
    expect(onOrientation).toEqual({ status: 'refused', reason: expect.stringContaining('a local architect work turn\'s inputs') });

    const accepted = await authored('local-architect', workTurnId, { selection: await file({ selected: [] }) });
    if (accepted.status !== 'imported') throw new Error(accepted.reason);
    if (accepted.inputs.role !== 'local-architect' || accepted.inputs.phase !== 'work-turn') throw new Error('unreachable');
    // An empty selection still cites the work item's own elements.
    expect(accepted.inputs.package?.elements).toEqual(['fr-001', 'fr-002']);
    expect(accepted.inputs.package?.text).toContain('fr-001');
    expect(accepted.inputs.provenance).toMatchObject({ authored: ['selection'] });
  });

  test('an outline of another work item is refused', async () => {
    const result = await authored('local-architect', workTurnId, {
      outline: await file({ schema: 'ramify-agent.work-item-outline/1', workItem: 'another-item', revision: 1, invocation: 'x', ...outline() }),
    });
    expect(result).toEqual({ status: 'refused', reason: expect.stringMatching(/--outline .*(is of another-item|not a work-item outline)/u) });
  });
});

describe('S07: authored inputs without their context', () => {
  test('the command refuses authored files that need a run, given without one, and names the context each needs', async () => {
    const result = await runStepCommand({ command: 'inputs', role: 'local-architect', fromRun: undefined, invocation: undefined, projectRoot: run.root,
      authored: { selection: await file({ selected: [] }), workItem: await file({}) } });
    expect(result).toMatchObject({ exitStatus: 2, stdout: '' });
    expect(result.stderr).toMatch(/^Refused: without --from-run and --invocation, only engineer inputs are authored: --role engineer --project <root>/u);
    expect(result.stderr).toContain('the role is local-architect');
    expect(result.stderr).toContain('--selection needs the element catalog');
    expect(result.stderr).toContain('--assignment is absent');
    const unnamed = await runStepCommand({ command: 'inputs', role: 'engineer', fromRun: undefined, invocation: undefined,
      authored: { assignment: await file(assign(notes)), workItem: await file({}) } });
    expect(unnamed.stderr).toContain('Missing: --project names no project');
  });

  test('an unreadable authored file is refused with the reason', async () => {
    const path = join(scratch, 'not-json.json');
    await writeFile(path, '{');
    const result = await authored('engineer', engineerId, { assignment: path });
    expect(result).toEqual({ status: 'refused', reason: expect.stringContaining('cannot be read as JSON') });
  });
});

/** The view `ramify materialize` would write, for the modules the project declares. */
async function materializeView(root: string, revision: string): Promise<void> {
  const tree = await readDeclaredTree(root);
  const view = join(root, '.ramify-architect');
  await mkdir(view, { recursive: true });
  await writeFile(join(view, '_meta.json'), JSON.stringify({
    schema: 'ramify.architect-view/3', revision, input: 'input/1:authored', modules: tree.modules.size, dependencies: 'measured', dependencyScope: 'production',
  }));
  for (const module of tree.modules.values()) {
    const directory = join(view, module.module);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'module.json'), JSON.stringify({
      schema: 'ramify.architect-module/3', module: module.module, dir: module.dir, parent: module.parent,
      children: module.children, tags: module.tags, areas: module.areas,
    }));
  }
  const api = join(root, notesDirectory, 'src', '.ramify');
  await mkdir(api, { recursive: true });
  await writeFile(join(api, '_meta.json'), JSON.stringify({ schema: 'ramify.api-view/1', module: notes, area: 'ordinary', revision }));
}

const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';

describe('S07: engineer inputs authored with no run', () => {
  let project: string;
  let bare: string;
  let ramify: FakeRamifyCli;
  const ports = (): AuthoringPorts => ({ ramify, git: { currentHead: async () => 'base' }, configuredAudit: passingAudit() });
  const item = {
    schema: 'ramify-agent.work-item/1', id: 'state-note-limit', module: notes, origin: { entry: 'review-note' },
    goal: 'State the note limit the reviewers asked for.', requirementRefs: [], acceptanceRefs: [], contextRefs: [], startedFor: null,
  };
  beforeAll(async () => {
    for (const target of ['project', 'bare'] as const) {
      const fixture = await copyFixture();
      cleanups.push(fixture.remove);
      await addModule(fixture.root, notesDirectory, 'notes', { 'src/notes.ts': 'export const noteLimit = 400;\n' });
      if (target === 'project') project = fixture.root; else bare = fixture.root;
    }
    await materializeView(project, 'rev/1:authored:1');
    ramify = new FakeRamifyCli();
  });

  test('an accepted assignment gives engineer inputs that record what was authored and render its goal', async () => {
    const out = join(scratch, 'authored-engineer.json');
    const result = await runStepCommandWith({
      command: 'inputs', role: 'engineer', fromRun: undefined, invocation: undefined, projectRoot: project, out,
      authored: { workItem: await file(item), assignment: await file(assign(notes, { goal: 'State the authored note limit.' }, outline())) },
    }, ports());
    if (result.exitStatus !== 0) throw new Error(result.stderr);
    expect(result.stderr).toContain('Authored engineer inputs for state-note-limit.i01 with no run');
    expect(result.stderr).toContain('Authored: work-item, assignment.');
    expect(ramify.calls.filter(call => call.operation === 'materialize')).toEqual([]);

    const inputs = parseStepInputs(await readFile(out, 'utf8'));
    if (inputs.role !== 'engineer') throw new Error('unreachable');
    expect(inputs.run).toBeNull();
    expect(inputs.base).toBe('base');
    expect(inputs.start).toEqual({ kind: 'fresh' });
    expect(inputs.work).toEqual({ workItem: 'state-note-limit', iteration: inputs.assignment.id });
    expect(inputs.assignment).toMatchObject({ workItem: 'state-note-limit', goal: 'State the authored note limit.', outline: { id: 'state-note-limit', revision: 1 } });
    expect(inputs.workingDirectory).toEqual({ project: `${notesDirectory}/src` });
    expect(inputs.provenance).toMatchObject({
      origin: 'authored', authored: ['work-item', 'assignment'], workItem: item,
      outlines: [expect.objectContaining({ workItem: 'state-note-limit', revision: 1, invocation: 'authored' })],
    });

    const rendered = await runStepCommand({ command: 'render', inputs: out, projectRoot: project });
    expect(rendered.exitStatus).toBe(0);
    expect(rendered.stdout).toContain('State the authored note limit.');
  });

  test('--iteration numbers a later assignment of the work item, which the run would otherwise count', async () => {
    const result = await runStepCommandWith({
      command: 'inputs', role: 'engineer', fromRun: undefined, invocation: undefined, projectRoot: project, iteration: 2,
      authored: { workItem: await file(item), assignment: await file(assign(notes, { goal: 'State the second note limit.' }, outline())) },
    }, ports());
    if (result.exitStatus !== 0) throw new Error(result.stderr);
    expect(result.stderr).toContain('Authored engineer inputs for state-note-limit.i02 with no run');
    expect(result.stderr).toContain('work turn assigning iteration 2');
    const inputs = parseStepInputs(result.stdout);
    if (inputs.role !== 'engineer') throw new Error('unreachable');
    expect(inputs.assignment.id).toBe('state-note-limit.i02');
    expect(inputs.work).toEqual({ workItem: 'state-note-limit', iteration: 'state-note-limit.i02' });
  });

  test('a recorded outline from --outline is the assignment\'s basis when the envelope carries none', async () => {
    const recorded = { schema: 'ramify-agent.work-item-outline/1', workItem: item.id, revision: 1, invocation: 'authored', ...outline(), hypothesesSeen: [] };
    const result = await runStepCommandWith({
      command: 'inputs', role: 'engineer', fromRun: undefined, invocation: undefined, projectRoot: project,
      authored: { workItem: await file(item), outline: await file(recorded), assignment: await file(assign(notes)) },
    }, ports());
    if (result.exitStatus !== 0) throw new Error(result.stderr);
    const inputs = parseStepInputs(result.stdout);
    expect(inputs.provenance).toMatchObject({ origin: 'authored', authored: ['work-item', 'outline', 'assignment'] });
    if (inputs.role !== 'engineer') throw new Error('unreachable');
    expect(inputs.assignment.outline).toMatchObject({ id: item.id, revision: 1 });
  });

  test('without the materialized architect view it is refused, and nothing is materialized', async () => {
    const result = await runStepCommandWith({
      command: 'inputs', role: 'engineer', fromRun: undefined, invocation: undefined, projectRoot: bare,
      authored: { workItem: await file(item), assignment: await file(assign(notes, {}, outline())) },
    }, ports());
    expect(result).toMatchObject({ exitStatus: 2, stdout: '' });
    expect(result.stderr).toMatch(/^Refused: the materialized architect view at .*\.ramify-architect cannot be read, and inputs authored without a run never materialize it: /u);
    expect(ramify.calls.filter(call => call.operation === 'materialize')).toEqual([]);
  });

  test('plan elements, local decisions, a rule the local architect enforces and a missing outline are each refused', async () => {
    const author = async (workItem: unknown, assignment: unknown) => runStepCommandWith({
      command: 'inputs', role: 'engineer', fromRun: undefined, invocation: undefined, projectRoot: project,
      authored: { workItem: await file(workItem), assignment: await file(assignment) },
    }, ports());
    expect((await author({ ...item, requirementRefs: ['fr-001'] }, assign(notes, {}, outline()))).stderr).toContain('it cites the plan elements fr-001');
    expect((await author(item, { ...assign(notes, {}, outline()), localDecisions: [{ question: 'q', decision: 'd', rationale: 'r' }] })).stderr)
      .toMatch(/--assignment: (it carries local decisions|the local architect's submission schema refuses it)/u);
    expect((await author(item, assign(notes, { citedElements: ['fr-001'] }, outline()))).stderr).toContain('--assignment: it cites the elements fr-001');
    const elsewhere = { base: { module: 'collection-review/no-such-module', included: [] }, extra: [], read: [], rationale: 'Elsewhere.' };
    expect((await author(item, assign(notes, { scope: elsewhere }, outline()))).stderr)
      .toMatch(/--assignment: the local architect's rules refuse it: .*no-such-module/u);
    expect((await author(item, assign(notes))).stderr).toContain('The first assignment needs an outline');
  });
});
