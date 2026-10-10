import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { BuiltinTool, WriteTool } from '../../subs/agent/src/interfaces/port.js';
import { piBuiltinDeclarations } from '../../subs/agent/subs/pi/src/session-operations.js';
import { loadPromptPackages } from '../prompts/packages.js';
import { runLayout } from '../run/records.js';
import { runStepCommand } from '../steps/command.js';
import { constructStep } from '../steps/construct.js';
import { constructEngineerStep } from '../steps/engineer.js';
import { inputsFromRun } from '../steps/from-run.js';
import { parseStepInputs, serializeStepInputs, type StepInputs } from '../steps/inputs.js';
import { renderStep } from '../steps/render.js';
import { repairContinuationRun, type RepairRun } from './helpers/repair-run.js';
import { runEventsOnDisk, runPath } from './helpers/runs.js';

/*
 * S03: one engineer invocation imported from a run, from the inputs the run
 * recorded. S04: `render` prints what a step's session receives, without a
 * lock or a write.
 */

const cleanups: Array<() => Promise<void>> = [];
afterAll(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

let run: RepairRun;
let directory: string;
let freshId: string;
let repairId: string;
let architectId: string;
let scratch: string;
beforeAll(async () => {
  run = await repairContinuationRun(cleanups);
  directory = runPath(run.root, run.planId, run.runId);
  const started = (await runEventsOnDisk(run.root, run.planId, run.runId)).flatMap(event => event.type === 'invocation-started' ? [event.data] : []);
  [freshId, repairId] = started.filter(item => item.role === 'engineer').map(item => item.invocation) as [string, string];
  architectId = started.find(item => item.role === 'local-architect')!.invocation;
  scratch = await mkdtemp(join(tmpdir(), 'ramify-agent-steps-'));
  cleanups.push(() => rm(scratch, { recursive: true, force: true }));
}, 300_000);

const imported = (invocation: string, options: { role?: string; runDirectory?: string } = {}) => inputsFromRun({
  role: options.role ?? 'engineer', runDirectory: options.runDirectory ?? directory, invocation, builtinDeclarations: piBuiltinDeclarations,
});

/** Every file beneath a directory with its size and modification time. */
async function tree(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return Promise.all(entries.filter(entry => entry.isFile() || entry.isSymbolicLink()).map(async entry => {
    const path = join(entry.parentPath, entry.name);
    const info = await stat(path).catch(() => null);
    return `${path} ${info?.size ?? 'dangling'} ${info?.mtimeMs ?? ''}`;
  })).then(items => items.sort());
}

describe('S03: inputs from a run', () => {
  test('a fresh invocation is imported from its recorded inputs and renders equal', async () => {
    const result = await imported(freshId);
    if (result.status !== 'imported') throw new Error(result.reason);
    expect(result.projectRoot).toBe(run.root);
    expect(result.comparison).toEqual({ status: 'equal' });
    expect(result.recorded).toEqual(parseStepInputs(await readFile(join(directory, runLayout.stepInputs(freshId)), 'utf8')));
    expect(result.inputs.start).toEqual({ kind: 'fresh' });
    if (result.inputs.role === 'engineer') {
      expect(result.inputs.consultation?.assigning).toBeUndefined();
      expect(result.inputs.consultation?.provenance?.assigning).toEqual(result.recorded.role === 'engineer' ? result.recorded.consultation?.assigning : undefined);
      expect(result.inputs.consultation?.unavailable).toContain('import no architect provider history');
    }
    expect(result.inputs.provenance).toEqual({ run: result.recorded.run, invocation: freshId, record: { run: runLayout.stepInputs(freshId) }, originalStart: 'fresh' });
  });

  test('an imported continuation is a complete fresh briefing with its original start as provenance and no provider history', async () => {
    const result = await imported(repairId);
    if (result.status !== 'imported') throw new Error(result.reason);
    // The recorded start renders the delivery the run made.
    expect(result.comparison).toEqual({ status: 'equal' });
    expect(result.recorded.start.kind).toBe('repair-continuation');
    if (result.recorded.start.kind === 'fresh') throw new Error('unreachable');
    expect(result.inputs.start).toEqual({ kind: 'fresh' });
    expect(result.inputs.provenance).toMatchObject({ invocation: repairId, originalStart: 'repair-continuation', originalPoint: result.recorded.start.point });
    if (result.inputs.role !== 'engineer' || result.recorded.role !== 'engineer') throw new Error('unreachable');
    expect(result.inputs.failedGate).toEqual(result.recorded.failedGate);

    const { packages } = await loadPromptPackages({ capabilityWorkflow: result.inputs.capabilityWorkflow });
    const rendered = await renderStep(constructEngineerStep(result.inputs, { projectRoot: run.root, packages }), {
      projectRoot: run.root, packages, builtinDeclarations: piBuiltinDeclarations, operationId: repairId,
      sessionOperations: join(run.root, 'plans', '.harness', 'session-operations'),
    });
    expect(rendered.rendered).toBe('fresh');
    expect(rendered.packet.manifest.inheritedPoint ?? null).toBeNull();
    expect(rendered.packet.additions.some(item => item.kind === 'role-instructions')).toBe(true);
    // The failed gate the repair continued from is part of the complete briefing.
    expect(rendered.packet.message).toContain('## The gate did not pass');
    expect(rendered.packet.message).toContain('Attempt `ga-0002` (check-failed)');
  });

  test('a differing rendering is reported, never a reason to refuse the import', async () => {
    const scripted = (names: readonly (BuiltinTool | WriteTool)[]) => names.map(name => ({ name, description: `Scripted ${name}`, inputSchema: { type: 'object' }, mutating: false }));
    const result = await inputsFromRun({ role: 'engineer', runDirectory: directory, invocation: freshId, builtinDeclarations: scripted });
    expect(result.status).toBe('imported');
    if (result.status !== 'imported') return;
    expect(result.comparison).toEqual({ status: 'different', sections: ['tool declaration: read', 'tool declaration: grep', 'tool declaration: ls', 'tool declaration: edit', 'tool declaration: write'] });
  });

  test('other roles, unknown invocations and incomplete task records are refused with the reason', async () => {
    expect(await imported(freshId, { role: 'failure-analyst' })).toEqual({ status: 'refused', reason: expect.stringContaining('no step inputs are defined for the role "failure-analyst"') });
    expect(await imported(architectId)).toEqual({ status: 'refused', reason: expect.stringContaining(`invocation ${architectId} is a local-architect invocation, not engineer`) });
    expect(await imported('inv-9999')).toEqual({ status: 'refused', reason: 'the run records no invocation inv-9999' });
    expect(await imported('../inv-0001')).toEqual({ status: 'refused', reason: expect.stringContaining('is not an invocation id') });
    expect(await imported(freshId, { runDirectory: run.root })).toEqual({ status: 'refused', reason: expect.stringContaining('is not a run directory') });
    const path = join(directory, runLayout.stepInputs(freshId));
    const bytes = await readFile(path, 'utf8');
    await rm(path);
    try {
      expect(await imported(freshId)).toEqual({ status: 'refused', reason: expect.stringMatching(/^incomplete task records: invocation .* has no recorded step inputs/u) });
      await writeFile(path, bytes.replace('"engineer"', '"reviewer"'));
      expect(await imported(freshId)).toEqual({ status: 'refused', reason: expect.stringMatching(/^incomplete task records: .* is not valid step inputs/u) });
    } finally {
      await writeFile(path, bytes);
    }
  });

  test('the command writes the imported inputs and prints the comparison', async () => {
    const out = join(scratch, 'imported.json');
    const result = await runStepCommand({ command: 'inputs', role: 'engineer', fromRun: directory, invocation: repairId, out });
    expect(result.exitStatus).toBe(0);
    expect(result.stderr).toContain('original start repair-continuation');
    expect(result.stderr).toContain('Recorded delivery: equal');
    const written = parseStepInputs(await readFile(out, 'utf8'));
    expect(written.start.kind).toBe('fresh');
    const refused = await runStepCommand({ command: 'inputs', role: 'failure-analyst', fromRun: directory, invocation: architectId });
    expect(refused).toMatchObject({ exitStatus: 2, stdout: '', stderr: expect.stringMatching(/^Refused: no step inputs are defined for the role "failure-analyst"/u) });
  });
});

describe('S08: local architect and reviewer inputs from a run', () => {
  test('orientation, selection and work turns import as complete fresh starts that keep their original start as provenance', async () => {
    const started = (await runEventsOnDisk(run.root, run.planId, run.runId)).flatMap(event => event.type === 'invocation-started' ? [event.data] : []);
    const starts: string[] = [];
    for (const { invocation, role } of started.filter(item => item.role === 'local-architect' || item.role === 'context-selector')) {
      const result = await imported(invocation, { role });
      if (result.status !== 'imported') throw new Error(result.reason);
      expect(result.comparison, invocation).toEqual({ status: 'equal' });
      const recorded = result.recorded;
      starts.push(`${recorded.role}/${'phase' in recorded ? recorded.phase : 'selection'}/${recorded.start.kind}`);
      expect(result.inputs.start.kind).toBe('fresh');
      expect(result.inputs.provenance).toMatchObject({ invocation, originalStart: recorded.start.kind,
        ...(recorded.start.kind === 'fresh' ? {} : { originalPoint: recorded.start.point }) });
      const { packages } = await loadPromptPackages({ capabilityWorkflow: result.inputs.capabilityWorkflow });
      const constructed = constructStep(result.inputs, { projectRoot: run.root, packages });
      const rendered = await renderStep(constructed, {
        projectRoot: run.root, packages, builtinDeclarations: piBuiltinDeclarations, operationId: invocation,
        sessionOperations: join(run.root, 'plans', '.harness', 'session-operations'),
      });
      // The imported turn delivers the complete briefing, whatever the original start delivered.
      expect(rendered.rendered).toBe('fresh');
      expect(rendered.packet.additions.some(item => item.kind === 'role-instructions')).toBe(true);
      if (recorded.role === 'context-selector' && recorded.start.kind === 'fork') {
        // A fork's imported start is briefed from the complete packet, not the fork's update.
        expect(constructed.brief.retainInheritedSections).toBeUndefined();
        expect(constructed.prompt).toContain((recorded as { packet: string }).packet);
      }
    }
    expect(starts).toEqual(expect.arrayContaining(['local-architect/orientation/fresh', 'context-selector/selection/fork', 'local-architect/work-turn/continued']));
  });

  test('a role or a start outside the first set is refused with its reason', async () => {
    const started = (await runEventsOnDisk(run.root, run.planId, run.runId)).flatMap(event => event.type === 'invocation-started' ? [event.data] : []);
    const initial = started.find(item => item.role === 'initial-architect')!.invocation;
    expect(await imported(initial, { role: 'initial-architect' })).toEqual({ status: 'refused', reason: expect.stringContaining('no step inputs are defined for the role "initial-architect"') });
    const orientation = architectId;
    const path = join(directory, runLayout.stepInputs(orientation));
    const bytes = await readFile(path, 'utf8');
    try {
      // An orientation is a fresh start only.
      const recorded = JSON.parse(bytes) as { start: unknown };
      await writeFile(path, JSON.stringify({ ...recorded, start: { kind: 'continued', point: 'not-a-point' } }));
      expect(await imported(orientation, { role: 'local-architect' })).toEqual({ status: 'refused', reason: expect.stringContaining('start.kind: expected one of "fresh"') });
    } finally {
      await writeFile(path, bytes);
    }
  });
});

describe('S04: render', () => {
  test('a fresh start prints its role instructions, message, every tool declaration and the submission schema, writing nothing', async () => {
    const result = await imported(repairId);
    if (result.status !== 'imported') throw new Error(result.reason);
    const file = join(scratch, 'fresh.json');
    await writeFile(file, serializeStepInputs(result.inputs));
    const before = await tree(run.root);
    const printed = await runStepCommand({ command: 'render', inputs: file, projectRoot: run.root });
    expect(await tree(run.root)).toEqual(before);
    expect(printed.exitStatus).toBe(0);
    const text = printed.stdout;
    for (const heading of ['==== Role instructions ====', '==== Message ====', '==== Tool declarations (7) ====', '==== Submission schema (submit_iteration_result) ====']) {
      expect(text).toContain(heading);
    }
    for (const tool of ['read', 'grep', 'ls', 'edit', 'write', 'shell', 'submit_iteration_result']) expect(text).toContain(`--- ${tool}`);
    expect(text).toContain('Attempt `ga-0002` (check-failed)');
    expect(text).not.toContain('Continuation additions only');
  });

  test('a continuation prints its additions alone, marked as such', async () => {
    const file = join(scratch, 'continuation.json');
    const recorded: StepInputs = parseStepInputs(await readFile(join(directory, runLayout.stepInputs(repairId)), 'utf8'));
    await writeFile(file, serializeStepInputs(recorded));
    const before = await tree(run.root);
    const printed = await runStepCommand({ command: 'render', inputs: file, projectRoot: run.root, invocation: repairId });
    expect(await tree(run.root)).toEqual(before);
    expect(printed.stdout).toContain('==== Continuation additions only');
    expect(printed.stdout).not.toContain('==== Role instructions ====');
    expect(printed.stdout).not.toContain('==== Tool declarations');
    expect(printed.stdout).toContain('==== Submission schema (submit_iteration_result) ====');
    // Without the session's recorded ancestry the continuation renders as the fresh start the run would fall back to.
    const elsewhere = await runStepCommand({ command: 'render', inputs: file, projectRoot: scratch, invocation: repairId });
    expect(elsewhere.stdout).toContain('Rendered as the complete fresh start the run falls back to');
    expect(elsewhere.stdout).toContain('==== Role instructions ====');
  });

  test('invalid inputs are refused', async () => {
    const file = join(scratch, 'invalid.json');
    await writeFile(file, JSON.stringify({ schema: 'ramify-agent.step-inputs/1', role: 'engineer', start: { kind: 'fresh' } }));
    expect(await runStepCommand({ command: 'render', inputs: file, projectRoot: run.root })).toMatchObject({ exitStatus: 2, stderr: expect.stringContaining('Refused: Invalid step inputs') });
    expect(await runStepCommand({ command: 'render', inputs: join(scratch, 'missing.json'), projectRoot: run.root })).toMatchObject({ exitStatus: 2 });
  });
});
