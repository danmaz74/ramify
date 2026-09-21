# Iteration 2: Import denials and `missing-export`

**Plan:** [Plan 2E](../main-plan.md).
**Prerequisites:** iteration 1.
**Owners:** `analysis` (`evaluate-accesses.ts`); `analysis/model` only if `explainImport` must return evidence it already computes and does not yet return.

## Goal

The four denial codes and `missing-export` produce the contract's message, `details`, labelled `related` and `proposal`.

## Read first

- Main plan: The denial family, RD-1.
- `subs/analysis/src/evaluate-accesses.ts:20-80`, `subs/analysis/subs/model/src/decisions.ts:100-160` and the `ImportDecision` type in `subs/analysis/subs/model/src/interfaces/model.ts`.
- `subs/analysis/subs/descriptions/src/link.ts:95-150` for the second `missing-export` producer's wording, which iteration 3 aligns.
- `docs/model/cross-module-importability.principles.md:325-376`, the glossary entries for both tag kinds.
- Tests: `subs/analysis/src/tests/evaluate-accesses.test.ts`.

## Deliverables

1. One message builder per denial code, pure functions of the `ImportDecision`, the importing area and the module tree's declared names.
2. `details`: for `not-visible`, each exposure of the original with its destinations and the reason it does not reach the importer (wrong destination, not re-exposed by an ancestor on the path, ineffective), or `none`; then the names the importing area receives from the same provider file, sorted and cut at 20. For the tag codes, where the tag is assigned. For `testing-origin`, the blocking origins in order.
3. `related` roles from the evidence the decision already carries.
4. `proposal`: set only when the original is owned, an `expose-src` statement for the same file to a destination that reaches the importer already exists, and adding the name to it satisfies the rule. Otherwise `null`, with a `details` line naming the missing hops.
5. `missing-export` from source interpretation uses the shared wording and up to five nearest exported names.
6. Catalogue rows and the owner's catalogue test.

## Matrix rows executed here

- DM-02 (analysis)
- DM-03
- DM-05
- DM-08

## Verification

- Unit tests for each code, a two-hop `not-visible` whose `proposal` is `null`, an ineffective exposure, a tag denial of a type-only import, and the 50-exposure bounds case.
- `npm run check:diagnostics`, the owner's tests and `npm run check:self`.

## Exit criteria

- The catalogue's denial rows have no `TBD`.
- No denial message contains `#` key syntax.

## Handoff

- The exact wording, for iteration 7's reference-harness expectations and for the inspection successor.
