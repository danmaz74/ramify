import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ModuleId, OriginalId } from '../../subs/model/src/interfaces/model.js';
import type { SymbolDetail } from '../../subs/typescript/src/interfaces/source.js';
import { architectInstructions, renderArchitectView } from '../architect-render.js';
import { planArchitectView, projectArchitectView } from '../architect-view.js';
import { analyzeDependencyDiagram } from '../dependency-analyzer.js';
import type { ArchitectDependencies, ArchitectModuleFacts, ArchitectSymbol, ArchitectTestRecord, ArchitectViewProjection,
  RenderedArchitectView } from '../interfaces/architect-view.js';
import type { ArchitectMeasurements } from '../interfaces/measurements.js';
import type { DependencyBoundaryFact, DependencyDiagramFacts, TestReferenceFacts } from '../interfaces/dependency-diagram.js';
import { architectLimits, architectProject } from './architect-fixture.js';
import { opened, timeout } from './session-test-fixture.js';

const tests = fileURLToPath(new URL('.', import.meta.url));
const toolkit = fileURLToPath(new URL('../../../../', import.meta.url));
const inputId = 'input/1:architect';
const revision = 'rev/1:architect';

/**
 * The `architect` fixture's real projection, dependency facts and test
 * references: the projection from an in-process session's compiler, the facts
 * and references from one run of the lean dependency analyzer over the same
 * revision's report. All carry the fixed `inputId`, because the fixture's own
 * input identity depends on its temporary root.
 */
const real = { projection: null as unknown as ArchitectViewProjection, facts: null as unknown as DependencyDiagramFacts,
  references: null as unknown as TestReferenceFacts, measurements: null as unknown as ArchitectMeasurements, root: '' };
beforeAll(() => architectProject(async (root, inputs) => {
  const { handle, revision: opening, state } = await opened(inputs);
  try {
    const facts = state.facts!;
    const plan = planArchitectView(facts);
    if (plan.status !== 'planned') throw new Error(JSON.stringify(plan));
    const provided = {
      details: await state.adapter!.details(plan.requests, architectLimits.details),
      shapes: await state.adapter!.shapes(plan.requests),
      tests: await state.adapter!.testTitles(plan.testFiles, architectLimits.tests),
      features: await Promise.all(plan.features.map(async file => ({ file, text: await readFile(join(root, file), 'utf8') }))),
    };
    const projected = projectArchitectView(facts, 3, inputId, provided, architectLimits);
    if (projected.status !== 'projected') throw new Error(JSON.stringify(projected));
    const report = (await handle.report())!;
    expect(report.inputId).toBe(opening.inputId);
    const analyzed = await analyzeDependencyDiagram({ project: inputs.project, report,
      limits: { source: inputs.limits.source, maxResultBytes: 16 * 1024 ** 2, deadlineMs: 120_000 } });
    if (analyzed.status !== 'ready') throw new Error(JSON.stringify(analyzed));
    expect(analyzed.diagram.inputId).toBe(opening.inputId);
    expect(analyzed.testReferences?.inputId).toBe(opening.inputId);
    real.projection = projected.projection;
    real.facts = { ...analyzed.diagram, inputId };
    real.references = { ...analyzed.testReferences!, inputId };
    const measurements = await handle.measurements(opening.sequence);
    if (measurements.status !== 'measured') throw new Error(JSON.stringify(measurements));
    real.measurements = { state: 'measured', views: { state: 'unavailable', reason: 'not-requested' },
      modules: measurements.measurements.modules };
    real.root = root;
  } finally { await handle.dispose(); }
}), timeout);

const measured = (): ArchitectDependencies => ({ state: 'measured', facts: real.facts, testReferences: real.references });
/** Measured dependency facts whose test references alone were refused. */
const unreferenced = (): ArchitectDependencies => ({ state: 'measured', facts: real.facts, testReferences: null });
const unavailable: ArchitectDependencies = { state: 'unavailable', reason: 'wait-limit' };
const unmeasured = { state: 'unavailable', reason: 'analysis-failed' } as const;
const renderView = (input: Omit<Parameters<typeof renderArchitectView>[0], 'measurements'>): RenderedArchitectView =>
  renderArchitectView({ ...input, measurements: unmeasured });
const render = (dependencies: ArchitectDependencies, projection = real.projection): RenderedArchitectView =>
  renderArchitectView({ revision, projection, dependencies, measurements: real.measurements });
const text = (view: RenderedArchitectView, path: string): string => {
  const found = view.files.find(file => file.path === path);
  if (!found) throw new Error(`No file ${path}`);
  return found.text;
};
const lines = (view: RenderedArchitectView, path: string): Record<string, unknown>[] =>
  text(view, path).split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
const byteOrdered = (values: readonly string[]): string[] => [...values].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));

/** Every file of a view as one text, each under a `==> path <==` line, for byte-exact comparison with a golden file. */
const serialized = (view: RenderedArchitectView): string => view.files.map(file => `==> ${file.path} <==\n${file.text}`).join('\n');
async function golden(name: string, actual: string): Promise<void> {
  const path = join(tests, 'fixtures', name);
  if (process.env.RAMIFY_UPDATE_GOLDEN === '1') {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, actual);
  }
  expect(actual).toBe(await readFile(path, 'utf8'));
}

const behaviorFields = ['module', 'name', 'binding', 'as', 'asMore', 'role', 'shape', 'to', 'tags', 'reexposed', 'behavioral',
  'behavioralMore', 'nonBehavioral', 'nonBehavioralMore', 'unclassified', 'unclassifiedMore', 'sig', 'doc', 'cut', 'detail', 'file'];
const supportingFields = behaviorFields.flatMap(field => field === 'shape' ? ['kind', 'value'] : [field]);
/** The keys appear in the specification's order, `file` last, and no value is `null`. */
function expectFieldOrder(record: Record<string, unknown>, fields: readonly string[]): void {
  const keys = Object.keys(record);
  expect(keys.map(key => fields.indexOf(key))).toEqual(keys.map(key => fields.indexOf(key)).sort((a, b) => a - b));
  expect(keys.every(key => fields.includes(key))).toBe(true);
  expect(keys.at(-1)).toBe('file');
  expect(Object.values(record)).not.toContain(null);
}

const modules = ['', 'alpha/', 'beta/', 'checks/', 'core/', 'core/engine/', 'gamma/'];

describe('renderArchitectView: the architect fixture (golden)', () => {
  it('reads the fixture dependency boundaries this test relies on', () => {
    expect(real.facts.boundaries.map(fact => [fact.consumer, fact.importedModule, fact.original.binding, fact.classification])).toEqual([
      ['fixture', 'fixture/core', 'run', 'behavioral'],
      ['fixture/alpha', 'fixture/core', 'Engine', 'non-behavioral'],
      ['fixture/alpha', 'fixture/core/engine', 'Engine', 'behavioral'],
      ['fixture/beta', 'fixture/core', 'run', 'behavioral'],
      ['fixture/beta', 'fixture/core', 'Engine', 'non-behavioral'],
      ['fixture/core', 'fixture/core/engine', 'Engine', 'behavioral'],
      ['fixture/core/engine', 'fixture', 'Config', 'non-behavioral'],
      ['fixture/gamma', 'fixture/core/engine', 'loose', 'unknown'],
    ]);
  });

  it('renders the exact golden files with measured dependencies', () => golden('architect-view-measured.txt', serialized(render(measured()))));
  it('renders the exact golden files with measured dependencies and no test references',
    () => golden('architect-view-measured-unreferenced.txt', serialized(render(unreferenced()))));
  it('renders the exact golden files with unavailable dependencies', () => golden('architect-view-unavailable.txt', serialized(render(unavailable))));
});

describe('renderArchitectView: layout (AV12)', () => {
  it('gives every module a directory with the four files, the root module at the view root, in byte order', () => {
    for (const dependencies of [measured(), unavailable]) {
      const view = render(dependencies);
      const expected = ['_meta.json', 'README.md', ...modules.flatMap(directory =>
        ['module.json', 'behavior.jsonl', 'supporting.jsonl', 'tests.jsonl'].map(file => `${directory}${file}`))];
      expect(view.files.map(file => file.path)).toEqual(byteOrdered(expected));
      expect(view.modules).toBe(7);
      expect(view.dependencies).toBe(dependencies.state);
      for (const file of view.files) expect(file.text.endsWith('\n')).toBe(true);
      // A module with no records of one kind has a file holding only a newline.
      for (const empty of ['beta/supporting.jsonl', 'beta/tests.jsonl', 'gamma/tests.jsonl', 'alpha/tests.jsonl', 'tests.jsonl']) {
        expect(text(view, empty)).toBe('\n');
      }
      const records = view.files.filter(file => file.path.endsWith('.jsonl')).reduce((total, file) => total + file.text.split('\n').filter(Boolean).length, 0);
      expect(view.records).toBe(records);
      expect(view.records).toBe(real.projection.symbols.length + real.projection.tests.length);
      expect(view.bytes).toBe(view.files.reduce((total, file) => total + Buffer.byteLength(file.text), 0));
    }
  });
});

describe('renderArchitectView: records (AV13)', () => {
  it('writes the fixture records in field order, omitting optional fields', () => {
    for (const dependencies of [measured(), unavailable]) {
      const view = render(dependencies);
      for (const directory of modules) {
        for (const record of lines(view, `${directory}behavior.jsonl`)) expectFieldOrder(record, behaviorFields);
        for (const record of lines(view, `${directory}supporting.jsonl`)) {
          expectFieldOrder(record, supportingFields);
          expect(record).not.toHaveProperty('shape');
        }
      }
    }
    const view = render(measured());
    expect(lines(view, 'core/engine/behavior.jsonl').find(record => record.name === 'default')).toEqual({ module: 'fixture/core/engine',
      name: 'default', binding: 'boot', role: 'internal', shape: 'callable', behavioral: [], nonBehavioral: [],
      sig: 'function default(): void;', file: 'subs/core/subs/engine/src/engine.ts' });
    expect(lines(view, 'core/engine/behavior.jsonl').find(record => record.name === 'begin')).toMatchObject({ as: ['launch'], to: ['parent'],
      reexposed: [{ by: 'fixture/core', to: ['parent'] }, { by: 'fixture', to: ['descendants'] }] });
    // The stylesheet has no signature: its detail says why.
    expect(lines(view, 'alpha/supporting.jsonl').find(record => record.kind === 'resource')).toEqual({ module: 'fixture/alpha', name: 'default',
      role: 'internal', kind: 'resource', value: true, nonBehavioral: [], detail: 'unsupported-declaration', file: 'subs/alpha/src/style.css' });
    // A type-only original has no `value`.
    expect(lines(view, 'supporting.jsonl')).toEqual([{ module: 'fixture', name: 'Config', role: 'exposed', kind: 'interface',
      to: ['descendants'], nonBehavioral: ['fixture/core/engine'], sig: 'interface Config {\n    readonly name: string;\n}',
      doc: 'The project configuration.', file: 'src/interfaces/config.ts' }]);
  });

  it('bounds exposure names at four and consumer lists at twelve, each with a count of the rest', () => {
    const consumers = Array.from({ length: 15 }, (_, index) => `app/c${String(index).padStart(2, '0')}`);
    const many = symbol('app/lib', 'many', { role: 'exposed', destinations: ['parent'], exposureNames: ['f', 'e', 'd', 'c', 'b', 'a'] });
    const data = symbol('app/lib', 'data', { kind: 'value', behavior: null });
    const facts = diagram([
      ...consumers.map(consumer => boundary(consumer, many.original, 'behavioral')),
      ...consumers.map(consumer => boundary(consumer, data.original, 'non-behavioral')),
      ...consumers.slice(0, 13).map(consumer => boundary(`${consumer}x`, many.original, 'unknown')),
    ]);
    const view = renderView({ revision, projection: projection([many, data], [...consumers, ...consumers.slice(0, 13).map(c => `${c}x`)]),
      dependencies: { state: 'measured', facts, testReferences: null } });
    const [record] = lines(view, 'lib/behavior.jsonl');
    expect(record).toMatchObject({ as: ['a', 'b', 'c', 'd'], asMore: 2, behavioral: consumers.slice(0, 12), behavioralMore: 3,
      nonBehavioral: [], unclassified: consumers.slice(0, 12).map(c => `${c}x`), unclassifiedMore: 1 });
    expectFieldOrder(record!, behaviorFields);
    const [supporting] = lines(view, 'lib/supporting.jsonl');
    expect(supporting).toMatchObject({ nonBehavioral: consumers.slice(0, 12), nonBehavioralMore: 3 });
    expect(supporting).not.toHaveProperty('behavioral');
    expect(supporting).not.toHaveProperty('unclassified');
    // Twelve fit without a count.
    const twelve = renderView({ revision, projection: projection([many], consumers), dependencies: { state: 'measured',
      facts: diagram(consumers.slice(0, 12).map(consumer => boundary(consumer, many.original, 'behavioral'))), testReferences: null } });
    expect(Object.keys(lines(twelve, 'lib/behavior.jsonl')[0]!)).not.toContain('behavioralMore');
  });

  it('records cut fields and unavailable details as specified', () => {
    const detail = (name: string, overrides: Partial<SymbolDetail>): SymbolDetail =>
      ({ state: 'truncated', original: original('app/lib', name), exportName: name, signature: `function ${name}(): void;`, truncated: [], ...overrides } as SymbolDetail);
    const symbols = [
      symbol('app/lib', 'a', { detail: detail('a', { documentation: 'Doc.', truncated: ['signature', 'documentation'] }) }),
      symbol('app/lib', 'b', { detail: detail('b', { truncated: ['overloads'] }) }),
      symbol('app/lib', 'c', { detail: detail('c', { documentation: 'Doc.', truncated: ['documentation'] }) }),
      symbol('app/lib', 'd', { detail: { state: 'unavailable', original: original('app/lib', 'd'), exportName: 'd', reason: 'compiler-failure' } }),
      symbol('app/lib', 'e', { detail: { state: 'described', original: original('app/lib', 'e'), exportName: 'e', signature: 'function e(): void;' } }),
    ];
    const records = lines(renderView({ revision, projection: projection(symbols), dependencies: unavailable }), 'lib/behavior.jsonl');
    expect(records.map(record => [record.name, record.sig ?? null, record.doc ?? null, record.cut ?? null, record.detail ?? null])).toEqual([
      ['a', 'function a(): void;', 'Doc.', ['sig', 'doc'], null],
      ['b', 'function b(): void;', null, ['sig'], null],
      ['c', 'function c(): void;', 'Doc.', ['doc'], null],
      ['d', null, null, null, 'compiler-failure'],
      ['e', 'function e(): void;', null, null, null],
    ]);
    for (const record of records) expectFieldOrder(record, behaviorFields);
  });

  it('writes test records with the suite chain or feature, omitting a missing feature title', () => {
    const records: ArchitectTestRecord[] = [
      { kind: 'suite', module: 'app/lib', file: 'subs/lib/src/tests/a.test.ts', suite: [], tests: ['outside'] },
      { kind: 'feature', module: 'app/lib', file: 'subs/lib/src/tests/b.feature', feature: null, scenarios: ['Loose'] },
      { kind: 'feature', module: 'app/lib', file: 'subs/lib/src/tests/c.feature', feature: 'Review', scenarios: [] },
    ];
    expect(text(renderView({ revision, projection: projection([], [], records), dependencies: unavailable }), 'lib/tests.jsonl')).toBe(
      '{"module":"app/lib","file":"subs/lib/src/tests/a.test.ts","suite":[],"tests":["outside"]}\n'
      + '{"module":"app/lib","file":"subs/lib/src/tests/b.feature","scenarios":["Loose"]}\n'
      + '{"module":"app/lib","file":"subs/lib/src/tests/c.feature","feature":"Review","scenarios":[]}\n');
  });
});

describe('renderArchitectView: dependencies (AV14)', () => {
  it('classifies each (consumer module, original) unit once, by precedence, and never names the testing module', () => {
    const view = render(measured());
    const consumers = (path: string, name: string) => {
      const record = lines(view, path).find(entry => entry.name === name)!;
      return { behavioral: record.behavioral, nonBehavioral: record.nonBehavioral, unclassified: record.unclassified };
    };
    // alpha's behavioral and non-behavioral boundaries on Engine, through two imported modules, form one behavioral unit.
    expect(consumers('core/engine/behavior.jsonl', 'Engine'))
      .toEqual({ behavioral: ['fixture/alpha', 'fixture/core'], nonBehavioral: ['fixture/beta'], unclassified: undefined });
    expect(consumers('core/engine/behavior.jsonl', 'loose')).toEqual({ behavioral: [], nonBehavioral: [], unclassified: ['fixture/gamma'] });
    expect(consumers('core/behavior.jsonl', 'run')).toEqual({ behavioral: ['fixture', 'fixture/beta'], nonBehavioral: [], unclassified: undefined });
    expect(consumers('core/engine/behavior.jsonl', 'begin')).toEqual({ behavioral: [], nonBehavioral: [], unclassified: undefined });
    expect(consumers('supporting.jsonl', 'Config')).toEqual({ behavioral: undefined, nonBehavioral: ['fixture/core/engine'], unclassified: undefined });
    for (const file of view.files.filter(entry => entry.path.endsWith('.jsonl'))) {
      for (const record of file.text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>)) {
        const listed = ['behavioral', 'nonBehavioral', 'unclassified'].flatMap(key => (record[key] as string[] | undefined) ?? []);
        expect(new Set(listed).size).toBe(listed.length);
        expect(listed).not.toContain('fixture/checks');
      }
    }
    const use = (path: string) => {
      const document = JSON.parse(text(view, path)) as { uses: unknown; usedBy: unknown };
      return [document.uses, document.usedBy];
    };
    const pair = (module: ModuleId, behavioral: number, nonBehavioral: number, unknown = 0) =>
      ({ module, behavioral, nonBehavioral, ...unknown ? { unknown } : {} });
    expect(use('module.json')).toEqual([[pair('fixture/core', 1, 0)], [pair('fixture/core/engine', 0, 1)]]);
    expect(use('alpha/module.json')).toEqual([[pair('fixture/core/engine', 1, 0)], []]);
    expect(use('beta/module.json')).toEqual([[pair('fixture/core', 1, 0), pair('fixture/core/engine', 0, 1)], []]);
    expect(use('core/module.json')).toEqual([[pair('fixture/core/engine', 1, 0)], [pair('fixture', 1, 0), pair('fixture/beta', 1, 0)]]);
    expect(use('core/engine/module.json')).toEqual([[pair('fixture', 0, 1)],
      [pair('fixture/alpha', 1, 0), pair('fixture/core', 1, 0), pair('fixture/beta', 0, 1), pair('fixture/gamma', 0, 0, 1)]]);
    expect(use('gamma/module.json')).toEqual([[pair('fixture/core/engine', 0, 0, 1)], []]);
    expect(use('checks/module.json')).toEqual([[], []]);
    expect(view.files.some(file => file.path.endsWith('.json') && file.text.includes('"module": "fixture/checks", "behavioral"'))).toBe(false);
  });

  it('settles a unit by behavioral evidence first, then by any unknown boundary, across imported modules', () => {
    const one = symbol('app/lib', 'one'), data = symbol('app/lib', 'data', { kind: 'value', behavior: null });
    const facts = diagram([
      boundary('app/a', one.original, 'unknown', 'app/lib'), boundary('app/a', one.original, 'behavioral', 'app/relay'),
      boundary('app/b', one.original, 'non-behavioral', 'app/lib'), boundary('app/b', one.original, 'unknown', 'app/relay'),
      boundary('app/c', one.original, 'non-behavioral', 'app/lib'), boundary('app/c', one.original, 'non-behavioral', 'app/relay'),
      boundary('app/a', data.original, 'non-behavioral', 'app/lib'), boundary('app/a', data.original, 'unknown', 'app/relay'),
    ]);
    const view = renderView({ revision, projection: projection([one, data], ['app/a', 'app/b', 'app/c', 'app/relay']),
      dependencies: { state: 'measured', facts, testReferences: null } });
    expect(lines(view, 'lib/behavior.jsonl')[0]).toMatchObject({ behavioral: ['app/a'], nonBehavioral: ['app/c'], unclassified: ['app/b'] });
    expect(lines(view, 'lib/supporting.jsonl')[0]).toMatchObject({ nonBehavioral: [], unclassified: ['app/a'] });
    // Units count once per module pair, whichever module they were imported through.
    expect(JSON.parse(text(view, 'a/module.json')).uses).toEqual([{ module: 'app/lib', behavioral: 1, nonBehavioral: 0, unknown: 1 }]);
    expect(JSON.parse(text(view, 'relay/module.json')).usedBy).toEqual([]);
  });

  it('gives a supporting original a behavioral list only when a consumer uses it behaviorally', () => {
    const data = symbol('app/lib', 'data', { kind: 'value', behavior: null });
    const view = renderView({ revision, projection: projection([data], ['app/a', 'app/b']),
      dependencies: { state: 'measured', facts: diagram([boundary('app/a', data.original, 'behavioral'), boundary('app/b', data.original, 'non-behavioral')]),
        testReferences: null } });
    expect(lines(view, 'lib/supporting.jsonl')).toEqual([{ module: 'app/lib', name: 'data', role: 'internal', kind: 'value', value: true,
      behavioral: ['app/a'], nonBehavioral: ['app/b'], sig: 'function data(): void;', file: 'subs/lib/src/data.ts' }]);
  });

  it('omits every consumer field and the module pairs when dependencies are unavailable, and names the reason', () => {
    const view = render(unavailable);
    for (const file of view.files) {
      if (file.path.endsWith('.jsonl')) {
        for (const record of file.text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>)) {
          for (const key of ['behavioral', 'behavioralMore', 'nonBehavioral', 'nonBehavioralMore', 'unclassified', 'unclassifiedMore']) {
            expect(record).not.toHaveProperty(key);
          }
        }
      }
      if (file.path.endsWith('module.json')) {
        const document = JSON.parse(file.text) as Record<string, unknown>;
        expect(document).not.toHaveProperty('uses');
        expect(document).not.toHaveProperty('usedBy');
      }
    }
    expect(JSON.parse(text(view, '_meta.json'))).toMatchObject({ dependencies: 'unavailable', dependencyReason: 'wait-limit' });
    for (const reason of ['analysis-failed', 'resource-limit', 'resource-unavailable', 'invalid-current', 'wait-limit'] as const) {
      expect(JSON.parse(text(render({ state: 'unavailable', reason }), '_meta.json')).dependencyReason).toBe(reason);
    }
    expect(JSON.parse(text(render(measured()), '_meta.json'))).not.toHaveProperty('dependencyReason');
  });
});

describe('renderArchitectView: ordering (AV15)', () => {
  const names = (view: RenderedArchitectView, path: string) => lines(view, path).map(record => `${record.role as string}:${record.name as string}`);
  it('orders records by role, then consumer counts, then name; by name alone when dependencies are unavailable', () => {
    const exposed = { role: 'exposed' as const, destinations: ['parent' as const] };
    const symbols = [
      symbol('app/lib', 'alpha', exposed), symbol('app/lib', 'beta', exposed), symbol('app/lib', 'gamma', exposed),
      symbol('app/lib', 'delta'), symbol('app/lib', 'epsilon'),
      symbol('app/lib', 'Zeta', { ...exposed, kind: 'interface', behavior: null, hasValue: false }),
      symbol('app/lib', 'eta', { ...exposed, kind: 'value', behavior: null }), symbol('app/lib', 'theta', { kind: 'value', behavior: null }),
    ];
    const facts = diagram([
      // gamma: two behavioral; beta: one behavioral and two non-behavioral; alpha: one behavioral.
      boundary('app/a', symbols[2]!.original, 'behavioral'), boundary('app/b', symbols[2]!.original, 'behavioral'),
      boundary('app/a', symbols[1]!.original, 'behavioral'), boundary('app/b', symbols[1]!.original, 'non-behavioral'),
      boundary('app/c', symbols[1]!.original, 'non-behavioral'), boundary('app/c', symbols[0]!.original, 'behavioral'),
      // Internal epsilon has consumers, yet follows every exposed record.
      boundary('app/a', symbols[4]!.original, 'behavioral'), boundary('app/b', symbols[4]!.original, 'behavioral'),
      boundary('app/c', symbols[4]!.original, 'behavioral'),
      // eta has two non-behavioral consumers, Zeta one; a behavioral use of data does not reorder it.
      boundary('app/a', symbols[6]!.original, 'non-behavioral'), boundary('app/b', symbols[6]!.original, 'non-behavioral'),
      boundary('app/a', symbols[5]!.original, 'non-behavioral'), boundary('app/c', symbols[5]!.original, 'behavioral'),
    ]);
    const shuffled = [...symbols].reverse();
    const view = renderView({ revision, projection: projection(shuffled, ['app/a', 'app/b', 'app/c']), dependencies: { state: 'measured', facts, testReferences: null } });
    expect(names(view, 'lib/behavior.jsonl')).toEqual(['exposed:gamma', 'exposed:beta', 'exposed:alpha', 'internal:epsilon', 'internal:delta']);
    expect(names(view, 'lib/supporting.jsonl')).toEqual(['exposed:eta', 'exposed:Zeta', 'internal:theta']);
    const plain = renderView({ revision, projection: projection(shuffled, ['app/a', 'app/b', 'app/c']), dependencies: unavailable });
    expect(names(plain, 'lib/behavior.jsonl')).toEqual(['exposed:alpha', 'exposed:beta', 'exposed:gamma', 'internal:delta', 'internal:epsilon']);
    expect(names(plain, 'lib/supporting.jsonl')).toEqual(['exposed:Zeta', 'exposed:eta', 'internal:theta']);
    // Equal names follow their defining files.
    const defaults = ['b', 'a'].map(file => symbol('app/lib', 'default', { original: { ...original('app/lib', 'default'), file: `${file}.ts` },
      file: `subs/lib/src/${file}.ts` }));
    expect(lines(renderView({ revision, projection: projection(defaults), dependencies: unavailable }), 'lib/behavior.jsonl')
      .map(record => record.file)).toEqual(['subs/lib/src/a.ts', 'subs/lib/src/b.ts']);
  });

  it('orders module pairs by behavioral, non-behavioral and unknown units, then by identifier', () => {
    const one = symbol('app/lib', 'one'), two = symbol('app/lib', 'two'), three = symbol('app/lib', 'three');
    const facts = diagram([
      boundary('app/z', one.original, 'behavioral'),
      boundary('app/b', one.original, 'non-behavioral'), boundary('app/b', two.original, 'non-behavioral'),
      boundary('app/a', one.original, 'non-behavioral'), boundary('app/c', three.original, 'unknown'),
      boundary('app/d', one.original, 'non-behavioral'),
    ]);
    const view = renderView({ revision, projection: projection([one, two, three], ['app/a', 'app/b', 'app/c', 'app/d', 'app/z']),
      dependencies: { state: 'measured', facts, testReferences: null } });
    expect(text(view, 'lib/module.json')).toContain('  "usedBy": [\n'
      + '    { "module": "app/z", "behavioral": 1, "nonBehavioral": 0 },\n'
      + '    { "module": "app/b", "behavioral": 0, "nonBehavioral": 2 },\n'
      + '    { "module": "app/a", "behavioral": 0, "nonBehavioral": 1 },\n'
      + '    { "module": "app/d", "behavioral": 0, "nonBehavioral": 1 },\n'
      + '    { "module": "app/c", "behavioral": 0, "nonBehavioral": 0, "unknown": 1 }\n'
      + '  ],\n');
  });

  it('orders test records by file, then source order', () => {
    const suite = (file: string, title: string): ArchitectTestRecord => ({ kind: 'suite', module: 'app/lib', file, suite: [title], tests: ['t'] });
    const records = [suite('subs/lib/src/tests/b.test.ts', 'second'), suite('subs/lib/src/tests/b.test.ts', 'first'),
      suite('subs/lib/src/tests/a.test.ts', 'z'), suite('subs/lib/src/tests/a.test.ts', 'a')];
    const view = renderView({ revision, projection: projection([], [], records), dependencies: unavailable });
    expect(lines(view, 'lib/tests.jsonl').map(record => `${record.file as string}:${(record.suite as string[])[0]!}`)).toEqual([
      'subs/lib/src/tests/a.test.ts:z', 'subs/lib/src/tests/a.test.ts:a', 'subs/lib/src/tests/b.test.ts:second', 'subs/lib/src/tests/b.test.ts:first']);
    // The fixture's records follow the projection: checks' `[]` suite, then `engine`, then the feature.
    expect(lines(render(measured()), 'checks/tests.jsonl').map(record => record.suite ?? record.feature)).toEqual([[], ['engine'], 'Review']);
  });
});

describe('renderArchitectView: test references (AV39)', () => {
  const suites = (view: RenderedArchitectView) => view.files.filter(file => file.path.endsWith('tests.jsonl'))
    .flatMap(file => file.text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>));

  it('gives every suite record of a file the same exercises, as <owner>#<name> of the originals\' own records', () => {
    const view = render(measured());
    expect(real.references.files.map(entry => [entry.file, entry.exercises.map(original => `${original.owner}#${original.binding}`), entry.unclassified]))
      .toEqual([
        ['subs/checks/src/engine.test.ts', ['fixture/core#run', 'fixture/core/engine#Engine'], 1],
        ['subs/checks/src/support.ts', ['fixture/core/engine#Engine'], 0],
        ['subs/core/src/tests/core.test.ts', ['fixture/core#helper', 'fixture/core#run'], 0],
      ]);
    expect(text(view, 'checks/tests.jsonl')).toBe(
      '{"module":"fixture/checks","file":"subs/checks/src/engine.test.ts","suite":[],"tests":["outside any suite"],'
      + '"exercises":["fixture/core#run","fixture/core/engine#Engine"]}\n'
      + '{"module":"fixture/checks","file":"subs/checks/src/engine.test.ts","suite":["engine"],"tests":["constructs","runs"],'
      + '"exercises":["fixture/core#run","fixture/core/engine#Engine"]}\n'
      + '{"module":"fixture/checks","file":"subs/checks/src/features/review.feature","feature":"Review",'
      + '"scenarios":["A reviewer starts the engine","A reviewer runs <count> times"]}\n');
    // Same-owner originals, internal ones included; a file that only names types has `[]`.
    expect(lines(view, 'core/tests.jsonl').map(record => record.exercises)).toEqual([['fixture/core#helper', 'fixture/core#run']]);
    expect(lines(view, 'core/engine/tests.jsonl')).toEqual([{ module: 'fixture/core/engine', file: 'subs/core/subs/engine/src/tests/options.test.ts',
      suite: ['options'], tests: ['names the engine and its options as types'], exercises: [] }]);
    for (const record of suites(view)) {
      expect(Object.keys(record)).toEqual(record.feature !== undefined || record.scenarios !== undefined
        ? ['module', 'file', ...record.feature !== undefined ? ['feature'] : [], 'scenarios'] : ['module', 'file', 'suite', 'tests', 'exercises']);
      // One search for the name finds the symbol's own record in its owner's directory.
      for (const label of (record.exercises as string[] | undefined) ?? []) {
        const [owner, name] = label.split('#') as [string, string];
        const directory = owner === 'fixture' ? '' : `${owner.slice('fixture/'.length)}/`;
        expect([...lines(view, `${directory}behavior.jsonl`), ...lines(view, `${directory}supporting.jsonl`)]
          .filter(entry => entry.name === name && entry.module === owner)).toHaveLength(1);
      }
    }
  });

  it('bounds exercises at twelve in byte order, names each original by its record and leaves out originals without one', () => {
    const many = Array.from({ length: 13 }, (_, index) => symbol('app/lib', `f${String(index).padStart(2, '0')}`));
    // `begin` is the record's name for the binding `start`; `default` stays `default`; two defaults give one label.
    const begin = symbol('app/lib', 'begin', { original: original('app/lib', 'start') });
    const defaults = ['a', 'b'].map(file => symbol('app/lib', 'default', { original: { ...original('app/lib', file), binding: 'default' },
      binding: null, file: `subs/lib/src/${file}.ts` }));
    const other = symbol('app/a', 'zeta');
    const missing = original('app/lib', 'gone');
    const records: ArchitectTestRecord[] = [
      { kind: 'suite', module: 'app/lib', file: 'subs/lib/src/tests/a.test.ts', suite: ['a'], tests: ['one'] },
      { kind: 'suite', module: 'app/lib', file: 'subs/lib/src/tests/a.test.ts', suite: ['a', 'inner'], tests: ['two'] },
      { kind: 'suite', module: 'app/lib', file: 'subs/lib/src/tests/b.test.ts', suite: [], tests: ['three'] },
      { kind: 'feature', module: 'app/lib', file: 'subs/lib/src/tests/c.feature', feature: 'C', scenarios: ['four'] },
    ];
    const references: TestReferenceFacts = { inputId, files: [
      { file: 'subs/lib/src/tests/a.test.ts', unclassified: 0,
        exercises: [...[...many].reverse(), begin, ...defaults, other, missing].map(entry => 'original' in entry ? entry.original : entry) },
      { file: 'subs/lib/src/tests/c.feature', exercises: [many[0]!.original], unclassified: 0 },
    ] };
    const view = renderView({ revision, projection: projection([...many, begin, ...defaults, other], ['app/a'], records),
      dependencies: { state: 'measured', facts: diagram([]), testReferences: references } });
    const [first, second, third, feature] = lines(view, 'lib/tests.jsonl');
    const labels = byteOrdered(['app/a#zeta', 'app/lib#begin', 'app/lib#default', ...many.map(entry => `app/lib#${entry.name}`)]);
    expect(labels).toHaveLength(16);
    expect(first).toEqual({ module: 'app/lib', file: 'subs/lib/src/tests/a.test.ts', suite: ['a'], tests: ['one'],
      exercises: labels.slice(0, 12), exercisesMore: 4 });
    expect(second).toMatchObject({ suite: ['a', 'inner'], exercises: labels.slice(0, 12), exercisesMore: 4 });
    expect(Object.keys(second!)).toEqual(['module', 'file', 'suite', 'tests', 'exercises', 'exercisesMore']);
    expect(third).toMatchObject({ file: 'subs/lib/src/tests/b.test.ts', exercises: [] });
    expect(third).not.toHaveProperty('exercisesMore');
    expect(feature).toEqual({ module: 'app/lib', file: 'subs/lib/src/tests/c.feature', feature: 'C', scenarios: ['four'] });
    // Twelve fit without a count.
    const twelve = renderView({ revision, projection: projection(many, [], records.slice(0, 1)), dependencies: { state: 'measured',
      facts: diagram([]), testReferences: { inputId, files: [{ file: records[0]!.file, exercises: many.slice(0, 12).map(entry => entry.original), unclassified: 0 }] } } });
    expect(lines(twelve, 'lib/tests.jsonl')).toEqual([{ module: 'app/lib', file: 'subs/lib/src/tests/a.test.ts', suite: ['a'], tests: ['one'],
      exercises: many.slice(0, 12).map(entry => `app/lib#${entry.name}`) }]);
  });

  it('writes no exercises without test references or without dependencies, and records the state after dependencyScope', () => {
    for (const dependencies of [unreferenced(), unavailable]) {
      const view = render(dependencies);
      for (const record of suites(view)) {
        expect(record).not.toHaveProperty('exercises');
        expect(record).not.toHaveProperty('exercisesMore');
      }
      const meta = JSON.parse(text(view, '_meta.json')) as Record<string, unknown>;
      expect(meta.testReferences).toBe('unavailable');
      expect(meta).not.toHaveProperty('unclassifiedExercises');
      const keys = Object.keys(meta);
      expect(keys.indexOf('testReferences')).toBe(keys.indexOf('dependencyScope') + 1);
    }
    const meta = JSON.parse(text(render(measured()), '_meta.json')) as Record<string, unknown>;
    expect(Object.keys(meta).slice(5, 8)).toEqual(['dependencyScope', 'testReferences', 'metrics']);
    expect(meta).toMatchObject({ testReferences: 'measured', unclassifiedExercises: 1 });
  });

  it('sums unclassifiedExercises over files with a suite record, before coverage, and omits a zero sum', () => {
    const records: ArchitectTestRecord[] = [
      { kind: 'suite', module: 'app/lib', file: 'subs/lib/src/tests/a.test.ts', suite: ['a'], tests: ['one'] },
      { kind: 'suite', module: 'app/lib', file: 'subs/lib/src/tests/a.test.ts', suite: ['b'], tests: ['two'] },
      { kind: 'suite', module: 'app/lib', file: 'subs/lib/src/tests/b.test.ts', suite: [], tests: ['three'] },
    ];
    const counts = { coverage: 1, detailsUnavailable: 0, unknownShapes: 0, dynamicTitles: 0, testsUnavailable: 2, cut: 0 };
    const rendered = (files: TestReferenceFacts['files']) => text(renderView({ revision,
      projection: { ...projection([], [], records), counts }, dependencies: { state: 'measured', facts: diagram([]), testReferences: { inputId, files } } }),
    '_meta.json');
    // a.test.ts counts once whatever its record count; support.ts has no suite record.
    expect(rendered([{ file: 'subs/lib/src/tests/a.test.ts', exercises: [], unclassified: 2 },
      { file: 'subs/lib/src/tests/b.test.ts', exercises: [], unclassified: 3 },
      { file: 'subs/lib/src/tests/support.ts', exercises: [], unclassified: 5 }]))
      .toContain('"testsUnavailable":2,"unclassifiedExercises":5,"coverage":1}\n');
    expect(rendered([{ file: 'subs/lib/src/tests/support.ts', exercises: [], unclassified: 5 }])).toContain('"testsUnavailable":2,"coverage":1}\n');
  });

  it('leaves consumer lists, uses and usedBy unchanged: only tests.jsonl and _meta.json differ', () => {
    const referenced = render(measured()), plain = render(unreferenced());
    expect(referenced.files.map(file => file.path)).toEqual(plain.files.map(file => file.path));
    expect(referenced.records).toBe(plain.records);
    for (const [index, file] of referenced.files.entries()) {
      if (file.path.endsWith('tests.jsonl')) {
        const stripped = file.text.split('\n').map(line => line && JSON.stringify((({ exercises: _e, exercisesMore: _m, ...rest }) => rest)(
          JSON.parse(line) as Record<string, unknown>))).join('\n');
        expect(stripped).toBe(plain.files[index]!.text);
      } else if (file.path !== '_meta.json') {
        expect(file.text).toBe(plain.files[index]!.text);
      }
    }
  });
});

describe('renderArchitectView: README.md (AV16)', () => {
  it('opens with the specification\'s instruction block, names the revision and maps every module in tree order', async () => {
    const specification = await readFile(join(toolkit, 'docs/architecture/architect-view.spec.md'), 'utf8');
    const block = /## Agent instructions[\s\S]*?```text\n([\s\S]*?)\n```/.exec(specification)![1];
    expect(architectInstructions).toBe(block);
    const readme = text(render(measured()), 'README.md');
    expect(readme.startsWith(`\`\`\`text\n${block}\n\`\`\`\n\nRevision ${revision} · input ${inputId}\n\n`)).toBe(true);
    const map = readme.split('\n').slice(block!.split('\n').length + 5);
    expect(map).toEqual([
      '- **fixture** — A three-level project for the architect view.',
      '  exposed 0 · internal 1 · supporting 1 · tests 0 · uses 1 · used by 1',
      '  - **fixture/alpha** — Alpha builds engines.',
      '    exposed 0 · internal 1 · supporting 2 · tests 0 · uses 1 · used by 0',
      '  - **fixture/beta** [ui] — Beta drives the engine.',
      '    exposed 0 · internal 1 · supporting 0 · tests 0 · uses 2 · used by 0',
      '  - **fixture/checks** [testing] — Checks exercise the engine.',
      '    exposed 0 · internal 1 · supporting 0 · tests 5 · uses 0 · used by 0',
      '  - **fixture/core** — Core runs the engine for the rest of the project.',
      '    exposed 1 · internal 1 · supporting 3 · tests 2 · uses 1 · used by 2',
      '    headline: run',
      '    - **fixture/core/engine** — (no README purpose)',
      '      exposed 3 · internal 1 · supporting 1 · tests 1 · uses 1 · used by 4',
      '      headline: Engine, begin, loose',
      '  - **fixture/gamma** — Gamma reads a loose value.',
      '    exposed 0 · internal 0 · supporting 1 · tests 0 · uses 1 · used by 0',
      '',
    ]);
    expect(text(render(unavailable), 'README.md')).toContain('\n    exposed 1 · internal 1 · supporting 3 · tests 2 · uses ? · used by ?\n    headline: run\n');
    expect(text(render(unavailable), 'README.md')).not.toMatch(/uses \d/);
  });

  it('cuts a purpose at 600 bytes on a character boundary, in the map and module.json alike, and counts it', () => {
    const long = `${'a'.repeat(598)}éz`;
    const exact = `${'b'.repeat(598)}é`;
    const base = projection([]);
    const withPurpose = (text: string): ArchitectModuleFacts => ({ ...base.modules[1]!, purpose: { state: 'present', path: 'subs/lib/README.md', text } });
    const view = renderView({ revision, projection: { ...base, modules: [base.modules[0]!, withPurpose(long)] }, dependencies: unavailable });
    // 'é' is two bytes: 598 + 2 = 600 keeps it, and 'z' is cut.
    const kept = `${'a'.repeat(598)}é`;
    expect(JSON.parse(text(view, 'lib/module.json')).purpose).toEqual({ state: 'present', path: 'subs/lib/README.md', text: kept, cut: true });
    expect(text(view, 'README.md')).toContain(`  - **app/lib** — ${kept}…\n`);
    expect(JSON.parse(text(view, '_meta.json')).cut).toBe(1);
    const split = `${'c'.repeat(599)}é`;
    const cutMid = renderView({ revision, projection: { ...base, modules: [base.modules[0]!, withPurpose(split)] }, dependencies: unavailable });
    expect(JSON.parse(text(cutMid, 'lib/module.json')).purpose.text).toBe('c'.repeat(599));
    const whole = renderView({ revision, projection: { ...base, modules: [base.modules[0]!, withPurpose(exact)] }, dependencies: unavailable });
    expect(JSON.parse(text(whole, 'lib/module.json')).purpose).toEqual({ state: 'present', path: 'subs/lib/README.md', text: exact });
    expect(text(whole, 'README.md')).toContain(`  - **app/lib** — ${exact}\n`);
    expect(JSON.parse(text(whole, '_meta.json'))).not.toHaveProperty('cut');
  });

  it('lists at most eight headline names, exposed behavior records in significance order, and counts the rest', () => {
    const exposedNames = ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a', 'j', 'i'];
    const symbols = [...exposedNames.map(name => symbol('app/lib', name, { role: 'exposed', destinations: ['parent'] })),
      symbol('app/lib', 'internal'), symbol('app/lib', 'Shape', { role: 'exposed', destinations: ['parent'], kind: 'interface', behavior: null, hasValue: false })];
    const facts = diagram([boundary('app/a', symbols[9]!.original, 'behavioral')]);
    const view = renderView({ revision, projection: projection(symbols, ['app/a']), dependencies: { state: 'measured', facts, testReferences: null } });
    expect(text(view, 'README.md')).toContain('\n    headline: i, a, b, c, d, e, f, g, … +2\n');
    const eight = renderView({ revision, projection: projection(symbols.slice(2)), dependencies: unavailable });
    expect(text(eight, 'README.md')).toContain('\n    headline: a, b, c, d, e, f, i, j\n');
  });
});

describe('renderArchitectView: metadata (AV17)', () => {
  it('writes the fixed fields and only the nonzero exceptional counts, and repeats the revision in every module.json', () => {
    expect(text(render(measured()), '_meta.json')).toBe('{"schema":"ramify.architect-view/2","revision":"rev/1:architect","input":"input/1:architect",'
      + '"modules":7,"dependencies":"measured","dependencyScope":"production","testReferences":"measured","metrics":"measured",'
      + '"unknownShapes":1,"detailsUnavailable":1,"testsUnavailable":1,"unclassifiedExercises":1,"coverage":1}\n');
    expect(text(render(unreferenced()), '_meta.json')).toBe('{"schema":"ramify.architect-view/2","revision":"rev/1:architect","input":"input/1:architect",'
      + '"modules":7,"dependencies":"measured","dependencyScope":"production","testReferences":"unavailable","metrics":"measured",'
      + '"unknownShapes":1,"detailsUnavailable":1,"testsUnavailable":1,"coverage":1}\n');
    expect(text(render(unavailable), '_meta.json')).toBe('{"schema":"ramify.architect-view/2","revision":"rev/1:architect","input":"input/1:architect",'
      + '"modules":7,"dependencies":"unavailable","dependencyReason":"wait-limit","dependencyScope":"production","testReferences":"unavailable",'
      + '"metrics":"measured","unknownShapes":1,"detailsUnavailable":1,"testsUnavailable":1,"coverage":1}\n');
    const counts = { coverage: 2, detailsUnavailable: 3, unknownShapes: 4, dynamicTitles: 5, testsUnavailable: 6, cut: 7 };
    expect(JSON.parse(text(render(unavailable, { ...real.projection, counts }), '_meta.json'))).toMatchObject(counts);
    const none = { coverage: 0, detailsUnavailable: 0, unknownShapes: 0, dynamicTitles: 0, testsUnavailable: 0, cut: 0 };
    expect(Object.keys(JSON.parse(text(render(unreferenced(), { ...real.projection, counts: none }), '_meta.json'))))
      .toEqual(['schema', 'revision', 'input', 'modules', 'dependencies', 'dependencyScope', 'testReferences', 'metrics']);
    for (const directory of modules) {
      const document = JSON.parse(text(render(measured()), `${directory}module.json`)) as Record<string, unknown>;
      expect(document.revision).toBe(revision);
      expect(Object.keys(document)).toEqual(['schema', 'module', 'dir', 'parent', 'children', 'tags', 'areas', 'boundaries', 'purpose', 'docs', 'files',
        'symbols', 'tests', 'uses', 'usedBy', 'metrics', 'revision']);
    }
  });

  it('writes module facts, symbol and test counts in module.json', () => {
    expect(JSON.parse(text(render(unavailable), 'core/module.json'))).toEqual({ schema: 'ramify.architect-module/2', module: 'fixture/core',
      dir: 'subs/core', parent: 'fixture', children: ['fixture/core/engine'], tags: [], areas: ['src', 'src/tests'], boundaries: [],
      purpose: { state: 'present', path: 'subs/core/README.md', text: 'Core runs the engine for the rest of the project.' },
      docs: ['subs/core/src/docs/guide.md', 'subs/core/src/docs/notes/usage.md'], files: { own: 4, subtree: 7 },
      symbols: { exposed: 1, internal: 1, supporting: 3, unknown: 0 }, tests: { suites: 1, titles: 2 },
      metrics: { state: 'measured', views: { state: 'unavailable', reason: 'not-requested' },
        contextSize: expect.any(Object) }, revision });
    expect(JSON.parse(text(render(unavailable), 'core/engine/module.json'))).toMatchObject({ parent: 'fixture/core', purpose: { state: 'missing' },
      symbols: { exposed: 3, internal: 1, supporting: 1, unknown: 1 } });
    expect(JSON.parse(text(render(unavailable), 'module.json'))).toMatchObject({ dir: '', parent: null });
  });

  it('rejects partial or mismatched measurement identities instead of rendering zero views', () => {
    const measurements = real.measurements;
    if (measurements.state !== 'measured') throw new Error('Expected fixture measurements');
    expect(() => renderArchitectView({ revision, projection: real.projection, dependencies: unavailable,
      measurements: { ...measurements, views: 'measured' } })).toThrow(/availability is not uniform/);
    expect(() => renderArchitectView({ revision, projection: real.projection, dependencies: unavailable,
      measurements: { ...measurements, modules: measurements.modules.map((module, index) =>
        index ? module : { ...module, dir: 'wrong' }) } })).toThrow(/identity does not match/);
    expect(() => renderArchitectView({ revision, projection: real.projection, dependencies: unavailable,
      measurements: { ...measurements, modules: measurements.modules.map((module, index) =>
        index ? module : { ...module, exact: { ...module.exact, views: { ordinaryBytes: 1, testsBytes: 0 } } }) } }))
      .toThrow(/availability is not uniform/);
  });
});

describe('renderArchitectView: determinism (AV18)', () => {
  it('renders the same bytes for the same input and holds no timestamp, absolute path or process value', () => {
    for (const dependencies of [measured(), unreferenced(), unavailable]) {
      const first = render(dependencies);
      const again = renderArchitectView(structuredClone({ revision, projection: real.projection,
        dependencies, measurements: real.measurements }));
      expect(serialized(again)).toBe(serialized(first));
      expect(again).toEqual(first);
      const all = serialized(first);
      for (const host of [real.root, tmpdir(), process.cwd(), toolkit]) expect(all).not.toContain(host);
      expect(all).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
      expect(all).not.toMatch(new RegExp(`\\b${process.pid}\\b`));
    }
  });

  it('throws for measured facts of another input', () => {
    expect(() => render({ state: 'measured', facts: { ...real.facts, inputId: 'input/1:other' }, testReferences: real.references }))
      .toThrow(/Dependency facts for input input\/1:other.*input\/1:architect/);
    expect(() => render({ state: 'measured', facts: real.facts, testReferences: { ...real.references, inputId: 'input/1:other' } }))
      .toThrow(/Test references for input input\/1:other.*input\/1:architect/);
  });

  it('imports no compiler, filesystem or session module', async () => {
    const imports = (source: string) => [...source.matchAll(/^import (type )?[^;]*? from '([^']+)';$/gm)].map(match => ({ type: Boolean(match[1]), from: match[2] }));
    const renderer = imports(await readFile(join(tests, '../architect-render.ts'), 'utf8'));
    expect(renderer.filter(entry => !entry.type).map(entry => entry.from)).toEqual(['./modularity-context.js']);
    expect(imports(await readFile(join(tests, '../modularity-context.ts'), 'utf8')).filter(entry => !entry.type).map(entry => entry.from))
      .toEqual(['./module-measurements.js']);
  });
});

// Synthetic projections: a root `app` with one child `lib` and the consumer modules the facts name.
function original(module: ModuleId, name: string): OriginalId {
  return { kind: 'code', owner: module, file: `${name}.ts`, binding: name };
}
function symbol(module: ModuleId, name: string, overrides: Partial<ArchitectSymbol> = {}): ArchitectSymbol {
  const id = original(module, name);
  return { module, original: id, name, binding: null, exposureNames: [], role: 'internal', destinations: [], kind: 'function',
    behavior: 'callable', hasValue: true, tags: [], reexposed: [],
    detail: { state: 'described', original: id, exportName: name, signature: `function ${name}(): void;` },
    file: `subs/${module.split('/').at(-1)!}/src/${name}.ts`, ...overrides };
}
function moduleFacts(module: ModuleId, parent: ModuleId | null, children: readonly ModuleId[]): ArchitectModuleFacts {
  const name = module.split('/').at(-1)!;
  return { module, dir: parent === null ? '' : `subs/${name}`, parent, children, tags: [], areas: ['src'], boundaries: [],
    purpose: { state: 'present', path: parent === null ? 'README.md' : `subs/${name}/README.md`, text: `The ${name} module.` },
    docs: [], files: { own: 1, subtree: 1 } };
}
function projection(symbols: readonly ArchitectSymbol[], consumers: readonly ModuleId[] = [], records: readonly ArchitectTestRecord[] = []): ArchitectViewProjection {
  const children = byteOrdered(['app/lib', ...consumers]);
  return { schema: 'ramify.architect-projection/2', sequence: 1, inputId, root: 'app',
    modules: [moduleFacts('app', null, children), ...children.map(child => moduleFacts(child, 'app', []))],
    symbols, tests: records,
    counts: { coverage: 0, detailsUnavailable: 0, unknownShapes: 0, dynamicTitles: 0, testsUnavailable: 0, cut: 0 }, bytes: 0 };
}
function boundary(consumer: ModuleId, target: OriginalId, classification: DependencyBoundaryFact['classification'],
  importedModule: ModuleId = target.owner): DependencyBoundaryFact {
  return { consumer, importedModule, originalOwner: target.owner, original: target, classification,
    consumerFiles: [`subs/${consumer.split('/').at(-1)!}/src/use.ts`], importedFiles: [`subs/lib/src/${target.file}`],
    originalFiles: [`subs/lib/src/${target.file}`], accessIds: ['access'], status: 'allowed', reasons: ['exposed'], limitIds: [] };
}
function diagram(boundaries: readonly DependencyBoundaryFact[]): DependencyDiagramFacts {
  return { inputId, modules: [], headline: { behavioralDependencies: 0, nonBehavioralDependencies: 0 }, boundaries,
    coverage: { state: 'complete', unknownDependencies: 0, limitIds: [] } };
}
