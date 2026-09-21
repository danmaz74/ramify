import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { copyFixture } from './helpers/fixture.js';
import {
  emptyAnalysis, git, initRepository, installTestRunner, onlyRun, openRuns,
  runEventsOnDisk, runPath, startRun, testPolicy } from './helpers/runs.js';
import { runLayout, type InfrastructureRecovery, type ReadinessAttempt } from '../run/records.js';
import { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';

/*
 * Execution readiness, and the recoveries it is allowed. Missing
 * dependencies, a nonexistent command and a failing initial baseline are
 * three different things, and only the one a bounded preparation can repair
 * consumes a recovery attempt.
 *
 * Every fixture below is a temporary copy of the target project, mutated for
 * the one step it is about. The fixture project itself is never changed.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  return fixture.root;
}

async function counterDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'ramify-agent-counter-'));
  cleanups.push(() => rm(path, { recursive: true, force: true }));
  return path;
}

/** An independent nested package under the project, with or without its dependencies. */
async function addNestedPackage(root: string, directory: string, installed: boolean): Promise<void> {
  const path = join(root, directory);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, 'package.json'), `${JSON.stringify({ name: 'catalog-tools', private: true, scripts: { test: 'vitest run' } }, null, 2)}\n`);
  if (installed) await mkdir(join(path, 'node_modules'), { recursive: true });
}

/** Runs one run to its end and answers the last readiness attempt and its recovery. */
async function readinessOf(root: string, options: Parameters<typeof openRuns>[1]) {
  const { service } = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }], ...options });
  cleanups.push(() => service.close());
  const receipt = await service.execute(startRun('review-notes'));
  await service.settled('review-notes', receipt.jobId);

  const events = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
  const failures = events.flatMap(event => (event.type === 'readiness-failed' ? [event.data] : []));
  const attempts: ReadinessAttempt[] = [];
  for (let attempt = 1; attempt <= failures.length + events.filter(event => event.type === 'readiness-passed').length; attempt += 1) {
    attempts.push(JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.readiness(attempt)), 'utf8')) as ReadinessAttempt);
  }
  const recoveries: InfrastructureRecovery[] = [];
  for (const failure of failures) {
    if (failure.recovery === null) continue;
    recoveries.push(JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.recovery(failure.recovery)), 'utf8')) as InfrastructureRecovery);
  }
  return { service, receipt, events, failures, attempts, recoveries, snapshot: onlyRun(service, 'review-notes') };
}

describe('the three causes a readiness failure can have', () => {
  test('missing nested dependencies consume a recovery attempt, and the run continues when it repairs them', async () => {
    const root = await target();
    await addNestedPackage(root, 'subs/workspace/subs/catalog/tools', false);
    await initRepository(root);
    const directory = 'subs/workspace/subs/catalog/tools';

    const { snapshot, failures, attempts, recoveries } = await readinessOf(root, {
      policy: projectRoot => {
        const base = testPolicy(projectRoot, { nested: [{ directory, testScript: 'vitest run' }] });
        // A real install command, which really creates the directory the
        // recovery checks for. The next attempt then passes.
        const install = [
          'const fs = require("fs");',
          `fs.mkdirSync(${JSON.stringify(join(root, directory, 'node_modules'))}, { recursive: true });`,
        ].join('');
        return {
          ...base,
          commands: {
            ...base.commands,
            nestedPackages: base.commands.nestedPackages.map(entry => ({ ...entry, install: { ...entry.install, argv: [process.execPath, '-e', install] } })),
          },
        };
      },
    });

    expect(snapshot.state).toBe('completed');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ step: 'nested-packages', recovery: 'rec-0001', final: false });
    expect(recoveries).toHaveLength(1);
    expect(recoveries[0]).toMatchObject({ cause: 'infrastructure', action: 'reinstall-nested', outcome: 'recovered', attempt: 1 });
    expect(recoveries[0]!.subject).toEqual({ readiness: 1 });
    expect(attempts[0]!.recovery).toBe('rec-0001');
    expect(attempts[0]!.nested).toEqual([
      { directory, manifest: `${directory}/package.json`, installed: false, testScript: 'vitest run' },
    ]);
    expect(attempts[0]!.steps.find(step => step.step === 'nested-packages')!.detail).toContain('node_modules is missing');
    expect(attempts[1]!.verdict).toBe('passed');
  }, 180_000);

  test('a recovery that does not repair the failure ends the run at once, with the attempt it spent', async () => {
    const root = await target();
    await addNestedPackage(root, 'subs/workspace/subs/catalog/tools', false);
    await initRepository(root);

    const { snapshot, failures, recoveries } = await readinessOf(root, {
      // The install command exits 0 and creates nothing, so the package is
      // still not installed: the recovery reports what it established.
      policy: projectRoot => testPolicy(projectRoot, { nested: [{ directory: 'subs/workspace/subs/catalog/tools', testScript: 'vitest run' }] }),
    });

    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('readiness-failed');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ step: 'nested-packages', recovery: 'rec-0001', final: true });
    expect(recoveries[0]).toMatchObject({ action: 'reinstall-nested', outcome: 'failed', attempt: 1 });
  }, 180_000);

  test('a Ramify command line that does not answer is recovered by restarting the daemon, and the run ends when it still does not', async () => {
    // Added by iteration 12: the composition suite found that the recovery
    // readiness names for this step had no test that produced it.
    const root = await target();
    await initRepository(root);
    const directory = await counterDirectory();
    const executable = join(directory, 'ramify');
    await writeFile(executable, '#!/bin/sh\necho "the daemon endpoint is not answering" >&2\nexit 1\n');
    await chmod(executable, 0o755);

    const { snapshot, failures, attempts, recoveries } = await readinessOf(root, { ramify: new RamifyCli({ executable, timeoutMs: 30_000 }) });

    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('readiness-failed');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ step: 'ramify-daemon', recovery: 'rec-0001', final: true });
    expect(attempts[0]!.steps.find(step => step.step === 'ramify-daemon')).toMatchObject({ outcome: 'failed' });
    // Nothing after the failing step ran: the baseline was never attempted.
    expect(attempts[0]!.steps.find(step => step.step === 'baseline-tests')?.outcome).toBe('not-verified');
    expect(recoveries[0]).toMatchObject({ cause: 'daemon-unavailable', action: 'restart-daemon', outcome: 'failed', attempt: 1 });
    expect(recoveries[0]!.evidence).toEqual(['ramify --version exited with 1']);
  }, 180_000);

  test('a failure that keeps recurring ends the run once the bounded recoveries are spent', async () => {
    const root = await target();
    await initRepository(root);

    const { snapshot, failures, attempts, recoveries } = await readinessOf(root, {
      // The test command never answers, so every attempt times out and every
      // recovery is the rerun the next attempt makes.
      policy: projectRoot => testPolicy(projectRoot, { timingOut: 'allTests' }),
    });

    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('readiness-failed');
    expect(failures).toHaveLength(3);
    expect(failures.map(failure => failure.recovery)).toEqual(['rec-0001', 'rec-0002', null]);
    expect(failures.at(-1)!.final).toBe(true);
    expect(recoveries.map(recovery => recovery.attempt)).toEqual([1, 2]);
    expect(recoveries.every(recovery => recovery.cause === 'timeout' && recovery.action === 'rerun-command')).toBe(true);
    expect(attempts).toHaveLength(3);
    expect(attempts.at(-1)!.steps.find(step => step.step === 'baseline-tests')!.detail).toContain('not verified (timeout)');
  }, 180_000);

  test('a nonexistent command is a readiness failure that consumes no recovery attempt', async () => {
    const root = await target();
    await initRepository(root);

    const { snapshot, failures, attempts, recoveries } = await readinessOf(root, {
      policy: projectRoot => testPolicy(projectRoot, { missingCommand: 'typeCheck' }),
    });

    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('readiness-failed');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ step: 'baseline-tests', recovery: null, final: true });
    expect(recoveries).toHaveLength(0);
    expect(attempts).toHaveLength(1);
    // Nothing ran: the attempt could not run what the checkpoint requires.
    const attempt = attempts[0]!;
    expect(attempt.steps.filter(step => step.step.startsWith('baseline-')).map(step => step.outcome)).toEqual(['not-verified', 'not-verified', 'not-verified']);
    expect(attempt.steps.find(step => step.step === 'baseline-type-check')!.detail).toContain('command-missing');
  }, 180_000);

  test('a failing initial baseline is a readiness failure that consumes no recovery attempt', async () => {
    const root = await target();
    await initRepository(root);

    const { snapshot, failures, attempts, recoveries } = await readinessOf(root, {
      policy: projectRoot => testPolicy(projectRoot, { failing: 'allTests' }),
    });

    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('readiness-failed');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ step: 'baseline-tests', recovery: null, final: true });
    expect(recoveries).toHaveLength(0);
    expect(attempts[0]!.steps.find(step => step.step === 'baseline-tests')).toMatchObject({ outcome: 'failed' });
    expect(attempts[0]!.steps.find(step => step.step === 'baseline-tests')!.detail).toContain('exited with 1');
    // The project's own failing test is not a code-repair assignment: no
    // invocation follows, and the run ends.
    expect(snapshot.counts.invocations).toBe(1);
  }, 180_000);

  test('a timed-out baseline is recoverable, and the rerun passes', async () => {
    const root = await target();
    await initRepository(root);
    const counter = join(await counterDirectory(), 'tests-run');

    const { snapshot, failures, recoveries } = await readinessOf(root, {
      policy: projectRoot => {
        const base = testPolicy(projectRoot);
        // The first run never answers within its bound; the second exits 0.
        const program = [
          'const fs = require("fs");',
          `const p = ${JSON.stringify(counter)};`,
          'const n = (fs.existsSync(p) ? Number(fs.readFileSync(p, "utf8")) : 0) + 1;',
          'fs.writeFileSync(p, String(n));',
          'if (n === 1) setTimeout(() => undefined, 60000); else process.exit(0);',
        ].join('');
        return { ...base, commands: { ...base.commands, allTests: { ...base.commands.allTests, argv: [process.execPath, '-e', program], timeoutMs: 700 } } };
      },
    });

    expect(snapshot.state).toBe('completed');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ step: 'baseline-tests', recovery: 'rec-0001', final: false });
    expect(recoveries[0]).toMatchObject({ cause: 'timeout', action: 'rerun-command', outcome: 'recovered', attempt: 1 });
  }, 180_000);
});

describe('the structural steps', () => {
  test('a dirty working tree is refused with the step git-clean, and no branch is created', async () => {
    const root = await target();
    await initRepository(root);
    await writeFile(join(root, 'src', 'uncommitted.ts'), 'export const x = 1;\n');

    const { snapshot, failures } = await readinessOf(root, {});
    expect(snapshot.state).toBe('failed');
    expect(failures[0]).toMatchObject({ step: 'git-clean', recovery: null, final: true });
    expect(failures[0]!.detail).toContain('uncommitted changes');
    expect((await git(root, 'branch', '--list', 'ramify-agent/run-*')).trim()).toBe('');
  }, 180_000);

  test('a directory that is no git repository is refused with the same step', async () => {
    const root = await target();
    const { failures } = await readinessOf(root, {});
    expect(failures[0]).toMatchObject({ step: 'git-clean', recovery: null, final: true });
    expect(failures[0]!.detail).toContain('not a git repository');
  }, 180_000);

  test('a project without the test runner installed is refused before any command runs', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await initRepository(fixture.root);

    const { failures, attempts } = await readinessOf(fixture.root, {});
    expect(failures[0]).toMatchObject({ step: 'test-runner', recovery: null, final: true });
    expect(attempts[0]!.steps.filter(step => step.step.startsWith('baseline-')).every(step => step.detail.startsWith('not reached'))).toBe(true);
  }, 180_000);

  test('a passing attempt records every step it verified, and the nested packages it found', async () => {
    const root = await target();
    await addNestedPackage(root, 'subs/workspace/subs/catalog/tools', true);
    await initRepository(root);

    const { snapshot, attempts } = await readinessOf(root, {
      policy: projectRoot => testPolicy(projectRoot, { nested: [{ directory: 'subs/workspace/subs/catalog/tools', testScript: 'vitest run' }] }),
    });
    expect(snapshot.state).toBe('completed');
    const attempt = attempts[0]!;
    expect(attempt.verdict).toBe('passed');
    expect(attempt.nested).toEqual([
      { directory: 'subs/workspace/subs/catalog/tools', manifest: 'subs/workspace/subs/catalog/tools/package.json', installed: true, testScript: 'vitest run' },
    ]);
    expect(attempt.steps.find(step => step.step === 'test-discovery')!.detail).toMatch(/^\d+ test files discovered/);
    expect(attempt.steps.find(step => step.step === 'ramify-daemon')!.detail).toContain('answers');
    expect(attempt.steps.filter(step => step.gate !== undefined).map(step => step.step)).toEqual([
      'baseline-tests', 'baseline-type-check', 'baseline-ramify-check',
    ]);
  }, 180_000);
});
