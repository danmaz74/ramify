# Iteration 3: Definitive model

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** iteration 2. Independent of iterations 4 and 5.
**Owner:** `subs/analysis/subs/model/`.

## Goal

Implement the pure model as the definitive principles state it: canonical
identities, a validated resolved registry with two fixed rule kinds, derived
source-area profiles, mandatory symbol tags, exposure evaluation over declared
trees, and import decisions that apply testing-origin restrictions before
same-owner and tag rules. The legacy `src/model` stays in place for the
diagrams until iteration 8.

## Read first

- [Importability principles](../../../model/cross-module-importability.principles.md)
  and [glossary](../../../model/glossary.md) in full.
- Main plan: Descriptions and model, the `ResolvedTagRegistry`, `ModuleId`,
  `SourceArea`, `OriginalId` and `ImportDecision` rows of the contract table,
  Exposure rules for the migration.
- Iteration 1's `contracts.md` for the model owner.
- The legacy `src/model/{tree,tags,availability}.ts` and their tests, as
  migration inputs only.

## Deliverables

1. Identity vocabulary: `ModuleId` from the declared tree, `SourceArea`
   (ordinary versus testing per owner), `OriginalId` specific to a binding and
   distinct for code and resources. Alias spelling and compiler-internal IDs
   are never identity.
2. `ResolvedTagRegistry`: default definitions (`testing`, `ui`, `dispatch` as
   required importer; `browser` as required symbol), validation of
   caller-supplied definitions with the same rules, immutability within a
   run, and rejection of unknown kinds, duplicates, and removal or rebinding
   of `testing`.
3. Profiles: the module header classifies ordinary source; `src/tests/`
   derives `testing` plus the header's required-importer tags and never a
   required-symbol tag; a child owner never inherits its parent's profile.
4. Mandatory symbol tags: new owned exported bindings carry every
   required-importer tag of their defining area; forwarding aliases retain the
   original's ownership and tags; explicit assignments for one original must
   agree.
5. Exposure evaluation over a declared tree with grounded declarations:
   expose-src, expose-test and expose-sub through the parent and descendants
   channels; visibility, availability and type-availability; provenance
   retained on every decision.
6. `ImportDecision` with allowed/denied reason, importer area, original,
   applicable tags and exposure/origin evidence. Testing-origin restrictions
   are evaluated before the same-owner exemption.
7. Ported tests for every legacy expectation that remains meaningful, plus
   independent cases for generic tag names and for source-tag versus
   source-origin distinctions.

## Matrix rows executed here

- I1-14: `renamed-kinds`, `conjunction`, `unknown`, `duplicate`,
  `invalid-kind`, `remove-testing`, `rebind-testing`, `two-evaluations`.
  These use the resolved registry through the library API over constructed
  trees, as the plan allows for this row.

The identity rules behind I1-03 and I1-08 are implemented here; their
instances execute in iterations 5 and 9 against real files.

## Verification

```sh
npm run type-check && npm test
npm run reference:verify -- --plan 1   # I1-14 instances executed; the rest pending
```

## Exit criteria

- Model behavior has independent positive and negative evidence over
  constructed trees; no filesystem or source coverage is claimed.
- The model owner's runtime closure contains no filesystem or compiler
  dependency, and its declaration matches the reviewed activation stage in
  iteration 1's `owners.md`.

## Handoff

Iterations 6, 7 and 9 to 12 consume `ResolvedTagRegistry`, the identity
vocabulary, exposure evaluation and `ImportDecision` exactly as exposed here.
