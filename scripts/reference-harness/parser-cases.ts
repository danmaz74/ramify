import { parseDescription } from '../../subs/analysis/subs/descriptions/src/parse.js';
import type { DescriptionDocument, DescriptionIssue, DescriptionStatement, TextSpan } from '../../subs/analysis/subs/descriptions/src/interfaces/syntax.js';
import type { Assertions, InstanceHandler } from './runner.js';

// Literal expectations transcribed from the reviewed D variants. No registry,
// compiler or project acquisition is needed for this text-only boundary.
const file = 'subs/provider/module.ramify';
const header = 'ramify 1\nmodule provider\n';
const source = 'expose-src value from "interfaces/api.ts" to parent';
const baseline = `${header}${source}\n`;

interface ExpectedStatement {
  kind: DescriptionStatement['kind'];
  selection: '*' | readonly (readonly [string, string])[];
  from: string;
  tags: readonly string[] | null;
  destinations: readonly ('parent' | 'descendants')[];
}
const ordinary: ExpectedStatement = {
  kind: 'expose-src', selection: [['value', 'value']], from: 'interfaces/api.ts',
  tags: null, destinations: ['parent'],
};
interface ValidCase {
  text: string;
  name?: string;
  tags?: readonly string[];
  statements?: readonly ExpectedStatement[];
}
function selected(raw: string, decoded: string): ValidCase {
  return { text: baseline.replace('expose-src value', `expose-src ${raw}`),
    statements: [{ ...ordinary, selection: [[decoded, decoded]] }] };
}
const validCases: Readonly<Record<string, ValidCase>> = {
  lf: { text: baseline },
  crlf: { text: baseline.replaceAll('\n', '\r\n') },
  bom: { text: `\uFEFF${baseline}` },
  'no-final-newline': { text: baseline.slice(0, -1) },
  comments: { text: `// header\n${header}${source} // expose value\n` },
  'string-comment': { text: baseline.replace('interfaces/api.ts', 'interfaces//api.ts'),
    statements: [{ ...ordinary, from: 'interfaces//api.ts' }] },
  'space-tab': { text: ' \tramify\t1 \t\n\tmodule  provider\t \n  expose-src\tvalue  from\t"interfaces/api.ts"\tto\tparent \t\n' },
  'quoted-reserved': { text: 'ramify 1\nmodule "testing"\nexpose-src "from" as "to" from "keywords.ts" to parent\n',
    name: 'testing', statements: [{ ...ordinary, selection: [['from', 'to']], from: 'keywords.ts' }] },
  'keyword-prefix': { text: 'ramify 1\nmodule testing-tools\nexpose-src fromValue, From from "interfaces/api.ts" to parent\n',
    name: 'testing-tools', statements: [{ ...ordinary, selection: [['fromValue', 'fromValue'], ['From', 'From']] }] },
  'escaped-quote': selected(String.raw`"a\"b"`, 'a"b'),
  'escaped-backslash': selected(String.raw`"a\\b"`, 'a\\b'),
  'escaped-slash': { text: baseline.replace('interfaces/api.ts', String.raw`interfaces\/api.ts`) },
  'unicode-scalar': selected(String.raw`"\u03B1"`, 'α'),
  'surrogate-pair': selected(String.raw`"\uD83D\uDE00"`, '😀'),
  'empty-tags': { text: baseline.replace('module provider', 'module provider tagged []').replace(' to parent', ' tagged [] to parent'),
    statements: [{ ...ordinary, tags: [] }] },
  'all-destinations': { text: baseline.replace('to parent', 'to parent, descendants'),
    statements: [{ ...ordinary, destinations: ['parent', 'descendants'] }] },
  'child-wildcard': { text: `${baseline}expose-sub * from child to descendants\n`,
    statements: [ordinary, { kind: 'expose-sub', selection: '*', from: 'child', tags: null, destinations: ['descendants'] }] },
  'interface-wildcard': { text: baseline.replace('expose-src value', 'expose-src *'), statements: [{ ...ordinary, selection: '*' }] },
  'named-test': { text: `${baseline}expose-test fixture as helper from "fixture.ts" tagged [testing] to parent\n`,
    statements: [ordinary, { kind: 'expose-test', selection: [['fixture', 'helper']], from: 'fixture.ts', tags: ['testing'], destinations: ['parent'] }] },
  'custom-tag': { text: baseline.replace('module provider', 'module provider tagged [custom-tag]'), tags: ['custom-tag'] },
};

interface InvalidCase {
  text: string;
  code: DescriptionIssue['code'];
  /** Exact offending token/escape, or null for a missing construct at line end. */
  at: string | null;
}
const invalidCases: Readonly<Record<string, InvalidCase>> = {
  version: { text: baseline.replace('ramify 1', 'ramify 2'), code: 'unsupported-version', at: '2' },
  'missing-version': { text: baseline.slice('ramify 1\n'.length), code: 'missing-version', at: 'module' },
  'header-order': { text: `module provider\nramify 1\n${source}\n`, code: 'invalid-order', at: 'module' },
  'unknown-clause': { text: `${header}${source} except child\n`, code: 'unknown-clause', at: 'except' },
  semicolon: { text: baseline.replace('module provider', 'module provider;'), code: 'trailing-token', at: ';' },
  'test-profile': { text: `${baseline}tests tagged [testing, browser]\n`, code: 'test-profile-declaration', at: 'tests' },
  'bare-cr': { text: baseline.replace('\n', '\r'), code: 'bare-cr', at: '\r' },
  'interior-bom': { text: baseline.replace('module', '\uFEFFmodule'), code: 'invalid-whitespace', at: '\uFEFF' },
  'double-bom': { text: `\uFEFF\uFEFF${baseline}`, code: 'invalid-whitespace', at: '\uFEFF' },
  'unknown-escape': { text: baseline.replace('interfaces/api.ts', String.raw`interfaces\qapi.ts`), code: 'invalid-escape', at: String.raw`\q` },
  'isolated-high-surrogate': { text: selected(String.raw`"\uD83D"`, '').text, code: 'invalid-scalar', at: String.raw`\uD83D` },
  'isolated-low-surrogate': { text: selected(String.raw`"\uDE00"`, '').text, code: 'invalid-scalar', at: String.raw`\uDE00` },
  'escaped-control': { text: selected(String.raw`"a\nb"`, '').text, code: 'invalid-name', at: String.raw`"a\nb"` },
  'delete-control': { text: selected(String.raw`"a\u007fb"`, '').text, code: 'invalid-name', at: String.raw`"a\u007fb"` },
  'empty-name': { text: selected('""', '').text, code: 'empty-name', at: '""' },
  'empty-path': { text: baseline.replace('"interfaces/api.ts"', '""'), code: 'empty-name', at: '""' },
  'unquoted-reserved': { text: selected('from', '').text, code: 'reserved-name', at: 'from' },
  'quoted-tag': { text: baseline.replace('module provider', 'module provider tagged ["browser"]'), code: 'invalid-tag-syntax', at: '"browser"' },
  'quoted-destination': { text: baseline.replace('to parent', 'to "parent"'), code: 'invalid-destination', at: '"parent"' },
  'duplicate-tag': { text: baseline.replace('module provider', 'module provider tagged [ui, ui]'), code: 'duplicate-tag', at: 'ui' },
  'duplicate-destination': { text: baseline.replace('to parent', 'to parent, parent'), code: 'duplicate-destination', at: 'parent' },
  'trailing-selection-comma': { text: baseline.replace('expose-src value', 'expose-src value,'), code: 'invalid-list', at: 'from' },
  'trailing-tag-comma': { text: baseline.replace('module provider', 'module provider tagged [ui,]'), code: 'invalid-list', at: ']' },
  'trailing-destination-comma': { text: baseline.replace('to parent', 'to parent,'), code: 'invalid-list', at: null },
  'wildcard-mixed': { text: baseline.replace('expose-src value', 'expose-src *, value'), code: 'invalid-selection', at: ',' },
  'wildcard-alias': { text: baseline.replace('expose-src value', 'expose-src * as all'), code: 'invalid-selection', at: 'as' },
  'child-tag-override': { text: `${header}expose-sub value from child tagged [browser] to parent\n`, code: 'unknown-clause', at: 'tagged' },
  'multiline-statement': { text: baseline.replace('interfaces/api.ts', 'interfaces/\napi.ts'), code: 'unterminated-string', at: '"interfaces/' },
  'non-ascii-whitespace': { text: baseline.replace('module provider', 'module\u00A0provider'), code: 'invalid-whitespace', at: '\u00A0' },
  'invalid-module-name': { text: baseline.replace('module provider', 'module "Bad_Name"'), code: 'invalid-name', at: '"Bad_Name"' },
  'missing-source': { text: `${header}expose-src value to parent\n`, code: 'missing-from', at: 'to' },
  'missing-destination': { text: `${header}expose-src value from "interfaces/api.ts"\n`, code: 'missing-to', at: null },
  'json-object': { text: `${baseline}{ "expose": "value" }\n`, code: 'unknown-statement', at: '{' },
};

function assertSpan(assertions: Assertions, name: string, text: string, span: TextSpan): void {
  assertions.ok(`${name}: original offset range`, span.start >= 0 && span.end >= span.start && span.end <= text.length);
  const before = text.slice(0, span.start);
  assertions.equal(`${name}: original line/column`, [span.line, span.column],
    [before.split('\n').length, span.start - before.lastIndexOf('\n')]);
}

function assertDocument(assertions: Assertions, label: string, fixture: ValidCase): DescriptionDocument {
  const result = parseDescription(file, fixture.text);
  assertions.equal(`${label}: valid`, result.status, 'valid');
  if (result.status !== 'valid') throw new Error(JSON.stringify(result.issues));
  const document = result.document;
  assertions.equal(`${label}: header`, [document.file, document.version, document.module.name, document.module.tags],
    [file, 1, fixture.name ?? 'provider', fixture.tags ?? []]);
  assertions.equal(`${label}: statements`, document.statements.map((statement) => ({
    kind: statement.kind,
    selection: statement.selection.kind === 'wildcard' ? '*' : statement.selection.names.map(({ name, alias }) => [name, alias]),
    from: statement.from.value, tags: statement.tags?.values ?? null, destinations: statement.destinations,
  })), fixture.statements ?? [ordinary]);
  assertions.equal(`${label}: source order`, document.statements.map(({ index }) => index), document.statements.map((_, index) => index));
  assertions.ok(`${label}: comments excluded`, document.tokens.every((token) => token.kind !== 'comment'));
  document.tokens.forEach((token, index) => {
    assertSpan(assertions, `${label} token ${index}`, fixture.text, token.span);
    assertions.equal(`${label} token ${index}: raw text`, fixture.text.slice(token.span.start, token.span.end), token.raw);
  });
  assertSpan(assertions, `${label} module`, fixture.text, document.module.span);
  document.statements.forEach((statement, index) => {
    assertSpan(assertions, `${label} statement ${index}`, fixture.text, statement.span);
    const raw = fixture.text.slice(statement.span.start, statement.span.end);
    assertions.ok(`${label} statement ${index}: complete physical line`,
      raw.startsWith(statement.kind) && raw.endsWith(statement.destinations.at(-1)!) && !/[\r\n]/.test(raw));
    assertSpan(assertions, `${label} from ${index}`, fixture.text, statement.from.span);
    if (statement.tags) assertSpan(assertions, `${label} tags ${index}`, fixture.text, statement.tags.span);
    if (statement.selection.kind === 'wildcard') assertSpan(assertions, `${label} wildcard ${index}`, fixture.text, statement.selection.span);
    else statement.selection.names.forEach((selection, number) => assertSpan(assertions, `${label} name ${index}/${number}`, fixture.text, selection.span));
  });
  return document;
}

export const parserHandlers: ReadonlyMap<string, InstanceHandler> = new Map([
  ...Object.entries(validCases).map(([variant, fixture]): [string, InstanceHandler] => [
    `I1-04:syntax-valid/${variant}`, { kind: 'memory', run: ({ assertions }) => { assertDocument(assertions, variant, fixture); } },
  ]),
  ...Object.entries(invalidCases).map(([variant, fixture]): [string, InstanceHandler] => [
    `I1-04:syntax-invalid/${variant}`, { kind: 'memory', run: ({ assertions }) => {
      assertDocument(assertions, 'baseline', { text: baseline });
      const result = parseDescription(file, fixture.text);
      assertions.equal('mutation: invalid', result.status, 'invalid');
      assertions.ok('mutation: no partial document', !('document' in result));
      if (result.status !== 'invalid') throw new Error('Expected invalid description');
      const issue = result.issues.find((item) => item.code === fixture.code);
      assertions.ok(`mutation: ${fixture.code}`, issue);
      if (!issue) throw new Error(JSON.stringify(result.issues));
      assertions.equal('mutation: responsible file', issue.file, file);
      assertSpan(assertions, 'mutation issue', fixture.text, issue.span);
      assertions.equal('mutation: responsible text', fixture.text.slice(issue.span.start, issue.span.end), fixture.at ?? '');
      if (fixture.at === null) assertions.equal('mutation: missing at line end', issue.span.start, fixture.text.trimEnd().length);
      if (variant === 'double-bom') assertions.equal('mutation: second BOM', issue.span.start, 1);
      if (variant === 'duplicate-tag' || variant === 'duplicate-destination') {
        assertions.equal('mutation: repeated item', issue.span.start, fixture.text.lastIndexOf(fixture.at!));
      }
    } },
  ]),
]);
