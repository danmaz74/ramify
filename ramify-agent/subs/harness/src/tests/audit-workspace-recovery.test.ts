import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, test } from 'vitest';
import type { IntendedAuditWorkspace } from '../../subs/audit/src/check-execution.js';
import { createAuditWorkspaceOwnership } from '../run/audit-workspaces.js';
import { initRepository } from './helpers/runs.js';

const exec = promisify(execFile);
const killedAudit = fileURLToPath(new URL('./helpers/killed-audit.ts', import.meta.url));
const cleanups: string[] = [];
afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  for (const path of cleanups.splice(0)) await rm(path, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ramify-agent-workspace-owner-'));
  cleanups.push(root);
  await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule fixture\n');
  await mkdir(join(root, 'plans', 'plan', '.harness', 'jobs', '20260921T000000Z-aabbcc', 'gates', 'ga-0001'), { recursive: true });
  const commit = await initRepository(root);
  await mkdir(join(root, 'node_modules'), { recursive: true });
  const common = resolve(root, '.git');
  const repository = { repositoryRoot: root, gitCommonDirectory: common, repositoryId: 'repository-1' };
  const ownership = createAuditWorkspaceOwnership(root);
  return { root, commit, repository, ownership };
}

async function workspace(
  root: string,
  commit: string,
  overrides: Partial<IntendedAuditWorkspace> = {},
): Promise<IntendedAuditWorkspace> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'ramify-audit-worktree-'));
  cleanups.push(temporaryDirectory);
  return {
    repositoryRoot: root,
    gitCommonDirectory: resolve(root, '.git'),
    repositoryId: 'repository-1',
    temporaryDirectory,
    worktreePath: join(temporaryDirectory, 'source'),
    sourceCommit: commit,
    runId: '20260921T000000Z-aabbcc',
    attemptId: 'ga-0001',
    process: { id: 999_999_999, startMarker: 'dead' },
    ...overrides,
  };
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

async function marker(pid: number): Promise<string> {
  const [raw, boot] = await Promise.all([
    readFile(`/proc/${pid}/stat`, 'utf8'),
    readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
  ]);
  const ticks = raw.slice(raw.lastIndexOf(')') + 2).trim().split(/\s+/u)[19]!;
  return `linux:${boot.trim()}:${ticks}`;
}

function auditProcess(mode: 'after-creation' | 'during-execution' | 'pass', root: string, commit: string, signal: string): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, ['--import', 'tsx', killedAudit, mode, root, commit, signal], {
    cwd: process.cwd(),
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

async function waitUntil(predicate: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for killed audit fixture');
}

async function kill(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
}

async function output(child: ChildProcessWithoutNullStreams): Promise<string> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout.on('data', chunk => stdout.push(String(chunk)));
  child.stderr.on('data', chunk => stderr.push(String(chunk)));
  const [code] = await once(child, 'exit') as [number | null];
  if (code !== 0) throw new Error(`Audit fixture exited ${String(code)}: ${stderr.join('')}`);
  return stdout.join('');
}

describe('durable audit workspace ownership', () => {
  test('removes only an inactive owned worktree and is idempotent after cleanup', async () => {
    const f = await fixture();
    const owned = await workspace(f.root, f.commit);
    const unrelatedRoot = await mkdtemp(join(tmpdir(), 'ramify-unrelated-worktree-'));
    cleanups.push(unrelatedRoot);
    const unrelated = join(unrelatedRoot, 'source');
    await exec('git', ['worktree', 'add', '--detach', unrelated, f.commit], { cwd: f.root });
    await exec('git', ['worktree', 'add', '--detach', owned.worktreePath, f.commit], { cwd: f.root });
    await f.ownership.recordIntendedWorkspace(owned);

    await f.ownership.recoverAbandonedWorkspaces(f.repository);
    await f.ownership.recoverAbandonedWorkspaces(f.repository);

    expect(await exists(owned.temporaryDirectory)).toBe(false);
    expect(await exists(unrelated)).toBe(true);
    const list = (await exec('git', ['worktree', 'list', '--porcelain'], { cwd: f.root })).stdout;
    expect(list).not.toContain(owned.worktreePath);
    expect(list).toContain(unrelated);
    const record = JSON.parse(await readFile(join(f.root, 'plans/plan/.harness/jobs/20260921T000000Z-aabbcc/gates/ga-0001/audit-workspace.json'), 'utf8')) as { state: string };
    expect(record.state).toBe('cleaned');
  });

  test('covers missing paths, partial creation and a repeated interrupted cleanup', async () => {
    for (const kind of ['missing', 'partial', 'removed-worktree'] as const) {
      const f = await fixture();
      const owned = await workspace(f.root, f.commit);
      if (kind === 'missing') await (await import('node:fs/promises')).rm(owned.temporaryDirectory, { recursive: true, force: true });
      if (kind === 'removed-worktree') {
        await exec('git', ['worktree', 'add', '--detach', owned.worktreePath, f.commit], { cwd: f.root });
        await exec('git', ['worktree', 'remove', '--force', '--', owned.worktreePath], { cwd: f.root });
        await mkdir(owned.temporaryDirectory, { recursive: true });
      }
      await f.ownership.recordIntendedWorkspace(owned);
      await f.ownership.recoverAbandonedWorkspaces(f.repository);
      await f.ownership.recoverAbandonedWorkspaces(f.repository);
      expect(await exists(owned.temporaryDirectory), kind).toBe(false);
    }
  });

  test('preserves active audits and repository or registration mismatches', async () => {
    const f = await fixture();
    const active = await workspace(f.root, f.commit, { process: { id: process.pid, startMarker: await marker(process.pid) } });
    await exec('git', ['worktree', 'add', '--detach', active.worktreePath, f.commit], { cwd: f.root });
    await f.ownership.recordIntendedWorkspace(active);
    await f.ownership.recoverAbandonedWorkspaces(f.repository);
    expect(await exists(active.worktreePath)).toBe(true);

    await f.ownership.recoverAbandonedWorkspaces({ ...f.repository, repositoryId: 'another-repository' });
    expect(await exists(active.worktreePath)).toBe(true);
  });

  test('refuses and preserves the repository when a matching record names it as the temporary directory', async () => {
    const f = await fixture();
    const marker = join(f.root, 'module.ramify');
    const corrupted = await workspace(f.root, f.commit, {
      temporaryDirectory: f.root,
      worktreePath: join(f.root, 'source'),
    });
    await f.ownership.recordIntendedWorkspace(corrupted);

    await expect(f.ownership.recoverAbandonedWorkspaces(f.repository)).rejects.toThrow('Refusing non-audit temporary directory');

    expect(await readFile(marker, 'utf8')).toBe('ramify 1\nmodule fixture\n');
    const record = JSON.parse(await readFile(join(f.root, 'plans/plan/.harness/jobs/20260921T000000Z-aabbcc/gates/ga-0001/audit-workspace.json'), 'utf8')) as { state: string };
    expect(record.state).toBe('intended');
  });

  for (const phase of ['after-creation', 'during-execution'] as const) {
    test(`a killed audit ${phase.replace('-', ' ')} is cleaned before the same commit is re-audited`, async () => {
      const f = await fixture();
      const signal = join(await mkdtemp(join(tmpdir(), 'ramify-killed-audit-signal-')), 'running');
      cleanups.push(resolve(signal, '..'));
      const recordPath = join(f.root, 'plans/plan/.harness/jobs/20260921T000000Z-aabbcc/gates/ga-0001/audit-workspace.json');
      const unrelatedRoot = await mkdtemp(join(tmpdir(), 'ramify-unrelated-worktree-'));
      cleanups.push(unrelatedRoot);
      const unrelated = join(unrelatedRoot, 'source');
      await exec('git', ['worktree', 'add', '--detach', unrelated, f.commit], { cwd: f.root });

      const child = auditProcess(phase, f.root, f.commit, signal);
      const errors: string[] = [];
      child.stderr.on('data', chunk => errors.push(String(chunk)));
      await waitUntil(async () => {
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Audit fixture exited before kill point: ${errors.join('')}`);
        if (phase === 'during-execution' && !(await exists(signal))) return false;
        if (!(await exists(recordPath))) return false;
        const record = JSON.parse(await readFile(recordPath, 'utf8')) as { worktreePath: string };
        return exists(record.worktreePath);
      });
      const abandoned = JSON.parse(await readFile(recordPath, 'utf8')) as { worktreePath: string; sourceCommit: string };
      await kill(child);
      expect(abandoned.sourceCommit).toBe(f.commit);
      expect(await exists(abandoned.worktreePath)).toBe(true);

      const retry = auditProcess('pass', f.root, f.commit, signal);
      const attempt = JSON.parse((await output(retry)).trim()) as { audited: string | null; evidence: unknown };
      expect(attempt.audited).toBe(f.commit);
      expect(attempt.evidence).not.toBeNull();
      expect(await exists(abandoned.worktreePath)).toBe(false);
      const list = (await exec('git', ['worktree', 'list', '--porcelain'], { cwd: f.root })).stdout;
      expect(list).not.toContain(abandoned.worktreePath);
      expect(list).toContain(unrelated);
    }, 45_000);
  }
});
