import { describe, expect, it } from 'vitest';

import { parseDescription, readRootMarker } from '../parse.js';
import { assignOriginalTags, createDefaultTagRegistry, deriveSourceAreas, resolveTagRegistry } from '../../../model/src/index.js';
import type { ResolvedTagRegistry } from '../../../model/src/interfaces/model.js';
import type { DescriptionDocument, DescriptionIssue } from '../interfaces/syntax.js';

// PB1-41: the root marker of the adopted version 1 module line,
// `module-line = [ "root", hws ], "module", hws, module-name, [ hws, tag-clause ], LF`.
// Expected offsets, lines and columns below were counted from the fixture
// texts, independently of the parser, in UTF-16 code units.

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
/** Each issue as its code, start offset and the exact text it covers. */
function located(text: string): unknown[] {
  return invalid(text).map(({ code, span }) => [code, span.start, text.slice(span.start, span.end)]);
}

describe('PB1-41: the root marker on the module line', () => {
  const exposure = 'expose-src api from "api.ts" to parent';
  const marked = `ramify 1\nroot module app tagged [dispatch]\n${exposure}\n`;
  const unmarked = `ramify 1\nmodule app tagged [dispatch]\n${exposure}\n`;

  it('records the marker span and a header span that begins at the marker', () => {
    const document = valid(marked);
    expect(document.module).toEqual({ name: 'app', tags: ['dispatch'],
      root: { start: 9, end: 13, line: 2, column: 1 }, span: { start: 9, end: 42, line: 2, column: 1 } });
    expect(marked.slice(9, 42)).toBe('root module app tagged [dispatch]');
    expect(document.tokens.slice(2, 4).map(({ kind, raw }) => [kind, raw])).toEqual([['keyword', 'root'], ['keyword', 'module']]);
    expect(document.statements).toEqual([
      { index: 0, kind: 'expose-src', span: { start: 43, end: 81, line: 3, column: 1 },
        selection: { kind: 'named', names: [{ name: 'api', alias: 'api', span: { start: 54, end: 57, line: 3, column: 12 } }] },
        from: { value: 'api.ts', span: { start: 63, end: 71, line: 3, column: 21 } }, tags: null, destinations: ['parent'] },
    ]);
  });

  it('keeps an unmarked header valid with a null marker and unchanged exposure records', () => {
    const document = valid(unmarked);
    expect(document.module).toEqual({ name: 'app', tags: ['dispatch'], root: null, span: { start: 9, end: 37, line: 2, column: 1 } });
    // The same exposure as in the marked description, five code units earlier.
    expect(document.statements).toEqual([
      { index: 0, kind: 'expose-src', span: { start: 38, end: 76, line: 3, column: 1 },
        selection: { kind: 'named', names: [{ name: 'api', alias: 'api', span: { start: 49, end: 52, line: 3, column: 12 } }] },
        from: { value: 'api.ts', span: { start: 58, end: 66, line: 3, column: 21 } }, tags: null, destinations: ['parent'] },
    ]);
    expect(valid('ramify 1\nmodule app').module.root).toBeNull();
  });

  it('keeps UTF-16 spans with a BOM, CRLF, tab separators and a trailing comment', () => {
    const text = '﻿ramify 1\r\n\troot\t module\tx // header comment\r\nexpose-sub * from child to descendants\r\n';
    const document = valid(text);
    expect(document.module).toEqual({ name: 'x', tags: [],
      root: { start: 12, end: 16, line: 2, column: 2 }, span: { start: 12, end: 26, line: 2, column: 2 } });
    expect(document.statements).toEqual([
      { index: 0, kind: 'expose-sub', span: { start: 46, end: 84, line: 3, column: 1 },
        selection: { kind: 'wildcard', span: { start: 57, end: 58, line: 3, column: 12 } },
        from: { value: 'child', span: { start: 64, end: 69, line: 3, column: 19 } }, tags: null, destinations: ['descendants'] },
    ]);
    for (const token of document.tokens) expect(text.slice(token.span.start, token.span.end)).toBe(token.raw);
    expect(document.tokens.some(({ raw }) => raw.includes('comment'))).toBe(false);
  });

  it('accepts the marker before every module-line form and with nested-tree statements', () => {
    expect(valid('ramify 1\nroot module "root"').module).toMatchObject({ name: 'root', root: { start: 9, end: 13 } });
    expect(valid('ramify 1\nroot module app tagged []').module).toMatchObject({ tags: [], span: { start: 9, end: 34 } });
    const trees = valid('ramify 1\nroot module app\nowned-ignored "fixtures"\nexternal "cache"');
    expect(trees.module.root).toEqual({ start: 9, end: 13, line: 2, column: 1 });
    expect(trees.statements.map(({ kind }) => kind)).toEqual(['owned-ignored', 'external']);
  });
});

describe('PB1-41: root is reserved in every name position', () => {
  const positions = [
    (name: string) => `ramify 1\nmodule ${name}`,
    (name: string) => `ramify 1\nroot module ${name}`,
    (name: string) => `${header}expose-src ${name} from "a.ts" to parent`,
    (name: string) => `${header}expose-src value as ${name} from "a.ts" to parent`,
    (name: string) => `${header}expose-test ${name} from "a.ts" to parent`,
    (name: string) => `${header}expose-sub ${name} from child to parent`,
    (name: string) => `${header}expose-sub value as ${name} from child to parent`,
    (name: string) => `${header}expose-sub value from ${name} to parent`,
  ];

  it.each(positions.map((make, index) => [index, make] as const))('rejects bare root and accepts quoted "root" in position %i', (_, make) => {
    const text = make('root');
    const issues = invalid(text);
    expect(issues.map(({ code }) => code)).toEqual(['reserved-name']);
    expect(issues[0]!.span.start).toBe(text.lastIndexOf('root'));
    expect(text.slice(issues[0]!.span.start, issues[0]!.span.end)).toBe('root');
    valid(make('"root"'));
  });

  it('decodes quoted "root" names as ordinary names', () => {
    expect(valid('ramify 1\nmodule "root"').module).toMatchObject({ name: 'root', root: null });
    expect(valid(`${header}expose-src "root" as "root" from "a.ts" to parent`).statements[0])
      .toMatchObject({ selection: { kind: 'named', names: [{ name: 'root', alias: 'root' }] } });
    expect(valid(`${header}expose-sub value from "root" to parent`).statements[0]).toMatchObject({ from: { value: 'root' } });
  });

  it('does not reserve keyword prefixes, extensions or other letter cases', () => {
    expect(valid('ramify 1\nmodule root-tools').module).toMatchObject({ name: 'root-tools', root: null });
    expect(valid('ramify 1\nroot module roots').module).toMatchObject({ name: 'roots', root: { start: 9, end: 13 } });
    expect(valid(`${header}expose-src rootValue, Root, uproot from "a.ts" to parent`).statements[0])
      .toMatchObject({ selection: { kind: 'named', names: [{ name: 'rootValue' }, { name: 'Root' }, { name: 'uproot' }] } });
    expect(valid('ramify 1\nmodule app\nexpose-sub value from root-cause to parent').statements[0]).toMatchObject({ from: { value: 'root-cause' } });
  });
});

describe('PB1-41: root as a tag resolves only through the registry', () => {
  const text = 'ramify 1\nroot module app tagged [root, dispatch]\nexpose-src value from "api.ts" tagged [root] to parent\n';
  const location = { file: 'module.ramify', start: 0, end: 1, line: 1, column: 1 };
  function withRoot(): ResolvedTagRegistry {
    const result = resolveTagRegistry([...createDefaultTagRegistry().definitions, { name: 'root', kind: 'required-symbol' }]);
    if (result.status !== 'valid') throw new Error(JSON.stringify(result));
    return result.value;
  }

  it('admits root as a bare tag in module and exposure tag clauses, distinct from the marker', () => {
    const document = valid(text);
    expect(document.module).toMatchObject({ tags: ['root', 'dispatch'], root: { start: 9, end: 13 } });
    expect(document.statements[0]).toMatchObject({ kind: 'expose-src', tags: { values: ['root'] } });
    expect(valid('ramify 1\nmodule app tagged [root]').module).toMatchObject({ tags: ['root'], root: null });
    expect(located('ramify 1\nmodule app tagged [root, root]')).toEqual([['duplicate-tag', 34, 'root']]);
    expect(located('ramify 1\nmodule app tagged ["root"]')).toEqual([['invalid-tag-syntax', 28, '"root"']]);
  });

  it('reports root as an unknown tag under the default registry', () => {
    const document = valid(text);
    const defaults = createDefaultTagRegistry();
    const areas = deriveSourceAreas(defaults, 'app', 'src', document.module.tags);
    expect(areas.status).toBe('invalid');
    if (areas.status !== 'invalid') return;
    expect(areas.issues.map(({ code, message }) => [code, message])).toEqual([['unknown-tag', 'Unknown tag "root" in module "app" at src']]);
    // Positive control: without the tag the header resolves.
    const plain = deriveSourceAreas(defaults, 'app', 'src', ['dispatch']);
    expect(plain.status).toBe('valid');
    if (plain.status !== 'valid') return;
    const assigned = assignOriginalTags(defaults, plain.value[0]!, [{ tags: ['root', 'dispatch'], location }]);
    expect(assigned.status === 'invalid' && assigned.issues.map(({ code }) => code)).toEqual(['unknown-tag']);
  });

  it('accepts root as a tag once the registry defines it', () => {
    const document = valid(text);
    const registry = withRoot();
    const areas = deriveSourceAreas(registry, 'app', 'src', document.module.tags);
    expect(areas.status).toBe('valid');
    if (areas.status !== 'valid') return;
    expect(areas.value.map(({ kind, profile }) => [kind, profile])).toEqual([['ordinary', ['dispatch', 'root']], ['tests', ['dispatch', 'testing']]]);
    expect(assignOriginalTags(registry, areas.value[0]!, [{ tags: ['root', 'dispatch'], location }]))
      .toMatchObject({ status: 'valid', value: { tags: ['dispatch', 'root'] } });
  });
});

describe('PB1-41: a misplaced root is malformed with the existing parser codes', () => {
  // [description text, located issues as [code, start offset, exact text]].
  const cases: readonly (readonly [string, string, readonly (readonly [DescriptionIssue['code'], number, string])[]])[] = [
    ['alone on the module line', 'ramify 1\nroot',
      [['missing-header', 0, 'ramify'], ['unknown-statement', 9, 'root']]],
    ['alone before the module line', 'ramify 1\nroot\nmodule app',
      [['unknown-statement', 9, 'root'], ['invalid-order', 14, 'module']]],
    ['alone after the module line', 'ramify 1\nmodule app\nroot',
      [['unknown-statement', 20, 'root']]],
    ['doubled', 'ramify 1\nroot root module app',
      [['missing-header', 0, 'ramify'], ['unknown-statement', 9, 'root']]],
    ['after module, as the module name', 'ramify 1\nmodule root app',
      [['reserved-name', 16, 'root']]],
    ['after the module name', 'ramify 1\nmodule app root',
      [['unknown-clause', 20, 'root']]],
    ['after the tag clause', 'ramify 1\nmodule app tagged [ui] root',
      [['unknown-clause', 32, 'root']]],
    ['after a marked header', 'ramify 1\nroot module app root',
      [['unknown-clause', 25, 'root']]],
    ['before an exposure statement', 'ramify 1\nmodule app\nroot expose-src value from "a.ts" to parent',
      [['unknown-statement', 20, 'root']]],
    ['before a nested-tree statement', 'ramify 1\nmodule app\nroot external "cache"',
      [['unknown-statement', 20, 'root']]],
    ['before the version header', 'root ramify 1\nmodule app',
      [['missing-version', 0, 'root'], ['unknown-statement', 0, 'root'], ['invalid-order', 14, 'module']]],
    ['on a marked module line before the version header', 'root module app\nramify 1',
      [['invalid-order', 0, 'root'], ['invalid-order', 16, 'ramify']]],
    ['on a second, marked module line', 'ramify 1\nroot module app\nroot module again',
      [['duplicate-header', 25, 'root'], ['invalid-order', 25, 'root']]],
    ['in a destination position', `${header}expose-src value from "a.ts" to root`,
      [['invalid-destination', 52, 'root']]],
    ['joined to module without a separator', 'ramify 1\nrootmodule app',
      [['missing-header', 0, 'ramify'], ['unknown-statement', 9, 'rootmodule']]],
    ['separated from module by a non-ASCII space', 'ramify 1\nroot module app',
      [['invalid-whitespace', 13, ' ']]],
    ['in another letter case', 'ramify 1\nRoot module app',
      [['missing-header', 0, 'ramify'], ['unknown-statement', 9, 'Root']]],
    ['quoted', 'ramify 1\n"root" module app',
      [['missing-header', 0, 'ramify'], ['unknown-statement', 9, '"root"']]],
  ];

  it.each(cases)('rejects root %s', (_, text, expected) => {
    expect(located(text)).toEqual(expected);
    for (const issue of invalid(text)) {
      expect(issue.file).toBe('module.ramify');
      expect(issue.message.length).toBeGreaterThan(0);
    }
  });

  it('keeps the existing issue codes: a misplaced marker adds none', () => {
    const codes = new Set(cases.flatMap(([, text]) => invalid(text).map(({ code }) => code)));
    expect([...codes].sort()).toEqual(['duplicate-header', 'invalid-destination', 'invalid-order', 'invalid-whitespace',
      'missing-header', 'missing-version', 'reserved-name', 'unknown-clause', 'unknown-statement']);
  });
});

// PB1-42: the marker determination selection uses. It reads the module line
// alone, so later errors keep the marker and a missing or misplaced header
// removes it. Offsets are counted from the texts, in UTF-16 code units.
describe('the root marker read from the module line alone', () => {
  const marker = (start: number, line = 2) => ({ start, end: start + 4, line, column: 1 });
  const cases: [string, string, ReturnType<typeof marker> | null][] = [
    ['a marked header', 'ramify 1\nroot module app\n', marker(9)],
    ['an unmarked header', 'ramify 1\nmodule app\n', null],
    ['a marked header with later malformed lines', 'ramify 1\nroot module app\nexpose-src\nnot a statement\n', marker(9)],
    ['a marked header with an unterminated name on its own line', 'ramify 1\nroot module "app\n', marker(9)],
    ['a marked header separated by a non-ASCII space, which parsing rejects', 'ramify 1\nroot\u00a0module app\n', marker(9)],
    ['a marked header separated by a tab', 'ramify 1\nroot\tmodule app\n', marker(9)],
    ['a BOM and CRLF', '\uFEFFramify 1\r\nroot module app\r\n', marker(11)],
    ['comments and blank lines before the header', '// note\n\nramify 1\n  // header\nroot module app\n', marker(30, 5)],
    ['no version header', 'root module app\n', null],
    ['a header after another statement', 'ramify 1\nexpose-src a from "a.ts" to parent\nroot module app\n', null],
    ['a marked second module line', 'ramify 1\nmodule a\nroot module b\n', null],
    ['root alone before the header', 'ramify 1\nroot\nmodule app\n', null],
    ['root as the module name', 'ramify 1\nmodule root\n', null],
    ['root joined to module', 'ramify 1\nrootmodule app\n', null],
    ['another letter case', 'ramify 1\nRoot module app\n', null],
    ['a quoted root', 'ramify 1\n"root" module app\n', null],
    ['empty text', '', null],
  ];
  it.each(cases)('reads %s', (_, text, expected) => {
    expect(readRootMarker('module.ramify', text)).toEqual(expected);
  });
  it('agrees with the parsed header wherever the description is valid', () => {
    for (const [, text] of cases) {
      const parsed = parseDescription('module.ramify', text);
      if (parsed.status === 'valid') expect(readRootMarker('module.ramify', text)).toEqual(parsed.document.module.root);
    }
  });
});
