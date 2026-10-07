import { expect } from 'vitest';
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
 * configured audit results in lifecycle-only cases.
 *
 * A converted file installs the process guard itself, because `vi.mock` is
 * hoisted and belongs to the whole file:
 *
 * ```ts
 * vi.mock('node:child_process', async original =>
 *   (await import('./helpers/process-guard.js')).guardedChildProcess(await original()));
 * ```
 */

export interface FakedRuns extends Awaited<ReturnType<typeof openRuns>> {
  /** The command line the run asked, which started no process. */
  readonly ramify: FakeRamifyCli;
  /** The Git this scenario scripted, and what the run asked it. */
  readonly git: ScriptedGit;
}

/**
 * Opens a run service over a fixture whose Git, command line and configured
 * audit are answered rather than run.
 */
export async function openRunsWithoutProcesses(
  root: string,
  git: ScriptedGit,
  options: Omit<OpenRunsOptions, 'git'> = {},
): Promise<FakedRuns> {
  const ramify = new FakeRamifyCli();
  const opened = await openRuns(root, { ramify, git, ...options });
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
