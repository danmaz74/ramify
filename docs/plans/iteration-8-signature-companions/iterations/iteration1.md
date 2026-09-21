# Iteration 1: Model documents, exposure index and the companion rule

**Plan:** [Plan 8](../main-plan.md).
**Prerequisites:** none. The user settled RD-1 to RD-7 on 2026-09-21.
**Owners:** the four model documents; `model` (`subs/analysis/subs/model/`).

## Goal

The model documents state the rule, and `model` decides it over plain data,
before any source fact exists to feed it.

## Read first

- Main plan: decisions already made, the rule, RD-1 to RD-7, the retained
  dependency evaluation, the contract's Facts and Rule sections, SC01 to SC10.
- [Importability principles](../../../model/cross-module-importability.principles.md),
  whole; [glossary](../../../model/glossary.md) entries Reach,
  Module-visible symbol and Type-availability;
  [module description principles](../../../model/module-description.principles.md)
  sections "Interface-File Wildcards", "Exposure Evaluation Is Grounded" and
  "Validation Distinguishes"; [source interpretation principles](../../../model/typescript-source-interpretation.principles.md)
  sections "Explicit Bindings Are Classified Individually" and "Scope And
  Unsupported Forms".
- `CLAUDE.md` writing conventions.
- `subs/analysis/subs/model/src/interfaces/model.ts`, `model.ts` (the
  leaf-first `toParent` computation), `decisions.ts` (`DecisionIndex`, its
  `WeakMap`, `visibilityFor`, `requirementsFor`), `module.ramify`.
- Tests: `decisions.test.ts`, `tree.test.ts`, `tags.test.ts`, `fixtures.ts`.

## Deliverables

1. The principles section "Exposure Requires Available Signature Companions":
   the companion definition by reference to the glossary, the two conditions,
   both tag kinds' directions with the value-companion consequence,
   the statement that Ramify never supplies the exposure, that every exposure
   step is verified, and that a violation leaves the model valid. Keep it
   short; the harvesting table belongs to the source interpretation document.
2. The glossary entry "Signature companion": one definition, no rationale.
3. Module description principles: the wildcard paragraph names the rule beside
   its existing statement; the validation section gains the third table,
   "valid and failing", with this one condition.
4. Source interpretation principles: the section stating what a declared
   signature names, the exclusions, and the two analysis limits. Include the
   main plan's rules for directly assigned arrow/function-expression
   signatures, explicit variable/property annotations and partial inference.
5. `SignatureCompanions`, `Original.companions`, `CompanionReason` and
   `CompanionViolation` in `interfaces/model.ts`. `buildModel` validates that
   `named` and `evidence` have equal length and carries the field unchanged.
   Existing fixtures gain an empty `companions` through one helper.
6. The exposure index, built once per frozen model beside `DecisionIndex`:
   per module the originals exposed to parent and to descendants, and per
   original the modules that receive it from a child. A visibility test walks
   the module's ancestors. "Visible in every proper descendant of `M`" first
   consults `M`'s and its ancestors' to-descendants sets and visits
   descendants only when that fails. No per-original reach set is expanded.
7. `listCompanionViolations(model)` with the plan's conditions, reporting site
   and ordering, exposed from `module.ramify` tagged `browser`.

## Matrix rows executed here

SC01 to SC10.

## Verification

Focused runs of the `model` owner's tests. SC06's three alternative paths and
SC02's child-owned case are separate fixtures. SC10 asserts that
`explainImport` results for a recorded set of accesses are equal by value
with and without companions present. An index/visibility agreement test
compares the index's answer with `explainVisibility` for every module and
original of the existing fixtures. Run `npm run check:self`; `typescript` and
`analysis` construct `Original` values and must compile with the helper or an
explicit empty field. Expected intermediate state: no source fact populates
`companions`, so no project reports the finding yet.

## Exit criteria

SC01 to SC10 pass. The agreement test passes on every existing fixture. The
four documents carry the rule and follow the writing conventions.
`check:self` passes, including the new names' own companions.

## Handoff

The `SignatureCompanions` shape and ordering rules for iteration 2, and
`listCompanionViolations` with its ordering for iteration 3.
