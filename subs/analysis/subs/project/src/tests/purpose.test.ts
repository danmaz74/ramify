import { describe, expect, it } from 'vitest';
import { readPurpose } from '../purpose.js';

describe('README purpose', () => {
  it.each([
    '# Title\n\nPurpose.\n\nSecond.',
    'Title\n=====\n\nPurpose.',
    '- List\n  continuation\n\nPurpose.',
    '> Quote\ncontinued quote\n\nPurpose.',
    '| Table |\n| --- |\n| cell |\n\nPurpose.',
    'Column\n--- | ---\nCell\n\nPurpose.',
    '```md\nFalse prose\n```\n\nPurpose.',
    '~~~~\nFalse prose\n~~~\nstill code\n~~~~\n\nPurpose.',
    '    indented code\n\nPurpose.',
    '<!-- Comment\nfalse prose\n-->\n\nPurpose.',
    '\uFEFF# Title\r\n\r\nPurpose.',
  ])('skips non-prose blocks: %s', text => {
    expect(readPurpose('README.md', text)).toEqual({ state: 'present', readme: 'README.md', paragraph: 'Purpose.' });
  });
  it.each([
    '# Title\nPurpose.\n',
    '# Title\nPurpose.\n\nLater paragraph.\n',
    '## Title\nPurpose.\n',
    '#\nPurpose.\n',
    '- Previous list\n# Title\nPurpose.\n',
    'Title\n=====\nPurpose.\n',
  ])('selects prose immediately after a heading: %s', text => {
    expect(readPurpose('README.md', text)).toEqual({ state: 'present', readme: 'README.md', paragraph: 'Purpose.' });
  });
  it('joins paragraph lines and renders inline prose', () => {
    expect(readPurpose('README.md', '# Title\n\nA **useful** [module](./module.md) with `code`\nand &amp; text.'))
      .toEqual({ state: 'present', readme: 'README.md', paragraph: 'A useful module with code and & text.' });
  });
  it.each([undefined, '', '# Heading\n\n- Item\n', '```\ncode\n```'])('represents missing documentation explicitly: %s', text => {
    expect(readPurpose('owner/README.md', text)).toEqual({ state: text === undefined ? 'missing-file' : 'no-paragraph', readme: 'owner/README.md' });
  });
});
