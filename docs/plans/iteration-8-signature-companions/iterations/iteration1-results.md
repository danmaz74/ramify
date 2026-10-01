# Iteration 1 results: Model documents, exposure index and the companion rule

**Date:** 2026-09-21. **Mode:** direct work in worktree `/tmp/ramify-plan8-signature-companions`,
branch `feat/plan8-signature-companions`, based on the plan commit `6dd9b4c`. The results are committed
with the implementation.

## Prerequisites

- None. RD-1 to RD-7 were settled on 2026-09-21 and are unchanged.
- The plan's "What exists" held for `model`: `Model` is three flat arrays, `DecisionIndex` lives in a
  `WeakMap<Model, …>` in `decisions.ts`, `visibilityFor` searches exposure paths per query, and `buildModel`
  computes the to-parent sets leaf first and discards them. `Original` had no signature information.

## Built

### Model documents

- [Importability principles](../../../model/cross-module-importability.principles.md): the section
  "Exposure Requires Available Signature Companions", after "Type-Only Imports Retain Coupling Restrictions".
  It states the two conditions, both tag kinds' directions with the value-companion consequence, testing-source
  companions, one-level depth, that every exposure step is verified with the finding at the first step that
  carries the symbol beyond its companion, that Ramify never supplies the exposure, and that a violation leaves
  the model valid.
- [Glossary](../../../model/glossary.md): "Signature companion", after "Module-exposed symbol".
- [Module description specification](../../../model/module-description.spec.md): the wildcard paragraph keeps
  its statement and names the rule; the validation section gains a third table, "leave the description valid and
  fail a check", with the one condition.
- [Source interpretation specification](../../../model/typescript-source-interpretation.spec.md): the section
  "A Declared Signature Names Its Companions", before "Scope And Unsupported Forms", with the harvesting table,
  the arrow/function-expression and explicit-annotation rules, the exclusions and the two analysis limits.

### `model` (`subs/analysis/subs/model/`)

- `src/interfaces/model.ts`: `SignatureCompanions`, `Original.companions`, `CompanionReason` and
  `CompanionViolation`, as the plan's contract gives them. `CompanionViolation.destination` uses the existing
  `Destination` alias, which is the same union.
- `src/model.ts`: `buildModel` requires `companions` on every original and rejects malformed facts with
  `invalid-original`: `named` and `evidence` of unequal length, an invalid identity, entries not strictly in
  `originalKey` order (so duplicates are rejected), the original itself, an owner that is not a model module,
  invalid evidence locations, a non-boolean `inferred` or a negative or non-integer `unresolved`. Repeated
  entries of one original must carry equal companions. The field is carried unchanged; evidence is not reordered.
- `src/exposure-index.ts` (new): `ExposureIndex`, derived once per frozen model in its own `WeakMap`, beside
  `DecisionIndex`. It holds per module the originals effectively exposed to parent (never at the root) and to
  descendants, per original the modules that receive it from a child, and the children map. `visibleIn` walks the
  module's ancestors with set lookups. `visibleInEveryProperDescendant` consults the module's and its ancestors'
  to-descendants sets first and visits descendants only when those fail. No per-original reach set is expanded.
  An unfrozen model gets an unretained index, as `DecisionIndex` does.
- `src/companions.ts` (new): `listCompanionViolations(model)`.
  - Only effective exposures with a step are considered: a to-parent destination at the root is no step.
  - `not-visible` is reported at step `(M, c)` only when the companion is visible in `M`.
  - `requires-tag` compares required-importer tags only, by kind from the registry, and is reported once per
    `(S, T)` at each of the owner's exposure statements.
  - Results are ordered by statement location, original key, then companion key, then destination and reason.
- `src/index.ts` and `module.ramify`: `expose-src listCompanionViolations from "companions.ts" tagged [browser]
  to parent`. The new types join through the existing `interfaces/model.ts` wildcard.
- `README.md`: one paragraph on the rule and its index.

### Relays and constructors outside `model`

- Root `module.ramify`: `SignatureCompanions` joins the named `expose-sub … from analysis to descendants` relay
  beside `Original`, which names it. `analysis` already relays `model` by wildcard. `listCompanionViolations`,
  `CompanionViolation` and `CompanionReason` are not relayed by root. `analysis` receives them from its child,
  and no other owner needs them.
- `descriptions/src/link.ts`: originals entering `buildModel` carry an explicit empty `companions`, commented as
  the placeholder iteration 3 replaces with the catalog's facts.
- `presentation/src/diagrams/fixture-model.ts`, `analysis/src/tests/modularity-fixture.ts` and
  `scripts/reference-harness/model-cases.ts` construct `Original` values with an explicit empty field.
  `service-api`'s `project-view.test.ts` casts a report fixture and never calls `buildModel`, so it is unchanged.
- `descriptions/src/tests/descriptions.test.ts`: the reviewed-statement fixtures for the root and `model`
  descriptions gain the two new statements' names.

### Tests (`model`)

- `src/tests/fixtures.ts`: `noCompanions`, `companionsOf(named, options)`, and `original(…, { companions })`,
  whose default is the empty value, so every existing fixture gains it through one helper. `modelOf` now also runs
  `assertIndexAgreement`, which compares `visibleIn` with `explainVisibility` for every module and original of
  every model it builds.
- `src/tests/recorded-decisions.ts`: each of the seven recorded originals gains the empty `companions` field,
  noted in the recording's header. No recorded decision changed otherwise.
- `src/tests/companions.test.ts` (new): SC01 to SC10, ordering, construction validation, and the agreement test on
  the recorded model.

## Evidence

| ID | Case | Result |
| --- | --- | --- |
| SC01 | One `not-visible` violation at the statement, removed by exposing `Order` to parent; an unexported owned companion absent from the model is visible only in its owner | pass |
| SC02 | Companion exposed to descendants by the module, or by an ancestor, passes. A companion owned by a child and exposed only to parent fails, naming `descendants`. The two passing paths and the child-owned case are separate fixtures | pass |
| SC03 | A parent's re-exposure without the received companion fails at the parent's statement only | pass |
| SC04 | A missing exposure at the owner, re-exposed by two ancestors, yields exactly one violation, at the owner | pass |
| SC05 | Wildcard-style step carrying both passes; a named selection omitting the companion fails at that statement | pass |
| SC06 | Owned by the destination, exposed by a sibling child to the same parent, and received from an ancestor: three fixtures, all pass | pass |
| SC07 | `[ui]` companion of an untagged symbol: `requires-tag` naming `ui` at each of two owner statements; tagging the symbol `ui` removes it; the `browser` companion passes | pass |
| SC08 | A registry with `coupled` (required importer) and `portable` and `native` (required symbol) gives the same verdicts | pass |
| SC09 | A companion in `src/tests/` fails `requires-tag` naming `testing` for an untagged symbol and passes for one tagged `testing` | pass |
| SC10 | An ineffective re-exposure, a root to-parent exposure and an unexposed symbol yield none. `explainImport` results for every area, original and request form are equal with and without companions, excluding the `companions` field itself | pass |
| Agreement | `visibleIn` equals `explainVisibility` for every module and original of every model built through `modelOf` across the model's ten test files, and of the recorded model | pass |

### Checks run

- `npx vitest run subs/analysis/subs/model`: 10 files, 221 tests, all pass.
- `npx vitest run subs/analysis/subs/descriptions subs/presentation subs/analysis/src/tests/evaluate-accesses.test.ts
  subs/service-api/src/tests/project-view.test.ts`: before the fixture update, 2 failures, both in
  `descriptions.test.ts`'s reviewed-statement fixtures for the two edited descriptions; after it, the
  `descriptions` owner's 4 files and 193 tests pass. The other 21 files passed on the first run.
- `npm run type-check` (all four compiler scopes): passes.
- `npm run build`, then `npm run check:self` (resident) and `dist/src/ramify check --root . --batch`: both pass,
  15 owners, 427 source files, 6359 accesses, 0 errors, 0 analysis limits. The daemon this started was stopped.
- Not run: the full test suite and the reference harness gate. SC26 runs Plan 1's reference gate in iteration 5.

The expected intermediate state holds: no source fact populates `companions`, so no project reports the finding.

## Deviations and decisions within scope

- **Statement of a merged exposure.** `buildModel` merges repeated selections of one original in one module into
  one `Exposure`. It unions their destinations and evidence and does not retain which statement named which
  destination. A step `(M, c)` is therefore reported at the exposure's first evidence location in location
  order. When one statement exposes to parent and another to descendants and only one destination fails, the
  finding can name the other statement. Keeping per-statement destinations would change `Exposure` or the merge,
  and so visibility evidence and import outputs, which the plan puts out of scope. The main plan's reporting rule
  is unchanged.
- **Destination of `requires-tag`.** The tag condition does not depend on the step, but `CompanionViolation`
  requires a destination. It is `parent` when the owner's exposure has a to-parent step, otherwise `descendants`.
- **Companions absent from the model.** A named original need not be one of the model's originals, for example an
  owned type that is not exported. It must belong to a model module. It is visible only in its owner, since no
  exposure can select it. Its required-importer tags are those of its defining source area (`tests/` paths use the
  tests area), as for any new unexposed binding. Iteration 2 may record such a reference either in `named` or as
  `unresolved`; the model accepts both.
- **Exposure without evidence.** `buildModel` accepts an exposure with an empty evidence list. Such an exposure
  has no statement to report and is skipped. No linked description produces one.

## Handoff

### To iteration 2 (`typescript`)

- `SignatureCompanions` is in `subs/analysis/subs/model/src/interfaces/model.ts`:
  `{ named: readonly OriginalId[]; evidence: readonly SourceLocation[]; inferred: boolean; unresolved: number }`.
  `typescript` imports it from that file as it imports `OriginalId` and `SourceLocation`.
- `buildModel` enforces the following, so `CatalogOriginal.companions` must already conform:
  - `named` is strictly ascending in `originalKey` byte order (`JSON.stringify([kind, owner, file, binding])`),
    with no duplicates and not the original itself;
  - every owner is a model module;
  - `evidence` has the same length as `named`, holding valid project locations;
  - `inferred` is a boolean and `unresolved` a non-negative integer.
- The empty value is `{ named: [], evidence: [], inferred: false, unresolved: 0 }`.

### To iteration 3 (`descriptions`, `analysis`)

- `listCompanionViolations(model: Model): readonly CompanionViolation[]` is exported from
  `subs/analysis/subs/model/src/index.ts` (`companions.ts`) and received by `analysis` through its `model`
  wildcard. The result is deeply frozen and ordered by `statement` (file, start, end, line, column), then
  original key, companion key, destination and reason.
- `statement` is the exposure's first evidence location. `requires-tag` entries repeat per owner statement.
- `descriptions/src/link.ts` (about line 185, in the originals loop) sets an explicit empty `companions`. Replace it with the catalog
  original's field; a spread alone is overridden by the explicit value.
- `ExposureIndex`, `visibleIn` and `visibleInEveryProperDescendant` in `exposure-index.ts` are internal to
  `model`. They are the index to measure for the inspection successor and Plan 7.
