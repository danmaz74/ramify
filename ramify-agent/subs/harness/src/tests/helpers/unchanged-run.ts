import { directReadinessExecution } from './external-tools.js';
import { openRuns, type OpenRunsOptions } from './runs.js';
import { scriptedGit, type GitCheckpoint, type GitScript, type ScriptedGit } from './scripted-git.js';
import { scriptedCandidates } from './candidates.js';
import type { CandidateTreePreview } from '../../../subs/evidence/src/candidate-tree.js';

const scripts: ScriptedGit[] = [];

export interface UnchangedRunsOptions extends Omit<OpenRunsOptions, 'git'> {
  /** Explicit Git answers for harness setup; ordinary fixture runs need none. */
  readonly gitScript?: Partial<GitScript> | undefined;
  /**
   * Passing gate checkpoints in exact order; omission explicitly declares
   * none. A subject is a checkpoint over an unchanged tree; a checkpoint
   * stated in full, such as the harness's own `scenariosCommit`, answers
   * what it states.
   */
  readonly unchangedCheckpoints?: ReadonlyArray<string | GitCheckpoint> | undefined;
  /** Exact number of candidate observations in this stated finalization path. */
  readonly previewCount?: number | undefined;
}

const fixtureHead = 'unchanged-fixture-revision';
const fixtureTree = 'a'.repeat(40);
const checkpointOf = (checkpoint: string | GitCheckpoint): GitCheckpoint => typeof checkpoint === 'string'
  ? { subject: checkpoint, commit: null, changes: [] } : checkpoint;
function previewAnswers(root: string, checkpoints: readonly GitCheckpoint[], count: number): CandidateTreePreview[] {
  const final = checkpoints.findIndex(checkpoint => checkpoint.subject.startsWith('final verification'));
  if (count > 0 && final < 0) throw new Error('Candidate previews require an explicitly scripted final checkpoint');
  const before = checkpoints.slice(0, final).flatMap(checkpoint => checkpoint.commit ?? []).at(-1) ?? fixtureHead;
  const after = checkpoints[final]?.commit ?? before;
  return Array.from({ length: count }, (_, index) => ({ repositoryRoot: root,
    head: index === count - 1 && count >= 4 ? after : before, tree: fixtureTree }));
}

/** Explicit fixture for scenarios whose agents never change project source. */
export function unchangedGit(root: string, checkpoints: ReadonlyArray<string | GitCheckpoint> = [], previewCount = 0,
  script: Partial<GitScript> = {}): ScriptedGit {
  const stated = checkpoints.map(checkpointOf);
  const git = scriptedGit(root, {
    head: fixtureHead,
    checkpoints: stated,
    previews: previewAnswers(root, stated, previewCount),
    ...script,
  });
  scripts.push(git);
  return git;
}

export async function openUnchangedRuns(root: string, options: UnchangedRunsOptions = {}) {
  const { unchangedCheckpoints = [], previewCount, gitScript, ...runs } = options;
  const checkpoints = unchangedCheckpoints.map(checkpointOf);
  const final = checkpoints.findIndex(checkpoint => checkpoint.subject.startsWith('final verification'));
  const count = previewCount ?? (final < 0 ? 0 : 4);
  const git = unchangedGit(root, unchangedCheckpoints, count, gitScript);
  const before = checkpoints.slice(0, final).flatMap(checkpoint => checkpoint.commit ?? []).at(-1) ?? fixtureHead;
  const audited = final < 0 ? null : checkpoints[final]!.commit ?? before;
  const candidates = audited === null ? undefined : scriptedCandidates(root, {
    [audited]: { tree: fixtureTree, files: {}, base: before, changes: [] },
  });
  return { ...await openRuns(root, { git, readinessExecution: directReadinessExecution(),
    ...(candidates === undefined ? {} : { candidates }), ...runs }), git };
}

/** Check exact checkpoint consumption, including errors recorded as unavailable. */
export function assertUnchangedGit(): void {
  for (const git of scripts.splice(0)) git.assertComplete();
}
