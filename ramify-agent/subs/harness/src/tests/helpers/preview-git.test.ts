import { describe, expect, it } from 'vitest';
import type { CandidateTreePreview } from '../../../subs/evidence/src/candidate-tree.js';
import { mockGit } from './mock-git.js';
import { scriptedGit } from './scripted-git.js';
import { scenarioGit } from './recovery-git.js';
import { gateGit } from './gate-git.js';
import { answeredGit } from './contracts-git.js';

const root = '/fixture/project';
const preview: CandidateTreePreview = { repositoryRoot: root, head: 'source-01', tree: 'tree-01' };

describe('scripted candidate tree previews', () => {
  it('refuses an unscripted call at the strict mock boundary', async () => {
    const git = mockGit();
    await expect(git.previewCandidateTree(root)).rejects.toThrow('No Git response scripted for previewCandidateTree');
    expect(git.unexpected).toEqual(['previewCandidateTree']);
  });

  it('consumes explicit previews in lifecycle order and refuses extras', async () => {
    const git = scriptedGit(root, { head: preview.head, checkpoints: [], previews: [preview] });
    expect(await git.previewCandidateTree(root)).toEqual(preview);
    git.assertComplete();
    await expect(git.previewCandidateTree(root)).rejects.toThrow('no additional tree preview was scripted');
  });

  it('requires every stated preview to be used', () => {
    const git = scriptedGit(root, { head: preview.head, checkpoints: [], previews: [preview] });
    expect(() => git.assertComplete()).toThrow();
  });

  it('requires explicit previews in gate, recovery, and contract Git scripts', async () => {
    const gate = gateGit(root, { head: preview.head, commits: [], previews: [preview] });
    expect(await gate.git.previewCandidateTree(root)).toEqual(preview);
    gate.assertComplete();
    await expect(gate.git.previewCandidateTree(root)).rejects.toThrow('tree preview 2');

    const recovery = scenarioGit(root, { head: preview.head, commits: [], previews: [preview] });
    expect(await recovery.previewCandidateTree(root)).toEqual(preview);
    recovery.assertComplete();
    await expect(recovery.previewCandidateTree(root)).rejects.toThrow('tree preview 2');

    const contracts = answeredGit(root, { head: preview.head, commits: [], previews: [preview] });
    expect(await contracts.previewCandidateTree(root)).toEqual(preview);
    contracts.assertAnswered();
    await expect(contracts.previewCandidateTree(root)).rejects.toThrow('no additional tree preview was scripted');
  });
});
