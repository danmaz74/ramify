# Iteration 11: Namespaces, forwarding stars and lazy forms

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** iteration 9. Independent of iteration 10.
**Owner:** `subs/analysis/subs/typescript/`.

## Goal

Cover the bounded source forms beyond plain imports: static namespace member
selection, source and namespace re-exports with their default-membership
rules, literal dynamic imports and their awaited, destructured and `.then`
selections, import-type expressions, and symbol-free loads. Unknown flows stay
visible coverage notes and never widen a selection.

## Read first

- [TypeScript interpretation principles](../../../model/typescript-source-interpretation.principles.md):
  namespaces, star and namespace re-exports, dynamic import table, import
  types, side-effect loads, partial coverage policy.
- Main plan: Source forms table rows three to seven; matrix rows I1-19 to
  I1-22.

## Deliverables

1. Static namespace access: direct members, literal keys, explicit
   destructuring and qualified types select identifiable originals only; an
   added unrelated private export never broadens a selection; unknown keys and
   namespace escape record partial coverage while known denials still fail.
2. Forwarding: `export *` checks the forwarding file's whole selection and
   excludes `default`; `export * as ns` includes it; type-only variants keep
   type semantics; a downstream named import does not narrow a star
   re-export; source forwarding alone creates no Ramify exposure.
3. Dynamic forms from the principles' table, including the reference's
   `.then(panel => ({ default: panel.ReviewPanel }))`; nonliteral specifiers
   are unverifiable with an explicit note.
4. Import-type expressions and `typeof import(...)` member and namespace
   queries as type requests with no runtime load.
5. Side-effect and empty imports and re-exports, and discarded dynamic
   imports: no invented symbol requirement; resolve the target and apply the
   testing-origin check; an inline `type` statement keeps its origin check.

## Matrix rows executed here

- I1-19: `namespace-members`, `literal-key`, `destructure`, `qualified-type`,
  `private-growth`, `unknown-key`, `escape`, `known-denial-plus-escape`.
- I1-20: `source-star`, `type-star`, `namespace-export`,
  `type-namespace-export`, `downstream-selection`, `no-declaration`.
- I1-21: `reference-lazy`, `await-member`, `await-destructure`, `then-member`,
  `then-destructure`, `import-type`, `typeof-import-member`,
  `typeof-import-namespace`, `nonliteral-target`.
- I1-22: `hook-side-effect`, `empty-import`, `empty-export`,
  `discarded-lazy`, `inline-type-statement`, `testing-target`.

## Verification

```sh
npm run type-check && npm test
npm run reference:verify -- --plan 1
```

## Exit criteria

- Every listed instance ran; each parameterized syntax variant has its own
  execution record.
- The reference's own lazy `ReviewPanel` load and Cucumber hook import are
  checked as authored, with no coverage note where the form is supported.

## Handoff

Iteration 12 folds these coverage notes into the report's coverage section.
