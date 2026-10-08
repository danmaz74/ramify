import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createConfiguredAudit } from '../../subs/audit/src/check-execution.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { captureProjectConfig } from '../run/project-config.js';
import { defaultRunPolicy } from '../run/policy.js';
import { committedAuditConfigurationSchema } from '../run/records.js';
import { runReadiness } from '../run/readiness.js';
import { copyFixture } from './helpers/fixture.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { git, initRepository, installTestRunner, until } from './helpers/runs.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) try { await cleanup(); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'native readiness teardown failed');
});
async function project(prepare?: (root: string) => Promise<void>) {
  const copy = await copyFixture(); cleanups.push(copy.remove);
  await installTestRunner(copy.root); await prepare?.(copy.root);
  const head = await initRepository(copy.root); return { root: copy.root, head };
}

describe('declared preparation and configured full readiness', () => {
  test('the installed provider runs full after local setup, then reuses full while local setup recreates deleted output', async () => {
    const deep = 'subs/a/subs/b/subs/c/subs/d/tools';
    const fixture = await project(async root => {
      await mkdir(join(root, deep, 'node_modules'), { recursive: true });
      await writeFile(join(root, deep, 'package.json'), '{"name":"deep-setup-only","private":true}');
      await mkdir(join(root, 'subs/unrelated'), { recursive: true });
      await writeFile(join(root, 'subs/unrelated/package.json'), '{"scripts":{"test":"exit 9"}}');
      const ignore = await readFile(join(root, '.gitignore'), 'utf8');
      await writeFile(join(root, '.gitignore'), `${ignore}\n.cache/\n`);
      await writeFile(join(root, 'ramify-audit.json'), JSON.stringify({
        checks: [{ id: 'configured-command', name: 'Configured command', description: 'Native full execution',
          scope: 'both', category: 'deterministic', onFailure: 'record', executor: { kind: 'command', commands: [
            { name: 'source', cmd: 'node', args: ['-e', 'process.exit(0)'], parser: 'none', timeoutMs: 30_000 },
          ] } }],
        ignorePaths: [], workspace: { preparation: 'nodejs', options: { packageDirectories: [deep], setupCommands: [
          { name: 'prepare-deep', cmd: 'node', args: ['-e', "require('fs').mkdirSync('.cache',{recursive:true});require('fs').writeFileSync('.cache/generated','ready')"], cwd: deep },
        ] } },
      }));
    });
    const output = join(fixture.root, deep, '.cache/generated');
    const evidenceDirectory = await mkdtemp(join(tmpdir(), 'ramify-agent-native-readiness-'));
    cleanups.push(() => rm(evidenceDirectory, { recursive: true, force: true }));
    const ownership = { async recordIntendedWorkspace() {}, async recoverAbandonedWorkspaces() {}, async recordWorkspaceCleaned() {},
      async recordAuditInvocation() {}, async auditInvocation() { return null; } };
    const configured = createConfiguredAudit({ workspaceOwnership: ownership,
      testLock: { lockPath: join(evidenceDirectory, 'machine-test.lock') } });
    const captured = await configured.read(fixture.root, fixture.head);
    expect(captured.workspace.packageDirectories).toEqual([deep]);
    expect(captured.checks.map(check => (check as { id: string }).id)).toEqual(['configured-command']);
    const run = async (runId: string) => runReadiness(configured, {
      runId, attempt: 1, projectRoot: fixture.root, gateDirectory: join(evidenceDirectory, runId), gateId: 'ga-0001',
      policy: defaultRunPolicy({ projectRoot: fixture.root }), projectConfig: await captureProjectConfig(fixture.root),
      auditConfiguration: { config: committedAuditConfigurationSchema.parse(captured) }, index: null, ramify: new FakeRamifyCli(), git: gitService, head: fixture.head,
    });
    const first = await run('native-first');
    expect(first.attempt.verdict).toBe('passed');
    expect(first.attempt.audit).toMatchObject({ requestedSourceCommit: fixture.head, auditedSourceCommit: fixture.head, reused: false });
    expect(first.gate?.commands).toEqual([]);
    expect((first.gate?.provider?.result as { summary: { coverage: { selection: { kind: string } } } }).summary.coverage.selection.kind).toBe('full');
    expect(await readFile(output, 'utf8')).toBe('ready');
    await rm(output);
    const second = await run('native-second');
    expect(second.attempt.verdict).toBe('passed');
    expect(second.attempt.audit).toMatchObject({ requestedSourceCommit: fixture.head, auditedSourceCommit: fixture.head,
      reused: true, reportCommit: first.attempt.audit?.reportCommit, runRef: first.attempt.audit?.runRef });
    expect(await readFile(output, 'utf8')).toBe('ready');
    const evidencePath = process.env['PLAN21_NATIVE_READINESS_EVIDENCE'];
    if (evidencePath !== undefined) await writeFile(evidencePath, JSON.stringify({
      schema: 'plan21.iteration2.native-readiness/1', providerVersion: 'ramify-audit@0.7.1',
      configuration: captured, sourceCommit: fixture.head,
      first: { attempt: first.attempt, provider: first.gate?.provider?.result },
      reused: { attempt: second.attempt, provider: second.gate?.provider?.result },
      workingOutputRecreated: true,
    }, null, 2));
  }, 120_000);

  test('cancelling a native configured command settles its process and owned audit workspace before readiness returns', async () => {
    const evidenceDirectory = await mkdtemp(join(tmpdir(), 'ramify-agent-native-cancel-'));
    cleanups.push(() => rm(evidenceDirectory, { recursive: true, force: true }));
    const marker = join(evidenceDirectory, 'command.pid');
    const command = `require('fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000)`;
    const fixture = await project(async root => {
      await writeFile(join(root, 'ramify-audit.json'), JSON.stringify({
        checks: [{ id: 'waiting-command', name: 'Waiting command', description: 'Cancellation witness',
          scope: 'both', category: 'deterministic', onFailure: 'record', executor: { kind: 'command', commands: [
            { name: 'wait', cmd: 'node', args: ['-e', command], parser: 'none', timeoutMs: 60_000 },
          ] } }], ignorePaths: [], workspace: { preparation: 'nodejs', options: { packageDirectories: [''], setupCommands: [] } },
      }));
    });
    const intended: string[] = [];
    const cleaned: string[] = [];
    const configured = createConfiguredAudit({ workspaceOwnership: {
      async recordIntendedWorkspace(workspace) { intended.push(workspace.worktreePath); },
      async recoverAbandonedWorkspaces() {},
      async recordWorkspaceCleaned(workspace) { cleaned.push(workspace.worktreePath); },
      async recordAuditInvocation() {}, async auditInvocation() { return null; },
    }, testLock: { lockPath: join(evidenceDirectory, 'machine-test.lock') } });
    const captured = await configured.read(fixture.root, fixture.head);
    const controller = new AbortController();
    const running = runReadiness(configured, {
      runId: 'native-cancel', attempt: 1, projectRoot: fixture.root, gateDirectory: join(evidenceDirectory, 'gate'), gateId: 'ga-0001',
      policy: defaultRunPolicy({ projectRoot: fixture.root }), projectConfig: await captureProjectConfig(fixture.root),
      auditConfiguration: { config: committedAuditConfigurationSchema.parse(captured) },
      index: null, ramify: new FakeRamifyCli(), git: gitService, head: fixture.head, signal: controller.signal,
    });
    await until(() => existsSync(marker));
    const pid = Number(await readFile(marker, 'utf8'));
    controller.abort();
    const result = await running;
    expect(result.attempt.verdict).toBe('failed');
    expect(result.attempt.steps.find(entry => entry.step === 'configured-full-audit')).toMatchObject({ outcome: 'not-verified' });
    expect(result.attempt.steps.find(entry => entry.step === 'run-branch')).toMatchObject({ outcome: 'not-verified' });
    expect(intended).toHaveLength(1);
    expect(cleaned).toEqual(intended);
    expect(() => process.kill(pid, 0)).toThrow();
    expect((await git(fixture.root, 'branch', '--show-current')).trim()).toBe('main');
  }, 120_000);

  test('a scratch-only successor keeps captured audit policy while a committed policy change refuses native readiness', async () => {
    const fixture = await project(async root => {
      await writeFile(join(root, 'ramify-audit.json'), JSON.stringify({
        checks: [{ id: 'configured-command', name: 'Configured command', description: 'Committed successor',
          scope: 'both', category: 'deterministic', onFailure: 'record', executor: { kind: 'command', commands: [
            { name: 'source', cmd: 'node', args: ['-e', 'process.exit(0)'], parser: 'none', timeoutMs: 30_000 },
          ] } }], ignorePaths: [], workspace: { preparation: 'nodejs', options: { packageDirectories: [''], setupCommands: [] } },
      }));
    });
    const evidenceDirectory = await mkdtemp(join(tmpdir(), 'ramify-agent-config-successor-'));
    cleanups.push(() => rm(evidenceDirectory, { recursive: true, force: true }));
    const ownership = { async recordIntendedWorkspace() {}, async recoverAbandonedWorkspaces() {}, async recordWorkspaceCleaned() {},
      async recordAuditInvocation() {}, async auditInvocation() { return null; } };
    const configured = createConfiguredAudit({ workspaceOwnership: ownership,
      testLock: { lockPath: join(evidenceDirectory, 'machine-test.lock') } });
    const captured = await configured.read(fixture.root, fixture.head);
    const ignore = await readFile(join(fixture.root, '.gitignore'), 'utf8');
    await writeFile(join(fixture.root, '.gitignore'), `${ignore}\n.plan20-scratch/\n`);
    await git(fixture.root, 'add', '.gitignore');
    await git(fixture.root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'Guard scratch');
    const successor = (await git(fixture.root, 'rev-parse', 'HEAD')).trim();
    const current = await configured.read(fixture.root, successor);
    expect(current.blob).toBe(captured.blob);
    expect(current.sourceCommit).not.toBe(captured.sourceCommit);
    const request = async (head: string, id: string) => runReadiness(configured, {
      runId: id, attempt: 1, projectRoot: fixture.root, gateDirectory: join(evidenceDirectory, id), gateId: 'ga-0001',
      policy: defaultRunPolicy({ projectRoot: fixture.root }), projectConfig: await captureProjectConfig(fixture.root),
      auditConfiguration: { config: committedAuditConfigurationSchema.parse(captured) },
      index: null, ramify: new FakeRamifyCli(), git: gitService, head,
    });
    const passed = await request(successor, 'scratch-successor');
    expect(passed.attempt.verdict).toBe('passed');
    expect(passed.attempt.audit).toMatchObject({ requestedSourceCommit: successor, auditedSourceCommit: successor });
    await writeFile(join(fixture.root, 'ramify-audit.json'), JSON.stringify({
      checks: [{ id: 'changed-command', name: 'Changed command', description: 'Committed policy change',
        scope: 'both', category: 'deterministic', onFailure: 'record', executor: { kind: 'command', commands: [
          { name: 'source', cmd: 'node', args: ['-e', 'process.exit(0)'], parser: 'none', timeoutMs: 30_000 },
        ] } }], ignorePaths: [], workspace: { preparation: 'nodejs', options: { packageDirectories: [''], setupCommands: [] } },
    }));
    await git(fixture.root, 'add', 'ramify-audit.json');
    await git(fixture.root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'Change audit policy');
    const changed = (await git(fixture.root, 'rev-parse', 'HEAD')).trim();
    const refused = await request(changed, 'changed-successor');
    expect(refused.attempt.verdict).toBe('failed');
    expect(refused.attempt.steps.find(entry => entry.step === 'audit-config')).toMatchObject({ outcome: 'failed', detail: expect.stringContaining('conflicts') });
    expect(refused.gate).toBeNull();
    expect((await git(fixture.root, 'branch', '--show-current')).trim()).toBe('ramify-agent-run/scratch-successor');
  }, 120_000);

});
