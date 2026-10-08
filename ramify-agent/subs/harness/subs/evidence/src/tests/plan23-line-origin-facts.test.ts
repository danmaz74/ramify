import { describe, expect, it } from 'vitest';
import { parseBlamePorcelain } from '../git.js';
import type { LineCommit } from '../git.js';

const sha = 'a'.repeat(40);
const later = 'b'.repeat(64);

describe('exact Git porcelain source facts without processes', () => {
  it('separates final position from original position and binds the exact nested prefix', () => {
    const text = `${sha} 9 3 1\nauthor Writer\nfilename project/src/a.ts\n\tadded\n`;
    expect(parseBlamePorcelain(text, 'project/')).toEqual([
      { line: 3, sourceLine: 9, commit: sha, boundary: false, sourcePath: 'project/src/a.ts', projectPrefix: 'project/' },
    ]);
  });

  it('preserves renamed origin paths, boundary status and SHA-256 commits independently', () => {
    const text = `${sha} 7 1 1\nboundary\nfilename project/src/before.ts\n\tkept\n${later} 2 2\nfilename project/src/after.ts\n\tnew\n`;
    expect(parseBlamePorcelain(text, '')).toEqual([
      { line: 1, sourceLine: 7, commit: sha, boundary: true, sourcePath: 'project/src/before.ts', projectPrefix: '' },
      { line: 2, sourceLine: 2, commit: later, boundary: false, sourcePath: 'project/src/after.ts', projectPrefix: '' },
    ]);
  });

  it('decodes quoted UTF-8 octets, quotes, backslashes and control characters exactly', () => {
    const text = String.raw`${sha} 4 8 1
filename "project/src/\303\251\"\\\t\n\r\a\b\v\f.ts"
` + '\tcontent\n';
    expect(parseBlamePorcelain(text, 'project/')).toEqual([
      { line: 8, sourceLine: 4, commit: sha, boundary: false, sourcePath: 'project/src/é"\\\t\n\r\x07\b\v\f.ts', projectPrefix: 'project/' },
    ]);
  });

  it('retains unquoted Unicode, spaces and outside-project origins without rewriting ownership', () => {
    expect(parseBlamePorcelain(`${sha} 2 4\nfilename sibling/é file.ts\n\tcontent\n`, 'project/')).toEqual([
      { line: 4, sourceLine: 2, commit: sha, boundary: false, sourcePath: 'sibling/é file.ts', projectPrefix: 'project/' },
    ]);
  });

  it('does not infer a prefix or filename when their proof is missing', () => {
    expect(parseBlamePorcelain(`${sha} 2 4\nauthor Writer\n\tcontent\n`)).toEqual([
      { line: 4, sourceLine: 2, commit: sha, boundary: false },
    ]);
    const older: LineCommit = { line: 4, commit: sha, boundary: false };
    expect(older.sourceLine).toBeUndefined();
    expect(older.sourcePath).toBeUndefined();
    expect(older.projectPrefix).toBeUndefined();
  });

  it.each([
    '"project/unterminated', String.raw`"project/\q.ts"`, String.raw`"project/\12.ts"`,
    String.raw`"project/\777.ts"`, String.raw`"project/\377.ts"`, String.raw`"project/\000.ts"`,
    '/absolute.ts', '../outside.ts', 'project/../outside.ts', 'project//a.ts', '',
  ])('keeps invalid filename metadata unavailable: %s', filename => {
    expect(parseBlamePorcelain(`${sha} 5 6\nfilename ${filename}\n\tcontent\n`)).toEqual([
      { line: 6, sourceLine: 5, commit: sha, boundary: false },
    ]);
  });

  it('does not select a guessed filename from conflicting duplicate metadata', () => {
    expect(parseBlamePorcelain(`${sha} 5 6\nfilename project/a.ts\nfilename project/b.ts\n\tcontent\n`)).toEqual([
      { line: 6, sourceLine: 5, commit: sha, boundary: false },
    ]);
  });

  it.each(['0 2', '2 0', '9007199254740992 2', '2 9007199254740992', '2 3 junk'])('rejects malformed positions without completing a previous record: %s', positions => {
    expect(parseBlamePorcelain(`${sha} 1 1\nfilename project/old.ts\n${sha} ${positions}\nfilename project/new.ts\n\tcontent\n`)).toEqual([]);
  });

  it('does not publish truncated records or leak source/boundary metadata into the next line', () => {
    expect(parseBlamePorcelain(`${sha} 1 1\nboundary\nfilename project/old.ts\n${sha} 2 3\n\tcontent\n${sha} 4 5\nfilename project/truncated.ts\n`)).toEqual([
      { line: 3, sourceLine: 2, commit: sha, boundary: false },
    ]);
    expect(parseBlamePorcelain('')).toEqual([]);
  });
});
