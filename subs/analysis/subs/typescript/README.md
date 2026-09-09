# TypeScript

The TypeScript adapter owns compiler sessions and resolution state, extracts complete export and original catalogs, and records bounded source-access facts. It separates real resource identity from declaration shims and returns plain data and explicit analysis limits.

`createSourceAnalysis` currently provides `catalog()` and `dispose()`. Analysis
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
checking and application execution do not run. Access interpretation begins in
iteration 9; there is no placeholder access result in this stage.

The native API returns the base of inherited `paths` mappings as `pathsBasePath`
alongside parsed options, although its published `CompilerOptions` type omits
that field. The resource resolver uses that captured compiler result and never
guesses the base from an importing file. Compiler-selected code and external
targets take precedence over fallback resource candidates.
