import { describe, expect, it } from 'vitest';

import { parseDescription } from '../parse.js';

describe('original text locations and retained parser data', () => {
  it('returns the complete classified token stream without whitespace or comments', () => {
    const text = 'ramify 1\nmodule tests tagged [testing,custom-tag]\nexpose-src "from" as From, default from "x\\/y.ts" tagged [] to parent,descendants // comment';
    const result = parseDescription('module.ramify', text);
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error('Expected valid');
    expect(result.document.tokens.map(({ kind, raw, decoded }) => [kind, raw, decoded])).toEqual([
      ['keyword', 'ramify', 'ramify'], ['name', '1', '1'],
      ['keyword', 'module', 'module'], ['name', 'tests', 'tests'], ['keyword', 'tagged', 'tagged'],
      ['punctuation', '[', '['], ['keyword', 'testing', 'testing'], ['punctuation', ',', ','],
      ['name', 'custom-tag', 'custom-tag'], ['punctuation', ']', ']'],
      ['keyword', 'expose-src', 'expose-src'], ['string', '"from"', 'from'], ['keyword', 'as', 'as'],
      ['name', 'From', 'From'], ['punctuation', ',', ','], ['name', 'default', 'default'],
      ['keyword', 'from', 'from'], ['string', '"x\\/y.ts"', 'x/y.ts'], ['keyword', 'tagged', 'tagged'],
      ['punctuation', '[', '['], ['punctuation', ']', ']'], ['keyword', 'to', 'to'],
      ['keyword', 'parent', 'parent'], ['punctuation', ',', ','], ['keyword', 'descendants', 'descendants'],
    ]);
  });

  it('preserves raw tokens, decoded strings and exact UTF-16 spans with BOM and CRLF', () => {
    const text = '\uFEFFramify 1\r\n\tmodule "ui" tagged [ui]\r\n// ignore me\r\n  expose-src "😀" as B from "interfaces\\/api.ts" tagged [] to parent // tail';
    const result = parseDescription('subs/view/module.ramify', text);
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error(JSON.stringify(result.issues));
    const { document } = result;
    expect(document.tokens.slice(0, 4)).toEqual([
      { kind: 'keyword', raw: 'ramify', decoded: 'ramify', span: { start: 1, end: 7, line: 1, column: 2 } },
      { kind: 'name', raw: '1', decoded: '1', span: { start: 8, end: 9, line: 1, column: 9 } },
      { kind: 'keyword', raw: 'module', decoded: 'module', span: { start: 12, end: 18, line: 2, column: 2 } },
      { kind: 'string', raw: '"ui"', decoded: 'ui', span: { start: 19, end: 23, line: 2, column: 9 } },
    ]);
    expect(document.module).toEqual({ name: 'ui', tags: ['ui'], span: { start: 12, end: 35, line: 2, column: 2 } });
    expect(document.tokens.filter(({ kind }) => kind === 'comment')).toEqual([]);
    const statement = document.statements[0];
    expect(statement.span).toEqual({ start: 53, end: 119, line: 4, column: 3 });
    expect(statement.selection).toEqual({ kind: 'named', names: [{ name: '😀', alias: 'B', span: { start: 64, end: 73, line: 4, column: 14 } }] });
    expect(statement.from).toEqual({ value: 'interfaces/api.ts', span: { start: 79, end: 99, line: 4, column: 29 } });
    expect(statement.tags).toEqual({ values: [], span: { start: 100, end: 109, line: 4, column: 50 } });
    for (const token of document.tokens) expect(text.slice(token.span.start, token.span.end)).toBe(token.raw);
  });

  it('keeps spans at original lines after blank lines and comments with escaped quotes', () => {
    const text = '\n // header\nramify 1\n\nmodule x // name\n\nexpose-src "x\\\"//y" from "x.ts" to parent\n';
    const result = parseDescription('module.ramify', text);
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error('Expected valid');
    expect(result.document.module.span.line).toBe(5);
    expect(result.document.statements[0].span.line).toBe(7);
    expect(result.document.statements[0].selection).toMatchObject({ kind: 'named', names: [{ name: 'x"//y', alias: 'x"//y' }] });
  });

  it('locates missing constructs at original end of line without inventing a final newline', () => {
    const text = '\uFEFFramify 1\r\nmodule x\r\nexpose-src A from "a.ts"';
    const result = parseDescription('module.ramify', text);
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') throw new Error('Expected invalid');
    expect(result.issues).toMatchObject([{ code: 'missing-to', span: { start: text.length, end: text.length, line: 3, column: 25 } }]);
  });

  it('returns detached deeply frozen JSON data in valid and invalid states', () => {
    for (const text of ['ramify 1\nmodule x\nexpose-src A from "a.ts" tagged [browser] to parent', 'ramify 2\nmodule x']) {
      const result = parseDescription('module.ramify', text);
      const copy: unknown = JSON.parse(JSON.stringify(result));
      expect(copy).toEqual(result);
      function inspect(value: unknown): void {
        if (typeof value !== 'object' || value === null) return;
        expect(Object.isFrozen(value)).toBe(true);
        expect(Object.getPrototypeOf(value)).toBe(Array.isArray(value) ? Array.prototype : Object.prototype);
        Object.values(value).forEach(inspect);
      }
      inspect(result);
      if (result.status === 'valid') {
        expect(() => (result.document.module.tags as string[]).push('ui')).toThrow();
      }
      expect(parseDescription('module.ramify', text)).toEqual(result);
      expect(parseDescription('module.ramify', text)).not.toBe(result);
    }
  });
});
