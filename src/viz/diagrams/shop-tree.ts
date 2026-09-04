/**
 * The shop as a tree - the two tree diagrams of the "Why hierarchical
 * modularity" page.
 *
 * Twenty modules, four levels, and names any engineer recognizes: a system
 * into domains, a domain into capabilities, a capability into pieces. The
 * first diagram draws the structure alone. The second is the view from inside
 * `payment` - a module in the middle of the tree, with a parent, a
 * grandparent, two children, two siblings and unrelated branches: its files,
 * what its children expose to it, what is handed down from above, what it owes
 * upward, and the whole tree at a distance with everything not available in
 * it dimmed.
 *
 * The few symbols declared here exist for the focus view. `Logger` travels
 * the long way - `logging` to `platform` to `shop`, then down to every branch -
 * so the one cross-branch arrival in `payment` is the hop through the common
 * ancestor that the page's cost paragraph describes.
 *
 * Pure and browser-compatible: no I/O, no Node built-ins, no side effects.
 */

import type { FocusDiagramDefinition } from '../focus-diagram.js';
import type { ModuleDeclaration } from '../model-access.js';
import type { TreeDiagramDefinition } from '../tree-diagram.js';

/**
 * ```text
 * shop
 * ├── catalog
 * │   ├── search
 * │   │   ├── indexing
 * │   │   └── ranking
 * │   └── inventory
 * ├── checkout                  owns OrderTotal (to descendants)
 * │   ├── cart
 * │   ├── payment               owns chargeOrder, refundOrder (to parent)
 * │   │   ├── cards             owns tokenizeCard, chargeCard (to parent)
 * │   │   └── fraudCheck        owns assessRisk (to parent)
 * │   └── shipping
 * │       └── routing
 * ├── accounts
 * │   ├── auth
 * │   └── profiles
 * └── platform
 *     ├── db
 *     ├── http
 *     └── logging               owns Logger (to parent; re-exposed up, then down)
 * ```
 */
export const shopTreeDeclaration: ModuleDeclaration = {
  id: 'shop',
  reExposes: [{ symbol: 'Logger', from: 'platform', exposeToDescendants: true }],
  children: [
    {
      id: 'catalog',
      children: [
        { id: 'search', children: [{ id: 'indexing' }, { id: 'ranking' }] },
        { id: 'inventory' },
      ],
    },
    {
      id: 'checkout',
      owns: [{ symbol: 'OrderTotal', exposeToDescendants: true }],
      children: [
        { id: 'cart' },
        {
          id: 'payment',
          owns: [
            { symbol: 'chargeOrder', exposeToParent: true },
            { symbol: 'refundOrder', exposeToParent: true },
          ],
          children: [
            {
              id: 'cards',
              owns: [
                { symbol: 'tokenizeCard', exposeToParent: true },
                { symbol: 'chargeCard', exposeToParent: true },
              ],
            },
            { id: 'fraudCheck', owns: [{ symbol: 'assessRisk', exposeToParent: true }] },
          ],
        },
        { id: 'shipping', children: [{ id: 'routing' }] },
      ],
    },
    { id: 'accounts', children: [{ id: 'auth' }, { id: 'profiles' }] },
    {
      id: 'platform',
      reExposes: [{ symbol: 'Logger', from: 'logging', exposeToParent: true }],
      children: [
        { id: 'db' },
        { id: 'http' },
        { id: 'logging', owns: [{ symbol: 'Logger', exposeToParent: true }] },
      ],
    },
  ],
};

/** The structure alone: boxes in boxes, no symbols. */
export const shopTreeDiagram: TreeDiagramDefinition = {
  id: 'shop-tree',
  declaration: shopTreeDeclaration,
  ariaLabel:
    'A module tree for an online shop: shop at the root, then catalog, checkout, accounts and platform, each with its own sub-modules, down to four levels',
};

/** The view from inside `payment`: its working context, and the tree at a distance. */
export const shopFocusDiagram: FocusDiagramDefinition = {
  id: 'shop-focus-payment',
  declaration: shopTreeDeclaration,
  focus: { moduleId: 'payment', files: ['charge.ts', 'refund.ts', 'types.ts'] },
  ariaLabel:
    'The view from inside payment: from above it receives OrderTotal from checkout and Logger from shop and owes chargeOrder and refundOrder to checkout; its own files are charge.ts, refund.ts and types.ts; its sub-modules cards and fraudCheck expose tokenizeCard, chargeCard and assessRisk to it; below, the whole shop tree at a distance with payment marked and every module not available in it dimmed',
  notes: ['▲ exposed to the parent   ▼ exposed to descendants   dashed: the route a received symbol took'],
};
