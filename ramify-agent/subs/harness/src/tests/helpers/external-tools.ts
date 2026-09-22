import { expect } from 'vitest';
import type { CheckExecutionPort } from '../../checks/execution.js';
import { createPassingCheckExecution } from './direct-check-execution.js';
import { FakeRamifyCli } from './fake-ramify.js';
import { spawnAttempts, resetSpawnAttempts } from './process-guard.js';
import type { ScriptedGit } from './scripted-git.js';
import { openRuns, type OpenRunsOptions } from './runs.js';

/*
 * The entrypoint of a run scenario that needs no external tool.
 *
 * What stays real: the fixture's files, every write the port's built-ins
 * make, the write guard, the state machine, the ledger, and the gate's own
 * classification of each command result. What is answered instead of run:
 * Git, which is scripted by the scenario, the Ramify command line, and the
 * commands readiness would spawn.
 *
 * A converted file installs the process guard itself, because `vi.mock` is
 * hoisted and belongs to the whole file:
 *
 * ```ts
 * vi.mock('node:child_process', async original =>
 *   (await import('./helpers/process-guard.js')).guardedChildProcess(await original()));
 * ```
 */

/**
 * Readiness commands, answered directly.
 *
 * Readiness's own executor answers no audit identity and no evidence, and a
 * test's readiness must not invent either, so the direct executor's audit
 * fields are dropped rather than recorded as a test-only audit.
 */
export function directReadinessExecution(): CheckExecutionPort {
  const direct = createPassingCheckExecution();
  return {
    async run(checks, request) {
      const result = await direct.run(checks, request);
      return { commands: result.commands, audited: null, evidence: null };
    },
  };
}

export interface FakedRuns extends Awaited<ReturnType<typeof openRuns>> {
  /** The command line the run asked, which started no process. */
  readonly ramify: FakeRamifyCli;
  /** The Git this scenario scripted, and what the run asked it. */
  readonly git: ScriptedGit;
}

/**
 * Opens a run service over a fixture whose Git, command line and readiness
 * commands are answered rather than run.
 */
export async function openRunsWithoutProcesses(
  root: string,
  git: ScriptedGit,
  options: Omit<OpenRunsOptions, 'git'> = {},
): Promise<FakedRuns> {
  const ramify = new FakeRamifyCli();
  const opened = await openRuns(root, { ramify, git, readinessExecution: directReadinessExecution(), ...options });
  return { ...opened, ramify, git };
}

/** Forgets every refused process, between tests. */
export function forgetExternalTools(): void {
  resetSpawnAttempts();
}

/**
 * States that the scenario started no process at all, naming what it tried
 * where it did. Call it after the run, before the fixture is removed.
 */
export function expectNoProcesses(): void {
  expect(spawnAttempts().map(attempt => `${attempt.api}: ${attempt.argv.join(' ')}`)).toEqual([]);
}
