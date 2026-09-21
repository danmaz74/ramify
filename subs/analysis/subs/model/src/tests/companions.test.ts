import { describe, expect, it } from 'vitest';
import { buildModel, createDefaultTagRegistry, explainImport, listCompanionViolations, resolveTagRegistry } from '../index.js';
import type { CompanionViolation, Exposure, ImportDecision, Model, ModuleRecord, Original, ResolvedTagRegistry } from '../index.js';
import { exposureIndexFor, visibleInEveryProperDescendant } from '../exposure-index.js';
import { recorded } from './recorded-decisions.js';
import { assertIndexAgreement, companionsOf, exposure, location, modelOf, moduleRecord, noCompanions, original, question, valid } from './fixtures.js';

const statementOf = (module: ModuleRecord, start = 3) => location(module.areas[0].root.replace(/src$/, 'module.ramify'), start);
const summary = (violations: readonly CompanionViolation[]) => violations.map(({ module, original, companion, destination, reason, tags, statement }) =>
  ({ module, original: original.binding, companion: companion.binding, destination, reason, tags, statement: `${statement.file}:${statement.start}` }));

describe('SC01: an owned symbol exposed to parent without its owned companion', () => {
  const app = moduleRecord('app');
  const orders = moduleRecord('app/orders');
  const order = original(orders, 'Order', { hasValue: false });
  const placeOrder = original(orders, 'placeOrder', { companions: companionsOf([order]) });

  it('yields one not-visible violation at that statement', () => {
    const model = modelOf([app, orders], [order, placeOrder], [exposure(orders, placeOrder, ['parent'], { start: 4 })]);
    expect(listCompanionViolations(model)).toEqual([{ module: orders.id, original: placeOrder.id, companion: order.id,
      destination: 'parent', reason: 'not-visible', tags: [], statement: statementOf(orders, 4) }]);
  });

  it('is removed by exposing the companion to parent', () => {
    const model = modelOf([app, orders], [order, placeOrder], [exposure(orders, placeOrder, ['parent'], { start: 4 }),
      exposure(orders, order, ['parent'], { start: 5 })]);
    expect(listCompanionViolations(model)).toEqual([]);
  });

  it('names an unexported owned companion absent from the model as not visible beyond its owner', () => {
    const hidden = { kind: 'code' as const, owner: orders.id, file: 'place-order.ts', binding: 'Hidden' };
    const symbol: Original = { ...placeOrder, companions: { ...noCompanions, named: [hidden], evidence: [location('signature.ts')] } };
    const model = modelOf([app, orders], [symbol], [exposure(orders, symbol, ['parent'])]);
    expect(summary(listCompanionViolations(model))).toEqual([{ module: orders.id, original: 'placeOrder', companion: 'Hidden',
      destination: 'parent', reason: 'not-visible', tags: [], statement: 'subs/orders/module.ramify:3' }]);
  });
});

describe('SC02: exposure to descendants', () => {
  const app = moduleRecord('app');
  const shop = moduleRecord('app/shop');
  const left = moduleRecord('app/shop/left');
  const right = moduleRecord('app/shop/right');
  const modules = [app, shop, left, right];

  it('is satisfied by a companion the module exposes to descendants', () => {
    const type = original(shop, 'Type', { hasValue: false });
    const symbol = original(shop, 'use', { companions: companionsOf([type]) });
    const model = modelOf(modules, [type, symbol], [exposure(shop, symbol, ['descendants']), exposure(shop, type, ['descendants'], { start: 4 })]);
    expect(listCompanionViolations(model)).toEqual([]);
  });

  it('is satisfied by a companion an ancestor exposes to descendants', () => {
    const type = original(app, 'Type', { hasValue: false });
    const symbol = original(shop, 'use', { companions: companionsOf([type]) });
    const model = modelOf(modules, [type, symbol], [exposure(shop, symbol, ['descendants']), exposure(app, type, ['descendants'])]);
    expect(listCompanionViolations(model)).toEqual([]);
  });

  it('is not satisfied by a companion owned by one child and exposed only to parent', () => {
    const type = original(left, 'Type', { hasValue: false });
    const symbol = original(shop, 'use', { companions: companionsOf([type]) });
    const model = modelOf(modules, [type, symbol], [exposure(shop, symbol, ['descendants']), exposure(left, type, ['parent'])]);
    expect(summary(listCompanionViolations(model))).toEqual([{ module: shop.id, original: 'use', companion: 'Type',
      destination: 'descendants', reason: 'not-visible', tags: [], statement: 'subs/shop/module.ramify:3' }]);
    // The index answers from exposures to descendants first and visits descendants only then.
    const index = exposureIndexFor(model);
    expect(visibleInEveryProperDescendant(index, type.id, shop.id)).toBe(false);
    expect(visibleInEveryProperDescendant(index, type.id, left.id)).toBe(true);
  });
});

describe('SC03 and SC04: re-exposure', () => {
  const app = moduleRecord('app');
  const sales = moduleRecord('app/sales');
  const orders = moduleRecord('app/sales/orders');
  const order = original(orders, 'Order', { hasValue: false });
  const placeOrder = original(orders, 'placeOrder', { companions: companionsOf([order]) });

  it('SC03: a parent re-exposing a received symbol without its received companion carries the violation', () => {
    const model = modelOf([app, sales, orders], [order, placeOrder], [
      exposure(orders, placeOrder, ['parent']), exposure(orders, order, ['parent'], { start: 4 }),
      exposure(sales, placeOrder, ['parent'], { provider: orders.id, start: 7 }),
    ]);
    expect(summary(listCompanionViolations(model))).toEqual([{ module: sales.id, original: 'placeOrder', companion: 'Order',
      destination: 'parent', reason: 'not-visible', tags: [], statement: 'subs/sales/module.ramify:7' }]);
  });

  it('SC04: one missing exposure at the owner yields one violation although two ancestors re-expose', () => {
    const model = modelOf([app, sales, orders], [order, placeOrder], [
      exposure(orders, placeOrder, ['parent']),
      exposure(sales, placeOrder, ['parent'], { provider: orders.id }),
      exposure(app, placeOrder, ['descendants'], { provider: sales.id }),
    ]);
    expect(summary(listCompanionViolations(model))).toEqual([{ module: orders.id, original: 'placeOrder', companion: 'Order',
      destination: 'parent', reason: 'not-visible', tags: [], statement: 'subs/sales/subs/orders/module.ramify:3' }]);
  });
});

describe('SC05: expose-sub selections', () => {
  const app = moduleRecord('app');
  const sales = moduleRecord('app/sales');
  const orders = moduleRecord('app/sales/orders');
  const order = original(orders, 'Order', { hasValue: false });
  const placeOrder = original(orders, 'placeOrder', { companions: companionsOf([order]) });
  const owned = [exposure(orders, placeOrder, ['parent']), exposure(orders, order, ['parent'], { start: 4 })];

  it('passes for a wildcard step carrying the symbol and its companion together', () => {
    // A wildcard expands to one selection per effective to-parent pair of the child, at one statement.
    const model = modelOf([app, sales, orders], [order, placeOrder], [...owned,
      ...[placeOrder, order].map((symbol) => exposure(sales, symbol, ['parent'], { provider: orders.id, start: 6 }))]);
    expect(listCompanionViolations(model)).toEqual([]);
  });

  it('fails at a named selection omitting the companion', () => {
    const model = modelOf([app, sales, orders], [order, placeOrder], [...owned,
      exposure(sales, placeOrder, ['parent'], { provider: orders.id, start: 6 })]);
    expect(summary(listCompanionViolations(model))).toEqual([{ module: sales.id, original: 'placeOrder', companion: 'Order',
      destination: 'parent', reason: 'not-visible', tags: [], statement: 'subs/sales/module.ramify:6' }]);
  });
});

describe('SC06: a companion visible at the destination by another path', () => {
  const app = moduleRecord('app');
  const sales = moduleRecord('app/sales');
  const orders = moduleRecord('app/sales/orders');
  const pricing = moduleRecord('app/sales/pricing');
  const modules = [app, sales, orders, pricing];

  it('passes when the destination owns the companion', () => {
    const type = original(sales, 'Currency', { hasValue: false });
    const symbol = original(orders, 'price', { companions: companionsOf([type]) });
    const model = modelOf(modules, [type, symbol], [exposure(sales, type, ['descendants']), exposure(orders, symbol, ['parent'])]);
    expect(listCompanionViolations(model)).toEqual([]);
  });

  it('passes when a sibling child exposes the companion to the same parent', () => {
    const type = original(pricing, 'Currency', { hasValue: false });
    const symbol = original(orders, 'price', { companions: companionsOf([type]) });
    const model = modelOf(modules, [type, symbol], [exposure(pricing, type, ['parent']),
      exposure(sales, type, ['descendants'], { provider: pricing.id, start: 5 }), exposure(orders, symbol, ['parent'])]);
    expect(listCompanionViolations(model)).toEqual([]);
  });

  it('passes when the destination receives the companion from an ancestor', () => {
    const type = original(app, 'Currency', { hasValue: false });
    const symbol = original(orders, 'price', { companions: companionsOf([type]) });
    const model = modelOf(modules, [type, symbol], [exposure(app, type, ['descendants']), exposure(orders, symbol, ['parent'])]);
    expect(listCompanionViolations(model)).toEqual([]);
  });
});

function tagFixture(registry: ResolvedTagRegistry, restricted: string, promised: string) {
  const app = moduleRecord('app', [], registry);
  const orders = moduleRecord('app/orders', [], registry);
  const restrictedType = original(orders, 'View', { hasValue: false, tags: [restricted], registry });
  const promisedType = original(orders, 'Safe', { hasValue: false, tags: [promised], registry });
  const build = (symbolTags: readonly string[]) => {
    const symbol = original(orders, 'render', { tags: symbolTags, registry, companions: companionsOf([restrictedType, promisedType]) });
    return modelOf([app, orders], [restrictedType, promisedType, symbol], [
      exposure(orders, symbol, ['parent'], { start: 4 }), exposure(orders, symbol, ['descendants'], { start: 6 }),
      exposure(orders, restrictedType, ['parent', 'descendants'], { start: 8 }),
      exposure(orders, promisedType, ['parent', 'descendants'], { start: 9 }),
    ], registry);
  };
  return { orders, build };
}

describe('SC07 and SC08: tags', () => {
  it('SC07: a [ui] companion of an untagged symbol requires ui at each owner statement; browser companions pass', () => {
    const { orders, build } = tagFixture(createDefaultTagRegistry(), 'ui', 'browser');
    expect(summary(listCompanionViolations(build([])))).toEqual([4, 6].map((start) => ({ module: orders.id, original: 'render',
      companion: 'View', destination: 'parent', reason: 'requires-tag', tags: ['ui'], statement: `subs/orders/module.ramify:${start}` })));
    expect(listCompanionViolations(build(['ui']))).toEqual([]);
  });

  it('SC08: a renamed required-importer tag and an added required-symbol tag give the same verdicts', () => {
    const registry = valid(resolveTagRegistry([{ name: 'testing', kind: 'required-importer' },
      { name: 'coupled', kind: 'required-importer' }, { name: 'portable', kind: 'required-symbol' },
      { name: 'native', kind: 'required-symbol' }]));
    const { orders, build } = tagFixture(registry, 'coupled', 'portable');
    expect(summary(listCompanionViolations(build([])))).toEqual([4, 6].map((start) => ({ module: orders.id, original: 'render',
      companion: 'View', destination: 'parent', reason: 'requires-tag', tags: ['coupled'], statement: `subs/orders/module.ramify:${start}` })));
    expect(listCompanionViolations(build(['coupled']))).toEqual([]);
    expect(listCompanionViolations(build(['coupled', 'native']))).toEqual([]);
  });
});

describe('SC09: a companion defined in testing source', () => {
  const app = moduleRecord('app');
  const orders = moduleRecord('app/orders');
  const fixture = original(orders, 'OrderFixture', { file: 'tests/fixture.ts', hasValue: false });

  it.each([[[], ['testing']], [['testing'], []]] as const)('a symbol tagged %j yields missing tags %j', (symbolTags, missing) => {
    const symbol = original(orders, 'seed', { tags: symbolTags, companions: companionsOf([fixture]) });
    const model = modelOf([app, orders], [fixture, symbol], [exposure(orders, symbol, ['parent']),
      exposure(orders, fixture, ['parent'], { start: 4 })]);
    expect(fixture.tags).toEqual(['testing']);
    expect(summary(listCompanionViolations(model))).toEqual(missing.length ? [{ module: orders.id, original: 'seed',
      companion: 'OrderFixture', destination: 'parent', reason: 'requires-tag', tags: missing, statement: 'subs/orders/module.ramify:3' }] : []);
  });
});

describe('SC10: no violation without an effective step, and no effect on import decisions', () => {
  const app = moduleRecord('app');
  const sales = moduleRecord('app/sales');
  const orders = moduleRecord('app/sales/orders');
  const view = original(orders, 'View', { hasValue: false, tags: ['ui'] });
  const render = original(orders, 'render', { companions: companionsOf([view]) });

  it('an ineffective exposure yields none', () => {
    // `orders` exposes render only to descendants, so the parent's selection is ineffective.
    const model = modelOf([app, sales, orders], [view, render], [
      exposure(orders, view, ['descendants']), exposure(orders, render, ['descendants']),
      exposure(sales, render, ['parent'], { provider: orders.id, effective: false, start: 6 }),
    ]);
    expect(summary(listCompanionViolations(model)).filter(({ module }) => module === sales.id)).toEqual([]);
  });

  it('a to-parent exposure at the root and an unexposed symbol yield none', () => {
    const rootType = original(app, 'Type', { hasValue: false, tags: ['ui'] });
    const rootSymbol = original(app, 'use', { companions: companionsOf([rootType]) });
    expect(listCompanionViolations(modelOf([app], [rootType, rootSymbol], [exposure(app, rootSymbol, ['parent'])]))).toEqual([]);
    expect(listCompanionViolations(modelOf([app, sales, orders], [view, render]))).toEqual([]);
  });

  it('a violation never changes an explainImport result', () => {
    const consumer = moduleRecord('app/consumer', ['ui']);
    const plain = { ...render, companions: noCompanions };
    const exposures = [exposure(orders, render, ['parent']), exposure(sales, render, ['parent'], { provider: orders.id }),
      exposure(app, render, ['descendants'], { provider: sales.id }), exposure(orders, view, ['descendants'])];
    const modules = [app, sales, orders, consumer];
    const withCompanions = modelOf(modules, [view, render], exposures);
    const without = modelOf(modules, [view, plain], exposures);
    expect(listCompanionViolations(withCompanions).length).toBeGreaterThan(0);
    expect(listCompanionViolations(without)).toEqual([]);
    const strip = (decision: ImportDecision) => ({ ...decision,
      original: decision.original && { ...decision.original, companions: undefined } });
    for (const module of modules) for (const area of module.areas) for (const symbol of [view, render]) {
      for (const request of symbol.hasValue ? ['value', 'type-only'] as const : ['type-only'] as const) {
        const ask = question(area, symbol, { selection: { original: symbol.id, request } });
        expect(strip(explainImport(withCompanions, ask))).toEqual(strip(explainImport(without, ask)));
      }
    }
  });
});

describe('ordering and construction', () => {
  it('orders by statement location, then original key, then companion key', () => {
    const app = moduleRecord('app');
    const orders = moduleRecord('app/orders');
    const a = original(orders, 'A', { hasValue: false });
    const b = original(orders, 'B', { hasValue: false });
    const first = original(orders, 'first', { companions: companionsOf([b, a]) });
    const second = original(orders, 'second', { companions: companionsOf([a]) });
    const model = modelOf([app, orders], [a, b, first, second], [exposure(orders, second, ['parent'], { start: 2 }),
      exposure(orders, first, ['parent'], { start: 9 }), exposure(orders, first, ['parent'], { start: 5, names: ['alias'] })]);
    // Repeated selections merge; the step is reported at its first statement.
    expect(summary(listCompanionViolations(model)).map(({ original, companion, statement }) => [statement, original, companion])).toEqual([
      ['subs/orders/module.ramify:2', 'second', 'A'],
      ['subs/orders/module.ramify:5', 'first', 'A'],
      ['subs/orders/module.ramify:5', 'first', 'B'],
    ]);
  });

  it('carries companions unchanged and rejects malformed facts', () => {
    const app = moduleRecord('app');
    const type = original(app, 'Type', { hasValue: false });
    const symbol = original(app, 'use', { companions: companionsOf([type], { inferred: true, unresolved: 2 }) });
    const input = { registry: createDefaultTagRegistry(), modules: [app], originals: [type, symbol], exposures: [] as Exposure[] };
    const built = valid(buildModel(input));
    expect(built.originals.find(({ id }) => id.binding === 'use')!.companions).toEqual(symbol.companions);
    const variants: unknown[] = [null, { ...symbol.companions, evidence: [] },
      { ...symbol.companions, named: [symbol.id], evidence: [location()] },
      { ...symbol.companions, named: [type.id, type.id], evidence: [location(), location()] },
      { ...symbol.companions, named: [{ ...type.id, owner: 'missing' }] },
      { ...symbol.companions, unresolved: -1 }, { ...symbol.companions, inferred: 'no' }];
    for (const companions of variants) {
      expect(buildModel({ ...input, originals: [type, { ...symbol, companions } as Original] }))
        .toMatchObject({ status: 'invalid', issues: [expect.objectContaining({ code: 'invalid-original' })] });
    }
    const { companions: _omitted, ...bare } = symbol;
    expect(buildModel({ ...input, originals: [type, bare as Original] }))
      .toMatchObject({ status: 'invalid', issues: [expect.objectContaining({ code: 'invalid-original' })] });
    expect(buildModel({ ...input, originals: [type, symbol, { ...symbol, companions: noCompanions }] }))
      .toMatchObject({ status: 'invalid', issues: [expect.objectContaining({ code: 'invalid-original' })] });
  });

  it('the exposure index agrees with explainVisibility on the recorded model', () => {
    const model: Model = valid(buildModel(recorded.model));
    expect(() => assertIndexAgreement(model)).not.toThrow();
  });
});
