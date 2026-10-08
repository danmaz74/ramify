import { describe, expect, test } from 'vitest';
import { parseTreeEntries } from '../git.js';

// Literal native-format answers: this parser test never launches Git.
const sha1 = '0123456789abcdef0123456789abcdef01234567';
const sha256 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('Git tree blob object metadata', () => {
  test('retains exact SHA-1 and SHA-256 blob IDs, modes, byte counts and raw NUL-delimited UTF-8 paths', () => {
    const output = `100644 blob ${sha1}      17\tsrc/quoted "é".ts\0`
      + `100755 blob ${sha256} 0\tsrc/tab\tnewline\nfile\0`
      + `120000 blob ${sha1} 12\tsrc/link\0`
      + `160000 commit ${sha256}       -\tsubs/external\0`;
    expect(parseTreeEntries(output)).toEqual([
      { path: 'src/quoted "é".ts', kind: 'file', bytes: 17, objectId: sha1 },
      { path: 'src/tab\tnewline\nfile', kind: 'executable', bytes: 0, objectId: sha256 },
      { path: 'src/link', kind: 'symlink', bytes: 12, objectId: sha1 },
      { path: 'subs/external', kind: 'submodule', bytes: null },
    ]);
  });

  test.each([
    ['short ID', `100644 blob abcd 1\tsrc/a\0`],
    ['unknown digest length', `100644 blob ${'a'.repeat(48)} 1\tsrc/a\0`],
    ['nonhex ID', `100644 blob ${'g'.repeat(40)} 1\tsrc/a\0`],
    ['zero ID', `100644 blob ${'0'.repeat(40)} 1\tsrc/a\0`],
    ['uppercase noncanonical ID', `100644 blob ${'A'.repeat(40)} 1\tsrc/a\0`],
    ['missing ID', '100644 blob 1\tsrc/a\0'],
    ['unexpected metadata', `100644 blob ${sha1} 1 extra\tsrc/a\0`],
    ['unknown mode', `100664 blob ${sha1} 1\tsrc/a\0`],
    ['wrong object kind', `100644 tree ${sha1} 1\tsrc/a\0`],
    ['submodule blob mismatch', `160000 blob ${sha1} 1\tsrc/a\0`],
    ['malformed byte count', `100644 blob ${sha1} 1bad\tsrc/a\0`],
    ['negative byte count', `100644 blob ${sha1} -1\tsrc/a\0`],
    ['unsafe byte count', `100644 blob ${sha1} 9007199254740992\tsrc/a\0`],
    ['truncated delimiter', `100644 blob ${sha1} 1\tsrc/a`],
  ])('does not manufacture proof from %s', (_reason, output) => {
    const entries = parseTreeEntries(output);
    expect(entries).toHaveLength(1);
    expect(entries[0]).not.toHaveProperty('objectId');
    expect(entries[0]?.path).toBe('src/a');
  });

  test('empty, missing-path and header-only responses never fabricate an object ID', () => {
    expect(parseTreeEntries('')).toEqual([]);
    expect(parseTreeEntries(`100644 blob ${sha1} 1\0`)).toEqual([]);
    expect(parseTreeEntries(`100644 blob ${sha1} 1\t\0`)).toEqual([{ path: '', kind: 'file', bytes: 1 }]);
  });
});
