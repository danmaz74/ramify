import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, test } from 'vitest';
import { outputTailBytes } from '../../subs/evidence/src/run-command.js';
import { ObservationLog } from '../run/observations.js';
import { ToolInputJudge } from '../run/submissions.js';
import { validateAgainst } from '../run/submissions.js';
import {
  createShellTool, shellDefaultTimeoutMs, shellInputSchema, shellJsonSchema, shellMaxTimeoutMs, shellToolName,
  type ShellCall, type ShellResult,
} from '../tools/shell.js';

const exec = promisify(execFile);

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
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
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

async function shellIn(directory: string, options: { readonly bound?: number } = {}) {
  const log = await ObservationLog.open(join(directory, '.observations.jsonl'));
  const judge = new ToolInputJudge({
    tool: shellToolName,
    bound: options.bound ?? 3,
    validate: input => validateAgainst(shellInputSchema, input),
    observations: log,
  });
  const recorded: Recorded = { starts: [], ends: [] };
  let call = 0;
  const tool = createShellTool({
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
  test('runs the command it is given and answers its exit code, its tail and its output file', async () => {
    const directory = await workspace();
    const { tool, recorded } = await shellIn(directory);

    const result = await tool.definition.execute({ command: 'echo out; echo err >&2; exit 3' }, new AbortController().signal);

    expect(tool.definition.name).toBe(shellToolName);
    expect(tool.definition.mutating).toBe(true);
    expect(result.isError).toBe(true);
    expect(result.text).toContain('$ echo out; echo err >&2; exit 3');
    expect(result.text).toContain('Exit 3.');
    expect(result.text).toContain('out\nerr\n');

    // The command text is recorded before it runs, and how it ended after.
    expect(recorded.starts).toHaveLength(1);
    expect(recorded.starts[0]?.command).toBe('echo out; echo err >&2; exit 3');
    expect(recorded.starts[0]?.timeoutMs).toBe(shellDefaultTimeoutMs);
    expect(recorded.ends[0]?.result.exitCode).toBe(3);
    expect(await readFile(recorded.starts[0]!.outputFile, 'utf8')).toBe('out\nerr\n');
  });

  test('bounds the tail it answers while the file keeps everything', async () => {
    const directory = await workspace();
    const { tool, recorded } = await shellIn(directory);

    const result = await tool.definition.execute(
      { command: `head -c ${outputTailBytes * 2} /dev/zero | tr "\\0" "b"` },
      new AbortController().signal,
    );

    expect(result.text.length).toBeLessThan(outputTailBytes + 500);
    expect((await stat(recorded.starts[0]!.outputFile)).size).toBe(outputTailBytes * 2);
  });

  test('a schema violation returns its errors and runs nothing', async () => {
    const directory = await workspace();
    const { tool, recorded, log } = await shellIn(directory);
    const marker = join(directory, 'written.txt');

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

  test('a command that outlives its timeout is a timeout, not a failure', async () => {
    const directory = await workspace();
    const { tool, recorded } = await shellIn(directory);

    const result = await tool.definition.execute({ command: 'sleep 30', timeoutMs: 400 }, new AbortController().signal);

    expect(result.isError).toBe(true);
    expect(recorded.ends[0]?.result.outcome).toEqual({ kind: 'timed-out', timeoutMs: 400 });
    expect(result.text).toContain('killed with its process group');
  });

  /**
   * The lifted executor's whole purpose, exercised through the tool an
   * engineer actually calls: a command that leaves a descendant running is
   * settled by its process group, so nothing of it survives the call.
   */
  test('a command that leaves a descendant is settled by its process group', async () => {
    const directory = await workspace();
    const { tool } = await shellIn(directory);
    const marker = join(directory, 'leaked.txt');

    const result = await tool.definition.execute(
      { command: `ps -o pgid= -p $$ | tr -d ' '; (sleep 30; echo leaked > ${marker}) &\nexit 0` },
      new AbortController().signal,
    );

    expect(result.isError).toBe(false);
    const group = result.text.split('\n').map(line => line.trim()).find(line => /^\d+$/.test(line)) ?? '';
    expect(group).toMatch(/^\d+$/);
    expect(group).not.toBe(String(process.pid));

    const { stdout } = await exec('bash', ['-c', `pgrep -g ${group} || true`], { cwd: directory });
    expect(stdout.trim()).toBe('');
    await expect(stat(marker)).rejects.toThrow();
  });

  /**
   * Settlement is what the harness does before it lets the next writer or
   * the next gate start: a command still running is ended with its group,
   * and the file it would have written never appears.
   */
  test('settlement ends a command that is still running, with its group', async () => {
    const directory = await workspace();
    const { tool, recorded } = await shellIn(directory);
    const marker = join(directory, 'late.txt');

    const running = tool.definition.execute(
      { command: `(sleep 30; echo late > ${marker}) & wait`, timeoutMs: 60_000 },
      new AbortController().signal,
    );
    await waitFor(() => recorded.starts.length === 1);

    await tool.settle();
    const result = await running;

    expect(recorded.ends[0]?.result.outcome).toEqual({ kind: 'cancelled' });
    expect(result.text).toContain('cancelled');
    await new Promise(resolve => setTimeout(resolve, 300));
    await expect(stat(marker)).rejects.toThrow();
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the command to start');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
