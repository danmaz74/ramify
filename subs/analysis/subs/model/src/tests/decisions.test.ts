import { describe, expect, it } from 'vitest';
import { explainImport, explainVisibility, resolveTagRegistry } from '../index.js';
import type { BindingRequest, SourceOrigin } from '../index.js';
import { exposure, modelOf, moduleRecord, original, question, valid } from './fixtures.js';

describe('kind-based value and type availability', () => {
  for (const [coupled, portable] of [['ui', 'browser'], ['coupled', 'portable']]) {
    const registry = valid(resolveTagRegistry([{ name: 'testing', kind: 'required-importer' },
      { name: coupled, kind: 'required-importer' }, { name: portable, kind: 'required-symbol' }]));
    const root = moduleRecord('app', [], registry);
    for (const [importerTags, symbolTags, value, type] of [
      [[coupled, portable], [coupled, portable], 'allowed', 'allowed'],
      [[portable], [coupled, portable], 'denied', 'denied'],
      [[coupled, portable], [coupled], 'denied', 'allowed'],
      [[], [portable], 'allowed', 'allowed'],
      [[coupled], [], 'allowed', 'allowed'],
    ] as const) {
      it(`${coupled}/${portable}: importer ${importerTags} and original ${symbolTags}`, () => {
        const child = moduleRecord('app/child', importerTags, registry);
        const symbol = original(root, 'api', { tags: symbolTags, registry });
        const model = modelOf([root, child], [symbol], [exposure(root, symbol, ['descendants'])], registry);
        expect(explainVisibility(model, child.id, symbol.id).visible).toBe(true);
        expect(explainImport(model, question(child, symbol)).status).toBe(value);
        expect(explainImport(model, question(child, symbol, { selection: { original: symbol.id, request: 'type-only' } })).status).toBe(type);
      });
    }
  }

  it('reports every applicable conjunct and stable first denial after establishing visibility', () => {
    const root = moduleRecord('app');
    const child = moduleRecord('app/child', ['browser']);
    const symbol = original(root, 'api', { tags: ['ui', 'dispatch'] });
    const model = modelOf([root, child], [symbol], [exposure(root, symbol, ['descendants'])]);
    expect(explainImport(model, question(child, symbol))).toMatchObject({ reason: 'required-importer-tag',
      requirements: [
        { tag: 'dispatch', kind: 'required-importer', satisfied: false },
        { tag: 'ui', kind: 'required-importer', satisfied: false },
        { tag: 'browser', kind: 'required-symbol', satisfied: false },
      ] });
    const closed = modelOf([root, child], [symbol]);
    expect(explainImport(closed, question(child, symbol))).toMatchObject({ reason: 'not-visible', requirements: [] });
  });

  it('does not weaken explicit value requests based on later use; pure type resolution belongs to the adapter', () => {
    const root = moduleRecord('app');
    const child = moduleRecord('app/child', ['browser']);
    const types = original(root, 'Interface', { hasValue: false });
    const runtime = original(root, 'Merged', { hasValue: true, hasType: true });
    const model = modelOf([root, child], [types, runtime], [exposure(root, types, ['descendants']), exposure(root, runtime, ['descendants'])]);
    expect(explainImport(model, question(child, types, { selection: { original: types.id, request: 'type-only' } })).status).toBe('allowed');
    expect(() => explainImport(model, question(child, types))).toThrow('runtime binding');
    expect(explainImport(model, question(child, runtime)).reason).toBe('required-symbol-tag');
    expect(explainImport(model, question(child, runtime, { selection: { original: runtime.id, request: 'type-only' } })).status).toBe('allowed');
  });

  it('forwarding keeps original tags while new wrappers and type aliases receive their defining profile', () => {
    const root = moduleRecord('app');
    const bridge = moduleRecord('app/bridge', ['ui', 'dispatch']);
    const consumer = moduleRecord('app/consumer');
    const symbol = original(root);
    const wrapper = original(bridge, 'wrapper');
    const typeAlias = original(bridge, 'Alias', { hasValue: false });
    const model = modelOf([root, bridge, consumer], [symbol, wrapper, typeAlias], [
      exposure(root, symbol, ['descendants']),
      ...[wrapper, typeAlias].flatMap((binding) => [exposure(bridge, binding, ['parent']),
        exposure(root, binding, ['descendants'], { provider: bridge.id })]),
    ]);
    const forwarded = explainImport(model, question(consumer, symbol, {
      target: { file: 'subs/bridge/src/forward.ts', area: bridge.areas[0] }, forwarding: [symbol.origin],
    }));
    expect(forwarded).toMatchObject({ status: 'allowed', original: { id: symbol.id, tags: [] } });
    expect(forwarded.question.target.file).not.toBe(forwarded.original!.origin.file);
    expect(explainImport(model, question(consumer, wrapper))).toMatchObject({ status: 'denied', reason: 'required-importer-tag',
      original: { tags: ['dispatch', 'ui'] } });
    expect(explainImport(model, question(consumer, typeAlias, { selection: { original: typeAlias.id, request: 'type-only' } })))
      .toMatchObject({ status: 'denied', reason: 'required-importer-tag', original: { tags: ['dispatch', 'ui'] } });
  });
});

describe('testing origin precedes same-owner and tag exemptions', () => {
  const root = moduleRecord('app', ['browser']);
  const child = moduleRecord('app/consumer');
  const testing = moduleRecord('app/verification', ['testing', 'browser']);
  const ordinary = original(root, 'ordinary');
  const tagged = original(root, 'testSupport', { tags: ['testing'] });
  const fixture = original(root, 'fixture', { file: 'tests/fixture.ts' });
  const style = original(root, 'default', { kind: 'resource', file: 'tests/style.css' });
  const separate = original(testing, 'separate');
  const model = modelOf([root, child, testing], [ordinary, tagged, fixture, style, separate], [
    ...[ordinary, tagged, fixture, style].map((symbol) => exposure(root, symbol, ['descendants'])),
    exposure(testing, separate, ['parent']),
  ]);

  it.each(['value', 'type-only'] as const)('distinguishes ordinary testing-tagged support from testing source for %s', (request) => {
    expect(explainImport(model, question(root, tagged, { selection: { original: tagged.id, request } }))).toMatchObject({ status: 'allowed', reason: 'same-owner' });
    expect(explainImport(model, question(child, tagged, { selection: { original: tagged.id, request } }))).toMatchObject({ status: 'denied', reason: 'required-importer-tag' });
    expect(explainImport(model, question(root, fixture, { selection: { original: fixture.id, request } }))).toMatchObject({ status: 'denied', reason: 'testing-origin', visibility: null, requirements: [] });
    expect(explainImport(model, question(root.areas[1], fixture, { selection: { original: fixture.id, request } }))).toMatchObject({ status: 'allowed', reason: 'same-owner' });
  });

  it.each(['target', 'forwarding', 'original'] as const)('checks the %s testing source, including ordinary forwarding of a testing original', (position) => {
    const testingOrigin: SourceOrigin = { file: 'src/tests/barrel.ts', area: root.areas[1] };
    const symbol = position === 'original' ? fixture : ordinary;
    const decision = explainImport(model, question(root, symbol, {
      target: position === 'target' ? testingOrigin : ordinary.origin,
      forwarding: position === 'forwarding' ? [testingOrigin] : [],
    }));
    expect(decision.status).toBe('denied');
    expect(decision.reason).toBe('testing-origin');
    expect(decision.original?.id).toEqual(symbol.id);
    expect(decision.blockingOrigins).toContainEqual(position === 'original' ? fixture.origin : testingOrigin);
    expect(decision.checkedOrigins).toContainEqual(ordinary.origin);
  });

  it('checks resources and testing modules ordinary source, without treating symbol tags as source classification', () => {
    expect(explainImport(model, question(root, style)).reason).toBe('testing-origin');
    expect(explainImport(model, question(root, separate)).reason).toBe('testing-origin');
    expect(explainImport(model, question(root.areas[1], ordinary)).status).toBe('allowed');
    expect(ordinary.origin.area.profile).toEqual(['browser']);
    expect(ordinary.tags).toEqual([]);
  });

  it('requires foreign exposure for tests and drops browser only in nested tests', () => {
    const privateSymbol = original(root, 'private');
    const extended = modelOf(model.modules, [...model.originals, privateSymbol], model.exposures);
    expect(explainImport(extended, question(root.areas[1], privateSymbol)).status).toBe('allowed');
    expect(explainImport(extended, question(testing, privateSymbol)).reason).toBe('not-visible');
    expect(explainImport(model, question(testing, fixture)).reason).toBe('required-symbol-tag');
    expect(explainImport(model, question(testing.areas[1], fixture)).status).toBe('allowed');
  });

  it('permits symbol-free loads without dummy exposures while checking all their known origins', () => {
    expect(explainImport(model, question(child, null, { target: ordinary.origin })))
      .toMatchObject({ status: 'allowed', reason: 'symbol-free', original: null, visibility: null });
    expect(explainImport(model, question(root, null, { target: fixture.origin }))).toMatchObject({ status: 'denied', reason: 'testing-origin' });
    expect(explainImport(model, question(root.areas[1], null, { target: fixture.origin }))).toMatchObject({ status: 'allowed', reason: 'symbol-free' });
  });

  it('preserves value implies type-only implies visible across profiles and retained source paths', () => {
    for (const module of model.modules) for (const area of module.areas) for (const symbol of model.originals) {
      const decisions = (['value', 'type-only'] as BindingRequest[]).map((request) => explainImport(model,
        question(area, symbol, { selection: { original: symbol.id, request } })));
      if (decisions[0].status === 'allowed') expect(decisions[1].status).toBe('allowed');
      if (decisions[1].status === 'allowed') expect(explainVisibility(model, module.id, symbol.id).visible).toBe(true);
      expect(JSON.parse(JSON.stringify(decisions))).toEqual(decisions);
      expect(Object.isFrozen(decisions[0].checkedOrigins)).toBe(true);
    }
  });
});
