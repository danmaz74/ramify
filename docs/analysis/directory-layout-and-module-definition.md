# Directory Layout And Module Definition

**Status:** Superseded by
[Directory Structure And Module Description Principles](../model/module-description.principles.md).
The analysis below preserves the earlier proposal; its `own` and `receive`
statements are not part of the adopted language.
It also predates the adopted `ui` tag and module-owned `tests/` area; its
module-only classification discussion is historical.

**Date:** 2026-09-05

## Purpose

Propose a physical directory convention and an authored module definition
format for the existing [importability principles](../model/cross-module-importability.principles.md)
and [glossary](../model/glossary.md). These choices describe how to record the
model, without adding importability rules.

The current package evaluates explicitly supplied trees of modules and
symbols. It has no filesystem discovery or module-file loader. The format
below is proposed syntax, not an existing API.

## Recommendation

Use one `module.ramify` file at each module root. For new projects,
separate directly owned implementation in `src/` from child modules in
`subs/`, repeating the same shape at every depth. Keep that layout a
scaffolding convention: the declaration file, not the directory name,
establishes a module boundary.

Use a small, versioned declaration language built around `module`, `own`,
`receive`, and `expose`. It should be concise and recognizable as an
architectural contract. Source references and received references bind names;
the same `expose` statement applies to both. The file is parsed as declarations
and never executed as project code.

## Directory Layout

```text
shop/
├── package.json
├── tsconfig.json
├── module.ramify                  # application root: shop
├── README.md
├── src/                          # shop's own composition code
│   └── main.ts
└── subs/
    ├── orders/
    │   ├── module.ramify          # shop/orders
    │   ├── README.md
    │   ├── src/                  # orders' own code
    │   │   ├── place-order.ts
    │   │   ├── place-order.test.ts
    │   │   ├── order.ts
    │   │   └── testing/
    │   │       └── make-order.ts
    │   └── subs/
    │       ├── pricing/
    │       │   ├── module.ramify
    │       │   └── src/
    │       │       └── calculate-total.ts
    │       └── tests/
    │           ├── module.ramify  # explicitly tagged testing
    │           └── src/
    │               └── orders.test.ts
    └── checkout/
        ├── module.ramify
        └── src/
            └── checkout.ts
```

### What This Layout Provides

- A reader opening a module sees its definition, documentation, own source,
  and child modules separately.
- Searching its `src/` visits its own implementation without traversing child
  implementations, when the project follows this convention.
- A leaf gaining its first child only gains `subs/`; its existing source does
  not move, and its declaration format does not change.
- An empty composition or grouping module can omit `src/`. A leaf can omit
  `subs/`. No empty directories or placeholder source files are required.
- A Ramify boundary does not require an npm package, a separate TypeScript
  project, a lockfile, or an independent build. Package boundaries remain a
  separate distribution choice.

The cost is longer paths: every additional module level normally adds
`subs/<name>`. The benefit is a consistent separation of a module's own code
from the implementations delegated to its children.

An agent's working directory is an aid to navigation, not write enforcement.
Exact module ownership must still determine which files a task may change.

### Boundary And Discovery Rules

The proposed loader selects one application root explicitly, defaulting to
the working directory only when it contains `module.ramify`. It discovers
the other declaration files beneath that root. The nearest containing
declaration determines each module's parent. No `parent`, `children`, or
separate ownership-directory field duplicates those facts.

Discovery must cover declarations outside `subs/` too. An existing project
can place declarations in its existing nested source directories without
first moving its code. That uses the same model and file format; it gives up
the convention's guarantee that searching a parent's `src/` avoids its children.

Directories without a declaration introduce no module. A grouping directory
may hold several modules, but does not add a level to the module tree.
Source files in such a directory still belong to the nearest declared owner.

`src/` is a recommended location, not a replacement ownership boundary.
Source files elsewhere inside a module directory also belong to that module,
except where a deeper module declaration claims them. Nested modules may not
be silently ignored because they violate the recommended layout.

Installed dependencies and generated output must be outside the application
source/discovery scope. The loader should use project-level input and output
configuration for that scope, not per-module globs that can overlap ownership.
A declaration reached through two filesystem aliases must not create two
owners; the initial loader should diagnose module-directory symlinks rather
than follow them into a second tree. These are loader concerns, not new
exposure rules.

### Identity

Require a local name in the `module` declaration, unique among the module's direct siblings, including
siblings placed in different grouping directories. Use lowercase names of
the form `[a-z][a-z0-9]*(?:-[a-z0-9]+)*` for the initial format.

Derive the canonical module identifier from declared names along the ancestry:
`shop/orders/pricing`. Neither `src`, `subs`, nor an ordinary grouping
directory contributes a segment. The root's identifier is its declared name.

Renaming a physical directory while retaining its name and parent preserves
that identifier; filesystem references to the moved directory need updating.
Changing its declared name or moving it to a different parent changes its
identifier and potentially its permissions. Stable opaque identifiers and
migration aliases can be considered if persisted integrations require them;
they are not needed to establish the initial format.

### Tests And Other Classifications

In the example, `src/place-order.test.ts` belongs to `orders` and has ordinary
same-owner access. Its filename gives it no extra cross-module permissions.
Likewise, `src/testing/` is an ordinary directory: its name assigns no tags.

`subs/tests/` is a separate module because it has a declaration. Its own
`module tests tagged [testing]` declares compatibility with testing-tagged symbols
that exposure makes visible there. It has no private access to `orders`.
The parent can expose selected test support to descendants with the symbol's
`testing` tag restricting who may import it.

Browser code uses the same mechanism: declare a separate module where a
different classification is needed. Directory names such as `tests`, `ui`,
or `client` have no special meaning, and module tags are never inherited.

## Module Definition Format

### A Dedicated Architectural Language

Recommend `module.ramify`, with a `ramify 1` format header and a required
`module` declaration. The dedicated extension, opening declaration, and
small architectural vocabulary should make the file's role recognizable.

JSON was attractive for parsing and machine edits, but it makes each symbol
verbose and presents architectural decisions as ordinary configuration
properties. YAML would shorten the representation while retaining that
configuration style. A dedicated syntax can state the actual decisions:
which symbol is owned, which is received, and where each is exposed.

The tradeoff is owning a parser, formatter, and editor support. Keep the
language small enough that these tools have one unambiguous representation
of each statement. Do not add expressions, executable imports, variables,
conditionals, loops, templates, or user-defined availability rules.

Distinct syntax can signal importance; it cannot force an agent to exercise
care. Tools should also identify this file as an architectural contract and
explain the resulting ownership, tag, and reach changes when it is edited.
That is useful review evidence without adding approval rules to importability.

### Example: An Owner's Definition

At `shop/subs/orders/module.ramify`:

```text
ramify 1
module orders

// Order creation and pricing composition.
own placeOrder from "./src/place-order.ts"
own Order from "./src/order.ts"
own makeOrder from "./src/testing/make-order.ts" tagged [testing]
receive calculateTotal from "./subs/pricing"

expose placeOrder, Order, calculateTotal to parent
expose Order, makeOrder, calculateTotal to descendants
```

The two `expose` statements show the complete outward policy in one place.
An `own` or `receive` statement binds a local reference name; it does not
itself expose anything. Every exposure uses the same syntax, regardless of
whether the referenced symbol is owned or received.

The file needs no list of consumed dependencies. Import permissions still
follow solely from the agreed tree and tag rules. `receive` identifies a
symbol provided by exposure; it does not request or create permission to
import that symbol.

`own` declarations are not a required inventory of every source export.
Unlisted exports remain owned, usable within their owner, and unexposed.
They receive the owner's mandatory testing tag where applicable.

### Statement Forms

| Form | Meaning |
| --- | --- |
| `ramify 1` | Select the declaration language version |
| `module orders` | Declare this directory as the module root with local name `orders` |
| `module tests tagged [testing]` | Declare module tags explicitly on the module header |
| `own placeOrder from "./src/place-order.ts"` | Bind the file's named export `placeOrder` as an owned reference |
| `own parse as parseOrder from "./src/parser.ts"` | Bind the source export under a different local reference name |
| `own makeOrder from "./src/testing.ts" tagged [testing]` | Assign the owned symbol its complete tag set |
| `receive calculateTotal from "./subs/pricing"` | Bind the provider module's declared reference `calculateTotal` |
| `receive calculateTotal as price from "./subs/pricing"` | Bind a received symbol under a different local reference name |
| `expose placeOrder, price to parent` | Expose the listed references to the direct parent |
| `expose Order, price to descendants` | Expose the listed references to all proper descendants |

The first two non-comment statements must be the version and module header,
with exactly one of each per file. All remaining statements are declarations;
their order does not change their meaning. Each occupies one line. Paths are
double-quoted strings, lists use commas, and tags use brackets. `//` comments
outside quoted strings run to the end of the line. Blank lines and indentation
are for readability, and statements do not take semicolons.

`parent` and `descendants` are the only exposure destinations. To expose to
both, list the reference in both statements. Multiple statements for one
destination combine their references as a set. Unknown statements, unknown
tags, unsupported versions, and duplicate local reference names receive
explicit diagnostics. A repeated exposure of the same reference is redundant
and cannot widen its meaning.

A default export uses an explicit local name:

```text
own default as createOrder from "./src/create-order.ts"
```

The parser's formal grammar and handling of unusual TypeScript export names
belong in the eventual format specification. These examples are proposed
syntax; no parser or editor integration exists yet.

### Owned And Received References

An `own` source path is an exact TypeScript source path relative to this
file's directory; no glob or package specifier. The source export must be
owned by the declaring module. It cannot point into a child's source or use
a local TypeScript forwarding export to claim a symbol owned by another
Ramify module. Resolution must follow export aliases to preserve the original
project owner and tags.

A `receive` path is relative to this file's directory and identifies a
provider's module directory, not an implementation file. The named symbol
is a local reference declared in that provider's `module.ramify`.
The provider need not be the original owner.

For an immediate child, the reference reads a symbol exposed to parent.
For a proper ancestor, it reads a symbol exposed to descendants. Those are
precisely the ways a module receives a symbol. `receive` has no `tagged`
clause because the declaring module cannot change the original assignment.

References from ancestors permit the redundant re-exposures that the
principles explicitly allow. They need no special access mechanism. Naming
a sibling, an unexposed child reference, or an arbitrary distant owner cannot
grant visibility. An exposure of a symbol that has not reached the module
remains ineffective and should be diagnosed as such.

Reference cycles without an originating owned symbol cannot manufacture a
symbol. Missing files, missing exports, and unresolved module or reference
names are declaration errors. Exposure to parent at the root and redundant
exposure remain representable no-ops, as in the current evaluator.

### Names And Canonical Symbol Identity

A declared symbol name is a local reference handle. It is normally the source
export's name, but `as` can disambiguate two different files exporting `parse`,
for example `parseOrder` and `parsePrice`. The reference name does not rename
the TypeScript export or prescribe source import syntax.

A parent may use a different local handle for a received symbol. That does
not create a new owned symbol: every reference must resolve to the same
canonical original symbol and tag set throughout the exposure chain.
In particular, a parent can disambiguate identically named symbols received
from different children.

The loader must distinguish source export identity from display/reference
names. Within an owner, two `own` declarations that resolve to the same
original export must not assign separate policies or tags: require one owned
reference, using that name in any exposure statements. Ordinary TypeScript
aliases of that export resolve to the same policy. Moving its implementation
file can then be handled by updating the owner's source reference without
changing the handles used by its parents.

### Module Tags And Defaults

At `shop/subs/orders/subs/tests/module.ramify`:

```text
ramify 1
module tests tagged [testing]
```

The version and module header are the only required statements. Omitting the
module's `tagged` clause means no module tags. Tag lists accept the two
built-ins, `testing` and `browser`, for example `tagged [testing, browser]`.

On `own`, omitting `tagged` means `[]`, or `[testing]` when this module is
tagged testing. In a testing module, an explicitly supplied set must contain
`testing`; `tagged []` and `tagged [browser]` are invalid. In a browser module,
symbols do not automatically acquire `browser`.

If custom classification is needed, give it separate `labels` syntax rather
than silently accepting arbitrary strings as built-in tags. That preserves
inert project labels while making `testng` an actionable typo. No
project-authored availability rules belong in this file.

### Completing The Exposure Chain

The pricing child can define the symbol above as follows:

```text
ramify 1
module pricing

own calculateTotal from "./src/calculate-total.ts" tagged [browser]
expose calculateTotal to parent
```

Its parent `orders` receives it and applies its own exposure decisions in the
first example. The root may then expose that received symbol to all its
descendants:

```text
ramify 1
module shop

receive calculateTotal from "./subs/orders"
expose calculateTotal to descendants
```

This makes the symbol visible in `checkout`. Its owner remains `pricing`,
and its tag set remains `[browser]`. The reference path does not authorize
skipping either upward exposure decision. Declaring a received reference
or re-exposure does not itself import or execute the symbol.

## What To Keep Out Of This Format

Do not bring older surface-based designs into this format as extra policy:
`public`, direct-child-only surfaces, privileged ancestor access, consumer
dependency allowlists, and a ban on foreign re-exposure would change the
agreed semantics.

There is no required `index.ts`, `client.ts`, `vocabulary.ts`, `facade/`, or
`internal/`. A source file's name has no exposure or tag meaning. Generated
entry points, if useful, should be derived from declarations; they must not
be a second authored authority over the same symbol decisions.

Source import spelling, resolver integration, external-package treatment,
generated output, and publication remain separate implementation work.
In particular, identifying an exported source binding in the declaration
does not yet specify how consumers write their imports. No new import syntax
is required to understand or validate the declaration's exposure decisions.

## Consequences For The Current Implementation

This is more than serializing `ModuleDeclaration`. The current evaluator
accepts nested literals, uses names unique within an owner, and represents
received references through a direct child and a symbol name. It has no
source paths, discovery scope, or export-alias resolution.

Implementation would need a discovery and source-resolution layer which
builds the same ownership/exposure model while retaining canonical source
identities. Received handles, including renamed or colliding handles and
references from ancestors, must resolve before evaluation. The normalized
representation must carry those original identities explicitly wherever the
current name-only representation is insufficient.

The decisive validation cases are repeated export names in different source
files, child symbols with the same name, aliases through several exposure
hops, a testing parent forwarding a production child's symbol, ancestor
re-exposure, private co-located tests versus separately owned tests, and
promotion of an ordinary directory into a module. These would validate the
loader's correspondence with the principles, not introduce new rules.

## Choices Proposed For Acceptance

1. `src/` and `subs/` as the standard generated layout, with marker-based
   discovery also supporting existing layouts.
2. `module.ramify`, a small dedicated declaration language with a version
   header, comments, and one definition per module.
3. Physical containment determines parenthood; local names determine readable
   canonical identifiers along that tree.
4. `own` and `receive` bind symbol references; `expose` applies the same two
   exposure destinations to either kind.
5. Source references identify individual exports; received references identify
   provider references and preserve canonical ownership and tags.

If accepted, document the concrete format in a separate implementation
specification and keep the importability principles and glossary authoritative
for semantics. This proposal should not become a third competing rulebook.
