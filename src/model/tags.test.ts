import { describe, expect, it } from 'vitest';

import {
  explainAvailability,
  explainImport,
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
 * The contextual rules of `docs/model/cross-module-importability-rules.md`
 * §"Contextual rules: importer contexts and exposure tags", as the example
 * universes of `docs/model/illustrative-examples.md` state them.
 *
 * Examples 3 and 4 keep the tree trivial on purpose: everything is granted
 * everywhere, so availability is identical in every column and the tag is the
 * only variable.
 */

/** The test context `app` declares in several universes below. */
const integrationTests: Importer = { module: 'app', context: 'integration-tests' };

/** Every importer a tree can describe: each module, each declared context, each binding. */
function allImporters(tree: ModuleTree): ImporterDescriptor[] {
  const importers: ImporterDescriptor[] = [];
  for (const record of tree.modules.values()) {
    const contexts = [undefined, ...(record.contexts ?? []).map((context) => context.name)];
    for (const context of contexts) {
      for (const binding of ['value', 'type'] satisfies ImportBinding[]) {
        importers.push({ module: record.id, context, binding });
      }
    }
  }
  return importers;
}

// --- Example 3: the tag is the entire difference (testing) ----------------

/**
 * ```text
 * app                      grants everything it receives to its subtree
 * ├── orders               owns OrderService, resetOrderStore testing
 * │                        (both exposed to parent)
 * ├── billing              production consumer
 * └── integration-tests  test context declared by app
 * ```
 */
const example3Declaration: ModuleDeclaration = {
  id: 'app',
  contexts: [{ name: 'integration-tests', tags: ['testing'] }],
  reExposes: [
    { symbol: 'OrderService', from: 'orders', exposeToDescendants: true },
    { symbol: 'resetOrderStore', from: 'orders', exposeToDescendants: true },
  ],
  children: [
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
  it('billing may import OrderService — the ordinary contract', () => {
    expect(explainImport(example3, 'billing', 'orders', 'OrderService')).toEqual({
      allowed: true,
      clause: 'ancestor-grant',
      via: 'app',
    });
  });

  it('billing may not import resetOrderStore — the tag requires a test context', () => {
    expect(explainImport(example3, 'billing', 'orders', 'resetOrderStore')).toEqual({
      allowed: false,
      reason: 'symbol-tag-requires-module-tag',
      unmet: { tag: 'testing', requires: 'testing' },
    });
  });

  it("app's test context may import OrderService", () => {
    expect(explainImport(example3, integrationTests, 'orders', 'OrderService')).toEqual({
      allowed: true,
      clause: 'child-exposure',
      via: 'orders',
    });
  });

  it("app's test context may import resetOrderStore", () => {
    expect(explainImport(example3, integrationTests, 'orders', 'resetOrderStore')).toEqual({
      allowed: true,
      clause: 'child-exposure',
      via: 'orders',
      tags: ['testing'],
    });
  });

  it('the declaring module outside that context may not — the context is the difference', () => {
    // `app` declares the test context and still may not import test support
    // into its production files: a context classifies files, not the module
    // that declared it.
    expect(mayImport(example3, 'app', 'orders', 'OrderService')).toBe(true);
    expect(mayImport(example3, 'app', 'orders', 'resetOrderStore')).toBe(false);
  });

  it('applies to type imports too — a testing requirement exempts no binding', () => {
    expect(
      explainImport(example3, { module: 'billing', binding: 'type' }, 'orders', 'resetOrderStore'),
    ).toEqual({
      allowed: false,
      reason: 'symbol-tag-requires-module-tag',
      unmet: { tag: 'testing', requires: 'testing' },
    });
  });

  it('routes both symbols identically — only the tag differs', () => {
    for (const symbol of ['OrderService', 'resetOrderStore']) {
      expect(explainAvailability(example3, 'billing', 'orders', symbol)).toEqual({
        allowed: true,
        clause: 'ancestor-grant',
        via: 'app',
      });
    }
  });
});

// --- Example 4: a promise about the closure (browser) ---------------------

/**
 * ```text
 * app                      grants everything it receives to its subtree
 * ├── shared               owns formatMoney browser, queryDb
 * │                        (both exposed to parent)
 * ├── ui                   browser context
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
  it('server may import both — it carries no context tag to satisfy', () => {
    expect(explainImport(example4, 'server', 'shared', 'formatMoney')).toEqual({
      allowed: true,
      clause: 'ancestor-grant',
      via: 'app',
      tags: ['browser'],
    });
    expect(explainImport(example4, 'server', 'shared', 'queryDb')).toEqual({
      allowed: true,
      clause: 'ancestor-grant',
      via: 'app',
    });
  });

  it('ui may value-import formatMoney — the symbol carries the promise', () => {
    expect(explainImport(example4, uiValue, 'shared', 'formatMoney')).toEqual({
      allowed: true,
      clause: 'ancestor-grant',
      via: 'app',
      tags: ['browser'],
    });
  });

  it('ui may not value-import queryDb — a browser context requires the tag', () => {
    expect(explainImport(example4, uiValue, 'shared', 'queryDb')).toEqual({
      allowed: false,
      reason: 'module-tag-requires-symbol-tag',
      unmet: { tag: 'browser', requires: 'browser' },
    });
  });

  it('ui may type-import queryDb — erased at runtime', () => {
    expect(explainImport(example4, uiType, 'shared', 'queryDb')).toEqual({
      allowed: true,
      clause: 'ancestor-grant',
      via: 'app',
    });
    expect(explainImport(example4, uiType, 'shared', 'formatMoney')).toEqual({
      allowed: true,
      clause: 'ancestor-grant',
      via: 'app',
      tags: ['browser'],
    });
  });

  it('reads a bare module id as a value import — the exemption is claimed, not assumed', () => {
    expect(mayImport(example4, 'ui', 'shared', 'queryDb')).toBe(false);
  });

  it('draws the browser line per symbol, not per module', () => {
    // `shared` never splits: one module, one file tree, two answers.
    expect(mayImport(example4, uiValue, 'shared', 'formatMoney')).toBe(true);
    expect(mayImport(example4, uiValue, 'shared', 'queryDb')).toBe(false);
  });
});

// --- Tags never grant ------------------------------------------------------

/**
 * A `testing` symbol routed two hops up and granted application-wide,
 * beside two the tree stops earlier — a tree refusal and a tag refusal on the
 * same symbols.
 *
 * ```text
 * app                       grants resetOrderStore to its subtree
 * ├── sales                 receives all three, passes only resetOrderStore up
 * │   └── orders            owns all three testing
 * ├── billing               declares unit-tests
 * └── shipping
 * ```
 */
const routedDeclaration: ModuleDeclaration = {
  id: 'app',
  contexts: [{ name: 'integration-tests', tags: ['testing'] }],
  reExposes: [{ symbol: 'resetOrderStore', from: 'sales', exposeToDescendants: true }],
  children: [
    {
      id: 'sales',
      contexts: [{ name: 'sales-tests', tags: ['testing'] }],
      reExposes: [{ symbol: 'resetOrderStore', from: 'orders', exposeToParent: true }],
      children: [
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
    { id: 'billing', contexts: [{ name: 'unit-tests', tags: ['testing'] }] },
    { id: 'shipping' },
  ],
};

const routed = buildTree(routedDeclaration);
const salesTests: Importer = { module: 'sales', context: 'sales-tests' };
const unitTests: Importer = { module: 'billing', context: 'unit-tests' };

describe('tags never grant', () => {
  it('gives a test context nothing the tree did not route to it', () => {
    // The chain stopped at `sales`; being a test context adds nothing.
    expect(explainImport(routed, integrationTests, 'orders', 'orderFixtures')).toEqual({
      allowed: false,
      reason: 'no-exposure-chain',
    });
    expect(explainImport(routed, unitTests, 'orders', 'orderFixtures')).toEqual({
      allowed: false,
      reason: 'no-exposure-chain',
    });
  });

  it('keeps a symbol its owner exposes nowhere unreachable, test context or not', () => {
    for (const importer of [integrationTests, salesTests, unitTests, 'sales'] as const) {
      expect(explainImport(routed, importer, 'orders', 'orderStoreInternals')).toEqual({
        allowed: false,
        reason: 'never-exposed',
      });
    }
  });

  it('reports a tree refusal for the tree reason, never a tag reason', () => {
    // One symbol, two refusals: `sales`'s production files are refused by the
    // tag, `app`'s test context by the missing exposure chain.
    expect(explainImport(routed, 'sales', 'orders', 'orderFixtures')).toEqual({
      allowed: false,
      reason: 'symbol-tag-requires-module-tag',
      unmet: { tag: 'testing', requires: 'testing' },
    });
    expect(explainImport(routed, salesTests, 'orders', 'orderFixtures')).toEqual({
      allowed: true,
      clause: 'child-exposure',
      via: 'orders',
      tags: ['testing'],
    });
  });

  it('lets no importer of any universe import what is not available in its module', () => {
    for (const tree of [example3, example4, routed]) {
      for (const importer of allImporters(tree)) {
        for (const symbol of allSymbols(tree)) {
          if (mayImport(tree, importer, symbol.owner, symbol.name)) {
            expect(isAvailable(tree, importer.module, symbol.owner, symbol.name)).toBe(true);
          }
        }
      }
    }
  });
});

// --- A tag travels with its symbol ----------------------------------------

describe('a tag travels with its symbol', () => {
  it('survives every re-exposure — a route can neither strip nor change it', () => {
    // `resetOrderStore` crossed two re-exposures and one grant on its way to
    // `shipping`, and arrives still tagged.
    expect(explainImport(routed, 'shipping', 'orders', 'resetOrderStore')).toEqual({
      allowed: false,
      reason: 'symbol-tag-requires-module-tag',
      unmet: { tag: 'testing', requires: 'testing' },
    });
  });

  it('is safe at any grant breadth', () => {
    // `app` blanket-granted received test support to its whole subtree. Every
    // production importer in it is refused, and every test context allowed.
    for (const module of routed.modules.keys()) {
      if (module === 'orders') {
        continue; // Its owner: same-module imports cross no boundary.
      }
      expect(mayImport(routed, module, 'orders', 'resetOrderStore')).toBe(false);
    }
    for (const importer of [integrationTests, salesTests, unitTests]) {
      expect(mayImport(routed, importer, 'orders', 'resetOrderStore')).toBe(true);
    }
  });

  it('answers at the owner, not at whoever routed it', () => {
    expect(symbolTagsOf(routed, 'orders', 'resetOrderStore')).toEqual(['testing']);
    // `sales` and `app` both pass the symbol on, and own nothing by that name.
    expect(symbolTagsOf(routed, 'sales', 'resetOrderStore')).toEqual([]);
    expect(symbolTagsOf(routed, 'app', 'resetOrderStore')).toEqual([]);
  });
});

// --- A declared test module ------------------------------------------------

/**
 * ```text
 * app                          grants what it receives to its subtree
 * ├── testSupport test       a declared test module: owns fakeClock
 * │   └── testSupportInternals owns stubTimer, exposed up
 * ├── orders                   owns resetOrderStore testing
 * └── billing                  production consumer
 * ```
 */
const testModuleDeclaration: ModuleDeclaration = {
  id: 'app',
  contexts: [{ name: 'integration-tests', tags: ['testing'] }],
  reExposes: [
    { symbol: 'fakeClock', from: 'testSupport', exposeToDescendants: true },
    { symbol: 'stubTimer', from: 'testSupport', exposeToDescendants: true },
    { symbol: 'resetOrderStore', from: 'orders', exposeToDescendants: true },
  ],
  children: [
    {
      id: 'testSupport',
      moduleTags: ['testing'],
      owns: [{ symbol: 'fakeClock', exposeToParent: true }],
      reExposes: [{ symbol: 'stubTimer', from: 'testSupportInternals', exposeToParent: true }],
      children: [
        { id: 'testSupportInternals', owns: [{ symbol: 'stubTimer', exposeToParent: true }] },
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
  it('tags everything it exposes, without declaring a tag anywhere', () => {
    expect(symbolTagsOf(withTestModule, 'testSupport', 'fakeClock')).toEqual(['testing']);
  });

  it('tags what its submodules own too — test infrastructure all the way down', () => {
    expect(symbolTagsOf(withTestModule, 'testSupportInternals', 'stubTimer')).toEqual([
      'testing',
    ]);
  });

  it('cannot enter a production ceiling, however widely it is granted', () => {
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

  it('is itself a test context, and so is its subtree', () => {
    expect(mayImport(withTestModule, 'testSupport', 'orders', 'resetOrderStore')).toBe(true);
    expect(mayImport(withTestModule, 'testSupportInternals', 'orders', 'resetOrderStore')).toBe(
      true,
    );
    expect(mayImport(withTestModule, 'billing', 'orders', 'resetOrderStore')).toBe(false);
  });

  it('changes what may be imported, never what is available', () => {
    expect(isAvailable(withTestModule, 'billing', 'testSupport', 'fakeClock')).toBe(true);
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

  it('refuses it in a submodule that inherited the classification', () => {
    expect(() =>
      buildTree({
        id: 'app',
        children: [
          {
            id: 'testSupport',
            moduleTags: ['testing'],
            children: [
              {
                id: 'testSupportInternals',
                owns: [{ symbol: 'renderFixture', exposeToParent: true, tags: ['browser'] }],
              },
            ],
          },
        ],
      }),
    ).toThrow(/may not drop that tag by declaring \[browser\]/);
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

  it('accepts more tags alongside it — exclusivity is about the default channel', () => {
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
    // A browser context defaults no exposure tag, so a browser module tags its
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
    // be default contract on one route and test support on another.
    expect(symbolTagsOf(routed, 'orders', 'resetOrderStore')).toEqual(['testing']);
    expect(mayImport(routed, 'shipping', 'orders', 'resetOrderStore')).toBe(false);
    expect(mayImport(routed, 'sales', 'orders', 'resetOrderStore')).toBe(false);
  });
});

// --- Availability is the tag-free ceiling ---------------------------------

describe('availability and importability', () => {
  it('leaves availability untouched and gates the import', () => {
    expect(isAvailable(example3, 'billing', 'orders', 'resetOrderStore')).toBe(true);
    expect(mayImport(example3, 'billing', 'orders', 'resetOrderStore')).toBe(false);
    expect(mayImport(example3, integrationTests, 'orders', 'resetOrderStore')).toBe(true);
  });

  it('answers the module-level question without a context or a binding', () => {
    expect(explainAvailability(example4, 'ui', 'shared', 'queryDb')).toEqual({
      allowed: true,
      clause: 'ancestor-grant',
      via: 'app',
    });
    expect(mayImport(example4, uiValue, 'shared', 'queryDb')).toBe(false);
    expect(mayImport(example4, uiType, 'shared', 'queryDb')).toBe(true);
  });

  it('reports a tree refusal identically for both questions', () => {
    expect(explainAvailability(routed, 'billing', 'orders', 'orderFixtures')).toEqual(
      explainImport(routed, unitTests, 'orders', 'orderFixtures'),
    );
  });
});

// --- The importer descriptor ----------------------------------------------

describe('the importer descriptor', () => {
  it('reads a bare module id as a value import from the module’s own files', () => {
    for (const tree of [example3, example4, routed]) {
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

  it('throws for a context the module does not declare', () => {
    expect(() =>
      mayImport(
        example3,
        { module: 'billing', context: 'integration-tests' },
        'orders',
        'OrderService',
      ),
    ).toThrow(/declares no importer context "integration-tests"/);
    // Even when the answer would have been a refusal anyway.
    expect(() =>
      mayImport(example3, { module: 'app', context: 'nowhere' }, 'orders', 'noSuchSymbol'),
    ).toThrow(/declares no importer context "nowhere"/);
  });

  it('throws for an unknown module id, descriptor or not', () => {
    expect(() => mayImport(example3, { module: 'warehouse' }, 'orders', 'OrderService')).toThrow(
      /Unknown module/,
    );
  });

  it('leaves same-owner imports outside the model', () => {
    // `ui` is a browser context and owns a symbol it never tagged. Whether its
    // own files keep the platform split internally is its own business.
    const tree = buildTree({
      id: 'app',
      children: [
        {
          id: 'ui',
          moduleTags: ['browser'],
          owns: [{ symbol: 'renderApp' }],
          contexts: [{ name: 'ui-tests', tags: ['testing'] }],
        },
      ],
    });
    expect(explainImport(tree, { module: 'ui', binding: 'value' }, 'ui', 'renderApp')).toEqual({
      allowed: true,
      clause: 'same-module',
      via: null,
    });
    expect(mayImport(tree, { module: 'ui', context: 'ui-tests' }, 'ui', 'renderApp')).toBe(true);
  });
});

// --- Classification reaches the subtree -----------------------------------

describe('classification reaches the subtree', () => {
  const splitUi = buildTree({
    ...example4Declaration,
    children: (example4Declaration.children ?? []).map((child) =>
      child.id === 'ui' ? { ...child, children: [{ id: 'uiWidgets' }, { id: 'uiPages' }] } : child,
    ),
  });

  it('keeps a browser module’s submodules browser contexts', () => {
    for (const submodule of ['uiWidgets', 'uiPages'] as const) {
      expect(moduleTagsOf(splitUi, submodule)).toEqual(['browser']);
      expect(mayImport(splitUi, { module: submodule }, 'shared', 'queryDb')).toBe(false);
      expect(mayImport(splitUi, { module: submodule, binding: 'type' }, 'shared', 'queryDb')).toBe(
        true,
      );
      expect(mayImport(splitUi, { module: submodule }, 'shared', 'formatMoney')).toBe(true);
    }
  });

  it('adds a declared context’s tags to the ones its module carries', () => {
    const tree = buildTree({
      id: 'app',
      moduleTags: ['browser'],
      contexts: [{ name: 'ui-tests', tags: ['testing'] }],
      children: [{ id: 'widgets', contexts: [{ name: 'widget-tests', tags: ['testing'] }] }],
    });
    expect(moduleTagsOf(tree, 'app')).toEqual(['browser']);
    expect(moduleTagsOf(tree, 'app', 'ui-tests')).toEqual(['testing', 'browser']);
    expect(moduleTagsOf(tree, 'widgets', 'widget-tests')).toEqual(['testing', 'browser']);
  });

  it('never drops a classification an ancestor declared', () => {
    // A test context inside a browser module is still a browser context: it may
    // import test support, and still only browser-safe values.
    const tree = buildTree({
      id: 'app',
      reExposes: [
        { symbol: 'resetWidgetStore', from: 'widgets', exposeToDescendants: true },
        { symbol: 'renderWidgetFixture', from: 'widgets', exposeToDescendants: true },
        { symbol: 'queryDb', from: 'server', exposeToDescendants: true },
      ],
      children: [
        {
          id: 'widgets',
          owns: [
            { symbol: 'resetWidgetStore', exposeToParent: true, tags: ['testing'] },
            {
              symbol: 'renderWidgetFixture',
              exposeToParent: true,
              tags: ['testing', 'browser'],
            },
          ],
        },
        { id: 'server', owns: [{ symbol: 'queryDb', exposeToParent: true }] },
        { id: 'ui', moduleTags: ['browser'], contexts: [{ name: 'ui-tests', tags: ['testing'] }] },
      ],
    });
    const uiTests: Importer = { module: 'ui', context: 'ui-tests' };

    // Test support that promises nothing about its closure: type-only here.
    expect(explainImport(tree, uiTests, 'widgets', 'resetWidgetStore')).toEqual({
      allowed: false,
      reason: 'module-tag-requires-symbol-tag',
      unmet: { tag: 'browser', requires: 'browser' },
    });
    expect(mayImport(tree, { ...uiTests, binding: 'type' }, 'widgets', 'resetWidgetStore')).toBe(
      true,
    );

    // Test support that does promise it satisfies both requirements at once.
    expect(explainImport(tree, uiTests, 'widgets', 'renderWidgetFixture')).toEqual({
      allowed: true,
      clause: 'ancestor-grant',
      via: 'app',
      tags: ['testing', 'browser'],
    });
    // And the production files of the same module still may not: the test
    // requirement is unchanged by the browser promise.
    expect(explainImport(tree, 'ui', 'widgets', 'renderWidgetFixture')).toEqual({
      allowed: false,
      reason: 'symbol-tag-requires-module-tag',
      unmet: { tag: 'testing', requires: 'testing' },
    });

    // A Node-only production symbol stays out, test context or not.
    expect(explainImport(tree, uiTests, 'server', 'queryDb')).toEqual({
      allowed: false,
      reason: 'module-tag-requires-symbol-tag',
      unmet: { tag: 'browser', requires: 'browser' },
    });
  });
});
