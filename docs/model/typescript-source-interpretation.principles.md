# TypeScript Source Interpretation Principles

**Status:** Partially adopted specification. The resource interpretation in
"Resource Bindings Belong To The Resolved Resource" is adopted. Other
source-form policies remain proposals. The source-analysis integration is
not implemented.

## Purpose

Define how TypeScript source becomes the symbol-and-binding questions answered
by the [Cross-Module Importability Principles](cross-module-importability.principles.md).
The [Glossary](glossary.md) defines the model's vocabulary, and
[Directory Structure And Module Description Principles](module-description.principles.md)
defines ownership discovery and the `module.ramify` format.

Those documents remain authoritative in their scopes. This document preserves
their ownership, exposure, and tag semantics. It defines the adopted resource
interpretation and proposes the remaining rules for selecting symbols,
classifying bindings, and reporting source forms that cannot be checked.
In particular, the proposed side-effect restriction is a
new source-form policy; it does not follow from the existing symbol predicate.
If adopted, that restriction must also be stated in the importability
principles, with its TypeScript interpretation kept here.

## Goals

- Give source checkers the same questions to ask about the same program.
- Preserve original symbol ownership through imports and forwarding exports.
- Determine import forms without depending on subsequent usage or compiler elision.
- Keep source re-exports distinct from Ramify exposure declarations.
- Distinguish a denied import from source that could not be checked.

## Principles

### Source Interpretation Produces Individual Import Questions

The integration receives the application source set, its valid ownership and
exposure model, and the TypeScript project configuration used to resolve its
source. Compiler-loaded dependencies do not automatically join that source set.

For each supported source construct, it produces a set of requests:

> `(importing file, original symbol, binding form)`

The binding form is `value` or `type-only`. Each request is evaluated using the
importing file's module and the original symbol's owner and tags. Every request
must pass. A declaration is not allowed merely because one of its bindings is
allowed. Repeated requests are harmless; a value request cannot be weakened by
also requesting the same symbol as a type.

Each source occurrence is checked regardless of whether its binding is used,
its branch executes, or a bundler removes it. Interpretation also records any
runtime load with no runtime symbol to check, as specified below. An empty
request set alone does not establish that a source construct is allowed.

Same-owner symbol imports retain the existing exemption from exposure and tag
checks. Resolving an import through another file does not change that exemption
when the original symbol is still owned by the importing module.

### Resolution Preserves The Original Binding

Resolve TypeScript specifiers with the project's resolution configuration,
including ordinary extension substitution and path aliases. This is distinct
from the exact source-file paths in `expose-src`; those declaration paths retain
the rules of the module-description specification.

Follow named imports and forwarding exports to the original binding. The
owner is the module containing that binding's application source, not the
module containing an intermediate barrel. The symbol catalog must include
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
unverifiable. Shared resource type declarations do not create shared ownership.
Compiler resolution errors and ambiguous exports must not be resolved by arbitrarily
choosing a declaration. References through compiled copies of application code
must map back to their original bindings or be reported as unverifiable; a
compiled copy does not turn application code into an external dependency.

### Resource Bindings Belong To The Resolved Resource

Application resource bindings belong to the resolved resource's owning module
and have identities specific to that resource, independently of declarations
describing their types. Applying one declaration shim to two resources produces
distinct binding identities. Aliases of the same binding within one resource,
and forwarding aliases in other files, preserve that resource binding's
identity and tags.

Exported names come from the effective export description selected or supplied
by TypeScript for the target. A declaration describing a resource supplies
those names for each resolved resource separately; its own location does not
become the resource's owner. TypeScript can also supply the description
directly, as with a JSON file under `resolveJsonModule`; a physical `.d.ts`
file is not required. The loader supplies runtime values, while declarations
describe their types. TypeScript documents both
[resource declaration files](https://www.typescriptlang.org/tsconfig/allowArbitraryExtensions.html)
and [JSON interpretation](https://www.typescriptlang.org/tsconfig/resolveJsonModule.html).

These bindings follow ordinary ownership, exposure, and tag rules. A resource
in the application source set can be an `expose-src` target under the same
path and ownership constraints as other files. For example,
`expose-src default from "theme.module.css" to parent` selects that resource's
default export when its effective description declares one. A same-owner
barrel can forward that binding while preserving its resource identity and owner.
Same-owner imports retain the model's exemption from exposure and tag checks.

Matching a declaration shim alone establishes neither a resource's existence
nor its ownership. An application resource must resolve to an existing file
in the application source set. A shim cannot make an application resource
external. Established external targets retain the external-target treatment.
For source imports, inability to establish the target or its export description
makes the access unverifiable. If the export description is known, selecting
an absent name is a missing-export error. Description validation still rejects
an `expose-src` declaration naming a missing target or missing export.

Runtime loads without runtime value bindings follow the separate
[runtime-load policy](#runtime-loads-without-a-symbol-need-an-explicit-policy),
which remains proposed. Adopting resource ownership and identity does not
adopt that proposed restriction.

### Explicit Bindings Are Classified Individually

For named and default imports, and named forwarding exports, an explicit
declaration-level or binding-level `type` modifier produces a `type-only`
request. An unmarked binding produces a `value` request, even if TypeScript
could erase it because of its declaration or later usage. This is Ramify's
proposed classification, not a prediction of emitted JavaScript.

```ts
import { type Order, placeOrder } from '../orders/src/order.js';
```

This produces a type-only request for `Order` and a value request for
`placeOrder`. Local aliases do not affect either request. A default import
selects the target's default export and follows its original identity.

The same classification applies to `export type { ... }` and inline
`export { type ... }`. Type-only imports may refer to value declarations, for
example to use a function's type without importing its runtime binding.
[TypeScript documents these type-only forms](https://www.typescriptlang.org/docs/handbook/modules/reference.html#type-only-imports-and-exports).

### Namespace Imports Select The Whole Namespace

An ordinary `import * as ns` selects every export accessible through that
namespace, including `default` when present. For each runtime binding, produce
a value request. For an export that is accessible only as a type, produce a
type-only request. A symbol accessible in both forms requires the value check,
which already implies type availability.

`import type * as ns` selects the namespace with type-only requests throughout.
This includes value declarations whose types can be referenced. Namespace
selection does not depend on which members are subsequently accessed,
destructured, or passed elsewhere. Types and runtime members occupy different
positions in a TypeScript namespace; interfaces are not runtime properties.
[TypeScript namespace semantics](https://www.typescriptlang.org/docs/handbook/modules/reference.html#importing-and-exporting-typescript-specific-declarations)
determine which exports belong to each category.

This treatment of implicitly selected types is specific to aggregate forms.
It does not grant the type-only exemption to an unmarked named import.
Adding a previously unexposed export to a target file can therefore make an
existing namespace import invalid. Checking only the namespace members that
are used is not part of the proposed initial contract.

### Source Re-Exports Are Imports By The Forwarding File

`export { name } from '...'` produces a request by the forwarding file for
each selected original symbol. Named type-only re-exports follow the preceding
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

A forwarded namespace retains its aggregate identity. A consumer selecting
that namespace must check its constituent original symbols in the requested
form; the analyzer must not invent a new owned wrapper symbol to bypass their
permissions. Nested namespaces are expanded likewise. If expansion cannot
establish a finite set of original bindings, report the construct as
unverifiable rather than dropping the unresolved part.

Passing a source re-export check creates no Ramify exposure. The owner still
needs an exposure declaration, and onward exposure still follows the module
tree. This differs from `expose-sub`: a Ramify declaration may forward a visible
symbol even when the forwarding module's files cannot import it. For example,
an untagged parent can forward test support in `module.ramify` while being
forbidden to create a source barrel that imports that support.

### Runtime Dynamic Imports Select Runtime Namespace Members

For `import('literal-specifier')`, resolve the target and produce value requests
for every runtime export in the returned namespace, including `default`.
Purely type exports are absent from the runtime result. Checking is unchanged
by immediate destructuring, property selection, or discarding the result.
Dynamic import returns a namespace object; subsequent selection does not
change that operation. [TypeScript documents the runtime result](https://www.typescriptlang.org/docs/handbook/modules/reference.html#interoperability-rules).

The proposed initial profile supports string-literal dynamic specifiers.
Other specifier expressions, including template literals, are reported as
unverifiable. This is a support limit, not a claim that every computed target
is intrinsically unknowable. A future extension could specify finite target
analysis and require every possible target to pass. The initial profile must
not assume an unknown target is external or stays within the importing module.

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

### Runtime Loads Without A Symbol Need An Explicit Policy

The proposed rule is: a source construct that loads another application
module's file without any runtime symbol request is rejected. The target
file's owner determines this particular boundary check. Same-owner loads
remain permitted, and external targets follow the scope rules below.

This covers side-effect imports, empty imports and re-exports with a source
specifier, and ordinary imports or re-exports whose selected bindings are all
marked type-only. It also covers a runtime namespace import, star re-export,
or dynamic import whose selection contains no runtime bindings.

For this policy, ordinary import and export-from declarations retain a runtime
load after type-only bindings are removed. Entire `import type` and
`export type` declarations, and type-position import expressions, produce no
runtime load. A compiler's decision to eliminate an ordinary statement does
not exempt it from this proposed rule.

```ts
import type { Order } from '../orders/src/order.js'; // Only a type request.
import { type Order } from '../orders/src/order.js'; // Also a runtime load.
```

The second form can retain `import {} from '...'` under `verbatimModuleSyntax`.
Erasing a binding is not the same as erasing the statement.
[TypeScript's documented emit example](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html)
illustrates that distinction. Under this proposal, use the first form for
cross-module type-only access. Intentional initialization should instead use
an exposed function imported and called explicitly.

Ordinary authorized value imports may still execute file initialization.
This policy controls source forms with no runtime symbol to authorize; it
does not introduce a general file-execution permission model. Verification
of a symbol's browser-safety promise remains a separate owner obligation.

### Scope And Unsupported Forms Are Reported Explicitly

The initial interpretation covers ECMAScript imports and exports in application
source analyzed by TypeScript, including the type forms above. File ownership
comes from the application source set and module layout, never from the spelling
of a specifier or a test-like filename.

| Form or target | Treatment (proposed unless marked adopted) |
| --- | --- |
| `import x = require(...)`, `export =`, and CommonJS `require`/export patterns | No cross-module interpretation is specified in this profile. Report potentially cross-module application access as unverifiable. Proven same-owner access retains the model's exemption. |
| Triple-slash references | Interpret as compiler inputs, not as requests for every symbol in the referenced file. They grant no Ramify exposure and cannot silently change application ownership. |
| Ambient declarations and module/global augmentations | Resource shims follow the adopted resource rule. Other external declarations remain outside the application tree. Application constructs that introduce shared globals, ambiguous ownership, or dependencies not representable by the requests above are unverifiable in this profile. |
| Packages, built-ins, and standard-library declarations outside the application | Outside the application symbol-exposure model. Report that scope explicitly; do not fabricate an owning Ramify module. Browser-safety verification may still inspect runtime dependencies. |
| Stylesheets, JSON, and other non-code resources | **Adopted:** bindings belong to the resolved resource's owner, with identities specific to that resource and export names from its effective TypeScript export description. Ordinary exposure and tag rules apply. An application resource must resolve to an existing application source file; an unestablished target or export description makes source access unverifiable. A shim alone proves neither existence nor external status. Established external targets remain outside scope. Loads without runtime value bindings follow the separate runtime-load policy. See the [resource principle](#resource-bindings-belong-to-the-resolved-resource). |
| Unresolved specifier or original binding | Unverifiable, even when the compiler accepts it through an uninformative declaration or an `any` type. |

Triple-slash references can affect which files enter a TypeScript compilation;
they are not ordinary symbol import declarations.
[TypeScript's directive reference](https://www.typescriptlang.org/docs/handbook/triple-slash-directives.html)
defines those compiler effects. Application code cannot be excluded from the
source set merely to bypass Ramify. An integration must not label an unknown
target external simply because resolution failed.

### A Conformance Result Accounts For Every Relevant Construct

Report these outcomes separately, retaining the source file and location:

- **Allowed:** all selected application symbol requests pass, and any
  applicable runtime-load rule passes.
- **Denied:** an identified request fails an importability rule, or the
  proposed cross-module load rule is violated. Identify the symbol or load
  and the failed rule.
- **Unverifiable:** resolution or supported interpretation is insufficient.
  Identify the construct and what could not be established.
- **Outside scope:** the target is established to be outside the application
  model. This is not an application importability verdict.

One construct can yield several findings, such as an allowed application
binding alongside an unverifiable one. A checked application cannot receive
an unqualified conformance result while denied or unverifiable application
access remains. Scope exclusions must be visible in the result. These
diagnostics do not add exposure declarations or dependency allowlists.

The current evaluator answers the individual symbol questions only. Creating
this specification does not implement a TypeScript checker or establish that
the existing toolkit supports these source forms.
