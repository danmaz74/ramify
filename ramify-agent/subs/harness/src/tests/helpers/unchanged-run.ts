import { directReadinessExecution } from './external-tools.js';
import { openRuns, type OpenRunsOptions } from './runs.js';
import { scriptedGit, type GitCheckpoint, type ScriptedGit } from './scripted-git.js';

const scripts: ScriptedGit[] = [];

export interface UnchangedRunsOptions extends Omit<OpenRunsOptions, 'git'> {
  /**
   * Passing gate checkpoints in exact order; omission explicitly declares
   * none. A subject is a checkpoint over an unchanged tree; a checkpoint
   * stated in full, such as the harness's own `scenariosCommit`, answers
   * what it states.
   */
  readonly unchangedCheckpoints?: ReadonlyArray<string | GitCheckpoint> | undefined;
}

/** Explicit fixture for scenarios whose agents never change project source. */
export function unchangedGit(root: string, checkpoints: ReadonlyArray<string | GitCheckpoint> = []): ScriptedGit {
  const head = 'unchanged-fixture-revision';
  const git = scriptedGit(root, {
    head,
    checkpoints: checkpoints.map(checkpoint => (typeof checkpoint === 'string' ? { subject: checkpoint, commit: null, changes: [] } : checkpoint)),
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
