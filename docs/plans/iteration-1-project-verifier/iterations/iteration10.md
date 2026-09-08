# Iteration 10: Tags, source areas and testing origin in real source

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** iteration 9. Independent of iteration 11.
**Owners:** `subs/analysis/subs/typescript/` and `subs/analysis/`; model
adjustments only where a real-source case exposes a gap.

## Goal

Exercise the tag and source-area rules on real files: required-importer tags,
the browser promise with unmarked interfaces and merged runtime bindings,
derived test profiles, own versus foreign private test access, and the
testing-origin isolation that forwarding cannot bypass.

## Read first

- [Importability principles](../../../model/cross-module-importability.principles.md):
  tags, source areas, testing origin, same-owner exemption order.
- [TypeScript interpretation principles](../../../model/typescript-source-interpretation.principles.md):
  unmarked purely type originals, testing-source isolation, stylesheet
  side-effect loads.
- Main plan: matrix rows I1-12, I1-13, I1-15, I1-16, I1-17 and the
  `testing-style` subcase of I1-23.

## Deliverables

1. Importer classification from the inventory's source areas: ordinary
   source, `src/tests/`, and a testing module's ordinary `src/`; nested
   `helpers/tests/` and test-looking filenames add nothing.
2. Browser rule on value requests: unmarked purely type originals take the
   type-only check; unmarked classes, functions and merged runtime bindings
   keep the value check; same-owner imports keep their exemption after the
   origin check. Fixtures use a compiler configuration permitting unmarked
   type imports; compiler diagnostics stay separate.
3. Testing-origin isolation: production source cannot import or load testing
   source in value, type, stylesheet or side-effect form, its own or foreign;
   a testing barrel or non-testing forwarder cannot hide a testing original.
4. Fixture families for a production binding explicitly tagged `testing`, a
   separate testing module with extra header tags, and its nested
   `src/tests/` dropping `browser`.

## Matrix rows executed here

- I1-12: `ui-value`, `ui-type`, `dispatch-value`, `dispatch-type`,
  `tag-without-route`.
- I1-13: `browser-value`, `explicit-type`, `unmarked-interface`,
  `unmarked-class`, `merged-runtime`, `same-owner`.
- I1-15: `derived-profile`, `child-profile`, `test-looking-file`,
  `nested-helpers-tests`, `own-private-test`, `foreign-private-test`.
- I1-16: `foreign-fixture`, `remove-fixture-hop`, `production-value`,
  `production-type`, `production-side-effect`, `testing-barrel`,
  `production-forwarding-test`.
- I1-17: `production-tagged-testing`, `separate-testing-module`,
  `testing-module-browser`, `nested-tests`.
- I1-23: `testing-style`.

## Verification

```sh
npm run type-check && npm test
npm run reference:verify -- --plan 1
```

## Exit criteria

- Every listed instance ran with its own expected outcome; visibility is
  established before any tag-specific denial is asserted.
- No per-file or glob classification override exists anywhere in the code.

## Handoff

Iteration 12 reports these decisions with their coverage; iteration 15's
self-check relies on the same rules over the toolkit.
