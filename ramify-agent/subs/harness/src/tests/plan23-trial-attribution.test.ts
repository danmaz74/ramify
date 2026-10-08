import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { engineerWorkingDirectory } from '../work/engineer-directory.js';
import type { WriteScope } from '../work/iterations.js';
import { fixtureScratchGit, mockGit } from './helpers/mock-git.js';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySetupLineIdentities, type RecordedSetupDelta, type SetupLineIdentityInput, type SetupLineMappingFacts } from '../../../../src/trial-attribution.js';

const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const rule = sha('src/tmp/\n'); const other = sha('secret-source.ts\n');
const record: RecordedSetupDelta = { id: 'scratch-1', runId: 'run-1', path: '.gitignore', beforeRevision: 'B', commit: 'S', beforeBlobHash: sha('dist/\n'), afterBlobHash: sha('dist/\nsrc/tmp/\nsecret-source.ts\n'), added: [{ line: 2, hash: rule }], deleted: [] };
const fact: SetupLineMappingFacts = { recordId: 'scratch-1', base: 'B', final: 'F', beforeRevision: 'B', commit: 'S', beforeBlobHash: record.beforeBlobHash, afterBlobHash: record.afterBlobHash,
  sourceAdded: record.added, sourceDeleted: [], beforePath: '.gitignore', afterPath: '.gitignore', finalAdded: [
    { line: 5, hash: rule, originCommit: 'S', originPath: '.gitignore', originLine: 2, boundary: false },
    { line: 6, hash: other, originCommit: 'S', originPath: '.gitignore', originLine: 3, boundary: false },
  ], baseDeleted: [] };
function input(overrides: Partial<SetupLineIdentityInput> = {}): SetupLineIdentityInput {
  return { runId: 'run-1', base: 'B', final: 'F', firstParentCommits: ['B', 'S', 'F'], records: [record], candidates: [{ commit: 'S', path: '.gitignore', kind: 'added' }], facts: [fact], ...overrides };
}
function result(overrides: Partial<SetupLineIdentityInput> = {}) { return verifySetupLineIdentities(input(overrides)); }
const expected = (added: readonly number[] | null, deleted: readonly number[] | null = []) => ({ base: 'B', final: 'F', entries: [{ commit: 'S', path: '.gitignore', added, deleted }] });
function deletion(): SetupLineIdentityInput {
  const removed = { ...record, beforeRevision: 'I', added: [], deleted: [{ line: 8, hash: rule }], afterBlobHash: sha('dist/\n') };
  return input({ firstParentCommits: ['B', 'I', 'S', 'F'], records: [removed], candidates: [{ commit: 'S', path: '.gitignore', kind: 'deleted' }], facts: [{ ...fact, beforeRevision: 'I', afterBlobHash: removed.afterBlobHash, sourceAdded: [], sourceDeleted: removed.deleted, finalAdded: [], baseDeleted: [
    { line: 2, hash: rule, lastSeenCommit: 'I', sourceBeforePath: '.gitignore', sourceBeforeLine: 8, removingCommit: 'S' },
    { line: 3, hash: other, lastSeenCommit: 'I', sourceBeforePath: '.gitignore', sourceBeforeLine: 9, removingCommit: 'S' },
  ] }] });
}

describe('Plan23 exact setup line identities', () => {
  it('excludes only surviving shifted setup identity in a mixed commit and same file', () => {
    expect(result()).toEqual(expected([5])); // Agent line6 remains, despite same commit/path.
  });
  it('keeps verified setup addition when another writer has no irrelevant source-position proof', () => {
    expect(result({ candidates: [{ commit: 'S', path: '.gitignore', kind: 'added' }, { commit: 'F', path: '.gitignore', kind: 'added' }], facts: [{ ...fact, finalAdded: [fact.finalAdded![0]!, { line: 6, hash: other, originCommit: 'F', originPath: '', originLine: 0, boundary: true }] }] })).toEqual({ base: 'B', final: 'F', entries: [{ commit: 'S', path: '.gitignore', added: [5], deleted: [] }, { commit: 'F', path: '.gitignore', added: [], deleted: [] }] });
  });
  it('keeps verified setup deletion when another remover has no irrelevant setup-before mapping', () => {
    const data = deletion(); expect(verifySetupLineIdentities({ ...data, candidates: [{ commit: 'S', path: '.gitignore', kind: 'deleted' }, { commit: 'F', path: '.gitignore', kind: 'deleted' }], facts: [{ ...data.facts[0]!, baseDeleted: [data.facts[0]!.baseDeleted![0]!, { line: 3, hash: other, lastSeenCommit: 'S', sourceBeforePath: '', sourceBeforeLine: null, removingCommit: 'F' }] }] })).toEqual({ base: 'B', final: 'F', entries: [{ commit: 'S', path: '.gitignore', added: [], deleted: [2] }, { commit: 'F', path: '.gitignore', added: [], deleted: [] }] });
  });
  it('does not subtract setup counts when reverted setup leaves same-commit agent lines', () => {
    expect(result({ facts: [{ ...fact, finalAdded: [{ line: 2, hash: other, originCommit: 'S', originPath: '.gitignore', originLine: 3, boundary: false }] }] })).toEqual(expected([]));
  });
  it('does not exempt a later writer rewrite merely because setup text matches', () => {
    expect(result({ candidates: [{ commit: 'F', path: '.gitignore', kind: 'added' }], facts: [{ ...fact, finalAdded: [{ line: 2, hash: rule, originCommit: 'F', originPath: '.gitignore', originLine: 2, boundary: false }] }] })).toEqual({ base: 'B', final: 'F', entries: [{ commit: 'F', path: '.gitignore', added: [], deleted: [] }] });
  });
  it('emits FINAL rename path while authenticating original containing-commit source path', () => {
    expect(result({ candidates: [{ commit: 'S', path: 'config/ignore', kind: 'added' }], facts: [{ ...fact, afterPath: 'config/ignore' }] })).toEqual({ base: 'B', final: 'F', entries: [{ commit: 'S', path: 'config/ignore', added: [5], deleted: [] }] });
  });
  it('preserves unknown for ambiguous same-text source position instead of aligning content', () => {
    expect(result({ facts: [{ ...fact, sourceAdded: null }] })).toEqual(expected(null));
  });
  it('verifies arbitrary BASE-to-before position and exact deleting successor, excluding only setup', () => {
    expect(verifySetupLineIdentities(deletion())).toEqual(expected([], [2]));
  });
  it('cannot guess missing arbitrary-before lineage by identical text', () => {
    const data = deletion(); expect(verifySetupLineIdentities({ ...data, facts: [{ ...data.facts[0]!, baseDeleted: [{ ...data.facts[0]!.baseDeleted![0]!, sourceBeforeLine: null }] }] })).toEqual(expected([], null));
  });
  it('rejects wrong removing successor even when source line text and setup commit match', () => {
    const data = deletion(); expect(verifySetupLineIdentities({ ...data, facts: [{ ...data.facts[0]!, baseDeleted: [{ ...data.facts[0]!.baseDeleted![0]!, removingCommit: 'F' }] }] })).toEqual(expected([], null));
  });
  it('does not exempt deletion by a later writer', () => {
    const data = deletion(); expect(verifySetupLineIdentities({ ...data, candidates: [{ commit: 'F', path: '.gitignore', kind: 'deleted' }], facts: [{ ...data.facts[0]!, baseDeleted: [{ ...data.facts[0]!.baseDeleted![0]!, lastSeenCommit: 'S', removingCommit: 'F' }] }] })).toEqual({ base: 'B', final: 'F', entries: [{ commit: 'F', path: '.gitignore', added: [], deleted: [] }] });
  });
  it('emits BASE rename path for deletion with authenticated setup-before source path', () => {
    const data = deletion(); expect(verifySetupLineIdentities({ ...data, candidates: [{ commit: 'S', path: 'old-ignore', kind: 'deleted' }], facts: [{ ...data.facts[0]!, beforePath: 'old-ignore' }] })).toEqual({ base: 'B', final: 'F', entries: [{ commit: 'S', path: 'old-ignore', added: [], deleted: [2] }] });
  });
  it.each([
    ['missing chain', null], ['BASE not first', ['I', 'B', 'S', 'F']], ['FINAL not last', ['B', 'S']], ['duplicate chain', ['B', 'S', 'S', 'F']],
  ] as const)('retains unknown with %s', (_label, firstParentCommits) => { expect(result({ firstParentCommits })).toEqual(expected(null)); });
  it('retains unknown for beforeRevision older than BASE rather than inventing ancestry', () => {
    expect(result({ records: [{ ...record, beforeRevision: 'OLDER' }], facts: [{ ...fact, beforeRevision: 'OLDER' }] })).toEqual(expected(null));
  });
  it.each([
    ['stale FINAL', { final: 'OTHER' }], ['stale BASE', { base: 'OTHER' }], ['wrong blob', { afterBlobHash: sha('wrong\n') }], ['binary or unreadable', { finalAdded: null }], ['wrong source hash', { sourceAdded: [{ line: 2, hash: other }] }],
  ] as const)('retains unknown for %s facts', (_label, overrides) => { expect(result({ facts: [{ ...fact, ...overrides }] })).toEqual(expected(null)); });
  it('unknown addition preserves independent deletion and unrelated verified partition subtotal', () => {
    expect(result({ candidates: [{ commit: 'S', path: '.gitignore', kind: 'added' }, { commit: 'S', path: '.gitignore', kind: 'deleted' }, { commit: 'F', path: 'source.ts', kind: 'added' }], facts: [{ ...fact, finalAdded: null }] })).toEqual({ base: 'B', final: 'F', entries: [{ commit: 'S', path: '.gitignore', added: null, deleted: [] }, { commit: 'F', path: 'source.ts', added: [], deleted: [] }] });
  });
  it('unknown setup commit marks each candidate on affected path while preserving other paths', () => {
    expect(result({ records: [{ ...record, commit: '' }], candidates: [{ commit: 'S', path: '.gitignore', kind: 'added' }, { commit: 'F', path: '.gitignore', kind: 'added' }, { commit: 'F', path: 'source.ts', kind: 'added' }], facts: [] })).toEqual({ base: 'B', final: 'F', entries: [{ commit: 'S', path: '.gitignore', added: null, deleted: [] }, { commit: 'F', path: '.gitignore', added: null, deleted: [] }, { commit: 'F', path: 'source.ts', added: [], deleted: [] }] });
  });
  it('compatible independent records union exact positions without count subtraction', () => {
    const second = { ...record, id: 'scratch-2', added: [{ line: 3, hash: other }] };
    expect(result({ records: [record, second], facts: [fact, { ...fact, recordId: second.id, sourceAdded: second.added }] })).toEqual(expected([5, 6]));
  });
  it('unknown wins compatible union rather than dropping the uncertain record', () => {
    const second = { ...record, id: 'scratch-2', added: null };
    expect(result({ records: [record, second], facts: [fact, { ...fact, recordId: second.id, sourceAdded: null }] })).toEqual(expected(null));
  });
  it.each(['duplicate record', 'duplicate facts', 'duplicate source position', 'duplicate FINAL position'] as const)('retains unknown with %s', mode => {
    const data = mode === 'duplicate record' ? { records: [record, record] } : mode === 'duplicate facts' ? { facts: [fact, fact] } : mode === 'duplicate source position' ? { records: [{ ...record, added: [record.added![0]!, record.added![0]!] }], facts: [{ ...fact, sourceAdded: [record.added![0]!, record.added![0]!] }] } : { facts: [{ ...fact, finalAdded: [fact.finalAdded![0]!, fact.finalAdded![0]!] }] };
    expect(result(data)).toEqual(expected(null));
  });
  it.each([0, -1, 1.5, Number.NaN])('retains unknown for invalid FINAL position %s', line => {
    expect(result({ facts: [{ ...fact, finalAdded: [{ ...fact.finalAdded![0]!, line }] }] })).toEqual(expected(null));
  });
  it('rejects missing known direct-diff identity rather than returning a fabricated empty mapping', () => {
    expect(() => result({ candidates: [] })).toThrow('partition missing');
    expect(() => result({ candidates: [{ commit: '', path: '.gitignore', kind: 'added' }] })).toThrow('candidate identity unavailable');
  });
  it('retains unknown rather than trusting an outside/traversing origin path', () => {
    expect(result({ facts: [{ ...fact, finalAdded: [{ ...fact.finalAdded![0]!, originPath: '../.gitignore' }] }] })).toEqual(expected(null));
  });
  it('line authentication distinguishes LF, CRLF and missing final terminator', () => {
    expect(new Set([sha('src/tmp/\n'), sha('src/tmp/\r\n'), sha('src/tmp/')]).size).toBe(3);
    expect(result({ facts: [{ ...fact, finalAdded: [{ ...fact.finalAdded![0]!, hash: sha('src/tmp/') }] }] })).toEqual(expected(null));
  });
  it('verified complete full reversion emits empty identities instead of historical setup counts', () => {
    expect(result({ facts: [{ ...fact, finalAdded: [] }] })).toEqual(expected([]));
  });
});

it('trial writes resolve against actual assigned module src cwd while scope stays project-relative', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ramify-plan23-trial-cwd-'));
  try {
    const directory = 'subs/workspace/subs/shared-ui'; const owner = 'collection-review/workspace/shared-ui';
    await mkdir(join(root, directory, 'src'), { recursive: true });
    const scope = { base: { module: owner, included: [] }, extra: [], read: [], bootstrap: [], rationale: 'independent fixed trial', revision: 1, resolved: { roots: [join(root, directory)], files: [], included: [], excluded: [], view: { status: 'placeholder' }, ownership: { provider: 'ramify.affected-cli/4', ramifyVersion: 'scripted', inputId: 'fixed', configuration: 'tsconfig.json', root, modules: [{ id: owner, parent: 'collection-review/workspace', directory }], exclusions: [] } } } as WriteScope;
    const index = { revision: 'fixed', input: 'fixed', symbols: new Map(), modules: new Map([[owner, { module: owner, dir: directory, parent: 'collection-review/workspace', children: [], tags: [], areas: ['src'] }]]) };
    const cwd = await engineerWorkingDirectory(root, scope, index, fixtureScratchGit(mockGit()));
    expect(cwd).toBe(join(root, directory, 'src'));
    await writeFile(join(cwd, 'status.ts'), 'export const status = "ready";\n');
    expect(await readFile(join(root, directory, 'src/status.ts'), 'utf8')).toBe('export const status = "ready";\n');
    await expect(stat(join(cwd, directory, 'src/status.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(scope.base).toEqual({ module: 'collection-review/workspace/shared-ui', included: [] });
    expect(scope.resolved.ownership.modules[0]?.directory).toBe('subs/workspace/subs/shared-ui');
  } finally { await rm(root, { recursive: true, force: true }); }
});
