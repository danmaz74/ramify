# TypeScript

The TypeScript adapter owns compiler sessions and resolution state, extracts complete export and original catalogs, and records bounded source-access facts. It separates real resource identity from declaration shims and returns plain data and explicit analysis limits.

`createSourceAnalysis` provides `catalog()`, `accesses()` and `dispose()`. Analysis
supplies a captured project view, its inventory, resolved source areas and finite
work limits. The view remains caller-owned: seal it after the compiler has made
its influencing reads, and dispose it after releasing the source analysis.

`createAccessInterpreter` takes the same inputs and owns a finite compiler
lifetime whose access-interpretation setup is built once: the catalog file and
original maps, the sorted inventory and the resolved areas. `interpret(files)`
returns exactly the accesses and coverage notes a whole pass yields for those
files, plus the resolution candidates each file probed, and
`replaceDescriptions` updates the retained descriptions and originals of named
files without rebuilding the rest. The whole-project `accesses()` operation is a
private wrapper over the same interpreter. Namespace member selection indexes a
file's identifiers by spelling on first use and resolves one spelling with a
single batched symbol query, so a file that binds no namespace issues no
identifier symbol query at all.

`describeFiles` describes owned files one at a time and `assembleCatalog` turns
descriptions into a catalog, so a whole `buildCatalog` is the assembly of every
file's description and a later round can read a few of them again. A description
carries the file's export entry, the originals it defines, the coverage notes
located in it, and the owned files, resources, shims and absent probed paths it
read. A round starts from the named files, adds each file whose own description
depends on one that changed by value, runs the existing star, selection and
incompleteness propagation over that set, and keeps every other description by
identity; the delta separates a change by value from a declaration move. A file
the round did not read acts as a resolved leaf: its retained entry supplies the
original, the namespace module, the runtime flag and its own extraction ambiguity.
A resource description is the union of what every importing specifier reaches, so
describing one reads those importers again, and a shim's content identity, not its
own export description, is the edge that reaches the resources it describes.

The supervised helper uses the pinned TypeScript 7.0.2 native API. Its in-memory
configuration extends the project's configuration and includes every owned
compiler source, including tests omitted by ordinary compiler selection. A
synthetic, unexecuted import witness obtains effective descriptions for resources
that application source does not import. Neither synthetic file is written into
the project. All native filesystem callbacks use the same captured view.

Catalogs retain declarations, original identities, source areas, export names,
namespace members and forwarding origins as frozen plain data. Incomplete or
ambiguous export sets retain located limits and known selections. An unresolved
forwarding target also retains the compiler diagnostic at that specifier.
Ordinary project type-checking and application execution do not run.

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
These limits do not suppress resolved selections.

Iteration 12 records proven package and builtin scope separately from unresolved
targets and project files outside modules. Vite globs, loader import methods,
direct Jiti calls and CommonJS access/export patterns retain explicit coverage.
They never become native ESM selections. Known CommonJS targets retain their source areas for
analysis to apply testing-origin isolation.

Resource descriptions come from actual static, dynamic and import-type accesses
alongside the synthetic witness. Descriptions for one resource must agree on
export identities and value/type existence. Missing resources remain target
limits; absent names in a complete resource description remain definite
missing-export selections for the analysis report.

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
