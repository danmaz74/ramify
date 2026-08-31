# Illustrative Examples

Small, self-contained example universes for explaining the model — each one
built to teach a small set of lessons cleanly, rather than everything at
once. Site diagrams derive from these. Vocabulary per the
[Glossary](glossary.md); rules per
[Cross-Module Importability Rules](cross-module-importability-rules.md).

Naming convention: top-level modules describe their role (`globalLibrary`)
or imply a plausible one (`invoicing`, `shipping`); symbols are
self-explanatory (`computeTotal`, `InvoiceModel`); `PascalCase` = types,
`camelCase` = values.

## Diagram conventions

- Node boxes show two compartments: **owns** and **exposed to it**, the
  latter naming each arrival's provenance (`from <child>`, `granted by
  <ancestor>`). Availability is the union of the two, read box by box.
- One drawn non-allowed import per static diagram.
- **Selecting a traced symbol** (adopted 2026-08-31, works well): the other
  layers dim, the symbol's propagation lines turn dashed and animate in the
  direction the exposure flows, and its rows in every "exposed to it"
  compartment blink. Nothing is overlaid: reach is read off the moving
  mechanism and the blinking arrivals. (A derived fan of ✓ chords from each
  permitted importer to the owner was tried first and rejected — it only
  restated what the flows already say.) Pure CSS, with a
  `prefers-reduced-motion` fallback (static dashes, steady highlight). Use
  this pattern for every diagram in the series.

## Example 1: One decision, three reaches

How far a symbol reaches is decided not by its owner, but by where the chain
of exposures above it turns downward — or doesn't. Three leaf modules make
the identical decision, expose a symbol to their parent, and end up with
three different reaches: application-wide, domain-wide, parent-only.

### Tree

```text
app
├── globalLibrary
│   └── moneyUtils            owns computeTotal
├── invoicing
│   ├── invoicingLibrary      owns InvoiceModel
│   ├── invoiceComputation
│   └── invoicePDF
└── shipping
    └── routingOptimization   owns optimizeRoute
```

### Decisions

| # | Module | Decision |
| --- | --- | --- |
| 1 | `moneyUtils` | exposes `computeTotal` to parent |
| 2 | `globalLibrary` | re-exposes `computeTotal` to parent |
| 3 | `app` | re-exposes `computeTotal` to descendants |
| 4 | `invoicingLibrary` | exposes `InvoiceModel` to parent |
| 5 | `invoicing` | re-exposes `InvoiceModel` to descendants |
| 6 | `routingOptimization` | exposes `optimizeRoute` to parent |

### Resulting reach

| Symbol | Owner's decision | What happened above | Reach |
| --- | --- | --- | --- |
| `computeTotal` | expose to parent | passed up again, turned downward at `app` | every module |
| `InvoiceModel` | expose to parent | turned downward at `invoicing` | the `invoicing` subtree |
| `optimizeRoute` | expose to parent | `shipping` composed it and stopped | `shipping` only |

The three owners made the **same** decision. The three reaches were decided
entirely by the ancestors — exposing upward cedes onward routing.

### Non-allowed imports

- `shipping` ✗ `InvoiceModel` — a grant never leaves the granter's subtree;
  nor is the symbol available in `routingOptimization`, for the same reason.
- `invoicing` ✗ `optimizeRoute` — **there is no sibling channel**: exposing a
  symbol to the parent gives siblings nothing. Not drawn in the static
  diagram (one drawn non-allowed import per diagram); interactively,
  selecting `optimizeRoute` shows a single one-hop flow and a single
  blinking arrival in `shipping` — the sibling's absence is the point.

### Lessons

1. A "global library" and a "domain library" are the same mechanism at
   different altitudes; nothing is ever declared "global".
2. Reach is a consequence of where the up-chain turns into a grant, not a
   property of the symbol or its owner.
3. Grants are subtree-bounded: `InvoiceModel` reaches both of `invoicing`'s
   consumers and nothing outside.
4. Composition without routing is the degenerate case of the same spectrum:
   `optimizeRoute` stops at the parent.
5. Siblings are strangers by default. Sharing between siblings is never the
   exposer's decision — the route is through the parent, and the parent
   decides. The contrast is drawn: `invoicing` turned `InvoiceModel`
   downward, so its two consumers share it; `shipping` stopped
   `optimizeRoute`, so its sibling sees nothing.
6. The root routes without owning: `app` has no code of its own and still
   carries the application's vocabulary.

### Diagram notes

- Two consumers under `invoicing` are deliberate: a grant needs at least two
  arrivals to read as a grant rather than a private handoff.
- Nine modules but only six decision dots and one theme; complexity is
  measured in decisions, not boxes.
- Candidate interactivity: click a decision dot to toggle it off and watch
  every downstream arrowhead vanish — each hop is load-bearing.
