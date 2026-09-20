import { describe, expect, test } from 'vitest';
import type { MapSubmission, Reuse } from '../interfaces/map.js';
import { validateAgainstViews, viewKey } from '../mapping/validate.js';
import type { ApiViewSnapshot, ArchitectIndex, SymbolRecord } from '../mapping/views.js';

// A small project: shop, with orders and catalog as siblings, and orders/pricing beneath orders.
const modules = [
  { module: 'shop', dir: '', parent: null },
  { module: 'shop/orders', dir: 'subs/orders', parent: 'shop' },
  { module: 'shop/orders/pricing', dir: 'subs/orders/subs/pricing', parent: 'shop/orders' },
  { module: 'shop/catalog', dir: 'subs/catalog', parent: 'shop' },
];
const symbols: SymbolRecord[] = [
  { module: 'shop/catalog', name: 'findProduct', file: 'subs/catalog/src/find.ts' },
  { module: 'shop/catalog', name: 'Product', file: 'subs/catalog/src/interfaces/product.ts' },
  { module: 'shop/orders/pricing', name: 'default', binding: 'calculateTotal', as: ['total'], file: 'subs/orders/subs/pricing/src/total.ts' },
];
const index: ArchitectIndex = {
  revision: 'rev/1:x:1',
  input: 'input/1:abc',
  modules: new Map(modules.map(entry => [entry.module, entry])),
  symbols: new Map(modules.map(entry => [entry.module, symbols.filter(record => record.module === entry.module)])),
};

const productView = 'subs/orders/src/.ramify/external/subs/catalog/src/interfaces/product.ts.md';
const pricingView = 'subs/orders/src/.ramify/children/subs/orders/subs/pricing/src/total.ts.md';
function ordersView(coverage: number | null): ApiViewSnapshot {
  return {
    module: 'shop/orders', area: 'src', path: 'subs/orders/src/.ramify', revision: 'rev/1:x:1', coverage,
    files: new Map([
      [productView, { definingFile: 'subs/catalog/src/interfaces/product.ts', names: new Map([['Product', { typeOnly: true }]]) }],
      [pricingView, { definingFile: 'subs/orders/subs/pricing/src/total.ts', names: new Map([['default', { typeOnly: false }]]) }],
    ]),
  };
}

function map(reuse: Reuse[], extra: Partial<MapSubmission> = {}): MapSubmission {
  return {
    summary: { change: 'Orders show product names.', preserves: [] },
    modulesTouched: [{ module: 'shop/orders', weight: 'heavy', why: 'It renders the order.' }],
    reuse,
    newCapabilities: [],
    seams: [],
    entryPoint: { module: 'shop/orders', acceptance: 'An order lists its products by name.' },
    workItems: [],
    assumptions: { assumed: [], notFound: [], coverageLimits: [] },
    evidence: [],
    ...extra,
  };
}

const requester = { module: 'shop/orders', area: 'src' as const };
const available = (record: string): Reuse['availability'] => ({ status: 'available', record, importSpelling: 'import …' });
const unavailable: Reuse['availability'] = { status: 'unavailable', exposures: [{ module: 'shop/catalog', declaration: 'expose-src findProduct from "find.ts" to parent' }] };
const views = (coverage: number | null) => new Map([[viewKey('shop/orders', 'src'), ordersView(coverage)]]);

describe('validation against the views', () => {
  test('accepts availabilities that agree with the requester\'s view', () => {
    const errors = validateAgainstViews(map([
      { capability: 'product type', symbols: [{ name: 'Product', owner: 'shop/catalog' }], requester, availability: available(productView) },
      { capability: 'totals, by exposure name', symbols: [{ name: 'total', owner: 'shop/orders/pricing' }], requester, availability: available(pricingView) },
      { capability: 'lookup', symbols: [{ name: 'findProduct', owner: 'shop/catalog' }], requester, availability: unavailable },
      { capability: 'lookup in tests', symbols: [{ name: 'findProduct', owner: 'shop/catalog' }], requester: { module: 'shop/orders', area: 'src/tests' }, availability: { status: 'unknown', reason: 'not materialized' } },
    ]), index, views(null));
    expect(errors).toEqual([]);
  });

  test('every named module exists or is marked proposed', () => {
    const errors = validateAgainstViews(map([], {
      modulesTouched: [
        { module: 'shop/orders', weight: 'heavy', why: 'w' },
        { module: 'shop/orders/names', weight: 'light', why: 'w', proposed: { parent: 'shop/orders', purpose: 'p', tags: [] } },
        { module: 'shop/billing', weight: 'light', why: 'w' },
        { module: 'shop/ghost/child', weight: 'light', why: 'w', proposed: { parent: 'shop/ghost', purpose: 'p', tags: [] } },
      ],
      newCapabilities: [{ capability: 'names', goal: 'g', owner: 'shop/orders/names', consumers: ['shop/orders', 'shop/nobody'] }],
      seams: [{ capability: 'c', owner: 'shop/catalog', consumer: 'shop/elsewhere' }],
      workItems: [{ title: 't', subtreeRoot: 'shop/missing', capabilities: ['names'] }],
    }), index, views(null));
    expect(errors).toEqual([
      'modulesTouched.2.module: "shop/billing" is not a module of the architect view and is not marked proposed in modulesTouched',
      'modulesTouched.3.proposed.parent: "shop/ghost" is not a module of the architect view and is not marked proposed in modulesTouched',
      'newCapabilities.0.consumers.1: "shop/nobody" is not a module of the architect view and is not marked proposed in modulesTouched',
      'seams.0.consumer: "shop/elsewhere" is not a module of the architect view and is not marked proposed in modulesTouched',
      'workItems.0.subtreeRoot: "shop/missing" is not a module of the architect view and is not marked proposed in modulesTouched',
    ]);
  });

  test('every cited symbol exists under the named owner', () => {
    const errors = validateAgainstViews(map([
      { capability: 'c', symbols: [{ name: 'findProduct', owner: 'shop/orders' }, { name: 'x', owner: 'shop/nowhere' }], requester, availability: { status: 'unknown', reason: 'r' } },
    ]), index, views(null));
    expect(errors).toEqual([
      'reuse.0.symbols.0: the architect view records no exported "findProduct" owned by "shop/orders"',
      'reuse.0.symbols.1.owner: "shop/nowhere" is not a module of the architect view; reused symbols must exist',
    ]);
  });

  test('no availability but unknown for a requester whose view the job never materialized', () => {
    const reuse = (status: 'available' | 'unavailable' | 'unknown'): Reuse => ({
      capability: 'c', symbols: [{ name: 'Product', owner: 'shop/catalog' }], requester: { module: 'shop/catalog', area: 'src' },
      availability: status === 'available' ? available(productView) : status === 'unavailable' ? unavailable : { status: 'unknown', reason: 'r' },
    });
    const errors = validateAgainstViews(map([reuse('available'), reuse('unavailable'), reuse('unknown')]), index, views(null));
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/^reuse\.0\.availability: "available" is stated for shop\/catalog \(src\), whose API view this job never materialized/);
    expect(errors[1]).toMatch(/^reuse\.1\.availability: "unavailable" is stated for shop\/catalog \(src\), whose API view this job never materialized/);
  });

  test('available must be listed in the view, and its record must be the file that lists it', () => {
    const errors = validateAgainstViews(map([
      { capability: 'c', symbols: [{ name: 'findProduct', owner: 'shop/catalog' }], requester, availability: available(productView) },
      { capability: 'd', symbols: [{ name: 'Product', owner: 'shop/catalog' }], requester, availability: available('subs/orders/src/.ramify/external/nothing.ts.md') },
      { capability: 'e', symbols: [{ name: 'Product', owner: 'shop/catalog' }], requester, availability: available(pricingView) },
    ]), index, views(2));
    expect(errors).toEqual([
      'reuse.0.availability: "findProduct" of shop/catalog is not in subs/orders/src/.ramify, the API view of shop/orders (src), so the view does not show it available; the view reports coverage limits (2), so state "unknown" if you cannot establish it',
      `reuse.0.availability.record: ${productView} lists none of the reused symbols`,
      'reuse.1.availability.record: "subs/orders/src/.ramify/external/nothing.ts.md" is not a file of subs/orders/src/.ramify; cite the generated file that lists the symbol',
      `reuse.2.availability.record: ${pricingView} lists none of the reused symbols`,
    ]);
  });

  test('unavailable is contradicted by a listed symbol and cannot rest on an incomplete view', () => {
    const listed = validateAgainstViews(map([
      { capability: 'c', symbols: [{ name: 'Product', owner: 'shop/catalog' }], requester, availability: unavailable },
    ]), index, views(null));
    expect(listed).toEqual([`reuse.0.availability: "Product" of shop/catalog is listed in ${productView}, so it is available to shop/orders (src), not unavailable`]);
    const incomplete = validateAgainstViews(map([
      { capability: 'c', symbols: [{ name: 'findProduct', owner: 'shop/catalog' }], requester, availability: unavailable },
    ]), index, views(3));
    expect(incomplete).toEqual(['reuse.0.availability: subs/orders/src/.ramify reports coverage limits (3); absence from an incomplete view does not establish "unavailable", so state "unknown" with that reason']);
  });

  test('exposure declarations name existing or proposed modules', () => {
    const errors = validateAgainstViews(map([
      { capability: 'c', symbols: [{ name: 'findProduct', owner: 'shop/catalog' }], requester, availability: { status: 'unavailable', exposures: [{ module: 'shop/shelf', declaration: 'expose-sub * from x to parent' }] } },
    ]), index, views(null));
    expect(errors).toEqual(['reuse.0.availability.exposures.0.module: "shop/shelf" is not a module of the architect view and is not marked proposed in modulesTouched']);
  });
});
