import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { runGate } from '../checks/gate.js';
import { checkCommand, type GateAttempt } from '../checks/records.js';
import { readTscOutput } from '../checks/type-check-output.js';
import type { PlannedCheck } from '../checks/verify.js';
import { prepareCheckpoint } from '../run/gates.js';
import { parseProjectConfig } from '../run/project-config.js';
import { gateOperationSchema } from '../run/records.js';
import { testPolicy } from './helpers/runs.js';
import { createMappedCheckExecution, type DirectCheckStep } from './helpers/direct-check-execution.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';

/*
 * A failed type check whose output format the project declared is
 * attributed by where its errors lie, as a failed Ramify check is by its
 * findings: an error in a file the engineer may write is the engineer's to
 * repair. Output the reader cannot read in full, or a format the project
 * did not declare, keeps the attribution by which commands failed.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  try { expectNoProcesses(); } finally { forgetExternalTools(); }
});

const scope = 'subs/cli/src';
const own = 'subs/cli/src/tests/explained-diagnostics.test.ts';

/** The type check of gate ga-0003 in the toolkit run, as npm and tsc printed it. */
const run4 = [
  '',
  '> ramify.ts@0.0.0 type-check',
  '> tsc --noEmit && tsc -p tsconfig.portable.json && tsc -p tsconfig.scripts.json && tsc -p scripts/reference-harness/tsconfig.json',
  '',
  `${own}(56,52): error TS2352: Conversion of type '{ stdout: (value: string) => number; }' to type 'CliEnvironment' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.`,
  "  Type '{ stdout: (value: string) => number; }' is missing the following properties from type 'CliEnvironment': cwd, version, stderr, batch, connect",
  '',
].join('\n');

/** The pretty form, coloured, with its code excerpt and summary. */
const pretty = [
  `\u001b[96m${own}\u001b[0m:\u001b[93m56\u001b[0m:\u001b[93m52\u001b[0m - \u001b[91merror\u001b[0m\u001b[90m TS2352: \u001b[0mConversion of type may be a mistake.`,
  '',
  '\u001b[7m56\u001b[0m     const environment = { stdout: () => 0 } as CliEnvironment;',
  '\u001b[7m  \u001b[0m \u001b[91m                                                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\u001b[0m',
  '',
  '',
  `Found 1 error in ${own}\u001b[90m:56\u001b[0m`,
  '',
  'npm error Lifecycle script `type-check` failed with error:',
  'npm error code 2',
  'npm ERR! path /tmp/project',
].join('\n');

describe('reading what tsc printed', () => {
  test('the plain form, inside npm\'s banner, names each error\'s file and line', () => {
    expect(readTscOutput(run4)).toEqual([{ file: own, line: 56, code: 'TS2352' }]);
  });

  test('the pretty form is read after its colours are stripped, passing over its excerpt, summary and npm\'s errors', () => {
    expect(readTscOutput(pretty)).toEqual([{ file: own, line: 56, code: 'TS2352' }]);
  });

  test('an error of the configuration names no file', () => {
    expect(readTscOutput('error TS5023: Unknown compiler option \'strictest\'.\n')).toEqual([{ file: null, line: null, code: 'TS5023' }]);
  });

  test('a line the reader does not know makes the whole output unreadable', () => {
    expect(readTscOutput(`${run4}Something else went wrong\n`)).toBeNull();
    // An excerpt line is only passed over after a pretty error.
    expect(readTscOutput(`56 const x = 1;\n${run4}`)).toBeNull();
  });
});

describe('the declaration in ramify-agent.json', () => {
  const acceptance = { support: [], modes: { quick: { command: ['q'] }, full: { command: ['f'] } } };

  test('is optional, and declares tsc', () => {
    const declared = parseProjectConfig(JSON.stringify({ schema: 'ramify-agent.project/1', typeCheck: { output: 'tsc' }, acceptance }));
    expect('config' in declared && declared.config.typeCheck).toEqual({ output: 'tsc' });
    const absent = parseProjectConfig(JSON.stringify({ schema: 'ramify-agent.project/1', acceptance }));
    expect('config' in absent && absent.config.typeCheck).toBeUndefined();
  });

  test('refuses a format the gate cannot read', () => {
    const refused = parseProjectConfig(JSON.stringify({ schema: 'ramify-agent.project/1', typeCheck: { output: 'eslint' }, acceptance }));
    expect('invalid' in refused && refused.invalid).toContain('typeCheck.output');
  });
});

describe('a checkpoint of a run whose project declared the format', () => {
  test('marks its type check with it, and the gate operation that recovery reads keeps it', async () => {
    const root = await project();
    const prepared = await prepareCheckpoint({
      id: 'ga-0002', runId: 'run', checkpoint: 'final', projectRoot: root,
      directory: join(root, 'gate'), head: 'head', policy: testPolicy(root), typeCheckOutput: 'tsc',
    });
    if ('schema' in prepared) throw new Error(`The checkpoint was not verified: ${prepared.verdict}`);

    const checks = prepared.request.checks;
    expect(checks.filter(check => check.output !== undefined).map(check => [check.kind, check.output])).toEqual([['type-check', 'tsc']]);
    const planned = gateOperationSchema.shape.request.shape.checks.parse(checks);
    expect(planned.find(check => check.kind === 'type-check')?.output).toBe('tsc');
  });
});

const responses = new Map<string, DirectCheckStep>();
/** A declared command response, without an executable stub. */
function prints(text: string, code: number, cwd: string, truncated = false) {
  const id = String(responses.size);
  responses.set(id, { stdout: text, outcome: { kind: 'completed', exitCode: code }, truncated });
  return checkCommand({ argv: [process.execPath, '-e', id], cwd, timeoutMs: 30_000 });
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-agent-type-check-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

/** An iteration gate over `root`: the scoped tests pass, the type check prints `printed`, the rest pass. */
async function iterationGate(root: string, typeCheck: Omit<PlannedCheck, 'kind' | 'attribution'>, writeScope: readonly string[] | null = [scope], ramify = '{}'): Promise<GateAttempt> {
  const checks: PlannedCheck[] = [
    { kind: 'tests', command: prints('ok\n', 0, root), attribution: 'in-scope' },
    { kind: 'type-check', attribution: 'project', ...typeCheck },
    { kind: 'ramify-check', command: prints(ramify, ramify === '{}' ? 0 : 1, root), attribution: 'project' },
  ];
  return runGate(createMappedCheckExecution({ script: ({ check }) => responses.get(check.command.argv[2]!)! }), 'iteration', {
    id: 'ga-0003',
    projectRoot: root,
    directory: join(root, 'gate'),
    head: 'HEAD',
    checks,
    limits: { repairRounds: 3, infrastructureRetries: 1 },
    ...(writeScope === null ? {} : { writeScope }),
  });
}

describe('a failed type check at a gate', () => {
  test('every error in the engineer\'s own write scope is in scope, and the engineer repairs it', async () => {
    const root = await project();
    const gate = await iterationGate(root, { command: prints(run4, 1, root), output: 'tsc' });

    expect(gate.verdict).toBe('failed');
    expect(gate.cause).toBe('in-scope');
    expect(gate.attribution).toEqual({ basis: 'type-check-errors', inScope: [`${own}:56`], outside: [] });
    expect(gate.next).toBe('repair');
  });

  test('an error outside the write scope is outside-assignment', async () => {
    const root = await project();
    const printed = `${run4}subs/core/src/model.ts(3,1): error TS2304: Cannot find name 'x'.\n`;
    const gate = await iterationGate(root, { command: prints(printed, 1, root), output: 'tsc' });

    expect(gate.cause).toBe('outside-assignment');
    expect(gate.attribution).toEqual({ basis: 'type-check-errors', inScope: [`${own}:56`], outside: ['subs/core/src/model.ts:3'] });
    expect(gate.next).toBe('return-to-local-architect');
  });

  test('an error without a file lies outside every write scope', async () => {
    const root = await project();
    const gate = await iterationGate(root, { command: prints('error TS5023: Unknown compiler option.\n', 1, root), output: 'tsc' });

    expect(gate.cause).toBe('outside-assignment');
    expect(gate.attribution?.outside).toEqual(['the project']);
  });

  test('paths printed relative to the command\'s working directory are read relative to the project', async () => {
    const root = await project();
    await mkdir(join(root, 'subs', 'cli'), { recursive: true });
    const printed = 'src/tests/explained-diagnostics.test.ts(56,52): error TS2352: Conversion.\n../../../outside.ts(1,1): error TS1005: \';\' expected.\n';
    const gate = await iterationGate(root, { command: prints(printed, 1, join(root, 'subs', 'cli')), output: 'tsc' });

    expect(gate.attribution).toEqual({ basis: 'type-check-errors', inScope: [`${own}:56`], outside: ['../outside.ts:1'] });
    expect(gate.cause).toBe('outside-assignment');
  });

  test.each([
    ['no format is declared', { output: undefined, text: run4, truncated: false }],
    ['the output was truncated', { output: 'tsc' as const, text: run4, truncated: true }],
    ['a line cannot be read', { output: 'tsc' as const, text: `${run4}Killed\n`, truncated: false }],
    ['it failed without naming an error', { output: 'tsc' as const, text: '> ramify.ts@0.0.0 type-check\n> tsc --noEmit\n\nnpm error code 1\n', truncated: false }],
  ])('where %s, the failure stays outside the assignment, as before', async (_name, { output, text, truncated }) => {
    const root = await project();
    const gate = await iterationGate(root, { command: prints(text, 1, root, truncated), ...(output === undefined ? {} : { output }) });

    expect(gate.cause).toBe('outside-assignment');
    expect(gate.attribution).toBeUndefined();
  });

  test('without a write scope nothing is attributed', async () => {
    const root = await project();
    const gate = await iterationGate(root, { command: prints(run4, 1, root), output: 'tsc' }, null);

    expect(gate.attribution).toBeUndefined();
    expect(gate.cause).toBe('outside-assignment');
  });

  test('beside a failed Ramify check, both attribute the cause, and the local architect answers the module violation', async () => {
    const root = await project();
    const finding = {
      id: 'f', category: 'import', code: 'not-visible', message: 'm',
      location: { file: `${scope}/commands.ts`, start: 1, end: 2, line: 7, column: 1 },
      importer: { owner: 'cli', kind: 'ordinary' },
      original: { kind: 'code', owner: 'core', file: 'model.ts', binding: 'Model' },
    };
    const report = JSON.stringify({ schemaVersion: 'ramify.check/1', outcome: 'findings', findings: [finding] });
    const gate = await iterationGate(root, { command: prints(run4, 1, root), output: 'tsc' }, [scope], report);

    expect(gate.attribution).toEqual({
      basis: 'ramify-findings-and-type-check-errors',
      inScope: [`${scope}/commands.ts:7`, `${own}:56`],
      outside: [],
    });
    expect(gate.cause).toBe('in-scope');
    expect(gate.next).toBe('return-to-local-architect');
  });
});
