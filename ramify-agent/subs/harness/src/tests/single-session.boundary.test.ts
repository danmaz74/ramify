import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import type { CommandRunner } from '../../subs/evidence/src/run-command.js';
import { gateAttemptSchema } from '../run/records.js';
import { completionProposed, shell } from './helpers/iterations.js';
import { commandResult } from './helpers/command-result.js';
import { notesSource, project, session, checked, passingGate, finished } from './single-session-fixture.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

describe('the actual session shell write boundary', () => {
  test('PB3-S04: actual shell tool writes pass only permitted candidates; protected creation fails the checkpoint', async () => {
    // This one witness explicitly starts a bounded shell. Provider ownership and
    // automated check answers remain labeled scripted lifecycle controls.
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
    const argv: string[][] = [];
    const commandExecution: CommandRunner = async request => {
      argv.push([...request.argv]);
      const output = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => actual.execFile(request.argv[0]!, request.argv.slice(1),
        { cwd: request.cwd, timeout: Math.min(request.timeoutMs, 5000) }, (error, stdout, stderr) => error ? reject(error) : resolve({ stdout, stderr })));
      return commandResult(request, output);
    };
    const allowedRoot = await project();
    const allowed = await session(allowedRoot, [shell("printf '%s' 'export const noteLimit = 500;' > notes.ts"),
      { kind: 'submit', input: completionProposed('Actual shell updated ordinary owned source') }], { gate: true },
      { changed: [notesSource], commandExecution, command: "printf '%s' 'export const noteLimit = 500;' > notes.ts", ramify: [checked('changed'), checked('complete')], gate: passingGate });
    expect(await readFile(join(allowedRoot, notesSource), 'utf8')).toContain('noteLimit = 500');
    expect(finished(allowed.result).gate).toMatchObject({ verdict: 'passed' });
    expect(allowed.git.commitAccepted).not.toHaveBeenCalled();
    const deniedRoot = await project();
    await mkdir(join(deniedRoot, 'src'), { recursive: true });
    await writeFile(join(deniedRoot, 'src/root.ts'), 'export const root = true;');
    const state = 'plans/plan/.harness/jobs/run/unsafe.json';
    const denied = await session(deniedRoot, [shell(`mkdir -p '${deniedRoot}/plans/plan/.harness/jobs/run' && printf '%s' '{"createdByShell":true}' > '${deniedRoot}/ramify-audit.json' && printf '%s' '{"createdByShell":true}' > '${deniedRoot}/${state}'`),
      { kind: 'submit', input: completionProposed('Actual shell created protected audit configuration and durable job state') }], { gate: true, module: 'collection-review' },
      { changed: ['ramify-audit.json', state], commandExecution, command: `mkdir -p '${deniedRoot}/plans/plan/.harness/jobs/run' && printf '%s' '{"createdByShell":true}' > '${deniedRoot}/ramify-audit.json' && printf '%s' '{"createdByShell":true}' > '${deniedRoot}/${state}'`, ramify: [checked('changed'), { form: 'complete', outcome: 'not-checked' }], gate: [] });
    expect(await readFile(join(deniedRoot, 'ramify-audit.json'), 'utf8')).toContain('createdByShell');
    expect(finished(denied.result).gate).toMatchObject({ verdict: 'failed' });
    const attempt = gateAttemptSchema.parse(JSON.parse(await readFile(join(finished(denied.result).records, 'gate/attempt.json'), 'utf8')));
    expect(attempt.rules?.find(rule => rule.rule === 'write-scope')).toMatchObject({ outcome: 'failed', violations: [{ rule: 'write-scope', path: state, detail: expect.any(String) }, { rule: 'write-scope', path: 'ramify-audit.json', detail: expect.any(String) }] });
    expect(await readFile(join(deniedRoot, state), 'utf8')).toContain('createdByShell');
    expect(attempt.commit).toBeNull();
    expect(denied.git.commitAccepted).not.toHaveBeenCalled();
    expect(argv).toHaveLength(2);
  });
});
