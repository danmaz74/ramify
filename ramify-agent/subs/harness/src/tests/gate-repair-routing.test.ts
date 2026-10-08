import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { runGate } from '../checks/gate.js';
import { checkCommand, type GateAttempt } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import { createMappedCheckExecution, type DirectCheckStep } from './helpers/direct-check-execution.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';

/* Failed check locations are evidence. The engineer diagnoses ownership during repair. */

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

/** An in-place iteration diagnosis over `root`: the type check prints `printed`, the Ramify check prints `ramify`. */
async function iterationGate(root: string, typeCheck: Omit<PlannedCheck, 'kind'>, writeScope: readonly string[] | null = [scope], ramify = '{}'): Promise<GateAttempt> {
  const checks: PlannedCheck[] = [
    { kind: 'type-check', ...typeCheck },
    { kind: 'ramify-check', command: prints(ramify, ramify === '{}' ? 0 : 1, root) },
  ];
  return runGate(createMappedCheckExecution({ script: ({ checkIndex }) => responses.get(checks[checkIndex]!.command.argv[2]!)! }), 'iteration', {
    id: 'ga-0003',
    projectRoot: root,
    directory: join(root, 'gate'),
    head: 'HEAD',
    checks,
    limits: { repairRounds: 3, infrastructureRetries: 1 },
    ...(writeScope === null ? {} : { writeScope }),
  });
}

describe('a failed type check at an iteration gate', () => {
  test('every diagnostic stays with the engineer regardless of the file named by tsc', async () => {
    const root = await project();
    const printed = `${run4}subs/core/src/model.ts(3,1): error TS2304: Cannot find name 'x'.\n`;
    const gate = await iterationGate(root, { command: prints(printed, 1, root), output: 'tsc' });

    expect(gate.verdict).toBe('failed');
    expect(gate.cause).toBe('check-failed');
    expect(gate.attribution).toBeUndefined();
    expect(gate.next).toBe('repair');
    expect(gate.commands[0]!.output.path).toBeTruthy();
  });

  test('an unlocated configuration error and a truncated output still reach the engineer', async () => {
    const root = await project();
    const gate = await iterationGate(root, {
      command: prints('error TS5023: Unknown compiler option.\n', 1, root, true), output: 'tsc',
    }, null);
    expect([gate.verdict, gate.cause, gate.next]).toEqual(['failed', 'check-failed', 'repair']);
    expect(gate.attribution).toBeUndefined();
  });

  test('a simultaneous Ramify violation does not automatically summon an architect', async () => {
    const root = await project();
    const finding = {
      id: 'f', category: 'import', code: 'not-visible', message: 'm',
      location: { file: `${scope}/commands.ts`, start: 1, end: 2, line: 7, column: 1 },
      importer: { owner: 'cli', kind: 'ordinary' },
      original: { kind: 'code', owner: 'core', file: 'model.ts', binding: 'Model' },
    };
    const report = JSON.stringify({ schemaVersion: 'ramify.check/1', outcome: 'findings', findings: [finding] });
    const gate = await iterationGate(root, { command: prints(run4, 1, root), output: 'tsc' }, [scope], report);
    expect(gate.commands.filter(command => command.outcome === 'failed').map(command => command.kind)).toEqual(['type-check', 'ramify-check']);
    expect([gate.cause, gate.next]).toEqual(['check-failed', 'repair']);
  });
});
