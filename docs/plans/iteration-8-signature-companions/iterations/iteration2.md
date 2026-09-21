# Iteration 2: Companion facts from declared signatures

**Plan:** [Plan 8](../main-plan.md).
**Prerequisites:** iteration 1's `SignatureCompanions` in `model`'s interface
file.
**Owners:** `typescript` (`subs/analysis/subs/typescript/`).

## Goal

Every exported original's description carries its companion facts, collected
without type computation and with at most one added compiler request per
described file, identically in the retained and batch paths.

## Read first

- Main plan: "What a declared signature names", RD-2, RD-4, RD-5, the
  contract's Facts section, SC11 to SC15 and SC27.
- The source interpretation principles' new section from iteration 1.
- `src/catalog.ts`: `CatalogBuilder.export()` around the `declarations`
  recording, `resourceExport()`, `location()`, `origin()`.
- `src/namespace-uses.ts`: the spelling pre-filter and the batched
  `getSymbolAtLocation(nodes)` call. Follow this pattern.
- `src/descriptions.ts`: `surface()`, `recompute()`, the `changed` and `moved`
  classification. `src/interfaces/source.ts`. `src/wire.ts` result bounds.
- [Retained-session analysis](../../../analysis/fast-incremental-checks-retained-session.md)
  on checker round trips.
- Tests: `catalog.test.ts`, `descriptions.test.ts`, `coverage.test.ts`,
  `retained-source-analysis.test.ts`, `fixtures.ts`.

## Deliverables

1. `CatalogOriginal.companions`. Resource originals, enums and namespaces
   carry the empty value.
2. One walk per described file over the declaration nodes of its exported
   originals, gathering the identifier of every harvested type reference,
   `typeof` query, `import()` type and qualified name, and recording whether
   any harvested position lacks an annotation. For a variable or
   public/protected property with no type annotation, harvest a directly
   assigned arrow/function-expression signature, ignoring parentheses around
   the initializer. An explicit variable/property annotation is authoritative
   and excludes the initializer. Fully annotated callable signatures do not
   set `inferred` merely for the absent enclosing annotation; partially
   annotated signatures retain their explicit companions and set `inferred`.
   Function bodies, parameter default expressions, other initializers,
   `private` and `#` members are not entered. A constructor parameter declared
   as a `private` parameter property is harvested; a getter's return type and
   a setter's parameter type are harvested as a property's type is.
3. One batched symbol request per file for the gathered identifiers. Each
   symbol is followed through aliases to its original and mapped to an
   `OriginalId` through the builder's existing origin lookup. External,
   library, type-parameter and self references are dropped. A reference with
   no single project original, or to a project file outside every module,
   increments `unresolved`.
4. `named` distinct and in `originalKey` byte order, with `evidence` aligned
   to it. `surface()` strips `evidence` as it strips `declarations`.
5. No coverage note is emitted here. `inferred` and `unresolved` are facts of
   every exported original; iteration 3 reports the notes for exposed
   originals only.
6. A request-count witness in the style of `shapeRuns()`, used by SC14.
7. The batch wire carries the field; confirm the framed description result
   stays within `RESULT_BYTES` on the toolkit.
8. Resolution dependencies: when a named identifier resolves through another
   owned file, that file is among the description's recorded dependencies, so
   a change to it recomputes the entry. If the existing dependency tracking
   does not already cover it, extend it here.

## Matrix rows executed here

SC11 to SC15 and SC27.

## Verification

Focused runs of the `typescript` owner's tests against the real compiler. One
fixture file per row of the harvesting table. SC11 compares equivalent
function declarations, arrows and function expressions, including generic
constraints/defaults, parenthesized initializers and public/protected callable
properties. Include explicit variable/property annotations with different
initializer annotations, plus body-only and parameter-default-only type
references, to verify the harvesting boundary. SC13 covers fully and
partially annotated callables, and retains call-initialized constants as an
inference case. SC12 includes a class with
public, protected, `private` and `#` members each naming a different type.
SC15 edits a file twice: once inserting a blank line above the declarations,
expecting `moved` with refreshed `evidence`, and once adding a parameter of a
new owned type on the same line count, expecting `changed`. SC14 compares the
witness before and after describing a file with forty type references,
including arrow/function-expression signatures; no extra type query is allowed.
SC27 runs the retained source analysis: edit only the barrel, then compare the
declaring file's description with a fresh batch description.
Expected intermediate state: `analysis` does not yet read the field; its
suites pass unchanged except fixtures that compare whole descriptions by
value.

## Exit criteria

SC11 to SC15 and SC27 pass. No call to `getTypeOfSymbol`, `getSignaturesOfType`,
`typeToTypeNode` or `getDeclaredTypeOfSymbol` is reachable from the describe
path. Retained and batch descriptions of the fixture are equal by value.

## Handoff

The populated facts, including `inferred` and `unresolved` for iteration 3's
notes, and the measured per-file cost of
the walk on the toolkit, for iterations 3 and 5.
