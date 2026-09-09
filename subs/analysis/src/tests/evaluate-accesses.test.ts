import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
async function stage(probe: string) {
  const root = await mkdtemp(join(tmpdir(), 'ramify-static-analysis-'));
  const registry = createDefaultTagRegistry();
  let source: SourceAnalysis | undefined;
  let view: Extract<Awaited<ReturnType<typeof readProject>>, { status: 'acquired' }>['view'] | undefined;
  try {
    for (const [path, text] of Object.entries({ ...files, 'subs/consumer/src/probe.ts': probe })) {
      await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text);
    }
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
