# TypeScript Source Interpretation Principles

**Status:** Active specification. The source interpretations and reporting
policy below are definitive. The source-analysis integration is not implemented;
the current evaluator also predates the resolved tag registry and same-module
test areas. Specification status does not establish implementation support.

## Purpose

Define how TypeScript source becomes the symbol-and-binding questions answered
by the [Cross-Module Importability Principles](cross-module-importability.principles.md).
The [Glossary](glossary.md) defines the model's vocabulary, and
[Directory Structure And Module Description Principles](module-description.principles.md)
defines ownership discovery and the `module.ramify` format.

Those documents remain authoritative in their scopes. This document preserves
their ownership, exposure, and tag semantics. It defines source-area and
resource interpretation, symbol selection, value versus type-only requests,
and reporting for forms that cannot be checked. Ramify provides useful,
bounded architectural assistance while supporting ordinary initialization and
lazy-loading workflows; it does not prove exhaustive runtime dependency closure.

## Goals

- Give source checkers the same questions to ask about the same program.
- Preserve original symbol ownership through imports and forwarding exports.
- Determine import forms without depending on subsequent usage or compiler elision.
- Keep source re-exports distinct from Ramify exposure declarations.
- Distinguish a denied import from source that could not be checked.
- Fail definite violations while reporting analysis limits as nonblocking
  coverage notes by default.

## Principles

### Source Interpretation Produces Individual Import Questions

The integration receives the application source set, its valid ownership and
exposure model, its resolved tag registry, and the TypeScript project
configuration used to resolve its source. Compiler-loaded dependencies do not
automatically join that source set.

For each supported source construct, it produces a set of requests:

> `(importing file, original symbol, binding form)`

The binding form is `value` or `type-only`, after resolving whether the original
exists only as a type as described below. Retain the written source form
separately for source diagnostics and runtime-load analysis. Each request uses
the importing file's module for visibility and its source area's classification for
availability, together with the original symbol's owner, defining source area,
and tags. Interpretation also retains the resolved source/resource target for
the adopted testing-origin check below. Every request must pass. A declaration
is not allowed merely because one of its bindings is allowed. Repeated requests
are harmless; a value request cannot be weakened by also requesting the same
symbol as a type.

Each source occurrence is checked regardless of whether its binding is used,
its branch executes, or a bundler removes it. Interpretation also records any
runtime load with no runtime symbol to check, as specified below. An empty
request set alone does not establish that a source construct is allowed.

Same-owner symbol imports retain the exemption from exposure and tag checks
after the adopted testing-origin restriction has passed. A forwarding path
through testing source does not bypass that restriction even when the original
symbol is owned by the importing module.

### Source Areas Determine Importer Classification And Testing Origin

**Adopted.** Each module owns its `src/` directory, including optional
`src/tests/` and `src/interfaces/` directories. Ordinary source excludes the
nested `src/tests/` area; interface vocabulary remains ordinary source. These
areas share ownership and module-scoped visibility. Children are declared
under `subs/`; neither nested directory creates a child module.

The module header classifies ordinary source. Its `src/tests/` always carries
`testing` plus every required-importer tag in that header, as defined by the
resolved registry. Required-symbol tags are not inherited; there is no profile
override or extension. With the default registry, `[ui, dispatch, browser]`
source has `[testing, ui, dispatch]` in `src/tests/`. Resolve the nested testing
area before the ordinary `src/` area; their profiles are not combined. All files
within one source area use the same classification; there are no per-file
contexts or filename-based exceptions. For example,
`src/place-order.test.ts` still uses the module header's classification.

Tests needing additional tags use a separate testing module and live in its
ordinary `src/`. For example, a `[testing, ui, browser]` module classifies those
files with all three tags; its optional `src/tests/` still derives
`[testing, ui]`. Testing-source isolation applies to the module's ordinary
source too, because its header includes `testing`. The separate owner has no
same-owner exemption for imports from the implementation it tests: exposure
and all applicable tags, including runtime promises, must pass.

Each new owned binding records its original defining source area and must
carry all of that area's required-importer tags. Omission defaults to exactly
that set; an explicit assignment may add tags but cannot remove required ones.
This applies to unexposed exports, new wrappers and type aliases, and resource
bindings. Required-symbol tags are never assigned automatically. A forwarding
alias preserves the original binding's identity, defining area, and tags; it
does not acquire the forwarding area's tags.

Owned exposure uses exact source references: `expose-src` selects an export
of a file under the owner's `src/`, and `expose-test` selects an export of a
file under its `src/tests/`. Both forms can address nested testing source;
classification follows the resolved file, not the exposure verb.
A same-owner forwarding export still identifies its
original binding, even across these two areas. Neither operation changes
that binding's source origin or tag requirements; `expose-sub` forwards a
child's exposure without claiming ownership.

A non-testing source area cannot import or re-export testing-classified
application source or resources, even within the same module and even as
types. Check both the resolved source/resource being accessed and the original
binding's defining source area. Follow forwarding paths without dropping this
information. Thus a production symbol forwarded by a testing barrel keeps its
production identity, but non-testing source still cannot import that barrel.
Likewise, a non-testing barrel cannot make a testing-origin binding usable.
This restriction also applies when there are no selected symbol bindings;
importing a testing stylesheet for its side effects does not escape it.

This source-origin restriction is distinct from symbol-tag checks. An
explicitly `testing`-tagged binding newly defined in a non-testing `src/` area
retains the ordinary same-owner tag exemption. Its tag still restricts
cross-module importers. After the origin restriction passes, same-owner
imports need no exposure and receive the remaining tag exemptions. Across
modules, required-importer tags restrict both values and types; required-symbol
tags restrict values only. There is no general ban on symbol-free cross-module
runtime loads. The testing-origin restriction applies to those loads too.

### Resolution Preserves The Original Binding

Resolve TypeScript specifiers with the project's resolution configuration,
including ordinary extension substitution and path aliases. This is distinct
from the exact source-file paths in `expose-src` and `expose-test`; those
declaration paths retain the rules of the module-description specification.

Follow named imports and forwarding exports to the original binding. The
owner is the module containing that binding's application source, not the
module containing an intermediate barrel. Its defining source area also
survives forwarding, independently of the source areas along that path.
The symbol catalog must include
unexposed source exports so that aggregate imports cannot silently omit them.
Resource bindings follow the adopted resource interpretation below: their
original target is the resource, and the location of a declaration describing
their types does not establish ownership.

Consumers importing through a barrel are checked against the original owner
independently of the barrel's own checks. A barrel cannot make an unavailable
symbol available. Aliases in TypeScript or `module.ramify` preserve identity
and tags. A new implementation binding is distinct from a forwarding alias;
this integration does not track arbitrary runtime values through function
calls or object properties.

A code symbol whose original declarations span more than one application
module has no single owner under the current model and must be reported as
unverifiable. If original declarations span differently classified source
areas and one original defining area cannot be established, report the binding
as unverifiable rather than choosing the less restrictive area. Shared resource
type declarations do not create shared ownership or change resource origin.
Compiler resolution errors and ambiguous exports must not be resolved by arbitrarily
choosing a declaration. References through compiled copies of application code
must map back to their original bindings or be reported as unverifiable; a
compiled copy does not turn application code into an external dependency.

### Resource Bindings Belong To The Resolved Resource

Application resource bindings belong to the resolved resource's owning module
and source area, and have identities specific to that resource, independently
of declarations describing their types. Applying one declaration shim to two resources produces
distinct binding identities. Aliases of the same binding within one resource,
and forwarding aliases in other files, preserve that resource binding's
identity and tags.

Exported names come from the effective export description selected or supplied
by TypeScript for the target. A declaration describing a resource supplies
those names for each resolved resource separately; its own location does not
become the resource's owner or source area. TypeScript can also supply the
description directly, as with a JSON file under `resolveJsonModule`; a physical `.d.ts`
file is not required. The loader supplies runtime values, while declarations
describe their types. TypeScript documents both
[resource declaration files](https://www.typescriptlang.org/tsconfig/allowArbitraryExtensions.html)
and [JSON interpretation](https://www.typescriptlang.org/tsconfig/resolveJsonModule.html).

These bindings follow ordinary ownership, source-area, exposure, and tag rules.
A resource in the application source set can be an `expose-src` target within
its owner's `src/`, or an `expose-test` target within its owner's `src/tests/`,
under the same exact-path and ownership constraints as other files. For example,
`expose-src default from "theme.module.css" to parent` selects that resource's
default export when its effective description declares one. A same-owner
barrel can forward that binding while preserving its resource identity, owner,
defining area, and tags. Same-owner imports retain the exemption from exposure
and tag checks after the adopted testing-origin restriction passes. A resource
under `src/tests/` cannot be accessed by non-testing source through a production
barrel or a declaration shim.

Matching a declaration shim alone establishes neither a resource's existence
nor its ownership. An application resource must resolve to an existing file
in the application source set. A shim cannot make an application resource
external. Established external targets retain the external-target treatment.
For source imports, inability to establish the target or its export description
makes the access unverifiable. If the export description is known, selecting
an absent name is a missing-export error. Description validation still rejects
an `expose-src` or `expose-test` declaration naming a missing target or missing
export.

Runtime loads without runtime value bindings follow the separate
[runtime-load policy](#runtime-loads-without-a-symbol-retain-source-origin-checks):
testing-source isolation still applies, without a general cross-module load ban.

### Explicit Bindings Are Classified Individually

For named and default imports, and named forwarding exports, an explicit
declaration-level or binding-level `type` modifier produces a `type-only`
request. An unmarked binding records the ordinary (`value`) source form.
If its resolved original exists only as a type, such as an interface or type
alias with no merged value binding, produce a `type-only` availability request.
Otherwise produce a `value` request, even if later usage or compiler elision
would remove the import. This is Ramify's availability classification, not a
prediction of emitted JavaScript.

An unmarked import of a purely type original therefore does not require the
original's `browser` promise. Exposure, required-importer tags such as `ui` and
`testing`, and the testing-origin restriction still apply. A class, function,
or other original with a value binding keeps the value check unless the import
is explicitly type-only. Runtime values described by `.d.ts` files, including
resource bindings, do not become purely type originals because their
implementation is absent from the declaration file. Unresolved or ambiguous
originals cannot receive this exemption by assumption.

Compiler validity is separate from the Ramify availability decision. Exercise
unmarked type imports with a compiler configuration that permits that syntax;
a compiler diagnostic must not be relabelled as a missing `browser` promise.
Preserving the written source form also records potential initialization:
a type-only availability request alone does not establish that the entire
statement is erased. It does not create a separate runtime-load prohibition.

```ts
import { type Order, placeOrder } from '../orders/src/order.js';
```

This produces a type-only request for `Order` and a value request for
`placeOrder`. The importing source area's tags and the resolved registry
determine the applicable availability rules; local aliases
do not affect either request. A default import
selects the target's default export and follows its original identity.

The same classification applies to `export type { ... }` and inline
`export { type ... }`. Type-only imports may refer to value declarations, for
example to use a function's type without importing its runtime binding.
[TypeScript documents these type-only forms](https://www.typescriptlang.org/docs/handbook/modules/reference.html#type-only-imports-and-exports).

### Namespace Imports Check Explicit Member Selections

For `import * as ns`, check identifiable member selections rather than treating
the declaration alone as a request for every export. The bounded profile
supports direct `ns.name`, literal-key `ns["name"]`, and object destructuring
with explicit keys, including local renaming. Qualified type references such
as `ns.Order` also identify a selection. Each selected original receives the
same value-versus-type classification as an explicit named binding.
`import type * as ns` produces type-only requests for its selected members.

Adding an unrelated private export must not invalidate an existing explicit
member selection. No subsequent-use analysis weakens a selected runtime
original to a type request merely because its value is not used at runtime.
Purely type originals remain type-only; interfaces are not runtime namespace
properties. [TypeScript namespace semantics](https://www.typescriptlang.org/docs/handbook/modules/reference.html#importing-and-exporting-typescript-specific-declarations)
determine which bindings exist in each form.

An unknown computed key, a namespace passed to unknown code, object rest, or
other unsupported data flow makes that portion unverifiable. Continue checking
identifiable selections and report the uncovered portion; do not silently
accept the namespace's contents or treat escape as a definite violation.
The profile does not require exhaustive namespace data-flow analysis.

### Source Re-Exports Are Imports By The Forwarding File

`export { name } from '...'` produces a request by the forwarding file, using
that file's source-area classification, for each selected original symbol.
The adopted testing-origin restriction also checks the resolved source target.
Named type-only re-exports follow the preceding
binding classification. A local `export { name }` of an already imported
binding does not replace or weaken the request at its import declaration.

An ordinary `export * from '...'` selects the target's star-exported bindings:
runtime bindings produce value requests and purely type exports produce
type-only requests. Star selection excludes `default`, follows the language's
export-resolution rules, and must not silently discard unresolved or ambiguous
bindings. A downstream file's use of only one member does not narrow the
forwarding file's selection. The exclusion of `default` follows
[ECMAScript export resolution](https://tc39.es/ecma262/2026/multipage/ecmascript-language-scripts-and-modules.html#sec-resolveexport).

`export type * from '...'` applies type-only checks to that selection.
`export * as ns from '...'` selects the whole target namespace, including its
default member; `export type * as ns` applies type-only checks throughout.
These [type-only star forms](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html#support-for-export-type-)
must not be classified as runtime re-exports.

A forwarded namespace retains its constituent original identities. Consumers
check explicit member selections under the namespace rules above; this does
not narrow the forwarding file's deliberate whole-namespace re-export check.
The analyzer must not invent a new owned wrapper symbol to bypass permissions.
Nested namespace selections preserve identities likewise. An expansion or
selection whose original bindings cannot be established is unverifiable;
known selections must still be checked.

Passing a source re-export check creates no Ramify exposure. The owner still
needs an exposure declaration, and onward exposure still follows the module
tree. This differs from `expose-sub`: a Ramify declaration may forward a visible
symbol even when the forwarding module's files cannot import it. For example,
an untagged parent can forward test support in `module.ramify` while being
forbidden to create a barrel in its non-testing `src/` that imports that support.
The parent's `src/tests/` area may import it only when ordinary visibility and its
own source-area classification permit that access.

### Runtime Dynamic Imports Preserve Explicit Selections

Resolve a string-literal `import('...')` target and check explicitly selected
runtime members. Lazy loading alone does not request every export. Purely
type exports are absent from the runtime namespace. The bounded profile
supports these selections, including `default` when present:

| Source form | Symbol requests |
| --- | --- |
| `(await import('./view.js')).View` | Value request for `View` |
| `const ns = await import('./view.js'); ns["View"]` | Value request for `View` |
| `const { View: LocalView } = await import('./view.js')` | Value request for `View` |
| `import('./view.js').then(m => m.View)` | Value request for `View` |
| `import('./view.js').then(({ View }) => View)` | Value request for `View` |
| `await import('./register.js')` with its result discarded | No symbol request; retain the target's source-origin check |

Direct callback selections also support literal keys such as `m['View']`.
Unknown keys, namespace escape, and unsupported flows follow the same partial
coverage policy as static namespaces. Identifiable violations still fail.

Nonliteral specifiers, including template literals, are unverifiable in this
bounded profile unless an integration explicitly resolves a finite target set.
Every known possible target and selected binding must pass. An unknown target
cannot be assumed external or same-owner.

A tool adapter may preserve named eager or lazy selections from a macro such
as a Vite glob using the actual project configuration and resolved targets.
It must check every selected original without widening a named selection to
all exports. Without that adapter, report unsupported macro access as a
nonblocking coverage note. No eager rewrite or generated registration layer is
required by these principles.

### Import Types Produce No Runtime Load

Type-position `import('...').T` produces a type-only request for `T`.
`typeof import('...').value` produces a type-only request for the named value's
type. An unqualified `typeof import('...')` selects the types of all runtime
namespace members, each checked with type availability. Qualified selections
that denote namespaces expand their members using type-only checks.

These forms are identified by their TypeScript syntax-tree position, not by
searching for the text `import(`. They are not runtime dynamic imports. The
same interpretation applies to supported JSDoc import-type expressions.
[TypeScript import types](https://www.typescriptlang.org/docs/handbook/modules/reference.html#import-types)
provide these references without a runtime import declaration.

### Runtime Loads Without A Symbol Retain Source-Origin Checks

There is no general ban on symbol-free cross-module runtime loads. Side-effect
imports, empty imports and re-exports, initialization modules, stylesheets,
and discarded dynamic-import results do not need dummy exported functions or
a new file-level exposure declaration. An explicit registration API is an
application design option, not a Ramify requirement.

Resolve known application targets and apply testing-source isolation even
when no symbol is selected. Non-testing source loading testing-classified
source is denied, including same-owner loads. An unknown target or source
area remains unverifiable. Established external targets follow the scope
rules below. Any selected bindings still require their ordinary symbol checks.

```ts
import type { Order } from '../orders/src/order.js'; // Only a type request.
import { type Order } from '../orders/src/order.js'; // Also a runtime load.
```

The second form can retain `import {} from '...'` under `verbatimModuleSyntax`.
Erasing a binding is not the same as erasing the statement.
[TypeScript's documented emit example](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html)
illustrates that distinction. Both forms are permitted when their type-only
requests and source-origin checks pass. Potential file initialization does
not add a required-symbol tag check to a type-only request.

Ordinary authorized value imports may still execute file initialization.
Mixed barrels can also initialize runtime dependencies. The original-symbol
decision does not add a transitive path-tag restriction because a compatible
symbol passed through a differently classified barrel. Testing-source isolation
still applies along forwarding paths. Verification of a symbol's browser-safety
promise remains a separate owner obligation; a passing bounded source check
does not certify runtime closure.

### Scope And Unsupported Forms Are Reported Explicitly

The initial interpretation covers ECMAScript imports and exports in application
source analyzed by TypeScript, including the type forms above. File ownership
and source-area classification come from the application source set, module
layout, and declarations, never from the spelling of a specifier or a test-like
filename. The reserved `src/tests/` area is part of that declared layout; arbitrary
directories named `testing` or `ui` do not establish a source area.

| Form or target | Treatment |
| --- | --- |
| `import x = require(...)`, `export =`, and CommonJS `require`/export patterns | No cross-module interpretation is specified in this profile. Report potentially cross-module application access as unverifiable. Proven same-owner access retains the model's exemption only after the adopted testing-origin restriction passes; unknown source origin cannot be assumed non-testing. |
| Triple-slash references | Interpret as compiler inputs, not as requests for every symbol in the referenced file. They create no Ramify exposure and cannot silently change application ownership. |
| Ambient declarations and module/global augmentations | Resource shims follow the adopted resource rule. Other external declarations remain outside the application tree. Application constructs that introduce shared globals, ambiguous ownership, or dependencies not representable by the requests above are unverifiable in this profile. |
| Packages, built-ins, and standard-library declarations outside the application | Outside the application symbol-exposure model. Report that scope explicitly; do not fabricate an owning Ramify module. Browser-safety verification may still inspect runtime dependencies. |
| Stylesheets, JSON, and other non-code resources | Bindings belong to the resolved resource's owner and source area, with identities specific to that resource and names from its effective TypeScript export description. Ordinary exposure, tag, and testing-origin rules apply. A shim alone proves neither resource existence nor external status. Unestablished targets, source areas, or export descriptions are unverifiable. Symbol-free loads retain testing-source isolation without a general load ban. See the [resource principle](#resource-bindings-belong-to-the-resolved-resource). |
| Tool-specific loaders or macros, including Jiti calls and Vite globs | Use a supported adapter to resolve actual targets and selections, or report the unsupported portion as unverifiable. Do not interpret an arbitrary `.import()` method as native ESM import. |
| Unresolved specifier or original binding | Unverifiable, even when the compiler accepts it through an uninformative declaration or an `any` type. |

Triple-slash references can affect which files enter a TypeScript compilation;
they are not ordinary symbol import declarations.
[TypeScript's directive reference](https://www.typescriptlang.org/docs/handbook/triple-slash-directives.html)
defines those compiler effects. Application code cannot be excluded from the
source set merely to bypass Ramify. An integration must not label an unknown
target external simply because resolution failed.

### A Check Result Accounts For Every Relevant Construct

Report these outcomes separately, retaining the source file and location:

- **Allowed:** the identified application symbol request and its source-origin
  checks pass, or a fully resolved symbol-free load passes its origin check.
- **Denied:** an identified request fails an importability rule or violates
  testing-source isolation. Identify the source/resource or symbol and rule.
- **Unverifiable:** resolution or supported interpretation is insufficient.
  Identify the construct and what could not be established.
- **Outside scope:** the target is established to be outside the application
  model. This is not an application importability verdict.

One construct can yield several findings, such as an allowed application
binding alongside an unverifiable one. Invalid descriptions, invalid registries,
and established missing exports are errors, not analysis-limit notes. Keep
compiler diagnostics distinguishable from Ramify availability diagnostics.

Report the check result and coverage separately. Definite violations or invalid
inputs fail the check, including when other access is unverifiable. Analysis
limits are nonblocking by default: a completed bounded check may pass with
partial coverage and explicit notes. This result must not certify unchecked
access as allowed or external, or claim complete application conformance.
Scope exclusions and the resolved registry must remain visible in the report.

Execution and capability status are separate too. A requested checker stage
that is unimplemented, skipped, or did not run cannot pass as completed. A
harness requiring that stage must fail its capability check; this differs from
a supported checker completing with documented analysis limits. Diagnostics
do not create exposure declarations or dependency allowlists.

The current evaluator answers the earlier module-level symbol questions only;
it does not yet implement the resolved tag registry, source-area classification,
or testing-source isolation. No TypeScript source checker is implemented.
Adopting this specification does not establish support for these source forms.
