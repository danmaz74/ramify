import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createConfiguredAudit, type CommittedAuditConfiguration, type ConfiguredAuditPort, type ConfiguredFullAuditResult } from '../../subs/audit/src/check-execution.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { captureProjectConfig } from '../run/project-config.js';
import { defaultRunPolicy } from '../run/policy.js';
import { committedAuditConfigurationSchema, runLayout, type CommittedAuditConfigurationRecord, type InfrastructureRecovery, type ReadinessAttempt } from '../run/records.js';
import { failingStep, performRecovery, recoveryFor, runReadiness } from '../run/readiness.js';
import { copyFixture } from './helpers/fixture.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { commandResult } from './helpers/command-result.js';
import { emptyAnalysis, git, initRepository, installTestRunner, onlyRun, openRuns, runEventsOnDisk, runPath, startRun, stopRun, until } from './helpers/runs.js';

/** These scripted provider answers test readiness policy. Installed-provider conformance is separate. */
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function project(prepare?: (root: string) => Promise<void>) {
  const copy = await copyFixture();
  cleanups.push(copy.remove);
  await installTestRunner(copy.root);
  await prepare?.(copy.root);
  const head = await initRepository(copy.root);
  return { root: copy.root, head };
}

function configuration(head: string, options: Partial<CommittedAuditConfiguration['workspace']> = {}): CommittedAuditConfiguration {
  return {
    sourceCommit: head, path: 'ramify-audit.json', blob: 'committed-blob', projectRoot: '.',
    checks: [{ id: 'configured-tests' }], ignorePaths: [], undetectedConfigFilesForcingFullAudit: [],
    workspace: { preparationId: 'nodejs', packageDirectoriesDeclared: false, linkNodeModules: true,
      packageDirectories: [''], setupCommands: [], ...options },
  };
}

function port(config: CommittedAuditConfiguration, answer?: Partial<ConfiguredFullAuditResult>) {
  const calls: string[] = [];
  const adapter: ConfiguredAuditPort = {
    async read(_root, head) { calls.push(`read:${head}`); return config; },
    async runFull(request) {
      calls.push(`full:${request.sourceCommit}`);
      return { status: 'completed', requestedSourceCommit: request.sourceCommit,
        auditedSourceCommit: request.sourceCommit, reused: false, verdict: 'pass',
        reportCommit: 'report', runRef: 'ref', treeRef: 'tree', detail: 'configured suite complete',
        provider: { source: 'scripted-readiness' }, ...answer };
    },
  };
  return { adapter, calls };
}

async function attempt(fixture: { root: string; head: string }, config: CommittedAuditConfiguration,
  configured = port(config), runId = 'readiness-fixture') {
  const output = await mkdtemp(join(tmpdir(), 'ramify-agent-declared-readiness-'));
  cleanups.push(() => rm(output, { recursive: true, force: true }));
  const result = await runReadiness(configured.adapter, {
    runId, attempt: 1, projectRoot: fixture.root, gateDirectory: output, gateId: 'ga-0001',
    policy: defaultRunPolicy({ projectRoot: fixture.root }), projectConfig: await captureProjectConfig(fixture.root),
    auditConfiguration: { config: config as CommittedAuditConfigurationRecord }, index: null, ramify: new FakeRamifyCli(), git: gitService, head: fixture.head,
  });
  return { ...result, calls: configured.calls };
}

async function readinessLifecycle(root: string, configuredAudit: ConfiguredAuditPort,
  options: Partial<Parameters<typeof openRuns>[1]> = {}) {
  const { service } = await openRuns(root, { git: gitService, script: [{ kind: 'submit', input: emptyAnalysis() }], configuredAudit, ...options });
  cleanups.push(() => service.close());
  const receipt = await service.execute(startRun('review-notes'));
  await service.settled('review-notes', receipt.jobId);
  const events = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
  const failures = events.flatMap(event => event.type === 'readiness-failed' ? [event.data] : []);
  const count = failures.length + events.filter(event => event.type === 'readiness-passed').length;
  const attempts: ReadinessAttempt[] = [];
  for (let index = 1; index <= count; index += 1) {
    attempts.push(JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.readiness(index)), 'utf8')) as ReadinessAttempt);
  }
  const recoveries: InfrastructureRecovery[] = [];
  for (const failure of failures) {
    if (failure.recovery !== null) recoveries.push(JSON.parse(await readFile(
      runPath(root, 'review-notes', receipt.jobId, runLayout.recovery(failure.recovery)), 'utf8')) as InfrastructureRecovery);
  }
  return { snapshot: onlyRun(service, 'review-notes'), failures, attempts, recoveries };
}

function step(result: Awaited<ReturnType<typeof attempt>>, name: string) {
  return result.attempt.steps.find(entry => entry.step === name);
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
    const ownership = { async recordIntendedWorkspace() {}, async recoverAbandonedWorkspaces() {}, async recordWorkspaceCleaned() {} };
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
    const ownership = { async recordIntendedWorkspace() {}, async recoverAbandonedWorkspaces() {}, async recordWorkspaceCleaned() {} };
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

  test('a setup-only deep package is required; an undeclared manifest creates no check', async () => {
    const deep = 'subs/a/subs/b/subs/c/subs/d/tools';
    const fixture = await project(async root => {
      for (const directory of [deep, 'subs/unrelated']) {
        await mkdir(join(root, directory), { recursive: true });
        await writeFile(join(root, directory, 'package.json'), JSON.stringify({ scripts: { test: 'false' } }));
      }
    });
    const config = configuration(fixture.head, { packageDirectoriesDeclared: true, packageDirectories: [deep] });
    const result = await attempt(fixture, config);
    expect(step(result, 'declared-packages')).toMatchObject({ outcome: 'failed' });
    expect(result.calls).not.toContain(`full:${fixture.head}`);
    expect(recoveryFor(result.attempt, result.gate, defaultRunPolicy({ projectRoot: fixture.root })))
      .toEqual({ cause: 'infrastructure', action: 'reinstall-nested', directories: [deep] });
    await mkdir(join(fixture.root, deep, 'node_modules'), { recursive: true });
    const ready = await attempt(fixture, config);
    expect(ready.attempt.verdict).toBe('passed');
    expect(ready.attempt.nested.map(entry => entry.directory)).toEqual([deep]);
    expect(ready.gate?.provider?.result).toMatchObject({ source: 'scripted-readiness' });
  });

  test('the committed setup runs before a reused full result and recreates deleted working output', async () => {
    const fixture = await project();
    const output = join(fixture.root, 'node_modules', 'readiness-generated');
    const command = { argv: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(output)}, 'ready')`],
      cwd: '.', env: {}, timeoutMs: 30_000 };
    const config = configuration(fixture.head, { setupCommands: [command] });
    const configured = port(config, { reused: true, auditedSourceCommit: 'earlier-full-source' });
    const first = await attempt(fixture, config, configured);
    expect(first.attempt.verdict).toBe('passed');
    expect(first.attempt.audit).toMatchObject({ requestedSourceCommit: fixture.head,
      auditedSourceCommit: 'earlier-full-source', reused: true, reportCommit: 'report' });
    expect(await readFile(output, 'utf8')).toBe('ready');
    await rm(output);
    const again = await attempt(fixture, config, configured);
    expect(again.attempt.verdict).toBe('passed');
    expect(await readFile(output, 'utf8')).toBe('ready');
  });

  test('a failed setup stops before the provider and leaves a named readiness failure', async () => {
    const fixture = await project();
    const config = configuration(fixture.head, { setupCommands: [{ argv: [process.execPath, '-e', 'process.exit(7)'],
      cwd: '.', env: {}, timeoutMs: 30_000 }] });
    const result = await attempt(fixture, config);
    expect(failingStep(result.attempt)?.step).toBe('declared-preparation');
    expect(result.calls).not.toContain(`full:${fixture.head}`);
    expect(step(result, 'run-branch')?.outcome).toBe('not-verified');
  });

  test('a symlinked setup cwd outside the project cannot run its marker command', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'ramify-agent-outside-'));
    cleanups.push(() => rm(outside, { recursive: true, force: true }));
    const fixture = await project(async root => { await symlink(outside, join(root, 'outside')); });
    const marker = join(outside, 'marker');
    const config = configuration(fixture.head, { setupCommands: [{ argv: [process.execPath, '-e',
      `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`], cwd: 'outside', env: {}, timeoutMs: 30_000 }] });
    const result = await attempt(fixture, config);
    expect(step(result, 'declared-preparation')?.detail).toContain('resolves outside');
    await expect(readFile(marker)).rejects.toThrow();
    expect(result.calls).not.toContain(`full:${fixture.head}`);
  });

  test('provider failure and captured-policy conflict stop before branch creation', async () => {
    const fixture = await project();
    const config = configuration(fixture.head);
    const failed = await attempt(fixture, config, port(config, { status: 'failed', verdict: null,
      auditedSourceCommit: null, reportCommit: null, runRef: null, treeRef: null,
      detail: 'configured discovery unavailable' }));
    expect(failingStep(failed.attempt)?.detail).toContain('configured discovery unavailable');
    expect(step(failed, 'run-branch')?.outcome).toBe('not-verified');
    expect((await git(fixture.root, 'branch', '--list', 'ramify-agent-run/*')).trim()).toBe('');
    const mismatched = port({ ...config, blob: 'changed-blob' });
    const conflict = await attempt(fixture, config, mismatched);
    expect(step(conflict, 'audit-config')?.detail).toContain('conflicts');
    expect(mismatched.calls).not.toContain(`full:${fixture.head}`);
  });

  test('a declared missing installation is repaired once, then readiness continues', async () => {
    const directory = 'subs/tool';
    const fixture = await project(async root => {
      await mkdir(join(root, directory), { recursive: true });
      await writeFile(join(root, directory, 'package.json'), '{"name":"tool"}');
    });
    const config = configuration(fixture.head, { packageDirectoriesDeclared: true, packageDirectories: [directory] });
    const first = await attempt(fixture, config);
    const plan = recoveryFor(first.attempt, first.gate, defaultRunPolicy({ projectRoot: fixture.root }));
    expect(plan).toMatchObject({ action: 'reinstall-nested', directories: [directory] });
    const recovery = await performRecovery({ id: 'rc-0001', attempt: 1, plan: plan!, projectRoot: fixture.root,
      policy: defaultRunPolicy({ projectRoot: fixture.root }), auditConfiguration: { config: committedAuditConfigurationSchema.parse(config) }, ramify: new FakeRamifyCli(), count: 1,
      directory: await mkdtemp(join(tmpdir(), 'ramify-agent-readiness-recovery-')),
      commandExecution: async request => {
        await mkdir(join(fixture.root, directory, 'node_modules'), { recursive: true });
        return commandResult(request, {});
      } });
    expect(recovery.outcome).toBe('recovered');
    expect((await attempt(fixture, config)).attempt.verdict).toBe('passed');
  });

  test('timeout evidence qualifies a bounded rerun; failed tests and unavailable discovery do not', async () => {
    const fixture = await project();
    const config = configuration(fixture.head);
    const timeout = await attempt(fixture, config, port(config, { verdict: 'fail', provider: { status: 'completed',
      summary: { checks: { 'configured-tests': { runnerError: { kind: 'timeout' } } } } } }));
    expect(recoveryFor(timeout.attempt, timeout.gate, defaultRunPolicy({ projectRoot: fixture.root })))
      .toMatchObject({ cause: 'timeout', action: 'rerun-command' });
    const passed = await attempt(fixture, config);
    expect(passed.attempt.verdict).toBe('passed');
    const failedTests = await attempt(fixture, config, port(config, { verdict: 'fail', provider: { status: 'completed',
      summary: { checks: { 'configured-tests': { status: 'fail' } } } } }));
    expect(recoveryFor(failedTests.attempt, failedTests.gate, defaultRunPolicy({ projectRoot: fixture.root }))).toBeNull();
    const unavailable = await attempt(fixture, config, port(config, { status: 'failed', verdict: null,
      provider: { status: 'failed', error: { code: 'discovery-failed', retryable: false } } }));
    expect(recoveryFor(unavailable.attempt, unavailable.gate, defaultRunPolicy({ projectRoot: fixture.root }))).toBeNull();
  });

  test('dirty and non-Git projects stop before preparation, audit, and branch creation', async () => {
    const fixture = await project();
    const config = configuration(fixture.head, { setupCommands: [{ argv: [process.execPath, '-e', 'process.exit(0)'], cwd: '.', env: {}, timeoutMs: 30_000 }] });
    await writeFile(join(fixture.root, 'dirty-marker'), 'uncommitted');
    const dirty = await attempt(fixture, config);
    expect(failingStep(dirty.attempt)?.step).toBe('git-clean');
    expect(dirty.calls).not.toContain(`full:${fixture.head}`);
    const plain = await project();
    await rm(join(plain.root, '.git'), { recursive: true, force: true });
    const nongit = await attempt(plain, configuration(plain.head));
    expect(step(nongit, 'project-root')?.outcome).toBe('passed');
    expect(step(nongit, 'git-clean')?.outcome).toBe('failed');
    expect(nongit.calls).not.toContain(`full:${fixture.head}`);
  });

  test('an install command into linked dependencies is refused before any setup process', async () => {
    const fixture = await project();
    const config = configuration(fixture.head, { setupCommands: [{ argv: ['npm', 'ci'], cwd: '.', env: {}, timeoutMs: 30_000 }] });
    const result = await attempt(fixture, config);
    expect(step(result, 'declared-preparation')?.detail).toContain('would follow the link');
    expect(result.calls).not.toContain(`full:${fixture.head}`);
    expect(recoveryFor(result.attempt, result.gate, defaultRunPolicy({ projectRoot: fixture.root }))).toBeNull();
  });

  test('RunService repairs a missing declared installation once and then completes readiness', async () => {
    const directory = 'subs/workspace/subs/catalog/tools';
    const fixture = await project(async root => {
      await mkdir(join(root, directory), { recursive: true });
      await writeFile(join(root, directory, 'package.json'), '{"name":"catalog-tools"}');
    });
    const config = configuration(fixture.head, { packageDirectoriesDeclared: true, packageDirectories: [directory] });
    const result = await readinessLifecycle(fixture.root, port(config).adapter, { commandExecution: async request => {
      await mkdir(join(fixture.root, directory, 'node_modules'), { recursive: true });
      return commandResult(request, {});
    } });
    expect(result.snapshot.state).toBe('completed');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ step: 'declared-packages', recovery: 'rec-0001', final: false });
    expect(result.recoveries[0]).toMatchObject({ action: 'reinstall-nested', outcome: 'recovered', attempt: 1 });
    expect(result.attempts.map(entry => entry.verdict)).toEqual(['failed', 'passed']);
  }, 120_000);

  test('RunService stops immediately when a declared installation repair is ineffective', async () => {
    const directory = 'subs/workspace/subs/catalog/tools';
    const fixture = await project(async root => {
      await mkdir(join(root, directory), { recursive: true });
      await writeFile(join(root, directory, 'package.json'), '{"name":"catalog-tools"}');
    });
    const config = configuration(fixture.head, { packageDirectoriesDeclared: true, packageDirectories: [directory] });
    const result = await readinessLifecycle(fixture.root, port(config).adapter, {
      commandExecution: request => commandResult(request, {}),
    });
    expect(result.snapshot.state).toBe('failed');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ step: 'declared-packages', recovery: 'rec-0001', final: true });
    expect(result.recoveries).toMatchObject([{ action: 'reinstall-nested', outcome: 'failed', attempt: 1 }]);
  }, 120_000);

  test('RunService exhausts two bounded recoveries for recurring configured timeout evidence', async () => {
    const fixture = await project();
    const config = configuration(fixture.head);
    const timedOut = port(config, { verdict: 'fail', provider: { status: 'completed', summary: { checks: {
      'configured-tests': { termination: { reason: 'timeout' } },
    } } } });
    const result = await readinessLifecycle(fixture.root, timedOut.adapter);
    expect(result.snapshot.state).toBe('failed');
    expect(result.failures.map(entry => entry.recovery)).toEqual(['rec-0001', 'rec-0002', null]);
    expect(result.recoveries.map(entry => [entry.cause, entry.action, entry.attempt]))
      .toEqual([['timeout', 'rerun-command', 1], ['timeout', 'rerun-command', 2]]);
    expect(result.attempts).toHaveLength(3);
  }, 120_000);

  test('RunService reruns once after configured timeout and stops on failing tests without recovery', async () => {
    const fixture = await project();
    const config = configuration(fixture.head);
    const base = port(config).adapter;
    let calls = 0;
    const configured: ConfiguredAuditPort = { read: base.read, async runFull(input) {
      const result = await base.runFull(input);
      return ++calls === 1 ? { ...result, verdict: 'fail', provider: { status: 'completed', summary: { checks: {
        'configured-tests': { termination: { reason: 'timeout' } },
      } } } } : result;
    } };
    const recovered = await readinessLifecycle(fixture.root, configured);
    expect(recovered.snapshot.state).toBe('completed');
    expect(recovered.failures).toHaveLength(1);
    expect(recovered.recoveries[0]).toMatchObject({ cause: 'timeout', outcome: 'recovered' });
    const second = await project();
    const failedConfig = configuration(second.head);
    const failed = await readinessLifecycle(second.root, port(failedConfig, { verdict: 'fail', provider: { status: 'completed',
      summary: { checks: { 'configured-tests': { status: 'fail' } } } } }).adapter);
    expect(failed.snapshot.state).toBe('failed');
    expect(failed.failures).toMatchObject([{ step: 'configured-full-audit', recovery: null, final: true }]);
    expect(failed.recoveries).toEqual([]);
  }, 120_000);

  test('RunService records a failed Ramify restart and performs no audit', async () => {
    const fixture = await project();
    const executableDirectory = await mkdtemp(join(tmpdir(), 'ramify-agent-unavailable-daemon-'));
    cleanups.push(() => rm(executableDirectory, { recursive: true, force: true }));
    const executable = join(executableDirectory, 'ramify');
    await writeFile(executable, '#!/bin/sh\necho "daemon unavailable" >&2\nexit 1\n');
    await chmod(executable, 0o755);
    const config = configuration(fixture.head);
    const configured = port(config);
    const result = await readinessLifecycle(fixture.root, configured.adapter, { ramify: new RamifyCli({ executable, timeoutMs: 30_000 }) });
    expect(result.snapshot.state).toBe('failed');
    expect(result.failures).toMatchObject([{ step: 'ramify-daemon', recovery: 'rec-0001', final: true }]);
    expect(result.recoveries).toMatchObject([{ action: 'restart-daemon', outcome: 'failed', attempt: 1 }]);
    expect(configured.calls).not.toContain(`full:${fixture.head}`);
  }, 120_000);

  test('RunService stop aborts active readiness, records the cancelled attempt, and waits for provider settlement before job-stopped', async () => {
    const fixture = await project();
    const config = configuration(fixture.head);
    const base = port(config).adapter;
    let entered = false;
    let aborted = false;
    let release!: () => void;
    const processSettled = new Promise<void>(resolve => { release = resolve; });
    const configured: ConfiguredAuditPort = { read: base.read, async runFull(input) {
      entered = true;
      await new Promise<void>(resolve => {
        if (input.signal?.aborted) { aborted = true; resolve(); }
        else input.signal?.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true });
      });
      await processSettled;
      return { status: 'cancelled', requestedSourceCommit: input.sourceCommit, auditedSourceCommit: null,
        reused: false, verdict: null, reportCommit: null, runRef: null, treeRef: null,
        detail: 'provider command cancelled and settled', provider: { status: 'cancelled', reason: 'signal' } };
    } };
    const { service } = await openRuns(fixture.root, { git: gitService,
      script: [{ kind: 'submit', input: emptyAnalysis() }], configuredAudit: configured });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await until(() => entered);
    await service.execute(stopRun('review-notes', receipt.jobId, service.getRun('review-notes', receipt.jobId)!.version));
    await until(() => aborted);
    expect((await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId)).some(event => event.type === 'job-stopped')).toBe(false);
    release();
    await service.settled('review-notes', receipt.jobId);
    const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
    const stopIndex = events.findIndex(event => event.type === 'stop-requested');
    const failedIndex = events.findIndex(event => event.type === 'readiness-failed');
    const terminalIndex = events.findIndex(event => event.type === 'job-stopped');
    expect(stopIndex).toBeGreaterThanOrEqual(0);
    expect(failedIndex).toBeGreaterThan(stopIndex);
    expect(terminalIndex).toBeGreaterThan(failedIndex);
    expect(terminalIndex).toBe(events.length - 1);
    const cancelled = JSON.parse(await readFile(runPath(fixture.root, 'review-notes', receipt.jobId, runLayout.readiness(1)), 'utf8')) as ReadinessAttempt;
    expect(cancelled.steps.find(entry => entry.step === 'configured-full-audit')).toMatchObject({ outcome: 'not-verified' });
    expect(cancelled.steps.find(entry => entry.step === 'run-branch')).toMatchObject({ outcome: 'not-verified' });
    expect((await git(fixture.root, 'branch', '--show-current')).trim()).toBe('main');
    expect(onlyRun(service, 'review-notes').state).toBe('stopped');
  }, 120_000);

  test('closing during readiness aborts and waits for settlement without writing a terminal event', async () => {
    const fixture = await project();
    const base = port(configuration(fixture.head)).adapter;
    let entered = false;
    let aborted = false;
    let release!: () => void;
    const processSettled = new Promise<void>(resolve => { release = resolve; });
    const configured: ConfiguredAuditPort = { read: base.read, async runFull(input) {
      entered = true;
      await new Promise<void>(resolve => input.signal?.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true }));
      await processSettled;
      return { status: 'cancelled', requestedSourceCommit: input.sourceCommit, auditedSourceCommit: null,
        reused: false, verdict: null, reportCommit: null, runRef: null, treeRef: null,
        detail: 'provider command cancelled and settled', provider: { status: 'cancelled', reason: 'signal' } };
    } };
    const { service } = await openRuns(fixture.root, { git: gitService,
      script: [{ kind: 'submit', input: emptyAnalysis() }], configuredAudit: configured });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await until(() => entered);
    let closed = false;
    const closing = service.close().then(() => { closed = true; });
    await until(() => aborted);
    expect(closed).toBe(false);
    release();
    await closing;
    const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
    expect(events.some(event => event.type === 'job-stopped' || event.type === 'job-failed')).toBe(false);
    expect((await git(fixture.root, 'branch', '--show-current')).trim()).toBe('main');
  }, 120_000);
});
