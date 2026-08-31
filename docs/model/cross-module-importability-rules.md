# Cross-Module Importability Rules

**Status:** Analysis — minimal importability core

**Date:** 2026-08-31

**Scope:** The minimum set of rules that decides, for any symbol and any source
file, whether that file **could** legally import that symbol.

**Relationship:** This document is the model specification implemented by
ramify.ts. It extracts and simplifies the access model in
[Parent-Governed Recursive Module Access](../../../docs/analysis/2026-08-30-parent-governed-recursive-module-access.md)
(host-repository history; where the two disagree, this document reflects the
newer decision direction). Named surfaces, routing syntax and enforcement
architecture remain in those earlier documents; exposure tags appear here only
insofar as they restrict who may import a symbol. The application of this
model to cucumber-viz — coverage of the current enforcement rules, required
restructurings and migration consequences — lives in
[Importability Rules: cucumber-viz Coverage](../../../docs/analysis/2026-08-31-importability-rules-cucumber-viz-coverage.md);
this document stays application-agnostic. Vocabulary is defined in the
[Glossary](glossary.md): module, file, own, available, expose. This document
uses those terms and does not redefine them.

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
  mechanism concerns. Exposure tags appear below only insofar as they change who may
  import a symbol; how tagged symbols are grouped, spelled or emitted does
  not.
- **Same-owner imports.** This project concerns cross-module imports only.
  Files inside one owner import each other freely, and whether they
  internally respect platform or test/production separation is the owner's
  business — build tooling or separate lints may cover it; this model does
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

A module can expose **any symbol available in it** — owned or received —
through exactly two channels:

1. **Expose to parent.** The symbol becomes available in the direct parent.
2. **Expose to descendants.** The symbol becomes available in every module
   of the exposing module's subtree.

That is the entire mechanism. There is no sibling channel, no root privilege,
no depth-limited audience and no way to receive routing authority from a
parent (a descendant grant already reaches every depth, so nothing would be
gained). Exposing a symbol the module does not own may be called
**re-exposing**, but re-exposing is not a distinct mechanism.

Routing is consensual: a routed symbol travels one hop at a time, and a
grandchild contract becomes available at the app root only if every
intermediate module chose to expose it further up.

**Exposing to parent is a single channel that cedes routing.** The parent may
compose with the symbol and may re-expose it through its own two channels;
there is no "composition-only, do not re-expose" variant. A contract the
child does not want routed further is a conversation with the parent
architect, not a mechanism.

### Backflow: descendant grants are uniform

A descendant grant reaches the **entire** subtree of the granting module,
including the branch a re-exposed symbol originally came up through.

The rejected alternative ("no backflow") would have excluded the providing
branch, so that a family could keep a symbol app-wide yet forbidden between
its own children. That was rejected for two reasons. First, it contradicts
the single-channel decision above: exposing a symbol upward cedes its further
routing entirely; a residual veto over one region of the tree would claw part
of that authority back. Second, the only configuration where the rules
diverge — a symbol both application-wide and sibling-restricted inside its
own family — is rare and low-stakes (app-wide symbols are vocabulary;
sibling restrictions target machinery), and does not justify provenance
tracking on routed symbols. A family that wants that combination resolves it
by not exposing the symbol upward.

### Redundant exposure

Because exposure is gated on availability rather than on a chain-of-custody
concept, some exposures are legal but inert: they change no module's
availability. Re-exposing a symbol received through an ancestor's grant is
always redundant — the exposer's own subtree is already covered by that
grant, every module on the upward path lies inside the granter's subtree and
already has the symbol, and carrying it above the granter always requires
the granter's own expose-to-parent decision, which nobody below can make for
it. Redundant exposures deserve a diagnostic, never an error.

## The importability rule

> A file may import a symbol iff the symbol is **available** in the file's
> module. A symbol is available in a module if the module owns it, or it is
> exposed to it — by a direct child exposing it to its parent, or by a
> proper ancestor exposing it to its descendants.

Nothing else grants availability. Expanded, a file belonging to module `S`
may import symbol `c` owned by module `T` iff:

1. `S = T` (same owner — no boundary crossed); or
2. a direct child of `S` exposed `c` to `S`; or
3. a proper ancestor of `S` exposed `c` to its descendants.

## Derived behavior

The familiar access cases are consequences, not additional rules:

| Case | Derivation |
| --- | --- |
| Parent composes a direct child | Child exposes to parent (rule 2). Not reciprocal. |
| Domain helpers and concepts | Owner exposes to descendants (rule 3 with `P` = the helper's owner). |
| Application-wide contracts | The same rule applied at the app root, which is an ordinary module whose subtree happens to be the whole application. |
| Cross-branch (sibling, cousin) import | The owner exposes upward hop by hop until it is available in the lowest common ancestor; the LCA exposes it to its descendants. The LCA rule of the earlier document is therefore a theorem here: it is exactly the point where the flow turns from up to down, and every hop is a one-level decision by the module that owns that hop. |
| Closed sibling families | With no upward exposure and no ancestor grant, rules 2 and 3 never fire. Creating a new sibling changes nobody's access. |
| App-wide child-owned library | Chain of expose-to-parent up to the root, then one root descendant grant. The root never becomes the owner. |

Two structural properties worth preserving through every later refinement:

- **Subdivision invariance.** Descendant grants are insensitive to how a
  consuming branch is internally organized. Splitting a module into
  submodules never changes what the new submodules may import from outside.
- **Locality.** Every exposure decision is made by a module the symbol is
  available in, about exactly one hop (its parent) or its own subtree. No decision
  ever names a module outside the decider's immediate family.

## Contextual rules: importer contexts and exposure tags

Two real use cases are not expressible with the tree rules alone:

- **Testing.** Integration and cross-module tests need deliberately selected
  internals of a module (fakes, in-memory stores, reset hooks) that must
  never become importable by production code.
- **Browser compatibility.** Code that runs in the browser must only import
  symbols whose runtime closure is browser-safe.

Both reduce to the same shape: a fact about the **importing context** and a
fact about the **exposed symbol** must be compatible, in addition to the
tree rules. The core therefore gains one mechanism built on two
classification primitives.

### Importer contexts

An importer context is a declared, structural classification of importing
code, carrying context tags:

- a module may declare file subtrees as **test contexts** (co-located tests,
  a domain's feature-test tree), and a module may itself be a declared test
  module; and
- modules or file subtrees are classified by **execution platform** — for
  example, an application's UI trees are browser contexts.

Classification is always declared. A file never gains privileges because its
name matches a test-like or client-like pattern.

### Exposure tags

A symbol a module exposes may carry tags. A tag definition may set only
these parameters:

| Parameter | Meaning |
| --- | --- |
| `requires` | Tags required on the other side of the import. The direction is determined by the declaring side: an exposure tag can only require context tags, and a context tag can only require exposure tags. |
| `applies-to` | Whether the requirement applies to all imports or only to value imports (type-only imports are erased at runtime). |
| `exclusive` | Whether the tag may be combined with the default contract channel. |
| `exposures-default-to` | Context tags only: symbols exposed from this context default to the given exposure tag. |
| `verify` | An externally checked proof obligation attached to the tag's factual claim. Verification is not an importability rule; a false claim is the owner's error, reported at the owner. |

**Tags are purely restrictive.** They never grant access. The complete
importability rule is one conjunction:

> A file may import a symbol iff the tree rules allow it AND every
> cross-requirement of every tag involved — on the exposed symbol and on the
> importer's context — is satisfied.

This adds one term to the core vocabulary: an import binding is a **type**
import or a **value** import, because platform requirements exempt erased
type-only imports while testing requirements do not.

### Instance: testing

```yaml
exposure-tags:
  testing_only: { exclusive: true, requires: [test], applies-to: all }

context-tags:
  test: { exposures-default-to: testing_only }
```

- A module curates its test-support exposures by exposing selected internals
  tagged `testing_only`; tests never receive blanket private access.
- `testing_only` is exclusive with the default channel: a symbol is part of
  the real contract or test support, never ambiguously both.
- `testing_only` symbols travel through the ordinary exposure channels. Any
  grant breadth is safe, because the cross-requirement blocks production
  importers everywhere the grant reaches — so a parent may blanket-grant
  received test support to its whole subtree without risk, while a domain keeps its
  fakes domain-internal by simply not routing them higher.
- Everything a declared test module exposes is implicitly `testing_only`;
  test infrastructure can never enter a production ceiling.
- Integration tests belong to the lowest common ancestor whose composition
  they exercise, as a test context owned by that module. Rule 2 then provides
  exactly the composition surfaces they need, with no further mechanism. A
  declared child test module under that ancestor is possible but strictly
  weaker: the ancestor can grant its received `testing_only` symbols downward
  (safe at any breadth), but it cannot hand the child its default-channel
  composition surfaces without granting them to every descendant branch — and
  exclusivity forbids re-tagging real contracts as test support. Ancestor-owned
  test contexts are therefore the recommended structure for integration
  tests.

### Instance: browser compatibility

```yaml
exposure-tags:
  browser: { verify: browser-closure }

context-tags:
  browser: { requires: [browser], applies-to: value-imports }
```

- A browser context may value-import only browser-tagged symbols, among
  those the tree rules already allow. Type-only imports pass freely because
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

An earlier draft gave `testing_only` a `reach: global` parameter so that
every test context could import every test-support symbol without exposure
chains. It was rejected: it would puncture the consent-chain principle for
one case, create a second kind of tag semantics (granting rather than
restricting) and silently make every test fake application-wide test API,
coupling distant tests to internals their owners never routed to them. Tree
routing costs one re-exposure line per hop — the same ceremony as any
cross-branch contract, surfaced by the same diagnostics.

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
  examination. The candidate — parent-defined contracts that direct children
  implement to participate in composition — does not need it, because
  importing a type confers no ability to participate: participation flows
  upward through exposure to parent, which the intermediate child still
  controls. Depth-1 grants are also subdivision-variant (reorganizing a
  consumer breaks its access) and would force a new "relay a parent-provided
  grant downward" mechanism to recover expressiveness, making the model
  larger, not smaller. Precedent agrees: visibility systems offer
  parent-relative (`pub(super)`) and subtree scopes, not depth-limited ones.
- **Branch-targeted grants** ("expose to descendants, but only branch X").
  Consumer-side restriction inside a receiving branch is that branch's own
  parents' business.
- **Sibling or cousin channels.** Reduced to up-then-down chains through the
  responsible ancestors.
- **Root privileges.** The app root has no special rule in either direction;
  it is only the module whose descendant grants happen to be application-wide.
- **Consumer dependency declarations.** Real, but a dependency-tracking
  concern, not an importability concern. Out of scope by the definition at
  the top.

This also answers open question 1 of the parent-governed document: a parent
may compose only what a child explicitly exposes to it. There is no implicit
"public surface" that parents can always consume; exposure to parent **is**
the declaration.

## Decided

- **Single upward channel.** Expose-to-parent always cedes re-routing
  authority; there is no composition-only variant.
- **Uniform descendant grants.** A descendant grant reaches the whole
  subtree; there is no backflow exclusion and no provenance tracking on routed
  symbols.
- **Tags are purely restrictive cross-requirements.** Exposure tags and
  importer-context tags gate imports on top of the tree rules; no tag ever
  grants reach (`reach: global` rejected).
- **Test access is tree-routed and context-gated.** There is no global test
  channel: `testing_only` support travels the ordinary exposure channels,
  and only declared test contexts may import it.

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
