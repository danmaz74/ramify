import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { piBuiltinDeclarations } from '../../subs/agent/subs/pi/src/session-operations.js';
import { loadPromptPackages } from '../prompts/packages.js';
import { runStepCommand } from '../steps/command.js';
import { constructStep } from '../steps/construct.js';
import { inputsFromRun } from '../steps/from-run.js';
import type { AuthoredFiles } from '../steps/authored.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { assign, outline, readDeclaredTree } from './helpers/iterations.js';
import { repairContinuationRun, type RepairRun } from './helpers/repair-run.js';
import { runEventsOnDisk, runPath } from './helpers/runs.js';

/*
 * S07: authored inputs are judged as their producing role's output, with
 * the context the run recorded for that role. A file the role's schema or
 * rules refuse is refused with the reason, and one without its context is
 * refused with what is missing; nothing is defaulted.
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
  test('the command refuses authored files given without a run and names the context each needs', async () => {
    const result = await runStepCommand({ command: 'inputs', role: 'engineer', fromRun: undefined, invocation: undefined, authored: { assignment: await file(assign(notes)), workItem: await file({}) } });
    expect(result).toMatchObject({ exitStatus: 2, stdout: '' });
    expect(result.stderr).toMatch(/^Refused: authored inputs are judged as their producing role's output/u);
    expect(result.stderr).toContain('Missing: --work-item needs the work item\'s recorded briefing');
    expect(result.stderr).toContain('--assignment needs the producing work turn\'s registry');
  });

  test('an unreadable authored file is refused with the reason', async () => {
    const path = join(scratch, 'not-json.json');
    await writeFile(path, '{');
    const result = await authored('engineer', engineerId, { assignment: path });
    expect(result).toEqual({ status: 'refused', reason: expect.stringContaining('cannot be read as JSON') });
  });
});
