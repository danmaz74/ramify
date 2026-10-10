import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { runLayout } from '../run/records.js';
import { parseStepInputs, serializeStepInputs, StepInputsError, stepInputsSchemaId, validateStepInputs, type EngineerStepInputs, type StepInputs } from '../steps/inputs.js';
import { repairContinuationRun } from './helpers/repair-run.js';
import { runEventsOnDisk, runPath } from './helpers/runs.js';

/*
 * S02: the step inputs are plain JSON a run writes and a step reads back.
 * Every path field names its base and stays beneath it; captured prose may
 * name any path.
 */

const cleanups: Array<() => Promise<void>> = [];
afterAll(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

let fresh: EngineerStepInputs;
let repair: EngineerStepInputs;
let recordedBytes: string[];
beforeAll(async () => {
  const run = await repairContinuationRun(cleanups);
  const events = await runEventsOnDisk(run.root, run.planId, run.runId);
  const engineers = events.flatMap(event => event.type === 'invocation-started' && event.data.role === 'engineer' ? [event.data.invocation] : []);
  recordedBytes = await Promise.all(engineers.map(id => readFile(runPath(run.root, run.planId, run.runId, runLayout.stepInputs(id)), 'utf8')));
  [fresh, repair] = recordedBytes.map(parseStepInputs) as [EngineerStepInputs, EngineerStepInputs];
}, 300_000);

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** A copy of the inputs with each listed field replaced, or removed where its value is undefined. */
function changed(inputs: StepInputs, ...edits: [path: string, value: Json | undefined][]): Json {
  const copy = JSON.parse(JSON.stringify(inputs)) as Json;
  for (const [path, value] of edits) {
    const keys = path.split('.');
    let target = copy;
    for (const key of keys.slice(0, -1)) {
      if (target === null || typeof target !== 'object' || Array.isArray(target)) throw new Error(`No object at ${key} of ${path}`);
      target = target[key]!;
    }
    if (target === null || typeof target !== 'object' || Array.isArray(target)) throw new Error(`No object for ${path}`);
    if (value === undefined) delete target[keys.at(-1)!];
    else target[keys.at(-1)!] = value;
  }
  return copy;
}

function errorsOf(value: unknown): readonly string[] {
  try { validateStepInputs(value); }
  catch (error) { if (error instanceof StepInputsError) return error.errors; throw error; }
  return [];
}

describe('S02: step inputs', () => {
  test('the run writes every engineer invocation\'s inputs, and they parse and round-trip unchanged', () => {
    expect(fresh.start.kind).toBe('fresh');
    expect(repair.start.kind).toBe('repair-continuation');
    for (const [index, inputs] of [fresh, repair].entries()) {
      expect(inputs.schema).toBe(stepInputsSchemaId);
      expect(serializeStepInputs(inputs)).toBe(recordedBytes[index]);
      expect(parseStepInputs(serializeStepInputs(inputs))).toEqual(inputs);
    }
    // A resumed start carries the guidance its handback returned.
    const resumed = changed(repair, ['failedGate', undefined], ['guidance', 'Use readFact from subs/b/src/fact.ts.'], ['start.kind', 'resumed-after-handback']);
    expect(parseStepInputs(JSON.stringify(resumed))).toEqual(resumed);
  });

  test('path fields are relative to their named base', () => {
    expect(fresh.workingDirectory).toEqual({ project: expect.stringMatching(/^[^/]/u) });
    expect(fresh.protectedFiles.harness.every(path => !path.project.startsWith('/'))).toBe(true);
  });

  test('a function, an unknown field, an absolute or escaping path field and an incomplete start are refused', () => {
    expect(errorsOf(changed(fresh, ['known.declaredChecks.checks', [{}]]))).toEqual([]);
    const withFunction = { ...fresh, known: { ...fresh.known, declaredChecks: { ...fresh.known.declaredChecks, checks: [() => 'closure'] } } };
    expect(errorsOf(withFunction).join('\n')).toMatch(/known\.declaredChecks\.checks\.0/u);
    expect(errorsOf({ ...fresh, callback: () => undefined }).join('\n')).toMatch(/callback|Unrecognized/u);
    expect(errorsOf(changed(fresh, ['sessionId', 'in-memory-7'])).join('\n')).toMatch(/sessionId|Unrecognized/u);
    for (const path of ['/etc/passwd', '../outside', 'subs/../../outside', 'subs/./x', 'C:/x', 'a\\b']) {
      expect(errorsOf(changed(fresh, ['workingDirectory', { project: path }])).join('\n'), path).toMatch(/workingDirectory\.project/u);
    }
    expect(errorsOf(changed(fresh, ['workingDirectory', '/absolute/without/base'])).join('\n')).toMatch(/workingDirectory/u);
    expect(errorsOf(changed(fresh, ['provenance', { run: { ...fresh.run }, invocation: 'inv-0001', record: { run: '/abs/inputs.json' }, originalStart: 'fresh' }])).join('\n'))
      .toMatch(/provenance\.record\.run/u);
    expect(errorsOf(changed(repair, ['failedGate', undefined])).join('\n')).toMatch(/failedGate/u);
    expect(errorsOf(changed(repair, ['start.point', 'not a point'])).join('\n')).toMatch(/start\.point/u);
    expect(errorsOf(changed(fresh, ['role', 'global-fork']))).toEqual([expect.stringMatching(/no step inputs are defined for "global-fork"/u)]);
    // A role this harness constructs is judged by its own variants.
    expect(errorsOf(changed(fresh, ['role', 'reviewer']))).toEqual([expect.stringMatching(/question: expected one of "code"/u)]);
    expect(errorsOf(changed(fresh, ['schema', 'ramify-agent.step-inputs/0']))).toEqual([expect.stringMatching(/^schema/u)]);
    expect(() => parseStepInputs('{')).toThrow(StepInputsError);
  });

  test('captured prose may name absolute paths', () => {
    const prose = changed(repair, ['failedGate.summary', ['/home/someone/project/subs/notes/src/notes.ts:13 not-visible']],
      ['handoff', { done: ['Edited /tmp/elsewhere/notes.ts'], unfinished: [], returns: 0 }], ['assignmentPackage', 'Read /usr/share/doc first.']);
    expect(errorsOf(prose)).toEqual([]);
  });
});
