import { describe, expect, it } from 'vitest';

import { explainImport, isAvailable, mayImport, type ImportClause } from './availability.js';
import {
  allSymbols,
  buildTree,
  type ModuleDeclaration,
  type ModuleId,
  type SymbolRef,
} from './tree.js';

/**
 * The example universe of the retired first diagram (`src/viz/diagrams/shop.ts`),
 * declared exactly as that diagram's decision table states it.
 *
 * ```text
 * shop                      (application root - an ordinary module)
 * ├── catalog
 * │   ├── search
 * │   └── inventory
 * ├── checkout
 * │   ├── cart
 * │   └── payment
 * └── shipping
 * ```
 */
const shopDeclaration: ModuleDeclaration = {
  id: 'shop',
  owns: [
    { symbol: 'Money', exposeToDescendants: true },
    { symbol: 'formatDate', exposeToDescendants: true },
  ],
  // `catalog` exposed `ProductId` upward; `shop` sends it back down to the
  // whole application. The root never becomes the owner.
  reExposes: [{ symbol: 'ProductId', from: 'catalog', exposeToDescendants: true }],
  children: [
    {
      id: 'catalog',
      owns: [
        { symbol: 'ProductId', exposeToParent: true },
        { symbol: 'SkuRules', exposeToDescendants: true },
      ],
      // `reserveStock` becomes available in `catalog` and stops there.
      children: [
        { id: 'search' },
        { id: 'inventory', owns: [{ symbol: 'reserveStock', exposeToParent: true }] },
      ],
    },
    {
      id: 'checkout',
      // `checkout` has both `PaymentApi` and `CartApi` available and treats
      // them differently. Receiving is not exposing: `CartApi` needs no
      // declaration at all - it is available by consequence and exposed
      // nowhere.
      reExposes: [{ symbol: 'PaymentApi', from: 'payment', exposeToDescendants: true }],
      children: [
        { id: 'cart', owns: [{ symbol: 'CartApi', exposeToParent: true }] },
        {
          id: 'payment',
          owns: [
            { symbol: 'PaymentApi', exposeToParent: true },
            // Owned, exposed through neither channel.
            { symbol: 'retryQueue' },
          ],
        },
      ],
    },
    // `shipping` owns nothing and exports nothing: a branch that only receives.
    { id: 'shipping' },
  ],
};

const shop = buildTree(shopDeclaration);

/** Rewrite one module of a declaration, leaving the rest of the tree intact. */
function mapModule(
  declaration: ModuleDeclaration,
  id: ModuleId,
  rewrite: (module: ModuleDeclaration) => ModuleDeclaration,
): ModuleDeclaration {
  if (declaration.id === id) {
    return rewrite(declaration);
  }
  return {
    ...declaration,
    children: (declaration.children ?? []).map((child) => mapModule(child, id, rewrite)),
  };
}

// --- The example universe -------------------------------------------------

describe('the declared universe (spec §1.2)', () => {
  it('declares exactly the eight symbols of the spec', () => {
    expect(allSymbols(shop)).toEqual([
      { owner: 'shop', name: 'Money' },
      { owner: 'shop', name: 'formatDate' },
      { owner: 'catalog', name: 'ProductId' },
      { owner: 'catalog', name: 'SkuRules' },
      { owner: 'inventory', name: 'reserveStock' },
      { owner: 'cart', name: 'CartApi' },
      { owner: 'payment', name: 'PaymentApi' },
      { owner: 'payment', name: 'retryQueue' },
    ]);
  });
});

describe('availability', () => {
  it('includes every symbol a module owns, exposed or not', () => {
    expect(isAvailable(shop, 'catalog', 'catalog', 'ProductId')).toBe(true);
    expect(isAvailable(shop, 'shop', 'shop', 'Money')).toBe(true);
    // Ownership alone makes a symbol available in its owner: `retryQueue` is
    // exposed nowhere, and every file belonging to `payment` may still use it.
    expect(isAvailable(shop, 'payment', 'payment', 'retryQueue')).toBe(true);
  });

  it('reaches a parent that a direct child exposed to', () => {
    expect(isAvailable(shop, 'catalog', 'inventory', 'reserveStock')).toBe(true);
    expect(isAvailable(shop, 'checkout', 'cart', 'CartApi')).toBe(true);
    expect(isAvailable(shop, 'checkout', 'payment', 'PaymentApi')).toBe(true);
    expect(isAvailable(shop, 'shop', 'catalog', 'ProductId')).toBe(true);
  });

  it('stops where a module chose to expose the symbol no further', () => {
    // `reserveStock` is available in `catalog`, which exposed it nowhere.
    expect(isAvailable(shop, 'shop', 'inventory', 'reserveStock')).toBe(false);
    // `CartApi` and `PaymentApi` are available in `checkout`, which exposed
    // neither to its own parent.
    expect(isAvailable(shop, 'shop', 'cart', 'CartApi')).toBe(false);
    expect(isAvailable(shop, 'shop', 'payment', 'PaymentApi')).toBe(false);
  });

  it('reaches a whole subtree when an ancestor exposes to descendants', () => {
    expect(isAvailable(shop, 'search', 'catalog', 'SkuRules')).toBe(true);
    expect(isAvailable(shop, 'search', 'catalog', 'ProductId')).toBe(true);
  });

  /**
   * The model in one assertion: a file may import a symbol iff that symbol is
   * available in the file's module, so the module-level and file-level
   * questions can never disagree.
   */
  it('answers the file-level question and the module-level one identically', () => {
    for (const consumer of shop.modules.keys()) {
      for (const ref of allSymbols(shop)) {
        expect(isAvailable(shop, consumer, ref.owner, ref.name)).toBe(
          mayImport(shop, consumer, ref.owner, ref.name),
        );
      }
    }
  });
});

// --- The full ceiling (all 64 cells) --------------------------------------

/** A cell of the spec's §1.3 table. */
type Cell = 'own' | '2' | '3' | '-';

const CLAUSE_OF: Record<Exclude<Cell, '-'>, ImportClause> = {
  own: 'same-module',
  '2': 'child-exposure',
  '3': 'ancestor-exposure',
};

/** The table's columns, in the spec's order. */
const COLUMNS: readonly SymbolRef[] = [
  { owner: 'shop', name: 'Money' },
  { owner: 'shop', name: 'formatDate' },
  { owner: 'catalog', name: 'ProductId' },
  { owner: 'catalog', name: 'SkuRules' },
  { owner: 'inventory', name: 'reserveStock' },
  { owner: 'payment', name: 'PaymentApi' },
  { owner: 'cart', name: 'CartApi' },
  { owner: 'payment', name: 'retryQueue' },
];

/**
 * The spec's §1.3 table verbatim - the acceptance fixture for this evaluator.
 * `own` = owned, `2` = a child exposed to parent, `3` = an ancestor exposed to
 * descendants, `-` = not available.
 */
const CEILING: ReadonlyArray<readonly [ModuleId, readonly Cell[]]> = [
  //             Money  fmtDate ProductId SkuRules reserveStock PaymentApi CartApi retryQueue
  ['shop', ['own', 'own', '2', '-', '-', '-', '-', '-']],
  ['catalog', ['3', '3', 'own', 'own', '2', '-', '-', '-']],
  ['checkout', ['3', '3', '3', '-', '-', '2', '2', '-']],
  ['shipping', ['3', '3', '3', '-', '-', '-', '-', '-']],
  ['search', ['3', '3', '3', '3', '-', '-', '-', '-']],
  ['inventory', ['3', '3', '3', '3', 'own', '-', '-', '-']],
  ['cart', ['3', '3', '3', '-', '-', '3', 'own', '-']],
  ['payment', ['3', '3', '3', '-', '-', 'own', '-', 'own']],
];

describe('the full ceiling (spec §1.3)', () => {
  it('covers every module and every symbol of the universe', () => {
    expect(CEILING).toHaveLength(shop.modules.size);
    expect(COLUMNS).toHaveLength(allSymbols(shop).length);
    expect(CEILING.flatMap(([, cells]) => cells)).toHaveLength(64);
  });

  for (const [consumer, cells] of CEILING) {
    describe(consumer, () => {
      cells.forEach((cell, index) => {
        const column = COLUMNS[index]!;
        const label = `${column.name} (owned by ${column.owner})`;

        if (cell === '-') {
          it(`may not import ${label}`, () => {
            expect(mayImport(shop, consumer, column.owner, column.name)).toBe(false);
          });
          return;
        }

        it(`may import ${label} by rule ${cell === 'own' ? '1' : cell}`, () => {
          const decision = explainImport(shop, consumer, column.owner, column.name);
          expect(decision.allowed).toBe(true);
          expect(decision.allowed && decision.clause).toBe(CLAUSE_OF[cell]);
        });
      });
    });
  }
});

// --- The denied examples (spec §1.4) --------------------------------------

describe('the denied examples (spec §1.4)', () => {
  it('D1: checkout may not import SkuRules - an exposure to descendants never leaves that subtree', () => {
    expect(explainImport(shop, 'checkout', 'catalog', 'SkuRules')).toEqual({
      allowed: false,
      reason: 'no-exposure-chain',
    });
  });

  it('D2: search may not import reserveStock - there is no sibling channel', () => {
    expect(explainImport(shop, 'search', 'inventory', 'reserveStock')).toEqual({
      allowed: false,
      reason: 'no-exposure-chain',
    });
  });

  it('D3: shipping may not import PaymentApi - it is outside checkout subtree', () => {
    expect(explainImport(shop, 'shipping', 'payment', 'PaymentApi')).toEqual({
      allowed: false,
      reason: 'no-exposure-chain',
    });
  });

  it('D4: payment may not import CartApi - available in checkout, exposed no further', () => {
    expect(explainImport(shop, 'payment', 'cart', 'CartApi')).toEqual({
      allowed: false,
      reason: 'no-exposure-chain',
    });
  });

  it('D5: checkout may not import retryQueue - there is no implicit public surface', () => {
    expect(explainImport(shop, 'checkout', 'payment', 'retryQueue')).toEqual({
      allowed: false,
      reason: 'never-exposed',
    });
  });

  it('undrawn: shop may not import SkuRules - the two channels are independent', () => {
    expect(explainImport(shop, 'shop', 'catalog', 'SkuRules')).toEqual({
      allowed: false,
      reason: 'no-exposure-chain',
    });
  });

  it('undrawn: shop may not import CartApi - available in checkout, exposed nowhere', () => {
    expect(explainImport(shop, 'shop', 'cart', 'CartApi')).toEqual({
      allowed: false,
      reason: 'no-exposure-chain',
    });
  });
});

// --- Structural properties ------------------------------------------------

describe('closed by default', () => {
  const withFreshSymbol = buildTree(
    mapModule(shopDeclaration, 'shipping', (shipping) => ({
      ...shipping,
      owns: [...(shipping.owns ?? []), { symbol: 'auditTrail' }],
    })),
  );

  it('a symbol its owner exposes nowhere is available only in that owner', () => {
    for (const consumer of withFreshSymbol.modules.keys()) {
      expect(mayImport(withFreshSymbol, consumer, 'shipping', 'auditTrail')).toBe(
        consumer === 'shipping',
      );
    }
  });

  it("adding a closed symbol changes nobody else's access", () => {
    // `shipping` gained a symbol; every other answer in the universe is
    // unchanged.
    for (const [consumer, cells] of CEILING) {
      cells.forEach((cell, index) => {
        const column = COLUMNS[index]!;
        expect(mayImport(withFreshSymbol, consumer, column.owner, column.name)).toBe(cell !== '-');
      });
    }
  });
});

describe('uniform exposure to descendants (backflow, spec §1.5)', () => {
  it('search may import ProductId although catalog exposed nothing to its own descendants', () => {
    // `catalog` exposed `ProductId` upward only. `search` reaches it because
    // `shop` sent it back down into every branch, this one included.
    const decision = explainImport(shop, 'search', 'catalog', 'ProductId');
    expect(decision).toEqual({ allowed: true, clause: 'ancestor-exposure', via: 'shop' });
  });

  it('an exposure to descendants reaches the branch the symbol came up through', () => {
    // `checkout` exposes `PaymentApi` to all its descendants, including `payment`,
    // which provided it. Harmless there (rule 1 already applies), visible at
    // `cart`.
    expect(explainImport(shop, 'cart', 'payment', 'PaymentApi')).toEqual({
      allowed: true,
      clause: 'ancestor-exposure',
      via: 'checkout',
    });
  });
});

describe('composition is not reciprocal', () => {
  it('checkout composes cart, and payment gains nothing by it', () => {
    expect(mayImport(shop, 'checkout', 'cart', 'CartApi')).toBe(true);
    expect(mayImport(shop, 'payment', 'cart', 'CartApi')).toBe(false);
  });

  it('a parent buys exactly what the child offered', () => {
    expect(mayImport(shop, 'catalog', 'inventory', 'reserveStock')).toBe(true);
    expect(mayImport(shop, 'search', 'inventory', 'reserveStock')).toBe(false);
    expect(mayImport(shop, 'shop', 'inventory', 'reserveStock')).toBe(false);
  });
});

describe('subdivision invariance', () => {
  // The spec's X4 what-if: `shipping` split into `rates` + `labels`.
  const splitShipping = buildTree(
    mapModule(shopDeclaration, 'shipping', (shipping) => ({
      ...shipping,
      children: [{ id: 'rates' }, { id: 'labels' }],
    })),
  );

  const shippingRow = CEILING.find(([id]) => id === 'shipping')![1];

  for (const consumer of ['rates', 'labels'] as const) {
    it(`${consumer} keeps exactly the imports shipping had`, () => {
      shippingRow.forEach((cell, index) => {
        const column = COLUMNS[index]!;
        expect(mayImport(splitShipping, consumer, column.owner, column.name)).toBe(cell !== '-');
      });
    });
  }

  it('splitting a consuming module does not change what the module itself may import', () => {
    shippingRow.forEach((cell, index) => {
      const column = COLUMNS[index]!;
      expect(mayImport(splitShipping, 'shipping', column.owner, column.name)).toBe(cell !== '-');
    });
  });

  // Splitting `search`, a consumer inside a branch where a sibling's
  // parent-only exposure is available at the shared parent.
  const splitSearch = buildTree(
    mapModule(shopDeclaration, 'search', (search) => ({
      ...search,
      children: [{ id: 'indexing' }, { id: 'ranking' }],
    })),
  );

  it('exposures to descendants reach the new submodules through rule 3', () => {
    for (const consumer of ['indexing', 'ranking'] as const) {
      expect(explainImport(splitSearch, consumer, 'catalog', 'SkuRules')).toEqual({
        allowed: true,
        clause: 'ancestor-exposure',
        via: 'catalog',
      });
      expect(explainImport(splitSearch, consumer, 'shop', 'Money')).toEqual({
        allowed: true,
        clause: 'ancestor-exposure',
        via: 'shop',
      });
      expect(explainImport(splitSearch, consumer, 'catalog', 'ProductId')).toEqual({
        allowed: true,
        clause: 'ancestor-exposure',
        via: 'shop',
      });
    }
  });

  it("a parent-only exposure does not leak into a sibling's new submodules", () => {
    // `inventory` exposed `reserveStock` to `catalog` only. `search`'s new
    // children are inside `catalog`'s subtree, and still may not import it.
    for (const consumer of ['search', 'indexing', 'ranking'] as const) {
      expect(mayImport(splitSearch, consumer, 'inventory', 'reserveStock')).toBe(false);
    }
    expect(mayImport(splitSearch, 'catalog', 'inventory', 'reserveStock')).toBe(true);
  });
});

describe('locality', () => {
  it('every allowed cross-module import is authorized by a parent, a child or an ancestor', () => {
    for (const [consumer] of CEILING) {
      for (const column of COLUMNS) {
        const decision = explainImport(shop, consumer, column.owner, column.name);
        if (!decision.allowed || decision.via === null) {
          continue;
        }
        const authorizer = shop.modules.get(decision.via)!;
        const isDirectChild = authorizer.parent === consumer;
        const isAncestor = ancestorIds(consumer).includes(decision.via);
        expect(isDirectChild || isAncestor).toBe(true);
      }
    }
  });

  function ancestorIds(id: ModuleId): ModuleId[] {
    const ids: ModuleId[] = [];
    let current = shop.modules.get(id)!.parent;
    while (current !== null) {
      ids.push(current);
      current = shop.modules.get(current)!.parent;
    }
    return ids;
  }
});

// --- Edge cases -----------------------------------------------------------

describe('an owner that does not export', () => {
  it('may still import its own symbol (rule 1 crosses no boundary)', () => {
    expect(explainImport(shop, 'payment', 'payment', 'retryQueue')).toEqual({
      allowed: true,
      clause: 'same-module',
      via: null,
    });
  });

  it('is unreachable from everywhere else, for the same reason everywhere', () => {
    for (const consumer of shop.modules.keys()) {
      if (consumer === 'payment') {
        continue;
      }
      expect(explainImport(shop, consumer, 'payment', 'retryQueue')).toEqual({
        allowed: false,
        reason: 'never-exposed',
      });
    }
  });

  it('is available in its owner, and in no other module', () => {
    for (const consumer of shop.modules.keys()) {
      expect(isAvailable(shop, consumer, 'payment', 'retryQueue')).toBe(consumer === 'payment');
    }
  });
});

describe('asking about a symbol at a module that does not own it', () => {
  it('is denied even though ProductId is available in shop - re-exposing is not ownership', () => {
    expect(mayImport(shop, 'search', 'catalog', 'ProductId')).toBe(true);
    expect(explainImport(shop, 'search', 'shop', 'ProductId')).toEqual({
      allowed: false,
      reason: 'symbol-not-owned',
    });
  });

  it('is denied for an undeclared symbol, including at the named owner itself', () => {
    expect(explainImport(shop, 'catalog', 'catalog', 'noSuchSymbol')).toEqual({
      allowed: false,
      reason: 'symbol-not-owned',
    });
  });

  it('throws for an unknown module id - a typo is an error, not a denial', () => {
    expect(() => mayImport(shop, 'warehouse', 'shop', 'Money')).toThrow(/Unknown module/);
    expect(() => mayImport(shop, 'shop', 'warehouse', 'Money')).toThrow(/Unknown module/);
  });
});

describe('the root has no special rule in either direction', () => {
  // The root has no parent, so exposing to a parent at the root is
  // representable and inert: nothing anywhere can consume it.
  const rootExposesUpward = buildTree(
    mapModule(shopDeclaration, 'shop', (root) => ({
      ...root,
      owns: [
        { symbol: 'Money', exposeToParent: true, exposeToDescendants: true },
        { symbol: 'formatDate', exposeToDescendants: true },
      ],
      reExposes: [
        { symbol: 'ProductId', from: 'catalog', exposeToParent: true, exposeToDescendants: true },
      ],
    })),
  );

  it('expose-to-parent at the root makes nothing available to anybody', () => {
    for (const [consumer, cells] of CEILING) {
      cells.forEach((cell, index) => {
        const column = COLUMNS[index]!;
        const decision = explainImport(rootExposesUpward, consumer, column.owner, column.name);
        expect(decision.allowed).toBe(cell !== '-');
        if (decision.allowed && cell !== '-') {
          expect(decision.clause).toBe(CLAUSE_OF[cell]);
        }
      });
    }
  });

  it('the root reaches its own subtree by the ordinary rule 3, not by privilege', () => {
    expect(explainImport(shop, 'shipping', 'shop', 'Money')).toEqual({
      allowed: true,
      clause: 'ancestor-exposure',
      via: 'shop',
    });
  });
});

describe('an inert declaration', () => {
  it('re-exposing a symbol the module never received exposes nothing', () => {
    // `catalog` claims to pass `reserveStock` down, but `search` never exposed
    // anything to it, so the declaration names a provider that provides
    // nothing.
    const bogus = buildTree(
      mapModule(shopDeclaration, 'catalog', (catalog) => ({
        ...catalog,
        reExposes: [{ symbol: 'reserveStock', from: 'search', exposeToDescendants: true }],
      })),
    );
    expect(mayImport(bogus, 'search', 'inventory', 'reserveStock')).toBe(false);
  });

  it('re-exposing from the child that really provided it does expose', () => {
    const reExposed = buildTree(
      mapModule(shopDeclaration, 'catalog', (catalog) => ({
        ...catalog,
        reExposes: [{ symbol: 'reserveStock', from: 'inventory', exposeToDescendants: true }],
      })),
    );
    expect(explainImport(reExposed, 'search', 'inventory', 'reserveStock')).toEqual({
      allowed: true,
      clause: 'ancestor-exposure',
      via: 'catalog',
    });
  });
});

describe('symbol names are not globally unique', () => {
  // Two unrelated modules own a symbol called `Money`; the answers are
  // independent.
  const twoMonies = buildTree(
    mapModule(shopDeclaration, 'payment', (payment) => ({
      ...payment,
      owns: [...(payment.owns ?? []), { symbol: 'Money' }],
    })),
  );

  it('resolves each name against its declared owner', () => {
    expect(mayImport(twoMonies, 'cart', 'shop', 'Money')).toBe(true);
    expect(mayImport(twoMonies, 'cart', 'payment', 'Money')).toBe(false);
    expect(mayImport(twoMonies, 'payment', 'payment', 'Money')).toBe(true);
  });
});
