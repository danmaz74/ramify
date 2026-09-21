# Iteration 4: Layout, acquisition and the outside-source warning

**Plan:** [Plan 2E](../main-plan.md).
**Prerequisites:** iteration 1.
**Owners:** `analysis/project`.

## Goal

Each layout code has its own sentence, acquisition failures say which input and what happened, and the warning carries its own message.

## Read first

- Main plan: What exists (five layout codes, the warning).
- `subs/analysis/subs/project/src/inventory.ts:30-135`, `references.ts:30-45`, `selection.ts:15-50`, `resolve-root.ts:100-115`, `read-project.ts:60-80`, `capture.ts`, `configuration.ts`, `observer.ts:140-275`, `interfaces/project.ts:60-83`.
- `docs/architecture/cli-invocation.spec.md:97-115` on the warning, and the module-description principles on layout.

## Deliverables

1. Distinct messages for `stray-description`, `description-in-src`, `reserved-container`, `symlink-description` and `invalid-description`, each stating where a `module.ramify` may occur and why this one may not.
2. Source-reference messages name the statement, the decoded path and the status in words.
3. Acquisition messages name the input. `read-failure` and `internal-error` keep the provider's text and prefix it with what Ramify was doing.
4. `OutsideSourceWarning.message`: that the compiler selects files outside every module's `src/`, that they are not verified, and that an owned import targeting them is an analysis limit.
5. `invalid-layout` removed from the union and from both category tables.
6. Catalogue rows and the owner's catalogue test.

## Matrix rows executed here

- DM-02 (project)
- DM-03

## Verification

- One test per code with the full text; the project cases of the reference harness.

## Exit criteria

- No layout, acquisition or warning row is `TBD`; the renderer no longer invents the warning's sentence.

## Handoff

- The warning's field, for iteration 7's renderers.
