# Diagram 1 — The Core Tree Model (No Tags)

**Status:** Specification — ready for implementation

**Date:** 2026-08-31

**Derives from:** [`docs/model/cross-module-importability-rules.md`](../model/cross-module-importability-rules.md)
(the normative model). Where this document and the model spec appear to
disagree, the model spec wins and this document is wrong.

**Scope:** the first diagram of the ramify.ts documentation site. It explains
the **tree rules only** — ownership, the two exposure channels, availability,
and the rule that a file may import what is available in its module.
Importer contexts and exposure tags
(testing, browser) are out of scope and appear nowhere in this diagram: no
test module, no browser module, no tag chip, no type-vs-value distinction.

---

## 0. What the diagram is for

The model answers exactly one question:

> Given a source file in module `S` and an exported symbol owned by module
> `T` — **may** that file import that symbol?

The diagram must make three things obvious at a glance:

1. **Access is closed by default.** Nothing is available across an owner
   boundary unless a chain of decisions opened it.
2. **Every opening is somebody's local decision.** A symbol travels by
   consensual hops; the diagram makes those hops countable.
3. **Reach is a consequence, not a setting.** Nobody writes "app-wide" or
   "sibling-visible" anywhere. Those are outcomes of where the up-chain turns
   into a down-grant.

### What the diagram must never show

Not because it is unimportant, but because it is a different subject and its
presence would teach the wrong lesson:

- barrels, index files, generated facades, named surfaces;
- import specifiers, path aliases, `.js` extensions, module resolution;
- config file formats, declaration syntax, CLI or daemon output;
- who *actually* imports what (observed dependencies). The diagram draws the
  **ceiling**, never the traffic under it;
- same-owner imports between files. The diagram's unit is the module; files
  inside one module import each other freely and no line is ever drawn for
  that.

---

## 1. The example universe

### 1.1 The tree

A small online shop. Three levels, eight modules, one leaf branch — deep
enough that "up then down" is a real journey and shallow enough to read.

```text
shop                      (application root — an ordinary module)
├── catalog
│   ├── search
│   └── inventory
├── checkout
│   ├── cart
│   └── payment
└── shipping
```

`shipping` deliberately owns nothing and exports nothing. A module with no
outward contract is normal, and it gives the diagram a witness for two rules
at once (see §2, rows 5 and the subdivision-invariance property).

### 1.2 Modules, symbols and exposure decisions

This is the complete declaration of the universe. Every cell is a decision
made by the module in the first column, about its own parent or its own
subtree — never about a module outside its immediate family.

| Owner | Symbol | The owner's decision | Then | Effective reach |
| --- | --- | --- | --- | --- |
| `shop` | `Money` | expose to descendants | — | every module in the app |
| `shop` | `formatDate` | expose to descendants | — | every module in the app |
| `catalog` | `ProductId` | expose to parent | `shop` re-exposes to descendants | every module in the app |
| `catalog` | `SkuRules` | expose to descendants | — | `search`, `inventory` |
| `inventory` | `reserveStock` | expose to parent | `catalog` stops there | `catalog` only |
| `payment` | `PaymentApi` | expose to parent | `checkout` re-exposes to descendants | `checkout`, `cart`, `payment` |
| `payment` | `retryQueue` | never exposed | — | nobody outside `payment` |
| `cart` | `CartApi` | expose to parent | `checkout` stops there | `checkout` only |

Two facts to notice, because the whole model is in them:

- `ProductId` and `reserveStock` start identically — *expose to parent, and
  nothing else*. Their reaches end up maximally different, and the owner
  decided neither outcome. The difference is what the **parent** did next.
- `checkout` holds two symbols it does not own, `PaymentApi` and `CartApi`,
  and treated them differently. Holding is not granting.

### 1.3 The full ceiling

Derived mechanically from §1.2 by the three-clause rule. `own` = same owner
(rule 1, no boundary crossed); `✓2` = rule 2 (a direct child exposed it to
me); `✓3` = rule 3 (a proper ancestor granted it to
its descendants); `—` = not available.

| may import → | `Money` | `formatDate` | `ProductId` | `SkuRules` | `reserveStock` | `PaymentApi` | `CartApi` | `retryQueue` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `shop` | own | own | ✓2 | — | — | — | — | — |
| `catalog` | ✓3 | ✓3 | own | own | ✓2 | — | — | — |
| `checkout` | ✓3 | ✓3 | ✓3 | — | — | ✓2 | ✓2 | — |
| `shipping` | ✓3 | ✓3 | ✓3 | — | — | — | — | — |
| `search` | ✓3 | ✓3 | ✓3 | ✓3 | — | — | — | — |
| `inventory` | ✓3 | ✓3 | ✓3 | ✓3 | own | — | — | — |
| `cart` | ✓3 | ✓3 | ✓3 | — | — | ✓3 | own | — |
| `payment` | ✓3 | ✓3 | ✓3 | — | — | own | — | own |

This table is the acceptance fixture for the reference evaluator (Iteration
2): all 64 cells, not only the ones the diagram draws.

### 1.4 The denied examples

Denials are first-class content. Each one is drawn, each one is short to
explain, and each one is adjacent to a permitted case that looks similar.

| # | Attempt | Verdict | Because |
| --- | --- | --- | --- |
| D1 | `checkout` imports `SkuRules` | ✗ | `catalog` granted it to *its own* subtree. A descendant grant never travels upward or sideways. |
| D2 | `search` imports `reserveStock` | ✗ | `inventory` exposed it to its parent only. There is no sibling channel; `catalog` did not pass it back down. |
| D3 | `shipping` imports `PaymentApi` | ✗ | `checkout` granted it to `checkout`'s subtree. `shipping` is outside that subtree, and `checkout` never exposed it to `shop`. |
| D4 | `payment` imports `CartApi` | ✗ | `checkout` **holds** `CartApi` but chose not to re-expose it. Composing a child does not make the child's contract available to its siblings. |
| D5 | `checkout` imports `retryQueue` | ✗ | `retryQueue` is never exposed. It never enters the exposure system, so not even its owner's parent can reach it. There is no implicit public surface. |

Two further denials are not drawn (they would add lines without adding a
lesson) but are part of the evaluator fixture:

- `shop` imports `SkuRules` — ✗. `catalog` exposed `SkuRules` downward, not
  upward; the two channels are independent.
- `shop` imports `CartApi` — ✗. `checkout` received it and passed it nowhere.

### 1.5 The uniform-grant footnote

> **`search` may import `ProductId`.**
>
> `catalog` owns `ProductId` and exposed it **only to its parent** — so
> `catalog` never gave its own children anything. `search` may import it
> anyway, because `shop` sent it back down into *every* branch, including the
> branch it came up through.
>
> This is deliberate. A descendant grant is uniform: it reaches the whole
> subtree, with no exclusion for the providing branch and no provenance
> carried on routed symbols. Exposing a symbol upward cedes its onward routing
> completely. A family that does not want a symbol reachable from inside
> itself resolves that by not exposing it upward at all — which is exactly
> what `inventory` and `cart` did with `reserveStock` and `CartApi`.

The footnote is anchored to the drawn allowed chord A1 (§3.6) and is the only
allowed import the diagram draws with a chord, because it is the only one
whose answer surprises people.

### 1.6 Adjustments and extensions versus the plan

Recorded so review can accept or reject them individually.

| # | Change vs. the plan's Design decision 1 | Why |
| --- | --- | --- |
| X1 | Added denial **D4** (`payment` ✗ `CartApi`) as drawn content. | The plan gives `CartApi` the rule "composition is not reciprocal", but that rule has no witness unless the failed sibling attempt is shown. D4 is also the exact negative image of `PaymentApi`: same parent, same holding, opposite decision. |
| X2 | Added denial **D5** (`checkout` ✗ `retryQueue`) as drawn content. | The plan lists `retryQueue` as "closed by default: nobody may import". Rendering it only as a grayed line inside `payment` shows a *state*, not a *rule*. One refused arrow from its own parent makes the point that there is no implicit public surface. |
| X3 | `shipping` is stated to own and export nothing (the plan left it implicit). | It becomes the witness for "creating a new sibling changes nobody's access", and it keeps a branch in the picture that is purely a consumer. |
| X4 | Added a **what-if annotation** (not new modules): `shipping` shown with a dashed internal note that splitting it into `rates` + `labels` changes none of its imports. | Subdivision invariance is a structural property of the model with no witness in the declared universe. Adding real submodules would deepen the tree by a level for one property; a dashed in-node annotation costs no layout space and stays visibly hypothetical. Droppable if review finds it noisy. |
| X5 | `Money` and `formatDate` are the only two symbols demonstrating the *same* rule. | Kept on purpose: one is a shared concept, the other a shared behavior, and together they are the diagram's only multi-symbol lane — which is what proves a lane can carry more than one symbol per decision. If review wants strict one-symbol-one-rule, drop `formatDate`. |

No other extension was needed: every no-tag row of the model's "Derived
behavior" table has a witness in the eight declared modules.

---

## 2. Use-case coverage matrix

Every row of the model's **Derived behavior** table. All six are tag-free, so
all six must be covered here.

| # | Derived-behavior row | Allowed example (drawn) | Denied example (drawn) | What the reader should conclude |
| --- | --- | --- | --- | --- |
| R1 | **Parent composes a direct child** — child exposes to parent (rule 2); not reciprocal | `catalog` ← `reserveStock` (`inventory`); `checkout` ← `CartApi` (`cart`) — both readable directly off the up-hop arrowheads landing on the parent | **D2** `search` ✗ `reserveStock`; **D4** `payment` ✗ `CartApi`; **D5** `checkout` ✗ `retryQueue` | Composing a child buys the parent exactly what the child offered, and buys the child's siblings nothing. |
| R2 | **Domain helpers and concepts** — owner exposes to descendants | `search` ✓ `SkuRules`, `inventory` ✓ `SkuRules` (readable off `catalog`'s grant flow) | **D1** `checkout` ✗ `SkuRules`; (undrawn) `shop` ✗ `SkuRules` | A grant is bounded by the granter's own subtree, in every direction. |
| R3 | **Application-wide contracts** — the same rule at the app root | `Money`, `formatDate` reach all seven descendants (root grant flow, neutral lane) | *None possible* — and that is the lesson: there is nothing outside the root's subtree to refuse | The root has no special power. It is an ordinary module whose subtree happens to be everything. |
| R4 | **Cross-branch (sibling, cousin) import** — up to the LCA, then down | `cart` ✓ `PaymentApi` (owner `payment`, LCA `checkout`) — a sibling import assembled from two ordinary hops; `shipping` ✓ `ProductId` shows the same shape with LCA = root | **D3** `shipping` ✗ `PaymentApi` | The "lowest common ancestor" rule is not a rule. It is where the up-chain turns into a down-grant, and both halves are ordinary one-level decisions. |
| R5 | **Closed sibling families** — no upward exposure and no ancestor grant; adding a sibling changes nobody's access | `shipping` (a branch that only receives): its existence gives it exactly `shop`'s grants and gives nobody else anything | **D2** `search` ✗ `reserveStock` (the `search`/`inventory` family is closed to itself); **D5** `checkout` ✗ `retryQueue` (closed even to the parent) | Siblings are strangers by default. Growing the tree does not widen anybody's ceiling. |
| R6 | **App-wide child-owned library** — expose-to-parent chain up to the root, then one root grant; the root never becomes the owner | `ProductId`: `catalog` → `shop` → the whole app; `shop`'s node lists it under **holds**, not **owns** | *None* by design; its counter-image is **D4** — `checkout` received `CartApi` and did not pass it on | App-wide reach is earned hop by hop. The router never becomes the owner, and it could have declined. |

### 2.1 Structural properties

| Property | Covered by | How it reads |
| --- | --- | --- |
| **Subdivision invariance** | X4: the dashed what-if note inside `shipping` | Splitting a consuming module changes nothing it may import. Grants address subtrees, not shapes. |
| **Locality** | The rendering itself: every propagation arrow spans exactly one tree edge (an up-hop) or exactly one subtree (a grant). No arrow in the diagram names a module outside the decider's immediate family. | Count the dots on a journey and you have counted the decisions — and every one of them was made by somebody with standing to make it. |

### 2.2 Core-rule coverage

Not rows of the derived table, but load-bearing statements of the model that
the diagram is also responsible for.

| Model statement | Covered by |
| --- | --- |
| Closed by default | The `—` cells of §1.3, and D5 as the drawn extreme case. |
| Rule 1: same owner, no boundary crossed | Legend note only. The diagram's unit is the module; it never draws file-level lines. |
| Exposing to parent cedes routing (single channel) | `ProductId` versus `reserveStock`: identical owner decisions, opposite outcomes, both decided by the parent. |
| Uniform descendant grants / no backflow exclusion | §1.5 footnote and drawn chord A1. |
| No sibling channel, no root privilege, no depth-limited audience | Visible by absence: every arrow in the diagram is either one edge long or covers a whole subtree. The legend states it in one line. |

### 2.3 Every symbol earns its place

| Symbol | The one rule it exists to demonstrate | If removed, the diagram loses |
| --- | --- | --- |
| `Money` | Owner-owned app-wide concept via a root descendant grant (R3) | The simplest possible case, and the baseline against which `ProductId`'s extra hop is legible |
| `formatDate` | That a single decision can carry several symbols (lane bundling) — see X5 | Nothing about the rules; only the evidence that a lane is a decision, not a symbol |
| `ProductId` | Child-owned contract routed to app-wide reach through a consensual chain (R6, R4-at-root) | The only multi-hop journey reaching the whole app; the uniform-grant footnote |
| `SkuRules` | Subtree-scoped grant by a non-root owner (R2) | The bounded-grant case, and the denial D1 |
| `reserveStock` | Expose-to-parent that stops there (R1) | The contrast that makes `ProductId` mean something; the sibling denial D2 |
| `PaymentApi` | Mid-tree turn-around: up one hop, then a bounded grant (R4) | The proof that R4 is altitude-independent; the denial D3 |
| `CartApi` | Holding is not granting; composition is not reciprocal (R1) | The negative image of `PaymentApi`; the denial D4 |
| `retryQueue` | Closed by default; no implicit public surface | The floor of the model; the denial D5 |

---

## 3. Visual language

### 3.1 The one reading rule

Everything below is in service of a single sentence the reader should learn in
the first ten seconds:

> **An arrowhead landing on a module means that module may import that symbol.
> A filled dot means somebody decided.**

Consequences, and they are strict:

- A grant's reach is *shown*, never labelled. If seven nodes may import
  `ProductId`, seven arrowheads land.
- Decision dots appear **once per decision**, never once per hop reached. One
  descendant grant = one dot, however many arrowheads it produces. One
  expose-to-parent = one dot. Counting dots along a symbol's path counts the
  consents that made it legal.

### 3.2 Node anatomy

A node is a rectangle with up to three stacked compartments. Compartments that
would be empty are omitted; the module name is always present.

```text
┌──────────────────────────────┐
│ checkout                     │   name (bold). Root also carries "app root".
├─ owns ───────────────────────┤   symbols this module owns and exports
│ ▲ someSymbol                 │
│ ▼ otherSymbol                │
│ · internalThing              │   grayed: owned, never exposed
├─ holds ──────────────────────┤   symbols received from a direct child
│ ▼ PaymentApi   from payment  │
│ · CartApi      from cart     │   grayed: held, not re-exposed
└──────────────────────────────┘
```

Exposure markers, always to the left of the symbol name:

| Marker | Meaning |
| --- | --- |
| `▲` | exposed to parent |
| `▼` | exposed to descendants |
| `▲▼` | both channels (does not occur in this universe; the marker exists so the vocabulary is complete) |
| `·` (gray) | **no onward exposure.** In `owns`: owned but never exposed (`retryQueue`). In `holds`: received but not re-exposed (`CartApi` at `checkout`). |

Rules for the node body:

- The `holds` compartment always names the providing child (`from payment`).
  This is model content, not mechanics: holding is defined by who passed the
  symbol up, and the `holds`/`owns` split is what makes "the root never
  becomes the owner" visible.
- List only the symbols the diagram uses. A node with no exports shows
  `(nothing exported)` rather than an empty compartment — an absent contract
  is a statement.
- Gray means *stops here*. Nothing gray ever has an arrow attached.

### 3.3 Tree edges

Plain, thin, low-contrast lines between parent and child. **No arrowheads.**
An edge is structure, not flow: it says "parent of", nothing more. Edges are
drawn first and sit visually behind everything else so that the propagation
lanes read as travelling *along* them.

### 3.4 Propagation lanes

The hard constraint from the plan: exposure and grant arrows run **parallel to
and close beside the tree edges**, never as free-floating arrows across the
canvas. A symbol's legality is therefore a path you can follow with a finger,
hop by hop, without ever leaving the tree.

Geometry:

- **Up-hop (expose to parent).** One arrow along one edge, offset to the
  **left** of it. Tail at the child with a filled decision dot; head at the
  parent. Length: the full edge, head touching the parent's box.
- **Grant flow (expose to descendants).** One *branching* path rooted at the
  granting module's bottom edge, running down every edge of its subtree,
  offset to the **right** of each edge. A filled decision dot at the origin
  only. An open chevron head where the flow meets each reached node.
- Left/right assignment is absolute (up-lanes left, down-lanes right), so
  direction is readable even where a label is clipped.
- **Lane stacking.** Where several lanes share an edge, they are offset by a
  constant step outward from the edge, ordered by the depth of their origin —
  shallowest origin nearest the edge. This keeps a given symbol's lane at a
  stable distance from the trunk all the way down its subtree, so it reads as
  one continuous ribbon.
- **Bundling.** Symbols exposed by the *same decision* with the same reach
  share one lane, and the lane's origin chip lists them (`Money · formatDate`).
  A traced symbol (§3.7) never shares a lane, so that its `<g>` layer can be
  isolated.
- Every lane carries a small text chip with the symbol name at its origin and
  at each branch point. Color is redundancy, never the sole carrier of
  identity.

### 3.5 Hop-by-hop chains

A multi-hop journey is drawn as a sequence of *separate* arrows, one per
decision, not as a single long swoosh:

- **`ProductId`.** Arrow 1: `catalog` → `shop`, up-lane, dot at `catalog`.
  Arrow 2 (a different decision, a different dot): the grant flow leaving
  `shop`, branching down all three level-2 edges and on into all four level-3
  edges — seven chevron heads. Two dots, seven arrivals.
- **`PaymentApi`.** Arrow 1: `payment` → `checkout`, up-lane, dot at
  `payment`. Arrow 2: the grant flow leaving `checkout` down both of its
  edges — two chevron heads, one of them landing back on `payment` (uniform
  grants; harmless, since `payment` owns the symbol anyway).
- **`CartApi`.** Arrow 1: `cart` → `checkout`, up-lane, dot at `cart`. **There
  is no arrow 2** — and the absent second arrow is the point. `CartApi` is
  drawn in a traced color precisely so that the reader notices the colored
  ribbon stopping dead at `checkout`, next to `PaymentApi`'s ribbon continuing
  down.

The chain is never abbreviated. If a reader can see a symbol at a node with no
path of arrows leading there, the diagram has lied.

### 3.6 Import chords

Chords are curved arcs between two arbitrary nodes — importer → owner. They
answer "may this specific module import that specific symbol?" and are
visually unlike propagation lanes in every respect: curved rather than
straight, crossing open canvas rather than hugging edges, thinner, and
terminating in a badge rather than a chevron.

| | Allowed chord | Denied chord |
| --- | --- | --- |
| Stroke | solid, in the symbol's color (or neutral) | dashed, denial red |
| Badge | `✓` at the midpoint | `✗` at the midpoint, with a short reason label |
| Ends | arrowhead at the owner | small stop-bar at the owner, plus a gap so the arc visibly fails to connect |
| Routing | short arc, outside the propagation lanes | routed through the lane below the tree for cross-branch pairs; never over a node box |

**Drawing policy — this is what keeps the diagram legible.** A chord is drawn
only where the propagation flow does not already answer the question:

- **Every denial gets a chord** (D1–D5). A refusal has no flow to ride, so it
  must be drawn or it is invisible.
- **Allowed imports are normally read off the flow**, not drawn: the arrowhead
  already landed on the node. Exactly **one** allowed chord is drawn — **A1:
  `search` ✓ `ProductId`** — because it is the one permission whose answer
  surprises (§1.5). It establishes the allowed style and anchors the footnote.
- In the interactive component, selecting a symbol may reveal *all* of its
  allowed chords at once. The static export shows only A1.

Chord routing lanes (below the tree, one row per chord, shortest span nearest
the tree; a chord crossing another is drawn passing under it):

| Chord | From → to | Style |
| --- | --- | --- |
| A1 | `search` → `ProductId` @ `catalog` | allowed, `ProductId` color |
| D5 | `checkout` → `retryQueue` @ `payment` | denied — "never exposed" |
| D2 | `search` → `reserveStock` @ `inventory` | denied — "exposed to the parent only" |
| D3 | `shipping` → `PaymentApi` @ `payment` | denied — "grant covers checkout's subtree" |
| D4 | `payment` → `CartApi` @ `cart` | denied — "held by checkout, not re-exposed" |
| D1 | `checkout` → `SkuRules` @ `catalog` | denied — "grant covers catalog's subtree" |

### 3.7 Tracing and color

**Criterion for tracing** (state it in the legend, it teaches something):

> A symbol is traced — given its own color and its own layer — **iff its reach
> was decided by a module other than its owner.**

Those are exactly the symbols whose legality is a chain rather than a single
decision, and exactly the ones worth following with a finger.

| Symbol | Traced | Role | Suggested light / dark stroke |
| --- | --- | --- | --- |
| `ProductId` | yes | routed all the way: owner → root → everywhere | indigo `#4C6EF5` / `#8DA2FB` |
| `PaymentApi` | yes | routed one level: owner → parent → that subtree | magenta `#C2255C` / `#F783AC` |
| `CartApi` | yes | held and **not** routed: the ribbon that stops | amber `#B45309` / `#FBBF24` |
| `Money`, `formatDate`, `SkuRules`, `reserveStock` | no | single local decisions; one arrow says everything | neutral slate `#475569` / `#94A3B8` |
| `retryQueue` | no | never travels | node gray only, no lane |
| tree edges | — | structure | `#CBD5E1` / `#3F4A5A` |
| denials | — | refusal | red `#DC2626` / `#F87171` |

Rules: color is always redundant with a text chip; hue is never the only
difference between two meanings (propagation is solid and straight, denial is
dashed and curved); all pairs must clear contrast against both page grounds.

Layer structure: one `<g>` per traced symbol (`data-symbol="ProductId"`), one
for the neutral propagation bundle, one for chords, one for the tree, one for
nodes. Selecting a symbol dims every other layer rather than hiding it, so the
tree never reflows.

### 3.8 Legend

Compact, bottom-left, four short groups:

1. **Node** — `▲` exposed to parent · `▼` exposed to descendants · `·` gray:
   goes no further · `owns` vs `holds` (received from a direct child).
2. **Along the edges** — up-hop arrow (one hop, one decision) · grant flow
   (one decision, whole subtree) · **filled dot = a decision was made here** ·
   **arrowhead = this module may import it**.
3. **Across the tree** — ✓ allowed import · ✗ denied import.
4. **Traced contracts** — the three colored chips with the tracing criterion
   in one line, plus two standing notes:
   - *Files inside one module import each other freely; those imports are not
     drawn.*
   - *There is no sibling channel and no root privilege. Every arrow here is
     either one edge long, or covers one whole subtree.*

### 3.9 Layout budget (starting values for Iteration 3)

- Canvas ≈ 1040 × 720 at 1×; legible down to ~820 CSS px, horizontally
  scrollable below that rather than scaled under legibility.
- Node box: min width 150 px, +8 px per character over the widest content
  line; 22 px header, 18 px per symbol row.
- Horizontal gap between sibling boxes ≥ 48 px — driven by lane stacking:
  the worst edge in this universe carries **four** lanes (`catalog`→`inventory`
  and `checkout`→`payment`: three grant lanes plus one up-hop).
- Lane offset 7 px from the edge, 7 px step between stacked lanes.
- Chord lane below the tree: 6 rows at 16 px, ordered by span.
- Level spacing ≥ 96 px so up-hop labels and grant-origin chips have room
  between boxes.

---

## 4. ASCII mock

Three panels. The real diagram draws all of them at once, as layers; the split
here is how the layers stack, and it is also how the interactive layer toggles
will work.

**ASCII stand-ins** (the real glyphs are in §3.2/§3.4): `│ ─ ┌ ┴ ┬ ┐` = tree
edge · `|` = propagation lane shaft · `^` = up-hop arrowhead · `v` = grant
chevron · `o` = decision dot · `▲▼·` become `^ v -` inside node boxes ·
one-letter lane chips: `m` = `Money`+`formatDate`, `P` = `ProductId`,
`s` = `SkuRules`, `r` = `reserveStock`, `A` = `PaymentApi`, `C` = `CartApi`.
ASCII shows propagation only on the vertical run of each edge; the SVG follows
the whole edge including its elbow.

### 4.1 Panel A — structure and propagation (the base layer)

```text
                                       ┌────────────────────────────────┐
                                       │ shop                  app root │
                                       ├─ owns ─────────────────────────┤
                                       │ v Money                        │
                                       │ v formatDate                   │
                                       ├─ holds ────────────────────────┤
                                       │ v ProductId       from catalog │
                                       └────────────────────────────────┘
                      shop grants to its whole subtree: │oo
                  m = Money, formatDate    P = ProductId│mP
                    ┌───────────────────────────────────┴────────┬───────────────────────────┐
                   ^│||                                          │||                         │||
         ProductId P│mP                                          │mP                         │mP
 (catalog decides) o│vv                                          │vv                         │vv
        ┌───────────────────────┐                 ┌─────────────────────────────┐   ┌────────────────────┐
        │ catalog               │                 │ checkout                    │   │ shipping           │
        ├─ owns ────────────────┤                 ├─ holds ─────────────────────┤   ├─ owns ─────────────┤
        │ ^ ProductId           │                 │ v PaymentApi   from payment │   │ (nothing)          │
        │ v SkuRules            │                 │ - CartApi         from cart │   ├╌ what-if ╌╌╌╌╌╌╌╌╌╌┤
        └───────────────────────┘                 └─────────────────────────────┘   │ split into rates   │
                    │||o s = SkuRules -> catalog's subtree       │||o A = PaymentApi│ + labels: both     │
                    │mPs                                         │mPA -> checkout's │ keep exactly       │
        ┌───────────┴──────────┐                     ┌───────────┴──────────┐       │ these imports      │
        │|||                  ^│|||                 ^│|||                  ^│|||    └────────────────────┘
        │mPs     reserveStock r│mPs         CartApi C│mPA       PaymentApi A│mPA
        │vvv                  o│vvv                 o│vvv                  o│vvv
┌────────────────┐   ┌───────────────────┐   ┌────────────────┐   ┌───────────────────┐
│ search         │   │ inventory         │   │ cart           │   │ payment           │
├─ owns ─────────┤   ├─ owns ────────────┤   ├─ owns ─────────┤   ├─ owns ────────────┤
│ (nothing)      │   │ ^ reserveStock    │   │ ^ CartApi      │   │ ^ PaymentApi      │
└────────────────┘   └───────────────────┘   └────────────────┘   │ - retryQueue      │
                                                                  └───────────────────┘
```

Read it by counting dots (`o`). There are five in the whole picture, and they
are the entire access policy of the application:

1. `shop` grants `Money`, `formatDate`, `ProductId` to its subtree.
2. `catalog` exposes `ProductId` to its parent.
3. `catalog` grants `SkuRules` to its subtree.
4. `inventory` exposes `reserveStock` to its parent · `cart` exposes
   `CartApi` to its parent · `payment` exposes `PaymentApi` to its parent
   (three dots on the bottom row).
5. `checkout` grants `PaymentApi` to its subtree.

Note what has no dot and no lane: `retryQueue` in `payment`, and `CartApi`
inside `checkout`'s `holds` compartment. Both are marked `-`. Nothing gray
ever moves.

### 4.2 Panel B — import chords (allowed and denied)

Node boxes collapsed to names so the chord routing is judgeable. Chords drop
from the importing and owning nodes into lanes below the tree; `┼` marks one
chord passing under another.

```text
                                                    ┌──────┐
                                                    │ shop │
                                                    └──────┘
                                                        │
                    ┌───────────────────────────────────┴────────┬───────────────────────────┐
                    │                                            │                           │
               ┌─────────┐                                 ┌──────────┐                ┌──────────┐
               │ catalog │                                 │ checkout │                │ shipping │
               └─────────┘                                 └──────────┘                └──────────┘
                ┊ ┊ │                                       ┊ ┊  │                           ┊
        ┌───────┼─┼─┴──────────┐                     ┌──────┼─┼──┴──────────┐                ┊
        │       ┊ ┊            │                     │      ┊ ┊             │                ┊
   ┌────────┐   ┊ ┊      ┌───────────┐           ┌──────┐   ┊ ┊        ┌─────────┐           ┊
   │ search │   ┊ ┊      │ inventory │           │ cart │   ┊ ┊        │ payment │           ┊
   └────────┘   ┊ ┊      └───────────┘           └──────┘   ┊ ┊        └─────────┘           ┊
      ┊ ┊       ┊ ┊            ┊                   ┊        ┊ ┊           ┊ ┊ ┊              ┊
      ┊ ╰──(+1)─┼─╯            ┊                   ┊        ╰─┼───(x2)────┼─╯ ┊              ┊
      ╰─────────┼(x3)──────────╯                   ┊          ┊           ╰───┼──(x4)────────╯
                ┊                                  ╰──────────┼(x5)───────────╯
                ╰────────────────────(x6)─────────────────────╯
```

| Badge | Chord | Verdict and reason |
| --- | --- | --- |
| `(+1)` | `search` → `ProductId` @ `catalog` | **✓ A1.** `catalog` granted nothing downward — `shop` sent it back down into every branch, this one included. |
| `(x2)` | `checkout` → `retryQueue` @ `payment` | **✗ D5.** Never exposed. Not even a parent has an implicit surface. |
| `(x3)` | `search` → `reserveStock` @ `inventory` | **✗ D2.** Exposed to the parent only; there is no sibling channel. |
| `(x4)` | `shipping` → `PaymentApi` @ `payment` | **✗ D3.** `checkout` granted it to `checkout`'s subtree, and passed it no higher. |
| `(x5)` | `payment` → `CartApi` @ `cart` | **✗ D4.** `checkout` holds it and chose not to re-expose it. Holding is not granting. |
| `(x6)` | `checkout` → `SkuRules` @ `catalog` | **✗ D1.** A grant never leaves the granter's subtree. |

In the real diagram each badge carries its reason inline along the arc, in
denial red; the numbered key exists only because ASCII has no room.

### 4.3 Panel C — focus view (one traced symbol)

What clicking `ProductId` in the legend produces: its two `<g>` layers stay
lit, everything else dims. The static export ships Panel A + Panel B composited;
Panel C is the interactive state and the shape of the site's walkthrough.

```text
                                       ┌────────────────────────────────┐
                                       │ shop                           │
                                       ├─ holds ────────────────────────┤
                                       │ v ProductId       from catalog │
                                       └────────────────────────────────┘



           decision 2: shop re-exposes ProductId        │o
                     to its whole subtree               │P
                    ┌───────────────────────────────────┴────────┬───────────────────────────┐
                   ^│|                                           │|                          │|
         ProductId P│P                                           │P                          │P
      (decision 1) o│v                                           │v                          │v
        ┌───────────────────────┐                 ┌─────────────────────────────┐   ┌────────────────────┐
        │ catalog               │                 │ checkout                    │   │ shipping           │
        ├─ owns ────────────────┤                 ├─────────────────────────────┤   ├────────────────────┤
        │ ^ ProductId           │                 │ may import P                │   │ may import P       │
        └───────────────────────┘                 └─────────────────────────────┘   └────────────────────┘

                    │|                                           │|
                    │P                                           │P
        ┌───────────┴──────────┐                     ┌───────────┴──────────┐
        │|                     │|                    │|                     │|
        │P                     │P                    │P                     │P
        │v                     │v                    │v                     │v
┌────────────────┐   ┌───────────────────┐   ┌────────────────┐   ┌───────────────────┐
│ search         │   │ inventory         │   │ cart           │   │ payment           │
├────────────────┤   ├───────────────────┤   ├────────────────┤   ├───────────────────┤
│ may import P   │   │ may import P      │   │ may import P   │   │ may import P      │
└────────────────┘   └───────────────────┘   └────────────────┘   └───────────────────┘

  Two decisions, two dots. Everything below shop may import ProductId --
  including search, in catalog's own branch (uniform grants: no backflow exclusion).
```

### 4.4 Density findings from the mock

Recorded now so Iteration 3 does not rediscover them:

1. **Four lanes is the ceiling, and this universe hits it.** The
   `catalog`→`inventory` and `checkout`→`payment` edges each carry three grant
   lanes plus one up-hop. At 7 px steps that is a 28 px ribbon beside a single
   edge, which fixes the minimum sibling gap at ~48 px. Any further symbol
   added to the universe should be checked against this number first.
2. **The grant bundle is what saves it.** Merging `Money`+`formatDate` into
   one lane removes a fifth lane from every edge in the tree. Bundling is not
   cosmetic; treat it as a layout requirement.
3. **Level-2 label gutters are the tightest space on the canvas**, not the
   lanes. In the mock, `catalog`'s and `checkout`'s grant-origin chips have
   ~35 and ~14 columns respectively before they collide with the next box.
   In SVG this means grant-origin chips must be allowed to wrap to two lines
   and must be placed on the side away from the nearest sibling box.
4. **Six chords need four routing lanes** and produce three crossings. That is
   at the readable limit. It is why the drawing policy admits only one allowed
   chord; adding two or three more (as the interactive reveal will) requires
   dimming the rest of the diagram, not just adding lanes.
5. **`shipping`'s what-if note (X4) is the first thing to cut** if the picture
   feels crowded. It sits in dead space to the right in the mock, but it is
   also the only element that is not part of the declared universe.
6. **Two vertical line weights must be genuinely different.** In ASCII the
   tree edge (`│`) and the lane shaft (`|`) are nearly indistinguishable, and
   the mock is harder to read for it. In SVG the tree edge must be visibly
   lighter and thinner than every propagation lane, or the "arrows travel
   along the edges" idea collapses into a bundle of parallel pipes.
7. **The node `holds` compartment carries a lot of the teaching load** —
   `checkout` showing `▼ PaymentApi` above `· CartApi` is the single most
   informative element in the picture. Give it typographic room; do not
   compress the compartment separators away.

---

## 5. Open questions — resolved in review

Resolved 2026-08-31 (plan Iteration 1 review gate). Iteration 3 implements
these as decided; do not reopen without new evidence from the rendered
diagram.

1. **What-if annotation (X4): keep.** It is the only witness for subdivision
   invariance and costs no layout space. It remains the designated first cut
   (density finding 5) if the rendered picture is crowded.
2. **Traced symbols: all three.** `CartApi` stays traced — the colored ribbon
   stopping dead at `checkout`, directly beside `PaymentApi`'s ribbon
   continuing down, is the lesson, and it only reads if the two ribbons are
   comparable in kind.
3. **`formatDate`: keep.** Bundling is a layout requirement (density finding
   2), and the bundled chip is the evidence that a lane carries a decision,
   not a symbol.
4. **`shop` ✗ `SkuRules`: fixture-only, not drawn.** Six chords is already
   the readable limit (density finding 4); D1 teaches the same rule.
