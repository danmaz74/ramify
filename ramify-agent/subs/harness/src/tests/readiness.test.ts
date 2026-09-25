import { existsSync } from 'node:fs';
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
import { gitService } from '../../subs/evidence/src/git.js';
import { checkOutputPath, notRun, type CheckExecutionPort } from '../checks/execution.js';

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
async function readinessOf(root: string, options: Omit<Parameters<typeof openRuns>[1], 'git'>) {
  const { service } = await openRuns(root, { git: gitService, script: [{ kind: 'submit', input: emptyAnalysis() }], ...options });
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
    // The project declares no setup command, which is nothing to fail.
    expect(attempt.steps.filter(step => step.step.startsWith('baseline-') || step.step === 'acceptance-full').map(step => step.outcome))
      .toEqual(['passed', 'not-verified', 'not-verified', 'not-verified', 'not-verified', 'not-verified']);
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

describe('the project\'s declared setup', () => {
  /** The fixture's configuration with a setup command, and a test command that needs what it builds. */
  async function builtTarget(setup: readonly unknown[]): Promise<{ root: string; policy: (projectRoot: string) => ReturnType<typeof testPolicy> }> {
    const root = await target();
    const config = JSON.parse(await readFile(join(root, 'ramify-agent.json'), 'utf8')) as Record<string, unknown>;
    await writeFile(join(root, 'ramify-agent.json'), `${JSON.stringify({ ...config, setup }, null, 2)}\n`);
    await initRepository(root);
    return {
      root,
      policy: projectRoot => {
        const base = testPolicy(projectRoot);
        // The project's tests read the build output, which the repository ignores.
        const program = 'process.exit(require("fs").existsSync("dist/built.txt") ? 0 : 1)';
        return { ...base, commands: { ...base.commands, allTests: { ...base.commands.allTests, argv: [process.execPath, '-e', program] } } };
      },
    };
  }

  const build = 'const fs = require("fs"); fs.mkdirSync("dist", { recursive: true }); fs.writeFileSync("dist/built.txt", "built"); console.log("built dist/built.txt")';

  test('runs first, at the project root, so the baseline reads what it built, and is announced and recorded as a gate command', async () => {
    const { root, policy } = await builtTarget([{ name: 'build', command: [process.execPath, '-e', build] }]);

    const { snapshot, attempts, events, receipt } = await readinessOf(root, { policy });

    expect(snapshot.state).toBe('completed');
    const attempt = attempts[0]!;
    expect(attempt.verdict).toBe('passed');
    const step = attempt.steps.find(entry => entry.step === 'baseline-setup')!;
    expect(step.outcome).toBe('passed');
    expect(step.detail).toMatch(/^1 setup command passed: the setup command "build", `.+` in \d+ ms$/u);
    expect(step.gate).toBeDefined();
    const gate = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.gate(step.gate!)), 'utf8')) as { commands: Array<{ kind: string; name?: string; outcome: string; command: { cwd: string } }> };
    expect(gate.commands[0]).toMatchObject({ kind: 'setup', name: 'build', outcome: 'passed', command: { cwd: root } });
    const started = events.flatMap(event => (event.type === 'gate-command-started' && event.data.checkpoint === 'readiness' ? [event.data] : []));
    expect(started[0]).toMatchObject({ kind: 'setup', name: 'build', position: 1 });
    expect(started[1]).toMatchObject({ kind: 'tests', position: 2 });
  }, 180_000);

  test('a setup command that exits non-zero fails readiness at its own step with what it printed, and nothing after it runs', async () => {
    const failing = 'console.error("src/a.ts(1,1): error TS2304: Cannot find name \'x\'."); process.exit(2)';
    const { root, policy } = await builtTarget([{ name: 'build', command: [process.execPath, '-e', failing] }]);

    const { snapshot, failures, attempts, recoveries } = await readinessOf(root, { policy });

    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('readiness-failed');
    expect(snapshot.failure?.message).toContain('error TS2304');
    expect(failures).toEqual([expect.objectContaining({ step: 'baseline-setup', recovery: null, final: true })]);
    expect(recoveries).toHaveLength(0);
    const steps = attempts[0]!.steps;
    expect(steps.find(step => step.step === 'baseline-setup')).toMatchObject({ outcome: 'failed' });
    expect(steps.find(step => step.step === 'baseline-setup')!.detail).toMatch(/^the setup command "build": `.+` exited with 2; src\/a\.ts\(1,1\): error TS2304/u);
    // The baseline did not run: each of its steps says why, never that it selected nothing.
    for (const name of ['baseline-tests', 'baseline-type-check', 'baseline-ramify-check'] as const) {
      expect(steps.find(step => step.step === name)).toMatchObject({ outcome: 'not-verified' });
      expect(steps.find(step => step.step === name)!.detail).toContain('did not run, because a setup command before it did not pass');
    }
  }, 180_000);

  test('a setup command that installs where an audited gate links node_modules fails readiness before any command runs, with no recovery', async () => {
    const { root, policy } = await builtTarget([
      { name: 'install', command: ['npm', '--no-audit', 'ci'] },
      { name: 'build', command: [process.execPath, '-e', build] },
    ]);

    const { snapshot, failures, attempts, recoveries, events } = await readinessOf(root, { policy });

    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('readiness-failed');
    expect(failures).toEqual([expect.objectContaining({ step: 'baseline-setup', recovery: null, final: true })]);
    expect(recoveries).toHaveLength(0);
    const steps = attempts[0]!.steps;
    const setup = steps.find(step => step.step === 'baseline-setup')!;
    expect(setup.outcome).toBe('failed');
    expect(setup.gate).toBeUndefined();
    expect(setup.detail).toBe('the setup command "install": `npm --no-audit ci` runs `npm ci` in the project root, where every audited gate'
      + ' links the project\'s own `node_modules`; ramify-audit refuses to run it there, since the package manager would follow the link'
      + ' and change or empty the project\'s installation. The project\'s `setup` in ramify-agent.json must not install dependencies:'
      + ' the audited worktree already has the project\'s installed ones.');
    for (const name of ['baseline-tests', 'baseline-type-check', 'baseline-ramify-check', 'run-branch'] as const) {
      expect(steps.find(step => step.step === name)).toMatchObject({ outcome: 'not-verified', detail: 'not reached: baseline-setup did not pass' });
    }
    // Nothing ran: not the install, not the build.
    expect(events.some(event => event.type === 'gate-command-started')).toBe(false);
    expect(existsSync(join(root, 'dist'))).toBe(false);
  }, 180_000);

  test('an install ramify-audit refused through a linked node_modules fails readiness with its message, and no recovery reruns it', async () => {
    const { root, policy } = await builtTarget([{ name: 'build', command: [process.execPath, '-e', build] }]);
    const refusal = '`npm ci` changes node_modules, and node_modules -> /p/node_modules is a symbolic link.';
    // An execution that answers the setup command as ramify-audit's preparation refuses it.
    const refusing: CheckExecutionPort = {
      async run(checks, request) {
        const startedAt = new Date().toISOString();
        const commands = await Promise.all(checks.map(async (check, index) => {
          const outputFile = checkOutputPath(request.directory, index, check);
          await writeFile(outputFile, index === 0 ? refusal : '');
          if (index > 0) return notRun(check, outputFile, startedAt, 'setup-failed');
          return request.classify(check, {
            outcome: { kind: 'runner-error', error: { kind: 'setup-command-unsafe-with-linked-modules', message: refusal } },
            startedAt, elapsedMs: 0, stdout: refusal, stderr: '',
            output: { path: outputFile, bytes: Buffer.byteLength(refusal), truncated: false, tail: refusal },
          }, outputFile);
        }));
        return { commands, audited: null, evidence: null };
      },
    };

    const { snapshot, failures, attempts, recoveries } = await readinessOf(root, { policy, readinessExecution: refusing });

    expect(snapshot.state).toBe('failed');
    expect(failures).toEqual([expect.objectContaining({ step: 'baseline-setup', recovery: null, final: true })]);
    expect(recoveries).toHaveLength(0);
    const setup = attempts[0]!.steps.find(step => step.step === 'baseline-setup')!;
    expect(setup).toMatchObject({ outcome: 'not-verified' });
    expect(setup.detail).toContain(refusal);
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
    expect((await git(root, 'branch', '--list', 'ramify-agent-run/*')).trim()).toBe('');
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
      'baseline-setup', 'baseline-tests', 'baseline-type-check', 'baseline-ramify-check', 'baseline-acceptance', 'acceptance-full',
    ]);
    expect(attempt.steps.find(step => step.step === 'baseline-setup')).toMatchObject({ outcome: 'passed', detail: 'the project declares no setup command' });
  }, 180_000);
});
