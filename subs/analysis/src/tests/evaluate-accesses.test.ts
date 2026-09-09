import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { evaluateAccesses } from '../evaluate-accesses.js';
import { parseDescription } from '../../subs/descriptions/src/parse.js';
import { linkDescriptions } from '../../subs/descriptions/src/link.js';
import { buildModel, createDefaultTagRegistry, deriveSourceAreas } from '../../subs/model/src/index.js';
import type { ModelResult } from '../../subs/model/src/index.js';
import { readProject } from '../../subs/project/src/read-project.js';
import { createSourceAnalysis } from '../../subs/typescript/src/source-analysis.js';
import type { SourceAnalysis } from '../../subs/typescript/src/interfaces/source.js';

function valid<T>(result: ModelResult<T>): T {
  if (result.status !== 'valid') throw new Error(JSON.stringify(result));
  return result.value;
}
const files = {
  'package.json': '{"type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [] }, include: ['src', 'subs'] }),
  'module.ramify': 'ramify 1\nmodule fixture\nexpose-src safe from "interfaces/api.ts" tagged [browser] to descendants\nexpose-src unsafe, Contract from "interfaces/api.ts" to descendants\n',
  'src/interfaces/api.ts': 'export const safe = 1; export const unsafe = 2; export interface Contract {} export const privateValue = 3;',
  'src/init.ts': 'globalThis.console.log(1);',
  'src/tests/init.ts': 'globalThis.console.log(2);',
  'src/tests/style.css': ':root { color: red }',
  'src/tests/forward.ts': "export { safe as alias } from '../interfaces/api.js';",
  'src/bridge.ts': "export { alias } from './tests/forward.js';",
  'subs/consumer/module.ramify': 'ramify 1\nmodule consumer tagged [browser]\n',
};
async function stage(probe: string, overrides: Readonly<Record<string, string>> = {}, inspect?: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'ramify-static-analysis-'));
  const registry = createDefaultTagRegistry();
  let source: SourceAnalysis | undefined;
  let view: Extract<Awaited<ReturnType<typeof readProject>>, { status: 'acquired' }>['view'] | undefined;
  try {
    for (const [path, text] of Object.entries({ ...files, 'subs/consumer/src/probe.ts': probe, ...overrides })) {
      await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text);
    }
    await inspect?.(root);
    const acquired = await readProject({ request: { cwd: root, root, scope: 'whole-project', configuration: 'discover' }, parse: parseDescription,
      limits: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2,
        maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 } });
    if (acquired.status !== 'acquired') throw new Error(JSON.stringify(acquired));
    view = acquired.view;
    const inventory = view.inventory;
    const areas = inventory.modules.flatMap(module => valid(deriveSourceAreas(registry, module.id,
      module.areas.find(area => area.kind === 'ordinary')!.root, module.headerTags)));
    source = await createSourceAnalysis({ view, inventory, areas, limits: {
      maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 } });
    const catalog = await source.catalog();
    const linked = linkDescriptions({ registry, inventory, catalog });
    if (linked.status !== 'valid') throw new Error(JSON.stringify(linked));
    const model = valid(buildModel(linked.modelInput));
    const observed = await source.accesses();
    const evaluation = evaluateAccesses(model, observed.accesses, 100_000);
    expect((await view.seal()).status).toBe('coherent');
    return { model, ...observed, ...evaluation };
  } finally {
    try { await source?.dispose(); } finally { await view?.dispose(); await rm(root, { recursive: true, force: true }); }
  }
}

describe('analysis mapping of located static source requests', () => {
  it.each(['typescript', 'jsdoc'] as const)('keeps exposure, importer tags and testing origin on %s import types', async variant => {
    const queries = [
      ["../../../src/interfaces/api.js", 'Contract'],
      ["../../../src/interfaces/api.js", 'PrivateType'],
      ["../../../src/interfaces/api.js", 'UiType'],
      ["../../../src/tests/types.js", 'TestType'],
    ];
    const body = queries.map(([path, name], index) => variant === 'typescript'
      ? `type Local${index} = import('${path}').${name};`
      : `/** @typedef {import('${path}').${name}} Local${index} */`).join('\n') + '\nexport {};';
    const importer = `subs/consumer/src/probe.${variant === 'typescript' ? 'ts' : 'js'}`;
    const result = await stage(variant === 'typescript' ? body : 'export {};', {
      ...(variant === 'jsdoc' ? { [importer]: body } : {}),
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
        types: [], allowJs: true, checkJs: true, noEmit: true }, include: ['src', 'subs'] }),
      'module.ramify': files['module.ramify'] + 'expose-src UiType from "interfaces/api.ts" tagged [ui] to descendants\n',
      'src/interfaces/api.ts': files['src/interfaces/api.ts'] + 'export interface UiType {} export interface PrivateType {}',
      'src/tests/types.ts': 'export interface TestType {}',
    }, async root => {
      const compiler = await promisify(execFile)(process.execPath,
        [fileURLToPath(new URL('../../../../node_modules/typescript/lib/tsc.js', import.meta.url)), '--noEmit', '--project', join(root, 'tsconfig.json')],
        { cwd: root, timeout: 10_000 });
      expect([compiler.stdout, compiler.stderr]).toEqual(['', '']);
    });
    const accesses = result.accesses.filter(access => access.importer.file === importer);
    expect(accesses).toHaveLength(4);
    expect(accesses.every(access => !access.runtimeLoad && !access.coverageIds.length && access.selections[0].request === 'type-only'
      && access.selections[0].explicitType && access.form === (variant === 'typescript' ? 'import-type-query' : 'jsdoc-import-type'))).toBe(true);
    expect(accesses.flatMap(access => result.results.find(item => item.accessId === access.id)!.decisions.map(decision =>
      [decision.original?.id.binding, decision.status, decision.reason]))).toEqual([
      ['Contract', 'allowed', 'exposed'], ['PrivateType', 'denied', 'not-visible'], ['UiType', 'denied', 'required-importer-tag'],
      ['TestType', 'denied', 'testing-origin'],
    ]);
    expect(result.diagnostics.filter(issue => issue.location?.file === importer).map(issue => issue.code))
      .toEqual(['not-visible', 'required-importer-tag', 'testing-origin']);
  }, 30_000);

  it('matches compiler relative JSX priority with both JavaScript scripts present', async () => {
    const specifier = '../../../src/initialize.jsx';
    const result = await stage(`import '${specifier}';`, {
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
        types: [], allowJs: true, checkJs: true, jsx: 'preserve', noUncheckedSideEffectImports: true }, include: ['src', 'subs'] }),
      'src/initialize.js': 'globalThis.console.log(1);',
      'src/initialize.jsx': 'globalThis.console.log(2);',
    }, async root => {
      const compiler = await promisify(execFile)(process.execPath,
        [fileURLToPath(new URL('../../../../node_modules/typescript/lib/tsc.js', import.meta.url)),
          '--noEmit', '--traceResolution', '--project', join(root, 'tsconfig.json')], { cwd: root, timeout: 10_000 });
      expect(compiler.stderr).toBe('');
      expect(compiler.stdout).toContain(`Module name '${specifier}' was successfully resolved to '${join(root, 'src/initialize.jsx')}'`);
    });
    const access = result.accesses.find(access => access.specifier === specifier)!;
    expect(access.target).toMatchObject({ kind: 'application', origin: { file: 'src/initialize.jsx', area: { kind: 'ordinary' } } });
    expect(access.coverageIds).toEqual([]);
    expect(result.results.find(item => item.accessId === access.id)).toMatchObject({ outcome: 'checked', diagnostics: [],
      decisions: [{ status: 'allowed', reason: 'symbol-free', original: null }] });
  }, 30_000);

  it.each([
    { specifier: '@init', extension: '.jsx', suffix: '', expected: 'src/init.jsx' },
    { specifier: '../../../src/init.jsx', extension: '.jsx', suffix: '', expected: 'src/init.ts' },
    { specifier: '@init', extension: '.js', suffix: '', expected: 'src/init.js' },
    { specifier: '../../../src/init.js', extension: '.js', suffix: '', expected: 'src/init.ts' },
    { specifier: '@init', extension: '.jsx', suffix: '.native', expected: 'src/init.native.jsx' },
    { specifier: '../../../src/init.jsx', extension: '.jsx', suffix: '.native', expected: 'src/init.native.ts' },
  ])('matches compiler exact paths priority for $specifier ($extension, suffix "$suffix")', async ({ specifier, extension, suffix, expected }) => {
    const importer = 'subs/consumer/src/probe.ts';
    const result = await stage(`import '${specifier}';`, {
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [],
        allowJs: true, checkJs: true, jsx: 'preserve', noUncheckedSideEffectImports: true,
        moduleSuffixes: suffix ? [suffix, ''] : [''], paths: { '@init': [`./src/init${extension}`] } }, include: ['src', 'subs'] }),
      [`src/init${extension}`]: 'globalThis.console.log(3);',
      ...(suffix ? { [`src/init${suffix}${extension}`]: 'globalThis.console.log(4);',
        [`src/init${suffix}.ts`]: 'globalThis.console.log(5);' } : {}),
    }, async root => {
      const compiler = await promisify(execFile)(process.execPath,
        [fileURLToPath(new URL('../../../../node_modules/typescript/lib/tsc.js', import.meta.url)),
          '--noEmit', '--traceResolution', '--project', join(root, 'tsconfig.json')], { cwd: root, timeout: 10_000 });
      expect(compiler.stderr).toBe('');
      expect(compiler.stdout).toContain(`Module name '${specifier}' was successfully resolved to '${join(root, expected)}'`);
    });
    const access = result.accesses.find(access => access.importer.file === importer)!;
    expect(access.target).toMatchObject({ kind: 'application', origin: { file: expected, area: { kind: 'ordinary', profile: [] } } });
    expect(access.coverageIds).toEqual([]);
    expect(result.results.find(item => item.accessId === access.id)).toMatchObject({ outcome: 'checked', diagnostics: [],
      decisions: [{ status: 'allowed', reason: 'symbol-free', original: null }] });
  }, 30_000);

  it.each(['.js', '.jsx'])('matches compiler script substitution priority for a %s alias', async extension => {
    const importer = 'subs/consumer/src/probe.ts';
    const result = await stage("import '@init';", {
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [],
        noUncheckedSideEffectImports: true, paths: { '@init': [`./src/init${extension}`, './src/tests/init.ts'] } }, include: ['src', 'subs'] }),
    }, async root => {
      const compiler = await promisify(execFile)(process.execPath,
        [fileURLToPath(new URL('../../../../node_modules/typescript/lib/tsc.js', import.meta.url)),
          '--noEmit', '--traceResolution', '--project', join(root, 'tsconfig.json')], { cwd: root, timeout: 10_000 });
      expect(compiler.stderr).toBe('');
      expect(compiler.stdout).toContain(`Module name '@init' was successfully resolved to '${join(root, 'src/init.ts')}'`);
    });
    const access = result.accesses.find(access => access.importer.file === importer)!;
    expect(access.target).toMatchObject({ kind: 'application', origin: { file: 'src/init.ts', area: { kind: 'ordinary', profile: [] } } });
    expect(access.coverageIds).toEqual([]);
    expect(result.results.find(item => item.accessId === access.id)).toMatchObject({ outcome: 'checked', diagnostics: [],
      decisions: [{ status: 'allowed', reason: 'symbol-free', original: null }] });
  }, 30_000);

  it('preserves an independent private denial beside duplicate local aliases', async () => {
    const importer = 'subs/consumer/src/probe.ts';
    const baseline = await stage("import { safe, privateValue } from '../../../src/interfaces/api.js';");
    expect(baseline.diagnostics.filter(issue => issue.location?.file === importer).map(issue => issue.code)).toEqual(['not-visible']);
    const result = await stage("import { safe as clash, privateValue, safe as clash } from '../../../src/interfaces/api.js';");
    const accesses = result.accesses.filter(access => access.importer.file === importer);
    expect(accesses.map(access => [access.selections[0].localName, access.selections[0].status])).toEqual([
      ['clash', 'unresolved'], ['privateValue', 'resolved'], ['clash', 'unresolved'],
    ]);
    expect(result.coverage.filter(issue => issue.location.file === importer).map(issue => issue.code)).toEqual(['compiler-blocked', 'compiler-blocked']);
    const denial = result.diagnostics.filter(issue => issue.location?.file === importer);
    expect(denial).toEqual([expect.objectContaining({ code: 'not-visible', category: 'import',
      importer: expect.objectContaining({ owner: 'fixture/consumer' }),
      original: { kind: 'code', owner: 'fixture', file: 'interfaces/api.ts', binding: 'privateValue' },
      location: expect.objectContaining({ file: importer, line: 1, column: 25 }),
    })]);
    expect(result.results.find(item => item.accessId === accesses[1].id)).toMatchObject({ outcome: 'checked', coverage: [],
      decisions: [expect.objectContaining({ status: 'denied', reason: 'not-visible' })] });
  }, 30_000);

  it.each(['./init.js', 'init.js'])('keeps wildcard paths resolution consistent with the compiler for %s', async specifier => {
    const importer = 'subs/consumer/src/probe.ts';
    const relative = specifier.startsWith('./');
    const result = await stage(`import '${specifier}';`, {
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [],
        noUncheckedSideEffectImports: true, paths: { '*': ['./subs/consumer/src/tests/*'] } }, include: ['src', 'subs'] }),
      'subs/consumer/src/tests/init.ts': 'globalThis.console.log(1);',
    }, async root => {
      const run = promisify(execFile)(process.execPath, [fileURLToPath(new URL('../../../../node_modules/typescript/lib/tsc.js', import.meta.url)),
        '--noEmit', '--project', join(root, 'tsconfig.json')], { cwd: root, timeout: 10_000 });
      if (relative) await expect(run).rejects.toMatchObject({ code: 1,
        stdout: expect.stringContaining("error TS2882: Cannot find module or type declarations for side-effect import of './init.js'") });
      else await expect(run).resolves.toMatchObject({ stdout: '', stderr: '' });
    });
    const access = result.accesses.find(access => access.importer.file === importer)!;
    const evaluated = result.results.find(item => item.accessId === access.id)!;
    if (relative) {
      expect(access.target).toEqual({ kind: 'unresolved' });
      expect(result.coverage.filter(issue => access.coverageIds.includes(issue.id)).map(issue => issue.code)).toEqual(['unresolved-target']);
      expect(evaluated).toMatchObject({ outcome: 'unverifiable', decisions: [], diagnostics: [] });
      expect(result.diagnostics.filter(issue => issue.location?.file === importer)).toEqual([]);
    } else {
      expect(access.target).toMatchObject({ kind: 'application', origin: { file: 'subs/consumer/src/tests/init.ts', area: { kind: 'tests' } } });
      expect(access.coverageIds).toEqual([]);
      expect(evaluated.decisions).toEqual([expect.objectContaining({ status: 'denied', reason: 'testing-origin' })]);
    }
  }, 30_000);

  it('checks every mixed binding and retains denial, tag and exposure evidence after disposal', async () => {
    const result = await stage(`import { safe, unsafe, Contract, privateValue } from '../../../src/interfaces/api.js';`);
    const decisions = result.results.flatMap(result => result.decisions).filter(decision => decision.question.importer.area.owner === 'fixture/consumer');
    expect(decisions.map(decision => [decision.original?.id.binding, decision.status, decision.reason]).sort()).toEqual([
      ['safe', 'allowed', 'exposed'], ['unsafe', 'denied', 'required-symbol-tag'],
      ['Contract', 'allowed', 'exposed'], ['privateValue', 'denied', 'not-visible'],
    ].sort());
    expect(decisions.find(decision => decision.original?.id.binding === 'Contract')!.question.selection!.request).toBe('type-only');
    const issue = result.diagnostics.find(issue => issue.code === 'required-symbol-tag')!;
    expect(issue).toMatchObject({ category: 'import', importer: { owner: 'fixture/consumer', profile: ['browser'] },
      original: { owner: 'fixture', file: 'interfaces/api.ts', binding: 'unsafe' }, location: { file: 'subs/consumer/src/probe.ts', line: 1 } });
    expect(issue.related).toEqual(expect.arrayContaining([expect.objectContaining({ file: 'module.ramify', line: 4 }), expect.objectContaining({ file: 'src/interfaces/api.ts' })]));
    expect(issue.message).toContain('browser');
    const serializable = { results: result.results, diagnostics: result.diagnostics };
    expect(JSON.parse(JSON.stringify(serializable))).toEqual(serializable);
    expect(evaluateAccesses(result.model, [...result.accesses].reverse(), 100_000)).toEqual(serializable);
  }, 30_000);

  it('applies the origin guard to symbol-free source and stylesheet loads, and to every forwarded hop', async () => {
    const result = await stage(`import '../../../src/init.js';
import '../../../src/tests/init.js';
import '../../../src/tests/style.css';
import { alias } from '../../../src/bridge.js';`);
    const decisions = result.results.flatMap(result => result.decisions).filter(decision => decision.question.importer.area.owner === 'fixture/consumer');
    const ordinary = decisions.find(decision => decision.question.target.file === 'src/init.ts')!;
    expect(ordinary).toMatchObject({ status: 'allowed', reason: 'symbol-free', original: null });
    for (const target of ['src/tests/init.ts', 'src/tests/style.css']) {
      const denied = decisions.find(decision => decision.question.target.file === target)!;
      expect(denied).toMatchObject({ status: 'denied', reason: 'testing-origin', original: null,
        question: { selection: null }, blockingOrigins: [{ file: target, area: { kind: 'tests' } }] });
    }
    const forwarded = decisions.find(decision => decision.question.target.file === 'src/bridge.ts')!;
    expect(forwarded).toMatchObject({ status: 'denied', reason: 'testing-origin', original: { id: { file: 'interfaces/api.ts', binding: 'safe' }, tags: ['browser'] } });
    expect(forwarded.blockingOrigins.map(origin => origin.file)).toEqual(['src/tests/forward.ts']);
    expect(result.coverage).toEqual([]);
  }, 30_000);

  it('separates missing exports and unresolved or deferred work from definite decisions', async () => {
    const result = await stage(`import { Missing, safe } from '../../../src/interfaces/api.js';
import { Unknown } from '@missing/app';
import * as ns from '../../../src/interfaces/api.js'; void ns;
`);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'missing-export', code: 'missing-export',
      location: { file: 'subs/consumer/src/probe.ts', start: 9, end: 16, line: 1, column: 10 } })]));
    const unresolved = result.accesses.find(access => access.specifier === '@missing/app')!;
    expect(result.results.find(item => item.accessId === unresolved.id)).toMatchObject({ outcome: 'unverifiable', decisions: [] });
    const namespace = result.accesses.find(access => access.form === 'namespace-import')!;
    expect(result.results.find(item => item.accessId === namespace.id)!.outcome).toBe('mixed');
    expect(result.results.flatMap(item => item.decisions).some(decision => decision.original?.id.binding === 'safe' && decision.status === 'allowed')).toBe(true);
    expect(() => evaluateAccesses(result.model, result.accesses, 1)).toThrow('Source diagnostics exceed');
  }, 30_000);
});

async function compilerClean(root: string): Promise<void> {
  const compiler = await promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('../../../../node_modules/typescript/lib/tsc.js', import.meta.url)), '--noEmit', '--project', join(root, 'tsconfig.json')],
    { cwd: root, timeout: 10_000 });
  expect([compiler.stdout, compiler.stderr]).toEqual(['', '']);
}
const namespaceImporter = 'subs/consumer/src/probe.ts';
const namespaceApi = '../../../src/interfaces/api.js';

describe('iteration 11 constraint regressions', () => {
  it.each(['static', 'awaited'].flatMap(kind => ['direct', 'shorthand', 'shorthand-with-denial'].map(flow => ({ kind, flow }))))
  ('reports $kind namespace $flow escape with any known denial intact', async ({ kind, flow }) => {
    const declaration = kind === 'static' ? `import * as ns from '${namespaceApi}';` : `const ns = await import('${namespaceApi}');`;
    const result = await stage(`${declaration}
declare function consume(value: unknown): void;
${flow === 'shorthand-with-denial' ? 'void ns.privateValue;' : ''}
consume(${flow === 'direct' ? 'ns' : '{ ns }'});
export {};`, {}, compilerClean);
    const accesses = result.accesses.filter(access => access.importer.file === namespaceImporter);
    const coverage = result.coverage.filter(issue => issue.location.file === namespaceImporter);
    expect(coverage.map(issue => issue.code)).toEqual(['namespace-escape']);
    expect(coverage[0].location.line).toBe(4);
    expect(accesses.flatMap(access => access.selections.map(selection => selection.original?.binding)))
      .toEqual(flow === 'shorthand-with-denial' ? ['privateValue'] : []);
    expect(result.diagnostics.filter(issue => issue.location?.file === namespaceImporter).map(issue => issue.code))
      .toEqual(flow === 'shorthand-with-denial' ? ['not-visible'] : []);
    const escape = accesses.find(access => access.coverageIds.includes(coverage[0].id))!;
    expect(result.results.find(item => item.accessId === escape.id)).toMatchObject({ outcome: 'mixed', coverage: [coverage[0].id] });
  }, 30_000);

  it.each([
    { name: 'statement type export', bridge: "export type { privateValue as selected } from './interfaces/api.js';", binding: 'selected' },
    { name: 'inline type export', bridge: "export { type privateValue as selected } from './interfaces/api.js';", binding: 'selected' },
    { name: 'local type import relay', bridge: "import type { privateValue as selected } from './interfaces/api.js'; export { selected };", binding: 'selected' },
    { name: 'type star export', bridge: "export type * from './interfaces/api.js';", binding: 'privateValue' },
    { name: 'type namespace export', bridge: "export type * as selected from './interfaces/api.js';", binding: 'selected', namespace: true },
    { name: 'named relay of type export', bridge: "export { selected } from './erased.js';", binding: 'selected' },
  ])('excludes $name from runtime namespace membership but keeps explicit type checks', async ({ bridge, binding, namespace }) => {
    // The pinned compiler retains type-star keys in its namespace type. Keep
    // that fixture compiler-valid while independently asserting runtime erasure.
    const result = await stage(`type All = typeof import('../../../src/type-bridge.js');
type AssertNever<T extends never> = T;
type RuntimeKeys = ${bridge.startsWith('export type * from') ? 'keyof All' : 'AssertNever<keyof All>'};
import type { ${binding} } from '../../../src/type-bridge.js';
type Explicit = typeof ${binding}${namespace ? '.privateValue' : ''};`, {
      'src/type-bridge.ts': bridge,
      'src/erased.ts': "export type { privateValue as selected } from './interfaces/api.js';",
    }, compilerClean);
    const accesses = result.accesses.filter(access => access.importer.file === namespaceImporter);
    const whole = accesses.filter(access => access.selectionForm === 'whole-namespace');
    expect(whole).toHaveLength(1);
    expect(whole[0]).toMatchObject({ runtimeLoad: false, selections: [], coverageIds: [] });
    expect(result.results.find(item => item.accessId === whole[0].id)).toMatchObject({ outcome: 'checked', diagnostics: [] });
    const explicit = accesses.filter(access => access.form === 'import-type');
    expect(explicit.flatMap(access => access.selections.map(selection => [selection.original, selection.request, selection.status])))
      .toEqual([[{ kind: 'code', owner: 'fixture', file: 'interfaces/api.ts', binding: 'privateValue' }, 'type-only', 'resolved']]);
    expect(result.model.originals.find(original => original.id.binding === 'privateValue')!.hasValue).toBe(true);
    expect(result.diagnostics.filter(issue => issue.location?.file === namespaceImporter).map(issue => issue.code)).toEqual(['not-visible']);
  }, 30_000);

  it('keeps value-forwarded runtime membership and type-only nested membership separate', async () => {
    const result = await stage(`type All = typeof import('../../../src/outer.js');
type AssertNever<T extends never> = T;
type Empty = AssertNever<keyof All['erased']>;
type AssertKey<T extends 'selected'> = T;
type RuntimeKeys = AssertKey<keyof All['live']>;`, {
      'src/erased.ts': "export type { privateValue as selected } from './interfaces/api.js';",
      'src/live.ts': "export { privateValue as selected } from './interfaces/api.js';",
      'src/outer.ts': "export * as erased from './erased.js'; export * as live from './live.js';",
    }, compilerClean);
    const accesses = result.accesses.filter(access => access.importer.file === namespaceImporter);
    expect(accesses.flatMap(access => access.selections.map(selection => [selection.exportedName, selection.original?.binding, selection.request])))
      .toEqual([['live.selected', 'privateValue', 'type-only']]);
    expect(result.coverage.filter(issue => issue.location.file === namespaceImporter)).toEqual([]);
    expect(result.diagnostics.filter(issue => issue.location?.file === namespaceImporter).map(issue => issue.code)).toEqual(['not-visible']);
  }, 30_000);

  it.each(['Merged', 'Plain'].flatMap(binding => ['()', '.name', '.call(null)', "['name']"].map(property => ({ binding, property }))))
  ('checks $binding as a value for ordinary function access $property', async ({ binding, property }) => {
    const result = await stage(`import * as ns from '${namespaceApi}'; void ns.${binding}${property};`, {
      'src/interfaces/api.ts': files['src/interfaces/api.ts'] + '\nexport function Merged() { return 1; }\nexport namespace Merged { export const member = 2; }\nexport function Plain() { return 3; }',
      'module.ramify': files['module.ramify'] + 'expose-src Merged, Plain from "interfaces/api.ts" tagged [browser] to descendants\n',
    }, compilerClean);
    const accesses = result.accesses.filter(access => access.importer.file === namespaceImporter);
    expect(accesses.flatMap(access => access.selections.map(selection => [selection.original?.binding, selection.request, selection.status])))
      .toEqual([[binding, 'value', 'resolved']]);
    expect(accesses[0].selections[0].location).toMatchObject({ file: namespaceImporter, line: 1 });
    expect(result.coverage.filter(issue => issue.location.file === namespaceImporter)).toEqual([]);
    expect(result.diagnostics.filter(issue => issue.location?.file === namespaceImporter)).toEqual([]);
    expect(result.results.find(item => item.accessId === accesses[0].id)).toMatchObject({ outcome: 'checked', decisions: [{ status: 'allowed', reason: 'exposed' }] });
  }, 30_000);

  it('still checks an actual merged namespace export as its own original', async () => {
    const result = await stage(`import * as ns from '${namespaceApi}'; void ns.Merged.member;`, {
      'src/interfaces/api.ts': files['src/interfaces/api.ts'] + '\nexport function Merged() { return 1; }\nexport namespace Merged { export const member = 2; }',
      'module.ramify': files['module.ramify'] + 'expose-src Merged from "interfaces/api.ts" tagged [browser] to descendants\n',
    }, compilerClean);
    const accesses = result.accesses.filter(access => access.importer.file === namespaceImporter);
    expect(accesses.flatMap(access => access.selections.map(selection => selection.original?.binding))).toEqual(['Merged/member']);
    expect(result.diagnostics.filter(issue => issue.location?.file === namespaceImporter).map(issue => issue.code)).toEqual(['not-visible']);
  }, 30_000);

  it.each([false, true].flatMap(incomplete => [false, true].map(nested => ({ incomplete, nested }))))
  ('requires containing namespace completeness for absent members (incomplete=$incomplete, nested=$nested)', async ({ incomplete, nested }) => {
    const target = nested ? 'outer' : 'relay', prefix = nested ? 'outer.ns' : 'ns';
    const result = await stage(`type Missing = typeof import('../../../src/${target}.js').${prefix}.absent;
type Known = typeof import('../../../src/${target}.js').${prefix}.safe;`, {
      'src/namespace-source.ts': "export { safe } from './interfaces/api.js';" + (incomplete ? " export * from './missing.js';" : ''),
      'src/namespace-bridge.ts': "export * as ns from './namespace-source.js';",
      'src/relay.ts': "export { ns } from './namespace-bridge.js';",
      'src/outer.ts': "export * as outer from './relay.js';",
    }, async root => {
      try { await compilerClean(root); throw new Error('Expected intentional missing-source/member compiler diagnostic'); }
      catch (error) { expect((error as { stdout?: string }).stdout).toContain(incomplete ? 'TS2307' : 'TS2694'); }
    });
    const accesses = result.accesses.filter(access => access.importer.file === namespaceImporter);
    expect(accesses.flatMap(access => access.selections.map(selection => [selection.exportedName, selection.status])))
      .toEqual([[`${prefix}.absent`, incomplete ? 'unresolved' : 'missing-export'], [`${prefix}.safe`, 'resolved']]);
    const missing = accesses[0], known = accesses[1];
    const coverage = result.coverage.filter(issue => issue.location.file === namespaceImporter);
    if (incomplete) {
      expect(coverage.map(issue => issue.code)).toEqual(['incomplete-exports']);
      expect(coverage[0].location).toMatchObject({ file: namespaceImporter, line: 1 });
      expect(coverage[0].related.some(location => location.file === 'src/namespace-bridge.ts' || location.file === 'src/namespace-source.ts')).toBe(true);
      expect(result.results.find(item => item.accessId === missing.id)).toMatchObject({ outcome: 'mixed', diagnostics: [] });
    } else expect(coverage).toEqual([]);
    expect(result.diagnostics.filter(issue => issue.location?.file === namespaceImporter).map(issue => issue.code))
      .toEqual(incomplete ? [] : ['missing-export']);
    expect(known.selections[0].original).toEqual({ kind: 'code', owner: 'fixture', file: 'interfaces/api.ts', binding: 'safe' });
    expect(result.results.find(item => item.accessId === known.id)).toMatchObject({ outcome: 'checked', decisions: [{ status: 'allowed', reason: 'exposed' }] });
  }, 30_000);
});
