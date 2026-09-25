import { scriptedCandidates } from './candidates.js';

/** Explicit unchanged-tree finalization answers: preparation, pre-gate, commit, post-gate. */
export function finalCandidate(root: string, before: string, after = before) {
  const tree = 'a'.repeat(40);
  return {
    previews: [before, before, before, after].map(head => ({ repositoryRoot: root, head, tree })),
    candidates: scriptedCandidates(root, { [after]: { tree, base: before, files: {}, changes: [] } }),
  };
}
