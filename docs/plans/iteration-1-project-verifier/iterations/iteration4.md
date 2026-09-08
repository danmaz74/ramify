# Iteration 4: Description parser

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** iteration 2. Independent of iteration 3; iteration 5
depends on this parser.
**Owner:** `subs/analysis/subs/descriptions/` (parsing only; linking is
iteration 7).

## Goal

Parse the complete version 1 `module.ramify` grammar into located statements
with located diagnostics, from text alone. No filesystem, no compiler, no
export data: this owner stays a portable browser module.

## Read first

- [Module-description principles](../../../model/module-description.principles.md):
  the grammar, tokens, quoting and reserved names, encoding, comments,
  version checks, path string decoding and the wildcard forms.
- Main plan: Descriptions and model, the `ParsedDescription` row of the
  contract table.
- Iteration 1's `contracts.md` for the descriptions owner.

## Deliverables

1. A tokenizer and parser for the whole documented grammar rather than a
   regex for the reference files: version line, quoted reserved names,
   escaped strings, comments, BOM and CRLF, the three exposure forms, tag
   clauses, `as` aliases, `*` selections and the `from`/`to` clauses.
2. `ParsedDescription`: statements with token and statement locations, exact
   decoded path strings, explicit tag assignments, and an explicit invalid
   state carrying every diagnostic. Statement order is preserved but must not
   change later semantics.
3. Syntactic validation that needs no files: unknown syntax, bad version or
   clauses, semicolons, test-profile declarations, mixing bare `*` with names
   or `as`, and a quoted `"*"` kept as a literal name.
4. Parser fixtures for every rule above, including the exact texts of the
   reference's fifteen descriptions and the nine toolkit descriptions, which
   must all parse cleanly.

## Matrix rows executed here

- I1-04: `syntax-valid`, `syntax-invalid`. The path, symlink and case subcases
  of this row belong to iteration 5.

## Verification

```sh
npm run type-check && npm test
npm run reference:verify -- --plan 1   # the two I1-04 syntax instances executed
```

## Exit criteria

- Every description in the reference and the toolkit skeleton parses to the
  statements the contract map expects; every malformed fixture reports a
  located diagnostic.
- The owner's runtime closure is free of Node built-ins.

## Handoff

Iteration 7 links `ParsedDescription` against inventory and export data.
Iteration 5 reuses the path decoding rules for its exact-path checks.
