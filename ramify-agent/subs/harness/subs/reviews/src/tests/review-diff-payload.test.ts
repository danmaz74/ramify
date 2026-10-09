import { describe, expect, it } from 'vitest';
import type { TreeEntry } from '../../../evidence/src/git.js';
import { collectReviewDiffPayload } from '../diff-payload.js';
import type { CandidateSnapshot } from '../snapshot.js';
import { scratchCandidateReplies } from '../../../../src/tests/helpers/scratch-candidate-replies.js';

const root = '/scripted/project';

function snapshot(changes: CandidateSnapshot['changes'], entries?: readonly TreeEntry[]): CandidateSnapshot {
  const files = entries ?? changes.filter(change => change.status !== 'D')
    .map(change => ({ path: change.path, kind: 'file' as const, bytes: 1 }));
  return { base: 'fixed-base', commit: 'fixed-candidate', tree: 'fixed-tree', changes,
    entries: new Map(files.map(entry => [entry.path, entry])), directories: new Set(['', 'src']) };
}

function replies(patches: readonly { path: string; text: string }[], signal?: AbortSignal) {
  return scratchCandidateReplies(root, patches.map(patch => ({ operation: 'diffPatch' as const,
    args: [root, 'fixed-base', 'fixed-candidate', patch.path, signal], answer: patch.text })));
}

describe('precollected candidate review diffs', () => {
  it('delivers complete pinned patches, including deleted files and unusual filenames', async () => {
    const deleted = 'src/deleted.ts';
    const unusual = 'src/a\tb`file.ts';
    const addedPatch = 'diff --git "quoted filename"\n+```\n+é\n';
    const deletedPatch = '--- a/src/deleted.ts\n+++ /dev/null\n-removed\n';
    const script = replies([{ path: unusual, text: addedPatch }, { path: deleted, text: deletedPatch }]);
    const result = await collectReviewDiffPayload(snapshot([{ status: 'A', path: unusual }, { status: 'D', path: deleted }]), script.candidates, root);
    expect(result.mode).toBe('inline');
    expect(result.inlinePaths).toEqual([unusual, deleted]);
    expect(result.bytes).toBe(Buffer.byteLength(addedPatch + deletedPatch));
    expect(result.text).toContain(addedPatch + deletedPatch);
    expect(result.text).toContain('````diff');
    expect(result.text).toContain('Base: fixed-base; candidate: fixed-candidate.');
    script.assertComplete();
  });

  it.each([{ budget: 4, mode: 'inline' }, { budget: 3, mode: 'summary' }] as const)(
    'counts UTF-8 bytes at the exact $budget-byte boundary', async ({ budget, mode }) => {
      const script = replies([{ path: 'src/a.ts', text: 'éé' }]);
      const result = await collectReviewDiffPayload(snapshot([{ status: 'M', path: 'src/a.ts' }]), script.candidates, root, undefined, { inlineBudgetBytes: budget });
      expect(result.bytes).toBe(4);
      expect(result.mode).toBe(mode);
      expect(result.inlinePaths).toEqual(mode === 'inline' ? ['src/a.ts'] : []);
      if (mode === 'summary') expect(result.text).not.toContain('éé');
      script.assertComplete();
    },
  );

  it('bounds a large diff summary, names its omissions and retains pinned per-file fallback', async () => {
    const changes = [{ status: 'M', path: 'src/a.ts' }, { status: 'D', path: 'src/b.ts' }, { status: 'A', path: 'src/c.ts' }];
    const script = replies([{ path: 'src/a.ts', text: 'src/a.ts: private-patch-body\n' }]);
    const result = await collectReviewDiffPayload(snapshot(changes), script.candidates, root, undefined, { inlineBudgetBytes: 1, summaryMaxFiles: 2 });
    expect(result.inlinePaths).toEqual([]);
    expect(result.text).toContain('M\t"src/a.ts"');
    expect(result.text).toContain('D\t"src/b.ts"');
    expect(result.text).toContain('(+1 more changed paths omitted)');
    expect(result.text).not.toContain('src/c.ts');
    expect(result.text).not.toContain('private-patch-body');
    expect(result.text).toContain('does not count as inspection evidence');
    expect(result.text).toContain('snapshot_diff and a path');
    expect(result.text).toContain('same fixed base and candidate');
    script.assertComplete();
  });

  it('stops acquiring patches once the budget is crossed while retaining later names and denials', async () => {
    const changes = [
      { status: 'M', path: 'src/a.ts' }, { status: 'M', path: 'src/b.ts' },
      ...Array.from({ length: 100 }, (_, index) => ({ status: 'M', path: `src/later-${index}.ts` })),
      { status: 'D', path: '.ramify-architect/a.json' },
    ];
    const script = replies([{ path: 'src/a.ts', text: 'aaaa' }, { path: 'src/b.ts', text: 'bbbb' }]);
    const result = await collectReviewDiffPayload(snapshot(changes), script.candidates, root, undefined, { inlineBudgetBytes: 6 });
    expect(result.mode).toBe('summary');
    expect(result.inlinePaths).toEqual([]);
    expect(result.bytes).toBe(8);
    expect(result.text).toContain('Collected patches exceed the 6-byte inline budget');
    expect(result.text).toContain('may be less than the full diff size');
    expect(result.text).toContain('src/later-99.ts');
    expect(result.text).toContain('generated view');
    expect(result.text).toContain('snapshot_diff and a path');
    script.assertComplete();
  });

  it('refuses generated views, outside paths, metadata, submodules and symlinks before collection', async () => {
    const paths = ['.ramify-architect/a.json', 'src/.ramify/a.json', '../outside.ts', '/absolute.ts', '.git/config', 'linked/a.ts', 'vendor/a.ts'];
    const files: TreeEntry[] = [{ path: 'linked', kind: 'symlink', bytes: 8 }, { path: 'vendor', kind: 'submodule', bytes: null }];
    const script = replies([]);
    const result = await collectReviewDiffPayload(snapshot(paths.map(path => ({ status: 'D', path })), files), script.candidates, root);
    expect(result.inlinePaths).toEqual([]);
    expect(result.bytes).toBe(0);
    expect(result.text).toContain('Patches unavailable for automatic delivery');
    expect(result.text).toContain('generated view');
    expect(result.text).toContain('symbolic link');
    expect(result.text).toContain('submodule');
    script.assertComplete();
  });

  it('never qualifies empty or whitespace-only patches as inspected', async () => {
    const script = replies([{ path: 'src/a.ts', text: '' }, { path: 'src/b.ts', text: ' \n' }]);
    const result = await collectReviewDiffPayload(snapshot([{ status: 'M', path: 'src/a.ts' }, { status: 'M', path: 'src/b.ts' }]), script.candidates, root);
    expect(result.inlinePaths).toEqual([]);
    expect(result.text).toContain('(no available patches)');
    expect(result.text).toContain('source returned an empty patch');
    script.assertComplete();
  });

  it('forwards cancellation to the candidate source and refuses already aborted collection', async () => {
    const controller = new AbortController();
    const script = replies([{ path: 'src/a.ts', text: '+changed\n' }], controller.signal);
    const candidate = snapshot([{ status: 'M', path: 'src/a.ts' }]);
    await collectReviewDiffPayload(candidate, script.candidates, root, controller.signal);
    script.assertComplete();
    controller.abort(new Error('stopped'));
    const empty = replies([]);
    await expect(collectReviewDiffPayload(candidate, empty.candidates, root, controller.signal)).rejects.toThrow('stopped');
    empty.assertComplete();
  });
});
