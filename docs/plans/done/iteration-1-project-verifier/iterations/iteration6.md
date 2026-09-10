# Iteration 6: Source catalog

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** iterations 1 (probes), 3 and 5.
**Owner:** `subs/analysis/subs/typescript/` (catalog only; access
interpretation starts in iteration 9).

## Goal

Stand up the compiler adapter over the captured input view and the project's
own configuration, and return complete plain-data export facts: every export
of every owned file, exposed or not, its canonical original, defining area,
value and type existence, aliases, forwarding paths and resource descriptions.
Compiler objects never leave this owner.

## Read first

- [TypeScript interpretation principles](../../../../model/typescript-source-interpretation.principles.md):
  originals, resources, effective export descriptions, forwarding aliases.
- Main plan: Analysis path and contract review, the `SourceCatalog` row of
  the contract table, the risk table rows on compiler APIs and identity.
- Iteration 1's `probes.md` and `contracts.md` for this owner.

## Deliverables

1. `createSourceAnalysis` over `ProjectInputView` and the discovered
   configuration, reproducing the project's configured resolution: aliases,
   `.js` substitution, declaration shims and package resolution. Every owned
   file is a program root regardless of the configuration's selection; a
   solution-style configuration is an unavailable outcome. No type-checking
   runs; a compiler problem that blocks resolution or export enumeration is
   recorded as an analysis limit on the affected construct.
2. `SourceCatalog`: per owned file, all exports with original declarations,
   value/type existence, merged runtime bindings, unmarked interfaces,
   forwarding origins and the original's defining area. New wrappers and type
   aliases are new originals; forwarding aliases keep the original.
3. Resource bindings: ownership and identity from the resolved resource file,
   export names from its effective export description; two resources described
   by one shim stay distinct; a missing resource is reported separately from a
   missing export name.
4. External scope established from resolution results, never from a bare
   specifier or a resolution failure.
5. Session state that can be disposed; retained `SourceCatalog` values hold no
   reference to programs, symbols, nodes or file handles.

## Matrix rows executed here

- I1-23: `two-css-resources`, `resource-alias`, `json-binding`, asserted on
  catalog identities and export descriptions. The remaining I1-23 subcases
  belong to iterations 10 and 12.

Catalog-level tests also establish the identities behind I1-08 and the
`AppRouter-forward` case; those instances execute as import decisions in
iteration 9.

Catalog tests may establish that a resource description lacks a requested name,
but `missing-resource-export` executes through the public analysis session in
iteration 12 and must assert the resulting failed check.

## Verification

```sh
npm run type-check && npm test
npm run reference:verify -- --plan 1 --iteration 6
```

## Exit criteria

- The catalog of the unchanged reference lists every export the contract map
  names, including private ones, with the identities the map states.
- Disposal releases the program; a retained catalog keeps no compiler state,
  proven by a test.

## Handoff

Iteration 7 links declarations against this catalog. Iterations 9 to 12 add
access interpretation to the same owner.
