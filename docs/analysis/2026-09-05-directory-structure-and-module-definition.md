# Directory Structure and Module Definition File

**Status:** Superseded for directory structure and module descriptions by
[Directory Structure And Module Description Principles](../model/module-description.principles.md).
The YAML format and other proposals below are not the adopted format.
This analysis also predates the adopted `ui` tag and module-owned `tests/`
area; its module-only classification discussion is historical.

**Date:** 2026-09-05

**Scope:** The concrete realization of the model defined in
[Cross-Module Importability Principles](../model/cross-module-importability.principles.md):
how modules appear in the filesystem, and the file that declares one. It does
not change the model. Where a choice below would need a new rule in the
principles, it says so.

## What the model already fixes

Three decisions in the principles settle most of the layout question before it
is asked:

1. **A module is a directory.** "A module is declared by marking a directory as
   a module root", and a module's parent is "the innermost declared module
   whose directory contains its directory". The module tree *is* a directory
   tree; nesting is physical, never declared.
2. **Files belong by containment.** A module's files are those inside its
   directory, excluding its submodules' directories. No file list, no glob, no
   ownership table.
3. **The unit of exposure is the symbol.** Boundaries are on symbols, not on
   files. Import paths are an implementation concern and "must preserve the
   ownership, exposure, and availability rules without introducing additional
   ways to grant access".

Together these mean the layout needs exactly one artifact: a marker that turns
a directory into a module and carries that module's decisions. Everything else
that earlier explorations of package-based and hybrid module systems needed
(a package manifest per module, a separate directory for children so that no
package contains another, generated facade files as the only legal entry
points, parent routing tables, consumer-side dependency declarations, import
assertions, a custom module resolver) exists to police *files*. A per-symbol
model checks the symbol wherever it is imported from, so none of that is
required for enforcement.

## Directory structure

### Rules

- **A directory is a module when it contains a `ramify.yaml` file.** Nothing
  else makes a module: not an `index.ts`, not a naming pattern, not a
  `package.json`.
- **Parentage is containment.** The parent is the innermost module directory
  that contains the module's directory. Directories between them (grouping
  directories such as `domains/` or `modules/`) are ordinary directories and
  belong to the outer module.
- **The root is the outermost module.** The checker requires exactly one
  module directory that is not inside another. It needs no `root:` flag.
- **Ownership is deepest-module-wins.** A file belongs to the innermost module
  directory containing it. This applies to every file, source or not; only
  source files matter for importability.
- **The source set is the TypeScript program's.** The checker takes a
  `tsconfig.json` and considers exactly the files of that program. It does not
  define what a source file is, so `node_modules`, build output and excluded
  paths never need listing. Every program file must lie inside the root module
  directory; a program file outside it is an error, because the model has no
  place for a file that belongs to no module.
- **Submodules may sit anywhere inside the module.** `payment/cards/` and
  `payment/modules/cards/` are both submodules of `payment`. Gathering
  submodules under one grouping directory is a convention a project may adopt
  to make the boundary visible in a listing; it is not a rule.
- **Module identity is the path.** A module's id is its directory path from
  the root module, `checkout/payment`. Its display name is the directory
  basename. A move is an identity change, as it should be.

### Example

The shop from the website's modularity page, laid out on disk:

```text
shop/                        root module
├── ramify.yaml
├── tsconfig.json
├── app.ts
├── catalog/
│   ├── ramify.yaml
│   ├── search/
│   │   ├── ramify.yaml
│   │   ├── indexing/  ramify.yaml …
│   │   └── ranking/   ramify.yaml …
│   └── inventory/     ramify.yaml …
├── checkout/
│   ├── ramify.yaml
│   ├── order-total.ts
│   ├── cart/          ramify.yaml …
│   ├── payment/
│   │   ├── ramify.yaml
│   │   ├── charge.ts
│   │   ├── refund.ts
│   │   ├── types.ts
│   │   ├── charge.test.ts
│   │   ├── cards/       ramify.yaml …
│   │   └── fraud-check/ ramify.yaml …
│   └── shipping/      ramify.yaml …
├── accounts/          ramify.yaml …
├── platform/
│   ├── ramify.yaml
│   ├── db/            ramify.yaml …
│   ├── http/          ramify.yaml …
│   └── logging/       ramify.yaml …
└── integration-tests/ ramify.yaml  (tags: [testing])
```

`payment` owns `charge.ts`, `refund.ts`, `types.ts` and `charge.test.ts`.
`cards/` and `fraud-check/` are its submodules. A listing of `payment/` shows
the boundary: every subdirectory that contains a `ramify.yaml` is a module,
everything else is payment's own.

### Fitting an existing project

Because nothing has to move, a project adopts the tree by adding marker files:

```text
project/
├── package.json
├── tsconfig.json
└── src/
    ├── ramify.yaml              root module
    ├── domains/                 grouping directory, owned by the root
    │   ├── orders/
    │   │   ├── ramify.yaml
    │   │   ├── core/ ramify.yaml …
    │   │   ├── server/ ramify.yaml …
    │   │   └── ui/ ramify.yaml …  (tags: [browser])
    │   └── billing/ ramify.yaml …
    └── shared/ ramify.yaml …
```

The root is `src/` here because that is what the program covers. Scripts under
a separate `tsconfig.scripts.json` form a separate program and are checked, if
at all, with their own root. Placing the root at the project directory instead
is equally legal and brings tooling files under the tree; the choice follows
the program.

### Where tests live

The principles say there are no file-level importer contexts and module tags
are not inherited. The layout consequences are worth stating plainly:

- **Unit tests are same-owner files.** `payment/charge.test.ts` belongs to
  `payment`, imports its internals freely, and can import from other modules
  exactly what `payment` can. It cannot import test support tagged `testing`,
  because `payment` is not a testing module.
- **Tests that need test support are a testing module.** A directory with
  `tags: [testing]` in its `ramify.yaml`. It receives only what the tree
  exposes to it, like any module: as a child of `shop`, `integration-tests`
  sees what `shop` exposes to descendants and nothing else.
- **A testing submodule does not see its parent's internals.** `payment/tests/`
  declared as a testing module is a child of `payment`, and a child receives
  only what its parent exposes to descendants. So a module's internals are
  tested by co-located files, and its exposed interface by testing modules.
  That split is the model's, not the layout's, and the layout should not try
  to soften it.

Test runners are unaffected. A testing module is a directory; `**/*.test.ts`
finds its files as before.

### Non-source files

`README.md`, feature files, stylesheets and assets belong to the module whose
directory contains them, which is what agent scoping and documentation want.
They play no part in importability. An import that resolves to a file outside
the TypeScript program (a stylesheet, an npm package) is external to the model
and is not checked.

## The module definition file

### Name and format

Proposed: **`ramify.yaml`**, one per module directory.

| Option | For | Against |
| --- | --- | --- |
| `ramify.yaml` (proposed) | Short, tool-branded like `package.json` and `Cargo.toml`, greppable, visible in every listing; YAML allows comments, and the schema is small and flat | YAML's implicit typing, mitigated by a published JSON Schema and YAML 1.2 parsing |
| `ramify.json` | Universal tooling, strict | No comments; per-symbol entries become verbose |
| `ramify.module.ts` | Familiar to TypeScript authors | Discovery would execute project code; declarations must be readable statically by the checker, editors and agents |
| `MODULE.yaml` | Names the concept, sorts first in listings | Generic name collides with other tools and conventions |
| Inline `/** @ramify ... */` annotations at each `export` | No drift on rename, no `from` field, decision beside the code | No single readable interface per module, no place for re-exposures (which have no export site), exposure changes hide in ordinary edits |

The inline alternative is the strongest competitor and is rejected for one
structural reason: re-exposure has no export site, so a central file is needed
anyway, and a module's interface should be one small file an agent can be
handed and an architect can diff.

A JSON Schema (`ramify.schema.json`) ships with the toolkit for editor
validation and completion.

### Schema

Every key is optional. An empty file is a valid module that exposes nothing.

```yaml
description: One line, for humans and agents.   # optional

tags: [testing]          # module tags: testing | browser

exposes:                 # symbols this module owns
  chargeOrder: parent
  refundOrder: parent
  PaymentContext: descendants
  Money: [parent, descendants]
  resetPaymentStore: { to: parent, tags: [testing] }
  create: { to: parent, from: ./order/create.ts }

re-exposes:              # symbols received from direct children, passed on
  cards:
    tokenizeCard: parent
  fraud-check:
    assessRisk: descendants
```

Field by field:

- **`description`**: free text, one line. Shown in the explorer and in the
  focused view; never interpreted.
- **`tags`**: the module's tags. Exactly the built-in tags are accepted.
- **`exposes`**: a map from an owned symbol name to its exposure. The value is
  a channel (`parent` or `descendants`), a list of both, or an object with
  `to` (channel or list), `tags` (symbol tags) and `from` (the owning file,
  relative to the module directory). `from` is required only when two of the
  module's own files export the same name; otherwise the checker finds the
  exporting file, and declaring `from` where it is not needed is allowed and
  verified.
- **`re-exposes`**: a map from the name of a direct child to a map of symbol
  name to channel. Naming the child rather than the owner keeps every
  declaration local, as the principles require: the child is the module the
  symbol was received from, whoever owns it. A received symbol carries its
  owner's tags, so no `tags` here; a `from` file makes no sense here either.

What is deliberately absent:

- **No `name`.** The directory name is the name. A field would only drift.
- **No `kind: type | value`.** The import form is a property of the import,
  and whether a symbol is a type is TypeScript's knowledge, not the author's.
- **No wildcards.** Neither `exposes: "*"` nor `re-exposes: { cards: all }`.
  Every exposure is one decision about one symbol, which is what makes the file
  the module's readable interface. A forty-line list is the same forty lines a
  barrel file holds today.
- **No dependency declarations.** The principles keep importability
  independent of dependency use. What a module actually imports is observed by
  the checker and drawn by the explorer; declaring it again would be a second
  graph to keep in sync.
- **No project settings.** Which `tsconfig` to use and where the root is are
  CLI inputs. If project-wide settings ever become necessary, the root's
  `ramify.yaml` is the natural place, and the key `project` is reserved for it.

### The shop, declared

```yaml
# shop/ramify.yaml
description: The online shop.
re-exposes:
  platform:
    Logger: descendants
```

```yaml
# shop/checkout/ramify.yaml
description: Cart, payment and shipping for one order.
exposes:
  OrderTotal: descendants
```

```yaml
# shop/checkout/payment/ramify.yaml
description: Charging and refunding an order.
exposes:
  chargeOrder: parent
  refundOrder: parent
  resetPaymentStore: { to: parent, tags: [testing] }
```

```yaml
# shop/checkout/payment/cards/ramify.yaml
exposes:
  tokenizeCard: parent
  chargeCard: parent
```

```yaml
# shop/platform/ramify.yaml
re-exposes:
  logging:
    Logger: parent
```

```yaml
# shop/platform/logging/ramify.yaml
exposes:
  Logger: parent
```

```yaml
# shop/integration-tests/ramify.yaml
tags: [testing]
```

Read `shop/ramify.yaml` and `platform/ramify.yaml` together and the route the
focused view draws as `logging ▲ platform ▲ shop ▼` is there in two lines.

### Validation

The checker rejects a declaration that cannot mean anything, and warns about
one that means nothing:

| Finding | Severity |
| --- | --- |
| A symbol in `exposes` that no file of the module exports | error |
| A symbol in `exposes` exported by two own files and no `from` | error |
| A `from` file that does not export the symbol, or belongs to another module | error |
| A child named in `re-exposes` that is not a direct child | error |
| A tag that is not built in | error |
| A testing module whose exposed symbol declares tags without `testing` | error (the principles' exclusivity rule) |
| Two outermost modules, or a program file outside the root | error |
| A `re-exposes` entry for a symbol the named child did not expose to its parent | warning: inert |
| Re-exposing a symbol received from an ancestor's exposure to descendants | warning: redundant |
| `parent` at the root | warning: inert |

Warnings never change availability, matching "Redundant Exposure Is
Permitted".

## Imports

Because the boundary is on the symbol, a file imports an exposed symbol with an
ordinary TypeScript import to wherever the symbol is declared:

```ts
// shop/checkout/order-total.ts
import { chargeOrder } from './payment/charge.js';
```

The checker, for each import in the program:

1. resolves the specifier with TypeScript and follows re-export aliases to the
   original declaration;
2. takes the owner to be the module of the declaring file;
3. takes the importer to be the module of the importing file;
4. classifies each binding as a value or a type-only import;
5. evaluates the importability rule with the declared exposures and tags.

The import path plays no part in the decision. This has three consequences:

- **No facade is required.** A module may keep a hand-written `index.ts` that
  re-exports what it exposes, so that consumers do not depend on its file
  layout; the checker sees through the alias to the owner. It is a convenience
  for consumers, not a boundary, and its absence costs nothing.
- **Path aliases are free.** `@shop/money` and `../../money.js` are the same
  import to the checker.
- **Nothing is generated.** No import map, no resolver plugin, no compiler
  wrapper. `tsc`, Vite, Vitest, Node and editors keep resolving exactly as
  they do today.

Import forms that need a stated rule:

- **`import * as ns` and `export * from` across a boundary** import every
  symbol the target file exports. They are allowed when every one of those
  symbols is available in the importer, and refused naming the first that is
  not.
- **Literal dynamic `import('...')`** is checked like a static import.
  Non-literal dynamic imports cannot be attributed and are refused across
  module boundaries.
- **Side-effect imports** (`import './setup.js'`) import no symbol and are not
  a cross-module import of anything; they are allowed.

## Decisions requested

1. **File name**: `ramify.yaml`.
2. **Root placement**: wherever the outermost `ramify.yaml` is, required to
   contain the whole program; no flag, no project config file in v1.
3. **`from` optional**, required only on ambiguity.
4. **No wildcards, no dependency declarations, no `name`, no `kind`.**
5. **Key spelling**: `exposes`, `re-exposes`, `tags`, `description`, `to`,
   `from`; channels `parent` and `descendants`.
6. **Testing placement** as stated: co-located unit tests, testing modules for
   everything that needs test support.

## Next step

A checker prototype against the shop laid out as above, in the toolkit's own
package: discovery, declaration validation, the import walk over a TypeScript
program, and the evaluator that already exists. The shop tree diagram and the
focused view should then be derivable from the `ramify.yaml` files rather than
from a hand-written declaration, which is the first real test of the format.
