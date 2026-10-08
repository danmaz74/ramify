import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { type CommittedAuditConfiguration, type ConfiguredAuditInput, type ConfiguredAuditPort, type ConfiguredFullAuditResult } from '../../subs/audit/src/check-execution.js';
import { captureProjectConfig } from '../run/project-config.js';
import { defaultRunPolicy } from '../run/policy.js';
import { committedAuditConfigurationSchema, runLayout, type CommittedAuditConfigurationRecord, type InfrastructureRecovery, type ReadinessAttempt } from '../run/records.js';
import { failingStep, performRecovery, recoveryFor, runReadiness } from '../run/readiness.js';
import { copyFixture } from './helpers/fixture.js';
import { emptyAnalysis, installTestRunner, onlyRun, openRuns, runEventsOnDisk, runPath, startRun, stopRun, until } from './helpers/runs.js';

import { readinessBoundaries, readinessHead, strictReadinessAudit, strictReadinessCommand } from './helpers/readiness-boundaries.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(resetSpawnAttempts);
const boundaries = new Map<string, ReturnType<typeof readinessBoundaries>>();
const checks: Array<() => void> = [];
const configRoots = new WeakMap<CommittedAuditConfiguration, string>();
/** These scripted provider answers test readiness policy. Installed-provider conformance is separate. */
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) try { await cleanup(); } catch (error) { errors.push(error); }
  for (const answer of boundaries.values()) try { answer.assertComplete(); } catch (error) { errors.push(error); }
  boundaries.clear();
  for (const check of checks.splice(0)) try { check(); } catch (error) { errors.push(error); }
  try { expect(spawnAttempts(), 'ordinary readiness setup/flow/teardown process attempts').toEqual([]); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'readiness teardown failed');
});

async function project(prepare?: (root: string) => Promise<void>) {
  const copy = await copyFixture();
  cleanups.push(copy.remove);
  await installTestRunner(copy.root);
  await prepare?.(copy.root);
  const head = readinessHead;
  const answer = readinessBoundaries(copy.root);
  boundaries.set(copy.root, answer);
  return { root: copy.root, head };
}

function configuration(fixture: { root: string; head: string }, options: Partial<CommittedAuditConfiguration['workspace']> = {}): CommittedAuditConfiguration {
  const config: CommittedAuditConfiguration = {
    sourceCommit: fixture.head, path: 'ramify-audit.json', blob: 'committed-blob', projectRoot: '.',
    checks: [{ id: 'configured-tests' }], ignorePaths: [], undetectedConfigFilesForcingFullAudit: [],
    workspace: { preparationId: 'nodejs', packageDirectoriesDeclared: false, linkNodeModules: true,
      packageDirectories: [''], setupCommands: [], ...options },
  };
  configRoots.set(config, fixture.root);
  return config;
}

/** A scripted provider answer to one readiness request: a completed full pass unless `answer` says otherwise. */
function resultOf(input: ConfiguredAuditInput, answer: Partial<ConfiguredFullAuditResult> = {}): ConfiguredFullAuditResult {
  return {
    status: 'completed', requestId: `${input.runId}:${input.attemptId}`, mode: input.mode, nested: false, projects: null, discovery: null,
    requestedSourceCommit: input.sourceCommit, auditedSourceCommit: input.sourceCommit, reused: false, reuse: null,
    requestedMode: 'full', executedMode: 'full', fallbackReason: null, verdict: 'pass',
    reportCommit: 'report', runRef: 'ref', treeRef: 'tree',
    definition: { path: input.configuration.path, blob: input.configuration.blob },
    detail: 'configured suite complete', provider: { source: 'scripted-readiness' }, checks: {}, ...answer,
  };
}

/** A provider answer that settled after cancellation. */
function cancelledResult(input: ConfiguredAuditInput): ConfiguredFullAuditResult {
  return resultOf(input, { status: 'cancelled', auditedSourceCommit: null, requestedMode: null, executedMode: null,
    verdict: null, reportCommit: null, runRef: null, treeRef: null,
    detail: 'provider command cancelled and settled', provider: { status: 'cancelled', reason: 'signal' } });
}

function port(config: CommittedAuditConfiguration, answer?: Partial<ConfiguredFullAuditResult>, runs = 1, gates: readonly string[] = Array<string>(runs).fill('ga-0001')) {
  const calls: string[] = [];
  const adapter: ConfiguredAuditPort = {
    async read(_root, head) { calls.push(`read:${head}`); return config; },
    async run(request) {
      calls.push(`${request.mode}:${request.sourceCommit}`);
      return resultOf(request, answer);
    },
  };
  const strict = strictReadinessAudit(adapter, configRoots.get(config)!, config, gates);
  checks.push(strict.assertComplete);
  return { adapter: strict.adapter, calls };
}

async function attempt(fixture: { root: string; head: string }, config: CommittedAuditConfiguration,
  configured = port(config), runId = 'readiness-fixture') {
  const output = await mkdtemp(join(tmpdir(), 'ramify-agent-declared-readiness-'));
  cleanups.push(() => rm(output, { recursive: true, force: true }));
  const result = await runReadiness(configured.adapter, {
    runId, attempt: 1, projectRoot: fixture.root, gateDirectory: output, gateId: 'ga-0001',
    policy: defaultRunPolicy({ projectRoot: fixture.root }), projectConfig: await captureProjectConfig(fixture.root),
    auditConfiguration: { config: config as CommittedAuditConfigurationRecord }, index: null, ramify: boundaries.get(fixture.root)!.options.ramify, git: boundaries.get(fixture.root)!.options.git, head: fixture.head,
    commandExecution: boundaries.get(fixture.root)!.options.commandExecution,
  });
  return { ...result, calls: configured.calls };
}

async function readinessLifecycle(root: string, configuredAudit: ConfiguredAuditPort,
  options: Partial<Parameters<typeof openRuns>[1]> = {}) {
  const { service } = await openRuns(root, { ...boundaries.get(root)!.options, script: [{ kind: 'submit', input: emptyAnalysis() }], configuredAudit, ...options });
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
  // Each baseline gate's recorded audit outcome, where its request was answered and published.
  const outcomes: Record<string, unknown> = {};
  for (const event of events) {
    if ((event.type !== 'readiness-passed' && event.type !== 'readiness-failed') || event.data.gate === undefined) continue;
    const path = runPath(root, 'review-notes', receipt.jobId, runLayout.gateAuditOutcome(event.data.gate));
    if (existsSync(path)) outcomes[event.data.gate] = JSON.parse(await readFile(path, 'utf8'));
  }
  return { snapshot: onlyRun(service, 'review-notes'), failures, attempts, recoveries, outcomes };
}

function step(result: Awaited<ReturnType<typeof attempt>>, name: string) {
  return result.attempt.steps.find(entry => entry.step === name);
}

describe('declared preparation and configured full readiness', () => {
  test('a setup-only deep package is required; an undeclared manifest creates no check', async () => {
    const deep = 'subs/a/subs/b/subs/c/subs/d/tools';
    const fixture = await project(async root => {
      for (const directory of [deep, 'subs/unrelated']) {
        await mkdir(join(root, directory), { recursive: true });
        await writeFile(join(root, directory, 'package.json'), JSON.stringify({ scripts: { test: 'false' } }));
      }
    });
    const config = configuration(fixture, { packageDirectoriesDeclared: true, packageDirectories: [deep] });
    const result = await attempt(fixture, config, port(config, undefined, 0));
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
    const config = configuration(fixture, { setupCommands: [command] });
    const configured = port(config, { reused: true, auditedSourceCommit: 'earlier-full-source' }, 2);
    const execution = strictReadinessCommand(fixture.root, command, 2, () => writeFile(output, 'ready'));
    boundaries.get(fixture.root)!.command(execution.run); checks.push(execution.assertComplete);
    boundaries.get(fixture.root)!.expectBranches(2);
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
    boundaries.get(fixture.root)!.expectBranches(0);
    const config = configuration(fixture, { setupCommands: [{ argv: [process.execPath, '-e', 'process.exit(7)'],
      cwd: '.', env: {}, timeoutMs: 30_000 }] });
    const execution = strictReadinessCommand(fixture.root, { argv: [process.execPath, '-e', 'process.exit(7)'], cwd: '.', env: {}, timeoutMs: 30_000 }, 1, undefined, { outcome: { kind: 'completed', exitCode: 7 } });
    boundaries.get(fixture.root)!.command(execution.run); checks.push(execution.assertComplete);
    const result = await attempt(fixture, config, port(config, undefined, 0));
    expect(failingStep(result.attempt)?.step).toBe('declared-preparation');
    expect(result.calls).not.toContain(`full:${fixture.head}`);
    expect(step(result, 'run-branch')?.outcome).toBe('not-verified');
  });

  test('a symlinked setup cwd outside the project cannot run its marker command', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'ramify-agent-outside-'));
    cleanups.push(() => rm(outside, { recursive: true, force: true }));
    const fixture = await project(async root => { await symlink(outside, join(root, 'outside')); });
    const marker = join(outside, 'marker');
    boundaries.get(fixture.root)!.expectBranches(0);
    const config = configuration(fixture, { setupCommands: [{ argv: [process.execPath, '-e',
      `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`], cwd: 'outside', env: {}, timeoutMs: 30_000 }] });
    const result = await attempt(fixture, config, port(config, undefined, 0));
    expect(step(result, 'declared-preparation')?.detail).toContain('resolves outside');
    await expect(readFile(marker)).rejects.toThrow();
    expect(result.calls).not.toContain(`full:${fixture.head}`);
  });

  test('provider failure and captured-policy conflict stop before branch creation', async () => {
    const fixture = await project();
    boundaries.get(fixture.root)!.expectBranches(0);
    const config = configuration(fixture);
    const failed = await attempt(fixture, config, port(config, { status: 'failed', verdict: null,
      auditedSourceCommit: null, reportCommit: null, runRef: null, treeRef: null,
      detail: 'configured discovery unavailable' }));
    expect(failingStep(failed.attempt)?.detail).toContain('configured discovery unavailable');
    expect(step(failed, 'run-branch')?.outcome).toBe('not-verified');
    expect(boundaries.get(fixture.root)!.branches().join('\n')).toBe('');
    const conflictingConfig = { ...config, blob: 'changed-blob' };
    configRoots.set(conflictingConfig, fixture.root);
    const mismatched = port(conflictingConfig, undefined, 0);
    const conflict = await attempt(fixture, config, mismatched);
    expect(step(conflict, 'audit-config')?.detail).toContain('conflicts');
    expect(mismatched.calls).not.toContain(`full:${fixture.head}`);
  });

  test('readiness asks the final gate\'s nested full request; a nested failure or an undecided answer refuses it before branch creation, and applicable reuse passes', async () => {
    const fixture = await project();
    const config = configuration(fixture);
    const requests: ConfiguredAuditInput[] = [];
    const scripted = (answer: (input: ConfiguredAuditInput) => Partial<ConfiguredFullAuditResult>) => { const strict = strictReadinessAudit({
      async read() { return config; },
      async run(input: ConfiguredAuditInput) { requests.push(input); return resultOf(input, answer(input)); },
    } satisfies ConfiguredAuditPort, fixture.root, config, ['ga-0001']); checks.push(strict.assertComplete); return { calls: [] as string[], adapter: strict.adapter }; };
    const project_ = (projectRoot: string, verdict: 'pass' | 'fail' | 'indeterminate', execution: 'ran' | 'reused' | 'not-run' = 'ran') => ({
      projectRoot, verdict, execution, status: execution === 'not-run' ? 'cancelled' as const : 'completed' as const,
      failures: verdict === 'fail' ? ['tools-check: FAIL'] : [], requestId: `request-${projectRoot}`,
      auditedSourceCommit: execution === 'not-run' ? null : fixture.head, requestedMode: 'full' as const, executedMode: execution === 'not-run' ? null : 'full' as const,
      fallbackReason: null, reuse: null, reportCommit: execution === 'not-run' ? null : `report-${projectRoot}`,
      runRef: execution === 'not-run' ? null : `run-${projectRoot}`, treeRef: execution === 'not-run' ? null : `tree-${projectRoot}`,
      retrievalCommands: [], durationSeconds: 1, counts: null, detail: verdict,
    });
    const complete = { status: 'complete' as const, skipped: [], unavailable: [] };

    const failing = await attempt(fixture, config, scripted(input => ({ nested: input.nested === true, verdict: 'fail',
      detail: 'invocation fail over 2 projects; failed: engine/tools', discovery: complete,
      projects: [project_('.', 'pass'), project_('engine/tools', 'fail')] })));
    expect(requests.map(input => [input.mode, input.nested])).toEqual([['full', true]]);
    expect(step(failing, 'configured-full-audit')).toMatchObject({ outcome: 'failed', gate: 'ga-0001' });
    expect(step(failing, 'run-branch')?.outcome).toBe('not-verified');
    expect([failing.gate?.verdict, failing.gate?.cause]).toEqual(['failed', 'check-failed']);
    expect(failing.gate?.audit?.projects?.map(entry => [entry.projectRoot, entry.verdict])).toEqual([['.', 'pass'], ['engine/tools', 'fail']]);
    expect(recoveryFor(failing.attempt, failing.gate, defaultRunPolicy({ projectRoot: fixture.root }))).toBeNull();
    expect(boundaries.get(fixture.root)!.branches().join('\n')).toBe('');

    const undecided = await attempt(fixture, config, scripted(input => ({ nested: input.nested === true, verdict: 'indeterminate',
      detail: 'invocation indeterminate over 1 project; discovery indeterminate beneath .', projects: [project_('.', 'pass')],
      discovery: { status: 'indeterminate', skipped: [], unavailable: [{ enclosingProject: '.', reason: 'ownership query failed', definitions: ['engine/ramify-audit.json'] }] } })));
    expect(step(undecided, 'configured-full-audit')?.outcome).toBe('not-verified');
    expect([undecided.gate?.verdict, undecided.gate?.cause]).toEqual(['not-verified', 'infrastructure']);
    expect(boundaries.get(fixture.root)!.branches().join('\n')).toBe('');

    const reuse = { auditedCommit: 'earlier', ignoredChangedPaths: ['docs/a.md'], requestedMode: 'full' as const, resolution: 'requested' as const };
    const reused = await attempt(fixture, config, scripted(input => ({ nested: input.nested === true, reused: true, reuse, auditedSourceCommit: 'earlier',
      detail: 'invocation pass over 2 projects', discovery: complete,
      projects: [{ ...project_('.', 'pass', 'reused'), reuse }, { ...project_('engine/tools', 'pass', 'reused'), reuse }] })));
    expect(reused.attempt.verdict).toBe('passed');
    expect(reused.attempt.audit).toMatchObject({ requestedSourceCommit: fixture.head, auditedSourceCommit: 'earlier', reused: true });
    expect(reused.gate?.audit).toMatchObject({ nested: true, verdict: 'pass', reuse });
    expect(reused.gate?.audit?.projects?.map(entry => entry.execution)).toEqual(['reused', 'reused']);
    expect(boundaries.get(fixture.root)!.branch()).toBe('ramify-agent-run/readiness-fixture');
  });

  test('a declared missing installation is repaired once, then readiness continues', async () => {
    const directory = 'subs/tool';
    const fixture = await project(async root => {
      await mkdir(join(root, directory), { recursive: true });
      await writeFile(join(root, directory, 'package.json'), '{"name":"tool"}');
    });
    const config = configuration(fixture, { packageDirectoriesDeclared: true, packageDirectories: [directory] });
    const first = await attempt(fixture, config, port(config, undefined, 0));
    const plan = recoveryFor(first.attempt, first.gate, defaultRunPolicy({ projectRoot: fixture.root }));
    expect(plan).toMatchObject({ action: 'reinstall-nested', directories: [directory] });
    const repair = strictReadinessCommand(fixture.root, { argv: ['npm', 'ci'], cwd: directory, env: {}, timeoutMs: 900_000 }, 1, () => mkdir(join(fixture.root, directory, 'node_modules'), { recursive: true }).then(() => undefined));
    checks.push(repair.assertComplete);
    const recoveryDirectory = await mkdtemp(join(tmpdir(), 'ramify-agent-readiness-recovery-'));
    cleanups.push(() => rm(recoveryDirectory, { recursive: true, force: true }));
    const recovery = await performRecovery({ id: 'rc-0001', attempt: 1, plan: plan!, projectRoot: fixture.root,
      policy: defaultRunPolicy({ projectRoot: fixture.root }), auditConfiguration: { config: committedAuditConfigurationSchema.parse(config) }, ramify: boundaries.get(fixture.root)!.options.ramify, count: 1,
      directory: recoveryDirectory,
      commandExecution: repair.run });
    expect(recovery.outcome).toBe('recovered');
    expect((await attempt(fixture, config)).attempt.verdict).toBe('passed');
  });

  test('timeout evidence qualifies a bounded rerun; failed tests and unavailable discovery do not', async () => {
    const fixture = await project();
    const config = configuration(fixture);
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
    boundaries.get(fixture.root)!.expectBranches(0);
    const config = configuration(fixture, { setupCommands: [{ argv: [process.execPath, '-e', 'process.exit(0)'], cwd: '.', env: {}, timeoutMs: 30_000 }] });
    await writeFile(join(fixture.root, 'dirty-marker'), 'uncommitted');
    boundaries.get(fixture.root)!.repository('dirty');
    const dirty = await attempt(fixture, config, port(config, undefined, 0));
    expect(failingStep(dirty.attempt)?.step).toBe('git-clean');
    expect(dirty.calls).not.toContain(`full:${fixture.head}`);
    const plain = await project();
    boundaries.get(plain.root)!.expectBranches(0);
    boundaries.get(plain.root)!.repository('unavailable');
    await rm(join(plain.root, '.git'), { recursive: true, force: true });
    const plainConfig = configuration(plain);
    const nongit = await attempt(plain, plainConfig, port(plainConfig, undefined, 0));
    expect(step(nongit, 'project-root')?.outcome).toBe('passed');
    expect(step(nongit, 'git-clean')?.outcome).toBe('failed');
    expect(nongit.calls).not.toContain(`full:${fixture.head}`);
  });

  test('an install command into linked dependencies is refused before any setup process', async () => {
    const fixture = await project();
    boundaries.get(fixture.root)!.expectBranches(0);
    const config = configuration(fixture, { setupCommands: [{ argv: ['npm', 'ci'], cwd: '.', env: {}, timeoutMs: 30_000 }] });
    const result = await attempt(fixture, config, port(config, undefined, 0));
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
    const config = configuration(fixture, { packageDirectoriesDeclared: true, packageDirectories: [directory] });
    boundaries.get(fixture.root)!.lifecycle(true);
    const repair = strictReadinessCommand(fixture.root, { argv: ['npm', 'ci'], cwd: directory, env: {}, timeoutMs: 900_000 }, 1, () => mkdir(join(fixture.root, directory, 'node_modules'), { recursive: true }).then(() => undefined));
    checks.push(repair.assertComplete);
    const result = await readinessLifecycle(fixture.root, port(config, undefined, 2, ['ga-0002', 'ga-0003']).adapter, { commandExecution: repair.run });
    expect(result.snapshot.state).toBe('completed');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ step: 'declared-packages', recovery: 'rec-0001', final: false });
    expect(result.recoveries[0]).toMatchObject({ action: 'reinstall-nested', outcome: 'recovered', attempt: 1 });
    expect(result.attempts.map(entry => entry.verdict)).toEqual(['failed', 'passed']);
    // The baseline's answered audit keeps its outcome beside its gate, as a committing gate's does.
    expect(Object.values(result.outcomes)).toEqual([{ schema: 'ramify-agent.gate-audit-outcome/1', gate: expect.any(String), overall: 'pass', audited: fixture.head }]);
  }, 120_000);

  test('RunService stops immediately when a declared installation repair is ineffective', async () => {
    const directory = 'subs/workspace/subs/catalog/tools';
    const fixture = await project(async root => {
      await mkdir(join(root, directory), { recursive: true });
      await writeFile(join(root, directory, 'package.json'), '{"name":"catalog-tools"}');
    });
    const config = configuration(fixture, { packageDirectoriesDeclared: true, packageDirectories: [directory] });
    boundaries.get(fixture.root)!.lifecycle(false); boundaries.get(fixture.root)!.expectBranches(0);
    const repair = strictReadinessCommand(fixture.root, { argv: ['npm', 'ci'], cwd: directory, env: {}, timeoutMs: 900_000 }, 1); checks.push(repair.assertComplete);
    const result = await readinessLifecycle(fixture.root, port(config, undefined, 0).adapter, {
      commandExecution: repair.run,
    });
    expect(result.snapshot.state).toBe('failed');
    expect(result.snapshot.failure?.reason).toBe('readiness-failed');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ step: 'declared-packages', recovery: 'rec-0001', final: true });
    expect(result.recoveries).toMatchObject([{ action: 'reinstall-nested', outcome: 'failed', attempt: 1 }]);
  }, 120_000);

  test('RunService exhausts two bounded recoveries for recurring configured timeout evidence', async () => {
    const fixture = await project();
    const config = configuration(fixture);
    boundaries.get(fixture.root)!.lifecycle(false); boundaries.get(fixture.root)!.expectBranches(0);
    const timedOut = port(config, { verdict: 'fail', provider: { status: 'completed', summary: { checks: {
      'configured-tests': { termination: { reason: 'timeout' } },
    } } } }, 3, ['ga-0001', 'ga-0002', 'ga-0003']);
    const result = await readinessLifecycle(fixture.root, timedOut.adapter);
    expect(result.snapshot.state).toBe('failed');
    expect(result.snapshot.failure?.reason).toBe('readiness-failed');
    expect(result.failures.map(entry => entry.recovery)).toEqual(['rec-0001', 'rec-0002', null]);
    expect(result.recoveries.map(entry => [entry.cause, entry.action, entry.attempt]))
      .toEqual([['timeout', 'rerun-command', 1], ['timeout', 'rerun-command', 2]]);
    expect(result.attempts).toHaveLength(3);
  }, 120_000);

  test('RunService reruns once after configured timeout and stops on failing tests without recovery', async () => {
    const fixture = await project();
    const config = configuration(fixture);
    boundaries.get(fixture.root)!.lifecycle(true);
    const base = port(config, undefined, 3, ['ga-0001', 'ga-0002', 'ga-0003']).adapter;
    let calls = 0;
    const configured: ConfiguredAuditPort = { read: base.read, async run(input) {
      const result = await base.run(input);
      return ++calls === 1 ? { ...result, verdict: 'fail', provider: { status: 'completed', summary: { checks: {
        'configured-tests': { termination: { reason: 'timeout' } },
      } } } } : result;
    } };
    const recovered = await readinessLifecycle(fixture.root, configured);
    expect(recovered.snapshot.state).toBe('completed');
    expect(recovered.failures).toHaveLength(1);
    expect(recovered.recoveries[0]).toMatchObject({ cause: 'timeout', outcome: 'recovered' });
    const second = await project();
    boundaries.get(second.root)!.lifecycle(false); boundaries.get(second.root)!.expectBranches(0);
    const failedConfig = configuration(second);
    const failed = await readinessLifecycle(second.root, port(failedConfig, { verdict: 'fail', provider: { status: 'completed',
      summary: { checks: { 'configured-tests': { status: 'fail' } } } } }).adapter);
    expect(failed.snapshot.state).toBe('failed');
    expect(failed.failures).toMatchObject([{ step: 'configured-full-audit', recovery: null, final: true }]);
    expect(failed.recoveries).toEqual([]);
  }, 120_000);

  test('RunService records a failed Ramify restart and performs no audit', async () => {
    const fixture = await project();
    boundaries.get(fixture.root)!.lifecycle(false); boundaries.get(fixture.root)!.expectBranches(0);
    boundaries.get(fixture.root)!.failRestart();
    const config = configuration(fixture);
    const configured = port(config, undefined, 0);
    const result = await readinessLifecycle(fixture.root, configured.adapter);
    expect(result.snapshot.state).toBe('failed');
    expect(result.failures).toMatchObject([{ step: 'ramify-daemon', recovery: 'rec-0001', final: true }]);
    expect(result.recoveries).toMatchObject([{ cause: 'daemon-unavailable', action: 'restart-daemon', outcome: 'failed', attempt: 1 }]);
    expect(configured.calls).not.toContain(`full:${fixture.head}`);
  }, 120_000);

  test('RunService stop aborts active readiness, records the cancelled attempt, and waits for provider settlement before job-stopped', async () => {
    const fixture = await project();
    const config = configuration(fixture);
    boundaries.get(fixture.root)!.lifecycle(false); boundaries.get(fixture.root)!.expectBranches(0);
    const base = port(config, undefined, 0).adapter;
    let entered = false;
    let aborted = false;
    let release!: () => void;
    const processSettled = new Promise<void>(resolve => { release = resolve; });
    const configured: ConfiguredAuditPort = { read: base.read, async run(input) {
      entered = true;
      await new Promise<void>(resolve => {
        if (input.signal?.aborted) { aborted = true; resolve(); }
        else input.signal?.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true });
      });
      await processSettled;
      return cancelledResult(input);
    } };
    const strict = strictReadinessAudit(configured, fixture.root, config, ['ga-0001']); checks.push(strict.assertComplete);
    const { service } = await openRuns(fixture.root, { ...boundaries.get(fixture.root)!.options,
      script: [{ kind: 'submit', input: emptyAnalysis() }], configuredAudit: strict.adapter });
    cleanups.push(() => service.close());
    cleanups.push(async () => { release(); });
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
    expect(boundaries.get(fixture.root)!.branch()).toBe('main');
    expect(onlyRun(service, 'review-notes').state).toBe('stopped');
  }, 120_000);

  test('closing during readiness aborts and waits for settlement without writing a terminal event', async () => {
    const fixture = await project();
    const config = configuration(fixture);
    boundaries.get(fixture.root)!.lifecycle(false); boundaries.get(fixture.root)!.expectBranches(0);
    const base = port(config, undefined, 0).adapter;
    let entered = false;
    let aborted = false;
    let release!: () => void;
    const processSettled = new Promise<void>(resolve => { release = resolve; });
    const configured: ConfiguredAuditPort = { read: base.read, async run(input) {
      entered = true;
      await new Promise<void>(resolve => input.signal?.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true }));
      await processSettled;
      return cancelledResult(input);
    } };
    const strict = strictReadinessAudit(configured, fixture.root, config, ['ga-0001']); checks.push(strict.assertComplete);
    const { service } = await openRuns(fixture.root, { ...boundaries.get(fixture.root)!.options,
      script: [{ kind: 'submit', input: emptyAnalysis() }], configuredAudit: strict.adapter });
    cleanups.push(() => service.close());
    cleanups.push(async () => { release(); });
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
    expect(boundaries.get(fixture.root)!.branch()).toBe('main');
  }, 120_000);
});
