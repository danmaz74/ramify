# Iteration 2 results: Companion facts from declared signatures

**Date:** 2026-09-21. **Mode:** direct work in worktree `/tmp/ramify-plan8-signature-companions`,
branch `feat/plan8-signature-companions`, based on iteration 1's commit `e475b96`. The results are committed
with the implementation.

## Prerequisites

- Iteration 1's `SignatureCompanions` is in `model`'s `interfaces/model.ts`, as its handoff states. RD-1 to RD-7
  are unchanged.
- The plan's "What exists" held for `typescript`: `CatalogOriginal` had no signature field,
  `CatalogBuilder.export()` holds the resolved declaration nodes when it records `declarations`, and
  `namespace-uses.ts` already uses the batched `getSymbolAtLocation(nodes)`.
- The pinned native API (TypeScript 7.0.2) has a batched `getSymbolAtLocation(nodes)` but no batched alias
  resolution: `getAliasedSymbol` and `getImmediateAliasedSymbol` are one request each. Alias following was
  therefore designed around the catalog's own export descriptions (below), not the checker.

## Built

### `typescript` (`subs/analysis/subs/typescript/`)

- `src/interfaces/source.ts`: `CatalogOriginal.companions: SignatureCompanions`, imported from `model`'s
  interface file as `OriginalId` is. The toolkit's exposure of `SignatureCompanions` needed no change:
  `typescript` exposes its interface file by wildcard and `model` already delivers the type.
- `src/signatures.ts` (new): `harvestSignature(declarations)`, a pure syntactic walk that returns the
  references a declared signature spells and whether a read position is unannotated. It follows the
  harvesting table:
  - functions, methods, call and construct signatures: type parameters' constraints and defaults, parameter
    types and the return type. With overloads, the implementation declaration is skipped, since it is not
    part of the declared contract;
  - classes: type parameters, `extends` and `implements`, and every member that is neither `private` nor
    `#`-named. Constructor parameters are read with their parameter-property modifiers ignored, so a
    `private` parameter property counts; a `private` constructor is not read. Getters give their return
    type, setters their parameter type;
  - interfaces (every merged declaration), type aliases, and variables and properties: the annotation, else a
    directly assigned arrow or function expression with parentheses removed, else `inferred`;
  - enums, namespaces and module sources name nothing. A destructured variable reads its declaration's
    annotation or is inferred; an `export default` expression reads a callable or is inferred.
  - Within a type, type references, heritage expressions, `typeof` queries and `import("…")` types are
    references; computed member names are skipped. Bodies, parameter default expressions and other
    initializers are never entered. A heritage expression that is not an entity name, such as a mixin call,
    sets `inferred`.
- `src/catalog.ts`:
  - `export()` records every code original's declaration nodes, and resource originals carry the empty value.
    The identity computation moved into `codeOriginal()`, shared by `export()` and the companion resolution,
    so a named companion gets exactly the identity the catalog gives the same declaration.
  - `companions()` runs after `resolveExports()` in every round. It harvests every code original the round
    recorded and gathers, into one batched `getSymbolAtLocation` request for the whole round, every
    identifier of every reference plus the module specifiers the names can need: `import("…")` literals, and,
    by a spelling pre-filter like `namespace-uses.ts`, the specifier of each top-level import binding a
    reference's first identifier.
  - An alias whose declaration is an import is followed through the round's resolved export descriptions:
    the specifier is resolved by `Resolution.module` with the batched module symbol, then the selected name
    (and a qualifier chain through namespace entries) is looked up in the target's live or retained
    description. The barrel's own forwarding is therefore the catalog's, and no `getAliasedSymbol` request is
    made. `Resolution.module` gained an optional `known` symbol for this.
  - A non-alias name maps through its declarations: the rightmost name of a chain declared at module level
    names the original (a class, enum or object member falls back to its container). Type parameters,
    libraries and external packages, and local bindings are dropped; a path outside the root or under
    `node_modules` is external, any other unowned path is a project file outside every module.
  - `unresolved` counts: the checker's unknown or error symbol, an alias that is not an import, a namespace
    import or `import("…")` without a selected name, a target that is unresolved, outside every module or an
    ambiguous resource, a name absent from the target's description or without an original, declarations in
    several owners or areas, ambient or `declare global` declarations and script globals.
  - `named` is distinct and in `originalKey` byte order, the original itself dropped; `evidence` is the first
    naming position of each entry by file, then start.
  - Resolution dependencies: an import target is resolved with the naming description as the describing
    file, so the target file (or resource and its probed absent paths) joins that description's recorded
    dependencies. An owned declaration in another file joins its `files` too. Import resolutions and
    per-symbol outcomes are memoized for the round.
  - `companionSymbolRequests()`: the request-count witness, in the style of `shapeRuns()`, counting the
    companion pass's batched requests in this process.
- `src/descriptions.ts`: `surface()` strips `companions.evidence` to files, as it strips `declarations`, so a
  move is `moved` and a new named original is `changed`.
- `README.md`: one paragraph on companion facts, the single request and the dependency edge.
- The wire needed no change: it carries plain data. On the toolkit the framed description result is
  1,764,505 bytes against `RESULT_BYTES` of 33,488,896 (1,191,280 bytes with companions stripped).

No coverage note is emitted. `inferred` and `unresolved` are recorded on every exported original.

### Fixtures outside `typescript`

Two plain-data fixtures construct `CatalogOriginal` values and gain the explicit empty field so the compiler
scopes type-check: `analysis/src/tests/modularity-fixture.ts` and `descriptions/src/tests/linking.test.ts`.
No expectation changed.

### Tests (`typescript`)

`src/tests/companions.test.ts` (new) runs the real compiler: in process through a `DescriptionSet`, through
the retained adapter and through the batch helper.

## Evidence

| ID | Case | Result |
| --- | --- | --- |
| SC11 | Overloaded function (implementation's extra type excluded), merged interface with `extends`, type alias with constraint and default, `typeof`, `import()` type, qualified names through a namespace import (`Types.Shapes.Circle`, `Types.Mode`), a forwarding alias through a barrel resolved to the original, an annotated constant, enum and namespace empty, a namespace member. Evidence aligned and first. Equivalent declaration, arrow, function expression, parenthesized arrow and public/protected callable class properties with constraint/default give the same four; explicit variable and property annotations exclude the initializer's types; body-only, default-only and initializer-only references give none | pass |
| SC12 | External package, library (`Promise`, `Date`), type parameters and a self reference give no companion. A class names its heritage, protected method, accessors, public and static members and both parameter-property types, not its `private` or `#` members; a `private` constructor gives none | pass |
| SC13 | Missing return type, call-initialized constant and unannotated non-callable property set `inferred`; fully annotated arrow does not; partially annotated arrow and function expression set it and keep their explicit companions; an unresolvable name and an import of a file outside every module each count 1 `unresolved`; the facts are recorded on an unexposed exported original | pass |
| SC14 | Forty signature references (functions, arrows, function expressions, qualified and `import()` names) against a control with the same names in bodies: the only added compiler request is one `getSymbolsAtLocations`, the witness counts one, and no type-level request is added | pass |
| SC15 | Retained adapter: a blank line above the declaration is `moved` with evidence refreshed to line 3; adding an `Item` parameter on the same line count is `changed`, with `move` in `changedOriginals`. Both equal a fresh batch description by value | pass |
| SC27 | Retained adapter: editing only the barrel to forward `Beta` instead of `Alpha` recomputes the undisturbed declaring file, whose `named` becomes `Beta`, which records the barrel as a dependency and equals a fresh batch description | pass |
| Retained and batch | Every description of a harvesting fixture from the retained adapter equals the batch helper's by value | pass |

The exit criterion on type-level calls holds by construction: the describe path gained no call to
`getTypeOfSymbol`, `getSignaturesOfType`, `typeToTypeNode` or `getDeclaredTypeOfSymbol`, and SC14 measures the
request stream.

### Measured cost on the toolkit

An in-process full description of the toolkit (444 owned files, 1,348 originals) over one snapshot, three
runs after a cold one:

| Measure | Value |
| --- | --- |
| Companion pass, whole round | 88 to 127 ms warm (222 to 264 ms cold) |
| Per described file | 0.20 to 0.29 ms warm |
| Of which the one batched request (3,844 nodes) | 17 to 28 ms |
| Of which the syntactic walk | 20 to 40 ms |
| Whole in-process description round | 730 to 1,020 ms |
| Named companions / originals with `inferred` / with `unresolved` | 2,330 / 118 / 0 |

The machine was shared and the timings are noisy; iteration 5 measures the stage against SC24's budget. An
incremental description of one file costs its walk plus one request.

### Checks run

- `npx vitest run subs/analysis/subs/typescript subs/analysis/subs/descriptions`: 23 files, 408 tests, all pass
  (the `typescript` owner alone: 19 files, including the 8 new companion tests).
- `npx vitest run subs/analysis/src subs/analysis/subs/model`: 42 files, 605 tests, all pass.
- `npm run type-check` (all four compiler scopes): passes.
- `npm run build`, then `npm run check:self` (resident) and `dist/src/ramify check --root . --batch`: both pass,
  15 owners, 429 source files, 6441 accesses, 0 errors, 0 analysis limits. The worktree's daemon was stopped.
- `dist/src/ramify check --root examples/collection-review --batch`: passes, 0 errors, its 2 existing warnings.
- Not run: the full test suite and the reference harness gate.

The expected intermediate state holds: `analysis` does not read the field, and no suite needed an
expectation change.

## Deviations and decisions within scope

- **One request per round, not per file.** The batch spans every described file of a round, since node ids
  carry their file. It is at most one request per described file, and on the toolkit one request instead of
  444.
- **Alias following through the catalog.** The native API cannot resolve aliases in a batch, so an import alias
  is resolved through the target's resolved export description. This gives the catalog's forwarding exactly,
  including star and barrel forwarding, and yields the dependency edge SC27 needs. An alias that is not an
  import declaration (`import x = …`, an export alias inside a namespace) counts as `unresolved`.
- **Overload implementations are not read.** The table's "every overload" is taken as the overload
  declarations; the implementation's signature is invisible to callers. A function without overloads reads its
  one declaration.
- **Class and interface members of a qualified name.** `typeof Config.value` or an enum member names the
  container, the rightmost module-level declaration in the chain.
- **`inferred` is literal.** Every unannotated read position sets it, including a constant initialized from a
  literal and a parameter with a default value. The toolkit has 118 such originals; iteration 3 reports notes
  only for exposed ones. Narrowing the fact, for example for primitive literal initializers, would change the
  principles' definition and is left to the user.
- **External or outside, by path.** A declaration path outside the root or under `node_modules` is external
  and dropped; other unowned paths are project files outside every module and count as `unresolved`. This
  avoids a per-file metadata request. A project `.d.ts` outside every module, such as a global typings file,
  is therefore counted as `unresolved`, which matches the principles.
- **Ambient and global declarations.** A reference to a `declare global` or script global, or to a declaration
  inside a string-named ambient module, is `unresolved` rather than named, since such bindings are not imported.

## Handoff

### To iteration 3 (`descriptions`, `analysis`)

- Every `CatalogOriginal` in batch and retained descriptions carries `companions`, conforming to `buildModel`'s
  checks: `named` strictly ascending in `originalKey` byte order, never the original, every owner an inventory
  module, `evidence` aligned and located in owned source, `inferred` boolean, `unresolved` a non-negative
  integer. Resource originals and originals without references carry the empty value.
- `named` can include owned originals that are not exported, such as an unexported interface in the declaring
  file. They are visible only in their owner, as iteration 1 anticipated, so exposing such a signature fails.
- `descriptions/src/link.ts` still sets the explicit empty value; replace it with the catalog original's field.
- `originalSurface()` in `session-revision.ts` is unchanged; RD-5's fields are iteration 3's.
- Description deltas: a new or removed named original, or a changed `inferred` or `unresolved`, is `changed`;
  an evidence-only move is `moved`. `changedOriginals` includes a moved original, as it did for declarations.
- The inputs for the notes: 118 of the toolkit's 1,348 exported originals have `inferred`; none has
  `unresolved`.

### To iteration 5 (evidence)

- The measured cost above, and the description byte growth: 1.19 MB to 1.76 MB for the toolkit's full
  description result, about 0.57 MB, near the plan's 0.5 MiB estimate.
