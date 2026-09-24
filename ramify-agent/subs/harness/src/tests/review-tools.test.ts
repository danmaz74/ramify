import { describe, expect, test } from 'vitest';
import { ReviewQueue } from '../reviews/scheduler.js';
import { openCandidateSnapshot, resolveSnapshotPath, snapshotToolNames, snapshotTools } from '../reviews/snapshot.js';
import { validateReview } from '../reviews/submission.js';
import { scriptedCandidates } from './helpers/candidates.js';

/*
 * The parts of a review that need no run: path resolution in a candidate,
 * the tools over it, the submission's rules against what the tools
 * answered, and the bounded queue of readers.
 */

const root = '/project';
const source = () => scriptedCandidates(root, {
  c1: {
    tree: 't1',
    base: 'c0',
    changes: [{ status: 'M', path: 'src/a.ts' }, { status: 'D', path: 'src/gone.ts' }, { status: 'A', path: 'src/b.ts' }],
    files: {
      'README.md': '# project\n',
      'src/a.ts': 'export const a = 1;\nexport const twice = 2;\n',
      'src/b.ts': 'export const b = 2;\n',
      'src/link': { symlink: '/etc' },
      'vendor/module': { symlink: '../..' },
    },
  },
});

async function snapshot() {
  const scripted = source();
  return { scripted, snapshot: await openCandidateSnapshot(scripted, root, { commit: 'c1', base: 'c0' }) };
}

describe('resolving a path in the audited candidate', () => {
  test('relative files and directories resolve; every way out is refused with its reason', async () => {
    const { snapshot: candidate } = await snapshot();
    expect(candidate).toMatchObject({ commit: 'c1', base: 'c0', tree: 't1' });
    expect(resolveSnapshotPath(candidate, 'src/a.ts')).toMatchObject({ ok: true, kind: 'file', path: 'src/a.ts' });
    expect(resolveSnapshotPath(candidate, './src/../src/a.ts')).toMatchObject({ ok: true, kind: 'file', path: 'src/a.ts' });
    expect(resolveSnapshotPath(candidate, 'src/')).toMatchObject({ ok: true, kind: 'directory', path: 'src' });
    expect(resolveSnapshotPath(candidate, '')).toMatchObject({ ok: true, kind: 'directory', path: '' });
    const denial = (path: unknown) => { const resolved = resolveSnapshotPath(candidate, path); return resolved.ok ? 'ok' : resolved.denial; };
    expect(denial('/project/src/a.ts')).toBe('absolute');
    expect(denial('~/secrets')).toBe('absolute');
    expect(denial('C:\\project\\src\\a.ts')).toBe('absolute');
    expect(denial('../outside')).toBe('outside');
    expect(denial('src/../../outside')).toBe('outside');
    expect(denial('.git/config')).toBe('repository');
    expect(denial('.ramify-architect/README.md')).toBe('live-view');
    expect(denial('src/.ramify/api.json')).toBe('live-view');
    expect(denial('src/link')).toBe('symlink');
    expect(denial('src/link/passwd')).toBe('symlink');
    expect(denial('vendor/module/src/a.ts')).toBe('symlink');
    expect(denial('src/gone.ts')).toBe('missing');
    expect(denial(42)).toBe('invalid');
    expect(denial('a\0b')).toBe('invalid');
  });

  test('the tools answer the candidate, record what they read, and refuse and record every escape', async () => {
    const { scripted, snapshot: candidate } = await snapshot();
    const tools = snapshotTools(candidate, scripted, root);
    const call = async (name: string, input: unknown) => tools.definitions.find(definition => definition.name === name)!.execute(input, new AbortController().signal);
    expect(tools.definitions.every(definition => definition.mutating === false)).toBe(true);
    expect(await call(snapshotToolNames.list, {})).toEqual({ text: 'README.md\nsrc/\nvendor/' });
    expect(await call(snapshotToolNames.list, { path: 'src' })).toEqual({ text: 'a.ts\nb.ts\nlink (symbolic link, not followed)' });
    expect(await call(snapshotToolNames.read, { path: 'src/a.ts', startLine: 2 })).toEqual({ text: '     2\texport const twice = 2;' });
    expect(await call(snapshotToolNames.read, { path: 'README.md' })).toEqual({ text: '     1\t# project' });
    expect(await call(snapshotToolNames.search, { pattern: 'const (a|b)' })).toEqual({ text: 'src/a.ts:1: export const a = 1;\nsrc/b.ts:1: export const b = 2;' });
    expect(await call(snapshotToolNames.diff, {})).toEqual({ text: 'M\tsrc/a.ts\nD\tsrc/gone.ts\nA\tsrc/b.ts' });
    expect((await call(snapshotToolNames.diff, { path: 'src/gone.ts' })).isError).toBeUndefined();
    expect(await call(snapshotToolNames.diff, { path: 'README.md' })).toMatchObject({ isError: true, text: expect.stringContaining('did not change') });
    expect(await call(snapshotToolNames.read, { path: '/etc/passwd' })).toMatchObject({ isError: true });
    expect(await call(snapshotToolNames.search, { pattern: 'x', path: 'src/link' })).toMatchObject({ isError: true });
    expect(await call(snapshotToolNames.read, { path: 'src/a.ts', extra: true })).toMatchObject({ isError: true, text: expect.stringContaining('Invalid input') });
    // Reading README.md, an unchanged file, inspects no changed path.
    expect([...tools.inspected()].sort()).toEqual(['src/a.ts', 'src/gone.ts']);
    expect(tools.denials()).toEqual([
      { tool: snapshotToolNames.diff, denial: 'missing', path: 'README.md' },
      { tool: snapshotToolNames.read, denial: 'absolute', path: '/etc/passwd' },
      { tool: snapshotToolNames.search, denial: 'symlink', path: 'src/link' },
    ]);
    expect(scripted.calls.filter(entry => entry.startsWith('readBlob'))).toEqual(['readBlob c1 src/a.ts', 'readBlob c1 README.md']);
  });
});

describe('a reviewer\'s submission', () => {
  const concern = (path: string) => ({
    summary: 's', consequence: 'c', rationale: 'r', uncertainty: 'u', remedy: 'm', locations: [{ path, startLine: 1, endLine: 2 }], suggests: null,
  });

  test('names every changed path once, inspects only what its tools answered, and points its concerns at the candidate', async () => {
    const { snapshot: candidate } = await snapshot();
    const inspected = new Set(['src/a.ts', 'src/gone.ts']);
    const evidence = { snapshot: candidate, inspected, maxConcerns: 2 };
    const clean = { inspected: ['src/a.ts', 'src/gone.ts'], missing: [{ path: 'src/b.ts', reason: 'out of time' }], concerns: [] };
    expect(validateReview(clean, evidence)).toEqual({ ok: true, value: clean });
    expect(validateReview({ ...clean, concerns: [concern('src/a.ts'), concern('src/gone.ts')] }, evidence)).toMatchObject({ ok: true });

    const errors = (input: unknown) => {
      const judged = validateReview(input, evidence);
      return judged.ok ? [] : judged.errors.map(error => `${error.path}: ${error.message}`);
    };
    expect(errors({ ...clean, inspected: ['src/a.ts', 'src/gone.ts', 'src/b.ts'], missing: [] }))
      .toEqual([expect.stringMatching(/^inspected\.2: "src\/b\.ts" is named inspected, and no snapshot_read or snapshot_diff call/u)]);
    expect(errors({ ...clean, missing: [] })).toEqual(['inspected: The changed path "src/b.ts" is named neither inspected nor missing']);
    expect(errors({ ...clean, inspected: ['src/a.ts', 'src/gone.ts', 'README.md'] }))
      .toEqual([expect.stringMatching(/^inspected\.2: "README\.md" is not a path the candidate changed/u)]);
    expect(errors({ ...clean, missing: [{ path: 'src/a.ts', reason: 'twice' }, { path: 'src/b.ts', reason: 'x' }] }))
      .toEqual(['missing.0.path: "src/a.ts" is already named at inspected.0']);
    expect(errors({ ...clean, concerns: [concern('/etc/passwd')] })).toEqual([expect.stringMatching(/^concerns\.0\.locations\.0\.path: .*absolute path/u)]);
    expect(errors({ ...clean, concerns: [concern('src')] })).toEqual(['concerns.0.locations.0.path: "src" is a directory']);
    expect(errors({ ...clean, concerns: [{ ...concern('src/a.ts'), locations: [{ path: 'src/a.ts', startLine: 5, endLine: 2 }] }] }))
      .toEqual(['concerns.0.locations.0.endLine: The range ends before it starts']);
    expect(errors({ ...clean, concerns: [concern('src/a.ts'), concern('src/a.ts'), concern('src/a.ts')] }))
      .toEqual(['concerns: The run\'s review policy accepts at most 2 concerns in one submission']);
    expect(errors({ inspected: [], concerns: [] })[0]).toMatch(/^missing/u);
  });
});

describe('the bounded queue of readers', () => {
  test('starts at most its concurrency, overflows beyond its queue, retries an unsettled request and parks a fenced one', async () => {
    const unsettled = ['rq-1', 'rq-2', 'rq-3', 'rq-4', 'rq-5'];
    const started: string[] = [];
    const overflowed: string[] = [];
    const releases = new Map<string, () => void>();
    const results = new Map<string, boolean>([['rq-2', false]]);
    let attempts = 0;
    const queue = new ReviewQueue({
      concurrency: 2,
      queue: 2,
      unsettled: () => unsettled,
      attempt: async request => {
        attempts += 1;
        started.push(request);
        await new Promise<void>(resolve => releases.set(request, resolve));
        const committed = results.get(request) ?? true;
        // A committed attempt settles its request unless the test keeps it for a retry.
        if (committed && request !== 'rq-1') unsettled.splice(unsettled.indexOf(request), 1);
        return committed;
      },
      overflow: async request => {
        overflowed.push(request);
        unsettled.splice(unsettled.indexOf(request), 1);
      },
      warn: () => undefined,
    });
    queue.wake();
    // Two run, two wait, and the fifth has no room.
    expect(started).toEqual(['rq-1', 'rq-2']);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(overflowed).toEqual(['rq-5']);
    expect(queue.active).toEqual(['rq-1', 'rq-2']);

    // rq-1's attempt did not settle it: it is retried, oldest request first.
    releases.get('rq-1')!();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(started).toEqual(['rq-1', 'rq-2', 'rq-1']);
    unsettled.splice(unsettled.indexOf('rq-1'), 1);
    releases.get('rq-1')!();
    // rq-2's attempt committed nothing: it is parked, never started again.
    releases.get('rq-2')!();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(started).toEqual(['rq-1', 'rq-2', 'rq-1', 'rq-3', 'rq-4']);
    queue.close();
    releases.get('rq-3')!();
    releases.get('rq-4')!();
    await queue.settled();
    expect(queue.active).toEqual([]);
    expect(unsettled).toEqual(['rq-2']);
    expect(attempts).toBe(5);
  });
});
