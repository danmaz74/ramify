import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { performRecovery } from '../run/readiness.js';
import { commandResult } from './helpers/command-result.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { testPolicy } from './helpers/runs.js';
import type { RunRecord } from '../run/records.js';

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

    const policy = testPolicy(root);
    const auditConfiguration: RunRecord['auditConfiguration'] = { config: {
      sourceCommit: 'head', path: 'ramify-audit.json', blob: 'blob', projectRoot: '.', checks: [],
      ignorePaths: [], undetectedConfigFilesForcingFullAudit: [], workspace: {
        preparationId: 'nodejs', packageDirectoriesDeclared: true, linkNodeModules: true,
        packageDirectories: [directory], setupCommands: [],
      },
    } };
    const calls: string[] = [];
    const recovery = await performRecovery({
      id: 'rec-0001',
      attempt: 1,
      plan: { cause: 'infrastructure', action: 'reinstall-nested', directories: [directory] },
      projectRoot: root,
      policy,
      auditConfiguration,
      ramify: new FakeRamifyCli(),
      commandExecution: async request => {
        expect(request.argv).toEqual(['npm', 'ci']);
        expect(request.cwd).toBe(join(root, directory));
        calls.push(request.argv.join(' '));
        await mkdir(join(root, directory, 'node_modules'), { recursive: true });
        return commandResult(request, { outcome: { kind: 'completed', exitCode: 0 } });
      },
      count: 1,
      directory: join(root, 'recoveries'),
    });

    expect(calls).toEqual(['npm ci']);
    expect(recovery).toMatchObject({
      id: 'rec-0001',
      action: 'reinstall-nested',
      cause: 'infrastructure',
      outcome: 'recovered',
      attempt: 1,
    });
  });

  test('a symlinked declared package outside the root is refused before the install process', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-agent-recovery-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'ramify-agent-recovery-outside-'));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    cleanups.push(() => rm(outside, { recursive: true, force: true }));
    await symlink(outside, join(root, 'nested'));
    const auditConfiguration: RunRecord['auditConfiguration'] = { config: {
      sourceCommit: 'head', path: 'ramify-audit.json', blob: 'blob', projectRoot: '.', checks: [],
      ignorePaths: [], undetectedConfigFilesForcingFullAudit: [], workspace: {
        preparationId: 'nodejs', packageDirectoriesDeclared: true, linkNodeModules: true,
        packageDirectories: ['nested'], setupCommands: [],
      },
    } };
    const result = await performRecovery({ id: 'rec-0001', attempt: 1,
      plan: { cause: 'infrastructure', action: 'reinstall-nested', directories: ['nested'] },
      projectRoot: root, policy: testPolicy(root), auditConfiguration, ramify: new FakeRamifyCli(),
      commandExecution: async () => { throw new Error('install must not run'); }, count: 1, directory: join(root, 'recoveries') });
    expect(result.outcome).toBe('failed');
    expect(result.evidence[0]).toContain('resolves outside');
  });
});
