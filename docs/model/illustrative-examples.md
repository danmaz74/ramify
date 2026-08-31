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
- Non-allowed imports are not drawn: absence is the statement, and selecting
  a symbol makes the absence visible.
- Every exposure path is traced — its own color, its own selectable layer.
  (The old criterion "traced iff reach was decided by a module other than
  its owner" was a density workaround for the retired composite diagram.) A
  symbol exposed nowhere has no path to trace; it stays gray.
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
three different reaches: application-wide, domain-wide, parent-only. A
fourth symbol goes the other way — its owner exposes it to its descendants —
and shows the asymmetry: a downward exposure is complete in one decision and
can never leave the subtree.

### Tree

```text
app
├── globalLibrary
│   └── moneyUtils            owns computeTotal
├── invoicing
│   ├── invoicingLibrary      owns InvoiceModel
│   ├── invoiceComputation
│   └── invoicePDF
└── shipping                  owns ShipmentPlan
    └── routingOptimization   owns optimizeRoute
```

`routingOptimization` consumes a `ShipmentPlan` and exposes `optimizeRoute`
back up: the `shipping` ↔ `routingOptimization` edge carries a type flowing
down and a function flowing up, each its own decision.

### Decisions

| # | Module | Decision |
| --- | --- | --- |
| 1 | `moneyUtils` | exposes `computeTotal` to parent |
| 2 | `globalLibrary` | re-exposes `computeTotal` to parent |
| 3 | `app` | re-exposes `computeTotal` to descendants |
| 4 | `invoicingLibrary` | exposes `InvoiceModel` to parent |
| 5 | `invoicing` | re-exposes `InvoiceModel` to descendants |
| 6 | `routingOptimization` | exposes `optimizeRoute` to parent |
| 7 | `shipping` | exposes `ShipmentPlan` to descendants |

### Resulting reach

| Symbol | Owner's decision | What happened above | Reach |
| --- | --- | --- | --- |
| `computeTotal` | expose to parent | passed up again, turned downward at `app` | every module |
| `InvoiceModel` | expose to parent | turned downward at `invoicing` | the `invoicing` subtree |
| `optimizeRoute` | expose to parent | `shipping` composed it and stopped | `shipping` only |
| `ShipmentPlan` | expose to descendants | nothing — no one above was ever involved | the `shipping` subtree |

The three up-exposing owners made the **same** decision. The three reaches
were decided entirely by the ancestors — exposing upward cedes onward
routing. `ShipmentPlan`'s reach, by contrast, was decided entirely by its
owner: a downward exposure cedes nothing, and only an upward exposure could
ever carry a symbol out of its subtree.

### Non-allowed imports

- `shipping` ✗ `InvoiceModel` — a grant never leaves the granter's subtree;
  nor is the symbol available in `routingOptimization`, for the same reason.
- `invoicing` ✗ `optimizeRoute` — **there is no sibling channel**: exposing a
  symbol to the parent gives siblings nothing. Interactively, selecting
  `optimizeRoute` shows a single one-hop flow and a single blinking arrival
  in `shipping` — the sibling's absence is the point.
- `app` ✗ `ShipmentPlan` — the **parent** is not allowed while descendants
  are: `shipping` exposed the type only downward, so nothing above it, root
  included, ever sees it.

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
7. The two channels are asymmetric. Exposing down is final and bounded — one
   decision, whole subtree, nothing ceded, no way out. Exposing up hands
   onward routing to the ancestors.

### Diagram notes

- Two consumers under `invoicing` are deliberate: a grant needs at least two
  arrivals to read as a grant rather than a private handoff.
- Nine modules but only seven decision dots and one theme; complexity is
  measured in decisions, not boxes.
- The `shipping` box shows the handshake both ways: `owns ▼ ShipmentPlan`
  above `exposed to it · optimizeRoute`.

## Example 2: Both channels at once

One owner, one symbol, both exposure decisions — and the ceiling that even
both together cannot break.

### Tree

```text
app
├── pricing              owns PriceModel
│   ├── discounts
│   └── taxes
└── checkout             owns submitOrder
```

### Decisions

| # | Module | Decision |
| --- | --- | --- |
| 1 | `pricing` | exposes `PriceModel` to descendants |
| 2 | `pricing` | exposes `PriceModel` to parent |
| 3 | `checkout` | exposes `submitOrder` to parent |

### Resulting availability

`PriceModel` shows as `▲▼` in `pricing`'s box — the first occurrence of that
marker in the series: two independent one-hop decisions sharing a row. It is
granted to `discounts` and `taxes`, and received and stopped at `app` (gray,
no dot). Reach: the `pricing` subtree plus `app` — one subtree down, one hop
up, nothing more.

`submitOrder` is furniture, not a lesson: a known specimen from Example 1
(exposed up, composed, stopped) that keeps `checkout` a real module and gives
`app` two stopped rows side by side.

### Non-allowed imports

- `checkout` ✗ `PriceModel` — the sibling that would most plausibly want the
  type doesn't get it, even though the owner used **both** channels: crossing
  to a sibling was never the owner's decision to make, and `app` made none.

### Lessons

1. `▲▼` is not a third channel — two independent one-hop decisions that
   happen to share a row.
2. The ceiling on unilateral reach: both channels at once buy exactly the
   owner's subtree plus its parent. That is structurally the most any owner
   can reach alone.
3. Reach ends where decisions end: `app` has no dot, and both symbols stop
   there — the default at every module is "goes no further".

### Diagram notes

- Two consumers under `pricing` per the grant-needs-two-arrivals convention.
- Five modules, three dots, two traced colors — the smallest diagram in the
  series.
- Selecting `PriceModel` animates both flows out of a single row: up one hop
  and down one subtree at once.
- Candidate interactivity: click a decision dot to toggle it off and watch
  every downstream arrowhead vanish — each hop is load-bearing.
