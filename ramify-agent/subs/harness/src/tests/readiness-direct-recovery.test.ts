import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { performRecovery } from '../run/readiness.js';
import { commandResult } from './helpers/command-result.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { testPolicy } from './helpers/runs.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  try { expectNoProcesses(); } finally { forgetExternalTools(); }
});

describe('direct readiness recovery execution', () => {
  test('a stated nested-package install runs through the injected command boundary', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-agent-direct-recovery-'));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const directory = 'nested';
    await mkdir(join(root, directory), { recursive: true });

    const policy = testPolicy(root, { nested: [{ directory, testScript: null }] });
    const install = policy.commands.nestedPackages[0]!.install;
    const calls: string[] = [];
    const recovery = await performRecovery({
      id: 'rec-0001',
      attempt: 1,
      plan: { cause: 'infrastructure', action: 'reinstall-nested', directories: [directory] },
      projectRoot: root,
      policy,
      ramify: new FakeRamifyCli(),
      commandExecution: async request => {
        expect(request.argv).toEqual(install.argv);
        expect(request.cwd).toBe(install.cwd);
        calls.push(request.argv.join(' '));
        await mkdir(join(root, directory, 'node_modules'), { recursive: true });
        return commandResult(request, { outcome: { kind: 'completed', exitCode: 0 } });
      },
      count: 1,
      directory: join(root, 'recoveries'),
    });

    expect(calls).toEqual([install.argv.join(' ')]);
    expect(recovery).toMatchObject({
      id: 'rec-0001',
      action: 'reinstall-nested',
      cause: 'infrastructure',
      outcome: 'recovered',
      attempt: 1,
    });
  });
});
