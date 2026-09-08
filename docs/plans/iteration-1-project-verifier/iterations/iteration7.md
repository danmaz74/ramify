# Iteration 7: Linking and exposure contracts

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** iterations 3, 4, 5 and 6.
**Owners:** `subs/analysis/subs/descriptions/` (linking) and
`subs/analysis/` (the assembly that feeds it inventory, catalog and registry).

## Goal

Turn parsed descriptions into grounded exposure contracts: resolve every
owned reference to a canonical original, expand interface-file and child
wildcards from complete export facts, validate tag assignments, and produce
the linked model the checker evaluates. After this iteration the reference
and the toolkit's current staged descriptions are grounded in actual source
exports.

## Read first

- [Module-description principles](../../../model/module-description.principles.md):
  exposure forms, `src/interfaces/` wildcard rules, `expose-sub`, tag
  clauses, collision rules.
- Main plan: Descriptions and model, the `LinkedDescriptions` row of the
  contract table.
- [Reference contract map](../../reference-project/contract-map.md): the
  hand-reviewed expanded contracts the baseline must reproduce.

## Deliverables

1. Named selection linking: `expose-src` and `expose-test` paths resolved
   through the inventory to catalog originals; missing file, missing export,
   name collision and conflicting tags are invalid; a repeated same-original
   selection merges; statement permutation changes nothing.
2. Interface-file wildcard expansion: exactly one existing file beneath the
   owner's `src/interfaces/`, including nested files and a testing module's
   own interfaces; reject implementation files, `src/tests/interfaces/`,
   `src/helpers/interfaces/`, paths normalized outside, directories, globs and
   every `expose-test *`. Expansion includes every current export, `default`
   when present, and empty files; it preserves originals, aliases and tags,
   and it invalidates the whole declaration on a foreign original or an
   incomplete expansion.
3. Child-contract linking: `expose-sub` names direct children and relays their
   effective upward contracts, evaluated independently of whether the relay's
   own source could import the original.
4. Tag assignment validation through the model: uniform `tagged` clauses,
   omitted required tags, conflicting assignments, literal `"*"` names, and
   same-name collisions across named and wildcard selections.
5. `LinkedDescriptions` with declaration evidence, and an explicit invalid
   state that blocks dependent stages.
6. A `validateProject` library entry that runs inventory, parse, catalog and
   linking over a root and returns the linked model or the diagnostics.

## Matrix rows executed here

- I1-05: all seven subcases.
- I1-09: all seven subcases.
- I1-10: all nine subcases.
- I1-11: all eight subcases.

## Verification

```sh
npm run type-check && npm test
npm run reference:verify -- --plan 1
```

## Exit criteria

- The baseline's expanded contracts equal the contract map, statement by
  statement; every listed instance ran through real files and real exports.
- The nine current toolkit descriptions link without errors against the
  exports implemented so far, following `owners.md`'s activation stages.
  Final exposure statements for later exports remain in the review package.
  The missing-export negative fixtures still fail; staging does not weaken
  the linker's validation.

## Handoff

Iteration 8 validates the migrated toolkit with `validateProject`.
Iterations 9 to 12 evaluate accesses against `LinkedDescriptions`.
