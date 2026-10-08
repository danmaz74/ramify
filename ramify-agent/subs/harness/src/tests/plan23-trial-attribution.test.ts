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
