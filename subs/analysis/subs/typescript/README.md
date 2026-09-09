# TypeScript

The TypeScript adapter owns compiler sessions and resolution state, extracts complete export and original catalogs, and records bounded source-access facts. It separates real resource identity from declaration shims and returns plain data and explicit analysis limits.

`createSourceAnalysis` provides `catalog()`, `accesses()` and `dispose()`. Analysis
supplies a captured project view, its inventory, resolved source areas and finite
work limits. The view remains caller-owned: seal it after the compiler has made
its influencing reads, and dispose it after releasing the source analysis.

The supervised helper uses the pinned TypeScript 7.0.2 native API. Its in-memory
configuration extends the project's configuration and includes every owned
compiler source, including tests omitted by ordinary compiler selection. A
synthetic, unexecuted import witness obtains effective descriptions for resources
that application source does not import. Neither synthetic file is written into
the project. All native filesystem callbacks use the same captured view.

Catalogs retain declarations, original identities, source areas, export names,
namespace members and forwarding origins as frozen plain data. Incomplete or
ambiguous export sets retain located limits and known selections. Ordinary type
checking and application execution do not run.

Iteration 9 interprets static named/default imports, explicit and inferred type
requests, named source re-exports and side-effect imports. Each binding retains
its selected and local names, written form, runtime-load flag, accessed target,
canonical original, forwarding origins and source location. Local export aliases
retain the request at their import declaration. Symbol-free source and stylesheet
loads retain their target's source area without inventing an exported binding.
`accesses()` can run before `catalog()`; both use the same compiler snapshot and
return frozen plain data. Cancellation, disposal and finite transfer/work limits
apply to both operations.

Iteration 11 adds explicit namespace members, literal keys, destructuring and
qualified types; source star and namespace re-exports; awaited and direct `.then`
dynamic selections; TypeScript and JSDoc import-type queries; and empty or
discarded loads. Namespace references use compiler symbol identity so shadowed
names do not become accesses. Nested module namespaces retain constituent
originals and forwarding source areas. Whole re-exports include every member,
with `default` excluded by stars. Import-type namespace queries select runtime
members' types without a load; ordinary type-only exports remain outside that
runtime membership.

Unknown keys, namespace escape and nonliteral imports produce located coverage
notes without broadening known selections. Incomplete whole expansions preserve
both their limits and known bindings, including through namespace relays. Empty
selections use the existing target-origin check without invented symbols.
Resource/coverage completion and the public analysis report follow in iteration
12. These limits do not suppress resolved selections.

The native API returns the base of inherited `paths` mappings as `pathsBasePath`
alongside parsed options, although its published `CompilerOptions` type omits
that field. The resource resolver uses that captured compiler result and never
guesses the base from an importing file. Compiler-selected code and external
targets take precedence over fallback resource candidates.

Plain initialization scripts have no module symbol in the native API. A bounded
fallback handles explicit file references and configured aliases with the
compiler's extension and module-suffix order, requiring the selected script to
be loaded in the captured program. It stops at the first existing candidate.
Without a compiler-established module target, package, directory, extensionless
and `rootDirs` script resolution remain limits. No script bytes or project
compiler settings are rewritten to manufacture a module symbol.

Iteration 10 verifies these static facts against actual tag and source-area
cases. Importer and original profiles come from inventory areas: test-like
filenames and nested `helpers/tests/` directories retain the ordinary profile.
Unmarked interfaces request types; unmarked classes and merged runtime bindings
request values regardless of later usage. Accessed testing barrels, testing
originals and stylesheet targets retain their origin through forwarding.
The script fallback tries an explicit `paths` target's exact extension first,
including configured module suffixes. When that target is absent, `.js` and
`.jsx` aliases try `.ts`, `.tsx` and declarations before JavaScript. Relative
imports use extension substitution directly; a `.jsx` spelling prefers JSX to
an adjacent `.js` script when no TypeScript counterpart exists. Compiler-trace
controls cover exact targets, absent targets with ordinary substitutions before
testing candidates, and that relative JSX priority.
