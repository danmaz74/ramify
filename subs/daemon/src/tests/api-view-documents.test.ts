import { describe, expect, it } from 'vitest';
import {
  renderApiView, renderCodeFence, renderCodeSpan, renderDocument, renderEntry, renderMeta,
} from '../api-view-documents.js';
import type {
  ApiViewAreaProjection, ApiViewEntry, ApiViewFile, ApiViewModuleProjection, ApiViewProjection,
} from '../../../analysis/src/interfaces/session.js';
import type { SymbolDetail } from '../../../analysis/subs/typescript/src/interfaces/source.js';

function original(owner: string, file: string, binding: string) {
  return { kind: 'code' as const, owner, file, binding };
}
function described(name: string, signature: string, documentation?: string): SymbolDetail {
  return documentation === undefined
    ? { state: 'described', original: original('m', 'f.ts', name), exportName: name, signature }
    : { state: 'described', original: original('m', 'f.ts', name), exportName: name, signature, documentation };
}
function truncated(name: string, signature: string): SymbolDetail {
  return { state: 'truncated', original: original('m', 'f.ts', name), exportName: name, signature, truncated: ['signature'] };
}
function unavailable(name: string): SymbolDetail {
  return { state: 'unavailable', original: original('m', 'f.ts', name), exportName: name, reason: 'unsupported-declaration' };
}
function entry(name: string, form: ApiViewEntry['form'], detail: SymbolDetail): ApiViewEntry {
  return { name, form, detail };
}
function file(category: ApiViewFile['category'], definingFile: string, entries: readonly ApiViewEntry[]): ApiViewFile {
  return { category, definingFile, entries };
}
function area(kind: 'ordinary' | 'tests', root: string, files: readonly ApiViewFile[],
  extra: Partial<Pick<ApiViewAreaProjection, 'coverage' | 'detailsUnavailable' | 'truncated'>> = {}): ApiViewAreaProjection {
  return { area: kind, root, files, coverage: 0, detailsUnavailable: 0, truncated: 0, ...extra };
}
function moduleProjection(id: string, directory: string, ordinary: ApiViewAreaProjection | null, tests: ApiViewAreaProjection | null = null): ApiViewModuleProjection {
  return { module: id, directory, ordinary, tests };
}
function projection(modules: readonly ApiViewModuleProjection[]): ApiViewProjection {
  return { schema: 'ramify.api-view-projection/1', sequence: 1, inputId: 'input-1', modules, bytes: 0 };
}

describe('I2A-06 minimal-described', () => {
  it('renders exactly a heading, a ts fence and one final newline for a described value entry with no documentation', () => {
    const document = renderDocument(file('external', 'subs/x/src/thing.ts', [entry('greet', 'value', described('greet', 'function greet(): void;'))]));
    expect(document.toString('utf8')).toBe('## `greet`\n\n```ts\nfunction greet(): void;\n```\n');
  });
  it('renders one optional paragraph after the fence when documentation is present', () => {
    const document = renderDocument(file('external', 'f.ts', [entry('greet', 'value', described('greet', 'function greet(): void;', 'Greets the caller.'))]));
    expect(document.toString('utf8')).toBe('## `greet`\n\n```ts\nfunction greet(): void;\n```\n\nGreets the caller.\n');
  });
});

describe('I2A-06 type-marker', () => {
  it('marks only a type-only entry, never a value entry, with no other availability marker', () => {
    const typeOnly = renderEntry(entry('Shape', 'type-only', described('Shape', 'interface Shape {\n}')));
    expect(typeOnly).toBe('## `Shape` [type-only]\n\n```ts\ninterface Shape {\n}\n```');
    const value = renderEntry(entry('greet', 'value', described('greet', 'function greet(): void;')));
    expect(value).not.toContain('[type-only]');
    expect(value).not.toMatch(/\[value\]|\[available\]/);
  });
});

describe('I2A-06 exception-markers', () => {
  it('renders bounded content plus [truncated] for a truncated entry', () => {
    const rendered = renderEntry(entry('big', 'value', truncated('big', 'function big(): void;')));
    expect(rendered).toBe('## `big` [truncated]\n\n```ts\nfunction big(): void;\n```');
  });
  it('renders [details-unavailable] and no fence for an unavailable entry', () => {
    const rendered = renderEntry(entry('hidden', 'value', unavailable('hidden')));
    expect(rendered).toBe('## `hidden` [details-unavailable]');
    expect(rendered).not.toContain('```');
  });
  it('orders [type-only] before [truncated] or [details-unavailable] when both apply', () => {
    expect(renderEntry(entry('Big', 'type-only', truncated('Big', 'type Big = unknown;')))).toBe('## `Big` [type-only] [truncated]\n\n```ts\ntype Big = unknown;\n```');
    expect(renderEntry(entry('Hidden', 'type-only', unavailable('Hidden')))).toBe('## `Hidden` [type-only] [details-unavailable]');
  });
});

describe('I2A-06 omitted-redundancy', () => {
  it('never emits a provider, path, tags, original ID, exposure, alias, availability field or placeholder prose', () => {
    const document = renderDocument(file('children', 'subs/y/src/thing.ts', [
      entry('greet', 'value', described('greet', 'function greet(): void;', 'Docs.')),
      entry('Shape', 'type-only', truncated('Shape', 'interface Shape {\n}')),
      entry('Hidden', 'value', unavailable('Hidden')),
    ]));
    const text = document.toString('utf8');
    for (const forbidden of ['provider', 'exposure', 'alias', 'availability', 'original', 'tag', 'TODO', 'unavailable reason']) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    const meta = renderMeta('m', 'r1', area('ordinary', 'src', [])).toString('utf8');
    expect(JSON.parse(meta)).not.toHaveProperty('provider');
    expect(JSON.parse(meta)).not.toHaveProperty('timestamp');
  });
});

describe('I2A-06 markdown-delimiters', () => {
  it('chooses a code span delimiter longer than the longest backtick run and pads a leading/trailing backtick', () => {
    expect(renderCodeSpan('plain')).toBe('`plain`');
    expect(renderCodeSpan('a`b')).toBe('``a`b``');
    expect(renderCodeSpan('a``b')).toBe('```a``b```');
    expect(renderCodeSpan('`leading')).toBe('`` `leading ``');
    expect(renderCodeSpan('trailing`')).toBe('`` trailing` ``');
  });
  it('the literal name is still findable inside the rendered span', () => {
    const rendered = renderCodeSpan('weird`name');
    expect(rendered).toContain('weird`name');
  });
  it('chooses a fence longer than any leading backtick run on a signature line, minimum three', () => {
    expect(renderCodeFence('function f(): void;', 'ts')).toBe('```ts\nfunction f(): void;\n```');
    expect(renderCodeFence('``` not really code', 'ts')).toBe('````ts\n``` not really code\n````');
    expect(renderCodeFence('````deeply nested', 'ts')).toBe('`````ts\n````deeply nested\n`````');
  });
  it('a signature containing backtick runs still renders as one valid, closed fence', () => {
    const rendered = renderDocument(file('external', 'f.ts', [
      entry('odd', 'value', described('odd', 'const odd: `template ${string}`;')),
    ])).toString('utf8');
    expect(rendered).toBe('## `odd`\n\n```ts\nconst odd: `template ${string}`;\n```\n');
  });
});

describe('I2A-06 metadata-minimal', () => {
  it('emits schema, module, area, revision in order, one line, final newline, no zero-valued exceptional counts', () => {
    const bytes = renderMeta('root/sub', 'rev-7', area('ordinary', 'subs/sub/src', []));
    expect(bytes.toString('utf8')).toBe('{"schema":"ramify.api-view/1","module":"root/sub","area":"ordinary","revision":"rev-7"}\n');
    expect(bytes.toString('utf8').split('\n')).toHaveLength(2);
    expect(bytes.toString('utf8').endsWith('\n')).toBe(true);
  });
  it('includes only the nonzero exceptional counts, in coverage/detailsUnavailable/truncated order', () => {
    const bytes = renderMeta('m', 'rev-1', area('tests', 'src/tests', [], { coverage: 2, truncated: 1 }));
    expect(JSON.parse(bytes.toString('utf8'))).toEqual({
      schema: 'ramify.api-view/1', module: 'm', area: 'tests', revision: 'rev-1', coverage: 2, truncated: 1,
    });
    expect(bytes.toString('utf8')).not.toContain('detailsUnavailable');
  });
});

describe('I2A-06 byte-determinism', () => {
  it('renders a byte-identical relative tree from a shuffled equivalent projection, with no absolute path, timestamp, PID or request ID', () => {
    const entries = [
      entry('greet', 'value', described('greet', 'function greet(): void;', 'Greets.')),
      entry('Shape', 'type-only', truncated('Shape', 'interface Shape {\n}')),
    ];
    const areaA = area('ordinary', 'subs/x/src', [file('external', 'a.ts', entries), file('children', 'b.ts', [entry('h', 'value', unavailable('h'))])]);
    const projectionA = projection([moduleProjection('x', 'subs/x', areaA)]);
    const shuffledArea = { ...areaA, files: [...areaA.files].reverse() };
    const projectionB = projection([moduleProjection('x', 'subs/x', shuffledArea)]);
    const renderedA = renderApiView(projectionA, 'rev-9');
    const renderedB = renderApiView(projectionB, 'rev-9');
    const flattenA = renderedA.flatMap(target => target.files.map(f => [f.relativePath, f.bytes.toString('utf8')] as const));
    const flattenB = renderedB.flatMap(target => target.files.map(f => [f.relativePath, f.bytes.toString('utf8')] as const));
    expect(new Map(flattenA)).toEqual(new Map(flattenB));
    const everything = flattenA.map(([, text]) => text).join('');
    expect(everything).not.toMatch(/\/(?:home|Users|tmp)\//);
    expect(everything).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(everything).not.toMatch(/\bpid\b/i);
    expect(everything).not.toContain('request');
  });
});

describe('renderApiView area/target shape', () => {
  it('renders the ordinary area and, when present, the testing area as independent targets in module order', () => {
    const ordinary = area('ordinary', 'subs/x/src', [file('external', 'a.ts', [entry('g', 'value', described('g', 'function g(): void;'))])]);
    const tests = area('tests', 'subs/x/src/tests', [file('external', 'a.ts', [entry('g', 'value', described('g', 'function g(): void;'))])]);
    const targets = renderApiView(projection([moduleProjection('x', 'subs/x', ordinary, tests)]), 'rev-1');
    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({ module: 'x', area: 'ordinary', root: 'subs/x/src' });
    expect(targets[1]).toMatchObject({ module: 'x', area: 'tests', root: 'subs/x/src/tests' });
    expect(targets[0].files.at(-1)!.relativePath).toBe('_meta.json');
    expect(targets[0].entries).toBe(1);
  });
  it('omits the testing target entirely when the module has no testing area', () => {
    const ordinary = area('ordinary', 'subs/x/src', []);
    const targets = renderApiView(projection([moduleProjection('x', 'subs/x', ordinary, null)]), 'rev-1');
    expect(targets).toHaveLength(1);
  });
  it('omits both targets when the module has no ordinary source area (no src/, so no src/tests/ either)', () => {
    const targets = renderApiView(projection([moduleProjection('x', 'subs/x', null, null)]), 'rev-1');
    expect(targets).toHaveLength(0);
  });
});
