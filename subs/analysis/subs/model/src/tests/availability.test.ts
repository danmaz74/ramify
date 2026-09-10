import { describe, expect, it } from 'vitest';
import { explainImport, explainVisibility } from '../index.js';
import type { Destination } from '../index.js';
import { exposure, modelOf, moduleRecord, original, question } from './fixtures.js';

// Independently retained truth table from the retired legacy availability tests.
// Fixture construction uses only the current declared-tree vocabulary.
const owners = {
  shop: moduleRecord('shop'), catalog: moduleRecord('shop/catalog'),
  checkout: moduleRecord('shop/checkout'), shipping: moduleRecord('shop/shipping'),
  search: moduleRecord('shop/catalog/search'), inventory: moduleRecord('shop/catalog/inventory'),
  cart: moduleRecord('shop/checkout/cart'), payment: moduleRecord('shop/checkout/payment'),
};
const symbols = [
  original(owners.shop, 'Money'), original(owners.shop, 'formatDate'),
  original(owners.catalog, 'ProductId'), original(owners.catalog, 'SkuRules'),
  original(owners.inventory, 'reserveStock'), original(owners.payment, 'PaymentApi'),
  original(owners.cart, 'CartApi'), original(owners.payment, 'retryQueue'),
];
const declarations = [
  exposure(owners.shop, symbols[0], ['descendants']), exposure(owners.shop, symbols[1], ['descendants']),
  exposure(owners.catalog, symbols[2], ['parent']),
  exposure(owners.shop, symbols[2], ['descendants'], { provider: owners.catalog.id }),
  exposure(owners.catalog, symbols[3], ['descendants']), exposure(owners.inventory, symbols[4], ['parent']),
  exposure(owners.payment, symbols[5], ['parent']),
  exposure(owners.checkout, symbols[5], ['descendants'], { provider: owners.payment.id }),
  exposure(owners.cart, symbols[6], ['parent']),
];
const model = modelOf(Object.values(owners), symbols, declarations);
type Cell = 'own' | '2' | '3' | '-';
const ceiling: readonly (readonly [keyof typeof owners, readonly Cell[]])[] = [
  ['shop', ['own', 'own', '2', '-', '-', '-', '-', '-']],
  ['catalog', ['3', '3', 'own', 'own', '2', '-', '-', '-']],
  ['checkout', ['3', '3', '3', '-', '-', '2', '2', '-']],
  ['shipping', ['3', '3', '3', '-', '-', '-', '-', '-']],
  ['search', ['3', '3', '3', '3', '-', '-', '-', '-']],
  ['inventory', ['3', '3', '3', '3', 'own', '-', '-', '-']],
  ['cart', ['3', '3', '3', '-', '-', '3', 'own', '-']],
  ['payment', ['3', '3', '3', '-', '-', 'own', '-', 'own']],
];

describe('the legacy shop visibility and availability expectations', () => {
  for (const [name, cells] of ceiling) cells.forEach((cell, index) => {
    it(`${name} receives ${symbols[index].id.binding}: ${cell}`, () => {
      const symbol = symbols[index];
      const decision = explainImport(model, question(owners[name], symbol));
      expect(decision.status).toBe(cell === '-' ? 'denied' : 'allowed');
      expect(explainVisibility(model, owners[name].id, symbol.id).visible).toBe(cell !== '-');
      if (cell === 'own') expect(decision.reason).toBe('same-owner');
      if (cell === '-') expect(decision.reason).toBe('not-visible');
      if (cell === '2' || cell === '3') {
        const destination: Destination = cell === '2' ? 'parent' : 'descendants';
        expect(decision.visibility!.paths.some((path) => path.at(-1)?.destination === destination)).toBe(true);
      }
    });
  });

  it('retains all eight originals, including private ones, without treating received symbols as owned', () => {
    expect(model.originals).toHaveLength(8);
    expect(model.originals.filter(({ id }) => id.owner === owners.shop.id).map(({ id }) => id.binding)).toEqual(['Money', 'formatDate']);
    expect(() => explainVisibility(model, owners.shop.id, { ...symbols[2].id, owner: owners.shop.id })).toThrow('Unknown original');
  });

  it('extends ancestor visibility through subdivision but loses former same-owner private access', () => {
    const rates = moduleRecord('shop/shipping/rates');
    const nested = moduleRecord('shop/catalog/search/indexing');
    const split = modelOf([...model.modules, rates, nested], symbols, declarations);
    expect(symbols.map((symbol) => explainVisibility(split, rates.id, symbol.id).visible)).toEqual([true, true, true, false, false, false, false, false]);
    expect(symbols.map((symbol) => explainVisibility(split, nested.id, symbol.id).visible)).toEqual([true, true, true, true, false, false, false, false]);
    const extracted = moduleRecord('shop/checkout/payment/extracted');
    const withExtracted = modelOf([...model.modules, extracted], symbols, declarations);
    expect(explainVisibility(withExtracted, extracted.id, symbols[7].id).visible).toBe(false);
  });

  it('a root parent destination creates no access and named growth remains private', () => {
    const closed = original(owners.catalog, 'newPrivate');
    const extended = modelOf(model.modules, [...symbols, closed], [...declarations,
      exposure(owners.shop, symbols[0], ['parent'])]);
    for (const [name, cells] of ceiling) {
      expect(symbols.map((symbol) => explainVisibility(extended, owners[name].id, symbol.id).visible)).toEqual(cells.map((cell) => cell !== '-'));
      expect(explainVisibility(extended, owners[name].id, closed.id).visible).toBe(name === 'catalog');
    }
  });

  it('unrelated bindings with the same spelling remain distinct even in the same owner', () => {
    const paymentMoney = original(owners.payment, 'Money');
    const otherMoney = original(owners.shop, 'Money', { file: 'other.ts' });
    const extended = modelOf(model.modules, [...symbols, paymentMoney, otherMoney], declarations);
    expect(explainVisibility(extended, owners.cart.id, symbols[0].id).visible).toBe(true);
    expect(explainVisibility(extended, owners.cart.id, paymentMoney.id).visible).toBe(false);
    expect(explainVisibility(extended, owners.cart.id, otherMoney.id).visible).toBe(false);
    expect(explainVisibility(extended, owners.payment.id, paymentMoney.id).visible).toBe(true);
  });

  it('each receiving exposure comes from a direct child or a proper ancestor', () => {
    for (const owner of model.modules) for (const symbol of symbols) {
      const visibility = explainVisibility(model, owner.id, symbol.id);
      for (const path of visibility.paths) {
        const receipt = path.at(-1);
        if (!receipt) {
          expect(symbol.id.owner).toBe(owner.id);
          continue;
        }
        const provider = model.modules.find(({ id }) => id === receipt.module)!;
        if (receipt.destination === 'parent') expect(provider.parent).toBe(owner.id);
        else expect(owner.id.startsWith(`${provider.id}/`)).toBe(true);
      }
    }
  });

  it('a relay from the child that exposed the original adds the stated subtree access', () => {
    const extended = modelOf(model.modules, symbols, [...declarations,
      exposure(owners.catalog, symbols[4], ['descendants'], { provider: owners.inventory.id })]);
    expect(explainImport(extended, question(owners.search, symbols[4]))).toMatchObject({
      status: 'allowed', visibility: { paths: [[
        expect.objectContaining({ module: owners.inventory.id, destination: 'parent' }),
        expect.objectContaining({ module: owners.catalog.id, destination: 'descendants' }),
      ]] },
    });
    expect(explainVisibility(extended, owners.shop.id, symbols[4].id).visible).toBe(false);
  });
});
