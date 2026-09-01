# Illustrative Examples

Small, self-contained example universes for explaining the model - each one
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
  <ancestor>`). Visibility is the union of the two, read box by box -
  and with no tags declared, what is visible is exactly what is available.
- Non-allowed imports are not drawn: absence is the statement, and selecting
  a symbol makes the absence visible.
- Every exposure path is traced - its own color, its own selectable layer.
  (The old criterion "traced iff reach was decided by a module other than
  its owner" was a density workaround for the retired composite diagram.) A
  symbol exposed nowhere has no path to trace; it stays gray.
- **Selecting a traced symbol** (adopted 2026-08-31, works well): the other
  layers dim, the symbol's propagation lines turn dashed and animate in the
  direction the exposure flows, and its rows in every "exposed to it"
  compartment blink. Nothing is overlaid: reach is read off the moving
  mechanism and the blinking arrivals. (A derived fan of ✓ chords from each
  permitted importer to the owner was tried first and rejected - it only
  restated what the flows already say.) Pure CSS, with a
  `prefers-reduced-motion` fallback (static dashes, steady highlight). Use
  this pattern for every diagram in the series.
- **Tag examples keep the tree trivial**: visibility is uniform by
  construction and stated in one sentence; nothing examples 1–2 already
  taught is re-shown, and the tag is the only variable.
- **A tag is written behind the glyph of the availability rule it carries**,
  everywhere the diagram mentions it. The glyphs are a mirror-arrow pair
  drawing the direction of the rule's demand: `⇥` is the required-module-tag
  rule - the demand rides out with the symbol and is checked where it lands,
  so it is available only in modules carrying the same tag; `⇤` is the
  required-symbol-tag rule - the demand faces in at the module's door and is
  checked on everything arriving, so the module value-imports only symbols
  carrying the same tag. So the chip on a tagged symbol's row reads
  `⇥ testing`, and a tagged module's dashed box is labeled `⇤ browser`. The
  chip sits on a filled pill and travels with the symbol to every arrival; a
  tagged module's dashed box fills its node. (Miniatures of the part that
  must match - a box, a pill - were tried first and dropped: the two outlines
  were indistinguishable at chip size.)
- **Visible but not available is struck through**: when a module's files may
  not import an arrival, the row is drawn - the exposure chain really does
  put the symbol there - with its name struck. The diagrams tell the
  availability (value-import) story; the type story leaves exactly one mark:
  a struck name followed by an unstruck `∗` is still type-available, while a
  bare struck name is blocked in both import forms. The asterisk is a
  footnote mark - the footnote is the type-imports explanation, not another
  row affordance.
- Selecting a tagged symbol blinks only the arrivals where it is available -
  tagged modules light up, production compartments stay dark. A tag-refused
  arrival is also dimmed, not merely un-pulsed, so the refusal survives
  `prefers-reduced-motion` (its strike states the same thing statically).

## Example 1: One decision, three reaches

How far a symbol reaches is decided not by its owner, but by where the chain
of exposures above it turns downward - or doesn't. Three leaf modules make
the identical decision, expose a symbol to their parent, and end up with
three different reaches: application-wide, domain-wide, parent-only. A
fourth symbol goes the other way - its owner exposes it to its descendants -
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
| `ShipmentPlan` | expose to descendants | nothing - no one above was ever involved | the `shipping` subtree |

The three up-exposing owners made the **same** decision. The three reaches
were decided entirely by the ancestors - exposing upward cedes onward
routing. `ShipmentPlan`'s reach, by contrast, was decided entirely by its
owner: a downward exposure cedes nothing, and only an upward exposure could
ever carry a symbol out of its subtree.

### Non-allowed imports

- `shipping` ✗ `InvoiceModel` - a grant never leaves the granter's subtree;
  nor is the symbol available in `routingOptimization`, for the same reason.
- `invoicing` ✗ `optimizeRoute` - **there is no sibling channel**: exposing a
  symbol to the parent gives siblings nothing. Interactively, selecting
  `optimizeRoute` shows a single one-hop flow and a single blinking arrival
  in `shipping` - the sibling's absence is the point.
- `app` ✗ `ShipmentPlan` - the **parent** is not allowed while descendants
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
   exposer's decision - the route is through the parent, and the parent
   decides. The contrast is drawn: `invoicing` turned `InvoiceModel`
   downward, so its two consumers share it; `shipping` stopped
   `optimizeRoute`, so its sibling sees nothing.
6. The root routes without owning: `app` has no code of its own and still
   carries the application's vocabulary.
7. The two channels are asymmetric. Exposing down is final and bounded - one
   decision, whole subtree, nothing ceded, no way out. Exposing up hands
   onward routing to the ancestors.

### Diagram notes

- Two consumers under `invoicing` are deliberate: a grant needs at least two
  arrivals to read as a grant rather than a private handoff.
- Nine modules but only seven decision dots and one theme; complexity is
  measured in decisions, not boxes.
- The `shipping` box shows the handshake both ways: `owns ▼ ShipmentPlan`
  above `exposed to it · optimizeRoute`.
- The site presents this example as a three-step build-up: stage A is the
  `shipping` subtree under an empty root (both channels, one hop each),
  stage B is the `invoicing` subtree alone under the root (the first chain,
  the first grant, a reach that stops at the domain border), and the full
  diagram is the finale, where the cross-domain denials appear. The stages
  are presentation only - this document stays normative for the one
  universe - and each stage's subtree and traced colors must match the full
  diagram exactly (`src/viz/example1-stages.test.ts` pins this).

## Example 2: Both channels at once

One owner, one symbol, both exposure decisions - and the ceiling that even
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

`PriceModel` shows as `▲▼` in `pricing`'s box - the first occurrence of that
marker in the series: two independent one-hop decisions sharing a row. It is
granted to `discounts` and `taxes`, and received and stopped at `app` (gray,
no dot). Reach: the `pricing` subtree plus `app` - one subtree down, one hop
up, nothing more.

`submitOrder` is furniture, not a lesson: a known specimen from Example 1
(exposed up, composed, stopped) that keeps `checkout` a real module and gives
`app` two stopped rows side by side.

### Non-allowed imports

- `checkout` ✗ `PriceModel` - the sibling that would most plausibly want the
  type doesn't get it, even though the owner used **both** channels: crossing
  to a sibling was never the owner's decision to make, and `app` made none.

### Lessons

1. `▲▼` is not a third channel - two independent one-hop decisions that
   happen to share a row.
2. The ceiling on unilateral reach: both channels at once buy exactly the
   owner's subtree plus its parent. That is structurally the most any owner
   can reach alone.
3. Reach ends where decisions end: `app` has no dot, and both symbols stop
   there - the default at every module is "goes no further".

### Diagram notes

- Two consumers under `pricing` per the grant-needs-two-arrivals convention.
- Five modules, three dots, two traced colors - the smallest diagram in the
  series.
- Selecting `PriceModel` animates both flows out of a single row: up one hop
  and down one subtree at once.
- Candidate interactivity: click a decision dot to toggle it off and watch
  every downstream arrowhead vanish - each hop is load-bearing.

## Example 3: The tag is the entire difference (testing)

Two symbols with identical exposures; one wears `testing`. The tree setup is
one sentence - everything is granted everywhere, and none of it is the
lesson. The lesson is the required-module-tag rule (`⇥`) that `testing`
carries: both symbols are visible everywhere, and the tagged one is available
only in modules carrying the same tag.

### Tree

```text
app                      grants everything it receives to its subtree
├── orders               owns OrderService, resetOrderStore (tagged testing)
│                        (both exposed to parent)
├── billing              production consumer
└── integration-tests    testing module: carries the ⇥ testing tag
```

### Verdicts

Visibility is identical in every column; only the tag differs.

| Importer | `OrderService` | `resetOrderStore` (tagged `⇥ testing`) |
| --- | --- | --- |
| `billing` (production) | ✓ | ✗ - available only in testing modules |
| `integration-tests` (testing module) | ✓ | ✓ |

### Lessons

1. Visible is not available: both symbols share the same exposure chain,
   and the tag's availability rule alone flips the verdict.
2. Tags never grant: the testing module imports nothing the tree did not
   route to it. It sees `OrderService` because the chain reaches it, not
   because it is tagged.
3. Test support is curated, symbol by symbol: `orders` chose exactly what
   tests may touch; tests never receive blanket private access.
4. Exclusivity: `testing` removes a symbol from the default contract - a
   symbol is real contract or test support, never both.
5. Grant breadth is safe at any width: blanket-granting received test
   support is harmless, because the availability rule travels with the
   symbol and withholds it from untagged modules everywhere the grant
   reaches.

### Diagram notes

- The integration tests are their own module, a child of `app` - the lowest
  common ancestor whose composition they exercise, per the spec's
  recommendation - and the whole module is tagged `testing`, so the dashed
  box fills its node.
- `resetOrderStore`'s name is struck in `billing` and in `app` - visible
  there, not available - and drawn plainly in the testing module. The static
  picture already states the verdict table.
- Selecting `resetOrderStore`: the testing module blinks; `billing` stays
  dark, and so does `app`'s own row - routing a grant earns no right to
  import it. Selecting `OrderService`: both blink - the contrast is the
  picture.

## Example 4: A promise about the closure (browser)

The other availability rule, pointing the other way: `testing` constrains
where a tagged symbol may go; `browser` carries the required-symbol-tag rule
(`⇤`), constraining what a tagged module may take. Two symbols with identical
exposures; one wears `browser` - a falsifiable promise that the symbol's
entire transitive runtime closure is browser-safe.

### Tree

```text
app                      grants everything it receives to its subtree
├── shared               owns formatMoney (tagged browser), queryDb
│                        (both exposed to parent)
├── ui                   browser module: carries the ⇤ browser tag
└── server               plain module
```

### Verdicts

| Importer | `formatMoney` (tagged `⇤ browser`) | `queryDb` |
| --- | --- | --- |
| `server` | ✓ | ✓ |
| `ui` | ✓ | ✗ - a browser module value-imports only browser symbols |

### Lessons

1. The browser line is drawn per symbol, not per file or module: `shared`
   never splits to separate browser-safe from Node-only code.
2. The tag is a promise, not a proof: importability consults only the
   declared `browser`; verification walks the closure separately, and a
   false claim is reported at the owner - never at the importer.
3. The two availability rules point in opposite directions, and the two
   examples show both: `testing` requires something of the importing module
   (`⇥`); `browser` on a module requires something of the imported symbol
   (`⇤`).

### Type imports (separate concern)

The browser rule covers value imports only, so `queryDb` remains
**type-available** in `ui`: a type-only import is erased before any runtime
exists, and the closure the tag protects never enters the bundle. The
`testing` rule, by contrast, covers both bindings - a type import of a test
fake is still test-only coupling. The chain is
available ⊆ type-available ⊆ visible, and no rule is ever type-only
(spec, Decided). None of this is drawn: the diagrams tell the availability
story, and type-availability lives in prose.

### Diagram notes

- `ui` is a whole module tagged `browser` - the same shape example 3's
  testing module wears.
- `queryDb`'s name is struck in `ui` - visible there, not available - with
  an unstruck `∗` after it: still type-available. Example 3's struck rows
  are bare, and the contrast is the two rules' asymmetry made visible.
- Selecting `queryDb`: `server` blinks, `ui` stays dark - the mirror image
  of example 3's selection story.
