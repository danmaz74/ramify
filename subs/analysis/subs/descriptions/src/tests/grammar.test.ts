import { describe, expect, it } from 'vitest';

import { parseDescription } from '../parse.js';
import type { DescriptionIssue } from '../interfaces/syntax.js';

const header = 'ramify 1\nmodule example\n';
const source = (selection: string) => `expose-src ${selection} from "interfaces/api.ts" to parent`;
function valid(text: string) {
  const result = parseDescription('module.ramify', text);
  expect(result.status, JSON.stringify(result)).toBe('valid');
  if (result.status !== 'valid') throw new Error('Expected valid description');
  return result.document;
}
function invalid(text: string, code: DescriptionIssue['code']) {
  const result = parseDescription('module.ramify', text);
  expect(result.status).toBe('invalid');
  expect(result).not.toHaveProperty('document');
  if (result.status !== 'invalid') throw new Error('Expected invalid description');
  expect(result.issues.map((issue) => issue.code)).toContain(code);
  for (const issue of result.issues) {
    expect(issue.file).toBe('module.ramify');
    expect(issue.span.start).toBeGreaterThanOrEqual(0);
    expect(issue.span.end).toBeLessThanOrEqual(text.length);
    expect(issue.span.end).toBeGreaterThanOrEqual(issue.span.start);
    expect(issue.message.length).toBeGreaterThan(0);
  }
  return result;
}

describe('the complete version 1 grammar', () => {
  it('supports an empty owner, comments and all three exposure forms in source order', () => {
    expect(valid(header).statements).toEqual([]);
    const document = valid(`${header}
      expose-src A as B, default from "src/./api.ts" tagged [] to descendants, parent // retained offsets
      expose-test helper from "tests/helper.ts" tagged [testing, custom-tag] to parent
      expose-sub * from "ui" to descendants
      expose-src * from "interfaces/nested/api.ts" to parent
    `);
    expect(document.statements.map(({ kind, index, from, tags, destinations }) =>
      [kind, index, from.value, tags?.values ?? null, destinations])).toEqual([
      ['expose-src', 0, 'src/./api.ts', [], ['descendants', 'parent']],
      ['expose-test', 1, 'tests/helper.ts', ['testing', 'custom-tag'], ['parent']],
      ['expose-sub', 2, 'ui', null, ['descendants']],
      ['expose-src', 3, 'interfaces/nested/api.ts', null, ['parent']],
    ]);
    const selection = document.statements[0].selection;
    expect(selection.kind).toBe('named');
    if (selection.kind === 'named') expect(selection.names.map(({ name, alias }) => [name, alias])).toEqual([['A', 'B'], ['default', 'default']]);
  });

  it('distinguishes literal star names and aliases from wildcard selection', () => {
    const document = valid(`${header}${source('"*" as "from", A as "*"')}\nexpose-test "*" from "f.ts" to parent`);
    expect(document.statements.every(({ selection }) => selection.kind === 'named')).toBe(true);
    const selection = document.statements[0].selection;
    if (selection.kind === 'named') expect(selection.names.map(({ name, alias }) => [name, alias])).toEqual([['*', 'from'], ['A', '*']]);
  });

  it('preserves repeated selections and statements for later semantic merging', () => {
    const line = source('A as B, A as B');
    const document = valid(`${header}${line}\n${line}`);
    expect(document.statements).toHaveLength(2);
    expect(document.statements[0].selection).toMatchObject({ kind: 'named', names: [{ name: 'A', alias: 'B' }, { name: 'A', alias: 'B' }] });
  });

  it('accepts arbitrary syntactically valid tag names without a registry', () => {
    const document = valid('ramify 1\nmodule custom-tag tagged [custom-tag, testing, browser, ui, dispatch]\nexpose-src customTag from "a.ts" tagged [not-registered] to parent');
    expect(document.module.tags).toEqual(['custom-tag', 'testing', 'browser', 'ui', 'dispatch']);
    expect(document.statements[0].tags?.values).toEqual(['not-registered']);
    expect(valid('ramify 1\nmodule tests tagged [testing]').module.name).toBe('tests');
    expect(valid('ramify 1\nmodule dispatch').module.name).toBe('dispatch');
    expect(valid(`${header}${source('dispatch, tests')}`).statements).toHaveLength(1);
  });

  const keywords = ['ramify', 'module', 'expose-src', 'expose-test', 'expose-sub', 'from', 'as', 'tagged', 'to', 'parent', 'descendants', 'testing', 'browser', 'ui'];
  for (const word of keywords) {
    it(`requires quotes for ${word} in every name position`, () => {
      for (const make of [
        (name: string) => `ramify 1\nmodule ${name}`,
        (name: string) => `${header}${source(name)}`,
        (name: string) => `${header}${source(`value as ${name}`)}`,
        (name: string) => `${header}expose-sub ${name} from child to parent`,
        (name: string) => `${header}expose-sub value from ${name} to parent`,
      ]) {
        invalid(make(word), 'reserved-name');
        valid(make(`"${word}"`));
      }
    });
  }

  it.each(['fromValue', 'From', '_from', '$testing', 'default', 'a0', 'UI'])('accepts the complete bare export name %s', (name) => {
    expect(valid(`${header}${source(name)}`).statements[0].selection).toMatchObject({ kind: 'named', names: [{ name }] });
  });
  it.each(['from-value', 'from-', '1name', 'name$-x', 'foo--bar'])('never splits invalid bare name %s into convenient keywords', (name) => {
    const result = invalid(`${header}${source(name)}`, 'invalid-name');
    expect(result.tokens.some(({ raw }) => raw === name)).toBe(true);
    valid(`${header}${source(`"${name}"`)}`);
  });
  it.each(['Upper', 'has_underscore', '-leading', 'trailing-', 'two--hyphens', '1first', 'ümlaut', 'a.b'])('validates quoted module name %s', (name) => {
    invalid(`ramify 1\nmodule "${name}"`, 'invalid-name');
  });

  it.each([
    ['expose-test * from "fixture.ts" to parent', 'invalid-selection'],
    ['expose-src *, A from "a.ts" to parent', 'invalid-selection'],
    ['expose-src A, * from "a.ts" to parent', 'invalid-selection'],
    ['expose-sub * as A from child to parent', 'invalid-selection'],
    ['expose-sub A from child tagged [] to parent', 'unknown-clause'],
    ['expose-sub A from "path/child" to parent', 'invalid-name'],
    ['expose-src A from child to parent', 'missing-from'],
    ['expose-src A to parent', 'missing-from'],
    ['expose-src A from "a.ts"', 'missing-to'],
    ['expose-src A from "a.ts" to', 'invalid-destination'],
    ['expose-src A from "a.ts" to "parent"', 'invalid-destination'],
    ['expose-src A from "a.ts" to children', 'invalid-destination'],
    ['expose-src A from "a.ts" to parent, parent, descendants, descendants', 'duplicate-destination'],
    ['expose-src A, from "a.ts" to parent', 'invalid-list'],
    ['expose-src A,, B from "a.ts" to parent', 'invalid-list'],
    ['expose-src A from "a.ts" to parent,', 'invalid-list'],
    ['expose-src A from "a.ts" tagged [browser,] to parent', 'invalid-list'],
    ['expose-src A from "a.ts" tagged [browser browser] to parent', 'invalid-list'],
    ['expose-src A from "a.ts" tagged [browser, browser] to parent', 'duplicate-tag'],
    ['expose-src A from "a.ts" tagged ["browser"] to parent', 'invalid-tag-syntax'],
    ['expose-src A from "a.ts" tagged [Bad_Tag] to parent', 'invalid-tag-syntax'],
    ['expose-src A from "a.ts" tagged [from] to parent', 'invalid-tag-syntax'],
    ['expose-src A from "a.ts" tagged {} to parent', 'invalid-tag-syntax'],
    ['expose-src A from "a.ts" to parent tagged []', 'unknown-clause'],
    ['expose-src A from "a.ts" to parent;', 'trailing-token'],
    ['expose-src A from "a.ts" to parent except child', 'unknown-clause'],
    ['tests tagged [testing]', 'test-profile-declaration'],
    ['tests from "a.ts"', 'unknown-statement'],
    ['own A', 'unknown-statement'],
    ['receive A', 'unknown-statement'],
    ['expose A', 'unknown-statement'],
    ['re-expose A', 'unknown-statement'],
    ['import "x"', 'unknown-statement'],
    ['/* comment */', 'unknown-statement'],
    ['{"module":"other"}', 'unknown-statement'],
  ] as const)('rejects malformed statement %s', (line, code) => { invalid(`${header}${line}`, code); });

  it.each([
    ['', 'missing-version'],
    ['// comment', 'missing-header'],
    ['module example', 'missing-version'],
    ['ramify 1', 'missing-header'],
    ['ramify 2\nmodule example', 'unsupported-version'],
    ['ramify 01\nmodule example', 'unsupported-version'],
    ['ramify "1"\nmodule example', 'unsupported-version'],
    ['ramify 1;\nmodule example', 'trailing-token'],
    ['module example\nramify 1', 'invalid-order'],
    ['ramify 1\nramify 1\nmodule example', 'duplicate-header'],
    [`${header}module again`, 'duplicate-header'],
    [`ramify 1\n${source('A')}\nmodule example`, 'invalid-order'],
    ['"ramify" 1\nmodule example', 'unknown-statement'],
    ['RAMIFY 1\nmodule example', 'unknown-statement'],
  ] as const)('rejects invalid headers %j', (text, code) => { invalid(text, code); });

  it.each([
    'ramify"1"\nmodule example',
    'ramify 1\nmodule"example"',
    'ramify 1\nmodule example tagged[]',
    'ramify 1\nmodule "example"tagged []',
    `${header}expose-src"A" from "a.ts" to parent`,
    `${header}expose-src "A"as B from "a.ts" to parent`,
    `${header}expose-src A as"B" from "a.ts" to parent`,
    `${header}expose-src "A"from "a.ts" to parent`,
    `${header}expose-src A from"a.ts" to parent`,
    `${header}expose-src A from "a.ts"tagged [] to parent`,
    `${header}expose-src A from "a.ts" tagged []to parent`,
    `${header}expose-src A from "a.ts"to parent`,
  ])('enforces mandatory horizontal whitespace in %j', (text) => { invalid(text, 'invalid-whitespace'); });

  it('permits optional whitespace around commas and within empty/nonempty lists', () => {
    valid(` \tramify\t1 \n module\texample\ttagged [ \tui\t, browser\t ] \n${source('"A",B as C ,\tdefault')}`);
  });

  it('does not normalize, resolve or validate the filesystem meaning of decoded paths', () => {
    for (const path of ['../escape.ts', '/absolute.ts', 'C:/file.ts', 'https://example/a', 'interfaces//api.ts', 'interfaces/../private.ts', 'interfaces/*.ts', 'interfaces/', 'src/a.js', 'a\\b.ts', '@alias']) {
      const document = valid(`${header}expose-src * from ${JSON.stringify(path)} to parent`);
      expect(document.statements[0].from.value).toBe(path);
    }
  });
});

describe('strings, Unicode and diagnostic recovery', () => {
  it.each([
    [String.raw`"quote\"//still-string"`, 'quote"//still-string'],
    [String.raw`"back\\slash"`, 'back\\slash'],
    [String.raw`"escaped\/slash"`, 'escaped/slash'],
    [String.raw`"\u03b1"`, 'α'],
    [String.raw`"\ud83d\ude00"`, '😀'],
    ['"😀"', '😀'],
    ['"é"', 'é'],
    [String.raw`"e\u0301"`, 'é'],
    ['"a\uFEFFb"', 'a\uFEFFb'],
    ['"\uFFFD"', '\uFFFD'], // A real replacement scalar is not evidence of invalid UTF-8 bytes.
  ])('decodes %s exactly', (raw, decoded) => {
    expect(valid(`${header}${source(raw)}`).statements[0].selection).toMatchObject({ kind: 'named', names: [{ name: decoded, alias: decoded }] });
  });

  it.each(['\\b', '\\f', '\\n', '\\r', '\\t', '\\u0000', '\\u001f', '\\u007f'])('rejects decoded control %s in names and paths', (escape) => {
    invalid(`${header}${source(`"a${escape}b"`)}`, 'invalid-name');
    invalid(`${header}expose-src A from "a${escape}b" to parent`, 'invalid-name');
  });
  it.each(['\\q', '\\x20', '\\u{1F600}', '\\u123', '\\uZ000'])('rejects malformed escape %s', (escape) => {
    invalid(`${header}${source(`"${escape}"`)}`, 'invalid-escape');
  });
  it.each(['\\uD800', '\\uDC00', '\\uD800\\u0041', '\\uD800a\\uDC00', '\\uD800\\uD800', '\\uD800\uDC00', '\uD800\\uDC00', '\uD800', '\uDC00', '\t', '\u0000'])('rejects non-scalar string content %j', (content) => {
    invalid(`${header}${source(`"${content}"`)}`, 'invalid-scalar');
  });
  it.each(['\u00A0', '\v', '\f', '\u2028', '\u2029', '\uFEFF'])('rejects nonseparator whitespace %j', (whitespace) => {
    invalid(`ramify 1\nmodule${whitespace}example`, 'invalid-whitespace');
  });

  it('reports failures on every malformed line without publishing recovered statements', () => {
    const text = `${header}expose-src A from "a.ts" to parent;\n${source('""')}\n${source('from')}\n${source('"\\q"')}\n${source('B')}`;
    const result = invalid(text, 'trailing-token');
    expect(result.issues.map(({ code, span }) => [code, span.line])).toEqual([
      ['trailing-token', 3], ['empty-name', 4], ['reserved-name', 5], ['invalid-escape', 6],
    ]);
  });

  it('reports each duplicate set item and every lexical escape error', () => {
    const result = invalid(`${header}expose-src A from "a.ts" tagged [ui, ui, browser, browser] to parent, parent, descendants, descendants\n${source('"a\\q\\z"')}`, 'duplicate-tag');
    expect(result.issues.map(({ code }) => code)).toEqual(['duplicate-tag', 'duplicate-tag', 'duplicate-destination', 'duplicate-destination', 'invalid-escape', 'invalid-escape']);
  });
  it('does not treat a final CR as CRLF or ignore it in a comment', () => {
    invalid(`${header}// comment\r`, 'bare-cr');
    invalid(header.replaceAll('\n', '\r'), 'bare-cr');
  });
  it('rejects physical multiline strings and escapes at end of line', () => {
    invalid(`${header}${source('"a\nb"')}`, 'unterminated-string');
    invalid(`${header}expose-src "unfinished\\`, 'unterminated-string');
  });
});
