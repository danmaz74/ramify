import { describe, expect, it } from 'vitest';

import {
  explainVisibility,
  explainAvailability,
  explainImport,
  isVisible,
  isAvailable,
  mayImport,
  type Importer,
  type ImporterDescriptor,
} from './availability.js';
import type { ImportBinding } from './tags.js';
import {
  allSymbols,
  buildTree,
  moduleTagsOf,
  symbolTagsOf,
  type ModuleDeclaration,
  type ModuleTree,
} from './tree.js';

/**
 * Exercises the tag evaluator with the example universes of
 * `../viz/diagrams/example3.ts` and `example4.ts`. The authoritative tag rules
 * are in `docs/model/cross-module-importability.principles.md`
 * §"Tags Restrict Availability Without Changing Visibility".
 *
 * Examples 3 and 4 keep the tree trivial on purpose: everything is exposed
 * everywhere, so visibility is identical in every column and the tag is the
 * only variable.
 */

/** Each file in this declared module has the same import permissions. */
const integrationTests: Importer = { module: 'integration-tests' };

/** Every module and both import forms. */
function allImporters(tree: ModuleTree): ImporterDescriptor[] {
  return [...tree.modules.values()].flatMap((record) =>
    (['value', 'type'] satisfies ImportBinding[]).map((binding) => ({ module: record.id, binding })),
  );
}

// --- Example 3: the tag is the entire difference (testing) ----------------

/**
 * ```text
 * app                      exposes everything it receives to its descendants
 * ├── orders               owns OrderService, resetOrderStore testing
 * │                        (both exposed to parent)
 * ├── billing              production consumer
 * └── integration-tests  testing module below app
 * ```
 */
const example3Declaration: ModuleDeclaration = {
  id: 'app',
  reExposes: [
    { symbol: 'OrderService', from: 'orders', exposeToDescendants: true },
    { symbol: 'resetOrderStore', from: 'orders', exposeToDescendants: true },
  ],
  children: [
    { id: 'integration-tests', moduleTags: ['testing'] },
    {
      id: 'orders',
      owns: [
        { symbol: 'OrderService', exposeToParent: true },
        { symbol: 'resetOrderStore', exposeToParent: true, tags: ['testing'] },
      ],
    },
    { id: 'billing' },
  ],
};

const example3 = buildTree(example3Declaration);

describe('Example 3: the tag is the entire difference (testing)', () => {
  it('billing may import OrderService - the ordinary contract', () => {
    expect(explainImport(example3, 'billing', 'orders', 'OrderService')).toEqual({
      allowed: true,
      clause: 'ancestor-exposure',
      via: 'app',
    });
  });

  it('billing may not import resetOrderStore - the tag requires a testing module', () => {
    expect(explainImport(example3, 'billing', 'orders', 'resetOrderStore')).toEqual({
      allowed: false,
      reason: 'symbol-tag-requires-module-tag',
      unmet: { tag: 'testing', requires: 'testing' },
    });
  });

  it("the integration-tests module may import OrderService", () => {
    expect(explainImport(example3, integrationTests, 'orders', 'OrderService')).toEqual({
      allowed: true,
      clause: 'ancestor-exposure',
      via: 'app',
    });
  });

  it("the integration-tests module may import resetOrderStore", () => {
    expect(explainImport(example3, integrationTests, 'orders', 'resetOrderStore')).toEqual({
      allowed: true,
      clause: 'ancestor-exposure',
      via: 'app',
      tags: ['testing'],
    });
  });

  it('the production parent remains unable to import test support', () => {
    // Declaring a testing child does not classify the production parent.
    expect(mayImport(example3, 'app', 'orders', 'OrderService')).toBe(true);
    expect(mayImport(example3, 'app', 'orders', 'resetOrderStore')).toBe(false);
  });

  it('applies to type imports too - a testing requirement exempts no binding', () => {
    expect(
      explainImport(example3, { module: 'billing', binding: 'type' }, 'orders', 'resetOrderStore'),
    ).toEqual({
      allowed: false,
      reason: 'symbol-tag-requires-module-tag',
      unmet: { tag: 'testing', requires: 'testing' },
    });
  });

  it('makes both symbols visible identically - only the tag differs', () => {
    for (const symbol of ['OrderService', 'resetOrderStore']) {
      expect(explainVisibility(example3, 'billing', 'orders', symbol)).toEqual({
        allowed: true,
        clause: 'ancestor-exposure',
        via: 'app',
      });
    }
  });
});

// --- Example 4: a promise about the closure (browser) ---------------------

/**
 * ```text
 * app                      exposes everything it receives to its descendants
 * ├── shared               owns formatMoney browser, queryDb
 * │                        (both exposed to parent)
 * ├── ui                   browser module
 * └── server               plain module
 * ```
 */
const example4Declaration: ModuleDeclaration = {
  id: 'app',
  reExposes: [
    { symbol: 'formatMoney', from: 'shared', exposeToDescendants: true },
    { symbol: 'queryDb', from: 'shared', exposeToDescendants: true },
  ],
  children: [
    {
      id: 'shared',
      owns: [
        { symbol: 'formatMoney', exposeToParent: true, tags: ['browser'] },
        { symbol: 'queryDb', exposeToParent: true },
      ],
    },
    { id: 'ui', moduleTags: ['browser'] },
    { id: 'server' },
  ],
};

const example4 = buildTree(example4Declaration);
const uiValue: Importer = { module: 'ui', binding: 'value' };
const uiType: Importer = { module: 'ui', binding: 'type' };

describe('Example 4: a promise about the closure (browser)', () => {
  it('server may import both - it carries no module tag to satisfy', () => {
    expect(explainImport(example4, 'server', 'shared', 'formatMoney')).toEqual({
      allowed: true,
      clause: 'ancestor-exposure',
      via: 'app',
      tags: ['browser'],
    });
    expect(explainImport(example4, 'server', 'shared', 'queryDb')).toEqual({
      allowed: true,
      clause: 'ancestor-exposure',
      via: 'app',
    });
  });

  it('ui may value-import formatMoney - the symbol carries the promise', () => {
    expect(explainImport(example4, uiValue, 'shared', 'formatMoney')).toEqual({
      allowed: true,
      clause: 'ancestor-exposure',
      via: 'app',
      tags: ['browser'],
    });
  });

  it('ui may not value-import queryDb - a browser module requires the tag', () => {
    expect(explainImport(example4, uiValue, 'shared', 'queryDb')).toEqual({
      allowed: false,
      reason: 'module-tag-requires-symbol-tag',
      unmet: { tag: 'browser', requires: 'browser' },
    });
  });

  it('ui may type-import queryDb - erased at runtime', () => {
    expect(explainImport(example4, uiType, 'shared', 'queryDb')).toEqual({
      allowed: true,
      clause: 'ancestor-exposure',
      via: 'app',
    });
    expect(explainImport(example4, uiType, 'shared', 'formatMoney')).toEqual({
      allowed: true,
      clause: 'ancestor-exposure',
      via: 'app',
      tags: ['browser'],
    });
  });

  it('reads a bare module id as a value import - the exemption is claimed, not assumed', () => {
    expect(mayImport(example4, 'ui', 'shared', 'queryDb')).toBe(false);
  });

  it('draws the browser line per symbol, not per module', () => {
    // `shared` never splits: one module, one file tree, two answers.
    expect(mayImport(example4, uiValue, 'shared', 'formatMoney')).toBe(true);
    expect(mayImport(example4, uiValue, 'shared', 'queryDb')).toBe(false);
  });
});

// --- Tags never expose -----------------------------------------------------

/**
 * A `testing` symbol passed two hops up and then exposed application-wide,
 * beside two the tree stops earlier - a tree refusal and a tag refusal on the
 * same symbols.
 *
 * ```text
 * app                       exposes resetOrderStore to its descendants
 * ├── sales                 receives all three, passes only resetOrderStore up
 * │   └── orders            owns all three testing
 * ├── billing               declares unit-tests
 * └── shipping
 * ```
 */
const reExposedDeclaration: ModuleDeclaration = {
  id: 'app',
  reExposes: [{ symbol: 'resetOrderStore', from: 'sales', exposeToDescendants: true }],
  children: [
    { id: 'integration-tests', moduleTags: ['testing'] },
    {
      id: 'sales',
      reExposes: [
        { symbol: 'resetOrderStore', from: 'orders', exposeToParent: true },
        { symbol: 'orderFixtures', from: 'orders', exposeToDescendants: true },
      ],
      children: [
        { id: 'sales-tests', moduleTags: ['testing'] },
        {
          id: 'orders',
          owns: [
            { symbol: 'resetOrderStore', exposeToParent: true, tags: ['testing'] },
            // Received by `sales`, passed no further.
            { symbol: 'orderFixtures', exposeToParent: true, tags: ['testing'] },
            // Exposed through neither channel.
            { symbol: 'orderStoreInternals', tags: ['testing'] },
          ],
        },
      ],
    },
    { id: 'billing', children: [{ id: 'unit-tests', moduleTags: ['testing'] }] },
    { id: 'shipping' },
  ],
};

const reExposed = buildTree(reExposedDeclaration);
const salesTests: Importer = { module: 'sales-tests' };
const unitTests: Importer = { module: 'unit-tests' };

describe('tags never expose', () => {
  it('gives a testing module nothing the tree did not re-expose to it', () => {
    // The chain stopped at `sales`; being a testing module adds nothing.
    expect(explainImport(reExposed, integrationTests, 'orders', 'orderFixtures')).toEqual({
      allowed: false,
      reason: 'no-exposure-chain',
    });
    expect(explainImport(reExposed, unitTests, 'orders', 'orderFixtures')).toEqual({
      allowed: false,
      reason: 'no-exposure-chain',
    });
  });

  it('keeps a symbol its owner exposes nowhere unreachable, testing module or not', () => {
    for (const importer of [integrationTests, salesTests, unitTests, 'sales'] as const) {
      expect(explainImport(reExposed, importer, 'orders', 'orderStoreInternals')).toEqual({
        allowed: false,
        reason: 'never-exposed',
      });
    }
  });

  it('reports a tree refusal for the tree reason, never a tag reason', () => {
    // One symbol, two refusals: `sales`'s production files are refused by the
    // tag, `app`'s testing module by the missing exposure chain.
    expect(explainImport(reExposed, 'sales', 'orders', 'orderFixtures')).toEqual({
      allowed: false,
      reason: 'symbol-tag-requires-module-tag',
      unmet: { tag: 'testing', requires: 'testing' },
    });
    expect(explainImport(reExposed, salesTests, 'orders', 'orderFixtures')).toEqual({
      allowed: true,
      clause: 'ancestor-exposure',
      via: 'sales',
      tags: ['testing'],
    });
  });

  it('lets no importer of any universe import what is not available in its module', () => {
    for (const tree of [example3, example4, reExposed]) {
      for (const importer of allImporters(tree)) {
        for (const symbol of allSymbols(tree)) {
          if (mayImport(tree, importer, symbol.owner, symbol.name)) {
            expect(isVisible(tree, importer.module, symbol.owner, symbol.name)).toBe(true);
          }
        }
      }
    }
  });
});

// --- A tag travels with its symbol ----------------------------------------

describe('a tag travels with its symbol', () => {
  it('survives every re-exposure - a re-exposing module can neither strip nor change it', () => {
    // `resetOrderStore` was re-exposed twice on its way to `shipping` - by
    // `sales` to its parent, by `app` to its descendants - and arrives still
    // tagged.
    expect(explainImport(reExposed, 'shipping', 'orders', 'resetOrderStore')).toEqual({
      allowed: false,
      reason: 'symbol-tag-requires-module-tag',
      unmet: { tag: 'testing', requires: 'testing' },
    });
  });

  it('is safe at any exposure breadth', () => {
    // `app` exposed the test support it received to all its descendants. Every
    // production importer in it is refused, and every testing module allowed.
    for (const module of reExposed.modules.keys()) {
      if (module === 'orders' || moduleTagsOf(reExposed, module).includes('testing')) {
        continue; // Its owner: same-module imports cross no boundary.
      }
      expect(mayImport(reExposed, module, 'orders', 'resetOrderStore')).toBe(false);
    }
    for (const importer of [integrationTests, salesTests, unitTests]) {
      expect(mayImport(reExposed, importer, 'orders', 'resetOrderStore')).toBe(true);
    }
  });

  it('answers at the owner, not at whoever re-exposed it', () => {
    expect(symbolTagsOf(reExposed, 'orders', 'resetOrderStore')).toEqual(['testing']);
    // `sales` and `app` both pass the symbol on, and own nothing by that name.
    expect(symbolTagsOf(reExposed, 'sales', 'resetOrderStore')).toEqual([]);
    expect(symbolTagsOf(reExposed, 'app', 'resetOrderStore')).toEqual([]);
  });
});

// --- A declared test module ------------------------------------------------

/**
 * ```text
 * app                          exposes what it receives to its descendants
 * ├── testSupport test       a declared test module: owns fakeClock
 * │   └── testSupportInternals owns stubTimer, exposed to parent
 * ├── orders                   owns resetOrderStore testing
 * └── billing                  production consumer
 * ```
 */
const testModuleDeclaration: ModuleDeclaration = {
  id: 'app',
  reExposes: [
    { symbol: 'fakeClock', from: 'testSupport', exposeToDescendants: true },
    { symbol: 'stubTimer', from: 'testSupport', exposeToDescendants: true },
    { symbol: 'resetOrderStore', from: 'orders', exposeToDescendants: true },
  ],
  children: [
    { id: 'integration-tests', moduleTags: ['testing'] },
    {
      id: 'testSupport',
      moduleTags: ['testing'],
      owns: [{ symbol: 'fakeClock', exposeToParent: true }],
      reExposes: [{ symbol: 'stubTimer', from: 'testSupportInternals', exposeToParent: true }],
      children: [
        { id: 'testSupportInternals', moduleTags: ['testing'], owns: [{ symbol: 'stubTimer', exposeToParent: true }] },
      ],
    },
    {
      id: 'orders',
      owns: [{ symbol: 'resetOrderStore', exposeToParent: true, tags: ['testing'] }],
    },
    { id: 'billing' },
  ],
};

const withTestModule = buildTree(testModuleDeclaration);

describe('a declared test module', () => {
  it('requires testing on its owned symbols without per-symbol declarations', () => {
    expect(symbolTagsOf(withTestModule, 'testSupport', 'fakeClock')).toEqual(['testing']);
  });

  it('tags a child’s symbols when that child explicitly declares testing', () => {
    expect(symbolTagsOf(withTestModule, 'testSupportInternals', 'stubTimer')).toEqual([
      'testing',
    ]);
  });

  it('cannot enter a production ceiling, however widely it is exposed', () => {
    for (const symbol of [
      { owner: 'testSupport', name: 'fakeClock' },
      { owner: 'testSupportInternals', name: 'stubTimer' },
    ]) {
      expect(explainImport(withTestModule, 'billing', symbol.owner, symbol.name)).toEqual({
        allowed: false,
        reason: 'symbol-tag-requires-module-tag',
        unmet: { tag: 'testing', requires: 'testing' },
      });
      expect(mayImport(withTestModule, integrationTests, symbol.owner, symbol.name)).toBe(true);
    }
  });

  it('allows test support in both explicitly tagged testing modules', () => {
    expect(mayImport(withTestModule, 'testSupport', 'orders', 'resetOrderStore')).toBe(true);
    expect(mayImport(withTestModule, 'testSupportInternals', 'orders', 'resetOrderStore')).toBe(
      true,
    );
    expect(mayImport(withTestModule, 'billing', 'orders', 'resetOrderStore')).toBe(false);
  });

  it('changes availability without changing visibility', () => {
    expect(isVisible(withTestModule, 'billing', 'testSupport', 'fakeClock')).toBe(true);
    expect(mayImport(withTestModule, 'billing', 'testSupport', 'fakeClock')).toBe(false);
  });
});

// --- Exclusivity -----------------------------------------------------------

describe('exclusivity', () => {
  it('refuses a declaration that drops the tag a test module implies', () => {
    expect(() =>
      buildTree({
        id: 'app',
        children: [
          {
            id: 'testSupport',
            moduleTags: ['testing'],
            owns: [{ symbol: 'renderFixture', exposeToParent: true, tags: ['browser'] }],
          },
        ],
      }),
    ).toThrow(/"testing", which is exclusive/);
  });

  it('refuses an explicitly empty tag list, which is the default channel', () => {
    expect(() =>
      buildTree({
        id: 'app',
        children: [
          {
            id: 'testSupport',
            moduleTags: ['testing'],
            owns: [{ symbol: 'fakeClock', exposeToParent: true, tags: [] }],
          },
        ],
      }),
    ).toThrow(/which is exclusive/);
  });

  it('accepts more tags alongside it - exclusivity is about the default channel', () => {
    const tree = buildTree({
      id: 'app',
      children: [
        {
          id: 'testSupport',
          moduleTags: ['testing'],
          owns: [
            { symbol: 'fakeClock', exposeToParent: true, tags: ['testing'] },
            { symbol: 'renderFixture', exposeToParent: true, tags: ['testing', 'browser'] },
          ],
        },
      ],
    });
    expect(symbolTagsOf(tree, 'testSupport', 'fakeClock')).toEqual(['testing']);
    expect(symbolTagsOf(tree, 'testSupport', 'renderFixture')).toEqual([
      'testing',
      'browser',
    ]);
  });

  it('leaves a classification that implies nothing alone', () => {
    // A browser module defaults no exposure tag, so a browser module tags its
    // own exposures freely.
    const tree = buildTree({
      id: 'app',
      children: [
        {
          id: 'ui',
          moduleTags: ['browser'],
          owns: [{ symbol: 'resetWidgetStore', exposeToParent: true, tags: ['testing'] }],
        },
      ],
    });
    expect(symbolTagsOf(tree, 'ui', 'resetWidgetStore')).toEqual(['testing']);
  });

  it('is structural everywhere else: one symbol, one exposure, one tag list', () => {
    // A re-exposure declaration has nowhere to put a tag, so a symbol can never
    // be default contract along one chain of exposures and test support along
    // another.
    expect(symbolTagsOf(reExposed, 'orders', 'resetOrderStore')).toEqual(['testing']);
    expect(mayImport(reExposed, 'shipping', 'orders', 'resetOrderStore')).toBe(false);
    expect(mayImport(reExposed, 'sales', 'orders', 'resetOrderStore')).toBe(false);
  });
});

// --- Visibility is the tag-free ceiling ---------------------------------

describe('availability and importability', () => {
  it('leaves visibility untouched and gates the import', () => {
    expect(isVisible(example3, 'billing', 'orders', 'resetOrderStore')).toBe(true);
    expect(mayImport(example3, 'billing', 'orders', 'resetOrderStore')).toBe(false);
    expect(mayImport(example3, integrationTests, 'orders', 'resetOrderStore')).toBe(true);
  });

  it('answers the module-level question without an import binding', () => {
    expect(explainVisibility(example4, 'ui', 'shared', 'queryDb')).toEqual({
      allowed: true,
      clause: 'ancestor-exposure',
      via: 'app',
    });
    expect(mayImport(example4, uiValue, 'shared', 'queryDb')).toBe(false);
    expect(mayImport(example4, uiType, 'shared', 'queryDb')).toBe(true);
  });

  it('reports a tree refusal identically for both questions', () => {
    expect(explainVisibility(reExposed, 'billing', 'orders', 'orderFixtures')).toEqual(
      explainImport(reExposed, unitTests, 'orders', 'orderFixtures'),
    );
  });
});

// --- The importer descriptor ----------------------------------------------

describe('the importer descriptor', () => {
  it('reads a bare module id as a value import from the module’s own files', () => {
    for (const tree of [example3, example4, reExposed]) {
      for (const record of tree.modules.values()) {
        for (const symbol of allSymbols(tree)) {
          const bare = mayImport(tree, record.id, symbol.owner, symbol.name);
          expect(mayImport(tree, { module: record.id }, symbol.owner, symbol.name)).toBe(bare);
          expect(
            mayImport(tree, { module: record.id, binding: 'value' }, symbol.owner, symbol.name),
          ).toBe(bare);
        }
      }
    }
  });

  it('throws for an unknown module id, descriptor or not', () => {
    expect(() => mayImport(example3, { module: 'warehouse' }, 'orders', 'OrderService')).toThrow(
      /Unknown module/,
    );
  });

  it('leaves same-owner imports outside the model', () => {
    // `ui` is a browser module and owns a symbol it never tagged. Whether its
    // own files keep the platform split internally is its own business.
    const tree = buildTree({
      id: 'app',
      children: [
        {
          id: 'ui',
          moduleTags: ['browser'],
          owns: [{ symbol: 'renderApp' }],
        },
      ],
    });
    expect(explainImport(tree, { module: 'ui', binding: 'value' }, 'ui', 'renderApp')).toEqual({
      allowed: true,
      clause: 'same-module',
      via: null,
    });
  });
});

describe('modules classify only their own files', () => {
  const tree = buildTree({
    id: 'app',
    reExposes: [{ symbol: 'queryDb', from: 'server', exposeToDescendants: true }],
    children: [
      { id: 'server', owns: [{ symbol: 'queryDb', exposeToParent: true }] },
      {
        id: 'ui', moduleTags: ['browser'],
        children: [
          { id: 'renderer' },
          { id: 'widgets', moduleTags: ['browser'] },
        ],
      },
      {
        id: 'tests', moduleTags: ['testing'],
        owns: [{ symbol: 'fakeClock', exposeToParent: true }],
        reExposes: [{ symbol: 'formatDate', from: 'formatting', exposeToParent: true }],
        children: [
          { id: 'formatting', owns: [{ symbol: 'formatDate', exposeToParent: true, tags: [] }] },
        ],
      },
    ],
  });

  it('requires each browser module to declare its own restriction', () => {
    expect(mayImport(tree, 'ui', 'server', 'queryDb')).toBe(false);
    expect(mayImport(tree, 'widgets', 'server', 'queryDb')).toBe(false);
    expect(mayImport(tree, 'renderer', 'server', 'queryDb')).toBe(true);
  });

  it('keeps a child-owned production contract distinct from test-owned support', () => {
    expect(symbolTagsOf(tree, 'tests', 'fakeClock')).toEqual(['testing']);
    expect(symbolTagsOf(tree, 'formatting', 'formatDate')).toEqual([]);
    expect(mayImport(tree, 'app', 'tests', 'fakeClock')).toBe(false);
    expect(mayImport(tree, 'app', 'formatting', 'formatDate')).toBe(true);
  });
});

describe('availability includes module tag restrictions', () => {
  it('distinguishes exposed test support from permission to import it', () => {
    expect(isVisible(example3, 'billing', 'orders', 'resetOrderStore')).toBe(true);
    expect(isAvailable(example3, 'billing', 'orders', 'resetOrderStore')).toBe(false);
    expect(explainAvailability(example3, 'billing', 'orders', 'resetOrderStore')).toEqual({
      allowed: false,
      reason: 'symbol-tag-requires-module-tag',
      unmet: { tag: 'testing', requires: 'testing' },
    });
    expect(isAvailable(example3, 'integration-tests', 'orders', 'resetOrderStore')).toBe(true);
  });

  it('keeps a browser type import distinct from value availability', () => {
    expect(isVisible(example4, 'ui', 'shared', 'queryDb')).toBe(true);
    expect(isAvailable(example4, 'ui', 'shared', 'queryDb')).toBe(false);
    expect(mayImport(example4, uiType, 'shared', 'queryDb')).toBe(true);
  });

  it('combines testing and browser only when the importing module declares both', () => {
    const tree = buildTree({
      id: 'app',
      reExposes: [
        { symbol: 'fakeStore', from: 'support', exposeToDescendants: true },
        { symbol: 'browserFake', from: 'support', exposeToDescendants: true },
      ],
      children: [
        {
          id: 'support', moduleTags: ['testing'],
          owns: [
            { symbol: 'fakeStore', exposeToParent: true },
            { symbol: 'browserFake', exposeToParent: true, tags: ['testing', 'browser'] },
          ],
        },
        { id: 'ui-tests', moduleTags: ['testing', 'browser'] },
        { id: 'ui', moduleTags: ['browser'] },
      ],
    });
    expect(isAvailable(tree, 'ui-tests', 'support', 'fakeStore')).toBe(false);
    expect(mayImport(tree, { module: 'ui-tests', binding: 'type' }, 'support', 'fakeStore')).toBe(true);
    expect(isAvailable(tree, 'ui-tests', 'support', 'browserFake')).toBe(true);
    expect(mayImport(tree, { module: 'ui', binding: 'type' }, 'support', 'browserFake')).toBe(false);
  });
});
