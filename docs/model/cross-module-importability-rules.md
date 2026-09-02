# Cross-Module Importability Rules

**Status:** Analysis - minimal importability core

**Date:** 2026-08-31

**Scope:** The minimum set of rules that decides, for any symbol and any source
file, whether that file **could** legally import that symbol.

**Relationship:** This document is the model specification implemented by
ramify.ts. It extracts and simplifies the access model in
[Parent-Governed Recursive Module Access](../../../docs/analysis/2026-08-30-parent-governed-recursive-module-access.md)
(host-repository history; where the two disagree, this document reflects the
newer decision direction). Named surfaces, re-exposure syntax and enforcement
architecture remain in those earlier documents; tags appear here only
insofar as they restrict who may import a symbol. The application of this
model to cucumber-viz - coverage of the current enforcement rules, required
restructurings and migration consequences - lives in
[Importability Rules: cucumber-viz Coverage](../../../docs/analysis/2026-08-31-importability-rules-cucumber-viz-coverage.md);
this document stays application-agnostic. Vocabulary is defined in the
[Glossary](glossary.md): module, file, own, receive, visible, reach, expose,
available, tagged, testing module, browser module. This document uses those
terms and does not redefine them.

## What this document is not about

This document answers exactly one question:

> Given a source file belonging to module `S` and a symbol owned by module
> `T`, MAY that file import that symbol?

It deliberately does **not** cover:

- **Dependency tracking.** Whether a module declares a dependency, whether an
  import is actually present in source, and how observed imports are indexed
  are separate concerns. Importability defines the permitted ceiling; it says
  nothing about who actually imports what.
- **Import mechanics.** Import specifiers, generated facades or barrels,
  re-export versus direct access, TypeScript resolution and how any of this is
  enforced are implementation questions. Nothing here assumes a particular
  mechanism.
- **Grouping and surface mechanics.** Named surfaces, generated facades and
  any tag-driven grouping of exposed symbols into importable views are
  mechanism concerns. Tags appear below only insofar as they change who may
  import a symbol; how tagged symbols are grouped, spelled or emitted does
  not.
- **Same-owner imports.** This project concerns cross-module imports only.
  Files inside one owner import each other freely, and whether they
  internally respect platform or test/production separation is the owner's
  business - build tooling or separate lints may cover it; this model does
  not.

The goal is the smallest rule set that covers the access relationships
cucumber-viz actually needs, so that every later feature is judged as an
addition to this core rather than a peer of it.

## The ownership tree

- A module exists only by declaration. Declared modules form a tree with one
  explicit application root; every other module has exactly one parent.
- Every source file has exactly one deepest owning module.
- Files inside one owner import each other freely. No module boundary is
  crossed and, per the scope above, nothing in this document applies.
- Everything else is **closed by default**. A cross-owner import is legal only
  if some chain of the exposure rules below authorizes it.

## Exposure primitives

A module can expose **any symbol visible in it** - owned or received -
through exactly two channels:

1. **Expose to parent.** The symbol becomes visible in the direct parent.
2. **Expose to descendants.** The symbol becomes visible in every module
   of the exposing module's subtree.

That is the entire mechanism. There is no sibling channel, no root privilege,
no depth-limited audience and no way to receive onward-exposure authority
from a parent (an exposure to descendants already reaches every depth, so
nothing would be gained). Exposing a symbol the module does not own may be
called **re-exposing**, but re-exposing is not a distinct mechanism.

Re-exposure is consensual: a re-exposed symbol travels one hop at a time, and
a grandchild contract becomes available at the app root only if every
intermediate module chose to expose it further up.

**Exposing to parent is a single channel that cedes onward exposure.** The
parent may compose with the symbol and may re-expose it through its own two
channels; there is no "composition-only, do not re-expose" variant. A
contract the child does not want re-exposed further is a conversation with
the parent architect, not a mechanism.

### Backflow: exposure to descendants is uniform

An exposure to descendants reaches the **entire** subtree of the exposing
module, including the branch a re-exposed symbol originally came up through.

The rejected alternative ("no backflow") would have excluded the providing
branch, so that a family could keep a symbol app-wide yet forbidden between
its own children. That was rejected for two reasons. First, it contradicts
the single-channel decision above: exposing a symbol to the parent cedes its
onward exposure entirely; a residual veto over one region of the tree would
claw part of that authority back. Second, the only configuration where the
rules diverge - a symbol both application-wide and sibling-restricted inside
its own family - is rare and low-stakes (app-wide symbols are vocabulary;
sibling restrictions target machinery), and does not justify provenance
tracking on re-exposed symbols. A family that wants that combination
resolves it by not exposing the symbol to its parent.

### Redundant exposure

Because exposure is gated on visibility rather than on a chain-of-custody
concept, some exposures are legal but inert: they change no module's
visibility. Re-exposing a symbol received from a proper ancestor's exposure
to descendants is always redundant - the re-exposer's own subtree is already
covered by that exposure, every module on the path up to that ancestor lies
inside its subtree and already has the symbol, and carrying it above that
ancestor always requires the ancestor's own expose-to-parent decision, which
nobody below can make for it. Redundant exposures deserve a diagnostic, never
an error.

## The importability rule

> A file may import a symbol iff the symbol is **available** in the file's
> module: **visible** there, and withheld by no tag-based availability rule.
> A symbol is visible in a module if the module owns it, or it is exposed to
> it - by a direct child exposing it to its parent, or by a proper ancestor
> exposing it to its descendants.

Nothing else creates visibility, and with no tags declared, available and
visible coincide (the tag-based availability rules are the "Contextual
rules" section below). Expanded, a file belonging to module `S` may import
symbol `c` owned by module `T` iff every applicable availability rule is
satisfied and:

1. `S = T` (same owner - no boundary crossed); or
2. a direct child of `S` exposed `c` to `S`; or
3. a proper ancestor of `S` exposed `c` to its descendants.

## Derived behavior

The familiar access cases are consequences, not additional rules:

| Case | Derivation |
| --- | --- |
| Parent composes a direct child | Child exposes to parent (rule 2). Not reciprocal. |
| Domain helpers and concepts | Owner exposes to descendants (rule 3 with `P` = the helper's owner). |
| Application-wide contracts | The same rule applied at the app root, which is an ordinary module whose subtree happens to be the whole application. |
| Cross-branch (sibling, cousin) import | The owner exposes to its parent, and each module above re-exposes to its parent, until the symbol is visible in the lowest common ancestor; the LCA exposes it to its descendants. The LCA rule of the earlier document is therefore a theorem here: it is exactly the point where the flow turns from up to down, and every hop is a one-level decision by the module that owns that hop. |
| Closed sibling families | With no exposure to the parent and no exposure to descendants from an ancestor, rules 2 and 3 never fire. Creating a new sibling changes nobody's access. |
| App-wide child-owned library | Chain of expose-to-parent up to the root, then one exposure to descendants at the root. The root never becomes the owner. |

Two structural properties worth preserving through every later refinement:

- **Subdivision invariance.** Exposures to descendants are insensitive to how a
  consuming branch is internally organized. Splitting a module into
  submodules never changes what the new submodules may import from outside.
- **Locality.** Every exposure decision is made by a module the symbol is
  available in, about exactly one hop (its parent) or its own subtree. No decision
  ever names a module outside the decider's immediate family.

## Contextual rules: tags and their availability rules

Two real use cases are not expressible with the tree rules alone:

- **Testing.** Integration and cross-module tests need deliberately selected
  internals of a module (fakes, in-memory stores, reset hooks) that must
  never become importable by production code.
- **Browser compatibility.** Code that runs in the browser must only import
  symbols whose runtime closure is browser-safe.

Both reduce to the same shape: a fact about the **importing module** and a
fact about the **exposed symbol** must be compatible, in addition to the
tree rules. The core therefore gains one mechanism: **tags**. A tag is not
just a name - when a tag is defined, it is associated with its availability
rule, and it always carries it (glossary: "Tag-associated availability
rule"). The same tag names are assigned in two positions:

### Tags on symbols and on modules

- **Symbol tagging.** The owner assigns a tag set to each symbol it owns
  (empty by default). The assignment is immutable: the tags travel with the
  symbol through every exposure and re-exposure, and no module along the
  way can add, remove or change one.
- **Module tagging.** A module may assign tags to itself in its module
  definition, classifying its files - a **testing module**'s files are
  tests, a **browser module**'s files run in a browser (glossary: "`testing`
  tag", "`browser` tag"). A module may also
  classify file subtrees the same way (declared importer contexts:
  co-located tests, a domain's feature-test tree). Classification is always
  declared; a file never gains privileges because its name matches a
  test-like or client-like pattern.

### Availability rules

The tag-based availability rules define which combinations of module and
symbol tags make an exposed symbol available (glossary: "Tag-based
availability rules"). There are two kinds, and each tag's definition says
which it carries:

- **Required module tag** (`⇥`) - if the symbol has the tag, it is available
  from exposure only in modules carrying the same tag. In force for both
  import forms: the rule polices coupling, and a type-only import creates the
  dependency just as surely as a value import.
- **Required symbol tag** (`⇤`) - if the module has the tag, the only
  symbols visible from exposure that are available in it are those carrying
  the same tag. In force for value imports only: the rule polices the
  module's runtime, and a type-only import is erased before any runtime
  exists.

The import-form scope is intrinsic to the rule kind, not a parameter: a
rule's scope follows from its claim - coupling claims cover both forms,
runtime claims cover value imports only. (Future tags may force other
combinations; none of the built-ins does.) When several rules apply to the
same symbol and module, all of them must be satisfied. A tag definition may
set only these parameters:

| Parameter | Meaning |
| --- | --- |
| `requires` | The tag's availability rule: tags required on the other side of the import. In symbol position this is a required module tag; in module position, a required symbol tag. |
| `exclusive` | Whether the tag may be combined with the default contract channel. |
| `symbols-default-to` | Module position only: symbols owned by this module default to the given symbol tag. |
| `verify` | An externally checked proof obligation attached to the tag's factual claim. Verification is not an importability rule; a false claim is the owner's error, reported at the owner. |

**Tags are purely restrictive.** They never expose a symbol, and so never
change what is visible. The complete rule:

> An exposed symbol is available in a module iff the tree rules make it
> visible there AND every availability rule of every tag involved - on the
> symbol and on the importing module - is satisfied.

This adds one term to the core vocabulary: an import binding is a **type**
import or a **value** import, because platform requirements exempt erased
type-only imports while testing requirements do not.

### Instance: testing

```yaml
tags:
  testing:
    on-symbols: { requires: [testing], exclusive: true }
    on-modules: { symbols-default-to: testing }
```

- A module curates its test-support exposures by exposing selected internals
  tagged `testing`; tests never receive blanket private access.
- `testing` is exclusive with the default channel: a symbol is part of
  the real contract or test support, never ambiguously both.
- `testing` symbols travel through the ordinary exposure channels. Exposing
  them to descendants is safe at any subtree width, because the availability
  rule withholds the symbol from untagged modules everywhere the exposure
  reaches - so a parent may expose all received test support to its
  descendants without risk, while a domain keeps its fakes domain-internal
  by simply not exposing them to its parent.
- Everything a testing module exposes is implicitly `testing`; test
  infrastructure can never enter a production ceiling.
- Integration tests belong under the lowest common ancestor whose
  composition they exercise - as a test context owned by that module, or as
  a testing module directly beneath it. Rule 2 (with the ancestor's
  exposures to descendants) then provides exactly the composition surfaces
  they need, with no further mechanism. The child-module form additionally
  needs the ancestor to expose its default-channel composition surfaces to
  its descendants, which examples keep safe by exposing everything received;
  exclusivity forbids re-tagging real contracts as test support either way.

### Instance: browser compatibility

```yaml
tags:
  browser:
    on-symbols: { verify: browser-closure }
    on-modules: { requires: [browser] }
```

- A browser module may value-import only `browser` symbols, among those the
  tree rules already make visible. Type-only imports pass freely because
  they are erased at runtime.
- `browser` on an exposed symbol is a falsifiable promise about the symbol's entire
  transitive runtime closure, including the owner's private files. The
  importability decision consults only the declared tag; the daemon proves
  the promise separately and reports a false tag at the owning module. The
  closure walk enters private files only as evidence for this cross-module
  promise; it imposes no rule on same-owner imports.
- The browser line is drawn per symbol, not per file: a module never has to
  split files to separate browser-safe from Node-only code.

### Rejected: global reach

An earlier draft gave `testing` a `reach: global` parameter so that
every testing module could import every test-support symbol without exposure
chains. It was rejected: it would puncture the consent-chain principle for
one case, create a second kind of tag semantics (exposing rather than
restricting) and silently make every test fake application-wide test API,
coupling distant tests to internals their owners never exposed to them.
Reaching a test through the tree costs one re-exposure line per hop - the
same ceremony as any cross-branch contract, surfaced by the same diagnostics.

### Built-ins only

The parameter schema is general, but the model ships with exactly the tags
defined above. Project-declared tags are inert classification for search and
documentation; they carry no importability semantics. A project-configurable
access-rule language would turn effective project law into per-repository
policy every agent must interpret; the complexity cap outweighs the
flexibility.

## Deliberately absent features

Rejected for the core, with the reasoning recorded so they are not
accidentally reintroduced:

- **Direct-children-only exposure.** No significant use case survived
  examination. The candidate - parent-defined contracts that direct children
  implement to participate in composition - does not need it, because
  importing a type confers no ability to participate: participation flows
  upward through exposure to parent, which the intermediate child still
  controls. Depth-1 exposures are also subdivision-variant (reorganizing a
  consumer breaks its access) and would force a new "relay a parent-provided
  exposure to one's own descendants" mechanism to recover expressiveness,
  making the model larger, not smaller. Precedent agrees: visibility systems
  offer parent-relative (`pub(super)`) and subtree scopes, not depth-limited
  ones.
- **Branch-targeted exposure** ("expose to descendants, but only branch X").
  Consumer-side restriction inside a receiving branch is that branch's own
  parents' business.
- **Sibling or cousin channels.** Reduced to up-then-down chains through the
  responsible ancestors.
- **Root privileges.** The app root has no special rule in either direction;
  it is only the module whose exposures to descendants happen to be
  application-wide.
- **Consumer dependency declarations.** Real, but a dependency-tracking
  concern, not an importability concern. Out of scope by the definition at
  the top.

This also answers open question 1 of the parent-governed document: a parent
may compose only what a child explicitly exposes to it. There is no implicit
"public surface" that parents can always consume; exposure to parent **is**
the declaration.

## Decided

- **Single channel to the parent.** Expose-to-parent always cedes onward
  exposure; there is no composition-only variant.
- **Uniform exposure to descendants.** An exposure to descendants reaches the
  whole subtree; there is no backflow exclusion and no provenance tracking on
  re-exposed symbols.
- **No rule is type-only.** The import-form scope is intrinsic to the rule
  kind - required module tags cover both forms, required symbol tags cover
  value imports only - so nothing can ever forbid a type import while
  allowing the value import. Available therefore always implies
  type-available, by construction, and the unqualified "available" safely
  means the strong (value) form.
- **Tags are purely restrictive.** A tag's availability rules gate imports
  on top of the tree rules; no tag ever adds reach (glossary: "Reach";
  `reach: global` rejected), and no tag ever changes what is visible.
- **Test access follows the tree and is tag-gated.** There is no global test
  channel: `testing` support travels the ordinary exposure channels, and it
  is available only in testing modules and declared test contexts.

All decisions follow one meta-rule: maximum simplicity unless a very
concrete case forces a complication.

## Open questions

1. **Unit of exposure.** This document assumes the unit is the individual
   symbol. Grouping mechanisms (tags defining generated surfaces)
   are layered on top and must not change the answer of the importability
   rule, only how membership is spelled.
2. **Multi-application repositories.** Whether a repository needs a
   non-module workspace scope above several app roots is inherited unchanged
   from the parent-governed document.
