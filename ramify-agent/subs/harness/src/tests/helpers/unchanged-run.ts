import { directReadinessExecution } from './external-tools.js';
import { openRuns, type OpenRunsOptions } from './runs.js';
import { scriptedGit, type ScriptedGit } from './scripted-git.js';

const scripts: ScriptedGit[] = [];

export interface UnchangedRunsOptions extends Omit<OpenRunsOptions, 'git'> {
  /** Passing gate checkpoints in exact order; omission explicitly declares none. */
  readonly unchangedCheckpoints?: readonly string[] | undefined;
}

/** Explicit fixture for scenarios whose agents never change project source. */
export function unchangedGit(root: string, checkpoints: readonly string[] = []): ScriptedGit {
  const head = 'unchanged-fixture-revision';
  const git = scriptedGit(root, {
    head,
    checkpoints: checkpoints.map(subject => ({ subject, commit: null, changes: [] })),
  });
  scripts.push(git);
  return git;
}

export async function openUnchangedRuns(root: string, options: UnchangedRunsOptions = {}) {
  const { unchangedCheckpoints = [], ...runs } = options;
  const git = unchangedGit(root, unchangedCheckpoints);
  return { ...await openRuns(root, { git, readinessExecution: directReadinessExecution(), ...runs }), git };
}

/** Check exact checkpoint consumption, including errors recorded as unavailable. */
export function assertUnchangedGit(): void {
  for (const git of scripts.splice(0)) git.assertComplete();
}
