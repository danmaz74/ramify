import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ObservationLog } from '../run/observations.js';
import { ToolInputJudge } from '../run/submissions.js';
import { validateAgainst } from '../run/submissions.js';
import {
  createShellTool, shellDefaultTimeoutMs, shellInputSchema, shellJsonSchema, shellMaxTimeoutMs, shellToolName,
  type ShellCall, type ShellResult,
} from '../tools/shell.js';

import { strictMarkerCommand } from './helpers/settlement-boundaries.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * The shell an engineer receives.
 *
 * It is a harness tool run through the lifted executor, never the
 * implementation's own: its own process group, a clean environment, a
 * timeout it can be given, and a bounded tail beside a file with everything.
 *
 * What it writes passes no guard. That is a stated limit of the MVP, and
 * these tests show what the harness does instead: it records the command, it
 * settles what the command left running, and it never claims the write was
 * prevented.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const failures: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) { try { await cleanup(); } catch (error) { failures.push(error); } }
  try { expectNoProcesses(); } catch (error) { failures.push(error); } finally { forgetExternalTools(); }
  if (failures.length) throw new AggregateError(failures, 'fixture cleanup failed');
});

async function workspace() {
  const path = await mkdtemp(join(tmpdir(), 'ramify-agent-shell-'));
  cleanups.push(() => rm(path, { recursive: true, force: true }));
  return path;
}

interface Recorded {
  readonly starts: ShellCall[];
  readonly ends: Array<{ call: ShellCall; result: ShellResult }>;
}

async function shellIn(directory: string, options: { readonly bound?: number; readonly marker?: string } = {}) {
  const log = await ObservationLog.open(join(directory, '.observations.jsonl'));
  const judge = new ToolInputJudge({
    tool: shellToolName,
    bound: options.bound ?? 3,
    validate: input => validateAgainst(shellInputSchema, input),
    observations: log,
  });
  const recorded: Recorded = { starts: [], ends: [] };
  let call = 0;
  const command = strictMarkerCommand(directory, options.marker);
  cleanups.push(async () => command.assertComplete());
  const tool = createShellTool({
    commandExecution: command.run,
    workingDirectory: directory,
    judge: input => judge.judge(input, `call-${++call}`),
    outputFile: call => join(directory, 'output', `${call}.log`),
    starting: async call => {
      recorded.starts.push(call);
    },
    ended: async (call, result) => {
      recorded.ends.push({ call, result });
    },
  });
  return { tool, recorded, log, judge };
}

describe('the shell tool', () => {
  test('refuses a whole suite before counting or spawning any chained command', async () => {
    const directory = await workspace();
    await writeFile(join(directory, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));
    let spawned = false;
    const refusals: string[] = [];
    const tool = createShellTool({
      workingDirectory: directory,
      judge: async () => ({ ok: true }),
      outputFile: call => join(directory, `${call}.log`),
      starting: async () => {}, ended: async () => {},
      refused: async text => { refusals.push(text); },
      commandExecution: async () => { spawned = true; throw new Error('must not spawn'); },
    });
    const result = await tool.definition.execute({ command: 'touch before && npm test' }, new AbortController().signal);
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Refused, nothing ran: `npm test`');
    expect(result.text).toContain('runs through ramify-audit at the gates');
    expect(result.text).toContain("use the project's declared runner");
    expect(result.text).not.toContain('run_scope_tests');
    expect(refusals).toHaveLength(1);
    expect(tool.calls).toBe(0);
    expect(spawned).toBe(false);
    await expect(stat(join(directory, 'before'))).rejects.toThrow();
  });

  test('a schema violation returns its errors and runs nothing', async () => {
    const directory = await workspace();
    const marker = join(directory, 'written.txt');
    const { tool, recorded, log } = await shellIn(directory, { marker });

    const unknownField = await tool.definition.execute(
      { command: `touch ${marker}`, shell: 'bash' },
      new AbortController().signal,
    );
    const missing = await tool.definition.execute({ timeoutMs: 10 }, new AbortController().signal);
    const tooLong = await tool.definition.execute(
      { command: 'true', timeoutMs: shellMaxTimeoutMs + 1 },
      new AbortController().signal,
    );

    for (const answer of [unknownField, missing, tooLong]) expect(answer.isError).toBe(true);
    expect(unknownField.text).toContain('shell');
    expect(missing.text).toContain('command');
    expect(tooLong.text).toContain('timeoutMs');
    // Nothing ran: no call was started, and the file the command named is absent.
    expect(recorded.starts).toEqual([]);
    expect(tool.calls).toBe(0);
    await expect(stat(marker)).rejects.toThrow();
    // Each rejection is an observation with the path of every error.
    const rejections = log.observations.filter(line => line.type === 'rejection');
    expect(rejections).toHaveLength(3);
    expect(rejections.every(line => line.type === 'rejection' && line.data.errors.every(error => error.path !== undefined))).toBe(true);

    // A corrected input is accepted, and the bound ends the invocation.
    const corrected = await tool.definition.execute({ command: `touch ${marker}` }, new AbortController().signal);
    expect(corrected.isError).toBe(false);
    expect((await stat(marker)).isFile()).toBe(true);
  });

  test('the schema the agent is shown is the one that validates', () => {
    expect(Object.keys((shellJsonSchema as { properties: Record<string, unknown> }).properties).sort()).toEqual(['command', 'timeoutMs']);
    expect((shellJsonSchema as { required?: string[] }).required).toEqual(['command']);
    expect((shellJsonSchema as { additionalProperties?: unknown }).additionalProperties).toBe(false);
  });

});
