import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { originalKey } from '../../subs/model/src/index.js';
import type { ExportShape, SymbolDetail } from '../../subs/typescript/src/interfaces/source.js';
import { planArchitectView, projectArchitectView } from '../architect-view.js';
import type { ArchitectViewPlan, ArchitectViewProjectOutcome, ArchitectViewProvided } from '../architect-view.js';
import type { ArchitectSymbol, ArchitectViewProjection, ArchitectViewQuery } from '../interfaces/architect-view.js';
import type { SessionFacts } from '../session-facts.js';
import type { SessionState } from '../session-revision.js';
import { architectLimits, architectPaths as paths, architectProject } from './architect-fixture.js';
import { opened, timeout } from './session-test-fixture.js';

type Limits = Pick<ArchitectViewQuery, 'details' | 'tests' | 'maxProjectionBytes'>;

/** The architect fixture's retained facts, compiler and root, from an in-process session. */
function withFacts(check: (facts: SessionFacts, state: SessionState, root: string) => Promise<void>): Promise<void> {
  return architectProject(async (root, inputs) => {
    const { handle, state } = await opened(inputs);
    try { await check(state.facts!, state, root); } finally { await handle.dispose(); }
  });
}
function planned(facts: SessionFacts): ArchitectViewPlan {
  const plan = planArchitectView(facts);
  if (plan.status !== 'planned') throw new Error(JSON.stringify(plan));
  return plan;
}
/** Everything the session would supply for `plan`, from the real compiler and the files on disk. */
async function provide(state: SessionState, plan: ArchitectViewPlan, root: string, limits: Limits = architectLimits): Promise<ArchitectViewProvided> {
  return {
    details: await state.adapter!.details(plan.requests, limits.details),
    shapes: await state.adapter!.shapes(plan.requests),
    tests: await state.adapter!.testTitles(plan.testFiles, limits.tests),
    features: await Promise.all(plan.features.map(async file => ({ file, text: await readFile(join(root, file), 'utf8') }))),
  };
}
function projection(outcome: ArchitectViewProjectOutcome): ArchitectViewProjection {
  if (outcome.status !== 'projected') throw new Error(JSON.stringify(outcome));
  return outcome.projection;
}
async function project(facts: SessionFacts, state: SessionState, root: string, limits: Limits = architectLimits): Promise<ArchitectViewProjection> {
  const plan = planned(facts);
  return projection(projectArchitectView(facts, 3, 'input/1:architect', await provide(state, plan, root, limits), limits));
}
const summary = (symbol: ArchitectSymbol) => [symbol.module, symbol.name, symbol.binding, symbol.exposureNames, symbol.role,
  symbol.destinations, symbol.kind, symbol.behavior, symbol.hasValue, symbol.tags,
  symbol.reexposed.map(entry => `${entry.by}:${entry.to.join('+')}`), symbol.file];

const nearest = ['fixture/core:parent', 'fixture:descendants'];
const engineFile = paths.engine;

describe('projectArchitectView: symbols (AV08)', () => {
  it('records every owned exported original once, at its owner, with its role, exposure, shape, tags and relays', () => withFacts(async (facts, state, root) => {
    const result = await project(facts, state, root);
    expect(result.symbols.map(summary)).toEqual([
      ['fixture', 'Config', null, [], 'exposed', ['descendants'], 'interface', null, false, [], [], paths.config],
      ['fixture', 'main', null, [], 'internal', [], 'function', 'callable', true, [], [], paths.main],
      ['fixture/alpha', 'build', null, [], 'internal', [], 'function', 'callable', true, [], [], paths.alpha],
      ['fixture/alpha', 'default', null, [], 'internal', [], 'resource', null, true, [], [], paths.style],
      ['fixture/alpha', 'view', null, [], 'internal', [], 'value', null, true, [], [], paths.view],
      ['fixture/beta', 'drive', null, [], 'internal', [], 'function', 'callable', true, ['ui'], [], paths.beta],
      ['fixture/checks', 'makeEngine', null, [], 'internal', [], 'function', 'callable', true, ['testing'], [], paths.checksSupport],
      ['fixture/core', 'Mode', null, [], 'internal', [], 'type', null, false, [], [], paths.core],
      ['fixture/core', 'helper', null, [], 'internal', [], 'function', 'callable', true, [], [], paths.core],
      ['fixture/core', 'run', null, [], 'exposed', ['descendants', 'parent'], 'function', 'callable', true, [], ['fixture:descendants'], paths.core],
      ['fixture/core', 'sample', null, [], 'internal', [], 'value', null, true, ['testing'], [], paths.coreSupport],
      ['fixture/core', 'settings', null, [], 'exposed', ['descendants'], 'value', null, true, [], [], paths.core],
      ['fixture/core/engine', 'Engine', null, [], 'exposed', ['parent'], 'class', 'constructable', true, [], nearest, engineFile],
      ['fixture/core/engine', 'EngineOptions', null, [], 'exposed', ['parent'], 'interface', null, false, [], [], engineFile],
      // `start` is exported as `begin` and `start`; the owner exposes it as `launch`.
      ['fixture/core/engine', 'begin', null, ['launch'], 'exposed', ['parent'], 'function', 'callable', true, [], nearest, engineFile],
      ['fixture/core/engine', 'default', 'boot', [], 'internal', [], 'function', 'callable', true, [], [], engineFile],
      ['fixture/core/engine', 'loose', null, [], 'exposed', ['parent'], 'value', 'unknown', true, [], nearest, engineFile],
      ['fixture/gamma', 'total', null, [], 'internal', [], 'value', null, true, [], [], paths.gamma],
    ]);
    // `settings` lists no relay: the root's relay of it is ineffective.
    // Each original once, at its owner: relays and the forwarding file in core add no record.
    const keys = result.symbols.map(symbol => originalKey(symbol.original));
    expect(new Set(keys).size).toBe(keys.length);
    for (const symbol of result.symbols) expect(symbol.original.owner).toBe(symbol.module);
    expect(result.symbols.some(symbol => symbol.file === paths.coreIndex)).toBe(false);
    expect(result.symbols.find(symbol => symbol.name === 'begin')!.original.binding).toBe('start');
    // Each detail is the one for the recorded name.
    for (const symbol of result.symbols) {
      expect(symbol.detail).toMatchObject({ original: symbol.original, exportName: symbol.name });
    }
    expect(result.symbols.find(symbol => symbol.name === 'run')!.detail).toMatchObject({ state: 'described',
      signature: 'function run(): Engine;', documentation: 'Run the engine once.' });
    expect(result.counts).toEqual({ coverage: 1, detailsUnavailable: 1, unknownShapes: 1, dynamicTitles: 0, testsUnavailable: 1, cut: 0 });
    expect(result.symbols.find(symbol => symbol.kind === 'resource')!.detail).toMatchObject({ state: 'unavailable', reason: 'unsupported-declaration' });
  }), timeout);

  it('plans one detail and shape request per recorded original, under its name, in byte order', () => withFacts(async facts => {
    const plan = planned(facts);
    const keys = plan.requests.map(request => `${originalKey(request.original)} ${request.exportName}`);
    expect(keys).toEqual([...keys].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
    expect(plan.requests).toHaveLength(18);
    expect(plan.requests.filter(request => request.original.owner === 'fixture/core/engine').map(request => request.exportName).sort())
      .toEqual(['Engine', 'EngineOptions', 'begin', 'default', 'loose']);
  }), timeout);

  it('keeps an original without a runtime value supporting whatever shape the compiler answered', () => withFacts(async (facts, state, root) => {
    const plan = planned(facts);
    const real = await provide(state, plan, root);
    const unresolved: ExportShape[] = real.shapes.map(shape => ({ ...shape, kind: 'value', behavior: 'unknown' }));
    const result = projection(projectArchitectView(facts, 3, 'input/1:architect', { ...real, shapes: unresolved }, architectLimits));
    for (const symbol of result.symbols) expect(symbol.behavior).toBe(symbol.hasValue ? 'unknown' : null);
    expect(result.counts.unknownShapes).toBe(result.symbols.filter(symbol => symbol.hasValue).length);
    expect(result.symbols.filter(symbol => !symbol.hasValue).map(symbol => symbol.name)).toEqual(['Config', 'Mode', 'EngineOptions']);
  }), timeout);
});

describe('projectArchitectView: modules (AV09)', () => {
  it('lists every module in tree order with its directory, parent, children, tags, areas, purpose, docs and source counts', () => withFacts(async (facts, state, root) => {
    const result = await project(facts, state, root);
    const present = (path: string, text: string) => ({ state: 'present', path, text });
    expect(result.root).toBe('fixture');
    expect(result.modules).toEqual([
      { module: 'fixture', dir: '', parent: null, children: ['fixture/alpha', 'fixture/beta', 'fixture/checks', 'fixture/core', 'fixture/gamma'],
        tags: [], areas: ['src'], purpose: present('README.md', 'A three-level project for the architect view.'), docs: [], files: { own: 2, subtree: 17 } },
      { module: 'fixture/alpha', dir: 'subs/alpha', parent: 'fixture', children: [], tags: [], areas: ['src'],
        purpose: present('subs/alpha/README.md', 'Alpha builds engines.'), docs: [], files: { own: 4, subtree: 4 } },
      { module: 'fixture/beta', dir: 'subs/beta', parent: 'fixture', children: [], tags: ['ui'], areas: ['src'],
        purpose: present('subs/beta/README.md', 'Beta drives the engine.'), docs: [], files: { own: 1, subtree: 1 } },
      { module: 'fixture/checks', dir: 'subs/checks', parent: 'fixture', children: [], tags: ['testing'], areas: ['src'],
        purpose: present('subs/checks/README.md', 'Checks exercise the engine.'), docs: [], files: { own: 2, subtree: 2 } },
      { module: 'fixture/core', dir: 'subs/core', parent: 'fixture', children: ['fixture/core/engine'], tags: [], areas: ['src', 'src/tests'],
        purpose: present('subs/core/README.md', 'Core runs the engine for the rest of the project.'),
        docs: [paths.guide, paths.usage], files: { own: 4, subtree: 7 } },
      { module: 'fixture/core/engine', dir: 'subs/core/subs/engine', parent: 'fixture/core', children: [], tags: [], areas: ['src', 'src/tests'],
        purpose: { state: 'missing' }, docs: [], files: { own: 3, subtree: 3 } },
      { module: 'fixture/gamma', dir: 'subs/gamma', parent: 'fixture', children: [], tags: [], areas: ['src'],
        purpose: present('subs/gamma/README.md', 'Gamma reads a loose value.'), docs: [], files: { own: 1, subtree: 1 } },
    ]);
  }), timeout);

  it('orders a module before its children and children by byte order, not by identifier', () => architectProject(async (_root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      // `core-x` sorts after `core` and before `core/engine` as an identifier, but follows core's subtree in tree order.
      const facts = state.facts!;
      const plan = planned(facts);
      const provided = { details: await state.adapter!.details(plan.requests, architectLimits.details),
        shapes: await state.adapter!.shapes(plan.requests), tests: await state.adapter!.testTitles(plan.testFiles, architectLimits.tests),
        features: plan.features.map(file => ({ file, text: '' })) };
      const result = projection(projectArchitectView(facts, 1, 'input/1:tree', provided, architectLimits));
      expect(result.modules.map(module => module.module)).toEqual(['fixture', 'fixture/alpha', 'fixture/beta', 'fixture/checks',
        'fixture/core', 'fixture/core/engine', 'fixture/core-x', 'fixture/gamma']);
      expect(result.modules.find(module => module.module === 'fixture/core-x')).toMatchObject({ areas: [], purpose: { state: 'missing' },
        files: { own: 0, subtree: 0 } });
    } finally { await handle.dispose(); }
  }, { 'subs/core-x/module.ramify': 'ramify 1\nmodule core-x\n' }), timeout);
});

describe('projectArchitectView: tests (AV10)', () => {
  it('reads test titles only from testing-profile areas, and counts files the compiler leaves out', () => withFacts(async (facts, state, root) => {
    const plan = planned(facts);
    expect(plan.testFiles).toEqual([paths.checks, paths.checksSupport, paths.coreSupport, paths.coreTest, paths.engineTest, paths.legacy].sort());
    expect(plan.features).toEqual([paths.feature]);
    const result = await project(facts, state, root);
    expect(result.tests).toEqual([
      { kind: 'suite', module: 'fixture/checks', file: paths.checks, suite: [], tests: ['outside any suite'] },
      { kind: 'suite', module: 'fixture/checks', file: paths.checks, suite: ['engine'], tests: ['constructs', 'runs'] },
      { kind: 'feature', module: 'fixture/checks', file: paths.feature, feature: 'Review',
        scenarios: ['A reviewer starts the engine', 'A reviewer runs <count> times'] },
      { kind: 'suite', module: 'fixture/core', file: paths.coreTest, suite: ['run'], tests: ['starts the engine', 'returns the engine'] },
      { kind: 'suite', module: 'fixture/core/engine', file: paths.engineTest, suite: ['options'],
        tests: ['names the engine and its options as types'] },
    ]);
    // alpha's test-named file and `.feature` file are ordinary source; engine's JavaScript test is outside the program.
    const files = new Set(result.tests.map(record => record.file));
    for (const file of [paths.alphaTest, paths.alphaFeature, paths.legacy]) expect(files.has(file)).toBe(false);
    expect(result.counts).toMatchObject({ testsUnavailable: 1, dynamicTitles: 0, cut: 0 });
  }), timeout);

  it('splits title lists at maxTitlesPerRecord and counts every cut title once', () => withFacts(async (facts, state, root) => {
    const limits = { ...architectLimits, tests: { maxTitleBytes: 10, maxTitlesPerRecord: 1, maxResultBytes: 16 * 1024 ** 2 } };
    const result = await project(facts, state, root, limits);
    expect(result.tests).toEqual([
      { kind: 'suite', module: 'fixture/checks', file: paths.checks, suite: [], tests: ['outside an…'] },
      { kind: 'suite', module: 'fixture/checks', file: paths.checks, suite: ['engine'], tests: ['constructs'] },
      { kind: 'suite', module: 'fixture/checks', file: paths.checks, suite: ['engine'], tests: ['runs'] },
      { kind: 'feature', module: 'fixture/checks', file: paths.feature, feature: 'Review', scenarios: ['A reviewer…'] },
      { kind: 'feature', module: 'fixture/checks', file: paths.feature, feature: 'Review', scenarios: ['A reviewer…'] },
      { kind: 'suite', module: 'fixture/core', file: paths.coreTest, suite: ['run'], tests: ['starts the…'] },
      { kind: 'suite', module: 'fixture/core', file: paths.coreTest, suite: ['run'], tests: ['returns th…'] },
      { kind: 'suite', module: 'fixture/core/engine', file: paths.engineTest, suite: ['options'], tests: ['names the …'] },
    ]);
    // Four test titles and two scenarios exceed 10 bytes.
    expect(result.counts.cut).toBe(6);
  }), timeout);

  it('records a feature without scenarios once, and none for a file with neither feature nor scenario', () => withFacts(async (facts, state, root) => {
    const plan = planned(facts);
    const real = await provide(state, plan, root);
    const only = (text: string) => projection(projectArchitectView(facts, 3, 'input/1:architect',
      { ...real, features: [{ file: paths.feature, text }] }, architectLimits)).tests.filter(record => record.kind === 'feature');
    expect(only('Feature: Empty\n')).toEqual([{ kind: 'feature', module: 'fixture/checks', file: paths.feature, feature: 'Empty', scenarios: [] }]);
    expect(only('# nothing here\n')).toEqual([]);
    expect(only('Scenario: Loose\n')).toEqual([{ kind: 'feature', module: 'fixture/checks', file: paths.feature, feature: null, scenarios: ['Loose'] }]);
  }), timeout);
});

describe('projectArchitectView: bounds and inputs', () => {
  it('counts truncated details in cut', () => withFacts(async (facts, state, root) => {
    const limits = { ...architectLimits, details: { ...architectLimits.details, maxSignatureBytes: 20 } };
    const result = await project(facts, state, root, limits);
    const truncated = result.symbols.filter(symbol => symbol.detail.state === 'truncated');
    expect(truncated.length).toBeGreaterThan(3);
    expect(result.counts.cut).toBe(truncated.length);
  }), timeout);

  it('answers resource-limit above maxProjectionBytes and for invalid limits, never a partial projection', () => withFacts(async (facts, state, root) => {
    const plan = planned(facts);
    const provided = await provide(state, plan, root);
    const full = projection(projectArchitectView(facts, 3, 'input/1:architect', provided, architectLimits));
    expect(full.bytes).toBe(Buffer.byteLength(JSON.stringify({ ...full, bytes: 0 })));
    const exact = projectArchitectView(facts, 3, 'input/1:architect', provided, { ...architectLimits, maxProjectionBytes: full.bytes });
    expect(projection(exact)).toEqual(full);
    expect(projectArchitectView(facts, 3, 'input/1:architect', provided, { ...architectLimits, maxProjectionBytes: full.bytes - 1 }))
      .toEqual({ status: 'unavailable', reason: 'resource-limit', message: expect.stringContaining(`${full.bytes} bytes`) });
    for (const invalid of [{ ...architectLimits, maxProjectionBytes: 0 }, { ...architectLimits, tests: { ...architectLimits.tests, maxTitlesPerRecord: 1.5 } },
      { ...architectLimits, details: { ...architectLimits.details, maxOverloads: -1 } }]) {
      expect(projectArchitectView(facts, 3, 'input/1:architect', provided, invalid)).toMatchObject({ status: 'unavailable', reason: 'resource-limit' });
    }
  }), timeout);

  it('is deterministic plain data and throws when a planned result is missing', () => withFacts(async (facts, state, root) => {
    const plan = planned(facts);
    const provided = await provide(state, plan, root);
    const first = projectArchitectView(facts, 3, 'input/1:architect', provided, architectLimits);
    const reversed = { details: [...provided.details].reverse(), shapes: [...provided.shapes].reverse(),
      tests: [...provided.tests].reverse(), features: [...provided.features].reverse() };
    expect(projectArchitectView(facts, 3, 'input/1:architect', reversed, architectLimits)).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(projection(first)).toMatchObject({ schema: 'ramify.architect-projection/1', sequence: 3, inputId: 'input/1:architect' });
    const without = <T>(values: readonly T[]): T[] => values.slice(1);
    expect(() => projectArchitectView(facts, 3, 'x', { ...provided, details: without<SymbolDetail>(provided.details) }, architectLimits)).toThrow(/symbol detail/);
    expect(() => projectArchitectView(facts, 3, 'x', { ...provided, shapes: without(provided.shapes) }, architectLimits)).toThrow(/export shape/);
    expect(() => projectArchitectView(facts, 3, 'x', { ...provided, tests: without(provided.tests) }, architectLimits)).toThrow(/test titles/);
    expect(() => projectArchitectView(facts, 3, 'x', { ...provided, features: [] }, architectLimits)).toThrow(/feature text/);
  }), timeout);

  it('refuses facts without a valid model', () => withFacts(async facts => {
    const unavailable = { status: 'unavailable', reason: 'analysis-failed', message: expect.any(String) };
    expect(planArchitectView({ ...facts, model: null })).toEqual(unavailable);
    expect(planArchitectView({ ...facts, inventory: null })).toEqual(unavailable);
    const empty: ArchitectViewProvided = { details: [], shapes: [], tests: [], features: [] };
    expect(projectArchitectView({ ...facts, model: null }, 1, 'x', empty, architectLimits)).toEqual(unavailable);
  }), timeout);
});
