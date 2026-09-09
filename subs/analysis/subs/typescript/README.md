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

Namespace selections, whole re-exports, empty statements and dynamic/import-type
forms remain explicitly uncovered at this stage. Resource/coverage completion
and the public analysis report follow in later iterations. These limitations do
not suppress resolved static selections.

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
`.jsx` aliases use the same `.ts`, `.tsx`, declaration and JavaScript substitution
priority. Relative imports use extension substitution directly. Compiler-trace
controls cover existing exact targets and an absent target whose ordinary
substitution precedes a testing candidate.
