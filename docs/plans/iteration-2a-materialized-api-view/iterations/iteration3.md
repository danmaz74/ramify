# Iteration 3: Model availability enumeration

**Plan:** [Plan 2A: Materialized API discovery](../main-plan.md).
**Prerequisites:** Iteration 1 contract review.
**Owners:** `analysis/model` only. This iteration is independent of iterations
2 and 4.

## Goal

Provide one pure, deterministic enumeration of foreign originals available to
an ordinary or testing source area, sharing enforcement's tag and testing
rules.

## Read first

- [Available-original semantics](../scope.md#available-originals) and the
  [model contract](../contracts.md#model-provider).
- Authoritative importability principles and glossary.
- `interfaces/model.ts`, `decisions.ts`, model/index/profile helpers and their
  tests.
- Reference contract map cases for child/ancestor exposure, testing origin and
  required importer/symbol tags.

## Deliverables

1. Add `AvailableForm`, `AvailableOriginal` and
   `listAvailableOriginals(model, consumer)` with input validation, uniqueness
   and byte order from the reviewed contract.
2. Extract a private common requirement evaluator used by both the new
   enumeration and `explainImport`. Preserve every existing import decision,
   reason, requirement and order.
3. Cover value-only, pure type, value/type, required-symbol fallback,
   required-importer denial, testing origin, same-owner exclusion, redundant
   exposure paths and ordinary/test profile differences with positive controls.
4. Add exhaustive comparison over reference/toolkit originals and independently
   constructed import questions. A listed form must be allowed; a completely
   blocked form must be absent.
5. Apply the exact `module.ramify` export and analysis/root relays reviewed in
   iteration 1; preserve the browser promise and existing consumers.

## Matrix rows executed here

I2A-03: all eight leaves.

## Verification

Run focused model tests, the model type-check fixture and the existing model,
diagram and Plan 1 decision regressions affected by the helper refactor. Compare
serialized pre/post `explainImport` results for R and T; shared code is not
evidence without equal behavior.

## Exit criteria

The enumeration is public, pure, deterministic and enforcement-equivalent for
all reviewed combinations. Existing model decisions and browser boundaries are
unchanged.

## Handoff

The provider and stable types go to iteration 5. No Markdown, path mapping or
compiler lookup has entered `model`.
