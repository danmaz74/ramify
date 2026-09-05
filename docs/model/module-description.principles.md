# Directory Structure And Module Description Principles

**Status:** Active specification; filesystem loading and parsing are not yet
implemented in the toolkit.

**Format version:** 1

## Purpose

Define the required directory structure and the complete syntax and interpretation
of `module.ramify`, the file that declares a Ramify module and its exposures.
This document is authoritative for the concrete format.

The [Cross-Module Importability Principles](cross-module-importability.principles.md)
and [Glossary](glossary.md) remain authoritative for importability semantics
and vocabulary. This format records those rules. It adds no exposure channel,
tag rule, or consumer dependency requirement.

The separate
[TypeScript Source Interpretation Principles](typescript-source-interpretation.principles.md)
defines the adopted resource interpretation and proposes how other consumer
imports and source re-exports are resolved and checked. It does not change
this document's declaration grammar.

## Goals

- Make each module's architectural decisions recognizable in one concise file.
- Make recursive searches of a module's `src/` cover its own implementation
  without entering a child's implementation.
- Determine ownership and receipt from the tree instead of declaring them again.
- Distinguish owned exposure and child re-exposure in syntax while preserving
  the same two semantic exposure channels.
- Give parsers and validators one precise interpretation of every declaration.
- Preserve original symbol identity and tags across aliases and exposure chains.

## Principles

### A Description File Establishes A Directory Boundary

The exact, case-sensitive filename is `module.ramify`. A directory containing
this file is a declared module root. The containing directory is the module's
ownership boundary; the file has no field for a different ownership directory.

The application root is selected explicitly by the caller and must contain
`module.ramify`. A tool may default to its working directory when that
directory contains the file. It must not guess a root from several discovered
modules. All modules in one evaluation belong to this one root.

The parent of a non-root module is its nearest strictly containing module
directory. A directory without a description file is an ordinary directory,
including when it groups several modules. It introduces no module or ancestry
level. No `parent` or `children` declaration overrides physical containment.

For a file `f` in the application tree, its owner is the deepest module
directory containing `f`. Every application source file must additionally
lie under its owner's `src/`. Attribution of a file outside that location
does not make its placement valid. Descriptions, documentation, and other
non-implementation files may live at the module root.

A present but invalid description is an invalid boundary declaration. A
loader must report it; it must not silently omit the module and attribute
its files to the parent.

### Discovery Covers The Application Tree

Discovery visits the selected application root recursively and validates the
placement of every description. Every non-root module must lie strictly
beneath its parent's `subs/`, optionally through ordinary grouping directories.
The reserved `src/` and `subs/` directories themselves are not module roots.
No module description may occur anywhere inside a module's `src/`.

Discovery must detect misplaced descriptions, including those inside `src/`
or outside `subs/`, and report layout errors. It must not ignore them as
ordinary files. Existing projects must adopt this layout before their
descriptions can be accepted; adding marker files alone is not sufficient.

The caller supplies the application source set and discovery exclusions for
installed dependencies, generated outputs, and independent projects. These
are project inputs, not per-module ownership globs. Each application source
file must lie within the selected root and outside excluded directories.
Excluded files cannot be referenced as application-owned exports. Application
implementation must not be excluded merely to bypass the required layout.
Repository build configuration and tooling may be outside the application
source set; executable application code and its same-owner tests and helpers
belong in the owning module's `src/`.

A TypeScript dependency or standard-library file does not become application
source merely because the compiler loads it. Treatment of external packages
belongs to the source-analysis integration, not this description language;
the source interpretation specification defines the adopted resource rules
and proposes the remaining integration scope rules.

The selected root must be a real directory, not a symlink. Directory symlinks
are not traversed during discovery. A symbolic-link description file or a
`from` path traversing a symlink is a validation error in version 1. Filesystem
aliases must not introduce alternative ownership trees or permit a reference
to escape its checked boundary.

### The Required Layout Separates Own Source And Submodules

Every module uses this shape; it is a structural requirement, not an optional
scaffolding convention:

```text
shop/
├── module.ramify
├── package.json
├── tsconfig.json
├── README.md
├── src/                         # shop's own source
│   └── main.ts
└── subs/
    └── orders/
        ├── module.ramify
        ├── README.md
        ├── src/                 # orders' own source
        │   ├── place-order.ts
        │   ├── order.ts
        │   ├── place-order.test.ts
        │   └── testing/
        │       └── make-order.ts
        └── subs/
            ├── pricing/
            │   ├── module.ramify
            │   └── src/
            │       └── calculate-total.ts
            └── tests/
                ├── module.ramify
                └── src/
                    └── orders.test.ts
```

The implementation root is exactly `<module>/src/`; it is fixed and not
configurable. It contains all directly owned application source and may
contain ordinary implementation subdirectories, but no declared submodules.
`subs/` contains child modules, optionally through ordinary grouping
directories, and no loose parent-owned application source. Each child repeats
the same separation in its own directory.

For every application source file `f` and module `M`, a valid layout satisfies:

> `owner(f) = M` if and only if `f` is beneath `<M>/src/`.

A leaf may omit `subs/`. A module with no own application source has an empty
implementation scope. If its empty `src/` is absent on disk, tooling must
create that exact directory before launching implementation work; it must
never substitute the module root or `subs/` as the implementation scope.
Descriptions and module documentation live alongside `src/` and `subs/`.

An implementation agent's working directory and default code-search root
are the module's `src/`. The launcher must supply the module description,
relevant documentation, and permitted contracts as initial context. Expanding
reads beyond that scope is deliberate navigation; write authority is checked
separately. A directory layout alone is not a write-access control mechanism.

Adding a new child leaves existing parent source in place. Extracting an
ordinary implementation directory into a child requires moving its source
from `<module>/src/...` to `<module>/subs/<child>/src/...` and updating
references. Adding a description inside the old source location is invalid.

Neither a package, a TypeScript project, nor a separate build is required
per module. `facade/`, `internal/`, `index.ts`, `client.ts`, and `vocabulary.ts`
are not required and have no implicit Ramify meaning.

### Declared Names Identify Modules Within The Tree

The required `module` statement gives the module its local name. After decoding
any quotes, that name must match `[a-z][a-z0-9]*(?:-[a-z0-9]+)*` and be unique
among direct siblings, including siblings placed in different ordinary grouping
directories. A name equal to a reserved keyword requires double quotes in both
its declaration and explicit child references. Other module names may also be
quoted; quoting does not change module identity or relax the name constraint.

The root's identifier is its name. Every other canonical module identifier
is its parent's identifier, `/`, and its local name: `shop/orders/pricing`.
Ordinary directory names, `src`, and `subs` contribute no identifier segments.

Renaming a physical directory while preserving declared name and parent
preserves the identifier. Child references in descriptions use that declared
name, so moving a child through ordinary grouping directories requires no
description-path update.
Changing the declared name or parent changes the identifier. Neither the
name nor identifier assigns tags or grants importability.

### A Description Is Static Architectural Data

A version 1 description contains a version header, one module declaration,
and zero or more `expose-src` or `expose-sub` statements. It is parsed as data
and never executed.
There are no expressions, variables, imports, includes, conditional blocks,
or configuration inheritance.

Ownership follows from the source file's owning module. Receipt follows from
exposure. There are no `own`, `receive`, `expose`, or `re-expose` statements.
The two supported verbs identify distinct declaration forms for the same
semantic exposure operation.

An empty module still declares its version and name:

```ramify
ramify 1
module orders
```

Comments explain architectural intent. Tools editing this file must preserve
authored comments and report the resulting ownership, classification, or
exposure changes. The format does not prescribe an approval workflow.

### The Language Has One Formal Grammar

Files are UTF-8, optionally beginning with one UTF-8 byte-order mark. Keywords
are case-sensitive. Line endings may be LF or CRLF; a final newline is optional.
A bare CR is invalid. Statements occupy one physical line; no line continuation
or multiline string syntax exists.

Before applying the following grammar, the parser:

1. Removes the optional initial byte-order mark and normalizes CRLF to LF.
2. Removes `//` comments outside quoted strings through the end of the line.
   Escaped quotes do not end strings. `//` inside a string is string content.
3. Trims leading and trailing spaces and tabs from each line and discards
   empty lines.
4. Terminates each remaining line with one LF, including a final line that
   originally had no newline.

The EBNF below describes that normalized input. Commas outside quotes mean
concatenation, `|` means alternatives, `{ ... }` means zero or more repetitions,
and `[ ... ]` means optional. Quoted text denotes a literal token. The special
terminals `BARE-NAME`, `BARE-MODULE-NAME`, `STRING`, `SPACE`, `TAB`, and `LF`
are defined immediately below the grammar.

```ebnf
document       = version-line, module-line, { exposure-line } ;
version-line   = "ramify", hws, "1", LF ;
module-line    = "module", hws, module-name, [ hws, tag-clause ], LF ;
exposure-line  = source-line | sub-line ;
source-line    = "expose-src", hws, selection-list,
                 hws, "from", hws, STRING,
                 [ hws, tag-clause ],
                 hws, "to", hws, destination-list, LF ;
sub-line       = "expose-sub", hws, sub-selection,
                 hws, "from", hws, module-name,
                 hws, "to", hws, destination-list, LF ;
sub-selection  = selection-list | "*" ;

selection-list = selection, { ows, ",", ows, selection } ;
selection      = name, [ hws, "as", hws, name ] ;
name           = BARE-NAME | STRING ;

module-name    = BARE-MODULE-NAME | STRING ;
tag-clause     = "tagged", hws, "[", ows, [ tag-list ], ows, "]" ;
tag-list       = tag, { ows, ",", ows, tag } ;
tag            = "testing" | "browser" ;
destination-list = destination, { ows, ",", ows, destination } ;
destination    = "parent" | "descendants" ;

hws            = ( SPACE | TAB ), { SPACE | TAB } ;
ows            = { SPACE | TAB } ;
```

- The reserved keywords are exactly `ramify`, `module`, `expose-src`,
  `expose-sub`, `from`, `as`, `tagged`, `to`, `parent`, `descendants`, `testing`,
  and `browser`. They are reserved in every name position: a source export,
  child-exposed name, alias, module declaration, or child reference equal to
  one of these keywords must be double-quoted.
- An unquoted word is a maximal run of ASCII letters, digits, `_`, `$`, or `-`.
  Match the whole word before classifying it: an exact keyword match is always
  a keyword and cannot be parsed as a bare name, regardless of position.
  Keyword prefixes do not reserve a word: `fromValue` and `testing-tools` are
  not keywords. Matching is case-sensitive, so `From` is not a keyword either.
- `BARE-NAME` is a complete unquoted word matching
  `[A-Za-z_$][A-Za-z0-9_$]*`, excluding the reserved keywords.
  `BARE-MODULE-NAME` is a complete unquoted word matching
  `[a-z][a-z0-9]*(?:-[a-z0-9]+)*`, excluding the same keywords.
- `SPACE`, `TAB`, and `LF` are U+0020, U+0009, and U+000A respectively. Other
  whitespace is not a token separator.
- `STRING` starts and ends with a double quote. Between them it contains
  Unicode scalar values other than double quote, backslash, and U+0000 through
  U+001F, or an escape: `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, or
  `\u` followed by exactly four hexadecimal digits. A high-surrogate Unicode
  escape must be immediately followed by a low-surrogate escape; isolated
  surrogate escapes are invalid. Decoding produces Unicode scalar values.
- Decoded names and paths must be nonempty and contain no U+0000 through
  U+001F or U+007F. Names compare exactly after decoding, without case folding
  or Unicode normalization. Quoting permits reserved keywords and otherwise
  unrepresentable export names, such as `"parse-order"`. A quoted `module-name`
  must still decode to a name matching `[a-z][a-z0-9]*(?:-[a-z0-9]+)*`.
- A quoted string is never a keyword token, even when its decoded value equals
  a keyword. Thus `"from"` is a name, while the clause separator must be bare
  `from`; tag and destination values must likewise use their bare keywords.
- Lists have no trailing comma. Tag and destination lists contain no duplicate
  items. The version header accepts only `1`; unknown versions are errors.

For example, this module and its selected and exposed names all require quotes:

```ramify
ramify 1
module "testing"

expose-src "from" as "to" from "keywords.ts" to parent
```

Its direct parent could select that exposed name with
`expose-sub "to" from "testing" to descendants`. The name `testing` alone does
not classify the module; classification still requires `tagged [testing]`.

The grammar requires a source-file reference or child name, a selection, and
at least one destination for every exposure statement. Only `expose-sub`
accepts bare `*`, as its entire selection; it cannot combine `*` with named
selections or apply `as` to it. Of the exposure statements, only `expose-src`
accepts `tagged`; the module header retains its own tag clause.
Semicolons, implicit sources, JSON objects, and unknown clauses are invalid.
A quoted export name `"*"`, if one exists, names that exact export; it is
never a wildcard.

### Exposure Statements Name Symbols And Destinations

An exposure statement has this interpretation:

```ramify
ramify 1
module orders

expose-src placeOrder from "place-order.ts" to parent
expose-src Order from "order.ts" to parent, descendants
expose-src makeOrder from "testing/make-order.ts" tagged [testing] to descendants
expose-sub calculateTotal from pricing to parent
expose-sub * from pricing to descendants
```

Each named selection identifies an exact source export or child-exposed name
and, optionally, an exposed name introduced by `as`. Without `as`, the exposed
name equals the selected name. The source and any tag clause apply to every
selection in the statement. Every selected symbol receives every listed
destination. Wildcard selection is defined separately below.

The destinations are exactly the existing two channels: `parent` means the
direct parent; `descendants` means all proper descendants. Listing both is
equivalent to two exposure statements. Statement order has no semantic effect.

There is no declaration for a consumed import. There is also no requirement
to enumerate source exports that are not exposed. Unlisted exports remain
owned and unexposed, with the default symbol tags required by the owner.
Version 1 has no separate statement for tagging an unexposed export.

### Expose-Src Selects Named Exports Within The Fixed Source Root

For `expose-src`, `from` is a quoted file path relative to the declaring
module's `src/`. For example, `"testing/make-order.ts"` resolves to
`<module>/src/testing/make-order.ts`. No `./src/` prefix is required or
automatically removed; `"src/example.ts"` literally names a file beneath
`<module>/src/src/`.

After string decoding, the path must be relative, use `/` separators, and
contain no backslash or empty path segment. Normalize `.` and `..` segments
before containment checks; the target must remain inside the declaring
module's `src/` and outside discovery exclusions. A terminal `/` is invalid
because the target must be a file. Absolute and drive-qualified paths, URLs,
package resolution, path-alias expansion, and globs are unsupported.

The target is an exact application source file: there is no extension
substitution, extension probing, implicit `index.ts`, or search for a file
exporting the selected name. Each selection identifies an exact export name
of that target, including `default` for a default export. The target file and
the selected export must both belong directly to the declaring module.

A resource file in the application source set is a valid `expose-src` target,
subject to the same path and ownership constraints as other targets. Its
export names and original binding identities follow the adopted
[resource interpretation](typescript-source-interpretation.principles.md#resource-bindings-belong-to-the-resolved-resource).
The effective declaration describing the resource supplies its export names;
for JSON, TypeScript supplies the export description itself. A shim does not
change the resource's owner or merge its bindings with another resource's.

A local TypeScript forwarding export must not claim ownership of another
Ramify module's symbol. The source analyzer must follow forwarding aliases
to the original project binding; introducing a new implementation binding
is distinct from forwarding one. A misplaced submodule inside `src/` is a
layout error, never a source-reference shortcut.

Every owned symbol that is exposed must be selected explicitly. Bare `*` is
forbidden on `expose-src`, so adding an exported helper to a source file does
not by itself add that helper to the module's exposures.

### Expose-Sub References A Direct Child By Declared Name

For `expose-sub`, `from` is one local module name, quoted when it equals a
reserved keyword and optionally quoted otherwise. Resolve its decoded value
only among the declaring module's direct children, using the child's `module`
header. It is not a filesystem path or directory basename; quoting cannot make
a path a valid child reference. Sibling-name uniqueness makes the lookup
unambiguous, including through grouping directories.

Each named selection refers to an exposed name in that child. The selected
symbol must be effectively exposed by the child to parent for the selection
to contribute exposure here. The child can expose an owned symbol or one it
has itself received from a child; the reference cannot skip an upward step.

There is no reference to self, a parent, another ancestor, a sibling, or a
non-direct descendant. Symbols received from an ancestor are already visible
throughout the receiving module's subtree, and forwarding them upward returns
them to a module that already has them. The semantic model permits that
redundancy; the description language omits a redundant ancestor-reference form.
Imports can still use symbols received from ancestors under the ordinary rules.

### Child Re-Exposure Can Forward The Whole Upward Contract

`expose-sub * from pricing to parent, descendants` selects all exposed names
of the direct child `pricing` whose canonical symbols it effectively exposes
to parent. It does not select private source exports, symbols merely visible
in the child, or symbols that the child exposes only to its descendants.

The wildcard copies those names unchanged and preserves each original symbol's
identity, owner, and complete tag set. This includes a `default` name if the
child exposes one. It does not filter by whether the forwarding module can
import the symbol. As with named `expose-sub`, `tagged` is forbidden.

Selection is recomputed from the child's current effective upward contract.
New upward exposures are forwarded automatically; removed ones stop being
forwarded. Empty selection is valid and has no effect. Every symbol must
first enter an exposure chain through an explicit owned `expose-src`
selection before any wildcard can carry it further.

Wildcards may appear at successive parent levels. Each level still makes its
own forwarding decision. A wildcard has no exclusions, renaming, namespace
prefix, or path pattern. Named selections with `as` remain available when a
parent needs a curated or differently named contract.

Names introduced by wildcards obey the same collision rules as named
selections: a name that denotes different canonical symbols is an error;
repeated references to the same symbol are harmless. There is no precedence
between explicit statements and wildcards. Tools reviewing changes must show
changes to the expanded contract even when a forwarding description did not
itself change.

### Owned Exposure And Child Re-Exposure Use The Same Channels

At `shop/subs/orders/subs/pricing/module.ramify`:

```ramify
ramify 1
module pricing

expose-src calculateTotal from "calculate-total.ts" tagged [browser] to parent
```

At `shop/subs/orders/module.ramify`:

```ramify
ramify 1
module orders

expose-sub * from pricing to parent, descendants
```

At `shop/module.ramify`:

```ramify
ramify 1
module shop

expose-sub * from orders to descendants
```

The original owner remains `pricing`, and the tags remain `[browser]` at
every step. The root's statement makes the symbol visible throughout the
root's descendants. No step imports or executes the symbol, and no step
requires the exposing module to be tag-compatible with it.

Each file can replace its wildcard with named selections when it needs to
curate the contract. Both verbs contribute to the same `parent` and
`descendants` exposure channels; the syntactic distinction introduces no
additional reach or availability rule.

### Exposed Names Preserve Canonical Identity

An exposed name is local to the declaring module and is used by
`expose-sub` selections. It is not a new TypeScript export and does not
prescribe a consumer's import spelling.

Aliases distinguish otherwise colliding names and make a declaration's name
independent of its source export spelling:

```ramify
ramify 1
module parsers

expose-src parse as parseOrder from "order.ts" to parent
expose-src parse as parsePrice from "price.ts" to parent
expose-src default as createParser from "create.ts" to parent
```

A parent can likewise select and alias a child-exposed name, for example
`expose-sub parseOrder as parsePurchase from parsers to parent`. The original
owner, original binding identity, and tags survive every alias.

All occurrences of an exposed name in one module, including names introduced
by wildcard expansion, must resolve to the same canonical symbol. Distinct
names may resolve to that same symbol. Exposures combine as sets by canonical
symbol, not by alias: names do not create separate permissions, tags, or
exposure channels. Repeating an identical
exposure is harmless. Binding one exposed name to different symbols is an
ambiguity error, even if their destinations differ.

For source files, canonical identity follows the original exported binding,
not just its text name. Two files exporting different bindings named `parse`
are distinct symbols; two aliases of the same binding identify one symbol.
Moving a source file requires updating its owning description's path, but
providers' callers can keep using its exposed name.

For child references, resolve identity through child-exposed names until it
is grounded in explicit `expose-src` selections. Resolution follows the tree
downward and cannot introduce a cycle of module references. A name supplied
by multiple declarations must identify exactly one original symbol. Wildcard
expansion can copy existing names and identities but cannot invent an origin.

### Tags Are Assigned Once Per Original Symbol

The module header's optional `tagged` clause declares the module's complete
tag set. Omission means the empty set. Its tags classify directly owned files,
never separately declared submodules.

```ramify
ramify 1
module tests tagged [testing]
```

A `tagged` clause on `expose-src` assigns the selected original symbols' tags,
not the tags of a particular exposure channel. A clause on `expose-sub` is
invalid, even if it repeats the original tags exactly or accompanies `*`.

Collect all explicit assignments for each original symbol in the owner's
description before applying defaults. All such assignments must be the same
set. An omitted clause reuses that symbol's explicit assignment elsewhere
in the file, if any; it does not reset the symbol to the empty set. Thus these
two statements carry the same `[browser]` tags:

```ramify
ramify 1
module pricing

expose-src calculateTotal from "calculate-total.ts" tagged [browser] to parent
expose-src calculateTotal from "calculate-total.ts" to descendants
```

If no explicit assignment exists, default to `[testing]` for a testing owner
and `[]` otherwise. Every explicit assignment by a testing owner must include
`testing`; `tagged []` and `tagged [browser]` are invalid there. A browser
module does not automatically tag its symbols `browser`.

Tag order is immaterial. `testing` and `browser` are the only tag tokens in
version 1. Project labels can be recorded in comments or separate metadata;
they cannot define availability rules. Re-exposure always carries the
original assigned set, including when a testing module forwards a production
child's symbol.

### Exposure Evaluation Is Grounded And Independent Of Statement Order

For each module `M`, let `N(M)` map its exposed names to original symbol
identities. Let `U(M)` and `D(M)` be the sets of original symbols it effectively
exposes to parent and descendants. Resolve modules from leaves toward the root,
so every direct child's names, tags, and effective exposure sets are known
before processing its parent.

For a module `M`:

1. Resolve every `expose-src` selection to its original owned symbol and
   collect the owner's tag assignments and defaults.
2. Resolve every named `expose-sub` selection through the named direct
   child's `N(C)`. An absent name is an error. A resolved symbol not in
   `U(C)` retains its identity but makes that selection ineffective.
3. Expand each wildcard from child `C` into exactly the pairs `(name, S)`
   in `N(C)` for which `S` is in `U(C)`, keeping the names unchanged.
4. Build `N(M)` from all named selections and wildcard expansions, applying
   any explicit `as` aliases. One name mapping to different symbols is an
   error. Retain resolvable named references even if their exposure is
   ineffective, so an upstream named reference can report a broken chain.
5. Starting with empty `U(M)` and `D(M)`, add each effective selection's
   original symbol to its requested destination sets. Valid owned selections
   are effective; child selections are effective only for symbols in `U(C)`.
   Ignore the parent destination at the root, whose `U(root)` stays empty.

The finite ownership tree and downward-only provider references make this
evaluation finite and independent of statement order. Sets combine duplicate
exposures without adding permissions. An empty wildcard contributes neither
a name nor an exposure and is valid.

These sets determine visibility under the importability principles. A module
also receives ancestor exposures to descendants, but needs no statement to
receive them. The grammar has no ancestor-provider form because forwarding
those symbols would add no visibility. Tag compatibility is checked for
imports afterward and never filters wildcard selection or re-exposure.

Child-exposed names select canonical symbols. Upward exposure is checked
for the canonical symbol, including exposure under another alias; alias
spelling cannot create a distinct channel or change reach.

### Validation Distinguishes Invalid Descriptions From Ineffective Exposure

The following conditions are errors. A validator must not publish a valid
application model from descriptions containing them:

| Condition | Reason |
| --- | --- |
| Missing, misplaced, duplicate, or unsupported header; malformed syntax | There is no version 1 document |
| An unquoted reserved keyword used as a name | Keywords cannot identify exports, aliases, modules, or children without quoting |
| Invalid module name or duplicate sibling name | Module identity is ambiguous |
| Missing root description or an invalid nested description | The ownership tree cannot be accepted |
| A module declared inside `src/`, at a reserved container root, or outside its parent's `subs/` | The required module layout is violated |
| Application source outside its owner's `src/`, including loose source in grouping directories | The implementation scope would be incomplete |
| Missing source path, excluded target, symlink traversal, escape from `src/`, or a non-file target | The source reference has no valid application target |
| A source file owned by another module or a foreign forwarding export claimed as owned | Source references cannot transfer ownership |
| An `expose-sub` name that is not a declared direct child | The reference does not identify a permitted provider |
| A missing source export or undeclared child-exposed name | The named reference does not exist |
| An ambiguous exposed name, including a collision introduced by a wildcard | There is no unique original symbol |
| A wildcard on `expose-src`, a path on `expose-sub`, or a tag clause on `expose-sub` | The statement uses the wrong declaration form |
| Unknown or repeated tag; repeated destination in one list | The declared set is malformed |
| Conflicting tag assignments, a tag clause on re-exposure, or a testing assignment omitting `testing` | Symbol tags violate their ownership contract |

The following are accepted and may produce advisory diagnostics:

| Condition | Effect |
| --- | --- |
| A resolved named child symbol is not exposed to parent | That selection is ineffective and adds no exposure |
| Exposure to parent at the application root | No effect |
| A wildcard over a child with no effective upward exposures | Empty selection; no effect |
| Repeated exposure of the same symbol to the same destination | Set union; no extra effect |

Diagnostics must identify the description file, location, and failed
reference or rule. They must not infer missing tags, grant a missing exposure,
or silently ignore an invalid declaration to make the model appear valid.

### Test Placement Follows Ordinary Ownership

A co-located `src/place-order.test.ts` remains owned by `orders`. Its
filename gives it no additional cross-module permissions. It can import
same-owner symbols freely, including same-owner test support, but importing
foreign testing-tagged support requires a testing module and valid exposure.

A separately declared `subs/tests/` module uses its own
`module tests tagged [testing]` header. It has no private access to its
parent. It sees selected parent support exposed to descendants, along with
any other symbols that the ordinary tree rules make visible. Browser tests
can declare `tagged [testing, browser]` and must satisfy both rules.

Neither `tests`, `testing`, `ui`, nor `client` in a path assigns tags.
Extracting a testing module requires placing its source under that child's
own `src/` beneath `subs/`, then reevaluating imports under the new ownership.
A description inside the original implementation's `src/` is invalid.

### Description Syntax Does Not Define Consumer Import Syntax

The format records source identities, original tags, and exposure decisions.
It does not define a custom TypeScript import specifier, generated facade,
package export, or dependency allowlist. Any source resolver or generator
must preserve the importability principles and the identities described here.

The source interpretation specification defines resource interpretation and
proposes the remaining symbol selection, binding classification, and diagnostics
for TypeScript source forms separately from the `module.ramify` parser.

The existing evaluator accepts constructed module trees; it does not yet
discover directories, parse this language, or resolve TypeScript exports.
Those integrations must implement this specification before tooling can
claim support for `module.ramify` version 1.
