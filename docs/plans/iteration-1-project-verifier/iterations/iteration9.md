# Iteration 9: Static access checking

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** iteration 7. Independent of iteration 8.
**Owners:** `subs/analysis/subs/typescript/` (access interpretation) and
`subs/analysis/` (evaluation of located requests through the model).

## Goal

Check the first source forms end to end: static named and default imports,
type-only forms, forwarding exports and local aliases, `.js` substitution and
configured aliases. Each occurrence becomes a located request, the model
decides it, and the decision keeps its evidence.

## Read first

- [TypeScript interpretation principles](../../../model/typescript-source-interpretation.principles.md):
  explicit bindings classified individually, forwarding, `.js` substitution,
  aliases, written form versus checked form.
- Main plan: Source forms table rows one and two, the `SourceAccess` and
  `ImportDecision` rows of the contract table, Reports and exit behavior for
  diagnostic contents.

## Deliverables

1. `SourceAccess` occurrences for static imports and re-exports: accessed
   file, original binding, forwarding-origin path, written form, selected
   binding form (value or type), importer file and source area.
2. Evaluation: every occurrence passes through `ImportDecision`; allowed and
   denied results retain importer area, original, tags, exposure declarations
   and source-origin evidence, plus repository-relative locations.
3. Diagnostics with stable reason categories, deterministic ordering and no
   compiler internals.
4. Real source fixtures for each form, applied to reference copies by the
   iteration 2 runner; access negatives remain valid TypeScript.

## Matrix rows executed here

- I1-06: `remove-hop`, `restore-hop`, `relay-only`, `source-forward`.
- I1-07: `deeper-descendant`, `reverse-task-controller`,
  `validation-runtime`, `parent-private`.
- I1-08: `import-rename`, `exposure-rename`, `same-owner-forward`,
  `same-spelling`, `new-wrapper`, `new-type-alias`.
- I1-18: `js-substitution`, `path-alias`, `AppRouter-forward`,
  `named-default`, `source-types`, `application-alias`.

## Verification

```sh
npm run type-check && npm test
npm run reference:verify -- --plan 1
```

## Exit criteria

- The unchanged reference's static imports all resolve to the authored
  positive decisions; every listed negative yields the expected denial with
  its evidence.
- No decision is inferred from a bare specifier; an application alias is
  never classified external.

## Handoff

Iterations 10 and 11 add forms and rules on the same occurrence and decision
pipeline; iteration 12 assembles it into the analysis session.
