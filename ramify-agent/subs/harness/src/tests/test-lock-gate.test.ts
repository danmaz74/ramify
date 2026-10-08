import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { testLockedRunner } from '../../subs/audit/src/test-lock.js';
import type { CommandRunner } from '../../subs/evidence/src/run-command.js';
import type { ConfiguredAuditResult } from '../../subs/audit/src/check-execution.js';
import { createInPlaceCheckExecution } from '../checks/execution.js';
import { executeConfiguredGate, prepareGate, runGate, type ConfiguredGateAudit } from '../checks/gate.js';
import { checkCommand } from '../checks/records.js';
import { createShellTool } from '../tools/shell.js';

const cleanups: string[] = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-lock-'));
  cleanups.push(root);
  const lock = { held: false, lockPath: join(root, 'private.lock'), findFlock: async () => '/usr/bin/flock', waitTimeoutMs: 5000 };
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  let acquired!: () => void;
  const acquisition = new Promise<void>(resolve => { acquired = resolve; });
  const runner: CommandRunner = async () => {
    acquired();
    await hold;
    return { outcome: { kind: 'completed', exitCode: 0 }, startedAt: new Date().toISOString(), elapsedMs: 0,
      output: { path: null, bytes: 0, truncated: false, tail: '' }, stdout: '', stderr: '' };
  };
  const holder = testLockedRunner(runner, { repositoryPath: root, command: 'holder' }, {}, lock)({
    argv: ['true'], cwd: root, env: {}, timeoutMs: 5000,
  });
  await acquisition;
  return { root, lock, holder, release };
}

/** A committing gate over `root` that asks `audit` about `candidate`. */
async function configuredGate(root: string, audit: ConfiguredGateAudit, options: { readonly signal?: AbortSignal; readonly waiting?: string[] } = {}) {
  const prepared = await prepareGate('iteration', {
    id: 'ga-0001', runId: 'run-lock', projectRoot: root, directory: join(root, 'gate'), head: 'HEAD', checks: [],
    audit: { mode: 'project-default', timeoutMs: 5_000 },
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.waiting === undefined ? {} : { waiting: async (_command: unknown, line: string) => { options.waiting!.push(line); } }),
  });
  if ('schema' in prepared) throw new Error('The configured gate was not prepared');
  return executeConfiguredGate(audit, prepared, 'candidate', 'candidate');
}

function answered(status: ConfiguredAuditResult['status'], verdict: ConfiguredAuditResult['verdict']): ConfiguredAuditResult {
  return {
    status, requestId: 'run-lock:ga-0001', mode: 'project-default', requestedSourceCommit: 'candidate',
    auditedSourceCommit: status === 'completed' ? 'candidate' : null, reused: false, reuse: null,
    requestedMode: status === 'completed' ? 'ramify-partial' : null, executedMode: status === 'completed' ? 'ramify-partial' : null,
    fallbackReason: null, verdict, reportCommit: status === 'completed' ? 'report' : null,
    runRef: status === 'completed' ? 'refs/run' : null, treeRef: status === 'completed' ? 'refs/tree' : null,
    definition: { path: 'ramify-audit.json', blob: 'blob' }, detail: status,
    provider: status === 'cancelled' ? { status: 'cancelled', reason: 'signal' } : { status: 'completed' }, checks: {},
  };
}

describe('the machine test lock at a gate', () => {
  test('an in-place type check runs while a suite holds the lock, without waiting for it', async () => {
    const f = await fixture();
    const command = checkCommand({ argv: [process.execPath, '-e', 'process.stdout.write("typed")'], cwd: f.root, timeoutMs: 5000 });
    const nonSuite = await runGate(createInPlaceCheckExecution(), 'readiness', {
      id: 'type-now', projectRoot: f.root, directory: join(f.root, 'type'), head: 'HEAD',
      checks: [{ kind: 'type-check', command }],
    });
    expect(nonSuite.verdict).toBe('passed');
    expect(nonSuite.commands[0]!.lockWaitMs).toBeUndefined();
    expect(await readFile(nonSuite.commands[0]!.output.path, 'utf8')).toBe('typed');
    f.release();
    await f.holder;
  });

  test('a focused shell run finishes while a suite holds the private lock', async () => {
    const f = await fixture();
    await writeFile(join(f.root, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));
    await mkdir(join(f.root, 'subs/shelf/src/tests'), { recursive: true });
    await writeFile(join(f.root, 'subs/shelf/src/tests/shelf.test.ts'), 'export {};\n');
    let shellCalls = 0;
    const shell = createShellTool({
      workingDirectory: f.root, judge: async () => ({ ok: true }),
      outputFile: call => join(f.root, `${call}.log`), starting: async () => {}, ended: async () => {},
      commandExecution: async input => {
        shellCalls += 1;
        return { outcome: { kind: 'completed', exitCode: 0 }, startedAt: new Date().toISOString(), elapsedMs: 1,
          output: { path: input.outputFile ?? null, bytes: 0, truncated: false, tail: '' }, stdout: '', stderr: '' };
      },
    });
    const shellResult = await shell.definition.execute({ command: 'npm test -- subs/shelf/src/tests/shelf.test.ts' }, new AbortController().signal);
    expect(shellResult.isError).toBe(false);
    expect(shellCalls).toBe(1);
    f.release();
    await f.holder;
  });

  test('a configured check waiting for the lock is reported with the provider line, and the gate passes once it ran', async () => {
    const f = await fixture();
    const waiting: string[] = [];
    let acquiredAt = 0;
    const gate = await configuredGate(f.root, async request => {
      await request.waiting?.({ kind: 'configured', name: 'agent-tests', position: 1, total: 1 }, 'Waiting for another test run (holder)');
      f.release();
      await f.holder;
      acquiredAt = Date.now();
      request.lockAcquired?.();
      await request.started?.({ kind: 'configured', name: 'agent-tests', position: 1, total: 1 });
      return answered('completed', 'pass');
    }, { waiting });
    expect(acquiredAt).toBeGreaterThan(0);
    expect(waiting).toEqual(['Waiting for another test run (holder)']);
    expect([gate.verdict, gate.cause, gate.audited]).toEqual(['passed', null, 'candidate']);
    expect(gate.commands).toEqual([]);
  });

  test('cancelling a gate whose configured check waits for the lock is not verified, never a pass', async () => {
    const f = await fixture();
    const controller = new AbortController();
    const pending = configuredGate(f.root, async request => {
      await request.waiting?.({ kind: 'configured', name: 'agent-tests', position: 1, total: 1 }, 'Waiting for another test run (holder)');
      await new Promise<void>(resolve => { request.signal.addEventListener('abort', () => resolve(), { once: true }); });
      return answered('cancelled', null);
    }, { signal: controller.signal });
    await new Promise(resolve => setTimeout(resolve, 60));
    controller.abort();
    const gate = await pending;
    expect([gate.verdict, gate.cause, gate.audited, gate.evidence]).toEqual(['not-verified', 'infrastructure', null, null]);
    expect(gate.audit).toMatchObject({ status: 'cancelled', verdict: null });
    f.release();
    await f.holder;
  });
});
