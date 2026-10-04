import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { runSingleSession } from '../sessions/single.js';
import { declaredModuleDirectories } from '../run/project-config.js';
import { copyFixture } from './helpers/fixture.js';
import { readDeclaredTree, unsuitableScope } from './helpers/iterations.js';
import { directReadinessExecution } from './helpers/external-tools.js';
import { createMappedCheckExecution } from './helpers/direct-check-execution.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { mockGit, type ScratchGitScript } from './helpers/mock-git.js';
import { scriptedGit, type ScriptedGit } from './helpers/scripted-git.js';
import { assertUnchangedGit, openUnchangedRuns } from './helpers/unchanged-run.js';
import { emptyAnalysis, freeze, installTestRunner, onlyRun, openRuns, runEventsOnDisk, staleCrashLock, startRun, testPolicy, until } from './helpers/runs.js';
import type { RunWrite } from '../run/service.js';

const plan = 'review-notes';
const source = 'source-before-setup';
const setupCommit = 'scratch-setup-commit';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  assertUnchangedGit();
});

async function project(rule = false): Promise<string> {
  const fixture = await copyFixture({ scratchRule: rule });
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  return fixture.root;
}

async function scratch(root: string, options: { tracked?: readonly (readonly string[])[]; ignored?: boolean; source?: string; line?: number } = {}): Promise<ScratchGitScript> {
  const paths = (await declaredModuleDirectories(root)).map(dir => dir === '' ? 'src/tmp/' : `${dir}/src/tmp/`).sort();
  return {
    trackedPaths: options.tracked ?? [[], []],
    ignoreStatus: [paths.map(path => ({ path, ignored: options.ignored ?? true,
      rule: options.source === undefined ? { source: '.gitignore', line: 1, pattern: '**/src/tmp/' }
        : { source: options.source, line: options.line ?? 1, pattern: '!tmp/' } }))],
  };
}

async function successfulRun(root: string, inputs: { scratch: ScratchGitScript; setup: boolean }) {
  const opened = await openUnchangedRuns(root, {
    scratchGit: 'provided',
    script: [{ kind: 'submit', input: emptyAnalysis() }],
    unchangedCheckpoints: [
      ...(inputs.setup ? [{ subject: 'Prepare module scratch ignore rule', commit: setupCommit,
        changes: [{ status: 'M', path: '.gitignore' }] }] : []),
      `final verification of plan "${plan}"`,
    ],
    gitScript: { scratch: inputs.scratch, ...(inputs.setup ? { setupChanges: [{ status: 'M', path: '.gitignore' }] } : {}) },
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun(plan));
  await opened.service.settled(plan, receipt.jobId);
  return { ...opened, receipt, events: await runEventsOnDisk(root, plan, receipt.jobId) };
}

async function failedRun(root: string, git: ScriptedGit) {
  const opened = await openRuns(root, { git, scratchGit: 'provided', script: [{ kind: 'submit', input: emptyAnalysis() }],
    readinessExecution: directReadinessExecution() });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun(plan));
  await opened.service.settled(plan, receipt.jobId);
  return { ...opened, receipt, events: await runEventsOnDisk(root, plan, receipt.jobId) };
}

describe('scratch setup before a run uses it', () => {
  test('commits only the appended rule, once, before any work', async () => {
    const root = await project();
    const result = await successfulRun(root, { scratch: await scratch(root), setup: true });
    expect(onlyRun(result.service, plan).state).toBe('completed');
    expect(result.git.commits().filter(entry => entry.message.includes('Ramify-Scratch: setup'))).toHaveLength(1);
    expect(result.git.commits()[0]!.message).toContain(`Ramify-Run: ${result.receipt.jobId}`);
    expect(result.events.find(event => event.type === 'scratch-setup-complete')?.data).toEqual({ commit: setupCommit, appended: true });
    expect((await readFile(join(root, '.gitignore'), 'utf8')).split('\n').filter(line => line === '**/src/tmp/')).toHaveLength(1);
  });

  test('an existing effective rule makes no setup commit', async () => {
    const root = await project(true);
    const result = await successfulRun(root, { scratch: await scratch(root), setup: false });
    expect(onlyRun(result.service, plan).state).toBe('completed');
    expect(result.events.find(event => event.type === 'scratch-setup-complete')?.data).toEqual({ commit: null, appended: false });
    expect(result.git.commits()).toEqual([]);
  });

  test('a root-only project with only /src/tmp/ still receives the general rule', async () => {
    const root = await project();
    await rm(join(root, 'subs'), { recursive: true, force: true });
    const configuration = JSON.parse(await readFile(join(root, 'ramify-agent.json'), 'utf8')) as { acceptance: { support: string[] } };
    configuration.acceptance.support = [];
    await writeFile(join(root, 'ramify-agent.json'), `${JSON.stringify(configuration)}\n`);
    await writeFile(join(root, '.gitignore'), '/src/tmp/\n');
    const result = await successfulRun(root, { scratch: await scratch(root), setup: true });
    expect(onlyRun(result.service, plan).state).toBe('completed');
    expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('/src/tmp/\n**/src/tmp/\n');
  });

  test('tracked scratch blocks readiness before deleting any file', async () => {
    const root = await project();
    await mkdir(join(root, 'src/tmp'), { recursive: true });
    await writeFile(join(root, 'src/tmp/kept.txt'), 'tracked\n');
    await writeFile(join(root, 'src/tmp/other.txt'), 'untracked\n');
    const git = scriptedGit(root, { head: source, checkpoints: [], scratch: { trackedPaths: [['src/tmp/kept.txt']] } });
    const result = await failedRun(root, git);
    expect(onlyRun(result.service, plan).state).toBe('failed');
    expect(result.events.find(event => event.type === 'readiness-failed')?.data).toMatchObject({ step: 'scratch-cleanup' });
    expect(await readFile(join(root, 'src/tmp/kept.txt'), 'utf8')).toBe('tracked\n');
    expect(await readFile(join(root, 'src/tmp/other.txt'), 'utf8')).toBe('untracked\n');
    git.assertComplete();
  });

  test('newly staged scratch is treated as tracked and is preserved with surrounding files', async () => {
    const root = await project();
    await mkdir(join(root, 'src/tmp'), { recursive: true });
    await writeFile(join(root, 'src/tmp/staged.txt'), 'staged\n');
    await writeFile(join(root, 'src/tmp/other.txt'), 'untracked\n');
    const git = scriptedGit(root, { head: source, checkpoints: [], scratch: { trackedPaths: [['src/tmp/staged.txt']] } });
    const result = await failedRun(root, git);
    expect(result.events.find(event => event.type === 'readiness-failed')?.data.detail).toContain('src/tmp/staged.txt');
    expect(await readFile(join(root, 'src/tmp/staged.txt'), 'utf8')).toBe('staged\n');
    expect(await readFile(join(root, 'src/tmp/other.txt'), 'utf8')).toBe('untracked\n');
    git.assertComplete();
  });

  test('stale untracked scratch is removed before the clean-tree step', async () => {
    const root = await project(true);
    await mkdir(join(root, 'src/tmp'), { recursive: true });
    await writeFile(join(root, 'src/tmp/stale.txt'), 'stale\n');
    const result = await successfulRun(root, { scratch: await scratch(root), setup: false });
    expect(onlyRun(result.service, plan).state).toBe('completed');
    await expect(readFile(join(root, 'src/tmp/stale.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('a nested ignore override fails before work and restores the root ignore file', async () => {
    const root = await project();
    const before = await readFile(join(root, '.gitignore'));
    const git = scriptedGit(root, { head: source, checkpoints: [], scratch: await scratch(root, { ignored: false,
      source: 'subs/workspace/src/.gitignore', line: 3 }) });
    const result = await failedRun(root, git);
    expect(onlyRun(result.service, plan).state).toBe('failed');
    expect(result.events.find(event => event.type === 'job-failed')?.data.message).toContain('subs/workspace/src/.gitignore:3');
    expect(await readFile(join(root, '.gitignore'))).toEqual(before);
    git.assertComplete();
  });

  test('a later root ignore exception stops the run without a setup commit', async () => {
    const root = await project(true);
    await writeFile(join(root, '.gitignore'), `${await readFile(join(root, '.gitignore'), 'utf8')}!src/tmp/\n`);
    const before = await readFile(join(root, '.gitignore'));
    const git = scriptedGit(root, { head: source, checkpoints: [], scratch: await scratch(root, { ignored: false,
      source: '.gitignore', line: 17 }) });
    const result = await failedRun(root, git);
    expect(onlyRun(result.service, plan).state).toBe('failed');
    expect(result.events.find(event => event.type === 'job-failed')?.data.message).toContain('.gitignore:17');
    expect(await readFile(join(root, '.gitignore'))).toEqual(before);
    expect(git.commits()).toEqual([]);
    git.assertComplete();
  });

  test('an unrelated worktree change refuses the all-files setup commit and restores the rule', async () => {
    const root = await project();
    const before = await readFile(join(root, '.gitignore'));
    const git = scriptedGit(root, { head: source, checkpoints: [], scratch: await scratch(root),
      setupChanges: [{ status: 'M', path: '.gitignore' }, { status: 'M', path: 'src/other.ts' }] });
    const result = await failedRun(root, git);
    expect(result.events.find(event => event.type === 'job-failed')?.data.message).toContain('src/other.ts');
    expect(await readFile(join(root, '.gitignore'))).toEqual(before);
    expect(git.commits()).toEqual([]);
    git.assertComplete();
  });

  test('a failed baseline leaves no setup change and the next attempt passes clean-tree readiness', async () => {
    const root = await project(true);
    const before = await readFile(join(root, '.gitignore'));
    const answers = await scratch(root, { tracked: [[], [], [], []] });
    const git = scriptedGit(root, { head: source, checkpoints: [{ subject: `final verification of plan "${plan}"`, commit: null, changes: [] }],
      scratch: answers, previews: Array.from({ length: 3 }, () => ({ repositoryRoot: root, head: source, tree: 'a'.repeat(40) })) });
    let tests = 0;
    const readinessExecution = createMappedCheckExecution({ script: ({ check }) => check.kind === 'tests' && ++tests === 1
      ? { outcome: { kind: 'completed', exitCode: 1 } } : {} });
    const opened = await openRuns(root, { git, scratchGit: 'provided', script: [{ kind: 'submit', input: emptyAnalysis() }],
      readinessExecution });
    cleanups.push(() => opened.service.close());
    const first = await opened.service.execute(startRun(plan));
    await opened.service.settled(plan, first.jobId);
    expect(onlyRun(opened.service, plan).state).toBe('failed');
    expect(await readFile(join(root, '.gitignore'))).toEqual(before);
    const second = await opened.service.execute(startRun(plan));
    await opened.service.settled(plan, second.jobId);
    const events = await runEventsOnDisk(root, plan, second.jobId);
    const readiness = events.find(event => event.type === 'readiness-passed');
    expect(readiness).toBeDefined();
    git.assertComplete();
  });

  for (const boundary of ['scratch-rule-appended', 'scratch-committed'] as const satisfies readonly RunWrite[]) {
    test(`recovers one setup commit after interruption at ${boundary}`, async () => {
      const root = await project();
      const answers = await scratch(root);
      const git = scriptedGit(root, { head: source, checkpoints: [{ subject: 'Prepare module scratch ignore rule',
        commit: setupCommit, changes: [{ status: 'M', path: '.gitignore' }] }],
        setupChanges: [{ status: 'M', path: '.gitignore' }],
        recoveredScratch: [boundary === 'scratch-rule-appended' ? null : setupCommit],
        scratch: boundary === 'scratch-rule-appended'
          ? { ...answers, ignoreStatus: [...answers.ignoreStatus!, ...answers.ignoreStatus!] }
          : answers });
      let frozen = false;
      const first = await openRuns(root, { git, scratchGit: 'provided', script: [{ kind: 'submit', input: emptyAnalysis() }],
        readinessExecution: directReadinessExecution(), afterWrite: async write => {
          if (write === boundary) { frozen = true; await freeze(); }
        } });
      const receipt = await first.service.execute(startRun(plan));
      await until(() => frozen);
      await staleCrashLock(root);
      const restarted = await openRuns(root, { git, scratchGit: 'provided', readinessExecution: directReadinessExecution() });
      cleanups.push(() => restarted.service.close());
      expect(restarted.recovery.effects).toContain(`${plan}/${receipt.jobId}: the scratch ignore rule setup`);
      expect(git.commits().filter(entry => entry.message.includes('Ramify-Scratch: setup'))).toHaveLength(1);
      const events = await runEventsOnDisk(root, plan, receipt.jobId);
      expect(events.filter(event => event.type === 'scratch-setup-complete')).toHaveLength(1);
      expect(events.find(event => event.type === 'scratch-setup-complete')?.data).toEqual({ commit: setupCommit, appended: true });
      git.assertComplete();
    });
  }
});

describe('a single session prepares scratch without a commit', () => {
  async function session(root: string, answers: { tracked?: readonly string[]; ignored?: boolean } = {}) {
    const agent = createScriptedAgent([{ kind: 'submit', input: unsuitableScope('Nothing to change') }]);
    const git = mockGit({
      currentHead: async () => source,
      changedPaths: async () => ['.gitignore'],
      trackedPaths: async () => [...(answers.tracked ?? [])],
      ignoreStatus: async (_project, requested) => requested.map(path => ({ path, ignored: answers.ignored ?? true,
        rule: answers.ignored === false ? { source: 'src/.gitignore', line: 2, pattern: '!tmp/' } : null })),
    });
    const result = await runSingleSession({ projectRoot: root, module: 'collection-review', prompt: 'Inspect the root module.',
      agent, ramify: new FakeRamifyCli(), git, refresh: readDeclaredTree, policy: testPolicy(root) });
    return { result, agent, git };
  }

  test('leaves the appended rule uncommitted and attributes it to the harness', async () => {
    const root = await project();
    const { result, agent, git } = await session(root);
    expect(result.status).toBe('finished');
    if (result.status !== 'finished') return;
    expect(agent.sessions).toHaveLength(1);
    expect(result.summary.harnessChanged).toEqual(['.gitignore']);
    expect(result.summary.outsideScope).toEqual([]);
    expect(git.commitAccepted).not.toHaveBeenCalled();
  });

  test('refuses tracked scratch before the agent starts', async () => {
    const root = await project();
    await mkdir(join(root, 'src/tmp'), { recursive: true });
    await writeFile(join(root, 'src/tmp/kept.txt'), 'tracked\n');
    const { result, agent } = await session(root, { tracked: ['src/tmp/kept.txt'] });
    expect(result.status).toBe('not-started');
    expect(agent.sessions).toHaveLength(0);
    expect(await readFile(join(root, 'src/tmp/kept.txt'), 'utf8')).toBe('tracked\n');
  });

  test('refuses a nested override and restores the root ignore file', async () => {
    const root = await project();
    const before = await readFile(join(root, '.gitignore'));
    const { result, agent } = await session(root, { ignored: false });
    expect(result.status).toBe('not-started');
    expect(agent.sessions).toHaveLength(0);
    expect(await readFile(join(root, '.gitignore'))).toEqual(before);
  });

  test('refuses a later exception in the root ignore file before the agent starts', async () => {
    const root = await project(true);
    await writeFile(join(root, '.gitignore'), `${await readFile(join(root, '.gitignore'), 'utf8')}!src/tmp/\n`);
    const before = await readFile(join(root, '.gitignore'));
    const { result, agent } = await session(root, { ignored: false });
    expect(result.status).toBe('not-started');
    expect(agent.sessions).toHaveLength(0);
    expect(await readFile(join(root, '.gitignore'))).toEqual(before);
  });
});
