# Directory Structure And Module Description Principles

**Status:** Active specification; filesystem loading and parsing are not yet
implemented in the toolkit. The existing evaluator also predates the resolved
tag registry and separate classification of module-owned `src/tests/` source.

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
defines how resources, consumer imports, and source re-exports are resolved
and checked, including testing-source isolation and bounded analysis coverage.
It does not change this document's declaration grammar.

## Goals

- Make each module's architectural decisions recognizable in one concise file.
- Make recursive searches of a module's `src/` cover its own implementation
  without entering a child's implementation.
- Keep its tests in the same owner under `src/tests/`, with a distinct classification
  and no additional ownership boundary.
- Keep curated contract vocabulary under the same owner's `src/interfaces/`.
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
lie under its owner's `src/`, including `src/tests/` and `src/interfaces/`.
These directories belong to the same module; neither is a submodule.
Attribution of a file outside that source root does
not make its placement valid. Descriptions, documentation, and other
non-implementation files may live at the module root.

A present but invalid description is an invalid boundary declaration. A
loader must report it; it must not silently omit the module and attribute
its files to the parent.

### Module Documentation Lives In Its README

Human-readable module documentation lives in `README.md` beside `module.ramify`.
The description language has no prose-description field. A tour or metadata
adapter reads the README's first top-level prose paragraph as the module's
plain-text purpose summary, skipping headings, lists, tables, and code blocks.
It retains the README path alongside the summary. Missing files or a README
without such a paragraph must be reported explicitly; the adapter must not
substitute another owner's description or infer a purpose from its name.

A README is optional for Ramify layout and importability validity. A reference
project or tour may require one per module as a documentation completeness
check, separate from description parsing and source checks.

### Discovery Covers The Application Tree

Discovery visits the selected application root recursively and validates the
placement of every description. Every non-root module must lie strictly
beneath its parent's `subs/`, optionally through ordinary grouping directories.
The `src/` and `subs/` containers themselves are not module roots. No module
description may occur anywhere inside a module's `src/`, including its
`src/tests/` and `src/interfaces/` directories.

Discovery must detect misplaced descriptions, including those inside `src/`
or outside `subs/`, and report layout errors. It must not ignore
them as ordinary files. Existing projects must adopt this layout before their
descriptions can be accepted; adding marker files alone is not sufficient.

The caller supplies the application source set and discovery exclusions for
installed dependencies, generated outputs, and independent projects. These
are project inputs, not per-module ownership globs. Each application source
file must lie within the selected root and outside excluded directories.
Excluded files cannot be referenced as application-owned exports. Application
implementation must not be excluded merely to bypass the required layout.
Repository build configuration and tooling may be outside the application
source set; executable application code and its same-owner tests and helpers
belong in the owning module's `src/`, with the classification of their source
area. The nested `src/tests/` area has its own testing profile.

A TypeScript dependency or standard-library file does not become application
source merely because the compiler loads it. Treatment of external packages
belongs to the source-analysis integration, not this description language;
the source interpretation specification defines resource and integration
scope rules.

The caller also supplies one resolved tag registry for the entire evaluation;
omission uses Ramify's default registry. Validate it before interpreting any
module's tag declarations. Registry definitions are project-level input, never
local declarations or overrides in `module.ramify`. The registry contract is
specified by the importability principles; its configuration serialization
and explicit default-replacement operation are outside this version 1 grammar.

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
        ├── src/                 # orders' implementation source
        │   ├── place-order.ts
        │   ├── interfaces/      # orders' curated contract vocabulary
        │   │   └── order.ts
        │   └── tests/           # orders' own testing source; not a module
        │       ├── place-order.test.ts
        │       └── helpers/
        │           └── make-order.ts
        └── subs/
            └── pricing/
                ├── module.ramify
                └── src/
                    ├── calculate-total.ts
                    └── tests/
                        └── calculate-total.test.ts
```

The owned source root is exactly `<module>/src/`. The optional testing and
interface directories are exactly `<module>/src/tests/` and
`<module>/src/interfaces/`; these locations are not configurable. All belong
to the same module and may contain ordinary subdirectories, but no declared
submodules. Tests have a distinct classification; `interfaces/` retains the
ordinary source classification. Helpers and resources follow their source area.
`subs/` contains child modules, optionally through ordinary grouping
directories, and no loose parent-owned application source. Each child repeats
the same separation in its own directory.

For every application source file `f` and module `M`, a valid layout satisfies:

> `owner(f) = M` if and only if `f` is beneath `<M>/src/`.

A leaf may omit `subs/`; a module may omit `src/tests/` or `src/interfaces/`
when it has no files for that directory. A module with files only beneath
`src/tests/` has testing source but no ordinary implementation source.
If its `src/` is absent on disk, tooling must
create that exact directory before launching implementation work; it must
never substitute the module root or `subs/` as the implementation scope.
Descriptions and module documentation live alongside `src/` and `subs/`.
A sibling `<module>/tests/` or `<module>/interfaces/` is not an owned source
location.

An implementation agent's working directory and default code-search root
are the module's `src/`, including its tests and interface vocabulary. A
production-only search must exclude testing-classified source: `src/tests/`
and the ordinary `src/` of modules tagged `testing`. The launcher
must supply the module description,
relevant documentation, and permitted contracts as initial context. Expanding
reads beyond that scope is deliberate navigation; write authority is checked
separately. A directory layout alone is not a write-access control mechanism.
Work on the module's owned tests uses its `src/tests/` scope without entering child
implementations. If that scope is absent, create that exact directory before
launching work there; do not substitute a child module or the module root.

Adding a new child leaves existing parent source in place. Extracting an
ordinary implementation directory into a child requires moving its source
from `<module>/src/...` to `<module>/subs/<child>/src/...` and updating
references. Adding a description inside the old source location is invalid.
Tests moved with that implementation go from `<module>/src/tests/...` into the
new child's `src/tests/`. Interface vocabulary moved with it goes into the
new child's `src/interfaces/`. Tests left with the parent remain parent-owned and no
longer have same-owner access to the extracted implementation.

Neither a package, a TypeScript project, nor a separate build is required
per module. `facade/`, `internal/`, `index.ts`, `client.ts`, and `vocabulary.ts`
are not required and have no implicit Ramify meaning.

### The Two Owned Source Areas Have Explicit Classifications

The module header's tags classify source under `src/` outside `src/tests/`,
including `src/interfaces/`. Omission means the empty set. The fixed
`src/tests/` area has a fixed derived profile: `testing` plus every header tag
whose resolved kind is required importer. Required-symbol tags are not inherited.
This profile cannot be overridden or extended.

Classify a file beneath `src/tests/` with the test profile before applying
the ordinary `src/` profile. The two areas are disjoint even though their
directory roots are nested; a file never receives both profiles by containment.

```ramify
ramify 1
module checkout-view tagged [ui, browser]
```

This module's `src/` is classified `[ui, browser]`, while its `src/tests/`
has `[testing, ui]`, allowing Node-based UI test
harnesses to import otherwise reachable Node contracts while retaining UI
classification. `browser` remains an independent requirement for cross-module
value imports, not a synonym for `ui`.

Tests requiring additional tags use a separately declared testing module
under `subs/`. Declare its tags on the module header and put its test code in
its ordinary `src/`. A module tagged `[testing, ui, browser]` therefore has
browser-classified test code in `src/`; its optional `src/tests/` still derives
`[testing, ui]`. The separate owner needs ordinary exposure and tag compatibility
for foreign symbols, including exports of its parent.

The following examples use the default registry:

| Module header tags | Derived `src/tests/` profile |
| --- | --- |
| `[]` | `[testing]` |
| `[browser]` | `[testing]` |
| `[ui]` | `[testing, ui]` |
| `[ui, browser]` | `[testing, ui]` |
| `[ui, dispatch, browser]` | `[testing, ui, dispatch]` |
| `[testing, browser]` | `[testing]` |

The same derivation applies to project-defined names: if `worker` is a
required-importer tag and `edge` a required-symbol tag, a `[worker, edge]`
header gives `[testing, worker]` in `src/tests/`.

There are no per-file or glob overrides, named profiles, or classification
inheritance into submodules. Ordinary directories within either area retain
that area's classification. A `src/example.test.ts` filename does not change
its classification. The special classification belongs to the module's exact
`src/tests/` subtree, not to every directory named `tests`: for example,
`src/helpers/tests/` and `src/interfaces/tests/` retain the module header's
profile. Files under `src/tests/interfaces/` retain the testing profile.

Tests can import their owner's `src/` exports without exposure declarations.
They must use ordinary exposure and tag compatibility for foreign symbols.
Non-testing-classified source cannot import or re-export testing-classified
source, including same-owner source, forwarding paths, and runtime loads.
Other same-owner imports remain free of exposure and symbol-tag checks. This
source isolation is specified by the importability and source interpretation
principles; it is not an additional exposure destination.

### Interface Vocabulary Belongs Inside The Owned Source Root

`<module>/src/interfaces/` holds curated contract vocabulary, such as types,
schemas, enums, and constants. It is not restricted to TypeScript interfaces.
It remains ordinary source of that module: the directory creates no owner,
importer profile, tag, or exposure channel, and does not expose its contents
automatically. Owned tests may inspect it under the ordinary same-owner rules.

Use paths such as `"interfaces/order.ts"` in `expose-src` statements. An owner
may select named exports or use `*` to expose all exports of that one file.
Only files beneath this owner's `src/interfaces/` permit owned-source wildcard
selection; creating the directory does not expose anything automatically.
The statement still chooses its file and destinations. The
[interface-file wildcard rules](#interface-file-wildcards-select-all-exports-of-one-owned-file)
define expansion and preserve ordinary ownership and tag checks.

### Declared Names Identify Modules Within The Tree

The required `module` statement gives the module its local name. After decoding
any quotes, that name must match `[a-z][a-z0-9]*(?:-[a-z0-9]+)*` and be unique
among direct siblings, including siblings placed in different ordinary grouping
directories. A name equal to a reserved keyword requires double quotes in both
its declaration and explicit child references. Other module names may also be
quoted; quoting does not change module identity or relax the name constraint.

The root's identifier is its name. Every other canonical module identifier
is its parent's identifier, `/`, and its local name: `shop/orders/pricing`.
Ordinary directory names, `src`, `tests`, `interfaces`, and `subs` contribute no identifier
segments. A separately declared child named `tests` remains possible beneath
`subs/`; its reserved name must be quoted in its header and child references.

Renaming a physical directory while preserving declared name and parent
preserves the identifier. Child references in descriptions use that declared
name, so moving a child through ordinary grouping directories requires no
description-path update.
Changing the declared name or parent changes the identifier. Neither the
name nor identifier assigns tags or grants importability.

### A Description Is Static Architectural Data

A version 1 description contains a version header, one module declaration,
and zero or more `expose-src`, `expose-test`, or `expose-sub` statements.
It is parsed as data and never executed.
There are no expressions, variables, imports, includes, conditional blocks,
or configuration inheritance.

Ownership follows from the source file's owning module. Receipt follows from
exposure. There are no `own`, `receive`, `expose`, or `re-expose` statements.
The three supported exposure verbs identify distinct declaration forms for
the same semantic exposure operation.

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
exposure-line  = source-line | test-line | sub-line ;
source-line    = "expose-src", hws, whole-selection, source-tail ;
test-line      = "expose-test", hws, selection-list, source-tail ;
source-tail    = hws, "from", hws, STRING,
                 [ hws, tag-clause ],
                 hws, "to", hws, destination-list, LF ;
sub-line       = "expose-sub", hws, whole-selection,
                 hws, "from", hws, module-name,
                 hws, "to", hws, destination-list, LF ;
whole-selection = selection-list | "*" ;

selection-list = selection, { ows, ",", ows, selection } ;
selection      = name, [ hws, "as", hws, name ] ;
name           = BARE-NAME | STRING ;

module-name    = BARE-MODULE-NAME | STRING ;
tag-clause     = "tagged", hws, "[", ows, [ tag-list ], ows, "]" ;
tag-list       = tag, { ows, ",", ows, tag } ;
tag            = "testing" | "browser" | "ui" | BARE-MODULE-NAME ;
destination-list = destination, { ows, ",", ows, destination } ;
destination    = "parent" | "descendants" ;

hws            = ( SPACE | TAB ), { SPACE | TAB } ;
ows            = { SPACE | TAB } ;
```

- The reserved keywords are exactly `ramify`, `module`, `expose-src`,
  `expose-test`, `expose-sub`, `from`, `as`, `tagged`, `to`, `parent`,
  `descendants`, `testing`, `browser`, and `ui`. They are reserved in every name
  position: a source export, child-exposed name, alias, module declaration, or child reference equal to
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
  `from`; tag values must use bare tag names and destinations their bare keywords.
- Lists have no trailing comma. Tag and destination lists contain no duplicate
  items. The version header accepts only `1`; unknown versions are errors.

Tag names use the lower-case, hyphen-separated spelling of `BARE-MODULE-NAME`,
with `testing`, `browser`, and `ui` also accepted despite their legacy keyword
status. Every use must resolve in the evaluation's registry. Thus `dispatch`
and registered project tags are valid without adding grammar keywords;
registering a tag does not reserve its name in export or module-name positions.
Registering tags does not extend the fixed keyword list. Quoted tags and unknown tag names
are errors. The three explicit alternatives in `tag` preserve existing lexical
syntax; they do not grant these names extra matching or propagation semantics.

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
at least one destination for every exposure statement. `expose-src` and
`expose-sub` accept bare `*` as their entire selection; neither can combine
`*` with named selections or apply `as` to it. Semantic validation permits
`expose-src *` only when the resolved file is beneath the declaring owner's
`src/interfaces/`. `expose-test` accepts named selections only.
Of the exposure statements, `expose-src` and
`expose-test` accept `tagged`; the module header also accepts its own tag clause.
There is no test-profile declaration: a standalone `tests tagged [...]`
statement is invalid. The word `tests` is an ordinary name, so a separate
testing module may use `module tests tagged [testing]`.
Semicolons, implicit sources, JSON objects, and unknown clauses are invalid.
A quoted export name `"*"`, if one exists, names that exact export; it is
never a wildcard.

### Exposure Statements Name Symbols And Destinations

An exposure statement has this interpretation:

```ramify
ramify 1
module orders

expose-src placeOrder from "place-order.ts" to parent
expose-src Order from "interfaces/order.ts" to parent, descendants
expose-test makeOrder from "helpers/make-order.ts" to descendants
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
equivalent to two exposure statements. Exposure statement order has no semantic
effect; the version and module headers retain their required positions.

There is no declaration for a consumed import. There is also no requirement
to enumerate source exports that are not exposed. Unlisted exports remain
owned and unexposed, with the default symbol tags required by their original
source classification.
Version 1 has no separate statement for tagging an unexposed export.

### Owned Exposure Selects Exports Within Its Fixed Source Root

For both owned exposure forms, `from` is a quoted file path relative to the
declaring module's corresponding root:

| Form | Reference root | Example |
| --- | --- | --- |
| `expose-src` | `<module>/src/` | `"order.ts"` selects `<module>/src/order.ts` |
| `expose-test` | `<module>/src/tests/` | `"helpers/make-order.ts"` selects `<module>/src/tests/helpers/make-order.ts` |

No root prefix is required or automatically removed. For example,
`expose-src ... from "src/example.ts"` refers to `<module>/src/src/example.ts`,
and `expose-test ... from "tests/example.ts"` refers to
`<module>/src/tests/tests/example.ts`.

Because the testing directory is nested under `src/`, `expose-src` can also
select the same file with `"tests/helpers/make-order.ts"`. Both forms identify
the same original binding and preserve its testing classification and tags.
The exposure verb never determines whether source is testing. `expose-test`
provides a reference relative to the testing directory.

After string decoding, the path must be relative, use `/` separators, and
contain no backslash or empty path segment. Normalize `.` and `..` segments
before containment checks; the target must remain inside the declaring module's
selected `src/` or `src/tests/` root and outside discovery exclusions. Escaping
the selected root with `..` is invalid even when another owned area is reached:
`expose-src ... from "../tests/helper.ts"` and
`expose-test ... from "../interfaces/order.ts"` are invalid references. A terminal `/`
is invalid because the target must be a file. Absolute and drive-qualified paths, URLs,
package resolution, path-alias expansion, and globs are unsupported.

The target is an exact application source file: there is no extension
substitution, extension probing, implicit `index.ts`, or search for a file
exporting the selected name. Each selection identifies an exact export name
of that target, including `default` for a default export. The target file and
the selected export must both belong directly to the declaring module.

A resource file in the application source set is a valid `expose-src` or
`expose-test` target, subject to the same root, path, and ownership constraints
as other targets. Its export names and original binding identities follow the adopted
[resource interpretation](typescript-source-interpretation.principles.md#resource-bindings-belong-to-the-resolved-resource).
The effective declaration describing the resource supplies its export names;
for JSON, TypeScript supplies the export description itself. A shim does not
change the resource's owner or merge its bindings with another resource's.

A local TypeScript forwarding export must not claim ownership of another
Ramify module's symbol. The source analyzer must follow forwarding aliases
to the original project binding; introducing a new implementation binding
is distinct from forwarding one. A same-owner forwarding alias preserves the
original binding's tags even when the selected file and original binding are
in different source areas. `expose-test` does not turn a forwarded ordinary `src/`
binding into test support, and `expose-src` does not remove testing from a
forwarded `src/tests/` binding. The source isolation rule still rejects a
non-testing source file that imports or forwards testing-classified source;
an exposure declaration does not legalize that source access. A misplaced
submodule inside `src/` is a layout error, never a source-reference
shortcut.

An owned exposure must select its exports by name or use the interface-file
wildcard defined below. Files exposed only through named selections retain
the same contract when an unrelated export is added. A wildcarded interface
file deliberately makes every added export part of the selected contract.

### Interface-File Wildcards Select All Exports Of One Owned File

```ramify
ramify 1
module orders

expose-src * from "interfaces/order.ts" to parent, descendants
```

This statement selects every export name of the exact file
`<orders>/src/interfaces/order.ts`, including types, schemas, enums, constants,
and `default` if present. It expands the file's complete effective export
description; it does not filter by symbol kind. The directory curates module
vocabulary, but the selector does not impose a separate ban on function exports.
It neither discovers other files nor exposes types merely referenced by a
selected binding's signature.

Eligibility is checked after the ordinary path normalization and ownership
checks. The resolved file must be beneath `<module>/src/interfaces/`, including
its ordinary subdirectories. A file under `src/tests/interfaces/` or
`src/helpers/interfaces/` does not qualify. Nor does a path such as
`"interfaces/../implementation.ts"` whose normalized target is outside the
interface directory. `expose-test *` is invalid. A module tagged `testing`
can use `expose-src *` for its own `src/interfaces/`; its source classification
and original symbol tags still apply. Directory targets, path globs, excluded
files, and symlink traversal remain invalid source references.

Expansion produces the pairs `(exported name, original symbol)` that named
selections of all the file's exports would produce, with names unchanged.
Every selected original must belong to the declaring module. A same-owner
forwarding alias is valid and preserves the original binding and its tags,
even if that binding is defined outside `src/interfaces/`. A foreign-owned
forwarding export makes the declaration invalid; expansion must not silently
skip it or grant ownership. Resource exports follow the same effective export
description and resource-identity rules as named selections. An incomplete or
ambiguous export description cannot yield a valid partial expansion.

Each selected original receives every listed destination. An optional `tagged`
clause is an ordinary assignment to every selected original, using its defining
source area's required tags; all explicit assignments for an original must
agree. Without that clause, each original retains its separately assigned or
default tags. The wildcard itself never retags an alias or supplies a runtime
promise. Source isolation and source-forwarding checks still apply separately.

Expansion is recomputed from the current file: added exports join the contract
and removed exports leave it. An existing file with no exports has an empty,
valid selection; path and tag-clause validation still apply. Names obey the
ordinary collision rules, including collisions with named selections or other
wildcards. Repeating the same name and original is harmless; the same name
for distinct originals is an error. Use named selections when exclusions or
renaming are needed. Tools must show changes to the expanded contract even
when the wildcard declaration itself has not changed.

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
first enter an exposure chain through an owned `expose-src` selection, named
or expanded from an interface-file wildcard, or a named `expose-test` selection
before a child-contract wildcard can carry it further.

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
curate the contract. All three exposure verbs contribute to the same `parent`
and `descendants` exposure channels; the syntactic distinction introduces no
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
is grounded in explicit `expose-src` or `expose-test` selections. Resolution
follows the tree downward and cannot introduce a cycle of module references. A name supplied
by multiple declarations must identify exactly one original symbol. Wildcard
expansion can copy existing names and identities but cannot invent an origin.

### Tags Are Assigned Once Per Original Symbol

The module header's optional `tagged` clause declares the module's complete
tag set and classifies its ordinary `src/` area, including `src/interfaces/`.
Omission means the empty set. The fixed derived profile classifies the nested
`src/tests/` area, as described above. Neither profile classifies separately
owned submodules.

```ramify
ramify 1
module test-support tagged [testing]
```

A `tagged` clause on `expose-src` or `expose-test` assigns the selected original
symbols' tags, not the tags of a particular exposure channel or source-root
reference. A clause on `expose-sub` is invalid, even if it repeats the original
tags exactly or accompanies `*`.

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

For each original symbol, derive its mandatory tag set from the source area
that originally declares the binding: include every tag whose registry kind
is required importer. This applies equally to default and project-defined
tags. Required-symbol tags are not assigned automatically; in the default
registry, `browser` remains an explicit promise about runtime closure.

If no explicit assignment exists, default to exactly the required tag set.
Every explicit assignment must include that set. Thus all new bindings in
`src/tests/` require `testing`, including helpers with ordinary `.ts` names; the
default tags of new bindings in a `[testing, ui]` test profile are
`[testing, ui]`. An explicit `[browser]` assignment would be invalid for them
because it omits both required tags.

A module's header required-importer tags appear on all its newly owned
exported bindings, including those in `src/tests/`, because its testing profile
must retain those tags. A `[ui, dispatch, browser]` header therefore requires
`[ui, dispatch]` on ordinary bindings and `[testing, ui, dispatch]` on test
bindings by default. Unexposed exports, independently defined type aliases,
new wrappers, and resource bindings follow the same rule. These requirements
do not retag symbols received from another owner.

```ramify
ramify 1
module checkout-view tagged [ui, browser]

expose-src CheckoutView from "checkout-view.tsx" tagged [ui, browser] to parent
expose-test makeCheckoutProps from "helpers/make-checkout-props.ts" tagged [testing, ui, browser] to parent
```

The test area's profile remains `[testing, ui]`. The `browser` tag on
`makeCheckoutProps` is an explicit promise about that exported symbol, not
an override of its defining source area's classification.

Original binding identity, rather than the location of a forwarding alias,
determines these requirements. A `src/tests/` file forwarding its owner's `src/`
binding preserves that binding's original tags; an independently implemented
wrapper in `src/tests/` is a new binding and must carry the test profile's required
tags. The same distinction applies to every required-importer classification.

Tag order is immaterial. Every tag must be defined in the resolved registry;
its kind fixes its availability rule. Re-exposure always carries the
original assigned set, including when a testing module forwards a production
child's symbol.

### Exposure Evaluation Is Grounded And Independent Of Statement Order

For each module `M`, let `N(M)` map its exposed names to original symbol
identities. Let `U(M)` and `D(M)` be the sets of original symbols it effectively
exposes to parent and descendants. Resolve modules from leaves toward the root,
so every direct child's names, tags, and effective exposure sets are known
before processing its parent.

For a module `M`:

1. Resolve owned source references. Expand each valid interface-file wildcard
   to all `(exported name, original symbol)` pairs in that exact file; resolve
   named `expose-src` and `expose-test` selections individually. Check ownership
   for every selected original, and collect tag assignments and defaults using
   that binding's original source classification. A wildcard's tag clause
   applies to every original in its expansion.
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
| A standalone `tests tagged [...]` declaration | The testing profile is fixed by the module header and source layout; it has no declaration syntax |
| An invalid registry, duplicate or conflicting definitions, a per-module override, or removal/rebinding of reserved `testing` | Tag meanings are not valid for one shared evaluation |
| An unquoted reserved keyword used as a name | Keywords cannot identify exports, aliases, modules, or children without quoting |
| Invalid module name or duplicate sibling name | Module identity is ambiguous |
| Missing root description or an invalid nested description | The ownership tree cannot be accepted |
| A module declared inside `src/` (including tests or interfaces), at a reserved container root, or outside its parent's `subs/` | The required module layout is violated |
| Application source outside its owner's `src/`, including sibling `tests/` or `interfaces/` and loose source in grouping directories | The owned source scope would be incomplete |
| Missing source path, excluded target, symlink traversal, escape from the statement's `src/` or `src/tests/` root, or a non-file target | The source reference has no valid application target |
| A source file owned by another module or a foreign forwarding export claimed as owned | Source references cannot transfer ownership |
| An `expose-sub` name that is not a declared direct child | The reference does not identify a permitted provider |
| A missing source export or undeclared child-exposed name | The named reference does not exist |
| An ambiguous exposed name, including a collision introduced by a wildcard | There is no unique original symbol |
| `expose-src *` targeting a file outside the owner's `src/interfaces/`, or any bare wildcard on `expose-test` | Owned-source wildcard selection is limited to interface files |
| A wildcard mixed with names or `as`, a path on `expose-sub`, or a tag clause on `expose-sub` | The statement uses the wrong declaration form |
| An incomplete or ambiguous export description for an interface-file wildcard | The full selected contract cannot be determined |
| Unknown or repeated tag; repeated destination in one list | The declared set is malformed |
| Conflicting tag assignments, a tag clause on re-exposure, or an assignment omitting any required-importer tag of the defining source area | Symbol tags violate their original source classification |

The following are accepted and may produce advisory diagnostics:

| Condition | Effect |
| --- | --- |
| A resolved named child symbol is not exposed to parent | That selection is ineffective and adds no exposure |
| Exposure to parent at the application root | No effect |
| A wildcard over a child with no effective upward exposures | Empty selection; no effect |
| A wildcard over a valid interface file with no exports | Empty selection; no effect |
| Repeated exposure of the same symbol to the same destination | Set union; no extra effect |

Diagnostics must identify the description file, location, and failed
reference or rule. They must not infer missing tags, grant a missing exposure,
or silently ignore an invalid declaration to make the model appear valid.

### Module-Owned Tests Keep Private Access Without A New Boundary

`orders/src/tests/place-order.test.ts` and `orders/src/place-order.ts` share one
owner. The test may import ordinary TypeScript exports from its owner's
implementation without an exposure declaration. Its testing profile also
permits it to import visible foreign testing support, subject to the remaining
tag rules. The test filename is irrelevant: helpers under `src/tests/` have the
same testing classification. Physical nesting under `src/` does not change
their testing profile or make them production source.

In the reverse direction, non-testing-classified `src/` cannot import or
re-export testing-classified source, including same-owner `src/tests/`. Forwarding
an original production symbol through a testing file does not create a route
around that source isolation. A production-owned testing hook declared in
non-testing `src/` remains usable by other files in that same source scope:
the source restriction follows classification, not a blanket prohibition on
same-owner testing-tagged symbols.

A test left at `orders/src/place-order.test.ts` keeps the module header's
classification and receives no special filename-based permissions. A module
may still be wholly testing-classified, with a header such as
`module test-support tagged [testing]`; its `src/` and `src/tests/` both belong to
that owner, and its `src/tests/` profile is determined independently of `browser`.

Tests needing additional tags belong to separately declared testing modules
beneath `subs/`, for example `subs/integration-tests/` with
`module integration-tests tagged [testing, ui, dispatch]`. Their test code
lives in their ordinary `src/` and uses the module header's full tag set.
They have no automatic access to their parent's private exports. They need
ordinary exposure for parent symbols, just like every foreign owner.
Extracting owned tests into such a child therefore changes their permissions;
placing a description inside the original owner's `src/tests/` or `src/` is invalid.

An owner may expose a newly defined testing-only helper or wrapper from its own
`src/tests/` when these tests need controlled access to private implementation.
A forwarding alias preserves the original tags. Exposing an existing production
binding downward can also make it available to other compatible descendants;
the testing module's tags do not narrow that exposure's audience.

Test discovery and production-source selection must account for testing modules'
`src/` as well as the reserved `src/tests/` areas. Classification comes from the
module model; runner and build configuration implement the corresponding selection.

### Description Syntax Does Not Define Consumer Import Syntax

The format records source identities, original tags, and exposure decisions.
It does not define a custom TypeScript import specifier, generated facade,
package export, or dependency allowlist. Any source resolver or generator
must preserve the importability principles and the identities described here.

The source interpretation specification defines resource interpretation,
testing-source isolation, symbol selection, binding classification, and
diagnostics for TypeScript source forms separately from the `module.ramify`
parser. Analysis limits in a completed source check are nonblocking by default;
invalid descriptions or registries still fail model validation.

The existing evaluator accepts constructed module trees with the earlier
module-only classification model; it does not yet support the resolved registry,
distinguish owned `src/` and `src/tests/` importers, enforce testing-source isolation,
discover directories, parse this language, or resolve TypeScript exports.
Those integrations must implement this specification before tooling can
claim support for `module.ramify` version 1.
