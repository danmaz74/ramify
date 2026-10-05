import { describe, expect, it } from 'vitest';

import { parseDescription } from '../parse.js';
import type { DescriptionDocument, DescriptionIssue, DescriptionStatement } from '../interfaces/syntax.js';

// PB1-01 and PB1-02: the two nested-tree statements of the adopted version 1
// grammar. Expected offsets, lines and columns below were counted from the
// fixture texts, independently of the parser; UTF-16 code units are counted
// for the BOM and astral cases.

const header = 'ramify 1\nmodule app\n';
function valid(text: string): DescriptionDocument {
  const result = parseDescription('module.ramify', text);
  expect(result.status, JSON.stringify(result)).toBe('valid');
  if (result.status !== 'valid') throw new Error('Expected a valid description');
  return result.document;
}
function invalid(text: string): readonly DescriptionIssue[] {
  const result = parseDescription('module.ramify', text);
  expect(result.status).toBe('invalid');
  expect(result).not.toHaveProperty('document');
  if (result.status !== 'invalid') throw new Error('Expected an invalid description');
  return result.issues;
}
/** Exposure meaning without its position: what a reordered or interleaved description must keep. */
function meaning(statement: DescriptionStatement): unknown {
  if ('directory' in statement) return { kind: statement.kind, directory: statement.directory.value };
  return { kind: statement.kind, from: statement.from.value, tags: statement.tags?.values ?? null,
    destinations: statement.destinations,
    selection: statement.selection.kind === 'wildcard' ? '*' : statement.selection.names.map(({ name, alias }) => [name, alias]) };
}

describe('PB1-01: valid nested-tree statements', () => {
  const text = 'ramify 1\nmodule app tagged [dispatch]\nowned-ignored "fixture-project" // retained comment\n'
    + 'expose-src api from "api.ts" to parent\n  external\t"external-project"\n'
    + 'expose-sub value from child to descendants\nowned-ignored "a/../b/./c"\n';

  it('parses both kinds interleaved with exposures, indexed among all statements with located directories', () => {
    const document = valid(text);
    expect(document.module).toEqual({ name: 'app', tags: ['dispatch'], root: null, span: { start: 9, end: 37, line: 2, column: 1 } });
    expect(document.statements).toEqual([
      { index: 0, kind: 'owned-ignored', span: { start: 38, end: 69, line: 3, column: 1 },
        directory: { value: 'fixture-project', span: { start: 52, end: 69, line: 3, column: 15 } } },
      { index: 1, kind: 'expose-src', span: { start: 90, end: 128, line: 4, column: 1 },
        selection: { kind: 'named', names: [{ name: 'api', alias: 'api', span: { start: 101, end: 104, line: 4, column: 12 } }] },
        from: { value: 'api.ts', span: { start: 110, end: 118, line: 4, column: 21 } }, tags: null, destinations: ['parent'] },
      { index: 2, kind: 'external', span: { start: 131, end: 158, line: 5, column: 3 },
        directory: { value: 'external-project', span: { start: 140, end: 158, line: 5, column: 12 } } },
      { index: 3, kind: 'expose-sub', span: { start: 159, end: 201, line: 6, column: 1 },
        selection: { kind: 'named', names: [{ name: 'value', alias: 'value', span: { start: 170, end: 175, line: 6, column: 12 } }] },
        from: { value: 'child', span: { start: 181, end: 186, line: 6, column: 23 } }, tags: null, destinations: ['descendants'] },
      { index: 4, kind: 'owned-ignored', span: { start: 202, end: 228, line: 7, column: 1 },
        directory: { value: 'a/../b/./c', span: { start: 216, end: 228, line: 7, column: 15 } } },
    ]);
  });

  it('classifies both keywords as keyword tokens and excludes comments from the token stream', () => {
    const document = valid(text);
    expect(document.tokens.slice(8, 10).map(({ kind, raw, decoded }) => [kind, raw, decoded])).toEqual([
      ['keyword', 'owned-ignored', 'owned-ignored'], ['string', '"fixture-project"', 'fixture-project'],
    ]);
    expect(document.tokens.find(({ raw }) => raw === 'external')).toEqual(
      { kind: 'keyword', raw: 'external', decoded: 'external', span: { start: 131, end: 139, line: 5, column: 3 } });
    expect(document.tokens.some(({ raw }) => raw.includes('retained') || raw === '//')).toBe(false);
    for (const token of document.tokens) expect(text.slice(token.span.start, token.span.end)).toBe(token.raw);
  });

  it('keeps UTF-16 spans with a BOM, CRLF, tab separators, escapes and an astral directory', () => {
    const encoded = '﻿ramify 1\r\nmodule x\r\n\texternal \t"t\\u00e9st\\/cache" // tail\r\nowned-ignored "😀/d"';
    expect(valid(encoded).statements).toEqual([
      { index: 0, kind: 'external', span: { start: 22, end: 50, line: 3, column: 2 },
        directory: { value: 'tést/cache', span: { start: 32, end: 50, line: 3, column: 12 } } },
      { index: 1, kind: 'owned-ignored', span: { start: 60, end: 80, line: 4, column: 1 },
        directory: { value: '😀/d', span: { start: 74, end: 80, line: 4, column: 15 } } },
    ]);
  });

  it('keeps decoded directories as written; normalization and containment belong to project acquisition', () => {
    // Project acquisition rejects the escaping, absolute, empty-segment and backslash forms.
    for (const [raw, decoded] of [['"../escape"', '../escape'], ['"/absolute"', '/absolute'], ['"a//b"', 'a//b'],
      ['"a\\\\b"', 'a\\b'], ['"src/tmp"', 'src/tmp'], ['"."', '.'], ['"tools/"', 'tools/'], ['"*"', '*'], ['" spaced name "', ' spaced name ']]) {
      const statement = valid(`${header}external ${raw}`).statements[0];
      expect(statement).toMatchObject({ kind: 'external', directory: { value: decoded } });
    }
  });

  it('accepts nested-tree statements before, between and after exposures, changing only indices', () => {
    const source = 'expose-src api from "api.ts" to parent';
    const child = 'expose-sub * from child to descendants';
    const orders = [
      [source, child, 'owned-ignored "kept"', 'external "cache"'],
      ['owned-ignored "kept"', source, 'external "cache"', child],
      ['external "cache"', 'owned-ignored "kept"', source, child],
    ];
    for (const lines of orders) {
      const ordered = `${header}${lines.join('\n')}\n`;
      const document = valid(ordered);
      expect(document.statements.map(({ index }) => index)).toEqual([0, 1, 2, 3]);
      expect(document.statements.map(({ span }) => ordered.slice(span.start, span.end))).toEqual(lines);
    }
  });

  it('leaves every exposure statement unchanged apart from its position when nested trees are interleaved', () => {
    const exposures = [
      'expose-src A as B, default from "interfaces/api.ts" tagged [browser] to parent, descendants',
      'expose-test helper from "helpers/make.ts" tagged [testing] to descendants',
      'expose-sub * from child to parent',
      'expose-src * from "interfaces/vocabulary.ts" to parent',
    ];
    const plain = valid(`${header}${exposures.join('\n')}`);
    const interleaved = valid(`${header}owned-ignored "fixtures"\n${exposures[0]}\n${exposures[1]}\nexternal "cache"\n`
      + `${exposures[2]}\nowned-ignored "examples/demo"\n${exposures[3]}`);
    expect(interleaved.statements.map(({ index }) => index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const kept = interleaved.statements.filter((statement) => !('directory' in statement));
    expect(kept.map(({ index }) => index)).toEqual([1, 2, 4, 6]);
    expect(kept.map(meaning)).toEqual(plain.statements.map(meaning));
    expect(plain.statements.map(meaning)).toEqual([
      { kind: 'expose-src', from: 'interfaces/api.ts', tags: ['browser'], destinations: ['parent', 'descendants'],
        selection: [['A', 'B'], ['default', 'default']] },
      { kind: 'expose-test', from: 'helpers/make.ts', tags: ['testing'], destinations: ['descendants'], selection: [['helper', 'helper']] },
      { kind: 'expose-sub', from: 'child', tags: null, destinations: ['parent'], selection: '*' },
      { kind: 'expose-src', from: 'interfaces/vocabulary.ts', tags: null, destinations: ['parent'], selection: '*' },
    ]);
    expect(interleaved.statements.filter((statement) => 'directory' in statement).map(meaning)).toEqual([
      { kind: 'owned-ignored', directory: 'fixtures' }, { kind: 'external', directory: 'cache' },
      { kind: 'owned-ignored', directory: 'examples/demo' },
    ]);
  });

  it('admits both keywords as tag names in every tag position without a declaration defining a tag', () => {
    const document = valid('ramify 1\nmodule app tagged [owned-ignored, external, ui]\n'
      + 'expose-src value from "value.ts" tagged [external, owned-ignored] to parent\nowned-ignored "fixtures"\nexternal "cache"');
    expect(document.module.tags).toEqual(['owned-ignored', 'external', 'ui']);
    expect(document.statements[0]).toMatchObject({ kind: 'expose-src', tags: { values: ['external', 'owned-ignored'] } });
    expect(valid(`${header}owned-ignored "fixtures"\nexternal "cache"`).module.tags).toEqual([]);
    const issues = invalid('ramify 1\nmodule app tagged [owned-ignored, owned-ignored]');
    expect(issues.map(({ code, span }) => [code, span.start])).toEqual([['duplicate-tag', 43]]);
  });

  for (const word of ['owned-ignored', 'external']) {
    it(`reserves ${word} in every name position and accepts it quoted`, () => {
      for (const make of [
        (name: string) => `ramify 1\nmodule ${name}`,
        (name: string) => `${header}expose-src ${name} from "a.ts" to parent`,
        (name: string) => `${header}expose-src value as ${name} from "a.ts" to parent`,
        (name: string) => `${header}expose-sub ${name} from child to parent`,
        (name: string) => `${header}expose-sub value from ${name} to parent`,
      ]) {
        const text = make(word);
        const issues = invalid(text);
        expect(issues.map(({ code }) => code)).toEqual(['reserved-name']);
        expect(issues[0]!.span.start).toBe(text.lastIndexOf(word));
        expect(text.slice(issues[0]!.span.start, issues[0]!.span.end)).toBe(word);
        valid(make(`"${word}"`));
      }
    });
  }

  it('does not reserve keyword prefixes, extensions or other letter cases', () => {
    expect(valid('ramify 1\nmodule external-tools\nexpose-sub value from owned-ignored-cache to parent').module.name).toBe('external-tools');
    expect(valid('ramify 1\nmodule owned').module.name).toBe('owned');
    expect(valid(`${header}expose-src externalValue, External, ignored from "a.ts" to parent`).statements[0])
      .toMatchObject({ selection: { kind: 'named', names: [{ name: 'externalValue' }, { name: 'External' }, { name: 'ignored' }] } });
  });
});

describe('PB1-02: malformed nested-tree statements', () => {
  // [description text, expected code, exact offending text or null at end of input, line,
  //  offset from which the offending text is first found].
  const statement = (line: string) => `${header}${line}`;
  const cases: readonly (readonly [string, DescriptionIssue['code'], string | null, number, number])[] = [
    [statement('owned-ignored examples'), 'invalid-name', 'examples', 3, header.length],
    [statement('owned-ignored examples/demo'), 'invalid-name', 'examples', 3, header.length],
    [statement('external parent'), 'invalid-name', 'parent', 3, header.length],
    [statement("owned-ignored 'examples'"), 'invalid-name', "'", 3, header.length],
    [statement('external * from "cache"'), 'invalid-name', '*', 3, header.length],
    [statement('external'), 'invalid-name', null, 3, header.length],
    [statement('owned-ignored ""'), 'empty-name', '""', 3, header.length],
    [statement('external "a\\tb"'), 'invalid-name', '"a\\tb"', 3, header.length],
    [statement('external "a\\u007fb"'), 'invalid-name', '"a\\u007fb"', 3, header.length],
    [statement('owned-ignored "examples\ndemo"'), 'unterminated-string', '"examples', 3, header.length],
    [statement('owned-ignored "examples" tagged [testing]'), 'unknown-clause', 'tagged', 3, header.length],
    [statement('external "cache" to parent'), 'unknown-clause', 'to', 3, header.length],
    [statement('external "cache" from "elsewhere"'), 'unknown-clause', 'from', 3, header.length],
    [statement('owned-ignored "a" "b"'), 'unknown-clause', '"b"', 3, header.length],
    [statement('owned-ignored "a", "b"'), 'trailing-token', ',', 3, header.length],
    [statement('owned-ignored "a";'), 'trailing-token', ';', 3, header.length],
    [statement('owned-ignored"a"'), 'invalid-whitespace', '"a"', 3, header.length],
    [statement('external "a"'), 'invalid-whitespace', ' ', 3, header.length],
    [statement('Owned-ignored "a"'), 'unknown-statement', 'Owned-ignored', 3, header.length],
    [statement('EXTERNAL "a"'), 'unknown-statement', 'EXTERNAL', 3, header.length],
    [statement('"external" "a"'), 'unknown-statement', '"external"', 3, header.length],
    ['ramify 1\nowned-ignored "a"\nmodule app', 'invalid-order', 'owned-ignored', 2, 0],
    ['external "a"\nramify 1\nmodule app', 'invalid-order', 'external', 1, 0],
    [statement('owned-ignored "a"\nmodule again'), 'duplicate-header', 'module', 4, header.length],
    [statement('external "a"\nramify 1'), 'duplicate-header', 'ramify', 4, header.length],
    [statement('owned-ignored "a"\rexternal "b"'), 'bare-cr', '\r', 3, header.length],
    [statement('external "\\uD800"'), 'invalid-scalar', '\\uD800', 3, header.length],
    [statement('external "\\uDC00x"'), 'invalid-scalar', '\\uDC00', 3, header.length],
    [statement('external "\uD800"'), 'invalid-scalar', '\uD800', 3, header.length],
    [statement('external "a\u0001b"'), 'invalid-scalar', '\u0001', 3, header.length],
    [statement('owned-ignored "a\\qb"'), 'invalid-escape', '\\q', 3, header.length],
  ];
  it.each(cases)('rejects %j with %s at the offending text', (text, code, at, line, from) => {
    const issues = invalid(text);
    const issue = issues.find((item) => item.code === code);
    expect(issue, JSON.stringify(issues)).toBeDefined();
    expect(issue!.file).toBe('module.ramify');
    expect(issue!.message.length).toBeGreaterThan(0);
    expect(issue!.span.line).toBe(line);
    if (at === null) {
      expect([issue!.span.start, issue!.span.end]).toEqual([text.length, text.length]);
    } else {
      expect(issue!.span.start).toBe(text.indexOf(at, from));
      expect(text.slice(issue!.span.start, issue!.span.end)).toBe(at);
    }
    for (const item of issues) {
      expect(item.span.start).toBeGreaterThanOrEqual(0);
      expect(item.span.end).toBeLessThanOrEqual(text.length);
    }
  });

  it('reports every malformed nested-tree line in source order without publishing the valid ones', () => {
    const text = `${header}owned-ignored "kept"\nexternal cache\nexpose-src api from "api.ts" to parent\n`
      + 'owned-ignored ""\nexternal "x" tagged []\nowned-ignored "fine"';
    expect(invalid(text).map(({ code, span }) => [code, span.line, text.slice(span.start, span.end)])).toEqual([
      ['invalid-name', 4, 'cache'], ['empty-name', 6, '""'], ['unknown-clause', 7, 'tagged'],
    ]);
  });
});
